/**
 * Personnages jouables — style bande dessinée (2D, encrage + aplats + ombres franches).
 * Purement cosmétique. Les identifiants doivent correspondre à src/shared/avatars.ts.
 *
 * characterSVG(id, { pose }) renvoie un <svg> autonome (viewBox 0 0 120 200).
 *   pose : 'idle' | 'aim' (Chasseur qui vise)
 */
const INK = '#1b130e';

export const CHARACTERS = [
  { id: 'm-brun', name: 'Mathis', gender: 'm', skin: '#f1c9a0', hair: '#4a2c17', style: 'short', outfit: '#3f6aa0', outfit2: '#d8c7a0', age: 'young' },
  { id: 'm-blond', name: 'Gaspard', gender: 'm', skin: '#f6d2ae', hair: '#e6c15c', style: 'swept', outfit: '#7a3b33', outfit2: '#5b4636', age: 'young' },
  { id: 'm-roux', name: 'Ewen', gender: 'm', skin: '#f6cfae', hair: '#c4562a', style: 'messy', beard: 'short', outfit: '#3f7a4a', outfit2: '#6b4a2f', age: 'adult' },
  { id: 'm-barbu', name: 'Bastien', gender: 'm', skin: '#d9a77e', hair: '#22160e', style: 'short', beard: 'full', outfit: '#6b5a3a', outfit2: '#8f2f2a', age: 'adult', cape: true },
  { id: 'm-ancien', name: 'Anselme', gender: 'm', skin: '#e9be98', hair: '#d9d6cf', style: 'bald', beard: 'long', outfit: '#4b3f63', outfit2: '#a7975f', age: 'old' },
  { id: 'm-boucle', name: 'Samuel', gender: 'm', skin: '#9c6a45', hair: '#1c120b', style: 'curly', outfit: '#b0763a', outfit2: '#3c4a5c', age: 'young' },
  { id: 'm-forgeron', name: 'Bruno', gender: 'm', skin: '#e2b088', hair: '#5b3a21', style: 'shaved', beard: 'mustache', outfit: '#7d7469', outfit2: '#5a3a22', age: 'adult', apron: true },
  { id: 'f-blonde', name: 'Margot', gender: 'f', skin: '#f6d6b6', hair: '#ecc75e', style: 'braid', outfit: '#3f7fa8', outfit2: '#f3ead6', age: 'young' },
  { id: 'f-brune', name: 'Élise', gender: 'f', skin: '#efc6a2', hair: '#3b2416', style: 'long', outfit: '#8d2f3a', outfit2: '#e9dcc0', age: 'young' },
  { id: 'f-rousse', name: 'Maëlle', gender: 'f', skin: '#f7d3b4', hair: '#c9522a', style: 'curlylong', outfit: '#3d6b45', outfit2: '#e2cfa0', age: 'adult' },
  { id: 'f-courte', name: 'Inès', gender: 'f', skin: '#b98258', hair: '#1d130c', style: 'bob', outfit: '#5b4a8a', outfit2: '#d9c9a0', age: 'young' },
  { id: 'f-ancienne', name: 'Berthe', gender: 'f', skin: '#eac2a0', hair: '#d8d4cc', style: 'bun', outfit: '#5a4a3a', outfit2: '#9f3f3a', age: 'old', shawl: true },
  { id: 'f-chataine', name: 'Louise', gender: 'f', skin: '#f0c8a4', hair: '#7a4a26', style: 'ponytail', outfit: '#b5823a', outfit2: '#4a5a3a', age: 'adult' },
  { id: 'f-foulard', name: 'Rose', gender: 'f', skin: '#d8a27a', hair: '#4a2a18', style: 'scarf', outfit: '#2f6a6a', outfit2: '#c94a3a', age: 'adult' },
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

/** SVG complet d'un personnage. */
export function characterSVG(id, { pose = 'idle', title = '' } = {}) {
  const c = getCharacter(id);
  const skin = c.skin;
  const skinSh = shade(skin, 0.8);
  const o = c.outfit;
  const oSh = shade(o, 0.68);
  const o2 = c.outfit2;
  let s = '';
  s += `<ellipse cx="60" cy="194" rx="30" ry="6" fill="${INK}" opacity=".3"/>`;
  s += hairBack(c);
  // jambes / robe
  if (c.gender === 'm') {
    s += `<path d="M46 118 L44 178 L57 178 L60 128 L63 178 L76 178 L74 118 Z" fill="${shade(o2, 0.85)}" ${ink()}/><path d="M60 128 L63 178 L76 178 L74 118 Z" fill="${shade(o2, 0.62)}"/>`;
    s += `<path d="M42 176 h16 v14 q-10 3 -20 0 Z M62 176 h16 l4 14 q-10 3 -20 0 Z" fill="#3b2617" ${ink()}/>`;
  } else {
    s += `<path d="M64 186 h12 l3 6 q-8 2 -15 0 Z M44 186 h12 v6 q-8 2 -14 0 Z" fill="#3b2617" ${ink()}/>`;
    s += `<path d="M46 104 Q36 150 32 186 Q60 194 88 186 Q84 150 74 104 Z" fill="${o}" ${ink()}/><path d="M62 106 Q74 150 80 188 Q86 187 88 186 Q84 150 74 104 Z" fill="${oSh}"/>`;
    s += `<path d="M48 120 Q42 152 40 182 Q60 188 80 182 Q78 152 72 120 Z" fill="${o2}" opacity=".9" ${ink(1.8)}/>`;
  }
  // buste
  const torso = c.gender === 'm' ? 'M40 64 Q38 100 44 124 L76 124 Q82 100 80 64 Q70 58 60 58 Q50 58 40 64 Z' : 'M42 64 Q40 90 46 108 L74 108 Q80 90 78 64 Q70 58 60 58 Q50 58 42 64 Z';
  s += `<path d="M54 50 h12 v12 h-12 Z" fill="${skinSh}" ${ink()}/>`;
  s += `<path d="${torso}" fill="${o}" ${ink()}/><path d="M62 59 Q72 60 80 64 Q82 100 76 ${c.gender === 'm' ? 124 : 108} L66 ${c.gender === 'm' ? 124 : 108} Z" fill="${oSh}"/>`;
  s += `<path d="M52 60 L60 74 L68 60" fill="${shade(o, 1.2)}" ${ink(1.8)}/>`;
  if (c.gender === 'm') s += `<path d="M42 106 H78 V112 H42 Z" fill="#4a2f1a" ${ink(1.8)}/><rect x="56" y="105" width="8" height="8" fill="#e0b84c" ${ink(1.4)}/>`;
  else s += `<path d="M44 98 H76 L74 106 H46 Z" fill="${o2}" ${ink(1.8)}/>`;
  if (c.apron) s += `<path d="M46 76 h28 l2 70 h-32 Z" fill="#7a4a28" ${ink()}/><path d="M64 76 h10 l2 70 h-10 Z" fill="#5a3418"/><path d="M50 76 l-6 -14 M70 76 l6 -14" stroke="${INK}" stroke-width="2"/>`;
  if (c.cape) s += `<path d="M38 64 Q30 120 34 140 L42 132 Q40 100 44 66 Z M82 64 Q90 120 86 140 L78 132 Q80 100 76 66 Z" fill="${o2}" ${ink()}/>`;
  if (c.shawl) s += `<path d="M40 62 Q60 90 80 62 Q84 72 78 80 Q60 96 42 80 Q36 72 40 62 Z" fill="${o2}" ${ink()}/><path d="M48 84 l-2 8 M56 88 l-1 8 M64 88 l1 8 M72 84 l2 8" stroke="${INK}" stroke-width="1.6"/>`;
  // bras
  if (pose === 'aim') {
    s += `<path d="M78 66 Q96 70 104 62 L106 70 Q96 80 78 78 Z" fill="${o}" ${ink()}/><path d="M42 66 Q50 80 70 78 L72 70 Q56 70 48 64 Z" fill="${oSh}" ${ink()}/>`;
    s += `<path d="M58 72 L120 52" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M58 72 L120 52" stroke="#6b4426" stroke-width="3.5"/><path d="M86 63 L120 52" stroke="#55585e" stroke-width="3"/>`;
    s += `<circle cx="104" cy="64" r="5" fill="${skin}" ${ink(1.8)}/><circle cx="72" cy="74" r="5" fill="${skin}" ${ink(1.8)}/>`;
  } else {
    s += `<path d="M40 64 Q32 92 34 120 L42 120 Q42 96 46 72 Z" fill="${o}" ${ink()}/><path d="M80 64 Q88 92 86 120 L78 120 Q78 96 74 72 Z" fill="${oSh}" ${ink()}/>`;
    s += `<circle cx="38" cy="123" r="5.2" fill="${skin}" ${ink(1.8)}/><circle cx="82" cy="123" r="5.2" fill="${skinSh}" ${ink(1.8)}/>`;
  }
  // tête
  s += `<ellipse cx="60" cy="36" rx="16" ry="19" fill="${skin}" ${ink()}/><path d="M66 18 Q78 26 76 40 Q74 52 64 55 Q72 44 70 30 Z" fill="${skinSh}" opacity=".7"/>`;
  s += `<ellipse cx="43.5" cy="38" rx="3" ry="4.5" fill="${skin}" ${ink(1.8)}/><ellipse cx="76.5" cy="38" rx="3" ry="4.5" fill="${skinSh}" ${ink(1.8)}/>`;
  s += face(c);
  s += beard(c);
  s += hairFront(c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" class="character" role="img" aria-label="${title || c.name}">${s}</svg>`;
}
