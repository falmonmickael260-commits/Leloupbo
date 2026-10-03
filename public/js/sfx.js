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

/** Tir du Chasseur : claquement + détonation grave + écho. */
export function gunshot(volume = 0.9) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);

  // Claquement (aigus très brefs).
  const crack = c.createBufferSource();
  crack.buffer = noiseBuffer(c, 0.25);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const cg = c.createGain();
  cg.gain.setValueAtTime(1, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  crack.connect(hp).connect(cg).connect(out);
  crack.start(t);
  crack.stop(t + 0.25);

  // Corps de la détonation (bruit grave).
  const body = c.createBufferSource();
  body.buffer = noiseBuffer(c, 0.8);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(260, t + 0.35);
  const bg = c.createGain();
  bg.gain.setValueAtTime(1.1, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  body.connect(lp).connect(bg).connect(out);
  body.start(t);
  body.stop(t + 0.8);

  // Coup sourd dans la poitrine.
  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(120, t);
  thump.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  const tg = c.createGain();
  tg.gain.setValueAtTime(0.9, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  thump.connect(tg).connect(out);
  thump.start(t);
  thump.stop(t + 0.35);

  // Écho dans le village.
  const send = c.createGain();
  send.gain.value = 0.45;
  bg.connect(send).connect(reverb);
}
