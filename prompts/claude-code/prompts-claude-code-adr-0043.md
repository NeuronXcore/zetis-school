# Prompts Claude Code — chantier ADR-0043 (page Diagnostic)

> **Trois sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code neuve, **après `/slice`**. Entre deux sessions : le geste git de clôture, puis celui
> d'ouverture de la suivante.
>
> 🔴 **PRÉREQUIS BLOQUANT — l'`adr-0043` est en statut `Proposé`.** Il **amende l'`adr-0014`
> Décision 2**, une décision figée. Tant qu'il n'est pas passé en `Accepté` par le commanditaire,
> **aucune de ces sessions ne démarre**. `/ouverture` doit s'arrêter si ce n'est pas le cas.
>
> Prérequis matériel, en deux gestes (`docs/WORKFLOW.md` §2bis, `/ouverture` §1 et §3) :
>
> 1. sur **`main`** : `docs/decisions/adr-0043-*.md`, la ligne de `DECISIONS.md`, la spec
>    `docs/frontend-papa/page-diagnostic.md` et la maquette
>    `docs/frontend-papa/mockup/mockup-papa-diagnostic-v3.html`.
>    ⚠️ `DECISIONS.md` ne va **JAMAIS** sur une branche — deux branches qui l'éditent = conflit
>    garanti ;
> 2. sur **`feat/diagnostic-mesure-qui-engage`** : ce fichier de prompts, commité **en premier**.
>
> Les prompts référencent ces documents par leur chemin et n'en recopient pas le contenu : la
> re-spécification dans un prompt crée une seconde source qui dérive.

---

## Protocole commun aux trois sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index du dépôt avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de la liste « À LIRE AVANT D'ÉCRIRE » avant
   d'écrire une ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. L'ADR-0043 a été
   écrit sur un read-before-code daté du 2026-08-08 : le code a pu bouger, et plusieurs de ses
   constats sont des mesures, pas des lois.

3. Stop-on-blocker. Si une lecture contredit l'ADR ou la spec, ARRÊTE-TOI et remonte la
   contradiction. N'improvise pas une résolution. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, table, route et composant.

6. ⚠️ PIÈGE DE TEST DU DÉPÔT, déjà payé plusieurs fois.
   conftest.py INTERDIT toute connexion Redis et remplace les FABRIQUES de file par une FakeQueue.
   → Patcher `enqueue_*` est VERT ET SANS EFFET (import au niveau module) : le point de greffe
     est LA FABRIQUE.
   → `generate_diagnostic` part par `travaux.enfiler` : tout test de génération porte sur L'APPEL,
     jamais sur l'exécution.

7. 🔴 TOUT TEST-VERROU SE VÉRIFIE PAR SABOTAGE. Casse la règle, observe le test rougir, remets.
   Un verrou non saboté ne vaut rien — c'est arrivé quatre fois dans ce dépôt, dont une fois où
   le verrou central était VERT sur un sabotage.

8. Checklist de clôture (9 points) :
   fichiers touchés · migrations · routes nouvelles · requêtes nouvelles · suites de tests
   (backend / Papa / Massimo, avant → après) · tsc -b et vite build · vérifié à l'écran (par qui,
   sur quelles données) · docs mis à jour · résidus et dettes assumées.
```

---

## SESSION A — le gate

**Branche** : `feat/diagnostic-mesure-qui-engage`, créée depuis un `main` à jour.

C'est la session qui **change un contrat**. Elle passe en premier parce que tout le reste s'appuie
sur elle, et parce qu'elle touche des décisions figées.

### À LIRE AVANT D'ÉCRIRE

- `docs/decisions/adr-0043-*.md` — Décisions 1, 2 et 8
- `docs/decisions/adr-0014-moteur-quiz-unifie.md` — **Décision 2 en entier**, c'est elle qu'on amende
- `apps/backend/app/modules/review_queue/service.py` — `KINDS`, `_family_query`, les deux conventions de statut
- `apps/backend/app/tests/test_review_queue.py` — surtout `test_les_quiz_ne_sont_JAMAIS_dans_la_file`
- `apps/backend/app/tests/test_production_coverage.py` — `test_system_is_reserved_to_quizzes`
- `apps/backend/app/db/models/assessment.py` — `Quiz`, et le commentaire qui explique `validated_by='system'`
- `apps/backend/app/modules/diagnostics/router.py` et `service.py` — les six routes, `list_diagnostics`
- `apps/backend/app/modules/auth/deps.py` — `require_parent`, `require_child`

### CE QU'IL FAUT FAIRE

1. **Migration** — `quizzes.validation_status` (`pending|validated|rejected`, défaut `pending`).
   🔴 **Backfill des lignes existantes à `validated`.** Les déclarer `pending` rétroactivement
   fabriquerait une file de relecture inventée sur du contenu déjà servi.
2. **`/relecture` accueille une 6ᵉ famille : `diagnostic`.** Pas « quiz ».
3. **`list_diagnostics` filtre `validation_status == 'validated'`** — c'est le gate de service.
4. **Les rôles** : `require_parent` sur `generate` et `results`, `require_child` sur `submit`.
5. **Un diagnostic relu porte `validated_by='parent'`**, jamais `system`.

### 🔴 LES DEUX VERROUS À REFORMULER — PAS À SUPPRIMER

C'est le cœur du risque de cette session.

- **`test_les_quiz_ne_sont_JAMAIS_dans_la_file`** doit devenir « les quiz de **mission** et de
  **fin de cours** ne sont jamais dans la file ». Il se reformule sur `quiz_type`, pas sur la table.
  ⚠️ Il porte déjà un anti-test-à-vide (`assert validation["count"] == 1`) : **garde-le**, et
  ajoute le symétrique — le décor doit contenir un diagnostic `pending` **et** un quiz de mission,
  et la file doit rendre l'un sans l'autre.
- **`test_system_is_reserved_to_quizzes`** se **resserre** : `system` reste interdit hors du module
  `quizzes`, et devient interdit **sur un diagnostic**. Sans lui, une auto-validation future s'y
  déguiserait — c'est écrit dans son propre motif.

> ⚠️ Ce test-là scanne les fichiers `app/modules/**/*.py`. Il est **lexical** : une simple mention
> de `validated_by` dans un commentaire le déclenche. Piège déjà payé sur l'`adr-0042`.

### TEST-VERROU CENTRAL DE LA SESSION

**Un diagnostic non relu n'est servi par AUCUNE route élève.** Sabotage à jouer : retire le filtre
de `list_diagnostics`, le test doit rougir.

### CONTRE-ÉPREUVE

Le parcours d'un **quiz de fin de cours** ne change en rien : ni sa génération, ni son service, ni
son absence de `/relecture`, ni son `validated_by='system'`.

### HORS PÉRIMÈTRE DE LA SESSION A

La page · `QUESTIONS_PER_SKILL` · la sélection des notions · les lacunes lues en base · les onze
défauts du `BACKLOG.md`.

---

## SESSION B — la mesure

**Ce qu'on mesure et comment on le rend.** Aucune ligne de frontend.

### À LIRE AVANT D'ÉCRIRE

- `docs/decisions/adr-0043-*.md` — Décisions 3, 4, 5 et le §Constat 6
- `apps/backend/app/modules/diagnostics/service.py` — **en entier**, en particulier
  `generate_diagnostic`, `submit`, `_per_skill_for_attempt`, `latest_results`, `_upsert_gap`
- `apps/backend/app/modules/quizzes/service.py` — `complete_attempt`, pour voir la **3ᵉ** copie de
  l'agrégat par notion
- `apps/backend/app/db/models/progress.py` — `SkillMastery`, `SkillMasteryHistory`, `Gap`
- `apps/backend/app/modules/progress/service.py` — `OPEN_GAP_STATUSES`

### CE QU'IL FAUT FAIRE

1. **`QUESTIONS_PER_SKILL` : 2 → 5.**
2. **La sélection des 8 notions devient explicite** — par ancienneté de mesure
   (`SkillMastery.last_seen_at`), les jamais mesurées d'abord. Le nombre reste 8.
3. **Les lacunes sont LUES en base** (`gaps`, `source='diagnostic'`), plus recalculées depuis les
   réponses de la passation.
4. **Endpoint de détail d'une passation** — il n'en existe aucun aujourd'hui.
5. **Le pivot de comparaison** — par notion, sur les passations d'une matière.

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**L'agrégat « score par notion » est DÉJÀ ÉCRIT TROIS FOIS** : `submit()`,
`_per_skill_for_attempt()`, et `quizzes.complete_attempt()`. Ils divergent déjà (l'un fait
`round(correct/total*100)` sans garde, l'autre teste `if data["total"]`).

**En écrire un quatrième est la faute que l'`adr-0037` nomme.** La cible est d'**extraire**
`_per_skill_for_attempt` et de le réutiliser pour le pivot.

### ⚠️ CE QUI EST VRAI ET CONTRE-INTUITIF

- **La comparaison est calculable pour le PASSÉ** — mais depuis `quiz_answers`, jamais depuis
  `SkillMastery` (écrasé) ni `skill_mastery_history` (n'écrit qu'au changement de statut).
- **`submit()` écrit une réponse par question, y compris NON RÉPONDUE.** C'est ce qui rend le
  dénominateur par notion complet et la comparaison honnête. Ne « optimise » pas ça.
- **La granularité restera MIXTE pour toujours** : les passations d'avant ont 3 valeurs possibles,
  celles d'après en ont 6. Le contrat doit permettre à la page de le dire.

### TESTS EXIGÉS

- le pivot sur des passations à **granularité mixte** (une à 2 questions, une à 5) ;
- une lacune **résolue** ne s'affiche plus comme ouverte ;
- la sélection ne reprend pas deux fois de suite la même notion quand une autre est plus ancienne.

### HORS PÉRIMÈTRE DE LA SESSION B

La page · la fermeture automatique des lacunes · la dédup de `Gap` sur `"open"` seul · la
`severity` écrasée · le double `AIJob` — **tous au `BACKLOG.md`, aucun ne se traite ici**, même en
passant à côté.

---

## SESSION C — la page

**Branche identique.** Refonte de `DiagnosticsPapaPage.tsx` (149 lignes aujourd'hui).

### À LIRE AVANT D'ÉCRIRE

- `docs/frontend-papa/page-diagnostic.md` — **la spec, en entier**
- `docs/frontend-papa/mockup/mockup-papa-diagnostic-v3.html` — **ouvre-la dans un navigateur**,
  clique les 7 entrées du rail et les 4 états de la modale
- `apps/frontend-papa/src/pages/DiagnosticsPapaPage.tsx` — ce qu'on remplace
- `apps/frontend-papa/src/components/CouvertureIcon.tsx` — **le précédent de l'icône**
- `apps/frontend-papa/src/pages/CouverturePage.tsx` — la page de référence pour la densité Papa
- `packages/ui` — `SubjectFilterChips`, `ProgressBar`, `ConfirmDialog`

### CE QU'IL FAUT FAIRE

La spec fait foi. Les points que la maquette porte et qui se perdent facilement :

1. **Palier et Lacune sont DEUX colonnes**, jamais dérivées l'une de l'autre.
2. **Le vocabulaire produit** — `acquise` / `en cours` / `à renforcer` / `non abordée`.
   ⚠️ **Lis `status` du payload**, ne le recalcule pas : la page actuelle le reçoit et l'ignore,
   ce qui fait disparaître le palier `acquise` (≥ 90) de l'écran.
3. **La portée est un ESCALIER**, jamais une courbe lissée.
4. **Les deux badges de lacune sans contenu** — « aucune leçon » (→ produire) et « cours en
   brouillon » (→ valider) — ne se confondent pas. C'est l'`adr-0042` qui les a séparés.
5. **La station ③ dit la raison** de son vide, elle ne l'exprime pas comme un regret.
6. **Aucun score avant le 3ᵉ cran** du témoin.

### L'ICÔNE DE PAGE

`assets/brand/icons/ZETIS-Diagnostic.png` — 1254 px, **1,7 Mo**.

Reprends **exactement** le patron de `CouvertureIcon.tsx`, il porte trois pièges déjà payés :

- **une réduction** `apps/frontend-papa/src/assets/app/ZETIS-Diagnostic_256.png` est embarquée,
  pas l'original (l'affichage le plus grand fait 56 px) — cf. `assets/brand/README.md` §Règle ;
- **un composant unique** est le point de définition : sidebar, en-tête de page et tout relais en
  tirent la même image. Trois `<img src=…>` recopiés se désynchronisent au premier changement ;
- 🔴 **`rounded-[22%]` n'est pas décoratif** : le PNG est **opaque**, fond noir aplati jusqu'aux
  bords. Sans arrondi, quatre coins noirs se découpent sur le bleu nuit de la page ;
- le halo qui respire **uniquement sur l'en-tête** : à 20 px dans la sidebar, il devient un
  clignotement parasite.

### TESTS EXIGÉS

- **test-verrou** : la page **n'affiche aucun score** pour un diagnostic non passé ;
- **test-verrou** : palier et lacune ne se dérivent pas l'un de l'autre — une notion « à renforcer »
  sans lacune ouverte s'affiche correctement ;
- le palier `acquise` apparaît pour une notion ≥ 90 ;
- état vide, et état à une seule passation (la portée est remplacée par son absence expliquée).

### 🔴 VÉRIFICATION À L'ÉCRAN — OBLIGATOIRE, ET PAR UN HUMAIN

Le dépôt compte **quatre merges d'affilée sans relecture visuelle humaine** (#79, #89, #91, #98).
Cette session ne se clôt pas sur des tests verts.

À parcourir : les 7 états du rail · les 4 états de la modale · l'état vide · le responsive ·
l'icône sur fond sombre (coins) · la portée à granularité mixte.

### HORS PÉRIMÈTRE DE LA SESSION C

La page Diagnostic **de Massimo** · `routeLabels.ts` (`/diagnostic` singulier ≠ route
`/diagnostics`) — c'est au `BACKLOG.md` · le multi-enfant · le T0 sur les prérequis.

---

## Après la Session C

- `MEMORY.md` à la clôture : dettes survivantes, pièges payés, prochain pas.
  **Les débats post-chantier vont au `BACKLOG.md`, pas dans `MEMORY.md`.**
- `API_SPEC.md` §Diagnostics — il est **déjà périmé aujourd'hui** (il annonce un corps synchrone
  alors que la route rend 202).
- `DATA_MODEL.md` sous `Quiz` — la colonne `validation_status`.
- L'`adr-0043` passe de `Proposé` à `Accepté`, et sa spec perd sa section
  « Ce que l'ADR doit trancher ».
- ⚠️ **La branche `feat/notion-orpheline-equipable` reste conservée** (consigne du 2026-08-07) —
  elle n'est pas celle de ce chantier, ne pas la confondre ni la supprimer.
