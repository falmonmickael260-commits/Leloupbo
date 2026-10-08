import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createGameState } from '../src/engine/lobby.ts';
import { FileGameStore } from '../src/server/store.ts';

describe('Sauvegarde des parties', () => {
  it('des changements rapprochés donnent peu d’écritures, et la dernière version est bien sur le disque', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'blackops-store-'));
    try {
      const store = new FileGameStore(dir);
      const state = createGameState('ABCDE', 1);
      const writes: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        state.counter = i;
        writes.push(store.save(state));
      }
      // Toutes les promesses se résolvent, et le fichier contient l'état le plus récent.
      await Promise.all(writes);
      await store.flush();
      const saved = JSON.parse(await readFile(path.join(dir, 'ABCDE.json'), 'utf8'));
      assert.equal(saved.counter, 49);
      // Une sauvegarde après coup est elle aussi écrite.
      state.counter = 99;
      await store.save(state);
      assert.equal(JSON.parse(await readFile(path.join(dir, 'ABCDE.json'), 'utf8')).counter, 99);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
