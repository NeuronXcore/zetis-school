# Addendum ADR-0028 — La carte mémoire ne pouvait montrer aucun événement

## Statut

Proposé — 2026-08-05.

> S'appuie sur : `adr-0028` **§3 ter** (`skill_mastery_history`, la table qui rend la bascule
> datable), **§5** (les KPI sont des filtres de focus, `CARD_SCOPES`), **§6** (la carte
> « Évolution de la mémoire » et ses trois courbes) ;
> `adr-0028-addendum-kpi-a-renforcer` **§5 ter** (le vrai solde, écarté pour le delta du KPI) et
> **§5 octies** (`history_since`, l'avertissement qui s'auto-périme).
>
> **Ne rouvre pas** : la définition des quatre paliers de maîtrise (§3 bis) ; `reconstruct_series`
> et sa règle de projection à rebours, qui continue de servir les quatre stocks ; le contrat de
> l'agrégat unique (§1, §2) — **aucune requête HTTP nouvelle**, tout passe par le payload existant.
>
> **Ne révoque rien, et borne une chose.** Le §5 ter de l'addendum « À renforcer » écartait le vrai
> solde ; le présent addendum **confirme ce refus là où il portait** — le delta du KPI — et
> l'autorise **ailleurs**, dans une vue nommée qui déclare ne pas se compter comme lui. Voir §6
> quinquies.
>
> **Aucune migration, aucune route nouvelle.** `SpacedReviewAttempt` et `SkillMasteryHistory`
> existent ; il s'agit de les lire.

## Contexte

La carte portait trois courbes. Mesuré **à l'écran, sur la base de dev**, le 2026-08-05 :

| | |
|---|---|
| maximum de l'axe des ordonnées | **222** (fixé par `covered`) |
| « à renforcer » | 13 → **5,8 %** de la hauteur |
| « consolidées » | 1 → **0,45 %** de la hauteur |

> 🔴 **Les deux courbes que la carte existe pour montrer étaient tracées dans les 6 % du bas d'un
> cadre de 190 px** — une dizaine de pixels — pendant que la courbe de contexte en occupait 94 %.

Le second défaut est structurel, et il ne se voit pas :

> 🔴 **Aucune des trois courbes ne peut redescendre.** `reconstruct_series` calcule *« l'ensemble
> d'aujourd'hui, moins ce qui y est entré après »* : c'est croissant **par construction**. Une
> notion consolidée en juin puis perdue en juillet n'est pas dans `consolidated_now`, donc elle
> n'apparaît **nulle part** sur la courbe verte — elle est absente de **tout son passé**, comme si
> elle n'avait jamais été apprise.

Trois courbes qui ne peuvent ni baisser, ni se croiser, ni s'interrompre ne montrent **jamais
d'événement**. L'œil n'a aucun moment où se poser. C'est le sens de la demande qui a ouvert ce
chantier : *« propose-moi d'autres courbes qui sont plus expressives »*.

### Ce que l'interversion a rendu visible

Le même chantier a interverti « État des notions » (à gauche) et « Évolution de la mémoire » (à
droite), pour que la **cause** — cliquer une matière dans les barres empilées filtre
`visibleSubjects` — se lise avant son **effet** — les courbes voisines se redessinent.

Une fois côte à côte, la redondance saute aux yeux : la carte de droite montrait **la même
décomposition que sa voisine de gauche**, simplement étalée dans le temps.

## Décision

### §6 bis — Quatre vues, et non un tracé de plus

La carte porte un sélecteur de vue dans son en-tête, patron déjà en service sur
`WorkRhythmCard` (`DashboardCard` a une prop `action` documentée « sélecteur de vue »).

| vue | nature | ce qu'elle répond |
|---|---|---|
| **Paliers** | 4 stocks empilés | où en est le programme |
| **Révisions** | flux SRS daté + charge à venir | ce qui a été revu, et comment |
| **Rétention** | ratio 0–100 % | ce qui tient, sur ce qui a été travaillé |
| **Solde** | flux de bascules daté | ce qui est entré et sorti du palier consolidé |

**Elles ne partagent ni la même unité, ni la même nature de mesure.** Les superposer sur un axe
unique fabriquerait exactement la contradiction que les `adr-0038` et `adr-0039` passent leur temps
à refermer.

### §6 ter — « Paliers » est la vue par défaut, et ce n'est pas un choix esthétique

`CARD_SCOPES` fait allumer cette carte par les KPI **« Notions consolidées »** et **« À
renforcer »** (§5). Un clic sur ces KPI doit tomber sur la vue qui **justifie leur chiffre**.

Ouvrir par défaut sur « Révisions » — la vue la mieux fournie en données, et de loin — casserait ce
contrat **en silence** : le KPI resterait allumé, la carte resterait éclairée, et le diagramme
affiché ne dirait plus rien du nombre cliqué.

**L'aire empilée corrige le défaut d'échelle par construction** : les bandes se lisent à
l'**épaisseur**, jamais en proportion du maximum d'une courbe voisine. Une courbe de contexte ne
peut plus confisquer le cadre.

⚠️ **La bande grise domine, et c'est vrai.** Sur 301 notions au programme, 19 ont été travaillées.
Ce n'est pas un défaut du diagramme : c'est l'état de l'année, que l'ancien tracé cachait. La note
de la carte le nomme (*« ce sont les notions jamais abordées »*) au lieu de le laisser lire comme
un retard.

### §6 quater — La rétention est le seul tracé qui puisse REDESCENDRE

`consolidées ÷ (consolidées + à renforcer + en cours)`, en pourcentage.

- **L'axe est 0–100 % quoi qu'il arrive** : le défaut d'échelle ne peut pas revenir.
- **Le dénominateur est « travaillées », jamais le programme entier.** Rapporté à 301, le taux
  vaudrait 0,3 % — un nombre rassurant et faux, exactement l'erreur que le §5 bis de l'addendum
  précédent a refusée pour le KPI.
- **Le dénominateur est AFFICHÉ à côté du taux** (*« 5 % — soit 1 notion consolidée sur 19
  travaillées »*). Avec 19 notions, une seule notion déplace la courbe de 5 points ; un pourcentage
  nu laisserait croire à une mesure stable.
- **Un point sans dénominateur est un TROU, pas un zéro.** « 0 % de rien » est un jugement, pas une
  mesure, et il se lirait comme un effondrement. La courbe s'interrompt, et les segments ne sont
  pas reliés par un trait qui inventerait la mesure manquante.

### §6 quinquies — Le solde est autorisé ICI, et le §5 ter reste vrai LÀ

> `adr-0028-addendum-kpi-a-renforcer §5 ter` écarte le vrai solde (entrées − sorties dans
> `skill_mastery_history`) **au titre du delta du KPI**, au motif qu'*« il contredirait la
> sparkline affichée à côté de lui »*.

**Ce motif est intact, et il ne portait que sur cette adjacence.** Le KPI et sa sparkline sont deux
rendus du même nombre à trois millimètres l'un de l'autre ; le solde y aurait été une troisième
lecture non réconciliable, au même endroit.

La vue « Solde » est autre chose : une **vue nommée, isolée, qu'on choisit**, dont la note dit en
toutes lettres qu'elle ne se compte pas comme le KPI. Le delta du KPI reste
`value − sparks.fragile[0]`, inchangé.

C'est le seul endroit du dashboard où une **perte** est visible.

⚠️ **Un flux et un stock ne se réconcilient pas, et aucune surface ne doit les présenter comme
dérivés l'un de l'autre.** C'est écrit dans `projections.py`, dans `dashboard.ts` et dans le
schéma Pydantic — trois fois, parce que c'est trois fois qu'un lecteur pressé pourrait les
additionner.

### §6 sexies — Un solde vide dit l'ABSENCE DE TRACE, jamais l'absence de mouvement

`skill_mastery_history` compte **4 lignes**, toutes des entrées en `weak`/`learning` (31/07 et
01/08). Aucune ne franchit le palier consolidé : la vue « Solde » est donc **légitimement vide**
aujourd'hui.

> 🔴 **Dessiner une ligne plate à zéro se lirait « stable ».** C'est un mensonge tranquille : la
> mesure ne dit pas « rien n'a bougé », elle dit « je n'ai pas de trace ».

La vue affiche donc un état vide **explicite**, qui reprend `history_since` (§5 octies) : *« Aucune
entrée ni sortie du palier consolidée n'est enregistrée sur cette fenêtre. L'historique des
bascules ne commence qu'au 31/07/2026 : c'est une absence de trace, pas une absence de
mouvement. »*

**Trois règles de comptage**, toutes destinées à ne jamais inventer un mouvement invérifiable :

1. l'état **avant** la première bascule connue d'une notion est inconnu et le reste. Une première
   bascule vers `mastered` compte comme une entrée (c'est ce que le backfill a posé depuis
   `mastered_at`) ; une première bascule vers autre chose ne compte **rien** — surtout pas une
   perte, qui supposerait un acquis jamais observé ;
2. seule une notion **observée consolidée** peut être comptée perdue ;
3. une bascule qui ne traverse pas la frontière (`weak` → `learning`) ne compte nulle part.

Une notion qui entre et ressort dans la même fenêtre compte **les deux fois** : ce sont des
mouvements, pas un solde de population.

### §6 septies — Les deux moitiés de « Révisions » n'ont pas la même échelle, et la carte le dit

`SpacedReviewAttempt` porte **38 passages datés et notés** (`again|hard|good|easy`) du 04/07 au
04/08 — la seule donnée du dépôt qui mesure la **mémoire elle-même** plutôt qu'un palier de
maîtrise. C'est aussi, et de loin, la vue la mieux fournie.

La vue place **aujourd'hui au centre** : à gauche les passages effectués, empilés par note du raté
(en bas) au su (en haut) ; à droite les 14 jours de `review_load`.

⚠️ **L'axe des abscisses n'est pas linéaire de part et d'autre du trait** : un intervalle vaut
~3 jours à gauche sur la fenêtre 30, un jour à droite. C'est le prix des deux lectures sur un même
cadre. **La note le dit** plutôt que de le taire, et les deux moitiés portent chacune leur libellé.

**La charge à venir est dessinée en CREUX**, la partie passée en aplat : elle n'est pas mesurée,
elle est **planifiée**. Un aplat la ferait lire comme un fait accompli.

**Les re-tours de consolidation (`is_consolidation`) sont exclus** : un 2ᵉ passage de la même carte
le même jour est sans effet sur la planification, le compter doublerait une révision qui n'a eu
lieu qu'une fois.

### §6 octies — `ReviewLoadCard` n'est PAS supprimée

La vue « Révisions » recoupe la carte « Charge de révision », qui sert déjà les mêmes 14 jours.
**Le recoupement est assumé** : `charge` porte cette charge **sans distorsion d'axe**, et elle
répond à `active_days`/`consolidated` dans `CARD_SCOPES`. Retirer une carte du cockpit est une
décision de mise en page à part entière — elle n'est pas prise en passant, dans un chantier sur les
courbes.

### §6 nonies — Le verrou

> 🔴 **Toute série ajoutée au payload doit être sommée dans `sumSeries`.**

`subjects` est **déjà filtré** par la matière active. Une série oubliée resterait à zéro sur toutes
les vues : le filtre matière mentirait **sans qu'aucun test ne rougisse**, et la carte afficherait
des courbes plates parfaitement crédibles.

Deux filets, et ils ne se remplacent pas :

- **le type** : `sumSeries` déclare rendre un `DashboardSeries` complet, donc un champ ajouté à
  l'interface casse la compilation tant qu'il n'est pas sommé. ⚠️ Ce filet ne couvre que
  l'**existence** du champ, jamais la justesse de ce qu'on y met ;
- **le test** : un `toEqual` sur l'objet **entier**, avec un fixture dont chaque série porte des
  valeurs **distinctes** — des séries toutes égales auraient laissé passer une permutation.

> ⚠️ **Prouvé par sabotage, comme l'exige le dépôt.** Brancher le dénominateur de la rétention sur
> `covered` fait tomber **3 tests** (`25 % des 12` devient `15 % des 20`). Neutraliser
> `window_days` fait tomber le verrou de fenêtre côté backend. Un verrou non saboté n'en est pas
> un — c'est arrivé trois fois cette année.

### §6 decies — Le piège propre aux flux, absent des stocks

`bucket_counts` range chaque jour dans le **premier repère qui l'atteint**. Un jour antérieur à la
fenêtre tombe donc dans le **bucket 0** au lieu d'être ignoré, et y fabrique un pic à gauche.

Les stocks n'ont jamais eu ce problème — rien n'y est bucketisé —, d'où l'absence de tout précédent
dans le module. `window_days` borne explicitement, et un test dédié le verrouille.

## Vérifications de read-before-code — effectuées le 2026-08-05

| Hypothèse de départ | Verdict |
|---|---|
| La carte est peu expressive faute de bonnes courbes | ⚠️ **Insuffisant.** Deux causes distinctes : l'échelle confisquée (mesurée : 6 % de la hauteur) **et** la monotonie structurelle de `reconstruct_series` |
| Un solde entrées/sorties est calculable et jamais posé | ❌ **Faux.** Il est **explicitement écarté** par `adr-0028-addendum-kpi-a-renforcer §5 ter` — pour le delta du KPI. La décision est bornée, pas générale |
| `skill_mastery_history` alimentera bien une vue de flux | ⚠️ **4 lignes seulement**, toutes des entrées en `weak`. La vue « Solde » est **vide aujourd'hui** — d'où le §6 sexies, écrit avant d'avoir vu l'écran |
| La donnée de mémoire est dans les paliers de maîtrise | ❌ **Non.** `SpacedReviewAttempt` porte 38 passages notés et datés ; c'est la seule mesure de mémoire du dépôt, et la carte qui en porte le nom ne la lisait pas |
| Une série `in_progress` existe | ❌ Trois séries seulement. La quatrième conditionne **et** le dénominateur de la rétention **et** la bande de l'aire empilée |
| Ajouter un champ au service suffit | ❌ **Non** — `response_model=DashboardOut` **filtre en silence** tout champ absent de `schemas.py`. Piège déjà consigné par l'addendum précédent, et il se serait rejoué à l'identique |

## Ce que cet addendum ne fait pas

- **Il ne supprime pas `ReviewLoadCard`** (§6 octies) — décision de mise en page, pas de courbe.
- **Il ne touche pas à `CARD_SCOPES`.** La carte répond aux mêmes KPI qu'avant ; c'est précisément
  ce qui commande la vue par défaut (§6 ter).
- **Il ne change ni `reconstruct_series`, ni le delta du KPI, ni aucune sparkline.**
- **Il ne mémorise pas la vue choisie** — ni en URL, ni en stockage local. Le §4 réserve l'URL à ce
  qui doit survivre à un partage de lien ; une préférence d'affichage n'en est pas.
- **Il n'ajoute aucun seuil et aucune alerte.** Une rétention qui chute ne déclenche rien : le
  dashboard reste une surface qu'on **consulte**.

## Le signal qui dirait qu'on s'est trompé

- **Papa ne quitte jamais la vue par défaut.** Les trois autres seraient un coût de code sans
  lecteur, et la réponse serait d'en **retirer**, pas d'en ajouter une cinquième.
- **Quelqu'un « réconcilie » le solde et les stocks.** Les deux mesures divergeront le jour même —
  c'est le §6 quinquies qu'il faudra rouvrir, pas contourner.
- **La vue « Solde » reste vide six mois de plus.** Le problème ne serait plus la carte mais
  l'écriture de `skill_mastery_history`, et c'est là qu'il faudrait aller regarder.
- **Un état vide est remplacé par une ligne plate** « pour que ce soit moins moche ». C'est le
  §6 sexies en entier qui tombe.

## Coût

1. `dashboard/projections.py` : `window_days` et `consolidation_flux` — deux fonctions **pures**,
   aucun accès DB, testables isolément comme le reste du module.
2. `dashboard/service.py` : `_review_attempts`, `_mastery_transitions`, `_entered_in_progress_at`
   (symétrique de `_entered_fragile_at`) — **trois requêtes**, sur des tables indexées. **Aucune
   migration.**
3. `dashboard/schemas.py` : `ReviewRatings` + quatre champs sur `SubjectSeries`. **Sans quoi le
   service serait juste et l'API ne servirait rien.**
4. `packages/types` : `DashboardReviewRatings` (+ export dans le baril `index.ts`) et quatre champs
   sur `DashboardSeries`.
5. `dashboardDerive.ts` : `sumSeries` étendu, avec un type `NumericSeriesKey` qui empêche
   `add("reviews")` de compiler.
6. `MemoryTrendCard.tsx` : réécrite en quatre vues + sélecteur.
7. `DashboardPage.tsx` : l'interversion, et trois props de plus — toutes filtrées par la matière
   active, `notionsTotal` compris (un dénominateur resté au programme entier ferait fondre l'aire
   empilée dès qu'on filtre).
8. Tests : 5 sur `consolidation_flux` (dont le verrou de fenêtre), 5 sur la carte, le `toEqual`
   entier de `sumSeries` — **et les deux sabotages**.
