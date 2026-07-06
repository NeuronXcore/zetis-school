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
  subject, skill_id, skill_name, title, description, mission_type, status, priority,
  estimated_minutes, xp_reward, steps: [{ id, step_type, instruction, resource_id, sort_order,
  status }] }`. `estimated_minutes` (durée estimée dérivée des étapes) + `xp_reward` (XP d'effort
  constant) = **affichage enfant, aucun score**. **L'ordre des étapes (`sort_order`) dépend du
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

### GET `/progress/summary?student_id=`

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

### POST `/mindmaps/{id}/attempts`

Massimo reproduit une mindmap.

### POST `/mindmaps/{id}/evaluate`

Évaluation.

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
- **POST `/api/reports/class-council/create-missions`** `{ skill_ids, due_date?, force_priority? }`
  → `[MissionPilotOut]`. Pont d'actionnabilité : une recommandation → missions **mono-notion** via
  le flux Commander (ADR-0018 ; `manual`, `validated` par construction — la validation Papa = ce
  clic). Croisées multi-matières hors v1.

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
| `/rag/documents/{id}/validate` POST | non | oui | oui |
| `/rag/documents/{id}/reject` POST | non | oui | oui |
| `/ai/eli5/explain` | oui | oui | oui |

## Documentation OpenAPI

FastAPI doit exposer :

- `/docs` en dev ;
- `/redoc` en dev ;
- désactivation possible en production.
