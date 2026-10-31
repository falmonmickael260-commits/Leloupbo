import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const domPackage = 'jsdom';
const walletModule = '../public/js/roleWallet.js';
const { JSDOM } = await import(domPackage);
const { RoleWallet } = await import(walletModule);
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const prices = { villager: 50, werewolf: 100, witch: 150, seer: 150, black_wolf: 200, white_wolf: 100, hunter: 100 };
const view = (phase = 'LOBBY', connected = true, id = 'buyer') => ({
  code: 'ROOM', status: phase === 'LOBBY' ? 'lobby' : 'running',
  me: { id, platformConnected: connected, reservedRole: null },
  phase: { id: phase, seq: phase === 'LOBBY' ? 0 : 1 },
  composition: { villager: 2, werewolf: 1, hunter: 1 },
});
function harness(balance: number | null = 1500) {
  const dom = new JSDOM(html);
  let calls = 0;
  const buys: string[] = [];
  const client = {
    status: 'connected',
    roleBalance: async () => { calls++; return { balance }; },
    buyRole: async (role: string) => { buys.push(role); return { balance, role }; },
  };
  const errors: string[] = [];
  const wallet = new RoleWallet({ client, prices, root: dom.window.document, reportError: (m: string) => errors.push(m) });
  const node = (id: string) => dom.window.document.getElementById(id);
  return { dom, client, wallet, node, buys, errors, get calls() { return calls; } };
}
async function settle() { await new Promise((resolve) => setImmediate(resolve)); }

test('le vrai panneau affiche le portefeuille dès le salon puis pendant la sélection', async () => {
  const h = harness();
  h.wallet.render(view()); await settle();
  assert.match(h.node('lobby-wallet-balance').textContent, /1\s*500 pièces/);
  assert.equal(h.node('role-shop-panel').hidden, true);
  assert.equal(h.calls, 1);
  h.wallet.render(view('ROLE_DISTRIBUTION')); await settle();
  assert.match(h.node('game-wallet-balance').textContent, /1\s*500 pièces/);
  assert.equal(h.node('role-shop-panel').parentElement.id, 'screen-game');
  assert.equal(h.node('role-shop-panel').hidden, false);
  const buttons = Array.from(h.node('role-shop').querySelectorAll('button')) as any[];
  assert.deepEqual(buttons.map((b) => b.dataset.buyRole), ['villager', 'werewolf', 'hunter']);
  const hunter = buttons.find((b) => b.dataset.buyRole === 'hunter');
  assert.equal(hunter.disabled, false);
  assert.match(hunter.textContent, /Chasseur · 100 pièces/);
  hunter.click(); await settle();
  assert.deepEqual(h.buys, ['hunter']);
  assert.match(h.node('role-shop-status').textContent, /Demande Chasseur enregistrée/);
  // La demande ne soustrait pas artificiellement le prix du portefeuille.
  assert.match(h.node('game-wallet-balance').textContent, /1\s*500 pièces/);
  assert.ok(Array.from(h.node('role-shop').querySelectorAll('button')).every((b: any) => b.disabled));
  h.dom.window.close();
});

test('solde insuffisant : seuls les rôles trop chers sont désactivés', async () => {
  const h = harness(75); h.wallet.render(view('ROLE_DISTRIBUTION')); await settle();
  assert.equal(h.node('role-shop').querySelector('[data-buy-role="hunter"]').disabled, true);
  assert.equal(h.node('role-shop').querySelector('[data-buy-role="villager"]').disabled, false);
  h.dom.window.close();
});

test('un invité voit une explication sans lecture de portefeuille ni achat autorisé', async () => {
  const h = harness(); h.wallet.render(view('ROLE_DISTRIBUTION', false)); await settle();
  assert.equal(h.calls, 0);
  assert.equal(h.node('game-wallet-balance').textContent, 'Invité');
  assert.match(h.node('role-shop-status').textContent, /Connecte-toi via Revanche Games/);
  assert.ok(Array.from(h.node('role-shop').querySelectorAll('button')).every((b: any) => b.disabled));
  h.dom.window.close();
});

test('erreur de lecture : solde indisponible, puis actualisation utilisable', async () => {
  const h = harness(); h.client.roleBalance = async () => { throw new Error('offline'); };
  h.wallet.render(view('ROLE_DISTRIBUTION')); await settle();
  assert.equal(h.node('game-wallet-balance').textContent, 'Solde indisponible');
  assert.equal(h.node('role-shop').querySelector('[data-buy-role="hunter"]').disabled, true);
  h.client.roleBalance = async () => ({ balance: 200 });
  h.node('wallet-refresh').click(); await settle();
  assert.equal(h.node('game-wallet-balance').textContent, '200 pièces');
  assert.equal(h.node('role-shop').querySelector('[data-buy-role="hunter"]').disabled, false);
  h.wallet.render(null);
  assert.equal(h.node('role-shop-panel').hidden, true);
  h.dom.window.close();
});

test('une réponse tardive ne révèle pas le solde du joueur précédent', async () => {
  const h = harness();
  let resolveFirst: (value: { balance: number }) => void = () => {};
  h.client.roleBalance = () => new Promise((resolve) => { resolveFirst = resolve; });
  h.wallet.render(view('LOBBY', true, 'first'));
  h.client.roleBalance = async () => ({ balance: 250 });
  h.wallet.render(view('LOBBY', true, 'second')); await settle();
  resolveFirst({ balance: 9000 }); await settle();
  assert.equal(h.node('lobby-wallet-balance').textContent, '250 pièces');
  h.dom.window.close();
});

test('le portefeuille est relu après attribution et reste visible hors de la sélection', async () => {
  const h = harness(); h.wallet.render(view('ROLE_DISTRIBUTION')); await settle();
  h.client.roleBalance = async () => ({ balance: 1400 });
  h.wallet.render({ ...view('NIGHT_START'), phase: { id: 'NIGHT_START', seq: 2 } }); await settle();
  assert.equal(h.node('role-shop-panel').hidden, true);
  assert.equal(h.node('game-wallet-balance').textContent, '1\u202f400 pièces');
  h.client.roleBalance = async () => ({ balance: 1450 });
  await h.wallet.refresh();
  assert.equal(h.node('game-wallet-balance').textContent, '1\u202f450 pièces');
  h.dom.window.close();
});

test('la carte centrale et la narration ne recouvrent jamais le choix des rôles', async () => {
  const h = harness();
  const style = h.dom.window.document.createElement('style');
  style.textContent = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  h.dom.window.document.head.appendChild(style);
  h.node('card-layer').classList.add('show');
  h.node('card-zoom').classList.add('show');
  h.wallet.render(view('ROLE_DISTRIBUTION')); await settle();
  for (const id of ['card-layer', 'card-zoom', 'narrator']) {
    assert.equal(h.dom.window.getComputedStyle(h.node(id)).display, 'none', id);
  }
  assert.equal(h.node('role-shop-panel').hidden, false);
  assert.equal(h.node('role-shop').querySelector('[data-buy-role="hunter"]').disabled, false);
  h.wallet.render(view('NIGHT_START')); await settle();
  assert.equal(h.dom.window.document.body.classList.contains('role-selection'), false);
  h.dom.window.close();
});
