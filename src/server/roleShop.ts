/**
 * Boutique de rôles : achat d'une préférence de rôle avec les pièces Revanche
 * Games, pour un joueur connecté à la plateforme (`platformUserId` présent).
 *
 * Toute la logique sensible (réservation, débit après attribution, unicité) vit
 * côté plateforme centrale (`reserve_role`, `resolve_role_reservations`,
 * `cancel_role_reservations` — voir revanche-games-web). Ce fichier n'est
 * qu'une façade réseau, dans le même esprit que platform.ts : lues à
 * l'intérieur des fonctions, jamais au chargement du module (même piège que
 * documenté dans platform.ts).
 */
import { platformRpc } from './platformRpc.ts';
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
  hunter: 100,
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
      { signal: AbortSignal.timeout(8000), headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as { balance_coins: number }[];
    return rows[0]?.balance_coins ?? 0;
  } catch {
    return null;
  }
}

/** Vérifie le solde et crée une demande sans débit. Lève RoleShopError avec un message affichable en cas d'échec. */
export async function reserveRole(params: {
  roomCode: string;
  userId: string;
  roleKey: RoleId;
  reservationId: string;
  selectionEndsAt: number;
}): Promise<{ reservationId: string; newBalance: number }> {
  const config = platformConfig();
  if (!config) throw new RoleShopError('La boutique de rôles est momentanément indisponible.');

  const price = ROLE_SHOP_PRICES[params.roleKey];
  if (!price) throw new RoleShopError('Ce rôle ne peut pas être acheté.');

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/reserve_role`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
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
        p_reservation_id: params.reservationId,
        p_selection_ends_at: new Date(params.selectionEndsAt).toISOString(),
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
  if (!row || row.reservation_id !== params.reservationId || typeof row.new_balance !== 'number')
    throw new RoleShopError('Réponse inattendue de la plateforme.');
  return { reservationId: row.reservation_id, newBalance: row.new_balance };
}

/**
 * Appelée une fois, juste après la distribution des rôles : qui a obtenu le
 * rôle demandé (à débiter) et qui ne l'a pas obtenu (sans débit).
 * Les identifiants de réservation limitent la résolution à cette manche.
 * Les erreurs sont conservées dans la file persistée et réessayées.
 */
export async function resolveRoleReservations(roomCode: string, grantedUserIds: string[], reservationIds: string[]): Promise<void> {
  await platformRpc('resolve_role_reservations', {
    p_game_slug: GAME_SLUG, p_room_code: roomCode,
    p_granted_user_ids: grantedUserIds, p_reservation_ids: reservationIds,
  });
}

/** Demande identifiée : annulation idempotente, même si elle arrive avant la réservation. */
export async function cancelRoleReservation(reservationId: string): Promise<void> {
  await platformRpc('cancel_role_reservation', { p_reservation_id: reservationId });
}
