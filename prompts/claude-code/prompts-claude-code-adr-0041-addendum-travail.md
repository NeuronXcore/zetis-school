# Prompt — La ligne « Travail » dit ce qu'elle a produit (addendum ADR-0041)

> **Une seule session.** Aucune migration, aucun endpoint neuf, aucun appel réseau supplémentaire.
> Lis d'abord : `docs/decisions/adr-0041-addendum-le-travail-dit-ce-qu-il-a-produit.md`,
> la spec `docs/frontend-papa/page-journal.md` `[0041-A]`, la maquette
> `docs/frontend-papa/mockup/mockup-papa-journal-travail-v1.html`.

## Ce qu'on répare

`_travail_out` (`apps/backend/app/modules/production/journal.py:538`) lit `job.input_json` et
**jamais** `job.output_json`. Trois issues opposées rendent trois lignes identiques — dont un
`Équipement · fait · 0 s` qui n'a rien produit.

## Ce que tu fais

### 1. Backend — `resume_de_production`

Dans `production/journal.py`, une fonction qui rend `{texte, ton, route} | None` à partir de
`job.job_type` et `job.output_json`. Une règle par type, table de la spec `[0041-A]`.

- `route` est une **route Papa toute faite**, composée comme `pilotageLinks` — jamais une
  convention parallèle.
- `lesson_content` ne porte qu'un `lesson_id` : le `chapter_id` et le `subject_id` se résolvent par
  **une requête en lot** sur les leçons de la page, patron `names` déjà en place dans
  `_travail_out`. 🔴 **Jamais une requête par ligne.**
- Le champ `production` s'ajoute à `JournalTravailOut` (`production/schemas.py:283`) et aux types
  partagés `packages/types`.

### 2. Frontend — `TravailSection`

Dans `apps/frontend-papa/src/pages/JournalPage.tsx`, la ligne s'insère **entre le libellé et
l'origine** : pastille au ton, texte, puis le lien quand `route` existe. L'origine reste la
dernière ligne.

Tons : `succes` → `text-papa-accent-2` · `avertissement` → `text-papa-warn` (**ambre, jamais
rouge**) · `neutre` → `text-papa-muted`.

### 3. Tests

Un test par règle, plus **le test-verrou central** :

> **Un travail qui n'a rien produit ne rend JAMAIS de `route`.**

🔴 **Sabote-le et prouve qu'il rougit** avant de le déclarer bon — le dépôt a déjà eu trois
test-verrous verts sur un sabotage.

Ajoute aussi : un `job_type` inconnu retombe sur `neutre`/« terminé » sans lever ; un
`output_json` absent ou malformé ne fait pas tomber la page.

## 🔴 Hors périmètre — tu t'arrêtes au bord

- Les lignes de **LOT** : elles ont déjà pli, pièces et liens. N'y touche pas.
- **L'ouverture d'un diagnostic par URL** : le diagnostic sort **sans route**, c'est la décision 4.
- La **file de relecture** et le `null` de `reviewLink:86`.
- Le **veto** sur un travail unitaire (§17 inchangé).
- La **longueur du cours** : elle vit sur la trace `parent`, exclue du Journal.

## Stop-on-blocker

Si `output_json` ne porte pas ce que la table annonce pour un type, **arrête-toi et signale-le** —
ne devine pas un champ, et ne va pas le chercher sur la trace `parent`.
