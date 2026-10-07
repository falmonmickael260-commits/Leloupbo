import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp } from '../src/server/app.ts';
import { MemoryGameStore } from '../src/server/store.ts';
import type { PlayerView } from '../src/shared/types.ts';

type Client = Socket & { lastView?: PlayerView };

async function startServer(store = new MemoryGameStore()) {
  const { http, manager, io } = createApp(store, { botDelay: [10, 30] });
  await manager.restore();
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as AddressInfo).port;
  return {
    store,
    manager,
    url: `http://localhost:${port}`,
    async close() {
      manager.stop();
      io.close();
      await new Promise((r) => http.close(r));
    },
  };
}

function client(url: string): Promise<Client> {
  return new Promise((resolve) => {
    const c = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
    c.on('view', (v: PlayerView) => (c.lastView = v));
    c.on('connect', () => resolve(c));
  });
}

const emit = <T = any>(c: Socket, ev: string, payload: unknown = {}) =>
  new Promise<T>((resolve) => c.emit(ev, payload, (r: T) => resolve(r)));

const waitFor = async (pred: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const sockets: Client[] = [];
after(() => sockets.forEach((s) => s.close()));

describe('Serveur temps réel', () => {
  it('création, connexion, lancement, reconnexion et redémarrage serveur', { timeout: 20_000 }, async () => {
    const srv = await startServer();
    const host = await client(srv.url);
    sockets.push(host);
    const created = await emit(host, 'game:create', { name: 'Alice' });
    assert.equal(created.ok, true);
    const { code, token } = created;

    const others: Client[] = [];
    const tokens: string[] = [];
    for (const name of ['Bob', 'Chloé', 'David']) {
      const c = await client(srv.url);
      sockets.push(c);
      const r = await emit(c, 'game:join', { code, name });
      assert.equal(r.ok, true);
      tokens.push(r.token);
      others.push(c);
    }
    const bad = await emit(others[0], 'lobby:settings', { roles: { werewolf: 2 } });
    assert.equal(bad.ok, false); // seul l'hôte

    assert.equal((await emit(host, 'lobby:settings', { roles: { werewolf: 1, seer: 1 }, captainEnabled: false })).ok, true);
    assert.equal((await emit(host, 'game:start')).ok, true);
    await waitFor(() => others[2].lastView?.status === 'running');

    // Chaque client ne reçoit que son propre rôle.
    const roleOf = new Map<string, string>();
    for (const c of [host, ...others]) {
      const v = c.lastView!;
      assert.ok(v.me.role);
      roleOf.set(v.me.id, v.me.role!.id);
      for (const p of v.players) assert.equal((p as any).role, undefined);
    }

    // Reconnexion : nouvelle socket, même jeton → même joueur, même rôle.
    const bobId = others[0].lastView!.me.id;
    others[0].close();
    await waitFor(() => host.lastView!.players.find((p) => p.id === bobId)!.connected === false);
    const bob2 = await client(srv.url);
    sockets.push(bob2);
    const resumed = await emit(bob2, 'session:resume', { code, token: tokens[0] });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.playerId, bobId);
    await waitFor(() => !!bob2.lastView);
    assert.equal(bob2.lastView!.me.role!.id, roleOf.get(bobId));
    assert.equal((await emit(bob2, 'session:resume', { code, token: 'faux' })).ok, false);

    // Redémarrage complet du serveur : la partie est restaurée depuis le stockage.
    const phaseBefore = srv.manager.getState(code)!.phase.seq;
    await new Promise((r) => setTimeout(r, 50));
    await srv.close();
    const srv2 = await startServer(srv.store);
    const back = await client(srv2.url);
    sockets.push(back);
    const r2 = await emit(back, 'session:resume', { code, token });
    assert.equal(r2.ok, true);
    await waitFor(() => !!back.lastView);
    assert.equal(back.lastView!.status, 'running');
    assert.ok(back.lastView!.phase.seq >= phaseBefore);
    assert.equal(back.lastView!.me.role!.id, roleOf.get(back.lastView!.me.id));
    await srv2.close();
  });

  it('une partie complète avec des bots se termine côté serveur (timers réels)', { timeout: 30_000 }, async () => {
    const srv = await startServer();
    const host = await client(srv.url);
    sockets.push(host);
    const { code } = await emit(host, 'game:create', { name: 'Hôte' });
    for (let i = 0; i < 5; i++) assert.equal((await emit(host, 'lobby:addBot')).ok, true);
    const state = srv.manager.getState(code)!;
    await emit(host, 'lobby:settings', { roles: { werewolf: 1, seer: 1, witch: 1 }, durationPreset: 'fast', captainEnabled: false });
    // Timers raccourcis à l'extrême pour le test.
    for (const k of Object.keys(state.settings.durations)) (state.settings.durations as any)[k] = 60;
    assert.equal((await emit(host, 'game:start')).ok, true);
    // L'humain joue au hasard via son prompt.
    host.on('view', (v: PlayerView) => {
      if (v.phase.canFinish) host.emit('game:command', { action: 'finish' }, () => {});
      else if (v.prompt && !v.prompt.submitted) {
        const t = v.prompt.targets.filter((x) => x !== v.me.id);
        const n = Math.max(v.prompt.minTargets, Math.min(1, v.prompt.maxTargets));
        host.emit('game:command', { action: v.prompt.action, targets: (n >= 2 ? v.prompt.targets : t).slice(0, n), option: v.prompt.options?.[0]?.id }, () => {});
      }
    });
    await waitFor(() => host.lastView?.status === 'finished', 20000);
    assert.ok(host.lastView!.winner);
    assert.ok(host.lastView!.finalRoles);
    await srv.close();
  });
});

describe('Voix — serveur audio LiveKit', () => {
  it('jeton et droits calqués sur les permissions du moteur (orateur seul, canal des Loups)', async () => {
    const { LiveKitBridge, sfuConfigFromEnv } = await import('../src/server/voiceSfu.ts');
    const { iceServersFromEnv } = await import('../src/server/ice.ts');
    const { setup } = await import('./helpers.ts');
    assert.equal(sfuConfigFromEnv({}), null);
    assert.deepEqual(sfuConfigFromEnv({ LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }), { url: 'wss://x', apiKey: 'k', apiSecret: 's' });
    // Copier-coller approximatif : espaces, guillemets, https://, autre nom de variable.
    assert.deepEqual(sfuConfigFromEnv({ LIVEKIT_URL: ' "https://p.livekit.cloud/" ', LIVEKIT_API_KEY: 'k ', LIVEKIT_SECRET: 's' }), { url: 'wss://p.livekit.cloud', apiKey: 'k', apiSecret: 's' });
    assert.equal(sfuConfigFromEnv({ LIVEKIT_URL: 'p.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' })!.url, 'wss://p.livekit.cloud');
    const ice = iceServersFromEnv({ TURN_URLS: 'turn:relay:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' });
    assert.equal(ice[ice.length - 1].username, 'u');

    const bridge = new LiveKitBridge({ url: 'ws://localhost:7880', apiKey: 'devkey', apiSecret: 'secret-de-test-assez-long-pour-hs256' });
    const g = setup(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    // Phase des Loups : seuls les loups reçoivent du son (canal privé imposé par LiveKit).
    assert.deepEqual(bridge.permissionsFor(g.engine, g.ids[0]), { canPublish: true, canSubscribe: true });
    assert.deepEqual(bridge.permissionsFor(g.engine, g.ids[2]), { canPublish: true, canSubscribe: false });
    const { token, url } = await bridge.token(g.engine, g.ids[2], 'P2');
    assert.equal(url, 'ws://localhost:7880');
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(claims.sub, g.ids[2]);
    assert.equal(claims.video.room, 'blackops-TEST');
    assert.equal(claims.video.canPublish, true);
    assert.equal(claims.video.canSubscribe, false);
    // Hors phase des Loups : connexion audio stable (aucun droit retiré d'une phase à l'autre)…
    g.until('SUNRISE');
    for (const id of g.ids) assert.deepEqual(bridge.permissionsFor(g.engine, id), { canPublish: true, canSubscribe: true });
    g.until('PLAYER_SPEECH');
    for (const id of g.ids) assert.deepEqual(bridge.permissionsFor(g.engine, id), { canPublish: true, canSubscribe: true });
    // …et le tour de parole reste imposé par le serveur : seul l'orateur peut parler,
    // tous les autres ne l'entendent que lui (le reste est coupé chez eux).
    const { voiceFor } = await import('../src/engine/voice.ts');
    const speaker = g.engine.state.phase.data.speakerId as string;
    for (const id of g.ids) {
      const v = voiceFor(g.engine.state, id);
      assert.equal(v.canSpeak, id === speaker && g.engine.state.players.find((p) => p.id === id)!.alive);
      if (id !== speaker) assert.deepEqual(v.hearFrom, [speaker]);
    }
  });

  it('LiveKit injoignable → signalé sur /health (la voix reste sur LiveKit)', { timeout: 15_000 }, async () => {
    // Messages du serveur coupés pendant ce test (ils se mêlent sinon aux résultats du lanceur de tests).
    const quiet = { log: console.log, error: console.error };
    console.log = console.error = () => {};
    after(() => Object.assign(console, quiet));
    const { createApp: create } = await import('../src/server/app.ts');
    const { http, manager, io } = create(new MemoryGameStore(), { sfu: { url: 'ws://127.0.0.1:9', apiKey: 'k', apiSecret: 'secret-de-test-assez-long-pour-hs256' }, sfuHealthCheck: false });
    await new Promise<void>((r) => http.listen(0, r));
    const url = `http://localhost:${(http.address() as AddressInfo).port}`;
    assert.equal(await manager.sfu!.check(2000), false);
    const health = await (await fetch(`${url}/health`)).json();
    assert.equal(health.voice.livekit.ok, false);
    const c = await client(url);
    sockets.push(c);
    await emit(c, 'game:create', { name: 'Alice' });
    const join = await emit(c, 'voice:join');
    assert.equal(join.ok, true);
    assert.equal(join.mode, 'sfu');
    c.close();
    manager.stop();
    io.close();
    await new Promise((r) => http.close(r));
    Object.assign(console, quiet);
  });
});

describe('Voix — sécurité du canal des Loups (serveur = seule source de vérité)', () => {
  /** Faux serveur LiveKit : participants réellement connectés et leurs droits effectifs. */
  function fakeLiveKit(participants: { identity: string; permission: { canPublish: boolean; canSubscribe: boolean } }[]) {
    const calls: string[] = [];
    const api = {
      listRooms: async () => [],
      listParticipants: async () => participants.map((p) => ({ ...p, permission: { ...p.permission } })),
      updateParticipant: async (_room: string, identity: string, o: { permission: { canPublish: boolean; canSubscribe: boolean } }) => {
        calls.push(`update ${identity} sub=${o.permission.canSubscribe}`);
        const p = participants.find((x) => x.identity === identity)!;
        p.permission = { canPublish: o.permission.canPublish, canSubscribe: o.permission.canSubscribe };
      },
      removeParticipant: async (_room: string, identity: string) => {
        calls.push(`remove ${identity}`);
        participants.splice(participants.findIndex((x) => x.identity === identity), 1);
      },
      deleteRoom: async () => undefined,
    };
    return { api, calls, participants };
  }

  it('Civil reconnecté avec un vieux droit d’écoute, intrus, joueur parti : corrigés pendant la phase des Loups', async () => {
    const { LiveKitBridge } = await import('../src/server/voiceSfu.ts');
    const { setup } = await import('./helpers.ts');
    const g = setup(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
    g.engine.state.players[4].abandoned = true;
    const lk = fakeLiveKit([
      { identity: g.ids[0], permission: { canPublish: true, canSubscribe: true } }, // loup : OK
      { identity: g.ids[2], permission: { canPublish: true, canSubscribe: true } }, // civil revenu avec un jeton du jour
      { identity: 'intrus', permission: { canPublish: true, canSubscribe: true } }, // identité inconnue
      { identity: g.ids[4], permission: { canPublish: true, canSubscribe: true } }, // joueur qui a quitté la partie
    ]);
    const bridge = new LiveKitBridge({ url: 'ws://x', apiKey: 'devkey', apiSecret: 'secret-de-test-assez-long-pour-hs256' }, lk.api);
    g.until('WEREWOLF_PHASE');
    await bridge.enforceNow(g.engine);
    assert.deepEqual(lk.calls.sort(), [`remove ${g.ids[4]}`, 'remove intrus', `update ${g.ids[2]} sub=false`].sort());
    assert.equal(lk.participants.find((p) => p.identity === g.ids[0])!.permission.canSubscribe, true);
    // Contrôle suivant : plus rien à corriger.
    lk.calls.length = 0;
    await bridge.enforceNow(g.engine);
    assert.deepEqual(lk.calls, []);
    // Un civil qui revient en pleine phase des Loups reçoit un jeton SANS droit d'écoute.
    const { token } = await bridge.token(g.engine, g.ids[3], 'P3');
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(claims.video.canSubscribe, false);
    assert.ok(claims.exp - claims.nbf <= 10 * 60 + 5, 'jeton audio de 10 min maximum');
    // Le contrôle est fait chaque seconde pendant la phase des Loups.
    lk.participants.find((p) => p.identity === g.ids[2])!.permission.canSubscribe = true; // client modifié / vieux jeton
    bridge.enforce(g.engine, Date.now() + 1500);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(lk.participants.find((p) => p.identity === g.ids[2])!.permission.canSubscribe, false);
  });

  it('droits recalculés depuis l’état du serveur : loup mort, civil infecté, rôle « déclaré » par le client ignoré', async () => {
    const { LiveKitBridge } = await import('../src/server/voiceSfu.ts');
    const { setup } = await import('./helpers.ts');
    const g = setup(['black_wolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager']);
    const bridge = new LiveKitBridge({ url: 'ws://x', apiKey: 'devkey', apiSecret: 'secret-de-test-assez-long-pour-hs256' }, fakeLiveKit([]).api);
    g.until('WEREWOLF_PHASE');
    assert.equal(bridge.permissionsFor(g.engine, g.ids[2]).canSubscribe, false, 'civil : aucun son des Loups');
    // Infection du civil P2 : il rejoint le canal des Loups à la nuit suivante (décidé par le serveur).
    g.cmd(0, { action: 'wolf_vote', targets: [g.ids[2]], option: 'infect' });
    g.until('VOTING');
    for (let i = 0; i < 9; i++) g.act(i, 'vote', [i === 1 ? 3 : 1]); // le loup P1 est éliminé
    g.until('WEREWOLF_PHASE');
    assert.equal(bridge.permissionsFor(g.engine, g.ids[2]).canSubscribe, true, 'infecté : canal des Loups');
    assert.equal(bridge.permissionsFor(g.engine, g.ids[1]).canSubscribe, false, 'loup mort : plus d’accès');
    assert.equal(bridge.permissionsFor(g.engine, g.ids[3]).canSubscribe, false, 'civil');
    // Un client ne peut rien « déclarer » : le rôle vient uniquement de l'état du serveur.
    assert.throws(() => g.cmd(3, { action: 'wolf_vote', targets: [g.ids[4]] }));
  });
});

describe('Arrêt du serveur (redéploiement)', () => {
  it('aucune action acceptée pendant l’arrêt (elle serait perdue) : refus clair, réessayable', { timeout: 10_000 }, async () => {
    const srv = await startServer();
    const c = await client(srv.url);
    sockets.push(c);
    const created = await emit(c, 'game:create', { name: 'Alice' });
    assert.equal(created.ok, true);
    srv.manager.stop();
    const r = await emit(c, 'lobby:addBot', {});
    assert.deepEqual([r.ok, r.error], [false, 'RESTARTING']);
    assert.equal(c.connected, true, 'la connexion n’est pas coupée par le serveur (le navigateur se reconnecte seul au nouveau)');
    await srv.close();
  });
});
