---
id: "0057"
titre: "Une seule façon de trouver"
type: surface
statut: propose
date: 2026-08-14
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0022"]
---
# ADR-0057 — Une seule façon de trouver

## Statut

**Proposé (2026-08-14)** — cadré sur `main`, sans une ligne de code.

✅ **Trois arbitrages sur quatre ont été rendus le même jour** (§9) : l'`adr-0049` Décision 1 **est
amendée** (le chapitre s'ouvre sur `/revision`), le lot est **la slice Quiz seule**, et la portée de
la recherche suit **la règle des capsules**. 🔴 **Missions reste ouvert.**

> **Cet ADR ne parle que du CHEMIN** : comment Massimo trouve l'objet qu'il cherche. *Quelles*
> cartes une session de révision sert est l'objet de l'`adr-0056`, cadré le même jour. Les deux
> sont nés de la même demande ; ils ne se livrent pas ensemble.

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-14 | ADR-0057 · Addendum — Missions : le tri se fait sur une NOTION, pas sur une leçon | Proposé | — |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

### La demande

*« Tri par matière, chapitre, et un champ de recherche par mot-clé, dans les pages : révision,
mindmap, capsules, fiches, quiz. À réfléchir pour missions, car ce n'est pas la même logique. »*

### 🔴 Le constat qui change la nature du chantier : le motif EXISTE DÉJÀ

Mesuré le 2026-08-14, sur le code : **trois modèles de navigation coexistent** dans l'interface de
Massimo.

| Modèle | Pages | Ce que la page charge | Chapitre ? | Recherche ? |
|---|---|---|---|---|
| **Grille de matières** — `SubjectDeckGrid` | Révision, Fiches, Mindmaps, **Missions**, ELI5 | un **résumé par matière** (compteurs) | ❌ | ❌ |
| **Étagères matière → chapitre + recherche** — `CapsulesIAPage` + `lib/groupCapsules.ts` | Capsules | la **liste complète** des objets | ✅ | ✅ |
| **Matière puis liste** | Quiz | matières, puis les quiz de la matière choisie | ❌ | ❌ |
| **Constellation → amas → étoile + recherche** — `@zetis/ui/galaxy` | **Galaxie** | le graphe entier de la matière ouverte | ✅ | ✅ |

**Ce qui est demandé est donc déjà écrit — une fois.** `groupBySubjectChapter<T>`
([`lib/groupCapsules.ts:35`](../../apps/frontend-massimo/src/lib/groupCapsules.ts)) est **déjà
générique** (paramétrée par `T extends GroupableCapsule`), groupe par matière puis par chapitre,
trie, compte, et **filtre sur un mot-clé** (`normalize(title).includes(q)`), avec l'état vide qui
va avec (*« Aucune capsule ne correspond à … »*).

> **Ce chantier généralise un motif éprouvé ; il n'en invente pas un.** C'est la meilleure nouvelle
> du cadrage, et c'est aussi ce qui le borne : le patron n'est pas à débattre, il est à étendre.

### Le coût réel, et il n'est pas où on l'attend

Le composant est presque gratuit ; **la donnée ne l'est pas**. Les capsules groupent et cherchent
côté client **parce que la page tient déjà tous les objets**. Les autres pages, non :

- **Fiches** et **Mindmaps** : la page d'atterrissage charge `FichesSummary` / `MindmapsSummary` —
  des **compteurs par matière**. Aucun objet, donc rien à grouper ni à chercher.
- **Révision** : `ReviewsSummary` ne connaît que des matières — l'`adr-0049` l'avait déjà écrit
  (*« une porte posée sur le deck matière n'a rien »*).
- **Quiz** : les objets arrivent **après** le choix de la matière. Le niveau chapitre y est
  atteignable plus tôt que sur les trois autres.

### Ce que les chiffres disent des chapitres vides

Un niveau chapitre naïf serait à moitié vide. Mesuré sur la base de dev, cartes servables :

| Matière | chapitres | dont **offrables** |
|---|---|---|
| Français | 10 | **4** |
| Mathématiques | 5 | **4** |
| SVT | 4 | **1** |
| Histoire-Géo | 2 | **0** |
| Anglais | 1 | **1** |

## Décision

### §1 — Un seul motif, une seule brique — et aucune variante locale

Le motif des capsules devient **le** motif : matière → chapitre, plus un champ de recherche qui
filtre l'ensemble. `groupBySubjectChapter` sort de `groupCapsules.ts` pour devenir une brique
partagée, et le rendu devient un composant unique.

🔴 **Interdit : qu'une page se fabrique sa variante.** Deux familles de navigation coexistent
depuis assez longtemps pour qu'on sache où ça mène — c'est le motif que l'`adr-0053` a payé sur le
paquet partagé.

⚠️ **`SubjectDeckGrid` ne disparaît pas** : il reste le premier niveau (le choix de la matière).
Le chapitre et la recherche s'ajoutent **dessous**, ils ne le remplacent pas.

### §2 — 🔴 LE CRITÈRE QUI BORNE : la recherche est CLIENTE, sur ce que la page a déjà

> **Aucun endpoint de recherche, aucun `ILIKE`, aucun index plein texte, aucun appel au RAG.**
> Le champ filtre les objets **déjà servis à la page**. Une page qui, pour chercher, exigerait une
> recherche côté serveur **sort du périmètre** et attend son propre chantier.

Ce critère mord immédiatement, et c'est voulu : il dit qu'une page doit d'abord **tenir ses
objets** avant de prétendre les chercher. La tentation nommée : ZETIS a déjà un moteur sémantique
(pgvector, `nomic-embed-text`) — **ce n'est pas ça**, et le brancher ici transformerait une
navigation en fonctionnalité de recherche, avec sa pertinence à régler et ses résultats à
expliquer.

### §3 — Ce que le mot-clé cherche : le TITRE, pas le contenu

Comme aujourd'hui sur les capsules : `normalize(titre)`, insensible aux accents et à la casse.
S'ajoutent, **là où la page les tient déjà**, le nom du **chapitre** et celui de la **notion**.

**Pas le contenu** d'une fiche, d'un quiz ou d'une carte : c'est le §2 qui l'interdit, et c'est
aussi ce qui garde la recherche prévisible pour un enfant — on retrouve ce dont on se souvient du
nom.

### §4 — Une page = une slice, et l'ordre n'est pas indifférent

| Ordre | Page | Pourquoi là |
|---|---|---|
| 0 | **Capsules** | déjà faite — elle sert de **référence** et d'**étalon de parité** ; la slice 1 ne doit rien lui faire perdre |
| 1 | **Quiz** | ses objets arrivent tôt ; la slice la moins chère en données |
| 2 | **Fiches** | la page tient une liste par matière à l'écran 2 — le chapitre y est le pas suivant |
| 3 | **Mindmaps** | même forme que Fiches |
| 4 | **Révision** | la plus chère : elle demande un agrégat par chapitre **et** amende l'`adr-0049` (§5) |

⚠️ **La parité se prouve, elle ne s'affirme pas** : la migration des capsules vers la brique
partagée doit rendre **exactement** le même écran — c'est la leçon de la migration de Révision
vers `SubjectDeckGrid` (chantier ELI5 v2).

### §5 — 🔴 La page Révision AMENDE l'`adr-0049` Décision 1 — et cet ADR le dit au lieu de le faire

Un niveau chapitre sur `/revision` **est exactement l'option (b)** de l'`adr-0049`, écartée par le
commanditaire le 2026-08-10 : *« Nulle part ailleurs. En particulier : pas de drill-in depuis le
deck matière sur `/revision` (option (b), écartée). »*

**On ne la rouvre pas par préférence, mais parce que deux faits ont changé :**

1. **La portée n'avait pas été jugée.** (b) avait été pesée sur son coût et sur le risque de
   *blocked practice* ; personne ne savait alors qu'une carte écrite par Massimo se rangerait au
   **rang 153 sur 159** (`adr-0056`).
2. **Le coût a baissé.** L'`adr-0049` mettait à la charge de (b) *« un endpoint neuf chapitres
   servables »* ; `chapter_servable_counts` **existe** depuis le chantier agenda
   ([`memory/service.py:359`](../../apps/backend/app/modules/memory/service.py)).

⚠️ **Ce qui ne change pas** : la porte (a) depuis l'agenda reste, et toute la mécanique serveur de
l'`adr-0049` (Décisions 3 à 6) était écrite pour être vraie dans les trois options.

⚠️ **Et l'objection *blocked practice* reste vraie** — *« une porte permanente peut devenir le
chemin par défaut, au détriment du mélange »*. Elle est bornée, pas dissoute : les **mélanges
restent le rituel**, en haut et plus grands comme aujourd'hui ; la matière ensuite ; le chapitre au
**troisième rang**, jamais atteint sans passer par sa matière.

### §6 — Aucune porte sur du vide

Un chapitre sans objet **n'apparaît pas** : ni grisé, ni explicatif, ni « bientôt ». La règle n'est
pas réécrite ici, elle est **citée** — `adr-0049` Décision 2, fondée sur `adr-0025` addendum §14.6 (*« un
bouton mort se lit comme une panne »*).

**Le serveur décide de la servabilité, jamais le client** ; le front n'a pas le droit de recompter.

⚠️ La distinction avec l'`adr-0024` §4 (catalogue grisé) tient : ces pages sont des **lanceurs**,
pas des catalogues.

### §7 — Un compteur doit dire ce qu'il compte

🔴 **Piège mesuré dans ce cadrage** : `chapter_servable_count` rend
`min(REVIEW_SESSION_MAX_CHAPTER, total)` — une **taille de session**, pas un stock. La première
mesure a affiché **« 8 »** pour les quatre chapitres offrables du Français, qui en portent **72,
39, 45 et 12**. Tout chiffre affiché à côté d'un chapitre doit être **nommé** pour ce qu'il est, ou
ne pas être affiché.

### §8 — 🔴 `/galaxy` n'est pas une page à convertir : c'est le témoin le plus avancé, et elle DICTE les règles

Question posée pendant le cadrage : *« et dans galaxy ? on applique la même logique de tri pour les
recherches ? »* La mesure répond **dans l'autre sens** — ce n'est pas la galaxie qui doit adopter
le motif des cinq pages, ce sont les cinq pages qui doivent adopter ce qu'elle a déjà écrit.

**Ce qu'elle porte déjà, mesuré :**

- `GalaxyNode.kind` vaut `"root" | "subject" | "chapter" | "skill"`
  ([`packages/types/src/galaxy.ts:72`](../../packages/types/src/galaxy.ts)) et chaque étoile porte
  `chapter_id` : **c'est la seule surface de Massimo qui tient déjà les trois niveaux** — matière
  (constellation), chapitre (amas), notion (étoile).
- Sa recherche est **déjà cliente** — *« aucune requête, la réponse suit la frappe »* — et **déjà
  dans le paquet partagé** : `searchMatches`
  ([`packages/ui/src/components/galaxy/galaxyGraph.ts:100`](../../packages/ui/src/components/galaxy/galaxyGraph.ts)),
  qui filtre sur `normalizeSearch(node.label)` — **le libellé, jamais le contenu** — et **seulement
  les étoiles** (`kind === "skill"`). Le §2 et le §3 de cet ADR ne font que la rejoindre.

**Les quatre règles qu'elle a écrites, et qui deviennent celles du composant partagé :**

1. **La recherche est bornée à la portée ouverte** — *« jamais sur la galaxie entière : chercher
   parmi toutes les matières renverrait des étoiles qu'on ne peut pas atteindre d'ici »*.
2. **Recherche et filtre ne cohabitent pas** — l'un remplace l'autre, *« deux mises en évidence
   simultanées seraient illisibles »*.
3. **Un filtre ne survit pas au changement de portée** — il porterait sur des objets absents.
4. **Un seul résultat → il s'ouvre tout seul** — Massimo a déjà dit ce qu'il cherchait.

🔴 **Et elle révèle une duplication** : deux normaliseurs de recherche coexistent — `normalizeSearch`
dans `packages/ui` et `normalize` dans `lib/groupCapsules.ts`. C'est exactement l'angle mort que
l'`adr-0053` a nommé. **Le chantier unifie sur celui du paquet partagé**, il n'en crée pas un
troisième.

**Décision** : la galaxie **n'entre pas dans le lot des pages à convertir** (§4) — elle a le motif.
Elle entre dans le périmètre **comme source** : ses quatre règles et son normaliseur deviennent
ceux de la brique partagée.

⚠️ **Ce qu'on ne fait PAS sur la galaxie** : lui ajouter un sélecteur « matière / chapitre » en
liste. **La constellation EST le tri par matière, l'amas EST le chapitre.** Un sélecteur en doublon
ferait deux vérités sur le même écran, et un ciel ne se trie pas en accordéon.

## §9 — 🔒 Les arbitrages — TROIS RENDUS le 2026-08-14, un encore ouvert

Ils ne se rediscutent pas ; ils se relisent.

### ✅ (1) L'`adr-0049` Décision 1 EST AMENDÉE — le chapitre s'ouvre sur `/revision`

Décision du commanditaire, 2026-08-14, sur les deux faits neufs du §5 : la portée n'avait jamais
été jugée (rang 153 sur 159), et le coût a baissé (`chapter_servable_counts` existe).

**L'`adr-0049` Décision 1 se lit désormais ainsi** : la porte de l'agenda reste, **et** le deck
matière se déplie en chapitres sur `/revision`. Le reste de l'`adr-0049` est intact — sa mécanique
serveur avait été écrite pour être vraie dans les trois options.

⚠️ **Le contre-poids reste dû** : l'objection *blocked practice* n'est pas levée par l'amendement,
elle est **bornée par le §5** (les mélanges en haut, le chapitre au troisième rang). Une porte
permanente qui deviendrait le chemin par défaut est le **signal n° 2** de cet ADR.

### ✅ (2) Le lot est **la slice Quiz SEULE**

Décision du commanditaire, 2026-08-14, conforme à la recommandation. **Une page, une brique
éprouvée, puis on propage** — une brique partagée mal née se paie cinq fois.

🔴 **Conséquence directe, à ne pas perdre** : la Révision **n'est PAS dans ce lot**, alors même que
c'est elle qui a ouvert le chantier. L'amendement (1) est **acquis mais pas encore consommé** : il
sera dépensé par la slice 4. Et le défaut qui a tout déclenché est réparé ailleurs, par
l'`adr-0056`, qui ne dépend pas de cette slice.

### ✅ (3) La PORTÉE de la recherche : **la règle des capsules**

Décision du commanditaire, 2026-08-14. La recherche porte sur **toute la page, toutes matières
confondues** — chercher sans savoir la matière est précisément ce qu'un enfant fait.

⚠️ **Bornée par ce que la galaxie protégeait** (§8, règle 1 — *« des étoiles qu'on ne peut pas
atteindre d'ici »*) : **un résultat hors de la portée courante doit EMMENER Massimo là où il est,
jamais s'afficher sans y mener.** Un résultat qu'on voit et qu'on ne peut pas atteindre est le
défaut que cette règle existe pour empêcher.

⚠️ **La galaxie garde la sienne** : elle cherche dans la constellation ouverte, et ce n'est pas une
divergence oubliée — c'est un graphe, où « emmener » veut dire changer de ciel.

### 🔴 (4) Missions — TOUJOURS OUVERT

Le commanditaire a dit *« à réfléchir, ce n'est pas la même logique »*, et la mesure lui donne
raison : `MissionsPage` consomme pourtant `SubjectDeckGrid`, mais les **missions croisées sont
multi-matières** (`adr-0017` §5, *« esprit EPI du cycle 4 »*) — un tri par matière les ampute au
lieu de les ranger. **Non arbitré, hors périmètre tant qu'il ne l'est pas.**

## Alternatives considérées

- **Une recherche serveur (SQL ou sémantique)** — écartée par le §2 : elle change la nature du
  chantier, demande de la pertinence à régler, et ZETIS n'a aucune page qui en ait besoin *pour
  naviguer*.
- **Une recherche globale unique** (un champ dans la sidebar, tous objets confondus) — écartée :
  élégante et beaucoup plus chère (un modèle d'objet commun à cinq domaines), et elle contredit la
  demande, qui dit *« dans les pages »*. À reconsidérer si les cinq champs finissent par se
  ressembler au point d'être un seul.
- **Garder les deux familles** (grille ici, étagères là) — écartée : c'est l'état actuel, et il
  produit exactement la question qui a ouvert ce chantier — *où est-ce que je retrouve ça ?*
- **Ne traiter que la Révision** — écartée : le défaut de la Révision est un défaut d'**ordre**
  (`adr-0056`), pas de navigation. Traiter la navigation d'une seule page laisserait le motif
  dupliqué et le défaut entier.
- **Remplacer `SubjectDeckGrid`** — écartée : le premier niveau fonctionne et est éprouvé sur cinq
  pages ; on ajoute dessous.

## Périmètre

- Une brique de groupement partagée (extraction de `groupBySubjectChapter`) et un composant de
  rendu unique, avec son champ de recherche et son état vide.
- Son adoption page par page, dans l'ordre du §4, **une slice par page**.
- La donnée manquante par page, servie **par un agrégat existant quand il existe**.
- Les tests : parité des capsules, « aucun chapitre vide offert », « la recherche ne rend rien →
  état vide nommé ».

## Hors périmètre (nommé)

- **Missions** — §9 (4).
- **L'ordre des cartes d'une session** — `adr-0056`.
- **La recherche dans le contenu**, la recherche serveur, le RAG.
- **Une recherche globale** dans la sidebar.
- **Le rendu de `/galaxy`** : elle donne ses règles (§8), elle ne reçoit ni sélecteur ni liste.
- **ELI5**, `/matieres`, `/agenda`, le Chat : non nommés par la demande.
- **Toute surface Papa.**
- **La mémorisation du dernier filtre** (« reprendre où j'en étais ») et toute notification.
- **L'agenda et sa porte « Réviser ce chapitre »** — `adr-0049` Décision 1 (a) inchangée.

## Conséquences

### Positives

- Un seul geste pour trouver, identique sur cinq pages — au lieu de trois modèles.
- Le motif est **déjà éprouvé à l'écran** (capsules) : le risque de conception est faible.
- Le chapitre devient une entrée réelle, ce que la mesure de l'`adr-0056` réclame côté révision.

### Négatives / risques

- 🔴 **Une porte permanente vers le chapitre peut devenir le chemin par défaut** (*blocked
  practice*, `adr-0049`) — bornée par le §5, pas supprimée.
- ⚠️ **Une brique partagée mal née se paie cinq fois** — d'où le lot minimal du §9 (2).
- ⚠️ **Un champ de recherche sur une page qui ne tient pas ses objets ne peut pas exister** : la
  slice qui l'ajoute doit d'abord servir les objets, sinon elle sort du périmètre (§2).
- ⚠️ **Cinq champs de recherche** peuvent finir par appeler une recherche unique — noté, pas fait.

## Le signal qui dirait qu'on s'est trompé

1. 🔴 **Une page se met à charger toute sa base pour pouvoir chercher** — le §2 a été respecté à la
   lettre et trahi dans l'esprit.
2. 🔴 **Les sessions par chapitre deviennent majoritaires** et le mélange n'est plus lancé :
   l'objection *blocked practice* avait raison.
3. ⚠️ **Une page réintroduit sa variante locale** du groupement — la brique n'était pas la bonne
   forme, et il faut revenir ici plutôt que la contourner.
4. ⚠️ **Un chapitre affiche « 8 » alors qu'il en porte 72** — le piège du §7 s'est refermé.
5. ⚠️ **Massimo ouvre une page et ne lance plus rien** : une liste de chapitres plus longue que la
   liste des matières a remplacé un choix par un inventaire.

## Suivi

- **Mesures de référence, 2026-08-14** : **4** modèles de navigation · `groupBySubjectChapter` déjà
  générique · `GalaxyNode.kind` porte déjà `chapter` · **deux normaliseurs de recherche** coexistent
  (`packages/ui` et `lib/groupCapsules.ts`) · chapitres offrables — Français 4/10, Maths 4/5,
  SVT 1/4, HG 0/2, Anglais 1/1 · `chapter_servable_count` plafonné à 8.
- **Consomme** : `adr-0049` (deck chapitre, porte agenda, servabilité, bouton mort) · `adr-0025`
  addendum §14.6 · `adr-0024` §4 · `adr-0017` §5 (missions croisées multi-matières) ·
  `adr-0053` (le paquet partagé).
- **Ouvre** : ✅ **la slice Quiz seule** est prête à `/ouverture` (§9). Les slices Fiches, Mindmaps
  et Révision attendent qu'elle ait éprouvé la brique ; **Missions attend son arbitrage**.

---

## Amendement 1 — ADR-0057 · Addendum — Missions : le tri se fait sur une NOTION, pas sur une leçon — 2026-08-14

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Proposé**.

### Statut

**Proposé (2026-08-14)** — cadré sur `main`, sans une ligne de code.

Cet addendum **rend l'arbitrage (4)** que l'`adr-0057` §9 avait laissé ouvert : *« Missions —
TOUJOURS OUVERT. Non arbitré, hors périmètre tant qu'il ne l'est pas. »* C'est le dernier morceau
du chantier « une seule façon de trouver », dont les quatre autres pages sont livrées.

> **Il ne rouvre rien de l'`adr-0057`** : le motif, le critère de recherche cliente (§2), ce que
> cherche le mot-clé (§3), la règle « aucune porte sur du vide » (§6) et les quatre règles de la
> galaxie (§8) s'appliquent tels quels. Cet addendum ne traite **que** ce que Missions a de
> particulier.

### Contexte

#### La raison écrite du report, et ce que la mesure en fait

L'`adr-0057` §9(4) reportait Missions sur un motif précis : *« les missions croisées sont
multi-matières (`adr-0017` §5, esprit EPI du cycle 4) — un tri par matière les ampute au lieu de
les ranger »*.

> ⚠️ **Le renvoi de l'`adr-0057` est FAUX, et il faut le dire ici pour qu'il cesse de circuler** :
> la phrase *« esprit EPI du cycle 4 »* est au **§6 de l'`adr-0017`** (« Hors périmètre
> (explicitement) »), ligne 303 — pas au §5, qui traite des générateurs et du moteur d'étapes. Le
> §5 est bien cité **ailleurs** dans cet addendum, pour le verdict et la preuve : ces
> renvois-là sont justes.

🔴 **Mesuré le 2026-08-14 sur la base de dev : cette objection vaut pour UNE mission sur 58 — et
le code la traite déjà.**

[`useMissions.ts:211`](../../apps/frontend-massimo/src/hooks/useMissions.ts) extrait les missions
`champion` **avant** le regroupement par matière, avec ce commentaire :

> *« Les champions croisées (ADR-0022) sont HORS matière (subject vide) → leur propre deck 🏆,
> jamais dans un groupe matière (ni dans le décompte "à jour"). »*

La seule mission que le tri par matière amputerait n'est donc **pas triée par matière**, ni
aujourd'hui ni demain. Le report reposait sur un problème résolu ailleurs, dans un fichier que le
cadrage de l'`adr-0057` n'avait pas ouvert.

#### 🔴 La vraie différence, que personne n'avait nommée

Elle existe, et elle est structurelle — simplement, ce n'est pas la matière :

| | Objet rangé | Son chapitre |
|---|---|---|
| Quiz · Fiches · Mindmaps | une **leçon** | `Lesson.chapter_id` — **exactement un**, porté par la ligne |
| **Missions** | une **notion** (`Skill`) | 🔴 **aucun** — `Skill` n'a pas de `chapter_id` |

Le chapitre d'une notion se **dérive** par ses leçons validées (`Chapter ← Lesson ← LessonSkill`),
et cette dérivation peut rendre **zéro** chapitre, **un**, ou **plusieurs**. Une notion comme
« Priorités opératoires » est enseignée en **Fractions** *et* en **Nombres relatifs** : elle ne
« vit » pas dans un chapitre, elle traverse le programme.

*« Ce n'est pas la même logique »* était juste. La raison n'était pas celle qu'on avait écrite.

#### Les mesures

Sur `GET /api/missions` et la base de dev, le 2026-08-14 — **58 missions actionnables**
(`validation_status = validated`, statut `planned|active` ; c'est le filtre que la page applique
déjà, `useMissions.ts:208`).

| Sous combien de chapitres une mission se range-t-elle ? | | |
|---|---|---|
| **1 chapitre** | **52** | **90 %** |
| 0 chapitre | 4 | 7 % |
| 2 chapitres | 1 | 2 % |
| 3 chapitres | 1 | 2 % |

| Autres mesures | |
|---|---|
| Missions réellement **multi-matières** | **1 / 58** (le `champion`, `subject_id = NULL`) |
| Répartition par matière | Maths **25** · Français **22** · SVT **14** · Anglais **4** |
| Missions portant une notion | 65 / 66 servies |
| Missions dont les **étapes** couvrent plusieurs notions | **1** (le champion, 12 étapes / 3 notions) |

> ⚠️ **Cette mesure a dû être refaite, et l'erreur mérite d'être écrite.** La première passe
> utilisait `lessons_by_skill`, qui filtre `Lesson.status != 'archived'` — **les brouillons
> passent**. Elle annonçait 3 missions à 2 chapitres et 1 à 4 ; avec le gate d'une surface élève
> (`Lesson.status == 'validated'`, celui d'`ordered_chapter_skill_ids`), il en reste **1 et 1**.
> C'est exactement le piège du §4 de `/cadrage` : *une fonction voisine approximait la règle.*

**Ce que ces chiffres disent** : le niveau chapitre est **praticable** (90 % sans ambiguïté), et le
besoin est réel — ouvrir « Mathématiques » donne aujourd'hui **25 missions à la file**, sans
repère, ce qui est le défaut exact que les quatre slices précédentes ont réparé ailleurs.

### Décision

#### §1 — Missions entre dans le motif, à l'écran 2, comme les trois autres

L'écran 1 (disques par matière, disque « Mission du jour », deck 🏆) **ne change pas** — c'est le
premier niveau que l'`adr-0057` §1 protège explicitement. Le chapitre et la recherche s'ajoutent
**dans une matière ouverte**, avec la brique partagée `SubjectChapterShelves`.

#### §2 — Le chapitre se dérive de la NOTION, par ses leçons validées, et jamais autrement

`Skill → LessonSkill → Lesson(status = 'validated') → Chapter`. C'est la chaîne que le dépôt
utilise déjà partout ; elle n'est pas réécrite ici.

🔴 **La dérivation est une LECTURE, jamais une écriture** — voir le critère du §4.

#### §3 — Une seule → ce chapitre. Zéro ou plusieurs → « Sans chapitre »

Le groupe « Sans chapitre » **existe déjà** dans la brique (`NO_CHAPTER_LABEL`), il est déjà rendu
en dernier, et il est déjà à l'écran sur les Capsules. Il accueille les **6 missions sur 58**
(10 %) qui ne se rangent pas proprement.

🔴 **On ne choisit JAMAIS un chapitre parmi plusieurs.** Ranger « Priorités opératoires » sous
« Fractions » parce qu'il vient en premier dans le programme serait afficher une information
**fausse** sous une apparence de certitude — et rien à l'écran ne dirait qu'un choix a été fait.
Un objet qui ne sait pas où il habite doit le dire, pas être logé d'office.

#### §4 — 🔴 LE CRITÈRE QUI BORNE : aucune colonne, aucune migration

> **Le chapitre d'une mission ne se persiste pas.** Il se calcule à la lecture, à chaque fois.
> Si la mise en œuvre demande d'ajouter `chapter_id` sur `missions` — ou n'importe quelle colonne,
> n'importe quelle table —, **la slice sort du périmètre** et revient ici.

Ce critère mord dès le premier jour, et c'est voulu : la tentation est immédiate (« un `chapter_id`
dénormalisé, ce serait plus simple à trier »). Le dépôt sait déjà où ça mène —
`DATA_MODEL.md` §« le chapitre d'un quiz se lit sur sa LEÇON, pas sur `Quiz.chapter_id` » est la
trace d'une dénormalisation qui a menti. Et une notion **change** de chapitres quand Papa valide
une leçon : une colonne serait fausse le lendemain, sans que rien ne le signale.

#### §5 — Le champion garde son deck 🏆, et n'entre dans aucune matière

Déjà vrai (`useMissions.ts:211`), et cet addendum le **cite** au lieu de le réécrire. La seule
mission multi-matières du dépôt reste hors du tri — elle n'est donc jamais amputée.

⚠️ **Signalé sans être traité** : cette mission est servie avec `subject: ""` et
`skill_name: "Notion"` — deux **valeurs de repli** qui passent pour des valeurs vraies. Invisible
aujourd'hui parce que le deck 🏆 n'affiche ni l'une ni l'autre. À corriger le jour où une surface
les lit.

#### §6 — Ce que le mot-clé cherche ici : le titre ET le nom de la notion

L'`adr-0057` §3 le prévoit déjà (*« s'ajoutent, là où la page les tient déjà, le nom du chapitre et
celui de la notion »*), et la page **tient déjà** `skill_name`. C'est utile ici plus qu'ailleurs :
les titres sont préfixés d'un verbe de type (« Travailler : … », « Renforcer : … », « Progresser :
… »), si bien que chercher sur le seul titre ferait remonter tout un type sur le mot « renforcer ».

### Alternatives considérées

- **Ne pas mettre de niveau chapitre du tout, seulement la recherche** — écartée : 90 % des
  missions se rangent sans ambiguïté, et 25 missions de Maths à la file sont exactement le défaut
  qu'on répare ailleurs. Ce serait renoncer sur la foi des 10 %.
- **Ranger une mission multi-chapitres sous son premier chapitre** (ordre du programme) — écartée
  par le §3 : lisible, et faux.
- **La dupliquer sous chacun de ses chapitres** — écartée : une mission qu'on croit avoir faite et
  qui réapparaît ailleurs est une promesse cassée ; et le compte de l'étagère mentirait.
- **Persister un `chapter_id` sur `missions`** — écartée par le §4 : périmé dès la validation de
  la leçon suivante.
- **Trier par TYPE plutôt que par chapitre** (Renforcer / Réviser / Découvrir / Sur mesure) —
  écartée **comme premier niveau** : le type dit d'où vient la mission, pas de quoi elle parle, et
  Massimo cherche une notion. ⚠️ **À reconsidérer comme filtre secondaire** si « Sans chapitre »
  devait grossir.
- **Un ADR neuf plutôt qu'un addendum** — écartée : l'`adr-0057` a nommé cet arbitrage et l'a laissé
  ouvert. Le rendre ailleurs qu'ici obligerait à recopier son motif, son critère et ses règles —
  et *deux formulations d'une même règle finissent par diverger*.

### Périmètre

- L'**écran 2** de `/missions` (une matière ouverte) : étagères matière → chapitre + champ de
  recherche, par la brique partagée.
- La **dérivation du chapitre** d'une mission, en lecture, côté serveur.
- Les tests : « 90 % sous un chapitre », « zéro ou plusieurs → Sans chapitre », « la recherche
  traverse », « le champion reste hors matière ».

### Hors périmètre (nommé)

- **L'écran 1** : disques par matière, « Mission du jour », deck 🏆, matières « à jour ».
- **L'élection quotidienne**, le scoring, `MISSION_SCORING_VERSION` — `adr-0017` §3/§4.
- **Les modales** d'étape (ELI5, quiz, mindmap) et la timeline des étapes.
- **Le verdict d'acquisition** et la mécanique de preuve — `adr-0017` §5.
- **Les missions `completed`** : la page ne les liste pas dans les matières, et ça ne change pas.
- **Toute surface Papa**, y compris la page de pilotage des missions.
- **La génération** de missions, la validation Papa, le Conseil de classe.
- **Le repli `subject: ""` / `skill_name: "Notion"`** du champion — §5, signalé, non traité.
- **Toute migration**, toute colonne — §4.

### Conséquences

#### Positives

- Le motif « une seule façon de trouver » devient **complet sur les cinq pages nommées par la
  demande**, plus la galaxie qui l'avait déjà.
- La plus grosse liste de l'interface (25 missions) cesse d'être une file sans repère.
- La dérivation en lecture reste **juste dans le temps** : le jour où Papa valide une leçon, le
  rangement suit, sans travail de fond ni colonne à rafraîchir.

#### Négatives / risques

- ⚠️ **Une dérivation coûte des requêtes** là où une colonne en coûterait zéro. Sur 58 missions et
  32 notions distinctes, c'est négligeable ; sur dix fois plus, il faudra mesurer avant d'y
  toucher — et mesurer, pas supposer.
- ⚠️ **« Sans chapitre » accueille deux populations différentes** (aucune leçon validée / plusieurs
  chapitres) sous un seul libellé. C'est assumé à 10 %, ça ne le serait plus à 40 %.
- ⚠️ Une notion qui change de chapitres fait **bouger le rangement** d'une mission entre deux
  visites, sans que rien ne l'annonce. C'est le prix de la justesse.

### Le signal qui dirait qu'on s'est trompé

1. 🔴 **« Sans chapitre » devient le plus gros groupe d'une matière** — la dérivation ne décrit pas
   la réalité du programme, et le niveau chapitre trompe plus qu'il n'aide.
2. 🔴 **Une migration apparaît dans la slice** — le critère du §4 a cédé au premier obstacle, ce
   qui veut dire qu'il n'avait jamais borné quoi que ce soit.
3. ⚠️ **Une mission est rangée sous un chapitre où elle n'est pas** — quelqu'un a choisi parmi
   plusieurs, contre le §3.
4. ⚠️ **Massimo ouvre une matière et n'en lance plus aucune** — une liste de chapitres a remplacé
   un choix par un inventaire (le signal n° 5 de l'`adr-0057`, qui vaut ici aussi).
5. ⚠️ **Le champion se retrouve dans une étagère de matière** — le §5 a été perdu en route.

### Suivi

- **Mesures de référence, 2026-08-14** : 58 missions actionnables · **52 sous un chapitre (90 %)**,
  4 sous aucun, 1 sous deux, 1 sous trois · **1 seule multi-matières** · Maths 25 · Français 22 ·
  SVT 14 · Anglais 4 · 32 notions distinctes citées.
- **Consomme** : `adr-0057` (le motif entier, son §2, §3, §6, §8 et son §9(4) qu'il rend) ·
  `adr-0017` §3 (regroupement par matière), §5 (missions croisées, `subject_id` nullable) ·
  `adr-0022` (missions champion, verdict par notion) · `adr-0011` (gate `validated` dans la
  requête) · `DATA_MODEL.md` (le chapitre se lit sur la leçon, jamais dénormalisé).
- **Ouvre** : la slice **Missions**, dernière du chantier. Après elle, l'`adr-0057` n'a plus
  d'arbitrage en suspens.
