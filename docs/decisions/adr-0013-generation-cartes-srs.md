# ADR-0013 — Génération et cycle de vie des cartes de révision (SRS)

## Statut

Accepté — **livré 2026-07-05** (proposé 2026-07-04 ; cf. addendum en fin de doc pour les
endpoints réels et les actions de pilotage ajoutées). **Contrat arrêté après maquette validée** (surface = page
Papa « Cartes SRS », génération explicite par matière, aperçu recto/verso,
réconciliation des orphelines visible) : prêt pour acceptation Papa. Les décisions
§1–§4 et les alternatives écartées constituent le contrat que les deux slices
(backend `memory` + page Papa) implémentent.

> S'appuie sur : `adr-0011` (résolveur `resolve_canonical_context` + convention de
> prompt à deux sections — le SRS en est un **client**, il ne réécrit rien) ;
> addendum `adr-0009` §A (cours validé = source canonique des dérivés, gate
> `status='validated'`) ; `adr-0007` (pipeline génération structurée `fmt` + 1
> réparation + trace `ai_jobs`) ; `adr-0008` (tâches pédagogiques quotidiennes =
> 100 % local). Ne modifie aucune de ces décisions.
>
> Prérequis livrés : moteur SRS + endpoints de révision (module `memory`, backend
> et page Massimo `/revision`). Il ne manque que **le remplissage du réservoir de
> cartes** — sans cette brique, la page affiche « tout est frais » en permanence.

## Contexte

`SpacedReviewCard` porte un `student_id` : une carte n'est **pas** un objet du
référentiel partagé (comme `Skill` ou `Lesson`), c'est un objet **de l'élève**,
au même titre que `SkillMastery` ou `CapsuleView`. Elle transporte la
planification de Massimo (`interval_days`, `ease_factor`, `due_at`,
`last_reviewed_at`, `status`) — un historique de révision durement acquis carte
par carte.

Le contenu, lui (`front_markdown`, `back_markdown`, `card_type`), dérive d'une
notion. Conformément à l'ADR-0011, ce contenu doit venir du **cours canonique** :
le recto/verso d'une carte s'extrait du `content_markdown` de la leçon validée
rattachée à la skill (via `LessonSkill`), pas de la connaissance brute du modèle
ni du RAG seul. Le SRS est le dernier dérivé listé au §A de l'addendum ADR-0009 à
consommer le substrat — le premier fut ELI5 v2.

Quatre questions de câblage restent ouvertes, dont une seule ouvre une vraie
alternative de conception (la régénération). Les trois autres découlent de
principes déjà actés ailleurs.

## Décision

### 1. Déclencheur : une page Papa « Cartes SRS », génération explicite par matière

Une `Skill` n'a pas de `validation_status` (ADR-0010) ; ce qui se valide, c'est la
**leçon** (`Lesson.status: draft → validated`). La génération part donc **des
leçons validées** — mais elle n'est **pas** un effet de bord automatique de la
validation. Elle est une **action Papa explicite**, depuis une **page dédiée
« Cartes de révision »** (sidebar Papa), alignée sur le pattern déjà établi pour
les capsules (dérivé du cours piloté par Papa, pas génération cachée).

> Arbitrage tranché (2026-07-04) : **page seule**, pas d'auto-génération à la
> validation. Cohérence de mental model — tous les dérivés du cours sont soit à la
> demande (ELI5), soit pilotés explicitement par Papa (capsules, cartes) ; aucun
> n'est un side-effect silencieux. Le coût assumé : une leçon validée n'a pas de
> cartes tant que Papa n'a pas généré depuis la page — acceptable pour un usage
> mono-parent qui curate activement, et cohérent avec le geste « je publie vers la
> révision » des capsules.

**La page répond à une question distincte de la page Programme** : Programme
répond à « le référentiel est-il correct ? » (structure, cours, validation) ; la
page Cartes SRS répond à « qu'est-ce que Massimo révise, et est-ce sain ? » (état
des cartes par notion). Séparation identique à Années scolaires ↔ Programme
(ADR-0009 §4) : une page = une question. La page Cartes SRS **consomme** les
leçons validées (via l'API), elle ne les édite jamais — corriger un cours se fait
dans Programme.

**Granularité de génération : par matière.** Chaque matière ayant des notions à
générer expose un bouton « Générer les N » dans son en-tête (condition d'affichage
`nb_à_générer > 0`, calculée par une fonction pure testée — même patron que
« Proposer des leçons » de la page Programme). Génération séquentielle des notions
de la matière, progression visible. Pas de bouton global tout-matières : le lot
par matière borne la charge LLM à une unité mentale cohérente et donne un point de
contrôle entre chaque.

Endpoints (Papa, rôle parent) : `POST /api/memory/cards/generate` corps
`{ subject_id }` (génère/rafraîchit les cartes des skills des leçons validées de
la matière) ; `POST /api/memory/cards/skills/{skill_id}/generate` (une notion, pour
« générer »/« relancer »/« régénérer » unitaire). Asynchrone, trace `ai_jobs` ;
un échec sur une skill n'avorte pas les autres (liste partielle, comme la passe 2
curriculum).

Portée par élève : les cartes sont créées **pour chaque profil élève actif**
(aujourd'hui Massimo seul ; le mécanisme ne présume pas le mono-élève, il boucle
sur les profils).

### 2. Contenu = dérivé du cours canonique (ADR-0011, zéro réécriture)

La génération consomme `resolve_canonical_context(skill_id)` puis
`build_canonical_sections(ctx)` — exactement comme ELI5 v2. Le prompt (versionné,
`app/prompts/srs_cards.py`, `v1`) demande au modèle **local** (ADR-0008 : tâche
pédagogique quotidienne, pas de dérogation cloud) de produire 1 à 3 cartes par
skill, en sortie structurée `fmt` + 1 réparation, chaque carte typée par
`card_type` (`definition | method | example | error_correction`).

- Cascade de dégradation héritée du résolveur : cours validé → RAG → modèle. Si
  aucun cours validé n'existe encore pour la skill, la carte est générée depuis
  le RAG/modèle — mais voir §4, elle n'atteint alors pas Massimo sans relais.
- Trace `ai_jobs` type `srs_cards_generate`, `output_json` portant
  `lesson_id`/`lesson_title` quand un cours canonique a servi (traçabilité
  uniforme ADR-0011). Invariant vie privée testé : le prompt ne contient aucune
  donnée de Massimo — seulement le contenu de la notion et du cours.

### 3. Contenu et planification vivent sur deux dimensions orthogonales ; la régénération réconcilie en trois branches

**C'est le cœur de l'ADR.** Rafraîchir le contenu d'une carte ne doit **jamais**
toucher sa planification. Mais « régénérer un cours » recouvre trois situations
distinctes selon ce qu'il advient des skills de la leçon — l'upsert doit les
traiter séparément :

**Clé métier de la carte : `(student_id, skill_id, card_type)`.**

- **A · notion toujours couverte** (skill présente avant et après) → **update du
  seul `front_markdown`/`back_markdown`** ; `interval_days`/`ease_factor`/
  `due_at`/`last_reviewed_at` **intacts**. Cas le plus fréquent (Papa affine une
  formulation). C'est le principe « l'upsert préserve l'historique » de l'ADR-0009
  §2, appliqué aux cartes : le contenu est réécrit, la progression est sacrée.
- **B · notion nouvellement couverte** (skill apparue dans le nouveau contenu) →
  **création** de la/les carte(s) manquante(s) (`interval_days=0`, `due_at=now`,
  active — due immédiatement).
- **C · notion abandonnée** (une carte existe pour une skill que **plus aucune
  leçon validée** ne couvre) → la carte devient **orpheline** : elle passe
  `status` non-actif (suspendue), est retirée des sessions par le filtrage serveur
  de `build_session`, mais **conserve toute sa planification**. Elle **n'est jamais
  supprimée** (supprimer jetterait l'historique — la régression du §Alternatives).
  Si une autre leçon validée vient couvrir cette skill, `resolve_canonical_context`
  la retrouve et la carte est **réactivée** en place au prochain rafraîchissement.

> ⚠️ La condition d'orphelinage n'est **pas** « absente de la leçon régénérée » :
> `LessonSkill` est N-N, une skill peut être portée par plusieurs leçons. La
> condition correcte est « **plus aucune leçon validée ne couvre la skill** »,
> ce que le résolveur ADR-0011 sait déjà répondre. La réconciliation interroge le
> résolveur, jamais le diff d'une seule leçon.

**On ne supprime jamais une ligne `SpacedReviewCard`** dans aucune des trois
branches. La planification de Massimo est structurellement à l'abri des
ré-éditions de cours de Papa — réécrite, suspendue ou réactivée, mais jamais
réinitialisée ni détruite.

### 4. Validation : la carte hérite de la validation de sa leçon source ; l'aperçu remplace toute file de validation

Règle de sécurité absolue du projet : rien n'atteint Massimo sans validation Papa.
Une carte est du contenu qui atteint Massimo — mais elle **n'ouvre pas une
nouvelle file de validation**. Elle hérite du gate qui existe déjà :

- La page ne génère **que depuis des leçons validées** (§1) : par construction,
  une carte dérive d'un cours validé par Papa. La validation du cours canonique
  *est* la validation de la carte (cohérent avec l'ADR-0011 : le cours fait foi).
- `SpacedReviewCard` ne reçoit **pas** de colonne `validation_status`. Le contrôle
  d'exposition à Massimo est déjà fait en amont : la carte n'existe que parce
  qu'une leçon validée l'a engendrée.
- **Contrôle qualité par aperçu, pas par validation carte à carte.** La page
  expose un aperçu recto/verso de chaque notion générée (bouton « voir »). Papa
  relit d'un coup d'œil ce que Massimo va réviser ; s'il n'aime pas, il régénère
  (contenu réécrit, planification préservée — §3 branche A). C'est ce qui
  **justifie l'absence de file de validation dédiée** : Papa a déjà validé le
  cours source, l'aperçu lui suffit à contrôler le dérivé. Une file « valider
  chaque carte » doublerait le travail pour un gain nul (cf. §Alternatives).
- Cas dégradé fortement réduit par la page : comme la page ne propose la
  génération que sur des leçons validées, le chemin « générer sans cours validé »
  n'existe quasiment plus dans le flux nominal. Il subsiste comme garde-fou : si
  une génération produit malgré tout une carte non adossée à un cours validé (skill
  couverte uniquement par une leçon repassée `draft` entre-temps), la carte est
  marquée `status` **non-actif** et **filtrée côté serveur** de `build_session` —
  aucune carte non adossée à un contenu validé n'atteint l'élève.

## Alternatives considérées

### Régénération : préserver / versionner / remplacer

C'est la seule dimension qui ouvrait un vrai choix.

- **Remplacer (supprimer + recréer)** — le naïf. Simple à coder, mais **détruit
  l'historique de révision** de Massimo à chaque re-validation de leçon.
  Inacceptable : c'est la régression pédagogique décrite au §3. → Écarté.
- **Versionner (nouvelle carte, ancienne archivée)** — chaque régénération crée
  une nouvelle `SpacedReviewCard`, l'ancienne passe `archived`. Préserve
  l'historique *à la lecture* mais **repart de zéro pour la planification** (la
  nouvelle carte est due immédiatement) et gonfle la table de doublons quasi
  identiques. Complexité (quelle version est « la » carte de la skill ?) sans
  bénéfice pédagogique — l'intervalle acquis est perdu tout autant. → Écarté.
- **Upsert en place (retenu)** — la ligne survit, seul le contenu est réécrit, la
  planification est préservée par construction. Zéro doublon, historique intact,
  clé métier claire `(student, skill, card_type)`. → **Retenu** (§3).

### Carte orpheline (notion quittée par tout cours validé)

Le cas C du §3 — que faire d'une carte dont plus aucune leçon validée ne fonde le
contenu ?

- **Laisser active** (ne rien faire — le comportement d'un upsert naïf qui ne
  touche que les skills présentes) : Massimo continuerait à réviser une notion que
  son cours actuel ne couvre plus, avec un contenu figé qui ne correspond plus au
  référentiel. Incohérence silencieuse. → Écarté.
- **Supprimer** : jette l'historique de révision (même régression que « remplacer »
  ci-dessus), et fait le pari que la disparition est définitive — alors qu'une
  autre leçon peut couvrir la skill, ou que Papa réédite temporairement. → Écarté.
- **Suspendre, planification conservée (retenu)** : la carte sort des sessions
  (filtrage serveur) sans rien perdre ; réactivable en place si un cours revient la
  couvrir. Réversible, non destructif, honnête vis-à-vis de Massimo. → **Retenu**
  (§3, branche C).

### Déclencheur : auto à la validation vs page explicite

- **À la génération de `content_markdown`** (`lesson_content`) : trop tôt — le
  contenu est encore `draft`, non relu par Papa. Générer des cartes depuis un
  cours non validé viole le §4. → Écarté.
- **Auto-génération en effet de bord de la validation de leçon** : zéro corvée
  pour Papa (valider une leçon crée ses cartes), mais **side-effect silencieux** —
  les échecs de génération, les cartes orphelines (§3 branche C) et les cartes du
  cas dégradé n'ont alors **aucune surface où Papa les voit ni les relance**. Rend
  les modes d'échec invisibles ; incohérent avec les autres dérivés (ELI5, capsule)
  qui ne sont jamais des side-effects. → Écarté.
- **Page « Cartes SRS » explicite, génération par matière (retenu)** : surface
  dédiée où l'état de chaque notion est visible (à jour / à générer / échec /
  suspendue), où Papa génère/relance/réconcilie, et où l'aperçu remplace la file de
  validation. Aligne le SRS sur le pattern capsule (dérivé piloté par Papa). Coût :
  le deck peut retarder sur les validations récentes tant que Papa n'a pas généré —
  assumé (§1). → **Retenu** (§1).

### Validation : file dédiée vs héritage

- **File de validation dédiée aux cartes** (Papa relit chaque carte) : cohérent
  avec la règle de sécurité mais **redondant** — Papa a déjà validé le cours dont
  la carte dérive mot pour mot. Double le travail de validation pour un gain nul,
  et créerait une page de pilotage de plus. → Écarté.
- **Héritage de la validation de leçon (retenu)** : la carte est sûre parce que
  sa source l'est. Zéro nouvelle surface de validation. → **Retenu** (§4).

## Conséquences

### Positives

- La page `/revision` se remplit enfin : depuis la page Cartes SRS, Papa génère
  les cartes des leçons validées et alimente les decks de Massimo. Le circuit
  référentiel → cours → SRS est
  bouclé.
- **Zéro migration** : `SpacedReviewCard` existe déjà avec toutes ses colonnes
  (le moteur SRS est livré). L'upsert n'exploite que l'existant.
- Cohérence totale des dérivés : ELI5, SRS (et bientôt quiz, mindmap) racontent la
  même histoire que le cours, via le même résolveur ADR-0011.
- La planification de Massimo est structurellement à l'abri des ré-éditions de
  cours de Papa.

### Négatives / coûts

- Valider une leçon déclenche N appels LLM (1 par skill de la leçon) — asynchrone,
  latence assumée comme pour la génération de leçons/capsules.
- Les cartes créées en cas dégradé (`pending`, sans cours validé) sont invisibles
  pour Massimo jusqu'à ce qu'un cours les adosse : comportement correct mais qui
  peut surprendre Papa (« j'ai généré des cartes, l'enfant ne les voit pas »). À
  expliciter dans l'UI de pilotage quand elle existera.
- Le `card_type` est choisi par le modèle : une skill peut recevoir 3 cartes du
  même type si le cours s'y prête mal. Borné par le prompt (few-shot variant les
  types), affiné au fil de l'eau — pas bloquant.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; note sous `SpacedReviewCard` dans
  `DATA_MODEL.md` (« alimentée par génération à la validation d'une leçon,
  ADR-0012 ; upsert `(student, skill, card_type)` préservant la planification ») ;
  ajout de `srs_cards_generate` à la liste des `job_type` de `AIJob`.
- **Slice backend** : prompt `app/prompts/srs_cards.py` (v1), service de
  génération (consomme `resolve_canonical_context`), hook sur la validation de
  leçon + endpoint manuel, filtrage serveur des cartes `pending`/suspendues,
  tests offline. **Test-verrou central de réconciliation (les trois branches)** :
  (A) régénérer avec la même skill → contenu mis à jour, `due_at`/`interval_days`
  strictement inchangés ; (B) skill nouvelle → carte créée, due maintenant ;
  (C) skill quittée par tout cours validé → carte suspendue (hors session) mais
  ligne conservée avec sa planification, puis **réactivée** quand une leçon
  validée re-couvre la skill. Plus : cas dégradé → carte `pending` non servie ;
  invariant vie privée.
- **Deux slices** (méthodo : ADR → maquette validée → prompt) :
  - *Backend* : prompt `app/prompts/srs_cards.py` (v1), service de génération dans
    le module `memory` (consomme `resolve_canonical_context`, upsert réconciliateur
    à 3 branches), endpoints `POST /api/memory/cards/generate` (par matière) et
    `.../skills/{skill_id}/generate` (unitaire), lecture d'état des cartes par
    matière/notion pour la page, réconciliation des orphelines (suspendre /
    réactiver / retirer). Tests offline (test-verrou 3 branches, cf. ci-dessus).
  - *Frontend Papa* : page « Cartes de révision » (sidebar), maquette validée
    `mockup-papa-cartes-srs.html` (2026-07-04) — thème émeraude, arbre
    matière→chapitre→notion, KPI, génération par matière, aperçu recto/verso,
    section suspendues actionnable. `packages/types/src/reviews.ts` étendu (types
    de pilotage Papa, distincts des types élève déjà livrés).
- **Ordre dans la file** : brique suivante du chantier SRS, après la page
  `/revision` (livrée). Peut précéder ou suivre la Slice A-bis (ancrage RAG) —
  indépendantes ; l'ancrage améliorera la qualité des cartes générées sans cours,
  mais n'est pas bloquant.
- Commit backend suggéré :
  `feat(memory): SRS card generation from canonical course on lesson validation`.

## Addendum — livré (2026-07-05)

Écarts assumés vs le contrat initial, tous **non destructifs** et cohérents avec l'invariant
§3 (le contenu change, la planification jamais) :

- **Endpoints réels** (préfixe `/api/memory/cards`, `require_parent`, cf. `API_SPEC.md`) :
  génération **par matière** via `POST /subjects/{id}/generate` (et non `/cards/generate`),
  unitaire via `POST /skills/{id}/generate` ; lectures `GET /overview`, `GET /subjects/{id}`,
  `GET /skills/{id}/cards` ; réconciliation `POST /skills/{id}/reactivate`,
  `DELETE /skills/{id}` (retrait de toutes les cartes d'une notion).
- **Bouton « ↻ Régénérer » par matière** : affiché même quand `to_generate = 0` (rien à
  générer) pour relancer la réconciliation de toute la matière — réécrit le contenu, préserve
  la planif. Utile après édition d'un cours. Une **barre de progression estimée (%)** est
  affichée pendant la génération (patron partagé `ProgressBar` + `useEstimatedProgress`).
- **Édition / suppression à la carte** (correction manuelle Papa, dans l'aperçu recto/verso) :
  - `PATCH /{card_id}` — édite recto/verso d'**une** carte, planification préservée (§3).
  - `DELETE /{card_id}` — supprime **une** carte + ses attempts (distinct du `DELETE /skills/{id}`
    qui retire toute la notion). L'UI confirme via `ConfirmDialog`.
- **Surface Massimo** : `GET /api/student/reviews/summary` renvoie désormais **toutes** les
  matières avec un booléen `has_cards` (matière sans carte = grisée « pas encore de cartes »,
  emoji affiché) — cf. `docs/frontend-massimo/page-revision.md`.
