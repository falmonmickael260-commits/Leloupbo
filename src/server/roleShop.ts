/**
 * Boutique de rôles : achat d'une préférence de rôle avec les pièces Revanche
 * Games, pour un joueur connecté à la plateforme (`platformUserId` présent).
 *
 * Toute la logique sensible (débit, remboursement, unicité par salon) vit
 * côté plateforme centrale (`reserve_role`, `resolve_role_reservations`,
 * `cancel_role_reservations` — voir revanche-games-web). Ce fichier n'est
 * qu'une façade réseau, dans le même esprit que platform.ts : lues à
 * l'intérieur des fonctions, jamais au chargement du module (même piège que
 * documenté dans platform.ts).
 */
import type { RoleId } from '../shared/types.ts';

export const GAME_SLUG = 'la-meute';

/** Prix exacts demandés — à ne jamais arrondir ni recalculer ailleurs. */
export const ROLE_SHOP_PRICES: Partial<Record<RoleId, number>> = {
  villager: 50,
  werewolf: 100,
  witch: 150,
  seer: 150,
  black_wolf: 200,
  white_wolf: 100,
};

function platformConfig() {
  const url = process.env.PLATFORM_SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export class RoleShopError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Solde actuel du joueur, ou `null` si la plateforme n'est pas configurée ou son compte introuvable. */
export async function getWalletBalance(userId: string): Promise<number | null> {
  const config = platformConfig();
  if (!config) return null;
  try {
    const response = await fetch(
      `${config.url}/rest/v1/wallet_accounts?user_id=eq.${encodeURIComponent(userId)}&select=balance_coins`,
      { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as { balance_coins: number }[];
    return rows[0]?.balance_coins ?? 0;
  } catch {
    return null;
  }
}

/** Débite le prix et crée la réservation. Lève RoleShopError avec un message affichable en cas d'échec. */
export async function reserveRole(params: {
  roomCode: string;
  userId: string;
  roleKey: RoleId;
}): Promise<{ reservationId: string; newBalance: number }> {
  const config = platformConfig();
  if (!config) throw new RoleShopError('La boutique de rôles est momentanément indisponible.');

  const price = ROLE_SHOP_PRICES[params.roleKey];
  if (!price) throw new RoleShopError('Ce rôle ne peut pas être acheté.');

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/reserve_role`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_game_slug: GAME_SLUG,
        p_room_code: params.roomCode,
        p_user_id: params.userId,
        p_role_key: params.roleKey,
        p_price_coins: price,
      }),
    });
  } catch {
    throw new RoleShopError('La boutique de rôles est momentanément indisponible.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null as { message?: string } | null);
    const message = body?.message ?? '';
    if (message.includes('solde insuffisant')) throw new RoleShopError('Solde insuffisant.');
    if (message.includes('déjà réservée')) throw new RoleShopError('Tu as déjà réservé un rôle pour cette partie.');
    throw new RoleShopError('Achat impossible — réessaie.');
  }

  const rows = (await response.json()) as { reservation_id: string; new_balance: number }[];
  const row = rows[0];
  if (!row) throw new RoleShopError('Réponse inattendue de la plateforme.');
  return { reservationId: row.reservation_id, newBalance: row.new_balance };
}

/**
 * Appelée une fois, juste après la distribution des rôles : qui a obtenu le
 * rôle acheté (facturé pour de bon) et qui ne l'a pas obtenu (remboursé).
 * Best-effort, comme reportMatchResult : une panne de la plateforme centrale
 * ne doit jamais interrompre la partie en cours.
 */
export function resolveRoleReservations(roomCode: string, grantedUserIds: string[]): void {
  const config = platformConfig();
  if (!config) return;

  void (async () => {
    try {
      const response = await fetch(`${config.url}/rest/v1/rpc/resolve_role_reservations`, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_game_slug: GAME_SLUG, p_room_code: roomCode, p_granted_user_ids: grantedUserIds }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('[boutique-roles] resolve_role_reservations échec', response.status, body);
      }
    } catch (error) {
      console.error('[boutique-roles] resolve_role_reservations erreur', error);
    }
  })();
}

/** Salon fermé/expiré sans avoir démarré : rembourse ce qui restait en attente. Best-effort. */
export function cancelRoleReservations(roomCode: string): void {
  const config = platformConfig();
  if (!config) return;

  void (async () => {
    try {
      const response = await fetch(`${config.url}/rest/v1/rpc/cancel_role_reservations`, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_game_slug: GAME_SLUG, p_room_code: roomCode }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('[boutique-roles] cancel_role_reservations échec', response.status, body);
      }
    } catch (error) {
      console.error('[boutique-roles] cancel_role_reservations erreur', error);
    }
  })();
}
