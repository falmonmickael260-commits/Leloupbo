import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seededRng } from '../src/engine/rng.ts';
import { buildSpeechOrder } from '../src/engine/speech.ts';
import { setup } from './helpers.ts';

describe('Ordre de parole', () => {
  it('le premier à parler est tiré au sort (pas toujours le joueur 1), puis on suit le cercle', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const order = buildSpeechOrder(g.engine.state, seededRng(seed));
      assert.equal(order.length, 6);
      firsts.add(order[0]);
      // Ordre du cercle : chaque joueur suivant est le voisin (par siège).
      const seats = order.map((id) => g.engine.state.players.find((p) => p.id === id)!.seat);
      for (let i = 1; i < seats.length; i++) assert.equal(seats[i], (seats[i - 1] + 1) % 6);
    }
    assert.ok(firsts.size >= 5, `trop peu de premiers orateurs différents : ${firsts.size}`);
  });

  it('le Capitaine vivant parle toujours en premier', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    g.engine.state.captainId = g.ids[3];
    for (let seed = 1; seed <= 20; seed++) assert.equal(buildSpeechOrder(g.engine.state, seededRng(seed))[0], g.ids[3]);
  });
});
