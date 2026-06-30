# SUIVI_DEVELOPPEMENT_ZETIS.md

# ZETIS — Suivi de développement par blocs

> Fichier de pilotage à placer à la racine du projet ZETIS.  
> Objectif : avancer avec Claude Code par petites étapes vérifiables, sans coder toute l'application d'un coup.

---

---

### 3. `SUIVI_DEVELOPPEMENT_ZETIS.md`

Là, tu ajoutes une vraie étape au début :

```md
# Étape 0 — Initialiser Graphify

## Objectif

Avant de créer le squelette du projet, Claude Code doit analyser le repo avec Graphify afin de comprendre l’architecture cible.

## Actions

- [ ] Lire `CLAUDE.md`
- [ ] Lire `README.md`
- [ ] Lire `ARCHITECTURE.md`
- [ ] Lire `TECH_STACK.md`
- [ ] Lire `PROJECT_STRUCTURE.md`
- [ ] Lancer Graphify à la racine du projet

```bash
/graphify .
## 1. Règle principale

ZETIS doit être développé par blocs courts, testables et validés un par un.

Claude Code ne doit pas passer à l'étape suivante tant que :

- le bloc courant n'est pas terminé ;
- le projet démarre sans erreur ;
- les fichiers modifiés sont listés ;
- les choix techniques sont expliqués ;
- un commit Git peut être créé proprement.

---

## 2. État global du projet

| Zone | Statut | Commentaire |
|---|---:|---|
| Documentation projet | ⬜ À faire | README, CLAUDE, architecture, stack, roadmap |
| Squelette repo | ⬜ À faire | Monorepo avec apps, packages, database, docker, scripts |
| Frontend Massimo | ⬜ À faire | Shell React/Vite vide puis premières pages |
| Frontend Papa | ⬜ À faire | Shell React/Vite vide puis dashboard admin |
| Backend FastAPI | ⬜ À faire | API minimale puis modules métier |
| Base PostgreSQL | ⬜ À faire | Schéma initial + migrations |
| Auth Papa/Massimo | ⬜ À faire | Auth simple locale au début |
| IA / RAG | ⬜ À faire | À intégrer après socle stable |
| Mémoire espacée | ⬜ À faire | Quiz, révisions, lacunes |
| Capsules IA | ⬜ À faire | Génération progressive après moteur pédagogique |

Légende :

```txt
⬜ À faire
🟨 En cours
✅ Terminé
⛔ Bloqué
🔁 À revoir
```

---

## 3. Principe de travail avec Claude Code

À chaque étape, donner à Claude Code une consigne limitée.

Ne pas dire :

```txt
Code toute l'application ZETIS.
```

Dire plutôt :

```txt
Travaille uniquement sur l'étape 2 : faire tourner le frontend Massimo vide.
Ne modifie pas le backend, ne crée pas encore les pages finales, ne touche pas à l'IA.
À la fin, affiche les fichiers créés/modifiés et les commandes de lancement.
```

---

## 4. Tableau de suivi des 10 blocs

| Étape | Bloc | Statut | Objectif | Validation |
|---:|---|---:|---|---|
| 1 | Créer le squelette | ✅ | Repo propre, dossiers, configs de base | Arborescence complète affichée |
| 2 | Frontend Massimo vide | ✅ | App React/Vite Massimo démarre | Page vide visible localement |
| 3 | Frontend Papa vide | ✅ | App React/Vite Papa démarre | Page vide visible localement |
| 4 | Backend FastAPI | ✅ | API minimale opérationnelle | `/health` répond OK |
| 5 | Connexion front ↔ backend | ✅ | Fronts appellent l'API | Statut backend affiché dans les fronts |
| 6 | Auth Papa/Massimo | ✅ | Deux rôles simples | Accès différencié Papa/Massimo |
| 7 | Premières pages Massimo | ✅ | Accueil, matières, ELI5, diagnostic | Navigation fonctionnelle |
| 8 | Premières pages Papa | ✅ | Dashboard, cahier de bord, années scolaires | Navigation fonctionnelle |
| 9 | Base de données | ✅ | PostgreSQL + schéma initial | Migrations exécutables |
| 10 | IA / RAG / mémoire | ✅ | Moteur pédagogique initial | Réponse IA contextualisée + trace mémoire |

---

# ÉTAPE 1 — Créer le squelette du projet

## Objectif

Créer l'arborescence réelle du repo ZETIS sans développer les fonctionnalités.

Le but est d'obtenir un projet propre, lisible, prêt pour le développement.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : chore: create initial ZETIS project skeleton
```

## Dossiers attendus

```txt
zetis/
├── apps/
│   ├── frontend-massimo/
│   ├── frontend-papa/
│   ├── backend/
│   ├── worker-ai/
│   └── worker-media/
├── packages/
│   ├── ui/
│   ├── types/
│   └── prompts/
├── infra/
│   ├── docker/
│   └── nginx/
├── storage/
├── scripts/
├── docs/
└── prompts/
```

## Fichiers racine attendus

```txt
README.md
CLAUDE.md
ARCHITECTURE.md
TECH_STACK.md
PRODUCT_SPEC.md
PROJECT_STRUCTURE.md
ROADMAP.md
DATA_MODEL.md
API_SPEC.md
SECURITY.md
DEPLOYMENT.md
SUIVI_DEVELOPPEMENT_ZETIS.md
.env.example
.gitignore
docker-compose.yml
package.json
pnpm-workspace.yaml
tsconfig.base.json
```

## Tâches

- [ ] Lire `CLAUDE.md`.
- [ ] Lire `README.md`.
- [ ] Lire `ARCHITECTURE.md`.
- [ ] Lire `TECH_STACK.md`.
- [ ] Lire `PROJECT_STRUCTURE.md`.
- [ ] Créer les dossiers principaux.
- [ ] Créer un `README.md` court dans chaque dossier important.
- [ ] Créer les fichiers de configuration vides ou minimaux.
- [ ] Ne pas développer les fonctionnalités.
- [ ] Afficher l'arborescence finale.

## Critères de validation

L'étape est terminée uniquement si :

- l'arborescence existe réellement ;
- les dossiers Massimo, Papa et Backend sont séparés ;
- les dossiers communs `packages`, `infra`, `storage`, `scripts` existent ;
- aucun gros développement fonctionnel n'a été commencé ;
- Claude Code affiche la liste des fichiers créés.

## Prompt Claude Code

```md
Lis d'abord CLAUDE.md, README.md, ARCHITECTURE.md, TECH_STACK.md, PROJECT_STRUCTURE.md et PRODUCT_SPEC.md.

Ensuite crée uniquement le squelette du projet ZETIS.

Objectif :
- créer l'arborescence réelle du repo ;
- séparer frontend Massimo, frontend Papa et backend ;
- créer les dossiers packages, database, docker, scripts, storage, docs et prompts ;
- créer les fichiers de configuration de base ;
- créer un README.md court dans chaque dossier important ;
- ne pas encore développer les fonctionnalités ;
- ne pas encore créer toutes les pages finales ;
- ne pas encore implémenter l'IA, le RAG ou la mémoire espacée.

Quand tu as terminé :
1. affiche l'arborescence complète ;
2. liste les fichiers créés ;
3. explique brièvement le rôle de chaque dossier ;
4. propose le commit Git correspondant.
```

## Commit conseillé

```bash
git add .
git commit -m "chore: create initial ZETIS project skeleton"
```

---

# ÉTAPE 2 — Faire tourner frontend Massimo vide

## Objectif

Créer une app frontend Massimo minimale avec React, Vite et TypeScript.

Cette app doit démarrer localement, afficher une page simple, et préparer la future interface Massimo.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat(massimo): bootstrap empty frontend shell
```

## Emplacement

```txt
apps/frontend-massimo/
```

## Tâches

- [ ] Initialiser React + Vite + TypeScript.
- [ ] Ajouter Tailwind CSS.
- [ ] Préparer l'installation future de shadcn/ui.
- [ ] Créer `src/main.tsx`.
- [ ] Créer `src/App.tsx`.
- [ ] Créer `src/layouts/MassimoLayout.tsx`.
- [ ] Créer une page temporaire `HomePage.tsx`.
- [ ] Ajouter une sidebar temporaire avec les entrées principales.
- [ ] Vérifier que `npm install` fonctionne.
- [ ] Vérifier que `npm run dev` fonctionne.

## Sidebar temporaire Massimo

```txt
Accueil
Matières
Diagnostic
ELI5
Mindmaps
Capsules IA
Quiz
Progression
Missions
Chat ZETIS
```

## Critères de validation

- Le frontend Massimo démarre sans erreur.
- Une page d'accueil temporaire apparaît.
- La sidebar est visible.
- Aucun appel backend obligatoire à cette étape.
- Aucun design final nécessaire.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 2 : faire tourner le frontend Massimo vide.

Crée une application React + Vite + TypeScript dans apps/frontend-massimo.
Ajoute Tailwind CSS.
Crée une page d'accueil temporaire avec le titre "ZETIS Massimo" et une sidebar temporaire.

Ne développe pas encore les vraies pages.
Ne touche pas au frontend Papa.
Ne touche pas au backend.
Ne touche pas à la base de données.
Ne crée pas encore l'IA.

À la fin :
- donne les commandes pour lancer le frontend Massimo ;
- liste les fichiers créés/modifiés ;
- indique le commit Git conseillé.
```

## Commandes attendues

```bash
cd apps/frontend-massimo
npm install
npm run dev
```

## Commit conseillé

```bash
git add .
git commit -m "feat(massimo): bootstrap empty frontend shell"
```

---

# ÉTAPE 3 — Faire tourner frontend Papa vide

## Objectif

Créer une app frontend Papa minimale avec React, Vite et TypeScript.

Cette app doit être séparée du frontend Massimo et préparer l'interface de pilotage parental.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat(papa): bootstrap empty frontend shell
```

## Emplacement

```txt
apps/frontend-papa/
```

## Tâches

- [ ] Initialiser React + Vite + TypeScript.
- [ ] Ajouter Tailwind CSS.
- [ ] Créer `src/main.tsx`.
- [ ] Créer `src/App.tsx`.
- [ ] Créer `src/layouts/PapaLayout.tsx`.
- [ ] Créer une page temporaire `DashboardPage.tsx`.
- [ ] Ajouter une sidebar temporaire Papa.
- [ ] Vérifier que `npm install` fonctionne.
- [ ] Vérifier que `npm run dev` fonctionne.

## Sidebar temporaire Papa

```txt
Dashboard
Cahier de bord IA
Conseil de classe IA
Années scolaires
Programmes
Diagnostics
Capsules IA
Mode focus
Paramètres
```

## Critères de validation

- Le frontend Papa démarre sans erreur.
- Une page dashboard temporaire apparaît.
- La sidebar Papa est visible.
- Le frontend Papa est indépendant du frontend Massimo.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 3 : faire tourner le frontend Papa vide.

Crée une application React + Vite + TypeScript dans apps/frontend-papa.
Ajoute Tailwind CSS.
Crée un dashboard temporaire avec le titre "ZETIS Papa" et une sidebar temporaire.

Ne modifie pas le frontend Massimo sauf si une configuration commune absolument nécessaire l'exige.
Ne touche pas au backend.
Ne touche pas à la base de données.
Ne crée pas encore les vraies pages Papa.

À la fin :
- donne les commandes pour lancer le frontend Papa ;
- liste les fichiers créés/modifiés ;
- indique le commit Git conseillé.
```

## Commandes attendues

```bash
cd apps/frontend-papa
npm install
npm run dev
```

## Commit conseillé

```bash
git add .
git commit -m "feat(papa): bootstrap empty frontend shell"
```

---

# ÉTAPE 4 — Faire tourner backend FastAPI

## Objectif

Créer un backend Python FastAPI minimal, capable de démarrer et de répondre à une route de santé.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat(backend): bootstrap FastAPI health API
```

## Emplacement

```txt
apps/backend/
```

## Tâches

- [ ] Créer `pyproject.toml`.
- [ ] Ajouter FastAPI.
- [ ] Ajouter Uvicorn.
- [ ] Créer `app/main.py`.
- [ ] Créer `app/api/health.py`.
- [ ] Créer une route `GET /health`.
- [ ] Créer une route `GET /api/version`.
- [ ] Ajouter une configuration CORS temporaire pour les frontends locaux.
- [ ] Ajouter un test minimal si possible.

## Routes minimales

```txt
GET /health
GET /api/version
```

## Réponse attendue `/health`

```json
{
  "status": "ok",
  "service": "zetis-backend"
}
```

## Critères de validation

- Le backend démarre sans erreur.
- `/health` répond correctement.
- La documentation Swagger FastAPI est accessible.
- Aucun module IA ou base de données n'est encore nécessaire.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 4 : faire tourner backend FastAPI.

Crée un backend Python FastAPI minimal dans apps/backend.
Ajoute :
- pyproject.toml ;
- src/main.py ;
- route GET /health ;
- route GET /api/version ;
- configuration CORS locale pour les frontends Massimo et Papa.

Ne crée pas encore la base de données.
Ne crée pas encore les modules IA.
Ne touche pas aux pages frontend sauf documentation de connexion future.

À la fin :
- donne la commande de lancement ;
- montre la réponse attendue de /health ;
- liste les fichiers créés/modifiés ;
- indique le commit Git conseillé.
```

## Commandes attendues

```bash
cd apps/backend
uv venv --python 3.12 .venv
uv pip install --python .venv -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload
```

## Commit conseillé

```bash
git add .
git commit -m "feat(backend): bootstrap FastAPI health API"
```

---

# ÉTAPE 5 — Connecter frontend ↔ backend

## Objectif

Faire communiquer les deux frontends avec le backend FastAPI.

À cette étape, on ne crée pas encore les fonctions métier. On vérifie seulement que Massimo et Papa peuvent lire l'état du backend.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat: connect frontends to backend health API
```

## Tâches backend

- [ ] Vérifier que CORS accepte les deux frontends locaux.
- [ ] Conserver `/health`.
- [ ] Conserver `/api/version`.

## Tâches frontend Massimo

- [ ] Ajouter une variable d'environnement `VITE_API_URL`.
- [ ] Créer `src/lib/api.ts`.
- [ ] Appeler `/health`.
- [ ] Afficher le statut backend dans la page temporaire.

## Tâches frontend Papa

- [ ] Ajouter une variable d'environnement `VITE_API_URL`.
- [ ] Créer `src/lib/api.ts`.
- [ ] Appeler `/health`.
- [ ] Afficher le statut backend dans le dashboard temporaire.

## Critères de validation

- Backend lancé.
- Frontend Massimo lancé.
- Frontend Papa lancé.
- Les deux frontends affichent `Backend : ok` ou équivalent.
- Les erreurs réseau sont gérées proprement.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 5 : connecter les frontends au backend.

Objectif :
- frontend Massimo appelle GET /health ;
- frontend Papa appelle GET /health ;
- chaque frontend affiche le statut du backend ;
- ajouter VITE_API_URL dans les fichiers .env.example nécessaires ;
- gérer l'état loading, success et error.

Ne crée pas encore l'authentification.
Ne crée pas encore la base de données.
Ne développe pas encore les vraies pages métier.
Ne touche pas à l'IA.

À la fin :
- donne les 3 commandes de lancement backend + Massimo + Papa ;
- liste les fichiers créés/modifiés ;
- indique le commit Git conseillé.
```

## Commit conseillé

```bash
git add .
git commit -m "feat: connect frontends to backend health API"
```

---

# ÉTAPE 6 — Ajouter authentification simple Papa / Massimo

## Objectif

Ajouter une authentification simple locale avec deux rôles :

- `papa` : accès pilotage, dashboard, paramètres ;
- `massimo` : accès apprentissage, missions, quiz, ELI5.

À ce stade, l'auth doit rester simple. Pas d'usine à gaz.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat(auth): add simple papa and massimo login
```

## Choix recommandé pour le début

Pour le prototype local :

```txt
Auth simple par utilisateur local + session/JWT de développement.
Pas encore OAuth.
Pas encore multi-famille.
Pas encore SaaS.
```

## Tâches backend

- [ ] Créer un module `auth`.
- [ ] Créer un modèle utilisateur minimal.
- [ ] Créer endpoint `POST /api/auth/login`.
- [ ] Créer endpoint `GET /api/auth/me`.
- [ ] Gérer les rôles `papa` et `massimo`.
- [ ] Ajouter des identifiants de développement dans `.env.example`.

## Tâches frontend

- [ ] Créer une page login Massimo.
- [ ] Créer une page login Papa.
- [ ] Stocker temporairement le token ou la session.
- [ ] Protéger les routes principales.
- [ ] Rediriger selon le rôle.

## Critères de validation

- Papa peut se connecter.
- Massimo peut se connecter.
- Papa ne voit pas l'interface Massimo par défaut.
- Massimo ne voit pas l'interface Papa.
- `/api/auth/me` renvoie le rôle courant.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 6 : authentification simple Papa / Massimo.

Implémente une auth locale minimale pour le prototype.
Rôles requis :
- papa ;
- massimo.

Backend :
- POST /api/auth/login ;
- GET /api/auth/me ;
- token ou session simple ;
- configuration via .env.example.

Frontend :
- page login Massimo ;
- page login Papa ;
- protection simple des routes ;
- redirection selon le rôle.

Ne crée pas encore la base de données complète si ce n'est pas nécessaire.
Ne crée pas encore les fonctions IA.
Ne complexifie pas avec OAuth ou SaaS.

À la fin :
- explique comment tester Papa ;
- explique comment tester Massimo ;
- liste les fichiers créés/modifiés ;
- indique le commit Git conseillé.
```

## Commit conseillé

```bash
git add .
git commit -m "feat(auth): add simple papa and massimo login"
```

---

# ÉTAPE 7 — Créer les premières pages Massimo

## Objectif

Créer les premières vraies pages de l'espace Massimo, sans encore brancher toute l'intelligence artificielle.

Les pages doivent être fonctionnelles visuellement, navigables, et préparées pour recevoir les données plus tard.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat(massimo): add first learning pages
```

## Pages prioritaires Massimo

```txt
Accueil
Matières
Page matière dédiée
Diagnostic
ELI5
Mindmaps
Capsules IA
Progression
```

## Tâches

- [ ] Créer le routing Massimo.
- [ ] Créer `AccueilMassimoPage`.
- [ ] Créer `MatieresPage`.
- [ ] Créer `MatiereDetailPage`.
- [ ] Créer `DiagnosticPage`.
- [ ] Créer `Eli5Page`.
- [ ] Créer `MindmapsPage`.
- [ ] Créer `CapsulesIAPage`.
- [ ] Créer `ProgressionPage`.
- [ ] Ajouter des données mockées.
- [ ] Respecter le design ZETIS.

## Matières à prévoir

```txt
Français
Mathématiques
Histoire-Géo
SVT
Anglais
Espagnol
Physique-Chimie
Technologie
```

## Critères de validation

- Toutes les pages prioritaires sont accessibles depuis la sidebar Massimo.
- La page matière dédiée fonctionne avec au moins une matière.
- Les données peuvent être mockées.
- L'UX doit être simple pour un enfant de 12 ans.
- L'IA n'a pas besoin d'être branchée à cette étape.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 7 : premières pages Massimo.

Crée les pages suivantes dans apps/frontend-massimo :
- Accueil ;
- Matières ;
- Page matière dédiée ;
- Diagnostic ;
- ELI5 ;
- Mindmaps ;
- Capsules IA ;
- Progression.

Utilise des données mockées.
Respecte les docs dans docs/frontend-massimo.
Garde une interface simple, claire, gamifiée, adaptée à Massimo.

Ne branche pas encore le vrai moteur IA.
Ne crée pas encore la base de données finale.
Ne modifie pas le frontend Papa sauf nécessité partagée mineure.

À la fin :
- liste les routes créées ;
- liste les composants créés ;
- indique les données mockées utilisées ;
- indique le commit Git conseillé.
```

## Commit conseillé

```bash
git add .
git commit -m "feat(massimo): add first learning pages"
```

---

# ÉTAPE 8 — Créer les premières pages Papa

## Objectif

Créer les premières vraies pages de l'espace Papa pour piloter l'année scolaire, suivre Massimo et administrer ZETIS.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat(papa): add first supervision pages
```

## Pages prioritaires Papa

```txt
Dashboard
Cahier de bord IA
Conseil de classe IA
Années scolaires
Programmes
Diagnostics
Capsules IA
Mode focus
Paramètres
```

## Tâches

- [ ] Créer le routing Papa.
- [ ] Créer `DashboardPapaPage`.
- [ ] Créer `CahierBordPage`.
- [ ] Créer `ConseilClasseIAPage`.
- [ ] Créer `AnneesScolairesPage`.
- [ ] Créer `ProgrammesPage`.
- [ ] Créer `DiagnosticsPapaPage`.
- [ ] Créer `CapsulesPilotagePage`.
- [ ] Créer `ModeFocusPage`.
- [ ] Créer `ParametresPage`.
- [ ] Ajouter des données mockées.

## Critères de validation

- Toutes les pages prioritaires sont accessibles depuis la sidebar Papa.
- Papa peut voir une synthèse de progression mockée.
- Papa peut voir les lacunes mockées.
- Papa peut voir les recommandations IA mockées.
- L'interface est plus analytique que celle de Massimo.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 8 : premières pages Papa.

Crée les pages suivantes dans apps/frontend-papa :
- Dashboard ;
- Cahier de bord IA ;
- Conseil de classe IA ;
- Années scolaires ;
- Programmes ;
- Diagnostics ;
- Capsules IA ;
- Mode focus ;
- Paramètres.

Utilise des données mockées.
Respecte les docs dans docs/frontend-papa.
L'interface Papa doit être orientée pilotage, décisions, suivi et contrôle parental pédagogique.

Ne branche pas encore le vrai moteur IA.
Ne crée pas encore la base de données finale.
Ne modifie pas le frontend Massimo sauf nécessité partagée mineure.

À la fin :
- liste les routes créées ;
- liste les composants créés ;
- indique les données mockées utilisées ;
- indique le commit Git conseillé.
```

## Commit conseillé

```bash
git add .
git commit -m "feat(papa): add first supervision pages"
```

---

# ÉTAPE 9 — Ajouter base de données

## Objectif

Ajouter PostgreSQL et créer le premier schéma de données ZETIS.

Cette étape doit préparer les données nécessaires à :

- utilisateur Papa ;
- utilisateur Massimo ;
- matières ;
- chapitres ;
- objectifs ;
- diagnostics ;
- quiz ;
- progression ;
- mémoire espacée ;
- traces IA.

## Statut

```txt
Statut : ✅ Fait
Date de début : 2026-06-29
Date de fin : 2026-06-29
Commit Git : feat(database): add PostgreSQL schema and initial migrations
```

## Tâches infrastructure

- [ ] Ajouter PostgreSQL dans Docker Compose.
- [ ] Ajouter éventuellement pgvector dès maintenant si retenu.
- [ ] Ajouter une configuration de connexion backend.
- [ ] Ajouter un outil de migration.
- [ ] Ajouter des seeds de développement.

## Tables initiales recommandées

```txt
users
school_years
subjects
chapters
skills
learning_objectives
diagnostic_sessions
diagnostic_results
quiz_decks
quiz_cards
quiz_attempts
spaced_reviews
learning_events
ai_messages
rag_documents
rag_chunks
capsules
```

## Critères de validation

- PostgreSQL démarre avec Docker Compose.
- Le backend se connecte à PostgreSQL.
- Une migration initiale est exécutable.
- Des données seed minimales existent.
- Le frontend peut encore fonctionner même si toutes les données ne sont pas branchées.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 9 : ajouter la base de données.

Ajoute PostgreSQL au projet.
Prépare le schéma initial ZETIS selon DATA_MODEL.md.
Crée les migrations nécessaires.
Ajoute des seeds de développement pour :
- Papa ;
- Massimo ;
- année scolaire de 4e ;
- matières principales ;
- quelques chapitres mockés.

Le backend doit pouvoir se connecter à PostgreSQL.
Ne branche pas encore tout le frontend si cela rend l'étape trop large.
Ne crée pas encore le vrai moteur IA.

À la fin :
- donne les commandes Docker ;
- donne les commandes de migration ;
- liste les tables créées ;
- indique le commit Git conseillé.
```

## Commit conseillé

```bash
git add .
git commit -m "feat(database): add PostgreSQL schema and initial migrations"
```

---

# ÉTAPE 10 — Ajouter IA / RAG / mémoire

## Objectif

Ajouter le premier moteur pédagogique ZETIS : IA, RAG, mémoire, diagnostic et révision espacée.

Cette étape ne doit pas chercher à tout faire parfaitement. Elle doit créer une première boucle fonctionnelle.

## Statut

```txt
Statut : ✅ Fait — finalisé (boucle ELI5 explain → reverse → trace → mémoire ; contrat explain {job_id,status} aligné API_SPEC ; RAG stubbé/reporté)
Date de début : 2026-06-29
Date de fin : 2026-06-30
Commit Git : feat(ai): add first pedagogical AI memory loop ; refactor(ai): align explain endpoint to {job_id,status} contract
```

## Boucle IA minimale attendue

```txt
1. Massimo pose une question.
2. ZETIS répond en mode pédagogique.
3. La réponse peut utiliser un document de cours si disponible.
4. ZETIS propose une mini-question de vérification.
5. La réponse de Massimo est enregistrée.
6. Une trace de progression est créée.
7. Une révision future est planifiée si nécessaire.
```

## Modules backend attendus

```txt
app/modules/ai/         provider abstrait + mock — ✅ fait
app/modules/eli5/       moteur ELI5 (explain + reverse) + endpoints — ✅ fait
app/modules/memory/     mémoire espacée (cartes, intervalles) — ✅ fait
app/modules/rag/        ✅ fait à l'Étape 11 (pgvector + ingestion + récupération sémantique)
app/modules/gamification/  reporté (XP automatique)
```

## Fonctions prioritaires

- [ ] Chat pédagogique simple.
- [ ] Mode ELI5 ZETIS explique à Massimo.
- [ ] Mode reverse ELI5 : Massimo explique à ZETIS.
- [ ] Stockage des messages IA.
- [ ] Stockage des erreurs ou lacunes détectées.
- [ ] Création de cartes de révision.
- [ ] Planification de révision espacée.
- [ ] RAG minimal sur documents de cours.

## Critères de validation

- Massimo peut poser une question depuis le frontend.
- Le backend renvoie une réponse pédagogique.
- Une trace est enregistrée.
- Une révision peut être créée.
- Le système distingue au moins : explication, quiz, reverse ELI5.

## Prompt Claude Code

```md
Travaille uniquement sur l'étape 10 : première boucle IA / RAG / mémoire.

Objectif : créer une version minimale mais fonctionnelle du moteur pédagogique ZETIS.

À implémenter :
- endpoint de chat pédagogique ;
- mode ELI5 ;
- mode reverse ELI5 ;
- enregistrement des messages ;
- détection simple d'une lacune ;
- création d'une carte de révision ;
- planification simple de révision espacée ;
- RAG minimal sur documents de cours si des documents existent.

Respecte docs/ai et DATA_MODEL.md.
Ne crée pas encore les capsules vidéo complètes.
Ne cherche pas à tout automatiser.
Crée une première boucle fiable et testable.

À la fin :
- donne les endpoints créés ;
- explique la boucle pédagogique ;
- donne un exemple de test complet ;
- liste les fichiers créés/modifiés ;
- indique le commit Git conseillé.
```

## Commit conseillé

```bash
git add .
git commit -m "feat(ai): add first pedagogical AI memory loop"
```

---

# ÉTAPE 11 — RAG sémantique (pgvector)

## Objectif

Donner à la boucle ELI5 un vrai contexte de cours : ingérer des documents,
les vectoriser et récupérer les passages pertinents par similarité cosinus,
puis injecter ce contexte dans `explain`.

## Statut

```txt
Statut : ✅ Fait — RAG sémantique pgvector (embeddings ollama nomic-embed-text 768d)
Date de début : 2026-06-30
Date de fin : 2026-06-30
Commit Git : feat(rag): semantic RAG over course docs (pgvector) wired into ELI5 explain
```

## Ce qui a été fait

```txt
Modèles      rag_documents, rag_chunks (vector 768) + index ivfflat cosinus
Migration    a1b2c3d4e5f6 (extension vector déjà active depuis 5678d02df7f6)
Embeddings   EmbeddingProvider + OllamaEmbeddingProvider (/api/embed) + get_embedder
Module rag   chunking, ingestion vectorisée, recherche cosinus, retrieve_for_skill
Endpoints    POST/GET /api/rag/documents, POST /api/rag/search
Câblage      eli5 explain injecte le contexte (couture context=… désormais alimentée)
Sources      seuls les chunks validated/official sont récupérés (CLAUDE.md)
Tests        4 nouveaux (chunking, ingestion, embeddings, couture explain) — 18 verts
```

## Critères de validation

- Un document de cours peut être ingéré et découpé en chunks vectorisés.
- La recherche cosinus renvoie les passages pertinents d'une matière.
- `explain` injecte le contexte récupéré, et renvoie `[]` sans appel embeddings
  quand aucune source n'est indexée (comportement identique à l'ancien stub).
- Reste reporté : ingestion de fichiers (PDF/MD), validation Papa des sources,
  RAG sur productions de Massimo, frontend d'upload.

## Commit conseillé

```bash
git add .
git commit -m "feat(rag): semantic RAG over course docs (pgvector) wired into ELI5 explain"
```

---

# ÉTAPE 12 — Ingestion de fichiers + validation Papa des sources

## Objectif

Rendre le RAG réellement alimentable côté Papa : importer des fichiers de cours
(MD / TXT / PDF) et n'autoriser leur usage par l'IA qu'après validation manuelle.

## Statut

```txt
Statut : ✅ Fait — upload fichiers (MD/TXT/PDF) en `pending` + validation/rejet Papa
Date de début : 2026-06-30
Date de fin : 2026-06-30
Commit Git : feat(rag): file upload + Papa source validation workflow
```

## Ce qui a été fait

```txt
Deps        python-multipart + pypdf (extraction PDF)
Extraction  modules/rag/extract.py : MD/TXT (utf-8) + PDF (pypdf), ValueError sinon
Service     ingest_document(validation_status=…) + set_validation (doc + chunks synchrones)
Endpoints   POST /api/rag/upload (multipart, statut pending),
            POST /api/rag/documents/{id}/validate, /reject
Sources     un upload Papa reste `pending` → invisible du RAG tant que non validé (CLAUDE.md)
Frontend    page Papa « Sources de cours » : upload + liste + badges + Valider/Rejeter
            (lib/rag.ts, SourcesRagPage.tsx, nav + route)
Tests       3 nouveaux (extraction, upload→pending, validate/reject) — 21 verts
```

## Critères de validation

- Un fichier MD/TXT/PDF peut être uploadé, extrait, découpé et vectorisé.
- La source uploadée arrive en `pending` et n'alimente pas `explain` avant validation.
- Valider/Rejeter met à jour le document ET ses chunks (statut synchronisé).
- Le front Papa expose l'upload et la validation ; aucune migration nécessaire
  (le modèle supportait déjà `validated | pending | rejected`).
- Reste reporté : stockage du fichier brut (MinIO), RAG sur productions de Massimo,
  affichage des sources utilisées côté Massimo.

## Commit conseillé

```bash
git add .
git commit -m "feat(rag): file upload + Papa source validation workflow"
```

---

# ÉTAPE 13 — RAG visible côté Massimo

## Objectif

Rendre le RAG perceptible par l'enfant : quand l'explication ELI5 s'appuie sur
une source de cours validée, afficher un indice « d'après ton cours ».

## Statut

```txt
Statut : ✅ Fait — badge « 📚 D'après ton cours » sur l'explication ELI5
Date de début : 2026-06-30
Date de fin : 2026-06-30
Commit Git : feat(eli5): surface RAG sources_used as « d'après ton cours » badge
```

## Ce qui a été fait

```txt
Backend    eli5.service.explain ajoute `sources_used` (= nb de passages RAG injectés)
           à output_json ; schema ELI5ExplainResponse complété (sources_used:int=0).
           JobOut relaie output_json tel quel → exposé via GET /api/ai/jobs/{id}.
Frontend   lib/eli5.ts : champ sources_used? ; Eli5Page : badge conditionnel
           « 📚 D'après ton cours » dans la carte d'explication (sources_used>0).
Tests      explain sans source → sources_used==0 (endpoint) ;
           service.explain(context=[…]) → sources_used==len (niveau service). 22 verts.
```

## Critères de validation

- Une explication appuyée sur une source validée porte le badge côté Massimo.
- Sans source indexée, aucun badge (sources_used==0) — comportement inchangé.
- Aucun nouveau endpoint ni migration ; le champ transite par l'`output_json` du job.
- Reste reporté : afficher le *titre/chapitre* précis de la source (nécessite que
  `retrieve_for_skill` renvoie les métadonnées, pas seulement le contenu).

## Commit conseillé

```bash
git add .
git commit -m "feat(eli5): surface RAG sources_used as « d'après ton cours » badge"
```

---

# ÉTAPE 14 — Diagnostic complet (Phase 4)

## Objectif

Boucle de diagnostic de bout en bout : Papa lance un diagnostic IA par matière,
Massimo répond à des QCM, le système score par notion, met à jour la maîtrise et
ouvre des lacunes ; Papa visualise le niveau par notion.

## Statut

```txt
Statut : ✅ Fait — diagnostic QCM généré par IA, scoring par notion, lacunes, vues Massimo + Papa
Date de début : 2026-06-30
Date de fin : 2026-06-30
Commit Git : feat(diagnostics): AI-generated diagnostic with per-skill scoring and gaps
```

## Ce qui a été fait

```txt
Prompts    app/prompts/diagnostic.py (génération QCM versionnée v1, ton bienveillant)
Module     app/modules/diagnostics (schemas/service/router) ; aucune migration
           (réutilise Quiz/QuizQuestion/QuizAttempt/QuizAnswer + SkillMastery + Gap)
Génération QCM par notion via LLMProvider (mockable) + trace ai_jobs (diagnostic_generate)
Scoring    correction MCQ → score par notion → upsert SkillMastery + ouverture de Gap
           (seuil < 70 % = notion à renforcer ; sévérité high si < 40 %)
Endpoints  GET /api/diagnostics/subjects, POST /generate (Papa),
           GET /quizzes, GET /quizzes/{id}, POST /quizzes/{id}/submit (Massimo),
           GET /results (Papa)
Frontend   Massimo : DiagnosticPage live (liste → QCM → forces + prochaines étapes)
           Papa : DiagnosticsPapaPage (lancer par matière, score par notion, lacunes)
Tests      6 nouveaux (génération, listing/taken, scoring+lacune, 100 %, résultats Papa,
           404) — 24 verts. Builds Massimo + Papa OK.
```

## Critères de validation

- Papa génère un diagnostic ; Massimo le voit, y répond, obtient un retour bienveillant.
- Le score par notion alimente `skill_mastery` et ouvre des `gaps` pour les notions faibles.
- Les bonnes réponses ne sont jamais exposées à l'enfant (servies sans `correct_index`).
- Reste reporté : génération de missions de remédiation depuis les lacunes,
  diagnostic multi-matières en une session, difficulté adaptative.

## Commit conseillé

```bash
git add .
git commit -m "feat(diagnostics): AI-generated diagnostic with per-skill scoring and gaps"
```

---

# ÉTAPE 15 — Remédiation : lacunes → missions

## Objectif

Transformer les lacunes (`gaps`) ouvertes du diagnostic en missions de remédiation
concrètes pour Massimo, et boucler la boucle : terminer une mission résout la
lacune liée et crédite de l'XP.

## Statut

```txt
Statut : ✅ Fait — génération de missions depuis les lacunes + complétion (gap résolue + XP)
Date de début : 2026-06-30
Date de fin : 2026-06-30
Commit Git : feat(missions): turn diagnostic gaps into remediation missions
```

## Ce qui a été fait

```txt
Module     app/modules/missions (schemas/service/router) ; aucune migration
           (réutilise Mission/MissionStep/Gap/XPEvent)
Génération generate_remediation : 1 mission par lacune ouverte sans mission active,
           3 étapes pédagogiques (expliquer → réexpliquer → quiz), priorité ∝ sévérité.
           Idempotent (pas de doublon pour une lacune déjà couverte).
Complétion complete_mission : mission→completed, étapes→done, lacune liée→resolved,
           XPEvent crédité (reason mission_remediation).
Endpoints  POST /api/missions/generate-remediation (Papa), GET /api/missions,
           GET /api/missions/today (Massimo), POST /api/missions/{id}/complete
Frontend   Papa MissionsPage : bouton « Générer la remédiation » + liste (statut,
           priorité, étapes). Massimo MissionsPage : missions du jour + « J'ai terminé »
           (message + XP) ; route /missions remplace le placeholder.
Tests      5 nouveaux (génération depuis gaps, idempotence, today, complétion
           gap+XP, 404) — 33 verts. Builds Massimo + Papa OK.
```

## Critères de validation

- Une lacune ouverte produit une mission de remédiation avec ses étapes.
- Relancer la génération ne crée pas de doublon (idempotent).
- Terminer une mission résout la lacune liée et crédite de l'XP.
- Vocabulaire bienveillant : « renforcer », « consolidation », jamais d'échec.
- Reste reporté : étapes interactives reliées à ELI5/quiz réels, niveaux/streak XP,
  missions non issues d'un diagnostic (manuelles Papa).

## Commit conseillé

```bash
git add .
git commit -m "feat(missions): turn diagnostic gaps into remediation missions"
```

---

# ÉTAPE 16 — Gamification (XP, niveaux, streak, badges)

## Objectif

Rendre la progression visible et motivante : afficher XP, niveau, régularité
(streak) et badges, et créditer de l'XP aux moments clés d'apprentissage.

## Statut

```txt
Statut : ✅ Fait — synthèse XP/niveau/streak/badges + crédit XP (mission, verbalisation, diagnostic)
Date de début : 2026-06-30
Date de fin : 2026-06-30
Commit Git : feat(gamification): XP summary (level, streak, badges) + XP awards
```

## Ce qui a été fait

```txt
Module     app/modules/gamification (schemas/service/router) ; aucune migration (lit/écrit XPEvent)
award_xp   helper partagé (ajoute un XPEvent à la session, commit côté appelant)
summary    total XP, niveau (100 XP/niveau), barre vers niveau suivant, streak
           (jours consécutifs, tolérance 1 jour), badges déterministes, activité récente
Hooks XP   mission terminée (+20, déjà en place), verbalisation ELI5 reverse (+10),
           diagnostic passé (+15)
Endpoint   GET /api/gamification/summary
Frontend   Massimo ProgressionPage live (niveau, barre XP, streak, badges, activité récente) ;
           section « par matière » laissée indicative (mock)
Tests      5 nouveaux (summary vide, XP reverse, XP+badge diagnostic, montée de niveau,
           badge première mission) — 38 verts. Build Massimo OK.
```

## Critères de validation

- L'XP est crédité à la mission, la verbalisation et le diagnostic ; la synthèse le reflète.
- Niveau et barre de progression corrects (100 XP/niveau) ; streak et badges cohérents.
- Gamification non addictive (CLAUDE.md) : pas de loot box, pas de classement social.
- Reste reporté : vue Papa de la régularité/XP, niveaux nommés, XP par matière, anti-spam d'XP.

## Commit conseillé

```bash
git add .
git commit -m "feat(gamification): XP summary (level, streak, badges) + XP awards"
```

---

# ÉTAPE 17 — Design system partagé (`@zetis/ui`, shadcn-style)

## Objectif

Poser les fondations frontend (cf. `FRONTEND_ROADMAP.md`, Lot A) : un design system
partagé entre Massimo et Papa, piloté par des tokens sémantiques, pour styliser
ensuite les pages vite et de façon cohérente.

## Statut

```txt
Statut : ✅ Fait — packages/ui (Button/Card/Badge/Spinner/EmptyState) + tokens sémantiques par app
Date de début : 2026-06-30
Date de fin : 2026-06-30
Commit Git : feat(ui): shared design system (@zetis/ui) with per-app semantic theming
```

## Ce qui a été fait

```txt
Package    packages/ui (@zetis/ui) : cn (clsx+tailwind-merge), Button/Card/Badge/
           Spinner/EmptyState (cva, shadcn-style), consommé en source TS (comme @zetis/auth)
Théming    tokens sémantiques (primary/card/border/muted/foreground…) définis dans le
           @theme de CHAQUE app et mappés sur sa palette (zetis indigo / papa émeraude) ;
           @source ajouté pour que Tailwind v4 scanne les classes de packages/ui
Preuve     refactor MissionsPage (Massimo + Papa) sur Button/Card/Badge/EmptyState
Vérifié    navigateur : `bg-primary` rend #6366f1 (Massimo) et #10b981 (Papa) — même
           composant, deux thèmes ; builds Massimo + Papa OK, 0 erreur console
```

## Critères de validation

- Un composant unique de `@zetis/ui` s'affiche avec le thème de l'app qui l'utilise.
- Les deux apps buildent et démarrent sans erreur ; Tailwind scanne `packages/ui`.
- Aucune logique métier dans `packages/ui` (présentation pure).
- Suite : généraliser le design system aux pages live (Lot B) puis câbler les pages mock.

## Commit conseillé

```bash
git add .
git commit -m "feat(ui): shared design system (@zetis/ui) with per-app semantic theming"
```

---

# 5. Checklist de fin de chaque étape

À la fin de chaque bloc, Claude Code doit répondre avec :

```txt
1. Étape traitée
2. Résumé de ce qui a été fait
3. Fichiers créés
4. Fichiers modifiés
5. Commandes à lancer
6. Tests réalisés ou à réaliser
7. Points non traités volontairement
8. Prochaine étape recommandée
9. Message de commit Git conseillé
```

---

# 6. Règles anti-dérapage pour Claude Code

Claude Code doit respecter ces règles :

- ne jamais coder plusieurs gros blocs en même temps ;
- ne jamais inventer une nouvelle stack sans justification ;
- ne jamais supprimer les fichiers de documentation ;
- ne jamais mélanger Massimo et Papa dans une seule interface ;
- ne jamais ajouter du SaaS/multi-famille tant que le projet reste personnel ;
- ne jamais brancher l'IA avant que backend + frontends + base soient stables ;
- ne jamais créer une fonctionnalité sans route, fichier et responsabilité clairement nommés ;
- ne jamais ignorer les fichiers `CLAUDE.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DATA_MODEL.md`.

---

# 7. Ordre conseillé des commits

```txt
01 chore: create initial ZETIS project skeleton
02 feat(massimo): bootstrap empty frontend shell
03 feat(papa): bootstrap empty frontend shell
04 feat(backend): bootstrap FastAPI health API
05 feat: connect frontends to backend health API
06 feat(auth): add simple papa and massimo login
07 feat(massimo): add first learning pages
08 feat(papa): add first supervision pages
09 feat(database): add PostgreSQL schema and initial migrations
10 feat(ai): add first pedagogical AI memory loop
```

---

# 8. Commande de suivi Git recommandée

Après chaque étape :

```bash
git status
git diff --stat
git add .
git commit -m "message du bloc"
```

Avant de commencer une nouvelle étape :

```bash
git status
```

Le dépôt doit être propre avant de passer au bloc suivant.

---

# 9. Fichier à garder ouvert pendant le développement

Pendant que tu travailles avec Claude Code, garder ouverts :

```txt
CLAUDE.md
SUIVI_DEVELOPPEMENT_ZETIS.md
PROJECT_STRUCTURE.md
TECH_STACK.md
DATA_MODEL.md
```

---

# 10. Prochaine action immédiate

La prochaine action est l'étape 1.

Prompt à donner maintenant à Claude Code :

```md
Lis CLAUDE.md puis SUIVI_DEVELOPPEMENT_ZETIS.md.
Commence uniquement par l'étape 1 : créer le squelette du projet.
Respecte les critères de validation de l'étape 1.
Ne code aucune fonctionnalité métier.
À la fin, affiche l'arborescence complète et propose le commit Git.
```
