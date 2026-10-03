/**
 * Bruitages du jeu, synthétisés en direct (Web Audio) : aucun fichier à charger.
 *
 *   howlPack()  — meute de loups au loin, au coucher du soleil (~9 s).
 *   gunshot()   — tir du Chasseur, court et puissant.
 *
 * Le contexte audio est créé / débloqué au premier geste de l'utilisateur
 * (exigence des navigateurs mobiles) : voir unlock().
 */
let ctx = null;
let master = null;
let reverb = null;

function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  ctx ??= window.__blackopsAudio ??= new Ctx();
  if (!master) {
    master = ctx.createDynamicsCompressor(); // évite toute saturation quand les sons se superposent
    master.threshold.value = -10;
    master.ratio.value = 6;
    master.connect(ctx.destination);
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 3.2, 2.6);
    reverb.connect(master);
  }
  return ctx;
}

/** Réponse impulsionnelle « plein air, vallée » : bruit stéréo qui décroît. */
function impulse(c, seconds, decay) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noiseBuffer(c, seconds, brown = false) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

/** Débloque le son (à appeler dans un geste : toucher, clic, touche). */
export function unlock() {
  const c = audio();
  if (c && c.state !== 'running') c.resume?.().catch(() => {});
  preloadRecorded();
}

function ready() {
  const c = audio();
  if (!c) return null;
  if (c.state !== 'running') c.resume?.().catch(() => {});
  return c.state === 'closed' ? null : c;
}

/** Un hurlement : montée, longue tenue avec léger vibrato, descente. */
function howl(c, out, t0, { base, peak, dur, pan, level }) {
  const osc = c.createOscillator();
  const osc2 = c.createOscillator(); // harmonique : timbre plus « gorge »
  osc.type = 'sine';
  osc2.type = 'triangle';
  // Même courbe de hauteur pour la fondamentale et son octave.
  for (const [param, m] of [[osc.frequency, 1], [osc2.frequency, 2]]) {
    param.setValueAtTime(base * m, t0);
    param.exponentialRampToValueAtTime(peak * m, t0 + dur * 0.28);
    param.setValueAtTime(peak * m, t0 + dur * 0.28);
    param.linearRampToValueAtTime(peak * 0.97 * m, t0 + dur * 0.75);
    param.exponentialRampToValueAtTime(base * 0.8 * m, t0 + dur);
  }

  const vib = c.createOscillator();
  const vibGain = c.createGain();
  vib.frequency.value = 4.5 + Math.random() * 1.5;
  vibGain.gain.setValueAtTime(0, t0);
  vibGain.gain.linearRampToValueAtTime(peak * 0.012, t0 + dur * 0.5);
  vib.connect(vibGain);
  vibGain.connect(osc.frequency);
  const vibGain2 = c.createGain();
  vibGain2.gain.value = 2;
  vibGain.connect(vibGain2).connect(osc2.frequency);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(level, t0 + dur * 0.18);
  env.gain.setValueAtTime(level, t0 + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const h2 = c.createGain();
  h2.gain.value = 0.18;

  // Distance : aigus atténués, beaucoup de réverbération.
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1900;
  const panner = c.createStereoPanner ? c.createStereoPanner() : null;
  if (panner) panner.pan.value = pan;

  osc.connect(env);
  osc2.connect(h2).connect(env);
  env.connect(lp);
  const tail = panner ? (lp.connect(panner), panner) : lp;
  const dry = c.createGain();
  dry.gain.value = 0.35;
  const wet = c.createGain();
  wet.gain.value = 0.9;
  tail.connect(dry).connect(out);
  tail.connect(wet).connect(reverb);

  for (const o of [osc, osc2, vib]) {
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }
}

/** Meute de loups au loin (coucher du soleil → nuit). */
export function howlPack(volume = 0.55) {
  if (playRecorded('meute', volume)) return;
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.05;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);

  // Vent du soir : fond grave qui monte puis s'efface.
  const wind = c.createBufferSource();
  wind.buffer = noiseBuffer(c, 10, true);
  const wlp = c.createBiquadFilter();
  wlp.type = 'lowpass';
  wlp.frequency.value = 420;
  const wg = c.createGain();
  wg.gain.setValueAtTime(0.0001, t);
  wg.gain.exponentialRampToValueAtTime(0.22, t + 2.5);
  wg.gain.setValueAtTime(0.22, t + 6.5);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + 9.8);
  wind.connect(wlp).connect(wg).connect(out);
  wind.start(t);
  wind.stop(t + 10);

  // La meute : un loup ouvre, les autres répondent en accord, de part et d'autre.
  const voices = [
    { at: 0.3, base: 330, peak: 640, dur: 3.8, pan: -0.5, level: 0.5 },
    { at: 1.6, base: 380, peak: 760, dur: 3.4, pan: 0.45, level: 0.38 },
    { at: 2.4, base: 300, peak: 520, dur: 3.9, pan: -0.15, level: 0.34 },
    { at: 3.3, base: 420, peak: 860, dur: 2.9, pan: 0.7, level: 0.26 },
    { at: 4.6, base: 350, peak: 700, dur: 3.2, pan: -0.75, level: 0.22 },
  ];
  for (const v of voices) howl(c, out, t + v.at + Math.random() * 0.25, { ...v, peak: v.peak * (0.97 + Math.random() * 0.06) });
}

/** Échos sur les façades du village : répétitions retardées, de plus en plus sourdes. */
function echoes(c, input, out, taps = [[0.16, 0.38, 2600], [0.37, 0.24, 1800], [0.68, 0.13, 1200], [1.05, 0.07, 900]]) {
  for (const [delay, gain, cut] of taps) {
    const d = c.createDelay(2);
    d.delayTime.value = delay;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cut;
    const g = c.createGain();
    g.gain.value = gain;
    input.connect(d).connect(lp).connect(g).connect(out);
  }
}

/** Saturation légère : donne du « punch » à la détonation. */
function drive(c, amount = 2.5) {
  const ws = c.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  ws.curve = curve;
  return ws;
}

/** Tir du Chasseur : claquement sec, détonation grave saturée, coup sourd, échos sur les maisons. */
export function gunshot(volume = 0.95) {
  if (playRecorded('fusil', volume)) return;
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);
  const bus = c.createGain(); // tout ce qui part en écho
  bus.connect(out);

  // 1. Claquement supersonique (quelques millisecondes, très aigu).
  const crack = c.createBufferSource();
  crack.buffer = noiseBuffer(c, 0.05);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const cg = c.createGain();
  cg.gain.setValueAtTime(1.4, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
  crack.connect(hp).connect(cg).connect(bus);
  crack.start(t);

  // 2. Détonation : bruit filtré qui s'assombrit très vite, saturé.
  const body = c.createBufferSource();
  body.buffer = noiseBuffer(c, 1.2);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(5000, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(180, t + 0.6);
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(1.5, t + 0.004);
  bg.gain.exponentialRampToValueAtTime(0.25, t + 0.12);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  body.connect(lp).connect(drive(c, 3)).connect(bg).connect(bus);
  body.start(t);

  // 3. Coup sourd dans la poitrine.
  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(140, t);
  thump.frequency.exponentialRampToValueAtTime(34, t + 0.3);
  const tg = c.createGain();
  tg.gain.setValueAtTime(1.1, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  thump.connect(tg).connect(out);
  thump.start(t);
  thump.stop(t + 0.4);

  // 4. Échos sur les façades + longue queue de réverbération.
  echoes(c, bus, out);
  const send = c.createGain();
  send.gain.value = 0.55;
  bus.connect(send).connect(reverb);
}

/** Recharge du fusil à pompe (« tchk… tchk ») quand le Chasseur épaule. */
export function shotgunRack(volume = 1.1) {
  if (playRecorded('recharge', volume)) return;
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + 0.02;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);
  const click = (t, freq, ring) => {
    const n = c.createBufferSource();
    n.buffer = noiseBuffer(c, 0.12);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    // tintement métallique
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = ring;
    const og = c.createGain();
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.1);
  };
  click(t0, 2400, 1850); // la pompe recule
  click(t0 + 0.17, 1700, 1320); // la pompe revient : cartouche en place
  const send = c.createGain();
  send.gain.value = 0.2;
  out.connect(send).connect(reverb);
}

/** Lever du jour : oiseaux qui chantent et cloche au loin. */
export function dawn(volume = 0.85) {
  if (playRecorded('jour', volume)) return;
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.05;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);
  const wet = c.createGain();
  wet.gain.value = 0.35;
  out.connect(wet).connect(reverb);

  // Cloche lointaine (synthèse par partiels inharmoniques), deux coups.
  const bell = (tb) => {
    for (const [ratio, amp, dec] of [[1, 0.5, 3.2], [2.0, 0.28, 2.2], [2.4, 0.2, 1.8], [3.0, 0.14, 1.4], [4.2, 0.08, 1.0], [5.4, 0.05, 0.7]]) {
      const o = c.createOscillator();
      o.frequency.value = 392 * ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, tb);
      g.gain.exponentialRampToValueAtTime(amp * 0.35, tb + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, tb + dec);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      o.connect(g).connect(lp).connect(out);
      o.start(tb);
      o.stop(tb + dec + 0.1);
    }
  };
  bell(t + 0.2);
  bell(t + 2.0);

  // Oiseaux : gazouillis (balayages rapides de fréquence), à gauche et à droite.
  const chirp = (tc, f0, f1, dur, pan, level) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, tc);
    o.frequency.exponentialRampToValueAtTime(f1, tc + dur);
    const vib = c.createOscillator();
    const vg = c.createGain();
    vib.frequency.value = 30 + Math.random() * 25;
    vg.gain.value = f0 * 0.04;
    vib.connect(vg).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, tc);
    g.gain.exponentialRampToValueAtTime(level, tc + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, tc + dur);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) p.pan.value = pan;
    o.connect(g);
    (p ? g.connect(p) : g).connect(out);
    for (const x of [o, vib]) {
      x.start(tc);
      x.stop(tc + dur + 0.05);
    }
  };
  const birds = [
    { pan: -0.6, base: 3400, start: 0.4 },
    { pan: 0.5, base: 4200, start: 1.1 },
    { pan: -0.1, base: 2800, start: 2.3 },
    { pan: 0.8, base: 3800, start: 3.0 },
  ];
  for (const b of birds) {
    let tc = t + b.start;
    for (let phrase = 0; phrase < 4; phrase++) {
      const notes = 3 + Math.floor(Math.random() * 4);
      for (let k = 0; k < notes; k++) {
        const up = Math.random() < 0.6;
        const f0 = b.base * (0.85 + Math.random() * 0.3);
        chirp(tc, f0, up ? f0 * 1.35 : f0 * 0.7, 0.06 + Math.random() * 0.06, b.pan, 0.15);
        tc += 0.08 + Math.random() * 0.06;
      }
      tc += 0.5 + Math.random() * 0.7;
    }
  }
}

// ------------------------------------------------------------------ enregistrements fournis
// Un vrai enregistrement déposé dans public/assets/sfx/<nom>.mp3 remplace le bruitage
// synthétisé correspondant (fusil, recharge, jour, meute). Préchargé pour rester synchronisé.
const recorded = new Map();
export function preloadRecorded() {
  const c = audio();
  if (!c) return;
  for (const name of ['fusil', 'recharge', 'jour', 'meute']) {
    if (recorded.has(name)) continue;
    recorded.set(name, null);
    fetch(`/assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => b && new Promise((res, rej) => c.decodeAudioData(b, res, rej)))
      .then((buf) => buf && recorded.set(name, buf))
      .catch(() => {});
  }
}
function playRecorded(name, volume) {
  const buf = recorded.get(name);
  const c = buf && ready();
  if (!c) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(g).connect(master);
  src.start();
  return true;
}

/** Distribution du rôle : petit « clic » à chaque tour de carte (plus grave quand elle ralentit). */
export function tick(i = 0) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = Math.max(500, 1500 - i * 55);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  const g = c.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  o.connect(bp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.04);
}

/** Distribution du rôle : la carte s'arrête — coup sourd + scintillement. */
export function revealHit() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const boom = c.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(110, t);
  boom.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.7, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  boom.connect(bg).connect(master);
  boom.start(t);
  boom.stop(t + 0.65);
  const out = c.createGain();
  out.gain.value = 0.22;
  out.connect(master);
  const wet = c.createGain();
  wet.gain.value = 0.6;
  out.connect(wet).connect(reverb);
  [1046, 1318, 1568, 2093].forEach((f, k) => {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    const st = t + k * 0.06;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.6, st + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 1.2);
    o.connect(g).connect(out);
    o.start(st);
    o.stop(st + 1.25);
  });
}

/** Mort(s) de la nuit, annoncée(s) au lever du jour : cœur qui s'accélère puis s'arrête, puis un coup de glas. */
export function nightDeath(volume = 0.7) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + 0.05;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);
  // Battements : « boum-boum », de plus en plus rapprochés.
  const thump = (t, level, freq) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    o.connect(g).connect(lp).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  };
  let t = t0;
  const gaps = [0.95, 0.85, 0.74, 0.63, 0.54, 0.47, 0.42];
  gaps.forEach((gap, k) => {
    const level = 0.7 + k * 0.05;
    thump(t, level, 62);
    thump(t + 0.17, level * 0.7, 55);
    t += gap;
  });
  // Silence… le cœur s'arrête. Puis un seul coup de glas, grave et long.
  const tb = t + 0.55;
  for (const [ratio, amp, dec] of [[0.5, 0.5, 6.5], [1, 0.42, 5.0], [1.19, 0.24, 4.0], [1.5, 0.16, 3.2], [2.0, 0.14, 2.6], [2.74, 0.07, 1.8], [3.76, 0.04, 1.2]]) {
    const o = c.createOscillator();
    o.frequency.value = 220 * ratio;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, tb);
    g.gain.exponentialRampToValueAtTime(amp * 0.55, tb + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, tb + dec);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    o.connect(g).connect(lp).connect(out);
    o.start(tb);
    o.stop(tb + dec + 0.1);
  }
  const wet = c.createGain();
  wet.gain.value = 0.5;
  out.connect(wet).connect(reverb);
  return tb - c.currentTime; // délai avant le coup de cloche
}
