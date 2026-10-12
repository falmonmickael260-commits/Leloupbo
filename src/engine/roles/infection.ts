import type { PlayerState } from '../state.ts';

/**
 * Pouvoir d'infection du Loup Noir et du Super Loup Noir (un seul des deux par partie).
 * Module sans enregistrement de rôle : l'ordre d'affichage des rôles reste celui de `roles/index.ts`.
 */
export const INFECTOR_ROLES: readonly string[] = ['black_wolf', 'super_black_wolf'];

export const isInfectorRole = (p: PlayerState): boolean => INFECTOR_ROLES.includes(p.role ?? '');

/** Super Loup Noir : première nuit où il pourra de nouveau infecter (une nuit d'attente après chaque infection). */
export function nextInfectNight(p: PlayerState): number {
  const last = p.roleData.lastInfectNight;
  return typeof last === 'number' ? last + 2 : 1;
}

/** Le joueur peut-il infecter pendant la nuit `night` ? */
export function canInfect(p: PlayerState, night: number): boolean {
  if (p.role === 'black_wolf') return !!p.roleData.infect;
  if (p.role === 'super_black_wolf') return night >= nextInfectNight(p);
  return false;
}

/** L'infection vient d'être utilisée pendant la nuit `night`. */
export function useInfection(p: PlayerState, night: number): void {
  if (p.role === 'black_wolf') p.roleData.infect = false; // une seule fois dans toute la partie
  if (p.role === 'super_black_wolf') p.roleData.lastInfectNight = night;
}
