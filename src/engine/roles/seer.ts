import { alivePlayers, playerName, tell } from '../state.ts';
import { getRole, playersWithRole, registerNightStep, registerRole, stepData, validateTargets } from './registry.ts';

registerRole({
  id: 'seer',
  name: 'Voyante',
  emoji: '🔮',
  team: 'village',
  description: 'Chaque nuit, elle sonde un joueur et apprend s’il est LOUP ou CIVIL.',
  unique: true,
  distributable: true,
  seerResult: () => 'CIVIL',
});

const STEP = 'seer';
type D = { done: boolean };
const data = (ctx: Parameters<typeof stepData>[0]) => stepData<D>(ctx, STEP, () => ({ done: false }));

registerNightStep({
  id: STEP,
  phase: 'SEER_PHASE',
  order: 50,
  roleIds: ['seer'],
  duration: (s) => s.durations.seer,
  isScheduled: () => true,
  actors: (ctx) => playersWithRole(ctx.state, 'seer'),
  prompt(ctx, actor) {
    if (data(ctx).done) return null;
    return {
      action: 'seer',
      title: '🔮 Sonder un joueur',
      description: 'Choisissez un joueur vivant. Vous saurez seulement s’il est LOUP ou CIVIL.',
      targets: alivePlayers(ctx.state).filter((p) => p.id !== actor.id).map((p) => p.id),
      minTargets: 1,
      maxTargets: 1,
      submitted: false,
      canChange: false,
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor);
    if (!p) return;
    const [targetId] = validateTargets(cmd.targets, p.targets, 1, 1);
    const target = ctx.state.players.find((x) => x.id === targetId)!;
    // Calcul exclusivement côté serveur : seul LOUP / CIVIL est transmis.
    const result = getRole(target.role)?.seerResult(ctx.state.settings) ?? 'CIVIL';
    data(ctx).done = true;
    tell(ctx, actor.id, 'seer', `🔮 ${playerName(ctx.state, targetId)} : ${result}`);
  },
  isComplete: (ctx) => data(ctx).done,
});
