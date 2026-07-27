# Prompt Claude Code — ELI5 v2 (slice A backend) : routes élève « notions validées »

> Numérotation : à ajuster à ta séquence réelle de prompts.

---

Chantier : refonte de l'entrée ELI5 par decks matières — slice A, backend uniquement.
Deux routes élève en lecture seule qui exposent les notions du référentiel **validé**.
Aucune écriture, aucune migration, aucun appel LLM dans cette slice.

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/frontend-massimo/page-eli5.md` (v2) — section « Données API » : c'est le contrat ;
3. `DATA_MODEL.md` : `Chapter`, `Lesson`, `LessonSkill`, `Skill`, `SchoolYearSubject`,
   et la règle « rien n'atteint Massimo avant validation » ;
4. Le CODE réel, sans rien supposer :
   - les routes élève existantes `GET /api/student/cours/{subject_slug}` et
     `GET /api/student/lessons/{id}/cours` : module réel où elles vivent, pattern
     `get_current_user`, comment le filtrage `validated` et « année active » y sont
     écrits — tu reproduis EXACTEMENT ces mécanismes, tu ne les réinventes pas ;
   - modèles `Chapter`, `Lesson`, `LessonSkill`, `Skill` (formes exactes, noms de
     colonnes de statut) ;
   - `packages/types/src/curriculum.ts` : conventions des types partagés.

## Travail demandé

### 1. `GET /api/student/notions/summary`

Réponse : `{subjects: [{slug, name, notion_count}]}`.

- Matières de l'**année scolaire active** uniquement (même résolution que la route
  cours élève).
- `notion_count` = nombre de `Skill` distincts atteignables via chapitres `validated`
  → leçons `validated` → `LessonSkill`. Un compte par matière, en UNE requête
  agrégée (pas de N+1 par matière).
- Une matière sans notion apparaît avec `notion_count: 0` (le front affiche
  « bientôt » — ne pas la filtrer).

### 2. `GET /api/student/subjects/{subject_slug}/notions`

Réponse : `{subject: {slug, name}, notions: [{skill_id, name, chapter_title}]}`.

- Même chaîne de filtrage : chapitres `validated` de l'année active → leçons
  `validated` → `LessonSkill` → `Skill`.
- **Dédup par `skill_id`** : une notion rattachée à plusieurs leçons/chapitres
  n'apparaît qu'une fois ; `chapter_title` = celui de la leçon la plus récente
  (`updated_at desc`).
- Tri : ordre des chapitres du référentiel (position si elle existe, sinon création),
  puis nom de notion.
- `404` si la matière n'existe pas dans l'année active. `notions: []` si la matière
  existe mais n'a rien de validé (PAS un 404 — le front a un état positif pour ça).
- Route **neutre** (pas de préfixe `/eli5/`) : d'autres dérivés la consommeront.

### 3. Placement et types

- Colocalise avec les routes élève cours existantes (même module, même router) —
  si le module réel te semble inadapté, propose et ARRÊTE-TOI.
- Types partagés : ajoute les shapes dans `packages/types` en suivant la convention
  du fichier existant (même fichier `curriculum.ts` ou nouveau — suis la règle
  CLAUDE.md, signale ton choix).

## Tests (offline)

- Chapitre `draft` avec leçons `validated` → ses notions n'apparaissent PAS
  (le filtrage remonte toute la chaîne).
- Leçon `draft` dans un chapitre `validated` → ses notions n'apparaissent pas ;
  la même notion via une AUTRE leçon `validated` apparaît (dédup + filtrage combinés).
- Notion liée à deux leçons validées de chapitres différents → une seule occurrence,
  `chapter_title` de la plus récente.
- Matière sans rien de validé → `notions: []` et `notion_count: 0` (pas d'erreur).
- Slug inconnu → 404.
- Rôle `child` : accès OK aux deux routes (pattern `get_current_user`).
- Summary : compte exact multi-matières, une matière vide incluse à 0.

## Hors périmètre strict (ne pas commencer)

- Tout le frontend (slice B).
- Toute modification d'`/ai/eli5/explain` ou du module ELI5 (le contrat accepte
  déjà `skill_id`).
- Suggestions « à revoir » (croisement SRS/lacunes), pagination, recherche.

## Si tu es bloqué

Le lien « année active → matières » ne passe pas par où tu l'attendais → suis le
chemin réel de la route cours élève et signale l'écart ; la colonne de statut des
chapitres/leçons ne s'appelle pas `status` → adapte-toi au réel et signale-le ;
`LessonSkill` absent ou différent de DATA_MODEL.md → ARRÊTE-TOI immédiatement.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé :
`feat(curriculum): student read-only validated-notions routes (summary + per subject)`
