---
id: "0009"
titre: "Référentiel de programme scolaire (génération LLM en deux passes, co-construction Papa/IA)"
type: architecture
statut: accepte
date: 2026-07-03
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0011", "0021"]
---
# ADR-0009 — Référentiel de programme scolaire (génération LLM en deux passes, co-construction Papa/IA)

## Statut

Accepté — 2026-07-03 (bench T4 exécuté ; §7 tranché : issue (b), dérogation cloud
étroite). Initialement Proposé le même jour, §7 suspendu aux résultats du bench.

> S'appuie sur : `adr-0007` (pattern spec typé + sortie structurée `fmt` + 1 réparation),
> `adr-0008` (production 100 % locale, cloud = yardstick de benchmark, `bench_llm.py`),
> `adr-0006` (pipeline RAG `pending` → validation Papa). Ne modifie pas
> `adr-0004` (embeddings/pgvector inchangés).

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-07-03 | Cours validé comme source canonique des dérivés + lien `lesson_skills` | Accepté | — |
>
> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*

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

> Comportement mono-niveau de la passe 1 précisé par l'`adr-0010` (décision 5) :
> génération strictement pour le niveau demandé, toutes matières ; le besoin
> multi-niveaux (rattrapage) passe par la génération « skills-only » dédiée.

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
`docs/decisions/annexes/bench-t4-curriculum-2026-07-03.md`
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

---

## Amendement 1 — Cours validé comme source canonique des dérivés + lien `lesson_skills` — 2026-07-03

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-07-03. **Complète** l'ADR-0009 (passe 2) sans modifier ses décisions
§1–§10. Purement documentaire : aucune table, aucune migration, aucun code ne découle
de cet addendum tant que la passe 2 (Lot 2 du référentiel) n'est pas ouverte.

> S'appuie sur : `adr-0009` §1–§3 (deux passes, génération dans la hiérarchie existante,
> co-construction par nœud avec `pending → validated`), §6 (ancrage RAG optionnel).
> Ne modifie pas `adr-0004` (embeddings/pgvector inchangés).

### Contexte

La genèse ZETIS a **deux étages**, et le modèle n'en outille qu'un :

1. **Le référentiel (structure)** — chapitres → leçons → notions. C'est l'objet de
   l'ADR-0009. Il dit *quoi* apprendre.
2. **Le cours (contenu)** — `Lesson.content_markdown`, le texte pédagogique lui-même.
   Il dit *ce qu'il y a* à apprendre. Le champ existe dans `DATA_MODEL.md` mais rien
   ne le remplit ni ne le consomme aujourd'hui.

Conséquence sur l'existant : les dérivés (ELI5, capsule, quiz, mindmap, fiches de
révision, cartes SRS) vont **chacun chercher leur contexte de leur côté** — ELI5
s'ancre sur `skill_id` + chunks RAG, le diagnostic génère par notion, la capsule part
d'une `instruction` libre + `chapter_id`. Ça fonctionne, mais deux dérivés d'une même
notion peuvent raconter des choses différentes (vocabulaire, notations, méthode de
résolution), et aucun ne bénéficie de la validation que Papa aurait faite sur un cours.

Il manque le chaînon intermédiaire : un **cours validé** qui serve de contexte commun,
prioritaire, à tous les dérivés — prolongeant la même cascade de confiance
`pending → validated` déjà en place partout.

### Décision

#### A. Le cours validé est la source canonique des dérivés

Quand un `Lesson.content_markdown` **validé** existe pour une notion, il devient le
contexte **prioritaire** de tous les dérivés de cette notion — avant les chunks RAG
bruts, avant la connaissance interne du modèle.

Cascade de dégradation gracieuse (identique en esprit à l'ADR-0009 §6) :

```txt
cours validé  →  RAG seul (BO, sources Papa)  →  connaissance du modèle
```

Les deux derniers crans existent déjà (couture `retrieve_for_skill` d'ELI5) ; cet
addendum ajoute le premier. Même porte partout : un cours que Papa repasse en édition
(`status != validated`) **cesse immédiatement** d'alimenter les dérivés, sans mécanisme
supplémentaire — le filtre de statut suffit.

> **Deux précisions apportées le 2026-07-28.**
>
> **1. Le gate vaut à la naissance, pas dans la durée (addendum ADR-0011 §E).** Ce §A garantit
> qu'un dérivé *naît* d'un cours validé. Il ne dit rien de la suite : régénérer un cours
> repasse la leçon en `draft`, mais les dérivés déjà `validated` **restent servis** dans leur
> version obsolète. La notion de **dérivé périmé** (`is_stale`, colonne
> `lessons.content_updated_at`) comble ce trou — signalée à Papa, jamais déclassée
> automatiquement, et utilisée comme **prédicat d'orchestration** par l'équipement (ADR-0021 §5
> corrigé : « déjà validé *et frais* »).
>
> **2. Exception — mission engagée (chantier « invariants de lecture des dérivés »).** Une
> ressource référencée par le `resource_id` d'une étape d'une **mission active** de Massimo
> reste servable jusqu'à la fin de cette mission, même si sa leçon repasse en `draft`. Le gate
> porte sur la **découverte**, jamais sur l'**achèvement d'un parcours engagé** : sans cette
> exception, une régénération de cours par Papa bloque une mission en cours et empêche son
> verdict d'être calculé. L'exception est nommée et testée côté serveur.

**Contrainte de design portée en avant** : tout prompt de dérivé écrit à partir de
maintenant doit prévoir une section « cours validé » distincte de la section « extraits
RAG », avec la règle explicite *le cours fait foi* (vocabulaire, notations, méthode).
C'est ce qui garantit qu'ELI5, capsule et quiz d'une même leçon restent cohérents.

#### B. Lien `Lesson ↔ Skill` = table N-N `lesson_skills`

La résolution « quelle leçon enseigne cette notion » exige un lien qui n'existe pas
encore. Trois formes possibles, une seule est retenue :

- **`Lesson.skill_id` (1-N)** — écarté. Force *une* notion par leçon, alors qu'une leçon
  couvre naturellement plusieurs notions (« Théorème de Pythagore » = énoncé + calcul de
  l'hypoténuse + réciproque). Perte d'information dès le premier cas réel.
- **Détour par le chapitre (`Lesson → chapter → skill`)** — écarté. Il n'existe aucun
  lien `Chapter ↔ Skill`, et il ne faut pas le créer : `Chapter` est **annuel**
  (`school_year_subject_id`), `Skill` est **persistante** (ADR-0009 §2). Relier une
  notion persistante à un chapitre annuel recrée le problème de copie-par-année que
  l'ADR-0009 a écarté.
- **Table N-N `lesson_skills`** — **retenu**. Seule forme honnête : une leçon touche N
  notions, une notion est enseignée par N leçons (curriculum en spirale, cross-années).
  Cardinalité juste : `Lesson` est annuelle, `Skill` est persistante → la table répond
  exactement à « quelle leçon *(cette année)* a enseigné cette notion persistante ».
  Une table de jointure fine est la représentation *minimale correcte*, pas une couche
  en trop (sobriété `TECH_STACK.md` respectée).

Modèle (SQLAlchemy 2.0, style `Mapped`/`mapped_column`) :

```python
class LessonSkill(Base):
    __tablename__ = "lesson_skills"

    lesson_id: Mapped[UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True
    )
```

- **Clé primaire composite `(lesson_id, skill_id)`** : interdit les doublons sans colonne
  `id` de surface.
- **Pas de `is_primary`, pas de poids en V1.** Voir §C pour l'échappatoire documentée.
- **Index requis** : la PK composite est ordonnée `(lesson_id, skill_id)` et n'aide donc
  pas les requêtes filtrant par `skill_id` (le cas des dérivés). Ajouter :

  ```python
  Index("ix_lesson_skills_skill", "skill_id")
  ```

#### C. Contrat de résolution du cours canonique

Résolveur de référence (consommé par les dérivés, à commencer par ELI5 v2) :

```python
lesson = db.scalars(
    select(Lesson)
    .join(LessonSkill, LessonSkill.lesson_id == Lesson.id)
    .where(
        LessonSkill.skill_id == skill_id,
        Lesson.status == "validated",
        Lesson.content_markdown.isnot(None),
    )
    .order_by(Lesson.updated_at.desc())
    .limit(1)
).first()
```

Tie-break quand une notion mappe plusieurs leçons validées : **la plus récente**
(`updated_at.desc()`) — zéro colonne ajoutée, défaut sensé (traitement le plus frais).

Cas où ce défaut peut se tromper : une notion enseignée dans plusieurs chapitres de la
*même* année, où « la plus récente » pointerait vers une mention tangentielle plutôt que
le cours de fond. **Échappatoire documentée, non implémentée** : ajouter `is_primary`
(bool) sur `lesson_skills` pour désigner LA leçon de référence d'une notion. À poser
seulement si le tri par récence se révèle insuffisant en usage réel.

#### D. Stratégie d'injection : verbatim, pas ré-indexation

Le `content_markdown` d'une leçon validée est injecté **entier** dans le prompt du
dérivé, pas ré-indexé dans le RAG.

- Une leçon cycle 4 fait ~500–1500 mots → tient dans le contexte de qwen. Déterministe,
  zéro infra nouvelle, le cours arrive complet (pas de chunk pertinent raté par la
  similarité cosinus).
- **Alternative écartée** : indexer les leçons validées dans le RAG (avec
  `metadata_json.lesson_id` + boost par `source_type`). Plus élégant à grande échelle,
  mais sur-ingénierie pour des leçons courtes et introduit un problème de synchronisation
  (leçon éditée → ré-embedder). Documentée comme option si les cours grossissent.

#### E. Rattachement à la passe 2

- `lesson_skills` est créée par la **migration Alembic qui crée `lessons`** (table encore
  inexistante, cf. avertissement `DATA_MODEL.md`), dans la même migration passe 2 qui
  ajoute `program_version` sur `Lesson`.
- La **passe 2 écrit** dans la table (upsert `Skill` + insertion des liens leçon↔notion).
- Les **dérivés lisent** la table plus tard (ELI5 v2 en premier consommateur). Le
  résolveur consomme le lien, il ne le crée pas.

### Conséquences

#### Positives

- **Cohérence inter-dérivés** : un même cours validé → même vocabulaire, mêmes notations
  dans ELI5, capsule, quiz, mindmap d'une même leçon.
- **Traçabilité gratuite** : `output_json` des dérivés peut porter `lesson_id` +
  `lesson_title` en plus de `sources_used`. Le badge Massimo passe de « 📚 D'après ton
  cours » à « 📚 D'après ta leçon *Théorème de Pythagore* » — ce qui résout le
  reste-reporté de l'étape 13 (afficher le titre/chapitre précis de la source).
- **Invalidation automatique** : le filtre `status == "validated"` fait qu'une leçon en
  ré-édition disparaît des dérivés sans code supplémentaire.

#### À surveiller

- Le tie-break par récence (§C) est un pari ; `is_primary` est l'antidote prêt.
- La contrainte de design §A doit être rappelée dans **chaque** futur prompt de dérivé,
  sinon la cohérence promise n'est pas tenue.

### Hors périmètre (mono-chantier)

Aucune implémentation ne découle de cet addendum aujourd'hui. Il fige la cible pour :

1. le **prompt Claude Code de la passe 2** (création `lessons` + `lesson_skills` +
   `program_version`), quand ce chantier s'ouvrira ;
2. le **prompt Claude Code d'ELI5 v2** (résolveur §C + prompt v2 à deux sections),
   encore après.

Chacun de ces prompts devra, selon la règle read-before-code, relire les définitions
réelles de `Lesson`, `Skill`, `LLMRequest`/`LLMResponse` avant d'écrire quoi que ce soit.
