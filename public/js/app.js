/**
 * Interface du Village des Blackops (direction artistique BD).
 *
 * Ce fichier ne contient AUCUNE règle de jeu : il affiche la vue envoyée par
 * le serveur (plateau, interface, narrateur, cartes) et renvoie des intentions
 * via GameClient. Toute validation reste côté serveur.
 */
import { CHARACTERS, characterSVG } from './art/characters.js';
import { cardSVG } from './art/cards.js';
import { Board, wait } from './board/board.js';
import { Narrator, revealCard } from './board/overlays.js';
import { GameClient } from './gameClient.js';
import { Voice } from './voiceManager.js';

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

// ================================================================== ACCUEIL
$('name').value = localStorage.getItem('blackops:name') || '';
$('join-code').value = params.get('code') || '';
const myName = () => {
  const n = $('name').value.trim();
  localStorage.setItem('blackops:name', n);
  if (!n) throw new Error('Choisis un pseudo.');
  return n;
};
/**
 * Débloque le son du navigateur pendant le clic (geste exigé par iPhone / Android)
 * et demande l'accès au micro tout de suite, pour que la voix soit prête.
 */
function primeAudio() {
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
  safe(Promise.resolve().then(() => client.create(myName())));
};
$('btn-join').onclick = () => {
  primeAudio();
  safe(Promise.resolve().then(() => client.join($('join-code').value.trim().toUpperCase(), myName())));
};

// ================================================================== LOBBY
$('btn-add-bot').onclick = () => safe(client.addBot());
$('btn-start').onclick = () => safe(client.start());
$('btn-leave-lobby').onclick = () => safe(client.leave());

function renderLobby(v) {
  const isHost = v.me.isHost;
  document.querySelectorAll('.host-only').forEach((el) => (el.style.display = isHost ? '' : 'none'));
  document.querySelector('.host-hint').textContent = isHost
    ? 'Tu es l’Hôte : choisis les rôles. La distribution sera aléatoire.'
    : 'Seul l’Hôte peut modifier la composition.';
  $('lobby-code').textContent = v.code;
  $('lobby-count').textContent = `(${v.players.length}/${v.settings.maxPlayers})`;
  $('lobby-players').innerHTML = v.players
    .map(
      (p) => `<li data-pid="${esc(p.id)}" class="${ui.talking.has(p.id) ? 'talking' : ''}"><span class="head">${characterSVG(p.avatar)}</span><span class="grow">${p.isHost ? '⭐ ' : ''}${p.isBot ? '🤖 ' : ''}${esc(p.name)}${p.isMe ? ' <span class="muted">(toi)</span>' : ''}${p.connected ? '' : ' 📴'}</span>
      ${p.isBot ? '' : `<span class="aud ${p.audio.mic ? 'ok' : ''}" title="Micro">🎙️</span><span class="aud ${p.audio.speaker ? 'ok' : ''}" title="Haut-parleur">🔊</span>`}
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
      return `<div class="settings-row"><span title="${esc(r.description)}">${r.emoji} ${esc(r.name)}</span>
        <span class="counter"><button class="btn small" data-role="${r.id}" data-d="-1" ${dis || (n <= 0 ? 'disabled' : '')}>−</button><span>${n}</span>
        <button class="btn small" data-role="${r.id}" data-d="1" ${dis || (n >= max ? 'disabled' : '')}>+</button></span></div>`;
    })
    .join('');
  const check = (key, label) => `<div class="settings-row"><span>${label}</span><input type="checkbox" data-bool="${key}" ${s[key] ? 'checked' : ''} ${dis}/></div>`;
  $('settings').innerHTML = `
    ${roleRows}
    <hr/>
    <div class="settings-row"><span>Joueurs max</span><select data-select="maxPlayers" ${dis}>${Array.from({ length: 15 }, (_, i) => i + 4)
      .map((n) => `<option ${n === s.maxPlayers ? 'selected' : ''}>${n}</option>`)
      .join('')}</select></div>
    <div class="settings-row"><span>Durées</span><select data-select="durationPreset" ${dis}>
      <option value="normal" ${s.durationPreset === 'normal' ? 'selected' : ''}>Normales</option>
      <option value="fast" ${s.durationPreset === 'fast' ? 'selected' : ''}>Rapides (test)</option></select></div>
    <div class="settings-row"><span>Égalité au vote</span><select data-select="tieRule" ${dis}>
      <option value="none" ${s.tieRule === 'none' ? 'selected' : ''}>Personne</option>
      <option value="random" ${s.tieRule === 'random' ? 'selected' : ''}>Tirage au sort</option></select></div>
    <div class="settings-row"><span>Voyante sur le Loup-Blanc</span><select data-select="whiteWolfSeerResult" ${dis}>
      <option ${s.whiteWolfSeerResult === 'LOUP' ? 'selected' : ''}>LOUP</option>
      <option ${s.whiteWolfSeerResult === 'CIVIL' ? 'selected' : ''}>CIVIL</option></select></div>
    ${check('captainEnabled', '👑 Élection du Capitaine')}
    ${check('wolvesWinAtParity', 'Loups gagnants à parité')}
    ${check('witchCanSelfSave', 'Sorcière peut se sauver')}
    ${check('salvateurCanSelfProtect', 'Salvateur peut se protéger')}
    ${check('cupidWinsWithLovers', 'Cupidon gagne avec un couple mixte')}
    ${check('endVoteWhenAllVoted', 'Clore le vote quand tous ont voté')}
    ${check('revealVotes', '🗳️ Montrer qui a voté contre qui au résultat')}
    ${check('simulateInactiveSteps', 'Simuler les phases des rôles morts')}`;
  const el = $('settings');
  el.querySelectorAll('[data-role]').forEach(
    (b) => (b.onclick = () => safe(client.updateSettings({ roles: { ...s.roles, [b.dataset.role]: Math.max(0, (s.roles[b.dataset.role] ?? 0) + Number(b.dataset.d)) } }))),
  );
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
  // Avertissement (non bloquant) : joueurs dont le son n'est pas vérifié.
  const notReady = v.players.filter((p) => !p.isBot && (!p.audio.mic || !p.audio.speaker)).map((p) => p.name);
  $('sound-warning').textContent = notReady.length ? `🔊 Son pas encore vérifié pour : ${notReady.join(', ')}` : '';
}

// ================================================================== TEST DU SON
const audioStatus = { mic: false, speaker: false, connected: false };
let audioKey = '';
let loudTicks = 0;
function reportAudio() {
  const key = `${audioStatus.mic}|${audioStatus.speaker}|${audioStatus.connected}`;
  if (key === audioKey || !client.view) return;
  audioKey = key;
  client.request('player:audio', { ...audioStatus }).catch(() => (audioKey = ''));
}
// Jauge du micro + détection automatique « micro OK » quand on parle.
setInterval(() => {
  const v = client.view;
  if (!v || v.status === 'finished') return;
  const st = voice.state();
  audioStatus.connected = !!st.active;
  const lvl = st.active ? voice.level() : 0;
  if (v.status === 'lobby') {
    $('mic-meter').style.width = `${Math.round(lvl * 100)}%`;
    const ms = $('mic-state');
    if (!st.active) ms.textContent = ui.voiceError ? 'Son indisponible' : 'Connexion…';
    else if (!st.hasMic) ((ms.textContent = 'Micro refusé ✘'), (ms.className = 'st-state ko'));
    else if (audioStatus.mic) ((ms.textContent = 'Micro OK ✔'), (ms.className = 'st-state ok'));
    else ms.textContent = 'Parle pour tester…';
  }
  // Quelques sons nets (voix, « allô ») suffisent ; le bruit de fond reste sous le seuil.
  if (lvl > 0.1) loudTicks++;
  else loudTicks = Math.max(0, loudTicks - 0.05);
  if (!audioStatus.mic && loudTicks >= 3) audioStatus.mic = true;
  reportAudio();
}, 150);

/** Petit carillon joué localement pour vérifier le haut-parleur. */
function playChime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = (window.__blackopsAudio ??= new Ctx());
  ctx.resume?.();
  [660, 880, 990].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    o.type = 'triangle';
    const t = ctx.currentTime + i * 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
}
$('btn-speaker-test').onclick = () => {
  voice.unlockAudio();
  playChime();
  $('spk-confirm').classList.add('show');
};
$('spk-yes').onclick = () => {
  audioStatus.speaker = true;
  $('spk-confirm').classList.remove('show');
  $('sound-help').classList.remove('show');
  $('spk-state').textContent = 'Son OK ✔';
  $('spk-state').className = 'st-state ok';
  reportAudio();
};
$('spk-no').onclick = () => {
  audioStatus.speaker = false;
  $('spk-confirm').classList.remove('show');
  $('sound-help').classList.add('show');
  $('spk-state').textContent = 'Pas de son ✘';
  $('spk-state').className = 'st-state ko';
  reportAudio();
};

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

// ================================================================== PLATEAU
board.addEventListener('pick', (e) => {
  const v = client.view;
  const p = v?.prompt;
  if (!p) return;
  const id = e.detail;
  // Sorcière : toucher un joueur = l'empoisonner (avec ou sans potion de vie).
  if (p.action === 'witch') {
    const ids = (p.options ?? []).map((o) => o.id);
    const option = ui.witchSave && ids.includes('save_kill') ? 'save_kill' : 'kill';
    if (!ids.includes(option)) return;
    safe(client.command('witch', [id], option));
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
  if (r) st.push(`<span>${r.emoji} ${esc(r.name)} · <span class="muted">${TEAM[r.team] ?? ''}</span></span>`);
  if (v.me.lover) st.push(`<span>❤️ Amoureux de <b>${esc(v.me.lover.name)}</b></span>`);
  if (v.me.pack && v.me.pack.length > 1) st.push(`<span>🐺 Meute : ${v.me.pack.filter((w) => w.id !== v.me.id).map((w) => `${esc(w.name)}${w.alive ? '' : ' 💀'}`).join(', ')}</span>`);
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
    btn.innerHTML = '<i>⚠️</i>Son indisponible · réessayer';
  } else if (!st.active) {
    btn.className = 'mic-btn muted';
    btn.innerHTML = '<i>⏳</i>Connexion de la voix…';
  } else if (!st.hasMic) {
    btn.className = 'mic-btn muted';
    btn.innerHTML = '<i>⚠️</i>Micro refusé · autorise-le';
  } else if (v.voice.canSpeak) {
    btn.className = 'mic-btn live';
    btn.innerHTML = '<i>🎙️</i>Ton micro est ouvert';
  } else {
    btn.className = 'mic-btn muted';
    btn.innerHTML = '<i>🔇</i>Micro coupé · pas ton tour';
  }
}

/**
 * Voix automatique : elle se connecte dès qu'on est dans une partie, le micro
 * s'ouvre tout seul quand c'est notre tour (règles du serveur), sans bouton.
 */
async function autoVoice(v) {
  const inGame = v && (v.status === 'lobby' || v.status === 'running');
  if (!inGame) {
    if (voice.state().active) voice.stop();
    ui.voiceTried = false;
    return;
  }
  if (ui.voiceTried || voice.state().active) return;
  ui.voiceTried = true;
  try {
    await voice.start();
    ui.voiceError = false;
  } catch (e) {
    console.warn('[voice]', e);
    ui.voiceError = true;
  }
  renderMic();
}
// Bouton : relance la voix (utile si le micro a été refusé puis autorisé).
$('btn-mic').onclick = () => {
  voice.stop();
  ui.voiceTried = false;
  ui.voiceError = false;
  voice.unlockAudio();
  autoVoice(client.view);
};
voice.addEventListener('change', () => renderMic());
// Certains téléphones bloquent le son tant qu'on n'a pas touché l'écran.
voice.addEventListener('audio', (e) => $('audio-unlock').classList.toggle('show', !!e.detail.blocked));
const unlock = () => voice.unlockAudio();
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
  wolf_vote: '🐺 Touche votre victime',
  seer: '🔮 Touche un joueur pour voir s’il est LOUP ou CIVIL',
  protect: '🛡️ Touche le joueur à protéger cette nuit',
  white_wolf: '🤍 Touche un loup à dévorer, ou passe',
  hunter_shot: '🏹 Touche le joueur que tu emportes avec toi',
  captain_successor: '👑 Touche ton successeur',
  cupid: '💘 Touche les deux joueurs à unir',
};

function renderAction(v) {
  const el = $('action');
  const p = v.prompt;
  if (v.status === 'finished') return (el.innerHTML = '');
  if (v.phase.canFinish) {
    const lw = v.phase.id === 'DEATH_LAST_WORD';
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
      .map(([t, list]) => `<div class="target"><b>${esc(nameOf(v, t))}</b> (${list.reduce((n, x) => n + x.weight, 0)}) ← ${list.map((x) => `${esc(nameOf(v, x.voterId))}${x.weight > 1 ? ' 👑' : ''}`).join(', ')}</div>`)
      .join('');
    el.innerHTML = `<h3>🗳️ Qui a voté contre qui</h3><div class="vote-list">${rows}</div>`;
    return;
  }
  if (!p) {
    let msg = '';
    if (v.status === 'running') {
      if (!v.me.alive) msg = '👻 Tu observes la partie depuis l’au-delà.';
      else if (NIGHT_PHASES.has(v.phase.id)) msg = '😴 Tu dors… le village est plongé dans la nuit.';
      else if (v.phase.id === 'PLAYER_SPEECH') msg = `🎙️ ${esc(nameOf(v, v.phase.speakerId))} a la parole. Écoute bien…`;
      else if (v.phase.id === 'DEATH_LAST_WORD') msg = `💀 Dernière parole de ${esc(nameOf(v, v.phase.speakerId))}.`;
      else if (v.phase.id === 'FREE_DISCUSSION') msg = '🗣️ Discussion libre : tout le monde peut parler !';
    }
    el.innerHTML = msg ? `<p class="quiet">${msg}</p>` : '';
    return;
  }
  const key = `${v.phase.seq}:${p.action}`;
  if (key !== ui.promptKey) {
    ui.promptKey = key;
    ui.selected = [];
    ui.witchSave = false;
  }
  let html = '';
  if (p.action === 'witch') {
    const ids = (p.options ?? []).map((o) => o.id);
    const victim = p.info?.victimName;
    html += `<h3>🧪 ${victim ? `Les loups ont attaqué <b>${esc(victim)}</b>` : 'Personne n’a été attaqué'}</h3>`;
    if (ui.witchSave) {
      html += `<p>💚 ${esc(victim)} sera sauvé(e). ☠️ Touche un joueur pour l’empoisonner aussi, ou termine.</p>
        <div class="row"><button class="btn btn-gold" data-witch="save">Terminer</button></div>`;
    } else {
      const btns = [];
      if (ids.includes('save')) btns.push(`<button class="btn btn-gold" data-witch="${ids.includes('save_kill') ? 'save-then' : 'save'}">💚 Sauver ${esc(victim)}</button>`);
      btns.push('<button class="btn" data-witch="none">Ne rien faire</button>');
      if (ids.includes('kill')) html += '<p>☠️ Pour empoisonner quelqu’un, touche son personnage.</p>';
      html += `<div class="row">${btns.join('')}</div>`;
    }
  } else if (p.action === 'thief') {
    html += `<h3>🦝 ${esc(p.description)}</h3><div class="options">${(p.options ?? []).map((o) => `<button class="btn" data-opt="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>`;
  } else {
    const hint = TAP_HINTS[p.action] ?? esc(p.title);
    if (p.action === 'vote' && p.submitted) html += `<h3>✅ Vote enregistré</h3><p>Touche un autre joueur pour changer d’avis.</p>`;
    else html += `<h3>${hint}</h3>`;
    if (p.action === 'cupid' && ui.selected.length) html += `<p>💘 ${ui.selected.map((id) => `<b>${esc(nameOf(v, id))}</b>`).join(' + ')}…</p>`;
    if (p.action === 'wolf_vote') {
      const votes = (p.info?.packVotes ?? []).filter((w) => w.targetName);
      if (votes.length) html += `<p class="wolf-votes">${votes.map((w) => `🐺 ${esc(w.wolfName)} → <b>${esc(w.targetName)}</b>`).join(' · ')}</p>`;
    }
    if (p.minTargets === 0) html += `<div class="row"><button class="btn" id="btn-pass">${p.action === 'hunter_shot' ? 'Ne pas tirer' : 'Passer'}</button></div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => safe(client.command(p.action, [], b.dataset.opt))));
  el.querySelectorAll('[data-witch]').forEach(
    (b) =>
      (b.onclick = () => {
        const w = b.dataset.witch;
        if (w === 'save-then') {
          ui.witchSave = true;
          return render();
        }
        safe(client.command('witch', [], w));
      }),
  );
  const pass = $('btn-pass');
  if (pass) pass.onclick = () => safe(client.command(p.action, []));
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
  const key = `${v.winner.title}|${v.me.isHost}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const w = new Set(v.winner.winnerIds);
  const items = (v.finalRoles ?? [])
    .map((r) => {
      const pl = v.players.find((p) => p.id === r.id);
      return `<div class="final-item ${w.has(r.id) ? 'win' : ''} ${pl?.alive ? '' : 'dead'}"><div class="mini">${cardSVG(r.role, r.roleName)}</div>${w.has(r.id) ? '🏆 ' : ''}${esc(pl?.name)}${r.loverId ? ' ❤️' : ''}${pl?.alive ? '' : ' 💀'}</div>`;
    })
    .join('');
  el.innerHTML = `<h2>${esc(v.winner.title)}</h2><div class="final-grid">${items}</div>
    <div class="row" style="justify-content:center">${v.me.isHost ? '<button class="btn btn-gold big" id="btn-reset" style="width:auto">Rejouer</button>' : ''}<button class="btn" id="btn-quit-end">Quitter</button></div>`;
  const r = $('btn-reset');
  if (r) r.onclick = () => safe(client.reset());
  $('btn-quit-end').onclick = () => safe(client.leave());
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
  if (prev && prev.phase.seq !== ph.seq) {
    const line = PHASE_LINES[ph.id];
    const urgent = { urgent: true };
    if (line) narrator.say(line[0], line[1], urgent);
    else if (NIGHT_PHASES.has(ph.id) && ph.id !== 'NIGHT_RESOLUTION') narrator.say(`${ph.label}…`, 'night', urgent);
    else if (ph.id === 'PLAYER_SPEECH') narrator.say(`${nameOf(v, ph.speakerId)} a la parole`, 'info', urgent);
    else if (ph.id === 'DEATH_LAST_WORD') narrator.say(`Dernière parole de ${nameOf(v, ph.speakerId)}`, 'death', urgent);
  }
  // Annonces publiques marquantes (morts, votes, victoire) — jamais les rôles.
  const anns = v.announcements;
  if (ui.lastAnn === null) ui.lastAnn = anns.length ? anns[anns.length - 1].id : '';
  else {
    const idx = anns.findIndex((a) => a.id === ui.lastAnn);
    const fresh = idx >= 0 ? anns.slice(idx + 1) : anns.slice(-3);
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
  await revealCard($('card-layer'), r, $('my-card'));
  ui.revealing = false;
  if (client.view) renderMe(client.view);
}

// ================================================================== RENDU
function show(screen) {
  for (const s of ['home', 'lobby', 'game']) $(`screen-${s}`).classList.toggle('active', s === screen);
  document.body.classList.toggle('in-game', screen === 'game');
  board.fit();
}

let firstView = true;
function render() {
  const v = client.view;
  if (!v) {
    show('home');
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
  board.update(v, ui);
  board.showVotes(v.phase.votes);
  renderTimer();
  $('btn-leave-game').textContent = v.status === 'finished' ? 'Quitter' : 'Quitter la partie (abandon)';
}

/** Voyante : la carte LOUP / CIVIL s'affiche en grand au centre pendant 2 secondes. */
function showSeerCard(name, result) {
  const wolf = result === 'LOUP';
  const el = document.createElement('div');
  el.className = `seer-big ${wolf ? 'wolf' : 'civil'}`;
  el.innerHTML = `<div class="big-card"><span class="big-name">🔮 ${esc(name)}</span><span class="big-icon">${wolf ? '🐺' : '🧑‍🌾'}</span><span class="big-word">${wolf ? 'LOUP' : 'CIVIL'}</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2000);
  setTimeout(() => el.remove(), 2400);
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
  autoVoice(v);
  onPrivate(v);
  if (v && v.status !== 'lobby') onTransitions(v, ui.prev);
  if (!v || v.status === 'lobby') {
    ui.lastAnn = null;
    ui.lastPriv = undefined;
    ui.deferDeath.clear();
    ui.aiming = null;
  }
  ui.prev = v;
  render();
  if (v) maybeReveal(v);
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
