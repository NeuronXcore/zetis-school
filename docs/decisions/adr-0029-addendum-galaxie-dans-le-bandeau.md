# ADR-0029 — Addendum « La galaxie dans le bandeau » : le chrome cesse de décorer pour rien

## Statut

Accepté — 2026-08-04.

> **Addendum, pas nouvel ADR.** Il **étend le §6** de l'addendum « Construction depuis root » à une
> surface qu'il n'avait pas envisagée — le **chrome de l'application** — et **transpose en 2D** la
> construction qui n'existait qu'en 3D. Aucune table, aucune route, aucun contrat modifié.

## Contexte

Le header global de Massimo (`MassimoBannerHeader`, monté par `MassimoLayout`) est affiché sur
**les 21 routes protégées**. Il portait jusqu'ici un décor **génératif** : `NeuralCubes`
(22 cubes montants) et `NeuralLinks` (8 liens SVG animés).

Deux problèmes, et le second n'a été mesuré qu'en écrivant cet addendum :

- **Il ne dit rien.** 22 cubes tirés d'un PRNG et 8 liens décoratifs : joli, mais sans rapport avec
  Massimo. Le bandeau est la première chose qu'il voit, sur chaque page, et il ne lui parle pas de
  lui.
- **Il coûte, en permanence.** 46 animations CSS `infinite` + 32 `<animate>` SMIL
  `repeatCount="indefinite"` = **78 animations qui ne s'arrêtent jamais**. Pire, `hfx-twinkle`
  animait `filter: drop-shadow`, propriété **non composable** : 22 éléments **repeints à chaque
  image**, sur chaque page, tant que l'app est ouverte.

La demande : y mettre **sa** galaxie, qui se construit comme un graphe Obsidian.

## Le point dur — pourquoi ce n'est pas « monter `GalaxyCanvas` dans le header »

`GalaxyCanvas` tire `react-force-graph-3d` et Three.js : **1,37 Mo (368 Ko gzip)**. Le monter dans
le chrome le ferait télécharger sur **les 21 routes** — y compris `/subjects/:slug`, dont le budget
est écrit **ZÉRO** (`matiere.bundle.test.ts`), et `/chat`, que `notionActionUi.ts` protège
nommément.

⚠️ **Et rien ne l'aurait signalé.** `accueil.bundle.test.ts` et `matiere.bundle.test.ts` partent
d'une **page**. `MassimoLayout.tsx` et `MassimoBannerHeader.tsx` ne sont dans aucun des deux
graphes d'imports. Vérifié par sabotage : avec un `import("@zetis/ui/galaxy/canvas")` dans le
header, **les deux suites restent 12/12 vertes**. Le trou est fermé par `layout.bundle.test.ts`
(entrée `MassimoLayout.tsx`, budget zéro) et `app.bundle.test.ts` (entrée `App.tsx`, liste épinglée
des points de montage).

## Alternatives considérées

- **Monter `GalaxyCanvas` en `lazy()` dans le header.** Le `lazy()` n'atténue rien : c'est le
  **montage** qui déclenche le chunk, leçon du 2026-07-28. → **Écartée.**
- **N'animer que sur l'Accueil.** Le bandeau se comporterait différemment selon la page. Massimo y
  verrait une incohérence, pas une règle. → Écartée.
- **Un décor génératif « en forme de graphe »**, sans données. Aucun réseau — mais ce n'est plus sa
  galaxie, et on n'aurait rien réparé du premier problème. → Écartée.
- **Rendu 2D maison, vraies données, réutilisant les modules purs de `@zetis/ui/galaxy`.**
  → **Retenue.**

## Décision

### §1 — 2D, et zéro octet de moteur 3D dans le chrome

Le bandeau dessine dans un `<canvas>` 2D. Il **consomme** de `@zetis/ui/galaxy` ce qui est **pur et
sans dépendance** — `revealSchedule`, `easeOutCubic`, `starStyle`, les couleurs — et **n'importe
jamais** `@zetis/ui/galaxy/canvas`, `three`, `react-force-graph-3d` ni `three-spritetext`.

La doctrine était déjà écrite ailleurs (`GalaxyPage.tsx` : « **aucun chunk 3D pour un décor** ») ;
elle devient une règle **vérifiée** pour le chrome.

### §2 — La pose est dans le PLAN de la galaxie, pas à l'écran

`revealSchedule` porte la doctrine (horloge de **rang**, pas calendrier) : on la garde telle quelle.

`radialTreeLayout` en revanche **ne peut pas** servir. Ses `LEVEL_RADIUS = [0,170,90,52]` cumulent
±312 px ; le bandeau fait ~1200 × 96, soit **12,5 : 1**. Une échelle uniforme réduit la galaxie à
un carré de 84 px — exactement derrière l'emblème, donc invisible. Une échelle anisotrope donne
1,9 en X contre **0,22 en Y** : les chapitres s'écrasent en traînées de 5 px et la structure
disparaît.

`headerBandLayout` donne donc à chaque nœud `(u, v)` — ses coordonnées **dans le plan du disque** —
et `lift`, son épaisseur hors plan. L'écran s'obtient en **tournant** `(u, v)` puis en écrasant la
profondeur (`FLATTEN = 0,035`) : on regarde le disque presque par la tranche, ce qui **est** la
forme d'un bandeau.

**Le cœur se pose au centre exact de l'emblème**, et il y reste à tous les angles : la galaxie
**sort du logo ZETIS** et tourne autour de lui, au lieu d'être posée à côté.

⚠️ **Les matières sont réparties sur TOUT LE TOUR** (angle d'or). Une première version les
alternait à gauche et à droite : elles se retrouvaient toutes à l'angle 0 ou π, donc elles
traversaient le centre **en même temps** — à chaque demi-tour, la galaxie se repliait sur
l'emblème.

⚠️ **Arbitrage mesuré, et les deux objectifs se contredisent.** Donner les grands rayons aux
matières les plus alignées avec la bande porte le remplissage de 65 % à 90 % **à l'arrêt** — mais
remet la masse aux angles 0 et π, et la silhouette s'effondre à 52 % en tournant. C'est la rotation
qui décide : le bandeau passe sa vie à tourner et six secondes à se construire.

### §2bis — Tout le ciel est dessiné, pas seulement ce qui est travaillé

⚠️ **Mesuré à l'écran, et c'est ce qui a corrigé la conception.** Le graphe réel de Massimo fait
**202 nœuds pour 47 notions** ayant une date de première fois. Ne dessiner que ces 47 laissait la
bande **vide à 77 %** : les étoiles flottaient seules et se voyaient à peine.

Le plan de ce chantier se protégeait d'une « bouillie grise » à 350 nœuds. Le problème réel était
**l'inverse**. Les notions encore à découvrir sont donc dessinées elles aussi, en veilleuse
(`unknown`, « À découvrir » — une valeur qui existe déjà dans `STAR_STYLES`). Elles peuplent le
ciel, et les étoiles de Massimo ressortent **par contraste** au lieu de ressortir par la taille.

C'est aussi plus fidèle à la métaphore : le ciel existe, ce sont **ses** étoiles qui s'y allument.

### §3 — Le temps se comprime, JAMAIS le nombre d'étoiles

À `STAR_CADENCE` = 120 ms, les ~280 notions d'un référentiel complet dureraient **33,6 secondes**.
Impensable dans un bandeau présent partout.

⚠️ **La parade n'est pas de couper des notions.** L'addendum ADR-0024 §1 a supprimé
`GALAXY_MAX_NODES` parce qu'« il cache la progression de l'enfant selon un critère matériel » —
« Jamais un plafond de nœuds déguisé ». On comprime donc le **temps** : `HEADER_TOTAL = 7000 ms`,
toutes les étoiles naissent. Ce qui se règle sur la densité, c'est la **traînée** de naissance
(`birthWall`), c'est-à-dire les **particules**, ce que le §2 du même addendum autorise.

On ne **ralentit** jamais : sous le plafond, l'horloge de rang garde sa cadence naturelle. Avec les
**47 notions réellement travaillées** par Massimo, le plafond n'est donc même pas atteint — la
construction dure **~5,8 s** à 120 ms par notion, sans aucune compression.

⚠️ `HEADER_TOTAL` valait 3200 ms à la première écriture (construction ~3,1 s). Porté à 7000 après
lecture à l'écran : **ça se construisait trop vite pour qu'on voie quoi que ce soit.**

⚠️ Le budget de particules se mesure sur le **pic**, pas sur la moyenne : `revealSchedule` fait
naître les ancêtres juste avant leur première notion, donc les naissances arrivent **en grappes**.
Une formule au débit moyen donnait 34 étoiles en vol pour un budget de 32 — constaté, puis corrigé
par un calcul exact.

### §4 — La CONSTRUCTION : coût par image indépendant de N

À angle nul, une étoile arrivée ne bouge plus. On la blitte donc **une fois** sur un calque hors
écran, et chaque image ne coûte que ce calque + la couronne + les étoiles encore **en vol**
(≤ `IN_FLIGHT_BUDGET` = 32). Environ **35 opérations par image**, que Massimo ait 12 notions ou 500.

⚠️ **`ctx.shadowBlur` et `ctx.filter` sont interdits.** Ce sont des flous gaussiens appliqués **par
appel de dessin** : c'est `hfx-twinkle` réinventé en canvas. La lueur vient de sprites pré-rendus
une fois. Un test-verrou l'atteste.

### §4bis — LA VIE : ça ne se fige pas, ça tourne

⚠️ **Cette décision révise ce que ce même addendum disait le matin** (la construction s'arrêtait,
plus rien ne bougeait). Le gel donnait un bandeau **mort** : la construction dure quelques secondes
et Massimo arrive presque toujours après. Le dépôt disait d'ailleurs déjà l'inverse pour le rejeu —
addendum « Construction depuis root » §5 : « à la fin **ça ne se fige pas** ».

La galaxie **tourne** (`ROTATION_PERIOD` = 72 s pour un tour), et 24 étoiles scintillent par-dessus.
Une étoile qui passe **devant** le cœur est un peu plus grosse et plus vive que celle qui passe
derrière : c'est ce qui fait lire une rotation plutôt qu'un glissement latéral.

⚠️ **PRIX EXPLICITE, ET IL FAUT QU'IL SOIT ÉCRIT** : dès que tout tourne, plus rien n'est immobile,
donc **le calque ne sert plus** et chaque étoile se redessine. Le coût redevient **proportionnel à
N** — ~202 blits de sprite à **20 images par seconde** (mesuré : 19). À comparer aux ~38 éléments
**filtrés** repeints à 60 im/s par le décor retiré : un `drawImage` de sprite reste très loin d'un
`filter: drop-shadow`, mais la propriété « indépendant de N » ne vaut plus que pour la phase de
construction. En contrepartie, le calque est **libéré** au passage à ce régime : ~2 Mo rendus.

### §4ter — Le soleil, et la transparence de l'emblème

L'emblème ZETIS fait 84 px **opaques** posés **pile sur le cœur** du graphe : il cachait le point
d'où tout part. Il passe à **65 % d'opacité** — le cercle et le livre restent lisibles comme forme,
et on **voit** la galaxie sortir du logo au lieu de la deviner.

Une **couronne solaire dorée** est dessinée dans le canvas autour du cœur. Elle s'allume **avant**
la première étoile (rampe de 700 ms) et pulse **à la même horloge** que le scintillement : le
soleil et sa galaxie sont un seul objet, pas deux effets qui battent chacun dans leur coin. Mesuré :
cœur **9× plus lumineux** que la périphérie, **86 %** des pixels allumés sont chauds.

Son coût — un sprite de plus par image — est compté dans `FIXED_FRAME_DRAWS`, **constante exportée
que les tests consomment**, pour qu'un budget ne se relâche pas par des `+ 1` dispersés qu'on
ajusterait un à un.

### §5 — Quand la construction se joue — extension assumée du §6

L'addendum précédent dit : « aucune animation ne démarre sur une surface que Massimo n'a pas
ouverte pour elle ». Le bandeau est sur **toutes** les pages : la tension est réelle, et elle est
tranchée ici plutôt que contournée.

Le §6 vise l'**animation subie et permanente sur une page d'atterrissage** — le défaut du
2026-07-28. La surface que Massimo ouvre ici n'est ni `/chat` ni `/subjects/:slug` : c'est
**l'application**, dont ce bandeau est la porte d'entrée. La construction se joue **une seule fois
par chargement de page**, après la première peinture, et ne se répète **jamais** d'une page à
l'autre — vérifié en vrai : une navigation SPA laisse le témoin sur `alive`, le layout ne se
démontant pas.

Deux gardes complètent la règle :

- **onglet en arrière-plan** → on ne joue pas la construction, on passe directement à l'état
  vivant. Une construction jouée là est une construction perdue.
- **`prefers-reduced-motion`** → `requestAnimationFrame` **n'est jamais appelé**. Pas « appelé puis
  annulé » : le chemin n'existe pas. État final, immobile, d'emblée.

⚠️ Le verrou « déjà joué » se pose **à la fin** de la construction, pas à son début. Le poser au
début paraît plus simple et **casse le mode dev** : `StrictMode` monte, démonte et remonte chaque
effet, donc le premier passage marquerait « déjà joué » et le second n'animerait plus rien.

⚠️ Le témoin `canvas.dataset.state` (`growing` → `alive`) rend l'état observable. Il n'est pas
décoratif : depuis que la rotation existe, un simple compte d'images ne permet plus de vérifier
qu'un remontage **ne rejoue pas** la construction. C'est lui que le test-verrou lit.

### §6 — Le réseau est partagé, sans devenir un cache

Le bandeau demande les mêmes deux ressources que `HomeGalaxyCard` (`/galaxy/all` et
`/timeline?with_skills=true`), et `lib/galaxy.ts` n'avait **aucun** partage : l'Accueil serait
passé à 4 appels. `lib/galaxyShared.ts` déduplique **les requêtes en vol** (fenêtre de 5 s).

⚠️ **Ce n'est pas un cache de session, et c'est délibéré.** Une fenêtre longue figerait le graphe :
Massimo travaille une notion, revient sur l'Accueil, et son étoile ne serait pas allumée. On
perdrait une vérité pour économiser une requête déjà économisée.

⚠️ **Le jeton fait partie de la clé, pour la confidentialité et non pour la performance.**
`logout()` démonte le layout mais **pas le module** : sans cette comparaison, se déconnecter puis
se reconnecter dans le même onglet servirait la galaxie du compte précédent au suivant.

## Conséquences

- Le chrome de l'app perd **78 animations infinies** et ~38 éléments **filtrés** repeints à 60 im/s.
  Ce qui les remplace : ~202 blits de sprite à 19 im/s, sans flou gaussien — moins cher, mais
  **proportionnel à N**, ce que l'ancien décor n'était pas. Arbitrage assumé au §4bis.
- `NeuralCubes.tsx` et `NeuralLinks.tsx` sont **supprimés**. `headerFx.css` ne garde que les deux
  halos de l'emblème — animations sur `opacity` et `transform`, composables.
- **Le header Massimo a enfin des tests.** Il n'en avait aucun, et pas par oubli :
  `NeuralLinks.tsx:30` construisait un `ResizeObserver` que jsdom n'implémente pas et que
  `test/setup.ts` ne polyfille pas — le monter jetait `ReferenceError`. Son remplaçant retombe sur
  un écouteur de `resize`, ce qui débloque la couverture. Sont désormais verrouillés : la
  **hauteur** `h-24 sm:h-28` (que `GalaxyPage.tsx:542` recopie en dur dans `top-24 sm:top-28`), le
  **cadrage du sprite** (`356px 107px` à `-136px -2px`), le lien `/galaxy` (ADR-0024 §7), et
  l'absence de « ZETIS Papa ».
- Le budget de bundle du **chrome** est mesuré pour la première fois, et celui de l'app entière
  avec lui.

## Dette assumée

- **Rien n'a été jugé à l'œil sur un vrai appareil.** Le panneau navigateur de la session a rendu
  en taille réduite ; tout ce qui précède est **mesuré dans le canvas**. Sur desktop : 13–15 bandes
  sur 20 occupées selon l'angle, cœur 9× plus lumineux que la périphérie, 19 im/s. Sur un écran de
  390 px, la même galaxie tiendra dans trois fois moins de place.
- **`IN_FLIGHT_BUDGET`, `ROTATION_PERIOD` et `FLATTEN` ne sont pas mesurés au profileur.**
  L'addendum ADR-0024 reproche à `GALAXY_MAX_NODES` que « ses valeurs n'ont JAMAIS été mesurées » ;
  ne pas refaire la même chose. Une capture Safari sur iPhone, jeu semé à ~300 notions, reste à
  faire — et c'est là que le coût en N du §4bis se jugera vraiment.
- **Le remplissage plafonne à ~65 % de la largeur** à l'arrêt, conséquence directe de l'arbitrage
  du §2. S'il faut mieux, ce n'est pas la répartition angulaire qu'il faut toucher (elle porte la
  rotation) mais le rayon du disque ou la taille des amas.
