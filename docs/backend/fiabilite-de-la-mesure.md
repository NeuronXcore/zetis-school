# La fiabilité d'une mesure de diagnostic

> Spec du chantier **anti-triche du diagnostic** (`adr-0048`).
> Maquettes : `docs/frontend-papa/mockup/mockup-papa-fiabilite-mesure-v1.html` ·
> `docs/frontend-massimo/mockup/mockup-diagnostic-resultat-verbalisation-v1.html`.
> Surfaces : `docs/frontend-papa/page-diagnostic.md` `[0048]` ·
> `docs/frontend-massimo/page-diagnostic.md` `[0048]`.

## 0. La règle de vocabulaire, avant tout le reste

**Tout ce que ce document décrit prend LA MESURE pour sujet, jamais l'enfant.**

| ✗ jamais | ✓ toujours |
|---|---|
| « Massimo a peut-être triché » | « cette mesure est à confirmer » |
| « score suspect » | « conditions de passation incertaines » |
| « 3 sorties d'écran détectées » | « 3 questions quittées avant d'être répondues » |

Ce n'est pas de la politesse. Un enfant accusé à tort par un logiciel apprend surtout à s'en méfier,
et la §6 (verbalisation) repose **entièrement** sur le fait qu'il n'ait rien à défendre. Une phrase
qui prend Massimo pour sujet, où que ce soit — code, commentaire, libellé, message de commit — est
un défaut du chantier, pas un raccourci de rédaction.

## 1. Pourquoi ici et pas ailleurs

Le diagnostic est le **seul** endroit de ZETIS où une mesure fausse **se propage** : `submit()` écrit
`SkillMastery`, ouvre des `Gap`, et ces deux-là nourrissent les missions, la galaxie et le Conseil de
classe. Une triche ne fait donc pas « gagner » Massimo — elle fait **construire ZETIS sur du faux**,
et rien d'extérieur ne vient jamais la contredire.

C'est le motif que la station ③ défend déjà (*« ZETIS ne se commande pas de production sur sa propre
mesure »*), un cran plus tôt dans la chaîne.

🔴 **Ce que ce chantier ne fait pas, et ne peut pas faire.** Aucun signal côté navigateur ne survit à
un **téléphone posé à côté de l'écran**. Un détecteur construit sans le dire produirait un instrument
qui rassure sans mesurer. C'est pourquoi le §3.4 — le seul signal qui n'est pas dans le navigateur —
compte plus que les cinq autres réunis.

## 2. Ce qui manque aujourd'hui (read-before-code du 2026-08-09)

1. 🔴 **La durée d'une passation n'est pas mesurée : elle vaut zéro par construction.**
   `submit()` pose `started_at = completed_at = now`, le **même instant**
   (`diagnostics/service.py:483-490`). Et `QuizAttempt.duration_seconds` **existe** dans le modèle…
   et n'est **jamais écrit**.
2. ✅ **Les signaux par question ne coûtent aucune migration.** `QuizAnswer.answer_json` est un JSON
   libre, déjà écrit à chaque réponse (`{"choice_index": chosen}`).
3. 🔴 **Le vrai coût est côté FRONT.** Le client envoie `{question_id, choice_index}[]` **une seule
   fois, en fin de parcours** (`lib/diagnostic.ts:95`). Il ne mesure rien, n'observe rien. Le backend
   ne peut rien inférer de ce qu'on ne lui envoie pas.
4. ⚠️ **Il manque un endroit pour le verdict.** `QuizAttempt` n'a aucun champ pour ça — c'est la
   **seule** migration du chantier.
5. ✅ **La propagation est immédiate et inconditionnelle**, et elle le reste (§5.3).

## 3. Les six signaux — deux familles, une règle

**La règle, en une phrase :** un **fait** déclenche le verdict à lui seul ; un **indice** ne le
déclenche jamais, et s'affiche quand même.

La frontière n'est pas la force du soupçon, c'est la **part d'interprétation** : un indice a une
explication innocente au moins aussi probable que l'autre.

### 3.1 ◆ Fait — la sortie d'écran

`visibilitychange` et `blur` pendant qu'une question est affichée et pas encore répondue.
**Aucun seuil à inventer** : l'écran a été quitté, point.

Compté **par question**, jamais en total de secondes. « 3 questions quittées » se lit ; « 47 secondes
hors écran » demande un seuil que personne ne sait fixer.

### 3.2 ◆ Fait — la copie de l'énoncé

Événement `copy` sur le texte d'une question. **Couvre le trou du 3.1** : on peut copier un énoncé
**sans quitter la page**, puis le coller ailleurs plus tard.

### 3.3 ◆ Fait — la sortie du plein écran

Le plein écran est **demandé** au démarrage de la passation (le clic « Commencer » fournit le geste
utilisateur requis par l'API). En **sortir** en cours de passation est un geste délibéré que
`fullscreenchange` voit.

⚠️ **Ce n'est pas une barrière** — cf. §7 — et ce signal **n'existe pas sur iPhone** : iOS Safari
refuse `requestFullscreen`. Il ne vaudra que sur iPad et desktop, et l'instrument doit le **dire**
(§4.3).
⚠️ La sortie de plein écran **à la soumission** est provoquée par l'app elle-même : elle ne compte
pas. Seules comptent les sorties **entre** la première question et la soumission.

### 3.4 ◆ Fait — le contraste avec l'historique

**Le meilleur signal du lot, et le seul qui survit au téléphone posé à côté.** Il ne demande *aucune*
instrumentation : ZETIS a déjà tout ce qu'il faut.

> Des notions données **acquises** par cette mesure, alors que Massimo ne les a **jamais
> rencontrées** dans ZETIS.

- **« acquise »** = score de la notion ≥ `CONTRASTE_SCORE_MIN` (**90**).
- **« jamais rencontrée »** = aucun `LearningEvent` de travail sur cette notion **avant** cette
  passation.
- **Déclenche quand** : `n_acquises_sans_trace >= 2` **et** `n_acquises_sans_trace > notions / 2`.

Le plancher de 2 empêche un diagnostic à une ou deux notions de déclencher pour rien ; la majorité
empêche une notion isolée de suffire.

🔴 **Deux pièges, et ils sont tous les deux datés du dépôt :**

- **Filtrer avec `NON_WORK_EVENTS`, pas `NON_ACTIVITY_EVENTS`.** `activity/events.py:87` — la
  navigation n'est pas du travail. Sans ce filtre, un simple `page_viewed` compterait comme une trace
  et **éteindrait le signal en silence**. Le dépôt a déjà payé exactement ce défaut sur
  `production.runner.massimo_is_active`.
- 🔴 **Le contraste se calcule AVANT `_upsert_skill_mastery`.** Cette fonction écrit un
  `SkillMastery` pour chaque notion de la passation : calculé après, le contraste comparerait la
  passation **à elle-même** et vaudrait toujours zéro. C'est le piège qui rendrait le chantier
  entièrement inopérant tout en restant vert.

⚠️ **Bruité dans l'autre sens, et c'est écrit sur la bande** : un enfant peut savoir une chose sans
l'avoir travaillée **dans ZETIS** — à l'école, à la maison, dans un documentaire.

### 3.5 ◇ Indice — le temps par réponse

Le temps entre l'affichage d'une question et sa réponse, en millisecondes.

**Ne déclenche jamais rien.** Lenteur ≠ triche, rapidité ≠ copie : un enfant qui sait répond vite. Il
s'affiche à côté des faits, en gris, et Papa lit mieux qu'un seuil.

🔴 **Jamais de chrono visible** côté Massimo, sous aucune forme : ce serait de la pression anxiogène
(`CLAUDE.md` §gamification) et **ça changerait la mesure elle-même**.

**Mesuré avec `performance.now()`**, jamais `Date.now()` : monotone, immune au changement d'heure, et
on n'envoie que des **durées** — aucun horodatage absolu du client n'est transporté ni cru.

### 3.6 ◇ Indice — le changement de taille de fenêtre

`resize` pendant la passation (split-screen). **Indice et non fait** parce que l'explication
innocente est la plus fréquente : un iPad qu'on tourne, un clavier logiciel qui s'ouvre.

### 3.7 Écarté — les mouvements de souris

Bruit énorme, **absents sur tablette et iPhone** (les deux appareils de Massimo), et c'est de la
surveillance comportementale — ce qui heurte de front le §0.

## 4. Le contrat de transport

### 4.1 `POST /api/diagnostics/quizzes/{quiz_id}/submit`

Le corps gagne des champs, **tous optionnels**. Un client qui n'envoie que
`{question_id, choice_index}` continue de fonctionner à l'identique — c'est ce qui garde les tests
existants verts et rend le déploiement sans ordre imposé.

```jsonc
{
  "answers": [
    {
      "question_id": 41,
      "choice_index": 2,
      "ms_reflexion": 8400,      // optionnel — durée affichage → réponse (performance.now)
      "quittee": false,          // optionnel — §3.1
      "enonce_copie": false      // optionnel — §3.2
    }
  ],
  "conditions": {                // optionnel en bloc
    "ms_total": 214000,          // durée réelle de la passation
    "plein_ecran_quitte": false, // §3.3
    "taille_changee": true,      // §3.6
    "signaux_observables": ["sortie_ecran", "copie", "taille"]   // §4.3
  }
}
```

### 4.2 Ce que ça permet enfin d'écrire

- `QuizAnswer.answer_json` devient
  `{"choice_index": …, "ms_reflexion": …, "quittee": …, "enonce_copie": …}` — **zéro migration**.
- `QuizAttempt.duration_seconds` est **écrit pour la première fois** (`ms_total / 1000`).
- `QuizAttempt.started_at` devient **réel** : `completed_at − ms_total`, au lieu du même instant.

⚠️ Les deux dernières lignes sont **dans** le périmètre et nommées comme telles : ce chantier calcule
exactement le nombre que ces deux champs attendaient depuis toujours. Ne pas les remplir en le
tenant en main serait perdre le seul moment où c'est gratuit.

### 4.3 L'instrument dit sa propre portée

`signaux_observables` liste ce que l'appareil **permettait** d'observer. Sur iPhone, `plein_ecran`
n'y sera pas.

**Sans ce champ, l'absence d'un signal serait lue comme l'absence du comportement.** Papa doit
pouvoir lire « rien à signaler » en sachant sur combien d'yeux ce « rien » repose.

### 4.4 Ce qu'un client peut mentir, et pourquoi ça ne change rien

Les cinq signaux du navigateur sont **déclarés par le client** : un payload forgé les efface. C'est
assumé, pour deux raisons.

1. Forger une requête HTTP et chercher une réponse sur le web sont deux gestes qui n'ont rien à voir.
   Le second est à portée de tout le monde ; le premier n'est pas le problème qu'on traite.
2. **Le §3.4 est calculé serveur, sur des données que le client ne touche pas.** Le meilleur signal
   du lot est aussi le seul infalsifiable. C'est un argument de plus pour qu'il pèse le plus.

## 5. Le calcul et le stockage du verdict

### 5.1 Une seule migration : `QuizAttempt.reliability_json`

```python
reliability_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

`null` = **cette passation n'a jamais été observée** (toutes celles d'avant le chantier). Ce n'est pas
« rien à signaler » — c'est « on ne regardait pas », et les deux se distinguent à l'écran (§6.2).

🔴 **Si une session en propose une seconde, c'est un blocker** : elle a quitté le périmètre.

### 5.2 Le contenu, écrit UNE fois

```jsonc
{
  "verdict": "a_confirmer",          // ou "rien_a_signaler"
  "regle_version": 1,
  "faits": {
    "questions_quittees": 3,
    "enonces_copies": 1,
    "plein_ecran_quitte": false,
    "acquises_sans_trace": 6,
    "notions_total": 8
  },
  "indices": {
    "reponses_rapides": 4,
    "taille_changee": true
  },
  "declencheurs": ["questions_quittees", "enonces_copies", "contraste"],
  "portee": { "observables": ["sortie_ecran", "copie", "taille"] }
}
```

🔴 **Le verdict est FIGÉ à la soumission, pas dérivé à la lecture.** Une règle qui change re-jugerait
sinon tout l'historique, et une mesure que Papa a déjà lue changerait d'avis sous ses yeux. C'est le
motif du rapport figé du Conseil de classe (`council_reports`). `regle_version` dit quelle règle a
produit ce verdict — sans lui, un verdict figé devient un verdict dont on ne sait plus rien.

### 5.3 La propagation ne change pas

`_upsert_skill_mastery`, `_upsert_gap` et `award_xp` s'exécutent **comme aujourd'hui**, dans le même
`commit()`. Le verdict **s'attache** à la mesure ; il ne la retient pas.

Pas d'état intermédiaire, pas de geste obligatoire de Papa — **donc rien à défaire, et aucune mesure
en attente indéfinie**. Une mesure suspendue jusqu'à validation humaine serait une mesure qui
n'existe pas les jours où Papa ne regarde pas.

## 6. La verbalisation

### 6.1 Quoi, où, quand

**Après la soumission, sur l'écran de résultat de Massimo.** L'écran de **passation n'est pas
touché** — ni chrono, ni compteur, ni avertissement, ni plein écran imposé.

- **UNE** question sur **UNE** notion, tirée parmi les **bonnes réponses**. Deux, c'est un
  interrogatoire.
- **Tirage déterministe**, dérivé de l'`attempt_id` : recharger la page repose la **même** question.
  Un tirage aléatoire donnerait une notion différente à chaque rechargement, et aucun test ne
  pourrait tenir cet écran.
- Champ court (**200 caractères**), **facultatif**, bouton « Passer » réel, **et un micro** (§6.3).

🔴 **La carte s'affiche à CHAQUE passation, quel que soit le verdict.** Conditionner son apparition au
doute la transformerait en accusation : deux ou trois passations suffisent à un enfant pour
comprendre, et le seul signal non falsifiable du lot serait détruit par la manière de le demander.

🔴 **La phrase de permission est obligatoire** : *« Tu peux dire "je le savais", "je l'ai vu en
cours", "j'ai deviné" ou "j'ai cherché" — tout ça compte pareil. »* Elle **nomme** la réponse qu'on
cherche et la déclare **acceptable**. C'est ce qui la rend disible.

### 6.2 Ce qu'elle n'est pas

- **Elle n'entre pas dans le calcul du verdict**, et son absence encore moins. La compter ferait de
  la question un piège, et de « Passer » un aveu.
- **Elle ne donne pas d'XP**, contrairement à l'explication d'ELI5 (badge « Petit prof »). Ici
  l'explication est attachée à une **mesure** : payer pour elle en ferait une tâche, et un enfant qui
  veut l'XP écrira n'importe quoi — ce qui détruit à la fois le signal et la verbalisation. L'XP du
  diagnostic reste donné pour **être venu** (`adr-0044` §9).
- **Elle se dit à la voix autant qu'elle s'écrit** — §6.3.

### 6.3 Le micro — trois imports, zéro backend

`CLAUDE.md` prescrit *« la verbalisation par Massimo »* : la forme naturelle est **dite**, pas tapée.
Et taper une phrase sur un iPhone est un travail, ce qui ferait de « Passer » le chemin par défaut.

**Tout existe déjà, et c'est le geste que `ChatPage.tsx` fait mot pour mot :**

| Pièce | Où | Travail |
|---|---|---|
| `isDictationSupported()`, `startRecording()`, type `Recording` | `frontend-massimo/src/lib/dictation.ts` | **import** |
| `transcribeEli5()`, `Eli5SttUnavailable` | `frontend-massimo/src/lib/eli5.ts` | **import** |
| `POST /api/ai/eli5/transcribe` (Whisper local) | `eli5/router.py:54` | **rien** |

**Zéro migration, zéro route, zéro backend.** `lib/dictation.ts` a **déjà deux consommateurs**
(`hooks/useEli5.ts` et `pages/ChatPage.tsx`) ; `transcribeEli5` en a **déjà deux** aussi, dont
`ChatPage`, qui n'est pas ELI5. Ce chantier est le **troisième**, pas le premier.

🔴 **Trois règles, et la première commande les autres.**

1. **La transcription atterrit DANS le champ ; elle ne s'envoie pas toute seule.** Patron d'**ELI5**
   (la dictée remplit le textarea), **pas** celui de **ChatPage** (`send(transcript, "voice")`, envoi
   direct). Massimo doit pouvoir **corriger** ce que Whisper a mal entendu — sinon il découvrirait sa
   propre phrase déformée chez Papa — et un envoi automatique créerait un **second chemin de
   soumission** sur une carte qui n'en a qu'un.
2. **Le micro dégrade en SILENCE.** `isDictationSupported()` faux, ou STT éteint (**503** →
   `Eli5SttUnavailable`) : **le micro disparaît, le champ texte reste**, et **rien** ne s'affiche sur
   ce qui manque. Comportement documenté d'ELI5 depuis l'`adr-0012` — un enfant n'a pas à savoir
   qu'un service est éteint.
3. **La limite est 200 caractères, pas 140.** Une phrase *dite* est plus longue qu'une phrase
   *tapée*. 140 guillotinerait une réponse orale normale, et tronquer la parole d'un enfant en
   silence est précisément ce que ce document s'interdit ailleurs.

⚠️ **La dette que ça révèle et qu'on ne paie pas ici** : `/api/ai/eli5/transcribe` porte le nom
d'ELI5 alors qu'elle n'a plus rien d'ELI5 — le module `stt` n'a qu'un `provider.py`, **aucun
routeur**. Trois consommateurs sous le nom du premier, ça se déménage ; **pas dans ce chantier**, où
ça toucherait deux écrans qui marchent pour un gain nul sur la mesure. Au `BACKLOG.md`.

### 6.4 Route et stockage

`POST /api/diagnostics/mes-resultats/{attempt_id}/explication` — `require_child`, même contrôle
d'appartenance que `resultat_eleve`.

Corps : `{"question_id": 41, "texte": "je l'ai vu dans le documentaire de dimanche"}`.

Écrit dans le `QuizAnswer.answer_json` **de cette question** : `{"…", "explication": "…"}`.
**Zéro migration.** Le mot est *à propos d'une question* — il vit avec elle, pas dans le bloc de
fiabilité qui, lui, ne contient que ce que ZETIS a **observé**.

L'écran de relecture (`GET /mes-resultats/{id}`) sert l'explication déjà donnée : Massimo relit ce
qu'il a écrit, il ne se le voit pas redemander.

## 7. Aucune barrière — et ce n'est pas un renoncement

**« Bloquer la navigation » est impossible côté web** : ni `Cmd+T`, ni `Cmd+Tab`, ni quitter le
navigateur, ni un second appareil. Ce n'est pas une limite de ZETIS — un site qui pourrait retenir
son utilisateur serait une faille.

Le **plein écran** entre donc comme **signal** (§3.3), **pas comme empêchement**.

⚠️ Le seul dispositif qui bloque vraiment est **hors du code** : l'**Accès guidé iOS**, un geste de
Papa avant la passation. Écarté du périmètre, écrit ici pour qu'on ne le redécouvre pas.

## 8. Ce qui reste à gagner en trichant — l'audit

La quatrième piste du `BACKLOG` était un audit : *que récompense encore un **bon score** de
diagnostic ?* Fait le 2026-08-09.

| Récompense | Dépend du score ? | Verdict |
|---|---|---|
| XP `XP_DIAGNOSTIC` | **non** — montant fixe pour être venu | ✅ rien à faire (`adr-0044` §9) |
| Badge « Diagnostic passé » 🧭 | **non** — `diag_done`, un événement XP suffit | ✅ rien à faire |
| Score brut affiché à l'enfant | — | ✅ **déjà retiré** (`adr-0044` §5) |
| Frise de la galaxie | **non** — monotone, première trace par notion | ✅ rien à faire |
| 🔴 **État des étoiles de la galaxie** | **OUI** — `_upsert_skill_mastery` écrit `mastery_score` **et** le statut, qui allume la notion | voir ci-dessous |

**La galaxie est la seule récompense qui reste attachée au score, et on n'y touche pas.** La retirer
gutterait la galaxie pour traiter un symptôme : une étoile allumée à tort n'est pas une récompense
mal placée, c'est **la propagation d'une mesure fausse** — exactement le problème du §1, dont la
réponse est le verdict et la remesure, pas l'amputation d'une surface qui marche.

**Ce que l'audit conclut donc** : s'il triche encore, ce n'est pas pour gagner — c'est pour **ne pas
avoir l'air nul**. Aucun détecteur ne règle ça ; seule la formulation du résultat le règle, et
l'`adr-0044` §5 l'a déjà faite.

## 9. Hors périmètre

- **Toute barrière** (§7), y compris l'Accès guidé iOS.
- **Les mouvements de souris** (§3.7).
- ~~**La voix sur la verbalisation**~~ → **DANS le périmètre** depuis le 2026-08-09 (§6.3).
- **Le déménagement de `/api/ai/eli5/transcribe`** vers un nom neutre — dette nommée en §6.3.
- **L'écran de passation** : aucune modification visible. Il n'observe que ce que §4 transporte.
- **Les autres quiz** (mission, fin de cours, boss) : le module `quizzes` n'est pas touché. Seul le
  diagnostic propage, seul le diagnostic est instrumenté.
- **Une seconde migration**, quelle qu'elle soit — c'est un blocker (§5.1).
- **La station ② du Diagnostic** et ses deux gestes qui visent la matière — dette au `BACKLOG.md`,
  figée par un test qu'il faudra **supprimer** le jour où elle sera payée.
- **Le multi-enfant.**
