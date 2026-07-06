# Prompt Claude Code — Missions Lot 2 · slice A backend (ADR-0017)

> À lancer APRÈS la clôture du chantier actif (mono-chantier). PRÉREQUIS DUR :
> le Lot 1 (exécution réelle des étapes, preuves serveur, verdict ADR-0019) est
> mergé — vérifie-le en lecture n°3 ; s'il manque, ARRÊTE-TOI.
> Périmètre : **backend uniquement** — service d'évidence partagé, générateurs
> `revision`/`progression`, scoring déterministe versionné, nouveau contrat
> `/missions/today`, migration 5ter (`validation_status` + `subject_id`
> nullable), routes de pilotage Papa (élection rejouable, validation en lot).
> Aucun frontend dans cette slice.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0017-arbitrage-missions.md` EN ENTIER, amendements
   compris — c'est la spécification de cette slice (décisions 1 à 5ter + Suivi
   Lot 2). Elle fait foi. Lis aussi `adr-0019` (verdict option B — tu ne le
   modifies pas) et la mention ADR-0018 (texte libre embeddings = REPORTÉ,
   n'en implémente rien) ;
3. **Le module réel** `app/modules/missions` post-Lot 1 : migration
   `f3a4b5c6d7e8` (`resource_id`, `started_at`, `step_type` migrés
   `eli5`/`vocal_explain`), preuves d'exécution, templates ordonnés par type
   (§5 amendé), verdict (5bis + ADR-0019), et la **valeur réelle** de
   `MISSION_SCORING_VERSION` (attendue v3 — le code fait foi, tout bump part
   de là) ;
4. Les modèles réels `Mission` / `MissionStep` — confirme l'état exact des
   colonnes avant la migration du §1 (la seule attendue : `validation_status`
   + `subject_id` nullable ; si l'une existe déjà, signale) ;
5. `SpacedReviewCard` et le module `memory` — comment obtenir cartes dues et
   retard (`due_at`, `INACTIVE_CARD_STATUSES`) sans dupliquer sa logique ;
6. `SkillMastery`, `Gap`, `LessonSkill`, `Skill` (y compris notions de
   rattrapage ADR-0010, `level` antérieur) — matière première de l'évidence ;
7. `app/modules/quizzes` : verdicts/scoring pondéré (ADR-0014) — l'évidence
   les LIT, ne les recalcule pas — et **comment le Lot 1 résout le quiz d'une
   notion** (« quiz prêt couvrant la notion ») : même patron pour les nouveaux
   générateurs ;
7bis. Le modèle `Mindmap` (leçon-centré, `validation_status`) et la résolution
   leçon canonique d'une notion (`LessonSkill` + leçon `validated`, règle de
   récence ADR-0011) — l'étape `[mindmap]` des templates amendés se résout
   ainsi : notion → leçon canonique → mindmap `validated` de cette leçon ;
   absente → étape omise ;
8. `config.py` + `.env.example` — le pattern de config existant (les
   pondérations et seuils y vivent, pas dans le code du service) ;
9. Le générateur `generate_remediation` réel — il devient le premier d'une
   famille : repère ce qui se factorise (création mission + étapes template)
   sans le casser.

## Objectif

Le serveur élit LA mission du jour de façon déterministe, auditable et
rejouable : un service d'évidence neutre (mastery, lacunes, verdicts, stats
SRS) alimente un scoring versionné à facteurs nommés ; trois générateurs
(`remediation` existant, `revision`, `progression` nouveaux) produisent des
missions qui naissent `pending` et n'atteignent jamais Massimo sans validation
Papa (gate dans la requête) ; `/missions/today` renvoie
`{ elected, reason, reason_code, scoring_version, alternatives }` ; Papa peut
rejouer l'élection et valider en lot.

## Ordre de travail (commit unique à la fin, mais avance dans cet ordre)

### 1. Migration (la seule)

- `missions.validation_status` : `pending | validated | rejected`, non nul —
  **backfill des missions existantes → `validated`** (nées d'un endpoint Papa,
  invariant déjà satisfait — 5ter).
- `missions.subject_id` → **nullable** (modèle prêt pour les croisées ; AUCUN
  flux croisé dans cette slice — ADR dédié à venir).
- Mets à jour `DATA_MODEL.md` (colonnes + vocabulaire `mission_type` corrigé,
  décision 1) et `API_SPEC.md` §Missions.

### 2. Service d'évidence partagé (module neutre — patron ADR-0011)

- Nouveau module `app/modules/evidence` (schemas + service), **read-only,
  déterministe, zéro LLM, zéro code missions dedans** : par élève —
  mastery par skill (statut, score, récence), lacunes ouvertes (sévérité),
  verdicts/scores pondérés récents (lecture ADR-0014), stats SRS (cartes dues,
  retard max, par matière), notions jamais travaillées (référentiel, rattrapage
  ADR-0010 inclus).
- Le scoring missions en est le **premier client** ; le Conseil de classe sera
  le second — la frontière du module est donc : évidence = FAITS calculés,
  jamais de décision. Fonctions de requête fines (pas un « god object »).

### 3. Générateurs par source (idempotents, étapes déterministes)

- `POST /api/missions/generate-revision` (`require_parent`) : cartes SRS dues →
  **UNE mission par notion due** (top-N par retard, N en config) — jamais de
  mission multi-notions : le verdict d'acquisition du Lot 1 est mono-notion
  (mastery/gap/carte d'UN skill), une mission groupée le casserait. Template
  **rappel d'abord** (§5 amendé : `[mindmap] → [quiz] → eli5 [→ vocal_explain]`),
  budget ~15 min = borne des ÉTAPES (décision 4), `validation_status='pending'`.
- `POST /api/missions/generate-progression` (`require_parent`) : prochaine
  notion non maîtrisée d'un chapitre actif OU notion de rattrapage jamais
  travaillée → mission `progression`, template **découverte d'abord**
  (`eli5 → vocal_explain → [mindmap] → [quiz]`), `pending`.
- Règles communes (factorisation avec `generate_remediation`, sans le casser) :
  idempotence (pas de doublon pour une même source active), dégradation
  gracieuse (ressource absente → étape omise, patron Lot 1), **jamais de
  génération compensatoire** (deux jours d'absence ≠ deux missions), preuves
  et verdict du Lot 1 réutilisés tels quels.
- `generate_remediation` : ses missions naissent désormais `pending` aussi
  (5ter s'applique à TOUS les générateurs) — adapte ses tests existants.

### 4. Scoring déterministe versionné (fonctions pures — tests d'abord)

- `app/modules/missions/scoring.py` : facteurs nommés `severity`,
  `due_pressure`, `continuity`, `variety`, `forced_priority` (plancher manuel).
  Pondérations et seuils dans `config.py` + `.env.example`.
- **`variety` — dérivation actée (micro-addendum ADR-0017)** : la « matière
  élue la veille » se dérive de la dernière mission `active`/`completed` de la
  veille (données de faits existantes — cohérent avec « aucune trace
  d'élection à stocker ») ; une élection non suivie d'un start ne compte pas.
  Si l'addendum n'est pas dans l'ADR au moment de la session, ARRÊTE-TOI.
- **Bump `MISSION_SCORING_VERSION`** depuis la valeur réelle (lecture n°3) —
  la formule d'élection entre dans le périmètre versionné.
- Tables de tests unitaires AVANT le service : chaque facteur isolé,
  composition, tie-breaks stables (deux exécutions = même élection).

### 5. Sélecteur et contrat `/missions/today` (breaking, assumé — décision 3)

- Candidates : `planned | active`, `available_from` atteint,
  **`validation_status = 'validated'` DANS la requête** (patron ADR-0011 —
  aucune mission `pending` ne peut être élue ni sérialisée, par construction).
- Le même gate s'applique à TOUTES les routes student existantes qui servent
  des missions — au minimum `GET /missions` (liste élève),
  `GET /missions/today`, `GET /missions/completed-today` (slice élève) —
  vérifie la liste réelle des routes et gate-les toutes.
- Réponse : `{ elected: MissionStudentOut | null, reason, reason_code,
  scoring_version, alternatives: [≤2] }`. `reason` = phrase template par
  facteur dominant (vocabulaire CLAUDE.md par construction, jamais LLM) ;
  `elected: null` servi tel quel (état serein, pas de mission de remplissage).
- **Frontière de schémas (décision 3)** : `MissionStudentOut` (sans scores,
  facteurs, seuils, motifs) et `MissionPilotOut` (sur-ensemble analytique),
  **deux routers** — jamais un schéma filtré en aval.
- Invariants anti-anxiété testés UN PAR UN (décision 4) : réintégration sans
  pénalité, `failed` jamais écrit par un flux enfant, une seule élue par jour,
  pas de compensation.

### 6. Routes de pilotage Papa (`require_parent`)

- `GET /api/missions/election/today` — **rejoue** l'élection : facteurs,
  scores, version, alternatives (`MissionPilotOut`) — aucune trace stockée,
  l'auditabilité vient du déterminisme.
- `POST /api/missions/validate` — validation **en lot** `{ mission_ids: [...] }` ;
  `POST /api/missions/{id}/reject` — rejet unitaire (`rejected`).
- `GET /api/missions` (Papa) expose `validation_status` + compteur `pending`
  (le badge de la slice C).

### 7. Tests d'intégration

- **Test-verrou 5ter** : une mission `pending` n'apparaît ni dans l'élection ni
  dans aucune route student (inspection du JSON brut).
- Générateurs : idempotence, templates ordonnés par type, `pending` à la
  naissance (remédiation incluse), dégradation sans ressource.
- Élection : chaque facteur dominant → `reason_code` attendu, rejouabilité
  (deux appels = même résultat), `elected: null` sur pool vide.
- Backfill : missions préexistantes `validated`, flux Lot 1 intact (start /
  complete-step / verdict — tests existants verts sans modification).

## Hors périmètre strict

Frontends (slices B/C) ; missions croisées (ADR dédié — seul `subject_id`
nullable est posé) ; flux `manual` portes i/ii/iii (Lot 3, maquette d'abord) ;
texte libre par embeddings (ADR-0018, reporté) ; Conseil de classe ;
auto-validation par type (soupape hors v1) ; toute migration au-delà du §1.

## Si tu es bloqué

Écarts probables : (a) Lot 1 partiellement mergé ou `MISSION_SCORING_VERSION`
introuvable — signale l'état réel et ATTENDS ; (b) le module `memory` n'expose
pas les stats dues sous forme réutilisable — propose la plus petite extraction
(fonction de requête dans `evidence` lisant les modèles, pas de refactor de
`memory`) ; (c) le micro-addendum `variety` est absent de l'ADR — stop (cf. §4).
Toute autre divergence : signale avant de coder.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé : `feat(missions): multi-source generation + deterministic
daily arbitration over shared evidence service (ADR-0017 lot 2)`
