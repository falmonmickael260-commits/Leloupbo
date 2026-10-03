/**
 * VoiceMesh — micro intégré en WebRTC (maillage pair-à-pair, audio seul).
 *
 * Les permissions viennent EXCLUSIVEMENT du serveur (view.voice) :
 *  - côté émetteur : la piste micro n'est transmise qu'aux joueurs de `speakTo`
 *    (replaceTrack(null) sinon) → un joueur qui n'a pas la parole n'envoie rien ;
 *  - côté récepteur : seuls les joueurs de `hearFrom` sont audibles → un client
 *    modifié qui parlerait hors de son tour reste muet chez les autres.
 *
 * Optimisé pour ~15 joueurs : voix mono « parole » (Opus ~24 kb/s), aucune
 * donnée envoyée pendant les silences (DTX), correction d'erreurs (FEC),
 * relais TURN si le serveur en fournit, reconnexion automatique.
 *
 * Limite : en pair-à-pair, le canal privé des Loups repose sur des clients
 * honnêtes. Pour une garantie serveur totale, brancher un SFU (LiveKit) qui
 * consommera la même structure `voice` calculée par le moteur.
 */
const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const VOICE_BITRATE = 24000;

/** Paramètres Opus adaptés à la voix : mono, débit limité, DTX (silence = 0), FEC. */
export function tuneOpus(sdp) {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (!m) return sdp;
  const pt = m[1];
  const params = `minptime=10;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=${VOICE_BITRATE}`;
  const fmtp = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  if (fmtp.test(sdp)) {
    return sdp.replace(fmtp, (_l, existing) => {
      const kept = existing.split(';').filter((kv) => !/^(minptime|useinbandfec|usedtx|stereo|sprop-stereo|maxaveragebitrate)=/.test(kv.trim()));
      return `a=fmtp:${pt} ${[...kept, params].filter(Boolean).join(';')}`;
    });
  }
  return sdp.replace(m[0], `${m[0]}\r\na=fmtp:${pt} ${params}`);
}

/** Niveau sonore (0..1) d'un analyseur — pour la jauge du test du micro. */
export function analyserLevel(an) {
  if (!an) return 0;
  const buf = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += (v - 128) * (v - 128);
  return Math.min(1, Math.sqrt(sum / buf.length) / 40);
}

export class VoiceMesh extends EventTarget {
  constructor(client) {
    super();
    this.client = client;
    this.socket = client.socket;
    this.peers = new Map();
    this.stream = null;
    this.active = false;
    this.iceServers = DEFAULT_ICE;
    this.onView = () => this.applyPermissions();
    // Le pair existant attend l'offre du nouvel arrivant (pas d'offres croisées).
    this.onJoined = () => {};
    this.onLeft = ({ id }) => this.#closePeer(id);
    this.onSignal = ({ from, data }) => this.#handleSignal(from, data).catch((e) => console.warn('[voice]', e));
    // Reconnexion réseau : la nouvelle socket doit rejoindre à nouveau le salon audio.
    this.onReconnect = () => {
      if (this.active) setTimeout(() => this.#rejoin(), 600);
    };
  }

  get myId() {
    return this.client.view?.me?.id;
  }

  /** `join` : réponse déjà obtenue de 'voice:join' (mode pair-à-pair). */
  async start(join) {
    if (this.active) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      console.warn('[voice] micro indisponible, écoute seule', e);
      this.stream = null;
      this.micError = e?.name || 'Error';
    }
    this.active = true;
    this.socket.on('voice:peer-joined', this.onJoined);
    this.socket.on('voice:peer-left', this.onLeft);
    this.socket.on('voice:signal', this.onSignal);
    this.socket.on('connect', this.onReconnect);
    this.client.addEventListener('view', this.onView);
    await this.#join(join);
    this.#startMeter();
    this.#emit();
  }

  async #join(join) {
    const { peers, iceServers } = join ?? (await this.client.request('voice:join'));
    if (Array.isArray(iceServers) && iceServers.length) this.iceServers = iceServers;
    // Le nouvel arrivant initie la connexion vers chaque pair déjà présent.
    for (const id of peers) this.#ensurePeer(id, true);
    this.applyPermissions();
  }

  async #rejoin() {
    if (!this.active) return;
    for (const id of [...this.peers.keys()]) this.#closePeer(id);
    try {
      // La session de jeu est reprise par GameClient ; on attend qu'elle soit rattachée.
      await this.client.resume().catch(() => {});
      await this.#join();
    } catch (e) {
      console.warn('[voice] reconnexion audio impossible', e);
    }
    this.#emit();
  }

  /**
   * Détection de la parole (niveau sonore) pour l'indicateur visuel :
   * émet 'talking' avec l'ensemble des joueurs qui parlent réellement.
   * Purement visuel — n'a aucun effet sur les permissions.
   */
  #startMeter() {
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.analysers = new Map();
    if (this.stream && this.myId) this.#watch(this.myId, this.stream);
    const buf = new Uint8Array(256);
    this.meter = setInterval(() => {
      const talking = new Set();
      for (const [id, an] of this.analysers) {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) * (v - 128);
        if (Math.sqrt(sum / buf.length) > 6) talking.add(id);
      }
      const key = [...talking].sort().join(',');
      if (key !== this.talkingKey) {
        this.talkingKey = key;
        this.talking = talking;
        this.dispatchEvent(new CustomEvent('talking', { detail: talking }));
      }
    }, 150);
  }

  #watch(id, stream) {
    if (!this.ctx || !stream.getAudioTracks().length) return;
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      this.analysers.set(id, an);
    } catch {
      /* indicateur indisponible */
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.socket.emit('voice:leave', {});
    this.socket.off('voice:peer-joined', this.onJoined);
    this.socket.off('voice:peer-left', this.onLeft);
    this.socket.off('voice:signal', this.onSignal);
    this.socket.off('connect', this.onReconnect);
    this.client.removeEventListener('view', this.onView);
    for (const id of [...this.peers.keys()]) this.#closePeer(id);
    clearInterval(this.meter);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analysers = new Map();
    this.talking = new Set();
    this.dispatchEvent(new CustomEvent('talking', { detail: this.talking }));
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.#emit();
  }

  /** Applique les permissions serveur à chaque nouvelle vue. */
  applyPermissions() {
    const voice = this.client.view?.voice;
    if (!voice || !this.active) return;
    const track = this.stream?.getAudioTracks()[0] ?? null;
    for (const [id, peer] of this.peers) {
      const send = voice.canSpeak && !this.selfMuted && voice.speakTo.includes(id) && track ? track : null;
      const sender = peer.pc.getTransceivers()[0]?.sender;
      if (sender && sender.track !== send) sender.replaceTrack(send).then(() => this.#capBitrate(sender)).catch(() => {});
      peer.audio.muted = !voice.hearFrom.includes(id);
    }
    this.#emit();
  }

  /** Plafond de débit côté émetteur (en plus des paramètres Opus négociés). */
  async #capBitrate(sender) {
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) return;
      if (params.encodings[0].maxBitrate === VOICE_BITRATE) return;
      params.encodings[0].maxBitrate = VOICE_BITRATE;
      await sender.setParameters(params);
    } catch {
      /* non supporté : les paramètres Opus suffisent */
    }
  }

  #audio(blocked) {
    if (this.audioBlocked === blocked) return;
    this.audioBlocked = blocked;
    this.dispatchEvent(new CustomEvent('audio', { detail: { blocked } }));
  }

  /** Niveau de mon micro (0..1). */
  level() {
    return analyserLevel(this.analysers?.get(this.myId));
  }

  /** Débloque la lecture du son (geste utilisateur requis sur certains téléphones). */
  unlockAudio() {
    this.ctx?.resume?.().catch(() => {});
    for (const p of this.peers.values()) {
      if (p.audio.srcObject) p.audio.play().then(() => this.#audio(false)).catch(() => this.#audio(true));
    }
  }

  state() {
    const voice = this.client.view?.voice;
    let connected = 0;
    for (const p of this.peers.values()) if (p.pc.connectionState === 'connected') connected++;
    return {
      active: this.active,
      hasMic: !!this.stream,
      micError: this.micError ?? null,
      micLive: !!this.stream?.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted),
      transmitting: !!(this.active && this.stream && voice?.canSpeak && !this.selfMuted),
      sending: !!(this.active && this.stream && voice?.canSpeak && !this.selfMuted && connected > 0),
      speakerOk: !this.audioBlocked,
      peers: this.peers.size,
      connected,
    };
  }

  async diag() {
    const { rtcSummary } = await import('./voiceManager.js');
    const pcs = [...this.peers.values()].map((p) => p.pc);
    const ok = pcs.filter((pc) => pc.connectionState === 'connected').length;
    return `liens ${ok}/${pcs.length} · ${await rtcSummary(pcs)} · lecture:${this.audioBlocked ? 'bloquée' : 'ok'}`;
  }

  /** Débit envoyé / reçu (kb/s) par pair, pour diagnostic. */
  async stats() {
    const out = {};
    for (const [id, p] of this.peers) {
      const report = await p.pc.getStats();
      let sent = 0;
      let received = 0;
      let relay = false;
      report.forEach((s) => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') sent += s.bytesSent;
        if (s.type === 'inbound-rtp' && s.kind === 'audio') received += s.bytesReceived;
        if (s.type === 'local-candidate' && s.candidateType === 'relay') relay = true;
      });
      out[id] = { state: p.pc.connectionState, sentBytes: sent, receivedBytes: received, relay };
    }
    return out;
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.state() }));
  }

  #ensurePeer(id, initiator = false) {
    if (this.peers.has(id) || id === this.myId) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.muted = true;
    const peer = { pc, audio, initiator, polite: String(this.myId) > String(id), makingOffer: false, ignoreOffer: false, failures: 0, timer: 0 };
    this.peers.set(id, peer);

    if (initiator) pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.ontrack = (e) => {
      audio.srcObject = new MediaStream([e.track]);
      this.#watch(id, audio.srcObject);
      audio.play().then(() => this.#audio(false)).catch(() => this.#audio(true));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.socket.emit('voice:signal', { to: id, data: { candidate: e.candidate } });
    };
    // Négociation « parfaite » (gère les offres croisées), avec réglages Opus.
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription({ type: 'offer', sdp: tuneOpus(offer.sdp) });
        this.socket.emit('voice:signal', { to: id, data: { description: pc.localDescription } });
      } catch (e) {
        console.warn('[voice] négociation', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    // Reconnexion automatique : ICE restart, puis reconstruction complète si ça échoue encore.
    pc.onconnectionstatechange = () => {
      clearTimeout(peer.timer);
      const st = pc.connectionState;
      if (st === 'connected') peer.failures = 0;
      if (st === 'disconnected') peer.timer = setTimeout(() => pc.connectionState === 'disconnected' && pc.restartIce(), 4000);
      if (st === 'failed') {
        peer.failures += 1;
        if (peer.failures <= 2) pc.restartIce();
        else if (this.active && String(this.myId) < String(id)) {
          this.#closePeer(id);
          this.#ensurePeer(id, true);
        }
      }
      this.#emit();
    };
    this.applyPermissions();
    return peer;
  }

  async #handleSignal(from, data) {
    if (!this.active) return;
    const peer = this.#ensurePeer(from);
    if (!peer) return;
    const { pc } = peer;
    if (data?.description) {
      const offerCollision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(data.description);
      if (data.description.type === 'offer') {
        // Transceiver créé par l'offre : on l'ouvre en émission pour pouvoir parler.
        for (const t of pc.getTransceivers()) if (t.direction === 'recvonly') t.direction = 'sendrecv';
        this.applyPermissions();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription({ type: 'answer', sdp: tuneOpus(answer.sdp) });
        this.socket.emit('voice:signal', { to: from, data: { description: pc.localDescription } });
      }
    } else if (data?.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (e) {
        if (!peer.ignoreOffer) throw e;
      }
    }
  }

  #closePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    clearTimeout(peer.timer);
    peer.pc.close();
    peer.audio.srcObject = null;
    this.peers.delete(id);
    this.analysers?.delete(id);
    this.#emit();
  }
}
