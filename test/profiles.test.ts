import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import { aggregateStats, memoryProfileStore, ProfileStore, SupabaseBackend } from '../src/platform/profiles.ts';
import { createApp } from '../src/server/app.ts';
import { gameResults } from '../src/server/results.ts';
import { MemoryGameStore } from '../src/server/store.ts';
import { setup } from './helpers.ts';

const rejectsCode = async (p: Promise<unknown>, code: string) => assert.rejects(p, (e: { code?: string }) => e.code === code);

describe('Profils de la plateforme', () => {
  it('statistiques agrégées : total, par jeu, par rôle, par camp', () => {
    const st = aggregateStats([
      { game: 'loup-garou', role: 'seer', camp: 'civil', outcome: 'win', eliminated: false },
      { game: 'loup-garou', role: 'werewolf', camp: 'loup', outcome: 'loss', eliminated: true },
      { game: 'loup-garou', role: 'werewolf', camp: 'loup', outcome: 'win', eliminated: true },
      { game: 'rami', outcome: 'draw', eliminated: false },
    ]);
    assert.deepEqual([st.games, st.wins, st.losses, st.draws, st.eliminations], [4, 2, 1, 1, 2]);
    assert.equal(st.byGame['loup-garou'].games, 3);
    assert.equal(st.byGame.rami.draws, 1);
    assert.deepEqual(st.byRole['loup-garou:werewolf'], { games: 2, wins: 1, losses: 1, draws: 0 });
    assert.equal(st.byCamp['loup-garou:civil'].wins, 1);
  });

  it('création, clé secrète obligatoire, changement de pseudo sans perte des statistiques', async () => {
    const store = memoryProfileStore();
    const micka = await store.create('  Micka ');
    const sarah = await store.create('Sarah');
    assert.equal(micka.name, 'Micka');
    assert.match(micka.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(micka.id, sarah.id);
    await rejectsCode(store.create('   '), 'BAD_NAME');
    // Sans la bonne clé, impossible d'agir au nom d'un autre profil.
    await rejectsCode(store.info({ id: micka.id, key: sarah.key }), 'NO_PROFILE');
    await rejectsCode(store.rename({ id: micka.id, key: 'x'.repeat(43) }, 'Pirate'), 'NO_PROFILE');
    assert.equal(await store.verifyOptional({ id: micka.id, key: sarah.key }), null);
    assert.equal(await store.verifyOptional(null), null);

    await store.recordGame('ABCDE', [
      { playerId: micka.id, game: 'loup-garou', role: 'seer', camp: 'civil', outcome: 'win', eliminated: false },
      { playerId: sarah.id, game: 'loup-garou', role: 'werewolf', camp: 'loup', outcome: 'loss', eliminated: true },
    ]);
    assert.equal(await store.rename(micka, 'Micka26'), 'Micka26');
    const info = await store.info(micka);
    assert.equal(info.id, micka.id);
    assert.equal(info.name, 'Micka26');
    assert.deepEqual([info.stats.games, info.stats.wins, info.stats.losses], [1, 1, 0]);
    // Les statistiques de Sarah ne se mélangent pas à celles de Micka.
    const s = await store.info(sarah);
    assert.deepEqual([s.stats.games, s.stats.wins, s.stats.losses, s.stats.eliminations], [1, 0, 1, 1]);
  });

  it('résultat d’une partie : calculé par le serveur, seulement pour les joueurs avec profil', () => {
    const g = setup(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    const s = g.engine.state;
    s.players[0].profileId = 'a0000000-0000-4000-8000-000000000000';
    s.players[1].profileId = 'b0000000-0000-4000-8000-000000000000';
    s.players[1].alive = false;
    assert.deepEqual(gameResults(s), []); // partie pas terminée
    s.status = 'finished';
    s.winner = { camp: 'wolves', title: '', winnerIds: [s.players[0].id] };
    assert.deepEqual(gameResults(s), [
      { playerId: s.players[0].profileId, game: 'loup-garou', role: 'werewolf', camp: 'loup', outcome: 'win', eliminated: false },
      { playerId: s.players[1].profileId, game: 'loup-garou', role: 'seer', camp: 'civil', outcome: 'loss', eliminated: true },
    ]);
    s.winner = { camp: 'draw', title: '', winnerIds: [] };
    assert.ok(gameResults(s).every((r) => r.outcome === 'draw'));
  });

  it('Supabase : clé secrète côté serveur uniquement, empreinte de la clé du profil', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const rows: Record<string, unknown>[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (init.method === 'POST' && url.endsWith('/platform_players')) {
        rows.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 201 });
      }
      if (init.method === 'GET' && url.includes('/platform_players?')) {
        return Response.json(rows.map((r) => ({ display_name: r.display_name, key_hash: r.key_hash })));
      }
      if (init.method === 'GET') return Response.json([{ game: 'loup-garou', role: 'seer', camp: 'civil', outcome: 'win', eliminated: false }]);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const store = new ProfileStore(new SupabaseBackend('https://demo.supabase.co/', 'sb_secret_test', fake));
    const p = await store.create('Kevin');
    assert.equal(rows[0].id, p.id);
    assert.match(String(rows[0].key_hash), /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(rows).includes(p.key), 'la clé du profil n’est jamais stockée');
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.apikey, 'sb_secret_test');
    assert.equal(headers.Authorization, undefined);
    assert.equal(calls[0].url, 'https://demo.supabase.co/rest/v1/platform_players');
    const fresh = new ProfileStore(new SupabaseBackend('https://demo.supabase.co/rest/v1/', 'eyJhbGciOi.test', fake));
    const info = await fresh.info(p);
    assert.equal(info.stats.wins, 1);
    assert.equal((calls.at(-1)!.init.headers as Record<string, string>).Authorization, 'Bearer eyJhbGciOi.test');
    assert.ok(calls.at(-1)!.url.startsWith('https://demo.supabase.co/rest/v1/platform_game_results?'), 'adresse copiée avec /rest/v1/ acceptée');
  });

  it('API HTTP + partie : le profil est rattaché sans jamais être envoyé aux autres joueurs', { timeout: 15_000 }, async () => {
    const profiles = memoryProfileStore();
    const { http, manager, io } = createApp(new MemoryGameStore(), { botDelay: [10, 30], profiles });
    await new Promise<void>((r) => http.listen(0, r));
    const url = `http://localhost:${(http.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown) =>
      fetch(`${url}/api/profiles${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
    const sockets: Socket[] = [];
    try {
      const micka = await post('', { name: 'Micka' });
      assert.equal(micka.ok, true);
      assert.equal((await post('', { name: '' })).error, 'BAD_NAME');
      const me = await post('/me', { id: micka.id, key: micka.key });
      assert.deepEqual([me.name, me.stats.games], ['Micka', 0]);
      const wrong = await post('/me', { id: micka.id, key: 'z'.repeat(43) });
      assert.deepEqual([wrong.status, wrong.error], [404, 'NO_PROFILE']);
      assert.equal((await post('/rename', { id: micka.id, key: micka.key, name: 'Micka26' })).name, 'Micka26');

      const conn = () =>
        new Promise<Socket>((resolve) => {
          const c = connect(url, { transports: ['websocket'], forceNew: true });
          sockets.push(c);
          c.on('connect', () => resolve(c));
        });
      const emit = (c: Socket, ev: string, p: unknown) => new Promise<any>((r) => c.emit(ev, p, r));
      const host = await conn();
      const created = await emit(host, 'game:create', { name: 'Micka26', profile: { id: micka.id, key: micka.key } });
      assert.equal(created.ok, true);
      const guest = await conn();
      let guestView = '';
      guest.on('view', (v) => (guestView = JSON.stringify(v)));
      // Clé d'un autre profil : rejoint quand même, mais en invité.
      const joined = await emit(guest, 'game:join', { code: created.code, name: 'Invité', profile: { id: micka.id, key: 'y'.repeat(43) } });
      assert.equal(joined.ok, true);
      const room = manager.rooms.get(created.code)!;
      const [pHost, pGuest] = room.engine.state.players;
      assert.equal(pHost.profileId, micka.id);
      assert.equal(pGuest.profileId, undefined);
      await new Promise((r) => setTimeout(r, 100));
      assert.ok(guestView.length > 0 && !guestView.includes(micka.id), 'identifiant interne jamais envoyé');

      // Fin de partie (forcée) : le serveur enregistre le résultat une seule fois.
      const s = room.engine.state;
      s.players.forEach((p, i) => (p.role = i === 0 ? 'werewolf' : 'villager'));
      s.status = 'finished';
      s.winner = { camp: 'wolves', title: '', winnerIds: [pHost.id] };
      (manager as unknown as { afterChange(r: unknown): void }).afterChange(room);
      (manager as unknown as { afterChange(r: unknown): void }).afterChange(room);
      await new Promise((r) => setTimeout(r, 50));
      const after = await post('/me', { id: micka.id, key: micka.key });
      assert.deepEqual([after.name, after.stats.games, after.stats.wins, after.stats.byCamp['loup-garou:loup'].wins], ['Micka26', 1, 1, 1]);
    } finally {
      sockets.forEach((c) => c.close());
      manager.stop();
      io.close();
      await new Promise((r) => http.close(r));
    }
  });
});
