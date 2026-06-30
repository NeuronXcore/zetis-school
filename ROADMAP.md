# ROADMAP.md — Roadmap ZETIS

## Principe

La roadmap est volontairement progressive. ZETIS peut devenir très vaste, mais le MVP doit prouver un cycle pédagogique complet avant d’ajouter toutes les fonctionnalités avancées.

## État d'avancement (2026-06-30)

MVP livré — **étapes 1 → 10** du `SUIVI_DEVELOPPEMENT_ZETIS.md`. Correspondance avec les phases :

- ✅ **Phase 0** : squelette, infra Docker, healthchecks.
- ✅ **Phases 1-2** : frontends Massimo & Papa + premières pages (données mockées).
- 🟡 **Phase 3** : modèle de données créé (PostgreSQL, 22 tables, migrations), pas encore tout alimenté.
- 🟡 **Phase 5** : ELI5 explain + reverse opérationnel (provider ollama) ; à enrichir.
- 🟡 **Phase 7** : mémoire espacée minimale (intervalles fixes 1/3/7).
- ⬜ **Phases 4, 6, 8-12** : à venir (diagnostic complet, RAG, capsules, vocal, accès distant, multi-enfant).

## Phase 0 — Cadrage et squelette

Objectif : créer un dépôt propre et lançable.

Livrables :

- monorepo ;
- deux frontends Vite ;
- backend FastAPI ;
- Docker Compose ;
- PostgreSQL ;
- Redis ;
- MinIO ;
- healthchecks ;
- navigation vide mais cohérente ;
- thème ZETIS ;
- README et CLAUDE.md.

Critère de succès :

- `docker compose up` lance l’infra ;
- les deux frontends s’affichent ;
- l’API répond `/health`.

## Phase 1 — Frontend Massimo MVP

Objectif : donner à Massimo une interface utilisable.

Livrables :

- dashboard Massimo ;
- sidebar ;
- page matières ;
- pages dédiées par matière ;
- page cours ;
- page quiz ;
- page progression XP ;
- page chat ZETIS ;
- page ELI5 simple.

Critère de succès :

- Massimo peut choisir une matière, lire une explication, répondre à un quiz et voir son XP augmenter.

## Phase 2 — Frontend Papa MVP

Objectif : permettre le pilotage minimal.

Livrables :

- dashboard Papa ;
- vue progression ;
- vue lacunes ;
- configuration matières ;
- lancement diagnostic ;
- cahier de bord IA ;
- paramètres IA ;
- validation de contenus.

Critère de succès :

- Papa voit ce que Massimo a fait et peut orienter les prochaines missions.

## Phase 3 — Modèle pédagogique

Objectif : structurer les données scolaires.

Livrables :

- tables années scolaires ;
- matières ;
- chapitres ;
- notions ;
- leçons ;
- exercices ;
- quiz ;
- réponses ;
- résultats ;
- lacunes ;
- missions ;
- XP ;
- historique de progression.

Critère de succès :

- les résultats de quiz alimentent réellement les lacunes et la progression.

## Phase 4 — Diagnostic N-1 / N

Objectif : diagnostiquer les lacunes de 5e avant et pendant la 4e.

Livrables :

- page diagnostic Massimo ;
- dashboard diagnostic Papa ;
- génération de tests courts ;
- score par notion ;
- priorisation ;
- missions de remédiation ;
- relance plusieurs fois dans l’année.

Critère de succès :

- ZETIS propose automatiquement 3 à 5 notions prioritaires à renforcer.

## Phase 5 — ELI5 complet

Objectif : faire d’ELI5 une vraie méthode, pas une simple explication.

Livrables :

- ZETIS explique simplement ;
- Massimo peut répondre par écrit ;
- Massimo peut répondre en vocal ;
- Massimo peut construire une mindmap ;
- mode reverse : Massimo explique à ZETIS ;
- évaluation de la reformulation ;
- score de compréhension.

Critère de succès :

- Massimo peut prouver qu’il a compris en expliquant la notion avec ses mots.

## Phase 6 — RAG scolaire

Objectif : fonder les explications sur des sources.

Livrables :

- import de documents ;
- chunking ;
- embeddings ;
- recherche contextuelle ;
- citations internes ;
- statut validation source ;
- filtres matière/niveau/chapitre.

Critère de succès :

- ZETIS répond à partir des documents validés au lieu d’improviser.

## Phase 7 — Spaced memory

Objectif : ne pas oublier ce qui a été appris.

Livrables :

- planification de révisions ;
- cartes de mémoire ;
- intervalles adaptatifs ;
- tableau des révisions à venir ;
- rappel des notions fragiles ;
- intégration quiz.

Critère de succès :

- chaque notion fragile revient automatiquement au bon moment.

## Phase 8 — Capsules IA

Objectif : générer de courtes vidéos pédagogiques.

Livrables V1 :

- génération script ;
- storyboard ;
- audio ;
- slides ;
- validation Papa ;
- publication dans l’onglet Capsules IA.

Livrables V2 :

- rendu vidéo ;
- avatar ZETIS ;
- sous-titres ;
- quiz post-capsule ;
- bibliothèque de capsules.

Critère de succès :

- une notion difficile produit une capsule courte utilisable par Massimo.

## Phase 9 — Vocal et interface sonore

Objectif : rendre ZETIS plus vivant.

Livrables :

- STT ;
- TTS ;
- onde sonore ZETIS ;
- sons de feedback ;
- mode conversation ;
- désactivation sonore rapide ;
- paramètres de volume.

Critère de succès :

- Massimo peut utiliser ZETIS sans tout taper au clavier.

## Phase 10 — Accès distant

Objectif : permettre l’usage chez la mère ou hors domicile.

Options :

- WireGuard vers maison ;
- VPS reverse proxy ;
- déploiement cloud partiel.

Critère de succès :

- accès sécurisé et stable depuis iPhone/MacBook.

## Phase 11 — Version iPhone

Objectif : adapter Massimo mobile.

Livrables :

- responsive mobile ;
- bottom navigation ;
- mode capsule ;
- quiz rapide ;
- vocal simplifié ;
- missions du jour.

Critère de succès :

- Massimo peut faire une session courte sur iPhone sans friction.

## Phase 12 — Industrialisation optionnelle

Objectif : préparer une version multi-enfant si le projet devient vendable.

Livrables :

- organisations ;
- multi-enfant ;
- invitation parent ;
- isolation données ;
- facturation éventuelle ;
- conformité renforcée ;
- onboarding générique.

À ne pas faire avant validation du MVP personnel.
