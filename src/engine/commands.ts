/**
 * ActionResolver côté commandes : chaque intention envoyée par un client est
 * validée ici (phase, rôle, vivant, cible) avant d'être appliquée.
 */
import type { ActionPrompt, ClientCommand } from '../shared/types.ts';
import { kill } from './deaths.ts';
import { fail } from './errors.ts';
import { currentNightStep, finishPhase, isActiveNightStep, runPipeline, setCaptain } from './flow.ts';
import { validateTargets } from './roles/index.ts';
import { alivePlayers, announce, getPlayer, playerName, type Ctx } from './state.ts';
import { allVoted, castVote, isRunoffCandidate, voteTargets } from './votes.ts';

/** Le client ne peut envoyer qu'un objet simple et borné. */
export function sanitizeCommand(raw: unknown): ClientCommand {
  if (!raw || typeof raw !== 'object') fail('BAD_COMMAND', 'Commande invalide.');
  const r = raw as Record<string, unknown>;
  if (typeof r.action !== 'string' || r.action.length > 32) fail('BAD_COMMAND', 'Commande invalide.');
  const cmd: ClientCommand = { action: r.action };
  if (r.targets !== undefined) {
    if (!Array.isArray(r.targets) || r.targets.length > 18 || r.targets.some((t) => typeof t !== 'string' || t.length > 64))
      fail('BAD_COMMAND', 'Cibles invalides.');
    cmd.targets = r.targets as string[];
  }
  if (r.option !== undefined) {
    if (typeof r.option !== 'string' || r.option.length > 32) fail('BAD_COMMAND', 'Option invalide.');
    cmd.option = r.option;
  }
  return cmd;
}

/** Action proposée au joueur maintenant (null si rien à faire). */
export function promptFor(ctx: Ctx, playerId: string): ActionPrompt | null {
  const s = ctx.state;
  const p = getPlayer(s, playerId);
  if (!p || s.status !== 'running') return null;
  const ph = s.phase;

  if (isActiveNightStep(ctx)) {
    const step = currentNightStep(ctx)!;
    if (!p.alive || !step.actors(ctx).some((a) => a.id === p.id)) return null;
    return step.prompt(ctx, p);
  }

  switch (ph.id) {
    case 'HUNTER_SHOT':
      if (ph.data.playerId !== p.id || ph.data.done) return null;
      return {
        action: 'hunter_shot',
        title: '🏹 Votre dernier tir',
        description: 'Choisissez un joueur à emporter avec vous, ou ne tirez pas.',
        targets: alivePlayers(s).map((x) => x.id),
        minTargets: 0,
        maxTargets: 1,
        submitted: false,
        canChange: false,
      };
    case 'CAPTAIN_SUCCESSION':
      if (ph.data.playerId !== p.id || ph.data.done) return null;
      return {
        action: 'captain_successor',
        title: '👑 Désignez votre successeur',
        description: 'Transmettez l’écharpe de Capitaine à un joueur vivant.',
        targets: alivePlayers(s).map((x) => x.id),
        minTargets: 1,
        maxTargets: 1,
        submitted: false,
        canChange: false,
      };
    case 'VOTING':
    case 'CAPTAIN_ELECTION': {
      if (!p.alive || !s.ballot) return null;
      if (isRunoffCandidate(s, p.id)) return null; // ex æquo : il ne vote pas au revote
      const mine = s.ballot.ballots[p.id];
      const captain = s.ballot.kind === 'captain';
      return {
        action: 'vote',
        title: captain ? '👑 Élisez le Capitaine' : s.runoff?.stage === 'voting' ? '⚖️ Revote entre les ex æquo' : '⚖️ Vote secret',
        description: captain
          ? 'Votre vote est secret. Vous pouvez le modifier jusqu’à la fin.'
          : s.runoff?.stage === 'voting'
            ? 'Égalité au premier vote : choisissez entre les joueurs à égalité.'
            : 'Cliquez sur la personne que vous soupçonnez. Personne ne verra votre vote.',
        targets: voteTargets(s, p.id),
        minTargets: 1,
        maxTargets: 1,
        submitted: !!mine,
        canChange: true,
        current: mine ? [mine] : [],
      };
    }
    default:
      return null;
  }
}

export function handleCommand(ctx: Ctx, playerId: string, raw: unknown): void {
  const s = ctx.state;
  const cmd = sanitizeCommand(raw);
  const p = getPlayer(s, playerId);
  if (!p) fail('NOT_IN_GAME', 'Joueur inconnu.');
  if (s.status !== 'running') fail('NOT_RUNNING', 'La partie n’est pas en cours.');
  const ph = s.phase;

  // Fin anticipée d'un temps de parole (bouton FINIR).
  if (cmd.action === 'finish') {
    const speaker = ph.id === 'PLAYER_SPEECH' ? ph.data.speakerId : ph.id === 'DEATH_LAST_WORD' ? ph.data.playerId : null;
    if (!speaker || speaker !== p.id) fail('NOT_YOUR_TURN', 'Ce n’est pas votre temps de parole.');
    finishPhase(ctx);
    return;
  }

  const prompt = promptFor(ctx, p.id);
  if (!prompt) fail('NOT_YOUR_TURN', 'Aucune action possible pour vous maintenant.');
  if (prompt.action !== cmd.action) fail('BAD_COMMAND', 'Action inattendue pour cette phase.');
  if (prompt.submitted && !prompt.canChange) fail('ALREADY_DONE', 'Action déjà effectuée.');

  if (isActiveNightStep(ctx)) {
    const step = currentNightStep(ctx)!;
    step.handle(ctx, p, cmd);
    if (step.isComplete(ctx)) finishPhase(ctx);
    return;
  }

  switch (ph.id) {
    case 'HUNTER_SHOT': {
      const [target] = validateTargets(cmd.targets, prompt.targets, 0, 1);
      ph.data.done = true;
      if (target) {
        announce(ctx, 'death', `🏹 Dans un dernier souffle, ${p.name} abat ${playerName(s, target)}.`);
        kill(ctx, target, 'hunter');
      } else announce(ctx, 'death', `🏹 ${p.name} baisse son arme et ne tire pas.`);
      runPipeline(ctx);
      return;
    }
    case 'CAPTAIN_SUCCESSION': {
      const [target] = validateTargets(cmd.targets, prompt.targets, 1, 1);
      ph.data.done = true;
      setCaptain(ctx, target, 'successor');
      runPipeline(ctx);
      return;
    }
    case 'VOTING':
    case 'CAPTAIN_ELECTION':
      castVote(ctx, p.id, cmd.targets);
      if (ph.id === 'VOTING' && s.settings.endVoteWhenAllVoted && allVoted(s)) finishPhase(ctx);
      return;
    default:
      fail('NOT_YOUR_TURN', 'Aucune action possible pour vous maintenant.');
  }
}
