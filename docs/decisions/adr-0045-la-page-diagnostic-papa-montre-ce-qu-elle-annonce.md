---
id: "0045"
titre: "La page Diagnostic de Papa montre ce qu'elle annonce"
type: surface
statut: accepte
date: 2026-08-08
pr: 99
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0045 — La page Diagnostic de Papa montre ce qu'elle annonce

## Statut

**Accepté — 2026-08-08.** Les neuf décisions sont **gelées**, y compris la **Décision 7**, qui ne
figurait dans aucun document du dépôt avant ce cadrage.

> Historique : Proposé — 2026-08-08, **le même jour**. Le chantier a été cadré dans l'ordre du
> rituel — **maquette, puis spec, puis cet ADR** — sans une ligne de code, et la Décision 7 a été
> soumise au commanditaire **avec sa preuve à l'écran** avant toute écriture. C'est ce qui autorise
> l'acceptation sans délai.
>
> ⚠️ **La Décision 7 mérite d'être relue comme ce qu'elle est** : elle n'a pas été déduite d'un
> document, elle a été **trouvée en regardant la page**. Le commanditaire avait explicitement
> ouvert cette possibilité en demandant que la relecture visuelle tranche le compte des
> optimisations. Elle a tranché.

⚠️ **Accepté ≠ livré.** La décision est figée ; **rien n'est implémenté**. Le chantier est décrit
par `prompts/claude-code/prompts-claude-code-adr-0045.md`, en deux sessions, et n'a pas démarré.
Ne pas lire ce statut comme « c'est en place ».

> S'appuie sur : `adr-0043` (qui a livré cette page — aucune de ses décisions n'est rouverte),
> `adr-0028 §5` (`KpiFocusCard` : *« une mesure ET le contrôle qui montre ce qui la fonde »*),
> `adr-0039` (né du défaut exact : des nombres qui mentaient, invisibles parce que non cliquables),
> `adr-0030` (règle « NOUVEAU jamais DÛ »), `adr-0014 Décision 3` (un refus n'efface rien).
>
> Maquette : `docs/frontend-papa/mockup/mockup-papa-diagnostic-v4-optimisations.html`.
> Spec : `docs/frontend-papa/page-diagnostic.md`, passages marqués `[0045]`.

## Contexte

La page `/diagnostics` de Papa a été livrée le 2026-08-08 (`adr-0043`, PR #99). **La relecture
visuelle humaine du même jour** — la première depuis quatre merges — a sorti cinq défauts en
quelques minutes. Le cinquième visait la page de Massimo et a été traité en premier, sur décision
du commanditaire (`adr-0044`, PR #100). **Les optimisations de la page Papa ont été explicitement
différées « après celui-ci ».** C'est ce chantier.

### ⚠️ Le chantier s'annonçait en quatre optimisations, et il n'en portait que trois

« Les quatre optimisations de la page Diagnostic de Papa » est écrit **cinq fois** dans le dépôt —
`adr-0044:276`, `docs/frontend-massimo/page-diagnostic.md:362`,
`prompts/claude-code/prompts-claude-code-adr-0044.md:325`, `MEMORY.md:101` et `:172`. Les cinq
fois, la parenthèse qui les énumère n'en nomme que **trois**, et le `BACKLOG.md` (§ *Optimisations
de la page Diagnostic PAPA*) n'en numérote que trois.

L'origine la plus probable est une recopie du « **4 jauges** » du premier item, propagée de proche
en proche. **Ce n'est pas un détail** : un chantier qui s'appelle par un nombre et dont un quart est
introuvable ne peut pas ouvrir un périmètre honnête.

Le commanditaire a tranché : **cadrer les trois connus, et laisser la relecture visuelle décider
s'il y a une quatrième**. Elle a décidé — voir le constat n° 4. **Il y en a bien quatre.**

## Constat read-before-code

Fait le 2026-08-08, sur la page live (`papa-dev` + `backend-dev`, données de dev réelles) **et**
dans le code. Chaque point a été vérifié aux deux endroits.

### 1. Les jauges ne sont pas cliquables — et deux d'entre elles annoncent l'invisible

`BandeauInstrument.tsx:19` : chaque jauge est un `<div>` nu. Aucun `onClick`, aucun `<button>`,
aucun curseur. Cliqué à l'écran : rien ne bouge.

Deux populations sont **annoncées et montrables nulle part** : « 12 proposés non passés » (dans le
détail de la 1ʳᵉ jauge) et « dont 4 sans contenu produisible » (dans celui de la 3ᵉ). C'est le
défaut littéral dont l'`adr-0039` est né, et le dépôt a déjà la réponse écrite dans
`adr-0028 §5`.

### 2. 🔴 Le cran « proposé » n'a aucune action — pas une seule

`PanneauPassation.tsx:64` : le lien « Ouvrir dans la file de relecture → » est rendu sous
`{genere && …}`. Le cran `propose` tombe donc dans la branche vide.

À l'écran : un panneau de **trois lignes**, et **toute la colonne droite vide jusqu'en bas**. La
maquette v3 prescrivait **deux actions par cran non mesuré** ; **une seule sur quatre** est
implémentée.

| Cran | Action principale | Action secondaire | Livré |
|---|---|---|---|
| généré | Ouvrir dans la file de relecture → | Refuser ce lot | la principale seule |
| proposé | Voir la page de Massimo → | Retirer la proposition | **rien** |

### 3. « en attente · non passé » ne nomme personne

`RailPassations.tsx:15-19` — `CRAN_TEXTE` donne `genere → {etat:"à relire", note:"non proposé"}` et
`propose → {etat:"en attente", note:"non passé"}`. Deux paires de deux mots, même casse, **même
gris** (`text-papa-muted` sur les deux lignes, `:133-134`) — et qui désignent des acteurs
**opposés**. Douze lignes d'affilée portent le second libellé sur les données de dev.

La maquette v3 avait la bonne formulation **dans sa légende** — « *chez Massimo · pas encore
passé* » — et cette légende n'a jamais été implémentée.

### 4. 🔴 LA QUATRIÈME — la jauge compte des matières « générées » et écrit « mesurées »

Trouvée à l'écran pendant ce cadrage. Dans **une seule et même carte** :

> **Matières mesurées au moins une fois** — **2 / 8** — *12 proposés non passés · 5 matières
> **jamais mesurées***

**8 − 2 = 6. L'écran dit 5.**

Au code, ce sont deux populations différentes : `service.py:1013` — `mesurees` = les matières ayant
au moins une **tentative** ; `service.py:1058` — `jamais_generees` = celles sans aucun **quiz**. Le
front rend la seconde avec le mot de la première (`BandeauInstrument.tsx:59`), alors que le rail
nomme correctement le même groupe « **Jamais généré** ».

La sixième est **Anglais** : diagnostic généré et proposé le 5 août, jamais passé. **Générée ✅,
mesurée ❌** — elle tombe dans le trou entre les deux mots.

C'est le même sang que les trois autres : **un nombre qui dit autre chose que ce qu'il compte**. Et
c'est invisible sans faire la soustraction à l'écran — **aucun test ne peut voir ça**, ce qui est
précisément pourquoi il a survécu à la livraison.

### 5. `reject` accepte un diagnostic déjà validé — l'hypothèse du `BACKLOG` tient

`set_validation` (`service.py:389`) n'a **aucune précondition d'état** : `reject` écrit
`validation_status = "rejected"` quel que soit l'état de départ. « Retirer la proposition » sur un
diagnostic `validated` fonctionne donc, et le client existe déjà (`lib/diagnostic.ts:120`,
`rejectDiagnostic`).

⚠️ **Mais rien n'empêche Massimo de le passer entre le chargement de la page et le clic de Papa.**
Le cas est réel, pas théorique : c'est une page qu'on laisse ouverte.

### 6. Le cran « généré » n'existe pas en base de dev

`a_relire` vaut **zéro** : les 12 non-passés sont **tous** au cran « proposé ». La jauge le masque
(le segment n'est rendu que `> 0`), donc rien à l'écran ne le signale.

🔴 **Conséquence directe sur la vérification** : « Refuser ce lot » — la moitié de l'optimisation ②
— **ne peut pas être vue en vrai sans créer un diagnostic au premier cran**. Sans cette création,
cette moitié partirait non vue, exactement comme le bandeau Massimo de la PR #79.

### 7. Une ligne de la spec était fausse, et personne ne pouvait le voir

`docs/frontend-papa/page-diagnostic.md` portait *« deux de ces trois crans n'existent pas dans le
code »* — faux depuis la session A de l'`adr-0043` (`quizzes.validation_status`, migration
`a9b0c1d2e3f4`). La spec disait décrire l'existant tout en décrivant un état antérieur.

C'est le même angle mort que l'`adr-0044` avait nommé : **rien dans le dépôt ne compare une spec à
son implémentation**, donc une spec fausse ne rougit nulle part. Corrigé dans la spec pendant ce
cadrage — et **écrit ici plutôt que corrigé en silence** : une phrase fausse retirée sans trace ne
laisse personne se demander combien il y en a d'autres.

## Alternatives considérées

### (a) Réutiliser `KpiFocusCard` tel quel — écartée, mais son principe est repris

Le composant existe (`components/dashboard/KpiFocusCard.tsx`) et porte exactement la bonne
doctrine. Mais ses props sont celles du **dashboard** : `delta`, `deltaTone`, `spark`, `hint`,
`info`, `tone`. Les jauges du Diagnostic n'ont ni delta ni sparkline, et l'une d'elles a un rendu
**propre au chantier** — les hachures du mur. Le réutiliser voudrait dire soit passer six
`undefined`, soit généraliser un composant pour un seul second usage.

**Le principe est repris ; le composant ne l'est pas.** C'est une abstraction prématurée que
`CLAUDE.md` demande explicitement d'éviter.

### (b) Faire des jauges des liens vers d'autres pages plutôt que des filtres — écartée

Uniforme, simple, et **faux pour trois jauges sur quatre** : la population de « 12 proposés non
passés » est **déjà à l'écran**, dans le rail, sous les yeux du lecteur. L'envoyer ailleurs pour
voir ce qu'il a devant lui serait un détour, et une seconde surface à tenir.

Le lien reste le bon geste **là où la population n'est pas faite de diagnostics** — les lacunes.
D'où la règle mixte de la Décision 1, assumée comme telle.

### (c) Rendre les quatre jauges cliquables, par symétrie — écartée

C'est l'erreur que la 4ᵉ jauge appelle. Elle vaut **zéro par décision** (station ③,
`EMITTED_TRIGGERS` sans `evidence`), et la rendre cliquable ferait chercher une population qui
n'existe pas — puis demander l'ouverture d'un déclencheur écarté **en connaissance de cause**.

Le dépôt a déjà payé cette leçon : une symétrie apparente est un mauvais motif de décision. La
jauge porte donc une mention `inerte` — **l'absence d'affordance se dit, elle ne se déduit pas.**

### (d) Ajouter un compteur de jours d'attente (« chez Massimo depuis 6 jours ») — écartée

C'est la suite naturelle de la Décision 6, et elle est **interdite** : un décompte de non-fait ne
décroît que par le travail et grossit quand Massimo ne vient pas (`CLAUDE.md` §gamification, règle
« NOUVEAU jamais DÛ » de l'`adr-0030`). La date de proposition est déjà affichée — elle dit le même
fait sans le transformer en dette.

⚠️ Le témoin de sidebar de l'`adr-0030-temoins-nouveaute-navigation` (Amendement 1) est une **exception nommée et
bornée**, sur l'interface de Massimo. Elle ne s'étend pas ici, et l'addendum le dit.

### (e) Un endpoint qui sert les populations filtrées — écartée

`GET /diagnostics/apercu` sert **déjà** tout ce qu'il faut : le `cran` de chaque ligne, la matière,
et la liste des matières jamais générées. Le focus est un `useState` sur une liste en mémoire —
le même geste que les pastilles de matière, qui filtrent déjà sans aller-retour.

### (f) Rendre le bloc « Jamais généré » actionnable — écartée, et consignée

Ses 5 lignes sont des `<div>` inertes (`RailPassations.tsx:152`) : c'est un cul-de-sac de la même
famille que le constat n° 2. **Écartée parce que l'action existe déjà** — « Lancer un diagnostic »
est en tête de page, et la modale demande la matière. Un second chemin vers le même geste
ajouterait une surface sans ajouter une capacité.

## Décision

### 1. Une jauge qui annonce une population doit pouvoir la montrer

**La règle, en une phrase :** une jauge **filtre le rail** quand sa population est faite de
diagnostics ; elle **renvoie par un lien nommé** quand sa population vit sur une autre page ; elle
**ne fait rien** quand elle vaut zéro par décision — et alors elle le dit.

| Jauge | Geste | Ce qu'elle montre |
|---|---|---|
| Matières mesurées `2 / 8` | **filtre** | les matières sans aucune mesure |
| Lecture la plus ancienne `37 j` | **sélection** | ouvre cette passation — elle en désigne **une**, pas un ensemble |
| Lacunes ouvertes `10` | **lien** | `/lacunes?source=diagnostic` |
| Lots déclenchés `0` | **aucun** | rien, et c'est écrit |

### 2. Les sous-populations du détail sont des focus à part entière

« 12 proposés non passés » et « 5 matières jamais générées » deviennent des **pastilles cliquables**,
pas une phrase. Ce sont **elles** que le lecteur ne pouvait pas voir : le nombre principal, lui,
n'a jamais menti.

> `[amendement — Session A, confirmé par le commanditaire le 2026-08-08]`
> **« N diagnostics à relire » est une pastille cliquable elle aussi.** Elle ne figurait pas ici
> parce que le `BACKLOG` n'avait relevé que deux populations invisibles — `a_relire` valait **zéro**
> au moment du constat, et la jauge masque un segment nul. Mais elle annonce une population, cette
> population **est dans le rail** (cran « généré »), et la laisser inerte à côté de deux pastilles
> actives aurait contredit la Décision 1 dans le geste même qui la pose.
>
> ⚠️ C'est aussi le seul chemin qui rende le cran « généré » atteignable en un clic — ce dont la
> vérification de la Décision 5 a besoin (constat n° 6).

### 3. Un focus est un filtre NOMMÉ, jamais une troncature

Un bandeau dit ce que le rail montre et **comment en sortir** (« Tout revoir ✕ »). Aucune ligne ne
disparaît en silence.

C'est la règle que l'`adr-0044` alternative (c) a déjà écrite pour la page de Massimo : *si une
surface borne ce qu'elle montre, elle doit dire ce qu'elle laisse dehors*. Un filtre annoncé et
réversible n'est pas une coupe.

### 4. La 4ᵉ jauge reste sans geste, et dit POURQUOI sur la carte

Hachures, gris, aucune couleur d'alerte — inchangé. Voir l'alternative (c).

> 🔴 **AMENDÉE à la relecture visuelle HUMAINE du 2026-08-08.** Cette décision prescrivait une
> mention **`inerte`** sur la carte, au motif que « l'absence d'affordance se dit ». Le
> commanditaire a répondu, devant l'écran : *« je ne comprends pas la 4ᵉ »*.
>
> **Le mot `inerte` était la mauvaise réponse à la bonne question.** Il annonce que la carte ne
> réagit pas, sans dire pourquoi — et il ajoutait du vocabulaire technique à une carte qui en
> souffrait déjà de deux autres façons :
>
> - « **Lots de production déclenchés par une mesure** » est le vocabulaire **interne** du dépôt ;
> - « **et c'est voulu — voir ③** » renvoie à une section qu'on ne voit qu'**après** avoir
>   sélectionné une passation passée **et** scrollé : un pointeur mort depuis le haut de la page.
>
> **La carte doit se comprendre SEULE.** Elle porte donc un titre en langage de lecteur — *« Ce
> qu'une mesure a fait produire à ZETIS »* — et **sa raison en toutes lettres, sur elle** : *« rien,
> et c'est une décision : ZETIS ne se commande pas de contenu sur sa propre mesure »*. Aucun renvoi,
> aucune mention `inerte`.
>
> ⚠️ **Ce qui ne change pas** : elle reste **sans geste**, et pour la raison de l'alternative (c).
> Un test-verrou tient les deux moitiés — pas de `<button>`, **et** la raison présente sur la carte.

### 5. Chaque cran non passé porte deux actions

Sur les **deux** crans, pas seulement celui qui en a déjà une :

| Cran | Action principale | Action secondaire |
|---|---|---|
| **chez toi** · à relire | Ouvrir dans la file de relecture → | Refuser ce lot |
| **chez Massimo** · pas encore passé | ~~Voir la page de Massimo →~~ **DIFFÉRÉE** | Retirer la proposition |

Les deux secondaires appellent `POST /api/diagnostics/quizzes/{id}/reject` — **qui existe, dont le
client existe, et qui n'a aucune précondition d'état** (constat n° 5).

> 🔴 **AMENDÉE au read-before-code de la Session B, 2026-08-08 — décision du commanditaire.**
> « Voir la page de Massimo → » **ne peut pas rendre ce qu'elle annonce**, pour deux raisons dont
> la seconde est rédhibitoire :
>
> 1. **aucun lien inter-app n'existe** — la seule variable du front Papa est `VITE_API_URL`, il n'y
>    a ni `VITE_MASSIMO_URL` ni le moindre lien vers l'app enfant dans le dépôt ;
> 2. 🔴 **le rôle l'interdit** — la page de Massimo appelle des routes `require_child`, qui
>    répondent **403 « Accès réservé à l'espace de Massimo. »** à un rôle parent
>    (`auth/deps.py:55`). Papa y verrait un écran vide ou une erreur, jamais ce que Massimo voit.
>
> **Trois cellules sur quatre sont livrées**, et c'est le défaut réel qui se referme : le cran
> « proposé » passe de **zéro** action à une. La quatrième demande une **décision produit** — un
> lien inter-app assumé, ou un aperçu côté Papa de ce que Massimo voit — qui n'appartient pas à ce
> chantier. Elle va au `BACKLOG.md`.
>
> ⚠️ **Ce que cet amendement ne dit pas** : que l'action était une mauvaise idée. Elle reste la
> bonne réponse au besoin (*vérifier ce que l'enfant a sous les yeux*) ; c'est sa **mise en œuvre**
> qui n'existe pas, et qu'aucune ligne de ce chantier ne peut inventer sans rouvrir la frontière
> des rôles.

🔴 **« Retirer la proposition » demande une confirmation, et sa formulation ne désigne aucun
manquement de Massimo.** Le refus va au lot, jamais à l'enfant.

🔴 **Un diagnostic PASSÉ n'offre jamais cette action**, et le rail le montre au troisième cran quel
que soit son `validation_status` : **une mesure existante ne se cache pas.** C'est la réponse à la
course décrite au constat n° 5.

### 6. L'acteur passe avant l'état

| Cran | Ligne 1 — l'acteur, en couleur | Ligne 2 — l'état, en gris |
|---|---|---|
| généré | **chez toi** (ambre) | à relire |
| proposé | **chez Massimo** (bleu) | pas encore passé |

Ambre = la balle est chez Papa. Bleu = elle est chez Massimo, on attend. **La couleur ne porte
jamais l'information seule** : le mot est écrit. La légende du rail dit la même règle, et le
sur-titre du panneau reprend la même formulation — une ligne sélectionnée et son panneau ne se
nomment pas différemment.

**Aucun compte de jours, sous aucune forme** — voir l'alternative (d).

### 7. Une jauge écrit le mot de ce qu'elle compte

Le détail de la première jauge dit « **jamais générées** », alignée sur le mot que le rail emploie
déjà (« Jamais généré »).

Et le focus `non-mesurees` de la Décision 1 rend l'addition **vérifiable à l'œil** : il affiche les
matières jamais générées **plus** celles générées jamais passées. Le lecteur compte au lieu de
croire. **C'est la décision née de ce cadrage, et c'est celle qui appelle l'arbitrage.**

### 8. Zéro migration, zéro endpoint neuf, ~~zéro champ ajouté au contrat~~

**C'est l'invariant du chantier.** Les quatre défauts sont des défauts de **surface**, pas de
capacité — ce qui est aussi pourquoi aucun test ne les voyait. Si une session en vient à proposer
une migration, c'est qu'elle a quitté le périmètre.

> 🔴 **AMENDÉE à la relecture humaine du 2026-08-08 — décision du commanditaire.**
> **« Zéro migration » et « zéro endpoint » tiennent. « Zéro champ ajouté au contrat » est rompu**,
> et il fallait le rompre.
>
> **Ce qui l'a forcé** : la Décision 1 a rendu cliquable la jauge des lacunes, et les deux renvois
> mènent à `/lacunes`. Or `LacunesPage` ne lisait que `?subject=` — `source` et `contenu` étaient
> **ignorés**. Le renvoi « dont N sans contenu → » affichait donc **toutes** les lacunes.
>
> 🔴 **C'est le défaut du chantier, reproduit par le chantier.** L'`adr-0039` est né de *« des
> nombres qui mentaient, invisibles parce que non cliquables »*. Rendre le nombre cliquable pour
> qu'il mène à **un autre nombre** est **pire** que l'état d'origine : avant il était invisible,
> après il est **contredit**. Un invariant technique ne vaut pas qu'on livre ça.
>
> ⚠️ **Ce que la vérification a corrigé dans le diagnostic initial** : j'avais annoncé « la page en
> montre 18 » — **c'était une mauvaise lecture** d'un nombre en petite police. Compté en base : le
> premier renvoi **coïncide aujourd'hui** (10 = 10), *par accident*, toutes les lacunes de dev
> venant d'un diagnostic ; il divergerait dès qu'une mission en ouvrirait une. **C'est le second
> renvoi qui ment maintenant** — 4 annoncées, 10 montrées. Le défaut est donc réel, et plus étroit
> que dit.
>
> **Le coût, et ce qu'il a produit de bon** : `source` était **gratuit** (`open_gaps` sélectionne
> déjà `Gap`). `content_state` a demandé de sortir `etat_contenu` de `diagnostics.service`, où elle
> était **privée**, vers un module **neutre** — `app/modules/content_state.py`. Ni
> `lesson_resolution` (qui écrit refuser les filtres de statut) ni un import inter-domaines : une
> écriture, deux lecteurs. **Ce déménagement est bon indépendamment de ce chantier.**
>
> 🔴 **Le piège qui justifie à lui seul le test de contrat** : `response_model=list[OpenGapOut]`
> **filtre en silence** tout champ non déclaré. Les deux clés étaient produites par le service et
> disparaissaient à la sérialisation — aucune erreur, aucun avertissement. Seul un test qui
> interroge la **route** l'a montré ; lire le service ne suffisait pas.

### 8 bis. `[amendement]` Un filtre d'origine ne se replie JAMAIS

Le filtre par matière de `/lacunes` retombe sur « toutes » quand le slug ne correspond à rien —
c'est écrit et justifié : une faute de frappe ne doit pas vider l'écran. **`source` et `contenu` ne
partagent pas ce repli.** Ici, montrer « tout » quand le filtre ne trouve rien serait exactement le
défaut corrigé : annoncer une population et en montrer une plus large.

**Rien à montrer se montre**, et l'état vide dit **lequel** des deux cas il rend — « aucune lacune
de ce type » n'est pas « aucune lacune ouverte ».

### 9. Ce qui ne change pas

- **Le rail à trois crans**, son groupement par mois, son ordre servi par le serveur.
- **Les trois stations** du panneau, la portée en escalier, le **mur** de la station ③.
- **Le gate de relecture de l'`adr-0043`** — intact.
- **`GET /diagnostics/apercu`** — son contrat ne bouge pas.
- ~~**Les pastilles de matière** — elles continuent de filtrer, et se composent avec les focus.~~

> 🔴 **AMENDÉE au read-before-code de la Session A, 2026-08-08.** Cette ligne posait une
> **précondition fausse** : les pastilles filtrent, mais **mal**. Trois défauts vus à l'écran en
> filtrant sur une matière sans diagnostic :
>
> 1. le rail affiche *« Aucun diagnostic pour l'instant. Lance-en un »* — **faux**, il y en a 18,
>    aucun dans cette matière : **l'état vide du filtre est rendu comme l'état vide du dépôt** ;
> 2. le bloc « Jamais généré » n'est **pas filtré** — `DiagnosticsPapaPage.tsx:130` passe
>    `apercu.jamais_genere` brut là où `railVisible` filtre ;
> 3. le panneau de droite continue d'afficher une matière que le filtre exclut.
>
> **Les deux premiers sont ABSORBÉS par la Session A**, et ce ne sont pas des extensions : la
> **Décision 3** est *inimplémentable* sans eux. Un focus croisé avec une pastille ferait cohabiter
> deux phrases contradictoires — le bandeau *« le rail ne montre que les 12 »* et le rail
> *« aucun diagnostic pour l'instant »* — et le focus `jamais-generees` annoncerait 5 matières en
> en montrant 5 là où le croisement en veut 1, ce qui fausserait aussi le verrou central.
>
> **Le troisième est SIGNALÉ, NON TRAITÉ.** Ma mécanique ne peut pas le produire : la jauge ②
> **efface les deux filtres** avant de sélectionner, donc la sélection est toujours visible. Le cas
> pré-existant — une pastille seule laissant un panneau périmé — reste ouvert et va au `BACKLOG.md`.
>
> **Pourquoi c'est écrit ici et pas corrigé en silence** : le constat n° 7 de cet ADR reproche
> exactement cela à la spec. Une précondition fausse retirée sans trace ne laisse personne se
> demander combien il y en a d'autres. Patron de l'`adr-0044` : *une décision unique, dans le
> chantier qui la découvre* — pas d'addendum séparé.
>
> ⚠️ La ligne d'index de `DECISIONS.md` reste à toucher **sur `main`**, à la clôture.

### 10. `[amendement]` Deux préconditions entrent au périmètre

- **L'état vide du rail distingue deux situations** : *aucun diagnostic dans le dépôt* et *aucun
  sous les filtres actifs*. La seconde dit **ce qui filtre**, et comment en sortir.
- **Le bloc « Jamais généré » subit les mêmes filtres que le rail** — pastille de matière **et**
  focus.

Rien d'autre du filtre par matière n'est touché.

## Périmètre

**Dans** : le bandeau des 4 jauges et ses focus, le filtrage du rail, les libellés des deux crans
non passés et la légende, le sur-titre et les deux actions des panneaux sans mesure, et le mot
« générées » de la première jauge.

**Hors** :

- le **bloc « Jamais généré »** en lignes inertes — alternative (f), écartée en connaissance de cause ;
- le « **37 j** » — troncature `.days` défendable, pas un défaut ;
- le **N+1** de `GET /quizzes` et le plafond en dur de `GET /results` — au `BACKLOG.md` ;
- les **14 défauts du module `diagnostics`** au `BACKLOG.md`, dont aucun n'est traité ici ;
- l'**écran de passation**, la **page Diagnostic de Massimo** (`adr-0044`, livrée) ;
- l'**anti-triche du diagnostic** — chantier **suivant**, décidé le 2026-08-08 : sortie d'écran,
  temps par question, verbalisation, et audit de ce qui récompense encore un bon score. Consigné
  au `BACKLOG.md` ;
- le **multi-enfant**.

## Conséquences

### Positives

- Les deux nombres qui annonçaient l'invisible peuvent enfin montrer leur population.
- Un cran non passé cesse d'être un cul-de-sac : quatre gestes au lieu d'un.
- Papa sait d'un coup d'œil **chez qui** est la balle, sur douze lignes qui se ressemblaient.
- Une addition fausse à l'écran depuis la livraison se referme — et devient **vérifiable**.
- **Zéro migration, zéro endpoint** : le chantier est petit, et c'est ce qui le rend sûr.

### Négatives / coûts assumés

- **La règle de la Décision 1 est mixte** (filtre / lien / rien). Trois mécaniques dans un même
  bandeau, ce qui se défend par population mais se retient moins bien qu'une règle unique.
- **Un focus de plus à composer avec les pastilles de matière.** Deux filtres sur la même liste :
  leur intersection doit être pensée, et l'état vide qui en résulte doit être écrit.
- **Trois zones cliquables dans la première jauge** (la valeur, plus deux pastilles). C'est dense,
  et c'est le prix de la Décision 2.
- **Le cran « généré » n'est pas exerçable en dev** : il faudra en créer un pour voir « Refuser ce
  lot », sinon la moitié de l'optimisation ② part non vue (constat n° 6).
- **La Décision 7 corrige un libellé qu'aucun test ne tenait**, et rien n'empêchera la prochaine
  session de le remettre à « mesurées » — sauf le test-verrou que le prompt exige.

## Le signal qui dirait qu'on s'est trompé

- **Papa n'utilise jamais les focus** — le bandeau reste décoratif. Alors regarder si les
  populations annoncées sont les bonnes, avant d'accuser le clic.
- **Papa clique un focus et ne sait plus revenir** — le bandeau « Tout revoir » n'est pas vu.
  Alors le rendre plus présent, jamais supprimer le filtre pour revenir à la liste plate.
- **« Retirer la proposition » est utilisé souvent** — les diagnostics proposés ne sont pas les
  bons. Le défaut serait alors dans la **génération**, pas dans cette page.
- **Papa demande où sont passés les jours d'attente** — l'alternative (d) aurait tranché contre un
  besoin réel. La réponse resterait la date, pas le décompte : c'est une règle produit, pas une
  contrainte technique.
- **Un lecteur refait la soustraction `matieres_total − matieres_mesurees` et retombe sur un
  écart** — alors la Décision 7 aura traité le mot sans traiter le fond, et il faudra regarder si
  les deux populations doivent vraiment cohabiter dans une même carte.

## Suivi

- Prompt de chantier : `prompts/claude-code/prompts-claude-code-adr-0045.md`.
- ⚠️ **Relecture visuelle humaine obligatoire avant la PR.** Ce chantier naît **entièrement** d'une
  relecture humaine, et sa quatrième décision a été trouvée à l'écran pendant son propre cadrage.
  Le livrer sans elle serait contredire son acte de naissance deux fois.
- ⚠️ **Créer un diagnostic au cran « généré »** avant la vérification — sans quoi « Refuser ce
  lot » ne sera pas vu (constat n° 6).
- **Chantier suivant, déjà décidé** : l'anti-triche du diagnostic, au `BACKLOG.md`.
