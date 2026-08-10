# Addendum ADR-0025 — §15 · L'échéance mène à son cours

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**.
> 🔴 **RÉVOQUE le §13.3** (« aucun `lesson_id` persisté »), écrit le matin même. Le motif de
> l'époque était exact ; ce document est le consommateur qui lui manquait.
> **Une migration** — `a1b2c3d4e5f8`, une colonne nullable, aucun backfill.

## Contexte

Depuis le §13, Papa choisit l'intitulé d'une échéance **dans la liste des cours du chapitre**.
L'agenda de Massimo affiche donc, mot pour mot, le titre d'une leçon qui existe en base — et ne
lui donne aucun moyen de l'ouvrir. Il doit retrouver son cours à la main dans sa matière.

C'est le reproche que `pilotageLinks.ts` fait déjà, côté Papa, à une cellule sans lien : *« une
cellule qui affiche un état sans y donner accès oblige Papa à retrouver l'objet à la main sur une
autre page »*. L'agenda est la surface où ce reproche coûte le plus cher, parce que c'est **la
seule que Massimo ouvre en sachant ce qu'il a à faire**.

## Ce qui est révoqué, et pourquoi c'est légitime

Le §13.3 écartait la colonne `lesson_id` en ces termes : *« elle n'alimenterait aujourd'hui aucun
moteur : elle coûterait une migration pour une donnée que personne ne lit »*.

**L'argument était juste, et il ne l'est plus.** Il portait sur les moteurs — production,
Commander — qui restent scopés par `chapter_id` et le demeurent. Il ne prévoyait pas un
consommateur d'un autre genre : **un lien**. Une donnée que personne ne lit ne vaut pas une
migration ; une donnée qui ouvre la bonne page à un enfant, si.

La forme de la révocation est celle que le dépôt pratique : le motif d'origine reste écrit, on
dit ce qui a changé, on ne fait pas comme s'il n'avait jamais existé.

## Décision

### 15.1 — Une colonne, et elle POINTE, elle ne scope rien

`agenda_items.lesson_id`, FK nullable vers `lessons`. **Aucun backfill** : les échéances
antérieures n'ont pas de leçon et n'en auront pas — la rétro-attribution supposerait de deviner,
et `provenance.py` §F.4 refuse ce geste ailleurs pour la même raison.

⚠️ **Ce n'est pas un scope de production.** Le déclencheur automatique (ADR-0035) et le Commander
continuent de raisonner par **chapitre** (`resolve_chapter_notions`). Un `lesson_id` qui se
mettrait à scoper un lot ferait produire une leçon isolée là où le dispositif entier raisonne par
chapitre — cette colonne sert à **désigner une adresse**, rien d'autre.

### 15.2 — Trois précisions, dans cet ordre

`agendaCourseRoute` rend, par ordre de précision décroissante :

1. `lesson_id` → `/subjects/{slug}/cours?lesson={id}` — chapitre déplié, leçon **encadrée de
   lumière**, et **amenée sous les yeux** (`scrollIntoView`, `block: center`) ;
2. sinon `chapter_id` → `?chapter={id}&title={libellé}` — le chapitre déplié, **et la leçon
   encadrée si son titre est exactement le libellé de l'échéance** (§15.6) ;
3. sinon la page de cours de la matière ;
4. **sinon `null`** — pas de matière, pas de lien.

⚠️ **Jamais un lien vers la racine.** Même discipline que `pilotageLink`, qui rend `null` plutôt
que de déposer quelqu'un au hasard. Un lien qui n'ouvre rien de pertinent est pire qu'un lien
absent : il enseigne à ne plus cliquer.

⚠️ **La leçon est MISE EN ÉVIDENCE, pas ouverte d'office.** Une leçon n'a pas toujours de contenu
(`has_content`), et une modale qui s'ouvre sur du vide se lit comme une panne. Massimo voit où
aller ; il décide d'y aller.

**Cadre lumineux, révisé le 2026-08-10 après relecture à l'écran.** Le premier jet posait un
anneau discret : sur une page qui liste treize chapitres et leurs leçons, il ne se distinguait pas
des voisines. Trois choix, chacun pour une raison :

- **le cadre pulse TROIS FOIS puis se repose** — une pulsation perpétuelle serait un aimant à
  attention permanent sur une page de LECTURE, et le registre de Massimo est calme (ADR-0024 §5) ;
- **l'animation part et finit sur l'état de repos** — sous `prefers-reduced-motion` le cadre est
  simplement là, sans mouvement : c'est LUI l'information, pas le clignotement ;
- **la page défile jusqu'à la leçon** (`block: "center"`, et `behavior: auto` sous
  reduced-motion) — un cadre lumineux hors de l'écran n'éclaire rien.

⚠️ **Repli silencieux assumé** : le serveur ne sert que du validé (ADR-0009 §9). Une leçon
dévalidée après la saisie n'est plus là — Massimo atterrit alors sur le premier chapitre, sans
message d'erreur. Un enfant n'a rien à faire d'un « lien mort ».

### 15.3 — Indépendant du `kind`

Un devoir rattaché à un cours y mène aussi. Recopier ici une règle de type en ferait une seconde
source de vérité — celle de `TRIGGERING_KINDS` a divergé **le jour même** où `devoir` y est entré
(addendum ADR-0035 §3). La porte du lien ne regarde aucun `kind` : elle regarde l'adresse.

### 15.4 — Deux champs s'ouvrent à Massimo, et deux seulement

`AgendaItemStudentOut` gagne `lesson_id` et `chapter_id`.

C'est la première fois que des champs pilot-only passent la frontière élève, et il faut le dire
franchement. La justification tient en une phrase : **ce ne sont pas des données SUR Massimo, ce
sont des adresses de contenu qu'il peut déjà atteindre à la main.**

**Ce qui reste interdit ne bouge pas d'un pouce** : `parent_note`, `dismissed_at`, tous les
horodatages. Le test de non-fuite les nomme un par un, et il a été étendu, pas assoupli.

### 15.5 — La leçon tombe avec le chapitre

Le cas se produit sans mauvaise volonté : Papa choisit un intitulé dans la liste du chapitre A,
puis change pour le chapitre B. Sans geste, l'échéance pointerait une leçon étrangère à son
chapitre — un lien faux.

**Deux gardes, et les deux sont nécessaires** :

- le **front** efface `lesson_id` dès que le chapitre change (grille et panneau) ;
- le **serveur** refuse en **422** une leçon hors du chapitre — et il contrôle l'état
  **résultant**, pas le corps de la requête. Un `PATCH` qui ne change QUE le chapitre rend la
  leçon périmée : ne lire que `data` laisserait passer exactement ce cas.

### 15.6 — Rattrapage par titre exact, pour les échéances sans leçon

Ajouté le 2026-08-10, après un constat à l'écran : *« La phrase complexe : juxtaposition et
coordination » ne s'entoure pas d'un cadre coloré*. L'item portait `chapter_id: 2` et
**`lesson_id: null`** — la cascade §15.2 fonctionnait, elle n'avait simplement rien à désigner.

Le cas n'est pas marginal : **toutes les échéances saisies avant le §15** sont dans cet état, et
toutes celles dont Papa tape l'intitulé à la main le resteront. Or leur libellé est, souvent, le
titre **mot pour mot** d'un cours du chapitre. L'information est là ; elle n'est pas stockée comme
identifiant.

Le lien **dit ce qu'il cherche** — `?chapter=2&title=<libellé>` — et la page encadre la leçon du
chapitre dont le titre est identique.

> 🔴 **Ce n'est PAS la résolution « texte libre → leçon » que le §13.3 a écartée**, et trois bornes
> l'en séparent :
>
> - **égalité stricte** (au `trim()` près) — jamais une similarité, jamais un embedding ;
> - **dans le chapitre visé UNIQUEMENT** — jamais à l'échelle de la matière, où deux chapitres
>   peuvent porter des leçons homonymes. C'est le seul cas où ce rattrapage pourrait **mentir**, et
>   un test-verrou le tient (élargir la fenêtre le fait rougir sur la mauvaise leçon) ;
> - **rien n'est persisté** — le résultat décide d'un **cadre**, pas d'une donnée. Aucun
>   `lesson_id` n'est écrit : la rétro-attribution est refusée par la migration du §15, et elle le
>   reste.
>
> Son pire cas est l'état d'avant : le chapitre déplié, sans cadre. Ce qui l'autorise, c'est
> précisément qu'il **ne peut pas produire d'action fausse** — contrairement à l'ADR-0018 §1, où la
> résolution floue composait des missions.

**L'identifiant prime toujours** : quand `lesson_id` existe, le titre n'est même pas regardé.

## Conséquences

**Positives** — l'agenda cesse de nommer un cours sans y mener ; la précision suit ce que
l'échéance porte vraiment, sans jamais promettre plus ; l'information que le §13 produisait puis
jetait sert enfin ; et le patron `pilotageLinks` (une table de routage, `null` plutôt qu'un lien
au hasard) gagne son équivalent côté Massimo.

**Négatives / coûts** — une migration et une colonne de plus sur une table jeune ; deux champs
ouverts à la frontière élève, qui devront être défendus à chaque relecture ; une décision révoquée
**le jour même de son écriture**, ce qui est court et mérite d'être lu comme tel : le §13 a été
pris sans connaître la demande qui a suivi, pas contre elle ; et un repli silencieux (leçon
dévalidée) qu'aucun test d'écran ne couvrira jamais complètement.

## Suivi

- **Test-verrou** : leçon hors du chapitre → **422**, à la création comme au patch.
- **Test-verrou** : un `PATCH` du seul chapitre est refusé si la leçon devient périmée — c'est
  celui qui distingue « contrôler le corps » de « contrôler l'état résultant ».
- **Test-verrou** : `lesson_id` et `chapter_id` sont servis à Massimo, et `parent_note`,
  `dismissed_at`, les horodatages **ne le sont pas**.
- **Test-verrou** : la cascade leçon → chapitre → matière → `null`.
- **Test-verrou §15.6** : le rattrapage ne cherche **jamais hors du chapitre visé** — élargir la
  fenêtre à la matière fait rougir le test sur une leçon homonyme d'un autre chapitre.
- **Test-verrou §15.6** : égalité **stricte** — casse différente, ponctuation en plus, titre
  tronqué : aucun cadre. Le pire cas reste « pas de cadre », jamais un cadre sur autre chose.
- **Test-verrou** : changer de chapitre lâche la leçon, côté Papa.
- 🔴 **La migration `a1b2c3d4e5f8` est appliquée en DEV uniquement.** La prod est à faire — et son
  Postgres ne publie aucun port, c'est délibéré ; passer par le conteneur.
- Commit suggéré : `feat(agenda): the deadline leads to its lesson`.

## Décisions validées (commanditaire, 2026-08-10)

1. **Cibler la leçon exacte**, migration comprise — retenu contre le ciblage au chapitre seul.
2. **Le lien apparaît sur toute échéance qui a une cible**, quel que soit le type — retenu contre
   une restriction aux `lecon`, qui aurait recopié une règle de `kind` au front.
