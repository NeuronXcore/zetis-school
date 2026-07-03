# ADR-0009 — Référentiel de programme scolaire (génération LLM en deux passes, co-construction Papa/IA)

## Statut

Accepté — 2026-07-03 (bench T4 exécuté ; §7 tranché : issue (b), dérogation cloud
étroite). Initialement Proposé le même jour, §7 suspendu aux résultats du bench.

> S'appuie sur : `adr-0007` (pattern spec typé + sortie structurée `fmt` + 1 réparation),
> `adr-0008` (production 100 % locale, cloud = yardstick de benchmark, `bench_llm.py`),
> `adr-0006` (pipeline RAG `pending` → validation Papa). Ne modifie pas
> `adr-0004` (embeddings/pgvector inchangés).

## Contexte

Besoin exprimé (Papa) : en sélectionnant une année scolaire (collège ou lycée), ZETIS doit
connaître le **programme officiel** — matières, chapitres, puis pour chaque chapitre les
leçons et notions. Ce référentiel alimente les consommateurs existants : diagnostics,
lacunes, missions, maîtrise (`skill_mastery`), et désormais les capsules
(`capsules.chapter_id`) et le tagging de `zetis-clip`.

Réalités du programme français qui contraignent le design :

- **Collège** : programmes définis **par cycle** (cycle 4 = 5e/4e/3e, BO du 30 juillet
  2020), pas par classe. La granularité annuelle n'est officielle que via les « repères
  annuels de progression » (français, maths, EMC) ; ailleurs, la répartition 5e/4e/3e est
  une interprétation (établissements, manuels).
- **Lycée** : programmes par classe (2de/1re/Tle) et par voie, avec la distinction tronc
  commun / spécialité / option — le statut d'une matière dépend du niveau (ex. SES).
- Les programmes évoluent (réforme 2026 en cours de déploiement) : `programme-4eme.md`
  interdit déjà de hardcoder le programme.

État de l'existant (`DATA_MODEL.md`) — déterminant pour la décision :

- `Chapter` est **scopé à l'année** (`school_year_subject_id`) et porte des attributs de
  progression temporelle (`period`, `status: planned|active|completed|skipped`).
- `Skill` est **persistant** (scopé matière, `level`, prérequis) et porte tout l'historique
  de maîtrise. C'est de facto la couche référentielle du modèle.
- `Lesson.created_by: parent | ai | imported` et `status: draft | validated | archived`
  existent déjà — la co-construction est à moitié dans le modèle.
- `LearningObjective` (chapter_id, label, `source_reference`) existe, inutilisée.
- `SchoolYear.mode: ai_auto | hybrid | manual` existe, sans backend ni UI.

Contraintes projet : validation humaine avant tout contenu structurant (`CLAUDE.md`),
traces `ai_jobs` + prompts versionnés, sobriété (`TECH_STACK.md`), séparation
Massimo/Papa, aucune donnée de l'enfant envoyée à un tiers (`SECURITY.md`).

## Décision

### 1. Génération LLM en deux passes descendantes, jamais en cascade

- **Passe 1 — chapitres** : entrée = (niveau, matière, version de programme) ; sortie =
  liste structurée de chapitres (libellé, description, ordre indicatif). Générée **par
  matière** (sorties courtes → meilleure validité de schéma, validation Papa digestible).
- **Passe 2 — leçons + notions** : entrée = un chapitre **validé** (ou manuel) ; sortie =
  leçons et notions rattachées. Déclenchée **chapitre par chapitre**, à la demande —
  jamais automatiquement sur toute l'année.
- Mécanique identique aux capsules (`adr-0007`) : sortie structurée `LLMRequest.fmt`
  (JSON Schema Pydantic, `extra="forbid"`), **1 tentative de réparation**, sinon erreur
  propre ; rien d'invalide n'est persisté. Prompts versionnés
  `app/prompts/curriculum.py` (v1). Trace `ai_jobs` : `curriculum_chapters` /
  `curriculum_lessons` (avec `engine_id`/`model_tag`).

### 2. Générer **dans la hiérarchie existante** — pas de tables `curriculum_*`

La passe 1 crée des `Chapter` sous le `SchoolYearSubject` de l'année active ; la passe 2
crée des `Lesson` et **upserte des `Skill`** (subject + level). Aucune couche
template/instance : les notions (`Skill`, persistantes) **sont** le référentiel durable ;
les chapitres/leçons en sont l'instanciation annuelle — c'est déjà la sémantique du schéma.

**Réutilisation inter-années = copie avec provenance**, pas partage par référence :
à la création d'une nouvelle année, ZETIS propose de copier les chapitres pertinents de
l'année précédente (même cycle), en conservant `source`/`program_version` et en
réinitialisant les attributs de progression (`period`, `status`). Les skills, elles, ne
sont jamais copiées : elles persistent.

### 3. Co-construction par nœud : `source` + `validation_status` en cascade

Le référentiel est **co-construit** — génération IA et saisie manuelle Papa coexistent au
même niveau, à chaque étage de la hiérarchie (chapitre, leçon, notion) :

- Nouvelles colonnes sur `Chapter` : `source` (`generated | manual`),
  `validation_status` (`pending | validated | rejected`), `program_version`.
  (`Chapter.status` reste la progression temporelle — les deux statuts sont distincts.)
- `Lesson` réutilise `created_by` (≈ source) et `status` (≈ validation) existants ;
  ajout de `program_version`.
- **Règles métier** :
  - `manual` (écrit par Papa) → validé d'office ; `generated` → `pending` obligatoire.
    Critère : *écrire* ≠ *choisir* (un clip zetis-clip reste `pending`, cf. `adr-0006`).
  - La régénération **ne touche jamais** les nœuds `manual` ni les nœuds validés.
  - Les nœuds manuels existants sont **injectés dans le prompt** de génération
    (« complète sans dupliquer »).
  - Les statuts **cascadent indépendamment** : valider la dernière leçon `pending` d'un
    chapitre ne change pas le statut du chapitre ; un chapitre validé peut recevoir de
    nouvelles leçons `pending` ou `manual`.
  - La passe 2 accepte un chapitre `manual` en entrée (Papa crée le squelette, l'IA
    propose le remplissage).

### 4. `SchoolYear.mode` déprécié

La co-construction étant un **état par nœud**, un mode global (`ai_auto | hybrid |
manual`) est redondant et source de cas limites. La colonne est marquée dépréciée dans
`DATA_MODEL.md` (jamais lue, aucune UI) ; suppression à la première migration touchant
`school_years`. L'UI expose en permanence les deux chemins (Générer / Ajouter).

### 5. Versionnage et résolution classe → programme

- Chaque nœud généré porte `program_version` (ex. `2020`, `2026`) — valeur **déclarative**
  (demandée au prompt), fiabilisée par l'ancrage RAG (§6) et la validation Papa.
- Les chunks RAG issus de sources officielles sont tagués `program_version` dans
  `metadata_json` pour éviter la contamination croisée entre réformes.
- Résolution collège : sélectionner « 4e » résout vers *cycle 4 + version* ; la
  répartition annuelle est marquée `officielle` (repères annuels : français, maths, EMC)
  ou `interpretee` (autres matières) dans la description ou `settings_json`.
- Référence opérative 2026-2027 (4e) : BO cycle 4 du 30 juillet 2020 pour la plupart des
  matières.

### 6. Ancrage RAG optionnel + `LearningObjective` pour les attendus du BO

- Si le BO de la matière est présent et **validé** dans le RAG (`DocumentSource.source_type
  = official`), la génération injecte les passages pertinents en contexte (même chemin que
  ELI5). Le référentiel passe de « connaissance du modèle » à « connaissance ancrée »,
  matière par matière, sans en faire un prérequis.
- **Lot 2** : extraction des *attendus de fin de cycle* vers `LearningObjective`
  (table existante), `source_reference` = citation du BO.
- `zetis-clip` (adr-0006) devient le canal naturel d'alimentation des BO ; en retour, son
  popup remplace le champ libre `chapter` par un sélecteur branché sur le référentiel
  validé → **le référentiel passe avant zetis-clip dans la file** (inverse l'ordre
  19-20 ; addendum à porter à l'adr-0006).

### 7. Routage moteur — décision par bench T4

> **Tranché le 2026-07-03 : issue (b)** — voir l'addendum en fin de document.
> Le texte ci-dessous est conservé tel qu'écrit avant le bench (méthode et issues envisagées).

Tension à arbitrer : la génération de référentiel exige une **connaissance factuelle fine
du BO** (intitulés, découpages, versions) — capacité distincte de la richesse pédagogique
mesurée par le bench de l'adr-0008 — mais l'adr-0008 statue « production 100 % locale ».

Décision de méthode : ajouter une **tâche T4 « curriculum »** à `scripts/bench_llm.py`
(ex. « chapitres de mathématiques cycle 4, programme 2020, répartition 4e » + une matière
sans repères annuels), scorée **contre le BO réel** (jugement Papa). Prompts génériques,
zéro donnée de Massimo → usage cloud conforme au cadre yardstick de l'adr-0008.
Trois issues, à figer dans un addendum :

- **(a) Le local suffit** (surtout avec ancrage RAG) → aucune exception au 100 % local ;
  `curriculum_*` route vers `qwen3.6:35b-a3b` comme le reste.
- **(b) Le cloud est nettement meilleur** → **dérogation étroite et nommée** : la seule
  tâche `curriculum_generate`, one-shot par version de programme, zéro donnée
  personnelle, clé en variable d'env (jamais en Git), provider derrière le même
  `LLMProvider`. L'adr-0008 n'est pas contredit (il statuait sur les tâches quotidiennes
  de Massimo) mais précisé.
- **(c) Entre les deux** → local + **ancrage RAG obligatoire** (génération refusée sans
  BO validé pour la matière) + validation Papa renforcée.

### 8. Lycée : modèle prêt, génération différée

Aucune génération lycée avant l'entrée de Massimo en 2de (le programme aura pu changer ;
valider aujourd'hui un référentiel pour dans deux ans gaspillerait la validation Papa).
Le modèle est prêt sans migration dédiée : `SchoolYear.level` accueille `2de`,
`SchoolYearSubject.settings_json` portera `statut_matiere`
(`tronc_commun | specialite | option`) et la voie le moment venu. Normalisation en
colonnes seulement si l'usage réel le justifie.

### 9. UI : deux pages Papa distinctes

- **Années scolaires** = temporel (année active, périodes, métriques, historique,
  copie inter-années). Perd le sélecteur de mode et « Importer un programme ».
- **Programme** = éditeur du référentiel de l'année (sélecteur de matière, liste de
  chapitres ordonnables, badges `source` + `validation_status`, accordéon
  leçons/notions, ajout manuel inline, bandeau d'état d'ancrage RAG).
- Maquettes validées (2026-07-03) : page Années scolaires réconciliée, page Programme,
  états chapitre déplié + ajout inline. À consigner dans `docs/frontend-papa/`
  (`page-programme.md` à créer, `page-annees-scolaires.md` à réécrire).

Endpoints (Lot 1) : CRUD `school-years` (existants à créer, cf. `FRONTEND_ROADMAP.md`
Lot E), `GET /subjects` (dette partagée avec adr-0006), CRUD chapitres
(`POST/PATCH/DELETE`, garde rôle parent), `POST .../generate-chapters` (passe 1),
`POST /chapters/{id}/generate-lessons` (passe 2), réordonnancement (`sort_order`).

### 10. Sécurité et périmètre

- Génération et édition = **Papa uniquement** (`parent`/`admin`), comme le RAG.
- Les prompts `curriculum_*` ne contiennent **jamais** de données de Massimo (niveau et
  matière ne sont pas des données personnelles) — condition nécessaire de l'issue (b) du §7.
- Rien n'atteint Massimo avant validation (`pending` → `validated`), règle inchangée.

## Alternatives considérées

- **Scraping live d'Éduscol / education.gouv.fr** : sur-ingénierie pour un contenu qui
  change tous les 5-10 ans ; fragile (refontes de site) ; les BO sont des PDFs à URL
  stables déjà couverts par `/rag/upload`. → Écarté.
- **Ingestion PDF comme chemin principal** (plan initial) : robuste mais lente à démarrer
  (dépend de l'upload de chaque BO). → Rétrogradée en **ancrage optionnel** (§6) ; la
  génération LLM démarre immédiatement et se fiabilise progressivement.
- **Tables `curriculum_*` (template/instance)** : propre conceptuellement, mais optimise
  un problème que ZETIS n'a pas (un enfant, ~35 chapitres/an) et casserait les FK
  existantes (`capsules`, `lessons`, `quizzes` → `chapters`). Sobriété. → Écarté (§2).
- **Interroger plusieurs modèles cloud et croiser** : le diff serait dominé par des
  écarts de découpage légitimes (bruit de forme), et l'arbitrage exigerait un 3e appel.
  L'ancrage RAG (comparaison contre le BO réel) + validation Papa sont supérieurs.
  → Écarté en V1, idée de secours documentée.
- **Mode global de configuration** (`ai_auto | hybrid | manual`) : redondant avec l'état
  par nœud, cas limites de bascule, friction sans bénéfice pour un utilisateur unique.
  → Écarté (§4).

## Conséquences

### Positives

- Démarrage immédiat (aucun BO requis), fiabilisation progressive (ancrage RAG),
  garde-fou permanent (validation Papa) — trois crans de confiance découplés.
- Migration légère : **zéro table nouvelle**, colonnes sur `Chapter`/`Lesson`,
  réutilisation de `LearningObjective` et des champs existants de `Lesson`.
- Le référentiel validé sert cinq consommateurs (skills/diagnostics/missions + capsules
  + zetis-clip) avec une seule source de vérité.
- Pattern uniforme avec les capsules (spec typé, `fmt`, réparation 1×, traces) : rien de
  nouveau à apprendre pour maintenir.

### Négatives / coûts

- **Hallucination de programme** : le LLM peut mélanger versions (2016/2020/2026) ou
  inventer des intitulés. Mitigations : §5 (version déclarative + tags), §6 (ancrage),
  §7 (bench T4 avant de choisir le moteur), validation Papa systématique. Risque
  résiduel assumé pour un référentiel de travail relu par un humain.
- Charge de validation Papa (~35 chapitres puis leurs leçons, matière par matière) —
  lissée par le déclenchement à la demande de la passe 2.
- La copie inter-années duplique des lignes (assumé : échelle négligeable, provenance
  conservée).
- Si issue (b) au §7 : première clé cloud en production → `.env.example` à compléter,
  discipline secrets (déjà cadrée par SECURITY.md).

## Suivi

- **Préalable** : bench T4 (`bench_llm.py`, tâche curriculum, local vs yardstick cloud)
  → addendum figeant le §7.
- **Docs** : ligne dans `DECISIONS.md` ; `DATA_MODEL.md` (colonnes `Chapter`/`Lesson`,
  `mode` déprécié, note LearningObjective) ; réécrire `page-annees-scolaires.md` ; créer
  `page-programme.md` (depuis les maquettes du 2026-07-03) ; rafraîchir
  `FRONTEND_ROADMAP.md` (capsules live, Lot E enrichi) ; addendum `adr-0006`
  (ordre : référentiel avant zetis-clip ; tagging via référentiel).
- **Lot 1** : migration Alembic (colonnes) ; `app/prompts/curriculum.py` v1 ; service
  passe 1 (+ règles §3) ; endpoints §9 ; page Programme (liste chapitres, badges,
  ajout inline, réordonnancement) ; page Années scolaires réconciliée.
- **Lot 2** : passe 2 (leçons + upsert skills) ; ancrage RAG ; extraction
  `LearningObjective` ; accordéon leçons/notions ; « Proposer des leçons » sur chapitre
  manuel.
- **Lot 3** : réconciliation des skills seed / diagnostics passés avec les notions
  générées (matching embedding + confirmation Papa) ; copie inter-années.
- Commits suggérés : `feat(curriculum): two-pass AI program generation (chapters)` puis
  `feat(curriculum): lessons pass, RAG grounding and learning objectives`.

---

## Addendum — 2026-07-03 · Bench T4 exécuté : le §7 est tranché — issue (b)

Bench exécuté (`scripts/bench_llm.py`, tâche T4, 3 répétitions, 2 prompts :
maths cycle 4 avec repères annuels / SVT sans repères). Scorage humain
(Papa, BO 2020 + repères 2019 ouverts, pré-analyse assistant validée),
synthétisé dans le tableau ci-dessous. Les sorties brutes des runs sont
archivées de façon versionnée dans
`docs/decisions/annexes/adr-0009-bench-t4-curriculum-2026-07-03.md`
(`scratchpad/` étant git-ignoré) — pièce de référence de cette décision, à ne
plus régénérer (tout re-run futur : `--out` daté).

### Résultats (moyenne /8 sur 3 runs par cellule)

| Moteur | T4a maths | T4b SVT | Constats saillants |
|---|---|---|---|
| ollama `qwen3.6:35b-a3b` | ~5,7 | ~4,0 | Intitulés officiels maths exacts mais répartition par classe esquivée ; **SVT : contamination géographie (run 1) + mélange massif d'anciens programmes (runs 2-3)** — structure 2020 absente |
| openai `gpt-4o` | ~4,0 | ~6,0 | **Omission systématique 3/3 d'« Algorithmique et programmation »** (5e thème officiel maths) ; « Les enjeux contemporains de la planète » = intitulé de seconde (fuite de niveau) ; granularité table des matières |
| anthropic `claude-sonnet-5` | ~6,7 | ~7,7 | Granularité chapitre de manuel ; **répartition par classe conforme aux repères 2019** (Pythagore 4e, cosinus 4e / sinus-tangente 3e) ; seuls glissements mineurs (probabilités 4e au lieu de 5e) ; version 2020 tenue sur les deux matières |

Note de mesure : les 0/3 « JSON valide » de Sonnet en maths sont un **artefact
de la borne du schéma jetable** (max 15 chapitres ; Sonnet en produit ~20, à la
granularité que ZETIS vise). Leçon intégrée : le schéma de production borne à
**3-25 chapitres** et laisse le prompt piloter la granularité.

### Décision — issue (b) : dérogation cloud étroite et nommée

Les tâches `curriculum_chapters` et `curriculum_lessons` sont routées vers un
**`AnthropicProvider`** (modèle `claude-sonnet-5`) derrière l'abstraction
`LLMProvider` existante. La dérogation est bornée par quatre conditions,
toutes vérifiables :

1. **Zéro donnée personnelle** dans les prompts (niveau, matière, version de
   programme, chapitres existants uniquement) — invariant testé.
2. **Tâche one-shot** par version de programme, déclenchée par Papa uniquement.
3. **Clé en variable d'environnement** (`ANTHROPIC_API_KEY`, `.env` git-ignoré,
   documentée dans `.env.example`), jamais en base ni en Git.
4. **Dégradation propre** : sans clé, le service refuse avec un message clair
   proposant le repli local explicite (`CURRICULUM_LLM_PROVIDER=ollama`,
   qualité moindre documentée) — jamais de bascule silencieuse.

Tout le reste de la production reste **100 % local** (adr-0008 inchangé sur son
périmètre : les tâches quotidiennes de Massimo). L'ancrage RAG du §6 demeure
recommandé en complément — même le meilleur moteur a montré des glissements
mineurs ; la validation Papa reste le garde-fou final.

Justification du rejet des autres issues : (a) est invalidée par l'échec
structurel du local sur T4b (mélange de versions = risque éliminatoire pour un
référentiel) ; (c) est invalidée car l'ancrage RAG corrigerait la structure
mais pas la **répartition par classe**, synthèse des repères annuels que seul
Sonnet produit nativement et que le BO seul ne contient pas.

Notes d'implémentation héritées du harnais (adr-0008, phase 2) : Sonnet 5
déprécie `temperature`, renvoie des blocs `thinking` et du JSON parfois
clôturé par des balises ``` — l'`AnthropicProvider` doit extraire les blocs
`text` et retirer les balises (pattern `_unfence` du bench).
