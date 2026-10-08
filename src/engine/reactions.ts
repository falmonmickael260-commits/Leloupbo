/**
 * Réactions sociales pendant la parole : 🍅 tomate (« tu mens ») et 🌸 fleur (« je te crois »).
 *
 * Purement cosmétiques : aucun effet sur les votes, les rôles, les règles ou les statistiques.
 * Le SERVEUR tient les compteurs : 4 tomates et 4 fleurs par joueur et par tour de vote
 * (un tour = une journée, revote compris), remis à neuf automatiquement chaque jour.
 */
import { fail } from './errors.ts';
import { getPlayer, nextId, type Ctx, type GameState } from './state.ts';
import { voiceChannel } from './voice.ts';

export type ReactionKind = 'tomato' | 'flower';
export const REACTIONS_PER_ROUND = 4;
/** Délai minimal entre deux réactions d'un même joueur (anti double-clic / rafale). */
export const REACTION_COOLDOWN_MS = 700;
const MAX_FEED = 30;

export interface ReactionEvent {
  id: string;
  kind: ReactionKind;
  from: string;
  to: string;
  at: number;
}

export interface ReactionState {
  /** Journée à laquelle les compteurs se rapportent : un nouveau jour = compteurs neufs. */
  day: number;
  used: Record<string, { tomato: number; flower: number; lastAt: number }>;
  feed: ReactionEvent[];
}

/** Phases où quelqu'un a la parole devant le village. */
const PHASES = new Set(['PLAYER_SPEECH', 'DEATH_LAST_WORD', 'FREE_DISCUSSION', 'CAPTAIN_ELECTION']);

function current(state: GameState): ReactionState {
  if (!state.reactions || state.reactions.day !== state.dayNumber) {
    state.reactions = { day: state.dayNumber, used: {}, feed: state.reactions?.feed ?? [] };
  }
  return state.reactions;
}

/** Ce qu'il me reste, et à qui je peux envoyer (personnes qui ont la parole, sauf moi). */
export function reactionsFor(state: GameState, playerId: string) {
  const me = getPlayer(state, playerId);
  const r = state.reactions && state.reactions.day === state.dayNumber ? state.reactions.used[playerId] : undefined;
  const open = state.status === 'running' && PHASES.has(state.phase.id) && !!me?.alive;
  const targets = open ? voiceChannel(state).speakers.filter((id) => id !== playerId) : [];
  return {
    tomato: REACTIONS_PER_ROUND - (r?.tomato ?? 0),
    flower: REACTIONS_PER_ROUND - (r?.flower ?? 0),
    targets,
    feed: state.status === 'running' ? (state.reactions?.feed ?? []).slice(-MAX_FEED) : [],
  };
}

export function sendReaction(ctx: Ctx, playerId: string, kind: unknown, targetId: unknown): ReactionEvent {
  const s = ctx.state;
  if (kind !== 'tomato' && kind !== 'flower') fail('BAD_REACTION', 'Réaction inconnue.');
  const me = getPlayer(s, playerId);
  if (!me) fail('NOT_IN_GAME', 'Joueur inconnu.');
  if (s.status !== 'running' || !PHASES.has(s.phase.id)) fail('WRONG_PHASE', 'Réactions possibles seulement pendant la parole.');
  if (!me.alive) fail('DEAD', 'Les morts ne peuvent pas réagir.');
  if (typeof targetId !== 'string' || targetId === playerId) fail('BAD_TARGET', 'Impossible de réagir sur toi-même.');
  if (!voiceChannel(s).speakers.includes(targetId)) fail('BAD_TARGET', 'Ce joueur n’a pas la parole.');
  const st = current(s);
  const used = (st.used[playerId] ??= { tomato: 0, flower: 0, lastAt: 0 });
  if (used[kind] >= REACTIONS_PER_ROUND) fail('NO_REACTION_LEFT', kind === 'tomato' ? 'Plus de tomate pour ce tour.' : 'Plus de fleur pour ce tour.');
  if (ctx.now - used.lastAt < REACTION_COOLDOWN_MS) fail('TOO_FAST', 'Doucement !');
  used[kind] += 1;
  used.lastAt = ctx.now;
  const ev: ReactionEvent = { id: nextId(ctx, 'r'), kind, from: playerId, to: targetId, at: ctx.now };
  st.feed.push(ev);
  if (st.feed.length > MAX_FEED) st.feed.splice(0, st.feed.length - MAX_FEED);
  return ev;
}
