# La Meute Noire — immersion premium, seconde passe

Base : `a89c98214e3c1ec011a97595d2a8e85b9cef2055`, version de production fusionnée après la première refonte. Branche de travail : `codex/immersion-premium-v2`.

Cette passe est livrée sur une branche et une Pull Request. Elle ne modifie ni les paramètres Railway/Render, ni les variables d'environnement, ni les secrets et ne déclenche pas volontairement de mise en production. Aucun achat d'asset ou de service n'a été effectué.

## 1. Bugs corrigés

- **Mauvaise cible du tir en cas de morts en chaîne.** L'interface cherchait le premier nouveau mort dans l'ordre des sièges. Si un amoureux d'un siège précédent mourait de chagrin, le projectile pouvait viser cet amoureux au lieu de la cible. Le serveur ajoute maintenant à l'annonce publique du tir un événement facultatif contenant uniquement l'identité déjà publique du tireur et la cible annoncée. Les règles, textes et décisions restent identiques. Le test construit précisément ce cas et démontre l'erreur de l'ancienne heuristique.
- **Enregistrements non réessayés après une erreur individuelle de réseau/décodage.** Le préchargement mémorisait des entrées vides et pouvait conserver le son synthétique indéfiniment. Les fichiers ratés sont réessayables, avec temporisation et une seule requête de chargement en cours.
- **Capture mobile encore « live » mais muette.** Le watchdog LiveKit ne traitait que les pistes terminées. Il observe désormais les pistes réellement muettes sur plusieurs passages avant de reprendre la capture, avec au plus un essai toutes les 15 secondes et aucune boucle de demandes de permission refusée. Test reproduit avant correction puis réussi après.
- **État visuel perdu au redimensionnement ou rechargement du décor.** Les mises à jour du plateau réutilisent maintenant la sélection, la pose et les états audio précédents.
- **État jour/nuit incohérent après une transition instantanée/reconnexion.** `snap()` actualise aussi `data-sky`, utilisé par les styles lumineux. La préférence locale de mouvements réduits est respectée par les transitions JavaScript, en plus de la préférence système.
- **Icône de micro trompeuse sur le plateau.** L'état local tient compte de l'émission effective, des permissions et de la coupure volontaire ; la dernière parole d'un mort n'est plus exclue par un test visuel sur sa survie. Une modification audio rafraîchit immédiatement le pion.
- **Volumes et petits écrans.** Le volume des voix est réglable dès le lobby, avec une explication quand il est à zéro. Le menu est borné et organisé verticalement. Sur téléphone paysage, le panneau d'action et la fiche du joueur occupent des zones séparées ; les titres des petits téléphones sont adaptés.

## 2. Micros et confidentialité

La connexion LiveKit, les droits serveur, les salons privés, le fallback mesh, les diagnostics, le test local du micro et les reprises de la première passe restent conservés. Aucun serveur TURN fictif ni aucune valeur de clé ne sont ajoutés.

Le volume des voix agit uniquement sur les éléments de lecture autorisés. Il ne modifie ni la publication du micro, ni `canSpeak`, ni les listes d'écoute. Un test vérifie explicitement qu'abaisser la réception à zéro ne coupe pas l'émission. Le mixage des sons décoratifs est séparé de la voix et baisse automatiquement lorsque des voix autorisées sont détectées.

Les effets de mort nocturne ne distinguent pas loups, poison ou autre cause secrète. Les effets de potion sont visibles uniquement par la Sorcière concernée à partir de sa propre vue ; aucun nouvel événement public ne révèle sa cible ou sa consommation de potion. L'événement public du Chasseur est émis seulement après un tir déjà annoncé à tous.

## 3. Visuel et personnages

Les **20 personnages premium existants sont conservés et améliorés dans leur présentation** : éclairage de nuit moins écrasé, halos de parole et de choix, transitions d'élimination, et accessoire de fusil pendant la pose publique du Chasseur. Les 14 identifiants historiques restent compatibles. Aucun nouvel avatar de village n'est ajouté dans cette seconde passe ; aucune apparence ne détermine un rôle.

Le HUD et les annonces emploient une typographie plus calme et lisible. Les nombres du chronomètre sont alignés. Le menu de mixage et les contrôles du lobby sont harmonisés. Les dessins et textes des cartes ne sont pas retouchés.

## 4. Fantômes

Les anciens fantômes SVG simplifiés et leur trajet mécanique à travers l'écran sont retirés. Trois vraies illustrations RGBA sont ajoutées : **le Voile, le Pèlerin et la Sentinelle**.

Elles sont créées avec l'outil intégré `image_gen`, un appel par illustration. Prompts exacts et chemins : `specter-prompts.json`. Les originaux restent dans la bibliothèque locale ; seuls les nouveaux fichiers sont redimensionnés avec `sips` à 512 pixels de haut pour le jeu.

Les apparitions sont indépendantes des personnages morts et des rôles. Elles restent près du décor, dérivent lentement, lévitent et s'évanouissent, avec au plus deux apparitions simultanées. Elles existent la nuit toute l'année, séparément de l'habillage Halloween conservé. Les animations sont arrêtées lorsque l'onglet est caché et supprimées en mode mouvements réduits. Les promesses d'animation annulées sont traitées. Un souffle discret accompagne l'apparition si l'ambiance est activée.

## 5. Morts, votes, Chasseur et potions

- **Nuit :** voile sombre, souffle et lumière froide autour de la victime, particules ascendantes, disparition partielle vers l'état de spectateur. Les anciennes griffures sanglantes sont remplacées par des traces spectrales sans gouttes.
- **Vote :** pulsation sonore discrète à l'ouverture, sélection douce et effet de verdict ambré à l'élimination.
- **Chasseur :** manipulation enregistrée, temps de visée, accessoire visible sur les avatars illustrés, flash local synchronisé avec le son, recul, trace brève, fumée et impact sur la cible exacte. Le plateau et la caméra ne tremblent pas. Les effets sont invalidés lorsque la scène est remplacée.
- **Potions :** lumière verte pour le soin, violette pour la potion de mort, uniquement chez la Sorcière. Les autres joueurs ne reçoivent aucun indice supplémentaire.
- **Fin de partie :** courte cadence différente selon victoire ou défaite, sur le bus d'effets réglable.

Les effets sont décoratifs et ne retardent aucune transition serveur. Le mode réduit conserve les informations, avec des retours plus brefs et moins de mouvement.

## 6. Nouveau son de fusil

`public/assets/sfx/fusil.mp3` provient d'un **enregistrement réel** de The Free Firearm Sound Library, par Ben Jaszczak, Brian Nelson, Kevin Heras et Matthew Nanney, distribué sous CC0. La manipulation `recharge.mp3`, également CC0, provient de SpringySpringo.

Provenance, liens et adaptations : [CREDITS.md](../public/assets/sfx/CREDITS.md). Sources : [Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) et [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds). Les copies préparées proviennent d'OpenSpades Free Pak, dont la notice identifie chaque fichier source et sa licence.

Contrôle avec FFmpeg après transcodage MP3 : fusil ≈ 1,51 s, pic **−8,8 dBFS** ; manipulation ≈ 0,40 s, pic **−9,8 dBFS**. Le départ du tir est conservé sans silence initial ajouté. Le contexte décode les fichiers avant le tir ; un test Chrome vérifie que le fichier enregistré est utilisé après une panne de téléchargement simulée et que le flash existe au déclenchement du son.

Les autres sons restent synthétisés et ne sont pas présentés comme des enregistrements réels. Une écoute humaine sur les appareils cibles reste nécessaire pour juger le timbre et le confort subjectifs.

## 7. Décor et identité

Les fonds existants restent les mêmes. Seules des couches d'intégration sont ajoutées : brume légère à deux profondeurs, seize petites particules, lune et soleil adoucis, lumière des personnages et apparitions.

Une **enseigne en bois « La Meute Noire »**, avec fixations et griffe rouge, est superposée à la façade Blackops. La griffe devient lumineuse la nuit, avec un halo et une respiration lente. La griffe au sol et ses images existantes sont conservées. La Clairière garde sa cascade dégagée : l'enseigne de façade n'est pas ajoutée sur cette carte forestière.

## 8. Sound design et réglages

Oiseaux et air léger le jour, vent et sons lointains la nuit, apparition spectrale, ouverture du vote et cadence de fin. Les événements décoratifs ne révèlent aucun rôle.

Trois volumes persistants sont disponibles : **voix, ambiance et effets**. Les effets et ambiances utilisent des bus séparés, avec compression et baisse automatique pendant la parole, puis retour progressif. Les réverbérations d'ambiance suivent également leur propre volume. Aucune nouvelle piste musicale continue n'est ajoutée.

## 9. Conservation et matrice de non-régression

Les empreintes SHA-256 de `protected-assets.json` sont vérifiées par `npm test`. Tous les fonds, leurs calques, les sources artistiques, les cartes et leur module sont inchangés. Aucune modification de schéma, de stockage, de clé ou de configuration de déploiement. Le seul ajout protocolaire est un champ facultatif d'annonce publique, compatible avec les sauvegardes existantes.

| Fonction | Couverture | Résultat |
| --- | --- | --- |
| Création, codes, connexion, isolation des salons | Tests serveur et Chrome multisalons | OK |
| Rôles, pouvoirs, votes, Capitaine, hôte | Suite de règles et simulations | OK |
| Phases, timers, victoire, abandon | Simulations de 4 à 18 joueurs ; 300 parties à 10 ; 30 supplémentaires à 18 | OK |
| Chat village/loups/morts et anti-fuite | Tests moteur, serveur et projections | OK |
| Sauvegarde/reprise, profils | Tests de stockage, profils et simulations JSON | OK |
| Permissions et reprise SFU, pistes muettes | Doubles LiveKit, erreurs et transitions simulées | OK |
| Audio simultané, muet volontaire, coupure/rétablissement | 3 navigateurs Chrome, RTP bidirectionnel, salon séparé | OK |
| Tir et morts en chaîne | Cas moteur précis et contrôle VFX dans Chrome | OK |
| Son enregistré, erreur réseau et synchro | Décodage Chrome, téléchargement raté puis réessai ; flash au tir | OK |
| Mouvements réduits et ressources temporaires | Fantômes supprimés, VFX nettoyés dans Chrome | OK |
| Responsive | 1440×1000, 390×844, 320×568, 844×390, 768×1024 | OK ; aucun débordement horizontal |
| Fonds et cartes | Manifeste SHA-256 | Inchangés |

## 10. Commandes et preuves

- `npm test` : **123 réussis, 0 échec, 0 ignoré**.
- `npm run typecheck` : succès.
- `npm run simulate -- 18 30 1301` : **30 parties terminées**, aucune phase bloquée.
- `node --check` sur les scripts modifiés et scripts de validation : succès.
- `git diff --check` : succès.
- `npm start` sur le port 3107 avec données isolées dans `/tmp/meute-premium-data` : démarrage réussi. Aucun script `build` distinct n'existe dans ce dépôt.
- Les dépendances et le fichier de verrouillage ne changent pas ; aucune installation de production supplémentaire n'est nécessaire.

Les tests ouvrant des sockets/IPC et Chrome ont utilisé les autorisations système disponibles. Les médias des tests sont synthétiques. Aucun essai sur le réseau d'un joueur ou sur un appareil physique n'est revendiqué.

Résultats détaillés : `premium-browser-validation.json`, `premium-voice-validation.json`, `premium-responsive-validation.json` et `premium-gameplay-validation.json`.

Reproduction, sur un serveur **de test uniquement** :

```sh
PORT=3107 DATA_DIR=/tmp/meute-premium-data npm start
# Autre terminal ; Playwright disponible dans /tmp comme pour la première passe :
PLAYWRIGHT_MODULE=/tmp/meute-browser/node_modules/playwright node scripts/validate-browser.cjs
PLAYWRIGHT_MODULE=/tmp/meute-browser/node_modules/playwright node scripts/validate-voice-browser.cjs
PLAYWRIGHT_MODULE=/tmp/meute-browser/node_modules/playwright node scripts/validate-premium.cjs
```

Les scripts créent des salons de validation et les captures sont enregistrées dans `/tmp/meute-*`. `TEST_URL` et `CHROME_PATH` permettent d'adapter l'environnement. Les aperçus contrôlés de VFX du dernier script sont des tests du rendu, pas des reconstitutions prétendument enregistrées d'une partie réelle.

## 11. Limitations et essais restants

- Safari/iPhone/iPad et Android physiques : interruption par appel, reprise, casque Bluetooth, permission refusée puis autorisée, volume des médias et déblocage de lecture.
- Réseaux suisses Wi-Fi/4G/5G et NAT restrictifs : sélectionner réellement une route TURN/TLS, changer de réseau et mesurer la stabilité. Aucune cause liée au pays n'est établie.
- LiveKit de production : refaire les transitions et reprises avec cette nouvelle branche avant/après son éventuel déploiement. Les essais réels de la première passe ne valent pas certification de cette seconde version non déployée.
- Dix-huit personnes physiques et écoute subjective : la simulation et les médias synthétiques ne certifient pas l'intelligibilité, l'écho, le confort sonore ou la fluidité sur un téléphone ancien.
- Le fallback mesh conserve ses limites existantes vis-à-vis des navigateurs modifiés ; le contrôle du transport et des publications reste assuré par LiveKit lorsqu'il est configuré.

Les fichiers de fond et cartes ne changent pas. Le résultat est livré pour revue sur la branche de travail ; le site actif est préservé pendant cette passe.

## 12. Aperçus livrés

- [Plateau et enseigne](images/premium-v2-village.png)
- [Trois illustrations de fantômes](images/premium-v2-fantomes.png)
- [Élimination nocturne dans une partie locale](images/premium-v2-elimination.png)
- [Téléphone](images/premium-v2-mobile.png)
- [Téléphone paysage](images/premium-v2-paysage.png)
- [Menu de mixage — aperçu contrôlé du rendu](images/premium-v2-mixage.png)
