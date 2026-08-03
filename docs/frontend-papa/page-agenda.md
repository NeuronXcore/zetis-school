# Page Papa — Agenda (cahier de texte)

> Décision : `docs/decisions/adr-0025-agenda-scolaire.md`.
> Maquette : `maquette-papa-agenda.html` — autorité sur la **forme**, cette spec sur le
> **fond**. ⚠️ La maquette est en **thème clair** (convention
> `maquette-papa-quiz-pilotage.html`) ; si la bascule vers le sombre `papa-*` évoquée en
> ADR-0024 §Suivi est engagée, elle est à reprendre avant la slice.

## Objectif

Papa inscrit rapidement plusieurs échéances (un contrôle annoncé, une semaine relevée sur
l'ENT), lit la charge de la semaine de Massimo, annote — et **ne peut ni cocher, ni supprimer
définitivement, ni réécrire silencieusement**.

### Accès

Route `/agenda`, **entrée de sidebar à part entière**, placée **après Dashboard, avant
Progression**.

Contrairement à Massimo (accès par l'Accueil en phase 0), Papa obtient une entrée dès le
Lot 1 : il est en phase 0 la **seule** source d'items, et il vient ici pour **écrire**, de
façon répétée et hors de tout parcours. Une surface de saisie régulière atteinte par
rebond serait sautée.

Ni dans le Dashboard (analytique) ni dans le Cahier de bord (rétrospectif) : c'est une
surface de saisie, la seule de la sidebar Papa avec la Couverture.

> Vérifier l'ordre réel de `PapaSidebar` avant insertion — l'intention est « dans le premier
> tiers, près du Dashboard », pas un index absolu.

## Ton UX

Registre Papa : analytique, tableau, filtres, détail au clic. **Ne réutilise pas** la bande de
Massimo — ce n'est pas le même objet, et les deux interfaces ne se mélangent jamais (ADR-0002).

## Les trois refus, visibles dans l'interface

Ils ne sont pas seulement absents du code : l'UI les **énonce**, parce qu'une règle de
co-édition non dite est vécue comme un bug.

1. **Aucune case à cocher, nulle part.** L'état est une pastille en **lecture seule**, et le
   panneau de détail le dit : *« seul Massimo peut cocher »*. Si l'affordance existait, la
   coche deviendrait une validation parentale et l'objet basculerait du côté du contrôle. Si
   l'API renvoie 403 sur une écriture de `done_at`, c'est un bug de cette page.
2. **L'édition prévient.** Modifier un item de Massimo affiche un avertissement explicite : la
   correction portera la mention « complété par papa » dans son agenda. **Pas de modification
   silencieuse** — Papa décide en sachant que ce sera vu.
3. **Archiver, pas supprimer.** Libellé « Archiver », `ConfirmDialog` obligatoire, ligne
   conservée, filtre « Archivés » pour la retrouver.

## Phase 0 — Papa est le seul à saisir (ADR-0025 §10)

En Lot 1, Massimo **lit et coche**, il ne saisit pas. La page Papa est donc la **seule** source
d'items : la qualité de l'agenda de Massimo dépend entièrement d'elle. La saisie en lot n'est
pas un confort, c'est la condition de survie de l'objet.

**Interrupteur d'ouverture** — un réglage discret (pas un KPI, pas une bannière) :
*« Autoriser Massimo à ajouter ses propres échéances »*, qui bascule
`AGENDA_STUDENT_ENTRY_ENABLED` — persisté en base (`app_settings`, `GET`/`PUT
/api/agenda/settings`), la variable d'env restant la valeur par défaut tant qu'aucune ligne
n'existe. **Jamais automatique** : le déclencher sur un seuil de coches
observé ferait dépendre un droit d'une surveillance. Le geste est celui de Papa, à la date
qu'il juge bonne — revue prévue à 4 semaines (ADR-0025 §Suivi).

## Anatomie de l'écran

### KPI

`échéances cette semaine` · `contrôles à venir` · `saisis par Massimo / par vous` ·
`cochés par Massimo`.

En phase 0, le troisième KPI affiche mécaniquement `0 / n` — le garder tel quel : il rend
visible que la bascule n'a pas encore eu lieu, sans en faire un reproche.

> **Interdit : un compteur d'items non faits.** C'est la métrique qu'un dashboard produirait
> naturellement, et c'est exactement l'objet que l'ADR-0025 §3 interdit d'émettre côté serveur
> (`agenda_item_missed` n'existe pas). Le remettre ici contournerait l'invariant par
> l'affichage. Le compteur retenu est son inverse positif.

### Saisie en lot

Une grille de lignes vides — `matière` · `intitulé` · `date` · `type` · **`chapitre`** —
« Ajouter une ligne », puis **un seul envoi** (`POST /api/agenda/items` accepte une liste).

Le **chapitre** (référentiel de l'année active, facultatif) est la colonne la plus rentable de
la grille : c'est elle qui rend l'échéance analysable (ADR-0025 §11) sans aucun LLM. Un item
sans chapitre reste parfaitement valide — il n'est simplement pas exploitable pour l'analyse.

Le mode d'usage réel est « je relève l'ENT du dimanche soir », pas « j'ajoute un devoir ». Un
formulaire item-par-item produirait le même abandon qu'une page vide.

### Charge de la semaine

Sept colonnes. Sous chaque jour, un trait de **charge** (nombre d'échéances) — jamais une
performance. Chaque item porte :

- son **origine** (`par Massimo` / `par vous`) ;
- son **état** (`à faire` / `✓ fait`) ;
- le cas échéant `corrigé` (édité par Papa) et `masqué par Massimo` (atténué, **jamais
  disparu**).

L'écart déclaré / fait **se lit ici**. Il ne produit **aucune alerte, aucun badge rouge, aucun
compteur d'arriéré** : l'ADR interdit d'émettre un événement d'échec, l'UI ne doit pas le
réintroduire par la couleur.

### Panneau de détail

Intitulé · date · type · **chapitre** éditables ; **état en lecture seule** ; **note privée**
(`parent_note`) avec la mention explicite qu'elle n'est jamais servie à Massimo ; actions
Enregistrer / Archiver.

> **Le chapitre est éditable ICI depuis le 2026-08-03** (addendum ADR-0035). Il ne l'était qu'à la
> saisie en lot : un item mal saisi — ou saisi par Massimo, qui n'a aucun sélecteur — restait
> **définitivement stérile**, alors que l'API l'acceptait déjà. Sans matière, pas de menu vide mais
> une phrase qui dit quoi faire.
>
> Une échéance **sans chapitre le DIT** : *« ZETIS ne pourra ni préparer cette échéance ni commander
> de missions dessus »*. Sans ça, le déclencheur paraît en panne. ⚠️ Le message est
> **indépendant du `kind`** — recopier `TRIGGERING_KINDS` au front en ferait une seconde source de
> vérité, qui a divergé le jour même où `devoir` y est entré.

### Panneau d'analyse (Lot 3, ADR-0025 §11) — **partiellement livré**

✅ **Livré le 2026-08-03** : sur une échéance portant un `chapter_id`, le bouton **« 🎯 Commander
les missions de ce chapitre »** ouvre la modale existante **pré-remplie** (porte `deadline`,
chapitre de l'item, `due_date` = son échéance, `force_priority` armé).

> **Aucune ligne de backend** : `resolve_chapter_notions` est déjà scopé par chapitre,
> `create_command_missions` prend déjà `due_date` + `force_priority`, `gate: "deadline"` existait
> **depuis l'origine** — déclaré et jamais alimenté. L'ADR-0025 avait raison : « le pont ne demande
> aucun mécanisme neuf ».

⛔ **Pas livré** : l'encart à trois compteurs (*n notions fragiles · n quiz sous le seuil · n cartes
en attente*). Les deux premiers se composent avec l'existant ; le troisième non —
`evidence.srs_pressure` est **par matière**, pas par chapitre.

⚠️ **Le Commander n'est PAS idempotent** : commander deux fois la même échéance crée des doublons
(`Mission` n'a aucune référence à l'agenda). Tolérable tant que c'est un geste manuel ; **obligatoire
à corriger le jour où le scan suggérerait des missions**.

**Un GESTE de Papa, jamais le scan.** ZETIS **produit du contenu** sans clic (ADR-0035) ; il ne
**prescrit pas du travail** à Massimo sans clic — `command.py` fonde la validation des missions sur
« le preview/confirm avec notions décochables EST l'approbation humaine ».

**Papa-side strictement.** Rien de cette analyse n'atteint Massimo : il voit l'échéance et, le
cas échéant, le travail qui en découle — jamais le diagnostic qui l'a motivé.

### Filtres

Matière · période (semaine en cours / suivante / tout à venir / archivés).
Conventions des pages Papa existantes, sans en inventer de nouvelles.

## Données API

Préfixe `/api/agenda`, `require_parent`. Schéma `AgendaItemPilotOut` (tout, y compris
`parent_note`, `dismissed_at`, horodatages).

- `GET /items?from=&to=` → items archivés inclus, marqués.
- `POST /items` → `created_by` forcé à `parent`. **Accepte un corps en lot.**
- `PATCH /items/{id}` → sur un item `created_by='student'`, le service renseigne
  **automatiquement** `edited_by_parent_at`. Toute tentative d'écrire `done_at` → **403**
  (refus d'autorité, pas de validation).
- `PUT /items/{id}/note` → `parent_note`.
- `DELETE /items/{id}` → **archivage** (`dismissed_at`), la ligne reste en base.

## Asymétrie de visibilité (assumée)

| | Massimo voit | Papa voit |
|---|---|---|
| items des deux | ✅ | ✅ |
| item masqué par Massimo | ❌ | ✅ (atténué) |
| item archivé par Papa | ❌ | ✅ (filtre) |
| `parent_note` | ❌ **jamais** | ✅ |
| horodatages d'édition | marqueur seul | complets |

Le parent voit tout, l'enfant voit ce qui le concerne.

## Hors périmètre

- Remontée de l'agenda dans le Dashboard, le Cahier de bord ou le **contexte d'évidence du
  Conseil de classe** (ADR-0020) : **différé et non tranché**. Un item non fait ne doit pas
  devenir un signal pédagogique — et surtout pas entrer dans le contexte narré par le LLM, ce
  qui contournerait l'invariant « non probant » par la porte de la narration.
- Import Pronote/ENT, saisie photo/OCR (hors ADR en v1).
- Plan de préparation, parsing (Lot 2).
- Toute UI Massimo.
