# Prompt Claude Code — Production en lot, slice C (surface Papa + observation)

**Branche** : `feat/production-en-lot` (slices A et B livrées).
**Deux commits** : (1) l'aperçu du gate, backend ; (2) la surface Couverture. L'aperçu d'abord —
c'est lui qui rend le bouton honnête, et sans lui la surface ment.

---

## 0. Cadre

Protocole : **`/slice`**. Décisions : `adr-0031-production-en-lot-et-journal.md` et son **addendum**
`adr-0031-production-en-lot-et-journal.md` (Amendement 1). Spec : `docs/frontend-papa/page-couverture.md`
(§179-186 décrit déjà ce que le bouton fera « quand l'ADR-0023 sera livré »).

---

## 1. Read-before-code — ce qui existe déjà

**a) Le gate de la passe 1 est DÉJÀ à l'écran.** Dans `CoverageMatrix.tsx`, juste avant le bouton
désactivé, il y a **« ✅ Valider les N leçons »** — validation en lot des brouillons du chapitre,
provenance `parent_bulk` (§F.3). C'est exactement la passe 1 de l'addendum.

> Les deux passes ne sont donc pas à inventer : la première existe, la seconde est le bouton
> désactivé. **Il n'y a pas de nouvelle UX à dessiner — il y a un ordre à rendre lisible.**

**b) `lib/production.ts` se déclare « LECTURE SEULE : ce module ne crée aucun endpoint ».** Cette
phrase parle du module `production` du backend au moment de l'ADR-0023. La slice B a ajouté un
routeur d'écriture **distinct** ; ce client doit le dire, sinon son en-tête devient faux.

**c) La convention de progression existe** : `ProgressBar` + `useEstimatedProgress`
(`components/ProgressBar.tsx`, ré-export de `@zetis/ui`), avec `GENERATION_MS` par type dans
`lib/production.ts`. `ChampionMissionModal` en donne le patron pour un lot de N items.
**Jamais de spinner nu, jamais de barre réinventée.**

---

## 2. Commit 1 — l'aperçu du gate (backend)

> **Le gate doit être visible AVANT le clic, pas seulement après.**
>
> Sur un chapitre réel de la base de dev : **18 notions équipables, 13 bloquées**. Sur un chapitre
> neuf : **zéro équipable, tout bloqué**. Si Papa clique et reçoit « rien produit », il lira un
> échec là où il y a un gate qui fonctionne. C'est le point que l'addendum désigne comme **le plus
> facile à rater de cette slice**.

`GET /api/production/runs/preview?chapter_id=…` → `{ eligible: [...], blocked: [{skill_id, name,
reason}] }`.

- **Lecture pure**, aucune écriture, aucun run créé. C'est `scope.plan` + `runner.select_notions`,
  déjà écrits et testés — n'en réimplémente aucun.
- Le **nom** de la notion en plus de son id : une liste d'ids ne se lit pas.
- Renvoie aussi l'**arriéré courant** et le plafond, pour que le bouton puisse dire *pourquoi* il
  refuse avant d'essayer (`runs.pending_backlog`, `settings.production_max_pending`).

---

## 3. Commit 2 — la surface

### 3.1 Le bouton cesse de mentir

« ⚡ Compléter le chapitre (N) » s'active. **N n'est plus le nombre de trous, c'est le nombre de
notions réellement équipables.** Le compte de trous incluait ce que le gate refusera.

Trois états, tous explicites :

| Situation | Ce que le bouton dit |
|---|---|
| des notions équipables | `⚡ Compléter le chapitre (18)` — actif |
| tout est bloqué | **désactivé**, motif : « Validez d'abord les cours de ce chapitre » |
| arriéré au plafond | **désactivé**, motif : « N contenus attendent déjà votre relecture » |

### 3.2 Les notions bloquées se voient, avec leur motif

Jamais un compte nu. « 13 en attente de validation » doit pouvoir se déplier en la liste des
notions et de leur raison. Une notion silencieusement omise se lit comme un échec de production.

### 3.3 L'ordre des deux passes est rendu lisible

Le bouton « ✅ Valider les N leçons » existe déjà : il **est** la passe 1. Rends l'enchaînement
évident — valider d'abord, équiper ensuite — sans inventer de composant. Un ordre visuel et un
motif suffisent.

### 3.4 La progression

`useEstimatedProgress` + `ProgressBar`, patron `ChampionMissionModal` : l'estimation est
`nombre de notions équipables × durée d'un kit`. Le suivi interroge
`GET /api/production/runs/{id}` jusqu'à `done`/`failed`.

### 3.5 `coverage.py` reste en lecture seule

Le bouton appelle le **routeur de runs**, jamais la Couverture. L'invariant de l'ADR-0023 tient.

---

## 4. Ce qu'il ne faut PAS faire

- **Ne pas modifier `equip_notion`** (addendum).
- **Ne pas ajouter de déclencheur** autre que le clic (ADR-0032).
- **Ne pas afficher un compteur d'arriéré ailleurs** que sur le bouton qu'il bloque — la
  provenance est un fait, jamais un reproche (§F.2), et un « 12 non contrôlés » global est
  exactement ce que le §G interdit.
- **Ne pas inventer de barre de progression** ni de spinner nu (convention `ProgressBar`).
- **Ne pas lancer l'observation à la place du commanditaire** : produire 18 notions écrit des
  heures de contenu dans sa base. On livre le bouton ; il le presse.

---

## 5. Clôture — l'observation

Le livrable de cette slice n'est pas que du code. Une fois le bouton pressé **par le
commanditaire**, consigner :

1. **temps réel** par leçon et pour le lot entier ;
2. **taux de dégradation** leçon-centrée (pièces sautées par le `try/except`) ;
3. **et surtout : 15 objets d'un coup sont-ils relisables ?**

> La réponse décide du chantier suivant, et l'ADR-0023 l'a déjà tranchée : si c'est non, ce n'est
> ni le cron ni les déclencheurs, **c'est la file de relecture**.
