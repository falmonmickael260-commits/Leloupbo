import type { DurationPreset, Durations, GameSettings } from '../shared/types.ts';
import { fail } from './errors.ts';
import { DEFAULT_MAP, isMapId } from '../shared/maps.ts';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 18;

const S = 1000;

export const DURATION_PRESETS: Record<DurationPreset, Durations> = {
  normal: {
    roleReveal: 10 * S,
    nightStart: 5 * S,
    thief: 25 * S,
    cupid: 30 * S,
    werewolf: 60 * S,
    whiteWolf: 20 * S,
    seer: 25 * S,
    salvateur: 20 * S,
    witch: 30 * S,
    inactiveStepMin: 8 * S,
    inactiveStepMax: 16 * S,
    sunrise: 7 * S,
    lastWord: 30 * S,
    hunterShot: 20 * S,
    captainSuccession: 20 * S,
    captainElection: 60 * S,
    speech: 45 * S,
    freeDiscussion: 60 * S,
    voting: 20 * S,
    voteResult: 10 * S,
  },
  // Préréglage de test : même logique, timers raccourcis.
  fast: {
    roleReveal: 4 * S,
    nightStart: 2 * S,
    thief: 10 * S,
    cupid: 10 * S,
    werewolf: 15 * S,
    whiteWolf: 8 * S,
    seer: 8 * S,
    salvateur: 8 * S,
    witch: 10 * S,
    inactiveStepMin: 2 * S,
    inactiveStepMax: 4 * S,
    sunrise: 3 * S,
    lastWord: 8 * S,
    hunterShot: 8 * S,
    captainSuccession: 8 * S,
    captainElection: 15 * S,
    speech: 10 * S,
    freeDiscussion: 15 * S,
    voting: 10 * S,
    voteResult: 6 * S,
  },
};

export function defaultSettings(): GameSettings {
  return {
    maxPlayers: MAX_PLAYERS,
    roles: { werewolf: 2, seer: 1, witch: 1, cupid: 1, hunter: 1 },
    captainEnabled: true,
    durationPreset: 'normal',
    durations: { ...DURATION_PRESETS.normal },
    wolvesWinAtParity: true,
    whiteWolfSeerResult: 'LOUP',
    witchCanSelfSave: true,
    witchBothPotionsSameNight: true,
    salvateurCanSelfProtect: true,
    salvateurSameTargetTwice: false,
    salvateurBlocksWhiteWolf: false,
    cupidWinsWithLovers: false,
    tieRule: 'revote',
    endVoteWhenAllVoted: true,
    revealVotes: true,
    revealRolesOnGameOver: true,
    autoWolves: true,
    map: DEFAULT_MAP,
    simulateInactiveSteps: false,
    abandonTimeoutMs: 3 * 60 * S,
    maxDays: 40,
  };
}

const BOOL_KEYS = [
  'captainEnabled',
  'wolvesWinAtParity',
  'witchCanSelfSave',
  'witchBothPotionsSameNight',
  'salvateurCanSelfProtect',
  'salvateurSameTargetTwice',
  'salvateurBlocksWhiteWolf',
  'cupidWinsWithLovers',
  'endVoteWhenAllVoted',
  'revealVotes',
  'revealRolesOnGameOver',
  'autoWolves',
  'simulateInactiveSteps',
] as const;

/**
 * Applique un patch de réglages envoyé par l'Hôte en le validant champ par champ.
 * Toute entrée client est considérée comme hostile.
 */
export function applySettingsPatch(
  current: GameSettings,
  patch: unknown,
  knownRoles: (id: string) => { unique: boolean; distributable: boolean } | undefined,
  playerCount: number,
): GameSettings {
  if (!patch || typeof patch !== 'object') fail('BAD_SETTINGS', 'Réglages invalides.');
  const p = patch as Record<string, unknown>;
  const next: GameSettings = structuredClone(current);

  if (p.maxPlayers !== undefined) {
    const n = Number(p.maxPlayers);
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS)
      fail('BAD_SETTINGS', `Le nombre de joueurs doit être entre ${MIN_PLAYERS} et ${MAX_PLAYERS}.`);
    if (n < playerCount) fail('BAD_SETTINGS', 'Il y a déjà plus de joueurs dans le lobby.');
    next.maxPlayers = n;
  }

  if (p.roles !== undefined) {
    if (!p.roles || typeof p.roles !== 'object') fail('BAD_SETTINGS', 'Composition invalide.');
    const roles: Record<string, number> = {};
    for (const [id, raw] of Object.entries(p.roles as Record<string, unknown>)) {
      const def = knownRoles(id);
      if (!def || !def.distributable || id === 'villager') fail('BAD_SETTINGS', `Rôle inconnu : ${id}`);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > MAX_PLAYERS) fail('BAD_SETTINGS', `Nombre invalide pour ${id}.`);
      if (def.unique && n > 1) fail('BAD_SETTINGS', `Le rôle ${id} est unique.`);
      if (n > 0) roles[id] = n;
    }
    next.roles = roles;
  }

  if (p.durationPreset !== undefined) {
    if (p.durationPreset !== 'normal' && p.durationPreset !== 'fast') fail('BAD_SETTINGS', 'Préréglage inconnu.');
    next.durationPreset = p.durationPreset;
    next.durations = { ...DURATION_PRESETS[p.durationPreset] };
  }

  for (const key of BOOL_KEYS) {
    if (p[key] !== undefined) {
      if (typeof p[key] !== 'boolean') fail('BAD_SETTINGS', `Valeur invalide pour ${key}.`);
      next[key] = p[key] as boolean;
    }
  }

  if (p.map !== undefined) {
    if (!isMapId(p.map)) fail('BAD_SETTINGS', 'Map inconnue.');
    next.map = p.map;
  }

  if (p.whiteWolfSeerResult !== undefined) {
    if (p.whiteWolfSeerResult !== 'LOUP' && p.whiteWolfSeerResult !== 'CIVIL') fail('BAD_SETTINGS', 'Valeur invalide.');
    next.whiteWolfSeerResult = p.whiteWolfSeerResult;
  }
  if (p.tieRule !== undefined) {
    if (p.tieRule !== 'revote' && p.tieRule !== 'none' && p.tieRule !== 'random') fail('BAD_SETTINGS', 'Valeur invalide.');
    next.tieRule = p.tieRule;
  }
  return next;
}

/** Nombre de Loups-Garous conseillé : 5 à 8 joueurs → 2, 9 à 11 → 3, 12 à 18 → 4 (1 en dessous de 5). */
export function wolvesFor(playerCount: number): number {
  if (playerCount < 5) return 1;
  if (playerCount <= 8) return 2;
  if (playerCount <= 11) return 3;
  return 4;
}
