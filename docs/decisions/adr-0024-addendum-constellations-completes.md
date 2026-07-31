# ADR-0024 — Addendum « Constellations complètes » : tout est là, et tout tourne autour du centre

## Statut

Accepté — 2026-07-31 (soir).

> **Addendum, pas nouvel ADR.** Il **révoque le §C** du premier addendum
> (`adr-0024-addendum-galaxie-page-dediee.md`), qui réduisait la vue par défaut de `/galaxy` au
> cerveau et aux matières.
>
> ⚠️ **Cinquième addendum à l'ADR-0024 en une journée**, et le **deuxième** à révoquer une
> décision prise le matin même. Ce n'est pas un signe de santé : le chantier Galaxy aura été cadré
> en marchant. Ce qui rend celui-ci défendable, et qu'il faut lire avant de conclure à
> l'inconstance : **le §C n'était pas une erreur de jugement, c'était une décision correcte sous
> une contrainte qui n'existe plus.**

## Contexte

Le §C avait été pris **au vu du rendu réel**, et son constat était juste : servir tout le graphe
produisait un **amas** — le cerveau à moitié enseveli sous les sphères, les libellés superposés,
aucune lecture possible. La vue par défaut avait donc été réduite à `root` + `subject`.

Ce que le §C attribuait au **nombre de nœuds** venait en fait de la **convergence**. Un moteur de
forces cherche un équilibre, pas une composition : quel que soit le nombre de nœuds, il les
tasse là où les forces s'annulent, sans égard pour la lisibilité.

Deux livraisons du même jour ont retiré cette contrainte, chacune pour ses propres raisons :

- l'addendum « Galaxie animée » §3 a posé les matières sur des orbites **calculées**, moteur
  éteint ;
- l'addendum ADR-0029 §2 réécrit a généralisé le mécanisme — positions calculées, nœuds
  **épinglés** (`pinned`), forces à zéro — pour que le rejeu puisse pousser sans ré-exploser.

Le filtre du §C protégeait donc contre un défaut qui **ne peut plus se produire**.

## Alternatives considérées

- **Garder le filtre et laisser les notions dans les constellations.** C'est l'état du matin. Mais
  Massimo doit **ouvrir une matière** pour voir ses étoiles : la carte d'ensemble ne montre jamais
  sa progression réelle, seulement le sommaire du programme. → Écarté.
- **Tout afficher, mais en rallumant le moteur de forces** maintenant qu'on maîtrise mieux le
  rendu. → **Écarté, et c'est le piège à ne pas retomber** : c'est littéralement l'amas du §C.
  C'est **parce qu'on ne rallume pas les forces** que tout peut être montré.
- **Tout afficher en orbites EMBOÎTÉES** (chapitres autour de leur matière, notions autour de leur
  chapitre), positions calculées et épinglées. **Essayé et écarté au vu du rendu** : on ne voyait
  plus le centre, seulement des petits amas dispersés. → Écarté.
- **Tout afficher sur des anneaux CONCENTRIQUES autour du centre**, un par étage, chaque matière
  gardant son secteur angulaire. → **Retenu.**

## Décision

### 1. La vue par défaut rend la **galaxie entière**

Le cerveau, les matières, leurs chapitres, leurs notions. Le filtre `root` + `subject` de
`solarSystemOf` est **supprimé** ; la fonction garde son autre rôle, qui n'a jamais eu de rapport
avec la performance : donner sa planète à chaque matière, **y compris celles qui sont encore
vides**.

### 2. Trois anneaux **concentriques**, tous **calculés**

> **Corrigé au vu du rendu, dans la même session.** Première version : orbites **emboîtées** —
> les chapitres autour de LEUR matière, les notions autour de LEUR chapitre. Lisible sur le
> papier, illisible à l'écran : on ne voyait plus le centre, seulement des petits amas dispersés.
> Tout gravite désormais autour du **même** centre.

| anneau | qui s'y trouve | rayon |
|---|---|---|
| 1 | les matières | 150 |
| 2 | les chapitres | 260 |
| 3 | les notions | 370 |

**Ce qui garde l'arbre lisible malgré les anneaux communs** : chaque matière reçoit un **secteur
angulaire**, et tous ses descendants restent dedans. On lit donc une part de tarte par matière,
du centre vers le bord — **la hiérarchie se lit en RAYON, l'appartenance en ANGLE**. Un espace est
laissé entre deux parts (78 % du secteur occupé) : sans lui, les matières voisines se touchent et
l'appartenance redevient illisible.

⚠️ Le nombre d'anneaux ne dépend **pas** du nombre de matières : il y en a trois, toujours — un
par étage. C'est ce qui distingue cette vue du système solaire du §C, où chaque matière avait son
orbite.

**Déterministe**, comme tout le reste : la galaxie de Massimo est la même à chaque visite, sinon
ce n'est pas la sienne. Aucun `Math.random`.

### 3. L'arrivée sort chaque constellation **d'un seul tenant**

Tout ce qui descend d'une matière porte **le rang de sa matière** (`arrivalOrder`). Sans ça, les
nœuds sortiraient du centre un par un et la constellation se **disloquerait en vol**.

La durée se compte en **rangs distincts**, pas en nœuds : cent notions d'une même matière arrivent
ensemble et n'allongent pas la chorégraphie d'un cran chacune.

### 4. Ce qui **ne change pas**

- Les **forces restent éteintes**. ⚠️ Ne pas les rallumer « maintenant qu'on sait faire » : le
  raisonnement est exactement inverse.
- Le **plafond de nœuds reste supprimé** (addendum « Galaxie animée » §1), et les **trois gardes**
  qui l'ont remplacé sont désormais plus utiles que jamais — c'est le flux doré qui tombe si un
  appareil décroche, jamais une étoile.
- Aucun contrat serveur touché : `GET /api/student/galaxy/all` servait **déjà** tout le graphe.
  Le filtre était **client**. Zéro route, zéro schéma, zéro migration.

## Conséquences

**Positives**

- La carte d'ensemble montre enfin **la progression réelle** de Massimo, et pas seulement le
  sommaire du programme. C'était l'intention de l'ADR-0024 depuis le début.
- Une **incohérence disparaît** : on avait supprimé un plafond « parce qu'il cachait la
  progression », tout en gardant un filtre qui cachait davantage.
- Le mécanisme est **celui déjà éprouvé** trois fois dans la journée. Rien de neuf à maintenir
  hors la fonction de disposition.

**Négatives, assumées**

- **Beaucoup plus de nœuds à l'écran** sur la vue par défaut. Rien ne converge, donc rien ne
  s'entasse — mais la **lisibilité à plusieurs centaines de notions n'a pas été vue en vrai**.
  C'est le point à regarder en premier.
- **Deuxième décision du matin révoquée le soir.** Cinq addenda en une journée.
- **La dette de mesure devient critique.** L'iPhone doit désormais tenir la galaxie **complète**
  sur `/galaxy` — et l'Accueil en montre déjà une. Si ça ne passe pas, ce sont les **particules**
  qui tombent, pas les nœuds.

## Corollaires documentaires

- `adr-0024-addendum-galaxie-page-dediee.md` §C — marquer la révocation.
- `zetis-galaxy.md` — la vue par défaut change de définition.
- `DECISIONS.md`, `CHANGELOG.md`. `API_SPEC.md` et `DATA_MODEL.md` **inchangés**.

## Hors périmètre

La mesure sur les trois appareils (dette ouverte, et plus pressante que jamais) ; le niveau de
détail adaptatif (montrer les notions seulement au-delà d'un certain zoom), qui serait la vraie
réponse si la lisibilité ne tenait pas — mais qui ne se décide **pas** avant d'avoir regardé.
