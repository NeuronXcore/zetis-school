# ADR-0039 — Tout nombre affiché sur le Dashboard ouvre exactement ce qu'il compte

## Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0028` (l'agrégat unique, le §1 « aucun query param », le §4 « zéro état de
> chargement », le §5 « les KPI sont des filtres de focus »), `adr-0028-addendum-analyse-par-matiere`
> (le verrou constat↔preuve, « le réseau ne sert que des NOMS », **« un panneau déplié, pas une
> modale »**), `adr-0038` (les trois preuves de la Lecture ZETIS mènent quelque part),
> `adr-0023` (la Couverture de production, ses interdits §F.2), `adr-0014 §2` (le quiz servi sans
> gate), `adr-0037` (la leçon canonique d'une notion, et le piège du chapitre sous `Theme` seul).
>
> **Aucune migration.** Un module de lecture nouveau, une page nouvelle, **deux** endpoints de rejet
> qui manquaient, un champ ajouté à deux contrats existants.

## Contexte

L'ADR-0038 a posé une règle en la faisant tenir sur trois surfaces : *un constat ne peut plus
annoncer un nombre que sa preuve ne sert pas*. Le Dashboard en porte encore **deux** qui la violent,
et elles ont ceci de commun qu'elles annoncent du **travail** — donc exactement les endroits où
l'écart coûte le plus cher.

### 1. La file « À décider », ligne `validation`

Elle affiche *« 27 contenus en attente de relecture »*, détaillés en *« 27 leçons · 1 fiche ·
5 capsules »*, et un bouton « Relire » vers `/couverture`.

> 🔴 **Le détail est une chaîne de caractères construite au serveur.** `_inbox()` fabrique
> `" · ".join(f"{count} {label}…")` et le front reçoit du texte. Ce n'est pas « pas encore
> cliquable » : c'est **non cliquable par construction**, et aucun geste front ne peut le rattraper
> sans re-parser une phrase.

Et la destination est fausse pour l'essentiel du chiffre :

| famille comptée | atteignable depuis `/couverture` ? |
|---|---|
| leçons `draft` | ⚠️ oui, mais sous « 🔒 Non validées » — **pas** sous « ⏳ À relire », qui ne filtre que les dérivés |
| fiches, mindmaps `pending` | ✅ oui |
| capsules `pending` | 🔴 **non — les capsules ne sont pas dans la matrice**, qui n'a que 4 colonnes leçon-centrées |
| chapitres `pending` | 🔴 non |

Papa clique sur un « 27 » et arrive sur une page qui, selon la pilule qu'il choisit, en montre 12 ou
aucun. C'est le motif exact de l'addendum ADR-0028 : **deux populations disjointes sous le même
mot**.

> Aggravant, trouvé en lisant : `_inbox()` compte sur **toute la base** (`select(count()).where(
> Lesson.status == "draft")`, sans borne), là où `production/coverage.py` restreint à l'**année
> active**. Les deux surfaces ne peuvent pas s'accorder, quoi qu'on fasse du lien.

### 2. La carte « Chaîne de contenus »

Elle affiche entre deux marches *« ↓ 19 à produire »*. Le nombre se lit et ne se suit pas.

> 🔴 **Et il est faux sur la dernière marche.** `ContentChainCard.tsx:29` calcule
> `missing = stage.value - next.value`, alors que chaque marche porte sa propre `target`. Pour
> **Quiz** (`target = lessons_ok`, pas `fiches_ok`), le delta affiché sous « Fiches » est
> `fiches_ok − quizzes_ok` : un nombre qui ne désigne rien, et qui annonce « ↓ complet » dès que
> `fiches_ok ≤ quizzes_ok`. Personne ne l'avait vu parce que personne ne pouvait le suivre.

### Ce que le dépôt disait déjà

Ce chantier n'invente pas sa réponse, il la **livre** : `CouverturePage.tsx` porte depuis l'ADR-0023
un bouton **`disabled`** titré *« File de relecture — chantier distinct, non livré »*, et
`docs/frontend-papa/page-couverture.md` le range en hors périmètre. Le nom, la place et l'intention
existaient ; il manquait la page.

### Les quatre décisions prises par Papa avant ce document

Elles ne se rouvrent pas :

1. **Une vraie page `/relecture`** — ni modale, ni panneau déplié.
2. ~~Le segment « leçons » atterrit sur `/couverture?filter=no_lesson`.~~ **Revu le même jour, après
   l'avoir vu à l'écran** — voir le §5.
3. Les comptes se **bornent à l'année active**, comme la Couverture.
4. Les liens « à produire » ouvrent la Couverture **filtrée par colonne manquante**.

## Alternatives considérées

**Rendre le détail cliquable sans page dédiée** (segments → pages de pilotage existantes). Le moins
cher. Écarté parce qu'aucune page de pilotage n'accepte un filtre de statut : Papa serait déposé en
haut d'un arbre complet avec charge à lui de retrouver les 5 objets `pending`. On aurait remplacé un
lien faux par cinq liens vagues.

**Une modale à onglets** sur le patron de `MindmapPreviewModal`. Écartée par une décision déjà
écrite : l'addendum ADR-0028 a tranché *« le détail s'affiche dans un panneau déplié, pas dans une
modale »*. Une modale par-dessus un dashboard qu'on vient d'ouvrir cache la mesure au moment
précis où on agit sur elle.

**Un panneau déplié sous la file**, comme le panneau d'analyse par matière. Écarté par la doctrine
du composant lui-même : `DecisionQueue.tsx` porte en en-tête *« sa fonction est le TRI, pas le
travail : une ligne par famille, jamais une ligne par contenu. Détaillée, elle redeviendrait une
liste de tâches et perdrait exactement ce qu'elle apporte. »* Relire 33 objets n'est pas un
drill-down, c'est une séance de travail — elle mérite sa page.

## Décision

### §1 — Un module `review_queue`, ni dans `dashboard` ni dans `production`

`GET /api/parent/review-queue`, `require_parent`, **lecture seule**, params `subject_id` et `kind`.

Il ne peut pas vivre dans `dashboard` : ce router documente *« aucun query param de filtrage,
volontairement »* (ADR-0028 §1), et y greffer des filtres contredirait son contrat — c'est mot pour
mot l'argument par lequel l'addendum ADR-0028 a logé `analysis` dans `progress`.

Il ne peut pas vivre dans `production` : `coverage.py` est verrouillé sur quatre colonnes
**leçon-centrées**. Une capsule n'a pas de leçon, un chapitre n'a pas de leçon parente. Les y faire
entrer élargirait les invariants d'une surface qui tient précisément parce qu'ils sont étroits.

### §2 — Une seule table de vérité pour « en attente », et les deux conventions restent

```python
PENDING = {
    "lesson":  Lesson.status == "draft",            # convention `status`
    "fiche":   Fiche.validation_status == "pending",
    "mindmap": Mindmap.validation_status == "pending",
    "capsule": Capsule.validation_status == "pending",
    "chapter": Chapter.validation_status == "pending",
}
```

`_inbox()` **et** la file en dérivent toutes deux. Aucun compteur n'est réécrit ailleurs.

**On n'aligne pas les deux conventions de colonne**, et ce n'est pas un renoncement au coût de
migration : `school.py:130-134` documente que `lessons.created_by`/`status` *« ne sont pas un
doublon du motif `source`/`validation_status` des chapitres »*. Aligner défairait une décision
écrite. On les **nomme une fois**, au seul endroit qui les regarde ensemble.

**Les quiz n'entrent pas** — `quizzes` n'a pas de `validation_status`, il est servi sans gate par
doctrine (ADR-0014 §2). Les compter demanderait une migration **et** un changement de doctrine.
Un test le verrouille, pour que l'absence se lise comme un choix et non comme un oubli.

### §3 — Le périmètre devient l'année active, et le « 27 » va baisser

Les cinq familles sont bornées à l'année scolaire active, par le filtre de
`production/coverage.py` (`SchoolYearSubject.school_year_id == year_id`). Les trois surfaces —
file « À décider », page de relecture, Couverture — comptent alors la même population, et un test
l'exige des deux côtés.

Le nombre affiché aujourd'hui **diminuera**. C'est le prix de l'honnêteté : les objets qui
disparaissent du compteur sont exactement ceux qu'aucune page ne savait ouvrir.

⚠️ **La matière d'un chapitre se résout par COALESCE de deux chemins.**
`Chapter.school_year_subject_id` est nullable et un chapitre peut vivre sous `Theme → Subject`.
L'ADR-0037 a coûté un document entier à ce piège, et le même trou a été retrouvé une seconde fois
dans `lessons_by_skill` (addendum ADR-0034). Une seule jointure produirait des objets **sans
matière, silencieusement absents** — le pire cas, parce qu'il ne fait pas de bruit.

### §4 — Les compteurs et la liste des matières ne sont JAMAIS filtrés

`counts` et `subjects` portent toujours la population entière ; seul `items` obéit à `kind` et
`subject_id`.

Leçon déjà payée deux fois dans ce dépôt : `coverageFilters.ts::filterCounts` (*« compteurs
calculés sur TOUTES les leçons, jamais sur le filtre courant »*) et le piège documenté de
`CouverturePage.tsx:110`, où la requête filtrée restreint aussi la liste des matières renvoyée. Des
pastilles qui s'effondrent au premier clic obligent à repasser par « Tout » pour changer d'avis.

### §5 — L'adressage reste où il est déjà écrit

Pas de `href` dans `ReviewItemOut` : `lib/pilotageLinks.ts` porte la convention `?subject=&focus=`
et elle est testée. Un `href` serveur en ferait une **seconde** règle d'adressage vers les mêmes
destinations.

Le `href` **est** serveur dans `InboxItem.breakdown`, et ce n'est pas contradictoire : là, c'est le
contrat de la file, homogène avec les quatre autres familles, et l'addendum ADR-0028 §6 est
explicite — *« une règle d'adressage n'a rien à faire dans un composant de présentation »*.

**Les cinq segments mènent à la file**, sans exception :

| segment | destination |
|---|---|
| cours · chapitres · fiches · mindmaps · capsules | `/relecture?kind=<kind>` |

> **Amendement du 2026-08-05, écrit le jour même.** La décision n°2 de Papa envoyait les cours sur
> `/couverture?filter=no_lesson`, et le motif tenait : la Couverture porte la validation **en lot par
> chapitre**, donc le geste qui traite 26 cours sans les ouvrir un à un. Décision **revue après
> l'avoir vue à l'écran** : relire un cours se fait un par un, et une file où quatre familles sur
> cinq atterrissent laissait la cinquième ailleurs sans raison lisible depuis le Dashboard.
>
> ⚠️ **La pilule « 🔒 Non validées » de la Couverture n'est pas retirée**, et ce n'est pas un
> doublon oublié : valider un chapitre entier qu'on vient de relire et trancher un cours à la fois
> sont **deux gestes différents**. Ce qui est révoqué, c'est le routage du segment — pas l'existence
> du geste en lot.
>
> Le vocabulaire suit la même correction : la famille s'appelle `lesson` dans les données et
> **« cours » à l'écran**. Papa relit un cours ; la table stocke une leçon. Le pluriel est **porté**
> et non calculé — « cours » est invariable, un `+ "s"` mécanique écrirait « 26 courss ».

### §6 — La file du Dashboard trie, elle ne travaille pas

Le `breakdown` se rend en puces cliquables **à la place** du texte gris. Une ligne par famille reste
la règle : les segments sont de la **navigation**, jamais des tâches, et aucun bouton d'action
n'entre dans la file. Un test le verrouille — c'est la règle la plus facile à défaire par
inadvertance, parce que l'ajouter paraîtrait toujours serviable.

### §7 — Ce que la page de relecture s'interdit

Elle hérite des interdits de la Couverture (`page-couverture.md §F.2`) parce qu'elle regarde le même
stock : **aucune barre de progression, aucun « X/Y relus », aucun pourcentage, aucun classement par
matière, aucun contrôle de tri, aucun bouton « tout valider »**.

Le motif est le même que côté Massimo : un compteur qui mesure l'avancement d'une file transforme
« relire ce qui compte » en « vider la file », et un « Valider les 27 » est précisément l'agrégat de
provenance que le §F.2 refuse.

**L'ordre est celui du curriculum** (famille → matière → chapitre → leçon), et il n'est pas
réglable. « Le plus vieux d'abord » est un reproche daté ; « le plus incomplet d'abord » est déjà
interdit. Papa relit dans l'ordre où Massimo rencontrera le contenu.

**L'état vide est du texte**, sans illustration ni félicitation — même arbitrage que
`DecisionQueue.tsx:60` : récompenser une file vide installerait côté Papa la mécanique que ZETIS
refuse côté Massimo.

**Pas de pagination**, assumée : la population est bornée par ce que Papa a produit et pas encore
relu, et le payload ne sert que des noms. Seuil de réexamen écrit dans le code — au-delà de ~500
items, ce n'est plus un problème de pagination, c'est le signal que quelque chose produit sans que
Papa l'ait demandé.

### §8 — Relire n'est pas produire

La page ne porte que **Valider**, **Rejeter** et un lien « Voir » vers le pilotage du type. Pas
d'Éditer, pas de Régénérer, pas de Supprimer : ce sont des gestes de production, ils ont déjà leurs
pages.

Conséquence : `ContentLifecycleActions` (`packages/ui`) voit ses trois handlers de production
devenir **optionnels** et gagne `onReject`. Et **deux endpoints manquants sont écrits** —
`POST /fiches/{id}/reject` et `POST /mindmaps/{id}/reject` : aujourd'hui capsules, leçons et
chapitres se rejettent, fiches et mindmaps non, une asymétrie que rien n'expliquerait à l'écran.

Après une action, **la ligne quitte la liste sans rechargement** (patron optimiste de
`DemandesPage.tsx::triageContent`, `reload()` seulement en cas d'échec) : recharger la file ferait
sauter la liste sous le curseur.

### §9 — La Couverture devient adressable, et un chiffre faux est corrigé

`filter`, `subject` et le nouveau `manque` passent de l'état local à l'URL — sans quoi aucun lien
ciblé n'est possible. `parseCoverageFilter` et `parseMissing` sont **pures**, avec repli sur
l'absence : un lien périmé ne doit pas blanchir la page.

`manque=fiche|quiz|mindmap` garde les leçons dont la cellule visée est `absent` — le prédicat exact
de « à produire », déjà servi par `cell_state`.

Et `ContentChainCard` calcule désormais `missing = next.target - next.value`. **Ce correctif est la
condition du reste** : rendre cliquable un nombre faux ouvrirait un nombre de lignes différent de
celui annoncé, soit exactement le défaut que cet ADR existe pour supprimer.

⚠️ **Le bandeau ambre de la Couverture ne change pas de compteur.** `totals.pending_count` compte
les dérivés `pending` de la matrice — c'est la vérité propre de cette page (§F). Il en dira moins
que la file, et c'est correct : on retire l'implication de compte du **libellé du bouton**, on
n'invente pas un troisième compteur.

## Conséquences

- Tout nombre du Dashboard qui annonce du travail ouvre les objets qu'il compte, et un test
  l'exige : `test_la_file_et_l_inbox_comptent_la_MEME_chose` échoue si une famille est ajoutée d'un
  seul côté.
- Le compteur « à valider » **baisse** au premier déploiement (§3). À dire au moment du merge, sinon
  ça se lira comme une régression.
- `packages/ui` est touché : trois props deviennent optionnelles sur un composant partagé par deux
  pages de pilotage. Rétrocompatible, vérifié par leurs tests.
- Une entrée de sidebar de plus, **sans pastille de compteur** : le nombre vit déjà sur le
  Dashboard, et une seconde source pour la même mesure est ce que l'addendum ADR-0028 interdit.
- `/couverture` accepte enfin des liens profonds — utilisable bien au-delà de ce chantier.

## Hors périmètre (ne pas ouvrir ici)

- Les **quiz** dans la file de relecture (migration + changement de doctrine, ADR-0014 §2).
- Les **cartes SRS** : `page-dashboard.md` les annonce dans `validation`, `_inbox()` ne les compte
  pas. L'écart est **documentaire**, il se corrige dans la doc, pas dans le compteur.
- Toute validation en lot depuis `/relecture` (§7).
- Le rattrapage des objets `pending` hors année active, que le §3 rend invisibles.
- Toute pastille de compteur en sidebar.

## Le signal qui dirait qu'on s'est trompé

Papa ouvrant `/relecture` et la refermant sans rien trancher, parce que la page demande une décision
qu'il ne peut pas prendre sans avoir lu le contenu. La réponse serait alors de rapprocher la lecture
de la décision (un aperçu sur place), **jamais** d'ajouter un « tout valider » — qui répondrait à
l'inconfort en supprimant la relecture elle-même.
