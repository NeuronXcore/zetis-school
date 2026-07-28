# ADR-0014 — Moteur de quiz unifié (formats, correction, doctrine de validation)

## Statut

Accepté — 2026-07-05. **ADR clôturé** — Lot 1 (moteur backend `quizzes`, page Papa
« Quiz — pilotage », client Massimo) **et Lot 2** (format `open` jugé par LLM local, critère
par critère, garde-fous bénéfice du doute / ambiguïté remontée à Papa) implémentés et vérifiés
live (Ollama réel). `open` reste hors du mix auto-généré : opt-in manuel de Papa (Décision 3).

> S'appuie sur : `adr-0009` (§3 co-construction, §9 filtrage serveur du validé),
> `adr-0011` (substrat canonique partagé — le quiz en devient le deuxième client
> après ELI5 v2), `adr-0007` (pipeline sortie structurée + 1 réparation + traces).
> Régularise a posteriori un précédent de fait créé à l'étape 14 (diagnostic) —
> voir Décision 2.

## Contexte

Le schéma anticipe déjà quatre contextes de quiz (`quiz_type` : `diagnostic`,
`mission`, `revision`, `capsule_post_test` ; `context` sur `QuizAttempt`) et cinq
types de question (`question_type` : `mcq`, `short_answer`, `open`, `ordering`,
`matching`). Seul le diagnostic est implémenté (étape 14) : QCM choix simple
générés par IA par notion, dans `app/modules/diagnostics`.

Trois quiz arrivent dans la file : fin de cours (backlog page Cours), révision
espacée (Phase 7), post-capsule (Phase 8). Sans décision, chaque chantier
recréera son générateur — trois duplications de la même mécanique.

Deux questions n'ont jamais été tranchées par écrit :

1. **Validation** : la règle « seul du contenu validé par Papa atteint Massimo »
   (adr-0009 §9) — or l'étape 14 sert des QCM générés à Massimo sans relecture
   question par question. Précédent pragmatique, doctrine jamais formalisée.
2. **Formats** : besoin exprimé (Papa) — QCM choix simple, QCM choix multiples,
   questions à réponse écrite. La vraie ligne de partage entre formats n'est pas
   leur apparence mais leur **mode de correction** : déterministe (code pur,
   testable) ou par LLM (jugement, risque d'injustice envers l'enfant).

## Alternatives considérées

- **Un générateur par contexte** : duplication de la génération, du parsing, de
  la persistance et des garde-fous ; divergences inévitables de qualité et de
  ton. Contraire au pattern adr-0011 (une résolution, N clients). → Écarté.
- **Validation Papa question par question avant service** : cohérente avec le
  gate des cours, mais intenable en bande passante — un quiz de révision
  quotidien × plusieurs matières = des dizaines de questions/jour à relire.
  Tuerait l'usage. → Écarté au profit d'une validation par échantillonnage
  (Décision 2).
- **Banque de questions rédigée manuellement** : effort massif, contraire au
  choix « questions générées, pas de banque figée » acté à l'étape 14 (le
  `FakeLLMProvider` couvre les tests offline). → Écarté (l'édition manuelle
  reste possible en complément, co-construction oblige).
- **Correction LLM généralisée dès le premier lot** : mélangerait dans un même
  chantier un risque maîtrisé (qualité de génération) et un risque nouveau
  (justesse du jugement) — calendrier et tests incomparables. → Écarté au
  profit d'un découpage par famille de correction (Décisions 3 et 4).

## Décision

1. **Un service partagé, quatre intentions.** Un module unique
   `quiz_generation` (génération LLM → validation Pydantic → 1 réparation →
   persistance `Quiz`/`QuizQuestion`, traces `ai_jobs`) consommé par chaque
   contexte. Ce qui varie par contexte : le substrat injecté, le volume/la
   difficulté demandés, et le poids du score (Décision 6). Le service est le
   **deuxième client de `resolve_canonical_context`** (adr-0011) : un quiz de
   fin de cours ou de révision se génère depuis le `content_markdown` d'une
   leçon `validated`, jamais depuis la seule connaissance du modèle.
   **Déclenchement par Papa** : la génération d'un quiz de fin de cours est une
   action explicite depuis la page de pilotage (une leçon validée → **0..N
   quiz**, le premier via ⚡ Générer, les suivants via « + Nouveau quiz » —
   cycle de vie complet en Décision 3), requête longue avec progression
   estimée (pattern capsules/
   cours). Massimo n'attend jamais une génération : le quiz existe ou le
   bouton n'apparaît pas côté élève. Corollaire : Papa peut relire avant le
   premier passage — la validation par échantillonnage (Décision 2) devient
   une relecture *possible* en amont, pas seulement a posteriori. La
   génération **en lot** (« générer les quiz manquants (N) », séquentiel,
   annulable, arrêt à la première erreur — pattern rédaction des cours) est
   reportée à une slice ultérieure. Moteur
   **local** exclusivement — la dérogation cloud reste `curriculum_*`
   (adr-0009 addendum 1), un quiz est un dérivé, cas d'usage local typique.

2. **Doctrine de validation : apprentissage vs évaluation éphémère.** Le gate
   de validation (`status='validated'`, relecture Papa) s'applique au **contenu
   d'apprentissage** — cours, capsules, toute référence que Massimo lit et
   retient. Les **questions de quiz** sont du contenu d'évaluation éphémère :
   dérivées d'un substrat déjà validé, elles sont servies sans relecture
   unitaire, en contrepartie de trois garanties : (a) traçabilité complète
   (`ai_jobs` + `lesson_id`/`lesson_title` source dans `output_json`, comme
   adr-0011) ; (b) passe d'auto-vérification à la génération (Décision 5) ;
   (c) inspection a posteriori côté Papa avec retrait d'une question
   défectueuse (la question retirée sort des tirages, les tentatives passées
   restent intactes). Validation *par échantillonnage* plutôt que *par gate*,
   assumée. Ceci régularise le précédent de l'étape 14 (diagnostic) sans le
   modifier.

   **Traçabilité de la non-relecture (addendum ADR-0011 §F, 2026-07-28)** : un quiz
   servi sans gate porte désormais `validated_by='system'` — la valeur est
   **strictement réservée** à ce cas, seul contenu que la présente décision sort du
   gate. Un test dédié garantit qu'aucun autre chemin ne l'écrit, faute de quoi une
   future auto-validation pourrait s'y déguiser sans ADR. La page « Couverture de
   production » rend cette provenance visible par objet — sans jamais la totaliser ni
   en faire une relance (§F.2).

3. **Lot 1 — famille à correction déterministe (sept formats).** La correction
   est du code pur, testable, sans IA au moment de la correction :
   `mcq` (choix simple, existant), `mcq_multi` (choix multiples),
   `true_false`, `cloze` (texte à trous), `numeric` (réponse courte fermée —
   mot, nombre, date — avec fonction de normalisation : casse, accents,
   espaces, tolérance numérique `3,14` ≈ `3.14`), `ordering`, `matching`.
   Extension de l'enum `question_type` (+ `mcq_multi`, `true_false`, `cloze`,
   `numeric`) ; `choices_json`/`correct_answer_json` absorbent toutes les
   structures — **aucune nouvelle table**. Arbitrages de format :
   - `mcq_multi` : score **tout-ou-rien** par question, avec feedback case par
     case dans `explanation_markdown` (le score partiel produit des fractions
     illisibles, le malus est anxiogène — contraire à CLAUDE.md) ;
   - `true_false` : réservé aux tirages en volume (révision), jamais seul pour
     juger une maîtrise (50 % au hasard) ;
   - `difficulty` (1-5) rempli à la génération dès le Lot 1, non exploité
     algorithmiquement (la difficulté adaptative reste reportée — on annote
     maintenant pour ne pas ré-annoter plus tard).

   **Mix de formats et paramètres de génération** : le choix des formats est une
   décision pédagogique dépendante du contenu — c'est le **générateur** qui la
   prend, sous les règles du prompt versionné (formats adaptés au contenu,
   variété obligatoire, vrai/faux jamais majoritaire, 2-3 bonnes réponses max
   en `mcq_multi`). Papa paramètre au clic **le volume** (court ≈ 5 / normal
   ≈ 8 questions) et **la difficulté** (⭐/⭐⭐/⭐⭐⭐ → `difficulty`) — précédent
   exact des capsules (durée/difficulté). Pas de contrainte de formats par
   matière en V1 (préférence à observer sur de vrais quiz avant de la coder).
   Le format `open` (Lot 2) ne rentrera **jamais** dans le mix automatique :
   opt-in explicite de Papa (il change la nature de la correction).

   **Co-construction et cycle de vie (CRUD)** : une leçon validée porte
   **0..N quiz** — ⚡ Générer crée le premier, « + Nouveau quiz » en ajoute
   (généré ou **manuel**, badge IA/Manuel, symétrie chapitres/leçons). Papa
   peut : **éditer** un quiz (titre) et ses questions (prompt, choix, clé,
   explication — formulaire par type) ; **ajouter une question manuelle** à un
   quiz existant ; **régénérer** (↻ remplace les questions `generated`,
   **préserve les `manual`** — règle des chapitres appliquée aux questions) ;
   **supprimer** un quiz (hard delete si aucune tentative, **archivage**
   sinon — les `quiz_attempts` portent l'historique de maîtrise, on n'efface
   jamais ce qui porte de l'histoire). Une question éditée par Papa devient
   `manual` (elle survit aux régénérations). Impact schéma — premier écart
   assumé au « zéro migration » : deux colonnes sur `quiz_questions`,
   `source` (`generated` | `manual`) et `status` (`active` | `retired`) — la
   seconde étant de toute façon requise par le retrait (Décision 2c).

4. **Lot 2 — réponse écrite ouverte (correction par LLM), chantier séparé.**
   Format `open` : une à trois phrases libres, jugées par le moteur local
   contre des **critères générés avec la question** (points attendus,
   persistés dans `correct_answer_json`). Garde-fous non négociables : le juge
   évalue critère par critère (résultat structuré dans `ai_evaluation_json`,
   jamais une note globale opaque) ; en cas d'incertitude du juge, le bénéfice
   du doute va à l'élève et l'ambiguïté remonte à Papa ; le feedback est
   toujours formateur et bienveillant (vocabulaire CLAUDE.md — jamais
   « faux »). Lot séparé car il introduit un mécanisme nouveau (le jugement)
   avec ses propres tests de calibrage. `short_answer` (jugé par LLM) est
   remplacé par la paire `numeric` (fermé, Lot 1) / `open` (libre, Lot 2) —
   valeur d'enum conservée mais non utilisée par le générateur.

5. **Passe d'auto-vérification à la génération.** Après génération, chaque
   question à correction déterministe est resoumise **à l'aveugle** (sans la
   clé) au modèle ; si sa réponse diverge de la clé annoncée, la question est
   écartée (question ambiguë ou clé fausse — le risque n°1 d'un QCM généré en
   local). Coût : ~2× l'inférence de génération, assumé en local (temps, pas
   d'argent) ; candidat naturel au futur moteur rapide (adr-0008). Le taux
   d'écart est tracé dans `ai_jobs.output_json` (indicateur de santé du
   modèle).

6. **Scoring pondéré par contexte (fonction pure, testée).** Le résultat d'un
   quiz alimente `skill_mastery` avec un poids dépendant du contexte :
   - `diagnostic` : signal **fort** — upsert maîtrise + ouverture de `gaps`
     (comportement étape 14, inchangé) ;
   - `mission` (fin de cours) : signal **faible** — l'effet de récence gonfle
     le score ; ajuste la confiance, **n'ouvre jamais une lacune à lui seul**
     (règle DATA_MODEL « la maîtrise ne doit pas être basée sur un seul
     quiz », enfin codée) ;
   - `revision` : signal le plus précieux pour la mémoire — le score se
     traduit en rating de la `SpacedReviewCard` (pont Phase 4 → Phase 7) ;
   - `capsule_post_test` : signal faible, même règle que `mission`.

**Hors périmètre explicite** : flashcards auto-notées (Again/Hard/Good/Easy —
appartiennent au chantier mémoire espacée, pas au moteur de quiz) ; formats
visuels (schéma à légender — exigent un substrat image inexistant) ; difficulté
adaptative (reportée, inchangé).

## Conséquences

### Positives

- Les trois quiz de la file (fin de cours, révision, post-capsule) deviennent
  des **consommations** du moteur : un intent + un branchement scoring chacun.
- Migration **minime** : deux colonnes sur `quiz_questions` (`source`,
  `status`) + extension d'enum — le reste absorbé par les colonnes JSON
  existantes, sobriété `TECH_STACK.md`.
- La doctrine de validation (Décision 2) est écrite une fois pour toutes ; les
  futurs dérivés évaluatifs (mindmap à compléter, reverse ELI5 noté) pourront
  s'y référer au lieu de rejouer le débat.
- La passe d'auto-vérification produit un indicateur de qualité du moteur local
  gratuit (taux de questions écartées par matière) — utile pour piloter la
  migration adr-0008.

### Négatives / coûts

- Doublement du coût d'inférence à la génération (auto-vérification) — assumé
  en local.
- Le tout-ou-rien du `mcq_multi` est sévère pour les questions à 4+ bonnes
  réponses ; mitigation par le prompt (2-3 bonnes réponses max par question).
- La normalisation de `numeric` est un nid à cas limites (unités, fractions,
  notations) ; périmètre initial volontairement strict (nombre, mot, date),
  extension au fil des besoins réels.
- Le Lot 2 reste un pari sur la capacité du moteur local à juger équitablement
  une réponse d'enfant — le découpage permet de l'abandonner ou le différer
  sans toucher au Lot 1.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` (« ADR-0014 — moteur de quiz unifié ») ;
  note dans `DATA_MODEL.md` sous `QuizQuestion` (enum étendu, colonnes `source`
  + `status`, sémantique `numeric`/`open`, doctrine Décision 2 en pointeur) et
  sous `Quiz` (0..N par leçon, suppression = archivage si tentatives) ; note
  dans `API_SPEC.md`
  section Quiz (endpoints génériques à spécifier au premier client).
- **Ordre dans la file** : après clôture du chantier référentiel en cours
  (mono-chantier). Premier client d'implémentation : **quiz de fin de cours**
  (exerce à la fois le substrat canonique et le scoring « signal faible »).
- **Slices** : (1) module partagé + formats Lot 1 + auto-vérification + tests ;
  (2) **page Papa « Quiz — pilotage »** (spec dédiée
  `docs/frontend-papa/page-quiz-pilotage.md`,
  maquette validée d'abord) : **action « Générer le quiz »** par leçon validée
  sans quiz (requête longue, progression estimée ; le lot « générer les N
  manquants » est reporté), inventaire filtrable matière × `quiz_type` avec
  leçon source navigable, inspection avec clés et explications visibles
  (asymétrie serveur : Massimo ne reçoit jamais les clés), action de retrait
  (Décision 2c), indicateur du taux d'écart de l'auto-vérification par matière
  (Décision 5) — les résultats de l'élève restent hors périmètre (déjà couverts
  par la vue diagnostics et le dashboard) ; (3) client fin de cours côté
  Massimo (page Cours : bouton quiz visible uniquement si un quiz existe —
  filtrage serveur) ; (4) Lot 2 (`open`) — chacun avec
  prompt Claude Code dédié,
  read-before-code sur `LLMRequest`/`LLMResponse` et sur
  `resolve_canonical_context` réels.
- Commit suggéré (slice 1) : `feat(quizzes): unified quiz generation engine
  (deterministic formats, self-check pass)`.
