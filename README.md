# 🐺 Le Village des Blackops

Loup-Garou multijoueur en ligne, jouable dans le navigateur (jusqu'à 18 joueurs,
parties d'environ 30 minutes).

> Moteur de jeu complet (serveur temps réel autoritaire, voix, chats, persistance)
> et plateau **2D style bande dessinée** : village illustré, personnages-pions,
> cycle jour/nuit animé, cartes de rôles, narrateur.

## Démarrer

```bash
npm install
npm start            # http://localhost:3000
```

Variables d'environnement : `PORT` (3000 par défaut), `DATA_DIR`
(`./data/games` par défaut — un fichier JSON par partie, rechargé au redémarrage).

### Tester une partie seul

1. Ouvrir http://localhost:3000, choisir un pseudo, **Créer une partie**.
2. Dans le lobby : **+ Ajouter un bot** (×5 ou plus), choisir les rôles,
   passer les durées en **Rapides (test)**, **Lancer la partie**.
3. Les bots jouent via la même API que les humains (ils ne voient que leur propre vue).

### Tester à plusieurs dans un seul navigateur

Chaque onglet ouvert avec un profil différent est un joueur distinct :
`http://localhost:3000/?profile=2`, `?profile=3`… (rejoindre avec le code de la partie).
Rafraîchir un onglet ou le fermer/rouvrir reconnecte automatiquement le joueur
à sa place, avec son rôle et la phase en cours.

### Commandes utiles

```bash
npm test                         # règles, anti-fuite, simulations 4→18 joueurs, serveur réel
npm run typecheck
npm run simulate -- 12 1 3       # 1 partie de 12 joueurs (graine 3), journal complet
npm run simulate -- 10 200       # 200 parties : statistiques de victoire
```

## Ce que fait le moteur

* Création de partie par l'Hôte (4 à 18 joueurs), choix des rôles disponibles ;
  **distribution aléatoire côté serveur** (l'Hôte ne choisit jamais qui reçoit quoi) ;
  réglages verrouillés une fois la partie lancée.
* Rôles : Villageois, Loup-Garou, Loup-Blanc, Voyante, Sorcière, Cupidon, Voleur,
  Chasseur, Salvateur, Capitaine (élu). Ajout d'un rôle = un fichier.
* Machine d'état serveur : nuit (rôles réveillés un par un) → résolution →
  lever du jour → dernières paroles (30 s, bouton FINIR) → élection du Capitaine
  (jour 1) → tours de parole (45 s chacun, un seul micro) → discussion libre (60 s)
  → vote secret (20 s) → résultat (rôle jamais révélé) → morts → victoire ?
* Voix : permissions calculées par le serveur à chaque phase (canal privé des
  Loups, orateur unique, morts muets) ; transport WebRTC dans l'interface de test.
* Chats : village, Loups (privé), **💀 chat des morts** (invisible aux vivants).
* Amoureux, Chasseur, Capitaine, conditions de victoire extensibles (Village,
  Loups, Loup-Blanc, Amoureux).
* Reconnexion, déconnexions, abandon, transfert d'Hôte, persistance, anti-triche.

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Déploiement

Le jeu nécessite un **processus Node.js persistant** (VM, conteneur, Render /
Railway / Fly.io en instance toujours active) avec un volume pour `DATA_DIR`.
Ne pas déployer sur des fonctions serverless qui s'endorment entre deux requêtes :
les timers de phase et les connexions WebSocket doivent vivre toute la partie.
