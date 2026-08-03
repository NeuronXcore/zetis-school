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
