/**
 * VoteManager : votes secrets (jour et élection du Capitaine).
 * Les bulletins restent dans l'état serveur ; la vue d'un joueur ne contient
 * que SON propre vote. Aucun compteur intermédiaire n'est jamais exposé.
 */
import { fail } from './errors.ts';
import { shuffle } from './rng.ts';
import { alivePlayers, getPlayer, type Ctx, type GameState } from './state.ts';
import { tally } from './tally.ts';

export function voteTargets(state: GameState, voterId: string): string[] {
  const kind = state.ballot?.kind;
  return alivePlayers(state)
    .filter((p) => kind === 'captain' || p.id !== voterId)
    .map((p) => p.id);
}

export function castVote(ctx: Ctx, voterId: string, targets: unknown): void {
  const s = ctx.state;
  if (!s.ballot) fail('NO_VOTE', 'Aucun vote en cours.');
  const voter = getPlayer(s, voterId);
  if (!voter || !voter.alive) fail('FORBIDDEN', 'Seuls les joueurs vivants votent.');
  if (!Array.isArray(targets) || targets.length !== 1 || typeof targets[0] !== 'string') fail('BAD_TARGET', 'Vote invalide.');
  const target = targets[0] as string;
  if (!voteTargets(s, voterId).includes(target)) fail('BAD_TARGET', 'Cible non autorisée.');
  s.ballot.ballots[voterId] = target;
}

export function allVoted(state: GameState): boolean {
  if (!state.ballot) return false;
  return alivePlayers(state).every((p) => state.ballot!.ballots[p.id]);
}

/** Bulletins valides : votant et cible toujours vivants. */
function validBallots(state: GameState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [voter, target] of Object.entries(state.ballot?.ballots ?? {})) {
    if (getPlayer(state, voter)?.alive && getPlayer(state, target)?.alive) out[voter] = target;
  }
  return out;
}

/** Dépouillement du vote du jour. Voix du Capitaine doublée. */
export function countDayVote(ctx: Ctx): { eliminated: string | null; tie: string[] } {
  const s = ctx.state;
  const { leaders } = tally(validBallots(s), (voter) => (voter === s.captainId ? 2 : 1));
  if (leaders.length === 1) return { eliminated: leaders[0], tie: [] };
  if (leaders.length > 1 && s.settings.tieRule === 'random') return { eliminated: shuffle(leaders, ctx.rng)[0], tie: leaders };
  return { eliminated: null, tie: leaders };
}

/** Dépouillement de l'élection du Capitaine (égalité ou absence de vote : tirage au sort). */
export function countCaptainVote(ctx: Ctx): string | null {
  const { leaders } = tally(validBallots(ctx.state));
  const pool = leaders.length ? leaders : alivePlayers(ctx.state).map((p) => p.id);
  return pool.length ? shuffle(pool, ctx.rng)[0] : null;
}
