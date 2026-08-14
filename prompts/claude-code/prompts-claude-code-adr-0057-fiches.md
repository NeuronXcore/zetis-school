# Prompts Claude Code — ADR-0057 « Une seule façon de trouver » · **slice 2 : FICHES**

> **Une seule page : `/fiches/:slug`** (l'écran 2). Mindmaps et Révision restent **hors périmètre**
> — une slice par page, c'est l'arbitrage du §9 (2). À coller après `/slice`.
>
> Lire d'abord : `docs/decisions/adr-0057-une-seule-facon-de-trouver.md` (§2 le critère, §8 les
> quatre règles, §9 les arbitrages), `docs/frontend-massimo/page-fiches.md` (la spec **existe**,
> contrairement au quiz), et le prompt de la **slice 1** — le motif y est déjà résolu une fois.

---

## Ce qui a été mesuré à l'ouverture — vérifie-le, ne le crois pas

| Fait | Vérifié le 2026-08-14 |
|---|---|
| `FicheTile` porte déjà `chapter` et `subject_slug` | `packages/types/src/fiche.ts:75` |
| Il lui manque **`chapter_id`** et **`subject`** | la brique en exige cinq |
| Volume | **42 tuiles** — Fr 17 (4 chapitres) · Maths 14 (4) · SVT 5 (2) · HG 4 (1) · Anglais 2 (1) |
| `subject_fiche_tiles` est **leçon-centrée** | *« elle doit pouvoir montrer ce qui n'est pas encore une fiche »* (son docstring) |
| 🔴 **`CoursPage` appelle AUSSI `fetchSubjectFicheTiles`** | `CoursPage.tsx:94` — la fonction **reste**, quoi qu'il arrive |
| 🔴 **22 tests** mockent `fetchSubjectFicheTiles` | `FicheSubjectPage.test.tsx` — voir le §STOP |

⚠️ **Histoire-Géo a 4 tuiles de fiches et AUCUN quiz jouable.** Les deux écrans ne montrent pas les
mêmes matières : ne transpose pas un décor de la slice 1 sans le revérifier.

---

## 🔴 LE POINT D'ARRÊT — à traiter AVANT d'écrire quoi que ce soit

La règle de portée arbitrée (« la recherche traverse les matières ») demande que la page voie les
**42** tuiles, pas seulement les 17 de la matière ouverte. Deux formes possibles :

- **(a) La page charge l'index et en dérive la matière courante** — une seule source, propre.
  **Coût : les 22 tests changent de mock.**
- **(b) La page garde son appel par matière ET charge l'index pour la recherche** — aucun test
  touché, mais **deux sources pour le même objet**, ce que le §1 de l'ADR refuse.

**Recommandation : (a).** Mais **tu ne touches pas 22 tests sans autorisation** : expose le choix,
attends la réponse. C'est la règle 4 de `/slice`, et elle vaut d'autant plus que le nombre est gros.

⚠️ Si (a) est retenue, les tests changent de **mock**, pas d'**intention** : leurs décors gagnent
`subject` et `chapter_id`, leurs assertions restent celles qu'elles étaient.

---

## Ce qu'il y a à faire, dans cet ordre

**1. Backend — deux champs, puis un index.**

- `FicheTile` (schéma **et** `packages/types`) gagne **`chapter_id: int | None`** et
  **`subject: str`**. Le chapitre vient de la **leçon**, comme pour les quiz — jamais d'une copie
  dénormalisée (`DATA_MODEL.md` §« Règle de lecture — le chapitre d'un quiz »).
- `GET /api/student/fiche-tiles` — **index toutes matières**, sur le patron exact de
  `GET /api/student/quizzes` (slice 1). Même forme de payload que la route par matière.
- 🔴 **`subject_fiche_tiles` et sa route par matière RESTENT** : `CoursPage` en dépend. Factorise
  le corps commun, **ne le recopie pas** — c'est ce qui a rendu la slice 1 sûre.

**2. Front — l'écran 2 adopte la brique.**

`FicheSubjectPage` rend ses tuiles dans `SubjectChapterShelves`, avec :

- `renderItem` = le `TuileLecon` **existant, inchangé** ;
- `gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"` — **sa** grille, pas celle des capsules ;
- **`defaultOpen`** — la matière est déjà choisie, et un accordéon clos y cache ce que Massimo vient
  de demander (défaut trouvé par un test existant dans la slice 1) ;
- l'en-tête **cesse de nommer la matière** pendant une recherche (défaut trouvé à l'écran, slice 1).

**3. La doc.** `API_SPEC.md` (la route neuve), `docs/frontend-massimo/page-fiches.md` (l'écran
change de comportement — **elle existe, elle doit suivre**), `packages/types`.

---

## 🔴 La contre-épreuve — CONDITION DE LIVRAISON

Quatre verrous, écrits **avant**, rouges **avant** :

1. **Le groupement** — 🔴 **le décor DOIT contenir deux chapitres dans la même matière**. Avec un
   seul, le sabotage « tout dans Sans chapitre » reste **VERT** : le groupe fusionné prend le nom
   du premier objet. C'est arrivé dans la slice 1, et c'est le piège le plus coûteux de ce motif.
2. **La recherche traverse les matières** — un mot qui ne matche qu'une tuile d'une autre matière
   la trouve. *Sabotage : borner à la matière ouverte → rouge.*
3. **L'en-tête ne ment pas** — pendant une recherche, il ne dit plus le nom de la matière ouverte.
4. **Aucune régression sur les deux pages déjà migrées** : Capsules (`defaultOpen` reste `false`)
   et Quiz. *Sabotage : passer `defaultOpen` à `true` dans la brique → le test des Capsules rougit.*

---

## Les pièges, nommés d'avance

1. 🔴 **Le décor à un seul chapitre** (voir ci-dessus) — le sabotage le plus vicieux du motif.
2. 🔴 **`CoursPage` lit `FicheTile`** : ajouter deux champs au type ne doit pas casser sa
   compilation — vérifie-la, elle n'est pas dans le périmètre mais elle est dans le compilateur.
3. ⚠️ **Un `prop` déclaré et jamais lu** passe les tests et **pas `tsc`** (`TS6133`, payé en
   slice 1). Le typecheck fait partie de la livraison, pas de la politesse.
4. ⚠️ **`@testing-library/user-event` n'est pas installé** : `fireEvent.change(champ, { target: {
   value: "…" } })`.
5. ⚠️ **`export { x } from "…"` ne ramène pas `x` dans la portée** du module qui l'utilise aussi.
6. ⚠️ **Ne touche pas** à l'atelier, aux versions, au pont SRS : l'ADR-0054 a laissé des défauts
   ouverts sur ces surfaces, ils ne sont **pas** de cette slice.

---

## Vérification exigée

**1. Les suites**, avec leurs chiffres : backend (référence **1287** ; ⚠️ **infra Docker allumée**),
Massimo (**743**), Papa (**814**), `tsc -b` des deux côtés.

**2. 🔴 REGARDER L'ÉCRAN** — `WORKFLOW.md §5bis`. Au minimum : les tuiles rangées sous **deux**
chapitres au moins, une recherche qui ramène une autre matière, l'état vide nommé, et **les pages
Capsules et Quiz inchangées**. La paire `backend` + `massimo` de `.claude/launch.json` ; pour une
page derrière `RequireAuth`, poser le token dans `localStorage` (clé `zetis_massimo_token`) évite
de traverser l'écran de connexion.

**3. Mesure dans le DOM**, pas sur capture.
