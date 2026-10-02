/**
 * VoiceSFU — voix via le serveur audio LiveKit.
 *
 * Une seule connexion audio par joueur, quel que soit le nombre de joueurs.
 * Les droits (parler / entendre) sont imposés par le serveur de jeu à LiveKit ;
 * ce module suit simplement ces droits (micro allumé seulement quand autorisé,
 * audio coupé localement pour qui n'a pas à être entendu, en double sécurité).
 */
import { analyserLevel } from './voice.js';

let loading = null;
function loadLiveKit() {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/livekit-client.umd.js';
    s.onload = () => resolve(window.LivekitClient);
    s.onerror = () => reject(new Error('Impossible de charger le module audio.'));
    document.head.appendChild(s);
  });
  return loading;
}

export class VoiceSFU extends EventTarget {
  constructor(client) {
    super();
    this.client = client;
    this.room = null;
    this.active = false;
    this.hasMic = false;
    this.micOn = false;
    this.audioEls = new Map();
    this.talking = new Set();
    this.onView = () => this.applyPermissions();
  }

  async start(join) {
    const LK = await loadLiveKit();
    // Micro gardé « en capture » pendant toute la partie (sans être émis hors de son tour) :
    // sur iPhone, Safari n'autorise la lecture automatique du son que pendant une capture.
    try {
      this.keepAlive = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.hasMic = true;
      try {
        this.meterCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.meter = this.meterCtx.createAnalyser();
        this.meter.fftSize = 256;
        this.meterCtx.createMediaStreamSource(this.keepAlive).connect(this.meter);
      } catch {
        this.meter = null;
      }
    } catch {
      this.keepAlive = null;
      this.hasMic = false;
    }
    const room = new LK.Room({
      adaptiveStream: false,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      // Préréglage « parole » : mono, débit réduit, rien d'envoyé pendant les silences.
      publishDefaults: { audioPreset: LK.AudioPresets.speech, dtx: true, red: true },
    });
    this.room = room;
    const E = LK.RoomEvent;
    room.on(E.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== 'audio') return;
      const el = track.attach();
      el.setAttribute('playsinline', '');
      el.style.display = 'none';
      document.body.appendChild(el);
      this.audioEls.set(participant.identity, el);
      this.applyPermissions();
    });
    room.on(E.TrackUnsubscribed, (track, _pub, participant) => {
      track.detach().forEach((el) => el.remove());
      this.audioEls.delete(participant.identity);
    });
    room.on(E.ActiveSpeakersChanged, (speakers) => {
      this.talking = new Set(speakers.map((p) => p.identity));
      this.dispatchEvent(new CustomEvent('talking', { detail: this.talking }));
    });
    // Les droits changent côté serveur à chaque phase : on suit.
    room.on(E.ParticipantPermissionsChanged, () => this.applyPermissions());
    // Son bloqué par le navigateur (lecture automatique interdite) → invitation à toucher l'écran.
    room.on(E.AudioPlaybackStatusChanged, () => this.#audioState());
    room.on(E.ParticipantConnected, () => this.#emit());
    room.on(E.ParticipantDisconnected, () => this.#emit());
    room.on(E.Reconnected, () => this.applyPermissions());
    room.on(E.Disconnected, () => {
      this.micOn = false;
      this.#emit();
      // Coupure définitive (jeton expiré, serveur redémarré…) : on redemande un accès.
      if (this.active) setTimeout(() => this.#rejoin(), 2000);
    });
    await room.connect(join.url, join.token, { autoSubscribe: true });
    await room.startAudio().catch(() => {});
    this.active = true;
    this.#audioState();
    this.client.addEventListener('view', this.onView);
    this.applyPermissions();
    this.#emit();
  }

  async #rejoin() {
    if (!this.active) return;
    try {
      const r = await this.client.request('voice:join');
      if (r.mode !== 'sfu') return;
      await this.room.connect(r.url, r.token, { autoSubscribe: true });
      this.applyPermissions();
    } catch (e) {
      console.warn('[voice] reconnexion audio', e);
      setTimeout(() => this.#rejoin(), 5000);
    }
    this.#emit();
  }

  #audioState() {
    const blocked = !!this.room && this.room.canPlaybackAudio === false;
    this.dispatchEvent(new CustomEvent('audio', { detail: { blocked } }));
  }

  /** Niveau de mon micro (0..1). */
  level() {
    return analyserLevel(this.meter);
  }

  unlockAudio() {
    this.meterCtx?.resume?.().catch(() => {});
    if (!this.room) return;
    this.room
      .startAudio()
      .then(() => this.#audioState())
      .catch(() => {});
    for (const el of this.audioEls.values()) el.play?.().catch(() => {});
  }

  applyPermissions() {
    const v = this.client.view?.voice;
    const room = this.room;
    if (!v || !room || !this.active) return;
    const lp = room.localParticipant;
    const allowed = this.hasMic && v.canSpeak && lp.permissions?.canPublish !== false;
    if (allowed !== this.micOn) {
      this.micOn = allowed;
      lp.setMicrophoneEnabled(allowed).catch((e) => {
        console.warn('[voice] micro', e);
        this.micOn = false;
      });
    }
    for (const [id, el] of this.audioEls) el.muted = !v.hearFrom.includes(id);
    this.#emit();
  }

  state() {
    const room = this.room;
    const n = room ? room.remoteParticipants.size : 0;
    const connected = room && room.state === 'connected' ? n : 0;
    return { active: this.active, hasMic: this.hasMic, transmitting: this.micOn, peers: n, connected, mode: 'sfu' };
  }

  async stats() {
    const out = {};
    if (!this.room) return out;
    for (const p of this.room.remoteParticipants.values()) out[p.identity] = { state: this.room.state, subscribed: this.audioEls.has(p.identity) };
    return out;
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.state() }));
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.client.removeEventListener('view', this.onView);
    this.room?.disconnect();
    this.keepAlive?.getTracks().forEach((t) => t.stop());
    this.keepAlive = null;
    this.meterCtx?.close().catch(() => {});
    this.meterCtx = null;
    this.meter = null;
    for (const el of this.audioEls.values()) el.remove();
    this.audioEls.clear();
    this.micOn = false;
    this.talking = new Set();
    this.dispatchEvent(new CustomEvent('talking', { detail: this.talking }));
    this.#emit();
  }
}
