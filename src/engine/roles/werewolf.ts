import { alivePlayers, formatNames, playerName, tell, type Ctx, type PlayerState } from '../state.ts';
import { fail } from '../errors.ts';
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
type WolvesData = { votes: Record<string, string>; target: string | null; mode?: 'kill' | 'infect' };
const data = (ctx: Parameters<typeof stepData>[0]) => stepData<WolvesData>(ctx, WOLVES_STEP, () => ({ votes: {}, target: null }));

/** Loup Noir vivant qui n'a pas encore utilisé son infection. */
function infector(ctx: Ctx): PlayerState | undefined {
  return alivePlayers(ctx.state).find((p) => p.role === 'black_wolf' && !!p.roleData.infect);
}

registerNightStep({
  id: WOLVES_STEP,
  phase: 'WEREWOLF_PHASE',
  order: 30,
  roleIds: ['werewolf', 'white_wolf', 'black_wolf'],
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
      // Loup Noir (pouvoir disponible) : choix TUER / INFECTER, visible de toute la meute.
      options: infector(ctx)?.id === actor.id ? [{ id: 'kill', label: '🐺 TUER' }, { id: 'infect', label: '🖤 INFECTER' }] : undefined,
      info: {
        // mode null : le Loup Noir n'a pas encore choisi (TUER par défaut à la fin du temps).
        blackWolf: infector(ctx) ? { id: infector(ctx)!.id, name: infector(ctx)!.name, mode: d.mode ?? null } : null,
        packVotes: pack.map((w) => ({ wolfId: w.id, wolfName: w.name, targetId: d.votes[w.id] ?? null, targetName: d.votes[w.id] ? playerName(ctx.state, d.votes[w.id]) : null })),
      },
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor)!;
    const d = data(ctx);
    if (cmd.option === 'kill' || cmd.option === 'infect') {
      if (infector(ctx)?.id !== actor.id) fail('BAD_OPTION', 'Seul le Loup Noir peut infecter.');
      d.mode = cmd.option;
      if (!Array.isArray(cmd.targets) || cmd.targets.length === 0) return; // simple changement de mode
    }
    const [target] = validateTargets(cmd.targets, p.targets, 1, 1);
    d.votes[actor.id] = target;
  },
  isComplete(ctx) {
    const pack = this.actors(ctx);
    const d = data(ctx);
    if (pack.length === 0) return false;
    // Le Loup Noir qui peut encore infecter doit avoir choisi TUER ou INFECTER :
    // sinon la meute unanime fermerait la nuit avant qu'il ait pu choisir.
    if (infector(ctx) && !d.mode) return false;
    const chosen = pack.map((w) => d.votes[w.id]);
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
    const black = infector(ctx);
    if (d.target && black && d.mode === 'infect') {
      // INFECTION : la victime ne meurt pas, garde son rôle et rejoint secrètement la meute.
      const victim = ctx.state.players.find((p) => p.id === d.target)!;
      victim.infected = true;
      black.roleData.infect = false; // une seule fois dans toute la partie
      for (const w of pack) tell(ctx, w.id, 'wolves', `🖤 Le Loup Noir a infecté ${victim.name} : il rejoint secrètement la meute.`);
      tell(ctx, victim.id, 'infected', '🖤 Tu as été infecté par le Loup Noir. Tu gardes ton rôle et tes pouvoirs, mais tu joues désormais secrètement pour les Loups : dès la nuit prochaine, tu te réveilles avec la meute.');
    } else {
      if (d.target) ctx.state.night!.effects.push({ type: 'attack', target: d.target, source: 'wolves' });
      for (const w of pack) {
        tell(ctx, w.id, 'wolves', d.target ? `🐺 La meute a choisi de dévorer ${playerName(ctx.state, d.target)}.` : '🐺 La meute n’a désigné aucune victime cette nuit.');
      }
    }
    if (pack.length > 1 && leaders.length > 1) {
      for (const w of pack) tell(ctx, w.id, 'wolves', `Égalité entre ${formatNames(leaders.map((id) => playerName(ctx.state, id)))} : le sort a tranché.`);
    }
  },
});
