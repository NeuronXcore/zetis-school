# ARCHITECTURE.md — Architecture globale ZETIS

## Résumé

ZETIS est une application locale-first composée de deux interfaces web, d’un backend API, de workers IA/media et d’une couche de données structurée autour de PostgreSQL, pgvector, Redis et MinIO.

L’architecture doit rester simple pendant le MVP, tout en préparant trois évolutions :

1. accès distant lorsque Massimo n’est pas chez Papa ;
2. génération multimodale audio/vidéo ;
3. extension future multi-enfant si l’app devient réutilisable.

## Vue d’ensemble

```txt
┌─────────────────────────────────────────────────────────────────────┐
│                              ZETIS                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐       ┌─────────────────────┐              │
│  │ Frontend Massimo    │       │ Frontend Papa       │              │
│  │ React/Vite          │       │ React/Vite          │              │
│  │ UX enfant           │       │ UX pilotage         │              │
│  └──────────┬──────────┘       └──────────┬──────────┘              │
│             │                             │                         │
│             └──────────────┬──────────────┘                         │
│                            │ HTTPS / REST                           │
│                  ┌─────────▼─────────┐                               │
│                  │ FastAPI Backend   │                               │
│                  │ Auth + API + core │                               │
│                  └───────┬─────┬─────┘                               │
│                          │     │                                     │
│             ┌────────────▼─┐ ┌─▼────────────┐                        │
│             │ PostgreSQL   │ │ Redis        │                        │
│             │ + pgvector   │ │ queues/cache │                        │
│             └──────────────┘ └──────┬───────┘                        │
│                                      │                                │
│                       ┌──────────────▼──────────────┐                 │
│                       │ Workers IA / Media          │                 │
│                       │ RAG, quiz, TTS, capsules    │                 │
│                       └──────────────┬──────────────┘                 │
│                                      │                                │
│                             ┌────────▼────────┐                       │
│                             │ MinIO fichiers  │                       │
│                             └─────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Frontends

### `apps/frontend-massimo`

Responsabilité : interface d’apprentissage de Massimo.

Fonctions principales :

- dashboard enfant ;
- matières ;
- pages dédiées par matière ;
- cours ;
- ELI5 ;
- ELI5 reverse ;
- vocal STT/TTS ;
- mindmaps ;
- diagnostics ;
- quiz ;
- missions ;
- progression XP ;
- capsules IA ;
- chat ZETIS.

### `apps/frontend-papa`

Responsabilité : pilotage parental/pédagogique.

Fonctions principales :

- dashboard Papa ;
- suivi progression ;
- cahier de bord IA ;
- conseil de classe IA ;
- configuration année scolaire ;
- programmes et matières ;
- diagnostics ;
- mode focus ;
- validation contenus générés ;
- pilotage capsules IA ;
- **pilotage mindmaps avec aperçu de fidélité** (voir ci-dessous) ;
- paramètres sécurité et IA.

### `packages/ui` — briques partagées Massimo + Papa

Design system commun (tokens sémantiques mappés par chaque app sur sa palette). Deux points
d'entrée :

- **`@zetis/ui`** (racine) — boutons, cartes, `ConfirmDialog`, `GenerationProgress`,
  `ContentLifecycleActions`, célébration… Léger, importé partout.
- **`@zetis/ui/mindmap`** — **brique de canvas mindmap** (`MindmapWorkspace` + 3 modes + moteur de
  layout elk + nœuds React Flow). Export **en sous-chemin délibérément séparé** : elle embarque
  `@xyflow/react` et `elkjs` (~1,6 Mo), qui n'ont rien à faire dans le bundle des pages qui ne
  rendent pas de carte. Papa la charge en `import()` paresseux (addendum ADR-0016 §A).

Contrat de la brique : **zéro fetch** (la carte descend en prop — le gate `validated` reste dans la
requête serveur de l'appelant) et **zéro logique métier** (l'évaluation de la reconstruction est
injectée par la prop `evaluator`). Trois points de montage : la page mindmaps de Massimo, l'étape
mindmap d'une mission, et l'aperçu Papa. **Un seul renderer** — ce que Papa valide est, par
construction, ce que Massimo verra.

## Backend API

Service : `apps/backend`.

Responsabilités :

- authentification ;
- rôles ;
- lecture/écriture données ;
- orchestration des tâches IA ;
- contrats API ;
- agrégations pour dashboards ;
- stockage des traces pédagogiques ;
- exposition des contenus validés ;
- contrôle des permissions.

Le backend ne doit pas contenir de logique UI. Les frontends ne doivent pas contenir de logique métier durable.

## Workers IA

Service : `apps/worker-ai`.

Responsabilités :

- génération ELI5 ;
- ELI5 reverse evaluation ;
- génération quiz ;
- génération feedback ;
- extraction de lacunes ;
- planification de répétition espacée ;
- résumé cahier de bord ;
- génération de scripts de capsules IA ;
- RAG.

Le worker IA doit fonctionner en tâches asynchrones. L’API crée une tâche, le worker traite, puis l’API expose le résultat.

## Worker media

Service : `apps/worker-media`.

Responsabilités :

- génération audio TTS ;
- préparation assets visuels ;
- rendu vidéo court ;
- stockage MinIO ;
- génération miniatures ;
- transcription STT si nécessaire.

Pour le MVP, les capsules IA peuvent être limitées à : script + storyboard + audio + images statiques. La vidéo complète peut être une V2.

## Données

### PostgreSQL

Stocke les entités durables : utilisateurs, matières, cours, quiz, résultats, missions, lacunes, XP, années scolaires, événements, etc.

### pgvector

Stocke les embeddings utilisés par le RAG. Le choix pgvector évite d’ajouter un service vectoriel séparé au MVP.

### Redis

Utilisé pour :

- file de tâches ;
- cache court ;
- statut des tâches IA ;
- anti-spam vocal/chat ;
- sessions temporaires.

### MinIO

Stocke :

- PDFs importés ;
- images ;
- audios ;
- vidéos ;
- exports Markdown ;
- pièces jointes ;
- mindmaps exportées.

## Rôles

### `child`

Massimo. Accès limité à ses contenus et activités.

### `parent`

Papa. Accès au pilotage, configuration, analyses et validation.

### `admin`

Rôle technique local, éventuellement identique à Papa au MVP.

## Flux principal d’apprentissage

```txt
1. Papa configure l’année scolaire.
2. Papa importe ou valide le programme.
3. Massimo lance un diagnostic.
4. ZETIS détecte les notions à renforcer.
5. ZETIS crée une mission.
6. Massimo reçoit une explication ELI5.
7. Massimo reformule ou répond à un quiz.
8. ZETIS évalue la réponse.
9. ZETIS attribue XP et feedback.
10. ZETIS planifie la prochaine révision.
11. Papa voit la progression et les alertes.
```

## Flux RAG

```txt
Document source
   ↓
Extraction texte
   ↓
Nettoyage
   ↓
Découpage chunks
   ↓
Métadonnées pédagogiques
   ↓
Embeddings
   ↓
Stockage pgvector
   ↓
Recherche contextuelle
   ↓
Réponse IA citant les sources internes
```

## Flux capsule IA

```txt
Notion difficile
   ↓
Script ELI5
   ↓
Storyboard
   ↓
Validation Papa optionnelle
   ↓
Audio TTS
   ↓
Images / scènes
   ↓
Rendu capsule
   ↓
Publication Massimo
   ↓
Quiz post-capsule
```

## Accès local et distant

MVP local : Docker Compose sur machine de Papa.

Accès distant possible :

- VPN WireGuard vers réseau maison ;
- ou VPS reverse proxy ;
- ou déploiement cloud partiel.

Pour un enfant, privilégier la solution la plus simple et contrôlée. L’accès distant ne doit pas exposer l’API sans authentification forte.

## Décisions structurantes

- Deux frontends séparés.
- Backend unique.
- Monorepo.
- PostgreSQL comme source de vérité.
- MinIO pour fichiers.
- pgvector pour RAG MVP.
- Obsidian optionnel uniquement.
- IA abstraite derrière provider interchangeable.
- Validation Papa possible pour contenus importants.

## Risques techniques

| Risque | Impact | Mitigation |
|---|---:|---|
| Scope trop large | Fort | MVP strict, roadmap par phases |
| Génération IA non fiable | Fort | sources, validation, tests, prompts versionnés |
| UI trop complexe pour Massimo | Fort | UX enfant minimaliste, missions courtes |
| Dépendance cloud IA | Moyen | abstraction provider, IA locale optionnelle |
| Données scolaires mal structurées | Fort | modèle pédagogique dès le départ |
| Capsules vidéo trop lourdes | Moyen | V1 script/storyboard/audio avant vidéo complète |

## Principe final

L’architecture doit servir la pédagogie. Chaque service, table, écran ou prompt doit avoir une utilité directe dans le cycle : comprendre → s’entraîner → expliquer → consolider → progresser.
