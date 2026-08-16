# Prompt Claude Code — Page matière, slice A (backend)

**Branche** : `feat/page-matiere` (créée depuis `main`, les documents de cadrage déjà committés).
**Deux commits distincts** dans cette slice — le second porte une décision de sécurité et doit être
isolable dans l'historique.

---

## 0. Cadre

Protocole d'exécution : **`/slice`** (graphify, read-before-code avec rapport, stop-on-blocker,
hors-périmètre, non-régression). Il ne se répète plus ici.

Décisions de fond, à lire aussi :
`docs/decisions/adr-0024-zetis-galaxy-progression.md` (Amendement 6) et
`docs/decisions/adr-0027-chat-orchestrateur.md` (Amendement 2).
Spec de page : `docs/frontend-massimo/page-matiere-dediee.md`.

---

## 1. Read-before-code

Lis, et **rapporte ce que tu trouves réellement** (les lignes ci-dessous sont des hypothèses issues
de la doc, pas des faits vérifiés) :

| Fichier | Ce qu'on cherche |
|---|---|
| `app/modules/galaxy/service.py` (ou équivalent) | `notion_panel` : comment il calcule `available` pour les 7 `kind`, et quels résolveurs il appelle |
| `app/modules/missions/service.py` | `_resolve_mission_quiz_id`, `_resolve_mission_mindmap_id` — signatures, mono-skill ou non |
| `app/modules/reports/service.py` | `_skill_lesson`, `_existing_fiche` — idem |
| `app/modules/curriculum/…` | la route `GET /api/student/subjects/{slug}/notions` : sa **chaîne de filtrage** (année active → chapitre `validated` → leçon `validated` → `Skill`), sa déduplication par `skill_id` |
| `app/modules/chat/actions.py` | `DURABLE_NOTION_TOOLS`, `_TOOL_TO_CONTENT_KIND`, et **la règle ELI5** (non offerte sans cours validé) |
| `app/modules/content_requests/` | modèle, `create_request`, `list_requests`, `set_status`, router `require_parent` |
| `app/core/config.py` | où vivent les constantes de ce type |
| `app/main.py` | montage des routers, préfixes `/api/student/` |

**Points de vérification durs** :

- Le prédicat du `cours` doit être **`content_markdown IS NOT NULL`**, pas `lesson_id is not None`
  (correctif n°2 du 2026-07-30). Confirme-le dans le code.
- `notion_panel` déclare-t-il `eli5` **toujours** `available` ? Si oui, c'est le comportement à
  changer (§2.3) — et il faut vérifier **qui d'autre consomme `notion_panel`** avant de le faire.
- Y a-t-il déjà un helper de visibilité élève réutilisable pour « ce `skill_id` est-il visible de
  Massimo ? » Si oui, **réutilise-le** ; n'en écris pas un quatrième.

---

## 2. Commit 1 — prédicat ensembliste + route `panoply`

### 2.1 Extraire le prédicat, **à comportement constant**

Sors le calcul de disponibilité de `notion_panel` dans une fonction capable de travailler sur **un
ensemble de `skill_id`** :

```python
def resolve_panoply(db, student, skill_ids: Sequence[int]) -> dict[int, list[ActionAvailability]]
```

- `notion_panel` devient son **consommateur mono-notion** : il appelle `resolve_panoply(db, student,
  [skill_id])` et lit la seule entrée. **Aucun second prédicat** ne doit exister dans le dépôt.
- **Preuve de comportement constant** : les tests existants de `notion_panel` doivent passer
  **sans être modifiés**. Si tu dois en toucher un, c'est que le comportement a changé — arrête-toi.

### 2.2 Requêtes ensemblistes, N+1 interdit

Les résolveurs actuels sont mono-skill. Réécris-les en versions ensemblistes **à l'intérieur** de
`resolve_panoply` (`IN (:skill_ids)` + regroupement en mémoire), ou introduis des variantes `_bulk`
que les versions mono appellent.

Référence de performance : `production/coverage.py`, 69 leçons en 18 requêtes / 79 ms.

**Test obligatoire** : le nombre de requêtes SQL est **borné et indépendant du nombre de notions**
(compte les requêtes sur 3 notions et sur 30, la valeur doit être identique).

### 2.3 Règle ELI5

`eli5.available` devient **`True` seulement s'il existe un cours validé** pour la notion (même
prédicat que `cours`). La règle vit **dans `resolve_panoply`**, pas dans la page.

⚠️ **Vérifie d'abord les autres consommateurs de `notion_panel`** (le chat en est un). Le chat
applique déjà cette règle de son côté ; si elle devient portée par le prédicat, **retire la
duplication côté chat** plutôt que de la laisser en double. Si ce retrait touche du code éprouvé
live, signale-le avant de le faire.

### 2.4 Route

```
GET /api/student/subjects/{slug}/panoply     (get_current_user, comme les autres routes élève)
```

Sortie : matière → chapitres → notions, chacune avec `status` et sa panoplie. Contrat exact dans
`page-matiere-dediee.md §Données API`.

- Même chaîne de filtrage que `/subjects/{slug}/notions` — **réutilise-la, ne la réécris pas**.
- Déduplication par `skill_id`, `chapter_title` de la leçon la plus récente (patron existant).
- 404 matière inconnue ou hors année active. `chapters: []` si rien n'est validé.
- **`mastery_score` ne doit apparaître nulle part dans le payload.** `status` seul. (Rappel : le bug
  d'échelle 0–100 traité comme 0–1 est encore ouvert ailleurs — ne l'importe pas ici.)
- Types dans `packages/types/` à côté des types galaxie existants.

### 2.5 Tests du commit 1

- `notion_panel` : tests existants verts **sans modification**.
- **Cohérence croisée** : pour un même `skill_id`, la route en lot et `notion_panel` renvoient le
  **même `available` sur les 7 kinds**. *C'est LE test qui protège de la divergence — ne le saute
  pas.*
- Nombre de requêtes borné (2.2).
- Aucune leçon `draft`, aucun chapitre non validé ne sort.
- `eli5.available` faux quand aucun cours validé.
- 404 matière inconnue / hors année active.
- Aucun `mastery_score` dans la réponse sérialisée.

**Commit suggéré** :
`feat(galaxy): batch notion availability + student subject panoply endpoint`

---

## 3. Commit 2 — route enfant sur `content_requests`

> Décision de sécurité : `docs/decisions/adr-0027-chat-orchestrateur.md` (Amendement 2). Lis-la avant.

```
POST /api/student/content-requests          (require_child)
  entrée : { skill_id: int, content_kinds: [str] }
  sortie : { requested: [str] }
```

Trois garde-fous, **tous testés** :

1. **Vocabulaire fermé** — `content_kind ∈ {cours, fiche, mindmap, quiz, capsule, card}` ; sinon
   `422`.
2. **Plafond** — `CONTENT_REQUEST_MAX_KINDS` en config, v1 = **7** ; au-delà, refus.
3. **Visibilité** — le `skill_id` doit être visible de l'élève (même chaîne de filtrage que les
   routes élève). Sinon **404 et aucune ligne créée**. Sans ce garde-fou, la route devient un oracle
   d'existence sur les brouillons de Papa.

Autres contraintes :

- `source = "subject_page"`. Le chat garde `"chat_orchestrator"`.
- **Aucun `GET`, aucun `PATCH` élève.** Un test vérifie qu'ils ne sont pas montés.
- Réutilise `create_request` tel quel (idempotent + ré-activant). **Ne le modifie pas.**
- `coverage.py` **non touché**. Les mutations restent dans le module `content_requests`.
- Aucun XP, aucun `event_type` neuf, aucune trace d'événement (décision : la ligne de file *est* la
  trace).

**Tests** : `skill_id` hors visibilité → 404 + zéro ligne ; kind invalide → 422 ; au-delà du plafond
→ refus ; deux appels identiques → une seule ligne ; ligne `dismissed` ré-activée en `pending` ;
`source` correct ; routes élève `GET`/`PATCH` absentes.

**Commit suggéré** :
`feat(content-requests): child-facing write route for content requests`

---

## 4. Ce qu'il ne faut PAS faire

- Écrire un second prédicat de disponibilité. Un seul, partagé.
- Toucher `production/coverage.py` (invariant read-only, ADR-0023).
- Ajouter une table ou une migration — ce chantier n'en a pas.
- Exposer `mastery_score`, un pourcentage, un niveau ou un XP par matière.
- Créer un `event_type`.
- Router quoi que ce soit vers du contenu non validé.
- Modifier `create_request`, `notion_requests` ou l'inbox Papa.

---

## 5. Clôture

Les 9 points habituels, plus :

- le compte de requêtes mesuré sur 3 et 30 notions, chiffres reportés ;
- le résultat du read-before-code : **quels constats du §1 étaient faux**, et ce que tu en as fait ;
- confirmation que les tests de `notion_panel` sont passés **sans modification** ;
- si la déduplication de la règle ELI5 côté chat a été retirée : le dire explicitement, avec le
  diff concerné.
