import type { PhaseId, SkyState } from '../shared/types.ts';
import type { Ctx } from './state.ts';

/** Change la phase courante. `duration` null = phase sans timer (ou transitoire). */
export function enterPhase(ctx: Ctx, id: PhaseId, duration: number | null, data: Record<string, unknown> = {}): void {
  const prev = ctx.state.phase;
  ctx.state.phase = {
    id,
    seq: prev.seq + 1,
    startedAt: ctx.now,
    endsAt: duration === null ? null : ctx.now + duration,
    data,
  };
}

export const PHASE_LABELS: Record<PhaseId, string> = {
  LOBBY: 'Salle d’attente',
  ROLE_DISTRIBUTION: 'Distribution des rôles',
  NIGHT_START: 'La nuit tombe',
  THIEF_PHASE: 'Le Voleur se réveille',
  CUPID_PHASE: 'Cupidon se réveille',
  WEREWOLF_PHASE: 'Les Loups-Garous se réveillent',
  WHITE_WOLF_PHASE: 'Le Loup-Blanc se réveille',
  SEER_PHASE: 'La Voyante se réveille',
  SALVATION_PHASE: 'Le Salvateur se réveille',
  WITCH_PHASE: 'La Sorcière se réveille',
  NIGHT_RESOLUTION: 'Fin de la nuit',
  SUNRISE: 'Le jour se lève',
  DEATH_LAST_WORD: 'Dernière parole',
  HUNTER_SHOT: 'Le dernier tir du Chasseur',
  CAPTAIN_SUCCESSION: 'Succession du Capitaine',
  CAPTAIN_ELECTION: 'Élection du Capitaine',
  PLAYER_SPEECH: 'Tour de parole',
  FREE_DISCUSSION: 'Discussion libre',
  VOTING: 'Vote secret',
  VOTE_RESULT: 'Résultat du vote',
  DEATH_SEQUENCE: 'Séquence de mort',
  WIN_CHECK: 'Vérification de victoire',
  GAME_OVER: 'Fin de partie',
};

export function skyFor(id: PhaseId): SkyState {
  switch (id) {
    case 'ROLE_DISTRIBUTION':
    case 'NIGHT_START':
      return 'sunset';
    case 'THIEF_PHASE':
    case 'CUPID_PHASE':
    case 'SEER_PHASE':
    case 'SALVATION_PHASE':
    case 'WITCH_PHASE':
      return 'night';
    case 'WEREWOLF_PHASE':
    case 'WHITE_WOLF_PHASE':
    case 'NIGHT_RESOLUTION':
      return 'moon';
    case 'SUNRISE':
      return 'dawn';
    default:
      return 'day';
  }
}
