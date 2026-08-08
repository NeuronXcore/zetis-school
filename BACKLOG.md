# BACKLOG.md — Backlog fonctionnel ZETIS

## Priorité P0 — indispensable MVP

### Initialisation projet

- Créer monorepo.
- Créer `apps/frontend-massimo`.
- Créer `apps/frontend-papa`.
- Créer `apps/backend`.
- Créer `docker-compose.yml`.
- Ajouter PostgreSQL.
- Ajouter Redis.
- Ajouter MinIO.
- Ajouter healthchecks.
- Ajouter `.env.example`.

### Frontend Massimo

- Dashboard enfant.
- Sidebar avec : Accueil, Matières, Cours, Révision, Diagnostic, ELI5, Capsules IA, Missions, Quiz, Progression, Mindmaps, Chat ZETIS.
- Page matières.
- Page matière dédiée.
- Page cours. **(FAIT 2026-07-03** : `/subjects/:slug/cours` branchée sur le bouton
  « Cours » de MatiereDetailPage, via les routes élève `GET /api/student/cours/{slug}` et
  `GET /api/student/lessons/{id}/cours` — validé uniquement, filtrage serveur, spec
  `docs/frontend-massimo/page-cours.md`. Reste : XP à la lecture, quiz de fin de cours ;
  notions → skill_mastery.)
- Page quiz.
- Page progression XP.

### Frontend Papa

- Dashboard parent.
- Vue progression Massimo.
- Vue lacunes.
- Vue matières (thèmes/chapitres persistants ; renommée depuis « Matières & programmes » le 2026-07-03).
- Vue diagnostics.
- Cahier de bord IA.
- Paramètres.

### Backend

- Modèles users.
- Modèles school years.
- Modèles subjects.
- Modèles lessons.
- Modèles quizzes.
- Modèles attempts.
- Modèles progress.
- Modèles missions.
- Routes health.
- Routes auth simple.
- Routes subjects.
- Routes lessons.
- Routes quizzes.
- Routes progress.

## Priorité P1 — vraie valeur pédagogique

### Diagnostic

- ✅ Diagnostic initial 5e/4e (QCM générés par IA, par notion).
- ✅ Score par notion (+ upsert maîtrise `skill_mastery`).
- ✅ Priorisation lacunes (`gaps` ouvertes, sévérité medium/high).
- ✅ Génération missions de remédiation depuis les lacunes (étape 15 ; complétion → gap résolue + XP).
- ✅ Réutilisation du diagnostic plusieurs fois dans l’année (re-passation marquée `taken`).
- Diagnostic multi-matières en une session + difficulté adaptative.

### ELI5

- Génération explication simple.
- Questions de compréhension.
- Mode reverse écrit.
- Mode reverse vocal.
- Feedback bienveillant.
- Score compréhension.

### Spaced memory

- Cartes par notion (1–3 par skill via `card_type`, validées par Papa). *(à faire —
  chantier dérivé du cours canonique, ADR-0011)*
- Intervalles de révision. **(FAIT 2026-07-04** : moteur MVP, module `memory`.)
- Prochaine révision. **(FAIT 2026-07-04** : replanification `due_at` selon le rating.)
- Révision automatique dans missions. *(à faire)*
- Page Révision Massimo `/revision` : decks circulaires par matière + mélanges
  (spec `docs/frontend-massimo/page-revision.md`, mockup validé 2026-07-04). *(à faire —
  slice UI ; backend prêt : `GET/POST /api/student/reviews/*`)*
- Plafonds de session serveur (mélange 12 / matière 8 / éclair 5) + entrelacement
  des matières côté serveur. **(FAIT 2026-07-04** : `build_session` + helper pur `interleave`.)
- Popups de fin de session à 3 paliers *(à faire — UI)* + re-tour des cartes fragiles
  (1× max, sans effet SRS, XP réduit, détection consolidation côté serveur). **(Backend
  FAIT 2026-07-04** : consolidation détectée serveur, XP +2 ; le « 1× max » reste côté UI.)
- **Unifier ou renommer les deux `new_count` de `memory`** — `get_reviews_summary()["new_count"]`
  (cartes dues **et** jamais révisées, badge des decks EN PAGE) et `new_cards_count` (jamais
  révisées, témoin de NAVIGATION) portent le même mot pour deux choses. La divergence est
  volontaire, et documentée dans les deux docstrings (ADR-0030 §3) — mais deux fonctions voisines
  au même nom se font fusionner au premier refactor. Un renommage suffirait probablement.
  *(ouvert le 2026-08-01)*

  ### Agenda scolaire (ADR-0025)

- ~~Lot 1 — l'objet~~ : **FAIT (2026-07-29)** — table `agenda_items`, co-édition, bande
  glissante, « ce qui arrive », page Papa, page Massimo. Vérifié à l'écran de bout en bout.
  Deux ajouts non prévus par le cadrage : le frozenset `NON_ACTIVITY_EVENTS` (trois lecteurs de
  `learning_events` n'étaient pas filtrés par `event_type`) et la table `app_settings` (le
  verrou de phase devait être un geste de Papa, pas une variable d'env).
- Lot 1 bis — ouverture de la saisie élève : composer + garde-fou doublon, derrière
  `AGENDA_STUDENT_ENTRY_ENABLED`, + interrupteur côté Papa. *(sur décision, pas sur calendrier —
  revue de la phase 0 à 4 semaines)*
- Lot 3 — l'analyse (ADR-0025 §11) : `chapter_id` + sélection référentiel, panneau d'analyse
  Papa, pont vers le Commander, session de révision sans écriture SRS, quiz blanc.
  *(ne dépend que du Lot 1)*
- ~~Lot 2 — parsing~~ : **supprimé** (ADR-0025 §Périmètre). À rouvrir uniquement si la saisie
  élève est ouverte.

## Priorité P2 — IA avancée

### RAG

- ✅ Import PDF (+ MD/TXT) — `POST /api/rag/upload`.
- ✅ Extraction texte (`modules/rag/extract.py`, pypdf).
- ✅ Chunking.
- ✅ Embeddings (ollama `nomic-embed-text`, 768d).
- ✅ Recherche vectorielle (pgvector cosinus).
- ✅ Validation Papa des sources (`validate`/`reject`, page « Sources de cours »).
- Réponse sourcée dédiée (`/rag/answer` + citations/confiance).
- Stockage du fichier brut (MinIO).
- RAG sur productions de Massimo.

### Capsules IA

- Génération script.
- Storyboard.
- Audio TTS.
- Slides.
- Publication.
- Quiz post-capsule.

### Mindmaps

- Mindmap remplie.
- Mindmap à compléter.
- Reproduction par Massimo.
- Export image/JSON.
- Score de restitution.
- **Suivi de vue réel** — `POST /api/student/mindmaps/{id}/seen` était un **no-op** (ADR-0016) :
  la route existait, la donnée non. **FAIT le 2026-08-01** (ADR-0030 §4) : table `mindmap_views`
  calquée sur `fiche_views`, migration `d2e3f4a5b6c7`, `service.mark_seen` persiste désormais.
  Mindmaps porte son témoin de nouveauté en navigation ; plus aucune famille de dérivés n'en est
  dépourvue.

### ZETIS Galaxy — vue graphe des connaissances (Massimo)

**LIVRÉ le 2026-07-28** — branche `feat/galaxy`, PR à ouvrir. ⚠️ **Ne pas ré-implémenter.**
Décisions : **ADR-0024** (amendé 3 fois en cours de chantier). Spec :
`docs/frontend-massimo/zetis-galaxy.md`. Routes : `API_SPEC.md` §ZETIS Galaxy.
Pièges d'exécution : `MEMORY.md` §Chantier ZETIS Galaxy.

Reste à la charge du user, non vérifiable par l'agent. **MacBook vérifié le 2026-07-28** (fluide
au plafond desktop de 150). Restent l'**iPhone** et l'**iPad** (paliers 40/90 provisoires), et
**`prefers-reduced-motion`** — non exercé, l'option étant désactivée sur la machine du user.

Idée : la page de progression de Massimo rendue comme une galaxie qu'on allume. Étoile = `Skill`,
constellation = matière, amas = chapitre, luminosité = `SkillMastery.status`. **Pas de rouge,
jamais de manque** — une notion non vue est une étoile pas encore née, pas un échec.

Décisions prises (détail et justifications dans l'ADR) :

- **Emplacement** — la Galaxy est la **surface unique** de progression, sur **`/galaxy`** (même
  onglet, renommé « Ma Galaxie » le 2026-07-31 ; `/progression` redirige). La section « par
  matière » **mockée** disparaît. Depuis le 2026-07-31, `/galaxy` s'ouvre sur la **galaxie
  complète, toutes matières** — l'Accueil, lui, n'en porte qu'une **carte-bouton statique** et ne
  charge plus Three.js (addendum ADR-0024).
- **Moteur de rendu** — **`react-force-graph-3d`**, en `lazy()`. Le user a demandé un graphe **3D
  animé, aux nœuds étirables** : `@xyflow/react` (canvas 2D) est techniquement disqualifié. Deux
  moteurs graphe coexistent désormais — React Flow reste celui des mindmaps (ADR-0016, non rouvert).
- **Arêtes** — dérivées de la **structure réelle uniquement** (`Skill ← lesson_skills → Lesson →
  Chapter`). ⚠️ Le read-before-code a montré que **`prerequisite_skill_ids` n'existe pas** et que
  `parent_skill_id` est **NULL partout** : les « liens stellaires » du brouillon n'avaient aucune
  source. Un graphe de prérequis reste possible, mais c'est un chantier pédagogique à part.
- **Contrat API** — `GET /progress/skills` **n'existe pas** et `progress` est Papa-only. Trois
  routes élève neuves sous `/api/student/galaxy`, assises sur `evidence.mastery_by_skill()`.
  Aucune table, **aucune migration**.
- **Clic sur une étoile** → panneau d'actions. ⚠️ Seul ELI5 est notion-adressable par URL
  aujourd'hui, d'où une troisième route dédiée. Une action sans contenu validé **n'est pas
  proposée**.
- **Doctrine** — l'ADR fige rétroactivement : pas de rouge, **aucun score ni pourcentage par
  matière** (un **compte** d'étoiles allumées), **aucun capital perdable** (pas de streak, une
  étoile allumée ne s'éteint pas).

Prompts prêts : `prompts/claude-code/prompt-galaxy-slice-a-backend.md` (backend, zéro migration)
puis `prompt-galaxy-slice-b-frontend.md` (Massimo).

Risques connus, à surveiller : poids de Three.js (~600 Ko-1 Mo, isolé par `lazy()`) et **perf 3D
sur le poste le plus contraint** — Massimo travaille sur **iPhone, iPad et un MacBook dédié à
l'école**, et ce sont les deux derniers qui donnent son sens à une vue 3D. Plafond de nœuds
**adaptatif** (compact 40 / tablette 90 / desktop 150, valeurs **provisoires non mesurées**) et
repli sans WebGL prévus, **à essayer sur les trois appareils réels**.

Reste ouvert (hors v1) : graphe de prérequis, aperçu sur l'Accueil, annonce « +1 étoile » en fin de
mission, animation temps réel, et la **réconciliation de `docs/frontend-massimo/navigation.md`**
(autre brouillon du même stash, qui décrit une nav à 5 verbes contredite par les 12 entrées réelles).

## Priorité P3 — polish

- Animations gaming sobres.
- Avatar ZETIS.
- Onde vocale.
- Sons de feedback.
- ✅ Badges (étape 16 : XP, niveaux, streak, badges — affichés côté Massimo).
- Mode focus.
- Version iPhone optimisée.

## Priorité P4 — extension

- Accès distant sécurisé.
- Multi-enfant.
- Multi-parent.
- Exports PDF.
- Notifications.
- App iOS native.
- Mode SaaS éventuel.

## Dettes nommées — consignées, non traitées

> Ouvertes le **2026-08-07** au cadrage puis au read-before-code de l'**ADR-0042** (la notion
> orpheline devient équipable). Aucune n'est traitée par ce chantier : elles sont écrites ici
> pour exister ailleurs que dans une conversation.

### Nées du cadrage (les trois du §7 du prompt)

- **`recent_evolution` du Conseil de classe est une surface d'hallucination.** Champ `str` **non
  nullable** dans `CouncilReportSpec`, alors qu'aucune source ne pouvait le produire — l'ADR-0020
  s'annote lui-même « comparatif = slice 2 », et le `period` du Conseil n'est qu'un libellé qui ne
  sélectionne aucune donnée. Le producteur remplit **parce que le type l'y oblige**.
  ⚠️ **Fait nouveau** : `skill_mastery_history` existe (migration `a9b8c7d6e5f4`) et
  `evidence.mastery_transitions()` la lit déjà — **le champ est devenu calculable**.
  🔴 Le champ est **figé** dans chaque rapport persisté (`subjects_json`) : tant qu'il n'est pas
  typé, **chaque Conseil archive une tendance inventée**, rétroactivement indiscernable du vrai.
  *(L'ADR-0040 a décrit la correction ; vérifier ce qui en a réellement été livré avant de
  reprendre — cette ligne dit le problème, pas l'état d'avancement.)*
- **La page Paramètres ne dit pas que le diagnostic et le Conseil restent manuels.** Ils ne sont
  ni parmi les deux classes libres ni parmi les quatre verrouillées — **ils ne sont pas des
  classes du tout**. Papa qui lit « Autonom » n'a **aucune surface** qui l'en informe.
  Précédent de traitement à reprendre : le quiz, repêché en **note de pied de panneau, hors
  matrice**.
- **La double écriture des appels générateurs `equip_notion` / `equip_piece`.**
  Les deux blocs d'imports paresseux sont **byte-identiques** (`equipment.py:195-199` et
  `:362-366`) et les cinq générateurs sont appelés deux fois. Dette **assumée en commentaire**
  (`equipment.py:341-347`) : l'addendum ADR-0031 interdisait de toucher l'orchestrateur.
  Divergences déjà constatées entre les deux copies : `on_piece` n'existe que dans `equip_notion`
  (donc un lot-pièce n'écrit jamais `run.current_piece`), la comptabilité `skipped` du cours
  diffère, et `equip_piece` rend `reason=None` même quand `errors` est peuplé.
  → à extraire **dans son propre chantier, sous contre-épreuve** — jamais au détour d'un ajout.

### Nées du read-before-code de l'ADR-0042

- 🔴 **Défaut latent : tête-de-liste contre parcours de liste.** `runner.py:300` et
  `equipment.py:65` prennent `lecons[0]` ; `canonical_context.py:94-101` **parcourt** toute la
  liste. Si la leçon la plus récemment touchée est un brouillon sans cours et qu'une plus
  ancienne est validée avec cours, la production dit `BLOCKED_COURSE_MISSING` pendant que le
  résolveur dit `has_course=True`. **C'est le défaut du 2026-08-03 avec l'ordre inversé.**
  `test_le_cas_observe_ne_bloque_plus` ne fixe **que** l'orientation qui passe : la fixture
  miroir n'est pas testée. **La plus sérieuse des quatre.**
- **`_validated_lesson_or_409` est écrit en trois exemplaires** — `quizzes/service.py:70`,
  `fiches/service.py:63`, `mindmaps/service.py:76` — identiques au nom près de la pièce. C'est
  la forme de défaut que l'ADR-0037 a supprimée ailleurs, laissée debout ici. Le troisième
  message (`content_markdown` vide) est **byte-identique** dans les trois : une divergence y
  serait silencieuse.
- **Collision de vocabulaire sur « orphelin ».** `coverage.orphans()` désigne des **dérivés dont
  la leçon est archivée** (`coverage.py:513`) ; `curriculum.orphan_notions()` désigne des
  **notions sans leçon**. Deux sens, un mot, deux modules — et `totals["orphan_count"]` compte
  le premier.
- **Deux lignes de documentation fausses**, sources de croyances déjà payées :
  `DATA_MODEL.md:168` annonce un `prerequisite_skill_ids optional` sur `Skill` — **la colonne
  n'existe pas** (ni table de liaison ; le vrai champ est `parent_skill_id`, NULL sur les 432
  lignes, jamais écrit) ; `API_SPEC.md:1214-1215` affirme que le `has_referentiel` de
  `/progress/analysis` est « **la même** » définition que celle du dashboard — **c'est faux** :
  `dashboard._referentiel_subjects` compte des **chapitres**, `progress.analysis._referentiel`
  compte des **leçons**, et `progress/overview.py:51` **importe** la version du dashboard (donc
  le partage est 2 contre 1, pas 1 contre 1). Aucun test n'assied l'accord entre `analysis` et
  les deux autres.
- **Le docstring de `lesson_resolution.active_year` sous-compte ses propres copies.** Il annonce
  « sept copies privées » ; il y a **treize** résolutions côté lecture (quatre sont *inline*
  plutôt que des helpers nommés — `curriculum` en a **deux** à lui seul), plus une côté écriture.
  Et **5 des 13 sont scopées par élève, 8 ne le sont pas** : elles ne s'accordent que parce que
  `school/service.py:89-92` impose globalement qu'une seule année soit `active`. **Invariant
  porteur et non documenté au niveau du modèle.**
- **`lessons.chapter_id` a une FK sans `ON DELETE`, et `school.py` ne déclare aucune
  `relationship()`.** Donc ni cascade SQL ni cascade ORM : `delete_chapter`
  (`curriculum/service.py:443-446`) lève un `IntegrityError` non capté — **500 latent** sur tout
  chapitre encore porteur de leçons. Même chose pour le chemin de régénération
  (`service.py:218`). Contraste : `lesson_skills` porte bien `ondelete="CASCADE"`.
- **Le chapitre orphelin n'est toujours pas rétro-attribué, et le plancher a son trou.** La porte
  de création est fermée (`subjects/service.py:224`), mais `id=10` « Les fractions » existe
  encore, et **16 des 17 consommateurs** laissent tomber un chapitre non rattaché **en silence**
  (INNER JOIN sur `SchoolYearSubject`). ⚠️ **Le trap est vivant** : Papa peut créer une leçon
  sous ce chapitre (`create_manual_lesson` ne vérifie que l'existence), la valider, et lancer un
  lot dessus (`scope.py:61` joint par `chapter_id` **sans portée d'année**) — pendant que la
  galaxie, `/cours`, la couverture et la progression agissent comme s'il n'existait pas.
  **`review_queue/service.py:81-117` est le seul module qui le traite correctement** (`outerjoin`
  + `or_` + `COALESCE`) : c'est le patron à reprendre. Aucun script de backfill n'existe.

### Nées de la confrontation du mockup Diagnostic v2 au code (2026-08-08)

> Trouvées en préparant la refonte de la page Diagnostic. **Aucune n'est un défaut de maquette** :
> ce sont des écarts du module `diagnostics`, mis au jour parce que le mockup, lui, était
> réfutable. Le mockup v3 (`docs/frontend-papa/mockup/`) en tient compte ; le code non.

- 🔴 **AUCUNE route `diagnostics` n'exige de rôle.** Les six utilisent `Depends(get_current_user)`
  seul (`diagnostics/router.py:29,39,61,68,78,100`), alors que `require_parent` / `require_child`
  existent (`auth/deps.py:32`, `:48`) et que l'`API_SPEC.md` annote pourtant « (Papa) » / « (Massimo) »
  par route. Conséquences : **n'importe quel compte authentifié peut lancer une génération LLM**,
  et surtout **peut SOUMETTRE un diagnostic à la place de Massimo** — ce qui écrase `SkillMastery`
  (signal fort, écrasement brut) et ouvre des `Gap` sur une mesure fausse. **La plus grave de la
  liste.**
- 🔴 **Aucune fermeture de lacune par un bon diagnostic.** `diagnostics/service.py` n'écrit jamais
  `Gap.status = "resolved"` ni `resolved_at`. Une notion qui remonte de 40 % à 95 % **laisse sa
  lacune ouverte**. Le seul chemin qui referme une lacune est le verdict `acquired` d'une mission.
- 🔴 **La dédup de `Gap` ne lit que `"open"`** (`service.py:246`), alors que la définition canonique
  est `OPEN_GAP_STATUSES = ("open", "in_progress")` (`progress/service.py:31`), dont le commentaire
  dit « cette définition vivait en quatre exemplaires […] les trois autres importent désormais
  celui-ci ». **`diagnostics` ne l'importe pas.** Dès que Papa lance une mission (la lacune passe
  `in_progress`), le diagnostic suivant crée une **seconde ligne ouverte** sur la même notion.
- **`existing.severity = severity` sans condition** (`service.py:251`) — escalade **et
  désescalade** silencieuses, sans horodatage. À comparer avec `chat/service.py:225-226`, qui
  refuse explicitement toute escalade d'une lacune existante par du déclaratif.
- **Les lacunes affichées ne sont pas lues en base.** `_per_skill_for_attempt` (`service.py:439-442`)
  les **recalcule** depuis les réponses de la passation. Une lacune résolue continue donc de
  s'afficher, à jamais — alors que le docstring `service.py:379` promet « lacunes **ouvertes** ».
- **Deux `AIJob` par génération** : `travaux.enfiler` (`travaux.py:211`) en crée un, puis
  `generate_diagnostic` (`service.py:92`) en crée un second, même `job_type`. Tout compteur
  d'activité de production **compte double**.
- **Le diagnostic mesure toujours les 8 MÊMES notions** — `select(Skill).where(subject_id)
  .order_by(Skill.id)[:MAX_SKILLS]` (`service.py:72-74`) : les 8 plus petits `id`, c'est-à-dire les
  8 premières insérées. Aucune rotation, aucun tirage, aucune priorisation des notions fragiles.
  **Sur ~280 notions au catalogue**, une passation ne dit rien des autres. `MAX_SKILLS` est un
  littéral de module, pas un réglage de `config.py` — contrairement à ses voisins
  `mission_command_max_skills` / `mission_champion_max_skills`.
- **`QUESTIONS_PER_SKILL = 2`** (`service.py:36`) ⇒ un score par notion ne peut valoir que
  **0, 50 ou 100**. Et si le LLM n'en rend qu'une (rejet silencieux des malformées, `service.py:124`),
  une notion peut être déclarée **lacune grave sur une seule question ratée**.
- **Aucun filtre de leçon, de niveau ni d'année active** dans la sélection des notions. Le
  paramètre `level` de la requête **ne restreint rien** — il n'alimente que le prompt
  (`service.py:116`). Et `list_subjects` ne filtre que `Subject.is_active`, jamais
  `SchoolYearSubject` : le menu peut proposer des matières hors programme.
- **`_status_from_score` existe en quatre exemplaires** — `diagnostics/service.py:42`,
  `quizzes/scoring.py:27` (dupliqué **volontairement**, motif écrit), et **deux fois en ligne** dans
  `DiagnosticsPapaPage.tsx:14` et `:120`, avec des bornes réduites à 70/40. Conséquence : le palier
  **`mastered` (≥ 90) n'existe pas à l'écran** — une notion à 95 % et une à 72 % s'affichent
  identiques, alors que `progress/service.py:13-15` défend explicitement l'inverse
  (« *"consolidé" doit vouloir dire acquis, pas "presque"* »). Le champ `status` est pourtant
  transmis (`schemas.py:60`) et **jamais lu**.
- **`completed_at` est transmis et jamais affiché** (`DiagnosticsPapaPage.tsx`) : deux diagnostics
  de la même matière sont **indistinguables** à l'écran.
- **Pas d'endpoint détail d'une passation** (`GET /results/{attempt_id}` n'existe pas) ;
  `GET /results` est plafonné à **10** en dur, sans pagination ni filtre ; `GET /quizzes` fait un
  **N+1** (2 requêtes par ligne, `service.py:199-200`).
- **`severity="low"` n'est jamais émise** par le diagnostic (`service.py:52-53` est binaire), alors
  que le modèle la déclare et que le chat l'utilise. Un filtre à 3 sévérités aurait une catégorie
  toujours vide.
- **Deux lignes de doc fausses** : `API_SPEC.md:250-251` annonce un corps synchrone
  `{quiz_id, subject, questions_count}` alors que la route rend **202** + un travail ; et
  `routeLabels.ts:21` mappe **`/diagnostic`** (singulier) alors que la route réelle est
  **`/diagnostics`** — le libellé ne matchera jamais.

## Bugs / risques à surveiller

- **Tenue de la 3D sur les trois appareils de Massimo — dette OUVERTE et devenue critique le
  2026-07-31.** Le plafond de nœuds a été supprimé (il cachait sa progression selon la taille de
  son écran) et remplacé par trois gardes qualitatives. Depuis le même soir, `/galaxy` rend la
  galaxie **complète** et l'**Accueil** en monte une seconde. **L'iPhone tranche** : il doit tenir
  les deux. La mesure doit se faire sur un **pire cas semé** — référentiel validé complet,
  plusieurs centaines de notions — et non sur les ~37 étoiles d'aujourd'hui.
  ⚠️ Si ça ne passe pas, ce sont les **particules** qui tombent (budget déjà en place), **jamais
  les nœuds** : remettre un plafond rouvrirait l'addendum « Galaxie animée » §1.
- **Lisibilité de `/galaxy` à plusieurs centaines de notions — jamais vue en vrai.** Les rayons
  des trois anneaux (150 / 260 / 370) et la part de secteur occupée (78 %) sont des
  **suppositions**, pas des mesures. Réponse prévue si ça ne tient pas : un **niveau de détail
  adaptatif** (notions révélées au-delà d'un certain zoom) — à ne **pas** décider avant d'avoir
  regardé.

- Trop de pages avant le cycle pédagogique complet.
- Données mockées qui ne sont jamais reliées au backend.
- IA utilisée sans traces ni sources.
- UI Papa trop complexe.
- UI Massimo trop infantilisante ou trop chargée.
- Gamification addictive.
- Capsules trop coûteuses en temps de rendu.
- **La bascule en phase 1 n'arrive jamais** : si Papa remplit correctement, personne ne ressent
  le besoin de changer et l'agenda reste une liste imposée (risque produit n°1). Revue à date
  fixée, pas « quand il sera prêt ».
- **Phase 0 : la qualité de l'agenda dépend à 100 % de la régularité de Papa.** Un dimanche
  soir sauté = page vide toute la semaine, aucun filet.
- **Session pré-contrôle (ADR-0025 §11.2)** : le non-scheduling existe (`is_consolidation`,
  même jour seulement) mais il manque un deck `{chapter}` et l'extension hors du même-jour.
  Sans ces deux ajouts, une révision avant contrôle **reprogrammerait** les cartes et
  dégraderait la mesure d'oubli sur des mois. Slice dédiée dans le Lot 3.
- Un compteur d'items non faits réintroduit par l'UI (côté Papa comme côté Massimo) →
  contournerait par l'affichage l'invariant tenu serveur (`agenda_item_missed` n'existe pas).