/**
 * Plateau 2D : décor fixe + calques jour/nuit + pions des joueurs.
 *
 * Le plateau ne connaît AUCUNE règle : il affiche ce que dit la vue serveur
 * (vivant/mort, qui a la parole, cibles autorisées) et remonte les clics.
 * Repère interne fixe 1536×1024, mis à l'échelle selon l'écran.
 */
import { characterSVG } from '../art/characters.js';
import { DayNight } from './daynight.js';

export const BOARD_W = 1536;
export const BOARD_H = 1024;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MIC_ON = '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke-width="2.4"/></svg>';
const MIC_OFF = '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke-width="2.4"/><path d="M4 3l16 18" stroke-width="2.8"/></svg>';

export class Board extends EventTarget {
  constructor(root) {
    super();
    this.root = root;
    this.pions = new Map();
    this.layout = new Map();
    this.numbers = new Map();
    this.square = { cx: 0.5, cy: 0.552, rx: 0.247, ry: 0.234 };
    this.mode = 'contain';
    root.innerHTML = `
      <div class="stage" data-sky="day">
        <div class="sky"><div class="stars"></div><div class="sun"></div><div class="moon"></div></div>
        <img class="village" src="/assets/village.svg" alt="Le Village des Blackops" draggable="false"/>
        <div class="tint"></div>
        <div class="night"></div>
        <img class="lights" src="/assets/village-lights.svg" alt="" draggable="false"/>
        <div class="glows"></div>
        <div class="pions"></div>
        <div class="fx"></div>
      </div>`;
    this.stage = root.querySelector('.stage');
    this.pionLayer = root.querySelector('.pions');
    this.fx = root.querySelector('.fx');
    this.stars();
    this.daynight = new DayNight(this.stage);
    // Le jour bascule vers la nuit : la meute hurle au loin pendant le coucher du soleil.
    this.daynight.onSegment = (from, to) => {
      if (from === 'day' && to === 'sunset') this.dispatchEvent(new CustomEvent('sfx', { detail: 'dusk' }));
    };
    this.loadLights();
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(root);
  }

  stars() {
    const el = this.stage.querySelector('.stars');
    let html = '';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * BOARD_W;
      const y = Math.random() * 230;
      const s = Math.random() < 0.15 ? 3.5 : 2;
      html += `<i style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${s}px;height:${s}px"></i>`;
    }
    el.innerHTML = html;
  }

  async loadLights() {
    try {
      // Décor fourni (ex. ?decor=blackops → /assets/decor/blackops.json), sinon le village dessiné.
      const decor = new URLSearchParams(location.search).get('decor');
      const url = decor && /^[a-z0-9-]+$/i.test(decor) ? `/assets/decor/${decor}.json` : '/assets/lights.json';
      const data = await (await fetch(url)).json();
      if (data.image) {
        for (const [sel, src] of [['.village', data.image], ['.lights', data.lightsImage]]) {
          const img = this.stage.querySelector(sel);
          img.style.objectFit = data.fit ?? 'fill';
          img.style.objectPosition = '50% 100%';
          if (src) img.src = src;
        }
        this.stage.classList.add('custom-decor');
      }
      this.square = data.square;
      const W = data.width;
      // Halos lumineux (fenêtres, lanternes, feu) visibles la nuit.
      this.stage.querySelector('.glows').innerHTML = data.lights
        .map((l) => {
          const r = l.r * W;
          return `<i class="glow ${l.kind}" style="left:${(l.x * W - r).toFixed(0)}px;top:${(l.y * data.height - r).toFixed(0)}px;width:${(r * 2).toFixed(0)}px;height:${(r * 2).toFixed(0)}px"></i>`;
        })
        .join('');
      // L'obscurité est « percée » autour des sources de lumière.
      const holes = data.lights
        .filter((l) => l.kind !== 'window')
        .map((l) => `radial-gradient(circle ${(l.r * W * (l.kind === 'fire' ? 0.62 : l.kind === 'sign' ? 0.85 : 0.42)).toFixed(0)}px at ${(l.x * 100).toFixed(2)}% ${(l.y * 100).toFixed(2)}%, rgba(0,0,0,.35) 0%, #000 100%)`);
      const night = this.stage.querySelector('.night');
      night.style.maskImage = night.style.webkitMaskImage = holes.join(',');
      night.style.maskComposite = 'intersect';

    } catch {
      /* les lumières sont décoratives */
    }
    // La place (cercle des joueurs) vient d'être chargée : on replace les pions et le cadrage.
    this.layoutKey = null;
    this.fit();
    if (this.lastView) this.update(this.lastView);
  }

  /** Mise à l'échelle : plateau entier (ordinateur) ou recadré sur la place (mobile portrait). */
  fit() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    let s;
    let x;
    let y;
    const portrait = h > w * 1.05;
    if (portrait) {
      // Mobile : on cadre la place centrale (cercle des joueurs sur toute la largeur).
      s = Math.min(h / BOARD_H, w / 760);
      const cx = this.square.cx * BOARD_W;
      const cy = this.square.cy * BOARD_H + 20;
      x = Math.min(0, Math.max(w - BOARD_W * s, w / 2 - cx * s));
      // Plateau calé en bas : l'éventuelle marge du haut accueille la phase et le narrateur.
      y = BOARD_H * s <= h ? h - BOARD_H * s : Math.min(0, Math.max(h - BOARD_H * s, h * 0.55 - cy * s));
    } else {
      s = Math.min(w / BOARD_W, h / BOARD_H);
      if (this.mode === 'cover') s = Math.max(w / BOARD_W, h / BOARD_H);
      x = (w - BOARD_W * s) / 2;
      y = (h - BOARD_H * s) / 2;
    }
    this.scale = s;
    // Position du haut du plateau à l'écran : l'interface mobile se place au-dessus.
    document.documentElement.style.setProperty('--board-top', `${Math.max(0, Math.round(y + this.root.getBoundingClientRect().top))}px`);
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    this.stage.style.setProperty('--s', s);
  }

  setSky(sky, animate = true) {
    const target = sky === 'moon' ? 'night' : sky;
    if (animate) this.daynight.goTo(target);
    else this.daynight.snap(target);
  }

  /** Position des pions sur une ellipse autour de la place, « moi » en bas. */
  computeLayout(players, meId) {
    const n = players.length;
    const sorted = [...players].sort((a, b) => a.seat - b.seat);
    const meIdx = Math.max(0, sorted.findIndex((p) => p.id === meId));
    const cx = this.square.cx * BOARD_W;
    const cy = this.square.cy * BOARD_H + 20;
    const rx = this.square.rx * BOARD_W * 0.8;
    const ry = this.square.ry * BOARD_H * 0.78;
    const size = n > 14 ? 0.78 : n > 10 ? 0.88 : 1;
    this.layout.clear();
    sorted.forEach((p, i) => {
      const a = Math.PI / 2 + ((i - meIdx) / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      const depth = 0.82 + 0.3 * ((y - (cy - ry)) / (2 * ry));
      this.layout.set(p.id, { x, y, k: depth * size });
    });
  }

  /**
   * Met à jour les pions à partir de la vue (+ infos d'interface : sélection,
   * joueurs qui parlent réellement d'après le micro).
   */
  update(v, ui = {}) {
    this.lastView = v;
    if (!v) return;
    const key = `${v.players.map((p) => `${p.id}:${p.seat}`).join(',')}|${v.me.id}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.computeLayout(v.players, v.me.id);
      this.numbers = playerNumbers(v.players);
    }
    const prompt = v.prompt;
    // Choix de la meute (visible uniquement des loups, pendant leur phase).
    const wolfPicks = new Map();
    if (prompt?.action === 'wolf_vote') for (const w of prompt.info?.packVotes ?? []) if (w.targetId) wolfPicks.set(w.targetId, (wolfPicks.get(w.targetId) ?? 0) + 1);
    const canTarget = prompt && (!prompt.submitted || prompt.canChange) && prompt.maxTargets > 0;
    const seen = new Set();
    const pack = new Set((v.me.pack ?? []).map((w) => w.id));
    const running = v.status === 'running';
    for (const p of v.players) {
      seen.add(p.id);
      let el = this.pions.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'pion';
        el.dataset.id = p.id;
        el.innerHTML = `<div class="halo"></div><div class="figure"></div><div class="tomb"></div><div class="plate"><span class="mic"></span><span class="pnum"></span><span class="pname"></span><span class="badges"></span><button class="tagbox" type="button"></button></div><div class="wave"><i></i><i></i><i></i><i></i></div><div class="mark"></div><div class="paw"></div>`;
        // Étiquette personnelle : son propre bouton, qui ne déclenche jamais l'action sur le joueur.
        el.querySelector('.tagbox').addEventListener('click', (e) => {
          e.stopPropagation();
          this.dispatchEvent(new CustomEvent('tag', { detail: p.id }));
        });
        el.addEventListener('click', () => {
          if (el.classList.contains('targetable')) this.dispatchEvent(new CustomEvent('pick', { detail: p.id }));
        });
        this.pionLayer.appendChild(el);
        this.pions.set(p.id, el);
      }
      const pos = this.layout.get(p.id);
      if (pos) {
        el.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px) scale(${pos.k.toFixed(3)})`;
        el.style.zIndex = String(Math.round(pos.y));
      }
      const pose = ui.aiming === p.id ? 'aim' : 'idle';
      const figKey = `${p.avatar}|${pose}`;
      if (el.dataset.fig !== figKey) {
        el.dataset.fig = figKey;
        el.querySelector('.figure').innerHTML = characterSVG(p.avatar, { pose, title: p.name });
      }
      el.querySelector('.pname').textContent = p.name;
      el.querySelector('.pnum').textContent = String(this.numbers.get(p.id) ?? '');
      // Étiquette personnelle (visible par moi seul) — pendant la partie.
      const tag = v.myTags?.[p.id] ?? '';
      const tagBox = el.querySelector('.tagbox');
      tagBox.style.display = v.status === 'lobby' ? 'none' : '';
      if (tagBox.dataset.text !== tag) {
        tagBox.dataset.text = tag;
        tagBox.textContent = tag || '🏷️';
        tagBox.classList.toggle('empty', !tag);
        tagBox.title = tag ? `Ton étiquette : ${tag} (visible par toi seul)` : 'Ajouter une étiquette (visible par toi seul)';
      }
      const badges = [];
      if (p.isCaptain) badges.push('<b title="Capitaine">👑</b>');
      if (v.me.lover?.id === p.id) badges.push('<b title="Votre amoureux">❤️</b>');
      if (pack.has(p.id) && !p.isMe) badges.push('<b title="Membre de la meute">🐺</b>');
      // Résultats de la Voyante : visibles uniquement par elle (issus de ses messages privés).
      const seerResult = ui.seerKnow?.get(p.id);
      if (seerResult) badges.push(`<b class="seer-badge ${seerResult === 'LOUP' ? 'wolf' : 'civil'}" title="Vu par la Voyante">🔮${seerResult === 'LOUP' ? '🐺' : '✅'}</b>`);
      if (p.isBot) badges.push('<b title="Bot">🤖</b>');
      if (!p.connected && !p.isBot) badges.push('<b title="Déconnecté">📴</b>');
      el.querySelector('.badges').innerHTML = badges.join('');
      // Micro : autorisé (vert) ou coupé (barré), selon les permissions serveur.
      const micOn = running && p.alive !== false && (p.isMe ? v.voice.canSpeak : v.voice.hearFrom.includes(p.id));
      const mic = el.querySelector('.mic');
      mic.innerHTML = micOn ? MIC_ON : MIC_OFF;
      mic.className = `mic ${micOn ? 'on' : 'off'}`;
      mic.style.display = running || v.status === 'lobby' ? '' : 'none';

      el.classList.toggle('me', p.isMe);
      el.classList.toggle('floor', v.phase.speakerId === p.id);
      el.classList.toggle('talking', !!ui.talking?.has(p.id) && micOn);
      el.classList.toggle('targetable', !!(canTarget && prompt.targets.includes(p.id)));
      el.classList.toggle('selected', !!ui.selected?.includes(p.id));
      el.classList.toggle('voted', !!prompt?.current?.includes(p.id));
      el.classList.toggle('subject', v.phase.subjectId === p.id);
      const picks = wolfPicks.get(p.id) ?? 0;
      el.querySelector('.paw').textContent = picks ? `🐺${picks > 1 ? ` ×${picks}` : ''}` : '';
      el.classList.toggle('wolf-pick', picks > 0);
      el.classList.toggle('offline', !p.connected && !p.isBot);
      // Mort : animation de chute une seule fois, puis état « mort » persistant.
      // Une mort « différée » reste debout le temps d'une animation (tir du Chasseur).
      const deferred = !!ui.deferDeath?.has(p.id);
      const shownAlive = p.alive || deferred;
      if (!shownAlive && !el.classList.contains('dead')) {
        if (el.dataset.alive === '1') {
          el.classList.add('dying');
          setTimeout(() => el.classList.remove('dying'), 1600);
        }
        el.classList.add('dead');
      }
      if (shownAlive) el.classList.remove('dead', 'dying');
      el.dataset.alive = shownAlive ? '1' : '0';
    }
    for (const [id, el] of this.pions) {
      if (!seen.has(id)) {
        el.remove();
        this.pions.delete(id);
      }
    }
  }

  center(id) {
    const pos = this.layout.get(id);
    return pos ? { x: pos.x, y: pos.y - 70 * pos.k } : null;
  }

  /** Animation du tir du Chasseur : visée → projectile → impact. */
  async hunterShot(shooterId, targetId) {
    const a = this.center(shooterId);
    const b = this.center(targetId);
    if (!a || !b) return;
    await wait(650);
    // Le coup part : bruitage au moment exact du flash, avant le projectile.
    this.dispatchEvent(new CustomEvent('sfx', { detail: 'shot' }));
    const flash = document.createElement('div');
    flash.className = 'muzzle';
    flash.style.transform = `translate(${a.x + 40}px, ${a.y - 10}px)`;
    this.fx.appendChild(flash);
    const bullet = document.createElement('div');
    bullet.className = 'bullet';
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    bullet.style.transform = `translate(${a.x}px, ${a.y}px) rotate(${ang}deg)`;
    this.fx.appendChild(bullet);
    await wait(30);
    bullet.style.transition = 'transform 380ms cubic-bezier(.3,.0,.6,1)';
    bullet.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${ang}deg)`;
    await wait(400);
    bullet.remove();
    flash.remove();
    this.boom(b.x, b.y, 'PAN !');
  }

  /** Révélation des votes : une flèche de chaque votant vers sa cible + nombre de voix. */
  showVotes(votes) {
    const key = JSON.stringify(votes ?? []);
    if (key === this.votesKey) return;
    this.votesKey = key;
    this.fx.querySelector('.vote-arrows')?.remove();
    this.fx.querySelectorAll('.vote-count').forEach((e) => e.remove());
    if (!votes?.length) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'vote-arrows');
    svg.setAttribute('viewBox', `0 0 ${BOARD_W} ${BOARD_H}`);
    svg.innerHTML = `<defs><marker id="vote-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#e0533d" stroke="#1b130e" stroke-width="1.5"/></marker></defs>`;
    const counts = new Map();
    votes.forEach((vt, i) => {
      const a = this.center(vt.voterId);
      const b = this.center(vt.targetId);
      if (!a || !b) return;
      counts.set(vt.targetId, (counts.get(vt.targetId) ?? 0) + vt.weight);
      // Légère courbe pour que les flèches croisées restent lisibles.
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.18;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.18 - 30;
      const d = `M${a.x.toFixed(0)} ${(a.y - 20).toFixed(0)} Q${mx.toFixed(0)} ${my.toFixed(0)} ${b.x.toFixed(0)} ${(b.y - 30).toFixed(0)}`;
      svg.insertAdjacentHTML(
        'beforeend',
        `<path d="${d}" class="vote-line-ink" style="animation-delay:${i * 120}ms"/><path d="${d}" class="vote-line" marker-end="url(#vote-head)" style="animation-delay:${i * 120}ms"/>`,
      );
    });
    this.fx.appendChild(svg);
    for (const [id, n] of counts) {
      const c = this.center(id);
      if (!c) continue;
      const el = document.createElement('div');
      el.className = 'vote-count';
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y - 175}px`;
      el.textContent = `🗳️ ${n}`;
      this.fx.appendChild(el);
    }
  }

  /** Résultat de la Voyante affiché au-dessus du personnage (LOUP / CIVIL). */
  revealSeer(id, result) {
    const c = this.center(id);
    if (!c) return;
    const el = document.createElement('div');
    const wolf = result === 'LOUP';
    el.className = `seer-reveal ${wolf ? 'wolf' : 'civil'}`;
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y - 120}px`;
    el.innerHTML = `<div class="seer-card"><span class="seer-icon">${wolf ? '🐺' : '🧑‍🌾'}</span><b>${wolf ? 'LOUP' : 'CIVIL'}</b></div>`;
    this.fx.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  boom(x, y, text) {
    const el = document.createElement('div');
    el.className = 'boom';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `<svg viewBox="-60 -60 120 120"><path d="${starPath()}" fill="#ffd552" stroke="#1b130e" stroke-width="4" stroke-linejoin="round"/></svg><span>${esc(text)}</span>`;
    this.fx.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}

function starPath() {
  let d = '';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 30 : 56;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  }
  return `${d}Z`;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Numéro de chaque joueur (1, 2, 3…) selon sa place autour de la table — identique pour tous. */
export function playerNumbers(players) {
  return new Map([...players].sort((a, b) => a.seat - b.seat).map((p, i) => [p.id, i + 1]));
}
