# Prompt Claude Code — Accueil/Galaxie · Slice B : refonte de l'Accueil (frontend Massimo)

```
Chantier : Accueil & Galaxie — Slice B (addendum ADR-0024 du 2026-07-31).
Branche : feat/accueil-galaxy (étape 2 — la slice A est COMMITTÉE SUR CETTE BRANCHE,
/galaxy existe déjà. Rien n'est encore mergé dans main : la PR se fait à la fin du
chantier, slices A et B ensemble).
Mono-chantier : cette session ne touche QUE la page Accueil de Massimo et l'écran
d'ensemble de /galaxy. Hors de ça, tu t'arrêtes.

Décisions déjà tranchées (ne les rouvre pas) :
- Le canvas 3D et la frise de progression QUITTENT l'Accueil. C'est une révocation
  assumée de l'amendement du 2026-07-28, pas un oubli à corriger.
- L'Accueil ne charge plus Three.js, ni directement ni transitivement.
- Une seule action accentuée sur la page : « Commencer ».
- Zéro travail backend : toutes les routes utilisées existent déjà.

Frontière non négociable : présentation client. Aucun calcul métier n'entre dans la
page — pas de grille de semaine construite côté client, pas de date calculée, pas de
phrase de secours composée localement.

Préconditions (déjà vraies — ne les recrée pas) : branche existante, slice A committée
dessus, documents committés (addendum, page-accueil.md réécrite, mockup).

Déroulé imposé :
1. `graphify update .` en premier.
2. Read-before-code STRICT : lis TOUTE la liste ci-dessous avant d'écrire une ligne.
   Ne suppose aucune signature de contrat API — vérifie dans le code réel.
3. Stop-on-blocker : toute divergence réelle avec la spec → tu T'ARRÊTES, tu signales,
   tu proposes l'ajustement minimal. Tu ne codes pas autour.
4. À la fin : checklist standard 9 points.
```

## Read-before-code

Documents :

- `docs/frontend-massimo/page-accueil.md` — **la spec de cette slice**, réécrite le 2026-07-31.
  Elle prime sur tout ce que tu trouveras dans le code actuel de la page.
- `docs/frontend-massimo/mockup/mockup-page-accueil-v2.html` — composition de référence de l'Accueil. Le
  sélecteur en tête bascule deux variantes : **« Galaxie en colonne » est celle retenue**.
- `docs/frontend-massimo/mockup/mockup-page-galaxy-v1.html` — composition de référence de `/galaxy`
  après migration (§4) : galaxie complète en vue par défaut, constellation + panneau, et l'écran
  d'attente / repli.
- `docs/decisions/adr-0024-*` — §5 (doctrine) et l'addendum en fin de fichier, §B et §C.

Code :

- La page Accueil actuelle, dans son intégralité — c'est elle que tu recomposes.
- `graphify explain "galaxy overview"` — le contrat réel de `GET /api/student/galaxy/overview`.
  ⚠️ **Vérifie ce qu'elle renvoie exactement** : la spec suppose qu'elle porte un compte
  d'étoiles allumées et la liste des matières. Si ce n'est pas le cas, **arrête-toi**.
- `packages/ui/src/galaxy/` — le baril **et** le sous-chemin `/canvas`. Tu dois comprendre
  pourquoi ils sont séparés avant de toucher aux imports.
- L'écran d'ensemble de la page `/galaxy` (planètes CSS) — c'est là que la bascule du §C atterrit.
- `subjectIconFor` et les pictogrammes de matière partagés.
- Les tests existants de l'Accueil, **avant** de modifier la page.

## À faire

### 1. Retirer

- Le `GalaxyCanvas` et la frise de progression de l'Accueil.
- La grille des 8 matières (doublon de l'entrée sidebar « Matières »).
- Toute répétition du niveau et de l'XP : le bandeau global (`MassimoBannerHeader`) est
  le **seul** endroit où ils s'affichent.
- Tout affichage de `total_due`.

### 2. Recomposer (cinq blocs, dans cet ordre)

1. **Salutation + message ZETIS** — `title`/`subtitle` rendus **VERBATIM**. Si l'appel échoue,
   la carte n'est pas rendue : **aucune phrase de secours**, aucun bandeau motivationnel
   générique ajouté à côté.
2. **Mission du jour** — carte héro, raison servie par le serveur, **unique bouton plein**
   « Commencer ». `elected: null` → voir §États de la spec ; la page reste alors **sans aucune
   action accentuée**, et ce n'est pas un défaut à compenser.
3. **Ma semaine** + **Ma Galaxie**, côte à côte (colonne gauche 1.15fr / droite 1fr).
4. **Trois raccourcis** — Révision éclair (`flash_size`, **jamais** `total_due`), Capsule, ELI5.
   Un raccourci sans contenu disponible **n'est pas rendu** ; la ligne se resserre. Pas de carte
   grisée sur cette page.
5. **Slot du héros ZETIS** — sa place est structurée, le bloc est **NON RENDU** dans cette slice.
   Le Groupe 1 (ADR-0026) le remplira. Ne fabrique pas de bouton qui n'ouvre rien : une porte
   vers du vide est pire que pas de porte.
   ⚠️ **C'est un point de conception, pas un détail** : c'est ce slot qui permet au Groupe 1 de
   brancher le chat **sans rouvrir la composition de la page**. Si tu es tenté de « simplifier »
   en supprimant l'emplacement, tu casses cette propriété — arrête-toi et signale.

### 3. Carte « Ma Galaxie »

Contrat **fermé** (addendum §B) : un **compte** d'étoiles allumées, des pastilles de matières en
**CSS pur** (`subjectIconFor`, **jamais d'emoji**), la carte entière cliquable vers `/galaxy`.

Interdits, hérités de l'ADR-0024 §5 : aucun pourcentage, aucun classement de matières, aucune
couleur d'échec, aucune notion nommée comme manquante, aucun `mastery_score`.

**Contrainte technique ferme : zéro import de `@zetis/ui/galaxy/canvas`** depuis cette page,
direct ou transitif. Le sous-chemin existe précisément pour rendre cette frontière vérifiable au
build — 3,6 Mo avaient été mesurés en juillet quand le canvas passait par le baril.

### 4. Migrer le graphe global vers `/galaxy`, en vue par défaut

La brique du 2026-07-28 (graphe global deux colonnes + badges de matières cliquables + frise de
progression) **n'est pas supprimée : elle change d'adresse.** Tu la déplaces, tu ne la réécris pas.

- `/galaxy` s'ouvre désormais sur la **galaxie complète, toutes matières**
  (`GET /api/student/galaxy/all`). Le plafond adaptatif s'applique **tel quel** — replie sur
  matières + chapitres quand il mord ; les notions restent atteignables en entrant dans une
  constellation. **Ne le modifie pas**, c'est une dette ouverte de l'ADR-0024 §6.
- Clic sur une matière → sa constellation. Comportement inchangé.
- **Les planètes CSS cessent d'être un écran** : elles deviennent l'**état d'attente** pendant le
  chargement du chunk 3D et le **repli sans WebGL**. Elles ne disparaissent pas du code.
- La frise de progression suit le graphe.

⚠️ Si la brique de l'Accueil s'avère trop couplée à sa page pour être déplacée telle quelle,
**arrête-toi et signale** — ne la réécris pas de zéro sans arbitrage.

### 5. Or, mouvement, tactile

- **Aucun or `#ffcf47` sur l'Accueil** : le token est réservé à l'état « ZETIS parle », et sur
  cette page ZETIS ne parle pas.
- `prefers-reduced-motion` respecté sur tout ce qui bouge (scintillement des étoiles de la carte,
  survol des raccourcis).
- Cibles de touche ≥ 44 px ; **rien d'essentiel ne dépend du survol** — Massimo travaille sur
  iPhone et iPad autant que sur MacBook.

## Tests

- **Budget de bundle sur la page d'entrée** : Three.js n'y est plus. Sans ce test, la régression
  reviendra sans bruit. C'est le test le plus important de la slice.
- L'Accueil affiche `flash_size` et **jamais** `total_due`.
- Invariant « Ma semaine » : un jour passé sans activité et un jour à venir rendent le **même**
  markup. Ce test **existe déjà** — vérifie qu'il passe encore, ne le réécris pas.
- Une seule action accentuée dans le DOM de la page.
- État `elected: null` : pas de bouton plein, et aucun autre bloc n'en gagne un.
- Galaxie à 0 étoile : la carte s'affiche avec son compte à zéro et sa phrase d'invitation —
  **ce n'est pas un état vide**, pas d'`EmptyState`, pas de message d'erreur.

**Aucun test existant ne doit être modifié pour passer.** Un test qu'on assouplit est une
régression masquée : arrête-toi et signale.

## Hors périmètre (clôture)

- Le **contenu** de la Galaxy (graphe, panneau d'actions, KPI d'états, recherche, plein écran) :
  seule la migration du §4 est concernée — un **déplacement**, pas une refonte.
- Le plafond adaptatif `GALAXY_MAX_NODES` et sa validation sur les trois appareils — dette de
  l'ADR-0024 §6, pas de cette slice.
- Le chat et son héros (Groupe 1).
- La sidebar et le bandeau XP — chrome global, traités en slice A.
- `navigation.md`, non réconcilié : il décrit un Accueil **sans sidebar**. **L'existant prime.**
  Ne t'en sers pas comme autorité et ne le corrige pas.

## Documentation, avant le commit

- `MEMORY.md` § Reprise : fait / décisions actives / prochain pas.
- `TROUBLESHOOTING.md` : tout écart réel — en particulier si le contrat de
  `galaxy/overview` ne correspondait pas à la spec, ou si un import transitif de Three.js
  s'est révélé difficile à couper.
- `CHANGELOG.md` : **maintenant oui**, la slice B clôt le chantier.
- `ARCHITECTURE.md` : seulement si une structure a été ajoutée. Ce n'est a priori pas le cas.
- Ne touche ni `ROADMAP`, ni `CLAUDE.md`.
