/**
 * Narrateur (encadrés de narration façon BD) et révélation animée des cartes.
 */
import { cardBackSVG, cardSVG } from '../art/cards.js';

export class Narrator {
  constructor(el) {
    this.el = el;
    this.queue = [];
    this.busy = false;
  }

  /** apparition → affichage → disparition ; les messages s'enchaînent sans se chevaucher. */
  say(text, kind = 'info', { urgent = false } = {}) {
    if (!text) return;
    if (urgent) {
      // Nouvelle phase : les messages de phase en attente sont périmés.
      this.queue = this.queue.filter((m) => !m.phase);
      this.current?.abort();
    }
    if (this.queue.length > 4) this.queue.shift();
    this.queue.push({ text, kind, phase: urgent });
    if (!this.busy) this.#next();
  }

  clear() {
    this.queue = [];
  }

  /** Coupe tout de suite la narration en cours (ex. écran de victoire : le titre doit être visible). */
  hush() {
    this.queue = [];
    this.current?.abort();
    for (const box of this.el.querySelectorAll('.narration')) {
      box.classList.remove('in');
      box.classList.add('out');
      setTimeout(() => box.remove(), 600);
    }
  }

  async #next() {
    const item = this.queue.shift();
    if (!item) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const box = document.createElement('div');
    box.className = `narration ${item.kind}`;
    box.textContent = item.text;
    this.el.appendChild(box);
    requestAnimationFrame(() => box.classList.add('in'));
    const hold = Math.min(4200, 1600 + item.text.length * 45) / (this.queue.length ? 1.6 : 1);
    await new Promise((r) => {
      const t = setTimeout(r, hold);
      this.current = { abort: () => (clearTimeout(t), r()) };
    });
    this.current = null;
    box.classList.remove('in');
    box.classList.add('out');
    setTimeout(() => box.remove(), 600);
    await new Promise((r) => setTimeout(r, 350));
    this.#next();
  }
}

/**
 * Distribution du rôle, avec suspense :
 *   la carte apparaît (dos) → elle tourne de plus en plus vite en faisant défiler les rôles
 *   de la partie → elle ralentit → elle s'arrête sur MON rôle (éclat de lumière) →
 *   elle se range dans l'interface.
 * `pool` : rôles en jeu ({ id, name }) pour le défilement ; `onTick(i, last)` : bruitages.
 */
export async function revealCard(layer, role, slotEl, { pool = [], onTick } = {}) {
  layer.innerHTML = `<div class="reveal-backdrop"></div>
    <div class="reveal-card"><div class="reveal-glow"></div><div class="flip"><div class="face">${cardBackSVG()}</div></div>
    <p class="reveal-caption">Ton rôle secret…</p></div>`;
  layer.classList.add('show');
  // Toucher l'écran accélère la révélation (utile si une action attend déjà, ou pour qui l'a déjà vue).
  let hurry = false;
  let skipNow = () => {};
  const onTap = () => {
    hurry = true;
    skipNow();
  };
  layer.addEventListener('pointerdown', onTap);
  const pause = (ms) => (hurry ? wait(Math.min(ms, 250)) : Promise.race([wait(ms), new Promise((r) => (skipNow = r))]));
  const card = layer.querySelector('.reveal-card');
  const flip = layer.querySelector('.flip');
  const face = layer.querySelector('.face');
  const caption = layer.querySelector('.reveal-caption');
  await wait(60);
  card.classList.add('in');
  await pause(900);

  // Défilement : faces des rôles en jeu (jamais deux fois la même d'affilée), dos intercalé au début.
  const others = pool.filter((r) => r.id !== role.id);
  const choices = others.length ? others : pool.length ? pool : [role];
  const svgs = new Map();
  const svgOf = (r) => {
    if (!svgs.has(r.id)) svgs.set(r.id, cardSVG(r.id, r.name));
    return svgs.get(r.id);
  };
  const turns = 16;
  let prev = '';
  card.classList.add('spinning');
  for (let k = 0; k < turns; k++) {
    const last = k === turns - 1;
    // Rapide au début, puis de plus en plus lent (suspense).
    const t = k / (turns - 1);
    const dur = hurry ? 40 : 70 + 520 * t * t * t;
    await flip.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.02)' }], { duration: dur / 2, easing: 'ease-in' }).finished;
    let html;
    if (last) html = svgOf(role);
    else if (k < 3 && k % 2 === 0) html = cardBackSVG();
    else {
      let r;
      do r = choices[Math.floor(Math.random() * choices.length)];
      while (choices.length > 1 && r.id === prev);
      prev = r.id;
      html = svgOf(r);
    }
    face.innerHTML = html;
    onTick?.(k, last);
    await flip.animate([{ transform: 'scaleX(0.02)' }, { transform: 'scaleX(1)' }], { duration: dur / 2, easing: last ? 'cubic-bezier(.2,1.6,.4,1)' : 'ease-out' }).finished;
  }
  card.classList.remove('spinning');

  // Arrêt sur mon rôle : éclat + rebond.
  card.classList.add('revealed');
  const flash = document.createElement('div');
  flash.className = 'reveal-flash';
  layer.appendChild(flash);
  card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.2,1.4,.4,1)' });
  caption.innerHTML = `Tu es <b>${role.name}</b>`;
  await pause(2600);
  flash.remove();

  // Réduction vers l'emplacement de la carte dans le HUD.
  const target = slotEl?.getBoundingClientRect();
  const from = card.getBoundingClientRect();
  if (target && target.width) {
    const dx = target.left + target.width / 2 - (from.left + from.width / 2);
    const dy = target.top + target.height / 2 - (from.top + from.height / 2);
    const k = target.width / from.width;
    card.style.transition = 'transform 700ms cubic-bezier(.6,0,.3,1), opacity 700ms';
    card.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
  } else card.style.opacity = '0';
  layer.querySelector('.reveal-backdrop').style.opacity = '0';
  await wait(720);
  layer.removeEventListener('pointerdown', onTap);
  layer.classList.remove('show');
  layer.innerHTML = '';
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
