# Addendum ADR-0036 — Le bouton qui ne peut pas aboutir : le verdict porte sur la SITUATION, pas sur le TYPE

## Statut

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

## Contexte — ce que l'ADR-0036 n'a pas pu voir

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

### Le cas réel, du 2026-08-04

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

### Et le motif était faux

`BLOCKED_COURSE_PENDING` dit « **Cours à valider** ». La leçon 16 **est** validée. Elle est vide.

Le champ `Lesson.status` porte deux sens : *« cette leçon fait partie du programme validé »* — ce
qu'écrit `validate_all_lessons`, qui passe en `validated` **toutes** les `draft` d'un chapitre sans
regarder s'il y a un texte — et *« le texte du cours est validé »*, ce que lit la production.
**39 leçons de la base de dev sont dans cet état** contre 28 réellement rédigées : le motif est donc
faux pour la majorité des cas où il s'affiche.

## Décision

### 1. Le verdict s'étend du TYPE à la SITUATION — `blocked_reason`

Chaque demande listée porte, à côté de `producible`, un `blocked_reason: string | null` :
**le motif exact pour lequel un lot lancé maintenant ne produirait rien**, ou `null` s'il produirait.

Il est calculé **par le même code que le lot exécutera** — `runner.select_notions`, sous le gate
`settings.course_gate_enabled` — et non par une seconde lecture « qui donne le même résultat ».
C'est la leçon de l'ADR-0037 : deux réponses à une même question divergent le jour où l'une bouge.

> **Conséquence assumée : le verdict est daté.** Papa peut valider un cours dans un autre onglet et
> rendre le motif caduc. Ce n'est pas un défaut à corriger par du temps réel : le motif ne
> **bloque** rien, la route reste ouverte, et un lot lancé sur une situation redevenue favorable
> produira. L'écran informe, il ne verrouille pas.

### 2. Il voyage dans la MÊME réponse que la liste — jamais un appel par ligne

`blocked_reason` est calculé dans `list_requests`, en **une** passe groupée (`lessons_by_skill` sur
tous les `skill_id` de la file). Interroger l'aperçu ligne par ligne aurait fait N requêtes pour un
écran — exactement le mal que l'ADR-0030 a supprimé côté Massimo, et que le sondage de l'en-tête a
repayé le 2026-08-02.

### 3. Le motif distingue « à écrire » de « à relire » — et il est écrit en ÉTAT + GESTE

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

### 4. L'écran remplace le bouton par le motif ET le geste qui répare

Patron du §3, mot pour mot : *« un CONSTAT, pas un bouton grisé »*, et *« le geste qui répare est à
côté du constat »*. Là où la capsule renvoie vers `/capsules`, une demande bloquée par le cours
renvoie vers `/matieres` — la page où Papa rédige et valide un cours.

**« Fait » et « Ignorer » restent offerts** : Papa doit pouvoir clore une demande qu'il ne compte pas
servir, quel que soit le verdict.

## Ce que cet addendum ne fera pas

- **Il ne répare pas `Lesson.status`.** La conflation des deux sens est le défaut de fond ; la
  corriger touche le curriculum, la galaxie, la production et `canonical_context`. Elle est
  **nommée ici pour être reconnue**, et sera son propre chantier — avec migration.
- **Il n'écrit aucun cours à la place de Papa**, et ne change aucun palier. Le gate est la décision
  de l'ADR-0032 ; on l'explique, on ne le contourne pas.
- **Il n'ajoute aucun lien profond** vers la leçon exacte (`/matieres` n'en accepte pas
  aujourd'hui). Un paramètre d'URL de plus est un chantier d'écran, pas de verdict.
- **Il ne masque pas le bouton par défaut** en cas de doute : sans motif, le bouton reste. Un écran
  qui retire un geste « au cas où » est plus nuisible qu'un lot qui ne produit rien.

## Le signal qui dirait qu'on s'est trompé

Papa lisant un motif **qui ne correspond pas** à ce que le lot fait ensuite — un « rien à produire »
suivi d'un lot qui produit, ou l'inverse. La réponse serait alors de **supprimer le verdict**, pas
de le corriger : un aperçu qui ment est pire que pas d'aperçu, puisqu'il fait renoncer à un geste
qui aurait marché.
