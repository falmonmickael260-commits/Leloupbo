/**
 * Cycle jour / nuit du plateau — la SEULE animation permanente du décor.
 *
 *   ☀️ jour → 🌅 coucher → 🌙 nuit (grosse lune) → 🌅 aube → ☀️ jour
 *
 * Le décor est fixe : seuls le ciel (dégradé, soleil, lune, étoiles) et des
 * calques de lumière (teinte chaude, obscurité, fenêtres/lanternes allumées)
 * sont interpolés. Seules des opacités, des couleurs de fond et des
 * translations sont animées → rendu fluide, GPU-friendly.
 */
const CYCLE = ['day', 'sunset', 'night', 'dawn'];

// Coordonnées dans le repère du plateau (1536×1024).
const KEYS = {
  day: { top: [74, 160, 230], mid: [138, 200, 245], bot: [205, 236, 255], sunX: 300, sunY: 70, sun: 1, moonX: 1250, moonY: 260, moon: 0, stars: 0, tint: 0, night: 0, lamps: 0 },
  sunset: { top: [92, 70, 140], mid: [236, 112, 84], bot: [255, 196, 120], sunX: 330, sunY: 205, sun: 1, moonX: 1250, moonY: 240, moon: 0, stars: 0.1, tint: 0.55, night: 0.25, lamps: 0.55 },
  night: { top: [8, 12, 34], mid: [20, 30, 70], bot: [44, 58, 104], sunX: 340, sunY: 290, sun: 0, moonX: 1210, moonY: 78, moon: 1, stars: 1, tint: 0, night: 0.86, lamps: 1 },
  dawn: { top: [46, 58, 110], mid: [214, 132, 132], bot: [255, 190, 140], sunX: 320, sunY: 215, sun: 1, moonX: 1290, moonY: 250, moon: 0, stars: 0.15, tint: 0.4, night: 0.3, lamps: 0.4 },
};

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const mix = (a, b, t) => {
  const out = {};
  for (const k of Object.keys(a)) out[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], t)) : lerp(a[k], b[k], t);
  return out;
};
const rgb = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;

export class DayNight {
  constructor(stage) {
    this.stage = stage;
    this.el = {
      sky: stage.querySelector('.sky'),
      sun: stage.querySelector('.sun'),
      moon: stage.querySelector('.moon'),
      stars: stage.querySelector('.stars'),
      tint: stage.querySelector('.tint'),
      night: stage.querySelector('.night'),
      lights: stage.querySelector('.lights'),
      glows: stage.querySelector('.glows'),
    };
    this.state = 'day';
    this.values = { ...KEYS.day };
    this.queue = [];
    this.raf = 0;
    this.apply(this.values);
  }

  /** Passe immédiatement (sans animation) à un état — ex. à la reconnexion. */
  snap(state) {
    cancelAnimationFrame(this.raf);
    this.queue = [];
    this.state = state;
    this.values = { ...KEYS[state] };
    this.apply(this.values);
  }

  /** Avance dans le cycle jusqu'à `target` en passant par les états intermédiaires. */
  goTo(target, segmentMs = 3400) {
    if (!KEYS[target]) return;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.state;
    if (last === target) return;
    let i = CYCLE.indexOf(last);
    let guard = 0;
    while (CYCLE[i] !== target && guard++ < 4) {
      i = (i + 1) % CYCLE.length;
      this.queue.push(CYCLE[i]);
    }
    this.segmentMs = segmentMs;
    if (!this.raf) this.#next();
  }

  #next() {
    const target = this.queue.shift();
    if (!target) {
      this.raf = 0;
      return;
    }
    const from = { ...this.values };
    const to = KEYS[target];
    // Lever / coucher : un peu plus longs, pour bien voir le soleil bouger.
    const dur = target === 'night' || target === 'day' ? this.segmentMs * 1.15 : this.segmentMs;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      this.values = mix(from, to, ease(t));
      this.apply(this.values);
      if (t < 1) this.raf = requestAnimationFrame(step);
      else {
        this.state = target;
        this.stage.dataset.sky = target;
        this.#next();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  apply(v) {
    const e = this.el;
    e.sky.style.background = `linear-gradient(180deg, ${rgb(v.top)} 0%, ${rgb(v.mid)} 16%, ${rgb(v.bot)} 27%)`;
    e.sun.style.transform = `translate(${v.sunX}px, ${v.sunY}px)`;
    e.sun.style.opacity = v.sun;
    e.moon.style.transform = `translate(${v.moonX}px, ${v.moonY}px)`;
    e.moon.style.opacity = v.moon;
    e.stars.style.opacity = v.stars;
    e.tint.style.opacity = v.tint;
    e.night.style.opacity = v.night;
    e.lights.style.opacity = v.lamps;
    e.glows.style.opacity = v.lamps;
    this.stage.style.setProperty('--night', v.night.toFixed(3));
  }
}
