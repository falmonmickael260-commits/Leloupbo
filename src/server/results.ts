/**
 * Résultat d'une partie de Loup-Garou terminée, pour les profils de la plateforme.
 * Calculé uniquement à partir de l'état du serveur (jamais d'après le navigateur).
 */
import { effectiveCamp } from '../engine/camps.ts';
import type { GameState } from '../engine/state.ts';
import type { GameResultRow } from '../platform/profiles.ts';
import type { Team } from '../shared/types.ts';

export const GAME_ID = 'loup-garou';

const CAMPS: Record<Team, string> = { wolves: 'loup', village: 'civil', white_wolf: 'loup_blanc', lovers: 'amoureux', none: 'aucun' };

export function gameResults(s: GameState): GameResultRow[] {
  const win = s.winner;
  if (s.status !== 'finished' || !win) return [];
  return s.players
    .filter((p) => p.profileId && !p.isBot)
    .map((p) => ({
      playerId: p.profileId!,
      game: GAME_ID,
      role: p.role,
      camp: CAMPS[effectiveCamp(s, p)],
      outcome: win.camp === 'draw' ? 'draw' : win.winnerIds.includes(p.id) ? 'win' : 'loss',
      eliminated: !p.alive,
    }));
}
