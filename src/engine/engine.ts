/**
 * GameEngine : façade unique du moteur. Le serveur (ou un simulateur) ne
 * manipule la partie qu'au travers de cette classe.
 *
 * - Le moteur est synchrone et déterministe pour une horloge et un RNG donnés.
 * - Il ne connaît ni Socket.IO ni le réseau : il peut tourner dans un test,
 *   un simulateur ou un futur worker dédié.
 */
import type { ClientCommand, PlayerView } from '../shared/types.ts';
import { sendChat } from './chat.ts';
import { handleCommand } from './commands.ts';
import { abandonPlayer, advanceTime } from './flow.ts';
import { setAvatar, addPlayer, createGameState, removePlayer, resetToLobby, startGame, transferHost, updateSettings, requireHost } from './lobby.ts';
import { cryptoRng, type Rng } from './rng.ts';
import './roles/index.ts';
import { getPlayer, type Ctx, type GameState, type PlayerState } from './state.ts';
import { buildView } from './view.ts';
import { fail } from './errors.ts';

/** Un Hôte déconnecté depuis ce délai perd son rôle d'Hôte au profit d'un joueur connecté. */
export const HOST_TRANSFER_DELAY_MS = 30_000;
/** Un joueur déconnecté dans le lobby depuis ce délai est retiré. */
export const LOBBY_DISCONNECT_REMOVE_MS = 120_000;

export class GameEngine {
  constructor(
    public state: GameState,
    private readonly rng: Rng = cryptoRng,
  ) {}

  static create(code: string, now: number, rng: Rng = cryptoRng): GameEngine {
    return new GameEngine(createGameState(code, now), rng);
  }

  private ctx(now: number): Ctx {
    return { state: this.state, now, rng: this.rng };
  }

  private mutate<T>(now: number, fn: (ctx: Ctx) => T): T {
    const ctx = this.ctx(now);
    // Rattrape d'abord les timers expirés : une action arrivée trop tard est refusée.
    advanceTime(ctx);
    const r = fn(ctx);
    advanceTime(ctx);
    this.state.updatedAt = now;
    return r;
  }

  // ---------- Lobby
  join(name: unknown, tokenHash: string, now: number, isBot = false): PlayerState {
    return this.mutate(now, (ctx) => addPlayer(ctx, name, tokenHash, isBot));
  }
  addBot(hostId: string, now: number): PlayerState {
    return this.mutate(now, (ctx) => {
      requireHost(this.state, hostId);
      const n = this.state.players.filter((p) => p.isBot).length + 1;
      return addPlayer(ctx, `Bot ${n}`, '', true);
    });
  }
  /** Test du son déclaré par le joueur (cosmétique, sans effet sur la partie). */
  setAudioStatus(playerId: string, status: unknown, now: number): void {
    const p = getPlayer(this.state, playerId);
    if (!p) fail('NOT_IN_GAME', 'Joueur inconnu.');
    const st = (status && typeof status === 'object' ? status : {}) as Record<string, unknown>;
    const diag = typeof st.diag === 'string' ? st.diag.replace(/[^\p{L}\p{N} .,:/·()%+\-]/gu, '').slice(0, 200) : '';
    p.audio = { mic: st.mic === true, speaker: st.speaker === true, connected: st.connected === true, ...(diag ? { diag } : {}) };
    this.state.updatedAt = now;
  }
  setAvatar(playerId: string, avatar: unknown, now: number): void {
    this.mutate(now, (ctx) => setAvatar(ctx, playerId, avatar));
  }
  kick(hostId: string, playerId: string, now: number): void {
    this.mutate(now, (ctx) => {
      requireHost(this.state, hostId);
      if (hostId === playerId) fail('BAD_TARGET', 'Vous ne pouvez pas vous exclure.');
      removePlayer(ctx, playerId);
    });
  }
  updateSettings(playerId: string, patch: unknown, now: number): void {
    this.mutate(now, (ctx) => updateSettings(ctx, playerId, patch));
  }
  start(playerId: string, now: number): void {
    this.mutate(now, (ctx) => startGame(ctx, playerId));
  }
  reset(playerId: string, now: number): void {
    this.mutate(now, (ctx) => resetToLobby(ctx, playerId));
  }

  // ---------- Partie
  command(playerId: string, cmd: ClientCommand | unknown, now: number): void {
    this.mutate(now, (ctx) => handleCommand(ctx, playerId, cmd));
  }
  chat(playerId: string, channel: unknown, text: unknown, now: number): void {
    this.mutate(now, (ctx) => sendChat(ctx, playerId, channel, text));
  }

  /** Départ volontaire. Lobby : retiré. En partie : abandon (mort sans dernière parole). */
  leave(playerId: string, now: number): void {
    this.mutate(now, (ctx) => {
      const p = getPlayer(this.state, playerId);
      if (!p) return;
      if (this.state.status === 'lobby') removePlayer(ctx, playerId);
      else {
        abandonPlayer(ctx, playerId);
        if (this.state.hostId === playerId) transferHost(ctx);
      }
    });
  }

  setConnected(playerId: string, connected: boolean, now: number): void {
    const p = getPlayer(this.state, playerId);
    if (!p || p.isBot || p.abandoned) return;
    if (p.connected === connected) return;
    p.connected = connected;
    p.disconnectedAt = connected ? null : now;
    this.state.updatedAt = now;
  }

  /**
   * Horloge du moteur : fait expirer les phases, gère les abandons et le
   * transfert d'Hôte. Renvoie true si l'état a changé.
   */
  tick(now: number): boolean {
    const ctx = this.ctx(now);
    const s = this.state;
    const signature = () => `${s.phase.seq}|${s.hostId}|${s.players.length}|${s.status}|${s.counter}`;
    const before = signature();
    for (const p of [...s.players]) {
      if (p.isBot || p.connected || p.disconnectedAt === null || p.abandoned) continue;
      const away = now - p.disconnectedAt;
      if (s.status === 'lobby' && away > LOBBY_DISCONNECT_REMOVE_MS) removePlayer(ctx, p.id);
      else if (s.status === 'running' && away > s.settings.abandonTimeoutMs) abandonPlayer(ctx, p.id);
    }
    const host = getPlayer(s, s.hostId);
    if (!host || host.abandoned || (!host.connected && host.disconnectedAt !== null && now - host.disconnectedAt > HOST_TRANSFER_DELAY_MS)) {
      transferHost(ctx);
    }
    const advanced = advanceTime(ctx);
    const changed = advanced || before !== signature();
    if (changed) s.updatedAt = now;
    return changed;
  }

  nextDeadline(): number | null {
    return this.state.phase.endsAt;
  }

  view(playerId: string, now: number): PlayerView {
    return buildView(this.ctx(now), playerId);
  }

  hasPlayer(playerId: string): boolean {
    return !!getPlayer(this.state, playerId);
  }

  findByTokenHash(tokenHash: string): PlayerState | undefined {
    if (!tokenHash) return undefined;
    return this.state.players.find((p) => p.tokenHash === tokenHash && !p.isBot);
  }
}
