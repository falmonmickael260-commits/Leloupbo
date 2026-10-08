/**
 * Ordre des tours de parole : en partant du Capitaine s'il est vivant, sinon d'un joueur pris
 * AU HASARD chaque jour (jamais le même que la veille), puis dans l'ordre du cercle.
 */
import type { Rng } from './rng.ts';
import { alivePlayers, type GameState } from './state.ts';

export function buildSpeechOrder(state: GameState, rng: Rng): string[] {
  const alive = alivePlayers(state).sort((a, b) => a.seat - b.seat);
  if (alive.length === 0) return [];
  let start = alive.findIndex((p) => p.id === state.captainId);
  if (start < 0) {
    // Au hasard, mais pas celui qui a commencé la veille (s'il reste quelqu'un d'autre).
    const choices = alive.map((_, i) => i).filter((i) => alive.length < 2 || alive[i].id !== state.lastFirstSpeaker);
    start = choices[rng.int(choices.length)];
  }
  return [...alive.slice(start), ...alive.slice(0, start)].map((p) => p.id);
}
