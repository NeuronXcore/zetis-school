# Prompts Claude Code — ADR-0057 « Une seule façon de trouver » · **slice 4 : RÉVISION**

> **La dernière du motif, et la plus chère.** Elle **dépense** l'amendement de l'`adr-0049`
> Décision 1, acquis le 2026-08-14 et jamais consommé. À coller après `/slice`.
>
> Lire d'abord : `docs/decisions/adr-0057-une-seule-facon-de-trouver.md` (**§5, §6, §7, §9(1)**),
> `docs/decisions/adr-0049-le-deck-de-revision-par-chapitre.md`,
> `docs/frontend-massimo/page-revision.md` — ⚠️ **elle dit l'INVERSE de ce chantier en trois
> endroits**, c'est normal, elle date d'avant l'amendement — et **les trois prompts précédents**
> (`-0057.md`, `-0057-fiches.md`, `-0057-mindmaps.md`) : le geste a été fait trois fois, ses pièges
> sont écrits.

---

## Ce qui a été mesuré à l'ouverture — vérifie-le, ne le crois pas

| Fait | Vérifié le 2026-08-14 |
|---|---|
| 🔴 **Un test-verrou de dépôt INTERDIT cette slice** | `RevisionPage.test.tsx:114` lit le **source** et exige qu'il ne contienne ni `\bchapter\b` ni `/chapitre/i` |
| 🔴 **La page n'a AUCUN objet à grouper** | `ReviewsSummary` ne porte que des matières — et les cartes ne sont pas listables (leur recto est la question) |
| Le deck `{chapter}` existe **de bout en bout** | session, attempt, revalidation serveur, XP `review_chapter` — livré par la PR #109 |
| `chapter_servable_count` / `_counts` existent | `memory/service.py:345` et `:371` |
| ⚠️ **`chapter_servable_counts` n'est PAS un vrai lot** | sa docstring promet d'éviter « N×2 requêtes » ; le corps est **une boucle** sur la version unitaire (`service.py:378`). La dédup est le seul gain |
| **Aucune requête « chapitres d'une matière »** dans tout le backend | le listing est réellement neuf — le **comptage**, lui, existe |
| Volume du niveau 3 | **10 chapitres offrables** — Fr 4/10 · Maths 4/5 · SVT 1/4 · **HG 0/2** · Angl 1/1 |
| `revisionSessionState` | `agendaSections.ts:169` — rend `{deck:{chapter}, label, subjectSlug}`, **sans `subjectNames`** |
| `RevisionPage.test.tsx` | **7 tests** + le verrou. `RevisionSessionPage` a les siens |
| La brique est éprouvée sur **4 pages** | Capsules · Quiz · Fiches · Mindmaps. `groupCapsules.ts` a disparu de Massimo |

---

## 🔴 POINT DUR 1 — le verrou se RETOURNE, il ne se supprime pas

[`RevisionPage.test.tsx:114`](../../apps/frontend-massimo/src/pages/RevisionPage.test.tsx) dit
lui-même comment il meurt :

> *« Si elle devient souhaitable un jour, c'est un ADR qui l'ouvre — **pas un test qu'on
> supprime**. »*

L'`adr-0057` §9(1) **est** cet ADR. Sa clause de sortie est remplie — mais un verrou dont la
condition tombe ne laisse pas un trou : **il change d'objet**. Ce qu'il protégeait (le *blocked
practice*) n'est pas levé par l'amendement, il est **borné par le §5**. Le nouveau verrou lock
exactement cette borne, et il doit être **au moins aussi difficile à contourner** que l'ancien :

1. **Les mélanges restent en tête** — avant la grille des matières dans l'ordre du DOM.
2. 🔴 **Aucun chapitre n'est atteignable sans avoir déplié sa matière** — c'est le « troisième
   rang » du §5, rendu mesurable. À l'arrivée sur `/revision`, **zéro** lanceur de chapitre.
3. Un chapitre à **zéro carte servable n'apparaît pas** — §6, et le serveur en décide.

⚠️ **Écris-le AVANT de toucher `RevisionPage.tsx`**, et fais-le rougir sur du code qui déplie tout
d'emblée. Un verrou de contre-poids écrit après coup ne prouve que la capacité de l'auteur à
décrire ce qu'il vient de faire.

---

## 🔴 POINT DUR 2 — la forme **(A)**, arbitrée : l'objet EST le chapitre

Arbitrage du commanditaire, 2026-08-14. La brique range des **objets dans** des chapitres ; ici il
n'y a pas d'objets, **le chapitre est l'objet**. Conséquence directe :

- chaque `ChapterGroup` contient **exactement un** item — le lanceur de ce chapitre ;
- donc le libellé de chapitre de la brique et le titre de la tuile diraient **la même chose, deux
  fois** — c'est le défaut exact corrigé sur `/fiches` le 2026-08-14 ;
- 🔴 d'où **une prop de plus sur la brique : `showChapterLabel`** (défaut `true` = parité stricte
  Capsules / Quiz / Fiches / Mindmaps ; `false` ici, et **ici seulement**).

**Ce n'est pas une variante locale** (§1) : la brique reste la brique, elle gagne une prop, comme
elle a gagné `defaultOpen`, `showSubjectHeader` et `chapterOrder` aux trois slices précédentes.

⚠️ **Le clic n'a pas besoin d'adresse.** Contrairement aux mindmaps (`?carte=`), la destination
n'est pas une page mais **une session** : cliquer un chapitre d'une autre matière lance
`navigate("/revision/session", {state})` — « emmener » (§9(3)) est donc satisfait par construction.
**N'invente pas de `?chapitre=`.**

---

## Ce qu'il y a à faire, dans cet ordre

**1. Backend — le listing des chapitres offrables.** Un endpoint neuf,
`GET /api/student/reviews/chapters`, qui rend pour **toutes** les matières (la recherche traverse,
§9(3)) : `{chapter_id, name, subject, subject_slug, session_size}`.

- **Pourquoi un endpoint séparé plutôt qu'enrichir `summary`** : `summary` est aussi consommé par
  l'**Accueil** (`useAccueil.ts`) qui n'a que faire des chapitres — et les trois slices précédentes
  ont toutes ajouté un listing léger à côté. Reste cohérent.
- 🔴 **`session_size`, jamais un stock.** `chapter_servable_count` rend `min(8, total)` : c'est une
  **taille de session** (§7). Nomme le champ pour ce qu'il est — le précédent est
  `ReviewSubjectDue.session_size`, dont le commentaire dit déjà *« aucune nouvelle surface ne doit
  afficher `due_count` »*. Cette tuile est une **nouvelle surface**.
- **Zéro à l'écart, côté serveur** (§6) : un chapitre à `session_size == 0` **ne sort pas** de
  l'endpoint. Le client ne recompte jamais.
- ⚠️ **Mesure le coût** : `chapter_servable_counts` est une boucle (2 requêtes par chapitre). Sur
  ~22 chapitres c'est ~44 requêtes légères. Si tu le trouves inacceptable, **dis-le et propose** —
  ne réécris pas le comptage en silence, c'est le cœur d'un ADR livré.

**2. Types.** `packages/types/src/reviews.ts` — un `ReviewChapterDue` et le contrat de la route.
Le miroir Pydantic est la règle `CLAUDE.md` n°8.

**3. Front.** `RevisionPage` charge le listing **en plus** du summary, et rend, **sous** la grille
des matières :

`SubjectChapterShelves` avec **`showChapterLabel={false}`** · **`showSubjectHeader`** (les étagères
sont le dépliage : `true`) · **`defaultOpen={false}`** — 🔴 c'est le troisième rang du §5, ne le
mets pas à `true` · **`chapterOrder`** = ordre d'apparition du serveur (le programme) ·
`renderItem` = un `DeckDisc` (`count={session_size}`, `imageUrl` de la matière).

⚠️ **Ne touche pas** aux mélanges, ni au deep link `?subject=`, ni à `SubjectDeckGrid`.

**4. Le verrou retourné, plus les tests de la slice.** Voir la contre-épreuve.

**5. La doc.** `page-revision.md` — 🔴 **trois passages disent le contraire** et doivent être
amendés, pas contournés : le 🔴 des lignes **51-53** (*« cette page ne porte AUCUNE entrée »*), le
🔴 des lignes **276-281** (*« reste hors périmètre, et c'est TRANCHÉ »*), et la *« conséquence
assumée »* des lignes **283-285**, qui devient fausse. Marque-les `[0057]` comme l'`adr-0049` avait
marqué les siens. Plus `API_SPEC.md` (route neuve) et `CHANGELOG.md`.

---

## 🔴 La contre-épreuve — CONDITION DE LIVRAISON

1. **Le verrou de contre-poids**, écrit en premier et **rouge d'abord** — les trois points du
   POINT DUR 1. *Sabotage : `defaultOpen={true}` → rouge. Mélanges déplacés sous les matières →
   rouge.*
2. **Aucune porte sur du vide** — 🔴 **verrou SERVEUR** : un chapitre sans leçon validée, ou dont
   les cartes sont `pending`, **ne sort pas** de l'endpoint. *Sabotage : retirer le filtre à zéro →
   rouge.* En slice Fiches, un champ supprimé du payload laissait **87 tests verts** : un verrou
   front seul ne prouve rien.
3. **Le compte affiché est une taille de session, pas un stock** — un chapitre à **72** cartes
   servables affiche **8**. *Sabotage : servir le total → rouge.* C'est le signal n°4 de l'ADR.
4. **La recherche traverse les matières, et le clic lance la session du bon chapitre.**
   *Sabotage : borner à la matière ouverte → rouge.*
5. 🔴 **Décor à DEUX chapitres offrables dans la MÊME matière**, et **deux matières**. Sans ça, le
   sabotage « tout dans un seul groupe » reste **VERT** — il l'est resté en slice Quiz.
6. **L'ordre du PROGRAMME** — deux chapitres dont l'ordre alphabétique diffère de l'ordre servi.
   *Sabotage : ignorer `chapterOrder` → rouge.*
7. **Les 7 tests existants de `RevisionPage` passent SANS être touchés**, et
   `RevisionSessionPage` aussi. Rends les deux chiffres (avant / après).
8. **Capsules, Quiz, Fiches et Mindmaps ne bougent pas** — `showChapterLabel` a un défaut, et il
   est `true`. La parité Capsules reste l'étalon de tout le motif.

---

## Les pièges, nommés d'avance

1. 🔴 **Modifier un test existant pour le faire passer est une régression masquée** (`/slice` §4).
   Le seul test qui a le droit de changer ici est **le verrou**, parce qu'un ADR l'ouvre — et il
   change d'**objet**, il ne disparaît pas.
2. 🔴 **`session_size` vs stock** — le §7 a déjà mordu au cadrage : « 8 » affiché pour des
   chapitres de 72, 39, 45 et 12 cartes.
3. 🔴 **Le décor à un seul chapitre** — le sabotage le plus vicieux du motif, payé trois fois.
4. ⚠️ **L'en-tête de matière affichera `shelf.count`, qui vaudra le nombre de CHAPITRES**, pas de
   cartes — sur une page où tous les autres badges comptent des cartes. Regarde-le à l'écran et
   dis si ça ment. C'est exactement le genre de défaut que seul l'œil trouve.
5. ⚠️ **Histoire-Géo a 0 chapitre offrable sur 2** : sa matière ne doit produire **aucune étagère**,
   pas une étagère vide. Cas de test réel, pas théorique.
6. ⚠️ **`revisionSessionState` ne transmet pas `subjectNames`** — le deck chapitre est mono-matière,
   donc l'étiquette par carte n'a pas lieu d'être. Ne le « corrige » pas.
7. ⚠️ **Un `prop` déclaré et jamais lu** passe les tests et pas `tsc` (`TS6133`, déjà payé).
8. ⚠️ **`fireEvent`**, pas `@testing-library/user-event` (absent du dépôt).
9. ⚠️ **Ne touche à AUCUNE mécanique de session** : plafonds, `servable()`, intervalles, XP,
   `record_attempt`, quota ADR-0056. Le deck `{chapter}` se réutilise **tel quel**.
10. ⚠️ **`graphify affected` a rendu « No affected nodes found » deux fois** sur des fonctions
    réellement appelées (slices Fiches et Mindmaps). Recoupe au `grep`.

---

## Vérification exigée

**1. Les suites** : backend (référence **1291** ; ⚠️ **infra Docker allumée**), Massimo (**752**),
Papa (**814**), `tsc -b` des deux côtés.

**2. 🔴 REGARDER L'ÉCRAN.** Au minimum : les mélanges toujours en tête et plus grands · une matière
qui se déplie sur **deux chapitres au moins** · Histoire-Géo sans étagère · un compte de chapitre
qui ne ment pas (piège 4) · une recherche qui ramène une autre matière et un clic qui lance la
bonne session · l'état vide nommé · **et les quatre pages déjà migrées inchangées**.
Paire `backend` + `massimo` de `.claude/launch.json` ; token dans `localStorage`
(`zetis_massimo_token`) pour passer `RequireAuth`.

**3. Mesure dans le DOM**, pas sur capture.

**4. Dis ce que tu n'as pas pu voir.** L'ADR nomme un signal qu'aucun test ne peut attraper — *« une
liste de chapitres plus longue que la liste des matières a remplacé un choix par un inventaire »* —
et le rapport est **10 chapitres pour 5 matières**. Donne ton avis à l'écran ; c'est un arbitrage,
pas un test.
