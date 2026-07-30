# ADR-0027 — Chat ZETIS orchestrateur : intent typé, ancré, orienté vers l'existant

## Statut

Proposé — 2026-07-30. **Les quatre décisions structurantes (§1 à §4) sont VALIDÉES par le
commanditaire le 2026-07-30** (avec précisions : « pas de cible → ZETIS le dit », ouverture ciblée,
et « contenu absent → demande à Papa » dont le mécanisme est différé, Point ouvert n°4). Reste
« Proposé » jusqu'au commit du cadrage sur `main` ; passe **Accepté** à ce moment.

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
4. **Mécanisme de la demande de contenu à Papa** (§3, différé par le commanditaire) : extension de
   `notion_requests` (ajout `skill_id`, `kind`) **ou** nouvelle petite table `content_requests
   {student_id, skill_id, kind, status}` ; surface Papa de traitement (réutiliser/étendre
   `NotionRequestsPanel`) ; dédup. → à cadrer avant la slice qui l'implémente. **Hors Lot 1 minimal**
   (Lot 1 = honnêteté ; la demande structurée vient avec son mécanisme).

## Décisions du commanditaire — VALIDÉES le 2026-07-30
1. **Intent typé + ancrage serveur** (§1) — le chat ne route que vers des cibles construites depuis un
   id validé, jamais une route hallucinée ; **pas de cible → ZETIS le dit**. ✅
2. **Navigation modale voix/clavier + données affichées dans le chat** (§2) ; **ouverture ciblée**. ✅
3. **Orienter vers l'existant validé, jamais générer** (§3) ; **contenu absent → demande à Papa**
   (mécanisme différé, Point ouvert n°4). ✅
4. **Réutiliser `chat_tool_response`, aucun nouvel event, aucun ré-engagement** (§4). ✅
