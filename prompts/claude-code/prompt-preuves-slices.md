# Chantier « les preuves mènent quelque part » — prompts de slices

> Cadrage : `adr-0038-les-preuves-menent-quelque-part`. Spec : `docs/frontend-papa/page-progression.md`.
> Branche : `feat/preuves-vers-le-reel`, depuis `main`.
>
> Chaque slice se colle après `/slice`, qui porte la discipline (graphify, read-before-code avec
> RAPPORT de ce qui était faux, stop-on-blocker, non-régression).

---

## Décisions tranchées — à RELIRE, jamais à rouvrir

1. **La barre mesure l'AVANCEMENT** : notions engagées / au programme. Pas les acquises.
2. **« Avancé » et « Acquis » sont deux colonnes**, jamais fondues, jamais additionnées.
3. **Le XP par matière revient sur Progression** — c'est sa seule maison côté Papa (ADR-0028 §5).
4. **`/lacunes` filtre CÔTÉ CLIENT** sur `?subject=`, aucun changement backend.
5. **Le verrou de cohérence devient général** : les TROIS branches de `reading`.
6. **Aucune fenêtre temporelle** sur Progression. Aucun historique. Aucune action.

## Hors-périmètre — même « tant qu'on y est »

- ❌ Toucher à `/cahier` (le verrou du §5 la couvrira ; si ça rougit, chantier à part).
- ❌ Résoudre `Gap.subject_id` / `Skill.subject_id`.
- ❌ Changer la définition de « consolidée » ou de « lacune ouverte ».
- ❌ Ajouter une période, une série, une tendance à Progression.
- ❌ Ajouter un bouton d'action sur Progression.
- ❌ Refondre `/lacunes` au-delà du filtre (ses trois sections restent telles quelles).
- ❌ Payer les autres dettes de vérification (bandeau Massimo, galaxie, Journal).

---

## Slice A — XP par matière *(backend, petit et isolé)*

**Périmètre** : `modules/gamification/` seul.

Agrégation du cumul d'`XPEvent.amount` par `subject_id`. Aucune fenêtre. Aucune migration —
`subject_id` existe et, sur la base réelle, **80 événements sur 80 le portent**.

⚠️ Les événements **sans** matière existent en droit (colonne nullable) : décider ce qu'on en fait
et l'écrire. Les taire silencieusement ferait que la somme des XP par matière ne vaudrait pas l'XP
total — le motif exact de `unattributed_minutes` sur le dashboard.

**Verrous** :

| Verrou | Sabotage |
|---|---|
| la somme des XP par matière + le hors-matière = l'XP total | omettre les événements sans matière |
| une matière sans aucun XP rend 0, pas l'absence | filtrer les matières à zéro |
| aucune fenêtre : un événement ancien compte | ajouter un filtre de date |

---

## Slice B — Le contrat de Progression *(backend)*

**Périmètre** : la route qui sert la page.

**Décider d'abord, et le RAPPORTER** : réutiliser l'agrégat du dashboard (qui porte déjà
`notions{consolidated, fragile, in_progress, total}` par matière) ou servir un agrégat propre.
⚠️ La première option lie deux pages ; la seconde crée une seconde façon de compter. **C'est un
stop-on-blocker : signaler et proposer, ne pas trancher seul.**

⚠️ `GET /progress/consolidated` **existe** et sert les notions acquises nommées. Ne pas en écrire
une seconde. Son client `fetchConsolidatedSkills` existe aussi, dans `lib/activity.ts`, et n'est
appelé nulle part.

**Verrous** :

| Verrou | Sabotage |
|---|---|
| « engagées » = consolidées ∪ fragiles ∪ en cours, jamais un sous-ensemble | oublier `in_progress` — le statut que tous les mappings manuels oublient |
| une matière SANS référentiel reste dans la liste | la filtrer |
| `notions.total == 0` ≠ « pas de référentiel » | confondre les deux états |
| les statuts viennent de `projections`, non rejoués | réécrire les ensembles à la main |

---

## Slice C — La page Progression *(frontend)*

**Périmètre** : `pages/ProgressionPage.tsx`, son hook, son test. **Supprimer l'import de
`data/mock`** — et vérifier si `SUBJECTS_PROGRESS` a encore un consommateur.

**Verrous** :

| Verrou | Sabotage |
|---|---|
| aucune donnée ne vient de `data/mock` | réimporter le mock |
| « avancé » et « acquis » affichés SÉPARÉMENT, jamais additionnés | afficher un total unique |
| une matière sans référentiel garde sa ligne et son lien | la masquer |
| aucun sélecteur de période sur la page | en ajouter un |

---

## Slice D — `/lacunes` lit enfin `?subject=` *(frontend seul)*

**Périmètre** : `LacunesPage.tsx` + son hook.

Filtrage **en mémoire** sur la liste déjà chargée. Les trois sections se calculent **sur le jeu
filtré**. Slug inconnu → repli sur « toutes ». Filtre **visible et retirable**.

**Verrous** :

| Verrou | Sabotage |
|---|---|
| **zéro requête** au changement de filtre | passer le filtre à la route |
| les compteurs de section suivent le filtre | calculer les sections avant le filtre |
| un slug inconnu ne vide pas la page | rendre une liste vide |
| le filtre actif est nommé et retirable | le rendre invisible |

---

## Slice E — Le verrou général *(backend)*

Étendre le verrou de cohérence aux **trois** branches de `reading` : résoudre la cible depuis le
`href`, appeler ce qu'elle sert, exiger l'égalité du compte annoncé.

⚠️ **Écrire ce verrou EN PREMIER de la slice, et le voir ROUGIR** sur la branche `up` avant de
brancher la page. S'il est vert d'emblée, c'est qu'il ne résout pas vraiment la cible.

⚠️ **Anti-vacuité obligatoire** : asserter qu'au moins un constat de chaque branche est présent
dans la fixture. Un `for` sur une liste vide passe toujours — c'est arrivé trois fois sur les deux
chantiers précédents.

---

## Vérification finale, avant clôture

- Suites complètes : backend, Papa, Massimo. **Aucun test existant modifié pour passer.**
- **Bout en bout à l'écran, session connectée** : ouvrir `/progression` et confronter ses chiffres
  à ceux du dashboard ; suivre la preuve « N notions consolidées » ; filtrer `/lacunes` par matière
  et vérifier **zéro requête** dans l'onglet Réseau.
- ⚠️ Sur les deux chantiers précédents, **trois défauts n'ont été trouvés qu'à l'écran** — dont un
  correctif entièrement vert qui ne marchait pas. Ne pas considérer la suite verte comme une
  vérification.
