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

## Production (ADR-0023)

Modèle de lecture de la page Papa « Couverture de production » : l'union des cinq pilotages
par type. **Lecture seule** — ne génère rien, ne valide rien. Deux étages séparés : des
fonctions pures (`cell_state`, `row_state`) testables sans base, et une requête agrégée par
matière qui les alimente (aucun N+1).

## Provenance (addendum ADR-0011 §F)

Module neutre d'une seule fonction : `mark_validated(row, by)`. **Unique point d'écriture** de
`validation_status='validated'` + `validated_at`/`validated_by`. Passer par lui garantit qu'aucun
objet ne devient validé sans provenance (test-verrou §F.3). `parent` = relu pièce à pièce ;
`parent_bulk` = action groupée (sans exception) ; `system` = servi sans relecture par doctrine,
**strictement réservé au quiz**.

## Agenda (ADR-0025)

Première source **exogène** du produit : les dates viennent du collège, jamais de ZETIS. Objet
volontairement distinct de `Mission` — déclaratif et **invérifiable**, là où une mission est
composée sur des preuves et vérifiée serveur.

Deux routeurs, deux schémas, **jamais mélangés** (patron `MissionStudentOut`/`MissionPilotOut`) :
`/api/student/agenda` (bande glissante, « ce qui arrive », coche, masquage) et `/api/agenda`
(saisie en lot, correction, note privée, archivage, réglages).

Quatre règles tenues **serveur** : seul Massimo écrit `done_at` (**403** explicite côté Papa —
le champ est déclaré au schéma exprès pour que le refus ne soit pas un silence) ;
`edited_by_parent_at` posé par le service, jamais par le client ; archivage jamais suppression ;
doublons tolérés, jamais fusionnés.

**Non probant, par construction.** Deux `learning_events` seulement (`agenda_item_created`,
`agenda_item_done`), regroupés dans `NON_ACTIVITY_EVENTS` (`activity/events.py`) et **exclus de
toutes les projections d'activité** — heatmap, minutes actives, sessions, cahier de bord, jours
de venue. `agenda_item_missed` n'existe pas : l'absence n'est pas un événement. Aucun XP, aucun
effet sur `evidence/service.py` (test-verrou).

Le module ne lit **ni** `missions`, **ni** les cartes SRS : le calendrier n'accueille que ce qui
a une date dans le monde réel (règle de datation §4, test-verrou).

## Engagement (invariants de lecture des dérivés)

Substrat neutre, read-only : « cette ressource est-elle la cible d'une étape d'une mission
active ? ». Les modules dérivés s'en servent pour ouvrir une exception **nommée** à leur gate,
sur les chemins d'**achèvement** uniquement. Règle : *le gate porte sur la découverte, jamais
sur l'achèvement d'un parcours engagé* (addenda ADR-0009 §A et ADR-0016 §6).
