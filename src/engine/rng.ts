import { randomInt } from 'node:crypto';

/** Source d'aléatoire injectable : crypto en production, graine en test/simulation. */
export interface Rng {
  /** Entier uniforme dans [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export const cryptoRng: Rng = {
  int(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    return randomInt(maxExclusive);
  },
};

/** Générateur déterministe (mulberry32) — uniquement pour tests et simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(maxExclusive) {
      if (maxExclusive <= 1) return 0;
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * maxExclusive);
    },
  };
}

/** Mélange de Fisher-Yates (copie). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[rng.int(items.length)];
}
