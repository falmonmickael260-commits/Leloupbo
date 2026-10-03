# Le Village des Blackops — Architecture (phase 1)

## 1. Analyse de départ

Le dépôt était **vide** (aucun commit, aucun fichier) : il n'y avait ni stack
existante à conserver, ni fonctionnalité à préserver. L'architecture a donc été
conçue de zéro, en suivant les contraintes du cahier des charges :

| Contrainte | Choix |
| --- | --- |
| Partie temps réel d'environ 30 min, sans mise en sommeil | **Processus Node.js persistant** + **Socket.IO** (WebSocket, repli en long-polling) |
| Serveur source de vérité | Moteur **autoritaire** côté serveur ; le client n'envoie que des intentions |
| Timers non manipulables | Timers **serveur** (`phase.endsAt`) ; le client affiche un compte à rebours recalé sur l'heure du serveur |
| Aucune fuite d'info | **Projection par joueur** (`view.ts`) en liste blanche ; l'état complet ne quitte jamais le serveur |
| Reconnexion / persistance | État 100 % JSON, **sauvegardé après chaque changement**, restauré au démarrage ; jeton de session secret |
| Extensibilité | Registre de **rôles** + **étapes nocturnes**, **effets de nuit** résolus génériquement, **conditions de victoire** enregistrables |

Ce qui est **à éviter** (et évité) : hébergement serverless (fonctions qui
s'endorment entre deux requêtes), timers uniquement navigateur, état dans React,
votes/victoire calculés côté client.

## 2. Arborescence

```
src/
  shared/            Types et protocole partagés serveur ↔ client (aucun secret)
    types.ts         PhaseId, PlayerView, ActionPrompt, VoiceView…
    protocol.ts      Événements Socket.IO typés
  engine/            MOTEUR — pur, synchrone, sans réseau (testable seul)
    engine.ts        GameEngine : façade unique (lobby, commandes, tick, vue)
    state.ts         GameState (état secret, JSON pur) + helpers
    settings.ts      Réglages, préréglages de durées, validation des entrées Hôte
    lobby.ts         Création, joueurs, composition, distribution aléatoire, Hôte
    phase.ts         enterPhase, libellés, état du ciel (jour/coucher/nuit/lune/aube)
    flow.ts          PHASE MANAGER : machine d'état, séquence de morts, abandons
    commands.ts      Validation et application des commandes client + prompts
    roles/           SYSTÈME DE RÔLES (un fichier par rôle, auto-enregistré)
    deaths.ts        Morts, réactions en chaîne, ACTION RESOLVER de la nuit
    votes.ts         VOTE MANAGER (secret, voix double du Capitaine)
    speech.ts        Ordre des tours de parole
    voice.ts         VOICE PERMISSIONS (qui parle, qui entend)
    chat.ts          CHAT PERMISSIONS (village / loups / morts)
    win.ts           WIN CONDITION MANAGER (extensible)
    camps.ts         Camp effectif (couple mixte → camp « amoureux »)
    view.ts          Projection anti-triche de l'état vers UN joueur
    bots.ts          Bots de test (ne voient que leur propre vue)
    rng.ts           Aléatoire crypto (prod) / à graine (tests)
  server/
    index.ts         Démarrage (port, dossier de données, arrêt propre)
    app.ts           Express + Socket.IO (heartbeat, limites)
    gameManager.ts   Salles, TIMER MANAGER, diffusion des vues, bots, relais WebRTC
    store.ts         Persistance (FileGameStore / MemoryGameStore)
    rateLimit.ts     Anti-flood par socket
  sim/simulate.ts    Simulation headless de parties complètes
public/              INTERFACE TEMPORAIRE (sera remplacée en phase 2)
  js/gameClient.js   SDK réseau réutilisable (aucune règle de jeu)
  js/voice.js        Micro WebRTC piloté par les permissions serveur
  js/app.js          Interface de test
test/                Tests (règles, anti-fuite, simulations, serveur réel)
```

## 3. Machine d'état

```
LOBBY ─start─▶ ROLE_DISTRIBUTION ─▶ NIGHT_START
  ─▶ THIEF_PHASE (nuit 1) ─▶ CUPID_PHASE (nuit 1) ─▶ WEREWOLF_PHASE
  ─▶ WHITE_WOLF_PHASE (nuits paires) ─▶ SEER_PHASE ─▶ SALVATION_PHASE ─▶ WITCH_PHASE
  ─▶ NIGHT_RESOLUTION ─▶ SUNRISE
  ─▶ [DEATH_LAST_WORD → HUNTER_SHOT? → CAPTAIN_SUCCESSION?]*  (file de morts)
  ─▶ WIN_CHECK ─▶ [CAPTAIN_ELECTION (jour 1)]
  ─▶ PLAYER_SPEECH × vivants ─▶ FREE_DISCUSSION ─▶ VOTING ─▶ VOTE_RESULT
  ─▶ DEATH_SEQUENCE ─▶ [morts]* ─▶ WIN_CHECK ─▶ NIGHT_START …
                                       └──▶ GAME_OVER
```

* Chaque phase possède `endsAt` (heure serveur). À expiration, `finishPhase`
  calcule la phase suivante. Une phase peut se terminer **en avance** (FINIR,
  action effectuée, tous les votes reçus) — toujours décidé par le serveur.
* `NIGHT_RESOLUTION`, `DEATH_SEQUENCE`, `WIN_CHECK` sont des états transitoires.
* Les étapes nocturnes sont **ordonnées par `order`** dans le registre : ajouter
  un rôle nocturne n'impose pas de modifier `flow.ts`.
* **Phases simulées** : si le rôle d'une étape est mort ou écarté (cartes du
  Voleur), la phase est quand même jouée avec une durée aléatoire. Sinon les
  joueurs déduiraient la mort de la Voyante en voyant sa phase disparaître.

### Séquence de morts

`kill()` marque le joueur mort et pousse des tâches dans `deathQueue` :
`last_word` (30 s), `hunter_shot` (Chasseur), `captain_succession` (Capitaine).
L'amoureux survivant meurt aussitôt (chagrin), avec sa propre dernière parole.
`runPipeline()` dépile la file, puis exécute `WIN_CHECK`, puis reprend le jour
ou la nuit. Le rôle des morts n'est **jamais** annoncé.

### Résolution de la nuit (ActionResolver)

Les rôles ne tuent pas directement : ils produisent des **effets**
(`attack`, `protect`, `save`, `kill`). En fin de nuit, `resolveNightEffects`
applique : une attaque est annulée par une protection/sauvegarde couvrant sa
source ; le poison est inconditionnel. Ajouter un rôle protecteur ou tueur
revient à émettre un effet.

## 4. Rôles

Un rôle = `registerRole({...})` + éventuellement `registerNightStep({...})`
(voir `src/engine/roles/types.ts`). Exemple de nouveau rôle nocturne :

```ts
registerRole({ id: 'fox', name: 'Renard', emoji: '🦊', team: 'village', unique: true,
  distributable: true, description: '…', seerResult: () => 'CIVIL' });
registerNightStep({ id: 'fox', phase: 'FOX_PHASE', order: 55, roleIds: ['fox'],
  duration: (s) => 20_000, isScheduled: () => true,
  actors: (ctx) => playersWithRole(ctx.state, 'fox'),
  prompt: (ctx, actor) => ({ … }), handle: (ctx, actor, cmd) => { … },
  isComplete: (ctx) => … });
```
(+ ajouter `FOX_PHASE` à `PHASES` et son libellé.)

| Rôle | Règles implémentées |
| --- | --- |
| Simple Villageois | Aucun pouvoir |
| Loup-Garou | Canal voix + chat privés ; voient les votes de la meute ; fin anticipée si unanimité ; sinon majorité, égalité tirée au sort |
| Loup-Blanc | Se réveille avec la meute ; camp indépendant ; nuits paires : peut dévorer un loup ; gagne seul ; résultat Voyante configurable |
| Voyante | Reçoit uniquement `LOUP` / `CIVIL`, calculé serveur |
| Sorcière | Informée de la victime ; nuit 1 : pas de potion de mort ; une seule utilisation par potion ; auto-sauvetage configurable |
| Cupidon | Nuit 1, deux joueurs ; chaque amoureux ne connaît que le **nom** de l'autre ; mort par chagrin ; tirage au sort si Cupidon ne choisit pas |
| Voleur | Nuit 1 : deux cartes supplémentaires ; échange ou devient villageois ; obligé de prendre un loup si les deux en sont |
| Chasseur | Dernier tir à sa mort (sauf abandon) |
| Salvateur | Protège des loups ; pas deux fois de suite la même personne (configurable) |
| Capitaine | Titre élu le jour 1 (option) ; voix double ; successeur désigné à sa mort |

## 5. Conditions de victoire

`win.ts` évalue une liste ordonnée (`registerWinCondition`) après chaque
séquence de morts et après un abandon :

1. plus personne en vie → égalité ;
2. tous les survivants ont le **même camp effectif** → ce camp gagne
   (`village`, `wolves`, `white_wolf`, `lovers`) ;
3. option : loups à parité ;
4. garde-fou : nombre maximal de jours → égalité.

Le camp effectif d'un amoureux devient `lovers` si le couple est **mixte** ; un
couple de même camp gagne avec son camp.

## 6. Voix et chats

`voice.ts` calcule pour chaque phase `{mode, speakers, listeners}` ; chaque
joueur ne reçoit que `{canSpeak, speakTo, hearFrom}` :

| Phase | Qui parle | Qui entend |
| --- | --- | --- |
| Lobby / fin de partie | tous | tous |
| Phase des Loups | meute vivante | meute vivante |
| Dernière parole | le mort concerné | tous |
| Tour de parole | l'orateur désigné par le serveur | tous |
| Discussion libre / élection | vivants | tous (les morts écoutent) |
| Autres (nuit, vote, annonces) | personne | — |

Le chat « village » reprend exactement ces droits (on écrit si on a la parole).
Le chat des Loups est réservé à la meute vivante, celui des morts aux morts :
les vivants ne le reçoivent jamais et les morts ne peuvent plus écrire chez les
vivants. Tout est vérifié côté serveur.

**Transport audio (phase 1)** : maillage WebRTC pair-à-pair, signalisation
relayée par le serveur. L'émetteur ne transmet sa piste qu'à `speakTo`, le
récepteur coupe tout ce qui n'est pas dans `hearFrom`. Limite : un client
modifié pourrait techniquement écouter un pair honnête… qui ne lui envoie rien,
ou parler hors tour… sans être entendu par les clients honnêtes. Pour une
garantie serveur stricte, brancher un **SFU** (LiveKit, mediasoup) qui
consomme la même structure `voice` (jetons émis par le serveur à chaque phase).

## 7. Temps réel, connexions et reconnexion

* Socket.IO avec heartbeat (`pingInterval` 20 s / `pingTimeout` 25 s) : une
  phase silencieuse ne coupe pas la connexion ; reconnexion automatique du client.
* Après **chaque** changement : la vue de chaque joueur lui est renvoyée en
  entier (≈ quelques Ko). Pas de diff à resynchroniser : une reconnexion = une vue.
* Timers : `setTimeout` sur `phase.endsAt` + horloge de maintenance (1 s). Le
  client affiche `endsAt - (Date.now() + décalage serveur)`.
* Persistance : un fichier JSON par partie (écriture atomique). Au redémarrage,
  les parties sont rechargées, les timers expirés rattrapés, les humains marqués
  déconnectés jusqu'à leur retour.

| Situation | Stratégie |
| --- | --- |
| Rafraîchissement / fermeture accidentelle | Jeton secret en `localStorage` → `session:resume` → vue complète (rôle, phase, action possible si la phase est encore ouverte) |
| Perte de connexion courte | Joueur marqué 📴, reste en jeu ; ses timers continuent ; il reprend où en est la partie |
| Déconnexion prolongée (3 min, réglable) | **Abandon** : mort sans dernière parole, annonce « a quitté le village » (sans rôle) ; amoureux, Capitaine, victoire traités |
| Départ volontaire en partie | Abandon immédiat (même traitement) |
| Lobby | Départ = retrait ; déconnexion > 2 min = retrait |
| Hôte qui part ou déconnecté > 30 s | L'Hôte passe au plus ancien joueur connecté. L'Hôte n'a aucun pouvoir sur une partie lancée (réglages verrouillés) |
| Orateur absent | Son tour de parole est sauté ; dernière parole sautée s'il est absent |
| Action nocturne d'un absent | La phase dure son temps normal (ne rien révéler), action par défaut à l'expiration |
| Plus aucun humain connecté | Partie supprimée après 15 min (lobby : 10 min ; partie finie : 30 min) |

## 8. Anti-triche

* L'état (`GameState`) n'est jamais sérialisé vers un client ; `buildView`
  construit chaque champ explicitement (liste blanche).
* Jamais envoyés : rôles des autres (sauf fin de partie), bulletins, choix
  nocturnes, données internes de phase (dont le caractère « simulé »), messages
  privés d'autrui, jetons (stockés hachés SHA-256).
* Toute commande est revalidée : phase, rôle, vivant, cible autorisée, unicité.
  Les entrées (réglages, pseudo, chat) sont bornées et nettoyées ; limiteur de débit.
* Un test parcourt des centaines de parties simulées et vérifie, à chaque étape
  et pour chaque joueur, l'absence de fuite (`test/simulation.test.ts`).
* Les bots jouent uniquement avec leur vue : preuve qu'aucune info secrète n'est
  nécessaire côté client.

## 9. Déploiement

Le serveur doit tourner comme **service persistant** (VM, conteneur, Render /
Railway / Fly.io en instance toujours active) avec `PORT` et `DATA_DIR`
(volume persistant). Pour monter en charge sur plusieurs instances : affinité de
session (sticky) + adaptateur Redis Socket.IO, et `GameStore` Redis/PostgreSQL —
l'interface `GameStore` est prévue pour cela.

## 10. Direction artistique (phase 2 — plateau 2D « bande dessinée »)

Aucune 3D : tout est en 2D (SVG + CSS). La profondeur vient de la perspective
dessinée, des ombres, de la superposition et de la mise à l'échelle des pions.
**Aucune règle du jeu n'a été modifiée** ; seul ajout côté serveur : le choix
cosmétique du personnage dans le lobby (`lobby:avatar`, `src/shared/avatars.ts`).

| Élément | Fichier |
| --- | --- |
| Décor du village (illustration fixe) | `scripts/art/village.mjs` → `public/assets/village.svg` |
| Calque des lumières de nuit + sources | `public/assets/village-lights.svg`, `public/assets/lights.json` |
| Personnages jouables (14) | `public/js/art/characters.js` |
| Cartes de rôles + dos | `public/js/art/cards.js` |
| Plateau, pions, animations (mort, Chasseur) | `public/js/board/board.js` |
| Cycle jour / nuit | `public/js/board/daynight.js` |
| Narrateur, révélation de carte | `public/js/board/overlays.js` |
| Interface (HUD), lobby, chats | `public/js/app.js`, `public/style.css` |

* **Plateau** : repère fixe 1536×1024, mis à l'échelle (plateau entier sur
  ordinateur ; recadré sur la place en mobile portrait, interface au-dessus).
* **Cycle jour/nuit** (seule animation permanente du décor) : ciel en dégradé,
  soleil qui monte/descend, lune, étoiles, teinte chaude du coucher, obscurité
  percée autour du feu et des lanternes, fenêtres allumées. Seules des opacités
  et des translations sont animées (fluide sur mobile).
* **Pions** : placés en ellipse autour de la place, « moi » en bas ; nom au-dessus,
  indicateur de micro (autorisé / coupé selon les permissions serveur), halo doré
  pour qui a la parole, halo vert + onde sonore quand le micro capte une voix,
  mise en évidence locale (secrète) du vote, chute + tombe à la mort.
* **Chasseur** : le pion se relève, vise, tire ; projectile, éclair et « PAN ! ».
* **Cartes** : apparition → retournement (2D) → affichage → réduction vers
  l'emplacement de la carte dans l'interface.
* **Narrateur** : encadrés de narration BD (apparition → affichage → disparition),
  au-dessus du plateau sans masquer la place.
* **Chat des morts** : panneau qui monte depuis le bas, visible seulement si le
  serveur y donne accès.
* Polices auto-hébergées (Bangers, Nunito — licence OFL), décor compressé (gzip ≈ 80 Ko).

Régénérer le décor : `node scripts/art/village.mjs`.

## 11. Voix : deux modes

| Mode | Quand | Principe |
| --- | --- | --- |
| **Serveur audio LiveKit** (recommandé, indispensable vers 10-15 joueurs) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` définis | 1 seule connexion audio par joueur. À chaque phase, le serveur de jeu impose à LiveKit qui peut parler (`canPublish`) et qui peut entendre (`canSubscribe`) → canal des Loups inviolable, même avec un client modifié. |
| Pair-à-pair (secours) | variables absentes | chaque navigateur envoie sa voix aux autres ; voix mono ~24 kb/s, rien envoyé pendant les silences ; relais TURN optionnel (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` ou `ICE_SERVERS`). Correct jusqu'à ~8 joueurs. |

Mesures (15 navigateurs sur une même machine de test à 4 cœurs) : pair-à-pair
0/15 joueurs reliés ; LiveKit 15/15 reliés en 9 s, droits appliqués côté serveur
(nuit : seuls les loups parlent et s'entendent ; jour : seul l'orateur émet).

Mise en place LiveKit : compte LiveKit Cloud (offre gratuite pour tester) ou
serveur auto-hébergé (`livekit-server`, ports 7880 TCP, 7881 TCP, 7882 UDP + TLS).
Fichiers : `src/server/voiceSfu.ts`, `src/server/ice.ts`, `public/js/voiceSfu.js`,
`public/js/voice.js`, `public/js/voiceManager.js`.

## 12. Fin de partie, bruitages, étiquettes, loups automatiques

- **Retour automatique au lobby** : `endGame` entre en `GAME_OVER` avec un timer de
  `GAME_OVER_RETURN_MS` (5 s). À expiration, `returnToLobby` remet la partie en lobby avec
  le même code, les mêmes joueurs (sessions et jetons inchangés), le même Hôte et les mêmes
  réglages. La voix reste connectée pendant l'écran de victoire.
- **Bruitages** (`public/js/sfx.js`) : synthétisés en Web Audio, aucun fichier.
  Meute de loups déclenchée par le cycle jour/nuit au début du segment jour → coucher du
  soleil (`DayNight.onSegment` → événement `sfx` du plateau). Tir du Chasseur déclenché par
  `Board.hunterShot` à l'instant exact du flash, avant le projectile.
- **Étiquettes personnelles** : `state.tags[auteur][cible]`, modifiées par `player:tag`.
  La vue d'un joueur ne contient que `myTags` (les siennes) : celles des autres ne quittent
  jamais le serveur. Effacées au retour au lobby.
- **Nombre de loups automatique** (`settings.autoWolves`, activé par défaut) :
  5-8 joueurs → 2, 9-11 → 3, 12-18 → 4 (`wolvesFor`). Recalculé à chaque arrivée/départ
  et au lancement ; l'Hôte peut le désactiver pour régler les loups à la main.
- **Pancarte centrale** : dessinée dans le décor (`scripts/art/village.mjs`) au milieu de la
  place, dans la zone que les pions ne recouvrent jamais. Les lettres sont des tracés
  vectoriels (`scripts/art/sign-text.json`, générés par `scripts/art/sign-glyphs.mjs`) pour
  un rendu identique sur tous les appareils.

## 13. Décor fourni, personnages modernes, robustesse de la voix

- **Décor par défaut** : `public/assets/decor/blackops.*`, généré depuis
  `scripts/art/decor-src/blackops.png` par `scripts/art/decor.py` (ciel transparent →
  ciel animé derrière ; calque des lumières isolé pour la nuit ; enseignes illuminées via
  `--glow` ; place des joueurs via `--plaza`, arc libre devant l'enseigne via `--gap`,
  cadrage téléphone via `--mobile-width` / `--mobile-gap` / `--mobile-scale`).
  `?decor=village` réaffiche l'ancien village dessiné.
- **Téléphone** : la marge au-dessus du plateau prolonge la couleur du ciel
  (`--sky-top` / `--sky-mid` fournis par `DayNight`), le narrateur s'y affiche.
- **Personnages** (`public/js/art/characters.js`) : tenues modernes décrites par
  `top` / `bottom` / `acc` ; identifiants inchangés (choix des joueurs conservés).
- **Voix LiveKit** : micro publié une seule fois (coupé/ouvert selon le tour) ;
  `canSubscribe` retiré uniquement pendant la phase des Loups ; surveillance côté client
  toutes les 3 s (`#watch` : relance du micro, republication, réabonnement, relance du son,
  reconnexion unique à délais croissants) ; réessai serveur des mises à jour de droits ;
  écran maintenu allumé (Wake Lock) pendant le lobby et la partie.
