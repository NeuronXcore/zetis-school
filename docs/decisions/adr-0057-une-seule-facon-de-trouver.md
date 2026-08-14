# ADR-0057 — Une seule façon de trouver

## Statut

**Proposé (2026-08-14)** — cadré sur `main`, sans une ligne de code.

✅ **Trois arbitrages sur quatre ont été rendus le même jour** (§9) : l'`adr-0049` Décision 1 **est
amendée** (le chapitre s'ouvre sur `/revision`), le lot est **la slice Quiz seule**, et la portée de
la recherche suit **la règle des capsules**. 🔴 **Missions reste ouvert.**

> **Cet ADR ne parle que du CHEMIN** : comment Massimo trouve l'objet qu'il cherche. *Quelles*
> cartes une session de révision sert est l'objet de l'`adr-0056`, cadré le même jour. Les deux
> sont nés de la même demande ; ils ne se livrent pas ensemble.

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
