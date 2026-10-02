/**
 * Contrat des événements Socket.IO entre client et serveur.
 * Le client n'envoie que des INTENTIONS ; le serveur valide et renvoie la vue.
 */
import type { ChatChannel, ClientCommand, GameSettings, PlayerView } from './types.ts';

export type Ack<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string };

export interface SessionInfo {
  code: string;
  playerId: string;
  token: string;
}

export interface ClientToServerEvents {
  'game:create': (p: { name: string }, ack: (r: Ack<SessionInfo>) => void) => void;
  'game:join': (p: { code: string; name: string }, ack: (r: Ack<SessionInfo>) => void) => void;
  'session:resume': (p: { code: string; token: string }, ack: (r: Ack<{ playerId: string }>) => void) => void;
  'lobby:settings': (p: Partial<GameSettings>, ack: (r: Ack) => void) => void;
  'lobby:addBot': (p: Record<string, never>, ack: (r: Ack) => void) => void;
  'lobby:avatar': (p: { avatar: string }, ack: (r: Ack) => void) => void;
  'player:tag': (p: { playerId: string; text: string }, ack: (r: Ack) => void) => void;
  'player:audio': (p: { mic: boolean; speaker: boolean; connected: boolean; diag?: string }, ack: (r: Ack) => void) => void;
  'lobby:kick': (p: { playerId: string }, ack: (r: Ack) => void) => void;
  'game:start': (p: Record<string, never>, ack: (r: Ack) => void) => void;
  'game:reset': (p: Record<string, never>, ack: (r: Ack) => void) => void;
  'game:command': (p: ClientCommand, ack: (r: Ack) => void) => void;
  'game:leave': (p: Record<string, never>, ack: (r: Ack) => void) => void;
  'chat:send': (p: { channel: ChatChannel; text: string }, ack: (r: Ack) => void) => void;
  'voice:join': (
    p: Record<string, never>,
    ack: (r: Ack<{ mode: 'mesh' | 'sfu'; peers: string[]; iceServers: { urls: string | string[]; username?: string; credential?: string }[]; url?: string; token?: string }>) => void,
  ) => void;
  'voice:leave': (p: Record<string, never>) => void;
  'voice:signal': (p: { to: string; data: unknown }) => void;
}

export interface ServerToClientEvents {
  view: (v: PlayerView) => void;
  kicked: (p: { reason: string }) => void;
  'voice:peer-joined': (p: { id: string }) => void;
  'voice:peer-left': (p: { id: string }) => void;
  'voice:signal': (p: { from: string; data: unknown }) => void;
}
