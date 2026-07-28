# Page Papa — Dashboard

## Objectif

Afficher en une page l’état pédagogique actuel.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Dashboard Papa                      Semaine du 29/06/2026    │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│ │ Sessions   │ │ XP semaine │ │ Lacunes    │ │ Missions   │ │
│ │ 4          │ │ +180       │ │ 5 ouvertes │ │ 3 terminées│ │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│                                                              │
│ Alertes prioritaires                                         │
│ - Maths : nombres relatifs à renforcer                       │
│ - Français : temps du récit à revoir                         │
│                                                              │
│ Recommandations ZETIS                                        │
│ [Créer mission] [Générer capsule] [Lancer diagnostic court]   │
└──────────────────────────────────────────────────────────────┘
```

## KPI

- sessions semaine ;
- temps actif ;
- missions terminées ;
- XP ;
- lacunes ouvertes ;
- notions consolidées ;
- prochaine révision.

**Deltas hebdomadaires** : chaque KPI porte son écart vs semaine précédente
(`+18 min`, `−2`…), calculé serveur dans le payload `GET /parent/dashboard`
(`{ value, delta }` par KPI). Semaine = lundi→dimanche, Europe/Paris.

## Bloc « Régularité » — heatmap d'activité (maquette `mockup-activite-massimo.html`, validée)

Grille type calendrier (26 semaines × 7 jours, lundi en haut), sous les cartes KPI.

- **Intensité = minutes actives du jour**, pas le nombre d'événements (une lecture
  de cours de 20 min vaut plus qu'un clic ; compter les événements biaiserait en
  faveur des révisions SRS). Paliers de couleur — présentation, côté client :
  0 / <10 / 10–20 / 20–40 / 40+ min. Tooltip : date · minutes actives.
- **Filtre matière** : rangée de pastilles « Toutes + matières » au-dessus de la
  grille, pictogrammes via `subjectIcons` **extrait vers `@zetis/ui`**
  (précédent `GenerationProgress`) — jamais d'emoji codé en dur. Composant
  `SubjectFilterChips` partagé avec le Cahier de bord.
- **Badge décrochage** : pastille ambre dans l'en-tête de la carte
  (« aucune activité depuis N jours ») si `days_inactive >= 4`. Calculé serveur,
  affiché à la consultation uniquement — **jamais de notification push** (le
  pilotage par l'anxiété est refusé côté Papa comme côté Massimo).
- **Clic sur un jour → panneau inline** sous la grille (pas de modale — Papa
  compare plusieurs jours sans perdre le contexte) : journal chronologique
  (heure, type, matière, XP) + bouton « Ouvrir dans le cahier de bord »
  (masqué tant que la page n'existe pas). Détail chargé paresseusement au clic.

Règles transverses :

- **Source unique d'activité : `learning_events`.** `xp_events` est le grand livre
  de l'économie XP (solde, niveau, streak) ; `learning_events` est le journal
  d'activité pédagogique. Heatmap et minutes actives se calculent sur
  `learning_events` ; le XP affiché est une métrique séparée sommée depuis
  `xp_events`. Jamais d'UNION des deux tables — pas de double comptage.
- **Bucketing par jour en Europe/Paris**, pas en UTC.
- Jours vides omis du payload, reconstruits côté client (présentation).
- **Minutes actives** : somme des écarts entre événements consécutifs, chaque
  écart plafonné à `ACTIVE_GAP_CAP_MINUTES = 5` (constante versionnée serveur).
  C'est un indicateur de **présence**, pas une mesure d'attention — l'UI
  l'explicite (note sous la carte).
- Routes parent uniquement (`require_parent`).

### Alimentation de `learning_events` (hooks, même chantier)

Helper partagé `log_learning_event(session, student_id, event_type, subject_id?,
skill_id?, payload_json?)` calqué sur `award_xp` (ajout à la session, commit côté
appelant). Table et modèle existants — **aucune migration** hors index (vérifier
qu'un index composite `(student_id, created_at)` existe ; le créer sinon).

| event_type          | Point d'émission                                   | payload_json (indicatif)              |
|---------------------|----------------------------------------------------|---------------------------------------|
| `login`             | endpoint d'authentification (émission serveur)     | `{}`                                   |
| `page_viewed`       | `POST /api/telemetry/pageview` (cf. cahier de bord)| `{route}`                              |
| `lesson_viewed`     | `GET /api/student/lessons/{id}/cours`              | `{lesson_id, lesson_title}`            |
| `fiche_viewed`      | `GET /api/student/fiches/{id}`                     | `{fiche_id}`                           |
| `quiz_attempted`    | submit diagnostic + submit quiz unifié             | `{quiz_id, quiz_type, score_percent}`  |
| `eli5_requested`    | génération d'explication ELI5 (Massimo)            | `{skill_id}`                           |
| `eli5_reverse`      | verbalisation ELI5 reverse                         | `{skill_id}`                           |
| `review_attempted`  | `POST /api/student/reviews/cards/{id}/attempt`     | `{card_id, rating, is_consolidation}`  |
| `mission_completed` | `POST /api/missions/{id}/complete`                 | `{mission_id}`                         |

- **Dédupe des événements de consultation** (`lesson_viewed`, `fiche_viewed`) :
  au plus un par (élève, ressource, jour Europe/Paris) — un refresh n'est pas
  une activité. `page_viewed` : dédupe des routes identiques consécutives.
- Un hook ne doit **jamais** faire échouer l'endpoint hôte : écriture best-effort
  dans la même transaction, sans logique supplémentaire (pas de try/except
  silencieux qui masquerait un bug de schéma).
- Pas de backfill rétroactif depuis `xp_events` : la heatmap démarre vide à la
  pose des hooks (deux sémantiques ne se mélangent pas dans un même journal).

### Fausses bonnes idées écartées (ne pas rouvrir sans mesure)

- Table d'agrégats `daily_activity` : optimisation prématurée pour un élève
  unique — PostgreSQL agrège 6 mois de `learning_events` en millisecondes.
- Tracking client enrichi (scroll, focus, souris) : surveillance comportementale
  disproportionnée ; l'heuristique par écarts suffit.

## Données API

- `GET /parent/dashboard` — KPI avec `{ value, delta }`
- `GET /progress/summary`
- `GET /gaps?status=open`
- `GET /missions?status=active`

### Activité (nouvelles routes, module `parent/activity`)

- `GET /api/parent/activity/heatmap?weeks=26&subject_id=` →
  `{ days: [{ date, active_minutes, events, xp }], days_inactive }` —
  agrégats `GROUP BY` jour sur `learning_events` (+ SUM `xp_events` fusionné en
  service) ; `weeks` borné serveur (défaut 26, max 53) ; `days_inactive` =
  jours consécutifs sans événement en fin de série (toutes matières, même si
  un filtre est actif).
- `GET /api/parent/activity/days/{date}?subject_id=` →
  `{ date, events: [{ time, event_type, label, subject_slug, skill_name?, xp,
  minutes, detail }] }` — journal trié, `review_attempted` consécutifs agrégés
  **côté serveur** en une ligne (« Révision SRS · n cartes »), `minutes` fourni
  par événement (le client ne recalcule rien), `404` si date invalide.

Contrats TypeScript : `packages/types/src/activity.ts` (à créer).
La vue sessions complète vit dans le **Cahier de bord** (`page-cahier-bord.md`).
