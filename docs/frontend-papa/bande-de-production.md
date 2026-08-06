# La bande de production — header Papa

Spec d'écran de l'**addendum 2 de l'ADR-0041**.
Maquette de référence : `docs/frontend-papa/mockup/maquette-papa-header-production.html`.

**Remplace `barre-de-production.md`**, dont elle conserve toute la doctrine d'énoncé — jamais 0 %
pour dire « ça démarre », « en file » ≠ « arrêté », estimation ancrée sur le `started_at` du
serveur, le motif d'échec rendu tel quel. Ce qui change n'est pas la façon de dire : c'est la
**forme** et le **grain**.

---

## Objectif

> **ZETIS est-il en train de fabriquer quelque chose, où en est-il, et est-ce que ça avance ?**

La troisième question est celle que la pilule ne savait pas répondre. Un lot de 31 notions avance
d'un palier toutes les 69 secondes : à l'œil, la barre est immobile. En pièces, elle bouge cinq
fois plus souvent — et le tapis, lui, bouge en permanence.

## Non-objectifs

- **Ce n'est pas un tableau de bord.** L'histoire est au Journal, le stock est à Couverture.
- **Ce n'est pas un agrégat.** Une barre = un travail. Fondre plusieurs travaux la ferait
  **reculer** à chaque ajout.
- **Elle ne pilote rien.** Aucun « annuler », « relancer », « mettre en pause ». Les deux seuls
  gestes qu'elle porte sont l'acquittement d'un échec et l'ouverture du détail.
- **Aucune surface Massimo.** ADR-0041 §12.

---

## Où elle vit

```
<header>
  ├── le bandeau de marque    h-28 / sm:h-36   ← INTOUCHÉ
  │     └── pilule d'identité … pilule d'actions
  └── la bande de production  46 px            ← ici
</header>
```

Montée dans `PapaLayout`, **dans le layout et non dans une page** : elle survit au changement de
route, donc son estimation ne repart jamais de zéro.

⚠️ Le `overflow-hidden` et la hauteur `h-28 sm:h-36` appartiennent au **bandeau**, pas au
`<header>` : sinon le header clippe la bande.

---

## L'anatomie

```txt
 ⚙⚙   ZETIS produit — Fractions            ▓▓▓▓▓▓▓░░░░░░░░   ⬤3 en attente     37 %      ▣
      chapitre · Mathématiques · lancé par vous                                7/19 pièces  +7
 └rouages┘ └──── contexte ────┘            └──── tapis ────┘  └─ file ─┘    └compteur┘  └boîte┘
```

| Élément | Ce qu'il dit | D'où il vient |
|---|---|---|
| **rouages** | l'IA travaille — ils tournent, ou ils s'arrêtent | `current.status === "running"` |
| **contexte** (2 lignes) | quoi, et **pourquoi** | `label` + `trigger` |
| **tapis** | l'avancement **et son sens de marche** | `pieces_done / pieces_total` |
| **jetons** | ce qui vient d'être fabriqué, nommé | un changement de `current_piece` |
| **file** | ce qui attend derrière | `queued_count` (couloir LLM seul) |
| **compteur** | `37 %` et `7 / 19 pièces` | disparaît entièrement si non mesuré |
| **boîte** | le stock ; clic → Couverture | `pieces_produced` |

### Le tapis, et pourquoi ce n'est pas une barre

La texture en biais défile dans le sens du remplissage. Sans elle, une barre qui se remplit ne dit
pas *d'où vers où* — et surtout, elle ne dit rien du tout entre deux paliers. Le tapis bouge même
quand le compte ne bouge pas : c'est lui qui répond à « est-ce que ça avance ? ».

C'est **le seul geste spectaculaire de l'écran**. Tout le reste de Papa est plat, et doit le rester.

### La boîte

Elle est la **destination** de tout ce que ZETIS fabrique. Elle s'ouvre d'un cran et s'illumine une
demi-seconde à chaque pièce reçue, puis retombe. Son badge `+N` compte les pièces **réellement
produites** de ce travail — jamais les `skipped`, qui étaient déjà dedans.

C'est **le seul objet permanent** de la bande : au repos, tout s'efface sauf elle.

---

## Les huit états

### 1 · Repos — rien ne tourne, rien n'a échoué, rien n'a été refusé

La bande se replie et ne garde que **la boîte**. Pas de rouages, pas de contexte, pas de tapis.

C'est une révocation **partielle** de l'ADR-0041 §7, et la borne est nette : *un liseré immobile
n'est pas un indicateur*. Ce que le §7 interdisait — un compteur permanent qui vous regarde — reste
interdit. Le repos ne porte **qu'un seul objet cliquable**, et c'est la boîte.

### 2 · En file — un lot attend, rien ne tourne encore

Rouages **immobiles mais pas éteints**, tapis en liseré qui balaie, **aucun chiffre**.
Libellé : « **ZETIS va produire** · en file d'attente ».

🔴 `pct = null`, jamais `0 %`. *Le 2026-08-05, quatre lots arrêtés affichaient 0 %, lu comme « ça
démarre ».* Le zéro n'est pas une valeur basse, c'est une absence de mesure.

⚠️ Cet état est **absent de la maquette** — son état « file » a toujours quelque chose en cours.
Il est conservé parce qu'il existe en vrai.

### 3 · En cours, mesuré — `pct_is_measured: true`

Rouages qui tournent, tapis qui se remplit et défile, jetons qui traversent et tombent.
Compteur : `37 %` sur la première ligne, `7 / 19 pièces` sur la seconde.

> **Le % est un COMPTE, jamais une estimation.** Il vaut `pièces_résolues / pièces_prévues`.
> `production_events` écrit déjà une ligne par pièce ; le dénominateur vaut
> `5 × notions éligibles`, connu dès le démarrage du lot.

Le tapis avance sur les pièces **résolues** (`generated` ∪ `skipped` ∪ `error`) : il ne recule
jamais et atteint 100 %. La boîte, elle, ne s'allume que sur `generated`.

### 4 · En cours, non mesuré — `pct_is_measured: false`

Rouages qui tournent, **liseré qui balaie**, et **la case du compteur n'existe pas**.

> Un « — » à cet endroit se lirait encore comme une valeur.

Concerne tout travail unitaire, et tout lot-pièce : une pièce sur une pièce n'est pas une
progression.

### 5 · Un en cours + N en file

La bande montre **le travail courant et lui seul**, plus une chip « ⬤ N en attente ».
Tout le reste est à un clic, jamais caché.

⚠️ Ce compteur n'est pas l'arriéré interdit par l'ADR-0011 §F.2. Il compte du **travail en vol**,
qui retombe à zéro tout seul. Profondeur de file, pas dette de relecture.

### 6 · Arrêt — `worker_alive === false`, ou un travail `stale`

**Les rouages s'immobilisent.** C'est le signal le plus lisible de l'écran : on le voit avant
d'avoir lu quoi que ce soit. Tapis en ambre figé, rien ne balaie, rien ne pulse.
Libellé : « **ZETIS ne produit pas** — aucun moteur de production actif ».

🔴 **Jamais « en file ».** *Une file sans consommateur n'est pas une attente, c'est un arrêt* —
quatre lots ont attendu six heures avant que cette distinction existe.

⚠️ `worker_alive: null` veut dire « la question n'a pas été posée ». Le test porte sur `=== false`,
**jamais sur la falsité**.

⚠️ **Un travail `queued` n'est jamais `stale`**, même depuis deux jours. Le passer en échec
condamnerait une file parfaitement intacte.

| Ce qu'on voit | Ce qui s'est passé | Ce qui va se passer |
|---|---|---|
| `worker_alive: false` | personne n'écoute une des files | elle repart seule au démarrage du worker — rien n'est perdu |
| une ligne `stale` | **ce travail-là** est mort en route | il se referme au balayage, puis s'acquitte comme un échec |

### 7 · Refus — un régulateur a dit non

Rouages **estompés**, motif affiché, ton ambre.
« Rien lancé — 34 pièces attendent votre relecture · le plafond est 30 ».

> **Le refus habite la bande.** Le régulateur qui dit non n'est pas une panne : c'est un fait. Le
> popover dit **ce qui le rouvrira**. Un refus invisible se lit exactement comme une perte — c'est
> là que « rien ne se perd » se prouve.

Seuls les refus **automatiques** apparaissent : un refus manuel a déjà été dit au clic.

⚠️ Le motif est rendu **tel quel**, comme un motif d'échec. Ne pas « adoucir ».

### 8 · Échec, et fin

- **Échec** : ton rouge — le rouge est réservé à l'échec seul, **jamais à une file**. Le motif reste
  jusqu'au clic sur « J'ai vu », acquittement **serveur**. *Un échec qui disparaît après six
  secondes pendant que Papa est dans une autre pièce est un travail perdu en silence.*
- **Fin** : une pastille s'affiche sous la bande et **s'efface seule en ~4,6 s**. Une annonce qui
  s'empile deviendrait un arriéré, c'est-à-dire le « vous êtes en retard » interdit.

---

## Les couloirs

| Couloir | Qui | Effet |
|---|---|---|
| **LLM** | lots + travaux de génération | un seul worker, concurrence 1 — c'est lui qui fait la file |
| **média** | rendu vidéo des capsules | worker séparé, file séparée — **ne retarde rien** |

La bande ne montre **qu'un tapis**. *Deux tapis côte à côte diraient qu'il y a deux productions,
alors qu'il y a deux ressources.* Le couloir média n'apparaît que dans le popover, avec son badge.

⚠️ `queued_count` ne compte **que le couloir LLM**. Y mêler le média ferait afficher « 1 en
attente » pour un travail qui ne bloque rien.
⚠️ `media_alive` est distinct de `worker_alive` : le worker vidéo peut être mort quand l'autre
tourne.

---

## Le détail — un popover, pas une modale

340 px, ancré sous la bande, ouvert au clic, fermé au clic extérieur **et à `Escape`**.

Une ligne par travail : pastille d'état, libellé, sous-titre, **badge de couloir**.
L'ordre affiché est **celui qui sera servi** — une règle de priorité qu'on ne peut pas vérifier à
l'œil n'est pas vérifiée.

**L'origine se dit toujours :**

| Origine | Libellé écran |
|---|---|
| `manual` | « lancé par vous » |
| `agenda` | « préparé pour une échéance » |
| `request` | « demandé par Massimo » |
| `null` | *(rien — travail antérieur à la trace)* |

> Sans cela, Papa ouvre son écran à 8 h et voit ZETIS travailler sur quelque chose qu'il n'a pas
> demandé, sans pouvoir savoir pourquoi.

⚠️ L'écran doit dire ce que « passer devant » veut dire : un clic pendant un lot attend la fin de
la **notion en cours** (~69 s), pas la fin du lot.

Pied : **« Voir au Journal → »** vers `/journal?statut=queued&statut=running`.
⚠️ Paramètre **répété**, jamais une liste : `?statut=queued,running` est silencieusement ignoré.

---

## Le mouvement

| Élément | Animation | Quand elle s'arrête |
|---|---|---|
| rouages | rotation, 3,6 s et 2,5 s inversé | à l'arrêt (**figés**), au refus (estompés) |
| texture du tapis | défilement continu | dès que rien ne tourne |
| liseré | balayage 1,5 s | jamais en régime mesuré |
| jetons | traversée 1,5 s puis chute | émis quand `current_piece` **change** |
| boîte | ouverture + lueur 0,5 s | quand `pieces_produced` **augmente** |

⚠️ **Les jetons naissent d'un changement d'état, jamais d'un `setInterval` décoratif.** Quand
`current_piece` passe de `cours` à `fiche`, c'est le **cours** qui vient d'être fini : le jeton
part avec son vrai nom, à l'instant. À ~14 s par pièce, le sondage à 4 s les voit tous.

⚠️ **Deux signaux, deux significations** — un jeton dit *du travail est passé* (même sauté), la
boîte dit *quelque chose a été fabriqué*. Une pièce déjà en stock traverse le tapis sans allumer
la boîte, et c'est exact.

⚠️ **`prefers-reduced-motion` fige sans rien retirer.** Rouages arrêtés, tapis sans texture animée,
liseré immobile — le remplissage, les chiffres, les couleurs et la boîte **restent**. Couper
l'animation effacerait le signal ; on l'immobilise.

⚠️ **Grammaire du mouvement.** Le halo de la sidebar dit le **régime** (lent, continu) ; les
rouages disent l'**instant** (et ne tournent que pendant un travail). Deux mouvements dans le même
champ visuel, c'est tenable à cette condition — et au repos, la sidebar redevient la seule chose
qui bouge.

---

## Couleurs

| Rôle | Couleur | Règle |
|---|---|---|
| production | émeraude → teal | le dégradé du tapis dit le sens |
| attente, arrêt, refus | ambre `#f0a02a` | **jamais du rouge pour une file** |
| échec | rouge | l'échec **seul** |
| or `#ffcf47` | 🔴 **interdit** | réservé à ZETIS quand il parle à Massimo |

---

## Le contrat de données

```txt
GET /api/production/activity        (require_parent)

{ current, queued_count, queued[], failed[], refused[], worker_alive, media_alive }

Activity = { kind, id, label, status, lane,
             pct, pct_is_measured,
             pieces_done, pieces_total, pieces_produced, current_piece,
             started_at, trigger, error, estimated_ms }

Refusal  = { id, regulator, detail, trigger, created_at }
```

- `status` ∈ `queued` · `running` · `stale` · `failed` — `stale` est **dérivé à la lecture**,
  jamais stocké.
- `pct`, `pieces_done`, `pieces_total` sont `null` **ensemble** ou renseignés ensemble — il existe
  une fenêtre où un lot est `running` sans ses compteurs, et trois conditions séparées feraient
  afficher `null / null · 37 %`.
- `pieces_produced` est **toujours** servi : un `COUNT` reste exact même hors régime mesuré. C'est
  le badge du stock, pas l'avancement.
- 🔴 **`current_piece` est ce qui fait bouger la barre.** Les cinq lignes de journal d'une notion
  atterrissent d'un seul coup à sa fin : sans la position dans la notion en vol, un compte de
  pièces avancerait exactement comme un compte de notions — `5/155` = `1/31`, toutes les ~69 s.
- Sondage **4 s**, plus un **réveil immédiat** après un enfilement réussi (`productionSignal`) —
  la bande paraît en ~52 ms au lieu de « quelque part dans les quatre secondes ».
  ⚠️ Raccourcir la période serait le réflexe, et le mauvais : cela ne supprime pas la course, cela
  la déplace. Et le sondage **reste** : personne ne signale un déclencheur automatique.

## États de chargement

- **Premier appel en cours** : rien. Aucune bande, aucun squelette.
- **Endpoint en erreur** : rien non plus, console silencieuse.

⚠️ Ces deux silences sont la **seule** exception au principe « dire ce qu'on ne sait pas ». Une
bande est un confort ; elle ne doit jamais devenir une source d'alarme sur son propre compte.

**Quand c'est le CLIC qui échoue**, en revanche, la route rend un `503` et sa phrase passe telle
quelle : *« La file de production est injoignable : rien n'a été lancé, et rien n'a été créé. »*
La deuxième proposition est la plus importante.

---

## Responsive

Requêtes de **conteneur** — la largeur du `<header>`, jamais celle de la fenêtre : le header vit à
droite d'une sidebar.

| Largeur du header | Ce qui cède |
|---|---|
| ≤ 980 px | la chip de file |
| ≤ 880 px | la seconde ligne du contexte (`7 / 19 pièces` reste) |
| ≤ 800 px | le contexte entier — rouages, tapis, compteur, boîte restent |
| toutes | **les rouages et la boîte ne partent jamais** |

> **Deux exceptions, et elles sont la règle qui compte** : un **arrêt** et un **refus** gardent leur
> mot à **toute** largeur. Réduits à un tapis coloré, ils deviennent indistinguables d'une
> production qui va bien.

**Critère de vérification** : de 432 à 1072 px, aucun libellé tronqué. La seule ellipse admise est
celle d'un nom de notion long, à pleine largeur.

---

## Hors périmètre

- Annuler, relancer ou mettre en pause un travail.
- Un historique consultable depuis la bande — c'est le Journal.
- Un compte de pièces dans `CoverageOut` (dette nommée par l'addendum).
- Le veto sur les pièces produites hors lot.
- Toute surface Massimo.
- L'ingestion RAG, qui reste synchrone.
- Les compositions pur-DB sans appel LLM.
