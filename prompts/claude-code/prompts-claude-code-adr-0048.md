# Prompts Claude Code — chantier ADR-0048 (ZETIS doute de sa propre mesure)

> **Trois sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code, **après `/slice`**, qui porte la discipline. Le prompt ne porte que le chantier.
>
> ✅ **L'ADR est `Accepté` (2026-08-09).** Le prérequis de décision est levé : les sessions peuvent
> démarrer. Les **dix décisions sont gelées** — on les **relit**, on ne les rouvre pas.
>
> 🔴 **UNE seule migration dans tout le chantier** : `QuizAttempt.reliability_json`, en Session A.
> **Si une session en propose une seconde, c'est un blocker, pas une bonne idée.**
>
> ⚠️ **Quatre décisions viennent du commanditaire**, prises au cadrage du 2026-08-09 après exposé de
> l'alternative : la **propagation** (elle écrit comme aujourd'hui), la **surface de la
> verbalisation** (écran de résultat, pas de passation), les **six signaux retenus**, et
> l'**absence de barrière**. On les **relit**, on ne les rouvre pas.

---

## 🔴 La règle qui commande TOUT le chantier

**Tout ce que tu écris prend LA MESURE pour sujet, jamais l'enfant.**

| ✗ jamais | ✓ toujours |
|---|---|
| « Massimo a peut-être triché » | « cette mesure est à confirmer » |
| `suspicion_score`, `cheat_flags` | `reliability_json`, `faits`, `indices` |
| « 3 sorties d'écran détectées » | « 3 questions quittées avant d'être répondues » |

Elle s'applique aux **libellés, aux noms de champs, aux commentaires et aux messages de commit**. Une
phrase qui prend Massimo pour sujet est **un défaut du chantier**, pas un raccourci de rédaction —
et la Session B repose entièrement sur le fait qu'il n'ait rien à défendre.

---

## Ce que chaque session doit avoir lu

- `docs/decisions/adr-0048-zetis-doute-de-sa-propre-mesure.md` — les 10 décisions, et surtout le
  **Constat read-before-code** ;
- **`docs/backend/fiabilite-de-la-mesure.md`** — la spec, **source unique** de la règle, des seuils
  et des noms de champs. Ne la recopie nulle part ;
- selon la session, les passages **`[0048]`** de `docs/frontend-papa/page-diagnostic.md` ou de
  `docs/frontend-massimo/page-diagnostic.md` ;
- **les maquettes, ouvertes dans un navigateur** :
  `docs/frontend-papa/mockup/mockup-papa-fiabilite-mesure-v1.html` et
  `docs/frontend-massimo/mockup/mockup-diagnostic-resultat-verbalisation-v1.html`. Les libellés
  exacts y sont, et ils ont été pesés — ne les réinvente pas.

---

## Protocole commun aux trois sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de « À LIRE AVANT D'ÉCRIRE » avant d'écrire une
   ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. L'ADR-0048 est écrit sur un
   read-before-code du 2026-08-09 : ses constats sont des MESURES à cette date, pas des lois.

3. Stop-on-blocker. Si une lecture contredit l'ADR ou la spec, ARRÊTE-TOI et remonte. N'improvise
   pas. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, route, type et composant.

6. 🔴 PIÈGE DÉJÀ PAYÉ DEUX FOIS SUR CES SERVICES — `response_model` FILTRE EN SILENCE.
   L'ADR-0045 puis l'ADR-0047 ont ajouté des champs à `open_gaps` : les clés étaient produites par
   le service et DISPARAISSAIENT à la sérialisation, sans erreur, sans avertissement, parce que le
   schéma ne les déclarait pas. Ce chantier ajoute un champ à CHAQUE contrat qu'il touche.
   Déclare-le dans le schéma AVANT de croire qu'il est servi, et vérifie la réponse HTTP RÉELLE.

7. 🔴 UN SABOTAGE PEUT ÊTRE VERT SANS QUE LE VERROU SOIT MAUVAIS.
   Si le décor du test ne peut pas atteindre la branche sabotée, le sabotage ne prouve rien.
   Contrôle systématiquement que le remplacement a EU LIEU (le script doit échouer bruyamment
   sinon) et que le décor construit bien le cas visé.

8. HORS PÉRIMÈTRE, ET C'EST FERME. Ne touche pas : le moteur de génération du diagnostic, la
   sélection des notions, le scoring, l'ouverture des Gap, le gate de relecture de l'ADR-0043, la
   forme enfant du résultat (ADR-0044 §5), le module `quizzes`, la galaxie, la station ② du
   Diagnostic (dette figée par un test au BACKLOG).

9. AUCUNE BARRIÈRE. Le plein écran est un SIGNAL. S'il échoue, la passation continue exactement
   comme avant. Aucune session ne bloque, ne prévient, ne compte à rebours, n'avertit.
```

---

## 🔴 Les TROIS pièges qui rendraient le chantier inopérant EN RESTANT VERT

**Lis-les avant la Session A. Ils ne se voient dans aucun test qu'on n'a pas écrit exprès.**
Le troisième a été **trouvé au read-before-code du 2026-08-09**, et il avait déjà produit une règle
fausse dans la spec.

### 1. Le contraste calculé APRÈS `_upsert_skill_mastery` vaut toujours zéro

`submit()` écrit un `SkillMastery` pour **chaque** notion de la passation. Un contraste calculé après
comparerait la passation **à elle-même** : « jamais rencontrée » serait faux pour toutes, le signal
vaudrait zéro à chaque fois, et **tout marcherait**. Le meilleur signal du chantier serait mort sans
qu'une seule ligne rougisse.

🔴 **Ce piège porte sur la source n° 1 du contraste, la principale** : il ne dégrade pas le signal,
il l'**annule**. **Calcule le contraste AVANT la boucle de propagation, et fais-en un test-verrou.**

### 2. `NON_ACTIVITY_EVENTS` au lieu de `NON_WORK_EVENTS` éteint le signal en silence

`activity/events.py:87` — `NON_WORK_EVENTS = {login, page_viewed} | NON_ACTIVITY_EVENTS`.

Sans `page_viewed` dans le filtre, **ouvrir une page compterait comme « avoir travaillé la
notion »** : toutes les notions auraient une trace, et le contraste ne déclencherait jamais. Le dépôt
a déjà payé exactement ce défaut sur `production.runner.massimo_is_active` — le commentaire du
fichier le raconte.

### 3. 🔴 UNE SOURCE DE TRACE MANQUANTE FAIT DÉCLENCHER SUR CE QUE ZETIS A DÉJÀ MESURÉ

La trace se lit sur **TROIS** sources en union (spec §3.4 bis), et **aucune n'est facultative** :

| # | Source | Ce qu'elle atteste |
|---|---|---|
| 1 | `SkillMastery(student, skill)` | la notion a été **mesurée** (diagnostic, quiz, mission) |
| 2 | `LearningEvent(skill_id, event_type ∉ NON_WORK_EVENTS)` | **travaillée sans être mesurée** (ELI5, chat, SRS) |
| 3 | `LessonView ⋈ LessonSkill` | **le cours a été lu** |

**Pourquoi `LearningEvent` seul ne suffit pas** — c'est ce que la spec disait, et c'était faux : sur
les **10** appels à `log_learning_event`, **3 seulement** passent un `skill_id`
(`chat/service.py:506`, `eli5/service.py:177`, `memory/service.py:380`). **Le diagnostic n'en fait
pas partie** : `diagnostics/router.py:101` journalise `EVENT_QUIZ_ATTEMPTED` avec le `subject_id`
seul. Une notion mesurée par trois diagnostics antérieurs serait donc « jamais rencontrée », et la
bande apparaîtrait presque à chaque passation.

⚠️ **Et un ordre à ne pas casser, qui vit dans un AUTRE fichier que ton calcul** : ce même
`log_learning_event` est appelé par le **routeur**, *après* le retour de `submit()`
(`diagnostics/router.py:101`, `commit` à `:112`). C'est ce qui empêche la passation de voir son
propre événement. **Le déplacer dans le service casserait le contraste sans toucher au contraste.**
Laisse un commentaire aux **deux** endroits.

---

## SESSION A — le backend apprend à douter

**Périmètre** : la migration, le calcul du verdict, le contrat de `submit`, la route de la
verbalisation. **Aucun front.**

### À LIRE AVANT D'ÉCRIRE

- `apps/backend/app/modules/diagnostics/service.py` — `submit()` (L467), `_upsert_skill_mastery`
  (L556), `score_par_notion` (L607), `resultat_eleve` (L1097), `result_detail` (L1150),
  `latest_results` (L573) ;
- `apps/backend/app/db/models/assessment.py` — `QuizAttempt` (L79) et `QuizAnswer` (L92) ;
- `apps/backend/app/modules/activity/events.py` — **`NON_WORK_EVENTS`, L87** ;
- 🔴 **les trois sources de trace** : `apps/backend/app/db/models/progress.py` — `SkillMastery`
  (L22), `LearningEvent` (L232), `LessonView` (L293) — et
  `apps/backend/app/db/models/school.py` — `LessonSkill` (L168) ;
- 🔴 `apps/backend/app/modules/diagnostics/router.py` — **L101, le `log_learning_event` qui doit
  RESTER dans le routeur** (piège n° 3) ;
- `apps/backend/app/modules/diagnostics/schemas.py` ;
- `docs/backend/fiabilite-de-la-mesure.md` §3 à §6 — **les seuils et les noms de champs sont là**,
  et le **§3.4 bis** porte la règle des trois sources.

### Ce qu'il faut faire

1. **La migration, et elle seule** : `QuizAttempt.reliability_json` (`JSON`, `nullable`).
   Applique-la sur la **vraie** base de dev, pas seulement en fichier.
2. **Le contrat de `POST /submit` gagne des champs OPTIONNELS** (spec §4.1). Un corps qui n'envoie
   que `{question_id, choice_index}` doit continuer à marcher **à l'identique** — c'est ce qui garde
   les tests existants verts.
3. **`QuizAnswer.answer_json` porte les signaux par question** (`ms_reflexion`, `quittee`,
   `enonce_copie`). **Zéro migration** : le champ est déjà un JSON libre.
4. **Le calcul du verdict**, dans un module ou une fonction **nommée pour l'instrument**. Quatre
   faits, deux indices, la règle du §3. 🔴 **Le contraste AVANT la propagation, et sur les TROIS
   sources** (§3.4 bis) — pas une de moins.
5. **`reliability_json` est écrit UNE fois**, avec `regle_version: 1` (spec §5.2). Il n'est **jamais**
   recalculé à la lecture.
6. **`duration_seconds` et `started_at` deviennent réels** (spec §4.2) — c'est dans le périmètre, et
   c'est nommé dans l'ADR Décision 4.
7. **Le verdict est servi à Papa** : sur `result_detail` et sur chaque ligne passée de
   `GET /diagnostics/apercu`. 🔴 **Déclare-le dans les schémas** — protocole point 6.
8. **La route de la verbalisation** :
   `POST /api/diagnostics/mes-resultats/{attempt_id}/explication`, `require_child`, même contrôle
   d'appartenance que `resultat_eleve`. Écrit dans le `answer_json` de la question. **Zéro
   migration.**
9. **Le tirage déterministe de la notion à verbaliser**, dérivé de l'`attempt_id`, servi dans la
   réponse de `submit` **et** de `GET /mes-resultats/{id}` — avec l'explication déjà donnée si elle
   existe.

### Verrous attendus

- 🔴 **Le contraste est calculé avant la propagation.** Sabotage : déplacer le calcul après la
  boucle `_upsert_skill_mastery` → le test doit rougir.
- 🔴 **Le filtre est `NON_WORK_EVENTS`.** Sabotage : le remplacer par `NON_ACTIVITY_EVENTS`, avec un
  décor qui pose un `page_viewed` sur la notion → le test doit rougir.
- 🔴 **LES TROIS SOURCES SONT LUES — un test par source, et un sabotage par source.** Décor : une
  notion connue **par cette source seule**, score 100, et la passation ne doit **pas** déclencher.
  Retirer la source du code → le test doit rougir. Les trois séparément, sans quoi une source
  manquante reste verte grâce aux deux autres.
  ⚠️ Le décor de la source 1 doit poser un `SkillMastery` **préexistant**, pas celui que la
  passation écrit.
- 🔴 **Le `log_learning_event` reste dans le ROUTEUR.** Sabotage : le déplacer dans `submit()` avant
  le calcul → le contraste voit sa propre passation, et le test doit rougir. C'est le piège n° 3, et
  c'est le seul verrou qui protège un ordre vivant dans un autre fichier.
- **Un corps sans aucun champ optionnel marche encore**, et produit `verdict = "rien_a_signaler"`
  (pas `null`) dès lors que le serveur a regardé.
- **`null` n'est pas `rien_a_signaler`** : une passation antérieure garde `null`, et rien ne le
  réécrit.
- **Un fait seul déclenche** ; **deux indices seuls ne déclenchent pas.** Deux tests distincts.
- **Le seuil du contraste** : `>= 2` **et** majorité. Un cas à 1 notion ne déclenche pas.
- **Le verdict ne bouge plus** : relire la passation après avoir changé les seuils ne change pas son
  `verdict`.
- **Le tirage est stable** : deux appels sur le même `attempt_id` rendent la **même** notion.
- **Le contrat sert bien le champ** — test sur la **route**, pas sur le service (protocole point 6).

---

## SESSION B — le front de Massimo observe, puis demande

**Périmètre** : l'observation silencieuse pendant la passation, l'envoi avec les réponses, la carte
« Raconte-moi » sur l'écran de résultat.

🔴 **L'écran de passation ne change pas VISUELLEMENT.** Pas un pixel : ni chrono, ni compteur, ni
avertissement, ni bandeau, ni message. Il gagne des écouteurs, rien d'autre. Un enfant qui se sait
observé ne passe plus le même diagnostic.

### À LIRE AVANT D'ÉCRIRE

- `apps/frontend-massimo/src/pages/DiagnosticPage.tsx` — la passation **et** le bloc `if (result)`
  (L161) ;
- `apps/frontend-massimo/src/lib/diagnostic.ts` — `submitDiagnostic` (L95), `DiagnosticResult` ;
- `apps/frontend-massimo/src/hooks/useDiagnostics.ts` ;
- `packages/types/src/diagnostic.ts` ;
- 🔴 **pour le micro** : `apps/frontend-massimo/src/lib/dictation.ts` (la brique), et surtout
  **`apps/frontend-massimo/src/pages/ChatPage.tsx`** — c'est le **modèle à copier** (import,
  press-to-talk, `Eli5SttUnavailable`), **sauf sur un point** : ChatPage **envoie** la transcription,
  la carte doit la **poser dans le champ**. Regarde aussi comment `hooks/useEli5.ts` la pose dans son
  textarea : c'est ce patron-là qu'on veut ;
- la maquette de Massimo — **ouvre-la**, les libellés exacts y sont, et ses **quatre états** de carte
  (repos · écoute · rempli · **micro absent**) sont ce qu'il faut rendre.

### Ce qu'il faut faire

1. **Un hook d'observation** dédié, monté pendant la passation. Il accumule en mémoire et ne rend
   **rien** à l'écran.
2. **Les mesures de temps sont en `performance.now()`**, jamais `Date.now()` : monotone, immune au
   changement d'heure. **On n'envoie que des durées**, aucun horodatage absolu du client.
3. **Le plein écran est demandé** au clic « Commencer » (c'est le geste utilisateur que l'API exige).
   🔴 **S'il échoue, la passation continue exactement comme avant** — et `signaux_observables`
   l'enregistre. **iOS Safari le refuse sur iPhone**, c'est le cas normal, pas une erreur à afficher.
4. 🔴 **La sortie de plein écran provoquée par l'app à la soumission ne compte pas.** Seules comptent
   les sorties **entre** la première question et le `submit`.
5. **Le payload part avec les réponses**, en une fois (spec §4.1). Aucun nouvel endpoint, aucun flux.
6. **La carte « Raconte-moi »** sur l'écran de résultat, **entre « Tes forces » et « Tes prochaines
   étapes »**. Reprends les libellés de la maquette **mot pour mot** — 🔴 **y compris la phrase de
   permission**, qui est la ligne la plus importante du chantier.
7. **Elle s'affiche à CHAQUE passation**, quel que soit le verdict. 🔴 La conditionner au doute est
   la faute la plus grave possible ici : elle deviendrait l'accusation qu'on s'interdit.
8. **« Passer » est réel**, sans conséquence, et n'est **jamais** transmis comme signal.
9. **Pas d'XP** sur cette réponse — ni sur le texte, ni sur la voix.
10. **LE MICRO** (ADR Décision 5 bis). **Trois imports, zéro backend** — c'est le geste que
    `ChatPage.tsx` fait mot pour mot :
    - `isDictationSupported()`, `startRecording()` ← `src/lib/dictation.ts` ;
    - `transcribeEli5()`, `Eli5SttUnavailable` ← `src/lib/eli5.ts` ;
    - la route `POST /api/ai/eli5/transcribe` **existe** : n'en crée pas, n'en déplace pas.
    🔴 **La transcription atterrit DANS le champ ; elle ne s'envoie pas toute seule.** Patron
    d'**ELI5**, **pas** celui de **ChatPage** (`send(transcript, "voice")`). Massimo doit pouvoir
    corriger ce que Whisper a mal entendu, et la carte n'a **qu'un** chemin de soumission.
    🔴 **Dégradation en SILENCE** : `isDictationSupported()` faux ou **503** → le bouton
    **disparaît**, le champ reste, et **rien** ne s'affiche sur ce qui manque.
    **La limite est 200 caractères, pas 140** — une phrase dite est plus longue qu'une phrase tapée.
10. **En relecture** (`/mes-resultats/{id}`), Massimo **relit** son explication ; on ne la lui
    redemande pas.

### Verrous attendus

- 🔴 **L'écran de passation ne rend aucun élément de temps.** Sabotage : ajouter un compteur visible
  → le test doit rougir. Ce verrou protège une règle `CLAUDE.md`, pas une préférence.
- 🔴 **La carte est rendue même quand le verdict est `rien_a_signaler` ou `null`.** Sabotage : la
  conditionner au verdict → le test doit rougir.
- **La phrase de permission est présente**, avec ses quatre exemples dont « j'ai cherché ». Sabotage :
  la retirer → rouge.
- **« Passer » ne déclenche aucun appel réseau** et ne pose aucun drapeau.
- **La sortie de plein écran de la soumission n'est pas comptée.**
- **Le payload dégrade proprement** : si l'observation est indisponible, `submitDiagnostic` part
  quand même avec ses réponses.
- 🔴 **La transcription remplit le champ et n'envoie rien.** Sabotage : la faire soumettre
  directement (le patron ChatPage) → le test doit rougir. C'est le verrou le plus important du
  micro : il protège **le seul** chemin de soumission de la carte.
- **Le micro disparaît en silence** quand `isDictationSupported()` est faux **et** quand la
  transcription répond 503 — deux tests, et **aucun message** rendu à l'écran dans les deux cas.
- **La limite est 200**, et le compteur dit la vraie longueur.
- ⚠️ **StrictMode** : les écouteurs se posent et se retirent proprement au double-montage. Le dépôt a
  déjà payé ce piège (AudioContext au montage, `cancelled` du chat).

---

## SESSION C — Papa voit, et peut remesurer

**Périmètre** : la bande de fiabilité, la marque du rail, le mot de Massimo dans la station ①, la
prop de présélection de la modale.

### À LIRE AVANT D'ÉCRIRE

- `apps/frontend-papa/src/components/diagnostic/PanneauPassation.tsx` — l'en-tête (L147) et la
  station ① (L180) ;
- `apps/frontend-papa/src/components/diagnostic/RailPassations.tsx` ;
- `apps/frontend-papa/src/components/diagnostic/LancerDiagnosticDialog.tsx` — **L30, le
  `subjects[0]` en dur** ;
- `apps/frontend-papa/src/pages/DiagnosticsPapaPage.tsx` ;
- `packages/types/src/diagnostic.ts` ;
- la maquette de Papa — **ouvre-la**.

### Ce qu'il faut faire

1. **La bande**, entre l'en-tête et `PorteeEscalier`. Elle qualifie la mesure **entière** : elle se
   lit **avant** les nombres, jamais après.
2. **Trois états, pas deux** (ADR Décision 6) : bande ambre · ligne grise « rien à signaler » ·
   **rien du tout** si `null`. 🔴 **Pas de bande verte.**
3. **Faits en ambre, indices en gris**, et la **portée de l'instrument** (« 5 des 6 signaux étaient
   observables sur cet appareil »).
4. **« Remesurer cette matière → »**, et **c'est le seul geste**. Pas de « j'ai vérifié », pas de
   fermeture, pas de masquage.
5. **`LancerDiagnosticDialog` gagne une prop de présélection.** 🔴 Sans elle, le bouton ouvre la
   modale sur `subjects[0]` — le défaut exact que l'`adr-0045 §5` a refusé de livrer.
6. **La marque du rail** : `⚖️ à confirmer`, **ambre jamais rouge**, **le mot écrit à côté du
   symbole**, **sur le troisième cran seulement**.
7. **Le mot de Massimo dans la station ①**, à côté de la notion dont il parle — pas dans la bande,
   qui ne contient que ce que ZETIS a **observé**.

### Verrous attendus

- **Les trois états rendent trois choses différentes.** Sabotage : traiter `null` comme
  `rien_a_signaler` → rouge.
- 🔴 **Aucun libellé ne prend l'enfant pour sujet.** Test-verrou lexical sur les chaînes rendues —
  le dépôt en a un précédent (`adr-0043`).
- **La marque n'apparaît pas sur les crans non passés.**
- **Le geste présélectionne la bonne matière.** Sabotage : retirer la prop → rouge.
- **La bande n'a aucun bouton de fermeture ni de masquage.**
- **La couleur ne porte pas l'information seule** : le mot est présent à côté du symbole.

---

## 🔴 VÉRIFICATION À L'ÉCRAN — OBLIGATOIRE, ET PAR UN HUMAIN

**Sur les DEUX apps.** La bande de Papa et la carte de Massimo sont des surfaces qu'aucun test ne
peut juger, et le dépôt a déjà mergé **cinq fois** sans regarder.

1. ⚠️ **Semer une passation « à confirmer » en dev.** Sans elle, la bande part **non vue** —
   exactement le constat n° 6 de l'`adr-0045`, qui a coûté une moitié d'optimisation. Semer aussi une
   passation `rien_a_signaler` et en garder une à `null` : **les trois états se vérifient ensemble ou
   pas du tout.**
2. ⚠️ **Le plein écran, sur les trois appareils.** Le refus d'iOS Safari sur iPhone est **documenté
   mais non vérifié en vrai**. Si l'appel échoue autrement que prévu, **c'est la portée affichée qui
   ment** — et une portée qui ment est pire que pas de portée.
3. **Lire la bande à voix haute.** Si une phrase peut s'entendre comme un reproche adressé à
   Massimo, elle est à réécrire, même si elle est exacte.
4. **Passer un vrai diagnostic de bout en bout**, sur l'app de Massimo, et vérifier qu'**on ne voit
   rien** de l'observation.
5. 🔴 **Le micro, sur les trois appareils — et pas seulement qu'il s'affiche.** Qu'il enregistre, que
   la transcription revienne, et qu'elle **atterrisse dans le champ sans partir toute seule**.
   ⚠️ Il se masque **en silence** : un micro absent ne se distingue pas d'un micro jamais
   implémenté. **Il faut aller le chercher.**
6. **Le cas STT éteint** (arrêter Whisper → 503) : le champ texte reste, le bouton disparaît, et
   **rien** ne s'affiche sur le service manquant.

## Après la Session C

- `/cloture` — `MEMORY.md`, `CHANGELOG.md`, `TROUBLESHOOTING.md`, carte Graphify.
- **Au `BACKLOG.md`** : l'Accès guidé iOS comme geste de Papa hors code, et le **déménagement de
  `/api/ai/eli5/transcribe`** vers un nom neutre — le micro de la carte en fait le **troisième**
  consommateur d'une route nommée `eli5` (le module `stt` n'a qu'un `provider.py`, aucun routeur).
- ⚠️ **Étape 4bis** — après le merge, revenir tuer la phrase « **Accepté ≠ livré — rien n'est
  implémenté** » dans `DECISIONS.md`, l'ADR et `MEMORY.md`. Celle de l'`adr-0047` est morte dans
  l'heure ; celle de l'`adr-0044` a survécu vingt-quatre heures et a envoyé une session de reprise
  re-cadrer un chantier déjà fait.
