---
id: "0063"
titre: "Suspendre ZETIS est un sixième régulateur, pas un interrupteur"
type: surface
statut: propose
date: 2026-08-19
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0031", "0032", "0034", "0035", "0036", "0041", "0046", "0060", "0062"]
---
# ADR-0063 — Suspendre ZETIS est un sixième régulateur, pas un interrupteur

## Statut

**Proposé — 2026-08-19.** Phase A du `BACKLOG.md` §*Route des paramètres*. N'amende aucune décision
d'autonomie : le régime (`adr-0032`) et le déclencheur (`adr-0035`) restent intacts, et **suspendre
n'y touche pas**.

Cadré en **cas 3 de l'`adr-0060`** : ça change ce que ZETIS a le droit de faire, et l'annulation
coûterait plus d'un commit (deux points d'ancrage dans le runner, une surface de refus, un état lu
sur 22 écrans).

## Contexte

### Ce qui manque, et ce qui existe déjà

La maquette v2 appelle « Suspendre ZETIS » *« probablement le bouton le plus utile de la page, et
le seul qui manque vraiment »*. Elle annonce aussi un **ADR déjà rédigé (S0)** — 🔴 **il n'existe
pas** : vérifié le 2026-08-19, les quatre ADR qui contiennent le mot parlent d'une carte SRS
(`0013`), d'une fiche (`0015`), d'une propagation (`0048`) ou citent un défaut corrigé (`0024`).

En revanche, **tout le mécanisme nécessaire existe**, et c'est ce que le read-before-code a établi.

| Mesuré le 2026-08-19 | Conséquence |
|---|---|
| **`runs.create_run` est la porte UNIQUE.** Trois appelants, et trois seulement : `runs_router.py:33` (Papa clique), `triggers.py:154` (`scan_agenda`), `triggers.py:271` (`scan_requests`). | Un seul point à garder. Pas de porte dérobée à surveiller. |
| **Cinq régulateurs y vivent déjà**, vocabulaire fermé et documenté (`db/models/production.py:297`) : `duplicate`, `already_produced`, `pending_backlog`, `request_volume`, `auto_volume`. | Suspendre n'invente rien : c'est un **sixième régulateur**. |
| **La surface de refus existe** : `ProductionRefusal`, `refusals.py`, `409` motivé, déjà lu par Papa. | Rien à dessiner pour dire non. |
| 🔴 **Le code préempte entre NOTIONS ; l'`adr-0031` §3 avait décidé la PIÈCE.** `runner.py:484` cite l'ADR en écrivant *« entre deux notions »* — l'ADR, lui, dit *« le worker vérifie l'activité récente de Massimo **avant chaque pièce** »*. | Divergence **préexistante** entre la doctrine et le code, trouvée à la vérification des faits de ce cadrage. |
| ✅ **Le crochet par pièce EXISTE déjà** : `equipment.py:281`, `on_piece(piece)` — *« appelé avec le nom de la pièce AVANT de… »*. Posé par l'addendum 2 de l'`adr-0041` §20 bis pour la **position** de la barre, pas pour la préemption. | Le grain décidé par l'`adr-0031` est atteignable sans rien inventer. |
| 🔴 **`massimo_is_active` ne peut PAS l'héberger.** Elle est consommée par `_wait_for_massimo`, une boucle d'attente **bornée** par `production_max_wait_minutes` — *« on préfère un lot qui finit à un lot qui attend pour toujours »*. | Un suspend posé là **se dé-suspendrait tout seul**. C'est le piège que ce cadrage évite. |
| `_record(outcome="blocked", detail=…)` journalise déjà une notion non équipée avec son motif. | Un lot écourté peut se raconter sans statut neuf. |
| Convention `app_settings` : `"true"` / `"false"` (`zetis_auto_trigger_enabled`). | Pas de seconde convention pour un booléen. |

### La durée qui décide du ressenti

Deux grains, deux attentes — et c'est ce qui décide du dessin du bouton.

| Grain | Durée | Provenance |
|---|---|---|
| **Une notion** | **69 s**, reconfirmé **77 s** | 🔵 **mesuré** — 11 notions en 12 min 35 s le 2026-08-02, reconfirmé le 2026-08-06 |
| **Une pièce** | **~15 s** (fiche), **~17 s** (carte mentale) | 🔵 **mesurés** le 2026-08-03 |
| Une pièce longue | 45 s annoncés pour `lesson_content` | ⚠️ **amorce, jamais mesurée** — le module le dit lui-même |

⚠️ **Je n'ai re-mesuré aucun de ces chiffres** : la base de DEV ne porte aucun `equip_notion` de
file (`n=0`, requête faite). Ce sont des mesures **héritées et datées**, et elles sont citées comme
telles.

**Conséquence de dessin** : au grain de la notion, il s'écoule **jusqu'à ~77 s** entre le clic et
l'arrêt — pour un geste qui s'appelle *arrêt d'urgence*. Au grain de la pièce, **~15 à 45 s**. Un
bouton qui n'annoncerait pas ce délai se lirait comme cassé.

## Décision

### §1 — Un sixième régulateur, évalué EN PREMIER

`REGULATORS` gagne `"suspended"`, et il est évalué **avant les cinq autres**.

> **Pourquoi en premier.** Les cinq autres répondent « pas maintenant, pour telle raison de
> politique ». Celui-ci répond « pas du tout, Papa a débranché ». Le lire en dernier ferait rendre
> un motif de plafond à quelqu'un qui a lui-même coupé le courant — un refus exact et
> incompréhensible.

### §2 — 🔴 Ce régulateur NE PERSISTE PAS son refus

Les cinq autres écrivent une `ProductionRefusal` quand le refus est **automatique**, parce que
personne ne lit le compte rendu du scan de 3 h. Celui-ci ne l'écrit **jamais**.

> **C'est le seul refus dont Papa connaît déjà la cause : il l'a causée.** Persister un refus par
> réveil du scan remplirait la table d'une même phrase toutes les 180 minutes, et noierait les
> refus qui, eux, apprennent quelque chose. Un régulateur qui se répète cesse d'être lu.

### §3 — Un lot en cours s'arrête **entre deux pièces**, et se raconte

Le drapeau se lit dans `on_piece` (`equipment.py:281`), **avant chaque pièce**. Si ZETIS est
suspendu, le lot cesse d'équiper. Ce qui n'a pas été produit entre au journal, motif *« ZETIS a été
suspendu »* — les notions restantes en `blocked`, et la notion en cours avec les pièces qu'elle a
eu le temps de faire.

> **On ne re-décide pas le grain, on applique celui qui est décidé.** L'`adr-0031` §3 a tranché :
> *« le worker vérifie l'activité récente de Massimo avant chaque pièce […] le grain de la
> préemption est la pièce, et il faut l'écrire ainsi plutôt que de laisser croire à une
> interruption immédiate »*. Le code, lui, ne vérifie qu'entre deux **notions** — c'est la
> divergence trouvée au §Contexte. Ce chantier prend le grain **décidé**, pas le grain **codé** :
> ~15–45 s au lieu de ~77 s, pour un geste qui s'appelle arrêt d'urgence.
>
> ⚠️ **La pièce en cours se termine, et ce n'est pas de la douceur** : un appel LLM n'est pas
> préemptible. *« Prétendre l'interrompre serait un mensonge d'architecture »* (`adr-0031` §3).
>
> **Pas d'attente, un arrêt.** Faire attendre le lot le laisserait `running` indéfiniment en tenant
> le worker — c'est le mode d'échec de `_wait_for_massimo` transposé.
>
> 🔴 **Ce chantier ne corrige PAS `_wait_for_massimo`**, qui reste au grain de la notion. Le faire
> changerait le comportement de la priorité de Massimo — une autre question, une autre décision.
> La divergence est **écrite** ici pour qu'elle cesse d'être invisible ; elle n'est pas soldée.

### §4 — Le drapeau vit dans `app_settings`, et **survit au redémarrage**

Clé `zetis_production_suspended`, valeurs `"true"` / `"false"`, défaut `"false"`.

> **Survivre au redémarrage est la décision, pas un effet de bord.** Un suspend qui s'évapore au
> premier `docker compose up` rendrait la machine bavarde exactement quand Papa la croit muette —
> et le jour où il suspend, c'est souvent parce que quelque chose ne va pas.

### §5 — Il ne se relève JAMAIS tout seul

Aucune expiration, aucun délai, aucun réveil. **Papa le lève explicitement.**

> C'est le piège que le read-before-code a évité de justesse. Un interrupteur qui se remet en
> position après N minutes n'est pas un interrupteur : c'est un minuteur qu'on prend pour un
> interrupteur, et il ment le jour où on compte sur lui.

### §6 — L'état se lit dans la SIDEBAR, sur les 22 écrans

Le bloc d'état qui porte déjà le régime (`EtatZetis`, addendum `adr-0032` §7) porte aussi la
suspension.

> 🔴 **Sans ça, le bouton fabrique la panne qu'il prétend éviter.** Le dépôt a déjà payé
> *« rien ne s'est passé depuis deux heures »* : quatre lots ont attendu six heures dans Redis
> parce qu'aucun écran ne disait qu'il manquait un consommateur. Un ZETIS suspendu invisible est le
> même défaut, causé par Papa lui-même — et donc plus difficile à soupçonner.

### §7 — Ce que suspendre **ne fait pas**, dit à l'écran

Ne touche pas au régime · ne désarme pas le déclencheur · ne défait rien · n'annule aucun contenu
servi · ne vide pas la file.

> Une commande destructive et une commande d'arrêt ne se ressemblent pas, et l'écran doit le dire
> **avant** le clic. Le veto retire une *pièce* ; ceci arrête la *machine*.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Un drapeau lu dans `massimo_is_active`** | La boucle qui la consomme est **bornée** : le suspend se lèverait seul après `production_max_wait_minutes`. Mesuré, pas supposé. |
| **Arrêter le worker RQ** (`send_shutdown_command`) | Ça arrête le *processus*, pas la *politique* : en prod, `restart: unless-stopped` le relance aussitôt, et il reprend la file. Ça répond à « ce worker est périmé » (A1), pas à « ne produis plus ». |
| **Vider la file Redis** | Destructif et asymétrique : les lots perdus ne reviennent pas, alors que suspendre doit être **sans conséquence** une fois levé. |
| **Un statut de lot neuf (`interrupted`)** | Demanderait de toucher le vocabulaire de statut, la barre du header, le Journal et les filtres — pour une information que `blocked` porte déjà, par notion, avec son motif. |
| **S'arrêter entre deux NOTIONS** (le grain que le code applique aujourd'hui) | Plus simple — une notion est atomique, le journal ne change pas. Mais **~77 s d'attente mesurés** pour un arrêt d'urgence, et surtout : ce n'est **pas** le grain que l'`adr-0031` §3 a décidé. Choisir la commodité contre une décision écrite, c'est ce que ce dépôt appelle une dette. |
| **Faire attendre le lot au lieu de l'arrêter** | Un lot `running` éternel tient le worker et ment à la barre. C'est le mode d'échec qu'on vient d'écarter, réintroduit par la porte d'à côté. |
| **Suspendre aussi le rendu vidéo** | Autre worker, autre file, aucun appel LLM, aucun contenu pédagogique. L'inclure élargirait le geste sans motif — voir Hors périmètre. |

## Périmètre

🔴 **Deux critères qui bornent, et ils mordent dès le premier jour :**

1. **Aucune migration Alembic, aucun statut de lot neuf.** Tout tient dans `app_settings`, dans le
   tuple `REGULATORS`, et dans l'`outcome="blocked"` existant. Le jour où ce chantier veut une
   colonne ou un statut, il est sorti de son périmètre.
2. **Aucune ligne de `massimo_is_active` ni de `_wait_for_massimo` ne change.** Le suspend est un
   objet distinct de l'attente de Massimo ; les mêler produirait le minuteur du §5.

Livré : la clé et son service · le sixième régulateur · l'arrêt au grain de préemption avec son
journal · `GET`/`PUT` sur le routeur `/api/settings` existant (donc `require_parent`) · le geste
dans 🧠 **La machine** · l'état dans la sidebar.

## Hors périmètre — nommé

- **Le worker de rendu vidéo** et sa file : autre processus, aucun contenu pédagogique.
- **Redémarrer un worker** — c'est **A1**, un autre geste et un autre objet (le processus, pas la
  politique).
- **Vider ou purger la file.** Les lots déjà en file restent, et repartiront à la levée.
- **Une suspension programmée** (« pendant les vacances », « la nuit ») : un calendrier est un
  réglage de plus, et personne ne l'a demandé.
- **Suspendre depuis un autre écran que Paramètres.** La sidebar **lit**, elle ne règle pas
  (`adr-0032` §7) — et un arrêt qui se déclenche d'un clic dans un coin d'écran est un accident qui
  attend.
- **Ce que la restauration en fera** (`BACKLOG.md` phase E) : elle suspend avant de remplacer, mais
  la séquence est à elle, pas à ce chantier.

## Conséquences

**Ce que ça donne.** Un veto retire une pièce ; ceci arrête la machine — et c'est le seul geste qui
manquait entre « laisser tourner » et « débrancher un conteneur ». Il débloque aussi la phase E :
l'étape ② d'une restauration est *« suspendre ZETIS et laisser la pièce en cours se terminer »*.

**Ce que ça coûte.**

- **~15 à 45 s entre le clic et l'arrêt effectif** (grain = la pièce). L'écran doit l'annoncer
  **avant** le clic, sinon le bouton se lit comme cassé.
- **Une notion peut rester à moitié équipée**, et le journal doit le dire pièce par pièce. C'est le
  vrai travail de la slice — et c'est le prix du grain fin. Au grain de la notion, ce cas n'existe
  pas… mais l'attente double.
- **Un état de plus à afficher sur 22 écrans.** C'est le prix du §6, et il est assumé : la seule
  chose pire est un ZETIS suspendu que personne ne voit.
- **Un sixième mot dans un vocabulaire fermé.** Tout lecteur de `REGULATORS` doit le rendre — c'est
  précisément pourquoi le vocabulaire est fermé et qu'un code inconnu se signale.

## Le signal qui dirait qu'on s'est trompé

- 🔴 **Papa suspend, oublie, et découvre trois jours plus tard que rien n'a été produit.** Alors le
  §6 n'a pas suffi : un badge permanent ne se voit plus au bout d'un jour, et il faut un rappel —
  pas un réveil automatique (§5), un **rappel**.
- **Papa clique « Suspendre » puis reclique parce qu'il ne se passe rien.** Alors l'annonce du
  délai n'est pas lisible, ou l'écran ne montre pas que l'arrêt est **en cours**.
- **Quelqu'un demande pourquoi le scan n'a rien fait cette nuit.** Alors le §2 s'est trompé : le
  refus non persisté manquait, et il faut le journaliser **une fois par suspension**, pas par
  réveil.
- **Un lot repart alors que ZETIS est suspendu.** Alors `create_run` n'était pas la porte unique —
  et c'est la mesure centrale de ce cadrage qui serait fausse.

## Suivi

1. Slice unique, branche `feat/suspendre-zetis`, après le merge de la tranche 1 de l'`adr-0062`.
2. **Read-before-code à faire dans la slice** : `execute()` lit les paliers **une fois** au départ
   et les **capture** sur le lot (*« un lot doit s'exécuter sous le régime qui l'a autorisé »*).
   Vérifier que le suspend, lui, se lit bien **à chaque notion** — c'est l'inverse de la capture, et
   pour une raison : un arrêt d'urgence qui obéirait à l'état d'il y a une heure n'arrête rien.
3. **À vérifier dans la slice** : `on_piece` est aujourd'hui un pur effet d'affichage (il écrit
   `run.current_piece` **sans commit**, en s'appuyant sur le commit des générateurs). Y brancher une
   décision d'arrêt demande de vérifier que la lecture du drapeau n'introduit pas de transaction —
   le dépôt a déjà payé un `idle in transaction` qui gelait toute migration.
4. **La divergence de grain de `_wait_for_massimo` reste ouverte.** Elle est désormais écrite (ici
   et au §Contexte) ; elle mérite son propre chantier, ou une note dans l'`adr-0031`.
5. **A1** (redémarrer un worker) reste indépendant : autre objet, cas *surface*, ADR après l'écran.
