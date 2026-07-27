# Backend — Modules

## Auth

Login, refresh, logout, rôles.

## Users

Profils Papa/Massimo.

## School

Années scolaires, périodes, configuration.

## Subjects

Matières, chapitres, notions.

## Lessons

Cours et ressources pédagogiques.

## Diagnostics

Tests initiaux et périodiques.

## Quizzes

Moteur de quiz unifié (ADR-0014, Lot 1) — quiz de fin de cours en premier client, **deuxième
client du substrat canonique** (ADR-0011). Génération **locale** depuis le cours validé d'une
leçon (formats choisis par le modèle), **auto-vérification à l'aveugle** (question dont le modèle
ne retrouve pas la clé → écartée), **correction déterministe serveur** (7 formats : `mcq`,
`mcq_multi`, `true_false`, `cloze`, `numeric`, `ordering`, `matching`), **scoring pondéré**
(`mission` = signal faible, jamais de `Gap`). Trois surfaces :
- **Papa** (`/api/quizzes/*`, `require_parent`) : génération/régénération par leçon, inspection
  avec clés, édition (→ `manual`), ajout manuel, retrait, suppression (hard/archivage).
- **Pilotage Papa** (`/api/quiz-pilotage/*`) : `overview` (KPI + santé de l'auto-vérif par
  matière), arbre `subjects/{id}` (leçons validées + leurs quiz).
- **Élève** (`/api/student/quiz*`) : `quiz-subjects`, quiz par matière, tentative, feedback
  immédiat et complétion — **jamais** la clé ni l'explication servies à l'avance.

## Missions

Missions, étapes, statut.

## Progress

XP, maîtrise, lacunes, synthèses.

## Spaced memory (`memory`)

Moteur SRS (intervalles fixes MVP), cartes, révisions, planning. Deux surfaces :
- **Élève** (`/api/student/reviews/*`) : `summary` (toutes les matières + `has_cards`),
  `session`, `cards/{id}/attempt`. Mécanique SRS invisible (jamais de `due_at`/`interval`).
- **Pilotage Papa** (`/api/memory/cards/*`, `require_parent`, ADR-0013) : `overview`,
  arbre `subjects/{id}`, génération par matière/notion, réconciliation des orphelines
  (reactivate / delete-skill), et **édition/suppression à la carte** (`PATCH`/`DELETE
  /{card_id}`) — l'édition préserve la planification (§3).

## RAG

Documents, chunks, embeddings, recherche. Ingestion texte (JSON) et fichiers
(MD/TXT/PDF via `extract.py`), upload Papa en statut `pending`, validation/rejet
des sources (`validate`/`reject`), récupération cosinus filtrée `validated`/`official`.

## AI

Jobs, providers, prompts, traces.

## Capsules

Génération LLM d'un spec typé (moteur Remotion), voix Piper, rendu MP4 sandboxé (worker-media),
validation Papa, suivi des visionnages Massimo.

## Fiches

Fiches de révision (ADR-0015) — **dérivé leçon-centré** du cours canonique (ADR-0011) : une fiche
= 1 leçon = 1 page. `FicheSpec` à **budgets** (essentiel / définitions ≤ 4 / points-clés ≤ 5 /
pièges ≤ 3 / exemple), garanti par le miroir Pydantic. Génération : force le cours de LA leçon
comme source + complément RAG (miroir du quiz de fin de cours). Deux surfaces :
- **Papa** (`/api/fiches/*`, `require_parent`) : génération/régénération par leçon, édition
  (revalide → `pending`), validation, suppression, `pilotage/{subject_id}` (arbre matière → leçons
  validées → leurs fiches, miroir quiz-pilotage).
- **Élève** (`/api/student/fiches/*`, gate `validated`) : `summary` (decks : compteur + « nouveau »
  par matière), `subjects/{slug}/fiches` (deck matière), `{id}` (404 si non validée), `{id}/seen`.

## Mindmaps

Génération, stockage, tentative, évaluation.

## Reports

Cahier de bord, conseil de classe IA.
