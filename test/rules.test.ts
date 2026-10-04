import type { RoleId } from '../src/shared/types.ts';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameEngine } from '../src/engine/engine.ts';
import { GameError } from '../src/engine/errors.ts';
import { seededRng } from '../src/engine/rng.ts';
import { setup, T0 } from './helpers.ts';

const rejects = (fn: () => void, code?: string) =>
  assert.throws(fn, (e: unknown) => e instanceof GameError && (!code || e.code === code));

describe('Création & distribution', () => {
  it('distribue un rôle par joueur, aléatoirement, en respectant la composition', () => {
    const seen = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 30; seed++) {
      const e = GameEngine.create('X', T0, seededRng(seed));
      const host = e.join('H', 'h', T0);
      for (let i = 0; i < 7; i++) e.join(`J${i}`, `t${i}`, T0);
      e.updateSettings(host.id, { roles: { werewolf: 2, seer: 1, witch: 1 } }, T0);
      e.start(host.id, T0);
      const roles = e.state.players.map((p) => p.role!);
      assert.equal(roles.filter((r) => r === 'werewolf').length, 2);
      assert.equal(roles.filter((r) => r === 'villager').length, 4);
      assert.deepEqual(e.state.composition, { werewolf: 2, seer: 1, witch: 1, villager: 4 });
      e.state.players.forEach((p) => {
        if (!seen.has(p.name)) seen.set(p.name, new Set());
        seen.get(p.name)!.add(p.role!);
      });
    }
    // Sur 30 parties, l'hôte a reçu plusieurs rôles différents : il ne choisit pas le sien.
    assert.ok(seen.get('H')!.size >= 3);
  });

  it('seul l’Hôte configure, et plus rien n’est modifiable après le lancement', () => {
    const e = GameEngine.create('X', T0, seededRng(1));
    const host = e.join('H', 'h', T0);
    const other = e.join('B', 'b', T0);
    for (let i = 0; i < 3; i++) e.join(`J${i}`, `t${i}`, T0);
    rejects(() => e.updateSettings(other.id, { roles: { werewolf: 1 } }, T0), 'NOT_HOST');
    rejects(() => e.updateSettings(host.id, { roles: { villager: 3 } }, T0), 'BAD_SETTINGS');
    rejects(() => e.updateSettings(host.id, { roles: { seer: 2 } }, T0), 'BAD_SETTINGS');
    e.updateSettings(host.id, { roles: { werewolf: 1, seer: 1 } }, T0);
    rejects(() => e.start(other.id, T0), 'NOT_HOST');
    e.start(host.id, T0);
    rejects(() => e.updateSettings(host.id, { roles: { werewolf: 2 } }, T0), 'GAME_STARTED');
    rejects(() => e.join('Late', 'late', T0), 'GAME_STARTED');
  });

  it('limite à 18 joueurs et refuse une composition impossible', () => {
    const e = GameEngine.create('X', T0, seededRng(1));
    const host = e.join('H', 'h', T0);
    for (let i = 0; i < 17; i++) e.join(`J${i}`, `t${i}`, T0);
    rejects(() => e.join('Trop', 'x', T0), 'GAME_FULL');
    e.updateSettings(host.id, { roles: { werewolf: 18 }, autoWolves: false }, T0);
    rejects(() => e.start(host.id, T0), 'BAD_COMPOSITION');
  });
});

describe('Nuit', () => {
  it('enchaîne les phases nocturnes dans l’ordre, avec un timer serveur', () => {
    const g = setup(['werewolf', 'seer', 'witch', 'cupid', 'villager', 'villager']);
    assert.equal(g.phase, 'ROLE_DISTRIBUTION');
    const order: string[] = [];
    while ((g.phase as string) !== 'SUNRISE') {
      order.push(g.phase);
      assert.ok(g.engine.state.phase.endsAt! > g.engine.state.phase.startedAt);
      g.skip();
    }
    assert.deepEqual(order, ['ROLE_DISTRIBUTION', 'NIGHT_START', 'CUPID_PHASE', 'WEREWOLF_PHASE', 'SEER_PHASE', 'WITCH_PHASE']);
  });

  it('refuse une action hors de son tour ou par un autre rôle', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    rejects(() => g.act(1, 'seer', [0]), 'NOT_YOUR_TURN');
    rejects(() => g.act(2, 'wolf_vote', [1]), 'NOT_YOUR_TURN');
    rejects(() => g.act(0, 'wolf_vote', [0]), 'BAD_TARGET'); // un loup ne cible pas la meute
  });

  it('Cupidon : les amoureux connaissent le nom du partenaire, pas son rôle, et meurent ensemble', () => {
    const g = setup(['werewolf', 'cupid', 'villager', 'seer', 'villager']);
    g.until('CUPID_PHASE');
    rejects(() => g.act(1, 'cupid', [2]), 'BAD_TARGET');
    g.act(1, 'cupid', [2, 3]);
    assert.equal(g.phase, 'WEREWOLF_PHASE'); // fin anticipée
    assert.deepEqual(g.view(2).me.lover, { id: g.ids[3], name: 'P3' });
    assert.ok(g.privateLog(2).includes('❤️ Tu es amoureux de P3.'));
    assert.ok(g.privateLog(3).includes('❤️ Tu es amoureux de P2.'));
    assert.equal(g.view(4).me.lover, null);
    // Le loup tue P2 → P3 meurt de chagrin.
    g.act(0, 'wolf_vote', [2]);
    g.until('SUNRISE');
    assert.equal(g.alive(2), false);
    assert.equal(g.alive(3), false);
    assert.equal(g.engine.state.players[3].deathCause, 'heartbreak');
  });

  it('Voyante : reçoit uniquement LOUP ou CIVIL', () => {
    const g = setup(['werewolf', 'seer', 'witch', 'villager', 'white_wolf'], { whiteWolfSeerResult: 'CIVIL' });
    g.until('SEER_PHASE');
    rejects(() => g.act(1, 'seer', [1]), 'BAD_TARGET');
    g.act(1, 'seer', [0]);
    const log = g.privateLog(1);
    assert.ok(log.includes('🔮 P0 : LOUP'));
    assert.ok(!log.some((m) => m.includes('Loup-Garou') && m.includes('P0')));
    rejects(() => g.act(1, 'seer', [2]));
    g.until('SEER_PHASE');
    g.act(1, 'seer', [4]);
    assert.ok(g.privateLog(1).includes('🔮 P4 : CIVIL'));
  });

  it('Voyante : carte générique selon le camp (Loups → LOUP, autres → CIVIL), privée', () => {
    const expected: [RoleId, string][] = [
      ['werewolf', 'LOUP'], ['black_wolf', 'LOUP'], ['white_wolf', 'LOUP'],
      ['witch', 'CIVIL'], ['hunter', 'CIVIL'], ['salvateur', 'CIVIL'], ['cupid', 'CIVIL'], ['villager', 'CIVIL'],
    ];
    for (const [role, result] of expected) {
      const g = setup(['seer', role, 'werewolf', 'villager', 'villager', 'villager']);
      g.until('SEER_PHASE');
      g.act(0, 'seer', [1]);
      const mine = g.view(0).privateLog.filter((m) => m.kind === 'seer').map((m) => m.text);
      assert.deepEqual(mine, [`🔮 P1 : ${result}`], role);
      for (let i = 1; i < 6; i++) {
        const v = g.view(i);
        assert.ok(!v.privateLog.some((m) => m.kind !== 'role' && (m.kind === 'seer' || m.text.includes('🔮'))), `${role} : fuite vers P${i}`);
      }
    }
  });

  it('Voyante : pas de dernière parole à sa mort (les autres rôles en ont une)', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [1]);
    g.until('SUNRISE');
    assert.equal(g.alive(1), false);
    for (let i = 0; i < 20 && g.phase !== 'VOTING'; i++) {
      assert.notEqual(g.phase, 'DEATH_LAST_WORD', 'la Voyante ne doit pas avoir de dernière parole');
      g.skip();
    }
    // Un villageois éliminé au vote garde sa dernière parole.
    for (const i of [0, 2, 3, 4, 5]) g.act(i, 'vote', [i === 2 ? 3 : 2]);
    g.skip();
    assert.equal(g.phase, 'DEATH_LAST_WORD');
  });

  it('journal des nuits : secret pendant la partie, complet à la fin et dans le lobby', () => {
    const g = setup(['werewolf', 'witch', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    g.until('WITCH_PHASE');
    g.cmd(1, { action: 'witch', option: 'save' });
    g.until('SUNRISE');
    assert.deepEqual(g.engine.state.nightLog, [
      'Nuit 1 : 🐺 Les Loups attaquent P2 (Simple Villageois).',
      'Nuit 1 : 🧪 La Sorcière sauve P2 (Simple Villageois) (potion de vie).',
      'Nuit 1 : → Personne ne meurt.',
    ]);
    for (let i = 0; i < 5; i++) assert.equal(g.view(i).nightLog, null, 'secret pendant la partie');
    g.engine.state.status = 'finished';
    assert.equal(g.view(3).nightLog!.length, 3);
  });

  it('un seul Loup Noir par partie', () => {
    const e = GameEngine.create('TEST', T0, seededRng(1));
    const host = e.join('H', 'h', T0);
    rejects(() => e.updateSettings(host.id, { roles: { werewolf: 1, black_wolf: 2 } }, T0), 'BAD_SETTINGS');
  });

  it('Sorcière : 1re nuit seulement réanimer ; ensuite réanimer, empoisonner ou les deux', () => {
    const g = setup(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    assert.deepEqual(g.view(1).prompt!.options!.map((o) => o.id), ['none', 'save']);
    rejects(() => g.act(1, 'witch', [3], 'kill'), 'BAD_OPTION');
    g.act(1, 'witch', [], 'none');
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [3]);
    // Nuit 2 : l'une, l'autre, ou les deux.
    assert.deepEqual(g.view(1).prompt!.options!.map((o) => o.id), ['none', 'save', 'kill', 'save_kill']);
    g.act(1, 'witch', [4], 'kill');
    g.until('SUNRISE');
    assert.equal(g.alive(3), false);
    assert.equal(g.alive(4), false);
    assert.deepEqual(g.view(1).me.roleState, { potionVie: true, potionMort: false });
  });

  it('Sorcière : réanimer ET empoisonner la même nuit (à partir de la nuit 2)', () => {
    const g = setup(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    g.act(1, 'witch', [], 'none');
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [3]);
    g.act(1, 'witch', [4], 'save_kill');
    g.until('SUNRISE');
    assert.equal(g.alive(3), true);
    assert.equal(g.alive(4), false);
    assert.deepEqual(g.view(1).me.roleState, { potionVie: false, potionMort: false });
  });

  it('Sorcière (option de l’hôte) : une seule potion par nuit', () => {
    const g = setup(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager', 'villager'], { witchBothPotionsSameNight: false });
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    g.act(1, 'witch', [], 'none');
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [3]);
    assert.deepEqual(g.view(1).prompt!.options!.map((o) => o.id), ['none', 'save', 'kill']);
  });

  it('Sorcière : informée de la victime, potions uniques', () => {
    const g = setup(['werewolf', 'witch', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    assert.equal(g.phase, 'WITCH_PHASE');
    assert.ok(g.privateLog(1).includes('☠️ Cette nuit, les Loups-Garous ont attaqué P2.'));
    const p = g.view(1).prompt!;
    assert.deepEqual(p.options!.map((o) => o.id), ['none', 'save']);
    rejects(() => g.act(1, 'witch', [3], 'kill'), 'BAD_OPTION');
    g.act(1, 'witch', [], 'save');
    g.until('SUNRISE');
    assert.equal(g.alive(2), true);
    assert.ok(g.announcements().includes('🌅 Personne n’est mort cette nuit.'));
    // Nuit 2 : plus de potion de vie, potion de mort disponible.
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [3]);
    assert.deepEqual(g.view(1).prompt!.options!.map((o) => o.id), ['none', 'kill']);
    g.act(1, 'witch', [4], 'kill');
    g.until('SUNRISE');
    assert.equal(g.alive(3), false);
    assert.equal(g.alive(4), false);
    assert.deepEqual(g.view(1).me.roleState, { potionVie: false, potionMort: false });
  });

  it('Salvateur : protège de l’attaque, jamais deux fois de suite la même personne', () => {
    const g = setup(['werewolf', 'salvateur', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    g.act(1, 'protect', [2]);
    g.until('SUNRISE');
    assert.equal(g.alive(2), true);
    g.until('SALVATION_PHASE');
    assert.ok(!g.view(1).prompt!.targets.includes(g.ids[2]));
    rejects(() => g.act(1, 'protect', [2]), 'BAD_TARGET');
  });

  it('Loups : vote unanime = fin anticipée ; égalité départagée par le serveur', () => {
    const g = setup(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    assert.equal(g.phase, 'WEREWOLF_PHASE');
    // Les loups voient le choix de la meute.
    const info = g.view(1).prompt!.info!.packVotes as { targetId: string }[];
    assert.equal(info.find((v) => v.targetId)?.targetId, g.ids[2]);
    g.act(1, 'wolf_vote', [3]);
    g.skip();
    g.until('SUNRISE');
    const dead = [2, 3].filter((i) => !g.alive(i));
    assert.equal(dead.length, 1);
  });

  it('Voleur : échange sa carte la première nuit', () => {
    const g = setup(['thief', 'werewolf', 'villager', 'villager', 'villager'], {}, ['seer', 'villager']);
    g.until('THIEF_PHASE');
    const p = g.view(0).prompt!;
    assert.equal(p.title, '🃏 LE VOLEUR');
    assert.match(p.description, /Choisis ton destin/);
    assert.deepEqual(p.options!.map((o) => o.id), ['0', '1']); // doit choisir l'une des deux cartes
    g.cmd(0, { action: 'thief', option: '0' });
    assert.ok(g.privateLog(0).some((m) => m.includes('Ton nouveau rôle est secret')));
    // Aucun autre joueur ne reçoit la moindre information sur l'échange.
    for (const i of [1, 2, 3, 4]) {
      const json = JSON.stringify(g.view(i));
      assert.ok(!json.includes('Voyante') || !json.includes('"seer"') || !g.view(i).privateLog.some((m) => m.kind === 'thief'), `fuite vers P${i}`);
      assert.ok(!g.view(i).announcements.some((a) => /Voleur|vol/i.test(a.text)), `annonce vers P${i}`);
    }
    assert.equal(g.engine.state.players[0].role, 'seer');
    assert.equal(g.view(0).me.role!.id, 'seer');
    g.until('SEER_PHASE');
    assert.equal(g.view(0).prompt!.action, 'seer');
  });

  it('Voleur : doit prendre un loup si les deux cartes sont des loups', () => {
    const g = setup(['thief', 'werewolf', 'villager', 'villager', 'villager'], {}, ['werewolf', 'werewolf']);
    g.until('THIEF_PHASE');
    assert.match(g.view(0).prompt!.description, /tu dois en prendre une/);
    g.skip(); // temps écoulé → une des deux cartes (toutes deux Loups)
    assert.equal(g.engine.state.players[0].role, 'werewolf');
    assert.equal(g.view(0).prompt!.action, 'wolf_vote');
  });

  it('par défaut, saute le tour d’un rôle mort (pas de compte à rebours inutile)', () => {
    const g = setup(['werewolf', 'witch', 'villager', 'villager', 'villager'], { simulateInactiveSteps: undefined });
    assert.equal(g.engine.state.settings.simulateInactiveSteps, false);
    g.engine.state.players[1].alive = false;
    const seen: string[] = [];
    while (g.phase !== 'SUNRISE') {
      seen.push(g.phase);
      g.skip();
    }
    assert.ok(!seen.includes('WITCH_PHASE'), seen.join(' → '));
  });

  it('saute le tour d’un rôle mort même si l’ancien réglage « simuler » est resté coché', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager'], { simulateInactiveSteps: true });
    g.engine.state.players[1].alive = false;
    const seen: string[] = [];
    while (g.phase !== 'SUNRISE') {
      seen.push(g.phase);
      g.skip();
    }
    assert.ok(!seen.includes('SEER_PHASE'), seen.join(' → '));
  });
});

describe('Jour', () => {
  function toDay() {
    const g = setup(['werewolf', 'hunter', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [5]);
    g.until('SUNRISE');
    return g;
  }

  it('annonce les morts sans révéler le rôle, puis dernière parole de 30 s avec FINIR', () => {
    const g = toDay();
    assert.ok(g.announcements().includes('💀 P5 est mort cette nuit.'));
    assert.ok(!g.announcements().some((a) => a.includes('Villageois')));
    g.skip();
    assert.equal(g.phase, 'DEATH_LAST_WORD');
    const st = g.engine.state.phase;
    assert.equal(st.endsAt! - st.startedAt, 30_000);
    // Seul le mort parle.
    assert.equal(g.view(5).voice.canSpeak, true);
    assert.equal(g.view(2).voice.canSpeak, false);
    assert.ok(g.view(2).voice.hearFrom.includes(g.ids[5]));
    rejects(() => g.act(2, 'finish'), 'NOT_YOUR_TURN');
    g.act(5, 'finish');
    assert.equal(g.phase, 'PLAYER_SPEECH');
    assert.equal(g.view(5).voice.canSpeak, false);
  });

  it('tours de parole de 45 s, un seul micro, ordre décidé par le serveur', () => {
    const g = toDay();
    g.until('PLAYER_SPEECH');
    const order = g.view(0).phase.speechOrder!;
    assert.equal(order.length, 5);
    for (const id of order) {
      const v = g.engine.view(id, g.now);
      assert.equal(v.phase.speakerId, id);
      assert.equal(v.voice.canSpeak, true);
      const speakers = g.ids.filter((pid) => g.engine.view(pid, g.now).voice.canSpeak);
      assert.deepEqual(speakers, [id]);
      assert.equal(g.engine.state.phase.endsAt! - g.engine.state.phase.startedAt, 45_000);
      g.engine.command(id, { action: 'finish' }, g.now);
    }
    assert.equal(g.phase, 'FREE_DISCUSSION');
    assert.equal(g.view(0).voice.canSpeak, true);
    assert.equal(g.view(5).voice.canSpeak, false); // mort
  });

  it('vote secret : aucune information sur les votes des autres, rôle non révélé', () => {
    const g = toDay();
    g.until('VOTING');
    g.act(0, 'vote', [2]);
    g.act(1, 'vote', [2]);
    const v = g.view(3);
    assert.equal(v.vote!.hasVoted, false);
    const raw = JSON.stringify(v);
    assert.ok(!raw.includes('ballots'));
    assert.equal(g.view(0).vote!.myVote, g.ids[2]);
    rejects(() => g.act(5, 'vote', [2]), 'NOT_YOUR_TURN'); // les morts ne votent pas
    rejects(() => g.act(2, 'vote', [2]), 'BAD_TARGET'); // pas contre soi
    g.act(2, 'vote', [3]);
    g.act(3, 'vote', [2]);
    g.act(4, 'vote', [2]);
    assert.equal(g.phase, 'VOTE_RESULT'); // tous ont voté
    assert.ok(g.announcements().includes('⚖️ Le village a choisi P2.'));
    assert.equal(g.alive(2), false);
    assert.ok(!g.announcements().some((a) => a.includes('Villageois')));
  });

  it('les votes sont dévoilés au résultat (qui a voté contre qui), jamais pendant le vote', () => {
    const g = toDay();
    g.until('VOTING');
    g.act(0, 'vote', [2]);
    g.act(1, 'vote', [2]);
    assert.equal(g.view(3).phase.votes, null);
    g.act(2, 'vote', [3]);
    g.act(3, 'vote', [2]);
    g.act(4, 'vote', [1]);
    assert.equal(g.phase, 'VOTE_RESULT');
    const votes = g.view(4).phase.votes!;
    assert.equal(votes.length, 5);
    assert.deepEqual(votes.find((x) => x.voterId === g.ids[2]), { voterId: g.ids[2], targetId: g.ids[3], weight: 1 });
    assert.ok(g.announcements().some((a) => a.startsWith('🗳️ Votes :') && a.includes('P0 → P2')));
    g.skip();
    assert.equal(g.view(4).phase.votes, null);
  });

  it('option désactivée : les votes restent secrets même au résultat', () => {
    const g = setup(['werewolf', 'hunter', 'villager', 'villager', 'villager', 'villager'], { revealVotes: false });
    g.until('VOTING');
    for (const i of [0, 1, 2, 3, 4, 5]) g.act(i, 'vote', [i === 2 ? 3 : 2]);
    assert.equal(g.phase, 'VOTE_RESULT');
    assert.equal(g.view(1).phase.votes, null);
    assert.ok(!g.announcements().some((a) => a.startsWith('🗳️')));
  });

  it('égalité (règle par défaut) : les ex æquo reprennent la parole puis revote entre eux seulement', () => {
    const g = toDay();
    g.until('VOTING');
    // P2 et P3 à égalité (2 voix chacun).
    g.act(0, 'vote', [2]);
    g.act(1, 'vote', [2]);
    g.act(2, 'vote', [3]);
    g.act(4, 'vote', [3]);
    g.act(3, 'vote', [0]);
    assert.equal(g.phase, 'VOTE_RESULT');
    assert.ok(g.announcements().some((a) => a.startsWith('⚖️ Égalité entre P2 et P3')));
    assert.ok(g.alive(2) && g.alive(3));
    // Parole : P2 puis P3, au micro, seuls.
    g.skip();
    assert.equal(g.phase, 'PLAYER_SPEECH');
    assert.equal(g.view(0).phase.speakerId, g.ids[2]);
    assert.equal(g.view(2).voice.canSpeak, true);
    assert.equal(g.view(0).voice.canSpeak, false);
    g.act(2, 'finish');
    assert.equal(g.view(0).phase.speakerId, g.ids[3]);
    g.act(3, 'finish');
    // Revote limité aux ex æquo (jamais pour soi-même), sans discussion libre.
    assert.equal(g.phase, 'VOTING');
    assert.deepEqual(g.view(0).prompt!.targets.sort(), [g.ids[2], g.ids[3]].sort());
    assert.match(g.view(0).prompt!.title, /Revote/);
    rejects(() => g.act(0, 'vote', [4]), 'BAD_TARGET');
    // Les ex æquo ne votent pas au revote.
    for (const i of [2, 3]) {
      assert.equal(g.view(i).prompt, null);
      assert.equal(g.view(i).me.runoffCandidate, true);
      rejects(() => g.act(i, 'vote', [i === 2 ? 3 : 2]));
    }
    assert.equal(g.view(0).me.runoffCandidate, false);
    g.act(0, 'vote', [3]);
    g.act(1, 'vote', [3]);
    g.act(4, 'vote', [2]);
    assert.equal(g.phase, 'VOTE_RESULT'); // tous les votants ont voté : résultat du revote
    g.skip();
    assert.equal(g.phase, 'DEATH_LAST_WORD');
    assert.equal(g.alive(3), false);
    assert.equal(g.engine.state.runoff, null);
  });

  it('égalité au revote : personne n’est éliminé', () => {
    const g = toDay();
    g.until('VOTING');
    for (const [i, t] of [[0, 2], [1, 2], [2, 3], [4, 3], [3, 0]]) g.act(i, 'vote', [t]);
    g.skip(); // parole P2
    g.act(2, 'finish');
    g.act(3, 'finish');
    for (const [i, t] of [[0, 2], [4, 3]]) g.act(i, 'vote', [t]); // P1 s'abstient
    g.skip();
    assert.equal(g.phase, 'VOTE_RESULT');
    assert.ok(g.announcements().some((a) => a.includes('Nouvelle égalité')));
    assert.ok(g.alive(2) && g.alive(3));
    g.skip();
    assert.notEqual(g.phase, 'PLAYER_SPEECH'); // pas de troisième tour : la nuit tombe
  });

  it('égalité avec la règle « personne » : personne n’est éliminé', () => {
    const g = toDay();
    g.engine.state.settings.tieRule = 'none';
    g.until('VOTING');
    g.act(0, 'vote', [2]);
    g.act(1, 'vote', [3]);
    g.skip();
    assert.equal(g.phase, 'VOTE_RESULT');
    assert.ok(g.announcements().some((a) => a.includes('Personne n’est éliminé')));
  });

  it('Chasseur : tire à sa mort et la victime a aussi sa dernière parole', () => {
    const g = toDay();
    g.until('VOTING');
    for (const i of [0, 2, 3, 4]) g.act(i, 'vote', [1]);
    g.act(1, 'vote', [2]);
    g.skip(); // VOTE_RESULT
    assert.equal(g.phase, 'DEATH_LAST_WORD');
    g.act(1, 'finish');
    assert.equal(g.phase, 'HUNTER_SHOT');
    assert.equal(g.view(3).phase.subjectId, g.ids[1]);
    rejects(() => g.act(2, 'hunter_shot', [0]), 'NOT_YOUR_TURN');
    g.act(1, 'hunter_shot', [0]);
    assert.equal(g.alive(0), false);
    assert.equal(g.phase, 'DEATH_LAST_WORD');
    g.act(0, 'finish');
    assert.equal(g.phase, 'GAME_OVER');
    assert.equal(g.engine.state.winner!.camp, 'village');
  });

  it('Capitaine : élu le premier jour, voix double, succession à sa mort', () => {
    const g = setup(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'], { captainEnabled: true });
    g.until('CAPTAIN_ELECTION');
    for (let i = 0; i < 6; i++) g.act(i, 'vote', [1]);
    g.skip();
    assert.equal(g.engine.state.captainId, g.ids[1]);
    assert.equal(g.view(1).me.isCaptain, true);
    assert.equal(g.view(0).phase.speechOrder![0], g.ids[1]); // la parole commence par le Capitaine
    g.until('VOTING');
    // Capitaine (voix double) + P0 votent P3 = 3 voix ; P2 + P5 votent P4 = 2 voix.
    g.act(1, 'vote', [3]);
    g.act(2, 'vote', [4]);
    g.act(5, 'vote', [4]);
    g.act(0, 'vote', [3]);
    g.skip();
    assert.ok(g.announcements().includes('⚖️ Le village a choisi P3.'));
    // Mort du Capitaine → succession.
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [1]);
    g.until('SUNRISE');
    g.skip();
    g.act(1, 'finish');
    assert.equal(g.phase, 'CAPTAIN_SUCCESSION');
    g.act(1, 'captain_successor', [2]);
    assert.equal(g.engine.state.captainId, g.ids[2]);
  });
});

describe('Morts & chats', () => {
  it('le chat des morts est invisible aux vivants et les morts n’écrivent pas chez les vivants', () => {
    const g = setup(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.engine.chat(g.ids[0], 'wolves', 'on mange P4 ?', g.now);
    rejects(() => g.engine.chat(g.ids[1], 'wolves', 'je suis loup', g.now), 'FORBIDDEN');
    assert.equal(g.view(1).chats.wolves, undefined);
    g.act(0, 'wolf_vote', [4]);
    g.until('FREE_DISCUSSION');
    g.engine.chat(g.ids[4], 'dead', 'les vivants ne lisent pas ceci', g.now);
    rejects(() => g.engine.chat(g.ids[4], 'village', 'c’est P0 !', g.now), 'FORBIDDEN');
    g.engine.chat(g.ids[1], 'village', 'bonjour', g.now);
    rejects(() => g.engine.chat(g.ids[1], 'dead', 'coucou', g.now), 'FORBIDDEN');
    assert.equal(g.view(1).chats.dead, undefined);
    assert.equal(g.view(4).chats.dead!.length, 1);
    assert.equal(g.view(4).chatWrite.village, false);
  });

  it('pendant la phase des loups, seuls les loups parlent et s’entendent', () => {
    const g = setup(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    assert.deepEqual(g.view(0).voice.hearFrom, [g.ids[1]]);
    assert.deepEqual(g.view(0).voice.speakTo, [g.ids[1]]);
    assert.equal(g.view(2).voice.canSpeak, false);
    assert.deepEqual(g.view(2).voice.hearFrom, []);
  });
});

describe('Conditions de victoire', () => {
  it('victoire des loups quand tous les villageois sont morts', () => {
    const g = setup(['werewolf', 'villager', 'villager', 'villager']);
    g.engine.state.players[2].alive = false;
    g.engine.state.players[3].alive = false;
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [1]);
    g.until('GAME_OVER');
    assert.equal(g.engine.state.winner!.camp, 'wolves');
    assert.deepEqual(g.engine.state.winner!.winnerIds, [g.ids[0]]);
  });

  it('Loup-Blanc : camp indépendant, gagne seul', () => {
    const g = setup(['werewolf', 'white_wolf', 'villager', 'villager']);
    g.engine.state.players[3].alive = false;
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    g.act(1, 'wolf_vote', [2]);
    g.until('PLAYER_SPEECH');
    // Loup + Loup-Blanc survivants : pas de victoire des loups.
    assert.equal(g.engine.state.status, 'running');
    g.until('WHITE_WOLF_PHASE');
    g.act(1, 'white_wolf', [0]);
    g.until('GAME_OVER');
    assert.equal(g.engine.state.winner!.camp, 'white_wolf');
  });

  it('amoureux de camps opposés : gagnent s’ils sont les derniers', () => {
    const g = setup(['werewolf', 'cupid', 'villager', 'villager']);
    g.until('CUPID_PHASE');
    g.act(1, 'cupid', [0, 2]);
    g.act(0, 'wolf_vote', [3]);
    g.until('VOTING');
    g.act(0, 'vote', [1]);
    g.act(2, 'vote', [1]);
    g.act(1, 'vote', [0]);
    g.until('GAME_OVER');
    assert.equal(g.engine.state.winner!.camp, 'lovers');
    assert.deepEqual(new Set(g.engine.state.winner!.winnerIds), new Set([g.ids[0], g.ids[2]]));
  });

  it('les rôles ne sont révélés qu’en fin de partie', () => {
    const g = setup(['werewolf', 'villager', 'villager', 'villager']);
    assert.equal(g.view(1).finalRoles, null);
    g.engine.state.players[2].alive = false;
    g.engine.state.players[3].alive = false;
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [1]);
    g.until('GAME_OVER');
    assert.equal(g.view(1).finalRoles!.find((r) => r.id === g.ids[0])!.role, 'werewolf');
  });
});

describe('Fin de partie, étiquettes et loups automatiques', () => {
  it('victoire → 5 secondes → tout le monde revient au lobby (même code, mêmes joueurs, même Hôte)', () => {
    const g = setup(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    g.engine.leave(g.ids[0], g.now); // le seul loup s'en va : victoire du village
    const s = g.engine.state;
    assert.equal(s.phase.id, 'GAME_OVER');
    g.ids.shift();
    assert.equal(s.status, 'finished');
    assert.equal(s.phase.endsAt! - s.phase.startedAt, 5000);
    const hostId = s.hostId;
    g.advance(4900);
    assert.equal(s.status, 'finished', 'écran de victoire encore affiché');
    g.advance(200);
    assert.equal(s.status, 'lobby');
    assert.equal(s.phase.id, 'LOBBY');
    assert.equal(s.code, 'TEST');
    assert.equal(s.hostId, hostId);
    assert.deepEqual(s.players.map((p) => p.id), g.ids);
    assert.ok(s.players.every((p) => p.role === null && p.alive));
    assert.equal(g.view(2).me.role, null);
    // Une nouvelle partie peut être lancée directement.
    g.engine.start(hostId, g.now);
    assert.equal(g.engine.state.status, 'running');
  });

  it('étiquette personnelle : visible uniquement par son auteur', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    g.engine.setTag(g.ids[0], g.ids[3], '❤️ Mon amie', g.now);
    g.engine.setTag(g.ids[1], g.ids[3], '🐺 Suspect', g.now);
    assert.deepEqual(g.view(0).myTags, { [g.ids[3]]: '❤️ Mon amie' });
    assert.deepEqual(g.view(1).myTags, { [g.ids[3]]: '🐺 Suspect' });
    assert.deepEqual(g.view(2).myTags, {});
    for (const i of [1, 2, 3, 4]) assert.ok(!JSON.stringify(g.view(i)).includes('Mon amie'), `fuite vers P${i}`);
    for (const i of [0, 2, 3, 4]) assert.ok(!JSON.stringify(g.view(i)).includes('Suspect'), `fuite vers P${i}`);
    g.engine.setTag(g.ids[0], g.ids[3], '', g.now); // suppression
    assert.deepEqual(g.view(0).myTags, {});
    g.engine.setTag(g.ids[0], g.ids[2], '<b>' + 'x'.repeat(50), g.now);
    assert.equal(g.view(0).myTags[g.ids[2]], 'b' + 'x'.repeat(23));
    rejects(() => g.engine.setTag(g.ids[0], 'inconnu', 'a', g.now), 'BAD_TARGET');
  });

  it('nombre de loups automatique : 8 → 2, 9 → 3, 11 → 3, 12 → 4, 18 → 4', () => {
    const e = GameEngine.create('W', T0, seededRng(3));
    const host = e.join('H', 'h', T0);
    const expected: Record<number, number> = { 5: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 4, 15: 4, 18: 4 };
    for (let n = 2; n <= 18; n++) {
      e.join(`J${n}`, `t${n}`, T0);
      if (expected[n]) assert.equal(e.state.settings.roles.werewolf, expected[n], `${n} joueurs`);
    }
    // Un départ met aussi la jauge à jour.
    const last = e.state.players[e.state.players.length - 1];
    for (let i = 0; i < 7; i++) e.leave(e.state.players[e.state.players.length - 1].id, T0);
    assert.equal(e.state.players.length, 11);
    assert.equal(e.state.settings.roles.werewolf, 3);
    assert.ok(last);
    // Désactivable par l'Hôte : le nombre choisi à la main est alors conservé.
    e.updateSettings(host.id, { autoWolves: false, roles: { werewolf: 1, seer: 1 } }, T0);
    e.join('Nouveau', 'n', T0);
    assert.equal(e.state.settings.roles.werewolf, 1);
    // La partie lancée a bien le nombre de loups de la règle.
    e.updateSettings(host.id, { autoWolves: true }, T0);
    e.start(host.id, T0);
    assert.equal(e.state.players.filter((p) => p.role === 'werewolf').length, 4);
  });

  it('les rôles changent d’une partie à l’autre : personne ne garde le même rôle spécial', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const e = GameEngine.create('R', T0, seededRng(seed));
      const host = e.join('H', 'h', T0);
      for (let i = 0; i < 7; i++) e.join(`J${i}`, `t${i}`, T0);
      e.updateSettings(host.id, { roles: { seer: 1, witch: 1, hunter: 1, cupid: 1 } }, T0);
      e.start(host.id, T0);
      const first = new Map(e.state.players.map((p) => [p.id, p.role]));
      e.leave(host.id, T0 + 1); // fin rapide : abandon de l'Hôte… on force simplement la fin
      e.state.status = 'finished';
      e.state.phase = { ...e.state.phase, id: 'GAME_OVER', endsAt: T0 + 5000 };
      e.tick(T0 + 6000);
      assert.equal(e.state.status, 'lobby');
      e.start(e.state.hostId, T0 + 7000);
      for (const p of e.state.players) {
        const before = first.get(p.id);
        if (before && before !== 'villager') assert.notEqual(p.role, before, `seed ${seed} : ${p.name} garde ${before}`);
      }
    }
  });
});

describe('Maps', () => {
  it('liste des maps identique côté serveur et navigateur ; map inconnue refusée', async () => {
    const { MAPS } = await import('../src/shared/maps.ts');
    const fs = await import('node:fs');
    const client = fs.readFileSync(new URL('../public/js/maps.js', import.meta.url), 'utf8');
    const ids = [...client.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
    assert.deepEqual(ids, MAPS.map((m) => m.id));
    for (const id of ids) assert.ok(fs.existsSync(new URL(`../public/assets/decor/${id}.json`, import.meta.url)), id);
    const e = GameEngine.create('M', T0, seededRng(1));
    const host = e.join('H', 'h', T0);
    assert.equal(e.state.settings.map, 'blackops');
    rejects(() => e.updateSettings(host.id, { map: 'inconnue' }, T0), 'BAD_SETTINGS');
  });
});

describe('Fin anticipée', () => {
  it('victoire des Loups dès que le village ne peut plus gagner (parité, sans pouvoir restant)', () => {
    const g = setup(['werewolf', 'werewolf', 'villager', 'villager'], { wolvesWinAtParity: true });
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [2]);
    g.act(1, 'wolf_vote', [2]);
    g.until('GAME_OVER');
    assert.equal(g.engine.state.winner!.camp, 'wolves');
    assert.equal(g.engine.state.dayNumber, 1); // pas besoin d'attendre une journée de plus
  });

  it('2 Loups contre un Chasseur seul (ou une Sorcière seule) : fin immédiate, il ne peut en tuer qu’un', () => {
    for (const special of ['witch', 'hunter']) {
      const g = setup(['werewolf', 'werewolf', special, 'villager'], { wolvesWinAtParity: true });
      g.until('WEREWOLF_PHASE');
      g.act(0, 'wolf_vote', [3]);
      g.act(1, 'wolf_vote', [3]);
      if (special === 'witch') {
        g.until('WITCH_PHASE');
        g.act(2, 'witch', [], 'none');
      }
      g.until('GAME_OVER');
      assert.equal(g.engine.state.winner!.camp, 'wolves', special);
    }
  });

  it('pas de fin anticipée si le village peut encore tuer tous les loups (Chasseur + Sorcière contre 2 Loups)', () => {
    const g = setup(['werewolf', 'werewolf', 'hunter', 'witch', 'villager'], { wolvesWinAtParity: true });
    g.until('WEREWOLF_PHASE');
    g.act(0, 'wolf_vote', [4]);
    g.act(1, 'wolf_vote', [4]);
    g.until('WITCH_PHASE');
    g.act(3, 'witch', [], 'none');
    g.until('SUNRISE');
    assert.equal(g.alive(4), false);
    assert.equal(g.engine.state.status, 'running');
  });
});

describe('Loup Noir', () => {
  function night1() {
    // P0 Loup Noir, P1 Loup-Garou, P2 Voyante, P3 Sorcière, P4-P6 villageois
    const g = setup(['black_wolf', 'werewolf', 'seer', 'witch', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    return g;
  }

  it('choix TUER / INFECTER réservé au Loup Noir ; la meute voit son choix', () => {
    const g = night1();
    assert.deepEqual(g.view(0).prompt!.options!.map((o) => o.id), ['kill', 'infect']);
    assert.equal(g.view(1).prompt!.options, undefined);
    rejects(() => g.cmd(1, { action: 'wolf_vote', targets: [], option: 'infect' }), 'BAD_OPTION');
    g.cmd(0, { action: 'wolf_vote', targets: [], option: 'infect' });
    assert.equal((g.view(1).prompt!.info as any).blackWolf.mode, 'infect');
    // Les villageois ne voient rien de tout cela.
    assert.equal(g.view(4).prompt, null);
  });

  it('INFECTER : la victime survit, garde son rôle, rejoint secrètement la meute ; Voyante → LOUP', () => {
    const g = night1();
    g.cmd(0, { action: 'wolf_vote', targets: [g.ids[4]], option: 'infect' });
    g.act(1, 'wolf_vote', [4]);
    g.until('SUNRISE');
    const victim = g.engine.state.players[4];
    assert.equal(victim.alive, true);
    assert.equal(victim.role, 'villager');
    assert.equal(victim.infected, true);
    assert.ok(g.announcements().includes('🌅 Personne n’est mort cette nuit.'));
    // Personne au village n'est informé ; l'infecté et la meute le savent.
    assert.equal(g.view(4).me.infected, true);
    assert.ok(g.view(4).me.pack!.some((w) => w.id === g.ids[0]));
    assert.ok(g.view(1).me.pack!.some((w) => w.id === g.ids[4]));
    for (const i of [2, 3, 5, 6]) {
      assert.equal(g.view(i).me.pack, null);
      const v = g.view(i);
      assert.equal(v.me.infected, false, `P${i}`);
      assert.ok(!v.privateLog.some((m) => m.kind !== 'role' && /infect/i.test(m.text)), `fuite (message privé) vers P${i}`);
      assert.ok(!v.announcements.some((a) => /infect/i.test(a.text)), `fuite (annonce) vers P${i}`);
      assert.ok(!JSON.stringify(v.players).includes('infect'), `fuite (joueurs) vers P${i}`);
    }
    // Pouvoir épuisé : plus de bouton INFECTER.
    assert.equal(g.engine.state.players[0].roleData.infect, false);
    g.until('WEREWOLF_PHASE');
    assert.equal(g.view(0).prompt!.options, undefined);
    // L'infecté se réveille avec la meute et ne peut pas être ciblé par elle.
    assert.equal(g.view(4).prompt!.action, 'wolf_vote');
    assert.ok(!g.view(0).prompt!.targets.includes(g.ids[4]));
    g.act(0, 'wolf_vote', [5]);
    g.act(1, 'wolf_vote', [5]);
    g.act(4, 'wolf_vote', [5]);
    g.until('SEER_PHASE');
    g.act(2, 'seer', [4]);
    assert.ok(g.privateLog(2).some((m) => m === `🔮 P4 : LOUP`));
  });

  it('meute d’accord : fin après un délai FIXE de 5 s, identique pour TUER et INFECTER', () => {
    const ends: number[] = [];
    for (const mode of ['kill', 'infect'] as const) {
      const g = night1();
      g.act(1, 'wolf_vote', [4]);
      g.act(0, 'wolf_vote', [4]); // le Loup Noir touche la victime avant de choisir
      assert.equal(g.phase, 'WEREWOLF_PHASE', 'il a encore le temps de choisir');
      g.cmd(0, { action: 'wolf_vote', targets: [], option: mode });
      assert.equal(g.phase, 'WEREWOLF_PHASE', 'pas de fin immédiate : la durée ne doit rien révéler');
      ends.push(g.engine.state.phase.endsAt! - g.now);
      g.skip();
      assert.notEqual(g.phase, 'WEREWOLF_PHASE');
      assert.equal(!!g.engine.state.players[4].infected, mode === 'infect');
    }
    assert.deepEqual(ends, [5000, 5000]);
  });

  it('sans choix du Loup Noir : TUER à la fin du temps', () => {
    const g = night1();
    g.act(1, 'wolf_vote', [5]);
    g.act(0, 'wolf_vote', [5]);
    g.skip();
    g.until('SUNRISE');
    assert.equal(g.engine.state.players[5].alive, false);
    assert.equal(g.engine.state.players[0].roleData.infect, true);
  });

  it('TUER : la victime meurt normalement et le pouvoir reste disponible', () => {
    const g = night1();
    g.cmd(0, { action: 'wolf_vote', targets: [g.ids[5]], option: 'kill' });
    g.act(1, 'wolf_vote', [5]);
    g.until('SUNRISE');
    assert.equal(g.alive(5), false);
    assert.equal(g.engine.state.players[0].roleData.infect, true);
  });

  it('le Loup Noir compte parmi les loups prévus (nombre total de loups inchangé)', () => {
    const e = GameEngine.create('B', T0, seededRng(2));
    const host = e.join('H', 'h', T0);
    for (let i = 0; i < 9; i++) e.join(`J${i}`, `t${i}`, T0); // 10 joueurs → 3 loups
    e.updateSettings(host.id, { roles: { black_wolf: 1, seer: 1 } }, T0);
    assert.equal(e.state.settings.roles.werewolf, 2);
    e.start(host.id, T0);
    const wolves = e.state.players.filter((p) => p.role === 'werewolf' || p.role === 'black_wolf');
    assert.equal(wolves.length, 3);
  });
});

