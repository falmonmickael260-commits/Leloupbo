/**
 * Interface du Village des Blackops (direction artistique BD).
 *
 * Ce fichier ne contient AUCUNE règle de jeu : il affiche la vue envoyée par
 * le serveur (plateau, interface, narrateur, cartes) et renvoie des intentions
 * via GameClient. Toute validation reste côté serveur.
 */
import { CHARACTERS, characterSVG } from './art/characters.js';
import { cardBackSVG, cardSVG, seerCardSVG } from './art/cards.js';
import { Board, playerNumbers, wait } from './board/board.js';
import { Narrator, revealCard } from './board/overlays.js';
import { GameClient } from './gameClient.js';
import { profiles } from './platform/profiles.js';
import { Voice } from './voiceManager.js';
import { MAPS } from './maps.js';
import * as sfx from './sfx.js';
import { impact, initJuice, reducedMotion, setReducedMotion, vibrate } from './juice.js';

const params = new URLSearchParams(location.search);
const profile = params.get('profile') || 'default';
const client = new GameClient({ profile });
const voice = new Voice(client);
const board = new Board(document.getElementById('board'));
const narrator = new Narrator(document.getElementById('narrator'));
window.blackops = { client, voice, board };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nameOf = (v, id) => v.players.find((p) => p.id === id)?.name ?? '?';
/** « 3. Marie » : nom précédé du numéro du joueur. */
const numName = (v, id) => {
  const n = playerNumbers(v.players).get(id);
  return n ? `${n}. ${nameOf(v, id)}` : nameOf(v, id);
};
const time = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const NIGHT_PHASES = new Set(['NIGHT_START', 'THIEF_PHASE', 'CUPID_PHASE', 'WEREWOLF_PHASE', 'WHITE_WOLF_PHASE', 'SEER_PHASE', 'SALVATION_PHASE', 'WITCH_PHASE', 'NIGHT_RESOLUTION']);
const TEAM = { village: 'Village', wolves: 'Loups-Garous', white_wolf: 'Solitaire', lovers: 'Amoureux', none: '—' };

// État purement visuel (jamais envoyé au serveur).
const ui = {
  selected: [],
  option: null,
  promptKey: '',
  tab: 'events',
  talking: new Set(),
  deferDeath: new Set(),
  aiming: null,
  prev: null,
  lastAnn: null,
  chatOpen: false,
  deadOpen: false,
  seen: { events: 0, private: 0, village: 0, wolves: 0, dead: 0 },
  revealing: false,
};

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 3500);
}
const safe = (p) => Promise.resolve(p).catch((e) => toast(e.message));

// ================================================================== ACCUEIL (profils de la plateforme)
$('name').value = localStorage.getItem('blackops:name') || '';
$('join-code').value = params.get('code') || '';
let addingPlayer = false;

/** Pseudo utilisé en partie : celui du profil, ou celui saisi en invité. */
const myName = () => {
  const active = profiles.active();
  if (active) return active.name;
  const n = $('name').value.trim();
  localStorage.setItem('blackops:name', n);
  if (!n) throw new Error('Choisis un pseudo.');
  return n;
};

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const statsLine = (st) => `<div><b>${st.games}</b><span>${st.games > 1 ? 'parties' : 'partie'}</span></div><div><b>${st.wins}</b><span>${st.wins > 1 ? 'victoires' : 'victoire'}</span></div><div><b>${st.losses}</b><span>${st.losses > 1 ? 'défaites' : 'défaite'}</span></div>`;

/** Affiche le bon écran : 1re visite, « Qui joue ? », ou « Bonjour X 👋 ». */
function renderHome() {
  const list = profiles.list();
  const active = profiles.active();
  const guest = profiles.isGuest();
  const view = addingPlayer || (!list.length && !guest) ? 'new' : !active && !guest ? 'who' : 'play';
  for (const v of ['new', 'who', 'play']) $(`hv-${v}`).hidden = v !== view;
  if (view === 'new') {
    $('btn-new-cancel').hidden = !list.length && !addingPlayer;
    $('btn-guest').hidden = addingPlayer;
    setTimeout(() => $('new-name').focus(), 50);
  }
  if (view === 'who') {
    $('who-list').innerHTML = list
      .map((p) => `<li><button class="who-item" data-profile="${esc(p.id)}"><span class="who-ico">👤</span><span class="who-name">${esc(p.name)}</span><span class="who-games">${plural(p.games, 'partie')}</span></button></li>`)
      .join('');
    // Nombre de parties à jour (serveur), sans bloquer l'affichage.
    for (const p of list) profiles.stats(p.id).then(() => !$('hv-who').hidden && refreshWhoCounts()).catch(() => {});
  }
  if (view === 'play') {
    $('guest-box').hidden = !guest;
    $('btn-make-profile').hidden = !guest;
    for (const id of ['btn-stats', 'btn-rename']) $(id).hidden = guest;
    $('btn-switch').textContent = guest ? '👥 Choisir un joueur' : '👥 Changer de joueur';
    $('btn-switch').hidden = guest && !list.length;
    if (guest) {
      $('hello-title').textContent = 'Tu joues en invité';
      $('hello-stats').innerHTML = '<p class="hv-note">Tes parties ne sont pas enregistrées.</p>';
    } else {
      $('hello-title').textContent = `Bonjour ${active.name} 👋`;
      $('hello-stats').innerHTML = statsLine({ games: active.games, wins: 0, losses: 0 }).replace(/<b>0<\/b>/g, '<b>…</b>');
      profiles
        .stats(active.id)
        .then((st) => {
          if (profiles.active()?.id !== active.id) return;
          $('hello-title').textContent = `Bonjour ${profiles.active().name} 👋`;
          $('hello-stats').innerHTML = statsLine(st);
        })
        .catch((e) => {
          $('hello-stats').innerHTML = `<p class="hv-note">${e.code === 'NO_PROFILE' ? 'Ce profil est introuvable sur le serveur : tes prochaines parties ne seront pas comptées. Crée un nouveau profil.' : 'Statistiques indisponibles pour le moment.'}</p>`;
        });
    }
  }
}
function refreshWhoCounts() {
  for (const p of profiles.list()) {
    const el = document.querySelector(`[data-profile="${CSS.escape(p.id)}"]`);
    if (el) {
      el.querySelector('.who-name').textContent = p.name;
      el.querySelector('.who-games').textContent = plural(p.games, 'partie');
    }
  }
}

$('new-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('new-name').value.trim();
  if (!name) return toast('Choisis un pseudo.');
  $('btn-new').disabled = true;
  safe(
    profiles
      .create(name)
      .then((p) => {
        addingPlayer = false;
        $('new-name').value = '';
        if (!p.saved) toast('Ce navigateur ne garde pas les données : ton profil sera oublié à la fermeture.');
        renderHome();
      })
      .finally(() => ($('btn-new').disabled = false)),
  );
};
$('btn-guest').onclick = $('btn-guest2').onclick = () => {
  profiles.playAsGuest();
  renderHome();
};
$('btn-new-cancel').onclick = () => {
  addingPlayer = false;
  renderHome();
};
$('btn-add-player').onclick = $('btn-make-profile').onclick = () => {
  addingPlayer = true;
  renderHome();
};
$('who-list').onclick = (e) => {
  const b = e.target.closest('[data-profile]');
  if (!b) return;
  profiles.select(b.dataset.profile);
  renderHome();
};
$('btn-switch').onclick = () => {
  profiles.signOut();
  renderHome();
};
$('btn-rename').onclick = () => {
  const active = profiles.active();
  if (!active) return;
  const name = prompt('Nouveau pseudo :', active.name);
  if (name === null || !name.trim() || name.trim() === active.name) return;
  safe(profiles.rename(active.id, name.trim()).then(renderHome));
};

// Statistiques détaillées (lues sur le serveur : jamais calculées ni modifiables par le navigateur).
let roleNames = null;
$('btn-stats').onclick = () => {
  const active = profiles.active();
  if (!active) return;
  $('stats-title').textContent = active.name;
  $('stats-body').innerHTML = '<p class="hv-note">Chargement…</p>';
  $('stats-modal').hidden = false;
  const names = roleNames ? Promise.resolve(roleNames) : fetch('/api/roles').then((r) => r.json()).then((list) => (roleNames = Object.fromEntries(list.map((r) => [r.id, `${r.emoji} ${r.name}`]))));
  safe(
    Promise.all([profiles.stats(active.id), names.catch(() => ({}))]).then(([st, rn]) => {
      const lg = st.byGame['loup-garou'];
      const camp = (c) => st.byCamp[`loup-garou:${c}`] ?? { games: 0, wins: 0 };
      const rows = Object.entries(st.byRole)
        .filter(([k]) => k.startsWith('loup-garou:'))
        .map(([k, c]) => ({ id: k.slice(11), ...c }))
        .sort((x, y) => y.games - x.games);
      const pct = (w, g) => (g ? `${Math.round((w / g) * 100)} %` : '—');
      $('stats-body').innerHTML = `
        <div class="hello-stats">${statsLine(st)}</div>
        <div class="stats-grid">
          <div><span>Éliminations</span><b>${st.eliminations}</b></div>
          <div><span>Taux de victoire</span><b>${pct(st.wins, st.games)}</b></div>
          <div><span>🐺 Victoires en Loup</span><b>${camp('loup').wins} / ${camp('loup').games}</b></div>
          <div><span>🏡 Victoires en Civil</span><b>${camp('civil').wins} / ${camp('civil').games}</b></div>
        </div>
        ${lg ? '' : '<p class="hv-note">Aucune partie terminée pour l’instant.</p>'}
        ${rows.length ? `<h3 class="stats-h">Par rôle</h3><ul class="stats-roles">${rows.map((r) => `<li><span>${esc(rn[r.id] ?? r.id)}</span><span>${plural(r.games, 'partie')} · ${plural(r.wins, 'victoire')}</span></li>`).join('')}</ul>` : ''}
        ${Object.keys(st.byGame).length > 1 ? `<h3 class="stats-h">Par jeu</h3><ul class="stats-roles">${Object.entries(st.byGame).map(([g, c]) => `<li><span>${esc(g)}</span><span>${plural(c.games, 'partie')} · ${plural(c.wins, 'victoire')}</span></li>`).join('')}</ul>` : ''}`;
    }),
  );
};
$('stats-close').onclick = () => ($('stats-modal').hidden = true);
$('stats-modal').onclick = (e) => e.target === $('stats-modal') && ($('stats-modal').hidden = true);
renderHome();

/**
 * Débloque le son du navigateur pendant le clic (geste exigé par iPhone / Android)
 * et demande l'accès au micro tout de suite, pour que la voix soit prête.
 */
function primeAudio() {
  sfx.unlock();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const ctx = (window.__blackopsAudio ??= new Ctx());
      ctx.resume?.();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    /* sans effet si non supporté */
  }
  navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
}
$('btn-create').onclick = () => {
  primeAudio();
  safe(Promise.resolve().then(() => client.create(myName(), profiles.credentials())));
};
$('btn-join').onclick = () => {
  primeAudio();
  safe(Promise.resolve().then(() => client.join($('join-code').value.trim().toUpperCase(), myName(), profiles.credentials())));
};

// ================================================================== LOBBY
$('btn-add-bot').onclick = () => safe(client.addBot());
$('btn-start').onclick = () => safe(client.start());
$('btn-leave-lobby').onclick = () => safe(client.leave());

// Icônes micro / haut-parleur du lobby : vertes si actives, barrées en rouge si coupées.
const ICON_MIC = '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" fill="none"/>';
const ICON_SPK = '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none"/>';
function audioIcon(paths, on, label) {
  const slash = on ? '' : '<line class="slash" x1="3" y1="3" x2="21" y2="21"/>';
  return `<span class="aud ${on ? 'ok' : 'off'}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24">${paths}${slash}</svg></span>`;
}
function audioIcons(a) {
  const mic = a.connected && a.mic;
  const spk = a.connected && a.speaker;
  return audioIcon(ICON_MIC, mic, mic ? 'Micro actif' : 'Micro coupé') + audioIcon(ICON_SPK, spk, spk ? 'Son actif' : 'Son coupé');
}

function renderLobby(v) {
  // Partie précédente : ce qui s'est passé chaque nuit (ouvert à la demande).
  const logKey = (v.lastNightLog ?? []).join('\n');
  if ($('last-log').dataset.key !== logKey) {
    $('last-log').dataset.key = logKey;
    $('last-log').innerHTML = v.lastNightLog?.length ? `<details class="night-log"><summary>🌙 Partie précédente : ce qui s’est passé chaque nuit</summary><ul>${v.lastNightLog.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>` : '';
  }
  const isHost = v.me.isHost;
  document.querySelectorAll('.host-only').forEach((el) => (el.style.display = isHost ? '' : 'none'));
  document.querySelector('.host-hint').textContent = isHost
    ? 'Tu es l’Hôte : choisis les rôles. La distribution sera aléatoire.'
    : 'Seul l’Hôte peut modifier la composition.';
  $('lobby-code').textContent = v.code;
  $('lobby-count').textContent = `(${v.players.length}/${v.settings.maxPlayers})`;
  const nums = playerNumbers(v.players);
  $('lobby-players').innerHTML = [...v.players]
    .sort((a, b) => a.seat - b.seat)
    .map(
      (p) => `<li data-pid="${esc(p.id)}" class="${ui.talking.has(p.id) ? 'talking' : ''}"><span class="num">${nums.get(p.id)}</span><span class="head">${characterSVG(p.avatar)}</span><span class="grow">${p.isHost ? '⭐ ' : ''}${p.isBot ? '🤖 ' : ''}${esc(p.name)}${p.isMe ? ' <span class="muted">(toi)</span>' : ''}${p.connected ? '' : ' 📴'}${p.audio.diag ? `<small class="diag">${esc(p.audio.diag)}</small>` : ''}</span>
      ${p.isBot ? '' : audioIcons(p.audio)}
      ${isHost && !p.isMe ? `<button class="btn small" data-kick="${esc(p.id)}">Exclure</button>` : ''}</li>`,
    )
    .join('');
  $('lobby-players').querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => safe(client.kick(b.dataset.kick))));

  // Choix du personnage
  const mine = v.players.find((p) => p.isMe)?.avatar;
  const taken = new Set(v.players.filter((p) => !p.isMe).map((p) => p.avatar));
  const grid = $('avatar-grid');
  const gridKey = `${mine}|${[...taken].join(',')}`;
  if (grid.dataset.key !== gridKey) {
    grid.dataset.key = gridKey;
    grid.innerHTML = CHARACTERS.map(
      (c) => `<button class="avatar ${c.id === mine ? 'on' : ''} ${taken.has(c.id) ? 'taken' : ''}" data-avatar="${c.id}" title="${esc(c.name)}">${characterSVG(c.id)}<span>${esc(c.name)}</span></button>`,
    ).join('');
    grid.querySelectorAll('[data-avatar]').forEach((b) => (b.onclick = () => safe(client.request('lobby:avatar', { avatar: b.dataset.avatar }))));
  }

  const s = v.settings;
  const roles = v.roleCatalog.filter((r) => r.distributable && r.id !== 'villager');
  const dis = isHost ? '' : 'disabled';
  const roleRows = roles
    .map((r) => {
      const n = s.roles[r.id] ?? 0;
      const max = r.unique ? 1 : 18;
      // Loups automatiques : le nombre suit la jauge, les boutons sont verrouillés.
      const lock = r.id === 'werewolf' && s.autoWolves ? 'disabled' : '';
      return `<div class="settings-row"><span title="${esc(r.description)}">${r.emoji} ${esc(r.name)}${lock ? ' <small class="muted">(auto)</small>' : ''}</span>
        <span class="counter"><button class="btn small" data-role="${r.id}" data-d="-1" ${dis || lock || (n <= 0 ? 'disabled' : '')}>−</button><span>${n}</span>
        <button class="btn small" data-role="${r.id}" data-d="1" ${dis || lock || (n >= max ? 'disabled' : '')}>+</button></span></div>`;
    })
    .join('');
  const check = (key, label) => `<div class="settings-row"><span>${label}</span><input type="checkbox" data-bool="${key}" ${s[key] ? 'checked' : ''} ${dis}/></div>`;
  // Choix de la map (affiché dès qu'il y en a plusieurs).
  const mapPicker =
    MAPS.length > 1
      ? `<div class="map-picker">${MAPS.map(
          (m) => `<button class="map-opt ${s.map === m.id ? 'on' : ''}" data-map="${m.id}" ${dis}><span class="map-img" style="background-image:url('${m.preview}')"></span><span>${esc(m.name)}</span></button>`,
        ).join('')}</div>`
      : '';
  $('settings').innerHTML = `
    ${mapPicker}
    ${wolfGauge(v.players.length, s, dis)}
    ${roleRows}
    <hr/>
    <div class="settings-row"><span>Joueurs max</span><select data-select="maxPlayers" ${dis}>${Array.from({ length: 15 }, (_, i) => i + 4)
      .map((n) => `<option ${n === s.maxPlayers ? 'selected' : ''}>${n}</option>`)
      .join('')}</select></div>
    <div class="settings-row"><span>Durées</span><select data-select="durationPreset" ${dis}>
      <option value="normal" ${s.durationPreset === 'normal' ? 'selected' : ''}>Normales</option>
      <option value="fast" ${s.durationPreset === 'fast' ? 'selected' : ''}>Rapides (test)</option></select></div>
    <div class="settings-row"><span>Égalité au vote</span><select data-select="tieRule" ${dis}>
      <option value="revote" ${s.tieRule === 'revote' ? 'selected' : ''}>Les ex æquo reparlent puis revote</option>
      <option value="none" ${s.tieRule === 'none' ? 'selected' : ''}>Personne</option>
      <option value="random" ${s.tieRule === 'random' ? 'selected' : ''}>Tirage au sort</option></select></div>
    <div class="settings-row"><span>Voyante sur le Loup-Blanc</span><select data-select="whiteWolfSeerResult" ${dis}>
      <option ${s.whiteWolfSeerResult === 'LOUP' ? 'selected' : ''}>LOUP</option>
      <option ${s.whiteWolfSeerResult === 'CIVIL' ? 'selected' : ''}>CIVIL</option></select></div>
    ${check('captainEnabled', '👑 Élection du Capitaine')}
    ${check('wolvesWinAtParity', '🐺 Victoire des Loups dès que le village ne peut plus gagner')}
    ${check('witchCanSelfSave', 'Sorcière peut se sauver')}
    ${check('witchNoPoisonFirstNight', 'Sorcière : pas de poison la 1re nuit')}
    ${check('witchBothPotionsSameNight', 'Sorcière : les 2 potions la même nuit')}
    ${check('salvateurCanSelfProtect', 'Salvateur peut se protéger')}
    ${check('cupidWinsWithLovers', 'Cupidon gagne avec un couple mixte')}
    ${check('endVoteWhenAllVoted', 'Clore le vote quand tous ont voté')}
    ${check('revealVotes', '🗳️ Montrer qui a voté contre qui au résultat')}`;
  const el = $('settings');
  el.querySelectorAll('[data-role]').forEach(
    (b) => (b.onclick = () => safe(client.updateSettings({ roles: { ...s.roles, [b.dataset.role]: Math.max(0, (s.roles[b.dataset.role] ?? 0) + Number(b.dataset.d)) } }))),
  );
  el.querySelectorAll('[data-map]').forEach((b) => (b.onclick = () => safe(client.updateSettings({ map: b.dataset.map }))));
  el.querySelectorAll('[data-bool]').forEach((c) => (c.onchange = () => safe(client.updateSettings({ [c.dataset.bool]: c.checked }))));
  el.querySelectorAll('[data-select]').forEach(
    (c) => (c.onchange = () => safe(client.updateSettings({ [c.dataset.select]: c.dataset.select === 'maxPlayers' ? Number(c.value) : c.value }))),
  );
  const n = v.players.length;
  const thief = (s.roles.thief ?? 0) > 0;
  const specials = Object.values(s.roles).reduce((a, b) => a + b, 0);
  const villagers = n + (thief ? 2 : 0) - specials;
  $('composition-preview').innerHTML = `${n} joueur(s)${thief ? ' + 2 cartes pour le Voleur' : ''} → ${villagers >= 0 ? `${villagers} Simple(s) Villageois en complément` : '<b style="color:var(--red)">trop de rôles</b>'}. Minimum 4 joueurs.`;
  $('btn-start').disabled = n < 4 || villagers < 0;
}

/** Règle du nombre de loups : 5 à 8 joueurs → 2, 9 à 11 → 3, 12 à 18 → 4 (1 en dessous de 5). */
const wolvesFor = (n) => (n < 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4);

/** Jauge du lobby : nombre de joueurs et nombre de Loups-Garous prévus. */
function wolfGauge(n, s, dis) {
  const wolves = s.autoWolves ? wolvesFor(n) : (s.roles.werewolf ?? 0);
  const brackets = [
    [5, 8, 2],
    [9, 11, 3],
    [12, 18, 4],
  ];
  const scale = brackets
    .map(([a, b, w]) => `<span class="${n >= a && n <= b ? 'on' : ''}">${a}–${b} → ${'🐺'.repeat(w)}</span>`)
    .join('');
  return `<div class="wolf-gauge">
    <div class="g-row"><span class="g-label">👥 Joueurs <b>${n}</b></span><span class="g-dots">${'<i></i>'.repeat(n)}</span></div>
    <div class="g-row"><span class="g-label">🐺 Loups <b>${wolves}</b></span><span class="g-wolves">${'🐺'.repeat(wolves)}</span></div>
    <div class="g-scale">${scale}</div>
    <label class="g-auto"><input type="checkbox" data-bool="autoWolves" ${s.autoWolves ? 'checked' : ''} ${dis}/> Nombre de loups automatique</label>
  </div>`;
}

// ================================================================== MON MICRO (diagnostic)
// Navigateurs intégrés aux applications (WhatsApp, Messenger, Instagram…) : souvent sans micro.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|Line\/|WhatsApp|Messenger|TikTok|musical_ly|; wv\)/i.test(navigator.userAgent);
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

function renderMyVoice() {
  const el = $('my-voice');
  if (!el || client.view?.status !== 'lobby') return;
  const st = voice.state();
  let html;
  if (IN_APP) html = '⚠️ Tu as ouvert le jeu dans une application : le micro n’y marche pas. Ouvre le lien dans <b>Safari</b> ou <b>Chrome</b> (menu ⋯ → « Ouvrir dans le navigateur »).';
  else if (!navigator.mediaDevices?.getUserMedia) html = '⚠️ Ce navigateur ne permet pas le micro. Ouvre le jeu dans <b>Safari</b> (iPhone) ou <b>Chrome</b> (Android).';
  else if (ui.voiceError) html = '⚠️ Voix non connectée. <button class="btn small btn-gold" data-retry>Réessayer</button>';
  else if (!st.active) html = '⏳ Connexion de ton micro… <button class="btn small" data-retry>Toucher pour activer</button>';
  else if (!st.hasMic)
    html = `⚠️ Ton micro est bloqué. <button class="btn small btn-gold" data-retry>Autoriser le micro</button><br><span class="hint">${
      IS_IOS ? 'Si rien ne s’affiche : Réglages de l’iPhone → Safari → Micro → « Demander » ou « Autoriser », puis recharge la page.' : 'Si rien ne s’affiche : touche le cadenas 🔒 à gauche de l’adresse → Micro → Autoriser, puis recharge la page.'
    }</span>`;
  else if (st.selfMuted) html = '🔇 <b>Tu as coupé ton micro</b> : personne ne t’entend. <button class="btn small btn-gold" data-mute="0">Réactiver mon micro</button>';
  else if (!st.micLive) html = '⚠️ Ton micro est coupé par le téléphone (appel en cours ou autre appli qui utilise le micro ?). Ferme-les puis <button class="btn small btn-gold" data-retry>Réessayer</button>';
  else if (st.sending === false && Date.now() - (ui.voiceSince ?? 0) > 6000) html = '⚠️ Ton micro n’arrive pas jusqu’aux autres. <button class="btn small btn-gold" data-retry>Réessayer</button>';
  else if (st.sending === false) html = '⏳ Envoi de ton micro aux autres…';
  else if (Date.now() - ui.heardAt < 20000) html = '✅ <b>Les autres t’entendent</b> (ton nom s’allume quand tu parles). <span class="lvl"><i></i></span>';
  else html = '🎙️ Micro prêt. <b>Parle pour tester</b> : quand ton nom s’allume en vert, les autres t’entendent. <span class="lvl"><i></i></span>';
  if (st.active && st.hasMic && st.micLive && !st.selfMuted) html += ' <button class="btn small" data-mute="1">🔇 Me couper</button>';
  if (st.active && st.speakerOk === false) html += '<br>🔇 Ton haut-parleur est bloqué. <button class="btn small btn-gold" data-unlock>Activer le son</button>';
  else if (st.active) html += '<br><span class="hint">🔊 Tu n’entends rien ? Monte le volume et enlève le mode silencieux.</span>';
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html;
  el.className = `my-voice ${st.active && st.hasMic && st.micLive && (st.sending !== false || st.selfMuted) && !IN_APP ? 'ok' : 'ko'}`;
  el.querySelector('[data-mute]')?.addEventListener('click', (e) => voice.setSelfMute(e.currentTarget.dataset.mute === '1'));
  el.querySelector('[data-unlock]')?.addEventListener('click', () => {
    primeAudio();
    voice.unlockAudio();
    setTimeout(renderMyVoice, 300);
  });
  el.querySelector('[data-retry]')?.addEventListener('click', retryVoice);
}

/** Relance la voix depuis un toucher (geste exigé par iPhone pour demander le micro). */
async function retryVoice() {
  primeAudio();
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch (e) {
    console.warn('[voice] micro refusé', e);
  }
  voice.stop();
  ui.voiceTried = false;
  ui.voiceError = false;
  ui.voiceSince = 0;
  voice.unlockAudio();
  await autoVoice(client.view);
  renderMyVoice();
}
voice.addEventListener('change', () => {
  if (voice.state().active && !ui.voiceSince) ui.voiceSince = Date.now();
  renderMyVoice();
});
setInterval(renderMyVoice, 1000);
// Jauge du micro + « on t'entend » : le serveur audio signale que ma voix lui arrive.
ui.heardAt = 0;
setInterval(() => {
  const me = client.view?.me.id;
  if (me && ui.talking.has(me) && voice.state().sending) {
    if (Date.now() - ui.heardAt > 20000) setTimeout(renderMyVoice);
    ui.heardAt = Date.now();
  }
  const bar = document.querySelector('#my-voice .lvl i');
  if (bar) bar.style.width = `${Math.min(100, Math.round(voice.level() * 100))}%`;
}, 120);
// iPhone : micro refusé faute de geste → le premier toucher sur l'écran le redemande, une fois.
document.addEventListener(
  'pointerdown',
  (e) => {
    const st = voice.state();
    if (ui.autoRetried || !st.active || st.hasMic || IN_APP || e.target.closest?.('[data-retry],#btn-mic')) return;
    ui.autoRetried = true;
    retryVoice();
  },
  { passive: true },
);

// ================================================================== ÉTAT DU MICRO (automatique)
// Chacun voit dans le lobby si le micro des autres est actif : vert dès que la voix
// est connectée et le micro autorisé. Aucun test à faire.
const audioStatus = { mic: false, speaker: false, connected: false, diag: '' };
// Diagnostic technique (navigateur, connexion audio, octets envoyés/reçus), affiché dans le lobby.
setInterval(async () => {
  if (client.view?.status !== 'lobby') return;
  audioStatus.diag = await voice.diag().catch(() => '');
}, 3000);
let audioKey = '';
function reportAudio() {
  const key = `${audioStatus.mic}|${audioStatus.speaker}|${audioStatus.connected}|${audioStatus.diag}`;
  if (key === audioKey || !client.view) return;
  audioKey = key;
  client.request('player:audio', { ...audioStatus }).catch(() => (audioKey = ''));
}
setInterval(() => {
  const v = client.view;
  if (!v || v.status === 'finished') return;
  const st = voice.state();
  audioStatus.connected = !!st.active;
  // Vert seulement si le micro capte vraiment (et, dans le lobby, arrive jusqu'au serveur).
  audioStatus.mic = !!(st.active && st.hasMic && !st.selfMuted && st.micLive !== false && (v.status !== 'lobby' || st.sending !== false));
  audioStatus.speaker = !!(st.active && st.speakerOk !== false);
  reportAudio();
}, 150);

// ================================================================== PHASE & TIMER
function renderPhase(v) {
  const ph = v.phase;
  $('phase-label').textContent = ph.label;
  const parts = [];
  if (ph.night && (NIGHT_PHASES.has(ph.id) || !ph.day || ph.night > ph.day)) parts.push(`Nuit ${ph.night}`);
  else if (ph.day) parts.push(`Jour ${ph.day}`);
  if (ph.speakerId) parts.push(`🎙️ ${nameOf(v, ph.speakerId)}`);
  if (ph.subjectId) parts.push(`👉 ${nameOf(v, ph.subjectId)}`);
  if (ph.speechOrder && ph.id === 'PLAYER_SPEECH') parts.push(`tour ${ph.speechOrder.indexOf(ph.speakerId) + 1}/${ph.speechOrder.length}`);
  $('phase-sub').textContent = parts.join(' · ');
  $('phase').classList.toggle('night', NIGHT_PHASES.has(ph.id));
}

function renderTimer() {
  const v = client.view;
  const ms = client.timeLeft();
  const box = $('timer');
  if (!v || v.status !== 'running' || ms === null) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const total = Math.max(1, v.phase.endsAt - v.phase.startedAt);
  const s = Math.ceil(ms / 1000);
  $('timer-text').textContent = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
  $('timer-ring').style.strokeDashoffset = String(119.4 * (1 - ms / total));
  box.classList.toggle('low', s <= 5);
}
setInterval(renderTimer, 250);
// Fin de partie : compte à rebours avant le retour automatique de tout le monde au lobby.
function renderGameOverCount() {
  const el = document.getElementById('go-count');
  if (!el || client.view?.status !== 'finished') return;
  const ms = client.timeLeft();
  el.textContent = ms === null ? '…' : `${Math.max(0, Math.ceil(ms / 1000))} s`;
}
setInterval(renderGameOverCount, 250);

// ================================================================== PLATEAU
// Bruitages synchronisés avec les animations du plateau.
// ================================================================== RETOURS VISUELS / TACTILES
initJuice($('board'));
// Mort d'un joueur : léger tremblement + voile sombre ; ma propre mort fait aussi vibrer le téléphone.
board.addEventListener('death', (e) => impact('medium', { buzz: e.detail === client.view?.me.id }));

board.addEventListener('sfx', (e) => {
  const st = client.view?.status;
  if (e.detail === 'dusk' && st === 'running') sfx.howlPack();
  else if (e.detail === 'shot' && st && st !== 'lobby') {
    sfx.gunshot();
    impact('large', { buzz: false }); // coup de fusil : le plateau encaisse
  }
  else if (e.detail === 'rack' && st && st !== 'lobby') sfx.shotgunRack();
  else if (e.detail === 'dawn' && st === 'running' && !(Date.now() < (ui.noBirdsUntil ?? 0))) sfx.dawn();
});
// Étiquette personnelle : seul l'auteur la voit (le serveur ne l'envoie qu'à lui).
const TAG_PRESETS = ['❤️ Mon ami(e)', '🐺 Suspect', '🔥 À surveiller', '✅ Confiance', '🔮 Voyante ?', '🤔 Bizarre', '🛡️ Protégé', '🤐 Trop calme'];
board.addEventListener('tag', (e) => openTagEditor(e.detail));
function openTagEditor(playerId) {
  const v = client.view;
  const target = v?.players.find((p) => p.id === playerId);
  if (!target) return;
  document.querySelector('.tag-editor')?.remove();
  const current = v.myTags?.[playerId] ?? '';
  const box = document.createElement('div');
  box.className = 'tag-editor';
  box.innerHTML = `<form class="panel">
    <h3>🏷️ ${esc(numName(v, playerId))}${target.isMe ? ' (toi)' : ''}</h3>
    <p class="private">🔒 Étiquette personnelle : visible par toi seul.</p>
    <div class="chips">${TAG_PRESETS.map((t) => `<button type="button" class="${t === current ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
    <input name="tag" maxlength="24" placeholder="Ou écris ta propre étiquette…" value="${esc(current)}" autocomplete="off" />
    <div class="row">
      ${current ? '<button type="button" class="btn small ghost" data-del>🗑️ Supprimer</button>' : ''}
      <button type="button" class="btn small ghost" data-cancel>Annuler</button>
      <button class="btn small btn-gold">Enregistrer</button>
    </div></form>`;
  document.body.appendChild(box);
  const form = box.querySelector('form');
  const input = form.querySelector('input');
  const save = (text) => {
    box.remove();
    safe(client.setTag(playerId, text));
  };
  form.querySelectorAll('.chips button').forEach((b) => (b.onclick = () => save(b.textContent)));
  form.onsubmit = (ev) => {
    ev.preventDefault();
    save(input.value.trim());
  };
  form.querySelector('[data-del]')?.addEventListener('click', () => save(''));
  form.querySelector('[data-cancel]').onclick = () => box.remove();
  box.addEventListener('click', (ev) => ev.target === box && box.remove());
}
board.addEventListener('pick', (e) => {
  const v = client.view;
  const p = v?.prompt;
  if (!p) return;
  const id = e.detail;
  // Sorcière : toucher un joueur = l'empoisonner (avec ou sans potion de vie).
  if (p.action === 'witch') {
    const ids = (p.options ?? []).map((o) => o.id);
    const option = ui.witchSave && ids.includes('save_kill') ? 'save_kill' : 'kill';
    if (!ids.includes(option)) return toast(ids.includes('save') && !ids.includes('kill') ? '☠️ Pas de potion de mort cette nuit (1re nuit).' : '☠️ Potion de mort indisponible.');
    witchCommand([id], option);
    return;
  }
  // Une seule cible (vote, loups, Voyante, Salvateur, Chasseur…) : on touche, c'est validé.
  if (p.maxTargets === 1) {
    ui.selected = [id];
    if (p.action === 'seer') ui.seerTarget = id;
    board.update(v, ui);
    safe(client.command(p.action, [id]));
    return;
  }
  // Plusieurs cibles (Cupidon) : validation automatique dès que le compte est bon.
  if (ui.selected.includes(id)) ui.selected = ui.selected.filter((x) => x !== id);
  else {
    ui.selected.push(id);
    if (ui.selected.length > p.maxTargets) ui.selected.shift();
  }
  if (ui.selected.length === p.maxTargets && p.minTargets === p.maxTargets) safe(client.command(p.action, [...ui.selected]));
  render();
});
voice.addEventListener('talking', (e) => {
  ui.talking = e.detail;
  if (client.view) board.update(client.view, ui);
  if (client.view?.status === 'lobby') document.querySelectorAll('#lobby-players li[data-pid]').forEach((li) => li.classList.toggle('talking', ui.talking.has(li.dataset.pid)));
});

// ================================================================== MOI
function renderMe(v) {
  const r = v.me.role;
  const slot = $('my-card');
  const key = r ? r.id : '';
  if (slot.dataset.key !== key) {
    slot.dataset.key = key;
    slot.innerHTML = r ? cardSVG(r.id, r.name) : '';
  }
  slot.style.visibility = ui.revealing ? 'hidden' : '';
  $('me-name').textContent = v.me.name;
  const st = [];
  // Pendant la révélation, le rôle reste secret jusqu'à l'arrêt de la carte (suspense).
  if (r && ui.revealing) st.push('<span>🎴 Distribution de ton rôle…</span>');
  else if (r) st.push(`<span>${r.emoji} ${esc(r.name)} · <span class="muted">${TEAM[r.team] ?? ''}</span></span>`);
  if (v.me.lover && !ui.revealing) st.push(`<span>❤️ Amoureux de <b>${esc(v.me.lover.name)}</b></span>`);
  if (v.me.pack && v.me.pack.length > 1 && !ui.revealing) st.push(`<span>🐺 Meute : ${v.me.pack.filter((w) => w.id !== v.me.id).map((w) => `${esc(w.name)}${w.alive ? '' : ' 💀'}`).join(', ')}</span>`);
  if (v.me.infected && !ui.revealing) st.push('<span>🖤 <b>Infecté</b> : tu joues secrètement pour les Loups (tu gardes ton rôle)</span>');
  if (v.me.roleState && 'infection' in v.me.roleState) st.push(`<span>🖤 Infection ${v.me.roleState.infection ? 'disponible' : 'utilisée'}</span>`);
  if (v.me.roleState && 'potionVie' in v.me.roleState) st.push(`<span>🧪 Vie ${v.me.roleState.potionVie ? '✔' : '✘'} · Mort ${v.me.roleState.potionMort ? '✔' : '✘'}</span>`);
  if (v.me.isCaptain) st.push('<span>👑 Capitaine (voix double)</span>');
  if (!v.me.alive) st.push('<span>💀 Mort · spectateur</span>');
  $('me-status').innerHTML = st.join('');
  renderMic(v);
}

function renderMic(v = client.view) {
  if (!v) return;
  const btn = $('btn-mic');
  const st = voice.state();
  if (ui.voiceError) {
    btn.className = 'mic-btn muted';
    btn.innerHTML = '<i>⚠️</i><span>Son indisponible · réessayer</span>';
  } else if (!st.active) {
    btn.className = 'mic-btn muted';
    btn.innerHTML = '<i>⏳</i><span>Connexion de la voix…</span>';
  } else if (!st.hasMic) {
    btn.className = 'mic-btn muted';
    btn.innerHTML = '<i>⚠️</i><span>Micro refusé · autorise-le</span>';
  } else if (st.selfMuted) {
    btn.className = 'mic-btn muted self';
    btn.innerHTML = '<i>🔇</i><span>Tu t’es coupé · toucher pour réactiver</span>';
  } else if (v.voice.canSpeak) {
    btn.className = 'mic-btn live';
    btn.innerHTML = '<i>🎙️</i><span>Micro ouvert · toucher pour couper</span>';
  } else {
    btn.className = 'mic-btn muted';
    btn.innerHTML = '<i>🔇</i><span>Micro coupé · pas ton tour</span>';
  }
}

/**
 * Voix automatique : elle se connecte dès qu'on est dans une partie, le micro
 * s'ouvre tout seul quand c'est notre tour (règles du serveur), sans bouton.
 */
async function autoVoice(v) {
  // La voix reste ouverte sur l'écran de victoire : tout le monde repasse au lobby sans coupure.
  const inGame = v && (v.status === 'lobby' || v.status === 'running' || v.status === 'finished');
  if (!inGame) {
    if (voice.state().active) voice.stop();
    ui.voiceTried = false;
    return;
  }
  if (ui.voiceTried || voice.state().active) return;
  ui.voiceTried = true;
  clearTimeout(ui.voiceRetryTimer);
  try {
    await voice.start();
    ui.voiceError = false;
    ui.voiceFails = 0;
  } catch (e) {
    console.warn('[voice]', e);
    ui.voiceError = true;
    // Nouvel essai automatique : 3 s, 6 s, 12 s… (30 s maximum), tant qu'on est dans la partie.
    ui.voiceFails = (ui.voiceFails ?? 0) + 1;
    const delay = Math.min(30000, 3000 * 2 ** (ui.voiceFails - 1));
    ui.voiceRetryTimer = setTimeout(() => {
      ui.voiceTried = false;
      autoVoice(client.view);
    }, delay);
  }
  renderMic();
}
// Écran toujours allumé pendant le lobby et la partie : un téléphone en veille coupe son micro.
let wakeLock = null;
async function keepScreenOn() {
  const st = client.view?.status;
  const want = !!st && st !== 'finished' && document.visibilityState === 'visible';
  if (keepScreenOn.busy || want === !!wakeLock) return;
  keepScreenOn.busy = true;
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    /* refusé (économie d'énergie…) : sans effet */
  } finally {
    keepScreenOn.busy = false;
  }
}
document.addEventListener('visibilitychange', keepScreenOn);
client.addEventListener('view', keepScreenOn);
// Bouton : relance la voix (utile si le micro a été refusé puis autorisé).
// Bouton micro : coupe / réactive MON micro (si la voix marche), sinon relance la voix.
$('btn-mic').onclick = () => {
  const st = voice.state();
  if (st.active && st.hasMic && !ui.voiceError) voice.setSelfMute(!st.selfMuted);
  else retryVoice();
};
voice.addEventListener('change', () => {
  renderMic();
  const muted = !!voice.state().selfMuted;
  if (muted !== !!ui.selfMuted) {
    ui.selfMuted = muted;
    if (client.view) board.update(client.view, ui);
  }
});
// Certains téléphones bloquent le son tant qu'on n'a pas touché l'écran.
voice.addEventListener('audio', (e) => $('audio-unlock').classList.toggle('show', !!e.detail.blocked));
const unlock = () => {
  voice.unlockAudio();
  sfx.unlock();
};
document.addEventListener('pointerdown', unlock, { passive: true });
document.addEventListener('keydown', unlock);
$('audio-unlock').onclick = () => {
  voice.unlockAudio();
  $('audio-unlock').classList.remove('show');
};
$('my-card').onclick = () => {
  const r = client.view?.me.role;
  if (!r) return;
  const z = $('card-zoom');
  z.innerHTML = `<div>${cardSVG(r.id, r.name)}<p>${esc(r.description)}</p></div>`;
  z.classList.add('show');
};
$('card-zoom').onclick = () => $('card-zoom').classList.remove('show');

// ================================================================== ACTIONS
const TAP_HINTS = {
  vote: '⚖️ Touche le joueur que tu soupçonnes',
  wolf_vote: '🐺 Touchez votre victime',
  seer: '🔮 Touche un joueur pour voir s’il est LOUP ou CIVIL',
  protect: '🛡️ Touche le joueur à protéger cette nuit',
  white_wolf: '🤍 Touche un loup à dévorer, ou passe',
  hunter_shot: '🏹 Touche le joueur que tu emportes avec toi',
  captain_successor: '👑 Touche ton successeur',
  cupid: '💘 Touche les deux joueurs à unir',
};

/** Sorcière : confirmation de ce que le SERVEUR a validé (ou erreur bien visible). */
function witchCommand(targets, option) {
  const v = client.view;
  const target = targets[0] ? nameOf(v, targets[0]) : null;
  const victim = v?.prompt?.info?.victimName;
  client
    .command('witch', targets, option)
    .then(() => {
      const msgs = [];
      if (option === 'save' || option === 'save_kill') msgs.push(`💚 ${victim} est sauvé(e)`);
      if (target) msgs.push(`☠️ ${target} est empoisonné(e) : mort(e) au lever du jour`);
      toast(msgs.length ? `${msgs.join(' · ')} ✔` : '🧪 Aucune potion utilisée ✔');
    })
    .catch((e) => toast(`⚠️ Potion NON utilisée : ${e.message}`));
}

function renderAction(v) {
  const el = $('action');
  const p = v.prompt;
  if (v.status === 'finished') return (el.innerHTML = '');
  if (v.phase.canFinish) {
    const lw = v.phase.id === 'DEATH_LAST_WORD';
    if (ui.floorSeq !== v.phase.seq) {
      ui.floorSeq = v.phase.seq;
      vibrate([60, 40, 60]); // à toi de parler
    }
    el.innerHTML = `<h3>${lw ? '💀 Ta dernière parole' : '🎙️ À toi de parler !'}</h3>
      <p>${lw ? 'Explique, accuse, défends-toi : tout le monde t’écoute.' : 'Ton micro est ouvert, les autres t’écoutent.'}</p>
      <div class="row" style="justify-content:center"><button class="btn btn-finish" id="btn-finish">FINIR</button></div>`;
    $('btn-finish').onclick = () => safe(client.finish());
    return;
  }
  if (!p && v.phase.votes?.length) {
    const byTarget = new Map();
    for (const vt of v.phase.votes) {
      const list = byTarget.get(vt.targetId) ?? [];
      list.push(vt);
      byTarget.set(vt.targetId, list);
    }
    const rows = [...byTarget.entries()]
      .sort((a, b) => b[1].reduce((n, x) => n + x.weight, 0) - a[1].reduce((n, x) => n + x.weight, 0))
      .map(([t, list]) => `<div class="target"><b>${esc(numName(v, t))}</b> (${list.reduce((n, x) => n + x.weight, 0)}) ← ${list.map((x) => `${esc(numName(v, x.voterId))}${x.weight > 1 ? ' 👑' : ''}`).join(', ')}</div>`)
      .join('');
    el.innerHTML = `<h3>🗳️ Qui a voté pour qui</h3><div class="vote-list">${rows}</div>`;
    return;
  }
  if (!p) {
    let msg = '';
    if (v.status === 'running') {
      if (!v.me.alive) msg = '👻 Tu observes la partie depuis l’au-delà.';
      else if (NIGHT_PHASES.has(v.phase.id)) msg = '😴 Tu dors… le village est plongé dans la nuit.';
      else if (v.phase.id === 'PLAYER_SPEECH') msg = `🎙️ ${esc(numName(v, v.phase.speakerId))} a la parole. Écoute bien…`;
      else if (v.phase.id === 'DEATH_LAST_WORD') msg = `💀 Dernière parole de ${esc(nameOf(v, v.phase.speakerId))}.`;
      else if (v.phase.id === 'FREE_DISCUSSION') msg = '🗣️ Discussion libre : tout le monde peut parler !';
      else if (v.phase.id === 'VOTING' && v.me.runoffCandidate) msg = '⚖️ Tu es à égalité : le village vote entre vous. Tu ne votes pas.';
    }
    el.innerHTML = msg ? `<p class="quiet">${msg}</p>` : '';
    return;
  }
  const key = `${v.phase.seq}:${p.action}`;
  if (key !== ui.promptKey) {
    // Nouvelle action à faire : petite vibration (utile téléphone en poche ou écran ailleurs).
    if (ui.promptKey !== undefined && !p.submitted) vibrate([60, 40, 60]);
    ui.promptKey = key;
    ui.selected = [];
    ui.witchSave = false;
    ui.witchPoison = false;
  }
  let html = '';
  if (p.action === 'witch') {
    const ids = (p.options ?? []).map((o) => o.id);
    const victim = p.info?.victimName;
    html += `<h3>🧪 ${victim ? `Les loups ont attaqué <b>${esc(victim)}</b>` : 'Personne n’a été attaqué'}</h3>`;
    if (ui.witchPoison) {
      html += `<p>☠️ <b>Touche le joueur à empoisonner.</b></p><div class="row"><button class="btn" data-witch="poison-cancel">Annuler</button></div>`;
    } else if (ui.witchSave) {
      html += `<p>💚 ${esc(victim)} sera sauvé(e). ☠️ Touche un joueur pour l’empoisonner aussi, ou termine.</p>
        <div class="row"><button class="btn btn-gold" data-witch="save">Terminer</button></div>`;
    } else {
      const btns = [];
      if (ids.includes('save')) btns.push(`<button class="btn btn-gold" data-witch="${ids.includes('save_kill') ? 'save-then' : 'save'}">💚 Sauver ${esc(victim)}</button>`);
      if (ids.includes('kill')) btns.push('<button class="btn btn-danger" data-witch="poison-pick">☠️ Empoisonner</button>');
      btns.push('<button class="btn" data-witch="none">Ne rien faire</button>');
      html += `<div class="row">${btns.join('')}</div>`;
    }
  } else if (p.action === 'thief') {
    html += `<h3>🃏 LE VOLEUR</h3><p>Choisis ton destin…</p><div class="row"><button class="btn btn-gold" id="btn-thief">🃏 Voir les deux cartes</button></div>`;
    if (ui.thiefSeq !== v.phase.seq) {
      ui.thiefSeq = v.phase.seq;
      setTimeout(() => openThief(), 50);
    }
  } else {
    const hint = TAP_HINTS[p.action] ?? esc(p.title);
    if (p.action === 'vote' && p.submitted) html += `<h3>✅ Vote enregistré</h3><p>Touche un autre joueur pour changer d’avis.</p>`;
    else html += `<h3>${hint}</h3>`;
    if (p.action === 'cupid' && ui.selected.length) html += `<p>💘 ${ui.selected.map((id) => `<b>${esc(nameOf(v, id))}</b>`).join(' + ')}…</p>`;
    if (p.action === 'wolf_vote') {
      const votes = (p.info?.packVotes ?? []).filter((w) => w.targetName);
      if (votes.length) html += `<p class="wolf-votes">${votes.map((w) => `🐺 ${esc(w.wolfName)} → <b>${esc(w.targetName)}</b>`).join(' · ')}</p>`;
      const bw = p.info?.blackWolf;
      if (bw?.locked) {
        // Infection confirmée : le serveur termine la phase dans 5 s (compte à rebours en haut).
        html += `<div class="infect-lock">🖤 <b>INFECTION EN COURS…</b><br>${esc(bw.targetName)} va rejoindre la meute.</div>`;
      } else if (p.options?.length) {
        // Loup Noir : TUER ou INFECTER (une seule fois dans la partie).
        html += `<div class="row black-wolf">${p.options
          .map((o) => `<button class="btn ${bw?.mode === o.id ? 'btn-gold' : ''}" data-bw="${esc(o.id)}">${esc(o.label)}</button>`)
          .join('')}</div><p class="hint">${bw?.mode ? '🖤 Infecter : la victime survit et rejoint la meute (1 fois).' : '<b>Choisis TUER ou INFECTER</b> (sinon : TUER).'}</p>`;
      } else if (bw?.mode === 'infect') html += `<p class="wolf-votes">🖤 ${esc(bw.name)} (Loup Noir) veut <b>INFECTER</b> la victime.</p>`;
    }
    if (p.minTargets === 0) html += `<div class="row"><button class="btn" id="btn-pass">${p.action === 'hunter_shot' ? 'Ne pas tirer' : 'Passer'}</button></div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('[data-bw]').forEach((b) => (b.onclick = () => safe(client.command('wolf_vote', [], b.dataset.bw))));
  el.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => safe(client.command(p.action, [], b.dataset.opt))));
  el.querySelectorAll('[data-witch]').forEach(
    (b) =>
      (b.onclick = () => {
        const w = b.dataset.witch;
        if (w === 'save-then') {
          ui.witchSave = true;
          return render();
        }
        if (w === 'poison-pick' || w === 'poison-cancel') {
          ui.witchPoison = w === 'poison-pick';
          return render();
        }
        witchCommand([], w);
      }),
  );
  const th = $('btn-thief');
  if (th) th.onclick = () => openThief();
  const pass = $('btn-pass');
  if (pass) pass.onclick = () => safe(client.command(p.action, []));
}

// ================================================================== VOLEUR (écran privé)
/** Les deux cartes du centre, face cachée : on les retourne, on en choisit une, échange animé. */
function openThief() {
  const v = client.view;
  const p = v?.prompt;
  if (!p || p.action !== 'thief' || document.querySelector('.thief-stage')) return;
  const cards = p.info?.cards ?? [];
  const mine = v.me.role;
  const st = document.createElement('div');
  st.className = 'thief-stage';
  st.innerHTML = `<div class="ts-box">
      <h2>🃏 LE VOLEUR</h2>
      <p class="ts-sub">Choisis ton destin…</p>
      <div class="ts-cards">${cards
        .map(
          (c, i) => `<div class="ts-slot" data-i="${i}">
            <div class="ts-card"><div class="ts-face back">${cardBackSVG()}</div><div class="ts-face front">${cardSVG(c.id, c.name)}</div></div>
            <button class="btn btn-gold ts-take" data-take="${i}">Prendre</button>
          </div>`,
        )
        .join('')}</div>
      <p class="ts-hint">${p.info?.mustTakeWolf ? '🐺 Les deux cartes sont des Loups : tu dois en prendre une.' : 'Touche une carte pour la retourner.'}</p>
      <div class="ts-mine"><span>Ta carte</span><div class="mini">${mine ? cardSVG(mine.id, mine.name) : ''}</div></div>
    </div>`;
  document.body.appendChild(st);
  requestAnimationFrame(() => st.classList.add('in'));
  const flip = (slot) => {
    if (slot.classList.contains('shown')) return;
    slot.classList.add('shown');
    sfx.tick(4);
    if (st.querySelectorAll('.ts-slot.shown').length === cards.length) st.querySelector('.ts-hint').textContent = 'Choisis la carte que tu veux prendre.';
  };
  st.querySelectorAll('.ts-slot').forEach((slot) => slot.querySelector('.ts-card').addEventListener('click', () => flip(slot)));
  // Retournement automatique après un court instant (suspense).
  setTimeout(() => st.querySelectorAll('.ts-slot').forEach((s, k) => setTimeout(() => flip(s), k * 450)), 900);
  st.querySelectorAll('[data-take]').forEach(
    (b) =>
      (b.onclick = async () => {
        const i = Number(b.dataset.take);
        const chosen = cards[i];
        // Le nouveau rôle a déjà été « révélé » ici : pas de nouvelle animation de distribution.
        try {
          sessionStorage.setItem(`blackops:revealed:${profile}:${v.code}:${v.me.id}`, chosen.id);
        } catch {
          /* stockage indisponible */
        }
        st.classList.add('busy');
        try {
          await client.command('thief', [], String(i));
        } catch (e) {
          st.classList.remove('busy');
          return toast(e.message);
        }
        // Échange : ma carte part au centre, la carte choisie vient à moi.
        const slot = st.querySelector(`.ts-slot[data-i="${i}"]`);
        const mineEl = st.querySelector('.ts-mine .mini');
        const a = slot.querySelector('.ts-card').getBoundingClientRect();
        const m = mineEl.getBoundingClientRect();
        const dx = m.left + m.width / 2 - (a.left + a.width / 2);
        const dy = m.top + m.height / 2 - (a.top + a.height / 2);
        slot.querySelector('.ts-card').animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${m.width / a.width}) rotate(8deg)` }], { duration: 750, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' });
        mineEl.animate([{ transform: 'none' }, { transform: `translate(${-dx}px, ${-dy}px) scale(${a.width / m.width}) rotate(-8deg)`, opacity: 0.85 }], { duration: 750, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' });
        sfx.revealHit();
        await wait(900);
        st.querySelector('.ts-box').innerHTML = '<h2>🃏 Échange fait</h2><p class="ts-secret">Ton nouveau rôle est secret.</p>';
        await wait(1800);
        st.classList.remove('in');
        await wait(400);
        st.remove();
      }),
  );
}

/**
 * Écran du Voleur encore ouvert alors que son tour est fini (temps écoulé : le serveur a pris une
 * carte pour lui, ou choix fait ailleurs) : on le referme, sinon il masquerait le jeu toute la partie.
 * Le nouveau rôle est alors montré par l'animation de distribution habituelle.
 */
function closeStaleThief(v) {
  const st = document.querySelector('.thief-stage');
  if (!st || st.classList.contains('busy')) return;
  if (v?.status === 'running' && v.prompt?.action === 'thief') return;
  st.classList.remove('in');
  setTimeout(() => st.remove(), 400);
}

// ================================================================== JOURNAL & CHATS
function tabsFor(v) {
  const t = [
    ['events', '📜 Journal'],
    ['private', '🔒 Privé'],
    ['village', '💬 Village'],
  ];
  if (v.chats.wolves) t.push(['wolves', '🐺 Loups']);
  return t;
}
const itemsOf = (v, tab) =>
  tab === 'events' ? v.announcements : tab === 'private' ? v.privateLog : (v.chats[tab] ?? []);

function fillList(body, list, tab, force) {
  const atBottom = force || body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
  body.innerHTML =
    list
      .map((m) => (m.authorName ? `<div class="item"><span class="at">${time(m.at)}</span><span class="who">${esc(m.authorName)}</span> : ${esc(m.text)}</div>` : `<div class="item"><span class="at">${time(m.at)}</span>${esc(m.text)}</div>`))
      .join('') || '<div class="muted">Rien pour l’instant.</div>';
  if (atBottom) body.scrollTop = body.scrollHeight;
}

function renderChats(v) {
  const tabs = tabsFor(v);
  if (!tabs.some(([id]) => id === ui.tab)) ui.tab = 'events';
  $('tabs').innerHTML = tabs.map(([id, label]) => `<button data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">${label}</button>`).join('');
  $('tabs').querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), (ui.forceScroll = true), render())));
  fillList($('tab-body'), itemsOf(v, ui.tab), ui.tab, ui.forceScroll);
  ui.forceScroll = false;
  const isChat = ['village', 'wolves'].includes(ui.tab);
  const canWrite = isChat && v.chatWrite[ui.tab];
  $('chat-form').classList.toggle('hidden', !isChat);
  $('chat-input').disabled = !canWrite;
  $('chat-input').placeholder = canWrite ? 'Message…' : 'Tu ne peux pas écrire ici maintenant.';
  if (ui.chatOpen) ui.seen[ui.tab] = itemsOf(v, ui.tab).length;
  const unread = tabs.reduce((n, [id]) => n + Math.max(0, itemsOf(v, id).length - (ui.seen[id] ?? 0)), 0);
  $('chat-badge').textContent = unread > 9 ? '9+' : String(unread);
  $('chat-badge').classList.toggle('show', !ui.chatOpen && unread > 0);

  // 💀 Chat des morts : uniquement si le serveur nous y donne accès.
  const dead = v.chats.dead;
  $('btn-dead').classList.toggle('show', !!dead);
  if (!dead && ui.deadOpen) toggleDead(false);
  if (dead) {
    fillList($('dead-body'), dead, 'dead');
    $('dead-input').disabled = !v.chatWrite.dead;
    if (ui.deadOpen) ui.seen.dead = dead.length;
    const du = Math.max(0, dead.length - ui.seen.dead);
    $('dead-badge').textContent = String(du);
    $('dead-badge').classList.toggle('show', !ui.deadOpen && du > 0);
  }
}
function toggleChat(open = !ui.chatOpen) {
  ui.chatOpen = open;
  $('chat-panel').classList.toggle('open', open);
  ui.forceScroll = true;
  render();
}
function toggleDead(open = !ui.deadOpen) {
  ui.deadOpen = open;
  $('dead-panel').classList.toggle('open', open);
  if (client.view) render();
}
$('btn-chat').onclick = () => toggleChat();
$('btn-dead').onclick = () => toggleDead();
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => (b.dataset.close === 'chat-panel' ? toggleChat(false) : toggleDead(false))));
$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (text) safe(client.chat(ui.tab, text).then(() => ($('chat-input').value = '')));
};
$('dead-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('dead-input').value.trim();
  if (text) safe(client.chat('dead', text).then(() => ($('dead-input').value = '')));
};
$('btn-menu').onclick = () => $('menu').classList.toggle('open');
const motionLabel = () => ($('btn-motion').textContent = reducedMotion() ? '✨ Animations et vibrations : réduites' : '✨ Animations et vibrations : normales');
motionLabel();
$('btn-motion').onclick = () => {
  setReducedMotion(!reducedMotion());
  motionLabel();
  if (!reducedMotion()) impact('small');
};

// ================================================================== RÔLES DE LA PARTIE (info)
// Composition publique de la partie : quels rôles sont en jeu et combien — jamais qui les a, ni qui est mort.
const TEAM_ORDER = { wolves: 0, white_wolf: 1, village: 2, none: 3 };
function renderRolesPanel(v) {
  const el = $('roles-panel');
  const comp = v?.composition;
  $('btn-roles').style.display = comp ? '' : 'none';
  if (!comp) {
    el.classList.remove('open');
    return;
  }
  const key = JSON.stringify(comp);
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const roles = Object.entries(comp)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ n, info: v.roleCatalog.find((r) => r.id === id) ?? { id, name: id, emoji: '🎴', team: 'none' } }))
    .sort((a, b) => (TEAM_ORDER[a.info.team] ?? 3) - (TEAM_ORDER[b.info.team] ?? 3) || (a.info.id === 'villager') - (b.info.id === 'villager'));
  const total = roles.reduce((t, r) => t + r.n, 0);
  el.innerHTML = `<div class="rp-head"><h3>🎴 Rôles de la partie</h3><button class="icon-btn" data-close-roles>✕</button></div>
    <p class="rp-sub">${total} cartes en jeu${comp.thief ? ' (dont 2 pour le Voleur)' : ''} · pour information seulement</p>
    <div class="rp-grid">${roles
      .map(({ n, info }) => `<div class="rp-item" title="${esc(info.description ?? '')}"><div class="rp-card">${cardSVG(info.id, info.name)}${n > 1 ? `<b class="rp-count">×${n}</b>` : ''}</div><span>${info.emoji} ${esc(info.name)}</span></div>`)
      .join('')}</div>`;
  el.querySelector('[data-close-roles]').onclick = () => el.classList.remove('open');
}
$('btn-roles').onclick = () => $('roles-panel').classList.toggle('open');
$('btn-roles-menu').onclick = () => {
  $('menu').classList.remove('open');
  $('roles-panel').classList.add('open');
};
$('btn-leave-game').onclick = () => {
  $('menu').classList.remove('open');
  if (client.view?.status === 'finished' || confirm('Quitter la partie ? Ton personnage sera considéré comme ayant abandonné (mort).')) {
    voice.stop();
    safe(client.leave());
  }
};

// ================================================================== FIN DE PARTIE
function renderGameOver(v) {
  const el = $('gameover');
  if (v.status !== 'finished' || !v.winner) {
    el.innerHTML = '';
    el.dataset.key = '';
    return;
  }
  const key = `${v.winner.title}|${v.phase.seq}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const w = new Set(v.winner.winnerIds);
  impact('victory', { buzz: w.has(v.me.id) }); // éclat doré (vibration pour les gagnants)
  const items = (v.finalRoles ?? [])
    .map((r) => {
      const pl = v.players.find((p) => p.id === r.id);
      return `<div class="final-item ${w.has(r.id) ? 'win' : ''} ${pl?.alive ? '' : 'dead'}"><div class="mini">${cardSVG(r.role, r.roleName)}</div>${w.has(r.id) ? '🏆 ' : ''}${esc(pl?.name)}${r.loverId ? ' ❤️' : ''}${r.infected ? ' 🖤' : ''}${pl?.alive ? '' : ' 💀'}</div>`;
    })
    .join('');
  const log = v.nightLog?.length ? `<details class="night-log"><summary>🌙 Ce qui s’est passé chaque nuit</summary><ul>${v.nightLog.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>` : '';
  el.innerHTML = `<h2>${esc(v.winner.title)}</h2><div class="final-grid">${items}</div>${log}
    <p class="back-lobby">🔄 Retour au lobby dans <b id="go-count"></b>… <span class="muted">(même groupe, même code)</span></p>
    <div class="row" style="justify-content:center"><button class="btn" id="btn-quit-end">Quitter</button></div>`;
  $('btn-quit-end').onclick = () => {
    voice.stop();
    safe(client.leave());
  };
  renderGameOverCount();
}

// ================================================================== NARRATEUR & ÉVÉNEMENTS
const PHASE_LINES = {
  ROLE_DISTRIBUTION: ['Les cartes sont distribuées…', 'info'],
  NIGHT_START: ['Le village s’endort…', 'night'],
  SUNRISE: ['Le village se réveille…', 'info'],
  CAPTAIN_ELECTION: ['Le village élit son Capitaine', 'vote'],
  FREE_DISCUSSION: ['Discussion libre !', 'info'],
  VOTING: ['Le village passe au vote…', 'vote'],
};

function onTransitions(v, prev) {
  const ph = v.phase;
  // Écran de victoire (5 s) : le narrateur se tait pour laisser voir le vainqueur.
  if (v.status === 'finished') {
    if (prev?.status !== 'finished') narrator.hush();
    ui.lastAnn = v.announcements.length ? v.announcements[v.announcements.length - 1].id : '';
  } else if (prev && prev.phase.seq !== ph.seq) {
    const line = PHASE_LINES[ph.id];
    const urgent = { urgent: true };
    if (line) narrator.say(line[0], line[1], urgent);
    else if (NIGHT_PHASES.has(ph.id) && ph.id !== 'NIGHT_RESOLUTION') narrator.say(`${ph.label}…`, 'night', urgent);
    else if (ph.id === 'PLAYER_SPEECH') narrator.say(`${numName(v, ph.speakerId)} a la parole`, 'info', urgent);
    else if (ph.id === 'DEATH_LAST_WORD') narrator.say(`Dernière parole de ${nameOf(v, ph.speakerId)}`, 'death', urgent);
  }
  // Annonces publiques marquantes (morts, votes, victoire) — jamais les rôles.
  const anns = v.announcements;
  if (ui.lastAnn === null) ui.lastAnn = anns.length ? anns[anns.length - 1].id : '';
  else {
    const idx = anns.findIndex((a) => a.id === ui.lastAnn);
    const fresh = idx >= 0 ? anns.slice(idx + 1) : anns.slice(-3);
    // Lever du jour avec mort(s) cette nuit : cœur qui s'arrête + un coup de glas (pas d'oiseaux ce matin-là).
    if (ph.id === 'SUNRISE' && fresh.some((a) => a.kind === 'death' && a.text.startsWith('💀') && /cette nuit/.test(a.text))) {
      ui.noBirdsUntil = Date.now() + 8000;
      sfx.nightDeath();
    }
    for (const a of fresh) if ((['death', 'vote', 'victory'].includes(a.kind) || /Capitaine/.test(a.text)) && !a.text.startsWith('🗳️')) narrator.say(a.text.replace(/^[^\p{L}]+/u, ''), a.kind === 'victory' ? 'victory' : a.kind === 'death' ? 'death' : 'vote');
    if (anns.length) ui.lastAnn = anns[anns.length - 1].id;
  }

  // Chasseur : le pion se relève pour viser, puis tire sur sa cible.
  if (ph.id === 'HUNTER_SHOT' && ph.subjectId) {
    ui.aiming = ph.subjectId;
    ui.deferDeath.add(ph.subjectId);
  }
  if (prev?.phase.id === 'HUNTER_SHOT' && prev.phase.subjectId && ph.seq !== prev.phase.seq) {
    const shooter = prev.phase.subjectId;
    const victim = v.players.find((p) => !p.alive && prev.players.find((q) => q.id === p.id)?.alive && p.id !== shooter);
    if (victim) {
      ui.deferDeath.add(victim.id);
      board.hunterShot(shooter, victim.id).then(async () => {
        ui.deferDeath.delete(victim.id);
        board.update(client.view, ui);
        await wait(500);
        ui.aiming = null;
        ui.deferDeath.delete(shooter);
        board.update(client.view, ui);
      });
    } else {
      ui.aiming = null;
      ui.deferDeath.delete(shooter);
    }
  }
}

async function maybeReveal(v) {
  const r = v.me.role;
  if (!r || v.status !== 'running' || ui.revealing) return;
  const key = `blackops:revealed:${profile}:${v.code}:${v.me.id}`;
  let done = '';
  try {
    done = sessionStorage.getItem(key) ?? '';
  } catch {
    /* stockage indisponible */
  }
  if (done === r.id) return;
  try {
    sessionStorage.setItem(key, r.id);
  } catch {
    /* ignore */
  }
  ui.revealing = true;
  renderMe(v);
  // Rôles en jeu pour le défilement (composition publique de la partie).
  const pool = Object.keys(v.composition ?? {})
    .map((id) => v.roleCatalog.find((x) => x.id === id))
    .filter(Boolean)
    .map((x) => ({ id: x.id, name: x.name }));
  await revealCard($('card-layer'), r, $('my-card'), { pool, onTick: (i, last) => (last ? sfx.revealHit() : sfx.tick(i)) });
  ui.revealing = false;
  if (client.view) renderMe(client.view);
}

// ================================================================== RENDU
function show(screen) {
  for (const s of ['home', 'lobby', 'game']) $(`screen-${s}`).classList.toggle('active', s === screen);
  document.body.classList.toggle('in-game', screen === 'game');
  document.body.classList.toggle('at-home', screen === 'home');
  board.fit();
}

let firstView = true;
function render() {
  const v = client.view;
  if (!v) {
    // Retour à l'accueil (fin de partie quittée) : statistiques rafraîchies.
    if (!$('screen-home').classList.contains('active')) renderHome();
    show('home');
    // Accueil : le village de nuit, lumières allumées (ambiance de la maquette).
    board.setSky('night', false);
    board.update(null);
    return;
  }
  // Ciel : animé à chaque changement, immédiat à la (re)connexion.
  board.setSky(v.status === 'lobby' ? 'day' : v.status === 'finished' ? 'day' : v.phase.sky, !firstView);
  firstView = false;
  if (v.status === 'lobby') {
    show('lobby');
    board.update(v, ui);
    renderLobby(v);
    return;
  }
  show('game');
  $('code').textContent = v.code;
  renderPhase(v);
  renderMe(v);
  renderAction(v);
  renderChats(v);
  renderGameOver(v);
  renderRolesPanel(v);
  board.update(v, ui);
  // Plus de flèches sur le plateau : qui a voté pour qui s'affiche seulement en bas.
  board.showVotes(null);
  renderTimer();
  $('btn-leave-game').textContent = v.status === 'finished' ? 'Quitter' : 'Quitter la partie (abandon)';
}

/** Amoureux : animation « coup de foudre » visible uniquement par les deux amoureux. */
function showLovers(v) {
  const me = v.players.find((p) => p.isMe);
  const lover = v.players.find((p) => p.id === v.me.lover?.id);
  if (!me || !lover) return;
  document.querySelector('.lovers-big')?.remove();
  const el = document.createElement('div');
  el.className = 'lovers-big';
  const hearts = Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 7.3 + 3) % 100}%;animation-delay:${(i * 0.23) % 2.2}s;font-size:${22 + ((i * 11) % 26)}px">❤️</i>`).join('');
  el.innerHTML = `<div class="hearts">${hearts}</div>
    <div class="lovers-card">
      <span class="lv-title">Coup de foudre !</span>
      <div class="lv-pair"><span class="lv-fig">${characterSVG(me.avatar)}</span><span class="lv-heart">❤️</span><span class="lv-fig flip">${characterSVG(lover.avatar)}</span></div>
      <span class="lv-text">Tu es amoureux(se) de <b>${esc(lover.name)}</b></span>
      <span class="lv-rule">Si l’un de vous meurt, l’autre meurt de chagrin. 💔</span>
    </div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 5200);
  setTimeout(() => el.remove(), 5700);
}
function maybeShowLovers(v) {
  if (!v.me.lover || v.status !== 'running') return;
  const key = `blackops:lover:${profile}:${v.code}:${v.me.id}`;
  let seen = '';
  try {
    seen = sessionStorage.getItem(key) ?? '';
  } catch {
    /* stockage indisponible */
  }
  if (seen === v.me.lover.id) return;
  try {
    sessionStorage.setItem(key, v.me.lover.id);
  } catch {
    /* ignore */
  }
  showLovers(v);
}

/**
 * Voyante : une carte face cachée se retourne sur la carte générique LOUP ou CIVIL
 * (jamais le rôle exact). Le résultat vient du message privé calculé par le serveur.
 */
function showSeerCard(name, result) {
  const wolf = result === 'LOUP';
  const el = document.createElement('div');
  el.className = `seer-big ${wolf ? 'wolf' : 'civil'}`;
  el.innerHTML = `<div class="seer-flip"><span class="big-name">🔮 ${esc(name)}</span>
    <div class="sf-card"><div class="sf-face back">${cardBackSVG()}</div><div class="sf-face front">${seerCardSVG(result)}</div></div></div>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('flipped');
    sfx.revealHit?.();
  }, 650);
  setTimeout(() => el.classList.add('out'), 3400);
  setTimeout(() => el.remove(), 3800);
}

// Messages privés : la Voyante voit son résultat directement sur le personnage.
const SEER_RE = /^🔮 (.+) : (LOUP|CIVIL)$/;
function onPrivate(v) {
  const log = v?.privateLog ?? [];
  const know = new Map();
  for (const m of log) {
    const r = m.kind === 'seer' && SEER_RE.exec(m.text);
    const p = r && v.players.find((x) => x.name === r[1]);
    if (p) know.set(p.id, r[2]);
  }
  ui.seerKnow = know;
  const last = log.length ? log[log.length - 1].id : '';
  if (ui.lastPriv === undefined) {
    ui.lastPriv = last; // (re)connexion : on ne rejoue pas l'historique
    return;
  }
  const idx = log.findIndex((m) => m.id === ui.lastPriv);
  for (const m of idx >= 0 ? log.slice(idx + 1) : []) {
    const r = m.kind === 'seer' && SEER_RE.exec(m.text);
    const p = r && v.players.find((x) => x.name === r[1]);
    if (p) showSeerCard(p.name, r[2]);
  }
  ui.lastPriv = last;
}

client.addEventListener('view', (e) => {
  const v = e.detail;
  closeStaleThief(v);
  autoVoice(v);
  onPrivate(v);
  if (v && v.status !== 'lobby') onTransitions(v, ui.prev);
  if (!v || v.status === 'lobby') {
    // Retour au lobby : la prochaine partie rejouera la révélation de la carte.
    if (v)
      try {
        sessionStorage.removeItem(`blackops:revealed:${profile}:${v.code}:${v.me.id}`);
        sessionStorage.removeItem(`blackops:lover:${profile}:${v.code}:${v.me.id}`);
      } catch {
        /* stockage indisponible */
      }
    ui.lastAnn = null;
    ui.lastPriv = undefined;
    ui.deferDeath.clear();
    ui.aiming = null;
  }
  ui.prev = v;
  render();
  if (v) {
    maybeReveal(v);
    maybeShowLovers(v);
  }
});
client.addEventListener('status', (e) => {
  const el = $('conn');
  el.classList.toggle('bad', e.detail !== 'connected');
  el.title = { connected: 'Connecté', disconnected: 'Déconnecté', reconnecting: 'Reconnexion…', connecting: 'Connexion…' }[e.detail] ?? e.detail;
});
client.addEventListener('session-lost', (e) => {
  toast(e.detail.message);
  render();
});
client.addEventListener('kicked', (e) => {
  toast(e.detail);
  voice.stop();
  render();
});
render();
