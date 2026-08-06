# Addendum ADR-0028 — Une bulle qu'on clique dit enfin QUELLES notions, et pas seulement combien

## Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0028` (l'agrégat unique, la dérivation client, les KPI-filtres, le §4 et son
> exception assumée), `adr-0020` (le Conseil de classe, l'évidence calculée), `adr-0017 §5bis`
> (le verdict découplé), `adr-0011` (le contexte canonique).
>
> **Ouvre une SECONDE exception** au §4 — la première depuis l'écriture de l'ADR. **Aucune
> migration** ici : celle de la portée matière du Conseil vit dans
> `adr-0020-addendum-portee-matiere`, écrit avec celui-ci.

## Contexte

Le nuage « Où agir » répond à *« quelle matière mérite un geste »*. Il y répond bien : une bulle
en bas à droite, c'est beaucoup de temps investi pour peu d'ancrage. Papa clique dessus, et là il
ne se passe presque rien.

Ce que le clic fait aujourd'hui, exactement : trois cartes recalculent sur la matière (rythme,
mémoire, charge de révision), trois se contentent d'atténuer les autres matières (répartition,
état des notions, le nuage lui-même), et **quatre surfaces restent globales** (les quatre KPI, la
file « À décider », la chaîne de contenus, la Lecture ZETIS). Il n'existe **aucune vue matière
cohérente** dans le dashboard.

Mais le vrai manque est ailleurs, et il est structurel.

> 🔴 **`SubjectOut` ne sert que des COMPTEURS. Jamais un nom.** `notions{consolidated, fragile,
> in_progress, total}`, `gaps_open`, `minutes`, `review_load` — que des entiers. Papa lit
> « Français : 8 notions à renforcer » et **aucune surface du dépôt ne peut lui dire lesquelles**.

### Le bug qui a rendu ce manque visible

La carte « Lecture ZETIS » annonce *« Français : 8 notions à renforcer »* avec un lien
« preuve · 8 notions » vers `/lacunes`. En le suivant, Papa voit **une** notion, dans une section
« Déjà prises en charge — rien à décider ».

Cause, vérifiée dans le code : le constat compte les notions **fragiles**
(`SkillMastery.status ∈ {weak, learning}`, `dashboard/service.py:441`), tandis que `/lacunes`
liste des lignes **`Gap`** ouvertes (`progress/service.py:29`). **Deux populations disjointes sous
le même mot.** Une notion peut être `weak` sans avoir jamais produit de `Gap` — mauvais score à un
quiz de fin de cours, sans diagnostic — et une `Gap` peut rester ouverte alors que la maîtrise est
repassée à `solid`.

Trois aggravants :

- le champ **homogène** `subject["gaps_open"]` existe **deux lignes plus loin** dans le même objet,
  et n'est pas utilisé ;
- `/lacunes` **ne lit pas** `?subject=` — le paramètre est inerte de bout en bout ;
- `/progression`, cible de l'autre constat, est **entièrement en mock** (`data/mock`).

Et le test censé garder ça, `test_aucun_constat_sans_preuve`, ne vérifie que « `href` non vide et
`count >= 0` ». Il passerait avec un lien vers une route inexistante.

> Le même piège avait déjà été identifié et corrigé une fois, sur une autre paire de surfaces —
> voir la docstring de `_gaps_without_mission` (« deux surfaces qui se contredisaient sur la même
> notion »). Cette fonction-là part bien de `Gap` et délègue à `skills_with_active_mission`, source
> unique partagée avec `/lacunes`. Le constat de la Lecture ZETIS n'a pas reçu le même traitement.

### Les quatre décisions prises par Papa avant ce document

Elles ne se rouvrent pas :

1. **Le détail s'affiche dans un panneau déplié SOUS la carte**, pas dans une modale.
2. **Contenu** : les notions **nommées** à renforcer · ce qui est déjà en cours · temps et
   régularité · couverture du référentiel.
3. **Le bouton lance un conseil de classe CIBLÉ** sur la matière — portée ajoutée côté backend
   (`adr-0020-addendum-portee-matiere`).
4. **Le lien « preuve » de la Lecture ZETIS pointe vers ce panneau**, le comptage des notions
   fragiles restant juste.

## Décision

### §1 — Le panneau est la SECONDE exception au §4, et elle se justifie comme la première

L'ADR-0028 §4 pose « zéro état de chargement après le premier rendu », avec **une** exception
assumée : le drill-down d'un jour de la heatmap, paresseux sur
`/api/parent/activity/days/{date}`. Le motif y était : *un journal d'événements est non borné, le
précharger pour 26 semaines × 8 matières annulerait le bénéfice de l'agrégat unique.*

Le panneau ouvre la seconde exception, pour **exactement le même motif** : la liste nommée des
notions d'une matière est non bornée, et la précharger pour huit matières mettrait dans le premier
rendu un volume que personne ne regardera.

Le panneau adopte donc le patron du drill-down, à la ligne près : état propriétaire de la carte,
rendu **sous** le contenu, séparateur `mt-4 border-t`, fetch dans un `useEffect` avec garde
d'annulation, trois états `loading` / `error` / `data`. **Pas de `role="dialog"`, pas d'Escape** —
ce n'est pas une modale, c'est un dépliage dans le flux.

> Une modale a été envisagée et écartée. Le dépôt n'a **aucune coquille de modale générique** :
> une dizaine de copies à la main, chacune avec son `useEffect` Escape, **aucune avec focus trap
> ni restauration de focus**. En écrire une onzième pour un panneau de lecture serait payer une
> dette d'accessibilité pour masquer le cockpit qu'on venait de filtrer.

### §2 — Le principe qui borne le contenu : **le réseau ne sert que des NOMS**

C'est la règle qui décide, champ par champ, de ce qui a le droit d'être dans la réponse.

| Bloc du panneau | Source | Pourquoi |
|---|---|---|
| Notions **nommées** à renforcer | **réseau** | l'agrégat ne peut pas les porter |
| Missions actives, contenus en attente | **réseau** | idem — ce sont des titres, pas des compteurs |
| Temps et régularité | **mémoire** (`SubjectOut.minutes`, `calendar`, `slots`) | déjà servi |
| Couverture du référentiel | **mémoire** (`notions`, `has_referentiel`) + réseau pour le détail | déjà servi |

> 🔴 **Refaire venir du réseau un chiffre que l'agrégat porte déjà fabriquerait une seconde source
> pour une mesure affichée dans la bulle juste au-dessus.** C'est littéralement le bug qu'on
> corrige, reproduit à quelques pixels d'écart. La règle n'est pas une optimisation : c'est la
> prévention.

**Corollaire, et il est testable** : la réponse ne dépend d'**aucune période**. Donc **changer de
période avec le panneau ouvert ne déclenche rien**. Un `period` dans la signature de l'appel serait
la preuve que la règle a été enfreinte.

### §3 — L'état du panneau vit dans l'URL, et ce n'est pas un choix de confort

`?panel=ou-agir`, en complément du `?subject=` déjà porté.

La raison est mécanique, pas esthétique. La carte « Lecture ZETIS » est **sur la même page** que
« Où agir ». Cliquer son lien de preuve est une navigation **vers la route courante** : React
Router **ne remonte pas** `DashboardPage`. Un `useState` local ne serait donc jamais réinitialisé —
et un `useState` avec initialiseur paresseux non plus, React ne rappelant l'initialiseur qu'au
premier rendu. **Le lien de preuve ne pourrait pas fonctionner.**

Trois règles qui vont avec :

1. **`panel` porte la clé de carte** (`ou-agir`), celle de `CARD_SCOPES` et de l'attribut
   `data-card`. Vocabulaire existant, extensible si une autre carte gagne un panneau, sans nouveau
   paramètre.
2. **`panel` sans `subject` connu → panneau fermé.** Un lien périmé ne doit pas ouvrir un vide —
   même repli que `visibleSubjects` sur un slug inconnu.
3. 🔴 **Filtrer REFERME le panneau.** Les pastilles, le donut et les barres empilées écrivent
   `panel: null` en même temps que `subject`. Sans cela, un `panel=ou-agir` resté dans l'URL ferait
   qu'un clic de pastille **rouvre** le panneau — donc qu'un **geste de filtrage part au réseau**.
   L'invariant du §1 de l'ADR cesserait alors d'être une propriété du code pour devenir une
   coïncidence d'ordre des clics.

> ⚠️ Écrire deux clés d'URL en un geste exige de corriger `patchParams`, qui construit son
> `URLSearchParams` depuis une **fermeture** sur `searchParams` : deux appels dans le même tick
> partent du même instantané et le second écrase le premier. Forme fonctionnelle
> (`setSearchParams(prev => …)`) obligatoire. Le `{ replace: true }` est conservé — **ouvrir un
> panneau n'est pas naviguer** non plus, le retour arrière doit quitter le dashboard et non replier
> le panneau puis désélectionner puis…

### §4 — La carte ne change pas de largeur

Envisagé puis **rejeté** : élargir « Où agir » de 5 à 12 colonnes quand une matière est
sélectionnée.

> 🔴 Le SVG est en `w-full` sur un `viewBox` fixe : il s'étire avec son conteneur. Doubler la
> largeur de la carte **déplace horizontalement chaque bulle** — y compris celle que Papa vient de
> cliquer, **sous son curseur**, dans le même frame. Un geste de lecture ne recompose pas la page.

Le contenu s'adapte donc à ~560 px : liste pleine largeur pour les notions nommées, grille à deux
colonnes pour les blocs chiffrés. **Coût assumé** : la rangée se déséquilibre, la carte devenant
plus haute que ses voisines. C'est un vide à droite, pas un décalage — `items-start` l'autorise
déjà, et c'est exactement ce que fait la carte du rythme quand son drill-down s'ouvre.

### §5 — La route vit dans `progress`, et s'appelle `analysis`

**`GET /api/parent/progress/subjects/{subject_id}/analysis`**

- **`progress` et non `dashboard`** : le docstring de `progress/router.py` revendique déjà le rôle
  — *« ces deux lectures servent le DÉTAIL des KPI correspondants du dashboard »*. `/gaps` et
  `/consolidated` en sont les frères. À l'inverse, `dashboard/router.py` documente « aucun query
  param de filtrage, **volontairement** » : y greffer une route filtrée par matière contredirait le
  contrat de son propre module.
- **`analysis` et non `focus`** : `DashboardFocus` désigne le focus KPI. Réutiliser le mot mettrait
  deux sens dans le même écran.
- **`subject_id` (entier) et non le slug** : c'est l'identité que consomme déjà l'ancrage
  `allowed_subject_ids` du Conseil, et le client tient `SubjectOut.id` en mémoire. Un second
  identifiant serait un second endroit où diverger.

**Aucun recalcul.** Tout ce que la route sert existe déjà et doit être **appelé**, jamais réécrit :
`progress.service.open_gaps` (qui est la source de `/lacunes`, donc les deux surfaces ne *peuvent
pas* se contredire), `skills_with_active_mission`, l'évidence du Conseil
(`mastery_by_skill`, `weighted_quiz_signal`, `srs_pressure`), `projections.notions_breakdown` et
ses ensembles de statuts, `production.coverage`, `missions.pilot`.

Deux propriétés à tenir, et à verrouiller :

- 🔴 **la route n'écrit rien** — contrairement au Conseil, qui fige toujours un rapport ;
- 🔴 **la route n'appelle aucun LLM** — c'est ce qui la rend instantanée et gratuite. **L'analyse
  est l'ÉVIDENCE ; le Conseil est la NARRATION.** Cette frontière est le cœur de l'addendum.

**`to_reinforce` = notions fragiles ∪ lacunes ouvertes**, jamais l'intersection, **sans plafond**.
Chaque entrée porte `is_fragile` **et** `has_open_gap` séparément : les deux mesures ne fusionnent
jamais sous un total unique. Le plafond de 8 notions par matière du Conseil borne un **prompt**,
pas un panneau — les deux nombres diffèrent donc légitimement, et l'écart doit être **affiché**.

### §6 — Le lien de preuve pointe vers le panneau

`"/lacunes?subject={slug}"` devient `"/?subject={slug}&panel=ou-agir"`.

Le comptage **reste** celui des notions fragiles : il est juste, et c'est la mesure la plus fournie
aujourd'hui (8 en français contre 1 seule lacune ouverte). Ce qui change, c'est la **cible** — le
seul endroit qui montrera vraiment ces 8 notions, nommées.

⚠️ Le `href` est un **contrat serveur** (`Evidence.href`). Il se corrige dans
`dashboard/service.py`, jamais réécrit côté client : une règle d'adressage n'a rien à faire dans un
composant de présentation.

### §7 — Le verrou qui manquait

> 🔴 **Un constat ne peut plus annoncer un nombre que sa preuve ne sert pas.**

Test-verrou : pour chaque item de `reading`, résoudre la matière depuis son `href`, appeler la
route d'analyse, et exiger que le compte annoncé **égale** le nombre d'éléments réellement servis.
Il **échoue sur le code d'aujourd'hui** — c'est ce qui prouve le bug.

C'est la seule ligne de cet addendum qui protège quelque chose de façon permanente. Les autres
décrivent une surface ; celle-ci empêche une classe entière de mensonges de revenir.

## Ce que cet addendum ne fait pas

- **Il ne répare pas `/lacunes`**, qui continue d'ignorer `?subject=`. Chantier à part.
- **Il ne débranche pas `/progression` du mock.** Le second constat de la Lecture ZETIS
  (« 1 notion consolidée » → `/progression?subject=`) souffre du même défaut et n'est pas traité
  ici — signalé, non corrigé.
- **Il ne résout pas la divergence `Gap.subject_id` vs `Skill.subject_id`.** Le dashboard et
  `/lacunes` attribuent une lacune par la colonne du `Gap` ; le Conseil groupe par la matière de la
  **notion**. L'écriture ne garantit pas leur égalité (`diagnostics/service.py` écrit
  `subject_id=quiz.subject_id`). Le panneau suit la convention du dashboard, et un test **borne**
  l'écart sans le corriger.
- **Il ne change pas ce que Y mesure** dans le nuage. Séparer des matières à *exactement* 0 %
  consolidé demanderait de passer aux notions *engagées* — écarté par Papa le 2026-08-05, ce serait
  un autre sens de carte.
- **Il ne donne pas d'état de chargement au filtrage.** Le §4 tient : seul le dépliage du panneau
  attend.

## Le signal qui dirait qu'on s'est trompé

- **Papa ouvre le panneau et le referme sans rien décider.** Le panneau serait alors une surface de
  consultation de plus, pas un point de décision — il faudrait ramener les actions dans le panneau
  plutôt que d'y ajouter des chiffres.
- **Le panneau devient le premier endroit où l'on regarde**, avant les KPI. Cela voudrait dire que
  le dashboard répond mal à la question « où en est Massimo » et que le nuage n'est plus un
  repérage mais un sommaire.
- **Une troisième exception au §4 est demandée.** Deux exceptions bornées sont une règle avec ses
  cas ; trois sont une règle qui n'en est plus une. Le jour où la question se pose, c'est le §4
  qu'il faut rouvrir — pas l'exception qu'il faut accorder.
- **Le compte du constat et celui du panneau divergent à nouveau.** Le verrou du §7 aura été
  contourné plutôt que respecté, et la leçon aura été perdue une deuxième fois.
