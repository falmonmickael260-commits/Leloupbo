import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server/app.ts';
import { MemoryGameStore } from '../src/server/store.ts';
import { platformConnector } from '../src/server/platformConnector.ts';
import type { Command } from '../platform-connector/server.mjs';
test('invitation : session native persistée, doublon et mauvaise identité refusés, invité conservé', async () => {
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), 'rg-connector-test-'));
  const store = new MemoryGameStore(), app = createApp(store), connector = platformConnector(app.manager, store);
  try {
    const host = randomUUID(), bob = randomUUID();
    const a = app.manager.createGame('Alice', null, host);
    const c: Command = { v: 1, game: 'la-meute', operation: 'admit', room: a.room.code, uid: bob, name: 'Bob', inviter: host,
      invitation: randomUUID(), instance: `${a.room.code}:${a.room.engine.state.createdAt}`, proof: a.session };
    const b = await connector.admit(c);
    assert.deepEqual(await connector.admit(c), b);
    assert.equal(a.room.engine.state.players.filter(p => p.platformUserId === bob).length, 1);
    assert.equal((await connector.inspect({ ...c, operation: 'inspect', uid: bob, inviter: undefined, proof: b })).count, 2);
    await assert.rejects(Promise.resolve().then(() => connector.inspect({ ...c, inviter: randomUUID() })), /ami/);
    app.manager.joinGame(a.room.code, 'Invité sans compte');
    assert.equal(a.room.engine.state.players.length, 3);
    for (let i = 3; i < a.room.engine.state.settings.maxPlayers; i++) app.manager.joinGame(a.room.code, `Invité ${i}`);
    await assert.rejects(Promise.resolve().then(() => connector.admit({ ...c, uid: randomUUID() })), /complète/);
    await assert.rejects(Promise.resolve().then(() => connector.admit({ ...c, instance: 'old' })), /introuvable/);
  } finally {
    app.manager.stop(); app.io.close();
    await rm(process.env.DATA_DIR!, { recursive: true, force: true });
    if (original === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = original;
  }
});
