import compression from 'compression';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { allRoles, roleInfo } from '../engine/roles/index.ts';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.ts';
import { GameManager, type ManagerOptions } from './gameManager.ts';
import type { GameStore } from './store.ts';
import { missingSfuVars } from './voiceSfu.ts';
import { profileRouter } from '../platform/http.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.resolve(here, '../../public');

export function createApp(store: GameStore, opts: ManagerOptions = {}): { http: HttpServer; manager: GameManager; io: Server } {
  const app = express();
  app.disable('x-powered-by');
  // Derrière le proxy de l'hébergeur : la vraie adresse IP sert au limiteur des profils.
  app.set('trust proxy', 1);
  app.get('/health', (_req, res) => {
    const voice = manager.sfu ? { mode: 'livekit', livekit: manager.sfu.health } : { mode: 'pair-à-pair', manquant: missingSfuVars() };
    res.json({ ok: true, games: manager.rooms.size, uptime: process.uptime(), droppedSignals: manager.droppedSignals, voice, profils: manager.profiles.label });
  });
  // Bruitages enregistrés fournis (public/assets/sfx/<nom>.mp3) : liste, pour ne jamais demander un fichier absent.
  // (Liste établie une fois au démarrage : les fichiers ne changent qu'avec un redéploiement.)
  let sfxNames: string[] = [];
  try {
    sfxNames = readdirSync(path.join(PUBLIC_DIR, 'assets', 'sfx'))
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => f.slice(0, -4));
  } catch {
    /* dossier absent */
  }
  app.get('/api/sfx', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(sfxNames);
  });
  app.get('/api/roles', (_req, res) => {
    res.json(allRoles().map(roleInfo));
  });
  app.use(compression());
  // Profils de la plateforme : le gestionnaire est créé plus bas, le routeur le lit à la demande.
  app.use('/api/profiles', (req, res, next) => profiles(req, res, next));
  // Client LiveKit (chargé à la demande par le navigateur, seulement si le serveur audio est configuré).
  app.get('/vendor/livekit-client.umd.js', (_req, res) => {
    res.sendFile(path.resolve(here, '../../node_modules/livekit-client/dist/livekit-client.umd.js'), { maxAge: '1d' });
  });
  // Page et scripts : toujours revérifiés (une mise à jour du jeu est visible tout de suite).
  // Polices et décor : gardés en cache (ils changent rarement).
  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders(res, file) {
        // Polices : gardées en cache. Tout le reste (page, scripts, images, cartes, décor) est
        // revérifié à chaque visite : une image remplacée est visible tout de suite.
        if (/[\\/]fonts[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=86400');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  const http = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    // Heartbeat régulier : une phase silencieuse de 60 s ne coupe jamais la connexion.
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 64_000,
    serveClient: true,
  });
  const manager = new GameManager(io, store, opts);
  const profiles = profileRouter(manager.profiles);
  return { http, manager, io };
}
