import type { Team } from '../shared/types.ts';
import { getRole } from './roles/index.ts';
import { getPlayer, type GameState, type PlayerState } from './state.ts';

/**
 * Camp effectif d'un joueur : celui de son rôle, sauf s'il forme un couple
 * "mixte" (amoureux de camps différents) — le couple joue alors pour lui-même.
 */
export function effectiveCamp(state: GameState, p: PlayerState): Team {
  const team = getRole(p.role)?.team ?? 'village';
  const lover = getPlayer(state, p.loverId);
  if (lover) {
    const loverTeam = getRole(lover.role)?.team ?? 'village';
    if (loverTeam !== team) return 'lovers';
  }
  return team;
}
