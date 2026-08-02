# CLAUDE.md — Instructions pour Claude Code

Ce fichier est prioritaire pour tous les travaux de développement sur ZETIS.

## Rôle de Claude Code

Claude Code agit comme développeur principal du projet ZETIS. Il doit transformer la documentation Markdown en code propre, maintenable, typé, testable et évolutif. Il ne doit pas improviser une architecture différente si les documents du projet donnent déjà une décision claire.

## Règles générales

1. Lire ce fichier avant toute modification.
2. Lire les documents `.md` liés à la zone concernée.
3. Ne jamais coder une fonctionnalité sans vérifier son rôle produit.
4. Ne jamais mélanger les interfaces Massimo et Papa.
5. Ne jamais stocker une donnée pédagogique durable uniquement côté frontend.
6. Ne jamais rendre Obsidian obligatoire.
7. Préférer un code simple et lisible à une abstraction prématurée.
8. Ajouter ou mettre à jour les types partagés dès qu’un contrat API change.
9. Ajouter un test minimal pour toute logique métier importante.
10. Mettre à jour la documentation si l’implémentation diverge.
11. Suivre `docs/WORKFLOW.md` pour le déroulé de chaque session (cadrage → read-before-code → stop-on-blocker → vérification humaine → clôture) — source unique du process.

## Utilisation obligatoire de Graphify

Claude Code doit utiliser Graphify comme outil de compréhension structurelle du projet ZETIS.

Graphify est utilisé pour construire une carte du projet sous forme de knowledge graph. Cette carte doit aider Claude Code à comprendre :

* l’arborescence du repo ;
* les liens entre frontend Massimo, frontend Papa et backend ;
* les relations entre composants React ;
* les relations entre routes API, services backend et modèles de données ;
* les liens entre documentation, architecture, prompts et code ;
* les décisions techniques déjà prises ;
* les dépendances entre les blocs de développement.

### Règle obligatoire

Avant de modifier le projet, Claude Code doit d’abord analyser le repo avec Graphify.

Commande de principe :

```bash
/graphify .
```

Claude Code doit ensuite utiliser la carte générée pour comprendre le projet avant de créer, déplacer, modifier ou supprimer des fichiers.

### Quand utiliser Graphify

Graphify doit être utilisé :

1. au démarrage du projet ;
2. après la création du squelette ;
3. avant chaque grande étape du fichier `SUIVI_DEVELOPPEMENT_ZETIS.md` ;
4. après chaque modification importante de l’architecture ;
5. avant tout refactor ;
6. avant toute création de nouvelle fonctionnalité majeure ;
7. avant toute modification transversale touchant plusieurs dossiers.

### Ce que Claude Code doit éviter

Claude Code ne doit pas :

* coder sans avoir relu la structure du projet ;
* créer des fichiers en double ;
* inventer une architecture parallèle ;
* ignorer les conventions déjà présentes ;
* modifier plusieurs zones du projet sans comprendre leurs dépendances ;
* remplacer une décision documentée sans justification.

### Workflow attendu

Pour chaque bloc de développement :

```txt
1. Lire CLAUDE.md
2. Lire SUIVI_DEVELOPPEMENT_ZETIS.md
3. Lancer ou consulter Graphify
4. Identifier les fichiers concernés
5. Proposer un plan court
6. Modifier uniquement les fichiers nécessaires
7. Vérifier que le projet démarre
8. Mettre à jour la documentation si besoin
9. Proposer un commit Git clair
```

> Déroulé détaillé de session (ouverture, reprise, clôture) : `docs/WORKFLOW.md`.

### Règle de sécurité

Graphify est un outil d’aide au développement. Il ne doit jamais contenir de secrets, clés API, mots de passe, tokens ou données personnelles sensibles.

Les fichiers suivants ne doivent jamais être indexés volontairement s’ils contiennent des secrets :

```txt
.env
.env.local
.env.production
secrets/
private/
storage/uploads/
storage/generated/
storage/exports/
```

Utiliser uniquement `.env.example` pour documenter les variables d’environnement.

## Déroulé des sessions & mémoire inter-sessions

Le process de travail par chantier est décrit dans **`docs/WORKFLOW.md`** — source unique. À ne pas dupliquer ici. En résumé :

- **Mono-chantier** : une seule branche / un seul chantier actif à la fois ; un hors-périmètre explicite dans chaque prompt. La dérive (« tant qu’on y est… ») est interdite : Claude Code s’arrête au bord du périmètre.
- **Rituel de décision** : `mockup → spec → ADR → prompt`. Une décision figée dans un ADR ne se rediscute pas — Claude Code la **relit**, il ne la rouvre pas.
- **Mémoire** : la conversation est volatile, le **dépôt** est permanent. Tout ce qui doit survivre à une fin de session s’écrit dans le repo :
  - `MEMORY.md` = raisonnement (fait / en cours / à faire / décisions actives / prochain pas), écrit pour un lecteur **sans contexte** ;
  - Git = état du code ;
  - ADR / specs = décisions figées.
  - Graphify **n’est pas de la mémoire** : c’est de l’**orientation** dans le code (réduit le coût de reconstruction après un reset de contexte).
- **Stop-on-blocker** : sur toute divergence réelle avec la doc (signature d’API inattendue, module absent, table non réutilisable…), Claude Code **s’arrête, signale, propose l’ajustement minimal** — il ne code jamais autour.

Raccourcis Claude Code (`.claude/commands/`) :

- **`/ouverture`** — nouveau chantier, depuis un `main` propre : vérifie que le cadrage **existe vraiment** (le fichier ADR, pas seulement sa ligne dans `DECISIONS.md`), crée `feat/<chantier>`, et fait poser **périmètre et hors-périmètre** avant la moindre ligne. **Ne committe pas.** S’arrête si un ADR manque — c’est arrivé le 2026-08-01.
- **`/slice <prompt>`** — exécution d’une slice, dans la cage du `WORKFLOW.md §2.3` : graphify, **read-before-code qui rend un RAPPORT de ce qui était faux**, stop-on-blocker, hors-périmètre, non-régression (un test modifié pour passer = régression masquée). **Elle porte la discipline ; le prompt ne porte plus que le chantier.** Le prompt de slice se colle juste après.
- **`/cloture`** — fin de session (encore lucide) : met à jour `MEMORY.md` (+ `TROUBLESHOOTING.md` / `ARCHITECTURE.md` si nécessaire), remet la carte Graphify à jour, et rend la checklist 9 points. **Ne committe pas** : l’humain vérifie (tests, diff) puis committe. ⚠️ Après le merge, revenir remettre `MEMORY.md` au réel (étape **4bis**, `docs/WORKFLOW.md §5`).
- **`/reprise`** — nouvelle session, contexte perdu : réoriente via Graphify, relit `MEMORY.md` et `git log`, reprend au « prochain pas » **sans recoder l’existant ni re-décider**.

## Objectif produit

ZETIS est une app éducative personnelle pour Massimo, pas un SaaS public dans la première version. Toute décision doit favoriser :

- la progression réelle de Massimo ;
- la simplicité d’utilisation ;
- la lisibilité pour Papa ;
- la robustesse locale ;
- la capacité future à devenir multi-enfant si nécessaire.

## Séparation stricte des domaines

### Frontend Massimo

Interface enfant. Elle doit être :

- simple ;
- motivante ;
- visuelle ;
- gaming mais pas addictive ;
- centrée sur l’action immédiate ;
- peu chargée en informations analytiques.

Massimo ne doit pas voir :

- les paramètres avancés ;
- les analyses parentales détaillées ;
- les diagnostics formulés de manière négative ;
- les prompts système ;
- les informations techniques.

### Frontend Papa

Interface adulte. Elle doit être :

- analytique ;
- configurable ;
- claire ;
- orientée décision ;
- capable de montrer progression, lacunes, missions, programmes, alertes.

Papa doit pouvoir :

- créer une année scolaire ;
- configurer matières et programmes ;
- lancer diagnostics ;
- valider contenus IA ;
- suivre XP, régularité, lacunes ;
- consulter le cahier de bord IA ;
- piloter les capsules IA.

## Stack à respecter

MVP recommandé :

```txt
Frontend : React + Vite + TypeScript + Tailwind + shadcn/ui
Backend  : FastAPI + Python
DB       : PostgreSQL + pgvector
Cache    : Redis
Files    : MinIO
Infra    : Docker Compose
AI       : Ollama local — génération `qwen3.6:35b-a3b` (MoE) via abstraction provider (ADR-0008)
Embeddings : `nomic-embed-text` (768d, pgvector) — local, découplé de la génération (EMBED_PROVIDER)
```

> IA retenue (ADR-0008) : **100 % local via Ollama**, MoE Qwen3 (qualité ≈ 72b à la vitesse la plus
> rapide). Un modèle `qwen3*` impose `think:false` dans `OllamaProvider` (sinon JSON vide). **MLX
> évalué puis rejeté** (plus lent qu'Ollama sur Apple Silicon) ; le `MLXProvider` reste câblé mais
> désactivé. **Cloud = benchmark de qualité, avec UNE dérogation de production** : les tâches
> `curriculum_*` (génération du référentiel de programme) sont routées vers Anthropic
> `claude-sonnet-5` — dérogation étroite justifiée et bornée par l'ADR-0009 (addendum) :
> zéro donnée de Massimo dans ces prompts, tâche one-shot Papa, clé en env var,
> dégradation propre sans clé. Toutes les autres tâches restent 100 % locales
> (vie privée de Massimo). Comparer via `scripts/bench_llm.py`.

Ne pas ajouter Next.js, Supabase, Firebase, Prisma, LangChain, Kubernetes ou un autre framework lourd sans justification écrite dans un ADR.

## Monorepo recommandé

```txt
apps/frontend-massimo
apps/frontend-papa
apps/backend
apps/worker-ai
apps/worker-media
packages/ui
packages/types
packages/prompts
infra/docker
scripts
docs
prompts
```

## Règles de code frontend

- TypeScript strict.
- Composants courts.
- Pas de logique métier lourde dans les composants React.
- Utiliser des hooks dédiés pour les appels API.
- Utiliser des types partagés depuis `packages/types`.
- UI responsive desktop/tablette/mobile.
- Prévoir une version iPhone pour Massimo.
- Préférer des composants shadcn/ui adaptés plutôt que du HTML brut dupliqué.

## Règles de code backend

- FastAPI structuré par domaines.
- Pydantic pour les schémas d’entrée/sortie.
- SQLAlchemy ou SQLModel pour les modèles DB.
- Alembic pour les migrations.
- Services métier séparés des routes.
- Logs structurés.
- Tests sur les services critiques.

Structure recommandée :

```txt
apps/backend/app/
├── main.py
├── core/
├── db/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── school/
│   ├── subjects/
│   ├── lessons/
│   ├── diagnostics/
│   ├── quizzes/
│   ├── missions/
│   ├── progress/
│   ├── rag/
│   ├── ai/
│   └── media/
└── tests/
```

## Règles IA

Toute fonctionnalité IA doit avoir :

- un prompt versionné ;
- un schéma d’entrée ;
- un schéma de sortie ;
- une gestion d’erreur ;
- une trace d’exécution ;
- une stratégie de relecture humaine si contenu sensible ou scolaire important.

Aucune réponse IA ne doit être considérée comme vérité absolue. Le programme
scolaire peut être généré par LLM mais n'est jamais tenu pour vrai : validation
Papa obligatoire avant activation, ancrage sur les sources officielles ingérées
(BO dans le RAG) dès qu'elles existent, référence conservée
(`LearningObjective.source_reference`), version de programme toujours tracée
(`program_version`) — cf. ADR-0009.

## Règles RAG

Le RAG doit distinguer :

- sources officielles ;
- cours importés par Papa ;
- fiches générées ;
- productions de Massimo ;
- historiques de quiz ;
- notes de diagnostic.

Chaque chunk doit conserver :

- source ;
- matière ;
- niveau ;
- chapitre ;
- type de document ;
- date d’import ;
- statut de validation.

## Règles pédagogiques

ZETIS doit privilégier :

- l’explication simple avant l’exercice ;
- la verbalisation par Massimo ;
- la récupération active ;
- la répétition espacée ;
- les mini-victoires ;
- l’absence de formulation humiliant l’enfant.

Ne pas afficher “tu es nul”, “échec”, “grosse lacune”. Utiliser :

- “notion à renforcer” ;
- “mission de consolidation” ;
- “prochaine étape” ;
- “niveau en cours de construction”.

## Règles gamification

La gamification sert l’apprentissage. Elle ne doit pas devenir une mécanique addictive.

Autorisé :

- XP ;
- niveaux ;
- badges pédagogiques ;
- **régularité douce** — un compte de jours dans la semaine, qui ne peut pas casser ;
- **engagement hebdomadaire choisi par l'enfant lui-même** ;
- missions quotidiennes courtes ;
- boss de chapitre.

À éviter :

- loot boxes ;
- récompenses aléatoires excessives ;
- pression quotidienne anxiogène ;
- **série (« streak ») qui se casse** — un capital qu'on peut perdre fait venir par peur de
  perdre, ce n'est pas de l'auto-motivation ;
- **décompte de jours manqués**, sous quelque forme que ce soit ;
- **objectif imposé à l'enfant** — un objectif subi se fuit, un objectif qu'on s'est donné se
  tient ;
- classements sociaux ;
- notifications intrusives.

> Le streak historique a été retiré (2026-07-27) : il tombait à zéro dès un jour entier manqué.
> Voir `docs/frontend-massimo/page-accueil.md` et le module backend `motivation`.

## Règles sécurité

- Aucun secret dans Git.
- Utiliser `.env.example` pour documenter les variables.
- Les tokens doivent être courts et révocables.
- Les rôles doivent être explicites : `child`, `parent`, `admin`.
- Les routes Papa doivent être protégées.
- Les données de Massimo sont privées et ne doivent pas être envoyées inutilement à des services tiers.

## Règles de livraison

Quand une tâche est terminée, Claude Code doit produire :

1. résumé des fichiers modifiés ;
2. commandes à lancer ;
3. migrations éventuelles ;
4. tests ajoutés ;
5. points restant à faire ;
6. risques connus.

> Clôture de session complète (checklist 9 points + message de commit) : `docs/WORKFLOW.md` §6.4, via la commande `/cloture`.

## Interdictions

Ne pas :

- créer une app générique sans rapport avec Massimo ;
- fusionner les dashboards Massimo et Papa ;
- créer une base de données vague sans modèle pédagogique ;
- coder un chatbot sans mémoire ni progression ;
- coder les capsules IA comme simple bouton décoratif ;
- coder ELI5 sans mode reverse ;
- ignorer les mindmaps ;
- hardcoder les matières uniquement dans l’UI ;
- écrire les prompts directement dans les composants React ;
- faire dépendre le projet d’Obsidian.

## Première mission recommandée

Initialiser le monorepo avec :

- deux apps Vite React : `frontend-massimo`, `frontend-papa` ;
- un service FastAPI ;
- Docker Compose PostgreSQL + Redis + MinIO ;
- `packages/types` ;
- pages placeholder cohérentes ;
- navigation sidebar Massimo ;
- navigation Papa ;
- endpoints healthcheck.

Prompt correspondant : `prompts/claude-code/01-bootstrap-monorepo.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
