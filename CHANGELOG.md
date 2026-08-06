# CHANGELOG.md — Historique ZETIS

## 0.53.0 — Progression nomme les notions et date leurs mouvements ; le Conseil cesse d'affirmer ce que l'évidence ne porte pas

Un chantier en quatre lots (ADR-0040), plus deux correctifs nés de questions posées en le relisant.

### Le Conseil affirmait une évolution qu'aucune source ne pouvait produire

`CouncilReportSpec.recent_evolution` était un `str` **non-nullable** pour une valeur que rien ne
mesurait : le `period` du Conseil ne sélectionne aucune donnée. Le modèle remplissait donc **par
obligation de type**, et la phrase inventée était figée dans `council_reports.subjects_json` —
rétroactivement indiscernable d'une observation réelle. Le garde-fou existait partout ailleurs (tout
`skill_id` absent de l'évidence est ignoré) mais pas ici : la validation portait sur le **type**,
jamais sur le **contenu**.

Le serveur écrase désormais le champ après la validation typée, au même endroit que l'ancrage des
`skill_id`. **L'absence s'écrit** : `null` ne rend pas une section vide mais une phrase — masquer
laisserait lire « aucun mouvement » là où il faut lire « aucune trace ».

Puis le Lot 3 l'a **rempli** : `{since, transitions[], comment}`. 🔴 **Le modèle ne produit aucune
date.** Il reçoit les bascules de palier en **liste fermée** et ne rend qu'un commentaire. L'ancrage
est donc **structurel** — il n'y a pas de date à filtrer, parce qu'il n'y a pas de date à inventer.
C'est plus fort que le patron `skill_id`, où le modèle émet des identifiants qu'on revalide.

Les rapports figés ne sont pas réécrits : un artefact LLM n'est pas rejouable. Une **marque de
lecture** dérivée de `prompt_version` signale ceux d'avant, et s'éteint d'elle-même.

### Progression porte trois grains dans un seul écran

La matière, la notion, le fait daté — derrière un sélecteur de vue, sans jamais changer de largeur.

**Par notion** : les 280 notions se lisent enfin ensemble. Six colonnes triables, chacune départagée
par `skill_id` pour que l'ordre soit stable. Palier et lacune y sont **deux axes indépendants**,
jamais une colonne à trois valeurs — 13 « à renforcer » pour 1 seule lacune ouverte en base réelle,
et une infobulle permanente porte les deux nombres côte à côte parce que sinon ils se lisent comme
une incohérence. Le tri par date scinde en **trois blocs comptés** : 15 des 19 notions engagées
n'ont aucune date, et une liste continue les ferait lire comme « les plus anciennes ».

**Par période** : une **grille calendaire**, sur le patron du Cahier de bord. La case porte un
compte, et c'est un **repère de navigation**, pas une mesure — première exception assumée au « zéro
agrégat temporel ». Les données sont grumeleuses (86 faits sur l'année, dont une vingtaine le seul
05/07) : aucune case ne peut nommer vingt faits, le journal du jour si. Plusieurs jours se
sélectionnent ensemble, par bascule indépendante.

Trois débuts de trace sont **déclarés à l'écran** : un compteur bas dit alors « pas de trace »,
jamais « pas de mouvement ». Corollaire vérifié sur la base réelle — 4 bascules à 7 jours comme à
365, parce que la trace n'ouvre que le 31/07.

**Par matière** : la table gagne une colonne **Lacune** (le compte existait, il n'atteignait pas
l'écran), le tri de ses six colonnes, et un dépliage qui recompose chacun de ses nombres.

### Une seule fonction de mesure, deux consommateurs

`evidence.mastery_transitions(student, since, subject_id)` : Progression l'affiche, le Conseil la
raconte. Les calculer séparément aurait refabriqué la classe de bug que ce dépôt paie depuis trois
chantiers — deux mesures divergentes sous un même mot.

⚠️ `from_status` est calculé **par fenêtrage**, jamais lu : `skill_mastery_history` ne stocke que le
statut d'arrivée. La plus ancienne bascule tracée n'a donc pas de palier de départ, et l'écran écrit
« première bascule tracée » plutôt que d'en inventer un.

### Trois surfaces disaient « à renforcer » pour trois populations différentes

`/lacunes` affichait « Rien à renforcer pour le moment » pendant que le dashboard en annonçait 13.
La page s'appelle désormais **« Lacunes ouvertes »**, `SEVERITY.medium` dit « à traiter », et son
état vide renvoie vers Progression **parce que les deux populations sont disjointes**. Un
test-verrou lexical tient les deux vocabulaires séparés.

### Deux correctifs, trouvés en répondant à des questions

**Les liens de Progression ne visaient rien.** Les trois « Ouvrir le programme » partaient sans
paramètre : les huit lignes menaient toutes à la matière ouverte par défaut. Une cible manquante est
**silencieuse** — la page d'arrivée ignore le paramètre absent, sans erreur nulle part. Un test
figeait même l'URL nue. Deux manques du §1 en sont sortis : le bloc « Référentiel — ce qu'il reste à
produire » avec son lien Couverture, et les trois liens vers les autres vues pré-filtrées.

**La période du Conseil promettait une fenêtre.** Un rapport intitulé « 7 derniers jours » portait un
snapshot disant « évidence à l'instant, pas de fenêtre temporelle ». L'écran dit maintenant que la
période est une **étiquette**. Pas de calendrier, et c'est une décision : une date est une
affirmation *précise* là où une étiquette n'est que vague, et tant que le service d'évidence n'a pas
de vraie fenêtre, un sélecteur de dates promettrait une sélection que personne n'honore.

**L'historique était illisible.** Neuf rapports, neuf pastilles portant toutes « Trimestre 1 » ou
« 7 derniers jours ». Elles portent maintenant la date de génération — la seule vraie — la matière
ciblée, et une marque sur les rapports antérieurs au daté.

### Technique

Deux routes Papa (`GET /progress/skills` agrégée à nombre de requêtes constant,
`/progress/skills/{id}/timeline` paresseuse). Une migration : index
`(student_id, skill_id, changed_at DESC)` sur `skill_mastery_history` — l'existant sert le balayage
de fenêtre du dashboard, pas « la dernière bascule de chaque notion ». `COUNCIL_PROMPT_VERSION`
v2 → v3 → v4. `history_since` remonte de `dashboard` vers `evidence`, avec trois consommateurs.

**Deux absences ne partagent pas un `null`** : `{days}`, `{unknown:"before_history"}` (se comblera),
`{unknown:"before_migration"}` (perdue) et `null` (jamais abordée) — les fondre rendrait l'écran
incapable de dire laquelle.

Hors chantier, au passage : **`DECISIONS.md` remis en ordre** — l'index était écrit en deux blocs
qui se télescopaient, 56 entrées sur 70 mal placées, et 16 divergences entre l'index et les fichiers
d'ADR. Tri par script, statuts réconciliés, divergences ramenées à zéro.

## 0.52.0 — La carte mémoire montre enfin des événements, et deux cartes cessent de ne pouvoir que s'éteindre

Deux chantiers liés par la même carte du dashboard Papa.

### « Évolution de la mémoire » ne pouvait montrer aucun événement

Elle portait trois courbes, avec deux défauts — l'un mesuré à l'écran, l'autre structurel.

**L'échelle était confisquée.** Maximum de l'axe **222** (fixé par `covered`) ; « à renforcer »
valait 13 et « consolidées » **1**. Les deux courbes que la carte existe pour montrer occupaient
les **6 % du bas** d'un cadre de 190 px — une dizaine de pixels — pendant que la courbe de contexte
en prenait 94 %.

**Et aucune ne pouvait redescendre.** `reconstruct_series` projette l'ensemble d'aujourd'hui à
rebours : c'est croissant **par construction**. Une notion consolidée en juin puis perdue en juillet
n'apparaît nulle part — elle est absente de *tout son passé*. Trois courbes qui ne peuvent ni
baisser ni se croiser ne montrent jamais d'événement.

La carte porte désormais **quatre vues** derrière un sélecteur, qui ne partagent ni unité ni nature
de mesure :

| Vue | Nature |
|---|---|
| **Paliers** *(défaut)* | 4 stocks empilés, plus `covered` en ligne de contexte |
| **Révisions** | passages SRS notés (`again`→`easy`) + charge à venir, aujourd'hui au centre |
| **Rétention** | `consolidées ÷ travaillées`, 0–100 % — le seul tracé qui puisse **redescendre** |
| **Solde** | entrées / sorties du palier consolidé, le seul endroit où une **perte** est visible |

« Paliers » est le défaut **par contrat** : les KPI « Notions consolidées » et « À renforcer »
allument cette carte, et leur clic doit tomber sur la vue qui justifie leur chiffre.

Trois honnêtetés inscrites dans la carte : le dénominateur de la rétention est **affiché** (avec 19
notions travaillées, une seule notion déplace la courbe de 5 points) ; un point sans dénominateur
est un **trou**, pas un zéro ; et un solde vide dit **l'absence de trace**, jamais l'absence de
mouvement — `skill_mastery_history` n'a que 4 lignes, aucune ne franchit le palier consolidé.

**Interversion au passage** : « État des notions » passe à gauche, « Évolution de la mémoire » à
droite. Lien de cause à effet et non mise en page — filtrer une matière dans les barres empilées
**redessine** les courbes voisines.

### « Charge de révision » et « Chaîne de contenus » ne pouvaient que s'éteindre

Conséquence jamais écrite de l'ADR-0028 §5 : leur mesure n'est le sujet d'**aucun** des cinq KPI.
`charge` n'était allumée que par 2 focus sur 5, `chaine` par **1 sur 5**, et aucun geste de la page
ne pouvait les désigner. Ce sont aussi les deux seules cartes à ne contenir **aucun** élément
cliquable.

Le focus cesse d'être l'apanage du bandeau : **clic sur le titre**, même mécanisme, même clé d'URL,
et cliquer une carte **relâche le KPI pressé** — un seul focus sur la page.

La zone cliquable est le **titre** et non la carte entière : la Chaîne de contenus porte des liens,
et une ancre dans un bouton est du HTML invalide. Le bouton se glisse **dans** le `h3` pour que la
carte reste un titre à la navigation au clavier.

### Régression corrigée dans le même chantier

La refonte en quatre vues avait fait **disparaître de l'écran** la série `covered` — aucun test ne
l'a signalé, alors que c'est la seule mesure du dashboard reliant la **production** aux **notions**.
Restaurée en ligne pointillée de contexte sur la vue « Paliers ».

### Sous le capot

Trois requêtes de plus (`_review_attempts`, `_mastery_transitions`, `_entered_in_progress_at`),
quatre séries et un objet ajoutés à `SubjectSeries`, `PageFocus` comme type distinct de
`DashboardFocus`. **Aucune migration, aucune route nouvelle.**

Verrous prouvés par sabotage : `window_days` neutralisé (le flux reportait un mouvement hors fenêtre
sur son premier point), dénominateur de rétention branché sur `covered` (3 tests rouges), et
`charge`/`chaine` retirés du garde `isFocus` (3 tests sur 4 rouges).

## 0.51.0 — Le KPI qui manquait : « À renforcer »

Le bandeau du dashboard Papa portait **deux** KPI sur les notions — « Notions consolidées » et
« Lacunes ouvertes » — qui comptent **deux populations différentes, dans deux tables différentes**.
Entre les deux, le segment « à renforcer » — le **seul signal de régression** de la page — n'avait
aucune mesure de tête : il ne vivait que dans la barre empilée et dans la courbe ambre, à deux
cartes du seul endroit qu'on lit tôt.

Relevé sur la base de dev le jour du chantier : Papa lisait *« 1 notion consolidée, 1 lacune, tout
est pris en charge »* pendant que **13 notions à renforcer**, dont **4 arrivées dans la semaine**,
ne figuraient nulle part.

### Un cinquième KPI

**« À renforcer »** (`weak` + `learning`), ambre de bout en bout — le même ambre que son segment
dans la barre empilée, pour que le KPI et le segment se reconnaissent à l'œil.

- **Pas de dénominateur** : « 13 / 280 » rapporterait les fragiles au programme entier, dont 261
  notions jamais abordées, et suggérerait une proportion rassurante qui n'existe pas.
- **Son écart est dérivé de sa courbe** (`value - sparks.fragile[0]`), jamais recompté : le chiffre
  et la sparkline affichée juste en dessous ne peuvent pas raconter deux histoires différentes. Il
  compte donc des **entrées** et n'est jamais négatif — une notion réparée disparaît des deux
  nombres au lieu d'être soustraite.
- **Une hausse est une mauvaise nouvelle**, l'inverse des quatre autres KPI. Le sens passe par la
  **couleur**, jamais par une flèche inversée.

### Trois infobulles qui empêchent une confusion de revenir

Poser « À renforcer » dans le bandeau met **13** à côté de **1** pour ce qui *sonne* comme la même
chose. Les trois KPI de notions portent désormais chacun une infobulle qui dit ce qu'il compte —
un **palier de maîtrise** d'un côté, une **décision ouverte** de l'autre. Une quatrième, dans la
légende de « État des notions », assume à voix haute le fourre-tout du segment « en cours »
(presque acquis, en cours de mission, ou pas encore tranché) plutôt que de le scinder.

`GLOSSARY.md` gagne une entrée « Notion à renforcer » et corrige « Lacune ouverte », qui annonçait
encore une formulation d'interface que le code avait explicitement refusée.

### Un avertissement qui s'auto-périme

L'historique des bascules de maîtrise est récent : sur une fenêtre longue, la courbe ambre est
plate puis monte d'un coup — un artefact de mise en service, pas une dégradation. Le payload sert
désormais `history_since`, et l'avertissement **disparaît de lui-même** dès que l'historique couvre
la fenêtre regardée. Une phrase figée aurait été juste six mois puis fausse pour toujours.

Décision : `docs/decisions/adr-0028-addendum-kpi-a-renforcer.md`. Aucune migration.

## 0.50.0 — Le Dashboard dit ce qu'il montre

Quatre demandes enchaînées dans la même session, chacune née de la précédente **en regardant
l'écran**. Aucune n'était cadrée à l'avance, et la dernière a démasqué un nombre qui trompait.

### Le focus respire

Cliquer un KPI mettait déjà la page en focus, mais le signe était entièrement statique : deux traits
de bordure sur une page sombre chargée de huit diagrammes. Le KPI cliqué et les cartes qui le fondent
reçoivent désormais un **voile émeraude** qui enfle et retombe en ~4,5 s.

Il **double** le signe, il ne le porte jamais seul : la bordure et l'anneau restent porteurs, et
rien ne se perd s'il est coupé. C'est ce qui le distingue du halo de régime en sidebar, qui reste le
seul endroit du dépôt où une animation porte de l'information. En `prefers-reduced-motion`, il se
fige à mi-course — le mouvement part, le voile reste.

### Le centre du donut suit la matière

Filtrer sur une matière laissait « Répartition du temps » annoncer le temps de **toutes** les
matières : le seul chiffre en gros de la carte ne répondait pas à la question qu'on venait de lui
poser. Le centre suit maintenant la sélection, **avec le total conservé juste dessous** — c'est lui
qui le raccorde au KPI du haut. Le tracé, lui, garde toutes ses parts : réduit à une matière, le
donut occuperait 100 % du disque et ne dirait plus rien de sa part réelle.

### La semaine type dit à QUOI, plus seulement QUAND

La case des créneaux devient une **barre** : sa longueur dit l'intensité, ses segments colorés disent
quelles matières s'y partagent le temps. La couleur ne peut pas dire à la fois « combien » et
« laquelle ». Filtrée sur une matière, la grille écrit ses minutes dans les cases non vides ; au
survol ou au focus clavier, une infobulle donne la ventilation complète.

Écart assumé avec la vue Calendrier, qui garde son échelle émeraude : là-bas une case est **un
jour**, et un jour n'a pas de composition à montrer.

### Une question a démasqué une lecture trompeuse

*« Nous ne sommes pas encore jeudi ni samedi : pourquoi des cases remplies ? »*

Les cases étaient justes — c'étaient le jeudi 30 et le samedi 1ᵉʳ, tous deux **dans** la fenêtre
glissante de 7 jours. Mais des en-têtes `Lun…Dim` au-dessus d'une fenêtre repliée se lisent comme un
calendrier. Trois réponses, une par cause :

- la note **date la fenêtre** en clair (« Semaine type du 30 juil. au 5 août ») et dit que la colonne
  « Jeu » est le jeudi de cette fenêtre, pas le jeudi à venir ;
- le mot **« moyenne » disparaît sur la fenêtre 7 jours** : chaque jour de semaine n'y apparaît
  qu'une fois, `bucket_slots` divise par 1, et le chiffre est les minutes d'un seul jour ;
- une **troisième vue « Semaine en cours »**, sept jours **datés**, où un jour à venir est marqué
  comme tel et **jamais compté à zéro** — « il n'a rien fait vendredi » et « on n'est pas encore
  vendredi » sont deux phrases différentes.

Pas de découpage horaire dans cette vue, et ce n'est pas un oubli : `slots` est déjà replié par jour
de semaine côté serveur et a perdu les dates. Elle est bâtie sur `calendar`, qui porte les minutes
par date mais pas par heure — dit dans la note plutôt que laissé passer pour un manque.

### Portée et vérification

Frontend Papa uniquement. **Aucune migration, aucun endpoint, aucun type partagé.** `sumSlots` est
remplacé par `buildSlotCells` plutôt que doublé — un seul appelant, et le garder aurait laissé du
code mort avec son test.

**561 tests Papa** (545 → 561, **+16**), `tsc -b` propre. **Dix sabotages, dix rouges** : chaque verrou a été vu
échouer avant d'être compté comme un verrou. Trois d'entre eux ne discriminaient qu'un seul cas —
les matières à 0 minute, le périmètre `matchesFocus`, et le début de semaine.

Vérifié sur le vrai dashboard et les vraies données. ⚠️ **Sauf `prefers-reduced-motion`**, qui n'a
pas pu être émulé et reste le seul comportement du lot tenu par la seule relecture du CSS.

## 0.49.1 — La branche « flat » cesse de compter ce que sa preuve ne montre pas

Dette inscrite le 2026-08-05 par l'ADR-0038, payée le jour même.

Le constat *« trop peu d'activité mesurée pour conclure »* comptait les traces sur **730 jours**
(tout l'historique chargé par l'agrégat) ; sa preuve, `/cahier`, est bornée **serveur** à
**366 jours**. Une trace de plus d'un an était donc **comptée par le constat et invisible sur sa
propre preuve** — le nombre annoncé n'était pas vérifiable.

Aucune des deux bornes n'était fautive : les 730 j servent à rendre vrais les deltas des KPI, les
366 j protègent l'ampleur du scan. C'est leur **rencontre** qui mentait.

**Le comptage se borne désormais à la fenêtre de sa preuve** — et il **lit**
`ACTIVITY_MAX_RANGE_DAYS`, la même source que le routeur qui borne, plutôt que de recopier un 366
qui aurait divergé au premier changement de réglage.

Conséquence assumée : le constat se déclenche un peu plus souvent, puisqu'il compte moins. C'est le
comportement juste — s'il n'y a pas trois traces **dans l'année**, il n'y a pas de quoi conclure.

### Ce que le marqueur de dette a prouvé

La divergence vivait en `@pytest.mark.xfail(strict=True)` plutôt qu'en prose. À la correction, le
test est passé **XPASS(strict)** — donc rouge — et a forcé le retrait du marqueur dans le même
commit. **Première fois dans ce dépôt qu'une dette se rappelle toute seule au moment exact où elle
est payée.** Le patron vaut d'être réutilisé.

Le test garde le même corps : ce qui prouvait le défaut verrouille sa correction. Contre-épreuve
jouée — bornage retiré, le test annonce 2 traces pour 1 servie, exactement la divergence d'origine.

**932 backend** (931 + le `xfail` devenu vert). Aucune migration. `adr-0038` (amendement).

## 0.49.0 — Tout nombre du Dashboard ouvre enfin ce qu'il compte

Deux surfaces du Dashboard annonçaient du travail sans jamais dire lequel. Les deux mentaient, et
personne ne pouvait s'en apercevoir — précisément parce qu'aucune des deux n'était cliquable.

**La file « À décider »** affichait « 32 contenus en attente », détaillés en « 26 cours · 1 fiche ·
5 capsules ». Ce détail était une **chaîne de caractères construite au serveur** : non cliquable par
construction, aucun geste front ne pouvait le rattraper. Et son bouton « Relire » pointait sur
`/couverture`, qui ne montre **ni** les capsules (absentes de la matrice), **ni** les cours brouillon
sous sa pilule « À relire » (elle ne filtre que les dérivés).

**La Chaîne de contenus** affichait « ↓ N à produire ». Mesuré à l'écran : elle annonçait **49**
fiches là où la page ouvrait **10** lignes. Deux causes cumulées, aucune n'étant une faute de
calcul — la chaîne ignorait l'année scolaire, et une leçon validée **sans cours rédigé** entrait
dans la soustraction alors qu'aucun dérivé n'y est générable. Un troisième défaut dormait à côté :
le delta se calculait `stage.value − next.value` alors que chaque marche porte sa propre cible, ce
qui rendait le nombre sous « Fiches » **faux** et pouvait afficher « ↓ complet » à tort.

### Ce que la version livre

- **Page `/relecture`** — le chantier que le dépôt nommait depuis l'`adr-0023` dans un bouton
  `disabled`. Cinq familles, deux gestes (valider · rejeter), un lien « Voir → » pour lire avant de
  trancher, retrait optimiste de la ligne.
- **Module `review_queue`**, source **unique** du « en attente » : la page et la file du Dashboard
  en dérivent toutes deux, et un test l'exige famille par famille.
- **Le détail devient cliquable** : `InboxItem.breakdown` typé, cinq segments qui mènent tous à la
  file. La file du Dashboard reste du **tri** — une ligne par famille, jamais par contenu.
- **Les deltas « à produire » deviennent des liens**, et affichent désormais le nombre que leur
  destination ouvre réellement (`missing_count`), pas une soustraction de marches.
- **`/couverture` devient adressable** (`?filter=`, `?subject=`, `?manque=`) — utile bien au-delà de
  ce chantier.
- **Deux endpoints de rejet créés** (`fiches`, `mindmaps`) : quatre familles sur cinq se rejetaient
  déjà, l'asymétrie ne s'expliquait pas à l'écran.

### Ce qui change à l'écran, et qu'il faut savoir

⚠️ **Le compteur « à valider » a BAISSÉ** (27 → 26 sur la base de dev). Les comptes sont désormais
bornés à l'**année active**, comme la Couverture. Ce qui a disparu du compteur est exactement ce
qu'aucune page ne savait ouvrir.

⚠️ **« leçons » se dit « cours » à l'écran.** La table stocke une leçon, Papa relit un cours. Le
pluriel est **porté** et non calculé : « cours » est invariable, un `+ "s"` mécanique écrirait
« 26 courss ».

### Décision revue le jour même

Le segment « cours » devait ouvrir `/couverture?filter=no_lesson` (la validation en lot par chapitre
y vit). **Revu par le user après l'avoir vu en vrai** : les cinq familles vont à la file. La pilule
« 🔒 Non validées » de la Couverture **n'est pas retirée** — valider un chapitre entier qu'on vient
de relire et trancher un cours à la fois sont deux gestes différents.

### Vérifications

931 backend · 545 Papa · 525 Massimo, `tsc -b` propre. **Vérifié à l'écran sur la base réelle** :
les cinq segments, les trois deltas (38 / 10 / 15 annoncés, 38 / 10 / 15 lignes ouvertes — comptées),
et l'accord `inbox = file = items servis = 32` lu sur l'API en direct.

Aucune migration. `adr-0039`.

## 0.48.0 — Une file que personne n'écoute, et un écran qui disait « 0 % »

Signalé par le user : quatre lots (#24 à #27) créés dans la matinée, aucun terminé, l'en-tête figé
à 0 %, et *« changer de page et revenir remet tout à zéro »*.

**La cause était dans `scripts/dev.sh`**, qui ne lançait pas `python -m app.production_worker`. Le
backend accepte un lot en `202` et l'enfile ; sans worker, il accepte tout et ne produit rien. Rien
n'était cassé — c'est pour ça que ça a duré six heures. Le worker est maintenant lancé et arrêté
avec la stack (`pnpm dev` étape 4/5, ou `pnpm dev:worker` seul).

Quatre défauts que la panne a révélés :

- **Le 0 % était une invention de l'affichage.** `useRunProgress` rend `null` — « rien à mesurer » —
  et `ProductionProgress` le retraduisait en `0`. Le libellé était honnête, la case du pourcentage
  ne l'était pas, et c'est la case qu'on lit. `GenerationProgress` accepte désormais
  `value: number | null` et rend une **barre indéterminée sans chiffre**. Une barre partiellement
  remplie est un pourcentage, même sans chiffre à côté : le liseré balaie, il ne se remplit jamais.
- **« En file d'attente » était vrai et insuffisant.** Une file sans consommateur est un arrêt, pas
  une attente. `GET /runs/active` rend `worker_alive` et l'en-tête écrit « ZETIS **ne produit pas**
  … aucun moteur de production actif », en ambre, sans point qui pulse.
  ⚠️ `rq.Worker.count()` **ment** (elle compte des noms dont le hash a expiré) — `Worker.all()` dit
  vrai. Mesuré : aucun processus en vie, `count()` = 1.
- **La page Demandes mémorisait les lots au lieu de les lire** — et c'est ce qui a fabriqué les
  doublons : revenir sur la page rendait le bouton « Produire », Papa recliquait. Le lot se
  redérive maintenant du serveur (`active_run` par demande, en une passe groupée), par
  `(skill_id, piece)` faute de clé étrangère possible sur un lot `manual`.
- **L'avancement reprend au lieu de repartir de zéro.** `started_at` voyage avec le lot et ancre
  l'estimation : elle mesurait jusqu'ici l'âge de **l'affichage**, pas celui de l'opération.

**Deux gardes dans `create_run`**, toutes deux en `409` :

- **un lot au même scope est déjà en file** → le refus nomme le lot existant. Ce n'est pas de
  l'idempotence (`run_exists_for` regarde toute l'histoire) — ici on demande seulement si quelqu'un
  est en train de le faire ;
- **le contenu existe déjà** → refus dit *avant* l'écriture. Le lot #28 avait tourné 76 ms pour
  rendre `skipped`, sans rien dire à personne.
  ⚠️ « Existe » ne veut pas dire « rien à faire » : une fiche `pending` que le régime permet de
  valider est un lot utile, et le prédicat le sait. Il **réutilise** les prédicats d'`equip_piece`
  — un test-verrou d'architecture l'exige.

**Le refus part en toast, pas dans le bandeau rouge** (`components/Toast.tsx`) : un refus n'est pas
une panne, ZETIS vient de reconnaître la situation et n'a rien détruit. `role="status"`, effacement
automatique, aucune trace à traiter. Le tri se fait sur le **code HTTP** — `asJson` lève désormais
un `HttpError` qui garde son `status` — et jamais sur le texte, qui a déjà été réécrit une fois.

Vérifié sur la vraie base, worker éteint : lot #28 créé, `worker_alive = False`, 5ᵉ clic refusé en
`409`, `active_run` retrouvé sans aucune mémoire de page. Worker relancé : #28 exécuté, `skipped` —
la fiche COD existait déjà (fiche #24, en attente de validation).

Vérifié aussi sur la vraie base : la fiche COD existant déjà, un clic « Produire » est **refusé**
(`409`) au lieu de créer un lot stérile de plus.

911 tests backend · 495 Papa · 525 Massimo verts. Dix verrous backend et quatre front ; chacun des
mécanismes ajoutés a été **saboté séparément** pour vérifier que son verrou vise juste — y compris
la nuance `pending` + `peut_valider`, dont le sabotage a été relu en diff après un `grep` ambigu.

## 0.47.0 — Les preuves de la Lecture ZETIS mènent quelque part, et Progression cesse d'être inventée

> ✅ **Les deux chantiers que ce fichier sautait ont reçu leur entrée** le 2026-08-05 : voir
> **0.46.1** (PR #82) et **0.46.2** (PR #83), plus bas. Ils ont été rétro-inscrits **depuis leurs
> sources** — messages de squash, ADR, `TROUBLESHOOTING.md` — et non de mémoire.

Le correctif du 2026-08-05 n'avait traité qu'**une** des trois branches de la Lecture ZETIS. Les
deux autres portaient le même défaut, et personne ne les avait regardées : `up` menait à
`/progression`, **une page de 49 lignes entièrement en mock** — un pourcentage, un XP et un compte
de lacunes ne venant d'aucune mesure, alors qu'elle est la cible d'un constat qui se dit adossé à
une trace comptée.

**La page ne ment plus.** Sur les vraies données : Français `10 / 96` abordées, 1 acquise, 367 XP,
8 à renforcer — quatre nombres qui viennent tous d'une mesure.

- **La barre mesure l'AVANCEMENT DU PROGRAMME**, pas l'acquisition : notions engagées (consolidées
  ∪ fragiles ∪ en cours) sur les notions au programme. C'est la seule mesure disponible qui
  **sépare** les matières aujourd'hui — il y a **1 notion consolidée sur 280**, une barre
  `mastered / total` afficherait zéro pour sept matières sur huit pendant des mois.
- **« Avancé » et « acquis » sont deux colonnes**, jamais fondues. Le vocabulaire de « consolidée »
  ne bouge pas : on mesure autre chose, et on le nomme autrement.
- **Le XP revient sur Progression**, sa seule maison côté Papa depuis l'ADR-0028 §5 — cumul sans
  fenêtre, un stock et non un flux.
- **`/lacunes` lit enfin `?subject=`** et filtre **en mémoire** : zéro requête, aucun changement
  backend, les trois sections recalculées sur le jeu filtré, un slug inconnu ne vide jamais la page.
  ⚠️ Les deux boutons de génération n'ont **aucun** paramètre de matière : leur libellé porte donc
  le compte **non filtré** et le dit (« · toutes matières »), plutôt que d'annoncer 3 et d'en créer 7.
- **Le verrou de cohérence devient général** : pour **chaque** constat, on résout la cible depuis
  son `href`, on appelle ce qu'elle sert, et on exige l'égalité. C'est la seule ligne du chantier
  qui protège durablement — elle empêche la classe entière du défaut de revenir sur une branche
  qu'on n'a pas encore écrite.

**Puis chaque ligne est devenue un dépliage qui nomme et qui agit** (addendum, même jour) : les
quatre nombres se déplient sur leur détail nommé, et chaque notion porte l'action qui la concerne —
créer une mission, l'équiper — via les routes **déjà existantes**. Aucune route d'écriture nouvelle.

- ⚠️ **Révoque le deuxième point de l'ADR-0038 §6**, écrit le matin même. Son motif était la
  *duplication d'un chemin existant* — or `create-missions` accepte des `skill_ids` arbitraires
  sans rapport de conseil. Les trois autres non-objectifs (bulletin, historique, fenêtre) tiennent.
- ⚠️ **Le XP se détaille par MOTIF, jamais par notion** : `XPEvent` ne porte pas de `skill_id`.
  Écrit dans l'ADR, dans le contrat **et à l'écran**, pour que ce ne soit pas pris pour un oubli.
- **`GET /progress/consolidated`**, écrite il y a des semaines et **appelée par personne**, sert
  enfin la colonne « Acquis » — chargée une fois pour toute la page, au premier dépliage.

🔴 **Une divergence réelle trouvée par le verrou général, et laissée ouverte** : le constat `flat`
compte les traces sur 730 jours quand sa cible `/cahier` est bornée serveur à 366. Une trace plus
ancienne est comptée et **invisible sur sa propre preuve**. L'ADR l'avait anticipé (« s'il rougit,
ce sera un chantier à part ») ; c'est inscrit en `xfail(strict=True)` — le jour où quelqu'un corrige
la fenêtre, le test devient rouge et force à retirer le marqueur.

**Aucune migration.** Backend `901 passed, 1 xfailed` · Papa `492` · `tsc -b` propre.
Vérifié à l'écran, session Papa connectée, sur les vraies données.

## 0.46.2 — Une bulle qu'on clique dit enfin QUELLES notions

> 🕓 **Entrée rétro-inscrite le 2026-08-05.** PR [#83](https://github.com/NeuronXcore/zetis-school/pull/83),
> squash `cb59600`, mergée le 2026-08-05 — elle n'avait jamais reçu d'entrée, et la dette a été
> consignée en clôturant 0.47.0. Reconstituée **depuis le message de squash, les ADR et
> `TROUBLESHOOTING.md`**, jamais de mémoire.
>
> ⚠️ **Numérotée 0.46.2 et non 0.47.0** : les versions suivantes sont déjà publiées dans
> l'historique Git. On rétro-inscrit à la place chronologique, on ne renumérote pas ce qui est sorti.

Cliquer une bulle de « Où agir » déplie l'analyse de la matière : les notions à renforcer y sont
enfin **nommées**, là où l'agrégat ne savait que les compter.

**Ferme un bug de cohérence constaté à l'écran** : *« Français : 8 notions à renforcer »* menait à
une page qui en montrait **UNE**. Le constat compte les notions **fragiles**, `/lacunes` liste des
lignes **`Gap`** — deux populations disjointes sous le même mot. Aucun test ne s'en apercevait :
celui censé garder ça ne vérifiait que *« href non vide et count >= 0 »*.

Trois apports :

- **une route d'évidence par matière**, sans LLM et sans écriture, qui **ne recalcule rien** — elle
  appelle les fonctions faisant déjà autorité ;
- **une portée matière pour le Conseil de classe**, dont l'ancrage anti-hallucination hérite
  gratuitement ;
- **le panneau lui-même**, seconde exception assumée au « zéro état de chargement » de l'ADR-0028 §4.

**La règle qui borne tout** : le réseau ne sert que ce que l'agrégat ne peut pas porter — des
**NOMS**. Corollaire vérifié à l'écran : changer de période panneau ouvert ne déclenche **aucune**
requête.

880 backend · 463 Papa · Massimo vert. Chaque commit vérifié seul par `stash`. **~30 sabotages,
dont trois ont démasqué mes propres tests** : un correctif de nuage qui ne marchait pas alors que
les tests étaient verts, un verrou d'ancrage sabotable en no-op, et deux assertions sur des
collections vides.

⚠️ **Migration `f7a8b9c0d1e2`** (`council_reports.subject_id`, nullable, sans backfill) **APPLIQUÉE
EN DEV SEULEMENT**, et **non exercée par les tests**.

---

## 0.46.1 — Une vue à l'année, et la carte « Où agir » qui redevient lisible

> 🕓 **Entrée rétro-inscrite le 2026-08-05.** PR [#82](https://github.com/NeuronXcore/zetis-school/pull/82),
> squash `38b994c`. Même dette, mêmes sources — cf. l'avertissement de 0.46.2 sur la numérotation.

Quatrième fenêtre **« Année »** (365 jours glissants) sur le tableau de bord Papa, et refonte de la
lisibilité de la carte « Où agir ».

> 🔴 **Le vrai contenu du lot n'est pas le bouton.** L'agrégat ne chargeait ses événements que sur
> **26 semaines**, et toutes les fenêtres n'étaient que des filtres en mémoire sur cette liste. Les
> deux nombres **coïncidaient par accident** — 182 jours couvrent tout juste 90 + 90. Posée dessus,
> l'« Année » aurait montré **la moitié** de ce qu'elle annonce, avec un delta valant **0 pour
> toujours**, et **aucun test n'aurait échoué.**

D'où deux bornes désormais explicites : `HISTORY_DAYS = max(PERIODS) × 2` pour le **chargement**,
`CALENDAR_WEEKS` pour la **seule** heatmap.

**Carte « Où agir »** : pictogrammes de matière à rayon inchangé (il porte l'aire ∝ notions),
échelle verticale adaptative avec mention du zoom, quadrants passés en **vraies médianes**, retrait
bas, et ordre de peinture par taille décroissante.

Corrige aussi le deep-link `?period=365` vers le Conseil, que la nouvelle fenêtre cassait : la table
était typée `Record<string, string>` et **avalait la clé en silence**.

857 backend · 432 Papa · 525 Massimo. Chaque verrou éprouvé **par sabotage** — dont **deux qui
étaient verts à tort** et ne sont ressortis que comme ça.

⚠️ **Rien n'a été vérifié à l'écran** : le dashboard est derrière le login Papa.

Aucune migration, aucune route, aucune dépendance.

---

## 0.46.0 — Le Journal se trie et se filtre, et pour ça son passé cesse de bouger

### Ajouté

- **Filtrage et tri du Journal, côté SERVEUR sur toute l'histoire** — six critères (date · matière ·
  chapitre · statut · mode ZETIS · type de contenu), quatre clés de tri inversables. `WHERE` puis
  `ORDER BY` puis `LIMIT` : filtrer une page déjà paginée aurait répondu « rien en maths » alors que
  les lots de maths sont page 4.
- **La pagination existe enfin à l'écran.** Elle manquait **avant** ce chantier : `has_more`
  voyageait dans la réponse sans être lu par personne, et au-delà de 20 lots la page était muette
  sans le dire. Le bouton **empile**, il ne feuillette pas.
- **Une barre de filtres qui ne cache pas ce qu'elle fait** : les contrôles se replient, les
  critères **actifs** se nomment et se retirent un par un. L'état vide **dit pourquoi** il est vide.
- **`production_runs.zetis_mode_source`** + six index (migration `e9f0a1b2c3d4`), et
  `scripts/backfill_zetis_mode.py` (`--dry-run` par défaut).

### Modifié

- **Le régime d'un lot cesse d'être re-dérivé à chaque lecture.** Il se lit sur le lot ; la
  déduction depuis les actes a lieu **une fois**. Motif : le veto **supprime la ligne `Lesson`**
  d'un cours retiré, donc la preuve partait avec elle et l'historique bougeait quand Papa exerçait
  un droit prévu.
- **Un chapitre créé sous un thème reçoit AUSSI sa matière d'année**, ou la création refuse en le
  disant. Sans cet ancrage il était invisible de la production, de la galaxie et de
  `canonical_context` — silencieusement.

### Décisions

- Addendum **ADR-0034 « tri et filtre du Journal »**. ⚠️ Il **corrige sa propre première version** :
  la décision « un résolveur de matière unique » est abandonnée dans le document, le trou étant un
  niveau plus bas et sans réparation locale possible.

## 0.45.0 — La production dit ce qu'elle a fait, et pourquoi elle ne l'a pas fait

Date : 2026-08-04 · branche `fix/production-trois-verites` · addenda **ADR-0036 « verdict de
situation »** et **ADR-0034 « régime et destination »** · migration **`d8e9f0a1b2c3`**

**Le point de départ n'était pas une revue de code.** Un lot bloqué à 95 % dans l'en-tête Papa, une
demande de Massimo qui n'aboutissait pas : le **worker de production n'était pas lancé**. Tout le
reste a été trouvé en tirant ce fil.

**Les tests n'écrivent plus dans le vrai Redis.** 18 jobs fantômes `run_production(1)` dormaient
dans la file de dev. La protection existait — cinq monkeypatchs à la main — donc elle manquait là où
personne n'y avait pensé. Fixture `autouse`, greffée sur la **fabrique de file** : patcher
`enqueue_production` aurait été vert et sans effet, `runs_router` l'important au niveau module.

**Une seule lecture d'un lot** (`useRunProgress`) pour l'en-tête, la modale et la ligne Demandes :
on n'estime que ce qui a **démarré**. Un lot resté en file montait jusqu'à 95 % et y restait.

**Le verdict porte sur la situation, plus seulement sur le type.** `blocked_reason` dit pourquoi un
lot lancé maintenant ne produirait rien, calculé par le code même que le lot exécute. L'écran
remplace « Produire » par le motif et le geste qui répare. Motifs réécrits en **état + geste** — le
vocabulaire d'ADR (« à ce palier », « à votre place ») a quitté l'écran.

**Une demande se referme sur le FAIT.** `close_available_requests` est appelée à la lecture de la
file, plus seulement à la fin d'un lot : Papa qui rédige un cours depuis Programme referme la
demande sans cliquer « Fait ».

**Le Journal situe.** Le régime de chaque lot — **capturé** au démarrage, ou **déduit de ses actes**
quand il est antérieur, jamais lu dans les réglages du jour. Une destination sur chaque ligne et
chaque pièce. Une annotation « depuis résolu » qui parle au présent **sans réécrire** la ligne
passée. Une case d'état **dessinée** (les glyphes Unicode étaient invisibles sur fond sombre). Un
résumé dans l'en-tête, et **un seul pli par lot, fermé** — le lot #3 aligne 33 pièces.

**Trois boucles de test, une par level ZETIS** : la table de vérité `manuel / semi / autonome`
jouée sur le chemin complet demande → lot → exécution. C'est la forme qui aurait attrapé le
cul-de-sac toute seule.

839 tests backend · 400 Papa · 525 Massimo · `tsc -b` vert. Vérifié à l'écran dans Chrome.

## 0.44.0 — Les deux bandeaux portent enfin quelque chose

Date : 2026-08-04 · **PR #78** (Papa) et **PR #79** (Massimo) · addendum **ADR-0029 « La galaxie
dans le bandeau »** · aucune migration, aucune ligne de backend

**Papa — l'emblème ZETIS, en entier.** Le header de coquille passe de `py-3` (~44 px) à
`h-28 sm:h-36` et porte la bande de marque. Deux pièges payés à l'écran : `bg-cover` met l'image à
l'échelle de la **largeur** et la rognait par le haut (`bg-contain` cale sur la hauteur) ; et le
fondu latéral, posé sur `inset-0`, tombait **hors de l'image** — le rectangle sombre se voyait
comme une couture. Les 3 test-verrous de `PapaLayout.test.tsx` passent **sans avoir été touchés**.

**Massimo — sa galaxie, à la place d'un décor qui ne disait rien.** `NeuralCubes` (22 cubes) et
`NeuralLinks` (8 liens SVG) sont **supprimés** : ils maintenaient **78 animations infinies**, dont
une sur `filter` (propriété non composable), soit ~38 éléments repeints à chaque image, sur les
**21 routes**, en permanence. À la place, les 202 nœuds de son graphe réel se construisent depuis
l'emblème en ~5,8 s, puis **tournent** (un tour en 72 s, 19 im/s mesurées), sous une couronne
solaire dorée. Quatre modules, dont trois purs et testés sans DOM.

⚠️ **UN TROU DE BUDGET DE BUNDLE, TROUVÉ ET DÉMONTRÉ.** `accueil.bundle.test.ts` et
`matiere.bundle.test.ts` partent d'une **page** : `MassimoLayout` et `MassimoBannerHeader` ne sont
dans aucun des deux graphes d'imports. Sabotage joué — avec un `import()` du moteur 3D dans le
header, **les deux suites restent 12/12 vertes** tout en chargeant 1,37 Mo sur les 21 routes.
Fermé par `layout.bundle.test.ts` (chrome, budget zéro) et `app.bundle.test.ts` (liste épinglée des
points de montage).

⚠️ **Le header Massimo a enfin des tests, et son absence n'était pas un oubli** : `NeuralLinks`
construisait un `ResizeObserver` que jsdom n'implémente pas et que `test/setup.ts` ne polyfille pas
— le monter jetait `ReferenceError`. Sont désormais verrouillés la hauteur `h-24 sm:h-28` (que
`GalaxyPage.tsx:542` recopie en dur), le cadrage du sprite, le lien `/galaxy` et l'absence de
« ZETIS Papa ».

**Trois corrections venues de l'écran, pas du plan** : le graphe fait 202 nœuds pour 47 notions
datées, donc la bande était vide à 77 % — l'inverse de la saturation redoutée ; le budget de
particules raisonnait sur le débit moyen alors que les ancêtres naissent en grappe (34 en vol pour
un budget de 32) ; et remplir la bande à 90 % à l'arrêt faisait s'effondrer la silhouette à 52 % en
tournant.

**Coût assumé** : dès que la galaxie tourne, le calque posé ne sert plus et le coût par image
redevient **proportionnel à N**. Le test qui promettait un coût borné a été **réécrit pour dire
vrai**, pas relâché.

**525 tests Massimo + 382 Papa verts**, `tsc -b` propre sur les deux.

**Laissé de côté, avec son motif** : **rien n'a été jugé à l'œil sur un vrai appareil**. Le panneau
navigateur de la session rendait en taille réduite — tout ce qui précède sur le rendu est mesuré
dans le canvas. `IN_FLIGHT_BUDGET`, `ROTATION_PERIOD` et `FLATTEN` n'ont pas vu le profileur.

## 0.43.1 — Le backend cesse de dépendre de noms que Starlette a retirés

Date : 2026-08-04 · **PR #76** (squash `689d136`) et **PR #77** (squash `0ba3915`) · aucun ADR

⚠️ **Entretien pur : rien ne change pour Massimo ni pour Papa.** Consigné quand même, parce que le
dépôt vient de perdre une garantie sans le dire.

**Les constantes suivent la lib.** Starlette 1.3.1 annonce quatre renommages ; nous en utilisions
deux — `HTTP_422_UNPROCESSABLE_ENTITY` (24 occurrences, 8 fichiers) et
`HTTP_413_REQUEST_ENTITY_TOO_LARGE` (1, dans `eli5`), soit **9 fichiers répartis sur 6 modules**.

> ⚠️ Les messages de commit et les deux PR annoncent « 8 **modules** » : c'était le compte des
> *fichiers* portant le 422. Erreur attrapée au contrôle de clôture, après merge — corrigée ici.

Renommage **strictement lexical** : 422 vaut
toujours 422, aucune réponse d'API ne change, aucun test n'a eu à être adapté. Warnings de
dépréciation dans notre code : **15 → 0**.

⚠️ **Le 413 ne se plaignait pas** — son chemin n'est exercé par aucun test, donc sa dépréciation
n'apparaissait dans aucune sortie. Trouvé en lisant la table de renommages de la version installée,
pas en suivant les warnings. Et la dérive avait déjà commencé : `curriculum/service.py` portait
*déjà* un `UNPROCESSABLE_CONTENT` au milieu de ses dépréciés.

**Le plancher dit enfin ce dont le code a besoin.** `pyproject.toml` déclarait `fastapi>=0.115` et
rien d'autre ; le renommage venait de rendre cette contrainte fausse — sous ce plancher, l'app casse
**à l'import**, pas au premier appel. `starlette>=0.48` est déclaré en dépendance **directe**, alors
qu'aucun module ne l'importe : le code fait `from fastapi import status`, mais ces constantes
appartiennent à starlette, que fastapi ré-exporte. Le plancher porte sur l'**API utilisée**, pas sur
son emballage. `0.48` est **mesuré** — absent en 0.47.3, présent en 0.48.0 — et non « la version
qu'on fait tourner », qui aurait interdit sans raison tout ce qui marche.

Coût : deux lignes de métadonnées dans `uv.lock`, **aucun paquet ne bouge**. **807 tests verts.**

**Laissé de côté, avec son motif** : les 22 montées de dépendances (dont `websockets` 16→17,
`pgvector` 0.4→0.5, `piper-tts` 1.4→1.6), qu'**aucun test ne juge** — elles demandent une
vérification live de la génération, du RAG et de la dictée. Et le warning `httpx2`, qui ajouterait
un **second** client HTTP au venv sans en remplacer aucun.

## 0.43.0 — Papa sait dans quel régime ZETIS travaille, sans quitter sa page

Date : 2026-08-04 · **PR #75, squash `60604a3`** · addenda **ADR-0032 §7 et §8**

> ⚠️ Trois chantiers en une seule entrée, et c'est le merge qui l'a imposé : les branches
> `feat/etat-zetis-sidebar` → `feat/zetis-levels` → `refactor/vocabulaire-niveau-palier` étaient
> **empilées**, chacune descendant de la précédente. Les merger séparément aurait cassé. Elles sont
> supprimées ; les 20 commits se lisent dans la PR #75, pas dans `git log main`.

L'ADR-0032 avait livré un régime réglable et un régime dérivé, mais **aucune surface de lecture
hors de `/parametres`**. Papa change de page vingt fois par session ; savoir où en est ZETIS lui
coûtait à chaque fois de quitter ce qu'il faisait.

**Le point dur : l'autonomie a DEUX axes, pas un.** Le régime dit ce que ZETIS sert sans relecture ;
le déclencheur (ADR-0035 §5) dit s'il démarre sans clic. *Autonome + désarmé* = « ZETIS sert seul
mais attend votre clic ». Un signe unique mentirait sur **deux lignes de la table de vérité sur
quatre**. D'où : l'avatar porte le régime, un glyphe ⏸/⚡ porte le déclencheur.

**En tête de sidebar** — un avatar de 88 px, un badge à cheval portant les deux axes, un halo
**gradué par le régime** (fixe → souffle → souffle + rotation : l'échelle du mouvement suit
l'échelle qu'elle signale), et une infobulle au cadre teinté. `prefers-reduced-motion` **fige tout
sans rien retirer** — couper le halo effacerait le signal.

**Sur `/parametres`** — la section devient **ZETIS LEVELS** et passe en tête. Sous les cartes, un
panneau **calculé** (jamais rédigé : une prose *classe × niveau* recopierait la matrice du §G.2 sous
une forme que le serveur ne peut pas refuser) qui montre ce que le niveau décide **et ce qu'aucun
niveau ne change** — quatre classes sur six sont verrouillées, les taire promettrait une richesse
que la donnée n'a pas. La confirmation garde l'**enregistrement**, pas le brouillon, et son corps
est l'**écart** avant→après : la seule chose que la page ne dit pas.

⚠️ **Deux décisions écrites révoquées, contre-motifs au dossier** : la primauté du constat sur le
réglage (§8.1 — révoquée *à la lettre*, gardée *en esprit*, et défendable **uniquement** parce que
le §7 a mis l'état en sidebar) ; et « on ne freine pas un retour au contrôle » (§8.4 — la modale ne
garde plus le geste mais l'écriture, le motif survit dans le **ton**).

**Vocabulaire unifié de bout en bout** (§8.0) : un **niveau** se choisit (les trois régimes), un
**palier** se subit (le degré 0-3 d'une classe). Documentation, code **et clé JSON** — `preset` →
`niveau`, back et front, sans migration : le niveau est **dérivé**, jamais stocké.

⚠️ **Et un dispositif que le dépôt n'avait pas** : `packages/types/contracts/`, des réponses
**capturées** du serveur réel, relues par un test de chaque côté. C'est la seule chose qui peut voir
un renommage de clé — les 805 + 382 tests restaient verts sur un contrat rompu.

**Sans rapport mais trouvé en chemin** : la sidebar Papa n'était pas clippée, donc le **document**
grandissait à sa hauteur et c'est le body qui défilait — header et sidebar partaient à l'écran.
« ⚙️ Paramètres », dernière des 22 entrées, n'était atteignable qu'en scrollant toute la page.

## 0.42.0 — Massimo peut enfin ouvrir ZETIS sur un téléphone

Date : 2026-08-04 · branche `fix/sidebar-massimo-mobile` · aucun ADR (correctif)

**Trouvé en allant vérifier autre chose** : la dette « la galaxie n'a jamais été vue sur trois
appareils », exhumée de l'historique de `MEMORY.md` le matin même. Au premier viewport mobile,
**ce n'est pas la galaxie qui a cassé**.

La sidebar portait `w-60 shrink-0` **sans aucun point de rupture** — largeur fixe de 240 px, jamais
repliée. Sur un écran de 375 px : **135 px** de contenu pour Massimo, et un canevas de galaxie de
**170 × 800**, un ruban vertical. `CLAUDE.md` exige pourtant une version iPhone.

⚠️ **Pourquoi 453 tests ne l'avaient jamais vu** : jsdom n'a pas de viewport, les classes Tailwind
n'y sont jamais évaluées, et aucun test ne rendait le layout à une largeur donnée. **Une classe CSS
absente ne casse aucun test — elle casse l'écran.**

⚠️ **La spec prescrivait la solution, et l'appliquer aurait cassé trois ADR.**
`docs/frontend-massimo/navigation.md` annonce une **bottom-nav des 5 verbes** sur iPhone — décision
de l'étape 2, jamais construite. Mais la navigation porte **13 entrées**, chacune ajoutée par une
décision postérieure : Agenda en position 2 (ADR-0025, « contre-intuitif et assumé »), « Ma Galaxie »
(addendum ADR-0024 §A, qui **interdit** d'en faire un 6ᵉ onglet), six témoins (ADR-0030,
test-verrou). **Appliquer la lettre de la spec aurait masqué 8 sections sur mobile.**

**Correctif retenu : un tiroir.** Sous `md`, l'`aside` sort du flux (`fixed`) et coulisse derrière
un bouton ☰ ; `md:static md:translate-x-0` annule tout au-dessus — **le rendu desktop/tablette ne
change pas d'un pixel**. Rien n'est retiré, aucun ADR contredit, et l'écart avec la spec est
consigné dans la spec elle-même.

**Vérifié à l'écran** : fermé → `x = -240` et contenu sur 375 px ; ouvert → `x = 0` avec les
13 entrées et les 6 témoins intacts ; voile touché → refermé **et retiré du DOM**.

**La dette d'origine ne se referme qu'à moitié** : **202 nœuds** (185 notions) à **74 FPS**, zéro
erreur console, lisible en desktop et tablette. Mais **un viewport n'est pas un iPhone** — ni Safari
iOS, ni son GPU — et **185 notions n'est pas « plusieurs centaines »**. La moitié *performance*
exige un appareil réel.

**453 → 458 tests Massimo**, typecheck et build verts. Aucun test existant modifié.


## 0.41.0 — « la leçon d'une notion » : trois réponses, une seule désormais

Date : 2026-08-03 · branche `feat/lecon-canonique` · ADR-0037

`lesson_skills` est une liaison **n-n** : une notion peut être portée par plusieurs leçons. Trois
modules répondaient différemment à « quelle est **LA** leçon de cette notion ? » — la production
triait par `id` sans aucun filtre d'année, la galaxie par `updated_at` dans l'année active, le
contexte canonique par `updated_at` sur un cours rédigé.

**Le symptôme visible était bruyant** : la production se bloquait (« Cours à valider ») sur une
notion dont Massimo consultait le cours — deux leçons validées, l'une avec cours, l'autre sans, et
les deux modules ne retenaient pas la même.

⚠️ **Le vrai risque était SILENCIEUX** : produire une fiche sur la leçon que la galaxie n'oriente
pas la rend **atteignable par personne**. Aucune erreur, aucun événement de journal, aucun test
rouge — du temps GPU payé, du contenu validé, et invisible. Même famille que la porte ouverte sur
du vide du 2026-07-30.

**Un module PLAT** (`lesson_resolution.py`, patron `provenance.py`) porte désormais **l'ordre et le
périmètre**. Il ne porte **aucun filtre de statut de leçon**, et c'est le cœur de la décision :
imposer le `validated` de la galaxie à la production **supprimerait le palier 3**, celui où ZETIS a
le droit de rédiger puis de valider le cours d'un brouillon. Chaque appelant garde son gate.

⚠️ **Deux changements de comportement assumés** : l'ordre passe de « dernière **créée** » à
« dernière **touchée** », et la production hérite du périmètre « année active », qu'elle n'avait
pas — elle pouvait équiper la leçon de l'an dernier.

**Mesuré avant de merger, pas espéré** — sur les 278 notions de la base de dev : **273 inchangées
(98 %)**, **5 changées** (exactement les notions à deux leçons), **0 devenue inéligible**. Sur les
5 : **4 gagnent un cours, 1 neutre, 0 en perd**. Accord des trois lecteurs sur les 278 : **0
désaccord**.

**Corrigé au passage** : `select_notions` faisait **une requête par notion** — 31 allers-retours
pour un chapitre dense, avant même de produire.

**Aucune migration** : le défaut était une divergence de lecture, pas de modèle.
**805 backend** (797 avant) · **318 Papa** · **453 Massimo** · build Papa · typecheck Massimo.


## 0.40.0 — ce que Massimo demande, ZETIS le produit

Date : 2026-08-03 · branche `feat/demande-vers-production` · ADR-0036

**La dernière boucle ouverte du dispositif se ferme.** `notion_requests` (« cette notion n'est pas
à mon programme ») avait une boucle complète ; `content_requests` (« il manque une fiche ») n'en
avait aucune. Papa disposait de « Fait » et « Ignorer », et **aucun des deux ne produisait quoi que
ce soit** : « Fait » était une **déclaration**. Le seul garde-fou vivait en aval — `announce.py`
refusait d'annoncer à Massimo un `done` non servable.

**`trigger='request'` s'émet enfin**, après avoir été modélisé, migré, contraint et **volontairement
non écrit**. Mais sous **DEUX conditions cumulatives** : régime ***Autonome*** **ET** déclencheur
armé. Ce n'est pas la fusion que l'ADR-0035 §5 avait refusée — celle-là rendait le dispositif plus
**permissif**, la conjonction est plus **restrictive**. Le motif est une différence de nature : une
échéance est **exogène** (quelqu'un du monde réel a écrit qu'il y avait un contrôle), une demande
est **endogène** — Massimo peut en poser dix un soir d'ennui.

**Un lot peut désormais viser UNE PIÈCE.** Il ne savait produire qu'un chapitre : brancher la
demande sans scope de pièce aurait fait produire ~30 objets parce qu'une fiche manque. Deux
colonnes explicites, une contrainte SQL « exactement un scope », **une seule branche** dans le
runner — le gate, l'ordre, le journal, le tamponnage et la préemption ne bougent pas.
⚠️ Le scope n'est **pas** dérivé de `content_request_id` : *« les colonnes disent POURQUOI on a
produit, jamais SUR QUOI »* (ADR-0031 §4).

**« Fait » cesse d'être une déclaration.** Une demande se referme **toute seule** quand le contenu
existe **et est servable** — la règle qu'`announce.py` appliquait déjà en lecture, appliquée cette
fois à l'écriture, via le même prédicat unique (`resolve_panoply`). Le balayage porte sur **toutes**
les demandes en attente : ce qui ferme une demande est que le contenu soit là, **pas qu'un lot
particulier l'ait produit**. Papa qui produit un chapitre referme donc aussi ce qu'il satisfait au
passage. ⚠️ **Un lot en échec ne ferme rien**, même quand la fermeture aurait abouti.

**Un quota distinct pour les demandes.** Le régulateur compte des **lots**, pas du **coût** : un
lot-pièce (~15 s mesuré) y pesait autant qu'un lot-chapitre (~36 min). Sans compteur séparé, deux
fiches demandées auraient privé le contrôle du jeudi de sa préparation. Trois compteurs, trois
natures — clic de Papa (aucun) · échéance (2/sem) · demande (10/sem).

**La capsule reste manuelle, et l'écran le dit.** ⚠️ Ce n'est pas un choix de périmètre mais un
**constat de code**, trouvé au read-before-code et qui a fait **corriger l'ADR le jour même** :
`create_capsule` exige une **instruction en texte libre** — l'intention pédagogique de Papa — qu'une
demande `(notion, type)` ne porte pas. La page affiche « À écrire toi-même → » : un constat avec son
geste à côté, jamais un bouton grisé.

**Le bouton « Produire » qui manquait.** La page Demandes n'offrait qu'un lien sortant vers la
Couverture. ⚠️ Il émet `trigger='manual'` : le trigger dit **qui a décidé**, et Papa clique.

**Vu à l'écran, corrigé à l'écran** — trois défauts que 796 tests ne pouvaient pas voir :
l'indicateur d'en-tête restait **figé à 0 %** (`progress_pct` compte des notions, un lot-pièce n'en
a qu'une) ; **« ZETIS produit un chapitre » était écrit en dur** à deux endroits ; le **sondage à
20 s était plus lent que les lots de 15 s** qu'il surveille. S'y ajoutent une barre de pourcentage
au clic et une carte de fin centrée qui **s'efface seule** — une annonce qui s'empile deviendrait
un arriéré, c'est-à-dire le « vous êtes en retard » que le §F.2 interdit.

**Un défaut trouvé en faisant tourner le dispositif ARMÉ, jamais par un test** : le réveil
périodique se **dupliquait à chaque redémarrage du worker**. L'amorçage au démarrage et
l'auto-replanification en `finally` sont justes séparément ; ensemble, chaque redémarrage ajoutait
une récurrence permanente — quatre réveils après quatre démarrages. Bénin en dev, pas en production
où un worker redémarre à chaque déploiement. Dette de l'ADR-0035, **corrigée ici**.
⚠️ Le correctif évident — un `job_id` fixe — était piégeux : le job se serait replanifié sous son
propre identifiant, et RQ efface le hash du job terminé après son `finally`.

**Migration `c7d8e9f0a1b2`.** **797 backend** (776 avant) · **318 Papa** (309 avant) · build Papa ·
typecheck Massimo. Vérifié en vrai sur Postgres + Ollama : les quatre générateurs par le chemin
`equip_piece`, le gate du cours, les quatre états de la double condition, l'idempotence,
l'auto-fermeture et l'écran.

⚠️ **Rien n'est armé en dev** : régime *Semi-autonome*, déclencheur désarmé. Livrer la possibilité
était le chantier ; l'activer est une décision de Papa.


## 0.39.0 — ZETIS se met au travail tout seul, et l'échéance commande ses missions

Date : 2026-08-03 · branche `feat/declencheur-agenda` · ADR-0035 + son addendum

**Le second axe de « full autonomie ».** Le palier disait « ZETIS ne me demande plus de valider » ;
le déclencheur dit « ZETIS travaille sans que je clique », et il n'existait pas — tout lot partait
d'un clic de Papa.

**`parent_rule` s'écrit pour la première fois** depuis sa déclaration du 2026-07-28. Le §G.1 la
définit par l'absence de clic ; un lot né du scan satisfait enfin cette définition. `authority_for`
n'a pas été touchée : elle attendait ce jour.

**L'objection écrite dans le code est satisfaite, pas contournée.** `production_worker.py` portait
`with_scheduler=False` au motif qu'un scheduler ouvrirait la porte à « tous les dimanches, produire
quelque chose ». Le motif reste juste et **rien de ce qu'il interdisait n'arrive** : le job
périodique ne produit RIEN, il **regarde** si le monde réel a demandé quelque chose. Le commentaire
est réécrit, pas supprimé.

**Le régulateur qui devenait obligatoire** : N lots automatiques par fenêtre glissante (défaut 2),
et il REFUSE en le disant. Les lots **manuels ne comptent pas** — quand Papa clique, le geste EST le
régulateur.

**Puis quatre questions à la relecture ont montré l'écart entre ce que Papa croit déclencher et ce
qui se passe** (addendum, même jour) :

- ⚠️ **RÉVOCATION du §1** : `devoir` déclenche aussi. Restreint à `controle`, le déclencheur ne se
  serait presque jamais mis en route — `devoir` est le kind par DÉFAUT. Le contre-motif reste au
  dossier et il est **traité par le tri** : un contrôle dans 6 jours passe AVANT un devoir de
  demain.
- **Le chapitre s'attache après coup**, et une échéance sans chapitre **dit** que ZETIS ne fera
  rien — sinon le déclencheur paraît en panne.
- **La porte « échéance » du Commander est branchée** (ADR-0025 §11, décidée le 2026-07-30, jamais
  implémentée) — **sans une ligne de backend** : `gate: "deadline"` existait depuis l'origine,
  déclaré et jamais alimenté.
- **Deux corrections de provenance** : ce que Papa écrit à la main portait `validated_by IS NULL`
  (le Journal l'affichait « provenance inconnue »), et « + Programme » créait une notion que ZETIS
  ne pourra jamais servir **sans le dire**.

**776 tests backend · 309 Papa.** **Aucune migration, aucune dépendance nouvelle** — quatre verrous
déjà écrits levés, plus le régulateur.

> **Les deux axes sont livrés.** ⚠️ Mais en dev, tout est resté aux défauts : régime
> *Semi-autonome*, déclencheur **désarmé**. Les armer est une décision de Papa, en deux clics.

## 0.38.0 — Le Journal de production, et « Autonome » devient possible

Date : 2026-08-03 · branche `feat/journal-production` · ADR-0034

**Le lot cessait de dire ce qu'il faisait.** `runner.execute` calculait le détail par pièce
(`generated` / `skipped` / `errors`, notion par notion) et le retournait au job RQ — **dont personne
ne lit le retour**. Seul `done_notions` survivait. La donnée demandée existait déjà en mémoire ; il
manquait une table pour la retenir. `production_events` la retient, **dans la même transaction que
l'acte qu'elle trace**, et **sans instrumenter aucun générateur** (ce que l'addendum ADR-0031
interdit). Une notion écartée par le gate du §7 y écrit sa ligne avec son motif : une notion omise
en silence se lisait comme un échec de production.

**Le veto devient un geste.** Page Papa `/journal` : les lots du plus récent au plus ancien, leurs
pièces, leur provenance **par objet**, et *Retirer* tant que Massimo n'a pas ouvert. Suppression
franche — aucune trace, aucun signal (invariant V1) — à rebours de l'ADR-0025 sur l'agenda, parce
que l'agenda est **co-édité** par Massimo et qu'ici la pièce n'a jamais existé pour lui.

**Retirer un cours emporte ses dérivés, et SE REFUSE si l'un d'eux est consommé.** Retirer quand
même ferait disparaître, sous les yeux de Massimo, la source d'une fiche qu'il a lue — le trou
inexpliqué que V1 interdit. **Refuser est plus honnête que retirer à moitié.**

**Deux défauts que le cadrage n'avait pas vus.** `Lesson.production_run_id` n'était **jamais**
écrit : le filigrane n'attribue que les lignes *nées*, or `equip_notion` écrit dans une leçon
préexistante — le veto sur le cours n'aurait identifié **aucun** cours. Et le §G.3 énumérait quatre
familles consommables **en oubliant le COURS**, d'où la table `lesson_views`, quatrième du patron.

**`VETO_SURFACE_AVAILABLE = True`.** Une ligne : le serveur rouvre le palier 3 d'A1, le régime
*Autonome* est offert, **aucune ligne du front n'a changé** — `choices` vient du serveur, comme
l'ADR-0032 l'avait prévu. Vérifié à l'écran, dont deux choses jamais vues : la **modale de
révocation d'A1** et la **monotonie** (A1 = 3 force A0a = 3).

**Une migration** (`b6c7d8e9f0a1`) pour quatre changements de schéma. **757 tests backend ·
295 Papa.** Le régime réel reste sur *Semi-autonome* : livrer la possibilité du palier 3 est le
chantier, l'activer est une décision de Papa.

> **Ce qui reste hors de ce lot** : le déclencheur automatique (ADR-0035, cadré, non codé). Tant
> qu'aucun lot ne part sans clic, `parent_rule` reste **légale et non émise** — la colonne
> « demandé par » du Journal l'attend déjà.

## 0.37.0 — La page matière devient un index de notions

Date : 2026-08-01 · branche `feat/page-matiere` · addenda ADR-0024 (index de notions) et ADR-0027
(demandes depuis une surface élève)

**`/subjects/:slug` cesse d'être une maquette.** Elle était encore sur `data/mock.ts` : un
launcher au grain matière (« Niveau 5 · 320 XP », quatre tuiles dont trois inertes, un « Faire un
quiz » sans `onClick`), antérieur à la doctrine ADR-0024 §5 et la contredisant sur trois points.
Rien n'en est repris **sauf la route**.

Elle devient l'**index des notions** : recherche locale à la frappe (accents pliés, surlignage,
`Échap`), accordéon par chapitre, **panoplie de 7 pastilles** par notion, panneau d'activités, et
demande à ZETIS de ce qui manque. Elle rend le même modèle que la constellation, en liste — elle
**EST** le repli sans WebGL promis par `zetis-galaxy.md §11`, et un test de budget lui interdit
tout chunk 3D **dans les deux formes** (`import` et `import()`).

**Backend — un seul prédicat de disponibilité dans le dépôt.** `resolve_panoply` le porte en
version ensembliste ; `notion_panel` en devient le consommateur mono-notion et ne calcule plus
rien. Le correctif du 2026-07-30 avait déjà prouvé ce que coûte un second prédicat (le cours
annoncé disponible sur `lesson_id is not None` d'un côté, sur `content_markdown IS NOT NULL` de
l'autre — une porte ouverte sur du vide). **14 requêtes, constantes de 3 à 100 notions.**

**Deux routes neuves** : `GET /api/student/subjects/{slug}/panoply` et — en commit séparé, parce
que c'est une décision de sécurité — `POST /api/student/content-requests`, première **écriture
enfant** sur un module jusqu'ici `require_parent`. Trois garde-fous testés, dont le seul qui
compte vraiment : un `skill_id` invisible rend **404 sans créer de ligne**, sinon la route devient
un **oracle d'existence** sur les brouillons de Papa. **Aucun `GET`, aucun `PATCH` élève** — la
file de Papa n'est pas une surface de l'enfant.

**Changement de comportement assumé : `eli5` n'est plus toujours disponible.** Il suit le cours
validé. ELI5 s'ancre sur le cours canonique et dégrade vers le modèle en son absence ; le chat
refusait déjà d'y router de son côté, donc la règle vivait **en double**. Elle est descendue dans
le prédicat, et la duplication a été retirée du chat.

**Preuve de non-régression, en deux temps.** L'extraction seule (avec `eli5` inchangé) a passé les
**668 tests sans qu'un seul soit modifié** ; la bascule ELI5 a ensuite fait tomber **exactement
une** assertion, retournée avec son motif. Même méthode pour la table `kind → route` extraite de
`NotionActionPanel` : **aucun test ne couvrait les destinations** — 9 cas de caractérisation
écrits d'abord, 7 intacts après extraction, 2 changés exprès.

**Six tours d'affinage au vu de l'écran**, chacun avec sa décision :

- chapitres **repliés** à l'ouverture (la page présente la matière, pas un chapitre choisi pour
  Massimo) — et un témoin « **N prêtes** » sur l'en-tête replié, un COMPTE jamais un ratio ;
- « demander à **ZETIS** » (l'interlocuteur de l'enfant, Papa restant le destinataire), en
  **orange électrique** `#ff7a1a` qui **rayonne** plutôt qu'il ne crie — la teinte n'a aucune
  marge (l'or est à 18°, le rouge est banni), donc l'axe est la **luminosité** ;
- une **bande « ce que ZETIS a pour cette matière »** remplace la carte « N cartes à revoir », qui
  n'annonçait qu'un type sur six. **Zéro requête ajoutée** : la panoplie porte déjà les ids ;
- **`/quiz` accepte `?subject=`**, à la suite d'un signalement — « le KPI 1 quiz ne marche pas ».
  L'audit de la base a montré que **le compte était juste** sur les 8 matières : ce qui était
  cassé, c'était l'**affordance**. La pastille était non cliquable par décision (aucune route par
  matière), mais rendue comme les cliquables. **Une chose qui ressemble à un lien doit être un
  lien** — d'où le lien profond, et d'où le fait qu'une pastille inerte se distingue désormais à
  l'œil (il ne reste que `capsule` dans ce cas).

**Deux divergences ASSUMÉES avec l'addendum ADR-0027**, écrites dans la spec avec leur motif : le
libellé « à Papa » devenu « à ZETIS », et la phrase « ZETIS transmet la demande. Il ne fabrique
rien tout seul. » **supprimée** — ZETIS produira bientôt du contenu, la phrase deviendrait fausse.
Le test qui la vérifiait a été **remplacé**, pas supprimé : il interdit désormais toute promesse
de livraison.

**⚠️ Trois pièges à ne pas re-découvrir**, tous dans `TROUBLESHOOTING.md` : `app.routes` n'est pas
à plat (un test « cette route n'existe pas » y passe **à vide**, donc ne protège de rien) ;
`normalizeSearch` change la **longueur** de la chaîne, donc surligner avec ses index décale le
`<mark>` d'un cran par accent ; la panoplie n'expose que la ressource **la plus récente par
leçon**, si bien qu'une matière peut afficher « 1 fiche » ici et « 3 fiches » sur `/fiches` — les
deux nombres sont justes, ils ne répondent pas à la même question ; et un test qui lit
`window.location` sous `MemoryRouter` est **vert à vide** (le routeur mémoire n'y touche pas).

**690 tests backend · 447 Massimo · 270 Papa · 2 typecheck · build.** Zéro table, zéro migration.

**Reste dû** : la page **n'a jamais été vue à l'écran par l'agent** (navigateur non connecté de
son côté) ; les deux ADR addenda manquent encore au dépôt, avec les deux divergences à y porter.

## 0.36.0 — Ce qui est nouveau, et ce qui arrive

Date : 2026-08-01 · branche `feat/news-badges` · ADR-0030 « Témoins de nouveauté en navigation »
+ addendum ADR-0025 §12

**Six entrées de la sidebar Massimo portent un témoin de nouveauté** — Agenda, Fiches, Capsules,
Révision, Missions, Mindmaps — servis par **un seul appel** `GET /api/student/news/summary`, monté
une fois dans `MassimoLayout`.

La règle tient en une phrase : *un badge compte ce qui est **NOUVEAU** (meurt d'un **regard**),
jamais ce qui est **DÛ** (meurt du **travail**, et grossit quand Massimo ne vient pas)*. La seconde
colonne est la définition d'une relance. Deux test-verrous la tiennent : aucune source ne lit
d'échéance (vérifié sur le **source** des six compteurs), et aucun écoulement du temps n'augmente
un badge.

**Quatre écarts au cadrage, tous constatés au vu du code :**

- ⚠️ Le constat de départ était **faux** : la sidebar portait **déjà** deux pastilles, chacune avec
  son `fetch` au montage. Le lot en **unifie deux et en ajoute quatre** ; la sidebar ne fait plus
  aucun appel réseau, et un test l'interdit.
- ⚠️ **La pastille Révision déjà livrée violait la règle.** `reviews/summary.new_count` exige
  `due_at <= now` alors que `schedule_review` crée les cartes avec une échéance **future** : une
  carte fraîchement générée entrait dans le compteur **1 à 7 jours plus tard, sans aucun geste**.
  Expression dédiée `new_cards_count`, sans clause d'échéance — le badge s'allume désormais dès la
  génération par Papa (conséquence visible, assumée).
- « Le badge `DeckDisc` repris à l'identique » était ambigu : `DeckDisc` en porte **deux**, dont un
  compteur de cartes **dues**. Retenu : la teinte emerald, le plafond `9+` (`capNewsBadge`), et
  **pas** le dégradé indigo/cyan — lui ressembler ferait passer un témoin pour un arriéré.
  `cappedCount` (15+) reste un autre objet, un test croise les deux.
- **Mindmaps n'est plus différé.** `POST /mindmaps/{id}/seen` répondait 204 **sans rien persister**
  depuis la slice A de l'ADR-0016. Table `mindmap_views` (calque de `fiche_views`, **sans
  compteur** : relire une carte n'est pas une information pédagogique). Plus aucune famille de
  dérivés n'est sans témoin.

**Le badge ne dit pas *quand*, et une autre surface s'en charge.** Un badge est un nombre sans
date : « 3 » ne dit pas « contrôle jeudi ». Le bandeau d'Accueil ne demandait au serveur
qu'aujourd'hui et demain — un contrôle de jeudi restait invisible jusqu'à mercredi. Il gagne une
section **« À préparer »** alimentée par `/agenda/upcoming` (livré au Lot 1, jamais remonté),
**avec les dates**, plafonnée à 2. Zéro backend. La date est légitime : une échéance venue du
collège est un fait **subi**, jamais un compte à rebours fabriqué par ZETIS.

**Aucun polling, aucune horloge.** Rafraîchi par `NEWS_CHANGED_EVENT`, émis dans `lib/` à côté de
l'écriture réseau — jamais par les pages, pour qu'aucun appelant futur ne puisse l'oublier.

**Migrations** : `c1d2e3f4a5b6` (`student_profiles.agenda_last_seen_at` — un horodatage par élève,
jamais un `seen_at` par item, qui joint à `done_at` fabriquerait « vu le 12, jamais fait ») et
`d2e3f4a5b6c7` (`mindmap_views`). Aucun backfill sur l'une comme sur l'autre.

**Vérifié** : 668 tests backend, 319 Massimo, build et typecheck verts. E2E live — les six badges
correspondent à l'API, retombent **sans rechargement de page**, trois requêtes sur toute la session
(dont deux de double-montage StrictMode) et **aucun appel périodique** ; mindmaps 14 → 13 après un
regard, inchangé au rejeu. Les verrous ont été **mutés** pour vérifier qu'ils mordent.

## 0.35.0 — Tout voir, et voir ça arriver

Date : 2026-07-31 · branche `feat/galaxy-animations` · addenda ADR-0024 « Galaxie animée » et
ADR-0029 « Construction depuis root »

> Le prompt de chantier annonçait `0.34.0` : ce numéro était déjà pris par le système solaire,
> livré le même jour. Corrigé ici plutôt que dans le prompt, qui est daté.

**Le plafond de nœuds est supprimé.**

- `GALAXY_MAX_NODES` (40 / 90 / 150), `maxNodesFor()` et leur repli **disparaissent**. Un plafond
  cachait à Massimo une partie de **sa propre progression** selon un critère qui n'a rien de
  pédagogique — la taille de son écran — et ses valeurs n'avaient **jamais été mesurées**.
- ⚠️ Le repli **existait bel et bien** en code, là où l'addendum le supposait « probablement
  jamais écrit » : `GalaxyPage` ne rendait plus que les chapitres au-delà du seuil, et la modale
  de rejeu retirait **toutes les étoiles** — un rejeu de galaxie sans étoile, c'est-à-dire
  l'inverse de son objet.
- **Trois gardes** le remplacent, qui visent le coût réel **par image** : budget de particules
  réparti sur la scène (2 → 1 → 0 par fil), coupure du flux doré sous **34 FPS** mesurés sur une
  seconde pleine et **sans retour en arrière** (un seuil qui oscille ferait clignoter le décor),
  moteur arrêté après stabilisation. Ce qui se dégrade est le **décor**, jamais une étoile.

**`/galaxy` a une entrée en matière.** Le cerveau apparaît seul, puis les matières naissent au
centre et rejoignent leur créneau, l'anneau se traçant **derrière** sa planète. Ordre du
**programme**, jamais chronologique ni par volume. **Une fois par visite** : revoir la même
chorégraphie à chaque aller-retour serait l'animation subie bannie partout ailleurs.

**Le rejeu se construit depuis `root`** au lieu de défiler. Les étoiles s'allument une par une à
cadence fixe, dans l'ordre de leur première fois ; matières et chapitres naissent juste avant leur
première notion, **dérivés côté client**. La frise devient **témoin** : plus de curseur, plus de
drag, un seul bouton « Revoir » — mais son axe X reste le **jour actif**, un axe de rang donnerait
une droite.

**Le §2 de l'addendum ADR-0029 a été réécrit en cours de chantier**, pas contourné. Il prescrivait
`d3ReheatSimulation` « à alpha bas, jamais `alpha(1)` » ; or `three-forcegraph` 1.43.4 fait
exactement `alpha(1)` dans cette méthode, n'expose pas `d3AlphaTarget`, et **réchauffe à
`alpha(1)` à chaque changement de `graphData`**. La voie était fermée par la bibliothèque. Les
positions sont donc **calculées** (arbre radial déterministe) et les nœuds **épinglés**, moteur
neutralisé — le mécanisme déjà éprouvé par l'animation d'arrivée.

**La galaxie revient sur l'Accueil**, et le §B du matin est **révoqué** — décision prise sur
constat d'usage : voir la galaxie se construire donne à la page une vie qu'un compte statique ne
donne pas, ce qui était déjà l'intention de l'addendum « Accueil vivant » écrit le même jour.

- Le canvas n'est **jamais monté au premier rendu** : la carte statique est la première peinture,
  le ciel arrive ensuite à `requestIdleCallback` (repli `setTimeout` — **Safari n'a pas
  `requestIdleCallback`, et c'est le navigateur de l'iPhone et de l'iPad de Massimo**, donc le
  repli est le cas courant). C'est ce qui sépare cette décision de la régression du 2026-07-28,
  où le montage était immédiat et non voulu.
- L'Accueil rend la **croissance complète**, étoile par étoile — la même que la modale, via un
  hook partagé (`useGalaxyGrowth`), et **rejouée à chaque visite de la page**. Une première
  version ne montrait que le cerveau et les matières, pour économiser deux requêtes : livré puis
  regardé, ça ne faisait pas l'effet, et l'animation ne jouant qu'une fois par session la page
  redevenait inerte dès la deuxième visite. Corrigé au vu du rendu.
- **Coût révisé** : deux requêtes de plus (`galaxy/all` et la frise), tirées **après la première
  peinture**, en même temps que le chunk 3D. La page d'atterrissage ne paie toujours **rien**
  avant d'être lisible — et un test le vérifie.
- 3D **contemplative** (`pointer-events-none`, `aria-hidden`) : toute la carte reste une seule
  cible de clic. `prefers-reduced-motion` ou pas de WebGL → carte statique, point.
- **Coût assumé** : 1,37 Mo repartent vers l'Accueil, différés mais téléchargés. Et une troisième
  surface monte `GalaxyCanvas`.
- `accueil.bundle.test.ts` **change de nature sans disparaître** : l'interdit d'`import()` devient
  une **liste blanche**, les quatre autres cas sont inchangés, et un cas est **ajouté** (le point
  de montage doit le faire en `import()`, jamais en synchrone). Ce qu'il protège encore, et qui
  est l'essentiel : qu'un **troisième** point de montage n'apparaisse pas sans que personne ne le
  voie — le mode exact de la régression de juillet.

**`/galaxy` montre enfin TOUTE la galaxie**, et le §C est **révoqué** à son tour : le cerveau,
les matières, leurs chapitres et leurs notions, sur **trois anneaux concentriques** autour du
cerveau (matières 150, chapitres 260, notions 370). Chaque matière reçoit un **secteur
angulaire** et ses descendants y restent : la hiérarchie se lit en **rayon**, l'appartenance en
**angle**. Une première version posait des orbites **emboîtées** — illisible, on ne voyait plus
le centre. L'arrivée sort chaque
constellation **d'un seul tenant** — tout ce qui descend d'une matière porte son rang, sans quoi
elle se disloquerait en vol.

- **Le §C n'était pas une erreur** : son amas était réel, mais il venait de la **convergence**,
  pas du nombre de nœuds. Les positions étant désormais calculées et épinglées, moteur éteint, le
  filtre protégeait contre un défaut disparu. ⚠️ Ne pas rallumer les forces « maintenant qu'on
  sait faire » — c'est parce qu'on ne les rallume pas que tout peut être montré.
- Une **incohérence disparaît** : on avait supprimé un plafond parce qu'il cachait la progression
  de Massimo, tout en gardant un filtre qui en cachait davantage.
- **Contrat serveur inchangé** : `galaxy/all` servait déjà tout le graphe, le filtre était client.
- ⚠️ **Dette de mesure devenue critique** : l'iPhone doit tenir la galaxie complète sur `/galaxy`,
  et l'Accueil en montre déjà une. La lisibilité à plusieurs centaines de notions **n'a pas été
  vue en vrai**.

**Correctif en cours de chantier** : le rejeu ne se voyait pas se construire. Le graphe rendu se
recalculait sur l'horloge, donc `graphData` était réassigné **60 fois par seconde**, et
`three-forcegraph` fait `stop().alpha(1)` à chaque assignation — le graphe se réinitialisait en
boucle. C'est le défaut même que l'addendum corrige, réintroduit par la porte de derrière. Un
compte discret de nœuds nés sert désormais de clé, et un test-verrou pilote le temps à la main
pour compter les réassignations.

**Écarts doc/code consignés** : `graphData` n'est pas exposée sur le ref de
`react-force-graph-3d` 1.29.1, ce qui rend inerte le déclouage du soleil dans `handleEngineStop`
depuis le 2026-07-28 ; laissé en l'état, hors périmètre.

**Zéro backend** : aucune route, aucun schéma, aucune migration. `API_SPEC.md` et `DATA_MODEL.md`
inchangés.

## 0.34.0 — La galaxie devient un système solaire

Date : 2026-07-31 · branche `feat/accueil-vivant` · addendum ADR-0024 §C (révisé)

> Servir tout le graphe d'un coup à une simulation de forces produisait un **amas** : le cœur
> à moitié enseveli sous les sphères, des libellés qui se chevauchent, aucune lecture possible.

- **`/galaxy` s'ouvre sur un système solaire** : le **cerveau de Massimo au centre** (deux lobes
  à circonvolutions, générés par le code, aplatis) et les **matières seules**, chacune **posée**
  sur une orbite dessinée, dans un plan aplati vu en surplomb à ~35°.
- **Un placement calculé, pas un équilibre** : un moteur de forces cherche une position stable,
  pas une composition. `orbitLayout` (brique partagée, pure et **déterministe**) pose les orbites ;
  l'ordre reste celui du programme, **jamais un classement**.
- **Les matières encore VIDES ont aussi leur planète.** `galaxy/all` les exclut volontairement —
  ce raisonnement valait pour un graphe dense ; dans un système solaire il s'inverse : une
  matière absente se lirait comme une matière **qui n'existe pas**, une planète éteinte se lit
  comme **« pas encore »**. Le clic reste honnête (« 🌱 Les étoiles de cette matière arrivent
  bientôt »).
- **Rien n'est perdu** : les notions restent atteignables en entrant dans une constellation —
  elles cessent seulement d'être servies toutes en même temps. **Contrat serveur inchangé.**
- Effet de bord heureux : ~10 planètes au lieu de 60 nœuds, le **plafond adaptatif ne mord plus**
  sur cet écran (la dette ADR-0024 §6 subsiste pour les constellations).

- **Bandeau de planètes permanent au-dessus du graphe** — les mêmes sphères CSS que l'écran
  d'attente, sur **une seule ligne** (elles se partagent la largeur et rétrécissent avec leur
  nombre). **Un seul clic** ouvre la matière ; la planète ouverte porte son anneau, si bien que
  le bandeau sert aussi à **changer de matière** sans repasser par la galaxie.
  `SubjectKpiRow` disparaît : le bandeau rend le même service et montre en plus les matières
  vides, que les puces filtraient.
- **Cadre au fond spatial animé** : nébuleuses qui respirent, **bande laiteuse** en diagonale et
  **deux champs d'étoiles** à vitesses différentes — seul le champ proche scintille (si tout
  clignote ensemble, le fond respire d'un bloc et vole l'attention aux planètes).
- **Couronne solaire dorée** autour des planètes, d'intensité proportionnelle aux étoiles
  allumées et **absente sur une matière vide** : le canvas pose déjà la règle — *« l'or ne coule
  que vers ce que Massimo a vraiment travaillé »* — et doré doit continuer à vouloir dire
  **travaillé**, pas **joli**.

La rotation lente était déjà acquise (`controls.autoRotate`, coupée par `prefers-reduced-motion`).
649 tests backend + 221 Massimo, `tsc -b` et build verts.

## 0.33.0 — Revoir sa galaxie grandir

Date : 2026-07-31 · branche `feat/accueil-vivant` · ADR-0029

> « Mon ciel » et « Mon chemin » disent *combien*, jamais *comment c'est arrivé*. Le rejeu animé
> montre la galaxie s'allumer étoile par étoile, du premier jour à aujourd'hui.

- **« Revoir ma galaxie grandir »** depuis « Mon ciel » : une modale plein écran qui rejoue la
  galaxie en 3D. Bouton Lecture / Rejouer, et **la frise devient la barre de lecture** — Massimo
  peut la tirer pour revenir en arrière.
- **`?with_skills=true` sur `/api/student/galaxy/timeline`** : le même calcul cessait simplement
  de renvoyer le `skill_id` qu'il produisait déjà. **Aucune table, aucune migration, aucune
  requête de plus.** Opt-in strict : sans le paramètre, la clé est **absente** — la frise ne voit
  aucun changement de charge utile, et un test le verrouille.
- **DOUBLE `lazy()`** : la modale l'est, et elle seule charge le canvas, également en `lazy()`.
  C'est ce qui garde l'Accueil à **zéro Three.js au premier paint** — vérifié en vrai : aucun
  chunk 3D avant le clic, canvas monté après.
- **Deux états seulement** — pas encore née, allumée. L'état de maîtrise passé existe
  (`skill_mastery_history`) mais il **régresse** : un rejeu bâti dessus montrerait des étoiles
  s'éteindre. Dérivé de `learning_events` (append-only), le rejeu ne peut que monter.
- **Aucune date lisible, aucun autoplay, aucune comparaison entre périodes.**
  `prefers-reduced-motion` → état final et curseur manipulable à la main.

649 tests backend + 220 Massimo, `tsc -b` et build verts. Rejeu vérifié dans le navigateur :
curseur 0 → 11 → 22 → 37 étoiles.

## 0.32.0 — Un Accueil vivant, sans cadrage de perte

Date : 2026-07-31 · branche `feat/accueil-vivant` · addendum ADR-0024 « Accueil vivant »

> L'Accueil recomposé le matin même était calme — c'était le but — mais **pauvre** : hors la
> mission du jour, Massimo n'y lisait qu'une semaine de sept cases. La demande était une page
> plus vivante, avec la **heatmap de Papa** en référence. Elle est **refusée par écrit**, et
> remplacée par la même idée retournée.

- **La heatmap est refusée, avec ses trois murs indépendants** : sa route a été supprimée
  (ADR-0028) et vit dans un agrégat `require_parent` ; `CLAUDE.md` interdit le « décompte de
  jours manqués, sous quelque forme que ce soit », et les cases vides d'une grille **sont** ce
  décompte ; `WeekDots.test.tsx:32` le verrouille par un test. Écrit dans l'ADR pour ne pas être
  redemandé dans six mois.
- **« Mon ciel » — la heatmap retournée** : une case par jour où Massimo a gagné du XP, sur un
  **calendrier** (semaines en colonnes, jours en lignes, comme chez Papa) — mais **aucune case
  vide n'est dessinée** : un jour sans gain n'a **aucun élément dans le DOM**. Chez Papa la case
  grise *est* l'information d'absence et elle y est légitime (c'est du pilotage) ; ici l'absence
  n'existe ni dans les données ni dans le rendu. Intensité ∝ XP du jour, rampe indigo → cyan →
  blanc, libellés de mois posés seulement s'ils ne se chevauchent pas,
  `prefers-reduced-motion` respecté. La grille démarre au **premier jour d'activité**.
  > La première version posait les jours en **constellation libre**, sans repère temporel. Ce qui
  > manquait n'était pas la densité mais le **repère de temps** : l'interdit est reporté de la
  > géométrie vers le **rendu**. Ce que `CLAUDE.md` bannit — un décompte, une iconographie du
  > vide — reste absent ; ce qui est assumé, c'est que l'œil perçoive les intervalles par la
  > position.
- **Brique partagée `buildSparseCalendar`** (`packages/ui`), avec `toLocalIso` et `startOfWeek`
  **remontés depuis la heatmap de Papa** : deux `startOfWeek` dans un même dépôt finiraient par
  diverger sur les bords de semaine. `buildHeatmapGrid` reste chez Papa — c'est lui qui
  reconstruit les jours vides, et cela ne se partage pas.
- **`GET /api/gamification/history` — première route élève d'historique.** Les **jours sans XP
  sont OMIS** du payload, jamais renvoyés à zéro : le garde-fou est dans le **contrat**, pas dans
  l'UI, donc aucun client futur ne pourra dessiner une case vide sans avoir lu l'ADR. Aucune
  minute, aucune session, aucun `event_type` — on ne chronomètre pas l'enfant. Regroupement en
  **Europe/Paris**, le défaut exact qui avait été relevé sur le streak retiré. Fenêtre bornée
  serveur. **Aucune migration.**
- **« Tes derniers gains », à coût nul** : `recent` et `badges` étaient déjà servis par
  `/api/gamification/summary` — que le bandeau XP appelle **déjà sur cette page** — et n'étaient
  **rendus nulle part**. Aucune requête ajoutée. Le mapping des `reason` passe de **3 à 8** : il
  ne couvrait qu'un tiers des valeurs, sans conséquence tant que rien ne les affichait.
- **La frise revient sur l'Accueil.** Elle en était partie le matin même, emportée par
  association avec le canvas 3D — le coût à annuler était **Three.js**, pas quelques lignes de
  SVG. Le motif tient : le test de budget de bundle reste vert, aucun moteur 3D ne revient.
- **Les pastilles de matières portent leur compte.** Un **compte**, jamais un pourcentage ;
  l'ordre reste celui du programme — trier par étoiles en ferait un palmarès.

**Test-verrou de la slice** : le ciel ne rend **aucun élément** pour un jour sans activité — le
pendant, sur la nouvelle surface, de l'invariant `WeekDots`. Aucune date n'est affichée nulle
part : une date rendrait le temps lisible, et les intervalles vides avec lui.

646 tests backend + 206 Massimo, `tsc -b` et build verts.

## 0.31.0 — La Galaxy prend sa route, l'Accueil cesse de payer la 3D

Date : 2026-07-31 · branche `feat/accueil-galaxy` · addendum ADR-0024

> Trois jours après la livraison de la Galaxy, deux décisions du même ADR sont rouvertes. L'URL
> et le libellé décrivaient encore l'ancien contenu, et l'aperçu 3D posé sur l'Accueil le
> 2026-07-28 s'était installé au mauvais endroit : la page la plus visitée, la première peinte au
> réveil de l'app, chargeait **1,37 Mo (368 Ko gzip)** pour une vue contemplative dont aucun
> élément n'est la prochaine action de Massimo. Le coût est **annulé, pas atténué**.

- **`/progression` devient `/galaxy`** — un **renommage**, pas un ajout : `/progression` ne
  survit qu'en **redirection permanente**, jamais en page. Libellé de sidebar « **Ma Galaxie** »
  🌌 **à la même position** ; le nombre d'entrées ne bouge pas (l'ADR-0024 §1 interdit une 6ᵉ).
  Bandeau XP, page Matières et panneau d'actions repointés. `ProgressionPage.tsx` est renommé
  `GalaxyPage.tsx` (`git mv` — l'historique suit).
- **L'Accueil ne charge plus Three.js**, ni directement ni transitivement. Le canvas 3D et la
  frise **quittent la page** au profit d'une **carte-bouton statique** : un **compte** d'étoiles
  allumées et des pastilles de matières en CSS pur, la carte entière cliquable vers `/galaxy`.
- **Un test de budget de bundle** constate la sortie du moteur 3D. ⚠️ Il vérifie les `import()`
  **autant que** les imports statiques : le canvas était **déjà** code-splitté le 2026-07-28 — ce
  qui coûtait, c'était le **montage**. Un test qui n'aurait regardé que les imports synchrones
  n'aurait pas attrapé la régression qu'il est censé prévenir. Contre-épreuve incluse.
- **Le graphe global change d'adresse, il n'est pas supprimé** : `GET /api/student/galaxy/all`
  alimente désormais la **vue par défaut de `/galaxy`** — la galaxie complète, toutes matières.
  Clic sur une matière → sa constellation. Les **planètes CSS cessent d'être un écran** : elles
  deviennent l'**état d'attente** du chunk 3D et le **repli sans WebGL**. La frise suit le graphe.
- **Accueil recomposé** : salutation + message ZETIS verbatim, mission du jour (**seule action
  accentuée** de la page), « Ma semaine » et « Ma Galaxie » côte à côte, trois raccourcis, et un
  **slot** pour le héros ZETIS — structuré mais **non rendu** tant que le chat n'existe pas ici,
  pour que le Groupe 1 (ADR-0026) le remplisse sans rouvrir la composition.
- **Continuité de télémétrie côté Papa** : `lib/routeLabels.ts` traduit enfin les routes en mots
  (« Navigation · Ma Galaxie » au lieu de « Navigation · /eli5 »), et rend **le même libellé**
  pour `/progression` et `/galaxy`. `learning_events` est append-only : sans cela, trois jours de
  fréquentation réelle seraient devenus une page distincte, pour toujours.
- **Zéro backend, zéro migration** : aucune route API créée, renommée ni supprimée.

**Écarts assumés** (documentés dans `TROUBLESHOOTING.md`) : le **bandeau Agenda reste** sur
l'Accueil — la spec et la maquette ne le montraient pas, mais c'est le seul accès à `/agenda` en
phase 0 ; et le raccourci **Capsule** affiche un **compte de nouveautés** et non « la capsule
recommandée avec sa durée », qu'aucune route ne sert.

## 0.30.0 — Connexion : une intro de marque, puis la porte de chacun

Date : 2026-07-30, mergée le 2026-07-31 · branche `feat/login-intro-avatars`

> Renumérotée de 0.29.0 à 0.30.0 : ce chantier et le Dashboard Papa v2 avançaient en parallèle et
> revendiquaient tous deux 0.29.0. Le dashboard ayant été mergé en premier, il garde le numéro ;
> deux chantiers distincts ne peuvent pas porter la même version.

> La page de connexion faisait trois choses à la fois : jouer l'animation ZETIS dans une demi-colonne,
> proposer un choix de profil que l'app ne pouvait pas honorer, et connecter. On sépare les moments :
> **la marque d'abord, l'identité ensuite**.

- **Intro de marque plein écran (`BrandIntro`, `packages/auth`)** : l'animation `zetis-logo.mp4` sort
  de la colonne et prend tout l'écran, fondu vers le wordmark puis fondu de sortie qui révèle le login
  déjà monté derrière. **Jouée une fois par session et par espace** (`sessionStorage`, cloisonné par
  origine) — pas de rejeu après une erreur de mot de passe ou un retour sur `/login`.
- **Coupable à tout moment** : clic, n'importe quelle touche, ou bouton « Passer ». `prefers-reduced-motion`
  la saute d'office.
- **L'intro ne peut jamais empêcher de se connecter** : autoplay refusé, onglet en arrière-plan, mp4
  absent ou vidéo bloquée → repli sur le poster puis sortie (garde-fou 8 s). Le double `play()` du
  StrictMode en dev (AbortError) est neutralisé.
- **Une page de connexion par profil** : `/login` de Papa affiche **l'avatar de Papa**, celle de Massimo
  **l'avatar de Massimo**, en héros — avec le nom, l'espace et une accroche propre au rôle. Les deux
  espaces restent sur **deux ports distincts** (Massimo 5173, Papa 5174).
- **Retrait du sélecteur croisé** : l'auth étant par app, la tuile « autre profil » n'était qu'un lien
  vers l'autre port. Les variables `VITE_MASSIMO_URL` / `VITE_PAPA_URL` disparaissent (wrappers
  `LoginPage` et `infra/docker/frontend.Dockerfile`).
- **Correctifs d'affichage** : le masque radial du wordmark est resserré (plus de bord rectangulaire
  visible sur le fond noir) ; « Se souvenir de moi » et « Mot de passe oublié ? » ne se chevauchent
  plus à 375 px.
- **Vérifié** : 7 tests `@zetis/auth` (dont 4 sur le portail d'intro) · 182 Massimo · 231 Papa,
  `tsc -b` + `vite build` verts ; **connexion live jouée de bout en bout sur les deux ports**
  (mauvais mot de passe → message, puis `papa` et `massimo` → leurs dashboards), rendu contrôlé en
  1280 px et 375 px, zéro erreur console. Aucun changement backend, aucune migration.

## 0.29.1 — La boucle de révision peut enfin se refermer

Date : 2026-07-31 · amendement `ADR-0017 §5bis` · branche `feat/dashboard-papa-v2`

> Parti d'un symptôme du dashboard — « 1 notion à renforcer sans mission active » à côté d'une carte
> qui ne proposait rien — l'enquête a trouvé un défaut de fond du moteur de missions.

- **Le relais désigné par la doctrine était inopérant.** `adr-0017 §5bis` promet qu'après un verdict
  « à revoir » la notion **revient d'elle-même** par le SRS. Or le template `revision` composait
  `[carte] → [quiz] → relire` **sans étape de réexplication**, alors que le verdict l'exige — et
  `eli5` est une étape de *consultation* qui n'émet aucune trace de réexplication. Une mission de
  révision rendait donc **toujours** « à revoir » : la lacune restait ouverte à vie. La
  contradiction était figée par un test qui asserait « pas de verbalisation ».
- **Et elle abîmait la mesure à chaque passage** : sans réexplication mesurée, le verdict écrivait
  `mastery_score = 0`. Massimo faisait sa révision, sa maîtrise s'effondrait, et la carte revenait
  le lendemain (intervalle du score 0). Désormais, **une absence de mesure n'est plus un zéro** :
  on n'écrit que ce qu'on a mesuré, et l'intervalle se calcule sur la maîtrise connue. Filet qui
  couvre aussi les parcours édités par Papa sans étape vocale.
- **Le générateur de remédiation n'est pas élargi** aux lacunes `in_progress` : la doctrine
  désignait le SRS, elle tient — il fallait le réparer, pas le contourner. Bump
  `MISSION_SCORING_VERSION` v3 → v4 (le versionnage couvre les templates de parcours).
- **`/lacunes` devient la surface de décision qu'elle prétendait être** : la page était un mock
  inerte alors que le dashboard y renvoyait. Elle sépare maintenant ce qui appelle une
  consolidation (notion jamais travaillée) de ce qui revient par la révision, et n'utilise que les
  deux générateurs existants — aucune route nouvelle.
- **Deux surfaces qui se contredisaient, réconciliées** : le KPI « lacunes sans mission » ne
  regardait que les missions de *remédiation*, si bien qu'une notion déjà couverte par une mission
  commandée par Papa était annoncée « sans mission active ». Définition unique et partagée
  désormais — n'importe quelle mission active répond à la question « reste-t-il un geste à faire ? ».
- **Le mode focus fait enfin ce qu'il annonce.** La page promettait que « ZETIS priorisera les
  missions, capsules et révisions sur cette notion jusqu'à sa consolidation » ; son bouton
  n'écrivait qu'un état local, et **aucun état « focus » n'existe côté backend**. Elle s'appuie
  maintenant sur le seul levier réel — `Mission.force_priority`, le plancher de score du sélecteur
  (ADR-0018) — via la route Commander déjà en place. La promesse est réécrite pour dire exactement
  ce que le moteur fait : *« sa mission passera devant les autres »*, ni plus ni moins.
- Les entrées mortes de `data/mock.ts` (`Gap`, `GAPS`) disparaissent : plus aucun consommateur. Leur
  vocabulaire de façade (« forte », « en cours ») ne correspondait de toute façon à aucune valeur du
  backend (`high`, `in_progress`) — le mock ne pouvait pas être branché tel quel.

## 0.29.0 — Dashboard Papa : un cockpit, pas un bulletin

Date : 2026-07-31 · ADR-0028 · branche `feat/dashboard-papa-v2`

> La maquette historique du dashboard contredisait **sept décisions déjà prises**. Elle est
> remplacée par une page qui répond à trois questions dans l'ordre : *qu'est-ce qui attend une
> décision de moi ?*, *où en est Massimo ?*, *qu'est-ce que ZETIS propose ?*

- **Un agrégat unique, zéro requête au filtrage (§1, §2)** : `GET /api/parent/dashboard` renvoie les
  **trois fenêtres** (7/30/90) **non filtrées**, séries livrées **par matière** — « toutes matières »
  est une somme que le client calcule. Changer de période, de matière ou de focus ne touche plus le
  réseau. Vérifié dans l'onglet Réseau : cinq gestes, dix requêtes avant, dix après.
- **Les KPI deviennent des contrôles (§5)** : cliquer un KPI conserve les cartes qui **répondent à
  cette question** et atténue les autres. Ce n'est pas décoratif — c'est la carte de dépendance
  entre une mesure et ses preuves, et c'est ce qui rend huit diagrammes praticables sur une page.
- **L'XP quitte le pilotage parent** : un KPI de Papa doit être décisionnel. L'XP reste le levier
  de Massimo, sur Progression. Partent avec lui : « sessions », « missions terminées », le
  « taux de réussite » global, le radar de compétences (aucune source dans le modèle) et le
  panneau Obsidian.
- **Une seule carte heatmap, deux vues** : *Calendrier* (est-ce régulier ?) et *Créneaux* (quand
  travaille-t-il ?), **échelle émeraude unique — pas de gradient vers le rouge**. Une case dense
  n'est pas une bonne note, une case vide n'est pas une faute.
- **Historique de maîtrise (§3 ter, migration `a9b8c7d6e5f4`)** : `skill_mastery` n'écrivait que
  l'état courant, rendant la courbe des régressions impossible à tracer. La table
  `skill_mastery_history` la rend calculable — et donnera au Conseil de classe la notion de
  régression qui lui manque.
- **Read-before-code : deux vérifications sur quatre sont tombées**, plus six écarts non anticipés.
  « Consolidée » avait **déjà** une définition serveur, différente de celle de l'ADR ; « fragile »
  n'en avait **aucune** — les deux sont désormais figées sur les **six** statuts réels.
  `GET /api/parent/dashboard` **existait déjà** (réécriture cassante), les quiz **ne peuvent pas**
  entrer dans la file de validation (pas de `validation_status`, doctrine ADR-0014), et
  `/activity/heatmap` **n'avait aucun consommateur** hors du dashboard → supprimée.
- **Deux contradictions que seul le rendu réel a révélées** : le donut totalisait 42 min à côté
  d'un KPI annonçant 7 h 05 (le temps sans matière — connexion, navigation, chat — n'était compté
  nulle part) ; et le KPI des lacunes portait le même libellé que le segment « fragiles » des
  cartes voisines, affichant « 1 » à côté de « 9 » pour deux mesures différentes.
- **Zéro dépendance ajoutée** : ni react-query, ni lib de graphes. Les huit diagrammes sont en SVG
  inline et CSS Grid. Deux briques rejoignent `@zetis/ui` : `Sparkline` et `subjectColorFor`.
- **Mission proposée, sans qu'un affichage n'écrive (§10)** : la carte compose son parcours **en
  lecture** via le moteur de missions (patron preview/confirm, ADR-0010) et la confirmation appelle
  la route de création **déjà en place** — aucune surface d'écriture ajoutée. Prévisualisation et
  création voient les mêmes lacunes, sinon la carte proposerait une notion que le bouton ne
  créerait pas.
- **Hors v1, assumé** : le bandeau de fraîcheur du Conseil de classe.

## 0.28.0 — Chat ZETIS : un compagnon incarné, qui se souvient et qui parle

Date : 2026-07-30 · ADR-0026 · branche `feat/chat-memoire`

> ZETIS devient un compagnon. Il se souvient de ce que Massimo **travaille** — jamais de ses
> **mots** — et, désormais, il l'écoute et lui répond à voix haute. Toute la voix reste **locale** :
> celle de l'enfant ne quitte jamais la machine.

- **Mémoire éphémère par construction (backend, §1)** : le verbatim de conversation vit dans **Redis**
  (TTL glissant, purge à la clôture), **jamais** en PostgreSQL/MinIO. Le pipeline est **aveugle au
  contenu** : un tour ne trace qu'un `ai_jobs` de métadonnées, jamais un message. La question « le
  journal de chat est-il lisible par Papa ? » se dissout — **il n'y a pas de journal**.
- **Le chat n'a pas de mémoire propre, il écrit dans le journal commun** : trois `learning_events`
  exactement (`chat_topic`, `chat_tool_response`, `chat_difficulty_declared`), non probants, **zéro
  XP**. Premier producteur de `Gap.source=ai_observation` — **signal faible** (`severity=low`,
  corroboration par la maîtrise, jamais d'escalade).
- **Résolution notion partagée** : `ai/skill_resolution.py` (texte libre → `skill_id` par embeddings),
  promue de différé ELI5 à **prérequis** — ELI5 en héritera.
- **Page Massimo `/chat` — avatar vivant** : brique partagée **`@zetis/ui/avatar`** (rig canvas —
  paupières, iris or, mâchoire, onde spectrale, horloges indépendantes), machine à états
  repos/écoute/réflexion/parole, sous-titres karaoké, phrase de transparence fixe (« ZETIS retient
  les notions que tu travailles, pas tes mots »), quota doux.
- **Voix complète, 100 % locale (Lot 2)** : entrée **micro appui-pour-parler** transcrite par
  **Whisper local** (réutilise la dictée ELI5) ; sortie **voix Piper** via `POST /api/student/chat/tts`
  (audio éphémère, jamais persisté). La **bouche de l'avatar est pilotée par le vrai audio** (un
  `AnalyserNode` remplace la pseudo-phonétique — le contrat de flux d'articulation était fait pour ça).
  Aucune API vocale du navigateur (la voix de l'enfant reste local-first). Repli propre vers le
  karaoké muet si le moteur manque.
- **Vérifié** : 577 tests backend · 175 Massimo, `tsc -b` + `vite build` verts ; voix serveur **prouvée
  en live** (Piper, WAV réel). Zéro table, zéro migration.
- Reportés (chantier chat) : streaming SSE, karaoké aux bornes de mots réelles, migration Rive de
  l'avatar. Le **routage/orchestration** (« montre mes fiches sur X ») est **cadré** par l'ADR-0027.

## 0.27.0 — Agenda scolaire : ZETIS apprend ce que le collège demande

Date : 2026-07-29 · ADR-0025 · branche `feat/agenda-scolaire`

> Tout ce que ZETIS savait planifier, il l'avait inventé lui-même. L'agenda est sa première
> source **exogène** : les dates viennent du collège, jamais de ZETIS — et ce qui est
> déclaratif le reste, sans jamais devenir une preuve.

- **Backend** : table `agenda_items` (migration `a1b2c3d4e5f7`) + module `agenda`. Deux
  routeurs, deux schémas jamais mélangés (`/api/student/agenda` et `/api/agenda`). Co-édition
  sous quatre règles serveur : seul Massimo coche (403 explicite côté Papa), corrections
  marquées (`edited_by_parent_at` posé par le service), archivage jamais suppression, doublons
  tolérés. Traçabilité **non probante** : deux `learning_events`, pas d'`agenda_item_missed`
  (« l'absence n'est pas un événement »), zéro XP, zéro effet sur l'évidence (test-verrou).
- **Étanchéité des projections** : trois lecteurs de `learning_events` ne filtraient pas par
  `event_type` (heatmap/minutes/sessions, décrochage, jours de venue) — sans garde, cocher un
  devoir aurait compté comme du travail. Frozenset `NON_ACTIVITY_EVENTS` appliqué aux trois.
- **Page Papa `/agenda`** : saisie **en lot** (matière · chapitre du référentiel · intitulé ·
  date · type, un seul envoi), charge de la semaine en 7 colonnes, panneau de détail, note
  privée jamais servie à Massimo, archivage sous ConfirmDialog, filtres. **Aucune case à
  cocher, nulle part** — et l'UI énonce les trois refus. Interrupteur d'ouverture de la saisie
  élève **persisté en base** (table `app_settings`, migration `b2c3d4e5f8a0`) : la bascule est
  un geste de Papa, jamais un seuil calculé.
- **Page Massimo `/agenda`** : bande **glissante** 14 jours (3 passés / aujourd'hui / 10 à
  venir — tout l'horizon va vers l'avant), traces positives sans réceptacle vide, sections
  Aujourd'hui / Demain / la suite / Ce qui arrive / À reprendre (3 max, sans compteur), coche
  optimiste **sans XP ni célébration**. Entrée de sidebar en position 2 + résumé sur l'Accueil
  au-dessus du canvas Galaxy. Phase 0 : ni composer, ni bouton grisé — l'ouverture de la
  saisie sera un événement positif, pas la fin d'une privation affichée.
- **Vérifié à l'écran de bout en bout** : saisie Papa → apparition chez Massimo (« ajouté par
  papa » en émeraude) → coche persistée → « cochés par Massimo : 1 » côté Papa. 560 tests
  backend · 224 Papa · 167 Massimo.
- Hors périmètre tenu : composer élève (Lot 1 bis, derrière le verrou), plan de préparation et
  analyse par chapitre (Lot 3), bottom bar mobile (arbitrage ouvert).

## 0.26.0 — ZETIS Galaxy : la progression de Massimo devient une galaxie

Date : 2026-07-28

> La page Progression affichait des pourcentages **mockés** « par matière ». Elle affiche
> désormais le vrai graphe des connaissances — et l'or n'y est pas un décor : il ne coule que
> vers ce que Massimo a réellement travaillé.

### Ajouté

- **Module backend `galaxy`** (ADR-0024) : 4 routes ÉLÈVE — vue d'ensemble, graphe global,
  constellation d'une matière, panneau d'actions d'une notion — plus la frise de progression.
  **Aucune table, aucune migration** : tout se dérive de l'existant via
  `evidence.mastery_by_skill()` (6ᵉ consommateur du substrat, ADR-0011 §1).
- **Page `/progression` = la galaxie** : canvas 3D (`react-force-graph-3d` en `lazy()`), soleil
  de matière, amas par chapitre, étoiles par notion, drag élastique, rotation orbitale.
  La section « par matière » **mockée** disparaît — c'était sa donnée qui manquait.
- **Panneau d'actions par notion** : toute la panoplie ZETIS (cours · ELI5 · fiche · capsule ·
  mindmap · révision · quiz), l'indisponible **grisé et non cliquable**.
- **KPI d'états cliquables** : les 5 états portent leur compte et filtrent la constellation ;
  ce qui n'est pas concerné est **atténué, jamais masqué**.
- **Recherche de notion** : locale, insensible à la casse **et aux accents**, cadre toutes les
  correspondances d'un coup ; message transitoire quand rien ne correspond.
- **Aperçu sur l'Accueil** : graphe global en deux colonnes, badges matières cliquables, frise
  de progression, plein écran **dans la page** (sidebar et bandeau préservés).
- **Frise de progression MONOTONE** : dérivée de `learning_events` (append-only) et non de
  `SkillMastery`, qui peut régresser — la courbe ne peut donc que monter.

### Modifié

- **ADR-0024 amendé trois fois en cours de chantier**, chaque fois par décision explicite :
  le graphe global sur l'Accueil (§9 rouvert), la panoplie complète avec grisé (§4 révisé),
  et le revirement 2D → 3D acté avec son coût.
- `MassimoBannerHeader` : le niveau/XP devient un lien vers la galaxie.

### Pièges rencontrés (documentés dans la spec)

- **`SkillMastery.status` a SIX valeurs**, pas cinq : `in_progress` ne sort d'aucun
  `_status_from_score()` et serait manqué en silence par un mapping à 5 branches.
- **Le `lazy()` ne suffit pas** : ré-exporter le canvas depuis le baril `@zetis/ui/galaxy`
  faisait entrer Three.js dans le bundle de départ (3,6 Mo). D'où le sous-chemin
  `@zetis/ui/galaxy/canvas`.
- **Un matériau très émissif aplatit une sphère** (plus d'ombrage, plus de reflet) — vrai pour
  le soleil comme pour le cerveau.
- **Sans nœud racine, les composantes se disloquent** ; et la remontée de l'or doit être
  **transitive**, sinon elle s'arrête aux matières dans le graphe global.
- **Tailwind v4 met `cursor: default` sur les `<button>`** : `cursor-pointer` est désormais
  explicite là où l'interactivité doit se voir.

### Dépendances

`react-force-graph-3d` 1.29.1, `three-spritetext` 1.10.0, `three` 0.185.1 (peer de
`three-spritetext`, déclarée explicitement) + `@types/three` en dev. Trois épinglées à la
version exacte, convention ADR-0016. Chunk 3D isolé : 1,39 Mo, chargé à l'ouverture d'une
galaxie seulement.


## 0.25.0 — Couverture de production : voir le stock, et pouvoir agir dessus

Date : 2026-07-28

> Cinq pages de pilotage donnaient cinq vues partielles du même objet. Cette page en est
> l'**union** — et elle assume de dire des choses inconfortables : ce qui dort sans être relu,
> ce qui atteint Massimo dans une version obsolète, ce qui est passé sans que personne l'ouvre.

### Ajouté

- **Page Papa « Couverture de production »** (`/couverture`) : matrice une-ligne-par-leçon,
  colonnes Cours · Quiz · Fiche · Mindmap (leçon-centrées) + Cartes · Capsules (notion-centrées,
  fond distinct). KPI, bandeaux d'anomalie, filtres client, encart orphelins, 4 notes de lecture.
- **Module backend `production`** : `GET /api/production/coverage` et `/orphans`, `require_parent`,
  lecture seule. Une requête agrégée par matière — vérifié sur Postgres réel (69 leçons,
  18 requêtes, 79 ms).
- **Fraîcheur des dérivés** (addendum ADR-0011 §E) : `is_stale` en fonction pure dans le module
  neutre `canonical_context`, appuyée sur `lessons.content_updated_at` — colonne préexistante,
  bougée par les deux seuls écrivains de `content_markdown`. Un renommage ne périme rien.
- **Provenance de la validation** (addendum ADR-0011 §F) : `validated_at` / `validated_by`
  (`parent` | `parent_bulk` | `system`) sur `fiches`, `mindmaps`, `capsules`, `chapters`,
  `lessons` **et `quizzes`** — migration `d5e6f7a8b9c0`, reprise `NULL` (aucune rétro-attribution).
  Module `provenance` = unique point d'écriture ; nuancier visible sur chaque ✓ de la matrice.
- **Invariants de lecture des dérivés** : module neutre `engagement` + exception « mission
  engagée » sur les chemins d'achèvement des mindmaps. Le gate porte sur la découverte, jamais
  sur l'achèvement d'un parcours engagé.
- **Validation en lot des leçons d'un chapitre** : `POST /api/chapters/{id}/lessons/validate-all`
  + bouton dans l'en-tête de chapitre de la Couverture (provenance `parent_bulk`).
- **Liens ciblés** : chaque cellule renseignée ouvre SON objet sur sa page de pilotage
  (`?subject=&focus=`), avec défilement + surlignage ; le quiz et la mindmap ouvrent directement
  leur modale. Le badge « À valider → » d'une leçon en brouillon mène à Programme, chapitre
  déplié et ligne surlignée. Une notion « ✓ couverte » ouvre ses cartes, aperçu déplié.
- **Génération depuis la matrice** : `+` sur une cellule absente ; détail par notion sur les
  fractions (cartes en un clic ; capsules via le compositeur pré-rempli — l'instruction reste
  à Papa, l'API l'exige).
- **Sidebar Papa** : entrée « Couverture » en tête du groupe production + séparateurs de groupe.
  Aucune entrée existante déplacée. Carte d'alerte au Dashboard (masquée si tout est à zéro).

### Corrigé

- **`fiches` / `mindmaps` : horodatages sans défaut serveur** (migration `e6f7a8b9c0d1`).
  `created_at`/`updated_at` étaient nullable sans `DEFAULT now()`, contrairement à `quizzes` et
  `capsules` — le `TimestampMixin` n'avait jamais été suivi par leur migration de création. Une
  fiche naissait donc à `NULL`, la matrice la lisait « absente », et chaque clic empilait un
  doublon. Colonnes alignées + reprise, et `absent` se déduit désormais de **l'existence de la
  ligne**, jamais d'une date.
- **Capsules non rattachées à une notion** : le compositeur n'envoyait jamais `skill_id`, si
  bien qu'une capsule créée depuis la page Capsules IA ne pouvait compter dans aucune fraction.
- **`.claude/launch.json`** : les configs `backend-dev`/`backend-dev2` lançaient `uvicorn` sans
  `--reload` — le serveur servait un code antérieur sans le dire (404 sur des routes existantes).


## 0.24.0 — Auto-motivation de Massimo : régularité douce, engagement choisi, ZETIS qui se souvient

Date : 2026-07-28

> « ZETIS doit avoir une main de fer dans un gant de velours. » Le principe *« un enfant
> chronométré travaille pour le chronomètre »* est **amendé partiellement** : il reste vrai pour
> le TEMPS (aucune minute, aucune session, aucun calendrier chez Massimo — ça reste du pilotage
> Papa), il est levé pour l'EFFORT. La main de fer, c'est que ZETIS revienne vers l'enfant avec
> quelque chose de **vrai** à dire ; le velours, c'est que **rien ne casse jamais**.

### Ajouté

- **Module backend `motivation`** (`/api/student/motivation`, `require_child` — Papa reçoit 403
  même en lecture) : `GET`/`PUT /week` (régularité + engagement), `GET /welcome`, `GET /wrap-up`.
- **Régularité douce** : un COMPTE de jours dans la semaine courante, servi en 7 cases toujours
  complètes. Source `learning_events` (jamais `xp_events`), bucketing Europe/Paris — la connexion
  seule coche la journée : « j'étais là et ça n'a pas compté » est l'effet à éviter.
- **Engagement hebdomadaire choisi par l'enfant** (`student_weekly_goals`) : 7 pastilles, un tap
  suffit. La semaine est toujours déduite serveur (ni triche rétroactive, ni reproche sur une
  semaine passée) ; réviser à la baisse est autorisé, sans confirmation ni trace.
- **Messages composés SERVEUR et déterministes** — aucun LLM, aucun aléa : deux appels sur le même
  état rendent la même phrase. Dix codes d'accueil, cinq de clôture ; le client affiche
  `title`/`subtitle` verbatim et n'utilise le `code` que pour choisir une illustration.
- **`skill_mastery.mastered_at` et `gaps.resolved_at`** (migration `f1a2b3c4d5e6`) : sans eux,
  « notions consolidées cette semaine » n'est pas calculable honnêtement.
- **Frontend Massimo** : carte ZETIS et « Ma semaine » sur l'accueil, mot de la fin sur les trois
  écrans de fin de séance (révision, quiz, mission).

### Modifié

- **L'accueil de Massimo ne ment plus.** Il affichait TROIS nombres inventés — dont « Tu as
  consolidé 3 notions cette semaine », une constante codée en dur — et son bouton « Commencer »
  n'avait aucun handler. Tout vient désormais du serveur, ou n'est pas affiché. Le raccourci
  « Révision rapide » affiche `flash_size` (plafonné) et non `total_due` : « 83 cartes en retard »
  sur l'écran d'accueil serait la pression quotidienne anxiogène interdite par CLAUDE.md.
- `QuizEndCard` lit `result.strengths` au lieu de refiltrer sur `score >= 70` — une règle
  pédagogique dupliquée dans un composant de présentation.
- `CLAUDE.md` §gamification : « streak raisonnable » → « régularité douce qui ne peut pas casser »,
  et trois interdits ajoutés (série qui se casse, décompte de jours manqués, objectif imposé).

### Retiré

- **Le streak** (`_compute_streak`, `streak_days`, `active_today`, badge `streak_3` 🔥). Il tombait
  à zéro dès un jour entier manqué et se calculait en UTC. Pris en flagrant délit en vérification
  live : `0` affiché à un enfant venu **deux jours** cette semaine. Frontend basculé AVANT la
  suppression backend, pour qu'aucun écran ne casse entre les deux commits.
- Tuile « Objectifs de la semaine » (Matières) : second nombre inventé **et** doublon sémantique
  de l'engagement — deux « objectifs de la semaine » différents ne pouvaient pas coexister.

### Invariants (testés, pas seulement documentés)

- **Aucune donnée punitive n'est persistable ni servie** : pas de clé `missed`/`failed`/
  `remaining`/`streak`/`best`, pas de colonne d'atteinte sur `student_weekly_goals`.
- **Un jour passé sans activité et un jour à venir sont rendus À L'IDENTIQUE** — mêmes classes,
  même `aria-label` : aucun signe ne désigne les jours manqués.
- **Le nombre de jours d'absence n'apparaît dans aucun texte** ; deux verrous parcourent tous les
  templates (aucun mot d'échec, aucun décompte de jours). La clôture ne dit jamais ce qu'il reste
  à faire pour tenir l'engagement.

### Pièges

- `quizzes/scoring.py` rejoue à chaque quiz : sans non-re-tamponnage de `mastered_at`,
  « consolidées cette semaine » recompterait éternellement les mêmes notions. D'où le helper
  unique `progress/mastery.py`, point de passage des 4 sites d'écriture.
- Le `login` est journalisé AVANT l'appel à l'accueil : l'absence se mesure sur les événements
  **strictement antérieurs à aujourd'hui**, sinon elle vaut toujours 0.
- `gamification` (bas niveau) ne doit pas importer `motivation` (haut niveau) : cycle
  `motivation → memory → gamification`. La composition vit dans le routeur.
- Une prop **optionnelle** a laissé passer un câblage manquant à travers `tsc` ET les tests — vu
  seulement en jouant une vraie séance.

488 tests backend · 111 Massimo · 166 Papa.

## 0.23.0 — Activité : journal `learning_events`, projections Papa, cahier de bord

Date : 2026-07-27

> Papa n'avait aucune vue de ce que Massimo fait réellement dans ZETIS. Le journal d'activité
> existait en table depuis le schéma initial, sans être alimenté ni lu.

### Ajouté

- **Module `activity`** : helper `log_learning_event` (calqué sur `award_xp`), dédupe des
  consultations (1/élève/ressource/jour Paris), projections **pures** (`bucket_days`,
  `build_sessions`, `active_minutes`, `group_reviews`), bucketing Europe/Paris.
- **7 hooks** : login, page_viewed, lesson_viewed, fiche_viewed, quiz_attempted (deux surfaces),
  eli5_requested, review_attempted.
- **`POST /api/telemetry/pageview`** (`require_child`, créé pour l'occasion) : seule écriture
  cliente du journal. Le serveur horodate ; route consécutive identique ignorée.
- **Lectures Papa** : `GET /api/parent/activity/{heatmap,days/{date},sessions}` et
  `GET /api/parent/dashboard` (surface neuve — aucun endpoint dashboard n'existait).
- **Module `progress`** : `GET /api/parent/progress/{gaps,consolidated}`. Les routes `/gaps` et
  `/progress/summary` de la spec produit n'ont **jamais existé** en code.
- **Frontend Papa** : bloc Régularité (heatmap 26 semaines en CSS pur), page Cahier de bord en
  **calendrier mensuel cliquable**, six KPI tous dépliables sur leur détail.
- **Frontend Massimo** : télémétrie de navigation, invisible (aucun compteur à l'écran).
- Migration `d0e1f2a3b4c5` : index `(student_id, created_at)` — la table n'en avait aucun hors PK.

### Modifié

- `subjectIcons` et ses 17 PNG étaient **dupliqués dans les deux apps** : extraits vers
  `@zetis/ui`, les anciens chemins ré-exportent (14 sites d'import inchangés).
- Résolveur « leçon → matière » unifié : il existait en **trois** exemplaires (−88/+12 lignes).
- « Lacune ouverte » existait en **quatre** définitions dupliquées → source unique.

### Décisions

- **Sessions jamais stockées** : reconstruites à la lecture (seuil 15 min). Changer la constante
  recalcule tout l'historique, sans migration.
- **`xp_events` et `learning_events` jamais en UNION** : deux journaux, deux sémantiques.
- **Deux `event_type` préexistants réutilisés** (`reverse_eli5`, `mission_verdict`) au lieu d'être
  dupliqués — les ajouter aurait double-compté ; les renommer aurait cassé leurs lecteurs.
- `POST /api/missions/{id}/complete`, cité par la spec, **n'existe pas** et n'a pas été créé.

## 0.22.0 — Mindmaps : brique canvas partagée + aperçu de fidélité Papa (addendum ADR-0016)

Date : 2026-07-27

> Papa validait une carte mentale **sans la voir** : ni la lisibilité de la disposition, ni la
> faisabilité de *Mémorise*, ni la difficulté de *Reconstruis* ne s'inspectent dans un arbre
> textuel. **Un seul renderer pour les deux interfaces** — ce que Papa valide est, par
> construction, ce que Massimo verra.

### Ajouté

- **Brique partagée `@zetis/ui/mindmap`** : `MindmapWorkspace`, `MindmapNode`, `ModeSegmented`,
  `LayoutSelector`, `NodeBank`, `mindmapLayout.ts`, `mindmapTree.ts`, `mindmap.css`. Contrat :
  **zéro fetch** (la carte descend en prop, le gate `validated` reste dans la requête serveur) et
  **zéro logique métier** (évaluation injectée par la prop `evaluator`). Export **en sous-chemin**
  volontaire — depuis la racine `@zetis/ui`, React Flow entrerait dans le bundle de toutes les
  pages Papa.
- **`POST /api/mindmaps/{id}/evaluate-preview`** (`require_parent`) : même barème que `/evaluate`
  (fonction pure partagée), **sans gate `validated`** (Papa prévisualise du `pending`) et **sans
  aucune écriture** — ni `mindmap_attempts`, ni `xp_events`, ni `learning_events`.
- **`GET /api/mindmaps/pilotage/{subject_id}`** expose `attempt_count` / `avg_score` (une requête
  d'agrégat). Champs portés par `MindmapPilotageCard`, **pas** par `MindmapOut` servi aux routes
  élève : le suivi est parent-side.
- **Page Papa `/mindmaps`** : chapitres repliables + recherche, métrique « reconstruite N fois ·
  moyenne X % », **signal avant destruction** dans les confirmations (nouvelle prop
  `destructionNotice` de `ContentLifecycleActions`), mention explicite « cours non validé ».
- **`MindmapPreviewModal`** — 4 onglets (Regarde · Mémorise · Reconstruis · Éditer),
  `min(1400px, 95vw) × 90vh`, hublot sombre encadré rendant la brique avec le style Massimo
  (exception cadrée à la frontière visuelle), brique en `lazy()`.
- **`MindmapOutlineEditor`** extrait de `MindmapEditorModal` et monté aux deux endroits ; dans
  l'onglet Éditer, canvas re-layouté sur le brouillon (debounce 300 ms) et raccourcis
  `⇥` / `⇧⇥` / `⏎` / `⌫`.

### Modifié

- `@xyflow/react` et `elkjs` **déplacés** de `frontend-massimo` vers `packages/ui` — versions
  épinglées inchangées, **aucune dépendance nouvelle**.
- `pilotage_tree` : le N+1 (une requête de cartes par leçon) est remplacé par une requête groupée.

### Écarts assumés avec l'addendum

- **Aucune migration** : l'`ON DELETE CASCADE` demandé est déjà couvert par `delete_mindmap`, qui
  purge les tentatives avant la carte.
- `score_reconstruction` était **déjà** une fonction pure — seule la mise en forme du résultat est
  factorisée (`_evaluation_out`).
- `MindmapEditorModal` était **déjà** un éditeur structuré (l'addendum supposait du JSON brut) →
  réutilisé, pas réécrit.

### Vérifié

413 tests backend · 81 Massimo · 129 Papa. Live sur Postgres réel : reconstruction **complète**
jouée dans l'aperçu Papa → score serveur 100 % affiché et `mindmap_attempts` / `xp_events` /
`learning_events` **strictement inchangés** (11 / 68 / 38 avant et après). Non-régression Massimo
vérifiée sur les **deux** points de montage (page mindmaps + étape mindmap d'une mission).

---

## 0.21.0 — `zetis-clip` Lot 2 : transcription vidéo → RAG (Papa) — étape 20

Date : 2026-07-01 (mergé dans `main` le 2026-07-27)

> Note de versionnage : livré à l'origine en `0.12.0` (étape 20), **renuméroté `0.21.0` au merge**
> (`0.12.0` avait été réutilisé sur `main` — Moteur LLM). Cf. ADR-0006 addendum.

### Ajouté

- **Backend `POST /api/rag/clip-url`** : importe la **transcription** d'une vidéo →
  `ingest_document(validation_status="pending", source_type="video_transcript")` (pipeline
  étape 12 réutilisé). Fetch sortant **borné à une allowlist** (`youtube.com`,
  `www.youtube.com`, `youtu.be`), URL validée avant tout appel réseau. Langue d'origine
  conservée (transcription humaine préférée à l'auto-générée, jamais de traduction).
  `400` structuré `{code, message}` : `unsupported_url` / `transcript_unavailable`.
- **`app/modules/rag/transcript.py`** : `validate_video_url`, abstraction `TranscriptFetcher`
  (mockable — `FakeTranscriptFetcher` en tests offline), impl réelle `YouTubeTranscriptFetcher`
  (import paresseux de `youtube-transcript-api`). Dépendance backend ajoutée.
- **Extension (Lot 2)** :
  - Popup : détection d'onglet vidéo (allowlist locale) → « Vidéo détectée — importer la
    transcription », matière/chapitre/niveau, titre éditable (nettoyé), envoi + feedback
    « Importé en attente ». Cas « transcription indisponible » géré (message + repli).
  - Orchestration **hybride** : `POST /clip-url` (serveur) d'abord ; si `transcript_unavailable`,
    **repli DOM** — le content script scrape le panneau « Transcription » de l'onglet actif
    (`activeTab`, action utilisateur) puis `POST /clip`.
  - Menu contextuel « Importer la transcription de cette vidéo » (restreint aux pages YouTube).
  - `api.ts` : `postClipUrl` + `ApiError.code` (detail structuré) pour piloter le repli.
- Tests backend : `clip-url` → `pending` (récupérateur mocké), `400 unsupported_url` (hôte hors
  allowlist), `400 transcript_unavailable`, + unit `validate_video_url`.

### Décisions

- ADR-0006 **addendum étape 20** : exception SSRF bornée (fetch serveur limité aux hôtes vidéo
  allowlistés, URL validée avant appel), architecture hybride serveur→repli client, ingestion
  `pending`, dépendance `youtube-transcript-api`.
- Aucune nouvelle `host_permissions` large (repli via `activeTab`) ; token toujours dans
  `chrome.storage.local` ; contrats `/rag/documents` et `/rag/clip` inchangés.
- Reporté (étapes 21+) : OCR image, audio/podcast, file d'attente offline, multi-onglets,
  autres plateformes vidéo.

## 0.20.0 — Extension navigateur `zetis-clip` : capture de sources RAG (Papa) — étape 19 (Lot 1)

Date : 2026-07-01 (mergé dans `main` le 2026-07-27)

> Note de versionnage : livré à l'origine en `0.11.0` (étape 19), **renuméroté `0.20.0` au merge**
> (`0.11.0` avait été réutilisé sur `main` — Capsules IA). Cf. ADR-0006.

### Ajouté

- **Nouvelle app `apps/extension-zetis-clip`** (Manifest V3, Vite + `@crxjs/vite-plugin`, TS strict, Tailwind v4) — outil **Papa** de capture de sources vers le RAG. Réutilise `@zetis/ui` et la logique d'auth de `@zetis/auth`. Tout arrive en statut **`pending`** (relecture obligatoire dans « Sources de cours »).
  - **Popup** : type détecté (page / sélection / PDF), aperçu éditable du texte, titre, sélecteur de matière (`GET /subjects`), chapitre en texte libre autocomplété, niveau optionnel, envoi + feedback « Importé en attente ».
  - **Content script** : extraction `@mozilla/readability` (anti-SSRF : pas de fetch backend d'URL arbitraire), capture de la sélection, détection PDF.
  - **Service worker** : menus contextuels « Envoyer la sélection / la page à ZETIS », client API, `POST /api/rag/clip` (texte) ou `POST /api/rag/upload` (PDF), feedback par badge.
  - **Page Options** : URL backend (+ permission d'hôte à la volée) et connexion Papa.
  - Token JWT dans `chrome.storage.local` (jamais `localStorage`).
- **Backend `POST /api/rag/clip`** : endpoint mince qui réutilise `ingest_document(validation_status="pending")` (pipeline étape 12, inchangé). `400` si texte vide. Provenance (`source_url`) conservée dans le contenu — aucune migration. Tests : `test_clip_lands_pending_and_keeps_provenance`, `test_clip_rejects_empty_text`.

### Décisions

- ADR-0006 (Accepté) : nouvelle app + dépendances `@crxjs/vite-plugin` et `@mozilla/readability`, capture côté Papa, ingestion `pending`, extraction client (anti-SSRF), token en `chrome.storage.local`.
- Aucune auto-validation : le contrat de `POST /api/rag/documents` (= `validated`) n'est pas modifié. Pas de nouvelle table, pas de worker, pas de modification du CORS backend.
- Reporté (étape 20+) : transcript vidéo, OCR image, audio, file d'attente offline, import multi-onglets.

## 0.19.0 — Missions : sources, sélecteur déterministe, pilotage Papa (ADR-0017 lot 2)

Date : 2026-07-05

### Ajouté

- **Module neutre `evidence/`** (patron ADR-0011, read-only, sans import `missions`/conseil) :
  `mastery_by_skill`, `open_gaps`, `recent_verdicts`, `weighted_quiz_signal` (poids ADR-0014
  consommé, jamais réécrit), `srs_pressure`. Test-verrou de neutralité.
- **Générateurs par source** (idempotents, `pending`) : `generate-revision` (cartes SRS dues par
  matière, `lesson|eli5 → quiz`), `generate-progression` (prochaine notion non maîtrisée d'un
  chapitre actif / rattrapage jamais travaillé, `eli5 → vocal_explain → quiz`).
- **Sélecteur déterministe versionné** (`selector.py`, `MISSION_SCORING_VERSION=v1`, zéro LLM) :
  facteurs `severity`/`due_pressure`/`continuity`/`variety`(malus)/`forced_priority`, pondérations
  en config ; `reason_code` = facteur dominant → **phrase template figée**.
- **Frontière pilotage Papa** (`MissionPilotOut`, router dédié) : `GET /missions/pending`,
  `POST /missions/{id}/reject`, `GET /missions/election/today` (recalcul à la demande, facteurs +
  alternatives), `GET /missions/pilot?type=&subject=` (preuves brutes par étape),
  `GET /missions/verdicts/recent`, `GET /missions/pilot/summary` (KPI). `generation_reason`
  **calculé** au read (non stocké).
- **Trace verdict** — `LearningEvent` `mission_verdict` à la complétion (source de `recent_verdicts`).
- **Tests invariants 7–11** (sélecteur jamais pending, déterminisme, variety, reason ∈ dict figé,
  aucun champ pilot chez student) + générateurs + pilotage. **340 back verts.**

### Modifié — cassant

- **`GET /missions/today`** : de liste triée à `{ elected, reason, reason_code, scoring_version,
  alternatives }` (ADR-0017 §3). Split de schémas `MissionStudentOut` / `MissionPilotOut`
  (deux routers, gate en requête). Lib frontend Massimo adaptée a minima (refonte visuelle =
  slice séparée).
- **`config` / `.env.example`** : `MISSION_SCORING_VERSION` + pondérations des facteurs.

### Noté

- `Mission.available_from` (DATA_MODEL) n'existe pas sur le modèle réel → toutes les validées
  `planned|active` sont candidates (aucune migration ajoutée).

## 0.18.0 — Missions à preuves serveur + verdict d'acquisition (ADR-0017 lot 1)

Date : 2026-07-05

### Ajouté

- **Preuves serveur des étapes** — `POST /api/missions/{id}/start` (`planned → active`, idempotent,
  horodate `started_at`) et `POST /api/missions/{id}/steps/{step_id}/complete` : une étape ne se
  valide que si sa **preuve** existe (`eli5`/`lesson` = consultation tracée ; `vocal_explain` = score
  reverse ; `quiz` = `QuizAttempt` `context=mission`), **postérieure au `start`** et **dans l'ordre**
  (`sort_order`) — sinon **409**. Fin de la complétion déclarative de l'étape 15.
- **Verdict d'acquisition découplé** (§5bis) — la dernière étape crédite **+50 XP inconditionnels**
  (effort) puis calcule un verdict : `acquired` (reverse ≥ `MISSION_REVERSE_THRESHOLD` **et** quiz ≥
  `MISSION_QUIZ_THRESHOLD` → mastery↑, lacune `resolved`) ou `review_later` (mastery honnête, lacune
  `in_progress`, **carte SRS (re)programmée**). Deux issues, toutes deux positives.
- **Validation Papa** (§5ter) — missions générées naissent `validation_status = pending` ; gate
  `validated` **dans la requête** des routes student (invisible même par id) ;
  `POST /api/missions/validate {ids}` (validation en lot, minimal — pilotage complet = Lot 2).
- **Config** — `MISSION_XP_REWARD` (50), `MISSION_REVERSE_THRESHOLD`, `MISSION_QUIZ_THRESHOLD`.
- **Tests d'invariants** (6) — pending jamais exposé, preuve absente/antérieure/hors-ordre → 409,
  XP même si `review_later`, `review_later` ⇒ lacune `in_progress` + carte SRS, `failed` jamais écrit
  par un flux enfant, aucune pénalité de temps ; + verdict `acquired` (quiz + reverse).

### Modifié

- **Migration `f3a4b5c6d7e8`** — `missions.validation_status` (NOT NULL, backfill existant →
  `validated`), `missions.subject_id` → nullable, `missions.started_at`, `mission_steps.resource_id`.
- **Générateur `generate_remediation`** — missions `pending`, `step_type` alignés ADR
  (`eli5`/`vocal_explain`/`quiz`), `resource_id` réels ; l'étape `quiz` réutilise un quiz de mission
  prêt couvrant la notion, sinon est omise (auto-génération = Lot 2).
- **Frontend Massimo minimal** — `MissionsPage` : démarrer + valider chaque étape (409 parlant) ;
  refonte visuelle complète = slice frontend séparée.

### Retiré

- `POST /api/missions/{id}/complete` (complétion déclarative + résolution directe de lacune).

## 0.17.0 — Fiches de révision (ADR-0015) : backend + viewer Massimo + pilotage Papa

Date : 2026-07-05

### Ajouté

- **Backend — module `fiches`** — `FicheSpec` à budgets (const `FICHE_BUDGETS` : `essentiel` ≤ 600,
  `definitions` ≤ 4, `points_cles` ≤ 5, `erreurs_a_eviter` ≤ 3, `mini_exemple` ≤ 400) + miroir
  Pydantic strict ; prompt versionné `app/prompts/fiche.py` (`v1`) ; service `generate_fiche`
  **leçon-centré** dérivé du **cours canonique** (ADR-0011, force le cours de la leçon + complément
  RAG, comme le quiz de fin de cours) ; migration `d3e4f5a6b7c8` (tables `fiches` + `fiche_views`) ;
  trace `ai_jobs` `fiche_generate`.
- **Endpoints** — Papa (`require_parent`) `/api/fiches/*` (generate, `PUT` revalide→`pending`,
  regenerate, validate, delete, `lessons/{id}`, `pilotage/{subject_id}` = arbre matière→leçons→fiches,
  miroir quiz-pilotage) ; Massimo (`/api/student/fiches/*`, gate `validated`, 404 sinon) :
  `summary` (decks), `subjects/{slug}/fiches`, `{id}`, `{id}/seen`.
- **Briques `@zetis/ui` factorisées** — `GenerationProgress` (variant `bar`|`ring` +
  `useEstimatedProgress` déplacé de frontend-papa), `ContentLifecycleActions` (quatuor
  Générer · Régénérer · Éditer · Supprimer) et `ContentStatusBadge`. `ProgressBar.tsx` (Papa)
  ré-exporte `GenerationProgress` → **capsules intactes** (preuve de réutilisation). Réutilisées
  ensuite par les mindmaps (ADR-0016).
- **Viewer Massimo** (`/fiches`, `/fiches/:slug`) — decks `SubjectDeckGrid` (badge « ✨ nouveau »),
  `FicheCard` (⭐/📖/🔑/⚠️/💡 + badge « 📚 D'après ton cours »), bouton **« 📖 Voir le cours »**
  (panneau du cours source **à côté** de la fiche, même page ; réutilise
  `/api/student/lessons/{id}/cours` + `react-markdown`), **export A5** « 🖼️ Image A5 » (PNG) et
  « 🖨️ Imprimer » (document A5 autonome) via `html-to-image` — corrige la page blanche de
  l'impression du shell.
- **Pilotage Papa** (`/fiches`, émeraude) — arbre matière→leçons→fiches, génération par leçon +
  célébration, `ContentLifecycleActions` par fiche, **éditeur structuré** `FicheEditorModal`
  (formulaire + compteurs de budget) remplaçant l'édition du `spec_json` brut.

### Décisions

- La fiche est un **objet leçon** (« 1 leçon = 1 page », budgets = contrat structurel), distinct de
  la flashcard SRS (qui porte une *notion*) ; pont SRS différé ; génération par Massimo différée.

304 tests backend + 104 (Papa) + 73 (Massimo) verts ; `tsc -b` et `vite build` verts ; migration
appliquée sur le Postgres de dev. Dépendance ajoutée : `html-to-image` (frontend-massimo).

## 0.16.0 — ELI5 v2 : entrée par decks matières + composant partagé + emblème animé

Date : 2026-07-05

### Ajouté

- **Routes élève « notions validées »** (module `curriculum`, lecture seule, aucune migration)
  — `GET /api/student/notions/summary` (compteurs par matière de l'année active, une requête
  agrégée) et `GET /api/student/subjects/{slug}/notions` (notions dédupliquées par `skill_id`,
  `chapter_title` de la leçon la plus récente ; 404 hors année, `[]` si rien de validé). Même
  chaîne de filtrage que les cours élève (chapitre `validated` → leçon `validated` → `Skill`).
  Types dans `packages/types/src/curriculum.ts`.
- **Refonte ELI5 en 3 écrans** (frontend Massimo, `/eli5`) : écran 1 **decks matières**
  (compteurs de notions, matière vide = « bientôt », deck « ✨ Question libre » en tête) → écran 2
  **chips de notions** (nom + `chapter_title`) + champ « pose ta question » → écran 3 = **la
  session ELI5 existante, inchangée** (explain → reverse, badge « D'après ta leçon »). Chip →
  `explain` avec `skill_id` réel (badge leçon déterministe) ; question libre → résolution client
  (le moteur n'accepte que `skill_id`). Deep-link `?subject=slug`. Le moteur ELI5 n'est pas touché.
- **Composant partagé `SubjectDeckGrid`** — extrait de la grille « Par matière » de la page
  Révision (enveloppe `DeckDisc`), **Révision migrée dessus à l'identique** (parité visuelle
  préservée) ; les Mélanges restent locaux à Révision. `DeckDisc` gagne des options
  rétro-compatibles (deck atténué mais cliquable, `soonHint`, `hideBadge`).
- **Badge « ✨ new » sur les decks ELI5** — `new_count` par matière dans `/notions/summary` :
  notions dont une leçon validée porteuse a été créée dans les 7 derniers jours (récence de
  création, signal global ; `Lesson.created_at` faute d'horodatage sur `Skill`/`Chapter`).
- **Emblème animé ELI5** dans l'en-tête de l'écran decks — symboles de complexité (❓🔢🧩🌀) en
  orbite autour de l'ampoule 💡 qui s'illumine par à-coups (« aha ! ») en projetant des
  étincelles ; 4 `@keyframes` en `motion-safe:` (figé sous `prefers-reduced-motion`).

## 0.15.0 — Moteur de quiz unifié (ADR-0014, Lot 1) : backend + pilotage Papa + client Massimo

Date : 2026-07-05

### Ajouté

- **Moteur de quiz unifié** (ADR-0014, module `quizzes`) — quiz de fin de cours en premier
  client, **deuxième client du substrat canonique** (ADR-0011). Génération **locale** depuis le
  cours validé d'une leçon (formats choisis par le modèle), **auto-vérification à l'aveugle**
  (question dont le modèle ne retrouve pas sa clé → écartée), **correction déterministe serveur**
  (7 formats : `mcq`, `mcq_multi`, `true_false`, `cloze`, `numeric`, `ordering`, `matching`),
  **scoring pondéré** (`mission` = signal faible, **n'ouvre jamais de lacune**). XP = base
  d'effort + bonus score (0 %→10, 100 %→30).
- **Page Papa « Quiz — pilotage »** (`/quiz`, endpoints `/api/quiz-pilotage/*` + `/api/quizzes/*`)
  : inventaire par matière, génération par leçon (popover volume/difficulté + barre de progression),
  inspection avec clés, édition (→ `manual`)/ajout manuel/retrait, régénération (préserve les
  `manual`), suppression (hard/archivage), KPI + santé de l'auto-vérification par matière.
- **Client Massimo** (`/quiz`, `/quiz/session`, endpoints `/api/student/quiz*`) : grille des
  matières (grisée si aucun quiz) → lecteur question par question (7 formats), **feedback immédiat
  bienveillant** (jamais la clé), résumé de fin (XP + forces / « à revoir bientôt ») ; bouton
  « 🎯 Quiz » sur la page Cours quand un quiz existe ; hero animé sur la page Quiz.
- **Migration `b1c2d3e4f5a6`** : `quizzes.lesson_id`, `quiz_questions.source` + `.status`
  (`question_type` reste `varchar` → extension des formats sans DDL).
- **Lot 2 — format `open` (jugement LLM)** — clôt l'ADR-0014. Réponse écrite libre **jugée par
  le moteur local** contre des critères (opt-in manuel Papa, hors mix auto-généré) : évaluation
  **critère par critère** (persistée dans `quiz_answers.ai_evaluation_json`, migration
  `c2d3e4f5a6b7`), **bénéfice du doute** si le juge n'est pas sûr (élève crédité, ambiguïté
  remontée à Papa), feedback toujours bienveillant. Player Massimo (zone de texte) + authoring
  Papa (bascule QCM / Réponse ouverte + critères). Vérifié live (Ollama réel).

### UI Massimo (retouches)

- En-tête sidebar refondu (logo `zetis-avatar.png` + halo animé + wordmark `zetis-texte.png`),
  aligné sur l'avatar du header ; header : profil Massimo à gauche ; fond sidebar = fond header
  (`#000010`) ; icônes agrandies.

## 0.14.0 — Cartes SRS : génération page-driven + pilotage Papa + refonte UI Révision Massimo

Date : 2026-07-05

### Ajouté

- **Génération des cartes SRS** (ADR-0013, module `memory`) : contenu dérivé du **cours
  validé** de chaque notion, 100 % local (Ollama), upsert réconciliateur à 3 branches
  (A régénère en préservant la planif / B crée / C suspend les orphelines, réactivables).
  Page Papa **« Cartes de révision »** (`/cartes-revision`) : arbre matière→chapitre→notion,
  KPI, aperçu recto/verso, génération par matière.
- **Pilotage Papa — évolutions** (endpoints `/api/memory/cards/*`, `require_parent`) :
  - Bouton **« ↻ Régénérer »** par matière, même quand rien n'est « à générer »
    (réconciliation non destructive) ; **barre de progression estimée (%)** pendant la
    génération (patron partagé `ProgressBar` + `useEstimatedProgress`).
  - **Édition d'une carte** en place (`PATCH /api/memory/cards/{card_id}`, recto/verso,
    planification préservée) et **suppression d'une carte** unitaire
    (`DELETE /api/memory/cards/{card_id}`), avec `ConfirmDialog` — distinctes du retrait de
    toute une notion (`DELETE /skills/{id}`).
- **Surface Massimo** : `GET /api/student/reviews/summary` renvoie **toutes** les matières
  avec un booléen `has_cards`.
- **Refonte UI page Révision Massimo** (`/revision`) :
  - « Par matière » affiche **toutes** les matières ; celles sans carte apparaissent
    **grisées** avec leur **emoji** (« à venir » / « pas encore de cartes »), non lançables.
  - Decks = **simples cercles** avec l'icône/emoji de la matière (suppression de l'effet
    pile et de l'anneau conique coloré / « halo »).
  - Bannière motivante **« SRS · Révision espacée »** (`SpacedMemoryHero`) : illustration
    `SRS-cards.png` animée + courbe SVG de mémoire (points espacés 1j→3j→7j→14j).
  - `FlipCard` recto/verso **color-codés** : recto bleu « Question », verso émeraude
    « Réponse ».
  - Icône de la sidebar « Révision » = `SRS-cards.png` (au lieu de l'emoji 🗂️).

### Décisions

- Contrat `summary` étendu : `has_cards` distingue « aucune carte active » de « cartes
  présentes » (grisé vs « à jour ✓ ») — cf. ADR-0013 (addendum).
- L'édition d'une carte ne touche **jamais** la planification (`interval_days`,
  `ease_factor`, `due_at`) : seul le contenu change (invariant ADR-0013 §3).
- La régénération d'une matière est **non destructive** (réécrit le contenu, préserve
  l'historique de révision de Massimo).

## 0.13.0 — Référentiel : rattrapage « skills-only » + verrous du cours canonique

Date : 2026-07-03

### Ajouté

- **Génération « skills-only » pour un niveau antérieur** (rattrapage, `docs/decisions/adr-0010-generation-skills-only-rattrapage.md`) :
  Papa peut alimenter le référentiel de notions (`Skill`) d'un niveau du même cycle
  (ex. français 5e) sans créer d'année scolaire rétroactive. Flux **stateless** en deux
  temps : `POST /api/curriculum/skills-backfill/generate` enchaîne les passes 1 et 2
  **en mémoire** (chapitres et leçons ne servent que d'échafaudage et ne sont **jamais
  persistés**) et renvoie une prévisualisation des notions groupées + dédupliquées ;
  après revue, `POST /api/curriculum/skills-backfill/confirm` upserte les notions en
  `Skill` au niveau cible (réutilise l'upsert de la passe 2 — aucune leçon ni liaison
  créée). Garde parent, niveau borné au cycle 4 (5e/4e/3e → sinon 400), trace `ai_jobs`
  `curriculum_skills_backfill`, invariant vie privée testé. Miroir de types dans
  `packages/types`.

### Décisions

- **Cours validé = source canonique des dérivés** (addendum `docs/decisions/adr-0009-addendum-cours-canonique.md`) :
  un `Lesson.content_markdown` **validé** devient le contexte prioritaire des dérivés
  (ELI5, capsule, quiz…), avant le RAG brut et la connaissance du modèle ; le lien
  `Lesson ↔ Skill` est la table N-N `lesson_skills`.
- **Passe 1 strictement mono-niveau** (précision ADR-0010) : le débordement du few-shot
  SVT est corrigé et `CURRICULUM_PROMPT_VERSION` passe à `v2`.

### Corrigé / verrouillé

- **Gate du cours canonique** : `POST /api/lessons/{id}/generate-content` remet désormais
  la leçon en `draft` après une (re)génération réussie (même si elle était `validated`) —
  un cours réécrit non relu ne doit plus alimenter les dérivés ni Massimo avant
  revalidation par Papa. (`archived` reste 409 ; l'édition manuelle du cours par Papa,
  `PATCH /lessons/{id}`, ne touche pas le statut : Papa est l'autorité de validation.)
- **Index `ix_lesson_skills_skill`** sur `lesson_skills(skill_id)` (migration
  `e1f2a3b4c5d6`) : la PK composite `(lesson_id, skill_id)` ne couvre pas la résolution
  du cours canonique par notion (filtre `skill_id`).

## 0.12.0 — Moteur LLM (MoE), lancement prod-like « tout Docker » + UX capsules (étape 21)

Date : 2026-07-03

### Ajouté

- **Lancement prod-like « tout containerisé »** (`pnpm prod:up`, `docker-compose.prod.yml`) : backend,
  worker-media et les **2 frontends servis par nginx**, en une commande, à côté du dev natif
  (`pnpm dev`, inchangé). **Ollama reste sur l'hôte** (GPU Metal) ; le backend le joint via
  `host.docker.internal`. Cf. `infra/docker/README.md`.
- **Voix Piper (TTS) dans l'image backend** : `piper-tts` + modèle FR `fr_FR-siwis-medium` bakés →
  la narration des capsules fonctionne en conteneur.
- **Célébration « mini-victoire »** (brique partagée `@zetis/ui`, réutilisable) : petit surgissement
  joyeux (halo néon + particules, CSS) + **carillon doux synthétisé** (Web Audio, aucun asset
  binaire), **désactivable** via un `SoundToggle` persistant. Papa : à la génération réussie
  (« Capsule créée ! ») ; Massimo : quand une **nouvelle capsule** apparaît (dédup une-fois-par-capsule).
  Respecte `prefers-reduced-motion`.
- **Compteur de visionnages de Massimo** sur les 2 frontends : `CapsuleStats.view_count` (somme des
  visionnages, répétitions incluses) ; badge « 🎬 N visionnages ».

### Décisions

- **Moteur d'inférence LLM** (`docs/decisions/adr-0008-inference-mlx-vs-ollama.md`) : benchmark sur les
  vrais prompts ZETIS (vitesse + qualité + % JSON valide) → **MLX rejeté** (plus lent qu'Ollama sur
  M3 Max) ; **adopté `qwen3.6:35b-a3b`** (MoE : qualité ≈ 72b à la vitesse la plus rapide ;
  `OllamaProvider` passe `think:false` pour les modèles Qwen3). Référence cloud (GPT-4o, Claude
  Sonnet 5) : le local égale/dépasse → **production 100 % locale** confirmée (vie privée de Massimo).
- **Embeddings découplés** de la génération (`EMBED_PROVIDER`, défaut `ollama`) → changer de modèle de
  génération ne casse pas le RAG (zéro migration pgvector).

### Corrigé

- **Rendu MP4 en conteneur** : le worker-media lisait la DB via le défaut `localhost:5432`
  (connection refused) → clé d'env corrigée en **`ZETIS_DATABASE_URL`** (préfixe attendu par la
  config) ; sans ça la capsule restait `rendering` (invisible côté Massimo). Ajout de `shm_size: 1gb`
  (fiabilité Chromium/Remotion sur capsules longues).

## 0.11.0 — Capsules IA : Remotion + rendu MP4 + voix Piper (étape 20)

Date : 2026-07-01

### Ajouté

- **Rendu MP4 sandboxé** (ADR-0007) : le **worker-media** consomme une file **RQ** et rend chaque capsule en vidéo via **Remotion/Node** (Chromium + ffmpeg), isolé du backend. La vidéo est stockée sur **MinIO** (repli disque) et **lue côté Massimo**.
- **Voix off Piper par scène** : synthèse vocale locale (abstraction TTS, provider Piper) — la **narration pilote la durée de chaque scène**.
- **Vocabulaire de scènes étendu à 9 types** : ajout de `barmodel`, `geometry`, `steps`, `timeline`, `diagram`.
- **Regroupement matière → chapitre** de la bibliothèque de capsules (Massimo), avec **recherche** et **icônes de matière**.
- **Difficulté** (facile / moyen / difficile) et option de **durée ≈ 1 min** pilotant la génération (**prompt v5**).
- **Suivi des visionnages** Massimo : marquage vu / nouvelles capsules / **compteur de répétitions**.
- **Pilotage Papa** : modale de création (badge **capsule-AI**), **édition JSON** du spec, **barres de progression live** (génération / voix / rendu) et **rendu automatique à la validation**.

### Décisions

- Capsule = **spec typé** (JSON versionné) rendu par un **moteur Remotion** : Player à l'écran (Lot 1) puis rendu **MP4** hors-ligne (Lot 2), cf. `docs/decisions/adr-0007-capsules-ia-remotion.md`.
- Rendu vidéo **sandboxé** dans le worker-media (RQ), jamais dans le process backend ; artefacts sur MinIO.
- Routes capsules **réservées à Papa** ; Massimo ne consulte que la bibliothèque validée et enregistre ses visionnages.

## 0.10.0 — Refonte page Matières + header global animé Massimo (étape 19)

Date : 2026-06-30

### Ajouté

- **Page Matières refondue** dans le style du login (glassmorphique / néon) : bandeau « Progression globale » (niveau, XP, barre vers le niveau suivant, lien Progression), carte « Capsule IA dispo », grille des 8 matières, bande « Cette semaine » (série, objectifs, meilleure matière). Logique sortie du composant dans le hook **`useMatieres`** (gamification live + mock typé avec repli pour `subjects` / objectifs de semaine / capsule recommandée).
- **Header global animé** (`MassimoBannerHeader`, monté dans `MassimoLayout`) sur **toutes** les pages : emblème ZETIS (cercle + livre) cadré depuis la bannière, **cubes neuronaux** montant du livre (`NeuralCubes`), **réseau de connexions** cercle → bords avec impulsions (`NeuralLinks`), halo pulsant, et avatar Massimo + niveau·XP **live** (gamification, repli `PROFILE`) + Déconnexion. Remplace l'ancienne barre du haut (corrige l'incohérence mock vs live).
- **Primitives & assets** : `glass.tsx` (surfaces/halos/dégradés extraits du `LoginScreen`), `SubjectTile` (carte matière, **cadre teinté par la couleur de la matière**), `lib/subjectIcons.ts` (icônes PNG via `import.meta.glob`), `headerFx.css`, icônes matières `src/assets/subjects/`, `public/zetis-banner.png`.

### Décisions

- Réutilisation stricte des tokens/classes du `LoginScreen` (verre, halos indigo/cyan/fuchsia, dégradés, `LogoZetis`, avatar) — pas de CSS dupliqué hors `headerFx.css` (effets dédiés).
- Animations en CSS + SVG/SMIL, responsive (ResizeObserver pour le réseau neuronal), **`prefers-reduced-motion` respecté**.
- Liens câblés vers les **routes existantes uniquement** (`/progression`, `/subjects/:slug`, `/capsules`) ; pas de route lecture-capsule → repli propre vers `/capsules`. Aucune route ni fuite vers l'interface Papa.
- Endpoints `/subjects`, objectifs de la semaine et capsule recommandée encore **mockés** (repli typé isolé dans `useMatieres`, `TODO(api)`), à brancher ensuite. Aucune donnée pédagogique durable stockée côté front.

### Retiré

- `SubjectCard` (remplacé par `SubjectTile`) et les composants d'itération visuelle `BannerWave` / `HeaderOscilloscope` / `KnowledgeSparks` (remplacés par `NeuralCubes` + `NeuralLinks`).

## 0.9.0 — Page de login / démarrage ZETIS unifiée (étape 18)

Date : 2026-06-30

### Ajouté

- **`LoginScreen` partagé** (`@zetis/auth`) : page d'accueil + connexion soignée — panneau de marque (animation de marque ZETIS jouée à l'arrivée, fondu final vers le logo) + carte glassmorphique (identifiant, mot de passe avec œil, « se souvenir de moi », bouton dégradé, séparateur « ou », bouton Apple *bientôt*, lien d'aide) + avatars Massimo/Papa dans le sélecteur de profil.
- **Sélecteur de profil Massimo / Papa** avec **redirection croisée** : le profil de l'app active se connecte sur place, l'autre profil renvoie vers son frontend (`VITE_PAPA_URL` / `VITE_MASSIMO_URL`, défauts `localhost:5174` / `5173`). L'auth reste par app (chaque app n'accepte que son rôle).
- **Composant `LogoZetis`** (wordmark néon Syncopate) + setup Vitest/Testing Library. Les `LoginPage` des deux apps se réduisent à `<LoginScreen role=… otherAppUrl=… />` ; `@source packages/auth` ajouté aux thèmes Tailwind.

### Décisions

- Design unifié (même look dans les deux apps), réutilisant la palette par défaut Tailwind (indigo/cyan/fuchsia) indépendamment du thème d'app.
- Reportés : « Mot de passe oublié » réel, Sign in with Apple, mutualisation de `LogoZetis` dans `packages/ui`.

## 0.8.0 — Design system partagé `@zetis/ui` (étape 17)

Date : 2026-06-30

### Ajouté

- **Package `@zetis/ui`** : design system partagé (shadcn-style) — `Button`, `Card`, `Badge`, `Spinner`, `EmptyState` + util `cn` (clsx + tailwind-merge, `class-variance-authority`). Consommé en source TS comme `@zetis/auth`.
- **Théming par tokens sémantiques** : `primary`, `card`, `border`, `muted`, `foreground`… définis dans le `@theme` de chaque app et mappés sur sa palette (Massimo indigo `#6366f1` / Papa émeraude `#10b981`). `@source` ajouté pour que Tailwind v4 scanne `packages/ui`.
- **Première adoption** : `MissionsPage` (Massimo + Papa) refondues sur les primitives.
- **Feuille de route frontend** : `FRONTEND_ROADMAP.md` (état des pages, lots priorisés, quick wins).

### Décisions

- Base **shadcn/ui** (cva + Tailwind, tokens CSS) plutôt que primitives ad hoc ; **un seul composant, deux thèmes** via tokens sémantiques par app.
- Vérifié au runtime : `bg-primary` rend la bonne couleur dans chaque app.
- Reportés : généraliser aux pages live (Lot B), composants Radix (Dialog/Select), dark/light, mobile Massimo.

## 0.7.0 — Gamification : XP, niveaux, streak, badges (étape 16)

Date : 2026-06-30

### Ajouté

- **Module gamification** (`app/modules/gamification`) : `GET /api/gamification/summary` → total XP, **niveau** (100 XP/niveau), barre vers le niveau suivant, **streak** (jours consécutifs, tolérance d'un jour), **badges** déterministes, activité récente. Aucune migration (lit/écrit `xp_events`).
- **Crédit d'XP** via helper partagé `award_xp` : mission terminée (+20, déjà en place), **verbalisation ELI5 reverse** (+10), **diagnostic passé** (+15).
- **Frontend Massimo** : `ProgressionPage` branchée (niveau, barre XP, streak, badges, activité récente) ; section « par matière » laissée indicative.

### Décisions

- Gamification au service de l'apprentissage (CLAUDE.md) : pas de loot box, pas de classement social, streak raisonnable.
- Reportés : vue Papa de la régularité/XP, niveaux nommés, XP par matière, garde-fou anti-spam d'XP.

## 0.6.0 — Remédiation : lacunes → missions (étape 15)

Date : 2026-06-30

### Ajouté

- **Moteur de remédiation** (`app/modules/missions`) : `generate-remediation` transforme chaque **lacune ouverte** (`gaps`) du diagnostic en **mission de remédiation** (3 étapes : expliquer → réexpliquer → quiz, priorité ∝ sévérité). Idempotent. Aucune migration (réutilise `missions`/`mission_steps`/`gaps`/`xp_events`).
- **Complétion** : `POST /api/missions/{id}/complete` → mission `completed`, étapes `done`, **lacune liée résolue**, **XP crédité** (`xp_events`).
- **Endpoints** : `POST /api/missions/generate-remediation` (Papa), `GET /api/missions`, `GET /api/missions/today` (Massimo), `POST /api/missions/{id}/complete`.
- **Frontend Papa** : `MissionsPage` branchée — bouton « Générer la remédiation », liste statut/priorité/étapes.
- **Frontend Massimo** : `MissionsPage` (remplace le placeholder) — missions du jour + « J'ai terminé » (message + XP).

### Décisions

- Étapes de mission **déterministes** (template pédagogique), pas d'appel IA — robustes et testables.
- Vocabulaire bienveillant (CLAUDE.md) : « renforcer », « consolidation », jamais d'échec.
- Reportés : étapes reliées à ELI5/quiz réels, niveaux/streak XP, missions manuelles Papa.

## 0.5.0 — Diagnostic complet (étape 14, Phase 4)

Date : 2026-06-30

### Ajouté

- **Moteur de diagnostic** (`app/modules/diagnostics`) : QCM générés par IA par notion (prompt versionné `app/prompts/diagnostic.py`, via `LLMProvider`, trace `ai_jobs`), correction automatique, **score par notion**, upsert `skill_mastery` et ouverture de **lacunes** (`gaps`) pour les notions < 70 %. Aucune migration (réutilise `quizzes`/`quiz_questions`/`quiz_attempts`/`quiz_answers`).
- **Endpoints** : `GET /api/diagnostics/subjects`, `POST /api/diagnostics/generate` (Papa), `GET /api/diagnostics/quizzes`, `GET /api/diagnostics/quizzes/{id}`, `POST /api/diagnostics/quizzes/{id}/submit` (Massimo), `GET /api/diagnostics/results` (Papa).
- **Frontend Massimo** : `DiagnosticPage` branchée (liste → QCM → forces + prochaines étapes, ton bienveillant). Les bonnes réponses ne sont jamais exposées à l'enfant.
- **Frontend Papa** : `DiagnosticsPapaPage` — lancer un diagnostic par matière, suivre le score par notion (barres) et les lacunes.

### Décisions

- Questions **générées par IA** (pas de banque figée) ; le `FakeLLMProvider` renvoie aussi des QCM pour des tests offline déterministes.
- Vocabulaire bienveillant (CLAUDE.md) : « notion à renforcer », jamais d'échec.
- Reportés : génération de missions de remédiation depuis les lacunes, diagnostic multi-matières en une session, difficulté adaptative.

## 0.4.0 — RAG sémantique + sources Papa (étapes 11 → 12)

Date : 2026-06-30

### Ajouté

- **RAG sémantique pgvector** (Étape 11) : modèles `rag_documents` / `rag_chunks` (`vector(768)`) + index ivfflat cosinus (migration `a1b2c3d4e5f6`) ; `OllamaEmbeddingProvider` (`/api/embed`, `nomic-embed-text`) ; module `rag` (chunking, ingestion vectorisée, recherche cosinus, `retrieve_for_skill`) ; endpoints `POST/GET /api/rag/documents`, `POST /api/rag/search`. ELI5 `explain` injecte le contexte récupéré (renvoie `[]` sans appel embeddings si aucune source → contrat intact).
- **Ingestion de fichiers + validation Papa** (Étape 12) : `POST /api/rag/upload` (MD/TXT/PDF, extraction via **pypdf**) → source en statut **`pending`** ; `POST /api/rag/documents/{id}/validate|reject` (synchronise document + chunks). Page Papa **« Sources de cours »** (upload + liste + Valider/Rejeter). Seuls les chunks `validated`/`official` alimentent l'IA (relecture humaine, cf. CLAUDE.md).
- **RAG visible côté Massimo** (Étape 13) : ELI5 `explain` expose `sources_used` dans `output_json` (= nombre de passages de cours injectés) ; le front Massimo affiche le badge **« 📚 D'après ton cours »** quand l'explication s'appuie sur une source validée.

### Décisions

- Embeddings et LLM restent des **providers abstraits** distincts (ollama en local), trace `ai_jobs` conservée.
- Les sources uploadées par Papa ne sont **jamais** utilisées avant validation manuelle.
- Reportés : réponse RAG sourcée dédiée (`/rag/answer`) + citations/confiance, stockage du fichier brut (MinIO), RAG sur les productions de Massimo, import des programmes officiels.

### Dépendances

- Backend : `python-multipart`, `pypdf`.

## 0.3.0 — MVP fonctionnel (étapes 2 → 10)

Date : 2026-06-30

### Ajouté

- **Frontend Massimo** (Étapes 2, 7) : React 19 + Vite + TypeScript strict + Tailwind v4 ; auth, layout + sidebar, pages Accueil, Matières (+ matière dédiée `/subjects/:slug`), Diagnostic, ELI5 (branchée sur l'IA), Mindmaps, Capsules IA, Progression. Données mockées sauf ELI5.
- **Frontend Papa** (Étapes 3, 8) : cockpit analytique — Dashboard (KPIs/alertes/reco), Progression, Lacunes, Missions, Diagnostics, Conseil de classe IA, Cahier de bord IA, Années scolaires, Matières & programmes, Capsules pilotage, Mode focus, Paramètres.
- **Backend FastAPI** (Étapes 4-6) : `/health`, `/health/db`, `/api/version`, CORS, **auth JWT** (rôles papa/massimo), tests pytest.
- **Connexion front ↔ back** (Étape 5) : statut backend affiché dans les deux apps.
- **Base de données** (Étape 9) : PostgreSQL + **SQLAlchemy 2.0** + Alembic + psycopg3 ; 22 tables (+ `ai_jobs`) ; seed de dev idempotent.
- **Boucle IA / mémoire** (Étape 10) : ELI5 explain + reverse via abstraction **`LLMProvider`** + **`OllamaProvider`** (qwen2.5) ; trace **`ai_jobs`** à chaque appel ; écriture `learning_events` + upsert `skill_mastery` + 1 carte de révision espacée (intervalles fixes 1/3/7) ; extension `pgvector` activée.
- **Package partagé `@zetis/auth`** : logique auth + client API factorisée entre les deux frontends.

### Décisions

- ORM : **SQLAlchemy 2.0** (typé) + Alembic + psycopg3.
- IA : **un seul provider** abstrait (ollama / qwen2.5 en local), prompts versionnés (`apps/backend/app/prompts`), trace `ai_jobs` obligatoire, feedback bienveillant.
- Reportés post-MVP : RAG (ingestion/embeddings), capsules vidéo, jobs IA asynchrones, lien auth ↔ utilisateur en base.

## 0.2.0 — Squelette monorepo + outillage

Date : 2026-06-29

### Ajouté

- Squelette du monorepo (Étape 1) : `apps/{frontend-massimo,frontend-papa,backend,worker-ai,worker-media}`, `packages/{ui,types,prompts}`, `infra/{docker,nginx}`, `storage/`, `scripts/` avec un README par dossier.
- Fichiers de configuration racine : `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` (TypeScript strict), `docker-compose.yml`, `.env.example`.
- `.gitignore` et `.graphifyignore`.
- Outillage Graphify : skill + hook `PreToolUse`, knowledge graph dans `graphify-out/` (local, non versionné).

### Modifié

- Unification de la convention de nommage du monorepo sur `apps/` (frontends, backend et workers), alignée sur le SUIVI ; correction des docs divergentes (`PROJECT_STRUCTURE`, `ARCHITECTURE`, `README`, `CLAUDE.md`, etc.).

## 0.1.0 — Initialisation documentation

Date : 2026-06-29

### Ajouté

- Documentation racine projet.
- Instructions Claude Code.
- Architecture globale.
- Stack technique.
- Roadmap.
- Backlog.
- Spécification produit.
- Modèle de données.
- API spec.
- Sécurité.
- Déploiement.
- Documentation frontend Massimo.
- Documentation frontend Papa.
- Documentation IA/RAG/mémoire/capsules.
- Prompts Claude Code.

### Décisions

- Projet renommé ZETIS.
- Obsidian non obligatoire.
- Deux frontends séparés : Massimo et Papa.
- Backend FastAPI.
- PostgreSQL + pgvector.
- MinIO pour fichiers.
- Docker Compose pour développement.
