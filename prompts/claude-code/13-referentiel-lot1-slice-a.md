# Prompt Claude Code — Référentiel de programme · Lot 1 Slice A (backend pur)

> Étape 13. Périmètre : **backend uniquement** — migration, provider, prompt versionné,
> service passe 1, endpoints. La page Papa « Programme » sera la Slice B (étape 14),
> sur le modèle du découpage capsules (ADR-0007).

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (noter les amendements récents : dérogation cloud `curriculum_*`) ;
2. `docs/decisions/adr-0009-referentiel-programme-scolaire.md` **en entier, addendum
   compris** — c'est la spécification de cette étape ;
3. `DATA_MODEL.md` (sections SchoolYear, SchoolYearSubject, Chapter, Lesson, Skill,
   LearningObjective) ;
4. Les **modèles SQLAlchemy réels** de `Chapter`, `Lesson`, `SchoolYearSubject`,
   `SchoolYear` — ne suppose jamais leur forme, lis-les. Si un modèle diverge de
   `DATA_MODEL.md`, ARRÊTE-TOI et signale l'écart avant de continuer ;
5. Les définitions réelles de `LLMRequest` / `LLMResponse` / `fmt` et le code
   d'`OllamaProvider` (c'est le patron de l'`AnthropicProvider` à écrire) ;
6. `app/modules/capsules/service.py` et `app/prompts/capsule.py` — le pipeline
   génération → validation Pydantic → 1 réparation → trace `ai_jobs` est le pattern
   exact à reproduire ;
7. Le harnais `scripts/bench_llm.py` : réutilise les acquis du client Anthropic
   (pas de `temperature` pour sonnet-5, extraction des blocs `text`, `_unfence`).

## Objectif

Livrer le cœur backend de la génération de référentiel (passe 1 — chapitres) :
Papa pourra, via l'API, générer les chapitres d'une matière de l'année active,
en créer à la main, les éditer, les réordonner — selon les règles de
co-construction de l'ADR-0009 §3.

## Travail demandé

### 1. Migration Alembic (une seule)

- `chapters` : + `source` (`generated | manual`, non null), + `validation_status`
  (`pending | validated | rejected`, non null), + `program_version` (str, nullable).
  ⚠️ `chapters.status` existant = progression temporelle, NE PAS le toucher —
  les deux statuts coexistent (ADR-0009 §3).
- `lessons` : + `program_version` (str, nullable). `created_by` et `status`
  existants suffisent pour source/validation (§3) — ne rien dupliquer.
- Valeurs de reprise pour les lignes existantes (seed) : `source='manual'`,
  `validation_status='validated'` — l'existant a été écrit/accepté par Papa.
- `school_years.mode` : NE PAS supprimer. Ajouter seulement un commentaire de
  dépréciation dans le modèle (« déprécié — cf. ADR-0009 §4, jamais lu »).

### 2. `AnthropicProvider` (`app/modules/ai/anthropic_provider.py`)

- Implémente le `Protocol` `LLMProvider` en **HTTP pur** (httpx, comme
  `OllamaProvider` — aucun SDK, cohérent avec le pattern `MLXProvider`).
- `ANTHROPIC_API_KEY` lu depuis l'env ; modèle par défaut `claude-sonnet-5`
  (setting `ANTHROPIC_MODEL`). Compléter `.env.example` (clé jamais en Git).
- Mapping `fmt` : quand un JSON Schema est fourni, force une sortie JSON
  (consigne système + extraction) ; applique les leçons du bench : ignorer
  `temperature`, extraire les blocs `text` uniquement, retirer les balises ```
  éventuelles avant retour.
- Routage : setting `CURRICULUM_LLM_PROVIDER` (défaut `anthropic`). Le résolveur
  du module curriculum l'utilise ; **sans clé API : lever une erreur explicite**
  qui mentionne le repli possible (`CURRICULUM_LLM_PROVIDER=ollama`) — jamais de
  bascule silencieuse (ADR-0009 addendum, condition 4). Les autres modules ne
  changent pas de provider.

### 3. Prompt versionné (`app/prompts/curriculum.py`, v1)

- `build_chapters_prompt(subject, level, cycle, program_version, existing_manual_chapters) -> (system, prompt)`.
- Consignes clés : programme officiel français, version demandée explicitement
  (BO du 30 juillet 2020 pour cycle 4) ; granularité **chapitre de manuel**
  (~5-8 par classe) et non macro-thème ; pour les matières à repères annuels
  (français, maths, EMC) exiger la répartition par classe conforme aux repères
  2019 ; sinon marquer la répartition « indicative » ; **jamais dupliquer les
  chapitres manuels existants** injectés dans le prompt (§3).
- Few-shot court (1 exemple maths, 1 exemple SVT).

### 4. Schéma + service passe 1 (`app/modules/curriculum/`)

- `schemas.py` : `GeneratedChapters` Pydantic strict (`extra="forbid"`),
  **3 à 25 chapitres** (leçon du bench : la borne 15 était fausse), champs
  `title`, `description`, `themes`, `suggested_class`, `repartition`
  (`officielle | interpretee`).
- `service.py` : `generate_chapters(school_year_subject_id)` — synchrone, sortie
  structurée via `fmt`, **1 réparation max** sinon erreur propre (rien d'invalide
  persisté), trace `ai_jobs` `curriculum_chapters` (avec provider/modèle utilisés).
  Règles §3 codées et testées : les chapitres créés arrivent en
  `source='generated'`, `validation_status='pending'` ; la régénération **ne
  touche jamais** les chapitres `manual` ni `validated` (elle remplace uniquement
  les `generated` non validés de la matière) ; `sort_order` : append après
  l'existant.
- **Invariant vie privée testé** : le prompt construit ne contient aucune donnée
  de Massimo (test qui vérifie l'absence des champs élève dans system+prompt).

### 5. Endpoints (garde rôle parent/admin partout)

- `GET /api/subjects` — s'il existe déjà (dette adr-0006), ne pas dupliquer :
  vérifier d'abord.
- `POST /api/school-year-subjects/{id}/generate-chapters` (passe 1).
- CRUD chapitres : `POST` (manuel → `source='manual'`, `validation_status='validated'`
  d'office), `PATCH` (édition + `validate`/`reject` du statut de validation),
  `DELETE`, `POST .../reorder` (liste ordonnée d'ids → `sort_order`).
- Schémas de réponse dans `packages/types` si un contrat frontend est créé
  (règle CLAUDE.md n°8).

### 6. Tests (offline, `FakeLLMProvider`)

- `FakeLLMProvider` renvoie un `GeneratedChapters` déterministe quand `fmt`
  correspond au schéma curriculum (comme pour `CapsuleSpec`).
- Cas à couvrir : génération nominale ; réparation puis échec propre ;
  régénération qui préserve `manual` et `validated` ; création manuelle validée
  d'office ; reorder ; invariant vie privée ; erreur explicite sans clé API.

## Hors périmètre strict (ne pas commencer)

- Passe 2 (leçons), ancrage RAG, `LearningObjective` → Lot 2.
- Toute page frontend → Slice B (étape 14).
- Copie inter-années, réconciliation skills → Lot 3.
- Suppression de `school_years.mode`.

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : modèle `Chapter` réel différent de
`DATA_MODEL.md` ; `GET /subjects` déjà présent sous un autre chemin ; absence de
httpx. Dans ces cas : propose l'ajustement minimal et attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes (migration incluse) · 6. Tests · 7. Points non traités volontairement ·
8. Prochaine étape recommandée · 9. Commit conseillé :
`feat(curriculum): two-pass AI program generation — chapters slice (backend)`
