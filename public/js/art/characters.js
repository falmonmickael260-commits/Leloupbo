/**
 * Personnages jouables — style bande dessinée (2D, encrage + aplats + ombres franches).
 * Purement cosmétique. Les identifiants doivent correspondre à src/shared/avatars.ts.
 *
 * characterSVG(id, { pose }) renvoie un <svg> autonome (viewBox 0 0 120 200).
 *   pose : 'idle' | 'aim' (Chasseur qui vise)
 */
const INK = '#1b130e';

export const CHARACTERS = [
  // top : hoodie | bomber | leather | puffer | tee | track | blazer — bottom : jeans | joggers | cargo | leggings | pants
  { id: 'm-brun', name: 'Ryan', gender: 'm', skin: '#f1c9a0', hair: '#3a2416', style: 'short', top: 'hoodie', topColor: '#26262b', accent: '#e0b23a', bottom: 'jeans', bottomColor: '#3d5f8f', shoe: '#ffffff', shoeAccent: '#d23b3b', acc: ['headphones-neck'], age: 'young' },
  { id: 'm-blond', name: 'Enzo', gender: 'm', skin: '#f6d2ae', hair: '#e6c15c', style: 'swept', top: 'bomber', topColor: '#4f5b3a', inner: '#f2efe8', accent: '#e8833a', bottom: 'joggers', bottomColor: '#2a2a2e', shoe: '#f4f4f4', shoeAccent: '#2a2a2e', acc: ['chain'], age: 'young' },
  { id: 'm-roux', name: 'Kylian', gender: 'm', skin: '#f6cfae', hair: '#c4562a', style: 'messy', beard: 'short', top: 'puffer', topColor: '#b8322e', bottom: 'cargo', bottomColor: '#8a7a55', shoe: '#9a9ca3', shoeAccent: '#ffffff', acc: ['beanie'], hat: '#3a3a40', age: 'adult' },
  { id: 'm-barbu', name: 'Malik', gender: 'm', skin: '#c08a5e', hair: '#1a110a', style: 'short', beard: 'full', top: 'leather', topColor: '#1f1f22', inner: '#d9a52b', bottom: 'jeans', bottomColor: '#28344a', shoe: '#1f1f22', shoeAccent: '#d9a52b', acc: ['sunglasses'], age: 'adult' },
  { id: 'm-ancien', name: 'Victor', gender: 'm', skin: '#e9be98', hair: '#d9d6cf', style: 'bald', beard: 'full', top: 'blazer', topColor: '#1c1c22', inner: '#f2f2f2', accent: '#d9a52b', bottom: 'pants', bottomColor: '#1c1c22', shoe: '#141416', shoeAccent: '#141416', acc: ['sunglasses', 'chain'], age: 'old' },
  { id: 'm-boucle', name: 'Samuel', gender: 'm', skin: '#9c6a45', hair: '#1c120b', style: 'curly', top: 'track', topColor: '#2c4f9e', accent: '#ffffff', bottom: 'joggers', bottomColor: '#2c4f9e', shoe: '#ffffff', shoeAccent: '#2c4f9e', acc: ['cap-back'], hat: '#1f1f22', age: 'young' },
  { id: 'm-forgeron', name: 'Tony', gender: 'm', skin: '#e2b088', hair: '#3a2416', style: 'shaved', beard: 'mustache', top: 'tee', topColor: '#1f1f22', accent: '#e0b23a', bottom: 'cargo', bottomColor: '#5b5f63', shoe: '#6b4a2f', shoeAccent: '#3a2a1a', acc: ['cap'], hat: '#b8322e', age: 'adult' },
  { id: 'f-blonde', name: 'Jade', gender: 'f', skin: '#f6d6b6', hair: '#ecc75e', style: 'ponytail', top: 'hoodie', topColor: '#e86a9a', accent: '#ffffff', bottom: 'leggings', bottomColor: '#222226', shoe: '#ffffff', shoeAccent: '#e86a9a', acc: ['earrings'], age: 'young' },
  { id: 'f-brune', name: 'Léa', gender: 'f', skin: '#efc6a2', hair: '#3b2416', style: 'long', top: 'bomber', topColor: '#1f1f22', inner: '#f2efe8', accent: '#d9a52b', bottom: 'jeans', bottomColor: '#7a9cc6', shoe: '#ffffff', shoeAccent: '#d9a52b', acc: ['earrings'], age: 'young' },
  { id: 'f-rousse', name: 'Chloé', gender: 'f', skin: '#f7d3b4', hair: '#c9522a', style: 'curlylong', top: 'puffer', topColor: '#efe2c8', bottom: 'jeans', bottomColor: '#3d5f8f', shoe: '#f4f4f4', shoeAccent: '#c9522a', acc: ['headphones'], hat: '#2a2a2e', age: 'adult' },
  { id: 'f-courte', name: 'Inès', gender: 'f', skin: '#b98258', hair: '#1d130c', style: 'bob', top: 'leather', topColor: '#1f1f22', inner: '#8d2f3a', bottom: 'jeans', bottomColor: '#2a2a30', shoe: '#1f1f22', shoeAccent: '#8d2f3a', acc: ['chain', 'earrings'], age: 'young' },
  { id: 'f-ancienne', name: 'Martine', gender: 'f', skin: '#eac2a0', hair: '#d8d4cc', style: 'bun', top: 'blazer', topColor: '#7a2c3a', inner: '#f2efe8', accent: '#d9a52b', bottom: 'pants', bottomColor: '#2a2a30', shoe: '#ffffff', shoeAccent: '#7a2c3a', acc: ['glasses', 'earrings'], age: 'old' },
  { id: 'f-chataine', name: 'Nina', gender: 'f', skin: '#f0c8a4', hair: '#7a4a26', style: 'ponytail', top: 'track', topColor: '#6b4aa8', accent: '#ffffff', bottom: 'joggers', bottomColor: '#6b4aa8', shoe: '#ffffff', shoeAccent: '#6b4aa8', acc: ['cap'], hat: '#f4f4f4', age: 'adult' },
  { id: 'f-foulard', name: 'Maya', gender: 'f', skin: '#d8a27a', hair: '#1d130c', style: 'braids', top: 'tee', topColor: '#e8b830', accent: '#1f1f22', bottom: 'cargo', bottomColor: '#5a6b3a', shoe: '#ffffff', shoeAccent: '#1f1f22', acc: ['headphones-neck'], age: 'adult' },
];

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
};
const ink = (w = 2.4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function hairBack(c) {
  const h = c.hair;
  switch (c.style) {
    case 'long':
      return `<path d="M42 30 Q40 70 36 92 Q60 100 84 92 Q80 70 78 30 Z" fill="${h}" ${ink()}/><path d="M64 34 Q74 60 80 90 Q84 92 84 92 Q80 70 78 30 Z" fill="${shade(h, 0.7)}"/>`;
    case 'curlylong':
      return `<path d="M40 28 q-8 14 -4 26 q-8 12 -2 24 q-4 12 6 18 q12 6 20 2 q8 4 20 -2 q10 -6 6 -18 q6 -12 -2 -24 q4 -12 -4 -26 Z" fill="${h}" ${ink()}/>`;
    case 'braid':
      return `<path d="M72 40 q10 10 6 22 q8 8 2 18 q6 8 -2 16 l-4 6 l-4 -6 q-6 -8 0 -16 q-6 -10 2 -18 q-4 -12 0 -22 Z" fill="${h}" ${ink()}/><path d="M74 104 l4 6 l-6 0 Z" fill="#c94a3a" ${ink(1.6)}/>`;
    case 'ponytail':
      return `<path d="M76 24 q16 6 14 26 q-2 18 -10 30 q-4 -14 -4 -30 Z" fill="${h}" ${ink()}/>`;
    case 'bun':
      return `<circle cx="60" cy="12" r="9" fill="${h}" ${ink()}/>`;
    case 'braids': {
      let b = '';
      for (const x of [40, 45, 50, 70, 75, 80]) b += `<path d="M${x} 30 q${x < 60 ? -3 : 3} 30 ${x < 60 ? -1 : 1} 66" stroke="${INK}" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M${x} 30 q${x < 60 ? -3 : 3} 30 ${x < 60 ? -1 : 1} 66" stroke="${h}" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-dasharray="4 1.5"/>`;
      return b;
    }
    default:
      return '';
  }
}

function hairFront(c) {
  const h = c.hair;
  const d = shade(h, 0.72);
  switch (c.style) {
    case 'short':
      return `<path d="M44 32 Q42 14 60 13 Q78 14 76 32 Q72 22 60 22 Q50 22 44 32 Z" fill="${h}" ${ink()}/><path d="M60 14 Q74 15 76 30 Q70 22 62 21 Z" fill="${d}"/>`;
    case 'swept':
      return `<path d="M44 34 Q40 12 62 12 Q80 14 77 34 Q74 24 66 22 Q58 28 46 26 Q46 30 44 34 Z" fill="${h}" ${ink()}/><path d="M50 20 q8 -4 18 -2" stroke="${d}" stroke-width="2.4" fill="none"/>`;
    case 'messy':
      return `<path d="M43 34 l-3 -10 l6 2 l-1 -9 l7 5 l3 -8 l5 6 l6 -7 l3 8 l7 -4 l-1 9 l6 0 l-4 9 Q72 22 60 22 Q50 22 43 34 Z" fill="${h}" ${ink()}/>`;
    case 'curly':
      return `<path d="M43 32 q-6 -6 -1 -12 q-1 -8 8 -9 q4 -7 11 -3 q7 -5 12 2 q8 0 7 9 q5 6 -2 13 Q72 22 60 22 Q50 22 43 32 Z" fill="${h}" ${ink()}/>`;
    case 'shaved':
      return `<path d="M45 28 Q46 15 60 15 Q74 15 75 28 Q68 21 60 21 Q52 21 45 28 Z" fill="${h}" opacity=".85" ${ink(1.8)}/>`;
    case 'bald':
      return `<path d="M44 34 q-2 -6 2 -9 M76 34 q2 -6 -2 -9" stroke="${INK}" stroke-width="5" fill="none"/><path d="M44 34 q-2 -6 2 -9 M76 34 q2 -6 -2 -9" stroke="${h}" stroke-width="3" fill="none"/><path d="M52 18 q4 -2 8 0" stroke="#fff" stroke-width="2" opacity=".6"/>`;
    case 'long':
    case 'braid':
    case 'braids':
    case 'ponytail':
      return `<path d="M43 36 Q40 13 60 12 Q80 13 77 36 Q74 24 66 21 Q60 27 50 25 Q46 30 43 36 Z" fill="${h}" ${ink()}/><path d="M62 13 Q78 14 77 34 Q72 24 66 21 Z" fill="${d}"/>`;
    case 'curlylong':
      return `<path d="M42 36 q-4 -10 2 -16 q0 -9 10 -9 q6 -6 12 -1 q10 -2 11 8 q6 6 1 18 Q72 22 60 22 Q50 22 42 36 Z" fill="${h}" ${ink()}/>`;
    case 'bob':
      return `<path d="M41 46 Q36 14 60 12 Q84 14 79 46 Q76 48 74 44 Q74 26 60 24 Q46 26 46 44 Q44 48 41 46 Z" fill="${h}" ${ink()}/><path d="M64 13 Q84 16 79 46 Q76 48 74 44 Q74 28 66 24 Z" fill="${d}"/>`;
    case 'bun':
      return `<path d="M44 34 Q42 15 60 15 Q78 15 76 34 Q72 23 60 23 Q48 23 44 34 Z" fill="${h}" ${ink()}/><path d="M52 18 q8 -3 16 0" stroke="${shade(h, 0.8)}" stroke-width="2" fill="none"/>`;
    case 'scarf':
      return `<path d="M40 40 Q36 10 60 9 Q84 10 80 40 Q78 30 74 26 Q60 20 46 26 Q42 30 40 40 Z" fill="${c.outfit2}" ${ink()}/><path d="M66 10 Q84 12 80 40 Q78 30 74 26 Z" fill="${shade(c.outfit2, 0.72)}"/><path d="M48 18 l4 4 M58 14 l4 4 M70 16 l4 4" stroke="#f3e6d0" stroke-width="2.2"/><path d="M46 27 Q50 22 56 23 L52 30 Z" fill="${c.hair}"/>`;
    default:
      return '';
  }
}

function beard(c) {
  const h = c.beard === 'long' || c.age === 'old' ? c.hair : shade(c.hair, 0.9);
  switch (c.beard) {
    case 'full':
      return `<path d="M45 38 Q46 58 60 62 Q74 58 75 38 Q72 48 66 47 Q60 44 54 47 Q48 48 45 38 Z" fill="${h}" ${ink()}/><path d="M54 49 q6 -3 12 0" stroke="${INK}" stroke-width="1.6" fill="none"/>`;
    case 'short':
      return `<path d="M46 40 Q48 54 60 56 Q72 54 74 40 Q70 48 60 48 Q50 48 46 40 Z" fill="${h}" opacity=".95" ${ink(1.8)}/>`;
    case 'long':
      return `<path d="M45 38 Q44 70 60 82 Q76 70 75 38 Q72 48 66 47 Q60 44 54 47 Q48 48 45 38 Z" fill="${h}" ${ink()}/><path d="M56 56 q4 10 2 20 M64 56 q-2 10 0 20" stroke="#a9a59c" stroke-width="1.4" fill="none"/>`;
    case 'mustache':
      return `<path d="M50 46 Q55 42 60 45 Q65 42 70 46 Q66 50 60 47 Q54 50 50 46 Z" fill="${h}" ${ink(1.6)}/>`;
    default:
      return '';
  }
}

function face(c) {
  const old = c.age === 'old';
  let s = '';
  // yeux
  if (c.gender === 'f') s += `<path d="M50 34 q3 -2 6 0 M64 34 q3 -2 6 0" stroke="${INK}" stroke-width="1.6" fill="none"/>`;
  s += `<ellipse cx="53" cy="36" rx="2" ry="2.6" fill="${INK}"/><ellipse cx="67" cy="36" rx="2" ry="2.6" fill="${INK}"/><circle cx="53.6" cy="35.2" r=".7" fill="#fff"/><circle cx="67.6" cy="35.2" r=".7" fill="#fff"/>`;
  // sourcils
  const bc = c.style === 'bald' || old ? c.hair : shade(c.hair, 0.85);
  s += `<path d="M49 31 q4 -3 8 -1 M63 30 q4 -2 8 1" stroke="${c.style === 'scarf' ? c.hair : bc}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  // nez, bouche
  s += `<path d="M60 37 q-2 6 1 7" stroke="${INK}" stroke-width="1.5" fill="none"/>`;
  if (c.beard !== 'full' && c.beard !== 'long') s += `<path d="M55 49 q5 3 10 0" stroke="${INK}" stroke-width="1.6" fill="none"/>`;
  if (c.gender === 'f') s += `<path d="M56 49 q4 2 8 0" stroke="#b5434d" stroke-width="2" fill="none"/>`;
  s += `<ellipse cx="50" cy="44" rx="3.2" ry="1.8" fill="#e8806b" opacity=".35"/><ellipse cx="70" cy="44" rx="3.2" ry="1.8" fill="#e8806b" opacity=".35"/>`;
  if (old) s += `<path d="M47 40 l3 1 M73 40 l-3 1 M55 27 h10" stroke="${INK}" stroke-width="1" opacity=".55"/>`;
  return s;
}

// ------------------------------------------------------------------ vêtements modernes
const W = { m: { sw: 21, ww: 15 }, f: { sw: 17, ww: 13 } };

function legs(c) {
  const col = c.bottomColor;
  const dk = shade(col, 0.68);
  const waist = c.gender === 'm' ? 118 : 114;
  const { ww } = W[c.gender];
  const slim = c.bottom === 'leggings';
  const lx0 = slim ? 47 : 45;
  const rx1 = slim ? 73 : 75;
  let s = `<path d="M${60 - ww - 1} ${waist} L${lx0} 180 L57 180 L60 ${waist + 10} L63 180 L${rx1} 180 L${60 + ww + 1} ${waist} Z" fill="${col}" ${ink()}/>`;
  s += `<path d="M60 ${waist + 10} L63 180 L${rx1} 180 L${60 + ww + 1} ${waist} Z" fill="${dk}"/>`;
  if (c.bottom === 'jeans') {
    s += `<path d="M50 ${waist + 6} q2 30 0 58 M70 ${waist + 6} q-2 30 0 58" stroke="${shade(col, 1.25)}" stroke-width="1.2" fill="none" opacity=".7"/>`;
    s += `<path d="M46 174 h11 M63 174 h11" stroke="${shade(col, 1.3)}" stroke-width="2"/>`;
  } else if (c.bottom === 'joggers') {
    s += `<path d="M${60 - ww} ${waist + 2} L46 176 M${60 + ww} ${waist + 2} L74 176" stroke="#ffffff" stroke-width="2" opacity=".85"/>`;
    s += `<path d="M45 175 h12 v5 h-12 Z M63 175 h12 v5 h-12 Z" fill="${dk}" ${ink(1.4)}/>`;
  } else if (c.bottom === 'cargo') {
    s += `<path d="M44 140 h9 v12 h-9 Z M67 140 h9 v12 h-9 Z" fill="${shade(col, 0.85)}" ${ink(1.4)}/>`;
  } else if (c.bottom === 'pants') {
    s += `<path d="M51 ${waist + 4} V178 M69 ${waist + 4} V178" stroke="${shade(col, 1.5)}" stroke-width="1" opacity=".6"/>`;
  }
  return s;
}

function shoes(c) {
  const up = c.shoe;
  const ac = c.shoeAccent;
  const one = (x, flip) =>
    `<path d="M${x} 178 h17 v6 q${flip ? 6 : 0} 1 ${flip ? 6 : 0} 4 v2 h-${flip ? 23 : 21} q-${flip ? 0 : 2} 0 -${flip ? 0 : 2} -3 Z" fill="${up}" ${ink()}/>` +
    `<path d="M${x - (flip ? 0 : 2)} 188 h${flip ? 23 : 23} v3 h-${flip ? 23 : 23} Z" fill="#f4f4f4" ${ink(1.6)}/>` +
    `<path d="M${x + 4} 184 q6 -4 11 -1" stroke="${ac}" stroke-width="2.2" fill="none"/>`;
  return one(40, false) + one(62, true);
}

function torsoPath(c) {
  const { sw, ww } = W[c.gender];
  const waist = c.gender === 'm' ? 120 : 116;
  return { d: `M${60 - sw} 64 Q${60 - sw - 2} 96 ${60 - ww - 1} ${waist} L${60 + ww + 1} ${waist} Q${60 + sw + 2} 96 ${60 + sw} 64 Q70 58 60 58 Q50 58 ${60 - sw} 64 Z`, waist, sw, ww };
}

function top(c) {
  const col = c.topColor;
  const dk = shade(col, 0.66);
  const lt = shade(col, 1.25);
  const { d, waist, sw, ww } = torsoPath(c);
  let s = '';
  // capuche (derrière la nuque) pour le sweat
  if (c.top === 'hoodie') s += `<path d="M${60 - sw + 2} 66 Q${60 - sw - 2} 46 50 44 L70 44 Q${60 + sw + 2} 46 ${60 + sw - 2} 66 Q70 56 60 56 Q50 56 ${60 - sw + 2} 66 Z" fill="${dk}" ${ink()}/>`;
  s += `<path d="${d}" fill="${col}" ${ink()}/><path d="M62 59 Q72 60 ${60 + sw} 64 Q${60 + sw + 2} 96 ${60 + ww + 1} ${waist} L66 ${waist} Z" fill="${dk}" opacity=".75"/>`;
  switch (c.top) {
    case 'hoodie':
      s += `<path d="M48 ${waist - 22} h24 l3 14 h-30 Z" fill="${dk}" ${ink(1.6)}/>`;
      s += `<path d="M56 60 L55 80 M64 60 L65 80" stroke="${c.accent}" stroke-width="2"/><circle cx="55" cy="81" r="1.6" fill="${c.accent}"/><circle cx="65" cy="81" r="1.6" fill="${c.accent}"/>`;
      s += `<path d="M${60 - ww - 1} ${waist - 5} H${60 + ww + 1}" stroke="${dk}" stroke-width="4"/>`;
      break;
    case 'bomber':
      s += `<path d="M55 60 L56 ${waist} L64 ${waist} L65 60 Q60 63 55 60 Z" fill="${c.inner}" ${ink(1.6)}/>`;
      s += `<path d="M53 60 Q60 66 67 60 Q60 56 53 60 Z" fill="${c.accent}" ${ink(1.6)}/>`;
      s += `<path d="M${60 - ww - 1} ${waist - 6} H55 M65 ${waist - 6} H${60 + ww + 1}" stroke="${c.accent}" stroke-width="4"/>`;
      s += `<circle cx="${60 - sw + 8}" cy="76" r="3" fill="${c.accent}" ${ink(1.2)}/>`;
      break;
    case 'leather':
      s += `<path d="M55 60 L57 ${waist} L63 ${waist} L65 60 Q60 63 55 60 Z" fill="${c.inner}" ${ink(1.6)}/>`;
      s += `<path d="M48 61 L56 60 L52 84 Z M72 61 L64 60 L68 84 Z" fill="${lt}" ${ink(1.6)}/>`;
      s += `<path d="M66 70 L70 ${waist - 4}" stroke="#c9ccd2" stroke-width="1.6"/><path d="M44 80 q4 -2 8 0 M68 92 q4 -2 8 0" stroke="${lt}" stroke-width="1.4" fill="none"/>`;
      break;
    case 'puffer':
      for (let y = 74; y < waist - 2; y += 12) s += `<path d="M${60 - sw} ${y} Q60 ${y + 4} ${60 + sw} ${y}" stroke="${dk}" stroke-width="1.6" fill="none"/>`;
      s += `<path d="M50 50 h20 v12 q-10 4 -20 0 Z" fill="${col}" ${ink()}/><path d="M60 52 V${waist}" stroke="${dk}" stroke-width="1.6"/>`;
      break;
    case 'tee':
      s += `<path d="M53 59 Q60 66 67 59" stroke="${dk}" stroke-width="2.5" fill="none"/>`;
      s += `<path d="M53 86 L60 76 L67 86 L64 84 L60 92 L56 84 Z" fill="${c.accent}" ${ink(1.2)}/><path d="M50 98 h20" stroke="${c.accent}" stroke-width="2.4"/>`;
      break;
    case 'track':
      s += `<path d="M52 52 h16 v10 q-8 3 -16 0 Z" fill="${col}" ${ink()}/><path d="M60 54 V${waist}" stroke="#c9ccd2" stroke-width="1.8"/>`;
      s += `<path d="M${60 - sw + 3} 70 L${60 - ww} ${waist - 2} M${60 + sw - 3} 70 L${60 + ww} ${waist - 2}" stroke="${c.accent}" stroke-width="2.2" opacity=".9"/>`;
      break;
    case 'blazer':
      s += `<path d="M55 60 L58 ${waist} L62 ${waist} L65 60 Q60 63 55 60 Z" fill="${c.inner}" ${ink(1.6)}/>`;
      s += `<path d="M49 61 L56 60 L57 92 Z M71 61 L64 60 L63 92 Z" fill="${lt}" ${ink(1.6)}/>`;
      s += `<circle cx="60" cy="100" r="1.8" fill="${INK}"/><path d="M${60 - sw + 6} 86 h7" stroke="${c.accent}" stroke-width="2.4"/>`;
      break;
  }
  return s;
}

function arms(c, pose) {
  const col = c.topColor;
  const dk = shade(col, 0.66);
  const short = c.top === 'tee';
  const skin = c.skin;
  const skinSh = shade(skin, 0.8);
  const { sw } = W[c.gender];
  const L = 60 - sw;
  const R = 60 + sw;
  let s = '';
  if (pose === 'aim') {
    s += `<path d="M${R - 2} 66 Q96 70 104 62 L106 70 Q96 80 ${R - 2} 78 Z" fill="${short ? skin : col}" ${ink()}/><path d="M${L + 2} 66 Q50 80 70 78 L72 70 Q56 70 48 64 Z" fill="${short ? skinSh : dk}" ${ink()}/>`;
    if (short) s += `<path d="M${R - 2} 66 Q86 66 88 72 L86 80 Q82 78 ${R - 2} 78 Z" fill="${col}" ${ink(1.8)}/>`;
    s += `<path d="M58 72 L120 52" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M58 72 L120 52" stroke="#3a3d42" stroke-width="3.5"/><path d="M86 63 L120 52" stroke="#55585e" stroke-width="3"/>`;
    s += `<circle cx="104" cy="64" r="5" fill="${skin}" ${ink(1.8)}/><circle cx="72" cy="74" r="5" fill="${skin}" ${ink(1.8)}/>`;
    return s;
  }
  // manches
  s += `<path d="M${L} 64 Q${L - 8} 92 ${L - 6} 120 L${L + 2} 120 Q${L + 2} 96 ${L + 6} 72 Z" fill="${short ? skin : col}" ${ink()}/>`;
  s += `<path d="M${R} 64 Q${R + 8} 92 ${R + 6} 120 L${R - 2} 120 Q${R - 2} 96 ${R - 6} 72 Z" fill="${short ? skinSh : dk}" ${ink()}/>`;
  if (short) {
    s += `<path d="M${L} 64 Q${L - 6} 76 ${L - 7} 86 L${L + 3} 88 L${L + 6} 72 Z" fill="${col}" ${ink(1.8)}/>`;
    s += `<path d="M${R} 64 Q${R + 6} 76 ${R + 7} 86 L${R - 3} 88 L${R - 6} 72 Z" fill="${dk}" ${ink(1.8)}/>`;
  } else {
    // poignets côtelés + bandes du survêtement
    s += `<path d="M${L - 6} 114 h8 v6 h-8 Z M${R - 2} 114 h8 v6 h-8 Z" fill="${dk}" ${ink(1.4)}/>`;
    if (c.top === 'track') s += `<path d="M${L - 1} 70 Q${L - 6} 92 ${L - 4} 112 M${R + 1} 70 Q${R + 6} 92 ${R + 4} 112" stroke="${c.accent}" stroke-width="2.2" fill="none"/>`;
  }
  s += `<circle cx="${L - 2}" cy="123" r="5.2" fill="${skin}" ${ink(1.8)}/><circle cx="${R + 2}" cy="123" r="5.2" fill="${skinSh}" ${ink(1.8)}/>`;
  return s;
}

function accessoriesNeck(c) {
  let s = '';
  if (c.acc?.includes('chain')) s += `<path d="M52 61 Q60 78 68 61" stroke="${INK}" stroke-width="3.6" fill="none"/><path d="M52 61 Q60 78 68 61" stroke="#e8c04a" stroke-width="2" fill="none"/><circle cx="60" cy="72" r="2.6" fill="#e8c04a" ${ink(1.2)}/>`;
  if (c.acc?.includes('headphones-neck')) s += `<path d="M45 62 Q60 76 75 62" stroke="${INK}" stroke-width="5" fill="none"/><path d="M45 62 Q60 76 75 62" stroke="#3a3a40" stroke-width="2.6" fill="none"/><ellipse cx="45" cy="62" rx="5" ry="6" fill="#2a2a2e" ${ink(1.6)}/><ellipse cx="75" cy="62" rx="5" ry="6" fill="#2a2a2e" ${ink(1.6)}/><circle cx="45" cy="62" r="2" fill="#e0b23a"/><circle cx="75" cy="62" r="2" fill="#e0b23a"/>`;
  return s;
}

function accessoriesHead(c) {
  let s = '';
  const a = c.acc ?? [];
  if (a.includes('sunglasses')) s += `<path d="M46 32 h12 q1 7 -5 8 q-6 0 -7 -8 Z M62 32 h12 q-1 8 -7 8 q-6 -1 -5 -8 Z" fill="#141416" ${ink(1.6)}/><path d="M58 33 h4" stroke="${INK}" stroke-width="1.8"/><path d="M49 34 l3 -1 M65 34 l3 -1" stroke="#ffffff" stroke-width="1.2" opacity=".7"/>`;
  if (a.includes('glasses')) s += `<circle cx="53" cy="36" r="5" fill="none" stroke="${INK}" stroke-width="1.8"/><circle cx="67" cy="36" r="5" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M58 36 h4" stroke="${INK}" stroke-width="1.6"/>`;
  if (a.includes('earrings')) s += `<circle cx="43.5" cy="44" r="1.9" fill="#e8c04a" ${ink(1)}/><circle cx="76.5" cy="44" r="1.9" fill="#e8c04a" ${ink(1)}/>`;
  if (a.includes('beanie')) s += `<path d="M42 32 Q40 7 60 7 Q80 7 78 32 Z" fill="${c.hat}" ${ink()}/><path d="M41 25 h38 v8 h-38 Z" fill="${shade(c.hat, 0.75)}" ${ink(1.8)}/><path d="M48 14 v10 M54 11 v13 M60 10 v14 M66 11 v13 M72 14 v10" stroke="${shade(c.hat, 0.7)}" stroke-width="1.2"/>`;
  if (a.includes('cap')) s += `<path d="M43 30 Q42 11 60 10 Q78 11 77 30 Z" fill="${c.hat}" ${ink()}/><path d="M42 29 Q60 35 82 28 Q88 31 82 35 Q60 41 42 33 Z" fill="${shade(c.hat, 0.78)}" ${ink()}/><circle cx="60" cy="11" r="2" fill="${shade(c.hat, 0.7)}"/><path d="M56 18 l4 -3 l4 3 l-2 5 h-4 Z" fill="#e0b23a" opacity=".9"/>`;
  if (a.includes('cap-back')) s += `<path d="M43 30 Q42 11 60 10 Q78 11 77 30 Z" fill="${c.hat}" ${ink()}/><path d="M44 29 Q60 33 76 29" stroke="${INK}" stroke-width="2" fill="none"/><path d="M53 27 h14 v4 h-14 Z" fill="${shade(c.hat, 0.7)}" ${ink(1.4)}/>`;
  if (a.includes('headphones')) s += `<path d="M42 38 Q40 8 60 8 Q80 8 78 38" stroke="${INK}" stroke-width="6" fill="none"/><path d="M42 38 Q40 8 60 8 Q80 8 78 38" stroke="${c.hat ?? '#2a2a2e'}" stroke-width="3.4" fill="none"/><rect x="37" y="31" width="9" height="15" rx="4" fill="${c.hat ?? '#2a2a2e'}" ${ink(1.8)}/><rect x="74" y="31" width="9" height="15" rx="4" fill="${c.hat ?? '#2a2a2e'}" ${ink(1.8)}/>`;
  return s;
}

/** SVG complet d'un personnage (style BD, tenues modernes). */
export function characterSVG(id, { pose = 'idle', title = '' } = {}) {
  const c = getCharacter(id);
  const skin = c.skin;
  const skinSh = shade(skin, 0.8);
  const covered = c.acc?.some((a) => a === 'beanie' || a === 'cap' || a === 'cap-back');
  let s = '';
  s += `<ellipse cx="60" cy="194" rx="30" ry="6" fill="${INK}" opacity=".3"/>`;
  s += hairBack(c);
  s += legs(c);
  s += shoes(c);
  s += `<path d="M54 50 h12 v12 h-12 Z" fill="${skinSh}" ${ink()}/>`;
  s += top(c);
  s += accessoriesNeck(c);
  s += arms(c, pose);
  // tête
  s += `<ellipse cx="60" cy="36" rx="16" ry="19" fill="${skin}" ${ink()}/><path d="M66 18 Q78 26 76 40 Q74 52 64 55 Q72 44 70 30 Z" fill="${skinSh}" opacity=".7"/>`;
  s += `<ellipse cx="43.5" cy="38" rx="3" ry="4.5" fill="${skin}" ${ink(1.8)}/><ellipse cx="76.5" cy="38" rx="3" ry="4.5" fill="${skinSh}" ${ink(1.8)}/>`;
  s += face(c);
  s += beard(c);
  if (covered) s += `<path d="M44 30 q-1 8 1 12 M76 30 q1 8 -1 12" stroke="${c.hair}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  else s += hairFront(c);
  s += accessoriesHead(c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" class="character" role="img" aria-label="${title || c.name}">${s}</svg>`;
}
