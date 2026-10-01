/** Ordre des tours de parole : en partant du Capitaine s'il est vivant, sinon rotation quotidienne. */
import { alivePlayers, type GameState } from './state.ts';

export function buildSpeechOrder(state: GameState): string[] {
  const alive = alivePlayers(state).sort((a, b) => a.seat - b.seat);
  if (alive.length === 0) return [];
  let start = alive.findIndex((p) => p.id === state.captainId);
  if (start < 0) start = state.speechRotation % alive.length;
  return [...alive.slice(start), ...alive.slice(0, start)].map((p) => p.id);
}
