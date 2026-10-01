import { fail } from '../errors.ts';
import { tell, type Ctx, type PlayerState } from '../state.ts';
import { getRole, playersWithRole, registerNightStep, registerRole, requireRole, stepData } from './registry.ts';

registerRole({
  id: 'thief',
  name: 'Voleur',
  emoji: '🦝',
  team: 'village',
  description: 'La première nuit, il découvre deux cartes non distribuées et peut échanger sa carte avec l’une d’elles.',
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

function become(ctx: Ctx, thief: PlayerState, choice: 'keep' | 0 | 1): void {
  const d = data(ctx);
  d.done = true;
  if (choice === 'keep') {
    thief.role = 'villager';
    thief.roleData = {};
    tell(ctx, thief.id, 'thief', '🦝 Vous gardez votre carte : vous êtes désormais Simple Villageois.');
    return;
  }
  const newRole = ctx.state.extraCards[choice];
  ctx.state.extraCards[choice] = 'thief';
  thief.role = newRole;
  thief.roleData = requireRole(newRole).initRoleData?.() ?? {};
  const def = requireRole(newRole);
  tell(ctx, thief.id, 'thief', `🦝 Vous avez volé la carte ${def.emoji} ${def.name}. C’est désormais votre rôle.`);
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
    if (!mustTake(ctx)) options.push({ id: 'keep', label: 'Garder ma carte (devenir Simple Villageois)' });
    return {
      action: 'thief',
      title: '🦝 Les deux cartes restantes',
      description: mustTake(ctx) ? 'Les deux cartes sont des Loups : vous devez en prendre une.' : 'Échangez votre carte ou gardez-la.',
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
    become(ctx, actor, cmd.option === 'keep' ? 'keep' : (Number(cmd.option) as 0 | 1));
  },
  isComplete: (ctx) => data(ctx).done,
  onEnd(ctx) {
    if (data(ctx).done) return;
    const thief = this.actors(ctx)[0];
    if (thief) become(ctx, thief, mustTake(ctx) ? 0 : 'keep');
  },
});
