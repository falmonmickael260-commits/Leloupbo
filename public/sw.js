/**
 * Service worker de l'appli installable (icône sur l'écran d'accueil, appli des magasins).
 *
 * - Rien n'est gardé en cache : le jeu affiché est toujours la dernière version (la mise à jour
 *   automatique des téléphones reste intacte).
 * - Seules les ouvertures de page passent par ici. Images, scripts et parties en direct vont
 *   directement au serveur, comme dans le navigateur.
 * - Sans connexion : une page claire « Pas de connexion » au lieu de l'erreur du téléphone.
 */
const OFFLINE = `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Le Village des Blackops</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: #060508; color: #f3ead6; font: 600 16px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: center; }
  main { max-width: 320px; padding: 24px; }
  h1 { margin: 10px 0 6px; color: #f2c75c; font-size: 22px; }
  p { margin: 0 0 18px; color: #a89e8c; }
  button { padding: 12px 22px; border: 1.5px solid #7a5718; border-radius: 8px; background: linear-gradient(180deg, #ffe79a, #d39b34); color: #1a1206; font: 800 16px system-ui, sans-serif; }
</style></head>
<body><main><div style="font-size:44px">🐺</div><h1>Pas de connexion</h1><p>Le village a besoin d'Internet pour jouer. Vérifie ton Wi-Fi ou tes données mobiles.</p>
<button onclick="location.reload()">Réessayer</button></main></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
