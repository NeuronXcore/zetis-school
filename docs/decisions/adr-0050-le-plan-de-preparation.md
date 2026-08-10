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

### 2. Le plan se compose depuis `resolve_panoply`, et de nulle part ailleurs

Chapitre → `ordered_chapter_skill_ids` → `resolve_panoply` → on **retient ce qui est disponible**.

🔴 **Aucune requête de disponibilité écrite dans `agenda`.** C'est le second prédicat que
l'addendum ADR-0024 interdit nommément.

⚠️ **L'ordre pédagogique vient de `resolve_panoply`**, il ne se réordonne pas ici : *comprendre,
puis mémoriser, puis se tester*. Un plan qui testerait avant d'expliquer serait pédagogiquement
faux, et le dépôt porte déjà la réponse.

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

## Périmètre

**Slice A — backend.** Table + migration ; composition depuis `resolve_panoply` ; règle de
répartition §3 ; génération-figement §4 ; révocation sur déplacement de date ; `plan_steps` et
`has_plan` réellement servis ; route de coche ; test-verrous.

**Slice B — Massimo.** Le plan sous le jour dans la bande (`✦`), les étapes cliquables vers leur
activité, la coche.

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
- **Test-verrou de dépôt** — aucune requête de disponibilité dans `modules/agenda/` : le module
  n'importe que `resolve_panoply`.
- **Test-verrou** — jamais plus de 3 étapes, et jamais une étape le jour de l'échéance.
- **Test-verrou** — cocher une étape ne crédite **aucun XP** et ne déclenche aucune célébration
  (Décision 5 (A)). ⚠️ Le saboter en ajoutant un `award_xp` doit **rougir** : c'est la garde qui
  empêche Massimo d'apprendre à cocher.
- **Test-verrou** — une étape se coche **même si l'activité n'a jamais été jouée**, et l'inverse :
  jouer l'activité ne coche **rien**. C'est ce qui distingue (A) de (B), et sans lui la frontière
  se franchirait par inadvertance.
- Mise à jour de `docs/frontend-massimo/page-agenda.md` (`plan_steps` cesse d'être « vide en Lot 1 »)
  et de `docs/frontend-papa/page-agenda.md`.
- **Relecture visuelle humaine AVANT la PR**, sur les deux interfaces.
- Commit suggéré : `feat(agenda): a preparation plan that tells the child where to start`.

## Décisions validées (commanditaire, 2026-08-10)

**Les sept sont gelées.** On les **relit**, on ne les rouvre pas.

1. ✅ Table dédiée `agenda_plan_steps`, pas `Mission` — 🔴 **une migration**.
2. ✅ Composition depuis `resolve_panoply` **uniquement**, dans son ordre.
3. ✅ Rétro-planning **borné à 3**, de demain à la veille, jamais le jour de l'échéance ; aucun
   plan à J+0 ou J+1.
4. ✅ Figé à la première lecture ; **révoqué** si la date bouge, coches comprises.
5. ✅ **La coche est une DÉCLARATION — option (A).** Prise par le commanditaire après exposé des
   deux options et de leur maquette ; conforme à la recommandation. **(B) est REPORTÉE, pas
   écartée** : son déclencheur est le jour où Papa demandera à lire autre chose qu'une déclaration.
6. ✅ `step_type = lesson` reste mort — et la décision est motivée, pas subie.
7. ✅ Papa **lit** le plan, ne le pilote pas.
