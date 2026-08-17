---
id: "0036"
titre: "La demande de Massimo devient une production : fermer la seule boucle qui reste ouverte"
type: surface
statut: propose
date: 2026-08-03
pr: 85
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0011", "0021", "0022", "0023", "0025", "0027", "0030", "0031", "0032", "0034", "0035", "0037"]
---
# ADR-0036 — La demande de Massimo devient une production : fermer la seule boucle qui reste ouverte

## Statut

Proposé — 2026-08-03. **Sixième document du chantier d'autonomisation**, après le §G, l'ADR-0031,
l'ADR-0032, l'ADR-0034 et l'ADR-0035 + son addendum.

> **Ce document RÉVOQUE une décision de l'addendum ADR-0027**, écrite dans le code au-dessus de
> `RequestedPopover.tsx` :
>
> > « La demande est un **REPÈRE DE PRIORITÉ** sur la Couverture, pas une injonction : la
> > production reste **un geste de Papa**, on ne la déclenche pas d'ici. »
>
> La révocation est **conditionnelle et étroite** (§1) : la demande ne déclenche que sous le régime
> le plus explicite que Papa puisse choisir. Hors de ce régime, la phrase ci-dessus reste vraie.

> S'appuie sur : `adr-0027 addendum` (les `content_requests`), `adr-0031 §4` (`production_runs`,
> « le scope dit SUR QUOI, le déclencheur dit POURQUOI »), `adr-0034` (le Journal, le veto),
> `adr-0035` + addendum (le déclencheur, le régulateur, la 7ᵉ clé), `adr-0007` (les capsules).

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-04 | Le bouton qui ne peut pas aboutir : le verdict porte sur la SITUATION, pas sur le TYPE | Proposé | — |
> | 2 | 2026-08-05 | Une file que personne n'écoute n'est pas une attente | Accepté | — |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

### La seule boucle du dispositif qui ne se ferme pas

`notion_requests` (« cette notion n'est pas au programme ») a une boucle **complète** : Papa clique,
la `Skill` ou la leçon existe vraiment, et Massimo l'apprend à sa prochaine ouverture de chat.

`content_requests` (« il manque une fiche sur cette notion ») n'en a pas. Papa dispose de **« Fait »
et « Ignorer »**, et **aucun des deux ne produit quoi que ce soit** : `set_status` change une
colonne. Le seul chemin est un lien qui renvoie vers la Couverture, où Papa relance la génération à
la main, puis revient cliquer « Fait ».

> **« Fait » est donc une DÉCLARATION, pas une production.** Le seul garde-fou est en aval :
> `chat/announce.py` refuse d'annoncer à Massimo un `done` dont le contenu n'est pas réellement
> servable — *« le gate est la DISPONIBILITÉ, jamais le statut »*.

Le rail technique existe et est **volontairement débranché** : `trigger='request'` et
`content_request_id` sont modélisés, migrés, contraints — et **jamais écrits**, avec test-verrou.

### Trois désalignements que « brancher le trigger » cachait

| | La demande | La production (aujourd'hui) |
|---|---|---|
| **Scope** | une **notion** (`skill_id`) | un **chapitre** — il n'existe aucun scope notion |
| **Granularité** | **un** `content_kind` | le **kit entier** : `equip_notion` produit toujours les cinq pièces |
| **Vocabulaire** | 6 types, dont **`capsule`** | 5 pièces — ⚠️ **`capsule` n'a aucun producteur dans l'équipement** |

Brancher naïvement ferait produire **un chapitre entier (~30 objets) parce qu'une fiche manque**, et
laisserait les demandes de capsule sans réponse possible.

⚠️ **Un chemin par type existe déjà** — `generateForCell` appelle les générateurs un par un depuis la
Couverture — **mais il ne crée aucun lot**, donc rien de ce qu'il produit n'entre au Journal ni sous
le veto.

## Décision

### 1. `trigger='request'` s'émet — sous DEUX conditions cumulatives

**Une demande déclenche une production sans clic de Papa si, et seulement si :**

1. le régime est ***Autonome*** (A1 = 3, donc A0a = 3 par monotonie) ; **et**
2. le déclencheur automatique est **armé** (`zetis_auto_trigger_enabled`).

> **Pourquoi les DEUX, et pourquoi ce n'est pas la fusion que l'ADR-0035 §5 a refusée.** Le §5
> refusait qu'un **préréglage arme** le déclencheur — une condition qui rendrait le dispositif plus
> permissif sans qu'on l'ait demandé. Ici la conjonction est **plus restrictive** : elle exige les
> deux consentements au lieu d'un. Les deux questions restent distinctes ; c'est leur **et
> logique** qui ouvre cette porte-ci.

**Pourquoi une porte plus étroite que pour l'agenda**, et il faut l'écrire :

> Le déclencheur `agenda` a pour lui une source **exogène** — quelqu'un du monde réel a écrit qu'il
> y avait un contrôle jeudi. Une demande de Massimo est **endogène** : il peut en poser dix un soir
> d'ennui. Ce n'est pas un reproche, c'est une différence de nature — et elle justifie que ZETIS
> obéisse à l'une plus vite qu'à l'autre.

**Hors de ce régime, rien ne change** : la demande reste un repère de priorité, et la production
reste un geste de Papa — l'addendum ADR-0027 continue de s'appliquer mot pour mot.

### 2. Le scope devient la PIÈCE — et il est EXPLICITE, jamais dérivé

Une fiche demandée → **une fiche produite**. Pas le kit, pas le chapitre.

`production_runs` gagne **deux colonnes de scope** : `scope_skill_id` (FK, nullable) et
`scope_kind` (String, nullable). Règle : **exactement un scope renseigné** — `chapter_id`, ou la
paire `(scope_skill_id, scope_kind)`.

⚠️ **On ne dérive PAS le scope de `content_request_id`**, bien que ce soit techniquement possible
(la demande porte `skill_id` et `content_kind`). L'ADR-0031 §4 a tranché l'inverse, et son motif
tient toujours :

> « Ses colonnes disent **POURQUOI** on a produit (le déclencheur), jamais **SUR QUOI**. Un run
> manuel sur un chapitre n'aurait rien porté de son propre périmètre — donc rien à réafficher, rien
> à rejouer. »

⚠️ **Et on ne réutilise PAS `skill_id`**, qui est déjà la référence de déclencheur d'`evidence` et
`derived` (`TRIGGER_REFERENCE`). Une colonne qui vaudrait tantôt « pourquoi » tantôt « sur quoi »
serait l'ambiguïté exacte qui a fait rejeter `notion_requests` comme support des demandes de
contenu.

`runner.execute` gagne **une seule branche** : le scope se lit dans le run, et vaut soit
`scope.plan(chapter_id)`, soit la pièce unique. **`equip_notion` n'est pas touché** — l'addendum
ADR-0031 l'interdit, et la production par type passe par les générateurs que `generateForCell`
appelle déjà.

**Une migration**, pour ces deux colonnes.

### 3. La capsule reste MANUELLE — et l'écran le dit

> ⚠️ **CETTE SECTION A ÉTÉ CORRIGÉE LE JOUR MÊME, au read-before-code de sa propre slice.** Elle
> annonçait *« la capsule devient productible sur demande »*. **L'hypothèse était fausse**, et il
> faut dire laquelle : elle supposait un générateur symétrique des cinq autres.

**Ce que le code dit vraiment :**

```txt
create_capsule(db, llm, subject_id, instruction: str, level=None,
               skill_id=None, chapter_id=None, visual=, duration=, difficulty=)
```

`create_capsule` prend une **`instruction` en texte libre** — la consigne pédagogique que Papa écrit
lui-même (« explique les fractions comme à un enfant de 10 ans »). `skill_id` y est **optionnel**,
il n'y a **pas d'embedder**, et la capsule naît `pending`/`draft` : le rendu vidéo est un **second
geste**. Les cinq autres générateurs prennent un `lesson_id` ou un `skill_id` et rien d'autre.

Or une demande de Massimo porte `(skill_id, content_kind)` et **rien d'autre**.

> **Produire une capsule automatiquement supposerait donc d'inventer l'instruction à la place de
> Papa. Et pour une capsule, l'instruction EST l'intention pédagogique** — pas un paramètre
> technique. Une consigne dérivée mécaniquement (« Explique {notion} ») donnerait une capsule
> plate, que personne n'aurait relue avant un rendu vidéo de plusieurs minutes.

**Décision : les cinq autres types se produisent automatiquement ; `capsule` reste un geste de
Papa**, et la page Demandes **l'affiche** au lieu d'offrir un bouton qui échouerait — *« une
commande qui ne fait rien est un piège »*, doctrine tenue depuis la page Paramètres.

**Ce qui ne change pas** : `capsule` reste un type **demandable**. On ne retire pas à Massimo le
droit de réclamer une explication parce que l'outil ne sait pas encore la fabriquer seul.

**Ce qui reste vrai de la version d'origine** : la capsule n'entre pas dans `equip_notion` — et
maintenant pour deux raisons cumulées.

- l'addendum ADR-0031 **interdit de toucher l'orchestrateur** — le faire régresserait le Conseil de
  classe (ADR-0021) et la composition champion (ADR-0022), qui l'appellent ;
- une capsule coûte un **rendu vidéo de plusieurs minutes** (`worker-media`, Remotion) : un lot de
  chapitre de 11 notions rendrait **11 vidéos** que personne n'aurait demandées.

> **Condition de réouverture, nommée pour qu'on la reconnaisse** : le jour où une demande portera
> l'intention de Massimo (« je ne comprends pas *pourquoi* on renverse la fraction »), la capsule
> deviendra productible automatiquement — **et ce jour-là, c'est le §6 qu'il faudra réviser**,
> puisqu'il interdit toute surface nouvelle côté Massimo.

### 4. L'auto-fermeture — le gate est la DISPONIBILITÉ, jamais le statut

Quand la pièce demandée existe **et est servable**, la demande passe `done` **toute seule**.

Le patron n'est pas à inventer : `chat/announce.py` le porte déjà, avec sa doctrine — *« dans
l'inbox Papa, "Fait" ne fait que changer une colonne — il ne prouve pas que le contenu existe »*.
On applique la même règle à l'écriture qu'il applique déjà à la lecture.

- **Aucun statut nouveau.** `done` garde son sens : « il n'y a plus rien à faire pour cette
  demande ». Qu'il vienne d'un clic de Papa ou d'une production réussie ne change pas ce qu'il dit.
- **Un lot en échec ne ferme rien.** La demande reste `pending` et redeviendra éligible.
- **`announce.py` n'est pas modifié** : il revérifie la disponibilité de son côté, et c'est très
  bien — deux vérifications valent mieux qu'une confiance.

### 5. Le régulateur : un quota DISTINCT pour les demandes

⚠️ **Constat qui appelle une décision** : le régulateur de l'ADR-0035 compte des **lots**, pas du
**coût**. Un lot-pièce (une fiche, ~30 s) et un lot-chapitre (~36 min) y pèsent identiquement.
Avec un plafond commun, **deux fiches demandées empêcheraient de préparer un contrôle**.

**Décision : `ZETIS_REQUEST_MAX_RUNS_PER_WEEK`, compté à part**, exactement comme les lots manuels
sont comptés à part des automatiques. Trois compteurs, trois natures :

| Origine | Régulateur | Motif |
|---|---|---|
| Papa clique | *(aucun)* | le geste EST le régulateur |
| Échéance | `PRODUCTION_AUTO_MAX_RUNS` | volume produit sans demande humaine |
| Demande de Massimo | `ZETIS_REQUEST_MAX_RUNS` | **endogène** — il peut en poser dix d'affilée |

> Mélanger les deux automatiques ferait qu'un soir d'ennui de Massimo prive son contrôle du jeudi.

**Calibrage initial : 10 par semaine.** Plus haut que les lots d'échéance (2), parce qu'une pièce
coûte deux ordres de grandeur de moins qu'un chapitre. À réviser **avec l'observation**.

### 6. Ce que ce chantier ne fera jamais

- **Aucune surface nouvelle côté Massimo.** Il demande déjà ; il apprendra la réponse par le canal
  existant (`announce.py`). Lui montrer une file d'attente lui apprendrait à surveiller ZETIS.
- **Aucun compteur de demandes servi à Massimo**, ni délai annoncé. Un « ta fiche arrive dans 3 min »
  transformerait une demande en commande.
- **`equip_notion` n'est pas touché** (§2, §3).
- **Aucune priorisation intelligente** de la file. Premier arrivé, premier servi, sous plafond.
  Un tri par « urgence » supposerait de mesurer l'urgence d'un désir.

## Périmètre

**Dans cet ADR** : la double condition d'émission ; les deux colonnes de scope + la branche de
`runner.execute` ; **le refus explicite et DIT pour la capsule** (§3, corrigé) ; l'auto-fermeture sur disponibilité ; le
quota distinct ; le bouton « Produire » dans la page Demandes **pour le régime manuel** (il manque
aujourd'hui — Papa n'a qu'un lien sortant). **Une migration.**

**Hors de cet ADR** :

- **L'idempotence du Commander** (dette de l'addendum ADR-0035, exige `missions.agenda_item_id`).
- **`skills-backfill` et « + Programme » créent des notions orphelines** — une notion sans leçon
  n'est équipable par rien, donc **une demande sur une notion orpheline ne pourra pas être
  satisfaite**. ⚠️ Le cas doit être **détecté et dit**, pas produire un lot qui échoue ; le
  résoudre est un autre chantier.
- Le panneau d'analyse à trois compteurs (ADR-0025 §11).
- Toute priorisation de file, tout délai annoncé, toute surface d'attente.

## Conséquences

### Positives

- **La dernière boucle ouverte se ferme.** Massimo demande, ZETIS produit, la demande se ferme
  seule, et il l'apprend — sans que Papa soit le facteur limitant.
- **Le chemin par type entre au Journal et sous le veto.** Il existait (`generateForCell`) mais
  produisait **hors lot**, donc invisible et non rétractable. Ça règle une partie de la portée
  bornée du Journal.
- **La capsule cesse d'être une demande sans issue.**
- **Le scope explicite rend les lots rejouables** — l'exigence que l'ADR-0031 §4 avait posée pour
  le chapitre s'étend à la pièce.

### Négatives / coûts assumés

- ⚠️ **Massimo devient prescripteur de ce que ZETIS fabrique**, sous un régime que Papa a doublement
  choisi. C'est le point à observer : si les demandes deviennent un réflexe plutôt qu'un besoin,
  la porte se referme (le régime, pas le code).
- ⚠️ **Une décision écrite est révoquée** — « la production reste un geste de Papa ». Elle reste
  vraie hors du régime *Autonome*, mais elle n'est plus universelle.
- ⚠️ **Une demande sur cinq types reçoit une réponse automatique, la sixième non.** L'asymétrie
  est assumée et DITE à l'écran ; elle serait invisible et incompréhensible si elle ne l'était pas.
- **Trois régulateurs à comprendre** au lieu de deux. Le tableau du §5 existe pour ça.
- **Une migration**, après deux chantiers qui n'en demandaient aucune.

## Suivi

1. **Cadrage puis code**, sur une branche depuis `main` — pas de code dans cette session.
2. Observer : **combien de demandes par semaine**, combien atteignent le plafond, et surtout
   **combien portent sur une notion orpheline** (le cas hors-périmètre ci-dessus). Si ce dernier
   chiffre est élevé, c'est lui le vrai chantier suivant.
3. **Le signal qui dirait qu'on s'est trompé** : Massimo demandant beaucoup plus **après** que la
   production soit devenue automatique. Cela voudrait dire qu'on a fabriqué un distributeur, pas un
   outil — et la réponse serait de refermer le régime, pas d'ajouter un plafond.

---

## Amendement 1 — Le bouton qui ne peut pas aboutir : le verdict porte sur la SITUATION, pas sur le TYPE — 2026-08-04

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Proposé**.

### Statut

Proposé — 2026-08-04. Écrit à partir d'un **constat en usage réel**, pas d'une revue de code :
Massimo a demandé « Accord du COD — 📖 Cours », Papa a cliqué « Produire » **deux fois**, et rien
n'a jamais pu en sortir.

> S'appuie sur : `adr-0036 §3` (le verdict `producible` est SERVEUR — *« une commande qui ne fait
> rien est un piège »*), `adr-0031 addendum §7` (le gate vit dans la sélection), `adr-0032` (les
> paliers), `adr-0037` (la leçon canonique d'une notion), `adr-0030` (un écran, un appel réseau).
>
> **Ne révoque rien.** Il **étend** un verdict que l'ADR-0036 avait déjà placé côté serveur, et
> **honore un hors-périmètre nommé** par l'ADR-0036 lui-même : *« une demande sur une notion
> orpheline ne pourra jamais être satisfaite — le cas doit être détecté et DIT, pas produire un lot
> qui échoue »*.

### Contexte — ce que l'ADR-0036 n'a pas pu voir

Le §3 a posé la bonne doctrine, sur le bon cas : `capsule` n'a pas de générateur symétrique, donc
l'écran **le dit** au lieu d'offrir un bouton qui échouerait. Le verdict est calculé serveur
(`producible`), le front n'en détient aucune copie.

Mais `producible` répond à une question de **TYPE** :

```python
"producible": req.content_kind in REQUEST_KIND_TO_PIECE
```

*« Existe-t-il un générateur pour ce genre de contenu ? »* — oui pour un cours, une fiche, une
carte mentale, un quiz, des cartes. Cette réponse est **vraie et insuffisante** : elle ne dit rien
de la **situation**. Or ce qui décide qu'un lot produira ou non quelque chose, c'est la rencontre
de trois choses que le type ignore :

1. le **palier A1** — à `< 3`, ZETIS n'a pas le droit d'écrire un cours (`course_gate_enabled`) ;
2. l'**état de la leçon** qui porte la notion — validée ? avec du texte ?
3. l'existence même d'une leçon (le cas orphelin, déjà nommé par l'ADR-0036).

#### Le cas réel, du 2026-08-04

| Fait | Valeur |
|---|---|
| demande | `skill 50` « Accord du COD », `content_kind = cours` |
| régime | **Manuel** (`A1 = 2`) |
| leçon canonique | n° 16, `status = validated`, `content_markdown` **vide** |
| lots créés | #21 et #22, `queued` puis `done`, `total_notions = 0` |
| journal | `blocked · « Cours à valider — ZETIS ne valide pas les cours à votre place. »` |

Le gate a parfaitement fonctionné. **Personne ne l'a dit avant le clic** — et le §7 de l'addendum
ADR-0031 avait pourtant écrit, pour le lot de CHAPITRE, exactement la phrase qui manquait ici :

> *« Le gate doit être visible **avant** le clic. Sans cet aperçu, Papa presse un bouton et reçoit
> "rien produit" sur un chapitre neuf : il lirait un échec là où il y a un gate qui fonctionne. »*

L'aperçu existe donc — `GET /api/production/runs/preview` — **mais seulement pour un chapitre**.
Le lot-PIÈCE de l'ADR-0036 §2 est arrivé après, et n'a pas eu droit au sien.

#### Et le motif était faux

`BLOCKED_COURSE_PENDING` dit « **Cours à valider** ». La leçon 16 **est** validée. Elle est vide.

Le champ `Lesson.status` porte deux sens : *« cette leçon fait partie du programme validé »* — ce
qu'écrit `validate_all_lessons`, qui passe en `validated` **toutes** les `draft` d'un chapitre sans
regarder s'il y a un texte — et *« le texte du cours est validé »*, ce que lit la production.
**39 leçons de la base de dev sont dans cet état** contre 28 réellement rédigées : le motif est donc
faux pour la majorité des cas où il s'affiche.

### Décision

#### 1. Le verdict s'étend du TYPE à la SITUATION — `blocked_reason`

Chaque demande listée porte, à côté de `producible`, un `blocked_reason: string | null` :
**le motif exact pour lequel un lot lancé maintenant ne produirait rien**, ou `null` s'il produirait.

Il est calculé **par le même code que le lot exécutera** — `runner.select_notions`, sous le gate
`settings.course_gate_enabled` — et non par une seconde lecture « qui donne le même résultat ».
C'est la leçon de l'ADR-0037 : deux réponses à une même question divergent le jour où l'une bouge.

> **Conséquence assumée : le verdict est daté.** Papa peut valider un cours dans un autre onglet et
> rendre le motif caduc. Ce n'est pas un défaut à corriger par du temps réel : le motif ne
> **bloque** rien, la route reste ouverte, et un lot lancé sur une situation redevenue favorable
> produira. L'écran informe, il ne verrouille pas.

#### 2. Il voyage dans la MÊME réponse que la liste — jamais un appel par ligne

`blocked_reason` est calculé dans `list_requests`, en **une** passe groupée (`lessons_by_skill` sur
tous les `skill_id` de la file). Interroger l'aperçu ligne par ligne aurait fait N requêtes pour un
écran — exactement le mal que l'ADR-0030 a supprimé côté Massimo, et que le sondage de l'en-tête a
repayé le 2026-08-02.

#### 3. Le motif distingue « à écrire » de « à relire » — et il est écrit en ÉTAT + GESTE

Deux constantes là où il y en avait une, et une forme commune : **l'état en tête, ce qu'il y a à
faire ensuite.**

| Situation de la leçon | Motif |
|---|---|
| aucune leçon rattachée | Notion sans leçon — rien à quoi rattacher un cours. |
| leçon **sans texte** | **Cours à écrire — dans le réglage actuel, c'est vous qui rédigez les cours.** |
| texte présent, non validé | Cours à relire — il est écrit, il attend votre validation. |

⚠️ **La forme a été corrigée le jour même, sur un « pas clair du tout ».** La première version
disait *pourquoi ZETIS s'était abstenu*, dans son vocabulaire à lui : « à ce palier, ZETIS ne
l'écrit pas **à votre place** ». Deux défauts en une phrase — *palier* est un mot d'ADR que l'écran
n'emploie **nulle part** (il dit *Manual · Hybrid · Autonom*), et *à votre place* se lit comme un
reproche alors qu'il s'agit d'un réglage que Papa a choisi. Et aucune des deux ne disait **ce qu'il
y avait à faire**, qui est la seule chose que Papa cherche en lisant cette ligne.

⚠️ **Le régime n'est jamais nommé dans le texte**, et c'est structurel : ces phrases sont **écrites
au journal** (`production_events.detail`) et n'en bougent plus. Y figer « Manual » ferait mentir la
ligne le jour où le nom d'affichage change — il a déjà changé une fois, le 2026-08-04.

⚠️ **Ceci change ce que le Journal écrit** pour les lots à venir. C'est voulu : un motif faux coûte
plus cher qu'un motif nouveau. Les lignes déjà journalisées ne sont pas réécrites — le Journal ne
reconstitue pas le passé (doctrine §F.4). **Conséquence à assumer : deux formulations coexistent à
l'écran** tant que d'anciens lots restent affichés. C'est le prix de ne pas réécrire l'histoire, et
il est plus faible que celui de la réécrire.

#### 4. L'écran remplace le bouton par le motif ET le geste qui répare

Patron du §3, mot pour mot : *« un CONSTAT, pas un bouton grisé »*, et *« le geste qui répare est à
côté du constat »*. Là où la capsule renvoie vers `/capsules`, une demande bloquée par le cours
renvoie vers `/matieres` — la page où Papa rédige et valide un cours.

**« Fait » et « Ignorer » restent offerts** : Papa doit pouvoir clore une demande qu'il ne compte pas
servir, quel que soit le verdict.

### Ce que cet addendum ne fera pas

- **Il ne répare pas `Lesson.status`.** La conflation des deux sens est le défaut de fond ; la
  corriger touche le curriculum, la galaxie, la production et `canonical_context`. Elle est
  **nommée ici pour être reconnue**, et sera son propre chantier — avec migration.
- **Il n'écrit aucun cours à la place de Papa**, et ne change aucun palier. Le gate est la décision
  de l'ADR-0032 ; on l'explique, on ne le contourne pas.
- **Il n'ajoute aucun lien profond** vers la leçon exacte (`/matieres` n'en accepte pas
  aujourd'hui). Un paramètre d'URL de plus est un chantier d'écran, pas de verdict.
- **Il ne masque pas le bouton par défaut** en cas de doute : sans motif, le bouton reste. Un écran
  qui retire un geste « au cas où » est plus nuisible qu'un lot qui ne produit rien.

### Le signal qui dirait qu'on s'est trompé

Papa lisant un motif **qui ne correspond pas** à ce que le lot fait ensuite — un « rien à produire »
suivi d'un lot qui produit, ou l'inverse. La réponse serait alors de **supprimer le verdict**, pas
de le corriger : un aperçu qui ment est pire que pas d'aperçu, puisqu'il fait renoncer à un geste
qui aurait marché.

---

## Amendement 2 — Une file que personne n'écoute n'est pas une attente — 2026-08-05

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-05.

> ⚠️ **Écrit APRÈS le code, et c'est un écart au rituel qu'il faut nommer plutôt que masquer.**
> `CLAUDE.md` pose `mockup → spec → ADR → prompt` ; ce chantier est entré par un signalement de bug
> (« les lots s'accumulent, le front reste à 0 % »), a été corrigé, testé et mergé — **PR #85, squash
> `7c3e290`** — puis on a constaté que quatre décisions de conception avaient été prises en chemin
> et ne vivaient nulle part sous forme opposable. Cet addendum les remonte. Il ne décrit donc pas un
> chantier à faire : il **fige des règles déjà appliquées**, pour qu'une session future qui voudra
> « simplifier » sache ce qu'elle défait.
>
> S'appuie sur : `adr-0031 §3` (le backend n'exécute jamais un lot — il enfile), `adr-0036 §2` (le
> scope de PIÈCE), `adr-0036 §4` (le gate est la disponibilité), `adr-0037` (une question, une
> implémentation), `adr-0021` (on ne régénère jamais ce qui existe), `adr-0034 §F.4` (le Journal ne
> réécrit pas le passé), `adr-0030` (un écran, un appel réseau).
>
> **Ne révoque rien.** Il étend l'ADR-0036 côté **exécution** là où celui-ci n'avait traité que la
> **décision de produire**.

### Contexte — le trou que l'ADR-0036 laissait

L'ADR-0031 §3 a posé une frontière juste : *« le backend n'exécute JAMAIS le rendu — il se contente
d'enfiler »*. L'ADR-0036 a bâti dessus toute la chaîne demande → lot. Les deux raisonnent sur ce
qu'il faut **décider de produire**, et aucun des deux ne dit ce qui se passe quand **personne ne
consomme la file**.

Ce n'est pas une hypothèse. Le 2026-08-05, mesuré :

| Fait | Valeur |
|---|---|
| worker de production | **aucun processus** (`scripts/dev.sh` ne l'a jamais lancé) |
| `rq:queue:production` | **4 jobs** en attente |
| `production_runs` #24 à #27 | `queued`, `started_at` **NULL**, sur le même scope (`fiche`, notion 30) |
| ce que l'écran disait | « ZETIS va produire une fiche · **en file d'attente** » |
| ce que l'écran montrait | **0 %** |
| durée | **six heures** |

**Rien n'était cassé.** Le backend acceptait en `202`, conformément à l'ADR-0031 §3 ; la file
grossissait, conformément à sa nature ; l'écran affichait une phrase **littéralement vraie**. C'est
précisément pour ça que le défaut a tenu six heures et que le correctif de la veille — qui avait
rendu l'en-tête honnête sur le pourcentage — n'y changeait rien.

Et le défaut se **reproduisait tout seul** : revenir sur la page Demandes effaçait la barre et
rendait le bouton « Produire ». Papa recliquait. Quatre lots identiques ne sont pas quatre erreurs
de Papa — c'est **un écran qui a oublié quatre fois**.

### Décision

#### 1. Une file sans consommateur est un ARRÊT, et ZETIS le dit

`GET /api/production/runs/active` porte `worker_alive: bool`.

**`false` ne veut pas dire « ça va être long ». Il veut dire « personne ne viendra ».** Les deux
états n'appellent pas le même geste de Papa : l'un se laisse finir, l'autre se répare. Un écran qui
les confond transforme une panne en patience.

L'interface change de **verbe**, pas seulement de couleur : « ZETIS **va produire** … en file
d'attente » devient « ZETIS **ne produit pas** … aucun moteur de production actif ».

⚠️ **Le point d'activité cesse de pulser.** Une animation sur une file arrêtée ment avant qu'on ait
lu le texte — c'est elle qu'on regarde en premier.

⚠️ **La question n'est posée que sur un lot `queued`.** Un lot `running` a forcément quelqu'un qui
l'exécute : demander à Redis serait payer un aller-retour pour une réponse connue, quatre fois par
minute, sur les 22 pages Papa. Et le champ ne vit **que sur cette route** — le poser sur
`ProductionRunOut` le ferait payer une fois par ligne du Journal, qui en aligne des dizaines.

> **Le worker n'est pas optionnel, et le dépôt doit le dire à trois endroits.** Il manquait à
> `scripts/dev.sh` **et** à `ARCHITECTURE.md`. Un troisième processus qu'aucun document ne nomme est
> un processus que personne ne lance. Il est désormais lancé et arrêté avec la stack de dev.

#### 2. `null` n'est pas `0` — un chiffre se lit comme une mesure

Le hook de lecture d'un lot rend `pct: null` tant que rien n'a démarré. **Aucun consommateur n'a le
droit de retraduire ce refus en chiffre.** Le défaut tenait en trois caractères — `pct ?? 0` — et il
annulait la règle que le reste du code s'échinait à tenir : le libellé disait vrai, la case du
pourcentage disait 0, **et c'est la case qu'on lit**.

Deux corollaires, qui sont la vraie portée de cette section :

- ⚠️ **Une barre partiellement remplie EST un pourcentage**, même sans chiffre à côté. Une barre
  indéterminée ne se remplit donc **jamais** : un liseré balaie, il ne progresse pas.
- ⚠️ **On retire la case du pourcentage, on ne la remplit pas d'un « — » ou d'un « ? ».** Un
  caractère dans l'emplacement d'une valeur se lit encore comme une valeur.

#### 3. Ce qui vit dans un worker ne se mémorise pas dans une page — il se redérive

La page Demandes gardait les lots lancés dans son propre état. **Un travail qui vit ailleurs que
dans la page ne peut pas avoir la page pour mémoire** : la quitter effaçait tout, et le bouton
« Produire » revenait comme si rien n'avait été lancé.

Chaque demande porte donc `active_run`, **redérivé serveur à chaque lecture**, en **une passe
groupée** — patron `blocked_reason` de l'addendum « verdict de situation », et pour le même motif :
un appel par ligne referait les N requêtes par page que l'ADR-0030 a supprimées.

⚠️ **Le rapprochement ne passe par AUCUNE clé étrangère**, et il ne le peut pas : un lot `manual` ne
porte pas de `content_request_id` — l'ADR-0031 §4 l'interdit, et l'ADR-0036 §2 a redit pourquoi
(*« ses colonnes disent POURQUOI on a produit, jamais SUR QUOI »*). Il se fait sur ce que les deux
tables partagent, `(skill_id, piece)`, via `REQUEST_KIND_TO_PIECE`.

⚠️ **Seuls les lots-PIÈCE sont rapprochés.** Un lot de chapitre produit aussi la notion, mais il ne
répond pas de **cette** demande : afficher son avancement sur la ligne ferait croire qu'une fiche
arrive quand le lot en fabrique quinze, dont peut-être pas celle-là. **On préfère ne rien dire que
dire à peu près.**

Et l'avancement **reprend** : l'estimation s'ancre sur `started_at`, qui voyage avec le lot. Sans
lui, elle mesurait **l'âge de l'affichage** et non celui de l'opération — le montage d'un composant
n'est pas le départ d'un travail.

#### 4. Deux refus, et ils ne disent pas la même chose

`create_run` refuse en `409` dans deux situations distinctes.

| Situation | Ce que le refus dit |
|---|---|
| un lot au **même scope** est `queued`/`running` | « Une production identique {attend son tour \| est en cours} déjà (lot #N). » |
| le **contenu existe déjà** (lots-PIÈCE) | « La {pièce} de cette notion existe déjà. Relancer une production ne la remplacerait pas. » |

⚠️ **Le premier refus NOMME le lot existant.** Un refus qu'on ne peut pas aller vérifier se lit
comme un bug.

⚠️ **Ce n'est PAS de l'idempotence, et les confondre serait grave.** `run_exists_for` (ADR-0035)
demande *« ce lot a-t-il déjà été produit ? »* sur toute l'histoire ; ici on demande *« y en a-t-il
un en TRAIN de le faire ? »*. Relancer une production **terminée** reste parfaitement légitime — un
refus permanent déguisé en garde-fou interdirait toute régénération.

⚠️ **La garde vient APRÈS `close_stale_runs`**, jamais avant : un lot zombie interdirait sinon ce
scope pour toujours.

⚠️ **« Existe » ne veut pas dire « rien à faire ».** Une pièce `pending` que le régime permet de
valider est un lot **utile** — `equip_piece` la valide, et cela satisfait la demande. Refuser là
supprimerait le seul geste qui restait et laisserait la demande de Massimo ouverte **pour
toujours**, en contradiction directe avec le §4 de l'ADR-0036. Le prédicat porte donc la nuance
(`peut_valider`), depuis la **même source que le lot**.

⚠️ **Le prédicat RÉUTILISE les fonctions d'existence d'`equip_piece`**, il n'en réécrit aucune, et
un test-verrou d'architecture inspecte la source pour l'exiger. C'est la leçon de l'ADR-0037 : une
seconde lecture « qui donne le même résultat » diverge au premier générateur ajouté — et l'écran
refuserait alors ce que le lot aurait produit, ou l'inverse.

⚠️ **Lots-PIÈCE seulement.** Un lot de chapitre saute ses notions déjà équipées **une par une** et
produit les autres ; le refuser en bloc supprimerait du travail réel.

#### 5. Un refus n'est pas une panne — et l'interface ne doit pas les peindre pareil

Quand ZETIS refuse, **il vient de bien travailler** : il a reconnu la situation et n'a rien détruit.
Le peindre en rouge, à côté des erreurs, apprendrait à Papa que **les refus de ZETIS sont des
dysfonctionnements** — et l'entraînerait à les ignorer.

Un refus part donc en **annonce éphémère** (toast), le bandeau rouge restant réservé à ce qui casse.

- `role="status"`, **pas** `role="alert"` : `alert` interrompt un lecteur d'écran au milieu de sa
  phrase. La brutalité est réservée à ce qui casse ; ici on informe.
- **Elle s'efface seule** — patron `ProductionDoneModal`, *« ne laisse aucune trace à traiter »*. Un
  avis qui exige un clic devient une tâche, et une pile d'avis devient un arriéré : exactement ce
  que l'addendum ADR-0011 §F.2 interdit.

⚠️ **Le tri se fait sur le CODE HTTP, jamais sur le texte du message.** Reconnaître un refus à ses
mots le casserait à la première reformulation — et ces messages **ont déjà été réécrits une fois**,
au §7 du chantier du 2026-08-04. Le client d'API lève donc une erreur qui **conserve son statut**,
de façon additive : tout appelant qui lit `.message` continue sans changer d'un caractère.

### Ce que cet addendum ne fera pas

- **Il ne surveille pas le worker.** `worker_alive` répond à qui regarde, quand il regarde. Aucun
  ordonnanceur, aucune alerte poussée, aucun redémarrage automatique — la doctrine de l'ADR-0023 sur
  les tâches de fond tient, et un dispositif qui se relance seul est un dispositif dont on cesse de
  savoir s'il tourne.
- **Il ne connaît pas la FRAÎCHEUR.** Le refus de doublon répond « ça existe », jamais « ça existe
  mais le cours a changé depuis ». La Couverture, elle, sait dire *périmé* (`content_updated_at`).
  Une pièce périmée est donc refusée comme un doublon. Sans conséquence aujourd'hui — la
  régénération passe par la page de la pièce, pas par un lot — **mais c'est ici que ça bloquera** le
  jour où « reproduire ce qui est périmé » deviendra un geste de la page Demandes.
- **Il ne touche pas `Lesson.status`**, dont la conflation reste le défaut de fond nommé par
  l'addendum « verdict de situation ». Chantier à part, avec migration.
- **Il n'ajoute aucune surface côté Massimo.** Le §6 de l'ADR-0036 tient mot pour mot : lui montrer
  qu'un contenu se prépare serait une **promesse**. `worker_alive` est une information de pilotage,
  elle est à Papa.
- **Aucune migration.** Pas une colonne touchée.

### Le signal qui dirait qu'on s'est trompé

**Papa qui cesse de lire les toasts.** Si le refus de doublon devient assez fréquent pour être
balayé d'un geste, c'est que l'écran offre un bouton dans une situation où il ne devrait pas — et la
réponse serait alors de **remonter le verdict avant le clic** (patron `blocked_reason`), pas de
rendre l'annonce plus insistante. Une annonce qu'on renforce parce qu'elle est ignorée est une
annonce qui a déjà perdu.

Second signal, plus grave : **un `worker_alive` à `true` pendant que rien ne tourne**. Il serait
pire que pas d'indicateur du tout, puisqu'il ferait chercher la panne ailleurs. Le risque est réel
et documenté — `rq.Worker.count()` compte des noms dont le hash a expiré, et rend `1` sur une file
que plus personne n'écoute ; seul `Worker.all()` dit vrai. Toute réécriture de ce prédicat doit être
vérifiée **worker éteint**, pas worker allumé.
