/**
 * Identifiants des personnages jouables (cosmétique uniquement).
 * Doit rester synchronisé avec `public/js/characters.js` (vérifié par un test).
 */
export const AVATAR_IDS = [
  'm-brun', 'm-blond', 'm-roux', 'm-barbu', 'm-ancien', 'm-boucle', 'm-forgeron',
  'f-blonde', 'f-brune', 'f-rousse', 'f-courte', 'f-ancienne', 'f-chataine', 'f-foulard',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export function isAvatarId(v: unknown): v is AvatarId {
  return typeof v === 'string' && (AVATAR_IDS as readonly string[]).includes(v);
}

/** Personnage par défaut tant que le joueur n'a pas choisi. */
export function defaultAvatar(seat: number): AvatarId {
  // Alterne hommes / femmes pour un plateau varié.
  const men = AVATAR_IDS.filter((a) => a.startsWith('m-'));
  const women = AVATAR_IDS.filter((a) => a.startsWith('f-'));
  const pool = seat % 2 === 0 ? men : women;
  return pool[Math.floor(seat / 2) % pool.length];
}
