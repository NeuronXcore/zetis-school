---
id: "0027"
titre: "Chat ZETIS orchestrateur : intent typé, ancré, orienté vers l'existant"
type: surface
statut: accepte
date: 2026-07-30
pr: 57
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0009", "0011", "0020", "0021", "0023", "0024", "0026"]
---
# ADR-0027 — Chat ZETIS orchestrateur : intent typé, ancré, orienté vers l'existant

## Statut

Accepté — 2026-07-30. **Les quatre décisions structurantes (§1 à §4) sont VALIDÉES par le
commanditaire le 2026-07-30** (avec précisions : « pas de cible → ZETIS le dit », ouverture ciblée,
et « contenu absent → demande à Papa » dont le mécanisme est différé, Point ouvert n°4). Passé
**Accepté** au commit du cadrage sur `main` (`6672df9`, le jour même), comme prévu ici.

> S'appuie sur : `adr-0026` (mémoire du chat — verbatim éphémère, pipeline aveugle au contenu §1c,
> trois `learning_events` fermés, rappel≠relance §4), `adr-0011 §1` (module neutre à consommateurs
> multiples), `adr-0020` (narration LLM sur évidence calculée, jamais sur texte libre ; ancrage des
> `skill_id`), `adr-0024` (ZETIS Galaxy : « seul ELI5 est notion-adressable par URL » ;
> `galaxy/notion/{skill_id}` expose matière + contenus disponibles), `adr-0009 addendum` (validation
> Papa des contenus). **Ne rouvre aucune décision antérieure.**
>
> **Ce que l'ADR-0026 remettait explicitement à un chantier dédié** (`adr-0026 §Périmètre` :
> « routage vers les outils ») — **c'est cet ADR.** L'ADR-0026 fige *ce que le chat retient* ; celui-ci
> fige *ce que le chat peut faire faire à l'app*.

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-07-30 | Liste d'attente de contenus pour Papa (`content_requests`) | Accepté | — |
> | 2 | 2026-08-01 | Demander un contenu depuis une surface élève | Accepté | — |
>
> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*

## Contexte

Le chat (ADR-0026, slices faites) répond en texte et propose **au plus un** outil
(`tool_suggestion` ∈ eli5/fiche/mindmap/revision) ; **seul le deep-link ELI5** est câblé, le reste
est un TODO. Le commanditaire veut que Massimo **pilote toute l'app en langage naturel** :

- **Naviguer** : « montre-moi mes fiches sur les fractions », « explique-moi les nombres relatifs »,
  « on révise les maths ».
- **Consulter des données** : « c'est quoi mon agenda / mes devoirs à faire ? », « qu'est-ce que je
  dois réviser ? ».

C'est le rôle d'**orchestrateur** que l'ADR-0026 annonçait (« il oriente vers l'existant ; il n'est
ni un générateur de contenu, ni un lieu où l'on reste », `page-chat.md`). La question tranchée ici :
**comment le chat produit une action fiable — jamais une route inventée, jamais un contenu généré à
la volée qui contournerait la validation Papa.**

## Constat read-before-code

**1. La résolution notion existe déjà** (`ai/skill_resolution.py`, slice A ADR-0026) : texte libre →
`skill_id` + `skill.subject_id`, best-effort. « les fractions » devient une notion.

**2. Le pont notion → matière + contenus disponibles existe déjà** :
`GET /api/student/galaxy/notion/{skill_id}` (ADR-0024) renvoie `subject_slug`, `subject_name`, et
`actions:[{kind, available, lesson_id, fiche_id, quiz_id, mindmap_id, capsule_id}]`. **C'est
l'ensemble autorisé** : pour une notion, quels contenus **validés** existent et où aller. Le
« blocage » redouté (« aucune fonction ne dit ce qui existe pour un skill_id ») n'existe pas côté
élève — cette route le fait.

**3. Le patron d'ancrage anti-hallucination existe déjà** : `reports/service.py:_anchor()` (ADR-0020)
revalide chaque `skill_id` produit par le LLM contre l'évidence calculée ; un id inventé est jeté.
Directement transposable : **le LLM propose une intention, le serveur contraint la cible.**

**4. L'adressabilité des surfaces est inégale** (cartographie, `page-chat.md §Routage`) :
- **notion (URL)** : ELI5 (`/eli5?skill_id=`) — la seule.
- **matière (URL)** : fiches, cours, mindmaps (liste), révision, progression (`/…/:slug` ou `?subject=`).
- **carte (URL)** : reconstruction mindmap (`/mindmaps/reconstruire/:id`).
- **page entière** : agenda, capsules, diagnostic, matières.
- **`location.state` (pas d'URL)** : quiz-session, révision-session, mission précise.

**5. Les endpoints de données existent** : agenda (`/api/student/agenda/week|upcoming|items`,
`done`=fait), révisions (`/api/student/reviews/summary`), missions (`/api/missions/today|…`), fiches
(`/api/student/fiches/summary`). Pas d'endpoint « résumé du jour » agrégé — l'Accueil compose 3
appels côté client ; le chat fera pareil.

**6. Le pipeline de chat est aveugle au contenu** (`adr-0026 §1c`) : `ai_jobs` d'un tour ne porte que
des métadonnées. Toute extension d'action doit rester métadonnée (type d'action, `skill_id`, route),
jamais du texte.

## Décision

### 1. Le chat produit un **intent typé**, le serveur l'**ancre**

Le tour de chat (un appel LLM structuré, `chat_turn_schema`) gagne, à côté de `reply`, un **intent
proposé** — patron `reports` (Pydantic `extra="forbid"`, `model_json_schema()` en `LLMRequest.fmt`,
validation dure + une réparation) :

```
intent: {
  kind: "open_notion" | "open_subject" | "show_data" | "none",
  notion_query?: str,      # « les fractions »
  subject_query?: str,     # « les maths »
  tool?: "eli5" | "fiche" | "mindmap" | "cours" | "revision",
  data?: "agenda" | "reviews" | "missions",
}
```

**Le LLM propose ; le serveur décide.** Ancrage (le maillon neuf, transpose `_anchor()`) :

- `open_notion` → `resolve_skill(notion_query)` → `skill_id` → `galaxy/notion/{skill_id}` →
  `subject_slug` + `actions[]`. Si `tool` est **`available`** pour cette notion → action concrète
  ancrée ; sinon **pas d'action**, et ZETIS le dit honnêtement (§3).
- `open_subject` → nom → `subject_slug` (via `/api/subjects` / galaxy overview) → route matière.
- `show_data` → renvoie `{kind:"show_data", data}` seul ; **le front** récupère l'endpoint et rend la
  carte (le backend reste aveugle au contenu — il ne lit ni ne renvoie les données).
- `none` → conversation pure.

`ChatMessageOut` gagne un champ **`action`** typé, **toujours ancré, jamais halluciné** :
`navigate{route, state?, label}` | `show_data{data, label}` | `null`. Quand **`action = null`** faute de
cible ancrable (route inconnue, notion non résolue, contenu absent), **ZETIS le DIT** dans son `reply` —
jamais un silence ni un faux lien (précision commanditaire 2026-07-30).

> **Test-verrou** : une cible produite par le LLM et non ancrable (notion non résolue, route
> inconnue, contenu non `available`) → `action = null`. Le serveur ne renvoie **jamais** une route
> qu'il n'a pas construite lui-même depuis un id validé.

### 2. Navigation **modale sur l'entrée** ; données **affichées dans le chat**

- **Voix (micro) → ZETIS navigue directement** ; **clavier → carte-action à taper.** Politique
  **100 % front** (il connaît l'origine du tour) — le backend fournit l'action ancrée, il n'en
  connaît pas l'origine. *Pourquoi :* à la voix, Massimo a les mains libres et attend une action ;
  au clavier, il regarde l'écran et un saut de page serait brutal (perte de l'avatar, de la
  conversation).
- **Données (`show_data`) → affichées DANS le chat** : une carte compacte (ex. « Aujourd'hui : maths
  p.42, expo SVT ») **+ un bouton d'ouverture** (« Ouvrir l'agenda → », lui-même une action
  `navigate`). *Pourquoi :* « c'est quoi mes devoirs » appelle une **réponse**, pas un renvoi.
- **Ouverture CIBLÉE vers la requête** (précision commanditaire 2026-07-30) : viser la surface la plus
  spécifique que l'ancrage permet — **notion** si elle résout et que le contenu est `available` (ex.
  ELI5 `?skill_id=`), **matière** en repli, jamais plus large que nécessaire.
- La carte-action réutilise le bloc `.chat-offer` existant, **généralisé** de « 1 outil » à « N types
  d'action ancrée », en gardant la contrainte enfant : **≤ 2 propositions + une sortie**.

### 3. Orienter vers l'**existant validé** — jamais générer, jamais promettre

- Le chat enfant **ne déclenche aucune génération** (capsule, fiche, quiz, cours) : cela
  contournerait la validation Papa (dispositif `reports`/équipement, Papa-only, ADR-0021). Il route
  **uniquement vers des contenus `available`** (validés) que `galaxy/notion` déclare.
- Contenu absent → **honnêteté** (« Ça, je ne l'ai pas encore pour cette notion »), jamais « je te le
  prépare » (le contenu passe par Papa) — **ET ZETIS enregistre une DEMANDE À PAPA** (décision
  commanditaire 2026-07-30). Ce n'est pas « juste dire non » : la demande devient une trace que Papa
  traite. **Précédent réutilisable** : `NotionRequest` (table `notion_requests`) +
  `POST /api/ai/eli5/request-notion` / `GET·PATCH /api/notion-requests` / `NotionRequestsPanel` (page
  Programme Papa) — le geste « Dis à Papa d'ajouter » existe déjà. Deux cas :
  - **notion non résolue** (« pythagore » hors programme) → réutilise `notion_requests`/`request-notion`
    **tel quel** ;
  - **notion résolue mais contenu-type absent** (fiche/mindmap/quiz manquant pour une notion existante)
    → une demande de contenu `{skill_id, kind}` — `notion_requests` n'a ni `skill_id` ni `kind` :
    **mécanisme à définir ultérieurement** (Point ouvert n°4). En Lot 1 : honnêteté ; la demande
    structurée arrive avec son mécanisme.
- **Diagnostic non routable** par le chat de façon anxiogène (`navigation.md §9`) : hors périmètre du
  routage v1.

### 4. Aucune nouvelle plomberie de mémoire, aucun ré-engagement

- **Trois `learning_events` seulement** (ADR-0026 §2) : le geste sur une action réutilise
  **`chat_tool_response`** (`{tool_type, skill_id, accepted}` — `tool_type` porte la surface), **zéro
  XP, non probant**. **Aucun `event_type` d'action nouveau.**
- **Pipeline aveugle** (§1c) : l'`ai_jobs` du tour ne trace que `{kind d'intent, skill_id, tool,
  route}` — jamais un texte.
- **Rappel ≠ relance** (ADR-0026 §4) : aucune action poussée, aucune notification, aucun « reviens ».
  L'action n'existe qu'en réponse à un message de Massimo.

## Périmètre

**Lot 1 — orchestration texte + voix** :
- Backend : schéma d'intent + **résolveur d'action ancré** dans `chat/` (réutilise
  `ai/skill_resolution.py` + le service `galaxy`), schéma de tour étendu (`prompts/chat.py`),
  `ChatMessageOut.action`. Tests d'ancrage.
- Frontend : **exécuteur d'action** dans `ChatPage.tsx` (politique voix/clavier), `lib/chatActions.ts`
  (table de routes, patron `NotionActionPanel`), **cartes de données** (agenda/révisions/missions,
  réutilisant `lib/agenda.ts`/`reviews.ts`/`missions.ts`). Tests.

**Surfaces câblées en v1** : ELI5 (notion), fiches/cours/mindmaps/révision/progression (matière),
reconstruction mindmap (carte) ; données agenda/révisions/missions.

> **Note du 2026-07-31** : « progression » n'a en réalité **jamais été câblée** — `chat/actions.py`
> construit `eli5`, `cours`, `fiches`, `revision`, `mindmaps` et `subjects`, jamais cette
> surface-là. Si elle l'est un jour, la route est **`/galaxy?subject=<slug>`** : `/progression` a
> été renommée (addendum ADR-0024 §A) et ne survit qu'en redirection.

**Hors v1 (tracé, non inventé)** : cibles `location.state` non-URL (quiz-session par id,
révision-session, mission précise) — nécessitent un pré-fetch + `navigate(state)` ; à câbler quand la
valeur est prouvée. Diagnostic. Streaming de la réponse.

**Hors périmètre** : toute génération de contenu, toute route inventée, tout ré-engagement.

## Conséquences

### Positives
- **Presque tout réutilise l'existant** : résolution notion (slice A), `galaxy/notion` (ADR-0024),
  ancrage (ADR-0020), endpoints données. Le neuf = un schéma d'intent + un exécuteur front.
- Le chat devient l'**entrée universelle** vers l'app, en langage naturel, **sans jamais halluciner
  une destination** (ancrage serveur) ni contourner la validation Papa.
- **Zéro table, zéro migration, zéro nouvel `event_type`.**

### Négatives / coûts
- **Granularité inégale, assumée** : « mes fiches sur les fractions » ouvre les fiches **de la
  matière** (la fiche exacte n'est pas adressable) — l'UI le formule sans mentir. Quiz par notion :
  hors v1.
- **La qualité du routage dépend de la résolution notion** (comme la mémoire, ADR-0026) : une notion
  hors référentiel ne route pas.
- Le patron `chat_turn_schema` gagne un objet `intent` — un petit surcoût de fiabilité sur les
  moteurs locaux (mitigé : `tool`/`data` en strings validées en aval, pas d'enum dur).

## Suivi
- **Docs** : ligne dans `DECISIONS.md` ; addendum `page-chat.md §Orchestration` (remplace le TODO
  « routage outils ») ; `API_SPEC.md §Chat` (champ `action`).
- **Slices** : (Lot 1a) backend résolveur ancré — `prompt-chat-orchestrateur-slice-a-backend.md` ;
  (Lot 1b) frontend exécuteur + cartes — `prompt-chat-orchestrateur-slice-b-frontend.md`.
- **Invariants testés** : action non ancrable → `null` (jamais de route inventée) ; contenu non
  `available` → pas d'action + réponse honnête ; `show_data` ne renvoie aucune donnée depuis le
  backend (front-fetch) ; geste → `chat_tool_response` seul (aucun event neuf, zéro XP) ; voix →
  navigation directe, clavier → carte.
- **Ordre dans la file** : **après** le merge du chantier chat voix (ADR-0026, `feat/chat-memoire`).
  Mono-chantier : branche `feat/chat-orchestrateur`.

## Points ouverts (à trancher avant/pendant la slice)
1. **Données lues à voix haute ?** Pour `show_data` à la voix, ZETIS doit-il **narrer** les devoirs
   (le backend injecterait l'agenda dans le contexte du tour — la donnée de l'élève n'est pas du
   verbatim, §1c reste tenu) ou seulement afficher la carte + un « regarde 👇 » ? → recommandation :
   narrer, c'est le sens d'un assistant vocal ; à confirmer au regard du coût (fetch avant génération).
2. **`open_subject` vs `open_notion` ambigus** : « montre les maths » (matière) vs « les fractions »
   (notion) — la désambiguïsation est au LLM ; prévoir un repli matière si la notion ne résout pas.
3. **Quiz par notion** (hors v1) : mérite un pré-fetch `fetchQuizById` + `navigate(state)` — à cadrer
   si le besoin est prouvé.
4. **Mécanisme de la demande de contenu à Papa** (§3, différé par le commanditaire) — **TRANCHÉ
   (2026-07-30), voir **Amendement 1**** : **nouvelle table `content_requests
   {student_id, skill_id (NOT NULL), content_kind, status, source}`** avec `UniqueConstraint(student,
   skill, kind)` (dédup forte), distincte de `notion_requests` (deux sémantiques) ; le chat émet sur
   deux déclencheurs (type manquant ; notion vide → cours) ; surface Papa = **badge sur la
   Couverture** (fusion client par `skill_id`, `production` non touché ; mutations hors `production`).
   **Amende le « zéro table » de cet ADR** (+1 table, +1 migration, assumés).

## Décisions du commanditaire — VALIDÉES le 2026-07-30
1. **Intent typé + ancrage serveur** (§1) — le chat ne route que vers des cibles construites depuis un
   id validé, jamais une route hallucinée ; **pas de cible → ZETIS le dit**. ✅
2. **Navigation modale voix/clavier + données affichées dans le chat** (§2) ; **ouverture ciblée**. ✅
3. **Orienter vers l'existant validé, jamais générer** (§3) ; **contenu absent → demande à Papa**
   (mécanisme différé, Point ouvert n°4). ✅
4. **Réutiliser `chat_tool_response`, aucun nouvel event, aucun ré-engagement** (§4). ✅

---

## Amendement 1 — Liste d'attente de contenus pour Papa (`content_requests`) — 2026-07-30

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-30. Résout le **Point ouvert n°4** de l'ADR-0027 (« mécanisme de la demande de
contenu à Papa »), et **amende son « zéro table »** (§Conséquences positives) : cette décision
ajoute **une** table et **une** migration, assumées.

> S'appuie sur : `adr-0027` (chat orchestrateur — le chat oriente vers l'existant validé ; contenu
> absent → honnêteté + demande à Papa, mécanisme différé), `adr-0023` (module `production`
> **strictement lecture seule** — la Couverture ne génère, ne valide, n'écrit jamais rien),
> `adr-0011 §1` (module neutre à consommateur unique), le précédent `notion_requests` (module
> `notions`, « Dis à Papa d'ajouter » sur ELI5). **Ne rouvre aucune décision.**

### Contexte

L'ADR-0027 a tranché : quand Massimo demande dans le chat un contenu qui **manque** sur une notion
existante, ZETIS **ne génère pas** (ce contournerait la validation Papa) — il le **dit honnêtement**
et **enregistre une demande à Papa**. En Lot 1, seule l'honnêteté était livrée ; le geste
« demander à Papa » était **cadré comme décision** mais son **mécanisme restait ouvert** (Point
ouvert n°4) : étendre `notion_requests` (ajout `skill_id`, `kind`) **ou** une nouvelle table.

Le besoin réel : Massimo réclame un contenu sur une notion (« ta carte sur les fractions », « le
cours sur les nombres relatifs ») → l'accumuler dans une **liste d'attente dédupliquée** que Papa
traite **en lot**, au lieu d'envois au coup par coup qui se perdent.

### Constat read-before-code

**1. `notion_requests` ne convient pas.** Sa sémantique est « notion **hors programme**, texte
libre, `skill_id = None` » (l'enfant tape « pythagore » qui n'existe pas encore ; Papa l'ajoute via
le skills-backfill). Ici c'est l'inverse : la notion **existe et est résolue** (`skill_id` connu),
ce qui manque est un **type de contenu** (`fiche`/`mindmap`/`cours`/carte). `notion_requests` n'a ni
`skill_id` ni `content_kind` — deux sémantiques distinctes qu'il ne faut pas confondre dans une même
table (un `skill_id` optionnel qui vaut tantôt « inconnu » tantôt « connu » serait ambigu).

**2. La Couverture est le bon lieu de traitement.** La page Papa « Couverture » (`production`,
ADR-0023) est **exactement** la carte du stock de contenu : par leçon/notion, ce qui existe et ce
qui manque. Une demande de Massimo est un **repère de priorité** sur cette carte (« ce trou-là, il
le réclame »). Mais `production` est **strictement lecture seule** — l'invariant est dur.

**3. Le pont notion↔leçon existe déjà côté Couverture.** `coverage._notion_details` remonte, par
leçon, ses notions avec leur `skill_id` (`CoverageNotionItem`). Un agrégat des demandes **par
`skill_id`** se fusionne donc **côté client** avec la matrice, **sans toucher `coverage.py`**.

### Décision

#### 1. Une table dédiée `content_requests` (nouveau module `content_requests`)

Distincte de `notion_requests` (deux sémantiques). Patron du module `notions`
(`create` / `list_requests` / `set_status`).

```
content_requests {
  id
  student_id     FK student_profiles  NOT NULL
  skill_id       FK skills            NOT NULL   # la notion EXISTE (≠ notion_requests)
  content_kind   str   # cours | fiche | mindmap | quiz | capsule | card
  status         str   # pending | done | dismissed
  source         str   # "chat_orchestrator" (traçabilité de l'origine)
  created_at, updated_at
  UniqueConstraint(student_id, skill_id, content_kind)   # dédup FORTE
}
```

- **`UniqueConstraint(student_id, skill_id, content_kind)`** = dédup forte : « fractions × 5
  demandes de carte » ⇒ **une** ligne. `create` est **idempotent** — sur conflit, il **ré-active**
  une ligne `dismissed`/`done` en `pending` (Massimo redemande ⇒ ça remonte), et ne fait rien si
  déjà `pending`. Jamais deux lignes pour le même `(élève, notion, type)`.
- `content_kind` : vocabulaire **fermé** aligné sur les surfaces (`cours`/`fiche`/`mindmap`/`quiz`/
  `capsule`/`card`). En v1 le chat n'en émet que **quatre** (voir §2), mais le modèle accepte les six
  (Papa pourra en voir d'autres origines plus tard sans migration).
- **Pas de FK matière** : elle se dérive de `skill.subject_id` à la lecture (jamais dupliquée).

#### 2. Émission depuis le chat (best-effort, aveugle au contenu §1c, jamais bloquante)

Deux déclencheurs — **décision commanditaire « les deux »** :

- **(a) type précis manquant** : Massimo a demandé un `tool` sur une notion résolue, mais ce contenu
  n'est **pas `available`** (`chat/actions.py:_open_notion`, branche « contenu absent ») →
  `content_request(skill_id, kind=map(tool))`.
- **(b) notion résolue mais VIDE** : la notion résout mais **aucun** contenu n'est `available` (menu
  de notion sans item, `chat/actions.py:_notion_menu`) → `content_request(skill_id, "cours")` — le
  cours est la **porte** (condition des dérivés) ; le réclamer débloque tout le reste.

Mapping `tool → content_kind` : `fiche→fiche`, `mindmap→mindmap`, `cours→cours`, `revision→card`,
**`eli5→cours`** (ELI5 se dérive du cours canonique : pas d'ELI5 ⇒ pas de cours validé ⇒ la vraie
demande est le cours). `quiz` non émis en v1 (hors périmètre de routage ADR-0027).

**Mécanique** : `resolve_action` **remonte un signal** dans `ActionResult.meta["content_request"]`
= `{skill_id, content_kind}` (métadonnée pure, pas de texte — §1c préservé). Le `service` l'émet
**après** le tour, dans un `try/except` qui **n'échoue jamais** le tour de chat (une file pleine ne
doit pas casser une conversation). L'honnêteté du `reply` (« je le note pour Papa ») est **déjà**
livrée par l'ADR-0027 ; cet addendum la rend **vraie** (la note devient une trace).

#### 3. Papa : un **badge sur la Couverture** (lecture), mutations **hors `production`**

- **Décision commanditaire** : la file se voit **sur la Couverture**, pas dans un panneau séparé —
  c'est là que Papa décide déjà quoi produire. Un badge **« ⭐ réclamé par Massimo (n) »** sur la
  ligne d'une leçon dont une notion porte des demandes `pending` ; un survol/clic liste les demandes
  (notion + type) avec **Fait** / **Ignorer**.
- **Invariant read-only de `production` PRÉSERVÉ, strictement** : `coverage.py` n'est **pas touché**.
  L'agrégat des demandes est lu par un endpoint **du module `content_requests`**
  (`GET /api/content-requests`, `require_parent`) et **fusionné côté client** par `skill_id` avec la
  matrice (via `CoverageNotionItem.skill_id`). Les mutations `done`/`dismissed` passent par
  `PATCH /api/content-requests/{id}` (module `content_requests`), **jamais** par `production`.
- `notion_requests` reste **inchangé** (notion hors programme, texte libre, `skill_id = None`) : les
  deux gestes coexistent sans se marcher dessus.

### Périmètre

**Dans le lot** : table + migration (appliquée sur Postgres dev) ; module `content_requests`
(model, service, schémas, router Papa) ; émission chat (2 déclencheurs) ; client Papa + badge
Couverture (lecture fusionnée + mutations). Tests : dédup/ré-activation, émission (type manquant +
notion vide → cours), badge lu, mutations hors `production`.

**Hors lot** : émission depuis d'autres surfaces que le chat (Papa verra le champ `source` évoluer
sans migration) ; priorisation/tri avancé de la file ; production **en lot** depuis le badge
(reste le chantier « Compléter le chapitre » déjà marqué désactivé sur la Couverture).

### Conséquences

#### Positives
- Le geste « demande à Papa » de l'ADR-0027 §3 devient **réel et dédupliqué** ; l'honnêteté du chat
  cesse d'être un cul-de-sac.
- **Invariant `production` intact** : `coverage.py` inchangé, fusion côté client, mutations dans le
  module de demandes. Deux sémantiques de demande (`notion_requests` vs `content_requests`) restent
  **séparées**.
- Aucun nouvel `event_type`, aucun XP : la demande est une **ligne de file**, pas un événement
  d'apprentissage.

#### Négatives / coûts
- **Amende le « zéro table » de l'ADR-0027** : +1 table, +1 migration (assumé — c'était l'objet du
  Point ouvert n°4).
- **Granularité du badge = la notion, pas la cellule exacte** : une demande `fiche` sur une notion
  s'affiche au niveau de la **leçon** qui porte cette notion (la fiche est leçon-centrée, la demande
  notion-centrée) — le popover lève l'ambiguïté (il nomme la notion **et** le type).
- La qualité de l'émission dépend de la résolution notion (comme tout l'ADR-0027) : une notion hors
  référentiel ne crée pas de `content_request` (elle relève de `notion_requests`).

### Correctifs découverts au test live (2026-07-30)

Le test live a révélé que l'émission dépendait d'un `available` **mensonger** et que le garde-fou
« jamais générer » n'était pas tenu par le `reply`. Deux correctifs intégrés (détail
`TROUBLESHOOTING.md`), un point laissé ouvert :

- **`notion_panel` — honnêteté du cours** : `cours available` exige désormais `content_markdown`
  réel (pas seulement une leçon validée). Sans quoi une notion « à cours vide » (fréquent en dev)
  n'émettait aucune demande. Le signal « notion vide → cours » vaut sur **tous** les chemins du
  résolveur d'action (menu ET `tool=eli5`), ELI5 ne comptant jamais comme contenu durable.
- **Prompt `chat_v2` — le garde-fou §3 porté dans le prompt** : `CHAT_SYSTEM`/`CHAT_TURN_PROMPT`
  interdisent explicitement à ZETIS d'écrire lui-même le cours/les définitions/la conjugaison ; il
  oriente vers ELI5 ou une ressource validée. **Mitigation, pas garantie dure** (petit moteur local).

**2e test live (même jour) — 2 décisions supplémentaires (validées commanditaire) :**

- **Résolveur strict (n°1)** : `chat_skill_resolution_min_score` **0.55 → 0.72**. `nomic-embed-text`
  donnait ~0.68 à des requêtes sans rapport (« verbe être en espagnol » → « Registre de langue »),
  les vrais matchs à 0.83+ ; seul le score absolu sépare (la marge non). Une requête sans notion
  correspondante renvoie `None` → « je ne le trouve pas dans ton programme ». **Fini le contenu du
  mauvais sujet montré avec aplomb.**
- **ELI5 n'est plus une porte pour une notion sans cours** : ELI5 dégrade vers le modèle sans cours
  validé (ADR-0011) — l'y router contredit « orienter vers l'existant validé ». L'orchestrateur
  n'offre ELI5 (menu ou route directe) **que si un cours validé existe** ; sinon honnêteté + demande
  de cours à Papa. ELI5 **l'outil** (ouvert depuis la galaxie) reste inchangé (ADR-0024).

### Notifications + inbox Papa (2e message commanditaire, 2026-07-30)

« Si ZETIS n'a pas la réponse → il le dit + envoie une requête à Papa ; Papa a des **notifications**
et la **liste des demandes en attente**. » Livré :

- **Notification** : `GET /api/content-requests/count` → pastille (accent) sur l'entrée sidebar
  **« Demandes de Massimo »**, rafraîchie à chaque triage (event `CONTENT_REQUESTS_CHANGED_EVENT`,
  d'où qu'il vienne — page inbox OU popover Couverture).
- **Inbox** : page **`/demandes`** (`DemandesPage`) — demandes `pending` groupées par matière, chacune
  = notion + type + **Fait**/**Ignorer** + lien « Produire dans la Couverture → » (la production
  reste un geste de Papa dans les surfaces existantes ; les mutations passent par `content_requests`,
  jamais par `production`). `subject_name` ajouté à la sortie de `list_requests` pour le groupement.
- La production **en lot** depuis l'inbox reste hors périmètre (chantier « Compléter le chapitre »).

### Volet HORS-PROGRAMME (2026-07-30) — ferme la moitié symétrique du Point ouvert n°4

Le `content_requests` couvre « notion DU programme, contenu manquant ». Le cas **inverse** — Massimo
réclame une notion **PAS au programme** (« le verbe être en espagnol » en 4e) — restait mort : le
chat répondait « je ne le trouve pas » **sans rien enregistrer**. Constat clé : le mécanisme
`notion_requests` (précédent ELI5) existait, mais (a) le chat ne l'alimentait pas, et (b) côté Papa
« ✓ Ajoutée » ne faisait **QUE** changer le statut — **aucune création** (ni Skill, ni leçon, ni
cours ; le texte de la demande n'allait nulle part). Décisions commanditaire :

- **Chat émet en OPT-IN** : `resolve_skill` → `None` → le chat propose une carte **`request_notion`**
  (`chat/actions.py`, `ChatAction.kind`) « Demander à Papa d'ajouter « X » » ; le tap crée un
  `notion_request` via le producteur ELI5 existant (`POST /api/ai/eli5/request-notion`). ZETIS ne
  fabrique rien — il transmet, et **remercie**. `chat_tool_response` seul (aucun event neuf).
- **Inbox Papa UNIFIÉE** (`/demandes`) : deux sections — **« À ajouter au programme »**
  (`notion_requests`) et **« Contenu à créer »** (`content_requests`) ; **une** pastille de
  notification = **somme** des deux files (`GET /api/notion-requests/count` + content count, event
  `DEMANDES_CHANGED_EVENT`).
- **Deux ponts de création réels** (une notion hors-programme n'a pas de matière → Papa la fournit
  via modale) :
  - `POST /api/notion-requests/{id}/add-to-program {subject_id}` → `_upsert_skills` (la notion
    devient une `Skill`) ;
  - `POST /api/notion-requests/{id}/create-lesson {chapter_id, generate_course?}` →
    `create_manual_lesson` (Skill + Leçon + lien en une passe) + option cours (`generate_lesson_content`,
    local ; la leçon repasse alors en `draft` — un cours généré non relu ne se sert pas, gate ADR-0009).
  Les deux réutilisent les briques curriculum existantes ; la demande passe `added`.
- **Vérifié live end-to-end** : chat « verbe être en espagnol » → carte → `notion_request` → inbox Papa
  → « Créer la leçon » (Français/Grammaire) → leçon + Skill créées, demande `added`.
- **Correctif UX (notions orphelines)** : « Ajouter au programme » (comme le skills-backfill) crée une
  `Skill` **sans leçon**, donc **invisible** dans la page Programme (leçon-centrée) → « je l'ai ajoutée
  mais je ne la vois nulle part ». Ajout d'un panneau **« 🧩 Notions sans leçon »** par matière sur la
  page Programme (`GET /api/subjects/{id}/orphan-notions` = Skills du niveau année active sans
  `LessonSkill` ; `OrphanNotionsPanel`). Répare aussi le trou **pré-existant** du skills-backfill.
  Vérifié live (« les nombres complexes » visible sous Mathématiques).

### Correctifs de revue (ultrareview PR #57, 2026-07-30)

Cinq défauts (tous `nit`, tous confirmés dans le code) corrigés avant merge — trois touchaient
directement le **contrat d'honnêteté** que cet addendum existe pour établir :

- **Fausse promesse** (`chat/actions.py`) : un outil hors mapping (`quiz`/`capsule`, que `notion_panel`
  expose pourtant, ou une valeur hallucinée) produisait « je le note pour Papa » **sans rien
  enregistrer**. → repli **obligatoire** sur `cours` (`_TOOL_TO_CONTENT_KIND.get(tool, "cours")`).
- **Fausse confirmation** (`ChatPage.tsx`) : « C'est noté ! » s'affichait même si `requestNotion`
  échouait (backend éteint…). → confirmation **dans** le `try` ; en cas d'échec la carte reste et
  ZETIS le dit (patron `useEli5.ts`).
- **Demande réactivée non remontée** (`content_requests/service.py`) : tri par `created_at` → une
  demande redemandée restait enterrée, contredisant « on le remonte en file ». → tri `updated_at`.
- **Doublon de leçon** (`curriculum/service.py`) : `create_manual_lesson` committe, puis la rédaction
  du cours pouvait échouer (Ollama) en laissant la demande `pending` → le retry de Papa créait une
  **2e leçon** du même titre. → demande marquée `added` **avant** la rédaction + garde d'idempotence
  (`add_notion_to_program` aussi) ; l'échec du cours est remonté (`course_error`), pas un 500 muet.
- **Session invalidée** (`chat/service.py`) : l'émission best-effort avalait l'exception **sans
  rollback** — une erreur SQL réelle cassait tout le tour (`PendingRollbackError`). → **SAVEPOINT**
  (`begin_nested`).

Chacun a son test-verrou (dont un rejouant une **vraie** `IntegrityError`, là où le test initial ne
levait qu'un `RuntimeError` inoffensif pour la Session).

### Suivi
- **Docs** : ligne `DECISIONS.md` ; met à jour l'ADR-0027 §Points ouverts n°4 (« tranché : voir
  addendum ») et `page-chat.md §Garde-fous` (« mécanisme différé » → « enregistré dans
  `content_requests` » ; hors-programme → `notion_requests` depuis le chat).
- **Invariants testés** : dédup `(student, skill, kind)` = une ligne ; ré-activation d'une ligne
  `dismissed`/`done` sur nouvelle demande ; émission (a) type manquant et (b) notion vide→cours ;
  émission **best-effort** (une exception d'émission n'échoue pas le tour) ; mutations `done`/
  `dismissed` **hors `production`** ; `coverage.py` non modifié (badge = fusion client).
- **Prompt de slice** : `prompts/claude-code/prompt-content-requests.md`.

---

## Amendement 2 — Demander un contenu depuis une surface élève — 2026-08-01

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-01, **livré le jour même**, puis **amendé deux fois le soir** (§Amendements —
le libellé et le retrait de la phrase de transmission). Lève le « hors lot » de l'addendum
`content_requests` (« émission depuis d'autres surfaces que le chat »).

> S'appuie sur : `adr-0027` (l'orchestrateur oriente vers l'existant validé ; contenu absent →
> honnêteté + demande à Papa), son addendum `content_requests` (la table, la dédup forte, le
> `create` idempotent et ré-activant, l'inbox Papa), `adr-0023` (`production` strictement lecture
> seule), `adr-0024-zetis-galaxy-progression` (Amendement 6) (la surface qui émet). **Ne rouvre
> aucune décision de ces textes.**

### Contexte

Le chat émet déjà des `content_requests`. Mais l'émission y est un **effet de bord invisible et
unitaire** : Massimo la subit sans savoir qu'il vient de la faire, et il ne peut pas choisir ce
qu'il demande.

Pendant ce temps, la surface qui montre **littéralement** ce qui manque — la panoplie grisée de la
page matière — n'a **aucun moyen de le demander**. Le geste le plus naturel du produit est
précisément celui qui n'existe pas.

### Décision

#### 1. Une route enfant en ÉCRITURE, sur un module jusqu'ici `require_parent`

```
POST /api/student/content-requests     (require_child)
  entrée : { skill_id: int, content_kinds: [str] }
  sortie : { requested: [str] }
```

C'est une **décision de sécurité** — d'où cet ADR, et d'où sa livraison en **commit séparé**,
isolable dans l'historique.

Plusieurs `content_kinds` en un appel, parce que « tout ce qui manque » est **UN** geste de
l'enfant : le découper en sept requêtes en ferait sept lignes dans la file de Papa.

#### 2. Écriture SEULE — aucun `GET`, aucun `PATCH` élève

**Ce n'est pas un manque de v1, c'est le fond.** La file de Papa n'est pas une surface de
l'enfant : un « refusé » visible serait le vocabulaire d'échec que ZETIS s'interdit, et une liste
de demandes en attente transformerait une file de travail en **écran d'attente**.

Vérifié par un test **sur le contrat OpenAPI**, pas sur des codes HTTP — une 403 ou une 405
masquerait une route bel et bien montée.

#### 3. Trois garde-fous, tous testés

1. **Vocabulaire fermé** — `cours | fiche | mindmap | quiz | capsule | card`, porté par le
   **schéma** (`Literal`), donc appliqué en `422` avant d'atteindre le service. Un test-verrou le
   maintient aligné sur `service.CONTENT_KINDS`.
2. **Plafond** `CONTENT_REQUEST_MAX_KINDS` (v1 = 7), mesuré sur la charge **brute**.
3. **Visibilité** — le `skill_id` doit être visible de l'élève (même chaîne de filtrage que les
   autres routes élève). Sinon **404, et aucune ligne créée**.

Le troisième est le seul qui compte vraiment : **sans lui, la route devient un oracle
d'existence** sur les brouillons de Papa. Un `skill_id` au hasard répondrait « créé » ou « pas
créé », révélant ce qui existe en base sans être publié. La vérification précède **strictement**
la première écriture.

#### 4. `source` distingue le CHOISI du SUBI

`subject_page` contre `chat_orchestrator`. Ce n'est pas cosmétique : dans le chat la demande est
un effet de bord, sur la page matière c'est un geste explicite sur une pastille grisée. **Papa lit
la différence**, et elle change la priorité qu'il accorde à la ligne.

#### 5. Geste OPT-IN, et rien d'autre

« Demander » sur une pastille grisée ; « tout ce qui manque (n) » en un appel, le bouton
disparaissant quand `n = 0`. Retour visuel optimiste, avec **retour arrière silencieux** en cas
d'échec réseau — une demande perdue ne vaut pas un écran d'erreur chez un enfant : il retapera,
un message d'échec se retient.

**Aucun statut, aucun délai, aucun rappel.** **Aucun XP, aucun `event_type` neuf, aucune trace
d'événement** : demander n'est pas apprendre, et la **ligne de file EST la trace** (émettre
`chat_tool_response` hors du chat rendrait son nom menteur).

`create_request` n'est **pas modifié** — son idempotence et sa ré-activation bornent
structurellement la répétition. `production/coverage.py` n'est **pas touché**.

### Ce que le read-before-code a invalidé

**Le plafond de 7 ne bornait rien.** Il est décrit comme « la panoplie entière », mais la panoplie
affiche **7 activités** là où le vocabulaire n'en compte que **6** : `eli5` se demande sous la
forme `cours` (il s'ancre dessus), `revision` sous la forme `card`. Une liste dédupliquée ne peut
donc jamais atteindre 7 — le garde-fou était **inatteignable, donc intestable, donc décoratif**.

Il est désormais mesuré sur la charge **brute**, avant déduplication : **le plafond borne la
TAILLE de l'appel, le vocabulaire borne son CONTENU.** Deux garde-fous, deux risques différents.

Corollaire côté client : `cours` et `eli5` sont **toujours indisponibles ensemble** (les deux
suivent l'existence d'un cours validé) et se demandent tous deux comme `cours`. Sans
déduplication, « tout ce qui manque » annoncerait **7** et enverrait deux fois la même demande.

### Alternatives écartées

- **Réutiliser `notion_requests`** — sa sémantique est l'inverse : « notion hors programme, texte
  libre, `skill_id = None` ». Ici la notion **existe**, c'est le contenu qui manque.
- **Un endpoint unifiant les deux files** — recolle deux sémantiques séparées à raison.
- **Un `GET` élève « mes demandes »** — expose `dismissed`, et transforme une file de travail
  parent en écran d'attente d'enfant.
- **L'émission AUTOMATIQUE à l'affichage d'une panoplie incomplète** — la file se remplirait du
  **survolé** et non du **voulu**. La demande perdrait sa valeur de priorité, précisément ce qui
  la rend utile à Papa.

### Conséquences

**Positives** — le geste le plus naturel du produit existe enfin ; Papa reçoit des demandes
**choisies**, donc hiérarchisables ; l'invariant lecture seule de `production` tient.

**Coûts assumés** — un module `require_parent` s'ouvre en écriture à l'enfant (contrepartie : les
trois garde-fous) ; et une asymétrie de rôles dans un même module, qu'il faut lire pour comprendre.

**Zéro table, zéro migration.**

### Amendements — le soir même (2026-08-01)

#### A. « Demander à Papa » devient « demander à ZETIS »

L'interlocuteur de Massimo est **ZETIS** — le même que dans le chat, où il réclame déjà des
contenus. Papa reste le **destinataire** (`source: "subject_page"` inchangé, la ligne atterrit
dans sa file), mais l'enfant s'adresse à l'app, pas à son père par-dessus l'épaule de l'app.

Le retour devient **« C'est noté par ZETIS »** — jamais « je te le prépare ».

#### B. La phrase « ZETIS transmet la demande. Il ne fabrique rien tout seul. » est SUPPRIMÉE

**Divergence assumée avec cet ADR même**, qui l'exigeait sous le bouton. Elle était le garde-fou
de l'amendement A : « demander à ZETIS » pourrait se lire « ZETIS va le faire », et c'est elle qui
l'empêchait.

**Motif du retrait : ZETIS produira bientôt du contenu lui-même.** La phrase deviendrait un
mensonge, et on ne fige pas dans l'UI une limite qu'on s'apprête à lever.

Ce qui reste tient l'honnêteté sans elle : « C'est noté par ZETIS » dit qu'une demande est
**enregistrée**, sans promettre qui la traitera ni quand — vrai que le contenu vienne de Papa ou,
demain, de ZETIS.

Le test qui vérifiait la phrase a été **remplacé, pas supprimé** : il interdit désormais « je te
le prépare », « je m'en occupe », tout délai et tout statut. **Le garde-fou change de forme, il ne
disparaît pas** — et le jour où ZETIS générera vraiment, la tentation d'annoncer une livraison
sera là, c'est ce test qui la bloquera.

### Point ouvert

**Quand ZETIS produira lui-même : la demande déclenche-t-elle la génération, ou passe-t-elle
toujours par la validation de Papa ?** `CLAUDE.md` (« aucune réponse IA n'est vérité absolue ;
validation Papa obligatoire avant activation ») penche pour la seconde. **C'est une décision
d'ADR, pas d'UI** — à trancher avant d'écrire la moindre ligne de ce mécanisme.
