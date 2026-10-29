/**
 * Ambiance Halloween 🎃 (décorative uniquement : aucun effet sur la partie, rien ne bouge l'écran).
 *
 *  - brume au sol (légère le jour, violette et épaisse la nuit) ;
 *  - personnages costumés (voir art/characters.js) ;
 *  - toiles d'araignée dans les coins, chauves-souris qui traversent le ciel de temps en temps,
 *    les apparitions spectrales sont gérées séparément par le plateau.
 *
 * Active automatiquement en période d'Halloween (octobre → 2 novembre) ; chacun peut la couper
 * dans le menu (réglage gardé sur son appareil).
 */
import { reducedMotion } from './juice.js';

export function halloweenSeason(d = new Date()) {
  return d.getMonth() === 9 || (d.getMonth() === 10 && d.getDate() <= 2);
}

/**
 * Choix du menu, gardé pour la période en cours seulement : celui fait pendant Halloween
 * (clé de l'année) n'agit plus une fois la période finie, et l'année suivante repart sur
 * l'activation automatique ; celui fait hors saison vaut pour toute la période hors saison.
 */
const storageKey = (d = new Date()) => `blackops:halloween:${halloweenSeason(d) ? d.getFullYear() : 'off'}`;

export function halloweenOn() {
  try {
    const v = localStorage.getItem(storageKey());
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

let stageLayer = null;
let frontLayer = null;
let screenLayer = null;
let batTimer = 0;
let nightNow = false;

/** Installe (ou retire) l'ambiance. `stage` = élément .stage du plateau. */
export function setHalloween(stage, on) {
  document.documentElement.classList.toggle('halloween', on);
  clearTimeout(batTimer);
  stageLayer?.remove();
  frontLayer?.remove();
  screenLayer?.remove();
  stageLayer = frontLayer = screenLayer = null;
  if (!on) return;
  // Sur le plateau, au sol autour des joueurs : brume (deux couches fixes, plus dense la nuit).
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
}

/** La nuit tombe / se lève : plus de chauves-souris et de fantômes la nuit. */
export function halloweenNight(night) {
  if (night === nightNow) return;
  nightNow = night;
  if (!screenLayer) return;
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

/** Toggle du menu. */
export function toggleHalloween(stage) {
  const on = !halloweenOn();
  try {
    localStorage.setItem(storageKey(), on ? '1' : '0');
  } catch {
    /* ignore */
  }
  setHalloween(stage, on);
  return on;
}
