# Prompt Claude Code — Référentiel de programme · Lot 2 / Passe 2 · Slice A (backend pur)

> **Hors séquence — NE PAS LANCER avant la clôture de l'étape 14** (Slice B, page
> Programme des chapitres). La passe 2 prend un **chapitre validé** en entrée ; cette
> validation se fait dans la page de la Slice B. Ce prompt est authoré à l'avance pour
> figer la cible ; la Slice B (chapitres) reste le travail prioritaire.
>
> Périmètre quand il s'ouvrira : **backend uniquement** — migration (`lessons` +
> `lesson_skills`), prompt versionné passe 2, service `generate-lessons`, endpoints.
> La page « leçons » (accordéon sous chapitre) sera la Slice B de la passe 2.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (règles générales + dérogation cloud `curriculum_*` déjà en vigueur) ;
2. `docs/decisions/adr-0009-referentiel-programme-scolaire.md` §1–§3 **et son addendum
   `adr-0009-referentiel-programme-scolaire.md` (Amendement 1) en entier** — c'est la spécification de cette
   étape (§B du addendum = le modèle exact de `lesson_skills`, §C = le contrat de
   résolution que cette table doit servir, §E = le rattachement migration) ;
3. `DATA_MODEL.md` (sections `Lesson`, `Skill`, `LearningObjective`, « Relations clés »),
   en notant l'avertissement « `lessons` PAS ENCORE MIGRÉE » — cette étape la crée ;
4. Les **modèles SQLAlchemy réels** de `Chapter`, `Skill`, `SchoolYearSubject` — ne
   suppose jamais leur forme, lis-les. Si `Skill` diverge de `DATA_MODEL.md` (nom de
   colonne `name`/`level`, unicité), ARRÊTE-TOI et signale l'écart avant de continuer ;
5. Le module passe 1 livré : `app/modules/curriculum/{schemas,service,router}.py`,
   `app/prompts/curriculum.py` (prompt chapitres v1), la migration chapitres, et
   `packages/types/src/curriculum.ts`. **La passe 2 étend ce module, elle ne le
   duplique pas** — même provider, même mécanique génération → validation Pydantic →
   1 réparation → trace `ai_jobs`, mêmes conventions de garde de rôle ;
6. Les définitions réelles de `LLMRequest` / `LLMResponse` / `fmt` et le resolver de
   provider `get_llm_provider('curriculum_generate')` (routage cloud déjà en place) ;
7. `app/modules/ai/anthropic_provider.py` (livré en passe 1) — à réutiliser tel quel.

## Objectif

Livrer le cœur backend de la passe 2 (leçons + notions) : à partir d'un **chapitre
validé ou manuel**, Papa génère par IA les leçons du chapitre et les notions (`Skill`)
qu'elles couvrent, les rattache via `lesson_skills`, peut en créer/éditer/valider à la
main — selon les règles de co-construction de l'ADR-0009 §3 et l'addendum §B/§E.

## Travail demandé

### 1. Migration Alembic (une seule)

Cette étape **crée** deux tables (aucune n'existe aujourd'hui) :

- **`lessons`** — champs de `DATA_MODEL.md` : `id`, `chapter_id` (FK `chapters`,
  `ondelete=CASCADE`), `title`, `summary` (nullable), `content_markdown` (nullable —
  rempli plus tard par la passe 3 « cours » ; à ce stade la passe 2 produit le
  squelette leçon, pas le contenu long), `status` (`draft | validated | archived`,
  défaut `draft`), `created_by` (`parent | ai | imported`), `source_document_id`
  (nullable), **`program_version`** (str, nullable — l'écart relevé en passe 1 Slice A
  est réglé ici), `created_at`, `updated_at`.
- **`lesson_skills`** — table N-N de l'addendum §B, **verbatim** :
  - `lesson_id` (FK `lessons.id`, `ondelete=CASCADE`), `skill_id` (FK `skills.id`,
    `ondelete=CASCADE`) ;
  - **PK composite `(lesson_id, skill_id)`** — pas de colonne `id` de surface ;
  - **index requis `ix_lesson_skills_skill` sur `skill_id`** (la PK composite est
    ordonnée `(lesson_id, skill_id)` et n'aide pas les futures requêtes par notion) ;
  - **pas de `is_primary`** (réserve documentée addendum §C — ne pas l'ajouter).
- `skills` existe déjà : NE PAS la recréer. La passe 2 y **upserte** (voir §3).

### 2. Prompt versionné passe 2 (`app/prompts/curriculum.py`)

- Ajouter `build_lessons_prompt(chapter, existing_lessons, existing_skills) ->
  (system, prompt)`, versionné `v1`, à côté du prompt chapitres — **ne pas** casser
  l'API du prompt passe 1.
- Sortie structurée via `fmt` (JSON Schema Pydantic, `extra="forbid"`) : liste de
  leçons, chacune avec `title`, `summary`, et une liste de **notions** (`skill` :
  `name` + `description` courte). Bornes raisonnables (nb de leçons, longueur des
  libellés) comme pour `CapsuleSpec`.
- Co-construction (ADR-0009 §3) : les leçons/notions **manuelles ou déjà validées**
  du chapitre sont **injectées** dans le prompt avec la consigne « complète sans
  dupliquer ».
- **Invariant vie privée** (test dédié, cf. passe 1) : le prompt construit ne contient
  **aucune** donnée de Massimo — seulement chapitre, matière, niveau, version de
  programme.

### 3. Service (`app/modules/curriculum/service.py`)

- `generate_lessons(chapter_id)` :
  - accepte un chapitre dont `validation_status='validated'` **ou** `source='manual'`
    (ADR-0009 §3 : la passe 2 accepte un squelette manuel en entrée) ; sinon erreur
    propre `409`/`422`.
  - pipeline identique aux chapitres : appel `get_llm_provider('curriculum_generate')`,
    validation Pydantic, **1 réparation**, sinon erreur propre — rien d'invalide n'est
    persisté ; trace `ai_jobs` `curriculum_lessons` (avec `engine_id`/`model_tag`).
  - **Upsert `Skill`** (clé métier : `subject_id` + `level` + `name` normalisé) —
    ne JAMAIS dupliquer une notion existante ; une notion déjà présente est réutilisée
    (l'historique de maîtrise y est attaché, ADR-0009 §2). Les skills **ne sont pas
    versionnées** par `program_version` (elles sont persistantes).
  - Crée les `Lesson` en `created_by='ai'`, `status='draft'` (= `pending` : générée →
    non validée d'office, ADR-0009 §3) ; renseigne `program_version`.
  - Insère les liens `lesson_skills`. **Régénération** : ne touche jamais une leçon
    `manual` (`created_by='parent'`) ni `validated` (addendum §A + ADR-0009 §3).
- Création manuelle : `Lesson` en `created_by='parent'`, `status='validated'` d'office ;
  liens `lesson_skills` fournis explicitement (ou aucun).

> ⚠️ Cette slice **ne remplit pas** `content_markdown` (le cours long) et **ne câble
> aucun dérivé** sur le résolveur de l'addendum §C. La table `lesson_skills` est créée
> et alimentée ici ; sa *consommation* par ELI5 v2 est un chantier ultérieur.

### 4. Endpoints (garde rôle parent/admin partout)

- `POST /api/chapters/{id}/generate-lessons` (passe 2).
- CRUD leçons : `POST` (manuel), `PATCH` (édition + `validate`/`reject`), `DELETE`,
  `GET` liste des leçons d'un chapitre (avec leurs notions rattachées).
- Contrats de réponse dans `packages/types` (règle CLAUDE.md n°8) : une leçon expose
  ses `skills` rattachées dépliées (le frontend ne voit jamais la table de jointure).

### 5. Tests (offline, `FakeLLMProvider`)

- `FakeLLMProvider` renvoie des leçons+notions déterministes quand `fmt` correspond au
  schéma leçons (comme pour chapitres/`CapsuleSpec`).
- Cas à couvrir : génération nominale ; réparation puis échec propre ; **upsert skill
  qui ne duplique pas** une notion existante ; **lien `lesson_skills` créé** ;
  régénération qui préserve `manual` et `validated` ; création manuelle validée
  d'office ; refus si chapitre non validé/non manuel ; invariant vie privée ; erreur
  explicite sans clé API.

## Hors périmètre strict (ne pas commencer)

- Passe 3 « cours » (remplissage `content_markdown`) → chantier ultérieur.
- Consommation du résolveur addendum §C (ELI5 v2, prompt à deux sections) → ultérieur.
- Ancrage RAG de la génération de leçons (ADR-0009 §6) → slice suivante, comme pour
  les chapitres.
- `LearningObjective` (attendus de fin de cycle) → Lot 2 ultérieur.
- Toute page frontend (accordéon leçons) → Slice B de la passe 2.
- `is_primary` sur `lesson_skills` → réserve (addendum §C), ne pas ajouter.

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : `Skill` réel sans contrainte d'unicité
exploitable pour l'upsert (proposer la clé métier minimale) ; `Chapter.validation_status`
absent (il a été ajouté en passe 1 — vérifier) ; forme de `fmt`/réparation différente
de ce que suppose ce prompt. Dans ces cas : propose l'ajustement minimal et attends
validation. **Ne réécris jamais une migration potentiellement appliquée ailleurs** —
si la migration chapitres est appliquée, empile une nouvelle migration, ne l'amende pas.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes (migration incluse) · 6. Tests · 7. Points non traités volontairement ·
8. Prochaine étape recommandée · 9. Commit conseillé :
`feat(curriculum): two-pass AI program generation — lessons slice (backend)`
