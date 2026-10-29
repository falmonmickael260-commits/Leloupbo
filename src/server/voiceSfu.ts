/**
 * Voix via serveur audio LiveKit (SFU) — recommandé au-delà d'environ 8 joueurs.
 *
 * Chaque joueur n'a qu'UNE connexion audio (vers LiveKit) au lieu d'une par
 * joueur. Stabilité avant tout : la connexion audio n'est PAS refaite à chaque phase.
 * Les droits de publication suivent le moteur : hors tour ou mort, aucune piste
 * ne peut être publiée. Le client conserve sa capture locale et la republie
 * lorsque LiveKit lui rend la parole. Les non-loups ne peuvent pas écouter la nuit.
 *
 * Configuration (variables d'environnement, jamais dans le code) :
 *   LIVEKIT_URL         wss://mon-projet.livekit.cloud   (ou ws://localhost:7880 en dev)
 *   LIVEKIT_API_KEY     …
 *   LIVEKIT_API_SECRET  …
 * Sans ces variables, le jeu utilise la voix pair-à-pair (voice.js).
 */
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { GameEngine } from '../engine/engine.ts';
import { voiceChannel } from '../engine/voice.ts';

export interface SfuConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/** Première variable non vide parmi plusieurs noms acceptés (espaces et guillemets retirés). */
function pick(env: NodeJS.ProcessEnv, names: string[]): string {
  for (const n of names) {
    const v = env[n]?.trim().replace(/^["']|["']$/g, '').trim();
    if (v) return v;
  }
  return '';
}

const URL_NAMES = ['LIVEKIT_URL', 'LIVEKIT_WS_URL', 'LIVEKIT_SERVER_URL', 'LIVEKIT_HOST', 'LIVEKIT_API_URL'];
const KEY_NAMES = ['LIVEKIT_API_KEY', 'LIVEKIT_KEY', 'LIVEKIT_APIKEY'];
const SECRET_NAMES = ['LIVEKIT_API_SECRET', 'LIVEKIT_SECRET', 'LIVEKIT_API_SECRET_KEY', 'LIVEKIT_SECRET_KEY'];

export function sfuConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SfuConfig | null {
  let url = pick(env, URL_NAMES);
  const apiKey = pick(env, KEY_NAMES);
  const apiSecret = pick(env, SECRET_NAMES);
  if (!url || !apiKey || !apiSecret) return null;
  // Adresse copiée en https:// ou sans protocole : le client a besoin de wss://.
  if (/^https?:\/\//i.test(url)) url = url.replace(/^http/i, 'ws');
  else if (!/^wss?:\/\//i.test(url)) url = `wss://${url}`;
  return { url: url.replace(/\/+$/, ''), apiKey, apiSecret };
}

/** Variables LiveKit manquantes (noms seulement, jamais les valeurs) — pour le journal du serveur. */
export function missingSfuVars(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];
  if (!pick(env, URL_NAMES)) missing.push('LIVEKIT_URL');
  if (!pick(env, KEY_NAMES)) missing.push('LIVEKIT_API_KEY');
  if (!pick(env, SECRET_NAMES)) missing.push('LIVEKIT_API_SECRET');
  return missing;
}

interface Perm {
  canPublish: boolean;
  canSubscribe: boolean;
}

/** Sous-ensemble de l'API serveur LiveKit utilisé ici (remplaçable dans les tests). */
export interface RoomApi {
  listRooms(): Promise<unknown>;
  listParticipants(room: string): Promise<{ identity: string; permission?: { canPublish?: boolean; canSubscribe?: boolean } }[]>;
  updateParticipant(room: string, identity: string, opts: { permission: { canPublish: boolean; canSubscribe: boolean; canPublishData: boolean } }): Promise<unknown>;
  removeParticipant(room: string, identity: string): Promise<unknown>;
  deleteRoom(room: string): Promise<unknown>;
}

/** Durée de validité d'un accès audio : courte, un vieux jeton ne doit jamais rouvrir l'écoute. */
export const VOICE_TOKEN_TTL_S = 10 * 60;

/**
 * Sécurité du canal des Loups : le serveur ne se fie à AUCUNE mémoire de ce qu'il a accordé.
 * Il relit la liste RÉELLE des participants LiveKit (et leurs droits effectifs) et corrige tout
 * écart : à chaque changement d'état, puis chaque seconde pendant la phase des Loups.
 * Couvre les reconnexions, les vieux jetons, plusieurs onglets, un client modifié…
 */
export class LiveKitBridge {
  private readonly rooms: RoomApi;
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly retries = new Map<string, number>();
  private readonly running = new Set<string>();
  /** Un contrôle demandé pendant qu'un autre tournait : refait juste après (jamais perdu). */
  private readonly rerun = new Set<string>();
  private readonly lastEnforced = new Map<string, number>();
  /** Dernier contrôle du serveur audio : null = pas encore vérifié. */
  health: { ok: boolean | null; error?: string; checkedAt?: string } = { ok: null };

  constructor(
    private readonly cfg: SfuConfig,
    rooms?: RoomApi,
  ) {
    const host = cfg.url.replace(/^ws(s?):\/\//, 'http$1://');
    this.rooms = rooms ?? (new RoomServiceClient(host, cfg.apiKey, cfg.apiSecret) as unknown as RoomApi);
  }

  /**
   * Vérifie que LiveKit répond avec ces clés (adresse, clé et secret corrects).
   * Résultat visible sur /health et dans les journaux du serveur (aide au dépannage).
   */
  async check(timeoutMs = 6000): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.rooms.listRooms(),
        new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('pas de réponse')), timeoutMs))),
      ]);
      if (this.health.ok !== true) console.log('🎙️ Serveur audio LiveKit joignable.');
      this.health = { ok: true, checkedAt: new Date().toISOString() };
    } catch (e) {
      const error = String((e as Error)?.message ?? e).slice(0, 160);
      if (this.health.ok !== false) console.error(`⚠️ Serveur audio LiveKit injoignable (${error}) : vérifiez LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.`);
      this.health = { ok: false, error, checkedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
    return this.health.ok === true;
  }

  private roomName(code: string): string {
    return `blackops-${code}`;
  }

  /**
   * Droits LiveKit d'un joueur, calculés UNIQUEMENT à partir de l'état du serveur (rôle, camp,
   * infection, vivant/mort, phase). canSubscribe = false pendant la phase des Loups pour tout
   * joueur qui n'est pas dans la meute vivante : il ne reçoit alors AUCUN flux audio.
   */
  permissionsFor(engine: GameEngine, playerId: string): Perm {
    const player = engine.state.players.find((p) => p.id === playerId);
    if (!player || !player.connected || player.abandoned || player.isBot) return { canPublish: false, canSubscribe: false };
    const ch = voiceChannel(engine.state);
    const privateChannel = ch.mode === 'wolves';
    return { canPublish: ch.speakers.includes(playerId), canSubscribe: !privateChannel || ch.listeners.includes(playerId) };
  }

  /** Jeton d'accès LiveKit (10 min) : identité = joueur authentifié par sa session, droits actuels. */
  async token(engine: GameEngine, playerId: string, name: string): Promise<{ url: string; token: string }> {
    // Un jeton rejoué ne peut jamais restaurer des droits d'une ancienne phase.
    // Les droits actuels sont accordés après admission par reconcile().
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, { identity: playerId, name, ttl: VOICE_TOKEN_TTL_S });
    at.addGrant({
      roomJoin: true,
      room: this.roomName(engine.state.code),
      canPublish: false,
      canSubscribe: false,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    // Contrôle rapproché : le joueur va arriver dans la salle audio d'un instant à l'autre.
    this.lastEnforced.delete(engine.state.code);
    return { url: this.cfg.url, token: await at.toJwt() };
  }

  /** Après chaque changement d'état : contrôle complet (regroupé si plusieurs transitions d'affilée). */
  sync(engine: GameEngine): void {
    const code = engine.state.code;
    clearTimeout(this.pending.get(code));
    this.pending.set(
      code,
      setTimeout(() => {
        this.pending.delete(code);
        void this.enforceNow(engine);
      }, 40),
    );
  }

  /**
   * Appelé chaque seconde, dans le lobby comme en partie : couvre aussi les connexions
   * audio arrivées après l'émission du jeton et les reprises de session.
   */
  enforce(engine: GameEngine, now = Date.now()): void {
    const code = engine.state.code;
    const every = 1000;
    if (now - (this.lastEnforced.get(code) ?? 0) < every) return;
    void this.enforceNow(engine, now);
  }

  /** Compare les droits RÉELS de chaque participant LiveKit aux droits dus, et corrige. */
  async enforceNow(engine: GameEngine, now = Date.now()): Promise<void> {
    const code = engine.state.code;
    if (this.running.has(code)) {
      this.rerun.add(code);
      return;
    }
    this.running.add(code);
    this.lastEnforced.set(code, now);
    try {
      await this.reconcile(engine);
      this.retries.delete(code);
    } catch (e) {
      const n = (this.retries.get(code) ?? 0) + 1;
      this.retries.set(code, n);
      console.warn(`[livekit] contrôle des droits audio (essai ${n}) :`, (e as Error)?.message ?? e);
      this.lastEnforced.delete(code); // nouvel essai à la prochaine seconde
    } finally {
      this.running.delete(code);
      if (this.rerun.delete(code)) void this.enforceNow(engine);
    }
  }

  private async reconcile(engine: GameEngine): Promise<void> {
    const room = this.roomName(engine.state.code);
    let participants: Awaited<ReturnType<RoomApi['listParticipants']>>;
    try {
      participants = await this.rooms.listParticipants(room);
    } catch (e) {
      if (/not found|does not exist|404/i.test(String((e as Error)?.message ?? e))) return; // personne en audio
      throw e;
    }
    const seq = engine.state.phase.seq;
    // Retirer tous les anciens droits AVANT d'ouvrir les micros du nouveau canal.
    // Si une révocation échoue, aucune nouvelle publication n'est autorisée.
    for (const part of participants) {
      const player = engine.state.players.find((p) => p.id === part.identity);
      try {
        if (!player || player.abandoned || player.isBot) {
          await this.rooms.removeParticipant(room, part.identity);
          continue;
        }
        const desired = this.permissionsFor(engine, player.id);
        const actual = part.permission ?? {};
        const reduced = {
          canPublish: actual.canPublish === true && desired.canPublish,
          canSubscribe: actual.canSubscribe === true && desired.canSubscribe,
        };
        if (actual.canPublish !== reduced.canPublish || actual.canSubscribe !== reduced.canSubscribe) {
          await this.rooms.updateParticipant(room, part.identity, { permission: { ...reduced, canPublishData: false } });
          part.permission = reduced;
        }
      } catch (e) {
        if (!/not found|does not exist|404/i.test(String((e as Error)?.message ?? e))) throw e;
      }
    }
    if (engine.state.phase.seq !== seq) { this.rerun.add(engine.state.code); return; }
    for (const part of participants) {
      const player = engine.state.players.find((p) => p.id === part.identity);
      if (!player || player.abandoned || player.isBot) continue;
      if (engine.state.phase.seq !== seq) { this.rerun.add(engine.state.code); return; }
      const desired = this.permissionsFor(engine, player.id);
      if (part.permission?.canPublish === desired.canPublish && part.permission?.canSubscribe === desired.canSubscribe) continue;
      try {
        await this.rooms.updateParticipant(room, part.identity, { permission: { ...desired, canPublishData: false } });
      } catch (e) {
        if (!/not found|does not exist|404/i.test(String((e as Error)?.message ?? e))) throw e;
      }
    }
  }

  forget(code: string): void {
    clearTimeout(this.pending.get(code));
    this.pending.delete(code);
    this.retries.delete(code);
    this.lastEnforced.delete(code);
    this.rerun.delete(code);
    this.rooms.deleteRoom(this.roomName(code)).catch(() => {});
  }
}
