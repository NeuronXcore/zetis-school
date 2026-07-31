# ADR-0024 — ZETIS Galaxy : la page Progression rendue en graphe 3D des connaissances

## Statut

Accepté — 2026-07-28.

> **Premier ADR sur la progression et la gamification.** Aucun n'existait : ces décisions vivaient
> éparpillées entre `MEMORY.md`, les specs de page et les commentaires de code. Cet ADR les fige.
>
> S'appuie sur : `adr-0002` (séparation Massimo/Papa), `adr-0011 §1` (patron du module neutre à
> consommateurs multiples), `adr-0016` (React Flow + elk pour les mindmaps — **non rouvert**),
> `adr-0017` (service d'évidence), `adr-0023` (module `production`, Papa-only).
> **Ne rouvre aucune décision antérieure.**

## Contexte

La spec `docs/frontend-massimo/zetis-galaxy.md` était un brouillon de fin juin 2026, resté quatre
semaines dans un `git stash` (`feat/design-system`) et récupéré le 2026-07-28 **sans jamais avoir
été confronté au code**. `BACKLOG.md` en a fait un chantier dédié plutôt qu'une greffe de fin de
session, avec quatre points à trancher. Le read-before-code a montré que le brouillon reposait sur
trois hypothèses **fausses** :

1. **Les prérequis n'existent pas.** `Skill.prerequisite_skill_ids` n'est ni une colonne ni une
   table : zéro occurrence de `prerequisite` dans `apps/backend/app`. Et `parent_skill_id`
   (`db/models/school.py:117`) existe en schéma mais n'est **jamais écrit** — le seul créateur de
   `Skill` (`curriculum/service.py:501-521`) ne le renseigne pas. Les « liens stellaires » du
   brouillon n'avaient **aucune source de données** : le graphe proposé était un nuage de points
   sans arêtes.
2. **`GET /progress/skills` n'existe pas.** Le module `progress` expose `/gaps` et `/consolidated`
   sous `Depends(require_parent)` (`progress/router.py:17-19`). L'« étendre » aurait franchi le mur
   Papa/Massimo de l'ADR-0002.
3. **`/progression` est déjà un onglet**, avec une page XP/badges complète — ce que le brouillon
   `navigation.md` interdit explicitement. La spec et l'existant se contredisaient frontalement.

S'y ajoute une exigence formulée par le user en cours de cadrage : le graphe doit être **animé en
3D**, Massimo doit pouvoir **étirer les nœuds**, et **cliquer pour atteindre le contenu ciblé** de
la notion.

## Alternatives considérées

- **Créer la donnée de prérequis** (table `skill_prerequisites`, génération LLM du graphe de
  dépendances, validation Papa). Fidèle au brouillon, mais c'est un chantier pédagogique à part
  entière : une notion faussement déclarée prérequis d'une autre fausse durablement la lecture de
  la progression. → **Reporté**, pas écarté sur le fond.
- **Aucune arête.** Honnête vis-à-vis de la donnée, mais on perd la métaphore de constellation et
  la lisibilité par chapitre. → Écarté.
- **Rester en 2D avec `@xyflow/react`**, déjà bundlé, coût zéro. → Écarté par l'exigence 3D.
- **`react-three-fiber` maison** : contrôle total de l'esthétique, mais il faudrait écrire soi-même
  le moteur de forces, le drag et le raycasting du clic, pour le même poids de dépendance.
  → Écarté.
- **Une route `/galaxy` séparée**, avec `/progression` conservée à côté. Fidèle au brouillon §7,
  mais entretient deux surfaces de progression concurrentes. → Écarté.
- **Saut direct au clic** (une règle décide de la destination selon l'état de la notion). Plus
  rapide, mais la règle choisit à la place de l'enfant et on quitte la galaxie à chaque clic.
  → Écarté.

## Décision

### 1. La Galaxy **est** la page Progression

> ⚠️ **Révisé le 2026-07-31 sur le NOM DE LA ROUTE SEULEMENT** — cf. l'addendum
> `adr-0024-addendum-galaxie-page-dediee.md` §A. La route est **`/galaxy`** et le libellé de
> sidebar **« Ma Galaxie »**, à la même position ; `/progression` ne survit qu'en **redirection
> permanente**. Ce qui suit reste vrai mot pour mot — c'est un **renommage**, pas un ajout, et la
> surface de progression reste **unique**, ce que ce paragraphe protégeait. Lire `/galaxy`
> partout où ce document écrit `/progression`.

Elle devient le contenu de `/progression` : même route, même entrée de sidebar, **pas de 6ᵉ
onglet**. La section « par matière » aujourd'hui **mockée** (`ProgressionPage.tsx`, commentaire
« reste indicative (mock) en attendant la maîtrise par matière ») disparaît — la Galaxy est
précisément la donnée qu'elle attendait. Anneau XP, badges et activité récente sont **conservés**
autour du canvas.

Le bandeau XP (`MassimoBannerHeader.tsx`, présent sur toutes les pages) devient cliquable vers
`/progression`.

### 2. Les arêtes se dérivent de la structure réelle, jamais d'une donnée inventée

Nœuds de trois natures : `subject` (cœur), `chapter` (amas) et `skill` (étoile). Arêtes de type
`structure` uniquement, via le chemin qui existe vraiment :
**`Skill ← lesson_skills → Lesson → Chapter`**, plus `subject → chapter`.

Le nœud `subject` n'est pas décoratif : constaté à l'écran, sans lui chaque chapitre forme une
**composante isolée** du graphe et le moteur de forces les éloigne les uns des autres — la
constellation se disloque. Un test-verrou vérifie que tous les nœuds restent atteignables
depuis le cœur.

**Interdiction explicite** d'utiliser `parent_skill_id` (NULL partout) ou de fabriquer des
prérequis. Aucune table nouvelle, **aucune migration**.

### 3. Rendu 3D — `react-force-graph-3d`, et deux moteurs graphe assumés

**Revirement daté.** `@xyflow/react` avait été retenu en début de cadrage pour son coût nul (déjà
bundlé via `@zetis/ui/mindmap`). L'exigence 3D le **disqualifie techniquement** : React Flow est un
canvas 2D DOM/SVG. La décision bascule sur `react-force-graph-3d`, qui fournit nativement le rendu
3D animé, le drag de nœud avec élasticité des liens, `onNodeClick`, le halo par nœud et la caméra
orbitale.

Trois dépendances épinglées (convention ADR-0016) : `react-force-graph-3d` 1.29.1,
`three-spritetext` 1.10.0 et `three` 0.185.1. Cette dernière n'est pas un ajout de confort :
`three-spritetext` la déclare en **peerDependency**, et sans déclaration explicite sa résolution
ne tenait qu'à la chance du hoisting. ⚠️ `three@0.185` ne livre **aucun typage** (ils vivent dans
`@types/three`) — plutôt qu'un paquet de types couplé à sa version, le seul point de contact
(`sprite.position`) est typé localement.

`three-spritetext` grave le **nom de chaque étoile dans la scène 3D**.
Elle n'est pas cosmétique : l'infobulle native de la lib est déclenchée au **survol**, qui
n'existe pas au doigt ; sans elle, Massimo verrait des points sans nom sur iPad et iPhone.

**Coût assumé** : ~600 Ko–1 Mo (Three.js). Le `lazy()` ne suffit PAS à l'isoler : mesuré au
build, ré-exporter le canvas depuis le baril `@zetis/ui/galaxy` faisait entrer Three.js dans
le bundle de départ (3,6 Mo). Le canvas vit donc dans son **propre sous-chemin**
`@zetis/ui/galaxy/canvas`, le baril ne gardant que la légende, le repli et le thème — bundle
principal ramené à son niveau antérieur, canvas isolé en chunk de 1,37 Mo (368 Ko gzip) chargé
seulement à l'ouverture d'une constellation. Même raison que le sous-chemin de l'ADR-0016
addendum, poussée d'un cran.

**Deux moteurs graphe coexistent désormais dans le dépôt** : React Flow + elk pour les mindmaps
(arbre 2D éditable, évalué, ADR-0016) et force-graph-3d pour la Galaxy (graphe 3D contemplatif).
Ce n'est pas une duplication à résorber : les deux usages n'ont ni les mêmes contraintes
d'interaction ni le même contrat. **L'ADR-0016 n'est pas rouvert** et `@zetis/ui/mindmap` n'est pas
modifié.

### 4. Le clic ouvre un panneau d'actions, adossé à une route dédiée

Une vérification a montré qu'**une seule surface Massimo est adressable par notion en URL** :
ELI5 (`/eli5?skill_id=N&name=…`, `Eli5Page.tsx:31-41`). Cours, Fiches et Mindmaps ne se ciblent que
par **matière** ; Quiz et Révision ouvrent leur session par `location.state`, pas par URL. Et côté
backend, **aucune fonction ne répond « pour ce `skill_id`, quels contenus validés existent »** :
`production/coverage.py:336` est leçon-centrée **et** Papa-only.

D'où une troisième route élève, `GET /api/student/galaxy/notion/{skill_id}`, qui **réutilise** les
résolveurs déjà écrits — `_resolve_mission_quiz_id` (`missions/service.py:76`),
`_resolve_mission_mindmap_id` (`:98`), `_skill_lesson` (`reports/service.py:358`),
`_existing_fiche` (`:371`) — plutôt que d'en réécrire une variante.

~~**Règle ferme : une action sans contenu validé n'est pas proposée.**~~
**RÉVISÉ le 2026-07-28 (décision du user) : la panoplie COMPLÈTE est affichée, l'indisponible
étant grisé.** Sept activités — cours, ELI5, fiche, capsule, mindmap, révision, quiz — chacune
portant un `available` calculé serveur.

La règle initiale voulait éviter de promettre une porte qu'on referme. Le revirement se défend :
**une fiche manquante n'est pas un échec de Massimo, c'est du contenu que Papa n'a pas encore
produit** — la doctrine anti-anxiété interdit d'exposer les manques *de l'enfant*, pas l'état du
catalogue. Voir tout ce que ZETIS sait faire d'une notion a en outre une valeur propre : ça montre
le chemin possible.

Trois garde-fous, testés :

- une entrée grisée n'est **pas cliquable** (elle ne promet donc rien) ;
- son libellé ne formule **jamais** un échec (« bientôt », jamais « manquant » ni « raté ») ;
- **l'accent va à la première activité réellement faisable**, pas à la première de la liste : une
  action mise en avant doit pouvoir être faite.

### 5. Doctrine de la page de progression — figée ici, rétroactivement

Ces règles étaient dispersées ; elles deviennent opposables.

- **Pas de rouge**, jamais. Une notion non vue est une étoile pas encore née, pas un échec. Les
  libellés sont ceux de l'enfant : « À découvrir », « On commence », « En construction »,
  « Bien acquis », « Maîtrisé ».
- **Aucun score par matière, aucun pourcentage, aucun classement.** La vue d'ensemble affiche un
  **compte** d'étoiles allumées. La page répond à « où j'en suis », elle ne note pas Massimo et ne
  met pas ses matières en concurrence.
- **Aucun capital perdable.** La Galaxy ne réintroduit ni **série (« streak »)**, ni décompte de
  jours manqués, sous aucune forme — c'est précisément ce qui a été retiré le 2026-07-27 parce
  qu'un capital qu'on peut perdre fait venir par peur de perdre. Une étoile allumée **ne s'éteint
  pas** parce que Massimo n'est pas venu.
- **`mastery_score` n'est jamais affiché.** Il module l'intensité lumineuse à l'intérieur d'un
  état, rien de plus. Il est sur **0–100** (`evidence/service.py:42` renvoie la valeur brute) — ne
  pas le confondre avec une échelle 0–1.
- **Le statut `in_progress` existe** (écrit par `missions/service.py:859` sur verdict
  `review_later`) et ne sort d'aucun `_status_from_score()`. Tout mapping doit le couvrir : il se
  rend comme `learning`. Un mapping à cinq branches le manquerait en silence.

### 6. Trois appareils, pas un — et un plafond adaptatif

Massimo ne travaille pas que sur iPhone : **iPad et MacBook dédié à l'école** sont des postes au
moins aussi fréquents, et ce sont eux qui donnent son sens à une vue 3D (surface d'écran, GPU,
pointeur précis pour étirer un nœud). `CLAUDE.md` le dit déjà — « responsive desktop / tablette /
mobile », l'iPhone étant une **contrainte à honorer**, pas la cible unique.

Conséquence : **le plafond de nœuds est adaptatif**, pas une constante unique. Un même nombre
serait à la fois trop lâche sur téléphone et absurdement bas sur MacBook.

| classe d'appareil | plafond par constellation |
|---|---|
| compact (téléphone) | `GALAXY_MAX_NODES.compact = 40` |
| tablette | `GALAXY_MAX_NODES.tablet = 90` |
| desktop | `GALAXY_MAX_NODES.desktop = 150` |

Ces valeurs sont **provisoires** : elles n'ont été mesurées sur aucun appareil réel. La slice B
doit les confirmer ou les corriger **sur les trois postes de Massimo**, et le chiffre retenu
l'emporte sur celui écrit ici. Au-delà du plafond, seuls les amas sont rendus et un chapitre se
déplie à la demande.

Ce qui ne dépend pas de l'appareil :

- Une constellation = une matière.
  ~~**Jamais** un graphe global force-directed de toutes les matières.~~
  **AMENDÉ le 2026-07-28 (décision du user, prise après exposé des deux coûts)** : l'Accueil
  porte un **graphe global** (`GET /api/student/galaxy/all`, `root` → matières → chapitres →
  notions). Les deux objections d'origine tiennent toujours et sont **bornées**, pas ignorées :
  le canvas est chargé en `lazy()` (l'Accueil peint avant Three.js), et le plafond adaptatif
  **replie sur matières + chapitres** dès qu'il mord — les notions restent dans la page
  Progression. Coût assumé : le moteur 3D arrive désormais sur la page d'atterrissage.
- **`prefers-reduced-motion`** : forces figées après stabilisation, pas d'auto-rotation, halos
  statiques.
- **Repli sans WebGL** : liste des notions par chapitre avec leurs états. La progression de Massimo
  ne doit jamais devenir inaccessible parce que la 3D ne démarre pas.
- L'interaction doit marcher **au doigt comme au trackpad** : étirer un nœud, faire tourner la
  caméra et ouvrir le panneau ne peuvent pas dépendre du survol, qui n'existe pas au tactile.

## Divergence assumée avec `navigation.md`

`docs/frontend-massimo/navigation.md` vient du même stash et n'est **pas réconcilié**. Il décrit une
navigation à 5 verbes et interdit un onglet Progression ; le code en a 12 depuis quatre semaines et
Progression est un onglet. **L'existant prime.** Réconcilier `navigation.md` est un autre chantier,
resté au `BACKLOG.md` — il n'est pas ouvert ici.

## Conséquences

**Positives**

- La dette du mock « par matière » de `ProgressionPage.tsx` est réglée par la donnée réelle.
- Le service d'évidence gagne un **sixième consommateur** sans être modifié : le patron ADR-0011 §1
  tient.
- Les résolveurs de ressources par notion, aujourd'hui privés du module `missions`, trouvent un
  second usage — s'ils divergent un jour, ce sera visible.
- La doctrine anti-streak et l'absence de score par matière deviennent **écrites et opposables**
  plutôt que coutumières.

**Négatives, assumées**

- **Un second moteur graphe** entre dans le dépôt (~600 Ko–1 Mo). Mitigé par le `lazy()` et
  l'export en sous-chemin, mais c'est une dépendance lourde de plus à suivre.
- **La 3D est un risque de perf sur le poste le plus contraint**, l'iPhone — pas sur l'iPad ni le
  MacBook, où elle est confortable. Le plafond adaptatif et le repli WebGL le bornent, mais rien
  n'est prouvé : la slice B n'est pas finie tant que les **trois** appareils n'ont pas été
  essayés. Si le téléphone ne suit pas, c'est le palier `compact` qui baisse — pas la 3D qui
  disparaît des deux autres.
- **Le graphe reste peu informatif tant qu'il n'y a pas de prérequis** : il montre l'appartenance
  (quelle notion dans quel chapitre), pas la dépendance (quoi avant quoi). C'est une v1 honnête,
  pas la carte de dépendances que le brouillon promettait.
- **`react-force-graph-3d` n'est pas un composant contrôlé** au sens de React Flow. Si un besoin
  d'édition apparaît côté Galaxy, ce choix sera à revoir — il est fait pour une vue, pas pour un
  éditeur.

## Découpage

- **Slice A — backend** : trois routes élève, schémas, types partagés, tests. Zéro migration.
  Prompt : `prompts/claude-code/prompt-galaxy-slice-a-backend.md`.
- **Slice B — frontend** : `@zetis/ui/galaxy`, panneau d'actions, refonte de `ProgressionPage`,
  bandeau XP cliquable, tests.
  Prompt : `prompts/claude-code/prompt-galaxy-slice-b-frontend.md`.

## Hors v1

Graphe de prérequis ; aperçu sur l'Accueil ; annonce « +1 étoile » en fin de mission ; animation
temps réel poussée par événement ; persistance des positions de nœuds ; réconciliation de
`navigation.md`.

## Amendements et addendum

Cet ADR a été **amendé trois fois le 2026-07-28**, le jour de sa livraison, puis complété par un
**addendum le 2026-07-31**. Le chantier Galaxy aura été cadré en marchant ; c'est écrit ici pour
que ce soit lisible plus tard, pas pour être répété.

- **2026-07-28, §4 révisé** — la règle « une action sans contenu validé n'est pas proposée » est
  remplacée par : panoplie **complète** renvoyée, `available` calculé serveur, l'indisponible
  **grisé et non cliquable**. Une fiche manquante n'est pas un échec de l'enfant, c'est du
  contenu que Papa n'a pas encore produit.
- **2026-07-28, §6 révisé** — `GALAXY_MAX_NODES` devient **adaptatif** : 40 / 90 / 150
  (compact / tablette / desktop). **Valeurs provisoires, mesurées sur aucun appareil réel** —
  dette ouverte, seul le MacBook a été vérifié.
- **2026-07-28, §6 amendé** — un graphe global 3D est posé sur l'Accueil
  (`GET /api/student/galaxy/all`), coût de démarrage assumé par écrit. → **RÉVOQUÉ le
  2026-07-31.**
- **2026-07-31 — `adr-0024-addendum-galaxie-page-dediee.md`** : la Galaxy prend sa route,
  l'Accueil cesse de payer la 3D. Renomme `/progression` en **`/galaxy`** (§A, révise le §1
  ci-dessus **sur le seul nom**), **révoque** l'amendement du 28 et remplace l'aperçu par une
  **carte-bouton statique** (§B), **migre** le graphe global vers `/galaxy` dont il devient la
  **vue par défaut** (§C), et impose la **continuité de la télémétrie** côté Papa (§D).
  **Ne rouvre pas** les §2, §3, §5, ni le reste du §6. Aucune migration, aucune route backend.

`zetis-galaxy.md §13` (« hors v1 : aperçu sur l'Accueil ») avait été contredit par l'amendement
du 28 sans être corrigé ; il **redevient exact** — dans le document comme dans le code.
