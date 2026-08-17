---
id: "0029"
titre: "Rejeu animé de la galaxie : voir son chemin, pas seulement son état"
type: surface
statut: accepte
date: 2026-07-31
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0024", "0028"]
---
# ADR-0029 — Rejeu animé de la galaxie : voir son chemin, pas seulement son état

## Statut

Accepté — 2026-07-31.

> Nouvel ADR plutôt qu'un 3ᵉ addendum à l'ADR-0024 : il n'y révise rien. L'ADR-0024 décide
> **comment la galaxie est rendue** ; celui-ci ajoute une **capacité** qui n'existait pas —
> rejouer le temps. Les deux se composent, aucun ne se contredit.

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-07-31 | Addendum « Construction depuis root » : une croissance, pas une lecture | Accepté | — |
> | 2 | 2026-08-04 | Addendum « La galaxie dans le bandeau » : le chrome cesse de décorer pour rien | Accepté | — |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

Depuis le 2026-07-31, l'Accueil montre le chemin parcouru de deux façons — « Mon ciel » (un
calendrier des jours de gain) et « Mon chemin » (une frise cumulative). Toutes deux sont
**statiques** : elles disent *combien*, jamais *comment c'est arrivé*.

La demande : associer à « Mon ciel » une vue **3D animée** de la galaxie qui montre sa
progression par période, **pour motiver Massimo**.

Ce que le read-before-code a établi :

- **La donnée existe déjà, et elle est même déjà calculée.** `galaxy/service.py:394` fait un
  `select(LearningEvent.skill_id, func.min(created_at)).group_by(skill_id)` — soit exactement
  « quand chaque notion a été allumée pour la première fois » — puis **jette le `skill_id`** pour
  ne garder qu'un compte. Il n'y a rien à calculer, seulement à cesser de jeter.
- **Le rejeu ne peut que monter.** Il se dérive de `learning_events`, append-only, jamais
  réécrit — jamais de `SkillMastery`, qui régresse. Une galaxie qui s'assombrit serait le cadrage
  de perte que ZETIS bannit ; ici c'est structurellement impossible.
- **Le lieu est le vrai coût.** Deux chantiers du même jour ont sorti Three.js (1,37 Mo) de
  l'Accueil, et un test de budget monte la garde.

## Alternatives considérées

- **Poser la vue 3D sur l'Accueil.** Rouvrirait le §B de l'addendum pour la troisième fois en un
  jour et casserait le test de budget. → **Écarté.**
- **Mettre le rejeu sur `/galaxy` seulement**, qui paie déjà Three.js. Coût nul, aucun interdit
  touché — mais l'animation n'est alors vue que par un enfant *déjà* sur `/galaxy` : son effet
  motivant sur la page d'atterrissage est nul, et c'était la demande. → Écarté.
- **Rendre de vraies captures vidéo côté serveur** (`worker-media`/Remotion + MinIO, comme les
  capsules). C'est littéralement « des screenshots animés », et c'est partageable — mais cela
  crée un pipeline de rendu, du stockage, et une invalidation : la vidéo périme dès la prochaine
  notion travaillée. → Écarté (réévaluable si un jour on veut *partager* le rejeu).
- **Quelques états figés qu'on fait défiler.** Plus simple, plus lisible sur iPhone, mais
  l'effet recherché est le mouvement. → Écarté.
- **Une modale ouverte depuis « Mon ciel », rejeu 3D en direct.** → **Retenu.**

## Décision

### 1. Le rejeu vit dans une **modale**, et le 3D n'arrive qu'au clic

- « Mon ciel » gagne une action : **« Revoir ma galaxie grandir »**.
- La modale est chargée en `lazy()`, **et elle seule** charge le canvas — également en `lazy()`.

**Double `lazy()`, et ce n'est pas une coquetterie.** Le graphe d'imports **statiques** de
`AccueilMassimoPage` ne doit atteindre ni la modale ni le canvas ; c'est ce qui fait que rien
n'est téléchargé tant que Massimo n'a pas cliqué. Le test de budget existant
(`accueil.bundle.test.ts`) reste **vert sans être assoupli** — il parcourt les imports statiques,
donc il ne voit pas la modale, et c'est correct : ce qu'il protège, c'est le **premier paint**.

⚠️ **Ne jamais importer `GalaxyReplayModal` statiquement depuis l'Accueil.** Ce serait remettre
1,37 Mo sur la page d'atterrissage sans qu'aucun test ne le voie — la régression exacte du
2026-07-28, en pire, parce qu'elle passerait sous le radar qu'on a posé pour elle.

Un test de non-régression complète le budget : **l'Accueil ne rend pas la modale au montage.**

### 2. Le contrat : `first_lit` par notion, jamais un état passé reconstitué

```
GET /api/student/galaxy/timeline?with_skills=true
→ { points: [...], total: N, skills: [{ "skill_id": 88, "date": "2026-06-30" }] }
```

- **Même requête, même service** : on cesse simplement de jeter le `skill_id`. Aucune table,
  aucune migration, aucun coût de calcul supplémentaire.
- Le paramètre est **opt-in** : les consommateurs actuels de `timeline` (la frise) ne voient
  aucun changement de charge utile.
- **Ce qu'on ne sert pas, et pourquoi** : l'état de maîtrise à une date passée. Il existe
  (`skill_mastery_history`, ADR-0028) mais il est **Papa-only**, et il **régresse** — un rejeu
  bâti dessus montrerait des étoiles s'éteindre. Le rejeu ne connaît que deux états : **pas
  encore née**, et **allumée**.

### 3. La frise devient la **barre de lecture**

> ⚠️ **RÉVISÉ le 2026-07-31** par **Amendement 1** §4. La frise
> n'est plus une commande mais un **témoin** : elle se trace en synchronisation avec les étoiles,
> et il n'y a **plus ni curseur ni drag** — un seul bouton, « Revoir ». On ne peut donc plus
> revenir en arrière dans le temps ; c'est le prix assumé de la fluidité, et le curseur n'était
> de toute façon utilisable qu'à la souris. Ce qui suit décrit l'état **d'avant**.

« Mon chemin » ne disparaît pas et ne se dédouble pas : dans la modale, la même courbe sert de
piste de lecture. Le curseur avance avec le rejeu ; Massimo peut le tirer pour revenir en
arrière.

Sur l'Accueil, la frise **reste telle quelle** — elle se lit d'un coup d'œil sans rien ouvrir,
et c'est une information passive qu'on ne veut pas perdre.

### 4. Ce que le rejeu ne fera jamais

> ⚠️ **REFORMULÉ le 2026-07-31** par l'addendum « Construction depuis root » §6, sur **un seul
> point** : l'interdit d'autoplay visait l'animation **subie sur la page d'atterrissage**. Dans
> une modale que Massimo vient d'ouvrir exprès, le démarrage immédiat **est** l'objet du clic.
> Nouvelle rédaction : *aucune animation ne démarre sur une surface que Massimo n'a pas ouverte
> pour elle.* Le repli `prefers-reduced-motion` devient **état final d'emblée** — l'ancienne
> formulation renvoyait à un curseur qui n'existe plus. Les autres interdits sont **intacts**.

- **Aucune date lisible pendant le rejeu.** Un curseur, des mois — jamais « 12 juillet », jamais
  « il y a N jours ». La page entière tient déjà cette règle.
- **Aucune période vide annoncée.** Le rejeu avance dans le temps ; il ne dit pas « rien ici ».
- **Aucun rythme imposé** : lecture déclenchée par Massimo, jamais en autoplay à l'ouverture de
  l'Accueil.
- **Aucune comparaison** entre deux périodes, aucun « tu as ralenti ».
- `prefers-reduced-motion` → le rejeu ne s'anime pas : on affiche l'état final, et le curseur
  reste manipulable à la main.

## Conséquences

**Positives**

- Massimo voit **son** histoire, pas un état. C'est le seul endroit du produit qui raconte.
- **Coût de démarrage inchangé** : l'Accueil reste à zéro Three.js au premier paint.
- Zéro table, zéro migration, zéro nouveau calcul serveur.

**Négatives, assumées**

- **Un clic pour y accéder** — assumé : un rejeu qui se déclencherait tout seul sur la page
  d'atterrissage serait une animation subie, et coûterait le chunk qu'on vient d'en sortir.
- **Une troisième surface qui monte `GalaxyCanvas`** (avec `/galaxy` et son plein écran). À
  surveiller : le composant n'a pas vocation à être monté partout.
- **Le rejeu ne montre que « allumée / pas encore »**, pas la finesse des cinq états. C'est le
  prix de la monotonie, et c'est le bon prix.

## Hors périmètre

Le partage du rejeu (vidéo rendue serveur) ; le rejeu par matière ; l'annonce « +1 étoile » en
fin de mission (hors v1 de l'ADR-0024) ; le plafond adaptatif `GALAXY_MAX_NODES` et sa validation
sur les trois appareils, qui reste la dette ouverte de l'ADR-0024 §6 — le rejeu l'hérite tel quel.

---

## Amendement 1 — Addendum « Construction depuis root » : une croissance, pas une lecture — 2026-07-31

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-31.

> **Addendum, pas nouvel ADR.** Il **révise le §3** (la frise servait de barre de lecture) et
> **reformule le §4** (autoplay) de l'ADR-0029, écrit le même jour. Aucun mécanisme nouveau,
> aucune table, aucune route, aucun changement de contrat.

### Contexte

Le rejeu livré en 0.33.0 fonctionne — curseur 0 → 11 → 22 → 37 étoiles — mais il est **saccadé**.
La demande : plutôt qu'un « rejouer » avec barre de lecture, une **construction du graphe depuis
le nœud genesis**, comme l'animation d'un graphe Obsidian, **qui reste animée** ensuite.

Deux causes au saccadé, aucune n'est un réglage :

- **Le pas de temps est la donnée elle-même.** La série `timeline` est **creuse** : un point les
  seuls jours de progrès. Une journée de mission allume 5 ou 10 notions **dans la même frame**.
  Ce n'est pas une croissance, c'est un escalier — et entre deux points, des semaines où rien ne
  bouge.
- **Chaque cran relance le moteur de forces.** `react-force-graph-3d` n'est pas un composant
  contrôlé (ADR-0024 le note déjà) : réassigner `graphData` perd l'**identité des objets nœuds**,
  donc leurs positions, donc le graphe se réorganise entièrement à chaque cran.

Obsidian ne fait ni l'un ni l'autre : il **ajoute** des nœuds à une simulation déjà en cours, et
la réchauffe doucement.

### Alternatives considérées

- **Lisser l'interpolation entre deux crans, en gardant le curseur.** Traite la première cause,
  pas la seconde : le moteur continue de se relancer. → **Écarté.**
- **Monter le graphe complet d'emblée et ne moduler que l'opacité par nœud.** Parfaitement fluide,
  aucun risque de perf — mais c'est un **fondu**, pas une croissance. L'effet demandé est
  l'émergence depuis le centre. → Écarté.
- **Rendre une vidéo côté serveur.** Déjà écarté par l'ADR-0029, pour les mêmes motifs (pipeline,
  stockage, péremption). → Écarté.
- **Construction continue depuis `root`, horloge de rang, mutation du graphe en place.**
  → **Retenu.**

### Décision

#### 1. Une **horloge de rang**, pas un calendrier

Les notions s'allument **une par une**, dans l'ordre de leur `first_lit`, à cadence fixe. Le temps
réel n'est **pas à l'échelle**.

| constante | valeur | rôle |
|---|---|---|
| `STAR_CADENCE` | 120 ms | une notion à la fois |
| `ANCESTOR_LEAD` | 60 ms | matière puis chapitre naissent juste avant leur première notion |
| `BIRTH` | 480 ms | apparition depuis la position du parent, `easeOutCubic` |

37 étoiles ≈ **5 s**.

**Ce choix est doctrinal avant d'être technique.** Le §4 interdit d'afficher une date **et**
d'annoncer une période vide : une horloge calendaire ferait exactement les deux — elle traverserait
les vacances en ne montrant rien, ce qui **est** l'annonce d'une période vide.

#### 2. Le graphe est **posé**, pas convergé — §2 RÉÉCRIT le 2026-07-31

> **Rédaction d'origine** : « mutation en place, puis `d3ReheatSimulation` à alpha bas (~0.2),
> ⚠️ jamais `alpha(1)` ». **Impossible à tenir** — non par difficulté, mais parce que la
> bibliothèque épinglée ne l'expose pas. Constaté au read-before-code, réécrit le jour même
> plutôt que contourné en silence.

**Ce que le code de `three-forcegraph` 1.43.4 dit, vérifié ligne à ligne :**

- `d3ReheatSimulation()` ne prend **aucun argument** et exécute `d3ForceLayout.alpha(1)`. La
  seule méthode de réchauffe exposée fait **exactement** ce que l'ancien §2 interdisait en gras.
- `d3AlphaTarget` **existe** comme prop du kapsule (c'est le patron « keep engine running at low
  intensity » du drag) mais **n'est relayé** ni par `3d-force-graph` ni par
  `react-force-graph-3d` : ni prop React, ni méthode du ref. Inatteignable.
- **Le coup de grâce** : `graphData.onChange` exécute `stop().alpha(1)` — « re-heat the
  simulation », dit le commentaire de la lib. **Toute** modification des données réchauffe à
  fond, qu'on préserve ou non l'identité des nœuds.

Ce dernier point ferme la voie pour de bon. L'ancien §2 pariait sur « ajouter à une simulation
déjà en cours, doucement réchauffée » — cette simulation n'existe pas : la lib la relance à
plein régime à chaque étoile. Préserver l'identité des objets aurait sauvé les **positions de
départ**, pas empêché la ré-explosion.

**Nouveau mécanisme.** La position de chaque nœud est **calculée**, jamais cherchée :

- un **arbre radial déterministe** est calculé une fois pour le graphe complet — c'est
  exactement ce que fait la maquette, que l'ADR d'origine opposait à la modale ;
- chaque nœud naît **aux coordonnées de son parent** et rejoint sa place en `BIRTH` ms,
  `easeOutCubic` — le trajet reste ce qu'il devait être ;
- les positions sont **épinglées** (`fx/fy/fz`) et les forces **mises à zéro**, comme la vue en
  système solaire. Le moteur ne travaille pas, donc il ne peut pas ré-exploser ;
- **déterministe** : la galaxie de Massimo se construit de la même façon à chaque visite, sinon
  ce n'est pas la sienne.

C'est le mécanisme **déjà éprouvé** par l'addendum ADR-0024 §3, livré le même jour : mêmes
fonctions pures, mêmes invariants testables. Une technique de moins à maintenir, pas une de plus.

⚠️ **Ne pas « rétablir » le reheat** en croyant revenir à l'intention d'origine. L'intention
d'origine était *ne pas ré-exploser* ; le reheat en était le moyen supposé, et ce moyen produit
précisément le défaut qu'on corrige.

#### 3. La naissance des ancêtres est **dérivée côté client**

`root` existe à t₀. Une **matière** naît quand sa **première** notion descendante s'allume ; un
**chapitre** de même. Ces nœuds n'ont pas de date propre et **n'en auront jamais** : aucun
changement d'API, `?with_skills=true` suffit déjà. Aucune migration, aucune requête de plus.

#### 4. La frise devient **témoin**, plus commande — le §3 est révisé

La courbe se **trace en synchronisation** avec les étoiles, sous le canvas, en SVG maison, avec un
compteur « N étoiles allumées » qui monte avec elle. Plus de curseur, plus de drag : un seul
bouton, **« Revoir »**.

⚠️ **L'axe X de la frise reste le JOUR ACTIF** — espacement uniforme, série creuse, comme
aujourd'hui. Le curseur avance en **fraction du jour** en cours.

> **Pourquoi cet avertissement existe.** Une première rédaction proposait un axe de **rang**, par
> cohérence avec l'horloge. C'était faux : cumul contre rang donne une **droite**, puisque chaque
> cran ajoute exactement 1. La courbe n'aurait plus rien dit. Avec l'axe « jour », une journée à
> six notions monte en marche d'escalier pendant que six étoiles s'allument coup sur coup — et
> **c'est ça, l'information**. Écrit ici pour que personne ne « corrige » l'axe en croyant unifier.

Sur l'Accueil, la frise **reste telle quelle**. Inchangé.

#### 5. À la fin, **ça ne se fige pas**

On rend la main aux comportements **déjà en place** sur `/galaxy` : `autoRotate` et flux doré à
particules. Aucune boucle d'animation à écrire, aucune règle nouvelle — et « l'or ne coule que vers
ce que Massimo a vraiment travaillé » tient sans amendement.

**Règle « pas de marionnette »** : chaque étoile a son propre clock apériodique de dérive, avec
**exactement un** point d'accroche au signal principal.

#### 6. Le §4 « aucun autoplay » est **reformulé, pas supprimé**

L'interdit visait l'**animation subie sur la page d'atterrissage**. Dans une modale que Massimo
vient d'ouvrir exprès, le démarrage immédiat **est** l'objet du clic. Sans cette reformulation, la
décision se contredit.

Nouvelle rédaction : *aucune animation ne démarre sur une surface que Massimo n'a pas ouverte pour
elle.*

Le repli `prefers-reduced-motion` du §4 est réécrit avec : **état final d'emblée**, aucune
construction, aucune animation continue — l'ancienne formulation renvoyait à un curseur qui
n'existe plus.

#### 7. La modale rend le graphe **complet, avec ses notions**

Elle **ne peut pas** réutiliser la configuration de la vue par défaut de `/galaxy` : celle-ci en a
été **explicitement amputée** (filtre client `root` + `subject`, addendum §C). La modale consomme
`GET /api/student/galaxy/all` **sans ce filtre**.

L'amas que le §C a corrigé ne se reproduit pas ici, pour une raison précise : la lisibilité ne vient
pas d'un plafond, elle vient de l'**ordre d'arrivée**. Les nœuds arrivent un par un, chacun sur son
parent. Et l'état final ne contient que les notions **travaillées** (~37 + ancêtres ≈ 60 nœuds), pas
tout le référentiel.

### Conséquences

**Positives**

- Le rejeu **raconte** au lieu de défiler. C'est la seule surface du produit qui le fait.
- **Moins de commandes** : un bouton au lieu d'une barre de lecture, ce qui va dans le sens de la
  page.
- Zéro backend, zéro table, zéro migration, zéro requête. Le contrat `?with_skills=true` est
  inchangé.
- **Coût de démarrage inchangé** : le double `lazy()` de l'ADR-0029 §1 tient, l'Accueil reste à
  zéro Three.js au premier paint.

**Négatives, assumées**

- **On ne peut plus revenir en arrière dans le temps.** C'est le prix de la fluidité, et le
  curseur n'était de toute façon utilisable qu'à la souris.
- **Le temps n'est plus à l'échelle** dans le canvas : deux notions allumées à six mois d'écart
  arrivent à 120 ms l'une de l'autre. La frise porte seule le relief temporel.
- **Une animation permanente de plus** sur une troisième surface montant `GalaxyCanvas`.

### Read-before-code

1. **Comment `GalaxyReplayModal` alimente-t-elle le canvas aujourd'hui** — quel appel, quel
   filtre ? C'est le point qui décide si le §7 est une prop ou une reprise.
2. **Où vit le filtre client `root` + `subject`** (partagé avec l'addendum ADR-0024, même
   question).
3. **`react-force-graph-3d` conserve-t-il l'identité des nœuds** avec la version épinglée ?
   Vérifier `d3ReheatSimulation` / `d3AlphaTarget` sur l'API réellement exposée avant d'écrire la
   mutation en place.

   > **RÉPONDU le 2026-07-31, et la réponse a réécrit le §2.** `d3ReheatSimulation` = `alpha(1)`,
   > `d3AlphaTarget` inatteignable, et `graphData.onChange` réchauffe à `alpha(1)` de toute façon.
   > Question annexe tranchée au passage : `graphData` **n'est pas** exposée sur le ref (18
   > méthodes liées, pas celle-là) — ce qui rend inerte, depuis le 2026-07-28, le déclouage du
   > soleil dans `handleEngineStop`. Consigné dans `zetis-galaxy.md`.

**Stop-on-blocker** : si la modale monte le canvas via le composant de page de `/galaxy` plutôt
que directement, le §7 devient un refactor et non un réglage — remonter pour arbitrage.

### Corollaires documentaires

- `adr-0029-rejeu-anime-galaxie.md` — pointeur vers cet addendum sur §3 et §4.
- `page-accueil.md` — le libellé « Revoir ma galaxie grandir → » est **inchangé** ; la mention de
  la frise comme barre de lecture disparaît.
- `zetis-galaxy.md` §11 — la modale rejoint la liste des surfaces montant le canvas.
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` **inchangé**.
- Maquette : `docs/frontend-massimo/mockup/mockup-page-galaxy-animations-v1.html`, écran B.

### Hors périmètre

Le partage du rejeu (vidéo serveur) ; le rejeu par matière ; l'annonce « +1 étoile » en fin de
mission ; la mesure de perf sur les trois appareils, portée par l'addendum ADR-0024.

### Ce que la maquette ne prouve pas

- **La lisibilité en 3D à 37 étoiles.** La maquette pose les nœuds sur un arbre radial calculé ; la
  modale les ajoute à une simulation réchauffée. Le rythme sera le même, la disposition finale non.
  **Seul point à essayer en vrai avant de figer les constantes.**
- **La tenue sur iPhone** : ~60 nœuds, autant de liens, une trentaine de particules. À mesurer, pas
  à supposer — c'est la même dette que celle reformulée dans l'addendum ADR-0024.

---

## Amendement 2 — Addendum « La galaxie dans le bandeau » : le chrome cesse de décorer pour rien — 2026-08-04

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-04.

> **Addendum, pas nouvel ADR.** Il **étend le §6** de l'addendum « Construction depuis root » à une
> surface qu'il n'avait pas envisagée — le **chrome de l'application** — et **transpose en 2D** la
> construction qui n'existait qu'en 3D. Aucune table, aucune route, aucun contrat modifié.

### Contexte

Le header global de Massimo (`MassimoBannerHeader`, monté par `MassimoLayout`) est affiché sur
**les 21 routes protégées**. Il portait jusqu'ici un décor **génératif** : `NeuralCubes`
(22 cubes montants) et `NeuralLinks` (8 liens SVG animés).

Deux problèmes, et le second n'a été mesuré qu'en écrivant cet addendum :

- **Il ne dit rien.** 22 cubes tirés d'un PRNG et 8 liens décoratifs : joli, mais sans rapport avec
  Massimo. Le bandeau est la première chose qu'il voit, sur chaque page, et il ne lui parle pas de
  lui.
- **Il coûte, en permanence.** 46 animations CSS `infinite` + 32 `<animate>` SMIL
  `repeatCount="indefinite"` = **78 animations qui ne s'arrêtent jamais**. Pire, `hfx-twinkle`
  animait `filter: drop-shadow`, propriété **non composable** : 22 éléments **repeints à chaque
  image**, sur chaque page, tant que l'app est ouverte.

La demande : y mettre **sa** galaxie, qui se construit comme un graphe Obsidian.

### Le point dur — pourquoi ce n'est pas « monter `GalaxyCanvas` dans le header »

`GalaxyCanvas` tire `react-force-graph-3d` et Three.js : **1,37 Mo (368 Ko gzip)**. Le monter dans
le chrome le ferait télécharger sur **les 21 routes** — y compris `/subjects/:slug`, dont le budget
est écrit **ZÉRO** (`matiere.bundle.test.ts`), et `/chat`, que `notionActionUi.ts` protège
nommément.

⚠️ **Et rien ne l'aurait signalé.** `accueil.bundle.test.ts` et `matiere.bundle.test.ts` partent
d'une **page**. `MassimoLayout.tsx` et `MassimoBannerHeader.tsx` ne sont dans aucun des deux
graphes d'imports. Vérifié par sabotage : avec un `import("@zetis/ui/galaxy/canvas")` dans le
header, **les deux suites restent 12/12 vertes**. Le trou est fermé par `layout.bundle.test.ts`
(entrée `MassimoLayout.tsx`, budget zéro) et `app.bundle.test.ts` (entrée `App.tsx`, liste épinglée
des points de montage).

### Alternatives considérées

- **Monter `GalaxyCanvas` en `lazy()` dans le header.** Le `lazy()` n'atténue rien : c'est le
  **montage** qui déclenche le chunk, leçon du 2026-07-28. → **Écartée.**
- **N'animer que sur l'Accueil.** Le bandeau se comporterait différemment selon la page. Massimo y
  verrait une incohérence, pas une règle. → Écartée.
- **Un décor génératif « en forme de graphe »**, sans données. Aucun réseau — mais ce n'est plus sa
  galaxie, et on n'aurait rien réparé du premier problème. → Écartée.
- **Rendu 2D maison, vraies données, réutilisant les modules purs de `@zetis/ui/galaxy`.**
  → **Retenue.**

### Décision

#### §1 — 2D, et zéro octet de moteur 3D dans le chrome

Le bandeau dessine dans un `<canvas>` 2D. Il **consomme** de `@zetis/ui/galaxy` ce qui est **pur et
sans dépendance** — `revealSchedule`, `easeOutCubic`, `starStyle`, les couleurs — et **n'importe
jamais** `@zetis/ui/galaxy/canvas`, `three`, `react-force-graph-3d` ni `three-spritetext`.

La doctrine était déjà écrite ailleurs (`GalaxyPage.tsx` : « **aucun chunk 3D pour un décor** ») ;
elle devient une règle **vérifiée** pour le chrome.

#### §2 — La pose est dans le PLAN de la galaxie, pas à l'écran

`revealSchedule` porte la doctrine (horloge de **rang**, pas calendrier) : on la garde telle quelle.

`radialTreeLayout` en revanche **ne peut pas** servir. Ses `LEVEL_RADIUS = [0,170,90,52]` cumulent
±312 px ; le bandeau fait ~1200 × 96, soit **12,5 : 1**. Une échelle uniforme réduit la galaxie à
un carré de 84 px — exactement derrière l'emblème, donc invisible. Une échelle anisotrope donne
1,9 en X contre **0,22 en Y** : les chapitres s'écrasent en traînées de 5 px et la structure
disparaît.

`headerBandLayout` donne donc à chaque nœud `(u, v)` — ses coordonnées **dans le plan du disque** —
et `lift`, son épaisseur hors plan. L'écran s'obtient en **tournant** `(u, v)` puis en écrasant la
profondeur (`FLATTEN = 0,035`) : on regarde le disque presque par la tranche, ce qui **est** la
forme d'un bandeau.

**Le cœur se pose au centre exact de l'emblème**, et il y reste à tous les angles : la galaxie
**sort du logo ZETIS** et tourne autour de lui, au lieu d'être posée à côté.

⚠️ **Les matières sont réparties sur TOUT LE TOUR** (angle d'or). Une première version les
alternait à gauche et à droite : elles se retrouvaient toutes à l'angle 0 ou π, donc elles
traversaient le centre **en même temps** — à chaque demi-tour, la galaxie se repliait sur
l'emblème.

⚠️ **Arbitrage mesuré, et les deux objectifs se contredisent.** Donner les grands rayons aux
matières les plus alignées avec la bande porte le remplissage de 65 % à 90 % **à l'arrêt** — mais
remet la masse aux angles 0 et π, et la silhouette s'effondre à 52 % en tournant. C'est la rotation
qui décide : le bandeau passe sa vie à tourner et six secondes à se construire.

#### §2bis — Tout le ciel est dessiné, pas seulement ce qui est travaillé

⚠️ **Mesuré à l'écran, et c'est ce qui a corrigé la conception.** Le graphe réel de Massimo fait
**202 nœuds pour 47 notions** ayant une date de première fois. Ne dessiner que ces 47 laissait la
bande **vide à 77 %** : les étoiles flottaient seules et se voyaient à peine.

Le plan de ce chantier se protégeait d'une « bouillie grise » à 350 nœuds. Le problème réel était
**l'inverse**. Les notions encore à découvrir sont donc dessinées elles aussi, en veilleuse
(`unknown`, « À découvrir » — une valeur qui existe déjà dans `STAR_STYLES`). Elles peuplent le
ciel, et les étoiles de Massimo ressortent **par contraste** au lieu de ressortir par la taille.

C'est aussi plus fidèle à la métaphore : le ciel existe, ce sont **ses** étoiles qui s'y allument.

#### §3 — Le temps se comprime, JAMAIS le nombre d'étoiles

À `STAR_CADENCE` = 120 ms, les ~280 notions d'un référentiel complet dureraient **33,6 secondes**.
Impensable dans un bandeau présent partout.

⚠️ **La parade n'est pas de couper des notions.** L'addendum ADR-0024 §1 a supprimé
`GALAXY_MAX_NODES` parce qu'« il cache la progression de l'enfant selon un critère matériel » —
« Jamais un plafond de nœuds déguisé ». On comprime donc le **temps** : `HEADER_TOTAL = 7000 ms`,
toutes les étoiles naissent. Ce qui se règle sur la densité, c'est la **traînée** de naissance
(`birthWall`), c'est-à-dire les **particules**, ce que le §2 du même addendum autorise.

On ne **ralentit** jamais : sous le plafond, l'horloge de rang garde sa cadence naturelle. Avec les
**47 notions réellement travaillées** par Massimo, le plafond n'est donc même pas atteint — la
construction dure **~5,8 s** à 120 ms par notion, sans aucune compression.

⚠️ `HEADER_TOTAL` valait 3200 ms à la première écriture (construction ~3,1 s). Porté à 7000 après
lecture à l'écran : **ça se construisait trop vite pour qu'on voie quoi que ce soit.**

⚠️ Le budget de particules se mesure sur le **pic**, pas sur la moyenne : `revealSchedule` fait
naître les ancêtres juste avant leur première notion, donc les naissances arrivent **en grappes**.
Une formule au débit moyen donnait 34 étoiles en vol pour un budget de 32 — constaté, puis corrigé
par un calcul exact.

#### §4 — La CONSTRUCTION : coût par image indépendant de N

À angle nul, une étoile arrivée ne bouge plus. On la blitte donc **une fois** sur un calque hors
écran, et chaque image ne coûte que ce calque + la couronne + les étoiles encore **en vol**
(≤ `IN_FLIGHT_BUDGET` = 32). Environ **35 opérations par image**, que Massimo ait 12 notions ou 500.

⚠️ **`ctx.shadowBlur` et `ctx.filter` sont interdits.** Ce sont des flous gaussiens appliqués **par
appel de dessin** : c'est `hfx-twinkle` réinventé en canvas. La lueur vient de sprites pré-rendus
une fois. Un test-verrou l'atteste.

#### §4bis — LA VIE : ça ne se fige pas, ça tourne

⚠️ **Cette décision révise ce que ce même addendum disait le matin** (la construction s'arrêtait,
plus rien ne bougeait). Le gel donnait un bandeau **mort** : la construction dure quelques secondes
et Massimo arrive presque toujours après. Le dépôt disait d'ailleurs déjà l'inverse pour le rejeu —
addendum « Construction depuis root » §5 : « à la fin **ça ne se fige pas** ».

La galaxie **tourne** (`ROTATION_PERIOD` = 72 s pour un tour), et 24 étoiles scintillent par-dessus.
Une étoile qui passe **devant** le cœur est un peu plus grosse et plus vive que celle qui passe
derrière : c'est ce qui fait lire une rotation plutôt qu'un glissement latéral.

⚠️ **PRIX EXPLICITE, ET IL FAUT QU'IL SOIT ÉCRIT** : dès que tout tourne, plus rien n'est immobile,
donc **le calque ne sert plus** et chaque étoile se redessine. Le coût redevient **proportionnel à
N** — ~202 blits de sprite à **20 images par seconde** (mesuré : 19). À comparer aux ~38 éléments
**filtrés** repeints à 60 im/s par le décor retiré : un `drawImage` de sprite reste très loin d'un
`filter: drop-shadow`, mais la propriété « indépendant de N » ne vaut plus que pour la phase de
construction. En contrepartie, le calque est **libéré** au passage à ce régime : ~2 Mo rendus.

#### §4ter — Le soleil, et la transparence de l'emblème

L'emblème ZETIS fait 84 px **opaques** posés **pile sur le cœur** du graphe : il cachait le point
d'où tout part. Il passe à **65 % d'opacité** — le cercle et le livre restent lisibles comme forme,
et on **voit** la galaxie sortir du logo au lieu de la deviner.

Une **couronne solaire dorée** est dessinée dans le canvas autour du cœur. Elle s'allume **avant**
la première étoile (rampe de 700 ms) et pulse **à la même horloge** que le scintillement : le
soleil et sa galaxie sont un seul objet, pas deux effets qui battent chacun dans leur coin. Mesuré :
cœur **9× plus lumineux** que la périphérie, **86 %** des pixels allumés sont chauds.

Son coût — un sprite de plus par image — est compté dans `FIXED_FRAME_DRAWS`, **constante exportée
que les tests consomment**, pour qu'un budget ne se relâche pas par des `+ 1` dispersés qu'on
ajusterait un à un.

#### §5 — Quand la construction se joue — extension assumée du §6

L'addendum précédent dit : « aucune animation ne démarre sur une surface que Massimo n'a pas
ouverte pour elle ». Le bandeau est sur **toutes** les pages : la tension est réelle, et elle est
tranchée ici plutôt que contournée.

Le §6 vise l'**animation subie et permanente sur une page d'atterrissage** — le défaut du
2026-07-28. La surface que Massimo ouvre ici n'est ni `/chat` ni `/subjects/:slug` : c'est
**l'application**, dont ce bandeau est la porte d'entrée. La construction se joue **une seule fois
par chargement de page**, après la première peinture, et ne se répète **jamais** d'une page à
l'autre — vérifié en vrai : une navigation SPA laisse le témoin sur `alive`, le layout ne se
démontant pas.

Deux gardes complètent la règle :

- **onglet en arrière-plan** → on ne joue pas la construction, on passe directement à l'état
  vivant. Une construction jouée là est une construction perdue.
- **`prefers-reduced-motion`** → `requestAnimationFrame` **n'est jamais appelé**. Pas « appelé puis
  annulé » : le chemin n'existe pas. État final, immobile, d'emblée.

⚠️ Le verrou « déjà joué » se pose **à la fin** de la construction, pas à son début. Le poser au
début paraît plus simple et **casse le mode dev** : `StrictMode` monte, démonte et remonte chaque
effet, donc le premier passage marquerait « déjà joué » et le second n'animerait plus rien.

⚠️ Le témoin `canvas.dataset.state` (`growing` → `alive`) rend l'état observable. Il n'est pas
décoratif : depuis que la rotation existe, un simple compte d'images ne permet plus de vérifier
qu'un remontage **ne rejoue pas** la construction. C'est lui que le test-verrou lit.

#### §6 — Le réseau est partagé, sans devenir un cache

Le bandeau demande les mêmes deux ressources que `HomeGalaxyCard` (`/galaxy/all` et
`/timeline?with_skills=true`), et `lib/galaxy.ts` n'avait **aucun** partage : l'Accueil serait
passé à 4 appels. `lib/galaxyShared.ts` déduplique **les requêtes en vol** (fenêtre de 5 s).

⚠️ **Ce n'est pas un cache de session, et c'est délibéré.** Une fenêtre longue figerait le graphe :
Massimo travaille une notion, revient sur l'Accueil, et son étoile ne serait pas allumée. On
perdrait une vérité pour économiser une requête déjà économisée.

⚠️ **Le jeton fait partie de la clé, pour la confidentialité et non pour la performance.**
`logout()` démonte le layout mais **pas le module** : sans cette comparaison, se déconnecter puis
se reconnecter dans le même onglet servirait la galaxie du compte précédent au suivant.

### Conséquences

- Le chrome de l'app perd **78 animations infinies** et ~38 éléments **filtrés** repeints à 60 im/s.
  Ce qui les remplace : ~202 blits de sprite à 19 im/s, sans flou gaussien — moins cher, mais
  **proportionnel à N**, ce que l'ancien décor n'était pas. Arbitrage assumé au §4bis.
- `NeuralCubes.tsx` et `NeuralLinks.tsx` sont **supprimés**. `headerFx.css` ne garde que les deux
  halos de l'emblème — animations sur `opacity` et `transform`, composables.
- **Le header Massimo a enfin des tests.** Il n'en avait aucun, et pas par oubli :
  `NeuralLinks.tsx:30` construisait un `ResizeObserver` que jsdom n'implémente pas et que
  `test/setup.ts` ne polyfille pas — le monter jetait `ReferenceError`. Son remplaçant retombe sur
  un écouteur de `resize`, ce qui débloque la couverture. Sont désormais verrouillés : la
  **hauteur** `h-24 sm:h-28` (que `GalaxyPage.tsx:542` recopie en dur dans `top-24 sm:top-28`), le
  **cadrage du sprite** (`356px 107px` à `-136px -2px`), le lien `/galaxy` (ADR-0024 §7), et
  l'absence de « ZETIS Papa ».
- Le budget de bundle du **chrome** est mesuré pour la première fois, et celui de l'app entière
  avec lui.

### Dette assumée

- **Rien n'a été jugé à l'œil sur un vrai appareil.** Le panneau navigateur de la session a rendu
  en taille réduite ; tout ce qui précède est **mesuré dans le canvas**. Sur desktop : 13–15 bandes
  sur 20 occupées selon l'angle, cœur 9× plus lumineux que la périphérie, 19 im/s. Sur un écran de
  390 px, la même galaxie tiendra dans trois fois moins de place.
- **`IN_FLIGHT_BUDGET`, `ROTATION_PERIOD` et `FLATTEN` ne sont pas mesurés au profileur.**
  L'addendum ADR-0024 reproche à `GALAXY_MAX_NODES` que « ses valeurs n'ont JAMAIS été mesurées » ;
  ne pas refaire la même chose. Une capture Safari sur iPhone, jeu semé à ~300 notions, reste à
  faire — et c'est là que le coût en N du §4bis se jugera vraiment.
- **Le remplissage plafonne à ~65 % de la largeur** à l'arrêt, conséquence directe de l'arbitrage
  du §2. S'il faut mieux, ce n'est pas la répartition angulaire qu'il faut toucher (elle porte la
  rotation) mais le rayon du disque ou la taille des amas.
