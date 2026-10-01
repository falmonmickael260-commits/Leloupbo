/**
 * VoicePermissions : qui peut parler, et qui entend qui, selon la phase.
 * Calculé par le serveur ; chaque client ne reçoit que SES permissions.
 */
import type { VoiceMode, VoiceView } from '../shared/types.ts';
import { isWolfPack } from './roles/index.ts';
import { getPlayer, type GameState } from './state.ts';

interface Channel {
  mode: VoiceMode;
  speakers: string[];
  listeners: string[];
}

export function voiceChannel(state: GameState): Channel {
  const all = state.players.map((p) => p.id);
  const alive = state.players.filter((p) => p.alive).map((p) => p.id);
  const ph = state.phase;
  switch (ph.id) {
    case 'LOBBY':
    case 'GAME_OVER':
      return { mode: 'open', speakers: all, listeners: all };
    case 'WEREWOLF_PHASE': {
      const pack = state.players.filter((p) => p.alive && isWolfPack(p)).map((p) => p.id);
      return { mode: 'wolves', speakers: pack, listeners: pack };
    }
    case 'DEATH_LAST_WORD': {
      const id = ph.data.playerId as string;
      return { mode: 'last_word', speakers: [id], listeners: all };
    }
    case 'PLAYER_SPEECH': {
      const id = state.speech?.order[state.speech.index];
      const sp = getPlayer(state, id);
      return { mode: 'turn', speakers: sp && sp.alive ? [sp.id] : [], listeners: all };
    }
    case 'FREE_DISCUSSION':
    case 'CAPTAIN_ELECTION':
      return { mode: 'open', speakers: alive, listeners: all };
    default:
      return { mode: 'muted', speakers: [], listeners: [] };
  }
}

export function voiceFor(state: GameState, playerId: string): VoiceView {
  const ch = voiceChannel(state);
  const canSpeak = ch.speakers.includes(playerId);
  const listens = ch.listeners.includes(playerId);
  return {
    mode: ch.mode,
    canSpeak,
    speakTo: canSpeak ? ch.listeners.filter((id) => id !== playerId) : [],
    hearFrom: listens ? ch.speakers.filter((id) => id !== playerId) : [],
  };
}
