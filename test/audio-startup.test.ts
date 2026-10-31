import { test } from 'node:test';
import assert from 'node:assert/strict';

class Param {
  value = 1;
  events: { type: string; value?: number; from?: number }[] = [];
  cancelScheduledValues() { this.events.push({ type: 'cancel' }); }
  cancelAndHoldAtTime() { this.events.push({ type: 'hold', value: this.value }); }
  setValueAtTime(value: number) { this.value = value; this.events.push({ type: 'set', value }); }
  setTargetAtTime(value: number) { this.events.push({ type: 'target', value, from: this.value }); this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Param(); frequency = new Param(); threshold = new Param(); ratio = new Param();
  Q = new Param(); buffer: unknown; type = ''; starts = 0; connectedAt = -1;
  connect(other: unknown) { this.connectedAt = this.gain.value; return other; }
  start() { this.starts++; }
  stop() {}
}

test('démarrage mobile : un contexte, aucun micro jetable, pas de rafale audio différée', async (t) => {
  const previousWindow = (globalThis as any).window;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousFetch = globalThis.fetch;
  let captures = 0; let contexts = 0; let resumes = 0; let activeDecodes = 0; let maxDecodes = 0;
  let finishResume: () => void = () => {};
  const nodes: Node[] = []; const gains: Node[] = []; const buffers: number[][] = [];
  let context: any;
  class Context {
    state = 'suspended'; currentTime = 0; sampleRate = 8000; destination = {};
    constructor(public options: unknown) { contexts++; context = this; }
    createGain() { const n = new Node(); nodes.push(n); gains.push(n); return n; }
    createDynamicsCompressor() { const n = new Node(); nodes.push(n); return n; }
    createConvolver() { const n = new Node(); nodes.push(n); return n; }
    createBufferSource() { const n = new Node(); nodes.push(n); return n; }
    createOscillator() { const n = new Node(); nodes.push(n); return n; }
    createBiquadFilter() { const n = new Node(); nodes.push(n); return n; }
    createBuffer(channels: number, frames: number, rate: number) {
      buffers.push([channels, frames, rate]);
      return { getChannelData: () => new Float32Array(frames) };
    }
    resume() { resumes++; return new Promise<void>((resolve) => { finishResume = () => { this.state = 'running'; resolve(); }; }); }
    decodeAudioData(_bytes: unknown, done: (value: object) => void) {
      activeDecodes++; maxDecodes = Math.max(maxDecodes, activeDecodes);
      queueMicrotask(() => { activeDecodes--; done({ duration: 1 }); });
    }
  }
  Object.assign(globalThis, { window: { AudioContext: Context } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => { captures++; return {}; } } } });
  globalThis.fetch = async (input) => String(input) === '/api/sfx'
    ? Response.json(['fusil', 'jour', 'meute']) : new Response(new ArrayBuffer(8));
  t.after(() => {
    (globalThis as any).window = previousWindow;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    globalThis.fetch = previousFetch;
  });
  const startupPath = '../public/js/audioStartup.js';
  const sfxPath = '../public/js/sfx.js';
  const mixPath = '../public/js/audioMix.js';
  const { primeGameAudio } = await import(startupPath);
  const sfx = await import(sfxPath);
  const mix = await import(mixPath);
  primeGameAudio(); primeGameAudio();
  assert.equal(contexts, 1); assert.equal(captures, 0); assert.equal(resumes, 1);
  assert.deepEqual(context.options, { latencyHint: 'balanced' });
  assert.equal(buffers.some(([, frames, rate]) => frames === 1 || rate === 22050), false);
  assert.equal(gains[0].connectedAt, 0); assert.equal(gains[1].connectedAt, 0);
  assert.equal(gains[0].gain.events.find((e) => e.type === 'target')?.from, 0);
  sfx.tick(); sfx.windStart();
  assert.equal(nodes.some((n) => n.starts > 0), false, 'aucun son accumulé pendant la suspension');
  await sfx.preloadRecorded();
  assert.equal(maxDecodes, 1, 'les enregistrements sont décodés un à un');
  finishResume(); await new Promise((resolve) => setImmediate(resolve));
  sfx.tick();
  assert.equal(nodes.some((n) => n.starts > 0), true, 'les effets restent disponibles après déblocage');
  const initialEvents = gains[0].gain.events.length;
  mix.setAudioSetting('effects', 0.3);
  assert.equal(gains[0].gain.events[initialEvents].type, 'hold', 'pas de saut de volume à la modification');
});
