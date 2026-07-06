# Prompt Claude Code — Missions · Lot 1 backend (ADR-0017 : preuves + verdict)

## Texte d'ouverture de session (à coller tel quel)

Tu vas implémenter le Lot 1 backend des missions selon
`docs/decisions/adr-0017-arbitrage-missions.md` (décisions 5, 5bis, 5ter pour
la migration). Lis d'abord `CLAUDE.md`, le SUIVI, puis la liste
read-before-code ci-dessous. Une seule étape : ce lot, rien d'autre.
Stop-on-blocker : si le code réel diverge de ce prompt ou de l'ADR,
arrête-toi et signale — ne code jamais autour.

---

## Contexte

L'étape 15 a livré des missions de remédiation à complétion **déclarative**
(« J'ai terminé » → lacune résolue + XP). Ce lot la remplace par des étapes à
**preuves serveur** et un **verdict d'acquisition** découplé de la complétion,
sur le type `remediation` existant. Le sélecteur, les nouvelles sources et le
pilotage Papa sont le Lot 2 (session ultérieure) — ne les anticipe pas.

## Read-before-code (obligatoire, dans cet ordre)

1. `docs/decisions/adr-0017-arbitrage-missions.md` — décisions 5 / 5bis / 5ter.
2. Modèles réels : `Mission`, `MissionStep` (vérifier `step_type`,
   `resource_id` — l'ADR suppose **zéro migration** pour le ciblage des
   étapes ; si le champ manque, STOP et signale), `Gap`, `XPEvent`,
   `SpacedReviewCard`, `QuizAttempt` (champ `context`, valeurs — ADR-0014),
   le retour du **reverse ELI5** (où vit le score ? quel type ?).
3. `app/modules/missions/` existant (service/schemas/router étape 15).
4. `app/modules/quizzes/` : comment un attempt `context=mission` est créé et
   scoré (le quiz de mission est un **client** du moteur ADR-0014 — tu
   n'écris aucune logique de scoring de quiz).
5. `app/modules/memory/` : comment (re)programmer une carte SRS.
6. `config.py` + `.env.example` : conventions de nommage des réglages.

## Migration (la seule du chantier missions — groupée ici)

- `missions.validation_status` : `pending | validated | rejected`, NOT NULL.
  **Backfill des lignes existantes → `validated`** (nées d'un endpoint Papa :
  l'invariant « un humain a approuvé » était déjà satisfait).
- `missions.subject_id` → nullable (croisées futures ; **aucune logique** dans
  ce lot).
- Dès cette migration : **gate `WHERE validation_status='validated'` dans les
  requêtes des routes student existantes** (`/missions`, `/missions/today`) —
  dans la requête, jamais un filtre Python aval.

## Endpoints & service

- `POST /api/missions/{id}/start` : `planned → active`, idempotent.
- `POST /api/missions/{id}/steps/{step_id}/complete` : vérifie la **preuve**
  selon `step_type` — refus 409 si absente :
  - `eli5` / `lesson` : consultation (payload minimal accepté ; tracer) ;
  - `vocal_explain` : un score reverse existe pour ce `skill_id`,
    **postérieur au `start`** de la mission ;
  - `quiz` : une `QuizAttempt` `context=mission` existe pour le
    `resource_id`, **postérieure au `start`**.
  Les étapes se complètent **dans l'ordre** (`sort_order`).
- Complétion de la **dernière** étape → `complete_mission` interne :
  - `status = completed`, **XP crédité inconditionnellement** : **+50**
    (arbitrage ADR-0017 §5bis — corriger `API_SPEC.md` qui disait +20) ;
  - **verdict** : `acquired` si `reverse_score ≥ MISSION_REVERSE_THRESHOLD`
    ET `quiz_score ≥ MISSION_QUIZ_THRESHOLD` (config, `.env.example`) ;
    - `acquired` → mastery à la hausse, lacune liée → `resolved` ;
    - `review_later` → mastery mise à jour honnêtement, lacune →
      `in_progress`, **carte SRS (re)programmée** via le module memory ;
  - réponse : `{ mission_status, verdict, xp_awarded }`.
- **Supprimer** `POST /missions/{id}/complete` (le déclaratif de l'étape 15)
  et sa résolution directe de lacune. Adapter la MissionsPage Massimo
  minimale en conséquence (hors refonte visuelle — slice frontend séparée).

## Générateur (adaptation)

- `generate_remediation` produit désormais des étapes avec `resource_id`
  réels (skill pour eli5/vocal_explain ; quiz pour quiz — générer via le
  moteur ADR-0014 si absent) et des missions en `validation_status=pending`.
- Conséquence transitoire assumée : les nouvelles missions `pending`
  n'atteignent pas Massimo tant que la validation Papa (Lot 2) n'existe pas —
  fournir un **endpoint Papa minimal** `POST /missions/validate {ids}` pour ne
  pas bloquer l'usage entre les deux lots (le pilotage complet reste Lot 2).

## Tests d'invariants (un test par invariant, non négociables)

1. Une mission `pending` n'apparaît **jamais** dans une route student.
2. `complete-step` sans preuve → 409 ; preuve antérieure au `start` → 409 ;
   étape hors ordre → 409.
3. XP crédité même si verdict `review_later`.
4. Verdict `review_later` ⇒ lacune `in_progress` + carte SRS due.
5. Le statut `failed` n'est jamais écrit par un flux student.
6. Aucune pénalité liée au temps : une mission `planned` vieille de 10 jours a
   le même traitement qu'une d'hier.

## Hors périmètre (ne pas coder)

Sélecteur, générateurs `revision`/`progression`, service d'évidence, routes de
pilotage Papa (élection, pilot, verdicts, KPI) → Lot 2. Porte « Commander »,
croisées, Conseil de classe → Lot 3.

## Documentation à mettre à jour (même PR)

`API_SPEC.md` (§Missions : start/complete-step/validate minimal, XP +50,
suppression de `complete`), `DATA_MODEL.md` (`validation_status`, XP +50),
`DECISIONS.md` (ligne ADR-0017), SUIVI (étape dédiée), `CHANGELOG.md`.

## Checklist de fin de session

1. Tous les tests d'invariants passent ; migration réversible.
2. Zéro logique de scoring quiz réécrite (client ADR-0014).
3. Gate en requête vérifié sur toutes les routes student.
4. Docs mises à jour ; fichiers créés/modifiés listés.
5. Commit proposé :
   `feat(missions): proof-based steps + acquisition verdict (ADR-0017 lot 1)`.
