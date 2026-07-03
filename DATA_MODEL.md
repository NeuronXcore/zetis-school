# DATA_MODEL.md — Modèle de données ZETIS

## Objectif

Le modèle de données doit représenter l’apprentissage réel : années scolaires, matières, chapitres, notions, cours, exercices, quiz, résultats, lacunes, missions, révisions et contenus IA.

PostgreSQL est la source de vérité. Les embeddings pgvector complètent le modèle mais ne remplacent pas les tables relationnelles.

## Principes

- Une notion est plus fine qu’un chapitre.
- Une lacune est liée à une notion.
- Une mission répond à un objectif pédagogique.
- Un quiz mesure une ou plusieurs notions.
- Une tentative de quiz crée des observations.
- La progression est calculée à partir d’événements.
- Les contenus IA doivent être traçables et validables.

## Entités principales

### User

```txt
id
email
name
role: child | parent | admin
avatar_url
created_at
updated_at
```

### StudentProfile

```txt
id
user_id
first_name
school_level_current
birth_year optional
preferences_json
created_at
updated_at
```

### SchoolYear

```txt
id
student_id
label              # ex: 2026-2027
level              # ex: 4e
starts_on
ends_on
status             # draft | active | archived
mode               # DÉPRÉCIÉ (ADR-0009 §4) — jamais lu ; suppression à la première migration touchant school_years
created_at
updated_at
```

### Subject

```txt
id
name               # Français, Mathématiques...
slug
color
icon
sort_order
is_active
```

### SchoolYearSubject

```txt
id
school_year_id
subject_id
teacher_name optional
weekly_target_minutes
status
settings_json
```

### Chapter

```txt
id
school_year_subject_id   # nullable depuis le module subjects (un chapitre peut vivre sous un thème)
theme_id optional
name
description
period             # trimestre/période
sort_order
status             # planned | active | completed | skipped (progression temporelle)
source             # generated | manual (ADR-0009 §3 — co-construction Papa/IA)
validation_status  # pending | validated | rejected (distinct de status, les deux coexistent)
program_version    # version déclarative du programme (ex: 2020), null pour les manuels
metadata_json      # JSONB nullable (13-bis) : {themes, suggested_class, repartition, prompt_version} — description reste du texte humain
```

### LearningObjective

```txt
id
chapter_id
label
description
expected_mastery_level
source_reference
```

### Skill / Notion

> Peut être alimentée par la génération « skills-only » pour un niveau antérieur
> (rattrapage, ADR-0010) : notions upsertées sans chapitre associé, `level` = niveau
> cible, après prévisualisation + confirmation Papa.

```txt
id
subject_id
name
description
level              # 5e, 4e...
parent_skill_id optional
prerequisite_skill_ids optional
```

### Lesson

> Migrée avec la passe 2 du référentiel (ADR-0009, Lot 2 Slice A, 2026-07-03 —
> migration `c9dae1f2a3b4`). Sémantique co-construction (§3) : `created_by` ≈ source,
> `status` ≈ validation (rejet d'une leçon `draft` → `archived`, pas de valeur
> `rejected`). `content_markdown` reste vide en passe 2 ; il est rempli par la
> **rédaction de cours à la demande** (2026-07-03, `POST /api/lessons/{id}/generate-content`,
> `job_type="lesson_content"`, moteur LOCAL `get_provider` — pas la dérogation cloud
> `curriculum_*`). Régénération = écrasement ; leçon `archived` non rédigeable (409).
> **Gate addendum §A** : toute (re)génération de `content_markdown` repasse la leçon en
> `status='draft'` — re-validation Papa requise avant que les dérivés (ELI5, capsule,
> quiz, mindmap, fiches, SRS) ne consomment le nouveau contenu. Le cours validé reste la
> source canonique des dérivés (addendum ADR-0009 §A).

```txt
id
chapter_id
title
summary
content_markdown   # nullable — rempli par la rédaction de cours locale (lesson_content) ; (re)génération → status='draft'
status             # draft | validated | archived
created_by         # parent | ai | imported
source_document_id optional   # FK rag_documents (imports futurs)
sort_order
program_version    # version déclarative du programme (ex: 2020), null pour les manuelles
created_at
updated_at
```

### LessonSkill (liaison)

Liaison minimale leçon ↔ notion (`Skill`), PK composite `(lesson_id, skill_id)` =
unicité de la paire. Les notions générées par la passe 2 upsertent des `Skill`
(dédup par `subject_id` + `level` + nom normalisé casse/espaces) — le référentiel
persistant reste `skills`, aucune table `curriculum_*` (ADR-0009 §2).
La génération skills-only (ADR-0010) upserte des `Skill` **sans** créer de liaison
(aucune leçon dans ce flux).
Index `ix_lesson_skills_skill` sur `skill_id` : la PK composite est ordonnée
`(lesson_id, skill_id)` et ne couvre pas les requêtes par notion (résolution du cours
canonique côté dérivés = `WHERE skill_id = …`).

```txt
lesson_id          # FK lessons, ON DELETE CASCADE
skill_id           # FK skills — pas de ON DELETE : suppression d'une Skill bloquée si référencée (elle porte l'historique de maîtrise)
```

### Exercise

```txt
id
lesson_id optional
subject_id
skill_id optional
title
statement_markdown
solution_markdown
difficulty         # 1-5
status
```

### Quiz

```txt
id
subject_id
chapter_id optional
title
description
quiz_type          # diagnostic | mission | revision | capsule_post_test
status
created_by
```

### QuizQuestion

```txt
id
quiz_id
skill_id optional
question_type      # mcq | short_answer | open | ordering | matching
prompt_markdown
choices_json
correct_answer_json
explanation_markdown
difficulty
sort_order
```

### QuizAttempt

```txt
id
quiz_id
student_id
started_at
completed_at
score_raw
score_percent
duration_seconds
context            # dashboard | mission | diagnostic | revision
```

### QuizAnswer

```txt
id
attempt_id
question_id
answer_json
is_correct
score
feedback_markdown
ai_evaluation_json
```

### SkillMastery

```txt
id
student_id
skill_id
mastery_score      # 0-100
confidence_score   # 0-100
last_seen_at
next_review_at
status             # unknown | weak | learning | solid | mastered
```

### Gap / Lacune

```txt
id
student_id
skill_id
subject_id
source             # diagnostic | quiz | parent | ai_observation
severity           # low | medium | high
status             # open | in_progress | resolved | ignored
first_detected_at
last_confirmed_at
resolved_at optional
notes
```

### Mission

```txt
id
student_id
subject_id
skill_id optional
title
description
mission_type       # learn | practice | revise | explain | capsule | mindmap
status             # planned | active | completed | failed | cancelled
priority
created_by         # ai | parent | system
available_from
completed_at
```

### MissionStep

```txt
id
mission_id
step_type          # lesson | eli5 | quiz | mindmap | capsule | vocal_explain
resource_id optional
instruction
sort_order
status
```

### XPEvent

```txt
id
student_id
subject_id optional
amount
reason             # quiz_completed, mission_completed, explanation_success...
source_type
source_id
created_at
```

### LearningEvent

```txt
id
student_id
subject_id optional
skill_id optional
event_type         # lesson_viewed, quiz_attempted, eli5_reverse, etc.
payload_json
created_at
```

### SpacedReviewCard

```txt
id
student_id
skill_id
front_markdown
back_markdown
card_type          # definition | method | example | error_correction
interval_days
ease_factor
due_at
last_reviewed_at
status
```

### SpacedReviewAttempt

```txt
id
card_id
student_id
rating             # again | hard | good | easy
response_text optional
reviewed_at
next_due_at
```

### DocumentSource

```txt
id
title
source_type        # official | parent_upload | ai_generated | school_document
subject_id optional
level optional
file_url optional
status             # imported | processed | validated | rejected
metadata_json
created_at
```

### RAGChunk

```txt
id
document_source_id
subject_id optional
level optional
chapter_id optional
chunk_index
content
embedding vector
metadata_json
created_at
```

### AIJob

```txt
id
job_type           # eli5, quiz_generation, capsule_script, rag_answer, curriculum_chapters, curriculum_lessons, lesson_content...
status             # queued | running | succeeded | failed
input_json
output_json
error_message
created_by
created_at
started_at
finished_at
```

### AIContent

```txt
id
content_type       # lesson, quiz, feedback, capsule_script, mindmap
status             # draft | validated | rejected | published
created_by_job_id
validated_by optional
content_json
created_at
updated_at
```

### Capsule

```txt
id
subject_id
skill_id optional
chapter_id optional      # rattachement pédagogique matière → chapitre (regroupement listes Papa/Massimo)
difficulty optional      # facile | moyen | difficile (choisi par Papa, pilote la génération IA)
title
summary
script_markdown
storyboard_json
audio_url optional
video_url optional        # chemin API du MP4 rendu
thumbnail_url optional
status             # cycle de rendu MP4 : draft | rendering | published | failed
instruction optional     # texte du prompt Papa (génération LLM → CapsuleSpec)
spec_json                # CapsuleSpec typé (JSON)
validation_status        # pending | validated | rejected
created_at
updated_at
```

### CapsuleView

Visionnage complet d’une capsule par Massimo. La ligne existe dès le premier visionnage : « vu » = une ligne existe, « capsules distinctes vues » = nombre de lignes.

```txt
id
student_id               # FK profil élève
capsule_id               # FK capsules
viewed_at                # dernier visionnage complet
count                    # nombre total de visionnages complets (défaut 1)
```

Contrainte unique `(student_id, capsule_id)`.

### Mindmap

```txt
id
student_id optional
subject_id
skill_id optional
title
mindmap_json
mode               # reference | training | student_reconstruction
status
created_at
updated_at
```

## Relations clés

```txt
StudentProfile 1─N SchoolYear
SchoolYear 1─N SchoolYearSubject
Subject 1─N Skill
SchoolYearSubject 1─N Chapter
Chapter 1─N Lesson
Chapter 1─N LearningObjective
Lesson N─N Skill (via LessonSkill)
Quiz 1─N QuizQuestion
Quiz 1─N QuizAttempt
QuizAttempt 1─N QuizAnswer
Skill 1─N SkillMastery
Skill 1─N Gap
Mission 1─N MissionStep
DocumentSource 1─N RAGChunk
Skill 1─N SpacedReviewCard
```

## Règles métier

### Maîtrise d’une notion

La maîtrise ne doit pas être basée sur un seul quiz. Elle combine :

- score moyen ;
- récence ;
- répétitions réussies ;
- capacité à expliquer ;
- erreurs récurrentes ;
- confiance du modèle.

### Lacune

Une lacune est ouverte si :

- diagnostic faible ;
- plusieurs erreurs sur la même notion ;
- incapacité à reformuler ;
- Papa la marque manuellement.

Elle est résolue si :

- plusieurs réussites espacées ;
- explication reverse correcte ;
- score stable ;
- validation parent optionnelle.

### Cours canonique (addendum ADR-0009 §A)

- Un dérivé (ELI5, capsule, quiz, mindmap, fiches, SRS) consomme en priorité le
  `content_markdown` d'une leçon **`validated`** rattachée à la notion (via `LessonSkill`),
  avant les chunks RAG bruts, avant la connaissance du modèle.
- Résolution : leçon `validated` + `content_markdown` non nul, rattachée à `skill_id`,
  la plus récente (`updated_at desc`) ; `is_primary` en réserve si le tri par récence
  se révèle insuffisant (non implémenté).
- La porte `status='validated'` fait l'invalidation : une leçon en (re)génération de
  contenu repasse en `draft` et cesse d'alimenter les dérivés jusqu'à re-validation.

### XP

L’XP récompense l’effort et la progression, pas seulement la performance.

Exemples :

- mission terminée : +50 XP ;
- quiz réussi : +30 XP ;
- correction d’erreur : +20 XP ;
- explication reverse claire : +40 XP ;
- révision à temps : +15 XP.

### Validation contenu IA

Les contenus IA ont un statut. Les contenus critiques ou durables doivent pouvoir être validés par Papa avant publication.

## Index recommandés

- `skill_mastery(student_id, skill_id)` unique.
- `gap(student_id, status, severity)`.
- `mission(student_id, status, priority)`.
- `quiz_attempt(student_id, completed_at)`.
- `learning_event(student_id, created_at)`.
- `lesson_skills(skill_id)` — `ix_lesson_skills_skill` : résolution du cours canonique (dérivés par notion) ; la PK composite `(lesson_id, skill_id)` ne couvre pas ce filtre.
- index vectoriel sur `rag_chunk.embedding`.

## Migrations

Toute création ou modification de table doit passer par Alembic.

## Données seed

Créer un seed minimal :

- utilisateur Papa ;
- utilisateur Massimo ;
- année scolaire 4e ;
- matières ;
- quelques chapitres exemples ;
- quelques notions ;
- une mission exemple ;
- un quiz exemple.
