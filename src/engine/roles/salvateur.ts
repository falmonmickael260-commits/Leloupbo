import { alivePlayers, playerName, tell } from '../state.ts';
import { playersWithRole, registerNightStep, registerRole, stepData, validateTargets } from './registry.ts';

registerRole({
  id: 'salvateur',
  name: 'Salvateur',
  emoji: '🛡️',
  team: 'village',
  description: 'Chaque nuit, il protège un joueur de l’attaque des Loups. Jamais deux fois de suite la même personne.',
  unique: true,
  distributable: true,
  seerResult: () => 'CIVIL',
  initRoleData: () => ({ lastProtected: null }),
});

const STEP = 'salvateur';
type D = { done: boolean; target: string | null };
const data = (ctx: Parameters<typeof stepData>[0]) => stepData<D>(ctx, STEP, () => ({ done: false, target: null }));

registerNightStep({
  id: STEP,
  phase: 'SALVATION_PHASE',
  order: 60,
  roleIds: ['salvateur'],
  duration: (s) => s.durations.salvateur,
  isScheduled: () => true,
  actors: (ctx) => playersWithRole(ctx.state, 'salvateur'),
  prompt(ctx, actor) {
    if (data(ctx).done) return null;
    const s = ctx.state.settings;
    const last = actor.roleData.lastProtected as string | null;
    const targets = alivePlayers(ctx.state)
      .filter((p) => s.salvateurCanSelfProtect || p.id !== actor.id)
      .filter((p) => s.salvateurSameTargetTwice || p.id !== last)
      .map((p) => p.id);
    return {
      action: 'protect',
      title: '🛡️ Protéger un joueur',
      description: last && !s.salvateurSameTargetTwice ? `Vous ne pouvez pas protéger ${playerName(ctx.state, last)} deux nuits de suite.` : 'Le joueur choisi sera protégé de l’attaque des Loups.',
      targets,
      minTargets: 1,
      maxTargets: 1,
      submitted: false,
      canChange: false,
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor);
    if (!p) return;
    const [target] = validateTargets(cmd.targets, p.targets, 1, 1);
    const d = data(ctx);
    d.done = true;
    d.target = target;
    const against: ('wolves' | 'white_wolf')[] = ctx.state.settings.salvateurBlocksWhiteWolf ? ['wolves', 'white_wolf'] : ['wolves'];
    ctx.state.night!.effects.push({ type: 'protect', target, against });
    tell(ctx, actor.id, 'info', `🛡️ Vous protégez ${playerName(ctx.state, target)} cette nuit.`);
  },
  isComplete: (ctx) => data(ctx).done,
  onEnd(ctx) {
    for (const s of playersWithRole(ctx.state, 'salvateur')) s.roleData.lastProtected = data(ctx).target;
  },
});
