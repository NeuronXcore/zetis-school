# DECISIONS.md — Index des décisions d’architecture

## ADR disponibles

- `docs/decisions/adr-0001-z-etis-sans-obsidian-obligatoire.md`
- `docs/decisions/adr-0002-separation-frontends-massimo-papa.md`
- `docs/decisions/adr-0003-monorepo.md`
- `docs/decisions/adr-0004-postgresql-pgvector.md`
- `docs/decisions/adr-0005-capsules-ia-progressives.md`
- `docs/decisions/adr-0006-extension-zetis-clip.md` — Extension navigateur zetis-clip : capture de sources RAG (pages / sélections / PDF) côté Papa vers le pipeline RAG, avec validation humaine — Accepté (2026-07-01)
- `docs/decisions/adr-0007-capsules-ia-remotion.md` — Capsules IA : moteur Remotion (capsule = spec typé ; Player Lot 1 + rendu MP4 Lot 2) — Accepté (2026-07-01)
- `docs/decisions/adr-0008-inference-mlx-vs-ollama.md` — Moteur d'inférence LLM : MLX **rejeté** (plus lent sur M3 Max) ; benchmark qualité de 5 modèles locaux → **adopté `qwen3.6:35b-a3b`** (MoE, qualité ≈ 72b à la vitesse la + rapide ; `OllamaProvider` passe `think:false`) ; embeddings découplés (Ollama/768, zéro migration) ; réf. cloud Claude+GPT prête (clé requise) — Accepté (2026-07-02)
- `docs/decisions/adr-0009-referentiel-programme-scolaire.md` — Référentiel de programme scolaire : génération LLM en deux passes (chapitres → leçons) **dans la hiérarchie existante** (zéro table nouvelle ; `Skill` = référentiel persistant, `Chapter`/`Lesson` = instanciation annuelle), co-construction Papa/IA par nœud (`source` + `validation_status`, le manuel intouchable), `SchoolYear.mode` déprécié, ancrage RAG optionnel, lycée différé à la 2de ; bench T4 → **dérogation cloud étroite** : tâches `curriculum_*` routées vers `claude-sonnet-5` (zéro donnée de Massimo, one-shot Papa, clé en env var, dégradation propre), tout le reste 100 % local — Accepté (2026-07-03)
  - `docs/decisions/adr-0009-addendum-cours-canonique.md` — **Addendum ADR-0009** : le **cours validé** (`Lesson.content_markdown`) est la **source canonique** des dérivés (ELI5, capsule, quiz, mindmap, fiches, SRS) — contexte prioritaire avant le RAG brut et la connaissance du modèle, même porte `pending → validated` ; lien `Lesson ↔ Skill` = table **N-N `lesson_skills`** (PK composite, index sur `skill_id`, `is_primary` en réserve), créée à la passe 2 avec `program_version` ; injection verbatim du cours (pas de ré-indexation RAG) — Accepté (2026-07-03)
- `docs/decisions/adr-0010-generation-skills-only-rattrapage.md` — Génération « skills-only » pour un niveau antérieur (rattrapage) : passes 1+2 enchaînées **en mémoire** (échafaudage jamais persisté), seules les notions sont upsertées en `Skill` (`level` = niveau cible) après prévisualisation + confirmation Papa (rien en base avant) ; trace `ai_jobs` `curriculum_skills_backfill`, dérogation cloud `curriculum_*` inchangée ; précise l'ADR-0009 : passe 1 strictement mono-niveau (few-shot SVT corrigé, prompt passe 1 → v2, passe 2 inchangée en v1) — Accepté (2026-07-03)
- `docs/decisions/adr-0011-contexte-canonique-partage.md` — **Substrat de contexte canonique partagé** pour tous les dérivés : un résolveur unique et neutre `resolve_canonical_context` (module `app/modules/ai/canonical_context.py`, zéro code dérivé) avec le **gate `status='validated'` DANS la requête** (impossible de recevoir un cours non validé), une **convention de prompt à deux sections** (`build_canonical_sections` : cours validé + extraits RAG + règle « le cours fait foi ») et une traçabilité `lesson_id`/`lesson_title` uniforme ; **ELI5 v2** est le premier client qui prouve le substrat (prompt explain → v2, badge « D'après ta leçon … ») ; read-only, dégradation gracieuse (cours → RAG → modèle), adoption incrémentale ; les dérivés suivants (quiz → mindmap → fiches → SRS → capsule) le consomment sans le réécrire — Accepté (2026-07-04)
- `docs/decisions/adr-0015-fiches-revision.md` — **Fiches de révision** : objet **distinct** (granularité **leçon**, ≠ flashcard SRS qui est notion) ; contenu = **spec fermé à budgets** (`FicheSpec` : essentiel / définitions / points-clés / pièges / exemple) → garantit « 1 leçon = 1 page » **par construction** (patron `adr-0007`) ; **dérivé du cours canonique** (`resolve_canonical_context`, gate `validated`, `adr-0011`) ; deck par matière = vue filtrée (aucune relation nouvelle) ; pont **faible** vers SRS (« Ajouter à mes cartes ») ; impression via CSS (aucune lib) ; table **`fiches`** + validation Papa ; génération **par Massimo différée** (fiches ZETIS vs fiches personnelles) — Accepté (2026-07-05)
- `docs/decisions/adr-0016-mindmaps-rendu-layout.md` — **Mindmaps interactives** : rendu **React Flow** (`@xyflow/react`, état contrôlé requis par la reconstruction) + layout **elkjs** (une lib → `radial` / `layered` RIGHT=horizontal / DOWN=vertical ; « équilibrée » = petit glue maison) ; **4 présentations laissées au choix** + **défaut déterministe** `defaultLayout()` (radial si peu profond/peu de feuilles, sinon horizontal) **surchargeable** ; **layout = présentation → côté client** (métier : évaluation/XP restent serveur) ; dérivé canonique (`adr-0011`) ; 2 dépendances épinglées — Accepté (2026-07-05)
- `docs/decisions/adr-0017-arbitrage-missions.md` — **Arbitrage des missions** (moteur de prochaine meilleure action) : `mission_type` fermé **orienté source** (`remediation | revision | progression | manual`), sélecteur = **scoring déterministe versionné** (zéro LLM, facteurs nommés), garde-fous anti-anxiété = **invariants serveur testés** (`failed` jamais écrit côté enfant, pas de pénalité temps), générateurs par source produisant des **étapes à preuves** (§5), **verdict d'acquisition découplé de la complétion** (§5bis : XP d'effort **+50 inconditionnel**, `acquired` vs `review_later` sur seuils reverse+quiz), **validation Papa** des missions générées (§5ter : `validation_status`, gate `validated` dans la requête). **Lot 1 livré** (2026-07-05) : preuves serveur + verdict sur `remediation`. **Amendement acté à l'implémentation** : la prémisse « zéro migration de ciblage » était fausse contre le modèle réel — `MissionStep.resource_id` **et** `missions.started_at` ajoutés à la migration (`f3a4b5c6d7e8`), `step_type` réels migrés `explain→eli5` / `reverse→vocal_explain` ; auto-génération du quiz de mission **reportée au Lot 2** (réutilisation d'un quiz prêt sinon étape omise) — Accepté (2026-07-05)
- `docs/decisions/adr-0018-creation-manuelle-mission.md` — **Création manuelle de mission (« Commander »)** : raffine l'ADR-0017 (type `manual`, validée par construction) sans le rouvrir — Papa apporte le **scope**, ZETIS résout depuis l'évidence les **notions les plus fragiles** (`1−mastery`), preview/confirm **sans état** (patron ADR-0010) ; **fan-out : 1 mission mono-skill par notion cochée** (plafond `MISSION_COMMAND_MAX_SKILLS=3`), `manual`/`validated` par construction ; v1 = **2 portes** (Échéance = chapitre+date ; Thématique = sélection référentiel) — porte Recommandation (attend le Conseil de classe) et **voie texte-libre reportées** (constat read-before-code : `Skill` n'a pas d'embedding, seul `RagChunk` en a) ; `force_priority` **par flag** (plancher, jamais plafond → bump `MISSION_SCORING_VERSION` v1→v2), `due_date` **informationnelle Papa-only** ; migration `a7b8c9d0e1f2` (`force_priority` + `due_date`) — Accepté (2026-07-05)
- `docs/decisions/adr-0019-mindmap-etape-mission.md` — **La reconstruction de mindmap comme étape de mission** : active le créneau `mindmap` du vocabulaire fermé `step_type` (ADR-0017 §5) et amende le verdict §5bis — **verdict option B** : `acquired = reverse≥seuil ET (quiz≥seuil OU mindmap≥seuil)`, la **reconstruction se substitue au quiz** comme signal de rappel (la réexplication reverse reste **toujours** requise) ; preuve = `MindmapAttempt` postérieure au `start`, `mission_mindmap_threshold=70` ; **bump `MISSION_SCORING_VERSION` v2→v3** ; deep-link élève `/mindmaps/reconstruire/:id` (mode build) ; **aucune migration** (`step_type` `String(20)` suffit) — Accepté (2026-07-05)
- `docs/decisions/adr-0020-conseil-de-classe-ia.md` — **Conseil de classe IA** (synthèse périodique Papa-only) : **narration LLM 100 % locale** posée sur le **service d'évidence** (2e consommateur, ADR-0011/0017 ; zéro donnée Massimo vers le cloud, ADR-0008) — le LLM **narre et hiérarchise** une évidence **calculée**, il ne choisit pas de `skill_id` (piochés parmi les notions fragiles fournies, **validés serveur** anti-hallucination) ; **sortie typée versionnée** (`CouncilReportSpec`, `COUNCIL_PROMPT_VERSION`, patron ADR-0007/0015) ; **rapport persisté** (`council_reports` + snapshot d'évidence figé = auditabilité, car artefact LLM non rejouable) ; **pont d'actionnabilité** = recommandation → `create_command_missions` (fan-out **mono-notion**, validation Papa au clic, ADR-0018) ; croisées multi-matières et « évolution » comparative **hors v1** — Accepté (2026-07-06)
- `docs/decisions/adr-0021-equipement-mission-conseil.md` — **Équipement pédagogique d'une mission à sa création** (depuis le Conseil de classe) : « Créer ces missions » = **confirmer (popup Papa) → équiper → créer** ; ZETIS génère le **kit complet** par notion (cours + fiche + SRS + quiz + mindmap, orchestration des générateurs existants, 100 % local) **avant** de créer la mission (ses étapes résolvent les ressources fraîches) ; **auto-validation assumée et bornée** — la popup Papa vaut approbation (soupape §5ter de l'ADR-0017 actée ici, étroitement ; édition/rejet a posteriori), pas de relecture pièce par pièce ; **dégradation gracieuse leçon-centrée** — notion sans leçon canonique validée → contenus leçon-dépendants sautés + signalés (aucune fabrication de curriculum à la volée) ; idempotence (contenu déjà validé non régénéré), `try/except` par pièce ; progression = **barres estimées avec %** par notion — Accepté (2026-07-06)

## Quand créer un ADR ?

Créer un ADR si la décision :

- change la stack ;
- change l’architecture ;
- ajoute une dépendance lourde ;
- modifie la sécurité ;
- rend un service obligatoire ;
- change la séparation Massimo/Papa ;
- change la stratégie IA.

## Format ADR

```md
# ADR-XXXX — Titre

## Statut

Proposé | Accepté | Remplacé | Abandonné

## Contexte

...

## Décision

...

## Conséquences

...
```
