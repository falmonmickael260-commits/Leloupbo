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
    try {
      this.selfMuted = sessionStorage.getItem('blackops:selfMute') === '1';
    } catch {
      this.selfMuted = false;
    }
  }

  async start() {
    if (this.impl?.active) return;
    this.starting ??= (async () => {
      const join = await this.client.request('voice:join');
      const impl = join.mode === 'sfu' ? new VoiceSFU(this.client) : new VoiceMesh(this.client);
      for (const type of ['change', 'talking', 'audio']) impl.addEventListener(type, (e) => this.dispatchEvent(new CustomEvent(type, { detail: e.detail })));
      this.impl = impl;
      impl.selfMuted = this.selfMuted;
      this.lastError = null;
      await impl.start(join);
    })()
      .catch((e) => {
        this.lastError = `${e?.name || 'Erreur'} ${e?.message || ''}`.slice(0, 80);
        // Essai raté : tout est libéré (micro compris) pour que le prochain essai reparte de zéro.
        try {
          this.impl?.stop();
        } catch {
          /* rien à libérer */
        }
        this.impl = null;
        throw e;
      })
      .finally(() => (this.starting = null));
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
    const st = this.impl ? this.impl.state() : { ...IDLE };
    return { ...st, selfMuted: this.selfMuted };
  }

  /** Coupure volontaire de MON micro (bouton « Me couper »). Les règles du serveur restent prioritaires. */
  setSelfMute(muted) {
    this.selfMuted = !!muted;
    try {
      sessionStorage.setItem('blackops:selfMute', this.selfMuted ? '1' : '');
    } catch {
      /* stockage indisponible */
    }
    if (this.impl) {
      this.impl.selfMuted = this.selfMuted;
      this.impl.applyPermissions?.();
    }
    this.dispatchEvent(new CustomEvent('change', { detail: this.state() }));
  }

  level() {
    return this.impl?.level?.() ?? 0;
  }

  /** Diagnostic court envoyé au serveur et affiché dans le lobby (aide au dépannage). */
  async diag() {
    const parts = [browserName()];
    const st = this.state();
    if (this.lastError) parts.push(`échec : ${this.lastError}`);
    if (!this.impl) return parts.join(' · ');
    parts.push(st.mode === 'sfu' ? 'serveur audio' : 'pair-à-pair');
    if (st.micError) parts.push(`micro : ${st.micError}`);
    try {
      const d = await this.impl.diag?.();
      if (d) parts.push(d);
    } catch {
      /* diagnostic indisponible */
    }
    return parts.join(' · ');
  }

  stats() {
    return this.impl?.stats?.() ?? Promise.resolve({});
  }
}

function browserName() {
  const ua = navigator.userAgent;
  const ios = ua.match(/OS (\d+)_(\d+)/);
  const android = ua.match(/Android (\d+)/);
  const nav = /CriOS/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /EdgiOS|Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'navigateur inconnu';
  const os = /iPhone|iPad/.test(ua) && ios ? `iOS ${ios[1]}.${ios[2]}` : android ? `Android ${android[1]}` : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'autre';
  return `${os} ${nav}`;
}

/** Octets audio envoyés / reçus et type de connexion, à partir des statistiques WebRTC. */
export async function rtcSummary(pcs) {
  let sent = 0;
  let recv = 0;
  let route = '';
  for (const pc of pcs) {
    if (!pc?.getStats) continue;
    const report = await pc.getStats();
    const byId = new Map();
    report.forEach((r) => byId.set(r.id, r));
    report.forEach((r) => {
      if (r.type === 'outbound-rtp' && (r.kind ?? r.mediaType) === 'audio') sent += r.bytesSent || 0;
      if (r.type === 'inbound-rtp' && (r.kind ?? r.mediaType) === 'audio') recv += r.bytesReceived || 0;
      if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded' && !route) {
        const l = byId.get(r.localCandidateId);
        if (l) route = `${l.candidateType}/${l.relayProtocol || l.protocol}`;
      }
    });
  }
  return `envoyé ${Math.round(sent / 1024)} ko · reçu ${Math.round(recv / 1024)} ko${route ? ` · ${route}` : ''}`;
}
