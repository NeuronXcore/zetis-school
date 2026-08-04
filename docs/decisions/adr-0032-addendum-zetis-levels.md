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
libellé de la classe (cls.label)  →  libellé du palier (LEVEL_LABEL[niveau])
niveau = levelsForPreset(regime)[cls.key] ?? cls.value
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

### 8.4 — La modale confirme les MONTÉES, jamais les descentes

Changer de niveau ouvre une modale de confirmation qui montre **ce que ce niveau déplace** — le même
panneau que le §8.2, appliqué au niveau visé.

⚠️ **Sauf en descente.** *« On ne freine pas un retour au contrôle »* est une décision écrite du
§Modale, et elle n'est pas rouverte : revenir vers plus de relecture n'ouvre **rien**.

**Deux niveaux de friction, et ils ne se confondent pas :**

| Geste | Modale |
|---|---|
| Descente | **aucune** |
| Montée vers *Hybrid* | sobre — « Passer en Hybrid ? », corps = ce que ça déplace |
| Montée vers *Autonom* | **la modale forte existante, inchangée** — « ⚠️ Vous retirez le dernier contrôle humain » |

La modale forte ne se dilue pas dans la nouvelle : elle est la seule qui garde au dossier la
révocation d'une décision écrite (le gel d'A1). Lui donner le même ton qu'à un passage en *Hybrid*
reviendrait à l'effacer par banalisation.

⚠️ La modale valide le **brouillon**, pas l'enregistrement. Le bouton « Enregistrer » reste un
second geste explicite — *pas d'auto-save* n'est pas rouvert.

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
- **Collision de vocabulaire assumée** : « level » nommera la section des trois régimes, alors que
  « palier » désigne déjà l'échelle 0-3 par classe. À l'écran le mot « palier » n'apparaît nulle
  part — la collision reste **interne au code et aux ADR**. Nommée ici, pas corrigée.
- **Le renommage casse mécaniquement une vingtaine de tests** qui attendent le titre « Régime » via
  un helper partagé. Coût de bascule, pas de conception.

## Suivi

**Tests-verrous exigés** :

1. **Les deux classes libres suivent le niveau ; les quatre autres affichent la valeur SERVEUR**,
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
