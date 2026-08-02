# Addendum ADR-0027 — Demander un contenu depuis une surface élève

## Statut

Accepté — 2026-08-01, **livré le jour même**, puis **amendé deux fois le soir** (§Amendements —
le libellé et le retrait de la phrase de transmission). Lève le « hors lot » de l'addendum
`content_requests` (« émission depuis d'autres surfaces que le chat »).

> S'appuie sur : `adr-0027` (l'orchestrateur oriente vers l'existant validé ; contenu absent →
> honnêteté + demande à Papa), son addendum `content_requests` (la table, la dédup forte, le
> `create` idempotent et ré-activant, l'inbox Papa), `adr-0023` (`production` strictement lecture
> seule), `adr-0024-addendum-page-matiere-index-notions` (la surface qui émet). **Ne rouvre
> aucune décision de ces textes.**

## Contexte

Le chat émet déjà des `content_requests`. Mais l'émission y est un **effet de bord invisible et
unitaire** : Massimo la subit sans savoir qu'il vient de la faire, et il ne peut pas choisir ce
qu'il demande.

Pendant ce temps, la surface qui montre **littéralement** ce qui manque — la panoplie grisée de la
page matière — n'a **aucun moyen de le demander**. Le geste le plus naturel du produit est
précisément celui qui n'existe pas.

## Décision

### 1. Une route enfant en ÉCRITURE, sur un module jusqu'ici `require_parent`

```
POST /api/student/content-requests     (require_child)
  entrée : { skill_id: int, content_kinds: [str] }
  sortie : { requested: [str] }
```

C'est une **décision de sécurité** — d'où cet ADR, et d'où sa livraison en **commit séparé**,
isolable dans l'historique.

Plusieurs `content_kinds` en un appel, parce que « tout ce qui manque » est **UN** geste de
l'enfant : le découper en sept requêtes en ferait sept lignes dans la file de Papa.

### 2. Écriture SEULE — aucun `GET`, aucun `PATCH` élève

**Ce n'est pas un manque de v1, c'est le fond.** La file de Papa n'est pas une surface de
l'enfant : un « refusé » visible serait le vocabulaire d'échec que ZETIS s'interdit, et une liste
de demandes en attente transformerait une file de travail en **écran d'attente**.

Vérifié par un test **sur le contrat OpenAPI**, pas sur des codes HTTP — une 403 ou une 405
masquerait une route bel et bien montée.

### 3. Trois garde-fous, tous testés

1. **Vocabulaire fermé** — `cours | fiche | mindmap | quiz | capsule | card`, porté par le
   **schéma** (`Literal`), donc appliqué en `422` avant d'atteindre le service. Un test-verrou le
   maintient aligné sur `service.CONTENT_KINDS`.
2. **Plafond** `CONTENT_REQUEST_MAX_KINDS` (v1 = 7), mesuré sur la charge **brute**.
3. **Visibilité** — le `skill_id` doit être visible de l'élève (même chaîne de filtrage que les
   autres routes élève). Sinon **404, et aucune ligne créée**.

Le troisième est le seul qui compte vraiment : **sans lui, la route devient un oracle
d'existence** sur les brouillons de Papa. Un `skill_id` au hasard répondrait « créé » ou « pas
créé », révélant ce qui existe en base sans être publié. La vérification précède **strictement**
la première écriture.

### 4. `source` distingue le CHOISI du SUBI

`subject_page` contre `chat_orchestrator`. Ce n'est pas cosmétique : dans le chat la demande est
un effet de bord, sur la page matière c'est un geste explicite sur une pastille grisée. **Papa lit
la différence**, et elle change la priorité qu'il accorde à la ligne.

### 5. Geste OPT-IN, et rien d'autre

« Demander » sur une pastille grisée ; « tout ce qui manque (n) » en un appel, le bouton
disparaissant quand `n = 0`. Retour visuel optimiste, avec **retour arrière silencieux** en cas
d'échec réseau — une demande perdue ne vaut pas un écran d'erreur chez un enfant : il retapera,
un message d'échec se retient.

**Aucun statut, aucun délai, aucun rappel.** **Aucun XP, aucun `event_type` neuf, aucune trace
d'événement** : demander n'est pas apprendre, et la **ligne de file EST la trace** (émettre
`chat_tool_response` hors du chat rendrait son nom menteur).

`create_request` n'est **pas modifié** — son idempotence et sa ré-activation bornent
structurellement la répétition. `production/coverage.py` n'est **pas touché**.

## Ce que le read-before-code a invalidé

**Le plafond de 7 ne bornait rien.** Il est décrit comme « la panoplie entière », mais la panoplie
affiche **7 activités** là où le vocabulaire n'en compte que **6** : `eli5` se demande sous la
forme `cours` (il s'ancre dessus), `revision` sous la forme `card`. Une liste dédupliquée ne peut
donc jamais atteindre 7 — le garde-fou était **inatteignable, donc intestable, donc décoratif**.

Il est désormais mesuré sur la charge **brute**, avant déduplication : **le plafond borne la
TAILLE de l'appel, le vocabulaire borne son CONTENU.** Deux garde-fous, deux risques différents.

Corollaire côté client : `cours` et `eli5` sont **toujours indisponibles ensemble** (les deux
suivent l'existence d'un cours validé) et se demandent tous deux comme `cours`. Sans
déduplication, « tout ce qui manque » annoncerait **7** et enverrait deux fois la même demande.

## Alternatives écartées

- **Réutiliser `notion_requests`** — sa sémantique est l'inverse : « notion hors programme, texte
  libre, `skill_id = None` ». Ici la notion **existe**, c'est le contenu qui manque.
- **Un endpoint unifiant les deux files** — recolle deux sémantiques séparées à raison.
- **Un `GET` élève « mes demandes »** — expose `dismissed`, et transforme une file de travail
  parent en écran d'attente d'enfant.
- **L'émission AUTOMATIQUE à l'affichage d'une panoplie incomplète** — la file se remplirait du
  **survolé** et non du **voulu**. La demande perdrait sa valeur de priorité, précisément ce qui
  la rend utile à Papa.

## Conséquences

**Positives** — le geste le plus naturel du produit existe enfin ; Papa reçoit des demandes
**choisies**, donc hiérarchisables ; l'invariant lecture seule de `production` tient.

**Coûts assumés** — un module `require_parent` s'ouvre en écriture à l'enfant (contrepartie : les
trois garde-fous) ; et une asymétrie de rôles dans un même module, qu'il faut lire pour comprendre.

**Zéro table, zéro migration.**

## Amendements — le soir même (2026-08-01)

### A. « Demander à Papa » devient « demander à ZETIS »

L'interlocuteur de Massimo est **ZETIS** — le même que dans le chat, où il réclame déjà des
contenus. Papa reste le **destinataire** (`source: "subject_page"` inchangé, la ligne atterrit
dans sa file), mais l'enfant s'adresse à l'app, pas à son père par-dessus l'épaule de l'app.

Le retour devient **« C'est noté par ZETIS »** — jamais « je te le prépare ».

### B. La phrase « ZETIS transmet la demande. Il ne fabrique rien tout seul. » est SUPPRIMÉE

**Divergence assumée avec cet ADR même**, qui l'exigeait sous le bouton. Elle était le garde-fou
de l'amendement A : « demander à ZETIS » pourrait se lire « ZETIS va le faire », et c'est elle qui
l'empêchait.

**Motif du retrait : ZETIS produira bientôt du contenu lui-même.** La phrase deviendrait un
mensonge, et on ne fige pas dans l'UI une limite qu'on s'apprête à lever.

Ce qui reste tient l'honnêteté sans elle : « C'est noté par ZETIS » dit qu'une demande est
**enregistrée**, sans promettre qui la traitera ni quand — vrai que le contenu vienne de Papa ou,
demain, de ZETIS.

Le test qui vérifiait la phrase a été **remplacé, pas supprimé** : il interdit désormais « je te
le prépare », « je m'en occupe », tout délai et tout statut. **Le garde-fou change de forme, il ne
disparaît pas** — et le jour où ZETIS générera vraiment, la tentation d'annoncer une livraison
sera là, c'est ce test qui la bloquera.

## Point ouvert

**Quand ZETIS produira lui-même : la demande déclenche-t-elle la génération, ou passe-t-elle
toujours par la validation de Papa ?** `CLAUDE.md` (« aucune réponse IA n'est vérité absolue ;
validation Papa obligatoire avant activation ») penche pour la seconde. **C'est une décision
d'ADR, pas d'UI** — à trancher avant d'écrire la moindre ligne de ce mécanisme.
