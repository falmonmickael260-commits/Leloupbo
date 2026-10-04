# Profils joueurs de la plateforme

Profils **sans compte** : pas d'e-mail, pas de Google/Apple, pas de mot de passe, pas de code.
Même appareil + même navigateur = joueur reconnu automatiquement.

## Ce que voit le joueur

| Situation | Écran |
|---|---|
| 1re visite | « Bienvenue ! » → « Choisis ton pseudo » → **Continuer** (ou **Jouer en invité**) |
| Un seul profil sur l'appareil | reconnu d'office : « Bonjour Micka 👋 » + parties / victoires / défaites |
| Plusieurs profils sur l'appareil | « Qui joue ? » (chacun avec son nombre de parties) + **＋ Ajouter un joueur** |
| Invité | joue tout de suite avec un pseudo ; rien n'est enregistré ; peut créer son profil ensuite |

Le pseudo se change à tout moment (✏️ Pseudo) : l'identifiant interne et les statistiques ne changent pas.
Sur un appareil partagé, le joueur choisi reste actif pour l'onglet en cours ; une nouvelle visite repasse par « Qui joue ? ».

**Limite assumée** (indiquée au joueur) : si les données du navigateur sont effacées ou si l'on change
d'appareil, le profil ne peut pas être retrouvé.

## Fonctionnement

```
Navigateur ── localStorage « platform:profiles:v1 » : [{ id (UUID), key (secret), pseudo }]
    │  POST /api/profiles {name}        → le SERVEUR crée l'UUID et la clé
    │  POST /api/profiles/me {id,key}   → pseudo + statistiques
    │  socket game:create / game:join { name, profile: {id,key} }
    ▼
Serveur de jeu ── vérifie la clé (seule son empreinte SHA-256 est stockée)
    │  fin de partie : enregistre lui-même le résultat de chaque joueur ayant un profil
    ▼
Supabase (ou fichier local) ── platform_players, platform_game_results
```

- L'identifiant interne (UUID) n'est jamais affiché, ni envoyé aux autres joueurs.
- Le pseudo n'est qu'une donnée d'affichage ; deux joueurs peuvent avoir le même.
- **Le navigateur n'envoie jamais de statistiques** : le serveur enregistre le résultat qu'il a lui-même arbitré
  (`src/server/results.ts`), une seule fois par partie.
- Une clé invalide n'empêche pas de jouer : le joueur entre en invité (rien n'est compté).
- Le navigateur ne parle jamais à Supabase. Les tables ont la RLS activée **sans aucune règle** :
  la clé publique ne peut rien lire ni écrire ; seule la clé secrète du serveur passe.

## Statistiques disponibles

Total (parties, victoires, défaites, égalités, éliminations), par jeu, par rôle et par camp
(victoires en Loup, victoires en Civil…). Elles sont recalculées à partir de l'historique des résultats,
donc tout nouveau type de statistique s'applique aussi aux parties passées.

## Mise en place de Supabase

Sans Supabase, le serveur garde les profils dans `data/games/profiles/profiles.json`. Sur Railway, ce fichier
disparaît à chaque redéploiement, sauf si un volume est monté. Pour une sauvegarde durable :

1. Créer un projet sur [supabase.com](https://supabase.com) (offre gratuite).
2. **SQL Editor → New query** : coller le contenu de [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
3. **Project Settings → API Keys** (ou **Data API**) : copier l'**URL du projet** et la **clé secrète**
   (`sb_secret_…`, ou l'ancienne clé `service_role`).
4. Dans **Railway → le service → Variables**, ajouter :
   - `SUPABASE_URL` = `https://xxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = la clé secrète
5. Redéployer. `/health` doit afficher `"profils":"Supabase (xxxx.supabase.co)"`.

⚠️ La clé secrète ne doit **jamais** être mise dans le code, dans le dépôt, ni dans le navigateur :
uniquement dans les variables Railway.

## Réutiliser dans un autre jeu (Rami, Président…)

- **Navigateur** : `import { profiles } from '/js/platform/profiles.js'`, puis `profiles.active()`,
  `profiles.credentials()` à joindre quand le joueur rejoint une partie, et `profiles.stats(id)`.
  Les profils locaux sont partagés par tous les jeux servis depuis le **même domaine**.
- **Serveur** : vérifier le joueur avec `profileStore.verifyOptional(credentials)`, puis en fin de partie
  `profileStore.recordGame(codePartie, [{ playerId, game: 'rami', role, camp, outcome, eliminated }])`.
  Les statistiques globales et `byGame.rami` se remplissent automatiquement.
