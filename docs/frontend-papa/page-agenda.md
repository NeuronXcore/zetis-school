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

Une grille de lignes vides — `matière` · **`chapitre`** · `intitulé` · `date` · `type` —
« Ajouter une ligne », puis **un seul envoi** (`POST /api/agenda/items` accepte une liste).
L'ordre des colonnes suit la cascade : chaque menu alimente le suivant, de gauche à droite.

Le **chapitre** (référentiel de l'année active, facultatif) est la colonne la plus rentable de
la grille : c'est elle qui rend l'échéance analysable (ADR-0025 §11) sans aucun LLM. Un item
sans chapitre reste parfaitement valide — il n'est simplement pas exploitable pour l'analyse.

> **L'intitulé est un menu depuis le 2026-08-10** (addendum ADR-0025 §13) : les **cours validés**
> du chapitre choisi, plus une option **« ✏️ Autre (texte libre) »**. Ce que Papa y tapait existe
> déjà en base — la page Matières l'affiche, `lessons.title` — et le retaper le faisait dériver.
>
> La porte de sortie n'est pas un compromis : c'est le cas **majoritaire** d'un `devoir`, qui
> s'énonce par des consignes et des références de manuel, presque jamais par le titre d'un cours du
> référentiel — le menu ne peut donc pas le proposer. **Sans chapitre, pas de menu** — le champ
> reste un texte, comme le sélecteur de chapitre n'affiche jamais un menu vide.
>
> ⚠️ **Aucun placeholder d'exemple** (retiré le 2026-08-10) : l'en-tête de colonne dit déjà
> « Intitulé », et depuis le §13 le champ est un menu dès qu'un chapitre est choisi — un exemple
> de saisie libre y proposait la mauvaise habitude.
>
> ⚠️ Les cours **non validés sont exclus**, et ce n'est pas de la cohérence d'affichage :
> `label` est la **seule chaîne de l'agenda que Massimo lit**. Conséquence assumée — sur un
> chapitre dont les leçons sont en brouillon, la liste est vide et l'intitulé reste libre.
>
> ⚠️ **Rien de ce que Papa a tapé n'est effacé** : un texte saisi *avant* le chapitre survit au
> choix du chapitre. C'est la seule transition capable de perdre une saisie, et un test-verrou
> la garde.

#### Les quatre types

Le vocabulaire est celui du **collège**, pas celui de ZETIS.

| Type | Ce que c'est | Déclenche la production | « Ce qui arrive » chez Massimo |
|---|---|---|---|
| `devoir` *(défaut)* | des exercices à faire pour une date | ✅ en dernier | ❌ — déjà dans la bande |
| `lecon` — **« Leçon à apprendre »** | un cours à mémoriser | ✅ **en 2ᵉ** | ❌ *(voir addendum §14.3)* |
| `controle` | une évaluation annoncée | ✅ **en 1ᵉʳ** | ✅ |
| `rendu` | un exposé, un dossier, un projet à remettre | ❌ jamais | ✅ |

> **`lecon` ajouté le 2026-08-10** (addendum ADR-0025 §14). Il manquait le travail que ZETIS sait
> le mieux accompagner : des exercices se font sans lui, une leçon s'apprend avec ce qu'il produit.
> Le libellé est **« Leçon à apprendre » en toutes lettres** — c'est l'ambiguïté du mot « devoir »
> qui a fait ajouter ce type.
>
> ⚠️ C'est le **premier `kind` qui déclenche sans être annoncé** dans « ce qui arrive ». La
> dissymétrie est voulue : `UpcomingItemOut` ne porte aucun champ `kind`, la section est plafonnée
> à 4, et les leçons — fréquentes — y chasseraient les contrôles.
>
> ⚠️ **Le seul KPI qui lit le type reste `contrôles à venir`** : il ne compte que `controle`.

Le mode d'usage réel est « je relève l'ENT du dimanche soir », pas « j'ajoute un devoir ». Un
formulaire item-par-item produirait le même abandon qu'une page vide.

### Charge de la semaine

Sept colonnes. Sous chaque jour, un trait de **charge** (nombre d'échéances) — jamais une
performance. Chaque item porte :

- son **origine** (`par Massimo` / `par vous`) ;
- son **état** (`à faire` / `✓ coché`) — **jamais « fait »** (addendum §14.7) : le seul fait connu
  est que Massimo a touché une case, et §3 le dit sans détour (« cocher ne prouve rien »). Papa
  **lit** une déclaration dont il n'est pas l'auteur ; chez Massimo, le bouton reste « marquer
  comme fait », parce que lui la **produit** ;
- le cas échéant `corrigé` (édité par Papa) et `masqué par Massimo` (atténué, **jamais
  disparu**) ;
- son **plan de préparation**, depuis le 2026-08-10 (`adr-0050` Décision 7) : une étiquette
  violette **`✦ 1/3`** — *cochées / proposées*. 🔴 **`0` étape ⇒ aucune étiquette** : la plupart
  des échéances n'ont pas de plan (il faut un chapitre et au moins 2 jours), et un `✦ 0/0` sur
  chacune ferait de la grille un tableau de manques — un manque dont Papa n'est pas l'auteur.

L'écart déclaré / fait **se lit ici**. Il ne produit **aucune alerte, aucun badge rouge, aucun
compteur d'arriéré** : l'ADR interdit d'émettre un événement d'échec, l'UI ne doit pas le
réintroduire par la couleur.

### Panneau de détail

Intitulé · date · type · **chapitre** éditables ; **état en lecture seule** ; **plan de
préparation en lecture seule** ; **note privée** (`parent_note`) avec la mention explicite qu'elle
n'est jamais servie à Massimo ; actions Enregistrer / Archiver.

> **Le plan de préparation — quatrième refus** (`adr-0050` Décision 7, 2026-08-10).
> *« ZETIS a proposé **3 étapes** à Massimo, réparties jusqu'à la veille. **1 cochée** par lui. »*
>
> 🔴 **Aucun geste** : pas de bouton « générer », pas d'édition d'étape, pas de coche. Le plan est
> un **service rendu à Massimo**, pas un objet de pilotage — le donner à corriger en ferait une
> prescription d'adulte, et l'agenda redeviendrait le carnet que l'ADR-0025 §8 refuse.
>
> 🔴 **Et lire cet écran ne COMPOSE rien.** Le compte vient de `plan_counts`, qui compte les
> étapes **existantes**. S'il passait par `get_or_create_plan`, **Papa figerait le plan de son
> fils** en relevant l'ENT le dimanche soir, sur un référentiel antérieur aux fiches qu'il
> s'apprête justement à valider. Même frontière que `done_at` : Papa lit, il n'écrit pas (§2b).
>
> ⚠️ **« cochée », jamais « faite »** (§14.7), et **deux entiers, jamais les étapes** : les servir
> ici ferait lire à Papa ce que ZETIS a proposé, donc lui donnerait envie de le corriger.
>
> ⚠️ Sans plan : **la section n'existe pas**. Et déplacer la date **supprime** le plan (Décision 4)
> — la réponse du `PATCH` le dit tout de suite, elle ne rend pas le compte d'avant.

> **L'intitulé y est le même menu qu'à la saisie** (addendum ADR-0025 §13), branché sur le
> chapitre **en cours d'édition** — changer de chapitre change la liste avant tout enregistrement.
> **Non-régression voulue** : un item existant porte presque toujours un libellé qui ne figure
> dans aucune liste ; il s'affiche **inchangé, en texte libre**, et rien ne bouge tant que Papa
> ne clique pas « ↩ choisir un cours ». Ce bouton **vide le champ**, et son libellé le dit.

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

> **Sorti de sa cachette le 2026-08-10** (addendum ADR-0025 §14.5). Il fallait jusque-là **ouvrir
> le panneau de détail** *et* que l'échéance porte déjà un chapitre — une capacité livrée que
> personne ne trouve est, à l'usage, une capacité absente. Une **puce 🎯** apparaît désormais sur
> l'item lui-même, dans la vue semaine comme dans la liste plate.
>
> ⚠️ **Jamais de bouton mort** : la disponibilité se calcule **sur la page**, une fois
> (`commandFor` rend un geste ou `null`). Il faut un chapitre **et** une matière rattachée à
> l'année active — `sysId` peut être `null`. Une échéance archivée n'en porte pas.
>
> Le panneau **nomme ce que ZETIS peut faire** de l'échéance, et pas seulement ce qu'il ne pourra
> pas : ce que Massimo recevra (découvrir · verbaliser · reconstruire · mini-quiz) et, en toutes
> lettres, que **« réviser les cartes du chapitre » n'est pas encore possible**. Un dispositif qui
> se tait sur ses capacités est indistinguable d'un dispositif qui n'en a pas.

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
`parent_note`, `dismissed_at`, horodatages), plus `plan_steps_total` / `plan_steps_done`
(`adr-0050`) — **deux entiers, jamais les étapes**.

> ⚠️ **Toutes** les routes ci-dessous les servent, y compris les unitaires, et c'est délibéré :
> une route qui rendrait un compte périmé mentirait juste après le geste qui l'a changé. Le cas
> concret est le `PATCH` de date, qui **supprime** le plan et doit répondre `0/0`.
>
> Côté service, `plan` est un kwarg **obligatoire** de `pilot_out` — un défaut à `{}` ferait
> disparaître le plan de l'écran de Papa sans qu'aucun test ne rougisse. Même discipline que
> `revisable` sur `student_out`.

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
