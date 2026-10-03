import { fail } from '../errors.ts';
import { tell, type Ctx, type PlayerState } from '../state.ts';
import { getRole, playersWithRole, registerNightStep, registerRole, requireRole, stepData } from './registry.ts';

registerRole({
  id: 'thief',
  name: 'Voleur',
  emoji: '🃏',
  team: 'village',
  description: 'La première nuit, il découvre les deux cartes restées au centre et doit échanger sa carte avec l’une d’elles : il prend ce nouveau rôle.',
  unique: true,
  distributable: true,
  seerResult: () => 'CIVIL',
});

const STEP = 'thief';
type D = { done: boolean };
const data = (ctx: Ctx) => stepData<D>(ctx, STEP, () => ({ done: false }));

function mustTake(ctx: Ctx): boolean {
  const cards = ctx.state.extraCards;
  return cards.length === 2 && cards.every((c) => !!getRole(c)?.wolfPack);
}

/**
 * Échange : la carte du Voleur part au centre, il prend la carte choisie et devient ce rôle
 * (pouvoirs actifs, ancien rôle abandonné). Rien n'est annoncé aux autres joueurs.
 */
function become(ctx: Ctx, thief: PlayerState, choice: 0 | 1): void {
  const d = data(ctx);
  d.done = true;
  const newRole = ctx.state.extraCards[choice];
  ctx.state.extraCards[choice] = 'thief';
  thief.role = newRole;
  thief.roleData = requireRole(newRole).initRoleData?.() ?? {};
  const def = requireRole(newRole);
  tell(ctx, thief.id, 'thief', `🃏 Tu as pris la carte ${def.emoji} ${def.name}. Ton nouveau rôle est secret.`);
}

registerNightStep({
  id: STEP,
  phase: 'THIEF_PHASE',
  order: 10,
  roleIds: ['thief'],
  duration: (s) => s.durations.thief,
  isScheduled: (ctx) => ctx.state.nightNumber === 1 && ctx.state.extraCards.length === 2,
  actors: (ctx) => playersWithRole(ctx.state, 'thief'),
  prompt(ctx) {
    if (data(ctx).done) return null;
    const cards = ctx.state.extraCards;
    const options = cards.map((c, i) => {
      const def = requireRole(c);
      return { id: String(i), label: `Prendre ${def.emoji} ${def.name}` };
    });
    return {
      action: 'thief',
      title: '🃏 LE VOLEUR',
      description: mustTake(ctx) ? 'Choisis ton destin... Les deux cartes sont des Loups : tu dois en prendre une.' : 'Choisis ton destin...',
      // Cartes du centre (visibles du Voleur seul) pour l'animation de retournement / échange.
      info: { cards: cards.map((c) => ({ id: c, name: requireRole(c).name })), mustTakeWolf: mustTake(ctx) },
      targets: [],
      minTargets: 0,
      maxTargets: 0,
      options,
      submitted: false,
      canChange: false,
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor);
    if (!p) return;
    if (!p.options!.some((o) => o.id === cmd.option)) fail('BAD_OPTION', 'Option indisponible.');
    become(ctx, actor, Number(cmd.option) as 0 | 1);
  },
  isComplete: (ctx) => data(ctx).done,
  onEnd(ctx) {
    if (data(ctx).done) return;
    const thief = this.actors(ctx)[0];
    // Temps écoulé sans choix : une des deux cartes au hasard.
    if (thief) become(ctx, thief, ctx.rng.int(2) as 0 | 1);
  },
});
