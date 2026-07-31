# Page Massimo — Accueil

> **Réécrite le 2026-07-31** (addendum ADR-0024 du même jour). Deux dettes réglées au passage :
> le wireframe décrivait encore la composition de juin 2026, et la version précédente **n'a
> jamais documenté l'aperçu Galaxy 3D livré le 2026-07-28** — la spec était en retard sur le code
> avant même ce chantier.
>
> **Complétée le 2026-07-31** par l'addendum « **Accueil vivant** »
> (`adr-0024-addendum-accueil-vivant.md`) : la page recomposée le matin était calme mais **pauvre**
> — hors la mission du jour, Massimo n'y lisait qu'une semaine de sept cases. S'ajoutent
> **« Mon ciel »**, **« Mon chemin »** (la frise, qui revient) et **« Tes derniers gains »**.
> Maquette : `mockup/mockup-page-accueil-v3.html`.

## Objectif

Donner à Massimo un point d'entrée simple : quoi faire maintenant, pourquoi, et où il en est.
La page doit peindre vite et rester calme : c'est la page la plus visitée et la première au
réveil de l'app.

**Calme ne veut pas dire nue.** Ce qui doit rester rare, c'est l'**action** — une seule accentuée.
Ce qui se **regarde** peut être riche : le chemin parcouru n'appelle aucun geste, il ne se
dispute donc pas avec « Commencer ».

## Wireframe

```txt
┌──────────────┬───────────────────────────────────────────────────────┐
│ Sidebar      │ Bandeau XP · Niveau 18 · barre → /galaxy              │
│ (globale)    ├───────────────────────────────────────────────────────┤
│ Accueil ◀    │ 🙂  Salut Massimo 👋                                   │
│ Matières     │     « message ZETIS, servi et rendu verbatim »        │
│ Cours        │ ┌───────────────────────────────────────────────────┐ │
│ Agenda       │ │ MON AGENDA          (ADR-0025)            Voir → │ │
│ Révision     │ └───────────────────────────────────────────────────┘ │
│ Fiches       │ ┌───────────────────────────────────────────────────┐ │
│              │ │ MISSION DU JOUR                                   │ │
│ ELI5         │ │ Français — Les temps du récit                     │ │
│ Capsules IA  │ │ « parce que cette notion revient bientôt »        │ │
│ Missions     │ │ [Français] [15 min] [+60 XP]      ▓ Commencer ▓   │ │
│ Quiz         │ └───────────────────────────────────────────────────┘ │
│ Ma Galaxie   │ ┌────────────────────────┬──────────────────────────┐ │
│ Mindmaps     │ │ MA SEMAINE             │ MA GALAXIE               │ │
│ Chat ZETIS   │ │ ● ● ● ○ ○ ○ ○          │ 47 étoiles allumées      │ │
│ Paramètres   │ │ 3 jours cette semaine  │ ○ ○ ○ ○  (matières, CSS) │ │
│              │ │ engagement : 1…7       │ Ouvrir ma galaxie →      │ │
│              │ └────────────────────────┴──────────────────────────┘ │
│              │ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│              │ │ Révision │ │ Capsule  │ │ ELI5     │               │
│              │ │ éclair·5 │ │ SVT·4min │ │          │               │
│              │ └──────────┘ └──────────┘ └──────────┘               │
│              │ ┌───────────────────────────────────────────────────┐ │
│              │ │ ∿∿∿  Je suis ZETIS      [ Discuter avec ZETIS ]   │ │
│              │ │ ↑ SLOT — structuré, non rendu avant le Groupe 1   │ │
│              │ └───────────────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────────────┘
```

Cinq blocs sous le bandeau, **plus le bandeau Agenda**. **Une seule action accentuée sur la
page** : « Commencer ». Maquette de référence :
`docs/frontend-massimo/mockup/mockup-page-accueil-v2.html`.

> **Bandeau Agenda — ajouté à cette spec le 2026-07-31, au read-before-code.** Il était **déjà
> dans le code** (ADR-0025) et absent de cette spec comme de la maquette v2 : la même dette que
> celle réglée plus haut, à trois lignes d'intervalle. Il est **conservé**, et c'est la spec qui
> est corrigée — en phase 0, `HomeAgendaBanner` est le seul endroit où Massimo **voit** ce qui
> vient du collège sans y aller. Le retirer « pour coller à la maquette » aurait été une
> régression fonctionnelle silencieuse.

## Sections

### Bandeau XP (global, `MassimoBannerHeader`)

Monté dans `MassimoLayout`, présent sur toutes les pages — il n'appartient pas à cette spec.
Un seul point la concerne : il est **cliquable vers `/galaxy`** (et non plus `/progression`,
addendum ADR-0024 §A).

Le niveau et l'XP ne sont affichés **qu'ici**. La composition précédente les répétait dans une
carte de profil et dans deux KPI : trois emplacements pour une même donnée.

### Salutation + message ZETIS

Message court, bienveillant, contextualisé — **composé SERVEUR et déterministe** (aucun LLM,
aucun aléa : deux affichages sur le même état donnent la même phrase). Le client rend `title` et
`subtitle` VERBATIM ; le `code` sert à choisir une illustration, jamais à réinterpréter le texte.

Dix codes, premier applicable : `first_visit`, `back_after_break`, `back_short_break`,
`no_goal_yet`, `goal_reached_today`, `goal_reached`, `progress_visible`, `resume_notion`,
`reviews_due`, `all_clear`. L'ordre porte une intention : ce qui est humain (te revoir) passe
avant tout compteur, et l'invitation à s'engager avant la félicitation.

**Le nombre de jours d'absence n'est JAMAIS affiché.** Il existe dans le contexte pour choisir une
illustration. Si l'appel échoue, la carte n'est pas rendue — **aucune phrase de secours** : une
phrase fabriquée côté client serait le mensonge que cette page a précisément cessé d'afficher.

**Aucun bandeau motivationnel générique** ne peut être ajouté à côté (« garde le cap »,
« chaque jour est une opportunité ») : ce serait exactement la phrase fabriquée que le contrat
serveur interdit, et « garde le cap » est en outre une relance.

### Mission du jour

Carte héro, seul chemin guidé de la page :

- titre, matière, durée estimée, XP ;
- la **raison** servie par le serveur, jamais recomposée (« parce que cette notion revient
  bientôt ») ;
- un unique bouton plein : **« Commencer »**.

`elected: null` = état serein, voir §États.

### Ma semaine (régularité + engagement)

Sept cases, une par jour de la semaine courante, servies par le serveur — le client ne construit
aucune grille et ne calcule aucune date.

- **Un jour passé sans activité et un jour à venir sont rendus À L'IDENTIQUE.** Aucun signe ne
  distingue « pas venu » de « pas encore » : sinon la grille désignerait les jours manqués. C'est
  un invariant testé, pas une intention.
- `days_done` est un compte qui ne fait que monter ; le lundi il repart de zéro avec 7 cases
  vides — un départ, pas une chute. Jamais de pourcentage, jamais de « il te reste N ».
- **L'engagement est choisi par Massimo**, dans la même carte : 7 pastilles, un tap suffit. Les
  7 valeurs restent toujours actives — réviser à la baisse se fait comme réviser à la hausse,
  sans confirmation ni rappel de l'ancienne valeur.
- Rien n'est affiché quand l'objectif n'est pas atteint : le contrat serveur ne porte aucune
  donnée de manque.
- **Aucune série (« streak »)**, sous aucune forme (ADR-0024 §5). Une flamme et un compteur de
  jours consécutifs sont un capital perdable : ils font venir par peur de perdre.

### Mon ciel (la heatmap retournée)

Ajouté le 2026-07-31 (addendum « Accueil vivant » §B). **Une case par jour où Massimo a gagné du
XP, posée sur un calendrier** — semaines en colonnes, jours en lignes. Rien d'autre n'est dessiné.

- **Aucune case vide n'est dessinée** : pas de carré gris, pas de bordure, **aucun élément dans le
  DOM** pour un jour sans gain. Les cases sont placées en `grid-column`/`grid-row` explicites, donc
  la grille n'a jamais besoin de remplissage. C'est ce qui la sépare d'une heatmap — chez Papa, la
  case grise **est** l'information d'absence, et elle y est légitime (c'est du pilotage).
- **Assumé** : sur un calendrier, l'œil perçoit les intervalles par la **position**, même sans case
  dessinée. C'est le prix du repère temporel, payé en connaissance de cause. Ce que `CLAUDE.md`
  interdit — un **décompte**, une iconographie du vide — reste absent.
- La grille commence **au premier jour d'activité**, jamais avant l'histoire de l'élève.
- Libellés de mois au changement de mois, **et seulement si la place le permet** (deux mois à une
  colonne d'écart se chevauchent — constaté).
- Intensité ∝ XP du jour, rampe indigo → cyan → blanc (ADR-0024 §5). **Aucun rouge.**
- Légende = un **compte qui ne peut que monter** : « 6 jours d'apprentissage ».
- `prefers-reduced-motion` coupe le scintillement.

> **Historique** : la première version posait les jours en **constellation libre**, sans repère
> temporel. Ce qui manquait n'était pas la densité mais le **repère de temps** — d'où le passage
> au calendrier, l'interdit étant reporté de la géométrie vers le **rendu**.

**Ce que la carte n'affichera jamais** : une date lisible, un « depuis N jours », une moyenne, un
objectif de jours, une comparaison entre deux périodes, un fond quadrillé.

**Une action secondaire** : « Revoir ma galaxie grandir → » ouvre le **rejeu animé** (ADR-0029).
Bordure, jamais plein — la seule action accentuée de la page reste « Commencer ». Le libellé est
**inchangé** depuis l'addendum « Construction depuis root » : c'est bien ce qu'il annonce qui a
changé, pas la promesse. Dans la modale, la galaxie se **construit** depuis le cerveau au lieu de
défiler ; il n'y a plus de barre de lecture, seulement un bouton « Revoir ».

⚠️ **Sur l'Accueil, la frise reste telle quelle** — elle se lit d'un coup d'œil sans rien ouvrir.
Elle n'a jamais été une barre de lecture ici, et elle ne le devient pas : c'est dans la modale,
et seulement là, qu'elle se trace en synchronisation avec les étoiles.

⚠️ **La carte porte un ciel 3D depuis le 2026-07-31 au soir**
(`adr-0024-addendum-galaxie-sur-accueil.md`, qui **révoque le §B** du matin). La galaxie s'y
**construit étoile par étoile**, comme dans la modale et par le même hook (`useGalaxyGrowth`) —
et elle **rejoue à chaque visite de la page** : une animation qui ne joue qu'une fois par session
ne rend pas une page vivante.

Trois conditions, qui sont la décision elle-même :

- le canvas n'est **jamais monté au premier rendu** — la carte statique est la première peinture,
  le ciel arrive à `requestIdleCallback` (repli `setTimeout` : **Safari ne l'a pas**, et c'est le
  navigateur de l'iPhone et de l'iPad) ;
- la 3D est **contemplative** — `pointer-events-none`, `aria-hidden` : toute la carte reste une
  seule cible de clic, et un drag de nœud dans un lien déclencherait la navigation au
  relâchement ;
- `prefers-reduced-motion` ou pas de WebGL → **carte statique, point** — et dans ce cas, pas même
  les deux requêtes du graphe complet ;
- le graphe complet (`galaxy/all` + la frise) n'est demandé **qu'avec le ciel** : la page
  d'atterrissage ne paie **rien** avant d'être lisible, ni octets de code ni aller-retour réseau.

⚠️ **`GalaxyReplayModal` ne doit JAMAIS être importée statiquement par l'Accueil.** Elle est
montée en `lazy()`, et charge elle-même le canvas en `lazy()`. Ce **double `lazy()`** est ce qui
garde l'Accueil à **zéro Three.js au premier paint** : `accueil.bundle.test.ts` ne parcourt que
les imports **statiques**, donc un import statique d'ici remettrait 1,37 Mo sur la page
d'atterrissage **sans qu'aucun test ne le voie**. Un second test constate que la modale **n'est
pas montée au chargement**.

### Mon chemin (frise cumulative)

`GET /api/student/galaxy/timeline`, en SVG maison. Elle avait quitté l'Accueil le matin même,
emportée par association avec le canvas 3D ; le §D de l'addendum « Accueil vivant » la ramène —
le coût à annuler était **Three.js**, pas quelques lignes de SVG.

⚠️ **La série est CREUSE** : un point seulement les jours de progrès. Le composant espace ses
points uniformément, donc **son axe X n'est pas le temps**. Acceptable pour une courbe d'allure,
à condition de **ne jamais l'annoter d'une date**. Écrit ici pour que personne ne le « corrige »
en croyant à un bug.

### Tes derniers gains

`recent` (les 5 derniers événements XP, horodatés) et le dernier `badges` de
`GET /api/gamification/summary`. **Coût nul** : cette route est déjà appelée sur cette page par le
bandeau XP, et ces deux champs n'étaient rendus nulle part dans l'app.

Positif par construction — un événement XP est toujours un gain. Le libellé de chaque `reason`
doit être **traduit** : sans quoi Massimo lit `mission_champion` en brut.

### Ma Galaxie (carte-bouton statique)

Porte d'entrée vers `/galaxy`. Contrat **fermé** — addendum ADR-0024 §B :

- **compte d'étoiles allumées**, toutes matières confondues ;
- **pastilles de matières** en CSS pur (pictogrammes `subjectIconFor`, **jamais d'emoji**),
  portant **leur compte** d'étoiles depuis le 2026-07-31 — un **compte**, jamais un pourcentage,
  et l'ordre est celui du programme, **pas un classement** ;
- la carte entière est la cible de clic ; libellé d'action explicite.

**Interdits, par héritage de l'ADR-0024 §5** : aucun pourcentage, aucun classement de matières,
aucune couleur d'échec, aucune notion nommée comme manquante, aucun `mastery_score`.

**Contrainte technique ferme** : **zéro import de `@zetis/ui/galaxy/canvas`** depuis cette page,
direct ou transitif. Le canvas 3D et la frise de progression **ont quitté l'Accueil**
(révocation de l'amendement du 2026-07-28) ; un test de budget de bundle constate la sortie de
Three.js, sans quoi la régression reviendrait sans bruit — 3,6 Mo mesurés en juillet.

### Raccourcis

Trois, pas plus, tous secondaires (bordure, jamais plein) :

- **Révision éclair** — affiche `flash_size`, **plafonné serveur**. **Jamais `total_due`** : un
  compteur de retard sur l'écran d'accueil est la pression quotidienne anxiogène interdite par
  `CLAUDE.md`.
- **Capsule IA** — le nombre de capsules **nouvelles** (`GET /api/capsules/stats`, champ
  `new_count`). Rendu seulement si `total > 0`.
  > **Corrigé le 2026-07-31 au read-before-code.** Cette ligne annonçait « la capsule
  > **recommandée**, avec sa matière et sa **durée** ». Aucune des deux n'est servable :
  > `/api/capsules/library` ne porte **pas de durée**, et « recommandée » n'existe nulle part —
  > la calculer côté client serait une règle métier dans la page, que la slice B interdit. Le
  > « SVT · 4 min » de la maquette est donc décoratif. Servir une capsule recommandée demanderait
  > du **backend**, hors du périmètre annoncé.
- **ELI5** — une notion expliquée simplement. **Toujours proposée** : elle ne dépend d'aucun
  contenu préexistant (même règle que côté serveur dans le panneau d'actions de la Galaxy).

Un raccourci sans contenu disponible **n'est pas rendu** : la ligne se resserre. Pas de carte
grisée ici (contrairement au panneau d'actions de la Galaxy, où le grisé documente le catalogue).

### Héros ZETIS

Onde vocale en état **`idle`** + accroche + bouton **fantôme** « Discuter avec ZETIS ».
C'est la porte d'entrée du chat (ADR-0026).

**C'est un slot, pas un bloc.** Sa place est structurée par la refonte (slice B) mais il n'est
**pas rendu** tant que le chat n'existe pas — pas de porte vers du vide. Le Groupe 1 le remplit
sans rouvrir la composition de la page : c'est ce qui évite de retoucher `AccueilPage.tsx` de
fond en comble deux fois.

L'or `#ffcf47` est **réservé à l'état « ZETIS parle »** : sur l'Accueil, ZETIS ne parle pas.
L'onde est en indigo/cyan, et aucun élément de cette page n'est doré.

## Ce que l'Accueil ne fait plus

- **Canvas Galaxy 3D et frise de progression** → déplacés dans `/galaxy` (addendum §B, §C).
- **Grille des 8 matières** → doublon de l'entrée sidebar « Matières » ; la carte Galaxie répond
  mieux à « où j'en suis ».
- **KPI XP Total / Niveau** → le bandeau global les porte déjà.
- **Compteur de révisions dues** (`total_due`) → remplacé par `flash_size`.

## États

### Aucune mission

`elected: null`. Afficher : « Tu n'as rien d'obligatoire maintenant. Tu peux choisir une matière
ou faire une révision rapide. » La carte héro perd son bouton plein ; **aucun autre bloc ne
devient accentué à sa place** — une page sans action accentuée est un état valide.

### Mission en retard

Ne pas culpabiliser. Dire : « On reprend tranquillement. » Aucun décompte de retard.

### Très bonne progression

Valoriser : « Tu as consolidé N notions cette semaine » — **chiffre réel**. Cette phrase a
longtemps affiché une constante codée en dur (`PROFILE.consolidatedThisWeek = 3`) : ZETIS
félicitait Massimo pour un nombre qui n'existait pas.

### Retour après une absence

Accueillir sans jamais compter les jours : « Content de te revoir ! On reprend là où tu t'étais
arrêté : … ». Aucune illustration évoquant le temps écoulé (ni ⏰, ni 😴).

### Objectif de la semaine atteint

Le reconnaître une fois, dans le message. **Pas de badge** : un badge conditionné à l'engagement
rendrait l'échec visible et transformerait une déclaration d'autonomie en épreuve.

### Galaxie vide

Aucune étoile allumée (rentrée scolaire, premier jour). La carte affiche `0` et une phrase
d'invitation — **pas un état vide**, pas un message d'erreur : une galaxie qui n'a pas encore
commencé est le point de départ normal.

## Données API

Les quatre routes listées ici auparavant (`/progress/summary`, `/progress/xp`,
`/spaced-reviews/due`, et `/missions/today` sans préfixe) n'ont jamais existé sous ces chemins.
Les routes réelles sont :

- `GET /api/missions/today` — mission élue + sa **raison** (texte servi, jamais recomposé) ;
  `elected: null` = état serein.
- `GET /api/student/reviews/summary` — l'Accueil affiche `flash_size` (plafonné serveur) et
  **non** `total_due`.
- `GET /api/student/motivation/welcome` — le message de ZETIS.
- `GET`/`PUT /api/student/motivation/week` — la semaine et l'engagement.
- `GET /api/gamification/summary` — **déjà appelée** par le bandeau XP : niveau et XP pour lui,
  `badges` et `recent` pour « Tes derniers gains ». Aucune requête ajoutée, la donnée est partagée.
- `GET /api/gamification/history?days=90` — **« Mon ciel »**. Les **jours sans XP sont OMIS** du
  payload, jamais renvoyés à zéro : la donnée d'absence n'existe pas, aucun client ne peut donc
  dessiner une case vide (addendum « Accueil vivant » §A).
- `GET /api/student/galaxy/timeline` — **« Mon chemin »**. Série **creuse**, bornée à 60 jours
  côté serveur, non paramétrable.
- `GET /api/student/galaxy` — les matières et, **par matière**, le **compte** `lit` d'étoiles
  allumées (+ `total`). La route existe déjà (module `galaxy`, livré le 2026-07-28) ; **aucun
  travail backend dans ce chantier**. `GET /api/student/galaxy/all` alimente désormais la **vue
  par défaut** de `/galaxy` et n'est **plus appelée depuis cette page**.

  > **Corrigé le 2026-07-31 au read-before-code.** Cette ligne annonçait
  > `GET /api/student/galaxy/overview` : **cette route n'existe pas**, et elle n'aurait pas
  > seulement renvoyé 404 — `/overview` serait capturé par `GET /student/galaxy/{subject_slug}`
  > et rendrait « matière inconnue ». Le chemin réel est `/api/student/galaxy` (chemin vide) ;
  > le client l'appelle déjà correctement, c'est la **fonction** qui s'appelle
  > `fetchGalaxyOverview`. Second écart : le contrat ne porte **aucun compte global** — le
  > « compte d'étoiles allumées toutes matières confondues » de la carte est la **somme client**
  > des `lit`, une addition de présentation, sans appel supplémentaire.

Les blocs sont chargés en `Promise.allSettled` : un appel qui échoue rend son bloc silencieux,
les autres restent à l'écran. **Aucun message technique n'est affiché à l'enfant.**

## Navigation

- Bandeau XP → `/galaxy`.
- Carte Ma Galaxie → `/galaxy`.
- « Commencer » → la mission élue.
- Raccourcis → `/revision` (session éclair par `location.state`), `/capsules`, `/eli5`.
- Héros ZETIS → surface de chat du Groupe 1 (ADR-0026).

`/progression` reste servie en **redirection permanente** vers `/galaxy` — les liens et les
signets antérieurs ne cassent pas.

## Hors périmètre

La sidebar et le bandeau XP (chrome global, `MassimoLayout`) ; le contenu de `/galaxy` ; la
composition interne du chat ; la réconciliation de `navigation.md`, qui décrit un Accueil
**sans sidebar** en « Modèle A » — brouillon non réconcilié, **l'existant prime**.

**Divergence à vérifier au read-before-code** : « Diagnostic » figure dans la sidebar du
`README` frontend-massimo, alors que `navigation.md §9` en fait une mission spéciale et non un
item de menu. Ce chantier ne tranche pas ; il ne doit ni ajouter ni retirer l'entrée.
