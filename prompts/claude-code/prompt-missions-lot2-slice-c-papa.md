# Prompt Claude Code — Missions Lot 2 · slice C frontend Papa (ADR-0017)

> À lancer APRÈS le merge des slices A et B. Périmètre : **frontend Papa
> uniquement** — zone « À valider » (validation en lot, rejet unitaire, badge),
> boutons générateurs `revision`/`progression`, panneau « Élection du jour »
> (rejouée). Aucun backend, aucun Massimo.
> Le grand chantier « MissionsPage Papa en vue de pilotage, maquette d'abord »
> appartient au Lot 3 — cette slice est l'ajout MINIMAL exigé par le 5ter.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0017-arbitrage-missions.md` — 5ter (validation) et
   décision 3 (frontière `MissionPilotOut` : les scores/facteurs n'existent
   QUE côté Papa) ;
3. **Les routes réelles** de la slice A : `GET /missions` (avec
   `validation_status` + compteur `pending`), `POST /missions/validate` (lot),
   `POST /missions/{id}/reject`, `GET /missions/election/today`,
   `POST /missions/generate-revision`, `POST /missions/generate-progression` —
   schémas Pydantic réels, jamais supposés ;
4. La `MissionsPage` Papa réelle (étape 15 + évolutions) — tu l'ÉTENDS ; le
   bouton remédiation existant reste ;
5. Les pages de pilotage récentes (quiz-pilotage, cartes SRS) — patron visuel
   Papa (émeraude, analytique), composants réutilisés plutôt que créés.

## Objectif

Papa génère (`remediation`/`revision`/`progression`), voit ce qui attend sa
validation (badge + zone dédiée), valide en lot ou rejette à l'unité, et peut
inspecter l'élection du jour rejouée (facteurs, scores, version, alternatives)
pour répondre à « pourquoi cette mission ce jour-là ? ».

## Ordre de travail

### 1. Client API

- `fetchMissions`, `validateBatch`, `rejectMission`, `fetchElectionToday`,
  `generateRevision`, `generateProgression` — types alignés sur les schémas
  réels ; idempotence (`created: 0`) affichée comme information, pas erreur.

### 2. Zone « À valider »

- Badge compteur `pending` visible au niveau page (et sidebar si le pattern
  badge existe déjà — n'invente pas un système de notification).
- Liste des `pending` : type, source lisible, matière, notions, étapes —
  cases à cocher, « Tout sélectionner », bouton « Valider la sélection » ;
  rejet à l'unité avec confirmation sobre.
- États vides sereins (« Rien à valider »).

### 3. Générateurs

- Deux boutons à côté de « Générer la remédiation » : « Générer les révisions »
  et « Générer la progression » — retour affiché (créées → arrivent en zone
  À valider).

### 4. Panneau « Élection du jour »

- Consomme `GET /missions/election/today` : mission élue, `reason` +
  `reason_code`, `scoring_version`, tableau des facteurs/scores par candidate,
  alternatives. Lecture seule, présentation analytique — c'est le débouché
  visible du déterminisme (rejouable à la demande, rien n'est stocké).

### 5. Vérifications

- `pnpm dev:papa` : générer → valider en lot → vérifier côté Massimo
  (`pnpm dev:massimo`, même stack dev) que seules les validées apparaissent ;
  build OK.

## Hors périmètre strict

Refonte MissionsPage Papa en vue de pilotage complète (Lot 3, maquette
d'abord) ; composer de mission `manual` portes i/ii/iii (Lot 3) ; Conseil de
classe ; auto-validation par type ; toute dépendance nouvelle ; tout backend.

## Si tu es bloqué

Écarts probables : (a) pas de pattern badge existant en sidebar Papa — limite
le badge à la page et signale ; (b) le schéma réel d'`election/today` diverge —
le code réel fait foi, adapte et signale. Toute autre divergence : signale
avant de coder.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé : `feat(papa/missions): pending-validation zone (batch
validate), source generators, replayed daily election panel (ADR-0017 lot 2)`
