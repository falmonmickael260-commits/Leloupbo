import { canInfect, nextInfectNight } from './infection.ts';
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

/**
 * Super Loup Noir : comme le Loup Noir (même carte), mais son infection se recharge :
 * il peut infecter une nuit sur deux. Après une infection, il attend une nuit avant de recommencer
 * (infection la nuit 1 → de nouveau possible la nuit 3). S'il ne l'utilise pas, elle reste disponible.
 */
registerRole({
  id: 'super_black_wolf',
  name: 'Super Loup Noir',
  emoji: '🖤',
  team: 'wolves',
  description: 'Loup-Garou. Une nuit sur deux, il peut infecter la victime des Loups au lieu de la tuer : elle rejoint secrètement la meute. Après une infection, il doit attendre une nuit avant de recommencer.',
  unique: true,
  distributable: true,
  wolfPack: true,
  seerResult: () => 'LOUP',
  initRoleData: () => ({ lastInfectNight: null }),
  // La nuit qui compte : celle en cours (la nuit N a lieu pendant que dayNumber vaut N - 1), sinon la prochaine.
  selfInfo: (ctx, p) => {
    const night = ctx.state.dayNumber + 1;
    return canInfect(p, night) ? { infection: true } : { infection: false, rechargeNight: nextInfectNight(p) };
  },
});
