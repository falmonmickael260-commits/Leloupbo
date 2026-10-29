import { reducedMotion } from '../juice.js';
export const SPECTERS = ['veil', 'pilgrim', 'sentinel'];

/** Apparitions environnementales indépendantes des rôles, morts et canaux privés. */
export class SpectralVillage {
  constructor(stage) {
    this.layer = document.createElement('div'); this.layer.className = 'specter-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    stage.insertBefore(this.layer, stage.querySelector('.pions'));
    this.night = false; this.variant = 0;
    this.onVisibility = () => { this.clear(); if (this.night && !document.hidden && !reducedMotion()) this.schedule(); };
    document.addEventListener('visibilitychange', this.onVisibility);
  }
  setNight(night) {
    this.night = night;
    if (!night || document.hidden || reducedMotion()) { this.clear(); return; }
    if (!this.timer) this.schedule(5000);
  }
  schedule(delay = 12000 + Math.random() * 14000) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; if (this.night) { this.appear(); this.schedule(); } }, delay);
  }
  appear(variant = this.variant++ % SPECTERS.length) {
    if (!this.night || document.hidden || reducedMotion() || this.layer.childElementCount >= 2) return null;
    const el = document.createElement('div'); el.className = 'village-specter';
    el.style.left = `${38 + Math.random() * 24}%`; el.style.top = `${37 + Math.random() * 15}%`;
    el.style.width = `${65 + Math.random() * 35}px`;
    const img = document.createElement('img'); img.src = `/assets/specters/${SPECTERS[variant % SPECTERS.length]}.png`; img.alt = ''; img.draggable = false;
    el.appendChild(img); this.layer.appendChild(el);
    this.onAppear?.();
    const dx = (Math.random() < .5 ? -1 : 1) * (35 + Math.random() * 35);
    const animation = el.animate([
      {opacity:0, transform:'translate(0, 12px)'},
      {opacity:.33, transform:`translate(${dx * .2}px, 0)`,offset:.25},
      {opacity:.28, transform:`translate(${dx * .7}px, -14px)`,offset:.7},
      {opacity:0, transform:`translate(${dx}px, -28px)`},
    ], {duration:14000 + Math.random() * 5000,easing:'ease-in-out',fill:'both'});
    animation.finished.then(() => el.remove(), () => el.remove());
    return el;
  }
  clear() { clearTimeout(this.timer); this.timer = null; for (const el of this.layer.children) el.getAnimations().forEach(a => a.cancel()); this.layer.replaceChildren(); }
  destroy() { this.clear(); this.layer.remove(); document.removeEventListener('visibilitychange', this.onVisibility); }
}
