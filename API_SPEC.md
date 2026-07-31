# API_SPEC.md — Spécification API ZETIS

## Style général

API REST JSON via FastAPI.

Préfixe recommandé : `/api/v1`.

## Auth

### POST `/auth/login`

Entrée :

```json
{
  "email": "papa@example.com",
  "password": "..."
}
```

Sortie :

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "name": "Papa",
    "role": "parent"
  }
}
```

### POST `/auth/refresh`

Renouvelle le token.

### POST `/auth/logout`

Invalide la session.

## Health

### GET `/health`

Sortie :

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## Utilisateurs

### GET `/me`

Retourne l’utilisateur courant.

### GET `/students/current`

Retourne le profil Massimo pour le MVP.

## Années scolaires

### GET `/school-years`

Liste les années scolaires.

### POST `/school-years`

Crée une année scolaire.

### GET `/school-years/{id}`

Détail.

### PATCH `/school-years/{id}`

Met à jour.

## Matières

### GET `/subjects`

Liste des matières.

### GET `/subjects/{slug}`

Détail matière.

### GET `/subjects/{slug}/overview`

Vue enrichie pour page matière :

```json
{
  "subject": {},
  "current_chapter": {},
  "missions": [],
  "mastery": {},
  "recent_lessons": [],
  "next_reviews": []
}
```

## Référentiel de programme (curriculum)

Préfixe réel : `/api`. Génération et édition = **Papa uniquement** (`require_parent`).
Deux passes descendantes (ADR-0009) : passe 1 chapitres, passe 2 leçons + notions
(upsert `Skill`) ; co-construction par nœud (`source`/`validation_status` pour les
chapitres, `created_by`/`status` pour les leçons). Tâches `curriculum_*` routées vers le
cloud (dérogation ADR-0009, `claude-sonnet-5`) → **503** explicite sans clé ; la rédaction
de cours reste **locale**. Contrat de types : `packages/types/src/curriculum.ts`.

### Lecture de l'année active

#### GET `/school-years/active/subjects`

Année active + `school_year_subject_id` de chaque matière (clé des routes chapitres).

### Passe 1 — chapitres

#### POST `/school-year-subjects/{id}/generate-chapters`

Génère les chapitres d'une matière (IA, `pending` à valider). Requête longue (~10-30 s).

#### GET `/school-year-subjects/{id}/chapters`

Liste des chapitres de la matière (ordonnés).

#### POST `/school-year-subjects/{id}/chapters`

Ajout manuel Papa → `source=manual`, validé d'office.

#### POST `/school-year-subjects/{id}/chapters/reorder`

Réordonne (liste complète ordonnée des ids → `sort_order`).

#### POST `/school-year-subjects/{id}/chapters/validate-all` · POST `/school-years/active/chapters/validate-all`

Validation par lot des `pending` (matière, ou toute l'année active).

#### POST `/chapters/{id}/lessons/validate-all`

Validation par lot des leçons `draft` d'un chapitre. Sortie `{ "validated_count": n }`.

Seules les `draft` sont touchées : une leçon déjà validée n'est **pas** re-tamponnée (écraser
un `validated_by='parent'` par `parent_bulk` perdrait l'information qu'elle a été relue), une
`archived` reste écartée. Provenance `parent_bulk` sans exception (addendum ADR-0011 §F.3).

#### PATCH `/chapters/{id}` · DELETE `/chapters/{id}`

Édition (nom/description/période + action `validate`/`reject`) · suppression.

### Passe 2 — leçons + notions

#### POST `/chapters/{id}/generate-lessons`

Génère les leçons + notions d'un chapitre **validé ou manuel** (sinon 409) ; upsert des
notions en `Skill`. Requête longue.

#### POST `/chapters/{id}/extend-lessons`

Complète sans rien supprimer (existant injecté au prompt, doublons de titre écartés).

#### GET `/chapters/{id}/lessons` · POST `/chapters/{id}/lessons` · POST `/chapters/{id}/lessons/reorder`

Liste · ajout manuel (validé d'office) · réordonnancement.

#### PATCH `/lessons/{id}` · DELETE `/lessons/{id}`

Édition (titre/résumé/notions — remplace le rattachement ; `content` — édition manuelle
du cours, statut inchangé) · suppression.

#### POST `/lessons/{id}/validate` · POST `/lessons/{id}/reject`

`draft` → `validated` / `archived` (409 sinon).

#### POST `/lessons/{id}/generate-content`

Rédige le cours markdown (moteur **local**, ~40-60 s). Repasse la leçon en `draft`
(gate du cours canonique, addendum ADR-0009 : un cours réécrit non relu ne doit pas
alimenter les dérivés ni Massimo avant revalidation). 409 si archivée.

### Rattrapage « skills-only » (niveau antérieur, ADR-0010)

#### POST `/curriculum/skills-backfill/generate`

Corps `{ subject_id, level }` (`level` ∈ cycle 4, sinon **400**). Enchaîne les passes
1+2 **en mémoire** (rien de persisté) → prévisualisation des notions groupées par
chapitre d'échafaudage + `failed_scaffolds`. 503 sans clé cloud.

#### POST `/curriculum/skills-backfill/confirm`

Corps `{ subject_id, level, notions: [{ scaffold_chapter, name }] }`. Upserte les notions
en `Skill` au niveau cible (aucune leçon ni liaison). Idempotent → `{ created, existing }`.

### Lecture élève (cours de Massimo)

Préfixe `/api/student`, tout utilisateur authentifié (rôle child inclus) — le serveur ne
sert **que du validé** (ADR-0009 §9).

#### GET `/student/cours/{subject_slug}`

Chapitres validés de l'année active + leçons validées (référence légère).

#### GET `/student/lessons/{id}/cours`

Cours (markdown) d'une leçon validée — 404 indiscernable sinon (aucune fuite des brouillons).

### Notions validées (entrée ELI5 v2 par decks matières)

Routes **neutres** (pas de préfixe `/eli5/` — d'autres dérivés les consomment), lecture
seule, même chaîne de filtrage que les cours élève (chapitre `validated` → leçon
`validated` → `LessonSkill` → `Skill`). Types : `packages/types/src/curriculum.ts`.

#### GET `/student/notions/summary`

Compteur de notions validées par matière de l'année active (une requête agrégée, pas de
N+1) → `{ subjects: [{ slug, name, notion_count, new_count }] }`. Une matière sans rien de
validé apparaît à `0/0` (front : deck « bientôt »), jamais filtrée. `new_count` = notions
dont une leçon validée porteuse a été créée dans les 7 derniers jours (deck « ✨ new »,
récence de création — `Skill`/`Chapter` n'ayant pas d'horodatage, le signal vient de
`Lesson.created_at`).

#### GET `/student/subjects/{subject_slug}/notions`

Notions validées d'une matière, **dédupliquées par `skill_id`** →
`{ subject: { slug, name }, notions: [{ skill_id, name, chapter_title }] }`. `chapter_title`
= chapitre de la leçon validée la plus récente qui enseigne la notion ; tri : ordre des
chapitres (`sort_order`) puis nom. **404** si la matière est inconnue ou hors année active ;
`notions: []` (pas 404) si la matière existe mais n'a rien de validé.

## Diagnostic

Préfixe réel : `/api/diagnostics`. Implémenté à l'étape 14 (Phase 4) sur les tables
`quizzes`/`quiz_questions`/`quiz_attempts`/`quiz_answers` (un diagnostic = un `quiz`
de `quiz_type = diagnostic`). Les QCM sont générés par IA, par notion.

### GET `/diagnostics/subjects`

Matières disponibles pour lancer un diagnostic : `[{ id, name }]`.

### POST `/diagnostics/generate` (Papa)

Génère un diagnostic (QCM par notion) pour une matière. Corps : `{ subject_id, level? }`.
Réponse : `{ quiz_id, subject, questions_count }`. Trace `ai_jobs` (`diagnostic_generate`).

### GET `/diagnostics/quizzes` (Massimo)

Liste les diagnostics : `[{ quiz_id, title, subject, questions_count, taken }]`.

### GET `/diagnostics/quizzes/{id}` (Massimo)

Questions à passer — **sans** la bonne réponse :
`{ quiz_id, title, subject, questions: [{ id, prompt, choices, skill_id, skill_name }] }`.

### POST `/diagnostics/quizzes/{id}/submit` (Massimo)

Corps : `{ answers: [{ question_id, choice_index }] }`. Corrige, écrit la tentative,
met à jour la maîtrise et ouvre les lacunes. Réponse :
`{ attempt_id, quiz_id, subject, score_percent, per_skill: [{ skill_id, skill_name, score, status }], gaps: [{ skill_id, skill_name, severity }], strengths: [..] }`.

### GET `/diagnostics/results` (Papa)

Derniers diagnostics passés, score par notion + lacunes ouvertes.

> Reporté : `generate-missions` (remédiation depuis les lacunes), diagnostic
> multi-matières en une session, difficulté adaptative.

## Quiz — moteur unifié (ADR-0014, Lot 1)

Quiz de fin de cours (`quiz_type = mission`), premier client du moteur, **deuxième client du
substrat canonique** (ADR-0011). Génération **locale** depuis le cours validé d'une leçon,
**auto-vérification à l'aveugle** (question dont le modèle ne retrouve pas la clé → écartée),
**correction déterministe serveur** (7 formats). Asymétrie stricte : côté élève, ni
`correct_answer_json` ni `explanation_markdown` (sauf le feedback immédiat après réponse).

### Génération & CRUD — Papa (`require_parent`)

- **POST `/api/lessons/{lesson_id}/quizzes/generate`** — corps `{ count: 5|8, difficulty: 1|2|3 }`.
  409 si la leçon n'est pas `validated` / sans cours. Trace `ai_jobs` (`quiz_generate` :
  `questions_generated`/`questions_discarded`). Réponse `{ quiz_id, lesson_id, questions_generated,
  questions_discarded }`. 0..N quiz par leçon (régénérer ≠ créer).
- **GET `/api/lessons/{lesson_id}/quizzes`** · **GET `/api/subjects/{slug}/quizzes`** — inventaire
  (compteurs, statut, taux d'écart).
- **GET `/api/quizzes/{id}`** — vue Papa : questions **avec** clés et explications.
- **POST `/api/quizzes/{id}/regenerate`** — remplace les questions `generated`, **préserve les `manual`**.
- **PATCH `/api/quiz-questions/{id}`** — toute édition bascule la question en `source='manual'`.
- **POST `/api/quizzes/{id}/questions`** — ajoute une question manuelle. **POST
  `/api/quiz-questions/{id}/retire`** — `status='retired'` (hors tirages, réponses conservées).
- **DELETE `/api/quizzes/{id}`** — hard delete si aucune tentative, sinon archivage.

### Pilotage — page Papa « Quiz — pilotage » (`require_parent`)

- **GET `/api/quiz-pilotage/overview`** — KPI globaux + santé de l'auto-vérification par matière.
- **GET `/api/quiz-pilotage/subjects/{id}`** — leçons validées + leurs quiz (leçons sans quiz incluses).

### Flux élève — Massimo (`/api/student`, filtrage serveur, jamais la clé)

- **GET `/api/student/quiz-subjects`** — grille des matières + nombre de quiz (0 → grisée).
- **GET `/api/student/quizzes/{subject_slug}`** — quiz jouables (questions actives, **sans** clé
  ni explication) ; chaque quiz porte `lesson_id`.
- **GET `/api/student/quiz/{quiz_id}`** — un quiz jouable par id (même charge que ci-dessus, sans
  clé). Entrée du **quiz de mission** (`QuizMissionModal`) : le runner lance ensuite une tentative
  dont le `context` vaut `quiz_type = "mission"` → preuve d'étape quiz.
- **POST `/api/student/quizzes/{id}/attempts`** — démarre une tentative.
- **POST `/api/student/quiz-attempts/{id}/answers`** — corps `{ question_id, answer_json }` :
  correction serveur, renvoie `{ is_correct, explanation_markdown, criteria?, ambiguous }` (jamais
  la clé). Format `open` (Lot 2) : **jugement LLM local** critère par critère (résultat structuré
  dans `quiz_answers.ai_evaluation_json`) — bénéfice du doute si le juge n'est pas sûr (élève
  crédité, ambiguïté remontée à Papa), feedback toujours bienveillant.
- **POST `/api/student/quiz-attempts/{id}/complete`** — score global + par notion, scoring pondéré
  (`mission` = signal faible, jamais de `Gap`), **XP = base d'effort + bonus score** (0 %→10,
  100 %→30), résumé bienveillant `{ score_percent, xp_awarded, per_skill, strengths, to_review }`.

> Le format `open` (Lot 2) est **livré** : question ajoutée par Papa (opt-in manuel, critères
> obligatoires), jugée par le LLM local à la réponse. Reste reporté : génération en lot,
> contextes `revision`/`capsule_post_test` réels (scoring en stub).

## Fiches — révision (ADR-0015)

Fiche de révision d'**une leçon** (« 1 leçon = 1 page »), **dérivée du cours canonique** (ADR-0011 :
force le cours de la leçon + complément RAG, comme le quiz de fin de cours). `FicheSpec` à
**budgets** (miroir Pydantic strict : `essentiel` ≤ 600, `definitions` ≤ 4, `points_cles` ≤ 5,
`erreurs_a_eviter` ≤ 3, `mini_exemple` ≤ 400). Une fiche invalide n'est **jamais** persistée
(1 réparation puis erreur). Trace `ai_jobs` `fiche_generate`.

### Génération & CRUD — Papa (`require_parent`)

- **POST `/api/fiches/generate`** — corps `{ lesson_id }`. 404/409 si la leçon n'est pas `validated`
  / sans cours. Renvoie la fiche `pending`.
- **PUT `/api/fiches/{id}`** — corps `{ spec }` : **revalidation** du `FicheSpec` → repasse `pending`.
- **POST `/api/fiches/{id}/regenerate`** — régénère (écrase le spec) → `pending`.
- **POST `/api/fiches/{id}/validate`** — `pending → validated` (visible côté Massimo).
- **DELETE `/api/fiches/{id}`**.
- **GET `/api/fiches/lessons/{lesson_id}`** — fiches d'une leçon (tous statuts).
- **GET `/api/fiches/pilotage/{subject_id}`** — arbre matière → leçons validées → leurs fiches
  (leçons sans fiche incluses ; miroir de `quiz-pilotage`).

### Flux élève — Massimo (`/api/student`, gate `validated`, 404 sinon)

- **GET `/api/student/fiches/summary`** — grille de decks : compteur de fiches `validated` +
  `new_count` (jamais ouvertes) par matière de l'année active.
- **GET `/api/student/subjects/{slug}/fiches`** — deck d'une matière (fiches `validated`, `seen`).
- **GET `/api/student/fiches/{id}`** — la fiche (spec complet) ; **404** si non `validated`.
- **POST `/api/student/fiches/{id}/seen`** — marque la fiche vue (retrait du badge « nouveau »).

> Le viewer Massimo affiche le cours source **à côté** de la fiche (bouton « Voir le cours »,
> réutilise `GET /api/student/lessons/{id}/cours`) et exporte la fiche en **image A5** (PNG) /
> impression A5. Le pilotage Papa édite le `FicheSpec` via un **formulaire structuré**.

## Missions

Préfixe réel : `/api/missions`. Sur les tables `missions`/`mission_steps` + `gaps` +
`xp_events`. Une mission de remédiation porte `mission_type = remediation` et des étapes
`step_type` alignées ADR (`eli5` → `vocal_explain` → `quiz`), chacune ciblant un `resource_id`
(skill pour eli5/vocal_explain, quiz pour quiz).

**ADR-0017 lot 1 — preuves serveur + verdict.** La complétion déclarative de l'étape 15
(`POST /missions/{id}/complete`) est **retirée**. Une étape ne se valide que si sa **preuve**
existe côté serveur, **postérieure au `start`** et **dans l'ordre** (`sort_order`). Toute mission
générée naît `validation_status = pending` : le gate `validated` est **dans la requête** des
routes student (une mission `pending` est invisible, y compris par id → 404).

**ADR-0017 lot 2 — sources, sélecteur, pilotage.** `mission_type` est un vocabulaire fermé
orienté **source** (`remediation | revision | progression | manual`). Le sélecteur de la mission
du jour est un **scoring déterministe versionné** (`MISSION_SCORING_VERSION`, zéro LLM). Frontière
stricte (§3) : **deux schémas, deux routers** — `MissionStudentOut` (Massimo, sans scores) et
`MissionPilotOut` (Papa, sur-ensemble : `validation_status`, `generation_reason`, preuves brutes).

### Frontière student (Massimo)

- **GET `/missions`** → `[MissionStudentOut]` (validées de l'élève). `MissionStudentOut = { id,
  subject, skill_id, skill_name, title, description, mission_type, status, origin, priority,
  estimated_minutes, xp_reward, steps: [{ id, step_type, instruction, resource_id, sort_order,
  status }] }`. `estimated_minutes` (durée estimée dérivée des étapes) + `xp_reward` (XP d'effort
  constant) = **affichage enfant, aucun score**. `origin` (`papa`/`zetis`) = champ d'affichage
  « qui a généré la mission », dérivé de `created_by` (l'enum interne `created_by` reste **pilot-only**,
  frontière §3). Le client marque « ✨ new » les missions `status="planned"`. **L'ordre des étapes (`sort_order`) dépend du
  type** (§5 amendé) : `progression` = découverte d'abord (`eli5 → vocal_explain → [mindmap] →
  [quiz]`) ; `remediation`/`revision` = **rappel d'abord** (`[mindmap] → [quiz] → eli5 [→ vocal]`).
- **GET `/missions/today`** — **contrat cassant** (ex-liste) : `{ elected: MissionStudentOut | null,
  reason, reason_code, scoring_version, alternatives: [MissionStudentOut] (≤2) }`. `reason` est une
  **phrase template** figée choisie par le facteur dominant (jamais de LLM) ; `elected: null` =
  état serein « Tu n'as rien d'obligatoire maintenant ».
- **POST `/missions/{id}/start`** → `MissionStudentOut` (`planned → active`, idempotent, horodate
  `started_at`).
- **POST `/missions/{id}/steps/{step_id}/complete`** → `{ mission_status, verdict, xp_awarded }`.
  Preuve par `step_type` (**409** si absente / antérieure au start / hors ordre) ; dernière étape
  → **XP +50 inconditionnel** + verdict (`acquired` si reverse ≥ `MISSION_REVERSE_THRESHOLD` ET
  quiz ≥ `MISSION_QUIZ_THRESHOLD` → mastery↑, lacune `resolved` ; sinon `review_later` → mastery
  honnête, lacune `in_progress`, carte SRS (re)programmée). Trace `LearningEvent` `mission_verdict`.
- **GET `/missions/completed-today`** → `[{ mission_id, title, subject, verdict, xp }]` — missions
  terminées aujourd'hui + verdict (deux issues positives) + XP, relues des `LearningEvent`
  `mission_verdict` du jour. **Aucun score brut** (reverse/quiz/mindmap restent Papa — frontière §3).

> Exécution frontend (`page-missions.md`) : chaque activité s'ouvre **EN MODALE in-page**
> (`ActivityModal`) ; la preuve est produite dans la modale et l'étape validée aussitôt — pas de
> redirection ni de marqueur de retour. Le quiz de mission par id se lit via
> **GET `/api/student/quiz/{quiz_id}`** (§Quiz).

### Frontière pilotage (Papa) — `MissionPilotOut`

- **POST `/missions/generate-remediation` · `/generate-revision` · `/generate-progression`** →
  `{ created, missions }`. Générateurs idempotents par source, missions `pending`. `revision` =
  **une mission par notion due** (mono-notion, top-N par retard `MISSION_REVISION_TOP_N` ;
  `[mindmap] → [quiz] → eli5`) — jamais groupée par matière (le verdict d'acquisition est
  mono-notion, ADR-0017 §5) ; `progression` = prochaine notion non maîtrisée d'un chapitre actif
  ou rattrapage jamais travaillé (`eli5 → vocal_explain → quiz`).
- **GET `/missions/pending`** → `[MissionPilotOut]` (avec `generation_reason`).
- **POST `/missions/validate`** `{ ids: [int] }` → `{ validated }` (validation en lot).
- **POST `/missions/{id}/reject`** → `{ id, validation_status: "rejected" }`.
- **GET `/missions/election/today`** → `{ elected: MissionPilotOut | null, score, factors: [{ name,
  value, weight, contribution, dominant }], scoring_version, reason, reason_code, alternatives:
  [{ mission, score }] }` — **recalculé à la demande** (déterminisme ⇒ rien à stocker).
- **GET `/missions/pilot?type=&subject=`** → `[MissionPilotOut]` (preuves brutes par étape).
- **GET `/missions/verdicts/recent`** → `[{ mission_id, mission_type, verdict, quiz_score,
  reverse_score, xp, effect, skill_id, subject_id }]`.
- **GET `/missions/pilot/summary`** → `{ pending, pool, completed_this_week, acquired_rate_30d }`.

Facteurs de score (pondérations en config) : `severity` (remediation), `due_pressure` (revision),
`continuity` (progression : chapitre actif vs rattrapage), `variety` (malus si même matière que la
**dernière mission complétée** — proxy déterministe, aucune élection stockée), `forced_priority`
(plancher des `manual`). `Mission.available_from` n'existe pas sur le modèle réel → toutes les
validées `planned|active` sont candidates.

> Reporté (Lot 3) : porte « Commander » (recommandation/échéance/thématique), résolution par
> embeddings, Conseil de classe, croisées automatiques, auto-validation par type.

## Progression

> ⚠️ **Section documentée mais JAMAIS implémentée** (constat du read-before-code ADR-0028,
> 2026-07-31). Aucune de ces quatre routes n'existe en code. Les seules routes de progression
> réellement servies sont `GET /api/parent/progress/gaps` et `/consolidated`, décrites plus bas.
> Ce qui manque ici est repris autrement : le résumé global et la progression par matière sont
> servis par `GET /api/parent/dashboard` (agrégat, par matière), et la vue élève par le module
> `galaxy`. Ne pas coder contre cette section.

### GET `/progress/summary?student_id=` — *n'existe pas*

Résumé global.

### GET `/progress/subjects?student_id=`

Progression par matière.

### GET `/progress/skills?subject_id=`

Maîtrise par notion.

### GET `/progress/xp`

XP global et par matière.

## Gamification

Préfixe réel : `/api/gamification`. Implémenté à l'étape 16 sur la table `xp_events`.
L'XP est crédité aux moments clés (mission +50 — ADR-0017 §5bis, verbalisation ELI5 +10, diagnostic +15).

### GET `/gamification/summary`

Synthèse de progression de l'élève :
`{ total_xp, level, xp_into_level, xp_for_next, streak_days, active_today, badges: [{ code, label, icon }], recent: [{ amount, reason, created_at }] }`.
Niveau = `total_xp // 100 + 1` ; streak = jours consécutifs d'activité (tolérance d'un jour).

## Révision (spaced memory)

Préfixe réel : `/api/student/reviews`. Slice backend implémentée dans le module `memory`
(moteur SRS MVP : intervalles fixes again 1j / hard 3j / good 7j / easy 14j, pas de SM-2).
Routes élève (`get_current_user`, rôle `child`). **La mécanique SRS est invisible** : le
payload ne contient jamais `due_at`, `interval_days` ni `ease_factor`. Plafonds et
entrelacement des matières sont décidés côté serveur.

### GET `/student/reviews/summary`

**Toutes les matières** de l'élève, avec leurs cartes dues agrégées (compteurs exacts, le
« 15+ » est de la présentation) :
`{ subjects: [{ slug, name, due_count, new_count, has_cards }], total_due, flash_size, new_count }`.
`has_cards=false` → matière sans carte active : grisée « pas encore de cartes » côté Massimo,
non lançable (l'UI affiche l'emoji de la matière). `has_cards=true` avec `due_count=0` = « à
jour ✓ ». `new_count` = cartes dues jamais révisées (badge « nouveau »).

### POST `/student/reviews/session`

Corps `{ deck: "mix_day" | "mix_flash" | { subject: "<slug>" } }`. Renvoie la liste servie
`[{ card_id, subject_slug, front_markdown, back_markdown }]` — plafonnée (mélange 12 /
matière 8 / éclair 5), triée `due_at` croissant, puis entrelacée pour les mélanges.
`400` si le deck matière est inconnu ou sans carte due.

### POST `/student/reviews/cards/{card_id}/attempt`

Corps `{ rating: "again" | "hard" | "good" | "easy" }`. Renvoie
`{ next_due_at, xp_awarded, is_consolidation }`. XP crédité via `award_xp` : +5 par carte
quel que soit le rating, +2 en consolidation. **Consolidation détectée côté serveur** (pas
de flag client) : une carte déjà notée aujourd'hui ⇒ planification inchangée, XP réduit.
`404` si la carte n'existe pas ou n'appartient pas à l'élève (pas de fuite d'existence) ;
`422` si le rating est hors vocabulaire.

## Cartes SRS — pilotage Papa

Préfixe réel : `/api/memory/cards`. Routes **parent** (`require_parent`) de la page Papa
« Cartes de révision » (ADR-0013). Génération 100 % locale (Ollama) ancrée sur le cours
validé de chaque notion ; la validation d'une leçon n'a **aucun** effet de bord (surface
page-driven). Invariant §3 : rafraîchir le CONTENU d'une carte ne touche jamais sa
planification.

- `GET /overview` — KPI globaux + résumé par matière `{ subjects: [{ subject_id, name, active_cards, to_generate, suspended }], totals }`.
- `GET /subjects/{subject_id}` — arbre chapitre → leçon → notion (état + `card_count`, jamais le contenu) + notions suspendues.
- `POST /subjects/{subject_id}/generate` — réconcilie toute la matière (upsert 3 branches A/B/C + suspend les orphelines). **Non destructif** : réécrit le contenu, préserve la planification. Déclenché par « Générer les N » ou « ↻ Régénérer » (même quand `to_generate = 0`). Renvoie `{ subject_id, created, updated, reactivated, pending, suspended, failed_skills }`.
- `POST /skills/{skill_id}/generate` — génération/relance unitaire d'une notion. `{ created, updated, reactivated, pending }`.
- `GET /skills/{skill_id}/cards` — recto/verso des cartes d'une notion (aperçu) `[{ id, card_type, front_markdown, back_markdown, status }]`.
- `POST /skills/{skill_id}/reactivate` — réactive les cartes suspendues (planification intacte) `{ skill_id, reactivated }`.
- `DELETE /skills/{skill_id}` — retire **toutes** les cartes d'une notion + leur historique `{ skill_id, deleted }`.
- `PATCH /{card_id}` — **édite une carte** (recto/verso) ; planification préservée. Renvoie la carte (`CardContent`). `404` si absente. Chemin à un segment (pas de collision avec `/skills/...`).
- `DELETE /{card_id}` — **supprime une carte** unitaire + ses attempts `{ id, deleted }`. `404` si absente.

## ELI5

### POST `/ai/eli5/explain`

Entrée :

```json
{
  "student_id": "uuid",
  "subject_id": "uuid",
  "skill_id": "uuid",
  "question": "Je ne comprends pas les nombres relatifs",
  "mode": "simple"
}
```

Sortie :

```json
{
  "job_id": "uuid",
  "status": "queued"
}
```

Le backend n'accepte qu'un `skill_id` réel (pas de texte libre : la question libre est
résolue côté client contre les skills réels — cf. entrée ELI5 v2). L'explication normalisée
est lue via `GET /ai/jobs/{job_id}` (`output`). Elle inclut `sources_used` (entier) : nombre
de passages de cours (RAG) injectés — `>0` → badge « 📚 D'après ton cours ». Quand un cours
canonique validé a servi (ADR-0011), l'`output` porte aussi `lesson_id`/`lesson_title` →
badge prioritaire « 📚 D'après ta leçon *{titre}* ». L'entrée Massimo (decks matières →
notions) fournit un `skill_id` de notion validée, ce qui déclenche déterministiquement ce
badge leçon.

### POST `/ai/eli5/reverse-evaluate`

Massimo explique à ZETIS.

Entrée :

```json
{
  "student_id": "uuid",
  "skill_id": "uuid",
  "answer_text": "...",
  "input_mode": "text"
}
```

Sortie :

```json
{
  "score": 72,
  "feedback": "...",
  "missing_points": [],
  "next_action": "..."
}
```

## RAG

Préfixe réel : `/api/rag`. Seuls les chunks `validated`/`official` sont récupérés.

### POST `/rag/documents`

Ingère un document **texte** (JSON) en statut `validated` — sources de confiance / seed.
Corps : `{ title, text, subject_id?, source_type?, level?, chapter? }`.
Réponse : `{ document_id, chunks }`. Découpage + embedding faits à l'ingestion.

### POST `/rag/upload`

Ingère un **fichier** de cours (`multipart/form-data` : `file` MD/TXT/PDF + `title?`,
`subject_id?`, `level?`, `chapter?`). Le texte est extrait (pypdf pour le PDF), puis
chunké/vectorisé. La source arrive en statut **`pending`** : invisible du RAG tant
qu'elle n'est pas validée à la main (relecture humaine, cf. CLAUDE.md).
Réponse : `{ document_id, chunks }`. `400` si format non supporté / texte vide.

### POST `/rag/clip`

Capture **texte** envoyée par l'extension `zetis-clip` (page web / sélection, côté Papa).
Corps : `{ title, text, source_url?, source_type?, subject_id?, level?, chapter? }`
(`source_type` def. `web_clip`). Réutilise `ingest_document` : la source arrive en statut
**`pending`** (relecture obligatoire, cf. CLAUDE.md) — une capture web n'alimente jamais
l'IA de Massimo sans validation. `source_url` est conservé dans le contenu (provenance,
sans colonne dédiée). Réponse : `{ document_id, chunks }`. `400` si `text` vide.

### POST `/rag/clip-url`

Import de la **transcription** d'une vidéo (extension `zetis-clip` Lot 2, côté Papa).
Corps : `{ url, title?, subject_id?, level?, chapter? }`. Extraction **côté serveur**
(`youtube-transcript-api`), avec un **fetch sortant borné à une allowlist d'hôtes**
(`youtube.com`, `www.youtube.com`, `youtu.be` — cf. ADR-0006 addendum). Préfère une
transcription humaine à une auto-générée ; **conserve la langue d'origine** (pas de
traduction). Ingestion en statut **`pending`** (`source_type = video_transcript`),
provenance + langue conservées dans le contenu. Réponse : `{ document_id, chunks }`.

`400` avec un `detail` **structuré** `{ code, message }` :
- `unsupported_url` : hôte hors allowlist, schéma non http(s), IP littérale, id introuvable.
- `transcript_unavailable` : transcription désactivée/absente → le client bascule sur le
  repli DOM (scrape du panneau « Transcription ») puis `POST /rag/clip`.

### GET `/rag/documents`

Liste les documents avec leur `validation_status` et leur nombre de chunks.

### POST `/rag/documents/{id}/validate`

Valide une source : passe le document **et ses chunks** en `validated`.
Réponse : `{ document_id, validation_status }`. `404` si introuvable.

### POST `/rag/documents/{id}/reject`

Rejette une source : document + chunks en `rejected` (exclus de la récupération).

### POST `/rag/search`

Recherche contextuelle (top-k cosinus). Corps : `{ query, subject_id?, k? }`.

## Capsules IA

Préfixe réel : `/api/capsules`. Micro-vidéos pédagogiques typées (`CapsuleSpec`)
générées par IA, voix Piper par scène, rendu MP4 asynchrone (worker-media / Remotion).
Cycle de vie : `pending` → (voix) → `validated` → `rendering` → MP4 disponible.

### POST `/capsules/generate` (Papa)

Génère un `CapsuleSpec` et persiste la capsule (statut `pending`).
Corps : `{ subject_id, instruction, level?, skill_id?, chapter_id?, visual, duration, difficulty }`.
Réponse `201` : `CapsuleOut`.

### GET `/capsules` (Papa)

Liste les capsules : `[CapsuleListItem]`.

### GET `/capsules/{id}` (Papa)

Détail : `CapsuleOut` (inclut `spec_json`, aperçu via `@remotion/player`).

### PUT `/capsules/{id}/spec` (Papa)

Remplace le spec (revalidé par le schéma) ; la capsule repasse en `pending`.
Corps : `{ spec }`.

### POST `/capsules/{id}/regenerate` (Papa)

Régénère le spec. Corps : `{ instruction?, visual, duration, difficulty? }`.

### POST `/capsules/{id}/classify` (Papa)

(Re)rattache la capsule à un chapitre pour le regroupement. Corps : `{ chapter_id }`.

### POST `/capsules/{id}/voice` (Papa)

Synthétise la voix (Piper) scène par scène et cale les durées sur la narration.

### POST `/capsules/{id}/validate` (Papa)

Valide la capsule. Si la voix est prête, enfile aussi le rendu MP4 (auto).

### POST `/capsules/{id}/reject` (Papa)

Rejette la capsule (`validation_status = rejected`).

### POST `/capsules/{id}/render` (Papa)

Enfile le rendu MP4 (asynchrone, worker-media). Capsule → `rendering`.
Réponse `202 Accepted` : `CapsuleOut`.

### DELETE `/capsules/{id}` (Papa)

Supprime la capsule. Réponse `204`.

### GET `/capsules/{id}/audio/{scene_index}?token=` (Papa)

Sert le WAV d'une scène. Papa-only via JWT en query param (`<audio>` ne peut pas
envoyer d'en-tête `Authorization` en cross-origin). `401` si token invalide/absent.

### GET `/capsules/library` (Massimo)

Capsules validées **et rendues** (MP4 disponible), prêtes à regarder.
Réponse : `[CapsulePublicItem]`, chaque item porte un flag `seen`.

### GET `/capsules/stats` (Massimo)

Compteurs enfant : `{ total, seen_count, new_count }`.

### POST `/capsules/{id}/view` (Massimo)

Marque une capsule comme vue (idempotent), au démarrage de la lecture. Réponse `204`.

### GET `/capsules/{id}/video?token=` (Massimo)

Sert le MP4 rendu. JWT en query param (`<video>`, rôles enfant ou Papa).
`404` si la capsule n'est pas `validated` ou sans vidéo.

## Mindmaps

### GET `/mindmaps`

Liste.

### POST `/mindmaps/generate`

Génère mindmap de référence.

### GET `/mindmaps/pilotage/{subject_id}`

Papa (`require_parent`) : arbre matière → leçons validées → leurs cartes (tous statuts). Chaque
carte porte `attempt_count` et `avg_score` (agrégat `mindmap_attempts`, une requête). **Cet agrégat
n'existe que sur cette surface** : le suivi est parent-side, rien n'en remonte chez Massimo.

### POST `/mindmaps/{id}/attempts`

Massimo reproduit une mindmap.

### POST `/mindmaps/{id}/evaluate`

Évaluation.

### POST `/mindmaps/{id}/evaluate-preview`

Papa (`require_parent`) — **aperçu de fidélité** (addendum ADR-0016 §C). Même barème que
`/evaluate` (fonction pure partagée), avec deux différences :

- **aucun gate `validated`** : Papa prévisualise du `pending`, que les routes élève cachent (404) ;
- **aucun effet de bord** : ni `mindmap_attempts`, ni `xp_events`, ni `learning_events`. Papa peut
  jouer *Reconstruis* autant qu'il veut sans écrire une ligne dans le journal de Massimo.

`failed_attempts` du payload est ignoré (il ne sert qu'au calcul d'XP, absent ici).

## Conseil de classe IA (ADR-0020)

Synthèse périodique par matière, **Papa-only** (`require_parent`). Narration LLM **100 % locale**
posée sur le service d'évidence (le LLM narre et hiérarchise une évidence *calculée* ; il
n'invente aucun `skill_id` — chaque id est revalidé serveur, anti-hallucination). Rapport **figé**
(`council_reports` + snapshot d'évidence = auditabilité, un artefact LLM n'étant pas rejouable).
Aucune surface Massimo.

- **POST `/api/reports/class-council`** `{ period? }` → `CouncilReportOut`
  `{ id, period, global_summary, subjects: [{ subject_id, subject_name, strengths, to_reinforce,
  recent_evolution, recommendations: [{ skill_ids, skill_names, mission_type:"manual",
  template_hint, justification }] }], prompt_version, created_at }`. Génère + persiste. Évidence
  vide → rapport serein (0 matière), sans appel LLM. Erreur provider → `502`.
- **GET `/api/reports/class-council?period=`** → `[CouncilReportListItem]`
  `{ id, period, subjects_count, created_at }` (récents d'abord).
- **GET `/api/reports/class-council/{id}`** → `CouncilReportOut`.
- **POST `/api/reports/class-council/equip-notion`** `{ skill_id }` → `EquipNotionResult`
  `{ skill_id, skill_name, has_lesson, generated: [str], skipped: [str], errors: [{piece, message}],
  reason }` (ADR-0021). Génère + **auto-valide** le kit d'UNE notion (cours→fiche→SRS→quiz→mindmap),
  100 % local. **Ne régénère jamais une pièce déjà créée** (même un brouillon `pending` de Papa) : on
  génère seulement le manquant et on valide l'existant `pending`. Dégradation gracieuse : notion sans
  leçon canonique validée → `has_lesson=false`, contenus `skipped`. Appelé **avant** create-missions
  (les étapes de la mission résolvent alors les ressources fraîches).
- **POST `/api/reports/class-council/create-missions`** `{ skill_ids, due_date?, force_priority? }`
  → `[MissionPilotOut]`. Pont d'actionnabilité : une recommandation → missions **mono-notion** via
  le flux Commander (ADR-0018 ; `manual`, `validated` par construction — la validation Papa = ce
  clic). Croisées multi-matières hors v1.

## Motivation (Massimo)

Leviers d'auto-motivation de l'enfant. Réservées à l'espace de Massimo (`require_child`) — Papa
reçoit `403`, y compris en lecture : si Papa pouvait poser l'objectif, ce ne serait plus un
engagement mais une consigne. Contrats : `packages/types/src/motivation.ts`.

### GET `/api/student/motivation/week`

Régularité douce + engagement de la semaine courante.

```json
{
  "week_start": "2026-07-27",
  "days": [{ "date": "2026-07-27", "active": true, "is_today": false }],
  "days_done": 2,
  "today_done": true,
  "goal_days": 3,
  "goal_met": false
}
```

Les **7 jours sont toujours servis**, jours à venir compris : le client n'a ni grille à
reconstruire ni date à calculer. Un jour est « actif » s'il porte au moins un `learning_event`
(jamais `xp_events`) en **Europe/Paris** — un jour de lecture sans XP reste un jour où Massimo est
venu, et la connexion suffit à cocher la case.

`days_done` est un COMPTE hebdomadaire, pas une série : il ne peut pas casser, et le lundi la
grille repart de zéro case cochée — un départ, pas une chute. Il n'existe volontairement aucun
champ `missed`, `failed`, `remaining`, `best` ni `streak` : le contrat ne porte pas la matière
première d'une punition, donc aucun client ne peut en afficher une. `goal_days: null` = aucun
engagement pris cette semaine (état qui déclenche l'invitation du lundi), à distinguer d'un
objectif à 0, qui n'existe pas.

### PUT `/api/student/motivation/week`

Corps `{ "target_days": 1..7 }`, `extra="forbid"`. Réponse identique au GET.

`PUT` car c'est un **upsert idempotent** sur (élève, semaine courante) : rejouer la requête rend
le même état, jamais une seconde ligne. **La semaine est déduite serveur** et ne peut pas être
choisie par le client (un `week_start` dans le corps → `422`) : ni modification rétroactive, ni
reproche sur une semaine passée. Réviser son objectif à la baisse est autorisé, sans confirmation
ni trace servie — et peut faire basculer `goal_met` à `true`.

Aucun cron : le changement de semaine se fait seul (le lundi, aucune ligne n'existe encore). Les
semaines passées ne sont servies par **aucune** route élève — un historique d'objectifs manqués
serait le streak déguisé.

### GET `/api/student/motivation/welcome`

Ce que ZETIS dit à Massimo en arrivant, **composé serveur**.

```json
{
  "code": "back_after_break",
  "title": "Content de te revoir, Massimo !",
  "subtitle": "On reprend là où tu t'étais arrêté : le théorème de Pythagore.",
  "cta": { "label": "Reprendre", "target": "missions" },
  "context": {
    "first_name": "Massimo", "last_notion": "le théorème de Pythagore",
    "days_since_last_visit": 6, "consolidated_this_week": 0,
    "gaps_closed_this_week": 0, "reviews_due": 4, "regularity": {}
  }
}
```

**Déterministe, sans LLM ni aléa** : deux appels sur le même état rendent la même phrase. Le
client affiche `title`/`subtitle` **tels quels** ; `code` sert à choisir une illustration, jamais
à réinterpréter le texte. `cta: null` = aucun bouton.

Dix codes, premier applicable : `first_visit`, `back_after_break` (≥ 4 j), `back_short_break`
(2–3 j), `no_goal_yet`, `goal_reached_today`, `goal_reached`, `progress_visible`, `resume_notion`,
`reviews_due`, `all_clear`. L'ordre porte une intention : ce qui est humain (te revoir) passe
avant tout compteur, et l'invitation à s'engager avant la félicitation — sinon on rate la fenêtre
du lundi.

`context` sert à l'illustration et à d'autres blocs, **jamais** à recomposer une phrase.
`days_since_last_visit` y figure et n'apparaît dans **aucun texte** : le nombre de jours d'absence
ne doit jamais être lu par l'enfant. Il se mesure sur les événements **strictement antérieurs à
aujourd'hui** — la connexion étant journalisée avant l'appel, l'absence vaudrait sinon toujours 0.

### GET `/api/student/motivation/wrap-up`

Le mot de la fin d'une séance : ce qui a été gagné, et le prochain pas. Même forme que `welcome`,
sans `context`. Codes : `week_goal_reached`, `mission_in_progress`, `reviews_left`, `day_done`,
`all_clear`.

Endpoint distinct plutôt qu'un `?moment=` sur `welcome` : les entrées diffèrent (l'accueil regarde
l'absence, la clôture le reste-à-faire). **La clôture ne dit JAMAIS combien de jours il reste pour
tenir l'engagement** — l'enfant repart avec une intention, pas avec un décompte.

> `GET /api/gamification/summary` porte le même bloc sous la clé `regularity`. `streak_days`,
> `active_today` et le badge `streak_3` (« Régulier 3 jours » 🔥) ont été **retirés** avec le
> streak : il tombait à zéro dès un jour entier manqué et se calculait en UTC alors que tout le
> reste bucketise en Europe/Paris.

## Activité (journal `learning_events`)

Source unique de l'activité. `xp_events` reste le grand livre de l'XP : le champ `xp` des
réponses ci-dessous en est sommé séparément, **jamais par UNION** des deux tables. Bucketing par
jour et par semaine en **Europe/Paris**. Contrats TypeScript : `packages/types/src/activity.ts`.

### POST `/api/telemetry/pageview` (Massimo)

Seule écriture cliente autorisée dans le journal. Entrée `{ route }` (1–200 caractères,
`extra="forbid"` → un `created_at` envoyé par le client est rejeté en `422`).

**Le serveur horodate.** Une route identique à la précédente du même élève est ignorée
silencieusement. Réponse `204` dans tous les cas de succès. Déclaratif observationnel :
n'influence ni XP, ni score, ni verdict.

### ~~GET `/api/parent/activity/heatmap?weeks=26&subject_id=`~~ — **supprimée (ADR-0028)**

Audit du 2026-07-31 : ses deux seuls appelants étaient la carte de régularité du dashboard et le
dashboard lui-même. Le Cahier de bord, qu'on croyait consommateur, utilise `/activity/sessions`. La
heatmap est désormais servie **par matière** dans l'agrégat `GET /api/parent/dashboard`, et
« toutes matières » est une somme client.

### GET `/api/parent/activity/days/{date}?subject_id=` (Papa)

**Conservée** — c'est l'unique exception au « zéro état de chargement » du dashboard (ADR-0028 §4) :
une descente vers un détail non borné, qu'on ne peut pas précharger pour 26 semaines × 8 matières.
Consommateur : `DayDetailPanel`, monté sous la heatmap de la carte « Quand Massimo travaille ».

`404` si la date n'est pas au format `AAAA-MM-JJ`. Journal trié, `review_attempted` consécutifs
**agrégés côté serveur** en une ligne, `minutes` fourni par événement (le client ne recalcule
rien).

```json
{
  "date": "2026-07-15",
  "events": [
    { "time": "10:00", "event_type": "login", "label": "Connexion",
      "subject_slug": null, "skill_name": null, "xp": 0, "minutes": 2, "detail": null },
    { "time": "10:02", "event_type": "review_attempted", "label": "Révision SRS · 8 cartes",
      "subject_slug": "mathematiques", "xp": 40, "minutes": 9, "count": 8 }
  ]
}
```

### GET `/api/parent/activity/sessions?from=&to=&subject_id=` (Papa)

**Conservée — consommateur nommé : le Cahier de bord** (`CahierBordPage`, vue Sessions du mois).
Ce n'est pas le dashboard qui l'appelle, contrairement à ce que l'audit ADR-0028 supposait au
départ.

Sessions **reconstruites** (coupure à `SESSION_GAP_MINUTES` = 15), jamais stockées. Période
bornée serveur (défaut : 7 derniers jours ; amplitude maximale `ACTIVITY_MAX_RANGE_DAYS`). Jours
rendus du plus **récent** au plus ancien, y compris ceux sans session (`sessions: []`) :
l'absence d'activité est une information. `started_at`/`ended_at` sont des instants **UTC** (pour
calculer) ; `started_time`/`ended_time` sont les mêmes bornes déjà formatées en **Europe/Paris**
(pour afficher) — reformater l'UTC côté client suivrait le fuseau du navigateur et pourrait
contredire le `time` des événements de la même carte.

```json
{
  "days": [
    { "date": "2026-07-15",
      "sessions": [
        { "started_at": "2026-07-15T08:00:00+00:00", "ended_at": "2026-07-15T08:40:00+00:00",
          "started_time": "10:00", "ended_time": "10:40",
          "active_minutes": 22, "events": [] }
      ] }
  ]
}
```

### GET `/api/parent/dashboard` (Papa) — agrégat unique, **module `dashboard`**

> **Réécriture cassante (ADR-0028, 2026-07-31).** La route servait auparavant six KPI hebdomadaires
> (`week_start`, `sessions`, `xp`, `missions_completed`, `open_gaps`, `consolidated_skills`).
> Acceptable parce qu'elle n'avait qu'un seul consommateur, la page qu'on refaisait. `sessions`,
> `xp` et `missions_completed` **ne sont plus des KPI de pilotage** — un KPI parent doit être
> décisionnel, et l'XP est le levier de Massimo, qui reste sur Progression (§5).

**L'unique requête du premier rendu.** Aucun query param de filtrage, volontairement : période,
matière et focus sont des projections client sur un payload déjà en mémoire. En ajouter un
ramènerait un aller-retour par clic de pastille — exactement ce que l'ADR supprime.

Contrat complet : `docs/frontend-papa/page-dashboard.md §Contrat API`. Forme :

```jsonc
{
  "school_year": { "level": "4e", "label": "2025-2026", "program_version": null },
  "generated_at": "...", "last_activity_at": "...", "days_inactive": 0,
  "inbox": [{ "kind": "validation|gap|demande|referentiel|source", "count": 6,
              "label": "…", "detail": "…", "href": "/couverture" }],
  "periods": { "7": { "kpis": { "active_minutes": {"value":200,"delta":35},
                                "active_days":    {"value":5,"of":7,"delta":1},
                                "consolidated":   {"value":12,"of":46,"delta":3},
                                "open_gaps":      {"value":3,"delta":0,"without_mission":1} },
                      "sparks": { /* 4 × 12 points */ } },
               "30": {…}, "90": {…} },
  "subjects": [{ "slug": "maths", "color": "#60a5fa",
                 "minutes": {"7":65,"30":255,"90":690},
                 "calendar": [{"date":"2026-07-28","active_minutes":42}],  // 26 sem., vides omis
                 "slots": {"7": [[/*7 j*/], /* × 8 créneaux, 8h→24h */]},
                 "slots_outside_minutes": {"7":0},                          // activité 0h–8h
                 "notions": {"consolidated":4,"fragile":3,"in_progress":2,"total":13},
                 "series": {"7": {"covered":[],"consolidated":[],"fragile":[]}},
                 "review_load": [/* 14 entiers, J+0 → J+13 */],
                 "gaps_open": 2, "has_referentiel": true }],
  "content_chain": [{ "stage": "cours_valides", "label": "Cours validés", "value": 30, "target": 38 }],
  "reading": [{ "trend": "up|flat|watch", "text": "…",
                "evidence": { "count": 5, "kind": "notion", "href": "…" } }],
  "proposed_mission": null
}
```

Règles de contrat :

- **Séries livrées par matière, jamais pré-agrégées.** Pas de ligne « toutes matières » côté
  serveur : c'est une somme que le client calcule, et c'est la condition technique du §1.
- Les **trois fenêtres** (7 / 30 / 90) sont dans la même réponse. `calendar` porte 26 semaines
  **quelle que soit la période** : la grille sert la tendance longue, seul le filtre matière
  l'affecte.
- `slots` : matrice `8 × 7`, **8 h → 24 h**, Europe/Paris. L'activité de 0 h à 8 h ressort dans
  `slots_outside_minutes` plutôt que d'être repliée dans un créneau qui la daterait faussement.
- `notions` suit le mapping des six statuts réels de `SkillMastery` (ADR-0028 §3 bis) :
  consolidées = `mastered` · fragiles = `weak` + `learning` · en cours = `solid` + `in_progress` ·
  non abordées = pas de ligne.
- `has_referentiel: false` = matière **sans chapitre**. À ne pas confondre avec `notions.total: 0` :
  les deux états existent et diffèrent. La matière **reste dans le tableau** dans les deux cas — le
  trou est une information.
- `reading[].evidence` est **obligatoire** : un constat sans preuve adressable n'est pas émis.
- `proposed_mission` est composé **en lecture** par le moteur de missions
  (`preview_remediation`) : **ce GET n'écrit rien**. La création reste un POST explicite sur
  `/api/missions/generate-remediation`, route déjà en place. Prévisualisation et création voient
  **exactement les mêmes lacunes** (`status == "open"`, notions déjà couvertes exclues) — sinon la
  carte proposerait une notion que le bouton ne créerait pas. `null` = aucune lacune découverte.
- **Jamais d'UNION avec `xp_events`**, et les événements d'agenda (`NON_ACTIVITY_EVENTS`) sont
  exclus de toutes les projections d'activité.

Les routes `/gaps` et `/progress/summary` citées par la spec produit **n'ont jamais existé en
code**.

## Progression (module `progress`, Papa)

Détail des deux KPI de stock. Analyses parentales : jamais servies à Massimo.

### GET `/api/parent/progress/gaps`

Lacunes ouvertes (`status ∈ open | in_progress`), les plus sévères d'abord. L'UI les formule en
« notions à renforcer » — jamais de vocabulaire d'échec (CLAUDE.md §pédagogie).

⚠️ Cette définition est **plus large que celle du générateur de remédiation**, qui ne reprend que
les lacunes `open`. Ce n'est pas une incohérence : une lacune `in_progress` a déjà été travaillée et
revient par la **révision**, pas par une seconde consolidation (`adr-0017 §5bis`, amendé le
2026-07-31). La page Lacunes s'appuie sur `status` pour proposer le bon générateur.

`has_active_mission` dit si une mission `planned|active` — **de n'importe quel type** — couvre déjà
la notion. C'est ce qui sépare ce qui attend une décision de ce qui est en route ; le dashboard
(`open_gaps.without_mission`) et la page Lacunes s'appuient sur la **même** fonction, après avoir
divergé (le KPI ne regardait que les missions de remédiation et sur-comptait).

```json
[{ "skill_id": 12, "skill_name": "Temps du récit", "subject_slug": "francais",
   "subject_name": "Français", "severity": "high", "status": "in_progress",
   "first_detected_at": "2026-07-01T08:00:00+00:00", "has_active_mission": true }]
```

### GET `/api/parent/progress/consolidated`

Notions consolidées, la maîtrise la plus haute d'abord. **Consolidée = `mastered`** (score ≥ 90,
paliers partagés diagnostic/quiz) ; `solid` (≥ 70) n'est volontairement pas compté — « consolidé »
doit vouloir dire acquis, pas « presque ».

```json
[{ "skill_id": 7, "skill_name": "Nombres relatifs", "subject_slug": "mathematiques",
   "subject_name": "Mathématiques", "mastery_score": 95, "last_seen_at": null }]
```

## Production — Couverture (Papa, ADR-0023)

`require_parent`, **lecture seule** : ces routes ne génèrent rien et ne valident rien. Les
actions de la page passent par les endpoints existants de chaque module.

### GET `/production/coverage?subject_id=`

Matrice matière → chapitre → leçon. `subject_id` absent → toutes les matières de l'année active.
**Une requête agrégée par matière** (aucun N+1).

```json
{ "school_year": { "id": 1, "label": "2026-2027", "level": "4e" },
  "totals": { "lessons": 74, "lessons_validated": 15, "courses_written": 26,
              "derivatives_percent": 13, "pending_count": 1, "stale_count": 0, "orphan_count": 0 },
  "subjects": [{ "id": 1, "name": "Français", "slug": "francais", "chapters": [
    { "id": 9, "title": "Lecture et compréhension", "lessons": [
      { "id": 2, "title": "…", "row_state": "ready",
        "cells": { "cours": { "state": "validated", "derived_at": "…", "validated_by": "parent",
                              "object_id": 2 },
                   "quiz": {}, "fiche": {}, "mindmap": {} },
        "notions": { "cards": { "covered": 3, "total": 3 },
                     "capsules": { "covered": 0, "total": 3 },
                     "items": [{ "skill_id": 41, "name": "Narrateur",
                                 "has_card": true, "has_capsule": false }] } }]}]}]}
```

- `CellState` = `absent` | `pending` | `validated` | `stale` | `blocked`. **`absent` se déduit
  de l'existence de la ligne, jamais d'une date** (un dérivé sans horodatage existe quand même).
  Le **quiz n'a pas de `pending`** : servi sans gate (ADR-0014 §2).
- `RowState` = `blocked_lesson` | `blocked_no_course` | `ready` | `complete` — deux causes de
  blocage distinctes, parce que l'action à mener diffère.
- `validated_by` = `parent` | `parent_bulk` | `system` | `null` (addendum ADR-0011 §F).
- `object_id` = cible d'un « Régénérer » / d'un lien de pilotage (la leçon pour `cours`).
- `derivatives_percent` porte sur **quiz · fiche · mindmap uniquement** — le cours en est la
  condition, pas un dérivé.
- `notions.items` : détail par notion, pour agir sans générer à l'aveugle. **Aucun état de
  fraîcheur sur les colonnes notion-centrées** (§E.5).

### GET `/production/orphans`

Dérivés (`fiche` | `mindmap` | `quiz`) dont la leçon est `archived`.

```json
[{ "type": "quiz", "id": 3, "title": "…", "subject": "Français",
   "archived_at": "…", "has_history": true }]
```

`has_history` vrai (au moins une tentative) → l'UI désactive la suppression. **Lecture seule** :
cette route ne supprime ni ne réattache rien.

## ZETIS Galaxy (Massimo, ADR-0024)

Surface **ÉLÈVE** — `get_current_user`, jamais `require_parent`. Lecture seule, **aucune table
nouvelle, aucune migration** : le graphe se dérive de `skills` / `lesson_skills` / `lessons` /
`chapters` + `skill_mastery`, via `evidence.mastery_by_skill()`.

Gate de visibilité partout : `Chapter.validation_status == "validated"` **et**
`Lesson.status == "validated"`. Une notion non validée n'apparaît pas — pas même « à découvrir ».

> ⚠️ Ces routes ne consomment **ni** le module `progress` **ni** `production` (Papa-only) : aucune
> donnée de pilotage (`validated_by`, fraîcheur, orphelins, sévérité) ne descend jusqu'à Massimo.

### GET `/student/galaxy`

Vue d'ensemble. `lit` = notions dont le statut n'est ni `unknown` ni absent — un **COMPTE**,
jamais un pourcentage (aucun score par matière, ADR-0024 §5).

```json
{ "subjects": [{ "subject_id": 3, "name": "SVT", "slug": "svt", "lit": 11, "total": 16 }] }
```

### GET `/student/galaxy/all`

**Toutes** les matières dans un seul graphe (Accueil) : `root` → matières → chapitres → notions.

Le nœud `root` n'est pas décoratif : sans lui chaque matière forme une composante **isolée** que
le moteur de forces éloigne, et la galaxie se disloque. Chaque nœud porte son `subject_slug`, ce
qui permet à un clic d'ouvrir la bonne constellation sans second aller-retour.

### GET `/student/galaxy/{subject_slug}`

Une constellation : `subject` → chapitres → notions.

```json
{ "subject": { "subject_id": 3, "name": "SVT", "slug": "svt" },
  "nodes": [{ "id": "chapter-12", "kind": "chapter", "label": "La cellule" },
            { "id": "skill-88", "kind": "skill", "label": "Mitose", "skill_id": 88,
              "chapter_id": 12, "status": "learning", "intensity": 58 }],
  "edges": [{ "source": "chapter-12", "target": "skill-88", "type": "structure" }] }
```

- `kind` = `root` | `subject` | `chapter` | `skill`. Arêtes de type **`structure` uniquement** :
  `Skill.prerequisite_skill_ids` **n'existe pas** et `parent_skill_id` est NULL partout — aucun
  prérequis n'est inventé.
- `status` : les 5 états rendus. ⚠️ **`SkillMastery.status` en a SIX** — `in_progress` (verdict
  de mission `review_later`) ne sort d'aucun `_status_from_score()` et est normalisé en
  `learning` **côté serveur**.
- `intensity` (0–100, brut) module une luminosité ; il n'est **jamais affiché**.
- 404 si la matière est inconnue ou hors année active ; `nodes: []` si rien n'est validé.

### GET `/student/galaxy/notion/{skill_id}`

Panneau d'actions — **toute la panoplie ZETIS**, chaque activité portant sa disponibilité.

```json
{ "skill_id": 88, "name": "Mitose", "status": "learning", "chapter_title": "La cellule",
  "subject_slug": "svt", "subject_name": "SVT",
  "actions": [{ "kind": "cours", "available": true, "lesson_id": 41 },
              { "kind": "eli5", "available": true },
              { "kind": "fiche", "available": false },
              { "kind": "capsule", "available": false },
              { "kind": "mindmap", "available": true, "mindmap_id": 9 },
              { "kind": "revision", "available": false },
              { "kind": "quiz", "available": true, "quiz_id": 77 }] }
```

Ordre pédagogique stable : comprendre → mémoriser → se tester. `eli5` est **toujours** disponible
(elle ne dépend d'aucun contenu préexistant). 404 pour une notion hors des matières de l'élève —
un id inconnu ne révèle rien.

> Révision de l'ADR-0024 §4 (2026-07-28) : la règle initiale était « une action sans contenu
> n'est pas proposée ». On renvoie désormais **tout**, avec `available` — une activité manquante
> n'est pas un échec de Massimo, c'est du contenu que Papa n'a pas encore produit.

### GET `/student/galaxy/timeline`

Frise de progression, **MONOTONE par construction**.

```json
{ "points": [{ "date": "2026-07-01", "lit": 2 }, { "date": "2026-07-08", "lit": 5 }], "total": 5 }
```

⚠️ Construite sur la **première fois** où chaque notion a été travaillée, en lisant
`learning_events` (**append-only**) — et **non** sur `SkillMastery`, qui peut **régresser**
(`mastery_score` est une moyenne glissante ; `set_mastery_status` gère explicitement la sortie de
« maîtrisé »). Une frise fondée sur l'état courant montrerait la galaxie **s'assombrir** : c'est
le cadrage de perte que ZETIS bannit. Ne jamais « corriger » cette courbe avec l'état courant.

Aucune table, aucun ordonnanceur : l'historique existe déjà, il suffit de le lire.

## Jobs IA

### GET `/ai/jobs/{job_id}`

Statut job.

Sortie :

```json
{
  "id": "uuid",
  "job_type": "eli5",
  "status": "succeeded",
  "output": {}
}
```

## Codes erreur

- `400` : entrée invalide.
- `401` : non authentifié.
- `403` : rôle insuffisant.
- `404` : ressource introuvable.
- `409` : conflit métier.
- `422` : validation Pydantic.
- `500` : erreur serveur.

## Permissions

| Route | child | parent | admin |
|---|---:|---:|---:|
| `/missions/today` | oui | oui | oui |
| `/progress/summary` | lecture limitée | oui | oui |
| `/school-years` POST | non | oui | oui |
| `/capsules/{id}/validate` POST | non | oui | oui |
| `/capsules/library` GET | oui | oui | oui |
| `/capsules/{id}/view` POST | oui | oui | oui |
| `/diagnostics/generate` POST | non | oui | oui |
| `/diagnostics/quizzes/{id}/submit` POST | oui | oui | oui |
| `/diagnostics/results` GET | non | oui | oui |
| `/missions/generate-remediation` POST | non | oui | oui |
| `/missions/today` GET | oui | oui | oui |
| `/missions/{id}/complete` POST | oui | oui | oui |
| `/gamification/summary` GET | oui | oui | oui |
| `/rag/documents` POST | non | oui | oui |
| `/rag/upload` POST | non | oui | oui |
| `/rag/clip` POST | non | oui | oui |
| `/rag/clip-url` POST | non | oui | oui |
| `/rag/documents/{id}/validate` POST | non | oui | oui |
| `/rag/documents/{id}/reject` POST | non | oui | oui |
| `/ai/eli5/explain` | oui | oui | oui |

## Documentation OpenAPI

FastAPI doit exposer :

- `/docs` en dev ;
- `/redoc` en dev ;
- désactivation possible en production.
## Agenda scolaire (ADR-0025)

Deux préfixes, deux schémas, **jamais mélangés**. Toute règle de visibilité est appliquée
**serveur** : le client ne filtre rien.

### Lecture et saisie élève — `/api/student/agenda`

Tout utilisateur authentifié (rôle `child` inclus). Schéma `AgendaItemStudentOut`.

#### GET `/week?anchor=YYYY-MM-DD`

Bande **glissante** : 3 jours avant l'ancre (défaut : aujourd'hui), l'ancre, 10 jours après
(`AGENDA_BAND_DAYS_BEFORE` / `_AFTER`). Jamais alignée sur la semaine calendaire.

**Asymétrie volontaire** : tout l'horizon va vers l'avant, le regard en arrière reste borné à
3 jours. Le client ne présume jamais le nombre de colonnes — il rend ce qu'il reçoit.

```txt
days[]: { date, offset, traces, fixed_items[], plan_steps[] }
```

- `traces` : 0–3, **uniquement si `date <= today`** ; `null` sinon (jamais `0` sur un jour à
  venir). Nombre de **natures d'activité distinctes** du jour (types d'événement, navigation
  exclue), plafonné à `AGENDA_TRACES_CAP` — pas une durée, pas un score. Une rafale de révision
  vaut 1. `traces = 0` et « pas de donnée » sont **le même état**.
- `fixed_items[]` : **uniquement si `date >= today`**, `[]` sinon.
- `plan_steps[]` : toujours `[]` en Lot 1 (champ au contrat, rempli au Lot 2).

#### GET `/upcoming`

`kind ∈ (controle, rendu)`, non fait, non archivé, horizon 21 jours, **max 4**, trié par date.
→ `{ id, label, subject, due_on, days_left, has_plan }`.

#### GET `/items?from=&to=`

Liste plate.

#### POST `/items`

`created_by` **forcé à `student` côté serveur** (jamais lu du corps).

**Verrou de phase (ADR-0025 §10)** : **403** tant que `AGENDA_STUDENT_ENTRY_ENABLED` (défaut
`false`) est fermé. Le verrou est serveur — une UI cachée n'est pas une règle. `done`, `undone`
et `dismiss` ne sont **jamais** concernés : Massimo coche et masque dès la phase 0.

#### PATCH `/items/{id}`

`label` / `subject_id` / `due_on` / `kind`, **uniquement sur ses propres items** — **403** sinon.

#### POST `/items/{id}/done` · POST `/items/{id}/undone`

Bascule `done_at`. Autorisé sur **tous** les items, y compris ceux de Papa.

#### POST `/items/{id}/dismiss`

Masque un item, y compris de Papa. Le masquage reste visible côté pilotage.

### Pilotage Papa — `/api/agenda`

`require_parent`. Schéma `AgendaItemPilotOut`.

#### GET `/items?from=&to=`

Archivés inclus, marqués.

#### POST `/items`

`created_by` forcé à `parent`. **Corps en lot obligatoire** : `{ "items": [ … ] }` → **201** avec
la liste créée. Papa relève l'ENT du dimanche soir en une requête.

#### POST `/items/single`

Confort : un item unique, sans enveloppe `items`. Même règles, même forçage de `created_by`.

#### PATCH `/items/{id}`

Sur un item `created_by='student'`, le service renseigne **automatiquement**
`edited_by_parent_at`. Toute tentative d'écrire `done_at` → **403** — refus d'autorité, pas de
validation (déc. ADR-0025 §2b : seul Massimo coche). Le champ est **déclaré au schéma exprès**
pour que le refus soit explicite : silencieusement ignoré, il laisserait croire que ça a marché.

#### PUT `/items/{id}/note`

`parent_note`. Jamais servie à Massimo.

#### DELETE `/items/{id}`

**Archivage** (`dismissed_at`), la ligne reste en base. Répond **200 avec l'item archivé** (et
non 204) : la réponse dit ce qui s'est réellement passé.

#### GET · PUT `/settings`

`{ student_entry_enabled: bool }` — verrou de phase de l'ADR-0025 §10, persisté dans
`app_settings` (la variable d'environnement reste la valeur par défaut tant qu'aucune ligne
n'existe).

Le `PUT` est un **geste explicite de Papa**. Aucune bascule automatique n'existe côté serveur :
la déclencher sur un seuil de coches observé ferait dépendre un droit d'une surveillance.

### Événements non probants

L'agenda émet exactement deux `learning_events` — `agenda_item_created` (avec la source) et
`agenda_item_done` — regroupés dans `NON_ACTIVITY_EVENTS` et **exclus de toutes les projections
d'activité** (heatmap, minutes actives, sessions, Cahier de bord, jours de venue). `evidence`
n'a besoin d'aucune garde : sa seule lecture du journal est filtrée sur `mission_verdict`.
`agenda_item_missed` n'existe pas. Aucun XP n'est crédité.