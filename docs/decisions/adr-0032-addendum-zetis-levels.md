# Addendum ADR-0032 — §8 · ZETIS LEVELS : le réglage passe en tête, et il dit ce qu'il fait

> À concaténer à la fin de `docs/decisions/adr-0032-paliers-autonomie-zetis.md`, après le §7.
> Statut : **Accepté — 2026-08-04**.
> ⚠️ **RÉVOQUE une décision écrite** — la primauté du bloc « où vous en êtes » sur le réglage
> (§Contexte, relayé par `docs/frontend-papa/page-parametres.md` §Principes et par un test-verrou
> commenté « l'ordre est la décision »). Voir §8.1, qui garde le contre-motif au dossier.
> Ne rouvre ni le §F.2 (aucun compteur), ni le §6, ni aucune décision §1–§5, ni le §7.

## Contexte

Le panneau d'autonomie a été dessiné pour **désarmer une illusion** : Papa croyait valider, il
servait déjà. D'où sa structure — un constat d'abord, un réglage ensuite.

Deux choses ont changé depuis.

**L'illusion est levée.** Le §7 a posé l'état de ZETIS en tête de sidebar, visible sur les 22 pages.
Papa n'a plus besoin d'ouvrir `/parametres` pour savoir où il en est — c'était le but, et
l'Observation attendue du §7 l'avait prévu : *« la page ne sert plus qu'à changer le régime, et son
bloc "où vous en êtes" devient redondant »*.

**Le panneau ne dit toujours pas ce qu'il fait.** Trois cartes, trois phrases de prose, et rien qui
montre ce qu'un niveau **déplace** réellement. Papa choisit un mot, pas un effet. C'est le défaut
que le §Contexte n'avait pas vu, parce qu'à l'époque le problème était de *montrer l'état*, pas de
*rendre le réglage lisible*.

## Décision

### 8.0 — Deux mots, deux objets : **niveau** et **palier**

Ce chantier a introduit « ZETIS LEVELS » à l'écran, à côté d'un mot qui existait déjà pour tout
autre chose. La convention est fixée ici, **une fois**, et vaut pour tout le dossier ADR-0032 :

| Mot | Ce qu'il désigne | Valeurs | Où il vit |
|---|---|---|---|
| **niveau** (*level*) | l'un des **trois régimes** | `manuel · semi · autonome` → *Manual · Hybrid · Autonom* | à l'écran, et dans le code sous le nom `preset` |
| **palier** | le degré d'autonomie **d'une classe** | `0` Jamais · `1` ZETIS propose · `2` Vous validez · `3` ZETIS sert | dans les six clés d'`app_settings`, et dans le code sous le nom `level` |

Le test qui les sépare : **un niveau se choisit, un palier se subit.** Papa clique un *niveau* ;
celui-ci décide les *paliers* de deux classes, et les quatre autres ne l'écoutent pas.

⚠️ **Le code dit l'inverse, et c'est délibérément non touché** : le type TypeScript s'appelle
`AutonomyLevel` alors qu'il porte un **palier** (0-3), et les trois régimes s'y appellent `preset`.
Renommer traverserait `packages/types`, le client d'API et toutes les pages de réglage — un refactor
transversal pour un gain de lecture. **La correspondance est établie ici, et c'est le seul endroit
où elle a besoin de l'être** — même traitement que le §7.7 pour *Manuel / Manual*.

> **Règle pratique pour la suite** : dans un document, `LEVEL_LABEL[…]` se lit *« le libellé du
> palier »*, jamais *« le libellé du niveau »*. Et une phrase comme « le niveau de cette classe »
> est fautive : une classe a un **palier**.

### 8.1 — Le réglage passe en tête. Le constat le suit, dans le même objet.

La section devient **« ZETIS LEVELS »** et occupe la **première** place du panneau. Sous les trois
cartes, un **panneau unique** montre le détail du niveau sélectionné — et **au repos, il montre le
niveau actuel**.

C'est une **révocation partielle, et la nuance est la décision** : on révoque la **lettre** (la
position du bloc), on garde l'**esprit** (Papa voit où il est sans le chercher). Le constat n'est
pas relégué : il devient l'**état par défaut** du panneau de réglage. Les deux questions — *où
suis-je* et *qu'est-ce que je changerais* — se répondent dans la même surface, parce que la seconde
n'a de sens que rapportée à la première.

> **Le contre-motif reste au dossier, parce qu'il est juste.** Le §Contexte écrivait : *« Le premier
> travail de ce panneau n'est donc pas de laisser Papa monter : c'est de lui montrer où il est
> déjà. Un écran qui propose "Laisser ZETIS servir" à quelqu'un qui sert déjà sans relecture serait
> un mensonge de plus. »* Cette phrase reste vraie. Ce qui change, c'est qu'une garantie
> **positionnelle** devient une garantie **d'état par défaut** — plus faible, parce qu'elle suppose
> que Papa lise le panneau plutôt qu'il ne le rencontre. Si l'observation montre qu'il change de
> niveau sans le lire, l'objection aura eu raison et il faudra revenir.

⚠️ La révocation est **conditionnée par le §7** : sans l'état en sidebar, elle ne serait pas
défendable. On ne déplace le constat que parce qu'il existe désormais ailleurs, en permanence.

### 8.2 — Le panneau est CALCULÉ, jamais rédigé

Pour chaque classe, l'écran compose deux données que le serveur envoie déjà :

```
libellé de la classe (cls.label)  →  libellé du palier (LEVEL_LABEL[palier])
palier = levelsForPreset(niveau)[cls.key] ?? cls.value
```

**Aucune prose décrivant une classe n'est écrite au front.** Ce n'est pas une préférence de style :
une table en dur *classe × régime* serait la matrice du §G.2 recopiée **sous une forme que le
serveur ne peut pas refuser**. Un 422 protège une valeur, jamais un texte. `PRESET_LEVELS` n'est
toléré que parce que le serveur arbitre quand même ; un miroir en prose n'aurait pas ce filet.

C'est la doctrine de `lib/settings.ts` appliquée à la lettre : *« recopier la matrice du §G.2 côté
front en ferait une seconde source de vérité, qui divergerait au premier ADR »*.

### 8.3 — Quatre lignes sur six ne bougent pas, et l'écran le DIT

Un préréglage n'écrit que **deux** classes — A0a et A1. Les quatre autres sont verrouillées et
identiques dans les trois niveaux. C'est le corollaire déjà écrit au §3 : *« il ne reste que DEUX
réglages libres en v1 »*.

Le panneau rend donc **deux groupes**, et le second n'est pas une omission mais une information :

- **Ce que ce niveau décide** — les deux classes libres, en pleine intensité, dont le palier change
  à la sélection.
- **Ce qu'aucun niveau ne change** — les quatre autres, en retrait, **avec leur motif serveur**.

Les taire ferait promettre à l'écran une richesse que la donnée n'a pas. Les noyer parmi les autres
ferait croire que tout bouge, et Papa chercherait un effet qui n'existe pas. Un cadenas dit
pourquoi — c'est déjà un principe de cette page.

### 8.4 — La modale garde l'ENREGISTREMENT, jamais le brouillon

**Choisir un niveau ne fait qu'afficher ce qu'il déciderait.** Aucune friction : un brouillon ne
coûte rien, et Papa doit pouvoir comparer les trois niveaux librement avant de trancher.

C'est **« Enregistrer »** qui ouvre la modale, et elle montre **ce qui va être écrit** — le panneau
du §8.2, tel qu'il est à l'écran.

> **Première version révoquée le jour même.** La modale s'ouvrait au clic sur une carte. Papa
> confirmait, puis devait *encore* cliquer « Enregistrer » : **deux validations pour une intention**,
> dont la première ne portait sur **rien d'irréversible**. Une confirmation qui garde un brouillon
> ne garde rien.

⚠️ La garde compare au **serveur**, pas au brouillon précédent : ce qu'on protège est l'écart qui va
être écrit, pas le chemin qui y a mené. Monter puis redescendre avant d'enregistrer ne déclenche
rien, et c'est juste — rien n'a changé.

⚠️ **TOUTE écriture se confirme, descente comprise** — et ça ne contredit *« on ne freine pas un
retour au contrôle »* que si l'on oublie ce qui a changé : la modale ne garde plus le **geste**,
elle garde l'**écriture**. Ce n'est plus une friction sur l'intention, c'est un récapitulatif de ce
qui va être écrit. Et un bouton « Enregistrer » qui ouvrirait parfois une modale et parfois non
serait **moins prévisible** qu'un bouton qui confirme toujours.

**Le motif d'origine est honoré par le TON, pas par l'absence :**

| Enregistrement | Modale |
|---|---|
| Rien à écrire | **aucune** — le bouton est désactivé |
| Descente | sobre — « Ces réglages **vous rendent du contrôle** ». Aucun ⚠️, aucune mise en garde |
| Montée ordinaire | sobre — « Ces réglages **retirent du contrôle** » |
| Montée du **cours** vers « ZETIS sert » | **la modale forte, inchangée** — « ⚠️ Vous retirez le dernier contrôle humain » |

Chaque modale porte **l'avatar du niveau visé** — le même que sur la carte et dans la sidebar :
Papa reconnaît ce qu'il s'apprête à devenir avant de lire la phrase.

**Son corps est l'ÉCART, pas le panneau.** La modale reprenait `NiveauDetail` — donc elle répétait
mot pour mot ce qui restait affiché **derrière elle**. Elle montre désormais, pour les seules
classes qui bougent, un **avant → après** : la seule chose que la page ne dit pas, puisque le
panneau n'affiche que l'état cible.

⚠️ **On ne confirme pas ce qui ne change pas.** Les classes verrouillées et celles qui restent en
place n'apparaissent nulle part dans la modale : elles sont du contexte de page.

⚠️ L'écart se calcule contre le **serveur**, pas contre un préréglage : le brouillon peut venir des
cartes **ou** du détail classe par classe, et c'est l'écriture réelle qu'on met sous les yeux.

La modale forte ne se dilue pas dans la nouvelle : elle est la seule qui garde au dossier la
révocation d'une décision écrite (le gel d'A1). Lui donner le même ton qu'à un passage en *Hybrid*
reviendrait à l'effacer par banalisation.

⚠️ *Pas d'auto-save* n'est pas rouvert : rien ne part sans que Papa clique « Enregistrer ». La
modale est le dernier pas de ce geste, pas un geste de plus.

⚠️ **Renoncer n'annule pas le brouillon** : Papa n'a pas retiré son intention, il a refusé de la
graver. L'écran garde ce qu'il avait choisi ; « Annuler » (le bouton de la page) reste le seul
moyen de revenir à l'état serveur.

### 8.5 — Ce que ce panneau ne fera jamais

- **Aucun compteur, aucun total, aucun ratio** (§F.2) : le panneau est qualitatif, classe par
  classe. La provenance est un fait, jamais un reproche.
- **Aucun chiffre recalculé.** Le constat daté — *2 contenus sur 33, le 2 août* — reste une mesure
  attachée à une observation. Il ne suit **pas** le niveau sélectionné : il dirait alors ce qui
  *serait* arrivé, et deviendrait une projection déguisée en fait.
- **Aucune ambre** : c'est la couleur des files de validation (ADR-0030 §6).
- **Aucune requête au changement de niveau** : tout se calcule sur des données déjà en main.

## Périmètre

**Dans :** l'ordre des blocs du panneau, le panneau de détail par niveau, la modale des montées, le
renommage de la section.

**Hors :** le bloc du veto et celui du déclencheur (intouchés, sauf leur position relative) ; le
`<details>` « Détail par type de contenu », qui reste le seul endroit où l'on règle **classe par
classe** ; toute évolution serveur — **aucune ligne de backend, aucune migration**.

## Conséquences

### Positives

- Papa choisit un **effet**, plus un mot. Les trois cartes portaient trois phrases de prose ; elles
  portent maintenant un changement visible, ligne à ligne.
- Le fait que **deux réglages seulement soient libres** cesse d'être une note d'ADR : c'est à
  l'écran, et ça se voit en cliquant.
- La modale des montées met la même exigence sur tous les gestes qui **retirent du contrôle**, alors
  qu'un seul en bénéficiait.

### Négatives / coûts assumés

- **La primauté du constat disparaît** (§8.1). Garantie affaiblie, contre-motif au dossier.
- **« Quiz — servi sans relecture, par doctrine »** disparaît de la matrice : le quiz **n'est pas
  une classe d'autonomie**, le bloc précédent le décrivait en dur. Repêché en note de pied de
  panneau, hors matrice — sinon on perdrait une information vraie pour une raison de forme.
- **Collision de vocabulaire, TRANCHÉE au §8.0** : « niveau/level » nomme les trois régimes,
  « palier » le degré 0-3 d'une classe. La documentation applique la convention ; le **code** garde
  ses noms hérités (`AutonomyLevel` porte un palier, `preset` porte un niveau) — les renommer
  traverserait `packages/types` et toutes les pages de réglage, pour un gain de lecture. La
  correspondance est établie une fois, au §8.0.
- **Le renommage casse mécaniquement une vingtaine de tests** qui attendent le titre « Régime » via
  un helper partagé. Coût de bascule, pas de conception.

## Suivi

**Tests-verrous exigés** :

1. **Les deux classes libres voient leur PALIER suivre le niveau ; les quatre autres affichent la
   valeur SERVEUR**,
   identique dans les trois niveaux.
2. **Aucun total de provenance** dans le panneau — reprise du verrou n°7 du §Suivi de l'ADR-0032.
3. **Les libellés de palier viennent de la constante importée**, jamais recopiés.
4. **« Sur mesure » ne fabrique rien** : tout retombe sur la valeur serveur.
5. **Descendre n'ouvre AUCUNE modale**, depuis n'importe quel niveau.
6. **La montée vers *Autonom* garde SON texte fort** — le test échoue si les deux modales fusionnent.
7. **L'ordre nouveau est verrouillé** : ZETIS LEVELS précède le détail par type de contenu. On ne
   supprime pas le verrou d'ordre révoqué — **on le retourne**.
8. **Le constat daté survit à la fusion.**

**Observation attendue** : si Papa change de niveau **sans que le panneau de détail ait été
déplié du regard** — ce qu'on ne peut pas mesurer, mais qu'une question de sa part révélerait
(« qu'est-ce que ça a changé ? ») — alors le §8.1 aura eu tort et la primauté devra revenir.
