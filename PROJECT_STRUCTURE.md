# PROJECT_STRUCTURE.md — Structure du dépôt ZETIS

> **Ce document décrit l'arborescence RÉELLE**, relevée le 2026-08-01, et non une cible.
> Avant cette date il portait une « structure cible » du bootstrap qui n'avait jamais été
> appliquée aux frontends (`app/`, `features/`, `routes/`, `services/`, `styles/`) — et un
> fragment du prompt qui l'avait généré. Un agent qui s'y fiait cherchait des dossiers absents.
>
> Quand le code et ce fichier divergent, **c'est ce fichier qu'on corrige** (règle `CLAUDE.md`
> n°10). La convention des frontends, en particulier, est celle décrite ici : `pages/` et non
> `routes/`, `lib/` et non `services/`.

## Lecture du projet avec Graphify

Claude Code doit utiliser Graphify pour comprendre l'arborescence avant de créer ou modifier des
fichiers. Le graphe est déjà construit (`graphify-out/`) :

```bash
graphify query "<question>"
```

`graphify explain "<concept>"` pour une zone, `graphify path "<A>" "<B>"` pour une relation, et
`graphify update .` après avoir modifié du code. Détail dans `CLAUDE.md`.

## Arborescence

```txt
zetis/
├── *.md                     # doc racine (voir « Racine du projet » plus bas)
├── .env.example
├── docker-compose.yml · .prod.yml · .example.yml
├── package.json             # workspace pnpm
├── .claude/                 # outillage Claude Code
│   ├── commands/            # /cloture, /reprise…
│   ├── launch.json          # serveurs de dev appairés (backend + front, CORS)
│   └── settings.json · settings.local.json
├── apps/
│   ├── frontend-massimo/    # interface enfant (React + Vite)
│   │   ├── index.html · vite.config.ts · package.json
│   │   └── src/
│   │       ├── assets/
│   │       ├── components/  # un sous-dossier par domaine : agenda/ brand/ eli5/ galaxy/
│   │       │                # home/ matiere/ mindmap/ missions/ motivation/ quiz/
│   │       ├── data/        # mocks résiduels (`mock.ts`) — en voie d'extinction
│   │       ├── hooks/       # un hook par page (useSubjectPanoply, useGalaxy…)
│   │       ├── layouts/     # MassimoLayout
│   │       ├── lib/         # clients HTTP + logique pure (notionRoutes, searchFold…)
│   │       ├── pages/       # une page par route, + son `.test.tsx` à côté
│   │       └── test/        # setup Vitest + helpers (bundleGraph.ts)
│   ├── frontend-papa/       # interface parent — même structure, plus :
│   │   └── src/remotion/    # compositions vidéo des capsules
│   ├── backend/             # API FastAPI
│   │   ├── pyproject.toml · alembic.ini
│   │   └── app/
│   │       ├── main.py      # montage des routeurs
│   │       ├── api/ · core/ # dépendances transverses, config
│   │       ├── db/          # modèles SQLAlchemy + migrations Alembic
│   │       ├── modules/     # ~31 modules métier (voir plus bas)
│   │       ├── prompts/     # prompts IA versionnés
│   │       └── tests/
│   ├── extension-zetis-clip/  # extension navigateur Papa (MV3) — capture web/PDF/vidéo → RAG
│   ├── worker-ai/           # tâches IA asynchrones
│   └── worker-media/        # rendu audio/vidéo (RQ + Remotion)
├── packages/                # code partagé entre les deux frontends
│   ├── auth/                # @zetis/auth — auth + client API
│   ├── types/               # @zetis/types — contrats API (source de vérité TS)
│   ├── ui/                  # @zetis/ui — composants + sous-chemins lourds (galaxy, mindmap…)
│   └── prompts/             # réservé (README seul ; les prompts IA vivent côté backend)
├── infra/
│   ├── docker/
│   └── nginx/
├── docs/
│   ├── frontend-massimo/ · frontend-papa/   # une spec par page (+ mockup/)
│   ├── ai/ · backend/ · school/ · design/ · devops/
│   ├── decisions/           # les ADR
│   └── WORKFLOW.md          # méthode de dev agentique
├── prompts/claude-code/     # prompts de slice, un par chantier
├── assets/                  # sources de marque (logos, pictogrammes de matières)
├── scripts/                 # dev.sh, with-worker.sh, bench_llm.py
├── storage/                 # uploads / généré / exports — JAMAIS indexé, JAMAIS commité
└── graphify-out/            # graphe de code — gitignoré, reconstruit par `graphify update .`
```

⚠️ Pas de `tests/` à la racine : les tests vivent **à côté du code** (`app/tests/` côté backend,
`*.test.ts(x)` à côté du fichier testé côté frontends).

## Les modules backend

`apps/backend/app/modules/` porte la logique métier, un dossier par domaine. Au 2026-08-05 :

```txt
activity · agenda · ai · auth · capsules · chat · content_requests · curriculum · dashboard
diagnostics · eli5 · engagement · evidence · fiches · galaxy · gamification · memory · mindmaps
missions · motivation · news · notions · production · progress · quizzes · rag · reports
review_queue · school · stt · subjects · tts
```

> **`review_queue`** (2026-08-05, `adr-0039`) — source **unique** du « en attente de relecture ».
> La page `/relecture` **et** la ligne `validation` de la file du Dashboard en dérivent toutes deux.
> Il ne vit ni dans `dashboard` (dont le router s'interdit tout query param, ADR-0028 §1) ni dans
> `production` (dont `coverage.py` est verrouillé sur quatre colonnes leçon-centrées, où ni les
> capsules ni les chapitres n'entrent). **Lecture seule.**

Chaque module suit le même patron : `router.py` (routes + garde de rôle), `schemas.py` (Pydantic),
`service.py` (métier). Les routes **élève** et **parent** vivent dans des routeurs séparés du même
module — la frontière Massimo/Papa est tenue par le serveur, jamais par l'UI.

### Les modules PLATS — un fichier, aucun domaine

⚠️ **Une seconde forme existe, et elle n'était documentée nulle part** : des fichiers seuls
directement sous `modules/`, sans dossier, sans route, sans schéma. Ils répondent à **une question
transverse** que plusieurs domaines se posent, et vivre chez l'un d'eux les rendrait inappelables
par les autres (patron ADR-0011 §1).

```txt
provenance.py         # « qui a laissé passer ce contenu ? » — SEUL écrivain de `validated_by`
lesson_resolution.py  # « quelle est LA leçon de cette notion ? » — ADR-0037
```

**Le critère pour en créer un** : la question a **plusieurs lecteurs** et **une seule bonne
réponse**. Si deux modules y répondent chacun de leur côté, ils finiront par diverger — c'est
exactement ce qui a produit `lesson_resolution.py`, après que trois modules eurent donné trois
réponses différentes à la même question.

⚠️ **Un module plat n'importe aucun module de domaine.** `lesson_resolution` ne touche que
`app.db.models` : le loger dans `curriculum` aurait créé un cycle avec `ai.canonical_context`, qui
en est l'un des appelants.

## Racine du projet

| Fichier | Rôle |
|---|---|
| `README.md` | présentation, stack, démarrage, ordre de lecture |
| `CLAUDE.md` | instructions opérationnelles pour Claude Code — **le plus important** |
| `docs/WORKFLOW.md` | méthode de dev par chantier (cadrage → exécution → clôture) |
| `MEMORY.md` | mémoire de **reprise** : fait / en cours / prochain pas, pour une session sans contexte |
| `TROUBLESHOOTING.md` | écarts réels rencontrés, avec leur cause et la parade |
| `ARCHITECTURE.md` | services, flux, responsabilités |
| `TECH_STACK.md` | stack retenue et justification |
| `PRODUCT_SPEC.md` | personas, parcours, modules, critères de succès |
| `DATA_MODEL.md` | entités, relations, règles métier pédagogiques |
| `API_SPEC.md` | contrats API |
| `DECISIONS.md` | index des ADR |
| `ROADMAP.md` · `BACKLOG.md` · `SUIVI_DEVELOPPEMENT_ZETIS.md` | phases, priorités, suivi |
| `SECURITY.md` · `DEPLOYMENT.md` · `CONTRIBUTING.md` · `GLOSSARY.md` · `CHANGELOG.md` | — |
| `FRONTEND_ROADMAP.md` | découpage des chantiers frontend |

## Pourquoi deux frontends

Massimo et Papa n'ont ni les mêmes besoins, ni les mêmes permissions, ni le même langage, ni la
même charge cognitive. Deux apps évitent une interface hybride confuse — et la séparation est
**tenue par le serveur** (routeurs `require_child` / `require_parent`), pas seulement par l'UI.

## Conventions de code frontend

- **Une page par route**, dans `pages/`, avec son test à côté.
- **Aucune règle métier dans un composant** : elle vit dans un hook (`hooks/`) ou dans un module
  pur (`lib/`). Les composants rendent ce qu'on leur donne.
- **`lib/` mélange deux choses volontairement** : les clients HTTP (patron `headers()` +
  `asJson<T>()` recopié par module, pas de client abstrait) et la **logique pure** testable hors
  React. Un module pur ne doit importer aucune valeur — c'est ce qui permet de le partager entre
  une page légère et une page qui paie Three.js.
- **Les types d'API vivent dans `packages/types`**, jamais redéclarés dans une app.
- **`packages/types/contracts/`** (2026-08-04) — des réponses **capturées** du serveur réel, figées
  et versionnées, qui servent de **point de contact** entre les deux côtés d'un endpoint. Relues par
  **deux** tests : un backend (« la réponse a exactement ces clés »), un front (« les composants
  rendent à partir de ce fichier, **sans mock** »). ⚠️ C'est la seule chose qui peut voir un
  renommage de clé JSON — le backend se teste contre lui-même et le front mocke, donc les deux
  suites restent vertes sur un contrat rompu. **Un fichier de ce dossier se CAPTURE, il ne s'écrit
  pas** (sinon c'est un mock de plus), et seules ses **clés** engagent. Cf. son `README.md`.

## Règle de maintenance

Quand une fonctionnalité change :

1. mettre à jour le code ;
2. mettre à jour le test ;
3. mettre à jour le document de module (`docs/…`) ;
4. mettre à jour `API_SPEC.md` si un contrat bouge ;
5. mettre à jour `BACKLOG.md` / `ROADMAP.md` si un statut change ;
6. `graphify update .` pour que la carte du code suive.
