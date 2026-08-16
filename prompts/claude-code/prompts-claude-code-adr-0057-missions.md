# Prompts Claude Code — ADR-0057 · addendum **MISSIONS** · slice 5, **la dernière du chantier**

> **Une seule surface : l'écran 2 de `/missions`** (une matière ouverte). À coller après `/slice`.
>
> Lire d'abord : `docs/decisions/adr-0057-une-seule-facon-de-trouver.md` (Amendement 1) (**tout**, il est court),
> `docs/decisions/adr-0057-une-seule-facon-de-trouver.md` (§1, §2, §3, §6),
> `docs/frontend-massimo/page-missions.md` — ⚠️ **elle porte TROIS passages faux**, dont deux
> antérieurs à ce chantier —, et **les quatre prompts précédents** : le geste a été fait quatre
> fois, tous ses pièges sont écrits.

---

## Ce qui a été mesuré à l'ouverture — vérifie-le, ne le crois pas

| Fait | Vérifié le 2026-08-14 |
|---|---|
| Volume | **58 missions actionnables** (`validated` + `planned\|active`) — Maths **25** · Français 22 · SVT 14 · Anglais 4 |
| 🔴 **Le chapitre d'une mission n'existe pas** | `Skill` n'a **aucun** `chapter_id` — il se dérive par les leçons validées |
| Répartition mesurée | **52 sous UN chapitre (90 %)** · 4 sous aucun · 1 sous deux · 1 sous trois |
| Multi-matières | **1 sur 58** (le `champion`), et `useMissions.ts:211` **l'extrait déjà** |
| 🔴 `MissionStudentOut` **n'a pas de `subject_slug`** | seulement `subject: str` (le **nom**). Le front le dérive : `nameToSlug[name] ?? slugify(name)` (`useMissions.ts:221`) |
| ⚠️ `subject_name` vaut `""` quand `subject_id IS NULL` | `missions/service.py:240-241` — un repli qui passe pour une valeur |
| 🔴 **`MissionsPage.test.tsx` n'a que 2 tests** | filet très mince pour une page de trois écrans |
| La route | `GET /api/missions` (`@router.get("")`), schéma `MissionStudentOut` |

---

## 🔴 LE POINT DUR — dériver un chapitre sans jamais en inventer un

La règle est écrite (addendum §2 et §3) ; ce qui reste à faire, c'est de la tenir **sans desserrer
le critère §4** :

> **Aucune colonne, aucune migration.** Le chapitre se calcule **à la lecture**. Si tu te surprends
> à vouloir un `chapter_id` sur `missions` — même « juste pour trier » — **arrête-toi et
> signale-le** : c'est la sortie de périmètre que l'ADR nomme, et son signal d'erreur n° 2.

La chaîne est `Skill → LessonSkill → Lesson(status = 'validated') → Chapter`. Elle existe déjà
partout dans le dépôt ; **ne la réécris pas**, et surtout ne prends pas la première fonction qui
lui ressemble — voir le piège n° 1.

**Ce que rend la dérivation, et ce qu'on en fait :**

| Chapitres dérivés | Ce qu'on affiche |
|---|---|
| exactement **1** | ce chapitre (90 % des cas) |
| **0** | « Sans chapitre » |
| **2 ou plus** | « Sans chapitre » — 🔴 **on n'en choisit JAMAIS un** |

Le libellé « Sans chapitre » est déjà celui de la brique (`NO_CHAPTER_LABEL`), déjà rendu en
dernier, déjà à l'écran sur les Capsules. Rien à inventer.

⚠️ **Et la notion de la mission n'est pas seule** : une mission `champion` porte des notions **sur
ses étapes** (`MissionStep.skill_id`), pas sur elle-même. Décide explicitement si la dérivation
regarde les étapes — et dis-le. *(Sur l'écran 2, la question est théorique : le champion n'y entre
pas. Mais le service, lui, sert tout le monde.)*

---

## Ce qu'il y a à faire, dans cet ordre

**1. Backend.** Deux champs sur `MissionStudentOut` : **`chapter`** (le nom, `str | None`) et
**`chapter_id`** (`int | None`), plus **`subject_slug`** qui manque et que la brique exige.
Dérivation en lecture dans `missions/service.py`, à côté de `_skill_subject`.

- ⚠️ **`subject_slug` n'est pas cosmétique** : sans lui, le front continue de deviner un slug à
  partir d'un nom (`slugify`), et un nom accentué ne redonne pas toujours le bon slug. Les quatre
  autres pages le servent.
- ⚠️ **Attention au N+1** : `_skill_subject` fait déjà un `db.get` par étape. Dérive **en lot** ou
  dis pourquoi tu ne l'as pas fait — 58 missions, ce n'est pas dramatique, mais le mesurer vaut
  mieux que le supposer.

**2. Types.** `packages/types` — et **n'oublie pas `packages/types/src/index.ts`** (piège consigné).

**3. Front.** L'écran 2 (`MissionsPage`, vue matière) passe à `SubjectChapterShelves` :
`showChapterLabel` **par défaut** (ici le chapitre n'est PAS l'objet — les missions le sont) ·
**`defaultOpen`** (la matière est déjà choisie) · **`showSubjectHeader={false}`** (l'écran nomme
déjà la matière — le triple nommage a été payé sur `/fiches`) · **`chapterOrder`** = ordre du
programme si le serveur le donne.

⚠️ **Ne touche ni à l'écran 1, ni à l'écran 3, ni aux modales, ni au deck 🏆.**

**4. La recherche cherche le titre ET le nom de notion** (addendum §6). Les titres sont préfixés
d'un verbe de type (« Renforcer : … ») : sur le seul titre, chercher « renforcer » remonterait tout
un type. La brique filtre sur `title` — **expose ton choix** : concaténer dans `title`, ou
étendre la brique. *(Concaténer un mot invisible dans un champ affiché serait un mensonge
d'affichage : préfère l'honnêteté, et dis-le.)*

**5. La doc — 🔴 TROIS passages, et deux sont une dette antérieure** (correction demandée à
l'ouverture) :

| Lignes de `page-missions.md` | Ce qu'elles disent | Réalité |
|---|---|---|
| **67-72** | *« Missions croisées — DIFFÉRÉES. **Non implémentées** »* | **Livrées** (ADR-0022) : deck 🏆, 1 mission en base |
| **69** | *« Le modèle `Mission` est mono-matière (un seul `subject_id`) »* | **`subject_id` est nullable** (ADR-0017 §5ter) |
| **164-165** | *« Hors périmètre V1 : … recherche »* | c'est ce chantier |

Plus `API_SPEC.md` (trois champs neufs) et `CHANGELOG.md`.

---

## 🔴 La contre-épreuve — CONDITION DE LIVRAISON

1. **Une notion enseignée dans UN chapitre range sa mission dessous.** *Sabotage : rendre `None` →
   rouge.*
2. 🔴 **Une notion enseignée dans DEUX chapitres → « Sans chapitre »**, et **surtout pas** le
   premier. *Sabotage : prendre `chapitres[0]` → rouge.* C'est le §3, et c'est la décision la plus
   facile à trahir sans que rien ne se voie.
3. **Une notion sans leçon validée → « Sans chapitre »**, pas une erreur, pas une disparition.
   ⚠️ **Décor à deux causes distinctes** (aucune leçon / leçon en brouillon) — sinon le sabotage
   reste vert, c'est arrivé hier sur `/revision`.
4. 🔴 **Un BROUILLON ne donne pas de chapitre.** *Sabotage : passer à `status != 'archived'` →
   rouge.* **C'est l'erreur exacte que le cadrage a commise** et qui a fait annoncer 3+1 cas
   ambigus au lieu de 1+1.
5. 🔴 **Décor à DEUX chapitres dans la MÊME matière**, sans quoi le sabotage « tout dans un seul
   groupe » reste **VERT** (il l'est resté en slice Quiz).
6. **Le champion n'entre dans aucune étagère de matière.** *Sabotage : retirer le filtre de
   `useMissions.ts:211` → rouge.* Signal d'erreur n° 5 de l'addendum.
7. 🔴 **AUCUNE migration** — `ls apps/backend/alembic/versions/` doit être inchangé. Si tu en as
   créé une, tu es sorti du périmètre.
8. **Les quatre pages déjà migrées ne bougent pas** — la brique est partagée par cinq pages.

---

## Les pièges, nommés d'avance

1. 🔴 **`lessons_by_skill` N'EST PAS la bonne fonction** : elle filtre `Lesson.status != 'archived'`
   — **les brouillons passent**. Le gate d'une surface élève est `status == 'validated'`, celui
   d'`ordered_chapter_skill_ids`. Le cadrage s'y est fait prendre, et sa première mesure était
   fausse. **Vérifie la fonction que tu choisis avant de t'en servir.**
2. 🔴 **`Chapter` n'a aucun `subject_id`** — deux parents, tous deux nullables. Ne descends pas
   matière → chapitre : pars de la notion. *(Trou de l'ADR-0037, retrouvé deux fois depuis.)*
3. 🔴 **Une mission `champion` porte ses notions sur ses ÉTAPES**, pas sur elle-même.
4. ⚠️ **`subject: ""`** est un repli servi comme une valeur (`service.py:241`). Ne construis rien
   dessus. *(Hors périmètre : signalé, non traité.)*
5. ⚠️ **Un test existant modifié pour passer est une régression masquée.** `MissionsPage.test.tsx`
   n'a que **2** tests : si l'un tombe, arrête-toi et dis-le AVANT.
6. ⚠️ **Ajouter un type nommé sans le ré-exporter** dans `packages/types/src/index.ts` (déjà payé).
7. ⚠️ **Un `prop` déclaré et jamais lu** passe les tests et pas `tsc` (`TS6133`, déjà payé).
8. ⚠️ **`fireEvent`**, pas `@testing-library/user-event` (absent du dépôt).
9. ⚠️ **`graphify affected` a rendu vide deux fois** sur des fonctions réellement appelées.
   Recoupe au `grep`.

---

## Vérification exigée

**1. Les suites** : backend (référence **1295** ; ⚠️ **infra Docker allumée**), Massimo (**759**),
Papa (**814**), `tsc -b` des deux côtés.

**2. 🔴 REGARDER L'ÉCRAN.** Hier, **quatre défauts sur cinq n'étaient visibles que là**, quatorze
tests verts pendant ce temps. Au minimum : ouvrir **Mathématiques** (25 missions — la plus longue
liste de l'interface) et voir si elle devient lisible · un chapitre au moins avec plusieurs
missions · le groupe « Sans chapitre » **en dernier** · une recherche qui trouve par **nom de
notion** · le deck 🏆 intact · **et les quatre pages déjà migrées inchangées**.
Paire `backend` + `massimo` de `.claude/launch.json` ; token dans `localStorage`
(`zetis_massimo_token`).

**3. Mesure dans le DOM**, pas sur capture. ⚠️ Deux rappels d'hier : un `click()` JS puis une
mesure **dans le même appel** lit l'état d'AVANT (React n'a pas rendu) ; et mesurer une géométrie
**sous le curseur** rend des nombres faux (`hover:scale-*`) — lis `getComputedStyle`.

**4. Dis ce que tu n'as pas pu juger.** L'addendum nomme un signal qu'aucun test n'attrape :
*« "Sans chapitre" devient le plus gros groupe »*. Il devrait valoir **6 sur 58** ; s'il en vaut
plus à l'écran, c'est que la dérivation ne décrit pas le programme — **dis-le, ne l'arrondis pas.**
