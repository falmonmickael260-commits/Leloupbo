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
    // UN SEUL micro capturé pour toute la partie : il sert à émettre (quand c'est notre tour)
    // et reste « en capture » le reste du temps (simplement coupé). Sur iPhone, une 2e capture
    // du micro rend la première muette, et Safari n'autorise la lecture du son que pendant une
    // capture : on ne redemande donc jamais le micro en cours de partie.
    try {
      this.micTrack = await LK.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
      this.hasMic = true;
      try {
        this.meterCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.meter = this.meterCtx.createAnalyser();
        this.meter.fftSize = 256;
        this.meterCtx.createMediaStreamSource(new MediaStream([this.micTrack.mediaStreamTrack])).connect(this.meter);
      } catch {
        this.meter = null;
      }
    } catch (e) {
      this.micTrack = null;
      this.hasMic = false;
      this.micError = e?.name || 'Error';
    }
    const room = new LK.Room({
      adaptiveStream: false,
      // Le serveur retire la piste quand ce n'est plus notre tour : on la garde pour la renvoyer ensuite.
      stopLocalTrackOnUnpublish: false,
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
    const allowed = !!this.micTrack && v.canSpeak && lp.permissions?.canPublish !== false;
    this.micOn = allowed;
    this.#syncMic(allowed);
    for (const [id, el] of this.audioEls) el.muted = !v.hearFrom.includes(id);
    this.#emit();
  }

  /** Émet ou coupe le micro, sans jamais le recapturer. */
  async #syncMic(allowed) {
    const track = this.micTrack;
    if (!track || this.syncing) return;
    this.syncing = true;
    try {
      if (allowed) {
        const lp = this.room.localParticipant;
        const published = [...lp.audioTrackPublications.values()].some((p) => p.track === track);
        if (track.isMuted) await track.unmute();
        if (!published) await lp.publishTrack(track, { source: window.LivekitClient.Track.Source.Microphone });
      } else if (!track.isMuted) {
        await track.mute();
      }
    } catch (e) {
      console.warn('[voice] micro', e);
    } finally {
      this.syncing = false;
    }
    // Les droits ont pu changer pendant l'opération : on revérifie.
    const v = this.client.view?.voice;
    const want = !!v && this.active && v.canSpeak && this.room?.localParticipant.permissions?.canPublish !== false;
    if (this.active && want !== allowed) this.#syncMic(want);
    else this.#emit();
  }

  state() {
    const room = this.room;
    const n = room ? room.remoteParticipants.size : 0;
    const connected = room && room.state === 'connected' ? n : 0;
    const mst = this.micTrack?.mediaStreamTrack;
    const micLive = !!mst && mst.readyState === 'live' && !mst.muted;
    const published = !!room && [...room.localParticipant.audioTrackPublications.values()].some((p) => p.track === this.micTrack);
    return {
      active: this.active,
      hasMic: this.hasMic,
      micError: this.micError ?? null,
      micLive,
      transmitting: this.micOn,
      sending: this.micOn && published && micLive && !this.micTrack.isMuted && room?.state === 'connected',
      speakerOk: !room || room.canPlaybackAudio !== false,
      peers: n,
      connected,
      mode: 'sfu',
    };
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
    this.micTrack?.stop();
    this.micTrack = null;
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
