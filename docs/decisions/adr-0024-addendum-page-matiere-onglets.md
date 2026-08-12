# Addendum ADR-0024 — La page matière porte l'effort de Massimo, et se range en onglets

## Statut

**Accepté — 2026-08-11, livré le jour même** (chantiers A + B + C), **mergé** : PR #114,
squash `4a320ae`, branche `feat/page-matiere-onglets` supprimée.

Cadré, livré et relu à l'écran dans la même session. **Aucune migration.** Deux endpoints
étendus (`panoply`, `/gamification/history`), un servi plus riche (`/student/galaxy`), un neuf
(`/student/subjects/{slug}/resume`).

> S'appuie sur : `adr-0024 §5` (doctrine de progression — un COMPTE jamais un pourcentage, aucun
> `mastery_score` affiché, aucun classement), son addendum `page-matiere-index-notions`
> (2026-08-01, dont il **révise une lecture** — voir §1), `adr-0027-addendum-demandes-surface-eleve`
> (le geste « demander »), `adr-0024-addendum-accueil-vivant` (contrat de série creuse de
> `/api/gamification/history`).
>
> Cadrage : **9 wireframes** noir & blanc produits par le user le 2026-08-11 — 1 pour `/matieres`,
> 8 pour `/subjects/:slug`.

## Contexte

La page matière livrée le 2026-08-01 fait bien ce pour quoi elle a été écrite : elle est l'index
des notions d'une matière, et le repli sans WebGL de la galaxie. Mais à l'usage, trois choses se
voient.

Elle est **pauvre en information utile pour un enfant** : hors l'arbre des chapitres, elle
n'annonce rien de ce que Massimo a fait dans cette matière. Elle est **peu dense** — une ligne de
notion tient un nom, un libellé d'état et sept pastilles de 8 px sur toute une largeur d'écran. Et
un chapitre à 55 notions, une fois déplié, est un mur : la recherche devient le seul moyen d'y
entrer.

Le user a produit neuf wireframes qui répondent à ces trois points, et a tranché sur un
quatrième : **« voir ses XP est positif pour Massimo »**.

## Décision

### 1. Le XP et le niveau reviennent sur la page matière — révision d'une lecture, pas de l'ADR

L'addendum du 2026-08-01 écrivait que la page de Phase 1 « contredit l'ADR-0024 §5 sur trois
points : elle affiche **un niveau, un XP par matière**, et une "meilleure matière" ». Cette
lecture est **révisée sur les deux premiers points**. Le troisième est confirmé.

Le §5 dit : « **Aucun score par matière, aucun pourcentage, aucun classement.** […] La page répond
à "où j'en suis", elle **ne note pas Massimo** et **ne met pas ses matières en concurrence**. »

Il énonce donc **deux torts distincts**, et le XP n'en commet aucun **par lui-même** :

- **Noter Massimo.** Un score de maîtrise dit ce qu'il *vaut* ; il monte et il **descend**. Le XP
  dit ce qu'il a *fait* ; il ne peut que monter. C'est le seul nombre de l'app qui ne peut pas
  être une mauvaise note. `CLAUDE.md` l'autorise d'ailleurs explicitement (« Autorisé : XP ;
  niveaux ; badges pédagogiques »), et il est déjà affiché sur l'Accueil et dans la barre latérale.
- **Mettre les matières en concurrence.** Ce tort-là ne naît pas du nombre mais de sa
  **juxtaposition**. Sur la page d'**une** matière, il n'y a rien à côté de quoi se comparer.

D'où la règle, qui remplace un interdit global par une frontière :

> **Le XP et le niveau par matière sont autorisés sur la page d'une matière.**
> **Sur la grille `/matieres`, ils ne doivent jamais servir à ORDONNER ni à DÉSIGNER.** L'ordre
> des matières reste celui du programme. Aucun tri par XP, aucune « meilleure matière », aucun
> podium — ce qui reste exactement l'interdit du §5, appliqué là où il mord vraiment.

**Calculabilité vérifiée avant décision** : `xp_events.subject_id` existe et est peuplé (Maths
647, Français 430, Anglais 100, SVT 60, Histoire-Géo 20). Le niveau se dérive du **barème
existant** `_level_from_xp` (`gamification/service.py:86`, `XP_PER_LEVEL = 100`) — on n'en invente
pas un second.

### 2. Ce qui reste interdit ne bouge pas : aucun pourcentage, jamais

Les maquettes portent un anneau « **66 % Maîtrisé** » et des barres « **72 % acquis** ». C'est le
point où le §5 est frontalement contredit, et il **n'est pas levé**.

L'anneau est conservé, son contenu change : **des comptes**, dans les libellés d'enfant déjà en
service (`starStyle`). Même information, même lecture d'un coup d'œil, sans note.

`mastery_score` reste non affiché et non sérialisé.

**Ce compte ne coûte aucune requête** : les états des notions sont déjà dans la panoplie chargée.

#### 2 bis. L'anneau ne montre QUE ce qui est allumé — corrigé à l'écran

> **Décision née de la relecture visuelle du 2026-08-11, sur données réelles. Aucun test ne
> l'avait vue** — et la version d'origine passait les 46.

Première version : l'anneau rendait **les cinq** états, « À découvrir » compris. Sur SVT, qui a
**78 notions « À découvrir » sur 80**, le résultat était un **disque gris à 97,5 %** avec deux
échardes de couleur. Il ne disait pas *voilà où tu en es*, il disait **tu n'as presque rien fait**
— un cadrage de perte, sur une surface enfant.

Le §5 tranche de lui-même : « la vue d'ensemble affiche un **COMPTE d'étoiles allumées** ». La
galaxie ne dessine pas le noir entre les étoiles.

- **`unknown` est exclu des segments ET de la légende.**
- **Le compte des non-commencées n'est affiché nulle part**, et c'est le point le plus important :
  « 2 travaillées » à côté de « 78 à découvrir » **reconstitue « 2 sur 80 »** — le ratio interdit,
  réintroduit par la porte de derrière. L'en-tête donne déjà le total du catalogue ; c'est un fait
  sur la matière, pas sur Massimo.
- **Rien de commencé → la carte ne s'affiche pas du tout.** Un anneau vide serait un réceptacle
  vide ; les cartes de chapitres juste en dessous sont la vraie invitation.

Deux test-verrous le tiennent, **vérifiés par sabotage** (réintroduire `unknown` les fait rougir
tous les deux).

### 3. La page se range en onglets — et ce ne sont pas des tuiles

L'addendum du 2026-08-01 condamne le launcher : « **Pas un launcher d'outils** […] reproduire
leurs tuiles ici en ferait un doublon appauvri — c'est ce qui rendait la page inerte ».

Ce motif est **maintenu**, et il ne s'applique pas ici : ce qui rendait la Phase 1 inerte, c'est
que ses tuiles **ne menaient nulle part** (trois sur quatre sans `onClick`). Les onglets sont des
**liens vers les surfaces qui existent déjà**, construits sur la table de routes partagée
`subjectRouteFor` — aucune destination n'est inventée.

`Vue d'ensemble · Chapitres · Cours · Fiches · Cartes · Révisions · Quiz`

Les maquettes portent aussi « Missions » et « Progression » : **écartés**, faute de route par
matière. Missions reste global ; la progression garde le bouton « Voir en galaxie → ».

> ⚠️ **Un onglet qui ne mène nulle part est la faute que cet ADR interdit.** C'est le même
> signalement qu'en 2026-08-01 sur la pastille `quiz` du bandeau, cliquée en vain et lue comme une
> panne. Une chose qui ressemble à un lien doit être un lien.

#### 3 bis. « Mindmaps », pas « Cartes » — et jamais de barre d'onglets qui défile

Deux corrections **nées de la relecture**, l'une signalée par le user, l'autre mesurée à 390 px.
Aucune n'était visible d'un test.

- **L'onglet mindmap s'appelait « Cartes »**, juste avant « Révisions ». Le user a lu qu'**il
  manquait un lien vers les mindmaps** — le lien était là, sous un nom qui désigne déjà autre
  chose. Le mot « carte » sert en effet à deux surfaces dans l'app (`ACTION_UI` : « Reconstruire
  la **carte** » / « Réviser mes **cartes** »), et l'onglet en inventait un troisième usage.
  → L'onglet prend le nom que la barre latérale montre à Massimo tous les jours : **« Mindmaps »**
  (`navigation.ts`). La bande de catalogue suit : « 1 **mindmap** », qui ne se confond plus avec
  « 8 **cartes à revoir** » trois pastilles plus loin. Un test-verrou interdit désormais de nommer
  « carte » deux destinations différentes.

  > ✅ **Dette PAYÉE le 2026-08-12.** Elle était laissée hors périmètre sciemment : `ACTION_UI`
  > portait encore la collision (« Reconstruire la carte » / « Réviser mes cartes »), et cette
  > table est partagée par cinq surfaces (panneau de notion, pastilles, bande de catalogue,
  > Galaxy, chat) — la corriger dépassait cette page.
  >
  > **`mindmap` y dit désormais « Reconstruire la mindmap ».** La collision se lève de ce
  > côté-là et pas de l'autre : « carte » au sens SRS est le sens déjà tenu partout ailleurs
  > (« 8 cartes à revoir », « 5 cartes » sur une échéance, « Refaire un tour (3 cartes) ») et il
  > vient du modèle lui-même (`Card`, module `memory`). Rebaptiser la révision aurait déplacé le
  > problème et cassé un vocabulaire que Massimo a déjà appris. Le **geste** reste (« Reconstruire »
  > — c'est bien de mémoire qu'il la refait) ; seule la **chose** est renommée, du nom que la barre
  > latérale lui montre tous les jours.
  >
  > Le verrou du §3 bis ne regardait que la bande de catalogue et n'aurait jamais vu la collision
  > revenir par les quatre autres surfaces. Un second, posé sur la **table** elle-même, s'y ajoute :
  > `apps/frontend-massimo/src/lib/notionActionUi.test.ts`.
  >
  > Une chaîne identique dormait dans une **seconde** table (`MissionsPage.STEP_META`), dans un
  > champ `action` que **rien ne rendait**. Champ supprimé plutôt que renommé — les deux tables
  > restent distinctes, elles habillent deux choses différentes.

- **La barre d'onglets défilait horizontalement sous 500 px.** Mesuré à 390 px : elle se coupait
  après « Fiches », et **rien ne signalait qu'on pouvait faire défiler** — trois surfaces sur sept
  devenaient introuvables sur le poste le plus contraint de Massimo. C'est la version aggravée du
  défaut ci-dessus. → **`flex-wrap`**, jamais de défilement ni de menu déroulant. Vérifié dans le
  DOM : 7 onglets, **0 hors cadre**, 2 lignes, aucun débordement de page.
- Deux **cibles de touche sous 44 px** relevées au passage (« ← Matières » à 20 px, « Tout voir »
  à 16 px), alors que la spec de page l'exige. Corrigées ; plus aucune ne subsiste.

### 4. « Mes thèmes » se bâtit sur les chapitres — parce que les thèmes n'existent pas

Les maquettes montrent six cartes courtes par matière (`Vocabulary`, `Grammar`, `Reading`…).
**Read-before-code** : la table `themes` contient **une ligne en tout**, et **zéro chapitre sur 79**
porte un `theme_id`.

Ce que les maquettes appellent « thèmes » sont des **domaines de compétence**, qui n'existent
nulle part dans le modèle. Ce qui existe, ce sont les **chapitres** — 8 à 13 par matière, aux
titres longs (`Le prétérit et les temps du passé`, et non `Grammar`).

Le bloc est donc bâti sur les chapitres réels et **s'appelle « Mes chapitres »**. On ne nomme pas
« thème » ce qui est un chapitre : le vocabulaire de l'écran doit être celui du modèle, sinon la
prochaine lecture de cet ADR croira que les thèmes ont été livrés.

**Corollaire, à ne pas retenter** : les maquettes affichent « XP 120 / 200 » **par thème**.
`xp_events` ne porte ni `theme_id`, ni `chapter_id`, ni `skill_id` — il s'arrête à la matière.
**Ce chiffre n'est pas rendu, et remplir `themes` ne suffirait pas** à le rendre calculable.

### 5. L'index de notions ne disparaît pas — il passe sous un onglet

Aucune des huit maquettes ne reprend l'arbre chapitres → notions, la panoplie de sept pastilles,
ni **« Demander à ZETIS tout ce qui manque »**.

Ce dernier est le **seul geste que Massimo peut poser face à un contenu absent** (addendum
ADR-0027). Le retirer le laisserait devant un manque sans recours. L'ensemble est **déplacé sans
réécriture** sous l'onglet **Chapitres** — les tests de la page suivent le composant et **ne
doivent pas être adaptés pour passer**.

**Ce qui a été fait, exactement** : le fichier comptait **44 tests**. Seul le helper de rendu a
changé d'adresse (`?onglet=chapitres`), **aucune assertion des 43 autres n'a été touchée**. Le
44ᵉ — « n'affiche ni niveau, ni XP, ni pourcentage, ni barre de progression » — est **révoqué à
moitié** par le §1 et remplacé par **trois** tests : l'interdit de pourcentage sur chacune des
deux vues, et un test qui exige XP et niveau. Le fichier en compte donc **46**.

### 6. Le rail droit — trois formulations des maquettes refusées telles quelles

Elles ne sont pas des détails de rédaction : chacune heurte une règle écrite de `CLAUDE.md` sur
l'interface enfant.

- **« Atteins le niveau 15 avant les vacances d'hiver ! »** — `CLAUDE.md` interdit l'**objectif
  imposé** (« un objectif subi se fuit, un objectif qu'on s'est donné se tient »). La carte reste,
  la **voix change** : elle affiche l'engagement que Massimo s'est **donné** (`goal_days`, module
  `motivation`). Rien à l'impératif.
- **« Quiz : School vocabulary — 5 questions à revoir »** — c'est l'**arriéré**. La page sert
  `session_size`, ce que la session donnera vraiment, **jamais `due_count`** : un compteur
  d'arriéré est la pression quotidienne interdite. Le bloc « À ne pas oublier » n'affiche que des
  échéances **réelles de l'agenda** (source exogène, cahier de texte).
- **« Risque DNB : élevé » · « Lacunes 5e : importantes » · « Points critiques »** (grille) —
  `CLAUDE.md` : « Massimo ne doit pas voir : les analyses parentales détaillées ; les diagnostics
  formulés de manière négative ». Ces données existent, dans
  `GET /api/progress/subjects/{id}/analysis` — une **route Papa**. Le diagnostic est **reformulé
  au positif** (« Points solides » / « À renforcer ») ; classer huit matières par risque serait de
  surcroît le classement que le §5 interdit.

  **Livré (chantier B), et plus loin que « reformuler ».** Read-before-code : la donnée du
  wireframe (`to_reinforce`, lacunes, risque) vit derrière `require_parent` — il n'existe **aucun
  équivalent côté enfant**, et en construire un reviendrait à créer un **classement des matières
  par faiblesse**, exactement ce que le §5 interdit. La grille dit donc **ce que Massimo tient**
  (`mastered`, un compte) et **rien de symétrique**. Ce qu'il y a à travailler a déjà une surface
  enfant, et elle est du bon côté : les **missions** — un geste, pas un verdict. Un test-verrou
  interdit tout champ de verdict (`weak`, `fragile`, `to_reinforce`, `gaps`, `risk`…) dans la
  charge utile.

  ⚠️ **Écart assumé avec l'arbitrage du user**, qui avait choisi « reformuler au positif » en
  gardant « Points solides / À renforcer ». Le read-before-code a montré après coup que la
  seconde moitié n'était pas constructible sans enfreindre le §5. La première moitié est livrée.

**Livré — et à coût nul côté serveur.** Read-before-code : tout existait.
`AgendaUpcomingItem` porte déjà **`subject.slug`**, donc le filtre par matière est **client**
sur une liste déjà bornée serveur — aucune route ajoutée. `UpcomingCard` et `WeekDots` sont
réutilisés tels quels ; `UpcomingCard` gagne seulement un `hideSubject` **additif** (défaut
`false` : l'agenda global ne bouge pas d'un pixel), parce que répéter « Mathématiques » sur la
page de Mathématiques ne dit rien et mange la largeur du rail — vu à l'écran.

Le contrat confirme la distinction du §6 à la source : `AgendaUpcomingItem.days_left` est
documenté comme un « décompte **SUBI** […] **jamais fabriqué** ». C'est exactement ce qui sépare
une échéance légitime (le professeur l'a posée) d'une pression inventée par ZETIS.

Trois cartes, trois états vides assumés : **pas d'objectif → une invitation, jamais un reproche** ;
**aucune échéance → aucune carte** (un « à ne pas oublier » vide installerait l'idée qu'il devrait
toujours y avoir quelque chose) ; **`week` non chargée → aucune carte**.

Sept test-verrous, dont deux **vérifiés par sabotage** : passer l'objectif à l'impératif, et
retirer le filtre par matière, les font rougir.

## Conséquences

**Backend — deux ajouts, aucune migration.**

- `galaxy/service.py` : bloc `subject_xp {total, level, into_level, for_next}` dans la panoplie,
  via un `SUM(xp_events.amount)` filtré `subject_id` passé dans `_level_from_xp`. Une requête SQL
  de plus (14 → 15) ; l'en-tête reste à **deux appels**.
- `gamification/router.py` : paramètre optionnel `subject` sur `/history`.
  🔴 **Le contrat de série creuse est conservé** — les jours sans gain restent **omis**, jamais à
  zéro (addendum « Accueil vivant » §A). La courbe se trace en **cumul**, qui ne redescend jamais ;
  une courbe journalière dense rejouerait exactement le cadrage de perte que ce contrat empêche.

**Coûts assumés.**

- Une lecture d'ADR révisée en dix jours. Elle est écrite ici pour ne pas se rejouer à l'envers
  dans six mois.
- Le XP par matière arrive sur `/matieres` sans garde technique : rien n'**empêche** un futur tri
  par XP, seule cette page d'ADR l'interdit. Un test-verrou sur l'ordre des matières est dû au
  chantier B.
- La page devient plus longue et plus chargée qu'un index. C'est le but ; ce n'est plus le même
  objet.

### 7. « Reprendre » — livré, mais seulement pour ce qui se rouvre vraiment

Le doc de page refusait cette carte depuis le 2026-08-01 : *« aucune route ne sert cette donnée,
et l'inventer aurait menti »*. **Les deux réserves sont levées**, et l'une d'elles a démenti le
plan de chantier :

- ⚠️ le plan disait de filtrer `NON_ACTIVITY_EVENTS`. **C'est le mauvais filtre**, et c'est le bug
  déjà consigné dans `activity/events.py` (« se connecter suffisait à suspendre la production »).
  Le bon est `NON_WORK_EVENTS` — mais la question ne se pose plus : on part d'une **liste positive**
  de types, pas d'une exclusion ;
- les payloads réels **portent bien de quoi rouvrir** : `lesson_viewed → {lesson_id}`,
  `quiz_attempted → {quiz_id}`.

🔴 **Mais pas pour tous les types, et c'est la décision.** `fiche` n'a **aucun lien profond**
(`/fiches/:slug` ouvre le deck) et `revision` **LANCE une nouvelle session** — elle ne reprend
rien. Nommer un contenu précis pour atterrir sur une liste serait la dette « le libellé
sur-promet » déjà consignée sur `capsule_id`, et le bouton mort que l'ADR-0050 a fait retirer.
**Seuls `cours` et `quiz` sont servis.** Mieux vaut deux cartes vraies que quatre approximatives.

- **Le cours ouvre SA leçon** : `?lesson=<id>`, le lien profond de l'addendum ADR-0025 §15 ajouté
  pour l'agenda, réutilisé tel quel — il déplie le chapitre et met la leçon en avant. Vérifié à
  l'écran.
- **Le titre est résolu SERVEUR**, jamais lu depuis le journal : le payload fige le titre à
  l'instant du clic, donc il est périmé dès que Papa renomme.
- **Un contenu dévalidé ou archivé depuis n'est pas proposé.** Le gate de visibilité n'est pas
  réécrit : il vient de `_visible_notions`, le prédicat unique.
- ⚠️ **Aucune date, aucune durée, aucun compte.** Le serveur sert un `at` qui n'est pas rendu :
  « il y a 6 jours » ferait de la carte un rappel de ce que Massimo **n'a pas** fait. Frontière
  avec `activity`, dont la doctrine est inverse (« un enfant chronométré travaille pour le
  chronomètre ») : c'est un **signet**, pas une mesure.

Route : `GET /api/student/subjects/{slug}/resume`. Aucune migration.

> 🔴 **Un sabotage a démasqué un défaut de conception, pas seulement un test faible.** La première
> version faisait `kind = "cours" if event_type == "lesson_viewed" else "quiz"` : ajouter
> `fiche_viewed` à la liste l'étiquetait en **quiz**, et il n'était écarté que **par accident**
> (son payload n'a pas de `quiz_id`). Le test-verrou restait vert. Corrigé par une **table
> explicite** `event_type → (kind, clé de payload)`, sans aucune branche par défaut — le même
> sabotage rougit désormais.

**Hors périmètre.** Le remplissage de `themes` ; le sélecteur de classe des maquettes, **déclaré
faux par le user** ; la refonte de la barre latérale que les maquettes suggèrent ; le nettoyage de
`data/mock.ts`, devenu largement mort.
