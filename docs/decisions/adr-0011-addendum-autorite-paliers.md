# Addendum ADR-0011 — §G · L'autorité monte d'un cran : `parent_rule` et le veto paresseux

## Statut

Proposé — 2026-08-02. Premier document du chantier d'**autonomisation progressive de ZETIS**
(paliers 1 → 2 → 3). Ne dépend d'aucun autre ; l'ADR-0031 (`production_runs`, déclencheurs,
surface Papa) s'appuiera sur lui.

> S'appuie sur : `adr-0011 addendum §F` (provenance de la validation — **ce §G en est la suite
> directe**), `adr-0011 addendum §E` (fraîcheur, `is_stale`), `adr-0014 §2` (`system`, quiz),
> `adr-0021 §2` (équipement auto-validé), `adr-0023 §7` (le gate humain sur la rédaction de cours
> **ne bouge pas**), `adr-0027` (classe C, actes destructifs fermés). **Ne rouvre aucune décision.**

## Contexte

Papa produit aujourd'hui tout le contenu de Massimo, manuellement. C'est le goulot du dispositif.
On veut que ZETIS puisse, **avec l'accord de Papa et acte par acte**, en prendre une part
croissante — sans jamais faire de « rien n'atteint Massimo sans validation » un mensonge.

Trois paliers, par classe d'objet :

| Palier | Nom | Fonctionnement |
|---|---|---|
| 1 | ZETIS off | Papa crée. Massimo reçoit. |
| 2 | ZETIS semi-autonome | ZETIS crée, Papa valide, puis Massimo reçoit. |
| 3 | ZETIS autonome | ZETIS crée et sert. Papa est informé après coup : lire, corriger, régénérer, retirer. |

**Le but final n'est pas de produire plus, c'est d'optimiser le niveau scolaire de Massimo.** Une
fois la production libérée, le goulot suivant est son **attention** (30 à 60 min/jour), qui ne se
multiplie pas. Produire cinq fois plus fabriquerait de l'inventaire, pas de l'apprentissage.

Ce §G pose **le vocabulaire d'autorité et le régime de retrait**. Il ne livre aucun palier 3 : il
rend possible de l'écrire sans mentir.

## Constat read-before-code

**1. `validated_by` pose déjà littéralement la question de l'autorité.** Le §F existe pour
« savoir a posteriori ce que j'ai validé moi et ce que ZETIS a laissé passer ». Créer une colonne
`authority` à côté donnerait **deux réponses à une seule question** — exactement le mal que le §F
élimine. `provenance.mark_validated` est le **seul** chemin d'écriture (test-verrou §F.3).

**2. ⚠️ Le §F.4 a DÉJÀ tranché l'auto-validation — et le cadrage le lisait mal.** §F.4 corrige une
version antérieure qui affirmait qu'une auto-validation exigerait un nouvel ADR : l'équipement de
l'ADR-0021 §2 est **exactement `parent_bulk`** (« un geste humain unique, N objets, aucune
relecture pièce par pièce »).

> **Ce qui est nouveau au palier 3 n'est donc PAS « du contenu non relu atteint Massimo » — c'est
> déjà vrai, et c'est honnête.** Ce qui est nouveau, c'est la disparition du **geste par lot**,
> qui est aujourd'hui le seul régulateur de volume existant. Le §G ne franchit qu'une frontière,
> et il faut la nommer exactement.

**3. `system` est verrouillé, et le verrou tiendra.** `test_system_is_reserved_to_quizzes` cible
les deux formes d'écriture (`provenance import SYSTEM`, ou `validated_by` + `system` littéral).
Une valeur nouvelle ne le déclenche pas. Sa raison d'être écrite — « une future auto-validation
pourrait s'y déguiser sans ADR » — désigne précisément ce moment.

**4. Le « trou » de traçabilité de la consommation n'existe pas.** Les quatre familles de dérivés
tracent déjà : `SpacedReviewAttempt`, `QuizAttempt`, `CapsuleView`, et **`fiche_views` /
`mindmap_views`** (`seen_at`, unique par élève × ressource). Une analyse antérieure avait conclu
l'inverse, induite en erreur par un docstring périmé. **Le veto ci-dessous n'a aucune dette à
payer d'abord.**

**5. ⚠️ Le nuancier Papa confond déjà deux états.** `CoverageCellView.tsx` rend `null` **comme**
`parent_bulk` (« il date d'avant la traçabilité »). Une provenance inconnue et une validation
groupée y sont donc indistinguables à l'œil. Ce n'est pas bloquant, mais ajouter une quatrième
teinte sans corriger cela laisserait deux valeurs sur trois se ressembler.

## Décision

### G.1 — Une valeur de plus sur `validated_by`, pas une colonne de plus

> **`parent_rule`** — aucun humain n'a ouvert cette pièce, **ni cliqué pour ce lot** ; un humain a
> autorisé la **règle permanente** qui l'a produite.

Alignement de nommage volontaire : `parent` (pièce) → `parent_bulk` (lot) → `parent_rule` (règle).
**La même échelle, un cran de plus.** Les trois disent « décision humaine », à des granularités
d'attention décroissantes. La quatrième valeur, `system`, n'est pas sur cette échelle : elle dit
« servi sans relecture **par doctrine** » et reste strictement réservée au quiz.

C'est ce qui rend le palier 3 racontable sans casser l'invariant :

> **La validation ne disparaît pas. Elle remonte du contenu vers le règlement.**

**Ne pas réutiliser `system`** (constat 3). **Ne pas créer de colonne `authority`** (constat 1).

Conséquences gratuites : le test-verrou « aucun `validated` sans `validated_by` »
(`test_no_validated_row_without_provenance`) continue de tenir **sans modification** —
`parent_rule` est une valeur non nulle comme les autres.

Coûts réels, à ne pas passer sous silence : le type partagé `ValidatedBy`
(`packages/types/src/production.ts`) et le nuancier `CoverageCellView` gagnent une entrée. Le
constat 5 est à corriger dans la même passe, sinon trois valeurs sur quatre se ressemblent.

### G.2 — La matrice : l'autonomie se dose par classe d'objet, pas par un interrupteur global

L'autonomie ne se dose pas par « niveau de confiance en ZETIS ». Elle se dose par **coût d'erreur
× réversibilité avant exposition**.

| Classe | Objets | L'erreur… | Palier visé |
|---|---|---|---|
| **A0a — dérivés inertes** | fiche, mindmap, quiz, capsule | dort jusqu'à consultation | **3** |
| **A0b — dérivés en boucle** | cartes SRS | **se compose semaine après semaine** | **3** (voir G.3) |
| **A1 — rédaction de cours** | `lessons.content_markdown` | atteint le seul contenu vraiment lu | **2 — figé** |
| **A2 — référentiel** | `Skill`, `Lesson`, `Chapter` | redessine la carte | **1** |
| **A3 — création de mission** | `missions` | consomme l'attention, ressource rare | **2** |
| **A4 — terminal** | supprimer, archiver, dévalider | définitive | **jamais** |

**Pourquoi A0a et A0b sont séparés** : une fiche fausse reste inerte jusqu'à ce qu'on l'ouvre ;
une carte SRS fausse **entre dans une boucle de planification** et sera révisée pendant des
semaines. C'est le seul dérivé dont l'erreur ne dort pas — elle travaille.

**Trois cellules ne sont pas libres, elles sont déjà tranchées ailleurs :**

- **A1 en palier 2** — ADR-0023 §7 : « le seul endroit du dispositif où le gate humain reste
  obligatoire et bloquant, **et il ne bouge pas** ». Y toucher = rouvrir l'ADR-0023.
- **A3** — nuance à préserver : **élire ≠ créer**. Le sélecteur quotidien élit déjà de façon
  autonome et déterministe. Ce qui n'est pas autonome, c'est la *création*.
- **A4** = classe C de l'ADR-0027, déjà fermée.

**Le palier est porté par la donnée, jamais par le code.** Les deux classes figées sont lisibles
et non écrivables : le serveur refuse toute valeur autre que celle fixée par ADR.

### G.3 — Le veto est passif et paresseux : la consommation ferme la fenêtre, pas l'horloge

**Ce qu'on écarte : la quarantaine temporelle.** « Invisible de Massimo pendant N heures » a trois
défauts, le troisième disqualifiant : elle exige un ordonnanceur pour libérer à expiration (que
l'ADR-0023 a refusé) ; elle ment sur ce qu'elle mesure (N heures ne mesure pas la disponibilité de
Papa — produit vendredi soir, libéré samedi matin, la fenêtre a expiré sans que le veto ait été
possible) ; et elle réintroduit `pending` sous un autre nom, **en échappant à son régulateur**.

> Un contenu produit en `parent_rule` est **servi immédiatement**. Il est **rétractable sans
> trace** tant que Massimo ne l'a pas consommé. **La consommation — pas l'horloge — ferme la
> fenêtre.**

- **Papa n'a rien à faire pour accepter.** Le silence vaut accord : c'est ce qui rend l'autonomie
  réelle.
- **Aucun ordonnanceur.** Pas de tâche de libération, pas d'état transitoire.
- **La fenêtre dure aussi longtemps qu'elle est utile.** Un contenu jamais consulté reste
  rétractable des semaines ; un contenu ouvert dans l'heure en sort dans l'heure.

| État | Geste de Papa | Effet |
|---|---|---|
| **Non consommé** | *Retirer* | suppression franche, aucune trace, aucun signal à Massimo |
| **Consommé** | *Corriger* / *Régénérer* | l'objet vit, il est amendé (`is_stale` existe déjà) |

La bascule est traçable pour les **quatre** familles (constat 4) : `SpacedReviewAttempt`,
`QuizAttempt`, `CapsuleView`, `fiche_views` / `mindmap_views`.

**A0b se résout par ce régime, sans état nouveau.** Une carte non révisée n'a aucun
`SpacedReviewAttempt` : elle est non consommée, donc rétractable sans trace. La première révision
ferme la fenêtre. Aucune valeur nouvelle dans `INACTIVE_CARD_STATUSES`.

**Mais l'inversion doit être assumée** : la fenêtre se ferme au moment précis où le danger
commence. Avant la première révision, la carte est inoffensive *et* retirable ; après, nuisible
*et* verrouillée. La sortie n'est pas de rouvrir le veto (V1 protège Massimo d'un trou
inexpliqué) — c'est que, **pour A0b seul, « Corriger » doit pouvoir remettre la planification à
zéro** : la carte survit, son historique fautif non.

### G.4 — Deux invariants

- **V1 — le retrait est invisible de Massimo.** Un contenu non consommé qui disparaît n'a jamais
  existé pour lui. Aucun message, aucun trou signalé.
- **V2 — la dé-escalade ne rétroagit jamais.** Repasser une classe en validation arrête la
  production **future** ; le contenu déjà servi reste servi. Même principe que « l'XP déjà crédité
  n'est jamais rembobiné ».

## Périmètre

**Dans ce §G** : la valeur `parent_rule` (**modélisée, NON ÉMISE**), la matrice classe × palier,
le régime de veto, les deux invariants. Le type partagé `ValidatedBy` et le nuancier
`CoverageCellView` gagnent leur entrée, **avec** la correction du constat 5.

> **Le modèle anticipe, le code n'anticipe pas.** `parent_rule` naît légal et non émis — patron
> `content_kind` (six valeurs au modèle, quatre émises en v1). Aucun chemin ne l'écrit tant que
> l'ADR-0031 n'a pas livré son régulateur et sa surface Papa.

**Hors de ce §G** : `production_runs` et les déclencheurs (ADR-0031) ; le régulateur du palier 3 et
le panneau des paliers (ADR-0031) ; l'émission effective de `parent_rule` et les plafonds de
missions (ADR-0032) ; l'indicateur d'autonomie de Massimo (ADR-0033).

## Conséquences

### Positives

- Le palier 3 devient **racontable sans mensonge** : la validation ne disparaît pas, elle change
  de granularité — et l'échelle `parent` → `parent_bulk` → `parent_rule` le dit dans la donnée.
- **Aucune colonne, aucune table, aucune migration.** Une valeur de plus sur une colonne texte.
- Le veto ne demande **aucun ordonnanceur** — ce qui préserve le refus de `launchd`/`pmset` de
  l'ADR-0023.
- Les deux test-verrous existants (§F.3, `system`) continuent de tenir sans modification.

### Négatives / coûts

- **Le veto est un droit sans notification.** Papa n'apprend qu'un contenu existe qu'en ouvrant
  la surface qui le liste ; Massimo consomme en 24-48 h. La fenêtre nominale est, en pratique,
  souvent fermée avant que Papa ait su qu'elle s'ouvrait. **L'ADR-0031 doit trancher où cette
  information apparaît** — la piste la moins coûteuse est la Couverture, que Papa ouvre déjà et
  où la provenance s'affiche **par objet** (§F.2 respecté à la lettre : jamais totalisée).
- Une quatrième teinte dans un nuancier qui en confond déjà deux (constat 5).
- L'inversion d'A0b (G.3) exige une action « Corriger » plus puissante que l'édition actuelle.

## Suivi

Tests-verrous exigés :

1. `parent_rule` est une valeur **légale et non émise** : aucun chemin du dépôt ne l'écrit
   (patron du verrou `system`, inversé).
2. `test_no_validated_row_without_provenance` continue de passer **sans modification**.
3. `test_system_is_reserved_to_quizzes` continue de passer **sans modification** — `parent_rule`
   ne s'y déguise pas.
4. Les deux classes figées (A1, A4) sont **refusées côté serveur** à l'écriture, quelle que soit
   la valeur envoyée.
5. Le nuancier distingue **quatre** provenances plus l'inconnu — `null` cesse d'être rendu comme
   `parent_bulk` (constat 5).

Point ouvert, à trancher dans l'ADR-0031 et **pas ici** : la surface où Papa voit ce qui a été
produit en `parent_rule` assez tôt pour exercer son veto (§Conséquences négatives).
