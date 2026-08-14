# ADR-0055 — Les deux étapes qui manquent

## Statut

**Proposé — 2026-08-14.** Les **sept décisions sont gelées** ; une session de slice peut démarrer
après `/ouverture`.

> Cadré sur `main`, **sans une ligne de code**, immédiatement après le merge de l'ADR-0054
> (PR #125). Né d'une question posée sans préambule : *« où sont passés les mnemonics des
> fiches ? »*

> ⚠️ **Ce chantier ne décide RIEN du produit.** L'addendum ADR-0015 §10 et §11 ont déjà tout
> tranché : la forme du champ, les trois garde-fous, le patron du corrigé, le libellé anglais,
> et la stratégie d'enrichissement. **Ils ne se rouvrent pas.** Cet ADR ne décide que le
> **chantier** : ce qu'on construit, dans quel ordre, et ce qui en sort.

> Consomme : `adr-0015` (fiches) et son **addendum**, §5 (règle 7 — ZETIS n'écrit jamais à la
> place de Massimo), **§10** (`mnemonique`, 6ᵉ section conditionnelle) et **§11** (enrichissement
> des fiches déjà créées).

## Contexte

L'atelier promet **six** étapes. Il en rend **quatre**, depuis la slice 1.

### Le constat, mesuré le 2026-08-14

| Couche | `mini_exemple` (étape ⑤) | `mnemonique` (étape ⑥) |
|---|---|---|
| `FicheSpec` (TS + Pydantic) | ✅ présent | ❌ **absent** |
| Vocabulaire fermé `FicheSection` | ✅ dans les 5 valeurs | ❌ **absent** |
| Prompt de génération (`FICHE_PROMPT_VERSION = "v1"`) | ✅ produit, avec son few-shot | ❌ **absent** |
| Rendu `FicheCard` + `FicheA5` | ✅ section « 💡 Un exemple » | ❌ |
| Étape dans l'atelier (`ETAPES`) | ❌ | ❌ |
| Route `candidates` | — | 🔴 **refuse avec un 400**, verrouillé par un test |

🔴 **L'asymétrie est le vrai défaut, et elle est ancienne.** ZETIS écrit des exemples sur ses
fiches ; **Massimo ne peut pas en écrire sur les siennes.** Sur un produit dont tout l'argument est
*« sa fiche à lui, à côté de celle de ZETIS »*, une section que l'un remplit et l'autre pas est une
inégalité visible à l'écran — et elle n'a jamais été nommée. Les deux étapes ont toujours été
rangées ensemble dans les « hors périmètre » (encore dans l'ADR-0054), alors qu'elles ne sont **pas
au même stade** : l'une est un **déblocage**, l'autre une **extension de vocabulaire**.

### Ce que le refus explicite prouve

La route `candidates` refuse `section="mnemonique"` par un **400**, et un test l'exige :

> *« Refuser en nommant la section vaut mieux qu'une liste vide, qui se lirait "il n'y a rien à
> retenir ici". »*

**Ce n'est donc pas un oubli**, et l'étape n'est pas non plus affichée grisée — le §10 l'interdit :
*une étape visible mais morte est une promesse que le produit ne tient pas.* Le manque a été tenu
proprement pendant quatre slices. Il reste un manque.

### Ce qui ne coûtera rien, et qu'on croyait coûteux

`spec_json` est une colonne **`JSON`** (`content.py:31`). Ajouter un champ optionnel au `FicheSpec`
**ne demande aucune migration** — et le §11 l'avait déjà établi côté lecture : champ optionnel à
défaut `None` + `extra="forbid"` ⇒ les `spec_json` existants **valident sans modification**.

*La crainte d'une migration a été formulée en séance puis mesurée fausse avant d'être inscrite ici.*

## Décision

### §1 — Deux étapes, deux natures — on ne les traite pas comme un lot

| | Étape ⑤ 💡 Un exemple | Étape ⑥ 🎩 Mnemonics |
|---|---|---|
| Nature | **déblocage** — tout existe sauf l'étape | **extension** du vocabulaire fermé |
| Schéma | **inchangé** | `mnemonique?: { moyen, sert_a }` |
| Condition d'apparition | **aucune** — champ libre, toujours offerte | **conditionnelle** — seulement si une occasion existe |
| Prompt de génération | **inchangé** (v1 la produit déjà) | v2 nécessaire **pour le corrigé seulement**, cf. §5 |

**Elles se livrent dans cet ordre**, et l'ordre porte un sens : ⑤ répare une inégalité qui existe
**aujourd'hui à l'écran**, ⑥ ajoute quelque chose que personne n'a encore.

### §2 — L'étape ⑤ est un déblocage, et elle se traite comme tel

Rien à décider : `mini_exemple` est dans le schéma, dans le prompt, rendu par les deux surfaces.
Il manque **l'étape dans `ETAPES`**, le champ libre, et l'ouverture de la section côté serveur.

⚠️ **Champ libre SANS candidates**, comme `essentiel` : un exemple ne se choisit pas dans le cours,
il s'invente. La route `candidates` doit donc, pour cette section, **rendre une amorce et zéro
candidate** — le patron existe déjà et il est documenté (`API_SPEC.md`, tableau des sections).

### §3 — `mnemonique` entre dans le vocabulaire fermé, aux conditions du §10

```ts
mnemonique?: { moyen: string; sert_a: string };   // 0–1
```

Les **trois garde-fous du §10 s'appliquent tels quels** et ne se rediscutent pas : champ optionnel à
défaut `None` · consigne de prompt explicite · **au moins un exemple few-shot où `mnemonique` est
nul**, parce que c'est le seul des trois qui agit sur le comportement du modèle plutôt que sur son
instruction. **Le vide doit rester le cas fréquent et normal.**

Et le principe qui rattache la section au reste : **le meilleur moyen mnémotechnique est celui que
Massimo invente.** Celui d'un autre est une chose de plus à mémoriser.

### §4 — 🔴 La détection de l'occasion est DÉTERMINISTE — c'est le critère qui borne ce chantier

> 🔴 **CORRIGÉ le 2026-08-14, APRÈS la livraison et APRÈS mesure.** Ce paragraphe décrivait
> **deux** signaux (« au moins 3 points-clés » **ou** une énumération). Le code n'en garde **qu'un**,
> et c'est le code qui a raison — voici pourquoi, avec les chiffres.
>
> | Règle | Leçons offrant l'étape ⑥ (sur 27 fiches ZETIS validées) |
> |---|---|
> | ≥ 3 points-clés **ou** énumération *(version d'origine)* | **27 / 27 — 100 %** |
> | énumération, en coupant sur « , » **et** sur « et » | **7 / 27** |
> | **énumération, virgules seules** ← **retenu** | **4 / 27** |
>
> **1 — le signal « ≥ 3 points-clés » est RETIRÉ.** Le prompt de génération demande jusqu'à cinq
> points-clés et le modèle les remplit : ce signal ne distinguait **rien**. L'étape ⑥ se serait
> affichée sur « Division de fractions » pour annoncer *« il y a une liste à retenir »* là où il
> n'y a qu'une méthode — l'acronyme forcé que le §10 refuse.
>
> **2 — on ne coupe PAS sur « et ».** C'est une conjonction française ordinaire, pas une
> énumération : l'ajouter attrapait *« Résumer **et** reformuler un texte »* et *« Lire **et**
> comprendre un texte poétique »*.
>
> ⚠️ **Le signal d'alarme de cet ADR a donc sonné le jour même de la livraison**, et c'est une
> bonne nouvelle : il était écrit **avant**, il a été mesuré, il a mordu. *Une heuristique jugée
> sur des exemples inventés ne prouve rien* — et la première mesure de contrôle a elle-même dû
> être refaite, parce qu'une requête SQL **approximait** la règle au lieu de l'exécuter.
>
> **Les 4 leçons retenues** : la proposition subordonnée relative (*qui, que, dont, où*) · la
> phrase complexe — où **ZETIS avait déjà écrit « MOULIN »** dans un point-clé, faute d'endroit où
> le mettre · la géographie du Royaume-Uni · les éruptions volcaniques.
>
> **Le vide reste le cas fréquent et normal** : 23 leçons sur 27 n'offrent pas l'étape, et ce
> n'est pas un manque.


L'étape ⑥ n'apparaît **que si ZETIS a détecté une occasion** : une **liste ou un ordre arbitraire**
dans `points_cles`. Cette détection est une **heuristique déterministe**, lisible et testable.

> **Critère de bornage : si une pièce de ce chantier demande un appel LLM neuf dans l'atelier, elle
> sort du périmètre.**

Le motif n'est pas technique. La **règle 7 du §5** fonde l'atelier : *phrases candidates, termes,
amorce, détection de recopiage et retour de ZETIS sont intégralement déterministes ; ZETIS n'écrit
jamais dans la fiche à la place de Massimo.* Seule la **dictée** appelle un modèle, et elle ne fait
que rendre du texte. Introduire un LLM dans le chemin de l'atelier pour deviner une occasion
casserait la seule propriété qui rend cet écran prévisible — et rendrait l'apparition de l'étape
**non reproductible d'une session à l'autre**, ce que le §5 interdit déjà pour les candidates.

### §5 — Le corrigé de ZETIS est REPORTÉ — exclu par le critère du §4

Le §10 prévoit que ZETIS **montre le sien après** la tentative, comme un corrigé. Ce mnémonique-là
doit venir du `spec_json` de la fiche ZETIS, donc du **prompt de génération** — `FICHE_PROMPT_VERSION`
v1 → **v2**, que l'ADR-0054 avait déjà nommé hors périmètre.

**Décision : l'étape ⑥ se livre SANS le corrigé.** Massimo invente, ZETIS détecte l'occasion et lui
dit *« plus c'est bête, mieux ça marche »* — et n'a rien à révéler ensuite.

🔴 **Le critère du §4 mord donc immédiatement**, comme celui de l'ADR-0054 avait mordu le jour même.
C'est le signe qu'il borne pour de vrai. *Un critère qu'on desserre au premier obstacle n'a jamais
borné quoi que ce soit.*

**Ce qui reste vrai pour le jour où le corrigé se fera**, et qui n'a pas à être re-décidé : il
n'apparaît **qu'après** la tentative de Massimo (jamais avant, sinon il recopie), et il ne
commente **jamais** le sien — le §6 de l'addendum interdit à ZETIS de juger.

### §6 — Aucune migration, et c'est mesuré

`spec_json` est une colonne `JSON`. Le champ est optionnel. Les fiches existantes valident sans
modification (§11). **Zéro migration, zéro colonne.**

⚠️ En revanche `extra="forbid"` fait que le schéma **part au modèle** : ajouter le champ change ce
que le LLM voit, même si on ne le lui demande pas. C'est précisément pourquoi le few-shot nul du §3
est **obligatoire et non optionnel**.

### §7 — L'enrichissement des fiches déjà créées reste au dos

Le §11 l'a décidé — **à la demande, fiche par fiche, jamais en lot** — et en a donné le motif : une
passe en lot repasserait toutes les fiches en `pending` et **les retirerait toutes à Massimo en même
temps**, jusqu'à revalidation une par une. Un enfant qui ouvre l'app pendant cette fenêtre trouve
ses decks vides sans que rien n'ait échoué.

**Ce chantier ne construit pas cette surface.** Il n'en a pas besoin : les nouvelles fiches naîtront
avec le champ, les anciennes vivront sans, et aucune ne casse.

## Alternatives considérées

- **Livrer les deux étapes comme un seul lot indifférencié.** Écarté : ⑤ ne touche ni le schéma ni
  le prompt, ⑥ fait les deux. Les mélanger ferait porter à une correction d'inégalité déjà visible
  le risque d'une extension de vocabulaire.
- **Ne livrer que ⑤ et reporter ⑥ encore une fois.** Écarté : c'est ce qu'on fait depuis quatre
  slices, et le §10 est gelé depuis le 2026-08-12. Une décision qu'on ne construit jamais finit par
  devoir être reprise à zéro.
- **Détecter l'occasion par un appel LLM.** Écarté par le §4 — et c'est le cœur du cadrage.
- **Rendre `mnemonique` systématique.** Déjà écarté par le §10 : produirait des acronymes forcés
  plus durs à retenir que la chose elle-même, sur peut-être 4 leçons sur 5.
- **Afficher l'étape ⑥ grisée quand il n'y a pas d'occasion.** Écarté par le §10 : une étape visible
  mais morte est une promesse que le produit ne tient pas. Le compteur d'étapes doit donc compter
  **les étapes offertes**, pas six en dur — piège déjà payé une fois (`TROUBLESHOOTING`, 2026-08-14).
- **Passer le prompt en v2 dans la foulée.** Écarté par le §4/§5 : c'est un chantier de génération,
  avec ses propres relectures Papa, pas un supplément d'atelier.

## Périmètre

- l'**étape ⑤** dans l'atelier — champ libre, amorce, zéro candidate ;
- l'**étape ⑥** dans l'atelier — **conditionnelle**, champ libre, message *« plus c'est bête, mieux
  ça marche »* ;
- `mnemonique` ajouté au **`FicheSpec`** (TS + Pydantic) et à **`FicheSection`** ;
- la **détection déterministe de l'occasion** sur `points_cles`, testable seule ;
- le **rendu** de `mnemonique` dans `FicheCard` **et** `FicheA5` — sinon Massimo écrit dans le vide ;
- la **levée du 400** sur `section="mnemonique"`, et le test qui le verrouillait, **réécrit et non
  supprimé** : il doit désormais protéger une autre section non implémentée, ou disparaître avec son
  motif écrit ;
- le **compteur d'étapes**, qui doit suivre le nombre d'étapes **offertes**.

## Hors périmètre (nommé)

- 🔴 **Le corrigé de ZETIS** et le passage `FICHE_PROMPT_VERSION` v1 → **v2** — exclus par le critère
  du §4, cf. §5. À cadrer à part.
- 🔴 **Tout appel LLM neuf dans l'atelier** — critère du §4.
- **L'enrichissement des fiches déjà créées** (§11) et sa surface Papa.
- **`absent_du_cours`** — hors périmètre v1 depuis l'ADR-0015 : seul type à faux positifs.
- Le **pont SRS** depuis `mnemonique` (un mnémonique n'est pas une définition).
- La **surface Papa** de lecture des fiches de son fils.
- Les **défauts 2, 3 et 4** — ils appartiennent au chantier « la fiche répond quand on la touche ».

## Conséquences

### Positives

- **L'atelier tient enfin sa promesse de six étapes** — la colonne cesse d'annoncer un parcours
  qu'elle ne rend pas.
- **L'inégalité `mini_exemple` disparaît** : ce que ZETIS écrit, Massimo peut l'écrire.
- **Zéro migration, zéro route neuve, zéro LLM** — le chantier est du câblage et une extension de
  schéma, comme les quatre précédents.
- Le §10, gelé depuis le 2026-08-12, **cesse d'être une décision sans produit**.

### Négatives / risques

- ⚠️ **L'heuristique d'occasion est le seul endroit où ce chantier peut être bête.** Trop large,
  elle proposera des mnémoniques sur des concepts — exactement ce que le §10 voulait éviter. Trop
  étroite, l'étape n'existera que sur le papier. **Elle se mesure sur de vraies leçons avant d'être
  figée**, pas sur des exemples inventés.
- ⚠️ **Une étape conditionnelle complique le compteur.** « 3 sur 5 » ou « 3 sur 6 » selon la leçon :
  le nombre d'étapes offertes devient une donnée, pas une constante. Le motif du compteur qui
  **sous-compte** a déjà été payé une fois.
- ⚠️ **`extra="forbid"` fait voir le champ au modèle** dès qu'il entre au schéma, même sans le
  demander (§6).

## Le signal qui dirait qu'on s'est trompé

- **L'occasion est détectée sur presque toutes les leçons** → l'heuristique est trop large ; on
  produira les acronymes forcés que le §10 refusait, et il faudra la resserrer avant de continuer.
- **Elle n'est JAMAIS détectée** → l'étape n'existe que dans la spec. C'est le défaut qu'on vient de
  corriger avec les portes, rejoué une section plus loin.
- **Massimo remplit ⑤ sur presque toutes ses fiches** → l'exemple n'était pas « facultatif », c'était
  une étape manquante. Bonne nouvelle, mais elle dit qu'on l'a sous-estimée quatre slices durant.
- **Il invente un mnémonique puis ne le relit jamais** → la section est un jeu, pas un outil de
  mémoire ; à ne pas confondre avec un échec du dispositif.

## Suivi

1. **`docs/frontend-massimo/page-fiches.md` — presque rien à écrire, et c'est une correction.**

   🔴 **Ce point affirmait d'abord que l'étape ⑤ n'avait « aucune sous-section ».** C'était **faux**,
   et vérifié faux à l'étape 6 du cadrage même : le **`#### 4b. Étapes ② et ⑤ — les champs libres`**
   la décrit, avec ses **trois règles obligatoires** (amorce en tête, dictée avant le clavier, budget
   montré comme de la place). J'avais conclu d'une absence à partir d'un `grep` qui ne regardait que
   `4c` et `4d` — *le motif « une mention n'est pas un rendu », rejoué à l'envers.*

   **Ce qui renforce le §2** : l'étape ⑤ est un déblocage **encore plus pur** qu'annoncé — sa spec
   est déjà écrite, il ne manque que le code.

   Reste donc à corriger : le **tableau d'avancement**, qui dit encore « Étapes ⑤ et ⑥ ❌ toujours
   pas rendues ».
2. **Aucune maquette nécessaire** : le mockup HTML dessine déjà l'étape ⑥ conditionnelle
   (`mockup-fiche-de-massimo.html`), et ⑤ est un champ libre identique à `essentiel`.
3. 🔴 **Mesurer l'heuristique d'occasion sur les 17 leçons de Français avant de la figer** — combien
   d'occasions détectées, et lesquelles. Une heuristique jugée sur des exemples inventés ne prouve
   rien ; c'est le motif « contre-épreuve mal visée », déjà payé trois fois.
4. **Ne pas rouvrir** le §10 (forme, garde-fous, libellé), le §11 (enrichissement) ni la règle 7 du
   §5 : ce chantier les **exécute**.
