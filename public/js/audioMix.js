/** Réglages locaux : les volumes de lecture n'accordent jamais de permission vocale. */
const KEY = 'blackops:audioMix';
const DEFAULTS = { effects: 0.65, ambience: 0.55, voice: 1 };
const listeners = new Set();
let values;
let effectsBus;
let ambienceBus;
let context;
let speaking = false;
let releaseTimer;
export function normalizeAudioSettings(input) {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key,
    typeof input?.[key] === 'number' && Number.isFinite(input[key]) ? Math.max(0, Math.min(1, input[key])) : fallback]));
}
export function audioSettings() {
  if (!values) { try { values = normalizeAudioSettings(JSON.parse(localStorage.getItem(KEY))); } catch { values = { ...DEFAULTS }; } }
  return { ...values };
}
export function setAudioSetting(key, value) {
  if (!(key in DEFAULTS)) return;
  values = normalizeAudioSettings({ ...audioSettings(), [key]: value });
  try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* réglage en mémoire */ }
  apply();
  for (const listener of listeners) listener(audioSettings());
}
export function onAudioSettings(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function audioBuses(c) {
  if (context !== c) {
    context = c;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.ratio.value = 8; limiter.connect(c.destination);
    effectsBus = c.createGain(); ambienceBus = c.createGain();
    effectsBus.connect(limiter); ambienceBus.connect(limiter);
    apply();
  }
  return { effects: effectsBus, ambience: ambienceBus };
}
function apply() {
  if (!context) return;
  const settings = audioSettings();
  for (const [node, level] of [[effectsBus, settings.effects * (speaking ? 0.22 : 1)], [ambienceBus, settings.ambience * (speaking ? 0.08 : 1)]]) {
    const gain = node.gain;
    gain.cancelScheduledValues(context.currentTime);
    gain.setTargetAtTime(level, context.currentTime, speaking ? 0.06 : 0.4);
  }
}
/** Baisse rapide et retour progressif : évite de masquer une voix ou de pomper entre syllabes. */
export function setVoiceActivity(active) {
  clearTimeout(releaseTimer);
  if (active) { speaking = true; apply(); }
  else releaseTimer = setTimeout(() => { speaking = false; apply(); }, 900);
}
