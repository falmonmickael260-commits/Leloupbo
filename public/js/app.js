/**
 * Interface TEMPORAIRE de test (phase 1).
 * Elle se contente d'afficher la vue envoyée par le serveur et de renvoyer des
 * intentions via GameClient. Aucune règle n'est codée ici : elle sera remplacée
 * par le plateau animé en phase 2 sans toucher au moteur.
 */
import { GameClient } from './gameClient.js';
import { VoiceMesh } from './voice.js';

const params = new URLSearchParams(location.search);
const client = new GameClient({ profile: params.get('profile') || 'default' });
const voice = new VoiceMesh(client);
window.blackops = { client, voice }; // pratique pour déboguer depuis la console

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nameOf = (v, id) => v.players.find((p) => p.id === id)?.name ?? '?';
const time = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const SKY = { day: '☀️', sunset: '🌇', night: '🌙', moon: '🌕', dawn: '🌅' };
const TEAM = { village: 'Village', wolves: 'Loups-Garous', white_wolf: 'Solitaire (Loup-Blanc)', lovers: 'Amoureux', none: '—' };

// État purement local à l'interface (sélection en cours, onglet).
const ui = { selected: [], option: null, promptKey: '', tab: 'events', seenTabs: {} };

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 3500);
}
const safe = (p) => p.catch((e) => toast(e.message));

// ------------------------------------------------------------------ accueil
$('name').value = localStorage.getItem('blackops:name') || '';
$('join-code').value = params.get('code') || '';
const myName = () => {
  const n = $('name').value.trim();
  localStorage.setItem('blackops:name', n);
  if (!n) throw new Error('Choisissez un pseudo.');
  return n;
};
$('btn-create').onclick = () => safe(Promise.resolve().then(() => client.create(myName())));
$('btn-join').onclick = () => safe(Promise.resolve().then(() => client.join($('join-code').value.trim().toUpperCase(), myName())));

// ------------------------------------------------------------------ lobby
$('btn-add-bot').onclick = () => safe(client.addBot());
$('btn-start').onclick = () => safe(client.start());
$('btn-leave-lobby').onclick = () => safe(client.leave());
$('btn-leave-game').onclick = () => {
  if (client.view?.status === 'finished' || confirm('Quitter la partie ? Votre personnage sera considéré comme ayant abandonné (mort).')) {
    voice.stop();
    safe(client.leave());
  }
};

function renderLobby(v) {
  const isHost = v.me.isHost;
  document.querySelectorAll('.host-only').forEach((el) => (el.style.display = isHost ? '' : 'none'));
  document.querySelector('.host-hint').textContent = isHost
    ? 'Vous êtes l’Hôte : choisissez les rôles disponibles. La distribution sera aléatoire.'
    : 'Seul l’Hôte peut modifier la composition.';
  $('lobby-code').textContent = v.code;
  $('lobby-count').textContent = `(${v.players.length}/${v.settings.maxPlayers})`;
  $('lobby-players').innerHTML = v.players
    .map(
      (p) => `<li><span>${p.isHost ? '⭐ ' : ''}${p.isBot ? '🤖 ' : ''}${esc(p.name)}${p.isMe ? ' <span class="muted">(vous)</span>' : ''}${p.connected ? '' : ' 📴'}</span>
      ${isHost && !p.isMe ? `<button class="small" data-kick="${esc(p.id)}">Exclure</button>` : ''}</li>`,
    )
    .join('');
  $('lobby-players').querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => safe(client.kick(b.dataset.kick))));

  const s = v.settings;
  const roles = v.roleCatalog.filter((r) => r.distributable && r.id !== 'villager');
  const dis = isHost ? '' : 'disabled';
  const roleRows = roles
    .map((r) => {
      const n = s.roles[r.id] ?? 0;
      const max = r.unique ? 1 : 18;
      return `<div class="settings-row"><span title="${esc(r.description)}">${r.emoji} ${esc(r.name)}</span>
        <span class="counter"><button class="small" data-role="${r.id}" data-d="-1" ${dis || (n <= 0 ? 'disabled' : '')}>−</button><span>${n}</span>
        <button class="small" data-role="${r.id}" data-d="1" ${dis || (n >= max ? 'disabled' : '')}>+</button></span></div>`;
    })
    .join('');
  const check = (key, label) =>
    `<div class="settings-row"><span>${label}</span><input type="checkbox" data-bool="${key}" ${s[key] ? 'checked' : ''} ${dis}/></div>`;
  $('settings').innerHTML = `
    ${roleRows}
    <hr/>
    <div class="settings-row"><span>Joueurs max</span><select data-select="maxPlayers" ${dis}>${Array.from({ length: 15 }, (_, i) => i + 4)
      .map((n) => `<option ${n === s.maxPlayers ? 'selected' : ''}>${n}</option>`)
      .join('')}</select></div>
    <div class="settings-row"><span>Durées</span><select data-select="durationPreset" ${dis}>
      <option value="normal" ${s.durationPreset === 'normal' ? 'selected' : ''}>Normales (30 s / 60 s / 20 s)</option>
      <option value="fast" ${s.durationPreset === 'fast' ? 'selected' : ''}>Rapides (test)</option></select></div>
    <div class="settings-row"><span>Égalité au vote</span><select data-select="tieRule" ${dis}>
      <option value="none" ${s.tieRule === 'none' ? 'selected' : ''}>Personne n’est éliminé</option>
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
    ${check('simulateInactiveSteps', 'Simuler les phases des rôles morts')}`;

  const el = $('settings');
  el.querySelectorAll('[data-role]').forEach(
    (b) =>
      (b.onclick = () => {
        const next = { ...s.roles, [b.dataset.role]: Math.max(0, (s.roles[b.dataset.role] ?? 0) + Number(b.dataset.d)) };
        safe(client.updateSettings({ roles: next }));
      }),
  );
  el.querySelectorAll('[data-bool]').forEach((c) => (c.onchange = () => safe(client.updateSettings({ [c.dataset.bool]: c.checked }))));
  el.querySelectorAll('[data-select]').forEach(
    (c) =>
      (c.onchange = () => {
        const k = c.dataset.select;
        safe(client.updateSettings({ [k]: k === 'maxPlayers' ? Number(c.value) : c.value }));
      }),
  );

  // Aperçu de la composition (indicatif : la validation réelle est faite par le serveur).
  const n = v.players.length;
  const thief = (s.roles.thief ?? 0) > 0;
  const specials = Object.values(s.roles).reduce((a, b) => a + b, 0);
  const villagers = n + (thief ? 2 : 0) - specials;
  $('composition-preview').innerHTML =
    `${n} joueur(s)${thief ? ' + 2 cartes pour le Voleur' : ''} → ${villagers >= 0 ? `${villagers} Simple(s) Villageois en complément` : '<b style="color:var(--danger)">trop de rôles</b>'}. Minimum 4 joueurs.`;
  $('btn-start').disabled = n < 4 || villagers < 0;
}

// ------------------------------------------------------------------ partie
function renderPhase(v) {
  const ph = v.phase;
  $('phase-bar').className = `phase-bar ${ph.sky}`;
  $('sky').textContent = SKY[ph.sky] ?? '';
  $('phase-label').textContent = ph.label;
  const parts = [];
  if (ph.night) parts.push(`Nuit ${ph.night}`);
  if (ph.day) parts.push(`Jour ${ph.day}`);
  if (ph.speakerId) parts.push(`🎙️ ${nameOf(v, ph.speakerId)} a la parole`);
  if (ph.subjectId) parts.push(`👉 ${nameOf(v, ph.subjectId)}`);
  if (ph.speechOrder && ph.id === 'PLAYER_SPEECH') {
    const i = ph.speechOrder.indexOf(ph.speakerId);
    parts.push(`tour ${i + 1}/${ph.speechOrder.length}`);
  }
  $('phase-sub').textContent = parts.join(' · ');
}

function renderTimer() {
  const ms = client.timeLeft();
  const el = $('timer');
  if (ms === null || !client.view || client.view.status !== 'running') {
    el.textContent = '';
    return;
  }
  const s = Math.ceil(ms / 1000);
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('low', s <= 5);
}
setInterval(renderTimer, 200);

function promptKey(v) {
  return `${v.phase.seq}:${v.prompt?.action ?? ''}`;
}

function renderPlayers(v) {
  const p = v.prompt;
  const canTarget = p && (!p.submitted || p.canChange) && p.maxTargets > 0;
  const voiceSpeakers = new Set();
  if (v.phase.speakerId) voiceSpeakers.add(v.phase.speakerId);
  $('players').innerHTML = v.players
    .map((pl) => {
      const cls = ['pcard'];
      if (pl.isMe) cls.push('me');
      if (!pl.alive) cls.push('dead');
      if (!pl.connected) cls.push('offline');
      if (voiceSpeakers.has(pl.id)) cls.push('speaking');
      const targetable = canTarget && p.targets.includes(pl.id);
      if (targetable) cls.push('targetable');
      if (ui.selected.includes(pl.id)) cls.push('selected');
      if (p?.current?.includes(pl.id)) cls.push('voted');
      const lover = v.me.lover?.id === pl.id ? '❤️' : '';
      const wolf = v.me.pack?.some((w) => w.id === pl.id) && !pl.isMe ? '🐺' : '';
      const badges = `${pl.isCaptain ? '👑' : ''}${pl.isHost ? '⭐' : ''}${pl.isBot ? '🤖' : ''}${lover}${wolf}${pl.alive ? '' : '💀'}`;
      return `<div class="${cls.join(' ')}" data-id="${esc(pl.id)}"><div class="pname">${esc(pl.name)}</div><div class="pbadges">${badges}</div>
        <div class="muted" style="font-size:11px">${pl.isMe ? 'vous' : `siège ${pl.seat + 1}`}</div></div>`;
    })
    .join('');
  $('players').querySelectorAll('.pcard.targetable').forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.id;
        if (p.action === 'vote' || p.action === 'wolf_vote') {
          // Vote direct en un clic.
          safe(client.command(p.action, [id]));
          return;
        }
        if (ui.selected.includes(id)) ui.selected = ui.selected.filter((x) => x !== id);
        else {
          ui.selected.push(id);
          if (ui.selected.length > p.maxTargets) ui.selected.shift();
        }
        render();
      }),
  );
}

function renderRole(v) {
  const r = v.me.role;
  if (!r) {
    $('role-card').innerHTML = '';
    return;
  }
  const extra = [];
  if (v.me.lover) extra.push(`❤️ Vous êtes amoureux de <b>${esc(v.me.lover.name)}</b>.`);
  if (v.me.pack) extra.push(`🐺 Meute : ${v.me.pack.map((w) => `${esc(w.name)}${w.alive ? '' : ' 💀'}`).join(', ')}`);
  if (v.me.roleState) {
    const rs = v.me.roleState;
    if ('potionVie' in rs) extra.push(`🧪 Potion de vie : ${rs.potionVie ? 'disponible' : 'utilisée'} · Potion de mort : ${rs.potionMort ? 'disponible' : 'utilisée'}`);
  }
  if (v.me.isCaptain) extra.push('👑 Vous êtes Capitaine (voix double).');
  if (!v.me.alive) extra.push('💀 Vous êtes mort : spectateur, accès au chat des morts.');
  $('role-card').innerHTML = `<div class="row" style="margin:0"><span class="emoji">${r.emoji}</span><div>
    <div class="muted">Votre rôle secret</div><div class="rname">${esc(r.name)}</div><div class="muted">Camp : ${TEAM[r.team] ?? r.team}</div></div></div>
    <p>${esc(r.description)}</p>${extra.map((e) => `<div>${e}</div>`).join('')}`;
}

function renderAction(v) {
  const el = $('action');
  const p = v.prompt;
  if (v.phase.canFinish) {
    const lw = v.phase.id === 'DEATH_LAST_WORD';
    el.innerHTML = `<h3>${lw ? '💀 Votre dernière parole' : '🎙️ C’est votre tour de parole'}</h3>
      <p class="muted">${lw ? 'Expliquez, accusez, défendez-vous. Les autres sont muets.' : 'Vous seul avez le micro.'}</p>
      <button class="danger" id="btn-finish">FINIR</button>`;
    $('btn-finish').onclick = () => safe(client.finish());
    return;
  }
  if (!p) {
    let msg = '';
    if (v.status === 'running') {
      if (!v.me.alive) msg = 'Vous observez la partie depuis l’au-delà.';
      else if (['THIEF_PHASE', 'CUPID_PHASE', 'WEREWOLF_PHASE', 'WHITE_WOLF_PHASE', 'SEER_PHASE', 'SALVATION_PHASE', 'WITCH_PHASE', 'NIGHT_START'].includes(v.phase.id))
        msg = '😴 Vous dormez…';
      else if (v.phase.id === 'ROLE_DISTRIBUTION') msg = '🎴 Découvrez votre rôle (à garder secret).';
    }
    el.innerHTML = msg ? `<p class="muted">${msg}</p>` : '';
    return;
  }
  const key = promptKey(v);
  if (key !== ui.promptKey) {
    ui.promptKey = key;
    ui.selected = [];
    ui.option = null;
  }
  const isVote = p.action === 'vote';
  const isWolf = p.action === 'wolf_vote';
  let html = `<h3>${esc(p.title)}</h3><p class="muted">${esc(p.description)}</p>`;
  if (p.info?.victimName !== undefined) html += `<p>☠️ Victime des loups : <b>${esc(p.info.victimName ?? 'personne')}</b></p>`;
  if (isVote) {
    html += p.submitted ? `<p class="confirm">✅ Votre vote a été enregistré.</p><p class="muted">Vous pouvez changer d’avis en cliquant sur un autre joueur.</p>` : '<p>👉 Cliquez directement sur un joueur du village.</p>';
  } else if (isWolf) {
    html += '<p>👉 Cliquez sur la victime dans le village.</p>';
    const votes = p.info?.packVotes ?? [];
    html += `<div class="wolf-votes">${votes.map((w) => `🐺 ${esc(w.wolfName)} → ${esc(w.targetName ?? '…')}`).join('<br/>')}</div>`;
  } else {
    if (p.options?.length) {
      html += `<div class="options">${p.options
        .map((o) => `<button data-opt="${esc(o.id)}" class="${ui.option === o.id ? 'on' : ''}">${esc(o.label)}</button>`)
        .join('')}</div>`;
    }
    if (p.maxTargets > 0) {
      html += `<p>Sélection : ${ui.selected.map((id) => `<b>${esc(nameOf(v, id))}</b>`).join(' + ') || '<span class="muted">cliquez sur des joueurs</span>'} (${p.minTargets === p.maxTargets ? p.maxTargets : `${p.minTargets}–${p.maxTargets}`})</p>`;
    }
    html += `<div class="row"><button class="primary" id="btn-confirm">Confirmer</button>${p.minTargets === 0 && !p.options ? '<button id="btn-pass">Passer</button>' : ''}</div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('[data-opt]').forEach(
    (b) =>
      (b.onclick = () => {
        ui.option = b.dataset.opt;
        render();
      }),
  );
  const confirmBtn = $('btn-confirm');
  if (confirmBtn) {
    const needsOption = p.options?.length && !ui.option;
    const needTargets = p.options ? (ui.option === 'kill' || ui.option === 'save_kill' ? 1 : 0) : p.minTargets;
    confirmBtn.disabled = needsOption || ui.selected.length < needTargets;
    confirmBtn.onclick = () => {
      const targets = p.options && !(ui.option === 'kill' || ui.option === 'save_kill') ? [] : ui.selected;
      safe(client.command(p.action, targets, ui.option ?? undefined));
    };
  }
  const pass = $('btn-pass');
  if (pass) pass.onclick = () => safe(client.command(p.action, []));
}

function renderVoice(v, elId = 'voice') {
  const st = voice.state();
  const vo = v.voice;
  const modes = { open: 'Discussion ouverte', turn: 'Tour de parole', last_word: 'Dernière parole', wolves: 'Canal privé des Loups', muted: 'Micros coupés' };
  $(elId).innerHTML = `<h2>🎙️ Voix</h2>
    <div>Mode : <b>${modes[vo.mode]}</b> — ${vo.canSpeak ? '<span class="confirm">votre micro est autorisé</span>' : '<span class="muted">votre micro est coupé</span>'}</div>
    <div class="muted">Vous entendez : ${vo.hearFrom.length ? vo.hearFrom.map((id) => esc(nameOf(v, id))).join(', ') : 'personne'}</div>
    <div class="row">${st.active ? `<button class="btn-voice-off">Quitter l’audio</button> <span class="muted">${st.hasMic ? (st.transmitting ? '🔴 vous émettez' : 'micro prêt') : 'écoute seule'} · ${st.peers} pair(s)</span>` : '<button class="btn-voice-on">Activer l’audio (micro)</button>'}</div>`;
  // Un seul panneau voix affiché à la fois (lobby ou partie).
  $(elId === 'voice' ? 'lobby-voice' : 'voice').innerHTML = '';
  const on = $(elId).querySelector('.btn-voice-on');
  if (on) on.onclick = () => safe(voice.start());
  const off = $(elId).querySelector('.btn-voice-off');
  if (off) off.onclick = () => voice.stop();
}
voice.addEventListener('change', () => client.view && renderVoice(client.view, client.view.status === 'lobby' ? 'lobby-voice' : 'voice'));

function renderGameOver(v) {
  if (v.status !== 'finished' || !v.winner) {
    $('gameover').innerHTML = '';
    return;
  }
  const w = new Set(v.winner.winnerIds);
  const rows = (v.finalRoles ?? [])
    .map((r) => {
      const pl = v.players.find((p) => p.id === r.id);
      return `<tr class="${w.has(r.id) ? 'win' : ''}"><td>${esc(pl?.name)}</td><td>${esc(r.roleName)}</td><td>${r.loverId ? `❤️ ${esc(nameOf(v, r.loverId))}` : ''}</td><td>${pl?.alive ? 'vivant' : '💀'}</td><td>${w.has(r.id) ? '🏆' : ''}</td></tr>`;
    })
    .join('');
  $('gameover').innerHTML = `<h2>${esc(v.winner.title)}</h2><table class="final">${rows}</table>
    ${v.me.isHost ? '<div class="row"><button class="primary" id="btn-reset">Rejouer avec les mêmes joueurs</button></div>' : ''}`;
  const r = $('btn-reset');
  if (r) r.onclick = () => safe(client.reset());
}

// ------------------------------------------------------------------ onglets & chat
function tabsFor(v) {
  const t = [
    ['events', '📜 Annonces'],
    ['private', '🔒 Privé'],
    ['village', '💬 Village'],
  ];
  if (v.chats.wolves) t.push(['wolves', '🐺 Loups']);
  if (v.chats.dead) t.push(['dead', '💀 CHAT DES MORTS']);
  return t;
}

function renderTabs(v) {
  const tabs = tabsFor(v);
  if (!tabs.some(([id]) => id === ui.tab)) ui.tab = 'events';
  $('tabs').innerHTML = tabs.map(([id, label]) => `<button data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">${label}</button>`).join('');
  $('tabs').querySelectorAll('[data-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        ui.tab = b.dataset.tab;
        render();
      }),
  );
  let items = [];
  if (ui.tab === 'events') items = v.announcements.map((a) => `<div class="item"><span class="at">${time(a.at)}</span>${esc(a.text)}</div>`);
  else if (ui.tab === 'private') items = v.privateLog.map((m) => `<div class="item"><span class="at">${time(m.at)}</span>${esc(m.text)}</div>`);
  else items = (v.chats[ui.tab] ?? []).map((m) => `<div class="item"><span class="at">${time(m.at)}</span><span class="who">${esc(m.authorName)}</span> : ${esc(m.text)}</div>`);
  const body = $('tab-body');
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
  body.innerHTML = items.join('') || '<div class="muted">Rien pour l’instant.</div>';
  if (atBottom) body.scrollTop = body.scrollHeight;

  const isChat = ['village', 'wolves', 'dead'].includes(ui.tab);
  const canWrite = isChat && v.chatWrite[ui.tab];
  $('chat-form').classList.toggle('hidden', !isChat);
  $('chat-input').disabled = !canWrite;
  $('chat-input').placeholder = canWrite ? 'Message…' : 'Vous ne pouvez pas écrire ici maintenant.';
}

$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text) return;
  safe(client.chat(ui.tab, text).then(() => ($('chat-input').value = '')));
};

// ------------------------------------------------------------------ rendu global
function show(screen) {
  for (const s of ['home', 'lobby', 'game']) $(`screen-${s}`).classList.toggle('active', s === screen);
}

function render() {
  const v = client.view;
  $('code').textContent = v ? `Partie ${v.code}` : '';
  if (!v) return show('home');
  if (v.status === 'lobby') {
    show('lobby');
    renderLobby(v);
    renderVoice(v, 'lobby-voice');
    return;
  }
  show('game');
  renderPhase(v);
  renderPlayers(v);
  renderRole(v);
  renderAction(v);
  renderVoice(v);
  renderGameOver(v);
  renderTabs(v);
  renderTimer();
  $('btn-leave-game').textContent = v.status === 'finished' ? 'Quitter' : 'Quitter la partie (abandon)';
}

client.addEventListener('view', render);
client.addEventListener('status', (e) => {
  const el = $('conn');
  const labels = { connected: 'connecté', disconnected: 'déconnecté', reconnecting: 'reconnexion…', connecting: 'connexion…' };
  el.textContent = labels[e.detail] ?? e.detail;
  el.className = `pill ${e.detail === 'connected' ? 'ok' : 'bad'}`;
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
