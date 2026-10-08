/**
 * Ambiance Halloween 🎃 (décorative uniquement : aucun effet sur la partie, rien ne bouge l'écran).
 *
 *  - brume au sol (légère le jour, violette et épaisse la nuit) ;
 *  - personnages costumés (voir art/characters.js) ;
 *  - toiles d'araignée dans les coins, chauves-souris qui traversent le ciel de temps en temps,
 *    petit fantôme qui passe la nuit.
 *
 * Active automatiquement en période d'Halloween (octobre → 2 novembre) ; chacun peut la couper
 * dans le menu (réglage gardé sur son appareil).
 */
import { reducedMotion } from './juice.js';

const KEY = 'blackops:halloween';

export function halloweenSeason(d = new Date()) {
  return d.getMonth() === 9 || (d.getMonth() === 10 && d.getDate() <= 2);
}

export function halloweenOn() {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v === '1';
  } catch {
    /* stockage indisponible */
  }
  return halloweenSeason();
}

const BAT = `<svg viewBox="0 0 64 28" aria-hidden="true"><path d="M32 10 c-3-6-6-6-7-3 c-4-5-12-6-25 0 c8 1 11 5 12 10 c3-3 7-3 9 0 c2-2 5-2 6 1 l5-3 l5 3 c1-3 4-3 6-1 c2-3 6-3 9 0 c1-5 4-9 12-10 c-13-6-21-5-25 0 c-1-3-4-3-7 3z" fill="#0d0a12"/><circle cx="29.5" cy="11" r="1" fill="#ff5b3a"/><circle cx="34.5" cy="11" r="1" fill="#ff5b3a"/></svg>`;

const WEB = `<svg viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke="rgba(235,230,245,.55)" stroke-width="1.2">
  <path d="M0 0 L120 0 M0 0 L110 45 M0 0 L80 80 M0 0 L45 110 M0 0 L0 120"/>
  <path d="M30 0 Q27 12 28 11 Q20 20 26 24 Q14 25 12 28 Q11 27 0 30"/>
  <path d="M60 0 Q55 22 56 22 Q40 38 52 48 Q30 50 24 56 Q22 55 0 60"/>
  <path d="M92 0 Q85 33 84 34 Q62 58 78 74 Q46 78 36 84 Q34 85 0 92"/>
</svg>`;

const GHOST = `<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M30 2 C14 2 6 15 6 30 L6 66 L14 60 L22 67 L30 60 L38 67 L46 60 L54 66 L54 30 C54 15 46 2 30 2z" fill="rgba(240,240,255,.85)"/><ellipse cx="22" cy="28" rx="4" ry="6" fill="#1b130e"/><ellipse cx="38" cy="28" rx="4" ry="6" fill="#1b130e"/><ellipse cx="30" cy="44" rx="5" ry="4" fill="#1b130e"/></svg>`;

let stageLayer = null;
let frontLayer = null;
let screenLayer = null;
let batTimer = 0;
let ghostTimer = 0;
let nightNow = false;

/** Installe (ou retire) l'ambiance. `stage` = élément .stage du plateau. */
export function setHalloween(stage, on) {
  document.documentElement.classList.toggle('halloween', on);
  clearTimeout(batTimer);
  clearTimeout(ghostTimer);
  stageLayer?.remove();
  frontLayer?.remove();
  screenLayer?.remove();
  stageLayer = frontLayer = screenLayer = null;
  if (!on) return;
  // Sur le plateau, au sol autour des joueurs : brume (deux couches qui dérivent lentement).
  stageLayer = document.createElement('div');
  stageLayer.className = 'hw-stage';
  stageLayer.innerHTML = '<div class="hw-fog"></div><div class="hw-fog b"></div>';
  stage.insertBefore(stageLayer, stage.querySelector('.pions'));
  frontLayer = document.createElement('div');
  frontLayer.className = 'hw-front';
  frontLayer.innerHTML = '<div class="hw-fog"></div>';
  stage.insertBefore(frontLayer, stage.querySelector('.fx'));
  // Sur l'écran, sous l'interface : toiles d'araignée + ciel (chauves-souris, fantôme).
  screenLayer = document.createElement('div');
  screenLayer.className = 'hw-screen';
  screenLayer.setAttribute('aria-hidden', 'true');
  screenLayer.innerHTML = `<div class="hw-web l">${WEB}</div><div class="hw-web r">${WEB}</div>`;
  // Juste après le plateau : sous toute l'interface (panneaux, boutons, textes).
  const board = stage.closest('.board');
  if (board) board.after(screenLayer);
  else document.body.prepend(screenLayer);
  scheduleBats();
  scheduleGhosts(4000);
}

/** La nuit tombe / se lève : plus de chauves-souris et de fantômes la nuit. */
export function halloweenNight(night) {
  if (night === nightNow) return;
  nightNow = night;
  if (!screenLayer) return;
  clearTimeout(ghostTimer);
  scheduleGhosts(1500);
}

/** Fantômes qui se baladent : jour et nuit (plus souvent la nuit), un ou deux à la fois. */
function scheduleGhosts(first) {
  const delay = first ?? (nightNow ? 6000 : 13000) + Math.random() * 8000;
  ghostTimer = setTimeout(() => {
    ghost();
    if (Math.random() < (nightNow ? 0.5 : 0.25)) setTimeout(ghost, 1800 + Math.random() * 2500);
    scheduleGhosts();
  }, delay);
}

function scheduleBats() {
  const delay = (nightNow ? 7000 : 15000) + Math.random() * 9000;
  batTimer = setTimeout(() => {
    bats();
    scheduleBats();
  }, delay);
}

function bats() {
  if (!screenLayer || reducedMotion() || document.hidden) return;
  const n = 2 + Math.floor(Math.random() * 3);
  const fromLeft = Math.random() < 0.5;
  const top = 8 + Math.random() * 22; // % de la hauteur : en haut de l'écran
  for (let i = 0; i < n; i++) {
    const b = document.createElement('div');
    b.className = `hw-bat ${fromLeft ? 'ltr' : 'rtl'}`;
    b.style.top = `${top + (Math.random() * 10 - 5)}%`;
    b.style.setProperty('--dur', `${(4.2 + Math.random() * 1.6).toFixed(2)}s`);
    b.style.setProperty('--delay', `${(i * 0.25 + Math.random() * 0.3).toFixed(2)}s`);
    b.style.setProperty('--sz', `${(26 + Math.random() * 18).toFixed(0)}px`);
    b.innerHTML = BAT;
    screenLayer.appendChild(b);
    setTimeout(() => b.remove(), 7500);
  }
}

function ghost() {
  if (!screenLayer || reducedMotion() || document.hidden) return;
  const g = document.createElement('div');
  const ltr = Math.random() < 0.5;
  g.className = `hw-ghost ${ltr ? 'ltr' : 'rtl'}`;
  // Se balade dans le ciel ou au niveau de la place, en ondulant ; plus visible la nuit.
  g.style.top = `${18 + Math.random() * 45}%`;
  g.style.setProperty('--gdur', `${(10 + Math.random() * 6).toFixed(1)}s`);
  g.style.setProperty('--gsz', `${(34 + Math.random() * 22).toFixed(0)}px`);
  g.style.setProperty('--gop', nightNow ? '0.7' : '0.42');
  g.innerHTML = `<div class="hw-ghost-bob">${GHOST}</div>`;
  screenLayer.appendChild(g);
  setTimeout(() => g.remove(), 17000);
}

/** Toggle du menu. */
export function toggleHalloween(stage) {
  const on = !halloweenOn();
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  setHalloween(stage, on);
  return on;
}
