# ADR-0029 — Rejeu animé de la galaxie : voir son chemin, pas seulement son état

## Statut

Accepté — 2026-07-31.

> Nouvel ADR plutôt qu'un 3ᵉ addendum à l'ADR-0024 : il n'y révise rien. L'ADR-0024 décide
> **comment la galaxie est rendue** ; celui-ci ajoute une **capacité** qui n'existait pas —
> rejouer le temps. Les deux se composent, aucun ne se contredit.

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

> ⚠️ **RÉVISÉ le 2026-07-31** par `adr-0029-addendum-construction-depuis-root.md` §4. La frise
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
