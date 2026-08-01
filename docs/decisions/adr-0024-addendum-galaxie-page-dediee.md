# Addendum ADR-0024 — 2026-07-31 · La Galaxy prend sa route ; l'Accueil cesse de payer la 3D

## Statut

Accepté — 2026-07-31.

> Section à **ajouter à la fin de** `docs/decisions/adr-0024-zetis-galaxy-progression.md`
> (patron des addenda de `adr-0007` et `adr-0016`).
>
> **Révise deux points de l'ADR-0024** : le §1 (« la Galaxy *est* la page Progression ») sur le
> **nom de la route seulement**, et l'amendement du §6 daté du 2026-07-28 (graphe global 3D sur
> l'Accueil), **révoqué**.
> **Ne rouvre pas** les §2 (dérivation des arêtes), §3 (moteur 3D et double moteur graphe),
> §4 (panneau d'actions et panoplie complète grisée), §5 (doctrine) ni le reste du §6
> (plafond adaptatif, `prefers-reduced-motion`, repli WebGL, parité tactile).
> **Aucune décision d'un autre ADR n'est touchée. Aucune migration. Aucune route backend
> nouvelle ni supprimée.**

## Contexte

Trois jours après la livraison de la Galaxy, le refactor de l'Accueil de Massimo remet deux
choses sur la table.

**1. Le nom.** `/progression` est un mot d'adulte, hérité du mock qu'il remplaçait. La page ne
mesure plus rien : elle montre une galaxie. Le libellé de sidebar et l'URL décrivent encore
l'ancien contenu, et c'est la seule page de l'espace Massimo dont le nom ne dit pas ce qu'on y
voit. Le user demande une **page dédiée** et un **bouton d'entrée depuis l'Accueil**.

**2. Le coût de l'amendement §9.** L'aperçu global 3D posé sur l'Accueil le 2026-07-28 a été
accepté avec son coût écrit noir sur blanc : *« le moteur 3D arrive désormais sur la page
d'atterrissage »*. Trois jours d'usage confirment que c'est le mauvais endroit. L'Accueil est la
page la plus visitée, la première peinte au réveil de l'app, et celle qui doit répondre en une
seconde à « qu'est-ce que je fais maintenant ». Elle charge aujourd'hui un chunk de **1,37 Mo
(368 Ko gzip)** pour afficher une vue **contemplative**, dont aucun élément n'est la prochaine
action de Massimo.

S'ajoute une contrainte de calendrier : le chantier Chat (ADR-0026) va poser sa propre porte
d'entrée sur cet Accueil. Refactorer maintenant sans lui expose à ouvrir `AccueilPage.tsx` deux
fois — le §Découpage dit comment ce risque est borné sans faire dépendre ce chantier du Chat.

## Alternatives considérées

- **Ajouter `/galaxy` à côté de `/progression`.** C'est littéralement l'alternative écartée par
  l'ADR-0024 (« entretient deux surfaces de progression concurrentes »). Le motif de rejet vaut
  toujours. → **Écarté**.
- **Garder l'aperçu 3D sur l'Accueil et ajouter le bouton à côté.** Le bouton devient un doublon
  de ce qu'on voit déjà, et le coût de démarrage reste. → Écarté.
- **Garder l'aperçu, mais différé (`IntersectionObserver`, chargement au scroll).** Borne le coût
  au premier paint sans le supprimer, et ajoute une mécanique d'apparition sur une page qui doit
  rester calme. Surtout : ça ne répond pas à la demande de page dédiée. → Écarté.
- **Remplacer l'aperçu par une image statique de la galaxie.** Zéro coût, mais un visuel figé qui
  ne reflète pas l'état réel ment à Massimo dès la première étoile allumée. → Écarté.
- **Renommer, et rendre l'entrée statique.** → **Retenu.**

## Décision

### A. `/progression` **devient** `/galaxy` — un renommage, pas un ajout

- Route : `/galaxy`. `/progression` est conservée en **redirection permanente**
  (`<Navigate to="/galaxy" replace />`), jamais en page.
- Libellé de sidebar : **« Ma Galaxie »**, à la place de « Progression », **à la même position**.
  Le nombre d'entrées ne bouge pas : toujours pas de 6ᵉ onglet, l'interdit du §1 tient.
- Le bandeau XP (`MassimoBannerHeader`) pointe désormais vers `/galaxy`.
- Le **contenu** de la page ne change pas : écran d'ensemble (planètes CSS), constellations 3D,
  panneau d'actions, KPI d'états, recherche, plein écran, anneau XP, badges, activité récente.
  Rien n'est démembré ni déplacé ailleurs.

La surface de progression reste **unique**. C'est ce que l'ADR-0024 protégeait ; le nom n'en
faisait pas partie.

### B. L'Accueil rend une **carte-bouton statique** — l'amendement du 2026-07-28 est révoqué

> ⚠️ **CE §B EST LUI-MÊME RÉVOQUÉ**, le soir du même jour, par
> `adr-0024-addendum-galaxie-sur-accueil.md`. La galaxie **revient sur l'Accueil** : voir la
> galaxie se construire donne à la page une vie qu'un compte statique ne donne pas — ce qui est
> l'intention de l'addendum « Accueil vivant », écrit le matin même. Deux décisions du même jour
> tiraient en sens inverse.
>
> **Ce qui survit de ce §B**, et qui n'est pas jeté avec lui : un montage 3D **immédiat** sur la
> page d'atterrissage reste indéfendable. Le canvas revient **différé** (`requestIdleCallback`,
> repli `setTimeout`), derrière la carte statique qui reste la **première peinture**. Le test de
> budget change de nature — liste blanche au lieu de zéro — mais ne disparaît pas.
>
> Ce qui suit décrit l'état **d'avant**.

Le `GalaxyCanvas` et la frise de progression **quittent l'Accueil**. À leur place, une carte
d'entrée dont le contrat est fermé :

- **compte d'étoiles allumées**, toutes matières confondues — un compte, jamais un pourcentage ;
- **pastilles de matières** en CSS pur (mêmes pictogrammes `subjectIconFor`, jamais d'emoji) ;
- un libellé d'action, et la carte entière est la cible de clic → `/galaxy`.

**Interdits sur cette carte**, par héritage du §5 : aucun pourcentage, aucun classement de
matières, aucune couleur d'échec, aucune notion nommée comme manquante, aucun `mastery_score`.

**Contrainte technique ferme : zéro import de `@zetis/ui/galaxy/canvas` depuis l'Accueil**, ni
direct, ni transitif. Le sous-chemin dédié (§3) existe précisément pour que cette frontière soit
vérifiable au build. Un test de budget de bundle sur la page d'entrée constate la sortie de
Three.js ; sans lui la régression reviendrait sans bruit, comme les 3,6 Mo mesurés en juillet.

### C. Le graphe global **migre** de l'Accueil vers `/galaxy`, dont il devient la vue par défaut

> ⚠️ **La RÉDUCTION décidée ici — `root` + `subject` seulement — est RÉVOQUÉE** le soir du même
> jour par `adr-0024-addendum-constellations-completes.md`. La vue par défaut rend désormais la
> galaxie **entière**, en orbites emboîtées.
>
> **Ce §C n'était pas une erreur** : son constat, fait au vu du rendu réel, était juste. Ce qu'il
> attribuait au **nombre de nœuds** venait en fait de la **convergence** — un moteur de forces
> tasse les nœuds là où les forces s'annulent, sans égard pour la lisibilité. Les positions étant
> désormais **calculées et épinglées**, moteur éteint, l'amas ne peut plus se produire et le
> filtre protégeait contre un défaut disparu.
>
> ⚠️ **Ne pas en conclure qu'on peut rallumer les forces.** C'est parce qu'on ne les rallume pas
> que tout peut être montré. La **migration** décidée par ce §C, elle, tient sans changement.

La brique livrée le 2026-07-28 pour l'Accueil — graphe global en deux colonnes, badges de matières
cliquables, frise de progression — n'est **pas supprimée**. Elle **change d'adresse**. Rien de ce
qui a été construit ce jour-là n'est jeté ; c'est son emplacement qui était faux, pas son contenu.

- **Vue par défaut de `/galaxy`** : la galaxie **complète**, toutes matières
  (`GET /api/student/galaxy/all` — `root` → matières → chapitres → notions). Le plafond adaptatif
  de l'ADR-0024 §6 s'applique tel quel : dès qu'il mord, la vue **replie sur matières +
  chapitres**, et les notions restent atteignables en entrant dans une constellation.

  > ⚠️ **Révisé le 2026-07-31, au vu du rendu réel.** Servir **tout** le graphe d'un coup à une
  > simulation de forces produisait un **amas** : le cœur (cerveau) à moitié enseveli sous les
  > sphères, des libellés qui se chevauchent, et aucune lecture possible.
  >
  > La vue d'arrivée devient un **système solaire** — le **cerveau au centre** et les
  > **matières seules**, chacune **posée** sur une orbite dessinée, dans un plan aplati vu en
  > surplomb. Un placement calculé, pas un équilibre : un moteur de forces cherche une
  > position stable, pas une composition.
  >
  > **Rien n'est perdu** : les notions restent atteignables en entrant dans une constellation —
  > elles cessent seulement d'être servies **toutes en même temps**. Le contrat
  > `GET /api/student/galaxy/all` est **inchangé**, c'est le client qui ne garde que `root` et
  > `subject`. Effet de bord heureux : 8 planètes au lieu de 60 nœuds, le **plafond adaptatif ne
  > mord plus jamais** sur cet écran (la dette §6 subsiste pour les constellations).
- **Clic sur une matière** → sa constellation, comportement inchangé.
- **Les planètes CSS cessent d'être un écran.** Elles deviennent l'**état d'attente** pendant le
  chargement du chunk 3D, et le **repli sans WebGL**. Elles gardent ainsi leur raison d'être
  d'origine — ne pas payer Three.js — là où elle a encore un sens.
- La **frise de progression** suit : c'est un élément de progression, sa place est ici.

**Coût assumé, et c'est le bon endroit pour le payer** : `/galaxy` charge Three.js dès son
ouverture. C'est la raison d'être de la page. Tout le gain du §B consistait à sortir ce coût de la
page d'atterrissage, pas à le supprimer du produit.

Maquette : `docs/frontend-massimo/mockup/mockup-page-galaxy-v1.html` (trois écrans : galaxie complète,
constellation + panneau d'actions, attente / repli sans WebGL).

Conséquence maintenue : **aucun travail backend.** Pas de route supprimée, pas de schéma touché.
`GET /api/student/galaxy/all` change de consommateur, pas de contrat.

### D. La télémétrie de navigation garde sa continuité

`POST /api/telemetry/pageview` enregistre la `route` brute, et l'historique d'avant ce jour
contient `/progression`. Côté Papa, le cahier de bord et le dashboard qui traduisent une route en
libellé doivent **accepter les deux valeurs** et les rendre sous le même nom.

Ce n'est pas un détail de confort : sans ce mapping, le renommage crée une **rupture silencieuse
dans l'historique** de Massimo — une page fréquentée pendant trois jours disparaîtrait des
statistiques, ou apparaîtrait comme deux pages distinctes. C'est la seule conséquence de ce
chantier qui touche la surface Papa.

## Conséquences

**Positives**

- **L'Accueil redevient la page la plus légère du front.** Le coût assumé de l'amendement du
  2026-07-28 est annulé, pas atténué : le moteur 3D n'est plus chargé qu'à l'ouverture explicite
  de la galaxie.
- L'URL, le libellé de sidebar et le contenu **disent la même chose**, pour la première fois
  depuis la livraison.
- L'Accueil retrouve sa règle d'or : **une seule action accentuée**, « Commencer » sur la mission
  du jour. La galaxie devient une invitation, plus une vue concurrente.
- `zetis-galaxy.md §13` (« hors v1 : aperçu sur l'Accueil ») **redevient exact** — il avait été
  contredit par l'amendement sans être corrigé.

**Négatives, assumées**

- **Un clic de plus** pour voir la galaxie. C'est le prix explicite du gain de démarrage, et il
  est cohérent avec la nature de la vue : on va voir sa galaxie, on ne la croise pas.
- **Une redirection permanente à maintenir** dans le routeur, et un mapping de libellé à deux
  entrées côté Papa (§D) — deux petites dettes qui ne s'effaceront jamais complètement.
- **Deux décisions rouvertes en trois jours** sur le même ADR (quatre amendements au total). Le
  chantier Galaxy aura été cadré en marchant ; c'est écrit ici pour que ce soit lisible plus tard,
  pas pour être répété.

## Corollaires documentaires

- **`docs/frontend-massimo/page-accueil.md` n'a jamais documenté l'aperçu Galaxy livré le
  2026-07-28.** La spec était déjà en retard sur le code avant ce chantier. Elle est **réécrite**
  (nouvelle composition de l'Accueil), et la dette est réglée au passage. Maquette de référence :
  `docs/frontend-massimo/mockup/mockup-page-accueil-v2.html`.
- `zetis-galaxy.md` : route, libellé, et §13 à corriger.
- `navigation.md` reste **non réconcilié** — ce chantier ne l'ouvre pas. Il contredisait déjà
  l'existant sur l'onglet Progression ; il le contredit désormais sur son nom.
- `DECISIONS.md`, `CHANGELOG.md`, `API_SPEC.md` (§ZETIS Galaxy : consommateur de `/all` modifié,
  contrat inchangé).

## Découpage

> **Corrigé le 2026-07-31, avant tout commit.** Une première rédaction rattachait ce chantier au
> **Groupe 1 (Chat Massimo, ADR-0026), slice A, sans branche séparée**, au motif que l'Accueil est
> la surface d'atterrissage du chat. Le motif était juste, la conclusion non : le renommage de
> route n'a **aucun rapport** avec le chat, et l'adosser au Groupe 1 aurait retardé un gain
> immédiat derrière un chantier lourd. La contrepartie — ouvrir `AccueilPage.tsx` deux fois — est
> **bornée**, pas ignorée : voir la slice B ci-dessous.

**Chantier autonome. Branche `feat/accueil-galaxy`**, deux slices, dans l'ordre.

### Slice A — renommage de route

Prompt : `prompts/claude-code/prompt-accueil-galaxy-slice-a-renommage.md`.

1. `/galaxy` sert la page ; `/progression` devient une redirection permanente.
2. Sidebar « Ma Galaxie », même position ; bandeau XP repointé.
3. Toutes les références résiduelles à `/progression`.
4. Mapping de télémétrie **à deux routes** côté Papa (§D).

**Hypothèse à vérifier, pas un acquis** : le point 4 est annoncé sans travail backend. Si le
mapping route → libellé vit côté serveur (module `parent/activity`), l'annonce « zéro backend »
tombe et la slice s'arrête pour arbitrage.

### Slice B — refonte de l'Accueil

Prompt : `prompts/claude-code/prompt-accueil-galaxy-slice-b-accueil.md`.

1. Retrait du canvas 3D et de la frise ; carte-bouton statique ; **test de budget de bundle**.
2. Recomposition en cinq blocs (spec `page-accueil.md`).
3. Migration du graphe global (+ badges matières, frise) vers `/galaxy`, **en vue par défaut**.

**L'emplacement du héros ZETIS est structuré mais NON RENDU.** C'est ce qui borne le double
passage : le Groupe 1 remplira un **slot** au lieu de rouvrir la composition. Le bloc n'est pas
rendu tant que le chat n'existe pas — une porte vers du vide est pire que pas de porte.

## Hors périmètre

Toute évolution du **contenu** de la galaxie (graphe de prérequis, annonce « +1 étoile »,
persistance des positions, animation temps réel) ; le plafond adaptatif et sa validation sur les
trois appareils, qui restent dus au titre de l'ADR-0024 §6 ; la refonte du reste de l'Accueil
au-delà de la carte Galaxie, traitée par la spec de page ; la réconciliation de `navigation.md`.
