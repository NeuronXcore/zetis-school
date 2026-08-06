# ADR-0038 — Les trois preuves de la Lecture ZETIS mènent quelque part, et « Progression » cesse d'être inventée

## Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0028` (l'agrégat unique, la Lecture ZETIS, « un constat sans preuve n'est pas
> émis »), `adr-0028-addendum-analyse-par-matiere` (le panneau, le verrou constat↔preuve),
> `adr-0011` (le substrat canonique), `adr-0017 §5bis` (le verdict découplé).
>
> **Aucune migration.** Aucune route nouvelle côté lacunes ; **une** agrégation nouvelle côté XP.

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
