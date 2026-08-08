# ADR-0044 — La page Diagnostic de Massimo propose au lieu de lister

## Statut

**Accepté — 2026-08-08.** Les neuf décisions sont **gelées**, y compris la **Décision 5**, qui
sort du périmètre annoncé du chantier et a été soumise comme telle au commanditaire.

> Historique : Proposé — 2026-08-08, **le même jour**. Le chantier a été cadré par la **maquette**
> puis la **spec** avant l'ADR (rituel `mockup → spec → ADR → prompt`), et l'élargissement de
> périmètre de la Décision 5 a été soumis **avant** toute écriture de code — c'est ce qui autorise
> l'acceptation sans délai.

⚠️ **Accepté ≠ livré.** La décision est figée ; **rien n'est implémenté**. Le chantier est décrit
par `prompts/claude-code/prompts-claude-code-adr-0044.md`, en trois sessions, et n'a pas démarré.
Ne pas lire ce statut comme « c'est en place ».

> **Annote l'`adr-0030`** (voir Décision 7) : la conclusion « Diagnostic sans témoin » est
> **maintenue**, mais les deux motifs écrits qui la portaient sont devenus faux et sont corrigés.
> Aucun addendum séparé — une décision unique, dans le chantier qui la découvre.
>
> S'appuie sur : `adr-0043` (Décision 4 : l'ordre par ancienneté de mesure, dont cette page est
> la remontée d'un cran ; et le gate de relecture, intact), `adr-0030` (règle « NOUVEAU jamais
> DÛ » et éligibilité au témoin), `adr-0017 §3` (la frontière de schémas élève/pilote),
> `adr-0028 §9` (aucune note globale).
>
> Maquette : `docs/frontend-massimo/mockup/mockup-page-diagnostic-massimo.html`.
> Spec : `docs/frontend-massimo/page-diagnostic.md`.

## Contexte

La relecture visuelle humaine du 2026-08-08 — la première depuis quatre merges — a sorti cinq
défauts en quelques minutes. Le cinquième : *« la page Diagnostic de Massimo est une liste
infinie de diagnostics sans savoir ce qu'il doit faire ou pas »*. Le commanditaire a décidé le
jour même qu'il passait **avant** les optimisations de la page Papa.

Le constat est mesurable dans le code, pas seulement ressenti :

- `list_diagnostics` rend **tous** les diagnostics relus depuis toujours,
  `order_by(Quiz.id.desc())`, **sans limite** — 15 en base de dev, et ça ne fera que croître ;
- `taken` est servi et **ne structure rien** : il n'écrit que « Refaire ↻ » ou « Commencer → » ;
- aucun tri par pertinence, aucune séparation, aucun « celui-ci d'abord ».

⚠️ L'`adr-0043` a **aggravé le contraste** sans toucher cette page (hors périmètre explicite) :
Papa a désormais un rail à trois crans groupé par mois avec un panneau qui explique, pendant que
Massimo garde une liste plate. C'est l'espace enfant qui a été servi en dernier.

## Constat read-before-code

### 1. La spec de la page était une fiction, et personne ne pouvait le voir

`docs/frontend-massimo/page-diagnostic.md` (v1, 63 lignes) décrivait un écran qui **n'a jamais
existé** — trois choix « Toutes les matières / Une matière / Rapide 10 min » — et listait
**quatre routes API qui n'existent pas** (`POST /diagnostics/start`,
`POST /quiz-attempts/{id}/answers`, `GET /diagnostics/{id}`, `GET /diagnostics/{id}/results`).
Les vraies sont `/api/diagnostics/quizzes`, `/quizzes/{id}`, `/quizzes/{id}/submit`.

Cette spec n'a donc **jamais servi de contrat**. Ce n'est pas une négligence isolée : **rien dans
le dépôt ne compare une spec à son implémentation**, donc une spec fausse ne rougit nulle part.
C'est le même angle mort que celui par lequel l'`adr-0014` avait régularisé le diagnostic
« administrativement » sans vérifier que sa justification s'y appliquait.

### 2. 🔴 Massimo ne peut pas relire son propre résultat

`GET /api/diagnostics/results` et `GET /api/diagnostics/results/{attempt_id}` sont
**`require_parent`** (`diagnostics/router.py`). Le résultat est montré à Massimo **une seule
fois**, à la soumission, puis devient définitivement inaccessible — Papa seul peut le rouvrir.

Le service, lui, est déjà correct : `result_detail` refuse `404` une passation qui n'appartient
pas à l'élève. **Ce n'est donc pas un trou de sécurité, c'est une absence de surface.**

### 3. 🔴 Le résultat servi à l'enfant porte déjà des données de pilotage

`DiagnosticResultOut` — la réponse de `POST /submit`, servie à **Massimo** — contient
`score_percent` **et** `gaps: list[GapOut]`, où `GapOut.severity` vaut `medium|high`.

Le front n'affiche pas la sévérité, mais elle est **servie**. Et il affiche bien, lui, le score
brut : *« Score global : 63 % »* (`DiagnosticPage.tsx`) — en contradiction directe avec sa propre
spec v1, qui prescrivait déjà *« pas d'affichage de note brute immédiate »*, et avec
l'`adr-0028 §9`. La contradiction a **onze mois** et n'a jamais rougi : aucun test ne l'exprime.

⚠️ **Le schéma Papa dit lui-même sa frontière** : `DiagnosticResultSummary` porte le docstring
*« Vue Papa »*. Élargir cette route au rôle enfant servirait à Massimo un objet explicitement
conçu pour l'analyse parentale.

### 4. Tout ce dont la refonte a besoin existe en base

`Subject.slug`, `SkillMastery.last_seen_at` (déjà lu par `notions_a_mesurer`),
`QuizAttempt.completed_at`, `QuizQuestion.skill_id`. **Aucune migration n'est nécessaire** —
c'est le contrat de sortie qui est trop pauvre, pas le modèle.

### 5. Deux motifs écrits dans `navigation.ts` sont devenus faux

Le commentaire de `NavItem.newsKey` justifie l'absence de témoin ainsi : *« Cours, Diagnostic, Ma
Galaxie, Chat et Paramètres n'ont ni trace de vue ni contenu entrant. »* Depuis le gate de
l'`adr-0043`, **il y a un contenu entrant pour Diagnostic** : Papa valide, et le diagnostic
apparaît chez Massimo. C'est exactement le motif de l'Agenda, qui a droit à son témoin.

Et le test voisin justifie l'absence sur Quiz par *« la table `quizzes` n'a pas de
`validation_status` »* — **elle en a un depuis la migration `a9b0c1d2e3f4`**. Le test passe
toujours ; sa raison écrite ne tient plus.

🔴 **Un test-verrou dont le motif est faux ne verrouille plus rien.** Celui-ci existe
explicitement *« pour qu'une prochaine session ne complète pas la liste par symétrie apparente »* —
c'est-à-dire précisément ce que la fausseté de son motif rend possible.

### 6. L'icône de la page diverge de sa propre entrée de menu

`MASSIMO_NAV` donne `🧭` à `/diagnostic`. La page n'affiche aucune icône, et la maquette en avait
choisi une troisième (`🩺`). Détail, mais c'est ainsi que naissent les identités doubles.

## Alternatives considérées

### (a) Trier par « la matière où il est le plus faible » — écartée

C'est le tri qui paraît le plus utile, et il est **interdit** : `CLAUDE.md` exclut de montrer à
Massimo un diagnostic formulé négativement, et un ordre de liste **est** une formulation. Une
page qui range les matières de la plus faible à la plus forte dit à un enfant où il est mauvais,
sans avoir à l'écrire. Le tri retenu (Décision 2) ne regarde **jamais** le résultat d'une mesure.

### (b) Élargir `GET /results/{attempt_id}` au rôle enfant — écartée

Une ligne à changer, et le bouton « Ce que ZETIS a retenu » fonctionne. Mais l'objet servi est
`DiagnosticResultSummary`, dont le docstring dit *« Vue Papa »* : score global, sévérité des
lacunes, statut `open|in_progress|resolved|ignored`. C'est la **frontière de schémas** de
l'`adr-0017 §3`, où le dépôt a déjà tranché que deux publics valent deux schémas, pas un schéma
et de la discipline d'affichage.

### (c) Plafonner la liste (les N derniers) — écartée

Réponse courte au problème d'échelle, et **mensongère** : une coupe silencieuse fait croire à une
couverture complète. Le dépôt a déjà écrit cette règle ailleurs — si une surface borne ce qu'elle
montre, elle doit dire ce qu'elle laisse dehors. Ici, il n'y a pas à couper : **c'est la
hiérarchie qui règle l'échelle**, et la zone B replie 11 lignes en 6 sans rien retirer.

### (d) Créer une trace de vue pour donner un témoin de nouveauté à Diagnostic — écartée

Techniquement possible : une table sur le motif de `mindmap_views`, comme la même dette a déjà
été soldée. Écartée pour une raison de fond : **la refonte rend le témoin inutile.** La zone A
*est* le signal d'arrivée — un diagnostic qui vient d'être validé par Papa et jamais mesuré est,
par construction, celui que la page met en tête avec sa raison. Ajouter une pastille de menu
paierait une migration pour redire ce que la page dit déjà mieux.

### (e) Faire élire le diagnostic par le serveur, comme `GET /api/missions/today` — écartée

Le précédent existe et il est bon, mais son motif ne s'applique pas : les missions sont élues au
serveur parce qu'il y a un **scoring à ne pas exposer** (frontière `adr-0017 §3`). Ici, la règle
est trois lignes, dérivable des champs servis, et ne cache rien. Un endpoint d'élection
n'ajouterait qu'un aller-retour et une seconde source de vérité.

## Décision

### 1. La page propose UN diagnostic, avec sa raison — et la proposition se refuse

Une carte unique en tête, pas une liste. Elle porte la matière, le titre, les faits utiles pour
décider (`N questions`, `environ M min`), une ligne de rassurance **séparée des faits**, et
surtout **la raison en une phrase** :

- jamais mesuré → *« ZETIS ne t'a encore jamais posé de questions dans cette matière. C'est celle
  où il en apprendra le plus sur toi. »*
- mesuré il y a longtemps → *« La dernière mesure de ZETIS commence à dater. »*

**Sous le bouton, une sortie explicite : « Je préfère autre chose ↓ ».** Elle n'est pas
décorative : sans elle, « commence par là » est un objectif imposé, et `CLAUDE.md` pose qu'un
objectif subi se fuit quand un objectif qu'on s'est donné se tient.

### 2. Le tri porte sur l'âge de la mesure, jamais sur son résultat

**Jamais mesuré d'abord, puis mesuré il y a le plus longtemps.** Départage final : `quiz_id`
décroissant, sans quoi la tête de liste changerait d'un chargement à l'autre.

C'est la doctrine que `notions_a_mesurer` applique déjà **un cran plus bas**, à l'intérieur d'un
diagnostic (`adr-0043` Décision 4) : *« un diagnostic sert à réduire l'incertitude ; remesurer ce
qui vient de l'être n'en réduit aucune »*. Cette page la remonte au **choix du diagnostic**, où
elle manquait. Deux propriétés en découlent : le périmètre **tourne** tout seul sans tirage
aléatoire (donc deux passations restent comparables), et le tri est **montrable à un enfant**.

**Le tri se fait côté client**, dans un hook — voir l'alternative (e).

### 3. Le fait et le à-faire sont deux zones, pas deux libellés

- **Zone B** — les non-passés, **groupés par matière et repliés**. 11 diagnostics → 6 lignes.
- **Zone C** — « Déjà mesuré avec toi », séparé, ton positif, avec la date de passation.

C'est la correction littérale du défaut : aujourd'hui `taken` ne change qu'un mot dans une liste
plate. La séparation est **structurelle**, pas typographique.

### 4. Aucun plafond, aucune troncature

La liste n'est ni coupée ni paginée. Si un jour elle devait l'être, la surface devrait **dire ce
qu'elle laisse dehors**. Voir l'alternative (c).

### 5. Un seul payload de résultat en forme ENFANT, servi à la soumission ET à la relecture

C'est la décision centrale, et elle réunit deux questions que la spec posait séparément.

- **Une nouvelle route `require_child`** rend le résultat d'une passation de Massimo. Elle
  réutilise `result_detail`, dont le contrôle d'appartenance est déjà en place ; la route Papa
  **n'est pas élargie** (alternative (b)).
- **Cette route et `POST /submit` servent le MÊME schéma enfant** : forces, notions à renforcer,
  matière, date. **Sans `score_percent`, sans `severity`, sans `status` de lacune.**
- Donc `DiagnosticResultOut` **perd** `score_percent` et voit ses `gaps` réduits au nom de la
  notion, et l'écran de résultat cesse d'afficher « Score global : 63 % ».

**Motif de la réunion** : définir la route de relecture sans trancher la forme du résultat
reviendrait à créer une seconde surface enfant en espérant qu'elle soit mieux tenue que la
première. Les deux questions n'en sont qu'une — *que voit un enfant de sa propre mesure ?* — et
la réponse existe déjà, écrite dans sa spec depuis l'étape 14 : 2 ou 3 forces, 2 ou 3 prochaines
étapes, **pas de tableau anxiogène**.

⚠️ **C'est le seul point où cet ADR sort du périmètre annoncé** (l'entrée dans le diagnostic, pas
son déroulé). Il en sort parce que la zone C l'y force, pas par dérive.

### 6. Le contrat de liste gagne quatre champs, et aucune migration

Sur `GET /api/diagnostics/quizzes` :

- **`subject_slug`** — sans lui, le front hardcode les matières, ce que `CLAUDE.md` interdit ;
- **`measured_at: datetime | null`** — `max(SkillMastery.last_seen_at)` sur les notions du
  diagnostic. `null` = jamais mesuré. **Porte le tri, et lui seul** ;
- **`taken_at: datetime | null`** — `max(QuizAttempt.completed_at)`. **Remplace `taken`**, qui
  reste dérivable : deux sources pour un même fait est une divergence en attente ;
- **`last_attempt_id: int | null`** — la passation à rouvrir en zone C.

La **raison** affichée en zone A se calcule à partir de `measured_at` **seul**. C'est ce qui
garantit qu'aucun résultat de mesure ne peut fuir dans la formulation.

### 7. Diagnostic reste SANS témoin de nouveauté — et les deux motifs écrits sont corrigés

> 🔴 **RÉVOQUÉE le 2026-08-08, le jour même**, par
> `adr-0030-addendum-temoin-diagnostic.md` : décision du **commanditaire**, prise après que
> l'objection lui a été exposée et **réaffirmée**. Diagnostic reçoit un témoin **numérique** qui
> s'éteint **au passage** du diagnostic, donc par le travail — une **exception assumée** à la règle
> « NOUVEAU jamais DÛ », nommée et bornée dans l'addendum.
>
> **Ce qui suit reste vrai et n'est pas révoqué** : les deux motifs écrits dans `navigation.ts`
> étaient faux, et ils doivent être corrigés de toute façon — l'addendum le redemande, en exigeant
> qu'ils disent désormais l'**exception** plutôt qu'une absence.
>
> ⚠️ Ce qui reste également vrai : l'alternative (d) ci-dessus (« la refonte rend le témoin
> inutile ») garde son argument. Il a été **pesé et écarté**, pas invalidé.

**La conclusion ne change pas. Les raisons, si.**

- Le motif de Diagnostic devient : *il existe désormais un contenu entrant (Papa valide, le
  diagnostic apparaît), mais **aucune trace de vue** — `quiz_attempts` enregistre « passé », pas
  « vu ». L'`adr-0030` exige les deux.* S'y ajoute la raison de l'alternative (d) : **la zone A
  est déjà le signal d'arrivée.**
- Le motif de Quiz est **rebasé sur `quiz_type`, plus sur la table** : la table `quizzes` a bien
  un `validation_status` depuis `a9b0c1d2e3f4`, mais **seul le diagnostic est gaté** ; un quiz de
  mission ou de fin de cours vaut `validated` dès sa génération, donc il n'y a toujours aucun
  moment « ça arrive ». C'est le même geste que l'`adr-0043` a fait sur son test-verrou lexical.

Un compte de non-faits (« 3 diagnostics à passer ») reste **interdit** — règle « NOUVEAU jamais
DÛ » : il ne décroîtrait que par le travail et grossirait quand Massimo ne vient pas.

### 8. L'icône de `/diagnostic` est `🧭`, partout

Celle de `MASSIMO_NAV`. La maquette et la spec s'y alignent.

### 9. Ce qui ne change pas

- **Le gate de relecture de l'`adr-0043`** : intact, sur les trois routes élève.
- **Le moteur de diagnostic** : génération, sélection des notions, scoring, ouverture des `Gap`.
- **L'XP d'engagement** : `XP_DIAGNOSTIC` reste accordé pour **être venu**, indépendamment du
  score. Il ne doit jamais être présenté comme lié au résultat.

## Périmètre

**Dans** : la page `/diagnostic` de Massimo (zones A/B/C), le contrat de
`GET /api/diagnostics/quizzes`, la route élève de relecture d'une passation, la forme enfant du
résultat (submit + relecture), le motif du témoin dans `navigation.ts` et son test.

**Hors** :

- l'**écran de passation** (une question à la fois, barre de progression) — inchangé ;
- les **quatre optimisations de la page Diagnostic de Papa** (jauges non cliquables, cran
  « proposé » en cul-de-sac, « en attente · non passé » qui ne nomme personne) : chantier sœur,
  décidé **après** celui-ci ;
- la **création d'une trace de vue** et le témoin de sidebar (alternative (d)) ;
- les **14 défauts du module `diagnostics`** au `BACKLOG.md`, dont aucun n'est traité ici ;
- le **multi-enfant**.

## Conséquences

### Positives

- Massimo sait quoi faire en ouvrant la page, et **pourquoi** — la raison est écrite, pas déduite.
- La page tient à 15 diagnostics comme à 60 : la hiérarchie absorbe l'échelle sans rien cacher.
- Massimo peut **relire ce que ZETIS a retenu de lui**, ce qui n'a jamais été possible.
- Une contradiction de onze mois entre la spec et l'écran (le score brut) se referme.
- Deux motifs faux sortent de `navigation.ts` — le test-verrou redevient un verrou.
- Zéro migration.

### Négatives / coûts assumés

- **La Décision 5 touche un écran hors périmètre annoncé.** Assumé et argumenté, mais c'est un
  élargissement, et il doit être vu comme tel.
- **Retirer `score_percent` de la réponse enfant est une rupture de contrat** côté front
  (`DiagnosticPage.tsx`, `lib/diagnostic.ts`, `packages/types`). Le champ reste servi à Papa.
- **Le tri côté client** diverge du motif « élection serveur » des missions. Argumenté
  (alternative (e)), mais c'est une seconde manière de faire dans le dépôt.
- **`measured_at` est un agrégat par diagnostic** : deux diagnostics d'une même matière partageant
  des notions auront des dates proches, et l'ordre entre eux tiendra à peu. Acceptable — le
  départage par `quiz_id` le rend déterministe.
- **La raison affichée est binaire** (jamais / ça date). Elle ne dira pas *« parce que tu viens de
  finir ce chapitre »* : cela demanderait de lier diagnostic et progression, ce que rien ne porte.

## Le signal qui dirait qu'on s'est trompé

- **Massimo ouvre la page et va systématiquement en zone B** — la proposition ne vise pas juste.
  Alors revoir la **règle de tri**, jamais supprimer la proposition pour revenir à la liste plate.
- **La zone C ne se consulte jamais** — « Ce que ZETIS a retenu » n'intéresse pas. Alors se
  demander si le résultat enfant dit quelque chose d'utile, avant d'accuser le bouton.
- **La zone B ne se déplie jamais** — le repli est vécu comme un mur. Alors déplier par défaut la
  matière en tête, pas supprimer le groupement.
- **Massimo refait plusieurs fois le même diagnostic** au lieu d'en découvrir d'autres : le
  « Refaire ↻ » de la zone C serait devenu un refuge, et il faudrait regarder ce qu'il fuit.
- **Papa demande où est passé le pourcentage** dans l'écran de Massimo : la Décision 5 aurait
  retiré à l'enfant une information qu'il utilisait vraiment — vérifier avant de la rétablir, et
  la rétablir alors **côté Papa uniquement**.

## Suivi

- Prompt de chantier : `prompts/claude-code/prompts-claude-code-adr-0044.md` — **écrit**, trois
  sessions (contrat de liste → résultat en forme enfant → la page). Le prérequis de décision est
  levé : les sessions peuvent démarrer.
- ⚠️ **Relecture visuelle humaine obligatoire avant la PR.** Ce chantier naît d'une relecture
  humaine qui a trouvé cinq défauts qu'aucun test ne pouvait voir ; le livrer sans elle serait
  contredire son propre acte de naissance.
