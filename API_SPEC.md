# API_SPEC.md — Spécification API ZETIS

## Style général

API REST JSON via FastAPI.

Préfixe recommandé : `/api/v1`.

## Auth

### POST `/auth/login`

Entrée :

```json
{
  "email": "papa@example.com",
  "password": "..."
}
```

Sortie :

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "name": "Papa",
    "role": "parent"
  }
}
```

### POST `/auth/refresh`

Renouvelle le token.

### POST `/auth/logout`

Invalide la session.

## Health

### GET `/health`

Sortie :

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## Utilisateurs

### GET `/me`

Retourne l’utilisateur courant.

### GET `/students/current`

Retourne le profil Massimo pour le MVP.

## Années scolaires

### GET `/school-years`

Liste les années scolaires.

### POST `/school-years`

Crée une année scolaire.

### GET `/school-years/{id}`

Détail.

### PATCH `/school-years/{id}`

Met à jour.

## Matières

### GET `/subjects`

Liste des matières.

### GET `/subjects/{slug}`

Détail matière.

### GET `/subjects/{slug}/overview`

Vue enrichie pour page matière :

```json
{
  "subject": {},
  "current_chapter": {},
  "missions": [],
  "mastery": {},
  "recent_lessons": [],
  "next_reviews": []
}
```

## Référentiel de programme (curriculum)

Préfixe réel : `/api`. Génération et édition = **Papa uniquement** (`require_parent`).
Deux passes descendantes (ADR-0009) : passe 1 chapitres, passe 2 leçons + notions
(upsert `Skill`) ; co-construction par nœud (`source`/`validation_status` pour les
chapitres, `created_by`/`status` pour les leçons). Tâches `curriculum_*` routées vers le
cloud (dérogation ADR-0009, `claude-sonnet-5`) → **503** explicite sans clé ; la rédaction
de cours reste **locale**. Contrat de types : `packages/types/src/curriculum.ts`.

### Lecture de l'année active

#### GET `/school-years/active/subjects`

Année active + `school_year_subject_id` de chaque matière (clé des routes chapitres).

### Passe 1 — chapitres

#### POST `/school-year-subjects/{id}/generate-chapters`

Génère les chapitres d'une matière (IA, `pending` à valider). Requête longue (~10-30 s).

#### GET `/school-year-subjects/{id}/chapters`

Liste des chapitres de la matière (ordonnés).

#### POST `/school-year-subjects/{id}/chapters`

Ajout manuel Papa → `source=manual`, validé d'office.

#### POST `/school-year-subjects/{id}/chapters/reorder`

Réordonne (liste complète ordonnée des ids → `sort_order`).

#### POST `/school-year-subjects/{id}/chapters/validate-all` · POST `/school-years/active/chapters/validate-all`

Validation par lot des `pending` (matière, ou toute l'année active).

#### POST `/chapters/{id}/lessons/validate-all`

Validation par lot des leçons `draft` d'un chapitre. Sortie `{ "validated_count": n }`.

Seules les `draft` sont touchées : une leçon déjà validée n'est **pas** re-tamponnée (écraser
un `validated_by='parent'` par `parent_bulk` perdrait l'information qu'elle a été relue), une
`archived` reste écartée. Provenance `parent_bulk` sans exception (addendum ADR-0011 §F.3).

#### PATCH `/chapters/{id}` · DELETE `/chapters/{id}`

Édition (nom/description/période + action `validate`/`reject`) · suppression.

### Passe 2 — leçons + notions

#### POST `/chapters/{id}/generate-lessons`

Génère les leçons + notions d'un chapitre **validé ou manuel** (sinon 409) ; upsert des
notions en `Skill`. Requête longue.

#### POST `/chapters/{id}/extend-lessons`

Complète sans rien supprimer (existant injecté au prompt, doublons de titre écartés).

#### GET `/chapters/{id}/lessons` · POST `/chapters/{id}/lessons` · POST `/chapters/{id}/lessons/reorder`

Liste · ajout manuel (validé d'office) · réordonnancement.

#### PATCH `/lessons/{id}` · DELETE `/lessons/{id}`

Édition (titre/résumé/notions — remplace le rattachement ; `content` — édition manuelle
du cours, statut inchangé) · suppression.

#### POST `/lessons/{id}/validate` · POST `/lessons/{id}/reject`

`draft` → `validated` / `archived` (409 sinon).

#### POST `/lessons/{id}/generate-content`

Rédige le cours markdown (moteur **local**, ~40-60 s). Repasse la leçon en `draft`
(gate du cours canonique, addendum ADR-0009 : un cours réécrit non relu ne doit pas
alimenter les dérivés ni Massimo avant revalidation). 409 si archivée.

### Rattrapage « skills-only » (niveau antérieur, ADR-0010)

#### POST `/curriculum/skills-backfill/generate`

Corps `{ subject_id, level }` (`level` ∈ cycle 4, sinon **400**). Enchaîne les passes
1+2 **en mémoire** (rien de persisté) → prévisualisation des notions groupées par
chapitre d'échafaudage + `failed_scaffolds`. 503 sans clé cloud.

#### POST `/curriculum/skills-backfill/confirm`

Corps `{ subject_id, level, notions: [{ scaffold_chapter, name }] }`. Upserte les notions
en `Skill` au niveau cible (aucune leçon ni liaison). Idempotent → `{ created, existing }`.

### Lecture élève (cours de Massimo)

Préfixe `/api/student`, tout utilisateur authentifié (rôle child inclus) — le serveur ne
sert **que du validé** (ADR-0009 §9).

#### GET `/student/cours/{subject_slug}`

Chapitres validés de l'année active + leçons validées (référence légère).

#### GET `/student/lessons/{id}/cours`

Cours (markdown) d'une leçon validée — 404 indiscernable sinon (aucune fuite des brouillons).

### Notions validées (entrée ELI5 v2 par decks matières)

Routes **neutres** (pas de préfixe `/eli5/` — d'autres dérivés les consomment), lecture
seule, même chaîne de filtrage que les cours élève (chapitre `validated` → leçon
`validated` → `LessonSkill` → `Skill`). Types : `packages/types/src/curriculum.ts`.

#### GET `/student/notions/summary`

Compteur de notions validées par matière de l'année active (une requête agrégée, pas de
N+1) → `{ subjects: [{ slug, name, notion_count, new_count }] }`. Une matière sans rien de
validé apparaît à `0/0` (front : deck « bientôt »), jamais filtrée. `new_count` = notions
dont une leçon validée porteuse a été créée dans les 7 derniers jours (deck « ✨ new »,
récence de création — `Skill`/`Chapter` n'ayant pas d'horodatage, le signal vient de
`Lesson.created_at`).

#### GET `/student/subjects/{subject_slug}/notions`

Notions validées d'une matière, **dédupliquées par `skill_id`** →
`{ subject: { slug, name }, notions: [{ skill_id, name, chapter_title }] }`. `chapter_title`
= chapitre de la leçon validée la plus récente qui enseigne la notion ; tri : ordre des
chapitres (`sort_order`) puis nom. **404** si la matière est inconnue ou hors année active ;
`notions: []` (pas 404) si la matière existe mais n'a rien de validé.

## Diagnostic

Préfixe réel : `/api/diagnostics`. Implémenté à l'étape 14 (Phase 4) sur les tables
`quizzes`/`quiz_questions`/`quiz_attempts`/`quiz_answers` (un diagnostic = un `quiz`
de `quiz_type = diagnostic`). Les QCM sont générés par IA, par notion.

> 🔴 **Gate de relecture depuis l'ADR-0043.** Un diagnostic naît `validation_status = 'pending'` et
> **aucune des trois routes élève ne le sert** tant que Papa ne l'a pas relu — ni la liste, ni
> l'accès direct par identifiant, ni la soumission. Elles rendent `404` (pas `403`) : pour Massimo,
> un diagnostic non relu n'existe pas. Il apparaît en attendant dans `/api/parent/review-queue`,
> sous la famille `diagnostic`.
>
> **Les rôles sont exigés** : `require_parent` sur `generate`, `results`, `validate` et `reject` ;
> `require_child` sur `submit`. Protéger l'entrée en laissant la sortie ouverte ne protégerait rien
> — `submit` écrit `skill_mastery` et ouvre des `Gap`, avec un signal fort.

### GET `/diagnostics/subjects`

Matières disponibles pour lancer un diagnostic : `[{ id, name }]`.

### POST `/diagnostics/generate` (Papa)

Génère un diagnostic (QCM par notion) pour une matière. Corps : `{ subject_id, level? }`.

⚠️ **Rend `202` — accepté, pas exécuté** (ADR-0041 §4) : la réponse est un `{ job_id, … }`, et le
corps d'autrefois (`quiz_id`, `subject`, `questions_count`) est la **sortie du travail**, lisible
dans `output` quand il est `succeeded`. Le `404` « matière introuvable » reste **synchrone** : la
file diffère le travail, jamais le verdict sur la demande. Trace `ai_jobs`
(`diagnostic_generate`).

### GET `/diagnostics/quizzes` (Massimo)

Liste les diagnostics **relus** :
`[{ quiz_id, title, subject, subject_slug, questions_count, taken_at, last_attempt_id, measured_at }]`.

Depuis l'ADR-0044 §6, le contrat porte de quoi **hiérarchiser** la liste, sans aucune migration :

- `subject_slug` — sans lui le front recode les matières en dur (`CLAUDE.md`) ;
- `measured_at` (ISO ou `null`) — la mesure la plus récente parmi les notions **de ce
  diagnostic**, jamais de sa matière. `null` = aucune de ses notions n'a jamais été mesurée.
  Porte le tri de la page : il regarde l'**âge** d'une mesure, jamais son **résultat** ;
- `taken_at` (ISO ou `null`) et `last_attempt_id` — la dernière passation terminée, tous deux issus
  de la **même** ligne, donc incapables de se contredire.

⚠️ **`taken: bool` a été REMPLACÉ par `taken_at`** — il reste dérivable (`taken_at !== null`), et
deux sources pour un même fait est une divergence en attente.

Aucun tri serveur : l'ordre reste `quiz_id` décroissant, la hiérarchisation se fait côté client
(ADR-0044 §2 — il n'y a ici aucun score à retenir, contrairement à l'élection des missions).

### GET `/diagnostics/quizzes/{id}` (Massimo)

Questions à passer — **sans** la bonne réponse :
`{ quiz_id, title, subject, questions: [{ id, prompt, choices, skill_id, skill_name }] }`.
`404` si le diagnostic n'est pas relu.

### POST `/diagnostics/quizzes/{id}/submit` (Massimo)

Corps : `{ answers: [{ question_id, choice_index }] }`. Corrige, écrit la tentative,
met à jour la maîtrise et ouvre les lacunes. Réponse :
`{ attempt_id, quiz_id, subject, score_percent, per_skill: [{ skill_id, skill_name, score, status }], gaps: [{ skill_id, skill_name, severity }], strengths: [..] }`.
`404` si le diagnostic n'est pas relu.

### POST `/diagnostics/quizzes/{id}/validate` · `/reject` (Papa)

Verdict de relecture — la **soupape** du gate. Sans elle, un diagnostic resterait `pending` à vie
et Massimo n'en recevrait plus aucun. Réponse : `{ quiz_id, validation_status }`.

Un diagnostic validé porte `validated_by = 'parent'`, **jamais** la provenance de doctrine. Un
diagnostic rejeté sort de la file **sans** devenir servable ; rien n'est effacé (ADR-0014 §3).

Convention reprise de `fiches` (`/{id}/validate`, `/{id}/reject`) — la file de relecture
(`reviewActions.ts`) n'est qu'une table d'aiguillage vers le client de chaque famille.

### GET `/diagnostics/apercu` (Papa)

Le **bandeau, le rail et les matières jamais mesurées**, en un appel. Borné à l'**année active**,
comme la Couverture et la file de relecture.

🔴 **Aucune autre route ne peut le servir**, et c'est une conséquence du gate : `/diagnostics/quizzes`
ne rend que le `validated` — c'est la route de Massimo — alors que le rail a besoin du **premier
cran**, celui que Massimo ne voit pas encore.

- `rail[]` — une entrée par **tentative** au 3ᵉ cran, une par **quiz** aux deux premiers.
  `cran` ∈ `genere | propose | passe`. `score_percent` est **`null` hors du 3ᵉ cran, jamais `0`**.
  `rang` numérote la passation **dans sa matière** (1ʳᵉ, 2ᵉ…). Un diagnostic `rejected` en sort.
- `jauges.plus_ancienne_lecture` — la mesure la plus ancienne **encore invoquée** : pour chaque
  matière on garde la plus récente, puis on prend la plus vieille de celles-là. Ce n'est **pas** la
  plus vieille du dépôt, qu'une passation postérieure aurait déjà remplacée.
- `jauges.lots_declenches` — **toujours `0`, par décision** (`trigger='evidence'` reste fermé).
  Servi plutôt que déduit, pour que la page rende un vide voulu et non un compteur de panne.
- `subjects[].a_un_diagnostic` — les matières sans diagnostic restent servies, **atténuées** à
  l'écran : leur absence est l'information.

### GET `/diagnostics/results` (Papa)

Derniers diagnostics passés (⚠️ `limit=10` en dur), score par notion + lacunes ouvertes.

**`per_skill[]`** porte `questions_count` — le **grain** de la mesure (ADR-0043 Décision 3).
`QUESTIONS_PER_SKILL` est passé de 2 à 5, mais **seulement pour les passations futures** : la
granularité du dépôt est **mixte pour toujours**, et un score de 50 % ne dit pas la même chose
selon qu'il porte sur 2 ou 5 questions. Le champ existe pour que la page le dise au lieu de le
taire.

🔴 **`gaps[]` est LU en base** (`gaps`, `source='diagnostic'`, `OPEN_GAP_STATUSES`), il n'est plus
recalculé depuis les réponses de la passation. Une lacune résolue cesse donc de s'afficher.
⚠️ **Ce que le champ veut dire a changé** : une `Gap` est clé sur `(student, skill)`, jamais sur une
tentative — « les lacunes de cette passation » n'existe pas en base. Ce qui est servi, ce sont *les
lacunes ouvertes **aujourd'hui** sur les notions que cette passation a mesurées*. Une lacune ouverte
par un diagnostic antérieur apparaît donc sur la ligne d'un diagnostic plus récent qui remesure la
même notion.

### GET `/diagnostics/results/{attempt_id}` (Papa)

Le détail d'**une** passation, même contrat qu'une ligne de `/results`. Il n'en existait aucun : le
panneau devait retrouver sa passation parmi les dix servies, et au-delà elle était inaccessible.

`404` si la passation n'existe pas, n'est pas un diagnostic, ou n'est pas celle de cet élève.

### GET `/diagnostics/portee?subject_id=` (Papa)

**La portée** — `results` transposé : par **notion** au lieu de par passation.

```jsonc
{
  "subject_id": 2, "subject": "Mathématiques",
  "attempts": [ { "attempt_id": 7, "completed_at": "…", "score_percent": 55 } ],  // du PLUS ANCIEN au plus récent
  "notions": [ {
    "skill_id": 12, "skill_name": "Nombres relatifs",
    "points": [ { "attempt_id": 7, "score": 50, "questions_count": 2 }, null, { … } ],
    "delta": 30                                    // dernière mesure − première, en points
  } ]
}
```

- `attempts` **indexe `points` position par position** : la page n'a aucun appariement à refaire.
- 🔴 **`null` = notion non mesurée** par cette passation, **jamais** la valeur précédente reportée.
  Reporter dessinerait un palier plat que personne n'a mesuré, et un palier plat se lit « rien n'a
  bougé » — l'exact contraire de « on n'a pas regardé ».
- 🔴 **Seules les notions mesurées au moins deux fois sortent.** Un point ne fait pas une pente ; à
  une seule passation, `notions` est vide et la page remplace la portée par son absence expliquée.
- `subject_id` est **obligatoire** : une portée toutes matières mélangerait des notions qui ne se
  comparent pas (et l'`adr-0028 §9` interdit déjà le classement de matières).

> Reporté : `generate-missions` (remédiation depuis les lacunes), diagnostic
> multi-matières en une session, difficulté adaptative.

## Quiz — moteur unifié (ADR-0014, Lot 1)

Quiz de fin de cours (`quiz_type = mission`), premier client du moteur, **deuxième client du
substrat canonique** (ADR-0011). Génération **locale** depuis le cours validé d'une leçon,
**auto-vérification à l'aveugle** (question dont le modèle ne retrouve pas la clé → écartée),
**correction déterministe serveur** (7 formats). Asymétrie stricte : côté élève, ni
`correct_answer_json` ni `explanation_markdown` (sauf le feedback immédiat après réponse).

### Génération & CRUD — Papa (`require_parent`)

- **POST `/api/lessons/{lesson_id}/quizzes/generate`** — corps `{ count: 5|8, difficulty: 1|2|3 }`.
  409 si la leçon n'est pas `validated` / sans cours. Trace `ai_jobs` (`quiz_generate` :
  `questions_generated`/`questions_discarded`). Réponse `{ quiz_id, lesson_id, questions_generated,
  questions_discarded }`. 0..N quiz par leçon (régénérer ≠ créer).
- **GET `/api/lessons/{lesson_id}/quizzes`** · **GET `/api/subjects/{slug}/quizzes`** — inventaire
  (compteurs, statut, taux d'écart).
- **GET `/api/quizzes/{id}`** — vue Papa : questions **avec** clés et explications.
- **POST `/api/quizzes/{id}/regenerate`** — remplace les questions `generated`, **préserve les `manual`**.
- **PATCH `/api/quiz-questions/{id}`** — toute édition bascule la question en `source='manual'`.
- **POST `/api/quizzes/{id}/questions`** — ajoute une question manuelle. **POST
  `/api/quiz-questions/{id}/retire`** — `status='retired'` (hors tirages, réponses conservées).
- **DELETE `/api/quizzes/{id}`** — hard delete si aucune tentative, sinon archivage.

### Pilotage — page Papa « Quiz — pilotage » (`require_parent`)

- **GET `/api/quiz-pilotage/overview`** — KPI globaux + santé de l'auto-vérification par matière.
- **GET `/api/quiz-pilotage/subjects/{id}`** — leçons validées + leurs quiz (leçons sans quiz incluses).

### Flux élève — Massimo (`/api/student`, filtrage serveur, jamais la clé)

- **GET `/api/student/quiz-subjects`** — grille des matières + nombre de quiz (0 → grisée).
- **GET `/api/student/quizzes/{subject_slug}`** — quiz jouables (questions actives, **sans** clé
  ni explication) ; chaque quiz porte `lesson_id`.
- **GET `/api/student/quiz/{quiz_id}`** — un quiz jouable par id (même charge que ci-dessus, sans
  clé). Entrée du **quiz de mission** (`QuizMissionModal`) : le runner lance ensuite une tentative
  dont le `context` vaut `quiz_type = "mission"` → preuve d'étape quiz.
- **POST `/api/student/quizzes/{id}/attempts`** — démarre une tentative.
- **POST `/api/student/quiz-attempts/{id}/answers`** — corps `{ question_id, answer_json }` :
  correction serveur, renvoie `{ is_correct, explanation_markdown, criteria?, ambiguous }` (jamais
  la clé). Format `open` (Lot 2) : **jugement LLM local** critère par critère (résultat structuré
  dans `quiz_answers.ai_evaluation_json`) — bénéfice du doute si le juge n'est pas sûr (élève
  crédité, ambiguïté remontée à Papa), feedback toujours bienveillant.
- **POST `/api/student/quiz-attempts/{id}/complete`** — score global + par notion, scoring pondéré
  (`mission` = signal faible, jamais de `Gap`), **XP = base d'effort + bonus score** (0 %→10,
  100 %→30), résumé bienveillant `{ score_percent, xp_awarded, per_skill, strengths, to_review }`.

> Le format `open` (Lot 2) est **livré** : question ajoutée par Papa (opt-in manuel, critères
> obligatoires), jugée par le LLM local à la réponse. Reste reporté : génération en lot,
> contextes `revision`/`capsule_post_test` réels (scoring en stub).

## Fiches — révision (ADR-0015)

Fiche de révision d'**une leçon** (« 1 leçon = 1 page »), **dérivée du cours canonique** (ADR-0011 :
force le cours de la leçon + complément RAG, comme le quiz de fin de cours). `FicheSpec` à
**budgets** (miroir Pydantic strict : `essentiel` ≤ 600, `definitions` ≤ 4, `points_cles` ≤ 5,
`erreurs_a_eviter` ≤ 3, `mini_exemple` ≤ 400). Une fiche invalide n'est **jamais** persistée
(1 réparation puis erreur). Trace `ai_jobs` `fiche_generate`.

### Génération & CRUD — Papa (`require_parent`)

- **POST `/api/fiches/generate`** — corps `{ lesson_id }`. 404/409 si la leçon n'est pas `validated`
  / sans cours. Renvoie la fiche `pending`.
- **PUT `/api/fiches/{id}`** — corps `{ spec }` : **revalidation** du `FicheSpec` → repasse `pending`.
- **POST `/api/fiches/{id}/regenerate`** — régénère (écrase le spec) → `pending`.
- **POST `/api/fiches/{id}/validate`** — `pending → validated` (visible côté Massimo).
- **POST `/api/fiches/{id}/reject`** — `pending → rejected` (adr-0039). **Rejeter n'est pas
  supprimer** : la fiche reste en base, régénérable. Aucune provenance écrite — `validated_by` dit
  QUI a laissé passer, personne n'a rien laissé passer.
- **DELETE `/api/fiches/{id}`**.
- **GET `/api/fiches/lessons/{lesson_id}`** — fiches d'une leçon (tous statuts).
- **GET `/api/fiches/pilotage/{subject_id}`** — arbre matière → leçons validées → leurs fiches
  (leçons sans fiche incluses ; miroir de `quiz-pilotage`).

### Flux élève — Massimo (`/api/student`, gate `validated`, 404 sinon)

- **GET `/api/student/fiches/summary`** — grille de decks : compteur de fiches `validated` +
  `new_count` (jamais ouvertes) par matière de l'année active.
- **GET `/api/student/subjects/{slug}/fiches`** — deck d'une matière (fiches `validated`, `seen`).
- **GET `/api/student/fiches/{id}`** — la fiche (spec complet) ; **404** si non `validated`.
- **POST `/api/student/fiches/{id}/seen`** — marque la fiche vue (retrait du badge « nouveau »).

> Le viewer Massimo affiche le cours source **à côté** de la fiche (bouton « Voir le cours »,
> réutilise `GET /api/student/lessons/{id}/cours`) et exporte la fiche en **image A5** (PNG) /
> impression A5. Le pilotage Papa édite le `FicheSpec` via un **formulaire structuré**.

## Missions

Préfixe réel : `/api/missions`. Sur les tables `missions`/`mission_steps` + `gaps` +
`xp_events`. Une mission de remédiation porte `mission_type = remediation` et des étapes
`step_type` alignées ADR (`eli5` → `vocal_explain` → `quiz`), chacune ciblant un `resource_id`
(skill pour eli5/vocal_explain, quiz pour quiz).

**ADR-0017 lot 1 — preuves serveur + verdict.** La complétion déclarative de l'étape 15
(`POST /missions/{id}/complete`) est **retirée**. Une étape ne se valide que si sa **preuve**
existe côté serveur, **postérieure au `start`** et **dans l'ordre** (`sort_order`). Toute mission
générée naît `validation_status = pending` : le gate `validated` est **dans la requête** des
routes student (une mission `pending` est invisible, y compris par id → 404).

**ADR-0017 lot 2 — sources, sélecteur, pilotage.** `mission_type` est un vocabulaire fermé
orienté **source** (`remediation | revision | progression | manual`). Le sélecteur de la mission
du jour est un **scoring déterministe versionné** (`MISSION_SCORING_VERSION`, zéro LLM). Frontière
stricte (§3) : **deux schémas, deux routers** — `MissionStudentOut` (Massimo, sans scores) et
`MissionPilotOut` (Papa, sur-ensemble : `validation_status`, `generation_reason`, preuves brutes).

### Frontière student (Massimo)

- **GET `/missions`** → `[MissionStudentOut]` (validées de l'élève). `MissionStudentOut = { id,
  subject, skill_id, skill_name, title, description, mission_type, status, priority,
  estimated_minutes, xp_reward, steps: [{ id, step_type, instruction, resource_id, sort_order,
  status }] }`. `estimated_minutes` (durée estimée dérivée des étapes) + `xp_reward` (XP d'effort
  constant) = **affichage enfant, aucun score**. ⚠️ **Aucun champ d'auteur** : `origin`
  (`papa`/`zetis`) a été **retiré le 2026-08-02** — il était rendu tel quel par la page Missions
  (« 👤 par Papa » / « 🤖 par ZETIS »). Une seule voix côté Massimo : le contenu scolaire l'atteint
  dans la voix de ZETIS, quel que soit son producteur réel, pour que cette voix tienne le jour où
  ZETIS produira seul. `created_by` reste en base et sur `MissionPilotOut` (**pilot-only**,
  frontière §3) ; un test-verrou interdit le retour de tout champ d'auteur côté élève.
  Le client marque « ✨ new » les missions `status="planned"`. **L'ordre des étapes (`sort_order`) dépend du
  type** (§5 amendé) : `progression` = découverte d'abord (`eli5 → vocal_explain → [mindmap] →
  [quiz]`) ; `remediation`/`revision` = **rappel d'abord** (`[mindmap] → [quiz] → eli5 [→ vocal]`).
- **GET `/missions/today`** — **contrat cassant** (ex-liste) : `{ elected: MissionStudentOut | null,
  reason, reason_code, scoring_version, alternatives: [MissionStudentOut] (≤2) }`. `reason` est une
  **phrase template** figée choisie par le facteur dominant (jamais de LLM) ; `elected: null` =
  état serein « Tu n'as rien d'obligatoire maintenant ».
- **POST `/missions/{id}/start`** → `MissionStudentOut` (`planned → active`, idempotent, horodate
  `started_at`).
- **POST `/missions/{id}/steps/{step_id}/complete`** → `{ mission_status, verdict, xp_awarded }`.
  Preuve par `step_type` (**409** si absente / antérieure au start / hors ordre) ; dernière étape
  → **XP +50 inconditionnel** + verdict (`acquired` si reverse ≥ `MISSION_REVERSE_THRESHOLD` ET
  quiz ≥ `MISSION_QUIZ_THRESHOLD` → mastery↑, lacune `resolved` ; sinon `review_later` → mastery
  honnête, lacune `in_progress`, carte SRS (re)programmée). Trace `LearningEvent` `mission_verdict`.
- **GET `/missions/completed-today`** → `[{ mission_id, title, subject, verdict, xp }]` — missions
  terminées aujourd'hui + verdict (deux issues positives) + XP, relues des `LearningEvent`
  `mission_verdict` du jour. **Aucun score brut** (reverse/quiz/mindmap restent Papa — frontière §3).

> Exécution frontend (`page-missions.md`) : chaque activité s'ouvre **EN MODALE in-page**
> (`ActivityModal`) ; la preuve est produite dans la modale et l'étape validée aussitôt — pas de
> redirection ni de marqueur de retour. Le quiz de mission par id se lit via
> **GET `/api/student/quiz/{quiz_id}`** (§Quiz).

### Frontière pilotage (Papa) — `MissionPilotOut`

- **POST `/missions/generate-remediation` · `/generate-revision` · `/generate-progression`** →
  `{ created, missions }`. Générateurs idempotents par source, missions `pending`. `revision` =
  **une mission par notion due** (mono-notion, top-N par retard `MISSION_REVISION_TOP_N` ;
  `[mindmap] → [quiz] → eli5`) — jamais groupée par matière (le verdict d'acquisition est
  mono-notion, ADR-0017 §5) ; `progression` = prochaine notion non maîtrisée d'un chapitre actif
  ou rattrapage jamais travaillé (`eli5 → vocal_explain → quiz`).
- **GET `/missions/pending`** → `[MissionPilotOut]` (avec `generation_reason`).
- **POST `/missions/validate`** `{ ids: [int] }` → `{ validated }` (validation en lot).
- **POST `/missions/{id}/reject`** → `{ id, validation_status: "rejected" }`.
- **GET `/missions/election/today`** → `{ elected: MissionPilotOut | null, score, factors: [{ name,
  value, weight, contribution, dominant }], scoring_version, reason, reason_code, alternatives:
  [{ mission, score }] }` — **recalculé à la demande** (déterminisme ⇒ rien à stocker).
- **GET `/missions/pilot?type=&subject=`** → `[MissionPilotOut]` (preuves brutes par étape).
- **GET `/missions/verdicts/recent`** → `[{ mission_id, mission_type, verdict, quiz_score,
  reverse_score, xp, effect, skill_id, subject_id }]`.
- **GET `/missions/pilot/summary`** → `{ pending, pool, completed_this_week, acquired_rate_30d }`.

Facteurs de score (pondérations en config) : `severity` (remediation), `due_pressure` (revision),
`continuity` (progression : chapitre actif vs rattrapage), `variety` (malus si même matière que la
**dernière mission complétée** — proxy déterministe, aucune élection stockée), `forced_priority`
(plancher des `manual`). `Mission.available_from` n'existe pas sur le modèle réel → toutes les
validées `planned|active` sont candidates.

> Reporté (Lot 3) : porte « Commander » (recommandation/échéance/thématique), résolution par
> embeddings, Conseil de classe, croisées automatiques, auto-validation par type.

## Progression

> ⚠️ **Section documentée mais JAMAIS implémentée** (constat du read-before-code ADR-0028,
> 2026-07-31). ⚠️ **Amendée le 2026-08-06** : `GET /progress/skills` **existe désormais** et a
> quitté cette section (voir plus bas). L'avertissement reste et **ne couvre plus que les TROIS
> routes ci-dessous** — le retirer entièrement le rendrait faux pour elles. Les routes de
> progression réellement servies sont `GET /api/parent/progress/gaps`, `/consolidated`,
> `/overview`, `/subjects/{id}/analysis`, `/skills` et `/skills/{id}/timeline`.
> Ce qui manque ici est repris autrement : le résumé global et la progression par matière sont
> servis par `GET /api/parent/dashboard` (agrégat, par matière), et la vue élève par le module
> `galaxy`. Ne pas coder contre cette section.

### GET `/progress/summary?student_id=` — *n'existe pas*

Résumé global.

### GET `/progress/subjects?student_id=` — *n'existe pas*

Progression par matière.

### GET `/progress/xp` — *n'existe pas*

XP global et par matière.

## Gamification

Préfixe réel : `/api/gamification`. Implémenté à l'étape 16 sur la table `xp_events`.
L'XP est crédité aux moments clés (mission +50 — ADR-0017 §5bis, verbalisation ELI5 +10, diagnostic +15).

### GET `/gamification/summary`

Synthèse de progression de l'élève :
`{ total_xp, level, xp_into_level, xp_for_next, regularity, badges: [{ code, label, icon }], recent: [{ amount, reason, created_at }] }`.
Niveau = `total_xp // 100 + 1`. `recent` = les **5 derniers** événements XP, non paramétrable.

> `streak_days` / `active_today` ont été **retirés** avec le streak : ils tombaient à zéro après
> un seul jour manqué. `regularity` (module `motivation`) les remplace — un compte hebdomadaire
> qui ne peut pas casser.

### GET `/gamification/history?days=90` (élève)

Les jours où Massimo a **gagné** du XP, du plus ancien au plus récent. Jour **Europe/Paris**.

```json
{ "days": [{ "date": "2026-07-29", "xp": 60 }, { "date": "2026-07-31", "xp": 120 }] }
```

⚠️ **Les jours sans XP sont OMIS.** Jamais renvoyés à zéro, jamais complétés côté serveur — et
il ne faut **jamais** les reconstruire côté client. Ce n'est pas une optimisation de payload :
c'est le garde-fou de l'addendum ADR-0024 « Accueil vivant » §A. La donnée d'absence **n'existe
pas**, donc aucun consommateur ne peut dessiner une case vide, une grille de présence ou un
« depuis N jours » — le décompte de jours manqués qu'interdit `CLAUDE.md`.

Ce que cette route **ne sert pas**, et ne servira pas : aucune minute, aucune session, aucun
`event_type`. On ne chronomètre pas l'enfant (cf. la doctrine du module `activity`). Et **jamais
d'UNION `xp_events` / `learning_events`** : ce serait un double comptage.

Distinction avec le refus de `motivation` (« un historique d'objectifs manqués serait le streak
déguisé ») : un **objectif** porte un attendu, donc son historique est un relevé d'échecs ; un
**XP** est un gain obtenu, et un jour sans gain n'est pas un jour raté.

Fenêtre bornée serveur : `1 ≤ days ≤ 365`, **422** hors bornes. Consommateur : « Mon ciel » sur
l'Accueil. Aucune table, aucune migration — `xp_events` existe depuis l'étape 16.

## Révision (spaced memory)

Préfixe réel : `/api/student/reviews`. Slice backend implémentée dans le module `memory`
(moteur SRS MVP : intervalles fixes again 1j / hard 3j / good 7j / easy 14j, pas de SM-2).
Routes élève (`get_current_user`, rôle `child`). **La mécanique SRS est invisible** : le
payload ne contient jamais `due_at`, `interval_days` ni `ease_factor`. Plafonds et
entrelacement des matières sont décidés côté serveur.

### GET `/student/reviews/summary`

**Toutes les matières** de l'élève, avec leurs cartes dues agrégées (compteurs exacts, le
« 15+ » est de la présentation) :
`{ subjects: [{ slug, name, due_count, new_count, session_size, has_cards }], total_due,
flash_size, new_count }`.
`has_cards=false` → matière sans carte active : grisée « pas encore de cartes » côté Massimo,
non lançable (l'UI affiche l'emoji de la matière). `has_cards=true` avec `due_count=0` = « à
jour ✓ ». `new_count` = cartes dues jamais révisées (badge « nouveau »).

> **`session_size` (2026-08-01)** = `min(REVIEW_SESSION_MAX_SUBJECT, due_count)` — ce que le deck
> de cette matière servira **réellement**. C'est **CE** nombre qu'une surface enfant affiche.
> `flash_size` ne convenait pas (il est **global**, `min(5, total_due)`), et `due_count` est
> l'**arriéré** — donc la pression quotidienne que `CLAUDE.md` interdit. Le calcul vit là où vit
> la constante : recopier `8` dans un front l'aurait fait mentir le jour où le plafond bouge. Un
> test vérifie que le nombre **annoncé** et le nombre de cartes **servies** sont le même.
>
> La page Révision lit encore `due_count` pour son badge historique ; **aucune nouvelle surface
> ne doit le faire**.

### POST `/student/reviews/session`

Corps `{ deck: "mix_day" | "mix_flash" | { subject: "<slug>" } }`. Renvoie la liste servie
`[{ card_id, subject_slug, front_markdown, back_markdown }]` — plafonnée (mélange 12 /
matière 8 / éclair 5), triée `due_at` croissant, puis entrelacée pour les mélanges.
`400` si le deck matière est inconnu ou sans carte due.

### POST `/student/reviews/cards/{card_id}/attempt`

Corps `{ rating: "again" | "hard" | "good" | "easy" }`. Renvoie
`{ next_due_at, xp_awarded, is_consolidation }`. XP crédité via `award_xp` : +5 par carte
quel que soit le rating, +2 en consolidation. **Consolidation détectée côté serveur** (pas
de flag client) : une carte déjà notée aujourd'hui ⇒ planification inchangée, XP réduit.
`404` si la carte n'existe pas ou n'appartient pas à l'élève (pas de fuite d'existence) ;
`422` si le rating est hors vocabulaire.

## Cartes SRS — pilotage Papa

Préfixe réel : `/api/memory/cards`. Routes **parent** (`require_parent`) de la page Papa
« Cartes de révision » (ADR-0013). Génération 100 % locale (Ollama) ancrée sur le cours
validé de chaque notion ; la validation d'une leçon n'a **aucun** effet de bord (surface
page-driven). Invariant §3 : rafraîchir le CONTENU d'une carte ne touche jamais sa
planification.

- `GET /overview` — KPI globaux + résumé par matière `{ subjects: [{ subject_id, name, active_cards, to_generate, suspended }], totals }`.
- `GET /subjects/{subject_id}` — arbre chapitre → leçon → notion (état + `card_count`, jamais le contenu) + notions suspendues.
- `POST /subjects/{subject_id}/generate` — réconcilie toute la matière (upsert 3 branches A/B/C + suspend les orphelines). **Non destructif** : réécrit le contenu, préserve la planification. Déclenché par « Générer les N » ou « ↻ Régénérer » (même quand `to_generate = 0`). Renvoie `{ subject_id, created, updated, reactivated, pending, suspended, failed_skills }`.
- `POST /skills/{skill_id}/generate` — génération/relance unitaire d'une notion. `{ created, updated, reactivated, pending }`.
- `GET /skills/{skill_id}/cards` — recto/verso des cartes d'une notion (aperçu) `[{ id, card_type, front_markdown, back_markdown, status }]`.
- `POST /skills/{skill_id}/reactivate` — réactive les cartes suspendues (planification intacte) `{ skill_id, reactivated }`.
- `DELETE /skills/{skill_id}` — retire **toutes** les cartes d'une notion + leur historique `{ skill_id, deleted }`.
- `PATCH /{card_id}` — **édite une carte** (recto/verso) ; planification préservée. Renvoie la carte (`CardContent`). `404` si absente. Chemin à un segment (pas de collision avec `/skills/...`).
- `DELETE /{card_id}` — **supprime une carte** unitaire + ses attempts `{ id, deleted }`. `404` si absente.

## ELI5

### POST `/ai/eli5/explain`

Entrée :

```json
{
  "student_id": "uuid",
  "subject_id": "uuid",
  "skill_id": "uuid",
  "question": "Je ne comprends pas les nombres relatifs",
  "mode": "simple"
}
```

Sortie :

```json
{
  "job_id": "uuid",
  "status": "queued"
}
```

Le backend n'accepte qu'un `skill_id` réel (pas de texte libre : la question libre est
résolue côté client contre les skills réels — cf. entrée ELI5 v2). L'explication normalisée
est lue via `GET /ai/jobs/{job_id}` (`output`). Elle inclut `sources_used` (entier) : nombre
de passages de cours (RAG) injectés — `>0` → badge « 📚 D'après ton cours ». Quand un cours
canonique validé a servi (ADR-0011), l'`output` porte aussi `lesson_id`/`lesson_title` →
badge prioritaire « 📚 D'après ta leçon *{titre}* ». L'entrée Massimo (decks matières →
notions) fournit un `skill_id` de notion validée, ce qui déclenche déterministiquement ce
badge leçon.

### POST `/ai/eli5/reverse-evaluate`

Massimo explique à ZETIS.

Entrée :

```json
{
  "student_id": "uuid",
  "skill_id": "uuid",
  "answer_text": "...",
  "input_mode": "text"
}
```

Sortie :

```json
{
  "score": 72,
  "feedback": "...",
  "missing_points": [],
  "next_action": "..."
}
```

## RAG

Préfixe réel : `/api/rag`. Seuls les chunks `validated`/`official` sont récupérés.

### POST `/rag/documents`

Ingère un document **texte** (JSON) en statut `validated` — sources de confiance / seed.
Corps : `{ title, text, subject_id?, source_type?, level?, chapter? }`.
Réponse : `{ document_id, chunks }`. Découpage + embedding faits à l'ingestion.

### POST `/rag/upload`

Ingère un **fichier** de cours (`multipart/form-data` : `file` MD/TXT/PDF + `title?`,
`subject_id?`, `level?`, `chapter?`). Le texte est extrait (pypdf pour le PDF), puis
chunké/vectorisé. La source arrive en statut **`pending`** : invisible du RAG tant
qu'elle n'est pas validée à la main (relecture humaine, cf. CLAUDE.md).
Réponse : `{ document_id, chunks }`. `400` si format non supporté / texte vide.

### POST `/rag/clip`

Capture **texte** envoyée par l'extension `zetis-clip` (page web / sélection, côté Papa).
Corps : `{ title, text, source_url?, source_type?, subject_id?, level?, chapter? }`
(`source_type` def. `web_clip`). Réutilise `ingest_document` : la source arrive en statut
**`pending`** (relecture obligatoire, cf. CLAUDE.md) — une capture web n'alimente jamais
l'IA de Massimo sans validation. `source_url` est conservé dans le contenu (provenance,
sans colonne dédiée). Réponse : `{ document_id, chunks }`. `400` si `text` vide.

### POST `/rag/clip-url`

Import de la **transcription** d'une vidéo (extension `zetis-clip` Lot 2, côté Papa).
Corps : `{ url, title?, subject_id?, level?, chapter? }`. Extraction **côté serveur**
(`youtube-transcript-api`), avec un **fetch sortant borné à une allowlist d'hôtes**
(`youtube.com`, `www.youtube.com`, `youtu.be` — cf. ADR-0006 addendum). Préfère une
transcription humaine à une auto-générée ; **conserve la langue d'origine** (pas de
traduction). Ingestion en statut **`pending`** (`source_type = video_transcript`),
provenance + langue conservées dans le contenu. Réponse : `{ document_id, chunks }`.

`400` avec un `detail` **structuré** `{ code, message }` :
- `unsupported_url` : hôte hors allowlist, schéma non http(s), IP littérale, id introuvable.
- `transcript_unavailable` : transcription désactivée/absente → le client bascule sur le
  repli DOM (scrape du panneau « Transcription ») puis `POST /rag/clip`.

### GET `/rag/documents`

Liste les documents avec leur `validation_status` et leur nombre de chunks.

### POST `/rag/documents/{id}/validate`

Valide une source : passe le document **et ses chunks** en `validated`.
Réponse : `{ document_id, validation_status }`. `404` si introuvable.

### POST `/rag/documents/{id}/reject`

Rejette une source : document + chunks en `rejected` (exclus de la récupération).

### POST `/rag/search`

Recherche contextuelle (top-k cosinus). Corps : `{ query, subject_id?, k? }`.

## Capsules IA

Préfixe réel : `/api/capsules`. Micro-vidéos pédagogiques typées (`CapsuleSpec`)
générées par IA, voix Piper par scène, rendu MP4 asynchrone (worker-media / Remotion).
Cycle de vie : `pending` → (voix) → `validated` → `rendering` → MP4 disponible.

### POST `/capsules/generate` (Papa)

Génère un `CapsuleSpec` et persiste la capsule (statut `pending`).
Corps : `{ subject_id, instruction, level?, skill_id?, chapter_id?, visual, duration, difficulty }`.
Réponse `201` : `CapsuleOut`.

### GET `/capsules` (Papa)

Liste les capsules : `[CapsuleListItem]`.

### GET `/capsules/{id}` (Papa)

Détail : `CapsuleOut` (inclut `spec_json`, aperçu via `@remotion/player`).

### PUT `/capsules/{id}/spec` (Papa)

Remplace le spec (revalidé par le schéma) ; la capsule repasse en `pending`.
Corps : `{ spec }`.

### POST `/capsules/{id}/regenerate` (Papa)

Régénère le spec. Corps : `{ instruction?, visual, duration, difficulty? }`.

### POST `/capsules/{id}/classify` (Papa)

(Re)rattache la capsule à un chapitre pour le regroupement. Corps : `{ chapter_id }`.

### POST `/capsules/{id}/voice` (Papa)

Synthétise la voix (Piper) scène par scène et cale les durées sur la narration.

### POST `/capsules/{id}/validate` (Papa)

Valide la capsule. Si la voix est prête, enfile aussi le rendu MP4 (auto).

### POST `/capsules/{id}/reject` (Papa)

Rejette la capsule (`validation_status = rejected`).

### POST `/capsules/{id}/render` (Papa)

Enfile le rendu MP4 (asynchrone, worker-media). Capsule → `rendering`.
Réponse `202 Accepted` : `CapsuleOut`.

### DELETE `/capsules/{id}` (Papa)

Supprime la capsule. Réponse `204`.

### GET `/capsules/{id}/audio/{scene_index}?token=` (Papa)

Sert le WAV d'une scène. Papa-only via JWT en query param (`<audio>` ne peut pas
envoyer d'en-tête `Authorization` en cross-origin). `401` si token invalide/absent.

### GET `/capsules/library` (Massimo)

Capsules validées **et rendues** (MP4 disponible), prêtes à regarder.
Réponse : `[CapsulePublicItem]`, chaque item porte un flag `seen`.

### GET `/capsules/stats` (Massimo)

Compteurs enfant : `{ total, seen_count, new_count }`.

### POST `/capsules/{id}/view` (Massimo)

Marque une capsule comme vue (idempotent), au démarrage de la lecture. Réponse `204`.

### GET `/capsules/{id}/video?token=` (Massimo)

Sert le MP4 rendu. JWT en query param (`<video>`, rôles enfant ou Papa).
`404` si la capsule n'est pas `validated` ou sans vidéo.

## Mindmaps

### GET `/mindmaps`

Liste.

### POST `/mindmaps/generate`

Génère mindmap de référence.

### GET `/mindmaps/pilotage/{subject_id}`

Papa (`require_parent`) : arbre matière → leçons validées → leurs cartes (tous statuts). Chaque
carte porte `attempt_count` et `avg_score` (agrégat `mindmap_attempts`, une requête). **Cet agrégat
n'existe que sur cette surface** : le suivi est parent-side, rien n'en remonte chez Massimo.

### POST `/mindmaps/{id}/reject`

Papa : `pending → rejected` (adr-0039). **Rejeter n'est pas supprimer** : la carte reste en base,
régénérable depuis le pilotage. Aucune provenance écrite — `validated_by` dit QUI a laissé passer,
personne n'a rien laissé passer ici.

### POST `/mindmaps/{id}/attempts`

Massimo reproduit une mindmap.

### POST `/mindmaps/{id}/evaluate`

Évaluation.

### POST `/mindmaps/{id}/evaluate-preview`

Papa (`require_parent`) — **aperçu de fidélité** (addendum ADR-0016 §C). Même barème que
`/evaluate` (fonction pure partagée), avec deux différences :

- **aucun gate `validated`** : Papa prévisualise du `pending`, que les routes élève cachent (404) ;
- **aucun effet de bord** : ni `mindmap_attempts`, ni `xp_events`, ni `learning_events`. Papa peut
  jouer *Reconstruis* autant qu'il veut sans écrire une ligne dans le journal de Massimo.

`failed_attempts` du payload est ignoré (il ne sert qu'au calcul d'XP, absent ici).

## Conseil de classe IA (ADR-0020)

Synthèse périodique par matière, **Papa-only** (`require_parent`). Narration LLM **100 % locale**
posée sur le service d'évidence (le LLM narre et hiérarchise une évidence *calculée* ; il
n'invente aucun `skill_id` — chaque id est revalidé serveur, anti-hallucination). Rapport **figé**
(`council_reports` + snapshot d'évidence = auditabilité, un artefact LLM n'étant pas rejouable).
Aucune surface Massimo.

- **POST `/api/reports/class-council`** `{ period? }` → `CouncilReportOut`
  `{ id, period, global_summary, subjects: [{ subject_id, subject_name, strengths, to_reinforce,
  recent_evolution: Evolution|str|null, recommendations: [{ skill_ids, skill_names,
  mission_type:"manual", template_hint, justification }] }], prompt_version, created_at }`.
  Génère + persiste. Évidence vide → rapport serein (0 matière), sans appel LLM. Erreur
  provider → `502`.

  ⚠️ `recent_evolution` est **écrasé serveur** (`adr-0040` §8.1) : si l'évidence ne porte aucune
  bascule de palier sur la matière, le champ vaut `null` **quoi que le modèle ait écrit**. Le
  `period` ne sélectionnant aucune donnée, ce champ réclamait une valeur qu'aucune source ne
  pouvait produire — et la phrase inventée était figée dans `subjects_json`.

  Depuis le prompt **v4** (Lot 3), une matière qui EN porte reçoit une structure :

  ```txt
  Evolution = { since: str|null, comment: str|null,
                transitions: [{ skill_id, skill_name, from: str|null, to, changed_at }] }
  ```

  🔴 **`transitions` et `since` viennent du SERVEUR** (`evidence.mastery_transitions`, la même
  fonction que sert Progression — §10). Le modèle ne rend que `comment` : **aucune date ne transite
  par lui**, donc aucune date inventée ne peut atteindre le rapport. L'ancrage est structurel, pas
  un filtre appliqué après coup.

  ⚠️ `since` vaut `history_since`, **jamais `period`** (§9) : `period` est une étiquette,
  `since` une date réelle. Il figure aussi dans `evidence_snapshot_json.trace`, avec
  `transitions_available` / `transitions_considered` — sans quoi un rapport relu dans six mois
  serait indiscernable d'un rapport sans borne. ⚠️ Ce bloc vit **à la racine du contexte** et non
  dans `scope`, qui n'existe qu'en portée matière : l'écart d'un conseil global y serait invisible.

  ⚠️ **Le type reste une union** : les rapports figés avant le Lot 3 portent une `str` dans
  `subjects_json` et se relisent telle quelle. Aucune réécriture, aucune migration — les rapports
  antérieurs au prompt **v3** gardent leur prose sous une marque de lecture dérivée de
  `prompt_version`, qui s'éteint d'elle-même à mesure que les rapports datés s'accumulent.
- **GET `/api/reports/class-council?period=`** → `[CouncilReportListItem]`
  `{ id, period, subject_id, subject_name, subjects_count, created_at, prompt_version }` (récents
  d'abord, **sans limite**). ⚠️ `prompt_version` sert la marque de lecture **sans ouvrir le
  rapport** : dans une liste où les entrées se ressemblent, savoir laquelle est adossée à un
  historique daté est ce qui aide à choisir. Zéro requête de plus.
- **GET `/api/reports/class-council/{id}`** → `CouncilReportOut`.
- **POST `/api/reports/class-council/equip-notion`** `{ skill_id }` → `EquipNotionResult`
  `{ skill_id, skill_name, has_lesson, generated: [str], skipped: [str], errors: [{piece, message}],
  reason }` (ADR-0021). Génère + **auto-valide** le kit d'UNE notion (cours→fiche→SRS→quiz→mindmap),
  100 % local. **Ne régénère jamais une pièce déjà créée** (même un brouillon `pending` de Papa) : on
  génère seulement le manquant et on valide l'existant `pending`. Dégradation gracieuse : notion sans
  leçon canonique validée → `has_lesson=false`, contenus `skipped`. Appelé **avant** create-missions
  (les étapes de la mission résolvent alors les ressources fraîches).
- **POST `/api/reports/class-council/create-missions`** `{ skill_ids, due_date?, force_priority? }`
  → `[MissionPilotOut]`. Pont d'actionnabilité : une recommandation → missions **mono-notion** via
  le flux Commander (ADR-0018 ; `manual`, `validated` par construction — la validation Papa = ce
  clic). Croisées multi-matières hors v1.

## Motivation (Massimo)

Leviers d'auto-motivation de l'enfant. Réservées à l'espace de Massimo (`require_child`) — Papa
reçoit `403`, y compris en lecture : si Papa pouvait poser l'objectif, ce ne serait plus un
engagement mais une consigne. Contrats : `packages/types/src/motivation.ts`.

### GET `/api/student/motivation/week`

Régularité douce + engagement de la semaine courante.

```json
{
  "week_start": "2026-07-27",
  "days": [{ "date": "2026-07-27", "active": true, "is_today": false }],
  "days_done": 2,
  "today_done": true,
  "goal_days": 3,
  "goal_met": false
}
```

Les **7 jours sont toujours servis**, jours à venir compris : le client n'a ni grille à
reconstruire ni date à calculer. Un jour est « actif » s'il porte au moins un `learning_event`
(jamais `xp_events`) en **Europe/Paris** — un jour de lecture sans XP reste un jour où Massimo est
venu, et la connexion suffit à cocher la case.

`days_done` est un COMPTE hebdomadaire, pas une série : il ne peut pas casser, et le lundi la
grille repart de zéro case cochée — un départ, pas une chute. Il n'existe volontairement aucun
champ `missed`, `failed`, `remaining`, `best` ni `streak` : le contrat ne porte pas la matière
première d'une punition, donc aucun client ne peut en afficher une. `goal_days: null` = aucun
engagement pris cette semaine (état qui déclenche l'invitation du lundi), à distinguer d'un
objectif à 0, qui n'existe pas.

### PUT `/api/student/motivation/week`

Corps `{ "target_days": 1..7 }`, `extra="forbid"`. Réponse identique au GET.

`PUT` car c'est un **upsert idempotent** sur (élève, semaine courante) : rejouer la requête rend
le même état, jamais une seconde ligne. **La semaine est déduite serveur** et ne peut pas être
choisie par le client (un `week_start` dans le corps → `422`) : ni modification rétroactive, ni
reproche sur une semaine passée. Réviser son objectif à la baisse est autorisé, sans confirmation
ni trace servie — et peut faire basculer `goal_met` à `true`.

Aucun cron : le changement de semaine se fait seul (le lundi, aucune ligne n'existe encore). Les
semaines passées ne sont servies par **aucune** route élève — un historique d'objectifs manqués
serait le streak déguisé.

### GET `/api/student/motivation/welcome`

Ce que ZETIS dit à Massimo en arrivant, **composé serveur**.

```json
{
  "code": "back_after_break",
  "title": "Content de te revoir, Massimo !",
  "subtitle": "On reprend là où tu t'étais arrêté : le théorème de Pythagore.",
  "cta": { "label": "Reprendre", "target": "missions" },
  "context": {
    "first_name": "Massimo", "last_notion": "le théorème de Pythagore",
    "days_since_last_visit": 6, "consolidated_this_week": 0,
    "gaps_closed_this_week": 0, "reviews_due": 4, "regularity": {}
  }
}
```

**Déterministe, sans LLM ni aléa** : deux appels sur le même état rendent la même phrase. Le
client affiche `title`/`subtitle` **tels quels** ; `code` sert à choisir une illustration, jamais
à réinterpréter le texte. `cta: null` = aucun bouton.

Dix codes, premier applicable : `first_visit`, `back_after_break` (≥ 4 j), `back_short_break`
(2–3 j), `no_goal_yet`, `goal_reached_today`, `goal_reached`, `progress_visible`, `resume_notion`,
`reviews_due`, `all_clear`. L'ordre porte une intention : ce qui est humain (te revoir) passe
avant tout compteur, et l'invitation à s'engager avant la félicitation — sinon on rate la fenêtre
du lundi.

`context` sert à l'illustration et à d'autres blocs, **jamais** à recomposer une phrase.
`days_since_last_visit` y figure et n'apparaît dans **aucun texte** : le nombre de jours d'absence
ne doit jamais être lu par l'enfant. Il se mesure sur les événements **strictement antérieurs à
aujourd'hui** — la connexion étant journalisée avant l'appel, l'absence vaudrait sinon toujours 0.

### GET `/api/student/motivation/wrap-up`

Le mot de la fin d'une séance : ce qui a été gagné, et le prochain pas. Même forme que `welcome`,
sans `context`. Codes : `week_goal_reached`, `mission_in_progress`, `reviews_left`, `day_done`,
`all_clear`.

Endpoint distinct plutôt qu'un `?moment=` sur `welcome` : les entrées diffèrent (l'accueil regarde
l'absence, la clôture le reste-à-faire). **La clôture ne dit JAMAIS combien de jours il reste pour
tenir l'engagement** — l'enfant repart avec une intention, pas avec un décompte.

> `GET /api/gamification/summary` porte le même bloc sous la clé `regularity`. `streak_days`,
> `active_today` et le badge `streak_3` (« Régulier 3 jours » 🔥) ont été **retirés** avec le
> streak : il tombait à zéro dès un jour entier manqué et se calculait en UTC alors que tout le
> reste bucketise en Europe/Paris.

## Activité (journal `learning_events`)

Source unique de l'activité. `xp_events` reste le grand livre de l'XP : le champ `xp` des
réponses ci-dessous en est sommé séparément, **jamais par UNION** des deux tables. Bucketing par
jour et par semaine en **Europe/Paris**. Contrats TypeScript : `packages/types/src/activity.ts`.

### POST `/api/telemetry/pageview` (Massimo)

Seule écriture cliente autorisée dans le journal. Entrée `{ route }` (1–200 caractères,
`extra="forbid"` → un `created_at` envoyé par le client est rejeté en `422`).

**Le serveur horodate.** Une route identique à la précédente du même élève est ignorée
silencieusement. Réponse `204` dans tous les cas de succès. Déclaratif observationnel :
n'influence ni XP, ni score, ni verdict.

### ~~GET `/api/parent/activity/heatmap?weeks=26&subject_id=`~~ — **supprimée (ADR-0028)**

Audit du 2026-07-31 : ses deux seuls appelants étaient la carte de régularité du dashboard et le
dashboard lui-même. Le Cahier de bord, qu'on croyait consommateur, utilise `/activity/sessions`. La
heatmap est désormais servie **par matière** dans l'agrégat `GET /api/parent/dashboard`, et
« toutes matières » est une somme client.

### GET `/api/parent/activity/days/{date}?subject_id=` (Papa)

**Conservée** — c'est l'unique exception au « zéro état de chargement » du dashboard (ADR-0028 §4) :
une descente vers un détail non borné, qu'on ne peut pas précharger pour 26 semaines × 8 matières.
Consommateur : `DayDetailPanel`, monté sous la heatmap de la carte « Quand Massimo travaille ».

`404` si la date n'est pas au format `AAAA-MM-JJ`. Journal trié, `review_attempted` consécutifs
**agrégés côté serveur** en une ligne, `minutes` fourni par événement (le client ne recalcule
rien).

```json
{
  "date": "2026-07-15",
  "events": [
    { "time": "10:00", "event_type": "login", "label": "Connexion",
      "subject_slug": null, "skill_name": null, "xp": 0, "minutes": 2, "detail": null },
    { "time": "10:02", "event_type": "review_attempted", "label": "Révision SRS · 8 cartes",
      "subject_slug": "mathematiques", "xp": 40, "minutes": 9, "count": 8 }
  ]
}
```

### GET `/api/parent/activity/sessions?from=&to=&subject_id=` (Papa)

**Conservée — consommateur nommé : le Cahier de bord** (`CahierBordPage`, vue Sessions du mois).
Ce n'est pas le dashboard qui l'appelle, contrairement à ce que l'audit ADR-0028 supposait au
départ.

Sessions **reconstruites** (coupure à `SESSION_GAP_MINUTES` = 15), jamais stockées. Période
bornée serveur (défaut : 7 derniers jours ; amplitude maximale `ACTIVITY_MAX_RANGE_DAYS`). Jours
rendus du plus **récent** au plus ancien, y compris ceux sans session (`sessions: []`) :
l'absence d'activité est une information. `started_at`/`ended_at` sont des instants **UTC** (pour
calculer) ; `started_time`/`ended_time` sont les mêmes bornes déjà formatées en **Europe/Paris**
(pour afficher) — reformater l'UTC côté client suivrait le fuseau du navigateur et pourrait
contredire le `time` des événements de la même carte.

```json
{
  "days": [
    { "date": "2026-07-15",
      "sessions": [
        { "started_at": "2026-07-15T08:00:00+00:00", "ended_at": "2026-07-15T08:40:00+00:00",
          "started_time": "10:00", "ended_time": "10:40",
          "active_minutes": 22, "events": [] }
      ] }
  ]
}
```

### GET `/api/parent/review-queue?subject_id=&kind=` (Papa) — **module `review_queue`** (adr-0039)

Tout ce qui est produit et n'atteint pas encore Massimo, **borné à l'année active**. Lecture seule.

`kind` ∈ `lesson | fiche | mindmap | capsule | chapter`. **Les quiz n'y sont pas** : `quizzes` n'a
pas de `validation_status`, il est servi sans gate par doctrine (adr-0014 §2).

```jsonc
{
  "counts":   { "lesson": 26, "fiche": 1, "mindmap": 0, "capsule": 5, "chapter": 0, "total": 32 },
  "subjects": [ { "id": 3, "name": "Mathématiques", "slug": "mathematiques" } ],
  "items": [
    { "kind": "capsule", "id": 12, "title": "Les relatifs en 3 minutes",
      "subject_id": 3, "subject": "Mathématiques", "subject_slug": "mathematiques",
      "chapter_id": null, "chapter": null,     // fil PARTIEL par nature, pas un trou à combler
      "lesson_id": null,  "lesson": null,      // une capsule n'a pas de leçon
      "created_at": "2026-08-02T09:11:00Z" }   // `null` pour un chapitre (pas de TimestampMixin)
  ]
}
```

🔴 **`counts` et `subjects` ne sont JAMAIS filtrés** par `kind` / `subject_id` — seul `items` l'est.
Des pastilles qui s'effondrent au premier clic obligeraient à repasser par « Tout » pour changer
d'avis. Leçon déjà payée deux fois dans ce dépôt.

**Aucun `href` dans les items** : `lib/pilotageLinks.ts` porte déjà la convention d'adressage
`?subject=&focus=`. En servir un ici en ferait une seconde règle concurrente.

**Aucun tri réglable, aucune pagination**, assumés : ordre du curriculum, population bornée par ce
que Papa a produit et pas relu. Au-delà de ~500 items, ce n'est plus un problème de pagination mais
le signal que quelque chose produit sans demande.

Les **gestes** passent par les endpoints par type (`/api/lessons|fiches|mindmaps|capsules/{id}/…`,
`PATCH /api/chapters/{id}`) : la file oriente, elle ne concentre pas les pouvoirs.

### GET `/api/parent/dashboard` (Papa) — agrégat unique, **module `dashboard`**

> **Réécriture cassante (ADR-0028, 2026-07-31).** La route servait auparavant six KPI hebdomadaires
> (`week_start`, `sessions`, `xp`, `missions_completed`, `open_gaps`, `consolidated_skills`).
> Acceptable parce qu'elle n'avait qu'un seul consommateur, la page qu'on refaisait. `sessions`,
> `xp` et `missions_completed` **ne sont plus des KPI de pilotage** — un KPI parent doit être
> décisionnel, et l'XP est le levier de Massimo, qui reste sur Progression (§5).

**L'unique requête du premier rendu.** Aucun query param de filtrage, volontairement : période,
matière et focus sont des projections client sur un payload déjà en mémoire. En ajouter un
ramènerait un aller-retour par clic de pastille — exactement ce que l'ADR supprime.

Contrat complet : `docs/frontend-papa/page-dashboard.md §Contrat API`. Forme :

```jsonc
{
  "school_year": { "level": "4e", "label": "2025-2026", "program_version": null },
  "generated_at": "...", "last_activity_at": "...", "days_inactive": 0,
  "inbox": [{ "kind": "validation|gap|demande|referentiel|source", "count": 6,
              "label": "…", "detail": "…",           // `detail` = repli texte si `breakdown` ignoré
              "href": "/relecture",
              // adr-0039 §5 — les CINQ familles mènent à la file. Vide pour les quatre autres
              // `kind`, qui n'ont rien à décomposer. `href` SERVEUR : une règle d'adressage n'a
              // rien à faire dans un composant de présentation (addendum adr-0028 §6).
              "breakdown": [{ "kind": "lesson", "count": 4, "label": "4 cours",
                              "href": "/relecture?kind=lesson" }] }],
  "periods": { "7": { "kpis": { "active_minutes": {"value":200,"delta":35},
                                "active_days":    {"value":5,"of":7,"delta":1},
                                "consolidated":   {"value":12,"of":46,"delta":3},
                                // addendum adr-0028 §5 bis — notions `weak`+`learning`. SANS `of` :
                                // un dénominateur les rapporterait au programme entier, non
                                // abordées comprises. `delta` ≡ `value - sparks.fragile[0]`, donc
                                // un compte d'ENTRÉES, jamais négatif et jamais un solde.
                                "fragile":        {"value":13,"delta":4},
                                "open_gaps":      {"value":3,"delta":0,"without_mission":1} },
                      "sparks": { /* 5 × 12 points */ } },
               "30": {…}, "90": {…}, "365": {…} },
  // Plus ancienne bascule de `skill_mastery_history`, `null` si la table est vide. Sert à faire
  // EXPIRER l'avertissement sur la jeunesse de la courbe ambre : le client ne l'affiche que si la
  // fenêtre regardée commence AVANT cette date (addendum adr-0028 §5 octies).
  "history_since": "2026-07-31",
  "subjects": [{ "slug": "maths", "color": "#60a5fa",
                 "minutes": {"7":65,"30":255,"90":690},
                 "calendar": [{"date":"2026-07-28","active_minutes":42}],  // 26 sem., vides omis
                 "slots": {"7": [[/*7 j*/], /* × 8 créneaux, 8h→24h */]},
                 "slots_outside_minutes": {"7":0},                          // activité 0h–8h
                 "notions": {"consolidated":4,"fragile":3,"in_progress":2,"total":13},
                 // ⚠️ DEUX natures de mesure, qui ne se réconcilient PAS et qu'aucune surface ne
                 // doit présenter comme dérivées l'une de l'autre (addendum adr-0028 « mémoire à
                 // quatre vues ») :
                 //   • 4 STOCKS reconstruits à rebours (`reconstruct_series`) — croissants PAR
                 //     CONSTRUCTION, ils ne peuvent ni redescendre ni se croiser ;
                 //   • 2 FLUX datés (`consolidation_flux`) + les passages SRS notés, qui eux
                 //     varient dans les deux sens.
                 "series": {"7": {"covered":[],"consolidated":[],"fragile":[],"in_progress":[],
                                  "gained":[],"lost":[],
                                  "reviews":{"again":[],"hard":[],"good":[],"easy":[]}}},
                 "review_load": [/* 14 entiers, J+0 → J+13 */],
                 "gaps_open": 2, "has_referentiel": true }],
  "content_chain": [{ "stage": "cours_valides", "label": "Cours validés", "value": 30, "target": 38,
                      // adr-0039 §9 — le nombre que la destination ouvre RÉELLEMENT, et non
                      // `target - value` : celui-là compte aussi les leçons validées SANS cours
                      // rédigé, où aucun dérivé n'est générable. `null` sur la première marche,
                      // qui ne porte aucun delta (un delta se lit ENTRE deux marches).
                      "missing_count": 38, "missing_href": "/couverture?filter=no_course" }],
  "reading": [{ "trend": "up|flat|watch", "text": "…",
                "evidence": { "count": 5, "kind": "notion", "href": "…" } }],
  "proposed_mission": null
}
```

Règles de contrat :

- **Séries livrées par matière, jamais pré-agrégées.** Pas de ligne « toutes matières » côté
  serveur : c'est une somme que le client calcule, et c'est la condition technique du §1.
- Les **trois fenêtres** (7 / 30 / 90) sont dans la même réponse. `calendar` porte 26 semaines
  **quelle que soit la période** : la grille sert la tendance longue, seul le filtre matière
  l'affecte.
- `slots` : matrice `8 × 7`, **8 h → 24 h**, Europe/Paris. L'activité de 0 h à 8 h ressort dans
  `slots_outside_minutes` plutôt que d'être repliée dans un créneau qui la daterait faussement.
- `notions` suit le mapping des six statuts réels de `SkillMastery` (ADR-0028 §3 bis) :
  consolidées = `mastered` · fragiles = `weak` + `learning` · en cours = `solid` + `in_progress` ·
  non abordées = pas de ligne.
- `has_referentiel: false` = matière **sans chapitre**. À ne pas confondre avec `notions.total: 0` :
  les deux états existent et diffèrent. La matière **reste dans le tableau** dans les deux cas — le
  trou est une information.
- `reading[].evidence` est **obligatoire** : un constat sans preuve adressable n'est pas émis.
- `proposed_mission` est composé **en lecture** par le moteur de missions
  (`preview_remediation`) : **ce GET n'écrit rien**. La création reste un POST explicite sur
  `/api/missions/generate-remediation`, route déjà en place. Prévisualisation et création voient
  **exactement les mêmes lacunes** (`status == "open"`, notions déjà couvertes exclues) — sinon la
  carte proposerait une notion que le bouton ne créerait pas. `null` = aucune lacune découverte.
- **Jamais d'UNION avec `xp_events`**, et les événements d'agenda (`NON_ACTIVITY_EVENTS`) sont
  exclus de toutes les projections d'activité.

Les routes `/gaps` et `/progress/summary` citées par la spec produit **n'ont jamais existé en
code**.

## Progression (module `progress`, Papa)

Détail des deux KPI de stock. Analyses parentales : jamais servies à Massimo.

### GET `/api/parent/progress/gaps`

Lacunes ouvertes (`status ∈ open | in_progress`), les plus sévères d'abord. L'UI les formule en
« notions à renforcer » — jamais de vocabulaire d'échec (CLAUDE.md §pédagogie).

⚠️ Cette définition est **plus large que celle du générateur de remédiation**, qui ne reprend que
les lacunes `open`. Ce n'est pas une incohérence : une lacune `in_progress` a déjà été travaillée et
revient par la **révision**, pas par une seconde consolidation (`adr-0017 §5bis`, amendé le
2026-07-31). La page Lacunes s'appuie sur `status` pour proposer le bon générateur.

`has_active_mission` dit si une mission `planned|active` — **de n'importe quel type** — couvre déjà
la notion. C'est ce qui sépare ce qui attend une décision de ce qui est en route ; le dashboard
(`open_gaps.without_mission`) et la page Lacunes s'appuient sur la **même** fonction, après avoir
divergé (le KPI ne regardait que les missions de remédiation et sur-comptait).

```json
[{ "skill_id": 12, "skill_name": "Temps du récit", "subject_slug": "francais",
   "subject_name": "Français", "severity": "high", "status": "in_progress",
   "first_detected_at": "2026-07-01T08:00:00+00:00", "has_active_mission": true }]
```

### GET `/api/parent/progress/consolidated`

Notions consolidées, la maîtrise la plus haute d'abord. **Consolidée = `mastered`** (score ≥ 90,
paliers partagés diagnostic/quiz) ; `solid` (≥ 70) n'est volontairement pas compté — « consolidé »
doit vouloir dire acquis, pas « presque ».

```json
[{ "skill_id": 7, "skill_name": "Nombres relatifs", "subject_slug": "mathematiques",
   "subject_name": "Mathématiques", "mastery_score": 95, "last_seen_at": null }]
```

### GET `/api/parent/progress/overview`

L'avancement du programme, **matière par matière** — toute la page « Progression » en une requête
(ADR-0038). Elle a remplacé un écran entièrement en mock le 2026-08-05.

🔴 **`engaged` mesure l'AVANCEMENT, pas l'acquisition** : notions engagées = consolidées ∪ fragiles
∪ en cours, c'est-à-dire toute notion portant une ligne de maîtrise. `notions.consolidated` reste la
mesure des ACQUIS, servie **à part** et jamais fondue dans la première. Il y a 1 notion consolidée
sur 280 en base réelle : une barre bâtie sur les acquis afficherait zéro pour sept matières sur huit.

⚠️ **Aucun paramètre**, et ce n'est pas un oubli : tout est un **stock**, lu « à aujourd'hui ».
Aucune fenêtre temporelle, aucune série, aucun filtre — un `?period=` passé est ignoré.

⚠️ `notions.total == 0` **n'est pas** « pas de référentiel » : une matière peut avoir ses chapitres
sans qu'aucune notion y soit rattachée. `has_referentiel` = « au moins un chapitre dans l'année
active », la **même** définition que `SubjectOut.has_referentiel` du dashboard — les deux écrans
sont reliés par un lien et ne peuvent pas se contredire.

⚠️ La colonne « À renforcer » de l'écran lit **`notions.fragile`**, pas `gaps_open` : les deux
populations sont disjointes (8 fragiles pour 1 lacune ouverte en Français sur la base réelle), et
c'est `fragile` que compte le constat du dashboard qui pointe ici.

Toutes les matières sont servies, y compris sans référentiel et sans XP — à zéro, jamais absentes.

```json
{ "generated_at": "2026-08-05T09:00:00+00:00",
  "school_year": { "label": "2026-2027", "level": "4e" },
  "subjects": [{ "subject_id": 1, "slug": "francais", "name": "Français",
                 "color": null, "icon": null,
                 "notions": { "consolidated": 1, "fragile": 8, "in_progress": 1, "total": 96 },
                 "engaged": 10, "xp": 367, "gaps_open": 1, "has_referentiel": true }] }
```

### GET `/api/parent/progress/skills`

L'**index des notions** — la vue « Par notion » de Progression (`adr-0040` §11). Écrite le
2026-08-06 ; elle a quitté la section « jamais implémentée » plus haut, qui ne couvre plus que
trois routes.

**Une passe agrégée, sept requêtes, quel que soit le volume** — aucun N+1, aucune pagination,
**aucun paramètre de période**. Filtres, tri, recherche et bascule de vue sont **client, zéro
requête** (patron `adr-0024-addendum-page-matiere-index-notions`). Un test compare deux volumes et
chiffre l'écart s'il rougit.

⚠️ **`since` n'est PAS un `int | null`** (`adr-0040` §7) : quatre états, dont **DEUX `unknown`
distincts**. `null` dirait à la fois « jamais abordée », « bascule antérieure à la trace » et
« date perdue à la migration » — or **une seule de ces absences se comblera d'elle-même**.

⚠️ **`palier` et `has_open_gap` sont deux axes INDÉPENDANTS** (§4), jamais une colonne à trois
valeurs : une notion peut être « à renforcer » sans lacune, et porter une lacune ouverte en étant
« en cours ».

```json
{ "notions": [{ "skill_id": 12, "skill_name": "Théorème de Pythagore",
                "subject_id": 2, "subject_name": "Mathématiques", "subject_slug": "maths",
                "palier": "en_cours", "mastery_score": 62,
                "has_open_gap": false, "gap_severity": null, "has_active_mission": true,
                "since": { "days": 1 } }],
  "subjects": [{ "subject_id": 2, "name": "Mathématiques", "slug": "maths" }],
  "history_since": "2026-07-31", "reviews_since": "2026-07-04" }
```

`palier` ∈ `acquise | a_renforcer | en_cours | non_abordee`, **dérivé du regroupement canonique**
(`dashboard/projections`) et jamais ré-énuméré. `since` ∈ `{days:int}` | `{unknown:"before_history"}`
| `{unknown:"before_migration"}` | `null` (non abordée — aucune ligne de maîtrise).
`history_since` et `reviews_since` sont les **débuts de trace**, déclarés pour qu'un compteur bas
puisse dire « pas de trace » et jamais « pas de mouvement » (§6).

### GET `/api/parent/progress/skills/{skill_id}/timeline`

La **frise d'une notion**, chargée au dépliage — **paresseuse**. Troisième exception assumée au
« zéro état de chargement » de l'`adr-0028` §4, après le drill-down d'un jour et le panneau
d'analyse : une descente vers un détail non borné, pas un filtre.

```json
{ "skill_id": 12, "skill_name": "Théorème de Pythagore",
  "transitions": [{ "from_status": "learning", "to_status": "solid",
                    "mastery_score": 62, "changed_at": "2026-08-05T09:00:00+00:00" }],
  "history_since": "2026-07-31" }
```

⚠️ `from_status` vaut `null` sur la **plus ancienne bascule tracée** : la trace ne porte pas son
palier de départ, et l'inventer serait une affirmation de plus que l'évidence ne soutient pas —
même règle que l'écrasement de `recent_evolution` (Lot 0).

### GET `/api/parent/progress/subjects/{subject_id}/analysis`

Ce que l'agrégat du dashboard ne peut pas porter, pour UNE matière : des **NOMS**. Chargée
paresseusement au dépliage d'un panneau (`adr-0028-addendum-analyse-par-matiere`) puis d'une ligne
de Progression (`adr-0038-addendum-progression-agit`). Lecture seule, **sans LLM** — *l'analyse est
l'évidence, le Conseil est la narration*.

⚠️ **Aucun paramètre de période** : tout ce qui est fenêtré vit déjà dans `SubjectOut`. C'est ce qui
garantit que changer de période panneau ouvert ne déclenche aucune requête. 404 si la matière est
inconnue.

⚠️ `to_reinforce` = notions **fragiles ∪ lacunes ouvertes**, l'union jamais l'intersection, et
**sans plafond** — le plafond de 8 du Conseil borne un *prompt*, pas un panneau. `fragile_count`,
`open_gap_count` et `without_mission_count` sont redondants avec la liste **volontairement** : ils
rendent la cohérence vérifiable dans une seule charge utile.

Les trois derniers champs servent le dépliage d'une ligne de Progression, et **recomposent** les
nombres de cette ligne : `len(engaged) == engaged` de `/overview`, `len(engaged) + len(not_started)
== notions.total`, et `Σ xp_by_reason.amount == xp`.

🔴 **`xp_by_reason` répartit par MOTIF, jamais par notion** : `XPEvent` ne porte pas de `skill_id`.
« Quelles notions ont rapporté ces 367 XP » n'a aucune réponse en base et n'en aura pas sans
migration. Ce n'est pas une approximation faute de mieux, c'est le plafond de ce que la donnée
permet.

```json
{ "subject_id": 1, "slug": "francais", "name": "Français",
  "generated_at": "2026-08-05T09:00:00+00:00",
  "to_reinforce": [{ "skill_id": 12, "skill_name": "Temps du récit", "is_fragile": true,
                     "has_open_gap": false, "severity": null, "gap_status": null,
                     "first_detected_at": null, "mastery_status": "weak", "mastery_score": 40,
                     "weak_quiz_signal": 0.3, "last_seen_at": null, "has_active_mission": false }],
  "fragile_count": 8, "open_gap_count": 1, "without_mission_count": 3,
  "in_progress": { "missions": [], "pending_content": 0, "stale_content": 0,
                   "review_overdue": 2, "review_max_overdue_days": 5 },
  "referentiel": { "has_referentiel": true, "lessons": 12, "lessons_validated": 9,
                   "courses_written": 7, "derivatives_percent": 58 },
  "engaged": [{ "skill_id": 12, "skill_name": "Temps du récit", "segment": "fragile",
                "mastery_status": "weak", "mastery_score": 40 }],
  "not_started": [{ "skill_id": 44, "skill_name": "Subordonnées" }],
  "xp_by_reason": [{ "reason": "mission_remediation", "count": 2, "amount": 100 }] }
```

## Production — Couverture (Papa, ADR-0023)

`require_parent`, **lecture seule** : ces routes ne génèrent rien et ne valident rien. Les
actions de la page passent par les endpoints existants de chaque module.

### GET `/production/coverage?subject_id=`

Matrice matière → chapitre → leçon. `subject_id` absent → toutes les matières de l'année active.
**Une requête agrégée par matière** (aucun N+1).

```json
{ "school_year": { "id": 1, "label": "2026-2027", "level": "4e" },
  "totals": { "lessons": 74, "lessons_validated": 15, "courses_written": 26,
              "derivatives_percent": 13, "pending_count": 1, "stale_count": 0, "orphan_count": 0 },
  "subjects": [{ "id": 1, "name": "Français", "slug": "francais", "chapters": [
    { "id": 9, "title": "Lecture et compréhension", "lessons": [
      { "id": 2, "title": "…", "row_state": "ready",
        "cells": { "cours": { "state": "validated", "derived_at": "…", "validated_by": "parent",
                              "object_id": 2 },
                   "quiz": {}, "fiche": {}, "mindmap": {} },
        "notions": { "cards": { "covered": 3, "total": 3 },
                     "capsules": { "covered": 0, "total": 3 },
                     "items": [{ "skill_id": 41, "name": "Narrateur",
                                 "has_card": true, "has_capsule": false }] } }]}]}]}
```

- `CellState` = `absent` | `pending` | `validated` | `stale` | `blocked`. **`absent` se déduit
  de l'existence de la ligne, jamais d'une date** (un dérivé sans horodatage existe quand même).
  Le **quiz n'a pas de `pending`** : servi sans gate (ADR-0014 §2).
- `RowState` = `blocked_lesson` | `blocked_no_course` | `ready` | `complete` — deux causes de
  blocage distinctes, parce que l'action à mener diffère.
- `validated_by` = `parent` | `parent_bulk` | `system` | `null` (addendum ADR-0011 §F).
- `object_id` = cible d'un « Régénérer » / d'un lien de pilotage (la leçon pour `cours`).
- `derivatives_percent` porte sur **quiz · fiche · mindmap uniquement** — le cours en est la
  condition, pas un dérivé.
- `notions.items` : détail par notion, pour agir sans générer à l'aveugle. **Aucun état de
  fraîcheur sur les colonnes notion-centrées** (§E.5).

### GET `/production/orphans`

Dérivés (`fiche` | `mindmap` | `quiz`) dont la leçon est `archived`.

```json
[{ "type": "quiz", "id": 3, "title": "…", "subject": "Français",
   "archived_at": "…", "has_history": true }]
```

`has_history` vrai (au moins une tentative) → l'UI désactive la suppression. **Lecture seule** :
cette route ne supprime ni ne réattache rien.

## ZETIS Galaxy (Massimo, ADR-0024)

Surface **ÉLÈVE** — `get_current_user`, jamais `require_parent`. Lecture seule, **aucune table
nouvelle, aucune migration** : le graphe se dérive de `skills` / `lesson_skills` / `lessons` /
`chapters` + `skill_mastery`, via `evidence.mastery_by_skill()`.

Gate de visibilité partout : `Chapter.validation_status == "validated"` **et**
`Lesson.status == "validated"`. Une notion non validée n'apparaît pas — pas même « à découvrir ».

> ⚠️ Ces routes ne consomment **ni** le module `progress` **ni** `production` (Papa-only) : aucune
> donnée de pilotage (`validated_by`, fraîcheur, orphelins, sévérité) ne descend jusqu'à Massimo.

### GET `/student/galaxy`

Vue d'ensemble. `lit` = notions dont le statut n'est ni `unknown` ni absent — un **COMPTE**,
jamais un pourcentage (aucun score par matière, ADR-0024 §5).

```json
{ "subjects": [{ "subject_id": 3, "name": "SVT", "slug": "svt", "lit": 11, "total": 16 }] }
```

### GET `/student/galaxy/all`

**Toutes** les matières dans un seul graphe : `root` → matières → chapitres → notions.

> **Consommateur changé le 2026-07-31** (addendum ADR-0024 §C) : cette route alimentait l'aperçu
> de l'**Accueil**, elle alimente désormais la **vue par défaut de `/galaxy`**. **Contrat
> inchangé** — rien n'est ajouté, rien n'est retiré, aucune migration.

Le nœud `root` n'est pas décoratif : sans lui chaque matière forme une composante **isolée** que
le moteur de forces éloigne, et la galaxie se disloque. Chaque nœud porte son `subject_slug`, ce
qui permet à un clic d'ouvrir la bonne constellation sans second aller-retour.

### GET `/student/galaxy/{subject_slug}`

Une constellation : `subject` → chapitres → notions.

```json
{ "subject": { "subject_id": 3, "name": "SVT", "slug": "svt" },
  "nodes": [{ "id": "chapter-12", "kind": "chapter", "label": "La cellule" },
            { "id": "skill-88", "kind": "skill", "label": "Mitose", "skill_id": 88,
              "chapter_id": 12, "status": "learning", "intensity": 58 }],
  "edges": [{ "source": "chapter-12", "target": "skill-88", "type": "structure" }] }
```

- `kind` = `root` | `subject` | `chapter` | `skill`. Arêtes de type **`structure` uniquement** :
  `Skill.prerequisite_skill_ids` **n'existe pas** et `parent_skill_id` est NULL partout — aucun
  prérequis n'est inventé.
- `status` : les 5 états rendus. ⚠️ **`SkillMastery.status` en a SIX** — `in_progress` (verdict
  de mission `review_later`) ne sort d'aucun `_status_from_score()` et est normalisé en
  `learning` **côté serveur**.
- `intensity` (0–100, brut) module une luminosité ; il n'est **jamais affiché**.
- 404 si la matière est inconnue ou hors année active ; `nodes: []` si rien n'est validé.

### GET `/student/galaxy/notion/{skill_id}`

Panneau d'actions — **toute la panoplie ZETIS**, chaque activité portant sa disponibilité.

```json
{ "skill_id": 88, "name": "Mitose", "status": "learning", "chapter_title": "La cellule",
  "subject_slug": "svt", "subject_name": "SVT",
  "actions": [{ "kind": "cours", "available": true, "lesson_id": 41 },
              { "kind": "eli5", "available": true },
              { "kind": "fiche", "available": false },
              { "kind": "capsule", "available": false },
              { "kind": "mindmap", "available": true, "mindmap_id": 9 },
              { "kind": "revision", "available": false },
              { "kind": "quiz", "available": true, "quiz_id": 77 }] }
```

Ordre pédagogique stable : comprendre → mémoriser → se tester. 404 pour une notion hors des
matières de l'élève — un id inconnu ne révèle rien.

> Révision de l'ADR-0024 §4 (2026-07-28) : la règle initiale était « une action sans contenu
> n'est pas proposée ». On renvoie désormais **tout**, avec `available` — une activité manquante
> n'est pas un échec de Massimo, c'est du contenu que Papa n'a pas encore produit.

> ⚠️ **Correctif du 2026-08-01 : `eli5` n'est PLUS toujours disponible.** Il suit désormais le
> cours validé (`available = has_course`). ELI5 s'ancre sur le cours canonique (ADR-0011) et
> **dégrade vers le modèle** en son absence : l'offrir sans cours, c'est router Massimo vers du
> contenu que personne n'a validé. L'orchestrateur de chat refusait déjà d'y router de son côté
> (correctif live du 2026-07-30) — la règle vit maintenant dans le **prédicat partagé**, une
> seule fois.

> **Ce panneau n'est plus l'unique consommateur du prédicat.** `resolve_panoply` (galaxy) le
> porte en version **ensembliste** ; ce panneau en est le consommateur mono-notion, l'index de
> matière ci-dessous le consommateur en lot. **Interdiction d'un second prédicat** : un
> test-verrou vérifie que les deux surfaces renvoient le même `available` sur les 7 kinds.

### GET `/student/subjects/{subject_slug}/panoply`

**Index de notions d'une matière** (addendum ADR-0024) — le même modèle que la constellation,
rendu en liste. C'est le **repli sans WebGL** de `zetis-galaxy.md §11`.

```json
{ "subject": { "subject_id": 3, "name": "SVT", "slug": "svt" },
  "chapters": [{ "chapter_id": 10, "title": "La cellule",
                 "notions": [{ "skill_id": 88, "name": "Mitose", "status": "learning",
                               "actions": [ /* les 7, comme ci-dessus */ ] }] }] }
```

- Même chaîne de visibilité que les autres routes élève ; **404** matière inconnue ou hors année
  active ; `chapters: []` si elle existe mais n'a rien de validé (état positif, pas une erreur).
- ⚠️ **Aucun `mastery_score`, aucun `intensity`, aucun pourcentage.** `status` seul (ADR-0024 §5) —
  une valeur numérique servie finit toujours par être affichée.
- **Nombre de requêtes CONSTANT**, indépendant du nombre de notions : **14**, mesuré pour 3, 30 et
  100 notions. Chaque résolveur travaille en `IN (:skill_ids)`.

> ⚠️ **Piège de comptage pour les consommateurs.** Les résolveurs prennent `MAX(id)` groupé **par
> leçon** : la panoplie n'expose que la ressource la **plus récente** de chaque leçon, et
> plusieurs notions d'une même leçon portent le **même** `fiche_id`. Une leçon avec 3 fiches
> validées donnera donc **1** ici et **3** sur `/student/fiches/summary`. Les deux nombres sont
> justes et ne répondent pas à la même question : « ce que je peux ouvrir depuis mes notions »
> contre « ce que le catalogue contient ». Dédupliquer par `Set` est obligatoire.

### GET `/content-requests` · GET `/content-requests/count` (Papa)

⚠️ **Ces deux lectures FONT LE MÉNAGE** (addendum ADR-0034, 2026-08-04) : elles appellent
`close_available_requests` avant de répondre, et referment les demandes dont le contenu est devenu
disponible. Patron de `runs.close_stale_runs` — *« le seul moment où l'on sait qu'un humain
regarde »*. Aucun ordonnanceur, aucune tâche de fond.

L'ADR-0036 §4 n'avait câblé cette fermeture qu'au **chemin de succès d'un lot** ; or Papa produit
aussi à la main (un cours depuis Programme, une fiche depuis son pilotage, le Conseil hors lot), et
la demande restait alors ouverte pour toujours.

- **Borné à `status=pending`** — lire l'historique (`?status=done`) n'écrit rien ;
- **Ne fait jamais tomber la lecture** : si le ménage échoue, la file s'affiche quand même.

Chaque ligne porte en plus `blocked_reason: string | null` — **pourquoi un lot lancé maintenant ne
produirait rien** (palier, leçon rattachée, cours rédigé), calculé par `runner.blockers_for`, **le
code même que le lot exécute**. ⚠️ À distinguer de `producible`, qui répond du **type** et non de la
**situation** : un cours est productible en général, et ne l'est pas sur une notion dont la leçon
est vide sous un palier qui interdit à ZETIS de l'écrire. Le verdict **informe**, il ne verrouille
pas — la route reste ouverte, et il est **daté**.

Et `active_run: ProductionRun | null` (2026-08-05) — **le lot qui produit CE contenu en ce moment**,
redérivé serveur à chaque lecture, en **une passe groupée** pour toute la file (patron
`blockers_for`).

⚠️ **Le lien ne passe par aucune clé étrangère** : un lot `manual` ne porte pas de
`content_request_id` (la contrainte l'interdit, ADR-0031 §4). Il se retrouve par `(skill_id, piece)`
via `REQUEST_KIND_TO_PIECE`. ⚠️ **Seuls les lots-PIÈCE** y figurent : un lot de chapitre produit
aussi la notion, mais il ne répond pas de cette demande — afficher son avancement ferait croire
qu'une fiche arrive quand le lot en fabrique quinze.

> Motif : l'écran gardait les lots lancés dans son propre état, donc quitter la page effaçait la
> barre et rendait le bouton « Produire ». Papa recliquait — **quatre lots identiques en une
> matinée**, le 2026-08-05.

### GET `/production/runs/active` — `worker_alive` (2026-08-05)

La réponse est un `ProductionRun` **augmenté d'un champ**, et de ce champ seulement :

- `worker_alive: bool` — un worker consomme-t-il la file ? **`false` ne veut pas dire « ça va être
  long », il veut dire « personne ne viendra »**. Une file sans consommateur n'est pas une attente,
  c'est un arrêt, et les deux n'appellent pas le même geste de Papa.

⚠️ **La question n'est posée que sur un lot `queued`** — un lot `running` a forcément quelqu'un qui
l'exécute, et cette route est sondée toutes les 4 s sur toutes les pages Papa. ⚠️ **Elle ne vit que
sur cette route** : la poser dans `ProductionRunOut` la ferait payer une fois par ligne du Journal.

⚠️ Côté implémentation : `rq.Worker.count()` **ment** (elle compte des noms dont le hash a expiré),
`Worker.all()` dit vrai — mesuré, zéro processus en vie et `count()` = 1.

**`ProductionRunOut` gagne `started_at: datetime | null`** — l'instant de démarrage réel. Il porte la
continuité de l'avancement estimé d'une navigation à l'autre : sans lui, l'estimation client mesure
**l'âge de l'affichage**, pas celui de l'opération.

**Deux refus `409` de plus sur `POST /production/runs` et `/runs/from-request`** : un lot au même
scope déjà `queued`/`running` (le message nomme le lot), et un contenu **déjà produit** (lots-PIÈCE
seulement). ⚠️ Le second n'est pas de l'idempotence — il demande « quelqu'un est-il en train de le
faire ? », pas « a-t-il déjà été produit un jour ». Et une pièce `pending` que le régime permet de
valider **ne bloque pas** : ce lot-là a du travail.

### GET `/production/journal` — champs ajoutés le 2026-08-04

- `zetis_mode` — `manuel|semi|autonome|sur_mesure|null` : le régime **de ce lot-là** ;
- `zetis_mode_source` — `capture|deduit|null`. ⚠️ **`deduit` n'est pas `capture`** : reconstitué des
  **actes** du lot (un cours qu'il a rédigé, un dérivé laissé à relire, une origine `request` que
  seul le régime *Autonome* peut produire), **jamais** des réglages d'aujourd'hui, qui ont pu
  changer. L'écran doit marquer la différence ;
- sur chaque **événement** : `target {lesson_id, chapter_id, subject_id, object_id}` — où aller
  (le référentiel pour une ligne bloquée, la pièce pour une ligne produite) — et `resolved: bool |
  null`, qui dit si la cause d'un blocage **tient encore**, sous le palier d'aujourd'hui. Le motif
  d'origine, lui, n'est **jamais** réécrit (§F.4) ;
- sur chaque **pièce** : `target`, pour l'ouvrir depuis la liste.

### GET `/production/journal` — filtre, tri et total (2026-08-04, addendum « tri et filtre »)

Tous les paramètres sont **optionnels**, et **sans aucun d'eux la réponse est exactement celle
d'avant** : il n'y a pas de filtre par défaut.

```txt
subject_id[]  chapter_id[]  depuis  jusqu_a  statut[]  mode[]  piece[]  tri  sens  limit  offset
```

- `statut` ∈ `queued|running|stale|done|failed`. ⚠️ **`failed`, pas `error`** — `error` est une issue
  d'**événement**, pas un statut de lot. Et **`running` EXCLUT `stale`** : sans ça un lot zombie
  répondrait à deux filtres ;
- `mode` ∈ `manuel|semi|autonome|sur_mesure|inconnu` — traduit en **couples de paliers** lus dans
  `NIVEAUX`, jamais recopiés ;
- `piece` ∈ `cours|fiche|mindmap|quiz|srs` — lu dans **`production_events`**, pas dans les cinq
  tables de pièces : l'événement existe pour le produit, le **sauté** et l'**échoué**. ⚠️ Un lot
  bloqué avant d'avoir touché une pièce, ou antérieur à `production_events`, ne répond donc à
  **aucun** filtre de type — l'écran doit le dire ;
- `tri` ∈ `date|matiere|mode|statut`, `sens` ∈ `desc|asc`. Toute clé est départagée par
  `created_at DESC, id DESC` — sans cette queue la pagination perd ou répète des lots en silence ;
- ⚠️ **Une valeur inconnue est IGNORÉE, jamais rejetée** : un 422 sur un vocabulaire d'écran ferait
  tomber la page entière pour une pilule mal orthographiée dans une URL partagée.

**Réponse** : `total` s'ajoute à `runs` et `has_more`. ⚠️ Il porte sur l'ensemble **filtré** — c'est
un compteur de **pagination**, pas de provenance (le §F.2 vise les totaux « ZETIS vs Papa »).

⚠️ **`WHERE` → `ORDER BY` → `LIMIT`, dans cet ordre.** Filtrer une page déjà paginée répondrait
« rien en maths » alors que les lots de maths sont page 4 — un défaut qui ne ressemble pas à un
défaut.

### POST `/student/content-requests`

**Écriture SEULE, `require_child`** (addendum ADR-0027) — Massimo demande un ou plusieurs contenus
sur une notion qu'il voit. Corps `{ skill_id, content_kinds: ["fiche", "mindmap"] }`, réponse
`{ requested: ["fiche", "mindmap"] }`.

Trois garde-fous, tous testés :

1. **Vocabulaire fermé** `cours|fiche|mindmap|quiz|capsule|card`, porté par le schéma → **422**
   avant d'atteindre le service ;
2. **Plafond** `CONTENT_REQUEST_MAX_KINDS` (v1 = 7), mesuré sur la charge **brute** — le
   vocabulaire ne comptant que 6 types, un plafond appliqué après dédup ne bornerait rien : celui-ci
   borne la **taille** de l'appel, le vocabulaire borne son **contenu** ;
3. **Visibilité** — `skill_id` invisible de l'élève → **404 et AUCUNE ligne créée**. Sans ce
   contrôle, la route devient un **oracle d'existence** sur les brouillons de Papa.

`source = "subject_page"` (le chat garde `"chat_orchestrator"`) — le **choisi** contre le **subi**.
Aucun XP, aucun `event_type`, aucune trace d'événement : la **ligne de file EST la trace**.

> ⚠️ **Aucun `GET`, aucun `PATCH` élève, et ce n'est pas un manque de v1.** La file de Papa n'est
> pas une surface de l'enfant : un « refusé » visible serait le vocabulaire d'échec interdit, et
> une liste d'attente ferait d'une file de travail un écran d'attente. Un test vérifie l'absence
> **sur le contrat OpenAPI**, pas sur des codes HTTP (une 403 masquerait une route bien montée).

### GET `/student/galaxy/timeline?with_skills=false`

Frise de progression, **MONOTONE par construction**.

> **`with_skills=true` (ADR-0029)** ajoute `skills: [{ skill_id, date }]` — **quelle** notion
> s'est allumée **quel jour**, pour le rejeu animé. C'est le **même calcul** : la requête
> produisait déjà le `skill_id` (`func.min(created_at).group_by(skill_id)`), on cessait
> simplement de le renvoyer. Aucune requête supplémentaire, aucune table.
>
> **Opt-in strict** : sans le paramètre, la clé est **absente** de la réponse (et non `null`) —
> les consommateurs actuels de la frise ne voient aucun changement de charge utile, ce qu'un
> test verrouille.
>
> Ce qui n'est **jamais** servi : l'état de maîtrise à une date passée. Il existe
> (`skill_mastery_history`) mais il est **Papa-only** et il **régresse** — un rejeu bâti dessus
> montrerait des étoiles **s'éteindre**. Le rejeu ne connaît que deux états : pas encore née,
> et allumée.

```json
{ "points": [{ "date": "2026-07-01", "lit": 2 }, { "date": "2026-07-08", "lit": 5 }], "total": 5 }
```

⚠️ Construite sur la **première fois** où chaque notion a été travaillée, en lisant
`learning_events` (**append-only**) — et **non** sur `SkillMastery`, qui peut **régresser**
(`mastery_score` est une moyenne glissante ; `set_mastery_status` gère explicitement la sortie de
« maîtrisé »). Une frise fondée sur l'état courant montrerait la galaxie **s'assombrir** : c'est
le cadrage de perte que ZETIS bannit. Ne jamais « corriger » cette courbe avec l'état courant.

Aucune table, aucun ordonnanceur : l'historique existe déjà, il suffit de le lire.

## Jobs IA

### GET `/ai/jobs/{job_id}`

Statut job.

Sortie :

```json
{
  "id": "uuid",
  "job_type": "eli5",
  "status": "succeeded",
  "output": {}
}
```

## Codes erreur

- `400` : entrée invalide.
- `401` : non authentifié.
- `403` : rôle insuffisant.
- `404` : ressource introuvable.
- `409` : conflit métier.
- `422` : validation Pydantic.
- `500` : erreur serveur.

## Permissions

| Route | child | parent | admin |
|---|---:|---:|---:|
| `/missions/today` | oui | oui | oui |
| `/progress/summary` | lecture limitée | oui | oui |
| `/school-years` POST | non | oui | oui |
| `/capsules/{id}/validate` POST | non | oui | oui |
| `/capsules/library` GET | oui | oui | oui |
| `/capsules/{id}/view` POST | oui | oui | oui |
| `/diagnostics/generate` POST | non | oui | oui |
| `/diagnostics/quizzes/{id}/submit` POST | oui | **non** | **non** |
| `/diagnostics/quizzes/{id}/validate` POST | non | oui | oui |
| `/diagnostics/quizzes/{id}/reject` POST | non | oui | oui |
| `/diagnostics/results` GET | non | oui | oui |
| `/diagnostics/results/{attempt_id}` GET | non | oui | oui |
| `/diagnostics/portee` GET | non | oui | oui |
| `/diagnostics/apercu` GET | non | oui | oui |
| `/missions/generate-remediation` POST | non | oui | oui |
| `/missions/today` GET | oui | oui | oui |
| `/missions/{id}/complete` POST | oui | oui | oui |
| `/gamification/summary` GET | oui | oui | oui |
| `/rag/documents` POST | non | oui | oui |
| `/rag/upload` POST | non | oui | oui |
| `/rag/clip` POST | non | oui | oui |
| `/rag/clip-url` POST | non | oui | oui |
| `/rag/documents/{id}/validate` POST | non | oui | oui |
| `/rag/documents/{id}/reject` POST | non | oui | oui |
| `/ai/eli5/explain` | oui | oui | oui |

## Documentation OpenAPI

FastAPI doit exposer :

- `/docs` en dev ;
- `/redoc` en dev ;
- désactivation possible en production.
## Agenda scolaire (ADR-0025)

Deux préfixes, deux schémas, **jamais mélangés**. Toute règle de visibilité est appliquée
**serveur** : le client ne filtre rien.

### Lecture et saisie élève — `/api/student/agenda`

Tout utilisateur authentifié (rôle `child` inclus). Schéma `AgendaItemStudentOut`.

#### GET `/week?anchor=YYYY-MM-DD`

Bande **glissante** : 3 jours avant l'ancre (défaut : aujourd'hui), l'ancre, 10 jours après
(`AGENDA_BAND_DAYS_BEFORE` / `_AFTER`). Jamais alignée sur la semaine calendaire.

**Asymétrie volontaire** : tout l'horizon va vers l'avant, le regard en arrière reste borné à
3 jours. Le client ne présume jamais le nombre de colonnes — il rend ce qu'il reçoit.

```txt
days[]: { date, offset, traces, fixed_items[], plan_steps[] }
```

- `traces` : 0–3, **uniquement si `date <= today`** ; `null` sinon (jamais `0` sur un jour à
  venir). Nombre de **natures d'activité distinctes** du jour (types d'événement, navigation
  exclue), plafonné à `AGENDA_TRACES_CAP` — pas une durée, pas un score. Une rafale de révision
  vaut 1. `traces = 0` et « pas de donnée » sont **le même état**.
- `fixed_items[]` : **uniquement si `date >= today`**, `[]` sinon.
- `plan_steps[]` : toujours `[]` en Lot 1 (champ au contrat, rempli au Lot 2).

#### GET `/upcoming`

`kind ∈ (controle, rendu)`, non fait, non archivé, horizon 21 jours, **max 4**, trié par date.
→ `{ id, label, subject, due_on, days_left, has_plan }`.

#### GET `/items?from=&to=`

Liste plate.

#### POST `/items`

`created_by` **forcé à `student` côté serveur** (jamais lu du corps).

**Verrou de phase (ADR-0025 §10)** : **403** tant que `AGENDA_STUDENT_ENTRY_ENABLED` (défaut
`false`) est fermé. Le verrou est serveur — une UI cachée n'est pas une règle. `done`, `undone`
et `dismiss` ne sont **jamais** concernés : Massimo coche et masque dès la phase 0.

#### PATCH `/items/{id}`

`label` / `subject_id` / `due_on` / `kind`, **uniquement sur ses propres items** — **403** sinon.

#### POST `/items/{id}/done` · POST `/items/{id}/undone`

Bascule `done_at`. Autorisé sur **tous** les items, y compris ceux de Papa.

#### POST `/items/{id}/dismiss`

Masque un item, y compris de Papa. Le masquage reste visible côté pilotage.

#### POST `/seen` → 204

Massimo a **regardé** ce qui est arrivé (addendum ADR-0025 §12.3). Pose
`student_profiles.agenda_last_seen_at` à `now()`. Idempotent, sans corps, **sans réponse**.

Deux appelants côté client, et il en faut deux : l'ouverture de `/agenda` **et** le rendu du
bandeau d'Accueil. N'en retenir qu'un ferait mentir le témoin sur ce qui a déjà été lu.

**Route élève uniquement** — aucune route Papa n'écrit ce watermark, et il ne sort d'aucune
réponse (test de non-fuite dédié). Le témoin sort en **nombre**, via `/api/student/news/summary`,
jamais en date.

### Pilotage Papa — `/api/agenda`

`require_parent`. Schéma `AgendaItemPilotOut`.

#### GET `/items?from=&to=`

Archivés inclus, marqués.

#### POST `/items`

`created_by` forcé à `parent`. **Corps en lot obligatoire** : `{ "items": [ … ] }` → **201** avec
la liste créée. Papa relève l'ENT du dimanche soir en une requête.

#### POST `/items/single`

Confort : un item unique, sans enveloppe `items`. Même règles, même forçage de `created_by`.

#### PATCH `/items/{id}`

Sur un item `created_by='student'`, le service renseigne **automatiquement**
`edited_by_parent_at`. Toute tentative d'écrire `done_at` → **403** — refus d'autorité, pas de
validation (déc. ADR-0025 §2b : seul Massimo coche). Le champ est **déclaré au schéma exprès**
pour que le refus soit explicite : silencieusement ignoré, il laisserait croire que ça a marché.

#### PUT `/items/{id}/note`

`parent_note`. Jamais servie à Massimo.

#### DELETE `/items/{id}`

**Archivage** (`dismissed_at`), la ligne reste en base. Répond **200 avec l'item archivé** (et
non 204) : la réponse dit ce qui s'est réellement passé.

#### GET · PUT `/settings`

`{ student_entry_enabled: bool }` — verrou de phase de l'ADR-0025 §10, persisté dans
`app_settings` (la variable d'environnement reste la valeur par défaut tant qu'aucune ligne
n'existe).

Le `PUT` est un **geste explicite de Papa**. Aucune bascule automatique n'existe côté serveur :
la déclencher sur un seuil de coches observé ferait dépendre un droit d'une surveillance.

### Événements non probants

L'agenda émet exactement deux `learning_events` — `agenda_item_created` (avec la source) et
`agenda_item_done` — regroupés dans `NON_ACTIVITY_EVENTS` et **exclus de toutes les projections
d'activité** (heatmap, minutes actives, sessions, Cahier de bord, jours de venue). `evidence`
n'a besoin d'aucune garde : sa seule lecture du journal est filtrée sur `mission_verdict`.
`agenda_item_missed` n'existe pas. Aucun XP n'est crédité.

## Témoins de nouveauté en navigation (Massimo, ADR-0030)

### GET `/api/student/news/summary`

Les six compteurs de la sidebar Massimo, en **un seul appel**. Monté une fois dans
`MassimoLayout` ; l'alternative (un appel par famille) faisait six allers-retours sur la page la
plus visitée, pour un objet décoratif.

```txt
{ agenda, fiches, capsules, revision, missions, mindmaps }   # entiers bruts
```

**La règle que ce contrat encode :**

> Un badge de navigation compte ce qui est **NOUVEAU** (naît d'un geste de Papa ou du système,
> meurt d'un **regard** de Massimo), **jamais** ce qui est **DÛ** (naît d'une date franchie, ne
> meurt que du **travail**, et **grossit quand Massimo ne vient pas**).

La seconde colonne est la définition d'une relance : interdite. Le schéma est donc **fermé** —
aucun champ d'échéance, aucun total, aucune date. Avant d'ajouter une clé, lui appliquer le test
du §1 : *une date qui passe sans que Massimo agisse change-t-elle ce nombre ?*

| clé | compte | meurt de | source |
|---|---|---|---|
| `agenda` | items arrivés depuis le dernier regard | `POST /student/agenda/seen` | `agenda_last_seen_at` |
| `fiches` | fiches validées jamais ouvertes | `POST /student/fiches/{id}/seen` | `fiche_views` |
| `capsules` | capsules publiées jamais vues | `POST /capsules/{id}/view` | `capsule_views` |
| `revision` | cartes **jamais révisées** | 1er passage (`last_reviewed_at`) | `spaced_review_cards` |
| `missions` | missions `validated` jamais démarrées | `POST /missions/{id}/start` | `started_at` |
| `mindmaps` | mindmaps validées jamais ouvertes | `POST /student/mindmaps/{id}/seen` | `mindmap_views` |

⚠️ **`revision` n'utilise PAS le `new_count` de `/reviews/summary`.** Celui-ci exige
`due_at <= now` alors que les cartes naissent avec une échéance **future** : une carte fraîchement
générée y entrerait 1 à 7 jours plus tard, **sans aucun geste de Massimo**. L'expression dédiée est
`memory/service.py::new_cards_count`, sans clause d'échéance. `due_count` est le compteur interdit.

**Sans témoin, et ce n'est pas un oubli** : Matières (hub — ce qui arrive a déjà son entrée), Quiz
(pas de `validation_status` du tout, ADR-0014 §2 : aucun moment « ça arrive »), ELI5 (son
`new_count` est un critère de **récence**, il décroîtrait tout seul), Cours, Diagnostic, Ma
Galaxie, Chat ZETIS, Paramètres.

**Lecture pure, aucun effet de bord** : consulter le badge n'est pas le regarder. Le geste qui
consomme une nouveauté vit sur la surface qui montre réellement le contenu.

**Côté client** : rafraîchi par un événement (`NEWS_CHANGED_EVENT`) émis à chaque geste de
consultation, **jamais par polling** — un compteur qui change sans que Massimo ait rien fait est
une notification. Le plafond « 9+ » est de présentation ; le serveur sert le compte exact.

**Deux test-verrous** (`app/tests/test_news_doctrine.py`) : aucune source ne lit `due_at` /
`due_on` / `due_date` / `done_at` (vérifié sur le **source** des six fonctions, la sortie étant un
entier qui ne trahit pas sa provenance), et aucun écoulement du temps n'augmente un compteur.

**Ne s'applique pas à l'interface Papa** : Papa n'a pas de contenu qui « arrive » sans qu'il l'ait
demandé. Ce que porte sa sidebar est une **file de validation**, objet distinct.

## Activité de production (Papa, ADR-0041)

La source **unique** de toutes les barres de progression Papa — le header et les pages lisent le
même endpoint. Ce qui disparaît avec elle, ce sont les constantes de durée en dur : la rédaction
d'un cours en portait **cinq** différentes selon l'écran d'où on la lançait.

`require_parent`. Aucune surface Massimo (ADR-0026 §4).

### `GET /api/production/activity`

```json
{
  "current": { "kind": "run|job", "id": 42, "label": "Équipement · Théorème de Pythagore",
               "status": "queued|running|stale|failed", "lane": "llm|media",
               "pct": 37, "pct_is_measured": true,
               "pieces_done": 7, "pieces_total": 19, "pieces_produced": 5,
               "current_piece": "fiche",
               "started_at": "2026-08-06T10:00:00Z", "trigger": "manual", "error": null,
               "estimated_ms": 60000 },
  "queued_count": 2,
  "queued": [ /* ActivityItem[], dans l'ORDRE où la file sera servie — borné à 20 */ ],
  "failed": [],
  "refused": [ { "id": 3, "regulator": "pending_backlog", "detail": "…", "trigger": "agenda",
                 "created_at": "2026-08-07T02:00:00Z" } ],
  "worker_alive": null,
  "media_alive": null
}
```

- 🔴 **`pct` vaut `null`, JAMAIS `0`** pour dire « ça démarre ». Zéro n'est pas une valeur basse,
  c'est une absence de mesure — le 2026-08-05, quatre lots arrêtés affichaient 0 %.
- **`pct_is_measured`** — `true` : progression **réelle** calculée serveur (le lot, `7 / 31`) ;
  `false` : l'écran estime, ancré sur `started_at` (`≈ 40 %`). Un appel LLM n'a aucun grain interne.
- **`trigger` est DÉRIVÉ**, jamais stocké sur le travail : un lot porte le sien, un travail hors
  lot est `manual` par construction.
- **`worker_alive: null`** = « la question n'a pas été posée » — à ne pas confondre avec `false`.
  Elle n'est posée que si quelque chose est **en file**. Tester `=== false`.
- **`queued_count`** est une profondeur de file, jamais un arriéré (`adr-0011` §F.2).
- **`queued`** porte la file **elle-même**, dans son ordre de service, bornée à **20**. Sans elle,
  « une ligne par travail » et « l'ordre visible » du §7 sont infaisables : une règle de priorité
  qu'on ne peut pas vérifier à l'œil n'est pas vérifiée. ⚠️ Comparer `queued.length` à
  `queued_count` dit s'il en reste — une troncature muette se lirait comme une exhaustivité.

**Ajouts de l'addendum 2 (2026-08-07) :**

- **`pieces_done` / `pieces_total`** — la mesure passe de la NOTION à la **PIÈCE** : `7 / 19`, pas
  `7 / 31`. `null` **avec** `pct` et sous exactement la même condition serveur — il existe une
  fenêtre où `runner.execute` a commité `running` sans avoir posé `total_notions`, et trois
  conditions séparées feraient servir `null / null · 37 %`.
- **`pieces_produced`** — les pièces `generated` **seules**, toujours servi (un `COUNT` reste exact
  hors régime mesuré). C'est le badge du stock, pas l'avancement : une pièce `skipped` a traversé le
  tapis mais était déjà dedans.
- 🔴 **`current_piece`** — la pièce en cours **dans la notion en vol** (`cours` · `fiche` · `srs` ·
  `quiz` · `mindmap`, `null` entre deux notions). **C'est ce champ qui fait bouger la barre** : les
  cinq lignes de journal d'une notion atterrissent d'un coup à sa fin, donc sans lui un compte de
  pièces avancerait exactement comme un compte de notions (`5/155` = `1/31`, toutes les ~69 s).
  Un changement de valeur signifie qu'une pièce vient d'être finie.
- **`lane`** — DÉRIVÉ du type de travail, jamais stocké. ⚠️ `media` **ne retarde rien** (worker et
  file séparés) : il n'entre pas dans `queued_count` et n'apparaît que dans le détail.
- **`refused`** — les refus de régulateur non acquittés, **automatiques seulement**. ⚠️ Liste **à
  part** de `failed` : un régulateur qui dit non n'est pas une panne, et les confondre apprendrait
  à Papa à ignorer les deux. `regulator` ∈ `duplicate` · `already_produced` · `pending_backlog` ·
  `request_volume` · `auto_volume`. `detail` est rendu **tel quel**.
- **`media_alive`** — le worker du couloir média, posé séparément. Champ **additif** :
  `worker_alive` garde sa forme. Même règle de lecture, `=== false` jamais la fausseté.

### `POST /api/production/activity/{kind}/{item_id}/ack` → 204

`kind` ∈ `run | job | refusal`. Un échec — ou un refus — reste affiché **jusqu'à ce geste**, pas six
secondes. L'acquittement est serveur : il ne revient sur aucun autre appareil.

### ⚠️ Contrat MODIFIÉ — `POST /api/reports/class-council/equip-notion`

Rendait le kit après ~69 s par notion. Rend désormais **`202` + `{ "job_id": int, "status":
"queued" }`** ; l'avancement se lit dans `/activity`. Le travail est **commité avant d'être
enfilé**, sinon la barre ne pourrait pas l'annoncer « en file » au retour de la route.

### ⚠️ Contrat ENRICHI — `GET /api/ai/jobs/{job_id}`

`JobOut` gagne **`error`** (`error_message`) et **`started_at`**. Un job `failed` était jusqu'ici
**muet** côté client ; et sans l'instant de départ, une barre locale mesure l'âge de son AFFICHAGE
au lieu de celui du travail — c'est ainsi que deux surfaces finissent par afficher deux nombres.

### ⚠️ `503` NOUVEAU sur les trois routes qui enfilent (ADR-0041 §10.1)

`POST /production/runs` · `POST /production/runs/from-request` · `POST
/reports/class-council/equip-notion` — et `POST /capsules/{id}/render`, qui lève le même.

```json
{ "detail": "La file de production est injoignable : rien n'a été lancé, et rien n'a été créé. Vérifiez que Redis et le worker de production tournent, puis relancez." }
```

🔴 **La garantie porte sur la base, pas sur le message** : après un `503`, **aucun lot, aucun
travail, aucune capsule en `rendering`** ne subsiste. C'était un `500` auparavant, avec l'objet
**déjà commité** — un lot que personne n'exécuterait jamais, que la barre annonçait « en file
d'attente », et qui bloquait ensuite sa propre recréation via `run_exists_for`.

⚠️ **L'ordre ne peut pas être inversé** (l'objet doit être lisible par le worker avant d'être
enfilé, §3) : c'est une **compensation**, pas une transaction. Un test-verrou par chemin.

### `status` peut valoir `stale` sur un `kind: "job"` (ADR-0041 §10.4)

`stale` est une **lecture**, jamais une valeur stockée — ni `RUN_STATUSES` ni `ai_jobs.status` ne la
contiennent. Côté lot elle vient de `heartbeat_at` ; côté travail unitaire, d'un `running` dont le
`started_at` dépasse `PRODUCTION_JOB_TIMEOUT` — **le délai auquel RQ tue le job lui-même**, donc
au-delà duquel une ligne `running` ne décrit plus rien de vivant.

⚠️ Un travail **`queued`** n'est jamais `stale`, même depuis deux jours : c'est `worker_alive` qui
dit cette panne-là, et la file repartira seule au prochain démarrage du worker.

### ⚠️ Contrats MODIFIÉS — sept routes passent en `202` (ADR-0041 slice C)

| Route | Avant | Maintenant |
|---|---|---|
| `POST /fiches/generate` | `201` + `FicheOut` | `202` + `{job_id, status}` |
| `POST /fiches/{id}/regenerate` | `200` + `FicheOut` | idem |
| `POST /mindmaps/generate` | `201` + `MindmapOut` | idem |
| `POST /mindmaps/{id}/regenerate` | `200` + `MindmapOut` | idem |
| `POST /lessons/{id}/quizzes/generate` | `200` + `QuizGenerateResponse` | idem |
| `POST /quizzes/{id}/regenerate` | `200` + `QuizGenerateResponse` | idem |
| `POST /lessons/{id}/generate-content` | `200` + `CurriculumLessonOut` | idem |
| `POST /diagnostics/generate` | `200` + `DiagnosticGenerateResponse` | idem |

Ce que la route rendait se lit désormais dans **`output` de `GET /api/ai/jobs/{job_id}`**, une fois
`succeeded` : `{fiche_id}`, `{mindmap_id}`, `{quiz_id, questions_generated, questions_discarded}`,
`{lesson_id}`, `{quiz_id, subject, questions_count}`. Rien n'est perdu — tout est **déplacé**.

🔴 **Les refus, eux, restent SYNCHRONES.** La file diffère le **travail**, jamais le **verdict sur
la demande** : `404` (matière ou leçon inconnue), `409` (leçon non validée, leçon archivée) tombent
toujours au clic. Le service les rejoue de son côté — le monde peut changer entre le clic et
l'exécution. Un test l'a prouvé nécessaire : `POST /diagnostics/generate` sur une matière inconnue
serait passé de `404` immédiat à `202` suivi d'un travail en échec deux minutes plus tard.

### `GET /api/lessons/{lesson_id}` (Papa) — NOUVELLE

UNE leçon avec son cours et son audit de provenance. Née de la migration ci-dessus : `generate-content`
rendait la leçon rédigée, il rend `202` — il faut pouvoir **relire** ce que le travail a produit sans
recharger tout le chapitre.

### `estimated_ms` — la durée attendue vient du SERVEUR (ADR-0041 §9)

Porté par `ActivityItem` (`/production/activity`) **et** par `JobOut` (`/ai/jobs/{id}`).

🔴 **Ce n'est pas une constante déplacée d'un cran.** C'est la **médiane des dernières exécutions
réussies** de ce `job_type` (`ai_jobs.duration_ms`, ≥ 5 exécutions, fenêtre des 300 derniers
travaux, servie par l'index `(job_type, status)`). La valeur en dur ne sert plus que d'**amorce**,
le temps que l'histoire existe : ZETIS apprend ses propres durées, et une amorce fausse se corrige
seule au lieu de mentir jusqu'à ce que quelqu'un la remarque — ce qui, mesuré, n'arrivait pas.

⚠️ **Médiane et non moyenne** : un travail qui a attendu Massimo ou tapé dans son `job_timeout`
tirerait une moyenne vers le haut de façon permanente.

### ⚠️ Contrats MODIFIÉS — sept routes de plus en `202` (ADR-0041 §4, dernier lot)

| Route | Avant | `output` du travail |
|---|---|---|
| `POST /memory/cards/subjects/{id}/generate` | `200` + `SubjectGenerateResult` | le compte-rendu tel quel |
| `POST /memory/cards/skills/{id}/generate` | `200` + `SkillGenerateResult` | idem |
| `POST /capsules/generate` | `201` + `CapsuleOut` | `{capsule_id}` |
| `POST /capsules/{id}/regenerate` | `200` + `CapsuleOut` | `{capsule_id}` |
| `POST /capsules/{id}/voice` | `200` + `CapsuleOut` | `{capsule_id}` |
| `POST /school-year-subjects/{id}/generate-chapters` | `201` + `list[ChapterOut]` | `{chapter_ids}` |
| `POST /chapters/{id}/generate-lessons` · `/extend-lessons` | `201` + `list[LessonOut]` | `{lesson_ids}` |
| `POST /curriculum/skills-backfill/generate` | `200` + `SkillsBackfillPreview` | la prévisualisation |

⚠️ **Les deux routes SRS partagent un seul `job_type`** (`srs_cards_generate`) : c'est le même
travail à deux granularités, et deux types auraient coupé en deux l'historique qui sert à mesurer
sa durée.

⚠️ **`skills-backfill/generate` est le seul travail migré qui ne persiste RIEN** (ADR-0010) : sa
prévisualisation EST sa sortie — aucun id à relire ensuite.

🔴 **Les refus restent SYNCHRONES, y compris le `503` « clé cloud absente ».** Il venait de
`Depends(get_curriculum_provider)` ; la dépendance est **conservée sur les quatre routes
`curriculum_*` alors qu'elles ne s'en servent plus**, précisément pour que ce verdict tombe au clic.
Un test l'a rendu nécessaire.

🔴 **La dérogation cloud de l'ADR-0009 traverse la file.** `run_ai_job` passe le moteur **LOCAL** :
les exécutants `curriculum_*` reprennent `get_curriculum_provider()` eux-mêmes. Une migration naïve
l'aurait annulée en silence — même code, même sortie apparente, référentiel de bien moindre
qualité. Verrou : `test_curriculum_utilise_le_provider_CLOUD_et_pas_le_local`, avec **le moteur
local piégé** (l'appeler fait échouer le travail).

### ⚠️ Contrat MODIFIÉ — `GET /production/journal` accueille les travaux unitaires (addendum ADR-0041 §16-§18)

```json
{
  "runs": [ /* JournalRunOut[] — inchangé */ ],
  "travaux": [ { "id": 653, "job_type": "srs_cards_generate",
                 "label": "Cartes de révision · Mitose", "status": "succeeded",
                 "trigger": "manual", "skill_id": 42, "skill_name": "Mitose",
                 "created_at": "…", "started_at": "…", "finished_at": "…",
                 "duration_ms": 53600, "error": null } ],
  "travaux_exclus": null,
  "has_more": true, "total": 31
}
```

🔴 **`runs` est INCHANGÉ** — le contrat existant ne bouge pas. Les travaux arrivent **à part**
plutôt que mêlés à `runs` : un `AIJob` ne porte ni régime, ni pièces, ni journal ligne à ligne, et
le glisser dans `JournalRunOut` l'obligerait à faire semblant (§17). L'écran les **entrelace par
date** — ce n'est pas un tri côté client : la page est déjà la bonne, découpée **en SQL sur l'union
des deux modèles**, et on ne fait qu'ordonner ce qu'elle contient.

🔴 **`total` et `has_more` portent sur l'UNION.** Paginer chaque modèle séparément perdrait
silencieusement tout ce qui tombe entre les deux — le défaut que l'addendum « tri et filtre » §2
avait déjà nommé pour les filtres. ⚠️ **Corollaire client : l'offset compte les DEUX listes**
(`runs.length + travaux.length`), jamais `runs` seul.

**Ce qu'un travail ne porte PAS**, et ce n'est pas un oubli : `zetis_mode`, `zetis_mode_source`,
`pieces`, `events`. Donc **aucun veto** — `DELETE /journal/pieces/{kind}/{id}` s'appuie sur le
tamponnage `production_run_id`, qu'un `AIJob` ne pose pas. L'écran ne doit offrir aucun bouton de
retrait sur ces lignes : il ne pourrait rien retirer.

⚠️ **`zetis_mode` est ABSENT, pas `"manuel"`.** Un travail hors lot est manuel *par construction*
(§3.2) et il serait tentant de l'écrire — ce serait confondre l'**origine** (qui a demandé) avec le
**régime** (sous quelles règles ZETIS pouvait servir sans relecture), que l'ADR-0034 sépare exprès.
L'origine, elle, se dit : `trigger`.

### `travaux_exclus` — quand un filtre écarte les travaux (§18)

`piece`, `mode`, le filtre par **chapitre** et tout **tri autre que la date** n'ont aucun sens sur
un travail unitaire : plutôt que de lui inventer une valeur, ils ne rendent que des lots. Le champ
porte alors la phrase à afficher, qui **nomme la dimension** — « le filtre par pièce ne porte que
sur les lots » — et vaut `null` quand les travaux sont admis.

⚠️ **À AFFICHER** : une exclusion muette se lit comme un vide, même faute qu'une troncature muette.

Le filtre par **matière** fait exception et s'applique aux deux : il se lit sur la notion du
travail (`input_json.skill_id`). Un travail sans notion identifiable est écarté quand il est actif.

⚠️ **Les TRACES n'entrent jamais** (`created_by != "file"`) : ce sont les appels LLM *à l'intérieur*
d'un travail, et elles sont beaucoup plus nombreuses — 143 pour une poignée de gestes, mesuré en
base. Voir `DATA_MODEL.md`, règle de lecture de `created_by`.
