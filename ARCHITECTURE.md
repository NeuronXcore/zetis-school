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
- **journal de production et veto** (`/journal`, ADR-0034) : ce que ZETIS a produit lot par lot,
  pièce par pièce, et le geste *Retirer* tant que Massimo n'a pas ouvert. C'est la surface qui rend
  le palier 3 d'autonomie exerçable — sans elle, le droit de veto n'existerait pas ;
- paramètres sécurité et IA.

### `packages/ui` — briques partagées Massimo + Papa

Design system commun (tokens sémantiques mappés par chaque app sur sa palette). Deux points
d'entrée :

- **`@zetis/ui`** (racine) — boutons, cartes, `ConfirmDialog`, `GenerationProgress`,
  `ContentLifecycleActions`, célébration, `SubjectFilterChips` / `SubjectPictogram`… Léger,
  importé partout.
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

## Worker de production

Service : **`apps/backend`** — `python -m app.production_worker`.

- **En production** : service `worker` de `docker-compose.prod.yml`, avec `restart: unless-stopped`
  (ADR-0046). Même image que le backend, `entrypoint` **écrasé** — sinon l'entrypoint de l'image
  relancerait `alembic upgrade head` + uvicorn, soit une **seconde migration concurrente**.
- **En développement** : lancé par `scripts/dev.sh` (étape 4/5) et par les 5 entrées backend de
  `.claude/launch.json` (via `scripts/with-worker.sh`).
- 🔴 **Un seul à la fois, jamais de `--scale`** : un seul Ollama, un seul GPU. Le module refuse de
  démarrer si un worker tourne déjà, et nomme son pid.

> ⚠️ **Ce processus manquait à ce document, et ça a coûté six heures le 2026-08-05** : quatre lots
> ont attendu dans Redis pendant que l'écran affichait « en file d'attente ». Un troisième
> processus qu'aucun document ne nomme est un processus que personne ne lance.
>
> 🔴 **Et il n'a pas suffi de le nommer : la panne est revenue le 2026-08-08**, trois diagnostics
> bloqués deux jours. Le correctif de 2026-08-05 était attaché à **une** porte d'entrée
> (`dev.sh`) ; une seconde est née à côté (`launch.json`), et il n'a pas suivi. D'où l'ADR-0046 —
> un service supervisé, un garde-fou dans le module, et une alerte qui sort de l'écran.
>
> **Détail opérationnel complet : `docs/devops/worker-production.md`.**

Contrairement aux deux workers ci-dessous, il **partage le code du backend** (même paquet, même
runtime) : les jobs y sont enfilés **par fonction**, pas par nom de tâche — il n'y a aucun import
croisé à éviter. **DEUX files** depuis l'ADR-0041 §5 — `production` et `production-priority`,
servies dans cet ordre — concurrence 1 : un rendu vidéo bloqué ne doit pas retarder une production,
et l'inverse. ⚠️ La priorité se **dérive** de l'origine, aucune colonne ne la stocke.

Responsabilités :

- exécuter les lots de production (`run_production`) — équipement d'un chapitre ou d'une pièce ;
- 🔴 **exécuter les TRAVAUX UNITAIRES** (`run_ai_job`) — quinze producteurs LLM longs y sont passés
  avec l'ADR-0041 §4 : les cinq générateurs, `curriculum_*`, les capsules (script et voix), le
  diagnostic, l'équipement d'une notion. **Ils étaient synchrones dans la requête HTTP** ; ils
  rendent maintenant `202` et attendent leur tour. La concurrence 1 cesse d'être une règle que
  seul le worker respectait pour devenir une propriété du système ;
- porter le **réveil périodique** du déclencheur automatique (`scan_triggers`, ADR-0035) — qui
  **balaie** aussi les travaux morts (ADR-0041 §10.3).

⚠️ **Un `SimpleWorker` RQ charge le code AU DÉMARRAGE et ne le recharge jamais.** Après toute
modification de la table des exécutants (`production/jobs.py`), il faut redémarrer **tous** les
workers : un worker périmé répond « Aucun exécutant pour … », ce qui se lit comme un bug du code
alors que c'en est l'inverse (constaté le 2026-08-06).

**Le backend n'exécute JAMAIS un lot.** Il l'accepte en `202` et l'enfile ; la page suit son état.
Sans ce processus, ZETIS accepte tout et ne produit rien — silencieusement. `GET
/production/runs/active` expose donc `worker_alive`, pour que l'interface distingue une file qui
avance d'une file arrêtée.

En développement, `scripts/dev.sh` le lance (étape 4/5) et l'arrête avec la stack ; `pnpm dev:worker`
le lance seul.

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
