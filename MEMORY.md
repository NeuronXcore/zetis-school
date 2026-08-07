# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier : « la notion orpheline devient équipable » (ADR-0042). COMPLET, ✅ MERGÉ SUR `main`
(2026-08-07). Ne pas ré-implémenter.**

🔴 **LA BRANCHE `feat/notion-orpheline-equipable` EST CONSERVÉE — NE PAS LA SUPPRIMER.** Consigne
explicite du user : **la prochaine session porte sur le DESIGN et le MOCKUP de la page
Diagnostic**, et cette branche lui sert de point de départ. C'est une **exception assumée** à
l'étape 4bis du `docs/WORKFLOW.md §5`, qui fait normalement supprimer la branche locale et
distante. Vérifié après merge : **présente en local ET sur `origin`**
(`delete_branch_on_merge: false` sur le dépôt, donc aucun risque de suppression automatique).

| | |
|---|---|
| **Mergé** | PR [#98](https://github.com/NeuronXcore/zetis-school/pull/98), **squash `94ca955`**, base `4e2b1f7`. Branche **CONSERVÉE** |
| **État git** | `main` = `origin/main` = `94ca955` — **rien à pousser**. Quatre commits sur `main` en tout : ADR (`0ef20af`), corrections (`f0fed31`), Accepté (`4e2b1f7`), squash (`94ca955`) |
| **Décision** | ADR-0042 **Accepté** — figé avant le merge, le statut porte lui-même « Accepté ≠ livré » |
| **Migrations** | **AUCUNE.** `quizzes.lesson_id`/`chapter_id` étaient déjà nullables et `quiz_questions.skill_id` portait déjà l'attribution |
| **Suites** | Backend **1005 ✅** (999 avant, +6) · Papa `tsc -b` **EXIT=0** + build ✅ · Massimo non touché |
| **Vérifié à l'écran** | page Programme (la notion de 5e apparaît **avec son niveau**) et page Missions (`❓→💡→🎙`, trois étapes) |
| **Vérifié en réel** | §10 joué de bout en bout sur la base de dev — inventaire ci-dessous |

### FAIT — le trou structurel est bouché

Une `Skill` sans `Lesson` est un état produit NORMAL (contrat ADR-0010). Pour elle la chaîne était
fermée : pas de leçon → pas de cours → pas de quiz → étape quiz **omise** → `acquired`
**arithmétiquement** inatteignable → `review_later` → lacune `in_progress` → `generate_remediation`
ne lit que `open` → **plus jamais de remédiation**. Et le relais SRS repassait par le **même**
`_recall_steps` : la notion était piégée à vie.

**Décision retenue** : quand aucune leçon ne porte la notion, **le quiz s'ancre sur la NOTION**
(`lesson_id=NULL`, `subject_id` pris sur la `Skill`, questions attribuées par
`quiz_questions.skill_id`). Cinq points touchés : `quizzes.service` (voie neuve + plancher),
`production.runner` (le gate), `production.equipment` (les **deux** chemins),
`missions.service` (`_resolve_mission_quiz_ids`), `curriculum.service` (`orphan_notions`).

### 🔴 Le constat qui a retourné l'arbitrage

Le cadrage annonçait que desserrer le verrou quiz « contredit frontalement le gate ADR-0011 ».
**C'est faux, et c'est ce qui a décidé du chantier.** Le gate interdit de recevoir un cours
**NON VALIDÉ** ; il n'interdit pas de travailler **SANS cours**. L'ADR-0011 §1 nomme lui-même la
cascade — *« cours validé → RAG seul → connaissance du modèle »* — et le précédent était déjà dans
le kit : `generate_cards_for_skill` est le seul des cinq générateurs sans garde 409, il dégrade en
`pending`. On n'a donc pas ouvert une porte, on a appliqué une doctrine à un sixième cas.

### 🔴 CINQ portes, pas une — et c'est la 4ᵉ qui décidait de tout

Le cadrage en supposait une (le moteur quiz). La porte qu'on oublie est
**`missions._resolve_mission_quiz_ids`**, qui joignait par `Quiz.lesson_id` : un quiz produit mais
introuvable d'ici aurait laissé l'étape omise. **Tout aurait été vert et rien n'aurait été
débloqué.** C'est exactement l'échec que le critère de réussite du prompt rendait visible — sans
lui, ce chantier se serait cru fini.

### ⚠️ Le comptage de chapitres que J'AI raté, en le cherchant

Mon premier relevé disait « 79 chapitres, tous rattachés à l'année ». **Faux** : la requête
joignait `chapters` à `school_year_subjects` en **INNER JOIN**, donc elle laissait tomber ce
qu'elle cherchait. Le compte juste est **80, dont 1 orphelin** (`id=10` « Les fractions »,
`validated`, 0 leçon — celui que l'addendum ADR-0034 signalait déjà). Le défaut se reproduit sur
quiconque écrit la requête évidente. **`review_queue/service.py:81-117` est le seul module du
dépôt qui le traite correctement** (`outerjoin` + `or_` + `COALESCE`) : c'est le patron à reprendre.

### ✅ Ce que la vérification RÉELLE a trouvé et que les tests n'avaient pas vu

L'exécution du §10 a révélé un **quasi-accident** que la contre-épreuve ne pouvait pas voir : la
base de dev porte un quiz `mission` **`draft`, `lesson_id IS NULL`**, hérité d'un vieux jeu de
données, dont les questions visent une notion qui, elle, **a** une leçon. Mon `_has_mission_quiz`
consultait l'ancrage notion **sans condition** → ce quiz-là répondait « déjà produit » sur le
chemin **NORMAL** : `equip_notion` aurait cessé de générer le quiz d'une notion parfaitement
équipable, **en silence, sur toute la base existante**.

Corrigé (l'ancrage notion n'est consulté que si `lessons_of_skill` est vide) et **verrouillé par
un test qui met la situation réelle dans la fixture**. Sans le §10, ce défaut partait en PR.

### ✅ Trois sabotages joués, trois rouges

Un test vert ne prouve rien tant qu'il n'a pas rougi sur commande (jurisprudence du dépôt).

| Sabotage | Test qui rougit |
|---|---|
| retirer la garde « dernier recours » | `test_verrou_le_quiz_de_notion_ne_double_jamais_la_voie_lecon` |
| retirer le plancher RAG | `test_sans_source_le_quiz_est_refuse_avant_tout_appel_au_modele` |
| rendre `_resolve_mission_quiz_ids` leçon-seule | `test_une_notion_de_niveau_anterieur_atteint_son_etape_quiz` |
| retirer le garde `lessons_of_skill` de `_has_mission_quiz` | `test_un_quiz_sans_lecon_egare_ne_fait_pas_croire_la_notion_deja_equipee` |

### ⚠️ UN SEUL test existant a été réécrit — pas sept

J'avais annoncé « ~7 tests à réécrire ». **La mesure dit 1.** `test_equip_notion_skips_when_no_lesson`
(devenu `..._sans_lecon_saute_les_quatre_pieces_lecon_centrees`) était le seul à épingler
l'omission de façon incompatible. Les tests missions ne bougent pas parce que le builder
**réutilise** toujours et ne génère pas. Et le verrou lexical
`test_equip_notion_signale_ses_pieces_dans_l_ordre_de_PIECES` a été gardé **intact** en émettant le
rappel de position depuis le helper plutôt que depuis `equip_notion`.
⚠️ Ce verrou est **lexical** : une simple mention de la forme appelée **dans un commentaire** le
fait rougir. Payé une fois.

### 🔬 §10 — inventaire de l'exécution réelle (2026-08-07, base de DEV)

Annoncé avant, joué une fois, une seule notion. Créé / modifié :

| Objet | État |
|---|---|
| ~~`RagDocument 3` « Comprendre les fractions »~~ | `pending` → `validated` (+ ses 19 chunks) le temps de la preuve, puis **REMIS EN `pending` le même jour** sur décision du user, via `rag.set_validation` — le RAG de dev est revenu **exactement** à son état d'avant le chantier |
| `Skill 436` « Les fractions » | level **`5e`**, subject 2, **aucune leçon** — créé par `confirm_skills_backfill` (**zéro appel LLM**) |
| `Quiz 54` « Quiz — Les fractions » | `lesson_id=None`, `chapter_id=None`, subject 2, `ready`, `validated_by=system`, **5 questions** toutes `skill_id=436` |
| `Gap 2` | `open`, sévérité `medium` |
| `Mission 56` « Renforcer : Les fractions » | `validation_status=pending` (**invisible de Massimo**, conforme) |
| `MissionStep 211/212/213` | **`quiz`(→54) · `eli5` · `vocal_explain`** — l'étape quiz est là |

⚠️ **Le choix de la matière a été REVU en cours d'exécution.** Le plan disait « Anglais », seule
matière à chunks `validated` — en allant les lire, ce sont **4 chunks d'une transcription YouTube
de Rick Astley** (données de test ZETIS Clip, cf. docs 3-8). Un quiz de rattrapage 5e bâti dessus
aurait été auto-validé et atteignable. Le user a tranché : valider **un** document Maths réel
(fractions) et faire la preuve là. **Sans le plancher RAG, ce chantier aurait servi du charabia.**

### ▶ PROCHAIN PAS

1. 🔴 **La relecture visuelle humaine N'A PAS EU LIEU** — merge sur instruction directe.
   **4ᵉ occurrence du motif**, après #79, #89 et #91. J'ai vérifié moi-même les deux écrans
   (Programme, Missions) et joué la chaîne en réel, mais **ce n'est pas la même chose** et la
   dette de vérification humaine reste ouverte sur ce chantier comme sur les trois précédents.
2. ~~Merger sans supprimer la branche~~ — **fait**, squash `94ca955`, branche vérifiée présente
   en local et sur `origin`.
3. ~~Décider du sort des artefacts de dev du §10~~ — **tranché** : le `RagDocument 3` est **remis
   en `pending`**, les quatre autres objets (`Skill 436`, `Quiz 54`, `Gap 2`, `Mission 56`) sont
   **conservés**. Ils restent cohérents entre eux — le quiz existant fait répondre « déjà produit »
   à `_has_mission_quiz`, donc rien ne cherchera à le régénérer malgré la source retirée.
   ⚠️ Ils constituent le **seul jeu de données « notion de niveau antérieur »** de la base : utile
   pour la session Diagnostic. Ordre de suppression si besoin, contraint par les FK :
   `MissionStep` → `Mission` → `Gap` → `QuizQuestion` → `Quiz` → `Skill`.
4. ~~Passer l'ADR-0042 en Accepté~~ — **fait** (`4e2b1f7` sur `main`), **avant le merge et non
   après** : la décision est figée, la livraison ne l'est pas. Le statut porte lui-même la
   distinction « Accepté ≠ livré », parce que l'ADR est sur `main` et pas le code.

### ▶▶ LE CHANTIER SUIVANT — déjà nommé par le user

**Design et MOCKUP de la page Diagnostic.** C'est la porte d'entrée de la refonte annoncée par le
cadrage de l'ADR-0042 (T0 sur les prérequis, sonde T_n dans les missions), dont **le présent
chantier était le prérequis** : une lacune ouverte sur une notion de niveau antérieur peut
désormais se refermer.

🔴 **LE T0 N'EST PAS FAIT, ET N'A PAS ÉTÉ ENTAMÉ.** C'était un **hors-périmètre explicite** de
l'ADR-0042 (§Périmètre : *« le module `diagnostics` et sa refonte T0 / T_n »*). Rien du module
`diagnostics` n'a été touché — ni la sélection des notions, ni le routage par `Skill.level`, ni la
notion même de T0. Ce chantier a rendu le T0 **possible**, il ne l'a pas commencé.

Ce qui manque au T0, et que le read-before-code a établi au passage :

- **`diagnostics/service.py` n'a aucune notion de prérequis.** Il sélectionne
  `select(Skill).where(Skill.subject_id == …)` plafonné à `MAX_SKILLS`, **sans filtre de leçon,
  sans ordre pédagogique, sans niveau**. Un T0 « sur les prérequis » suppose de savoir ce qui
  précède quoi.
- ⚠️ **Le graphe de prérequis N'EXISTE PAS.** `Skill.prerequisite_skill_ids` n'est ni une colonne
  ni une table (`DATA_MODEL.md:168` l'annonce à tort — dette au `BACKLOG.md`), et
  `parent_skill_id` est **NULL sur les 432 notions**. C'est le vrai obstacle du T0, et il est
  **pédagogique avant d'être technique** : il faut décider d'où vient l'ordre des prérequis.
- **`Skill.level` est le seul discriminant disponible** aujourd'hui (`missions/service.py`,
  branche rattrapage `Skill.level != year.level`). Il dit le niveau, pas la dépendance.

⚠️ **Rituel de décision du dépôt** (`CLAUDE.md`) : `mockup → spec → ADR → prompt`. La prochaine
session commence donc par le **mockup**, pas par du code. Ne pas partir sur `/ouverture` tant que
le mockup n'est pas validé — l'ADR n'existe pas encore.

Ce que le chantier ADR-0042 laisse en héritage utile pour celui-là :

- `diagnostics/service.py` sélectionne les notions **sans aucun filtre de leçon**
  (`select(Skill).where(Skill.subject_id == …)`) — c'est le chemin canonique par lequel une
  lacune s'ouvre sur une orpheline ;
- le **plancher de source** (ADR-0042 §3) est le patron à reprendre si le diagnostic doit refuser
  de mesurer ce qu'il ne peut pas ancrer ;
- `Skill.level` est le discriminant du rattrapage (`missions/service.py`, branche
  `Skill.level != year.level`) — **hors périmètre de l'ADR-0042, et central pour T0**.

### ⚠️ DETTES — où elles vivent

- **Celles de l'ADR-0042** ne sont pas ici : elles sont au **`BACKLOG.md`** (§ « Dettes nommées »),
  sept en tout — les trois du cadrage plus quatre trouvées en lisant, dont la plus sérieuse est le
  défaut latent **tête-de-liste contre parcours de liste** (`runner.py:300` et `equipment.py:65`
  prennent `lecons[0]` là où `canonical_context` parcourt toute la liste).
- **Celles du chantier précédent** sont plus bas, inchangées : **aucune n'a été traitée ici**, et
  les neuf vérifications dues sur `main` le restent.

---

<details>
<summary>Chantier précédent — « les engrenages et le dossier changent de dessin, pas de sens »
(PR #97, mergé le 2026-08-07)</summary>

**COMPLET, vérifié en production réelle par l'humain, ✅ MERGÉ SUR `main`. Ne pas ré-implémenter.**

| | |
|---|---|
| **Mergé** | PR [#97](https://github.com/NeuronXcore/zetis-school/pull/97), **squash `b463a0a`**, base `0ca1f57`. Branche `feat/animations-engrenages-dossier` **supprimée** (locale et distante, vérifié) |
| **État git** | `main` = `origin/main` — **rien à pousser**. Vérifié à la clôture 4bis |
| **Migrations** | **aucune.** Chantier frontend seul : aucun champ, aucune route, aucun contrat n'a bougé |
| **Suites** | Papa **656 ✅** · `tsc -b --force` **EXIT=0**. ⚠️ Backend **non relancé** : aucun fichier backend touché |
| **Vérifié à l'écran** | production, arrêt ambre, repos, pastille — puis **un vrai lot (47) confirmé par l'humain** |

### FAIT

Les `Rouages` et la `Boite` de la bande cèdent la place à `GearsSpinner` et `KnowledgeFolder`, deux
composants dessinés hors du dépôt (`docs/frontend-papa/mockup/`). La métaphore de l'ADR-0041 §682
ne bouge pas — les roues fabriquent à gauche, la pièce traverse, le dossier l'avale à droite — et
**tout le câblage d'état est conservé**. Seules changent la forme et les durées : **3 s / 2 s
inversé** au lieu de 3,6 s / 2,5 s, parce que 12 dents contre 8 donnent un rapport de 1,5.

`useBoiteRecoit` a été **retiré**, pas laissé en doublon : le dossier détecte lui-même l'incrément
de `pieces_produced`. La pile se remplit par **accumulation** (4 feuilles au plus) et non au prorata
du lot — le tapis et le compteur disaient déjà le pourcentage.

### 🔴 Trois défauts que les tests ne pouvaient pas voir

Ce chantier devait échanger deux dessins. Il a trouvé trois choses, **toutes à l'écran**, aucune
détectable par la suite de tests.

1. **`color: inherit` battait le ton Tailwind.** En Tailwind v4 les utilitaires vivent dans un
   `@layer` : une règle de classe écrite hors couche gagne à spécificité égale. Les engrenages
   restaient gris et **l'ambre de l'arrêt ne les atteignait plus** — le signal le plus lisible de
   l'écran (spec §138), perdu en silence.
2. **La pastille était invisible.** `background: currentColor` et `color:` sur la **même** règle :
   `currentColor` se résout après le `color` qu'on vient de poser. Fond et texte tombaient sur la
   même couleur sombre. Corrigé par deux `span`.
3. **Le dossier perdait les pièces déposées avant son montage** — signalé par l'humain, pas par moi.
   La bande repliée et la bande dépliée sont deux **branches de rendu distinctes** : le dossier est
   démonté puis **remonté** au premier sondage qui voit un lot, et il avalait tout ce qui précédait.
   Sur un lot court, c'est le lot entier.

### ✅ Le verrou qui manquait, et ce qu'il a démontré

Les **six** anciens tests `[data-tourne]` prouvaient que l'attribut est posé au bon moment ; **aucun
ne prouvait que la chose animée est dessous**. Le CSS fourni par la maquette animait en permanence :
branché tel quel, la bande aurait tourné à l'arrêt pendant que les six restaient verts. Démontré par
sabotage — les six sont restés verts pendant que le septième rougissait.

Le verrou du dossier a la meilleure forme possible : **rouge avant le correctif**
(`expected 0 to be greater than 0`), vert après.

### DÉCISIONS ACTIVES — à relire, pas à rouvrir

- **L'animation vit sous `[data-tourne]`, jamais sur la classe.** Le sélecteur EST le verrou.
- **Aucune règle de COULEUR sur les composants** : le ton vient de la bande. Deux sources de couleur
  pour un même état finissent toujours par diverger.
- **Les composants vivent dans `frontend-papa`, pas dans `packages/ui`** : un seul consommateur.
  Les y déplacer quand Massimo en voudra coûtera dix minutes.
- **Le mode `loop` du dossier est interdit dans la bande** — il est décoratif par construction.

### ⚠️ Pièges payés en vrai — voir `TROUBLESHOOTING.md`

Le plus coûteux, **repayé pour la deuxième session consécutive** : dans un onglet **caché**, Chrome
limite les minuteurs à ~1/minute. Mesuré cette fois : **0 appel en 14 s** là où il en faudrait 3.
Deux fausses pistes avant de penser à vérifier `document.visibilityState`.

Et `~/Downloads` est **interdit à ce processus** par macOS : `Read`, `head` et `cp` échouent tous,
sandbox désactivée comprise. Cinq voies essayées, cinq refus — c'est à l'humain de copier.

### ▶ PROCHAIN PAS

**Le chantier est clos.** Poussé, PR #97 mergée en squash, branche supprimée, étape 4bis faite.
Le prochain chantier part de `main` par `/ouverture`.

🔴 **Dix vérifications sont désormais dues sur `main`** — **trois** nées de ce chantier, **sept**
remontées. Le compte se recoupe ainsi : les listes ci-dessous portent 3 + 8 puces, dont deux ne sont
pas des vérifications (le flake `test_dashboard`, et la ligne du worker — **éteinte** en fin de
session), et une en vaut deux (`503` **et** rejeu transitoire).

⚠️ **Mise à jour du 2026-08-07, 17 h** : le scénario **`503` / Redis coupé est JOUÉ et conforme**
après quatre chantiers d'attente — il sort du compte. Restent donc **neuf** vérifications, dont le
**§10.2** (deux tentatives sur échec transitoire côté worker), qui est l'autre moitié de la dette et
demande de rendre Ollama injoignable. Le rejeu a par ailleurs ouvert **un nouveau front** : trois
travaux ont dormi 4 h 50 en file sous un worker actif.

⚠️ **Et la base de dev n'a plus aucun gisement de production** (cf. plus bas) : pour rejouer quoi
que ce soit qui produise, il faudra d'abord rédiger un cours sur une leçon `validated` mais vide.

</details>

### ⚠️ DETTES OUVERTES — nées du chantier « engrenages et dossier »

- ⚠️ **Je n'ai jamais vu de mes yeux le vol d'une page sur un lot RÉEL.** L'onglet que je pilote est
  resté `hidden` toute la session, donc étranglé. Le rendu a été vu sur **données forcées**, et le
  lot 47 (41 s, 3 pièces réelles) a été confirmé par l'humain — pas par moi.
- ⚠️ **`prefers-reduced-motion` n'a été vérifié qu'au niveau des RÈGLES** : le bloc vise bien
  `.zx-gears__a/__b` et `.zx-folder__*`, et plus aucun sélecteur périmé. Jamais appliqué.
- ⚠️ **Le `stopped` du dossier n'a pas été exercé** — seul celui des engrenages l'a été.
- ⚠️ **Données de dev** : **quatre** lots réellement produits (44, 46, 47, 48), **10 pièces neuves
  auto-validées** que Massimo verra — 1 carte (lot 44), une fiche + un quiz + une mindmap sur
  « Réalisme / Naturalisme » (lot 47, chapitre 45), et une fiche + un quiz + une mindmap + 4 cartes
  sur le chapitre 3 (lot 48, contrôle de la recette).
- ⚠️ **~~Après le lot 48, la base n'a plus aucun gisement~~ — FAUX depuis 17:00.** Le drainage du
  lot de contrôle 503 a réveillé, via `scan_triggers`, trois travaux de curriculum en sommeil
  depuis 12:06 : **6 leçons créées et 1 cours rédigé**. La leçon **141** (« Expressions littérales
  et vocabulaire », chapitre **11**) a donc un cours écrit et **zéro dérivé**.
  **La recette y annonce 7 pièces** — 3 dérivés + 4 cartes. C'est le gisement pour qui voudra
  revoir la production tourner.
- ⚠️ **Résidus du rejeu 503** : le lot de contrôle **50** (chapitre 21, `generated=0`), plus les
  **6 leçons et le cours** ci-dessus, produits par le drainage — du curriculum que Papa devra
  valider. Les 5 autres leçons créées ont un cours **vide**.
- 🔴 **Trois travaux sont restés `queued` pendant 4 h 50 alors qu'un worker tournait** (743-745,
  12:06 → exécutés à 16:59 au démarrage d'un worker neuf). Personne ne l'aurait su : rien à
  l'écran ne le disait. À creuser — c'est précisément ce que le §10.3 (« balayage des zombies »)
  existe pour empêcher.

### 🔁 DETTES REMONTÉES du chantier « popover en toutes lettres » (PR #96) à son élagage

> Ses trois premiers contrôles passaient — ADR-0041 §23 ✅, section `TROUBLESHOOTING.md` ✅,
> `CHANGELOG.md` 0.56.0 ✅. Le **quatrième** a rapporté ceci, revérifié avant remontée.

- ✅ **`503` / Redis coupé : JOUÉ ET CONFORME (2026-08-07).** Après quatre chantiers d'attente.
  Redis arrêté, `POST /production/runs` rend **503 en 36 ms** (pas 500, pas un blocage) avec la
  phrase attendue : « La file de production est injoignable : rien n'a été lancé, et rien n'a été
  créé. » Et surtout **aucune ligne commitée** — 27 lots et 744 `ai_jobs`, identiques à la
  référence. 🔴 **La preuve la plus nette est un TROU DANS LA SÉQUENCE** : l'id 49 a été alloué par
  la tentative puis annulé, la reprise a rendu 50. C'est exactement le §10.1 (« l'objet n'est pas
  commité avant que son enfilement soit acquis »). `/activity` reste honnête pendant la panne :
  `worker_alive: **false**`, pas `null`.
  **Rejeu au niveau API : conforme** — la même requête rend 202 en 79 ms dès Redis relancé.
- 🔴 **Le rejeu du §10.2 n'est PAS joué** — ne pas confondre avec le précédent. §10.2 exige **deux
  tentatives** sur échec **transitoire côté worker** (moteur injoignable, timeout) et **zéro** sur
  échec structurel. L'exercer suppose de rendre Ollama injoignable pendant qu'un travail tourne,
  donc de toucher un service de l'hôte. **C'est la moitié de la dette qui reste ouverte.**
- ⚠️ **Le chemin automatique complet d'un refus `already_produced` n'a pas été joué** —
  `scan_requests` est bloqué **avant** le régulateur par le gate de régime, donc ce refus n'est
  persistable qu'en mode autonome.
- ⚠️ **« en cours · couloir séparé, ne retarde rien » n'a pas été vu** — il aurait fallu un rendu
  vidéo en cours pendant l'observation.
- ⚠️ **« arrêté — plus rien ne l'exécute » n'a pas été vu** : c'est l'état `stale` d'une ligne,
  distinct de l'arrêt du worker.
- ⚠️ **Le tapis n'a été vu qu'en régime MESURÉ.** Le liseré qui balaie sur un travail unitaire long
  n'a jamais été observé en vrai.
- ⚠️ **L'empilement de trois travaux en file n'a jamais été exercé** (deux, oui).
- 🔴 **Deux tests de `test_dashboard.py` alternent au rouge selon l'heure** — pré-existants, sortis
  en tâche séparée, non corrigés.
- ✅ **Le worker de production est ARRÊTÉ** (2026-08-07, fin de session, vérifié : plus aucun
  processus). Il traînait allumé depuis deux chantiers. Pour le relancer :
  `cd apps/backend && .venv/bin/python -m app.production_worker` — ou `pnpm dev:worker`.
  ⚠️ Sans lui, un lot lancé depuis la Couverture reste `queued` **indéfiniment**, et la bande
  affichera « ZETIS ne produit pas · aucun moteur de production actif ». C'est le comportement
  juste, pas une panne.
- ✅ **Dette ÉTEINTE** : « les jetons qui traversent le tapis n'ont jamais été vus ». Vu cette
  session — jeton `mindmap` sur le tapis. ⚠️ Mais **sur données forcées**, pas sur un lot réel.

### 🔴 La base de dev est saturée — et voici comment trouver un lot qui produit VRAIMENT

Le piège « `eligible` ne veut pas dire *a du contenu à produire* » a coûté deux lots pour rien cette
session : le **46** (9 notions, 45 pièces) a rendu `generated=0 skipped=45` en **1 seconde**.

La recette est écrite **avec son SQL** dans `TROUBLESHOOTING.md`, et elle a été **validée par une
prédiction falsifiable** : 7 pièces annoncées sur le chapitre 3, **7 obtenues** (`fiche ×1`,
`mindmap ×1`, `quiz ×1`, `srs ×4`) en 58 s — puis 0 à la contre-épreuve.

🔴 **Ma première version était FAUSSE sur deux points**, et les deux se paient en lots gaspillés :
`cours`/`fiche`/`mindmap`/`quiz` sont **par leçon** (seul `srs` est par notion — le lot 47 avait
4 notions **sur une seule leçon**), et le cours doit être **écrit**, pas seulement `validated` —
une leçon validée mais vide ne dérive rien. Ce second point est le piège du 2026-08-04 (« 39 leçons
`validated` VIDES »), retombé dedans un an de chantiers plus tard.

⚠️ Et même là, les 5 événements d'une notion sont commités **ensemble** : `pieces_produced` monte
par paliers, donc les pages volent **en rafale** (3 au plus), jamais en continu.

### ▶ DETTES OUVERTES

> ⚠️ **Les trois premières sont REMONTÉES du chantier « carte mémoire à 4 vues » (PR #91) lors de
> son élagage (2026-08-06, clôture du Lot 0 ADR-0040)**, revérifiées avant remontée.

- 🔴 **Trois chantiers d'affilée mergés sans relecture visuelle HUMAINE** (#79, #89, #91), et le
  Lot 0 (#92) fait le quatrième — vu par l'agent, pas par le user. `WORKFLOW.md §5bis` demande
  l'œil humain avant la PR. Ce qui reste à regarder du #91 : les quatre vues, en particulier
  « Révisions » sur **30 j** et **Trimestre**.
- ⚠️ **La vue « Solde » n'a jamais été vue NON VIDE.** `skill_mastery_history` n'a que 4 lignes,
  toutes des entrées en `weak` — ni barres montantes, ni descendantes. ⚠️ **Le Lot 1 la nourrira**
  (`mastery_transitions` lit cette même table) : à regarder à ce moment-là.
- 🔴 **Aucun clic sur un titre focalisable n'a abouti depuis le panneau navigateur.** Les clics par
  `ref` y rendent des coordonnées **page**, hors de l'espace de clic (800 px), et échouent **en
  silence**. **Parade trouvée au Lot 0** : passer par `claude-in-chrome` (vrai Chrome, vraie
  session) — un clic réel y a abouti. Le panneau reste inutilisable pour ça.

> ⚠️ **Les quatre suivantes sont REMONTÉES du chantier « KPI À renforcer » (PR #90) lors de son
> élagage (2026-08-06, 4ᵉ contrôle).** Ses trois autres contrôles passaient — ADR
> `adr-0028-addendum-kpi-a-renforcer.md` ✅, `TROUBLESHOOTING.md` §`feat/kpi-a-renforcer` ✅,
> `CHANGELOG.md` 0.51.0 ✅ — mais ses « résidus » enterraient quatre constats **encore vrais**,
> revérifiés un par un à la clôture.

- ⚠️ **Deux incohérences pré-existantes de `.claude/launch.json`.** `massimo` (:5173) et `papa`
  (:5174) portent `autoPort: true` alors que le `cors_origins` **par défaut** du backend est
  exactement 5173/5174 — un glissement de port casserait le CORS **sans message clair**. Et
  `massimo-dev2` / `papa-srs` réclament tous deux le port **5177**. Signalé deux fois, jamais traité.
- ⚠️ **`KPI_ORDER` est un export MORT** (`dashboardDerive.ts:322`) — **revérifié le 2026-08-06** :
  lu par aucun fichier, son seul autre occurrence est une mention dans un commentaire d'ADR. Un
  `DashboardFocus[]` incomplet ne ferait bouger ni test ni compilateur.
- ⚠️ **Deux écarts pré-existants du dashboard.** Le delta de `consolidated` n'est **pas**
  `value - series[0]` (`reconstruct_series` filtre sur `> mark`, strict, alors que le delta compte
  `first <= d <= last` : une notion consolidée pile le premier jour est comptée d'un côté et pas de
  l'autre) ; et `open_gaps.delta` est **codé en dur à `0`** — revérifié, `service.py:993`.
- ⚠️ **`FRAGILE_STATUSES` n'est pas là où l'ADR-0028 §3 bis l'annonce.** Il est dans
  `dashboard/projections.py:42`, pas dans `progress/service.py` : la dépendance va de `progress`
  **vers** `dashboard`. Constat, pas correction — le déplacer est un refactor transverse.

> ⚠️ **Les cinq suivantes sont REMONTÉES du chantier « souffle, donut, créneaux » (PR #89) lors de
> son élagage (2026-08-05, 4ᵉ contrôle).** Ses trois autres contrôles passaient — section
> `TROUBLESHOOTING.md` présente, entrée `CHANGELOG.md` présente — mais **le premier a ÉCHOUÉ** : ce
> chantier n'a **aucun ADR**, et c'est la première de ces dettes.

- 🔴 **« Semaine en cours » n'est figée par AUCUN ADR.** Le chantier PR #89 est entré par quatre
  demandes directes, jamais par `/ouverture`. Les trois premières sont des raffinements de
  l'ADR-0028 §5/§6 et s'en accommodent ; **la quatrième non** — c'est une **surface nouvelle**, un
  troisième onglet que l'ADR-0028 ne décrit nulle part, aujourd'hui figé seulement dans
  `docs/frontend-papa/page-dashboard.md`. **Premier geste du prochain chantier dashboard** : un
  addendum qui la fige, ou son retrait si elle ne convainc pas à l'usage.
- 🔴 **Le souffle du focus n'a JAMAIS été vu en mouvement, et il est sur `main`.** Géométrie et
  intensité vérifiées sur captures figées ; le **rythme**, non — c'est exactement ce qu'une capture
  ne montre pas. Merge sur décision explicite du user, **arbitrage assumé** — mais la dette est
  passée d'« avant merge » à « sur `main` ». Même motif que le bandeau Massimo de la **PR #79, qui
  est toujours dû**. À juger à l'œil, sur les cinq KPI et sur une carte haute.
- 🔴 **`prefers-reduced-motion` n'a jamais été exercé.** La règle est livrée et bâtie comme les deux
  qui existent déjà dans `index.css`, mais elle n'a pas pu être émulée depuis le navigateur. Le
  seul comportement de ce chantier qui repose uniquement sur de la relecture de CSS.
  ✅ **La TECHNIQUE existe depuis le 2026-08-07** (addendum 2 ADR-0041) : forcer la media query en
  écrivant `regle.media.mediaText = 'all'` sur la `CSSMediaRule` trouvée dans `document.styleSheets`,
  photographier `getComputedStyle(...).animationName` avant/après, puis restaurer. La dette reste
  ouverte **pour le souffle du dashboard**, qui n'a pas été repassé — mais elle n'est plus bloquée.
- ⚠️ **La grille des créneaux n'a de données réelles que sur la fenêtre courte.** Sur `?period=365`
  les 56 cases sont vides (91 % du temps est « hors matière », le reste hors plage 8 h–24 h). Le
  rendu multicolore n'a été vu que sur la fenêtre par défaut.
- ⚠️ **Les trois vues du dashboard n'ont été vues qu'en desktop** — aucun contrôle responsive.

> ⚠️ **Les trois suivantes sont REMONTÉES du chantier « file de relecture » lors de son élagage
> (2026-08-05, 4ᵉ contrôle).** Elles étaient enterrées dans ses « résidus » et n'existaient nulle
> part ailleurs.

- ⚠️ **Aucun clic « Valider » / « Rejeter » de `/relecture` n'a été joué en vrai** — délibéré, ça
  aurait muté la base de dev. Le **retrait optimiste**, le **rattrapage d'erreur** et les **deux
  endpoints `/reject`** ne sont donc couverts que par des tests, jamais vus à l'écran. À exercer à
  la première occasion réelle.
- ⚠️ **`/relecture` n'a été vue qu'en desktop** — aucun contrôle responsive.
- ⚠️ **`docs/frontend-papa/page-dashboard.md` L124-125 décrit une implémentation qui n'existe pas** :
  un attribut `data-scope="temps regularite"` + un sélecteur `[data-scope~="<focus>"]`. Le code
  utilise `data-card` + la fonction JS `matchesFocus`. Le même paragraphe annonce `opacity: .32` là
  où le code pose `opacity-40`. Relevé le 2026-08-05 en travaillant juste à côté, **laissé hors
  périmètre**. (Doublon partiel d'une dette plus bas, qui la nommait déjà parmi quatre divergences
  doc↔code — celle-ci est la seule à survivre, les trois autres portent sur l'ADR-0028 §7.)

> ⚠️ **Les quatre suivantes sont nées du chantier « file de relecture » (2026-08-05).**

- ⚠️ **Le bandeau ambre de la Couverture et la file comptent deux populations différentes**, et c'est
  assumé : `totals.pending_count` ne voit que les dérivés `pending` **de la matrice** (1 en dev), la
  file couvre cinq familles dont deux qui n'y figurent pas (32). Le bouton ne porte donc **aucun
  chiffre**. **Déclencheur de réouverture** : si quelqu'un demande un jour pourquoi le bandeau dit
  « 1 » et la file « 32 », c'est que le libellé ne suffit plus — il faudra nommer les deux
  populations à l'écran, jamais inventer un troisième compteur.
- ⚠️ **Les quiz restent hors de la file de relecture** (`quizzes` n'a pas de `validation_status`,
  ADR-0014 §2). Les y faire entrer demande **une migration ET un changement de doctrine** — deux
  décisions, pas une. Verrouillé par test pour que l'absence se lise comme un choix.
- ⚠️ **Les objets `pending` hors année active ne sont plus comptés nulle part** (décision §3). Sur la
  base de dev, une leçon a disparu du compteur (27 → 26). **Aucune page ne les atteint** — c'était
  déjà vrai avant, la différence est qu'on ne les annonce plus. Une commande de rattrapage reste à
  écrire si des années archivées doivent un jour être relues.
- ⚠️ **`/relecture` n'offre aucun aperçu du contenu** : Papa doit sortir par « Voir → » pour lire
  avant de trancher. **Déclencheur de réouverture**, écrit dans l'ADR-0039 : Papa qui ouvre la file
  et la referme sans rien trancher. La réponse serait alors de rapprocher la lecture de la décision,
  **jamais** d'ajouter un « tout valider ».

> ⚠️ Les **six suivantes** sont nées du **2026-08-05 (la file de production)** ; suivent celles des

> ⚠️ Les **six premières** sont nées du **2026-08-05 (la file de production)** ; suivent celles des
> preuves + dépliage, de l'analyse par matière, de la vue à l'année, et du 2026-08-04.
>
> ✅ **Une dette éteinte** : « les lots #24-27 s'accumulent en file », qui était le signalement
> lui-même — file vidée, cause corrigée, garde posée.
>
> ⚠️ **Une dette que j'ai CRU éteindre et qui ne l'est pas.** J'avais écrit ici que les jobs RQ
> fantômes du 2026-08-04 étaient purgés : **c'est faux, vérifié à la clôture** — `FailedJobRegistry`
> en contient toujours **21**. Seuls les 3 jobs en double des lots #25/26/27 ont été supprimés, et
> ce sont deux choses différentes. La dette d'origine reste plus bas, intacte.

- ⚠️ **Le chantier n'est pas passé par `/ouverture`** : entré par un signalement de bug, la branche
  a été créée **après coup**, au moment de committer. Éteint par le merge — mentionné parce que le
  travail a existé plusieurs heures en non-commité sur `main`, et que c'est le genre de fenêtre
  qu'un `git checkout` malheureux referme mal.
- ⚠️ **Le découpage en trois commits a révélé un couplage que l'état final cachait** :
  `useRunProgress` déclarait `started_at` dans son type alors que le premier commit ne s'en sert
  pas. Seul `tsc` lancé sur l'état du commit isolé l'a vu. **Vérifier chaque commit sur son propre
  état, pas seulement la branche entière** — c'est la parade, et elle ne coûte qu'un `git stash
  push -- <chemins>`.
- ⚠️ **L'ADR de ce chantier est écrit APRÈS son code** — dette éteinte, mais l'ordre reste un écart.
  `adr-0036-addendum-file-sans-consommateur.md` fige cinq règles déjà livrées ; il n'a donc jamais pu
  **infléchir** la conception, seulement la constater. C'est exactement ce que le rituel
  `mockup → spec → ADR → prompt` existe pour éviter, et le document le dit dans son propre Statut.
  ⚠️ **Ne pas en faire un précédent** : ça a marché ici parce que le chantier était petit et
  entièrement mesuré. Sur un chantier de conception, un ADR écrit après le code n'est plus une
  décision — c'est une justification.
- ✅ **Écrire l'addendum a révélé que tout son §1 était SANS VERROU côté écran** — le verbe, l'ambre,
  le point qui cesse de battre : vrais à l'écran, tenus par rien. `PapaLayout.test.tsx` a gagné deux
  tests (l'arrêt **et** sa contre-épreuve worker présent), sabotés séparément. ⚠️ Le cœur en est
  l'assertion sur l'**animation** : le texte se relit, un `className` conditionnel se « simplifie »
  en silence — et c'est le point qu'on regarde avant la phrase.
  > **Écrire l'ADR après le code a donc servi à quelque chose de précis** : formuler une règle
  > oblige à chercher ce qui la tient, et c'est là qu'on voit que rien ne la tient.
- ⚠️ **Aucun lot n'a été vu TOURNER pour de vrai.** Les quatre écrans vérifiés le sont sur des lots
  `queued` (dont deux lots témoins créés puis supprimés). Le seul lot exécuté de la session (#28) a
  duré **76 ms** — trop court pour observer quoi que ce soit. Donc : la **barre mesurée**, la
  **reprise du pourcentage après navigation** et la **modale de production** n'ont été prouvées que
  par les tests, jamais à l'œil. À rejouer sur une notion **sans** contenu, en connaissance du coût
  (génération LLM réelle).
- ⚠️ **`piece_deja_produite` ne connaît pas la fraîcheur.** Elle répond « ça existe », jamais « ça
  existe mais le cours a changé depuis ». La Couverture, elle, sait dire *périmé*
  (`content_updated_at`). Une fiche périmée sera donc **refusée** comme un doublon. Ce n'est pas
  faux aujourd'hui — la régénération passe par la page de la pièce, pas par un lot — mais si un jour
  « reproduire ce qui est périmé » devient un geste de la page Demandes, c'est ici qu'il bloquera.
- ⚠️ **Le worker de dev a été laissé TOURNANT** (`nohup … app.production_worker`, log dans
  `/tmp/zetis-worker.log`). Il survivra à la fermeture de ce panneau. ⚠️ Il tourne sur le code **non
  commité** : un `git stash` le laisserait exécuter un autre code que celui du dépôt.
- ⚠️ **Le `worker_alive` n'a jamais été testé avec un vrai Redis dans la suite** — impossible par
  construction (`file_rq_factice` lève sur toute connexion). Les verrous vérifient que la route
  **pose la question** au bon moment, pas ce que Redis répond. La réponse, elle, a été vérifiée à la
  main sur la vraie file (`Worker.all()` = `[]` pendant que `count()` = 1).

- ⚠️ **DEUX définitions de `has_referentiel` coexistent** : `dashboard._referentiel_subjects` (≥ 1
  **chapitre** dans l'année active) et `progress.analysis._referentiel` (≥ 1 **leçon**, via
  `coverage()`). Progression utilise la première — celle du constat qui pointe vers elle. L'écart
  n'est **pas résolu**, et rien ne le borne aujourd'hui.
- ⚠️ **`XPEvent` n'a pas de `skill_id`**, donc le XP ne peut pas se détailler par notion. Décidé,
  écrit dans l'ADR et **affiché à l'écran** (« réparti par activité »). Le lever exige une migration
  — et d'abord d'établir que quelqu'un se pose la question.
- ⚠️ **`XPEvent` est un import MORT dans `activity/service.py:24`** — une seule occurrence dans tout
  le fichier, l'import lui-même. Vestige d'une lecture retirée. Signalé, hors périmètre, non traité.
- ⚠️ **Le contraste du filtre `/lacunes` n'a pas pu être vu en vrai** : la base de dev ne porte
  **qu'une seule lacune ouverte** (Français — Temps du récit, déjà couverte). Filtrer sur Français
  y donne le même écran que « toutes ». Le comportement est verrouillé par 6 tests et par le cas
  `?subject=klingon` joué en vrai, **mais le contraste entre deux matières n'a jamais été observé**.
  Idem pour la mention « · toutes matières » des boutons : aucune section « découvertes » n'existe
  dans ces données.
- ⚠️ **Serveurs de dev debout à la clôture du 2026-08-05** — vérifié par `lsof` : backend `:8001`,
  Papa `:5175`, Massimo `:5176`. ⚠️ Ils ont été **lancés par une AUTRE session**, pas par celle-ci :
  `preview_start` a refusé les deux ports, et la vérification à l'écran s'est faite sur eux. Ils
  survivront donc à la fermeture de ce panneau-ci.
- ⚠️ **Aucune action du dépliage n'a été DÉCLENCHÉE en vrai.** « Créer une mission » et « Équiper »
  sont testés (7 verrous, dont la confirmation obligatoire) et leurs routes préexistent — mais
  aucune n'a été cliquée jusqu'au bout sur la base de dev, volontairement : `equip-notion` génère et
  auto-valide un kit entier. **À jouer une fois, en connaissance du coût.**

- ✅ **La dette « migration appliquée en DEV seulement » est SOLDÉE (2026-08-07).** Elle traînait
  sur `f7a8b9c0d1e2` et sur une dizaine d'autres. La base **prod-like** (`zetis-prod_postgres_data`)
  était restée à `e1f2a3b4c5d6`, soit **32 migrations de retard** — arrêtée au 4 juillet, alors que
  `main` avait avancé d'une dizaine de chantiers. `alembic upgrade head` l'a portée à
  `e7f8a9b0c1d2` : **403 colonnes et tous les index identiques au dev**, données intactes
  (476 notions, 119 leçons, 111 `ai_jobs`). Sauvegarde préalable dans `~/zetis-backups/`.
  ⚠️ `f7a8b9c0d1e2` reste **non exercée par un test** — c'est l'autre moitié de la dette, elle,
  toujours ouverte.
  ⚠️ **Le postgres prod ne publie AUCUN port** (`docker-compose.prod.yml`) : c'est ce qui permet de
  le démarrer seul, sans bousculer le dev qui occupe 5432. Pour y lancer alembic depuis l'hôte, le
  publier temporairement via un fichier d'override (`ports: ["5433:5432"]`) — le volume nommé
  survit à la recréation du conteneur. **Discriminant obligatoire avant tout `upgrade`** :
  `alembic current` doit répondre la révision de la PROD, jamais celle du dev.
- ⚠️ **`Gap.subject_id` et `Skill.subject_id` peuvent diverger.** Le dashboard, `/lacunes` et le
  panneau attribuent par la colonne du `Gap` ; le Conseil groupe par la matière de la NOTION.
  L'écriture ne les contraint pas (`diagnostics` écrit `subject_id=quiz.subject_id`). L'écart est
  **borné par un test**, pas résolu.
- ⚠️ **Le Conseil n'a aucun identifiant de run** : aucun sondage possible, rien ne peut signaler
  ailleurs qu'une synthèse est en cours. La phrase de la confirmation (« tu peux quitter cette
  page ») REMPLACE un dispositif absent. **Déclencheur de réouverture** : le jour où une génération
  ciblée est lancée puis oubliée, il faudra un `ProductionRun` pour le Conseil.

- ⚠️ **Dette PARTIELLEMENT payée le 2026-08-05, session connectée.** La PR #82 avait été mergée
  sans que rien n'ait été vu à l'écran. Depuis : les **pictogrammes**, l'**échelle ajustée** et le
  **désentassement** ont été vérifiés en vrai (et c'est ce qui a révélé que le désentassement ne
  marchait pas — cf. défauts). **Reste dû** : le champ Période sur `/conseil?period=365`, qui doit
  afficher « Année scolaire » — jamais ouvert.
- ⚠️ **L'échelle adaptative ne sépare pas des matières à EXACTEMENT 0 %.** Au 2026-08-05, 4 des 5
  matières tracées y sont (1 notion consolidée sur 280) : elles restent sur la même ligne. C'est la
  donnée, pas le cadrage. Le seul vrai remède serait de changer ce que Y mesure — notions
  *engagées* (0 → 10,4 %) plutôt que *consolidées* — **écarté par le user**, ce serait un autre sens
  de carte et un addendum d'ADR.
- ⚠️ **Quatre divergences doc↔code relevées et NON corrigées** (hors périmètre du lot) :
  `page-dashboard.md` parle de `data-scope`, l'attribut réel est **`data-card`** ; ADR-0028 §7
  affirme que `ConseilClasseIAPage` **ne lit aucun query param** (périmé, elle les lit) ; le même §7
  annonce une régénération **destructive avec `ConfirmDialog`** (jamais implémentée — la génération
  *empile*, elle n'écrase rien) et un **état vide local** si la matière manque au rapport (non
  implémenté). ⚠️ Et surtout : **le `period` transmis au Conseil ne sélectionne AUCUNE donnée**
  (`reports/service.py` : « v1 : état courant, pas de fenêtre temporelle ») alors que l'ADR justifie
  son transport par l'inverse. À trancher — soit le CTA cesse de le passer, soit la doc dit que
  c'est un simple libellé.
- 🔴 **Deux des cinq vérifications à l'écran n'ont PAS pu être jouées, faute de données** — et rien
  ne les rejouera tout seul :
  - **le tri par mode dans les deux sens** : la base de dev ne porte que 2 lots *Autonom* et 7
    « régime inconnu ». Aucun *Manual*, aucun *Hybrid* → croissant et décroissant rendent la même
    chose. Le comportement est verrouillé par un test unitaire, **il n'a pas été vu** ;
  - **la pagination** : 9 lots pour une page de 20, donc `has_more` est faux et le bouton n'apparaît
    jamais. À rejouer **dès qu'il y aura 21 lots**.
- ⚠️ **Le chapitre 10 (« Les fractions ») reste sans matière d'année.** La porte est fermée pour
  l'avenir (`fix(subjects)`), mais **aucune rétro-attribution** n'a été faite : ce chapitre existe,
  vide, invisible du résolveur canonique. Une ligne de SQL suffirait, elle n'a pas été écrite —
  c'est une donnée, pas un défaut de code.
- ⚠️ **`lesson_targets` n'a pas été touchée**, et c'est cohérent tant que la porte tient : tout
  chapitre neuf porte sa matière d'année. Si le rattachement par thème SEUL devait redevenir
  légitime, il faudrait donner une **année** aux thèmes (migration) et étendre `lessons_by_skill` —
  chantier nommé dans l'ADR, non ouvert.
- ⚠️ **Le filtre par matière est MONO**, alors que l'ADR décrit tous les critères comme
  multi-valeur. `SubjectFilterChips` est la brique partagée du Dashboard, de la Couverture et du
  Cahier de bord, et elle est contrôlée par `value: number | null` : la rendre multi toucherait
  trois autres pages. **Le serveur accepte déjà une liste** — rien n'est perdu de ce côté.
- ⚠️ **Les serveurs de dev ont été laissés debout** : `backend-dev2` sur `:8002` et `papa-dev2` sur
  `:5178`. ⚠️ `:8001` était occupé par le serveur d'une **autre session**.
- ⚠️ **Deux fausses alertes ont été émises pendant la session** (« l'or n'est pas généré », « l'ombre
  est transparente »), toutes deux dues à un motif de recherche ou une troncature, pas au code. La
  parade est écrite dans `TROUBLESHOOTING.md` — vérifier une valeur arbitraire Tailwind se fait sur
  la **forme hexadécimale** et sur l'élément **rendu**, jamais sur une chaîne devinée.

> ⚠️ Les six dettes qui suivent sont **nées de la session du 2026-08-04 (production)**.

- 🔴 **`Lesson.status` porte DEUX sens** — « la leçon est au programme validé » (ce qu'écrit
  `validate_all_lessons`, sans regarder s'il y a un texte) et « le texte du cours est validé » (ce
  que lit la production). **39 leçons validées-vides contre 28 rédigées** en base de dev. Le
  chantier de séparation exige une **migration** et touche curriculum, galaxie, production et
  `canonical_context`. Nommé dans l'addendum ADR-0036, jamais ouvert.
- 🔴 **Les libellés de cartes SRS affichent du LaTeX BRUT** à l'écran du Journal
  (`Comment calcule-t-on $\frac{2}{5} \times \frac{3}{4}$ ?`). Un `title` au survol a été ajouté
  pour la troncature en pleine formule, **rien ne rend les maths**. Un moteur (KaTeX) est une
  dépendance → **ADR**, pas un correctif.
- ⚠️ **Les suites front ont flaké sous charge le 2026-08-04** (1 puis 2 échecs, `environment` à
  357 s au lieu de 30, en lançant papa + massimo + graphify en parallèle). Trois exécutions
  séquentielles ensuite : vertes. **Les noms des tests n'ont pas été capturés.** Si ça revient sur
  une machine au repos, c'est un vrai défaut de timing, pas la charge.
- **18 jobs RQ fantômes ont été exécutés** contre le Postgres de dev pendant la contre-épreuve
  (`run_production(1)`, `ValueError: production_run 1 introuvable`). Ils sont dans
  `FailedJobRegistry` et n'ont **rien produit**, mais ils y restent — purge non faite.
- **`_pieces_of_run` interroge cinq tables PAR LOT**, et la résolution des cibles en ajoute une
  sixième. Borné par `limit`, jamais mesuré. À regarder si le Journal ralentit.
- **Les lots #21, #22 et #23 ont été SUPPRIMÉS de la base de dev** le 2026-08-04, sur autorisation
  explicite — trois doublons stériles sur la notion 50, aucune pièce rattachée. C'est une
  **réécriture d'historique assumée**, mentionnée ici parce qu'elle contredit la doctrine du §F.4 et
  qu'une session future pourrait s'étonner du trou dans la numérotation.

> ⚠️ Les cinq dettes qui suivent sont **nées de la session du 2026-08-04 (bandeaux)**. Elles portent
> toutes sur la même chose : **rien de ce chantier n'a été jugé à l'œil sur un vrai appareil.**

- 🔴 **LE BANDEAU MASSIMO N'A JAMAIS ÉTÉ VU.** Le panneau navigateur de la session rendait en taille
  réduite : tout ce qui est affirmé sur le rendu est **mesuré dans le canvas** (13–15 bandes sur 20
  occupées selon l'angle, cœur 9× plus lumineux que la périphérie, 86 % de pixels chauds, 19 im/s),
  **pas vu**. ⚠️ **Le merge de #79 a eu lieu QUAND MÊME**, sur décision explicite après que le point
  a été signalé — c'est un arbitrage assumé, pas un oubli, mais la dette n'est pas éteinte pour
  autant : elle est simplement passée d'« avant merge » à « sur `main` ». Elle ne peut pas être
  payée par l'agent. À juger : vitesse de rotation, remplissage, lisibilité du bloc avatar
  par-dessus.
- **`IN_FLIGHT_BUDGET` (32), `ROTATION_PERIOD` (72 s), `FLATTEN` (0,035) et `HEADER_TOTAL` (7 s) ne
  sont pas passés au profileur.** L'addendum ADR-0024 reproche à `GALAXY_MAX_NODES` que « ses
  valeurs n'ont JAMAIS été mesurées » — ne pas refaire la même chose. Une capture Safari sur iPhone,
  jeu semé à ~300 notions. C'est la même dette que « LA GALAXIE — vérifiée à moitié » ci-dessous,
  et les deux se paient d'un seul coup.
- ⚠️ **En phase VIVANTE, le coût par image du bandeau est proportionnel à N** (~202 blits de sprite
  à 19 im/s). C'est le prix explicite de la rotation : dès que tout bouge, le calque posé ne sert
  plus. Pendant la **construction**, il reste indépendant de N. Écrit dans l'addendum §4bis — c'est
  sur iPhone que ça se jugera, pas ici.
- **Le remplissage plafonne à ~65 % de la largeur** à l'arrêt, conséquence directe de l'arbitrage de
  la répartition angulaire. S'il faut mieux : **ne pas toucher la répartition** (elle porte la
  rotation), mais le rayon du disque ou la taille des amas.
- **Le bandeau ne se met pas à jour en cours de session.** Si Massimo travaille une notion, son
  étoile n'apparaît qu'au rechargement suivant. Assumé (`galaxyShared` a une fenêtre de fraîcheur de
  5 s, pas un cache), mais jamais éprouvé en usage réel.


- **Les 22 montées de dépendances backend, différées SCIEMMENT** (mesurées le 2026-08-04 par
  `uv lock --upgrade --dry-run`, qui n'écrit rien). Majoritairement patch/mineures, mais quatre ne
  sont pas anodines : `websockets` 16 → **17** (majeure), `pgvector` 0.4 → **0.5** (le RAG),
  `piper-tts` 1.4 → **1.6** (la voix des capsules), `onnxruntime`/`huggingface-hub` (la dictée).
  ⚠️ **Aucune de ces quatre n'est jugée par la suite de tests** : ces chemins s'exercent **en vrai**
  ou pas du tout. Les 807 tests passeraient au vert sur une montée qui casse la génération de
  capsules. Ce n'est donc pas un bump, c'est un chantier avec **vérification live** — génération,
  RAG, dictée, worker RQ.
- **Le warning `httpx2` reste, et le refus est motivé.** `starlette/testclient.py` essaie `httpx2`,
  retombe sur `httpx` en prévenant. Mais `httpx` **n'est pas une dépendance de test chez nous** :
  trois modules applicatifs l'importent (`ollama_provider`, `anthropic_provider`, `mlx_provider`).
  Installer `httpx2` n'en remplacerait aucun — il **s'ajouterait**, soit deux clients HTTP dans le
  venv pour faire taire un avertissement de `TestClient`. Migrer aussi le code applicatif est un
  changement majeur d'API sur le chemin de **toute la génération**. Le bon moment sera celui où
  Starlette **retirera le repli** : là ce sera une panne, pas un warning, et la migration aura une
  raison.
- **`pyproject.toml` n'a toujours aucune borne haute** (`fastapi>=0.115`, etc.). Le plancher
  `starlette>=0.48` corrige le seul cas qui cassait *à l'import* ; il ne dit rien d'une montée
  majeure future. Pas d'action décidée — c'est un constat, pas un TODO.
- 🔴 **Le patron anti-sondage de l'ADR-0030 est SUSPECT partout où il est copié.** Le test
  « 60 s de timers avancés → un seul appel » ne mord que si `vi.useFakeTimers()` est posé **avant**
  le montage. Démontré le 2026-08-04 : la version de `useAutonomyState` restait verte **avec** un
  `setInterval` ajouté exprès. `useNewsSummary` (Massimo) et ses imitations n'ont **jamais** été
  contre-éprouvées. Une heure de travail, et ça peut réveiller un sondage réel.
- **Les deux pastilles héritées de `PapaSidebar`** (missions à valider, demandes de Massimo) font
  toujours leur propre appel réseau depuis le composant — le motif que l'ADR-0030 a supprimé côté
  Massimo. Elles n'ont **aucun test** : les migrer exige d'écrire leurs verrous d'abord, sinon c'est
  une régression silencieuse sur deux files porteuses. Le verrou « la sidebar ne fait aucun appel
  réseau » est **réduit** en attendant, et le dit.
- **La sidebar Papa n'est toujours pas responsive** : `w-64` sans point de rupture, alors que
  Massimo a reçu son tiroir le 2026-08-04. Le chantier est le même, déjà mené une fois.
- **`API_SPEC.md` ne décrit pas `/api/settings/autonomy`** — vérifié le 2026-08-04, l'endpoint n'y a
  jamais figuré. Ce n'est donc pas une régression de ce chantier, mais le contrat vient de changer
  (`preset` → `niveau`) et rien dans ce fichier ne le porte.

- 🟡 **LA GALAXIE — vérifiée À MOITIÉ le 2026-08-04.** Ce qui est **mesuré** : **202 nœuds** servis
  (1 racine, 4 matières, 12 chapitres, **185 notions**), **74 FPS** au viewport tablette, **zéro
  erreur console**, structure et libellés lisibles en desktop et tablette.
  ⚠️ **Ce qui reste ouvert, et que je ne peux pas faire** : la **tenue sur un vrai appareil**. Un
  viewport à 375 px n'est **pas** un iPhone — ni Safari iOS, ni son GPU, ni ses limites WebGL. Les
  74 FPS sont ceux de ce Mac. **Il faut un iPhone réel.**
  ⚠️ Et **185 notions n'est pas « plusieurs centaines »** : le seuil que l'addendum redoutait n'est
  pas atteint, donc le niveau de détail adaptatif n'est **ni prouvé nécessaire ni prouvé inutile**.
  ⚠️ **Les deux réponses sont DÉJÀ DÉCIDÉES** (addenda ADR-0024/0029), les appliquer n'est donc pas
  une nouvelle décision — les contourner en serait une : si la lisibilité ne tient pas → **niveau de
  détail adaptatif**, jamais le retour du plafond ni le rallumage des forces ; si l'iPhone décroche
  → ce sont les **particules** qui tombent, **jamais les nœuds**.
  ⚠️ Cette dette était **enterrée dans l'historique** de ce fichier depuis le 2026-08-01, donc
  invisible à toute reprise. Remontée ici le 2026-08-04 — **et sa vérification a immédiatement
  trouvé plus grave qu'elle** (le point suivant). C'est l'argument le plus net en faveur du 4ᵉ
  contrôle : une dette qu'on n'a pas sous les yeux ne se paie jamais.
- ⚠️ **La spec de navigation Massimo et le code ont DIVERGÉ, et ce n'est pas réconcilié.**
  `docs/frontend-massimo/navigation.md` (étape 2) prescrit **5 verbes** et une **bottom-nav** sur
  iPhone ; la navigation livrée en porte **13**, chacune ajoutée par une décision postérieure
  (Agenda position 2 par l'**ADR-0025**, « Ma Galaxie » par l'**addendum ADR-0024 §A** qui interdit
  d'en faire un 6ᵉ onglet, six témoins par l'**ADR-0030** avec test-verrou).
  Appliquer la spec **masquerait 8 sections sur mobile**. Le tiroir livré le 2026-08-04 répare la
  largeur **sans rien retirer**, et l'écart est consigné dans la spec elle-même.
  ⚠️ **NE PAS écrire d'ADR pour ça — la décision existe déjà.** L'**ADR-0024**, section
  « Divergence assumée avec `navigation.md` », a tranché il y a quatre semaines : *« L'existant
  prime. Réconcilier `navigation.md` est un autre chantier, resté au `BACKLOG.md` »*. Ce qui reste
  est donc **de la documentation** — mettre la spec au réel — et **rien d'autre**.
  ⚠️ **J'avais écrit ici « un chantier de cadrage qui touche trois ADR ». C'était FAUX**, et ça
  aurait envoyé la session suivante rédiger un ADR inutile. Corrigé le 2026-08-04 après lecture de
  l'ADR-0024 — troisième hypothèse de la journée invalidée par le read-before-decide.
- **La notion ORPHELINE** (aucune leçon) reste insatisfaisable : `equip_piece` le **dit**, rien ne
  le répare. Touche aussi « + Programme » et `skills-backfill`.
- **Les appels aux générateurs sont écrits deux fois** (`equip_notion` / `equip_piece`) — refactor
  sans décision produit, son propre chantier, contre-épreuves serrées (3 consommateurs).
- **Le Commander n'est pas idempotent** (exige `missions.agenda_item_id`, donc une migration).
- ⚠️ **SEPT copies privées de `_active_year`** (`curriculum`, `mindmaps`, `missions`, `dashboard`,
  `fiches`, `quizzes`, `production.coverage`), dont certaines scopées par élève et d'autres non.
  `lesson_resolution.active_year` est publique pour **offrir une destination**, pas pour créer une
  huitième divergence. Les unifier demande de trancher le scope élève — pas ce chantier.
- **`resolve_canonical_context` reçoit un `skill_id`, les générateurs un `lesson_id`** — piège déjà
  documenté (patron quiz), jamais rouvert.
- **Le panneau d'analyse à 3 compteurs** (ADR-0025 §11) attend une mesure SRS scopée chapitre.
- **Un devoir fait produire le chapitre entier** — assumé ; **le dispositif est armé depuis le
  2026-08-03, donc c'est maintenant qu'on peut observer** s'il y a gaspillage.

> ⚠️ **Les quatre dettes qui suivent dormaient dans l'historique de ce fichier**, donc invisibles à
> toute reprise. Remontées le 2026-08-04, en élaguant. C'est ce qui a fait ajouter le **quatrième
> contrôle** avant toute suppression de section (`WORKFLOW.md §5`) : l'historique s'était mis à
> servir de **cimetière à dettes**.

- **Report du Journal de production** (ADR-0034) : le refus de retirer un cours **consommé** n'a
  **jamais été vu à l'écran** (il aurait fallu fabriquer une fausse lecture de Massimo — couvert par
  2 tests backend avec contre-épreuve et 1 test front) ; le geste **« Corriger »** est toujours dû ;
  `has_more` n'a pas de bouton.
- **`notionRouteFor` ignore `action.capsule_id`** et ouvre `/capsules` à plat — le libellé
  « Regarder la capsule » **sur-promet déjà**. Pré-existant (hérité de `NotionActionPanel`), à
  corriger **quand `/capsules/:id` existera**.
- **`prefers-reduced-motion` n'a jamais été vérifié à l'écran.** Le panneau navigateur ne l'émule
  pas, et l'option est désactivée chez Papa — **le chemin où tout doit se figer n'a donc jamais été
  exercé en vrai**. Couvert par des tests unitaires (`particlesFor`) et la variante `motion-safe:`,
  rien de plus.
  ⚠️ **Élargi le 2026-08-04** : le halo gradué de la sidebar Papa en dépend aussi, et sa garde est
  plus exigeante que les autres — elle doit **figer sans retirer** (couper le halo effacerait le
  signal). Vérifié seulement que la règle CSS **existe dans le CSSOM**, jamais qu'elle rend juste.
  Et **trois animations permanentes** dans le coin de l'œil sur 22 pages n'ont jamais été jugées sur
  60 s de travail réel : si ça distrait, le correctif décidé est de **ralentir**, jamais de retirer
  l'axe.
- 👤 **À la charge de Papa, l'agent ne peut pas le faire** : relire l'**amendement de l'ADR-0017
  §5bis** — c'est un changement de **doctrine** du moteur de missions, pas un correctif d'affichage.

### ✅ LE DISPOSITIF EST DÉSARMÉ (2026-08-04, fin de session)

| Réglage | Valeur — **lue en base le 2026-08-04, en fin de session** |
|---|---|
| Régime dérivé | ***Manuel*** (A0a = 2, **A1 = 2**) |
| Déclencheur `zetis_auto_trigger_enabled` | **`false`** |
| Gate du cours | **actif** — ZETIS ne rédige plus un cours à la place de Papa |
| Base lue | `postgresql://…@localhost:5432/zetis` |

**Vérifié en le FAISANT TOURNER, pas en lisant les réglages** : `scan_agenda` et `scan_requests`
appelés à vide rendent `créés: []`, avec leurs motifs — *« le déclenchement automatique est
désarmé »* et *« le régime n'est pas Autonome »*.

⚠️ **2026-08-04, fin de session — le régime a BEAUCOUP bougé, puis a été remis.** La vérification à
l'écran des trois niveaux et des deux modales exige d'écrire en base : `manuel`, `autonome`,
déclencheur armé puis désarmé, une dizaine d'allers-retours.

🔴 **Le contrôle de clôture a pris ce fichier en défaut DEUX FOIS, sur la MÊME ligne.**

- 1ʳᵉ fois : j'avais écrit « remis à `semi` », la base était sur `manuel`. J'ai écrit avoir remis à
  `semi` et relu depuis l'API.
- 2ᵉ fois, quelques heures plus tard : la base est **de nouveau sur `manuel`** (`A0a = 2`), lue
  directement via `service.read_autonomy` sur `localhost:5432/zetis`.

⚠️ **Je ne sais pas expliquer l'écart, et je ne l'invente pas.** Deux hypothèses, aucune vérifiée :
soit la remise à `semi` n'a jamais été persistée, soit quelque chose a réécrit depuis. Rien dans la
session qui suit n'a touché ces clés — mais c'est exactement ce que j'avais cru la première fois.

**Ce qui est CERTAIN et qui est le seul point qui compte : le dispositif est désarmé** dans les deux
cas — `auto_trigger_enabled = false`, `A1 = 2`, gate du cours actif. Le régime `manuel` est *plus*
conservateur que `semi`, jamais moins.

👤 **Pour la prochaine session : ne pas refaire confiance à une ligne d'état de base écrite ici.**
La relire, toujours :

```bash
apps/backend/.venv/bin/python -c "
from app.db.base import SessionLocal
from app.modules.settings import service
db = SessionLocal(); v = service.read_autonomy(db)
print(service.niveau_de(v), v, service.auto_trigger_enabled(db)); db.close()"
```

⚠️ **Le vrai piège de cette journée** : j'ai cru trois fois à une « dérive inexpliquée » du régime.
Il n'y en avait aucune. **Une seule fonction écrit ces clés** (`write_autonomy`, via `PUT`) — les
bascules venaient de **mes propres clics de vérification** sur la page vivante. Un panneau de
réglages ouvert *est* un outil d'écriture ; le vérifier à la souris change la base.

⚠️ **Serveurs de dev laissés EN MARCHE** : backend `:8001`, Papa `:5175`, Massimo `:5176`. Ils
retombent quand le panneau Browser se ferme.

> Il avait été **armé le 2026-08-03** pour prouver le chemin automatique de bout en bout (deux lots
> `request`/`parent_rule` nés sans clic, deux cours écrits et servis). Cette preuve est faite et
> consignée au `CHANGELOG` 0.40.0 ; le réarmer est un geste de Papa, deux clics sur `/parametres`.

⚠️ **Le réveil périodique reste planifié dans Redis, et c'est normal** : il ne produit rien, il
*regarde* — et désarmé, il rend son motif et repart. Il ne peut de toute façon pas se déclencher
sans worker.

⚠️ **35 jobs RQ fantômes purgés à la fermeture**, tous visant un `production_run` **supprimé** lors
d'un nettoyage antérieur — ils ne pouvaient qu'échouer. **Je n'ai pas su expliquer leur
multiplication** (32 exemplaires du même job, arrivés par paires sur 13 h, dont deux paires aux
heures exactes des merges des PR #73 et #74). Aucun de nos trois appelants de `enqueue_production`
n'est un hook de démarrage. **Observation non élucidée, pas une cause identifiée** — à re-mesurer
si la file regrossit.

---


## Historique des chantiers clos

> **2026-08-07 — le popover dit l'état en toutes lettres** (PR
> [#96](https://github.com/NeuronXcore/zetis-school/pull/96), squash `8045789`, base `e4fa60d`,
> branche `feat/popover-en-toutes-lettres` supprimée), section retirée à la clôture du chantier
> des animations (2026-08-07). Contrôles : `adr-0041` §23 ✅ · `TROUBLESHOOTING.md`
> §`feat/popover-en-toutes-lettres` ✅ · `CHANGELOG.md` 0.56.0 ✅. **Résidus encore vrais,
> REMONTÉS dans la section active** (huit, dont `503`/Redis et rejeu transitoire, désormais à
> **quatre** chantiers de retard). Ce qui ne survit qu'ici : le chantier devait réécrire des
> phrases, il a trouvé **deux mensonges** — `already_produced` promettait une reprise impossible,
> et le rang se comptait derrière un travail courant qui n'existait pas toujours. Le second
> n'existait que grâce au premier : **un défaut de langage a révélé un défaut de logique.**

> **2026-08-06 — la bande de production** (addendum 2 de l'`adr-0041`, PR
> [#95](https://github.com/NeuronXcore/zetis-school/pull/95), squash `5ba7097`, base `4536893`,
> branche `feat/bande-de-production` supprimée), section retirée à la clôture du chantier popover
> (2026-08-07). Contrôles : addendum 2 dans `adr-0041-tout-ce-qui-produit-se-voit.md` ✅ ·
> `TROUBLESHOOTING.md` §`feat/bande-de-production` ✅ · `CHANGELOG.md` 0.55.0 ✅. **Résidus
> encore vrais, REMONTÉS dans la section active** (six, dont `503`/Redis et rejeu transitoire qui
> traînent depuis trois chantiers). Ce qui ne survit qu'ici : la **barre a été vue tourner pour la
> première fois** — 11 % → 44 % → 78 % sur un lot réel — et **sept défauts n'existaient qu'à
> l'écran**, dont un livré six jours plus tôt par l'ADR-0041 elle-même (`/activity` plantait sur
> tout lot de chapitre, `Chapter.title` au lieu de `name`), muet parce que le hook avale ses
> erreurs par doctrine. Et un cadrage démenti par le code : compter des pièces au lieu de notions
> n'apportait **rien** — mêmes 3,23 %, au même instant — sans la colonne `current_piece`.

> **2026-08-06 — ADR-0041 « Tout ce qui produit se voit » : les trois slices + l'addendum Journal**
> (PR [#94](https://github.com/NeuronXcore/zetis-school/pull/94), squash `4536893`, base `dc1a6ed`,
> branche `feat/barre-de-production` supprimée), section retirée à la clôture de l'addendum 2
> (2026-08-07). Contrôles : ADR `adr-0041-tout-ce-qui-produit-se-voit.md` ✅ ·
> `TROUBLESHOOTING.md` **quatre** sections `feat/barre-de-production` ✅ · `CHANGELOG.md` 0.54.0 ✅.
> **Résidus encore vrais, REMONTÉS dans la section active** : les scénarios `503`/Redis coupé et
> rejeu transitoire n'ont **toujours** pas été joués. **Résidus RÉGLÉS depuis** : la maquette
> égarée est rangée, le responsive de la production est fait, `prefers-reduced-motion` est exercé,
> et le chantier suivant a été vu à l'écran. Ce qui ne survit qu'ici : la thèse du chantier a été
> prise en flagrant délit à l'écran — pendant 11 ms de travail réel, la page du Conseil a déroulé
> dix secondes de pipeline (elle **devinait**) pendant que le header, qui **mesure**, disait la
> vérité : rien.

> **2026-08-06 — la carte mémoire à 4 vues + 2 cartes focalisables** (PR
> [#91](https://github.com/NeuronXcore/zetis-school/pull/91), squash `d0ca126`), section retirée à
> la clôture du Lot 0 de l'ADR-0040 (2026-08-06). Contrôles : 2 addenda `adr-0028` ✅ ·
> `CHANGELOG.md` 0.52.0 ✅. **Résidus encore vrais, REMONTÉS en « DETTES OUVERTES »** : le chantier
> est **mergé sans relecture visuelle humaine** (3ᵉ fois d'affilée, après #79 et #89), la vue
> « Solde » **n'a jamais été vue non vide** (`skill_mastery_history` n'a que 4 lignes, toutes des
> entrées en `weak`), et **aucun clic sur un titre focalisable n'a abouti depuis le panneau
> navigateur**. Ce dernier a trouvé sa parade au Lot 0 : passer par `claude-in-chrome` et le vrai
> Chrome. Ce qui ne survit qu'ici : `covered` avait cessé d'être affichée **sans qu'un test
> rougisse** — les tests portent sur ce qui est affiché, jamais sur ce qui a **cessé** de l'être.

> **2026-08-05 — le 5ᵉ KPI du dashboard Papa, « À renforcer »** (PR
> [#90](https://github.com/NeuronXcore/zetis-school/pull/90), squash `392b075`), section retirée à
> la clôture du chantier « mémoire à quatre vues » (2026-08-06). Contrôles : ADR
> `adr-0028-addendum-kpi-a-renforcer.md` ✅ · `TROUBLESHOOTING.md` §`feat/kpi-a-renforcer` ✅ ·
> `CHANGELOG.md` 0.51.0 ✅ · **quatre résidus REMONTÉS** en tête de « DETTES OUVERTES » (les deux
> incohérences de `launch.json`, `KPI_ORDER` mort, les deux écarts de delta du dashboard, et
> l'emplacement de `FRAGILE_STATUSES`) — tous **revérifiés par commande** avant remontée, aucun
> n'était périmé. Ce qui ne survit qu'ici : `gh pr merge --delete-branch` a **basculé le worktree
> sur un `main` local périmé** puis échoué à l'avancer, donnant l'illusion que tous les fichiers du
> chantier avaient disparu — rien n'était perdu, le squash était déjà sur `origin/main`.

> **2026-08-05 — la file de relecture + la fenêtre de la branche `flat`** (PR #86 squash `d727394`,
> PR #87 squash `e42dc64`), section retirée à la clôture du chantier « souffle du focus ».
> Contrôles : ADR `adr-0039-file-de-relecture.md` ✅ · `TROUBLESHOOTING.md`
> §`feat/file-de-relecture` ✅ · `CHANGELOG.md` 0.49.0 et 0.49.1 ✅ · **trois résidus REMONTÉS** en
> tête de « DETTES OUVERTES » (aucun clic Valider/Rejeter joué en vrai, `/relecture` desktop
> seulement, et la divergence `data-scope` de `page-dashboard.md`) — ils ne vivaient nulle part
> ailleurs. Ce qui ne survit qu'ici : le `xfail(strict=True)` de la fenêtre `flat` est **passé
> XPASS donc rouge à la correction**, forçant son propre retrait — première dette du dépôt à se
> rappeler toute seule au moment exact où elle est payée, **patron à réutiliser**.

> **2026-08-05 — une file que personne n'écoute** (PR #85, squash `7c3e290`), section retirée à la
> clôture du chantier « file de relecture ». Contrôles : ADR
> `adr-0036-addendum-file-sans-consommateur.md` ✅ · `TROUBLESHOOTING.md` §`fix/file-de-production`
> ✅ · `CHANGELOG.md` 0.48.0 ✅ · **rien d'ouvert** dans la section retirée — les deux dettes 🔴
> qu'elle nommait en « prochain pas » (fenêtre de la branche `flat`, `CHANGELOG` muet sur #82/#83)
> étaient **déjà** dans DETTES OUVERTES, vérifié avant suppression. Ce qui s'y trouvait d'utile et
> qui ne survit qu'ici : le chantier a été **découpé en trois commits vérifiés chacun sur son propre
> état**, et ce découpage a révélé un couplage (`useRunProgress` demandait `started_at` au commit 1
> sans l'utiliser) que la seule vérification finale n'aurait jamais montré.

> **2026-08-05 — le panneau d'analyse par matière** (PR #83, squash `cb59600`), section retirée à
> la clôture du 2026-08-05. Contrôles : ADR `adr-0028-addendum-analyse-par-matiere.md` ✅ ·
> `TROUBLESHOOTING.md` §`feat/analyse-matiere` ✅ · **`CHANGELOG.md` — ❌ à la clôture, ✅ depuis le
> 2026-08-05** : l'entrée manquante avait été remontée en dette, elle a été **rétro-inscrite en
> 0.46.2** depuis les sources · ce qui restait ouvert : **deux dettes PAYÉES** par le chantier
> suivant, le reste déjà dans « DETTES OUVERTES ».

> **2026-08-04 — les deux bandeaux** (PR #78 `4458574`, PR #79 `c02a555`), section retirée à la
> clôture suivante après les quatre contrôles : ADR `adr-0029-addendum-galaxie-dans-le-bandeau.md`,
> `TROUBLESHOOTING.md` §bandeaux, `CHANGELOG.md`, et **ce qui restait ouvert remonté ci-dessus** —
> dont 🔴 *le bandeau Massimo n'a jamais été vu*, qui est toujours dû.

⚠️ **Il n'y en a plus ici, et c'est une décision** (2026-08-04). Ce fichier portait **2 227 lignes
d'historique pour 122 lignes de chantier actif** — 94 % du contexte d'une reprise dépensé sur du
travail terminé. L'instrument censé économiser le contexte en était devenu le premier consommateur.

**Rien n'a été perdu : tout était déjà écrit ailleurs**, et chaque section a été vérifiée avant
d'être retirée (`WORKFLOW.md §5`, les quatre contrôles) :

| Ce que l'historique portait | Où c'est |
|---|---|
| les décisions | l'ADR du chantier, indexé dans `DECISIONS.md` |
| les pièges | `TROUBLESHOOTING.md`, une section par chantier |
| le récit du livré | `CHANGELOG.md`, une entrée de version par chantier |
| l'état git, le détail | Git — `git log -p MEMORY.md` (56 révisions au moment de l'élagage) |
| **ce qui restait OUVERT** | **remonté dans « DETTES OUVERTES » ci-dessus** — c'est le 4ᵉ contrôle |

> ⚠️ **Le 4ᵉ contrôle n'est pas décoratif** : l'élagage a exhumé **cinq dettes vivantes** qui
> dormaient dans l'historique, dont la galaxie jamais vérifiée sur trois appareils et un
> `ZETIS_DATABASE_URL` que `.env.example` et `DEPLOYMENT.md` annonçaient **sans son préfixe** —
> donc ignoré par le backend. Un élagage aveugle les aurait effacées.
