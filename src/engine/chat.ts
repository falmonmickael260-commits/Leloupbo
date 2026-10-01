/**
 * ChatPermissions : séparation stricte des canaux, contrôlée côté serveur.
 * - village : lu par tous ; écrit uniquement par qui a la parole (miroir du micro).
 * - wolves  : meute vivante uniquement ; écriture pendant la phase des Loups.
 * - dead    : morts uniquement (les vivants ne le voient jamais).
 */
import type { ChatChannel } from '../shared/types.ts';
import { fail } from './errors.ts';
import { isWolfPack } from './roles/index.ts';
import { getPlayer, pushChat, type Ctx, type GameState } from './state.ts';
import { voiceFor } from './voice.ts';

export const MAX_CHAT_LENGTH = 300;

export function canRead(state: GameState, playerId: string, channel: ChatChannel): boolean {
  const p = getPlayer(state, playerId);
  if (!p) return false;
  switch (channel) {
    case 'village':
      return true;
    case 'wolves':
      return state.status !== 'lobby' && p.alive && isWolfPack(p);
    case 'dead':
      return state.status === 'running' && !p.alive;
  }
}

export function canWrite(state: GameState, playerId: string, channel: ChatChannel): boolean {
  const p = getPlayer(state, playerId);
  if (!p || !canRead(state, playerId, channel)) return false;
  const voice = voiceFor(state, playerId);
  switch (channel) {
    case 'village':
      return voice.canSpeak && voice.mode !== 'wolves';
    case 'wolves':
      return state.phase.id === 'WEREWOLF_PHASE' && voice.canSpeak;
    case 'dead':
      return true;
  }
}

export function sendChat(ctx: Ctx, playerId: string, channel: unknown, rawText: unknown): void {
  if (channel !== 'village' && channel !== 'wolves' && channel !== 'dead') fail('BAD_CHANNEL', 'Canal inconnu.');
  if (typeof rawText !== 'string') fail('BAD_MESSAGE', 'Message invalide.');
  const text = rawText.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
  if (!text) fail('BAD_MESSAGE', 'Message vide.');
  if (!canWrite(ctx.state, playerId, channel)) fail('FORBIDDEN', 'Vous ne pouvez pas écrire dans ce canal maintenant.');
  pushChat(ctx, channel, playerId, text);
}
