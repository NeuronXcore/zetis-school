---
id: "0038"
titre: "Les trois preuves de la Lecture ZETIS mènent quelque part, et « Progression » cesse d'être inventée"
type: architecture
statut: accepte
date: 2026-08-05
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0020", "0021", "0028"]
---
# ADR-0038 — Les trois preuves de la Lecture ZETIS mènent quelque part, et « Progression » cesse d'être inventée

## Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0028` (l'agrégat unique, la Lecture ZETIS, « un constat sans preuve n'est pas
> émis »), `adr-0028-dashboard-papa-agregat-unique` (Amendement 1) (le panneau, le verrou constat↔preuve),
> `adr-0011` (le substrat canonique), `adr-0017 §5bis` (le verdict découplé).
>
> **Aucune migration.** Aucune route nouvelle côté lacunes ; **une** agrégation nouvelle côté XP.

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-05 | Progression nomme ce qu'elle compte, et on peut agir depuis là | Accepté | oui |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

Le 2026-08-05, une preuve qui mentait a été corrigée : *« Français : 8 notions à renforcer »*
menait à une page qui en montrait **une**. Le constat comptait les notions fragiles, sa cible
listait des lignes `Gap` — deux populations disjointes sous le même mot.

Ce correctif n'a traité **qu'une** des trois branches de `_reading`. Les deux autres portent le
même défaut, et personne ne les a regardées :

| Branche | Ce qu'elle compte | Où elle mène | État |
|---|---|---|---|
| `watch` | notions fragiles | panneau d'analyse | ✅ corrigé |
| `up` | notions consolidées | `/progression?subject=` | 🔴 **page entièrement en MOCK** |
| `flat` | traces d'activité | `/cahier?subject=` | ⚠️ la page lit bien le param |

> 🔴 **`/progression` n'est pas une page imparfaite : c'est une page inventée.** 51 lignes qui
> rendent `SUBJECTS_PROGRESS` importé de `data/mock`. Un pourcentage, un XP et un compte de lacunes
> qui ne viennent d'aucune mesure. Elle est pourtant référencée dans le routeur, dans la sidebar,
> et elle est la cible d'un constat qui se dit adossé à une trace comptée.

### Ce que le read-before-code a trouvé, et qui réduit le chantier

1. **La route existe déjà.** `GET /api/parent/progress/consolidated` sert des notions consolidées
   nommées, avec matière et score. Son client `fetchConsolidatedSkills` existe aussi, dans
   `lib/activity.ts` — et **n'est appelé nulle part**. Le contrat, le service et le client sont
   écrits ; seule la page manque.
2. **Le XP par matière est mesurable sans rien migrer.** `XPEvent.subject_id` existe, et sur la base
   réelle **80 événements sur 80 le portent** (Maths 577 XP, Français 367, Anglais 100, SVT 60,
   Histoire-Géo 5). Il manque une agrégation, pas une donnée.
3. **`/lacunes` a déjà tout ce qu'il faut** : `GET /progress/gaps` rend toutes les lacunes avec leur
   `subject_slug`. Le paramètre `?subject=` est inerte parce que **personne ne le lit**, pas parce
   que la donnée manque.

### Le point dur, et il commande la décision

**Il y a UNE notion consolidée sur 280.**

Une page « Progression » dont la barre mesurerait `mastered / total` afficherait donc des barres à
zéro pour sept matières sur huit, pendant des mois. C'est exactement le piège qu'on vient de payer
sur l'axe Y du nuage « Où agir » : une mesure rigoureuse mais sans pouvoir discriminant produit un
écran vrai et inutile, que personne ne regarde deux fois.

## Décision

### §1 — La barre mesure l'AVANCEMENT DU PROGRAMME, pas l'acquisition

**`notions engagées / notions au programme`**, où « engagée » = consolidée **∪** fragile **∪** en
cours — soit toute notion qui porte une ligne de maîtrise.

C'est la seule mesure disponible aujourd'hui qui **sépare les matières** : de 0 à 10,4 % sur les
données réelles, là où les consolidées seules donnent 0 partout sauf un.

Elle répond aussi à la bonne question. « Progression » demande *« où en est-on dans l'année ? »* —
pas *« qu'est-ce qui est acquis ? »*, à quoi le dashboard répond déjà par son KPI « notions
consolidées ».

> ⚠️ **Le vocabulaire ne bouge pas.** « Consolidée » garde sa définition serveur (`mastered`,
> ADR-0028 §3 bis : *« consolidé doit vouloir dire acquis, pas presque »*). Cette décision
> n'élargit pas « consolidée » — elle mesure **autre chose**, et le nomme autrement.

### §2 — Les consolidées restent, à part, jamais fondues dans la barre

La page sert **deux nombres distincts par matière** : engagées et consolidées. Elles ne
s'additionnent pas, elles ne se remplacent pas, et aucune n'est présentée comme un raffinement de
l'autre.

> C'est la leçon du chantier précédent, transposée : « fragile » et « lacune ouverte » ont coûté un
> bug parce qu'un seul mot recouvrait deux mesures. Ici, « avancé » et « acquis » sont deux
> questions différentes, et l'écran doit le montrer avant qu'on le lui demande.

### §3 — Le XP revient chez lui, par matière

L'ADR-0028 §5 a retiré l'XP des KPI de pilotage *« pour ne rester que sur Progression »*. Cette
page est donc sa **seule maison côté Papa** — et elle l'affiche en mock depuis.

Nouvelle agrégation dans le module `gamification` (qui possède déjà `XPEvent` et `award_xp`) :
total par matière, sur toute l'histoire. **Aucune fenêtre temporelle**, comme le reste de la page :
un cumul d'XP est un stock, pas un flux.

### §4 — `/lacunes` lit `?subject=` et filtre CÔTÉ CLIENT

La route rend déjà toutes les lacunes avec leur matière. La page lit le paramètre et filtre **en
mémoire** — aucune requête, aucun changement backend.

Trois conséquences à tenir :

1. les trois sections (« découvertes », « revenues par la révision », « déjà prises en charge »)
   continuent de se calculer **sur le jeu filtré**, sinon les compteurs contrediraient la liste ;
2. un slug **inconnu** ne vide pas la page : repli sur « toutes », comme `visibleSubjects` ;
3. le filtre est **visible et retirable** — un filtre actif qu'on ne voit pas est un compteur qui
   ment.

> Un filtrage serveur a été écarté : le dépôt vient d'écrire noir sur blanc que filtrer ne doit
> rien coûter, et le volume de lacunes est celui d'un seul enfant.

### §5 — Le verrou de cohérence s'étend aux TROIS branches

Le verrou écrit au chantier précédent ne couvre que les constats `watch`. Il devient **général** :
pour **chaque** item de `reading`, résoudre la cible depuis son `href` et exiger que le compte
annoncé égale ce que la cible sert.

> 🔴 C'est la seule ligne de cet ADR qui protège quelque chose de façon permanente. Les autres
> décrivent deux pages ; celle-ci empêche la classe entière du défaut de revenir sur une branche
> qu'on n'a pas encore écrite.

### §6 — Ce que « Progression » ne devient pas

- **Pas un bulletin.** Aucune note globale, aucun classement de matières par « niveau ». L'ADR-0028
  §9 le dit déjà : les pourcentages **par matière** sont un instrument d'analyse ; la note unique
  est bannie.
- **Pas une seconde surface de décision.** Elle mesure ; agir se fait depuis « Où agir », les
  missions ou le Conseil. Un bouton d'action ici dupliquerait un chemin existant.
- **Pas un historique.** Aucune série temporelle : la reconstruction du passé de la maîtrise est
  déjà faite, et bornée, dans la carte « Évolution de la mémoire » du dashboard.

## Ce que cet ADR ne fait pas

- ~~**Il ne touche pas à `/cahier`** — la troisième branche mène à une page qui lit son paramètre.
  Le verrou du §5 la couvrira ; s'il rougit, ce sera un chantier à part.~~
  **✅ Le chantier a eu lieu le 2026-08-05**, et il s'est déroulé exactement comme annoncé — voir
  l'amendement ci-dessous.
- **Il ne résout pas la divergence `Gap.subject_id` / `Skill.subject_id`**, toujours bornée par un
  test.
- **Il ne change pas la définition de « consolidée »**, ni celle de « lacune ouverte ».
- **Il n'ajoute aucune fenêtre temporelle** à la Progression.

## Le signal qui dirait qu'on s'est trompé

- **Papa lit la barre comme un taux d'acquisition.** Si « 10 % » se comprend « il ne sait que
  10 % », le mot choisi est mauvais — il faudra renommer la colonne, pas changer la mesure.
- **La barre reste plate alors que Massimo travaille.** Cela voudrait dire que « engagée » est trop
  grossier : une notion touchée une fois compte autant qu'une notion travaillée dix fois. Le
  remède serait de pondérer, pas d'élargir davantage.
- **Personne n'ouvre `/progression`.** Si le dashboard répond déjà à la question, cette page est un
  doublon et il faut la retirer plutôt que l'enrichir.
- **Le verrou du §5 est contourné plutôt que respecté** — un constat ajouté avec un `href` que
  personne ne sait résoudre. La leçon aura été perdue une troisième fois.

---

## Amendement du 2026-08-05 — la fenêtre de la branche `flat`, et ce que le `xfail` a prouvé

Le §5 posait la règle : *un constat ne peut pas annoncer un nombre que sa preuve ne sert pas*. Il
laissait une exception connue, écrite plus haut : `/cahier` n'était pas touché, et *« s'il rougit,
ce sera un chantier à part »*. Il a rougi. Le chantier a eu lieu.

### La divergence, et pourquoi elle n'était pas une faute de calcul

Le constat `flat` comptait les traces sur **tout l'historique chargé** (`p.HISTORY_DAYS`, 730 j —
le double de la plus longue fenêtre, pour que les deltas des KPI soient vrais). Sa cible `/cahier`
est bornée **serveur** à `ACTIVITY_MAX_RANGE_DAYS` (366 j), parce que *le client y choisit une
fenêtre, jamais l'ampleur du scan* (`activity/router.py`).

Les deux bornes sont **justes chez elles**. C'est leur rencontre qui mentait : une trace de plus de
366 jours était **comptée par le constat et invisible sur sa propre preuve**.

### Décision — la fenêtre d'un constat est celle de sa PREUVE

Le comptage de `flat` se borne à `settings.activity_max_range_days`. On ne fait **pas** l'inverse
— élargir `/cahier` — parce que sa borne protège l'ampleur du scan, et qu'un constat n'a aucune
raison de faire décider d'une limite serveur.

⚠️ **La borne est LUE, jamais recopiée** : `_reading` lit `settings.activity_max_range_days`, la
même source que le routeur qui borne. Un `366` en dur dans le dashboard aurait recréé la divergence
au premier changement de réglage, et personne ne l'aurait vu.

**Conséquence assumée** : le constat se déclenche un peu plus souvent, puisqu'il compte moins. C'est
le comportement juste — s'il n'y a pas trois traces **dans l'année**, il n'y a effectivement pas de
quoi conclure. Et le libellé ne promet toujours **aucune fenêtre** : il en faudrait deux (celle du
sélecteur, celle du Cahier) pour un constat dont l'intérêt est de dire qu'il n'y a rien à conclure.

### Ce que le marqueur de dette a prouvé

La divergence avait été inscrite en `@pytest.mark.xfail(strict=True)` plutôt que rapportée en prose.
Le jour de la correction, le test est passé **XPASS(strict)** — donc **rouge** — et a forcé le
retrait du marqueur dans le même commit.

> **Le patron vaut d'être réutilisé** : une dette qu'on décrit en prose se perd à la session
> suivante ; une dette écrite en `xfail` strict *se rappelle toute seule au moment exact où elle est
> payée*. C'est la première fois dans ce dépôt qu'un marqueur de dette se referme de lui-même.

Le test garde **exactement le même corps** : ce qui était la preuve du défaut est devenu le verrou
de sa correction. Une assertion a été ajoutée (`annonce == 1`) pour que le décor ne puisse pas
devenir vacuellement vert si la trace hors fenêtre disparaissait du décor.

**Aucune migration.** Un paramètre de fonction (`today`), un prédicat, un marqueur retiré.

---

## Amendement 1 — Progression nomme ce qu'elle compte, et on peut agir depuis là — 2026-08-05

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0038` (la page qu'il vient de rendre réelle), `adr-0028-dashboard-papa-agregat-unique` (Amendement 1)
> (le panneau qui NOMME les notions, et le verrou constat↔preuve), `adr-0021` (l'équipement
> auto-validé d'une notion), `adr-0018` (le Commander mono-notion), `adr-0030` (un écran, un appel
> réseau).
>
> ⚠️ **RÉVOQUE une décision de l'ADR-0038 §6**, écrite le matin même — le deuxième point, et lui
> seul. Les trois autres non-objectifs du §6 restent intacts et opposables.
>
> **Aucune migration. Aucune route d'écriture nouvelle.**

### Contexte — le défaut du chantier, reproduit un cran plus bas

L'ADR-0038 a fermé le motif *« un constat annonce N, sa preuve en montre un autre »* sur les trois
branches de la Lecture ZETIS. La page `/progression` qu'il a produite est juste : ses quatre
nombres viennent tous d'une mesure.

**Mais ces nombres ne mènent nulle part.** Papa lit *« Français · 10 / 96 · 1 acquise · 367 XP ·
8 à renforcer »* et ne peut savoir **lesquelles** sans quitter la page, ni agir sans en ouvrir une
troisième. C'est la même famille de défaut : un compte affiché dont la preuve n'est pas à portée.
Le chantier du matin l'a corrigé **entre les écrans** ; il reste entier **à l'intérieur** de
celui-ci.

### Ce qui a changé depuis le §6, et qui justifie de le rouvrir

Le §6 disait :

> **Pas une seconde surface de décision.** Elle mesure ; agir se fait depuis « Où agir », les
> missions ou le Conseil. **Un bouton d'action ici dupliquerait un chemin existant.**

Le motif est la **duplication**, pas l'action. Or le read-before-code du 2026-08-05 établit que
**toutes les actions concernées existent déjà comme routes réutilisables telles quelles** :

| Action | Route | Remarque |
|---|---|---|
| mission sur UNE notion | `POST /api/reports/class-council/create-missions` | accepte des `skill_ids` arbitraires, **sans rapport de conseil** |
| équiper une notion | `POST /.../class-council/equip-notion` | auto-validé (ADR-0021) |
| Conseil sur la matière | `POST /api/reports/class-council` | portée matière, ADR-0020 addendum |

Appeler ces routes depuis Progression **ne duplique aucun chemin** : c'est le même chemin, atteint
d'un autre endroit. La prémisse du §6 ne tient donc plus. Elle tenait tant qu'on supposait qu'agir
depuis Progression exigerait d'y écrire une logique de décision — ce n'est pas le cas.

> ⚠️ Ce qui reste vrai du §6 : Progression **ne décide de rien elle-même**. Elle ne compose aucune
> mission, ne choisit aucune notion, n'applique aucun seuil. Elle **déclenche** ce que d'autres
> modules décident, sur la notion que Papa désigne.

### Décision

#### §1 — Chaque ligne se déplie sur le détail NOMMÉ de ses quatre nombres

Un dépliage dans le flux, sous la ligne — **pas une modale**, comme le panneau d'analyse et le
drill-down d'un jour, les deux seuls précédents du dépôt.

**Un seul dépliage ouvert à la fois.** Deux matières dépliées feraient défiler la table hors de
l'écran, et le dépliage existe pour rapprocher le détail de son nombre, pas pour l'en éloigner.

#### §2 — Le détail RECOMPOSE le nombre de la ligne, sinon il ment

C'est le verrou du chantier, transposé d'un écran à l'autre à l'intérieur du même :

| Colonne | Ce que le dépliage montre | Invariant |
|---|---|---|
| Avancement `10 / 96` | les 10 notions engagées, nommées, avec leur statut ; les non abordées | `len(engagées) == engaged` et `engagées + non abordées == total` |
| Acquis `1` | les notions `mastered` nommées, avec leur score | `len(acquises) == notions.consolidated` |
| XP `367` | la répartition **par motif** | `Σ montants == xp` |
| À renforcer `8` | les notions fragiles nommées | `len(liste) == notions.fragile` |

#### §3 — Le XP se détaille par MOTIF, jamais par notion

`XPEvent` porte `student_id, subject_id, amount, reason, created_at` — **pas de `skill_id`**. La
question *« quelles notions ont rapporté ces 367 XP ? »* n'a pas de réponse en base, et n'en aura
pas sans migration.

Le dépliage répond donc à la question voisine et honnête : *« par quels gestes ? »* — missions,
quiz, verbalisations, diagnostics.

> 🔴 Écrit ici pour que personne ne le redécouvre en croyant à un oubli d'implémentation. Ajouter
> `skill_id` à `XPEvent` est un chantier à part, avec migration, et il faudrait d'abord établir que
> quelqu'un se pose la question — le XP est un **stock de motivation**, pas un instrument
> d'analyse par notion.

#### §4 — Les actions vivent SUR le nom, jamais sur le nombre

Une action porte toujours sur une notion **désignée**, ou sur la matière entière. Jamais sur « les
8 » d'un coup : un geste en masse depuis une page de mesure est exactement la surface de décision
que le §6 refusait, et le refus reste juste sur ce point.

Toute écriture passe par une **confirmation explicite**, et son résultat s'affiche **sur place** —
patron déjà tenu par `SubjectAnalysisPanel`.

#### §5 — Ce qui reste interdit sur Progression

Les trois autres non-objectifs du §6 sont **inchangés** :

- **pas un bulletin** — aucune note globale, aucun classement de matières (ADR-0028 §9) ;
- **pas un historique** — aucune série temporelle, la reconstruction du passé vit dans « Évolution
  de la mémoire » ;
- **aucune fenêtre temporelle** — tout reste un stock, lu « à aujourd'hui ».

Et s'y ajoute : **le dépliage ne crée aucune route**. Le jour où une action demandée ici n'existe
pas ailleurs, elle se conçoit ailleurs — pas ici.

#### §6 — Le réseau : rien de ce qui est déjà en mémoire n'est redemandé

Règle héritée du panneau d'analyse, et elle décide de chaque chiffre affiché : **le réseau ne sert
que ce que la table ne porte pas, des NOMS.** Les quatre nombres viennent de `/progress/overview`,
déjà chargé ; les relire au dépliage fabriquerait une seconde source pour une mesure affichée à
quelques pixels — le bug que ce chantier vient de solder, reproduit à l'intérieur d'une ligne.

Le dépliage réutilise `GET /progress/subjects/{id}/analysis`, qui est **déjà** la route des noms
d'une matière et déjà chargée paresseusement. Elle est **étendue**, pas doublée.

`GET /progress/consolidated` — écrite il y a des semaines et **appelée par personne** — devient
enfin la source de la colonne « Acquis », chargée **une fois pour toute la page** au premier
dépliage. La table garde sa requête unique au montage.

### Ce que cet addendum ne fait pas

- Il n'ajoute **aucune route d'écriture** et ne modifie aucun générateur.
- Il ne touche pas à `XPEvent` ni à aucun schéma de base.
- Il ne change **aucune** des quatre mesures de la page : le dépliage les explique, il ne les
  recalcule pas.
- Il ne touche pas au `SubjectAnalysisPanel` du dashboard, qui ignore les champs nouveaux.

### Le signal qui dirait qu'on s'est trompé

- **Papa agit depuis Progression sans jamais ouvrir « Où agir ».** Ce serait le signe que les deux
  surfaces se concurrencent au lieu de se compléter — la réponse serait de retirer les actions
  d'ici, pas de les enrichir.
- **Un détail affiche un nombre différent de sa ligne.** Le défaut de tout le chantier, revenu
  d'un cran plus bas ; c'est ce que les invariants du §2 doivent rendre impossible.
- **Le dépliage devient la vraie page et la table un menu.** Il faudrait alors assumer une page par
  matière, pas empiler dans un tiroir.
- **Quelqu'un demande le XP par notion.** Alors le §3 aura eu tort de trancher sans migration — et
  ce sera un chantier, pas un correctif.
