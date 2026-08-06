# Header Papa — la barre de production

> 🔴 **REMPLACÉ par `bande-de-production.md`** (addendum 2 de l'`adr-0041`, 2026-08-06) : la pilule
> devient une **bande** sous le bandeau de marque, et la mesure passe de la notion à la **pièce**.
> Document conservé parce que sa **doctrine d'énoncé reste opposable** et n'a pas été réécrite —
> jamais 0 % pour dire « ça démarre », « en file » ≠ « arrêté », `worker_alive === false` et jamais
> la fausseté, le motif d'échec rendu tel quel, et son § Responsive (seuils 980 / 880 / 800 px,
> mesurés). Ce qui est périmé ici est la **forme** : la pilule, son liseré, et le compte en notions.
>
> Créée au cadrage du 2026-08-06. Met en œuvre `adr-0041`.
> **Remplace la pastille de production** de `PapaLayout.tsx:83-118`, livrée avec
> `adr-0036-addendum-file-sans-consommateur` — dont elle **conserve intégralement la doctrine**.
>
> Maquette de référence : `docs/frontend-papa/mockup/maquette-papa-barre-production.html`.

## Objectif

Une **surface unique**, visible depuis les 22 pages Papa, qui répond à une seule question :

> **ZETIS est-il en train de fabriquer quelque chose, et où en est-il ?**

Quel que soit **ce qui** est fabriqué (un kit, un cours, une fiche, un quiz, une mindmap, des
cartes, un référentiel, une capsule, un diagnostic), quel que soit **l'écran d'où c'est parti**, et
quel que soit **le déclencheur** — un clic de Papa, une échéance d'agenda, une demande de Massimo.

## Non-objectifs

- **Pas un tableau de bord de la production.** Elle dit *ce qui se passe maintenant*. L'histoire est
  au Journal, le stock est à Couverture.
- **Pas un agrégat.** Aucun pourcentage global sur plusieurs travaux (`adr-0041` §7) : il
  mélangerait une progression réelle et des estimations, et **reculerait** quand un travail entre
  dans la file.
- **Pas un panneau permanent.** Quand rien ne tourne et que rien n'a échoué, **elle n'existe pas**.
  Un indicateur toujours présent est un bruit toujours présent.
- **Aucune surface Massimo.** `adr-0041` §12 : ce qui se prépare ne s'annonce pas à l'enfant.
- **Elle ne pilote rien.** Aucun bouton « annuler », « relancer », « mettre en pause ». Le seul
  geste qu'elle porte est l'**acquittement d'un échec**.

## Où elle vit

Dans `PapaLayout.tsx`, **montée dans le layout et non dans une page** — le layout ne se démonte pas
entre deux routes, donc la barre survit à la navigation et n'émet qu'un flux de sondage pour les 22
pages (patron déjà employé par `useAutonomyState`).

Deux éléments, solidaires :

| Élément | Position | Rôle |
|---|---|---|
| **la pilule** | centre du header, entre la pilule d'identité (gauche) et les boutons (droite) | porte le libellé, la barre, le pourcentage, le compteur d'attente. **Cliquable.** |
| **le liseré** | bord **inférieur** du header, pleine largeur, 2 px | rend l'activité perceptible même quand la pilule est réduite ou masquée (mobile) |

La pilule reprend le verre translucide (`backdrop-blur`) des deux pilules existantes : elle
appartient au header, elle ne s'y superpose pas.

## Les cinq états

### 1. Absente

Rien ne tourne, rien n'a échoué. Ni pilule, ni liseré. Le header est celui d'aujourd'hui.

### 2. En file d'attente

Un travail est enfilé, aucun n'a démarré.

- barre **indéterminée** — un liseré qui balaie, **jamais un remplissage partiel** ;
- **aucun chiffre.** 🔴 `pct = null`, et surtout **jamais 0 %** : « 0 % » se lit *ça démarre*, et
  c'est faux. Le 2026-08-05, quatre lots arrêtés affichaient 0 % ;
- libellé : **« en file d'attente »**, puis le nom du travail.

### 3. En cours

Deux régimes de vérité, **distingués par un seul signe** (`adr-0041` §6) :

| Régime | Rendu | Qui |
|---|---|---|
| **mesuré** — `pct_is_measured: true` | `7 / 31 notions · 23 %` — la **fraction** est la preuve | le lot, et lui seul aujourd'hui |
| **estimé** — `pct_is_measured: false` | **`≈ 40 %`** — le tilde dit qu'on ne sait pas vraiment | tout travail unitaire |

> **Le tilde n'est pas décoratif.** Un appel LLM n'a aucun grain interne : il n'y a rien à sonder
> pendant les 32 s d'une fiche. Rendre les deux nombres identiques uniformiserait un mensonge.

L'estimation est **ancrée sur le `started_at` du serveur**. Elle ne repart jamais de zéro quand
Papa change de route ou revient sur la page — défaut constaté le 2026-08-05 et déjà corrigé côté
production, jamais côté capsules.

Quand aucune durée attendue n'est connue pour un travail, il est rendu **indéterminé** (état 2) —
pas avec une estimation inventée.

### 4. Arrêté

Un travail est en file **et aucun moteur ne l'écoute** (`worker_alive: false`).

- libellé : **« en attente — aucun moteur de production actif »** ;
- barre indéterminée, ton d'alerte sobre ;
- 🔴 **jamais « en file »**. *Une file sans consommateur n'est pas une attente, c'est un arrêt.*
  Quatre lots ont attendu six heures avant que cette distinction existe.

⚠️ `worker_alive: null` signifie **« la question n'a pas été posée »** — il ne se confond pas avec
`false`. Le test porte sur `=== false`, jamais sur la falsité.

Un lot **zombie** (`status: "stale"` — le worker n'a plus donné signe de vie) est rendu dans ce même
état, avec son propre libellé.

**Depuis la Slice B, un TRAVAIL UNITAIRE zombie l'est aussi** (ADR-0041 §10.4). Jusque-là,
`/activity` rendait son statut brut : un travail dont le worker était mort restait « en cours »
**indéfiniment**, barre qui monte comprise. C'est la même correction que le §1 avait faite pour les
lots, sur le modèle frère.

Deux pannes, deux lectures — et l'écran ne doit pas les confondre :

| Ce qu'on voit | Ce qui s'est passé | Ce qui va se passer |
|---|---|---|
| `worker_alive: false` | **personne n'écoute** une des deux files | la file repart seule au démarrage du worker — **rien n'est perdu** |
| une ligne `stale` | **ce travail-là** est mort en route (OOM, work-horse tué) | il se referme au balayage, puis s'acquitte comme un échec |

⚠️ **Un travail `queued`, lui, n'est JAMAIS `stale`** — même depuis deux jours. Le passer en échec
condamnerait une file parfaitement intacte.

⚠️ **Ce n'est pas le balayage périodique qui rend cet état honnête**, et c'est important pour qui
touchera à ce code : il ne bat que toutes les trois heures. La vérité se **dérive à la lecture** de
`/activity` — le balayage ne fait que refermer les lignes en base.

### 5. Échec — et il reste

Un travail a échoué.

- la pilule passe en état d'échec, **avec son motif** (`error`), et **y reste** ;
- **aucune fermeture automatique.** Elle disparaît quand Papa clique **« J'ai vu »**, et seulement
  là ;
- l'acquittement est **serveur** — il ne revient pas au prochain rechargement, ni sur un autre
  appareil.

> Un échec qui s'efface après six secondes pendant que Papa est dans une autre pièce est un travail
> **perdu en silence** — la négation exacte de « rien ne doit se perdre ». Et le Journal ne peut pas
> servir de repli : sa portée v1 ne couvre que les travaux portés par un lot, donc l'échec d'une
> fiche lancée à la main n'y figurerait pas.

Si plusieurs travaux ont échoué, ils s'empilent dans le détail (au clic) ; la pilule montre le plus
récent et compte les autres.

**Le motif est rendu TEL QUEL, sans traduction** — décision du commanditaire, 2026-08-06.

La question a été posée à l'écran sur un échec réel : « Aucun exécutant pour
« capsule_render_v2 ». » est exact, et ce n'est pas du français de Papa. La réponse est que la
traduction est **inutile**. Un motif d'échec n'est pas un texte d'interface : il sert à savoir
quoi réparer, et le reformuler ne ferait qu'ajouter une couche entre le fait et celui qui doit
agir — au risque de perdre le nom exact dont il a besoin.

⚠️ **Ne pas « améliorer » ce point sans rouvrir la décision.** Une table de correspondance
`motif technique → phrase douce` serait exactement ce qui a été écarté.

## Plusieurs travaux à la fois

La pilule montre **le travail courant, et lui seul**, suivi d'un compteur discret :

```txt
⟳  Équipement · Théorème de Pythagore     7 / 31 notions · 23 %     +2 en attente
```

- « courant » = celui qui tourne ; si aucun ne tourne, **le premier de la file** ;
- `+N en attente` n'apparaît qu'à partir de 1 ;
- **tout le reste est à un clic**, jamais caché.

## Le détail, au clic

Un clic sur la pilule ouvre `ActiveProductionModal` — **déjà monté dans le layout**, étendu pour
porter une liste plutôt qu'un lot unique :

- une ligne par travail : nature, libellé, état, avancement, **origine** ;
- l'ordre de la file, tel qu'il sera servi (§ priorité ci-dessous) ;
- les échecs non acquittés, avec leur motif complet et leur bouton **« J'ai vu »**.

### L'origine se dit toujours

Chaque ligne porte d'où vient le travail — `trigger` :

| Origine | Libellé écran |
|---|---|
| `manual` | « lancé par vous » |
| `agenda` | « préparé pour une échéance » |
| `request` | « demandé par Massimo » |
| `null` | *(rien — travail antérieur à la trace)* |

> Sans cela, Papa ouvre son écran à 8 h et voit ZETIS travailler sur quelque chose qu'il n'a pas
> demandé, sans pouvoir savoir pourquoi.

### La priorité est visible, pas seulement vraie

Un travail lancé à la main passe devant les travaux automatiques (`adr-0041` §5). Le détail le
**montre** dans son ordre, sinon la règle est invérifiable à l'œil.

⚠️ Il faut aussi que l'écran dise ce que « passer devant » veut dire : le travail en cours **n'est
jamais interrompu**. Un clic pendant un lot attend la fin de la **notion en cours** (~69 s), pas la
fin du lot. C'est très exactement ce que l'estimation locale ne pouvait pas savoir.

## Les barres locales — une source, deux rendus

Les 23 barres locales **restent** là où elles sont. Papa clique « Générer » sur la page Fiches : son
écran doit répondre, à l'endroit du geste.

Ce qui disparaît, ce sont les **constantes de durée en dur** — les cinq du cours (45 / 42 / 50 / 50
/ 22 s), les quatre d'`equip_notion` (90 / 90 / 60 / 69 s), et les divergences 32/30 et 60/30.

| Surface | Dit quoi |
|---|---|
| **le header** | *il se passe quelque chose, quelque part, et voilà quoi* |
| **la page** | *où en est ce que tu viens de lancer* |

Les deux lisent **le même endpoint**. Une seule vérité, deux distances de lecture.

## Contrat API

| Besoin | Route |
|---|---|
| l'activité | `GET /api/production/activity` |
| acquitter un échec | `POST /api/production/activity/{kind}/{id}/ack` |

```txt
{
  current:      Activity | null,
  queued_count: int,
  failed:       Activity[],
  worker_alive: bool | null
}

Activity = {
  kind, id, label,
  status:          "queued" | "running" | "stale" | "failed",
  pct:             int | null,      # null = indéterminé. JAMAIS 0 pour dire « ça démarre »
  pct_is_measured: bool,
  started_at:      datetime | null,
  trigger:         str | null,
  error:           str | null
}
```

Sondage : **4 s**, valeur du patron existant — ramenée de 20 s le 2026-08-03 parce qu'*« un
lot-pièce dure 15 à 17 s : à 20 s de période, l'indicateur pouvait ne JAMAIS voir un lot entier »*.

**Plus un RÉVEIL immédiat** (`lib/productionSignal.ts`) : le client qui vient d'enfiler prévient la
barre au lieu de la laisser attendre son prochain tour. Mesuré à l'écran le 2026-08-06 — la barre
paraît en **52 ms** après le clic, au lieu de « quelque part dans les quatre secondes ».

⚠️ **Raccourcir la période aurait été le réflexe, et c'était le mauvais** : cela ne supprime pas la
course, cela la déplace — et sonder plus souvent coûte à toutes les pages, en permanence, pour un
gain qui ne sert qu'après un clic.

⚠️ **Le sondage RESTE**, le réveil s'ajoute : personne ne signale un déclencheur automatique
(agenda, demande de Massimo). L'un voit ce que ZETIS lance tout seul, l'autre ce que Papa lance.

⚠️ **Ce que le réveil ne fait PAS** : rendre visible un travail de quelques millisecondes. Rien ne
le peut — quand la réponse revient, le travail est fini. Ce qu'il supprime est la fenêtre aveugle
**après un geste**.

Détection de fin : par **id mémorisé**, relu **une seule fois** quand `current` retombe à `null` —
et jamais sur un travail déjà terminé au chargement de la page.

## États de chargement

- **Premier appel en cours** : rien. Aucune pilule, aucun squelette. Faire apparaître une barre vide
  pendant qu'on demande s'il y a du travail serait annoncer du travail qui n'existe peut-être pas.
- **Endpoint en erreur** : rien non plus, et un `console` silencieux. Une barre est un confort ;
  elle ne doit jamais devenir une source d'alarme sur son propre compte.
- ⚠️ Ces deux silences sont la **seule** exception au principe « dire ce qu'on ne sait pas » : ici,
  ne rien savoir et n'avoir rien à montrer se ressemblent, et le premier ne mérite pas d'écran.

### Quand c'est le CLIC qui échoue (Slice B, ADR-0041 §10.1)

Le silence ci-dessus vaut pour la barre, qui ne fait que **regarder**. Il ne vaut pas pour un geste
de Papa : un clic qui ne produit rien doit le dire.

Les routes qui enfilent rendent désormais **`503`** quand la file est injoignable, et la phrase part
telle quelle vers l'écran (`asJson` remonte `detail`) :

> La file de production est injoignable : rien n'a été lancé, et rien n'a été créé. Vérifiez que
> Redis et le worker de production tournent, puis relancez.

🔴 **La deuxième proposition est la plus importante.** Auparavant, un `500` partait vers le
navigateur pendant que le lot, lui, **existait déjà en base** — Papa recliquait, et un lot fantôme
que rien n'exécuterait jamais s'affichait « en file d'attente » indéfiniment. La barre ne bouge donc
pas après un `503` : c'est exact, il n'y a rien à montrer.

⚠️ **Et la barre ne clignote pas.** `signalerEnfilement()` n'est appelé qu'après un enfilement
**réussi** — un réveil sur un refus ferait chercher un travail inexistant, au pire moment.

## Navigation

- Aucun paramètre d'URL. La barre n'est pas une page.
- Elle **survit** au changement de route sans se réinitialiser ni relancer son estimation.
- Le clic n'ouvre pas de route : `ActiveProductionModal` reste une modale de layout.
- Un travail achevé peut renvoyer vers **ce qu'il a produit**, via le patron déjà en place de
  `ProductionDoneModal`.

## Responsive — une échelle de repli, pas un écrasement

🔴 **Mesuré sur la maquette le 2026-08-06, et c'est un défaut qu'il a fallu corriger.** Sans échelle
explicite, la pilule ne se replie pas : **elle s'écrase**. À 700 px de header, le libellé tombait à
**0 px** tout en occupant encore 244 px ; à 560 px, les **cinq** états n'affichaient plus rien de
lisible dans 104 px de décoration.

La pilule cède donc **par paliers**, du moins informatif au plus informatif :

| Largeur du header | Ce qui cède |
|---|---|
| ≤ 980 px | le compteur `+N en attente` |
| ≤ 880 px | le **sujet** du travail — on garde son **type** (« Fiche », « Équipement ») |
| ≤ 800 px | le libellé entier : point animé + barre + pourcentage |
| toutes | **le liseré du bord inférieur reste** — le repli ultime, qui garantit qu'une production ne devient jamais invisible |

**Deux exceptions, et elles sont la règle qui compte** : un **échec** et un **arrêt** gardent leur
mot à **toute** largeur. Ce ne sont pas des états d'avancement, ce sont des états d'anomalie ;
réduits à une barre colorée, ils deviennent indistinguables d'une production qui va bien.

⚠️ **Requêtes de conteneur, pas de viewport.** La pilule réagit à la largeur du **header**, qui
porte déjà deux pilules et se trouve à droite d'une sidebar — pas à celle de la fenêtre.

⚠️ Le header porte déjà deux pilules translucides sur un fond image. La troisième doit **céder
l'espace avant elles** en cas de conflit, jamais les pousser hors écran.

**Critère de vérification** : à toute largeur de 432 à 1072 px, **aucun libellé n'est tronqué**. La
seule ellipse admise est celle d'un **nom de notion long** à pleine largeur — c'est un texte trop
long, pas une boîte trop petite.

## Hors périmètre

- Annuler, relancer ou mettre en pause un travail.
- Un historique consultable depuis la barre (c'est le Journal).
- Toute surface Massimo.
- L'ingestion RAG, qui reste synchrone en v1 (`adr-0041` §4).
- Les compositions pur-DB sans LLM, qui n'entrent pas dans la file.

## Voir aussi

- `docs/decisions/adr-0041-tout-ce-qui-produit-se-voit.md` — la décision ;
- `docs/frontend-papa/page-journal.md` — l'histoire, quand la barre a disparu ;
- `docs/frontend-papa/page-couverture.md` — le stock de contenu ;
- `packages/ui/src/components/generation-progress.tsx` — la brique, et son mode indéterminé.
