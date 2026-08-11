# ADR-0051 — Papa peut lire un diagnostic avant de le laisser passer

## Statut

**Proposé — 2026-08-11.** Les **six décisions sont gelées** ; les sessions de
`prompts/claude-code/prompts-claude-code-adr-0051.md` peuvent démarrer après `/ouverture`.

> Cadré sur `main`, **sans une ligne de code**, après une `/ouverture` **arrêtée à son §2** :
> l'ADR n'existait pas, ni maquette, ni spec, ni prompt. Rituel `maquette → ADR → spec → prompt`
> (`docs/WORKFLOW.md` §2.1) — la maquette
> (`docs/frontend-papa/mockup/mockup-papa-lire-diagnostic-v1.html`) précède, parce qu'elle sert à
> décider du **grain de lecture**, et que ce grain a changé au vu des données.

> ⚠️ **Les quatre arbitrages ont été rendus par le commanditaire le 2026-08-11**, après exposé de
> leurs options et de leur coût. Ils deviennent les Décisions 1 à 4 et **ne se rediscutent pas** :
> une session de slice les **relit**.

🔴 **La relecture visuelle humaine est due AVANT le merge.** Sur les deux derniers chantiers,
**cinq décisions d'écran sont nées de l'œil du commanditaire et aucune d'un test** — la croix de
masquage de l'agenda, le lien de la lacune, le cours vide validable. La surface décrite ici est
exactement du même genre : elle ne casse rien quand elle se trompe, elle **laisse passer**.

## Contexte

Papa est conduit à trancher sur ce qu'il ne peut pas lire, et la boucle se referme sur du vide :

- `/diagnostics`, cran « chez toi · à relire » → action principale **« Ouvrir dans la file de
  relecture → »** vers `/relecture?kind=diagnostic` (`crans.ts:80`, `adr-0045` Décision 5) ;
- `/relecture`, ligne diagnostic → `reviewLink()` rend **`null`** (`pilotageLinks.ts:91`), avec un
  commentaire daté et assumé : *« La page `/diagnostics` ne sait pas encore ouvrir un diagnostic
  précis […] Papa tranche donc sans lire »*.

Les cinq autres familles de la file ont chacune leur page de pilotage, et le §8 de l'`adr-0039`
leur accorde *« un lien Voir vers le pilotage du type »*. La sixième n'en a pas — et sa page de
pilotage, `/diagnostics`, est justement celle qui l'a envoyé là.
`DiagnosticsPapaPage.tsx:54` le nomme en toutes lettres : *« Ouvrir UN diagnostic précis reste dû,
et c'est un chantier à part. »*

**Ce que ça coûte.** Un diagnostic n'est pas un contenu de confort : `submit` écrit
`SkillMastery` et ouvre des `Gap`. Une question juste posée sur la mauvaise notion **ouvre une
lacune fausse**, avec un signal fort, et cette lacune commande ensuite des missions et des cartes.
Le gate de l'`adr-0043` existe précisément pour interposer un humain — et il est traversé à
l'aveugle.

## Constat read-before-code

> Rendu le 2026-08-11, **avant** que la moindre décision soit écrite. Trois de ces cinq faits
> n'étaient écrits nulle part, et deux d'entre eux ont **changé la conception**.

### 1. La route de lecture des diagnostics est inutilisable pour relire — deux fois

`GET /api/diagnostics/quizzes/{id}` → `get_quiz_for_taking` (`diagnostics/service.py:416`) :

- elle résout par `_servable_quiz_or_404`, donc un diagnostic `pending` répond **404** ;
- sa docstring dit le reste : *« Questions servies à l'enfant : SANS la bonne réponse ni
  l'explication. »*

C'est correct — c'est la route de Massimo. Elle n'est pas à élargir.

### 2. 🔴 Une route Papa sert DÉJÀ exactement la bonne forme — et exclut le diagnostic

`GET /api/quizzes/{id}` → `get_quiz_papa` rend `prompt_markdown` · `choices_json` ·
`correct_answer_json` · `explanation_markdown` · `skill_id` · **`skill_name`** — soit les cinq
éléments de la Décision 3, `skill_name` compris. Elle est `require_parent` au niveau du routeur
(`quizzes/router.py:39`), et sa docstring dit : *« Vue Papa : questions AVEC clés et
explications. »*

Mais elle résout par **`_mission_quiz_or_404`** : `quiz_type != "mission"` ⇒ **404**. La forme
existe, le gate l'écarte. C'est le seul vrai choix technique du chantier (Décision 5).

### 3. 🔴 On peut déjà MODIFIER ce qu'on ne peut pas LIRE

`patch_question` et `retire_question` résolvent par **`_question_or_404`, sans aucun contrôle de
type de quiz**. `PATCH /api/quiz-questions/{id}` et `POST /api/quiz-questions/{id}/retire`
acceptent donc une question de diagnostic **aujourd'hui**, sous `require_parent`.

Aucune UI ne l'expose. Ce n'est pas une faille — c'est une **asymétrie inversée** : l'écriture est
ouverte, la lecture est fermée. Elle commande la Décision 4.

### 4. 🔴 Un diagnostic récent porte 40 questions, pas 8 — et ça change la forme

Relevé en base de dev le 2026-08-11 — **trois générations cohabitent**, et l'écran doit tenir les
trois :

| Questions | Diagnostics | Ids |
|---|---|---|
| **40** (8 notions × 5) | 3 | 55, 56, 57 |
| **16** (8 notions × 2) | 11 | 8, 9, 15, 17–20, 28–31 |
| **2** | 4 | 2, 3, 4, 5 |

Les 40 sont la conséquence directe de l'`adr-0043` Décision 3 (`QUESTIONS_PER_SKILL` passé de 2 à
5). **Aucun diagnostic n'a zéro question** : l'état vide de la Décision 3 est un chemin de code, pas
un état observé.

Le cadrage parlait de « ses 8 questions ». **Une liste plate de 40 questions est un mur, et un mur
se survole.** C'est ce chiffre qui fait du groupement par notion une décision de fond et non une
commodité de mise en page (Décision 3).

### 5. 🔴 La surface à construire n'a AUCUN décor en base de dev

**18 diagnostics en base, tous `validated`** — zéro `pending`, zéro `rejected`. Le cran
« chez toi · à relire » ne s'affiche donc **pour aucun**. Le constat n° 6 de l'`adr-0045` disait
déjà *« le cran "généré" n'existe pas en base de dev »* ; il est ici mesuré pour la famille
entière.

Sur les 304 questions de diagnostic : **0** sans notion, **0** sans explication, **0** retirée,
toutes `generated`. Les cas dégradés existent dans le code (`skill_id` est *nullable*, et
`get_quiz_for_taking` replie déjà sur `"Notion"`) et **jamais dans la base**.

### 6. Ce que la file sert déjà, et qui rend le lien gratuit

`review_queue/service.py` sert pour un diagnostic : `id` (= `quiz_id`), `subject_id`,
`subject_slug` — et `chapter_id` / `lesson_id` à **`NULL` par construction**, commentés comme tels.
Le lien de la Décision 1 **ne coûte aucun backend**, et la branche explicite de `reviewLink` reste
nécessaire : le cas générique exige un chapitre et une leçon.

`/diagnostics` lit déjà `?subject=` — en **amorçage, pas en synchronisation**
(`DiagnosticsPapaPage.tsx:48`).

## Alternatives considérées

### (a) Élargir `_mission_quiz_or_404` pour accepter le diagnostic — écartée

C'est le geste le plus court : une condition, et `GET /api/quizzes/{id}` sert le diagnostic.

Mais ce résolveur garde **six** routes du module `quizzes`, pas une : `regenerate`, `add_question`,
`delete_quiz` en dépendent. L'élargir ouvrirait **cinq gestes de production** pour satisfaire un
besoin de lecture, et le ferait **en silence** — aucune ligne de la page ne changerait, aucun test
ne rougirait. C'est le motif exact que le §8 de l'`adr-0039` refuse.

### (b) Une modale de lecture dans `/relecture` — écartée

Lire sans quitter la file, un clic de moins.

Mais l'`adr-0039` §8 fixe ce que la file porte : *« Valider, Rejeter et un lien "Voir" vers le
pilotage du type »*. Une famille qui affiche son contenu dans la file est une famille qui n'a plus
besoin du lien — et les cinq autres, elles, l'ont. On paierait une exception pour la sixième, et
`/diagnostics` resterait incapable d'ouvrir un diagnostic : le `null` de `pilotageLinks` ne
tomberait pas, il changerait de motif.

### (c) Une page dédiée `/diagnostics/:id` — écartée

Route propre et adressable. Mais les 24 pages du front Papa sont **toutes à plat**, avec
`?subject=` / `?focus=` comme convention unique de désignation d'objet (`pilotageLink`,
`journalLink`, `reviewLink`). Rompre le patron pour une famille coûte plus qu'il ne rapporte.

### (d) Réutiliser `QuizInspectModal` telle quelle — écartée, mais son `KeyView` est examiné

Elle est présentationnelle et sa logique passe par des callbacks : le tri des gestes serait
possible. Mais elle porte Éditer / Ajouter / Retirer / Régénérer / Supprimer, et son `KeyView`
couvre **sept formats** quand un diagnostic est `mcq` **et rien d'autre**
(`diagnostics/service.py:203`, en dur). L'extraire importerait six branches mortes pour un cas —
`CLAUDE.md` n° 7.

### (e) Servir la lecture depuis `apercu` — écartée

`GET /api/diagnostics/apercu` sert déjà le rail en un appel, et l'y greffer éviterait un endpoint.
Mais `apercu` est chargé **à chaque affichage de la page**, pour toutes les matières : y ajouter
les questions de chaque diagnostic non relu ferait payer 40 questions × N à un écran qui n'en
demande aucune. La lecture est un geste **à la demande** ; elle a sa route.

## Décision

### 1. On lit EN PLACE, sur `/diagnostics`

Le panneau du cran « chez toi · à relire » gagne le questionnaire. `reviewLink` rend enfin
`/diagnostics?subject=<subject_id>&focus=<quiz_id>` : c'est le *« lien Voir vers le pilotage du
type »* de l'`adr-0039` §8, appliqué à la sixième famille **comme aux cinq autres**, sans exception
de convention.

⚠️ **`focus` est un amorçage, pas une synchronisation.** Il sélectionne la ligne du rail à
l'ouverture ; l'URL ne le suit pas ensuite. Règle déjà écrite pour `?subject=`
(`DiagnosticsPapaPage.tsx:48`) et reprise telle quelle — synchroniser dans les deux sens ferait de
la barre d'adresse une seconde source de vérité et rendrait le retour arrière imprévisible.

⚠️ **Le mot `focus` est déjà pris dans le composant** par le filtre du bandeau (`adr-0045` D2,
état local). C'est le **paramètre d'URL** qui garde le nom — la convention du dépôt vaut plus
qu'un nom de variable — et **c'est l'état local du bandeau qui est renommé** (`filtre`). Un
paramètre `?passation=` inventé pour éviter la gêne aurait coûté une exception permanente pour
épargner un `git mv` de trois lignes.

#### 1 bis. 🔴 L'`adr-0045` Décision 5 est AMENDÉE — son action principale meurt ici

Le tableau de l'`adr-0045` D5 donne au cran « chez toi · à relire » l'action principale
**« Ouvrir dans la file de relecture → »** (`crans.ts:80`). Une fois qu'on lit et qu'on tranche
ici, elle renverrait Papa vers la page qui le renvoie ici : **un aller-retour qui ne montre rien.**

Elle est **remplacée** par la lecture en place. `actionPrincipale()` ne rend plus de lien pour le
cran `genere` — et la fonction, qui ne servait plus qu'un cas sur trois, disparaît avec lui.

> ⚠️ **Ce que cet amendement ne dit pas** : que l'action était une mauvaise idée. Elle était la
> seule sortie possible tant que la lecture n'existait nulle part. C'est sa **raison d'être** qui
> disparaît, pas sa justesse.
>
> 🔴 Et il est écrit ici **parce qu'un ADR qui périme un texte doit dire lequel** (règle appliquée
> à l'`adr-0043` §6). Le 2026-08-09, une phrase laissée vivante vingt-quatre heures après sa
> livraison a suffi à envoyer une session re-cadrer un chantier fait.

### 2. Lire et trancher au même endroit

Le panneau porte **« Laisser passer »** à côté de **« Refuser ce lot »**, déjà livré (`adr-0045`
D5). Motif : **on ne tranche pas ce qu'on n'a pas lu** — séparer la lecture du verdict
reconstruirait, d'un cran plus loin, le défaut exact que ce chantier referme.

`/relecture` **garde ses deux verdicts** : deux portes vers le même appel, pas deux vérités. Les
deux appellent `POST /api/diagnostics/quizzes/{id}/validate|reject`, qui existent, sont
`require_parent` et n'ont aucune précondition d'état. **Aucun endpoint de verdict n'est écrit.**

⚠️ **Après un verdict rendu depuis `/diagnostics`, la ligne change de cran sans rechargement**
(`génère` → `propose` pour « Laisser passer », sortie du rail pour « Refuser »). Patron optimiste
du dépôt (`reviewActions`, `DemandesPage::triageContent`) : recharger ferait sauter le rail sous le
curseur. En cas d'échec, la ligne est rétablie où elle était.

🔴 **Le questionnaire reste lisible après le verdict**, y compris sur un diagnostic passé — c'est
ce qui permet de comprendre un score. Ce qui disparaît, ce sont les **deux verdicts**, pas la
lecture.

### 3. Une question montre les CINQ, et les questions se groupent par NOTION

Énoncé · choix · **bonne réponse** · **explication** · **notion visée**.

**Pourquoi la notion.** C'est le vrai critère de qualité d'un diagnostic : une question
parfaitement juste, posée sur la mauvaise notion, écrit un `SkillMastery` faux et ouvre une `Gap`
fausse. C'est le seul défaut que la relecture peut attraper et qu'aucun test n'attrapera jamais.

**Pourquoi l'explication.** C'est le texte que Massimo lira **après** avoir répondu — la seule
partie du diagnostic qui lui enseigne quelque chose. La laisser passer sans l'avoir vue, ce serait
relire la moitié de ce qu'on valide. Elle est marquée à l'écran comme telle (*« ce que Massimo lira
après coup »*), pour qu'on sache **qui** la lit.

🔴 **La notion n'est PAS une étiquette par question : elle est l'en-tête du groupe.** Répétée cinq
fois de suite, elle devient du bruit qu'on cesse de lire. Portée par le groupe, elle **pose la
question à Papa** — *« ces cinq-là mesurent-elles bien celle-ci ? »*. L'erreur cherchée est un
**écart** entre un titre et cinq contenus, et un écart ne se voit que si les deux termes sont
présentés comme tels.

Les groupes sont **repliés à l'arrivée** : les huit noms de notions sont déjà un premier niveau de
relecture, gratuit et suffisant pour repérer un hors-sujet ou un doublon.

⚠️ **Rendu `mcq` direct**, pas d'extraction du `KeyView` (alternative (d)). Et la ligne d'en-tête de
`QuizInspectModal.tsx` — *« c'est le SEUL endroit où la clé et l'explication sont visibles »* —
devient fausse à la livraison : **elle se réécrit dans le même chantier.**

⚠️ **Une notion absente se rend `— notion non renseignée —`**, jamais `"Notion"`. Le cas n'existe
pas en base (constat n° 5) mais existe dans le code : un repli qui ressemble à un nom de notion
ferait passer un défaut de génération pour une notion.

### 4. Le rejet partiel est HORS PÉRIMÈTRE — et il est nommé, pas laissé flotter

Le verdict porte sur **le lot**, jamais sur une question. Cohérent avec *« relire n'est pas
produire »* (`adr-0039` §8) : retirer une question est un geste de production.

🔴 **Le constat n° 3 va au `BACKLOG.md`** : `PATCH /api/quiz-questions/{id}` et
`POST /api/quiz-questions/{id}/retire` acceptent déjà une question de diagnostic, sans contrôle de
type. La capacité existe et n'est pas exposée.

**Et on ne ferme pas la porte non plus.** Poser le contrôle manquant sur `_question_or_404`
modifierait le module `quizzes` hors du sujet annoncé, et fermerait peut-être la porte par laquelle
le rejet partiel entrera un jour. C'est un arbitrage à rendre à part, pas un « tant qu'on y est ».

### 5. La lecture a sa route, côté `diagnostics`, sur le résolveur neutre qui existe déjà

**`GET /api/diagnostics/quizzes/{id}/relecture`**, `require_parent`, résolue par **`_quiz_or_404`**
— dont la docstring, écrite avant ce chantier, dit déjà : *« C'est le résolveur de PAPA : relire
suppose de pouvoir ouvrir ce qui n'est pas encore relu. »* Aucun troisième résolveur n'est écrit.

Elle réutilise la **forme** de `_papa_question_out` et le type `PapaQuizQuestion` de
`packages/types` — la forme, pas le gate du module voisin (alternative (a)).

Elle rend les questions **groupées par notion**, dans l'ordre de `sort_order`, et le compte total.
Le groupement est fait **serveur** : c'est lui qui connaît l'ordre, et deux clients ne doivent pas
en inventer deux.

⚠️ **Un endpoint neuf, et c'est assumé.** L'invariant « zéro endpoint » était celui de l'`adr-0045`,
pas une loi du dépôt. Le précédent exact est `GET /api/diagnostics/apercu`, née de la même cause
(`adr-0043` §3) : *un gate ne se pose pas sans se demander qui perd la vue au passage.*

🔴 **Le gate de Massimo n'est pas touché.** `_servable_quiz_or_404` garde ses trois routes élève, et
répond toujours **404** — pas 403 — sur un diagnostic non relu.

### 6. Ce qui ne change pas

- **Aucune migration.** Le chantier lit un contenu qui existe déjà en base.
- **Aucun compteur d'avancement**, pas de « 3/8 relues », pas de barre (`adr-0039` §7).
- **Aucun compte de jours** sous quelque forme (`crans.ts`, `CLAUDE.md` §gamification).
- Le rail, ses trois crans, le bandeau et ses focus : intacts (`adr-0045` D1, D2, D6, D7).
- La file `/relecture` ne gagne **aucun geste** — seulement son lien « Voir ».
- Le vocabulaire des verdicts est celui qui est livré : *« Refuser ce lot »*, et son corps de
  dialogue qui ne désigne aucun manquement de Massimo.

## Périmètre

**Deux sessions.**

| Slice | Ce qu'elle touche |
|---|---|
| **A — backend** | `diagnostics/service.py` (lecture groupée) · `diagnostics/router.py` (la route) · `diagnostics/schemas.py` · `packages/types` |
| **B — Papa** | `PanneauSansMesure` et son questionnaire · les deux verdicts · `crans.ts` (l'amendement 1 bis) · `pilotageLinks.ts` (le lien) · `DiagnosticsPapaPage.tsx` (`?focus=`, renommage de l'état local) |

### Hors périmètre — explicite

- **Le rejet partiel** (Décision 4), et le contrôle de type manquant sur `_question_or_404`.
- **Toute modification du module `quizzes`** — y compris « pendant qu'on y est » sur
  `_mission_quiz_or_404`.
- **Le gate élève** (`_servable_quiz_or_404`) et les trois routes de Massimo.
- **Le lien inter-app « Voir la page de Massimo »**, différé par l'`adr-0045` D5 : il reste différé.
- **Le tri de `lessons_by_skill`**, partagé par cinq appelants (`BACKLOG.md`, 2026-08-11).
- **Les 50 leçons `validated` et vides** : décision distincte, au `BACKLOG.md`.
- **La refonte T0 / T_n du diagnostic** : en liste d'attente, non touchée.

## Conséquences

### Positives

- Le gate de l'`adr-0043` cesse d'être traversé à l'aveugle : c'est sa **raison d'être** qui est
  enfin servie, pas une commodité ajoutée.
- Le `null` de `pilotageLinks.ts` tombe, et avec lui la dernière famille de la file sans sortie de
  lecture. Les six familles se comportent enfin de la même façon.
- La lecture par notion donne à Papa le seul angle qui attrape l'erreur coûteuse — une question
  juste sur la mauvaise notion.
- `_quiz_or_404` trouve son second appelant, et sa docstring cesse d'annoncer un usage qui
  n'existait pas.

### Négatives / coûts assumés

- **Un endpoint de plus** sur un module qui en compte déjà douze.
- **Relire 40 questions prend du temps**, et rien dans l'écran ne le raccourcit — c'est voulu : un
  raccourci ici serait un « tout valider », que l'`adr-0039` §7 refuse. Le groupement replié est le
  seul allègement, et il n'omet rien.
- **Deux portes vers le même verdict** (`/diagnostics` et `/relecture`) : c'est un coût de
  cohérence à tenir dans les deux sens, pas une duplication de logique — les deux appellent le même
  client.
- 🔴 **La surface n'a aucun décor en base de dev** (constat n° 5). La slice devra en fabriquer un,
  et le **dire** — conclure « ça marche » sur un rail vide est le mode d'échec déjà payé deux fois
  dans ce dépôt.

## Le signal qui dirait qu'on s'est trompé

- **Papa laisse passer sans jamais déplier une notion.** Alors la lecture n'est qu'une formalité de
  plus, et c'est le *volume* qui est le problème, pas l'accès : la réponse serait de réduire ce
  qu'un diagnostic mesure, pas d'améliorer l'écran.
- **Papa refuse des lots pour une ou deux questions.** Alors la Décision 4 est trop étroite, et le
  rejet partiel devient nécessaire — le signal est lisible sans instrumentation : un
  `validation_status='rejected'` suivi d'une regénération de la même matière dans la journée.
- **Aucun diagnostic n'est jamais refusé.** Deux lectures opposées — soit la génération est bonne
  et le gate coûte plus qu'il ne rapporte, soit la relecture ne regarde pas. La première se
  vérifie en relisant un lot au hasard ; la seconde est la raison d'être de cet ADR.

## Suivi

- 🔴 **Relecture visuelle humaine AVANT le merge**, sur un décor fabriqué pour l'occasion.
- Vérifier, à la livraison, que la phrase *« c'est le SEUL endroit où la clé et l'explication sont
  visibles »* de `QuizInspectModal.tsx` a bien été réécrite (Décision 3).
- Vérifier que `actionPrincipale()` a disparu et qu'aucun test ne verrouille encore
  `/relecture?kind=diagnostic` comme action principale du cran `genere` (Décision 1 bis).
- `CHANGELOG.md` et `TROUBLESHOOTING.md` à la clôture, selon l'étape 4bis.
