# Page Papa — Paramètres / Autonomie de ZETIS

## Objectif

Répondre à une question que personne ne pose à voix haute : **jusqu'où ZETIS produit le contenu de
Massimo tout seul, et Papa le sait-il ?**

L'observation du 2026-08-02 a montré que sur 33 objets produits en un lot, **2 seulement**
arrivaient en relecture. Le reste atteint Massimo sans qu'aucun humain les voie. Ce n'est pas une
panne : c'est le régime en vigueur, jamais choisi explicitement.

> **Le premier travail de cette page n'est donc pas de laisser Papa monter d'un palier. C'est de
> lui montrer où il est déjà.** Un écran qui proposerait « Laisser ZETIS servir » à quelqu'un qui
> sert déjà sans relecture serait un mensonge de plus.

Maquette de référence : `docs/frontend-papa/mockup/maquette-papa-parametres-autonomie.html`.
Décisions : `adr-0032` (les paliers, la levée du gel d'A1), `adr-0011` **addenda §F (provenance)
et §G (autorité, matrice, veto)**, `adr-0031` + son addendum (le gate vit dans la sélection).

## Principes

- ~~**L'état des lieux précède le réglage.** Le bloc « où vous en êtes » est au-dessus des
  préréglages, toujours, et il n'est pas repliable.~~
  > ⚠️ **RÉVOQUÉ le 2026-08-04** (addendum §8.1). Le réglage passe en tête sous le nom **ZETIS
  > LEVELS**, et le constat le suit **dans le même objet** : le panneau de détail montre le niveau
  > sélectionné, et **au repos celui qui est actif**. On révoque la position, on garde l'intention —
  > Papa voit où il est sans le chercher. Révocation **conditionnée par le §7** : elle n'est
  > défendable que parce que l'état vit désormais en tête de sidebar, sur les 22 pages. Le
  > contre-motif reste au dossier dans l'addendum.
- **Le réglage dit ce qu'il fait.** Choisir un niveau montre **ce qu'il déplace**, classe par
  classe — calculé depuis les données du serveur, jamais rédigé en dur (addendum §8.2). Et il dit
  aussi **ce qu'aucun niveau ne change** : quatre classes sur six sont verrouillées, les taire
  promettrait une richesse que la donnée n'a pas.
- **Un régime, jamais un score.** La provenance s'affiche par objet et **ne se totalise jamais**
  (§F.2). Cette page décrit *comment ça marche aujourd'hui*, pas *combien Papa a délégué*.
- **Aucun interrupteur sans effet.** La page précédente en portait quatre ; ils ont été retirés le
  2026-08-02 parce qu'*« une page où trois interrupteurs ne font rien est un piège le jour où six
  engagent l'autonomie de ZETIS »*. **Ce jour est arrivé.** Tout ce qui est affiché ici est branché,
  ou visiblement verrouillé **avec son motif**.
- **Un cadenas dit pourquoi.** Aucune ligne verrouillée sans sa raison à l'écran : un cadenas muet
  se lit comme une panne.
- **Rien de cette page n'atteint Massimo.** `require_parent` côté serveur ; aucune donnée, aucun
  composant partagé avec `frontend-massimo` (invariant V1 : un retrait doit rester invisible).

## Structure

### En-tête

Inchangé : titre « Paramètres », sous-titre « Ce qui se règle ici, et ce qui se règle là où la
décision se prend. »

### Section « Réglages actifs » (existante, inchangée)

Renvoi vers l'agenda. ⚠️ **La phrase *« tant que ce n'est pas le cas, ZETIS ne produit rien sans
votre validation »* disparaît dans le même commit que cette livraison** — elle est déjà fausse au
regard de l'observation, et la laisser à côté d'un panneau qui dit l'inverse serait la pire des
deux options.

### Section « ⚡ Autonomie de ZETIS » (remplace le placeholder `indisponible`)

Quatre blocs, dans cet ordre — **révisé le 2026-08-04** (addendum §8.1) : le réglage est passé en
tête, et le bloc « Où vous en êtes aujourd'hui » a **fusionné** avec lui.

#### 1. « ZETIS LEVELS » — les trois niveaux, et ce que chacun fait

Trois cartes cliquables, une seule active : **Manual · Hybrid · Autonom**.

| Régime | Ce qu'il dit |
|---|---|
| 🔒 **Manual** | ZETIS produit, **vous validez tout** avant que Massimo le voie — fiches et cartes mentales comprises. |
| ⚖️ **Hybrid** | ZETIS sert les dérivés seul. **Les cours passent toujours par vous.** |
| 🚀 **Autonom** | ZETIS rédige et sert **y compris les cours**. Vous pouvez retirer, tant que Massimo n'a pas ouvert. |

> **Ce sont les mots des avatars, pas ceux des ADR** (décision du 2026-08-04, addendum §7.7). Les
> documents de décision continuent de dire *Manuel · Semi-autonome · Autonome* — ce sont les mêmes
> régimes, et les **clés** de l'API (`manuel | semi | autonome`) ne bougent pas. Le nom à l'écran
> suit l'image ; l'identité de la donnée suit le serveur.

**Le préréglage n'est pas un état stocké.** Six clés plates en base ; l'étiquette est **dérivée**
des six valeurs à l'affichage. Un badge **« Sur mesure »** s'affiche si elles ne correspondent à
aucun régime — **inatteignable en v1** (deux réglages libres seulement), mais l'état existe et se
rend.

~~⚠️ **Phase 1 : le régime Autonome est indisponible**, grisé, avec son motif.~~

✅ **LEVÉ le 2026-08-03** (ADR-0034 §8) : le Journal est livré **avec son geste *Retirer***, donc
`VETO_SURFACE_AVAILABLE = True` et *Autonome* est offert. Le palier 3 et son veto se sont livrés
ensemble, comme le verrou n°5 de l'ADR-0032 l'exigeait — **aucune ligne du front n'a changé**,
`choices` venant du serveur.

##### Sous les cartes — « ce que fait ce niveau »

Un panneau **en lecture seule**, qui suit la carte sélectionnée et, **au repos, montre le niveau
actif**. C'est lui qui a remplacé le bloc « Où vous en êtes aujourd'hui » (addendum §8.1).

Il est **calculé**, jamais rédigé : pour chaque classe, `label` du serveur → libellé de son palier.
Écrire une prose *classe × niveau* recopierait la matrice du §G.2 sous une forme que le serveur ne
peut pas refuser — un 422 protège une valeur, jamais un texte (addendum §8.2).

**Deux groupes, et le second est une information, pas une omission** (addendum §8.3) :

| Groupe | Contenu |
|---|---|
| **Ce que ce niveau décide** | Les **deux** classes libres (A0a, A1). Leur palier change à la sélection. |
| **Ce qu'aucun niveau ne change** | Les **quatre** verrouillées, en retrait, **avec leur motif serveur**. |

En pied, l'observation — **et c'est toujours le seul chiffre de la page** :

> 📊 Sur le chapitre produit le 2 août, **2 contenus sur 33** vous sont arrivés en relecture.
> **Ce n'est pas un retard** — c'est le régime ci-dessus.

⚠️ Daté, attaché à une observation, **non recalculé et non répété** — et surtout **il ne suit pas le
niveau sélectionné** : il dirait alors ce qui *serait* arrivé, et deviendrait une projection
déguisée en fait. Un compteur vivant ferait de ce bloc un reproche permanent (§F.2). Les faits par
objet vivent sur le Journal.

⚠️ Hors matrice, en note : **les quiz sont servis sans relecture, par doctrine (ADR-0014)**. Le quiz
n'est pas une classe d'autonomie — le taire pour une raison de forme perdrait une information vraie.

#### 2. Modale de confirmation — au changement de niveau

Changer de niveau ouvre une modale qui montre **ce que ce niveau déplace** (le panneau ci-dessus,
appliqué au niveau visé). ⚠️ **Sauf en descente** : *on ne freine pas un retour au contrôle*.

| Geste | Modale |
|---|---|
| Descente | **aucune** |
| Montée vers *Hybrid* | sobre — « Passer en Hybrid ? » |
| Montée vers *Autonom* | **la modale forte, inchangée** (voir plus bas) |

La modale valide le **brouillon**, pas l'enregistrement : « Enregistrer » reste un second geste.

#### 3. « Détail par type de contenu » — `<details>` replié par défaut

Six lignes. Deux réglables, quatre verrouillées **avec leur motif visible**.

| Classe | Intitulé | État |
|---|---|---|
| **A0a** | Dérivés inertes — fiches, cartes mentales, quiz, capsules | segmenté **Vous validez / ZETIS sert** |
| **A0b** | Cartes de révision | 🔒 **ZETIS sert** — *aucune étape de validation n'existe pour les cartes ; « vous validez » serait un mensonge tant qu'elle n'est pas construite* |
| **A1** | Rédaction de cours | segmenté **Vous validez / ZETIS sert** (✅ les deux offerts depuis le 2026-08-03) |
| **A2** | Programme — notions, leçons, chapitres | 🔒 **ZETIS propose** — *une erreur ici redessine la carte* |
| **A3** | Création de missions | 🔒 **Vous validez** — *élire n'est pas créer : le sélecteur est déjà autonome* |
| **A4** | Supprimer, archiver, dévalider | 🚫 **Jamais** — *définitif* |

**Monotonie** : passer A1 à « ZETIS sert » **force A0a à « ZETIS sert »**. On ne sert pas un cours
sans relecture tout en relisant les fiches qui en dérivent ; l'état inverse n'est pas offert.

#### 4. Le veto

Un encart, pas un réglage :

> **Vous pouvez retirer ce que ZETIS a servi.** Tant que Massimo ne l'a pas ouvert, un contenu se
> retire **sans trace et sans qu'il le sache**. Une fois ouvert, il ne se retire plus — il se
> corrige. Rien à faire pour accepter : le silence vaut accord.

Lien : **📓 Voir ce que ZETIS a servi →** (vers le Journal). ⚠️ **Aucune liste ici** : la page des
réglages renvoie, elle n'énumère pas — sinon elle redevient un compteur.

### Modale de confirmation — passage d'A1 à « ZETIS sert »

Obligatoire, et **jamais un `confirm()` générique** : c'est la révocation d'une décision écrite.

- Titre : **« ⚠️ Vous retirez le dernier contrôle humain »**
- Corps : *« Aujourd'hui, le cours est le seul contenu de ZETIS qui passe devant vous avant
  d'atteindre Massimo. Les fiches, les cartes, les quiz partent déjà sans relecture. »*
- Quatre conséquences listées : publication immédiate · marquage « servi par une règle que vous avez
  posée » · retrait possible tant que Massimo n'a pas ouvert · **revenir en arrière arrête la suite,
  ça ne retire pas ce qui est déjà servi** (invariant V2).
- Boutons : *Garder mon contrôle* (fantôme) / *Je comprends, laisser ZETIS servir* (ambre).

Le passage **inverse** (3 → 2) ne demande aucune confirmation : on ne met pas de friction sur le
retour au contrôle.

## Données API

- `GET /api/settings/autonomy` → les six clés et leurs valeurs, plus, par clé, `locked: bool` et
  `locked_reason: string | null` — **et, à part, `auto_trigger_enabled`** (ADR-0035 §5). **Le verrou vient du serveur**, jamais d'une liste en dur dans le
  front : c'est lui qui refuse l'écriture, l'UI ne fait que le rendre lisible.
- `PUT /api/settings/autonomy` → écrit une ou plusieurs clés. **422/409 sur toute classe
  verrouillée**, y compris via un préréglage. Le message du serveur est relayé tel quel.
  `auto_trigger_enabled` voyage dans **son propre champ**, jamais dans `values` — le serveur
  rejette toute clé hors des six paliers, et le déclencheur n'en est pas un.
- Routeur **neutre** (`/api/settings`), pas `/api/agenda/settings` : un réglage d'autonomie servi
  depuis le routeur de l'agenda serait une dette immédiate.

## Le déclencheur automatique — un bloc à part (ADR-0035 §5, livré le 2026-08-03)

Sous les six classes, visuellement **séparé** d'elles : *« ⏰ ZETIS peut démarrer sans vous »*, une
case à cocher, **défaut NON**.

> **Deux questions, deux sources.** Le palier dit si ZETIS a le droit de **servir** sans relecture ;
> cette clé dit s'il a le droit de **démarrer** sans clic. Les fusionner rendrait impossible le
> régime intermédiaire le plus naturel — « ZETIS sert seul, mais il attend que je demande » — et son
> symétrique, qui est **le plus sûr des deux**.

⚠️ **Un préréglage ne la touche dans aucun sens** : elle n'est pas dans `AUTONOMY_CLASSES`, sinon
`preset_of()` ferait qu'un régime armerait le déclencheur au passage. Deux test-verrous le tiennent,
back et front.

Le bloc « où vous en êtes » est **statique** : ses quatre phrases sont du texte, pas un calcul.
Rien à interroger, rien qui puisse dériver en compteur.

## États

- **Chargement** : la section entière en squelette ; jamais de préréglage affiché « au hasard »
  avant la réponse (un régime faux affiché une seconde est un mensonge). ⚠️ **Vaut aussi pour le
  bloc de la sidebar** (addendum §7.4), où le mensonge coûte plus cher : il est visible partout.
- **Erreur de lecture** : la section affiche l'erreur et **aucun réglage** — pas de valeurs par
  défaut inventées. Même règle en sidebar, où le bloc dit « État indisponible » et **rien
  d'autre** — ni « Manuel » par prudence, ni la dernière valeur connue.
- **Erreur d'écriture** : l'état revient à la valeur serveur, le message est affiché tel quel.
- **Enregistrement** : bouton explicite (pas d'auto-save). Un réglage d'autonomie ne se change pas
  par inadvertance au survol.

## Navigation

**Deux** points d'entrée depuis le 2026-08-04 : l'entrée sidebar existante `⚙️ Paramètres`
(`/parametres`), en bas, `startsGroup` — et le **bloc d'état en tête de sidebar**, ci-dessous. Le
veto renvoie au Journal ; aucun autre lien sortant.

## Le régime se lit aussi dans la sidebar (addendum §7 — 2026-08-04)

En tête de la sidebar Papa, **à la place du bandeau de marque** : un **bloc de lecture** cliquable
qui mène ici. Il porte **les deux axes**, jamais un seul — *Autonome + déclencheur désarmé* veut
dire « ZETIS sert seul mais attend votre clic », et un signe unique le dirait faux (addendum §7.1).

> La signature `ZETIS Papa` n'a pas disparu : **elle est passée dans le header**, qui est fixe. Le
> bloc d'état est identique des deux côtés du miroir — sans ce mot, une capture d'écran de Papa ne
> se distingue plus d'une capture de Massimo (addendum §7.2bis). *Cockpit de pilotage*, lui, ne
> revient pas.

**Aucun texte à côté du logo** : un avatar de 88 px, et un **badge à cheval sur son bas** qui porte
les deux axes à la fois — le mot du régime et le glyphe du déclencheur.

| État | Avatar | Halo | Badge |
|---|---|---|---|
| Chargement | neutre | **aucun** | squelette (aucun mot) |
| Erreur de lecture | neutre | **aucun** | gris — **ILLISIBLE** |
| `manuel` | manuel | fixe | bleu — ⏸/⚡ **MANUAL** |
| `semi` | semi | souffle 4 s | bleu→violet — ⏸/⚡ **HYBRID** |
| `autonome` | autonome | souffle + rotation 6 s | indigo→fuchsia — ⏸/⚡ **AUTONOM** |
| `null` | neutre | fixe | cyan — ⏸/⚡ **SUR MESURE** |

Le **glyphe est indépendant du mot** : il lit `auto_trigger_enabled` (⏸ *démarre sur clic* / ⚡
*démarre seul*), et un point qui orbite l'avatar le double quand le déclencheur est armé.

Au **survol** (et au **focus clavier**) : une infobulle au cadre teinté par le régime, portant le
libellé, sa description complète et la phrase du déclencheur. Elle est en `position: fixed` — la
sidebar clippe son contenu pour que la nav défile seule, et une infobulle ancrée y serait coupée.

> **La sidebar LIT, elle ne règle pas.** Aucun réglage ne se change depuis là — le bloc est un lien,
> rien de plus. Un régime ne doit pas pouvoir bouger d'un clic dans un coin d'écran quand cette
> page exige elle-même un bouton « Enregistrer ».

Le régime affiché vient **toujours** du serveur (`preset`) ; le front ne le recalcule jamais.
Rafraîchi au montage et après un enregistrement réussi — **jamais par sondage** : deux onglets
ouverts divergent jusqu'au rechargement, et c'est accepté (addendum §7.4).

## Hors périmètre

- ~~Le **Journal** et sa page — donc le régime Autonome reste indisponible en phase 1.~~
  > ✅ **LEVÉ le 2026-08-03** (ADR-0034). Le Journal est livré **avec son geste *Retirer***, donc
  > `VETO_SURFACE_AVAILABLE = True` : le serveur rouvre le palier 3 d'A1 et le régime *Autonome*
  > est offert. **Aucune ligne du front n'a changé** — `choices` vient du serveur, comme prévu.
  > Vérifié à l'écran le jour même : *Autonome* sélectionnable, modale de révocation affichée pour
  > la première fois, monotonie appliquée (A1 = 3 a forcé A0a = 3), `PUT` accepté et relu en base.
- ~~La liste des contenus servis, le geste *Retirer*~~ — livrés par l'ADR-0034 (page `/journal`).
  Reste hors périmètre : le geste *Corriger*.
- Le **gate de validation des cartes SRS** (A0b reste verrouillé) et l'action « Corriger » renforcée
  du §G.3.
- Le régulateur de volume du palier 3 (différé, ADR-0032 §5).
- Toute évolution d'A2 et A3.
- Toute surface côté Massimo.
