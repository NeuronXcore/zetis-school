# ADR-0050 — Le plan de préparation

## Statut

**Accepté — 2026-08-10.** Les **sept décisions sont gelées**. Le prérequis de décision est levé :
les sessions de `prompts/claude-code/prompts-claude-code-adr-0050.md` peuvent démarrer, après
`/ouverture`.

> Historique : Proposé — 2026-08-10, **le même jour**. Écrit sur `main`, **sans une ligne de
> code**, selon le rituel `mockup → spec → ADR → prompt` : maquette
> (`docs/frontend-massimo/mockup/mockup-plan-preparation-v1.html`, **vue à l'écran**) et spec
> (`docs/frontend-massimo/page-agenda.md`, passages `[0050]`) avant cet ADR. Ce qui autorise
> l'acceptation sans délai : le **read-before-code a été rendu avant toute décision**.

⚠️ **La Décision 5 (ce que vaut une coche d'étape) a été prise par le commanditaire**, le
2026-08-10, après exposé des deux options et de leur maquette — **(A) déclaratif**, conforme à la
recommandation. C'était une décision de **produit**, pas de technique : elle touchait le §3 de
l'ADR-0025 sur le seul objet du dépôt où la preuve serait **disponible**. Elle ne se rediscute pas
ici : on la **relit**.

> Ce chantier est le **§8 rôle 1 de l'ADR-0025**, dont l'`adr-0025-addendum-lecon-a-apprendre`
> §14.6 a écrit l'ordonnancement : il vient **après** le couplage 2, jamais avant, *« ses étapes
> sont lire la fiche · mini-quiz · réviser les cartes du chapitre »*. Le couplage 2 a été livré le
> 2026-08-10 (`adr-0049`, squash `117b632`). **La dépendance est levée le jour même.**

## Contexte

Une échéance dit aujourd'hui *« contrôle de fractions jeudi »* et s'arrête là. Massimo sait
**quoi**, jamais **comment s'y prendre** — et « comment s'y prendre » est précisément ce qu'un
enfant de 11 ans ne sait pas inventer devant un chapitre entier.

Le §8 rôle 1 le nomme le rôle de **traducteur**, et ne laisse aucun doute sur son importance :

> *« échéance → plan rétro-planifié sur les jours restants, câblé sur l'existant (fiche, deep-link
> SRS, quiz). **C'est le seul rôle qui justifie la fonctionnalité** ; sans lui, ZETIS construit un
> carnet de plus. »*

Il tranche déjà deux choses, et elles ne se rouvrent pas :

- **Zéro LLM.** En phase 0 *« le rôle 1 seul subsiste, et il se compose depuis le référentiel,
  sans LLM »*.
- **Le plan est figé.** *« Persisté à la première génération et figé jusqu'à l'échéance : un plan
  qui se recalcule à chaque ouverture est un plan auquel on ne fait pas confiance. »*

## Constat read-before-code

Vérifié dans le code le 2026-08-10, **avant** d'écrire une décision.

### 1. ✅ L'emplacement est câblé et vide — aux DEUX étages, depuis le Lot 1

| Où | Aujourd'hui |
|---|---|
| `agenda/schemas.py:78` | `plan_steps: list[dict] = []` |
| `agenda/service.py:287` | `"plan_steps": [],  # Lot 2 — champ au contrat, jamais rempli ici.` |
| `packages/types/src/agenda.ts:59` | `plan_steps: unknown[];` |
| `agenda/schemas.py:99` | `has_plan: bool  # « false » en Lot 1` |
| `agenda/service.py:322` | `"has_plan": False,  # Lot 2.` |

⚠️ **`plan_steps` est typé `unknown[]` côté front.** Le contrat n'existe donc pas : il est à
**inventer**, pas à respecter. C'est la seule liberté totale du chantier — et la seule occasion de
le typer correctement du premier coup.

### 2. 🔴 Le prédicat de disponibilité EXISTE, il est unique, et il est déjà en lot

[`resolve_panoply`](../../apps/backend/app/modules/galaxy/service.py) — *« LE prédicat de
disponibilité de ZETIS : pour chaque notion, la panoplie complète. **Un seul prédicat dans le
dépôt** (addendum ADR-0024) »*. Il rend, par notion, les sept activités avec leur `available` et
leur `resource_id`, en un **nombre de requêtes constant**, et il **porte déjà l'ordre pédagogique**
— *« comprendre, puis mémoriser, puis se tester »*, côté serveur, identique sur ses deux surfaces.

**Conséquence pour ce chantier** : composer un plan ne demande **aucune logique de disponibilité
neuve**. En écrire une serait le second prédicat que l'addendum ADR-0024 interdit — et dont le
correctif du 2026-07-30 a déjà montré le coût : *« une porte ouverte sur du vide »*.

### 3. ✅ La chaîne chapitre → notions → activités est complète depuis hier

`ordered_chapter_skill_ids` (déplacé dans `lesson_resolution` par l'`adr-0049`) donne les notions
d'un chapitre en ordre curriculum ; `resolve_panoply` donne leurs activités. **Les deux moitiés du
plan existent et n'ont jamais été composées.**

### 4. ⚠️ `MissionStep` ressemble à une étape de plan — et n'en est pas une

`MissionStep` porte `step_type · instruction · resource_id · skill_id · sort_order · status`. La
tentation de réutiliser est réelle. Mais une **mission** porte aussi un verdict, un scoring, de
l'XP, un `skill_id` obligatoire et un cycle de vie propre (ADR-0017), et elle est **par notion**
là où un plan est **par échéance**. Voir Décision 1.

### 5. ⚠️ `step_type = "lesson"` est déclaré et mort — et c'est le seul constat du §14.6 qui survive

`STEP_LESSON = "lesson"` existe (`missions/service.py:66`), le commentaire du modèle le liste, et
il est **absent de `_STEP_PALETTE`** (`= (STEP_ELI5, STEP_VOCAL, STEP_MINDMAP, STEP_QUIZ)`) **et de
`_build_steps`**. Aucune mission ne peut donc porter « lire un cours ».

### 6. ✅ Ce que le §8 promet est tenable sans rien inventer

« fiche, deep-link SRS, quiz » : les trois existent, les trois sont dans la panoplie, et le
deep-link SRS par chapitre est né hier.

## Alternatives considérées

### (a) Réutiliser `Mission` + `MissionStep` pour porter le plan — écartée

Zéro migration, et les étapes sont déjà modélisées. Mais il faudrait un `Mission` sans `skill_id`
(le plan est par chapitre), sans verdict, sans scoring et sans XP — c'est-à-dire une mission qui
n'est plus une mission. Et **tout le moteur de missions entrerait dans l'agenda** : le sélecteur,
l'arbitrage de priorité, le Conseil de classe qui lit les missions. Écartée : le couplage coûte
plus cher que la table.

### (b) Générer le plan par LLM — écartée d'avance

Le §8 l'a déjà tranché pour la phase 0. Rappelée ici parce qu'un plan est exactement le genre
d'objet qu'on croit devoir faire rédiger : il n'y a rien à rédiger, il y a à **composer un
référentiel**.

### (c) Recalculer le plan à chaque ouverture — écartée par le §8

*« Un plan qui se recalcule à chaque ouverture est un plan auquel on ne fait pas confiance. »*
S'y ajoute une raison que le §8 ne donne pas : un plan qui bouge **rétroactivement** effacerait les
étapes que Massimo a déjà faites.

### (d) Un plan pour toute échéance — écartée

Sans `chapter_id`, aucune notion n'est résoluble, donc aucune étape. Un plan n'existe que sur une
échéance qui porte un chapitre — comme la porte de révision de l'`adr-0049`.

## Décision

### 1. Le plan est un objet à lui, dans le module `agenda`

Une table **`agenda_plan_steps`** (migration), rattachée à `agenda_items`. Pas de `Mission`
(alternative (a)), pas de `MissionStep`.

Colonnes minimales : `agenda_item_id · day_offset · kind · skill_id · resource_id · sort_order ·
done_at`. Le `kind` reprend le **vocabulaire de la panoplie** (`cours · fiche · revision · quiz`),
jamais un vocabulaire neuf — deux vocabulaires pour la même chose divergent au premier ajout.

### 2. Chaque étape interroge le prédicat de SON grain — jamais un prédicat réécrit

> 🔴 **AMENDÉE le 2026-08-10, avant la première ligne de code**, sur le read-before-code de la
> Session A. La rédaction d'origine disait *« depuis `resolve_panoply`, et de nulle part
> ailleurs »*. **Elle était fausse, et elle fabriquait le défaut qu'elle prétendait éviter** —
> voir l'encadré plus bas. Amendement validé par le commanditaire.

Chapitre → `ordered_chapter_skill_ids` → puis, **selon le grain de l'étape** :

| Étape | Grain | Prédicat |
|---|---|---|
| `cours` · `fiche` · `quiz` | **notion** | `resolve_panoply` — et rien d'autre |
| `revision` | **chapitre** | `memory.chapter_servable_count` (ADR-0049) |

🔴 **Aucune requête de disponibilité RÉÉCRITE dans `agenda`.** La règle de l'addendum ADR-0024
n'est pas « tout passe par `resolve_panoply` », elle est « **un seul prédicat par question** ».
Poser une question différente ne la viole pas ; y répondre par une requête maison, si.

> **Pourquoi la rédaction d'origine était fausse.** L'étape est *« réviser les cartes **du
> chapitre** »* — le deck de l'`adr-0049`. Or la panoplie répond à une **autre question** :
>
> | | Question | Filtre |
> |---|---|---|
> | `resolve_panoply` → `revision` | *cette **notion** a-t-elle une carte ?* | `status` seul, **aucun `resource_id`** |
> | `chapter_servable_count` | *ce **chapitre** a-t-il des cartes servables ?* | `status` **+ `due_at IS NOT NULL`** + plafond |
>
> Le filtre de la panoplie est **plus lâche** : il compte des cartes que le deck chapitre
> **refuse**. Une étape composée depuis lui mènerait à un deck répondant **400** — exactement la
> *« porte ouverte sur du vide »* que l'addendum ADR-0024 existe pour empêcher.
>
> ⚠️ Il y a désormais **trois** réponses dans le dépôt à « peut-on réviser ceci » — celle-ci,
> celle de l'`adr-0049`, et `get_reviews_summary` par matière. **Les trois sont légitimes : elles
> ne posent pas la même question.** Ne pas chercher à les unifier ; chercher à choisir.

⚠️ **L'ordre pédagogique vient de `resolve_panoply`**, il ne se réordonne pas ici : *comprendre,
puis mémoriser, puis se tester*. Un plan qui testerait avant d'expliquer serait pédagogiquement
faux, et le dépôt porte déjà la réponse. L'étape `revision` s'insère **à sa place dans cet
ordre** (entre `fiche` et `quiz`), même si sa disponibilité vient d'ailleurs.

⚠️ **`resource_id` n'est PAS uniforme dans la panoplie** : les clés varient selon le `kind`
(`lesson_id · fiche_id · capsule_id · mindmap_id · quiz_id`), et `eli5` comme `revision` n'en ont
**aucune**. La colonne unique de la Décision 1 exige donc une **extraction par type** ; pour
`revision`, l'identifiant est le `chapter_id` de l'échéance elle-même.

### 2 bis. Une étape par TYPE, jamais par notion

> 🔴 **AJOUTÉE le 2026-08-10** — le read-before-code a montré que l'ADR ne disait **nulle part**
> comment N notions × 7 activités deviennent ≤ 3 étapes. Le plafond de la Décision 3 n'y suffisait
> pas : il aurait tronqué arbitrairement.

Le chapitre est résolu en notions, mais **le plan ne parle jamais de notions** : il parle de
**types d'étape**, et il en produit **au plus un de chaque**.

| Étape | Ce qu'elle vise |
|---|---|
| `fiche` | la fiche de la **première leçon du chapitre qui en a une**, en ordre curriculum |
| `revision` | le **chapitre entier** — c'est le deck de l'`adr-0049`, il n'a pas de grain plus fin |
| `quiz` | le quiz de la notion **la plus fragile** du chapitre (service d'évidence, patron ADR-0018 §3) |

**Trois types ⇒ trois étapes au maximum, naturellement.** Le plafond de 3 de la Décision 3 cesse
d'être un couperet arbitraire : il devient la conséquence du nombre de types.

⚠️ **`cours` et `eli5` ne sont PAS des étapes de plan.** Lire le cours est déjà offert par
l'échéance elle-même (addendum §15, *« lire le cours »*), et le redonner ici serait une troisième
surface pour la même chose. `capsule` et `mindmap` sont hors périmètre — ils n'ont pas de grain
chapitre.

> ⚠️ **Massimo ne verra donc jamais deux fois « petit quiz » dans un plan**, même si le chapitre
> porte six notions testables. C'est voulu : le plan dit **par où commencer**, pas **tout ce qu'on
> pourrait faire**. La panoplie complète reste accessible depuis la galaxie et la page matière.

### 2 ter. L'étape dit CE QU'ELLE PRÉPARE — le contrat porte `agenda_item_id`

> 🔴 **AJOUTÉE le 2026-08-10**, au read-before-code de la Session B. La rédaction d'origine mettait
> `plan_steps` sur le **jour** (contrat du Lot 1) et refusait `agenda_item_id` à l'étape, au motif
> qu'il serait « de la mécanique ». **Le motif était faux, et il rendait la maquette
> inconstructible.** Amendement validé par le commanditaire.

`PlanStepOut` porte **`agenda_item_id`**. Le plan se rend **sous l'échéance qu'il prépare** ; le
jour, lui, garde `plan_steps` pour allumer son `✦` dans la bande. **Un seul payload sert les deux
surfaces**, et aucune migration : la colonne existe depuis la Décision 1.

**Pourquoi le refuser était une erreur.** Sur une semaine à deux contrôles, une étape posée sous le
jour flotte sans dire ce qu'elle prépare : *« réviser les cartes »* — de quel chapitre ? Le contrat
du jour date du **Lot 1**, écrit quand le plan n'existait pas ; il n'a jamais eu à répondre à cette
question.

⚠️ **`agenda_item_id` n'est pas un rouage, c'est le SUJET de l'étape.** Le commentaire d'origine
rangeait dans « mécanique » l'information qui lui donne son sens. `sort_order`, lui, reste dehors —
c'est bien un rouage.

### 2 quater. Une étape mène au grain MATIÈRE — et son libellé le dit

> 🔴 **AJOUTÉE le 2026-08-10**, au câblage de la Session B. L'ADR supposait partout que *« les
> étapes sont cliquables **vers leur activité** »* (Périmètre, slice B). **Deux activités sur trois
> ne sont pas adressables par URL** — et le `resource_id` que la Décision 2 fait persister n'avait
> donc, à la livraison, **aucun consommateur capable de l'utiliser**. Amendement validé par le
> commanditaire (option 1 sur trois exposées).

**Ce que le dépôt permet vraiment**, vérifié dans `App.tsx` et dans chaque page :

| Étape | Grain réellement atteignable | Route |
|---|---|---|
| `fiche` | **la matière** — `FichesPage` ne lit **aucun** `searchParams` | `/fiches/<slug>` |
| `revision` | **le chapitre** ✅ — le deck de l'`adr-0049` | `/revision/session` + `location.state` |
| `quiz` | **la matière** — `QuizPage` ne lit que `subject` (et `from`) | `/quiz?subject=<slug>&from=<slug>` |

**Alors le libellé nomme sa destination ET son grain** — c'est la règle de l'`adr-0047`, appliquée
ici parce qu'elle a été écrite pour exactement ce défaut : *« Lire la fiche »* promet **une** fiche
et en ouvrirait une liste.

**Le grain se dit par le PLURIEL et par le VERBE, pas en répétant la matière :**

| Étape | Libellé servi | Ce qui porte le grain |
|---|---|---|
| `fiche` | **« Lire les fiches »** | le **pluriel** — on ouvre une liste, pas une fiche désignée |
| `revision` | **« Réviser ce chapitre »** | rien à corriger : sa destination **est** le chapitre |
| `quiz` | **« Choisir un quiz »** | le **verbe** — il y aura un choix, donc ZETIS n'en a désigné aucun |

> 🔴 **« Lire les fiches de \<matière\> » a été écrit ici, essayé, puis MESURÉ dans le DOM** le
> 2026-08-10 : **193 px pour 151 disponibles** sur une carte de téléphone — 202 px avec
> « Physique-Chimie ». Ce qui se coupait à l'ellipse, c'était **le nom de la matière**, c'est-à-dire
> l'information même que l'allongement avait servi à porter. Et elle est **déjà à l'écran**, deux
> lignes plus haut, sur la ligne de puces de l'échéance.
>
> Le libellé ne dépend donc **plus du tout** de la matière — une chaîne fixe par type, un cas de
> moins à tenir. Seule la **destination** en dépend.

🔴 **On ne fabrique aucune route.** `/fiches?fiche=` et `/quiz?quiz=` n'existent pas ; les écrire
aurait produit deux liens qui déposent Massimo sur une page qui ignore son paramètre — un
cul-de-sac silencieux, pire qu'un lien absent parce qu'il a l'air de marcher.

⚠️ **`resource_id` reste persisté et reste inutilisé pour `fiche` et `quiz`, délibérément.** La
donnée est juste ; c'est la route qui manque. Le jour où l'une des deux devient adressable, le plan
gagne le grain fin **sans migration ni recomposition**.

**Les deux autres sorties, écartées mais datées :**

- **Charger le quiz puis naviguer vers `/quiz/session` avec l'état** (le mode `quiz` de
  `notionRoutes.ts`, qui existe). **Reportée, pas écartée** : elle donne le grain fin au quiz au
  prix d'une latence et d'un **cas d'échec à traiter sur un écran d'enfant** — un plan qui ne
  s'ouvre pas est un plan cassé. Son déclencheur : le jour où l'on accepte ce cas d'échec ailleurs.
- **Rendre `/fiches` et `/quiz` adressables par id.** C'est un chantier à soi, sur deux pages que
  ce chantier ne touche pas.

> ⚠️ **Ce que Massimo perd, dit franchement** : l'étape `fiche` le dépose sur les fiches de la
> matière, pas sur celle de son chapitre. C'est un pas de plus. Le plan continue de tenir son rôle
> du §8 — dire **par où commencer** — mais il ne téléporte pas.

### 3. Rétro-planifié sur les jours restants, borné, et jamais la veille au soir

Les étapes sont réparties de **demain jusqu'à la veille de l'échéance** — jamais le jour même :
un plan qui demande de réviser le matin du contrôle est une source d'angoisse, pas une aide.

| Jours restants | Étapes |
|---|---|
| 0 ou 1 | **aucun plan** — il n'y a pas de « rétro-planning » sur zéro jour |
| 2 à 3 | 2 étapes |
| 4 et plus | 3 étapes, une par jour, en commençant au plus tôt |

**Plafond dur à 3.** Un plan qui s'allonge avec le temps disponible devient une charge que
l'échéance ne justifie pas — c'est le motif de l'arriéré, déplacé dans le futur.

### 4. 🔴 Génération à la PREMIÈRE LECTURE, puis figé — et une date qui bouge le RÉVOQUE

Le plan est composé et **persisté** la première fois qu'une surface le demande (§8). Ensuite il ne
se recompose jamais — même si une fiche est validée entre-temps.

**Sauf un cas** : si Papa **déplace la date**, le plan existant est **supprimé** et un nouveau sera
composé à la lecture suivante. Un rétro-planning est une fonction de la date ; le garder après un
déplacement afficherait des jours qui ne veulent plus rien dire.

⚠️ **Les étapes déjà cochées sont perdues avec lui, et c'est assumé** : elles portaient des jours
qui n'existent plus.

### 5. Une coche d'étape est une DÉCLARATION de Massimo — option (A)

Le §3 de l'ADR-0025 dit *« cocher ne prouve rien, ne pas cocher ne prouve rien »*, et l'`adr-0025`
§14.7 en a tiré que Papa lit **« coché »**, jamais **« fait »**. Mais le plan est le premier objet
du dépôt où la **preuve serait disponible** : une session de cartes laisse un `SpacedReviewAttempt`,
un quiz laisse une tentative.

| | **(A) Déclaratif — Massimo coche** | **(B) Prouvé — l'activité valide** |
|---|---|---|
| Cohérence | ✅ identique à la coche d'agenda (§2b, *« le seul geste qui rend l'objet sien »*) | ⚠️ crée **deux** sémantiques de coche sur le même écran |
| Coût | quasi nul | une résolution par type d'étape, et un « depuis quand » à définir |
| Ce que Papa lit | « coché », comme partout | « fait », vrai pour la première fois |
| Risque | Massimo coche sans faire | une étape faite **avant** la génération du plan compte-t-elle ? |

**Retenue : (A)** — décision du commanditaire, 2026-08-10, conforme à la recommandation. Trois
raisons : la cohérence d'écran prime sur la précision quand les deux coches sont **côte à côte** ;
(B) rouvre le §3 sans que rien ne le demande ; et le plan sert à **savoir quoi faire**, pas à
mesurer.

**Concrètement** : Massimo coche, comme il coche un devoir. **Aucun XP, aucune célébration** — le
geste est déclaratif, il ne se récompense pas, sinon il apprend à cocher (§3). Papa lit
**« cochée »**, jamais « faite » (§14.7).

⚠️ **(B) n'est pas écartée pour toujours, elle est REPORTÉE** — et son déclencheur est nommé : le
jour où Papa demandera à lire autre chose qu'une déclaration. Ce jour-là, la trace existe déjà
(`SpacedReviewAttempt`, tentatives de quiz) ; c'est la **sémantique double** qui coûtera, pas la
donnée.

### 6. `step_type = "lesson"` reste mort — et cette décision est enfin motivée

La Décision 1 rend `MissionStep` hors sujet : le plan n'en utilise pas. `STEP_LESSON` n'a donc
**toujours aucun consommateur**, et le ressusciter serait une troisième surface de « lire un
cours ».

⚠️ **Le §14.6 le nommait comme un manque à combler.** Ce n'en était pas un : c'était un symptôme du
fait qu'un plan n'est pas une mission.

### 7. Papa voit le plan, en lecture, sur sa page agenda

Une ligne par échéance : *« plan en 3 étapes · 1 cochée »*. Aucun geste, aucune édition, aucune
génération manuelle — le plan est un service rendu à Massimo, pas un objet de pilotage.

⚠️ **« cochée », jamais « faite »** (§14.7) — la Décision 5 ayant retenu (A), c'est la seule
formulation vraie : le serveur ne sait rien d'autre qu'un `done_at` posé par une route élève.

### 8. « Ce qui arrive » consomme `has_plan` — et le « Préparer · bientôt » meurt

> 🔴 **AJOUTÉE le 2026-08-10, VUE À L'ÉCRAN** pendant la vérification de la Session B — aucun test
> ne la désignait. Amendement validé par le commanditaire.

`UpcomingCard` portait depuis le Lot 1 un bouton **grisé** « Préparer · bientôt », au titre de
l'ADR-0024 §4 (*« montrer la porte à venir montre le chemin »*). **Cette justification est morte
avec ce chantier** : le plan existe, et « bientôt » est devenu un **mensonge affiché à Massimo**.

Pire : `has_plan` a été ajouté au contrat par la Session A **pour cette carte**, et n'avait
**aucun consommateur** — un champ servi, testé, et mort.

| `has_plan` | Rendu |
|---|---|
| `true` | un bouton **« ✦ Ton plan »** — les mots exacts de l'encadré qu'il ouvre |
| `false` | **rien.** Ni grisé, ni « bientôt », ni espace réservé |

**Le `false` est définitif, pas transitoire** : une échéance sans chapitre, ou à J+1, n'aura
**jamais** de plan. Lui promettre « bientôt » serait mentir une seconde fois.

⚠️ **Ce n'est pas un revirement sur l'ADR-0024 §4.** Là-bas, le gris dit *« Papa ne l'a pas encore
produit »* sur un catalogue fait pour être parcouru. Ici, il disait *« ZETIS ne sait pas encore le
faire »* — et ZETIS sait, désormais. Le premier est une **attente**, le second était une **dette**.

🔴 **Le bouton déplie « la suite » avant de défiler.** L'échéance visée est à J+2 ou plus, donc dans
la section repliée : une ancre seule n'aurait rien trouvé, et le bouton serait redevenu mort deux
lignes après qu'on ait tué le précédent.

## Périmètre

**Slice A — backend.** Table + migration ; composition depuis `resolve_panoply` ; règle de
répartition §3 ; génération-figement §4 ; révocation sur déplacement de date ; `plan_steps` et
`has_plan` réellement servis ; route de coche ; test-verrous.

**Slice B — Massimo.** Le `✦` sur le jour dans la bande, le plan **sous l'échéance** (Décision
2 ter), les étapes cliquables **au grain réellement atteignable** (Décision 2 quater), la coche, et
la mort du « Préparer · bientôt » de « Ce qui arrive » (Décision 8).

**Slice C — Papa.** La ligne de lecture (Décision 7).

**Hors périmètre, explicitement** — tout LLM · `step_type = lesson` · toute modification du moteur
de missions · la génération manuelle par Papa · les notifications · un plan sur une échéance sans
chapitre · l'élargissement de `resolve_panoply`.

## Conséquences

**Positives** — l'agenda cesse d'être un carnet ; le §8 rôle 1, *« le seul rôle qui justifie la
fonctionnalité »*, existe enfin ; `plan_steps` et `has_plan` cessent d'être des champs morts au
contrat ; et le prédicat de disponibilité gagne un **troisième consommateur**, ce qui le rend plus
solide, pas plus fragile.

**Négatives / coûts** — **une migration**, la première depuis trois chantiers ; un objet persisté
de plus, avec son cycle de vie et sa suppression sur déplacement de date ; une **perte de coches
assumée** quand la date bouge ; et un plafond de 3 étapes qui paraîtra arbitraire le jour où un
chapitre en mériterait 6.

## Le signal qui dirait qu'on s'est trompé

Le pari : un plan **court et daté** aide plus qu'une liste complète. Ce qui dirait le contraire :
les étapes sont **cochées en rafale le dernier jour**, ou **jamais**. Le premier cas dit que le
plan est subi et rattrapé la veille — donc qu'il n'a pas aidé ; le second, qu'il n'est pas lu.

Les deux se lisent dans `done_at` par rapport à `day_offset`, **sans instrumentation neuve**.

## Suivi

- **Test-verrou** — une échéance à J+0 ou J+1 n'a **aucun** plan, et `has_plan` est faux.
- **Test-verrou** — un chapitre dont aucune activité n'est disponible ne produit **aucune étape**,
  et `has_plan` est faux. ⚠️ Assertion sur l'**absence**, jamais sur une liste vide affichée.
- **Test-verrou** — le plan ne se recompose **pas** quand une fiche est validée après coup.
- **Test-verrou** — déplacer la date **supprime** le plan, coches comprises.
- **Test-verrou** — l'ordre des étapes est celui de `resolve_panoply`, jamais réordonné.
- **Test-verrou de dépôt** — aucune requête de disponibilité **réécrite** dans `modules/agenda/` :
  le module n'appelle que `resolve_panoply` et `chapter_servable_count` (Décision 2 amendée).
- 🔴 **Test-verrou** — un chapitre dont une notion a une carte **sans échéance** (`due_at IS NULL`)
  ne produit **aucune** étape `revision`. C'est LE cas où la panoplie et le deck divergent, et
  c'est le test qui aurait attrapé la rédaction d'origine de la Décision 2. ⚠️ Le saboter en
  composant `revision` depuis `resolve_panoply` doit **rougir**.
- **Test-verrou** — jamais deux étapes du **même type** dans un plan (Décision 2 bis), même sur un
  chapitre à six notions testables.
- **Test-verrou** — jamais plus de 3 étapes, et jamais une étape le jour de l'échéance.
- **Test-verrou** — cocher une étape ne crédite **aucun XP** et ne déclenche aucune célébration
  (Décision 5 (A)). ⚠️ Le saboter en ajoutant un `award_xp` doit **rougir** : c'est la garde qui
  empêche Massimo d'apprendre à cocher.
- **Test-verrou** — une étape se coche **même si l'activité n'a jamais été jouée**, et l'inverse :
  jouer l'activité ne coche **rien**. C'est ce qui distingue (A) de (B), et sans lui la frontière
  se franchirait par inadvertance.
- 🔴 **Test-verrou** — aucune étape ne pointe vers une route **inventée** : `fiche` mène à
  `/fiches/<slug>` et `quiz` à `/quiz?subject=<slug>` (Décision 2 quater). ⚠️ Le saboter en
  remettant `?fiche=<id>` doit **rougir** — la page ignore le paramètre, le lien s'ouvre sur un
  cul-de-sac silencieux, et **aucun test de rendu ne le verrait** : le lien existe, il est
  cliquable, il a l'air de marcher.
- **Test-verrou** — le libellé dit son grain **par le pluriel et par le verbe** (Décision
  2 quater) : *« Lire les fiches »*, *« Choisir un quiz »*, *« Réviser ce chapitre »*. Saboter en
  singulier (*« Lire la fiche »*) ou en quiz désigné (*« Petit quiz »*) doit **rougir**.
- 🔴 **Test-verrou** — le libellé **ne répète pas la matière**. Mesuré : elle se coupait à
  l'ellipse. Saboter en remettant `de ${subject.name}` doit **rougir** — sans quoi le défaut
  reviendra à la première relecture qui trouvera le libellé « trop vague ».
- **Test-verrou** — une échéance **sans matière** rend ses étapes **sans lien**, et la coche
  reste. Le plan ne disparaît pas faute de destination.
- 🔴 **Test-verrou** — plus aucun **« bientôt »** sur `UpcomingCard`, `has_plan` vrai ou faux
  (Décision 8). ⚠️ Le saboter en remettant le bouton grisé doit **rougir** : c'est le contrôle de
  l'étape 4bis porté dans le CODE, et non dans un document que personne ne relit.
- **Test-verrou** — `has_plan` faux ⇒ **aucun bouton**, ni grisé, ni explicatif. Et sans rappel
  `onOpenPlan`, aucun bouton non plus : la garde est portée par le **rendu**, pas par l'appelant.
- Mise à jour de `docs/frontend-massimo/page-agenda.md` (`plan_steps` cesse d'être « vide en Lot 1 »)
  et de `docs/frontend-papa/page-agenda.md`.
- **Relecture visuelle humaine AVANT la PR**, sur les deux interfaces.
- Commit suggéré : `feat(agenda): a preparation plan that tells the child where to start`.

## Décisions validées (commanditaire, 2026-08-10)

**Les sept sont gelées.** On les **relit**, on ne les rouvre pas.

1. ✅ Table dédiée `agenda_plan_steps`, pas `Mission` — 🔴 **une migration**.
2. ✅ **AMENDÉE le 2026-08-10, avant la première ligne de code** : chaque étape interroge le
   prédicat de **son grain** — `resolve_panoply` pour `cours`/`fiche`/`quiz` (notion),
   `chapter_servable_count` pour `revision` (chapitre). La rédaction d'origine (*« et de nulle
   part ailleurs »*) aurait produit une étape ouvrant sur un **400**.
2 bis. ✅ **AJOUTÉE le 2026-08-10** : une étape par **TYPE**, jamais par notion. Trois types, donc
   trois étapes au maximum — le plafond cesse d'être arbitraire. `cours` et `eli5` exclus.
2 ter. ✅ **AJOUTÉE le 2026-08-10**, au read-before-code de la Session B : `PlanStepOut` porte
   **`agenda_item_id`**, et le plan se rend **sous l'échéance**. Le refuser rendait la maquette
   inconstructible et laissait les étapes orphelines sur une semaine à deux contrôles. **Aucune
   migration.**
2 quater. ✅ **AJOUTÉE le 2026-08-10**, au câblage de la Session B : une étape mène au **grain
   réellement atteignable** — la matière pour `fiche` et `quiz`, le chapitre pour `revision` — et
   **son libellé le dit** (règle de l'`adr-0047`), par le **pluriel** et par le **verbe** :
   *« Lire les fiches »*, *« Choisir un quiz »*, *« Réviser ce chapitre »*. `/fiches?fiche=` et
   `/quiz?quiz=` **n'existent pas** ; les écrire aurait produit des liens qui ont l'air de marcher.
   `resource_id` reste persisté et inutilisé pour deux types sur trois, **délibérément**. La
   variante « charger le quiz puis `/quiz/session` » est **reportée, pas écartée**.
   ⚠️ **Corrigée le jour même sur MESURE** : la première rédaction mettait la matière dans le
   libellé (*« Lire les fiches de Mathématiques »*) — 193 px pour 151 disponibles, et c'est le nom
   de la matière qui se coupait.
3. ✅ Rétro-planning **borné à 3**, de demain à la veille, jamais le jour de l'échéance ; aucun
   plan à J+0 ou J+1.
4. ✅ Figé à la première lecture ; **révoqué** si la date bouge, coches comprises.
5. ✅ **La coche est une DÉCLARATION — option (A).** Prise par le commanditaire après exposé des
   deux options et de leur maquette ; conforme à la recommandation. **(B) est REPORTÉE, pas
   écartée** : son déclencheur est le jour où Papa demandera à lire autre chose qu'une déclaration.
6. ✅ `step_type = lesson` reste mort — et la décision est motivée, pas subie.
7. ✅ Papa **lit** le plan, ne le pilote pas.
8. ✅ **AJOUTÉE le 2026-08-10, vue À L'ÉCRAN** : « Ce qui arrive » consomme `has_plan`. Le bouton
   grisé **« Préparer · bientôt »** est **retiré** — la fonctionnalité qu'il annonçait est livrée,
   donc « bientôt » était devenu faux. `has_plan` vrai ⇒ **« ✦ Ton plan »**, qui déplie « la suite »
   et défile jusqu'au plan ; `has_plan` faux ⇒ **rien**, définitivement.
