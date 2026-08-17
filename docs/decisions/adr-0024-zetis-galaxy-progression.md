---
id: "0024"
titre: "ZETIS Galaxy : la page Progression rendue en graphe 3D des connaissances"
type: architecture
statut: accepte
date: 2026-07-28
pr: 114
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0002", "0011", "0016", "0017", "0025", "0026", "0027", "0028", "0029", "0050"]
---
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

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-07-31 | La Galaxy prend sa route ; l'Accueil cesse de payer la 3D | Accepté | oui |
> | 2 | 2026-07-31 | Un Accueil vivant, sans cadrage de perte | Accepté | — |
> | 3 | 2026-07-31 | Addendum « Galaxie animée » : tout voir, et voir ça arriver | Accepté | — |
> | 4 | 2026-07-31 | Addendum « La galaxie revient sur l'Accueil » : la vie vaut son prix | Accepté | oui |
> | 5 | 2026-07-31 | Addendum « Constellations complètes » : tout est là, et tout tourne autour du centre | Accepté | oui |
> | 6 | 2026-08-01 | La page matière est un index de notions | Accepté | — |
> | 7 | 2026-08-11 | La page matière porte l'effort de Massimo, et se range en onglets | Accepté | oui |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

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
> **Amendement 1** §A. La route est **`/galaxy`** et le libellé de
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

> ⚠️ **RÉVISÉ le 2026-07-31** par **Amendement 3** §1 : **le plafond de
> nœuds est SUPPRIMÉ**, avec son repli. Trois motifs, chacun suffisant — il cachait à Massimo une
> partie de sa propre progression selon un critère matériel ; ses valeurs n'ont jamais été
> mesurées (« seul le MacBook a été vérifié », ci-dessous) ; il ne mordait plus sur la vue par
> défaut depuis la refonte en système solaire. Trois **gardes** le remplacent, qui visent le coût
> réel par image et non un nombre de nœuds : budget de particules, coupure sous 34 FPS, moteur
> arrêté après stabilisation.
>
> **Ce qui reste vrai de ce §6** : les trois appareils, et la dette de mesure — reformulée, pas
> éteinte. Elle doit se faire sur un **pire cas semé**, et **l'iPhone tranche**. S'il ne suit pas,
> ce sont les **particules** qui tombent, jamais les étoiles.
>
> Le tableau des paliers ci-dessous est **caduc**. Conservé pour la lisibilité de l'historique.

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

Cet ADR a été **amendé trois fois le 2026-07-28**, le jour de sa livraison, puis complété par
**deux addenda le 2026-07-31**. Le chantier Galaxy aura été cadré en marchant ; c'est écrit ici
pour que ce soit lisible plus tard, pas pour être répété.

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
- **2026-07-31 — **Amendement 1**** : la Galaxy prend sa route,
  l'Accueil cesse de payer la 3D. Renomme `/progression` en **`/galaxy`** (§A, révise le §1
  ci-dessus **sur le seul nom**), **révoque** l'amendement du 28 et remplace l'aperçu par une
  **carte-bouton statique** (§B), **migre** le graphe global vers `/galaxy` dont il devient la
  **vue par défaut** (§C), et impose la **continuité de la télémétrie** côté Papa (§D).
  **Ne rouvre pas** les §2, §3, §5, ni le reste du §6. Aucune migration, aucune route backend.
- **2026-07-31 — **Amendement 2**** : un Accueil vivant, sans cadrage de
  perte. Refuse la **heatmap** par écrit (trois murs indépendants, dont un test-verrou), et pose
  à la place la **carte du ciel** — une étoile par jour de gain, **sans grille ni axe de temps**,
  donc sans intervalle vide à lire. Crée la **première route élève d'historique**
  (`GET /api/gamification/history`), dont les **jours sans XP sont omis du payload** : la donnée
  d'absence n'existe pas, aucun client futur ne peut en dessiner une. **Rouvre le §B du premier
  addendum** sur un seul point — la **frise** revient sur l'Accueil (SVG maison, le canvas 3D
  reste banni et le test de budget reste le gardien). Aucune migration.

`zetis-galaxy.md §13` (« hors v1 : aperçu sur l'Accueil ») avait été contredit par l'amendement
du 28 sans être corrigé ; il **redevient exact** — dans le document comme dans le code.

---

## Amendement 1 — La Galaxy prend sa route ; l'Accueil cesse de payer la 3D — 2026-07-31

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-31.

> Section à **ajouter à la fin de** `docs/decisions/adr-0024-zetis-galaxy-progression.md`
> (patron des addenda de `adr-0007` et `adr-0016`).
>
> **Révise deux points de l'ADR-0024** : le §1 (« la Galaxy *est* la page Progression ») sur le
> **nom de la route seulement**, et l'amendement du §6 daté du 2026-07-28 (graphe global 3D sur
> l'Accueil), **révoqué**.
> **Ne rouvre pas** les §2 (dérivation des arêtes), §3 (moteur 3D et double moteur graphe),
> §4 (panneau d'actions et panoplie complète grisée), §5 (doctrine) ni le reste du §6
> (plafond adaptatif, `prefers-reduced-motion`, repli WebGL, parité tactile).
> **Aucune décision d'un autre ADR n'est touchée. Aucune migration. Aucune route backend
> nouvelle ni supprimée.**

### Contexte

Trois jours après la livraison de la Galaxy, le refactor de l'Accueil de Massimo remet deux
choses sur la table.

**1. Le nom.** `/progression` est un mot d'adulte, hérité du mock qu'il remplaçait. La page ne
mesure plus rien : elle montre une galaxie. Le libellé de sidebar et l'URL décrivent encore
l'ancien contenu, et c'est la seule page de l'espace Massimo dont le nom ne dit pas ce qu'on y
voit. Le user demande une **page dédiée** et un **bouton d'entrée depuis l'Accueil**.

**2. Le coût de l'amendement §9.** L'aperçu global 3D posé sur l'Accueil le 2026-07-28 a été
accepté avec son coût écrit noir sur blanc : *« le moteur 3D arrive désormais sur la page
d'atterrissage »*. Trois jours d'usage confirment que c'est le mauvais endroit. L'Accueil est la
page la plus visitée, la première peinte au réveil de l'app, et celle qui doit répondre en une
seconde à « qu'est-ce que je fais maintenant ». Elle charge aujourd'hui un chunk de **1,37 Mo
(368 Ko gzip)** pour afficher une vue **contemplative**, dont aucun élément n'est la prochaine
action de Massimo.

S'ajoute une contrainte de calendrier : le chantier Chat (ADR-0026) va poser sa propre porte
d'entrée sur cet Accueil. Refactorer maintenant sans lui expose à ouvrir `AccueilPage.tsx` deux
fois — le §Découpage dit comment ce risque est borné sans faire dépendre ce chantier du Chat.

### Alternatives considérées

- **Ajouter `/galaxy` à côté de `/progression`.** C'est littéralement l'alternative écartée par
  l'ADR-0024 (« entretient deux surfaces de progression concurrentes »). Le motif de rejet vaut
  toujours. → **Écarté**.
- **Garder l'aperçu 3D sur l'Accueil et ajouter le bouton à côté.** Le bouton devient un doublon
  de ce qu'on voit déjà, et le coût de démarrage reste. → Écarté.
- **Garder l'aperçu, mais différé (`IntersectionObserver`, chargement au scroll).** Borne le coût
  au premier paint sans le supprimer, et ajoute une mécanique d'apparition sur une page qui doit
  rester calme. Surtout : ça ne répond pas à la demande de page dédiée. → Écarté.
- **Remplacer l'aperçu par une image statique de la galaxie.** Zéro coût, mais un visuel figé qui
  ne reflète pas l'état réel ment à Massimo dès la première étoile allumée. → Écarté.
- **Renommer, et rendre l'entrée statique.** → **Retenu.**

### Décision

#### A. `/progression` **devient** `/galaxy` — un renommage, pas un ajout

- Route : `/galaxy`. `/progression` est conservée en **redirection permanente**
  (`<Navigate to="/galaxy" replace />`), jamais en page.
- Libellé de sidebar : **« Ma Galaxie »**, à la place de « Progression », **à la même position**.
  Le nombre d'entrées ne bouge pas : toujours pas de 6ᵉ onglet, l'interdit du §1 tient.
- Le bandeau XP (`MassimoBannerHeader`) pointe désormais vers `/galaxy`.
- Le **contenu** de la page ne change pas : écran d'ensemble (planètes CSS), constellations 3D,
  panneau d'actions, KPI d'états, recherche, plein écran, anneau XP, badges, activité récente.
  Rien n'est démembré ni déplacé ailleurs.

La surface de progression reste **unique**. C'est ce que l'ADR-0024 protégeait ; le nom n'en
faisait pas partie.

#### B. L'Accueil rend une **carte-bouton statique** — l'amendement du 2026-07-28 est révoqué

> ⚠️ **CE §B EST LUI-MÊME RÉVOQUÉ**, le soir du même jour, par
> **Amendement 4**. La galaxie **revient sur l'Accueil** : voir la
> galaxie se construire donne à la page une vie qu'un compte statique ne donne pas — ce qui est
> l'intention de l'addendum « Accueil vivant », écrit le matin même. Deux décisions du même jour
> tiraient en sens inverse.
>
> **Ce qui survit de ce §B**, et qui n'est pas jeté avec lui : un montage 3D **immédiat** sur la
> page d'atterrissage reste indéfendable. Le canvas revient **différé** (`requestIdleCallback`,
> repli `setTimeout`), derrière la carte statique qui reste la **première peinture**. Le test de
> budget change de nature — liste blanche au lieu de zéro — mais ne disparaît pas.
>
> Ce qui suit décrit l'état **d'avant**.

Le `GalaxyCanvas` et la frise de progression **quittent l'Accueil**. À leur place, une carte
d'entrée dont le contrat est fermé :

- **compte d'étoiles allumées**, toutes matières confondues — un compte, jamais un pourcentage ;
- **pastilles de matières** en CSS pur (mêmes pictogrammes `subjectIconFor`, jamais d'emoji) ;
- un libellé d'action, et la carte entière est la cible de clic → `/galaxy`.

**Interdits sur cette carte**, par héritage du §5 : aucun pourcentage, aucun classement de
matières, aucune couleur d'échec, aucune notion nommée comme manquante, aucun `mastery_score`.

**Contrainte technique ferme : zéro import de `@zetis/ui/galaxy/canvas` depuis l'Accueil**, ni
direct, ni transitif. Le sous-chemin dédié (§3) existe précisément pour que cette frontière soit
vérifiable au build. Un test de budget de bundle sur la page d'entrée constate la sortie de
Three.js ; sans lui la régression reviendrait sans bruit, comme les 3,6 Mo mesurés en juillet.

#### C. Le graphe global **migre** de l'Accueil vers `/galaxy`, dont il devient la vue par défaut

> ⚠️ **La RÉDUCTION décidée ici — `root` + `subject` seulement — est RÉVOQUÉE** le soir du même
> jour par **Amendement 5**. La vue par défaut rend désormais la
> galaxie **entière**, en orbites emboîtées.
>
> **Ce §C n'était pas une erreur** : son constat, fait au vu du rendu réel, était juste. Ce qu'il
> attribuait au **nombre de nœuds** venait en fait de la **convergence** — un moteur de forces
> tasse les nœuds là où les forces s'annulent, sans égard pour la lisibilité. Les positions étant
> désormais **calculées et épinglées**, moteur éteint, l'amas ne peut plus se produire et le
> filtre protégeait contre un défaut disparu.
>
> ⚠️ **Ne pas en conclure qu'on peut rallumer les forces.** C'est parce qu'on ne les rallume pas
> que tout peut être montré. La **migration** décidée par ce §C, elle, tient sans changement.

La brique livrée le 2026-07-28 pour l'Accueil — graphe global en deux colonnes, badges de matières
cliquables, frise de progression — n'est **pas supprimée**. Elle **change d'adresse**. Rien de ce
qui a été construit ce jour-là n'est jeté ; c'est son emplacement qui était faux, pas son contenu.

- **Vue par défaut de `/galaxy`** : la galaxie **complète**, toutes matières
  (`GET /api/student/galaxy/all` — `root` → matières → chapitres → notions). Le plafond adaptatif
  de l'ADR-0024 §6 s'applique tel quel : dès qu'il mord, la vue **replie sur matières +
  chapitres**, et les notions restent atteignables en entrant dans une constellation.

  > ⚠️ **Révisé le 2026-07-31, au vu du rendu réel.** Servir **tout** le graphe d'un coup à une
  > simulation de forces produisait un **amas** : le cœur (cerveau) à moitié enseveli sous les
  > sphères, des libellés qui se chevauchent, et aucune lecture possible.
  >
  > La vue d'arrivée devient un **système solaire** — le **cerveau au centre** et les
  > **matières seules**, chacune **posée** sur une orbite dessinée, dans un plan aplati vu en
  > surplomb. Un placement calculé, pas un équilibre : un moteur de forces cherche une
  > position stable, pas une composition.
  >
  > **Rien n'est perdu** : les notions restent atteignables en entrant dans une constellation —
  > elles cessent seulement d'être servies **toutes en même temps**. Le contrat
  > `GET /api/student/galaxy/all` est **inchangé**, c'est le client qui ne garde que `root` et
  > `subject`. Effet de bord heureux : 8 planètes au lieu de 60 nœuds, le **plafond adaptatif ne
  > mord plus jamais** sur cet écran (la dette §6 subsiste pour les constellations).
- **Clic sur une matière** → sa constellation, comportement inchangé.
- **Les planètes CSS cessent d'être un écran.** Elles deviennent l'**état d'attente** pendant le
  chargement du chunk 3D, et le **repli sans WebGL**. Elles gardent ainsi leur raison d'être
  d'origine — ne pas payer Three.js — là où elle a encore un sens.
- La **frise de progression** suit : c'est un élément de progression, sa place est ici.

**Coût assumé, et c'est le bon endroit pour le payer** : `/galaxy` charge Three.js dès son
ouverture. C'est la raison d'être de la page. Tout le gain du §B consistait à sortir ce coût de la
page d'atterrissage, pas à le supprimer du produit.

Maquette : `docs/frontend-massimo/mockup/mockup-page-galaxy-v1.html` (trois écrans : galaxie complète,
constellation + panneau d'actions, attente / repli sans WebGL).

Conséquence maintenue : **aucun travail backend.** Pas de route supprimée, pas de schéma touché.
`GET /api/student/galaxy/all` change de consommateur, pas de contrat.

#### D. La télémétrie de navigation garde sa continuité

`POST /api/telemetry/pageview` enregistre la `route` brute, et l'historique d'avant ce jour
contient `/progression`. Côté Papa, le cahier de bord et le dashboard qui traduisent une route en
libellé doivent **accepter les deux valeurs** et les rendre sous le même nom.

Ce n'est pas un détail de confort : sans ce mapping, le renommage crée une **rupture silencieuse
dans l'historique** de Massimo — une page fréquentée pendant trois jours disparaîtrait des
statistiques, ou apparaîtrait comme deux pages distinctes. C'est la seule conséquence de ce
chantier qui touche la surface Papa.

### Conséquences

**Positives**

- **L'Accueil redevient la page la plus légère du front.** Le coût assumé de l'amendement du
  2026-07-28 est annulé, pas atténué : le moteur 3D n'est plus chargé qu'à l'ouverture explicite
  de la galaxie.
- L'URL, le libellé de sidebar et le contenu **disent la même chose**, pour la première fois
  depuis la livraison.
- L'Accueil retrouve sa règle d'or : **une seule action accentuée**, « Commencer » sur la mission
  du jour. La galaxie devient une invitation, plus une vue concurrente.
- `zetis-galaxy.md §13` (« hors v1 : aperçu sur l'Accueil ») **redevient exact** — il avait été
  contredit par l'amendement sans être corrigé.

**Négatives, assumées**

- **Un clic de plus** pour voir la galaxie. C'est le prix explicite du gain de démarrage, et il
  est cohérent avec la nature de la vue : on va voir sa galaxie, on ne la croise pas.
- **Une redirection permanente à maintenir** dans le routeur, et un mapping de libellé à deux
  entrées côté Papa (§D) — deux petites dettes qui ne s'effaceront jamais complètement.
- **Deux décisions rouvertes en trois jours** sur le même ADR (quatre amendements au total). Le
  chantier Galaxy aura été cadré en marchant ; c'est écrit ici pour que ce soit lisible plus tard,
  pas pour être répété.

### Corollaires documentaires

- **`docs/frontend-massimo/page-accueil.md` n'a jamais documenté l'aperçu Galaxy livré le
  2026-07-28.** La spec était déjà en retard sur le code avant ce chantier. Elle est **réécrite**
  (nouvelle composition de l'Accueil), et la dette est réglée au passage. Maquette de référence :
  `docs/frontend-massimo/mockup/mockup-page-accueil-v2.html`.
- `zetis-galaxy.md` : route, libellé, et §13 à corriger.
- `navigation.md` reste **non réconcilié** — ce chantier ne l'ouvre pas. Il contredisait déjà
  l'existant sur l'onglet Progression ; il le contredit désormais sur son nom.
- `DECISIONS.md`, `CHANGELOG.md`, `API_SPEC.md` (§ZETIS Galaxy : consommateur de `/all` modifié,
  contrat inchangé).

### Découpage

> **Corrigé le 2026-07-31, avant tout commit.** Une première rédaction rattachait ce chantier au
> **Groupe 1 (Chat Massimo, ADR-0026), slice A, sans branche séparée**, au motif que l'Accueil est
> la surface d'atterrissage du chat. Le motif était juste, la conclusion non : le renommage de
> route n'a **aucun rapport** avec le chat, et l'adosser au Groupe 1 aurait retardé un gain
> immédiat derrière un chantier lourd. La contrepartie — ouvrir `AccueilPage.tsx` deux fois — est
> **bornée**, pas ignorée : voir la slice B ci-dessous.

**Chantier autonome. Branche `feat/accueil-galaxy`**, deux slices, dans l'ordre.

#### Slice A — renommage de route

Prompt : `prompts/claude-code/prompt-accueil-galaxy-slice-a-renommage.md`.

1. `/galaxy` sert la page ; `/progression` devient une redirection permanente.
2. Sidebar « Ma Galaxie », même position ; bandeau XP repointé.
3. Toutes les références résiduelles à `/progression`.
4. Mapping de télémétrie **à deux routes** côté Papa (§D).

**Hypothèse à vérifier, pas un acquis** : le point 4 est annoncé sans travail backend. Si le
mapping route → libellé vit côté serveur (module `parent/activity`), l'annonce « zéro backend »
tombe et la slice s'arrête pour arbitrage.

#### Slice B — refonte de l'Accueil

Prompt : `prompts/claude-code/prompt-accueil-galaxy-slice-b-accueil.md`.

1. Retrait du canvas 3D et de la frise ; carte-bouton statique ; **test de budget de bundle**.
2. Recomposition en cinq blocs (spec `page-accueil.md`).
3. Migration du graphe global (+ badges matières, frise) vers `/galaxy`, **en vue par défaut**.

**L'emplacement du héros ZETIS est structuré mais NON RENDU.** C'est ce qui borne le double
passage : le Groupe 1 remplira un **slot** au lieu de rouvrir la composition. Le bloc n'est pas
rendu tant que le chat n'existe pas — une porte vers du vide est pire que pas de porte.

### Hors périmètre

Toute évolution du **contenu** de la galaxie (graphe de prérequis, annonce « +1 étoile »,
persistance des positions, animation temps réel) ; le plafond adaptatif et sa validation sur les
trois appareils, qui restent dus au titre de l'ADR-0024 §6 ; la refonte du reste de l'Accueil
au-delà de la carte Galaxie, traitée par la spec de page ; la réconciliation de `navigation.md`.

---

## Amendement 2 — Un Accueil vivant, sans cadrage de perte — 2026-07-31

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-31.

> Second addendum de l'ADR-0024, le jour même du premier
> (**Amendement 1**). Il **rouvre le §B** de celui-ci sur un point
> précis — le retour de la frise sur l'Accueil — et **n'ouvre rien d'autre** : le canvas 3D reste
> banni de la page d'atterrissage, la galaxie complète reste la vue de `/galaxy`, la carte-bouton
> reste statique.
>
> Il pose en revanche une **première** : la première route de `gamification` conçue pour être lue
> par Massimo au-delà d'un instantané. C'est cette décision-là qui mérite d'être écrite, pas les
> composants.

### Contexte

L'Accueil recomposé le matin même est **calme et léger** — c'était son objectif. Il est aussi
**pauvre** : hors la mission du jour, Massimo n'y lit qu'une semaine de sept cases et un compte
d'étoiles. Le user demande une page **plus vivante, avec des indicateurs plus élaborés**, et cite
en référence la **heatmap du dashboard de Papa**.

Cette référence est bloquée par trois murs **indépendants** — et c'est important, parce qu'aucun
ne se contourne en levant les deux autres :

1. **La route n'existe plus.** `GET /api/parent/activity/heatmap` a été supprimée (ADR-0028) ; la
   grille vit désormais dans l'agrégat `GET /api/parent/dashboard`, `require_parent`.
2. **La doctrine l'interdit.** `CLAUDE.md` §gamification bannit le « décompte de jours manqués,
   **sous quelque forme que ce soit** ». Une grille de 26 semaines *est* ce décompte : ses cases
   vides **sont** la mesure de l'absence, et elles s'accumulent d'autant plus qu'on s'éloigne.
3. **Un test le verrouille.** `WeekDots.test.tsx:32` — « un jour PASSÉ sans activité et un jour
   FUTUR sont rendus à l'identique ».

S'y ajoute une frontière écrite deux fois dans le code (`activity/router.py:1-7`,
`packages/types/src/activity.ts:5`) : **rien de ce tracking ne remonte dans l'interface de
Massimo** — *« un enfant chronométré travaille pour le chronomètre »*.

Le read-before-code a par ailleurs montré que **l'enfant n'a aucun historique jour par jour** :
`galaxy/timeline` est bornée à 60 jours et **creuse**, `motivation/week` ne sert que la semaine
courante, `recent` s'arrête à 5 événements. La page est pauvre parce que la **donnée** l'est.

### Alternatives considérées

- **Servir la heatmap de Papa à Massimo.** Franchit la séparation des domaines de `CLAUDE.md`,
  et livre à l'enfant une mesure d'effort. → **Écarté.**
- **Une heatmap à lui, avec les cases vides en gris neutre.** Le neutre ne change rien : ce qui
  désigne l'absence, c'est la **position** de la case dans une grille dense, pas sa couleur.
  → Écarté.
- **Une frise dense jour par jour** (un point par jour, zéro les jours sans activité). La courbe
  redescendrait à zéro à chaque absence : un cadrage de perte, sur un axe de temps explicite.
  → Écarté.
- **Ne rien ajouter, l'Accueil doit rester nu.** Défendable, mais le design-system dit de la
  surface Massimo qu'elle doit être « motivante, visuelle, feedback immédiat ». Une page qui ne
  montre jamais le chemin parcouru ne récompense rien. → Écarté.
- **Une carte du ciel + les données déjà servies.** → **Retenu.**

### Décision

#### A. Un historique de **gains** n'est pas le streak déguisé — et voici pourquoi

C'est la décision dont tout le reste dépend, et elle doit être argumentée, parce qu'elle marche
sur un refus déjà écrit. `motivation/router.py:38-39` refuse de servir les semaines passées :

> *« un historique d'objectifs manqués serait le streak déguisé »*

Ce refus est **maintenu**, et la route créée ici ne l'entame pas. La distinction n'est pas de
degré, elle est de nature :

- ce que `motivation` refuse de servir, c'est **l'objectif tenu ou non**, semaine après semaine.
  Un objectif porte un **attendu** ; l'historique d'un attendu est un relevé d'échecs ;
- ce que cette route sert, ce sont des **gains obtenus**. Il n'y a **aucune notion d'objectif**
  dans `xp_events` : un XP est arrivé, ou il n'est jamais venu à l'existence. Un jour sans XP
  n'est pas un jour raté — c'est un jour dont il n'y a **rien à dire**.

Le garde-fou est **dans le contrat, pas dans l'UI** : les jours sans XP sont **omis du payload**,
jamais renvoyés à zéro. Aucun client, présent ou futur, ne peut donc dessiner une case vide à
partir de cette route : **la donnée d'absence n'existe pas**. C'est ce qui rend la décision
robuste au prochain chantier, qui ne relira pas cet ADR.

```
GET /api/gamification/history?days=90
→ { "days": [ { "date": "2026-07-29", "xp": 60 }, { "date": "2026-07-31", "xp": 120 } ] }
```

- **Dans `gamification`, pas dans `activity`.** `activity` porte une doctrine de module — rien de
  son tracking ne descend chez Massimo, et son `parent_router` est gardé au niveau du routeur. Y
  ajouter une lecture élève contredirait un texte écrit deux fois. `xp_events` est un **autre
  registre** : le grand livre des récompenses, déjà lisible par l'enfant via `/summary`.
- **Aucune minute, aucune session, aucun `event_type`.** On ne chronomètre pas l'enfant.
- **Jamais d'UNION `xp_events` / `learning_events`** (`progress.py:216-219` : double comptage).
- Fenêtre bornée serveur. **Aucune migration** — `XPEvent` porte déjà `created_at`.

#### B. « Mon ciel » — la heatmap retournée

Une **case par jour où Massimo a gagné du XP**, posée sur un **calendrier** : semaines en
colonnes, jours en lignes, comme la heatmap de Papa. Rien d'autre n'est dessiné.

> **Révisé le 2026-07-31, après un premier rendu.** La première version posait les jours en
> **constellation libre**, sans repère temporel — c'était le moyen le plus direct d'éviter toute
> lecture des intervalles. Le user a redemandé la heatmap : ce qui manquait n'était pas la
> densité, c'était le **repère de temps**. La constellation est donc remplacée par un calendrier,
> et l'interdit est reporté d'un cran — de la géométrie vers le **rendu**.

- **Aucune case vide n'est dessinée.** Pas de carré gris, pas de bordure, aucun élément dans le
  DOM pour un jour sans gain. Chaque case est placée en `grid-column`/`grid-row` explicites, donc
  la grille n'a jamais besoin de remplissage. C'est ce qui la sépare d'une heatmap : chez Papa la
  case grise **est** l'information d'absence, et elle y est légitime — c'est du pilotage.
- **Ce qui est assumé** : sur un calendrier, l'œil perçoit les intervalles par la **position**,
  même sans case dessinée. C'est le prix du repère temporel, et il est payé en connaissance de
  cause. Ce que `CLAUDE.md` interdit — un **décompte**, une iconographie du vide — reste absent.
- Libellés de mois seulement quand le mois change **et** que la place le permet.
- Intensité ∝ XP du jour, rampe indigo → cyan → blanc du §5. **Pas de rouge.**
- Légende = un **compte qui ne peut que monter** : « 34 jours d'apprentissage ».
- La grille commence **au premier jour d'activité** — jamais une période antérieure à l'histoire
  de l'élève. Elle s'étend toute seule avec le temps.
- `prefers-reduced-motion` coupe le scintillement.

**Brique partagée** : `buildSparseCalendar` (`packages/ui/src/lib/calendarGrid.ts`), avec
`toLocalIso` et `startOfWeek` **remontés depuis `heatmap.ts` de Papa** — deux `startOfWeek` dans
un même dépôt finiraient par diverger sur les bords de semaine. Ce qui n'est **pas** partagé :
`buildHeatmapGrid`, qui reconstruit les jours vides.

**Ce que la carte ne fera jamais** : afficher une date manquée, un « depuis N jours », une
moyenne, un objectif de jours, ou une comparaison entre deux périodes.

#### C. Trois enrichissements à coût nul, par des données déjà servies

- **Derniers gains + dernier badge.** `recent` (5 événements horodatés) et `badges` sont servis
  par `GET /api/gamification/summary` — que le bandeau XP **appelle déjà sur cette page** — et
  n'étaient **rendus nulle part dans l'app**. Zéro backend, zéro requête ajoutée.
  ⚠️ `lib/gamification.ts:30-34` ne traduit que 3 `reason` : à compléter, sinon Massimo lit
  `mission_champion` en brut.
- **Pastilles de matières porteuses de leur compte.** Donnée déjà chargée par la carte Galaxie.
  Un **compte**, jamais un pourcentage ; l'ordre est celui du programme, **pas un classement**.
- **La frise revient sur l'Accueil.** `GET /api/student/galaxy/timeline`, en SVG maison.

#### D. Le retour de la frise rouvre le §B du premier addendum — assumé

Le §B du 2026-07-31 matin faisait quitter l'Accueil au **canvas 3D et à la frise**, dans le même
mouvement. C'était juste pour le canvas, excessif pour la frise : le coût qu'on voulait annuler
était **Three.js sur la page d'atterrissage**, et la frise est du **SVG maison de quelques
lignes**. Elle avait été emportée par association, pas par raisonnement.

**Le motif du §B reste entier** : aucun import de `@zetis/ui/galaxy/canvas`, direct ou transitif,
et le test de budget de bundle reste le gardien de cette frontière.

⚠️ **Écart de lecture à documenter** : la série de `timeline` est **creuse** — un point seulement
les jours de progrès. `ProgressSparkline` espace ses points uniformément, donc **son axe X n'est
pas le temps**. C'est acceptable pour une courbe d'allure, à condition de ne jamais l'annoter d'une
date. Écrit ici pour que personne ne le « corrige » en croyant à un bug.

### Conséquences

**Positives**

- L'Accueil montre enfin **le chemin parcouru**, ce qu'aucune de ses versions n'a jamais fait.
- La règle d'or tient : **une seule action accentuée**. Tout ce qui est ajouté se **regarde**.
- Le refus de la heatmap est désormais **écrit et argumenté** — il n'aura pas à être redécouvert.

**Négatives, assumées**

- **Une route de plus** à maintenir, et un second lecteur de `xp_events` (dont le service actuel
  charge déjà toute la table sans `LIMIT` — dette signalée, non traitée ici).
- **Une page plus chargée.** Le gain de calme du matin est partiellement rendu ; c'est le prix
  explicite de « plus vivante ».
- **Le §B rouvert le jour même de son écriture.** Trois amendements et deux addenda sur le même
  ADR en une journée : le chantier Galaxy/Accueil aura été cadré en marchant.

### Corollaires documentaires

`page-accueil.md` (nouveaux blocs, §Données API) · maquette
`mockup/mockup-page-accueil-v3.html` · `DECISIONS.md` · `API_SPEC.md` (nouvelle route) ·
`CHANGELOG.md` · pointeur dans l'ADR-0024 § « Amendements et addendum ».

### Hors périmètre

Le contenu de `/galaxy` ; le plafond adaptatif et sa validation sur les trois appareils (dette
ADR-0024 §6) ; le chat et son héros, dont le **slot reste non rendu** ; la remontée de
`ProgressSparkline` sur la `Sparkline` de `@zetis/ui` (chantier annoncé dans `sparkline.tsx:6-9`) ;
les trois anomalies relevées au passage (`agenda_band_days_after`, `interval_days` servi à
l'élève, `XPEvent` chargés sans `LIMIT`).

---

## Amendement 3 — Addendum « Galaxie animée » : tout voir, et voir ça arriver — 2026-07-31

> Fusionné depuis **Amendement 3** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-31.

> **Addendum, pas nouvel ADR.** Il **révise le §6** (plafond de nœuds) et **complète le §C** du
> premier addendum (**Amendement 1**) : celui-ci décide **ce qui est
> rendu** sur la vue par défaut — le cerveau et les matières seules ; celui-ci ajoute **comment ça
> arrive**. Aucun mécanisme nouveau, aucune donnée nouvelle, aucune route.
>
> ⚠️ Troisième addendum à l'ADR-0024 en une journée, après quatre amendements. C'est écrit ici
> pour être lisible, pas pour être répété.

### Contexte

Deux demandes du même échange, qui n'ont l'air que d'une seule :

1. **« Supprimer les limites de nœuds pour tous les voir. »**
2. **« Elle doit se construire comme quand on anime un graphe Obsidian. »**

Ce que le read-before-code documentaire a établi :

- **Deux limites distinctes étaient confondues.** `GALAXY_MAX_NODES` (40 / 90 / 150) borne les
  **constellations**. Ce qui borne la **vue par défaut**, c'est tout autre chose : le §C, révisé
  le matin même **au vu du rendu réel**, filtre la charge utile **côté client** pour ne garder que
  `root` et `subject`. Supprimer le plafond ne change **rien** à cet écran.
- **Le plafond n'a jamais été mesuré.** L'ADR-0024 §6 le dit : valeurs **provisoires**, « seul le
  MacBook a été vérifié ». La dette est ouverte depuis le 2026-07-28.
- **Son repli — « on n'affiche que les amas et on déplie un chapitre à la demande » — n'apparaît
  dans aucun livrable de la slice B**, et le §C note que le plafond « ne mord plus jamais » sur la
  vue par défaut. Forte présomption de **code jamais atteint, voire jamais écrit**. À constater
  avant de supprimer (§Read-before-code).
- **La vue par défaut n'est pas un équilibre.** Le §C est explicite : les planètes sont **posées**
  sur des orbites dessinées, « un placement calculé, pas un équilibre ». Un moteur de forces
  cherche une position stable, pas une composition.

### Alternatives considérées

- **Rallumer le moteur de forces sur la vue par défaut** pour obtenir le mouvement d'Obsidian.
  C'est littéralement l'amas refusé le matin même : le cerveau à moitié enseveli, les libellés
  superposés. → **Écarté.**
- **Abaisser le plafond après mesure au lieu de le supprimer.** La mesure n'a jamais eu lieu, et
  le principe reste indéfendable : le repli **cache à Massimo une partie de sa propre
  progression**, selon un critère qui n'a rien de pédagogique — la taille de son écran. → Écarté.
- **Supprimer le plafond sans rien mettre à la place.** Remplace une supposition par une autre.
  → Écarté.
- **Supprimer le plafond avec des gardes ciblées, et animer l'arrivée par tween sur le placement
  calculé.** → **Retenu.**

### Décision

#### 1. `GALAXY_MAX_NODES` est **supprimé**, avec son repli

Constante, paliers, branches de repli : tout part. Trois motifs, chacun suffisant :

- il **cache la progression de l'enfant** selon un critère matériel ;
- ses valeurs n'ont **jamais été mesurées** — ce n'est pas une protection éprouvée, c'est une
  supposition ;
- il **ne mord plus** sur la vue par défaut depuis la refonte en système solaire.

⚠️ **Ce qui borne le volume sur la vue par défaut reste le §C** — filtre client `root` + `subject`,
huit planètes. **Il n'est pas touché** : c'est une décision prise sur rendu réel, pas sur
supposition. Ne pas la « rouvrir » en croyant appliquer le présent §1.

#### 2. Trois gardes remplacent le plafond — et elles visent le vrai coût

- **Les particules, pas les nœuds.** `linkDirectionalParticles` anime un objet **par lien à chaque
  frame** : c'est ce qui tue le framerate, pas des sphères statiques. Le flux doré est plafonné en
  **nombre de particules** et coupé sous un seuil de FPS. **Jamais** un plafond de nœuds déguisé.
- **Moteur arrêté après stabilisation** (`cooldownTicks`) : une simulation qui tourne
  indéfiniment brûle le CPU du téléphone pour rien. La rotation caméra continue — elle est quasi
  gratuite.
- **Le repli sans WebGL reste intact** (liste des notions par chapitre). C'est lui, le vrai filet.

#### 3. L'arrivée de la vue par défaut est un **tween**, pas une convergence

Le cerveau apparaît **seul**. Puis les matières **naissent au centre** et rejoignent leur créneau
orbital. Le trait d'orbite se trace **derrière** la planète, jamais avant.

| constante | valeur | rôle |
|---|---|---|
| `CORE_IN` | 420 ms | apparition du cerveau, seul |
| `PLANET_STAGGER` | 80 ms | décalage entre deux matières |
| `PLANET_TRAVEL` | 700 ms | trajet centre → créneau, `easeOutCubic` |
| `ORBIT_DRAW` | 600 ms | tracé de l'orbite, à l'arrivée de sa **première** planète |

Total ≈ **1,3 s**, puis la rotation lente déjà acquise (`autoRotate`, ~50 s/tour).

**L'ordre est celui du programme.** Pas l'ancienneté, pas le nombre d'étoiles. Un ordre
chronologique ferait de cet écran un mini-rejeu et introduirait un **classement implicite** —
le §5 l'interdit.

**Une fois par visite.** L'arrivée joue à l'entrée sur `/galaxy`, **pas au retour d'une
constellation** : revoir la même chorégraphie à chaque aller-retour, c'est l'animation subie qu'on
bannit partout ailleurs. Un flag de session suffit ; le retour restitue la composition d'emblée.

`prefers-reduced-motion` → **composition finale immédiate**, aucun trajet, aucune rotation.

⚠️ **Piège d'implémentation.** Si le placement orbital fixe `fx/fy/fz`, le nœud y est **téléporté**
dès l'affectation : aucun trajet possible. N'affecter `fx/fy/fz` qu'**à l'arrivée**, animer
`x/y/z` avant. Le moteur reste éteint : c'est un tween, pas une convergence.

#### 4. Ce que l'arrivée ne fera jamais

- Un ordre **chronologique** ou **par volume**.
- Rejouer à chaque retour de constellation.
- Une orbite dessinée **avant** que sa planète y soit.
- Un **nombre** pendant l'arrivée : ni compteur, ni pourcentage, ni date.

### Conséquences

**Positives**

- Massimo voit **toute** sa progression, sur les trois appareils. Plus rien n'est caché par la
  taille de l'écran.
- La vue par défaut gagne une entrée en matière **sans changer ce qu'elle rend** : le §C tient
  intact.
- Une constante non mesurée et une branche probablement morte quittent le dépôt.

**Négatives, assumées**

- **Le filet de sécurité change de nature** : on passe d'un plafond dur (qui n'a jamais servi) à
  des gardes qualitatives (particules, `cooldownTicks`). Si le téléphone décroche, la correction
  sera moins immédiate qu'un chiffre à baisser.
- **Une chorégraphie de plus à maintenir**, et un flag de session à ne pas oublier.
- **La dette §6 ne se ferme pas.** Voir ci-dessous.

### Dette reformulée, pas éteinte

La mesure sur les **trois appareils** de Massimo reste due — et elle doit se faire sur un **pire
cas semé** (référentiel validé complet, plusieurs centaines de notions dans une constellation),
pas sur les ~37 étoiles d'aujourd'hui. **L'iPhone tranche.** S'il ne suit pas, ce sont les
**particules** qui tombent, pas les nœuds.

### Read-before-code

1. **Où vit `GALAXY_MAX_NODES`** : constante + tous les usages. Si les seuls résultats sont la
   déclaration et un `slice()`, c'est trois lignes à effacer.
2. **Le repli « amas + dépliage » existe-t-il en code ?** Chercher `cluster`, `collapse`,
   `deplier`. S'il existe, il part avec. S'il n'existe pas, le dire dans le rapport de session —
   c'est un écart doc/code à corriger dans `zetis-galaxy.md`.
3. **Où vit le filtre client `root` + `subject`** (page, hook, ou `GalaxyCanvas`). S'il est dans le
   canvas, le **remonter en prop** plutôt que le supprimer — sinon on casse la vue système solaire
   en réparant le rejeu (cf. addendum ADR-0029).
4. **Le placement orbital passe-t-il par `fx/fy/fz` ?** C'est ce qui décide si l'animation est
   trois lignes ou une reprise du placement.

**Stop-on-blocker** : si le plafond est appliqué **côté serveur** (troncature de la charge utile
dans `galaxy/service.py`), le supprimer change le contrat des routes élève. La slice s'arrête et
remonte pour arbitrage.

### Corollaires documentaires

- `zetis-galaxy.md` §9 (plafond adaptatif) et §11 (interaction) — le tableau des paliers disparaît,
  les trois gardes le remplacent.
- `adr-0024-zetis-galaxy-progression.md` §6 — marquer la révision dans la liste des amendements.
- `page-accueil.md` — **non concerné** (l'Accueil ne monte pas le canvas).
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` **inchangé** : aucun contrat touché.
- Maquette : `docs/frontend-massimo/mockup/mockup-page-galaxy-animations-v1.html`, écran A.

### Hors périmètre

Le contenu de la galaxie (prérequis, persistance des positions) ; la modale de rejeu, traitée par
l'addendum ADR-0029 ; la réconciliation de `navigation.md`.

---

## Amendement 4 — Addendum « La galaxie revient sur l'Accueil » : la vie vaut son prix — 2026-07-31

> Fusionné depuis **Amendement 4** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-31 (soir).

> **Addendum, pas nouvel ADR.** Il **révoque le §B** du premier addendum
> (**Amendement 1**), écrit le matin même, qui avait retiré le canvas 3D
> de l'Accueil.
>
> ⚠️ **Quatrième addendum à l'ADR-0024 en une journée.** C'est beaucoup, et ce n'est pas un signe
> de santé : le chantier Galaxy aura été cadré en marchant. Écrit pour être lisible, pas répété.

### Contexte

Le §B du matin retirait le canvas de l'Accueil, avec un raisonnement qui tenait : la page la plus
visitée, la première peinte au réveil de l'app, chargeait **1,37 Mo (368 Ko gzip)** pour une vue
contemplative dont aucun élément n'est la prochaine action de Massimo. Le coût était **annulé, pas
atténué**, et un test de budget (`accueil.bundle.test.ts`) le verrouillait.

Le soir, la slice B livre la **construction depuis `root`** — la galaxie qui pousse au lieu de
défiler. Constat d'usage, formulé par Papa : **voir la galaxie se construire donne à la page une
vie qu'un compte statique ne donne pas.**

Cet argument n'est pas une préférence esthétique isolée. Il est **exactement l'intention** de
l'addendum « Accueil vivant », écrit le même jour, qui cherchait à rendre la page moins inerte —
et qui, faute de mieux, s'était rabattu sur « Mon ciel » et « Tes derniers gains ».

Deux décisions du même jour tiraient donc en sens inverse : l'une voulait un Accueil vivant,
l'autre lui retirait ce qu'il avait de plus vivant.

### Alternatives considérées

- **Animer la carte CSS existante** (le cœur qui apparaît, les pastilles qui sortent du centre).
  Zéro Three.js, test de budget intact, aucun ADR à rouvrir. **Proposé en premier, et écarté par
  Papa** : une pastille qui glisse n'est pas une galaxie qui naît, et c'est bien la galaxie qui
  fait l'effet. → Écarté.
- **Mesurer d'abord le coût réel** (temps jusqu'au premier rendu, sur les trois appareils), puis
  trancher. Écarté **pour cette décision-ci** : le coût est déjà connu et chiffré depuis le 28,
  il n'y a rien à découvrir. La mesure reste due, mais elle porte sur la **tenue** (framerate),
  pas sur l'opportunité.
- **Remonter le canvas tel qu'il était le 28** — montage immédiat, à l'atterrissage. → Écarté :
  c'est la régression, pas la décision.
- **Rétablir le canvas en montage DIFFÉRÉ, derrière la carte statique.** → **Retenu.**

### Décision

#### 1. Le §B est **révoqué**, et le coût est **assumé**

La galaxie revient sur l'Accueil. Le motif est **produit, pas technique** : la page d'entrée de
Massimo doit donner envie d'y être. Ce n'est pas un coût qu'on aurait sous-estimé le matin puis
redécouvert le soir — c'est le **même coût**, mis en balance avec autre chose, et tranché
autrement.

**Ce qui reste vrai du §B**, et qu'il ne faut pas jeter avec lui : l'Accueil est la page la plus
visitée, et un montage 3D **immédiat** y est indéfendable.

#### 2. Le canvas n'est **jamais monté au premier rendu**

C'est ce qui sépare cette décision de la régression du 2026-07-28.

- La **carte statique est la première peinture** — compte d'étoiles, pastilles de matières, appel
  à l'action. Elle n'est pas un état d'attente déguisé : c'est la page.
- Le canvas est monté **après**, à `requestIdleCallback` (repli `setTimeout` 600 ms — **Safari
  n'a pas `requestIdleCallback`, et c'est le navigateur de l'iPhone et de l'iPad de Massimo**,
  donc le repli est le cas courant, pas un cas de bord).
- Massimo voit sa page tout de suite, **puis** sa galaxie se construit.

#### 3. La 3D de l'Accueil est **contemplative**

`pointer-events-none`, `aria-hidden`. Toute la carte reste **une seule cible de clic** vers
`/galaxy` — décision du §B qu'on garde, parce qu'elle vaut : viser un lien de fin de carte est un
geste de précision inutile sur iPhone. Et sans ça, un drag de nœud à l'intérieur d'un lien
**déclencherait la navigation au relâchement**.

Rien de ce que montre le ciel n'est une information que le texte ne dit pas déjà : c'est du décor
animé, et il est annoncé comme tel aux lecteurs d'écran.

#### 4. Ce que l'Accueil rend : la **croissance complète**, étoile par étoile

> **Ce §4 a été CORRIGÉ dans la même session, au vu du rendu.** Première rédaction : « le cerveau
> et les matières, rien d'autre », au motif qu'il n'y aurait ainsi **aucune requête de plus** et
> qu'on réemploierait l'animation d'arrivée telle quelle. Livré, puis regardé : **ça ne fait pas
> l'effet.** Deux planètes qui glissent dans une bande de 190 px ne sont pas une galaxie qui
> grandit, et l'arrivée ne jouant qu'**une fois par session**, la page redevenait inerte dès la
> deuxième visite — exactement ce que cet addendum voulait corriger. Le raisonnement était
> économe et le résultat manquait la cible.

L'Accueil rend la **même construction que la modale** : les étoiles s'allument une par une depuis
`root`, matières et chapitres naissant juste avant leur première notion.

- **Une seule implémentation**, le hook `useGalaxyGrowth`, partagée avec la modale. Le rejeu est
  plein de pièges déjà payés — le principal étant de **ne pas recalculer le graphe sur
  l'horloge** — et les dupliquer serait les repayer.
- **Elle rejoue à chaque montage de l'Accueil**, et c'est l'objet même de la décision : une
  animation qui ne joue qu'une fois par session ne rend pas une page vivante.

⚠️ **Tension assumée avec le §6 de l'addendum ADR-0029** (« aucune animation ne démarre sur une
surface que Massimo n'a pas ouverte pour elle »). L'Accueil est l'**exception**, et elle est
écrite ici pour ne pas être découverte comme une incohérence dans six mois. Ce qui rend
l'exception tenable : le mouvement dure ~5 s, ne masque rien, ne demande rien, et n'a rien à
fermer.

⚠️ **Coût révisé : DEUX requêtes de plus** (`galaxy/all` et la frise avec `?with_skills=true`).
Elles partent **après la première peinture**, en même temps que le chunk 3D, et ne retardent donc
rien de ce que Massimo lit. La promesse « zéro requête de plus » de la première rédaction **ne
tient plus** — elle est remplacée par « rien avant la première peinture », qui est vérifié par
test.

⚠️ **Portée de session distincte** (`accueil` / `galaxy`) : conservée pour l'animation d'arrivée
de `/galaxy`, que l'Accueil ne doit pas consommer.

#### 4 bis. **Placement et composition** — corrigés au vu du rendu, eux aussi

- **La carte remonte** juste sous « Mission du jour », et passe en **pleine largeur**. Elle était
  en bas de page, dans une colonne étroite à côté de « Ma semaine » : la galaxie qui s'y
  construisait se voyait à peine. **Une animation qu'il faut chercher ne donne pas de vie à une
  page** — c'est l'objet même de cet addendum, et le placement le contredisait.
- **Le texte quitte le calque et passe en BADGES** : « Ma galaxie », le compte d'étoiles et les
  pastilles de matières forment une bande au-dessus du ciel. Plus **aucune superposition**.
  Deux défauts réels sont corrigés d'un coup : la galaxie passait derrière des paragraphes, et
  le texte se lisait sur un fond qui bouge.
- **Le ciel a sa propre bande**, dans le flux (300 px) et non plus en calque absolu. C'est ce qui
  garantit qu'aucun texte ne viendra s'y superposer, même si la carte grandit un jour.

#### 5. `prefers-reduced-motion` et absence de WebGL → **la carte statique, point**

Aucun canvas monté du tout. Ce n'est pas un réglage de confort (ADR-0024 §6).

#### 6. Le test de budget **change de nature**, il ne disparaît pas

`accueil.bundle.test.ts` interdisait **tout** `import()` du moteur 3D depuis l'Accueil. Cet
interdit-là n'a plus de sens ; ce qui en garde, c'est que le montage reste **rare, nommé et
différé**.

| ce qui est vérifié | avant | après |
|---|---|---|
| aucun import **synchrone** du moteur 3D | ✅ | ✅ **inchangé** |
| aucun fichier atteignable n'importe `three` | ✅ | ✅ **inchangé** |
| contre-épreuve du détecteur sur `/galaxy` | ✅ | ✅ **inchangé** |
| garde-fou du test lui-même | ✅ | ✅ **inchangé** |
| `import()` du moteur 3D | **interdit** | **liste blanche** (`HomeGalaxyCard`) |
| le point de montage le fait bien en `import()` | — | ✅ **cas ajouté** |

Ce que ce test protège encore, et qui est l'essentiel : qu'un **troisième** point de montage
n'apparaisse pas sans que personne ne le voie. C'était le mode exact de la régression de juillet.

### Conséquences

**Positives**

- L'Accueil est **vivant**, et c'est ce que l'addendum « Accueil vivant » cherchait sans y arriver.
- **Zéro requête réseau de plus** : le ciel se construit sur des données déjà là.
- Aucune chorégraphie nouvelle : c'est l'arrivée de `/galaxy`, réemployée.

**Négatives, assumées**

- **1,37 Mo repartent vers l'Accueil** — différés, jamais bloquants pour le premier rendu, mais
  téléchargés. Sur une connexion lente, c'est de la bande passante que Massimo ne demandait pas.
- **La décision du matin est révoquée le soir même.** Quatre addenda à l'ADR-0024 en une journée.
- **Une troisième surface monte `GalaxyCanvas`** (Accueil, `/galaxy`, modale de rejeu). Chaque
  changement du canvas se vérifie désormais à trois endroits.
- **Le garde-fou est plus faible** : une liste blanche se rallonge plus facilement qu'un zéro ne
  se franchit. C'est le prix d'un montage devenu légitime.

### Read-before-code

Sans objet — cet addendum a été **écrit après l'implémentation**, dans la même session, sur un
constat d'usage. Les points de vigilance sont dans le code, aux endroits concernés.

### Corollaires documentaires

- **Amendement 1** §B — marquer la révocation.
- `page-accueil.md` — la carte redevient un ciel.
- `zetis-galaxy.md` §11 — l'Accueil rejoint la liste des surfaces montant le canvas.
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` et `DATA_MODEL.md` **inchangés**.

### Hors périmètre

La mesure de tenue sur les trois appareils (dette de l'addendum « Galaxie animée », **inchangée et
maintenant plus pressante** : l'iPhone doit tenir la 3D sur sa page d'entrée) ; le rejeu depuis
l'Accueil, qui reste dans sa modale.

---

## Amendement 5 — Addendum « Constellations complètes » : tout est là, et tout tourne autour du centre — 2026-07-31

> Fusionné depuis **Amendement 5** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-31 (soir).

> **Addendum, pas nouvel ADR.** Il **révoque le §C** du premier addendum
> (**Amendement 1**), qui réduisait la vue par défaut de `/galaxy` au
> cerveau et aux matières.
>
> ⚠️ **Cinquième addendum à l'ADR-0024 en une journée**, et le **deuxième** à révoquer une
> décision prise le matin même. Ce n'est pas un signe de santé : le chantier Galaxy aura été cadré
> en marchant. Ce qui rend celui-ci défendable, et qu'il faut lire avant de conclure à
> l'inconstance : **le §C n'était pas une erreur de jugement, c'était une décision correcte sous
> une contrainte qui n'existe plus.**

### Contexte

Le §C avait été pris **au vu du rendu réel**, et son constat était juste : servir tout le graphe
produisait un **amas** — le cerveau à moitié enseveli sous les sphères, les libellés superposés,
aucune lecture possible. La vue par défaut avait donc été réduite à `root` + `subject`.

Ce que le §C attribuait au **nombre de nœuds** venait en fait de la **convergence**. Un moteur de
forces cherche un équilibre, pas une composition : quel que soit le nombre de nœuds, il les
tasse là où les forces s'annulent, sans égard pour la lisibilité.

Deux livraisons du même jour ont retiré cette contrainte, chacune pour ses propres raisons :

- l'addendum « Galaxie animée » §3 a posé les matières sur des orbites **calculées**, moteur
  éteint ;
- l'addendum ADR-0029 §2 réécrit a généralisé le mécanisme — positions calculées, nœuds
  **épinglés** (`pinned`), forces à zéro — pour que le rejeu puisse pousser sans ré-exploser.

Le filtre du §C protégeait donc contre un défaut qui **ne peut plus se produire**.

### Alternatives considérées

- **Garder le filtre et laisser les notions dans les constellations.** C'est l'état du matin. Mais
  Massimo doit **ouvrir une matière** pour voir ses étoiles : la carte d'ensemble ne montre jamais
  sa progression réelle, seulement le sommaire du programme. → Écarté.
- **Tout afficher, mais en rallumant le moteur de forces** maintenant qu'on maîtrise mieux le
  rendu. → **Écarté, et c'est le piège à ne pas retomber** : c'est littéralement l'amas du §C.
  C'est **parce qu'on ne rallume pas les forces** que tout peut être montré.
- **Tout afficher en orbites EMBOÎTÉES** (chapitres autour de leur matière, notions autour de leur
  chapitre), positions calculées et épinglées. **Essayé et écarté au vu du rendu** : on ne voyait
  plus le centre, seulement des petits amas dispersés. → Écarté.
- **Tout afficher sur des anneaux CONCENTRIQUES autour du centre**, un par étage, chaque matière
  gardant son secteur angulaire. → **Retenu.**

### Décision

#### 1. La vue par défaut rend la **galaxie entière**

Le cerveau, les matières, leurs chapitres, leurs notions. Le filtre `root` + `subject` de
`solarSystemOf` est **supprimé** ; la fonction garde son autre rôle, qui n'a jamais eu de rapport
avec la performance : donner sa planète à chaque matière, **y compris celles qui sont encore
vides**.

#### 2. Trois anneaux **concentriques**, tous **calculés**

> **Corrigé au vu du rendu, dans la même session.** Première version : orbites **emboîtées** —
> les chapitres autour de LEUR matière, les notions autour de LEUR chapitre. Lisible sur le
> papier, illisible à l'écran : on ne voyait plus le centre, seulement des petits amas dispersés.
> Tout gravite désormais autour du **même** centre.

| anneau | qui s'y trouve | rayon |
|---|---|---|
| 1 | les matières | 150 |
| 2 | les chapitres | 260 |
| 3 | les notions | 370 |

**Ce qui garde l'arbre lisible malgré les anneaux communs** : chaque matière reçoit un **secteur
angulaire**, et tous ses descendants restent dedans. On lit donc une part de tarte par matière,
du centre vers le bord — **la hiérarchie se lit en RAYON, l'appartenance en ANGLE**. Un espace est
laissé entre deux parts (78 % du secteur occupé) : sans lui, les matières voisines se touchent et
l'appartenance redevient illisible.

⚠️ Le nombre d'anneaux ne dépend **pas** du nombre de matières : il y en a trois, toujours — un
par étage. C'est ce qui distingue cette vue du système solaire du §C, où chaque matière avait son
orbite.

**Déterministe**, comme tout le reste : la galaxie de Massimo est la même à chaque visite, sinon
ce n'est pas la sienne. Aucun `Math.random`.

#### 3. L'arrivée sort chaque constellation **d'un seul tenant**

Tout ce qui descend d'une matière porte **le rang de sa matière** (`arrivalOrder`). Sans ça, les
nœuds sortiraient du centre un par un et la constellation se **disloquerait en vol**.

La durée se compte en **rangs distincts**, pas en nœuds : cent notions d'une même matière arrivent
ensemble et n'allongent pas la chorégraphie d'un cran chacune.

#### 4. Ce qui **ne change pas**

- Les **forces restent éteintes**. ⚠️ Ne pas les rallumer « maintenant qu'on sait faire » : le
  raisonnement est exactement inverse.
- Le **plafond de nœuds reste supprimé** (addendum « Galaxie animée » §1), et les **trois gardes**
  qui l'ont remplacé sont désormais plus utiles que jamais — c'est le flux doré qui tombe si un
  appareil décroche, jamais une étoile.
- Aucun contrat serveur touché : `GET /api/student/galaxy/all` servait **déjà** tout le graphe.
  Le filtre était **client**. Zéro route, zéro schéma, zéro migration.

### Conséquences

**Positives**

- La carte d'ensemble montre enfin **la progression réelle** de Massimo, et pas seulement le
  sommaire du programme. C'était l'intention de l'ADR-0024 depuis le début.
- Une **incohérence disparaît** : on avait supprimé un plafond « parce qu'il cachait la
  progression », tout en gardant un filtre qui cachait davantage.
- Le mécanisme est **celui déjà éprouvé** trois fois dans la journée. Rien de neuf à maintenir
  hors la fonction de disposition.

**Négatives, assumées**

- **Beaucoup plus de nœuds à l'écran** sur la vue par défaut. Rien ne converge, donc rien ne
  s'entasse — mais la **lisibilité à plusieurs centaines de notions n'a pas été vue en vrai**.
  C'est le point à regarder en premier.
- **Deuxième décision du matin révoquée le soir.** Cinq addenda en une journée.
- **La dette de mesure devient critique.** L'iPhone doit désormais tenir la galaxie **complète**
  sur `/galaxy` — et l'Accueil en montre déjà une. Si ça ne passe pas, ce sont les **particules**
  qui tombent, pas les nœuds.

### Corollaires documentaires

- **Amendement 1** §C — marquer la révocation.
- `zetis-galaxy.md` — la vue par défaut change de définition.
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` et `DATA_MODEL.md` **inchangés**.

### Hors périmètre

La mesure sur les trois appareils (dette ouverte, et plus pressante que jamais) ; le niveau de
détail adaptatif (montrer les notions seulement au-delà d'un certain zoom), qui serait la vraie
réponse si la lisibilité ne tenait pas — mais qui ne se décide **pas** avant d'avoir regardé.

---

## Amendement 6 — La page matière est un index de notions — 2026-08-01

> Fusionné depuis **Amendement 6** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-01, **livré le jour même** (slices A + B), puis **affiné en six tours au vu de
l'écran** (§Amendements). Amende l'**ADR-0017** sur un point (les activités notion-centrées
s'ouvrent en pleine page, pas en modale).

> S'appuie sur : `adr-0024` (doctrine de progression — un COMPTE jamais un pourcentage, aucun
> `mastery_score` affiché, aucun cadrage de perte), son addendum `galaxie-page-dediee` (le repli
> sans WebGL promis par `zetis-galaxy.md §11`), `adr-0011 §1` (substrat neutre à plusieurs
> consommateurs), `adr-0027` (l'orchestrateur oriente vers l'existant validé). Le geste
> « demander » relève de l'addendum `adr-0027-chat-orchestrateur` (Amendement 2).

### Contexte

`/subjects/:slug` était encore la page de la **Phase 1** : un launcher au grain matière —
en-tête « Niveau 5 · 320 XP », quatre tuiles dont trois inertes, un bouton « Faire un quiz » sans
`onClick` —, **entièrement mockée** sur `data/mock.ts`, sans un seul appel réseau.

Elle est **antérieure à la doctrine ADR-0024 §5** et la contredit sur trois points : elle affiche
un niveau, un XP par matière, et une « meilleure matière » qui met les matières en concurrence.

Deux choses ont changé depuis qu'elle a été écrite. La Galaxy a rendu la progression **ailleurs**,
donc cette page n'a plus à la porter. Et `zetis-galaxy.md §11` promet un **repli sans WebGL** —
une promesse que rien n'honorait.

### Décision

#### 1. La page devient l'index des notions de la matière

Chapitres validés → notions, chacune avec son état et **la panoplie complète des 7 activités**.
Elle rend le **même modèle** que la constellation, en liste : **elle EST** le repli sans WebGL.

Contrainte dure qui en découle : **aucun chunk 3D**, ni par import statique ni par `import()`.
Un test de budget le vérifie, et il interdit **les deux formes** — leçon du 2026-07-31, où le
canvas était déjà code-splitté et où ce qui coûtait était le **montage**. Un test limité aux
imports synchrones serait passé avant comme après, donc n'aurait rien protégé.

#### 2. Le prédicat de disponibilité est EXTRAIT, en version ensembliste

`GET /api/student/subjects/{slug}/panoply` s'adosse au prédicat sorti de `galaxy.notion_panel`.
`notion_panel` en devient le **consommateur mono-notion** et ne calcule plus rien.

**Interdiction d'un second prédicat.** Le correctif du 2026-07-30 a déjà prouvé qu'il diverge :
le cours était annoncé disponible sur `lesson_id is not None` d'un côté et sur
`content_markdown IS NOT NULL` de l'autre — une porte ouverte sur du vide, **et** une demande à
Papa jamais enregistrée. Deux verrous : un test de **cohérence croisée** (même `skill_id` → même
`available` sur les 7 kinds, quelle que soit la surface) et un test de **nombre de requêtes
constant**, indépendant du nombre de notions.

#### 3. Recherche LOCALE et lexicale — la sémantique reste au chat

Client-side sur l'index déjà chargé : accents pliés, réponse à la frappe, **zéro requête**.

La recherche **sémantique** reste au chat seul. La dédoubler diviserait `resolve_skill` entre deux
chemins et imposerait d'accorder deux seuils qui dériveraient.

#### 4. Panoplie entière, l'indisponible grisé, l'accent à la première activité FAISABLE

Reprend la révision du §4 (2026-07-28). Une action mise en avant doit **pouvoir être faite** :
l'accent ne va donc pas à la première de la liste, mais à la première disponible.

**Sauf ELI5 : il n'est plus offert sans cours validé.** C'est la résolution d'une contradiction
réelle — `notion_panel` le déclarait *toujours* disponible, là où l'orchestrateur refusait déjà
d'y router sans cours (ELI5 s'ancre sur le cours canonique et **dégrade vers le modèle** sans
lui). La règle descend **dans le prédicat partagé**, pas dans la page : portée par la page, elle
se serait re-dédoublée un cran plus haut. Asymétrie assumée : router ≠ offrir un outil.

#### 5. Rétrolien DÉRIVÉ du slug d'URL

Une brique partagée, montée sur toutes les surfaces filles d'une matière. **Aucun
`location.state`, aucune pile de navigation** : robuste au rechargement, au partage d'URL et au
retour physique iPhone — les trois moments où un état de navigation a déjà disparu.

#### 6. Ce que la page N'AFFICHE PAS

Retirés de la spec de Phase 1, par héritage du §5 : **niveau**, **XP par matière**,
**pourcentage**, **barre de progression**, **badge de maîtrise**, **« meilleure matière »** (mise
en concurrence), **série en cours** (le streak a été retiré le 2026-07-27), et **« Notions à
renforcer »** — qui expose les manques de l'**enfant** là où cette page décrit ceux du
**catalogue**.

`mastery_score` n'est **pas sérialisé** par la route. Une valeur numérique servie finit toujours
par être affichée.

#### 7. Amendement de l'ADR-0017 : pleine page, pas de modale

Les activités notion-centrées s'ouvrent en **pleine page**. L'arbitrage 0017/0019, ouvert de
longue date, est tranché — la Galaxy l'avait déjà tranché **de fait** avec son `navigate()`.

### Ce que le read-before-code a invalidé

**1. Le prompt de slice se contredisait.** Il exigeait que les tests de `notion_panel` passent
« sans modification » **et** que `eli5.available` suive le cours — or un test affirmait
`dispo["eli5"] is True` **sur ce cas exact**. Tranché en séparant les deux temps : extraction
d'abord (**668 tests verts, zéro modifié** — preuve jouée), puis bascule ELI5, qui a fait tomber
**exactement une** assertion.

**2. `NotionActionPanel` ne tire PAS `three.js`.** Le prompt l'affirmait. Le baril
`@zetis/ui/galaxy` est léger ; Three vit derrière `@zetis/ui/galaxy/canvas` et `brainGeometry.ts`,
tous deux **hors baril**. La page ne l'importe pas quand même — mais pour une autre raison : elle
partage sa **table de routes**, pas le composant.

**3. Cette table n'était couverte par AUCUN test.** Les cas existants ne vérifiaient que les
libellés, le `disabled` et l'accent. Un refactor de routage se serait fait sans filet : 9 cas de
caractérisation ont donc été écrits **d'abord**, contre le code d'alors.

**4. `app.routes` n'est pas à plat** dans cette version de FastAPI. Un test « telle route n'existe
pas » écrit dessus passe **à vide** — donc vert même si la route existe.

### Conséquences positives

- **Le repli sans WebGL existe enfin**, et un test l'empêche de redevenir une promesse.
- **Un seul prédicat de disponibilité** dans le dépôt, verrouillé par un test de cohérence croisée.
- **14 requêtes SQL, constantes** de 3 à 100 notions (mesuré).
- La page cesse de contredire la doctrine sur trois points.
- `zetis-galaxy.md §11` redevient exact.

### Coûts assumés

- Une page entière réécrite : rien n'est repris de la Phase 1 **sauf la route**.
- Deux moteurs de comptage coexistent : les comptes dérivés de la panoplie mesurent « ce qui est
  ouvrable depuis mes notions », les résumés de deck mesurent « ce que le catalogue contient ».
  **Ils divergent normalement** (`MAX(id)` par leçon) — écrit dans la spec pour que personne ne
  « corrige » l'écart.
- La règle ELI5 change un comportement **éprouvé live**.

### Hors périmètre

Carte **« Reprendre »** (dernier contenu ouvert) : **descopée**, aucune route ne sert cette donnée
— `last_notion` est global, sans lien, sur 30 jours. L'inventer aurait menti. · Session de quiz ou
de révision **ciblée par notion** (cibles `location.state`). · Recherche sémantique. · Lecture de
la file de demandes. · Réconciliation de `navigation.md`.

**Zéro table, zéro migration.**

### Amendements — six tours au vu de l'écran (2026-08-01)

Le user a lancé l'app et fait évoluer la page. Chaque tour a sa raison :

1. **Tous les chapitres sont repliés à l'ouverture.** Le premier s'ouvrait d'office : la page
   présentait le contenu d'un chapitre **choisi pour** Massimo. C'est lui qui décide où il entre.
   La recherche continue d'ouvrir d'office ce qu'elle trouve.
2. **Un témoin « N prêtes » sur l'en-tête replié** — sinon il fallait tout déplier pour trouver où
   travailler. *Prête* = la notion a **au moins une** activité faisable. Un **COMPTE**, jamais un
   ratio : « 2 sur 3 » serait un score, un test interdit tout dénominateur.
3. **À zéro, aucun témoin ET aucune atténuation.** L'option « chapitre grisé » a été écartée
   explicitement : un chapitre entier atténué se lit comme un reproche, là où une pastille creuse
   isolée reste factuelle.
4. **`GET /reviews/summary` expose `session_size` par matière.** `flash_size` est **global** et
   `due_count` est l'**arriéré** (interdit par `CLAUDE.md`). Le calcul vit là où vit
   `REVIEW_SESSION_MAX_SUBJECT` : recopier `8` dans un front l'aurait fait mentir le jour où le
   plafond bouge.
5. **Une bande « ce que ZETIS a pour cette matière »** remplace la carte « N cartes à revoir »,
   qui n'annonçait qu'un type sur six. **Zéro requête ajoutée** : la panoplie porte déjà les
   identifiants. `eli5` en est **absent** — il ne stocke rien, ce n'est pas un produit du
   catalogue mais une capacité.
6. **`capsule` et `quiz` affichent leur compte sans être cliquables** : aucune route par matière
   n'existe pour eux. Les envoyer vers la liste globale depuis une page de matière serait la
   trahison même que le rétrolien corrige ailleurs.

7. **RÉVISION de la décision 6, le soir même.** Le user a signalé « le KPI 1 quiz dans
   mathématiques ne marche pas ». L'audit de la base a montré que **le compte était juste** sur
   les 8 matières — ce qui était cassé, c'était l'**affordance** : la pastille était inerte par
   décision, mais **rendue exactement comme les cliquables**. Le signalement était fondé même si
   le code faisait ce qui était prévu.

   Deux corrections, parce que le défaut était double :

   - **`/quiz` accepte désormais `?subject=`** (patron déjà établi par `/revision` et `/eli5`), et
     porte le rétrolien. La bonne question devant une route manquante est **« peut-on
     l'ajouter ? »** avant « comment afficher qu'elle manque ? ».
   - **Une pastille non ouvrable doit se DISTINGUER À L'ŒIL** — bordure pointillée, atténuation,
     `aria-label` explicite. **Une chose qui ressemble à un lien doit être un lien.** Ne reste
     dans ce cas que `capsule` (`/capsules` est global, il n'existe ni `/capsules/:slug` ni
     `/capsules/:id`).

> ⚠️ **Piège de comptage, à ne pas « corriger ».** Les résolveurs serveur prennent `MAX(id)`
> groupé **par leçon** : la panoplie n'expose que la ressource la **plus récente** de chaque
> leçon, et plusieurs notions d'une même leçon portent le **même** `fiche_id`. Une leçon avec 3
> fiches validées compte **1** sur cette page et **3** sur `/fiches`. **Les deux sont justes.**
> Corollaire : dédupliquer par `Set` est obligatoire, sinon le compte gonfle d'autant de notions
> que la leçon enseigne.

### Point ouvert

**La page n'a jamais été vue à l'écran par l'agent** (navigateur non connecté de son côté). Tout
est prouvé par test, rien par l'œil. Restent à vérifier : la recherche à la frappe, l'accordéon au
clavier, le panneau, le seuil 620 px où la panoplie se masque, et les cinq rétroliens — dont celui
d'ELI5 **après rechargement**.

---

## Amendement 7 — La page matière porte l'effort de Massimo, et se range en onglets — 2026-08-11

> Fusionné depuis **Amendement 7** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

**Accepté — 2026-08-11, livré le jour même** (chantiers A + B + C), **mergé** : PR #114,
squash `4a320ae`, branche `feat/page-matiere-onglets` supprimée.

Cadré, livré et relu à l'écran dans la même session. **Aucune migration.** Deux endpoints
étendus (`panoply`, `/gamification/history`), un servi plus riche (`/student/galaxy`), un neuf
(`/student/subjects/{slug}/resume`).

> S'appuie sur : `adr-0024 §5` (doctrine de progression — un COMPTE jamais un pourcentage, aucun
> `mastery_score` affiché, aucun classement), son addendum `page-matiere-index-notions`
> (2026-08-01, dont il **révise une lecture** — voir §1), `adr-0027-chat-orchestrateur` (Amendement 2)
> (le geste « demander »), **Amendement 2** (contrat de série creuse de
> `/api/gamification/history`).
>
> Cadrage : **9 wireframes** noir & blanc produits par le user le 2026-08-11 — 1 pour `/matieres`,
> 8 pour `/subjects/:slug`.

### Contexte

La page matière livrée le 2026-08-01 fait bien ce pour quoi elle a été écrite : elle est l'index
des notions d'une matière, et le repli sans WebGL de la galaxie. Mais à l'usage, trois choses se
voient.

Elle est **pauvre en information utile pour un enfant** : hors l'arbre des chapitres, elle
n'annonce rien de ce que Massimo a fait dans cette matière. Elle est **peu dense** — une ligne de
notion tient un nom, un libellé d'état et sept pastilles de 8 px sur toute une largeur d'écran. Et
un chapitre à 55 notions, une fois déplié, est un mur : la recherche devient le seul moyen d'y
entrer.

Le user a produit neuf wireframes qui répondent à ces trois points, et a tranché sur un
quatrième : **« voir ses XP est positif pour Massimo »**.

### Décision

#### 1. Le XP et le niveau reviennent sur la page matière — révision d'une lecture, pas de l'ADR

L'addendum du 2026-08-01 écrivait que la page de Phase 1 « contredit l'ADR-0024 §5 sur trois
points : elle affiche **un niveau, un XP par matière**, et une "meilleure matière" ». Cette
lecture est **révisée sur les deux premiers points**. Le troisième est confirmé.

Le §5 dit : « **Aucun score par matière, aucun pourcentage, aucun classement.** […] La page répond
à "où j'en suis", elle **ne note pas Massimo** et **ne met pas ses matières en concurrence**. »

Il énonce donc **deux torts distincts**, et le XP n'en commet aucun **par lui-même** :

- **Noter Massimo.** Un score de maîtrise dit ce qu'il *vaut* ; il monte et il **descend**. Le XP
  dit ce qu'il a *fait* ; il ne peut que monter. C'est le seul nombre de l'app qui ne peut pas
  être une mauvaise note. `CLAUDE.md` l'autorise d'ailleurs explicitement (« Autorisé : XP ;
  niveaux ; badges pédagogiques »), et il est déjà affiché sur l'Accueil et dans la barre latérale.
- **Mettre les matières en concurrence.** Ce tort-là ne naît pas du nombre mais de sa
  **juxtaposition**. Sur la page d'**une** matière, il n'y a rien à côté de quoi se comparer.

D'où la règle, qui remplace un interdit global par une frontière :

> **Le XP et le niveau par matière sont autorisés sur la page d'une matière.**
> **Sur la grille `/matieres`, ils ne doivent jamais servir à ORDONNER ni à DÉSIGNER.** L'ordre
> des matières reste celui du programme. Aucun tri par XP, aucune « meilleure matière », aucun
> podium — ce qui reste exactement l'interdit du §5, appliqué là où il mord vraiment.

**Calculabilité vérifiée avant décision** : `xp_events.subject_id` existe et est peuplé (Maths
647, Français 430, Anglais 100, SVT 60, Histoire-Géo 20). Le niveau se dérive du **barème
existant** `_level_from_xp` (`gamification/service.py:86`, `XP_PER_LEVEL = 100`) — on n'en invente
pas un second.

#### 2. Ce qui reste interdit ne bouge pas : aucun pourcentage, jamais

Les maquettes portent un anneau « **66 % Maîtrisé** » et des barres « **72 % acquis** ». C'est le
point où le §5 est frontalement contredit, et il **n'est pas levé**.

L'anneau est conservé, son contenu change : **des comptes**, dans les libellés d'enfant déjà en
service (`starStyle`). Même information, même lecture d'un coup d'œil, sans note.

`mastery_score` reste non affiché et non sérialisé.

**Ce compte ne coûte aucune requête** : les états des notions sont déjà dans la panoplie chargée.

##### 2 bis. L'anneau ne montre QUE ce qui est allumé — corrigé à l'écran

> **Décision née de la relecture visuelle du 2026-08-11, sur données réelles. Aucun test ne
> l'avait vue** — et la version d'origine passait les 46.

Première version : l'anneau rendait **les cinq** états, « À découvrir » compris. Sur SVT, qui a
**78 notions « À découvrir » sur 80**, le résultat était un **disque gris à 97,5 %** avec deux
échardes de couleur. Il ne disait pas *voilà où tu en es*, il disait **tu n'as presque rien fait**
— un cadrage de perte, sur une surface enfant.

Le §5 tranche de lui-même : « la vue d'ensemble affiche un **COMPTE d'étoiles allumées** ». La
galaxie ne dessine pas le noir entre les étoiles.

- **`unknown` est exclu des segments ET de la légende.**
- **Le compte des non-commencées n'est affiché nulle part**, et c'est le point le plus important :
  « 2 travaillées » à côté de « 78 à découvrir » **reconstitue « 2 sur 80 »** — le ratio interdit,
  réintroduit par la porte de derrière. L'en-tête donne déjà le total du catalogue ; c'est un fait
  sur la matière, pas sur Massimo.
- **Rien de commencé → la carte ne s'affiche pas du tout.** Un anneau vide serait un réceptacle
  vide ; les cartes de chapitres juste en dessous sont la vraie invitation.

Deux test-verrous le tiennent, **vérifiés par sabotage** (réintroduire `unknown` les fait rougir
tous les deux).

#### 3. La page se range en onglets — et ce ne sont pas des tuiles

L'addendum du 2026-08-01 condamne le launcher : « **Pas un launcher d'outils** […] reproduire
leurs tuiles ici en ferait un doublon appauvri — c'est ce qui rendait la page inerte ».

Ce motif est **maintenu**, et il ne s'applique pas ici : ce qui rendait la Phase 1 inerte, c'est
que ses tuiles **ne menaient nulle part** (trois sur quatre sans `onClick`). Les onglets sont des
**liens vers les surfaces qui existent déjà**, construits sur la table de routes partagée
`subjectRouteFor` — aucune destination n'est inventée.

`Vue d'ensemble · Chapitres · Cours · Fiches · Cartes · Révisions · Quiz`

Les maquettes portent aussi « Missions » et « Progression » : **écartés**, faute de route par
matière. Missions reste global ; la progression garde le bouton « Voir en galaxie → ».

> ⚠️ **Un onglet qui ne mène nulle part est la faute que cet ADR interdit.** C'est le même
> signalement qu'en 2026-08-01 sur la pastille `quiz` du bandeau, cliquée en vain et lue comme une
> panne. Une chose qui ressemble à un lien doit être un lien.

##### 3 bis. « Mindmaps », pas « Cartes » — et jamais de barre d'onglets qui défile

Deux corrections **nées de la relecture**, l'une signalée par le user, l'autre mesurée à 390 px.
Aucune n'était visible d'un test.

- **L'onglet mindmap s'appelait « Cartes »**, juste avant « Révisions ». Le user a lu qu'**il
  manquait un lien vers les mindmaps** — le lien était là, sous un nom qui désigne déjà autre
  chose. Le mot « carte » sert en effet à deux surfaces dans l'app (`ACTION_UI` : « Reconstruire
  la **carte** » / « Réviser mes **cartes** »), et l'onglet en inventait un troisième usage.
  → L'onglet prend le nom que la barre latérale montre à Massimo tous les jours : **« Mindmaps »**
  (`navigation.ts`). La bande de catalogue suit : « 1 **mindmap** », qui ne se confond plus avec
  « 8 **cartes à revoir** » trois pastilles plus loin. Un test-verrou interdit désormais de nommer
  « carte » deux destinations différentes.

  > ✅ **Dette PAYÉE le 2026-08-12.** Elle était laissée hors périmètre sciemment : `ACTION_UI`
  > portait encore la collision (« Reconstruire la carte » / « Réviser mes cartes »), et cette
  > table est partagée par cinq surfaces (panneau de notion, pastilles, bande de catalogue,
  > Galaxy, chat) — la corriger dépassait cette page.
  >
  > **`mindmap` y dit désormais « Reconstruire la mindmap ».** La collision se lève de ce
  > côté-là et pas de l'autre : « carte » au sens SRS est le sens déjà tenu partout ailleurs
  > (« 8 cartes à revoir », « 5 cartes » sur une échéance, « Refaire un tour (3 cartes) ») et il
  > vient du modèle lui-même (`Card`, module `memory`). Rebaptiser la révision aurait déplacé le
  > problème et cassé un vocabulaire que Massimo a déjà appris. Le **geste** reste (« Reconstruire »
  > — c'est bien de mémoire qu'il la refait) ; seule la **chose** est renommée, du nom que la barre
  > latérale lui montre tous les jours.
  >
  > Le verrou du §3 bis ne regardait que la bande de catalogue et n'aurait jamais vu la collision
  > revenir par les quatre autres surfaces. Un second, posé sur la **table** elle-même, s'y ajoute :
  > `apps/frontend-massimo/src/lib/notionActionUi.test.ts`.
  >
  > Une chaîne identique dormait dans une **seconde** table (`MissionsPage.STEP_META`), dans un
  > champ `action` que **rien ne rendait**. Champ supprimé plutôt que renommé — les deux tables
  > restent distinctes, elles habillent deux choses différentes.

- **La barre d'onglets défilait horizontalement sous 500 px.** Mesuré à 390 px : elle se coupait
  après « Fiches », et **rien ne signalait qu'on pouvait faire défiler** — trois surfaces sur sept
  devenaient introuvables sur le poste le plus contraint de Massimo. C'est la version aggravée du
  défaut ci-dessus. → **`flex-wrap`**, jamais de défilement ni de menu déroulant. Vérifié dans le
  DOM : 7 onglets, **0 hors cadre**, 2 lignes, aucun débordement de page.
- Deux **cibles de touche sous 44 px** relevées au passage (« ← Matières » à 20 px, « Tout voir »
  à 16 px), alors que la spec de page l'exige. Corrigées ; plus aucune ne subsiste.

#### 4. « Mes thèmes » se bâtit sur les chapitres — parce que les thèmes n'existent pas

Les maquettes montrent six cartes courtes par matière (`Vocabulary`, `Grammar`, `Reading`…).
**Read-before-code** : la table `themes` contient **une ligne en tout**, et **zéro chapitre sur 79**
porte un `theme_id`.

Ce que les maquettes appellent « thèmes » sont des **domaines de compétence**, qui n'existent
nulle part dans le modèle. Ce qui existe, ce sont les **chapitres** — 8 à 13 par matière, aux
titres longs (`Le prétérit et les temps du passé`, et non `Grammar`).

Le bloc est donc bâti sur les chapitres réels et **s'appelle « Mes chapitres »**. On ne nomme pas
« thème » ce qui est un chapitre : le vocabulaire de l'écran doit être celui du modèle, sinon la
prochaine lecture de cet ADR croira que les thèmes ont été livrés.

**Corollaire, à ne pas retenter** : les maquettes affichent « XP 120 / 200 » **par thème**.
`xp_events` ne porte ni `theme_id`, ni `chapter_id`, ni `skill_id` — il s'arrête à la matière.
**Ce chiffre n'est pas rendu, et remplir `themes` ne suffirait pas** à le rendre calculable.

#### 5. L'index de notions ne disparaît pas — il passe sous un onglet

Aucune des huit maquettes ne reprend l'arbre chapitres → notions, la panoplie de sept pastilles,
ni **« Demander à ZETIS tout ce qui manque »**.

Ce dernier est le **seul geste que Massimo peut poser face à un contenu absent** (addendum
ADR-0027). Le retirer le laisserait devant un manque sans recours. L'ensemble est **déplacé sans
réécriture** sous l'onglet **Chapitres** — les tests de la page suivent le composant et **ne
doivent pas être adaptés pour passer**.

**Ce qui a été fait, exactement** : le fichier comptait **44 tests**. Seul le helper de rendu a
changé d'adresse (`?onglet=chapitres`), **aucune assertion des 43 autres n'a été touchée**. Le
44ᵉ — « n'affiche ni niveau, ni XP, ni pourcentage, ni barre de progression » — est **révoqué à
moitié** par le §1 et remplacé par **trois** tests : l'interdit de pourcentage sur chacune des
deux vues, et un test qui exige XP et niveau. Le fichier en compte donc **46**.

#### 6. Le rail droit — trois formulations des maquettes refusées telles quelles

Elles ne sont pas des détails de rédaction : chacune heurte une règle écrite de `CLAUDE.md` sur
l'interface enfant.

- **« Atteins le niveau 15 avant les vacances d'hiver ! »** — `CLAUDE.md` interdit l'**objectif
  imposé** (« un objectif subi se fuit, un objectif qu'on s'est donné se tient »). La carte reste,
  la **voix change** : elle affiche l'engagement que Massimo s'est **donné** (`goal_days`, module
  `motivation`). Rien à l'impératif.
- **« Quiz : School vocabulary — 5 questions à revoir »** — c'est l'**arriéré**. La page sert
  `session_size`, ce que la session donnera vraiment, **jamais `due_count`** : un compteur
  d'arriéré est la pression quotidienne interdite. Le bloc « À ne pas oublier » n'affiche que des
  échéances **réelles de l'agenda** (source exogène, cahier de texte).
- **« Risque DNB : élevé » · « Lacunes 5e : importantes » · « Points critiques »** (grille) —
  `CLAUDE.md` : « Massimo ne doit pas voir : les analyses parentales détaillées ; les diagnostics
  formulés de manière négative ». Ces données existent, dans
  `GET /api/progress/subjects/{id}/analysis` — une **route Papa**. Le diagnostic est **reformulé
  au positif** (« Points solides » / « À renforcer ») ; classer huit matières par risque serait de
  surcroît le classement que le §5 interdit.

  **Livré (chantier B), et plus loin que « reformuler ».** Read-before-code : la donnée du
  wireframe (`to_reinforce`, lacunes, risque) vit derrière `require_parent` — il n'existe **aucun
  équivalent côté enfant**, et en construire un reviendrait à créer un **classement des matières
  par faiblesse**, exactement ce que le §5 interdit. La grille dit donc **ce que Massimo tient**
  (`mastered`, un compte) et **rien de symétrique**. Ce qu'il y a à travailler a déjà une surface
  enfant, et elle est du bon côté : les **missions** — un geste, pas un verdict. Un test-verrou
  interdit tout champ de verdict (`weak`, `fragile`, `to_reinforce`, `gaps`, `risk`…) dans la
  charge utile.

  ⚠️ **Écart assumé avec l'arbitrage du user**, qui avait choisi « reformuler au positif » en
  gardant « Points solides / À renforcer ». Le read-before-code a montré après coup que la
  seconde moitié n'était pas constructible sans enfreindre le §5. La première moitié est livrée.

**Livré — et à coût nul côté serveur.** Read-before-code : tout existait.
`AgendaUpcomingItem` porte déjà **`subject.slug`**, donc le filtre par matière est **client**
sur une liste déjà bornée serveur — aucune route ajoutée. `UpcomingCard` et `WeekDots` sont
réutilisés tels quels ; `UpcomingCard` gagne seulement un `hideSubject` **additif** (défaut
`false` : l'agenda global ne bouge pas d'un pixel), parce que répéter « Mathématiques » sur la
page de Mathématiques ne dit rien et mange la largeur du rail — vu à l'écran.

Le contrat confirme la distinction du §6 à la source : `AgendaUpcomingItem.days_left` est
documenté comme un « décompte **SUBI** […] **jamais fabriqué** ». C'est exactement ce qui sépare
une échéance légitime (le professeur l'a posée) d'une pression inventée par ZETIS.

Trois cartes, trois états vides assumés : **pas d'objectif → une invitation, jamais un reproche** ;
**aucune échéance → aucune carte** (un « à ne pas oublier » vide installerait l'idée qu'il devrait
toujours y avoir quelque chose) ; **`week` non chargée → aucune carte**.

Sept test-verrous, dont deux **vérifiés par sabotage** : passer l'objectif à l'impératif, et
retirer le filtre par matière, les font rougir.

### Conséquences

**Backend — deux ajouts, aucune migration.**

- `galaxy/service.py` : bloc `subject_xp {total, level, into_level, for_next}` dans la panoplie,
  via un `SUM(xp_events.amount)` filtré `subject_id` passé dans `_level_from_xp`. Une requête SQL
  de plus (14 → 15) ; l'en-tête reste à **deux appels**.
- `gamification/router.py` : paramètre optionnel `subject` sur `/history`.
  🔴 **Le contrat de série creuse est conservé** — les jours sans gain restent **omis**, jamais à
  zéro (addendum « Accueil vivant » §A). La courbe se trace en **cumul**, qui ne redescend jamais ;
  une courbe journalière dense rejouerait exactement le cadrage de perte que ce contrat empêche.

**Coûts assumés.**

- Une lecture d'ADR révisée en dix jours. Elle est écrite ici pour ne pas se rejouer à l'envers
  dans six mois.
- Le XP par matière arrive sur `/matieres` sans garde technique : rien n'**empêche** un futur tri
  par XP, seule cette page d'ADR l'interdit. Un test-verrou sur l'ordre des matières est dû au
  chantier B.
- La page devient plus longue et plus chargée qu'un index. C'est le but ; ce n'est plus le même
  objet.

#### 7. « Reprendre » — livré, mais seulement pour ce qui se rouvre vraiment

Le doc de page refusait cette carte depuis le 2026-08-01 : *« aucune route ne sert cette donnée,
et l'inventer aurait menti »*. **Les deux réserves sont levées**, et l'une d'elles a démenti le
plan de chantier :

- ⚠️ le plan disait de filtrer `NON_ACTIVITY_EVENTS`. **C'est le mauvais filtre**, et c'est le bug
  déjà consigné dans `activity/events.py` (« se connecter suffisait à suspendre la production »).
  Le bon est `NON_WORK_EVENTS` — mais la question ne se pose plus : on part d'une **liste positive**
  de types, pas d'une exclusion ;
- les payloads réels **portent bien de quoi rouvrir** : `lesson_viewed → {lesson_id}`,
  `quiz_attempted → {quiz_id}`.

🔴 **Mais pas pour tous les types, et c'est la décision.** `fiche` n'a **aucun lien profond**
(`/fiches/:slug` ouvre le deck) et `revision` **LANCE une nouvelle session** — elle ne reprend
rien. Nommer un contenu précis pour atterrir sur une liste serait la dette « le libellé
sur-promet » déjà consignée sur `capsule_id`, et le bouton mort que l'ADR-0050 a fait retirer.
**Seuls `cours` et `quiz` sont servis.** Mieux vaut deux cartes vraies que quatre approximatives.

- **Le cours ouvre SA leçon** : `?lesson=<id>`, le lien profond de l'addendum ADR-0025 §15 ajouté
  pour l'agenda, réutilisé tel quel — il déplie le chapitre et met la leçon en avant. Vérifié à
  l'écran.
- **Le titre est résolu SERVEUR**, jamais lu depuis le journal : le payload fige le titre à
  l'instant du clic, donc il est périmé dès que Papa renomme.
- **Un contenu dévalidé ou archivé depuis n'est pas proposé.** Le gate de visibilité n'est pas
  réécrit : il vient de `_visible_notions`, le prédicat unique.
- ⚠️ **Aucune date, aucune durée, aucun compte.** Le serveur sert un `at` qui n'est pas rendu :
  « il y a 6 jours » ferait de la carte un rappel de ce que Massimo **n'a pas** fait. Frontière
  avec `activity`, dont la doctrine est inverse (« un enfant chronométré travaille pour le
  chronomètre ») : c'est un **signet**, pas une mesure.

Route : `GET /api/student/subjects/{slug}/resume`. Aucune migration.

> 🔴 **Un sabotage a démasqué un défaut de conception, pas seulement un test faible.** La première
> version faisait `kind = "cours" if event_type == "lesson_viewed" else "quiz"` : ajouter
> `fiche_viewed` à la liste l'étiquetait en **quiz**, et il n'était écarté que **par accident**
> (son payload n'a pas de `quiz_id`). Le test-verrou restait vert. Corrigé par une **table
> explicite** `event_type → (kind, clé de payload)`, sans aucune branche par défaut — le même
> sabotage rougit désormais.

**Hors périmètre.** Le remplissage de `themes` ; le sélecteur de classe des maquettes, **déclaré
faux par le user** ; la refonte de la barre latérale que les maquettes suggèrent ; le nettoyage de
`data/mock.ts`, devenu largement mort.
