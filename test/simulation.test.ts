import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideBotCommand } from '../src/engine/bots.ts';
import { GameEngine } from '../src/engine/engine.ts';
import { GameError } from '../src/engine/errors.ts';
import { isWolfPack } from '../src/engine/roles/index.ts';
import { seededRng } from '../src/engine/rng.ts';
import { defaultRolesFor, simulateGame } from '../src/sim/simulate.ts';
import type { PlayerView } from '../src/shared/types.ts';

const FORBIDDEN_KEYS = ['tokenHash', 'ballots', 'stepData', 'effects', 'roleData', 'extraCards', 'deathQueue', 'privateMessages', 'originalRole'];

/** Vérifie qu'une vue ne contient aucune information secrète d'un autre joueur. */
function assertNoLeak(engine: GameEngine, playerId: string, v: PlayerView) {
  const s = engine.state;
  const me = s.players.find((p) => p.id === playerId)!;
  const raw = JSON.stringify(v);
  for (const k of FORBIDDEN_KEYS) assert.ok(!raw.includes(`"${k}"`), `clé interdite ${k}`);
  assert.ok(!/"inactive"\s*:/.test(raw));
  for (const p of v.players) assert.deepEqual(Object.keys(p).sort(), ['alive', 'audio', 'avatar', 'connected', 'id', 'isBot', 'isCaptain', 'isHost', 'isMe', 'name', 'seat']);
  assert.equal(v.me.role?.id ?? null, me.role);
  if (s.status === 'running') assert.equal(v.finalRoles, null);
  if (me.alive) assert.equal(v.chats.dead, undefined);
  if (!isWolfPack(me) || !me.alive) assert.equal(v.chats.wolves, undefined);
  if (!isWolfPack(me)) assert.equal(v.me.pack, null);
  assert.ok(v.privateLog.every((m) => (s.privateMessages[playerId] ?? []).some((x) => x.id === m.id)));
  if (v.vote) assert.equal(v.vote.myVote, s.ballot?.ballots[playerId] ?? null);
  if (v.prompt?.action === 'wolf_vote') assert.ok(isWolfPack(me));
}

describe('Simulation de parties complètes', () => {
  it('chaque taille de 4 à 18 joueurs va jusqu’à la victoire, sans fuite d’information', () => {
    for (let n = 4; n <= 18; n++) {
      for (let seed = 1; seed <= 4; seed++) {
        let checks = 0;
        const r = simulateGame({
          players: n,
          seed: n * 100 + seed,
          settings: { captainEnabled: seed % 2 === 0 },
          onStep(engine, now) {
            if (checks++ % 3 !== 0) return;
            for (const p of engine.state.players) assertNoLeak(engine, p.id, engine.view(p.id, now));
          },
        });
        assert.ok(r.winner, `n=${n}`);
        assert.equal(r.engine.state.phase.id, 'GAME_OVER');
      }
    }
  });

  it('300 parties aléatoires de 10 joueurs se terminent toutes', () => {
    const camps: Record<string, number> = {};
    for (let seed = 1; seed <= 300; seed++) {
      const r = simulateGame({ players: 10, seed, settings: { tieRule: seed % 3 ? 'none' : 'random', wolvesWinAtParity: seed % 5 === 0 } });
      camps[r.winner.camp] = (camps[r.winner.camp] ?? 0) + 1;
    }
    assert.ok(camps.village > 0 && camps.wolves > 0);
  });

  it('une partie normale de 12 joueurs dure de l’ordre de 30 minutes avec des timers pleins', () => {
    // Bots "lents" : chacun utilise tout son temps de parole (aucun FINIR).
    const engine = GameEngine.create('LONG', 0, seededRng(5));
    const host = engine.join('H', 'h', 0);
    for (let i = 1; i < 12; i++) engine.addBot(host.id, 0);
    engine.updateSettings(host.id, { roles: defaultRolesFor(12) }, 0);
    engine.start(host.id, 0);
    let now = 0;
    const rng = seededRng(9);
    while (engine.state.status !== 'finished') {
      for (const p of engine.state.players) {
        const cmd = decideBotCommand(engine.view(p.id, now), rng);
        if (!cmd || cmd.action === 'finish') continue;
        try {
          engine.command(p.id, cmd, now);
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
        }
      }
      now = engine.nextDeadline() ?? now;
      engine.tick(now);
    }
    const minutes = now / 60000;
    if (process.env.SHOW_DURATION) console.log(`durée simulée : ${minutes.toFixed(1)} min`);
    assert.ok(minutes > 10 && minutes < 90, `durée ${minutes} min`);
  });
});

describe('Persistance & reprise', () => {
  it('une partie sérialisée en JSON puis rechargée continue à l’identique', () => {
    const r1 = simulateGame({ players: 9, seed: 77 });
    // Rejoue la même partie mais en rechargeant l'état à chaque étape.
    let reloads = 0;
    const r2 = simulateGame({
      players: 9,
      seed: 77,
      onStep(engine) {
        const json = JSON.stringify(engine.state);
        engine.state = JSON.parse(json);
        reloads++;
      },
    });
    assert.ok(reloads > 10);
    assert.deepEqual(r2.winner, r1.winner);
    assert.deepEqual(
      r2.engine.state.announcements.map((a) => a.text),
      r1.engine.state.announcements.map((a) => a.text),
    );
  });
});

describe('Déconnexions', () => {
  function running() {
    const e = GameEngine.create('D', 0, seededRng(3));
    const host = e.join('H', 'h', 0);
    e.setConnected(host.id, true, 0);
    const others = [1, 2, 3, 4].map((i) => {
      const p = e.join(`J${i}`, `t${i}`, 0);
      e.setConnected(p.id, true, 0);
      return p;
    });
    e.updateSettings(host.id, { roles: { werewolf: 1 }, captainEnabled: false }, 0);
    return { e, host, others };
  }

  it('lobby : l’Hôte qui part est remplacé ; un déconnecté prolongé est retiré', () => {
    const { e, host, others } = running();
    e.leave(host.id, 10);
    assert.equal(e.state.hostId, others[0].id);
    e.setConnected(others[1].id, false, 100);
    e.tick(100 + 121_000);
    assert.ok(!e.hasPlayer(others[1].id));
  });

  it('en partie : courte déconnexion sans effet, longue déconnexion = abandon', () => {
    const { e, host, others } = running();
    e.start(host.id, 0);
    e.setConnected(others[0].id, false, 1000);
    e.tick(60_000);
    assert.equal(e.state.players.find((p) => p.id === others[0].id)!.alive, true);
    e.setConnected(others[0].id, true, 61_000); // reconnexion : tout est conservé
    assert.equal(e.view(others[0].id, 61_000).me.role!.id, e.state.players.find((p) => p.id === others[0].id)!.role);
    e.setConnected(others[1].id, false, 62_000);
    e.tick(62_000 + e.state.settings.abandonTimeoutMs + 1);
    const p = e.state.players.find((x) => x.id === others[1].id)!;
    assert.equal(p.alive, false);
    assert.equal(p.abandoned, true);
  });

  it('l’Hôte déconnecté en partie est remplacé et ne peut pas modifier les rôles', () => {
    const { e, host } = running();
    e.start(host.id, 0);
    e.setConnected(host.id, false, 0);
    e.tick(31_000);
    assert.notEqual(e.state.hostId, host.id);
    assert.throws(() => e.updateSettings(e.state.hostId, { roles: { werewolf: 2 } }, 31_000));
  });
});

describe('Personnages', () => {
  it('la liste des personnages du client correspond à celle du serveur', async () => {
    const { AVATAR_IDS } = await import('../src/shared/avatars.ts');
    const modulePath = '../public/js/art/characters.js';
    const { CHARACTER_IDS, characterSVG } = await import(modulePath);
    assert.deepEqual([...CHARACTER_IDS].sort(), [...AVATAR_IDS].sort());
    for (const id of CHARACTER_IDS) assert.match(characterSVG(id), /^<svg/);
  });

  it('le choix du personnage est réservé au lobby et validé par le serveur', () => {
    const e = GameEngine.create('AV', 0, seededRng(1));
    const host = e.join('H', 'h', 0);
    e.setAvatar(host.id, 'f-rousse', 0);
    assert.equal(e.view(host.id, 0).players[0].avatar, 'f-rousse');
    assert.throws(() => e.setAvatar(host.id, 'dragon', 0), GameError);
    for (let i = 0; i < 3; i++) e.join(`J${i}`, `t${i}`, 0);
    e.updateSettings(host.id, { roles: { werewolf: 1 } }, 0);
    e.start(host.id, 0);
    assert.throws(() => e.setAvatar(host.id, 'm-brun', 0), GameError);
  });
});
