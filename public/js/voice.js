/**
 * VoiceMesh — micro intégré en WebRTC (maillage pair-à-pair, audio seul).
 *
 * Les permissions viennent EXCLUSIVEMENT du serveur (view.voice) :
 *  - côté émetteur : la piste micro n'est transmise qu'aux joueurs de `speakTo`
 *    (replaceTrack(null) sinon) → un joueur honnête ne fuit jamais sa voix ;
 *  - côté récepteur : seuls les joueurs de `hearFrom` sont audibles → un client
 *    modifié qui parlerait hors de son tour reste muet chez les autres.
 *
 * Limite assumée de la phase 1 : en pair-à-pair, l'application stricte repose
 * sur les clients honnêtes. Pour une garantie serveur totale (canal privé des
 * Loups inviolable), la phase 2 pourra brancher un SFU (LiveKit / mediasoup)
 * qui consommera exactement la même structure `voice` calculée par le moteur.
 */
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export class VoiceMesh extends EventTarget {
  constructor(client) {
    super();
    this.client = client;
    this.socket = client.socket;
    this.peers = new Map();
    this.stream = null;
    this.active = false;
    this.onView = () => this.applyPermissions();
    // Le pair existant attend l'offre du nouvel arrivant (pas d'offres croisées).
    this.onJoined = () => {};
    this.onLeft = ({ id }) => this.#closePeer(id);
    this.onSignal = ({ from, data }) => this.#handleSignal(from, data).catch((e) => console.warn('[voice]', e));
  }

  get myId() {
    return this.client.view?.me?.id;
  }

  async start() {
    if (this.active) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      console.warn('[voice] micro indisponible, écoute seule', e);
      this.stream = null;
    }
    this.active = true;
    this.socket.on('voice:peer-joined', this.onJoined);
    this.socket.on('voice:peer-left', this.onLeft);
    this.socket.on('voice:signal', this.onSignal);
    this.client.addEventListener('view', this.onView);
    const { peers } = await this.client.request('voice:join');
    // Le nouvel arrivant initie la connexion vers chaque pair déjà présent.
    for (const id of peers) this.#ensurePeer(id, true);
    this.applyPermissions();
    this.#startMeter();
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
      const send = voice.canSpeak && voice.speakTo.includes(id) && track ? track : null;
      const sender = peer.pc.getTransceivers()[0]?.sender;
      if (sender && sender.track !== send) sender.replaceTrack(send).catch(() => {});
      peer.audio.muted = !voice.hearFrom.includes(id);
    }
    this.#emit();
  }

  state() {
    const voice = this.client.view?.voice;
    return {
      active: this.active,
      hasMic: !!this.stream,
      transmitting: !!(this.active && this.stream && voice?.canSpeak),
      peers: this.peers.size,
    };
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.state() }));
  }

  #ensurePeer(id, initiator = false) {
    if (this.peers.has(id) || id === this.myId) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = true;
    const peer = { pc, audio, polite: String(this.myId) > String(id), makingOffer: false, ignoreOffer: false };
    this.peers.set(id, peer);

    if (initiator) pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.ontrack = (e) => {
      audio.srcObject = new MediaStream([e.track]);
      this.#watch(id, audio.srcObject);
      audio.play().catch(() => {});
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.socket.emit('voice:signal', { to: id, data: { candidate: e.candidate } });
    };
    // Négociation "parfaite" (gestion des offres croisées).
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.socket.emit('voice:signal', { to: id, data: { description: pc.localDescription } });
      } catch (e) {
        console.warn('[voice] négociation', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
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
        await pc.setLocalDescription();
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
    peer.pc.close();
    peer.audio.srcObject = null;
    this.peers.delete(id);
    this.#emit();
  }
}
