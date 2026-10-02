/**
 * Convertit le texte de la grande pancarte en tracés vectoriels (police Bangers),
 * pour que le décor (chargé comme image) s'affiche à l'identique partout.
 *
 * Outil ponctuel, hors dépendances du jeu :
 *   npm i --no-save opentype.js@1.3.4 wawoff2
 *   node scripts/art/sign-glyphs.mjs public/fonts/bangers-latin.woff2 scripts/art/sign-text.json
 *   node scripts/art/village.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';
const woff2 = readFileSync(process.argv[2]);
const ttf = await wawoff2.decompress(woff2);
const font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
const out = {};
for (const [key, text, size, spacing] of [['line1', 'LE VILLAGE', 46, 4], ['line2', 'DES BLACKOPS', 56, 2.5]]) {
  // largeur totale avec espacement
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let w = 0;
  glyphs.forEach((g, i) => (w += g.advanceWidth * scale + (i < glyphs.length - 1 ? spacing : 0)));
  let x = -w / 2;
  let d = '';
  for (const g of glyphs) {
    d += g.getPath(x, 0, size).toPathData(1);
    x += g.advanceWidth * scale + spacing;
  }
  out[key] = { d, width: +w.toFixed(1) };
}
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.width])));
