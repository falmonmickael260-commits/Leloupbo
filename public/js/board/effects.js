import { reducedMotion } from '../juice.js';

export function deathPresentation(current, previous) {
  if (previous?.phase?.id === 'HUNTER_SHOT') return 'shot';
  if (previous?.phase?.id === 'VOTE_RESULT' || current?.phase?.id === 'VOTE_RESULT') return 'vote';
  if (current?.phase?.id === 'SUNRISE' || previous?.phase?.sky === 'night') return 'night';
  return 'spirit';
}

/** VFX éphémères : seulement des positions et événements déjà publics. */
export class VillageEffects {
  constructor(stage, layer) { this.stage = stage; this.layer = layer; this.generation = 0; }
  clear() { this.generation++; for (const el of this.layer.querySelectorAll('[data-vfx]')) el.remove(); }
  at(point, kind, duration = 1800) {
    if (!point || document.hidden) return;
    const el = document.createElement('div'); el.dataset.vfx = kind;
    el.className = `vfx vfx-${kind}${reducedMotion() ? ' still' : ''}`;
    el.style.left = `${point.x}px`; el.style.top = `${point.y}px`;
    el.innerHTML = '<i class="vfx-ring"></i><i class="vfx-column"></i>' + Array.from({length: reducedMotion() ? 0 : 9}, (_, i) => `<b style="--i:${i};--angle:${i * 40}deg"></b>`).join('');
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), reducedMotion() ? 400 : duration);
    return el;
  }
  eliminate(point, kind) { this.at(point, kind === 'vote' ? 'verdict' : kind === 'shot' ? 'impact' : 'soul', 2200); }
  potion(point, kind) { this.at(point, kind === 'heal' ? 'heal' : 'potion', 1700); }
  async shot(a, b, shooter, sound) {
    if (!a || !b) return;
    const generation = this.generation;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    shooter?.classList.add('hunter-ready');
    shooter?.style.setProperty('--aim-facing', b.x < a.x ? '-1' : '1');
    try {
      sound('rack');
      await new Promise(r => setTimeout(r, reducedMotion() ? 80 : 720));
      if (generation !== this.generation) return;
      shooter?.classList.add('hunter-recoil');
      const muzzle = { x: a.x + Math.cos(angle) * 48, y: a.y + Math.sin(angle) * 48 };
      this.at(muzzle, 'muzzle', 550);
      sound('shot'); // même instant que le flash ; aucun téléchargement au moment du tir
      if (!reducedMotion()) {
        const tracer = document.createElement('div'); tracer.dataset.vfx = 'tracer'; tracer.className = 'vfx-tracer';
        tracer.style.left = `${muzzle.x}px`; tracer.style.top = `${muzzle.y}px`;
        tracer.style.width = `${Math.hypot(b.x - muzzle.x, b.y - muzzle.y)}px`;
        tracer.style.transform = `rotate(${angle}rad)`;
        this.layer.appendChild(tracer); setTimeout(() => tracer.remove(), 250);
        this.at(muzzle, 'smoke', 1500);
      }
      await new Promise(r => setTimeout(r, reducedMotion() ? 80 : 220));
      if (generation === this.generation) this.at(b, 'impact', 1000);
    } finally { shooter?.classList.remove('hunter-ready', 'hunter-recoil'); }
  }
}
