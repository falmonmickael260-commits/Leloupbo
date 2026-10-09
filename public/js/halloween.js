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
  const delay = first ?? (nightNow ? 4000 : 9000) + Math.random() * 6000;
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

/** Point au hasard sur un bord de l'écran (un peu en dehors), en pixels. */
function edgePoint(W, H, side) {
  const m = 80;
  if (side === 0) return { x: -m, y: Math.random() * H }; // gauche
  if (side === 1) return { x: W + m, y: Math.random() * H }; // droite
  if (side === 2) return { x: Math.random() * W, y: -m }; // haut
  return { x: Math.random() * W, y: H + m }; // bas
}

/**
 * Fantôme qui se balade PARTOUT : il traverse l'écran d'un bord à un autre (gauche ↔ droite,
 * haut ↔ bas, en diagonale) en zigzaguant, ou apparaît au milieu, flotte puis s'évanouit.
 */
function ghost() {
  if (!screenLayer || reducedMotion() || document.hidden) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const g = document.createElement('div');
  g.className = 'hw-ghost';
  const size = 34 + Math.random() * 26;
  g.style.width = `${size.toFixed(0)}px`;
  g.innerHTML = `<div class="hw-ghost-bob">${GHOST}</div>`;
  screenLayer.appendChild(g);
  const op = nightNow ? 0.72 : 0.45;
  const pts = [];
  let frames;
  if (Math.random() < 0.25) {
    // Apparition : surgit quelque part, dérive doucement, disparaît.
    const x = W * (0.1 + Math.random() * 0.8);
    const y = H * (0.1 + Math.random() * 0.75);
    const dx = (Math.random() - 0.5) * 160;
    const dy = (Math.random() - 0.5) * 120;
    frames = [
      { transform: `translate(${x}px, ${y}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x + dx * 0.3}px, ${y + dy * 0.3}px) scale(1)`, opacity: op, offset: 0.25 },
      { transform: `translate(${x + dx * 0.7}px, ${y + dy * 0.7}px) scale(1)`, opacity: op, offset: 0.7 },
      { transform: `translate(${x + dx}px, ${y + dy}px) scale(1.3)`, opacity: 0 },
    ];
  } else {
    // Traversée : d'un bord vers un autre bord différent, avec deux crochets en route.
    const from = Math.floor(Math.random() * 4);
    let to = Math.floor(Math.random() * 4);
    if (to === from) to = from ^ 1;
    const a = edgePoint(W, H, from);
    const z = edgePoint(W, H, to);
    pts.push(a);
    for (const t of [0.33, 0.66]) pts.push({ x: a.x + (z.x - a.x) * t + (Math.random() - 0.5) * W * 0.35, y: a.y + (z.y - a.y) * t + (Math.random() - 0.5) * H * 0.3 });
    pts.push(z);
    // Le fantôme regarde où il va ; au dernier point, il garde le sens du dernier trajet
    // (sinon il se retournerait en s'écrasant pendant la fin de sa course).
    const facing = (i) => (i < 3 ? pts[i + 1].x < pts[i].x : pts[3].x < pts[2].x) ? -1 : 1;
    frames = pts.map((p, i) => ({ transform: `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) scaleX(${facing(i)})`, opacity: i === 0 || i === 3 ? 0 : op }));
    frames[1].offset = 0.18;
    frames[2].offset = 0.75;
  }
  const dur = 9000 + Math.random() * 7000;
  const anim = g.animate(frames, { duration: dur, easing: 'ease-in-out', fill: 'forwards' });
  anim.finished.finally(() => g.remove());
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
