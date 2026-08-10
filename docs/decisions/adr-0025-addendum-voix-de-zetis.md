# Addendum ADR-0025 — §16 · Papa n'existe pas dans l'espace de Massimo

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**.
> **Amende le §2a** : le marqueur de co-édition reste, l'auteur nommé change.
> **Portée volontairement plus large que l'agenda** — cinq surfaces de l'app Massimo et le module
> `chat` du serveur. Aucune migration.

## Contexte

Le §2a exige qu'un item touché par quelqu'un d'autre le **dise** : *« sans ce marqueur, Massimo
découvre un agenda qui bouge tout seul — la surveillance rentre par la porte de service »*. Le
libellé retenu à l'époque était « ajouté par papa » / « complété par papa ».

Le nom s'était ensuite installé partout ailleurs : ELI5 (« Dis à Papa d'ajouter »), le chat
(« Papa verra ta demande »), le diagnostic (« Papa prépare les diagnostics depuis son espace »),
les capsules (« Papa en prépare de nouvelles »).

**La décision inverse avait pourtant déjà été prise, le 2026-08-02, sur les missions** :

> *« Aucune signature d'auteur : une mission arrive dans la voix de ZETIS, quel que soit qui l'a
> créée. "👤 par Papa" aurait dû changer d'auteur le jour où ZETIS produit seul — la voix du monde
> de Massimo doit tenir dans le temps. »*

Cet addendum ne fait que **généraliser** ce raisonnement. Il n'introduit pas de doctrine neuve ;
il finit d'appliquer celle qui existait sur une seule surface.

## Décision

### 16.1 — Une seule voix, et c'est celle de ZETIS

**Aucune chaîne rendue à Massimo ne nomme l'adulte.** Ni « papa », ni « ton père », ni « tes
parents » — le mot disparaît de son monde.

Ce qui reste vrai côté produit ne change pas d'un pouce : Papa pilote, valide, saisit l'agenda,
trie les demandes. **Le §16 porte sur ce que Massimo LIT, jamais sur ce que le produit FAIT.**

### 16.2 — Le §2a est amendé, pas révoqué

« ajouté par ZETIS » / « complété par ZETIS » remplacent les libellés d'origine.

L'invariant du §2a tient **entier** : un item que Massimo n'a pas écrit porte toujours un
marqueur, et une correction reste annoncée en priorité. Le §2a exigeait que Massimo sache qu'un
**autre** a touché son agenda ; il n'a jamais exigé de le **nommer**. C'est l'altérité qui protège,
pas l'identité.

### 16.3 — Deux formes, selon qui parle

Le remplacement n'est pas mécanique, et deux endroits ont demandé une réécriture :

- **Là où ZETIS parle à la première personne** — le chat, où Massimo s'adresse directement à lui —
  nommer « ZETIS » en ferait un **tiers dans sa propre conversation**. La forme juste est
  *« je le note »*, pas *« je le note pour ZETIS »*.
- **Là où une phrase décrivait une personne et son écran** — « Papa prépare les diagnostics
  **depuis son espace**, dès qu'**il** en laisse passer un » — la phrase entière a été refaite,
  pas seulement son sujet.

### 16.4 — Deux verrous, et il en fallait deux

Un test balaie `apps/frontend-massimo/src`, un autre `app/modules/chat`. Les deux échouent sur
toute chaîne rendue contenant « papa », commentaires exclus — **la doctrine s'écrit, et elle doit
pouvoir nommer Papa pour expliquer pourquoi il ne s'affiche pas.**

> ⚠️ **Le second verrou n'est pas une symétrie de confort, c'est un constat.** Le libellé du bouton
> de demande du chat est **fabriqué côté serveur** (`ChatAction.label`, servi tel quel au front).
> Un verrou limité au frontend aurait été **vert sur trois phrases fautives** — dont celle que
> Massimo lit le plus souvent quand ZETIS n'a pas de contenu.

Le balayage de dépôt est préféré à un test par écran : la règle est transverse, et un test par
surface laisserait passer la sixième, écrite dans six mois par quelqu'un qui n'aura pas lu l'ADR.

## Conséquences

**Positives** — la voix du monde de Massimo est unique et tiendra le jour où ZETIS produira seul ;
la décision du 2026-08-02 cesse d'être une exception sur une seule page ; et deux verrous de dépôt
rendent la règle opposable sans relecture humaine.

**Négatives / coûts** — quatre tests existants encodaient les anciennes formulations et ont été
mis à jour ; ils protégeaient un invariant (« ZETIS annonce qu'il note plutôt que de faire semblant
d'avoir le contenu ») qui, lui, n'a pas bougé — les assertions portent désormais sur **la promesse
elle-même** (`« je le note »`) plutôt que sur son destinataire, ce qui est un meilleur témoin.
Coût réel : une **perte d'information** pour Massimo, qui ne saura plus que c'est un humain qui
répond à sa demande. Assumé — c'est le prix d'une voix qui tient dans le temps.

## Suivi

- **Verrou de dépôt** ×2 (front + `chat`), sabotés et rougis à l'écriture.
- ⚠️ Les identifiants de code (`askPapaToAdd`, `_as_papa`, `PapaLayout`…) **ne sont pas
  concernés** : un identifiant ne se lit pas à l'écran. Le verrou ne retient que le mot isolé.
- À étendre si une surface Massimo naît hors de ces deux dossiers.
- Commit suggéré : `feat(massimo): one voice, and it is ZETIS`.

## Décisions validées (commanditaire, 2026-08-10)

1. **« ajouté par ZETIS » remplace « ajouté par papa »**, et le nom de l'adulte disparaît de
   **tout** l'espace de Massimo — pas seulement de l'agenda.
