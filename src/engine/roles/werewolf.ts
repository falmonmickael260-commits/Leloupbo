import { alivePlayers, formatNames, playerName, tell } from '../state.ts';
import { tally } from '../tally.ts';
import { shuffle } from '../rng.ts';
import { isWolfPack, registerNightStep, registerRole, stepData, validateTargets } from './registry.ts';

registerRole({
  id: 'werewolf',
  name: 'Loup-Garou',
  emoji: '🐺',
  team: 'wolves',
  description: 'Chaque nuit, la meute se réveille et dévore un villageois. Le jour, il se cache parmi eux.',
  unique: false,
  distributable: true,
  wolfPack: true,
  seerResult: () => 'LOUP',
});

export const WOLVES_STEP = 'werewolves';
type WolvesData = { votes: Record<string, string>; target: string | null };
const data = (ctx: Parameters<typeof stepData>[0]) => stepData<WolvesData>(ctx, WOLVES_STEP, () => ({ votes: {}, target: null }));

registerNightStep({
  id: WOLVES_STEP,
  phase: 'WEREWOLF_PHASE',
  order: 30,
  roleIds: ['werewolf', 'white_wolf'],
  duration: (s) => s.durations.werewolf,
  isScheduled: () => true,
  actors: (ctx) => alivePlayers(ctx.state).filter(isWolfPack),
  prompt(ctx, actor) {
    const d = data(ctx);
    const pack = this.actors(ctx);
    const targets = alivePlayers(ctx.state).filter((p) => !isWolfPack(p)).map((p) => p.id);
    return {
      action: 'wolf_vote',
      title: '🐺 Choisissez votre victime',
      description: 'Mettez-vous d’accord avec la meute. Le choix est validé quand tous les loups désignent la même cible, ou à la fin du temps (majorité).',
      targets,
      minTargets: 1,
      maxTargets: 1,
      submitted: !!d.votes[actor.id],
      canChange: true,
      current: d.votes[actor.id] ? [d.votes[actor.id]] : [],
      info: {
        packVotes: pack.map((w) => ({ wolfId: w.id, wolfName: w.name, targetId: d.votes[w.id] ?? null, targetName: d.votes[w.id] ? playerName(ctx.state, d.votes[w.id]) : null })),
      },
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor)!;
    const [target] = validateTargets(cmd.targets, p.targets, 1, 1);
    data(ctx).votes[actor.id] = target;
  },
  isComplete(ctx) {
    const pack = this.actors(ctx);
    const votes = data(ctx).votes;
    if (pack.length === 0) return false;
    const chosen = pack.map((w) => votes[w.id]);
    return chosen.every((t) => t && t === chosen[0]);
  },
  onEnd(ctx) {
    const d = data(ctx);
    const pack = this.actors(ctx);
    const valid: Record<string, string> = {};
    for (const w of pack) {
      const t = d.votes[w.id];
      if (t && ctx.state.players.find((p) => p.id === t && p.alive && !isWolfPack(p))) valid[w.id] = t;
    }
    const { leaders } = tally(valid);
    d.target = leaders.length ? shuffle(leaders, ctx.rng)[0] : null;
    if (d.target) ctx.state.night!.effects.push({ type: 'attack', target: d.target, source: 'wolves' });
    for (const w of pack) {
      tell(ctx, w.id, 'wolves', d.target ? `🐺 La meute a choisi de dévorer ${playerName(ctx.state, d.target)}.` : '🐺 La meute n’a désigné aucune victime cette nuit.');
    }
    if (pack.length > 1 && leaders.length > 1) {
      for (const w of pack) tell(ctx, w.id, 'wolves', `Égalité entre ${formatNames(leaders.map((id) => playerName(ctx.state, id)))} : le sort a tranché.`);
    }
  },
});
