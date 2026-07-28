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
- **Le TEMPS reste strictement côté Papa** : aucun compteur de minutes, aucune
  session, aucun calendrier d'activité dans l'interface de Massimo — un enfant
  chronométré travaille pour le chronomètre.

  > **Amendement du 2026-07-27** (décision Papa). Le principe ci-dessus vaut pour
  > le TEMPS, et pour lui seul. Il est levé pour l'**effort** : Massimo voit
  > désormais sa régularité (7 cases sans compteur de durée), l'engagement qu'il
  > s'est donné, et ses notions consolidées. « ZETIS doit avoir une main de fer
  > dans un gant de velours » — la main de fer, c'est que ZETIS revienne vers lui
  > avec quelque chose de vrai à dire ; le velours, c'est que rien ne casse
  > jamais. Détail : `docs/frontend-massimo/page-accueil.md`.
- Jours sans session **visibles**, jamais masqués : l'absence est une information.
  Dans le calendrier mensuel, ce sont les cases sans teinte — présentes, cliquables,
  et dont le détail annonce « aucune session ». Un mois entièrement vide le dit
  explicitement plutôt que d'afficher une page blanche.

### UI — navigation par CALENDRIER MENSUEL

> **Amendement du 2026-07-27** (décision Papa, postérieure à la maquette). La vue
> était spécifiée en liste par jour avec un filtre de période 7/14/30 jours ; elle
> est remplacée par un **calendrier mensuel cliquable**. On tourne les pages d'un
> cahier : le mois donne l'aperçu, le clic sur une date ouvre le détail. La
> maquette `mockup-activite-massimo.html` montre encore l'ancienne liste et n'est
> plus la référence pour cette section.

- KPI du mois affiché : sessions, temps actif total, moyenne/session.
- **Calendrier du mois** : sept colonnes (lundi → dimanche), cases des mois
  voisins présentes pour garder l'alignement mais inertes, jours futurs atténués.
  Chaque date porte son intensité d'activité (teintes **transparentes**, pas les
  aplats de la heatmap : le numéro du jour doit rester lisible par-dessus) et ses
  minutes actives. Navigation mois précédent / suivant, l'avance au-delà du mois
  courant étant interdite.
- **Granularité assumée** : le mois ici, les 26 semaines sur la heatmap du
  dashboard. Celle-ci répond à « Massimo est-il régulier ? », le calendrier à
  « que s'est-il passé le 6 ? » — ce n'est pas un doublon.
- **Sélection par défaut** : le jour actif le plus récent du mois. Un calendrier
  ouvert sans aucun détail affiché n'apprendrait rien.
- Filtre matière : **pastilles** (`SubjectFilterChips`, pictogrammes via
  `subjectIcons` extrait vers `@zetis/ui` — composant partagé avec le bloc
  Régularité du dashboard).
- Détail du jour sélectionné : en-tête (date, n sessions, minutes actives), puis
  chaque session en carte : `début → fin`, badge « N min actives », timeline des
  événements (heure, icône, libellé, matière, XP).
- Bornes de session affichées depuis les champs **pré-formatés serveur**
  (`started_time`/`ended_time`, Europe/Paris) : reformater l'UTC côté client
  suivrait le fuseau du navigateur et pourrait contredire l'heure des événements
  de la même carte.

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
