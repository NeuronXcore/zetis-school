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
agenda_last_seen_at optional   # high-water mark du témoin de nouveauté agenda (ADR-0030)
created_at
updated_at
```

> `preferences_json` figurait ici jusqu'au 2026-08-01 : cette colonne **n'a jamais existé**, ni en
> modèle ni en migration. Retirée plutôt que créée — rien ne la lit.

**`agenda_last_seen_at`** (addendum ADR-0025 §12.3, migration `c1d2e3f4a5b6`) — l'instant du
dernier regard de Massimo sur son agenda. Écrit à l'ouverture de `/agenda` **et** au rendu du
bandeau d'Accueil, par `agenda/service.py::mark_agenda_seen` et lui seul, avec `func.now()`
(horloge SQL des deux côtés de la comparaison avec `agenda_items.created_at`).

Deux propriétés qui sont des décisions, pas des détails :

- **Un horodatage par ÉLÈVE, jamais un `seen_at` par item.** Joint à `done_at`, un marqueur par
  item fabriquerait la donnée persistée « vu le 12, jamais fait » — la surveillance par la porte
  de service que l'ADR-0025 §2 condamne, et un objet pire que le compteur qu'on évitait.
- **Ne sort d'aucune route.** Absent d'`AgendaItemPilotOut` comme de toute réponse `/api/agenda`
  et `/api/student/agenda` (test de non-fuite dédié, symétrique de `parent_note`). Le témoin sort
  en **nombre**, jamais en date.

`NULL` = personne n'a encore regardé depuis que le témoin existe → tout compte comme nouveau.
Aucun backfill à la migration : poser `now()` aurait marqué comme vus des items jamais ouverts.

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

> 🔴 **Règle de lecture — la matière d'un chapitre se résout par les DEUX chemins, jamais un seul.**
>
> `school_year_subject_id` est **nullable** : un chapitre peut vivre sous `Subject → Theme →
> Chapter`, sans aucun chemin direct vers une année scolaire. Un `INNER JOIN` sur
> `SchoolYearSubject` fait alors disparaître le chapitre **et tout ce qui pend dessous**, sans
> erreur et sans trace.
>
> ```sql
> COALESCE(school_year_subjects.subject_id, themes.subject_id)   -- deux OUTER JOIN, jamais un INNER
> ```
>
> ⚠️ **Ce trou a été trouvé trois fois** : `adr-0037` y a consacré un document entier, l'addendum
> `adr-0034` l'a retrouvé dans `lessons_by_skill`, et `adr-0039` dans la file de relecture. La porte
> qui fabriquait le cas (`POST /subjects/themes/{id}/chapters` créant un chapitre sans matière
> d'année) est fermée depuis l'addendum `adr-0034`, mais **les chapitres déjà créés ainsi n'ont pas
> été rétro-attribués** — la règle de lecture reste donc nécessaire.
>
> Implémentation de référence : `review_queue/service.py::_with_chapter_context` et
> `_chapter_in_year`.

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

⚠️ **La liaison est n-n : une notion PEUT être portée par plusieurs leçons**, et c'est un état
légitime (un référentiel qui évolue, une notion transversale). « **Quelle est LA leçon de cette
notion ?** » a donc une réponse, et **une seule** — `app/modules/lesson_resolution.py`
(ADR-0037) : la plus récemment **touchée** (`updated_at`, puis `id`), dans l'**année active**, un
chapitre `validated`, non archivée. Le **statut de la leçon n'est pas filtré là** : chaque appelant
applique le sien (la galaxie ne sert que du `validated`, la production accepte un brouillon parce
que le palier 3 lui donne le droit de rédiger son cours).

> Trois modules répondaient différemment jusqu'au 2026-08-03. Le symptôme visible était un refus de
> production sur une notion que Massimo consultait ; **le vrai risque était silencieux** — produire
> sur la leçon que la galaxie n'oriente pas rend le contenu atteignable par personne.

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
chapter_id optional    # ⚠️ DÉNORMALISÉ — voir la règle de lecture sous ce bloc
lesson_id optional     # quiz de fin de cours rattaché à sa leçon (0..N par leçon, ADR-0014)
title
description
quiz_type          # diagnostic | mission | revision | capsule_post_test
status             # draft | ready | archived (suppression = archivage si tentatives, ADR-0014)
                   # ⚠️ CYCLE DE VIE, pas relecture — voir `validation_status` juste dessous
created_by
validation_status  # pending | validated | rejected — défaut `pending` (ADR-0043)
                   # SEUL le `quiz_type = diagnostic` est gaté : il ne dérive d'aucun substrat
                   # validé, l'exemption « évaluation éphémère » (ADR-0014 §2) ne s'y applique
                   # pas. Les quiz de mission et de fin de cours naissent `validated`.
                   # ⚠️ La ligne de partage est `quiz_type`, JAMAIS la table.
                   # ⚠️ Deux statuts, pas un doublon : un diagnostic `ready` + `pending` est
                   # complet mais non servi.
validated_at optional  # horodatage, posé à la génération (addendum ADR-0011 §F)
validated_by optional  # `system` pour un quiz NON gaté — servi sans relecture par doctrine,
                       # valeur strictement réservée à ce cas (deux tests-verrous, l'un lexical
                       # l'autre comportemental). Un diagnostic relu porte `parent`.
                       # ⚠️ `NULL` sur une ligne `validated` = quiz antérieur à l'ADR-0043,
                       # backfillé parce qu'il était déjà servi. Personne ne l'a laissé passer ;
                       # il est passé faute de gate. Aucune rétro-attribution (doctrine §F.4).
```

#### 🔴 Règle de lecture — le chapitre d'un quiz se lit sur sa LEÇON, pas sur `Quiz.chapter_id`

`Quiz.chapter_id` existe et est renseigné (mesuré le 2026-08-14 : **37 lignes sur 39** pour les
quiz de mission), et il était **cohérent à 100 %** avec `lessons.chapter_id`. C'est une copie, pas
la source : une leçon qui change de chapitre laisserait le quiz sur l'ancien.

Le listing élève (`adr-0057`) prend donc le chapitre **par la leçon** — celle-là même qui décide
déjà de la servabilité du quiz (leçon validée de l'année active). *Prendre la servabilité à un
endroit et le rangement à un autre, c'est ouvrir la porte à un écart que rien ne signalerait.*

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
started_at         # RÉEL depuis l'ADR-0048 — il valait completed_at, au même instant
completed_at
score_percent
duration_seconds   # ÉCRIT depuis l'ADR-0048 — il ne l'était jamais depuis sa création
context            # dashboard | mission | diagnostic | revision
reliability_json   # ADR-0048 — les conditions de la mesure. NULL ≠ « rien à signaler »
```

> ⚠️ **`score_raw` figurait ici et n'existe dans aucune table** — zéro occurrence dans
> `apps/backend/app/`. Retiré à la clôture de la Session A de l'ADR-0048, **et signalé plutôt que
> corrigé en silence** : une colonne fantôme retirée sans trace ne laisse personne se demander
> combien il y en a d'autres (patron du constat n° 7 de l'`adr-0045`).

**`reliability_json` (ADR-0048), écrit UNE fois à la soumission et jamais recalculé à la lecture.**
Une règle qui change re-jugerait sinon tout l'historique, et une mesure que Papa a déjà lue
changerait d'avis sous ses yeux — motif du rapport figé de l'`adr-0021`. Le champ `regle_version`
dit quelle règle l'a produit.

🔴 **Trois états, pas deux.** `NULL` ne veut **pas** dire « rien à signaler » : il veut dire **ZETIS
ne regardait pas**, ce qui est l'état de toutes les passations antérieures au chantier. **Aucun
backfill** — on ne reconstitue pas des conditions qu'on n'a pas observées.

```jsonc
{
  "verdict": "a_confirmer",          // ou "rien_a_signaler"
  "regle_version": 1,
  "faits":   { "sorties_ecran": 3, "enonces_copies": 1, "plein_ecran_quitte": false,
               "acquises_sans_trace": 6, "notions_total": 8 },
  "indices": { "reponses_rapides": 4, "taille_changee": true },
  "declencheurs": ["sorties_ecran", "contraste"],
  "portee":  { "observables": ["sortie_ecran", "copie", "taille"] }
}
```

⚠️ **Règle de lecture du contraste** : « notion jamais rencontrée » se lit sur **TROIS** sources en
union — `SkillMastery`, `LearningEvent(skill_id)` hors `NON_WORK_EVENTS`, et
`LessonView ⋈ LessonSkill`. `LearningEvent` **seul ne suffit pas** : le diagnostic journalise avec
le `subject_id` seul, donc une notion mesurée trois fois n'y laisse aucune trace par notion.
Détail : `docs/backend/fiabilite-de-la-mesure.md` §3.4 bis.

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
status             # unknown | weak | learning | solid | mastered | in_progress
mastered_at        # instant de bascule vers `mastered` (nullable)
```

⚠️ **Six valeurs de `status`, pas cinq.** `in_progress` est écrit par `missions/service.py` au
verdict `review_later` et ne sort d'aucun `_status_from_score()` — un lecteur qui n'énumère que les
cinq paliers de score le manque en silence (piège déjà signalé par `adr-0024`). Regroupement
canonique retenu par `adr-0028 §3 bis` : **consolidées** = `mastered` · **fragiles** = `weak` +
`learning` · **en cours** = `solid` + `in_progress` · **non abordées** = pas de ligne du tout.

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

### SkillMasteryHistory

```txt
id
student_id
skill_id
status             # statut APRÈS la bascule (mêmes six valeurs que SkillMastery.status)
mastery_score      # 0-100, au moment de la bascule — audit seulement
changed_at
```

Migration `a9b8c7d6e5f4` (`adr-0028 §3 ter`). Index `(student_id, changed_at)`.

**Pourquoi.** `SkillMastery` ne garde que l'état **courant** : une notion qui redescend de
`mastered` à `learning` écrase son statut sans laisser de trace, et `mastered_at` ne date que
l'entrée dans `mastered`. La courbe des notions **fragiles** du dashboard Papa n'était donc pas
reconstructible — or c'est le signal de régression qu'un parent a besoin de voir tôt.

**Une ligne par CHANGEMENT, jamais par passage.** Écrit uniquement par
`progress/mastery.record_mastery_transition`, qui enveloppe `set_mastery_status` et ne journalise
que si le statut change réellement. Sans ce garde-fou, `quizzes/scoring.py` — qui réévalue la
maîtrise à chaque quiz de fin de cours — ajouterait un doublon par quiz et la courbe compterait des
« bascules » qui n'en sont pas.

**Pas de FK vers `skill_mastery.id`**, volontairement : la ligne de maîtrise est souvent créée dans
la même transaction et n'a pas encore d'`id` au moment de la bascule ; une FK imposerait un
`flush()` à chaque appel. `(student_id, skill_id)` suffit, l'unicité étant déjà portée par
`skill_mastery`.

**Backfill partiel.** La migration ne reconstruit que les entrées dans `mastered` déductibles de
`mastered_at`. Les lignes `mastered` héritées sans date restent hors historique, et les régressions
passées sont perdues : la courbe des fragiles démarre à la mise en service plutôt que de raconter
une histoire inventée — même doctrine que `f1a2b3c4d5e6`.

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

> #### 🔴 Règle de lecture — une mission n'a PAS de chapitre : elle a une NOTION
>
> `missions` ne porte **aucune** colonne de chapitre, et c'est une décision, pas un oubli
> (`adr-0057` addendum Missions §4). Le chapitre se **dérive** à la lecture :
> `Skill → LessonSkill → Lesson(status='validated') → Chapter`
> (`missions.service.chapters_of_missions`, en lot via `lessons_by_skill`).
>
> **Pourquoi jamais persisté** : une notion **change de chapitres** dès que Papa valide une leçon.
> Un `chapter_id` dénormalisé serait faux le lendemain sans que rien ne le signale — c'est
> exactement ce que la règle de lecture des quiz (§ plus haut) a déjà payé.
>
> 🔴 **La dérivation rend `None` quand elle trouve ZÉRO **ou** PLUSIEURS chapitres**, et on n'en
> choisit jamais un : « Priorités opératoires » est enseignée en **Fractions et en Nombres
> relatifs**. Mesuré le 2026-08-14 sur 58 missions actionnables — 52 sous un chapitre (90 %),
> 4 sous aucun, 1 sous deux, 1 sous trois.
>
> ⚠️ **Une mission `champion` n'a aucune notion propre** : ses notions vivent sur ses **étapes**
> (`MissionStep.skill_id`). Ne lire que `Mission.skill_id` la rendrait muette.
>
> ⚠️ **Le gate `validated` est à la charge de l'appelant** — `lessons_by_skill` rend les brouillons
> volontairement. L'oublier a produit une mesure fausse pendant le cadrage.

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
### AgendaItem

> Créée par le chantier Agenda (ADR-0025, Lot 1). **Objet déclaratif** : sa complétion n'est
> pas vérifiable serveur, contrairement à `Mission` (preuve par étape, ADR-0017 §5). Il
> n'alimente **ni** `skill_mastery`, **ni** le SRS, **ni** `evidence/service.py`, **ni** l'XP.

```txt
id
student_id          # FK student_profiles
subject_id          # FK subjects — NULLABLE (saisie sans matière autorisée)
chapter_id          # FK chapters — NULLABLE. Sélectionné par Papa dans le référentiel.
                    # C'est la clé de toute l'analyse (ADR-0025 §11) : {chapter_id, due_on}
                    # est l'entrée exacte de la porte « échéance » du Commander (ADR-0018 §1).
                    # Zéro embedding, zéro parsing — Papa choisit dans un menu.
lesson_id           # FK lessons — NULLABLE. Renseigné quand Papa choisit l'intitulé dans la
                    # liste des cours VALIDÉS du chapitre (addendum ADR-0025 §13/§15). Sert à
                    # POINTER (« lire le cours »), jamais à scoper une production : le
                    # déclencheur et le Commander restent scopés par `chapter_id`.
                    # ⚠️ Le service refuse en 422 une leçon étrangère au `chapter_id` donné.
due_on              # Date (pas datetime : une échéance est un jour)
label               # texte brut, tel que saisi — JAMAIS réécrit par le serveur
kind                # devoir | lecon | controle | rendu
                    # `lecon` = « leçon à apprendre », ajouté par l'addendum ADR-0025 §14 :
                    # c'est le travail que ZETIS sait le mieux accompagner. Premier `kind` qui
                    # DÉCLENCHE une production sans être annoncé dans « ce qui arrive ».
created_by          # student | parent — IMMUABLE après création
created_at / updated_at
edited_by_parent_at # nullable — renseigné automatiquement par le service, jamais par le client
done_at             # nullable — écrit UNIQUEMENT par une route élève (403 côté Papa)
dismissed_at        # nullable — archivage ; aucune suppression physique
parent_note         # nullable — JAMAIS servi à Massimo (schémas séparés)
```

Index `(student_id, due_on)`.

**Nommage volontaire — `due_on`, surtout pas `due_date`.** Sur les missions, `due_date` porte
la sémantique **inverse** : informationnelle, Papa-only, jamais exposée à l'élève (ADR-0018
§1). Les deux ne doivent pas se confondre en relecture.

Schémas séparés côté serveur, patron `MissionStudentOut` / `MissionPilotOut` :
`AgendaItemStudentOut` (sans `parent_note`, avec `edited_by_parent` booléen dérivé) et
`AgendaItemPilotOut` (tout).

**Pas de `skill_id` sur l'item.** Le scope pédagogique passe par `chapter_id` ; les notions s'en
résolvent au moment de l'analyse (fonction pure, la même que la matrice de couverture — un
substrat, deux consommateurs).

### AgendaPlanStep

> Créée par l'ADR-0050 (migration **`b2c3d4e5f9a1`**), qui réalise le §8 rôle 1 de l'ADR-0025 :
> l'échéance dit **quoi**, le plan dit **comment s'y prendre**.
>
> ⚠️ **Ce n'est PAS un `MissionStep`**, et la ressemblance est trompeuse. Une mission se **prouve**
> (complétion vérifiée serveur, ADR-0017 §5) ; une étape de plan se **déclare** — elle hérite de
> l'`AgendaItem` qui la porte, pas du moteur de missions (ADR-0050 Décision 1).

```txt
id
agenda_item_id      # FK agenda_items, ON DELETE CASCADE — l'étape n'existe QUE par son échéance
day_offset          # jours AVANT l'échéance : 1 = la veille. JAMAIS 0 — on ne planifie pas le
                    # jour du contrôle, ce serait une source d'angoisse et non une aide.
kind                # fiche | revision | quiz — vocabulaire de la PANOPLIE, jamais réinventé.
                    # ⚠️ `cours` et `eli5` en sont exclus : l'échéance offre déjà « lire le
                    # cours » (§15), et le redonner ici serait une troisième surface.
skill_id            # FK skills — NULLABLE. La notion visée, quand l'étape en a une.
resource_id         # NULLABLE. 🔴 Sa SIGNIFICATION DÉPEND DU `kind` : `fiche_id` pour `fiche`,
                    # `quiz_id` pour `quiz`, et le `chapter_id` de l'échéance pour `revision`
                    # (dont le grain est le chapitre — deck de l'ADR-0049). L'interpréter
                    # uniformément enverrait Massimo au mauvais endroit.
                    # ⚠️ Servi mais INUTILISÉ pour `fiche` et `quiz` : ni `/fiches` ni `/quiz`
                    # ne sont adressables par id (ADR-0050 Décision 2 quater). La donnée est
                    # juste, c'est la route qui manque.
sort_order          # ordre pédagogique — comprendre, puis mémoriser, puis se tester
done_at             # nullable — écrit UNIQUEMENT par une route élève. « coché », jamais
                    # « fait » : aucun XP, aucune écriture pédagogique (Décision 5, option A).
```

**Cycle de vie, entièrement dans `modules/agenda/plan.py` :**

- **Composé à la PREMIÈRE LECTURE** — celle de **Massimo**, jamais celle de Papa. C'est une
  écriture dans un `GET`, assumée et commentée : `db.commit()` obligatoire, sinon le plan est
  servi avec des ids puis annulé au rollback (la coche répondait alors 404).
- **Puis FIGÉ** : une fiche validée après coup n'y entre jamais.
- 🔴 **RÉVOQUÉ si `due_on` change** (`drop_plan`) — coches comprises, et c'est assumé : elles
  portaient des jours qui n'existent plus. Un rétro-planning est une fonction de la date.
- **Un plan vide n'est jamais persisté** — on ne stocke pas une absence. La composition est donc
  retentée à chaque lecture tant qu'elle ne donne rien, ce qui est le comportement voulu : le jour
  où Papa valide la fiche, le plan apparaît.
- ⚠️ **Non supprimé à l'archivage** de l'échéance — seul un déplacement de date le révoque
  (cohérent avec le §2c : le masquage reste visible côté pilotage).

**Bornes** : au plus **3** étapes (2 si l'échéance est à 2–3 jours), **une par `kind`** — trois
types, donc trois étapes au maximum, naturellement.

**Deux lectures, deux fonctions, et il ne faut pas les confondre** : `get_or_create_plan` (qui
**compose**, pour Massimo) et `plan_counts` (qui **compte**, en lot, pour Papa). Si le pilotage
passait par la première, **Papa figerait le plan de son fils** en relevant l'ENT.

### AppSetting

> Créée par le chantier Agenda (ADR-0025, slice C). Table clé/valeur **volontairement
> minimale**, née d'un besoin précis : certains réglages sont des **gestes de Papa**, pas des
> choix de déploiement.

```txt
key    # PK, ex. "agenda_student_entry_enabled"
value  # texte ; "true" | "false" pour le seul consommateur actuel
created_at / updated_at
```

Premier (et pour l'instant unique) réglage : `agenda_student_entry_enabled` — le verrou de
phase de l'ADR-0025 §10. L'ADR exige que la bascule soit « un interrupteur sur la page de
Papa » ; une variable d'environnement demanderait d'éditer un fichier et de redémarrer, ce
n'est pas un geste.

**La variable d'environnement reste la valeur par défaut** : tant qu'aucune ligne n'existe,
c'est elle qui répond ; la première bascule depuis l'UI crée la ligne, qui prime ensuite. Aucun
back-fill — l'absence de ligne EST l'état « valeur par défaut ».

⚠️ **Ne pas transformer cette table en fourre-tout** : un réglage qui ne change jamais en
production appartient à `core/config.py`. Les trois toggles de la page Paramètres restent
aujourd'hui des mocks non persistés, et les brancher ici serait un chantier à part (ils n'ont
aucun consommateur backend).

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
card_type          # definition | method | example | error_correction | definition_perso
                     # 🔴 `definition_perso` = la définition que MASSIMO a écrite dans sa fiche
                     # (addendum ADR-0015 §13). Recto le terme de ZETIS, verso SA phrase.
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

#### 🔴 Contrainte — la clé à trois colonnes, désormais tenue par la BASE

```sql
ALTER TABLE spaced_review_cards
  ADD CONSTRAINT uq_srs_cards_student_skill_type
  UNIQUE (student_id, skill_id, card_type);        -- migration `e5f6a7b8c9d4`
```

⚠️ **Elle n'ajoute pas un invariant, elle rend VRAI celui que la moitié du code croyait déjà
avoir.** `generation.py` commentait « clé (student, skill, card_type) unique » et produisait
jusqu'à **trois** cartes par notion ; `memory/service.py::schedule_review` en cherchait **une**
par `(student_id, skill_id)`, sans type ni `ORDER BY`, puis écrasait recto/verso/planification.
Aucune des 50 migrations ne posait d'unicité sur cette table.

⚠️ **Défaut LATENT, pas manifeste** (mesuré le 2026-08-13) : sur les 106 notions multi-cartes, le
`MIN(id)` est la carte `definition` **106 fois sur 106** — le balayage rendait donc toujours la
bonne. Ça marchait **par coïncidence d'ordre physique**. Le dédoublonnage de la migration est un
**no-op mesuré** en dev (`DELETE 0`).

#### 🔴 Règle de lecture — la matière d'une carte SRS se lit par `Skill.subject_id`, JAMAIS par son chapitre

Tout le module `memory` suit cette convention, et elle n'est pas un raccourci :
`SpacedReviewCard → Skill → Subject` (`get_reviews_summary`, `build_session`, `servable_chapters`).

**Pourquoi ça compte** : `Chapter` n'a **aucun `subject_id`** — il a deux parents, tous deux
nullables (`school_year_subject_id` et `theme_id`, cf. la règle de lecture des chapitres plus
haut). Une lecture qui passerait par le chapitre pour retrouver la matière devrait donc gérer les
**deux chemins**, sous peine de faire disparaître en silence les chapitres rattachés par thème —
le trou de l'ADR-0037, revu dans l'addendum ADR-0034 puis dans l'ADR-0042.

⚠️ **Conséquence pour `servable_chapters`** (`adr-0057`) : le listing des chapitres offrables part
**des cartes**, pas des chapitres. Il joint `LessonSkill → Lesson → Chapter` pour **découvrir** les
candidats, et laisse `chapter_servable_count` **décider** seul de la servabilité et du nombre.
🔴 Le compte ne vient jamais de la jointure : une notion enseignée par deux leçons du même chapitre
y produit deux lignes, donc un doublon (`ordered_chapter_skill_ids` déduplique pour cette raison).

#### 🔴 Règle de lecture — « servable » a UNE définition, dans `memory/population.py`

| Prédicat | Ce qu'il rend |
|---|---|
| `servable()` | carte active **et non masquée** — la seule porte du flux élève |
| `masquee_par_sa_carte()` | vrai pour la carte `definition` de ZETIS **quand une `definition_perso` ACTIVE existe** sur la même notion |

**Quand Massimo a écrit sa définition, on ne sert que la sienne.** La carte ZETIS n'est ni
supprimée ni suspendue — elle garde sa planification et redevient servable si la sienne disparaît.
*(`suspended` veut déjà dire « plus aucun cours validé ne la couvre » : lui donner un second sens
rendrait le statut illisible.)*

⚠️ **Le masquage vaut pour la SÉLECTION ET pour les COMPTEURS** — `build_session`,
`get_reviews_summary`, `new_cards_count`, `chapter_card_conditions`, `_due_conditions`. Une carte
masquée mais comptée ferait annoncer « 8 cartes » pour en servir 7, le défaut que l'`adr-0039` a
payé sur la file de relecture.

🔴 **Et quand sa carte existe, elle a une PLACE GARDÉE** (`adr-0056`) — le masquage seul ne
suffisait pas. Le tri est `due_at` croissant, or une définition qu'il vient d'écrire est la plus
**récente** : mesurées le 2026-08-14, ses sept cartes étaient aux **rangs 153 à 159 sur 159** en
Français. `build_session` réserve donc jusqu'à `REVIEW_PERSO_RESERVED = 2` places aux cartes
`definition_perso`, sur les decks **matière** et **chapitre** (jamais les mélanges).

- Les places sont prises **DANS** le plafond, jamais en plus : **aucun compteur ne change**
  (`due_count`, `session_size`, `new_cards_count`).
- **Réserve au plus, jamais d'office** : sans carte personnelle servable, elles retournent à la file.
- Le quota **filtre la requête du deck** au lieu de la reconstruire — c'est ce qui le fait se
  composer avec le deck **chapitre**, qui n'a **pas** de clause d'échéance (`adr-0049` §3).

⚠️ **Trois lecteurs HORS du module ne sont PAS masqués**, et c'est une décision : `galaxy`,
`dashboard` (`review_load`) et `production/coverage` répondent à des questions de Papa (charge,
couverture), pas à « que reçoit Massimo ? ». Conséquence assumée : `review_load` compte des cartes
que Massimo ne recevra pas.
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

⚠️ **Règle de lecture — tout lecteur qui COMPTE des révisions doit exclure `is_consolidation`.**
Un re-tour est le 2ᵉ passage de la **même carte le même jour**, sans effet sur la planification : le
compter doublerait une révision qui n'a eu lieu qu'une fois. Appliqué par
`dashboard/service.py::_review_attempts` (vue « Révisions » de la carte mémoire, addendum
`adr-0028-dashboard-papa-agregat-unique` (Amendement 3)). Sur la base de dev, l'écart est de **1 sur 38**.

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
validation_status        # pending | validated | rejected | personal | personal_draft
                           # Les DEUX dernières sont hors cycle éditorial (addendum ADR-0015 §2) :
                           # la fiche de Massimo n'est ni validée ni rejetée, elle est à lui.
                           # `personal_draft` = brouillon — PAS une fiche : ni servi, ni imprimable,
                           # ni dérivable (il ne valide pas encore `FicheSpec`).
validated_at optional      # horodatage de la validation (addendum ADR-0011 §F)
validated_by optional      # parent | parent_bulk | system — QUI a laissé passer ; NULL = non validé, ou antérieur à la traçabilité (aucune rétro-attribution)
created_at / updated_at    # DEFAULT now() NOT NULL depuis `e6f7a8b9c0d1` — étaient nullable sans
                           # défaut serveur (divergence avec le TimestampMixin) : une fiche naissait
                           # à NULL et la Couverture la lisait « absente ».
source                   # generated | manual — COMMENT c'est produit (≠ `author`, cf. ci-dessous)
program_version optional # version de programme (traçabilité, ex: 2020)
author                   # zetis | massimo — À QUI c'est (migration `c3d4e5f6a7b2`), DEFAULT 'zetis'
student_id optional      # FK student_profiles — NULL = fiche ZETIS (elle appartient à une leçon,
                           # pas à un enfant). Renseigné pour une fiche personnelle.
version                  # 1, 2, 3… — rouvrir une fiche FINIE crée une version, l'ancienne reste
                           # lisible ; rouvrir un BROUILLON reprend en place (addendum §7).
                           # `lesson_id` étant indexé NON unique, plusieurs fiches par leçon
                           # étaient déjà supportées : il ne manquait qu'un numéro.
created_at
updated_at
```

Index `(student_id, lesson_id)` : c'est la requête de reprise (« retrouve mon brouillon »).

#### 🔴 Contrainte — un seul BROUILLON par (élève, leçon), et la base le refuse

```sql
CREATE UNIQUE INDEX uq_fiches_brouillon_par_lecon ON fiches (student_id, lesson_id)
  WHERE validation_status = 'personal_draft';        -- migration `d4e5f6a7b8c3`
```

⚠️ **PARTIEL, et il ne peut pas en être autrement.** `student_id` est renseigné sur **toutes** les
fiches personnelles — brouillons **et** fiches finies — et une leçon peut en porter **plusieurs
versions** (§7). Un index sans condition interdirait les versions : la décision fondatrice du §7,
détruite par une ligne d'index. La condition porte donc sur le seul état dont l'unicité est vraie.

⚠️ La migration **dédoublonne avant de contraindre** (une base ayant déjà vu la course refuserait
l'index), en gardant le `MIN(id)` — **exactement la règle que le code applique en lecture**, donc
aucun travail visible n'est détruit. Constat qui l'a motivée : **4 brouillons pour 2 leçons** en
base de dev, `StrictMode` (et un double-tap sur téléphone) envoyant deux `POST /draft` simultanés.

⚠️ **Interdire n'est pas gérer** : `open_or_get_draft` rattrape l'`IntegrityError`, rejoue la
lecture et rend le brouillon du gagnant. Sans ce rattrapage, le perdant de la course recevrait une
**500** pour avoir seulement ouvert son atelier deux fois.

> 🔴 **`author` et `source` sont DEUX AXES, jamais un seul.** `source` dit *comment* la pièce a été
> produite, `author` dit *à qui* elle est. Ajouter `massimo` à `source` aurait privé une fiche
> personnelle assistée de toute valeur juste, et donné à tout lecteur existant de `source` un sens
> qu'il n'attend pas.

#### 🔴 Règle de lecture — on ne repart JAMAIS de rien quand quelque chose existe (`adr-0058`)

Ouvrir l'atelier d'une leçon **ne fabrique un brouillon vierge que si cette leçon n'a rien** — ni
brouillon en cours, ni fiche finie. Quand une fiche finie existe, `open_or_get_draft` **délègue à
`rework`**, qui repart de la dernière version.

⚠️ **La règle vit dans le SERVICE, pas dans les portes.** Elle avait été posée à la main sur deux
appelants (la tuile, le cours) ; toute autre entrée — URL partagée, retour arrière, rechargement —
refabriquait un brouillon **vide** en version N+1, et Massimo retrouvait une page blanche à la
place de son travail. Mesuré en base : un brouillon vide derrière **trois** versions finies, que
`rework` rendait tel quel — le chemin réputé sûr rendait la page blanche.

🔴 **Et un brouillon VIDE derrière une fiche finie se repeuple** depuis cette fiche, à l'ouverture.
Pas de script de migration : la même règle répare le passé et empêche le futur.

⚠️ **« Vide » se DÉRIVE du schéma** — `FicheDraft.model_fields` **moins** le décor
(`title`, `subject`, `level`, `chapter`), qui est pré-rempli par construction et ne dit rien du
travail de Massimo. **Jamais une liste recopiée** : l'ADR en a écrit une, avec trois champs qui
n'existent pas, et elle aurait écrasé du travail réel.

#### 🔴 Règle de lecture — ne JAMAIS interroger `fiches` sans dire de quelle population on parle

Depuis que la table porte deux auteurs, une requête qui ne filtre ni le statut ni l'auteur répond
à une question mal posée. **Deux prédicats partagés**, dans `app/modules/fiches/population.py`,
sont la seule porte :

| Prédicat | Pour qui | Ce qu'il rend |
|---|---|---|
| `readable_by_student(student_id)` | le flux élève | fiches ZETIS `validated` **+** les siennes, brouillons exclus |
| `zetis_authored()` | production, couverture, équipement, veto, pilotage | `author == 'zetis'` |

⚠️ **Le read-before-code du 2026-08-13 a compté HUIT requêtes lisant `fiches`** là où le cadrage en
annonçait trois — dont **quatre hors du module `fiches`, sans aucun filtre de statut**
(`production/equipment.py`, deux dans `production/coverage.py`, la cascade de `production/veto.py`).
Sur celles-là, la « sécurité par construction » de `personal` **ne joue pas** : elle ne protège que
les lecteurs qui filtrent déjà sur `validated`.

⚠️ **`zetis_authored()` se place dans la clause `ON` d'un `outerjoin`, jamais dans le `WHERE`** —
en `WHERE`, un `LEFT JOIN` redevient un `INNER JOIN` et les leçons **sans** fiche disparaissent du
résultat.

⚠️ **Tout lecteur d'un brouillon ORDONNE par `Fiche.id`.** `db.scalar(select(...))` sans `ORDER BY`
rend une ligne **arbitraire** : le 2026-08-13, l'atelier lisait le brouillon rempli pendant que la
tuile de l'écran 2 lisait le vide — Massimo aurait vu son travail disparaître de sa liste alors que
le serveur le gardait. L'index unique ci-dessus empêche désormais la situation ; l'ordre stable
reste la garantie que **deux lectures désignent le même objet**, y compris sur les versions finies.

#### Deux lectures d'une matière, et elles ne répondent PAS à la même question

| Lecture | Centrée sur | Sert |
|---|---|---|
| `list_subject_fiches` | la **fiche** | le deck de révision — « ouvre une fiche pour réviser » |
| `subject_fiche_tiles` | la **leçon** | la fabrication (écran 2) — 4 états `commencee` · `ma_fiche` · `zetis` · `a_fabriquer` |

La seconde n'est **pas** un élargissement de la première : elle doit montrer ce qui n'est pas
encore une fiche (un brouillon, une leçon vierge), là où la première a un contrat qu'on ne casse
pas. 🔴 Priorité des états : **`commencee` avant `ma_fiche`** — s'il a rouvert sa fiche pour la
retravailler, c'est ce travail-là qu'il veut reprendre, pas relire la version précédente.

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

### LessonView (ADR-0034 §4)

Cours lu par un élève. **Quatrième table du patron `*_views`**, calque exact de `fiche_views`.

```txt
id
student_id         # FK student_profiles, index
lesson_id          # FK lessons, index
seen_at            # premier (et seul) regard
                   # unique(student_id, lesson_id)
```

⚠️ **Créée pour combler un trou du §G.3**, qui énumérait *quatre* familles consommables et
oubliait le **COURS** — alors que c'est la classe (A1) dont le palier 3 justifie tout le chantier
d'autonomisation. Sans ce signal, le veto sur un cours ne peut pas dire s'il est encore
rétractable, et le palier 3 promettrait un droit inexerçable.

**Le signal existait déjà, sous une cinquième forme** : `EVENT_LESSON_VIEWED` dans
`learning_events`, avec le `lesson_id` dans `payload_json` — **non indexé** (l'index est
`(student_id, created_at)`). Une famille sur cinq résolue autrement que les quatre autres se
serait payée à chaque évolution du veto.

**Les deux coexistent, délibérément** : `lesson_viewed` sert la heatmap, les sessions et le Cahier
de bord (il se dédoublonne par JOUR) ; cette table répond à « Massimo a-t-il ouvert ce cours, une
fois », de façon indexée. Deux lecteurs, deux besoins, aucune fusion — même règle qui interdit
d'unir `learning_events` et `xp_events`.

Créée le 2026-08-03 (migration `b6c7d8e9f0a1`).

### ProductionRun — le SCOPE (ADR-0031 §4, étendu par l'ADR-0036 §2)

Un lot de production dit **pourquoi** il a produit (le déclencheur) **et sur quoi** (le scope). Ce
sont deux questions distinctes, portées par deux jeux de colonnes qu'il ne faut jamais confondre.

```txt
-- le SCOPE : sur quoi ce lot produit. EXACTEMENT UN des deux.
chapter_id         # FK chapters, nullable — v1 : un chapitre entier
scope_skill_id     # FK skills,   nullable — v2 : une notion…
scope_kind         # String(10),  nullable — …et UNE pièce : cours|fiche|srs|quiz|mindmap

-- les RÉFÉRENCES DE DÉCLENCHEUR : pourquoi. Une colonne par origine, jamais polymorphe.
agenda_item_id · content_request_id · council_report_id · skill_id
```

**Contrainte `ck_production_runs_exactly_one_scope`** — un chapitre, **ou** la paire
`(scope_skill_id, scope_kind)`, jamais les deux, jamais aucun. ⚠️ Elle est tenue **en SQL**,
contrairement à la règle des références (confiée au service et à son test-verrou) : celle-ci ne
dépend d'aucun vocabulaire ouvert, donc l'exprimer en base ne la rend ni illisible ni fragile au
prochain déclencheur.

⚠️ **Le scope n'est PAS dérivé de `content_request_id`**, bien que ce soit techniquement possible
(la demande porte `skill_id` et `content_kind`). Motif de l'ADR-0031 §4, toujours valide : *« ses
colonnes disent POURQUOI on a produit, jamais SUR QUOI »*. Un lot ne doit pas avoir besoin de son
déclencheur pour savoir ce qu'il a à faire — sans quoi le lot **manuel** lancé depuis la page
Demandes (bouton « Produire », `trigger='manual'`, donc **aucune** FK de référence) n'aurait aucun
scope du tout.

⚠️ **Et `skill_id` n'est pas réutilisé** : c'est déjà la référence de déclencheur d'`evidence` et
`derived`. Une colonne qui vaudrait tantôt « pourquoi » tantôt « sur quoi » serait l'ambiguïté
exacte qui a fait rejeter `notion_requests` comme support des demandes de contenu.

⚠️ **Conséquence de lecture, à connaître (2026-08-05)** : puisqu'un lot `manual` ne porte **aucune**
FK vers la demande, « quel lot produit ce que Massimo a réclamé ? » ne se lit **par aucune
jointure**. Le rapprochement se fait sur ce que les deux tables partagent — `(skill_id, piece)`, via
`REQUEST_KIND_TO_PIECE` — et il est **volontairement approximatif** : deux demandes de la même pièce
sur la même notion sont indistinguables, ce qui est sans conséquence puisque la dédup forte
`(student, skill, kind)` interdit qu'il y en ait deux.

⚠️ **Ne sont rapprochés que les lots-PIÈCE** (`scope_skill_id` non nul). Un lot de chapitre produit
aussi la notion, mais il ne répond pas de CETTE demande : afficher son avancement sur la ligne
ferait croire qu'une fiche arrive quand le lot en fabrique quinze, dont peut-être pas celle-là.

⚠️ **Deux lots au même scope ne peuvent plus coexister en file** (`queued`/`running`) — refus `409`
de `create_run`. Ce n'est **pas** une contrainte SQL : elle ne pourrait pas s'exprimer (elle porte
sur un statut, pas sur une identité) et elle ne doit **pas** valoir pour l'histoire, qui garde
légitimement plusieurs lots sur le même scope. Le 2026-08-05, quatre lots identiques ont été créés
faute de cette garde.

⚠️ **`scope_kind` parle la langue des TABLES** (`srs`), pas celle des demandes (`card`). La
correspondance vit **une seule fois**, dans `db/models/production.REQUEST_KIND_TO_PIECE` — qui n'a
**que cinq entrées sur six** : `capsule` n'y figure pas, son générateur exigeant une instruction en
texte libre que la demande ne porte pas (ADR-0036 §3).

Colonnes de scope ajoutées le 2026-08-03 (migration `c7d8e9f0a1b2`).


### ProductionEvent (ADR-0034 §1)

Ce qu'un lot de production a fait, **pièce par pièce**.

```txt
id
run_id             # FK production_runs, index ; + index (run_id, created_at)
skill_id           # FK skills, nullable — un lot peut échouer avant toute notion
piece              # cours | fiche | srs | quiz | mindmap — NULL si l'événement porte sur la notion
outcome            # generated | skipped | error | blocked
detail             # message d'erreur, motif de saut, ou motif de blocage — nullable
created_at
```

**La donnée existait déjà et partait à la poubelle** : `equip_notion` renvoie
`generated` / `skipped` / `errors` par pièce, et `runner.execute` assemblait le tout dans un
`results` retourné au job RQ — dont personne ne lit le retour. Seul `done_notions` survivait. Cette
table retient ce qui était déjà calculé ; **elle n'instrumente aucun générateur** (ce que l'addendum
ADR-0031 interdit).

⚠️ **Écrite dans la MÊME transaction que l'acte qu'elle trace** — patron `log_learning_event`. Un
lot interrompu garde le détail de ce qu'il avait fait : le journal d'un crash est exactement ce
pour quoi on l'écrit.

**Une notion BLOQUÉE écrit sa ligne** (`piece = NULL`, `outcome = 'blocked'`, motif dans `detail`) :
une notion silencieusement omise se lirait comme un échec de production, alors que c'est le gate du
§7 qui fonctionne.

Créée le 2026-08-03 (migration `b6c7d8e9f0a1`), avec **trois colonnes ajoutées à
`production_runs`** dans la même migration — `started_at` (⚠️ `created_at` n'est pas l'heure de
démarrage : le job attend en file), `heartbeat_at` et `current_skill_id` — et
**`spaced_review_cards.created_at`**, seule table de contenu qui n'avait aucun horodatage.

> Un lot `running` dont le battement a expiré est rendu **`stale` par la LECTURE**, jamais par un
> balayage : le §G.3 avait écarté la quarantaine temporelle précisément parce qu'elle exigeait un
> ordonnanceur. Le seul écrivain est `close_stale_runs`, appelé **avant** une création de lot.

**Le RÉGIME du lot** — `production_runs.a0a_level` et `a1_level`, ajoutées le 2026-08-04 (migration
`d8e9f0a1b2c3`, addendum ADR-0034 §1). Écrites par `runner.execute` **au démarrage**, à l'instant
où il lit déjà les paliers pour s'exécuter.

> ⚠️ **Deux paliers, jamais le nom du régime.** L'ADR-0032 a refusé de persister le préréglage
> (« un mode stocké *plus* six clés donnerait deux réponses à une seule question ») : `niveau_de`
> le dérive. On garde les **faits**, le nom se redérive à la lecture, avec la même fonction. Deux
> clés suffisent — `NIVEAUX` ne nomme qu'`A0a` et `A1`, les deux qui commandent la production.
>
> ⚠️ **`NULL` = lot antérieur, et rien n'est rétro-attribué** (§F.4).

**La PROVENANCE du régime** — `production_runs.zetis_mode_source`, ajoutée le 2026-08-04 (migration
`e9f0a1b2c3d4`, addendum ADR-0034 « tri et filtre » §5). Trois valeurs : `capture` (écrite par
`runner.execute` avec les paliers), `deduit` (écrite **une fois** par
`scripts/backfill_zetis_mode.py`), `NULL` (rien ne le prouve).

> ⚠️ **RÈGLE DE LECTURE CHANGÉE.** La déduction du régime depuis les **actes** du lot (un cours
> qu'il a rédigé, un dérivé laissé à relire, une origine `request`) se faisait **à chaque lecture**
> du Journal. Elle n'y est plus : elle a lieu **une fois**, dans le script de reprise.
>
> Motif : les preuves sont **rétractables**. `veto._delete_one` **supprime la ligne `Lesson`** d'un
> cours retiré — la preuve « ce lot a rédigé un cours » partait avec elle, et le régime affiché d'un
> lot d'hier changeait parce que Papa avait exercé un droit prévu. Une des quatre preuves testait en
> plus un **motif d'affichage** (`detail.lower().startswith("cours")`), reformulé le même jour.
>
> ⚠️ **Ce n'est pas ce que le §F.4 interdit** : il interdit de reconstituer depuis les **réglages
> d'aujourd'hui**, qui ont changé. Écrire une fois ce que les **actes** prouvent, avec sa provenance,
> **fige** l'histoire au lieu de la laisser dériver. La capture **prime** toujours : le script ne
> touche jamais un lot qui porte déjà ses paliers (verrou de test).

**Six index posés dans la même migration** (`e9f0a1b2c3d4`) — mesurés absents : `pg_indexes` ne
rendait **aucune** ligne contenant `production_run_id`.

```txt
ix_lessons_production_run_id · ix_fiches_production_run_id · ix_mindmaps_production_run_id
ix_quizzes_production_run_id · ix_spaced_review_cards_production_run_id
ix_production_runs_created_at   # la clé de tri par défaut du Journal, qui commande la pagination
```

**La PIÈCE en cours** — `production_runs.current_piece`, ajoutée le 2026-08-07 (migration
`c4d5e6f7a8b9`, addendum 2 ADR-0041 §20 bis). `String(32)` nullable : la pièce que le lot fabrique
**à l'instant**, `NULL` entre deux notions et à la fin.

> 🔴 **Sans elle, compter des pièces au lieu de notions n'est qu'un renommage.** Les cinq
> `ProductionEvent` d'une notion naissent dans le **même commit** que `done_notions` — décision de
> `runner.py`, « un lot tué entre les deux laisserait un journal qui ment ». Donc `5/155` et `1/31`
> valent le même 3,23 %, au même instant. Le journal porte les notions **achevées** ; cette colonne
> porte la notion **en vol**, et c'est elle qui fait avancer la barre toutes les ~14 s au lieu
> de ~69 s. La lecture est une **somme** : `COUNT(événements de pièces) + PIECES.index(current_piece)`.
>
> ⚠️ **Un état courant, jamais une trace.** Elle s'écrase à chaque pièce et ne se relit pas après
> coup — l'histoire est au journal. Elle n'a donc aucun besoin d'être exacte après un crash : la
> somme se recale sur le journal dès la notion suivante.
>
> ⚠️ **Aucun commit n'est ajouté pour elle** : les cinq générateurs commitent déjà en interne, et
> c'est leur commit qui l'emporte. `equip_notion` la reçoit par un `on_piece` optionnel et
> **n'apprend rien de `ProductionRun`** — ses deux autres appelants (Conseil de classe, composition
> champion) ne changent pas d'un caractère.
>
> ⚠️ **L'ORDRE de `PIECES` est devenu porteur** : la position se dérive de `PIECES.index()`. Deux
> ordres divergeraient en silence et la barre reculerait d'un cran. Un test-verrou lexical compare
> l'ordre des appels dans `equip_notion` au tuple (vérifié par sabotage).

### ProductionRefusal (addendum 2 ADR-0041 §21)

Table `production_refusals`, créée le 2026-08-07 (migration `e7f8a9b0c1d2`). Un régulateur a dit
non, et ZETIS s'en souvient.

```txt
id · trigger · regulator · detail · chapter_id? · skill_id? · created_at · acknowledged_at?
ix_production_refusals_ack_created   # la seule lecture : les non-acquittés, du plus récent au plus ancien
```

> 🔴 **Le trou bouché.** Les cinq régulateurs de `runs.create_run` lèvent un `HTTPException(409)`.
> Quand Papa clique, il en lit le motif à l'écran dans la seconde. Quand le **scan nocturne** se le
> prend à 3 h du matin, `triggers.py` l'attrape et le range dans un compte rendu **que personne ne
> lit** — la journée passait sans production ni explication.
>
> ⚠️ **Les refus AUTOMATIQUES seulement** (`trigger != "manual"`) : persister un refus manuel en
> ferait une notification en double d'un événement que Papa vient de lire, et elle resterait
> affichée après qu'il a compris. Le filtre vit dans `refusals.record`, pas chez l'appelant.
>
> ⚠️ **`regulator` est un vocabulaire fermé** (`REGULATORS`) — `duplicate` · `already_produced` ·
> `pending_backlog` · `request_volume` · `auto_volume`. Le tri se fait sur le **TYPE**
> (`ProductionRefused`), jamais en reconnaissant le motif dans la phrase française : celle-ci se
> reformule, et la classification tomberait **sans qu'aucun test ne rougisse**.
>
> ⚠️ **Portée bornée** : seuls les refus de régulateur entrent. Les `404` du même chemin (chapitre
> introuvable, profil élève absent) sont des défauts de **donnée**, pas des décisions de politique —
> sous le mot « refusé », un bug se lirait comme un régulateur qui fonctionne.
>
> ⚠️ **Aucune déduplication**, et c'est voulu : trois refus identiques dans la journée disent ce
> qu'un seul ne dit pas — la limite n'a pas bougé, rien n'a été produit depuis ce matin.
>
> `detail` est rendu **tel quel** à l'écran, comme un motif d'échec (§8). Une table « motif
> technique → phrase douce » est exactement ce que cet ADR a écarté.

### MindmapView (ADR-0030 §4)

Carte vue par un élève. **« Vu » = la ligne existe** — il n'y a rien d'autre à savoir.

```txt
id
student_id         # FK student_profiles, index
mindmap_id         # FK mindmaps, index
seen_at            # premier (et seul) regard
                   # unique(student_id, mindmap_id)
```

Calque exact de `fiche_views`, et **sans compteur** contrairement à `capsule_views` : un
revisionnage de vidéo est une information pédagogique, relire une mindmap ne l'est pas, et un
compteur qu'on n'affiche nulle part finit par être affiché quelque part.

**Créée le 2026-08-01** (migration `d2e3f4a5b6c7`) pour solder une dette nommée : la route
`POST /api/student/mindmaps/{id}/seen` existait depuis la slice A de l'ADR-0016 et répondait 204
**sans rien persister** (`mark_seen` était un placeholder qui vérifiait seulement la visibilité de
la carte). Mindmaps était de ce fait la seule famille de dérivés sans témoin de nouveauté.

Aucun backfill : les vues passées n'ont jamais été enregistrées, donc toutes les cartes validées
comptent comme nouvelles au premier chargement.

### Eli5View (addendum ADR-0030 — témoin ELI5)

Notion ouverte en ELI5 par un élève. **Sixième table du patron `*_views`**, calque de
`MindmapView`.

```txt
id
student_id         # FK student_profiles, index
skill_id           # FK skills, index
seen_at            # premier (et seul) regard
                   # unique(student_id, skill_id)
```

🔴 **Règle de lecture — à ne pas confondre avec le `new_count` de `student_notions_summary`.**
Celui-ci est un critère de **RÉCENCE** (fenêtre `NOTION_NEW_WINDOW_DAYS` sur `Lesson.created_at`)
et décroît par le temps ; cette table fait mourir un compteur par le **REGARD**. C'est exactement
pourquoi l'ADR-0030 §2 refusait un badge de navigation à ELI5 : la règle n'a pas été assouplie,
cette table est le prix payé pour lui en donner un. Les deux coexistent — le compteur de récence
reste servi, en page, sur les decks.

⚠️ Le geste qui écrit ici est l'**explication demandée et réussie**. Ni l'affichage d'une chip, ni
l'ouverture d'un deck, ni ELI5 **reverse** (reformuler est du travail, pas un regard).

**Créée le 2026-08-15** (migration `f8a9b0c1d2e3`), **avec point zéro** : toutes les notions
éligibles au jour de la pose sont insérées, le témoin démarre donc à 0 et ne compte que ce qui
arrive ensuite. Ceci n'amende pas l'« aucun backfill » de l'ADR-0030 §4 — celui-ci refusait de
prétendre que le passé avait été lu ; ici on pose l'**origine du témoin**, et le passé n'est pas
de la nouveauté.

### QuizView (addendum ADR-0030 — témoin Quiz)

Quiz **ouvert** par un élève. Septième table du patron `*_views`, calque de `MindmapView`.

```txt
id
student_id         # FK student_profiles, index
quiz_id            # FK quizzes, index
seen_at            # premier (et seul) regard
                   # unique(student_id, quiz_id)
```

🔴 **Règle de lecture — « ouvert », jamais « passé ».** Le témoin qui en vit ne regarde **jamais**
`QuizAttempt` : compter les quiz non passés donnerait un compteur qui meurt du TRAVAIL et grossit
quand Massimo ne vient pas, colonne interdite de l'ADR-0030 §1 dont l'unique exception
(`diagnostic`) est nommée et ne s'étend pas. Conséquence assumée : ouvrir un quiz puis l'abandonner
sans répondre éteint quand même le témoin.

Un quiz de **diagnostic** n'entre jamais dans cette lecture (`quiz_type == "mission"` seulement),
sinon il doublerait le témoin `diagnostic`, avec deux règles de mort opposées.

**Créée le 2026-08-15** (migration `f9a0b1c2d3e4`, chaînée sur `f8a9b0c1d2e3`), **avec point
zéro** sur l'**existence** du quiz — jamais sur `completed_at`, qui ferait entrer la notion de
travail dans la table par la porte de la migration.

> ⚠️ **`lesson_views` n'a PAS reçu de point zéro**, et c'est une contrainte, pas une omission :
> elle est lue par `diagnostics/fiabilite.py` (« le cours a été lu » est un critère de fiabilité)
> et par `production/journal.py` (Cahier de bord). Y écrire des vues fictives ferait croire à
> ZETIS que Massimo a lu des cours qu'il n'a jamais ouverts. **Une trace de vue n'appartient pas
> au badge qui la consomme** — avant tout backfill, chercher qui d'autre la lit.

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
Skill 1─N SkillMasteryHistory
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
- `skill_mastery_history(student_id, changed_at)` — **existe** (migration `a9b8c7d6e5f4`) : sert le
  **balayage de FENÊTRE** du dashboard (« toutes les bascules des 90 derniers jours »), même motif
  que `learning_events(student_id, created_at)`.
- `skill_mastery_history(student_id, skill_id, changed_at DESC)` — **existe** (migration
  `a1b2c3d4e5f9`, `adr-0040` §12) : sert « la **DERNIÈRE** bascule de **CHAQUE** notion », le
  `group_by(skill_id)` de l'index des notions. ⚠️ **Le premier index ne sert pas cette
  requête-là** — il faudrait parcourir tout l'historique de l'élève pour en extraire un max par
  notion. Deux motifs de lecture, deux index ; aucune colonne, aucun backfill.

> ⚠️ **Deux absences de date qui ne partagent pas un `null`** (`adr-0040` §7). Une notion sans
> ligne `skill_mastery` n'a **jamais été abordée** ; une ligne de maîtrise **sans** bascule tracée
> a deux causes distinctes — sa dernière bascule précède la mise en service de l'historique
> (`before_history`, **se comblera d'elle-même**), ou elle est `mastered` avec `mastered_at IS
> NULL`, consolidée avant que l'horodatage n'existe (`before_migration`, **définitivement
> perdue**). Les fondre en un `int | null` ferait dire trois choses au même silence.
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

## `ai_jobs` et `production_runs` — l'attente et l'acquittement (ADR-0041, migration `b3c4d5e6f7a8`)

**`ai_jobs` porte désormais deux natures, distinguées par `status`** :

- une **trace** — l'appel synchrone créé directement en `running` par `flush()`, donc invisible
  hors de sa transaction, puis `succeeded` ;
- un **travail de file** — créé en `queued` **et commité** avant l'enfilement, pris par le worker.

C'est le statut qui les sépare : quand une autre connexion peut lire une trace, elle est déjà
finie. Aucun filtre à écrire pour l'exclure de `/activity`.

| Colonne | Table | Rôle |
|---|---|---|
| `acknowledged_at` | `ai_jobs`, `production_runs` | Papa a-t-il VU cet échec ? Serveur, jamais `localStorage` |

🔴 **Règle de lecture ajoutée le 2026-08-06 : `ai_jobs.created_by = "file"` distingue un TRAVAIL
d'une TRACE.** Les deux natures portent le même `job_type`, et les traces sont **beaucoup plus
nombreuses** (une par appel LLM contenu dans le travail). Deux lectures en dépendent :

- l'**estimation de durée** (`ai/travaux.estimations`) ne compte que les lignes de file. Sans ce
  filtre, elle annonçait **7,2 s pour un travail de 53,6 s** — mesuré en base ;
- le **Journal de production** n'affiche que les lignes de file (addendum ADR-0041 §16) : 143 traces
  pour une poignée de gestes le noieraient.

⚠️ `created_by` porte l'**acteur**. Celui d'un travail de file est le worker de production, pas la
requête HTTP qui l'a demandé — même usage que `"worker-media"`. Tout créateur de ligne de file doit
poser cette valeur (`travaux.ACTEUR_FILE`), sinon son travail est compté comme une trace **en
silence**.

**Deux index sur `ai_jobs`, ses premiers** — la table n'en avait **aucun** depuis sa création
(`5678d02df7f6`), alors que `quizzes/service.py` la balaie entièrement à deux endroits :

- `ix_ai_jobs_status_created (status, created_at)` — la lecture d'activité ;
- `ix_ai_jobs_type_status (job_type, status)` — les statistiques de génération.

⚠️ **Aucune colonne d'origine sur `ai_jobs`, et c'est une décision.** `db/models/production.py`
l'interdit en tête de fichier : un déclencheur se pose sur le **lot**, jamais recopié sur ce qu'il
engendre (un lot `agenda` de 31 notions produirait 155 `AIJob`). L'origine se **dérive** : les deux
scans automatiques passent par `create_run`, donc **hors lot ⇒ `manual`**.

⚠️ **Un backfill, contrairement à ce que l'ADR annonçait.** `NULL` sur un échec veut dire « jamais
acquitté » : sans backfill, **tout échec de l'historique** remonterait dans la barre au premier
démarrage. Les lignes déjà `failed` sont datées à leur `finished_at`.
