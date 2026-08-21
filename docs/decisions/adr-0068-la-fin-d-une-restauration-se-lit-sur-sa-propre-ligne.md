---
id: "0068"
titre: "La fin d'une restauration se lit sur sa propre ligne"
type: surface
statut: propose
date: 2026-08-21
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0041", "0060", "0063", "0067"]
---
# ADR-0068 — La fin d'une restauration se lit sur sa propre ligne

## Statut

**Proposé — 2026-08-21.** **Compte rendu de surface** (cas **4** de l'ADR-0060) de la slice 2 de
l'ADR-0067, écrit dans la **même session** que la relecture visuelle. Il tranche ce que l'ADR-0067
§5 avait explicitement renvoyé devant l'écran : la **formulation**, le **rendu** et
l'**emplacement** des trois issues d'une restauration.

> ⚠️ **L'ADR-0060 §3 aurait dispensé ce compte rendu** — le changement est réversible en un commit,
> sans migration, et ne touche aucun texte vu par Massimo. Il est écrit quand même parce que
> l'ADR-0067 §5 lui a **délégué une décision** (ce que le toast dit, où l'état vit) : sans lui,
> cette décision ne vivrait que dans du code. La voie légère du §3 vaut pour un rendu qu'on
> ajuste, pas pour un rendu qu'un ADR antérieur a différé.

## Contexte

L'ADR-0067 §3 décide **où** chaque issue se dit — toast pour un succès, état persistant pour un
échec — et son §5 borne ce que le toast ne dira jamais. Il laisse ouverts, par construction, la
formulation exacte, le rendu et l'emplacement : *« ils se décident devant l'écran »*.

Deux choses ont resserré cette question avant même la slice :

1. l'**Amendement 1** a porté le verdict à **trois** valeurs — `reussie`, `avec_ecarts`,
   `interrompue` — donc **trois** états à loger, pas deux ;
2. la relecture visuelle de la slice 1 avait déjà **démenti** l'emplacement d'origine.

## Décision

### §1 — L'histoire d'une restauration vit sur **sa propre ligne**, pleine largeur

Elle quitte la cellule « Archive » pour un `<tr>` dédié, `colSpan={6}`, **sous** la ligne de son
archive. Mesuré : **117 px → 854 px** en desktop, **703 px** en tablette. Les trois énoncés
principaux tiennent désormais sur **une seule ligne** ; ils se coupaient en deux avant.

Le rattachement à l'archive ne vient d'aucun ornement : la ligne d'archive **perd son trait du
bas** quand une histoire suit, si bien que les deux vivent entre deux séparateurs (mesuré : 0 px
entre elles, un trait seulement après).

### §2 — Trois états, trois registres — et l'échec est le plus lisible des trois

| Issue | Rendu | Contraste mesuré |
|---|---|---|
| `reussie` | vert discret, poids normal : *« ↺ restaurée le 19/08/2026 18:46 »* | **11,21:1** |
| `avec_ecarts` | **ambre**, poids 600 : *« ↺ restaurée le … — 1 écart consigné »* + une ligne qui désamorce la lecture fautive | **14,03:1** |
| `interrompue` | **rose**, poids 600 : *« ↺ restauration interrompue — arrêtée à l'étape « medias » »* + le motif brut en `font-mono` | **12,34:1** (motif : 7,64:1) |

🔴 **C'est l'inversion que l'ADR-0067 §3 exigeait.** En slice 1, le succès était le seul état
peint ; au même endroit, l'échec — plus long — aurait été **moins** visible. Il est maintenant le
plus appuyé des trois, en poids comme en contraste.

🔴 **L'ambre n'est pas un rouge atténué**, c'est le registre que le dépôt réserve au *refus
motivé* : ZETIS a abouti, avec une réserve. Peindre `avec_ecarts` en rose enverrait Papa relancer
un second swap — exactement ce que l'Amendement 1 interdit.

### §3 — Un quatrième aspect, que personne n'avait prévu : le **journal ouvert**

Un sidecar sans `termine_le` **et** sans étape en échec n'est ni un succès ni une interruption :
c'est un geste **en vol** — ou tué net. Il se dit en **gris**, sans conclure :
*« ↺ restauration commencée, jamais close — aucune étape en échec consignée. »*

### §4 — Ce que le toast dit

*« « zetis-2026-08-19-1844.tar » restaurée. ZETIS s'est réveillé suspendu : la remise en route
vous appartient. »* — et pour `avec_ecarts`, la réserve s'intercale : *« … restaurée. 1 écart
consigné, et la ligne de l'archive le garde. … »*

Il **nomme l'archive**, ne porte ni pourcentage ni durée ni promesse, et rappelle la suspension
(ADR-0063). ⚠️ Il ne promet **pas** un « détail » : la route publie le **compte** des écarts, pas
leur texte — et une restauration n'a pas de ligne de travail où aller le lire, elle meurt au swap.

## 🔴 Ce que l'écran a démenti

**1. L'emplacement d'origine — le démenti hérité, et le plus cher.** Relecture du 2026-08-21 sur
les vraies données : la mention *« ↺ restaurée le … »* était peinte, `visible`, contrastée à
**5,73:1** — et le commanditaire **ne l'a pas vue**. Ce n'était pas un problème de couleur : dans
**117 px**, elle se coupait en deux, juste sous un nom de fichier monospace qui se coupe déjà.
C'est ce démenti qui commande tout le §1.

**2. Une phrase écrite, peinte, puis retirée.** Le bloc d'interruption portait
*« Rien à acquitter : ce n'est pas une notification, c'est l'état de cette archive… »*. Mesurée à
**5,73:1**, elle était l'élément **le moins lisible du bloc le plus important** — et elle
expliquait une décision de conception au lieu de dire un fait. L'absence d'acquittement se
constate ; elle n'a pas à se justifier à chaque ligne. Retirée.

**3. Un filet vertical inutile ET invisible.** Un `border-l-2` avait été ajouté pour rattacher
l'histoire à son archive. Mesuré : `rgb(36, 51, 72)` sur `rgb(17, 26, 40)` — invisible. Et
surtout **redondant** : le jeu des traits du bas rattachait déjà les deux lignes. Retiré. *Une
règle décorative qui ne se voit pas est pire que pas de règle.*

**4. L'explication d'`avec_ecarts` a été raccourcie, pas supprimée.** Elle tenait sur deux lignes ;
elle en fait une. Elle **reste** parce que c'est l'état qu'on lit de travers, et que le lire de
travers coûte un second swap.

**5. Un rendu FAUX, trouvé par son propre test-verrou.** Pendant une restauration, le sidecar
existe sans `termine_le` : la route en dérive `verdict: "interrompue"`, en toute bonne foi. La
page peignait donc un **échec rouge au milieu d'un geste parfaitement sain**. C'est le §3 de ce
compte rendu — et il n'a pas été vu à l'œil : c'est l'assertion « aucune interruption affichée »
qui est tombée.

## Ce que je n'ai PAS pu voir, et il faut le savoir

🔴 **Le toast et l'attente ⏳ n'ont pas été vus dans un geste réel** — seulement sous test. Les
voir demande un vrai 202, donc une vraie restauration destructive, écartée par le commanditaire
dans cette session. Ce qui **a** été vu en vrai, sur le serveur réel : les trois états peints
côte à côte, le dialogue de classe A4 (bouton désarmé champ vide), et le **409 motivé** en ambre
— avec la preuve, au réseau, qu'un refus **n'arme pas** l'attente (aucune lecture ensuite).

⚠️ **Observation hors périmètre, signalée sans être traitée** : dans `ConfirmDialog`, le bouton de
confirmation est peint en rose **plein** alors qu'il est `disabled` — il se lit comme armé quand
il ne l'est pas. Ce n'est pas de cette slice.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Une colonne « Restauration » de plus** | Le tableau défile **déjà** en largeur à 768 px (703 px de contenu dans 407 px visibles). Une 7ᵉ colonne aggraverait la dette au lieu de loger l'information. |
| **Un second badge dans la colonne « Statut »** | Cette cellule porte déjà le verdict de **vérification**. Deux verdicts de nature différente dans la même pastille, c'est la confusion que l'Amendement 1 vient de payer sur un seul mot. |
| **Un panneau d'historique sous le tableau** | Détache le fait de son archive. « Cette archive-ci a été restaurée à moitié » n'est plus lisible d'un coup d'œil sur sa ligne. |
| **Garder l'emplacement et réduire la police** | Le démenti n'était pas une question de taille : 11 px tenait sur 2 lignes dans 117 px, 9 px en tiendrait 3. |
| **Traduire `etape_arretee` en jolie phrase** | Écarté par l'ADR-0041 §8, et pas seulement par principe : la table divergerait du serveur au premier nom d'étape renommé. `medias`, `purge_files`, `recyclage` passent tels quels. |

## Conséquences

**Ce que ça donne.** Les trois issues se distinguent d'un coup d'œil, sur la ligne de leur archive,
et la plus grave est la plus lisible. L'énoncé principal de chacune tient sur une ligne, y compris
en tablette (344 / 308 / 184 px pour 407 px visibles).

**Ce que ça coûte, et c'est nommé.**

- 🔴 **Le motif brut déborde en écran étroit** (596 px pour 407 px visibles) : il demande le même
  défilement horizontal que le tableau demande déjà. Hérité, pas créé ici — mais l'information la
  plus technique est aussi la moins accessible sur petit écran.
- 🔴 **Une interruption n'a pas de DATE**, et ne peut pas en avoir : le contrat publié ne porte
  que `termine_le`, nul par définition quand le geste s'est arrêté. `commence_le` existe dans le
  sidecar et n'est pas servi. L'ADR-0067 §3 illustrait pourtant l'état persistant *avec* une date.
- 🔴 **Le TEXTE d'un écart est inatteignable** : la route publie leur **compte**. Pour une
  vérification, le détail vit dans l'`output_json` du travail ; pour une **restauration**, ce
  travail n'existe plus — il meurt au swap. Papa lit « 1 écart » et ne peut apprendre lequel.
- **Une ligne de tableau sur deux** est une ligne d'histoire quand toutes les archives ont été
  restaurées. Aucune cible du dépôt n'est dans ce cas aujourd'hui.

## Le signal qui dirait qu'on s'est trompé

- **Papa demande « quel écart ? » et personne ne peut répondre.** Alors le compte seul ne suffit
  pas, et publier le texte des écarts devient une vraie question — pas un ajout de confort.
- **Une interruption est prise pour une autre** parce qu'aucune date ne les sépare. Alors
  `commence_le` doit être servi, et c'est un changement de contrat, donc son propre cadrage.
- **Le gris du « journal ouvert » est lu comme une panne**, ou pire, comme un succès. C'est
  l'aspect le moins éprouvé des quatre : aucun geste réel ne l'a produit sous les yeux de qui que
  ce soit.
- **L'ambre d'`avec_ecarts` est lu comme un échec** et Papa relance un swap. C'est exactement le
  coût que l'Amendement 1 nommait ; la phrase d'accompagnement est là pour ça, et elle aurait
  échoué.
