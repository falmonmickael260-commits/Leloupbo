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
    // Connexion au jeu perdue : l'état connu peut être périmé (la phase a pu changer) → personne
    // n'est audible jusqu'au prochain état envoyé par le serveur.
    client.addEventListener('status', (e) => {
      if (e.detail !== 'connected') this.applyPermissions();
    });
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
      if (track.kind === 'audio') this.#attach(track, participant.identity);
    });
    room.on(E.TrackUnsubscribed, (track, _pub, participant) => {
      track.detach().forEach((el) => el.remove());
      // Ne retirer que si c'est bien CETTE piste (une ancienne piste peut se fermer après la nouvelle).
      if (this.audioEls.get(participant.identity)?.lkTrack === track) this.audioEls.delete(participant.identity);
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
      if (this.active) this.#scheduleRejoin(2000);
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
    // Surveillance : répare toute seule les pannes de son / micro (voir #watch).
    this.watchdog = setInterval(() => this.#watch(), 3000);
    this.#emit();
  }

  /** Branche la voix reçue d'un joueur sur un élément audio (une seule par joueur). */
  #attach(track, identity) {
    const old = this.audioEls.get(identity);
    if (old?.lkTrack === track) return;
    old?.remove();
    const el = track.attach();
    // Muet par défaut : audible seulement si le serveur m'autorise à entendre ce joueur (hearFrom).
    el.muted = !!this.client.stale || !this.client.view?.voice?.hearFrom?.includes(identity);
    el.lkTrack = track;
    el.setAttribute('playsinline', '');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    this.audioEls.set(identity, el);
    this.applyPermissions();
  }

  /** Une seule reconnexion à la fois, avec des délais croissants (2 s, 4 s, 8 s… 20 s max). */
  #scheduleRejoin(delay) {
    if (!this.active || this.rejoinTimer || this.rejoining) return;
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      this.#rejoin();
    }, delay);
  }

  async #rejoin() {
    if (!this.active || this.rejoining) return;
    if (this.room?.state === 'connected' || this.room?.state === 'reconnecting') return;
    this.rejoining = true;
    try {
      const r = await this.client.request('voice:join');
      if (r.mode !== 'sfu') return;
      await this.room.connect(r.url, r.token, { autoSubscribe: true });
      this.rejoinFails = 0;
      this.applyPermissions();
    } catch (e) {
      console.warn('[voice] reconnexion audio', e);
      this.rejoinFails = (this.rejoinFails ?? 0) + 1;
      this.rejoining = false;
      this.#scheduleRejoin(Math.min(20000, 2000 * 2 ** this.rejoinFails));
    } finally {
      this.rejoining = false;
    }
    this.#emit();
  }

  /**
   * Vérification toutes les 3 s — répare sans action du joueur :
   *  - connexion audio perdue → reconnexion ;
   *  - micro arrêté par le téléphone (appel, casque branché/débranché…) → relancé ;
   *  - micro qui devrait être publié / ouvert / coupé → resynchronisé ;
   *  - voix d'un joueur non reçue alors qu'on a le droit d'écouter → réabonnement ;
   *  - son d'un joueur en pause → relancé (ou invitation à toucher l'écran).
   */
  #watch() {
    const room = this.room;
    if (!this.active || !room) return;
    if (room.state === 'disconnected') return this.#scheduleRejoin(500);
    if (room.state !== 'connected') return;
    const track = this.micTrack;
    if (track) {
      if (track.mediaStreamTrack?.readyState === 'ended') {
        track.restartTrack().catch(() => {});
        return;
      }
      const published = [...room.localParticipant.audioTrackPublications.values()].some((p) => p.track === track);
      if (!published || track.isMuted === this.micOn) this.#syncMic();
    }
    if (room.localParticipant.permissions?.canSubscribe !== false) {
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.audioTrackPublications.values()) {
          if (!pub.isSubscribed) pub.setSubscribed(true);
          // Voix reçue mais pas branchée sur un élément audio → on la branche.
          else if (pub.track && this.audioEls.get(p.identity)?.lkTrack !== pub.track) this.#attach(pub.track, p.identity);
        }
      }
    }
    for (const el of this.audioEls.values()) {
      if (!el.isConnected) document.body.appendChild(el);
      if (el.paused && el.srcObject) el.play().catch(() => this.dispatchEvent(new CustomEvent('audio', { detail: { blocked: true } })));
    }
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
    const v = this.client.stale ? null : this.client.view?.voice;
    const room = this.room;
    // État de la partie inconnu ou périmé (reconnexion en cours) : on n'entend personne.
    if (!v) {
      for (const el of this.audioEls.values()) el.muted = true;
      if (room && this.active && this.micOn) {
        this.micOn = false; // et mon micro reste fermé
        this.#syncMic();
      }
      return;
    }
    if (!room || !this.active) return;
    // Micro ouvert seulement quand le serveur donne la parole ; la piste, elle, reste publiée.
    const allowed = !!this.micTrack && v.canSpeak && !this.selfMuted;
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
    clearInterval(this.watchdog);
    clearTimeout(this.rejoinTimer);
    this.rejoinTimer = null;
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
