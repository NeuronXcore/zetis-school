# Page Papa — Cahier de bord IA

## Objectif

Conserver une trace lisible de ce qui s’est passé : apprentissages, difficultés, décisions, contenus générés.

## Événements

- session terminée ;
- quiz réussi/échoué ;
- lacune détectée ;
- lacune résolue ;
- mission créée ;
- capsule générée ;
- contenu validé ;
- note parent.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Cahier de bord IA                                            │
├──────────────────────────────────────────────────────────────┤
│ Filtres : [Matière] [Période] [Type événement]               │
│                                                              │
│ 29/06 — Maths                                                │
│ Diagnostic court : difficulté sur comparaison de négatifs.   │
│ Action proposée : mission + ELI5 reverse.                    │
│                                                              │
│ 28/06 — Français                                             │
│ Mission terminée : temps du récit. Score 72%.                │
└──────────────────────────────────────────────────────────────┘
```

## Données API

- `GET /learning-events`
- `POST /parent/notes`
- `POST /ai/reports/journal-summary`

---

## Vue « Sessions » (maquette `mockup-activite-massimo.html`, validée — Lot 1 de la page)

Objectif : montrer à Papa **tout ce que fait Massimo dans ZETIS** — connexions,
pages visitées, leçons, activités — regroupé en sessions avec temps de travail,
par jour et par date. Les volets IA du cahier (résumés journal, notes parent)
restent au backlog : cette vue est le socle.

### Principes

- **Les sessions ne sont pas stockées, elles sont reconstruites** (event
  sourcing : `learning_events` est la vérité brute, les sessions une projection
  calculée à la lecture). Une session = événements consécutifs espacés de moins
  de `SESSION_GAP_MINUTES = 15`. Changer la constante recalcule tout
  l'historique — aucune migration. Pas de table `sessions` (sobriété).
- **Temps actif = heuristique de présence assumée** : somme des écarts entre
  événements, plafonnés à `ACTIVE_GAP_CAP_MINUTES = 5`. L'UI l'explicite en
  note de bas de carte — Papa doit savoir comment le chiffre est fabriqué.
- Les deux constantes sont **versionnées côté serveur** (même esprit que
  `MISSION_SCORING_VERSION`).
- **Strictement côté Papa** : rien de ce tracking ne remonte dans l'interface
  de Massimo (pas de compteur de temps visible — un enfant chronométré
  travaille pour le chronomètre).
- Jours sans session affichés explicitement (« aucune session ») : l'absence
  est une information.

### UI

- KPI de période : sessions, temps actif total, moyenne/session.
- Filtres : période (7/14/30 jours) + **pastilles de matière**
  (`SubjectFilterChips`, pictogrammes via `subjectIcons` extrait vers
  `@zetis/ui` — composant partagé avec le bloc Régularité du dashboard).
- Par jour : en-tête (date, n sessions, minutes actives), puis chaque session
  en carte : `début → fin`, badge « N min actives », timeline des événements
  (heure, icône Lucide, libellé, matière, XP).

### Télémétrie navigation (seule écriture côté client)

- `POST /api/telemetry/pageview` (rôle child) — body `{ route }`.
- **Le serveur horodate** (jamais de timestamp client) ; dédupe des routes
  identiques consécutives. C'est du déclaratif observationnel : n'influence ni
  XP, ni score, ni verdict — l'exception au « never trust the client » est
  bornée à ça.
- Le frontend Massimo l'appelle à chaque changement de route (hook router).

### Données API (module `parent/activity`, commun avec le dashboard)

- `GET /api/parent/activity/sessions?from=&to=&subject_id=` →
  `{ days: [{ date, sessions: [{ started_at, ended_at, active_minutes,
  events: [{ time, event_type, label, subject_slug, xp, minutes, detail }] }] }] }`
  — projection calculée serveur (seuil 15 min), `review_attempted` consécutifs
  agrégés, bucketing Europe/Paris, `require_parent`, période bornée serveur.

Contrats TypeScript : `packages/types/src/activity.ts` (commun dashboard).
Hooks d'alimentation de `learning_events` : spécifiés dans `page-dashboard.md`
(même chantier, slice A).
