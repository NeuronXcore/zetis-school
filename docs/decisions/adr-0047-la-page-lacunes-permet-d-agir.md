# ADR-0047 — La page Lacunes permet d'agir

## Statut

**Accepté — 2026-08-09.** Les **huit décisions sont gelées**, y compris la **Décision 8**, qui sort
du périmètre annoncé du chantier et a été soumise comme telle au commanditaire. Le prérequis de
décision est levé : les sessions de
`prompts/claude-code/prompts-claude-code-adr-0047.md` peuvent démarrer, après `/ouverture`.

> Historique : Proposé — 2026-08-09, **le même jour**. Cadré par la **maquette**
> (`docs/frontend-papa/mockup/mockup-papa-lacunes-v1.html`, **vue en desktop ET à 375 px**) puis la
> **spec** (`docs/frontend-papa/page-lacunes.md`, passages `[0047]`) avant cet ADR, selon le rituel
> `mockup → spec → ADR → prompt`, et **sans une ligne de code**. Ce qui autorise l'acceptation sans
> délai : le read-before-code a été rendu **avant** toute décision, et les deux constats qui
> falsifiaient le cadrage d'origine ont été portés au commanditaire **avant** que la moindre
> décision soit écrite.

⚠️ **Accepté ≠ livré.** Rien n'est implémenté, le chantier n'a pas démarré.

> 🔴 **Et cette ligne doit MOURIR au merge, pas y survivre.** Le 2026-08-09, la même phrase est
> restée sur l'`adr-0044` pendant vingt-quatre heures après sa livraison, recopiée dans
> `DECISIONS.md`, `BACKLOG.md` et `MEMORY.md` — assez pour envoyer une session de reprise
> **re-cadrer un chantier fait**. L'étape 4bis passe quatre contrôles ; **aucun ne demande de
> retirer l'annonce « à faire »**. C'est le cinquième : *chercher le nom du chantier là où il était
> promis, et l'y éteindre.*

> ⚠️ **Trois décisions ont été prises par le commanditaire pendant le cadrage**, chacune après que
> l'alternative lui a été exposée avec son coût : le **grain** (Décision 1), le **périmètre**
> (Décision 2) et la **résolution de la leçon** (Décision 4). Elles ne se rediscutent pas ici — on
> les **relit**.

## Contexte

Trouvé le 2026-08-08 par le commanditaire en vérifiant la slice C de l'`adr-0045` : la page dédiée
aux lacunes **en dit moins qu'une section d'une autre page**. La station ② du Diagnostic rend, par
lacune, un motif en clair et un geste qui dépend de l'état ; `/lacunes` rend un `<li>` nu.

Et le cul-de-sac se referme sur lui-même : le geste « Voir la lacune → » de la station ② pointe sur
`/lacunes`. Papa quitte un écran qui lui donnait le motif **et** l'action pour atterrir sur une ligne
inerte.

C'est le motif que l'`adr-0045` a traité deux fois — *une surface qui énonce sans permettre d'agir* —
laissé intact sur la page qui en porte le nom.

## Constat read-before-code

> Le `BACKLOG.md` portait ce chantier depuis le 2026-08-08. **Quatre de ses affirmations sont
> fausses ou incomplètes**, et deux d'entre elles changeaient la conception. Vérifié le 2026-08-09.

### 1. 🔴 Le modèle que le `BACKLOG` propose d'imiter SUR-PROMET déjà

Le `BACKLOG` présente la station ② comme faisant mieux, et cite ses libellés : « Produire le quiz de
**cette notion** → », « Valider le cours de **cette leçon** → ».

Le code (`PanneauPassation.tsx:266-277`) envoie sur `/quiz?subject=<id>` et
`/programme?subject=<id>` : **la matière**. Jamais la notion, jamais la leçon.

**Le libellé promet un grain que le lien ne livre pas.** Copier la station ② reproduirait exactement
le défaut que ce chantier corrige — et c'est le défaut dont l'`adr-0039` est né (*des nombres qui
mentaient, invisibles parce que non cliquables*).

### 2. 🔴 Le cul-de-sac est PIRE que décrit — et la page entière en est un

Deux constats, le second découvert en base.

**(a)** « Voir la lacune → » pointe sur `/lacunes` **nu** : aucun `?subject=`, aucune ancre. Papa
quitte un diagnostic de Français et atterrit sur la liste complète, toutes matières, sans même le
filtre de ce qu'il venait de lire. La page sait pourtant lire `?subject=`, `?source=` et `?contenu=`.

**(b) 🔴 Relevé en base de dev le 2026-08-09 : les 10 lacunes ouvertes ont TOUTES
`has_active_mission`.** Donc `pending` est vide, les sections « Découvertes » et « Revenues » **ne
s'affichent pas** (`if (gaps.length === 0) return null`), et leurs deux boutons de génération non
plus. **La page ne montre aujourd'hui qu'une seule section : « Déjà prises en charge »**, la seule
sans aucune action.

Ce n'est donc pas une ligne morte parmi des sections vivantes : **c'est la page entière**. Ce fait
n'était écrit nulle part, et il **inverse la priorité** que le `BACKLOG` donnait.

⚠️ Ce 100 % vient sans doute des missions accumulées par les tests, pas d'une vérité produit. Il
n'en reste pas moins ce que Papa a sous les yeux, et une décision de conception se prend sur l'écran
réel.

### 3. ⚠️ « Les seuls éléments cliquables » est inexact — et l'écart est instructif

Le `BACKLOG` en annonce cinq. Il y a aussi « Voir les missions → » du bandeau de résultat et les deux
actions des états vides.

Sans gravité en soi, mais ça dit l'essentiel : **la page sait déjà renvoyer ailleurs, jamais depuis
une ligne.** Ce chantier n'invente pas un patron — il l'applique là où il manque.

### 4. ⚠️ « Ça coûterait un champ » sous-estime la contrainte, et surestime le coût

**La contrainte** : `fetchOpenGaps()` ne prend aucun paramètre **et ne doit pas en prendre**
(`useLacunes.ts:17`, `adr-0038` §4 — filtrer ne coûte rien). Les champs manquants doivent donc
arriver dans le **même payload**, calculés en lot, jamais par une requête par ligne.

**Le coût réel** : les deux champs coûtent **zéro requête**.

| Champ | D'où il vient |
|---|---|
| `lesson_id` | `etat_contenu` obtient les `Lesson` en lot (`lessons_by_skill`), classe, puis **les jette** (`content_state.py:62`) |
| `mission_id` | `skills_with_active_mission` réduit des `Mission` à un `set[int]` (`progress/service.py:73`) |

C'est le motif exact de `source` dans l'`adr-0045` : *« le champ était sur la ligne et n'était
simplement pas rendu »*. Deux fois le même motif dans le même service.

### 5. 🔴 Une notion porte jusqu'à QUATRE leçons — le `BACKLOG` la traitait en singleton

Relevé en base :

| Notion | Leçons | `content_state` |
|---|---|---|
| Priorités opératoires | #151 `draft`, #145 `draft`, #48 `validated`, #23 `validated` | `ok` |
| Règle des signes | #147 `draft`, #22 `validated`, #21 `validated` | `ok` |
| Comparaison de relatifs | #24 `draft` | `cours_brouillon` |

« La leçon ou le chapitre à ouvrir » n'a donc pas de réponse évidente, et le choix est **visible à
l'écran** : ouvrir une leçon déjà validée sous le libellé « Valider le cours » recréerait le défaut
que ce chantier corrige.

### 6. ⚠️ `content_state` est typé `string | null`, pas une union

Écrit nulle part. Rendre quatre gestes selon sa valeur ne donne **aucune exhaustivité au
compilateur** : un cinquième état ajouté côté backend tomberait en silence dans la branche par
défaut, sans qu'un test ni `tsc` ne bronche.

### 7. ✅ Ce que le `BACKLOG` dit juste

La ligne est bien un `<li>` nu (`LacunesPage.tsx:332-354`) — aucun `Link`, aucun `onClick`, pas même
un expander inerte. `content_state` est bien servi, avec `severity`, `has_active_mission` et
`source`. Et les trois sections sont bien **disjointes** : `pending = visible.filter(!has_active_mission)`
contre `gaps.filter(has_active_mission)` — aucun doublon possible.

## Alternatives considérées

### (a) Viser la matière et reformuler le libellé — écartée par le commanditaire

`/quiz?subject=` et `/programme?subject=` existent : « Ouvrir les quiz de Français → » serait
livrable sans toucher une seule destination. Honnête, presque gratuit.

**Écartée** parce qu'elle fait perdre un cran de précision sur une page dont le défaut est
justement de ne pas mener assez loin, et parce qu'elle fige la sur-promesse de la station ② en
convention. **Le commanditaire a choisi le grain de la notion, quitte à créer les destinations.**

### (b) Décider le grain au cas par cas selon `content_state` — écartée

Trois règles à tenir au lieu d'une, un ADR plus long, et une page dont on ne peut pas dire en une
phrase où ses gestes mènent.

### (c) Traiter « Déjà prises en charge » dans un chantier séparé — écartée par le commanditaire

C'est ce que le `BACKLOG` proposait. **Écartée sur le constat 2(b)** : cette section est aujourd'hui
la seule visible. La livrer en second reviendrait à livrer un chantier que l'état réel de la base ne
montre pas.

### (d) Rendre la ligne entière cliquable — écartée

Un `<li>` cliquable en entier ne dit pas **ce qu'il va faire**, et la ligne porte quatre gestes
différents selon l'état. Un lien nommé dit sa destination ; une zone cliquable la cache. C'est la
doctrine de l'`adr-0039` (*un nombre cliquable qui conduit à un autre nombre est pire que le nombre
invisible qu'il remplace*), transposée à une ligne.

### (e) Un dépliage plutôt qu'un lien — écartée

Le dépliage de Progression (`adr-0038`) sert à **montrer une population** sous un agrégat. Ici il n'y
a rien à déplier : une lacune est déjà l'unité. Un accordéon ajouterait un clic avant le geste.

### (f) Ajouter un compteur d'ancienneté (« ouverte depuis 12 jours ») — écartée

`first_detected_at` est déjà servi et affiché en date. Un **décompte** est interdit par
`CLAUDE.md` §gamification côté Massimo ; le porter côté Papa serait légitime, mais c'est une autre
décision et elle n'a pas été demandée. La date suffit à situer.

### (g) Typer `content_state` en union partagée dans `packages/types` — retenue partiellement

Voir Décision 6 : l'union est déclarée, mais la branche par défaut est **conservée et testée**.

## Décision

### 1. Le grain est la NOTION, jamais la matière

Un libellé qui dit « cette notion » mène à cette notion. **Décision du commanditaire**, prise après
que l'alternative (a) lui a été exposée avec son coût.

Conséquence assumée : deux destinations doivent apprendre à lire un paramètre qu'elles ne lisent pas
encore. Le patron existe déjà dans le dépôt — `CapsulesPilotagePage` lit `?skill=`,
`CartesRevisionPage` lit `?focus=<skillId>`.

### 2. La section « Déjà prises en charge » est dans le périmètre, et elle est PRIORITAIRE

**Décision du commanditaire**, sur le constat 2(b). Elle reçoit « Voir la mission → » dans la même
slice que les autres gestes, pas après.

### 3. Une ligne, UN geste, et son motif en clair

Le geste dépend de l'état ; le motif est écrit **sous la ligne**, comme le fait la station ②.
Papa n'a pas à deviner pourquoi ce geste-là.

| Condition | Geste | Ce qu'il fait |
|---|---|---|
| `has_active_mission` | **Voir la mission →** | lien vers `/missions?focus=<mission_id>` |
| `content_state == "cours_brouillon"` | **Valider le cours de cette leçon →** | lien vers `/programme?lesson=<brouillon>` |
| `content_state == "aucune_lecon"` | **Équiper cette notion** | **action** `equipNotion(skill_id)`, avec confirmation |
| `content_state == "ok"` | **Relire la leçon →** | lien vers `/programme?lesson=<validée>` |

> 🔴 **La ligne `aucune_lecon` disait « Produire le quiz de cette notion → » vers `/quiz?skill=`.
> C'était FAUX deux fois**, et corrigé le 2026-08-09 au read-before-code de la Session B :
>
> - **`/quiz` ne peut pas tenir la promesse.** `QuizPilotagePage` pilote les quiz *de fin de cours*
>   — son sous-titre dit « un quiz se génère depuis le cours validé d'une leçon ». Or
>   `aucune_lecon` est exactement le cas **sans leçon**. Y créer `?skill=` aurait amené Papa sur une
>   page structurellement incapable de faire ce que le lien promet : **le défaut même que cet ADR
>   corrige**, reproduit par l'ADR qui le corrige.
> - **Le geste réel produit CINQ pièces, pas un quiz.** `equipNotion` (ADR-0042) génère et
>   auto-valide « cours, fiche, cartes de révision, quiz et carte mentale ».
>
> **Décision du commanditaire : la ligne porte l'ACTION**, pas un lien vers une page qui ne la
> porte pas. C'est le geste qui existe déjà dans le dépliage de Progression
> (`SubjectDetailRow.tsx`), avec sa `ConfirmDialog` et sa `ProgressBar`.
>
> ⚠️ **La confirmation n'est pas optionnelle** : c'est une génération LLM auto-validée, ~69 s par
> notion (mesuré le 2026-08-02). Elle dit ce qui sera produit, et que ça prend des minutes.
> ⚠️ **Conséquence assumée** : cette ligne-là est un `<button>`, les trois autres des `<Link>`. La
> forme suit ce que le geste fait — un lien qui déclencherait une génération serait pire.

**`has_active_mission` est testé en premier** : une notion déjà couverte n'attend aucune décision de
contenu, quel que soit son `content_state`.

⚠️ **`ok` reçoit un geste de vérification, pas de production.** La section porte déjà son bouton
« Créer N missions » ; doubler l'action au niveau ligne créerait deux chemins pour la même chose,
avec deux portées différentes (le bouton ignore le filtre, la ligne non).

⚠️ **« Voir la mission → » est de couleur `papa-accent-2`**, pas `papa-accent`. Le vert est la
couleur des gestes qui font avancer ; celui-ci constate.

### 4. La leçon visée suit l'ÉTAT VISÉ PAR LE GESTE

**Décision du commanditaire**, sur le constat 5.

- `cours_brouillon` → une leçon en **brouillon** — c'est elle qu'il faut valider ;
- `ok` → une leçon **validée** — c'est elle qu'on relit.

Départage entre candidates de même statut : **la première de l'ordre que `lessons_by_skill` établit
déjà** — `updated_at` décroissant, puis `id`. Autrement dit `lecons[0]` après filtrage par statut.

> 🔴 **Cette phrase disait « la plus récente (`id` le plus grand) », et c'était FAUX.** Corrigé le
> 2026-08-09 au read-before-code de la Session A. `lesson_resolution.py:113` trie déjà
> `(updated_at, id)` décroissant pour ses **cinq** appelants, et les deux ordres divergent
> réellement : une leçon ancienne modifiée hier passe devant une leçon créée aujourd'hui et jamais
> retouchée. Imposer l'`id` aurait mis **deux ordres de « la plus récente »** dans le même dépôt,
> que rien n'aurait tenus ensemble — c'est le motif exact des dettes *deux définitions de
> `has_referentiel`* et *sept copies de `_active_year`*. **Décision du commanditaire : l'ordre
> existant gagne, l'ADR se corrige.** Bénéfice second : aucun code de tri à écrire.

**Même règle pour la mission** (Décision 5) : `active_missions` trie déjà
`priority DESC, id`. La mission rendue est la première de cet ordre — on ne réinvente pas un
second critère de « la mission qui couvre ».

### 5. Les deux champs sont servis dans le MÊME payload, calculés en lot

`lesson_id` et `mission_id` rejoignent `OpenGap`. **Aucune requête supplémentaire, aucune
migration** — les deux sont déjà calculés puis jetés (constat 4). `fetchOpenGaps()` ne gagne aucun
paramètre.

### 6. `content_state` est typé en union, ET la branche par défaut est conservée

L'union `"ok" | "aucune_lecon" | "cours_brouillon"` est déclarée dans `packages/types`. Mais la
branche par défaut **reste**, et elle est **testée** : le backend peut servir une valeur que le
front ne connaît pas encore, et une ligne sans geste vaut mieux qu'une ligne qui plante.

⚠️ **Le défaut ne rend AUCUN geste** — il ne retombe pas sur « Relire la leçon ». Un geste par
défaut mènerait quelque part sans savoir pourquoi.

### 7. Le geste ne s'écrase pas sur un téléphone

Sous **640 px**, badge et geste descendent sur leur propre ligne ; le corps prend toute la largeur.

Ce n'est pas une précaution : le défaut a été **vu à 375 px sur la maquette**, avant l'ADR. `.corps`
(`flex:1`, `min-width:0`) était comprimé sous sa largeur minimale par ses deux frères
`flex:0 0 auto`, et le titre partait en colonne, un mot par ligne. C'est le défaut exact que la
**PR #101** a dû corriger après coup sur la zone C du Diagnostic.

### 8. La station ② est corrigée dans le même chantier

Ses deux gestes passent au grain de la notion (`?lesson=`, `?skill=`), et « Voir la lacune → »
transporte enfin la matière (`/lacunes?subject=<slug>`).

⚠️ **C'est un élargissement du périmètre annoncé**, et il est soumis comme tel. Le motif : laisser la
station ② sur-promettre pendant qu'on corrige `/lacunes` **au nom de la sur-promesse** produirait
deux surfaces contradictoires nées du même chantier. Trois lignes de code, la même règle.

## Périmètre

**Dedans** : le geste de ligne sur les trois sections · les deux champs au contrat `OpenGap` ·
`?skill=` sur `/quiz` · `?focus=` sur `/missions` · la règle responsive · l'union de type ·
les trois liens de la station ② (Décision 8).

**Dehors, explicitement** :

- **le filtre par matière, les bandeaux, les états vides, les deux boutons de génération** — livrés,
  tenus par des tests, non touchés ;
- **le `ConfirmDialog` et ses portées** — la divergence « le bouton ignore le filtre » est écrite
  dans la spec et reste telle quelle ;
- **la déduplication des lacunes en base** (2 doublons Maths, 11 Français pour 2 passés) — c'est une
  **donnée**, pas un défaut de code ;
- **le décompte d'ancienneté** — alternative (f) ;
- **`Gap.subject_id` vs `Skill.subject_id` qui peuvent diverger** — dette connue, bornée par un test,
  hors sujet ici.

## Conséquences

- La page cesse d'être un cul-de-sac **sur les données actuelles**, pas seulement en théorie.
- Deux pages gagnent un paramètre d'URL, donc deux nouvelles surfaces de deep-link à tester.
- La station ② cesse de sur-promettre — trois liens changent, aucun libellé.
- 🔴 **Le contrat `OpenGap` grossit de deux champs sans migration** : c'est peu cher, mais il faut
  vérifier que `response_model` les déclare. *« `response_model` filtre en SILENCE les champs non
  déclarés »* est une dette 🔴 connue du dépôt, et c'est exactement le cas où elle mord.
- La page reste **sans aperçu du contenu** : Papa doit toujours sortir pour lire. C'est assumé, et
  c'est le même arbitrage que `/relecture` (`adr-0039`).

## Le signal qui dirait qu'on s'est trompé

- **Papa clique « Voir la mission → » et revient aussitôt** : la page Missions ne montre pas ce qu'il
  cherchait — revoir la **cible** du focus, jamais retirer le geste.
- **Papa n'utilise que les boutons de section** : le geste de ligne n'apporte rien, et c'est le
  cadrage qui est faux, pas l'implémentation.
- **Un geste « Valider le cours » atterrit sur une leçon déjà validée** : la Décision 4 est mal
  appliquée — c'est un défaut, pas une préférence.
- **Le motif sous la ligne allonge la page au point qu'on ne voit plus les sections** : le replier
  derrière un survol, **jamais** le supprimer — c'est lui qui distingue ce geste d'un lien nu.
- **Quelqu'un demande pourquoi une ligne n'a aucun geste** : c'est la branche par défaut de la
  Décision 6 qui s'est déclenchée — regarder ce que le backend a servi, pas le front.

## Suivi

À écrire à l'exécution : ce que le read-before-code de chaque slice aura trouvé de faux dans cet
ADR. Les six précédents en ont tous trouvé au moins un.
