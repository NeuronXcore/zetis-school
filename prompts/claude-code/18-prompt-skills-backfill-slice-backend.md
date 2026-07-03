# Prompt Claude Code — Génération skills-only pour niveau antérieur · Slice backend (ADR-0010)

> Exécution de l'ADR-0010 (acceptée). Périmètre : **backend uniquement** —
> correction du prompt v1→v2, service d'orchestration, deux endpoints, tests.
> La UI Papa sera une slice séparée (maquette d'abord, méthodologie habituelle).

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (dérogation cloud `curriculum_*`, règles de tests offline) ;
2. `docs/decisions/adr-0010-generation-skills-only-rattrapage.md` **en entier** —
   c'est la spécification de cette étape, en particulier les cinq points de décision ;
   puis `adr-0009` §2, §3 et addendum 1 (les fondations qu'elle exploite) ;
3. `app/prompts/curriculum.py` **en entier** : les deux builders, les few-shots, les
   constantes de version, `has_annual_markers` ;
4. Le **service réel de la passe 2** (module curriculum) — identifie précisément :
   (a) d'où vient `Skill.level` à l'upsert (année active ? paramètre ?) ;
   (b) la clé d'unicité de l'upsert (subject_id + name + level ? normalisation ?).
   Si `Skill.level` est câblé en dur sur l'année active sans possibilité de le
   paramétrer proprement : ARRÊTE-TOI, signale le point et propose l'ajustement
   minimal (paramètre `level` injecté) avant de continuer ;
5. Le modèle SQLAlchemy réel de `Skill` (ne suppose jamais sa forme) ;
6. `app/modules/curriculum/service.py`, `router.py`, `schemas.py` et les définitions
   réelles de `LLMRequest`/`LLMResponse`/`fmt` — le pipeline génération → validation
   Pydantic → 1 réparation → trace `ai_jobs` est le pattern exact à reproduire ;
7. Les tests existants (`test_curriculum_service.py`, `test_curriculum_lessons_service.py`)
   et le `FakeLLMProvider` : les nouveaux tests suivent les mêmes conventions.

## Objectif

Papa pourra, via l'API, générer les notions d'un niveau antérieur du cycle
(ex. français 5e) pour alimenter le référentiel de skills — sans créer d'année
scolaire rétroactive, sans persister aucun chapitre ni leçon — puis confirmer
l'upsert après revue de la liste proposée.

## Travail demandé

### 0. Correction du prompt (ADR-0010, décision 5)

- Dans `FEW_SHOTS`, exemple SVT : aligner « Nutrition et organisation des êtres
  vivants » sur `suggested_class: "4e"` (niveau demandé par le contexte). Ne change
  rien d'autre au contenu des exemples.
- `CURRICULUM_PROMPT_VERSION` : `"v1"` → `"v2"`.
- **Test-verrou nouveau** : pour chaque exemple de `FEW_SHOTS`, tous les
  `suggested_class` correspondent au niveau annoncé dans le `context` de l'exemple
  (la passe 1 est strictement mono-niveau — ce test empêche le débordement de revenir).
- Vérifie l'impact : si des tests assertent `prompt_version == "v1"` ou si des
  fixtures le figent, ajuste-les.

### 1. Service `generate_skills_backfill` (module curriculum)

- Signature indicative : `(subject_id, level) -> SkillsBackfillPreview` — adapte aux
  conventions réelles du service existant.
- Orchestration **en mémoire** :
  1. `build_chapters_prompt(subject, level, cycle, program_version, existing=[])`
     → chapitres d'échafaudage (validation `GeneratedChapters` + 1 réparation) ;
  2. pour chaque chapitre d'échafaudage : `build_lessons_prompt(...)` → leçons +
     notions (validation `GeneratedLessons` + 1 réparation par appel) ;
  3. agrégation en une prévisualisation : notions groupées par chapitre
     d'échafaudage `{ scaffold_chapter: str, notions: [str] }`, dédupliquées
     (une notion citée par deux leçons n'apparaît qu'une fois).
- **AUCUNE écriture** de `Chapter` ni de `Lesson` — les objets générés ne quittent
  pas la mémoire du service. C'est le cœur de la décision 1.
- `program_version` et `cycle` : résous-les comme la génération existante le fait
  (niveau collège → cycle 4 + version) ; n'introduis pas de logique nouvelle.
- Échec de passe 2 sur UN chapitre d'échafaudage : n'avorte pas tout — poursuis les
  autres chapitres et signale les échecs dans la réponse (`failed_scaffolds: [str]`).
  Papa décide avec une liste partielle plutôt que rien.
- Trace `ai_jobs` : type `curriculum_skills_backfill`, une trace par génération
  (matière×niveau), avec `engine_id`/`model_tag` et `prompt_version`, comme les
  traces existantes.
- **Invariant vie privée testé** : aucun champ de Massimo dans system+prompt
  (même test que les passes existantes, appliqué à ce chemin).

### 2. Confirmation `confirm_skills_backfill`

- Entrée : la liste de notions revue par Papa (possiblement éditée/élaguée côté
  client — c'est voulu, décision 2), avec matière et niveau cible.
- Upsert des `Skill` avec `level` = niveau cible, en **réutilisant** la fonction
  d'upsert de la passe 2 (même clé, même normalisation). Ne duplique pas la logique ;
  si elle n'est pas factorisable telle quelle, extrais-la en helper partagé.
- Retour : `{ created: int, existing: int }` (créées vs déjà présentes).
- Flux stateless : le serveur ne stocke pas de brouillon entre generate et confirm ;
  c'est le client qui porte la liste (décision 2 — le confirm revalide les entrées).

### 3. Endpoints (garde rôle parent/admin partout)

- `POST /api/curriculum/skills-backfill/generate` — corps `{ subject_id, level }`.
  Validation : `level` ∈ niveaux du cycle 4 (`5e | 4e | 3e`). Réponse : la
  prévisualisation (+ `failed_scaffolds`).
- `POST /api/curriculum/skills-backfill/confirm` — corps `{ subject_id, level,
  notions: [{ scaffold_chapter, name }] }` (ou la forme plate si plus cohérente
  avec les schémas existants — mais garde `scaffold_chapter` en entrée : il pourra
  servir de `description`/contexte de la skill si le modèle le permet).
- Schémas de réponse dans `packages/types/src/curriculum.ts` (règle CLAUDE.md n°8) —
  la slice UI en aura besoin.
- Erreur 503 explicite si la clé cloud est absente, message identique au pattern
  de la génération de chapitres.

### 4. Tests (offline, `FakeLLMProvider`)

- Génération nominale : preview correcte, notions dédupliquées, AUCUNE ligne créée
  dans `chapters` ni `lessons` (**test-verrou** : compte avant/après identique).
- Échec partiel : un chapitre d'échafaudage en échec après réparation →
  `failed_scaffolds` renseigné, le reste de la preview présent.
- Confirm : upsert avec `level` cible ; re-confirm identique → `created=0`,
  `existing=n` (idempotence) ; les skills préexistantes (seed) intactes.
- Invariant vie privée ; garde parent (403 pour rôle child) ; validation du niveau
  (400 hors cycle 4) ; erreur propre sans clé API.
- Test-verrou few-shots mono-niveau (tâche 0).

## Hors périmètre strict (ne pas commencer)

- Toute UI (slice suivante, maquette validée d'abord).
- Ancrage RAG et `LearningObjective` (Slice A-bis, chantier distinct — ce service
  en bénéficiera automatiquement quand l'ancrage existera dans la passe 1/2).
- Réconciliation des skills seed / diagnostics passés (Lot 3).
- Tout traitement lycée (`2de` etc. → 400).
- `prerequisite_skill_ids` : l'upsert n'en pose pas — le chaînage des prérequis
  reste un chantier ultérieur.

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : `Skill.level` non paramétrable dans
l'upsert existant ; clé d'upsert différente de (subject, name, level) ; modèle
`Skill` divergent de `DATA_MODEL.md` ; résolution cycle/version non factorisée.
Dans ces cas : propose l'ajustement minimal et attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes · 6. Tests · 7. Points non traités volontairement ·
8. Prochaine étape recommandée · 9. Commit conseillé :
`feat(curriculum): skills-only generation for prior level (backfill, backend)`
