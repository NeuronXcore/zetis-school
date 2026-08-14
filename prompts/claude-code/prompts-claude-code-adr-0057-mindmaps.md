# Prompts Claude Code — ADR-0057 « Une seule façon de trouver » · **slice 3 : MINDMAPS**

> **Une seule page : `/mindmaps/:slug`** (l'écran 2). La **Révision** reste hors périmètre — c'est
> la dernière, et la plus chère. À coller après `/slice`.
>
> Lire d'abord : `docs/decisions/adr-0057-une-seule-facon-de-trouver.md`,
> `docs/frontend-massimo/page-mindmaps.md` (la spec **existe**), et **les deux prompts précédents**
> — le geste a déjà été fait deux fois, ses pièges sont écrits.

---

## Ce qui a été mesuré à l'ouverture — vérifie-le, ne le crois pas

| Fait | Vérifié le 2026-08-14 |
|---|---|
| `MindmapListItem` porte `chapter` et `subject_slug` | il manque **`chapter_id`** et **`subject`** |
| Volume | **27 cartes** — Fr 14 · Maths 10 · SVT 2 · Anglais 1 · **HG 0** |
| `list_subject_mindmaps` joint DÉJÀ `Chapter` | et trie `Chapter.sort_order, Lesson.sort_order` — **l'ordre du programme** |
| ✅ `fetchSubjectMindmaps` n'a **qu'un** consommateur | l'écran 2 — pas de `CoursPage` à ménager |
| 🔴 **`MindmapSubjectPage` n'a AUCUN test** | ni page, ni rendu. Zéro filet |
| ⚠️ Piège de routage consigné dans le code | `/mindmaps/summary` **avant** `/mindmaps/{mindmap_id}`, sinon « summary » est lu comme un id (422) |

---

## 🔴 LE POINT DUR — « emmener » n'a pas d'adresse ici

La règle arbitrée veut qu'un résultat d'une autre matière **emmène** Massimo là où il vit. Les
fiches avaient déjà une adresse (`?fiche=<id>`, ADR-0054). **Les mindmaps n'en ont pas** :
`/mindmaps/:slug` ouvre la matière, et la carte s'ouvre par un **index dans la liste**
(`open(i)`) — un index qui n'a aucun sens pour une carte d'une autre matière.

Trois formes, par coût croissant :

1. **Naviguer vers `/mindmaps/<slug>`** — il retrouve la matière, mais doit re-cliquer. *« Emmener »
   au sens faible.*
2. 🔴 **Ajouter `?carte=<id>`** — l'adresse manquante, sur le patron exact de `?fiche=`. La carte
   s'ouvre toute seule à l'arrivée. **Recommandé.**
3. Ouvrir la carte en place, quelle que soit sa matière — **écarté** : l'écran est celui d'une
   matière, et son fil d'Ariane mentirait.

**Expose ton choix avant de coder.** Si tu pars sur (2), c'est une capacité neuve de la page —
petite, mais neuve : dis-le, ne la glisse pas dans le lot.

---

## Ce qu'il y a à faire, dans cet ordre

**1. Backend.** `chapter_id` (depuis `Lesson.chapter_id`) et `subject` (le nom) sur
`MindmapListItem` — schéma **et** `packages/types`. Puis `GET /api/student/mindmaps` (index toutes
matières), qui appelle `list_subject_mindmaps` matière par matière : **aucune règle neuve**.
⚠️ **Place la route avec soin** — le piège `summary`/`{mindmap_id}` est déjà consigné.

**2. Front.** L'écran 2 charge l'index et **en dérive la matière ouverte** (une seule source), puis
`SubjectChapterShelves` avec :
`gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"` · **`defaultOpen`** ·
**`showSubjectHeader={cherche || groupes.length > 1}`** · **`chapterOrder`** = ordre d'apparition
(le programme). Le chapitre **ne s'écrit plus sur la carte** si elle l'affiche.

**3. 🔴 Les PREMIERS tests de cette page.** Elle n'en a aucun : ce n'est pas une raison de ne pas
en écrire, c'est la raison d'en écrire.

**4. La doc.** `API_SPEC.md` (route neuve + deux champs) et `page-mindmaps.md` (l'écran change de
comportement — **la spec existe, elle suit**).

---

## 🔴 La contre-épreuve — CONDITION DE LIVRAISON

1. **Le groupement** — 🔴 **décor à DEUX chapitres dans la même matière**, sans quoi le sabotage
   « tout dans Sans chapitre » reste **VERT** (il l'est resté en slice Quiz).
2. **L'ordre du PROGRAMME** — deux chapitres dont l'ordre alphabétique diffère de l'ordre servi.
   *Sabotage : ignorer `chapterOrder` → rouge.*
3. **La recherche traverse les matières**, et le clic **emmène**. *Sabotage : borner à la matière
   ouverte → rouge.*
4. **Le backend porte les deux champs** — 🔴 **un verrou SERVEUR, pas seulement front** : en slice
   Fiches, supprimer `chapter_id` du payload laissait **87 tests verts**.
5. **Capsules, Quiz et Fiches ne bougent pas** — la brique est partagée par quatre pages désormais.

---

## Les pièges, nommés d'avance

1. 🔴 **Le décor à un seul chapitre** — le sabotage le plus vicieux du motif, déjà payé.
2. 🔴 **Un champ neuf sans verrou serveur** peut disparaître en silence — déjà payé.
3. ⚠️ **L'ordre des routes FastAPI** : `/mindmaps` (index) ne doit pas être capté par
   `/mindmaps/{mindmap_id}`. Le fichier porte déjà un commentaire sur ce piège exact.
4. ⚠️ **`open(i)` est un INDEX dans la liste** — il devient faux dès qu'un résultat vient d'une
   autre matière. C'est tout l'objet du point dur ci-dessus.
5. ⚠️ **Un `prop` déclaré et jamais lu** passe les tests et pas `tsc` (`TS6133`, déjà payé).
6. ⚠️ **`fireEvent`**, pas `@testing-library/user-event` (absent du dépôt).
7. ⚠️ **Ne touche pas** au viewer, à Reconstruire, au plein écran ni aux layouts elk : l'ADR-0052 y
   a ses propres décisions.

---

## Vérification exigée

**1. Les suites** : backend (référence **1289** ; ⚠️ **infra Docker allumée**), Massimo (**747**),
Papa (**814**), `tsc -b` des deux côtés.

**2. 🔴 REGARDER L'ÉCRAN** — et cette fois c'est la **seule** preuve d'avant-vol : la page n'avait
aucun test. Au minimum : deux chapitres au moins, une recherche qui ramène une autre matière, le
clic qui emmène, l'état vide nommé, et **les trois pages déjà migrées inchangées**.
Paire `backend` + `massimo` de `.claude/launch.json` ; token dans `localStorage`
(`zetis_massimo_token`) pour passer `RequireAuth`.

**3. Mesure dans le DOM**, pas sur capture.
