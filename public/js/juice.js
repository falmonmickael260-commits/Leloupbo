/**
 * Retours visuels et tactiles (« juice ») : tremblement du plateau, voile coloré, vibration.
 * Purement décoratif : ne touche jamais à l'état du jeu ni à la position réelle des pions.
 *
 * - Tremblement par « trauma » qui décroît (doux pour un petit événement, net pour un gros),
 *   appliqué à un conteneur VISUEL, jamais au plateau lui-même (dont l'échelle est calculée à part).
 * - Trois niveaux d'importance pour que tout le jeu reste proportionné.
 * - Option « Animations et vibrations réduites » (et réglage du téléphone respecté).
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

/** Niveaux : tremblement (trauma), couleur du voile, vibration. */
const TIERS = {
  small: { trauma: 0.2, veil: null, vibrate: [40] },
  medium: { trauma: 0.45, veil: 'death', vibrate: [120] },
  large: { trauma: 0.8, veil: 'shot', vibrate: [60, 40, 160] },
  victory: { trauma: 0.3, veil: 'gold', vibrate: [80, 60, 80] },
};

let target = null;
let veilEl = null;
let trauma = 0;
let t = 0;
let last = 0;
let raf = 0;

/** Élément qui tremble (un conteneur autour du plateau) et voile plein écran. */
export function initJuice(shakeTarget) {
  target = shakeTarget;
  veilEl = document.createElement('div');
  veilEl.className = 'juice-veil';
  veilEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veilEl);
  document.documentElement.classList.toggle('reduce-motion', reducedMotion());
}

function frame(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  trauma = Math.max(0, trauma - 1.3 * dt); // décroît : le tremblement s'arrête toujours seul
  const shake = trauma * trauma; // doux pour les petits événements, net pour les gros
  t += dt * 30;
  // Sinus à fréquences différentes (et non un hasard par image, qui « grésille »).
  const x = 10 * shake * (0.6 * Math.sin(t * 1.7) + 0.4 * Math.sin(t * 3.1));
  const y = 7 * shake * (0.6 * Math.sin(t * 2.3) + 0.4 * Math.sin(t * 4.3));
  const r = 0.9 * shake * Math.sin(t * 1.1);
  // Léger zoom pendant le tremblement : les bords de l'écran ne se découvrent jamais.
  if (target) target.style.transform = trauma > 0 ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${(1 + 0.06 * shake).toFixed(4)})` : '';
  if (trauma > 0) raf = requestAnimationFrame(frame);
  else {
    raf = 0;
    last = 0;
  }
}

function shake(amount) {
  if (!target || reducedMotion()) return;
  trauma = Math.min(1, trauma + amount); // les chocs s'additionnent, sans dépasser le maximum
  if (!raf) raf = requestAnimationFrame(frame);
}

function veil(kind) {
  if (!veilEl || !kind) return;
  veilEl.className = 'juice-veil';
  void veilEl.offsetWidth; // relance l'animation si elle est déjà en cours
  veilEl.className = `juice-veil on ${kind}${reducedMotion() ? ' soft' : ''}`;
}

export function vibrate(pattern) {
  if (reducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté (iPhone) */
  }
}

/** Un événement du jeu : un seul appel, l'importance décide de l'intensité. */
export function impact(tier = 'small', { buzz = true } = {}) {
  const cfg = TIERS[tier] ?? TIERS.small;
  shake(cfg.trauma);
  veil(cfg.veil);
  if (buzz) vibrate(cfg.vibrate);
}
