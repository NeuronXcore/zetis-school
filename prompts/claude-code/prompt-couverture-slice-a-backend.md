# Prompt Claude Code — Couverture de production · Slice A (backend)

> **Prérequis dur : le chantier « invariants de lecture des dérivés » est mergé.**
> On ne construit pas une vue fidèle au-dessus d'un modèle de lecture qui fuit.
>
> Périmètre : une migration, une fonction pure de fraîcheur, un modèle de lecture agrégé,
> deux endpoints Papa. **Aucune UI, aucun appel LLM, aucune génération, aucun worker.**

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0011-contexte-canonique-partage.md` — **l'ADR entier, addendum §E
   compris** (fraîcheur des dérivés) : c'est la spécification de ce chantier ;
3. `docs/decisions/adr-0014-moteur-quiz-unifie.md` **Décision 2** — le quiz n'a pas de gate
   de validation, il ne connaît donc que trois états ;
4. `docs/frontend-papa/page-couverture.md` — la spec de page (contrat de la Slice B) ;
5. Le **CODE RÉEL** : modèles `Lesson`, `Chapter`, `Fiche`, `Mindmap`, `Quiz`, `Capsule`,
   `SpacedReviewCard`, `LessonSkill` — noms exacts des colonnes de statut, présence et forme
   d'`updated_at` sur chacun ; le helper de portée validée livré par le chantier précédent ;
   `app/modules/ai/canonical_context.py` ; les endpoints de pilotage existants
   (`/api/fiches/pilotage/{subject_id}`, `quiz-pilotage`) — leur forme de réponse est le
   patron d'arborescence à suivre.

Toute divergence avec ce prompt → **arrête-toi et signale** avant de coder.

## 1. Migration — `lessons.content_updated_at` (§E.3)

Colonne `datetime` **nullable** sur `lessons`. Écrite par les **deux seuls** chemins qui
touchent `content_markdown`, et par aucun autre :

- `POST /api/lessons/{id}/generate-content` (rédaction et régénération) ;
- `PATCH /api/lessons/{id}` **uniquement quand `content` est présent dans le corps**.

Un renommage, un `sort_order`, un rattachement de notion ne doivent **jamais** la toucher.
C'est l'objet même de la colonne : `updated_at` est trop bruyant pour servir de référence.

Reprise des lignes existantes : `content_updated_at = updated_at` là où
`content_markdown IS NOT NULL`, `NULL` sinon. Approximation assumée, à commenter dans la
migration. Mets à jour `DATA_MODEL.md` sous `Lesson`.

## 1bis. Même migration — provenance de la validation (§F)

Sur chaque table de **contenu validable** — dérivés `fiches`, `mindmaps`, `capsules`
**et référentiel `chapters`, `lessons`** :

- `validated_at` — `datetime`, nullable ;
- `validated_by` — enum nullable : `parent` | `parent_bulk` | `system`.

**`missions` est explicitement exclue** (§F.1) : elles naissent `validated` par construction,
toujours par le même chemin, la colonne vaudrait invariablement la même valeur. Ne l'ajoute pas.

Sémantique (§F.1) : `parent` = objet ouvert et relu individuellement ; `parent_bulk` = passé
dans une validation groupée, jamais ouvert pièce par pièce ; `system` = servi sans relecture
par doctrine (le quiz — écrit à la génération) ; `NULL` = non validé, ou antérieur à la
traçabilité.

**Reprise : `NULL` partout.** Ne rétro-attribue rien — prétendre savoir ce qui a été relu
avant l'existence de la colonne serait exactement le mensonge que cette décision corrige.

Mise en conformité des écrivains, **sans exception** (§F.3) :

- validation unitaire depuis une page de pilotage (`POST /api/fiches/{id}/validate`, etc.)
  et validation unitaire d'un chapitre ou d'une leçon (`PATCH /chapters/{id}` action
  `validate`, `POST /lessons/{id}/validate`) → `parent` ;
- `POST /chapters/validate-all` et `POST /school-years/active/chapters/validate-all`
  (existants) → `parent_bulk` ;
- équipement d'une notion (ADR-0021 §2) et composition champion (ADR-0022 §5) →
  `parent_bulk`, **y compris quand ils valident une pièce `pending` préexistante** ;
- génération de quiz → `system` à l'écriture.

Aucun chemin ne doit pouvoir écrire `validation_status='validated'` sans renseigner
`validated_by`. Si tu trouves un chemin de validation que ce prompt ne liste pas, **signale-le**
plutôt que de deviner sa catégorie.

## 2. Fonction pure de fraîcheur (§E.1)

Dans `app/modules/ai/canonical_context.py` — **jamais** dupliquée dans un module dérivé,
même règle que le résolveur (§1 de l'ADR) :

```python
def is_stale(derived_at: datetime | None, content_updated_at: datetime | None) -> bool:
    """Un dérivé est périmé si le cours source a été réécrit après sa production."""
    if derived_at is None or content_updated_at is None:
        return False
    return content_updated_at > derived_at
```

Référence côté dérivé = son propre `updated_at` (§E.4). Conséquence assumée, à commenter :
un dérivé édité par Papa après un changement de cours redevient « frais ». On présume Papa
informé ; le faux négatif est sans danger, c'est le faux positif qu'on élimine.

## 3. Modèle de lecture — fonction pure d'état, puis UNE requête agrégée

### 3a. État de cellule — fonction pure, testée exhaustivement

```python
CellState = Literal["absent", "pending", "validated", "stale", "blocked"]
```

- `blocked` — la leçon n'est pas servable (leçon non `validated`, ou `content_markdown` nul) :
  aucun dérivé n'est générable, la cellule est inerte ;
- `absent` — leçon servable, aucun dérivé ;
- `pending` — dérivé en `validation_status='pending'` ;
- `validated` — dérivé validé et frais ;
- `stale` — dérivé validé (ou, pour le quiz, simplement existant) et `is_stale(...)` vrai.

**Le quiz n'a pas de `pending`** (ADR-0014 Décision 2) : `absent` | `validated` | `stale`.

### 3b. État de ligne

```python
RowState = Literal["blocked_lesson", "blocked_no_course", "ready", "complete"]
```

Deux causes de blocage à distinguer — l'UI propose une action différente pour chacune :
leçon non validée (agir dans Programme) vs cours jamais rédigé (le rédiger ici).

### 3c. Colonnes notion-centrées — fractions, pas d'état

Cartes SRS et capsules ne dérivent pas d'une leçon mais d'une notion (§E.5). Pour chaque
leçon : `covered / total` où `total` = notions liées via `lesson_skills`, `covered` = celles
portant au moins un objet **consommable** :

- **capsule** : `status='published'` uniquement — une capsule générée sans voix ni rendu MP4
  ne se regarde pas et ne compte pas ;
- **carte SRS** : validée.

**Aucun état de fraîcheur sur ces deux colonnes.** Ne l'ajoute pas, même si ça paraît
symétrique : la source canonique d'une notion peut changer de leçon d'une génération à
l'autre, le badge serait ininterprétable.

### 3d. Requête

**Une seule requête agrégée par matière** : `LEFT JOIN` sur les tables de dérivés +
`GROUP BY lesson_id`, plus une jointure `lesson_skills` pour les fractions. **Aucune boucle
par leçon, aucun N+1.** Une matière peut porter 8 chapitres × 12 leçons ; écris un test qui
compte les requêtes si le harnais le permet.

## 4. Endpoints (`require_parent`)

### `GET /api/production/coverage`

Query : `subject_id?` (absent → toutes les matières de l'année active).

Réponse — arborescence miroir de `fiches/pilotage` :

```txt
{ school_year, totals: { lessons, courses_written, derivatives_percent,
                         pending_count, stale_count, orphan_count },
  subjects: [ { id, name, slug, chapters: [ { id, title,
      lessons: [ { id, title, row_state,
                   cells: { cours, quiz, fiche, mindmap },      # CellState + derived_at + validated_by
                   notions: { cards: {covered, total}, capsules: {covered, total} } } ] } ] } ] }
```

`totals.derivatives_percent` porte sur **quiz · fiche · mindmap** uniquement — le cours en
est la condition, pas un dérivé. Ne l'y compte pas.

### `GET /api/production/orphans`

Dérivés (fiche, mindmap, quiz) rattachés à une leçon `archived` ou supprimée. Chaque entrée
porte : type, titre, matière, date d'archivage de la leçon, et **`has_history`** (au moins une
`QuizAttempt` / `MindmapAttempt`) — l'UI désactive la suppression quand il est vrai.
Lecture seule : ce endpoint ne supprime ni ne réattache rien.

## 5. Tests

- `is_stale` : les quatre combinaisons de `None`, égalité stricte (`==` → **pas** périmé), ordre.
- **Test-verrou anti-faux-positif** : renommer une leçon, changer son `sort_order`, modifier
  ses notions → `content_updated_at` **inchangée**, aucun dérivé périmé. C'est le test qui
  protège la crédibilité de la page ; sans lui elle sera abandonnée dès le premier badge à tort.
- `content_updated_at` bougée par `generate-content` et par un `PATCH` **portant `content`** ;
  pas bougée par un `PATCH` sans `content`.
- État de cellule : table de vérité complète, y compris le quiz sans `pending`.
- État de ligne : les deux causes de blocage produisent des valeurs distinctes.
- Fractions : leçon à 3 notions dont 1 avec carte validée → `1/3` ; capsule `draft` ou
  `rendering` **non comptée**, `published` comptée.
- Leçon sans notion liée → `0/0`, pas d'erreur ni de division.
- Orphelins : dérivé sur leçon `archived` listé, `has_history` correct.
- Garde `require_parent` (403 pour rôle `child`) sur les deux routes.
- **Provenance** : validation unitaire → `parent` ; `validate-all` → `parent_bulk` ;
  quiz généré → `system`. `validated_at` renseigné dans les trois cas.
- **Test-verrou §F.3** : après exécution de tous les chemins de validation du code, aucune
  ligne `validation_status='validated' AND validated_by IS NULL`. Ce test doit échouer si un
  futur chemin de validation oublie la colonne.
- Les lignes reprises par la migration restent `validated_by IS NULL` (pas de rétro-attribution).

## Hors périmètre strict (ne pas commencer)

- Toute UI (Slice B).
- Le planificateur de production, le worker, la file de tâches, la génération en lot.
- La file de relecture (chantier distinct).
- La suppression / le réattachement des orphelins (lecture seule ici).
- `quizzes.inspected_at` / tout marqueur « jamais inspecté » — **écarté**, remplacé par la
  provenance du §1bis. Ne l'introduis pas.
- Le filtre par moteur (`model_tag`) — **écarté** : sans production en lot, il désignerait un
  problème sans levier. Ne crée aucune colonne, n'expose aucun champ pour ça.
- **Aucun agrégat de provenance** dans `totals` (§F.2) : pas de « N objets validés en lot »,
  pas de compteur, pas d'alerte. La provenance s'affiche par objet, elle ne se totalise pas —
  un compteur qui reproche à Papa une tâche qu'il a choisi de ne pas faire n'est pas un outil.
- Le signalement par Massimo (« cette question est bizarre ») — backlog, non planifié.

## Si tu es bloqué

Écarts probables : une table de dérivé sans `updated_at` exploitable (→ signale, ne bricole
pas un substitut) ; `Capsule.status` dont les valeurs diffèrent de `published` (→ aligne-toi
au réel et dis-le) ; le helper de portée validée absent ou nommé autrement (→ le chantier
prérequis n'est pas mergé, **arrête-toi**) ; une jointure qui impose du N+1 pour rester
lisible (→ propose, ne l'introduis pas en silence).

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé :
`feat(production): coverage read model + derivative staleness (backend)`
