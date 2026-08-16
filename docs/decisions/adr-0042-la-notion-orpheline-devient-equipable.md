---
id: "0042"
titre: "La notion orpheline devient équipable : le quiz s'ancre sur la notion"
type: surface
statut: accepte
date: 2026-08-07
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0010", "0011", "0014", "0017", "0021", "0027", "0034", "0036", "0037"]
---
# ADR-0042 — La notion orpheline devient équipable : le quiz s'ancre sur la notion

## Statut

**Accepté — 2026-08-07.** Les cinq décisions sont **gelées** : le quiz notion-ancré comme dernier
recours, le plancher de source, l'ouverture des quatre autres portes pour la seule pièce `quiz`,
la levée du filtre de niveau d'`orphan_notions`, et la liste de ce qui ne change pas (§6).

> Historique : Proposé — 2026-08-07, **le même jour**. Le chantier a été cadré, instruit,
> exécuté, vérifié à l'écran et joué en réel dans la même session ; le § « Corrections à
> l'exécution » plus bas dit ce que l'exécution a démenti — **aucune décision n'a bougé**, et
> c'est ce qui autorise l'acceptation sans délai.

⚠️ **Accepté ≠ livré.** La décision est figée ; l'implémentation vit dans la PR
[#98](https://github.com/NeuronXcore/zetis-school/pull/98), **encore ouverte et en attente de
relecture visuelle humaine**. Ne pas lire ce statut comme « c'est en place sur `main` ».

> S'appuie sur : `adr-0011 §1` (le substrat canonique partagé et **sa cascade de dégradation** —
> c'est la pièce maîtresse de cette décision), `adr-0010` (la génération « skills-only » crée des
> notions sans chapitre ni leçon : c'est son contrat, pas un défaut), `adr-0014` (le moteur de quiz
> unifié, dont on ouvre une seconde voie d'entrée), `adr-0017 §4` (qui **reportait** l'auto-génération
> du quiz de mission au « Lot 2 » — le présent ADR est ce Lot 2, sur son seul cas bloquant),
> `adr-0021` (l'équipement d'une notion et sa dégradation gracieuse leçon-centrée),
> `adr-0037` (la réponse unique à « quelle est LA leçon de cette notion »), `adr-0036 §2`
> (« la file annonce le blocage AVANT le clic »).

## Contexte

Une `Skill` peut exister sans aucune `Lesson`. C'est un **état produit normal**, pas un bug : la
génération « skills-only » de l'ADR-0010 upserte des notions de niveau antérieur *« sans chapitre
associé »* — c'est écrit dans sa décision 1 — et les ponts « Ajouter au programme » (addendum
ADR-0027) font la même chose.

Pour ces notions, la chaîne de production est **fermée de bout en bout**, et chaque maillon est
individuellement correct :

1. pas de leçon → `equip_notion` / `equip_piece` sortent en tête, `has_lesson=False` ;
2. pas de cours → le moteur quiz (ADR-0014) refuse, 409 ;
3. pas de quiz → l'étape quiz de la mission est **omise** (ADR-0017 §4, « réutiliser sinon
   dégrader ») ;
4. mission à 2 étapes → le verdict `acquired` devient **arithmétiquement** inatteignable ;
5. `review_later` → la lacune passe `in_progress` → plus jamais de remédiation.

**Le trou est structurel et il est en amont de tout.** Tant qu'il est là, tout ce qui ouvre une
lacune sur une notion orpheline fabrique une dette infermable — le diagnostic comme le Conseil de
classe, qui la convertissent ensuite en missions d'un clic.

Le code le savait déjà. `curriculum/service.py:1000-1003` porte ce commentaire depuis le
2026-08-03 :

> *« ⚠️ **La notion créée ici est ORPHELINE** — aucune leçon ne la porte, donc `equip_notion`
> renvoie `has_lesson=False` et **ZETIS ne produira jamais rien pour elle**. »*

## Constat read-before-code

Établi contre le code réel le 2026-08-07, **avant** toute écriture. Ce qui suit corrige plusieurs
suppositions de cadrage : ce sont les écarts qui ont décidé de la solution.

### 1. Il y a cinq portes, pas une

Le cadrage supposait que le verrou était le moteur quiz. Il y en a cinq, en série :

| # | Porte | Fichier |
|---|---|---|
| 1 | `BLOCKED_NO_LESSON` retire la notion d'`eligible` **avant** tout appel | `production/runner.py:301-302` |
| 2 | Retour anticipé « kit non généré » / « rien à produire » | `production/equipment.py:207-217`, `:385-393` |
| 3 | `_validated_lesson_or_409` — 404 puis deux 409 | `quizzes/service.py:70-83` |
| 4 | `_resolve_mission_quiz_ids` joint par `Quiz.lesson_id` | `missions/service.py:93-102` |
| 5 | `orphan_notions` filtre `Skill.level == year.level` | `curriculum/service.py:930` |

**La porte 4 est celle qu'on oublie**, et c'est elle qui décide du critère de réussite : un quiz
produit mais introuvable par `_resolve_mission_quiz_ids` laisse l'étape quiz omise. Tout serait
vert, et rien ne serait débloqué.

### 2. Le verdict est arithmétiquement inatteignable, et la boucle est fermée

`missions/service.py:1181-1186` — `acquired` exige `reverse ≥ 70` **ET**
`(quiz ≥ 70 OU mindmap ≥ 70)`. Pour une orpheline, les deux signaux de rappel valent `None` :
Massimo peut réexpliquer à 100/100, le verdict est `review_later`, **mécaniquement**.

Puis `review_later` écrit `gap.status = "in_progress"`, or `generate_remediation` ne lit que
`Gap.status == "open"`. Le relais annoncé est le SRS → mission `revision` → mais
`_build_revision_steps` appelle **le même** `_recall_steps`. **La notion est piégée à vie.**

### 3. Le gate de l'ADR-0011 n'interdit pas ce qu'on croyait

C'est le constat décisif. Le gate interdit à un dérivé de recevoir un cours **non validé**. Il
n'interdit pas de travailler **sans cours** — l'ADR-0011 §1 nomme lui-même la cascade :

> *« Cascade de dégradation : cours validé → RAG seul → connaissance du modèle. Les deux derniers
> crans existent déjà ; cet ADR ajoute le premier, une fois pour tous. »*

Et `resolve_canonical_context` l'implémente déjà : sans leçon validée, `lesson=None`, le RAG passe
à `k_without=5`, et `build_canonical_sections` rend un bloc exploitable.

**Le précédent existe même dans le kit.** `generate_cards_for_skill` est le cinquième générateur et
le seul sans garde 409 : `memory/generation.py:220` fait `target = STATUS_ACTIVE if has_course else
STATUS_PENDING`. Il produit sans cours, en dégradé. Ce n'est donc pas une porte qu'on ouvre, c'est
une doctrine qu'on applique à un sixième cas.

### 4. Le modèle autorise déjà un quiz sans leçon

Vérifié en base, pas dans la doc :

| Colonne | Nullable |
|---|---|
| `quizzes.lesson_id` | **oui** |
| `quizzes.chapter_id` | **oui** |
| `quizzes.subject_id` | non — fourni par `Skill.subject_id` |
| `quiz_questions.skill_id` | **oui**, et c'est déjà le porteur de l'attribution |
| `lessons.chapter_id` | **non** — une leçon flottante demanderait une migration |

### 5. Le résolveur de leçon est un verrou plus dur que le moteur quiz

`lesson_resolution.lessons_by_skill` fait un **INNER JOIN sur `Chapter`** puis sur
`SchoolYearSubject`, filtré `school_year_id == année active` et `Chapter.validation_status ==
'validated'`. Une leçon sans chapitre y est **invisible**, et un chapitre hors année active aussi.
Toute solution passant par une leçon doit donc fabriquer un chapitre validé **dans l'année en
cours** — y compris pour une notion de niveau antérieur, qui par construction n'y a pas sa place.

### 6. La notion de niveau antérieur est ciblée mais invisible

Asymétrie, et c'est elle qui rend le problème vicieux :

- **ciblée** — `missions/service.py:588-592` (branche rattrapage de `generate_progression`)
  sélectionne `Skill.level != year.level` sans aucune exigence de leçon ;
- **invisible** — `orphan_notions`, seule surface montrant à Papa les notions sans leçon, filtre
  `Skill.level == year.level`.

ZETIS fabrique donc des missions sur des notions que Papa ne peut voir nulle part.

### 7. Dimensionnement réel (base de dev, 2026-08-07)

**2 notions orphelines sur 432**, toutes deux de niveau `4e` (« Nombres relatifs », « Temps du
récit » — du seed). **Les 432 notions sont de niveau `4e`**, celui de l'unique année active.
Le skills-only de l'ADR-0010 **n'a jamais tourné sur cette base**. Le cas visé par cet ADR est donc
réel par contrat et **absent des données** — ce qui a une conséquence directe sur la preuve (§Suivi).

### 8. ⚠️ Le chapitre orphelin existe encore, et j'ai commencé par ne pas le voir

Le premier comptage de ce read-before-code a rendu « 79 chapitres, tous rattachés à l'année ».
**Il était faux**, et il l'était pour la raison exacte que l'addendum ADR-0034 décrit : la requête
joignait `chapters` à `school_year_subjects` en **INNER JOIN**, donc elle laissait tomber ce
qu'elle cherchait.

Le compte juste est **80 chapitres, dont 1 orphelin** : `id=10`, « Les fractions »,
`validation_status='validated'`, `theme_id=2`, `school_year_subject_id IS NULL`, **0 leçon**.
C'est celui que l'addendum ADR-0034 signalait déjà comme non rétro-attribué.

Ce n'est pas une anecdote de méthode : **c'est la démonstration que le défaut se reproduit sur
quiconque écrit la requête évidente**, y compris en le cherchant. Deux conséquences retenues :

- **la porte de création est bien fermée** (`subjects/service.py:224` appelle
  `_matiere_dannee_ou_422` avant toute écriture) mais **le plancher a toujours son trou** :
  16 des 17 consommateurs laissent tomber un chapitre orphelin **en silence** ;
- **`review_queue` est le seul module du dépôt qui le traite correctement**
  (`review_queue/service.py:81-117` : `outerjoin` + `or_(rattaché, chapitre orphelin dont le
  thème appartient à une matière de l'année)` + `COALESCE` sur `subject_id`). **C'est le patron
  à reprendre** le jour où ce trou sera bouché — pas dans ce chantier.

Cela **renforce** le rejet de la piste (a) : fabriquer des chapitres pour les niveaux antérieurs
ajouterait de la population à une classe d'objets que le dépôt sait déjà mal lire.

## Alternatives considérées

### (a) Leçon de rattrapage dans un chapitre synthétique — écartée

Un chapitre par (matière, niveau antérieur), créé à la demande, portant une leçon.

**Coût réel :** à cause du constat 5, ce chapitre doit être rattaché à une `SchoolYearSubject` de
**l'année active** et marqué `validated`. On fabrique donc un chapitre de 5e dans l'année de 4e.
Il devient alors visible de tout ce qui lit les chapitres de l'année — galaxie, `/cours` élève,
matrice de couverture, `generate-progression`, `has_referentiel` — et il faudrait l'exclure
**partout**, un consommateur à la fois, chaque oubli étant silencieux.

C'est exactement la classe de défaut (« un chapitre hors programme d'année ») que l'addendum
ADR-0034 a fermée. La rouvrir volontairement pour un cas de rattrapage est un mauvais échange —
et le constat 8 montre que le dépôt lit encore mal cette classe d'objets **partout sauf un module**.

**Aggravation supplémentaire :** deux définitions de `has_referentiel` coexistent —
`dashboard/service.py:302-303` compte des **chapitres**, `progress/analysis.py:250` compte des
**leçons**. Cette piste ferait bouger les deux ; la piste retenue n'en bouge aucun.

### (b) `Lesson.chapter_id` nullable — écartée

Une leçon flottante, rattachée à la notion seule via `lesson_skills`.

**Coût réel :** une migration (la colonne est `NOT NULL`), **plus** la réécriture du périmètre de
`lessons_by_skill` — c'est-à-dire de la réponse unique gelée par l'ADR-0037, dont l'INNER JOIN sur
`Chapter` porte précisément « année active + chapitre validé ». Une leçon flottante n'a ni année ni
chapitre : la faire traverser ce résolveur veut dire en changer le contrat **pour tout le monde**,
au bénéfice d'un cas marginal. C'est la piste qui touche le plus de choses gelées.

### (c) Quiz ancré sur la notion — **retenue**

Voir Décision.

### (d) Ne rien faire, et fermer la porte en amont — écartée

Interdire au diagnostic et au Conseil de viser une notion orpheline. Cohérent, et moins cher.
Mais cela transforme une lacune réelle en lacune **non mesurable** : Massimo a bien un trou de 5e,
et le produit choisirait de ne pas le voir. Le rattrapage est la raison d'être de l'ADR-0010 ;
le neutraliser pour éviter un chantier serait renoncer au besoin d'origine.

## Décision

### 1. Quand aucune leçon ne porte la notion, le quiz s'ancre sur la NOTION

Le moteur ADR-0014 reçoit une seconde voie d'entrée, **notion-centrée**. Elle produit un `Quiz`
avec `lesson_id = NULL`, `subject_id` pris sur la `Skill`, et des questions attribuées par
`quiz_questions.skill_id` — colonnes qui existent toutes (constat 4). **Aucune migration.**

Le contexte vient de `resolve_canonical_context`, **sans modification** : il dégrade déjà.

### 2. Cette voie est un DERNIER RECOURS, jamais un doublon

La voie notion-centrée ne s'ouvre que si `lesson_resolution.lessons_of_skill` rend une liste
**vide**. Si une leçon existe — même en brouillon — c'est la voie leçon qui s'applique, inchangée.

> Sans cette règle, deux chemins pourraient produire le quiz d'une même notion et l'ADR-0037
> serait rouvert par la bande. C'est l'invariant central de cette décision, et il porte son
> test-verrou.

### 3. Le plancher de preuve : pas de source, pas de quiz

Un quiz sans cours se construit sur le RAG. Si `resolve_canonical_context` ne rend **aucun chunk**,
on **refuse, avant tout appel au modèle**, et on le dit.

Motif : un quiz bâti sur la seule connaissance du modèle serait servi à Massimo comme une mesure
de sa maîtrise, sans qu'aucune source du dépôt ne l'ancre. L'auto-vérification à l'aveugle de
l'ADR-0014 contrôle la cohérence d'une question, pas sa pertinence au programme.

Le refus est un **blocage journalisé**, avec son motif propre, distinct de `BLOCKED_NO_LESSON` —
et rendu **avant le clic**, conformément à l'ADR-0036 §2.

### 4. Les quatre autres portes s'ouvrent pour ce cas, et pour lui seul

- `runner.blockers_for` — `BLOCKED_NO_LESSON` cesse d'être absolu **pour la pièce `quiz`**. Les
  quatre autres pièces restent bloquées : elles sont leçon-centrées par nature, et rien dans cet
  ADR ne prétend écrire un cours sans chapitre.
- `equipment` — le retour anticipé s'assouplit pour `quiz`, **sur les deux chemins**
  (`equip_notion` et `equip_piece` : la double écriture est une dette connue, non traitée ici).
- `equipment._has_mission_quiz` — doit voir les quiz notion-ancrés, sinon le prédicat
  « déjà produite » ne se déclencherait jamais et le lot régénérerait à chaque passage.
- `missions._resolve_mission_quiz_ids` — doit résoudre **aussi** par `quiz_questions.skill_id`.

### 5. `orphan_notions` cesse de filtrer par niveau

Produire pour une notion que Papa ne peut voir nulle part serait le défaut que l'ADR-0037 nomme :
*« du temps GPU payé, du contenu validé, et invisible »*. Le filtre `Skill.level == year.level`
tombe ; les notions de niveau antérieur apparaissent, **avec leur niveau affiché** pour qu'on ne
les confonde pas avec le programme de l'année.

### 6. Ce qui ne change pas

- **Le gate du cours canonique** (ADR-0011 §1) — intact. Aucun dérivé ne reçoit un cours non
  validé. Cet ADR ne touche pas au premier cran de la cascade, il utilise le deuxième.
- **`lesson_resolution`** (ADR-0037) — pas une ligne. Il reste la réponse unique ; cet ADR
  s'appuie sur sa réponse « vide » sans la redéfinir.
- **`plan(scope)`** — reste pur et leçon-centré.
- **`validated_by`** — seul vocabulaire d'autorité. Le quiz reste tamponné `system`, comme tout
  quiz (ADR-0014 §2, valeur strictement réservée à ce cas).
- **Aucune fabrication de chapitre ou de leçon à la volée** — l'interdit de l'ADR-0021 décision 3
  tient.

## Périmètre

**Dans le périmètre :** les cinq points de la Décision, leurs tests, et la réécriture délibérée des
tests qui épinglaient l'omission.

**Hors périmètre, explicitement :**

- le module `diagnostics` et sa refonte T0 / T_n ;
- le routage des mesures par `Skill.level` ;
- l'ouverture de `trigger='evidence'` ou `trigger='council'` ;
- la divergence `Gap.subject_id` / `Skill.subject_id` ;
- toute modification du modèle `Gap` ;
- la double écriture `equip_notion` / `equip_piece` (dette consignée au `BACKLOG.md`) ;
- les quatre autres pièces du kit — fiche, SRS, mindmap et cours restent leçon-centrées.

## Conséquences

### Positives

- La chaîne s'ouvre : une notion de niveau antérieur peut porter une mission de remédiation
  **complète**, et son verdict `acquired` redevient atteignable. La lacune peut se fermer.
- Zéro migration, zéro table, zéro colonne.
- Le « Lot 2 » que l'ADR-0017 §4 reportait est soldé sur son seul cas réellement bloquant.
- Les notions orphelines de niveau antérieur deviennent **visibles** de Papa.

### Négatives / coûts assumés

- **C'est un changement de comportement, pas un refactor.** Environ sept tests épinglaient
  l'omission de l'étape quiz — dont `test_une_notion_sans_lecon_reste_bloquee_a_tous_les_paliers`,
  qui énonce la doctrine inverse (*« ce n'est pas un gate, c'est une absence de support »*). Ils
  sont réécrits **délibérément**, et cet ADR est la trace qui empêchera de lire plus tard une
  régression masquée.
- Un quiz de rattrapage mesure un acquis ancien à partir du RAG, pas d'un cours que Massimo a lu.
  C'est un écart pédagogique réel, borné par le plancher du point 3.
- Une notion orpheline **sans source RAG** reste bloquée. C'est voulu, et désormais **dit**.
- Le moteur quiz porte maintenant deux voies d'entrée. La règle du point 2 les rend exclusives,
  mais c'est une surface de divergence de plus à surveiller.

## Le signal qui dirait qu'on s'est trompé

- **Un quiz notion-ancré apparaît sur une notion qui a une leçon.** La règle du point 2 aurait
  cédé, et l'ADR-0037 serait rouvert par la bande. C'est le test-verrou.
- **Papa relit un quiz de rattrapage et le trouve hors sujet.** Le plancher RAG serait insuffisant :
  la matière a des sources validées, mais pas *sur cette notion*. La réponse serait de resserrer le
  plancher (exiger une pertinence minimale, pas une simple existence), pas de reculer.
- **Les notions de niveau antérieur envahissent la page Programme** au point qu'on ne distingue
  plus le programme de l'année. Le point 5 aurait été trop large ; il faudrait un repli visuel
  (section séparée), pas un retour au filtre.
- **Le journal se remplit du nouveau motif de blocage.** Cela voudrait dire que le RAG est vide là
  où le rattrapage est demandé — le vrai chantier serait alors l'ingestion des sources de 5e,
  pas la production.
- **Une mission de remédiation reste à 2 étapes** sur une notion orpheline pourvue en RAG. La
  porte 4 aurait été manquée : c'est l'échec que le critère de réussite rend visible.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; les dettes non traitées dans `BACKLOG.md` ;
  `DATA_MODEL.md` / `API_SPEC.md` si un contrat bouge.
  Deux lignes de doc **fausses** ont été trouvées au passage et partent au `BACKLOG.md` :
  `DATA_MODEL.md:168` annonce un `prerequisite_skill_ids optional` sur `Skill` — la colonne
  n'existe pas, et cette ligne est la source de la croyance ; `API_SPEC.md:1214-1215` affirme que
  `has_referentiel` de `/progress/analysis` est « **la même** » définition que celle du dashboard —
  c'est faux, l'un compte des leçons et l'autre des chapitres.
- **Branche** : `feat/notion-orpheline-equipable`, créée après le commit de cet ADR sur `main`.
- **Tests exigés** : le test-verrou du point 2 ; un test qui exerce le critère de réussite (notion
  de niveau antérieur → étape quiz présente dans une mission de remédiation) ; un test du plancher
  RAG ; la contre-épreuve (une notion avec leçon se comporte **exactement** comme avant, sans
  qu'aucun test existant ne soit retouché).
  ⚠️ `FakeEmbeddingProvider` n'est pas déterministe : tout test de non-résolution serait flaky à
  ~50 %. Utiliser un embedder crc32.
- **Preuve réelle** : le cas visé n'existe pas en base de dev (constat 7). La vérification créera
  **une** notion de niveau 5e par le vrai chemin ADR-0010 (`confirm_skills_backfill`, sans appel
  LLM), en **Anglais** — seule matière dont le RAG porte des chunks `validated`, donc la seule où
  le plancher du point 3 est franchissable aujourd'hui. Inventaire objet par objet après coup.
- **Prochain chantier annoncé** : la refonte du diagnostic (T0 sur les prérequis, sonde T_n dans
  les missions), dont cet ADR est le prérequis. Il ne commence pas ici.

## ⚠️ Corrections à l'exécution — décision inchangée (2026-08-07)

Le chantier a été exécuté le jour même. **Aucune des cinq décisions n'a bougé.** Ce qui suit
corrige trois énoncés de cet ADR que l'exécution a démentis — ils sont laissés en place au-dessus,
et corrigés ici plutôt que réécrits : une estimation fausse qu'on efface ne se relit pas.

### 1. « Environ sept tests » → **un seul**

Le § Conséquences annonçait « environ sept tests épinglaient l'omission ». **La mesure dit 1** :
`test_equip_notion_skips_when_no_lesson`, devenu
`test_equip_notion_sans_lecon_saute_les_quatre_pieces_lecon_centrees`.

Motif de l'écart, et il vaut d'être su : les tests de `missions` ne bougent pas **parce que le
builder d'étapes RÉUTILISE et ne génère pas**. `_recall_steps` n'a jamais produit de quiz ; il
n'en cherche un que s'il existe déjà. Ouvrir la production ne change donc rien à leurs fixtures,
qui n'ont pas de quiz. J'avais compté comme « à réécrire » tout test qui *mentionne* l'omission,
au lieu de ceux qui la *contraignent*.

⚠️ Et `test_une_notion_sans_lecon_reste_bloquee_a_tous_les_paliers`, que le § Conséquences citait
comme le verrou doctrinal frontal, **passe inchangé** : il appelle `select_notions` sans `piece`,
donc au grain du kit — où une notion orpheline reste bel et bien bloquée. Sa doctrine n'est pas
contredite, elle est **précisée**.

### 2. Le verrou lexical de l'ordre des pièces a été gardé INTACT

Non prévu par cet ADR. `test_equip_notion_signale_ses_pieces_dans_l_ordre_de_PIECES` lit
**lexicalement** la source d'`equip_notion` : un sixième signal de position dans la branche
orpheline l'aurait fait rougir sur un chemin qui, lui, ne recule pas. Le rappel est donc émis
depuis le helper `_quiz_ancre_notion`, et le verrou n'a pas été touché.

### 3. La preuve réelle a été faite en **Mathématiques**, pas en Anglais

Le § Suivi la programmait « en Anglais — seule matière dont le RAG porte des chunks `validated` ».
Exact, et **inexploitable** : ces 4 chunks sont une transcription YouTube de Rick Astley (données
de test ZETIS Clip). Un quiz de rattrapage de 5e bâti dessus aurait été auto-validé (`system`) et
atteignable par Massimo.

Arbitrage du commanditaire : valider **un** document de maths réel (`RagDocument 3`, « Comprendre
les fractions », 19 chunks — geste Papa, réversible) et faire la preuve là. Empreinte d'un cran
au-delà de ce que le §10 du prompt bornait, assumée et annoncée avant.

> **Ce que cela démontre du point 3 de la Décision** : sans le plancher de preuve, ce chantier
> aurait servi du charabia. Le plancher n'est pas une prudence théorique — il a mordu au premier
> essai réel.

### 4. Contradiction interne du § Suivi, tranchée

Le § Suivi exigeait la contre-épreuve « **sans qu'aucun test existant ne soit retouché** », ce que
le § Conséquences contredisait dans le même document (il annonçait des réécritures délibérées).
**C'est le § Conséquences qui fait foi.** La formulation juste : *aucun test existant ne doit être
retouché **pour faire passer** le chantier* — un test réécrit doit l'être parce que son intention
a changé, et le dire.

### 5. Un défaut trouvé par l'exécution réelle, et par elle seule

La base de dev porte un `Quiz` de type `mission`, `status='draft'`, **`lesson_id IS NULL`**, hérité
d'un vieux jeu de données, dont les questions visent une notion qui, elle, **a** une leçon.

Le point 4 de la Décision demandait à `_has_mission_quiz` de « voir les quiz notion-ancrés ».
Appliqué **sans condition**, ce quiz-là répondait « déjà produit » sur le chemin **NORMAL** :
`equip_notion` aurait cessé de générer le quiz d'une notion parfaitement équipable, **en silence,
sur toute la base existante**.

Correction — l'ancrage notion n'est consulté **que si `lessons_of_skill` est vide**, ce qui aligne
le prédicat sur la règle du point 2 (dernier recours). Verrouillé par
`test_un_quiz_sans_lecon_egare_ne_fait_pas_croire_la_notion_deja_equipee`.

⚠️ **La contre-épreuve du § Suivi ne pouvait pas le voir** : sa fixture n'a aucun quiz sans leçon.
C'est l'argument le plus net en faveur de l'exécution réelle imposée par le §10 — sans elle, ce
défaut partait en PR.

### 6. Découverte annexe — un chemin de test jamais exercé

Aucun test du dépôt n'avait jamais servi un chunk RAG `validated` **avec embedding** : le chemin
« il Y A des sources » n'était exercé nulle part, seule la branche « aucune source » l'était.
Sur SQLite, l'opérateur pgvector `<=>` est une erreur de syntaxe — d'où une fixture qui remplace
**`search` seul** (une capacité du moteur de base), en gardant réels `has_retrievable_chunks` et
`retrieve_for_skill`, qui portent la logique.
