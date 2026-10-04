/**
 * Serveur du Village des Blackops : processus Node.js PERSISTANT (pas de
 * fonctions serverless qui s'endorment entre deux requêtes).
 */
import path from 'node:path';
import { createApp } from './app.ts';
import { FileGameStore } from './store.ts';
import { profileStoreFromEnv } from '../platform/profiles.ts';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data/games');

const store = new FileGameStore(DATA_DIR);
// Profils de la plateforme : Supabase si configuré (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), sinon fichier local.
const profiles = profileStoreFromEnv(process.env.PROFILES_DIR ?? path.join(DATA_DIR, 'profiles'));
console.log(`👤 Profils joueurs : ${profiles.label}`);
const { http, manager } = createApp(store, { profiles });

const restored = await manager.restore();
http.listen(PORT, () => {
  console.log(`🐺 Le Village des Blackops — http://localhost:${PORT}  (${restored} partie(s) restaurée(s), données : ${DATA_DIR})`);
});

async function shutdown() {
  console.log('Arrêt du serveur…');
  setTimeout(() => process.exit(0), 5000).unref();
  manager.stop(); // déconnecte les joueurs : plus aucune action non sauvegardée
  await store.flush(); // dernières sauvegardes écrites sur le volume
  http.close(() => process.exit(0));
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
