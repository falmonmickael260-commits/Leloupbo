/**
 * Ambiance du village : oiseaux le jour, vent et bruits lointains la nuit (loup, hibou,
 * craquement, rafale ; gémissements de fantôme quand Halloween est activé).
 *
 * - Joués pareil chez tout le monde, au hasard : ils ne révèlent rien (aucun lien avec les rôles).
 * - Très bas, et coupés dès que des joueurs parlent (mon micro ouvert ou des voix que j'entends).
 * - Désactivable dans le menu (réglage gardé sur l'appareil).
 */
import * as sfx from './sfx.js';

const KEY = 'blackops:nightSounds';
let active = null;
let timer = 0;

export function nightSoundsOn() {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function toggleNightSounds() {
  const on = !nightSoundsOn();
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (!on) stop();
  return on;
}

/** À appeler à chaque état de la partie : `night` = phase de nuit, `voice` = quelqu'un parle (moi ou ceux que j'entends). */
export function nightAmbience(night, voice = false, day = false) {
  const want = nightSoundsOn() ? night && !voice ? 'night' : day ? 'day' : null : null;
  if (want === active) return;
  stop();
  if (want) start(want);
}

function start(mode) {
  active = mode;
  sfx.windStart(mode === 'night' ? .05 : .015);
  schedule(2500 + Math.random() * 3000);
}

function stop() {
  active = null;
  clearTimeout(timer);
  sfx.windStop();
}

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!active) return;
    if (!document.hidden) playOne();
    schedule(6000 + Math.random() * 9000);
  }, delay);
}

let last = '';
function playOne() {
  if (active === 'day') { sfx.birds(); return; }
  const halloween = document.documentElement.classList.contains('halloween');
  const pool = ['howl', 'howl', 'owl', 'creak', 'gust'];
  if (halloween) pool.push('ghost', 'ghost', 'ghost');
  let pick;
  do pick = pool[Math.floor(Math.random() * pool.length)];
  while (pick === last && pool.length > 1);
  last = pick;
  ({ howl: sfx.distantHowl, owl: sfx.owl, creak: sfx.creak, gust: sfx.gust, ghost: sfx.ghostMoan })[pick]();
}

/** L'ambiance joue-t-elle en ce moment ? (pour les vérifications) */
export const nightAmbienceActive = () => active === 'night';
