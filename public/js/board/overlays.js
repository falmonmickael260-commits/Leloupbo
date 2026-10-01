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
 * apparition → révélation (retournement) → affichage → réduction vers
 * l'emplacement de la carte dans l'interface → disparition.
 */
export async function revealCard(layer, role, slotEl) {
  layer.innerHTML = `<div class="reveal-backdrop"></div>
    <div class="reveal-card"><div class="flip"><div class="face back">${cardBackSVG()}</div><div class="face front">${cardSVG(role.id, role.name)}</div></div>
    <p class="reveal-caption">Votre rôle secret</p></div>`;
  layer.classList.add('show');
  const card = layer.querySelector('.reveal-card');
  const flip = layer.querySelector('.flip');
  await wait(60);
  card.classList.add('in');
  await wait(700);
  flip.classList.add('flipped');
  await wait(2600);
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
  layer.classList.remove('show');
  layer.innerHTML = '';
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
