# Refonte La Meute — audit et validation

Date : 29 octobre 2026. Base : `4c1739150194d57f5d94c8b47e86a36e1c15b1e1`.
Dépôt vérifié : `falmonmickael260-commits/Leloupbo`.
Branche de production indiquée par GitHub et `render.yaml` : `claude/eloquent-clarke-3dot1j`.
Branche de travail : `codex/refonte-meute-audio-ui`. Aucun déploiement ni fusion effectué.

## Périmètre et conservation

L'architecture existante reste en place : moteur autoritaire TypeScript, Socket.IO, stockage JSON, profils, interface JavaScript, LiveKit et secours WebRTC. Aucune migration SQL, aucune réinitialisation de données, aucune modification des configurations Docker/Render/Railway ou des fichiers d'environnement.

Le manifeste `protected-assets.json` protège par SHA-256 les fonds et leurs calques, les cartes WebP, leur module de rendu et les sources/générateurs artistiques existants. Le test `assets.test.ts` vérifie leur contenu à chaque `npm test`. Les textes et pouvoirs des rôles n'ont pas été modifiés. Les 14 identifiants d'avatars historiques restent acceptés ; les 20 nouveaux sont ajoutés au catalogue sans modifier les identifiants des joueurs ou leurs choix sauvegardés.

Aucune valeur de secret n'a été requise, affichée ou ajoutée au dépôt. Les variables LiveKit n'étaient pas disponibles dans le serveur de validation local. La configuration de production n'a donc pas pu être contrôlée à distance.

## Bugs et audio corrigés

- Le secours mesh continuait d'utiliser une vue périmée après déconnexion du jeu : écoute et émission sont maintenant fermées, avec désactivation immédiate de la piste, puis restaurées uniquement après une vue actuelle.
- Des candidats ICE pouvaient arriver avant la description distante et être perdus : ils sont mis en attente ; les candidats liés à une offre ignorée sont écartés.
- Une piste distante reçue pouvait rester muette jusqu'à la prochaine mise à jour : les droits sont appliqués dès sa réception.
- Les reprises mesh en échec sont réessayées avec temporisation croissante, sans reprises concurrentes.
- Changer de périphérique mesh libère l'ancienne capture et applique les droits à la nouvelle, sans recréer les connexions.
- LiveKit : reprise de capture sérialisée, retour au périphérique par défaut après arrêt du micro, reconstruction de la jauge après remplacement de la piste, nettoyage des écouteurs et ressources à l'arrêt.
- Quitter puis revenir pendant la demande de permission pouvait réutiliser la tentative annulée et laisser la nouvelle session sans voix : la nouvelle connexion attend désormais la libération de l’ancienne capture puis redémarre. Le test reproduit l’échec avant correction et réussit après.
- Une connexion/capture achevée après avoir quitté pouvait réactiver l'audio : l'annulation est prise en compte et les captures tardives sont arrêtées.
- Un échec de téléchargement du SDK LiveKit restait mémorisé et empêchait les nouveaux essais : le chargement est désormais réessayable.
- L'état affiché ne confond plus permission de parler, piste publiée et transport connecté. La dernière parole reste possible pour le mort concerné. Un salon avec uniquement des bots n'affiche plus une panne d'envoi imaginaire.
- Un test du microphone et une jauge sont disponibles avant de rejoindre. Il ne publie, n'enregistre et ne transmet aucun son. Un sélecteur d'entrée audio est aussi disponible dans le lobby.
- Les diagnostics distinguent refus, appareil absent, appareil occupé et entrée indisponible. Le déblocage de lecture sur geste utilisateur existant reste conservé.
- Les configurations ICE vides ou aux URL malformées ne désactivent plus silencieusement STUN. Les configurations valides et leurs identifiants sont conservés sans réécriture.

### Contrôle LiveKit côté serveur

Les permissions de publication suivent désormais les orateurs du moteur, y compris les morts, dernières paroles, tours de parole et canaux des loups. Le client conserve sa capture locale (`stopLocalTrackOnUnpublish: false`) et la republie après restitution du droit, plutôt que de redemander le microphone à chaque phase.

Les jetons ne donnent initialement ni publication ni abonnement : rejouer un nouveau jeton ne restaure pas les droits d'une ancienne phase. Le contrôleur accorde ensuite les droits actuels, dans le lobby, pendant et après la partie. Il ferme les anciens droits avant d'ouvrir les nouveaux ; un échec de révocation bloque les nouvelles autorisations et déclenche un nouvel essai. Une session de jeu déconnectée n'a plus de droits audio. Les noms des salles restent liés au code de partie. La cohérence des autorisations est vérifiée chaque seconde ; les transitions déclenchent aussi un contrôle regroupé.

Cela repose sur la disponibilité de l'API d'administration LiveKit. Une coupure de cette API empêche le serveur de garantir une révocation distante immédiate : les clients honnêtes ferment leur piste dès la vue de phase, mais un essai réel de panne LiveKit reste requis avant déploiement. Le maillage conserve sa limite existante : les autorisations média sont appliquées dans les navigateurs ; un SFU est nécessaire pour imposer les règles au transport contre des clients modifiés. Aucun basculement silencieux SFU → mesh n'a été ajouté.

Références techniques vérifiées : [gestion des permissions LiveKit](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/), [SDK JavaScript](https://docs.livekit.io/reference/client-sdk-js/). Les événements et comportements de dépublication ont également été contrôlés dans le SDK installé par le fichier de verrouillage.

## Graphismes livrés

20 illustrations originales, semi-réalistes stylisées, détourées et réellement intégrées : forgeron, guérisseuse, chasseur, tavernière, garde, paysanne, bûcheron, herboriste, voyageur, noble, pêcheur, boulangère, mercenaire, couturière, érudit, marchande, berger, exploratrice, mineur et villageoise mystérieuse.

Fichiers : `public/assets/characters/v-*.png` ; catalogue : `public/js/art/villagers.js`. Création avec l'outil intégré `image_gen`, un appel distinct par personnage. Les descriptions et la direction commune sont consignées dans `character-prompts.json`. Les PNG ont été redimensionnés avec `sips`, en conservant leur canal alpha, à une hauteur maximale de 768 pixels. Les originaux générés restent dans la bibliothèque locale de génération.

Les illustrations n'interviennent jamais dans l'attribution des rôles. Apparition, respiration discrète, sélection, prise de parole et élimination utilisent les états existants du plateau. Améliorations des ombres, halos, plaques nominatives, grille de sélection, panneaux, chat, chronomètre, cibles tactiles et focus clavier. Les animations CSS et les transitions jour/nuit respectent la préférence de réduction des mouvements. Aucun fond ou carte n'est remplacé.

Aperçus issus du navigateur de validation :

- [Les 20 personnages](images/refonte-personnages.png)
- [Plateau avec 18 joueurs](images/refonte-plateau.png)
- [Plateau mobile 390 × 844](images/refonte-mobile.png)

## Matrice de non-régression

| Fonction | Vérification | Résultat |
| --- | --- | --- |
| Création, code privé, connexion, salons séparés | `server.test.ts`, test Chrome multisalons | OK |
| Distribution, tous les pouvoirs et règles | `rules.test.ts`, `simulation.test.ts`, `speech.test.ts` | OK |
| Jour/nuit, transitions, timers, victoire | Simulations complètes de 4 à 18 joueurs, 300 parties à 10 joueurs | OK |
| Votes, égalités, Capitaine, succession | Tests de règles, simulations | OK |
| Chat village, loups, morts | Tests de règles et serveur ; projections anti-fuite | OK |
| Parole autorisée, morts, dernière parole | Tests moteur, `voice-security.test.ts`, `voice-client.test.ts` | OK |
| Connexion, hôte, départ, abandon, reprise | Tests serveur et simulations ; coupure Chrome | OK |
| Sauvegarde, rechargement JSON, profils | `store.test.ts`, `profiles.test.ts`, simulations de reprise | OK |
| Anti-triche et confidentialité des vues | Tests serveur, 60 simulations instrumentées de 4 à 18 joueurs | OK |
| Permission refusée, ICE précoce, périphérique | Tests navigateur simulés et ICE | OK |
| SFU : publication, reconnexion, révocations, panne API simulée | Doubles de transport et d'API LiveKit | OK, serveur réel à vérifier |
| Audio mesh simultané | 3 contextes Chrome, médias synthétiques, RTP émis/reçu | OK |
| Coupure/rétablissement du transport de jeu | Chrome hors ligne + fermeture explicite du transport Socket.IO | OK |
| Interfaces ordinateur/mobile et images | Chrome 1440 × 1000 et 390 × 844 ; 18 joueurs | OK, aucune erreur JS/HTTP ni débordement horizontal |
| Fonds, sources et cartes intacts | SHA-256 sur tous les fichiers protégés | OK |
| 20 illustrations livrées | Catalogue unique, fichiers PNG RGBA portrait ≤ 768 px | OK |

## Commandes et preuves

- État initial : **102 tests réussis**.
- Validation finale : `npm test` → **117 réussis, 0 échec, 0 ignoré**.
- `npm run typecheck` → succès.
- `npm run simulate -- 18 20 901` → 20 parties terminées ; aucune phase bloquée.
- `node --check` sur les scripts audio, interface et scripts de validation → succès.
- `git diff --check` → succès.
- `npm start` avec `PORT=3107 DATA_DIR=/tmp/meute-validation-data` → démarrage et restauration de données de test ; page, scripts, images et connexions servis correctement. Aucun script de compilation distinct n'existe dans ce dépôt.
- Chrome : `browser-validation.json` et `voice-browser-validation.json` contiennent les résultats synthétiques, sans session ou jeton.

Les tests réseau et le lanceur `tsx` ont dû être exécutés hors du bac à sable, qui interdit leurs sockets/IPC locaux. Les échecs EPERM initiaux étaient liés à cette restriction.

Pour reproduire les tests visuels sans modifier les dépendances du projet :

```sh
npm install --prefix /tmp/meute-browser --no-package-lock playwright
PORT=3107 DATA_DIR=/tmp/meute-validation-data npm start
# Dans un autre terminal (Chrome installé sur macOS) :
PLAYWRIGHT_MODULE=/tmp/meute-browser/node_modules/playwright node scripts/validate-browser.cjs
PLAYWRIGHT_MODULE=/tmp/meute-browser/node_modules/playwright node scripts/validate-voice-browser.cjs
```

`CHROME_PATH` permet d'indiquer un autre exécutable ; `TEST_URL` permet de changer l'URL du serveur de test. Utiliser uniquement un serveur de validation : ces scripts créent des parties et des participants synthétiques. Les captures et résultats sont écrits dans `/tmp/meute-*`. Les tests du navigateur sont facultatifs et séparés de la suite Node ; Playwright n'est pas une nouvelle dépendance de production.

## Essais réels encore nécessaires avant fusion/déploiement

1. Avec la configuration LiveKit réelle existante : publication après révocation, retour du droit de parler, dernière parole, passage jour/loups/jour, reconnexion après redémarrage et interruption de l'API d'administration.
2. Safari iPhone/iPad et Chrome Android physiques : première autorisation, refus puis autorisation, lecture après toucher, écran verrouillé, appel entrant, casque Bluetooth/USB débranché et changement d'entrée pendant une piste non publiée.
3. Deux réseaux distincts, dont Wi-Fi/4G/5G en Suisse : vérifier les routes ICE et les octets RTP dans le diagnostic, puis les bascules Wi-Fi/mobile. Aucune cause géographique n'est établie par cet audit.
4. NAT restrictif : confirmer un relais TURN réellement sélectionné, y compris TURN/TLS sur 443. `ICE_SERVERS` ou `TURN_URLS`/`TURN_USERNAME`/`TURN_CREDENTIAL` configurent le mesh ; LiveKit fournit sa propre configuration ICE. Aucun relais fictif n'a été inventé.
5. Plusieurs personnes, puis 18 participants physiques : intelligibilité, écho, latence, consommation réseau et stabilité longue durée. Les bots et médias synthétiques ne valident pas la qualité acoustique.
6. Relecture artistique sur les appareils cibles : les anciens décors/cartes restent strictement identiques, les nouveaux avatars sont cosmétiques.

Aucun essai sur un appareil physique, un réseau suisse ou le serveur LiveKit de production n'est revendiqué dans ce rapport. La branche et la Pull Request permettent la revue sans toucher au jeu en production.
