# Prompt Claude Code — Mindmaps · Slice A backend (ADR-0016)

> Exécution de l'ADR-0016 (acceptée). Périmètre : **backend uniquement** — type
> `MindmapJson`, prompt versionné, service de génération (dérivé canonique), table
> `mindmaps` (+ tentatives), endpoints Papa + Massimo read-only, **évaluation de la
> reconstruction côté serveur**, tests. **Aucun layout ici** : le placement des nœuds est
> de la présentation → Slice B (client). La UI est la Slice B.
> **Étape à numéroter (≠ 19/20 réservées `zetis-clip`).** Mono-chantier : après les fiches.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (gate `validated` ; prompts hors composants ; **la logique métier — génération,
   évaluation, XP — est serveur**, jamais client) ;
2. `docs/frontend-massimo/page-mindmaps.md` (les 3 modes, la donnée) +
   `docs/decisions/adr-0016-mindmaps-rendu-layout.md` **en entier** (retiens : **le layout est
   client** ; le backend produit un `mindmap_json` **sans positions** et évalue la
   reconstruction) + `adr-0011` (substrat canonique) + `adr-0007` §2 (patron spec fermé) ;
3. Le **module capsules réel** (`app/modules/capsules/…`) — template du pipeline génération →
   `format` → validation Pydantic (`extra="forbid"`) → **1 réparation** → trace `ai_jobs` →
   jamais de spec invalide persisté ;
4. **Un éventuel module mindmaps préexistant** : `page-mindmaps.md` annonce déjà
   `POST /mindmaps/generate`, `GET /mindmaps/{id}`, `POST /mindmaps/{id}/attempts`,
   `POST /mindmaps/{id}/evaluate`. **Vérifie s'ils existent** (`app/modules/mindmaps/…`,
   table `mindmaps`, migrations). Si oui : **étends l'existant**, ne duplique pas — et
   ARRÊTE-TOI si sa forme diverge fortement de cette slice (signale, propose l'alignement) ;
5. Le résolveur canonique réel `app/modules/ai/canonical_context.py`
   (`resolve_canonical_context` + `build_canonical_sections`) : signature exacte, gate
   `validated` **dans la requête**, traçabilité `lesson_id`/`lesson_title` ;
6. `LLMRequest`/`LLMResponse`/`fmt` réels ; modèle `Lesson` (FK + remontée
   `lesson → chapter → subject`) ; conventions de table `capsules` (`DATA_MODEL.md`) ;
7. `FakeLLMProvider` + un test de service existant (conventions à reproduire).

## Objectif

Papa génère une **carte mentale** à partir d'une leçon validée (dérivée du cours canonique),
l'édite/régénère/supprime/valide. Massimo, read-only, liste les cartes **validées** d'une
matière et en ouvre une. La **reconstruction** (mode `student_reconstruction`) est **évaluée
côté serveur** (comparaison au `mindmap_json` de référence → score + XP). **Aucun calcul de
placement de nœuds** dans cette slice.

## Travail demandé

### 0. Type partagé `MindmapJson` (règle CLAUDE.md n°8)

- `packages/types/src/mindmap.ts` — **arbre strict**, **sans positions** :

  ```ts
  export interface MindmapJson {
    center: string;
    nodes: { id: string; label: string; parent: string | null }[]; // parent=null → racine
    edges?: { from: string; to: string }[];        // optionnel/dérivable de parent
    required_nodes?: string[];                       // pilotent le masquage en training
    optional_nodes?: string[];
  }
  ```

- **Décision arrêtée** : **arbre strict** (liens via `parent`). Les **liens transverses**
  (graphe) sont un follow-up — ne les génère pas. `edges` reste optionnel/dérivable.
- Miroir Pydantic (`extra="forbid"`), bornes raisonnables (cap sur le nombre de nœuds ;
  `parent` doit référencer un `id` existant ou `null` — **valide l'intégrité de l'arbre**).

### 1. Prompt versionné `app/prompts/mindmap.py` (v1)

- `build_prompt(...)` intègre `build_canonical_sections` (cours validé + RAG + « le cours fait
  foi »), puis « produis une carte mentale : idée centrale, branches principales, exemples,
  erreurs à éviter ». Few-shot. `MINDMAP_PROMPT_VERSION = "v1"`.
- Invariant vie privée : aucun champ de Massimo dans `system`+`prompt`.

### 2. Service `generate_mindmap` (module `app/modules/mindmaps/`)

- `generate_mindmap(lesson_id) -> Mindmap` : `resolve_canonical_context(lesson_id)` →
  `build_prompt` → `LLMProvider.generate(LLMRequest(fmt=MindmapJson.model_json_schema()))` →
  `model_validate` (+ **1 réparation**) → persistance `pending` → trace `ai_jobs`
  **`mindmap_generate`**. Jamais de spec invalide persisté.

### 3. Données — tables + migration Alembic

- `mindmaps` : `id`, `lesson_id` (FK, index), `mindmap_json`, `validation_status`, `source`,
  `program_version`, timestamps (conventions `capsules`).
- `mindmap_attempts` : `id`, `student_id`, `mindmap_id` (FK), `score`, `details_json`
  (juste/faux par nœud), timestamps — support de la reconstruction.
- Migration dédiée ; `DATA_MODEL.md` mis à jour. **Si les tables existent déjà** (tâche de
  lecture 4), migre par ajout de colonnes manquantes seulement.

### 4. Endpoints

**Papa (parent/admin)** : `POST /mindmaps/generate` `{ lesson_id }` → `pending` ;
`PUT /mindmaps/{id}` (édition `mindmap_json` → revalide → `pending`) ;
`POST /mindmaps/{id}/regenerate` ; `DELETE /mindmaps/{id}` ;
`POST /mindmaps/{id}/validate`.

**Massimo (read-only, gate `validated` dans la requête)** :

- `GET /api/student/subjects/{subject_slug}/mindmaps` — liste (jointure matière, `validated`).
- `GET /mindmaps/{id}` — la carte (404 si non `validated`).
- `POST /mindmaps/{id}/attempts` — enregistre une tentative de reconstruction (nœuds placés).
- `POST /mindmaps/{id}/evaluate` — **évaluation SERVEUR** : compare les nœuds placés au
  `mindmap_json` de référence → `score`, détail juste/faux par nœud, **XP calculé serveur**
  (jamais côté client). Déterministe (mêmes entrées → même score).
- `POST /api/student/mindmaps/{id}/seen` — retrait futur du badge « Nouveau ».

Schémas de réponse dans `packages/types/src/mindmap.ts` (la Slice B en a besoin).

### 5. Tests (offline, `FakeLLMProvider`)

- Génération nominale : `MindmapJson` valide, **arbre intègre** (`parent` cohérent), `pending`,
  trace `ai_jobs`.
- Invalide → 1 réparation → sinon erreur, **rien persisté**.
- **Test-verrou gate `validated`** : carte `pending` absente des routes Massimo (liste + 404),
  visible après `validate`.
- **Évaluation déterministe** : une reconstruction partielle donne un `score` stable et le
  détail juste/faux attendu ; **XP posé serveur**.
- Invariant vie privée ; garde parent (403 child) sur `/mindmaps/*` d'écriture.

## Hors périmètre strict (ne pas commencer)

- **Tout le rendu et le layout** (radial/horizontal/vertical/équilibrée), React Flow, elkjs,
  `defaultLayout()` : c'est la Slice B, **côté client**.
- Toute UI ; liens transverses (graphe) ; préférence de layout par élève.

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : module/table `mindmaps` préexistant de forme
divergente ; signature de `resolve_canonical_context` inattendue ; emplacement/forme de la
logique d'évaluation existante ; `fmt`/`LLMRequest` divergents du template capsules.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé :
`feat(mindmaps): canonical generation + server-side reconstruction eval (backend)`
