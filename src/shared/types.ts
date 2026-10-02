/**
 * Types partagés entre le serveur et les clients.
 *
 * Tout ce qui est dans ce fichier peut être envoyé au navigateur : aucun type
 * ici ne doit transporter d'information secrète d'un autre joueur.
 * L'état complet (secret) de la partie est défini dans `src/engine/state.ts`
 * et ne quitte jamais le serveur.
 */

export const PHASES = [
  'LOBBY',
  'ROLE_DISTRIBUTION',
  'NIGHT_START',
  'THIEF_PHASE',
  'CUPID_PHASE',
  'WEREWOLF_PHASE',
  'WHITE_WOLF_PHASE',
  'SEER_PHASE',
  'SALVATION_PHASE',
  'WITCH_PHASE',
  'NIGHT_RESOLUTION',
  'SUNRISE',
  'DEATH_LAST_WORD',
  'HUNTER_SHOT',
  'CAPTAIN_SUCCESSION',
  'CAPTAIN_ELECTION',
  'PLAYER_SPEECH',
  'FREE_DISCUSSION',
  'VOTING',
  'VOTE_RESULT',
  'DEATH_SEQUENCE',
  'WIN_CHECK',
  'GAME_OVER',
] as const;

export type PhaseId = (typeof PHASES)[number];

/** Moment de la journée, utile à la future interface animée (soleil / lune). */
export type SkyState = 'day' | 'sunset' | 'night' | 'moon' | 'dawn';

export type RoleId = string;
export type Team = 'village' | 'wolves' | 'white_wolf' | 'lovers' | 'none';
export type SeerResult = 'LOUP' | 'CIVIL';
export type DeathCause =
  | 'wolves'
  | 'white_wolf'
  | 'poison'
  | 'vote'
  | 'hunter'
  | 'heartbreak'
  | 'abandon';

export type GameStatus = 'lobby' | 'running' | 'finished';
export type ChatChannel = 'village' | 'wolves' | 'dead';
export type VoiceMode = 'open' | 'turn' | 'last_word' | 'wolves' | 'muted';
export type DurationPreset = 'normal' | 'fast';
export type TieRule = 'none' | 'random';

export interface Durations {
  roleReveal: number;
  nightStart: number;
  thief: number;
  cupid: number;
  werewolf: number;
  whiteWolf: number;
  seer: number;
  salvateur: number;
  witch: number;
  /** Durée min/max d'une phase nocturne "simulée" (rôle mort ou absent). */
  inactiveStepMin: number;
  inactiveStepMax: number;
  sunrise: number;
  lastWord: number;
  hunterShot: number;
  captainSuccession: number;
  captainElection: number;
  speech: number;
  freeDiscussion: number;
  voting: number;
  voteResult: number;
}

/** Réglages publics de la partie (choisis par l'Hôte dans le lobby). */
export interface GameSettings {
  maxPlayers: number;
  /** Nombre de cartes par rôle (hors villageois, qui complètent automatiquement). */
  roles: Record<RoleId, number>;
  captainEnabled: boolean;
  durationPreset: DurationPreset;
  durations: Durations;
  wolvesWinAtParity: boolean;
  whiteWolfSeerResult: SeerResult;
  witchCanSelfSave: boolean;
  witchBothPotionsSameNight: boolean;
  salvateurCanSelfProtect: boolean;
  salvateurSameTargetTwice: boolean;
  salvateurBlocksWhiteWolf: boolean;
  cupidWinsWithLovers: boolean;
  tieRule: TieRule;
  endVoteWhenAllVoted: boolean;
  /** Dévoiler qui a voté contre qui au moment du résultat. */
  revealVotes: boolean;
  revealRolesOnGameOver: boolean;
  /** Nombre de Loups-Garous réglé automatiquement selon le nombre de joueurs (5-8 → 2, 9-11 → 3, 12-18 → 4). */
  autoWolves: boolean;
  /** Joue les phases des rôles morts/absents avec une durée aléatoire (évite de révéler leur mort). */
  simulateInactiveSteps: boolean;
  /** Durée de déconnexion après laquelle un joueur en partie est considéré comme ayant abandonné. */
  abandonTimeoutMs: number;
  maxDays: number;
}

export interface AudioStatus {
  mic: boolean;
  speaker: boolean;
  connected: boolean;
  /** Diagnostic technique court (navigateur, connexion audio, octets envoyés/reçus). */
  diag?: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  /** Personnage choisi (cosmétique, voir shared/avatars.ts). */
  avatar: string;
  /** Test du son (déclaré par le joueur) : micro capté, haut-parleur confirmé, voix connectée. */
  audio: AudioStatus;
  isCaptain: boolean;
  isMe: boolean;
}

export interface RoleInfo {
  id: RoleId;
  name: string;
  emoji: string;
  team: Team;
  description: string;
  unique: boolean;
  distributable: boolean;
}

export interface TargetOption {
  id: string;
  label: string;
}

/**
 * Ce que le joueur peut faire maintenant. L'interface est générique :
 * elle affiche les cibles / options et renvoie une `ClientCommand`.
 * Le serveur revalide intégralement chaque commande.
 */
export interface ActionPrompt {
  action: string;
  title: string;
  description: string;
  targets: string[];
  minTargets: number;
  maxTargets: number;
  options?: TargetOption[];
  /** Le joueur a déjà soumis (il peut parfois encore modifier, voir `canChange`). */
  submitted: boolean;
  canChange: boolean;
  current?: string[];
  info?: Record<string, unknown>;
}

export interface ClientCommand {
  action: string;
  targets?: string[];
  option?: string;
}

export interface VoiceView {
  mode: VoiceMode;
  canSpeak: boolean;
  /** Joueurs à qui mon micro doit être transmis (vide si je ne peux pas parler). */
  speakTo: string[];
  /** Joueurs que j'ai le droit d'entendre en ce moment. */
  hearFrom: string[];
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  authorId: string;
  authorName: string;
  text: string;
  at: number;
}

export interface Announcement {
  id: string;
  at: number;
  kind: 'info' | 'death' | 'vote' | 'night' | 'day' | 'victory' | 'system';
  text: string;
}

export interface PrivateMessage {
  id: string;
  at: number;
  kind: 'role' | 'lover' | 'seer' | 'witch' | 'wolves' | 'thief' | 'death' | 'info';
  text: string;
}

export interface WinResult {
  camp: Team | 'draw';
  title: string;
  winnerIds: string[];
}

export interface PhaseView {
  id: PhaseId;
  seq: number;
  label: string;
  sky: SkyState;
  startedAt: number;
  endsAt: number | null;
  night: number;
  day: number;
  /** Joueur qui a la parole (tour de parole / dernière parole). */
  speakerId: string | null;
  speechOrder: string[] | null;
  /** Joueur concerné par la phase en cours (chasseur, capitaine mort…) — public par nature. */
  subjectId: string | null;
  canFinish: boolean;
  /** Résultat du vote du jour : qui a voté contre qui (si l'option est active). */
  votes: { voterId: string; targetId: string; weight: number }[] | null;
}

export interface MeView {
  id: string;
  name: string;
  alive: boolean;
  isHost: boolean;
  isCaptain: boolean;
  role: RoleInfo | null;
  lover: { id: string; name: string } | null;
  pack: { id: string; name: string; alive: boolean }[] | null;
  roleState: Record<string, unknown> | null;
}

export interface VoteView {
  open: boolean;
  kind: 'day' | 'captain';
  hasVoted: boolean;
  myVote: string | null;
}

/** Vue d'un joueur : la SEULE chose que le serveur envoie au navigateur. */
export interface PlayerView {
  serverNow: number;
  code: string;
  status: GameStatus;
  hostId: string;
  settings: GameSettings;
  /** Composition publique (cartes du jeu, y compris villageois de complément). */
  composition: Record<RoleId, number> | null;
  roleCatalog: RoleInfo[];
  phase: PhaseView;
  players: PublicPlayer[];
  me: MeView;
  prompt: ActionPrompt | null;
  vote: VoteView | null;
  voice: VoiceView;
  chats: Partial<Record<ChatChannel, ChatMessage[]>>;
  chatWrite: Record<ChatChannel, boolean>;
  announcements: Announcement[];
  privateLog: PrivateMessage[];
  winner: WinResult | null;
  /** MES étiquettes personnelles (id du joueur → texte). Jamais celles des autres joueurs. */
  myTags: Record<string, string>;
  /** Rôles révélés uniquement en fin de partie. */
  finalRoles: { id: string; role: RoleId; roleName: string; loverId: string | null }[] | null;
}
