# Prompt Claude Code — Fiches de révision · Slice A backend (ADR-0015)

> Exécution de l'ADR-0015 (acceptée). Périmètre : **backend uniquement** — types
> `FicheSpec`, prompt versionné, service de génération (dérivé canonique), table
> `fiches` + migration, endpoints Papa + endpoints Massimo read-only, tests.
> La UI (Massimo + pilotage Papa) sera la Slice B (briques partagées + viewer).
> **Étape à numéroter (≠ 19/20 réservées `zetis-clip`).**
> Rappel mono-chantier : n'ouvrir cette slice qu'après clôture du référentiel/backfill.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (prompts jamais dans les composants ; schéma d'E/S versionné ; règles de
   tests offline ; **gate `validated` avant tout contenu atteignant Massimo**) ;
2. `docs/decisions/adr-0015-fiches-revision.md` **en entier** — c'est la spécification de
   cette étape (spec fermé §2, dérivé canonique §3, données §7) ; puis
   `docs/decisions/adr-0011-contexte-canonique-partage.md` (le substrat que tu consommes)
   et `adr-0007` §2 (le **patron `CapsuleSpec`** que tu reproduis) ;
3. Le **module capsules réel** (`app/modules/capsules/…` : `service.py`, `schemas.py`,
   `router.py`) — c'est le **template** : pipeline génération → `format` ollama → validation
   Pydantic (`extra="forbid"`) → **1 réparation** → trace `ai_jobs` → jamais de spec invalide
   persisté. Reproduis ce pattern, ne l'invente pas ;
4. `packages/types/src/capsule.ts` (gabarit du type partagé) ;
5. Le résolveur canonique **réel** `app/modules/ai/canonical_context.py` :
   `resolve_canonical_context(...)` et `build_canonical_sections(...)`. Identifie
   précisément **(a)** sa signature exacte (prend-il `lesson_id` ? un objet `Lesson` ?),
   **(b)** que le **gate `status='validated'` est DANS la requête** (tu ne dois jamais
   pouvoir recevoir un cours non validé), **(c)** la traçabilité `lesson_id`/`lesson_title`
   qu'il renvoie. Si la signature diffère de « prend un `lesson_id` » : ARRÊTE-TOI, signale,
   propose l'appel correct avant de continuer ;
6. Les définitions réelles de `LLMRequest`/`LLMResponse`/`fmt` (l'API est
   `generate(request) -> response`, **synchrone**, `fmt` mappé sur `format` d'ollama) ;
7. Le modèle SQLAlchemy réel de `Lesson` (pour la FK `lesson_id` et la remontée
   `lesson → chapter → subject`) et la table `capsules` dans `DATA_MODEL.md` (conventions de
   colonnes à réutiliser : `validation_status`, `source`, `program_version`) ;
8. `FakeLLMProvider` et un test de service existant (`test_capsules_service.py` ou
   équivalent) : les nouveaux tests suivent les mêmes conventions.

## Objectif

Papa pourra, via l'API, **générer une fiche à partir d'une leçon validée** (dérivée du cours
canonique), l'éditer, la régénérer, la supprimer, la valider. Massimo pourra, en read-only,
lister les fiches **validées** d'une matière et lire une fiche. Aucune UI dans cette slice.

## Travail demandé

### 0. Type partagé `FicheSpec` (règle CLAUDE.md n°8)

- `packages/types/src/fiche.ts` — **vocabulaire fermé, sections à budget** (calqué sur
  `capsule.ts`) :

  ```ts
  export interface FicheSpec {
    title: string; subject: string; level: string; chapter?: string;
    essentiel: string;                                       // 2–3 phrases
    definitions: { terme: string; definition: string }[];   // 0–4
    points_cles: string[];                                   // 0–5
    erreurs_a_eviter: string[];                              // 0–3
    mini_exemple?: string;                                   // 0–1
  }
  ```

- **Miroir Pydantic** (module fiches), `extra="forbid"`, avec **bornes dures** :
  `max_length` sur `definitions` (4), `points_cles` (5), `erreurs_a_eviter` (3) ; garde de
  longueur sur `essentiel` et `mini_exemple`. C'est le budget structurel qui garantit le
  « 1 leçon = 1 page » — pas une consigne de prompt.

### 1. Prompt versionné `app/prompts/fiche.py` (v1)

- `build_prompt(...) -> (system, prompt)` : intègre le **contexte canonique** via
  `build_canonical_sections` (cours validé + extraits RAG + règle « le cours fait foi »),
  puis la consigne « produis une fiche de révision d'UNE leçon, sections courtes ». Few-shot.
- `FICHE_PROMPT_VERSION = "v1"`.
- **Invariant vie privée** : aucun champ de Massimo dans `system`+`prompt` (la fiche dérive du
  cours, jamais de données de l'enfant).

### 2. Service `generate_fiche` (module `app/modules/fiches/`)

- Signature indicative : `generate_fiche(lesson_id) -> Fiche` — adapte aux conventions réelles.
- Pipeline **identique aux capsules** :
  1. `ctx = resolve_canonical_context(lesson_id)` (gate `validated` dans la requête) ;
  2. `system, prompt = build_prompt(ctx, …)` ;
  3. `LLMProvider.generate(LLMRequest(system, prompt, fmt=FicheSpec.model_json_schema()))` ;
  4. `FicheSpec.model_validate(...)` → **1 réparation** si invalide, sinon `FicheGenerationError` ;
  5. persistance en `pending`, trace `ai_jobs` type **`fiche_generate`** (avec
     `engine_id`/`model_tag`/`prompt_version`, comme l'existant).
- **Jamais de spec invalide persisté.** Si le cours n'est pas validé → le résolveur ne renvoie
  pas de cours : erreur propre (pas de fiche « dans le vide »).

### 3. Données — table `fiches` + migration Alembic

- Colonnes : `id`, `lesson_id` (FK `lessons`, **index**), `spec_json` (le `FicheSpec`),
  `validation_status` (`pending` | `validated` | `rejected`), `source`, `program_version`,
  timestamps. Réutilise les conventions de `capsules` (`DATA_MODEL.md`).
- **Migration Alembic dédiée** ; mets à jour `DATA_MODEL.md`.

### 4. Endpoints

**Papa (rôle parent/admin partout)** :

- `POST /api/fiches/generate` — corps `{ lesson_id }` → `pending`.
- `PUT /api/fiches/{id}` — édition du `spec_json` : **revalidation Pydantic** → repasse
  `pending`.
- `POST /api/fiches/{id}/regenerate` — régénère (écrase le spec) → `pending`.
- `DELETE /api/fiches/{id}`.
- `POST /api/fiches/{id}/validate` — `pending → validated`.

**Massimo (read-only, gate `validated` DANS la requête)** :

- `GET /api/student/subjects/{subject_slug}/fiches` — liste (jointure
  `lesson → chapter → subject`, **uniquement `validated`**). Route **neutre** (réutilisable).
- `GET /api/student/fiches/{id}` — la fiche (404 si non `validated`).
- `POST /api/student/fiches/{id}/seen` — marque la fiche vue (retrait futur du badge
  « Nouveau ») ; table/colonne de suivi analogue à `capsule_views`.

Schémas de réponse dans `packages/types/src/fiche.ts` (la Slice B en aura besoin :
`FicheSpec` + item de liste `{ id, lesson_id, title, chapter, subject_slug, seen }`).

### 5. Tests (offline, `FakeLLMProvider`)

- Génération nominale : `FicheSpec` valide, **budgets respectés**, statut `pending`, trace
  `ai_jobs` `fiche_generate` écrite.
- Sortie invalide → **1 réparation** → si toujours invalide, `FicheGenerationError`, **rien
  persisté** (compte `fiches` avant/après identique).
- **Test-verrou gate `validated`** : une fiche `pending` est **absente** de
  `GET /api/student/subjects/{slug}/fiches` et renvoie 404 sur `GET /api/student/fiches/{id}` ;
  elle apparaît après `validate`.
- Leçon non validée → génération refusée proprement (pas de cours canonique).
- Invariant vie privée (aucun champ Massimo dans le prompt).
- Garde parent/admin (403 pour rôle child) sur toutes les routes `/api/fiches/*`.
- Deck : la jointure `lesson → chapter → subject` renvoie bien les fiches de la matière.

## Hors périmètre strict (ne pas commencer)

- Toute UI (Slice B : briques partagées + viewer Massimo + pilotage Papa).
- Pont **SRS** (`/srs/from-fiche/{id}`) : dépend du chantier SRS (ADR à part) → **différé**.
- Génération d'une fiche **par Massimo** (sous-décision différée, ADR-0015 « Alternatives »).
- Export PDF au-delà de l'impression navigateur (CSS `@media print`, côté front).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : signature de `resolve_canonical_context`
différente de « prend un `lesson_id` » ; `fmt`/`LLMRequest` divergents du template capsules ;
modèle `Lesson` ou table `capsules` non réutilisables comme gabarit ; convention de route
`/api/student/...` différente de l'existant (ELI5 v2). Dans ces cas : propose l'ajustement
minimal et attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé : `feat(fiches): FicheSpec + canonical generation + validation (backend)`
