/**
 * Cartes de rôles — style bande dessinée (SVG inline, police Bangers chargée par la page).
 * cardSVG(roleId, roleName) → face ; cardBackSVG() → dos.
 */
const INK = '#1b130e';
const ink = (w = 3) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

const THEMES = {
  villager: { bg: '#e9b44c', bg2: '#c98a2a' },
  werewolf: { bg: '#3b3f8f', bg2: '#1f2259' },
  white_wolf: { bg: '#5aa6d6', bg2: '#2a5f8f' },
  seer: { bg: '#8e5bc4', bg2: '#5a2f8a' },
  witch: { bg: '#4fa35a', bg2: '#2a6a35' },
  cupid: { bg: '#e8708f', bg2: '#b03a5c' },
  thief: { bg: '#6b6f7a', bg2: '#3a3d45' },
  hunter: { bg: '#c0603a', bg2: '#7a3420' },
  salvateur: { bg: '#4a8fc4', bg2: '#235a8a' },
  captain: { bg: '#d9a92e', bg2: '#9a6a12' },
};

const moon = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffe8a0" ${ink(3)}/><circle cx="${cx - r * 0.3}" cy="${cy - r * 0.2}" r="${r * 0.18}" fill="#f2cf6a"/><circle cx="${cx + r * 0.3}" cy="${cy + r * 0.3}" r="${r * 0.12}" fill="#f2cf6a"/>`;
const wolfHead = (fill, sh) =>
  `<path d="M96 300 L104 238 L84 200 L112 214 L128 168 L146 206 L188 196 L232 214 L214 230 L236 246 L202 252 L188 274 L200 300 Z" fill="${fill}" ${ink(4)}/>` +
  `<path d="M146 206 L188 196 L232 214 L214 230 L236 246 L202 252 L188 274 L200 300 L150 300 Q170 260 150 232 Z" fill="${sh}"/>` +
  `<path d="M96 300 L104 238 L84 200 L112 214 L128 168 L146 206 L188 196 L232 214 L214 230 L236 246 L202 252 L188 274 L200 300 Z" fill="none" ${ink(4)}/>` +
  `<path d="M160 222 l16 -4 l-6 9 Z" fill="#ffd552" ${ink(2)}/><path d="M228 214 l8 -4 l-2 8 Z" fill="${INK}"/><path d="M204 252 l6 10 l4 -8" fill="#fff" ${ink(1.6)}/>`;

const EMBLEMS = {
  villager: () =>
    `<path d="M70 300 L70 230 L150 175 L230 230 L230 300 Z" fill="#f2d9a4" ${ink(4)}/><path d="M50 238 L150 160 L250 238 L232 246 L150 184 L68 246 Z" fill="#a5523a" ${ink(4)}/><rect x="132" y="250" width="36" height="50" fill="#a86b36" ${ink(3)}/><rect x="88" y="240" width="28" height="24" fill="#2c3c55" ${ink(3)}/><rect x="184" y="240" width="28" height="24" fill="#2c3c55" ${ink(3)}/>` +
    `<path d="M240 300 L262 150" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M240 300 L262 150" stroke="#a86b36" stroke-width="5"/><path d="M246 156 l-6 -36 M262 152 l0 -38 M278 158 l8 -36 M244 160 Q262 168 282 162" ${ink(5)} fill="none"/>`,
  werewolf: () => moon(150, 150, 72) + `<g transform="translate(150 240) scale(1.3) translate(-160 -240)">${wolfHead('#4a4a55', '#2e2e36')}</g>`,
  white_wolf: () => moon(150, 150, 72) + `<g transform="translate(150 240) scale(1.3) translate(-160 -240)">${wolfHead('#f4f6fa', '#b9c6d6')}</g>`,
  seer: () =>
    `<path d="M100 300 Q150 270 200 300 L190 312 Q150 296 110 312 Z" fill="#a86b36" ${ink(4)}/><circle cx="150" cy="215" r="78" fill="#bfe3ff" ${ink(4)}/><path d="M150 137 A78 78 0 0 1 228 215 A78 78 0 0 1 172 290 Q210 220 150 137 Z" fill="#7ab4e0"/><circle cx="150" cy="215" r="78" fill="none" ${ink(4)}/>` +
    `<path d="M104 215 Q150 170 196 215 Q150 260 104 215 Z" fill="#fff" ${ink(3.5)}/><circle cx="150" cy="215" r="18" fill="#8e5bc4" ${ink(3)}/><circle cx="150" cy="215" r="8" fill="${INK}"/><circle cx="156" cy="209" r="4" fill="#fff"/><path d="M112 170 q10 -14 24 -18" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>`,
  witch: () =>
    `<path d="M88 170 h28 v24 q34 22 22 74 q-6 30 -36 30 q-30 0 -36 -30 q-12 -52 22 -74 Z" fill="#7cd36a" ${ink(4)}/><path d="M74 240 q28 14 56 0 q4 28 -10 46 q-20 14 -38 0 q-12 -18 -8 -46 Z" fill="#3e9a3e"/><path d="M88 170 h28 v24 q34 22 22 74 q-6 30 -36 30 q-30 0 -36 -30 q-12 -52 22 -74 Z" fill="none" ${ink(4)}/><rect x="84" y="156" width="36" height="16" rx="4" fill="#a86b36" ${ink(3)}/><path d="M82 230 q8 -20 18 -28" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="M196 150 h24 v34 l30 90 q4 26 -26 26 h-32 q-30 0 -26 -26 l30 -90 Z" fill="#b07ae0" ${ink(4)}/><path d="M176 250 h68 l6 24 q4 26 -26 26 h-32 q-30 0 -26 -26 Z" fill="#6a2fa0"/><path d="M196 150 h24 v34 l30 90 q4 26 -26 26 h-32 q-30 0 -26 -26 l30 -90 Z" fill="none" ${ink(4)}/><rect x="190" y="136" width="36" height="16" rx="4" fill="#a86b36" ${ink(3)}/><path d="M198 262 q10 -14 22 0 q-2 12 -11 12 q-9 0 -11 -12 Z M203 266 h4 M213 266 h4" fill="#fff" ${ink(2)}/>`,
  cupid: () =>
    `<path d="M150 300 C60 240 70 160 112 156 C134 154 146 170 150 184 C154 170 166 154 188 156 C230 160 240 240 150 300 Z" fill="#ff5c7a" ${ink(4)}/><path d="M150 300 C210 252 232 190 200 166 C226 196 206 250 150 300 Z" fill="#c9304f"/><path d="M150 300 C60 240 70 160 112 156 C134 154 146 170 150 184 C154 170 166 154 188 156 C230 160 240 240 150 300 Z" fill="none" ${ink(4)}/><path d="M104 182 q8 -12 22 -12" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>` +
    `<path d="M50 300 L258 150" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M50 300 L258 150" stroke="#e8c070" stroke-width="5"/><path d="M258 150 l-30 4 l14 12 Z" fill="#cfd4dc" ${ink(3)}/><path d="M50 300 l-10 -18 l18 6 M50 300 l-18 -8 l12 -10" fill="#fff" ${ink(2.5)}/>`,
  thief: () =>
    `<path d="M56 190 Q150 150 244 190 Q246 236 214 244 Q184 250 168 226 Q150 214 132 226 Q116 250 86 244 Q54 236 56 190 Z" fill="#2c2e35" ${ink(4)}/><ellipse cx="108" cy="204" rx="22" ry="13" fill="#fff" ${ink(3)}/><ellipse cx="192" cy="204" rx="22" ry="13" fill="#fff" ${ink(3)}/><circle cx="112" cy="205" r="7" fill="${INK}"/><circle cx="196" cy="205" r="7" fill="${INK}"/><path d="M56 190 Q20 180 14 160 M244 190 Q280 180 286 160" ${ink(5)} fill="none"/>` +
    `<path d="M112 300 Q100 262 130 252 L170 252 Q200 262 188 300 Z" fill="#a86b36" ${ink(4)}/><path d="M126 252 q24 -16 48 0" ${ink(4)} fill="none"/><circle cx="150" cy="280" r="10" fill="#f2c94c" ${ink(2.5)}/><text x="150" y="285" font-size="14" text-anchor="middle" font-family="Bangers,Impact,sans-serif" fill="${INK}">$</text>`,
  hunter: () =>
    `<circle cx="150" cy="215" r="80" fill="#fff" ${ink(4)}/><circle cx="150" cy="215" r="58" fill="#e0533d" ${ink(3)}/><circle cx="150" cy="215" r="36" fill="#fff" ${ink(3)}/><circle cx="150" cy="215" r="14" fill="#e0533d" ${ink(3)}/>` +
    `<path d="M40 300 L262 140" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M40 300 L262 140" stroke="#7a4e2c" stroke-width="9"/><path d="M150 221 L262 140" stroke="#55585e" stroke-width="7"/><path d="M60 286 l-24 -10 l10 26 Z" fill="#7a4e2c" ${ink(3)}/>` +
    `<path d="M236 120 l16 -10 M268 152 l12 4 M256 128 l14 -16" stroke="#ffd552" stroke-width="6" stroke-linecap="round"/>`,
  salvateur: () =>
    `<path d="M150 136 L232 166 Q234 260 150 306 Q66 260 68 166 Z" fill="#dfe6ef" ${ink(5)}/><path d="M150 136 L232 166 Q234 260 150 306 Z" fill="#aab8c8"/><path d="M150 136 L232 166 Q234 260 150 306 Q66 260 68 166 Z" fill="none" ${ink(5)}/><path d="M150 156 L214 180 Q214 252 150 288 Q86 252 86 180 Z" fill="#3f78b8" ${ink(3)}/><path d="M138 190 h24 v24 h24 v24 h-24 v34 h-24 v-34 h-24 v-24 h24 Z" fill="#f2c94c" ${ink(3)}/>`,
  captain: () =>
    `<path d="M84 270 L74 176 L114 214 L150 160 L186 214 L226 176 L216 270 Z" fill="#f2c94c" ${ink(5)}/><path d="M150 160 L186 214 L226 176 L216 270 L150 270 Z" fill="#c9952a"/><path d="M84 270 L74 176 L114 214 L150 160 L186 214 L226 176 L216 270 Z" fill="none" ${ink(5)}/><rect x="80" y="262" width="140" height="26" rx="6" fill="#e0b84c" ${ink(4)}/><circle cx="150" cy="230" r="12" fill="#d33a4a" ${ink(3)}/><circle cx="110" cy="244" r="8" fill="#3f78b8" ${ink(2.5)}/><circle cx="190" cy="244" r="8" fill="#3f9a5a" ${ink(2.5)}/>`,
};

function burst(theme) {
  let rays = '';
  for (let i = 0; i < 24; i++) {
    const a1 = (i / 24) * Math.PI * 2;
    const a2 = ((i + 0.5) / 24) * Math.PI * 2;
    rays += `<path d="M150 215 L${150 + Math.cos(a1) * 320} ${215 + Math.sin(a1) * 320} L${150 + Math.cos(a2) * 320} ${215 + Math.sin(a2) * 320} Z" fill="${theme.bg2}" opacity=".45"/>`;
  }
  return rays;
}

let uid = 0;
// Largeur bornée : le nom tient dans le cartouche même si la police BD n'est pas encore chargée.
const fit = (name) => (name.length > 9 ? `textLength="${Math.min(220, name.length * 17)}" lengthAdjust="spacingAndGlyphs"` : '');
/**
 * Cartes illustrées fournies (public/assets/cartes/<rôle>.webp, générées par scripts/art/cards.py).
 * Un rôle sans image garde sa carte dessinée.
 */
/** Version des images de cartes : à changer quand on remplace les fichiers (force le rechargement). */
const CARDS_V = '5';
const CARD_IMAGES = new Set(['werewolf', 'black_wolf', 'white_wolf', 'seer', 'witch', 'cupid', 'thief', 'hunter', 'salvateur', 'villager', 'loup', 'civil']);
// Préchargement : la carte est prête au moment de sa révélation.
if (typeof Image !== 'undefined') for (const r of [...CARD_IMAGES, 'dos']) new Image().src = `/assets/cartes/${r}.webp?v=${CARDS_V}`;

export function cardSVG(roleId, roleName) {
  if (CARD_IMAGES.has(roleId)) {
    // La carte fournie a son propre cadre et ses coins : affichée telle quelle, fond transparent.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" class="role-card-svg" role="img" aria-label="${roleName}">
  <image href="/assets/cartes/${roleId}.webp?v=${CARDS_V}" x="0" y="0" width="300" height="450" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  }
  return drawnCardSVG(roleId, roleName);
}

/** Cartes génériques de la Voyante : elle ne voit jamais le rôle exact, seulement le camp. */
export const seerCardSVG = (result) => (result === 'LOUP' ? cardSVG('loup', 'Loup') : cardSVG('civil', 'Civil'));

/** Carte dessinée (style BD) — utilisée pour un rôle sans illustration fournie. */
function drawnCardSVG(roleId, roleName) {
  const theme = THEMES[roleId] ?? THEMES.villager;
  const id = `c${++uid}`;
  const emblem = (EMBLEMS[roleId] ?? EMBLEMS.villager)();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" class="role-card-svg" role="img" aria-label="${roleName}">
  <defs>
    <clipPath id="${id}a"><rect x="22" y="62" width="256" height="300" rx="8"/></clipPath>
    <pattern id="${id}d" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="1.6" fill="${INK}"/></pattern>
  </defs>
  <rect x="4" y="4" width="292" height="442" rx="20" fill="${INK}"/>
  <rect x="10" y="10" width="280" height="430" rx="16" fill="#f3e3bd" ${ink(3)}/>
  <g clip-path="url(#${id}a)">
    <rect x="22" y="62" width="256" height="300" fill="${theme.bg}"/>
    ${burst(theme)}
    <rect x="22" y="62" width="256" height="300" fill="url(#${id}d)" opacity=".12"/>
    ${emblem}
  </g>
  <rect x="22" y="62" width="256" height="300" rx="8" fill="none" ${ink(4)}/>
  <path d="M30 22 H270 L262 52 H38 Z" fill="${INK}"/>
  <text x="150" y="45" text-anchor="middle" textLength="222" lengthAdjust="spacingAndGlyphs" font-family="Bangers,Impact,'Arial Black',sans-serif" font-size="21" letter-spacing="1.5" fill="#ffe08a">LE VILLAGE DES BLACKOPS</text>
  <path d="M24 372 H276 L268 428 H32 Z" fill="${theme.bg2}" ${ink(4)}/>
  <text x="150" y="412" text-anchor="middle" font-family="Bangers,Impact,'Arial Black',sans-serif" font-size="${roleName.length > 14 ? 28 : 36}" letter-spacing="2" ${fit(roleName)} fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round">${roleName.toUpperCase()}</text>
  <text x="150" y="412" text-anchor="middle" font-family="Bangers,Impact,'Arial Black',sans-serif" font-size="${roleName.length > 14 ? 28 : 36}" letter-spacing="2" ${fit(roleName)} fill="#fff">${roleName.toUpperCase()}</text>
</svg>`;
}

export function cardBackSVG() {
  // Dos illustré fourni, recadré à la silhouette des faces (scripts/art/cards.py).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" class="role-card-svg" aria-hidden="true">
  <image href="/assets/cartes/dos.webp?v=${CARDS_V}" x="0" y="0" width="300" height="450" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

/** Dos dessiné (ancien) — conservé pour référence. */
export function drawnCardBackSVG() {
  const id = `b${++uid}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" class="role-card-svg" aria-hidden="true">
  <defs><pattern id="${id}d" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="6" cy="6" r="2.4" fill="#000"/></pattern></defs>
  <rect x="4" y="4" width="292" height="442" rx="20" fill="${INK}"/>
  <rect x="10" y="10" width="280" height="430" rx="16" fill="#18161d" ${ink(3)}/>
  <rect x="10" y="10" width="280" height="430" rx="16" fill="url(#${id}d)" opacity=".25"/>
  <rect x="26" y="26" width="248" height="398" rx="10" fill="none" stroke="#f2c94c" stroke-width="4"/>
  ${moon(150, 190, 70)}
  <g transform="translate(0 20) scale(1)">${wolfHead('#3a3a46', '#24242c')}</g>
  <text x="150" y="380" text-anchor="middle" font-family="Bangers,Impact,'Arial Black',sans-serif" font-size="30" letter-spacing="2" textLength="170" lengthAdjust="spacingAndGlyphs" fill="#ffe08a" stroke="${INK}" stroke-width="5" paint-order="stroke">LE VILLAGE</text>
  <text x="150" y="410" text-anchor="middle" font-family="Bangers,Impact,'Arial Black',sans-serif" font-size="30" letter-spacing="2" textLength="200" lengthAdjust="spacingAndGlyphs" fill="#ffe08a" stroke="${INK}" stroke-width="5" paint-order="stroke">DES BLACKOPS</text>
</svg>`;
}
