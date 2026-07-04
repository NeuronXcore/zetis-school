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

Quiz, questions, tentatives, réponses.

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

## Mindmaps

Génération, stockage, tentative, évaluation.

## Reports

Cahier de bord, conseil de classe IA.
