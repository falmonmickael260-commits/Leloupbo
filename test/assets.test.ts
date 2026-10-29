import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';

it('fonds, cartes et sources protégés : contenu strictement identique à l’audit initial', () => {
  const manifest = JSON.parse(readFileSync(new URL('../docs/protected-assets.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(manifest).length > 30);
  for (const [file, hash] of Object.entries(manifest)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex'), hash, file);
  }
});

it('20 illustrations livrées : fichiers PNG transparents, format portrait et taille adaptée au mobile', async () => {
  const modulePath = '../public/js/art/villagers.js';
  const { VILLAGERS } = await import(modulePath);
  assert.equal(VILLAGERS.length, 20);
  assert.equal(new Set(VILLAGERS.map((c: any) => c.id)).size, 20);
  for (const c of VILLAGERS) {
    const png = readFileSync(new URL(`../public${c.image}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png[25], 6, `${c.id} : canal alpha RGBA`);
    assert.ok(png.readUInt32BE(16) < png.readUInt32BE(20), c.id);
    assert.ok(png.readUInt32BE(20) <= 768, c.id);
    assert.ok(png.length < 1_000_000, c.id);
  }
});
