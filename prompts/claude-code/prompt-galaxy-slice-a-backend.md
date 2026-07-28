# Prompt Claude Code — ZETIS Galaxy · Slice A (backend)

> **Backend pur.** Tu travailles uniquement dans `apps/backend` (+ `packages/types` pour les
> types partagés). **Aucun fichier de `apps/frontend-massimo` ni de `apps/frontend-papa`.**
> **Aucune migration Alembic** : ce chantier ne crée ni table ni colonne. Si tu penses en avoir
> besoin, c'est que tu as dévié — **STOP**, signale-le.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/decisions/adr-0024-zetis-galaxy-progression.md` — **les décisions, elles ne se
   rediscutent pas** ;
3. `docs/frontend-massimo/zetis-galaxy.md` §4, §5, §6 — le contrat de données ;
4. `apps/backend/app/modules/evidence/service.py` — le substrat que tu vas consommer
   (`mastery_by_skill`, L35). **Ne le modifie pas** : cinq consommateurs en dépendent ;
5. `apps/backend/app/modules/curriculum/router.py` L345-390 et son service — le patron des routes
   **élève** (`/api/student/...`, gate `validated`, année active) ;
6. `apps/backend/app/modules/missions/service.py` L76-137 — les résolveurs de ressources par
   notion que tu vas réutiliser ;
7. `apps/backend/app/db/models/school.py` — `Skill`, `Chapter`, `Lesson`, `LessonSkill`.

## 1. Ce que tu construis

Un module **`app/modules/galaxy/`** (router + service + schemas), monté dans `main.py`, exposant
**trois routes élève**. Toutes sous authentification élève, **jamais** `require_parent`.

### `GET /api/student/galaxy`

Vue d'ensemble. Pour l'année active de l'élève, une entrée par matière :
`{ subject_id, name, slug, lit, total }`.

- `total` = notions **visibles** de la matière (voir gate §2).
- `lit` = celles dont le `SkillMastery.status` n'est ni `unknown` ni absent.
- **Aucun pourcentage, aucun tri par performance.** Ordre = celui du curriculum.

### `GET /api/student/galaxy/{subject_slug}`

Une constellation. Renvoie `{ subject, nodes, edges }` :

- nœuds `kind="chapter"` : `{ id: "chapter-<id>", title }` ;
- nœuds `kind="skill"` : `{ id: "skill-<id>", skill_id, name, chapter_id, status, intensity }` ;
- arêtes : `{ from: "chapter-<id>", to: "skill-<id>", type: "structure" }`.

Le rattachement notion → chapitre passe par **`Skill ← lesson_skills → Lesson → Chapter`**.
Une notion portée par plusieurs leçons du même chapitre n'apparaît **qu'une fois**.

### `GET /api/student/galaxy/notion/{skill_id}`

Le panneau d'actions : `{ skill_id, name, status, chapter_title, subject_slug, actions[] }`.

`actions` est une liste ordonnée de `{ kind, ...cible }` avec
`kind ∈ {cours, eli5, quiz, mindmap, revision}` :

| kind | condition d'inclusion | cible |
|---|---|---|
| `cours` | la notion a une leçon canonique validée | `lesson_id` |
| `eli5` | toujours (ELI5 fonctionne sans contenu préexistant) | — |
| `quiz` | `_resolve_mission_quiz_id` renvoie un id | `quiz_id` |
| `mindmap` | `_resolve_mission_mindmap_id` renvoie un id | `mindmap_id` |
| `revision` | au moins une carte SRS active existe pour ce couple élève/notion | — |

**Règle ferme : une action dont la condition est fausse n'est PAS dans la liste.** Pas de champ
`available: false`, pas de grisé. Absente.

**404** si `skill_id` n'appartient pas à une matière visible de l'élève — un id inconnu ne doit rien
révéler.

## 2. Invariants non négociables

- **Gate de visibilité** : `Chapter.validation_status == "validated"` **ET**
  `Lesson.status == "validated"`, **dans la requête** (patron ADR-0011 : impossible de recevoir du
  non-validé). Une notion non validée n'apparaît pas — même pas comme « à découvrir ».
- **Mur Papa/Massimo (ADR-0002)** : tu ne touches **ni** au module `progress` **ni** au module
  `production`. Aucune donnée de pilotage (`validated_by`, fraîcheur, orphelins, `severity`,
  `mastery_score` brut) ne sort dans une réponse élève.
- **`status` a SIX valeurs**, pas cinq : `unknown | weak | learning | solid | mastered` **et
  `in_progress`** (écrit par `missions/service.py:859`). Mappe `in_progress` → `learning`.
  Écris un test qui le prouve.
- **`mastery_score` est sur 0–100.** `evidence.mastery_by_skill()` renvoie la valeur **brute**.
  Expose-la sous le nom `intensity`, jamais `score`, et **jamais** de pourcentage nommé comme tel.
- **Aucun prérequis.** `Skill.parent_skill_id` est NULL partout : ne le lis pas, ne l'écris pas.
  Aucune arête autre que `structure`.
- Ne réimplémente **aucun** calcul de maîtrise : passe par `evidence.mastery_by_skill()`.

## 3. Types partagés

Ajoute les types dans `packages/types/src/` (nouveau fichier `galaxy.ts`) **et n'oublie pas de les
ré-exporter depuis `packages/types/src/index.ts`** — c'est un oubli récurrent sur ce dépôt.

## 4. Tests

Dans `apps/backend/app/tests/`, au minimum :

- une notion non validée **n'apparaît pas** dans la constellation ;
- `in_progress` est rendu comme `learning` ;
- une action sans ressource **n'est pas** dans `actions` (et non pas présente-mais-fausse) ;
- `lit` compte bien les non-`unknown`, et aucune réponse ne contient de pourcentage ;
- `notion/{skill_id}` renvoie 404 pour une notion hors des matières de l'élève ;
- un test-verrou : le module `galaxy` **n'importe ni `progress` ni `production`**.

Les tests existants doivent passer **inchangés**.

## 5. Hors-périmètre — tu t'arrêtes au bord

- Aucun frontend, aucun composant, aucun style.
- Aucune migration, aucune table, aucune colonne.
- Aucune modification de `evidence`, `progress`, `production`, `missions`, `reports`.
  Tu **appelles** leurs fonctions, tu ne les changes pas. Si un résolveur doit être partagé, **STOP** :
  propose son extraction vers un module neutre (patron ADR-0011 §1) et attends validation.
- Pas d'animation, pas de `learning_events` poussés, pas de websocket.
- Pas de graphe de prérequis, même « en préparation ».

## 6. Stop-on-blocker

Sur toute divergence réelle avec ce prompt — signature inattendue, résolveur absent, gate
impossible à poser dans la requête, notion rattachable à aucun chapitre — **arrête-toi, signale, et
propose l'ajustement minimal**. Ne code pas autour.

## 7. Livraison

Résumé des fichiers modifiés · commandes à lancer · tests ajoutés · points restants · risques
connus. Puis propose un message de commit clair. **Ne committe pas toi-même.**
