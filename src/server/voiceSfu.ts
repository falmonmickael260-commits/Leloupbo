/**
 * Voix via serveur audio LiveKit (SFU) — recommandé au-delà d'environ 8 joueurs.
 *
 * Chaque joueur n'a qu'UNE connexion audio (vers LiveKit) au lieu d'une par
 * joueur. Surtout, les permissions calculées par le moteur (voiceChannel) sont
 * imposées CÔTÉ SERVEUR par LiveKit à chaque phase :
 *   - canPublish   : seuls ceux qui ont la parole peuvent émettre ;
 *   - canSubscribe : seuls les auditeurs autorisés reçoivent l'audio
 *                    (canal privé des Loups inviolable, morts muets…).
 * Un client modifié ne peut donc ni parler hors de son tour, ni espionner.
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

export function sfuConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SfuConfig | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = env;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

interface Perm {
  canPublish: boolean;
  canSubscribe: boolean;
}

export class LiveKitBridge {
  private readonly rooms: RoomServiceClient;
  /** Dernières permissions appliquées, par partie puis par joueur. */
  private readonly applied = new Map<string, Map<string, string>>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  /** Dernier contrôle du serveur audio : null = pas encore vérifié. */
  health: { ok: boolean | null; error?: string; checkedAt?: string } = { ok: null };

  constructor(private readonly cfg: SfuConfig) {
    const host = cfg.url.replace(/^ws(s?):\/\//, 'http$1://');
    this.rooms = new RoomServiceClient(host, cfg.apiKey, cfg.apiSecret);
  }

  /**
   * Vérifie que LiveKit répond avec ces clés (adresse, clé et secret corrects).
   * En cas d'échec, le jeu passe en voix pair-à-pair au lieu de rester muet.
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
      if (this.health.ok !== false) console.error(`⚠️ Serveur audio LiveKit injoignable (${error}) : voix pair-à-pair utilisée.`);
      this.health = { ok: false, error, checkedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
    return this.health.ok === true;
  }

  private roomName(code: string): string {
    return `blackops-${code}`;
  }

  /** Permissions d'un joueur pour la phase en cours (miroir exact du moteur). */
  permissionsFor(engine: GameEngine, playerId: string): Perm {
    const ch = voiceChannel(engine.state);
    return { canPublish: ch.speakers.includes(playerId), canSubscribe: ch.listeners.includes(playerId) };
  }

  /** Jeton d'accès LiveKit (valable 4 h) avec les permissions actuelles du joueur. */
  async token(engine: GameEngine, playerId: string, name: string): Promise<{ url: string; token: string }> {
    const perm = this.permissionsFor(engine, playerId);
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, { identity: playerId, name, ttl: 4 * 3600 });
    at.addGrant({
      roomJoin: true,
      room: this.roomName(engine.state.code),
      canPublish: perm.canPublish,
      canSubscribe: perm.canSubscribe,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    // L'état « appliqué » d'un nouvel arrivant est celui de son jeton.
    this.remember(engine.state.code, playerId, perm);
    return { url: this.cfg.url, token: await at.toJwt() };
  }

  private remember(code: string, playerId: string, perm: Perm): void {
    let m = this.applied.get(code);
    if (!m) this.applied.set(code, (m = new Map()));
    m.set(playerId, `${perm.canPublish}|${perm.canSubscribe}`);
  }

  /**
   * Applique les permissions de la phase en cours à tous les participants
   * connectés à LiveKit. Appelé après chaque changement d'état ; n'appelle
   * l'API que pour les joueurs dont les droits ont réellement changé.
   */
  sync(engine: GameEngine): void {
    const code = engine.state.code;
    clearTimeout(this.pending.get(code));
    // Regroupe les changements très rapprochés (plusieurs transitions d'affilée).
    this.pending.set(
      code,
      setTimeout(() => {
        this.pending.delete(code);
        this.flush(engine).catch((e) => console.warn('[livekit] synchronisation des permissions :', e?.message ?? e));
      }, 40),
    );
  }

  private async flush(engine: GameEngine): Promise<void> {
    const code = engine.state.code;
    const known = this.applied.get(code);
    if (!known || known.size === 0) return;
    const room = this.roomName(code);
    await Promise.all(
      [...known.keys()].map(async (playerId) => {
        const perm = this.permissionsFor(engine, playerId);
        const key = `${perm.canPublish}|${perm.canSubscribe}`;
        if (known.get(playerId) === key) return;
        try {
          await this.rooms.updateParticipant(room, playerId, {
            permission: { canPublish: perm.canPublish, canSubscribe: perm.canSubscribe, canPublishData: false },
          });
          known.set(playerId, key);
        } catch (e) {
          // Joueur pas (encore / plus) dans la salle audio : son prochain jeton portera les bons droits.
          const msg = String((e as Error)?.message ?? e);
          if (/not found|does not exist|404/i.test(msg)) known.delete(playerId);
          else throw e;
        }
      }),
    );
  }

  forget(code: string): void {
    clearTimeout(this.pending.get(code));
    this.pending.delete(code);
    this.applied.delete(code);
    this.rooms.deleteRoom(this.roomName(code)).catch(() => {});
  }
}
