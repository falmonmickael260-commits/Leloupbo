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
