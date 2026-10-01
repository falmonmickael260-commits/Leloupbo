import { shuffle, type Rng } from './rng.ts';

/**
 * Dépouille des bulletins. Renvoie les candidats à égalité en tête
 * (vide si aucun bulletin). Les poids permettent la voix double du Capitaine.
 */
export function tally(
  ballots: Record<string, string>,
  weight: (voterId: string) => number = () => 1,
): { leaders: string[]; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const [voter, target] of Object.entries(ballots)) {
    counts[target] = (counts[target] ?? 0) + weight(voter);
  }
  let max = 0;
  for (const c of Object.values(counts)) max = Math.max(max, c);
  const leaders = max > 0 ? Object.keys(counts).filter((k) => counts[k] === max) : [];
  return { leaders, counts };
}

/** Tête de dépouille, égalité départagée au hasard (côté serveur). */
export function pickLeader(ballots: Record<string, string>, rng: Rng, weight?: (voterId: string) => number): string | null {
  const { leaders } = tally(ballots, weight);
  if (leaders.length === 0) return null;
  return shuffle(leaders, rng)[0];
}
