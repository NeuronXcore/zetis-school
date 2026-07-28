# Addendum ADR-0011 — §F · Provenance de la validation

> À concaténer après le §E dans `docs/decisions/adr-0011-contexte-canonique-partage.md`.
> Statut : **Accepté — 2026-07-28**. Même migration que §E.3.

## Contexte

Besoin exprimé (Papa) : *savoir a posteriori ce que j'ai validé moi et ce que ZETIS a laissé
passer* — question qui devient structurante dès que la production en lot existe.

`source` (`generated` | `manual`) dit **qui a produit**. `validation_status` dit **si c'est
passé**. Aucune colonne ne dit **qui a laissé passer**. Trois situations très différentes
portent aujourd'hui la même valeur `validated`, ou aucune :

1. Papa a ouvert l'objet, l'a lu, l'a validé ;
2. Papa a cliqué une validation groupée — `POST /chapters/validate-all` existe déjà, à
   l'échelle d'une matière ou de l'année entière ;
3. personne n'a rien relu : le quiz, servi sans gate (ADR-0014 Décision 2).

Les cas 1 et 2 sont indiscernables. Le cas 3 est muet. Et la file de relecture à venir
comportera nécessairement une action groupée face à des dizaines d'objets : sans marquage,
le cas 1 deviendra rare et le cas 2 massif, sans que rien ne le montre.

## Décision

### F.1 — Deux colonnes, sur chaque table de contenu validable

`fiches`, `mindmaps`, `capsules` (dérivés) **et `chapters`, `lessons`** (référentiel) :

| colonne | type | sens |
|---|---|---|
| `validated_at` | `datetime`, nullable | horodatage du passage à `validated` |
| `validated_by` | enum, nullable | provenance de la décision |

**Pourquoi `chapters` et `lessons`.** `POST /chapters/validate-all` et
`POST /school-years/active/chapters/validate-all` existent depuis l'ADR-0009 et valident une
matière — voire l'année entière — d'un clic. C'est le chemin le plus « en lot » de tout ZETIS,
et ce serait précisément celui qu'on ne tracerait pas. De plus, le **cours est le seul contenu
que Massimo lit vraiment** : savoir s'il a été relu ou expédié dans un `validate-all` importe
davantage que la même information sur une fiche.

**Pourquoi pas `missions`.** Elles naissent `validated` **par construction**, toujours par le
même chemin (ADR-0018 déc. 2, ADR-0021 §2, ADR-0022 §5), sans exception. La colonne vaudrait
invariablement `parent_bulk`. Une colonne à valeur unique n'est pas de la traçabilité, c'est du
bruit — l'information vit déjà dans `mission_type` + `created_by`.

Valeurs de `validated_by` :

- **`parent`** — objet ouvert et relu individuellement avant validation ;
- **`parent_bulk`** — passé dans une validation groupée, jamais ouvert pièce par pièce.
  Décision humaine, attention non individuelle : les deux sont vraies, la colonne le dit ;
- **`system`** — servi sans relecture par doctrine assumée (le quiz). Écrit à la génération ;
- **`NULL`** — antérieur à la traçabilité, ou non validé.

Reprise : `NULL` pour toutes les lignes existantes. **On ne rétro-attribue pas.** Prétendre
savoir ce qui a été relu avant l'existence de la colonne serait exactement le mensonge que
cette décision corrige.

### F.2 — La provenance est un **fait**, jamais un reproche

Elle s'affiche comme `source` s'affiche : information neutre de traçabilité. La page Couverture
et les pages de pilotage la montrent ; **aucune ne compte, ne classe ni ne relance sur cette
base**. Pas de « N objets jamais relus » en KPI, pas d'alerte, pas de badge d'incitation.

Un compteur qui reproche à Papa une tâche qu'il a délibérément choisi de ne pas faire n'est pas
un outil de pilotage, c'est une dette morale affichée. La distinction est structurelle et non
cosmétique : la provenance sert à **expliquer** un objet quand une question se pose sur lui,
pas à réclamer du travail.

### F.3 — Toute action groupée écrit `parent_bulk`, sans exception

Les écrivains sont : `POST /chapters/validate-all` (existant, à mettre en conformité), la
validation groupée de la future file de relecture, et toute action de lot ultérieure.
La validation unitaire depuis une page de pilotage écrit `parent`.

**Aucun chemin ne doit écrire `validated` sans renseigner `validated_by`.** Un test-verrou
garantit qu'il n'existe pas de ligne `validation_status='validated' AND validated_by IS NULL`
créée après la migration.

### F.4 — L'auto-validation existe déjà, et `parent_bulk` la couvre

**Correction d'une erreur d'une version antérieure de cet addendum**, qui affirmait qu'une
auto-validation exigerait un nouvel ADR. Elle est actée depuis l'ADR-0021 §2 : lors de
l'équipement d'une notion depuis le Conseil de classe, le kit généré est marqué `validated`
immédiatement, *la popup de confirmation Papa valant acte d'approbation*. C'est la soupape
§5ter de l'ADR-0017, ouverte étroitement.

Aucune valeur nouvelle n'est requise : ce flux est exactement **`parent_bulk`** — un geste
humain unique, N objets, aucune relecture pièce par pièce. Les autres écrivains de cette
valeur sont l'équipement d'une mission champion (ADR-0022 §5) et `validate-all` (§F.3).

Deux cas de ce flux méritent d'être visibles, et c'est la raison d'être du §F :

- l'ADR-0021 §5 **valide une pièce `pending` préexistante** pour rendre la mission jouable —
  y compris un brouillon que Papa avait délibérément laissé en attente. Sans traçabilité,
  ce basculement est indétectable ;
- un kit entier atteint Massimo sans qu'aucune de ses pièces ait été ouverte.

`system` reste strictement réservé au contenu d'évaluation éphémère sorti du gate par
l'ADR-0014 (le quiz). **Aucun autre chemin ne doit l'écrire** — un test dédié le garantit,
faute de quoi une future auto-validation pourrait s'y déguiser sans ADR.

## Conséquences

**Positives** — la question « qui a laissé passer ceci » devient répondable, pour chaque objet,
définitivement ; la validation groupée cesse d'être un raccourci invisible ; quand Massimo
signale un contenu douteux, on sait immédiatement s'il avait été relu ; la file de relecture
peut offrir une action groupée sans dissoudre l'information.

**Négatives / coûts** — deux colonnes par table de dérivé (mêmes migration et chantier que
§E.3) ; tous les chemins de validation existants à mettre en conformité, y compris
`validate-all` ; un historique définitivement `NULL`, assumé.

## Suivi

- Colonnes ajoutées **dans la migration du §E.3** — une seule migration pour les deux
  addenda, pas deux.
- Note sous chaque table de dérivé dans `DATA_MODEL.md`.
- **Backlog, non planifié** : signalement par Massimo (« cette question est bizarre »)
  remontant l'objet à Papa. C'est le complément naturel de F.2 — plutôt qu'un contrôle
  exhaustif improbable, un signal rare et réel, qui donne de l'agentivité à Massimo au lieu
  de le laisser encaisser une clé fausse en silence. Coût : une table minuscule.
- Ligne à ajouter dans `DECISIONS.md` sous ADR-0011 (« + addenda §E fraîcheur, §F provenance »).

## Décisions validées (commanditaire, 2026-07-28)

1. **Portée des colonnes** : `fiches`, `mindmaps`, `capsules`, **`chapters`, `lessons`** —
   `missions` **exclues** (valeur invariable) — retenu.
2. **`parent_bulk` couvre l'auto-validation ADR-0021 §2** sans valeur nouvelle — retenu.
3. **La provenance est un fait, jamais un reproche** : affichée par objet, **jamais totalisée,
   jamais relancée** (aucun KPI, aucune alerte, aucun filtre « jamais relu ») — retenu.
4. **Aucune rétro-attribution** : l'historique reste `NULL` — retenu.
