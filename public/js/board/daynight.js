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
    this.raf = 0;
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
    // Signale le début de chaque segment animé (ex. coucher du soleil → bruitage de la meute).
    this.onSegment?.(this.state, target);
    // Lever / coucher : un peu plus longs, pour bien voir le soleil bouger.
    const dur = target === 'night' || target === 'day' ? this.segmentMs * 1.15 : this.segmentMs;
    // Aucun calque graphique séparé (sur téléphone, les calques de la taille du plateau saturent
    // la mémoire graphique et l'écran clignote) : tout change par petites étapes (~15 par seconde),
    // et seulement quand la valeur visible change.
    const t0 = performance.now();
    let lastSky = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      this.values = mix(from, to, ease(t));
      if (t >= 1) {
        this.apply(this.values);
        this.state = target;
        this.stage.dataset.sky = target;
        this.#next();
        return;
      }
      if (now - lastSky > 66) {
        lastSky = now;
        this.apply(this.values);
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Ciel (dégradé), couleurs de page et luminosité des personnages. */
  applySky(v) {
    const e = this.el;
    e.sky.style.background = `linear-gradient(180deg, ${rgb(v.top)} 0%, ${rgb(v.mid)} 16%, ${rgb(v.bot)} 27%)`;
    // Couleur du haut du ciel : prolonge le ciel au-dessus du plateau (marge du haut sur téléphone).
    // Variables de page : changées seulement quand la couleur change vraiment (sinon toute la
    // page est recalculée).
    const q = (c) => rgb(c.map((x) => Math.round(x / 8) * 8)); // paliers de couleur (invisibles)
    const top = q(v.top);
    const mid = q(v.mid);
    if (top !== this.lastTop || mid !== this.lastMid) {
      this.lastTop = top;
      this.lastMid = mid;
      // Posées sur le plateau lui-même (propriétés non héritées : rien d'autre n'est recalculé).
      const host = this.stage.parentElement ?? document.documentElement;
      host.style.setProperty('--sky-top', top);
      host.style.setProperty('--sky-mid', mid);
    }
    // --night règle les filtres de TOUS les personnages : mise à jour par paliers (≈ 10 par transition).
    const night = Math.round(v.night * 10) / 10;
    if (night !== this.lastNight) {
      this.lastNight = night;
      this.stage.style.setProperty('--night', night.toFixed(1));
    }
  }

  /** Pose un style seulement s'il change (évite tout recalcul inutile). */
  set(el, prop, value) {
    const key = `__${prop}`;
    if (el[key] === value) return;
    el[key] = value;
    el.style[prop] = value;
  }

  apply(v) {
    const e = this.el;
    this.applySky(v);
    const r = (x) => (Math.round(x * 25) / 25).toFixed(2); // opacités par paliers (invisibles)
    this.set(e.sun, 'transform', `translate(${Math.round(v.sunX)}px, ${Math.round(v.sunY)}px)`);
    this.set(e.sun, 'opacity', r(v.sun));
    this.set(e.moon, 'transform', `translate(${Math.round(v.moonX)}px, ${Math.round(v.moonY)}px)`);
    this.set(e.moon, 'opacity', r(v.moon));
    this.set(e.stars, 'opacity', r(v.stars));
    this.set(e.tint, 'opacity', r(v.tint));
    this.set(e.night, 'opacity', r(v.night));
    this.set(e.lights, 'opacity', r(v.lamps));
    this.set(e.glows, 'opacity', r(v.lamps));
  }
}
