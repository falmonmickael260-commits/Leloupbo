/**
 * Point d'entrée unique de la voix pour l'interface.
 * Le serveur choisit le mode : serveur audio LiveKit (si configuré) ou
 * pair-à-pair (secours). L'interface ne voit qu'une seule API.
 */
import { VoiceMesh } from './voice.js';
import { VoiceSFU } from './voiceSfu.js';

const IDLE = { active: false, hasMic: false, transmitting: false, peers: 0, connected: 0 };

export class Voice extends EventTarget {
  constructor(client) {
    super();
    this.client = client;
    this.impl = null;
    this.starting = null;
  }

  async start() {
    if (this.impl?.active) return;
    this.starting ??= (async () => {
      const join = await this.client.request('voice:join');
      const impl = join.mode === 'sfu' ? new VoiceSFU(this.client) : new VoiceMesh(this.client);
      for (const type of ['change', 'talking', 'audio']) impl.addEventListener(type, (e) => this.dispatchEvent(new CustomEvent(type, { detail: e.detail })));
      this.impl = impl;
      await impl.start(join);
    })().finally(() => (this.starting = null));
    return this.starting;
  }

  /** À appeler sur un geste de l'utilisateur : débloque la lecture du son (téléphones). */
  unlockAudio() {
    this.impl?.unlockAudio?.();
  }

  stop() {
    this.impl?.stop();
    this.impl = null;
    this.dispatchEvent(new CustomEvent('change', { detail: IDLE }));
  }

  state() {
    return this.impl ? this.impl.state() : { ...IDLE };
  }

  level() {
    return this.impl?.level?.() ?? 0;
  }

  stats() {
    return this.impl?.stats?.() ?? Promise.resolve({});
  }
}
