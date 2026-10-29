import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setup } from './helpers.ts';

it('tir public : cible exacte même quand une mort par chagrin précède la cible dans les sièges', () => {
  const g = setup(['werewolf', 'villager', 'villager', 'hunter', 'villager', 'villager', 'villager']);
  g.engine.state.players[1].loverId = g.ids[5];
  g.engine.state.players[5].loverId = g.ids[1];
  g.until('WEREWOLF_PHASE'); g.act(0, 'wolf_vote', [3]); g.until('HUNTER_SHOT');
  const before = g.view(2);
  g.act(3, 'hunter_shot', [5]);
  assert.equal(g.alive(1), false); assert.equal(g.alive(5), false);
  const oldGuess = g.view(2).players.find((p) => !p.alive && before.players.find((q) => q.id === p.id)?.alive);
  assert.equal(oldGuess?.id, g.ids[1], 'l’ancienne heuristique choisissait la mort en chaîne');
  const effect = g.view(2).announcements.find((a) => a.effect)?.effect;
  assert.deepEqual(effect, { kind: 'hunter_shot', actorId: g.ids[3], targetId: g.ids[5] });
  for (const id of g.ids) assert.deepEqual(g.engine.view(id, g.now).announcements.find((a) => a.effect)?.effect, effect);
  const restored = JSON.parse(JSON.stringify(g.engine.state));
  assert.deepEqual(restored.announcements.find((a: any) => a.effect).effect, effect);
});

it('les morts nocturnes ne publient aucune cause privée à travers les effets', () => {
  const g = setup(['werewolf', 'witch', 'hunter', 'villager', 'villager', 'villager']);
  g.until('WEREWOLF_PHASE'); g.act(0, 'wolf_vote', [4]); g.until('SUNRISE');
  for (const id of g.ids) assert.ok(g.engine.view(id, g.now).announcements.every((a) => !a.effect));
});

it('mixage : niveaux normalisés, bus indépendants, priorité à la parole puis retour progressif', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const modulePath = '../public/js/audioMix.js';
  const { normalizeAudioSettings, audioBuses, setAudioSetting, setVoiceActivity } = await import(modulePath);
  assert.deepEqual(normalizeAudioSettings({ effects: -2, ambience: Infinity, voice: 20 }), { effects: 0, ambience: .55, voice: 1 });
  const make = () => ({ gain: { value: 0, cancelScheduledValues() {}, setTargetAtTime(v: number) { this.value = v; } }, connect() {} });
  const c = { currentTime: 0, destination: {}, createGain: make, createDynamicsCompressor: () => ({ threshold: {value:0}, ratio: {value:0}, connect() {} }) };
  const bus = audioBuses(c);
  setAudioSetting('effects', .8); setAudioSetting('ambience', 0);
  assert.equal(bus.effects.gain.value, .8); assert.equal(bus.ambience.gain.value, 0);
  setVoiceActivity(true); assert.ok(Math.abs(bus.effects.gain.value - .176) < .001);
  setVoiceActivity(false); t.mock.timers.tick(899); assert.ok(bus.effects.gain.value < .8);
  t.mock.timers.tick(1); assert.equal(bus.effects.gain.value, .8); assert.equal(bus.ambience.gain.value, 0);
});

it('VFX : nuit commune à toutes les causes secrètes, verdict et tir distingués par phases publiques', async () => {
  const modulePath = '../public/js/board/effects.js';
  const { deathPresentation } = await import(modulePath);
  assert.equal(deathPresentation({phase:{id:'SUNRISE'}}, {phase:{id:'WITCH_PHASE',sky:'night'}}), 'night');
  assert.equal(deathPresentation({phase:{id:'DEATH_LAST_WORD'}}, {phase:{id:'VOTE_RESULT'}}), 'vote');
  assert.equal(deathPresentation({phase:{id:'DEATH_LAST_WORD'}}, {phase:{id:'HUNTER_SHOT'}}), 'shot');
});
