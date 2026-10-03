import { registerRole } from './registry.ts';

/**
 * Loup Noir : Loup-Garou qui, UNE fois dans la partie, peut INFECTER la victime de la meute
 * au lieu de la tuer. La victime survit, garde son rôle et ses pouvoirs, mais rejoint
 * secrètement le camp des Loups (voir `PlayerState.infected` et l'étape des Loups).
 */
registerRole({
  id: 'black_wolf',
  name: 'Loup Noir',
  emoji: '🖤',
  team: 'wolves',
  description: 'Loup-Garou. Une seule fois dans la partie, il peut infecter la victime des Loups au lieu de la tuer : elle rejoint secrètement la meute.',
  unique: true,
  distributable: true,
  wolfPack: true,
  seerResult: () => 'LOUP',
  initRoleData: () => ({ infect: true }),
  selfInfo: (_ctx, p) => ({ infection: !!p.roleData.infect }),
});
