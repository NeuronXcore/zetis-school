# ADR-0029 — Addendum « Construction depuis root » : une croissance, pas une lecture

## Statut

Accepté — 2026-07-31.

> **Addendum, pas nouvel ADR.** Il **révise le §3** (la frise servait de barre de lecture) et
> **reformule le §4** (autoplay) de l'ADR-0029, écrit le même jour. Aucun mécanisme nouveau,
> aucune table, aucune route, aucun changement de contrat.

## Contexte

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

## Alternatives considérées

- **Lisser l'interpolation entre deux crans, en gardant le curseur.** Traite la première cause,
  pas la seconde : le moteur continue de se relancer. → **Écarté.**
- **Monter le graphe complet d'emblée et ne moduler que l'opacité par nœud.** Parfaitement fluide,
  aucun risque de perf — mais c'est un **fondu**, pas une croissance. L'effet demandé est
  l'émergence depuis le centre. → Écarté.
- **Rendre une vidéo côté serveur.** Déjà écarté par l'ADR-0029, pour les mêmes motifs (pipeline,
  stockage, péremption). → Écarté.
- **Construction continue depuis `root`, horloge de rang, mutation du graphe en place.**
  → **Retenu.**

## Décision

### 1. Une **horloge de rang**, pas un calendrier

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

### 2. Le graphe est **muté en place**, jamais réassigné

Même tableau, mêmes objets nœuds ; on ne fait qu'**ajouter**. Chaque nouveau nœud naît **aux
coordonnées de son parent** — sinon il arrive de l'origine en traversant l'écran. Puis
`d3ReheatSimulation` à **alpha bas** (~0.2).

⚠️ **Jamais `alpha(1)`** : alpha plein, c'est la ré-explosion — exactement le défaut qu'on corrige.

### 3. La naissance des ancêtres est **dérivée côté client**

`root` existe à t₀. Une **matière** naît quand sa **première** notion descendante s'allume ; un
**chapitre** de même. Ces nœuds n'ont pas de date propre et **n'en auront jamais** : aucun
changement d'API, `?with_skills=true` suffit déjà. Aucune migration, aucune requête de plus.

### 4. La frise devient **témoin**, plus commande — le §3 est révisé

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

### 5. À la fin, **ça ne se fige pas**

On rend la main aux comportements **déjà en place** sur `/galaxy` : `autoRotate` et flux doré à
particules. Aucune boucle d'animation à écrire, aucune règle nouvelle — et « l'or ne coule que vers
ce que Massimo a vraiment travaillé » tient sans amendement.

**Règle « pas de marionnette »** : chaque étoile a son propre clock apériodique de dérive, avec
**exactement un** point d'accroche au signal principal.

### 6. Le §4 « aucun autoplay » est **reformulé, pas supprimé**

L'interdit visait l'**animation subie sur la page d'atterrissage**. Dans une modale que Massimo
vient d'ouvrir exprès, le démarrage immédiat **est** l'objet du clic. Sans cette reformulation, la
décision se contredit.

Nouvelle rédaction : *aucune animation ne démarre sur une surface que Massimo n'a pas ouverte pour
elle.*

Le repli `prefers-reduced-motion` du §4 est réécrit avec : **état final d'emblée**, aucune
construction, aucune animation continue — l'ancienne formulation renvoyait à un curseur qui
n'existe plus.

### 7. La modale rend le graphe **complet, avec ses notions**

Elle **ne peut pas** réutiliser la configuration de la vue par défaut de `/galaxy` : celle-ci en a
été **explicitement amputée** (filtre client `root` + `subject`, addendum §C). La modale consomme
`GET /api/student/galaxy/all` **sans ce filtre**.

L'amas que le §C a corrigé ne se reproduit pas ici, pour une raison précise : la lisibilité ne vient
pas d'un plafond, elle vient de l'**ordre d'arrivée**. Les nœuds arrivent un par un, chacun sur son
parent. Et l'état final ne contient que les notions **travaillées** (~37 + ancêtres ≈ 60 nœuds), pas
tout le référentiel.

## Conséquences

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

## Read-before-code

1. **Comment `GalaxyReplayModal` alimente-t-elle le canvas aujourd'hui** — quel appel, quel
   filtre ? C'est le point qui décide si le §7 est une prop ou une reprise.
2. **Où vit le filtre client `root` + `subject`** (partagé avec l'addendum ADR-0024, même
   question).
3. **`react-force-graph-3d` conserve-t-il l'identité des nœuds** avec la version épinglée ?
   Vérifier `d3ReheatSimulation` / `d3AlphaTarget` sur l'API réellement exposée avant d'écrire la
   mutation en place.

**Stop-on-blocker** : si la modale monte le canvas via le composant de page de `/galaxy` plutôt
que directement, le §7 devient un refactor et non un réglage — remonter pour arbitrage.

## Corollaires documentaires

- `adr-0029-rejeu-anime-galaxie.md` — pointeur vers cet addendum sur §3 et §4.
- `page-accueil.md` — le libellé « Revoir ma galaxie grandir → » est **inchangé** ; la mention de
  la frise comme barre de lecture disparaît.
- `zetis-galaxy.md` §11 — la modale rejoint la liste des surfaces montant le canvas.
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` **inchangé**.
- Maquette : `docs/frontend-massimo/mockup/mockup-page-galaxy-animations-v1.html`, écran B.

## Hors périmètre

Le partage du rejeu (vidéo serveur) ; le rejeu par matière ; l'annonce « +1 étoile » en fin de
mission ; la mesure de perf sur les trois appareils, portée par l'addendum ADR-0024.

## Ce que la maquette ne prouve pas

- **La lisibilité en 3D à 37 étoiles.** La maquette pose les nœuds sur un arbre radial calculé ; la
  modale les ajoute à une simulation réchauffée. Le rythme sera le même, la disposition finale non.
  **Seul point à essayer en vrai avant de figer les constantes.**
- **La tenue sur iPhone** : ~60 nœuds, autant de liens, une trentaine de particules. À mesurer, pas
  à supposer — c'est la même dette que celle reformulée dans l'addendum ADR-0024.
