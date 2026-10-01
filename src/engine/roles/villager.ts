import { registerRole } from './registry.ts';

registerRole({
  id: 'villager',
  name: 'Simple Villageois',
  emoji: '🧑‍🌾',
  team: 'village',
  description: "Aucun pouvoir, si ce n'est sa voix et son flair pour démasquer les Loups.",
  unique: false,
  distributable: true,
  seerResult: () => 'CIVIL',
});
