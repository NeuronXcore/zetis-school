# Page Massimo — Agenda (cahier de texte)

> Décision : `docs/decisions/adr-0025-agenda-scolaire.md`.
> Maquette validée : `mockup-page-agenda-massimo.html` — **elle fait autorité sur la forme**
> (hiérarchie, densité, anatomie d'un item, états visuels). Cette spec fait autorité sur le
> **fond** (routes, contrats, règles, états limites). En cas de divergence : la spec l'emporte
> sur le fond, la maquette sur la forme.

## Objectif

Un lieu unique où Massimo voit ce que l'école lui demande, l'inscrit lui-même en quelques
secondes, s'oriente sur une semaine glissante et anticipe les contrôles — **sans jamais lire
un score, un retard ou un compteur** (ADR-0025 §7).

L'agenda est la première **source exogène** du produit : ses dates viennent du collège, jamais
de ZETIS (règle de datation, ADR-0025 §4).

Routes :

```txt
/agenda                     → écran principal
/agenda/:id/preparer        → écran de préparation (LOT 2 — ne pas créer en Lot 1)
```

### Accès — deux portes dès le Lot 1

> **Révisé le 2026-07-29 par le commanditaire.** Cette section prévoyait initialement l'accès
> par le seul bandeau d'Accueil en phase 0, l'entrée de navigation n'arrivant qu'avec le
> pouvoir d'écrire (Lot 1 bis). Arbitrage retenu : **les deux, tout de suite.**

1. **Entrée de sidebar en position 2**, juste après Accueil, avant Matières. Contre-intuitif
   vis-à-vis du flux d'apprentissage, et assumé : l'agenda est le **déclencheur en amont**, pas
   une étape. Ce qui vient du collège doit être atteignable sans rebond.
2. **Résumé sur l'Accueil** (« Aujourd'hui / Demain », 3 items max, aucune date), qui ouvre
   `/agenda`.

Les deux ne font pas double emploi : la sidebar est un **chemin** (j'y vais quand je le
décide), le résumé est une **information** (je la vois sans y aller).

**Badge de nouveauté autorisé sur l'entrée — compteur d'arriéré toujours interdit.**
*Révisé le 2026-08-01 : l'interdiction antérieure (« aucune pastille de compteur, sous aucune
forme ») est révoquée par l'addendum ADR-0025 §12, qui la remplace par la distinction ci-dessous.*

- **Autorisé** — un badge chiffré comptant les items **arrivés depuis la dernière ouverture**
  (`agenda_last_seen_at`, high-water mark par élève, jamais servi à Papa). Il naît d'un geste de
  Papa et meurt d'un **regard** de Massimo. Forme identique aux autres entrées (ADR-0030) :
  plafonné `9+`, absent à zéro, sans pulsation, sans rouge.
- **Interdit** — tout compte d'items **non faits**, d'échéances non cochées ou d'arriéré, sous
  quelque forme que ce soit. Il ne décroîtrait que par le **travail** et contournerait par
  l'affichage l'invariant « non probant » tenu serveur (`agenda_item_missed` n'existe pas,
  ADR-0025 §3 et §7).

Le test qui sépare les deux : *une date qui passe sans que Massimo agisse change-t-elle le
compteur ?* Arriéré : oui. Nouveauté : non.

> Le badge **ne répond pas** à « qu'est-ce que j'ai à étudier ». Il retombe à zéro dès l'ouverture
> et y reste toute la semaine, échéances en cours comprises — c'est sa définition, pas un défaut à
> corriger (addendum §12.5). Cette question est servie par la section « À préparer » du résumé
> d'Accueil — ajoutée le 2026-08-01 précisément pour ça, avec les dates — et par la bande
> glissante ci-dessous ; aucune évolution de la navigation ne doit y répondre.

**Bottom-nav mobile : inchangée.** L'arbitrage « Agenda y entre-t-il, et à la place de quoi ? »
reste ouvert et lié à la réconciliation de `navigation.md`, restée au BACKLOG.

> ⚠️ `docs/frontend-massimo/navigation.md` porte l'avertissement **BROUILLON NON RÉCONCILIÉ**
> (modèle 5 verbes jamais confronté au code, cf. ADR-0024). **La sidebar réelle fait foi.**

> ⚠️ `docs/frontend-massimo/navigation.md` porte l'avertissement **BROUILLON NON RÉCONCILIÉ**
> (modèle 5 verbes jamais confronté au code, cf. ADR-0024). **La sidebar réelle fait foi.**
> Ne pas s'appuyer sur ce document pour placer l'entrée en phase 1 : vérifier l'existant.

## Règles UX (CLAUDE.md — interface enfant)

- Style verre Massimo (GlassPanel / NeonBackdrop, tokens `zetis-*`), pictogrammes de matière
  résolus par `lib/subjectIcons.ts` — jamais d'emoji ni de chemin d'asset en dur.
- **Aucun rouge, aucun « en retard », aucun « X/Y », aucun pourcentage, aucun total, aucune
  série.** Registre de libellés aligné sur ADR-0024 §5 : celui de l'enfant, jamais l'échec.
- **Aucun XP à la coche**, aucune célébration sonore ou animée à la coche : le geste est
  déclaratif, il ne se récompense pas (l'XP reste réservé aux activités prouvées serveur).
- Aucune notification, aucun rappel, aucun badge de compteur sur l'entrée de sidebar.
- Trois appareils, pas un (ADR-0024 §6) : iPhone, iPad, MacBook. La saisie doit être
  confortable au doigt **et** au clavier ; la bande lisible de 380 px à desktop.
- `prefers-reduced-motion` respecté sur toute animation (non négociable).

## Phase 0 — Massimo lit et coche, il ne saisit pas (ADR-0025 §10)

En Lot 1, **le composer n'existe pas** côté Massimo : Papa alimente l'agenda, ZETIS ne crée
aucun item, et la page se remplit du flux ZETIS non daté déjà fusionné dans la surface.

Massimo **coche** dès le premier jour — cocher n'est pas remplir, et c'est le seul geste qui rend
l'objet sien. Sans lui, l'objet n'aurait pas d'état (Papa est en 403 sur `done_at`).

🔴 **La croix ✕ ne vise que ce que Massimo a écrit LUI-MÊME** (`created_by == "student"`,
2026-08-11). En Lot 1 il ne saisit rien : **elle n'apparaît donc sur aucune carte**, et elle
revient d'elle-même à l'ouverture de la saisie.

> **Motif — l'ADR-0025 se contredisait à trente lignes d'intervalle.** Le §2c donne le masquage au
> titre de la **réciprocité** (Papa archive, l'enfant n'est pas passif sur sa page) ; le §1, qui
> justifie qu'on montre les dates à un enfant, écrit d'une échéance scolaire : *« elle existe déjà
> dans le monde de Massimo — écrite dans son agenda papier, annoncée en classe. La masquer ne
> supprime pas la pression : elle supprime seulement **son moyen de s'organiser**. »* Une croix sur
> un devoir de l'école faisait exactement ce que le §1 refuse. **On retire ce qu'on a écrit, pas ce
> que l'école a demandé** — le §2c n'est pas révoqué, il devient vrai.
>
> ⚠️ Les **doublons de saisie**, que le §2d rend *attendus*, restent traités par Papa — qui les
> crée, et que la grille prévient.

**Le masquage se RATTRAPE** (même date). Un bandeau « Masqué : *…* · **Annuler** » s'affiche sous
la bande pendant 20 s — un retour **après** le geste, jamais une confirmation avant : un dialogue
mettrait une friction sur chaque masquage, y compris les bons, et ne servirait à rien quand le
geste est volontaire puis regretté. Au-delà, **Papa peut rendre l'échéance** depuis son pilotage.

> 🔴 Jusque-là le geste était **sans retour, pour tout le monde** : aucune route ne le défaisait, et
> `dismissed_at` est hors des champs éditables des **deux** autorités — Papa ne pouvait que
> ressaisir. Le §2c tranchait « masquer ≠ supprimer » ; il n'avait rien dit de l'irréversibilité.

**Aucun composer grisé, aucune mention « bientôt ».** ADR-0024 §4 grise du *contenu non encore
produit* ; griser un composer griserait une *capacité retirée à l'enfant*. L'ouverture (Lot 1
bis, flag `AGENDA_STUDENT_ENTRY_ENABLED`) doit être un événement positif, pas la fin d'une
privation affichée.

## Anatomie de l'écran

Ordre vertical imposé :

```txt
1. Bande glissante 7 jours      (orientation)
2. Composer                     (saisie — LOT 1 BIS, absent en Lot 1)
3. Aujourd'hui · Demain         (action)
4. Ce qui arrive                (anticipation)
5. À reprendre                  (rattrapage, discret)
```

### 1. Bande glissante (`AgendaWeekStrip`)

**3 jours avant aujourd'hui · aujourd'hui · 10 jours après** (14 colonnes, révisé le
2026-07-29 — cf. ADR-0025 §6). Jamais alignée sur lundi–dimanche : une bande calendaire
passerait de 6 jours d'horizon le lundi à 0 le dimanche soir, au pire moment.

L'amplitude est un **réglage serveur** : le client rend le nombre de jours qu'il reçoit, il ne
le présume jamais. Sur téléphone, la grille se replie en **deux rangées de 7**.

| Zone | Contenu | Interdits |
|---|---|---|
| jours passés | 0 à 3 **traces allumées**, sans réceptacle | point fixe, libellé, case vide |
| aujourd'hui | encadré + halo cyan, seul jour marqué | — |
| jours futurs | pictogrammes des points fixes ; `controle` = anneau fuchsia, `lecon` = anneau teal | trace, bouton « + » |

Un jour passé sans trace **ne rend rien** : visuellement identique à un jour hors plage
(ADR-0025 §7 — une case grise en attente est un décompte de jours manqués). Une trace ne
s'efface jamais.

> **Deux marqueurs de nature, depuis le 2026-08-10** (addendum ADR-0025 §14.4) : le fuchsia du
> `controle`, et le **teal** — plus calme — de la `lecon` (« leçon à apprendre »). `devoir` et
> `rendu` n'en portent aucun.
>
> ⚠️ **Le fuchsia reste RÉSERVÉ au contrôle**, et un test-verrou le tient. Une leçon à apprendre
> est du travail **ordinaire** : elle se repère, elle n'alarme pas. Diluer le fuchsia sur un second
> type lui ferait perdre son sens — c'est le seul signal de gravité de l'écran. Ni l'émeraude (elle
> veut dire « Papa »), ni le rouge (interdit transverse, §7).
>
> Aucun marqueur ne change de couleur en approchant : pas de jauge d'urgence.

> **« 📖 lire le cours » depuis le 2026-08-10** (addendum ADR-0025 §15). Une échéance qui NOMME un
> cours sans y donner accès oblige Massimo à le retrouver à la main — c'est le reproche que
> `pilotageLinks.ts` fait déjà, côté Papa, à une cellule sans lien.
>
> **Trois précisions, dans cet ordre** : la leçon (`?lesson=`, chapitre déplié et leçon
> **encadrée**), sinon le chapitre (`?chapter=&title=`), sinon la page de cours de la matière.
>
> ⚠️ **Rattrapage par titre (§15.6)** : sans `lesson_id` — toutes les échéances antérieures au
> 2026-08-10, et celles dont l'intitulé est tapé à la main — le lien **emporte le libellé** et la
> page encadre la leçon **du chapitre visé** dont le titre est **exactement identique**. Égalité
> stricte, jamais hors du chapitre, rien de persisté : le pire cas est l'état d'avant, le chapitre
> déplié sans cadre.
> ⚠️ **`null` quand il n'y a pas de matière** — jamais un lien vers la racine : un lien qui n'ouvre
> rien de pertinent enseigne à ne plus cliquer.
>
> ⚠️ La leçon est **soulignée, pas ouverte d'office** : elle n'a pas toujours de contenu, et une
> modale sur du vide se lit comme une panne. Si elle a été dévalidée depuis, le repli sur le
> premier chapitre est **silencieux** — un enfant n'a rien à faire d'un message de lien mort.
>
> ⚠️ **Indépendant du `kind`** : un devoir rattaché à un cours y mène aussi.

### `plan_steps` — le plan de préparation `[0050]`

**Ce n'était qu'un emplacement prévu, vide en Lot 1.** Il est rempli depuis l'`adr-0050` : sur une
échéance datée qui porte un chapitre, ZETIS compose un **plan rétro-planifié** — jusqu'à **trois**
étapes, réparties de demain à **la veille** de l'échéance, jamais le jour même.

Chaque étape est un **lien vers ce qui existe déjà**, dans l'ordre pédagogique que le serveur porte
déjà — *comprendre, puis mémoriser, puis se tester*. **Aucun LLM** : le plan se compose depuis le
référentiel (ADR-0025 §8 rôle 1). **Trois types, donc trois étapes au maximum** — jamais deux du
même type (Décision 2 bis) ; `cours` et `eli5` n'en sont pas, l'échéance offre déjà « lire le
cours ».

**Où il se rend, et ce que chaque étape dit** (Décisions 2 ter et 2 quater) :

| Étape | Libellé | Où elle mène | Grain |
|---|---|---|---|
| 🗒️ | **Lire les fiches** | `/fiches/<slug>` | la **matière** — `FichesPage` ne lit aucun `searchParams` |
| 🃏 | **Réviser ce chapitre** | `/revision/session` + `state` | le **chapitre** ✅, deck de l'`adr-0049` |
| 🎯 | **Choisir un quiz** | `/quiz?subject=<slug>` | la **matière** — `QuizPage` ne lit que `subject` |

- **Le plan se rend SOUS l'échéance qu'il prépare**, pas sous le jour : sur une semaine à deux
  contrôles, une étape posée sous le jour flotte sans dire de quel chapitre elle parle. La **bande**
  ne garde que le **`✦`** — *« il y a quelque chose à faire ce jour-là »*, rien de plus.
- 🔴 **Le libellé ne répète pas la matière**, et c'est une **mesure** : *« Lire les fiches de
  Mathématiques »* faisait 193 px pour 151 disponibles sur un téléphone, et c'est **le nom de la
  matière** qui se coupait. Elle est déjà deux lignes plus haut. Le grain se dit par le **pluriel**
  et par le **verbe**.
- 🔴 **Le plan absorbe la porte de révision de l'`adr-0049`** quand il porte une étape `revision` :
  les deux mènent au même deck, sous la même condition serveur. Deux boutons identiques à trois
  lignes d'écart. La version du plan gagne — elle est **datée** et elle se **coche**. Le « N cartes »
  part avec la porte : sur une étape datée de mercredi, il deviendrait un quota pour mercredi.
- ⚠️ **`resource_id` est servi et reste inutilisé** pour `fiche` et `quiz` : la donnée est juste,
  c'est la route qui manque. Aucune route n'est fabriquée — `/fiches?fiche=<id>` s'ouvrirait sur une
  page qui ignore son paramètre, un cul-de-sac qui a l'air de marcher.

- **Figé.** Composé à la première lecture, puis inchangé jusqu'à l'échéance — *« un plan qui se
  recalcule à chaque ouverture est un plan auquel on ne fait pas confiance »*. Une fiche validée
  après coup n'y entre pas.
- 🔴 **Sauf si Papa déplace la date** : le plan est alors **supprimé**, coches comprises, et
  recomposé à la lecture suivante. Un rétro-planning est une fonction de la date.
- 🔴 **Rien à afficher ⇒ rien.** Échéance à J+0 ou J+1, chapitre absent, ou aucune activité
  disponible → **`has_plan` faux et aucune surface**. Jamais un plan vide, jamais un « ✦ » qui
  n'ouvre rien : même règle que la porte de révision (`adr-0049` Décision 2).
- **Les étapes se cochent**, et cette coche vaut ce que vaut celle d'un item : une **déclaration**
  de Massimo, **aucun XP, aucune célébration** (§3, `adr-0050` Décision 5). Le geste est déclaratif,
  il ne se récompense pas — sinon Massimo apprend à cocher.

  > ⚠️ **Jouer l'activité ne coche RIEN, et cocher n'exige pas de l'avoir jouée.** La preuve
  > existe pourtant (une session de cartes laisse une trace) : s'en servir est l'option (B),
  > **reportée**, pas écartée — elle créerait deux sémantiques de coche sur le même écran. Son
  > déclencheur est nommé : le jour où Papa demandera à lire autre chose qu'une déclaration.

> ⚠️ **`plan_steps` était typé `unknown[]`** dans `packages/types` : le contrat n'existait pas, il
> est **créé** par ce chantier — c'est le seul endroit du dépôt où rien n'était à respecter.

**Tap sur un jour → il s'ouvre, sous la bande** (addendum §17, 2026-08-10). Le panneau porte son
travail, cochable, avec le lien vers le cours ; et **il répond toujours** — « Rien à rendre ce
jour-là » sur un jour passé sans échéance, « Rien de noté pour ce jour » sur un jour à venir, plus
« tu as travaillé N fois » quand le jour porte des traces. Retaper le jour ouvert le referme.

🔴 **Le bouton de fermeture est un `▴`, jamais un `✕`** (2026-08-11). Il portait le **même glyphe et
le même style** que la croix de masquage des cartes : un panneau à trois devoirs affichait donc
**trois `✕` indiscernables**, un qui referme et deux qui archivent définitivement — et c'est très
probablement là que deux devoirs de la base de dev sont partis. Le chevron est le vocabulaire
**déjà employé par la page** (« Replier la suite ▴ ») : un même geste, un même signe.

🔴 **Deux corrections nées de la relecture humaine du 2026-08-10 — le panneau mentait deux fois.**

1. **Il montre ce que le jour PRÉPARE** — bloc « ✦ Ce jour-là, tu prépares », une ligne par étape,
   chacune nommant l'échéance visée (« Réviser ce chapitre · *pour Multiplication de fractions ·
   ven. 14* »). Sans lui, un jour marqué `✦` dans la bande s'ouvrait sur *« Rien de noté pour ce
   jour »*. ⚠️ **Le défaut était STRUCTUREL** : la Décision 3 de l'ADR-0050 place les étapes de
   demain à **la veille**, jamais le jour de l'échéance — une étape ne tombe donc **jamais** sur le
   jour de ce qu'elle prépare, et un jour `✦` n'avait de contenu que par coïncidence.
   🔴 **Aucune coche dans ce bloc** : l'étape se coche **sous son échéance**, où le plan vit
   (Décision 2 ter). Deux cases pour un même état, c'est le défaut n°2 ci-dessous.
2. **Le jour ouvert ne DOUBLE plus sa section.** Ouvrir MAR 11 rendait le panneau *et* la section
   « Demain », mêmes cartes, deux coches, deux ✕, et l'ancre `agenda-item-<id>` **en double dans
   le DOM**. L'addendum §17.1 l'interdisait déjà (*« la bande ne devient pas une seconde liste qui
   doublerait les sections »*) en s'appuyant sur la transience du panneau — mais **tant qu'il est
   ouvert, l'item est là deux fois**. Les sections d'**un** jour (« Aujourd'hui », « Demain ») sont
   donc **retirées**, jamais vidées : les vider ferait dire « Rien de noté pour demain » sous deux
   devoirs affichés trois lignes plus haut. Les sections multi-jours sont filtrées.

> **Révoque « la bande est un index, pas une seconde liste »**, et pour une raison trouvée à
> l'écran : le tap faisait défiler vers le premier item du jour et **sortait en silence** quand il
> n'y en avait pas — c'est-à-dire sur **tous les jours passés**, dont le serveur ne renvoie jamais
> d'échéance (§6). Des points de trace allumés sous un jour muet se lisent comme une panne.
>
> **Ce que la phrase protégeait est conservé** : la bande n'ouvre **qu'un** jour à la fois, à la
> demande, et le panneau se referme. Ce n'est pas une liste, c'est une réponse.
>
> ⚠️ **`0` trace ne se rend pas** : le contrat ne distingue pas `0` de « pas de donnée », et
> « tu as travaillé 0 fois » serait le constat d'absence que le §7 interdit.

### 2. Composer (`AgendaComposer`) — **Lot 1 bis**

Absent du Lot 1. Quand il s'ouvre, il se place **au-dessus des listes** : si la saisie demande
un scroll, elle n'a pas lieu. Saisie **explicite** : champ texte (le `label`, envoyé tel quel, jamais reformaté) +
sélecteur de matière **facultatif** + date rapide (`Aujourd'hui` · `Demain` · jours à venir) +
marqueur `contrôle` optionnel.

**Garde-fou doublon, côté client** : si un item existe déjà avec la même matière et la même
date → « Il y a déjà *X*. C'est la même chose ? », deux issues, **aucune fusion automatique**.

Emplacement des étiquettes de parsing (Lot 2) prévu, non implémenté.

### 3. Item (`AgendaItem`)

- Coche circulaire à gauche, **toujours actionnable par Massimo**, sur tous les items y compris
  ceux de Papa.
- `label` affiché **tel qu'écrit**.
- Marqueurs `ajouté par papa` / `complété par papa` en **émeraude** — la couleur de l'interface
  Papa : Massimo apprend le code sans explication.
- Édition possible **uniquement** sur ses propres items (403 sinon : ne pas afficher
  l'affordance). En phase 0, aucun item ne lui appartient — **aucune affordance d'édition**.

### 4. Ce qui arrive

`GET /upcoming`. Gros chiffre neutre de décompte, **jamais une jauge qui change de couleur** :
le seul signal d'approche est l'apparition du plan.

> 🔴 **Le CTA « Préparer · bientôt » est RETIRÉ depuis le 2026-08-10** (`adr-0050` Décision 8). Il
> était grisé depuis le Lot 1 au titre de l'ADR-0024 §4 — *« montrer la porte à venir montre le
> chemin »* — et cette justification est morte avec la livraison du plan : **« bientôt » était
> devenu faux**. Défaut vu **à l'écran**, désigné par aucun test.

La carte consomme `has_plan`, servi par `GET /upcoming` :

| `has_plan` | Rendu |
|---|---|
| `true` | **« ✦ Ton plan »** — les mots exacts de l'encadré qu'il ouvre. Il **déplie « la suite »** puis défile jusqu'au plan, qui vit **sous l'échéance** |
| `false` | **rien.** Ni grisé, ni « bientôt », ni espace réservé |

**Le `false` est définitif, pas transitoire** : une échéance sans chapitre, ou à J+1, n'aura
**jamais** de plan (`adr-0050` Décision 3). Lui promettre « bientôt » serait mentir une seconde fois.

⚠️ **Ce n'est pas un revirement sur l'ADR-0024 §4** : là-bas le gris dit *« Papa ne l'a pas encore
produit »* sur un catalogue fait pour être parcouru — une **attente**. Ici il disait *« ZETIS ne
sait pas encore le faire »* — une **dette**.

⚠️ **Le dépliage n'est pas un détail** : l'échéance visée est toujours à J+2 ou plus, donc dans la
section repliée. Une ancre seule n'aurait rien trouvé, et le bouton serait redevenu mort deux
lignes après qu'on ait tué le précédent.

### 5. À reprendre

Items passés non faits, ambre doux, **sans compteur**, **3 affichés d'emblée** — le reste derrière
un dépliage (« voir 5 autres ▾ »), depuis l'addendum §17.

> **Le plafond a changé de nature, il n'a pas disparu.** Il était appliqué au **filtrage** : au-delà
> de trois, les items étaient **hors d'atteinte**, pas seulement invisibles. Il est désormais un
> plafond d'**affichage**, que Massimo lève d'un geste.
>
> **Le §7 n'est pas rouvert, il est relu** : ce qu'il interdit, c'est un écran qui s'allonge **tout
> seul**. Un dépliage qu'on ouvre est un geste, pas une dette qui pousse sous les yeux.
>
> ⚠️ **Le nombre n'apparaît QUE sur le bouton**, jamais à côté du titre : « À reprendre · 8 » serait
> le compteur d'arriéré interdit ; « voir 5 autres » dit ce que le geste va ouvrir, et disparaît une
> fois ouvert.

## Bandeau Accueil

Sur `AccueilMassimoPage`, **deux sections** et lien vers `/agenda` :

1. **« Aujourd'hui / Demain »** — 3 items maximum, **aucune date affichée** : l'horizon est
   « maintenant ».
2. **« À préparer »** — *ajoutée le 2026-08-01* — contrôles et rendus à venir
   (`GET /agenda/upcoming`, déjà borné serveur), **2 items maximum**, et **avec leur date**.

**Pourquoi la seconde section, et pourquoi elle porte une date.** Le bandeau ne demandait au
serveur qu'aujourd'hui et demain : un contrôle de jeudi restait invisible depuis l'Accueil
jusqu'à mercredi, alors que Massimo doit savoir quand il a des choses à étudier.

Le **badge de nouveauté** de la sidebar (ADR-0030) ne pouvait pas y répondre, et c'est structurel :
un badge est **un nombre sans date** — « 3 » ne dit pas « contrôle jeudi ». Le faire compter les
items **non faits** en aurait fait le compteur d'arriéré interdit (§3, §7, addendum §12.4) : il
grossirait quand Massimo ne vient pas. **Deux objets, deux questions** — le badge dit *il y a du
nouveau*, cette section dit *quand*.

La **date est légitime** ici : une échéance qui vient du collège est un fait **subi**, jamais un
compte à rebours fabriqué par ZETIS (§1). C'est exactement l'argument qui a servi à autoriser le
badge chiffré dans l'addendum §12 — refuser le chiffre là où la date était déjà permise était
incohérent.

**Le plafond à 2 est le mécanisme anti-dette**, plus serré que celui de la page (4, serveur) :
une section qui s'allonge redevient la liste d'arriéré que le §6 refuse d'afficher. Aucun
« et N autres ». Chiffre neutre, jamais de jauge qui change de couleur à l'approche.

**Placé au-dessus du canvas Galaxy** (ADR-0024 §6 : l'Accueil porte le graphe global en
`lazy()`, ~1,37 Mo). L'actionnable doit être peint et utilisable avant l'arrivée de Three.js.
La seconde requête (`/upcoming`) part **en parallèle** de la première et après la peinture —
la promesse « rien avant le premier rendu » est tenue.

## Données API

Préfixe `/api/student/agenda`, tout utilisateur authentifié (rôle child inclus). Types partagés
dans `packages/types/src/agenda.ts`. Schéma élève `AgendaItemStudentOut` — **jamais de
`parent_note`**.

- `GET /week?anchor=YYYY-MM-DD` → `days[]: { date, offset, traces, fixed_items[], plan_steps[] }`.
  `traces` **uniquement** si `date <= today` (`null` sinon, jamais `0`) ; `fixed_items`
  **uniquement** si `date >= today`. **L'asymétrie est calculée serveur, jamais côté client.**
- `GET /upcoming` → `kind ∈ (controle, rendu)`, non fait, non archivé, horizon 21 jours,
  **max 4** : `{ id, label, subject, due_on, days_left, has_plan }`.
  ⚠️ **`lecon` en est volontairement absent** alors qu'il DÉCLENCHE la production côté serveur —
  premier `kind` dans ce cas (addendum §14.3). Motifs : la sortie **ne porte aucun `kind`**, donc
  « contrôle jeudi » et « leçon pour demain » s'afficheraient identiques pour deux gravités
  différentes ; et à 4 places, les leçons chasseraient les contrôles.
- `GET /items?from=&to=` → liste plate (alimente Aujourd'hui / Demain / À reprendre).
- `POST /items` → `created_by` forcé à `student` **côté serveur**, jamais lu du corps.
  **403 tant que `AGENDA_STUDENT_ENTRY_ENABLED` est fermé** (phase 0).
- `PATCH /items/{id}` → uniquement sur ses propres items (403 sinon), même verrou de flag.
- `POST /items/{id}/done` · `/undone` → bascule `done_at`, sur **tous** les items.
- `POST /items/{id}/dismiss` → masque un item (archivage ; **reste visible côté pilotage**).
  ⚠️ L'affordance est bornée aux items `created_by == "student"` — c'est l'écran qui borne, pas la
  route.
- `POST /items/{id}/undismiss` → **le défait**, symétrique de `undone`. Sert le « Annuler » du
  bandeau de rattrapage.

## États limites

| Situation | Affichage |
|---|---|
| Aucun item aujourd'hui/demain | ligne calme (« rien de noté pour l'instant »), **pas** d'encouragement à remplir |
| Aucun item du tout | la bande reste affichée (les traces passées ont du sens seules) |
| Item sans matière | rendu sans pictogramme, accent neutre — jamais bloqué à la saisie |
| Phase 0, aucun item saisi par Papa | ligne calme + flux ZETIS non daté ; **jamais** « ajoute tes devoirs » |
| Parsing indisponible (Lot 2) | item créé quand même, sans étiquette |
| Item passé non fait, > 3 | 3 affichés + « voir N autres ▾ » (§17) — le nombre **sur le bouton**, jamais à côté du titre |
| Jour tapé sans échéance | « Rien à rendre ce jour-là » (passé) / « Rien de noté pour ce jour » (à venir) — **jamais le silence** |
| Jour tapé avec `traces = 0` ou `null` | la ligne « tu as travaillé… » **n'est pas rendue** |

## Hors périmètre

**Lot 1 bis** : composer élève + garde-fou doublon client, derrière le flag.

**Lot 2** : écran « Préparer », sous-route `/agenda/:id/preparer`, parsing du texte libre,
étiquettes ZETIS, rattachement de notion.

**Hors ADR** : vue mois ou calendrier ; scroll arrière au-delà des 3 jours ; import
Pronote/ENT ; saisie photo/OCR ; notifications et rappels ; fusion automatique de doublons.
