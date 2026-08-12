# ADR-0052 — La mindmap prend la place qu'elle demande

## Statut

**Proposé — 2026-08-12.** Les **cinq décisions sont gelées** ; une session de slice peut démarrer
après `/ouverture`.

> Cadré sur `main`, **sans une ligne de code**, après une `/ouverture` **arrêtée à son §2** : l'ADR
> n'existait pas, et les trois documents mindmap du dépôt (`page-mindmaps.md`,
> `mockup-page-mindmaps.html`, les prompts) sont ceux de l'**ADR-0016**, pas de ce chantier.

> ⚠️ **Une décision du commanditaire a été RENVERSÉE par le read-before-code, le même jour.** Le
> 2026-08-12 au matin, il avait arbitré « banque en haut + canvas raccourci » **contre** le plein
> écran, sur mon exposé. Les mesures prises l'après-midi dans l'app montrent que cette réponse ne
> tient **que sur un écran de bureau** — sur iPhone elle laisse **87 px** de carte. Le plein écran,
> que j'avais écarté pour une raison **fausse** (les modales), redevient la décision. Exposé au
> commanditaire, **ré-arbitré par lui**. Le §« Alternatives » garde les deux, avec leurs chiffres.

🔴 **La relecture visuelle humaine est due AVANT le merge.** Ce chantier n'existe que parce que le
commanditaire a **regardé** — aucun test ne mesure de géométrie dans ce dépôt, et les deux défauts
supplémentaires décrits ici (barre des modes coupée, « carte » ambigu) ont été trouvés à l'œil, en
cadrant. Une slice qui rendrait la suite verte n'aurait rien prouvé.

## Contexte

Le commanditaire, en utilisant l'app : *« faudrait-il avoir un mode plein écran quand on est dans
mindmap pour éviter de scroller en bas à chaque fois ? »*

En mode **Reconstruire**, `MindmapWorkspace` empile verticalement :

```
① barre des modes  (Regarde › Mémorise › Reconstruire)
② consigne « Replace les étiquettes blanchies » + pastilles de passes
③ le canvas React Flow          height: clamp(520px, 74vh, 840px)
④ NodeBank — LES ÉTIQUETTES À GLISSER
```

**Le défaut n'est pas la consigne, c'est le geste.** Les puces à glisser sont **sous** le canvas :
il faut défiler pour les atteindre, et une fois en bas, l'emplacement où les déposer est remonté
hors de l'écran. **Le glisser-déposer traverse la limite de défilement.** Déplacer la seule phrase
de consigne — la première idée, la plus simple — ne corrigerait rien du tout.

## Constat read-before-code

**Mesuré dans l'app** (`/mindmaps/francais`, une carte ouverte en Reconstruire, session
authentifiée), pas estimé.

### 1. Le compte ne tombe juste sur aucun écran, et pas du tout sur un téléphone

| | Décor au-dessus du canvas | Banque | Reste pour le canvas | Verdict |
|---|---|---|---|---|
| **1594 × 1078** (bureau) | 320 px | 154 px | **588 px** | tenable |
| **390 × 844** (iPhone) | **463 px** | **278 px** | **87 px** | 🔴 impossible |

Aujourd'hui le canvas prend `74vh` — **798 px** sur le bureau, **625 px** sur le téléphone. Sur le
bureau, son bas est **déjà 40 px sous la ligne de flottaison** ; la banque commence 56 px plus bas
et finit **210 px** hors écran. Sur le téléphone, le bas de la banque est à **538 px** hors écran.

**Sur iPhone, décor + banque font 741 px sur 844.** Il n'y a pas de place pour une carte, quelle
que soit la valeur qu'on donne au canvas.

### 2. Le décor de 463 px, décomposé

| Bloc | Hauteur |
|---|---|
| barre des modes (elle passe sur plusieurs lignes) | **128** |
| bandeau XP « Massimo · Niveau 13 · 1257 XP » | 96 |
| barre du burger ☰ | 57 |
| consigne + pastilles de passes | 56 |
| retour « ← Français » | 34 |
| titre « Phrase complexe · GRAMMAIRE » | 28 |

On récupérerait ~100 px en serrant les deux premiers. Le canvas passerait à ~190 px. **Toujours
inutilisable.**

### 3. La banque n'a pas une hauteur fixe

154 px à vide, **278 px** mesurés sur téléphone (les puces passent à la ligne). Elle grandit avec
le nombre d'étiquettes de la passe. Tout calcul qui la traite comme une constante sera faux sur les
grandes cartes.

### 4. 🔴 La cause profonde : le canvas mesure le VIEWPORT, pas son conteneur

`clamp(520px, 74vh, 840px)` est exprimé en **`vh`**. Or le workspace vit dans **trois** conteneurs
différents, et **aucun** n'est le viewport :

| Surface | Conteneur | Ce qu'il impose |
|---|---|---|
| `MindmapSubjectPage` | la page | 320 à 463 px de décor au-dessus |
| `MindmapMissionModal` (Massimo) | `ActivityModal` | `max-h-[calc(100vh-4rem)]`, corps en `min-h-0 flex-1 overflow-y-auto` |
| `MindmapPreviewModal` (Papa) | la modale Papa | même patron |

⚠️ **J'avais écarté le plein écran en invoquant les deux modales — c'était FAUX.** Elles bornent
déjà leur hauteur et **défilent en interne** ; ce ne sont pas des obstacles. Le vrai coupable est
le `74vh`, qui ne peut pas tenir **par construction** : il ignore le conteneur qui l'accueille.

### 5. Deux défauts trouvés en cadrant, sur la même surface

- 🔴 **La barre des modes est coupée à 390 px.** Bord droit du bouton « ③ Reconstruire » mesuré à
  **435 px pour un viewport de 390** — **45 px coupés**, et la page **ne défile pas
  horizontalement** : on ne peut pas aller chercher ce qui manque. Le bouton reste tapable sur ses
  98 px visibles, mais son libellé et son « 🏆 Gagne des XP » sont perdus. **C'est exactement le
  défaut de la barre d'onglets corrigé par l'addendum ADR-0024 §3 bis** (`flex-wrap`, jamais de
  défilement) — il vit encore ici.
- ⚠️ **« carte » désigne encore la mindmap**, alors que la PR #117 vient de lever cette collision
  dans `ACTION_UI`. Trois occurrences **rendues à l'écran** : `MindmapsPage.tsx:77` (« **14
  cartes** », « 10 cartes »… à trois entrées de sidebar de « Révision · 9+ », qui compte les cartes
  SRS), `MindmapsPage.tsx:46` (« Vois la **carte** d'une notion »), `MindmapSubjectPage.tsx:242`
  (« 🧠 **Carte mentale** » sur chaque tuile). Plus `MindmapMissionModal.tsx:62` et, côté Papa,
  `ConseilClasseIAPage.tsx:39`.

## Alternatives considérées

### A — Déplacer la seule phrase de consigne en haut *(écartée)*

La première idée du commanditaire. **Ne corrige rien** : le problème n'est pas de lire la consigne,
c'est d'atteindre les puces. Et la phrase visée (« Replace les étiquettes blanchies ») est **déjà**
en haut (`MindmapWorkspace.tsx:586`).

### B — Banque au-dessus + canvas raccourci, sans plein écran *(arbitrée le matin, écartée l'après-midi)*

Tenable sur un bureau (588 px de canvas), **impossible sur téléphone** (87 px). Elle livrerait une
correction qui ne sert pas Massimo là où il en a le plus besoin, et son chiffre le plus visible —
la nouvelle hauteur — n'aurait aucune valeur mesurée : ma première proposition,
`clamp(380px, 58vh, 660px)`, **débordait encore de 37 px** sur l'écran où je l'ai proposée.

**Ce qu'elle a de bon est conservé** : la banque passe bien au-dessus du canvas (Décision 3).

### C — Ne s'attaquer qu'au décor *(écartée)*

Masquer le bandeau XP, compacter la barre des modes, replier le sélecteur de disposition : ~100 px
récupérés, canvas à ~190 px. **Insuffisant**, et ça rouvrirait des choix pris ailleurs (le bandeau
XP est une décision de l'addendum ADR-0024).

### D — L'API Fullscreen du navigateur *(écartée)*

`requestFullscreen()` demande un geste utilisateur, se comporte mal en iframe, sort au moindre
changement d'onglet, et **le dépôt a déjà son patron** : la galaxie fait un plein écran en **état
React + overlay CSS** (`GalaxyPage.tsx:81-108`, `CloseFullscreenButton.tsx`). On ne crée pas un
second mécanisme pour la même intention.

## Décision

### 1. Un mode plein écran, sur le patron de la galaxie

Overlay CSS piloté par un état React — **pas** l'API Fullscreen. Reprend, sans les réinventer :

- le composant **`CloseFullscreenButton`** existant (cible 44 px, tracé SVG et non un « × »
  typographique) ;
- **Échap** pour sortir ;
- le **verrouillage du défilement du corps** pendant l'overlay.

⚠️ **Un seul `ReactFlow` monté à la fois.** La galaxie porte l'avertissement pour WebGL
(`GalaxyPage.tsx:499` : « deux `GalaxyCanvas` montés = deux contextes ») ; le même raisonnement
vaut ici, pour d'autres raisons — deux instances, ce sont deux calculs de layout elk et deux jeux
de positions `localStorage`.

**Disponible dans les trois modes**, Regarde et Mémorise comprises : une carte large se lit mal
partout, pas seulement quand on la reconstruit.

### 2. 🔴 Le canvas cesse de se mesurer en `vh` — il remplit son conteneur

C'est **la** décision de fond ; le plein écran sans elle ne ferait que déplacer le défaut.

Le workspace devient une **colonne flex bornée**, et le canvas y prend ce qui reste
(`flex-1` + `min-h-0`). La hauteur est **imposée par le parent**, pas devinée contre la fenêtre :

- en pleine page, une hauteur bornée qui laisse la banque visible ;
- en modale, le corps borne déjà (`max-h-[calc(100vh-4rem)]`) — le canvas s'y adapte au lieu de le
  faire déborder ;
- en plein écran, l'overlay donne toute la fenêtre.

⚠️ **Aucune constante magique.** La galaxie code en dur un `112` (`GalaxyPage.tsx:314`) : c'est ce
qu'on **ne** refait **pas**. La banque mesure 154 à 278 px selon les cartes — un calcul qui la
suppose fixe sera faux.

### 3. La banque passe AU-DESSUS du canvas

On glisse du **haut** vers le **bas**, dans le sens de lecture, sans jamais franchir une limite de
défilement. C'est ce que le commanditaire avait demandé le matin, et ça reste vrai.

**Mode `build` uniquement.** ⚠️ **Mémorise (`train`) n'a AUCUNE banque** — on y clique les « · · · »
sur le canvas, et sa consigne, ses pastilles et son bouton « Passe suivante ▸ » sont **déjà** en
haut (`MindmapWorkspace.tsx:570`). **Mémorise n'a pas ce défaut** ; la demande initiale visait les
deux modes, elle est sans objet pour l'un d'eux. Le plein écran (Décision 1), lui, les sert tous.

### 4. La barre des modes cesse d'être coupée

`flex-wrap`, **jamais** de défilement horizontal ni de menu déroulant — la règle est déjà écrite
dans l'addendum ADR-0024 §3 bis, elle s'applique ici sans être rouverte. Le sélecteur de
disposition suit la même règle.

**Vérification exigée dans le DOM** : à 390 px, **0 élément hors cadre**,
`scrollWidth == clientWidth`, **0 cible de touche sous 44 px**.

### 5. « Carte » cesse de désigner la mindmap

Prolonge la PR #117, qui n'avait levé la collision que dans `ACTION_UI`. Le vocabulaire retenu
reste celui de la barre latérale : **« mindmap »**.

| Fichier | Aujourd'hui | Demain |
|---|---|---|
| `MindmapsPage.tsx:77` | « 14 **cartes** » | « 14 **mindmaps** » |
| `MindmapsPage.tsx:46` | « Vois la **carte** d'une notion » | « Vois la **mindmap** d'une notion » |
| `MindmapSubjectPage.tsx:242` | « 🧠 **Carte mentale** » | « 🧠 **Mindmap** » |
| `MindmapMissionModal.tsx:62` | « **Carte mentale** — <notion> » | « **Mindmap** — <notion> » |

⚠️ **`ConseilClasseIAPage.tsx:39` (Papa) est HORS PÉRIMÈTRE** : la collision est un problème du
vocabulaire **de l'enfant**. Papa lit « Carte mentale » dans une liste de types de contenus, sans
« cartes à revoir » à côté.

> ⚠️ **Cette décision mélange deux sujets dans un même ADR** — un gabarit d'écran et un
> vocabulaire. Signalé au commanditaire, **qui a choisi de les réunir** : c'est la même surface, et
> un second chantier pour quatre chaînes coûterait plus que ce qu'il rapporte. L'écart à la règle
> mono-chantier est **assumé**, pas subi.

## Périmètre

**Touché** : `packages/ui/src/components/mindmap/` (`MindmapWorkspace`, `NodeBank`,
`ModeSegmented`, `LayoutSelector`), et les quatre chaînes de la Décision 5 dans
`apps/frontend-massimo/`.

**HORS PÉRIMÈTRE, explicitement :**

- le **moteur** de rendu et le layout elk (ADR-0016, **non rouvert**) ;
- le **bandeau XP** et le burger (96 + 57 px) — décor de page, décision d'un autre ADR ;
- la **persistance des positions** en `localStorage` (`arrangementKey`) ;
- l'**évaluation serveur** de la reconstruction et l'XP ;
- `ConseilClasseIAPage.tsx` **côté Papa** ;
- le **débordement du panneau de notion de `/galaxy`** (94 px hors écran, au `BACKLOG.md`) — autre
  surface, autre chantier, malgré la parenté du symptôme.

## Conséquences

**Assumées :**

- un **état d'écran de plus** dans un composant qui en porte déjà beaucoup (mode, passes,
  révélation, assignation, drag) ;
- le **plein écran dans une modale** reste une imbrication : l'overlay doit passer **au-dessus** de
  la modale (`z-index`), et sa sortie **ne doit pas** fermer la modale ;
- une **quatrième** occasion, pour `MindmapWorkspace`, de diverger entre ses trois consommateurs ;
- le vocabulaire « mindmap » s'éloigne du français scolaire (« carte mentale ») — c'est le prix de
  la désambiguïsation, et c'est le mot que Massimo voit tous les jours.

**Nulles** : aucune migration, aucune route, aucun contrat d'API, aucun changement backend.

## Le signal qui dirait qu'on s'est trompé

- Massimo **n'utilise jamais** le plein écran → le défaut était ailleurs (le décor, pas la place).
- Il l'ouvre et **n'en sort plus** → ce n'est pas un mode, c'est le gabarit par défaut, et il faut
  inverser la décision.
- La banque au-dessus **cache le haut de la carte** au lieu de servir → il faut la rendre repliable
  plutôt que la déplacer.

## Suivi

- Relecture visuelle humaine **avant le merge**, sur les **trois** surfaces et aux **deux**
  largeurs. Mesures **dans le DOM**, jamais sur capture.
- La spec `docs/frontend-massimo/page-mindmaps.md` ne décrit **pas** l'empilement vertical : elle
  est à compléter dans la slice, pas seulement à corriger.
