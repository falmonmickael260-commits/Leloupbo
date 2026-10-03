/**
 * État COMPLET d'une partie (secret). Ne quitte jamais le serveur :
 * le navigateur ne reçoit que la projection calculée dans `view.ts`.
 *
 * L'état est un objet JSON pur (aucune classe, aucune fonction) afin de
 * pouvoir être persisté puis rechargé à l'identique (reprise après redémarrage).
 */
import type {
  AudioStatus,
  Announcement,
  ChatChannel,
  ChatMessage,
  DeathCause,
  GameSettings,
  GameStatus,
  PhaseId,
  PrivateMessage,
  RoleId,
  WinResult,
} from '../shared/types.ts';
import type { Rng } from './rng.ts';

export const STATE_VERSION = 1;

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  tokenHash: string;
  isBot: boolean;
  /** Personnage choisi (cosmétique). */
  avatar?: string;
  /** Test du son déclaré par le joueur (cosmétique). */
  audio?: AudioStatus;
  joinedAt: number;
  connected: boolean;
  disconnectedAt: number | null;
  role: RoleId | null;
  originalRole: RoleId | null;
  alive: boolean;
  deathCause: DeathCause | null;
  abandoned: boolean;
  loverId: string | null;
  /** Données persistantes propres au rôle (potions, dernière protection…). */
  roleData: Record<string, unknown>;
}

export type NightEffect =
  | { type: 'attack'; target: string; source: 'wolves' | 'white_wolf' }
  | { type: 'protect'; target: string; against: ('wolves' | 'white_wolf')[] }
  | { type: 'save'; target: string; against: ('wolves' | 'white_wolf')[] }
  | { type: 'kill'; target: string; source: 'poison' };

export interface NightState {
  number: number;
  /** Données privées de chaque étape nocturne, indexées par id d'étape. */
  stepData: Record<string, Record<string, unknown>>;
  /** Effets produits par les rôles, résolus en fin de nuit (ActionResolver). */
  effects: NightEffect[];
  /** Morts survenues pendant la nuit hors résolution (abandon, chagrin) à annoncer au lever. */
  extraDeaths: string[];
}

export type DeathTask =
  | { kind: 'last_word'; playerId: string }
  | { kind: 'hunter_shot'; playerId: string }
  | { kind: 'captain_succession'; playerId: string };

export interface PhaseState {
  id: PhaseId;
  seq: number;
  startedAt: number;
  endsAt: number | null;
  /** Données internes de la phase — PEUVENT être secrètes, jamais envoyées telles quelles. */
  data: Record<string, unknown>;
}

export interface BallotBox {
  kind: 'day' | 'captain';
  ballots: Record<string, string>;
}

export interface GameState {
  version: number;
  code: string;
  createdAt: number;
  updatedAt: number;
  hostId: string;
  status: GameStatus;
  settings: GameSettings;
  players: PlayerState[];
  /** Cartes distribuées + cartes du Voleur (publiques en tant que composition). */
  composition: Record<RoleId, number> | null;
  extraCards: RoleId[];
  phase: PhaseState;
  nightNumber: number;
  dayNumber: number;
  night: NightState | null;
  captainId: string | null;
  captainElectionDone: boolean;
  speech: { order: string[]; index: number } | null;
  speechRotation: number;
  ballot: BallotBox | null;
  deathQueue: DeathTask[];
  /** Où reprendre une fois la séquence de morts terminée. */
  pipelineNext: 'DAY' | 'NIGHT' | null;
  announcements: Announcement[];
  privateMessages: Record<string, PrivateMessage[]>;
  chats: Record<ChatChannel, ChatMessage[]>;
  winner: WinResult | null;
  counter: number;
  /** Étiquettes personnelles : auteur → (joueur étiqueté → texte). Privées : chacun ne reçoit que les siennes. */
  tags?: Record<string, Record<string, string>>;
  /** Rôle de chaque joueur à la partie précédente du même lobby (pour varier les rôles). Secret. */
  previousRoles?: Record<string, RoleId>;
  /** Égalité au vote du jour : les ex æquo reprennent la parole puis le village revote entre eux. */
  runoff?: { candidates: string[]; stage: 'pending' | 'speech' | 'voting' } | null;
}

/** Contexte d'exécution d'une opération du moteur. */
export interface Ctx {
  state: GameState;
  now: number;
  rng: Rng;
}

const MAX_LOG = 200;
const MAX_CHAT = 300;

export function nextId(ctx: Ctx, prefix: string): string {
  ctx.state.counter += 1;
  return `${prefix}${ctx.state.counter.toString(36)}`;
}

export function getPlayer(state: GameState, id: string | null | undefined): PlayerState | undefined {
  if (!id) return undefined;
  return state.players.find((p) => p.id === id);
}

export function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.alive);
}

export function playerName(state: GameState, id: string | null | undefined): string {
  return getPlayer(state, id)?.name ?? '???';
}

export function formatNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

export function announce(ctx: Ctx, kind: Announcement['kind'], text: string): void {
  const list = ctx.state.announcements;
  list.push({ id: nextId(ctx, 'a'), at: ctx.now, kind, text });
  if (list.length > MAX_LOG) list.splice(0, list.length - MAX_LOG);
}

export function tell(ctx: Ctx, playerId: string, kind: PrivateMessage['kind'], text: string): void {
  const map = ctx.state.privateMessages;
  const list = (map[playerId] ??= []);
  list.push({ id: nextId(ctx, 'm'), at: ctx.now, kind, text });
  if (list.length > MAX_LOG) list.splice(0, list.length - MAX_LOG);
}

export function pushChat(ctx: Ctx, channel: ChatChannel, authorId: string, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: nextId(ctx, 'c'),
    channel,
    authorId,
    authorName: playerName(ctx.state, authorId),
    text,
    at: ctx.now,
  };
  const list = ctx.state.chats[channel];
  list.push(msg);
  if (list.length > MAX_CHAT) list.splice(0, list.length - MAX_CHAT);
  return msg;
}
