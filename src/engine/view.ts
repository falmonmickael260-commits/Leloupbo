/**
 * Projection de l'état secret vers la vue d'UN joueur (anti-triche).
 *
 * Principe de liste blanche : chaque champ envoyé est construit explicitement.
 * Ne sont jamais envoyés : rôles des autres, votes des autres, choix nocturnes
 * des autres, données internes de phase (dont le caractère "simulé" d'une étape),
 * messages privés des autres, jetons de session.
 */
import { isRunoffCandidate } from './votes.ts';
import type { ChatChannel, MeView, PhaseView, PlayerView, PublicPlayer } from '../shared/types.ts';
import { canRead, canWrite } from './chat.ts';
import { promptFor } from './commands.ts';
import { PHASE_LABELS, skyFor } from './phase.ts';
import { allRoles, getRole, isWolfPack, roleInfo } from './roles/index.ts';
import { getPlayer, type Ctx } from './state.ts';
import { voiceFor } from './voice.ts';
import { defaultAvatar } from '../shared/avatars.ts';

const CHANNELS: ChatChannel[] = ['village', 'wolves', 'dead'];
const MAX_ANNOUNCEMENTS = 60;
const MAX_CHAT_IN_VIEW = 100;

function phaseView(ctx: Ctx, playerId: string): PhaseView {
  const s = ctx.state;
  const ph = s.phase;
  let speakerId: string | null = null;
  let subjectId: string | null = null;
  if (ph.id === 'PLAYER_SPEECH') speakerId = (ph.data.speakerId as string) ?? null;
  if (ph.id === 'DEATH_LAST_WORD') speakerId = (ph.data.playerId as string) ?? null;
  if (ph.id === 'HUNTER_SHOT' || ph.id === 'CAPTAIN_SUCCESSION') subjectId = (ph.data.playerId as string) ?? null;
  return {
    id: ph.id,
    seq: ph.seq,
    label: PHASE_LABELS[ph.id],
    sky: skyFor(ph.id),
    startedAt: ph.startedAt,
    endsAt: ph.endsAt,
    night: s.nightNumber,
    day: s.dayNumber,
    speakerId,
    speechOrder: s.speech ? [...s.speech.order] : null,
    subjectId,
    canFinish: speakerId === playerId,
    votes: ph.id === 'VOTE_RESULT' && Array.isArray(ph.data.votes) ? (ph.data.votes as PhaseView['votes']) : null,
  };
}

function meView(ctx: Ctx, playerId: string): MeView {
  const s = ctx.state;
  const p = getPlayer(s, playerId)!;
  const def = getRole(p.role);
  const lover = getPlayer(s, p.loverId);
  const pack =
    s.status !== 'lobby' && isWolfPack(p)
      ? s.players.filter((x) => isWolfPack(x)).map((x) => ({ id: x.id, name: x.name, alive: x.alive }))
      : null;
  return {
    id: p.id,
    name: p.name,
    alive: p.alive,
    isHost: s.hostId === p.id,
    isCaptain: s.captainId === p.id,
    role: def ? roleInfo(def) : null,
    // L'amoureux connaît l'identité de son partenaire, jamais son rôle.
    lover: lover ? { id: lover.id, name: lover.name } : null,
    pack,
    roleState: def?.selfInfo?.(ctx, p) ?? null,
    infected: !!p.infected,
    runoffCandidate: isRunoffCandidate(s, p.id),
  };
}

export function buildView(ctx: Ctx, playerId: string): PlayerView {
  const s = ctx.state;
  const me = getPlayer(s, playerId);
  if (!me) throw new Error('Joueur inconnu');

  const players: PublicPlayer[] = [...s.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      alive: p.alive,
      connected: p.connected,
      isHost: s.hostId === p.id,
      isBot: p.isBot,
      isCaptain: s.captainId === p.id,
      isMe: p.id === playerId,
      avatar: p.avatar ?? defaultAvatar(p.seat),
      audio: { mic: !!p.audio?.mic, speaker: !!p.audio?.speaker, connected: !!p.audio?.connected, ...(s.status === 'lobby' && p.audio?.diag ? { diag: p.audio.diag } : {}) },
    }));

  const chats: PlayerView['chats'] = {};
  const chatWrite = { village: false, wolves: false, dead: false } as Record<ChatChannel, boolean>;
  for (const ch of CHANNELS) {
    if (canRead(s, playerId, ch)) chats[ch] = s.chats[ch].slice(-MAX_CHAT_IN_VIEW);
    chatWrite[ch] = canWrite(s, playerId, ch);
  }

  const ballot = s.ballot;
  const vote =
    ballot && (s.phase.id === 'VOTING' || s.phase.id === 'CAPTAIN_ELECTION')
      ? { open: true, kind: ballot.kind, hasVoted: !!ballot.ballots[playerId], myVote: ballot.ballots[playerId] ?? null }
      : null;

  const reveal = s.status === 'finished' && s.settings.revealRolesOnGameOver;

  return {
    serverNow: ctx.now,
    code: s.code,
    status: s.status,
    hostId: s.hostId,
    settings: s.settings,
    composition: s.composition,
    roleCatalog: allRoles().map(roleInfo),
    phase: phaseView(ctx, playerId),
    players,
    me: meView(ctx, playerId),
    prompt: promptFor(ctx, playerId),
    vote,
    voice: voiceFor(s, playerId),
    chats,
    chatWrite,
    announcements: s.announcements.slice(-MAX_ANNOUNCEMENTS),
    privateLog: [...(s.privateMessages[playerId] ?? [])],
    winner: s.winner,
    myTags: { ...(s.tags?.[playerId] ?? {}) },
    finalRoles: reveal
      ? s.players.map((p) => ({ id: p.id, role: p.role ?? 'villager', roleName: getRole(p.role)?.name ?? '?', loverId: p.loverId, infected: !!p.infected }))
      : null,
    nightLog: reveal ? [...(s.nightLog ?? [])] : null,
    lastNightLog: s.status === 'lobby' && s.lastNightLog?.length && s.settings.revealRolesOnGameOver ? [...s.lastNightLog] : null,
  };
}
