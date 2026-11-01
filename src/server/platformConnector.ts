import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Adapter, Session } from '../../platform-connector/server.mjs';
import { GameManager, hashToken } from './gameManager.ts';
import type { GameStore } from './store.ts';

export function platformConnector(manager: GameManager, store: GameStore): Adapter {
  const receiptDir = path.join(process.env.DATA_DIR || 'data/games', '.platform-admissions');
  return {
    inspect(c) {
      const room = manager.rooms.get(c.room);
      const player = room?.engine.findByTokenHash(hashToken(c.proof.token || ''));
      const expected = c.inviter || c.uid;
      if (!room || !player || player.abandoned || (player.platformUserId && expected && player.platformUserId !== expected)) throw new Error('Votre ami ne se trouve plus dans ce salon.');
      if (!player.platformUserId && expected) { player.platformUserId = expected; void store.save(room.engine.state); }
      const s = room.engine.state;
      return { code: s.code, instance: `${s.code}:${s.createdAt}`, capacity: s.settings.maxPlayers, count: s.players.length, status: s.status === 'lobby' ? 'open' : 'started', ownerUid: player.platformUserId };
    },
    async admit(c) {
      const room = manager.rooms.get(c.room);
      if (!room || `${room.code}:${room.engine.state.createdAt}` !== c.instance) throw new Error('Salon introuvable.');
      const source = room.engine.findByTokenHash(hashToken(c.proof.token || ''));
      if (!source || source.abandoned || (source.platformUserId && source.platformUserId !== c.inviter)) throw new Error('Votre ami a quitté le salon.');
      const receipt = path.join(receiptDir, createHash('sha256').update(`${c.instance}:${c.uid}`).digest('hex') + '.json');
      try {
        const session = JSON.parse(readFileSync(receipt, 'utf8')) as Session;
        const existing = room.engine.findByTokenHash(hashToken(session.token || ''));
        if (existing?.platformUserId === c.uid && !existing.abandoned) return session;
      } catch { /* première admission ou ancien salon */ }
      const result = manager.joinGame(c.room, c.name.slice(0, 20), null, c.uid);
      mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
      writeFileSync(receipt, JSON.stringify(result.session), { mode: 0o600 });
      await store.save(result.room.engine.state);
      return result.session;
    },
  };
}
