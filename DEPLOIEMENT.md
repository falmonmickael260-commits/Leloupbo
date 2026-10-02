# Mettre le jeu en ligne (Render)

Le dépôt contient `render.yaml` : Render configure tout seul le serveur.

1. Va sur **render.com** → **Get Started** → connecte-toi **avec GitHub**.
2. Autorise Render à accéder au dépôt **Leloupbo**.
3. Clique sur **New** → **Blueprint** → choisis le dépôt **Leloupbo**.
4. Render lit `render.yaml` et te demande trois valeurs : colle celles de LiveKit
   - `LIVEKIT_URL` = `wss://loupdesblackops-ijlythgg.livekit.cloud`
   - `LIVEKIT_API_KEY` = ta clé
   - `LIVEKIT_API_SECRET` = ton secret
5. Clique sur **Apply** / **Deploy**. Après quelques minutes, Render affiche une
   adresse du type `https://village-des-blackops.onrender.com`.
6. Ouvre cette adresse, crée une partie et envoie le **code** à tes amis.

Bon à savoir :
- Formule **Starter** (payante, petit prix mensuel — voir les tarifs Render) :
  l'offre gratuite met le serveur en veille et couperait les parties en cours.
- Un **disque** de 1 Go garde les parties en cours si le serveur redémarre.
- Chaque nouvel envoi de code sur la branche remet le jeu à jour automatiquement.
- Les secrets LiveKit restent uniquement dans Render, jamais dans le dépôt.

Autres hébergeurs : le `Dockerfile` fonctionne sur Railway, Fly.io ou un VPS
(variables `PORT`, `DATA_DIR`, `LIVEKIT_*`, volume monté sur `/data`).
