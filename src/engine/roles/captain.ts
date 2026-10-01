import { registerRole } from './registry.ts';

/**
 * Le Capitaine n'est pas une carte distribuée : c'est un titre élu par le village
 * le premier jour (voir flow.ts). Il est enregistré ici pour apparaître dans le
 * catalogue. Sa voix compte double ; à sa mort il désigne un successeur.
 */
registerRole({
  id: 'captain',
  name: 'Capitaine',
  emoji: '👑',
  team: 'none',
  description: 'Élu par le village le premier jour. Sa voix compte double. À sa mort, il désigne son successeur.',
  unique: true,
  distributable: false,
  seerResult: () => 'CIVIL',
});
