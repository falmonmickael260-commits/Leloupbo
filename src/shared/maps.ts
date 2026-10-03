/** Maps (décors) au choix dans le lobby. `id` = fichier public/assets/decor/<id>.json ; 'village' = village dessiné. */
export const MAPS = [
  { id: 'blackops', name: 'Le Village des Blackops' },
  { id: 'clairiere', name: 'La Clairière' },
] as const;

export type MapId = (typeof MAPS)[number]['id'];
export const DEFAULT_MAP: MapId = 'blackops';
export const isMapId = (v: unknown): v is MapId => MAPS.some((m) => m.id === v);
