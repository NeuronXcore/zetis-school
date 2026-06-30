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

## Chapitres et cours

### GET `/subjects/{subject_id}/chapters`

Liste chapitres.

### GET `/chapters/{chapter_id}`

Détail chapitre.

### GET `/chapters/{chapter_id}/lessons`

Liste cours.

### GET `/lessons/{lesson_id}`

Détail cours.

### POST `/lessons`

Création Papa ou IA.

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

### POST `/capsules/generate`

Génère une capsule à partir d’une notion.

### GET `/capsules`

Liste capsules.

### GET `/capsules/{id}`

Détail.

### POST `/capsules/{id}/validate`

Validation Papa.

### POST `/capsules/{id}/publish`

Publication Massimo.

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
| `/capsules/{id}/validate` | non | oui | oui |
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
