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
- `docs/decisions/adr-0010-generation-skills-only-rattrapage.md` — Génération « skills-only » pour un niveau antérieur (rattrapage) : passes 1+2 enchaînées **en mémoire** (échafaudage jamais persisté), seules les notions sont upsertées en `Skill` (`level` = niveau cible) après prévisualisation + confirmation Papa (rien en base avant) ; trace `ai_jobs` `curriculum_skills_backfill`, dérogation cloud `curriculum_*` inchangée ; précise l'ADR-0009 : passe 1 strictement mono-niveau (few-shot SVT corrigé, prompts v2) — Accepté (2026-07-03)

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
