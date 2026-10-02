/**
 * VoiceSFU — voix via le serveur audio LiveKit.
 *
 * Une seule connexion audio par joueur, quel que soit le nombre de joueurs.
 * Les droits (parler / entendre) sont imposés par le serveur de jeu à LiveKit ;
 * ce module suit simplement ces droits (micro allumé seulement quand autorisé,
 * audio coupé localement pour qui n'a pas à être entendu, en double sécurité).
 */
import { analyserLevel } from './voice.js';
import { rtcSummary } from './voiceManager.js';

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
    // iPhone (Safari 16.4+) : session audio « appel » → micro + haut-parleur en même temps,
    // son joué même avec le bouton silencieux activé.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
    } catch {
      /* non supporté */
    }
    try {
      this.micTrack = await LK.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
      this.hasMic = true;
      // Jauge locale du micro — pas sur iPhone, où brancher le micro sur un 2e moteur audio
      // peut le rendre muet : on y utilise le niveau mesuré par LiveKit.
      if (!IS_IOS) try {
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
      // Si la piste est un jour retirée (reconnexion…), on la garde pour la republier.
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
      el.autoplay = true;
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
    // Piste retirée (reconnexion du serveur audio…) : on la republie aussitôt.
    room.on(E.LocalTrackUnpublished, () => setTimeout(() => this.applyPermissions(), 200));
    room.on(E.Disconnected, () => {
      this.micOn = false;
      this.#emit();
      // Coupure définitive (jeton expiré, serveur redémarré…) : on redemande un accès.
      if (this.active) setTimeout(() => this.#rejoin(), 2000);
    });
    // Retour dans l'appli (iPhone : le micro et le son sont coupés quand Safari passe en arrière-plan).
    this.onVisible = () => {
      if (document.visibilityState !== 'visible' || !this.active) return;
      const mst = this.micTrack?.mediaStreamTrack;
      if (mst && mst.readyState === 'ended') this.micTrack.restartTrack().catch(() => {});
      this.room?.startAudio().catch(() => {});
      for (const el of this.audioEls.values()) el.play?.().catch(() => {});
      this.applyPermissions();
    };
    document.addEventListener('visibilitychange', this.onVisible);
    try {
      await room.connect(join.url, join.token, { autoSubscribe: true });
    } catch (e) {
      // Échec de connexion : on rend le micro et on nettoie avant de laisser réessayer.
      document.removeEventListener('visibilitychange', this.onVisible);
      room.removeAllListeners?.();
      room.disconnect().catch?.(() => {});
      this.micTrack?.stop();
      this.micTrack = null;
      this.meterCtx?.close().catch(() => {});
      this.meterCtx = null;
      this.meter = null;
      throw e;
    }
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
    if (this.meter) return analyserLevel(this.meter);
    return Math.min(1, (this.room?.localParticipant.audioLevel ?? 0) * 2);
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
    // Micro ouvert seulement quand le serveur donne la parole ; la piste, elle, reste publiée.
    const allowed = !!this.micTrack && v.canSpeak;
    this.micOn = allowed;
    this.#syncMic();
    // Chez moi, seuls les joueurs que j'ai le droit d'entendre sont audibles (règles du serveur).
    for (const [id, el] of this.audioEls) el.muted = !v.hearFrom.includes(id);
    this.#emit();
  }

  /**
   * Le micro est publié UNE fois puis simplement coupé / rouvert (instantané, sans
   * renégociation). Ne jamais recapturer le micro (iPhone) ni republier à chaque tour.
   */
  async #syncMic() {
    const track = this.micTrack;
    const room = this.room;
    if (!track || !room) return;
    if (this.syncing) {
      this.resync = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.resync = false;
        const allowed = this.micOn;
        if (!allowed && !track.isMuted) await track.mute();
        const lp = room.localParticipant;
        const published = [...lp.audioTrackPublications.values()].some((p) => p.track === track);
        if (!published && room.state === 'connected' && lp.permissions?.canPublish !== false) {
          await lp.publishTrack(track, { source: window.LivekitClient.Track.Source.Microphone });
        }
        if (this.micOn && track.isMuted) await track.unmute();
      } while (this.resync && this.active);
    } catch (e) {
      console.warn('[voice] micro', e);
      // Nouvel essai un peu plus tard (connexion pas encore prête, etc.).
      setTimeout(() => this.active && this.#syncMic(), 1500);
    } finally {
      this.syncing = false;
    }
    this.#emit();
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

  async diag() {
    const room = this.room;
    if (!room) return 'pas de salle';
    const pcm = room.engine?.pcManager;
    const pub = pcm?.publisher?.getConnectionState?.() ?? '?';
    const sub = pcm?.subscriber?.getConnectionState?.() ?? '';
    const pcs = [pcm?.publisher?.pc, pcm?.subscriber?.pc].filter(Boolean);
    const els = [...this.audioEls.values()];
    const playing = els.filter((e) => !e.paused).length;
    const ctx = this.meterCtx?.state ?? '-';
    return `${room.state} · liaison:${pub}${sub ? `/${sub}` : ''} · ${await rtcSummary(pcs)} · sons ${playing}/${els.length} · lecture:${room.canPlaybackAudio ? 'ok' : 'bloquée'} · ctx:${ctx}`;
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
    document.removeEventListener('visibilitychange', this.onVisible);
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
