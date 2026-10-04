/**
 * Profils joueurs de la PLATEFORME (communs à tous les jeux) — sans compte.
 *
 * - Un profil = un identifiant interne (UUID, jamais affiché) + un pseudo modifiable.
 * - Le navigateur garde l'identifiant ET une clé secrète (générée par le serveur, dont seule
 *   l'empreinte SHA-256 est stockée) : sans la clé, impossible d'agir au nom d'un autre profil.
 * - Les statistiques ne sont JAMAIS envoyées par le navigateur : le serveur de jeu enregistre
 *   lui-même le résultat de chaque partie (`recordGame`), puis les agrège à la lecture.
 *
 * Stockage : Supabase si SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sont définies (tables fermées
 * par RLS, accessibles uniquement par le serveur), sinon un fichier JSON local.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type Outcome = 'win' | 'loss' | 'draw';

/** Une ligne de résultat : un joueur dans une partie terminée. */
export interface GameResultRow {
  playerId: string;
  /** Identifiant du jeu de la plateforme (ex. 'loup-garou', 'rami', 'president'). */
  game: string;
  /** Rôle joué (propre au jeu, facultatif). */
  role?: string | null;
  /** Camp joué (propre au jeu, facultatif : 'loup', 'civil'…). */
  camp?: string | null;
  outcome: Outcome;
  eliminated: boolean;
}

export interface Counter {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface PlayerStats extends Counter {
  eliminations: number;
  byGame: Record<string, Counter & { eliminations: number }>;
  byRole: Record<string, Counter>;
  byCamp: Record<string, Counter>;
}

export interface ProfileInfo {
  id: string;
  name: string;
  stats: PlayerStats;
}

export interface Credentials {
  id: string;
  key: string;
}

export class ProfileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function sanitizeProfileName(raw: unknown): string {
  const name = [...String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim()].slice(0, 20).join('');
  if (!name) throw new ProfileError('BAD_NAME', 'Choisis un pseudo.');
  return name;
}

/** Identifiants reçus du navigateur : forme vérifiée, rien d'autre n'est cru. */
export function parseCredentials(raw: unknown): Credentials | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, key } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
  if (typeof key !== 'string' || key.length < 20 || key.length > 100) return null;
  return { id: id.toLowerCase(), key };
}

const zero = (): Counter => ({ games: 0, wins: 0, losses: 0, draws: 0 });
function add(c: Counter, o: Outcome) {
  c.games++;
  if (o === 'win') c.wins++;
  else if (o === 'loss') c.losses++;
  else c.draws++;
}

export function aggregateStats(rows: Pick<GameResultRow, 'game' | 'role' | 'camp' | 'outcome' | 'eliminated'>[]): PlayerStats {
  const s: PlayerStats = { ...zero(), eliminations: 0, byGame: {}, byRole: {}, byCamp: {} };
  for (const r of rows) {
    add(s, r.outcome);
    if (r.eliminated) s.eliminations++;
    const g = (s.byGame[r.game] ??= { ...zero(), eliminations: 0 });
    add(g, r.outcome);
    if (r.eliminated) g.eliminations++;
    if (r.role) add((s.byRole[`${r.game}:${r.role}`] ??= zero()), r.outcome);
    if (r.camp) add((s.byCamp[`${r.game}:${r.camp}`] ??= zero()), r.outcome);
  }
  return s;
}

function sameHash(a: string, b: string) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Opérations de stockage brutes (implémentées par le fichier local ou Supabase). */
interface Backend {
  insertPlayer(row: { id: string; name: string; keyHash: string }): Promise<void>;
  getPlayer(id: string): Promise<{ name: string; keyHash: string } | null>;
  setName(id: string, name: string): Promise<void>;
  insertResults(rows: (GameResultRow & { gameCode: string; endedAt: string })[]): Promise<void>;
  getResults(id: string): Promise<GameResultRow[]>;
  readonly label: string;
}

export class ProfileStore {
  /** Empreintes déjà vérifiées (évite un aller-retour à chaque partie). */
  private verified = new Map<string, string>();

  constructor(private readonly backend: Backend) {}

  get label() {
    return this.backend.label;
  }

  async create(rawName: unknown): Promise<Credentials & { name: string }> {
    const name = sanitizeProfileName(rawName);
    const id = randomUUID();
    const key = randomBytes(32).toString('base64url');
    const keyHash = hashKey(key);
    await this.backend.insertPlayer({ id, name, keyHash });
    this.verified.set(id, keyHash);
    return { id, key, name };
  }

  /** Vérifie la clé ; renvoie l'id du profil ou lève NO_PROFILE. */
  async verify(raw: unknown): Promise<string> {
    const cred = parseCredentials(raw);
    if (!cred) throw new ProfileError('NO_PROFILE', 'Profil inconnu.');
    const h = hashKey(cred.key);
    const cached = this.verified.get(cred.id);
    if (cached && sameHash(cached, h)) return cred.id;
    const p = await this.backend.getPlayer(cred.id);
    if (!p || !sameHash(p.keyHash, h)) throw new ProfileError('NO_PROFILE', 'Profil inconnu.');
    this.verified.set(cred.id, p.keyHash);
    return cred.id;
  }

  /** Comme `verify`, mais renvoie null (joueur invité) au lieu d'échouer. */
  async verifyOptional(raw: unknown): Promise<string | null> {
    if (!raw) return null;
    try {
      return await this.verify(raw);
    } catch (e) {
      if (!(e instanceof ProfileError)) console.error('[profils] vérification impossible', e);
      return null;
    }
  }

  async info(raw: unknown): Promise<ProfileInfo> {
    const id = await this.verify(raw);
    const [p, rows] = await Promise.all([this.backend.getPlayer(id), this.backend.getResults(id)]);
    return { id, name: p!.name, stats: aggregateStats(rows) };
  }

  async rename(raw: unknown, rawName: unknown): Promise<string> {
    const id = await this.verify(raw);
    const name = sanitizeProfileName(rawName);
    await this.backend.setName(id, name);
    return name;
  }

  /** Appelé UNIQUEMENT par le serveur de jeu, avec le résultat qu'il a lui-même calculé. */
  async recordGame(gameCode: string, rows: GameResultRow[]): Promise<void> {
    if (!rows.length) return;
    const endedAt = new Date().toISOString();
    await this.backend.insertResults(rows.map((r) => ({ ...r, gameCode, endedAt })));
  }
}

// ------------------------------------------------------------------ fichier local

interface FileData {
  players: Record<string, { name: string; keyHash: string; createdAt: string }>;
  results: (GameResultRow & { gameCode: string; endedAt: string })[];
}

/** Stockage de secours (développement, tests, ou Supabase non configuré). */
export class FileBackend implements Backend {
  readonly label: string;
  private data: FileData | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string | null) {
    this.label = file ? `fichier local (${file})` : 'mémoire';
  }

  private async load(): Promise<FileData> {
    if (this.data) return this.data;
    let data: FileData = { players: {}, results: [] };
    if (this.file) {
      try {
        data = JSON.parse(await readFile(this.file, 'utf8')) as FileData;
      } catch {
        /* premier lancement */
      }
    }
    return (this.data ??= data);
  }

  private save(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(this.data), 'utf8');
      await rename(tmp, file);
    });
    return this.writing;
  }

  async insertPlayer(row: { id: string; name: string; keyHash: string }) {
    const d = await this.load();
    d.players[row.id] = { name: row.name, keyHash: row.keyHash, createdAt: new Date().toISOString() };
    await this.save();
  }
  async getPlayer(id: string) {
    const p = (await this.load()).players[id];
    return p ? { name: p.name, keyHash: p.keyHash } : null;
  }
  async setName(id: string, name: string) {
    const d = await this.load();
    if (d.players[id]) d.players[id].name = name;
    await this.save();
  }
  async insertResults(rows: FileData['results']) {
    const d = await this.load();
    d.results.push(...rows);
    await this.save();
  }
  async getResults(id: string) {
    return (await this.load()).results.filter((r) => r.playerId === id);
  }
}

// ------------------------------------------------------------------ Supabase

/**
 * Accès Supabase par l'API REST (PostgREST) avec la clé SECRÈTE du serveur.
 * Les tables ont la RLS activée sans aucune règle d'accès : la clé publique (navigateur)
 * ne peut ni lire ni écrire ; seule la clé secrète du serveur passe.
 */
export class SupabaseBackend implements Backend {
  readonly label: string;

  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // Adresse du projet, même si elle a été copiée avec « /rest/v1/ » à la fin.
    this.url = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    this.label = `Supabase (${new URL(this.url).host})`;
  }

  private async req(method: string, pathAndQuery: string, body?: unknown, prefer?: string): Promise<unknown> {
    const headers: Record<string, string> = { apikey: this.secret, 'Content-Type': 'application/json' };
    // Ancienne clé « service_role » (JWT) : aussi en Authorization. Nouvelle clé sb_secret_… : apikey seul.
    if (this.secret.startsWith('eyJ')) headers.Authorization = `Bearer ${this.secret}`;
    if (prefer) headers.Prefer = prefer;
    const res = await this.fetchImpl(`${this.url}/rest/v1/${pathAndQuery}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${pathAndQuery.split('?')[0]} : ${res.status} ${await res.text()}`);
    const text = await res.text(); // « return=minimal » : réponse vide
    return text ? JSON.parse(text) : null;
  }

  async insertPlayer(row: { id: string; name: string; keyHash: string }) {
    await this.req('POST', 'platform_players', { id: row.id, display_name: row.name, key_hash: row.keyHash }, 'return=minimal');
  }
  async getPlayer(id: string) {
    const rows = (await this.req('GET', `platform_players?id=eq.${id}&select=display_name,key_hash`)) as { display_name: string; key_hash: string }[];
    return rows[0] ? { name: rows[0].display_name, keyHash: rows[0].key_hash } : null;
  }
  async setName(id: string, name: string) {
    await this.req('PATCH', `platform_players?id=eq.${id}`, { display_name: name, updated_at: new Date().toISOString() }, 'return=minimal');
  }
  async insertResults(rows: (GameResultRow & { gameCode: string; endedAt: string })[]) {
    await this.req(
      'POST',
      'platform_game_results',
      rows.map((r) => ({
        player_id: r.playerId,
        game: r.game,
        game_code: r.gameCode,
        role: r.role ?? null,
        camp: r.camp ?? null,
        outcome: r.outcome,
        eliminated: r.eliminated,
        ended_at: r.endedAt,
      })),
      'return=minimal',
    );
  }
  async getResults(id: string) {
    const rows = (await this.req('GET', `platform_game_results?player_id=eq.${id}&select=game,role,camp,outcome,eliminated&limit=100000`)) as {
      game: string;
      role: string | null;
      camp: string | null;
      outcome: Outcome;
      eliminated: boolean;
    }[];
    return rows.map((r) => ({ playerId: id, ...r }));
  }
}

/** Supabase si configuré, sinon fichier local à côté des parties. */
export function profileStoreFromEnv(dataDir: string): ProfileStore {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)?.trim();
  if (url && secret) return new ProfileStore(new SupabaseBackend(url, secret));
  return new ProfileStore(new FileBackend(path.join(dataDir, 'profiles.json')));
}

export const memoryProfileStore = () => new ProfileStore(new FileBackend(null));
