/**
 * Profils locaux de la PLATEFORME — module commun à tous les jeux (Loup-Garou, Rami, Président…).
 *
 * Aucun compte : chaque profil créé sur cet appareil reçoit du serveur un identifiant interne
 * (UUID, jamais affiché) et une clé secrète, gardés dans ce navigateur (localStorage).
 * Plusieurs personnes peuvent avoir chacune leur profil sur le même appareil.
 *
 * Les statistiques sont calculées par le serveur à partir des parties qu'il a arbitrées :
 * ce module ne fait que les LIRE.
 *
 * Limite assumée : effacer les données du navigateur ou changer d'appareil fait perdre
 * l'accès au profil (il n'y a ni e-mail ni mot de passe pour le récupérer).
 */

const STORE_KEY = 'platform:profiles:v1';
/** Joueur choisi pour CETTE visite : sur un appareil partagé, chacun repasse par « Qui joue ? ». */
const ACTIVE_KEY = 'platform:active';

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && Array.isArray(d.profiles)) return d;
  } catch {
    /* stockage illisible ou bloqué */
  }
  return { profiles: [] };
}

function readActive() {
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function writeActive(id) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, id);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function write(d) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false; // navigation privée stricte : le profil vit seulement le temps de la visite
  }
}

async function api(path, body) {
  let res;
  try {
    res = await fetch(`/api/profiles${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('Pas de connexion au serveur.'), { code: 'OFFLINE' });
  }
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw Object.assign(new Error(data.message || 'Erreur'), { code: data.error || 'ERROR' });
  return data;
}

let state = read();
// Un seul profil sur l'appareil : il est reconnu automatiquement. Plusieurs : « Qui joue ? ».
state.active = readActive() ?? (state.profiles.length === 1 ? state.profiles[0].id : null);
const save = () => {
  writeActive(state.active);
  const { active: _a, ...rest } = state;
  return write(rest);
};
/** Invité : joue sans profil (rien n'est enregistré). Valable pour cette visite. */
let guest = false;

const cred = (p) => ({ id: p.id, key: p.key });
const pub = (p) => (p ? { id: p.id, name: p.name, games: p.games ?? 0 } : null);

export const profiles = {
  /** Profils de cet appareil (sans les clés). */
  list: () => state.profiles.map(pub),

  /** Profil qui joue en ce moment, ou null (personne choisi, ou invité). */
  active: () => (guest ? null : pub(state.profiles.find((p) => p.id === state.active))),

  isGuest: () => guest,

  /** Identifiants à joindre en rejoignant une partie (null = invité). */
  credentials() {
    if (guest) return null;
    const p = state.profiles.find((x) => x.id === state.active);
    return p ? cred(p) : null;
  },

  select(id) {
    if (!state.profiles.some((p) => p.id === id)) return;
    guest = false;
    state.active = id;
    save();
  },

  playAsGuest() {
    guest = true;
  },

  /** Revenir à « Qui joue ? » sans rien supprimer. */
  signOut() {
    guest = false;
    state.active = null;
    save();
  },

  /** Nouveau profil local : le serveur fournit l'identifiant et la clé. */
  async create(name) {
    const r = await api('', { name });
    state = { ...read(), active: r.id };
    state.profiles.push({ id: r.id, key: r.key, name: r.name, games: 0 });
    guest = false;
    const saved = save();
    return { ...pub(state.profiles.at(-1)), saved };
  },

  async rename(id, name) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) throw new Error('Profil inconnu.');
    const r = await api('/rename', { ...cred(p), name });
    p.name = r.name;
    save();
    return r.name;
  },

  /** Statistiques (serveur). Met aussi à jour le pseudo et le nombre de parties affichés dans « Qui joue ? ». */
  async stats(id) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) throw new Error('Profil inconnu.');
    try {
      const r = await api('/me', cred(p));
      p.name = r.name;
      p.games = r.stats.games;
      save();
      return r.stats;
    } catch (e) {
      throw e;
    }
  },

  /** Oublie le profil sur cet appareil (les parties déjà jouées restent sur le serveur). */
  forget(id) {
    state.profiles = state.profiles.filter((p) => p.id !== id);
    if (state.active === id) state.active = null;
    save();
  },
};
