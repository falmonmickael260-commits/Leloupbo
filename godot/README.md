# La Meute Noire — décor Godot intégré

Godot 4.6.3 Standard, rendu Compatibility, export Web sans threads.

Le client Web existant reste responsable des personnages d’origine, commandes,
micros, votes, rôles, chats, profils, achats et reconnexions. Godot affiche
uniquement le décor et les effets de lumière derrière cette interface.
Le serveur Node.js existant reste autoritaire.

Le village comprend les illustrations de jour, coucher du soleil et nuit,
l’inscription LA MEUTE NOIRE et les griffes éclairées dans les pavés.
Le cycle visuel suit les valeurs du client sans changer les phases serveur.
Le rendu démarre en partie ; les illustrations servent de repli si le moteur
ne démarre pas. La carte Clairière conserve son affichage existant.

Les personnages articulés expérimentaux restent dans les scènes de galerie,
mais sont désactivés dans le village et exclus de l’export Web.

## Exécuter

Depuis la racine du dépôt :

```sh
npm ci
npm start
```

Les fichiers exportés dans `public/godot/` sont servis par Node.js.
Godot n’est pas nécessaire sur Railway pour servir cet export.

## Reconstruire le décor

Installer Godot 4.6.3 et ses modèles d’export Web, puis :

```sh
godot --headless --path godot --editor --import
godot --headless --path godot --script res://scripts/smoke_test.gd
godot --headless --path godot --export-release 'Web Backdrop'
```

La scène native de démonstration est `scenes/village.tscn` ; l’export utilise
`scenes/live_backdrop.tscn`. Les messages du pont Web ne contiennent que
les positions, apparences publiques, état de survie et valeurs d’éclairage.

## Vérifications et limites

Les tests automatisés couvrent notamment les régressions de capture micro,
les changements asynchrones de permissions, la récupération SFU après un
refus initial, la trajectoire des réactions et le calcul du cycle visuel.

Le test navigateur vérifie la création du salon, huit joueurs et le démarrage
d’une partie avec Godot actif, sans erreur JavaScript. La version intègre
également les invitations et le portefeuille de la branche précédemment déployée.
Les appareils mobiles physiques et un serveur LiveKit réel restent à vérifier.
Cette branche de travail ne constitue pas une validation de mise en production.

## Résolution du décor Web

Le canevas doit suivre les dimensions de son cadre (`canvas_resize_policy=2`).
La valeur 0 conserve la taille HTML par défaut de 300 × 150 pixels, ensuite
étirée à 1536 × 864 : elle provoque une forte pixellisation au démarrage de
Godot. Vérifier les dimensions internes du canevas à DPR 1 et 2 après export.
