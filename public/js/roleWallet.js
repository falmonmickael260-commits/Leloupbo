/** Affiche le portefeuille central ; toutes les décisions d'achat restent au serveur. */
const NAMES = { villager: 'Villageois', werewolf: 'Loup-Garou', witch: 'Sorcière', seer: 'Voyante', black_wolf: 'Loup Noir', white_wolf: 'Loup Blanc', hunter: 'Chasseur' };

export class RoleWallet {
  constructor({ client, prices, root = document, reportError = () => {} }) {
    this.client = client;
    this.prices = prices;
    this.root = root;
    this.reportError = reportError;
    this.view = null;
    this.key = '';
    this.phaseKey = '';
    this.balance = null;
    this.loading = false;
    this.unavailable = false;
    this.request = null;
    this.buying = false;
    this.requestedRole = null;
    this.node('wallet-refresh').onclick = () => void this.refresh();
    this.node('game-wallet').onclick = () => {
      if (this.view?.phase.id === 'ROLE_DISTRIBUTION') this.node('role-shop-panel').focus();
      else this.reportError('Les rôles se choisissent pendant les 10 secondes de distribution.');
      void this.refresh();
    };
  }

  node(id) { return this.root.getElementById(id); }

  render(view) {
    this.view = view;
    const key = view ? `${view.code}:${view.me.id}:${Boolean(view.me.platformConnected)}` : '';
    if (key !== this.key) {
      this.key = key;
      this.balance = null;
      this.loading = false;
      this.unavailable = false;
      this.requestedRole = null;
      this.buying = false;
    }
    const phaseKey = view ? `${key}:${view.phase.seq}:${view.phase.id}` : '';
    const changed = phaseKey !== this.phaseKey;
    if (changed) {
      this.phaseKey = phaseKey;
      this.requestedRole = null;
      this.buying = false;
    }
    this.paint();
    // Charger dès le salon, puis relire après attribution / victoire.
    if (changed) void this.refresh();
  }

  async refresh() {
    if (!this.view?.me.platformConnected || this.client.stale || this.client.status === 'disconnected') return;
    if (this.request?.key === this.key) return this.request.promise;
    const request = { key: this.key, promise: null };
    this.request = request;
    this.loading = true;
    this.paint();
    request.promise = (async () => {
      try {
        const { balance } = await this.client.roleBalance();
        if (this.key !== request.key) return;
        this.balance = Number.isSafeInteger(balance) && balance >= 0 ? balance : null;
        this.unavailable = this.balance === null;
      } catch {
        if (this.key !== request.key) return;
        this.balance = null;
        this.unavailable = true;
      } finally {
        if (this.request === request) {
          this.request = null;
          this.loading = false;
          this.paint();
        }
      }
    })();
    return request.promise;
  }

  paint() {
    const v = this.view;
    const connected = Boolean(v?.me.platformConnected);
    const label = !connected ? 'Invité' : this.balance !== null
      ? `${this.balance.toLocaleString('fr-FR')} pièces` : this.unavailable ? 'Solde indisponible' : 'Chargement…';
    this.node('lobby-wallet-balance').textContent = label;
    this.node('game-wallet-balance').textContent = label;
    this.node('wallet-status').textContent = !connected
      ? 'Ouvre le jeu depuis ton compte Revanche Games pour retrouver tes pièces. Les invités jouent gratuitement.'
      : this.unavailable ? 'Impossible de lire ton portefeuille. Actualise le solde.'
        : 'Tes pièces Revanche Games permettent de demander un rôle pendant les 10 secondes de distribution.';
    this.node('wallet-refresh').disabled = !connected || this.loading;
    const selecting = Boolean(v && v.phase.id === 'ROLE_DISTRIBUTION');
    this.root.body.classList.toggle('role-selection', selecting);
    const panel = this.node('role-shop-panel');
    panel.hidden = !selecting;
    if (panel.hidden) return;
    this.node('screen-game').appendChild(panel);
    this.node('role-shop-balance').textContent = this.balance === null ? '…' : this.balance.toLocaleString('fr-FR');
    const reserved = v.me.reservedRole || this.requestedRole;
    const offline = this.client.stale || this.client.status === 'disconnected';
    const available = Object.entries(this.prices).filter(([role]) => (v.composition?.[role] ?? 0) > 0);
    this.node('role-shop-status').textContent = !connected
      ? 'Connecte-toi via Revanche Games pour acheter un rôle. Ton rôle gratuit sera attribué normalement.'
      : offline ? 'Reconnexion au serveur…'
        : reserved ? `Demande ${NAMES[reserved] || 'de rôle'} enregistrée. Débit uniquement si le rôle est attribué.`
          : this.unavailable ? 'Portefeuille indisponible. Actualise avec le bouton 🪙.'
            : this.balance === null ? 'Lecture de ton portefeuille…'
              : available.length && this.balance < Math.min(...available.map(([, price]) => price)) ? 'Solde insuffisant pour les rôles disponibles.'
                : 'Choisis ton rôle. En cas de demandes identiques : tirage au sort. Les perdants ne sont pas débités.';
    const grid = this.node('role-shop');
    grid.innerHTML = available.map(([role, price]) => {
      const disabled = !connected || offline || this.buying || reserved || this.balance === null || this.balance < price;
      return `<button class="btn small" type="button" data-buy-role="${role}" ${disabled ? 'disabled' : ''}>${NAMES[role]} · ${price} pièces</button>`;
    }).join('');
    grid.querySelectorAll('[data-buy-role]').forEach((button) => {
      button.onclick = () => void this.buy(button.dataset.buyRole);
    });
  }

  async buy(role) {
    const phaseKey = this.phaseKey;
    this.buying = true;
    this.paint();
    try {
      const result = await this.client.buyRole(role);
      if (this.phaseKey !== phaseKey) return;
      this.requestedRole = result.role || role;
      if (Number.isSafeInteger(result.balance) && result.balance >= 0) this.balance = result.balance;
    } catch (error) {
      this.reportError(error.message);
    } finally {
      if (this.phaseKey === phaseKey) { this.buying = false; this.paint(); }
    }
  }
}
