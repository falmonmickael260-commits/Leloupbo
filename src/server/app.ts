import compression from 'compression';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { allRoles, roleInfo } from '../engine/roles/index.ts';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.ts';
import { GameManager, type ManagerOptions } from './gameManager.ts';
import type { GameStore } from './store.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.resolve(here, '../../public');

export function createApp(store: GameStore, opts: ManagerOptions = {}): { http: HttpServer; manager: GameManager; io: Server } {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    res.json({ ok: true, games: manager.rooms.size, uptime: process.uptime(), droppedSignals: manager.droppedSignals });
  });
  app.get('/api/roles', (_req, res) => {
    res.json(allRoles().map(roleInfo));
  });
  app.use(compression());
  // Client LiveKit (chargé à la demande par le navigateur, seulement si le serveur audio est configuré).
  app.get('/vendor/livekit-client.umd.js', (_req, res) => {
    res.sendFile(path.resolve(here, '../../node_modules/livekit-client/dist/livekit-client.umd.js'), { maxAge: '1d' });
  });
  app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

  const http = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    // Heartbeat régulier : une phase silencieuse de 60 s ne coupe jamais la connexion.
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 64_000,
    serveClient: true,
  });
  const manager = new GameManager(io, store, opts);
  return { http, manager, io };
}
