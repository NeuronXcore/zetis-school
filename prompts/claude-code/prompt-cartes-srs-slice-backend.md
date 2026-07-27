# Prompt Claude Code — Cartes SRS · Slice backend génération + réconciliation (ADR-0012)

> Exécution de l'ADR-0012 (contrat arrêté après maquette). Périmètre : **backend
> uniquement**, dans le module **`memory`** existant (le moteur SRS + les endpoints
> élève `/api/student/reviews/*` y sont déjà livrés — tu **étends**, tu ne crées
> pas un module parallèle). Ajoute : un prompt versionné, un service de génération
> consommant le cours canonique, la réconciliation à 3 branches, les endpoints de
> pilotage Papa, les tests. La page Papa est une slice séparée (prompt dédié).

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (tests offline, séparation Massimo/Papa, IA tracée + prompt versionné).
2. `docs/decisions/adr-0012-generation-cartes-srs.md` **en entier** — la spec de
   cette slice, en particulier §2 (dérivé du cours canonique), §3 (upsert
   réconciliateur à 3 branches), §4 (validation héritée). Puis
   `adr-0011-contexte-canonique-partage.md` §1–§2 (le résolveur que tu consommes).
3. **`app/modules/memory/` dans son intégralité** — modèles `SpacedReviewCard` /
   `SpacedReviewAttempt`, `service.py`, `router.py` existants. Repère précisément :
   (a) les valeurs réelles de `SpacedReviewCard.status` utilisées par le moteur
   livré (actif / dû / …) — tu dois y **ajouter un état non-actif** pour les cartes
   suspendues/dégradées ; **si `status` n'a pas de place propre pour ça, ARRÊTE-TOI**
   et propose l'ajustement (nouvelle valeur enum vs colonne) avant de coder ;
   (b) comment `build_session` filtre les cartes — le filtrage des cartes non-actives
   doit passer par **le même chemin serveur** (une carte suspendue ne doit jamais
   être servie) ;
   (c) la présence ou non de `card_type` sur le modèle (clé d'upsert `(student_id,
   skill_id, card_type)`).
4. **`app/modules/ai/canonical_context.py`** : signatures réelles de
   `resolve_canonical_context` et `build_canonical_sections` — tu les consommes tels
   quels, comme ELI5 v2. Ne réimplémente aucune résolution de contexte.
5. `app/prompts/capsule.py` **ou** `app/prompts/curriculum.py` : le patron d'un
   prompt versionné (`build_prompt -> (system, prompt)`, few-shot, `fmt`) que tu
   reproduis pour les cartes.
6. Le résolveur de provider **local** (`get_provider`, pas la dérogation cloud
   `curriculum_*` — ADR-0008 : la génération de cartes est une tâche pédagogique
   quotidienne, 100 % locale) et les définitions réelles de `LLMRequest`/
   `LLMResponse`/`fmt`.
7. Le pattern d'un service de génération existant (capsule ou passe 2 curriculum) :
   génération → validation Pydantic → 1 réparation → trace `ai_jobs` → rien
   d'invalide persisté. C'est le pipeline exact à reproduire.
8. `packages/types/src/reviews.ts` (livré par la slice élève) : tu l'**étends** avec
   les types de pilotage Papa, sans redéclarer les types élève existants.

## Conventions à honorer (lues, pas devinées)

- **Tests** : pytest offline, `FakeLLMProvider`, dans le fichier de test du module
  `memory` (étends-le). Réutilise le `conftest.py` existant (fixtures `client`,
  session, factory `student`). Ne régresse aucun test.
- **Schemas** : Pydantic `app/modules/memory/schemas.py`, `extra="forbid"`, bornés.
- **Types partagés** : étends `packages/types/src/reviews.ts` (types Papa distincts
  des types élève) — même slice, pour que les contrats ne divergent pas.
- **Migration** : `alembic heads` (un seul head) puis chaîne dessus. Migration
  **seulement** si une colonne/valeur d'enum manque (état carte non-actif). Sinon
  zéro migration — dis-le.

## Objectif

Depuis la future page Papa, générer/rafraîchir les cartes SRS de Massimo à partir
des **leçons validées**, par matière, avec réconciliation des notions orphelines —
sans jamais détruire la planification de Massimo.

## Travail demandé

### 0. Prompt versionné `app/prompts/srs_cards.py` (v1)

- `build_cards_prompt(skill_name, canonical_sections) -> (system, prompt)` : demande
  au modèle **local** 1 à 3 cartes pour la notion, chacune `{card_type, front, back}`,
  `card_type ∈ {definition, method, example, error_correction}`. La consigne
  s'appuie **d'abord sur le cours validé** (via `build_canonical_sections`, ADR-0011).
- Few-shot variant les `card_type` (éviter 3 cartes du même type). Versionné `v1`.
- **Invariant vie privée** (test dédié) : le prompt ne contient aucune donnée de
  Massimo — seulement le nom de la notion et le contenu du cours/RAG.

### 1. Schéma de sortie structurée

- Modèle Pydantic `extra="forbid"` : `cards` = liste de 1 à 3 items ;
  chaque item `card_type` (littéral), `front_markdown`, `back_markdown` (bornés).
- Pipeline identique capsule/curriculum : sortie `fmt`, **1 réparation**, sinon
  erreur propre ; **rien d'invalide persisté**.

### 2. Génération d'une notion (`generate_cards_for_skill`)

- `(student_id, skill_id) ->` upsert des cartes de cette skill pour cet élève :
  1. `ctx = resolve_canonical_context(skill_id)` → `build_canonical_sections(ctx)` ;
  2. génération locale → validation → 1 réparation ;
  3. **upsert par clé `(student_id, skill_id, card_type)`** (§3 branche A/B) :
     - carte absente → **création** (`interval_days=0`, `due_at=now`, état **actif**
       si `ctx.has_course`, sinon état **non-actif** — cas dégradé §4) ;
     - carte présente → **update de `front_markdown`/`back_markdown` UNIQUEMENT** ;
       `interval_days`/`ease_factor`/`due_at`/`last_reviewed_at` **JAMAIS touchés**.
  4. trace `ai_jobs` type `srs_cards_generate`, `output_json` portant
     `lesson_id`/`lesson_title` quand un cours canonique a servi.
- Sert `POST /api/memory/cards/skills/{skill_id}/generate` (générer / relancer /
  régénérer une notion).

### 3. Réconciliation par matière (`reconcile_cards_for_subject`) — cœur de l'ADR

`(student_id, subject_id) ->` en une passe :
1. **Ensemble cible** = skills des leçons **validées** de la matière (via
   `lesson_skills` ; une skill peut venir de plusieurs leçons — dédupliquer).
2. Pour chaque skill cible : `generate_cards_for_skill` (branche A ou B).
3. **Branche C (orphelines)** : pour chaque carte **existante** de cet élève dans
   cette matière dont la skill n'est **plus dans l'ensemble cible** →
   passer la carte en **état non-actif (suspendue)** — sans toucher sa planification,
   **sans jamais supprimer la ligne**.
   ⚠️ La condition d'orphelinage est « **plus aucune leçon validée ne couvre la
   skill** » (interroge `resolve_canonical_context` / l'ensemble cible), **pas** le
   diff d'une leçon isolée (`LessonSkill` est N-N).
4. **Réactivation** : une carte suspendue dont la skill **revient** dans l'ensemble
   cible repasse **active en place** (planification intacte) — c'est la branche C
   inverse, dans la même passe.
- Échec de génération sur une skill : n'avorte pas la matière, poursuis les autres,
  signale (`failed_skills: [skill_id]`). Trace `ai_jobs` par matière.
- Sert `POST /api/memory/cards/subjects/{subject_id}/generate`.

### 4. Lecture d'état pour la page (payload léger)

- `GET /api/memory/cards/overview` → KPI + résumé par matière : par matière
  `{subject_id, name, active_cards, to_generate, suspended}`, plus les totaux.
- `GET /api/memory/cards/subjects/{subject_id}` → arbre chapitre → leçon → notion :
  chaque notion `{skill_id, name, state, card_count}` avec
  `state ∈ {ok, to_generate, failed, suspended}` — **jamais le contenu des cartes
  dans cette liste** (payload léger, comme la page Cours). Plus la liste des notions
  suspendues de la matière.
- `GET /api/memory/cards/skills/{skill_id}/cards` → recto/verso des cartes d'une
  notion (chargé **à la demande** par l'aperçu « voir »).

### 5. Actions de réconciliation explicites

- `POST /api/memory/cards/skills/{skill_id}/reactivate` → réactive manuellement une
  carte suspendue (planification intacte).
- `DELETE /api/memory/cards/skills/{skill_id}` → **retrait explicite** (supprime les
  cartes de la notion ET leur historique). **C'est le SEUL endroit où une carte est
  supprimée** — jamais dans le flux de génération/réconciliation (§3). Action Papa
  destructive assumée (l'UI confirmera).

### 6. Endpoints — rôle **parent** partout (distinct des routes élève)

Tous sous `require_parent` (pilotage Papa) — à ne pas confondre avec les routes
élève `/api/student/reviews/*` déjà livrées (`get_current_user`). Portée par élève :
boucle sur les profils élève actifs (Massimo seul aujourd'hui ; ne présume pas le
mono-élève).

### 7. Filtrage serveur (garde §4)

Vérifie/complète que `build_session` (routes élève) **exclut les cartes non-actives**
(suspendues + dégradées) — une carte non adossée à un cours validé ne doit **jamais**
atteindre Massimo. Si le filtre existant ne couvre pas le nouvel état, étends-le au
même endroit (pas de filtre dupliqué).

## Tests (offline)

- **Test-verrou de réconciliation, les 3 branches** :
  - A · régénérer une notion couverte → `front/back` mis à jour, `due_at` /
    `interval_days` / `ease_factor` **strictement inchangés** (compare avant/après) ;
  - B · notion cible sans carte → carte créée, due maintenant, active ;
  - C · notion dont plus aucune leçon validée ne la couvre → carte **suspendue**,
    ligne **conservée**, planification intacte, **absente de `build_session`** ;
    puis une leçon validée re-couvre la skill → réactivation en place.
- Cas dégradé : génération d'une skill sans cours validé → carte **non-active**, non
  servie.
- Upsert idempotent : régénérer deux fois → pas de doublon (clé `(student, skill,
  card_type)`).
- `DELETE` supprime carte + attempts ; aucune autre voie ne supprime de carte.
- Invariant vie privée (prompt sans donnée de Massimo) ; garde parent (403 pour
  rôle child sur les endpoints de génération) ; réparation puis échec propre ;
  échec partiel matière → `failed_skills` renseigné, le reste généré.
- La suite existante reste verte.

## Hors périmètre strict (ne pas commencer)

- La page Papa (slice frontend suivante) — mais livre `reviews.ts` étendu, elle en
  dépend.
- Auto-génération à la validation de leçon (écartée par l'ADR — la page est la
  surface).
- Intégration mission du jour ; `prerequisite_skill_ids` ; ancrage RAG (Slice A-bis).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : `SpacedReviewCard.status` sans place
pour un état non-actif (→ proposer valeur enum vs colonne) ; pas de `card_type` sur
le modèle ; `resolve_canonical_context` de signature différente de l'ADR-0011 ;
`build_session` filtrant d'une façon qui ne se prête pas à exclure le nouvel état.
Dans ces cas : propose l'ajustement minimal et attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes (migration : head chaîné + `alembic upgrade head` OK, ou « aucune ») ·
6. Tests (total vert) · 7. Points non traités volontairement · 8. Prochaine étape
recommandée · 9. Commit conseillé :
`feat(memory): SRS card generation from canonical course + 3-branch reconciliation (Papa)`
