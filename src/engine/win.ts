/**
 * WinConditionManager : liste ordonnée et extensible de conditions de victoire.
 * Évaluée exclusivement côté serveur, après chaque séquence de morts.
 */
import type { Team, WinResult } from '../shared/types.ts';
import { effectiveCamp } from './camps.ts';
import { alivePlayers, type Ctx } from './state.ts';

export interface WinCondition {
  id: string;
  priority: number;
  check(ctx: Ctx): WinResult | null;
}

const conditions: WinCondition[] = [];

export function registerWinCondition(c: WinCondition): void {
  conditions.push(c);
  conditions.sort((a, b) => a.priority - b.priority);
}

const CAMP_TITLES: Record<Team, string> = {
  village: '🏡 Victoire du Village !',
  wolves: '🐺 Victoire des Loups-Garous !',
  white_wolf: '🤍 Victoire du Loup-Blanc !',
  lovers: '❤️ Victoire des Amoureux !',
  none: 'Fin de partie',
};

function winnersOf(ctx: Ctx, camp: Team): string[] {
  const s = ctx.state;
  const ids = s.players.filter((p) => !p.abandoned && effectiveCamp(s, p) === camp).map((p) => p.id);
  if (camp === 'lovers' && s.settings.cupidWinsWithLovers) {
    const cupid = s.players.find((p) => p.originalRole === 'cupid' || p.role === 'cupid');
    if (cupid && !ids.includes(cupid.id)) ids.push(cupid.id);
  }
  return ids;
}

export function campVictory(ctx: Ctx, camp: Team): WinResult {
  return { camp, title: CAMP_TITLES[camp], winnerIds: winnersOf(ctx, camp) };
}

registerWinCondition({
  id: 'nobody_alive',
  priority: 0,
  check: (ctx) =>
    alivePlayers(ctx.state).length === 0 ? { camp: 'draw', title: '☠️ Plus personne au village… Égalité.', winnerIds: [] } : null,
});

// Tous les survivants appartiennent au même camp effectif → ce camp gagne.
registerWinCondition({
  id: 'single_camp',
  priority: 10,
  check(ctx) {
    const camps = new Set(alivePlayers(ctx.state).map((p) => effectiveCamp(ctx.state, p)));
    if (camps.size !== 1) return null;
    const [camp] = [...camps];
    return campVictory(ctx, camp);
  },
});

// Fin anticipée (activée par défaut) : le village ne peut plus gagner → victoire des Loups.
// C'est le cas quand les Loups sont au moins aussi nombreux que les autres vivants (ils gagnent
// chaque vote du jour et tuent chaque nuit), SAUF s'il reste un pouvoir capable de renverser
// la partie : Sorcière avec sa potion de mort, Chasseur vivant (il tire en mourant),
// Loup-Blanc ou couple mixte (autres camps en jeu).
registerWinCondition({
  id: 'wolves_parity',
  priority: 20,
  check(ctx) {
    if (!ctx.state.settings.wolvesWinAtParity) return null;
    const s = ctx.state;
    const alive = alivePlayers(s);
    const camps = alive.map((p) => effectiveCamp(s, p));
    if (camps.some((c) => c === 'white_wolf' || c === 'lovers')) return null;
    const wolves = camps.filter((c) => c === 'wolves').length;
    if (wolves === 0 || wolves < alive.length - wolves) return null;
    const villagers = alive.filter((_, i) => camps[i] !== 'wolves');
    const canTurn = villagers.some((p) => (p.role === 'witch' && !!p.roleData.death) || p.role === 'hunter');
    return canTurn ? null : campVictory(ctx, 'wolves');
  },
});

registerWinCondition({
  id: 'max_days',
  priority: 100,
  check: (ctx) =>
    ctx.state.dayNumber >= ctx.state.settings.maxDays
      ? { camp: 'draw', title: '⌛ Le village s’éteint lentement… Égalité.', winnerIds: [] }
      : null,
});

export function checkWin(ctx: Ctx): WinResult | null {
  for (const c of conditions) {
    const r = c.check(ctx);
    if (r) return r;
  }
  return null;
}
