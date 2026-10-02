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
    const ice = iceServersFromEnv({ TURN_URLS: 'turn:relay:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' });
    assert.equal(ice[ice.length - 1].username, 'u');

    const bridge = new LiveKitBridge({ url: 'ws://localhost:7880', apiKey: 'devkey', apiSecret: 'secret-de-test-assez-long-pour-hs256' });
    const g = setup(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
    g.until('WEREWOLF_PHASE');
    assert.deepEqual(bridge.permissionsFor(g.engine, g.ids[0]), { canPublish: true, canSubscribe: true });
    assert.deepEqual(bridge.permissionsFor(g.engine, g.ids[2]), { canPublish: false, canSubscribe: false });
    const { token, url } = await bridge.token(g.engine, g.ids[2], 'P2');
    assert.equal(url, 'ws://localhost:7880');
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(claims.sub, g.ids[2]);
    assert.equal(claims.video.room, 'blackops-TEST');
    assert.equal(claims.video.canPublish, false);
    assert.equal(claims.video.canSubscribe, false);
    g.until('PLAYER_SPEECH');
    const speaker = g.engine.state.phase.data.speakerId as string;
    for (const id of g.ids) {
      const alive = g.engine.state.players.find((p) => p.id === id)!.alive;
      assert.equal(bridge.permissionsFor(g.engine, id).canPublish, id === speaker && alive);
    }
  });

  it('LiveKit injoignable → signalé sur /health (la voix reste sur LiveKit)', { timeout: 15_000 }, async () => {
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
  });
});
