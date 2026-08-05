# Addendum ADR-0028 — Le KPI qui manque : « À renforcer »

## Statut

Proposé — 2026-08-05.

> S'appuie sur : `adr-0028` **§3 bis** (les quatre segments de maîtrise, sur les statuts réels),
> **§3 ter** (`skill_mastery_history`, la table qui rend la régression datable), **§5** (les KPI
> sont des filtres de focus) ; `adr-0028-addendum-analyse-par-matiere` (le panneau qui NOMME les
> notions à renforcer, et la règle « fragile ∪ lacune, jamais l'intersection, jamais fondues sous
> un total unique ») ; `adr-0038` et son addendum (*« un constat ne peut plus annoncer un nombre
> que sa preuve ne sert pas »*).
>
> **Ne rouvre pas** : la définition de « consolidée » (`mastered`, ≥ 90 — §3 bis) ; le mapping des
> quatre segments ; le retrait de l'XP des KPI (§5) ; l'exception au §4 accordée au panneau
> d'analyse.
>
> **Ne révoque rien.** Il **complète** le §5 : quatre KPI deviennent cinq, et le tableau de focus
> du §5 gagne une ligne (il en corrige une autre au passage — voir le read-before-code).
>
> **Aucune migration, aucune route nouvelle, aucune requête de plus.** `_entered_fragile_at` et
> `reconstruct_series` existent déjà et servent la courbe ambre **par matière** depuis le §3 ter ;
> il ne s'agit que de les appeler une fois de plus, globalement.
>
> Maquette : `docs/frontend-papa/mockup/mockup-dashboard-kpi-notions-v1.html` (chiffres réels de la
> base de dev au 2026-08-05).

## Contexte

Le bandeau porte **deux** KPI sur les notions — « Notions consolidées » et « Lacunes ouvertes ».
Relevé en base de dev le 2026-08-05, voici ce qu'il dit et ce qu'il tait :

| | |
|---|---|
| consolidées (`mastered`) | **1** / 280 |
| **à renforcer** (`weak` + `learning`) | **13**, dont **4 entrées les 31/07 et 01/08** |
| en cours (`solid`, `in_progress`, non tranché) | 5 |
| non abordées (aucune ligne de maîtrise) | 261 |
| lacunes ouvertes (`Gap` ∈ `open`, `in_progress`) | **1** |

Papa lit la ligne de tête et retient : *une notion consolidée, une lacune, tout est pris en
charge*. Les **13 notions à renforcer**, en **hausse cette semaine**, ne figurent nulle part —
il faut descendre jusqu'à la barre empilée pour les voir, et savoir qu'elles sont ambre.

> 🔴 **Le seul signal de RÉGRESSION du dashboard n'a aucune mesure de tête.** Le §3 ter a payé une
> table et une migration pour rendre la fragilité datable, en écrivant noir sur blanc que la courbe
> ambre est *« le signal de régression qu'un parent a besoin de voir tôt »*. Elle est publiée à
> deux cartes de distance du seul endroit qu'on lit tôt.

### Le piège que l'ajout rouvre, et qu'il faut refermer dans le même geste

Poser « À renforcer » dans le bandeau met **13** à côté de **1** pour ce qui *sonne* comme la même
chose. Le dépôt garde la trace du jour où les deux ont porté le même libellé —
`dashboardDerive.ts:276` : *« affichait 1 à côté de 9 sur le même écran, constaté au premier rendu
réel »*. Le même piège a coûté l'addendum « analyse par matière » en entier : un constat comptait
des notions **fragiles** et sa preuve servait des lignes **`Gap`**, deux populations disjointes
sous un mot unique.

Ce ne sont pas deux mesures du même objet avec des seuils différents. Ce sont **deux tables** :

- **à renforcer** = un **palier de maîtrise** (`skill_mastery.status`), il bouge tout seul au fil
  des quiz ;
- **lacune ouverte** = une **décision ouverte** (`gaps.status`), ouverte par un diagnostic faible,
  des erreurs répétées, ou par Papa — et qui se ferme quand on décide qu'elle est fermée.

Une notion peut être `weak` sans avoir jamais produit de `Gap` ; une `Gap` peut rester ouverte
alors que la maîtrise est repassée à `solid`. **Les deux nombres n'ont aucune raison d'être
égaux, et l'écran doit le dire.**

## Décision

### §5 bis — Un cinquième KPI, « À renforcer »

`kpis.fragile` : somme des notions `weak` + `learning` sur toutes les matières, servie par le
serveur comme les quatre autres.

**Contrat `KpiValue`, pas `KpiOutOf` — pas de dénominateur.** « 13 / 280 » rapporterait les
notions fragiles au programme entier, dont **261 notions jamais abordées** ; le ratio n'aurait
aucun sens et suggérerait une proportion rassurante là où il n'y en a pas. Le KPI porte un
**nombre**, et la barre empilée porte déjà la proportion, matière par matière.

**Ordre du bandeau** : temps actif · régularité · **consolidées · à renforcer · lacunes ouvertes**.
Les trois KPI de notions se lisent de gauche à droite dans l'ordre du parcours pédagogique :
ce qui est acquis, ce qui glisse, ce qui attend une décision.

**Le libellé est « À renforcer »**, mot pour mot celui du segment de la barre empilée. Le KPI et
son segment doivent se reconnaître à l'œil ; leur donner deux noms fabriquerait deux mesures.

### §5 ter — Le delta vient de la courbe, par construction

`delta ≡ value − sparks.fragile[0]`, et rien d'autre.

Ce n'est pas une commodité de calcul, c'est une **garantie de non-contradiction** : le chiffre
affiché et la sparkline dessinée trois millimètres plus bas ne peuvent pas raconter deux histoires
différentes. C'est la doctrine que `unattributed_minutes` a déjà payée sur cette page (*« sans lui,
les deux chiffres se contredisaient sur le même écran »*).

> ⚠️ **Ce delta n'est pas un solde, et il ne peut jamais être négatif.** `reconstruct_series`
> projette **l'ensemble d'aujourd'hui** à rebours : « +4 » veut dire *« parmi les 13 notions
> fragiles d'aujourd'hui, 4 le sont devenues pendant la fenêtre »*. Une notion réparée pendant la
> fenêtre n'est pas soustraite — elle disparaît simplement des deux nombres. Écrit ici, et dit dans
> l'infobulle, pour que personne ne lise « +4 » comme un bilan.

**Alternative écartée : le vrai solde** (entrées − sorties dans `skill_mastery_history` sur la
fenêtre). Il est calculable et il serait plus riche. Il **contredirait la sparkline** affichée à
côté de lui, qui est une projection à rebours et non un comptage historique. Deux nombres qui se
contredisent sur la même carte est exactement le défaut que les `adr-0038` et `adr-0039` passent
leur temps à refermer ; on ne le rouvre pas pour gagner un signe.

### §5 quater — Le sens de lecture vient de la couleur, et la prop est renommée

Sur ce KPI, **une hausse est une mauvaise nouvelle** — l'inverse des quatre autres.

`KpiFocusCard` ne connaît aujourd'hui que `deltaDirection: "up" | "down"`, où `"down"` peint en
ambre. Brancher le KPI fragile sur `deltaDirection="down"` donnerait le **bon rendu par un chemin
faux** : rien ne descend. Un nom qui ment est une dette qui se paie au premier lecteur.

**La prop devient `deltaTone: "good" | "bad"`** — trois sites d'appel à reprendre. La couleur
découle du **sens**, plus de la direction.

La carte fragile est **ambre de bout en bout** — valeur, delta, sparkline, indication de focus — du
même ambre que le segment « à renforcer » de la barre empilée (`fill-papa-warn`). Aucune flèche
inversée, aucun pictogramme : le sens de lecture passe par la couleur, qui est déjà celle du
segment correspondant.

### §5 quinquies — Ce que le focus « À renforcer » allume

| KPI | Cartes conservées |
|---|---|
| **À renforcer** | Évolution de la mémoire · État des notions · Où agir · **Lecture ZETIS** |

**La Lecture ZETIS en fait partie** parce qu'elle énonce littéralement *« Français : 8 notions à
renforcer »* — c'est la preuve du KPI en toutes lettres, et son lien mène désormais au panneau qui
les nomme (`addendum analyse-par-matiere §6`).

**La Chaîne de contenus n'en fait pas partie** : elle parle de **production**, pas de maîtrise.
Idem pour la Charge de révision, la Répartition du temps et la Heatmap.

Quatre cartes sur huit — exactement la portée de `open_gaps`. Le focus continue d'atténuer la
moitié de la page ; un focus qui n'atténue plus rien est un clic qui ne veut plus rien dire.

### §5 sexies — Trois infobulles, parce que trois nombres voisins ne disent pas la même chose

Les trois KPI de notions portent chacun un « i ». Ce n'est pas de l'ornement : c'est la seule chose
qui empêche le bandeau de rejouer la confusion de `dashboardDerive.ts:276`.

- **Notions consolidées** — *« Notions au palier `mastered` (score ≥ 90). Le dénominateur est le
  programme entier — non abordées comprises —, pas le nombre de notions travaillées. »*
- **À renforcer** — *« Notions déjà travaillées dont la maîtrise n'est pas assurée (`weak`,
  `learning`). Une notion qui redescend de "consolidée" atterrit ici. Ce n'est pas le compteur de
  lacunes : une lacune est une décision ouverte, pas un palier de maîtrise. »*
- **Lacunes ouvertes** — *« Lignes `Gap` ouvertes ou en cours — ouvertes par un diagnostic faible,
  des erreurs répétées, ou par vous. Compte des décisions à traiter : ce nombre et « À renforcer »
  n'ont aucune raison d'être égaux. »*

Une **quatrième** infobulle, dans la légende de « État des notions », sur le segment « en cours » :
*« presque acquis (≥ 70), en cours de mission, ou pas encore tranché »*.

### §5 septies — « En cours » reste un seul segment, et le dit

`solid` (≥ 70) reste dans le même sac que `in_progress` et que les statuts non tranchés. **Le
fourre-tout est assumé et documenté, pas scindé.**

Le scinder demanderait une cinquième couleur sur une barre qui en porte déjà quatre, un segment de
plus dans toutes les surfaces qui lisent `notions_breakdown`, et rendrait la légende moins lisible
qu'elle ne l'est. La règle de `notions_breakdown` — *« mieux vaut une notion mal rangée qu'une
notion invisible »* — reste en vigueur ; on lui ajoute seulement de dire ce qu'elle range.

### §5 octies — L'honnêteté sur la jeunesse de la courbe s'auto-périme

`skill_mastery_history` ne compte que **4 lignes** (31/07 et 01/08) : la table est récente. Sur la
fenêtre « Année », la courbe ambre sera donc plate jusqu'à fin juillet puis montera d'un coup —
**un artefact de mise en service, pas une dégradation de Massimo**.

Le payload sert `history_since` : la date de la plus ancienne ligne de `skill_mastery_history`, ou
`null` si la table est vide. **Le client n'ajoute la phrase d'avertissement à l'infobulle que si la
fenêtre affichée commence avant cette date.**

Une phrase figée aurait été juste six mois puis fausse pour toujours, et personne ne serait revenu
la retirer. Celle-ci **disparaît d'elle-même** le jour où l'historique couvre la fenêtre.

### §5 nonies — Le verrou

> 🔴 **La valeur du KPI « À renforcer » est exactement la somme des segments ambre de « État des
> notions ».**

Deux assertions, sur le payload réel :

- `kpis.fragile.value == Σ subjects[].notions.fragile`
- `kpis.fragile.delta == kpis.fragile.value − sparks.fragile[0]`

C'est la seule ligne de cet addendum qui protège quelque chose de façon permanente : elle interdit
qu'un KPI et la carte qu'il éclaire se mettent à compter deux populations différentes — la classe
de défaut qui a produit ce chantier.

> ⚠️ **Ce verrou n'en est un qu'une fois prouvé par sabotage.** Muter le calcul du KPI (ne compter
> que `weak`) doit le faire passer au **rouge**. Trois fois cette année, un test-verrou central est
> resté **vert** sur un sabotage délibéré ; on ne signe plus celui-ci sur sa seule lecture.

### §5 decies — La grille

`grid-cols-2 md:grid-cols-3 xl:grid-cols-5`.

Mesuré dans le navigateur sur la maquette : à **1000 px** la grille tombe à deux colonnes et
« Lacunes ouvertes » se retrouve **seule sur sa ligne**. Le palier `md:grid-cols-3` rend 3 + 2, ce
qui est moins bancal. En dessous de 768 px l'orpheline est acceptée : le dashboard Papa est
desktop-first, et la maquette a par ailleurs révélé un vrai débordement à corriger — l'infobulle
du KPI de droite sortait à 1553 px pour un viewport de 1440 et faisait scroller la page
horizontalement (ancrage à droite pour la carte de droite).

> ⚠️ `DashboardFocus = keyof DashboardKpis`. Ajouter `fragile` **élargit le focus
> automatiquement**, et chaque `Record<DashboardFocus, …>` du dépôt (`KPI_LABELS`,
> `KPI_FOCUS_HINTS`) devient incomplet — le compilateur les désigne un par un, exactement comme
> l'élargissement de `DashboardPeriod` l'a fait pour la fenêtre « Année ». **Mais ce filet n'existe
> que si l'on lance le bon outil** : `tsc --noEmit` à la racine ne vérifie rien dans ce dépôt, seul
> `tsc -b` le fait.

## Vérifications de read-before-code — effectuées le 2026-08-05

| Hypothèse de départ | Verdict |
|---|---|
| La classification ZETIS est ternaire (acquis / en cours / lacune) | ❌ **Fausse.** Quatre segments de maîtrise **plus** un objet d'une autre table |
| « À renforcer » a déjà une mesure quelque part | ❌ Nulle part en tête de page ; seulement `subjects[].notions.fragile` et la courbe ambre |
| Une série globale de fragilité existe | ❌ `DashboardSparks` n'a que quatre champs ; les séries `fragile` sont **par matière** |
| Il faudra une migration ou une requête de plus | ❌ `_entered_fragile_at` + `reconstruct_series` suffisent — **aucune** |
| `FRAGILE_STATUSES` vit dans `progress/service.py`, comme l'annonce le §3 bis | ❌ **Faux dans le code livré** : les trois constantes sont dans `dashboard/projections.py:41-43`, et `progress/analysis.py` les importe (`from app.modules.dashboard import projections as p`). La dépendance va de `progress` **vers** `dashboard`, l'inverse de ce que le §3 bis laissait attendre. **Constat, pas correction** — déplacer les constantes est un refactor transverse, hors périmètre |
| Le tableau de focus du §5 décrit le code | ⚠️ **Presque.** Il ne liste « Lecture ZETIS » que sous « Lacunes ouvertes » ; le code lui donne `["consolidated", "open_gaps"]` (`dashboardDerive.ts:253`). **Le code a raison** — la carte porte les deux constats. Le tableau du §5 est corrigé par le présent addendum |
| `GLOSSARY.md` est aligné sur l'écran | ❌ L'entrée « Lacune ouverte » annonce encore *« formulée côté interface en "notion à renforcer" »* — formulation que le code a **explicitement refusée**. Corrigée avec cet addendum |

## Ce que cet addendum ne fait pas

- **Il ne scinde pas « en cours »** (§5 septies) — décision, pas oubli.
- **Il ne déplace pas les constantes de statut** hors de `dashboard/projections.py`, malgré ce
  qu'annonce le §3 bis. Le §3 bis est **daté**, pas réécrit.
- **Il ne corrige pas la dette d'échelle 0–100 / 0–1.** Le dashboard raisonne sur des statuts et
  n'en hérite pas (§3 bis) ; elle reste suivie ailleurs.
- **Il ne touche ni au `SubjectAnalysisPanel`, ni à la Lecture ZETIS, ni à la barre empilée** —
  hors l'infobulle ajoutée à sa légende.
- **Il ne crée aucune alerte et aucun seuil.** Un « À renforcer » qui déclencherait un signal
  ferait du dashboard un émetteur ; il reste une surface qu'on **consulte**.
- **Il n'ajoute aucun lien depuis le KPI.** Un KPI est un **filtre de focus** (§5) ; le chemin vers
  les noms passe par « Où agir » et son panneau, qui est fait pour ça.

## Le signal qui dirait qu'on s'est trompé

- **Papa regarde « À renforcer » et ne clique jamais.** Le KPI serait un chiffre d'ambiance. La
  réponse serait de lui faire ouvrir le panneau d'analyse, pas d'atténuer davantage de cartes.
- **« À renforcer » et « Lacunes ouvertes » sont à nouveau confondus** — dans une conversation, un
  commit, ou un écran. Les infobulles n'auront pas suffi, et c'est alors le **libellé** qu'il
  faudra changer, pas l'infobulle qu'il faudra rallonger.
- **Quelqu'un « corrige » le delta pour qu'il puisse être négatif.** Le chiffre et la sparkline
  divergeront le jour même. C'est le §5 ter qu'il faut rouvrir, pas contourner.
- **Le bandeau passe à six KPI.** Cinq mesures de tête est déjà la limite de ce qu'on embrasse d'un
  coup d'œil. Un sixième dirait que le dashboard ne hiérarchise plus, et la réponse serait d'en
  **retirer** un — pas d'élargir la grille.

## Coût

1. `packages/types` : `fragile` dans `DashboardKpis` et `DashboardSparks`, `history_since` dans
   `DashboardPayload`.
2. `dashboard/service.py` : une somme et un `reconstruct_series` de plus, sur des données déjà
   chargées. **Aucune requête nouvelle, aucune migration.**
3. `KpiFocusCard` : `deltaDirection` → `deltaTone` (3 sites d'appel).
4. `dashboardDerive.ts` : une entrée dans `KPI_LABELS`, `KPI_FOCUS_HINTS`, `KPI_ORDER`, et
   `fragile` ajouté à quatre entrées de `CARD_SCOPES`.
5. `DashboardPage.tsx` : une carte, la grille en `md:grid-cols-3 xl:grid-cols-5`, quatre
   infobulles.
6. Tests : le verrou du §5 nonies **et son sabotage**.
7. `GLOSSARY.md` : l'entrée « Lacune ouverte » remise au réel.
