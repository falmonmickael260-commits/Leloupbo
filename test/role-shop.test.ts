import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameEngine } from '../src/engine/engine.ts';
import { seededRng } from '../src/engine/rng.ts';
import { roleShopOutcome } from '../src/engine/lobby.ts';
import { ROLE_SHOP_PRICES, reserveRole, RoleShopError } from '../src/server/roleShop.ts';

const prices = { villager: 50, werewolf: 100, witch: 150, seer: 150, black_wolf: 200, white_wolf: 100, hunter: 100 };

test('les sept prix définitifs sont identiques dans le serveur et l’interface', () => {
  assert.deepEqual(ROLE_SHOP_PRICES, prices);
  const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const literal = source.match(/const ROLE_SHOP_PRICES = (\{[^;]+\});/)![1];
  for (const [role, price] of Object.entries(prices)) {
    assert.match(literal, new RegExp(`${role}: ${price}\\b`));
  }
});

function game(seed: number) {
  const e = GameEngine.create('TEST', 0, seededRng(seed));
  for (let i = 0; i < 4; i++) e.join(`P${i}`, `token${i}`, 0);
  e.updateSettings(e.state.hostId, { autoWolves: false, roles: { werewolf: 1, hunter: 1 } }, 0);
  e.start(e.state.hostId, 0);
  return e;
}

test('sélection de dix secondes, rôles secrets, attribution du Chasseur et invités gratuits', () => {
  const e = game(42);
  const buyer = e.state.players[0];
  buyer.platformUserId = 'buyer';
  buyer.roleReservation = { roleKey: 'hunter', priceCoins: 100, reservationId: 'r1' };
  assert.equal(e.state.phase.endsAt, 10_000);
  for (const p of e.state.players) {
    const v = e.view(p.id, 0);
    assert.equal(v.me.role, null);
    assert.equal(v.me.pack, null);
    assert.equal(v.chats.wolves, undefined);
    assert.equal(v.privateLog.some((m) => m.kind === 'role'), false);
  }
  const before = e.state.players.map((p) => p.role).sort();
  e.tick(10_000);
  assert.equal(buyer.role, 'hunter');
  assert.deepEqual(e.state.players.map((p) => p.role).sort(), before);
  assert.deepEqual(roleShopOutcome(e.state.players), { grantedUserIds: ['buyer'], refundedUserIds: [] });
  for (const p of e.state.players.slice(1)) assert.equal(p.roleReservation, undefined);
});

test('deux demandes du Chasseur : un seul gagnant, aucun avantage au premier siège', () => {
  const wins = [0, 0];
  for (let seed = 1; seed <= 400; seed++) {
    const e = game(seed);
    e.state.players.slice(0, 2).forEach((p, i) => {
      p.platformUserId = `buyer${i}`;
      p.roleReservation = { roleKey: 'hunter', priceCoins: 100, reservationId: `r${i}` };
    });
    e.tick(10_000);
    const result = roleShopOutcome(e.state.players);
    assert.equal(result.grantedUserIds.length, 1);
    assert.equal(result.refundedUserIds.length, 1);
    wins[Number(result.grantedUserIds[0].slice(-1))]++;
  }
  assert.ok(wins.every((count) => count > 140 && count < 260), `${wins}`);
});

test('réservation serveur du Chasseur à 100, refus du solde insuffisant', async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.PLATFORM_SUPABASE_URL;
  const oldKey = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  process.env.PLATFORM_SUPABASE_URL = 'https://platform.test';
  process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY = 'test';
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_role_key, 'hunter');
      assert.equal(body.p_price_coins, 100);
      return Response.json([{ reservation_id: 'r', new_balance: 100 }]);
    };
    assert.deepEqual(await reserveRole({ roomCode: 'TEST', userId: 'buyer', roleKey: 'hunter', reservationId: 'r', selectionEndsAt: Date.now() + 10_000 }), { reservationId: 'r', newBalance: 100 });
    globalThis.fetch = async () => Response.json({ message: 'solde insuffisant' }, { status: 400 });
    await assert.rejects(reserveRole({ roomCode: 'TEST', userId: 'buyer', roleKey: 'hunter', reservationId: 'r', selectionEndsAt: Date.now() + 10_000 }), RoleShopError);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.PLATFORM_SUPABASE_URL; else process.env.PLATFORM_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY; else process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
