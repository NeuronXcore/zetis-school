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
- `docs/decisions/adr-0011-contexte-canonique-partage.md` — **Substrat de contexte canonique partagé** pour tous les dérivés : un résolveur unique et neutre `resolve_canonical_context` (module `app/modules/ai/canonical_context.py`, zéro code dérivé) avec le **gate `status='validated'` DANS la requête** (impossible de recevoir un cours non validé), une **convention de prompt à deux sections** (`build_canonical_sections` : cours validé + extraits RAG + règle « le cours fait foi ») et une traçabilité `lesson_id`/`lesson_title` uniforme ; **ELI5 v2** est le premier client qui prouve le substrat (prompt explain → v2, badge « D'après ta leçon … ») ; read-only, dégradation gracieuse (cours → RAG → modèle), adoption incrémentale ; les dérivés suivants (quiz → mindmap → SRS → capsule) le consomment sans le réécrire — Accepté (2026-07-04)
- `docs/decisions/adr-0012-generation-cartes-srs.md` — **Génération et cycle de vie des cartes de révision (SRS)** : le SRS est un client du substrat canonique (ADR-0011) — le contenu d'une carte dérive du **cours validé** de la leçon, 100 % local (ADR-0008). Déclencheur = **validation d'une leçon** (auto async worker-ai, non bloquante) + endpoint manuel Papa de secours. **Upsert clé `(student, skill, card_type)` préservant la planification** (3 branches : A maj contenu / B création due-now / C notion orpheline → suspendue, planif conservée, réactivable) — **jamais de suppression** de ligne. Les cartes héritent de la validation de leur leçon (pas de file de relecture par carte) ; cas dégradé sans cours validé → `pending`, filtrée serveur — Accepté (2026-07-04) ⚠️ collision de numéro avec `adr-0012-stt-whisper-local.md` (à renuméroter)

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
