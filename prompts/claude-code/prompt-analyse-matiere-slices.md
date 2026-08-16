# Chantier « analyse par matière » — prompts de slices

> Cadrage : `adr-0028-dashboard-papa-agregat-unique` (Amendement 1) + `adr-0020-conseil-de-classe-ia` (Amendement 1)
> (2026-08-05). Spec : `docs/frontend-papa/page-dashboard.md §5 bis`.
> Branche : `feat/analyse-matiere`, depuis `main`.
>
> Chaque slice se colle après `/slice`, qui porte la discipline (graphify, read-before-code avec
> RAPPORT de ce qui était faux, stop-on-blocker, non-régression).

---

## Décisions déjà tranchées — à RELIRE, jamais à rouvrir

1. **Panneau déplié sous la carte**, pas de modale. Patron `DayDetailPanel`.
2. **Le réseau ne sert que des NOMS.** Tout chiffre déjà porté par `SubjectOut` vient de la
   mémoire. Corollaire : la réponse ne dépend d'aucune période.
3. **État dans l'URL** (`?panel=ou-agir`), par nécessité — le lien de preuve est une navigation
   vers la route courante.
4. **Filtrer referme le panneau** (`panel: null` écrit avec `subject`).
5. **La carte ne change pas de largeur.**
6. **Route** `GET /api/parent/progress/subjects/{subject_id}/analysis`, module `progress`, nommée
   `analysis`, indexée par `subject_id` entier.
7. **Conseil ciblé** : `subject_id` optionnel, filtrage sur `Skill.subject_id`, plafond 16,
   troncature déclarée, colonne `council_reports.subject_id` nullable, prompt `v2`.
8. **Deux libellés distincts** pour naviguer et pour générer.

## Hors-périmètre du chantier entier — même « tant qu'on y est »

- ❌ Réparer `/lacunes` (ignore `?subject=`).
- ❌ Débrancher `/progression` du mock.
- ❌ Résoudre la divergence `Gap.subject_id` / `Skill.subject_id` — elle se **borne** par un test.
- ❌ Donner une fenêtre temporelle à l'évidence du Conseil.
- ❌ Ajouter un mode aperçu au Conseil.
- ❌ Changer ce que mesure l'axe Y du nuage.
- ❌ Extraire une coquille de modale générique.
- ❌ Doter le Conseil d'un identifiant de run.

---

## Slice A — `patchParams` par lot *(refactor pur, aucun changement de comportement)*

**Périmètre** : `apps/frontend-papa/src/hooks/useDashboard.ts` seul.

`patchParams` construit son `URLSearchParams` depuis une **fermeture** sur `searchParams` : deux
appels dans le même tick partent du même instantané et **le second écrase le premier**. Or ouvrir
le panneau écrit deux clés.

Passer à la forme fonctionnelle `setSearchParams(prev => …)` avec un patch
`Record<string, string | null>` (`null` = supprimer la clé). `{ replace: true }` **conservé**.

**Critère de réussite** : `setPeriod`, `toggleSubject` et `toggleFocus` gardent un comportement
identique, et **tous les tests existants passent sans être touchés**. Un test modifié pour passer
serait une régression masquée.

**Test à ajouter** : un geste qui touche deux paramètres les écrit **tous les deux**.
*Sabotage attendu* : revenir à la signature à clé unique et appeler deux fois — seul le second
paramètre survit.

---

## Slice B — Route d'évidence par matière *(backend, sans LLM)*

**Périmètre** : nouveau `apps/backend/app/modules/progress/analysis.py`, schémas, route.

> ⚠️ Fichier séparé pour éviter un cycle : `evidence/service.py` importe déjà
> `progress.service.OPEN_GAP_STATUSES`. `analysis.py` importe les deux ; `progress/service.py`
> reste intact.

**Tout est réutilisé, rien n'est recalculé** — une seconde façon de compter EST le bug qu'on
corrige :

| Besoin | Appeler |
|---|---|
| lacunes nommées, sévérité, `has_active_mission`, tri | `progress.service.open_gaps` (source de `/lacunes`) |
| couverture par mission | `progress.service.skills_with_active_mission` |
| maîtrise, score, `last_seen_at` | `evidence.mastery_by_skill` |
| signal quiz pondéré | `evidence.weighted_quiz_signal` (filtrer sa **sortie**, pas sa requête) |
| retard SRS | `evidence.srs_pressure` |
| 4 compteurs de notions | `dashboard.projections.notions_breakdown` |
| statuts fragile / consolidé | `dashboard.projections.FRAGILE_STATUSES` / `CONSOLIDATED_STATUSES` |
| charge SRS 14 j | `dashboard.service._review_load` (à promouvoir en public) |
| chapitres, leçons, en attente | `production.coverage.coverage(db, subject_id=…)["totals"]` |
| missions actives | `missions.pilot.pilot_list(db, student, subject=<slug>)` |

**`to_reinforce` = fragiles ∪ lacunes ouvertes**, jamais l'intersection, **sans plafond**. Chaque
entrée porte `is_fragile` ET `has_open_gap` séparément.

⚠️ **Ne pas charger les événements d'activité ici** : `HISTORY_DAYS = 730`, ce serait deux ans de
journal pour un dépliage de panneau. Temps et régularité viennent de la mémoire du client.

⚠️ **`srs_pressure` (en retard, sans filtre de statut) et `_review_load` (à venir, avec filtre) ne
mesurent pas la même chose.** Les servir sous deux noms distincts, jamais sous « révisions ».

⚠️ **Ordre de déclaration FastAPI** : segment littéral avant paramètre. Le module `reports` a déjà
ce piège désamorcé — reproduire son placement.

**Verrous, chacun avec son sabotage** :

| Verrou | Sabotage qui doit le faire rougir |
|---|---|
| le panneau et l'agrégat comptent les mêmes notions | recopier le calcul des 4 compteurs à la main |
| la couverture par mission est celle de `/lacunes` | restreindre aux missions `remediation`, ou aux `active` seules |
| une notion fragile **sans** lacune apparaît, et réciproquement | remplacer l'union par une intersection |
| le panneau ne plafonne pas à 8 | appliquer `_MAX_NOTIONS_PER_SUBJECT` |
| le panneau ne voit que sa matière | retirer le filtre |
| une lacune à colonnes incohérentes est rangée **partout** pareil | attribuer par `Skill.subject_id` |
| retard et charge SRS restent deux nombres | servir `review_overdue = sum(review_load)` |
| la route **n'écrit rien** | un `db.add` quelconque |
| la route **n'appelle aucun LLM** | importer et appeler `council.build_prompt` |
| Papa-only, 404 sur matière inconnue | monter la route hors du router protégé |

---

## Slice C — Le panneau *(frontend, livrable en soi)*

**Périmètre** : `packages/types/src/subjectAnalysis.ts` (fichier **nouveau** — `dashboard.ts` dit
en en-tête « tout le payload arrive en UNE requête, non filtré », y poser un second contrat
rendrait son propre en-tête faux), `lib/subjectAnalysis.ts`, `hooks/useSubjectAnalysis.ts`,
`components/dashboard/SubjectAnalysisPanel.tsx`, plus le câblage dans `useDashboard`,
`WhereToActCard` et `DashboardPage`.

**Hook** : patron `DayDetailPanel` — garde `let cancelled = false`, trois états — **plus un
correctif** : purger la donnée **avant** l'appel. Le précédent garde son détail pendant le
chargement suivant ; ici les notions de Maths resteraient **nommées** sous le titre « SVT ».

**Toute table indexée par une union se type PAR cette union** (`Record<AnalysisPendingKind, …>`,
jamais `Record<string, …>`). C'est la leçon du deep-link cassé du 2026-08-05 : le filet n'est pas
dans l'union, il est dans le `Record` typé par l'union.

**Verrous** :

| Verrou | Sabotage |
|---|---|
| **aucune requête sur un geste de filtrage, EN PARTANT DE `/?subject=maths&panel=ou-agir`** | retirer `panel: null` de `toggleSubject` — ⚠️ **seule la variante « panneau déjà ouvert » l'attrape** |
| le lien de preuve ouvre le panneau **sur la page déjà montée** | remplacer la dérivation URL par un `useState` local |
| changer de période ne refetche pas | ajouter `period` à la signature du fetch |
| changer de matière ne laisse pas les notions de la précédente | retirer la purge |
| une réponse en retard ne s'affiche jamais | retirer la garde `cancelled` |
| `panel` sans matière connue n'ouvre rien | dériver du slug brut au lieu de la matière résolue |
| la carte garde `xl:col-span-5` panneau ouvert | conditionner la classe |
| le panneau n'est pas une modale | lui donner `role="dialog"` |
| fragiles et lacunes ne sont jamais additionnées | afficher un total unique |
| le retour arrière quitte le dashboard | `setSearchParams` sans `replace` |

---

## Slice D — Le lien de preuve *(une ligne backend, et le verrou qui manquait)*

**Périmètre** : `dashboard/service.py` (`_reading`), fixture du test Papa.

`"/lacunes?subject={slug}"` → `"/?subject={slug}&panel=ou-agir"`. Le comptage des fragiles **reste
inchangé** — il est juste. ⚠️ Ne **pas** réécrire ce `href` côté client : c'est un contrat serveur.

**LE verrou du chantier** : pour chaque item de `reading`, résoudre la matière depuis son `href`,
appeler la route d'analyse, et exiger que **le compte annoncé égale le nombre d'éléments servis**.

> Il doit **échouer sur le code d'avant la slice B** — c'est ce qui prouve le bug.
> *Sabotages* : plafonner `to_reinforce` à 8 avec 9 fragiles seedées ; remettre le `href` sur
> `/lacunes` ; restreindre `FRAGILE_STATUSES` dans `analysis.py` seul.

---

## Slice E — Conseil ciblé *(backend + frontend, la plus lourde)*

**Périmètre** : `GenerateCouncilRequest`, `_build_context`, `list_reports`, `_to_out`, schémas,
route, migration, prompt `v2`, bouton du panneau.

**Migration** : `council_reports.subject_id` nullable + index `(student_id, subject_id)`.
⚠️ **Aucun test ne l'exercera** (`create_all`, jamais `alembic upgrade`) — `alembic upgrade head`
manuel sur la base de dev fait partie de la slice.

**Verrous** :

| Verrou | Sabotage |
|---|---|
| le conseil ciblé ne narre que sa matière | supprimer le filtrage |
| **l'ancrage rejette une autre matière en portée ciblée** | calculer `allowed_subject_ids` **avant** le filtrage — la gratuité du §3 est ce qu'un refactor casse en silence |
| le conseil global reste inchangé | rendre `subject_id` obligatoire |
| la liste distingue ciblé et global, et sans filtre rend tout | filtrer sur `subject_id IS NULL` par défaut |
| la troncature est déclarée | égaler `notions_available` à `notions_considered` |
| naviguer et générer ne portent pas le même libellé | reprendre le libellé historique |
| générer demande confirmation | câbler `onClick` sur la génération |
| le run survit au changement de bulle | remettre l'état dans le panneau |
| au-delà du seuil, le libellé le dit | porter `expectedMs` à 240 000 |

---

## Vérification finale, avant clôture

- Suites complètes : backend, Papa, Massimo. Aucun test existant modifié pour passer.
- `alembic upgrade head` sur la base de dev.
- **Bout en bout à l'écran** — cliquer une bulle, suivre le lien de preuve, changer de période
  (onglet Réseau : **zéro requête**), lancer une synthèse ciblée.
- ⚠️ Le chantier précédent a été mergé **sans jamais avoir été vu à l'écran**. Ne pas recommencer :
  si l'écran n'est pas accessible, le **dire** plutôt que de le laisser deviner.
