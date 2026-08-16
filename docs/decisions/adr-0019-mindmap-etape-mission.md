---
id: "0019"
titre: "La reconstruction de mindmap comme étape de mission"
type: surface
statut: accepte
date: 2026-07-05
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0016", "0017"]
---
# ADR-0019 — La reconstruction de mindmap comme étape de mission

## Statut

Accepté — 2026-07-05. **Active** le créneau `mindmap` du vocabulaire fermé des
`step_type` déjà déclaré par l'ADR-0017 §5 (`lesson | eli5 | quiz | mindmap |
capsule | vocal_explain`) et **amende** le verdict d'acquisition de l'ADR-0017
§5bis. S'appuie sur `adr-0016` (mindmaps leçon-centrées + mode Reconstruire
scoré serveur).

> Ne rouvre pas l'ADR-0017 : le vocabulaire des steps y était déjà fermé et
> incluait `mindmap`. Ce qui manquait — la **règle de preuve** du step et son
> **rôle dans le verdict** — est tranché ici.

## Contexte

Une mission est un parcours de steps à **preuve serveur** (ADR-0017 §5) :
`eli5 → vocal_explain → [quiz]`. Le module mindmaps (ADR-0016) a livré un mode
**Reconstruire** : l'élève reconstitue la carte mentale d'une leçon, le serveur
calcule un score déterministe (0–100, structure seule) et écrit une
`MindmapAttempt`. Cet outil n'était consommé qu'en pratique libre — jamais comme
brique d'une mission. Deux vides à combler :

1. **Preuve** : comment prouver serveur qu'une étape « reconstruire » a été faite.
2. **Verdict** : l'ADR-0017 §Contexte notait déjà que, faute de quiz réutilisable
   pour une notion, une mission se solde par `review_later` **par défaut** (les
   missions `revision` étant les plus fréquentes, §Conséquences) — même quand
   l'élève a démontré un rappel. La reconstruction est une **récupération active**
   de la structure : un signal de rappel légitime, aujourd'hui gâché.

## Alternatives (rôle dans le verdict)

- **(A) Consolidation seule** — le step est obligatoire mais n'entre pas dans le
  verdict (reste `reverse ET quiz`). Minimal, mais laisse le trou « à revoir par
  défaut sans quiz » et rend la reconstruction sans effet sur l'acquisition.
- **(C) Signal requis en plus** — `acquired` exigerait aussi `mindmap≥t`.
  Régressif : le step est **optionnel** (absent sans carte validée) ; l'exiger
  rendrait des missions jamais « acquises » pour une raison hors de portée de
  l'élève. Écarté.
- **(B) Signal de rappel alternatif** — retenu (ci-dessous).

## Décision

1. **Step `mindmap` activé, optionnel, dans les 3 parcours.** Générateurs
   `remediation`, `progression`, `revision` ; placement
   `eli5 → vocal_explain → [mindmap] → [quiz]` (découvrir → réexpliquer →
   **reconstruire la structure** → vérifier). Résolveur
   `_resolve_mission_mindmap_id` : `skill_id → LessonSkill → Lesson(validée) →
   Mindmap(validée)` ; **None ⇒ step omis** (dégradation gracieuse identique au
   quiz). `resource_id` du step = **mindmap_id**.

2. **Règle de preuve** : le step est complété ssi une `MindmapAttempt` pour son
   `resource_id` existe avec `score > 0` **et** `created_at > mission.started_at`.
   Pas de filtre `context`/`completed_at` (le modèle n'en a pas ; une tentative
   n'existe qu'une fois **scorée serveur** — l'existence vaut complétion). Le
   gate est `score > 0` (au moins un nœud correct après le start) : c'est un
   signal d'**effort**, pas un seuil qualité — « compléter ≠ acquérir »
   (ADR-0017 §5bis) ; un `score == 0` (rien placé) ne vaut pas complétion.

3. **Verdict = option B (signal de rappel alternatif).**
   `recall_ok = (quiz ≥ seuil) OU (mindmap ≥ MISSION_MINDMAP_THRESHOLD)` ;
   `acquired = (reverse ≥ seuil) ET recall_ok`. La reconstruction peut **tenir
   lieu de rappel à la place du quiz** ; la **réexplication (reverse) reste
   toujours requise**. Résout le « à revoir par défaut » des notions sans quiz
   mais avec mindmap. Justification pédagogique : rappel structurel (mindmap) et
   rappel par questions (quiz) sont deux formes de **récupération** — l'une ou
   l'autre au seuil est une preuve d'acquisition, adossée à la capacité à
   expliquer.

4. **Versionnage** : le parcours généré change (nouveau step possible) **et** le
   verdict change → **bump `MISSION_SCORING_VERSION` v2→v3** (discipline ADR-0017
   §5 : « un changement de parcours change ce que “mission” veut dire, il se
   trace pareil »). Seuil `MISSION_MINDMAP_THRESHOLD` (défaut 70) en config,
   versionné avec le reste. Le score mindmap est tracé dans le `LearningEvent`
   `mission_verdict` (auditabilité + pilotage Papa via `VerdictOut.mindmap_score`).

5. **Frontière & UX.** Aucune fuite student : `MissionStepStudentOut` reste
   générique (pas de `proof`/score) ; la preuve/`label:"Mindmap"` n'existe que
   sur la route pilot Papa. Côté élève, l'étape mindmap deep-linke vers le mode
   **Reconstruire** de la bonne carte (route `/mindmaps/reconstruire/:mindmapId`,
   slug résolu client-side via `fetchMindmap`), puis retour + « Valider »
   (preuve serveur) — même patron que les étapes eli5/quiz.

## Conséquences

- **Positives** : la reconstruction devient une brique de mission *qui compte* ;
  les notions sans quiz mais avec carte peuvent enfin être « acquises » ;
  réutilisation intégrale de l'infra (moteur d'étapes, `MindmapAttempt`, mode
  build) ; zéro migration (`step_type` tient dans `String(20)`, aucune colonne
  nouvelle) ; substitution *symétrique* quiz↔mindmap sans complexité de flux.
- **Négatives / coûts** : mindmap (mémoire structurelle) et quiz (application) ne
  mesurent pas exactement la même chose — les traiter comme interchangeables pour
  le *rappel* est une hypothèse pédagogique assumée (la réexplication reste le
  garde-fou). Un seuil de plus à régler (`MISSION_MINDMAP_THRESHOLD`). Bump de
  version à propager (page pilotage, tests d'invariants).

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; pointeur ajouté dans ADR-0017 §5bis ;
  MAJ `.env.example` (`MISSION_MINDMAP_THRESHOLD`, `MISSION_SCORING_VERSION=v3`).
- **Code** : `missions/service.py` (constante, résolveur, `_build_steps` /
  `_build_revision_steps`, `_mindmap_score_after`, `_verify_proof`,
  `_complete_mission`), `missions/pilot.py` (`_proof_for_step`,
  `verdicts_recent`), `missions/schemas.py` (`VerdictOut.mindmap_score`),
  `core/config.py`. Front : runner Massimo (CTA + deep-link) + `MindmapSubjectPage`
  (ouvrir-par-id en build) ; pilotage Papa (emoji/label + `mindmap_score`).
- **Tests** : `test_missions_mindmap.py` — génération conditionnelle + ordre,
  preuve (postériorité + `score>0`), verdict option B (substitution sans quiz,
  reverse requis), aucune fuite student, pilot expose la preuve.
- **Observation** : si le taux d'`acquired` via mindmap révèle une sur-attribution
  (le mindmap crédite trop facilement), réviser `MISSION_MINDMAP_THRESHOLD` (bump
  de version) — jamais le principe du garde-fou reverse.
