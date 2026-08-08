# Page Papa — Diagnostic

> Route `/diagnostics`, sidebar après « Missions ». **Refonte** d'une page existante de 149 lignes
> (`DiagnosticsPapaPage.tsx`), pas une création.
> Réalise l'`adr-0043` (**Accepté**, 2026-08-08). Maquette :
> `docs/frontend-papa/mockup/mockup-papa-diagnostic-v3.html`.
> Chantier : `prompts/claude-code/prompts-claude-code-adr-0043.md`, en trois sessions —
> **les trois sont livrées**. Cette spec décrit désormais l'existant.
>
> **Amendée par l'`adr-0045`** (2026-08-08) — **quatre optimisations**, pas une refonte : les
> jauges deviennent des focus, les deux crans non passés reçoivent leurs deux actions et nomment
> leur acteur, et une jauge cesse de compter « générées » en écrivant « mesurées ». Tout le reste
> — rail à trois crans, trois stations, portée en escalier, mur de la station ③ — est inchangé.
> Maquette : `docs/frontend-papa/mockup/mockup-papa-diagnostic-v4-optimisations.html`.
> Chantier : `prompts/claude-code/prompts-claude-code-adr-0045.md`.
> **Les passages amendés portent la mention `[0045]`.**

## Ce que la page répond

*« Cette mesure, qu'a-t-elle mesuré, qu'a-t-elle ouvert, et qu'est-ce que ZETIS en a fait ? »*

Dans cet ordre, et sans sauter d'étape. Une passation est une **mesure datée** : la page la traite
comme un instrument, pas comme un bulletin.

Elle est le complément de deux surfaces qui ne peuvent pas y répondre :

- **Progression** (`adr-0040`) nomme les notions et date leurs mouvements, mais sur **toutes** les
  sources confondues — elle ne sait pas dire « ce que *cette* passation a mesuré » ;
- **Lacunes** liste les lacunes ouvertes **quelle que soit leur origine** — elle ne sait pas dire
  laquelle vient d'un diagnostic, ni de quelle passation.

## La page actuelle, et ce qu'elle ne dit pas

Un `<select>` de matière, un bouton, et des cartes de résultat. Ce qui manque, mesuré :

| Manque | Cause dans le code |
|---|---|
| **La date d'une passation** | `completed_at` est transmis (`schemas.py:86`) et **jamais affiché** — deux diagnostics de la même matière sont indistinguables |
| **Le palier de maîtrise** | `status` est transmis (`diagnostic.ts:14`) et **jamais lu** — la page recolorie depuis le score avec ses propres bornes (70/40) |
| **Le palier `acquise` (≥ 90)** | Absent de l'UI : 95 % et 72 % s'affichent identiques, alors que `progress/service.py:13-15` défend l'inverse |
| **L'état réel d'une lacune** | Les lacunes affichées sont **recalculées** depuis les réponses (`service.py:439-442`) ; la table `gaps` n'est **jamais lue** |
| **Toute comparaison entre passations** | Aucune |

## Structure

### En-tête

Sur-titre `Interface Papa · lecture · année <label>`, titre **Diagnostic**, et une phrase qui pose
le contrat de lecture de la page (« ce qu'elle a mesuré, ce qu'elle a ouvert, ce que ZETIS en a
produit »).

### Bandeau instrument — 4 jauges

| Jauge | Ce qu'elle dit | Geste `[0045]` |
|---|---|---|
| Matières mesurées au moins une fois | `3 / 8`, avec le détail de ce qui manque en sous-titre | **filtre** — les matières sans aucune mesure |
| Lecture la plus ancienne **encore invoquée** | l'âge de la mesure la plus vieille qui sert encore à décider | **sélection** — ouvre cette passation |
| Lacunes ouvertes **par un diagnostic**, encore ouvertes | `Gap.source == "diagnostic"` ∩ `OPEN_GAP_STATUSES` | **lien** — `/lacunes?source=diagnostic` |
| Lots de production déclenchés par une mesure | **`0`**, en hachures, sans couleur | **aucun** — et c'est écrit |

🔴 **La quatrième jauge n'est pas un compteur de panne.** Elle vaut zéro **par décision** — voir
station ③. Son rendu (hachures, gris, jamais rouge) doit dire « vide voulu », pas « échec ».

#### `[0045]` Chaque nombre peut montrer sa population

**La règle, en une phrase :** une jauge **filtre le rail** quand sa population est faite de
diagnostics ; elle **renvoie par un lien nommé** quand sa population vit sur une autre page ; elle
**ne fait rien** quand elle vaut zéro par décision — et alors elle le dit.

C'est le principe de `KpiFocusCard` (*« une mesure ET le contrôle qui montre ce qui la fonde »*,
`adr-0028 §5`), et le défaut littéral dont l'`adr-0039` est né : **des nombres qui mentaient,
invisibles parce que non cliquables**. Deux populations étaient annoncées et montrées nulle part —
« N proposés non passés » et « dont N sans contenu produisible ».

**Les sous-populations du détail sont des focus à part entière**, rendues en pastilles et non en
phrase : c'est *elles* que le lecteur ne pouvait pas voir.

| Focus | Le rail montre alors |
|---|---|
| `non-mesurees` (la valeur `3 / 8`) | les matières sans aucune passation — celles jamais générées **et** celles générées jamais passées |
| `proposes` (pastille du détail) | les diagnostics au cran « proposé » |
| `jamais-generees` (pastille du détail) | le bloc « Jamais généré » seul |

🔴 **Un focus est un filtre NOMMÉ, jamais une troncature.** Un bandeau dit ce que le rail montre et
comment en sortir (« Tout revoir ✕ »). Aucune ligne ne disparaît en silence — la règle est déjà
écrite dans le dépôt : *si une surface borne ce qu'elle montre, elle doit dire ce qu'elle laisse
dehors.*

**Le focus se compose avec la pastille de matière**, et leur croisement obéit à la même règle :

- **l'état vide du rail dit LAQUELLE des deux situations il rend** — *aucun diagnostic dans le
  dépôt* ou *aucun sous les filtres actifs*. 🔴 La seconde ne doit **jamais** emprunter la phrase de
  la première (« Aucun diagnostic pour l'instant. Lance-en un ») : ce serait annoncer un dépôt vide
  à un lecteur qui en a dix-huit ;
- **le bloc « Jamais généré » subit les mêmes filtres que le rail.** Il en est une partie, pas un
  encart indépendant.

> ⚠️ Ces deux points **amendent la Décision 9 de l'`adr-0045`**, qui rangeait les pastilles dans
> « ce qui ne change pas ». Précondition fausse, corrigée au read-before-code de la Session A.
> Reste **signalé et non traité** : une pastille seule laisse le panneau de droite sur une matière
> qu'elle exclut. La jauge ② efface les deux filtres avant de sélectionner, donc les focus ne
> peuvent pas produire ce cas.

🔴 **La 4ᵉ jauge n'est PAS rendue cliquable, et c'est une décision.** La rendre cliquable ferait
chercher une population qui n'existe pas, et pousserait à demander l'ouverture d'un déclencheur
écarté en connaissance de cause.

🔴 **Et elle se comprend SEULE.** La relecture humaine du 2026-08-08 a répondu « je ne comprends pas
la 4ᵉ » devant « Lots de production déclenchés par une mesure · 0 · et c'est voulu — voir ③ ·
inerte ». Trois défauts : du vocabulaire **interne**, un **renvoi mort** (③ n'est visible qu'après
avoir sélectionné une passation passée et scrollé), et le mot `inerte` qui dit qu'elle ne réagit pas
sans dire pourquoi. Elle porte désormais un titre de lecteur — **« Ce qu'une mesure a fait produire
à ZETIS »** — et **sa raison sur elle** : *« rien, et c'est une décision : ZETIS ne se commande pas
de contenu sur sa propre mesure »*. **Aucun renvoi.**

#### `[0045]` La jauge dit ce qu'elle compte

Le détail de la première jauge écrit « **jamais générées** », pas « jamais mesurées ».

Ce sont deux populations distinctes : `matieres_mesurees` compte les matières ayant une
**tentative** (`service.py:1013`), `jamais_generees` celles sans aucun **quiz** (`:1058`). Rendre
la seconde avec le mot de la première produit une addition fausse à l'écran — `2 / 8` mesurées
et `5` jamais mesurées, quand la soustraction en donne 6. La sixième est une matière **générée,
proposée, jamais passée** : elle tombe dans le trou entre les deux mots.

Le champ backend porte déjà le bon nom : **c'est le rendu qui mentait**. Et le focus
`non-mesurees` rend l'addition vérifiable à l'œil — le lecteur compte au lieu de croire.

### Filtres

Pastilles de matière `SubjectFilterChips` de `@zetis/ui`, la même brique que le Dashboard, la
Couverture, la file de relecture et le cahier de bord. Les matières **sans aucun diagnostic** sont
présentes et **atténuées** — leur absence est l'information.

À droite, l'action **Lancer un diagnostic** (modale).

### Rail chronologique

Colonne de gauche, groupée par mois, **la plus récente en haut**. Une entrée = une passation ou un
diagnostic en cours de route. En bas, un groupe **« Jamais généré »** listant les matières
non couvertes.

> ⚠️ **Les matières sans diagnostic ne produisent ni compteur ni pastille de nouveauté.**
> `navigation.ts:24-26` liste Diagnostic parmi les entrées **sans témoin**, et un test verrouille
> cette liste « pour qu'elle ne se complète pas par symétrie apparente ».

#### Le témoin de passation — trois crans, en lecture seule

| Cran | Signification | Origine |
|---|---|---|
| ◌ **généré** | existe, attend la relecture de Papa — **invisible de Massimo** | un fait du moteur |
| ○ **proposé** | relu par Papa, disponible pour Massimo, **pas encore passé** | un geste de Papa |
| ● **passé** | une tentative complétée existe | lu dans `quiz_attempts` |

🔴 **Aucun score ne s'affiche avant le troisième cran — il n'en existe pas.** Les deux premiers
crans portent un libellé, jamais un pourcentage.

🔴 **Le témoin ne se coche jamais à la main.** Le troisième cran est *lu*, pas déclaré : le cocher
serait affirmer un fait que rien n'a mesuré.

> ⚠️ Cette spec a longtemps porté ici : *« deux de ces trois crans n'existent pas dans le code »*.
> **C'est faux depuis la session A de l'`adr-0043`** — `quizzes.validation_status` (migration
> `a9b0c1d2e3f4`) sépare « généré » de « proposé », et le gate est en place dans
> `list_diagnostics`. Corrigé le 2026-08-08.

#### `[0045]` Un cran non passé nomme son acteur

Les deux crans non passés désignent des acteurs **opposés**, et l'écran les rendait en deux paires
de deux mots, de même casse et **du même gris** — rien ne disait chez qui la balle se trouvait.

| Cran | Ligne 1 — **l'acteur**, en couleur | Ligne 2 — l'état, en gris |
|---|---|---|
| généré | **chez toi** (ambre) | à relire |
| proposé | **chez Massimo** (bleu) | pas encore passé |

L'acteur passe **en premier**. Ambre = c'est à Papa d'agir ; bleu = on attend Massimo. **La couleur
ne porte jamais l'information seule** : le mot est écrit. La légende du rail dit la même règle, en
toutes lettres — c'est la formulation que la maquette v3 portait dans sa légende et qui n'avait
jamais été implémentée.

🔴 **Nommer l'acteur est factuel ; compter les jours d'attente resterait interdit.** « chez Massimo
depuis 6 jours » serait un décompte de non-fait — `CLAUDE.md` §gamification et la règle « NOUVEAU
jamais DÛ » de l'`adr-0030`. La date de proposition est déjà affichée : elle dit le même fait sans
le transformer en dette.

### Panneau — la passation sélectionnée

#### `[0045]` Le panneau d'un cran non passé — deux actions, jamais zéro

Un diagnostic non passé n'a **ni score, ni palier, ni lacune** : le panneau ne montre donc aucune
des trois stations, et c'est le seul rendu honnête. Mais il ne doit pas pour autant être un
**cul-de-sac** — trois lignes de texte et une colonne vide jusqu'en bas.

**Chaque cran non mesuré porte deux actions** — une principale, une secondaire :

| Cran | Action principale | Action secondaire |
|---|---|---|
| **chez toi** · à relire | Ouvrir dans la file de relecture → | Refuser ce lot |
| **chez Massimo** · pas encore passé | *(différée — voir ci-dessous)* | Retirer la proposition |

> 🔴 **« Voir la page de Massimo → » est DIFFÉRÉE**, et pas par oubli : elle ne peut pas rendre ce
> qu'elle annonce. Aucun lien inter-app n'existe (`VITE_API_URL` est la seule variable du front
> Papa), et surtout **le rôle l'interdit** — la page de Massimo appelle des routes `require_child`,
> qui répondent 403 à un rôle parent. Papa y verrait une erreur, jamais ce que Massimo voit.
> La décision produit qui la débloquerait est au `BACKLOG.md`.

Le sur-titre du panneau reprend la formulation du rail (« chez toi · à relire »), pour qu'une ligne
sélectionnée et son panneau ne se nomment pas différemment.

⚠️ **Les deux actions secondaires appellent `POST /reject`, qui existe déjà.** Aucun endpoint neuf,
aucune migration : c'est une surface qui manque, pas une capacité.

🔴 **« Retirer la proposition » est destructif du point de vue de Massimo** — le diagnostic
disparaît de sa page. Elle demande une confirmation, et **sa formulation ne désigne aucun
manquement de sa part** : le refus va au lot, jamais à l'enfant.

#### La portée — comparaison entre passations

Une ligne par notion mesurée plusieurs fois, avec son évolution et son delta en points.

🔴 **Le tracé est un ESCALIER, jamais une courbe lissée.** Un score par notion porte sur un petit
nombre de questions : il ne prend qu'un jeu discret de valeurs. Une interpolation douce inventerait
des points intermédiaires qui n'ont jamais été mesurés.

**À une seule passation, la portée ne s'affiche pas** — elle est remplacée par son absence
expliquée : *« un point ne fait pas une pente »*.

#### ① Ce qui a été mesuré

Un tableau à cinq colonnes : **Notion · barre · Score · Palier · Lacune**.

🔴 **Palier et Lacune sont deux colonnes distinctes, et c'est l'invariant central de ce tableau.**
Ce sont deux populations **disjointes** : une notion peut être à renforcer sans lacune ouverte, et
une lacune peut être résolue sur une notion qui n'est pas encore acquise. La page ne doit **jamais**
laisser lire que « score bas » et « lacune » sont la même chose.

> C'est la confusion que `DashboardPage.tsx:220` et `LacunesPage.tsx:128` passent leur texte à
> démonter, tranchée le 2026-08-05. La rouvrir par une colonne unique serait un recul.

**Vocabulaire des paliers** — celui du produit, pas un vocabulaire de page :
`acquise` (≥ 90) · `en cours` (≥ 70) · `à renforcer` (en dessous) · `non abordée`.
⚠️ Ni « fragile », ni « solide » : ces mots n'existent pas dans les libellés Papa.

#### ② Ce qui a été ouvert

Une carte par lacune, **relue à l'affichage** — l'état est celui d'aujourd'hui, pas celui de la date
de passation. Quatre badges, et **deux d'entre eux commandent des gestes différents** :

| Badge | Situation | Geste proposé |
|---|---|---|
| `résolue` | refermée par une mission | Voir la lacune → |
| `remédiation en cours` | mission active | Voir la lacune → |
| `aucune leçon` | **aucune** leçon ne porte la notion | **Produire le quiz de cette notion →** |
| `cours en brouillon` | une leçon existe, son cours n'est pas validé | **Valider le cours de cette leçon →** |

🔴 **Les deux derniers badges ne se confondent pas, et c'est l'`adr-0042` qui les a séparés.**
Sans leçon, le quiz s'ancre désormais sur la notion (sous réserve d'une source RAG) : la lacune est
**réparable**. Avec une leçon en brouillon, la voie notion **refuse** — c'est un dernier recours
réservé aux notions sans leçon — et il faut valider le cours. Un badge unique rendrait ces deux
situations indistinguables alors que le geste de Papa diffère.

#### ③ Ce que ZETIS en a produit

Nœud en pointillés, corde coupée. La station affiche **zéro lot**, et **dit pourquoi** :

> ZETIS ne se commande pas de production sur sa propre mesure. Une mesure fausse produirait alors
> du contenu que rien d'extérieur ne viendrait contredire — la boucle se refermerait sur elle-même.
> Seule une source du monde réel (un contrôle inscrit à l'agenda) déclenche ZETIS toute seule.

🔴 **Cette station présente un MUR, pas un trou.** `EMITTED_TRIGGERS` n'inclut pas `evidence`, et
`db/models/production.py:32-36` porte la raison en toutes lettres : *« écarté EN CONNAISSANCE DE
CAUSE, pas par manque de temps »*. Une formulation qui exprimerait un regret pousserait le lecteur
à demander l'ouverture d'un déclencheur écarté volontairement.

Le bouton **Commander une production →** est donc la réponse **normale**, pas un pis-aller.

### La modale « Lancer un diagnostic »

Quatre états : **Réglage · En cours · À l'arrêt · Terminé**.

- **Réglage** — matière, puis le périmètre réel : notions du référentiel, notions retenues,
  questions attendues. ⚠️ Il doit dire que **ce sont toujours les mêmes notions** tant qu'une
  rotation n'est pas décidée (voir backlog) : une passation ne dit rien des autres.
- **En cours** — le pourcentage compte les **notions traitées**, jamais le temps écoulé. Barre
  animée : c'est le seul indice de vie, et il s'arrête avec le travail.
- **À l'arrêt** — la barre **reste où elle est** et le dit (« rien n'avance depuis … »). Elle
  n'affiche pas d'avancement qu'aucune notion ne justifie. Patron déjà acquis par la barre de
  production (`adr-0041`).
- **Terminé** — le compte des questions **gardées et écartées**, et le rappel que le diagnostic
  rejoint le rail au **premier cran**, pas chez Massimo.

## Ce que la page s'interdit

- **Aucun score avant le troisième cran** — il n'en existe pas.
- **Aucun compteur de jours d'attente côté Massimo, aucune relance, aucune pastille de retard.**
  L'attente est une information pour Papa, **pas une pression sur l'enfant**.
- **Aucun classement de matières**, aucun « meilleur / moins bon ».
- **Aucune note globale de l'élève** — un diagnostic mesure des notions, pas un enfant
  (`adr-0028 §9`, non rouvert).
- **Aucune interpolation** dans la portée (voir plus haut).
- **Aucun agrégat de provenance** — la page ne totalise pas « ce que l'IA a produit ».
- **Aucune modification de contenu** — la page lit et oriente ; produire a ses pages.
- `[0045]` **Aucune troncature** — un focus est un filtre nommé, réversible et annoncé ; il ne coupe
  jamais une liste en silence.
- `[0045]` **Aucun geste sur la 4ᵉ jauge** — elle vaut zéro par décision, et le rendre cliquable
  ferait chercher une population qui n'existe pas.

## Périmètre des données

**Année active uniquement**, comme la Couverture et la file de relecture.

Les lacunes affichées sont celles **ouvertes par un diagnostic** (`Gap.source == "diagnostic"`), et
leur état est **relu en base**, jamais recalculé depuis les réponses de la passation.

## Contrat

### Ce qui existe et se réutilise

| Route | État |
|---|---|
| `POST /api/diagnostics/generate` | existe — rend **202** + un travail (`API_SPEC.md` à corriger) |
| `GET /api/diagnostics/results` | existe — ⚠️ `limit=10` en dur, sans filtre ni pagination |
| `GET /api/diagnostics/subjects` | existe |

⚠️ **`_per_skill_for_attempt`** (`diagnostics/service.py:412`) porte déjà le calcul du score par
notion, et **`latest_results`** (`:378`) est **la portée transposée** — groupée par passation au lieu
de par notion. L'agrégat est **déjà écrit trois fois** dans le dépôt (`submit`,
`_per_skill_for_attempt`, `quizzes.complete_attempt`) : **en écrire une quatrième serait la faute que
l'`adr-0037` nomme**. La cible d'extraction est `_per_skill_for_attempt`.

### Ce qui manquait — livré par l'`adr-0043`

| Besoin | Réponse |
|---|---|
| **Détail d'une passation** | `GET /diagnostics/results/{attempt_id}` (session B) |
| **La portée** | `GET /diagnostics/portee?subject_id=` — pivot par notion, depuis `quiz_answers` (session B) |
| **L'état réel des lacunes** | `gaps` **lue en base**, statut servi (session B), `content_state` servi (session C) |
| **Le témoin à trois crans** | `quizzes.validation_status` (session A) + `GET /diagnostics/apercu` (session C) |
| **`require_parent` / `require_child`** | posés sur les six routes (session A) |

### `[0045]` Ce qu'il faut pour les quatre optimisations : **rien de neuf**

| Besoin | Ce qui le porte déjà |
|---|---|
| Filtrer le rail | l'aperçu sert **déjà** `cran`, `subject`, et la liste des matières jamais générées — le focus est un `useState` sur une liste en mémoire, comme les pastilles de matière |
| Ouvrir la passation la plus ancienne | `jauges.plus_ancienne_lecture` désigne **une** passation déjà présente dans le rail |
| Les deux actions secondaires | `POST /api/diagnostics/quizzes/{id}/reject`, et son client `rejectDiagnostic()` (`lib/diagnostic.ts:120`) |
| Le lien vers les lacunes | `/lacunes` existe |
| Le mot « générées » | le champ s'appelle **déjà** `jamais_generees` |

🔴 **Aucune migration, aucun endpoint neuf, aucun champ ajouté au contrat.** C'est l'invariant de ce
chantier : les quatre défauts sont des défauts de **surface**, pas de capacité — ce qui est aussi
pourquoi aucun test ne les voyait.

⚠️ **`set_validation` n'a aucune précondition d'état** (`service.py:389`) : `reject` accepte un
diagnostic déjà `validated`, ce qui est exactement ce que « Retirer la proposition » demande.
**Mais rien n'empêche Massimo de le passer entre le chargement de la page et le clic.** La règle
retenue : un diagnostic **passé** n'offre jamais cette action, et le rail le montre alors au
troisième cran quel que soit son `validation_status` — une mesure existante ne se cache pas.

🔴 **Une surface qu'aucune session ne prévoyait : `GET /diagnostics/apercu`.** C'est la session A
qui l'a rendue nécessaire — en gatant `list_diagnostics` sur `validated`, elle a rendu le **premier
cran invisible** de la seule route qui listait les diagnostics. C'est voulu : cette route est celle
de Massimo. Mais Papa a besoin de voir exactement ce que Massimo ne voit pas encore, d'où une
surface de lecture dédiée côté Papa — bandeau, rail et matières jamais mesurées, en un appel.

**La portée est calculable, y compris pour le passé** : `quiz_answers` n'est jamais écrasée (une
réponse par question, **y compris non répondue**), et la clé inter-passations est
`quiz_questions.skill_id`, stable même si chaque passation est un `quiz_id` neuf.
⚠️ **Ni `SkillMastery`** (écrasé, une ligne par notion à vie) **ni `skill_mastery_history`**
(n'écrit **qu'au changement de statut**) ne peuvent la porter.

## Ce que l'ADR a tranché

Les trois points que cette spec ne pouvait pas décider seule ont été tranchés par l'`adr-0043`.

1. **Le gate de relecture** — le diagnostic **sort de l'exception « évaluation éphémère »**
   (`adr-0043` Décision 1, qui amende l'`adr-0014` Décision 2). Le motif retenu est plus fort que
   celui envisagé ici : l'exemption d'origine vaut pour les quiz *« dérivés d'un substrat déjà
   validé »*, or `generate_diagnostic` construit son prompt sur **quatre scalaires**, sans cours ni
   contexte canonique — **et les trois garanties de contrepartie sont toutes inhonorées**.
   L'exemption ne s'y est jamais appliquée.
   → `quizzes.validation_status` (migration), 6ᵉ famille `diagnostic` dans `/relecture`, gate de
   service dans `list_diagnostics`. Les quiz de mission et de cours **restent dehors**.
2. **La granularité** — `QUESTIONS_PER_SKILL` passe de **2 à 5** (`adr-0043` Décision 3).
   ⚠️ N'améliore que les passations **futures** : la page affiche une granularité **mixte** et
   **le dit**.
3. **Le choix des notions** — le nombre **reste 8**, mais la sélection devient une décision au lieu
   d'un ordre d'insertion : **par ancienneté de mesure** (`SkillMastery.last_seen_at`), les jamais
   mesurées d'abord (`adr-0043` Décision 4). Motif : un diagnostic sert à **réduire l'incertitude**,
   et remesurer ce qui vient de l'être n'en réduit aucune. La page dit que c'est un **échantillon**.

L'ADR ajoute un quatrième point que cette spec avait renvoyé au backlog : **les rôles sont exigés
sur les six routes** (Décision 2). Un gate de relecture n'aurait aucun sens si n'importe quel compte
pouvait soumettre à la place de Massimo — on protégerait l'entrée en laissant la sortie ouverte.

## `[0045]` Ce que le second ADR a tranché

L'`adr-0045` ne rouvre **aucune** décision de l'`adr-0043`. Il en tranche quatre nouvelles, toutes
nées de la relecture visuelle humaine du 2026-08-08 :

1. **Une jauge qui annonce une population doit pouvoir la montrer** — filtre, lien, ou rien assumé.
   La 4ᵉ reste **inerte par décision**.
2. **Un cran non passé porte deux actions**, principale et secondaire, sur les **deux** crans.
3. **L'acteur passe avant l'état** — « chez toi » / « chez Massimo », en premier et en couleur,
   sans jamais compter les jours.
4. **Une jauge écrit le mot de ce qu'elle compte** — « jamais générées », pas « jamais mesurées ».

## Hors périmètre

Le **T0 sur les prérequis** — le graphe de prérequis n'existe pas (ni colonne ni table,
`parent_skill_id` NULL sur les 432 notions) · l'ouverture de `trigger='evidence'` · la refonte de
la page Diagnostic **de Massimo** · le multi-enfant (le JWT n'est relié à aucun `StudentProfile`) ·
la correction des 14 défauts du module consignés au `BACKLOG.md`, qui relèvent de leurs propres
chantiers.

`[0045]` S'y ajoutent, **écartés en connaissance de cause** : le bloc « Jamais généré » reste en
lignes inertes (l'action existe en tête de page) · le « 37 j » est une troncature `.days`
défendable, pas un défaut · le **N+1** de `GET /quizzes` et le plafond en dur de `GET /results` ·
et l'**anti-triche du diagnostic** (temps par question, sortie d'écran, verbalisation), chantier
suivant décidé le 2026-08-08 et consigné au `BACKLOG.md`.
