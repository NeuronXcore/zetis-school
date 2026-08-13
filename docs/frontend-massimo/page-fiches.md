# Page Massimo — Fiches de révision

## Objectif

Chaque **leçon** tient sur **une page** (« fiche ») que Massimo relit avant un contrôle ; il se
constitue un **deck de fiches par matière**.

La page porte **deux auteurs** (addendum ADR-0015) :

- la **fiche ZETIS** — dérivé du cours canonique (ADR-0011), validée par Papa, servie en lecture ;
- la **fiche de Massimo** — sa production, qu'il fabrique avec l'aide de ZETIS.

> ⚠️ La règle de service n'est pas « lecture seule », elle est : **le gate `validated` porte sur ce
> que ZETIS sert, jamais sur ce que Massimo écrit.** Une fiche `author='massimo'` lui est visible
> sans validation ; une fiche `author='zetis'` ne l'atteint que `validated`. Les **dérivés** de sa
> fiche (cartes SRS, quiz) repassent, eux, par le gate normal.

> Une fiche ≠ une flashcard SRS : la fiche synthétise **une leçon entière** (relire) ; la carte
> SRS porte **une notion** (se tester).

Mockup de référence : `mockup/mockup-fiche-de-massimo.html` (12 scénarios) ; le viewer seul reste
décrit par `mockup/mockup-page-fiches.html`.

## Les écrans

### 1. Decks par matière (`/fiches`)

Grille `SubjectDeckGrid` (partagée avec ELI5 / Révision) : un deck par matière de l'année active,
**compteur** de fiches, badge **« ✨ nouveau »** si une fiche n'a jamais été ouverte, matière sans
fiche → deck grisé « bientôt ». Source : `GET /api/student/fiches/summary`.

⚠️ Le compteur additionne **les fiches ZETIS validées et les fiches de Massimo** — un deck où il
n'a que ses propres fiches n'est pas « bientôt ».

### 2. Liste des fiches d'une matière (`/fiches/:slug`)

Une tuile par leçon. **Quatre états**, qui cohabitent dans la même liste :

| État | Pastille | Sous-titre | Au clic |
|---|---|---|---|
| Sa fiche finie | `✍️ Ta fiche` | « 2 versions · la dernière il y a 5 jours » | écran 6 (versions) |
| Son brouillon | `✏️ Commencée` | pastilles de progression + « tu en as choisi 3 » | écran 4 (atelier), **à l'endroit exact où il s'est arrêté** |
| Rien encore | `🧩 À fabriquer` | « ≈ 5 minutes » | écran 4 (atelier, vierge) |
| Fiche ZETIS seule | `⭐ Fiche ZETIS` | « à lire » | écran 3 (viewer) |

**Aucun état n'est un reproche.** Le brouillon n'affiche jamais « inachevé » ni « abandonné », et
rien ne décompte de jours. Source : `GET /api/student/subjects/{slug}/fiches`.

### 3. La fiche (lecture)

`FicheCard` — rendu **fermé** du `FicheSpec`, sections dans cet ordre (seules celles remplies
s'affichent) :

- ⭐ **L'essentiel** (2–3 phrases)
- 📖 **Les mots à connaître** (définitions, ≤ 4)
- 🔑 **À retenir** (points-clés, ≤ 5)
- ⚠️ **Pièges à éviter** (≤ 3)
- 💡 **Un exemple** (facultatif)
- 🎩 **Mnemonics** (facultatif — **souvent absent, c'est normal**)

Feuilletage **‹ / ›** entre les fiches de la matière ; ouverture → `POST /seen` (retrait du badge
« nouveau »). Pied : badge de provenance — **« 📚 D'après ton cours »** (ZETIS) ou
**« ✍️ Ta fiche »** (Massimo). En haut à droite : **« 📖 Voir le cours »**.

Sur une fiche de Massimo, chaque section porte un **marqueur d'auteur** discret : *écrit ·
choisi · inventé · terme ZETIS / définition écrite · tes erreurs*.

### 4. L'atelier (`/fiches/:slug/:lessonId/atelier`)

**Une seule page, six étapes empilées à la verticale** — pas un assistant en six écrans.

Le choix est structurant, pas cosmétique : un assistant **cacherait l'avancement et imposerait un
ordre**, alors que la colonne montre **la fiche en train de se faire** et laisse remplir dans
n'importe quel ordre. C'est aussi ce qui rend lisible le remplissage **par passes** (addendum §7) :
il voit les six étapes, en remplit une, et part. **Aucune étape n'est obligatoire pour que la
fiche existe** — une fiche à deux étapes est une fiche.

#### Le gabarit de la colonne

- **Un rail vertical** relie six **jalons numérotés**. Trois états : *vide* (contour sourd),
  *en cours* (contour accentué + halo), *fait* (jalon plein). Le segment de rail d'une étape faite
  se teinte — la progression se lit **verticalement, d'un coup d'œil**.
- **Une seule étape est dépliée à la fois** (accordéon) : le plan reste visible, le travail reste
  concentré. Cliquer un titre déplie l'étape et replie l'autre.
- **Repliée et remplie**, une étape montre un **aperçu de son contenu** (les points-clés choisis,
  la phrase écrite, les pièges gardés) — pas seulement un ✓.
- **Repliée et vide**, elle montre une **amorce de sens** : « 5 idées à choisir dans ton cours ·
  aucune écriture », « facultatif — mais c'est la meilleure preuve que tu as compris ».
- **Un compteur d'avancement** en tête : « *3 étapes sur 6 ont quelque chose* » + une barre. Il
  compte **ce qui est commencé**, jamais ce qui manque.
- **L'étape ⑥ n'existe que si ZETIS a détecté une occasion** — sinon elle n'est pas rendue du
  tout. Sur la plupart des leçons, la colonne fait cinq étapes.

#### Les modes d'auteur (addendum §8)

| # | Étape | Mode | Ce que Massimo fait |
|---|---|---|---|
| ① | 🔑 À retenir | **choix** | 12 phrases candidates → 5 emplacements |
| ② | ⭐ L'essentiel | **champ libre** | écrit ou **dicte**, à partir d'une amorce |
| ③ | 📖 Les mots | **hybride** | ZETIS donne le terme, il écrit la définition |
| ④ | ⚠️ Les pièges | **confirmation** | ZETIS propose **ses propres erreurs**, il garde / reformule / écarte |
| ⑤ | 💡 Un exemple | **champ libre** | écrit |
| ⑥ | 🎩 Mnemonics | **champ libre, conditionnel** | invente — l'étape n'apparaît que si l'occasion existe |

#### Le pied de colonne

- **« ZETIS, regarde ma fiche »** — actif **dès qu'une seule étape a quelque chose**. Pas besoin
  d'avoir tout rempli : c'est le corollaire direct de « aucune étape n'est obligatoire ».
- **« J'ai fini pour aujourd'hui »** — retour au deck, sans confirmation. La fiche reste
  *commencée*.
- Mention permanente : « **tout est gardé au fur et à mesure — tu peux fermer et revenir
  demain** ». C'est ce que promet `PATCH /draft/{id}`, il faut que l'écran le dise.

#### 4a. Étape ① — le choix (« À retenir »)

12 phrases **tirées du cours**, 5 emplacements numérotés. **On GLISSE une phrase sur un
emplacement** ; le **clic ne sert plus qu'à la croix** qui la retire. Compteur `n / 5`.

> 🔴 **Glisser-déposer par événements POINTEUR, jamais le `draggable` HTML5** — celui-ci ne se
> déclenche pas au doigt sur iPhone, et l'atelier doit y marcher. On reprend la mécanique de la
> banque de nœuds des mindmaps (`packages/ui/…/NodeBank.tsx` + `MindmapWorkspace`) : `pointerdown`
> sur la puce, écouteurs globaux `pointermove`/`pointerup`, cible par `document.elementFromPoint`,
> fantôme en `position: fixed` + **`pointer-events: none`** (sans quoi il se trouverait sous le
> doigt au lâcher et masquerait la cible).
>
> Trois règles de tenue : **`touch-action: none`** sur les puces (sinon la page défile au lieu de
> tirer) ; **`select-none` sur TOUTE la zone**, pas seulement sur les puces (un départ à quelques
> pixels sélectionne la colonne, et sur iPhone une sélection ouvre la loupe et le menu Copier) ;
> **seuls les emplacements LIBRES acceptent** — déposer sur une idée déjà placée l'écraserait sans
> qu'il l'ait demandé. Lâcher à côté ne fait rien et ne dit rien.

⚠️ **Les phrases candidates sont FILTRÉES du discours pédagogique.** Sans filtre, cinq des douze
d'un vrai cours étaient l'introduction (« Aujourd'hui, on va apprendre… », « Imagine que… ») et
les définitions n'entraient qu'en position 10 à 12. Sont écartés : les phrases qui s'adressent à
l'élève, les illustrations annoncées par deux-points (`Phrase simple : « … »`) et les phrases
entièrement entre guillemets — qui sont l'exemple, pas l'idée. Si le filtre laisse moins de cinq
candidates, il **rend quand même** les écartées : un atelier vide se lirait « il n'y a rien à
retenir ».

⚠️ **Les 7 phrases non retenues ne sont pas fausses** — elles sont vraies mais secondaires. C'est
ce qui rend le choix formateur, et ce qui interdit à ZETIS de dire « c'est faux » (addendum §5,
règle 5).

#### 4b. Étapes ② et ⑤ — les champs libres

Trois règles, toutes obligatoires (addendum §9) :

1. **Jamais de zone vide** — une **amorce** en tête (« Un séisme, c'est… »).
2. **La dictée avant le clavier** — bouton « 🎙️ Le dire à voix haute » (Whisper local, ADR-0012).
3. **Le budget se montre comme de la place** — barre discrète + « il te reste de la place pour
   2 lignes » ; à saturation, « **ta fiche est pleine — et c'est très bien** ». Jamais
   « 412 / 600 », jamais de rouge. Les bornes viennent de `FICHE_BUDGETS`.

#### 4c. Étape ④ — les pièges

Pré-remplis depuis **son historique d'erreurs**, avec la preuve datée en tête de carte
(« 📊 2 erreurs en quiz · 12 et 19 juillet », « 🗂️ carte de révision ratée 2 fois »). Trois
actions : **Oui, je le garde** · **Le dire autrement** (le texte devient éditable) · **Non, ça va**.

⚠️ Écarter un piège **n'efface aucune mesure** : l'erreur reste dans son historique, elle ne va
simplement pas sur la fiche. L'action est réversible (« Remettre »).

#### 4d. Étape ⑥ — Mnemonics

L'étape n'apparaît **que si ZETIS a détecté une occasion** (une liste ou un ordre arbitraire).
Elle montre la liste à retenir, puis un champ libre. Le mnemonic **de ZETIS n'est révélé
qu'après** la tentative — patron du corrigé (§3). Message assumé : « **plus c'est bête, mieux ça
marche** ».

⚠️ **Libellé anglais assumé** : « Mnemonics » à l'écran, champ `mnemonique` au schéma (le reste du
`FicheSpec` est nommé en français — `points_cles`, `erreurs_a_eviter`, `mini_exemple`). Choix du
commanditaire : le terme anglais est court, il se retient, et il évite « moyen mnémotechnique ».

#### 4e. L'échange, **dans** l'étape

Chaque étape dépliée s'ouvre sur une **bulle ZETIS** propre à elle — il ne parle pas de la fiche
en général, il parle de **ce qu'on est en train de faire**. Deux actions vivent **dans l'étape**,
pas en pied de page :

- **« Aide-moi »** — fait **descendre l'échafaudage d'un cran** : ZETIS **écarte** des candidates
  (grisées, non cliquables), il n'en place **jamais** aucune. Aucun menu de niveau n'est affiché ;
- **« Je sèche sur cette étape »** — 🔴 **par étape, pas une fois pour la fiche**. Réponse jamais
  déçue, aucune confirmation, aucune relance. Quitter une étape vide laisse la fiche *commencée*.

**La voix** (addendum §5 bis) : bouton 🔊 sur chaque bulle ZETIS, **jamais de lecture
automatique** (`AudioContext` exige un geste, et une voix qui part seule est une notification
poussée). ZETIS **parle le relationnel** (accueil, question, « tu veux un coup de main ? », la
réussite nommée) et **écrit le référentiel** (les 12 candidates, la comparaison, ce qui manque) —
jamais les deux pour la même chose. **Pendant l'enregistrement de la dictée, ZETIS se tait et ses
boutons 🔊 sont désactivés** (pas de barge-in : sans écouteurs, sa voix repartirait dans le micro).

### 5. Le retour d'analyse

Déclenché par **« regarde ma fiche »** ou à la fermeture d'une section — **jamais pendant la
frappe** (addendum §6).

Composition, dans cet ordre et sous ces bornes :

- **1 à 2 réussites**, précises et jamais vides : « ton point sur l'épicentre, c'est celui que ton
  cours met en gras » — jamais « bravo ! » ;
- **0 à 2 remarques**, pas plus. Chacune porte son `type` :

| `type` | Rendu | Origine |
|---|---|---|
| `recopie` | citation avec passage **surligné** | n-grammes, **déterministe** |
| `trop_long` | citation + compte de lignes | bornes, **déterministe** |
| `idee_manquante` | orientation sans nommer l'idée | comparaison à la fiche ZETIS |
| `absent_du_cours` | **hors périmètre v1** | LLM |

Chaque remarque offre **« Aide-moi »** et **« Je garde ma phrase »**.

**L'escalade** de « Aide-moi », trois crans successifs : ① il **montre** (surligne, nomme, se
tait) → ② il **oriente** (une question) → ③ il propose **deux ou trois formulations**, plus
« **aucune des trois — j'écris la mienne** ». Jamais une seule proposition : une suggestion
unique est une correction à accepter, trois sont un choix à faire.

**« Je garde ma phrase »** : un clic, silencieux, aucune confirmation. Confirmation minimale
« ✓ Gardée. C'est ta fiche. », et les actions de la remarque disparaissent.

### 6. Le corrigé, côte à côte

**Rien n'est verrouillé** (addendum §3, révisé le 2026-08-12) : Massimo peut lire le cours **et**
la fiche ZETIS avant de fabriquer la sienne. Ce qui change, c'est **ce qui s'ouvre en premier** —
sur une leçon à fiche personnelle, la tuile ouvre **sa fiche ou son atelier**, la fiche ZETIS
restant **à un clic**. Un défaut, pas un gate.

La comparaison côte à côte reste **proposée après une tentative** — c'est là qu'elle a du sens —
mais elle ne conditionne plus rien.

Deux colonnes (empilées en mobile), même structure fermée des deux côtés, alignées section par
section. Marqueurs : `✓` idée commune · `+` idée que Massimo a en plus (**elle reste**) · `·` idée
qui manque encore. Phrase de synthèse en pied, factuelle et non chiffrée en score.

### 7. Les versions (`/fiches/:slug/:lessonId?v=2`)

Bandeau de pastilles `v1 · 12 juil.` `v2 · 7 août`. Sélectionner une version rend la fiche
correspondante ; la fiche affiche `✍️ v2` dans son bandeau et son pied.

- **Rouvrir un brouillon** → reprise **en place**, aucune version créée ;
- **Rouvrir une fiche finie** → bouton **« ✏️ La retravailler »** → **nouvelle version**.
  L'ancienne reste lisible.

Note de trajectoire sous la fiche, jamais un score : « **3 phrases recopiées → 0** ». C'est le
seul endroit du produit qui montre « sait-il ce qui compte » plutôt que « sait-il répondre ».

## Le cours qu'on appelle — **deux gabarits, pas un**

Réutilise `GET /api/student/lessons/{id}/cours` + `react-markdown` dans les deux cas.

### Depuis la fiche en lecture (écran 3) — **à côté**

« 📖 Voir le cours » ouvre le cours source dans une colonne **à droite, sur la même page**
(`CoursPanel` — pas de superposition ; fiche à gauche / cours à droite en desktop, empilé en
mobile). On lit les deux **en parallèle**. Comportement actuel, inchangé.

### Depuis l'atelier (écran 4) — **par-dessus, en tiroir**

🔴 **Pas la colonne de droite.** Dans l'atelier on ne lit pas le cours en parallèle : on va
**vérifier une phrase et revenir**. Et trois raisons de gabarit l'interdisent :

- la sidebar est **dans le flux** au-dessus de `md` — sidebar + colonne d'étapes + cours =
  trois colonnes, intenable sur iPad ;
- `CoursPanel` n'est `sticky` qu'au-dessus de `lg` : en dessous il s'empile **sous** la fiche,
  donc **sous six étapes** — le cours devient inatteignable (défaut jumeau de celui de
  l'`adr-0052` sur la banque de nœuds) ;
- la colonne manque déjà de largeur ; un tiroir n'en vole aucune.

Donc : **tiroir `fixed inset-y-0 right-0` + voile**, même mécanique que la sidebar mobile ; pleine
largeur sous `md` ; fermeture par ✕, Échap ou clic sur le voile.

⚠️ **`CoursPanel` cesse de se mesurer en `vh`** (`max-h-[80vh]`, `lg:max-h-[calc(100vh-2rem)]`
aujourd'hui) et **remplit son conteneur** — règle posée par l'`adr-0052` §2. Il portera deux
gabarits : `variant="aside"` (viewer) et `variant="drawer"` (atelier).

Dans les deux cas, le cours est la **sortie de secours** du retour d'analyse : une remarque
`absent_du_cours` (quand elle sera activée) doit pouvoir ouvrir **le passage** concerné, jamais
affirmer « c'est faux ».

### Le sens inverse — depuis le cours, ouvrir sa fiche

**N'existe pas aujourd'hui** : `CoursPage` (`/subjects/:slug/cours`) mène au quiz, jamais aux
fiches. À créer, **au niveau de chaque leçon** : « 🧩 En faire ma fiche » si rien n'existe,
« ✍️ Ma fiche » sinon.

C'est **le même bouton** que celui de l'écran H (depuis une fiche ZETIS déjà lue) — et la même
question, **tranchée le 2026-08-12 : lire avant de fabriquer est permis.** Les deux entrées
s'ouvrent sans condition.

## Gabarit de l'atelier

L'atelier est une **page en plein écran**, jamais une quatrième vue de `FicheSubjectPage` (qui
porte déjà liste + fiche + cours), et **jamais dans `ActivityModal`** : la modale borne son corps
à `max-h-[calc(100vh-4rem)]` avec défilement interne — une colonne de six étapes dedans rejouerait
le défaut de l'`adr-0052`. Si l'atelier devient un jour une activité de mission, la modale
**route vers la page**.

Plein écran = **le patron déjà retenu par l'`adr-0052`**, pas un second : overlay CSS + état React
(**pas** `requestFullscreen`), `CloseFullscreenButton` (cible 44 px), Échap, verrouillage du
défilement du corps.

## Export A5 (image + impression)

L'app vit dans un shell à scroll interne → l'impression CSS du navigateur donne une page blanche.
On génère donc un **rendu clair A5 dédié** (`FicheA5`), capturé en PNG (`html-to-image`) :

- **🖼️ Image A5** → télécharge `fiche-<titre>.png` (à enregistrer / partager — idéal iPhone).
- **🖨️ Imprimer** → document A5 autonome (`@page size A5`), prêt à imprimer ou « Enregistrer en PDF ».

⚠️ **Un brouillon n'est ni exportable ni imprimable** (addendum §1 bis) : il n'est pas encore un
`FicheSpec` valide. Ce n'est pas une restriction arbitraire — c'est ce qui empêche un demi-travail
d'entrer dans le circuit de révision.

## Pont SRS

Pied de fiche : **« 🃏 En faire des cartes »**.

- Depuis une **fiche ZETIS** : toujours **stub désactivé** (chantier SRS séparé, ADR-0015 §6).
- Depuis une **fiche de Massimo** : **actif** — c'est le point d'entrée ouvert par l'addendum.
  Les définitions passent telles quelles : **recto** le terme de ZETIS, **verso** la phrase de
  Massimo. C'est *sa* formulation qu'il révisera.

## Wireframes

### Lecture — la fiche, cours ouvert (écran 3)

```txt
┌─ 🗂️ <Matière> ───────────── Fiche 2/5 · [📖 Voir le cours] [‹] [›] ┐
│ ┌────────── Fiche (gauche) ─────────┐  ┌──── Cours (droite) ─────┐ │
│ │ <Chapitre> · <Titre> · 4ᵉ         │  │ 📚 Ton cours            │ │
│ │ ⭐ L'essentiel                     │  │ # <Titre>               │ │
│ │ 📖 Les mots à connaître            │  │ … markdown du cours …   │ │
│ │ 🔑 À retenir                       │  │                         │ │
│ │ ⚠️ Pièges à éviter                 │  │                         │ │
│ │ 💡 Un exemple                      │  │                         │ │
│ │ 🎩 Mnemonics                       │  │                         │ │
│ │ 📚 D'après ton cours               │  │                         │ │
│ │ [🃏] [🖼️ Image A5] [🖨️ Imprimer]  │  │                   [✕]   │ │
│ └───────────────────────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Atelier — la colonne (écran 4)

Jalons : `●` fait · `◍` en cours · `○` vide. Le rail relie les six ; l'étape ② est dépliée.

```txt
┌─ ← SVT · 🌱 Les séismes ─────────────────────────────────────────┐
│ 3 étapes sur 6 ont quelque chose   ▓▓▓▓▓▓▓▓░░░░░░░░              │
│                                                                   │
│ ●─┬ ① 🔑 À retenir                                     3 / 5  ›  │
│ ┊ ┊    · Un séisme vient d'une cassure brutale…                   │
│ ┊ ┊    · L'épicentre est le point à la surface…      ← aperçu     │
│ ┊ ┊                                                               │
│ ◍─┼ ② ⭐ L'essentiel                                    écrit  ⌄  │
│ ┊ ┊  ┌──────────────────────────────────────────────────────┐    │
│ ┊ ┊  │ 🪐 En deux phrases : c'est quoi, un séisme ?  [🔊]   │    │
│ ┊ ┊  │ Un séisme, c'est…                     ← amorce       │    │
│ ┊ ┊  │ ┌────────────────────────────────────────────────┐   │    │
│ ┊ ┊  │ │ …quand les roches cassent d'un coup.           │   │    │
│ ┊ ┊  │ └────────────────────────────────────────────────┘   │    │
│ ┊ ┊  │ ▓▓░░░░ de la place pour 3 lignes  [🎙️ Le dire]      │    │
│ ┊ ┊  │ ZETIS ne dit rien pendant que tu écris.              │    │
│ ┊ ┊  │ Je sèche sur cette étape                             │    │
│ ┊ ┊  └──────────────────────────────────────────────────────┘    │
│ ○─┼ ③ 📖 Les mots à connaître                           1 / 3  ›  │
│ ┊ ┊    ZETIS donne le mot, tu écris ce qu'il veut dire  ← amorce  │
│ ●─┼ ④ ⚠️ Pièges à éviter                              1 gardé  ›  │
│ ○─┼ ⑤ 💡 Un exemple                                      vide  ›  │
│ ○─┴ ⑥ 🎩 Mnemonics   [OCCASION TROUVÉE]                  vide  ›  │
│                                                                   │
│ [ZETIS, regarde ma fiche]   [J'ai fini pour aujourd'hui]          │
│ Tout est gardé au fur et à mesure — tu peux revenir demain.       │
└───────────────────────────────────────────────────────────────────┘
```

⚠️ L'étape ⑥ **n'est pas rendue du tout** quand aucune occasion n'a été détectée — elle n'apparaît
pas grisée. Sur la plupart des leçons, la colonne fait **cinq** étapes.

### Atelier — étape ① dépliée (le choix)

```txt
│ ◍─┬ ① 🔑 À retenir                                      3 / 5  ⌄ │
│ ┊ ┊  🪐 Ton cours fait 3 pages. Une fiche, c'est 5 idées.  [🔊]  │
│ ┊ ┊     Lesquelles tu gardes ?                                   │
│ ┊ ┊  ① Un séisme vient d'une cassure brutale…            [✕]    │
│ ┊ ┊  ② L'épicentre est le point à la surface…            [✕]    │
│ ┊ ┊  ③ La magnitude, c'est la force du séisme.           [✕]    │
│ ┊ ┊  ④ …                                                         │
│ ┊ ┊  ⑤ …                                                         │
│ ┊ ┊  LES PHRASES DE TON COURS                                    │
│ ┊ ┊  [ Le 26 décembre 2004, un séisme a frappé Sumatra.       ]  │
│ ┊ ┊  [ Il y a des répliques après le séisme principal.        ]  │
│ ┊ ┊  [ …9 autres…                                             ]  │
│ ┊ ┊  [Aide-moi]   Je sèche sur cette étape                       │
```

### Le retour d'analyse (écran 5)

```txt
┌─ 🪐 J'ai regardé. Deux choses, pas plus.                  [🔊] ─┐
│ ⭐ Ton idée sur l'épicentre, c'est celle que ton cours met en   │
│    gras. Tu as attrapé la plus importante.                      │
│ ┌─ ✍️ UNE PHRASE À TOI ───────────────────────────────────────┐ │
│ │ « ▓La magnitude mesure l'énergie libérée…▓ »                │ │
│ │ Ces mots viennent de ton cours, mot pour mot.               │ │
│ │ Tu peux le dire avec les tiens ?                            │ │
│ │ [Aide-moi]   Je garde ma phrase                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─ 🧩 UNE IDÉE QUI MANQUE ────────────────────────────────────┐ │
│ │ Il reste une idée importante du côté de ce qui se passe     │ │
│ │ AVANT le séisme. Tu vois laquelle ?                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [Voir la fiche de ZETIS]  [Garder ma fiche comme ça]            │
└─────────────────────────────────────────────────────────────────┘
```

## Données API (élève)

**Existant** — gate `validated` sur les fiches ZETIS :

- `GET /api/student/fiches/summary` — decks (compteur + `new_count`).
- `GET /api/student/subjects/{slug}/fiches` — deck d'une matière.
- `GET /api/student/fiches/{id}` — la fiche (404 si non lisible).
- `POST /api/student/fiches/{id}/seen` — marque vue.
- `GET /api/student/lessons/{id}/cours` — cours source.

> ⚠️ Les trois premiers lisent aujourd'hui `validation_status == 'validated'` **chacun avec leur
> propre clause**. L'addendum §2 impose de les faire passer par **un prédicat unique et partagé**
> avant d'ajouter quoi que ce soit — sans quoi soit la fiche de Massimo lui est invisible, soit
> une fiche ZETIS non validée fuit.

**Livrées par la slice 1** (contrat que cette page exige) — détail dans `API_SPEC.md` :

- `POST /api/student/fiches/draft` — ouvre ou récupère le brouillon d'une leçon.
- `PATCH /api/student/fiches/draft/{id}` — sauvegarde **partielle** (`FicheDraft`, aucune borne
  minimale). Appelé à chaque geste ; c'est lui qui rend la reprise possible.
- `GET /api/student/fiches/draft/{id}/candidates?section=points_cles` — les 12 phrases candidates.
- `POST /api/student/fiches/draft/{id}/review` — « regarde ma fiche » → `FicheFeedback`.
- `POST /api/student/fiches/draft/{id}/finish` — `FicheDraft` → `FicheSpec` ; 422 si le schéma
  strict ne passe pas.
- `POST /api/student/fiches/{id}/rework` — ouvre une **nouvelle version** d'une fiche finie.
- `GET /api/student/lessons/{id}/fiche-zetis` — le corrigé. ⚠️ **Aucune condition de tentative**
  (addendum §3 révisé) : pas de 403, et **aucun état « a-t-il tenté ? » à tenir côté serveur**.

Pilotage Papa (génération, éditeur structuré) : voir `API_SPEC.md` § Fiches et
`docs/design/design-system.md` § Pilotage.

## Ce que la slice 1 rend RÉELLEMENT (2026-08-13)

Cette page décrit l'écran **complet**, à six étapes. La slice 1 en livre **une**, et l'écart est
volontaire :

| Décrit ici | État en slice 1 |
|---|---|
| Étape ① 🔑 À retenir (choix, 12 → 5) | ✅ livrée, au glisser-déposer |
| Étapes ② à ⑥ | ❌ **pas rendues du tout** — ni grisées : une étape visible mais morte est une promesse que le produit ne tient pas (même principe que « Mnemonics », §10) |
| Retour d'analyse | ✅ **réussites seules**. `recopie` est reporté : en mode « je choisis », les points-clés *sont* des phrases du cours, il flaguerait les cinq |
| Pont « 🃏 En faire des cartes » | ❌ reporté en slice 2, avec `definitions` qui lui donne sa forme recto/verso |
| Écran 2 — une tuile par leçon, 4 états | ❌ non implémenté : `FicheSubjectPage` liste des **fiches**, pas des leçons. L'entrée passe donc par **le cours** (§12, « se crée sans réserve ») |
| Tiroir de cours dans l'atelier | ❌ hors périmètre — `CoursPanel` n'a pas été touché |

## Points ouverts

- ~~Entrer dans l'atelier après avoir lu.~~ **Tranché le 2026-08-12 : lire avant de fabriquer,
  c'est ok.** Les deux entrées (fiche ZETIS lue, cours) s'ouvrent sans condition ; ce qui reste
  du §3, c'est un **défaut d'ouverture**, pas un gate. **À surveiller en usage** : s'il ouvre
  toujours la fiche ZETIS et n'entre jamais dans l'atelier, c'est le défaut qui n'oriente pas
  assez — pas l'enfant qui triche.
- Le **tiroir de cours** de l'atelier et la **colonne** du viewer partagent `CoursPanel` : deux
  `variant`, ou extraction en deux composants ? À trancher à l'implémentation — le composant n'a
  aujourd'hui **qu'un seul consommateur**, le coût est faible maintenant, pas plus tard.
- La **surface Papa** de lecture des fiches de son fils est décidée (addendum §2 : lecture seule,
  jamais Valider / Rejeter / Éditer) mais **pas dessinée** — elle relèvera de `docs/frontend-papa/`.
