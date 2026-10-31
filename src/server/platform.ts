/** Résultats calculés par le serveur, envoyés par la file persistée. */
import type { PlatformResultRow } from './results.ts';
import { platformRpc } from './platformRpc.ts';

export async function reportMatchResult(params: { roomCode: string; finishedAt: number; players: PlatformResultRow[] }): Promise<void> {
  await platformRpc('record_game_result', {
    p_game_slug: 'la-meute',
    p_idempotency_key: `la-meute:${params.roomCode}:${params.finishedAt}`,
    p_room_code: params.roomCode, p_raw_payload: null, p_players: params.players,
  });
}
