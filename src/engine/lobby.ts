/** Création de partie, gestion du lobby, composition et distribution aléatoire des rôles. */
import type { RoleId } from '../shared/types.ts';
import { fail } from './errors.ts';
import { enterPhase } from './phase.ts';
import { shuffle } from './rng.ts';
import { allRoles, getRole, requireRole } from './roles/index.ts';
import { applySettingsPatch, defaultSettings, MAX_PLAYERS, MIN_PLAYERS } from './settings.ts';
import { announce, getPlayer, nextId, STATE_VERSION, tell, type Ctx, type GameState, type PlayerState } from './state.ts';

export function createGameState(code: string, now: number): GameState {
  return {
    version: STATE_VERSION,
    code,
    createdAt: now,
    updatedAt: now,
    hostId: '',
    status: 'lobby',
    settings: defaultSettings(),
    players: [],
    composition: null,
    extraCards: [],
    phase: { id: 'LOBBY', seq: 0, startedAt: now, endsAt: null, data: {} },
    nightNumber: 0,
    dayNumber: 0,
    night: null,
    captainId: null,
    captainElectionDone: false,
    speech: null,
    speechRotation: 0,
    ballot: null,
    deathQueue: [],
    pipelineNext: null,
    announcements: [],
    privateMessages: {},
    chats: { village: [], wolves: [], dead: [] },
    winner: null,
    counter: 0,
  };
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') fail('BAD_NAME', 'Pseudo invalide.');
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (name.length < 1) fail('BAD_NAME', 'Pseudo invalide.');
  return name;
}

function uniqueName(state: GameState, name: string): string {
  const taken = new Set(state.players.map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const n = `${name.slice(0, 17)} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

export function addPlayer(ctx: Ctx, rawName: unknown, tokenHash: string, isBot = false): PlayerState {
  const s = ctx.state;
  if (s.status !== 'lobby') fail('GAME_STARTED', 'La partie a déjà commencé.');
  if (s.players.length >= s.settings.maxPlayers) fail('GAME_FULL', 'La partie est complète.');
  const seat = s.players.reduce((m, p) => Math.max(m, p.seat + 1), 0);
  const p: PlayerState = {
    id: nextId(ctx, 'p') + ctx.rng.int(1e6).toString(36),
    name: uniqueName(s, sanitizeName(rawName)),
    seat,
    tokenHash,
    isBot,
    joinedAt: ctx.now,
    connected: isBot,
    disconnectedAt: null,
    role: null,
    originalRole: null,
    alive: true,
    deathCause: null,
    abandoned: false,
    loverId: null,
    roleData: {},
  };
  s.players.push(p);
  if (!s.hostId) s.hostId = p.id;
  announce(ctx, 'system', `👋 ${p.name} a rejoint la partie.`);
  return p;
}

export function removePlayer(ctx: Ctx, playerId: string): void {
  const s = ctx.state;
  if (s.status !== 'lobby') fail('GAME_STARTED', 'La partie a déjà commencé.');
  const p = getPlayer(s, playerId);
  if (!p) return;
  s.players = s.players.filter((x) => x.id !== playerId);
  announce(ctx, 'system', `🚪 ${p.name} a quitté la partie.`);
  if (s.hostId === playerId) transferHost(ctx);
}

/** Choisit un nouvel Hôte parmi les humains connectés (le plus ancien). */
export function transferHost(ctx: Ctx): void {
  const s = ctx.state;
  const candidates = s.players
    .filter((p) => !p.isBot && !p.abandoned && p.id !== s.hostId && p.connected)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const current = getPlayer(s, s.hostId);
  const hostGone = !current || current.abandoned;
  const next = candidates[0] ?? (hostGone ? s.players.find((p) => !p.isBot && !p.abandoned && p.id !== s.hostId) : undefined);
  if (!next) return;
  s.hostId = next.id;
  announce(ctx, 'system', `⭐ ${next.name} devient l’Hôte de la partie.`);
}

export function requireHost(state: GameState, playerId: string): void {
  if (state.hostId !== playerId) fail('NOT_HOST', 'Seul l’Hôte peut faire cela.');
}

export function updateSettings(ctx: Ctx, playerId: string, patch: unknown): void {
  const s = ctx.state;
  requireHost(s, playerId);
  // Les rôles ne peuvent plus être modifiés une fois la partie lancée.
  if (s.status !== 'lobby') fail('GAME_STARTED', 'Les réglages sont verrouillés pendant la partie.');
  s.settings = applySettingsPatch(s.settings, patch, (id) => getRole(id), s.players.length);
}

/** Composition complète pour `playerCount` joueurs (villageois en complément). */
export function buildComposition(roles: Record<RoleId, number>, playerCount: number): Record<RoleId, number> {
  const comp: Record<RoleId, number> = {};
  let total = 0;
  let wolves = 0;
  for (const [id, n] of Object.entries(roles)) {
    if (n <= 0) continue;
    const def = requireRole(id);
    comp[id] = n;
    total += n;
    if (def.wolfPack) wolves += n;
  }
  const cards = playerCount + ((comp.thief ?? 0) > 0 ? 2 : 0);
  if ((comp.werewolf ?? 0) < 1) fail('BAD_COMPOSITION', 'Il faut au moins un Loup-Garou.');
  if (wolves >= playerCount) fail('BAD_COMPOSITION', 'Trop de loups pour le nombre de joueurs.');
  if (total > cards) fail('BAD_COMPOSITION', `Trop de rôles spéciaux : ${total} cartes pour ${cards} places.`);
  if (cards - total > 0) comp.villager = (comp.villager ?? 0) + cards - total;
  return comp;
}

export function startGame(ctx: Ctx, playerId: string): void {
  const s = ctx.state;
  requireHost(s, playerId);
  if (s.status !== 'lobby') fail('GAME_STARTED', 'La partie a déjà commencé.');
  const n = s.players.length;
  if (n < MIN_PLAYERS) fail('NOT_ENOUGH_PLAYERS', `Il faut au moins ${MIN_PLAYERS} joueurs.`);
  if (n > Math.min(MAX_PLAYERS, s.settings.maxPlayers)) fail('GAME_FULL', 'Trop de joueurs.');

  const composition = buildComposition(s.settings.roles, n);
  const deck: RoleId[] = [];
  for (const [id, count] of Object.entries(composition)) for (let i = 0; i < count; i++) deck.push(id);

  // Distribution aléatoire côté serveur (crypto en production).
  // L'Hôte choisit la composition, jamais qui reçoit quoi.
  const shuffled = shuffle(deck, ctx.rng);
  const players = [...s.players].sort((a, b) => a.seat - b.seat);
  players.forEach((p, i) => {
    p.role = shuffled[i];
    p.originalRole = shuffled[i];
    p.roleData = requireRole(shuffled[i]).initRoleData?.() ?? {};
    p.alive = true;
    p.deathCause = null;
    p.loverId = null;
  });
  s.extraCards = shuffled.slice(n);
  s.composition = composition;
  s.status = 'running';
  for (const p of players) {
    const def = requireRole(p.role!);
    tell(ctx, p.id, 'role', `🎴 Votre rôle : ${def.emoji} ${def.name}. ${def.description}`);
  }
  announce(ctx, 'info', `🎴 La partie commence avec ${n} joueurs. Les rôles sont distribués.`);
  enterPhase(ctx, 'ROLE_DISTRIBUTION', s.settings.durations.roleReveal);
}

/** Après une partie : retour au lobby avec les mêmes joueurs. */
export function resetToLobby(ctx: Ctx, playerId: string): void {
  const s = ctx.state;
  requireHost(s, playerId);
  if (s.status !== 'finished') fail('NOT_FINISHED', 'La partie n’est pas terminée.');
  const fresh = createGameState(s.code, ctx.now);
  const keep = s.players.filter((p) => !p.abandoned);
  Object.assign(s, {
    ...fresh,
    createdAt: s.createdAt,
    hostId: s.hostId,
    settings: s.settings,
    counter: s.counter,
    phase: { ...fresh.phase, seq: s.phase.seq + 1 },
    players: keep.map((p, i) => ({
      ...p,
      seat: i,
      role: null,
      originalRole: null,
      alive: true,
      deathCause: null,
      loverId: null,
      roleData: {},
    })),
  });
  announce(ctx, 'system', '🔄 Nouvelle partie : retour au lobby.');
}

export function roleCatalog() {
  return allRoles();
}
