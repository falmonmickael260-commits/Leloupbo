import type { Team } from '../shared/types.ts';
import { getRole } from './roles/index.ts';
import { getPlayer, type GameState, type PlayerState } from './state.ts';

/**
 * Camp effectif d'un joueur : celui de son rôle, sauf s'il forme un couple
 * "mixte" (amoureux de camps différents) — le couple joue alors pour lui-même.
 */
/** Camp du joueur seul : celui de son rôle, ou les Loups s'il a été infecté. */
export function baseCamp(p: PlayerState): Team {
  if (p.infected) return 'wolves';
  return getRole(p.role)?.team ?? 'village';
}

export function effectiveCamp(state: GameState, p: PlayerState): Team {
  const team = baseCamp(p);
  const lover = getPlayer(state, p.loverId);
  if (lover) {
    const loverTeam = baseCamp(lover);
    if (loverTeam !== team) return 'lovers';
  }
  return team;
}
