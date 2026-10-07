import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameError } from '../src/engine/errors.ts';
import { setup } from './helpers.ts';

const rejects = (fn: () => void, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof GameError && e.code === code);

/** Partie arrivée au tour de parole du jour 1 (personne n'est mort cette nuit). */
function atSpeech() {
  const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
  g.until('WEREWOLF_PHASE');
  g.until('PLAYER_SPEECH');
  const speaker = g.engine.state.phase.data.speakerId as string;
  const si = g.ids.indexOf(speaker);
  const other = g.ids.findIndex((id, i) => i !== si && g.alive(i));
  const react = (i: number, kind: string, to = speaker) => g.engine.react(g.ids[i], kind, to, g.now);
  return { g, speaker, si, other, react };
}

describe('Réactions 🍅/🌸', () => {
  it('2 tomates et 2 fleurs par tour, comptées par le serveur ; visibles de tous', () => {
    const { g, speaker, other, react } = atSpeech();
    assert.deepEqual(g.view(other).reactions.targets, [speaker]);
    react(other, 'tomato');
    g.advance(800);
    react(other, 'tomato');
    g.advance(800);
    rejects(() => react(other, 'tomato'), 'NO_REACTION_LEFT');
    react(other, 'flower');
    g.advance(800);
    react(other, 'flower');
    g.advance(800);
    rejects(() => react(other, 'flower'), 'NO_REACTION_LEFT');
    const v = g.view(other).reactions;
    assert.equal(v.tomato, 0);
    assert.equal(v.flower, 0);
    // Tout le monde voit qui a lancé quoi sur qui.
    const feed = g.view((other + 1) % 6).reactions.feed;
    assert.equal(feed.length, 4);
    assert.deepEqual(feed[0], { ...feed[0], kind: 'tomato', from: g.ids[other], to: speaker });
  });

  it('aucun effet sur la partie (vote, vie, rôle)', () => {
    const { g, si, other, react } = atSpeech();
    const before = JSON.stringify(g.engine.state.players.map((p) => [p.alive, p.role]));
    react(other, 'tomato');
    assert.equal(JSON.stringify(g.engine.state.players.map((p) => [p.alive, p.role])), before);
    assert.equal(g.engine.state.ballot?.ballots?.[g.ids[other]], undefined);
    assert.equal(g.alive(si), true);
  });

  it('refusé : sur soi-même, sur qui n’a pas la parole, par un mort, hors phase, double clic', () => {
    const { g, speaker, si, other, react } = atSpeech();
    rejects(() => react(si, 'tomato', speaker), 'BAD_TARGET');
    const third = g.ids.findIndex((_, i) => i !== si && i !== other);
    rejects(() => react(other, 'tomato', g.ids[third]), 'BAD_TARGET');
    rejects(() => react(other, 'banane'), 'BAD_REACTION');
    react(other, 'tomato');
    rejects(() => react(other, 'flower'), 'TOO_FAST'); // double clic
    g.engine.state.players[third].alive = false;
    rejects(() => react(third, 'flower'), 'DEAD');
    g.until('VOTING');
    rejects(() => react(other, 'flower'), 'WRONG_PHASE');
  });

  it('remis à 2 + 2 au tour de vote suivant', () => {
    const { g, other, react } = atSpeech();
    react(other, 'tomato');
    g.advance(800);
    react(other, 'tomato');
    assert.equal(g.view(other).reactions.tomato, 0);
    g.until('WEREWOLF_PHASE');
    g.until('PLAYER_SPEECH');
    const v = g.view(other).reactions;
    assert.equal(v.tomato, 2);
    assert.equal(v.flower, 2);
  });
});
