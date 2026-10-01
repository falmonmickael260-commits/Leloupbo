import { playerName, tell } from '../state.ts';
import { isWolfPack, registerNightStep, registerRole, stepData, validateTargets, playersWithRole } from './registry.ts';

registerRole({
  id: 'white_wolf',
  name: 'Loup-Blanc',
  emoji: '🤍',
  team: 'white_wolf',
  description: 'Chasse avec la meute, mais joue pour lui seul. Une nuit sur deux, il peut dévorer un Loup-Garou. Il gagne s’il est le dernier survivant.',
  unique: true,
  distributable: true,
  wolfPack: true,
  seerResult: (s) => s.whiteWolfSeerResult,
});

const STEP = 'white_wolf';
type D = { done: boolean; target: string | null };
const data = (ctx: Parameters<typeof stepData>[0]) => stepData<D>(ctx, STEP, () => ({ done: false, target: null }));

registerNightStep({
  id: STEP,
  phase: 'WHITE_WOLF_PHASE',
  order: 40,
  roleIds: ['white_wolf'],
  duration: (s) => s.durations.whiteWolf,
  // Une nuit sur deux (nuits paires).
  isScheduled: (ctx) => ctx.state.nightNumber % 2 === 0,
  actors: (ctx) => playersWithRole(ctx.state, 'white_wolf'),
  prompt(ctx, actor) {
    const d = data(ctx);
    if (d.done) return null;
    return {
      action: 'white_wolf',
      title: '🤍 Dévorer un Loup-Garou ?',
      description: 'Vous pouvez éliminer un membre de la meute, ou passer.',
      targets: ctx.state.players.filter((p) => p.alive && p.id !== actor.id && isWolfPack(p)).map((p) => p.id),
      minTargets: 0,
      maxTargets: 1,
      submitted: false,
      canChange: false,
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor);
    if (!p) return;
    const [target] = validateTargets(cmd.targets, p.targets, 0, 1);
    const d = data(ctx);
    d.done = true;
    d.target = target ?? null;
    if (target) {
      ctx.state.night!.effects.push({ type: 'attack', target, source: 'white_wolf' });
      tell(ctx, actor.id, 'wolves', `🤍 Vous avez choisi de dévorer ${playerName(ctx.state, target)}.`);
    }
  },
  isComplete: (ctx) => data(ctx).done,
});
