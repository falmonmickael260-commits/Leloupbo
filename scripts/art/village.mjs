/**
 * Plateau « Le Village des Blackops » — style BANDE DESSINÉE (2D, aucune 3D).
 *
 * Encrage noir épais légèrement tremblé (filtre « ink »), aplats de couleurs,
 * ombres franches + trames de points / hachures. Cadrage 1536×1024 repris de la
 * référence : pancarte en haut à gauche, rivière et pont à gauche, église et
 * cimetière à droite, grande place pavée avec feu de camp au centre.
 *
 * Sorties (public/assets/) :
 *   village.svg         décor de jour, ciel transparent (le ciel animé est dessous)
 *   village-lights.svg  fenêtres allumées, lanternes, flammes (calque de nuit)
 *   lights.json         sources de lumière + géométrie de la place (pour les pions)
 *
 *   node scripts/art/village.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1536;
const H = 1024;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');

let seed = 2024;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const rr = (a, b) => a + rnd() * (b - a);
const f = (n) => Math.round(n * 10) / 10;

const INK = '#1b130e';
const base = [];
const lights = [];
const spots = [];

// ------------------------------------------------------------------ palette BD
const P = {
  plaster: '#f2d9a4', plasterSh: '#cfa86c',
  stone: '#c3b8a3', stoneSh: '#8f8574',
  timber: '#5e3b22',
  roof: '#5b6b80', roofSh: '#3d4a5c', roofHi: '#7d8fa6',
  roofRed: '#a5523a', roofRedSh: '#7a3726', roofRedHi: '#c7704f',
  wood: '#a86b36', woodSh: '#74461f',
  grass: '#86a948', grassSh: '#678a33', grassHi: '#a9c860',
  leaf: '#6f9e3a', leafSh: '#4a7628', leafHi: '#a7cd57',
  pine: '#3f7a43', pineSh: '#2a5631',
  water: '#4aa6cf', waterSh: '#2c7fab', waterHi: '#d9f3ff',
  cobble: '#e0b97f', cobbleSh: '#b98a52', cobbleGap: '#8a6238',
  rock: '#a9a092', rockSh: '#7a7266',
  glass: '#2c3c55', glassHi: '#8fb4d8',
  mtn: '#8d86b8', mtnSh: '#6c659a', mtn2: '#5f7d8c', mtn2Sh: '#476372',
};

// Police Bangers embarquée : un SVG affiché en <img> ne peut pas charger de police externe.
const BANGERS = readFileSync(path.join(OUT, '../fonts/bangers-latin.woff2')).toString('base64');
const defs = `
<defs>
  <style>@font-face{font-family:'Bangers';src:url(data:font/woff2;base64,${BANGERS}) format('woff2');}</style>
  <filter id="ink" x="-2%" y="-2%" width="104%" height="104%">
    <feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="2" seed="4" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <pattern id="dots" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3.5" cy="3.5" r="1.35" fill="${INK}"/></pattern>
  <pattern id="dotsBig" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="5" cy="5" r="2.1" fill="${INK}"/></pattern>
  <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0 V7" stroke="${INK}" stroke-width="1.3"/></pattern>
  <pattern id="slate" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 9.5 H16 M8 0 V9.5" stroke="${INK}" stroke-width="1.1" opacity=".5"/></pattern>
  <pattern id="bricks" width="28" height="14" patternUnits="userSpaceOnUse"><path d="M0 13.5 H28 M14 0 V7 M0 7 H28 M7 7 V14 M21 7 V14" stroke="${INK}" stroke-width="1" opacity=".38" fill="none"/></pattern>
  <pattern id="planks" width="40" height="12" patternUnits="userSpaceOnUse"><path d="M0 11.5 H40 M22 0 V12" stroke="${INK}" stroke-width="1" opacity=".45"/></pattern>
</defs>`;

// ------------------------------------------------------------------ primitives
const ink = (w = 3) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const shadowBlob = (x, y, rx, ry) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${INK}" opacity=".22"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#dots)" opacity=".35"/>`;

/** Contour « nuage » de feuillage BD. */
function bumpy(cx, cy, rx, ry, n, bump) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) d += `M${f(x)} ${f(y)}`;
    else d += ` A${f(bump)} ${f(bump)} 0 0 1 ${f(x)} ${f(y)}`;
  }
  return d + 'Z';
}

function tree(x, y, r, tone = 0) {
  const leaf = tone ? P.leafSh : P.leaf;
  const sh = tone ? '#355a1e' : P.leafSh;
  let s = shadowBlob(x + r * 0.35, y + 3, r * 1.05, r * 0.32);
  s += `<path d="M${f(x - r * 0.14)} ${f(y)} Q${f(x - r * 0.05)} ${f(y - r * 0.6)} ${f(x - r * 0.1)} ${f(y - r * 1.1)} L${f(x + r * 0.12)} ${f(y - r * 1.1)} Q${f(x + r * 0.06)} ${f(y - r * 0.6)} ${f(x + r * 0.16)} ${f(y)} Z" fill="#7a4e2c" ${ink(2.5)}/>`;
  const cy = y - r * 1.55;
  s += `<path d="${bumpy(x, cy, r, r * 0.86, 9, r * 0.42)}" fill="${leaf}" ${ink(3)}/>`;
  s += `<path d="${bumpy(x + r * 0.22, cy + r * 0.25, r * 0.72, r * 0.55, 7, r * 0.3)}" fill="${sh}"/>`;
  s += `<path d="${bumpy(x + r * 0.22, cy + r * 0.25, r * 0.72, r * 0.55, 7, r * 0.3)}" fill="url(#dots)" opacity=".25"/>`;
  s += `<path d="${bumpy(x - r * 0.3, cy - r * 0.3, r * 0.38, r * 0.3, 5, r * 0.16)}" fill="${P.leafHi}"/>`;
  s += `<path d="${bumpy(x, cy, r, r * 0.86, 9, r * 0.42)}" fill="none" ${ink(3)}/>`;
  s += `<path d="M${f(x - r * 0.4)} ${f(cy + r * 0.1)} q${f(r * 0.15)} ${f(r * 0.12)} ${f(r * 0.3)} 0 M${f(x + r * 0.15)} ${f(cy - r * 0.35)} q${f(r * 0.12)} ${f(r * 0.1)} ${f(r * 0.25)} 0" stroke="${INK}" stroke-width="1.6" fill="none"/>`;
  return s;
}

function pine(x, y, h, dark = false) {
  const w = h * 0.36;
  const c = dark ? P.pineSh : P.pine;
  const sh = dark ? '#1d3d24' : P.pineSh;
  let s = shadowBlob(x + w * 0.3, y + 2, w * 0.7, w * 0.2);
  s += `<rect x="${f(x - 3)}" y="${f(y - h * 0.16)}" width="6" height="${f(h * 0.17)}" fill="#6b4426" ${ink(2)}/>`;
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    const by = y - h * 0.14 - t * h * 0.28;
    const tw = w * (1 - t * 0.38);
    const top = by - h * 0.46;
    s += `<path d="M${f(x - tw)} ${f(by)} L${f(x)} ${f(top)} L${f(x + tw)} ${f(by)} Q${f(x)} ${f(by - 6)} ${f(x - tw)} ${f(by)} Z" fill="${c}" ${ink(2.5)}/>`;
    s += `<path d="M${f(x)} ${f(top + 4)} L${f(x + tw - 3)} ${f(by - 2)} Q${f(x + tw * 0.4)} ${f(by - 4)} ${f(x + 2)} ${f(by - 3)} Z" fill="${sh}"/>`;
  }
  return s;
}

function bush(x, y, r) {
  let s = shadowBlob(x + 4, y + 2, r * 1.2, r * 0.3);
  s += `<path d="${bumpy(x, y - r * 0.5, r * 1.15, r * 0.65, 7, r * 0.42)}" fill="${P.leaf}" ${ink(2.5)}/>`;
  s += `<path d="${bumpy(x + r * 0.3, y - r * 0.3, r * 0.7, r * 0.35, 5, r * 0.25)}" fill="${P.leafSh}"/>`;
  s += `<path d="${bumpy(x, y - r * 0.5, r * 1.15, r * 0.65, 7, r * 0.42)}" fill="none" ${ink(2.5)}/>`;
  if (rnd() > 0.45) for (let i = 0; i < 4; i++) s += `<circle cx="${f(x + rr(-r * 0.8, r * 0.6))}" cy="${f(y - rr(r * 0.3, r * 0.9))}" r="2.6" fill="${['#e36d8f', '#f2d04b', '#ffffff'][i % 3]}" ${ink(1)}/>`;
  return s;
}

function rock(x, y, r) {
  const d = `M${f(x - r)} ${f(y)} L${f(x - r * 0.85)} ${f(y - r * 0.55)} L${f(x - r * 0.3)} ${f(y - r * 0.95)} L${f(x + r * 0.45)} ${f(y - r * 0.85)} L${f(x + r)} ${f(y - r * 0.3)} L${f(x + r * 0.9)} ${f(y)} Z`;
  return `${shadowBlob(x + 3, y + 2, r * 1.05, r * 0.3)}<path d="${d}" fill="${P.rock}" ${ink(2.5)}/><path d="M${f(x + r * 0.1)} ${f(y - r * 0.9)} L${f(x + r)} ${f(y - r * 0.3)} L${f(x + r * 0.9)} ${f(y)} L${f(x)} ${f(y)} Z" fill="${P.rockSh}"/><path d="${d}" fill="none" ${ink(2.5)}/><path d="M${f(x - r * 0.55)} ${f(y - r * 0.55)} L${f(x - r * 0.2)} ${f(y - r * 0.8)}" stroke="#fff" stroke-width="2" opacity=".6"/>`;
}

function windowAt(x, y, w, h, arched = false) {
  const shape = arched
    ? `M${f(x)} ${f(y + h)} V${f(y + w / 2)} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(y + w / 2)} V${f(y + h)} Z`
    : `M${f(x)} ${f(y)} h${f(w)} v${f(h)} h${f(-w)} Z`;
  const mull = `<path d="M${f(x + w / 2)} ${f(y + (arched ? w / 3 : 1))} V${f(y + h)} M${f(x)} ${f(y + h * 0.5)} H${f(x + w)}" stroke="${INK}" stroke-width="1.8"/>`;
  base.push(`<path d="${shape}" fill="${P.glass}" ${ink(2.5)}/><path d="M${f(x + 2)} ${f(y + h - 3)} L${f(x + w * 0.45)} ${f(y + 3)}" stroke="${P.glassHi}" stroke-width="2.4" opacity=".8"/>${mull}`);
  lights.push(`<path d="${shape}" fill="#ffd552" ${ink(2.5)}/><path d="${shape}" fill="#fff6c8" transform="translate(${f(x + w / 2)} ${f(y + h / 2)}) scale(.55) translate(${f(-(x + w / 2))} ${f(-(y + h / 2))})"/>${mull}`);
  spots.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) * 2.4, kind: 'window' });
}

function house(o) {
  const { x, y, w, h, roofH, d, stone = false, red = false, wheel = false, chimney = true, floors = 2 } = o;
  const dy = d * 0.45;
  const wall = stone ? P.stone : P.plaster;
  const wallSh = stone ? P.stoneSh : P.plasterSh;
  const roof = red ? P.roofRed : P.roof;
  const roofSh = red ? P.roofRedSh : P.roofSh;
  const roofHi = red ? P.roofRedHi : P.roofHi;
  const gx = x + w / 2;
  const gy = y - h - roofH;
  let s = '';
  // ombre portée
  s += `<path d="M${f(x + 8)} ${f(y + 4)} L${f(x + w + d + 26)} ${f(y - dy + 6)} L${f(x + w + d + 46)} ${f(y + 16)} L${f(x + 16)} ${f(y + 18)} Z" fill="${INK}" opacity=".25"/>`;
  // mur latéral (ombre + hachures)
  const side = `M${f(x + w)} ${f(y)} L${f(x + w + d)} ${f(y - dy)} L${f(x + w + d)} ${f(y - h - dy)} L${f(x + w)} ${f(y - h)} Z`;
  s += `<path d="${side}" fill="${wallSh}" ${ink(3)}/><path d="${side}" fill="url(#hatch)" opacity=".22"/>`;
  if (stone) s += `<path d="${side}" fill="url(#bricks)"/>`;
  // façade + pignon
  const front = `M${f(x)} ${f(y)} V${f(y - h)} L${f(gx)} ${f(gy)} L${f(x + w)} ${f(y - h)} V${f(y)} Z`;
  s += `<path d="${front}" fill="${wall}" ${ink(3)}/>`;
  if (stone) s += `<path d="${front}" fill="url(#bricks)"/>`;
  // ombre sous l'avancée du toit
  s += `<path d="M${f(x)} ${f(y - h)} L${f(gx)} ${f(gy)} L${f(x + w)} ${f(y - h)} L${f(x + w)} ${f(y - h + 12)} L${f(gx)} ${f(gy + 16)} L${f(x)} ${f(y - h + 12)} Z" fill="${INK}" opacity=".18"/>`;
  if (!stone) {
    const t = `stroke="${P.timber}" stroke-linecap="round"`;
    const sw = Math.max(4, w * 0.035);
    const mid = y - h * 0.52;
    if (floors === 2) s += `<path d="M${f(x)} ${f(mid)} H${f(x + w)}" ${t} stroke-width="${f(sw * 1.4)}"/>`;
    for (let i = 1; i < 4; i++) s += `<path d="M${f(x + (w * i) / 4)} ${f(y - h)} V${f(y)}" ${t} stroke-width="${f(sw)}"/>`;
    s += `<path d="M${f(x + 3)} ${f(y - h + 3)} L${f(x + w / 4)} ${f(mid)} M${f(x + w - 3)} ${f(y - h + 3)} L${f(x + (3 * w) / 4)} ${f(mid)}" ${t} stroke-width="${f(sw)}"/>`;
    s += `<path d="M${f(x + w * 0.22)} ${f(y - h)} L${f(gx)} ${f(gy + roofH * 0.3)} L${f(x + w * 0.78)} ${f(y - h)} M${f(gx)} ${f(gy + roofH * 0.3)} V${f(y - h)}" ${t} stroke-width="${f(sw)}" fill="none"/>`;
    s += `<path d="M${f(x)} ${f(y - h)} H${f(x + w)}" ${t} stroke-width="${f(sw * 1.4)}"/>`;
    s += `<path d="M${f(x + w)} ${f(mid)} L${f(x + w + d)} ${f(mid - dy)} M${f(x + w + d / 2)} ${f(y - dy / 2)} V${f(y - h - dy / 2)}" stroke="#3e2614" stroke-width="${f(sw)}"/>`;
  }
  // soubassement
  s += `<path d="M${f(x)} ${f(y)} V${f(y - h * 0.12)} H${f(x + w)} V${f(y)} Z" fill="${P.stone}" ${ink(2.5)}/><path d="M${f(x)} ${f(y)} V${f(y - h * 0.12)} H${f(x + w)} V${f(y)} Z" fill="url(#bricks)"/>`;
  s += `<path d="${front}" fill="none" ${ink(3.5)}/>`;
  // toit
  const roofP = `M${f(gx)} ${f(gy)} L${f(x + w + 12)} ${f(y - h + 6)} L${f(x + w + 12 + d)} ${f(y - h + 6 - dy)} L${f(gx + d)} ${f(gy - dy)} Z`;
  s += `<path d="${roofP}" fill="${roof}" ${ink(3.5)}/><path d="${roofP}" fill="url(#slate)"/>`;
  s += `<path d="M${f(gx + (w / 2 + 12) * 0.55)} ${f(gy + (h * 0 + roofH) * 0.55)} L${f(x + w + 12)} ${f(y - h + 6)} L${f(x + w + 12 + d)} ${f(y - h + 6 - dy)} L${f(gx + d + (w / 2 + 12) * 0.55)} ${f(gy - dy + roofH * 0.55)} Z" fill="${roofSh}" opacity=".75"/>`;
  s += `<path d="M${f(gx + 4)} ${f(gy + 3)} L${f(gx + d - 4)} ${f(gy - dy + 3)}" stroke="${roofHi}" stroke-width="5" stroke-linecap="round"/>`;
  s += `<path d="${roofP}" fill="none" ${ink(3.5)}/>`;
  // rives
  s += `<path d="M${f(x - 12)} ${f(y - h + 8)} L${f(gx)} ${f(gy - 5)} L${f(x + w + 12)} ${f(y - h + 8)}" stroke="${INK}" stroke-width="${f(Math.max(7, w * 0.06))}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<path d="M${f(x - 10)} ${f(y - h + 6)} L${f(gx)} ${f(gy - 6)} L${f(x + w + 10)} ${f(y - h + 6)}" stroke="${roof}" stroke-width="${f(Math.max(3, w * 0.025))}" fill="none" stroke-linejoin="round"/>`;
  base.push(s);
  // porte
  const dw = w * 0.2;
  const dh = h * 0.38;
  const dx = x + w * 0.4;
  base.push(`<path d="M${f(dx)} ${f(y)} V${f(y - dh + dw / 2)} A${f(dw / 2)} ${f(dw / 2)} 0 0 1 ${f(dx + dw)} ${f(y - dh + dw / 2)} V${f(y)} Z" fill="${P.wood}" ${ink(3)}/><path d="M${f(dx + dw * 0.55)} ${f(y - dh + 4)} V${f(y)} L${f(dx + dw)} ${f(y)} V${f(y - dh + dw / 2)} Z" fill="${P.woodSh}" opacity=".6"/><path d="M${f(dx + dw / 3)} ${f(y - dh + 6)} V${f(y - 2)} M${f(dx + (2 * dw) / 3)} ${f(y - dh + 6)} V${f(y - 2)}" stroke="${INK}" stroke-width="1.4"/><circle cx="${f(dx + dw * 0.8)}" cy="${f(y - dh * 0.42)}" r="2.2" fill="#f2c94c" ${ink(1)}/>`);
  const ww = w * 0.14;
  const wh = h * 0.2;
  windowAt(x + w * 0.12, y - h * 0.42, ww, wh, stone);
  windowAt(x + w * 0.74, y - h * 0.42, ww, wh, stone);
  if (floors === 2) {
    windowAt(x + w * 0.16, y - h * 0.88, ww, wh * 0.9);
    windowAt(x + w * 0.7, y - h * 0.88, ww, wh * 0.9);
  }
  windowAt(gx - ww * 0.4, gy + roofH * 0.48, ww * 0.8, wh * 0.72, true);
  windowAt(x + w + d * 0.35, y - h * 0.56 - dy * 0.35, ww * 0.7, wh * 0.9);
  // volets et jardinière
  base.push(`<rect x="${f(x + w * 0.12 - 6)}" y="${f(y - h * 0.42)}" width="6" height="${f(wh)}" fill="#3f6b4a" ${ink(1.8)}/><rect x="${f(x + w * 0.12 + ww)}" y="${f(y - h * 0.42)}" width="6" height="${f(wh)}" fill="#3f6b4a" ${ink(1.8)}/>`);
  base.push(`<rect x="${f(x + w * 0.72)}" y="${f(y - h * 0.42 + wh)}" width="${f(ww * 1.25)}" height="6" fill="${P.wood}" ${ink(1.8)}/><circle cx="${f(x + w * 0.75)}" cy="${f(y - h * 0.42 + wh - 1)}" r="3.6" fill="#e3546d" ${ink(1.3)}/><circle cx="${f(x + w * 0.81)}" cy="${f(y - h * 0.42 + wh - 2)}" r="3.6" fill="#f2d04b" ${ink(1.3)}/><circle cx="${f(x + w * 0.87)}" cy="${f(y - h * 0.42 + wh - 1)}" r="3.6" fill="#e3546d" ${ink(1.3)}/>`);
  if (chimney) {
    const cx = gx + d * 0.55;
    const cy = gy - dy * 0.55 + roofH * 0.35;
    const cw = Math.max(10, w * 0.09);
    base.push(`<rect x="${f(cx)}" y="${f(cy - roofH * 0.55)}" width="${f(cw)}" height="${f(roofH * 0.55)}" fill="#b56b4c" ${ink(2.5)}/><rect x="${f(cx)}" y="${f(cy - roofH * 0.55)}" width="${f(cw)}" height="${f(roofH * 0.55)}" fill="url(#bricks)"/><rect x="${f(cx + cw * 0.55)}" y="${f(cy - roofH * 0.55)}" width="${f(cw * 0.45)}" height="${f(roofH * 0.55)}" fill="${INK}" opacity=".22"/><rect x="${f(cx - 3)}" y="${f(cy - roofH * 0.6)}" width="${f(cw + 6)}" height="7" fill="#7a4a35" ${ink(2.5)}/>`);
  }
  if (wheel) {
    const wx = x + w + d * 0.55;
    const wy = y - h * 0.22 - dy * 0.55;
    const R = h * 0.42;
    let g = `<ellipse cx="${f(wx)}" cy="${f(wy)}" rx="${f(R * 0.36)}" ry="${f(R)}" fill="none" stroke="${INK}" stroke-width="12"/><ellipse cx="${f(wx)}" cy="${f(wy)}" rx="${f(R * 0.36)}" ry="${f(R)}" fill="none" stroke="${P.wood}" stroke-width="7"/>`;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g += `<path d="M${f(wx)} ${f(wy)} L${f(wx + Math.cos(a) * R * 0.36)} ${f(wy + Math.sin(a) * R)}" stroke="${INK}" stroke-width="3.5"/>`;
    }
    g += `<circle cx="${f(wx)}" cy="${f(wy)}" r="7" fill="${P.woodSh}" ${ink(2.5)}/>`;
    base.push(g);
  }
}

function lampPost(x, y, h = 70) {
  base.push(`${shadowBlob(x + 10, y + 2, 15, 4)}<rect x="${f(x - 3)}" y="${f(y - h)}" width="6" height="${h}" fill="#3a3530" ${ink(2)}/><rect x="${f(x - 7)}" y="${f(y - 7)}" width="14" height="7" fill="#3a3530" ${ink(2)}/><path d="M${f(x - 10)} ${f(y - h)} h20 l-3 -18 h-14 Z" fill="#4a443c" ${ink(2.5)}/><path d="M${f(x - 8)} ${f(y - h - 18)} h16 l-8 -9 Z" fill="#3a3530" ${ink(2.5)}/><rect x="${f(x - 6)}" y="${f(y - h - 15)}" width="12" height="12" fill="#5a5750" ${ink(1.8)}/>`);
  lights.push(`<rect x="${f(x - 6)}" y="${f(y - h - 15)}" width="12" height="12" fill="#ffd552" ${ink(1.8)}/><rect x="${f(x - 3)}" y="${f(y - h - 12)}" width="6" height="6" fill="#fff6c8"/>`);
  spots.push({ x, y: y - h - 9, r: 75, kind: 'lantern' });
}

function hangingLantern(x, y) {
  base.push(`<path d="M${f(x)} ${f(y - 20)} v10" stroke="${INK}" stroke-width="2.5"/><path d="M${f(x - 9)} ${f(y - 10)} h18 l-3 22 h-12 Z" fill="#4a443c" ${ink(2.5)}/><rect x="${f(x - 5)}" y="${f(y - 7)}" width="10" height="14" fill="#5a5750" ${ink(1.5)}/>`);
  lights.push(`<rect x="${f(x - 5)}" y="${f(y - 7)}" width="10" height="14" fill="#ffd552" ${ink(1.5)}/>`);
  spots.push({ x, y, r: 80, kind: 'lantern' });
}

function bench(x, y, angle, len = 46) {
  base.push(`<g transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})"><rect x="${f(-len / 2 + 4)}" y="2" width="5" height="9" fill="${P.woodSh}" ${ink(1.6)}/><rect x="${f(len / 2 - 9)}" y="2" width="5" height="9" fill="${P.woodSh}" ${ink(1.6)}/><rect x="${f(-len / 2)}" y="-6" width="${len}" height="10" rx="2" fill="${P.wood}" ${ink(2.5)}/><path d="M${f(-len / 2 + 3)} -1 h${len - 6}" stroke="${INK}" stroke-width="1" opacity=".5"/></g>`);
}

function table(x, y) {
  bench(x, y - 17, 0, 56);
  base.push(`${shadowBlob(x + 4, y + 12, 36, 8)}<rect x="${f(x - 26)}" y="${f(y + 4)}" width="5" height="12" fill="${P.woodSh}" ${ink(1.6)}/><rect x="${f(x + 21)}" y="${f(y + 4)}" width="5" height="12" fill="${P.woodSh}" ${ink(1.6)}/><rect x="${f(x - 32)}" y="${f(y - 9)}" width="64" height="15" rx="2" fill="${P.wood}" ${ink(2.5)}/><rect x="${f(x - 32)}" y="${f(y - 9)}" width="64" height="15" fill="url(#planks)"/>`);
  bench(x, y + 22, 0, 56);
}

function barrel(x, y, r = 10) {
  base.push(`${shadowBlob(x + 3, y + 2, r, r * 0.3)}<path d="M${f(x - r)} ${f(y)} V${f(y - r * 2.2)} H${f(x + r)} V${f(y)} Z" fill="${P.wood}" ${ink(2.2)}/><path d="M${f(x + r * 0.3)} ${f(y)} V${f(y - r * 2.2)} H${f(x + r)} V${f(y)} Z" fill="${P.woodSh}"/><path d="M${f(x - r)} ${f(y - r * 1.7)} h${f(r * 2)} M${f(x - r)} ${f(y - r * 0.5)} h${f(r * 2)}" stroke="${INK}" stroke-width="2.4"/><ellipse cx="${f(x)}" cy="${f(y - r * 2.2)}" rx="${f(r)}" ry="${f(r * 0.35)}" fill="#c9884a" ${ink(2.2)}/>`);
}

function crate(x, y, s = 17) {
  base.push(`${shadowBlob(x + s * 0.6, y + 2, s * 0.8, 4)}<rect x="${f(x)}" y="${f(y - s)}" width="${s}" height="${s}" fill="#c48a4c" ${ink(2.2)}/><path d="M${f(x)} ${f(y - s)} L${f(x + s)} ${f(y)} M${f(x + s)} ${f(y - s)} L${f(x)} ${f(y)}" stroke="${INK}" stroke-width="1.6"/>`);
}

function fence(x1, y1, x2, y2, posts = 8) {
  let s = `<path d="M${f(x1)} ${f(y1 - 15)} L${f(x2)} ${f(y2 - 15)} M${f(x1)} ${f(y1 - 7)} L${f(x2)} ${f(y2 - 7)}" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/><path d="M${f(x1)} ${f(y1 - 15)} L${f(x2)} ${f(y2 - 15)} M${f(x1)} ${f(y1 - 7)} L${f(x2)} ${f(y2 - 7)}" stroke="${P.wood}" stroke-width="3"/>`;
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    s += `<path d="M${f(x1 + (x2 - x1) * t - 2.5)} ${f(y1 + (y2 - y1) * t + 2)} v-24 l2.5 -4 l2.5 4 v24 Z" fill="${P.wood}" ${ink(2)}/>`;
  }
  base.push(s);
}

function tombstone(x, y, s, kind) {
  let g = shadowBlob(x + s * 0.4, y + 2, s * 0.6, s * 0.16);
  if (kind === 0) g += `<path d="M${f(x - s / 2)} ${f(y)} V${f(y - s * 0.9)} A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(x + s / 2)} ${f(y - s * 0.9)} V${f(y)} Z" fill="#b9b6ae" ${ink(2.2)}/><path d="M${f(x + s * 0.12)} ${f(y)} V${f(y - s * 1.2)} A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(x + s / 2)} ${f(y - s * 0.9)} V${f(y)} Z" fill="#7d7a74"/><path d="M${f(x - s / 2)} ${f(y)} V${f(y - s * 0.9)} A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(x + s / 2)} ${f(y - s * 0.9)} V${f(y)} Z" fill="none" ${ink(2.2)}/><path d="M${f(x - s * 0.2)} ${f(y - s * 0.8)} h${f(s * 0.3)}" stroke="${INK}" stroke-width="1.3"/>`;
  else if (kind === 1) g += `<path d="M${f(x)} ${f(y)} V${f(y - s * 1.5)} M${f(x - s * 0.42)} ${f(y - s * 1.1)} H${f(x + s * 0.42)}" stroke="${INK}" stroke-width="${f(s * 0.32)}" stroke-linecap="square"/><path d="M${f(x)} ${f(y - 2)} V${f(y - s * 1.45)} M${f(x - s * 0.38)} ${f(y - s * 1.1)} H${f(x + s * 0.38)}" stroke="#a9a59c" stroke-width="${f(s * 0.16)}"/>`;
  else g += `<rect x="${f(x - s * 0.45)}" y="${f(y - s * 1.1)}" width="${f(s * 0.9)}" height="${f(s * 1.1)}" fill="#b9b6ae" ${ink(2.2)}/><rect x="${f(x + s * 0.1)}" y="${f(y - s * 1.1)}" width="${f(s * 0.35)}" height="${f(s * 1.1)}" fill="#7d7a74"/><rect x="${f(x - s * 0.45)}" y="${f(y - s * 1.1)}" width="${f(s * 0.9)}" height="${f(s * 1.1)}" fill="none" ${ink(2.2)}/>`;
  base.push(g);
}

// ================================================================== COMPOSITION

// --- Lointain (aplats + contours)
base.push(`<path d="M0 205 L70 140 L140 170 L215 100 L300 155 L385 85 L470 145 L560 100 L640 135 L705 88 L765 125 L865 62 L960 120 L1060 52 L1160 115 L1250 74 L1340 125 L1425 62 L1536 115 L1536 270 L0 270 Z" fill="${P.mtn}" ${ink(3)}/>`);
base.push(`<path d="M385 85 L470 145 L430 150 L405 120 Z M865 62 L960 120 L915 125 L888 95 Z M1060 52 L1160 115 L1112 118 L1085 85 Z M1425 62 L1536 115 L1490 120 L1450 92 Z M215 100 L300 155 L262 158 L238 128 Z" fill="${P.mtnSh}"/>`);
base.push(`<path d="M385 85 L402 102 L392 108 L380 100 L370 104 Z M865 62 L884 82 L872 86 L860 80 L850 84 Z M1060 52 L1080 72 L1068 76 L1055 70 L1046 74 Z M1425 62 L1444 82 L1432 86 L1420 80 L1410 84 Z" fill="#fff" ${ink(2)}/>`);
base.push(`<path d="M0 232 L90 186 L180 212 L270 170 L360 202 L450 160 L560 196 L660 150 L760 192 L880 160 L1000 196 L1120 150 L1230 192 L1340 160 L1440 196 L1536 176 L1536 300 L0 300 Z" fill="${P.mtn2}" ${ink(3)}/>`);
base.push(`<path d="M0 232 L90 186 L180 212 L270 170 L360 202 L450 160 L560 196 L660 150 L760 192 L880 160 L1000 196 L1120 150 L1230 192 L1340 160 L1440 196 L1536 176 L1536 300 L0 300 Z" fill="url(#dots)" opacity=".18"/>`);
// château
base.push(`<path d="M630 162 Q700 118 770 162 Z" fill="${P.mtn2Sh}" ${ink(2.5)}/><path d="M685 146 V96 h4 v-6 h5 v6 h5 v-6 h5 v6 h3 V112 h32 V100 h3 v-5 h4 v5 h4 v-5 h3 V146 Z" fill="#4c5662" ${ink(2.5)}/><rect x="694" y="116" width="5" height="9" fill="${INK}"/><rect x="726" y="122" width="5" height="9" fill="${INK}"/>`);
// lac + rivière lointaine
base.push(`<path d="M470 210 Q560 186 680 194 Q760 198 805 214 Q700 226 560 224 Z" fill="${P.water}" ${ink(2.5)}/><path d="M520 208 h60 M640 212 h50" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`);
base.push(`<path d="M1400 150 Q1480 140 1536 150 L1536 320 Q1470 300 1440 250 Q1420 200 1400 150 Z" fill="${P.water}" ${ink(2.5)}/>`);
// moulin lointain
base.push(`<g transform="translate(575 226)"><path d="M-9 0 L-6 -32 L6 -32 L9 0 Z" fill="${P.plaster}" ${ink(2)}/><path d="M-7 -32 L0 -41 L7 -32 Z" fill="${P.roofRed}" ${ink(2)}/><g ${ink(2.5)}><path d="M0 -32 L-19 -52 M0 -32 L19 -50 M0 -32 L-17 -13 M0 -32 L18 -14"/></g></g>`);

// --- Forêt du fond
for (let x = -10; x < W + 20; x += rr(16, 26)) base.push(pine(x, 255 + Math.sin(x / 90) * 10 + rr(-5, 8), rr(52, 82), true));

// --- Sol (aplat + ombres franches + touffes)
const groundD = `M0 262 Q200 245 400 255 Q620 268 800 250 Q1050 238 1250 258 Q1420 268 1536 255 L1536 1024 L0 1024 Z`;
base.push(`<path d="${groundD}" fill="${P.grass}" ${ink(3)}/>`);
for (let i = 0; i < 26; i++) {
  const x = rr(0, W);
  const y = rr(300, H);
  base.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rr(50, 130))}" ry="${f(rr(14, 34))}" fill="${P.grassSh}" opacity=".7"/>`);
}
for (let i = 0; i < 18; i++) base.push(`<ellipse cx="${f(rr(0, W))}" cy="${f(rr(300, H))}" rx="${f(rr(40, 90))}" ry="${f(rr(10, 22))}" fill="${P.grassHi}" opacity=".55"/>`);
{
  let g = '';
  for (let i = 0; i < 520; i++) {
    const x = rr(0, W);
    const y = rr(285, H);
    const ex = (x - 768) / 395;
    const ey = (y - 565) / 255;
    if (ex * ex + ey * ey < 1) continue;
    g += `<path d="M${f(x - 4)} ${f(y)} q2 -6 1 -10 M${f(x)} ${f(y)} q0 -8 2 -12 M${f(x + 4)} ${f(y)} q-1 -6 2 -9" stroke="${INK}" stroke-width="1.5" fill="none" opacity=".55"/>`;
  }
  base.push(g);
}
for (let x = 280; x < 1100; x += rr(22, 36)) {
  if (x > 560 && x < 700) continue;
  base.push(pine(x, 278 + rr(-4, 10), rr(46, 70)));
}
for (let x = 1100; x < W; x += rr(20, 32)) base.push(pine(x, 272 + rr(-6, 10), rr(56, 86), rnd() > 0.5));

// --- Rivière
const riverL = [[455, 262], [380, 300], [300, 330], [250, 400], [290, 470], [262, 560], [300, 640], [250, 720], [175, 810], [140, 910], [120, 1024]];
const riverR = [[505, 262], [440, 312], [360, 350], [320, 410], [355, 480], [335, 565], [375, 640], [330, 735], [265, 830], [240, 930], [235, 1024]];
const smooth = (p) => {
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) d += ` Q${f(p[i][0])} ${f(p[i][1])} ${f((p[i][0] + p[i + 1][0]) / 2)} ${f((p[i][1] + p[i + 1][1]) / 2)}`;
  const l = p[p.length - 1];
  return d + ` L${f(l[0])} ${f(l[1])}`;
};
const riverD = `${smooth(riverL)} L${riverR[riverR.length - 1].join(' ')} ${smooth([...riverR].reverse()).replace(/^M/, 'L')} Z`;
base.push(`<path d="${riverD}" fill="#8a6a40" transform="translate(5 5)"/>`);
base.push(`<path d="${riverD}" fill="${P.water}" ${ink(4)}/>`);
base.push(`<path d="${smooth(riverR.map(([x, y]) => [x - 14, y]))}" stroke="${P.waterSh}" stroke-width="18" fill="none" opacity=".8"/>`);
for (let i = 0; i < 30; i++) {
  const idx = Math.floor(rnd() * (riverL.length - 1));
  const t = rnd();
  const cx = riverL[idx][0] + (riverR[idx][0] - riverL[idx][0]) * (0.3 + t * 0.4) + rr(-6, 6);
  const cy = riverL[idx][1] + (riverL[idx + 1][1] - riverL[idx][1]) * rnd();
  base.push(`<path d="M${f(cx - 12)} ${f(cy)} q12 -5 24 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>`);
}
base.push(`<path d="M268 556 q32 8 64 2 v28 q-32 6 -64 -2 Z" fill="#fff" ${ink(2.5)}/><path d="M280 562 v20 M296 563 v22 M312 562 v22" stroke="${P.waterHi}" stroke-width="3"/><path d="M262 590 q8 -8 16 0 q8 -8 16 0 q8 -8 16 0 q8 -8 16 0 q8 -8 12 0" stroke="${INK}" stroke-width="2" fill="#fff"/>`);
for (const [x, y, r] of [[250, 548, 15], [347, 554, 13], [240, 662, 13], [382, 642, 11], [170, 822, 15], [284, 830, 13], [130, 932, 17], [256, 942, 15], [302, 402, 11], [244, 402, 12]]) base.push(rock(x, y, r));

// --- Chemins pavés
const road = (d, w) => {
  base.push(`<path d="${d}" stroke="${INK}" stroke-width="${w + 7}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.cobble}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`);
  base.push(`<path d="${d}" stroke="${P.cobbleGap}" stroke-width="${w - 8}" fill="none" stroke-linecap="round" stroke-dasharray="11 7" opacity=".55"/>`);
};
road('M768 560 Q790 420 840 360 Q900 300 1010 285', 70);
road('M768 560 Q640 450 520 395', 60);
road('M768 560 Q560 600 400 690', 74);
road('M768 560 Q1000 520 1180 470 Q1300 440 1400 455', 64);
road('M768 560 Q1000 700 1150 860 Q1220 940 1260 1024', 78);
road('M768 560 Q760 800 800 1024', 70);
road('M840 360 Q860 300 820 250', 40);

// --- Grande place
const SQ = { cx: 768, cy: 565, rx: 380, ry: 240 };
base.push(`<ellipse cx="${SQ.cx}" cy="${SQ.cy}" rx="${SQ.rx}" ry="${SQ.ry}" fill="${P.cobble}" ${ink(5)}/>`);
{
  let g = '';
  for (let k = 0.1; k <= 0.99; k += 0.075) {
    const rx = SQ.rx * k;
    const ry = SQ.ry * k;
    g += `<ellipse cx="${SQ.cx}" cy="${SQ.cy}" rx="${f(rx)}" ry="${f(ry)}" fill="none" stroke="${P.cobbleGap}" stroke-width="2" opacity=".75"/>`;
    const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const n = Math.floor(per / 26);
    const off = rnd() * 6;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const r2x = SQ.rx * (k + 0.0375);
      const r2y = SQ.ry * (k + 0.0375);
      g += `<path d="M${f(SQ.cx + Math.cos(a) * rx)} ${f(SQ.cy + Math.sin(a) * ry)} L${f(SQ.cx + Math.cos(a) * (r2x + SQ.rx * 0.0375))} ${f(SQ.cy + Math.sin(a) * (r2y + SQ.ry * 0.0375))}" stroke="${P.cobbleGap}" stroke-width="1.6" opacity=".6"/>`;
    }
  }
  // ombre BD sur la moitié basse-droite de la place
  g += `<path d="M${SQ.cx + SQ.rx} ${SQ.cy} A${SQ.rx} ${SQ.ry} 0 0 1 ${SQ.cx - SQ.rx * 0.6} ${SQ.cy + SQ.ry * 0.8} A${SQ.rx * 0.95} ${SQ.ry * 0.9} 0 0 0 ${SQ.cx + SQ.rx} ${SQ.cy} Z" fill="${P.cobbleSh}" opacity=".55"/>`;
  g += `<ellipse cx="${SQ.cx}" cy="${SQ.cy}" rx="${SQ.rx - 6}" ry="${SQ.ry - 5}" fill="url(#dots)" opacity=".08"/>`;
  base.push(g);
}
base.push(`<ellipse cx="${SQ.cx}" cy="${SQ.cy}" rx="${SQ.rx}" ry="${SQ.ry}" fill="none" ${ink(5)}/>`);

// --- Cimetière
base.push(`<path d="M1090 300 L1536 285 L1536 560 L1290 450 L1090 360 Z" fill="#5f7a3a" ${ink(2.5)}/><path d="M1090 300 L1536 285 L1536 560 L1290 450 L1090 360 Z" fill="url(#dots)" opacity=".16"/>`);
const tombs = [];
for (let row = 0; row < 5; row++)
  for (let i = 0; i < 9; i++) {
    const x = 1150 + i * 44 + row * 14 + rr(-6, 6);
    const y = 300 + row * 34 + i * 4 + rr(-4, 4);
    if (y > 300 + (x - 1100) * 0.45 + 70) continue;
    tombs.push([x, y]);
  }
tombs.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => tombstone(x, y, rr(15, 23), Math.floor(rnd() * 3)));
base.push(`<path d="M1460 332 C1455 262 1470 222 1440 172 M1452 262 C1490 232 1510 202 1530 197 M1446 222 C1420 202 1405 177 1395 162 M1458 302 C1420 282 1400 272 1380 264" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M1460 332 C1455 262 1470 222 1440 172 M1452 262 C1490 232 1510 202 1530 197 M1446 222 C1420 202 1405 177 1395 162 M1458 302 C1420 282 1400 272 1380 264" stroke="#5a4636" stroke-width="5" fill="none" stroke-linecap="round"/>`);
base.push(`<path d="M1430 170 q9 -12 20 -5 q7 -2 9 5 l-7 2 q-4 9 -15 7 Z" fill="${INK}"/><circle cx="1452" cy="166" r="1.6" fill="#fff"/>`);
base.push(`<path d="M1080 368 L1200 420 M1300 465 L1536 575" stroke="${INK}" stroke-width="26" stroke-linecap="square"/><path d="M1080 368 L1200 420 M1300 465 L1536 575" stroke="${P.stone}" stroke-width="19"/><path d="M1080 368 L1200 420 M1300 465 L1536 575" stroke="url(#bricks)" stroke-width="19"/><path d="M1080 360 L1200 412 M1300 457 L1536 567" stroke="#e7dfcf" stroke-width="3"/>`);
for (const [x, y] of [[1196, 425], [1304, 470]]) base.push(`<rect x="${x - 13}" y="${y - 64}" width="26" height="66" fill="${P.stone}" ${ink(3)}/><rect x="${x + 2}" y="${y - 64}" width="11" height="66" fill="${P.stoneSh}"/><rect x="${x - 13}" y="${y - 64}" width="26" height="66" fill="none" ${ink(3)}/><path d="M${x - 17} ${y - 64} h34 l-17 -15 Z" fill="${P.stoneSh}" ${ink(3)}/>`);
base.push(`<g ${ink(3)} fill="none"><path d="M1208 425 L1292 465"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${1212 + i * 9} ${427 + i * 4.2} v-46"/>`).join('')}<path d="M1210 384 Q1250 360 1292 420"/></g>`);

// --- Église
house({ x: 960, y: 290, w: 150, h: 105, roofH: 80, d: 150, stone: true, chimney: false, floors: 1 });
base.push(`<rect x="920" y="120" width="56" height="175" fill="${P.stone}" ${ink(3.5)}/><rect x="920" y="120" width="56" height="175" fill="url(#bricks)"/><path d="M976 120 L1004 108 L1004 283 L976 295 Z" fill="${P.stoneSh}" ${ink(3.5)}/><path d="M976 120 L1004 108 L1004 283 L976 295 Z" fill="url(#hatch)" opacity=".25"/>`);
base.push(`<path d="M914 122 L948 16 L982 122 Z" fill="${P.roof}" ${ink(3.5)}/><path d="M982 122 L948 16 L1010 110 Z" fill="${P.roofSh}" ${ink(3.5)}/><path d="M948 16 v-18 M940 4 h16" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M948 16 v-18 M940 4 h16" stroke="#f2c94c" stroke-width="2.2" stroke-linecap="round"/>`);
windowAt(938, 150, 20, 34, true);
windowAt(938, 212, 20, 40, true);

// --- Maisons (arrière → avant)
house({ x: 230, y: 300, w: 90, h: 62, roofH: 55, d: 55, red: true });
house({ x: 745, y: 262, w: 80, h: 58, roofH: 50, d: 48 });
house({ x: 860, y: 250, w: 62, h: 48, roofH: 42, d: 40, chimney: false, floors: 1, red: true });
house({ x: 610, y: 318, w: 88, h: 66, roofH: 58, d: 52, red: true });
house({ x: 380, y: 395, w: 175, h: 112, roofH: 92, d: 95 });
house({ x: 695, y: 392, w: 120, h: 88, roofH: 72, d: 68, red: true });
house({ x: -40, y: 545, w: 200, h: 150, roofH: 110, d: 95, wheel: true });
house({ x: 1180, y: 905, w: 205, h: 150, roofH: 120, d: 130, red: true });
house({ x: -70, y: 1000, w: 165, h: 135, roofH: 100, d: 80 });

// --- Arbres
for (const [x, y, r, d] of [
  [340, 268, 26, 0], [560, 302, 22, 1], [905, 302, 26, 0], [1215, 332, 28, 1], [1290, 612, 34, 0], [1370, 642, 30, 1],
  [140, 652, 28, 0], [425, 440, 22, 1], [1080, 422, 22, 0], [1460, 722, 34, 1], [1505, 862, 30, 0],
]) base.push(tree(x, y, r, d));
for (const [x, y, h] of [[1010, 302, 60], [1150, 277, 66], [190, 472, 68]]) base.push(pine(x, y, h));

// --- Feu de camp + bancs
{
  const cx = 768;
  const cy = 556;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    bench(cx + Math.cos(a) * 105, cy + Math.sin(a) * 66, (Math.atan2(Math.sin(a) * 66, Math.cos(a) * 105) * 180) / Math.PI + 90, 44);
  }
  base.push(`<ellipse cx="${cx}" cy="${cy + 4}" rx="54" ry="31" fill="${INK}" opacity=".35"/>`);
  let ring = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring += `<ellipse cx="${f(cx + Math.cos(a) * 44)}" cy="${f(cy + Math.sin(a) * 25)}" rx="10" ry="7" fill="${P.rock}" ${ink(2.2)}/>`;
  }
  base.push(ring);
  base.push(`<ellipse cx="${cx}" cy="${cy}" rx="32" ry="17" fill="#3a2414" ${ink(2)}/><g ${ink(8)}><path d="M${cx - 26} ${cy + 6} L${cx + 22} ${cy - 10}"/><path d="M${cx - 24} ${cy - 8} L${cx + 24} ${cy + 6}"/></g><g stroke="#8a5a30" stroke-width="4" stroke-linecap="round"><path d="M${cx - 26} ${cy + 6} L${cx + 22} ${cy - 10}"/><path d="M${cx - 24} ${cy - 8} L${cx + 24} ${cy + 6}"/></g>`);
  // flammes : toujours présentes (petites le jour), grandes la nuit dans le calque lumière
  const flame = (k, fill) =>
    `<path d="M${cx - 22 * k} ${cy} C${cx - 28 * k} ${cy - 30 * k} ${cx - 8 * k} ${cy - 40 * k} ${cx - 6 * k} ${cy - 66 * k} C${cx + 4 * k} ${cy - 44 * k} ${cx + 18 * k} ${cy - 46 * k} ${cx + 12 * k} ${cy - 80 * k} C${cx + 32 * k} ${cy - 50 * k} ${cx + 30 * k} ${cy - 22 * k} ${cx + 22 * k} ${cy} Z" fill="${fill}" ${ink(3)}/>`;
  base.push(flame(0.6, '#f08a24'));
  base.push(`<path d="M${cx - 8} ${cy} C${cx - 10} ${cy - 14} ${cx} ${cy - 20} ${cx + 1} ${cy - 30} C${cx + 8} ${cy - 18} ${cx + 12} ${cy - 10} ${cx + 8} ${cy} Z" fill="#ffd552"/>`);
  lights.push(flame(1, '#f2601c'));
  lights.push(`<path d="M${cx - 14} ${cy} C${cx - 18} ${cy - 22} ${cx - 2} ${cy - 30} ${cx} ${cy - 50} C${cx + 8} ${cy - 30} ${cx + 18} ${cy - 24} ${cx + 14} ${cy} Z" fill="#ffc531"/><path d="M${cx - 6} ${cy} C${cx - 8} ${cy - 12} ${cx} ${cy - 18} ${cx + 1} ${cy - 28} C${cx + 6} ${cy - 16} ${cx + 9} ${cy - 10} ${cx + 6} ${cy} Z" fill="#fff6c8"/>`);
  spots.push({ x: cx, y: cy - 24, r: 270, kind: 'fire' });
}

// --- Mobilier en périphérie (la place reste libre pour les pions)
table(405, 515);
table(1135, 505);
table(1010, 765);
bench(740, 842, 0, 120);
base.push(`${shadowBlob(400, 645, 38, 9)}<rect x="361" y="622" width="68" height="20" fill="${P.stone}" ${ink(3)}/><rect x="361" y="622" width="68" height="20" fill="url(#bricks)"/><ellipse cx="395" cy="622" rx="34" ry="13" fill="${P.stone}" ${ink(3)}/><ellipse cx="395" cy="621" rx="26" ry="8" fill="${P.waterSh}" ${ink(2)}/><path d="M366 622 V578 M424 622 V578 M358 582 L395 558 L432 582 Z" stroke="${INK}" stroke-width="7" fill="${P.roofRed}" stroke-linejoin="round"/><path d="M366 622 V580 M424 622 V580" stroke="${P.wood}" stroke-width="3"/>`);
base.push(`<g transform="translate(1180 492)">${shadowBlob(10, 24, 70, 10)}<rect x="-55" y="-10" width="105" height="22" fill="${P.wood}" ${ink(3)}/><path d="M-50 -10 Q-48 -64 0 -68 Q48 -64 46 -10 Z" fill="#f1e6cc" ${ink(3)}/><path d="M10 -66 Q48 -60 46 -10 L12 -10 Z" fill="#cdbd98"/><path d="M-28 -12 Q-26 -56 -2 -66 M18 -12 Q20 -56 2 -66" stroke="${INK}" stroke-width="2" fill="none"/><path d="M-50 -10 Q-48 -64 0 -68 Q48 -64 46 -10" fill="none" ${ink(3)}/><circle cx="-36" cy="16" r="15" fill="none" stroke="${INK}" stroke-width="7"/><circle cx="-36" cy="16" r="15" fill="none" stroke="${P.wood}" stroke-width="3"/><circle cx="30" cy="16" r="15" fill="none" stroke="${INK}" stroke-width="7"/><circle cx="30" cy="16" r="15" fill="none" stroke="${P.wood}" stroke-width="3"/><path d="M50 4 L92 14" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></g>`);
for (const [x, y] of [[520, 762], [582, 802]]) base.push(`${shadowBlob(x + 6, y + 6, 36, 7)}<rect x="${x - 32}" y="${y - 14}" width="64" height="18" fill="${P.wood}" ${ink(2.5)}/><path d="M${x - 30} ${y - 30} v20 M${x + 30} ${y - 30} v20" stroke="${INK}" stroke-width="4"/><path d="M${x - 36} ${y - 44} h72 l-7 15 h-58 Z" fill="#c8453a" ${ink(2.5)}/><path d="M${x - 24} ${y - 44} l-4 15 M${x - 6} ${y - 44} l-2 15 M${x + 12} ${y - 44} l0 15 M${x + 28} ${y - 44} l2 15" stroke="#f3e6d0" stroke-width="5"/><circle cx="${x - 14}" cy="${y - 18}" r="5" fill="#e0533d" ${ink(1.5)}/><circle cx="${x}" cy="${y - 19}" r="5" fill="#f2c94c" ${ink(1.5)}/><circle cx="${x + 14}" cy="${y - 18}" r="5" fill="#7cb342" ${ink(1.5)}/>`);
for (const [x, y] of [[505, 752], [527, 750], [1230, 602], [1112, 562], [330, 522]]) barrel(x, y);
for (const [x, y] of [[560, 792], [1250, 607], [1100, 817], [350, 532]]) crate(x, y);
base.push(`<path d="M1127 727 V670 M1111 687 H1143" stroke="${INK}" stroke-width="11" stroke-linecap="square"/><path d="M1127 725 V672 M1113 687 H1141" stroke="${P.wood}" stroke-width="5"/>`);

// --- Pont
{
  base.push(`<path d="M92 742 Q230 692 395 747 L395 772 Q230 720 92 770 Z" fill="${INK}" opacity=".55"/>`);
  const deck = 'M70 705 Q230 650 410 712 L410 742 Q230 682 70 735 Z';
  base.push(`<path d="${deck}" fill="${P.wood}" ${ink(3.5)}/>`);
  let planks = '';
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    const x = 70 + t * 340;
    const y = 705 - Math.sin(t * Math.PI) * 50 + t * 7;
    planks += `<path d="M${f(x)} ${f(y + 1)} l0 28" stroke="${INK}" stroke-width="1.6"/>`;
  }
  base.push(planks + `<path d="M70 722 Q230 667 410 729 L410 742 Q230 682 70 735 Z" fill="${P.woodSh}" opacity=".7"/><path d="${deck}" fill="none" ${ink(3.5)}/>`);
  for (const off of [0, 30]) {
    let rails = '';
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = 70 + t * 340;
      const y = 705 - Math.sin(t * Math.PI) * 50 + t * 7 + off;
      rails += `<rect x="${f(x - 3)}" y="${f(y - 34)}" width="6" height="34" fill="${P.wood}" ${ink(2.2)}/>`;
    }
    rails += `<path d="M70 ${677 + off} Q230 ${622 + off} 410 ${684 + off}" stroke="${INK}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M70 ${677 + off} Q230 ${622 + off} 410 ${684 + off}" stroke="${P.wood}" stroke-width="4" fill="none"/>`;
    base.push(rails);
  }
}

// --- Lampadaires
for (const [x, y, h] of [[350, 612, 72], [1060, 384, 64], [1185, 642, 74], [1032, 847, 76], [1192, 932, 80], [868, 347, 58], [402, 482, 64], [1240, 354, 58], [1340, 412, 62], [560, 902, 76]]) lampPost(x, y, h);

// --- Premier plan
for (const [x, y, r] of [[340, 962, 22], [420, 992, 26], [520, 977, 20], [610, 1002, 24], [700, 987, 18], [460, 932, 14]]) base.push(rock(x, y, r));
for (const [x, y, r] of [[300, 902, 22], [600, 932, 20], [700, 942, 18], [950, 892, 22], [1080, 952, 20], [400, 852, 16], [900, 982, 24], [160, 592, 18], [1300, 702, 22], [1420, 962, 26]]) base.push(bush(x, y, r));
fence(745, 887, 960, 882, 9);
fence(1040, 952, 1150, 992, 4);

// --- Pancarte
{
  let s = '';
  const post = (d) => `<path d="${d}" stroke="${INK}" stroke-width="22" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.wood}" stroke-width="13" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.woodSh}" stroke-width="5" fill="none" transform="translate(4 0)"/>`;
  s += post('M48 30 Q46 160 58 300');
  s += post('M398 28 Q402 140 392 245');
  s += `<path d="M22 42 L428 30" stroke="${INK}" stroke-width="24" stroke-linecap="round"/><path d="M22 40 L428 28" stroke="${P.wood}" stroke-width="13" stroke-linecap="round"/><path d="M22 46 L428 34" stroke="${P.woodSh}" stroke-width="5"/>`;
  s += `<path d="M96 44 v22 M352 36 v22" stroke="${INK}" stroke-width="3.5" stroke-dasharray="5 3"/>`;
  s += `<rect x="82" y="72" width="306" height="122" rx="10" fill="${INK}"/>`;
  s += `<rect x="76" y="64" width="306" height="122" rx="10" fill="#8a5428" ${ink(4.5)}/>`;
  for (let i = 1; i < 4; i++) s += `<path d="M80 ${64 + i * 30.5} H378" stroke="${INK}" stroke-width="2.2" opacity=".75"/>`;
  s += `<path d="M76 150 H382 V176 Q382 186 372 186 H86 Q76 186 76 176 Z" fill="#6b3d1a" opacity=".7"/>`;
  for (let i = 0; i < 14; i++) {
    const y = rr(72, 180);
    s += `<path d="M${f(rr(86, 200))} ${f(y)} q${f(rr(30, 70))} ${f(rr(-3, 3))} ${f(rr(70, 150))} ${f(rr(-2, 2))}" stroke="${INK}" stroke-width="1.1" fill="none" opacity=".4"/>`;
  }
  for (const [x, y] of [[90, 78], [368, 78], [90, 172], [368, 172]]) s += `<circle cx="${x}" cy="${y}" r="4" fill="#d9c08a" ${ink(1.8)}/>`;
  const txt = (y, size, text) =>
    `<text x="229" y="${y}" font-family="'Bangers','Impact','Arial Black',sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" fill="${INK}" stroke="${INK}" stroke-width="7" stroke-linejoin="round" letter-spacing="2">${text}</text>` +
    `<text x="229" y="${y}" font-family="'Bangers','Impact','Arial Black',sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" fill="#ffe08a" letter-spacing="2">${text}</text>`;
  s += txt(116, 31, 'LE VILLAGE');
  s += txt(166, 31, 'DES BLACKOPS');
  for (let i = 0; i < 26; i++) {
    const left = i % 2 === 0;
    const y = rr(40, 270);
    const x = left ? 50 + rr(-10, 10) : 398 + rr(-10, 10);
    s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="7" ry="4" transform="rotate(${f(rr(-50, 50))} ${f(x)} ${f(y)})" fill="${rnd() > 0.5 ? P.leaf : P.leafSh}" ${ink(1.5)}/>`;
  }
  base.push(s);
  hangingLantern(62, 207);
  hangingLantern(404, 180);
  // La pancarte reste lisible la nuit (éclairée par ses lanternes).
  spots.push({ x: 229, y: 128, r: 190, kind: 'sign' });
}

// ================================================================== EXPORT
mkdirSync(OUT, { recursive: true });
const svg = (body, filter = true) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}<g${filter ? ' filter="url(#ink)"' : ''}>${body}</g></svg>`;
writeFileSync(path.join(OUT, 'village.svg'), svg(base.join('\n')));
writeFileSync(path.join(OUT, 'village-lights.svg'), svg(lights.join('\n')));

const merged = [];
for (const s of spots) {
  const near = merged.find((m) => m.kind === s.kind && Math.hypot(m.x - s.x, m.y - s.y) < 40);
  if (near) near.r = Math.max(near.r, s.r * 1.1);
  else merged.push({ ...s });
}
writeFileSync(
  path.join(OUT, 'lights.json'),
  JSON.stringify({
    width: W,
    height: H,
    square: { cx: SQ.cx / W, cy: SQ.cy / H, rx: SQ.rx / W, ry: SQ.ry / H },
    lights: merged.map((s) => ({ x: +(s.x / W).toFixed(4), y: +(s.y / H).toFixed(4), r: +(s.r / W).toFixed(4), kind: s.kind })),
  }),
);
console.log(`village BD généré (${merged.length} lumières)`);
