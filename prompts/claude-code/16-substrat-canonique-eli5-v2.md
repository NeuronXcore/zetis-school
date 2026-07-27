# Prompt Claude Code — Substrat de contexte canonique partagé + ELI5 v2 (premier consommateur)

> Numérotation : à ajuster à ta séquence réelle. `15-` = passe 2 leçons ; le chantier
> d'invariants (index + gate) peut prendre un slot avant celui-ci. Renumérote si besoin.

---

Chantier : substrat de contexte canonique partagé + ELI5 v2 (premier consommateur).
Implémente l'ADR-0011. Périmètre backend. Le substrat est le vrai livrable ; ELI5 le prouve.

> GARDE DE SÉQUENCE : ne lance ce chantier QUE si le chantier d'invariants est mergé
> (index `ix_lesson_skills_skill` + gate `generate-content` → `draft`). Vérifie leur
> présence dans le code au point 0 ; si absents, ARRÊTE-TOI et signale-le.

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0011-contexte-canonique-partage.md` EN ENTIER — c'est la spec ;
   son addendum de dépendance `adr-0009-addendum-cours-canonique.md` §A/§B/§C ;
3. `DATA_MODEL.md` : `Lesson`, `LessonSkill`, règle métier « Cours canonique » ;
4. Le CODE réel, sans rien supposer :
   - modèles `Lesson`, `LessonSkill`, `Skill` (formes exactes) ;
   - le module `rag` : signature réelle de `retrieve_for_skill` (params, type de retour —
     liste de str ? d'objets ? c'est déterminant pour le helper) ;
   - `app/modules/eli5/` en entier : `service.py` (`explain`, comment `context=` est
     alimenté et injecté aujourd'hui), `schemas.py` (`ELI5ExplainResponse`,
     `sources_used`), `router.py`, le prompt versionné `app/prompts/eli5.py` (v1) ;
   - `LLMRequest`/`LLMResponse`/`fmt` et `get_provider` (moteur LOCAL — ADR-0008,
     surtout PAS la dérogation cloud `curriculum_*`) ;
   - comment `ai_jobs` et `output_json` sont écrits/relayés (le badge lit `output_json`).

## Point 0 — vérification des invariants (AVANT tout code)

Confirme dans le code : (a) un index sur `lesson_skills(skill_id)` existe ; (b)
`generate-content` remet la leçon en `status='draft'` à la (re)génération. Si l'un manque,
ARRÊTE-TOI et signale — ce chantier repose dessus, ne le contourne pas.

## Travail demandé

### 1. Le substrat — module NEUTRE partagé (aucun code ELI5 dedans)

Crée `app/modules/ai/canonical_context.py` (vérifie la convention réelle des modules ;
si un autre emplacement neutre s'impose, propose-le et arrête-toi). Il contient
EXACTEMENT deux choses, réutilisables par tous les futurs dérivés :

- `CanonicalContext` (dataclass frozen : `lesson: Lesson | None`, `chunks: list[str]`,
  propriété `has_course`) ;
- `resolve_canonical_context(db, skill_id, *, k_with_course=3, k_without=5)` :
  requête de l'addendum §C VERBATIM — `status == 'validated'` DANS le `select` (le gate
  vit dans la requête, pas ailleurs), `content_markdown` non nul, jointure `LessonSkill`,
  `order_by(updated_at.desc()).limit(1)` ; puis `retrieve_for_skill` avec le `k` adapté.
  **Read-only** : aucune écriture, aucune trace, aucun effet de bord ;
- `build_canonical_sections(ctx) -> str` : compose le BLOC de contexte (pas le prompt
  entier) — section `## COURS VALIDÉ (source canonique)` si `lesson`, section
  `## EXTRAITS COMPLÉMENTAIRES` si `chunks`, puis la règle « le cours fait foi
  (vocabulaire, notations, méthode) ». Si le retour de `retrieve_for_skill` n'est pas
  `list[str]`, adapte le helper à la forme réelle (ne suppose rien).

Ce module ne connaît ni ELI5 ni aucun dérivé : il ne les importe pas, ils l'importent.

### 2. ELI5 v2 — premier CLIENT (le seul code dans `eli5/`)

- Prompt `app/prompts/eli5.py` : v2 qui INSÈRE `build_canonical_sections(ctx)` dans les
  consignes ELI5 existantes (la tâche « expliquer simplement » ne change pas). Versionne
  (garde v1 accessible) — la trace doit refléter la version de prompt utilisée.
- `service.explain` : remplace la récupération plate actuelle par un appel à
  `resolve_canonical_context`. Renseigne `output_json` avec `lesson_id` + `lesson_title`
  (nullables) quand un cours canonique a servi, EN PLUS du `sources_used` existant
  (compte des chunks) — contrat rétro-compatible, ne casse pas le champ actuel.
- `reverse-evaluate` : hors périmètre (ne pas toucher).

### 3. Frontend (minimal, ne pas s'étaler)

- `lib/eli5.ts` : champs optionnels `lesson_id?`, `lesson_title?`.
- Badge Massimo : si `lesson_title` présent → « 📚 D'après ta leçon *{lesson_title}* » ;
  sinon si `sources_used>0` → badge « 📚 D'après ton cours » actuel (inchangé). C'est la
  résolution du reste-reporté de l'étape 13.

### 4. Tests (offline, provider mocké)

- **Substrat, testé isolément** (le test-verrou de l'ADR-0011) :
  - notion AVEC leçon validée → `ctx.lesson` renseigné, `has_course` vrai ;
  - notion avec leçon `draft`/`archived` uniquement → `ctx.lesson is None` (le gate) ;
  - notion sans leçon → `ctx.lesson is None`, fallback RAG (dégradation gracieuse) ;
  - deux leçons validées → la plus récente (`updated_at`) l'emporte ;
  - `build_canonical_sections` : deux sections quand cours+chunks, section unique sinon.
- **ELI5 v2** : `explain` sur notion avec cours → `output_json` porte `lesson_id`/
  `lesson_title` ; sur notion sans cours → comportement identique à v1 (non-régression,
  `sources_used` intact).

## Hors périmètre strict (ne pas commencer)

- Tout autre dérivé (quiz, mindmap, fiches, SRS) — ils consommeront le substrat plus tard,
  SANS le réécrire. Si tu dupliques la moindre logique de résolution hors du module neutre,
  c'est un échec du chantier.
- Variante chapitre du résolveur (capsule) — addendum futur à l'ADR-0011.
- `reverse-evaluate`, moteur de maîtrise, rollup leçon.
- Toute migration (le substrat est pure lecture).

## Si tu es bloqué

`retrieve_for_skill` renvoie autre chose que `list[str]` → adapte le helper, signale-le ;
emplacement neutre du module discutable → propose, arrête-toi ; forme de `fmt`/injection
ELI5 différente de ce prompt → propose l'ajustement minimal et attends.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé :
`feat(ai): shared canonical-course context resolver + ELI5 v2 as first consumer`
