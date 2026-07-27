# Prompt Claude Code — Activité · Slice A backend (hooks + télémétrie + projections)

> Socle du chantier « Activité » (specs `page-dashboard.md` §Régularité et
> `page-cahier-bord.md` §Sessions, maquette validée `mockup-activite-massimo.html`).
> Périmètre : **backend uniquement**. Tu poses l'alimentation de `learning_events`
> (helper + 9 hooks + télémétrie), le service de projection (jours, sessions,
> minutes actives) et les 3 routes parent + les deltas KPI. Les frontends sont
> des slices séparées (prompts dédiés).

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (tests offline, séparation Massimo/Papa, stop-on-blocker).
2. `docs/frontend-papa/page-dashboard.md` — sections « Bloc Régularité »,
   « Alimentation de learning_events », « Données API / Activité » **en entier** :
   c'est la spec de cette slice.
3. `docs/frontend-papa/page-cahier-bord.md` — section « Vue Sessions » en entier
   (principes de projection, télémétrie, route sessions).
4. `DATA_MODEL.md` + **le modèle SQLAlchemy réel de `LearningEvent`** (nom exact
   des colonnes : `event_type`, `payload_json`/`payload`, `subject_id`,
   `skill_id`, `created_at`…). **Si le modèle n'existe pas en code** alors que la
   table est dans les migrations, **ARRÊTE-TOI** et propose sa création avant de
   continuer.
5. **Le helper `award_xp` réel** (signature, gestion de session, qui commit) —
   c'est le patron exact de `log_learning_event`.
6. **Chaque endpoint hôte des hooks** (table ci-dessous) : lis le code réel des
   routes avant d'y insérer l'appel — tu insères une ligne au bon endroit du flux
   existant, tu ne restructures rien.
7. Le patron d'un module backend existant (`missions` ou `memory`) : router,
   service, schemas, enregistrement dans l'app — tu crées le module
   `parent/activity` (ou l'emplacement conforme à la structure réelle) sur ce
   modèle.
8. Les dépendances d'auth réelles (`require_parent`, rôle child) — noms exacts.

## Conventions à honorer (lues, pas devinées)

- **Tests** : pytest offline, `conftest.py` existant (fixtures `client`, session,
  factory `student`). Gel du temps pour les tests de projection. Ne régresse
  aucun test existant.
- **Schemas** : Pydantic `extra="forbid"`, bornés.
- **Types partagés** : crée `packages/types/src/activity.ts` (heatmap,
  détail-jour, sessions, KPI `{value, delta}`) et exporte-le depuis l'index du
  package.
- **Migration** : `alembic heads` (un seul head). Migration **uniquement** si
  l'index composite `(student_id, created_at)` manque sur `learning_events` —
  vérifie, crée-le sinon, et dis-le explicitement dans ton rapport.
- **Constantes versionnées** : `SESSION_GAP_MINUTES = 15`,
  `ACTIVE_GAP_CAP_MINUTES = 5`, regroupées avec les constantes serveur
  existantes (même esprit que `MISSION_SCORING_VERSION`).
- **Timezone** : tout bucketing par jour et par semaine en **Europe/Paris**
  (`zoneinfo`), `created_at` restant stocké UTC.

## Objectif

Que le serveur journalise tout ce que fait Massimo dans ZETIS
(`learning_events` = journal d'activité, distinct de `xp_events` = grand livre
XP), et expose à Papa trois lectures : heatmap (minutes actives/jour),
détail-jour, sessions reconstruites.

## Travail demandé

### 1. Helper `log_learning_event`

`log_learning_event(session, student_id, event_type, subject_id=None,
skill_id=None, payload=None)` — patron `award_xp` : ajout à la session, commit
par l'appelant. Best-effort structurel : assez simple pour ne pas pouvoir
échouer, **aucun try/except silencieux**.

### 2. Les 9 hooks

| event_type          | Endpoint hôte                                    | Règle |
|---------------------|--------------------------------------------------|-------|
| `login`             | endpoint d'authentification                      | émission serveur |
| `page_viewed`       | via la route télémétrie (§3)                     | dédupe route identique consécutive |
| `lesson_viewed`     | `GET /api/student/lessons/{id}/cours`            | dédupe 1/(élève, leçon, jour Paris) |
| `fiche_viewed`      | `GET /api/student/fiches/{id}`                   | idem |
| `quiz_attempted`    | submit diagnostic **et** submit quiz unifié      | `payload {quiz_id, quiz_type, score_percent}` |
| `eli5_requested`    | génération d'explication ELI5 (Massimo)          | `payload {skill_id}` |
| `eli5_reverse`      | verbalisation reverse                            | idem |
| `review_attempted`  | `POST /api/student/reviews/cards/{id}/attempt`   | `payload {card_id, rating, is_consolidation}` |
| `mission_completed` | `POST /api/missions/{id}/complete`               | `payload {mission_id}` |

Si un endpoint hôte de la table n'existe pas sous ce chemin exact,
**ARRÊTE-TOI** et signale l'écart au lieu de deviner. Aucun hook ne doit faire
échouer son endpoint hôte. **Pas de backfill** depuis `xp_events`.

### 3. Télémétrie navigation

`POST /api/telemetry/pageview` (rôle child) — body `{route}` (borné, ex. 200
chars). **Le serveur horodate** ; ignore silencieusement (204) une route
identique à la précédente du même élève. Aucune autre écriture client n'est
autorisée dans le journal.

### 4. Service de projection (`activity/service.py`)

Fonctions pures et testées isolément :

- `bucket_days(events, tz)` — regroupement par jour Europe/Paris ;
- `build_sessions(events)` — coupure à `SESSION_GAP_MINUTES` ;
- `active_minutes(events)` — somme des écarts plafonnés à
  `ACTIVE_GAP_CAP_MINUTES` ;
- `group_reviews(events)` — `review_attempted` consécutifs → une ligne agrégée
  (« Révision SRS · n cartes », XP sommé, minutes sommées).

### 5. Routes parent (`require_parent`)

- `GET /api/parent/activity/heatmap?weeks=26&subject_id=` →
  `{days: [{date, active_minutes, events, xp}], days_inactive}` ; `weeks`
  borné (max 53) ; `xp` = SUM `xp_events` du jour (métrique séparée, jamais
  d'UNION) ; `days_inactive` toutes matières même si filtre actif.
- `GET /api/parent/activity/days/{date}?subject_id=` → journal trié, révisions
  agrégées, `minutes` par événement, 404 si date invalide.
- `GET /api/parent/activity/sessions?from=&to=&subject_id=` → jours + sessions
  (`started_at`, `ended_at`, `active_minutes`, events), période bornée serveur.

### 6. Deltas KPI dashboard

Lis l'implémentation réelle de `GET /parent/dashboard`. Si elle existe : chaque
KPI passe à `{value, delta}` (semaine lun→dim Europe/Paris vs précédente). Si
elle n'existe pas encore, expose les 4 KPI de la spec (sessions, temps actif,
XP, missions terminées) avec deltas — et signale-le dans ton rapport.

### 7. Documentation (cibles d'écriture, pas seulement de lecture)

- `API_SPEC.md` : les 4 routes ajoutées.
- `DATA_MODEL.md` : sous `LearningEvent`, la note « `xp_events` = grand livre
  de l'économie XP ; `learning_events` = journal d'activité ; jamais d'UNION ».

### 8. Tests (offline)

Couvre au minimum : hook n'échoue jamais l'endpoint hôte ; dédupe
`lesson_viewed` (2 GET même jour → 1 événement) et `page_viewed` ; événement à
23h30 Paris compté le bon jour ; coupure de session à 15 min (14 min = même
session, 16 min = deux) ; plafond des minutes actives ; agrégation des
révisions ; `subject_id` filtre heatmap et sessions mais pas `days_inactive` ;
403 pour un token child sur les routes parent ; le serveur ignore tout
timestamp fourni par le client télémétrie.

## Fin de session

Checklist 9 points de `CLAUDE.md`, mono-commit
`feat(activity): journal learning_events, télémétrie et projections parent`.
