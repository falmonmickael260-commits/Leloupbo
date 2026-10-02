/** Création de partie, gestion du lobby, composition et distribution aléatoire des rôles. */
import type { RoleId } from '../shared/types.ts';
import { fail } from './errors.ts';
import { AVATAR_IDS, defaultAvatar, isAvatarId } from '../shared/avatars.ts';
import { enterPhase } from './phase.ts';
import { shuffle } from './rng.ts';
import { allRoles, getRole, requireRole } from './roles/index.ts';
import { applySettingsPatch, defaultSettings, MAX_PLAYERS, MIN_PLAYERS, wolvesFor } from './settings.ts';
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
    tags: {},
  };
}

/** Loups automatiques : ajuste le nombre de Loups-Garous au nombre de joueurs du lobby. */
export function syncAutoWolves(s: GameState): void {
  if (s.status !== 'lobby' || !s.settings.autoWolves) return;
  s.settings.roles = { ...s.settings.roles, werewolf: wolvesFor(s.players.length) };
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
    avatar: isBot ? AVATAR_IDS[ctx.rng.int(AVATAR_IDS.length)] : defaultAvatar(seat),
  };
  s.players.push(p);
  if (!s.hostId) s.hostId = p.id;
  syncAutoWolves(s);
  announce(ctx, 'system', `👋 ${p.name} a rejoint la partie.`);
  return p;
}

export function removePlayer(ctx: Ctx, playerId: string): void {
  const s = ctx.state;
  if (s.status !== 'lobby') fail('GAME_STARTED', 'La partie a déjà commencé.');
  const p = getPlayer(s, playerId);
  if (!p) return;
  s.players = s.players.filter((x) => x.id !== playerId);
  syncAutoWolves(s);
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
  syncAutoWolves(s);
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
  syncAutoWolves(s);

  const composition = buildComposition(s.settings.roles, n);
  const deck: RoleId[] = [];
  for (const [id, count] of Object.entries(composition)) for (let i = 0; i < count; i++) deck.push(id);

  // Distribution aléatoire côté serveur (crypto en production).
  // L'Hôte choisit la composition, jamais qui reçoit quoi.
  const shuffled = shuffle(deck, ctx.rng);
  const players = [...s.players].sort((a, b) => a.seat - b.seat);
  varyRoles(shuffled, players.map((p) => s.previousRoles?.[p.id]), ctx);
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

/**
 * Les rôles changent vraiment d'une partie à l'autre : un joueur qui retombe sur le même rôle
 * spécial qu'à la partie précédente l'échange (au hasard) avec un autre joueur, quand c'est
 * possible sans créer de nouvelle répétition. La distribution reste aléatoire et secrète.
 */
function varyRoles(cards: RoleId[], previous: (RoleId | undefined)[], ctx: Ctx): void {
  const n = previous.length;
  for (let i = 0; i < n; i++) {
    if (!previous[i] || cards[i] !== previous[i] || cards[i] === 'villager') continue;
    const candidates = shuffle(
      Array.from({ length: n }, (_, j) => j).filter((j) => j !== i && cards[j] !== cards[i] && cards[j] !== previous[i] && cards[i] !== previous[j]),
      ctx.rng,
    );
    const j = candidates[0];
    if (j !== undefined) [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

/** Après une partie : retour au lobby demandé par l'Hôte (bouton). */
export function resetToLobby(ctx: Ctx, playerId: string): void {
  requireHost(ctx.state, playerId);
  if (ctx.state.status !== 'finished') fail('NOT_FINISHED', 'La partie n’est pas terminée.');
  returnToLobby(ctx);
}

/**
 * Retour au lobby avec les mêmes joueurs, le même code, le même Hôte et les mêmes réglages
 * (automatique quelques secondes après l'écran de victoire). Les sessions restent valides :
 * personne n'a à ressaisir de code.
 */
export function returnToLobby(ctx: Ctx): void {
  const s = ctx.state;
  if (s.status !== 'finished') return;
  const fresh = createGameState(s.code, ctx.now);
  const keep = s.players.filter((p) => !p.abandoned);
  const previousRoles: Record<string, RoleId> = {};
  for (const p of keep) if (p.originalRole) previousRoles[p.id] = p.originalRole;
  Object.assign(s, {
    ...fresh,
    previousRoles,
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
  if (!getPlayer(s, s.hostId)) transferHost(ctx);
  syncAutoWolves(s);
  announce(ctx, 'system', '🔄 Nouvelle partie : retour au lobby.');
}

/** Étiquette personnelle posée par `authorId` sur `targetId` (texte vide = suppression). Privée. */
export function setTag(ctx: Ctx, authorId: string, targetId: unknown, raw: unknown): void {
  const s = ctx.state;
  if (!getPlayer(s, authorId)) fail('NOT_IN_GAME', 'Joueur inconnu.');
  if (typeof targetId !== 'string' || !getPlayer(s, targetId)) fail('BAD_TARGET', 'Joueur inconnu.');
  if (raw !== undefined && raw !== null && typeof raw !== 'string') fail('BAD_TAG', 'Étiquette invalide.');
  const text = [...String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim()].slice(0, 24).join('');
  const tags = (s.tags ??= {});
  const mine = (tags[authorId] ??= {});
  if (text) mine[targetId] = text;
  else delete mine[targetId];
}

export function roleCatalog() {
  return allRoles();
}

/** Choix du personnage (cosmétique) — uniquement dans le lobby. */
export function setAvatar(ctx: Ctx, playerId: string, avatar: unknown): void {
  const s = ctx.state;
  if (s.status !== 'lobby') fail('GAME_STARTED', 'Le personnage se choisit avant la partie.');
  if (!isAvatarId(avatar)) fail('BAD_AVATAR', 'Personnage inconnu.');
  const p = getPlayer(s, playerId);
  if (!p) fail('NOT_IN_GAME', 'Joueur inconnu.');
  p.avatar = avatar;
}
