# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Branche : `feat/chat-orchestrateur`** (depuis `main`, 2026-07-30) — chantier **Chat orchestrateur
(ADR-0027)**. Le chantier **Chat mémoire+voix (ADR-0026) est COMPLET et MERGÉ sur `main`** (FF, 4
commits `d03918c`→`6672df9`, `main` devant `origin/main` de 4 ; push = geste user). Le cadrage
ADR-0027 est aussi sur `main` (`6672df9`).

**Orchestrateur — Slice A backend COMMITÉE (`ff353b6`) + Slice B frontend FAITE (non commitée).**
- **A (backend)** : le chat produit un **intent typé** que le serveur **ancre** — `resolve_action`
  (`app/modules/chat/actions.py`) : `resolve_skill` → `galaxy.notion_panel(skill_id)` (matière +
  contenus `available` + ids) → route depuis un id **validé** (fiche→`/fiches/<slug>`,
  mindmap→`/mindmaps/reconstruire/<id>`, eli5→`/eli5?skill_id=`, révision→`/revision?subject=<slug>`) ;
  cible non ancrable → `action=None` **et ZETIS le dit** ; contenu absent → note « je le note pour
  Papa » (mécanisme différé). `show_data` = le front fetch. `ChatMessageOut.action` =
  navigate|show_data|None ; `chat_turn_schema` +`intent` ; `ai_jobs` métadonnées seules (+`action`,
  jamais de texte). **581 back verts** (test-verrou « jamais de route hallucinée »).
- **B (frontend)** : `ChatPage.tsx` exécuteur — **voix→`navigate()` direct**, **clavier→carte-action
  à taper**, **`show_data`→carte inline** (`components/ChatDataCard.tsx` récupère agenda/reviews/
  missions). `lib/chatActions.ts` (`surfaceOf`, `DATA_ROUTE`), `ChatReply.action`. Le geste émet
  `chat_tool_response` (surface dérivée de la route, zéro nouvel event). **178 Massimo + tsc + build
  verts** (3 neufs : voix→navigate, clavier→carte→navigate+trace, show_data→carte). Backend relancé
  `:8000` avec l'orchestrateur.
- **Correctif post-test live (2026-07-30)** : « nommer une notion » (ex. « addition et soustraction de
  fractions ») ne redirigeait pas — qwen3 classait `intent=none`. Fix : (a) `skill_resolution` aligné sur
  la VISIBILITÉ (`Chapter`/`Lesson` validés) — évite les « pas dans ton programme » contradictoires ;
  (b) **repli serveur** : notion résolue + aucune action LLM → ZETIS **propose une carte ELI5**
  (`confirm=True`) ; (c) drapeau `confirm` → offre implicite = carte même à la voix, **auto-nav vocale
  réservée aux demandes explicites** ; (d) exemple dans le prompt. Vérifié : « fractions » → skill 127 →
  action `/eli5?skill_id=127`. 582 back + 179 Massimo verts.
- **NEXT = commit slice B (+ correctif) → PR `feat/chat-orchestrateur` → merge.** Le mécanisme « demande
  de contenu à Papa » (Point ouvert n°4) reste à cadrer avant sa slice. Live re-testable par le user.

---

### Historique (chantier chat mémoire+voix ADR-0026, MERGÉ) — conservé pour les pièges

**Slice A backend FAITE** (commit `d03918c`) :

- **Zéro table, zéro migration** (invariant de l'ADR : le verbatim est éphémère par construction).
- **`app/modules/chat/`** : `store.py` (sessions Redis, TTL glissant `chat:{student}:{session}`,
  `InMemoryChatStore` pour les tests + dépendance `get_chat_store`), `service.py` (orchestrateur
  d'un tour), `schemas.py`, `router.py` (3 routes `require_child` sous `/api/student/chat` —
  sessions / messages / close ; **aucune route parent, aucune méthode GET**).
- **Module PARTAGÉ** `app/modules/ai/skill_resolution.py` : texte libre → `skill_id` par cosinus
  d'embeddings (nomic-embed-text, notions de l'année active + repli sur toutes), best-effort
  absolu (ne lève jamais). ELI5 en héritera (différé promu prérequis, ADR-0026 §6).
- **3 `learning_events`** dans `activity/events.py` (`chat_topic`, `chat_tool_response`,
  `chat_difficulty_declared`), émis serveur, non probants, **zéro XP**.
- **Règle Gap §3** : `source=ai_observation` (1er producteur), `severity=low` toujours,
  corroboration = `SkillMastery ∈ {unknown,weak,learning}` **et ligne existante** (sans ligne →
  pas de Gap), lacune ouverte → rien, jamais d'escalade.
- **`ai_jobs` de métadonnées seules** pour un tour (`chat_turn`) : `input=`{session,index},
  `output=`{skill_id,kind,tool_type,duration} — **jamais un texte** (pipeline aveugle §1c).
- Constantes versionnées dans `core/config.py` (`CHAT_SESSION_TTL_MINUTES=120`,
  `CHAT_MAX_TURNS_PER_SESSION=40`, `CHAT_CONTEXT_TOKEN_BUDGET=300`,
  `CHAT_SKILL_RESOLUTION_MIN_SCORE=0.55`, `CHAT_RECALL_WINDOW_DAYS=7`). Prompt versionné
  `app/prompts/chat.py` (`chat_v1`, sortie structurée — point ouvert n°1 tranché en JSON).
- **`app/tests/test_chat.py` : 16 tests d'invariants verts** (metadata sans table chat, ai_jobs
  sans verbatim, dédupes, matrice Gap, TTL, purge, anti-spam 429, zéro XP, frontière parent).
  **Suite complète : 576 back verts, zéro régression.** App démarre (40 routers).

**Slice B FRONTEND FAITE (Lot 1 texte + avatar), NON commitée** — même branche `feat/chat-memoire` :
- **Brique `@zetis/ui/avatar`** (sous-chemin dédié, patron `@zetis/ui/mindmap`) : `AvatarCanvas.tsx`
  (moteur canvas transposé de la maquette — bruit apériodique, spectre radial, coquilles
  directionnelles, horloges indépendantes iris/paupières/mâchoire), `constants.ts` calibrées,
  `phonetics.ts` (flux gelé `[ouverture, grave, médium, aigu]`), `avatar.css`, image webp extraite
  de la maquette en asset réel (`assets/zetis-face.webp`). Contrat : zéro fetch, zéro métier.
- **Page `/chat`** (`ChatPage.tsx` + `chat.css` + `lib/chat.ts` + `lib/karaoke.ts`) : états 1→5,
  karaoké piloté par la pseudo-phonétique, tap-pour-couper, carte outils APRÈS la parole seulement,
  phrase de transparence fixe, 429 doux, toggle « animations réduites », deep-link ELI5 seul câblé.
- ⚠️ **Patron réseau = INLINE, PAS le polling `/ai/jobs`** : la réponse revient dans le POST
  `messages` (la spec/prompt supposaient ELI5-polling, impossible ici car `ai_jobs.output_json`
  est durable + lisible sans contrôle → violerait §1c). Stop-on-blocker tranché par l'ADR.
- ⚠️ **Recall chip d'ouverture NON fait** : slice A n'expose aucune route « notions récentes »
  (le rappel est composé serveur pour le LLM, pas renvoyé au client). Différé, pas inventé.
- **Vérifs** : `tsc -b` propre, **173 tests Massimo verts** (6 sur `ChatPage`, dont test-verrou
  source = aucune API vocale navigateur ni stockage local), `vite build` vert. Avatar **non vu
  à l'écran** (canvas nul en jsdom ; verif live = user une fois loggé).

**Slice B Lot 1 COMMITÉE** (`71f8094`). **Lot 2 VOIX FAIT, NON commité** (même branche) — voix
complète 100 % locale, zéro nouvelle dépendance :
- **Entrée (STT)** : bouton micro appui-pour-parler → réutilise l'endpoint ELI5 Whisper
  (`/api/ai/eli5/transcribe`, local) → texte → tour de chat. `lib/dictation.ts` (MediaRecorder)
  réutilisé. Micro masqué si non supporté ou STT 503.
- **Sortie (TTS)** : route backend **`POST /api/student/chat/tts`** (Piper local, `service.synthesize_speech`,
  audio éphémère jamais persisté, 503→repli muet). Front `lib/voice.ts` : lit le WAV via un
  **`AnalyserNode`** qui pilote la bouche de l'avatar depuis le VRAI audio (la source promise du flux
  d'articulation — le consommateur `AvatarCanvas` n'a pas changé). Karaoké calé sur la durée réelle.
- Repli propre : sans `AudioContext` (jsdom/ancien navigateur) ou sur 503 → karaoké muet du Lot 1.
  iOS : `primeAudio()` sur geste (envoi/micro).
- **Vérifs** : `tsc -b` + **175 tests Massimo** + `vite build` verts ; **577 back** (test route TTS) ;
  **TTS prouvé LIVE** (`POST /tts` → HTTP 200 audio/wav 148 Ko, Piper réel). UI voix/micro **non vue**
  (canvas + audio nuls en jsdom ; login = user).

- **prochain pas : vérif humaine (tests + diff) + essai live voix/micro par le user → commit Lot 2
  → PR `feat/chat-memoire`.** Puis lots restants (hors ADR-0026) : streaming SSE, bornes de mots
  réelles pour le karaoké (TTS à timestamps), migration Rive.
  Classifieur de difficulté pas encore éprouvé sur le vrai 4B (Ollama).

**CHANTIER SUIVANT CADRÉ (docs, non commité) — Chat ORCHESTRATEUR (ADR-0027, Proposé)** : le chat
pilote toute l'app en langage naturel (« montre mes fiches sur les fractions », « c'est quoi mes
devoirs »). Cadrage écrit ce jour (fichiers **neufs**, pas de chevauchement avec le code voix) :
`docs/decisions/adr-0027-chat-orchestrateur.md`, addendum `page-chat.md §Orchestration`, 2 prompts
`prompt-chat-orchestrateur-slice-{a-backend,b-frontend}.md`, ligne `DECISIONS.md`. Cœur : intent LLM
typé **ancré serveur** (`resolve_skill` → `galaxy/notion/{skill_id}` → route depuis un id **validé** ;
cible non ancrable → `action=null`, jamais de route hallucinée) ; `ChatMessageOut.action` =
navigate|show_data|null ; **nav modale** (voix→direct, clavier→carte) ; **données dans le chat** (front
fetch, pipeline aveugle §1c) ; **orienter vers l'existant validé jamais générer** ; réutilise
`chat_tool_response` (aucun event neuf). **4 décisions à VALIDER par le user avant slices.**
Séquencement : merge chat voix d'abord → cadrage sur `main` → implémenter sur `feat/chat-orchestrateur`.

⚠️ **Piège dev (2026-07-30)** : « impossible de se loguer sur Massimo, `massimo1234` ne marche
plus » = **backend éteint**, PAS un mot de passe changé. Le front pointe `VITE_API_URL=:8000` ;
sans backend, le login échoue avec une erreur d'auth trompeuse. Fix : relancer
`uv run uvicorn app.main:app --port 8000` depuis `apps/backend`. Aucun override `MASSIMO_*` en
`.env` — le mot de passe reste `massimo1234` (dev_users, `config.py`).

⚠️ **Écarts read-before-code du chat, à ne pas re-débattre** :
- **`ai_jobs` n'est PAS asynchrone** (ni worker ni polling) : ELI5 exécute le LLM en synchrone
  dans le POST. Le chat suit ce patron synchrone — d'où « aveugle au contenu » trivial.
- **Aucun embedding stocké par `Skill`**, pas de lien direct Skill→année active : la résolution
  vectorise les notions candidates à la volée (jointure SchoolYear active → LessonSkill → Skill,
  repli toutes notions si vide).
- **Redis n'avait aucune convention session/TTL** (seul RQ média l'utilisait) : `store.py` la
  crée (doctrinalement prévu, ARCHITECTURE §Redis).

⚠️ **Chantier précédent — Agenda scolaire (ADR-0025) : COMPLET, MERGÉ `main` PR #56** (squash
`f8c5e28`), branche supprimée. Backend + page Papa + page Massimo. **Ne pas ré-implémenter.**
Piège hérité, toujours vrai et réutilisé par le chat : trois lecteurs de `learning_events`
n'étaient **pas** filtrés par `event_type` (`activity._load_events`,
`activity._trailing_inactive_days`, `motivation._active_days`) → frozenset `NON_ACTIVITY_EVENTS`
(`activity/events.py`). Les 3 événements de chat sont **non probants** parce qu'`evidence` ne lit
que `mission_verdict` (test-verrou) — pas besoin de les ajouter au frozenset (qui ne concerne que
les projections d'activité, pas l'évidence).

**Chantier précédent — ZETIS Galaxy : MERGÉ** dans `main` (PR #55, merge `af039d0`).
La section ci-dessous est conservée pour ses pièges, pas pour son état.

Le chantier a été ouvert comme un cadrage (maquette → spec → ADR-0024 → prompts), puis le user a
demandé d'enchaîner l'exécution dans la même session. Les deux slices y sont : backend `galaxy`
(4 routes + frise, **aucune migration**) et frontend Massimo (page Progression refondue + aperçu
sur l'Accueil). **Vérifié à l'écran sur la vraie base**, pas seulement en test.
Voir §« Chantier ZETIS Galaxy » plus bas pour les pièges — ils sont coûteux à re-découvrir.

Le chantier « Couverture de production »
(ADR-0023) est **MERGÉ** : PR [#54](https://github.com/NeuronXcore/zetis-school/pull/54), merge
commit `dc82f9c`, **7 commits conservés individuellement** (merge commit délibéré, pas de squash :
chacun est autonome et revertable seul, ce qui comptait surtout pour `chore(assets)`). Branche
`docs/couverture-production` supprimée en local et sur `origin`.

⚠️ **Ne pas ré-implémenter** la Couverture : elle est complète et sur `main` — backend
(`production` + `engagement` + provenance), page Papa, passe visuelle, convention d'assets.

### Dépôt nettoyé (2026-07-28) — 4 branches et 2 stashes, rien de perdu

**État : `main` seule, local et distant. Zéro branche, zéro stash.**

Les 4 branches supprimées étaient toutes vérifiées fusionnées **avant** suppression, et leurs tips
restent restituables à vie par les refs de PR que GitHub conserve
(`git fetch origin refs/pull/<n>/head`) :

| Branche supprimée | Preuve | Tip archivé |
|---|---|---|
| `feat/activite-backend` | PR #52 · SHA fusionné = tip | `refs/pull/52/head` → `1284deb` |
| `feat/motivation-massimo` | PR #53 · SHA fusionné = tip | `refs/pull/53/head` → `befe91e` |
| `mindmap` | tip ancêtre de `main` | `refs/pull/51/head` → `3d2b499` |
| `mission` | PR #46 · tip ancêtre de `main` | `refs/pull/46/head` → `cb3d581` |

**Les 2 stashes ont été récupérés avant d'être vidés** (commits `08c5723` + `d1b70ba`) :

- `stash@{1}` (4 semaines, `feat/design-system`) portait **deux specs jamais atterries** —
  `docs/frontend-massimo/navigation.md` et `zetis-galaxy.md`, 265 lignes. Vérifié : « galaxy »
  n'existait nulle part ailleurs dans le dépôt. ⚠️ Elles arrivent avec un **bandeau de réserve** :
  elles se déclarent normatives alors qu'elles n'ont jamais été confrontées au code, et 4 semaines
  de développement ont passé. **Ne pas les faire appliquer sans les vérifier ligne à ligne.**
  ZETIS Galaxy reste une conception **non implémentée**.
- `stash@{0}` (24 h) enrichissait l'index des ADR. Repris : les descriptions 0001→0005 et les
  amendements ADR-0017. Le reste (0012→0019) existait déjà dans `main` sous une formulation plus
  récente — sa version de `DECISIONS.md` était antérieure à l'ADR-0023, la restaurer en bloc aurait
  fait régresser le fichier. Écart connu et assumé : pour ADR-0018 et ADR-0019, la ligne d'index du
  stash était plus longue que celle de `main` ; les ADR eux-mêmes sont intacts.

⚠️ **Deux pièges de diagnostic**, à connaître avant de refaire ce contrôle :

- **`git branch --merged` ne liste PAS `activite` ni `motivation`.** Les PR #52 et #53 ont été
  **squashées** : les commits d'origine ne sont donc pas ancêtres de `main`, seul leur contenu y
  est (`6e7cb78`, `40bcef8`). L'outil dit vrai sur la topologie et faux sur le fond — s'y fier
  seul ferait conclure à du travail perdu.
- **Le diff de contenu vs `main` n'est pas un test** : 1188 et 484 lignes d'écart, mais c'est
  `main` qui a avancé depuis sur les mêmes fichiers. Comparer un tip figé à une trunk qui bouge ne
  prouve rien.

Le seul test qui tranche pour une branche squashée : **`gh pr view <n> --json headRefOid`** (le SHA
que GitHub a réellement fusionné) comparé au tip local **et** distant. S'ils sont identiques, rien
n'a été poussé après la fusion.

### Session 2 (2026-07-28) — passe visuelle `/couverture` + rangement des assets

La passe visuelle demandée au « prochain pas » a été faite, **pilotée par le user** qui regardait
la page dans son propre navigateur (l'agent n'a jamais eu de session Papa : il ne saisit pas de
mot de passe). Quatre retours, quatre livrables — détail dans `docs/frontend-papa/page-couverture.md`
§Passe visuelle :

1. **KPI cliquables** → chacun ouvre son complément (« 27/78 cours » ouvre les 51 restants). La
   pilule « 🔒 Bloquées » a été **scindée** en `🔒 Non validées` / `📝 Sans cours` : elle mélangeait
   les deux causes, or `blocked_no_course` ne contient que des leçons *validées* — « Leçons
   validées » ne pouvait pas pointer dessus sans se contredire.
2. **Pictogrammes de matière** sur les en-têtes de matrice **et** en pastilles de filtre (le
   `<select>` a disparu). `SubjectPictogram` extrait de `SubjectFilterChips` → un seul rendu.
3. **Expanders par matière** : repliés en vue d'ensemble, dépliés dès qu'un filtre ou une matière
   est demandé, avec rappel d'anomalies (`🔒 4  ⏳ 2`) calculé sur la matière **entière**.
4. **Icône `CouvertureIcon`** (fournie par le user) + respiration lumineuse, aux 3 endroits qui
   désignent la Couverture (en-tête animé, sidebar, relais Dashboard).

**Rangement des assets, hors chantier mais demandé explicitement** (« mets de l'ordre », puis
« go ») : ~9,8 Mo retirés des bundles (Massimo 10,3 Mo → 1,6 Mo ; Papa 2,1 Mo → 1,0 Mo), 11
originaux rapatriés dans `assets/brand/icons/`, 2 doublons exacts supprimés, planche de contact
sortie du glob. La **règle a été inversée** dans `assets/brand/README.md` : les visuels importés
vivent dans `src/assets/`, pas dans `public/assets/` — c'est ce que le code faisait déjà, la doc
avait tort. Voir §DÉCISIONS ACTIVES.

**Vérifié** : 212 Papa + 111 Massimo verts, `tsc -b` et `vite build` verts sur les deux apps.
L'icône et son animation ont été prouvées sur un **banc d'essai isolé** (le navigateur intégré
n'étant pas connecté) : capture + `getAnimations()`. Le reste de la page **n'a toujours pas été vu
de bout en bout par l'agent**.

### Chantier « Couverture de production » (ADR-0023) — CLOS

Quatre commits, dans cet ordre (chacun dépend du précédent) :

1. **`8c993b6` docs** — ADR-0023 + addenda ADR-0011 §E (fraîcheur) et §F (provenance), 4 ADR
   amendés, maquette + spec + 2 prompts de slice.
2. **`02f37a9` engagement** — prérequis : module neutre `engagement` + exception « mission
   engagée » sur les chemins d'achèvement des mindmaps.
3. **`586b202` production (backend)** — `is_stale`, provenance (migration `d5e6f7a8b9c0`),
   modèle de lecture + 2 endpoints `require_parent`.
4. **(ce commit) frontend + correctifs** — page Couverture, liens ciblés, validation en lot,
   et deux défauts de schéma/UX corrigés (voir ci-dessous).

**Migrations appliquées sur la DB de dev** : `d5e6f7a8b9c0` (provenance, 6 tables, reprise NULL)
et `e6f7a8b9c0d1` (horodatages `fiches`/`mindmaps`).

**Vérifié** : 518 back + 203 Papa verts, `tsc -b` et `vite build` verts, un seul head alembic.
Modèle de lecture éprouvé sur **Postgres réel** (69 leçons, 18 requêtes, 79 ms — aucun N+1).

⚠️ **Ce chantier n'a PAS été vérifié à l'écran de bout en bout** : la session Papa du navigateur
intégré a expiré en cours de route, et l'agent ne saisit pas de mot de passe. Le user a testé
manuellement et a remonté 3 défauts réels que les tests ne voyaient pas (cf. `TROUBLESHOOTING.md`
§ chantier `couverture`). **La prochaine session doit commencer par une passe visuelle.**

### Ce que le user a remonté et qui reste ouvert

- **Colonne Fiche** : le lien ciblé surligne la carte mais n'ouvre pas sa modale — volontaire
  (c'est un ÉDITEUR, pas une vue), à trancher si la symétrie avec quiz/mindmap est préférée.
- **Ouverture auto de la modale mindmap** : ajoutée sur un malentendu de ma part (le user parlait
  de la colonne *Cartes*, pas *Mindmap*). Défendable en soi — à confirmer ou retirer.
- **5 générations non voulues** dans la DB dev (jobs #316→#320), **gardées** sur décision du user.
  « Calculs avec priorités et nombres relatifs » reste en `draft` : son cours vient d'être rédigé,
  le gate ADR-0009 §A joue son rôle — **ne pas la revalider mécaniquement**.

### Derniers chantiers mergés (repères)

- **Conseil de classe IA (ADR-0020) + équipement de mission (ADR-0021)** — PR #48 (`639209e`).
  Module backend `reports` : narration LLM **locale** sur le service d'évidence, rapport **persisté**
  (`council_reports` + `evidence_snapshot_json`, migration `b8c9d0e1f2a3`), recommandations typées →
  missions via Commander ; **équipement** = « Créer ces missions » génère + auto-valide le kit
  (cours/fiche/SRS/quiz/mindmap), **jamais de régénération** de l'existant. Front Papa
  (`ConseilClasseIAPage` + `lib/councilClass.ts` + `hooks/useCouncilClass.ts`) + liste missions
  Massimo (`origin` papa/zetis + badge ✨ new).
- **Missions ADR-0017/0018/0019** (moteur, Commander, step mindmap, frontends) — PR #46.
- **`generate_revision` mono-notion** (ADR-0017 §5) — PR #47.

### DÉCISIONS ACTIVES (figées — ne pas rouvrir ; détail dans les ADR)

- **Couverture** : `absent` se déduit de **l'existence de la ligne**, jamais d'une date — une
  date nulle rend seulement le *périmé* indécidable. Le **cours n'entre pas** dans le pourcentage
  de dérivés (il en est la condition). **Aucun agrégat de provenance** (§F.2), aucun tri, aucun
  score par matière : la page répond à « où j'en suis », elle ne produit pas un classement.
- **§F** : `mark_validated` est l'**unique** point d'écriture de `validated` ; toute action
  groupée écrit `parent_bulk` **sans exception** ; `system` est **strictement réservé au quiz**
  (test-verrou). Une leçon déjà validée n'est jamais re-tamponnée par un lot.
- **Assets (session 2)** — l'original pleine résolution va dans `assets/brand/`, la **réduction**
  (suffixe `_256` / `_384`, dimensionnée sur le rendu réel **× 3** car Massimo tourne sur iPhone)
  va là où le code l'importe : `packages/ui/src/assets/` si les deux interfaces s'en servent,
  `apps/frontend-<app>/src/assets/` sinon. **`public/assets/` n'est plus le point de dépôt** — un
  `import` TS fait échouer le build si le fichier manque, hashe le nom pour le cache, et sort du
  bundle ce qui n'est plus utilisé. Règle complète : `assets/brand/README.md`.
- **Couverture — KPI** : un KPI ouvre son **complément**, pas ce qu'il compte (un chiffre atteint
  ne se travaille pas). Les cartes restent cliquables même à zéro (choix du user).
- **Couverture — expanders** : repliés en vue d'ensemble, **dépliés dès qu'on demande quelque
  chose d'explicite** (pilule d'état ou matière). On ne cache jamais ce qui vient d'être demandé.
  Les rappels d'anomalies sont des **comptes**, jamais un pourcentage — le « aucun score par
  matière » ci-dessus tient toujours.
- **Vocabulaire** : « Mindmap » ≠ « carte (de révision) ». Ne jamais écrire « carte mentale »
  dans l'UI Papa — les deux colonnes sont voisines dans la matrice.
- **Capsules** : non générables en un clic **par construction** (l'API exige une `instruction`
  écrite par Papa). Depuis la Couverture, on ouvre le compositeur pré-rempli — avec `skill_id`,
  sans quoi la capsule ne compte dans aucune fraction.

- **Activité — 2 `event_type` RÉUTILISÉS au lieu d'être dupliqués.** La spec demandait
  `eli5_reverse` et `mission_completed` ; le code émettait déjà, au même instant et pour le même
  acte, `reverse_eli5` (`eli5/service.py`) et `mission_verdict` (`missions/service.py`, posé là
  où `mission.status` passe à `completed`). Les ajouter aurait créé **deux événements pour un
  seul acte** → double comptage dans la heatmap ; les renommer aurait cassé leurs lecteurs
  (`evidence.VERDICT_EVENT`, `completed-today`). Constantes `EVENT_ELI5_REVERSE` /
  `EVENT_MISSION_COMPLETED` dans `activity/events.py`. **7 hooks neufs, pas 9.**
- **Activité** : `POST /api/missions/{id}/complete` de la spec **n'existe pas** et n'a pas été
  créé — les missions se terminent par étape (`/{id}/steps/{step_id}/complete`).
- **Activité** : sessions **jamais stockées** (reconstruites à la lecture) ; `xp_events` et
  `learning_events` **jamais en UNION** ; `days_inactive` toujours calculé **toutes matières**,
  même sous filtre.
- **ADR-0020** : rapport Conseil **persisté** (LLM non rejouable) ; `skill_id` **ancrés** sur
  l'évidence ; 100 % local ; Papa-only ; recommandation → missions **mono-notion** via Commander.
- **ADR-0021** : popup Papa = approbation → **auto-validation** du kit (soupape §5ter bornée) ;
  **jamais de régénération** d'une pièce déjà créée (même `pending`) — on valide l'existant + génère
  le manquant ; équiper **avant** de créer la mission.
- **Missions Massimo** : champ d'affichage `origin` (papa/zetis), **pas** l'enum `created_by`
  (pilot-only) ; badge « new » = mission `planned`.

### Chantier ZETIS Galaxy — CADRÉ **ET LIVRÉ** le 2026-07-28

Branche `feat/galaxy`, poussée. **PR à ouvrir.** 157 tests Massimo + 542 backend, typecheck
Massimo + Papa, build — verts. Vérifié **à l'écran sur la vraie base** (Postgres + backend :8003).

**Livré** : cadrage complet (maquette, spec réécrite, ADR-0024, 2 prompts) **+** module backend
`galaxy` (4 routes élève + frise, **aucune migration**) **+** frontend Massimo (page Progression
refondue, aperçu Accueil 2 colonnes, brique `@zetis/ui/galaxy` + sous-chemin `/canvas`).

⚠️ **Ne pas ré-implémenter.** Détail des routes : `API_SPEC.md` §ZETIS Galaxy.

**Trois amendements de l'ADR-0024, tous par décision explicite du user en cours de session** —
ils sont écrits dans l'ADR avec leur date et leur coût, ne pas les rouvrir sans raison :

1. **§9 rouvert** : un graphe **global** existe sur l'Accueil, alors que l'ADR l'excluait. Coûts
   bornés (canvas en `lazy()`, repli sur matières+chapitres au plafond), pas ignorés.
2. **§4 révisé** : la panoplie **complète** est renvoyée avec `available`, au lieu d'omettre
   l'indisponible. Justification : une fiche manquante n'est pas un échec de l'enfant.
3. **2D → 3D** : `@xyflow/react` avait été retenu pour son coût nul, puis disqualifié par
   l'exigence 3D. Deux moteurs graphe coexistent ; **ADR-0016 non rouvert**, les mindmaps gardent
   React Flow.

**Ce que le read-before-code a invalidé dans le brouillon** — à ne pas re-découvrir :

1. **`Skill.prerequisite_skill_ids` n'existe pas** (ni colonne, ni table) et **`parent_skill_id` est
   NULL partout** (`curriculum/service.py:501-521` ne l'écrit jamais). Les « liens stellaires »
   n'avaient **aucune source de données**. → arêtes dérivées de
   `Skill ← lesson_skills → Lesson → Chapter`, rien d'autre.
2. **`GET /progress/skills` n'existe pas**, et `progress` est **Papa-only** (`require_parent`).
   → trois routes élève neuves sous `/api/student/galaxy`.
3. **`/progression` est déjà un onglet** avec une page XP/badges, dont la section « par matière »
   est **mockée**. → la Galaxy prend sa place, l'existant prime sur `navigation.md`.
4. **Seul ELI5 est notion-adressable par URL** (`/eli5?skill_id=N`) ; Quiz et Révision passent par
   `location.state`, Cours/Fiches/Mindmaps par matière. Et **aucune fonction backend** ne dit « pour
   ce `skill_id`, quels contenus validés existent » (`production/coverage.py` est leçon-centrée
   **et** Papa-only). → 3ᵉ route `galaxy/notion/{skill_id}`, réutilisant les résolveurs de
   `missions/service.py:76,98`.

**Pièges rencontrés À L'EXÉCUTION** — chacun a coûté un aller-retour, aucun n'est théorique :

- `SkillMastery.status` a **SIX** valeurs, pas cinq : `in_progress` est écrit par
  `missions/service.py:859` et ne sort d'aucun `_status_from_score()`. Un mapping à 5 branches le
  manque **en silence**.
- `mastery_score` est sur **0–100** ; `evidence.mastery_by_skill()` renvoie la valeur **brute**.
- **Massimo a trois postes, pas un** (précisé par le user le 2026-07-28) : **iPhone, iPad et un
  MacBook dédié à l'école**. Ne pas re-rédiger « l'iPhone est la cible » — c'est le poste le plus
  **contraint**, et ce sont l'iPad et le MacBook qui donnent son sens à la 3D. D'où un plafond de
  nœuds **adaptatif** (40 / 90 / 150, provisoire) et l'interdiction de faire dépendre quoi que ce
  soit d'essentiel du **survol**, qui n'existe pas au tactile.
- **Le `lazy()` ne suffit pas à isoler Three.js.** Ré-exporter le canvas depuis le baril
  `@zetis/ui/galaxy` le faisait entrer dans le bundle de départ (**3,6 Mo**, mesuré). D'où le
  sous-chemin dédié `@zetis/ui/galaxy/canvas`. Ne pas « simplifier » ce baril.
- **Un matériau très émissif APLATIT une sphère** : elle s'éclaire uniformément, plus d'ombrage
  ni de reflet, elle se lit comme un disque. Vrai pour le soleil comme pour le cerveau — garder
  l'émission basse et mettre l'éclat dans les **aures**.
- **Un panneau face caméra est plat par construction** : le pictogramme de matière plaqué sur le
  soleil masquait le limbe ombré. Il a été retiré du soleil (il reste sur l'écran d'ensemble).
- **Sans nœud racine, les composantes se disloquent** (le moteur de forces éloigne les
  composantes disjointes) — d'où `subject` dans une constellation et `root` dans le graphe global.
- **La remontée de l'or doit être TRANSITIVE** : un seul cran suffit dans une constellation mais
  pas dans le graphe global (3 niveaux) — les liens du cerveau restaient éteints.
- **Tailwind v4 pose `cursor: default` sur les `<button>`** (changement vs v3) : `cursor-pointer`
  est explicite partout où l'interactivité doit se voir.
- **En construisant soi-même les objets 3D, `nodeVal`/`nodeColor`/`nodeRelSize` cessent de
  s'appliquer** — reproduire la formule de la lib (`∛volume × rayon`), sinon les nœuds
  rapetissent d'un coup et deviennent inatteignables au doigt.
- **`GalaxyCanvas` ne filtre plus les clics** : il filtrait sur `kind === "skill"` et avalait les
  clics sur les soleils. C'est l'appelant qui décide du sens d'un clic.

**Vérification : mesurer que ça BOUGE ne prouve pas que ça se VOIT.** Trois rendus ont dû être
repris parce que je validais une propriété calculée (`background-position` qui change, animation
déclarée) au lieu de comparer deux captures d'écran. Les captures comparées sont le seul test
utile sur du visuel.

**Vérifié par le user (2026-07-28)** : **MacBook OK**, l'animation est fluide au plafond desktop
(150 nœuds). C'était le poste le plus confortable des trois.

**Reste ouvert** :

- **iPhone et iPad non essayés.** L'iPhone est le poste contraint : c'est lui qui décide si le
  palier `compact` (40) doit baisser. Si ça coince, on baisse CE palier — on ne retire pas la 3D
  des deux autres.
- **`prefers-reduced-motion` toujours non vérifié à l'écran.** Le panneau navigateur ne l'émule
  pas, et le retour « ça bouge sur mon Mac » prouve justement que l'option est **désactivée**
  chez le user — donc le chemin où tout doit se figer n'a jamais été exercé en vrai. Couvert par
  tests unitaires (`particlesFor`) et par la variante `motion-safe:`, rien de plus.
  Pour l'essayer : Réglages Système → Accessibilité → Affichage → Réduire les animations.

### PROCHAIN PAS

0. **Ouvrir la PR de `feat/galaxy`** — la branche est poussée, rien n'est mergé.
   Vérifications à la charge du user, que l'agent ne peut pas faire : **MacBook ✅ fait**,
   restent **iPhone + iPad** (plafonds 40/90 provisoires) et **`prefers-reduced-motion`**.
1. **Trancher le sort de la photo de Massimo** —
   `apps/frontend-massimo/src/assets/app/ChatGPT Image 5 juil. 2026, 14_36_01.png` (2 Mo, 1254 px)
   est une **photo du visage de l'enfant** montée dans une icône de progression. Elle est
   versionnée, **importée nulle part** (elle ne pèse que dans git). Laissée intacte
   volontairement : l'agent ne décide pas seul du sort d'une image d'un mineur. Trois options —
   garder / renommer et ranger dans `assets/brand/icons/` / sortir du dépôt.
2. **Une fois la Galaxy mergée**, au choix : **file de relecture** (prérequis dur du cron
   ADR-0023 — automatiser la fabrication d'un goulot est le seul vrai risque), ou **production
   en lot** (§7 : deux passes non fusionnables, cours puis équipement), dont le bouton
   « ⚡ Compléter le chapitre » marque déjà l'emplacement, désactivé.
3. ~~ZETIS Galaxy = chantier à ouvrir~~ → **LIVRÉ le 2026-07-28**, cadrage et code.
   Voir §« Chantier ZETIS Galaxy ». Suites possibles, hors v1 : graphe de **prérequis** (la
   donnée n'existe pas, c'est un chantier pédagogique à part), annonce « +1 étoile » en fin de
   mission, animation temps réel poussée par événement, réconciliation de `navigation.md`.
4. Restent ouverts, sans urgence : le **test flaky** `ProgrammePage` (barre de progression
   temporisée, cf. `TROUBLESHOOTING.md`), et la **vérification à l'écran de bout en bout** de la
   Couverture, que l'agent ne peut pas faire sans session Papa.

### Repères (orientation)

- `graphify explain "production"` / `"provenance"` / `"engagement"`. Back :
  `app/modules/production/` (modèle de lecture), `app/modules/provenance.py` (unique écrivain de
  la validation), `app/modules/engagement/` (exception mission engagée). Front papa :
  `CouverturePage.tsx`, `components/couverture/`, `lib/pilotageLinks.ts`, `hooks/useCoverage.ts`,
  `lib/coverageFilters.ts` (fonctions pures : pilules + `subjectAnomalies`),
  `components/CouvertureIcon.tsx`. Partagé : `packages/ui/src/components/subject-pictogram.tsx`.
- Visuels : `assets/brand/README.md` §Règle principale (source de vérité de la convention).
- Décisions : `DECISIONS.md` (index ADR complet 0001→0023, avec les 3 addenda ADR-0009/0011) +
  `docs/decisions/`. Modèle : `DATA_MODEL.md`. API : `API_SPEC.md`. Pièges : `TROUBLESHOOTING.md`.
- Données de test laissées en DB dev (council_report id 1, missions manual, kits générés) — sans
  conséquence.
