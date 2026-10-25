/**
 * Déclare le résultat d'une partie terminée au projet Supabase central de
 * Revanche Game (comptes, profils, statistiques) — distinct du système de
 * profils propre à La Meute (`platform/profiles.ts`), qui continue de
 * fonctionner exactement comme avant, projet Supabase propre inclus.
 * Optionnel : sans ces variables, rien ne change.
 *
 * Lues à l'intérieur des fonctions, jamais au chargement du module : ce
 * serveur appelle lui-même le chargement de .env *après* avoir importé tous
 * ses modules (voir server/index.ts) — une constante top-level verrait
 * toujours ces variables absentes. Piège déjà rencontré sur Quiz Master,
 * voir docs/PLATFORM.md dans revanche-games-web.
 */
import type { PlatformResultRow } from './results.ts';

function platformConfig() {
  const url = process.env.PLATFORM_SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export function reportMatchResult(params: { roomCode: string; finishedAt: number; players: PlatformResultRow[] }): void {
  const config = platformConfig();
  if (!config) return;
  if (!params.players.length) return;

  void (async () => {
    try {
      const response = await fetch(`${config.url}/rest/v1/rpc/record_game_result`, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_game_slug: 'la-meute',
          p_idempotency_key: `la-meute:${params.roomCode}:${params.finishedAt}`,
          p_room_code: params.roomCode,
          p_raw_payload: null,
          p_players: params.players,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('[platform] record_game_result failed', response.status, body);
      }
    } catch (error) {
      // Une panne de la plateforme centrale ne doit jamais interrompre une partie en cours.
      console.error('[platform] record_game_result error', error);
    }
  })();
}
