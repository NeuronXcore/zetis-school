# Page Papa — Diagnostic

> Route `/diagnostics`, sidebar après « Missions ». **Refonte** d'une page existante de 149 lignes
> (`DiagnosticsPapaPage.tsx`), pas une création.
> Réalise l'`adr-0043` (**Accepté**, 2026-08-08). Maquette :
> `docs/frontend-papa/mockup/mockup-papa-diagnostic-v3.html`.
> Chantier : `prompts/claude-code/prompts-claude-code-adr-0043.md`, en trois sessions.
> ⚠️ **Rien n'est implémenté** — cette spec décrit une cible, pas l'existant.

## Ce que la page répond

*« Cette mesure, qu'a-t-elle mesuré, qu'a-t-elle ouvert, et qu'est-ce que ZETIS en a fait ? »*

Dans cet ordre, et sans sauter d'étape. Une passation est une **mesure datée** : la page la traite
comme un instrument, pas comme un bulletin.

Elle est le complément de deux surfaces qui ne peuvent pas y répondre :

- **Progression** (`adr-0040`) nomme les notions et date leurs mouvements, mais sur **toutes** les
  sources confondues — elle ne sait pas dire « ce que *cette* passation a mesuré » ;
- **Lacunes** liste les lacunes ouvertes **quelle que soit leur origine** — elle ne sait pas dire
  laquelle vient d'un diagnostic, ni de quelle passation.

## La page actuelle, et ce qu'elle ne dit pas

Un `<select>` de matière, un bouton, et des cartes de résultat. Ce qui manque, mesuré :

| Manque | Cause dans le code |
|---|---|
| **La date d'une passation** | `completed_at` est transmis (`schemas.py:86`) et **jamais affiché** — deux diagnostics de la même matière sont indistinguables |
| **Le palier de maîtrise** | `status` est transmis (`diagnostic.ts:14`) et **jamais lu** — la page recolorie depuis le score avec ses propres bornes (70/40) |
| **Le palier `acquise` (≥ 90)** | Absent de l'UI : 95 % et 72 % s'affichent identiques, alors que `progress/service.py:13-15` défend l'inverse |
| **L'état réel d'une lacune** | Les lacunes affichées sont **recalculées** depuis les réponses (`service.py:439-442`) ; la table `gaps` n'est **jamais lue** |
| **Toute comparaison entre passations** | Aucune |

## Structure

### En-tête

Sur-titre `Interface Papa · lecture · année <label>`, titre **Diagnostic**, et une phrase qui pose
le contrat de lecture de la page (« ce qu'elle a mesuré, ce qu'elle a ouvert, ce que ZETIS en a
produit »).

### Bandeau instrument — 4 jauges

| Jauge | Ce qu'elle dit |
|---|---|
| Matières mesurées au moins une fois | `3 / 8`, avec le détail de ce qui manque en sous-titre |
| Lecture la plus ancienne **encore invoquée** | l'âge de la mesure la plus vieille qui sert encore à décider |
| Lacunes ouvertes **par un diagnostic**, encore ouvertes | `Gap.source == "diagnostic"` ∩ `OPEN_GAP_STATUSES` |
| Lots de production déclenchés par une mesure | **`0`**, en hachures, sans couleur |

🔴 **La quatrième jauge n'est pas un compteur de panne.** Elle vaut zéro **par décision** — voir
station ③. Son rendu (hachures, gris, jamais rouge) doit dire « vide voulu », pas « échec ».

### Filtres

Pastilles de matière `SubjectFilterChips` de `@zetis/ui`, la même brique que le Dashboard, la
Couverture, la file de relecture et le cahier de bord. Les matières **sans aucun diagnostic** sont
présentes et **atténuées** — leur absence est l'information.

À droite, l'action **Lancer un diagnostic** (modale).

### Rail chronologique

Colonne de gauche, groupée par mois, **la plus récente en haut**. Une entrée = une passation ou un
diagnostic en cours de route. En bas, un groupe **« Jamais généré »** listant les matières
non couvertes.

> ⚠️ **Les matières sans diagnostic ne produisent ni compteur ni pastille de nouveauté.**
> `navigation.ts:24-26` liste Diagnostic parmi les entrées **sans témoin**, et un test verrouille
> cette liste « pour qu'elle ne se complète pas par symétrie apparente ».

#### Le témoin de passation — trois crans, en lecture seule

| Cran | Signification | Origine |
|---|---|---|
| ◌ **généré** | existe, attend la relecture de Papa — **invisible de Massimo** | un fait du moteur |
| ○ **proposé** | relu par Papa, disponible pour Massimo, **pas encore passé** | un geste de Papa |
| ● **passé** | une tentative complétée existe | lu dans `quiz_attempts` |

🔴 **Aucun score ne s'affiche avant le troisième cran — il n'en existe pas.** Les deux premiers
crans portent un libellé (« à relire », « en attente »), jamais un pourcentage.

🔴 **Le témoin ne se coche jamais à la main.** Le troisième cran est *lu*, pas déclaré : le cocher
serait affirmer un fait que rien n'a mesuré.

⚠️ **Deux de ces trois crans n'existent pas dans le code** : `list_diagnostics` sert tout
`quiz_type='diagnostic'` sur un seul prédicat, donc « généré » et « proposé » sont le même instant.
Le gate qui les sépare est la Décision 1 de l'`adr-0043` — voir « Ce que l'ADR a tranché ».

### Panneau — la passation sélectionnée

#### La portée — comparaison entre passations

Une ligne par notion mesurée plusieurs fois, avec son évolution et son delta en points.

🔴 **Le tracé est un ESCALIER, jamais une courbe lissée.** Un score par notion porte sur un petit
nombre de questions : il ne prend qu'un jeu discret de valeurs. Une interpolation douce inventerait
des points intermédiaires qui n'ont jamais été mesurés.

**À une seule passation, la portée ne s'affiche pas** — elle est remplacée par son absence
expliquée : *« un point ne fait pas une pente »*.

#### ① Ce qui a été mesuré

Un tableau à cinq colonnes : **Notion · barre · Score · Palier · Lacune**.

🔴 **Palier et Lacune sont deux colonnes distinctes, et c'est l'invariant central de ce tableau.**
Ce sont deux populations **disjointes** : une notion peut être à renforcer sans lacune ouverte, et
une lacune peut être résolue sur une notion qui n'est pas encore acquise. La page ne doit **jamais**
laisser lire que « score bas » et « lacune » sont la même chose.

> C'est la confusion que `DashboardPage.tsx:220` et `LacunesPage.tsx:128` passent leur texte à
> démonter, tranchée le 2026-08-05. La rouvrir par une colonne unique serait un recul.

**Vocabulaire des paliers** — celui du produit, pas un vocabulaire de page :
`acquise` (≥ 90) · `en cours` (≥ 70) · `à renforcer` (en dessous) · `non abordée`.
⚠️ Ni « fragile », ni « solide » : ces mots n'existent pas dans les libellés Papa.

#### ② Ce qui a été ouvert

Une carte par lacune, **relue à l'affichage** — l'état est celui d'aujourd'hui, pas celui de la date
de passation. Quatre badges, et **deux d'entre eux commandent des gestes différents** :

| Badge | Situation | Geste proposé |
|---|---|---|
| `résolue` | refermée par une mission | Voir la lacune → |
| `remédiation en cours` | mission active | Voir la lacune → |
| `aucune leçon` | **aucune** leçon ne porte la notion | **Produire le quiz de cette notion →** |
| `cours en brouillon` | une leçon existe, son cours n'est pas validé | **Valider le cours de cette leçon →** |

🔴 **Les deux derniers badges ne se confondent pas, et c'est l'`adr-0042` qui les a séparés.**
Sans leçon, le quiz s'ancre désormais sur la notion (sous réserve d'une source RAG) : la lacune est
**réparable**. Avec une leçon en brouillon, la voie notion **refuse** — c'est un dernier recours
réservé aux notions sans leçon — et il faut valider le cours. Un badge unique rendrait ces deux
situations indistinguables alors que le geste de Papa diffère.

#### ③ Ce que ZETIS en a produit

Nœud en pointillés, corde coupée. La station affiche **zéro lot**, et **dit pourquoi** :

> ZETIS ne se commande pas de production sur sa propre mesure. Une mesure fausse produirait alors
> du contenu que rien d'extérieur ne viendrait contredire — la boucle se refermerait sur elle-même.
> Seule une source du monde réel (un contrôle inscrit à l'agenda) déclenche ZETIS toute seule.

🔴 **Cette station présente un MUR, pas un trou.** `EMITTED_TRIGGERS` n'inclut pas `evidence`, et
`db/models/production.py:32-36` porte la raison en toutes lettres : *« écarté EN CONNAISSANCE DE
CAUSE, pas par manque de temps »*. Une formulation qui exprimerait un regret pousserait le lecteur
à demander l'ouverture d'un déclencheur écarté volontairement.

Le bouton **Commander une production →** est donc la réponse **normale**, pas un pis-aller.

### La modale « Lancer un diagnostic »

Quatre états : **Réglage · En cours · À l'arrêt · Terminé**.

- **Réglage** — matière, puis le périmètre réel : notions du référentiel, notions retenues,
  questions attendues. ⚠️ Il doit dire que **ce sont toujours les mêmes notions** tant qu'une
  rotation n'est pas décidée (voir backlog) : une passation ne dit rien des autres.
- **En cours** — le pourcentage compte les **notions traitées**, jamais le temps écoulé. Barre
  animée : c'est le seul indice de vie, et il s'arrête avec le travail.
- **À l'arrêt** — la barre **reste où elle est** et le dit (« rien n'avance depuis … »). Elle
  n'affiche pas d'avancement qu'aucune notion ne justifie. Patron déjà acquis par la barre de
  production (`adr-0041`).
- **Terminé** — le compte des questions **gardées et écartées**, et le rappel que le diagnostic
  rejoint le rail au **premier cran**, pas chez Massimo.

## Ce que la page s'interdit

- **Aucun score avant le troisième cran** — il n'en existe pas.
- **Aucun compteur de jours d'attente côté Massimo, aucune relance, aucune pastille de retard.**
  L'attente est une information pour Papa, **pas une pression sur l'enfant**.
- **Aucun classement de matières**, aucun « meilleur / moins bon ».
- **Aucune note globale de l'élève** — un diagnostic mesure des notions, pas un enfant
  (`adr-0028 §9`, non rouvert).
- **Aucune interpolation** dans la portée (voir plus haut).
- **Aucun agrégat de provenance** — la page ne totalise pas « ce que l'IA a produit ».
- **Aucune modification de contenu** — la page lit et oriente ; produire a ses pages.

## Périmètre des données

**Année active uniquement**, comme la Couverture et la file de relecture.

Les lacunes affichées sont celles **ouvertes par un diagnostic** (`Gap.source == "diagnostic"`), et
leur état est **relu en base**, jamais recalculé depuis les réponses de la passation.

## Contrat

### Ce qui existe et se réutilise

| Route | État |
|---|---|
| `POST /api/diagnostics/generate` | existe — rend **202** + un travail (`API_SPEC.md` à corriger) |
| `GET /api/diagnostics/results` | existe — ⚠️ `limit=10` en dur, sans filtre ni pagination |
| `GET /api/diagnostics/subjects` | existe |

⚠️ **`_per_skill_for_attempt`** (`diagnostics/service.py:412`) porte déjà le calcul du score par
notion, et **`latest_results`** (`:378`) est **la portée transposée** — groupée par passation au lieu
de par notion. L'agrégat est **déjà écrit trois fois** dans le dépôt (`submit`,
`_per_skill_for_attempt`, `quizzes.complete_attempt`) : **en écrire une quatrième serait la faute que
l'`adr-0037` nomme**. La cible d'extraction est `_per_skill_for_attempt`.

### Ce qui manque

| Besoin | Pourquoi |
|---|---|
| **Détail d'une passation** | Aucun `GET /results/{attempt_id}` — le panneau n'a pas d'endpoint |
| **La portée** | Un pivot par notion sur les passations d'une matière, depuis `quiz_answers` |
| **L'état réel des lacunes** | Lire `gaps`, au lieu de recalculer |
| **Le témoin à trois crans** | Un statut de relecture sur `quizzes` |
| **`require_parent` / `require_child`** | 🔴 Aucune route `diagnostics` n'exige de rôle aujourd'hui |

**La portée est calculable, y compris pour le passé** : `quiz_answers` n'est jamais écrasée (une
réponse par question, **y compris non répondue**), et la clé inter-passations est
`quiz_questions.skill_id`, stable même si chaque passation est un `quiz_id` neuf.
⚠️ **Ni `SkillMastery`** (écrasé, une ligne par notion à vie) **ni `skill_mastery_history`**
(n'écrit **qu'au changement de statut**) ne peuvent la porter.

## Ce que l'ADR a tranché

Les trois points que cette spec ne pouvait pas décider seule ont été tranchés par l'`adr-0043`.

1. **Le gate de relecture** — le diagnostic **sort de l'exception « évaluation éphémère »**
   (`adr-0043` Décision 1, qui amende l'`adr-0014` Décision 2). Le motif retenu est plus fort que
   celui envisagé ici : l'exemption d'origine vaut pour les quiz *« dérivés d'un substrat déjà
   validé »*, or `generate_diagnostic` construit son prompt sur **quatre scalaires**, sans cours ni
   contexte canonique — **et les trois garanties de contrepartie sont toutes inhonorées**.
   L'exemption ne s'y est jamais appliquée.
   → `quizzes.validation_status` (migration), 6ᵉ famille `diagnostic` dans `/relecture`, gate de
   service dans `list_diagnostics`. Les quiz de mission et de cours **restent dehors**.
2. **La granularité** — `QUESTIONS_PER_SKILL` passe de **2 à 5** (`adr-0043` Décision 3).
   ⚠️ N'améliore que les passations **futures** : la page affiche une granularité **mixte** et
   **le dit**.
3. **Le choix des notions** — le nombre **reste 8**, mais la sélection devient une décision au lieu
   d'un ordre d'insertion : **par ancienneté de mesure** (`SkillMastery.last_seen_at`), les jamais
   mesurées d'abord (`adr-0043` Décision 4). Motif : un diagnostic sert à **réduire l'incertitude**,
   et remesurer ce qui vient de l'être n'en réduit aucune. La page dit que c'est un **échantillon**.

L'ADR ajoute un quatrième point que cette spec avait renvoyé au backlog : **les rôles sont exigés
sur les six routes** (Décision 2). Un gate de relecture n'aurait aucun sens si n'importe quel compte
pouvait soumettre à la place de Massimo — on protégerait l'entrée en laissant la sortie ouverte.

## Hors périmètre

Le **T0 sur les prérequis** — le graphe de prérequis n'existe pas (ni colonne ni table,
`parent_skill_id` NULL sur les 432 notions) · l'ouverture de `trigger='evidence'` · la refonte de
la page Diagnostic **de Massimo** · le multi-enfant (le JWT n'est relié à aucun `StudentProfile`) ·
la correction des 14 défauts du module consignés au `BACKLOG.md`, qui relèvent de leurs propres
chantiers.
