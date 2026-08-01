# ADR-0024 — Addendum « Galaxie animée » : tout voir, et voir ça arriver

## Statut

Accepté — 2026-07-31.

> **Addendum, pas nouvel ADR.** Il **révise le §6** (plafond de nœuds) et **complète le §C** du
> premier addendum (`adr-0024-addendum-galaxie-page-dediee.md`) : celui-ci décide **ce qui est
> rendu** sur la vue par défaut — le cerveau et les matières seules ; celui-ci ajoute **comment ça
> arrive**. Aucun mécanisme nouveau, aucune donnée nouvelle, aucune route.
>
> ⚠️ Troisième addendum à l'ADR-0024 en une journée, après quatre amendements. C'est écrit ici
> pour être lisible, pas pour être répété.

## Contexte

Deux demandes du même échange, qui n'ont l'air que d'une seule :

1. **« Supprimer les limites de nœuds pour tous les voir. »**
2. **« Elle doit se construire comme quand on anime un graphe Obsidian. »**

Ce que le read-before-code documentaire a établi :

- **Deux limites distinctes étaient confondues.** `GALAXY_MAX_NODES` (40 / 90 / 150) borne les
  **constellations**. Ce qui borne la **vue par défaut**, c'est tout autre chose : le §C, révisé
  le matin même **au vu du rendu réel**, filtre la charge utile **côté client** pour ne garder que
  `root` et `subject`. Supprimer le plafond ne change **rien** à cet écran.
- **Le plafond n'a jamais été mesuré.** L'ADR-0024 §6 le dit : valeurs **provisoires**, « seul le
  MacBook a été vérifié ». La dette est ouverte depuis le 2026-07-28.
- **Son repli — « on n'affiche que les amas et on déplie un chapitre à la demande » — n'apparaît
  dans aucun livrable de la slice B**, et le §C note que le plafond « ne mord plus jamais » sur la
  vue par défaut. Forte présomption de **code jamais atteint, voire jamais écrit**. À constater
  avant de supprimer (§Read-before-code).
- **La vue par défaut n'est pas un équilibre.** Le §C est explicite : les planètes sont **posées**
  sur des orbites dessinées, « un placement calculé, pas un équilibre ». Un moteur de forces
  cherche une position stable, pas une composition.

## Alternatives considérées

- **Rallumer le moteur de forces sur la vue par défaut** pour obtenir le mouvement d'Obsidian.
  C'est littéralement l'amas refusé le matin même : le cerveau à moitié enseveli, les libellés
  superposés. → **Écarté.**
- **Abaisser le plafond après mesure au lieu de le supprimer.** La mesure n'a jamais eu lieu, et
  le principe reste indéfendable : le repli **cache à Massimo une partie de sa propre
  progression**, selon un critère qui n'a rien de pédagogique — la taille de son écran. → Écarté.
- **Supprimer le plafond sans rien mettre à la place.** Remplace une supposition par une autre.
  → Écarté.
- **Supprimer le plafond avec des gardes ciblées, et animer l'arrivée par tween sur le placement
  calculé.** → **Retenu.**

## Décision

### 1. `GALAXY_MAX_NODES` est **supprimé**, avec son repli

Constante, paliers, branches de repli : tout part. Trois motifs, chacun suffisant :

- il **cache la progression de l'enfant** selon un critère matériel ;
- ses valeurs n'ont **jamais été mesurées** — ce n'est pas une protection éprouvée, c'est une
  supposition ;
- il **ne mord plus** sur la vue par défaut depuis la refonte en système solaire.

⚠️ **Ce qui borne le volume sur la vue par défaut reste le §C** — filtre client `root` + `subject`,
huit planètes. **Il n'est pas touché** : c'est une décision prise sur rendu réel, pas sur
supposition. Ne pas la « rouvrir » en croyant appliquer le présent §1.

### 2. Trois gardes remplacent le plafond — et elles visent le vrai coût

- **Les particules, pas les nœuds.** `linkDirectionalParticles` anime un objet **par lien à chaque
  frame** : c'est ce qui tue le framerate, pas des sphères statiques. Le flux doré est plafonné en
  **nombre de particules** et coupé sous un seuil de FPS. **Jamais** un plafond de nœuds déguisé.
- **Moteur arrêté après stabilisation** (`cooldownTicks`) : une simulation qui tourne
  indéfiniment brûle le CPU du téléphone pour rien. La rotation caméra continue — elle est quasi
  gratuite.
- **Le repli sans WebGL reste intact** (liste des notions par chapitre). C'est lui, le vrai filet.

### 3. L'arrivée de la vue par défaut est un **tween**, pas une convergence

Le cerveau apparaît **seul**. Puis les matières **naissent au centre** et rejoignent leur créneau
orbital. Le trait d'orbite se trace **derrière** la planète, jamais avant.

| constante | valeur | rôle |
|---|---|---|
| `CORE_IN` | 420 ms | apparition du cerveau, seul |
| `PLANET_STAGGER` | 80 ms | décalage entre deux matières |
| `PLANET_TRAVEL` | 700 ms | trajet centre → créneau, `easeOutCubic` |
| `ORBIT_DRAW` | 600 ms | tracé de l'orbite, à l'arrivée de sa **première** planète |

Total ≈ **1,3 s**, puis la rotation lente déjà acquise (`autoRotate`, ~50 s/tour).

**L'ordre est celui du programme.** Pas l'ancienneté, pas le nombre d'étoiles. Un ordre
chronologique ferait de cet écran un mini-rejeu et introduirait un **classement implicite** —
le §5 l'interdit.

**Une fois par visite.** L'arrivée joue à l'entrée sur `/galaxy`, **pas au retour d'une
constellation** : revoir la même chorégraphie à chaque aller-retour, c'est l'animation subie qu'on
bannit partout ailleurs. Un flag de session suffit ; le retour restitue la composition d'emblée.

`prefers-reduced-motion` → **composition finale immédiate**, aucun trajet, aucune rotation.

⚠️ **Piège d'implémentation.** Si le placement orbital fixe `fx/fy/fz`, le nœud y est **téléporté**
dès l'affectation : aucun trajet possible. N'affecter `fx/fy/fz` qu'**à l'arrivée**, animer
`x/y/z` avant. Le moteur reste éteint : c'est un tween, pas une convergence.

### 4. Ce que l'arrivée ne fera jamais

- Un ordre **chronologique** ou **par volume**.
- Rejouer à chaque retour de constellation.
- Une orbite dessinée **avant** que sa planète y soit.
- Un **nombre** pendant l'arrivée : ni compteur, ni pourcentage, ni date.

## Conséquences

**Positives**

- Massimo voit **toute** sa progression, sur les trois appareils. Plus rien n'est caché par la
  taille de l'écran.
- La vue par défaut gagne une entrée en matière **sans changer ce qu'elle rend** : le §C tient
  intact.
- Une constante non mesurée et une branche probablement morte quittent le dépôt.

**Négatives, assumées**

- **Le filet de sécurité change de nature** : on passe d'un plafond dur (qui n'a jamais servi) à
  des gardes qualitatives (particules, `cooldownTicks`). Si le téléphone décroche, la correction
  sera moins immédiate qu'un chiffre à baisser.
- **Une chorégraphie de plus à maintenir**, et un flag de session à ne pas oublier.
- **La dette §6 ne se ferme pas.** Voir ci-dessous.

## Dette reformulée, pas éteinte

La mesure sur les **trois appareils** de Massimo reste due — et elle doit se faire sur un **pire
cas semé** (référentiel validé complet, plusieurs centaines de notions dans une constellation),
pas sur les ~37 étoiles d'aujourd'hui. **L'iPhone tranche.** S'il ne suit pas, ce sont les
**particules** qui tombent, pas les nœuds.

## Read-before-code

1. **Où vit `GALAXY_MAX_NODES`** : constante + tous les usages. Si les seuls résultats sont la
   déclaration et un `slice()`, c'est trois lignes à effacer.
2. **Le repli « amas + dépliage » existe-t-il en code ?** Chercher `cluster`, `collapse`,
   `deplier`. S'il existe, il part avec. S'il n'existe pas, le dire dans le rapport de session —
   c'est un écart doc/code à corriger dans `zetis-galaxy.md`.
3. **Où vit le filtre client `root` + `subject`** (page, hook, ou `GalaxyCanvas`). S'il est dans le
   canvas, le **remonter en prop** plutôt que le supprimer — sinon on casse la vue système solaire
   en réparant le rejeu (cf. addendum ADR-0029).
4. **Le placement orbital passe-t-il par `fx/fy/fz` ?** C'est ce qui décide si l'animation est
   trois lignes ou une reprise du placement.

**Stop-on-blocker** : si le plafond est appliqué **côté serveur** (troncature de la charge utile
dans `galaxy/service.py`), le supprimer change le contrat des routes élève. La slice s'arrête et
remonte pour arbitrage.

## Corollaires documentaires

- `zetis-galaxy.md` §9 (plafond adaptatif) et §11 (interaction) — le tableau des paliers disparaît,
  les trois gardes le remplacent.
- `adr-0024-zetis-galaxy-progression.md` §6 — marquer la révision dans la liste des amendements.
- `page-accueil.md` — **non concerné** (l'Accueil ne monte pas le canvas).
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` **inchangé** : aucun contrat touché.
- Maquette : `docs/frontend-massimo/mockup/mockup-page-galaxy-animations-v1.html`, écran A.

## Hors périmètre

Le contenu de la galaxie (prérequis, persistance des positions) ; la modale de rejeu, traitée par
l'addendum ADR-0029 ; la réconciliation de `navigation.md`.
