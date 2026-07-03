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

## Diagnostic

Préfixe réel : `/api/diagnostics`. Implémenté à l'étape 14 (Phase 4) sur les tables
`quizzes`/`quiz_questions`/`quiz_attempts`/`quiz_answers` (un diagnostic = un `quiz`
de `quiz_type = diagnostic`). Les QCM sont générés par IA, par notion.

### GET `/diagnostics/subjects`

Matières disponibles pour lancer un diagnostic : `[{ id, name }]`.

### POST `/diagnostics/generate` (Papa)

Génère un diagnostic (QCM par notion) pour une matière. Corps : `{ subject_id, level? }`.
Réponse : `{ quiz_id, subject, questions_count }`. Trace `ai_jobs` (`diagnostic_generate`).

### GET `/diagnostics/quizzes` (Massimo)

Liste les diagnostics : `[{ quiz_id, title, subject, questions_count, taken }]`.

### GET `/diagnostics/quizzes/{id}` (Massimo)

Questions à passer — **sans** la bonne réponse :
`{ quiz_id, title, subject, questions: [{ id, prompt, choices, skill_id, skill_name }] }`.

### POST `/diagnostics/quizzes/{id}/submit` (Massimo)

Corps : `{ answers: [{ question_id, choice_index }] }`. Corrige, écrit la tentative,
met à jour la maîtrise et ouvre les lacunes. Réponse :
`{ attempt_id, quiz_id, subject, score_percent, per_skill: [{ skill_id, skill_name, score, status }], gaps: [{ skill_id, skill_name, severity }], strengths: [..] }`.

### GET `/diagnostics/results` (Papa)

Derniers diagnostics passés, score par notion + lacunes ouvertes.

> Reporté : `generate-missions` (remédiation depuis les lacunes), diagnostic
> multi-matières en une session, difficulté adaptative.

## Quiz

### GET `/quizzes/{id}`

Retourne quiz et questions.

### POST `/quizzes/{id}/attempts`

Démarre tentative.

### POST `/quiz-attempts/{attempt_id}/answers`

Envoie réponse.

### POST `/quiz-attempts/{attempt_id}/complete`

Termine tentative et calcule résultats.

## Missions

Préfixe réel : `/api/missions`. Implémenté à l'étape 15 (remédiation) sur les tables
`missions`/`mission_steps` + `gaps` + `xp_events`. Une mission de remédiation porte
`mission_type = remediation` et des étapes (expliquer → réexpliquer → quiz).

### POST `/missions/generate-remediation` (Papa)

Transforme les lacunes ouvertes (`gaps`) en missions de remédiation (idempotent).
Réponse : `{ created, missions: [MissionOut] }`.

### GET `/missions`

Liste les missions de l'élève (avec leurs étapes) : `[MissionOut]` où
`MissionOut = { id, subject, skill_id, skill_name, title, description, mission_type, status, priority, steps: [{ id, step_type, instruction, sort_order, status }] }`.

### GET `/missions/today` (Massimo)

Missions à faire (`planned`/`active`), les plus prioritaires d'abord.

### POST `/missions/{id}/complete` (Massimo)

Termine la mission : étapes `done`, **lacune liée résolue**, **XP crédité**.
Réponse : `{ id, status, gap_resolved, xp_awarded }`.

> Reporté : `start`, `complete-step` (suivi étape par étape), missions manuelles Papa.

## Progression

### GET `/progress/summary?student_id=`

Résumé global.

### GET `/progress/subjects?student_id=`

Progression par matière.

### GET `/progress/skills?subject_id=`

Maîtrise par notion.

### GET `/progress/xp`

XP global et par matière.

## Gamification

Préfixe réel : `/api/gamification`. Implémenté à l'étape 16 sur la table `xp_events`.
L'XP est crédité aux moments clés (mission +20, verbalisation ELI5 +10, diagnostic +15).

### GET `/gamification/summary`

Synthèse de progression de l'élève :
`{ total_xp, level, xp_into_level, xp_for_next, streak_days, active_today, badges: [{ code, label, icon }], recent: [{ amount, reason, created_at }] }`.
Niveau = `total_xp // 100 + 1` ; streak = jours consécutifs d'activité (tolérance d'un jour).

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

L'explication normalisée est lue via `GET /ai/jobs/{job_id}` (`output`). Elle inclut
`sources_used` (entier) : nombre de passages de cours (RAG) injectés. `>0` → le front
Massimo affiche le badge « 📚 D'après ton cours ».

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

### POST `/mindmaps/{id}/attempts`

Massimo reproduit une mindmap.

### POST `/mindmaps/{id}/evaluate`

Évaluation.

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
| `/diagnostics/quizzes/{id}/submit` POST | oui | oui | oui |
| `/diagnostics/results` GET | non | oui | oui |
| `/missions/generate-remediation` POST | non | oui | oui |
| `/missions/today` GET | oui | oui | oui |
| `/missions/{id}/complete` POST | oui | oui | oui |
| `/gamification/summary` GET | oui | oui | oui |
| `/rag/documents` POST | non | oui | oui |
| `/rag/upload` POST | non | oui | oui |
| `/rag/documents/{id}/validate` POST | non | oui | oui |
| `/rag/documents/{id}/reject` POST | non | oui | oui |
| `/ai/eli5/explain` | oui | oui | oui |

## Documentation OpenAPI

FastAPI doit exposer :

- `/docs` en dev ;
- `/redoc` en dev ;
- désactivation possible en production.
