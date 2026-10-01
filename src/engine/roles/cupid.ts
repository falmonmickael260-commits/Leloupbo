import { alivePlayers, playerName, tell, type Ctx } from '../state.ts';
import { shuffle } from '../rng.ts';
import { playersWithRole, registerNightStep, registerRole, stepData, validateTargets } from './registry.ts';

registerRole({
  id: 'cupid',
  name: 'Cupidon',
  emoji: '💘',
  team: 'village',
  description: 'La première nuit, il unit deux joueurs. Si l’un des amoureux meurt, l’autre meurt de chagrin.',
  unique: true,
  distributable: true,
  seerResult: () => 'CIVIL',
});

const STEP = 'cupid';
type D = { done: boolean };
const data = (ctx: Ctx) => stepData<D>(ctx, STEP, () => ({ done: false }));

export function linkLovers(ctx: Ctx, aId: string, bId: string, cupidId: string | null): void {
  const a = ctx.state.players.find((p) => p.id === aId)!;
  const b = ctx.state.players.find((p) => p.id === bId)!;
  a.loverId = b.id;
  b.loverId = a.id;
  // Chaque amoureux ne connaît que l'identité (pas le rôle) de son partenaire.
  tell(ctx, a.id, 'lover', `❤️ Tu es amoureux de ${b.name}.`);
  tell(ctx, b.id, 'lover', `❤️ Tu es amoureux de ${a.name}.`);
  if (cupidId) tell(ctx, cupidId, 'info', `💘 Vous avez uni ${playerName(ctx.state, a.id)} et ${playerName(ctx.state, b.id)}.`);
}

registerNightStep({
  id: STEP,
  phase: 'CUPID_PHASE',
  order: 20,
  roleIds: ['cupid'],
  duration: (s) => s.durations.cupid,
  isScheduled: (ctx) => ctx.state.nightNumber === 1,
  actors: (ctx) => playersWithRole(ctx.state, 'cupid'),
  prompt(ctx) {
    if (data(ctx).done) return null;
    return {
      action: 'cupid',
      title: '💘 Désignez deux amoureux',
      description: 'Sélectionnez deux joueurs (vous pouvez vous inclure), puis confirmez.',
      targets: alivePlayers(ctx.state).map((p) => p.id),
      minTargets: 2,
      maxTargets: 2,
      submitted: false,
      canChange: false,
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor);
    if (!p) return;
    const [a, b] = validateTargets(cmd.targets, p.targets, 2, 2);
    data(ctx).done = true;
    linkLovers(ctx, a, b, actor.id);
  },
  isComplete: (ctx) => data(ctx).done,
  onEnd(ctx) {
    const d = data(ctx);
    const cupid = this.actors(ctx)[0];
    if (d.done || !cupid) return;
    // Cupidon n'a pas choisi à temps : le destin choisit pour lui.
    const [a, b] = shuffle(alivePlayers(ctx.state), ctx.rng);
    if (a && b) {
      d.done = true;
      tell(ctx, cupid.id, 'info', '💘 Temps écoulé : le destin a choisi les amoureux à votre place.');
      linkLovers(ctx, a.id, b.id, cupid.id);
    }
  },
});
