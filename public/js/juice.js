/**
 * Retours visuels (« juice ») : un voile de couleur bref (mort, tir, victoire).
 * Purement décoratif : ne touche jamais à l'état du jeu ni à la position du plateau.
 * L'écran ne tremble plus et le téléphone ne vibre jamais.
 * Option « Animations réduites » (et réglage du téléphone respecté) : voile plus doux.
 */

const KEY = 'blackops:reduceMotion';
const systemReduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function reducedMotion() {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v === '1';
  } catch {
    /* stockage indisponible */
  }
  return systemReduce();
}

export function setReducedMotion(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  document.documentElement.classList.toggle('reduce-motion', on);
}

/** Niveaux : couleur du voile (aucun tremblement de l'écran : il déréglait le plateau). */
const TIERS = {
  small: { veil: null },
  medium: { veil: 'death' },
  large: { veil: 'shot' },
  victory: { veil: 'gold' },
};

let veilEl = null;

/** Voile plein écran (éclat de couleur bref). L'écran, lui, ne bouge jamais. */
export function initJuice() {
  veilEl = document.createElement('div');
  veilEl.className = 'juice-veil';
  veilEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veilEl);
  document.documentElement.classList.toggle('reduce-motion', reducedMotion());
}

function veil(kind) {
  if (!veilEl || !kind) return;
  veilEl.className = 'juice-veil';
  void veilEl.offsetWidth; // relance l'animation si elle est déjà en cours
  veilEl.className = `juice-veil on ${kind}${reducedMotion() ? ' soft' : ''}`;
}

/** Un événement du jeu : un seul appel, l'importance décide de l'intensité. */
export function impact(tier = 'small') {
  const cfg = TIERS[tier] ?? TIERS.small;
  veil(cfg.veil);
}

/**
 * Mort d'un joueur : trois coups de griffe sanglants au milieu de l'écran, des gouttes qui
 * coulent, puis tout s'efface (≈ 1,8 s). L'écran, lui, ne bouge pas. Plusieurs morts au
 * même moment = un seul coup de griffe.
 */
let lastClaw = 0;
export function clawSlash() {
  const now = Date.now();
  if (now - lastClaw < 1500) return false;
  lastClaw = now;
  const el = document.createElement('div');
  el.className = `claw-slash${reducedMotion() ? ' soft' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  // Griffures : formes effilées (pointe fine aux deux bouts), légèrement courbes.
  const mark = (x, d) =>
    `<path class="cm" style="--d:${d}s" d="M${x} 18 C ${x + 14} 90, ${x + 34} 170, ${x + 66} 286 C ${x + 72} 170, ${x + 50} 92, ${x} 18 Z"/>` +
    `<path class="cm in" style="--d:${d}s" d="M${x + 8} 50 C ${x + 20} 110, ${x + 36} 175, ${x + 58} 260 C ${x + 52} 172, ${x + 36} 108, ${x + 8} 50 Z"/>`;
  const drip = (x, y, d, h) => `<g class="cd" style="--d:${d}s;transform-origin:${x}px ${y}px"><rect x="${x - 3}" y="${y}" width="6" height="${h}" rx="3"/><circle cx="${x}" cy="${y + h}" r="5"/></g>`;
  el.innerHTML = `<svg viewBox="0 0 300 320">
    <defs><linearGradient id="claw-blood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2a1a"/><stop offset=".55" stop-color="#b30d06"/><stop offset="1" stop-color="#5e0200"/></linearGradient></defs>
    <g fill="url(#claw-blood)" stroke="#2a0000" stroke-width="2">
      ${mark(40, 0)}${mark(108, 0.06)}${mark(176, 0.12)}
    </g>
    <g fill="#9e0b05">${drip(86, 170, 0.32, 55)}${drip(152, 205, 0.42, 70)}${drip(222, 245, 0.38, 45)}${drip(122, 130, 0.52, 36)}${drip(196, 160, 0.6, 28)}</g>
    <g fill="#c4140a" class="cs">
      <circle cx="40" cy="60" r="5"/><circle cx="262" cy="250" r="7"/><circle cx="250" cy="120" r="4"/><circle cx="70" cy="230" r="6"/><circle cx="205" cy="40" r="3.5"/>
    </g>
  </svg>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
  return true;
}
