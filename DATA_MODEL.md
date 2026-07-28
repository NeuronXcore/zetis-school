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
validated_at optional      # horodatage de la validation (addendum ADR-0011 §F)
validated_by optional      # parent | parent_bulk | system — QUI a laissé passer ; NULL = non validé, ou antérieur à la traçabilité (aucune rétro-attribution)
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
content_created_at optional   # provenance du COURS : posé au premier write de content_markdown
content_created_by optional   # ai | parent
content_updated_at optional   # RÉFÉRENCE DE FRAÎCHEUR (addendum ADR-0011 §E.3) — écrasée aux SEULS
                              # writes de content_markdown (generate-content, PATCH portant `content`).
                              # Un renommage / un sort_order / un rattachement de notion n'y touchent
                              # JAMAIS : `updated_at` est trop bruyant pour servir de référence.
content_updated_by optional   # ai | parent — qui a ÉCRIT le cours
validated_at optional         # horodatage de la validation (addendum ADR-0011 §F)
validated_by optional         # parent | parent_bulk | system — qui l'a laissé ATTEINDRE Massimo.
                              # Distinct de content_updated_by (qui l'a écrit). L'équipement
                              # ADR-0021 §2 auto-valide le cours → `parent_bulk` = « Massimo lit un
                              # cours que Papa n'a jamais ouvert ».
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
lesson_id optional     # quiz de fin de cours rattaché à sa leçon (0..N par leçon, ADR-0014)
title
description
quiz_type          # diagnostic | mission | revision | capsule_post_test
status             # draft | ready | archived (suppression = archivage si tentatives, ADR-0014)
created_by
validated_at optional  # horodatage, posé à la génération (addendum ADR-0011 §F)
validated_by optional  # TOUJOURS `system` : le quiz est servi SANS gate de validation par doctrine
                       # (ADR-0014 §2). Valeur strictement réservée à ce cas — un test-verrou
                       # interdit à tout autre chemin de l'écrire.
```

### QuizQuestion

```txt
id
quiz_id
skill_id optional
question_type      # mcq | mcq_multi | true_false | cloze | numeric | ordering | matching
                   #   (short_answer/open légaux mais non émis : short_answer remplacé par la
                   #    paire numeric/open ; open = jugement LLM, Lot 2 — ADR-0014)
prompt_markdown
choices_json           # PRÉSENTATION servie à l'élève (options, items, colonnes) — jamais la clé
correct_answer_json
explanation_markdown
difficulty
sort_order
source             # generated | manual (édition Papa → manual, préservée par la régénération)
status             # active | retired (retrait = hors tirages ; les quiz_answers passées restent)
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
mastered_at        # instant de bascule vers `mastered` (nullable)
```

**`mastered_at` — invariant et règle d'écriture.** `mastered_at IS NOT NULL` ⟺ `status ==
"mastered"`. Écrit UNIQUEMENT par `progress/mastery.set_mastery_status`, seul point de passage des
quatre modules qui écrivent le statut (diagnostic, quiz, ELI5 reverse, mission) :

- entrée dans `mastered` → tamponner ;
- `mastered` → `mastered` → **ne rien toucher**. Le quiz de fin de cours réévalue la maîtrise à
  chaque passage : re-tamponner ferait recompter éternellement les mêmes notions dans
  « consolidées cette semaine » ;
- sortie de `mastered` → effacer (une date qui survit à la régression ment sur l'état courant).

`NULL` sur une ligne `mastered` = consolidée avant la migration `f1a2b3c4d5e6`, date inconnue.
Ces lignes comptent dans le **stock** de notions consolidées, jamais dans une **semaine**.

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
resolved_at        # instant de fermeture (nullable)
notes
```

**« Lacune ouverte » = `status ∈ (open, in_progress)`** — définition unique, portée par
`progress/service.OPEN_GAP_STATUSES` et importée par `missions`, `missions/pilot` et `evidence`
(elle a existé en quatre exemplaires divergents).

**`resolved_at`** est le symétrique de `first_detected_at` : une ligne `gaps` porte exactement un
cycle ouverture → résolution, une re-détection après fermeture créant une NOUVELLE ligne. Écrit à
la seule transition vers `resolved`. **Rien n'est posé sur la transition vers `in_progress`**, qui
peut se rejouer sur une lacune déjà `in_progress` — toute date y serait re-tamponnée à chaque
verdict `review_later`. `last_confirmed_at`, jamais implémenté ni lu, a été retiré de ce modèle
pour la même raison.

`status = "ignored"` n'est aujourd'hui écrit nulle part : aucune route ne permet à Papa de fermer
une lacune à la main.

### StudentWeeklyGoal

```txt
id
student_id
week_start         # lundi Europe/Paris
target_days        # 1..7
unique(student_id, week_start)
```

Engagement que l'ENFANT se donne (« cette semaine, je viens 3 jours »). Table et non colonne sur
`student_profiles` : une colonne unique ne distinguerait pas « pas encore choisi cette semaine »
de « a choisi 3 », or c'est l'absence de ligne qui déclenche l'invitation du lundi.

**Aucune colonne d'atteinte** (`achieved`, `status`, `completed_days`) : le nombre de jours venus
se dérive du journal `learning_events` à la lecture. La stocker ferait exister en base un état
« objectif non atteint » — rien de punitif ne doit être persistable. `week_start` est toujours
déduit serveur, ce qui interdit la modification rétroactive comme le reproche sur une semaine
passée.

### Mission

```txt
id
student_id
subject_id optional  # nullable (ADR-0017) : missions croisées multi-matières futures
skill_id optional
title
description
mission_type       # remediation | revision | progression | manual | champion (ADR-0017 orienté
                   #   SOURCE ; `champion` = croisée multi-matières, ADR-0022 ; l'activité vit dans
                   #   MissionStep.step_type). Anciennes valeurs activité (learn/practice…) abandonnées.
subject_id optional # NULL pour une champion croisée (la matière vit dans les étapes) — ADR-0022
status             # planned | active | completed | failed | cancelled
                   #   (`failed` réservé Papa : jamais écrit par un flux enfant — ADR-0017 §4)
validation_status  # pending | validated | rejected (ADR-0017 §5ter ; gate `validated` DANS la
                   #   requête des routes student ; missions générées naissent `pending`)
started_at         # horodatage du start ; socle des PREUVES d'étapes (postérieures au start)
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
skill_id optional  # notion portée par l'étape (ADR-0022) : renseignée pour une champion croisée
                   #   (verdict PAR NOTION) ; NULL pour une mission mono-notion (→ mission.skill_id)
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
event_type         # lesson_viewed, quiz_attempted, reverse_eli5, etc.
payload_json
created_at
index              # (student_id, created_at) — toutes les lectures d'activité
```

**Deux journaux, jamais d'UNION.** `xp_events` est le **grand livre de l'économie XP** (solde,
niveau, streak) ; `learning_events` est le **journal d'activité** (ce que Massimo a fait). Les
minutes actives et les sessions se calculent sur `learning_events` ; le XP affiché est une
métrique **séparée**, sommée depuis `xp_events`. Les mélanger double-compterait : un quiz
terminé écrit une ligne dans chaque table sans être deux activités.

**Les sessions ne sont pas stockées.** Elles sont reconstruites à la lecture
(`modules/activity/service.py`) : une session = événements consécutifs espacés de moins de
`SESSION_GAP_MINUTES` (15). Changer la constante recalcule tout l'historique, sans migration.
Le temps actif est une heuristique de **présence** : somme des écarts plafonnés à
`ACTIVE_GAP_CAP_MINUTES` (5) — pas une mesure d'attention. Bucketing par jour et par semaine en
**Europe/Paris**, `created_at` restant stocké en UTC.

**Vocabulaire des `event_type`.** Posés par le chantier « Activité » : `login`, `page_viewed`,
`lesson_viewed`, `fiche_viewed`, `quiz_attempted`, `eli5_requested`, `review_attempted`.
Préexistants et **réutilisés tels quels** plutôt que dupliqués : `reverse_eli5` (verbalisation
ELI5), `mission_verdict` (émis là où la mission passe à `completed`, et lu par
`evidence.recent_verdicts`), `mission_step_view`. Émettre en plus un `eli5_reverse` ou un
`mission_completed` créerait deux événements pour un seul acte.

Le journal est **auto-suffisant** : un hook qui accompagne un crédit d'XP recopie le montant
dans `payload_json.xp`, ce qui évite tout rapprochement par horodatage entre les deux tables.

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
status             # scheduled/new (actives) | pending (dégradé) | suspended (orpheline) | archived
```

> Alimentée depuis la **page Papa « Cartes SRS »** (ADR-0013, génération par matière —
> PAS un effet de bord de la validation) : le contenu (recto/verso) dérive du cours canonique
> validé (résolveur ADR-0011), 100 % local.
> **Upsert clé `(student_id, skill_id, card_type)` préservant la planification** —
> réécrire le contenu ne touche jamais `interval_days`/`ease_factor`/`due_at`. Une notion
> que plus aucun cours validé ne couvre → carte `suspended` (hors session, planification
> conservée, réactivable) ; **le flux de génération/réconciliation ne supprime jamais**. Cas
> dégradé (sans cours validé) → `pending`, filtrée serveur. Filtrage :
> `INACTIVE_CARD_STATUSES = {pending, suspended, archived}` (module `memory`).
> **Actions manuelles Papa** (page « Cartes de révision ») : éditer le recto/verso d'une carte
> (`PATCH /api/memory/cards/{card_id}`, planification préservée — même invariant) ; supprimer
> une carte (`DELETE /api/memory/cards/{card_id}`) ou toutes les cartes d'une notion
> (`DELETE /api/memory/cards/skills/{skill_id}`) — seules suppressions, explicites et confirmées.

### SpacedReviewAttempt

```txt
id
card_id
student_id
rating             # again | hard | good | easy
response_text optional
reviewed_at
next_due_at
is_consolidation   # re-tour de consolidation (2e passage même jour) — détecté serveur, sans effet SRS
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
job_type           # eli5, quiz_generation, capsule_script, rag_answer, curriculum_chapters, curriculum_lessons, lesson_content, srs_cards_generate, fiche_generate...
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
validated_at optional      # horodatage de la validation (addendum ADR-0011 §F)
validated_by optional      # parent | parent_bulk | system — QUI a laissé passer ; NULL = non validé, ou antérieur à la traçabilité (aucune rétro-attribution)
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

### Fiche

Fiche de révision d’UNE leçon (ADR-0015), dérivée du cours canonique validé (leçon-centré : une fiche = 1 leçon = 1 page). Le cours forcé = la leçon fichée ; le RAG ne sert que de complément (patron du quiz de fin de cours). `spec_json` porte le `FicheSpec` typé, validé par Pydantic (`extra="forbid"` + budgets de sections) avant persistance — jamais de spec invalide en base.

```txt
id
lesson_id                # FK lessons (index) — une fiche = 1 leçon
spec_json                # FicheSpec typé (JSON) : essentiel, definitions≤4, points_cles≤5, erreurs_a_eviter≤3, mini_exemple?
validation_status        # pending | validated | rejected (gate `validated` avant tout accès Massimo)
validated_at optional      # horodatage de la validation (addendum ADR-0011 §F)
validated_by optional      # parent | parent_bulk | system — QUI a laissé passer ; NULL = non validé, ou antérieur à la traçabilité (aucune rétro-attribution)
created_at / updated_at    # DEFAULT now() NOT NULL depuis `e6f7a8b9c0d1` — étaient nullable sans
                           # défaut serveur (divergence avec le TimestampMixin) : une fiche naissait
                           # à NULL et la Couverture la lisait « absente ».
source                   # generated | manual
program_version optional # version de programme (traçabilité, ex: 2020)
created_at
updated_at
```

### FicheView

Fiche vue par Massimo (retrait futur du badge « Nouveau »). La ligne existe dès la première consultation : « vu » = une ligne existe.

```txt
id
student_id               # FK profil élève
fiche_id                 # FK fiches
seen_at                  # première consultation
```

Contrainte unique `(student_id, fiche_id)`.

### Mindmap (ADR-0016)

Carte mentale d'UNE leçon, dérivée du cours canonique validé — **leçon-centré**, sœur des fiches.
`mindmap_json` porte un **arbre strict** (`{center, nodes:[{id,label,parent}], edges?,
required_nodes?, optional_nodes?}`) **sans positions** : le layout (radial/horizontal/…) est de la
présentation, calculé côté client (Slice B). Colonnes reprises de `fiches`/`capsules`.

> Réaligné depuis un vestige notion-centré (`subject_id/skill_id/student_id/title/mode/status`)
> qu'aucun code n'utilisait — migration `e4f5a6b7c8d9` (reshape + `mindmap_attempts`).

```txt
id
lesson_id          # FK lessons, index — une mindmap = 1 leçon
mindmap_json       # arbre strict, sans positions
validation_status  # pending | validated | rejected
validated_at optional      # horodatage de la validation (addendum ADR-0011 §F)
validated_by optional      # parent | parent_bulk | system — QUI a laissé passer ; NULL = non validé, ou antérieur à la traçabilité (aucune rétro-attribution)
source             # generated | manual
program_version    # ex: 2020
created_at
updated_at
```

### MindmapAttempt (ADR-0016)

Tentative de reconstruction (mode `student_reconstruction`). Le `score` (0–100) et le détail
juste/faux par nœud (`details_json`) sont calculés **côté serveur, de façon déterministe**
(comparaison des nœuds placés à l'arbre de référence — aucune position n'entre dans le score).

```txt
id
student_id         # FK student_profiles, index
mindmap_id         # FK mindmaps, index
score              # 0–100, sur les nœuds requis
details_json       # [{node_id, label, expected_parent, placed_parent, placed, correct, optional}]
created_at
updated_at
```

**Cycle de vie face à l'historique** (addendum ADR-0016 §E) — quatre règles, pour qu'aucune
implémentation ne « corrige » l'XP :

1. Éditer une carte `validated` la repasse en `pending` → elle sort de la liste de Massimo jusqu'à
   re-validation. La modale l'annonce **avant** l'enregistrement.
2. **Supprimer une carte supprime ses tentatives** : un score de reconstruction n'a aucun sens sans
   l'arbre de référence qui l'a produit. (Fait par `delete_mindmap`, qui purge `mindmap_attempts`
   avant la carte — pas d'`ON DELETE CASCADE` sur la FK, la suppression explicite suffit.)
3. **L'XP déjà crédité n'est JAMAIS rembobiné.** `xp_events` / `learning_events` restent intacts à
   la suppression comme à la régénération : le décrémenter ferait régresser le niveau de Massimo
   sur une action de Papa.
4. **Régénérer ne recalcule aucun score passé.** Le nouvel arbre rend les anciennes tentatives non
   comparables ; elles sont conservées telles quelles.

L'agrégat `attempt_count` / `avg_score` de ces tentatives n'est exposé que sur la route de
pilotage Papa — il alimente la métrique de liste et le signal avant destruction des confirmations.

### CouncilReport (ADR-0020)

Rapport « Conseil de classe IA » **figé**, Papa-only. Narration LLM locale posée sur le service
d'évidence. On stocke l'artefact ET l'évidence qui l'a produit (`evidence_snapshot_json`) : une
génération LLM n'est pas rejouable, l'auditabilité vient donc du figeage (contraste assumé avec
l'élection de mission, qui ne stocke rien). `subjects_json` = la Spec validée **et ancrée**
(recommandations dont les `skill_id` ont été revalidés contre l'évidence). `period` = simple
libellé en v1 (pas de modèle de période).

```txt
id
student_id             # FK student_profiles, index
period                 # libellé (ex. "Trimestre 1")
global_summary         # narration globale
subjects_json          # [{subject_id, subject_name, strengths, to_reinforce, recent_evolution,
                       #   recommendations: [{skill_ids, mission_type, template_hint, justification}]}]
prompt_version         # version du prompt (COUNCIL_PROMPT_VERSION)
evidence_snapshot_json # évidence figée au moment de la génération (auditabilité)
created_by             # "ai"
created_at
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
- **Substrat partagé (ADR-0011)** : cette résolution est implémentée UNE fois dans
  `app/modules/ai/canonical_context.py` (`resolve_canonical_context` + `build_canonical_sections`),
  consommée par tous les dérivés (ELI5 v2 = premier client) ; le gate `status='validated'`
  vit dans la clause `where` du résolveur — aucun dérivé ne le réimplémente. La trace
  `ai_jobs.output_json` porte `lesson_id`/`lesson_title` quand un cours canonique a servi.

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
