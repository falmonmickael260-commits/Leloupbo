/**
 * API HTTP des profils de la plateforme (aucune donnée de jeu n'y est écrite) :
 *   POST /api/profiles          { name }            → { id, key, name }   (nouveau profil)
 *   POST /api/profiles/me       { id, key }         → { id, name, stats }
 *   POST /api/profiles/rename   { id, key, name }   → { name }
 * Les identifiants passent dans le corps (POST), jamais dans l'URL : ils n'apparaissent pas
 * dans les journaux d'accès.
 */
import express, { type Request, type Response } from 'express';
import { RateLimiter } from '../server/rateLimit.ts';
import { ProfileError, type ProfileStore } from './profiles.ts';

export function profileRouter(store: ProfileStore): express.Router {
  const r = express.Router();
  const limiter = new RateLimiter();
  r.use(express.json({ limit: '4kb' }));

  const handle = (kind: string, fn: (body: Record<string, unknown>) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!limiter.allow(req.ip ?? 'ip', kind)) return void res.status(429).json({ ok: false, error: 'RATE_LIMIT', message: 'Trop de demandes, réessaie dans un instant.' });
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      res.json({ ok: true, ...((await fn(body)) as object) });
    } catch (e) {
      if (e instanceof ProfileError) return void res.status(e.code === 'NO_PROFILE' ? 404 : 400).json({ ok: false, error: e.code, message: e.message });
      console.error('[profils]', e);
      res.status(503).json({ ok: false, error: 'UNAVAILABLE', message: 'Profils indisponibles pour le moment.' });
    }
  };

  r.post('/', handle('profileCreate', (b) => store.create(b.name)));
  r.post('/me', handle('profile', (b) => store.info(b)));
  r.post('/rename', handle('profile', async (b) => ({ name: await store.rename(b, b.name) })));
  return r;
}
