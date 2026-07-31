# zetis-galaxy.md — Vue graphe de connaissances « ZETIS Galaxy »

> **Spec réconciliée avec le code le 2026-07-28.** La version précédente était un brouillon de fin
> juin 2026, resté quatre semaines dans un `git stash` et jamais confronté à l'implémentation.
> Trois de ses hypothèses étaient fausses (prérequis en base, route `/progress/skills`, absence
> d'onglet Progression) : elles sont corrigées ici. Décisions figées par **ADR-0024**.
> Complète `navigation.md` (lui-même non réconcilié — voir §12), `DATA_MODEL.md` et `API_SPEC.md`.
>
> ZETIS Galaxy est une **vue**, pas une nouvelle fonctionnalité de données : le graphe se dérive du
> modèle existant. Aucune table nouvelle, aucune migration.

## 1. Objet

ZETIS Galaxy est la représentation animée des connaissances de Massimo, pensée pour motiver.
Elle **devient le contenu de la page Progression** : même entrée de sidebar, même position. Ce
n'est pas une page de plus, c'est la page existante qui change de forme — et qui perd au passage
sa section « par matière » aujourd'hui **mockée**.

> **Route renommée le 2026-07-31** (addendum ADR-0024 §A) : `/progression` est devenue
> **`/galaxy`**, et le libellé de sidebar **« Ma Galaxie »**, à la même position. L'URL et le
> libellé décrivaient encore l'ancien contenu, alors que cette page ne mesure plus rien.
> `/progression` ne survit qu'en **redirection permanente**, jamais en page. La surface de
> progression reste **unique** — c'est ce que l'ADR-0024 protégeait ; le nom n'en faisait pas
> partie.

## 2. Métaphore et cadrage

Métaphore unique : une **galaxie qu'on allume**. Une galaxie s'étend et s'illumine ; il n'y a pas
de « trou », seulement des étoiles pas encore nées.

Règles de cadrage (non négociables, cf. `CLAUDE.md`) :

- Croissance, jamais manque. On parle d'« étoiles à découvrir », pas de « notions ratées ».
- **Pas de rouge.** Une notion non vue est sombre/neutre (« à découvrir »), pas rouge (« échec »).
- **Aucun pourcentage, aucun classement de matières.** La vue d'ensemble affiche un **compte
  d'étoiles allumées** (« 11 étoiles allumées en SVT »). Cette contrainte vient de la doctrine déjà
  en vigueur — « aucun score par matière » — et n'est pas négociable ici.
- L'animation récompense un **événement réel** d'apprentissage, jamais une boucle décorative.

Maquette de référence : `docs/frontend-massimo/mockup/maquette-massimo-galaxy.html`.

## 3. Hiérarchie visuelle

- **Galaxie** = l'ensemble des connaissances de Massimo (écran 1, vue d'ensemble).
- **Constellation** = une matière (le niveau qu'on zoome, écran 2).
- **Amas** = un chapitre — le regroupement d'étoiles à l'intérieur d'une constellation.
- **Étoile** = une notion (`Skill`).

> ⚠️ Le terme « **lien stellaire** » de la version précédente est **abandonné** : il désignait un
> prérequis acquis reliant deux étoiles, et cette donnée n'existe pas (§4).

## 4. Source de données — ce qui existe réellement

Le graphe se dérive du modèle existant, **sans nouvelle table**.

### Nœuds — trois natures

| nature | source | rôle |
|---|---|---|
| `subject` | `Subject` | cœur de la constellation |
| `chapter` | `Chapter` (via `school_year_subject_id`, année active) | amas |
| `skill` | `Skill` (`id`, `subject_id`, `name`, `level`) | étoile |

### Arêtes — structure uniquement, `type: "structure"`

Le chemin réel est **`Skill ← lesson_skills → Lesson → Chapter`** : `Chapter → Skill` (une notion
appartient à l'amas de sa leçon) et `Subject → Chapter`.

⚠️ Les arêtes `Subject → Chapter` sont **obligatoires**, pas un ornement : sans elles chaque
chapitre est une composante isolée du graphe, et un moteur de forces éloigne les composantes
disjointes — la constellation se disloque à l'écran (constaté). Le graphe doit rester **connexe
depuis le cœur**.

**Ce qui n'existe pas et ne doit pas être inventé :**

- `Skill.prerequisite_skill_ids` — **n'existe pas** : ni colonne, ni table de liaison, zéro
  occurrence de `prerequisite` dans `apps/backend/app`.
- `Skill.parent_skill_id` — la colonne existe (`apps/backend/app/db/models/school.py:117`) mais
  n'est **jamais écrite** : le seul créateur de `Skill` (`curriculum/service.py:501-521`) ne la
  renseigne pas. Elle vaut NULL partout. **Ne pas s'en servir.**

Un graphe de prérequis reste possible plus tard, mais c'est un **chantier pédagogique à part
entière** (générer la donnée, la faire valider par Papa) — hors périmètre, cf. §13.

### État lumineux d'un nœud

`SkillMastery` du couple (`student_id`, `skill_id`), lu via le **service d'évidence** déjà partagé
par cinq consommateurs : `evidence.mastery_by_skill(db, student_id=…)`
(`apps/backend/app/modules/evidence/service.py:35`). Ne pas réécrire ce calcul.

### Gate de visibilité

Comme toutes les routes élève : `Chapter.validation_status == "validated"` **et**
`Lesson.status == "validated"`. Une notion non validée n'est pas une étoile « à découvrir » —
**elle n'apparaît pas**.

## 5. États lumineux (mapping `SkillMastery.status`)

| `status` | Rendu étoile | Libellé enfant |
|---|---|---|
| `unknown` | sombre, contour léger | « À découvrir » |
| `weak` | faible lueur | « On commence » |
| `learning` | lueur moyenne | « En construction » |
| `solid` | brillante | « Bien acquis » |
| `mastered` | pleine, halo | « Maîtrisé » |

⚠️ **Un sixième statut existe en base : `in_progress`.** Il est écrit par
`missions/service.py:859` sur un verdict `review_later`, ne sort d'aucun `_status_from_score()`, et
un mapping à cinq branches le manquerait silencieusement. **Il se rend comme `learning`.**

⚠️ **`mastery_score` est sur 0–100**, pas 0–1. `evidence.mastery_by_skill()` renvoie la valeur
**brute** (`service.py:42`). Il peut moduler finement l'intensité **à l'intérieur** d'un état ;
il n'est **jamais affiché** à Massimo.

Aucun état n'est rouge ni négatif.

## 6. Contrat API — trois routes élève neuves

> La version précédente demandait d'étendre `GET /progress/skills`. **Cette route n'existe pas**,
> et le module `progress` est **Papa-only** (`Depends(require_parent)`,
> `progress/router.py:17-19`) : le réutiliser franchirait le mur de l'ADR-0002. De même, la
> matrice de couverture (`production/coverage.py`) est Papa-only et leçon-centrée — **ne pas y
> toucher**.

### `GET /api/student/galaxy` — vue d'ensemble

```json
{
  "subjects": [
    { "subject_id": 3, "name": "SVT", "slug": "svt", "lit": 11, "total": 16 }
  ]
}
```

`lit` = notions dont le statut n'est ni `unknown` ni absent. **Jamais de pourcentage.**

### `GET /api/student/galaxy/{subject_slug}` — une constellation

```json
{
  "subject": { "subject_id": 3, "name": "SVT", "slug": "svt" },
  "nodes": [
    { "kind": "chapter", "id": "chapter-12", "title": "La cellule" },
    { "kind": "skill", "id": "skill-88", "skill_id": 88, "name": "Mitose",
      "chapter_id": 12, "status": "learning", "intensity": 58 }
  ],
  "edges": [ { "from": "chapter-12", "to": "skill-88", "type": "structure" } ]
}
```

### `GET /api/student/galaxy/notion/{skill_id}` — le panneau d'actions

```json
{
  "skill_id": 88, "name": "Mitose", "status": "learning",
  "chapter_title": "La cellule", "subject_slug": "svt",
  "actions": [
    { "kind": "cours",    "lesson_id": 41 },
    { "kind": "eli5" },
    { "kind": "quiz",     "quiz_id": 77 },
    { "kind": "mindmap",  "mindmap_id": 9 },
    { "kind": "revision" }
  ]
}
```

**La panoplie COMPLÈTE est renvoyée** (7 activités), chacune avec son `available`
— révision de l'ADR-0024 §4 le 2026-07-28. Le client affiche tout et grise l'indisponible.

Une activité manquante n'est **pas un échec de Massimo** : c'est du contenu que Papa n'a pas
encore produit. D'où trois règles : l'entrée grisée n'est pas cliquable, son libellé ne formule
jamais un échec, et l'accent visuel va à la première activité **réellement faisable**.

Réutiliser les résolveurs déjà écrits, ne pas en refaire :
`_resolve_mission_quiz_id(db, skill_id)` (`missions/service.py:76`),
`_resolve_mission_mindmap_id(db, skill_id)` (`:98`),
`_skill_lesson(db, skill_id)` (`reports/service.py:358`),
`_existing_fiche(db, lesson_id)` (`:371`).

## 7. Accès

1. **L'onglet « Ma Galaxie »** — accès principal, il existe déjà (renommé le 2026-07-31, même
   position).

> **Vue d'arrivée, révisée le 2026-07-31** : `/galaxy` s'ouvre sur un **système solaire** — le
> **cerveau au centre** et les **matières seules**, chacune posée sur une orbite dessinée, dans
> un plan aplati vu en surplomb. Servir tout le graphe à une simulation de forces produisait un
> amas où le cœur était enseveli. Les **matières encore vides ont aussi leur planète** : une
> matière absente se lirait comme une matière qui n'existe pas.
>
> Un **bandeau de planètes CSS** surmonte le graphe (fond spatial animé, couronne solaire dorée
> ∝ étoiles allumées). **Un seul clic** ouvre la matière ; il reste affiché dans une
> constellation et sert alors de **sélecteur de matière**.
2. **Le bandeau XP** (`MassimoBannerHeader.tsx`, présent sur toutes les pages) devient
   **cliquable** → `/galaxy`. Coût quasi nul.
3. **Hors v1** : l'aperçu sur l'Accueil et l'annonce discrète « +1 étoile » en fin de mission.
   Bonnes idées, mais elles touchent deux autres pages — cf. §13.

## 8. Déclencheurs d'animation

L'illumination est pilotée par les faits, pas par un timer. La table `learning_events` existe
(`db/models/progress.py:145`) et porte `skill_id` sur les types qui comptent ici :
`reverse_eli5`, `mission_verdict`, `quiz_attempted`.

En v1, l'état est **lu au chargement de la page** : une étoile brille parce que son
`SkillMastery.status` a bougé, donc parce qu'un événement réel l'a fait bouger. L'animation
**temps réel** (l'étoile qui s'allume sous les yeux de Massimo à la fin d'une mission) suppose une
notification poussée : **hors v1**.

## 9. Scope, appareils et performance

Massimo travaille sur **trois postes** : iPhone, iPad, et un MacBook dédié à l'école. Aucun n'est
secondaire. Ce sont l'iPad et le MacBook qui donnent son sens à une vue 3D (surface, GPU, pointeur
précis) ; l'iPhone est la **contrainte** à honorer, pas la cible unique.

- **Une constellation par matière.** Jamais un graphe global de toutes les matières en
  force-directed : illisible partout, et lourd même sur MacBook.
- La vue d'ensemble affiche les matières, pas leurs notions.
- **Plus de plafond de nœuds.** `GALAXY_MAX_NODES` (40 / 90 / 150) et son repli ont été
  **supprimés** le 2026-07-31 (addendum ADR-0024 « Galaxie animée » §1) : le plafond cachait à
  Massimo une partie de sa propre progression selon un critère matériel, et ses valeurs n'avaient
  jamais été mesurées. **Trois gardes** le remplacent, et elles visent le vrai coût par image :

  | garde | où | ce qu'elle fait |
  |---|---|---|
  | budget de **particules** | `galaxyGraph.ts` — `particleAllowance()` | répartit `PARTICLE_BUDGET` (160) sur les liens allumés : 2 → 1 → 0 par fil. C'est un objet animé **par lien à chaque frame** qui coûte, pas une sphère posée |
  | coupure sous **34 FPS** | `GalaxyCanvas` — `PARTICLE_FPS_FLOOR` | mesure le framerate réel sur une seconde pleine et éteint le flux doré. Sans retour en arrière : un seuil franchi dans les deux sens ferait clignoter le décor |
  | moteur **arrêté** | `cooldownTicks` | la simulation s'arrête une fois stabilisée ; la rotation caméra continue, elle est quasi gratuite |

  ⚠️ **Ce qui borne la vue par défaut n'est pas — et n'a jamais été — le plafond**, mais le filtre
  `root` + `subject` du §C (`lib/solarSystem.ts`, testé). Les deux ont été confondus une fois. Le
  filtre reste : c'est une décision de composition prise sur rendu réel.

  ⚠️ **Écart doc/code relevé le 2026-07-31** : l'addendum supposait le repli « amas + dépliage »
  probablement jamais écrit. **Il existait bel et bien** — `GalaxyPage` ne rendait plus que les
  chapitres au-delà du seuil et affichait « Beaucoup d'étoiles ici », et la modale de rejeu
  retirait **toutes les étoiles**, c'est-à-dire l'objet même du rejeu. Les deux sont partis avec le
  plafond.

- **Arrivée de la vue par défaut** — le cerveau apparaît seul (`CORE_IN` 420 ms), puis les matières
  naissent au centre et rejoignent leur créneau (`PLANET_STAGGER` 80, `PLANET_TRAVEL` 700,
  `easeOutCubic`), l'anneau se traçant **derrière** sa planète (`ORBIT_DRAW` 600). Ordre du
  **programme**, jamais chronologique ni par volume. **Une fois par visite** (`sessionStorage`) :
  le retour d'une constellation restitue la composition d'emblée. `prefers-reduced-motion` →
  composition finale immédiate. Rythme et invariants : `arrivalTween.ts`, testés.

  ⚠️ **Écart assumé avec la lettre de l'addendum** (§3 : « animer `x/y/z`, n'affecter `fx/fy/fz`
  qu'à l'arrivée »). En mode orbite le moteur est éteint, et la lib ne recopie `x/y/z` vers les
  objets 3D **que pendant un tick de simulation** : un `x` animé sur un moteur arrêté ne déplace
  rien. On écrit donc les trois sur la position **courante** du tween. L'interdit réel est
  respecté — ce qui téléporte, c'est d'épingler la position **finale**.

- **Dette ouverte** : la mesure sur les **trois appareils** reste due, sur un **pire cas semé**
  (référentiel validé complet), pas sur les ~37 étoiles d'aujourd'hui. L'iPhone tranche. S'il ne
  suit pas, ce sont les **particules** qui tombent, jamais les nœuds.
- La mise en page suit les trois formats : panneau **latéral** sur desktop et tablette en paysage,
  **feuille basse** en portrait et sur téléphone.

## 10. Techno

- **`react-force-graph-3d`** (Three.js encapsulé), chargé en **`lazy()`** sur la seule page
  `/galaxy`. Il fournit nativement le rendu 3D animé, le drag de nœud avec élasticité des
  liens, `onNodeClick`, le halo par nœud et la caméra orbitale.
- Composant **`@zetis/ui/galaxy`**, exporté en **sous-chemin** — exactement la raison pour laquelle
  React Flow n'est pas ré-exporté à la racine de `packages/ui` (`package.json:9-12`) : ne pas
  imposer Three.js aux bundles qui n'en veulent pas.
- Contrat repris de `MindmapWorkspace` : **zéro fetch, zéro logique métier, données en props**.
- **`@xyflow/react` + `elkjs` restent le moteur des mindmaps** (ADR-0016) et ne sont pas touchés.
  Deux moteurs graphe coexistent : un arbre 2D éditable d'un côté, une galaxie 3D contemplative de
  l'autre. C'est assumé, cf. ADR-0024.

## 11. Interaction et accessibilité

- **Rotation** — `controlType="orbit"` (et non le `trackball` par défaut : c'est le seul type de
  contrôle qui expose `autoRotate`). La constellation tourne sur elle-même
  (`autoRotateSpeed = 1.2`, ~50 s par tour) et **s'arrête dès qu'une étoile est ouverte** — sinon
  la cible que Massimo vient de toucher s'échappe pendant qu'il lit. Aucune boucle d'animation à
  écrire : le moteur de rendu appelle déjà `controls.update(delta)` à chaque frame.
  ⚠️ **Piège** : le `<ForceGraph3D>` n'est monté que lorsque `width > 0`. L'effet qui active
  `autoRotate` doit donc dépendre de `width`, sinon il s'exécute avant le montage, ne trouve aucun
  contrôle, n'est jamais rejoué — et la rotation ne démarre jamais (bug réel, corrigé).
- **Flux doré** — les liens menant à une notion **travaillée** (statut ≠ `unknown`) sont dorés et
  parcourus de particules ; les autres restent sombres et immobiles. Le **nombre** de particules
  par fil est réparti sous le budget global (§9) et tombe à zéro si l'appareil décroche : c'est le
  **décor** qui se dégrade, jamais une étoile de Massimo.
  ⚠️ **`graphData` n'est PAS exposée sur le ref** de `react-force-graph-3d` 1.29.1 : `methodNames`
  en lie 18, et celle-ci n'y figure pas. Conséquence constatée le 2026-07-31 —
  `handleEngineStop` tente de déclouer le soleil via `graphRef.current?.graphData?.()`, l'appel est
  avalé par l'optionnel, et **le soleil n'a jamais été déclouté** depuis le 2026-07-28. Laissé en
  l'état (le rendre effectif changerait un comportement en place, hors périmètre) — mais consigné
  ici pour que personne ne perde une heure à comprendre pourquoi le code semble faire ce qu'il ne
  fait pas. Corollaire : tout placement voyage par les **données**, jamais par l'API du ref. L'or est une **information**,
  pas un décor : la galaxie se remplit d'or à mesure que Massimo progresse, et la règle §2
  (« l'animation récompense un événement réel ») tient **sans amendement**.
  ⚠️ Un lien `subject → chapter` est doré **ssi** l'amas contient au moins une étoile allumée —
  sans quoi des segments dorés flotteraient, détachés du cœur.
- **KPI cliquables** — les cinq états portent leur **compte** d'étoiles (jamais un pourcentage) et
  filtrent la constellation. Ce qui n'est pas concerné est **atténué, jamais masqué** : masquer
  ferait sauter la disposition. Re-cliquer efface. Un état à 0 n'est pas cliquable.
- **Le soleil de la constellation** — le nœud `subject` est une sphère dorée ombrée, **à peine
  plus grosse qu'un amas** : dans l'espace, une étoile ne se distingue pas par sa taille mais par
  son éclat. Couronne = deux coques `BackSide` additives **serrées et discrètes**, avec une
  pulsation de faible amplitude (coupée en `prefers-reduced-motion`).
  ⚠️ **Émission faible obligatoire** : un matériau très émissif s'éclaire uniformément — plus de
  côté clair ni de reflet, la sphère redevient un disque plat (constaté à 0.9, corrigé à 0.25).
  ⚠️ **Pas de pictogramme sur le soleil** : un panneau face caméra est plat par construction et
  masque le limbe ombré. Entre nommer la matière deux fois et obtenir un vrai volume, on garde le
  volume — le nom est écrit au-dessus, et le pictogramme reste sur l'écran d'ensemble.
  Il est **épinglé au centre le temps de la mise en place seulement**, puis relâché à
  `onEngineStop` : il reste où il est, mais redevient **déplaçable** comme n'importe quelle étoile.
- **Sphères 3D** — chaque nœud est un `Mesh` construit ici (`MeshPhongMaterial` : reflet
  spéculaire + émission proportionnelle à l'état). Le matériau par défaut de la lib est purement
  diffus et son éclairage très ambiant : sans reflet ni dégradé, une sphère se lit comme une
  **pastille découpée**. On baisse l'ambiante et on renforce la directionnelle via `lights()`.
  ⚠️ En construisant les objets soi-même, `nodeVal` / `nodeColor` / `nodeRelSize` **ne
  s'appliquent plus** : reproduire la formule de la lib (`∛volume × rayon de base`), sinon les
  étoiles rapetissent d'un coup et redeviennent inatteignables au doigt.
- **Recherche** — champ libre au-dessus du graphe, **local à la constellation ouverte** (aucune
  requête, réponse à la frappe). Insensible à la casse **et aux accents** — Massimo tape
  « elyse », pas « Élysée ». Les correspondances s'allument, le reste s'atténue, et la caméra
  **cadre toutes les trouvailles d'un coup** : il voit du même regard combien il y en a et où.
  Une recherche en cours **remplace** le filtre par état (deux mises en évidence simultanées
  seraient illisibles). Sans résultat, la caméra ne bouge pas et le message renvoie vers une
  autre matière — jamais un échec.
- **Plein écran** — un clic **dans le vide** du cadre agrandit la constellation à toute la page ;
  les KPI restent (ils sont la lecture du graphe, pas un ornement) ; on en sort par un bouton `×`
  dessiné ou par `Échap`. Prévu pour des graphes qui vont se densifier.
  ⚠️ Le même clic **referme d'abord le panneau** s'il est ouvert — on n'agrandit pas pendant
  qu'une notion attend d'être lue. Et la vue intégrée est **démontée** en plein écran : deux
  `GalaxyCanvas` vivants, ce sont deux contextes WebGL pour rien.
- **Planètes de matières** (écran d'ensemble) — sphères CSS qui tournent sur leur axe, **sans
  Three.js** : cet écran ne doit pas payer le chunk 3D. Chacune porte son **pictogramme de
  marque** (`subjectIconFor`, le même que chez Papa), **fixe** au centre pendant que la surface
  tourne derrière — un pictogramme qui défile devient illisible la moitié du temps, or c'est lui
  qui permet de choisir où aller. **Jamais d'emoji** : `design-system.md §Pictogrammes de matière`
  l'interdit, et le dessin d'un emoji change selon l'OS.
- **Étirer** — `enableNodeDrag` : le nœud tiré étire ses liens, le reste de la constellation suit.
  Pas de persistance des positions en v1 (contrairement aux mindmaps qui stockent en `localStorage`).
- **Cliquer** — `onNodeClick` ouvre le **panneau d'actions** (§6, troisième route). Un clic sur le
  fond le referme. Le panneau navigue selon le patron déjà en place : query params pour ELI5
  (`/eli5?skill_id=N&name=…`, seule surface notion-adressable aujourd'hui), et
  `navigate(route, { state })` pour Quiz et Révision, comme `RevisionPage.tsx:50-53`.
- **`prefers-reduced-motion`** — obligation ferme : moteur de forces figé après stabilisation, pas
  d'auto-rotation de caméra, halos statiques.
- **Repli sans WebGL** — rendre la **liste des notions par chapitre** avec leurs états. La
  progression de Massimo ne doit jamais devenir inaccessible.
- **Tactile et pointeur à parité** — étirer un nœud, tourner la caméra et ouvrir le panneau doivent
  marcher au doigt (iPhone, iPad) comme au trackpad (MacBook). **Rien d'essentiel ne peut dépendre
  du survol** : il n'existe pas au tactile. Cibles de touche ≥ 44 px sur les étoiles, quitte à
  élargir la zone cliquable au-delà du halo visible.
- Chaque étoile porte un `aria-label` « nom de la notion — libellé d'état ».

## 12. Divergence connue avec `navigation.md`

`docs/frontend-massimo/navigation.md` vient du même stash et **n'est pas réconcilié**. Il décrit une
navigation à 5 verbes et interdit un onglet Progression. Le code en a 12 depuis quatre semaines, et
cet onglet **existe** — il s'appelle « Ma Galaxie » depuis le 2026-07-31. **L'existant prime**
(ADR-0024). Réconcilier `navigation.md` est un autre chantier, resté au `BACKLOG.md` : il
contredisait déjà l'existant sur l'onglet, il le contredit désormais aussi sur son nom.

## 13. Hors v1 (explicite)

- Graphe de **prérequis** entre notions — la donnée n'existe pas, la créer est un chantier
  pédagogique en soi.
- **Aperçu sur l'Accueil** et **annonce « +1 étoile »** en fin de mission.
  > Cette ligne a été **contredite sans être corrigée** par l'amendement du 2026-07-28, qui a posé
  > un graphe global 3D sur l'Accueil. L'addendum du 2026-07-31 **révoque** cet amendement, et la
  > slice B l'a appliqué : `HomeGalaxyPreview` est **supprimé**, l'Accueil rend une carte-bouton
  > statique. La ligne **redevient exacte, dans le document comme dans le code**.
- **Animation temps réel** poussée par un événement.
- Persistance des positions de nœuds.
- Toute agrégation par matière autre qu'un **compte** d'étoiles allumées.

## 14. Pour Claude Code

À faire :

- Dériver le graphe de `skills` / `lesson_skills` / `lessons` / `chapters` + `skill_mastery` ;
  **aucune table « galaxy »**, aucune migration.
- Créer **trois routes élève** sous `/api/student/galaxy` ; s'appuyer sur `evidence.mastery_by_skill()`.
- Mapper `status` → luminosité selon §5, **y compris `in_progress`**, sans rouge.
- Rendre en 3D via `react-force-graph-3d` en `lazy()`, dans `@zetis/ui/galaxy`.
- N'exposer une action que si son contenu validé existe.

À éviter :

- Toucher aux modules `progress` et `production` (Papa-only).
- Utiliser `parent_skill_id` ou inventer des prérequis.
- Afficher un pourcentage, un classement de matières, ou une couleur d'échec.
- Modifier `@zetis/ui/mindmap` ou `@xyflow/react`.
- Faire de la Galaxy un onglet supplémentaire.
