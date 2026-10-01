import { registerRole } from './registry.ts';

registerRole({
  id: 'hunter',
  name: 'Chasseur',
  emoji: '🏹',
  team: 'village',
  description: "À sa mort, il tire une dernière balle et emporte un joueur de son choix.",
  unique: true,
  distributable: true,
  seerResult: () => 'CIVIL',
  onDeath(ctx, player, cause) {
    if (cause === 'abandon') return;
    ctx.state.deathQueue.push({ kind: 'hunter_shot', playerId: player.id });
  },
});
