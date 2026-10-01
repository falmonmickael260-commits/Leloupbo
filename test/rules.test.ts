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
    e.updateSettings(host.id, { roles: { werewolf: 18 } }, T0);
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

  it('Sorcière : informée de la victime, pas de potion de mort la 1re nuit, potions uniques', () => {
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
    assert.ok(p.options!.some((o) => o.id === 'keep'));
    g.cmd(0, { action: 'thief', option: '0' });
    assert.equal(g.engine.state.players[0].role, 'seer');
    assert.equal(g.view(0).me.role!.id, 'seer');
    g.until('SEER_PHASE');
    assert.equal(g.view(0).prompt!.action, 'seer');
  });

  it('Voleur : doit prendre un loup si les deux cartes sont des loups', () => {
    const g = setup(['thief', 'werewolf', 'villager', 'villager', 'villager'], {}, ['werewolf', 'werewolf']);
    g.until('THIEF_PHASE');
    assert.ok(!g.view(0).prompt!.options!.some((o) => o.id === 'keep'));
    g.skip(); // timeout → prend la première carte
    assert.equal(g.engine.state.players[0].role, 'werewolf');
    assert.equal(g.view(0).prompt!.action, 'wolf_vote');
  });

  it('simule les phases d’un rôle mort pour ne pas révéler sa mort', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    g.engine.state.players[1].alive = false;
    g.until('SEER_PHASE');
    assert.equal(g.engine.state.phase.data.inactive, true);
    const v = g.view(2);
    assert.equal(v.phase.id, 'SEER_PHASE');
    assert.ok(!/"inactive"\s*:/.test(JSON.stringify(v)));
    assert.equal(g.view(1).prompt, null);
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

  it('égalité : personne n’est éliminé (règle par défaut)', () => {
    const g = toDay();
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
