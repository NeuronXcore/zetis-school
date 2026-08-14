# Prompts Claude Code — ADR-0057 « Une seule façon de trouver » · **slice 1 : QUIZ**

> **Une seule page : `/quiz`.** Les quatre autres (Fiches, Mindmaps, Révision, Capsules au-delà de
> la parité) sont **hors périmètre** — c'est l'arbitrage du lot minimal (§9 (2) de l'ADR) : une
> brique partagée mal née se paie cinq fois. À coller après `/slice`, qui porte la discipline.
>
> Lire d'abord : `docs/decisions/adr-0057-une-seule-facon-de-trouver.md` — en particulier le **§2**
> (le critère qui borne), le **§8** (les quatre règles que la galaxie donne) et le **§9** (les
> arbitrages rendus).

---

## Ce qui a été mesuré à l'ouverture — vérifie-le, ne le crois pas

| Fait | Vérifié le 2026-08-14 |
|---|---|
| `GET /api/student/quizzes/{subject_slug}` **embarque toutes les questions** | `StudentQuizOut.questions: list[StudentQuestionOut]` |
| Ce qu'il sert vraiment aujourd'hui | **37 quiz jouables**, **168 questions** embarquées (Fr 17/74 · Maths 14/66 · SVT 4/19 · Anglais 2/9) |
| Le listing élève filtre `quiz_type == "mission"` | `service.py:list_student_quizzes` — les **18 diagnostics** ne doivent jamais y entrer |
| `StudentQuizOut` ne porte **aucun chapitre** | `quiz_id, title, lesson_id, questions[]` |
| La brique exige **5 champs** | `title, subject, subject_slug, chapter_id, chapter` (`GroupableCapsule`) |
| `GET /api/student/quiz/{quiz_id}` **existe déjà** | route unitaire, quiz complet — c'est la porte du listing léger |
| **Trois** producteurs de `QuizSessionState` | `QuizPage:83` · `useOpenNotionAction:33` · `CoursPage:237` |

⚠️ **Correction d'un chiffre annoncé à l'ouverture** : j'avais dit « 57 quiz, 478 questions ». C'est
le contenu de la **table**, diagnostics compris. Ce que Massimo reçoit, c'est **37 quiz et 168
questions**. Le chiffre juste est celui qui sort de la **vraie fonction**, pas d'un `count(*)`.

---

## Ce qu'il y a à faire, dans cet ordre

**1. Backend — un listing LÉGER, toutes matières (arbitrage du commanditaire).**

Patron : la page Capsules, qui charge sa liste entière — `capsules/router.py:68`, `@router.get("")`.

Un schéma neuf, `StudentQuizListItem` : `quiz_id, title, subject, subject_slug, chapter_id,
chapter, lesson_id, questions_count`. Les cinq premiers champs sont ceux qu'exige la brique ;
`questions_count` **remplace** la liste des questions — c'est tout l'objet de la slice.

🔴 **Tu ne touches ni `StudentQuizOut`, ni `/quizzes/{subject_slug}`, ni `/quiz/{quiz_id}`.** Trois
portes consomment le quiz complet, et deux d'entre elles sont hors de ce chantier (`CoursPage`, le
menu de notion). Le listing léger **s'ajoute**, il ne remplace rien dans cette slice.

⚠️ **Le filtre du listing est EXACTEMENT celui de `list_student_quizzes`** — type `mission`, leçons
validées de l'année active, questions actives. **Factorise-le, ne le récris pas** : deux
formulations d'un même filtre finissent par diverger, et celle qui oublie `quiz_type` sert les
**18 diagnostics** à Massimo.

**2. Types partagés.**

`StudentQuizListItem` dans `packages/types/src/quiz.ts`. ⚠️ **Et son ré-export dans
`packages/types/src/index.ts`** — piège déjà payé par ce dépôt sur les types nommés.

**3. La brique partagée — extraire, pas réécrire.**

`groupBySubjectChapter<T>` (`apps/frontend-massimo/src/lib/groupCapsules.ts`) est **déjà générique**.
Elle sort vers `packages/ui`, avec le rendu qui va avec (étagères + champ de recherche + état vide).

- `GroupableCapsule` → un nom neutre ; `chapters[].capsules` → `items` ; `NO_CHAPTER_LABEL` reste.
- 🔴 **Un seul normaliseur.** `packages/ui` en a déjà un (`normalizeSearch`,
  `components/galaxy/galaxyGraph.ts:100`) et `groupCapsules.ts` en a un second, identique. C'est
  l'angle mort que l'`adr-0053` a nommé : **unifie sur celui du paquet partagé**, n'en crée pas un
  troisième.
- ⚠️ **La parité des Capsules se PROUVE.** La page Capsules doit rendre **exactement** le même
  écran après migration. C'est l'étalon de la slice (§4 de l'ADR).

**4. `QuizPage` — la liste légère, le groupement, la recherche.**

- Au clic sur un quiz : `fetchQuizById(quiz_id)` **puis** `navigate("/quiz/session", { state })` —
  c'est **mot pour mot ce que fait déjà `useOpenNotionAction.ts:31`**, y compris son repli quand le
  quiz a disparu entre l'affichage et le clic. 🔴 **`QuizSessionState` ne change pas**, et les deux
  autres portes ne sont pas touchées.
- **Les quatre règles de la galaxie** (§8), qui deviennent celles de la brique : la recherche et le
  filtre **ne cohabitent pas** · un filtre **ne survit pas** au changement de portée · **un seul
  résultat s'ouvre tout seul** · et la portée, ici, est **toute la page** (règle des capsules,
  arbitrée) — ⚠️ **bornée** : un résultat hors de la matière ouverte doit **emmener** Massimo là où
  il est, jamais s'afficher sans y mener.
- **Aucun chapitre vide n'est offert** (`adr-0049` D2, citée). Un quiz dont la leçon n'a pas de
  chapitre va sous « Sans chapitre » — la brique sait déjà le rendre, **ne l'écarte pas**.
- **Un compteur dit ce qu'il compte** (§7) : ici c'est un nombre de quiz, pas une taille de session.

**5. La doc.**

`API_SPEC.md` — la nouvelle route, son payload, et ce qu'elle **ne** sert **pas** (les questions).
⚠️ Il n'existe **aucun** `docs/frontend-massimo/page-quiz.md` (constaté à l'ouverture) : si tu
décris le comportement de l'écran, dis-le-moi — c'est une spec à créer, donc un arbitrage.

---

## 🔴 La contre-épreuve — CONDITION DE LIVRAISON

Trois verrous, trois sabotages. Écris-les **avant**, vérifie qu'ils rougissent **avant**.

1. **Le groupement** : un quiz d'un chapitre connu apparaît sous ce chapitre.
   *Sabotage* : renvoie `chapter_id = None` pour tous → tout tombe dans « Sans chapitre », le
   verrou rougit.
2. **La recherche** : un mot-clé qui ne matche qu'un quiz d'une **autre matière** le trouve
   (c'est la règle des capsules, celle qui a été arbitrée).
   *Sabotage* : borne le filtre à la matière ouverte → le verrou rougit. **C'est la règle galaxie
   qui n'a pas été retenue : le test est là pour empêcher qu'elle revienne par accident.**
3. **La parité des Capsules** : leur écran ne bouge pas.
   *Sabotage* : change l'ordre de tri dans la brique → le test des capsules rougit.

**Si un verrou est vert avant le correctif, il ne prouve rien.** Ce dépôt a payé ce motif cinq
fois, dont une où le verrou central était vert sur un sabotage.

---

## Les pièges, nommés d'avance

1. 🔴 **Trois portes mènent à `/quiz/session`** — la slice n'en touche **qu'une**. Si tu te
   surprends à modifier `QuizSessionState`, tu débordes : le patron `fetchQuizById` existe
   précisément pour ne pas avoir à le faire.
2. 🔴 **`quiz_type == "mission"`** : un listing qui l'oublie sert **18 diagnostics** dans la liste
   de quiz de Massimo.
3. ⚠️ **Vocabulaire de statut** : les quiz sont `ready` (56) ou `draft` (1) — **aucun n'est
   `validated`**. Un filtre écrit par analogie avec les leçons ou les fiches rendrait une liste
   vide.
4. ⚠️ **Les types partagés doivent être ré-exportés** dans `packages/types/src/index.ts`.
5. ⚠️ **`chapter_servable_count` est plafonné** (`min(8, total)`) — si l'envie vient de réutiliser
   un compteur existant, celui-là n'est pas un stock. (§7 de l'ADR.)
6. ⚠️ **Le champ de recherche ne cherche PAS dans le contenu** — titre, chapitre, notion. C'est le
   §3, et c'est ce qui garde la recherche prévisible pour un enfant.

---

## Vérification exigée

**1. Les suites**, avec leurs chiffres réels : backend (référence **1285** ; ⚠️ **infra Docker
allumée**, sinon `test_auth.py` rougit pour rien — cf. `TROUBLESHOOTING.md`), Massimo (**737**),
Papa (**814** — la brique sort dans `packages/ui`, donc Papa peut être touché), `tsc -b`.

**2. 🔴 REGARDER L'ÉCRAN — cette slice est une interface.** `WORKFLOW.md §5bis` : elle n'est pas
finie tant que personne ne l'a vue. Au minimum : la liste groupée, un chapitre replié/déplié, une
recherche qui rend **zéro** résultat (l'état vide nommé), et le cas « Sans chapitre » s'il existe.
**Mesure dans le DOM**, pas sur une capture — le panneau d'aperçu a un espace de clic de 800 px, et
l'état de `/quiz` ne vit pas dans l'URL.

**3. La parité des Capsules, à l'œil aussi** : c'est l'étalon, et un test de rendu ne dit pas tout
d'un écran.
