# ADR-0048 — ZETIS doute de sa propre mesure

## Statut

**Accepté — 2026-08-09.** Les **onze** décisions sont **gelées**.

> 🔴 **La Décision 5 bis est née d'une erreur de ce cadrage, corrigée à sa propre clôture.** L'ADR
> excluait la voix sur une affirmation **fausse** — *« la dictée vit dans `Eli5Session.tsx`, pas dans
> une brique réutilisable »* — produite par une commande `grep` qui n'avait jamais tourné
> (`TROUBLESHOOTING.md` § *Cadrage de l'ADR-0048*). Le fait rétabli, le commanditaire a tranché
> l'inverse le jour même. **Cette décision est donc écrite ici, pas dans un addendum** : le patron de
> l'`adr-0044` — *une décision unique, dans le chantier qui la découvre*.

> Historique : cadré en **deux sessions le même jour**. La première a fait le read-before-code et
> pris quatre décisions du commanditaire ; elle s'est arrêtée faute de contexte, en consignant son
> état au `BACKLOG.md` (§ *CADRAGE ENTAMÉ le 2026-08-09*). La seconde a repris à
> **maquette → spec → ADR → prompt** sans rouvrir ces quatre décisions.
>
> Le rituel a été tenu dans l'ordre, **sans une ligne de code**.

🟡 **EN COURS DE LIVRAISON.** ~~« rien n'est implémenté »~~ — cette phrase est morte le 2026-08-09.
**La Session A sur 3 est livrée** (le backend qualifie une mesure : migration `e2f3a4b5c6d7`, module
`diagnostics/fiabilite.py`, contrat de `submit`, verdict servi à Papa, route de verbalisation).
**Les Sessions B et C restent**, et **aucun écran n'a encore été vu**. Le chantier est décrit par
`prompts/claude-code/prompts-claude-code-adr-0048.md`.
🔴 **Cette ligne devra mourir à son tour au merge** — c'est le geste que l'`adr-0044` a manqué
pendant vingt-quatre heures, assez pour envoyer une session re-cadrer un chantier livré.

> S'appuie sur : `adr-0043` (le diagnostic est une mesure qui **engage** — c'est de là que vient
> l'enjeu), `adr-0044 §5` et `§9` (le score brut a quitté l'écran de l'enfant ; l'XP est donné pour
> **être venu**), `adr-0045 §6` (règle de couleur : la couleur ne porte jamais l'information seule),
> `adr-0021` (rapport **figé**, motif repris à la Décision 4), `CLAUDE.md` §pédagogie (la
> verbalisation) et §gamification (aucune pression anxiogène).
>
> Maquettes : `docs/frontend-papa/mockup/mockup-papa-fiabilite-mesure-v1.html` ·
> `docs/frontend-massimo/mockup/mockup-diagnostic-resultat-verbalisation-v1.html`.
> Spec : **`docs/backend/fiabilite-de-la-mesure.md`** (source unique de la règle) ·
> surfaces marquées `[0048]` dans `docs/frontend-papa/page-diagnostic.md` et
> `docs/frontend-massimo/page-diagnostic.md`.

## Contexte

*« L'élève est en train de faire un diagnostic et cherche les réponses sur le web ou l'IA. Comment
s'en douter ? »*

**Pourquoi ça compte plus qu'ailleurs.** Le diagnostic est le seul endroit de ZETIS où une mesure
fausse **se propage** : `submit()` écrit `SkillMastery`, ouvre des `Gap`, et ces deux-là nourrissent
les missions, la galaxie et le Conseil de classe. Une triche ne fait donc pas « gagner » Massimo —
elle fait **construire ZETIS sur du faux**, et rien d'extérieur ne vient jamais la contredire.

C'est le motif que la station ③ défend déjà (*« ZETIS ne se commande pas de production sur sa propre
mesure »*), un cran plus tôt dans la chaîne.

### 🔴 Ce qu'il faut admettre avant de choisir quoi que ce soit

**Aucun signal côté navigateur ne survit à un téléphone posé à côté de l'écran.** Focus d'onglet,
temps, presse-papier — tout ça attrape la triche *sur le même appareil* et rien d'autre. Construire
un détecteur sans le dire produirait **un instrument qui rassure sans mesurer**, ce qui est pire que
pas d'instrument du tout.

Cet ADR est donc écrit pour un détecteur qui **connaît et affiche ses propres limites**.

## Constat read-before-code

Fait le 2026-08-09, dans le code.

### 1. 🔴 La durée d'une passation n'est pas mesurée — elle vaut zéro par construction

`submit()` pose `started_at = completed_at = now`, **le même instant**
(`diagnostics/service.py:483-490`). Et `QuizAttempt.duration_seconds` **existe** dans le modèle
(`assessment.py:88`)… et n'est **jamais écrit**, nulle part.

La piste « temps par question » ne raffine donc rien : **elle part de zéro.** Le backend n'a aucune
notion du temps, pas même la durée totale.

### 2. ✅ Les signaux par question ne coûtent aucune migration

`QuizAnswer.answer_json` est un JSON libre, déjà écrit à chaque réponse (`{"choice_index": chosen}`).
Horodatage relatif et drapeaux y logent sans toucher le schéma.

### 3. 🔴 Le vrai coût est côté FRONT

Le client envoie `{question_id, choice_index}[]` **une seule fois, en fin de parcours**
(`lib/diagnostic.ts:95`). Il ne mesure rien, n'observe rien. **Le backend ne peut rien inférer de ce
qu'on ne lui envoie pas** — tout ce chantier consiste d'abord à faire regarder le client.

### 4. ⚠️ Il manque un endroit pour le verdict

`QuizAttempt` n'a aucun champ pour « mesure à confirmer ». C'est la **seule** migration du chantier.

### 5. ✅ La propagation est bien immédiate et inconditionnelle

`_upsert_skill_mastery` + `_upsert_gap` + `award_xp`, puis **un seul** `db.commit()`. Et l'XP est
bien donné pour **être venu**, montant fixe.

### 6. 🔴 Le meilleur signal n'est pas dans le navigateur, et le `BACKLOG` ne l'avait pas vu

Le seul qui **survit au téléphone posé à côté** est le **contraste avec l'historique** : un score
élevé sur des notions jamais travaillées, jamais vues. ZETIS a déjà tout pour le calculer : **zéro
instrumentation**.

> 🔴 **CORRIGÉ au read-before-code de la Session A, 2026-08-09 — décision du commanditaire.**
> Ce constat nommait deux sources (`LearningEvent`, `SkillMastery`) et la spec n'en retenait
> **qu'une**, `LearningEvent`. **C'était faux, et assez faux pour que le chantier livre sa propre
> défaillance** : sur les **10** appels à `log_learning_event`, **3 seulement** passent un
> `skill_id`, et **le diagnostic n'en fait pas partie** (`diagnostics/router.py:101` journalise avec
> le `subject_id` seul). Une notion mesurée par trois diagnostics antérieurs aurait donc été comptée
> « jamais rencontrée », et le contraste se serait déclenché **sur ce que ZETIS a déjà mesuré** —
> le faux positif que la section « Le signal qui dirait qu'on s'est trompé » annonce plus bas.
>
> **La trace se lit désormais sur TROIS sources en union** : `SkillMastery` (a été **mesurée**) ·
> `LearningEvent` portant le `skill_id`, hors `NON_WORK_EVENTS` (a été **travaillée** sans être
> mesurée) · `LessonView ⋈ LessonSkill` (**le cours a été lu**). Détail et pièges :
> `docs/backend/fiabilite-de-la-mesure.md` §3.4 bis.
>
> ⚠️ **La 3ᵉ source est entrée sur arbitrage du commanditaire**, la question lui ayant été posée
> avec son coût (une jointure à deux sauts) : le `BACKLOG` d'origine disait *« jamais travaillée,
> jamais **vue** »*, et le mot « vue » ne se rend pas autrement.
>
> ⚠️ **Écrit ici plutôt que corrigé en silence** : c'est le patron du constat n° 7 de l'`adr-0045`.
> Une prémisse fausse retirée sans trace ne laisse personne se demander combien il y en a d'autres.

⚠️ Bruité dans l'autre sens : un enfant peut savoir une chose sans l'avoir travaillée **dans ZETIS**.

### 6 bis. 🔴 L'écran de passation n'est PAS celui que trois documents décrivent

> **Trouvé au read-before-code de la Session B, 2026-08-09.** Il casse deux des six signaux, et la
> prémisse fausse était partagée par l'`adr-0044`, cet ADR-ci et la spec.

`DiagnosticPage.tsx:227` rend **toutes les questions d'un bloc** : empilées dans une page qui
défile, boutons radio, un seul « Envoyer mes réponses » à la fin. **Ni question courante, ni barre
de progression** — `grep` sur `currentQuestion|questionIndex|step` ne rend rien.

Or l'`adr-0044:291` range en hors-périmètre *« l'**écran de passation** (une question à la fois,
barre de progression) »*. **Cet écran n'a jamais existé.** C'est exactement le défaut que la spec de
Massimo documente sur sa propre v1 — *« décrivait un écran qui n'a jamais existé »* — et il s'est
propagé ici sans que personne le revérifie.

| Signal | Sort |
|---|---|
| « question **quittée avant d'être répondue** » | 🔴 **inimplémentable** — elles sont toutes affichées, tout le temps |
| « temps entre l'**affichage** de la question et sa réponse » | 🔴 **inimplémentable** — toutes s'affichent à t=0 |
| « énoncé copié » | ⚠️ **survit**, au prix d'une localisation de la sélection dans le DOM |
| plein écran · resize · **contraste** · durée totale | ✅ intacts — ce sont des signaux de **passation** |

Voir la **Décision 1 bis**.

### 7. L'audit de « ce qu'il reste à gagner » ne trouve qu'une chose, et on n'y touche pas

| Récompense | Dépend du score ? |
|---|---|
| XP `XP_DIAGNOSTIC` | **non** — montant fixe, pour être venu |
| Badge « Diagnostic passé » 🧭 | **non** — `diag_done` suffit (`gamification/service.py:115`) |
| Score brut affiché à l'enfant | **déjà retiré** (`adr-0044 §5`) |
| Frise de la galaxie | **non** — monotone, première trace par notion |
| 🔴 **État des étoiles de la galaxie** | **OUI** — `_upsert_skill_mastery` écrit le statut, qui allume la notion |

Voir la Décision 9.

## Alternatives considérées

### (a) Suspendre la propagation jusqu'à une validation de Papa — écartée

C'est la réponse « propre » : une mesure douteuse n'écrit ni `SkillMastery` ni `Gap` tant que Papa
n'a pas tranché. Elle a été **posée au commanditaire et écartée par lui**, et elle est mauvaise pour
une raison de fond : **une mesure suspendue est une mesure qui n'existe pas les jours où Papa ne
regarde pas.** Elle créerait un état intermédiaire, un geste obligatoire, une file d'attente, et un
chemin de rattrapage à écrire — pour un doute qui, la plupart du temps, n'aura pas lieu d'être.

Elle transformerait aussi le doute en **conséquence** pour l'enfant : sa mesure ne compte pas tant
qu'un adulte n'a pas statué. Le §0 de la spec interdit exactement ça.

### (b) Un score de fiabilité de 0 à 100 — écartée

Séduisant, et faux. Il faudrait pondérer six signaux dont deux sont ouvertement bruités, sur **une
seule** passation, sans aucun historique pour calibrer les poids. Le nombre aurait l'air d'une mesure
et n'en serait pas — le défaut littéral dont l'`adr-0039` est né, reproduit dans l'outil censé
détecter les mesures fausses.

**Les faits bruts sont plus honnêtes qu'un score dérivé** : « l'écran a été quitté 3 fois » se vérifie, se
discute, et Papa en fait ce qu'il veut.

### (c) Bloquer la navigation pendant la passation — impossible, pas écartée

Demandée explicitement. **Elle n'existe pas côté web** : ni `Cmd+T`, ni `Cmd+Tab`, ni quitter le
navigateur, ni un second appareil. Ce n'est pas une limite de ZETIS — un site qui pourrait retenir
son utilisateur serait une **faille**.

Le plein écran entre donc comme **signal** (Décision 2), jamais comme empêchement.

⚠️ Le seul dispositif qui bloque vraiment est **hors du code** : l'**Accès guidé iOS**, un geste de
Papa avant la passation. Écrit ici pour qu'on ne le redécouvre pas dans six mois.

### (d) Les mouvements de souris — écartée

Bruit énorme, **absents sur tablette et iPhone** — les deux appareils de Massimo — et c'est de la
surveillance comportementale, ce qui heurte de front la Décision 8.

### (e) Un chrono visible, ou un temps limité par question — écartée

Deux fois interdite. C'est de la **pression anxiogène** (`CLAUDE.md` §gamification), et surtout **ça
change la mesure elle-même** : un enfant qui se sait chronométré ne passe plus le même diagnostic.
On abîmerait l'instrument pour le protéger.

### (f) N'afficher la verbalisation que quand ZETIS doute — écartée, et c'est la plus tentante

Elle économiserait une question les vingt fois où il n'y a rien à vérifier. Elle est **fatale** :
deux ou trois passations suffisent à un enfant pour comprendre que la question veut dire « on te
soupçonne ». À partir de là, elle n'obtient plus que des réponses défensives — **le seul signal non
falsifiable du lot serait détruit par la manière de le demander.**

### (g) Un flux d'événements envoyé au serveur pendant la passation — écartée

Techniquement plus « temps réel », et sans aucun gain : il faudrait un endpoint, N requêtes par
passation, une file, et une gestion du hors-ligne. **Le client observe de toute façon** ; qu'il envoie
son observation en une fois avec les réponses ne perd rien, et le §4.4 de la spec montre que
l'infalsifiabilité ne viendra jamais de là.

### (h) Dériver le verdict à la lecture plutôt que le figer — écartée

Moins de données stockées, une seule source. Mais une règle qui change **re-jugerait tout
l'historique**, et une mesure que Papa a déjà lue changerait d'avis sous ses yeux. Le dépôt a déjà
tranché ce motif pour le Conseil de classe (`adr-0021`, `council_reports` figés).

### (i) Une bande verte « mesure fiable ✓ » quand rien n'est détecté — écartée

C'est une **promesse que l'instrument ne peut pas tenir** (cf. Contexte). L'absence de bande dit
« rien vu », pas « rien eu lieu », et c'est tout ce qu'on peut affirmer.

## Décision

### 1. Six signaux, deux familles, une seule règle

**Un fait déclenche le verdict à lui seul. Un indice ne le déclenche jamais, et s'affiche quand
même.** La frontière n'est pas la force du soupçon, c'est la **part d'interprétation**.

| | Signal | Pourquoi de ce côté |
|---|---|---|
| ◆ **fait** | l'écran **quitté** pendant la passation (Décision 1 bis) | l'écran a été quitté, point — aucun seuil à inventer |
| ◆ **fait** | un **énoncé copié** | couvre le trou du précédent : on copie sans quitter la page |
| ◆ **fait** | le **plein écran quitté** en cours de passation | un geste délibéré |
| ◆ **fait** | le **contraste avec l'historique** — **trois** sources en union (constat n° 6) | le seul qui survit au téléphone, et le seul calculé serveur |
| ◇ indice | le **délai entre deux réponses** — le rythme (Décision 1 bis) | lenteur ≠ triche, rapidité ≠ copie |
| ◇ indice | le **changement de taille de fenêtre** | un iPad qu'on tourne est plus fréquent qu'un écran partagé |

**Les indices sont affichés quand même**, en gris, dans la bande. Papa lit mieux qu'un seuil ; les
lui cacher au motif qu'ils sont bruités reviendrait à décider à sa place.

Seuils et pièges d'implémentation : `docs/backend/fiabilite-de-la-mesure.md` §3 — **source unique**,
à ne pas recopier.

### 1 bis. Deux signaux sont portés par la PASSATION, pas par la question

> 🔴 **Décision du commanditaire, 2026-08-09**, après le constat n° 6 bis. Les deux signaux étaient
> spécifiés « par question » sur la foi d'un écran qui n'existe pas.

| | Avant (inimplémentable) | Après |
|---|---|---|
| sortie d'écran | `answers[].quittee` — « quittée avant d'être répondue » | **`conditions.sorties_ecran`** — combien de fois l'écran a été quitté **pendant la passation** |
| temps | `answers[].ms_reflexion` — « depuis l'affichage de la question » | **`answers[].ms_depuis_precedente`** — le délai depuis la réponse d'avant, c'est-à-dire le **rythme** |
| copie | `answers[].enonce_copie` | **inchangé** — le seul des trois qui survit |

**Ce qu'on perd** : le rattachement à une question. « 3 questions quittées » devient « l'écran a été
quitté 3 fois ». Le **fait** demeure ; sa **précision** baisse. C'est un coût, pas un détail — et
c'est celui que le libellé de la bande doit dire honnêtement.

🔴 **Ce qu'on ne fait PAS : découper la passation en une question à la fois.** Ça rendrait les deux
signaux tels qu'ils étaient écrits, et un mur de huit questions est lourd pour un enfant de toute
façon. Mais c'est une **refonte de l'écran de passation**, et la Décision 2 pose l'inverse : *un
enfant qui se sait observé ne passe plus le même diagnostic*. **Rendre l'instrument meilleur en
changeant l'écran qu'il mesure est précisément ce que cet ADR refuse.** Le découpage part au
`BACKLOG.md` comme chantier **pédagogique**, avec son vrai motif — pas comme une pièce d'anti-triche.

⚠️ **Coût sur du code déjà écrit** : le contrat de la Session A perd deux champs par réponse et en
gagne un global. Rien ne les consomme hors du calcul du verdict, et **rien n'est encore sur `main`**.

### 2. Aucune barrière. Le plein écran est un signal, pas un empêchement

Voir l'alternative (c). L'écran de passation **n'est pas modifié visuellement** : ni chrono, ni
compteur, ni avertissement, ni plein écran imposé.

⚠️ **L'instrument n'est pas égal selon l'appareil** : iOS Safari refuse `requestFullscreen` sur
iPhone. Ce signal ne vaudra que sur iPad et desktop — et la Décision 6 exige que la surface le
**dise**, plutôt que de laisser lire l'absence d'un signal comme l'absence du comportement.

### 3. La propagation ne change pas — le verdict s'y attache

`_upsert_skill_mastery`, `_upsert_gap` et `award_xp` s'exécutent **comme aujourd'hui**, dans le même
`commit()`.

Pas d'état intermédiaire, pas de geste obligatoire de Papa : **donc rien à défaire, et aucune mesure
en attente indéfinie.** Voir l'alternative (a).

### 4. Une seule migration, et le verdict est FIGÉ

`QuizAttempt.reliability_json` — un JSON, `nullable`, **écrit une fois à la soumission**. Il porte les
faits bruts, les indices, les déclencheurs, la portée de l'instrument, le verdict, et une
`regle_version`.

🔴 **C'est l'invariant du chantier. Si une session en propose une seconde, c'est un blocker** — elle
a quitté le périmètre.

Le verdict n'est **pas dérivé à la lecture** : voir l'alternative (h). `regle_version` dit quelle
règle l'a produit — sans elle, un verdict figé serait un verdict dont on ne sait plus rien.

⚠️ **Deux champs existants sont enfin remplis, et c'est dans le périmètre** : `duration_seconds`
(jamais écrit depuis sa création) et `started_at` (aujourd'hui égal à `completed_at`). Ce chantier
calcule exactement le nombre qu'ils attendaient ; ne pas les remplir en le tenant en main serait
perdre le seul moment où c'est gratuit.

### 5. La verbalisation est INCONDITIONNELLE

Après la soumission, sur l'écran de résultat de Massimo. **L'écran de passation n'est pas touché**, et
la demande reste un acte d'apprentissage, pas une surveillance.

- **UNE** question sur **UNE** notion, tirée parmi les **bonnes** réponses. Deux, c'est un
  interrogatoire.
- **Tirage déterministe**, dérivé de l'`attempt_id`. Un tirage aléatoire changerait de notion à chaque
  rechargement, et aucun test ne pourrait tenir cet écran.
- **À chaque passation, quel que soit le verdict** — voir l'alternative (f). Le coût est réel et
  assumé : une question de plus les vingt fois où il n'y avait rien à vérifier, pour que la
  vingt-et-unième ne ressemble pas à un piège.
- **Facultative**, avec un bouton « Passer » réel.
- 🔴 **Elle se dit à la VOIX autant qu'elle s'écrit** — voir la Décision 5 bis.

🔴 **La phrase de permission est obligatoire, et c'est elle qui fait tout le travail** :

> *« Tu peux dire "je le savais", "je l'ai vu en cours", "j'ai deviné" ou "j'ai cherché" — tout ça
> compte pareil. »*

Elle **nomme** la réponse qu'on cherche et la déclare **acceptable**. Un enfant qui sait qu'il peut
dire « j'ai cherché » sans conséquence le **dira**.

🔴 **La réponse n'entre pas dans le calcul du verdict, et son absence encore moins.** La compter
ferait de la question un piège, et de « Passer » un aveu.

🔴 **Pas d'XP sur cette réponse**, alors qu'ELI5 en donne pour une explication. Ici l'explication est
attachée à une **mesure** : payer pour elle en ferait une tâche, et un enfant qui veut l'XP écrira
n'importe quoi — ce qui détruit à la fois le signal et la verbalisation.

### 5 bis. La verbalisation se dit à la VOIX — et c'est la brique existante qui la porte

> 🔴 **Décision du commanditaire, 2026-08-09, après que cet ADR l'a d'abord exclue sur une raison
> FAUSSE.** L'exclusion reposait sur *« la dictée vit dans `Eli5Session.tsx`, pas dans une brique
> réutilisable »* — vérifié à la clôture : c'était faux. Le coût est petit ; la décision revient donc
> à ce qu'elle aurait dû être si le fait avait été juste.

**Ce que ça coûte, exactement, et rien de plus** — c'est le geste que `ChatPage.tsx` fait déjà :

| Pièce | Où elle est | Travail |
|---|---|---|
| `isDictationSupported()`, `startRecording()` | `frontend-massimo/src/lib/dictation.ts` | **import** |
| `transcribeEli5()`, `Eli5SttUnavailable` | `frontend-massimo/src/lib/eli5.ts` | **import** |
| `POST /api/ai/eli5/transcribe` | `eli5/router.py:54` | **rien — la route existe** |

**Zéro migration, zéro route, zéro backend.** `ChatPage` — un écran qui n'est pas ELI5 — importe
**déjà** ces deux helpers et appelle **déjà** cette route. Ce chantier est le **troisième**
consommateur d'un chemin éprouvé, pas l'inventeur d'un chemin neuf.

**Trois règles, et la première est celle qui compte :**

1. 🔴 **La transcription atterrit DANS le champ, elle ne s'envoie pas toute seule.** C'est le patron
   d'**ELI5** (la dictée remplit le textarea), pas celui de **ChatPage** (qui envoie directement,
   `send(transcript, "voice")`). Deux raisons : Massimo doit pouvoir **corriger** ce que Whisper a
   entendu de travers — sinon il découvrirait sa propre phrase déformée chez Papa — et un envoi
   automatique créerait un **second chemin de soumission** pour une carte qui n'en a qu'un.
2. **Le micro dégrade en silence, jamais en erreur.** `isDictationSupported()` faux (navigateur sans
   micro) ou service STT absent (**503**, `Eli5SttUnavailable`) → **le micro disparaît, le champ
   texte reste**, et rien n'est écrit à l'écran sur ce qui manque. C'est le comportement documenté
   d'ELI5 depuis l'`adr-0012`, et il vaut ici pour la même raison : un enfant n'a pas à savoir
   qu'un service est éteint.
3. **La limite passe de 140 à 200 caractères.** Une phrase *dite* est plus longue qu'une phrase
   *tapée* : 140 guillotinerait une réponse orale normale, et une troncature silencieuse sur la
   parole d'un enfant est exactement ce que ce chantier s'interdit ailleurs.

⚠️ **La dette que ça révèle, et qu'on ne paie pas ici** : la route de transcription vit sous le
**nom d'ELI5** (`/api/ai/eli5/transcribe`) alors qu'elle n'a plus rien d'ELI5 — le module `stt` n'a
qu'un `provider.py`, **aucun routeur**. Trois consommateurs sous le nom du premier, c'est un
déménagement qui se justifie ; il ne se fait pas **dans** ce chantier, et il va au `BACKLOG.md`.
Le faire ici toucherait deux écrans qui marchent pour un gain nul sur la mesure.

### 6. Papa voit TROIS états, pas deux

| `reliability_json` | Ce que la page montre |
|---|---|
| `verdict = "a_confirmer"` | la bande ambre, ses faits, son geste |
| `verdict = "rien_a_signaler"` | une ligne grise : *« Rien à signaler sur les conditions de cette passation. »* |
| `null` — **toutes les passations d'avant le chantier** | **rien du tout** : ZETIS ne regardait pas |

Sans le troisième état, « ZETIS a regardé et n'a rien vu » serait indistinguable de « ZETIS ne
regardait pas ». **Pas de bande verte** : alternative (i).

La bande porte aussi la **portée de l'instrument** — combien de signaux étaient observables sur cet
appareil (Décision 2).

**Marque dans le rail** : `⚖️ à confirmer`, **ambre jamais rouge**, le mot écrit à côté du symbole
(`adr-0045 §6` — la couleur ne porte jamais l'information seule). Le rouge dirait « faute » ; il n'y a
pas de faute, il y a une **incertitude**. Sur le troisième cran seulement : les crans non passés
n'ont pas de mesure, donc rien à qualifier.

### 7. La seule réponse à « à confirmer » est de REMESURER

La bande ne se retire pas et n'a **aucun** bouton « j'ai vérifié » : les conditions d'une passation
sont un fait daté, au même titre que le score, et les effacer parce qu'on les a lues reviendrait à
réécrire la mesure.

Son unique geste est **« Remesurer cette matière → »**. C'est littéralement ce que « à confirmer »
demande, c'est pédagogiquement neutre, et ça réutilise une action qui existe.

⚠️ **Le coût est petit et il est réel** : `LancerDiagnosticDialog` présélectionne toujours
`subjects[0]` — il lui faut **une prop de plus**. Sans elle, le bouton ouvrirait la modale sur la
mauvaise matière : le défaut exact que l'`adr-0045 §5` a refusé de livrer.

### 8. La règle de vocabulaire est une contrainte de code, pas de style

**Tout ce qui est construit prend LA MESURE pour sujet, jamais l'enfant.**

| ✗ jamais | ✓ toujours |
|---|---|
| « Massimo a peut-être triché » | « cette mesure est à confirmer » |
| « score suspect » | « conditions de passation incertaines » |
| « Massimo est sorti de l'écran 3 fois » | « l'écran a été quitté 3 fois pendant la passation » |

Elle s'applique aux **libellés, aux noms de champs, aux commentaires et aux messages de commit**. Un
enfant accusé à tort par un logiciel apprend surtout à s'en méfier — et la Décision 5 repose
**entièrement** sur le fait qu'il n'ait rien à défendre.

🔴 **Le corollaire, qui n'est pas du code et qui compte autant** : le mot de Massimo ne doit jamais
lui être reproché. Le jour où « j'ai cherché » se retourne contre lui, la question ne reçoit plus
jamais de réponse vraie, et ZETIS aura échangé son meilleur instrument contre une remontrance.

### 9. L'audit de la 4ᵉ piste conclut : la galaxie reste

Une seule récompense reste attachée au **score** — l'état des étoiles de la galaxie, via
`_upsert_skill_mastery` (constat n° 7). **On n'y touche pas.**

La retirer amputerait la galaxie pour traiter un symptôme : une étoile allumée à tort n'est pas une
récompense mal placée, c'est **la propagation d'une mesure fausse** — le problème du Contexte, dont
la réponse est le verdict et la remesure.

**Ce que l'audit conclut donc** : s'il triche encore, ce n'est pas pour gagner, c'est pour **ne pas
avoir l'air nul**. Aucun détecteur ne règle ça ; seule la formulation du résultat le règle, et
l'`adr-0044 §5` l'a déjà faite.

### 10. Ce qui ne change pas

- **Le moteur de diagnostic** : génération, sélection des notions, scoring, ouverture des `Gap`.
- **Le gate de relecture de l'`adr-0043`**, sur les trois routes élève.
- **La forme enfant du résultat** (`adr-0044 §5`) : ni score, ni sévérité. La carte « Raconte-moi »
  s'y ajoute, elle n'y retire rien.
- **L'XP d'engagement** : `XP_DIAGNOSTIC` reste donné pour être venu.
- **Le contrat de `GET /diagnostics/apercu`** — hormis le champ de verdict qui suit chaque ligne
  passée.
- **Les autres quiz** (mission, fin de cours, boss) : le module `quizzes` n'est pas touché.

## Périmètre

**Dans** : les six signaux et leur observation côté client · le contrat de `POST /submit` (champs
optionnels) · le calcul et l'écriture de `reliability_json` · `duration_seconds` et `started_at`
enfin réels · la bande de fiabilité et la marque du rail côté Papa · la prop de présélection de
`LancerDiagnosticDialog` · la carte « Raconte-moi », **son micro**, sa route et son affichage dans la
station ①.

**Hors** :

- **toute barrière** — alternative (c), y compris l'Accès guidé iOS ;
- **les mouvements de souris** — alternative (d) ;
- **tout affichage du verdict côté Massimo** : il ne voit rien et n'est jamais accusé ;
- ~~**la voix** sur la verbalisation~~ → 🔴 **ENTRÉE dans le périmètre le 2026-08-09**, décision du
  commanditaire. Cet ADR l'avait exclue sur une raison **fausse** (« la dictée vit dans
  `Eli5Session.tsx` ») ; le fait corrigé, la décision suit. Voir la **Décision 5 bis** ;
- le **déménagement de `/api/ai/eli5/transcribe`** vers un nom neutre — dette nommée en 5 bis,
  au `BACKLOG.md` ;
- **une seconde migration**, quelle qu'elle soit — Décision 4 ;
- **la station ② du Diagnostic** et ses deux gestes qui visent la matière — dette au `BACKLOG.md`,
  figée par un test qu'il faudra **supprimer** le jour où elle sera payée ;
- les **14 défauts du module `diagnostics`** au `BACKLOG.md` ;
- le **multi-enfant**.

## Conséquences

### Positives

- ZETIS cesse de traiter toutes ses mesures comme également sûres, alors qu'elles ne le sont pas.
- **Deux champs morts depuis leur création** (`duration_seconds`, `started_at`) deviennent réels.
- Le meilleur signal du lot **ne coûte aucune instrumentation** et est **infalsifiable** — il se
  calcule sur des données que le client ne touche pas.
- La verbalisation rend un service **pédagogique** que `CLAUDE.md` demandait déjà, indépendamment de
  toute triche. Le contrôle devient un acte d'apprentissage — et **elle se DIT**, ce qui est la forme
  que `CLAUDE.md` nomme (« la verbalisation par Massimo »), sur une brique que deux écrans ont déjà
  éprouvée.
- **Une seule migration**, un seul champ, écrit une seule fois.
- L'instrument **dit sa portée** : Papa lit « rien à signaler » en sachant sur combien d'yeux ce
  « rien » repose.

### Négatives / coûts assumés

- **Le front doit apprendre à observer**, ce qu'il ne fait nulle part ailleurs dans ZETIS. C'est la
  vraie masse du chantier, et elle est sur l'écran de passation — jusqu'ici hors périmètre de tous
  les chantiers Diagnostic.
- **Cinq signaux sur six sont déclarés par le client** et disparaissent d'un payload forgé. Assumé :
  forger une requête et chercher une réponse sur le web sont deux gestes sans rapport.
- **Une question de plus à chaque fin de diagnostic**, y compris quand il n'y avait rien à vérifier
  (Décision 5).
- **L'instrument reste inégal selon l'appareil** : sur iPhone, le plein écran n'existe pas. Le
  clavier, lui, cesse d'être le problème — c'est ce que la Décision 5 bis achète.
- **La carte gagne un état de plus** (enregistrement, transcription en cours, échec silencieux du
  micro). Une carte qui devait rester simple porte désormais trois chemins au lieu d'un.
- **Le chantier devient le TROISIÈME consommateur d'une route nommée `eli5`** qui n'a plus rien
  d'ELI5. C'est une dette assumée et nommée (Décision 5 bis), pas un oubli.
- **Le contraste historique est bruité dans l'autre sens** : un enfant peut savoir une chose sans
  l'avoir travaillée dans ZETIS. C'est pourquoi il déclenche « à confirmer », jamais « faux ».
- **Le verdict figé vieillit** : si la règle change, l'historique porte des verdicts d'une règle
  qu'on ne lit plus. `regle_version` le rend lisible, pas indolore.

## Le signal qui dirait qu'on s'est trompé

- **La bande apparaît presque à chaque passation** — un déclencheur est trop sensible, et
  « à confirmer » devient du bruit qu'on cesse de lire. Regarder **lequel** des quatre faits domine
  avant de toucher aux seuils : c'est probablement le contraste. 🔴 **Et alors vérifier d'abord ses
  TROIS sources, pas ses seuils** — c'est par là que ce défaut a failli être livré (constat n° 6) :
  une source manquante rend « sans trace » des notions déjà connues, et ça ressemble à un seuil trop
  bas. Ce n'est qu'après, s'il ne reste rien, qu'on regarde un enfant qui apprend hors de ZETIS.
- **La bande n'apparaît jamais** alors que Papa a des doutes — l'instrument mesure à côté. La réponse
  serait de regarder ce que la **portée** dit : peut-être qu'il ne voyait rien du tout.
- **Papa ne clique jamais « Remesurer »** — le geste ne correspond pas à ce qu'il veut faire du
  doute. Alors demander ce qu'il ferait à la place, avant d'ajouter un second bouton.
- **Massimo « Passe » systématiquement** — et le clavier n'est plus l'excuse, puisque le micro est
  là (Décision 5 bis). Alors regarder **dans cet ordre** : le micro apparaît-il vraiment sur son
  appareil (un `isDictationSupported()` faux le masque **sans rien dire**) · la transcription
  revient-elle juste, ou lui rend-elle des phrases déformées qu'il renonce à corriger · et
  seulement ensuite, la question elle-même. 🔴 **Dans aucun de ces cas la réponse n'est de rendre la
  verbalisation obligatoire** : une verbalisation forcée n'est plus une verbalisation.
- **Les réponses sont toutes « je sais pas »** — c'est la question qui est mal posée, pas l'enfant qui
  se dérobe. Essayer « où tu as appris ça ? » avant de conclure.
- 🔴 **Massimo se met à répondre plus court, ou à mentir** — la phrase de permission a été trahie
  quelque part, très probablement hors de l'écran, dans une conversation. **C'est le seul défaut du
  chantier qu'aucun code ne peut réparer.**

## Suivi

- Prompt de chantier : `prompts/claude-code/prompts-claude-code-adr-0048.md`.
- ⚠️ **Relecture visuelle humaine obligatoire avant la PR** — sur les **deux** apps. La bande de Papa
  et la carte de Massimo sont des surfaces qu'aucun test ne peut juger, et le dépôt a déjà mergé
  cinq fois sans regarder.
- ⚠️ **Vérifier le plein écran sur les trois appareils.** Le refus d'iOS Safari sur iPhone est
  documenté mais **non vérifié en vrai** : si l'appel échoue autrement que prévu, c'est la portée
  affichée qui ment.
- ⚠️ **Semer une passation « à confirmer » en dev** avant la vérification : sans elle, la bande part
  non vue — exactement le constat n° 6 de l'`adr-0045`, qui a coûté une moitié d'optimisation.
- ⚠️ **Vérifier le micro sur les trois appareils**, et pas seulement qu'il s'affiche : que la
  transcription revient, et qu'elle atterrit **dans le champ** sans partir toute seule. Le micro se
  masque **en silence** quand il n'est pas supporté — c'est voulu, et c'est exactement ce qui rend
  son absence invisible à la vérification si on ne la cherche pas.
- ⚠️ **Vérifier aussi le cas STT éteint** (503) : le champ texte doit rester, et rien ne doit
  s'afficher sur le service manquant.
- **Ce qui va au `BACKLOG.md`** : l'Accès guidé iOS comme geste de Papa hors code, et le
  **déménagement de `/api/ai/eli5/transcribe`** vers un nom neutre (Décision 5 bis).
