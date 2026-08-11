# Page Massimo — Matière dédiée (coquille à onglets + index de notions)

> **Refonte du 2026-08-11** — *addendum ADR-0024 « la page matière porte l'effort de Massimo, et se
> range en onglets »*, cadré sur **9 wireframes** du user. La page devient une **coquille à
> onglets** : une vue d'ensemble, puis les surfaces qui existent déjà. **L'index de notions n'est
> pas supprimé — il devient l'onglet « Chapitres »**, sans réécriture (§4 à §7 ci-dessous restent
> valables tels quels ; côté tests, seul le helper de rendu change d'adresse — 43 assertions sur
> 44 sont intactes, la 44ᵉ est révoquée à moitié par l'encadré ci-dessous).
>
> Deux interdits de la version du 2026-08-01 sont **levés** : **le XP et le niveau par matière**.
> L'ADR-0024 §5 ne les nomme pas — il interdit « aucun score par matière, aucun pourcentage, aucun
> classement », et son motif est double : *ne pas noter Massimo*, *ne pas mettre ses matières en
> concurrence*. Un score de maîtrise dit ce que Massimo **vaut** et peut **descendre** ; le XP dit
> ce qu'il a **fait** et ne peut que monter. Et la mise en concurrence naît de la **juxtaposition**,
> or sur la page d'**une** matière il n'y a rien à côté de quoi se comparer. `CLAUDE.md` autorise
> d'ailleurs XP et niveaux explicitement. **Ce qui reste interdit ici** : pourcentage, barre de
> maîtrise, badge de maîtrise, « meilleure matière », `mastery_score`.
>
> **Réécriture complète du 2026-08-01.** La version précédente datait de la Phase 1 : un launcher au
> grain matière (en-tête « Niveau 5 · 320 XP », quatre tuiles, « Notions à renforcer »). Elle était
> **antérieure à la doctrine ADR-0024 §5** et la contredisait sur trois points. Rien n'en est repris
> sauf la route.
>
> Décisions de fond : **addendum ADR-0024 — page matière index de notions** (modèle partagé avec la
> constellation, route de disponibilité en lot, recherche locale, rétrolien dérivé, amendement
> ADR-0017) et **addendum ADR-0027 — demandes depuis une surface élève** (route enfant en écriture).
> Maquette de référence : `mockup/mockup-page-matiere-v1.html`.
> Style : glassmorphique / néon Massimo (`GlassPanel` / `NeonBackdrop`, tokens `zetis-*`).

## Objectif

Donner à Massimo **la surface de travail d'une matière** : voir ce qu'il y a fait, voir toutes ses
notions, chercher, et ouvrir n'importe quel outil ZETIS sur n'importe laquelle — en un tap, sans
repasser par sept decks séparés.

La page répond à quatre questions, dans cet ordre : *qu'est-ce que j'ai fait ici ?*, *où j'en
étais ?*, *où est la notion que je cherche ?*, *qu'est-ce que ZETIS sait faire de celle-là ?*

Route : `/subjects/:slug`.

## Structure d'ensemble (2026-08-11)

```txt
Matières › SVT                                          [ Voir en galaxie → ]
┌──────────────────────────────────────────────────────────────────────────┐
│ [picto]  SVT · Niveau 7                                                  │
│          ▓▓▓▓▓▓▓░░░  XP 660 / 700                                        │
├──────────────────────────────────────────────────────────────────────────┤
│ Vue d'ensemble │ Chapitres │ Cours │ Fiches │ Cartes │ Révisions │ Quiz   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Onglets** : ce sont des **liens vers les surfaces qui existent déjà**, construits sur la table
partagée `subjectRouteFor` — **aucune destination n'est inventée**. Le motif « pas un launcher
d'outils » (§ Ce qu'elle N'EST PAS) est **maintenu** et ne s'applique pas : ce qui rendait la page
de Phase 1 inerte, c'est que ses tuiles **ne menaient nulle part**.

> ⚠️ **Un onglet qui ne mène nulle part est la faute que cette page interdit** — même signalement
> qu'en 2026-08-01 sur la pastille `quiz`, cliquée en vain et lue comme une panne.

**Écartés des maquettes** : « Missions » et « Progression », faute de route par matière. Missions
reste global ; la progression garde le bouton « Voir en galaxie → ».

### Onglet « Vue d'ensemble »

- **Ma progression en SVT** — un anneau et **des comptes**, jamais un pourcentage : « 13 maîtrisées ·
  8 en construction · 4 à renforcer · 3 à découvrir », dans les cinq libellés d'enfant de
  `starStyle`. **Zéro requête** : les états sont déjà dans la panoplie chargée.
- **Évolution de tes XP** — courbe **en cumul** sur 30 jours.
  🔴 Le contrat de `/api/gamification/history` est **une série creuse** : les jours sans gain sont
  **omis**, jamais à zéro. **Ne jamais la densifier** — une courbe journalière redescendrait à
  chaque absence, et ce cadrage de perte est exactement ce que le contrat empêche.
- **Mes chapitres** — cartes des chapitres réels : nom, « N notions », « N prêtes », bouton.
  ⚠️ **Ce ne sont pas des « thèmes »**, et le mot est proscrit ici : la table `themes` est vide
  (1 ligne, **0 chapitre sur 79** rattaché). Nommer « thème » ce qui est un chapitre ferait croire
  à la prochaine lecture que les thèmes ont été livrés.
  ⚠️ **Pas de « XP n / 200 » par chapitre** : `xp_events` n'a ni `theme_id`, ni `chapter_id`, ni
  `skill_id` — il s'arrête à la matière. Ce chiffre des maquettes **n'est pas calculable**.
### Reprendre

Les derniers contenus que Massimo peut **rouvrir tels quels**, entre l'anneau et les chapitres :
c'est la reprise du fil, pas une exploration.

🔴 **`cours` et `quiz` UNIQUEMENT**, filtrés serveur — les deux seules surfaces adressables par
identifiant. `fiche` ouvre son deck, `revision` **lance** une nouvelle session : les afficher
ferait nommer un contenu précis pour atterrir ailleurs (dette « le libellé sur-promet », déjà
consignée sur `capsule_id`, et bouton mort de l'ADR-0050).

- Le cours ouvre **sa** leçon — `?lesson=<id>`, le lien profond de l'addendum ADR-0025 §15 : il
  déplie le chapitre et met la leçon en avant.
- Le **titre est résolu serveur**, jamais lu depuis le journal (qui fige le titre au clic, donc
  le périme dès que Papa renomme).
- Un contenu **dévalidé ou archivé depuis n'est pas proposé** — une carte qui nomme un contenu
  doit l'ouvrir.
- ⚠️ **Aucune date, aucune durée, aucun compte.** Le serveur sert un `at` qui n'est pas rendu :
  « il y a 6 jours » ferait de cette carte un rappel de ce que Massimo **n'a pas** fait.
- ⚠️ Rien à rouvrir → **aucune carte**.

Contrat : `GET /api/student/subjects/{slug}/resume`.

### Rail droit

Trois cartes, à droite sur `lg` et **sous le contenu** en dessous — jamais dans un tiroir : sur
téléphone, ce qui se replie ne se rouvre pas. **Zéro requête serveur ajoutée** (`subject.slug`
voyage déjà avec chaque échéance ; le filtre est client).

1. **« Ce que je me suis donné »** — l'engagement de la semaine (`goal_days`, module `motivation`).
   ⚠️ **Rien à l'impératif** : la maquette disait « *Atteins* le niveau 15 », `CLAUDE.md` interdit
   l'objectif imposé. Sans objectif → une invitation (« En choisir un »), jamais un reproche.
   ⚠️ **Le geste d'engagement ne se refait pas ici** — il vit sur l'Accueil (doctrine déjà écrite
   dans `MatieresPage`) ; on montre l'état, on ne redemande pas à chaque page.
   ⚠️ **Jamais « il t'en reste N »** : `MotivationWeek` n'a aucun champ `remaining`, et l'UI ne
   doit pas en fabriquer un par soustraction.
2. **« Ce qui arrive en <matière> »** — les échéances **réelles du cahier de texte**, filtrées sur
   la matière. 🔴 **Jamais `due_count`, jamais un arriéré** : `days_left` est un décompte **subi**
   (le contrôle existe, que ZETIS l'affiche ou non) — c'est ce qui la sépare de la pression
   quotidienne interdite. **Aucune échéance → aucune carte.**
   Réutilise `UpcomingCard` avec `hideSubject` (on est déjà dans la matière) et **sans**
   `onOpenPlan` : le plan de préparation vit sur l'Agenda, et un bouton mort se lit comme une panne.
3. **« Tu bloques ? »** — l'entrée du chat depuis la matière. La seule carte reprise sans
   reformulation : demander de l'aide est un geste positif.

### Onglet « Chapitres »

L'index de notions, **inchangé** : §2 (recherche), §4 (chapitres → notions), §5 (panneau de
notion), §6 (demander à ZETIS) ci-dessous. Ses composants ne sont pas réécrits.

## Ce qu'elle N'EST PAS

- **Pas un launcher d'outils.** Les sept surfaces par matière (`/fiches/:slug`, `/mindmaps/:slug`,
  `/subjects/:slug/cours`, `/revision?subject=`, …) existent déjà et gardent leurs entrées propres.
  Reproduire leurs tuiles ici en ferait un doublon appauvri — c'est ce qui rendait la page inerte.
- **Pas une page de progression.** ~~Aucun niveau, aucun XP,~~ **révisé le 2026-08-11** : niveau et
  XP de la matière sont désormais affichés (ils disent l'**effort**, pas la maîtrise — voir
  l'encadré de tête). Restent bannis : **aucun pourcentage, aucun classement de matières**. La
  progression fine, c'est la Galaxy.
- **Pas une seconde constellation.** Elle rend le **même modèle**, en liste — elle **est** le repli
  sans WebGL promis par `zetis-galaxy.md §11`. Contrainte dure : **aucun chunk 3D**, ni en import
  statique ni en `import()`.

## Structure

```txt
┌──────────────────────────────────────────────────────────┐
│ ← Matières                                    Z E T I S  │
├──────────────────────────────────────────────────────────┤
│ [picto]  SVT                        [ Voir en galaxie → ]│
│          3 chapitres · 9 notions                         │
├──────────────────────────────────────────────────────────┤
│ 🔍 Cherche une notion…            3 notions trouvées  esc│
├──────────────────────────────────────────────────────────┤
│ 📖 4 cours  🗒️ 3 fiches  🎬 1 capsule  🧠 2 cartes        │
│ 🗂️ 8 à revoir  🎯 2 quiz                                  │
├──────────────────────────────────────────────────────────┤
│ CHAPITRES                                                │
│ ▸ La cellule                       3 notions · 2 prêtes  │
│ ▸ Nutrition végétale               3 notions · 1 prête   │
│ ▸ Reproduction sexuée                         3 notions  │
└──────────────────────────────────────────────────────────┘

   … un chapitre déplié :

│ ▾ La cellule                       3 notions · 2 prêtes  │
│   ● Mitose            En construction   ▣▣□□▣□▣          │
│   ○ Membrane          On commence       ▣▣□□□□□          │
│   ● Noyau et ADN      Bien acquis       ▣▣▣▣▣▣▣          │
```

**Tous les chapitres sont repliés à l'ouverture** : la page présente la matière, pas le contenu
d'un chapitre choisi pour Massimo. Le troisième n'a rien de prêt — il n'a donc **pas** de témoin,
et **garde l'apparence des autres**.

### 1. En-tête matière

Pictogramme de marque (`subjectIconFor`, **jamais d'emoji** — `design-system.md §Pictogrammes`),
nom de la matière, et un décompte **du catalogue** : « 3 chapitres · 9 notions ».

**Depuis le 2026-08-11**, l'en-tête porte aussi le **niveau et le XP de la matière** — « SVT ·
Niveau 7 », barre + « XP 660 / 700 ». Le niveau se dérive du **barème existant** `_level_from_xp`
(`XP_PER_LEVEL = 100`) ; on n'en invente pas un second.

**Toujours interdits ici** : pourcentage, barre de **maîtrise**, badge de maîtrise, « meilleure
matière », `mastery_score`. Le décompte décrit ce qui existe ; le XP décrit ce que Massimo a
**fait** — ni l'un ni l'autre ne dit ce qu'il vaut.

> ⚠️ **Et sur la grille `/matieres`, le XP et le niveau ne doivent jamais ORDONNER ni DÉSIGNER** :
> ordre du programme, aucun tri par XP, aucune « meilleure matière ». C'est là que le §5 mord
> vraiment — la mise en concurrence naît de la juxtaposition, pas du nombre.

Un bouton fantôme **« Voir en galaxie → »** vers `/galaxy?subject=<slug>` : les deux rendus du même
modèle se pointent l'un l'autre.

### 2. Recherche

Champ au-dessus de l'arbre. **Locale, lexicale, client-side** sur l'index déjà chargé : aucune
requête, réponse à la frappe.

- Insensible à la casse **et aux accents** — Massimo tape « photosynthese », pas « photosynthèse »
  (`NFD` + suppression des diacritiques, même helper que la recherche de constellation).
- Les correspondances sont **surlignées** dans le nom de la notion.
- Un chapitre **s'ouvre** s'il contient une trouvaille, **se replie et disparaît** sinon.
- Compteur discret : « 3 notions trouvées ».
- `Échap` efface et restaure l'arbre dans son état par défaut.
- **Sans résultat** : « Rien avec ce mot-là en SVT. Essaie un autre mot, ou demande à ZETIS dans le
  chat. » Jamais un échec, et le renvoi est vrai — le chat *est* la recherche en langage naturel.

**Ce qui n'est pas fait ici** : la recherche sémantique. `resolve_skill` reste au chat seul
(addendum ADR-0024 §3).

### 3. Ce que ZETIS a pour cette matière

Une bande de pastilles sous la recherche : « 📖 4 cours · 🗒️ 3 fiches · 🎬 1 capsule · 🧠 2 cartes ·
🗂️ 8 à revoir · 🎯 2 quiz ». Chacune ouvre la surface **matière** de son type.

Avant elle, la page n'annonçait qu'un type sur six (les cartes à revoir) : tout le reste
n'existait que notion par notion, et il fallait déplier un chapitre puis taper sur une notion
pour découvrir qu'il y avait trois fiches dans la matière.

**Les nombres sont dérivés de la panoplie déjà chargée** — zéro requête supplémentaire.

> ⚠️ **Ils mesurent ce qui est OUVRABLE DEPUIS LES NOTIONS, pas le catalogue.** Les résolveurs
> serveur prennent `MAX(id)` groupé par leçon : la panoplie n'expose que la ressource la **plus
> récente** de chaque leçon. Une leçon portant 3 fiches validées compte donc **1** ici et **3**
> sur `/fiches`. Les deux nombres sont justes et ne répondent pas à la même question — **ne pas
> « corriger » l'écart**. Celui-ci est le bon pour cette page : il annonce exactement ce que
> Massimo trouvera en dépliant ses chapitres, juste en dessous.
>
> Corollaire : la déduplication par `Set` sur les identifiants est **obligatoire**. Plusieurs
> notions partagent la même leçon, donc le même cours et la même fiche ; compter les notions
> « fiche disponible » gonflerait le nombre. Un test le verrouille.

- **`revision` ne se dérive pas** : la panoplie ne porte ni id ni compte de cartes (juste un
  booléen par notion). Il vient du résumé de révision, en **plafond de session** — **jamais
  `due_count`**, qui est l'arriéré, donc la pression quotidienne interdite par `CLAUDE.md`.
- **`eli5` est absent, et ce n'est pas un oubli** : il ne stocke rien, il se génère à la volée.
  Ce n'est pas un produit du catalogue, c'est une capacité.
- **`capsule` affiche son compte sans être cliquable** : `/capsules` est une liste globale, il
  n'existe ni `/capsules/:slug` ni `/capsules/:id`. Y envoyer Massimo depuis sa page de matière
  serait une petite trahison — exactement ce que le rétrolien (§7) corrige ailleurs.

  > ⚠️ **Une pastille non ouvrable doit se DISTINGUER À L'ŒIL** — bordure pointillée, texte
  > atténué, `aria-label` qui le dit. Corrigé le 2026-08-01 après un signalement : `quiz` était
  > rendu comme une pastille normale, le clic ne faisait rien, et **ça s'est lu comme une
  > panne**. Le compte était pourtant juste. Une chose qui ressemble à un lien doit être un lien.

- **`quiz` est cliquable depuis le 2026-08-01.** `/quiz` gardait la matière en état interne ; un
  lien profond **`?subject=`** lui a été ajouté (patron de `/revision` et `/eli5`), et la page
  porte désormais le rétrolien. Le clic ouvre donc les quiz **de la matière**, pas la grille de
  toutes les matières.
- **Une entrée à zéro n'est pas rendue, et la bande entière disparaît si tout est à zéro.** Une
  matière vide n'affiche pas six zéros : ce serait dresser la liste de ce qui manque.
- **Les nombres ne bougent pas pendant une recherche** : la bande décrit la matière, pas les
  résultats.

**Hors périmètre** : la carte « Reprendre » (dernier contenu ouvert). Aucune route ne sert cette
donnée — `last_notion` est global, sans lien, sur une fenêtre de 30 jours. L'inventer aurait menti.

C'est du *pull* : Massimo est déjà entré dans la matière. Aucune notification, aucun décompte de
jours, aucun capital perdable.

### 4. Chapitres → notions

Accordéon par chapitre, **tous repliés à l'ouverture** (2026-08-01) : la page présente la
matière, pas le contenu d'un chapitre choisi pour Massimo. C'est lui qui décide où il entre.
La recherche, elle, ouvre d'office ce qu'elle trouve — rien ne reste caché quand on cherche.

**Témoin « déjà alimenté »** sur l'en-tête replié : « La cellule · 3 notions · **2 prêtes** »,
en cyan, où *prête* = la notion a **au moins une** activité faisable. C'est la question que
Massimo se pose avant d'ouvrir un chapitre : *y a-t-il quelque chose à faire là-dedans ?*

- C'est un **COMPTE**, comme les étoiles allumées de la Galaxy — jamais un ratio. « 2 sur 3 »
  serait un score, et l'ADR-0024 §5 n'en veut nulle part. Un test-verrou interdit tout
  dénominateur.
- Pendant une recherche, il décrit **ce qui est trouvé**, comme le compte de notions à côté :
  les deux nombres parlent du même ensemble, sinon ils se contredisent.
- **À zéro, aucun témoin n'est rendu et le chapitre garde l'apparence des autres** — ni grisé,
  ni relégué. L'absence de contenu est l'état du catalogue de Papa ; un chapitre entier atténué
  se lirait comme un reproche.

Chaque ligne de notion porte, de gauche à droite :

- **la pastille d'état** — 5 états, libellés d'enfant, **aucun rouge** : `À découvrir` ·
  `On commence` · `En construction` · `Bien acquis` · `Maîtrisé`. `mastery_score` n'est jamais
  affiché ni sérialisé ;
- **le nom** de la notion ;
- **la panoplie** : sept pastilles, une par activité, **pleine = disponible / creuse = bientôt**.

La panoplie est l'élément signature de la page : d'un regard, Massimo voit ce que ZETIS sait faire de
cette notion. Elle est **masquée sous 620 px** (le panneau la remplace).

Ordre pédagogique **stable** — comprendre → mémoriser → se tester :
`cours · eli5 · fiche · capsule · mindmap · revision · quiz`.

### 5. Panneau de notion

Le tap sur une ligne déplie les **sept activités** en boutons.

- Une activité disponible ouvre sa surface **en pleine page** (`navigate`, amendement ADR-0017 —
  jamais de modale ici).
- **L'accent va à la première activité réellement faisable**, pas à la première de la liste. Une
  action mise en avant doit pouvoir être faite.
- Une activité indisponible est **grisée, non cliquable, libellée « bientôt »** — **jamais**
  « manquant » ni « raté ». C'est l'état du catalogue de Papa, pas un échec de Massimo.

**Granularité, formulée sans mentir** : `quiz` et `revision` ne sont pas adressables par notion (hors
v1 ADR-0027, cibles `location.state`). Depuis la panoplie, ces deux-là ouvrent la surface **matière**
— le libellé le dit (« Réviser la matière »), il ne promet pas la notion.

**ELI5 est grisée si aucun cours validé n'existe** pour la notion (règle de l'orchestrateur : ELI5
dégrade vers le modèle sans cours et inventerait). Sa demande porte alors sur `cours`. ELI5 ouverte
depuis son propre deck reste inchangée.

### 6. Demander à ZETIS

Sur une pastille grisée, un bouton discret **« demander »**. En pied de panneau, **« Demander à
ZETIS tout ce qui manque (n) »** — un seul appel, `n` jamais nul (le bouton disparaît sinon).

> **Correction du 2026-08-01** : le libellé disait « demander à **Papa** ». L'interlocuteur de
> Massimo est **ZETIS** — le même que dans le chat, où il réclame déjà des contenus. Papa reste le
> **destinataire** (la demande atterrit dans sa file, `source: "subject_page"`), mais l'enfant
> s'adresse à l'app, pas à son père par-dessus l'épaule de l'app.

- Retour : **« C'est noté par ZETIS »**. Jamais « je te le prépare ». La formule dit qu'une
  demande est **enregistrée**, sans promettre qui la traitera ni quand — vrai que le contenu
  vienne de Papa ou, demain, de ZETIS lui-même.

> **Retrait du 2026-08-01 — divergence assumée avec l'addendum ADR-0027.** La phrase fixe
> « ZETIS transmet la demande. Il ne fabrique rien tout seul. » a été **supprimée**. L'addendum
> l'exigeait, et elle était le garde-fou du passage à « demander à ZETIS » (elle empêchait de
> lire « ZETIS va le faire »). Motif du retrait : **ZETIS produira bientôt du contenu
> lui-même**, et la phrase deviendrait un mensonge — on ne fige pas dans l'UI une limite qu'on
> s'apprête à lever. Ce qui reste interdit ne bouge pas, et un test le vérifie : jamais
> « je te le prépare », aucun statut, aucun délai, aucun rappel.
- **Couleur : orange électrique** (`--color-zetis-request`, `#ff7a1a`) — **avec son halo**
  (`--shadow-request`). Ce n'est **pas** une couleur d'alerte : demander est la seule chose que
  Massimo puisse faire face à un contenu absent, donc c'est un geste positif. (Aucun rouge,
  ADR-0024 §5.)

  ⚠️ **« Électrique » se dit par la LUEUR, pas par la teinte** — et c'est une contrainte, pas
  une préférence : l'or `#ffcf47` de « ZETIS parle » n'est qu'à **18° de teinte** et le rouge est
  banni, donc la teinte n'a aucune marge. L'axe libre est la luminosité, et c'est déjà la
  grammaire de l'app (`NeonBackdrop`, `starStyle.glow`, `NEON_TEXT`). Un futur ajustement doit
  rendre cet orange plus **lumineux**, jamais plus **vif**.

  Le bouton **rayonne tant que le geste reste à faire**, et **s'apaise une fois demandé** : une
  lueur sur une demande déjà transmise inviterait à la refaire. Deux tests le tiennent.
- **Aucun statut, aucun délai, aucun rappel.** Massimo ne lit pas la file de Papa.
- **Aucun XP, aucun événement.** Demander n'est pas apprendre ; la ligne de file est la trace.

Contrat : `POST /api/student/content-requests` (addendum ADR-0027).

### 7. Rétrolien

« ← Matières » sur cette page ; **« ← SVT »** sur toutes les surfaces filles de la matière.

Le lien est **dérivé du `:slug` présent dans l'URL**, via une brique partagée — **aucun
`location.state`, aucune pile de navigation maintenue**. Robuste au refresh, au partage d'URL et au
retour physique iPhone.

## Données API

- `GET /api/student/subjects/{slug}/panoply` — **nouvelle** (addendum ADR-0024 §2). Matière →
  chapitres validés → notions, chacune avec `status` et sa panoplie `[{kind, available, …ids}]`.
  Adossée au **prédicat de disponibilité extrait de `galaxy.notion_panel`** — un seul prédicat, deux
  consommateurs. 404 matière inconnue ou hors année active ; `chapters: []` si rien n'est validé.
  **14 requêtes SQL, constantes** de 3 à 100 notions.
- `GET /api/student/reviews/summary` — pour la pastille de révision de la bande. On y lit
  **`session_size`** de la matière (champ ajouté le 2026-08-01, calculé serveur là où vit
  `REVIEW_SESSION_MAX_SUBJECT`) — **jamais `due_count`**.
- `POST /api/student/content-requests` — **nouvelle** (addendum ADR-0027), `require_child`, écriture
  seule. Aucun `GET`, aucun `PATCH` élève.
- `GET /api/gamification/history?subject=<slug>` — **filtre ajouté le 2026-08-11** pour la courbe
  de la vue d'ensemble. 🔴 **Série creuse par contrat** : les jours sans gain sont omis, jamais à
  zéro. Tracer en **cumul**.

**Deux appels pour l'en-tête et l'index, et deux seulement.** Le bloc `subject_xp` voyage dans la
panoplie (une requête SQL de plus, 14 → 15) plutôt que dans un troisième appel. Les comptes de la
bande (§3) et ceux de l'anneau sont **dérivés** de la panoplie, pas d'appels supplémentaires — voir
la réserve sur `MAX(id)` au §3. La courbe XP, secondaire, paie son propre appel.

Aucune donnée pédagogique durable stockée côté front. Toute la logique vit dans un hook
(`useSubjectPanoply`) ; le composant ne calcule aucune règle métier.

## Règles UX (CLAUDE.md — interface enfant)

- Une action principale par écran ; vocabulaire d'enfant, jamais d'atelier (pas de statut de
  validation, pas de badge `IA`/`Manuel`, pas d'action d'édition).
- **Aucun rouge, aucun vocabulaire d'échec**, nulle part.
- **Aucun objectif à l'impératif.** `CLAUDE.md` interdit l'objectif imposé (« un objectif subi se
  fuit, un objectif qu'on s'est donné se tient »). Le rail affiche l'engagement que Massimo s'est
  **donné** (`goal_days`), jamais « Atteins le niveau 15 ».
- **Aucun arriéré.** Ni `due_count`, ni « n questions à revoir », ni décompte de retard, sous
  aucune forme. Les échéances affichées viennent de l'**agenda réel** (cahier de texte) ; ZETIS
  n'en fabrique pas.
- **Aucun diagnostic parental.** Ni « à renforcer » chiffré comme un verdict, ni « lacunes », ni
  « risque » — ces données vivent derrière `require_parent`, et `CLAUDE.md` les tient hors de
  l'écran de l'enfant.
- **L'or `#ffcf47` n'apparaît pas** : il est réservé à l'état « ZETIS parle » dans toute l'interface
  Massimo. La page n'a que **deux** couleurs porteuses de sens : le **cyan** du disponible, et
  l'**orange** `--color-zetis-request` de la demande.
- `prefers-reduced-motion` : accordéon et surlignage restent lisibles sans mouvement.
- Cibles de touche ≥ 44 px ; rien d'essentiel ne dépend du survol (il n'existe pas au tactile).
- `aria-label` sur chaque pastille d'état (« nom de la notion — libellé d'état ») et sur chaque
  pastille de panoplie (« La fiche — bientôt »).

## Hors périmètre

Session quiz ou révision **ciblée par notion** (cibles `location.state`, hors v1 ADR-0027) ;
recherche sémantique ; lecture de la file de demandes ; pictogramme animé (point ouvert n°1 de
l'addendum) ; réconciliation de `navigation.md`.
