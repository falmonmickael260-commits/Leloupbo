import { fail } from '../errors.ts';
import { alivePlayers, playerName, tell } from '../state.ts';
import { playersWithRole, registerNightStep, registerRole, stepData, validateTargets } from './registry.ts';

registerRole({
  id: 'witch',
  name: 'Sorcière',
  emoji: '🧪',
  team: 'village',
  description: 'Elle possède une potion de vie et une potion de mort, utilisables une seule fois chacune. 1re nuit : elle peut seulement réanimer. Ensuite, chaque nuit, elle peut réanimer, empoisonner, ou les deux.',
  unique: true,
  distributable: true,
  seerResult: () => 'CIVIL',
  initRoleData: () => ({ life: true, death: true }),
  selfInfo: (_ctx, p) => ({ potionVie: !!p.roleData.life, potionMort: !!p.roleData.death }),
});

const STEP = 'witch';
type D = { done: boolean; victim: string | null };
const data = (ctx: Parameters<typeof stepData>[0]) => stepData<D>(ctx, STEP, () => ({ done: false, victim: null }));

function capabilities(ctx: Parameters<typeof stepData>[0], witchId: string) {
  const witch = ctx.state.players.find((p) => p.id === witchId)!;
  const d = data(ctx);
  const s = ctx.state.settings;
  const canSave = !!witch.roleData.life && !!d.victim && (s.witchCanSelfSave || d.victim !== witch.id);
  // Option de l'hôte : potion de mort interdite la première nuit.
  const noPoisonTonight = s.witchNoPoisonFirstNight && ctx.state.nightNumber === 1;
  const canKill = !!witch.roleData.death && !noPoisonTonight;
  return { canSave, canKill, noPoisonTonight };
}

registerNightStep({
  id: STEP,
  phase: 'WITCH_PHASE',
  order: 70,
  roleIds: ['witch'],
  duration: (s) => s.durations.witch,
  isScheduled: () => true,
  actors: (ctx) => playersWithRole(ctx.state, 'witch'),
  onStart(ctx) {
    const attack = ctx.state.night!.effects.find((e) => e.type === 'attack' && e.source === 'wolves');
    const d = data(ctx);
    d.victim = attack ? attack.target : null;
    for (const w of this.actors(ctx)) {
      tell(ctx, w.id, 'witch', d.victim ? `☠️ Cette nuit, les Loups-Garous ont attaqué ${playerName(ctx.state, d.victim)}.` : '☠️ Cette nuit, les Loups-Garous n’ont attaqué personne.');
    }
  },
  prompt(ctx, actor) {
    const d = data(ctx);
    if (d.done) return null;
    const { canSave, canKill, noPoisonTonight } = capabilities(ctx, actor.id);
    const options = [{ id: 'none', label: 'Ne rien faire' }];
    if (canSave) options.push({ id: 'save', label: `Potion de vie : sauver ${playerName(ctx.state, d.victim)}` });
    if (canKill) options.push({ id: 'kill', label: 'Potion de mort : empoisonner (choisir une cible)' });
    if (canSave && canKill && ctx.state.settings.witchBothPotionsSameNight) options.push({ id: 'save_kill', label: 'Sauver ET empoisonner' });
    return {
      action: 'witch',
      title: '🧪 Vos potions',
      description: noPoisonTonight ? 'Première nuit : la potion de mort est interdite.' : (ctx.state.settings.witchBothPotionsSameNight ? 'Réanimez, empoisonnez, ou les deux.' : 'Réanimez OU empoisonnez.') + ' Chaque potion ne sert qu’une fois.',
      targets: canKill ? alivePlayers(ctx.state).filter((p) => p.id !== actor.id).map((p) => p.id) : [],
      minTargets: 0,
      maxTargets: canKill ? 1 : 0,
      options,
      submitted: false,
      canChange: false,
      info: { victimId: d.victim, victimName: d.victim ? playerName(ctx.state, d.victim) : null, potionVie: !!actor.roleData.life, potionMort: !!actor.roleData.death },
    };
  },
  handle(ctx, actor, cmd) {
    const p = this.prompt(ctx, actor);
    if (!p) return;
    const option = cmd.option ?? 'none';
    if (!p.options!.some((o) => o.id === option)) fail('BAD_OPTION', 'Option indisponible.');
    const d = data(ctx);
    const night = ctx.state.night!;
    const wantsKill = option === 'kill' || option === 'save_kill';
    const wantsSave = option === 'save' || option === 'save_kill';
    let killTarget: string | undefined;
    if (wantsKill) [killTarget] = validateTargets(cmd.targets, p.targets, 1, 1);
    else validateTargets(cmd.targets, [], 0, 0);

    if (wantsSave && d.victim) {
      actor.roleData.life = false;
      night.effects.push({ type: 'save', target: d.victim, against: ['wolves'] });
      tell(ctx, actor.id, 'witch', `🧪 Vous utilisez la potion de vie sur ${playerName(ctx.state, d.victim)}.`);
    }
    if (killTarget) {
      actor.roleData.death = false;
      night.effects.push({ type: 'kill', target: killTarget, source: 'poison' });
      tell(ctx, actor.id, 'witch', `🧪 Vous empoisonnez ${playerName(ctx.state, killTarget)}.`);
    }
    d.done = true;
  },
  isComplete: (ctx) => data(ctx).done,
});
