# Prompt Claude Code — Missions · Lot 2 backend (ADR-0017 : validation, évidence, sélecteur)

## Texte d'ouverture de session (à coller tel quel)

Tu vas implémenter le Lot 2 backend des missions selon
`docs/decisions/adr-0017-arbitrage-missions.md` (décisions 1, 2, 3, 5ter).
Le Lot 1 (preuves + verdict) est **mergé** : lis son code réel, pas ce prompt,
pour connaître les signatures. Une seule étape : ce lot.
Stop-on-blocker : si le code réel diverge de ce prompt ou de l'ADR,
arrête-toi et signale — ne code jamais autour.

---

## Contexte

Le Lot 1 a livré preuves, verdict, migration (`validation_status`,
`subject_id` nullable) et un endpoint de validation minimal. Ce lot livre la
boucle courte complète : **service d'évidence** partagé, générateurs
`revision`/`progression`, **sélecteur déterministe** de la mission du jour,
routes de **pilotage Papa** (page `page-missions-pilotage.md`).

## Read-before-code (obligatoire, dans cet ordre)

1. `docs/decisions/adr-0017-arbitrage-missions.md` — décisions 1 / 2 / 3 / 5ter.
2. **Le code du Lot 1 mergé** : `app/modules/missions/` (service du verdict —
   signatures réelles —, refus 409, gate en requête, endpoint validate
   minimal). C'est la réalité qui fait foi, pas le prompt du Lot 1.
3. `app/modules/ai/canonical_context.py` — pour le **patron** du module neutre
   (gate en requête, zéro code consommateur), pas pour l'utiliser ici.
4. `app/modules/memory/` : forme des cartes dues (`due_at`, groupement).
5. Poids de scoring ADR-0014 dans `app/modules/quizzes/` (consommés par
   l'évidence, jamais réécrits).
6. `config.py` + `.env.example` ; `docs/frontend-papa/page-missions-pilotage.md`
   pour les contrats exacts attendus par la page.

## Service d'évidence (module neutre — patron ADR-0011)

- `app/modules/evidence/service.py` : fonctions **déterministes, read-only**,
  zéro dépendance vers missions/conseil :
  `mastery_by_skill()`, `open_gaps()`, `recent_verdicts()`,
  `weighted_quiz_signal()` (poids ADR-0014), `srs_pressure()`.
- Premier client : le sélecteur. Second annoncé : Conseil de classe (ne rien
  coder pour lui, mais ne rien coupler contre lui).

## Générateurs par source (idempotents, tous → `pending`)

- `generate_revision` : cartes dues groupées par matière → mission `revision`
  (template court `lesson|eli5 → quiz`).
- `generate_progression` : prochaine notion non maîtrisée d'un chapitre
  actif, ou notion de rattrapage jamais travaillée (ADR-0010) → template
  complet `eli5 → vocal_explain → quiz`.
- Templates = fonctions pures ; versionnées avec le scoring
  (`MISSION_SCORING_VERSION` couvre formule **et** templates).

## Sélecteur déterministe

- Candidates : `validated` + `planned|active` + `available_from` atteint.
- Score = somme pondérée `severity`, `due_pressure`, `continuity`,
  `variety` (malus même matière que la veille), `forced_priority` (plancher
  des `manual`). **Pondérations et seuils en config**, jamais en dur ;
  `MISSION_SCORING_VERSION = "v1"`.
- `reason_code` = facteur dominant → **phrase template** enfant (dict figé,
  jamais de LLM).

## Endpoints

- `GET /api/missions/today` — **contrat cassant** :
  `{ elected: MissionStudentOut | null, reason, reason_code,
  scoring_version, alternatives: [MissionStudentOut] (≤2) }`.
- Papa : `GET /missions/pending` (avec `generation_reason`),
  `POST /missions/validate {ids}` (étendre le minimal du Lot 1),
  `POST /missions/{id}/reject`, `GET /missions/election/today` (recalcul à la
  demande — déterminisme ⇒ rien à stocker ; retourne facteurs + dominant +
  alternatives + scores + version), `GET /missions/pilot?type=&subject=`,
  `GET /missions/verdicts/recent`, `GET /missions/pilot/summary` (KPI).

## Schémas — frontière serveur (ADR-0017 §3)

- `MissionStudentOut` : id, title, subject(s), `mission_type`, durée, xp,
  steps (type, libellé, status, **sans scores**).
- `MissionPilotOut` = sur-ensemble : + `validation_status`,
  `generation_reason`, preuves avec **valeurs brutes**, provenance.
- Interdit : servir `MissionPilotOut` filtré aux routes student, ou un schéma
  unique. Deux schémas, deux routers, gate en requête.

## Tests d'invariants (en plus de ceux du Lot 1, qui doivent toujours passer)

7. Le sélecteur n'élit jamais une `pending`.
8. Même état de base ⇒ même élection (déterminisme, test répété).
9. `variety` : deux jours consécutifs même matière ⇒ malus appliqué.
10. `reason` servi ∈ dictionnaire de phrases (jamais de texte libre).
11. Aucun champ de `MissionPilotOut` absent de `MissionStudentOut` n'apparaît
    dans une réponse student (test de sérialisation).

## Hors périmètre (ne pas coder)

Porte « Commander » (recommandation/échéance/thématique), résolution par
embeddings, Conseil de classe, croisées automatiques, auto-validation par
type → Lot 3. Refontes visuelles des deux MissionsPage → slices frontend.

## Documentation à mettre à jour (même PR)

`API_SPEC.md` (§Missions complet), `DATA_MODEL.md` (`mission_type` =
vocabulaire par source), SUIVI (étape dédiée), `CHANGELOG.md`.

## Checklist de fin de session

1. Tests d'invariants 1–11 verts ; ceux du Lot 1 non régressés.
2. Service d'évidence sans import de missions/conseil (vérifier les imports).
3. Aucun schéma partagé student/pilot ; gate en requête vérifié.
4. Docs mises à jour ; fichiers créés/modifiés listés.
5. Commit proposé : `feat(missions): validation gate, evidence service,
   deterministic daily selector (ADR-0017 lot 2)`.
