/**
 * GameManager : fait vivre les parties dans un processus Node persistant.
 *
 * - une `GameRoom` par partie, en mémoire, pendant toute sa durée ;
 * - timers de phase pilotés par le serveur (setTimeout sur `phase.endsAt`)
 *   + une horloge de maintenance (1 s) pour les abandons / l'Hôte / le ménage ;
 * - persistance après chaque changement et restauration au démarrage ;
 * - diffusion à chaque joueur de SA vue uniquement ;
 * - relais de signalisation WebRTC pour la voix.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { decideBotCommand } from '../engine/bots.ts';
import { GameEngine } from '../engine/engine.ts';
import { GameError } from '../engine/errors.ts';
import { cryptoRng, type Rng } from '../engine/rng.ts';
import type { GameState } from '../engine/state.ts';
import type { Ack, ClientToServerEvents, ServerToClientEvents, SessionInfo } from '../shared/protocol.ts';
import { iceServersFromEnv, type IceServer } from './ice.ts';
import { RateLimiter } from './rateLimit.ts';
import { LiveKitBridge, missingSfuVars, sfuConfigFromEnv, type SfuConfig } from './voiceSfu.ts';
import type { GameStore } from './store.ts';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

interface SocketData {
  code?: string;
  playerId?: string;
  voice?: boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const FINISHED_TTL_MS = 30 * 60_000;
const EMPTY_LOBBY_TTL_MS = 10 * 60_000;
const EMPTY_GAME_TTL_MS = 15 * 60_000;
const MAX_SIGNAL_BYTES = 32_000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

class GameRoom {
  readonly sockets = new Map<string, Set<Sock>>();
  timer: NodeJS.Timeout | null = null;
  readonly botTimers = new Map<string, NodeJS.Timeout>();
  lastHumanSeenAt: number;

  constructor(
    public readonly engine: GameEngine,
    now: number,
  ) {
    this.lastHumanSeenAt = now;
  }

  get code() {
    return this.engine.state.code;
  }
}

export interface ManagerOptions {
  now?: () => number;
  rng?: Rng;
  /** Délai de réaction des bots (ms). */
  botDelay?: [number, number];
  housekeepingMs?: number;
  /** Serveur audio LiveKit (par défaut : variables d'environnement LIVEKIT_*). */
  sfu?: SfuConfig | null;
  /** Contrôle périodique de LiveKit (désactivable dans les tests). */
  sfuHealthCheck?: boolean;
}

export class GameManager {
  readonly rooms = new Map<string, GameRoom>();
  private readonly now: () => number;
  private readonly rng: Rng;
  private readonly botDelay: [number, number];
  private housekeeping: NodeJS.Timeout | null = null;
  private stopped = false;
  droppedSignals = 0;
  private readonly limiter = new RateLimiter();
  private readonly iceServers: IceServer[] = iceServersFromEnv();
  readonly sfu: LiveKitBridge | null;
  private sfuTimer?: NodeJS.Timeout;

  constructor(
    private readonly io: IO,
    private readonly store: GameStore,
    opts: ManagerOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? cryptoRng;
    this.botDelay = opts.botDelay ?? [900, 2500];
    const sfuCfg = opts.sfu === undefined ? sfuConfigFromEnv() : opts.sfu;
    this.sfu = sfuCfg ? new LiveKitBridge(sfuCfg) : null;
    if (this.sfu) console.log(`🎙️ Voix : serveur audio LiveKit (${sfuCfg!.url})`);
    else {
      const missing = opts.sfu === undefined ? missingSfuVars() : [];
      const seen = Object.keys(process.env).filter((k) => /livekit/i.test(k));
      console.log(`🎙️ Voix : pair-à-pair — LiveKit NON configuré.${missing.length ? ` Variables manquantes : ${missing.join(', ')}.` : ''}${seen.length ? ` Variables LiveKit trouvées : ${seen.join(', ')}.` : ' Aucune variable LiveKit trouvée.'}`);
    }
    if (this.sfu && opts.sfuHealthCheck !== false) {
      const sfu = this.sfu;
      void sfu.check();
      this.sfuTimer = setInterval(() => void sfu.check(), 60_000);
      this.sfuTimer.unref?.();
    }
    this.housekeeping = setInterval(() => this.tickAll(), opts.housekeepingMs ?? 1000);
    io.on('connection', (socket) => this.bind(socket));
  }

  /** Recharge les parties persistées (redémarrage serveur) et relance leurs timers. */
  async restore(): Promise<number> {
    const states = await this.store.loadAll();
    const now = this.now();
    for (const state of states) {
      if (this.rooms.has(state.code)) continue;
      // Tous les humains sont considérés déconnectés jusqu'à leur reconnexion.
      for (const p of state.players) {
        if (!p.isBot && p.connected) {
          p.connected = false;
          p.disconnectedAt = now;
        }
      }
      const room = new GameRoom(new GameEngine(state, this.rng), now);
      this.rooms.set(state.code, room);
      room.engine.tick(now);
      this.afterChange(room);
    }
    return states.length;
  }

  stop(): void {
    this.stopped = true;
    if (this.housekeeping) clearInterval(this.housekeeping);
    if (this.sfuTimer) clearInterval(this.sfuTimer);
    for (const room of this.rooms.values()) this.clearTimers(room);
  }

  // ------------------------------------------------------------------ sessions

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  createGame(name: unknown): { room: GameRoom; session: SessionInfo } {
    const now = this.now();
    const code = this.newCode();
    const room = new GameRoom(GameEngine.create(code, now, this.rng), now);
    const token = randomBytes(24).toString('base64url');
    const p = room.engine.join(name, hashToken(token), now);
    this.rooms.set(code, room);
    return { room, session: { code, playerId: p.id, token } };
  }

  joinGame(rawCode: unknown, name: unknown): { room: GameRoom; session: SessionInfo } {
    const room = this.findRoom(rawCode);
    const token = randomBytes(24).toString('base64url');
    const p = room.engine.join(name, hashToken(token), this.now());
    return { room, session: { code: room.code, playerId: p.id, token } };
  }

  private findRoom(rawCode: unknown): GameRoom {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const room = this.rooms.get(code);
    if (!room) throw new GameError('NO_GAME', 'Partie introuvable.');
    return room;
  }

  // ------------------------------------------------------------------ cycle de vie

  private afterChange(room: GameRoom): void {
    if (this.stopped) return;
    const now = this.now();
    this.broadcast(room, now);
    this.schedule(room, now);
    this.scheduleBots(room);
    this.sfu?.sync(room.engine);
    this.store.save(room.engine.state).catch((e) => console.error('[store] échec sauvegarde', room.code, e));
  }

  private broadcast(room: GameRoom, now: number): void {
    for (const [playerId, sockets] of room.sockets) {
      if (!room.engine.hasPlayer(playerId)) continue;
      const view = room.engine.view(playerId, now);
      for (const s of sockets) s.emit('view', view);
    }
  }

  private schedule(room: GameRoom, now: number): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const deadline = room.engine.nextDeadline();
    if (deadline === null) return;
    room.timer = setTimeout(
      () => {
        room.timer = null;
        if (room.engine.tick(this.now())) this.afterChange(room);
        else this.schedule(room, this.now());
      },
      Math.max(0, deadline - now) + 5,
    );
  }

  /** Les bots agissent via la même API que les humains, à partir de leur seule vue. */
  private scheduleBots(room: GameRoom): void {
    const now = this.now();
    for (const p of room.engine.state.players) {
      if (!p.isBot || room.botTimers.has(p.id)) continue;
      if (!decideBotCommand(room.engine.view(p.id, now), this.rng)) continue;
      const [min, max] = this.botDelay;
      const t = setTimeout(() => {
        room.botTimers.delete(p.id);
        if (!this.rooms.has(room.code) || !room.engine.hasPlayer(p.id)) return;
        const cmd = decideBotCommand(room.engine.view(p.id, this.now()), this.rng);
        if (cmd) {
          try {
            room.engine.command(p.id, cmd, this.now());
          } catch (e) {
            if (!(e instanceof GameError)) console.error(e);
          }
        }
        this.afterChange(room);
      }, min + this.rng.int(Math.max(1, max - min)));
      room.botTimers.set(p.id, t);
    }
  }

  private clearTimers(room: GameRoom): void {
    if (room.timer) clearTimeout(room.timer);
    for (const t of room.botTimers.values()) clearTimeout(t);
    room.botTimers.clear();
  }

  private tickAll(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const s = room.engine.state;
      if (s.players.some((p) => !p.isBot && p.connected)) room.lastHumanSeenAt = now;
      if (room.engine.tick(now)) this.afterChange(room);
      const idle = now - room.lastHumanSeenAt;
      const expired =
        (s.status === 'finished' && now - s.updatedAt > FINISHED_TTL_MS) ||
        (s.status === 'lobby' && idle > EMPTY_LOBBY_TTL_MS) ||
        (s.status === 'running' && idle > EMPTY_GAME_TTL_MS) ||
        (s.status === 'lobby' && s.players.filter((p) => !p.isBot).length === 0);
      if (expired) this.destroy(room);
    }
  }

  private destroy(room: GameRoom): void {
    this.clearTimers(room);
    this.sfu?.forget(room.code);
    this.rooms.delete(room.code);
    for (const sockets of room.sockets.values()) for (const s of sockets) this.detachSocket(s, false);
    this.store.delete(room.code).catch(() => undefined);
  }

  // ------------------------------------------------------------------ sockets

  private attach(socket: Sock, room: GameRoom, playerId: string): void {
    this.detachSocket(socket, true);
    const data = socket.data as SocketData;
    data.code = room.code;
    data.playerId = playerId;
    let set = room.sockets.get(playerId);
    if (!set) room.sockets.set(playerId, (set = new Set()));
    set.add(socket);
    room.engine.setConnected(playerId, true, this.now());
    this.afterChange(room);
  }

  private detachSocket(socket: Sock, notify: boolean): void {
    const data = socket.data as SocketData;
    if (!data.code || !data.playerId) return;
    const room = this.rooms.get(data.code);
    const playerId = data.playerId;
    if (data.voice && room) this.voiceLeave(room, socket);
    data.code = undefined;
    data.playerId = undefined;
    if (!room) return;
    const set = room.sockets.get(playerId);
    set?.delete(socket);
    if (set && set.size === 0) {
      room.sockets.delete(playerId);
      room.engine.setConnected(playerId, false, this.now());
      if (notify) this.afterChange(room);
    }
  }

  private context(socket: Sock): { room: GameRoom; playerId: string } {
    const data = socket.data as SocketData;
    const room = data.code ? this.rooms.get(data.code) : undefined;
    if (!room || !data.playerId || !room.engine.hasPlayer(data.playerId)) throw new GameError('NO_SESSION', 'Session introuvable.');
    return { room, playerId: data.playerId };
  }

  /** Exécute une opération en traduisant les erreurs métier en accusé de réception. */
  private run<T extends object>(socket: Sock, ack: unknown, op: () => T, limit = 'action'): void {
    const reply = typeof ack === 'function' ? (ack as (r: Ack<T>) => void) : () => undefined;
    if (!this.limiter.allow(`${socket.id}:${limit}`, limit)) {
      reply({ ok: false, error: 'RATE_LIMIT', message: 'Trop de requêtes, ralentissez.' });
      return;
    }
    try {
      reply({ ok: true, ...op() } as Ack<T>);
    } catch (e) {
      if (e instanceof GameError) reply({ ok: false, error: e.code, message: e.message });
      else {
        console.error(e);
        reply({ ok: false, error: 'INTERNAL', message: 'Erreur interne.' });
      }
    }
  }

  private mutate(socket: Sock, ack: unknown, fn: (room: GameRoom, playerId: string, now: number) => void, limit = 'action') {
    this.run(
      socket,
      ack,
      () => {
        const { room, playerId } = this.context(socket);
        try {
          fn(room, playerId, this.now());
        } finally {
          // Même en cas de refus, un timer a pu être rattrapé : on resynchronise.
          this.afterChange(room);
        }
        return {};
      },
      limit,
    );
  }

  private bind(socket: Sock): void {
    socket.on('game:create', (p, ack) =>
      this.run(socket, ack, () => {
        const { room, session } = this.createGame(p?.name);
        this.attach(socket, room, session.playerId);
        return session;
      }, 'session'),
    );

    socket.on('game:join', (p, ack) =>
      this.run(socket, ack, () => {
        const { room, session } = this.joinGame(p?.code, p?.name);
        this.attach(socket, room, session.playerId);
        return session;
      }, 'session'),
    );

    // Reconnexion : le jeton (secret) identifie le joueur, l'état complet est renvoyé.
    socket.on('session:resume', (p, ack) =>
      this.run(socket, ack, () => {
        const room = this.findRoom(p?.code);
        const token = typeof p?.token === 'string' ? p.token : '';
        const player = room.engine.findByTokenHash(hashToken(token));
        if (!player) throw new GameError('NO_SESSION', 'Session expirée.');
        if (player.abandoned) throw new GameError('ABANDONED', 'Vous avez quitté cette partie.');
        this.attach(socket, room, player.id);
        return { playerId: player.id };
      }, 'session'),
    );

    socket.on('lobby:settings', (p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.updateSettings(id, p, now)));
    socket.on('lobby:addBot', (_p, ack) => this.mutate(socket, ack, (room, id, now) => void room.engine.addBot(id, now)));
    socket.on('player:audio', (p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.setAudioStatus(id, p, now)));
    socket.on('player:tag', (p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.setTag(id, p?.playerId, p?.text, now)));
    socket.on('lobby:avatar', (p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.setAvatar(id, p?.avatar, now)));
    socket.on('lobby:kick', (p, ack) =>
      this.mutate(socket, ack, (room, id, now) => {
        const target = typeof p?.playerId === 'string' ? p.playerId : '';
        room.engine.kick(id, target, now);
        for (const s of room.sockets.get(target) ?? []) {
          s.emit('kicked', { reason: 'Vous avez été exclu par l’Hôte.' });
          this.detachSocket(s, false);
        }
      }),
    );
    socket.on('game:start', (_p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.start(id, now)));
    socket.on('game:reset', (_p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.reset(id, now)));
    socket.on('game:command', (p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.command(id, p, now)));
    socket.on('chat:send', (p, ack) => this.mutate(socket, ack, (room, id, now) => room.engine.chat(id, p?.channel, p?.text, now), 'chat'));
    socket.on('game:leave', (_p, ack) =>
      this.run(socket, ack, () => {
        const { room, playerId } = this.context(socket);
        room.engine.leave(playerId, this.now());
        for (const s of [...(room.sockets.get(playerId) ?? [])]) this.detachSocket(s, false);
        this.afterChange(room);
        return {};
      }),
    );

    // ---- Voix : le serveur relaie la signalisation WebRTC entre membres d'une même partie.
    socket.on('voice:join', (_p, ack) => {
      // Serveur audio LiveKit configuré : jeton d'accès avec les droits de la phase en cours.
      if (this.sfu) {
        const reply = typeof ack === 'function' ? ack : () => undefined;
        if (!this.limiter.allow(`${socket.id}:voice`, 'voice')) return reply({ ok: false, error: 'RATE_LIMIT', message: 'Trop de requêtes, ralentissez.' });
        let ctx: { room: GameRoom; playerId: string };
        try {
          ctx = this.context(socket);
        } catch (e) {
          return reply({ ok: false, error: (e as GameError).code ?? 'NO_SESSION', message: (e as Error).message });
        }
        const name = ctx.room.engine.state.players.find((x) => x.id === ctx.playerId)?.name ?? ctx.playerId;
        this.sfu
          .token(ctx.room.engine, ctx.playerId, name)
          .then(({ url, token }) => reply({ ok: true, mode: 'sfu', url, token, peers: [], iceServers: [] }))
          .catch((e) => {
            console.error('[livekit] jeton', e);
            reply({ ok: false, error: 'VOICE_UNAVAILABLE', message: 'Serveur audio indisponible.' });
          });
        return;
      }
      this.run(socket, ack, () => {
        const { room, playerId } = this.context(socket);
        (socket.data as SocketData).voice = true;
        const peers: string[] = [];
        for (const [pid, sockets] of room.sockets) {
          if (pid === playerId) continue;
          for (const s of sockets) {
            if ((s.data as SocketData).voice) {
              peers.push(pid);
              s.emit('voice:peer-joined', { id: playerId });
              break;
            }
          }
        }
        return { mode: 'mesh' as const, peers, iceServers: this.iceServers };
      }, 'voice');
    });
    socket.on('voice:leave', () => {
      const data = socket.data as SocketData;
      const room = data.code ? this.rooms.get(data.code) : undefined;
      if (room && data.voice) this.voiceLeave(room, socket);
    });
    socket.on('voice:signal', (p) => {
      if (!this.limiter.allow(`${socket.id}:signal`, 'signal')) {
        this.droppedSignals = (this.droppedSignals ?? 0) + 1;
        return;
      }
      try {
        const { room, playerId } = this.context(socket);
        if (!(socket.data as SocketData).voice || typeof p?.to !== 'string') return;
        if (JSON.stringify(p.data ?? null).length > MAX_SIGNAL_BYTES) return;
        for (const s of room.sockets.get(p.to) ?? []) {
          if ((s.data as SocketData).voice) s.emit('voice:signal', { from: playerId, data: p.data });
        }
      } catch {
        /* session absente : ignoré */
      }
    });

    socket.on('disconnect', () => {
      this.detachSocket(socket, true);
      this.limiter.forget(socket.id);
    });
  }

  private voiceLeave(room: GameRoom, socket: Sock): void {
    const data = socket.data as SocketData;
    data.voice = false;
    if (!data.playerId) return;
    for (const [pid, sockets] of room.sockets) {
      if (pid === data.playerId) continue;
      for (const s of sockets) if ((s.data as SocketData).voice) s.emit('voice:peer-left', { id: data.playerId });
    }
  }

  // Accès pour les tests.
  getState(code: string): GameState | undefined {
    return this.rooms.get(code)?.engine.state;
  }
}
