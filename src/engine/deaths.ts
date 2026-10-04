/**
 * Gestion des morts : application d'une mort, réactions en chaîne
 * (amoureux, Chasseur, Capitaine) et résolution de la nuit (ActionResolver).
 */
import type { DeathCause } from '../shared/types.ts';
import { getRole } from './roles/index.ts';
import { announce, getPlayer, tell, type Ctx, type NightEffect } from './state.ts';

const NIGHT_PHASES = new Set([
  'NIGHT_START', 'THIEF_PHASE', 'CUPID_PHASE', 'WEREWOLF_PHASE', 'WHITE_WOLF_PHASE',
  'SEER_PHASE', 'SALVATION_PHASE', 'WITCH_PHASE', 'NIGHT_RESOLUTION',
]);

export function isNightPhase(ctx: Ctx): boolean {
  return NIGHT_PHASES.has(ctx.state.phase.id);
}

/**
 * Tue un joueur. Les tâches consécutives (dernière parole, tir du Chasseur,
 * succession du Capitaine) sont ajoutées à la file traitée par le PhaseManager.
 * Renvoie les ids de tous les joueurs morts (y compris en chaîne).
 */
export function kill(ctx: Ctx, playerId: string, cause: DeathCause): string[] {
  const p = getPlayer(ctx.state, playerId);
  if (!p || !p.alive) return [];
  const dead = [p.id];
  p.alive = false;
  p.deathCause = cause;
  const queue = ctx.state.deathQueue;

  if (cause !== 'abandon' && !getRole(p.role)?.noLastWord) queue.push({ kind: 'last_word', playerId: p.id });
  getRole(p.role)?.onDeath?.(ctx, p, cause);
  if (ctx.state.captainId === p.id) {
    ctx.state.captainId = null;
    queue.push({ kind: 'captain_succession', playerId: p.id });
  }
  tell(ctx, p.id, 'death', getRole(p.role)?.noLastWord ? '💀 Vous êtes mort. Pas de dernière parole pour votre rôle : vous rejoignez le chat des morts.' : '💀 Vous êtes mort. Vous rejoignez le chat des morts après votre dernière parole.');

  // Amoureux : si l'un meurt, l'autre meurt de chagrin.
  const lover = getPlayer(ctx.state, p.loverId);
  if (lover && lover.alive) {
    if (!isNightPhase(ctx) && ctx.state.phase.id !== 'LOBBY') {
      announce(ctx, 'death', `💔 Fou de chagrin, ${lover.name} ne survit pas à la mort de ${p.name}.`);
    }
    dead.push(...kill(ctx, lover.id, 'heartbreak'));
  }
  return dead;
}

/** Résolution de la nuit : combine attaques, protections, potions. */
export function resolveNightEffects(ctx: Ctx): { target: string; cause: DeathCause }[] {
  const effects: NightEffect[] = ctx.state.night?.effects ?? [];
  const deaths: { target: string; cause: DeathCause }[] = [];
  const blocked = (target: string, source: 'wolves' | 'white_wolf') =>
    effects.some((e) => (e.type === 'protect' || e.type === 'save') && e.target === target && e.against.includes(source));

  for (const e of effects) {
    if (e.type === 'attack' && !blocked(e.target, e.source)) deaths.push({ target: e.target, cause: e.source });
    if (e.type === 'kill') deaths.push({ target: e.target, cause: e.source });
  }
  // Un joueur ne meurt qu'une fois (première cause retenue).
  const seen = new Set<string>();
  return deaths.filter((d) => (seen.has(d.target) ? false : (seen.add(d.target), true)));
}
