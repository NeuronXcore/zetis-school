# ADR-0024 — Addendum « La galaxie revient sur l'Accueil » : la vie vaut son prix

## Statut

Accepté — 2026-07-31 (soir).

> **Addendum, pas nouvel ADR.** Il **révoque le §B** du premier addendum
> (`adr-0024-addendum-galaxie-page-dediee.md`), écrit le matin même, qui avait retiré le canvas 3D
> de l'Accueil.
>
> ⚠️ **Quatrième addendum à l'ADR-0024 en une journée.** C'est beaucoup, et ce n'est pas un signe
> de santé : le chantier Galaxy aura été cadré en marchant. Écrit pour être lisible, pas répété.

## Contexte

Le §B du matin retirait le canvas de l'Accueil, avec un raisonnement qui tenait : la page la plus
visitée, la première peinte au réveil de l'app, chargeait **1,37 Mo (368 Ko gzip)** pour une vue
contemplative dont aucun élément n'est la prochaine action de Massimo. Le coût était **annulé, pas
atténué**, et un test de budget (`accueil.bundle.test.ts`) le verrouillait.

Le soir, la slice B livre la **construction depuis `root`** — la galaxie qui pousse au lieu de
défiler. Constat d'usage, formulé par Papa : **voir la galaxie se construire donne à la page une
vie qu'un compte statique ne donne pas.**

Cet argument n'est pas une préférence esthétique isolée. Il est **exactement l'intention** de
l'addendum « Accueil vivant », écrit le même jour, qui cherchait à rendre la page moins inerte —
et qui, faute de mieux, s'était rabattu sur « Mon ciel » et « Tes derniers gains ».

Deux décisions du même jour tiraient donc en sens inverse : l'une voulait un Accueil vivant,
l'autre lui retirait ce qu'il avait de plus vivant.

## Alternatives considérées

- **Animer la carte CSS existante** (le cœur qui apparaît, les pastilles qui sortent du centre).
  Zéro Three.js, test de budget intact, aucun ADR à rouvrir. **Proposé en premier, et écarté par
  Papa** : une pastille qui glisse n'est pas une galaxie qui naît, et c'est bien la galaxie qui
  fait l'effet. → Écarté.
- **Mesurer d'abord le coût réel** (temps jusqu'au premier rendu, sur les trois appareils), puis
  trancher. Écarté **pour cette décision-ci** : le coût est déjà connu et chiffré depuis le 28,
  il n'y a rien à découvrir. La mesure reste due, mais elle porte sur la **tenue** (framerate),
  pas sur l'opportunité.
- **Remonter le canvas tel qu'il était le 28** — montage immédiat, à l'atterrissage. → Écarté :
  c'est la régression, pas la décision.
- **Rétablir le canvas en montage DIFFÉRÉ, derrière la carte statique.** → **Retenu.**

## Décision

### 1. Le §B est **révoqué**, et le coût est **assumé**

La galaxie revient sur l'Accueil. Le motif est **produit, pas technique** : la page d'entrée de
Massimo doit donner envie d'y être. Ce n'est pas un coût qu'on aurait sous-estimé le matin puis
redécouvert le soir — c'est le **même coût**, mis en balance avec autre chose, et tranché
autrement.

**Ce qui reste vrai du §B**, et qu'il ne faut pas jeter avec lui : l'Accueil est la page la plus
visitée, et un montage 3D **immédiat** y est indéfendable.

### 2. Le canvas n'est **jamais monté au premier rendu**

C'est ce qui sépare cette décision de la régression du 2026-07-28.

- La **carte statique est la première peinture** — compte d'étoiles, pastilles de matières, appel
  à l'action. Elle n'est pas un état d'attente déguisé : c'est la page.
- Le canvas est monté **après**, à `requestIdleCallback` (repli `setTimeout` 600 ms — **Safari
  n'a pas `requestIdleCallback`, et c'est le navigateur de l'iPhone et de l'iPad de Massimo**,
  donc le repli est le cas courant, pas un cas de bord).
- Massimo voit sa page tout de suite, **puis** sa galaxie se construit.

### 3. La 3D de l'Accueil est **contemplative**

`pointer-events-none`, `aria-hidden`. Toute la carte reste **une seule cible de clic** vers
`/galaxy` — décision du §B qu'on garde, parce qu'elle vaut : viser un lien de fin de carte est un
geste de précision inutile sur iPhone. Et sans ça, un drag de nœud à l'intérieur d'un lien
**déclencherait la navigation au relâchement**.

Rien de ce que montre le ciel n'est une information que le texte ne dit pas déjà : c'est du décor
animé, et il est annoncé comme tel aux lecteurs d'écran.

### 4. Ce que l'Accueil rend : la **croissance complète**, étoile par étoile

> **Ce §4 a été CORRIGÉ dans la même session, au vu du rendu.** Première rédaction : « le cerveau
> et les matières, rien d'autre », au motif qu'il n'y aurait ainsi **aucune requête de plus** et
> qu'on réemploierait l'animation d'arrivée telle quelle. Livré, puis regardé : **ça ne fait pas
> l'effet.** Deux planètes qui glissent dans une bande de 190 px ne sont pas une galaxie qui
> grandit, et l'arrivée ne jouant qu'**une fois par session**, la page redevenait inerte dès la
> deuxième visite — exactement ce que cet addendum voulait corriger. Le raisonnement était
> économe et le résultat manquait la cible.

L'Accueil rend la **même construction que la modale** : les étoiles s'allument une par une depuis
`root`, matières et chapitres naissant juste avant leur première notion.

- **Une seule implémentation**, le hook `useGalaxyGrowth`, partagée avec la modale. Le rejeu est
  plein de pièges déjà payés — le principal étant de **ne pas recalculer le graphe sur
  l'horloge** — et les dupliquer serait les repayer.
- **Elle rejoue à chaque montage de l'Accueil**, et c'est l'objet même de la décision : une
  animation qui ne joue qu'une fois par session ne rend pas une page vivante.

⚠️ **Tension assumée avec le §6 de l'addendum ADR-0029** (« aucune animation ne démarre sur une
surface que Massimo n'a pas ouverte pour elle »). L'Accueil est l'**exception**, et elle est
écrite ici pour ne pas être découverte comme une incohérence dans six mois. Ce qui rend
l'exception tenable : le mouvement dure ~5 s, ne masque rien, ne demande rien, et n'a rien à
fermer.

⚠️ **Coût révisé : DEUX requêtes de plus** (`galaxy/all` et la frise avec `?with_skills=true`).
Elles partent **après la première peinture**, en même temps que le chunk 3D, et ne retardent donc
rien de ce que Massimo lit. La promesse « zéro requête de plus » de la première rédaction **ne
tient plus** — elle est remplacée par « rien avant la première peinture », qui est vérifié par
test.

⚠️ **Portée de session distincte** (`accueil` / `galaxy`) : conservée pour l'animation d'arrivée
de `/galaxy`, que l'Accueil ne doit pas consommer.

### 5. `prefers-reduced-motion` et absence de WebGL → **la carte statique, point**

Aucun canvas monté du tout. Ce n'est pas un réglage de confort (ADR-0024 §6).

### 6. Le test de budget **change de nature**, il ne disparaît pas

`accueil.bundle.test.ts` interdisait **tout** `import()` du moteur 3D depuis l'Accueil. Cet
interdit-là n'a plus de sens ; ce qui en garde, c'est que le montage reste **rare, nommé et
différé**.

| ce qui est vérifié | avant | après |
|---|---|---|
| aucun import **synchrone** du moteur 3D | ✅ | ✅ **inchangé** |
| aucun fichier atteignable n'importe `three` | ✅ | ✅ **inchangé** |
| contre-épreuve du détecteur sur `/galaxy` | ✅ | ✅ **inchangé** |
| garde-fou du test lui-même | ✅ | ✅ **inchangé** |
| `import()` du moteur 3D | **interdit** | **liste blanche** (`HomeGalaxyCard`) |
| le point de montage le fait bien en `import()` | — | ✅ **cas ajouté** |

Ce que ce test protège encore, et qui est l'essentiel : qu'un **troisième** point de montage
n'apparaisse pas sans que personne ne le voie. C'était le mode exact de la régression de juillet.

## Conséquences

**Positives**

- L'Accueil est **vivant**, et c'est ce que l'addendum « Accueil vivant » cherchait sans y arriver.
- **Zéro requête réseau de plus** : le ciel se construit sur des données déjà là.
- Aucune chorégraphie nouvelle : c'est l'arrivée de `/galaxy`, réemployée.

**Négatives, assumées**

- **1,37 Mo repartent vers l'Accueil** — différés, jamais bloquants pour le premier rendu, mais
  téléchargés. Sur une connexion lente, c'est de la bande passante que Massimo ne demandait pas.
- **La décision du matin est révoquée le soir même.** Quatre addenda à l'ADR-0024 en une journée.
- **Une troisième surface monte `GalaxyCanvas`** (Accueil, `/galaxy`, modale de rejeu). Chaque
  changement du canvas se vérifie désormais à trois endroits.
- **Le garde-fou est plus faible** : une liste blanche se rallonge plus facilement qu'un zéro ne
  se franchit. C'est le prix d'un montage devenu légitime.

## Read-before-code

Sans objet — cet addendum a été **écrit après l'implémentation**, dans la même session, sur un
constat d'usage. Les points de vigilance sont dans le code, aux endroits concernés.

## Corollaires documentaires

- `adr-0024-addendum-galaxie-page-dediee.md` §B — marquer la révocation.
- `page-accueil.md` — la carte redevient un ciel.
- `zetis-galaxy.md` §11 — l'Accueil rejoint la liste des surfaces montant le canvas.
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` et `DATA_MODEL.md` **inchangés**.

## Hors périmètre

La mesure de tenue sur les trois appareils (dette de l'addendum « Galaxie animée », **inchangée et
maintenant plus pressante** : l'iPhone doit tenir la 3D sur sa page d'entrée) ; le rejeu depuis
l'Accueil, qui reste dans sa modale.
