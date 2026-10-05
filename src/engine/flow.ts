/**
 * PhaseManager : machine d'état de la partie.
 *
 * Chaque phase a une durée pilotée par le serveur (`phase.endsAt`). Quand le
 * timer expire (ou qu'une phase est terminée en avance), `finishPhase` calcule
 * la phase suivante. Aucune transition n'est jamais décidée par un client.
 *
 *  ROLE_DISTRIBUTION → NIGHT_START → [étapes nocturnes] → NIGHT_RESOLUTION → SUNRISE
 *  → (DEATH_LAST_WORD / HUNTER_SHOT / CAPTAIN_SUCCESSION)* → WIN_CHECK
 *  → [CAPTAIN_ELECTION] → PLAYER_SPEECH* → FREE_DISCUSSION → VOTING → VOTE_RESULT
 *  → DEATH_SEQUENCE → (morts)* → WIN_CHECK → NIGHT_START …  → GAME_OVER
 */
import type { WinResult } from '../shared/types.ts';
import { isNightPhase, kill, resolveNightEffects } from './deaths.ts';
import { returnToLobby } from './lobby.ts';
import { enterPhase } from './phase.ts';
import { shuffle } from './rng.ts';
import { getNightStep, getRole, nightSteps, type NightStep } from './roles/index.ts';
import { buildSpeechOrder } from './speech.ts';
import { alivePlayers, announce, formatNames, getPlayer, logNight, playerName, who, type Ctx } from './state.ts';
import { countCaptainVote, countDayVote, validBallots } from './votes.ts';
import { checkWin } from './win.ts';

const MAX_TRANSITIONS = 100;

// ---------------------------------------------------------------- Nuit

export function startNight(ctx: Ctx): void {
  const s = ctx.state;
  s.nightNumber += 1;
  s.night = { number: s.nightNumber, stepData: {}, effects: [], extraDeaths: [] };
  s.speech = null;
  s.ballot = null;
  announce(ctx, 'night', `🌙 Nuit ${s.nightNumber} — le village s’endort.`);
  enterPhase(ctx, 'NIGHT_START', s.settings.durations.nightStart);
}

function stepInComposition(ctx: Ctx, step: NightStep): boolean {
  const comp = ctx.state.composition ?? {};
  return step.roleIds.some((r) => (comp[r] ?? 0) > 0);
}

function randomBetween(ctx: Ctx, min: number, max: number): number {
  return min + ctx.rng.int(Math.max(1, max - min + 1));
}

/** Passe à la prochaine étape nocturne planifiée, ou résout la nuit. */
function nextNightStep(ctx: Ctx, afterOrder: number): void {
  const s = ctx.state;
  for (const step of nightSteps()) {
    if (step.order <= afterOrder) continue;
    if (!stepInComposition(ctx, step) || !step.isScheduled(ctx)) continue;
    const active = step.actors(ctx).length > 0;
    // Rôle mort (ou sans action possible) : son tour est sauté, sans compte à rebours.
    if (!active) continue;
    const d = s.settings.durations;
    const duration = active ? step.duration(s.settings) : randomBetween(ctx, d.inactiveStepMin, d.inactiveStepMax);
    // `inactive` est un secret : la vue ne l'expose jamais.
    enterPhase(ctx, step.phase, duration, { stepId: step.id, inactive: !active });
    if (active) step.onStart?.(ctx);
    return;
  }
  resolveNight(ctx);
}

export function currentNightStep(ctx: Ctx): NightStep | undefined {
  const stepId = ctx.state.phase.data.stepId;
  if (typeof stepId !== 'string' || !ctx.state.night) return undefined;
  return getNightStep(stepId);
}

export function isActiveNightStep(ctx: Ctx): boolean {
  return !!currentNightStep(ctx) && !ctx.state.phase.data.inactive;
}

function resolveNight(ctx: Ctx): void {
  const s = ctx.state;
  enterPhase(ctx, 'NIGHT_RESOLUTION', null);
  const before = new Set(alivePlayers(s).map((p) => p.id));
  // Journal des nuits (révélé en fin de partie) : ce que chacun a fait.
  const W = (id: string) => who(s, id, (r) => getRole(r)?.name ?? '?');
  for (const e of s.night?.effects ?? []) {
    if (e.type === 'attack') logNight(ctx, `${e.source === 'wolves' ? '🐺 Les Loups attaquent' : '🐺 Le Loup Blanc attaque'} ${W(e.target)}.`);
    if (e.type === 'protect') logNight(ctx, `🛡️ Le Salvateur protège ${W(e.target)}.`);
    if (e.type === 'save') logNight(ctx, `🧪 La Sorcière sauve ${W(e.target)} (potion de vie).`);
    if (e.type === 'kill') logNight(ctx, `☠️ La Sorcière empoisonne ${W(e.target)}.`);
  }
  // Ordre mélangé : l'ordre d'annonce ne révèle pas la cause des morts.
  for (const d of shuffle(resolveNightEffects(ctx), ctx.rng)) kill(ctx, d.target, d.cause);
  const died = s.players.filter((p) => before.has(p.id) && !p.alive).map((p) => p.id);
  const all = [...new Set([...(s.night?.extraDeaths ?? []), ...died])];
  logNight(ctx, all.length ? `→ ${all.map((id) => playerName(s, id)).join(', ')} ${all.length > 1 ? 'meurent' : 'meurt'}.` : '→ Personne ne meurt.');

  s.dayNumber = s.nightNumber;
  s.pipelineNext = 'DAY';
  enterPhase(ctx, 'SUNRISE', s.settings.durations.sunrise);
  announce(ctx, 'day', `☀️ Jour ${s.dayNumber} — le village se réveille.`);
  if (all.length === 0) announce(ctx, 'death', '🌅 Personne n’est mort cette nuit.');
  else {
    const names = all.map((id) => playerName(s, id));
    // Le rôle des morts n'est PAS révélé.
    announce(ctx, 'death', `💀 ${formatNames(names)} ${all.length > 1 ? 'sont morts' : 'est mort'} cette nuit.`);
  }
}

// ---------------------------------------------------------------- Séquence de morts

/** Traite la file des morts (dernières paroles, tirs, successions) puis vérifie la victoire. */
export function runPipeline(ctx: Ctx): void {
  const s = ctx.state;
  const d = s.settings.durations;
  while (s.deathQueue.length > 0) {
    // Partie gagnée : fin immédiate (pas de dernière parole ni de discussion), sauf un tir du
    // Chasseur en attente, qui peut encore changer le vainqueur.
    if (checkWin(ctx)) {
      if (!s.deathQueue.some((t) => t.kind === 'hunter_shot')) {
        s.deathQueue.length = 0;
        break;
      }
      s.deathQueue = s.deathQueue.filter((t) => t.kind === 'hunter_shot');
    }
    const task = s.deathQueue.shift()!;
    const p = getPlayer(s, task.playerId);
    if (!p || p.abandoned) {
      if (task.kind === 'captain_succession') randomCaptain(ctx);
      continue;
    }
    if (task.kind === 'last_word') {
      if (!p.connected && !p.isBot) continue; // absent : pas de dernière parole
      enterPhase(ctx, 'DEATH_LAST_WORD', d.lastWord, { playerId: p.id });
      return;
    }
    if (task.kind === 'hunter_shot') {
      if (alivePlayers(s).length === 0) continue;
      announce(ctx, 'death', `🏹 ${p.name} épaule son fusil pour un dernier tir…`);
      enterPhase(ctx, 'HUNTER_SHOT', d.hunterShot, { playerId: p.id, done: false });
      return;
    }
    if (task.kind === 'captain_succession') {
      if (alivePlayers(s).length === 0) continue;
      if (!p.connected && !p.isBot) {
        randomCaptain(ctx);
        continue;
      }
      enterPhase(ctx, 'CAPTAIN_SUCCESSION', d.captainSuccession, { playerId: p.id, done: false });
      return;
    }
  }
  enterPhase(ctx, 'WIN_CHECK', null);
  const win = checkWin(ctx);
  if (win) return endGame(ctx, win);
  const next = s.pipelineNext;
  s.pipelineNext = null;
  if (next === 'DAY') startDay(ctx);
  else startNight(ctx);
}

export function setCaptain(ctx: Ctx, id: string, reason: 'elected' | 'successor' | 'random'): void {
  ctx.state.captainId = id;
  const name = playerName(ctx.state, id);
  const text = reason === 'elected' ? `👑 ${name} est élu(e) Capitaine.` : reason === 'successor' ? `👑 ${name} reçoit l’écharpe de Capitaine.` : `👑 Le sort désigne ${name} comme nouveau Capitaine.`;
  announce(ctx, 'info', text);
}

export function randomCaptain(ctx: Ctx): void {
  const alive = alivePlayers(ctx.state);
  if (alive.length) setCaptain(ctx, shuffle(alive, ctx.rng)[0].id, 'random');
}

// ---------------------------------------------------------------- Jour

function startDay(ctx: Ctx): void {
  const s = ctx.state;
  s.night = null;
  if (s.settings.captainEnabled && !s.captainId && !s.captainElectionDone && alivePlayers(s).length >= 2) {
    s.ballot = { kind: 'captain', ballots: {} };
    announce(ctx, 'vote', '👑 Le village doit élire son Capitaine. Discutez puis votez.');
    enterPhase(ctx, 'CAPTAIN_ELECTION', s.settings.durations.captainElection);
    return;
  }
  startSpeeches(ctx);
}

function startSpeeches(ctx: Ctx): void {
  const s = ctx.state;
  s.speech = { order: buildSpeechOrder(s), index: -1 };
  s.speechRotation += 1;
  advanceSpeaker(ctx);
}

/** Donne la parole au prochain joueur vivant et connecté (le client ne peut jamais choisir). */
function advanceSpeaker(ctx: Ctx): void {
  const s = ctx.state;
  const sp = s.speech;
  if (sp) {
    sp.index += 1;
    while (sp.index < sp.order.length) {
      const p = getPlayer(s, sp.order[sp.index]);
      if (p && p.alive && (p.connected || p.isBot)) break;
      sp.index += 1;
    }
    if (sp.index < sp.order.length) {
      enterPhase(ctx, 'PLAYER_SPEECH', s.settings.durations.speech, { speakerId: sp.order[sp.index] });
      return;
    }
  }
  s.speech = null;
  // Égalité : après la parole des ex æquo, on revote directement entre eux.
  if (s.runoff?.stage === 'speech') {
    s.runoff.stage = 'voting';
    return startVoting(ctx);
  }
  enterPhase(ctx, 'FREE_DISCUSSION', s.settings.durations.freeDiscussion);
}

/** Égalité au vote : chaque ex æquo reprend la parole (micro), dans l'ordre de la table. */
function startRunoff(ctx: Ctx): void {
  const s = ctx.state;
  const runoff = s.runoff!;
  runoff.stage = 'speech';
  const order = s.players
    .filter((p) => runoff.candidates.includes(p.id))
    .sort((a, b) => a.seat - b.seat)
    .map((p) => p.id);
  s.speech = { order, index: -1 };
  advanceSpeaker(ctx);
}

function startVoting(ctx: Ctx): void {
  const s = ctx.state;
  s.ballot = { kind: 'day', ballots: {} };
  enterPhase(ctx, 'VOTING', s.settings.durations.voting);
}

function resolveVote(ctx: Ctx): void {
  const s = ctx.state;
  const { eliminated, tie } = countDayVote(ctx);
  const wasRunoff = s.runoff?.stage === 'voting';
  // Révélation des votes (option) : secrets pendant le vote, dévoilés au résultat.
  const votes = s.settings.revealVotes
    ? Object.entries(validBallots(s)).map(([voterId, targetId]) => ({ voterId, targetId, weight: voterId === s.captainId ? 2 : 1 }))
    : null;
  s.ballot = null;
  s.pipelineNext = 'NIGHT';
  enterPhase(ctx, 'VOTE_RESULT', s.settings.durations.voteResult, { eliminatedId: eliminated, votes });
  if (votes?.length) {
    const lines = votes.map((x) => `${playerName(s, x.voterId)}${x.weight > 1 ? ' (👑×2)' : ''} → ${playerName(s, x.targetId)}`);
    announce(ctx, 'vote', `🗳️ Votes : ${lines.join(' · ')}`);
  }
  if (wasRunoff) s.runoff = null;
  // Première égalité : les ex æquo reprennent la parole, puis revote entre eux.
  if (!eliminated && tie.length > 1 && !wasRunoff && s.settings.tieRule === 'revote') {
    s.runoff = { candidates: [...tie], stage: 'pending' };
    announce(ctx, 'vote', `⚖️ Égalité entre ${formatNames(tie.map((id) => playerName(s, id)))} ! Ils reprennent la parole, puis le village revote entre eux.`);
    return;
  }
  if (eliminated) {
    if (tie.length > 1) announce(ctx, 'vote', '⚖️ Égalité ! Le sort départage le village…');
    // Seul le nom est annoncé : le rôle n'est jamais révélé.
    announce(ctx, 'vote', `⚖️ Le village a choisi ${playerName(s, eliminated)}.`);
    kill(ctx, eliminated, 'vote');
  } else if (tie.length > 1) {
    announce(ctx, 'vote', wasRunoff ? '⚖️ Nouvelle égalité : personne n’est éliminé.' : '⚖️ Égalité : le village n’a pas su se décider. Personne n’est éliminé.');
  } else {
    announce(ctx, 'vote', '⚖️ Aucun vote : personne n’est éliminé.');
  }
}

// ---------------------------------------------------------------- Fin

/** Durée de l'écran de victoire avant le retour automatique de tous les joueurs au lobby. */
export const GAME_OVER_RETURN_MS = 5000;

export function endGame(ctx: Ctx, win: WinResult): void {
  const s = ctx.state;
  s.status = 'finished';
  s.winner = win;
  s.deathQueue = [];
  s.ballot = null;
  s.speech = null;
  s.night = null;
  enterPhase(ctx, 'GAME_OVER', GAME_OVER_RETURN_MS);
  announce(ctx, 'victory', win.title);
}

// ---------------------------------------------------------------- Transitions

/** Termine la phase courante (timeout ou fin anticipée) et entre dans la suivante. */
export function finishPhase(ctx: Ctx): void {
  const s = ctx.state;
  const ph = s.phase;
  switch (ph.id) {
    case 'ROLE_DISTRIBUTION':
      return startNight(ctx);
    case 'NIGHT_START':
      return nextNightStep(ctx, -Infinity);
    case 'THIEF_PHASE':
    case 'CUPID_PHASE':
    case 'WEREWOLF_PHASE':
    case 'WHITE_WOLF_PHASE':
    case 'SEER_PHASE':
    case 'SALVATION_PHASE':
    case 'WITCH_PHASE': {
      const step = currentNightStep(ctx);
      if (!step) return resolveNight(ctx);
      if (!ph.data.inactive) step.onEnd?.(ctx);
      return nextNightStep(ctx, step.order);
    }
    case 'SUNRISE':
    case 'DEATH_LAST_WORD':
      return runPipeline(ctx);
    case 'HUNTER_SHOT':
      if (!ph.data.done) announce(ctx, 'death', `🏹 ${playerName(s, ph.data.playerId as string)} n’a pas tiré.`);
      return runPipeline(ctx);
    case 'CAPTAIN_SUCCESSION':
      if (!ph.data.done) randomCaptain(ctx);
      return runPipeline(ctx);
    case 'CAPTAIN_ELECTION': {
      const id = countCaptainVote(ctx);
      s.ballot = null;
      s.captainElectionDone = true;
      if (id) setCaptain(ctx, id, 'elected');
      return startSpeeches(ctx);
    }
    case 'PLAYER_SPEECH':
      return advanceSpeaker(ctx);
    case 'FREE_DISCUSSION':
      return startVoting(ctx);
    case 'VOTING':
      return resolveVote(ctx);
    case 'VOTE_RESULT':
      if (s.runoff?.stage === 'pending') return startRunoff(ctx);
      enterPhase(ctx, 'DEATH_SEQUENCE', null);
      return runPipeline(ctx);
    case 'NIGHT_RESOLUTION':
    case 'DEATH_SEQUENCE':
    case 'WIN_CHECK':
      // Phases transitoires : ne devraient pas persister, on relance la séquence.
      return runPipeline(ctx);
    case 'GAME_OVER':
      return returnToLobby(ctx);
    case 'LOBBY':
      return;
  }
}

/** Fait avancer les phases dont le timer a expiré. Renvoie true si l'état a changé. */
export function advanceTime(ctx: Ctx): boolean {
  let changed = false;
  for (let i = 0; i < MAX_TRANSITIONS; i++) {
    const endsAt = ctx.state.phase.endsAt;
    if (endsAt === null || ctx.now < endsAt) break;
    finishPhase(ctx);
    changed = true;
  }
  return changed;
}

/** Abandon (départ volontaire ou déconnexion prolongée) pendant la partie. */
export function abandonPlayer(ctx: Ctx, playerId: string): void {
  const s = ctx.state;
  const p = getPlayer(s, playerId);
  if (!p || p.abandoned) return;
  p.abandoned = true;
  p.connected = false;
  if (!p.alive) return;
  const wasNight = isNightPhase(ctx);
  const wasCaptain = s.captainId === p.id;
  announce(ctx, 'death', `🚪 ${p.name} a quitté le village.`);
  const dead = kill(ctx, p.id, 'abandon');
  if (wasNight && s.night) s.night.extraDeaths.push(...dead.filter((id) => id !== p.id));
  if (wasCaptain) {
    // Pas de succession interactive pour un absent : tirage au sort.
    s.deathQueue = s.deathQueue.filter((t) => !(t.kind === 'captain_succession' && t.playerId === p.id));
    randomCaptain(ctx);
  }

  // Si la phase attendait précisément ce joueur, on avance.
  const ph = s.phase;
  const waitingOn =
    (ph.id === 'PLAYER_SPEECH' && dead.includes(ph.data.speakerId as string)) ||
    ((ph.id === 'DEATH_LAST_WORD' || ph.id === 'HUNTER_SHOT' || ph.id === 'CAPTAIN_SUCCESSION') && ph.data.playerId === p.id);
  if (waitingOn) {
    finishPhase(ctx);
    return;
  }
  const inPipeline = ['SUNRISE', 'DEATH_LAST_WORD', 'HUNTER_SHOT', 'CAPTAIN_SUCCESSION', 'VOTE_RESULT'].includes(ph.id);
  if (!inPipeline) {
    const win = checkWin(ctx);
    if (win) endGame(ctx, win);
  }
}
