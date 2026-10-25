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

/**
 * Même résultat, pour la plateforme Revanche Game centrale (compte distinct
 * du profil propre à La Meute — voir `platformUserId` dans `state.ts`).
 * Inclut tout le monde, pas seulement ceux qui ont un profil La Meute :
 * les bots et invités remontent comme `guest_label`, sans compte attribué.
 */
export interface PlatformResultRow {
  user_id: string | null;
  guest_label: string | null;
  outcome: 'win' | 'loss' | 'draw';
  score: null;
  position: null;
}

export function platformGameResults(s: GameState): PlatformResultRow[] {
  const win = s.winner;
  if (s.status !== 'finished' || !win) return [];
  return s.players.map((p) => ({
    user_id: p.platformUserId ?? null,
    guest_label: p.platformUserId ? null : p.name,
    outcome: win.camp === 'draw' ? 'draw' : win.winnerIds.includes(p.id) ? 'win' : 'loss',
    score: null,
    position: null,
  }));
}
