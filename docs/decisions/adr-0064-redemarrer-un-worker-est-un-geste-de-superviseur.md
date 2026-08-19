---
id: "0064"
titre: "Redémarrer un worker est un geste de superviseur — l'écran ne fait qu'appuyer"
type: surface
statut: propose
date: 2026-08-19
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0031", "0041", "0046", "0060", "0062", "0063"]
---
# ADR-0064 — Redémarrer un worker est un geste de superviseur — l'écran ne fait qu'appuyer

## Statut

**Proposé — 2026-08-19, APRÈS l'écran regardé** (`adr-0060` cas 4 : une surface se décide devant
l'écran, pas avant). Le chantier A1 est livré et mergé ; le bouton grisé et son motif ont été
vérifiés à l'écran, et le refus prouvé contre le backend vivant — worker intact.

## Contexte

### La panne qui justifie le geste

Un `SimpleWorker` RQ ne recharge **jamais** le code. Le 2026-08-16, un worker de 163 minutes a
répondu *« Aucun exécutant pour srs_cards_generate »* — un message qui se lit exactement comme un
bug du code, alors que seul le **processus** était vieux. 🧠 La machine affiche l'âge depuis
l'`adr-0062` ; il manquait le geste qui va avec.

### Ce que le read-before-code a établi (mesuré, pas supposé)

| Fait | Mesuré le 2026-08-19 |
|---|---|
| `send_shutdown_command` **arrive** au worker | `Worker.work()` → `bootstrap()` → `self.subscribe()` ; `SimpleWorker` ne surcharge ni `work` ni `subscribe` — le canal de commandes est ouvert pour toutes les classes. |
| L'arrêt est **gracieux** | Warm shutdown : la pièce en cours se termine, puis le worker sort. Cohérent avec le grain de l'`adr-0031` §3 — un appel LLM n'est pas préemptible. |
| Le redémarrage ne duplique **pas** le scan | `scan_already_planned` (correctif du 2026-08-03) tient : 3 redémarrages → 1 seul réveil planifié, vérifié en vrai à l'époque. Sans lui, chaque clic aurait ajouté une récurrence permanente. |
| En dev, **rien ne relance** le worker | `launch.json` / `pnpm dev:worker` : un fils de shell sous `trap`. L'arrêter le tue pour de bon. |
| 🔴 En prod, `restart: unless-stopped` relance **le même conteneur** | Le code est **baké** dans l'image (`COPY apps/backend`, aucun volume source) : un restart rend le **même code**. Voir §3. |

## Décision

### §1 — Le geste n'existe que SUPERVISÉ, et le refus dit quoi faire à la place

`PRODUCTION_WORKER_SUPERVISED`, **défaut `False`** — le sens sûr : on refuse de tuer ce qui ne
reviendra pas. La prod compose pose `true` dans l'ancre `generation-env` (la variable décrit le
**déploiement**, et elle est vraie pour les deux conteneurs qui la lisent).

Non supervisé ⇒ **409**, et le motif porte **le geste de remplacement** (*« …en développement,
relancez-le à la main (pnpm dev:worker) »*). À l'écran, le bouton est **grisé avec ce même
texte** — écrit une fois, dans `workers.py`, servi par la route ET par `GET /machine`.

> Un cadenas muet se lit comme une panne ; un refus sans issue se contourne. Le serveur refuse,
> l'écran rend le refus lisible **avant** le clic.

### §2 — 202, jamais 200 — et la phrase du serveur, jamais réécrite

L'ordre est **accepté**, pas exécuté : la pièce en cours se termine d'abord (jusqu'à ~77 s pour
une notion, mesuré). L'écran relaie les phrases du serveur **telles quelles** — 202 comme
409/404/503 sont des phrases complètes, et les réécrire côté front en ferait diverger deux
formulations de la même vérité.

### §3 — 🔴 Ce que le bouton répare : un worker COINCÉ, pas un worker périmé

**Découverte de cet ADR, faite en l'écrivant** : le libellé livré promet *« le superviseur le
relance avec le code à jour »* — et c'est une **sur-promesse**. Le code est baké dans l'image ;
`restart: unless-stopped` relance le **même** conteneur, donc le même code. Le worker *périmé*
post-déploiement n'existe d'ailleurs presque pas en prod compose : `up --build` **recrée** les
conteneurs. Ce que le restart répare réellement en prod : un worker **coincé** — zombie, mémoire,
connexion Redis morte.

**Décision** : le libellé perd « avec le code à jour » (*« …puis sort, et le superviseur le
relance »*). La colonne « âge » reste le bon diagnostic du worker périmé — mais son remède est le
**déploiement**, pas ce bouton.

### §4 — Le bouton vit à côté de l'ÂGE, par worker — jamais ailleurs

Dans « Ce qui tourne », sur la ligne du worker, à côté du fait qui le justifie. Pas de bouton
global « redémarrer les workers » : le geste vise un processus nommé, et la route prend son nom.

### §5 — Ce que ce geste n'est PAS

- **Pas « redémarrer un service »** : le backend ou un conteneur entier ne se redémarrent jamais
  depuis la page qu'ils servent (`adr-0062`, carte : *« une mise à jour ratée laisse la page
  incapable de se décrire »*). Un worker est un **exécutant**, pas la page.
- **Pas « Suspendre »** (`adr-0063`) : suspendre arrête la *politique* (aucun lot ne démarre),
  redémarrer recycle un *processus* (la file continue). Les deux gestes cohabitent dans le même
  onglet et ne partagent rien.
- **Pas le worker media** : runtime séparé (`apps/worker-media`), écoute pubsub **non vérifiée**.
  L'élargir demande de lire ce code d'abord — hors périmètre, nommé.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **`kill` du processus** (SIGTERM au pid) | Interromprait un appel LLM en vol — le mensonge d'architecture que l'`adr-0031` §3 interdit. `send_shutdown_command` fait la même chose PROPREMENT. |
| **Un bouton qui marche partout** (dev compris) | En dev, rien ne relance : le bouton tuerait le worker pour de bon, et l'écran aurait l'air d'avoir réussi. Le 409 motivé est le seul comportement honnête. |
| **Deviner la supervision** (sonder Docker ?) | Le backend ne voit pas son propre orchestrateur, et une heuristique qui se trompe tue un worker. On le **déclare** — une env var, posée là où le déploiement se décrit. |
| **Redémarrer aussi sur worker « périmé » détecté** | Automatiser le geste referait le piège du déclencheur : un processus qui se recycle seul pendant un lot. Papa clique, ou personne. |

## Conséquences

- Le motif du 409 vit en **un seul endroit** (`workers.py::MOTIF_NON_SUPERVISE`) et voyage deux
  fois (la route, `GET /machine`). Le jour où il diverge, l'un des deux ment.
- `workers_supervision` est un champ de plus dans l'instantané `GET /machine` — lecture pure,
  aucun secret, testé.
- 🔴 **Une retouche de libellé est due** (§3) : retirer « avec le code à jour » du `detail` du 202
  et des docstrings de `workers.py`. Cas 2 de l'`adr-0060` — une application de cet ADR, sur sa
  propre petite branche.

## Le signal qui dirait qu'on s'est trompé

- **Papa clique deux fois** parce que rien ne semble se passer : le 202 et sa phrase ne suffisent
  pas — il faudra un état « arrêt en cours » par worker, pas seulement une ligne de texte.
- **Un worker redémarré revient vieux** (même âge affiché après le restart) : le superviseur n'a
  pas relancé, ou l'écran lit un cache — dans les deux cas le bouton ment, et le §3 n'est pas allé
  assez loin.
- **Quelqu'un demande le bouton pour le worker media** : le besoin existe, il faut lire
  `apps/worker-media` et lever le hors-périmètre du §5 — pas le contourner.

## Suivi

1. ✅ Livré et mergé (chantier A1) ; l'écran vérifié — bouton grisé + motif, 409 réel, worker
   intact.
2. La retouche de libellé du §3 (`fix/`, cas 2).
3. Le worker media reste hors périmètre jusqu'à lecture de son runtime.
