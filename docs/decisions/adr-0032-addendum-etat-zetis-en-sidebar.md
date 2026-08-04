# Addendum ADR-0032 — §7 · L'état de ZETIS se lit sans ouvrir les Paramètres

> À concaténer à la fin de `docs/decisions/adr-0032-paliers-autonomie-zetis.md`.
> Statut : **Accepté — 2026-08-04**. Ne rouvre aucune des décisions §1–§6.
> Complète le §6 (« ce que le panneau ne fera jamais ») par ce que la **sidebar** fera — et par
> les quatre choses qu'elle ne fera jamais non plus.
> Emprunte son second axe à l'**ADR-0035 §5** (`auto_trigger_enabled`).
> N'ouvre aucune décision de l'**ADR-0030** : le témoin d'état n'est pas un témoin de nouveauté,
> et le §7.5 dit pourquoi il ne doit surtout pas lui ressembler.

## Contexte

L'ADR-0032 a livré un régime réglable et un régime **dérivé** (`preset`), mais **aucune surface de
lecture hors de `/parametres`**. Papa change de page vingt fois par session ; savoir dans quel
régime ZETIS travaille lui coûte à chaque fois de quitter ce qu'il fait.

Ce n'est pas un simple confort. L'ADR-0035 §5 a livré un **second axe** — `auto_trigger_enabled` —
qui rend le régime, à lui seul, **insuffisant** pour répondre à la seule question que Papa se pose
vraiment : *« est-ce que ZETIS travaille tout seul en ce moment ? »*

Le §6 de l'ADR-0032 a écrit ce que le panneau ne ferait jamais. Il n'a rien dit de ce qui pourrait
se lire ailleurs, parce qu'à l'époque il n'y avait qu'un axe et qu'il tenait sur sa page. Sans cet
addendum, la sidebar afficherait un état **sans qu'aucun document ne dise lequel, ni ce qu'il n'a
pas le droit de faire** — et le premier relecteur y lirait une entorse au §6.

## Décision

### 7.1 — Deux axes, deux signes. Un signe unique mentirait.

La table de vérité, en toutes lettres, parce que c'est **elle** qui interdit le signe unique :

| Régime | Déclencheur | Ce que ça veut dire |
|---|---|---|
| Manuel | désarmé | ZETIS ne démarre pas, et ne sert rien sans vous |
| Manuel | **armé** | ZETIS **démarre seul** — mais tout passe devant vous |
| Autonome | **désarmé** | ZETIS sert seul — **mais il attend votre clic pour commencer** |
| Autonome | armé | ZETIS travaille et sert entièrement seul |

**Deux lignes sur quatre** sont invisibles à un signe unique. Un avatar « pleinement autonome »
affiché sous *Autonome + désarmé* dirait à Papa que ZETIS produit tout seul alors que **rien ne
partira sans son clic** — c'est exactement le mensonge d'écran que `page-parametres.md` §États
proscrit sur la page des réglages, et il coûte ici plus cher, parce que la sidebar est visible
partout.

**Donc :** l'avatar porte le **régime**, un micro-témoin textuel porte le **déclencheur**, et un
point qui orbite l'avatar le double visuellement. **Aucun des deux ne se déduit de l'autre**, et
c'est la raison d'être de la séparation — la même que celle du §5 de l'ADR-0035 (« deux questions,
deux sources »), rendue visible.

### 7.2 — Le halo est gradué par le régime

| Régime | Halo |
|---|---|
| Manuel | fixe — rien ne bouge |
| Semi-autonome | un souffle de 4 s |
| Autonome | le souffle **et** une rotation de 6 s |

**L'échelle du mouvement suit l'échelle qu'elle signale.** Le régime le plus prudent est le plus
silencieux. C'est le seul endroit du dépôt où une animation **porte de l'information** plutôt que
de décorer — et c'est pour cette raison qu'elle est graduée et non uniforme.

⚠️ `prefers-reduced-motion` **fige tout sans rien retirer** : le halo reste, le point reste, seul
le mouvement part. Couper l'animation effacerait le signal ; le parti pris est celui de
`couverture-breathe`, qui garde son halo et perd son battement.

### 7.3 — La sidebar LIT. Elle ne règle pas.

Le bloc est un **lien vers `/parametres`**, rien d'autre. Aucun réglage ne se change depuis là :
un régime ne doit pas pouvoir bouger d'un clic dans un coin d'écran, quand la page dédiée exige
elle-même un bouton « Enregistrer » explicite (§États : *« un réglage d'autonomie ne se change pas
par inadvertance au survol »*).

Corollaire : le régime affiché vient **toujours** du serveur (`preset`, dérivé par
`settings/service.py`). Le front ne le recalcule jamais, sous peine de créer la seconde source de
vérité que le §2 a refusée en interdisant de stocker un mode à côté des six clés.

### 7.4 — Ce que le bloc ne fera jamais

- **Aucun régime affiché avant la réponse du serveur.** Reprise littérale de la règle du §États —
  *un régime faux affiché une seconde est un mensonge*. Le chargement montre un squelette et un
  avatar **neutre**, qui ne désigne aucun régime.
- **Aucune valeur de repli à l'erreur.** Ni « Manuel » par prudence, ni la dernière valeur connue.
  Un état illisible se **dit** ; il ne se devine pas.
- **Aucun sondage.** Un appel au montage du layout, un rafraîchissement par écriture réussie. La
  règle de l'ADR-0030 s'applique telle quelle, et son test-verrou est recopié.
- **Aucune surface côté Massimo** (rappel du §6, inchangé).

**Coût accepté, écrit plutôt que découvert** : si Papa change le régime dans un **second onglet**,
la sidebar du premier reste périmée jusqu'au rechargement. C'est la conséquence directe de
l'absence de sondage, et elle est préférable à une requête toutes les N secondes sur les 22 pages.

### 7.5 — Ce témoin n'est pas un témoin de nouveauté (ADR-0030)

L'ADR-0030 §6 réserve la sidebar Papa aux **files de validation** — du travail que Papa a lui-même
demandé — et leur donne l'**ambre**. Un état de régime n'est pas une file : il ne se compte pas, il
ne décroît pas, il n'attend rien de personne.

Conséquences, pour que les deux objets ne se confondent jamais à l'œil :

- **pas d'ambre** dans le bloc d'état — elle reste la couleur des files ;
- **pas de pastille chiffrée** — le §F.2 interdit tout total de provenance, et un régime n'est pas
  un nombre ;
- l'interdiction d'animation du §6 de l'ADR-0030 vise **les badges de nouveauté** (« ce badge
  informe, il n'alerte pas ») et **ne s'étend pas** ici : le halo n'attire pas vers une action, il
  **est** l'information.

### 7.6 — L'exception chromatique, écrite pour ne pas être lue comme un bug

L'illustration du régime *Autonome* est **rouge**. Or le rouge, dans ce dépôt, veut dire refus ou
erreur (les boîtes d'erreur du panneau), et l'ambre veut dire file de validation (ADR-0030).

**L'exception est assumée et bornée** : dans ce bloc, le rouge veut dire *« ZETIS a tous les
droits »*, pas *« quelque chose a cassé »*. Elle ne tient qu'à trois conditions, qui font partie de
la décision :

1. le **halo** d'Autonome est indigo→fuchsia, **jamais rouge** — il ne double pas la teinte de
   l'image, il la corrige ;
2. l'état **d'erreur** du bloc est en **gris muet**, sans une seule classe rouge — sinon les deux
   messages deviennent indiscernables ;
3. aucun autre rouge n'entre dans le bloc.

Échappatoire nommée, si le rouge se lit malgré tout comme une alarme à l'écran : une règle CSS de
teinte sur la seule image d'Autonome — **réversible, sans retoucher l'asset**.

### 7.7 — Le vocabulaire des avatars l'emporte à l'écran ; celui du serveur, dans la donnée

Les images portent leurs propres mots, cuits dans le pixel : **MANUEL**, **HYBRIDE**, **FULL ZETIS
AUTONOME**. Le §3 de l'ADR-0032, lui, dit *Manuel · Semi-autonome · Autonome*. Deux vocabulaires
pour trois régimes.

**Décision : à l'écran, ce sont les mots des avatars.** Les trois libellés deviennent **Manual ·
Hybrid · Autonom**, dans la sidebar **et** sur la page des réglages — une seule constante, donc
une seule vocabulaire. Motif : le régime a un **visage** avant d'avoir un mot, et un écran qui
nomme autrement ce que l'image montre oblige à traduire mentalement à chaque coup d'œil.

⚠️ **Les CLÉS ne bougent pas** : `manuel | semi | autonome` viennent du serveur et sont l'identité
du régime. Renommer l'affichage n'est pas renommer la donnée — les deux ne se croisent qu'en un
seul point du code, et c'est délibéré. Les fichiers d'images suivent les **clés**
(`zetis-regime-semi`), pas les libellés : une divergence de vocabulaire ne doit jamais remonter
jusqu'à un identifiant.

> **Contre-motif maintenu au dossier.** Cette section a d'abord décidé l'inverse, le matin même :
> *« le vocabulaire du code l'emporte, les libellés restent ceux du §3 »*, au motif qu'un mot
> illisible à 44 px ne justifie pas de renommer une interface. L'argument reste vrai sur la
> **sidebar** — et faux partout ailleurs : les mêmes libellés servent la page des réglages, où les
> cartes sont grandes et où le décalage se voit. Révoqué le 2026-08-04 par le commanditaire.
>
> Conséquence assumée : **les documents de décision et l'interface ne disent plus les mêmes mots.**
> Les ADR continuent d'écrire *Manuel · Semi-autonome · Autonome* — les réécrire reviendrait à
> corriger des décisions figées, ce que ce dépôt refuse. La correspondance est établie ici, une
> fois, et c'est le seul endroit où elle a besoin de l'être.

## Périmètre

**Dans :** un bloc de lecture en tête de la sidebar Papa, portant les deux axes ; le rafraîchissement
par événement ; les quatre rendus d'état (chargement, erreur, régime, sur mesure).

**Hors :**

- **la migration des deux pastilles héritées** de la sidebar Papa (missions à valider, demandes de
  Massimo), qui font encore leur propre appel réseau depuis le composant — voir Conséquences ;
- le **repli responsive** de la sidebar Papa, qui reste à largeur fixe (chantier distinct, celui
  déjà mené côté Massimo) ;
- toute **modification** d'un réglage depuis la sidebar (§7.3) ;
- toute surface côté Massimo (V1).

## Conséquences

### Positives

- La question *« est-ce que ZETIS travaille tout seul ? »* se répond **sans quitter sa page**, et
  elle se répond **juste** sur les quatre lignes de la table, pas sur deux.
- Le second axe de l'ADR-0035, jusqu'ici enterré sous une case à cocher en bas d'une page, devient
  **visible en permanence** — ce qui est cohérent avec le fait qu'il commande, à lui seul, si ZETIS
  démarre.
- Le régime cesse d'être une chose qu'on va vérifier : il devient une chose qu'on **sait**.

### Négatives / coûts assumés

- **La sidebar Papa porte désormais deux motifs contradictoires** : l'état d'autonomie arrive en
  *prop* depuis le layout (motif ADR-0030), tandis que les deux pastilles héritées font encore leur
  propre appel au montage. Ces deux pastilles **n'ont aucun test aujourd'hui** ; les migrer au
  milieu de ce chantier, c'est refactorer du code non couvert dans une feature — la façon canonique
  de livrer une régression silencieuse sur *missions à valider* et *demandes de Massimo*. Chantier
  **nommé, daté, pas oublié**. En attendant, le verrou fort de l'ADR-0030 (« la sidebar ne fait
  aucun appel réseau ») est ici **réduit** à « la sidebar ne lit jamais l'autonomie elle-même », et
  le verrou fort est porté par le composant d'état, qui est pur.
  ⚠️ Ce chantier **n'aggrave pas** la dette : l'état passe par le layout dès le premier jour — le
  compte d'appels dans la sidebar reste à trois, il ne monte pas à quatre.
- **Trois animations simultanées** (souffle, rotation, orbite) vivent en permanence dans le coin de
  l'œil, sur les 22 pages. C'est plus que tout ce que ce dépôt s'est autorisé jusqu'ici —
  `CouvertureIcon` refuse explicitement de faire respirer son icône **en sidebar**, au motif qu'un
  halo qui pulse à petite taille devient un clignotement parasite. Atténué (44 px et non 20, flou,
  opacité plafonnée, **rien du tout pour Manuel**), mais **la mesure est à faire à l'œil après
  livraison** : si ça distrait, le correctif est de **ralentir** (doubler les durées), pas de
  retirer l'axe.
- **`preset: null` (« Sur mesure ») est rendu et reste inatteignable par l'API** : seules deux
  classes sont libres et la monotonie interdit le quatrième couple. Le rendu existe pour le jour où
  une septième classe entrerait dans les préréglages. **Son test unitaire est sa seule preuve** — et
  c'est écrit ici pour que personne ne le supprime en le croyant mort.
- Le mot **HYBRIDE** reste cuit dans une image livrée (§7.7).

## Suivi

**Tests-verrous exigés** (un verrou muté est un verrou prouvé) :

1. **Rien n'est affiché avant la réponse serveur** : à l'état de chargement, aucun des quatre
   libellés (*Manuel, Semi-autonome, Autonome, Sur mesure*) n'est dans le DOM, et le halo est
   **absent**, pas invisible.
2. **Le déclencheur désarmé n'affiche JAMAIS « démarre seul »**, régime *Autonome* compris — et le
   point orbitant est **absent du DOM**.
3. **Le symétrique** : *Manuel* + armé affiche « démarre seul » **et** le point. Les deux ensemble
   prouvent que les axes sont indépendants ; l'un seul ne prouve rien.
4. **Aucun sondage** : 60 s de timers avancés sans événement → toujours **un** appel. Copie du
   verrou ADR-0030.
5. **Un enregistrement refusé n'émet rien** — un refus ne change pas d'état, et faire relire la
   sidebar serait un appel de plus sans fait de plus.
6. **Les libellés ne sont pas redéclarés** : le test compare à la constante importée. Une recopie
   en dur casse.
7. **La sidebar ne lit jamais l'autonomie elle-même** (verrou réduit, cf. Conséquences), et le
   composant d'état ne fait **aucun** appel réseau, dans aucun de ses états.

**Observation attendue après livraison** : si Papa cesse d'ouvrir `/parametres` pour vérifier — ce
qui est le but — alors la page ne sert plus qu'à **changer** le régime, et son bloc « où vous en
êtes » devient redondant. Ce serait le signe qu'il faut alléger la page, pas enrichir la sidebar.
