/**
 * Ordre des tours de parole : en partant du Capitaine s'il est vivant, sinon d'un joueur
 * TIRÉ AU SORT (chaque jour), puis dans l'ordre du cercle.
 */
import type { Rng } from './rng.ts';
import { alivePlayers, type GameState } from './state.ts';

export function buildSpeechOrder(state: GameState, rng: Rng): string[] {
  const alive = alivePlayers(state).sort((a, b) => a.seat - b.seat);
  if (alive.length === 0) return [];
  let start = alive.findIndex((p) => p.id === state.captainId);
  if (start < 0) start = rng.int(alive.length);
  return [...alive.slice(start), ...alive.slice(0, start)].map((p) => p.id);
}
