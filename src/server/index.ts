/**
 * Serveur du Village des Blackops : processus Node.js PERSISTANT (pas de
 * fonctions serverless qui s'endorment entre deux requêtes).
 */
import path from 'node:path';
import { createApp } from './app.ts';
import { FileGameStore } from './store.ts';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data/games');

const store = new FileGameStore(DATA_DIR);
const { http, manager } = createApp(store);

const restored = await manager.restore();
http.listen(PORT, () => {
  console.log(`🐺 Le Village des Blackops — http://localhost:${PORT}  (${restored} partie(s) restaurée(s), données : ${DATA_DIR})`);
});

function shutdown() {
  console.log('Arrêt du serveur…');
  manager.stop();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
