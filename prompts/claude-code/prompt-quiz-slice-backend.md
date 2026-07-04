# Prompt Claude Code — Quiz · slice backend (ADR-0014, Lot 1)

> À lancer APRÈS la clôture du chantier référentiel (étape 18) — mono-chantier.
> Périmètre : **backend uniquement** — migration légère, module `quizzes`
> (génération depuis le cours canonique, auto-vérification, correction
> déterministe, CRUD Papa, flux de tentative élève, scoring pondéré, XP).
> Aucun frontend dans cette slice.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0014-moteur-quiz-unifie.md` — c'est la spécification de
   cette slice (Décisions 1 à 6). Elle fait foi en cas d'ambiguïté ;
3. `docs/decisions/adr-0011-contexte-canonique-partage.md` **et le code réel**
   `app/modules/ai/canonical_context.py` — signatures exactes de
   `resolve_canonical_context` et `build_canonical_sections`. Le quiz est le
   **deuxième client** de ce substrat : consomme-le, ne le réimplémente pas
   (le gate `status='validated'` vit dans sa clause `where`) ;
4. **Les définitions réelles** de `LLMRequest`/`LLMResponse` et de
   `get_provider` — ne suppose JAMAIS la forme de l'API du provider, lis-la ;
5. `app/modules/diagnostics` en entier — c'est le **patron** (prompt versionné
   → provider → parsing → persistance → trace `ai_jobs` → scoring par notion).
   Tu t'en inspires, tu ne le modifies PAS (le diagnostic de l'étape 14 reste
   intouché dans cette slice) ;
6. Les modèles réels `Quiz` / `QuizQuestion` / `QuizAttempt` / `QuizAnswer`
   dans `app/models/` — vérifie en particulier : (a) `question_type` est-il un
   enum PostgreSQL ou un varchar ? (b) quelles sont les valeurs réelles de
   `Quiz.status` ? Ces deux réponses conditionnent la migration ;
7. `app/prompts/` — le pattern de versionnement (`*_PROMPT_VERSION`) et le
   `FakeLLMProvider` (tu devras l'étendre) ;
8. Le helper `award_xp` (module gamification) — signature réelle ;
9. Le préfixe `/api/student` et sa règle d'accès (routes élève de la page
   Cours, étape « lecture élève ») — même mécanique pour les routes quiz élève.

## Objectif

Un moteur de quiz unifié (fin de cours en premier client) : Papa génère un quiz
depuis le cours validé d'une leçon (moteur **local**, formats choisis par le
générateur), chaque question passe une auto-vérification à l'aveugle, Papa peut
inspecter/éditer/ajouter/retirer/régénérer/supprimer, Massimo passe le quiz
question par question avec correction serveur immédiate (sans jamais recevoir
les clés), le résultat alimente la maîtrise avec un poids « signal faible » et
crédite l'XP.

## Ordre de travail (commit unique à la fin, mais avance dans cet ordre)

### 1. Migration (légère — la seule)

- `quiz_questions` : + `source` (`generated` | `manual`, non nul, défaut
  `generated`), + `status` (`active` | `retired`, non nul, défaut `active`).
- Extension des types de question : `mcq_multi`, `true_false`, `cloze`,
  `numeric` (modalité selon ta vérification du point 6 ci-dessus : varchar =
  rien en base, enum DB = `ALTER TYPE`).
- `short_answer` reste une valeur légale mais le générateur ne l'émet plus
  (ADR-0014 Décision 4).

### 2. Correction déterministe (`app/modules/quizzes/correction.py`)

- Sept correcteurs en **fonctions pures** sans I/O :
  `(answer_json, correct_answer_json) -> bool` pour `mcq`, `mcq_multi`
  (tout-ou-rien), `true_false`, `cloze`, `numeric`, `ordering`, `matching`.
- Normalisation partagée pour `cloze`/`numeric` : casse, accents
  (décomposition NFD), espaces superflus, tolérance numérique (`3,14` ≡
  `3.14`). Périmètre strict V1 : nombre, mot, date — pas d'unités ni de
  fractions.
- **Écris les tables de tests unitaires AVANT le service de correction** :
  chaque correcteur, cas nominaux + cas limites (accents, casse, virgule
  décimale, ordre partiel faux, association incomplète).

### 3. Module `app/modules/quizzes` (schemas / service / router)

**Génération** — `POST /api/lessons/{lesson_id}/quizzes/generate`
(`require_parent`), corps `{ count: 5 | 8, difficulty: 1 | 2 | 3 }` :

- 409 si la leçon n'est pas `validated` ou n'a pas de `content_markdown`
  (message `detail` explicite) ;
- substrat : `resolve_canonical_context` / `build_canonical_sections` ;
  les notions cibles viennent des `LessonSkill` de la leçon — **une question
  = un `skill_id`**, question sans notion résolue = rejetée au parsing ;
- prompt versionné `app/prompts/quiz.py` (`QUIZ_PROMPT_VERSION = "v1"`) :
  le mix de formats est décidé par le générateur (règles DANS le prompt :
  formats adaptés au contenu, variété obligatoire, vrai/faux jamais
  majoritaire, 2-3 bonnes réponses max en `mcq_multi`, distracteurs =
  erreurs plausibles d'élève de 4e, `explanation_markdown` obligatoire et
  bienveillant — vocabulaire CLAUDE.md, jamais « faux »/« échec ») ;
- pipeline ADR-0007 : validation Pydantic stricte → 1 réparation → échec 502
  avec `detail` ; moteur **local** via `get_provider` — jamais le chemin
  cloud `curriculum_*` ;
- **auto-vérification (Décision 5)** : chaque question générée est resoumise
  au modèle À L'AVEUGLE (énoncé + choix, sans la clé) ; si sa réponse diverge
  de la clé annoncée, la question est écartée (jamais persistée) ;
- persistance : `Quiz` (`quiz_type='mission'`, rattaché leçon/matière —
  vérifie comment lier proprement la leçon : colonne existante ou
  `chapter_id` + convention, signale si rien ne convient), `QuizQuestion`
  (`source='generated'`, `status='active'`, `difficulty` rempli) ;
- trace `ai_jobs` (`job_type="quiz_generate"`) avec, dans `output_json` :
  `lesson_id`, `lesson_title`, `questions_generated`, `questions_discarded`
  (le taux d'écart est l'indicateur de santé de la page Papa) ;
- **0..N quiz par leçon** : régénérer ≠ générer un deuxième (deux routes).

**CRUD Papa** (`require_parent`) :

- `GET` quiz par leçon et par matière (avec compteurs, statut, taux d'écart) ;
- `GET /quizzes/{id}` version Papa : questions AVEC clés et explications ;
- `PATCH /quiz-questions/{id}` (énoncé, choix, clé, explication) — **toute
  édition bascule `source='manual'` côté serveur** (règle de service, pas
  une option du client) ;
- `POST /quizzes/{id}/questions` — question manuelle (`source='manual'`,
  validée d'office) ;
- `POST /quiz-questions/{id}/retire` — `status='retired'` : sort des tirages,
  les `quiz_answers` passées restent intactes ;
- `POST /quizzes/{id}/regenerate` — remplace les questions `generated`
  actives, **préserve les `manual`** (règle des chapitres appliquée aux
  questions), re-trace `ai_jobs` ;
- `DELETE /quizzes/{id}` — hard delete si aucune tentative, sinon
  **archivage** (utilise le `status` réel du modèle `Quiz`) : l'historique de
  maîtrise n'est jamais effacé.

**Flux élève** (préfixe `/api/student`, rôle child inclus — filtrage serveur) :

- `GET /student/quizzes/{subject_slug}` : quiz des leçons `validated` de
  l'année active, questions `active` uniquement, **SANS `correct_answer_json`
  ni `explanation_markdown`** — le schéma Pydantic de sortie ne contient
  physiquement pas ces champs (pas un simple oubli de sérialisation) ;
- `POST /student/quizzes/{id}/attempts` — démarre une tentative ;
- `POST /student/quiz-attempts/{id}/answers` — corps
  `{ question_id, answer_json }` : le serveur corrige CETTE réponse
  (correcteur du format) et renvoie `{ is_correct, explanation_markdown }` —
  c'est le feedback immédiat ; la clé elle-même n'est jamais renvoyée ;
  écrit le `QuizAnswer` ;
- `POST /student/quiz-attempts/{id}/complete` — score global + par notion,
  applique le scoring pondéré, crédite l'XP (`award_xp`, +30, raison
  `quiz_completed`), renvoie un résumé bienveillant (forces / « à revoir
  bientôt » — jamais de vocabulaire d'échec).

### 4. Scoring pondéré (Décision 6 — fonction pure testée)

- `apply_quiz_result(context, per_skill_scores, ...) -> effets` :
  - `mission` (fin de cours) : ajuste la confiance de `skill_mastery`,
    **n'ouvre JAMAIS de `Gap`** (invariant testé) ;
  - `revision` : stub explicite (`NotImplementedError` documenté ou no-op
    tracé) — branchement SRS en Phase 7 ;
  - `diagnostic` : NE PAS brancher ici — le module diagnostics reste tel
    quel, la fonction documente juste que ce contexte est servi ailleurs.

### 5. FakeLLMProvider + tests d'intégration

- Étendre le fake : quiz déterministe multi-formats (au moins un exemplaire
  de chaque format du Lot 1) + réponses d'auto-vérification (prévoir un cas
  où le fake diverge volontairement → la question doit être écartée).
- Tests attendus (en plus des tables de correcteurs) :
  - génération : quiz persisté, une notion par question, trace `ai_jobs`
    complète avec compteurs ;
  - auto-vérification : la question divergente du fake n'est pas persistée ;
  - 409 leçon non validée / sans cours ;
  - **test-verrou zéro fuite** : la réponse student ne contient ni clé ni
    explication (inspection du JSON brut, pas seulement du schéma) ;
  - flux tentative complet : answers → feedback correct/incorrect →
    complete → score + XP crédité ;
  - édition → `source='manual'` ; régénération → `manual` préservées,
    `generated` remplacées ;
  - retrait → question absente des tirages student, `quiz_answers` intactes ;
  - suppression : hard sans tentative, archivage avec ;
  - invariant : contexte `mission` n'ouvre aucune `Gap` même à 0 %.

## Hors périmètre strict

Frontends (Massimo et Papa — slices dédiées avec maquettes validées) ; format
`open` et jugement LLM (Lot 2) ; génération en lot ; contexte `revision` réel
(stub) ; refactor du module diagnostics ; difficulté adaptative ; contraintes
de formats par matière ; toute migration au-delà des deux colonnes + enum.

## Si tu es bloqué

Écarts probables : (a) pas de colonne propre pour lier `Quiz` à une leçon —
propose la plus petite option (colonne nullable `lesson_id` vs convention
`chapter_id`+titre) et ATTENDS validation avant de migrer ; (b) `Quiz.status`
n'a pas de valeur d'archivage — signale les valeurs réelles et propose ;
(c) la signature d'`award_xp` ou du provider diffère de ce prompt — le code
réel fait foi, adapte et signale. Toute autre divergence : signale avant de
coder.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé : `feat(quizzes): unified quiz engine — generation from
canonical course, self-check pass, deterministic correction, Papa CRUD,
student attempt flow (ADR-0014 lot 1)`
