# Prompt Claude Code — Référentiel de programme · Lot 2 Slice A (passe 2 : leçons + notions, backend pur)

> Étape 15. Suite du Lot 1 (chapitres livrés : étapes 13 Slice A, 13-bis, 14 page
> Programme validée). Périmètre : **backend uniquement** — migration, prompt versionné,
> service passe 2, endpoints. L'accordéon leçons/notions et la case « Proposer des
> leçons » sur la page Papa seront la **Slice B (étape 16)**, sur le modèle du découpage
> capsules et du Lot 1.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, **avant toute ligne de code** :

1. `CLAUDE.md` (règles en vigueur, dont la **dérogation cloud `curriculum_*`** actée par
   l'ADR-0009 §7 addendum — issue (b), `AnthropicProvider`) ;
2. `docs/decisions/adr-0009-referentiel-programme-scolaire.md` **en entier, addendum
   compris** : §1 (deux passes descendantes), §2 (générer dans la hiérarchie existante,
   pas de tables `curriculum_*`), §3 (co-construction par nœud, cascade des statuts),
   §5 (versionnage), §7 addendum (routage moteur tranché) — c'est la spécification de
   cette étape ;
3. `DATA_MODEL.md`, sections `Chapter`, `Lesson`, `Skill / Notion`, `LearningObjective`,
   `SkillMastery`. **Note critique** : la table `lessons` est documentée mais **PAS
   ENCORE MIGRÉE** (écart relevé au Lot 1 Slice A) — cette étape la crée ;
4. Les **modèles SQLAlchemy réels** de `Chapter`, `Skill`, `SchoolYearSubject`,
   `Subject` (fichier `school.py` et ses voisins). Vérifie l'état réel de la table
   `skills` : si le modèle/la migration `Skill` n'existe pas non plus, ARRÊTE-TOI et
   signale-le avant de coder — la portée de la migration en dépend. Ne suppose jamais la
   forme d'un modèle : lis-le. Si un modèle diverge de `DATA_MODEL.md`, ARRÊTE-TOI et
   signale l'écart ;
5. Le code réel livré aux étapes 13 et 13-bis : `app/modules/curriculum/schemas.py`,
   `service.py`, `router.py`, `app/prompts/curriculum.py`, la migration des chapitres,
   `app/modules/ai/anthropic_provider.py` et le résolveur de provider `curriculum`
   (setting `CURRICULUM_LLM_PROVIDER`). La passe 2 **réutilise** ce provider et ce
   pipeline — rien à réécrire côté LLM ;
6. Les définitions réelles de `LLMRequest` / `LLMResponse` / `fmt` et le pipeline
   génération → validation Pydantic → 1 réparation → trace `ai_jobs` de la passe 1
   (chapitres) : c'est le patron **exact** à reproduire pour les leçons.

## Objectif

Livrer le cœur backend de la passe 2 : à partir d'un **chapitre validé ou manuel**, Papa
peut, via l'API, **générer les leçons et leurs notions** d'un chapitre, en ajouter à la
main, les éditer, les valider/rejeter, les réordonner — selon les règles de
co-construction de l'ADR-0009 §3. Chaque notion générée **upserte une `Skill`**
(le référentiel persistant). Déclenchement **chapitre par chapitre, à la demande** —
jamais automatiquement sur toute l'année (ADR-0009 §1).

## Travail demandé

### 1. Migration Alembic (une seule)

- **Créer la table `lessons`** (elle n'existe pas) conforme à `DATA_MODEL.md` :
  `id`, `chapter_id` (FK → `chapters`, non null, index), `title`, `summary`,
  `content_markdown` (nullable — **non rempli par la passe 2**, réservé à la génération
  de cours ultérieure), `status` (`draft | validated | archived`, non null),
  `created_by` (`parent | ai | imported`, non null), `source_document_id` (nullable),
  `sort_order` (int, non null, défaut 0), **`program_version`** (str, nullable),
  `created_at`, `updated_at`.
  - Sémantique co-construction (§3) : `created_by` ≈ **source**, `status` ≈
    **validation**. Pas de nouvelles colonnes `source`/`validation_status` sur `lessons`
    — on réutilise l'existant documenté (ne pas dupliquer le motif des chapitres).
- **Rattachement notion → leçon** : une leçon porte une ou plusieurs notions (`Skill`).
  Lis le modèle réel avant de choisir : s'il existe déjà une table de liaison
  `lesson_skills` (ou un `skill_id` sur une entité pédagogique), réutilise-la ; sinon crée
  une table de liaison minimale `lesson_skills (lesson_id, skill_id)` avec unicité de la
  paire. **Ne crée pas de table `curriculum_*`** (ADR-0009 §2). Si le rattachement est
  ambigu dans le schéma réel, ARRÊTE-TOI et propose l'option la plus sobre avant de coder.
- **`skills`** : aucune colonne nouvelle attendue (subject_id, name, description, level,
  parent_skill_id, prerequisite_skill_ids suffisent). Si la table n'existe pas encore
  (cf. lecture n°4), la créer ici **au strict nécessaire de `DATA_MODEL.md`** — signaler
  ce sur-périmètre en tête de réponse.
- Pas de valeurs de reprise à seeder (aucune leçon existante).

### 2. Prompt versionné (`app/prompts/curriculum.py`, ajout — pas de refonte)

- Ajouter `build_lessons_prompt(subject, level, cycle, chapter, program_version,
  existing_manual_lessons) -> (system, prompt)`, à côté de `build_chapters_prompt` (ne pas
  toucher ce dernier).
- Consignes clés :
  - programme officiel français, **version demandée explicitement** (BO du 30 juillet 2020
    pour cycle 4) ; le chapitre validé fournit le cadrage (`name`, `description`,
    `metadata_json.themes`) ;
  - granularité **leçon de manuel** (≈ 2-8 leçons par chapitre) — ni macro-section, ni
    micro-item ; le **prompt pilote la granularité** (leçon du bench T4 : borner large
    côté schéma, cadrer fin côté prompt) ;
  - chaque leçon porte 1 à 4 **notions** (intitulé court, factuel, réutilisable comme
    `Skill`) ;
  - **injecter les leçons manuelles existantes** du chapitre (« complète sans dupliquer »,
    §3) ;
  - **zéro donnée personnelle** (aucune donnée de Massimo) — invariant de la dérogation
    cloud (§7 addendum, condition 1).
- Versionner (`prompt_version = "v1"` pour les leçons), tracé dans les métadonnées comme
  pour les chapitres.

### 3. Schéma de sortie structurée (Pydantic, `fmt`)

- Un modèle `extra="forbid"`, borné : `lessons` = liste de 2 à 12 items (large, la
  granularité fine vient du prompt — leçon T4 sur les bornes jetables) ; chaque leçon =
  `title`, `summary` (1-2 phrases), `notions` = liste de 1 à 6 intitulés courts.
- Mécanique **identique aux capsules et à la passe 1** : sortie `LLMRequest.fmt`,
  **1 tentative de réparation**, sinon erreur propre ; **rien d'invalide n'est persisté**.

### 4. Service passe 2 (`app/modules/curriculum/service.py`, extension)

- `generate_lessons(chapter_id, ...)` :
  1. Charge le chapitre ; **refuse** (erreur métier claire, 409/422 selon la convention du
     module) si le chapitre n'est ni `validation_status = validated` ni `source = manual`
     (§1 : entrée = chapitre validé **ou** manuel).
  2. Résout le provider via le résolveur `curriculum` existant → `AnthropicProvider`
     (`claude-sonnet-5`) par défaut. **Sans clé API : lever l'erreur explicite existante**
     mentionnant le repli `CURRICULUM_LLM_PROVIDER=ollama` — jamais de bascule silencieuse
     (§7 addendum, condition 4). Réutiliser tel quel le provider livré au Lot 1
     (`_unfence`, extraction des blocs `text`, `temperature` ignorée pour Sonnet).
  3. Génère → valide (Pydantic) → **1 réparation** → sinon erreur.
  4. Persiste chaque leçon générée : `created_by = 'ai'`, `status = 'draft'` (=
     `pending`, obligatoire pour du généré, §3), `program_version` reprise du chapitre,
     `sort_order` incrémental. `content_markdown` reste **null**.
  5. **Upsert des notions en `Skill`** : pour chaque notion, résoudre/insérer une `Skill`
     par clé `(subject_id, level, name normalisé)` — **dédupliquer** pour ne pas créer de
     doublon à la régénération (matching par nom normalisé casse/espaces ; le matching
     sémantique par embedding + confirmation Papa est **Lot 3**, hors périmètre ici).
     Rattacher la `Skill` à la leçon (table de liaison du §1).
  6. **Trace `ai_jobs`** : type `curriculum_lessons`, avec `engine_id` / `model_tag`
     (obligatoire, comme la passe 1).
- **Règles de co-construction à garantir côté service (§3)** :
  - la (re)génération **ne touche jamais** les leçons `manual` (`created_by = 'parent'`)
    ni les leçons validées (`status = 'validated'`) — elle ajoute, ne réécrit pas ;
  - les leçons manuelles existantes sont **injectées dans le prompt** (« complète sans
    dupliquer ») ;
  - **cascade indépendante** : valider une leçon ne modifie pas le statut du chapitre ; un
    chapitre validé peut recevoir de nouvelles leçons `draft`.

### 5. Endpoints (garde rôle **parent/admin**, comme tout le module curriculum)

- `POST /chapters/{chapter_id}/generate-lessons` — passe 2 (requête longue synchrone,
  ~10-30 s ; renvoie la liste des leçons du chapitre après génération).
- CRUD manuel des leçons :
  - `POST /chapters/{chapter_id}/lessons` — création manuelle : `created_by = 'parent'`,
    `status = 'validated'` d'office (§3 : *écrire* = validé) ; notions optionnelles
    (upsert identique) ;
  - `PATCH /lessons/{id}` — édition (`title`, `summary`, notions) ;
  - `DELETE /lessons/{id}` — suppression ;
  - `POST /lessons/{id}/validate` et `.../reject` — uniquement pertinents sur `draft` ;
  - réordonnancement des leçons d'un chapitre (`sort_order`), même convention que le
    réordonnancement des chapitres livré au Lot 1.
- Schémas de requête/réponse dans `packages/types/src/curriculum.ts` (règle CLAUDE.md
  n°8 : le contrat TS est la source de vérité pour la Slice B). Les notions sont exposées
  **dépliées** (intitulés + `skill_id`), jamais la table de liaison brute.

### 6. Tests (module `curriculum`, à étendre — ne pas régresser les 119 existants)

- Génération : chapitre validé → leçons `draft` + notions upsertées ; chapitre ni validé
  ni manuel → **refus** testé.
- **Verrous de co-construction** : une régénération ne modifie ni une leçon `manual` ni
  une leçon `validated` (test dédié) ; les leçons manuelles apparaissent dans le prompt
  (assert sur le prompt construit).
- **Dédup skills** : deux générations successives sur le même chapitre ne créent pas de
  `Skill` en double (même `(subject_id, level, name)`).
- **Invariant vie privée** : le prompt leçons ne contient aucune donnée de Massimo
  (test sur le contenu construit).
- Dégradation propre : provider sans clé → erreur explicite mentionnant le repli ollama
  (mock, pas d'appel réseau réel — réutiliser le `FakeLLMProvider` / le pattern de test
  de la passe 1).
- 1 réparation : sortie LLM invalide puis réparée → persistée ; invalide × 2 → rien en
  base (rollback vérifié).

## Hors périmètre strict (à ne PAS faire ici)

- **Frontend** (accordéon leçons/notions, case « Proposer des leçons ») → **Slice B,
  étape 16**.
- **Ancrage RAG** de la génération (§6) et **extraction `LearningObjective`** (attendus de
  fin de cycle) → **Slice A-bis** du Lot 2, étape séparée (ne pas anticiper).
- **Réconciliation sémantique** des skills seed / diagnostics passés (matching embedding +
  confirmation Papa) et **copie inter-années** → **Lot 3**.
- **Génération de `content_markdown`** (cours complet d'une leçon) → downstream, non lié à
  la passe 2.
- **Lycée** : modèle prêt, génération différée (§8) — ne rien générer.

## Garde-fous de méthode

- Une seule étape, une seule migration, un seul commit propre.
- Lis les modèles réels **avant** de coder ; à la moindre divergence avec `DATA_MODEL.md`
  (table `skills`, liaison notion↔leçon, forme de `Chapter`), **ARRÊTE-TOI et signale**
  avant de continuer.
- Aucune dépendance nouvelle sans ADR (`CLAUDE.md`). Le SDK Anthropic reste interdit :
  l'`AnthropicProvider` HTTP pur du Lot 1 est réutilisé tel quel.
- Ne touche pas `build_chapters_prompt`, ni les colonnes `chapters`, ni le résolveur de
  provider (réutilise-les).

## À la fin, réponds avec la checklist standard (9 points)

Objectif, fichiers créés, fichiers modifiés, migration (nom + `alembic upgrade head` OK),
choix techniques + écarts éventuels signalés, endpoints ajoutés (chemins exacts),
résultats de tests (verts, total), risques/points d'attention pour la Slice B, commit Git
proposé.

Commit suggéré :
`feat(curriculum): lessons pass (passe 2) with skill upsert and co-construction rules`
