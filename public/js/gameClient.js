/**
 * GameClient — SDK réseau indépendant de toute interface.
 *
 * Il ne contient AUCUNE règle du jeu : il envoie des intentions au serveur et
 * expose la dernière vue reçue. L'interface de test (app.js) l'utilise
 * aujourd'hui ; le futur plateau animé (phase 2) pourra l'utiliser tel quel
 * (React, Three.js, etc.).
 *
 * Événements émis : 'view', 'status', 'error', 'session-lost', 'kicked'.
 */
/* global io */

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class GameClient extends EventTarget {
  constructor({ profile = 'default' } = {}) {
    super();
    this.storageKey = `blackops:session:${profile}`;
    this.session = this.#load();
    this.view = null;
    this.clockOffset = 0;
    this.status = 'connecting';
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    this.socket.on('connect', () => {
      this.#setStatus('connected');
      // Reconnexion automatique : on reprend la session enregistrée (le serveur renvoie l'état complet).
      if (this.session) this.#resumeWithRetry();
    });
    this.#watchWake();
    this.socket.on('disconnect', (reason) => {
      // Vue périmée tant que le serveur n'a pas renvoyé l'état actuel (voix coupée en attendant).
      this.stale = true;
      this.#setStatus('disconnected');
      // Coupure décidée par le serveur (redémarrage…) : socket.io ne se reconnecte pas tout seul.
      if (reason === 'io server disconnect') setTimeout(() => this.socket.connect(), 800 + Math.random() * 1200);
    });
    this.socket.io.on('reconnect_attempt', () => this.#setStatus('reconnecting'));
    this.socket.on('view', (v) => {
      // Le catalogue des rôles n'est envoyé qu'une fois par connexion : on garde le dernier reçu.
      if (v.roleCatalog) this.roleCatalog = v.roleCatalog;
      else v.roleCatalog = this.roleCatalog ?? [];
      this.stale = false;
      this.clockOffset = v.serverNow - Date.now();
      this.view = v;
      this.dispatchEvent(new CustomEvent('view', { detail: v }));
    });
    this.socket.on('kicked', ({ reason }) => {
      this.#clear();
      this.view = null;
      this.dispatchEvent(new CustomEvent('kicked', { detail: reason }));
    });
  }

  /** Reprise de session : réessaie tant que l'échec est passager (réseau lent, serveur qui redémarre). */
  #resumeWithRetry(attempt = 0) {
    this.resume().catch((e) => {
      if (['NO_SESSION', 'NO_GAME', 'ABANDONED'].includes(e?.code) || !this.session) return;
      if (this.socket.connected && attempt < 10) setTimeout(() => this.#resumeWithRetry(attempt + 1), 1500);
    });
  }

  /**
   * Retour rapide après une coupure : téléphone qui se rallume, onglet remis au premier plan,
   * réseau retrouvé (Wi-Fi ↔ 4G/5G). Sans attendre les délais de reconnexion automatiques.
   * Après une longue mise en arrière-plan, la connexion peut être « morte » sans le savoir :
   * on en ouvre une neuve et le serveur renvoie l'état complet de la partie.
   */
  #watchWake() {
    if (typeof document === 'undefined') return;
    let hiddenAt = 0;
    const wake = (force) => {
      if (!this.socket.connected) this.socket.connect();
      else if (force && this.session) {
        this.stale = true;
        this.socket.disconnect().connect();
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else wake(hiddenAt > 0 && Date.now() - hiddenAt > 15_000);
    });
    window.addEventListener('online', () => wake(true));
    window.addEventListener('pageshow', (e) => e.persisted && wake(true));
  }

  // ---------------------------------------------------------------- session
  #load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  #save(s) {
    this.session = s;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(s));
    } catch {
      /* stockage indisponible : la session reste en mémoire */
    }
  }
  #clear() {
    this.session = null;
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* ignore */
    }
  }
  #setStatus(s) {
    this.status = s;
    this.dispatchEvent(new CustomEvent('status', { detail: s }));
  }

  request(event, payload = {}) {
    return new Promise((resolve, reject) => {
      this.socket.timeout(8000).emit(event, payload, (err, res) => {
        if (err) return reject(new GameError('TIMEOUT', 'Le serveur ne répond pas.'));
        if (!res?.ok) {
          const e = new GameError(res?.error ?? 'ERROR', res?.message ?? 'Erreur');
          this.dispatchEvent(new CustomEvent('error', { detail: e }));
          return reject(e);
        }
        resolve(res);
      });
    });
  }

  /** `profile` : identifiants du profil de la plateforme ({ id, key }) ou null pour un invité. */
  async create(name, profile = null) {
    const r = await this.request('game:create', profile ? { name, profile } : { name });
    this.#save({ code: r.code, token: r.token, playerId: r.playerId });
    return r;
  }

  async join(code, name, profile = null) {
    const r = await this.request('game:join', profile ? { code, name, profile } : { code, name });
    this.#save({ code: r.code, token: r.token, playerId: r.playerId });
    return r;
  }

  async resume() {
    if (!this.session) throw new GameError('NO_SESSION', 'Aucune session.');
    try {
      return await this.request('session:resume', { code: this.session.code, token: this.session.token });
    } catch (e) {
      if (['NO_SESSION', 'NO_GAME', 'ABANDONED'].includes(e.code)) {
        this.#clear();
        this.view = null;
        this.dispatchEvent(new CustomEvent('session-lost', { detail: e }));
      }
      throw e;
    }
  }

  async leave() {
    try {
      await this.request('game:leave');
    } finally {
      this.#clear();
      this.view = null;
      this.dispatchEvent(new CustomEvent('view', { detail: null }));
    }
  }

  // ---------------------------------------------------------------- lobby
  updateSettings(patch) {
    return this.request('lobby:settings', patch);
  }
  addBot() {
    return this.request('lobby:addBot');
  }
  kick(playerId) {
    return this.request('lobby:kick', { playerId });
  }
  start() {
    return this.request('game:start');
  }
  /** Étiquette personnelle sur un joueur (privée ; texte vide = suppression). */
  setTag(playerId, text) {
    return this.request('player:tag', { playerId, text });
  }

  reset() {
    return this.request('game:reset');
  }

  // ---------------------------------------------------------------- partie
  command(action, targets = [], option) {
    return this.request('game:command', { action, targets, option });
  }
  /** Réaction sociale 🍅 / 🌸 vers un joueur qui a la parole. */
  react(kind, targetId) {
    return this.request('game:react', { kind, targetId });
  }
  finish() {
    return this.command('finish');
  }
  vote(targetId) {
    return this.command('vote', [targetId]);
  }
  chat(channel, text) {
    return this.request('chat:send', { channel, text });
  }

  /** Temps restant de la phase (ms), calé sur l'horloge du serveur. */
  timeLeft() {
    const endsAt = this.view?.phase?.endsAt;
    if (!endsAt) return null;
    return Math.max(0, endsAt - (Date.now() + this.clockOffset));
  }
}
