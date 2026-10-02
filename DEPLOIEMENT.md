# Mettre le jeu en ligne

## Railway (recommandé si tu as un abonnement Railway)

Le dépôt contient `railway.json` + `Dockerfile` : Railway sait construire et lancer le jeu.

1. Sur **railway.com** → **New Project** → **Deploy from GitHub repo** → choisis **Leloupbo**.
2. Ouvre le service créé → **Settings** → **Source** → **Branch** :
   choisis `claude/eloquent-clarke-3dot1j`.
3. Onglet **Variables** → **Raw Editor**, colle (avec ton vrai secret) puis **Update** :
   ```
   LIVEKIT_URL=wss://loupdesblackops-ijlythgg.livekit.cloud
   LIVEKIT_API_KEY=APIkkbum6DNWgy2
   LIVEKIT_API_SECRET=ton_secret
   ```
4. Ajoute un **volume** (clic droit sur le service → **Attach Volume**, ou bouton
   « + » → Volume) avec le chemin de montage **`/data`** : les parties en cours
   survivent aux redémarrages.
5. **Settings** → **Networking** → **Generate Domain** : Railway te donne une adresse
   `https://….up.railway.app`. Si on te demande un port, mets **3000**.
6. Vérifie que **Serverless / App Sleeping est désactivé** (Settings) : le serveur
   doit rester allumé pendant les parties.
7. Ouvre l'adresse, crée une partie, envoie le code à tes amis.

Le journal du service doit afficher :
`🎙️ Voix : serveur audio LiveKit (wss://…)` puis `🐺 Le Village des Blackops — …`.
Garde **1 seule réplique** (les parties vivent en mémoire du serveur).

## Render (alternative)

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
