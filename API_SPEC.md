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

### POST `/diagnostics/start`

Crée une session diagnostic.

Entrée :

```json
{
  "student_id": "uuid",
  "subject_ids": ["uuid"],
  "mode": "pre_rentree",
  "level_scope": ["5e", "4e"]
}
```

Sortie :

```json
{
  "diagnostic_id": "uuid",
  "status": "created",
  "first_quiz_id": "uuid"
}
```

### GET `/diagnostics/{id}`

Détail diagnostic.

### GET `/diagnostics/{id}/results`

Résultats par matière/notion.

### POST `/diagnostics/{id}/generate-missions`

Génère missions de remédiation.

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

### GET `/missions?student_id=&status=`

Liste missions.

### GET `/missions/today`

Mission du jour Massimo.

### GET `/missions/{id}`

Détail mission.

### POST `/missions/{id}/start`

Démarre.

### POST `/missions/{id}/complete-step`

Termine une étape.

### POST `/missions/{id}/complete`

Termine la mission.

## Progression

### GET `/progress/summary?student_id=`

Résumé global.

### GET `/progress/subjects?student_id=`

Progression par matière.

### GET `/progress/skills?subject_id=`

Maîtrise par notion.

### GET `/progress/xp`

XP global et par matière.

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
