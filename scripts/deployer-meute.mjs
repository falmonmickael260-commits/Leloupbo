/** À exécuter dans le Terminal du Mac : contrôles réels avant toute publication. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.resolve(game, '../revanche-games-web');
const cli = ['--yes', '@railway/cli@5.71.0'];
const gameTarget = ['--project', 'f3ea84af-f08a-491b-a27e-49e4ccbe006d', '--service', '06684f08-9de1-4951-a367-b21871330f58', '--environment', 'a67c0f4d-8972-4913-9ed4-e0e72283364f'];
const webTarget = ['--project', '3e5dd7a9-6200-4fe2-a752-88aa2875bbc7', '--service', '9ace6bc2-6623-47b9-9325-d7df0ba017d9', '--environment', 'ef9f575e-7556-4226-9e33-cfe11c30d281'];
const moduleFile = path.join(game, 'public/js/roleWallet.js');
const expectedHash = createHash('sha256').update(readFileSync(moduleFile)).digest('hex');

function run(command, args, { cwd = game, privateOutput = false, input } = {}) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    stdio: privateOutput ? ['pipe', 'pipe', 'pipe'] : 'inherit', input,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Étape interrompue (${command}, code ${result.status ?? 'indisponible'}). Aucune étape suivante exécutée.`);
  }
  return result.stdout ?? '';
}
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a); const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
export function variablesToSynchronize(platform, current) {
  const url = platform.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof url !== 'string' || url.replace(/\/$/, '') !== 'https://wrsmtdtzilpckfcjmyri.supabase.co') {
    throw new Error('La plateforme ne vise pas le projet Supabase central attendu. Déploiement arrêté.');
  }
  if (!platform.PLATFORM_SHARED_SECRET || !platform.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Les secrets requis sont absents de la plateforme. Aucune valeur inventée.');
  }
  const desired = {
    PLATFORM_SUPABASE_URL: url,
    PLATFORM_SUPABASE_SERVICE_ROLE_KEY: platform.SUPABASE_SERVICE_ROLE_KEY,
    PLATFORM_SHARED_SECRET: platform.PLATFORM_SHARED_SECRET,
  };
  for (const key of Object.keys(desired)) {
    if (Object.hasOwn(current, key) && current[key] === null) throw new Error(`${key} est protégée (sealed). Vérification manuelle requise ; aucune clé protégée remplacée.`);
  }
  return Object.entries(desired).filter(([key, value]) => !same(value, current[key]));
}
function loadVariables(target) {
  const text = run('npx', [...cli, 'variables', '--json', ...target], { privateOutput: true });
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('Variables Railway illisibles. Leurs valeurs restent masquées.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Format des variables Railway inattendu.');
  return result;
}
export function assertPersistentStorage(variables, volumes = {}) {
  const configured = Object.hasOwn(variables, 'DATA_DIR') ? variables.DATA_DIR : '/data/games';
  if (typeof configured !== 'string' || !configured.startsWith('/') || configured.includes('\0') || configured.trim() !== configured) {
    throw new Error(`DATA_DIR actuel invalide ou relatif : ${JSON.stringify(configured)}. Aucun chemin ni fichier modifié.`);
  }
  const dataDir = path.posix.normalize(configured);
  const mounts = new Set();
  function addMount(value) {
    if (typeof value === 'string' && value.startsWith('/') && !value.includes('\0')) {
      const mount = path.posix.normalize(value);
      if (mount !== '/') mounts.add(mount);
    }
  }
  addMount(variables.RAILWAY_VOLUME_MOUNT_PATH);
  const serviceIds = new Set(['06684f08-9de1-4951-a367-b21871330f58', 'village-des-blackops']);
  const environmentIds = new Set(['a67c0f4d-8972-4913-9ed4-e0e72283364f', 'production']);
  function identity(value, idKey, objectKey, previous) {
    if (Object.hasOwn(value, idKey)) return value[idKey];
    if (Object.hasOwn(value, objectKey)) return typeof value[objectKey] === 'object' ? value[objectKey]?.id : value[objectKey];
    return previous;
  }
  function attached(value, scope = {}) {
    if (Array.isArray(value)) { value.forEach((v) => attached(v, scope)); return; }
    if (!value || typeof value !== 'object') return;
    const service = identity(value, 'serviceId', 'service', scope.service);
    const environment = identity(value, 'environmentId', 'environment', scope.environment);
    if (serviceIds.has(service) && environmentIds.has(environment)) addMount(value.mountPath ?? value.mount_path);
    Object.values(value).forEach((v) => attached(v, { service, environment }));
  }
  attached(volumes);
  for (const mountPath of mounts) {
    if (dataDir === mountPath || dataDir.startsWith(mountPath.replace(/\/$/, '') + '/')) {
      return { dataDir, mountPath };
    }
  }
  throw new Error(`DATA_DIR actuel : ${JSON.stringify(configured)} ; volumes confirmés : ${JSON.stringify([...mounts])}. Ce chemin n'est pas confirmé dans un volume persistant. Aucun fichier déplacé.`);
}
function verifyStorage(variables) {
  try { return assertPersistentStorage(variables); } catch { /* Chercher les montages du service dans l'API. */ }
  let volumes;
  try {
    volumes = JSON.parse(run('npx', [...cli, 'volume', ...gameTarget, 'list', '--json'], { privateOutput: true }));
  } catch {
    throw new Error('Impossible de lire les informations du volume Railway. Aucun déploiement lancé.');
  }
  return assertPersistentStorage(variables, volumes);
}

async function verifyPublished() {
  for (let i = 0; i < 24; i++) {
    try {
      const response = await fetch(`https://www.lameutenoire.fr/js/roleWallet.js?controle=${Date.now()}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (response.ok && createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') === expectedHash) return;
    } catch { /* Le service peut redémarrer pendant le déploiement. */ }
    console.log('Attente de la nouvelle version sur lameutenoire.fr…');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Le domaine ne sert toujours pas le fichier attendu. Vérifier les logs du dernier déploiement et le rattachement de lameutenoire.fr au service village-des-blackops dans Railway > Networking.');
}
async function deploy() {
  console.log('1/6 — Vérification de la protection publique de la plateforme');
  run('node', ['scripts/check-public-result-guard.mjs', 'https://revanchegames-production.up.railway.app'], { cwd: web });
  console.log('2/6 — Vérification en lecture seule des migrations Supabase');
  run('npx', ['--yes', 'supabase@2.122.0', 'db', 'query', '--linked', '--file', 'scripts/sql/production-postflight.sql'], { cwd: web });
  console.log('3/6 — Vérification du volume persistant via Railway (sans SSH)');
  const current = loadVariables(gameTarget);
  // Sans variable DATA_DIR explicite, le Dockerfile doit garantir le chemin.
  if (!Object.hasOwn(current, 'DATA_DIR') && !/DATA_DIR=\/data\/games(?:\s|$)/.test(readFileSync(path.join(game, 'Dockerfile'), 'utf8'))) {
    throw new Error('Chemin de stockage non confirmé dans le Dockerfile.');
  }
  const storage = verifyStorage(current);
  console.log(`Stockage conservé : ${storage.dataDir} (volume ${storage.mountPath}).`);
  console.log('4/6 — Synchronisation des trois variables Revanche Games, valeurs masquées');
  const platform = loadVariables(webTarget);
  for (const [key, value] of variablesToSynchronize(platform, current)) {
    run('npx', [...cli, 'variable', 'set', '--skip-deploys', '--stdin', key, ...gameTarget], { privateOutput: true, input: value });
    console.log(`${key} synchronisée.`);
  }
  if (variablesToSynchronize(platform, loadVariables(gameTarget)).length) throw new Error('Les variables ne correspondent pas après synchronisation.');
  console.log('5/6 — Envoi direct du dossier La Meute au service village-des-blackops');
  run('npx', [...cli, 'up', ...gameTarget, '--ci']);
  console.log('6/6 — Vérification du fichier réellement servi sur le domaine du jeu');
  await verifyPublished();
  console.log('\nVERSION DU PORTEFEUILLE CONFIRMÉE EN LIGNE.');
  console.log('Ferme puis rouvre La Meute depuis ton compte Revanche Games. Vérifie le solde et le choix des rôles.');
  console.log('Cette vérification technique ne remplace pas un achat réel avec un compte connecté.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deploy().catch((error) => { console.error('\nARRÊT : ' + error.message); process.exitCode = 1; });
}
