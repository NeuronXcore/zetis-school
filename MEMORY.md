# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier : le déclencheur automatique (ADR-0035 + son addendum) — COMPLET. NON POUSSÉ.**

### Où est le code, exactement

| | |
|---|---|
| Branche | `feat/declencheur-agenda`, **7 commits** (un par sujet), **NON POUSSÉE**, aucune PR |
| Base `main` | **`628905f`** (4bis du Journal), local = `origin/main`. ⚠️ `4d3fc99` est le *merge* de la PR #70, pas la tête — le commit de clôture est passé par-dessus |
| Migration | **AUCUNE** — et aucune dépendance nouvelle |
| Arbre | propre |

**776 backend · 309 Papa · build Papa** — verts, relancés après le **dernier commit de code**
(`de3f74f`). **453 Massimo · build Massimo · typecheck Massimo** — verts, mais **non relancés depuis
`4dc48e8`** : aucun fichier Massimo n'a été touché depuis. Le user relance tout avant de merger.

### Ce que ce chantier a livré, dans l'ordre des commits

1. `4dc48e8` — **le déclencheur** (ADR-0035) : scan d'agenda, régulateur de volume, 7ᵉ clé,
   `parent_rule` émise pour la première fois.
2. `dc6a709` — **provenance** des créations manuelles.
3. `64e41c6` — **`devoir` déclenche** + priorité aux contrôles.
4. `757df6b` — **« + Programme » dit ce qu'il ne fait pas**.
5. `2b4cc32` — **chapitre éditable après coup** + indice d'échéance stérile.
6. `de3f74f` — **porte « échéance » du Commander** (zéro backend).
7. `c31b43f` — **addendum ADR-0035**.

### Décisions actives — à relire, pas à rouvrir

1. **Le déclencheur v1 est `agenda` seul**, `controle` **et** `devoir` (addendum) ; `rendu`,
   `evidence`, `derived`, `request`, `council` restent **légaux et non émis**, test-verrou en place.
2. **Les contrôles passent avant les devoirs**, même plus lointains. Contre-intuitif, voulu, et
   c'est ce qui rend la révocation du §1 tenable.
3. **Le régulateur ne compte QUE les lots automatiques** — le clic de Papa est son propre
   régulateur. Il **s'ajoute** à `pending_backlog`, il ne le remplace pas.
4. **La 7ᵉ clé n'est pas un palier** et ne rejoint pas `AUTONOMY_CLASSES` : sinon un préréglage
   armerait le déclencheur. Deux questions, deux sources.
5. **Le scan REGARDE, il ne produit pas.** C'est ce qui satisfait l'objection écrite dans
   `production_worker.py` au lieu de la contourner.
6. **Le Commander est un GESTE de Papa, jamais le scan.** Produire du contenu sans clic est décidé ;
   prescrire du travail à Massimo sans clic ne l'est pas.
7. **On ne fusionne pas « + Programme » et « Créer la leçon ».** L'orpheline est un état légitime ;
   le défaut était le silence.

### ⚠️ LES DÉFAUTS TROUVÉS EN CODANT — pas au cadrage

- **`massimo_is_active` comptait un `login` comme du travail** → un réveil entier du scan sautait.
  Constante promue en `NON_WORK_EVENTS` et partagée avec l'agenda, qui l'avait déjà en privé.
- **`create_run` lève des `HTTPException`** — absurde dans un job RQ : le scan rattrape, et un lot
  refusé **ne consomme pas la référence**.
- **La convention booléenne d'`app_settings` est `"true"`/`"false"`**, pas `0|1` comme l'ADR le
  disait.
- **`create_manual_*` écrivait `validated` hors de `mark_validated`** → le Journal affichait les
  leçons de Papa « provenance inconnue ».
- **`SubjectOption.sysId` est `number | null`** (rattrapé par le typecheck).

> Détail et remèdes : `TROUBLESHOOTING.md`, chantier `feat/declencheur-agenda`.

### ⚠️ DEUX FOIS OÙ LES TESTS M'ONT PRIS EN DÉFAUT — à lire avant d'en écrire

1. **Un test passait trivialement.** Il créait deux `notion_requests` au texte presque identique en
   les croyant distinctes ; `create_request` déduplique sur `lower(text)`, si bien que le test
   empruntait la branche `already_processed` et passait quoi qu'il arrive. **C'est la contre-épreuve
   qui l'a démasqué, pas la relecture.**
2. **Une contre-épreuve visait à côté.** Sur `openFor`, saboter l'ordre des `setState` laissait les
   4 tests verts (React batche). Le vrai piège est la **fermeture sur `gate`** : en repassant par
   `selectChapter`, les 4 tombent. **Un sabotage qui ne casse rien ne prouve pas que le code est
   bon — il prouve que le sabotage était mal choisi.**

### Vérifié EN VRAI (backend `:8000` + Postgres, Papa `:5174`)

Chaîne complète : contrôle créé **sans** chapitre → l'avertissement s'affiche → le sélecteur charge
les 13 vrais chapitres de Mathématiques → rattachement à « Fractions » persisté (`chapter_id = 6`)
→ l'avertissement disparaît → l'échéance devient éligible → **le scan crée un lot
`agenda`/`parent_rule`**, `authority_for` le confirme, second scan idempotent. Puis la modale du
Commander s'ouvre pré-remplie (porte Échéance, Mathématiques, Fractions, date de l'échéance), le
serveur résout les **12 vraies notions** du chapitre et pré-coche les 3 plus fragiles.

⚠️ **Non vérifié en vrai, à dessein** : la **confirmation** des missions (créer du travail réel pour
Massimo pour valider un bouton serait disproportionné — 32 missions avant, 32 après ; le payload est
verrouillé par le test unitaire). Données de test supprimées (lot puis item, ordre FK).

⚠️ **Tout est resté aux défauts en dev** : régime *Semi-autonome*, **déclencheur désarmé**. Les
armer est une décision de Papa, deux clics sur `/parametres`.

### ▶ PROCHAIN PAS

1. **Relire le diff (32 fichiers, ~1 780 lignes), relancer les tests, pousser, ouvrir la PR.**
   Rien n'est chez `origin`. Les 7 commits sont **un par sujet** — la revue peut se faire sujet
   par sujet.
2. Après le merge : **étape 4bis**. Ce fichier a survécu **quatre fois** à son propre chantier.
3. **Chantier suivant** : le pont **demande → production** (`trigger='request'`), le seul des six
   déclencheurs dont la surface existe déjà et dont la boucle est incomplète (voir dettes).

### ▶ DETTES OUVERTES, nommées à la livraison

- ⚠️ **Le Commander n'est pas idempotent** : Papa peut commander **deux fois** la même échéance —
  `Mission` n'a aucune référence à l'agenda, et `resolve_chapter_notions` n'exclut pas les notions
  déjà couvertes (alors que `_skill_has_active_mission` existe). Exigerait
  `missions.agenda_item_id`, donc **une migration**. **Condition d'ouverture : le jour où le scan
  suggérerait des missions, ça devient obligatoire.**
- **Le pont demande → production n'existe pas.** « Fait » sur une `content_request` ne produit
  **rien** — c'est une déclaration ; le seul garde-fou est en aval (`chat/announce.py` refuse
  d'annoncer un `done` non servable). `trigger='request'` reste non émis.
- **`skills-backfill` crée aussi des notions orphelines** (aucune ligne `lesson_skills`).
- **Le panneau d'analyse à 3 compteurs** (ADR-0025 §11) attend une mesure SRS **scopée chapitre** :
  `evidence.srs_pressure` est par MATIÈRE.
- **Un devoir fait produire le chapitre entier** — disproportionné, assumé, à rouvrir si
  l'observation montre du gaspillage.
- Report du Journal : le refus de retirer un cours consommé **jamais vu à l'écran** ; le geste
  *Corriger* toujours dû ; `has_more` sans bouton.

### ▶▶ OÙ EN EST « FULL AUTONOMIE »

| Axe | Ce qu'il dit | État |
|---|---|---|
| **1 — le palier** | « ZETIS ne me demande plus de valider » | ✅ **LIVRÉ** (ADR-0032 + 0034) |
| **2 — le déclencheur** | « ZETIS travaille sans que je clique » | ✅ **LIVRÉ** (ADR-0035 + addendum) |

**Les deux axes sont livrés.** ZETIS peut servir sans relecture *et* se mettre au travail seul.
⚠️ Mais **rien n'est armé en dev** — et c'est volontaire : livrer la possibilité était le chantier,
l'activer est une décision de Papa.

---

## Historique — le Journal de production et le veto (ADR-0034)

**CLOS ET MERGÉ** (squash `4d3fc99`, PR #70, 2026-08-03). Conservé pour ses décisions actives
et ses quatre défauts trouvés en codant. Son « prochain pas » — coder l'ADR-0035 — est FAIT.

### Où est le code, exactement

| | |
|---|---|
| Journal (ADR-0034) | **MERGÉ `main`** — squash **`4d3fc99`**, PR #70, 2026-08-03. Branche `feat/journal-production` **supprimée** en local et chez `origin`. ⚠️ Ne pas ré-implémenter. |
| `origin/main` | **`628905f`** — le 4bis lui-même est passé par-dessus le merge `4d3fc99`. ⚠️ La version d'origine de cette ligne disait `4d3fc99` : elle décrivait l'état d'AVANT son propre commit |
| Migration | **`b6c7d8e9f0a1` APPLIQUÉE sur la base de dev** et vérifiée table par table |
| Cadrage suivant | **ADR-0035 déjà écrit** sur `main` (`4bd4d8e`) — le déclencheur automatique |

**Relancés AVANT le merge, tous verts** : **757 backend · 295 Papa · 453 Massimo · build Papa ·
build Massimo · typecheck Massimo**. **Un seul test existant remplacé** (voir plus bas) — aucun
autre touché.

> ✅ **`VETO_SURFACE_AVAILABLE = True` est sur `main`.** Le régime *Autonome* est offert par le
> serveur. ⚠️ Mais le régime **réel** de la base de dev est resté sur *Semi-autonome* : livrer la
> **possibilité** du palier 3 était le chantier, l'**activer** est une décision de Papa, en un clic
> sur `/parametres`.

### Ce que ce chantier a livré

**Slice A backend** — `production_events` (une ligne par pièce, **même transaction que l'acte**,
patron `log_learning_event`) ; `started_at` / `heartbeat_at` / `current_skill_id` sur
`production_runs` ; `spaced_review_cards.created_at` ; table **`lesson_views`** ; service `journal`
(consommation résolue en **5 requêtes quel que soit N**) ; service `veto` ; **troisième routeur**
`/api/production/journal` (`require_parent`, aucune route élève).

**Slice B Papa** — page `/journal` + entrée sidebar 📜 après « Demandes », client `lib/journal.ts`,
types partagés.

**§8** — `VETO_SURFACE_AVAILABLE = True`. Le régime *Autonome* est offert.

### ⚠️ LES DÉFAUTS TROUVÉS EN CODANT — pas au cadrage

1. **`Lesson.production_run_id` n'était JAMAIS écrit.** Le filigrane `_stamp` n'attribue que les
   lignes **nées** ; `equip_notion` écrit dans une leçon **préexistante**. Donc **le veto sur le
   cours n'aurait identifié aucun cours** — la classe même dont le palier 3 justifie le chantier.
   Réparé par `_stamp_course`, appelé **seulement** si `generated` contient `cours`.
   **Contre-épreuve jouée** : correctif retiré → 2 verrous tombent ; restauré → 10/10.
2. **`Fiche` et `Mindmap` n'ont aucune colonne `title`** — vu à l'écran (« fiche #18 »). Leur
   identité est celle de leur **leçon**.
3. **SQLite naïf vs Postgres aware** dans `is_stale` — ne se manifeste que d'un côté à la fois.
4. **Un lot sans pièce ni événement s'affichait vide**, ce qui se lit comme une panne.

> Détail et remèdes : `TROUBLESHOOTING.md`, chantier `feat/journal-production`.

### Décisions actives — à relire, pas à rouvrir

1. **Le veto est au grain de la PIÈCE**, mais retirer un **cours** emporte ses dérivés **et se
   refuse si l'un d'eux est consommé**. Refuser est plus honnête que retirer à moitié : sinon
   Massimo garde une fiche dont la source a disparu (**V1**).
2. **Suppression FRANCHE, pas archivage** — à rebours de l'ADR-0025 sur l'agenda. L'agenda est
   **co-édité** par Massimo ; ici la pièce n'a jamais existé pour lui.
3. **`stale` est une LECTURE, jamais un état stocké.** Aucun balayage, aucun ordonnanceur (le §G.3
   avait écarté la quarantaine temporelle pour cette raison). Le seul écrivain est
   `close_stale_runs`, appelé **avant** une création de lot.
4. **Portée v1 = ce qui vient d'un LOT**, et la page le DIT. Le Conseil de classe et le champion
   équipent hors lot (`production_run_id = NULL`).
5. **`lesson_views` ET `lesson_viewed` coexistent.** La table sert le veto, l'événement sert la
   heatmap. Deux lecteurs, deux besoins, aucune fusion.
6. **Aucun total, aucun ratio** sur le Journal (§F.2) — deux tests le verrouillent, back et front.
7. **`VETO_SURFACE_AVAILABLE` RESTE dans le code** : il dit *pourquoi* le palier 3 est ouvert. Le
   remettre à `False` est le geste correct si le Journal disparaissait.

### Le test-verrou REMPLACÉ (et pourquoi ce n'est pas un ajustement)

`test_a1_au_palier_3_est_refuse_tant_que_le_veto_na_pas_decran` exigeait
`VETO_SURFACE_AVAILABLE is False` et un 422. **Son propre docstring annonçait sa péremption.**

Le remplaçant est **plus strict** : l'ancien vérifiait qu'une porte était fermée ; le nouveau
vérifie que **si elle est ouverte, c'est parce que les deux routes du geste *Retirer* existent
vraiment**. Retourner l'assertion en `is True` aurait fait d'un verrou de doctrine une tautologie.

### Vérifié EN VRAI (backend `:8000` + Postgres, Papa `:5174`)

Le Journal affiche **les 33 pièces du vrai lot du 2 août** avec leur provenance réelle
(`parent_bulk` sur les dérivés, « servi sans relecture » sur les quiz, **rien** sur les cartes SRS —
elles n'ont aucune étape de validation) ; la modale de retrait s'ouvre ; **zéro erreur console**.
Puis, après le drapeau : *Autonome* sélectionnable, **modale de révocation d'A1 affichée pour la
première fois**, **monotonie visible** (A1 = 3 a fait passer A0a à 3), `PUT` accepté et relu en base
(`preset: autonome`), descente vers *Semi-autonome* acceptée.

⚠️ **Le retrait n'a PAS été confirmé** : on ne supprime pas des données réelles pour valider un
bouton. **Non vérifié en vrai** : le refus de retirer un cours dont un dérivé est consommé — il
aurait fallu fabriquer une fausse lecture de Massimo. Couvert par 2 tests backend (contre-épreuve
jouée) et 1 test front.

⚠️ **Le régime de la base de dev a été REMIS sur *Semi-autonome*.** Livrer la *possibilité* du
palier 3 était le chantier ; l'activer est une décision de Papa, en un clic sur `/parametres`.

> Prochain pas et dettes RETIRÉS le 2026-08-03 : les uns sont exécutés,
> les autres ont migré dans l'état courant. Une consigne périmée se relit comme une consigne active.

---

## Historique — les paliers d'autonomie (ADR-0032)

**CLOS ET MERGÉ** (squash `b8f2a02`, PR #69, 2026-08-02). Conservé pour ses décisions actives
et son défaut de provenance réparé — le « prochain pas » de l'époque est fait : c'était le
cadrage de l'ADR-0034, livré le 2026-08-03.

### Où est le code, exactement

| | |
|---|---|
| Paliers (ADR-0032) | **MERGÉ `main`** — squash **`b8f2a02`**, PR #69, 2026-08-02. Branche `feat/paliers-autonomie` **supprimée** en local et chez `origin`. ⚠️ Ne pas ré-implémenter. |
| ADR-0032 (la décision) | `b57b5df` sur `main` |
| ADR-0035 (cadrage de l'axe 2) | **`4bd4d8e`** sur `main` — **écrit et poussé AVANT le merge**, voir la section « axe 2 » plus bas |
| `origin/main` | **`b8f2a02`**, local = distant |
| Arbre | propre, sur `main` |

> ⚠️ **Un ADR doit être chez `origin` avant la PR qui s'en réclame**, sinon elle se baserait sur un
> `main` distant qui **ne contient pas la décision qui la justifie**. Geste retenu, joué deux fois :
> `git push origin main:main` — le refspec explicite évite l'aller-retour `switch main` /
> `switch feat/…`, qui promène l'arbre de travail pour rien.
>
> **Leçon payée le 2026-08-02** : une version de ce fichier disait « poussé » dans un paragraphe
> pendant que son tableau disait *NON POUSSÉ*. **Ne jamais écrire un geste Git au passé avant de
> l'avoir joué** — la mémoire décrit le dépôt, elle ne le programme pas.

**Tests relancés avant le merge, sur la branche, tous verts** : **747 backend · 287 Papa ·
453 Massimo · typecheck Massimo · `tsc -b && vite build` Papa**. **Aucune migration** :
`app_settings` existait déjà. **Aucun test existant modifié**, sauf les deux verrous de
`ParametresPage.test.tsx` **remplacés** (voir plus bas — c'est une décision, pas un ajustement).

### Ce que ce chantier a livré

**Slice A backend** — module `app/modules/settings/` (routeur **neutre** `/api/settings/autonomy`,
`require_parent`, **aucune route élève**), six clés plates dans `app_settings`, le palier branché
dans `runner.select_notions`, `authority` en paramètre d'`equip_notion`, et la **réparation d'un
défaut de provenance** (ci-dessous).

**Slice B Papa** — la section « ⚡ Autonomie de ZETIS » de `ParametresPage` : état des lieux →
régime (3 préréglages) → détail dépliable (6 classes) → veto ; `ConfirmDialog tone="important"`
réutilisé pour la révocation d'A1 ; `CoverageCellView` gagne la teinte `parent_rule` **et** cesse
de rendre `null` comme `parent_bulk` (dette §G constat 5 soldée).

### ⚠️ LE DÉFAUT RÉPARÉ — à ne pas réintroduire

`equip_notion` auto-validait le cours via `set_lesson_validation`, qui écrivait **`parent`** —
« relu pièce à pièce par Papa » — **sur un cours que personne n'avait ouvert**. Violation directe
du §F.3, invisible du verrou existant (il ne teste que la NON-NULLITÉ de la provenance).

- Réparé par un paramètre `by=` explicite ; la route humaine garde `PARENT` par défaut.
- **Verrou n°4 ajouté** (`test_aucune_auto_validation_necrit_parent`), **contre-épreuve jouée** :
  défaut réintroduit → le test tombe → code restauré.
- ⚠️ **13 leçons en base de dev portent encore `parent` à tort**, mêlées aux vraies relectures de
  Papa. **Aucune rétro-attribution** (doctrine §F.4) : on ne réécrit pas l'histoire pour la rendre
  propre.

### ⚠️ UNE HYPOTHÈSE DE L'ADR ÉTAIT FAUSSE — corrigée dans l'ADR le jour même

L'ADR-0032 disait « au palier 3, la provenance est `parent_rule`, jamais `parent_bulk` ». **Faux** :
le §G.1 définit `parent_rule` par l'**absence de clic** (« ni cliqué pour ce lot »), or un lot lancé
depuis la Couverture **est** un clic.

> **Deux questions, deux sources** : le **palier** dit si ZETIS a le droit de servir sans
> relecture ; **`production_runs.authorized_by`** dit qui a autorisé CE lot. `authority_for(run)`
> les combine.

**Conséquence : `parent_rule` reste LÉGALE et NON ÉMISE.** Elle s'écrira le jour où un lot
démarrera sans que personne l'ait demandé — c'est-à-dire quand un déclencheur non humain existera.
L'ADR et `DECISIONS.md` portent la correction (§2 borne 2 et verrou n°2).

### Décisions actives — à relire, pas à rouvrir

1. **Le préréglage n'est PAS stocké.** Six clés plates ; `preset_of()` le **dérive**. Un mode
   stocké *plus* six clés donnerait deux réponses à une seule question (le mal que le §G.1 a évité
   en refusant une colonne `authority`).
2. **L'autorité est un PARAMÈTRE d'`equip_notion`, jamais une lecture des réglages.** Un service
   qui lirait le palier deviendrait inappelable par le Conseil de classe et la composition
   champion, dont l'autorité reste `parent_bulk` **quel que soit le palier**.
3. **Le palier se branche dans la SÉLECTION** (`select_notions`), jamais dans l'orchestrateur —
   c'est ce que l'addendum ADR-0031 avait préservé, et ça rend le palier 3 possible sans rouvrir
   l'ADR-0021 §2.
4. **`choices` EST le verrou, et il vient du serveur.** Le front n'a aucune liste de paliers en
   dur : le jour où le veto obtient sa surface, le serveur rouvre le palier 3 d'A1 et *Autonome*
   redevient offert **sans qu'une ligne du front change**.
5. **A0b (cartes SRS) est verrouillé à 3, et ce n'est pas une doctrine — c'est un constat** :
   `spaced_review_cards` n'a ni `validation_status` ni `validated_by`. « Vous validez » serait un
   réglage sans effet. **Descendre A0b suppose de construire son gate d'abord.**
6. **Monotonie** : A1 = 3 force A0a = 3. On ne sert pas un cours non relu tout en relisant les
   fiches qui en dérivent.
7. **Aucun compteur, aucun ratio de provenance** sur cette page (§F.2). Le seul chiffre est celui
   de l'observation du 2 août, **daté et non recalculé**.
8. **`VETO_SURFACE_AVAILABLE = False`** (`settings/service.py`) : le palier 3 d'A1 est refusé
   serveur tant que le veto n'a pas d'écran. **Une seule ligne à basculer**, à la fin du chantier
   du Journal — et trois tests décrivent déjà le monde d'après.

### Les deux test-verrous REMPLACÉS (et pourquoi ce n'est pas un ajustement)

`ParametresPage.test.tsx` interdisait **tout bouton** (`queryAllByRole("button")).toHaveLength(0)`),
écrit le 2026-08-02 avec ce motif : *« une page où des commandes ne font rien est un piège le jour
où d'autres engagent l'autonomie de ZETIS »*. **Ce jour était celui-ci.**

- « aucune commande qui ne fait rien » → **« toute commande est branchée, ou verrouillée AVEC son
  motif »** : le test **clique chaque bouton activé** et exige un effet observable. Plus strict
  qu'avant.
- « autonomie indisponible avec son motif » → **« le régime *Autonome* est indisponible avec son
  motif »** : même doctrine, déplacée du placeholder vers le régime que le serveur refuse.

### Vérifié EN VRAI (backend + Postgres réels, `:8002` / `:5178`)

Chargement → *Semi-autonome*, *Autonome* grisé avec son motif, 5 lignes verrouillées motif visible ;
clic « Vous validez » → régime dérivé *Manuel*, boutons activés, **aucun appel réseau** ; clic
`Enregistrer` → **`PUT` 200 + six lignes plates en base** ; **rechargement complet** → l'état vient
du serveur ; retour à *Semi-autonome* → `a0a` repasse à `'3'`.

⚠️ **Un défaut n'a été vu QU'À L'ÉCRAN** : les descriptions d'A3 et A4 répétaient mot pour mot le
motif renvoyé par le serveur — la ligne disait deux fois la même phrase. Corrigé : le front dit
**ce que la classe est**, le serveur dit **pourquoi elle est verrouillée**.

**Non vérifiable en vrai** : la modale de révocation d'A1 (le serveur refuse le palier 3). Couverte
par trois tests sous un serveur simulé « après le Journal ».

### ▶▶▶ L'AXE 2 EST CADRÉ — ADR-0035, `4bd4d8e` sur `main` (2026-08-02)

**Écrit AVANT l'ADR-0034 et livré APRÈS lui**, sur décision du user : dessiner le Journal en
sachant qu'il devra rendre lisibles des lots que **personne n'a demandés** évite de le construire
deux fois. **Ne pas re-cadrer, ne pas rouvrir — relire.**

Ce que le read-before-code a établi, et qui change l'estimation du chantier :

- **Aucune migration, aucune dépendance nouvelle.** `production_runs` porte déjà `TRIGGERS` (six
  valeurs), `AUTHORIZED_BY`, les FK typées et `TRIGGER_REFERENCE`.
- **`authority_for` est déjà écrite pour l'axe 2** : `parent_rule` s'émettra **sans qu'une ligne du
  runner change**. Vérifié dans le code.
- ⚠️ **`production_worker.py` porte `with_scheduler=False` AVEC son motif écrit** (« aucun cron…
  "tous les dimanches, produire quelque chose" »). L'ADR-0035 **révoque** cette ligne et
  **satisfait** l'objection au lieu de la contourner : le scan se réveille pour **regarder** si le
  monde réel a demandé quelque chose, il ne produit sur aucun calendrier.
- ⚠️ **Le régulateur actuel sera AVEUGLE au palier 3** : `pending_backlog` compte `Fiche`+`Mindmap`
  en `pending`, or plus rien n'est `pending` au palier 3 → le compteur resterait à **zéro** dans le
  seul régime où il serait vital. **C'est la seule chose vraiment à construire.**

Décisions figées (détail dans l'ADR) : déclencheur v1 = **`agenda` seul**, `kind='controle'`,
cinq conditions ; **`evidence` écarté** (il ferait décider ZETIS sur sa propre mesure) ;
**idempotence par la référence**, jamais par un `produced_at` sur l'agenda ; régulateur = **N lots
automatiques par fenêtre glissante (défaut 2), et il REFUSE** ; **7ᵉ clé indépendante du palier**,
**hors d'`AUTONOMY_CLASSES`** pour qu'un préréglage n'arme jamais le déclencheur ; **pas de
démarrage pendant que Massimo travaille**.

> Le « prochain pas » et la recette d'ouverture du mode Autonome ont été RETIRÉS de ce
> bloc le 2026-08-03 : ils sont **exécutés**. Les garder ferait relire une consigne périmée
> comme une consigne active — c'est exactement l'erreur que ce fichier a déjà payée deux fois.

---

## Historique — produire un chapitre en une fois (ADR-0031)

**Chantier : produire un chapitre en une fois (ADR-0031) — CLOS. Code livré, observation menée.
Ce qui reste est une DÉCISION, pas du code.**

**✅ MERGÉ dans `main`** — squash **`731394b`**, PR
[#68](https://github.com/NeuronXcore/zetis-school/pull/68), le 2026-08-02. Branche
`feat/production-en-lot` **supprimée** (locale et distante). **Rien à pousser, rien à reprendre
côté Git.** Les décisions (ADR-0031 + son addendum, addendum §G) sont sur `main` à part.

⚠️ Le squash a dissous **12 messages de commit** qui portaient chacun leurs motifs — read-before-code
slice par slice. Ils restent lisibles dans la PR #68 et dans les ADR.

**728 backend · 278 Papa · 453 Massimo · tsc — verts. Aucun test existant modifié sur les trois
slices** (c'était le critère du refactor de la slice A, et il a tenu jusqu'au bout).

Migrations **`f4a5b6c7d8e9`** (journal) et **`a5b6c7d8e9f0`** (avancement) **appliquées sur la base
de dev**.

⚠️ **Le worker ne tourne PAS en permanence.** Il se lance à la main —
`cd apps/backend && .venv/bin/python -m app.production_worker` — et sans lui un lot reste
`queued` indéfiniment. Un run tué avec son worker reste `running` pour toujours : c'est un zombie
qui fait clignoter la pastille d'en-tête. Aucun garde-fou n'existe encore contre ça.

### Résidus de clôture — ce qui reste dans l'environnement

- ⚠️ **La base de dev n'est PAS vierge.** Le lot d'observation y a laissé **33 objets réels** sur
  le chapitre « Fractions » (4 fiches, 4 cartes mentales, 5 quiz, 20 cartes SRS), dont **2 en
  attente de relecture de Papa**. Ce n'est pas du déchet de test : c'est du contenu que Massimo
  verra. Les chiffres de l'observation ci-dessous décrivent donc aussi l'**état actuel de la
  base**, pas seulement une mesure passée.
- **Runs en base** : `2` (chapitre Grammaire, 0 pièce), `3` (l'observation, `done`), `6`
  (interrompu, marqué `failed` à 0/3 — un run tué avec son worker resterait `running` à vie
  sinon).
- **Voir l'app tourner** : la marche à suivre et ses deux pièges vivent dans
  `docs/WORKFLOW.md §5bis` (paires appairées de `.claude/launch.json`, et les serveurs lancés par
  l'agent meurent avec sa session). Ce renvoi est ici exprès : il survit à la réécriture de ce
  fichier au chantier suivant.

### ✅ L'OBSERVATION A ÉTÉ MENÉE — et sa réponse change la feuille de route

**Lot réel : chapitre « Fractions », 11 notions, 12 min 35 s — 69 s par notion, 0 erreur.**

| | |
|---|---|
| Taux de dégradation | **0 %** — aucun `try/except` déclenché |
| Généré | 4 fiches · 4 cartes mentales · 5 quiz · 20 cartes SRS = **33 objets** |
| Sauté (déjà présent) | 11 cours · 7 fiches · 7 cartes · 6 quiz · 4 lots SRS |
| Cours produits | **0** — le gate du §7 n'a rien eu à bloquer, tout était déjà validé |

> **« 15 objets d'un coup sont-ils relisables ? » — LA QUESTION NE SE POSE PAS, et la raison
> devrait inquiéter plus que rassurer.**
>
> Sur 33 objets produits, **2 seulement** arrivent en attente de relecture. Les 31 autres ont
> atteint Massimo sans qu'aucun humain les voie : 8 auto-validés `parent_bulk` par l'équipement,
> 5 quiz en `system` (sans relecture **par doctrine**, ADR-0014 §2), 20 cartes SRS **sans aucun
> gate de validation**.
>
> L'ADR-0023 craignait que Papa ne suive pas le rythme. **Il suit très bien : on ne lui demande
> presque rien.**

**Conséquence sur le chantier suivant.** La conditionnelle de l'ADR-0023 (« si non relisable → la
file de relecture ») **ne se déclenche pas** : il n'y a pas d'arriéré. La vraie question que
l'observation fait remonter est ailleurs :

> **Est-il acceptable que 31 objets sur 33 atteignent Massimo par `parent_bulk` à l'échelle d'un
> chapitre ?** C'est le débat du §G sur le palier 3 — sauf qu'on découvre qu'on **y est déjà**,
> sans l'avoir décidé, par la soupape §5ter de l'ADR-0021 appliquée à un scope 11 fois plus large
> que celui pour lequel elle a été ouverte.

⚠️ **À trancher avant d'écrire l'ADR-0032**, et ce n'est plus la question que l'ADR-0031 posait.

### ▶ PROCHAIN CHANTIER (décidé) : les réglages et paliers de l'autonomisation

L'ADR-0031 interdisait d'écrire l'ADR-0032 avant la réponse à son observation. **Elle est là, donc
c'est débloqué** — mais elle change le cahier des charges du panneau, et c'est le piège de ce
chantier :

> Le §8 du cadrage décrit un panneau qui **fait monter Papa d'un palier**. L'observation montre
> qu'il est **déjà au palier 3** pour les dérivés, sans l'avoir choisi : 31 objets sur 33 servis
> par `parent_bulk` / `system` / sans gate.
>
> **Le premier travail du panneau n'est donc pas de laisser Papa monter. C'est de lui montrer où
> il est déjà.** Un écran qui propose « Laisser ZETIS servir » sur une classe qui sert déjà sans
> relecture serait un mensonge de plus.

Trois conséquences à tenir dans l'ADR-0032 :

1. **La matrice classe × palier du §G doit être RELUE au réel avant d'être codée.** A0a est censé
   viser le palier 3 « plus tard » ; il y est. A0b (cartes SRS) aussi — 20 cartes servies sans
   aucun gate de validation.
2. **Le régulateur reste le chantier**, pas la matrice (déjà noté au §G : le §F.4 avait acté que
   `parent_bulk` couvre l'auto-validation ; ce qui change au palier 3, c'est la disparition du
   geste par lot). L'observation le confirme : le geste par lot est aujourd'hui **le seul frein**.
3. ⚠️ **Dette du §G à solder dans la même passe** : `CoverageCellView` rend `null` **comme**
   `parent_bulk` — provenance inconnue et validation groupée indistinguables. Ajouter la teinte
   `parent_rule` sans corriger ça laisserait trois valeurs sur quatre se ressembler.

Rappel du §8 : six clés plates dans `app_settings`, **jamais un blob JSON** ; routes actuelles
namespacées `/api/agenda/settings` → **un routeur de settings neutre est à créer** ; les deux
classes figées (A1 cours, A4 destructif) sont **lisibles et non écrivables**, refus côté serveur.

### Deux défauts trouvés PARCE QUE le lot tournait, invisibles en test

1. **`massimo_is_active` laissait sa transaction ouverte.** Le worker restait `idle in
   transaction` entre deux notions, gardait un `AccessShareLock`, et un `ALTER TABLE` a bloqué
   derrière — puis **toutes** les requêtes derrière l'ALTER, interface comprise. Un lot d'une heure
   gelait toute migration. Corrigé (`rollback` dans un `finally`, motif écrit dans le code).
2. **La barre de progression mentait d'un facteur 2** (150 s estimées contre 69 s réelles). D'où
   `production_runs.total_notions` / `done_notions` et un `progress_pct` **calculé serveur** : il
   compte des notions équipées, pas des secondes écoulées.

### L'indicateur d'en-tête Papa (livré le 2026-08-02)

Pastille « ⚡ ZETIS produit un chapitre · 42% » → modale de détail → « Voir le chapitre », qui
**met le chapitre en évidence** sur la Couverture et **ouvre d'office la matière qui le contient**
(sans ça le surlignage restait caché dans un accordéon replié).

⚠️ **Un PROCESSUS, jamais un STOCK** — écrit à trois endroits parce que la dérive est facile :
y ajouter « 12 contenus en attente » ferait de l'en-tête un reproche permanent, ce que le §F.2
interdit. **Papa seulement** : le refus côté Massimo est documenté dans le hook (le lui montrer
serait une promesse, donc une relance, et rendrait l'invariant V1 du §G impossible).

### Ce qui a été livré, et ce que chaque slice a corrigé de l'ADR

**L'ADR-0023, accepté le 2026-07-28, n'avait JAMAIS été implémenté** — il est passé **Remplacé**
par l'ADR-0031 (le *plan d'exécution*, pas la doctrine). Et le prérequis manquant de tout le
chantier, listé nulle part : **il n'existait aucune file d'exécution IA**.

| Slice | Livré | Constat du read-before-code |
|---|---|---|
| **A** | extraction de `equip_notion` vers `production/`, `plan(scope)` | deux appelants et non trois ; le motif des imports paresseux a changé (plus un cycle : le coût d'import) ; **le filtre `validated` ne peut pas vivre dans le résolveur** → a produit l'addendum |
| **B** | `production_runs` + migration, file RQ dédiée, worker, endpoint 202, gate, régulateur | le sandbox de `worker-media` **ne transfère pas** (Ollama est sur l'hôte) ; **ce n'est pas un paquet séparé** (worker-media l'est par son *runtime* node:20) ; **le §4 n'a aucune colonne de scope** → `chapter_id` ; `Quiz` et `Lesson` **hors arriéré** de relecture |
| **C** | aperçu du gate, bouton actif, modale preview → confirm | **les deux passes étaient déjà à moitié à l'écran** : « ✅ Valider les N leçons » **EST** la passe 1 — rien à dessiner, un ordre à rendre lisible |

**Trois choses à ne pas redécouvrir :**

- **`plan(scope)` n'est pas une seconde résolution** : il appelle `coverage.notions_by_lesson`. La
  page affiche ce que la production exécutera **par construction**, pas par coïncidence surveillée.
- **Le gate du §7 est une SÉLECTION**, pas une modification d'orchestrateur : on n'équipe que les
  notions dont la leçon est validée avec contenu. `equip_notion` **n'est pas modifié** — ses deux
  chemins d'auto-validation du cours deviennent inatteignables depuis un lot. Verrou n°1 :
  *un lot sur un chapitre entièrement en brouillon ne valide AUCUNE leçon*.
- **« Massimo passe devant » se décide ENTRE deux notions, jamais pendant** (un appel LLM n'est pas
  préemptible), et **la concurrence 1 n'est pas provisoire** (un seul GPU).

⚠️ **Le tamponnage `production_run_id` se fait par filigrane d'id** (max id avant/après chaque
notion) : exact, et ça évite de toucher `equip_notion`, que l'addendum interdit de modifier.

### Les décisions posées, à relire et non à rouvrir

**Addendum ADR-0011 §G** (`adr-0011-addendum-autorite-paliers.md`) :

- **`parent_rule` = une VALEUR de plus sur `validated_by`, pas une colonne.** `parent` (pièce) →
  `parent_bulk` (lot) → `parent_rule` (règle). Une colonne `authority` donnerait deux réponses à
  une seule question. **Légale et NON ÉMISE** en l'état.
- ⚠️ **Le §F.4 avait DÉJÀ acté que `parent_bulk` couvre l'auto-validation de l'équipement.** Ce qui
  est nouveau au palier 3 n'est donc **pas** « du contenu non relu atteint Massimo » — c'est déjà
  vrai — mais la disparition du **geste par lot**, aujourd'hui seul régulateur de volume existant.
  **Ça déplace le poids du chantier vers le régulateur**, pas vers la matrice.
- **Matrice classe × palier** : A0a dérivés inertes → 3 ; **A0b cartes SRS séparées** (leur erreur
  ne dort pas, elle se compose) → 3 ; A1 cours → **2 FIGÉ** ; A2 référentiel → 1 ; A3 création de
  mission → 2 (**élire ≠ créer**) ; A4 terminal → **jamais**.
- **Veto passif et paresseux** : la **consommation**, pas l'horloge, ferme la fenêtre. Traçable
  pour les **quatre** familles — le « trou » fiches/mindmaps n'existait pas.
- ⚠️ **Deux coûts nommés** : le veto est un **droit sans notification** (point ouvert de
  l'ADR-0032) ; et le nuancier Papa (`CoverageCellView`) rend déjà `null` **comme** `parent_bulk`,
  à corriger avant d'ajouter une 4ᵉ teinte.

**ADR-0031** (`adr-0031-production-en-lot-et-journal.md`) : extraction, `plan(scope)` pure et
partagée avec la matrice, endpoint 202 + file RQ + worker, `production_runs` (`trigger` sur le
**lot** jamais sur la pièce, **FK typées jamais polymorphes**, aucune rétro-attribution),
`PRODUCTION_MAX_PENDING` enfin écrit (**régulateur du palier 2 seulement**), bouton Couverture
activé. **Seuls `trigger='manual'` + `authorized_by='parent_direct'` sont émis.**

**Addendum ADR-0031** (`adr-0031-addendum-deux-passes-et-gate-cours.md`) — **la décision à ne
surtout pas rouvrir** :

- Le §7 de l'ADR-0023 (« le seul gate humain obligatoire et bloquant, et il ne bouge pas »)
  **n'avait jamais été implémenté** : `equip_notion` valide le cours lui-même par **deux chemins**
  — un brouillon que Papa avait peut-être délibérément laissé en attente, et un cours qu'il n'a
  jamais vu.
- **Ce n'est pas un bug** : à l'échelle d'UNE notion c'est la soupape §5ter de l'ADR-0021,
  « ouverte étroitement », que le §F.4 assume et trace en `parent_bulk`. **C'est l'ÉCHELLE qui la
  rend inacceptable** — un clic sur un chapitre ferait rédiger et auto-valider quinze cours.
- **Le gate vit dans la SÉLECTION, pas dans l'orchestrateur.** `equip_notion` ne change pas :
  toucher l'orchestrateur régresserait le Conseil de classe et la composition champion, et
  rouvrirait l'ADR-0021 §2 que personne n'a demandé à rouvrir.
- ⚠️ **Un chapitre neuf ne produira RIEN**, et l'écran doit le dire. C'est le point que l'addendum
  désigne comme le plus facile à rater ; la modale d'aperçu écrit explicitement « ce n'est pas une
  erreur ».

---

## Historique — le retour de demande se ferme dans le chat (addendum ADR-0026)

**Chantier : le retour de demande se ferme dans le chat (addendum ADR-0026).**

**✅ MERGÉ dans `main`** — squash **`e1d1b06`**, PR
[#66](https://github.com/NeuronXcore/zetis-school/pull/66), le 2026-08-02. Branche
`feat/chat-retour-demandes` **supprimée** (locale et distante). **Rien à pousser, rien à reprendre
côté Git.** L'addendum ADR est sur `main` à part (`66edd88`, poussé avant la PR).

**703 backend · 451 Massimo · tsc — verts** (backend stable sur plusieurs `PYTHONHASHSEED`, ce
n'est pas décoratif : voir piège 3). **Migration `e3f4a5b6c7d8` APPLIQUÉE sur la base de dev.**

⚠️ **Ne pas ré-implémenter** ce qui suit : c'est de l'histoire, gardée pour ses pièges et ses
motifs de décision.

⚠️ **Le squash a dissous les trois messages de commit** (backend / front / mémoire), qui portaient
chacun leurs motifs de décision. Ils restent lisibles dans le corps de la PR #66 et dans l'addendum
— mais une révocation isolée d'une des trois parties demanderait de reconstruire le diff à la main.
Même effet qu'à la PR #65, et c'est le style de la maison depuis la #60.

### Le problème que ce lot résout

`content_requests` et `notion_requests` sont les **deux seuls endroits où Massimo parle en son nom
propre**, et étaient les deux seules boucles asynchrones **sans retour** : ZETIS disait « je le
note pour Papa » et rien ne revenait jamais, même une fois le contenu produit. La boucle se ferme
maintenant **là où elle s'est ouverte** : dans le chat, en pull, une seule fois, à l'ouverture de
la session.

### Décisions actives — à relire, pas à rouvrir

1. **Le gate est la DISPONIBILITÉ, jamais le statut.** « Fait » côté Papa ne change qu'une colonne.
   L'annonce passe par `resolve_panoply`. Une demande `done` non servable **ne s'annonce pas ET
   n'est pas tamponnée**. Sans ça on reconstruit le mensonge tué le 2026-07-30.
2. **Pour `notion_requests`, le résolveur EST la preuve.** La table n'a pas de `skill_id`, donc
   `added` est invérifiable. On rejoue `resolve_skill` sur le texte : il avait échoué à la création
   — c'est pourquoi la ligne existe — donc qu'il réussisse **prouve** l'ajout au programme.
3. **Nommer 2, tamponner TOUT.** Tamponner seulement ce qu'on nomme ferait s'empiler le reliquat.
4. **Le tampon se pose à la composition**, pas à l'affichage : une annonce jamais lue est perdue.
   Prix assumé de « aucune file qui grossit ».
5. **Le refus n'a pas de canal** (« Ignorer » → silence, jamais un « non » porté par la machine) et
   **la route 1 reste muette** (produire sans demande n'annonce rien). Deux asymétries **gravées**,
   pour que personne ne « complète la symétrie ».
6. **L'annonce s'AFFICHE, elle ne se parle pas** (§8 de l'addendum, écart trouvé en vrai).
7. **`quiz` et `capsule` ne s'annoncent pas** : `_notion_route` n'a pas leur branche. Pas de route
   ⇒ pas de carte ⇒ pas d'annonce ⇒ **pas de tampon**. Ils redeviendront annonçables quand la
   branche existera — ne pas construire de route dans `announce.py`.

### ⚠️ Trois pièges payés en vrai — tous invisibles en test

1. **`playSpeech` se bloque pour toujours au montage.** Il fait `await ctx.resume()` sur un
   `AudioContext` suspendu ; sans geste utilisateur préalable la promesse **ne se résout jamais**.
   Tout code qui veut parler au chargement d'une page tombera dedans. jsdom n'a pas d'AudioContext
   → le repli muet masque le défaut en test.
2. **StrictMode + garde d'appel-unique + drapeau `cancelled` = résultat jeté.** L'effet joue, se
   démonte, rejoue ; le garde bloque le second passage, donc le `cancelled` du cleanup du premier
   détruit la réponse du seul fetch réellement parti. **Deux garde-fous corrects qui s'annulent.**
   `renderPage()` des tests ne monte PAS sous StrictMode — un verrou dédié le fait désormais.
3. **`FakeEmbeddingProvider` n'est PAS déterministe.** Il dérive ses vecteurs de `hash()`,
   randomisé par processus : deux textes quelconques y sont souvent colinéaires. Tout test qui
   dépend d'une **non-résolution** est flaky ~50 %. Utiliser `_ExactMatchEmbedder`
   (`test_chat_announce.py`, crc32) — réutilisable pour tout futur test de résolution.

> **Méthode qui a payé** : pour chacun de ces défauts, la contre-épreuve a été faite — code fautif
> réintroduit, test vérifié tombant, puis restauré. Trois tests écrits avant cette discipline
> validaient un chemin que le navigateur ne prend jamais.

### Résidus de clôture

- **Données de dev consommées** : les 4 `notion_requests` `added` et la `content_request` de la
  notion 126 sont maintenant **tamponnées** (`announced_at` non nul). Pour rejouer la démo, remettre
  `announced_at = NULL` (une ligne de Python, cf. fin de la conversation du 2026-08-02).
- **Non écrit dans l'ADR, et ça mériterait une phrase** : pour les `notion_requests`, « tamponner
  tout le lot » est borné par `MAX_NOTION_REQUESTS_SCANNED = 3`. Une file de 5 notions ajoutées se
  draine donc en **deux ouvertures**, pas une. Observé en vrai, conforme au plafond décidé, mais un
  lecteur croira le drain complet en une fois.
- **Vérifié en session réelle** (Chrome connecté, backend + Postgres réels) : annonce affichée,
  avatar endormi, tap → route ancrée, trace sur la **bonne** notion, extinction au rechargement,
  et la contre-épreuve du gate (demande `done` sans contenu → ni annonce ni tampon).

### Les constats de vérification du cadrage — TOUS ACTÉS DEPUIS

> ⚠️ Ce n'est plus une consigne : les quatre points ci-dessous ont été traités (renumérotation
> faite, ADR-0023 passé **Remplacé**, absence de file d'exécution érigée en décision par
> l'ADR-0031, lot de corrections mergé PR #67). Conservés pour leurs **motifs** — voir l'état à la
> reprise en tête de fichier pour ce qui est vivant.

Ce lot était le **document 3** d'un cadrage plus large (« Autonomisation progressive de ZETIS »,
paliers 1→2→3), livré en premier parce qu'il ne dépendait de rien et réparait une dette d'honnêteté
active. Le cadrage a été **vérifié dans le code** avant rédaction ; ce qu'il faut en retenir :

1. **`ADR-0030` est PRIS** (témoins de nouveauté). Le cadrage l'attribuait à `production_runs` —
   décaler : `production_runs` → **ADR-0031**, palier 3 → **ADR-0032**, indicateur d'autonomie de
   Massimo → **ADR-0033**.
2. **`batch_id` et `PRODUCTION_MAX_PENDING` n'existent QUE dans la prose de l'ADR-0023.** Donc
   `production_runs` est une **création**, la Slice B de l'ADR-0023 fusionne avec ce chantier, et
   le plafond de relecture n'a jamais été armé (le §6 du cadrage dit « désarmé » : à corriger).
3. **Il n'y a AUCUNE file d'exécution IA.** `apps/worker-ai/` est un README de deux lignes ; la
   seule `Queue` RQ (`core/queue.py`) sert le worker-**media**. Toute la génération est
   **synchrone dans le backend**, un seul Ollama, un seul GPU. Le §7 du cadrage (« départ au plus
   tard », « Massimo passe devant ») suppose une exécution préemptible qui n'existe pas —
   **prérequis dur absent du §12**, plus lourd que `system_state`.
4. **Le « trou » fiches/mindmaps du §5 n'existe pas** : `fiche_views` et `mindmap_views` (colonnes
   `seen_at`) tracent déjà la consommation des quatre objets. Le cadrage a été induit en erreur par
   un docstring périmé — `mindmaps/router.py` dit encore « placeholder Slice A, vues non
   persistées », c'est **faux** depuis l'ADR-0030 §4.

**✅ Lot de corrections FAIT** — squash `12e4a2f`, PR
[#67](https://github.com/NeuronXcore/zetis-school/pull/67), le 2026-08-02 ; branche
`fix/lot-corrections` supprimée. Les trois items sont soldés : `MissionStudentOut.origin` retiré,
le docstring de `mindmaps/router.py` remis au réel, la page Paramètres Papa remplacée par un état
honnête.

⚠️ **Un quatrième défaut n'a été trouvé QU'À L'ÉCRAN**, après le retrait d'`origin` : le badge de
type `manual` disait « Mission de Papa » — une seconde signature d'auteur, qui ne venait pas du
même champ et que le cadrage n'avait pas vue. Elle **divergeait de `page-missions.md`**, qui la
mandatait : arrêt, arbitrage du commanditaire, puis spec corrigée. Devenue « Sur mesure ».
**Sans le passage dans le navigateur, la moitié du défaut serait restée.**

---

## Historique — la page matière devient un index de notions (ADR-0024 + ADR-0027)

**Chantier : la page matière devient un index de notions (addenda ADR-0024 + ADR-0027).**

**✅ MERGÉ dans `main`** — squash **`600aef4`**, PR
[#65](https://github.com/NeuronXcore/zetis-school/pull/65), le 2026-08-02. Branche
`feat/page-matiere` **supprimée** (locale et distante). **Rien à pousser, rien à reprendre côté
Git.** Les deux ADR addenda sont sur `main` (`b06123c`, `6c99dc1`).

**690 backend · 447 Massimo · 270 Papa · 2 typecheck · build — tous verts.**
**Zéro table, zéro migration.**

⚠️ **Ne pas ré-implémenter** ce qui suit : c'est de l'histoire, gardée pour ses pièges et ses
motifs de décision.

### Ce qui restait ouvert à la clôture

1. **Le seuil 620 px** (où la panoplie de 7 pastilles se masque) n'a **jamais été vu** se masquer.
   La règle est bien compilée (`@media(min-width:620px)` dans le CSS construit), mais le
   redimensionnement de fenêtre n'a pas changé le viewport capturé. **À regarder sur iPhone.**
2. **Le toast** « C'est noté par ZETIS » (2,8 s) n'a pas été capturé — le bouton passe bien à
   « demandé » et sa lueur s'éteint, donc le chemin est prouvé, mais pas le toast lui-même.
3. ⚠️ **5 lignes de test en base de dev** : `content_requests` **#9 à #13**,
   `source=subject_page`, créées pendant la vérification live. Elles apparaissent dans la file de
   Papa (page Couverture) — à écarter là-bas.
4. **La maquette `mockup-page-matiere-v1.html` n'a jamais existé** dans le dépôt. Signalée
   bloquante, puis tranchée par le user : **codé d'après la spec**, qui décrivait la recherche,
   l'accordéon, le panneau, les demandes et les états avec assez de précision. Le rendu suit donc
   la spec + les conventions Massimo, **pas** une maquette.
5. ⚠️ **La décision de sécurité n'est plus isolable dans l'historique.** L'addendum ADR-0027
   exigeait un « commit séparé, isolable » ; le **squash** l'a dissoute (choix du user, conforme
   aux PR #60-#64). Elle reste traçable par l'ADR et le corps de la PR #65, mais une révocation
   isolée demanderait de reconstruire le diff à la main.

### FAIT — affinage au vu de l'écran (7 commits, après la slice B)

Le user a lancé l'app et fait évoluer la page. **Chacun de ces tours a sa décision, et plusieurs
divergent de l'ADR — c'est écrit, pas subi.**

1. **Chapitres repliés à l'ouverture** (`2775e6a`) — le premier s'ouvrait d'office ; la page
   présentait donc le contenu d'un chapitre choisi POUR Massimo. La recherche, elle, ouvre
   toujours d'office ce qu'elle trouve.
2. **« Demander à ZETIS », en orange électrique** (`cd2588f`) — le libellé disait « à Papa ».
   L'interlocuteur de Massimo est ZETIS (le même que dans le chat) ; Papa reste le
   **destinataire** (`source: "subject_page"` inchangé). Token `--color-zetis-request` `#ff7a1a`.
3. **La demande RAYONNE au lieu de crier** (`d2d07ba`) — la teinte n'a aucune marge (l'or de
   « ZETIS parle » est à **18°**, le rouge est banni) : l'axe libre est la **luminosité**, et
   c'est déjà la grammaire de l'app. ⚠️ **Un futur ajustement doit rendre cet orange plus
   LUMINEUX, jamais plus VIF.** Le halo s'éteint une fois demandé (une lueur sur une demande
   transmise inviterait à la refaire).
4. **Les chapitres repliés disent « N prêtes »** (`2311b34`) — sinon il fallait tout déplier pour
   trouver où travailler. Un COMPTE, jamais un ratio : un test interdit tout dénominateur. À
   zéro, aucun témoin et **aucune atténuation** (un chapitre grisé se lirait comme un reproche).
5. **Phrase « ZETIS ne fabrique rien tout seul » SUPPRIMÉE** (`fcd4eba`) — **divergence assumée
   avec l'addendum ADR-0027**, qui l'exigeait. Motif : ZETIS produira bientôt du contenu, la
   phrase deviendrait fausse. Le test qui la vérifiait a été **remplacé**, pas supprimé : il
   interdit maintenant « je te le prépare », tout délai, tout statut.
6. **Bande « ce que ZETIS a pour cette matière »** (`457ca5d`) — remplace la carte « N cartes à
   revoir », qui n'annonçait qu'un type sur six. **Zéro requête ajoutée** : la panoplie porte
   déjà les ids. `eli5` absent (il ne stocke rien, ce n'est pas un produit du catalogue).
7. **Le quiz devient cliquable, et l'inerte devient visible** (`104ccde`) — signalement du user :
   « le KPI 1 quiz dans mathématiques ne marche pas ». **Audit de la base : le compte était
   juste** (mathématiques a bien 1 quiz, les 8 matières vérifiées). Ce qui ne marchait pas, c'est
   le **clic** : `quiz` était non cliquable par décision, mais rendu **comme une pastille
   normale**. `/quiz` accepte désormais **`?subject=`** (patron de `/revision` et `/eli5`) et
   porte le rétrolien ; et **toute pastille non ouvrable est visiblement inerte** (pointillés,
   atténuation, `aria-label` qui le dit). Ne reste dans ce cas que `capsule`.

### FAIT — slice B (frontend Massimo), 5 commits

**La page `/subjects/:slug` est écrite et testée.**

1. **`session_size` par matière** (`3fd4f22`) — petit ajout backend : `ReviewSubjectDue`
   expose `min(REVIEW_SESSION_MAX_SUBJECT, due_count)`. `flash_size` était GLOBAL, `due_count`
   est l'arriéré. Le calcul vit là où vit la constante.
2. **Table `kind → route` extraite** (`6c112ad`) — `lib/notionRoutes.ts`, PUR (zéro import de
   valeur) + `useOpenNotionAction`. Le `returnTo` figé à « /galaxy » devient un paramètre.
3. **Moteur de budget + pliage NFD** (`0cc6534`) — `src/test/bundleGraph.ts` partagé,
   `lib/searchFold.ts` avec carte d'offsets.
4. **La page** (`e8b61b8`) — `lib/panoply.ts`, `useSubjectPanoply` (TOUTE la règle métier),
   `components/matiere/*`, `matiere.bundle.test.ts`, 28 tests de page.
5. **Rétrolien partagé** (`cc36c3d`) — `SubjectBackLink` monté sur les 5 surfaces filles.

**⚠️ LA PAGE N'A PAS ÉTÉ VUE À L'ÉCRAN.** Le navigateur intégré n'est pas connecté. Tout est
prouvé par test, rien par l'œil. Restent à vérifier en vrai : la recherche à la frappe
(accents, surlignage, `Échap`), l'accordéon, le panneau, le toast de demande, le seuil 620 px
où la panoplie se masque, et les 5 rétroliens dont celui d'ELI5 après rechargement.

### Les décisions de la slice B (prises avec le user, ne pas les rouvrir)

- **La carte « Reprendre » est DESCOPÉE.** Aucune route ne sert « dernier contenu ouvert »
  (`last_notion` est global, sans lien, fenêtre 30 j). La spec dit « deux cartes AU PLUS,
  jamais rendues à vide » : on en rend une. À rouvrir avec un vrai endpoint, pas avant.
- **Le nombre de « Prêt à revoir » vient du SERVEUR** (`session_size`), jamais d'un `8` recopié
  dans le front.
- **Le rétrolien passe par `?from=`**, pas `?subject=` — ce dernier est déjà lu sur `/eli5` et
  `/revision`, où il DÉCLENCHE une action.
- La panoplie ouvre `/revision?subject=X&from=X` : deux paramètres parce que deux rôles.

### Les pièges de la slice B

1. ⚠️ **La table `kind → route` n'était couverte par AUCUN test.** 9 cas de caractérisation
   écrits d'abord ; 7 intacts après extraction, 2 changés exprès (`eli5`/`revision` gagnent
   `&from=`). Ne pas refaire un refactor de routage sans ce filet.
2. ⚠️ **`normalizeSearch` change la LONGUEUR de la chaîne** (NFD décompose puis supprime) : ses
   index ne mappent pas 1:1 sur l'original. Surligner d'après eux décale le `<mark>` d'un cran
   PAR ACCENT. D'où `fold()` et sa carte d'offsets. Filtre et surlignage partagent le même pli.
3. ⚠️ **`NotionActionPanel` NE tire PAS three.js** — le prompt de slice l'affirmait, c'est faux.
   Le baril `@zetis/ui/galaxy` est léger ; three vit derrière `@zetis/ui/galaxy/canvas` et
   `brainGeometry.ts`, tous deux hors baril. La page ne l'importe quand même pas, mais pour une
   autre raison (elle partage la table, pas le composant) — et un test le verrouille.
4. ⚠️ **`staticImports` du moteur de budget a un faux positif** : `export const X = "from"`
   ressemble à un `export … from "…"`. Ne pas « corriger » le moteur (ça changerait le test de
   l'Accueil) — vérifier autrement, comme le fait `matiere.bundle.test.ts`.
5. ⚠️ **`cours` et `eli5` sont TOUJOURS indisponibles ensemble** et se demandent tous deux comme
   `cours`. Sans dédup, « tout ce qui manque » annoncerait 7 — le vocabulaire n'a que 6 entrées.
   **Un `(7)` affiché EST ce bug.**
6. ⚠️ **`/revision?subject=` ne s'arrête jamais sur la page** : elle relance la session dès que
   le résumé arrive (sauf matière introuvable). Le rétrolien n'y sert que les arrivées sans deck.
7. ⚠️ **TOUS les chapitres sont repliés au chargement** — une notion n'est pas dans le DOM tant
   qu'on n'a pas déplié son chapitre. Piège classique des tests de cette page (le helper
   `ouvrirNotion(chapitre, notion)` l'impose).
8. ⚠️ **La panoplie n'expose que la ressource la PLUS RÉCENTE par leçon** (`MAX(id)` serveur), et
   plusieurs notions d'une même leçon portent le **même** `fiche_id`. Une leçon avec 3 fiches
   validées compte **1** dans la bande et **3** sur `/fiches`. **Les deux sont justes** — ne pas
   « corriger » l'écart. Corollaire : dédupliquer par `Set` est obligatoire, sinon le compte
   gonfle d'autant de notions que la leçon enseigne.
9. ⚠️ **Dans les tests, `/Voir le cours/` matche DEUX boutons** : l'activité et le « demander
   Voir le cours à ZETIS » voisin. Utiliser le helper `activite("…")`, qui ancre en début de
   libellé.
10. ⚠️ **Un test qui lit `window.location` sous `MemoryRouter` est vert À VIDE** — le routeur
    mémoire n'y touche pas. Pour vérifier une URL, monter une **sonde** qui lit
    `useSearchParams`. J'ai failli livrer ce faux positif sur la survie de `?from=`.
11. ⚠️ **Le compte peut être juste et la pastille cassée quand même.** Devant « ça ne marche
    pas », auditer la **donnée** avant de toucher au calcul : ici le compte était bon (audit
    des 8 matières), c'est l'**affordance** qui mentait.

### FAIT — slice A (backend), 688 tests verts

1. **`resolve_panoply(db, student_id=…, skill_ids=[…])`** dans `galaxy/service.py` : LE prédicat
   de disponibilité, en version ensembliste. `notion_panel` en est devenu le **consommateur
   mono-notion** et ne calcule plus rien. Les résolveurs mono de `missions` sont désormais des
   **enveloppes** de variantes `_ids` ensemblistes — une règle, une requête, deux granularités.
2. **`GET /api/student/subjects/{slug}/panoply`** (`get_current_user`), routeur `subjects_router`
   dans le module `galaxy` : matière → chapitres validés → notions → panoplie des 7 activités.
   **Aucun `mastery_score` sérialisé** (test-verrou sur la réponse brute).
3. **`POST /api/student/content-requests`** (`require_child`) — commit **séparé**, c'est une
   décision de sécurité. Écriture seule, trois garde-fous testés.
4. Types `SubjectPanoply` / `PanoplyChapter` / `PanoplyNotion` +
   `StudentContentRequest{Body,Result}` dans `packages/types/`.

**Zéro table, zéro migration.**

### Les cinq constats du read-before-code (ce que la doc supposait vs le code réel)

1. ⚠️ **Le prompt A se contredisait** : §2.1 exigeait que les tests de `notion_panel` passent
   **sans modification**, §2.3 exigeait de rendre `eli5.available` faux sans cours — or
   `test_galaxy.py` affirmait `dispo["eli5"] is True` **sur ce cas exact**. Tranché en séparant
   les deux temps : extraction d'abord (**668 tests verts, zéro modifié** — preuve jouée), puis
   bascule ELI5 qui a fait tomber **exactement une** assertion, retournée avec son motif.
2. ⚠️ **Deux fixtures de `test_content_requests` posaient `eli5 available=True` avec
   `cours available=False`** — un état que le prédicat **ne peut plus produire**. Corrigées
   **sans toucher à leurs assertions de comportement**.
3. ⚠️ **La règle ELI5 vivait en DEUX endroits dans `chat/actions.py`.** Le filtre de
   `_notion_menu` était une vraie duplication → **supprimé**. Celui de `_open_notion` **n'en est
   pas une** : c'est un choix de **routage** (déléguer au menu plutôt que tomber dans la branche
   « contenu absent »), éprouvé live. Conservé, mais il lit maintenant `eli5.available` au lieu
   de redériver depuis `cours.available`.
4. ⚠️ **Le plafond `CONTENT_REQUEST_MAX_KINDS = 7` est décrit comme « la panoplie entière »,
   mais le vocabulaire ne compte que SIX types demandables** (`eli5` se demande comme `cours`,
   `revision` comme `card`). Appliqué après dédup, il ne bornerait **rien**. Il est donc mesuré
   sur la charge **brute** : le plafond borne la TAILLE de l'appel, le vocabulaire borne son
   CONTENU.
5. ⚠️ **`app.routes` n'est PAS à plat** dans cette version de FastAPI (des `_IncludedRouter`, pas
   des `APIRoute`). Un test « telle route n'existe pas » écrit dessus passe **toujours**, à vide.
   Vérifier sur `app.openapi()["paths"]`.

### Chiffres mesurés

**14 requêtes SQL pour 3, 30 et 100 notions** — constant, mesuré (le test compare 3 vs 30).

### Décisions actives à ne pas rouvrir

- **Un seul prédicat de disponibilité dans le dépôt.** Si le test
  `test_la_route_en_lot_et_le_panneau_disent_la_meme_chose` casse, **ne pas l'ajuster** : aller
  chercher la duplication qui vient de réapparaître.
- **ELI5 n'est pas offert sans cours validé** — il s'ancre sur le cours canonique et dégraderait
  vers le modèle. La règle vit dans le prédicat, jamais dans une page.
- **Aucun `GET`/`PATCH` élève sur `content_requests`.** L'absence est la décision.
- **`mastery_score` ne sort pas de la route de matière.** `status` seul.
- **Un COMPTE, jamais un ratio.** Vaut pour « N prêtes » par chapitre comme pour la bande. Un
  dénominateur ferait un score (ADR-0024 §5) ; deux tests l'interdisent.
- **`session_size` et jamais `due_count`** sur toute surface enfant. Le fixture de test pose 42
  contre 8 précisément pour que le verrou puisse mordre.
- **L'orange de la demande se rend plus LUMINEUX, jamais plus VIF** (l'or est à 18°, le rouge est
  banni : la teinte n'a pas de marge).
- **Une pastille qui ne mène nulle part doit être visiblement INERTE** (pointillés, atténuation,
  `aria-label` explicite). Sinon elle se lit comme une panne — c'est arrivé avec le quiz le
  2026-08-01. **Une chose qui ressemble à un lien doit être un lien.** Seule `capsule` est encore
  dans ce cas (`/capsules` est global, aucun `/capsules/:slug`).

### ⚠️ Divergences ASSUMÉES avec les ADR — à porter dans un addendum

Le code s'écarte sciemment de deux points écrits. **Ce n'est pas de la dérive, c'est une décision
du user prise au vu de l'écran** — mais tant qu'aucun ADR ne l'enregistre, l'ADR et le code se
contredisent :

1. **« Demander à Papa » → « demander à ZETIS »** (addendum ADR-0027 §Geste).
2. **Phrase « ZETIS transmet la demande. Il ne fabrique rien tout seul. » SUPPRIMÉE** — l'addendum
   ADR-0027 l'exigeait. Motif : ZETIS produira bientôt du contenu lui-même.

La spec `page-matiere-dediee.md` porte les deux, avec leur motif. **Point ouvert qui en découle** :
le jour où ZETIS génère, faut-il que la demande déclenche la génération, ou passe-t-elle toujours
par la validation de Papa ? `CLAUDE.md` (« aucune réponse IA n'est vérité absolue, validation Papa
avant activation ») penche pour la seconde. **C'est une décision d'ADR, pas d'UI.**

### PROCHAIN PAS

**Aucun chantier en cours.** Le lot page-matière est clos et mergé ; `main` est à jour et poussé,
l'arbre est propre. Le prochain chantier reste à choisir.

> ⚠️ **Si tu lis ceci et que le chantier décrit plus haut a été mergé entre-temps : remets ce
> fichier au réel AVANT de reprendre.** C'est l'étape **4bis** de `docs/WORKFLOW.md §5`, ajoutée
> le 2026-08-02 précisément parce que ce fichier a survécu **deux fois** à son propre chantier
> (`8618b78`, `c16719c`). Le symptôme : `MEMORY.md` parle d'une branche que `git branch -r` ne
> montre plus. Le test : *ce fichier décrit-il encore le dépôt tel qu'il est ?*

Ce que ce chantier laisse comme suites naturelles, par ordre de maturité :

1. **Vérifier les deux points non vus** (620 px sur iPhone, toast) — 5 minutes, et ça ferme
   proprement le lot.
2. **Le mécanisme « ZETIS génère »** — c'est le **point ouvert de l'addendum ADR-0027**, et il est
   déjà cadré comme une question : la demande déclenche-t-elle la génération, ou passe-t-elle
   toujours par la validation de Papa ? `CLAUDE.md` (« aucune réponse IA n'est vérité absolue ;
   validation Papa avant activation ») penche pour la seconde. **Décision d'ADR, pas d'UI** — à
   trancher AVANT d'écrire une ligne. C'est ce qui a motivé le retrait de la phrase « ZETIS ne
   fabrique rien tout seul ».
3. **`/capsules/:slug`** — la seule pastille de la bande qui reste inerte. La leçon du quiz vaut
   ici : la bonne question est « peut-on ajouter la route ? » avant « comment afficher qu'elle
   manque ? ».
4. Candidats plus anciens, toujours au BACKLOG : Lot 3 de l'agenda (ADR-0025 §11), unification des
   deux `new_count` de `memory`, mesure de la galaxie sur iPhone/iPad.

### Décision de process prise à la clôture (2026-08-02)

**`docs/WORKFLOW.md` gagne une étape 4bis** : *remettre `MEMORY.md` au réel après le merge*.
Ajoutée au §2 (boucle, étape « Intégrer ») **et** à la timeline du §5, avec son motif.

Le défaut est structurel, pas un oubli : `MEMORY.md` s'écrit **avant** le merge et rien ne le
réveille après. Ce que 4bis doit consigner — squash + n° de PR, branche supprimée, « rien à
pousser », et surtout les **résidus** de clôture (vérifications non faites, données de test en
base, décisions différées). Ces résidus ne vivent nulle part ailleurs : ni Git ni les ADR ne les
portent.

> **Voir l'app tourner** : la marche à suivre et ses deux pièges vivent désormais dans
> `docs/WORKFLOW.md §5bis` — donc ils survivront à la réécriture de ce fichier au prochain
> chantier. En bref : paires appairées (`.claude/launch.json`, référence `backend-galaxy` `:8003`
> + `massimo-galaxy` `:5179`), les serveurs de l'agent meurent avec la session, et le panneau
> d'aperçu a son propre stockage.


> Dette repérée en passant, **pas** traitée : `notionRouteFor` ignore `action.capsule_id` et
> ouvre `/capsules` à plat — le libellé « Regarder la capsule » sur-promet donc déjà. C'est
> pré-existant (hérité de `NotionActionPanel`), à corriger quand `/capsules/:id` existera.

---

## Historique — témoins de nouveauté en navigation (ADR-0030)

**Chantier : les témoins de nouveauté en navigation (ADR-0030).**

**✅ MERGÉ dans `main`** — squash **`86464b4`**, PR
[#64](https://github.com/NeuronXcore/zetis-school/pull/64), le 2026-08-01. Branche
`feat/news-badges` **supprimée** (locale et distante). **Rien à pousser, rien à reprendre côté
Git.** Les deux migrations sont **appliquées sur la base de dev** et se rejouent seules au
redémarrage du backend.

⚠️ **Ne pas ré-implémenter** ce qui suit : c'est de l'histoire, gardée pour ses pièges et ses
motifs de décision.

**FAIT, et vérifié en vrai :**

1. **Slice A backend** — module `app/modules/news/` en **lecture pure** (aucune requête SQL : il
   compose six compteurs qui vivent chacun chez le propriétaire de leur donnée), route
   `GET /api/student/news/summary`. Migration **`c1d2e3f4a5b6`** (`student_profiles.agenda_last_seen_at`)
   + route `POST /api/student/agenda/seen`, **appliquées sur la base de dev**.
2. **Slice B frontend** — un seul appel monté dans `MassimoLayout`, invalidé par
   `NEWS_CHANGED_EVENT` émis depuis `lib/` (à côté de l'écriture réseau, pour qu'aucun appelant
   futur ne puisse l'oublier). **La sidebar ne fait plus aucun appel réseau** et un test l'interdit.
3. **Mindmaps** — migration **`d2e3f4a5b6c7`** (`mindmap_views`), appliquée. La dette du `/seen`
   no-op est soldée ; **plus aucune famille de dérivés n'est sans témoin**.
4. **Bandeau d'Accueil** — section **« À préparer »** (`/agenda/upcoming`, déjà livré au Lot 1 et
   jamais remonté), **avec les dates**, plafonnée à 2. Zéro backend.

**668 tests backend + 319 Massimo, build et typecheck verts.** E2E live joué : les six badges
correspondent à l'API, retombent **sans rechargement de page**, **aucun appel périodique** sur
toute la session ; mindmaps 14 → 13 après un regard, inchangé au rejeu. Les deux test-verrous ont
été **mutés** pour vérifier qu'ils mordent (ils attrapent bien la violation qu'ils visent).

### Les quatre pièges de ce chantier, qui valent pour la suite

1. ⚠️ **`reviews/summary.new_count` n'est PAS servable en navigation.** Il exige `due_at <= now`
   alors que `schedule_review` crée les cartes avec une échéance **future** : une carte fraîchement
   générée y entre 1 à 7 jours plus tard, **sans aucun geste**. C'est un compteur d'arriéré déguisé,
   et la pastille Révision livrée avant ce chantier le consommait. Expression dédiée :
   `memory/service.py::new_cards_count`. **Deux `new_count` voisins portent le même mot pour deux
   choses** — ligne ouverte au BACKLOG pour les renommer.
2. ⚠️ **`func.now()` des deux côtés** de `created_at > agenda_last_seen_at`. `created_at` vient d'un
   `server_default=func.now()` ; un `datetime.now(timezone.utc)` Python se sérialise sur SQLite avec
   un `+00:00` qui trie **après** le naïf du server_default à instant égal. Et sur SQLite
   `CURRENT_TIMESTAMP` est à la **seconde** : les tests datent explicitement les items « arrivés
   après » plutôt que d'enchaîner regard puis création.
3. ⚠️ **Le registre `NEWS_SOURCES` existe POUR ÊTRE LU PAR UN TEST.** L'aplatir en six appels
   directs rendrait le verrou n°1 aveugle (il lit le **source** des compteurs, la sortie étant un
   entier qui ne trahit pas sa provenance).
4. ⚠️ **Un badge est un nombre SANS DATE.** Il ne peut pas répondre à « quand ai-je des choses à
   étudier » ; le faire compter les items **non faits** en ferait le compteur d'arriéré interdit.
   C'est une **autre surface** qui répond — le bandeau d'Accueil.

### Décisions actives à ne pas rouvrir

- Un badge compte ce qui est **NOUVEAU** (meurt d'un **regard**), jamais ce qui est **DÛ** (meurt
  du **travail**, grossit quand Massimo ne vient pas). Deux test-verrous le tiennent.
- **Aucun polling, aucune horloge.** Un compteur qui bouge sans geste est une notification.
- `agenda_last_seen_at` = **un horodatage par élève**, jamais un `seen_at` par item (joint à
  `done_at`, il fabriquerait « vu le 12, jamais fait »). Ne sort d'aucune route.
- **Sans badge et ce n'est pas un oubli** : Matières (hub), Quiz (pas de `validation_status` du
  tout, ADR-0014 §2), ELI5 (critère de **récence**, pas de vue). Un test verrouille la liste.
- `capNewsBadge` (9+) et `cappedCount` (15+) sont **deux objets distincts** et doivent le rester.

### Suite donnée (à la clôture de ce chantier)

Le lot ADR-0030 est clos et mergé ; `main` était à jour et poussé. Candidats alors au BACKLOG,
toujours ouverts : Lot 3 de l'agenda
(ADR-0025 §11, analyse et pont vers le Commander), unification des deux `new_count` de `memory`,
ou la dette de mesure de la galaxie sur iPhone/iPad (jamais vérifiée, cf. historique plus bas).

> ⚠️ **À regarder avant de juger le résultat** : sur la base de dev, `revision: 137`,
> `missions: 35` et `mindmaps: 14` → trois badges affichent `9+` en permanence. Les 35 missions
> « validées jamais démarrées » datent toutes des **5-6 juillet**. Doctrinalement conforme (aucun
> ne grossit avec le temps, les verrous passent), mais un badge toujours allumé ne dit plus rien.
> C'est probablement du résidu de tests des chantiers précédents — **ça se tranche en regardant
> l'app tourner quelques jours, pas en raisonnant**.

> **Données de test laissées dans la base de dev** : 6 items d'agenda créés pour la vérification
> live (« Contrôle de maths », « DM SVT », « Exposé anglais », « Poésie à apprendre », « Contrôle
> histoire », « Contrôle de géométrie »), et 1 `mindmap_views` (carte 1 marquée vue).

---

## Historique — chantier de la galaxie animée (2026-07-31)

**MERGÉ dans `main`** — squash `9be0e6f`, PR
[#63](https://github.com/NeuronXcore/zetis-school/pull/63), le 2026-08-01. Branche
`feat/galaxy-animations` **supprimée** (locale et distante). **Rien à pousser, rien à reprendre
côté Git.** 286 tests Massimo revérifiés **sur `main` après merge**.

⚠️ **Ne pas ré-implémenter** ce qui suit : c'est de l'histoire, gardée pour ses pièges et ses
motifs de décision.

**Chantier : la galaxie s'anime.** Cadré par deux addenda, puis **élargi trois fois en cours de
route** par le user, au vu du rendu. Chaque élargissement a son addendum.

**FAIT, dans l'ordre :**

1. **Slice A** — `GALAXY_MAX_NODES` **supprimé** avec son repli (il cachait la progression de
   Massimo selon la taille de son écran, valeurs jamais mesurées). **Trois gardes** le remplacent
   et visent le coût réel *par image* : budget de particules réparti sur la scène (2 → 1 → 0 par
   fil), coupure du flux doré sous **34 FPS** mesurés sur une seconde pleine et **sans retour en
   arrière**, `cooldownTicks`. Animation d'arrivée de `/galaxy` en **tween**.
2. **Slice B** — le rejeu **se construit depuis `root`** au lieu de défiler. Horloge de rang,
   naissance des ancêtres dérivée client, frise **témoin** (plus de curseur, un bouton « Revoir »,
   axe X = **jour actif**).
3. **L'Accueil** — la galaxie y **revient** (§B révoqué), puis y **grandit** vraiment, puis
   **remonte** en pleine largeur avec le texte en **badges** hors du ciel.
4. **`/galaxy`** — rend la **galaxie entière** (§C révoqué), sur **trois anneaux concentriques**
   autour du cerveau.

**286 tests Massimo + 270 Papa, deux `typecheck`, build — tous verts.** Backend **pas touché**
du tout (zéro route, zéro schéma, zéro migration) : ses tests n'ont pas été relancés, rien n'a
bougé.

> ⚠️ **JAMAIS VÉRIFIÉ EN VRAI, et c'est le premier point de la reprise.** Le user a regardé
> l'Accueil et a fait corriger trois défauts de rendu, mais **personne n'a validé** : la
> lisibilité de `/galaxy` **à plusieurs centaines de notions** (les rayons 150/260/370 et les
> 78 % de secteur sont des **suppositions**, pas des mesures), ni la **tenue sur les trois
> appareils**. **L'iPhone est devenu critique** : il doit tenir la galaxie complète sur `/galaxy`
> **et** une galaxie sur l'Accueil. Si ça ne passe pas, ce sont les **particules** qui tombent,
> jamais les nœuds.

**Prochain pas = la vérification en vrai**, seule chose réellement en suspens. Elle porte sur les
deux points de l'encadré ci-dessus, et **elle peut faire rouvrir des réglages** :

- si la lisibilité ne tient pas à plusieurs centaines de notions, la réponse **prévue et écrite**
  est un **niveau de détail adaptatif** (notions révélées au-delà d'un certain zoom) — pas un
  retour du plafond, pas un rallumage des forces ;
- si l'iPhone décroche, ce sont les **particules** qui tombent (le budget existe déjà), **jamais
  les nœuds**.

Ces deux réponses sont figées dans les addenda : les appliquer n'est pas une nouvelle décision,
les contourner en serait une.

> ✅ **Résolu le 2026-08-01** : `mockup-page-eli5-v2.html` avait disparu de l'arbre de travail en
> cours de session, hors de tout commit. **Restaurée** (`git restore`), hash vérifié identique à
> `HEAD`. Rien n'a été perdu.

### ⚠️ Ce que la bibliothèque 3D permet vraiment — vérifié ligne à ligne, à ne pas re-chercher

C'est le constat le plus coûteux de la session, et il a **réécrit un ADR**. Dans
`three-forcegraph` 1.43.4 / `react-force-graph-3d` 1.29.1 :

| fait | conséquence |
|---|---|
| `d3ReheatSimulation()` = `d3ForceLayout.alpha(1)`, **sans argument** | « réchauffer à alpha bas » est **impossible** |
| `d3AlphaTarget` existe dans le kapsule mais **n'est relayé nulle part** | ni prop React, ni méthode du ref |
| `graphData.onChange` fait `stop().alpha(1)` | **tout** changement de données réchauffe à fond |
| `graphData` **n'est pas** dans les 18 méthodes liées au ref | `graphRef.current.graphData` vaut `undefined` |

**Conséquence directe** : une croissance nœud par nœud sur simulation vivante ré-explose à chaque
étoile, quoi qu'on fasse. D'où **positions calculées et épinglées, moteur neutralisé** partout
(`pinned`). ⚠️ **Ne pas « rallumer les forces »** en croyant simplifier : c'est parce qu'elles
restent éteintes que tout peut être montré.

**Effet de bord constaté** : le déclouage du soleil dans `handleEngineStop` est **inerte depuis
le 2026-07-28** (l'optionnel avale l'appel). Laissé en l'état, hors périmètre, consigné dans
`zetis-galaxy.md`.

### ⚠️ Trois pièges rencontrés, tous corrigés — ne pas les réintroduire

1. **Réassigner `graphData` à chaque image.** Le rejeu se recalculait sur l'horloge : 60
   réassignations par seconde, donc 60 `stop().alpha(1)`, donc un graphe qui ne s'affichait
   jamais. Corrigé par un **compte discret** de nœuds nés (`bornCount`) servant de clé de
   mémoïsation. **Test-verrou** qui pilote le temps à la main et compte les tableaux distincts.
2. **`zoomToFit` à chaque naissance.** `onEngineStop` se déclenche à chaque changement de
   données : la galaxie naissait **en gros plan** puis reculait par à-coups. Sur un graphe
   épinglé, la caméra est posée **une fois** pour l'étendue finale, connue d'avance.
3. **`hasWebGL()` est faux sous jsdom.** Un test de la modale passait **sans rien exercer** : le
   composant rendait son repli « il faut un écran 3D ». Mocker `hasWebGL` dès qu'un test doit
   monter le canvas.

### Décisions prises ce jour — 5 addenda à l'ADR-0024, 2 révocations

⚠️ **Le chantier Galaxy aura été cadré en marchant.** C'est écrit dans les ADR eux-mêmes pour
être lisible, pas répété. Les deux révocations sont **motivées, pas velléitaires** :

- **§B révoqué** (canvas retiré de l'Accueil le matin) : le motif est **produit** — voir la
  galaxie se construire donne à la page une vie qu'un compte statique ne donne pas. Le coût est
  **le même** qu'au matin, mis en balance autrement. **Ce qui survit** : aucun montage 3D au
  premier rendu, le canvas arrive à `requestIdleCallback` (repli `setTimeout` — **Safari ne l'a
  pas**, donc c'est le cas courant sur iPhone/iPad).
- **§C révoqué** (vue par défaut réduite à `root` + `subject`) : son amas était **réel**, mais
  venait de la **convergence**, pas du nombre de nœuds. Plus de convergence → plus d'amas.
- **ADR-0029 §2 réécrit** : sa prescription était **impossible** (voir tableau ci-dessus).
- `accueil.bundle.test.ts` **change de nature sans disparaître** : l'interdit d'`import()` devient
  une **liste blanche**, et un cas est **ajouté**. Ce qu'il protège encore : qu'un **troisième**
  point de montage n'apparaisse pas sans que personne ne le voie.

### Historique — chantier précédent (MERGÉ dans `main` via PR #62)

Ce qui suit décrit `feat/accueil-vivant` / `feat/accueil-galaxy`, **désormais dans `main`**
(`a73e8e5`). Conservé pour les pièges.

### `/galaxy` = système solaire (révision de l'addendum §C) — FAIT, non poussé

**La vue d'arrivée n'affiche plus tout le graphe.** Servir `root` + matières + chapitres +
notions à une simulation de forces produisait un **amas** : cerveau à moitié enseveli, libellés
superposés. Désormais : **cerveau au centre** (il existait déjà — `brainGeometry.ts`, deux lobes
à circonvolutions générés par le code, grossi ×2.4 en mode orbite pour faire soleil) et
**matières seules**, chacune **posée** sur une orbite dessinée (`orbitLayout`, pure et
déterministe), plan aplati, caméra en surplomb à ~35°.

- **Un placement, pas un équilibre** : `GalaxyCanvas` gagne `layout="orbit"` — forces à zéro,
  positions imposées via `fx/fy/fz` **dans les données** (⚠️ `graphData()` n'est PAS exposée par
  cette version de la lib — constaté à l'exécution, l'API du ref ne marche pas pour ça).
- **Les matières VIDES ont aussi leur planète** : `galaxy/all` les exclut volontairement, mais la
  vue les rajoute depuis l'overview (déjà chargé). Une matière absente se lirait comme une
  matière qui n'existe pas ; une planète éteinte se lit « pas encore ». **Contrat serveur
  inchangé.**
- La rotation lente était **déjà acquise** (`controls.autoRotate`, coupée par
  `prefers-reduced-motion`) — rien à écrire.
- **Bandeau de planètes CSS PERMANENT au-dessus du graphe** (`SubjectConstellations
  variant="band"`), présent sur la galaxie **et** dans une constellation — c'est aussi le
  **sélecteur de matière** : la planète ouverte porte son anneau. **Une seule ligne, sans
  défilement** — les planètes se partagent la largeur (`flex-1`) et rétrécissent avec leur nombre
  (globe 44 px, emblème 24 px, nom tronqué, tuile de relief mise à l'échelle via `--tile`).
- ⚠️ **UN SEUL CLIC ouvre la matière.** Une version intermédiaire demandait un 1ᵉʳ tap pour
  « viser » puis un 2ᵉ pour entrer : geste que personne n'avait demandé, et toucher une matière
  sans voir son graphe se lit comme un clic qui n'a pas marché. **Ne pas réintroduire.**
- **`SubjectKpiRow` SUPPRIMÉ** : le bandeau rend le même service et montre en plus les matières
  vides, que les puces filtraient (`s.total > 0`).
- **Cadre au fond spatial animé** : nébuleuses qui respirent, bande laiteuse en diagonale, deux
  champs d'étoiles à vitesses différentes — **seul le champ proche scintille** (si tout clignote
  ensemble, le fond respire d'un bloc et vole l'attention aux planètes). Tout en CSS, zéro 3D.
- **Couronne solaire dorée** ∝ étoiles allumées, **absente sur une matière vide** : le canvas
  pose déjà la règle (« l'or ne coule que vers ce que Massimo a vraiment travaillé ») et la
  maquette galaxie dit « aucun or ». **Doré = travaillé, jamais « joli »** — ne pas l'étendre
  aux planètes vides.
- Une matière vide affiche « Bientôt » au lieu d'un compte ; l'ouvrir mène à l'écran d'attente
  honnête (« 🌱 Les étoiles de cette matière arrivent bientôt »).

### Chantier « Accueil vivant » (2ᵉ addendum ADR-0024) — FAIT, non poussé

**La demande** : un Accueil plus vivant, avec la **heatmap de Papa** en référence.
**La heatmap est REFUSÉE par écrit**, avec ses trois murs **indépendants** (route supprimée par
l'ADR-0028 et vivant dans un agrégat `require_parent` ; `CLAUDE.md` interdit le décompte de jours
manqués « sous quelque forme que ce soit » ; `WeekDots.test.tsx:32` le verrouille). Ne pas la
redemander sans rouvrir ces trois-là.

**Ce qui la remplace** : « Mon ciel », la même idée **retournée** — une case par jour de gain sur
un **calendrier** (semaines en colonnes, jours en lignes, comme chez Papa), mais **aucune case
vide n'est dessinée** : un jour sans gain n'a **aucun élément dans le DOM**. Chez Papa la case
grise **est** l'information d'absence et elle y est légitime (c'est du pilotage) ; ici l'absence
n'existe ni dans les données ni dans le rendu.

> ⚠️ **Révisé le jour même, après un premier rendu.** La v1 posait les jours en **constellation
> libre**, sans repère temporel. Le user a redemandé la heatmap : ce qui manquait n'était **pas
> la densité, c'était le repère de TEMPS**. D'où le calendrier — l'interdit passe de la
> **géométrie** vers le **rendu**. Ce qui est assumé : sur un calendrier, l'œil perçoit les
> intervalles par la **position**. Ce que `CLAUDE.md` bannit — un décompte, une iconographie du
> vide — reste absent. **Ne pas re-proposer la constellation** : elle a déjà été essayée.

**Brique partagée créée** : `packages/ui/src/lib/calendarGrid.ts` (`buildSparseCalendar`, +
`toLocalIso`/`startOfWeek` **remontés depuis `heatmap.ts` de Papa**, qui les ré-exporte). Deux
`startOfWeek` dans un même dépôt finiraient par diverger sur les bords de semaine.
`buildHeatmapGrid` **reste chez Papa** — c'est lui qui reconstruit les jours vides, et cela ne se
partage pas.

**La décision qui compte, et pourquoi elle tient** : `GET /api/gamification/history` marche sur
un refus déjà écrit (`motivation/router.py:38` : « un historique d'objectifs manqués serait le
streak déguisé »). Ce refus est **maintenu** — un **objectif** porte un attendu, donc son
historique est un relevé d'échecs ; un **XP** est un gain obtenu, et un jour sans gain n'est pas
un jour raté. **Le garde-fou est dans le CONTRAT** : les jours sans XP sont **omis du payload**,
donc aucun client futur ne peut dessiner une case vide sans avoir lu l'ADR. Route dans
`gamification` et **surtout pas** dans `activity`, dont le module porte la doctrine inverse
(« un enfant chronométré travaille pour le chronomètre »).

**Pièges rencontrés** :
- le mapping `REASON_LABEL` ne couvrait que **3 `reason` sur 8** — invisible tant que `recent`
  n'était affiché nulle part, à l'écran de l'enfant dès qu'on l'affiche ;
- regrouper les XP **en Europe/Paris** (`local_day`), pas en UTC : c'est exactement le défaut
  relevé sur le streak retiré ;
- les pastilles portant leur compte ont créé plusieurs « 0 » à l'écran → un test existant visait
  `getByText("0")`, réécrit sur l'`aria-label` de la carte (précisé, pas assoupli) ;
- **jsdom garde `grid-column`, le navigateur le normalise en `grid-area`** : un test qui
  sélectionnait sur le style passait en test et trouvait 0 case en vrai → ancrage `data-day` ;
- **trois défauts visibles seulement au rendu réel, avec les VRAIES données** (6 jours, pas 34) :
  libellés de mois superposés, grille minuscule dans une carte large, initiales de jours
  désalignées. Un composant dont la mise en page dépend de tailles en pixels ne se valide pas en
  jsdom — il faut l'ouvrir.

**Décisions actives, à ne pas rouvrir** : la frise est REVENUE sur l'Accueil (le §B du 1ᵉʳ
addendum voulait sortir **Three.js**, pas du SVG maison) ; aucune date n'est affichée nulle part
sur cette page ; les matières ne sont **jamais** triées par étoiles (ce serait un palmarès).

> ⚠️ **Ce qui n'a PAS été vérifié en vrai** : `/galaxy` et l'Accueil sont derrière
> `RequireAuth`, et la session de développement n'a pas ouvert de session Massimo. Tout est
> couvert par des tests (200 Massimo + 270 Papa, builds et `tsc -b` verts), mais **le rendu réel
> n'a été vu par personne** — en particulier : la galaxie complète en vue par défaut, la
> bascule planètes CSS → canvas, et la carte « Ma Galaxie » sur l'Accueil.

> ✅ **Connexion MERGÉE** — PR [#59](https://github.com/NeuronXcore/zetis-school/pull/59) et
> **Dashboard Papa v2** PR [#60](https://github.com/NeuronXcore/zetis-school/pull/60) sont
> **toutes deux mergées** : `origin/main` = **`96becd8`** (2026-07-31). **NE PAS RÉ-IMPLÉMENTER.**
> Migration **`a9b8c7d6e5f4`** (`skill_mastery_history`) appliquée sur Postgres dev — elle se
> rejoue seule au démarrage.

### Chantier en cours — Accueil & Galaxie (addendum ADR-0024, 2026-07-31)

**Slice A — renommage `/progression` → `/galaxy`. FAITE.** `git mv ProgressionPage.tsx →
GalaxyPage.tsx`, `/progression` réduite à `<Navigate to="/galaxy" replace />` (**premier
`<Route element={<Navigate>}>` du repo côté Massimo**), sidebar « **Ma Galaxie** » 🌌 **à la même
position** (11ᵉ sur 13 — le renommage ne devient PAS une 6ᵉ entrée, ADR-0024 §1), bandeau XP,
`MatieresPage`, `motivationVisuals.ROUTES` (**la clé reste `progression`** : c'est un `target`
servi par le backend, pas une URL) et `NotionActionPanel.returnTo` repointés.
188 tests Massimo + 270 Papa + les 2 builds **verts**.

**Cinq écarts réels trouvés au read-before-code** (les documents étaient en avance ou en retard
sur le code) :

1. **`GET /api/student/galaxy/overview` n'existe pas** — c'est `GET /api/student/galaxy` (chemin
   vide, `galaxy/router.py:29`). Et `/overview` **serait capturé** par
   `GET /student/galaxy/{subject_slug}` : 404 « matière inconnue », pas 404 de route. La fonction
   client s'appelle `fetchGalaxyOverview`, d'où la confusion. `page-accueil.md` corrigée.
2. **Le contrat ne porte aucun compte GLOBAL** d'étoiles : `lit`/`total` sont **par matière**.
   La carte Galaxie de la slice B devra **sommer côté client**.
3. **`ProgressionPage.test.tsx` n'existait pas** — le prompt de slice A supposait de le déplacer.
   Couverture indirecte seulement (`components/galaxy/*.test.tsx`).
4. **Le mapping route → libellé du §D n'existait NULLE PART** (ni Papa, ni serveur) : le serveur
   sert la route **brute** comme `detail` (`activity/service.py:_detail_for`) et Papa la rendait
   **verbatim**. Il n'y avait rien à étendre — il y avait quelque chose à **créer**. Fait côté
   client Papa (`lib/routeLabels.ts`), donc **« zéro backend » tient**.
5. **Ni outillage de bundle, ni CI** (`.github/workflows` absent) : le « test de budget » de la
   slice B est **à concevoir de zéro** (Vitest sur le graphe d'imports).

**Slice B — refonte de l'Accueil. FAITE.** `HomeGalaxyPreview` **supprimé** ; Accueil recomposé
(salutation verbatim → bandeau Agenda → mission du jour → « Ma semaine » + carte « Ma Galaxie »
côte à côte → 3 raccourcis → **slot** du héros ZETIS non rendu) ; `useGalaxy` tire maintenant
`fetchFullGraph` + `fetchGalaxyTimeline`, et `/galaxy` s'ouvre sur la **galaxie complète**, les
planètes CSS devenues **état d'attente + repli sans WebGL**. 200 tests Massimo + 270 Papa verts.

**Décisions prises pendant ce chantier, à ne pas rouvrir :**

- **`HomeAgendaBanner` RESTE sur l'Accueil.** La spec réécrite et la maquette v2 ne le montrent
  pas, mais c'est le **seul accès à `/agenda`** en phase 0 (l'agenda n'a pas d'entrée de sidebar,
  ADR-0025). **La spec et la maquette ont été corrigées**, pas le code.
- **Le §C n'était pas un déplacement mais une FUSION.** `HomeGalaxyPreview.tsx` (~420 lignes)
  n'était pas un graphe : c'était une **expérience Galaxy complète** (canvas `lazy()`, recherche,
  `SubjectKpiRow`, frise, légende, panneau d'actions, **son propre plein écran à deux niveaux**),
  soit un doublon de ce que `GalaxyPage` fait déjà. Arbitrage retenu : **`GalaxyPage` absorbe la
  galaxie complète**, les composants sont réutilisés tels quels, et c'est l'**orchestration en
  double** qui disparaît — pas le contenu.
- **Le test de budget interdit les `import()` autant que les imports statiques.** Le canvas était
  DÉJÀ code-splitté le 2026-07-28 : ce qui coûtait, c'était le **montage**. Un test limité aux
  imports synchrones serait passé avant comme après, donc n'aurait rien protégé. Contre-épreuve
  incluse dans le fichier (`accueil.bundle.test.ts`), et vérifiée en réintroduisant la régression.
- **Deux choses que la spec demandait et que le backend ne sert pas** : la « capsule recommandée
  avec sa durée » (aucune durée dans `/api/capsules/library`, aucune notion de recommandation) →
  remplacée par `new_count` ; et le **compte global** d'étoiles → **somme client** des `lit`.

**Pièges de renommage (vérifiés, ne pas y toucher)** : Papa a **sa propre route `/progression`**
(`frontend-papa/src/App.tsx:42`, `lib/navigation.ts:30`) — homonyme ; et
`backend/modules/dashboard/service.py:472` fabrique `href: /progression?subject=…` qui pointe la
route **Papa** (dashboard `/api/parent/dashboard` → `ZetisReadingCard.tsx:75`). `packages/ui` ne
contient **aucune** référence à la route. `interface Progression` de `hooks/useMatieres.ts` et
`mission_type='progression'` sont des homonymes de domaine.

> ⚠️ **Versions du CHANGELOG** : les deux chantiers avançaient en parallèle et revendiquaient tous
> deux `0.29.0`. Le dashboard ayant été mergé en premier garde `0.29.0` (+ `0.29.1` pour le
> correctif du relais SRS) ; la connexion est **renumérotée `0.30.0`**.

### Chantier « Dashboard Papa v2 » (ADR-0028) — MERGÉ, détail conservé pour les pièges

`b758580` doc · `6479985` historique de maîtrise · `7b63f62` agrégat · `ae4fd42` temps hors matière
· `bd82fe5` front · `6518094` Conseil query params · `6682aeb` nettoyage · `3fa8baa` mission
proposée · `bdbe5f4` **relais SRS réparé** · `0353507` **/lacunes réelle** · `ee3a2f4` **/focus réel**.

**Ce que ça fait** : `GET /api/parent/dashboard` devient l'**unique requête du premier rendu** et
sert les **trois fenêtres** (7/30/90) **non filtrées**, séries **par matière** — « toutes matières »
est une somme client. Conséquence : changer de période, de matière ou de focus **ne déclenche aucune
requête** (prouvé dans l'onglet Réseau : 5 gestes, 10 requêtes avant, 10 après). Les 4 KPI
deviennent des **filtres de focus** (§5) ; 8 visualisations en **SVG maison** (zéro dépendance
ajoutée : ni react-query, ni lib de graphes).

**Migration `a9b8c7d6e5f4`** (`skill_mastery_history`) **appliquée sur Postgres dev**. Backfill
partiel assumé (seules les bascules `mastered` datables) — il a rendu 0 ligne en dev, c'est correct :
les 15 lignes de `skill_mastery` ont toutes `mastered_at` à NULL.

**Read-before-code : 2 vérifications sur 4 sont tombées**, + 6 écarts non anticipés par l'ADR (tous
reportés dans l'ADR et la spec) :
- « consolidée » avait **déjà** une définition serveur (`SkillMastery.status == "mastered"`), pas
  celle qu'écrivait l'ADR ; « fragile » n'en avait **aucune** → mapping figé sur les **6** statuts
  réels (`in_progress` inclus, écrit par `missions/service.py`, absent de tout `_status_from_score`) ;
- `GET /api/parent/dashboard` **existait déjà** → réécriture **cassante** (un seul consommateur) ;
- Conseil : `generated_at` **n'existe pas** (c'est `created_at`), route **`/conseil`** (pas
  `/conseil-classe`), aucun query param → étendue en commit révocable seul ;
- les **quiz ne peuvent pas** entrer dans la file « À valider » (`quizzes` n'a pas de
  `validation_status`, doctrine ADR-0014 §2) ; `lessons` utilise `status`, les autres
  `validation_status` — **deux conventions coexistent en base** ;
- `/api/parent/activity/heatmap` **sans consommateur hors dashboard** → **supprimée** (le Cahier de
  bord utilise `/activity/sessions`).

**Deux contradictions que seul le rendu réel a révélées** (invisibles en test) : le donut totalisait
42 min à côté d'un KPI annonçant 7 h 05 → champ **`unattributed_minutes`** + part « Hors matière »
(connexion, navigation, chat portent du temps sans `subject_id` — 90 % du total en dev) ; et le KPI
des lacunes portait le **même libellé** que le segment « fragiles » des cartes voisines, affichant
« 1 » à côté de « 9 » pour deux mesures différentes → « Lacunes ouvertes ».

### Le vrai défaut trouvé en creusant (le plus important de ce chantier)

Parti d'un symptôme — « 1 notion à renforcer sans mission active » à côté d'une carte qui ne
proposait rien — le diagnostic « `generate_remediation` ne reprend que les lacunes `open` » était
**exact mais superficiel**.

**Le relais que l'`adr-0017 §5bis` désigne était INOPÉRANT.** Le template `revision` composait
`[carte] → [quiz] → relire` **sans étape de réexplication**, alors que le verdict exige
`reverse_score` — et `STEP_ELI5` est une étape de **consultation** qui n'en produit aucun. ⇒ une
mission `revision` rendait **toujours** `review_later` : la lacune restait `in_progress` à vie.
Pire, sans mesure la branche écrivait **`mastery_score = 0`** et replanifiait la carte à 1 jour :
Massimo faisait sa révision et sa maîtrise s'effondrait. **La contradiction était figée par un
test** qui assertait « pas de verbalisation ».

Corrigé (`bdbe5f4`) : (a) `vocal_explain` ajouté au template `revision` — ses *types* d'étape
coïncident désormais avec `remediation`, assumé (la distinction reste la source, la formulation, le
plafond, la priorité) ; (b) **une absence de mesure n'est plus écrite comme un zéro**. **Bump
`MISSION_SCORING_VERSION` v3 → v4.** Le générateur de remédiation n'est **PAS** élargi aux lacunes
`in_progress` : la doctrine tenait, elle ne fonctionnait pas.

⚠️ **Deux surfaces se contredisaient** : le KPI `without_mission` ne comptait que les missions
`remediation` → une notion couverte par une mission **`manual` commandée par Papa** était annoncée
« sans mission active ». Définition unique désormais :
`progress.service.skills_with_active_mission` (tous types), partagée dashboard + `/lacunes`.

**Deux pages ont cessé d'être des mocks** : `/lacunes` (sépare « jamais travaillée » → consolidation
de « revenue par la révision » → révision, via les **deux générateurs existants**) et `/focus`, qui
promettait « ZETIS priorisera missions, capsules et révisions » alors qu'**aucun état « focus »
n'existe côté backend** (zéro occurrence) et que le bouton n'écrivait qu'un `useState`. Réécrite sur
le seul levier réel, **`Mission.force_priority`** (plancher de score du sélecteur, ADR-0018), via
`commandConfirm` déjà écrit. ⚠️ La route Commander **n'a pas de garde d'idempotence** → les notions
déjà couvertes ne sont pas proposées.

**Vérifications faites** : 641 backend + 265 papa + 182 massimo verts ; typecheck et build verts ;
**zéro requête sur un geste de filtrage prouvé dans le navigateur** ; Cahier de bord non régressé.
Les manipulations de la base de dev (bascules de statut pour voir les branches actives) ont toutes
été **annulées** — 50 missions avant, 50 après.

**Hors v1, assumé** : bandeau de fraîcheur du Conseil ; bug d'échelle `mastery_score` 0–100 traité
comme 0–1 (antérieur, `missions/command.py`, `champion.py`, `reports/service.py` + 2 modales).

---

## Historique — chantier précédent

**Étape 2 (content_requests + correctifs orchestrateur + volet hors-programme + panneau notions
orphelines)** : **✅ COMPLET, ULTRAREVIEWÉ, MERGÉ ET POUSSÉ.**
**PR [#57](https://github.com/NeuronXcore/zetis-school/pull/57) mergée en squash → `origin/main` =
`9b53af1`** (2026-07-30) ; branche `feat/content-requests` **supprimée** (local + remote).
Migration **`c3d4e5f6a1b2`** appliquée sur Postgres dev (`alembic current` = head) — elle se rejoue
seule au démarrage (entrypoint Docker / `scripts/dev.sh`). **NE PAS RÉ-IMPLÉMENTER.**

> ⚠️ **Déploiement : il n'y a AUCUNE CI ni environnement distant.** Merger ne teste et ne déploie
> rien. Les migrations passent au (re)démarrage du backend. Variable de DB = **`ZETIS_DATABASE_URL`**
> (préfixe `ZETIS_`) — `DATABASE_URL` de `.env.example`/`DEPLOYMENT.md` est **ignoré**.

**✅ TOUT LE CHAT EST MERGÉ SUR `main` ET POUSSÉ** (`origin/main` = `9b53af1`) :
- **ADR-0026** (mémoire éphémère Redis + texte/avatar `@zetis/ui/avatar` + voix STT Whisper/TTS Piper
  locale) — commits `d03918c`→`6672df9`.
- **ADR-0027 orchestrateur** (intent typé **ancré serveur** + exécuteur voix→direct/clavier→carte +
  données inline agenda/reviews/missions + menu de notion + repli robuste) — `ff353b6`, `4fce7d6`,
  `1d3d66a`. Branches `feat/chat-memoire` + `feat/chat-orchestrateur` **supprimées** (local+remote).
  **NE PAS RÉ-IMPLÉMENTER.**

### ÉTAPE 2 — `content_requests` : MERGÉ (détail conservé pour les pièges)
Massimo réclame un contenu qui MANQUE → **liste d'attente DÉDUPLIQUÉE** que Papa traite. Résout le
**Point ouvert n°4 ADR-0027**. **Décisions figées** : `docs/decisions/adr-0027-addendum-content-requests.md`
(Accepté) + ligne `DECISIONS.md` + `adr-0027 §Points ouverts n°4` (tranché) + `page-chat.md §Garde-fous`
(« différé » → « content_requests ») + prompt `prompts/claude-code/prompt-content-requests.md`.

**Backend (module `content_requests`, patron `notions/`)** : modèle `ContentRequest`
(`db/models/progress.py`, à côté de `NotionRequest`) — `skill_id` **NOT NULL** (≠ notion_requests),
`content_kind`/`status`/`source`, `UniqueConstraint(student, skill, kind)`. Migration
**`c3d4e5f6a1b2`** (down `b2c3d4e5f8a0`) **appliquée + réversible sur Postgres dev**. Service
`create_request` **idempotent + RÉ-ACTIVANT** (une ligne triée redevient `pending`), `list_requests`
(jointure Skill → skill_name/subject_id), `set_status`, `pending_count`. Router `GET·PATCH
/api/content-requests` (`require_parent`, monté dans `main.py`, **aucune route enfant**). ✅ route
live = **401 sans token** (montée + protégée).

**Émission chat** (aveugle au contenu §1c, **best-effort non bloquant**) : `chat/actions.py` pose
`ActionResult.meta["content_request"]={skill_id, content_kind}` — mapping `_TOOL_TO_CONTENT_KIND`
(`fiche→fiche, mindmap→mindmap, cours/eli5→cours, revision→card`) sur (a) `_open_notion` contenu non
`available`, (b) `_notion_menu` vide → `cours`. `chat/service.py` : `content_signal` capté sur
`action_result.meta` **ET sur le repli** (`fallback.meta` quand LLM=intent none + notion vide) →
`_maybe_request_content` (try/except qui n'échoue JAMAIS le tour ; `create_request` fait `flush`, pas
`commit`).

**Papa = BADGE Couverture** : `production/coverage.py` **NON TOUCHÉ** (invariant read-only). Nouveau
type `@zetis/types` `ContentRequest`, lib `contentRequests.ts` (fetch/patch), `useCoverage` charge la
file en +3e `Promise.all` → `requestsBySkill: Map<skill_id, ContentRequest[]>` + `setRequestStatus`
**optimiste**. `CoverageMatrix.lessonRequestsOf(lesson, map)` fusionne par `skill_id` via
`lesson.notions.items` → badge **« ⭐ réclamé (n) »** (jamais à zéro) → `RequestedPopover` (notion +
type, Fait/Ignorer). Mutations via `content_requests`, **PAS `production`**.

**Tests** : **597 back** (+16) + round-trip **live Postgres** + 226 Papa (+2 badge) + tsc -b + build
**verts**. **Test live end-to-end JOUÉ ET VERT** (backend redémarré, Ollama réel) : émission path (a)
fiche manquante, dédup, triage Papa `done`, ré-activation — tous prouvés.

**⚠️ 4 CORRECTIFS + 1 AJOUT après 2 tests live (2026-07-30), tous validés user + VÉRIFIÉS LIVE
(backend redémarré, Ollama réel, UI Papa)** — détail `TROUBLESHOOTING.md` §content_requests + addendum
ADR §Correctifs :
- **n°2 — `galaxy.notion_panel` mentait sur le cours** (`available = lesson_id is not None` →
  `content_markdown IS NOT NULL`). Leçon validée sans cours rédigé annoncée dispo → porte vide +
  aucune demande. + signal « notion vide → cours » sur **tous** les chemins via `DURABLE_NOTION_TOOLS`.
- **n°3 — le chat GÉNÉRAIT le contenu dans `reply`** (qwen3 écrivait la leçon). `CHAT_SYSTEM`/
  `CHAT_TURN_PROMPT` durcis (« jamais écrire le cours, oriente »), `CHAT_PROMPT_VERSION → chat_v2`.
  Mitigation (petit moteur), pas garantie dure — le LLM ouvre encore parfois « Voici ta fiche… »
  mais la note honnête + l'action portent la vérité.
- **n°1 FAIT (2e test live) — résolveur strict** : `chat_skill_resolution_min_score` **0.55 → 0.72**
  (`config.py`). `nomic` donnait ~0.68 à des requêtes SANS RAPPORT (« espagnol » → « Registre de
  langue »), vrais matchs à 0.83+ ; la MARGE ne sépare pas, le score absolu si. Prouvé live :
  « verbe être en espagnol » → `skill_id null` → « je ne le trouve pas », **fini le mauvais contenu**.
- **ELI5-orchestrateur** : ELI5 dégrade vers le MODÈLE sans cours (ADR-0011) → l'orchestrateur ne
  route plus vers ELI5 quand AUCUN cours validé (il inventerait) ; honnête + demande de cours. ELI5
  offert **seulement si `cours` available** (`_notion_menu`/`_open_notion`, `chat/actions.py`). ELI5
  l'outil (galaxie) intouché.
- **AJOUT (2e message user) — Papa : NOTIFICATIONS + LISTE des demandes** : endpoint
  `GET /api/content-requests/count`, `subject_name` ajouté à la liste, **pastille de notification**
  sidebar (`PapaSidebar` sur `/demandes`, event `CONTENT_REQUESTS_CHANGED_EVENT`), **page inbox
  `/demandes` (`DemandesPage`)** groupée par matière + Fait/Ignorer + lien Couverture. **Vérifié UI
  live** (badge 1→0, triage, boucle chat→Papa).

**⚠️ VOLET HORS-PROGRAMME AJOUTÉ (2026-07-30, 3e demande user)** — ferme la moitié symétrique du Point
ouvert n°4 (« notion PAS au programme »). Détail addendum ADR §Volet hors-programme :
- **Chat émet en OPT-IN** : `resolve_skill`→None → action **`request_notion`** (carte « Demander à
  Papa d'ajouter « X » », `confirm`) ; le tap → `POST /api/ai/eli5/request-notion` (producteur ELI5
  existant). `chat/actions.py` `_open_notion` branche None + `fallback_text`=message ; `ChatAction`
  `+kind request_notion +text`. Massimo : carte + confirmation dans `ChatPage.tsx`.
- **Découverte** : « ✓ Ajoutée » ne faisait QUE le statut — **aucune création**. Deux **ponts** neufs
  (réutilisent `_upsert_skills` / `create_manual_lesson`) : `POST /api/notion-requests/{id}/add-to-program
  {subject_id}` (→ Skill) et `/create-lesson {chapter_id, generate_course?}` (→ Skill+Leçon+lien,
  cours local optionnel → leçon `draft`). Une notion hors-programme n'a pas de matière → **modale**
  Papa (matière/chapitre).
- **Inbox `/demandes` UNIFIÉE** : 2 sections (« À ajouter au programme » `notion_requests` + « Contenu
  à créer » `content_requests`) ; **pastille sommée** (`GET /api/notion-requests/count` +
  `fetchContentRequestsCount`, event `DEMANDES_CHANGED_EVENT` partagé, `lib/demandesEvents.ts`).
- **VÉRIFIÉ LIVE** (UI Papa) : chat espagnol → carte → notion_request → inbox → « Créer la leçon »
  (Français/Grammaire) → leçon 83 + Skill créées + `added` (nettoyé après).

- **Correctif UX notions orphelines** : « Ajouter au programme » (comme skills-backfill) crée une
  `Skill` SANS leçon → invisible dans la page Programme (leçon-centrée). Panneau **« 🧩 Notions sans
  leçon »** par matière (`GET /api/subjects/{id}/orphan-notions`, `OrphanNotionsPanel` dans
  `ProgrammePage`) → répare aussi le trou pré-existant du skills-backfill. **Vérifié live** (« les
  nombres complexes » visible sous Maths).

**⚠️ ULTRAREVIEW PR #57 (2026-07-30) : 5 findings `nit`, TOUS confirmés et CORRIGÉS** (commit de
suivi) — détail addendum ADR §Correctifs de revue : (1) fausse promesse « je le note pour Papa » sur
un outil hors mapping (quiz/capsule/halluciné) → repli `cours` obligatoire ; (2) fausse confirmation
Massimo si `requestNotion` échoue → confirmation dans le `try`, carte conservée ; (3) demande
réactivée non remontée → tri `updated_at` ; (4) doublon de leçon au retry après panne Ollama →
`added` marqué AVANT la rédaction + garde d'idempotence + `course_error` ; (5) émission sans rollback
→ **SAVEPOINT** `begin_nested`. 5 tests-verrous ajoutés (dont une **vraie** `IntegrityError`).
⚠️ piège test : `func.now()` a une granularité d'1 s sur SQLite → poser les dates explicitement.

**Tests : 610 back + 231 Papa + 182 Massimo + tsc + builds VERTS.** **✅ MERGÉ `main` via PR #57**
(squash `9b53af1`) — 2 commits d'origine (`2ba1a1b` chantier, `b52fb77` correctifs de revue).
⚠️ données de test en DB dev : notion orpheline « Nombres relatifs » (Maths, **non supprimable** car
historique Massimo) + quelques `notion_requests` `added` résiduelles.
Perso : [[chat-orchestrateur-adr0027]].

### NEXT (prochain chantier, à décider)
Le chantier **Dashboard Papa v2** est complet mais **non poussé** — c'est lui le prochain pas.
Pistes ouvertes ensuite : production **en lot** depuis l'inbox/la Couverture (« ⚡ Compléter le
chapitre » est encore désactivé) ; suppression du `NotionRequestsPanel` de la page Programme
(doublon avec l'inbox `/demandes`) ; quiz par notion (hors v1 ADR-0027, `location.state`) ;
**correction du bug d'échelle `mastery_score`** (0–100 traité comme 0–1) ; `/progression` est encore
100 % mockée alors que `/api/parent/progress/*` existe.

---

### Historique — Orchestrateur (ADR-0027, MERGÉ), détail conservé pour les pièges :
- **A (backend)** : le chat produit un **intent typé** que le serveur **ancre** — `resolve_action`
  (`app/modules/chat/actions.py`) : `resolve_skill` → `galaxy.notion_panel(skill_id)` (matière +
  contenus `available` + ids) → route depuis un id **validé** (fiche→`/fiches/<slug>`,
  mindmap→`/mindmaps/reconstruire/<id>`, eli5→`/eli5?skill_id=`, révision→`/revision?subject=<slug>`) ;
  cible non ancrable → `action=None` **et ZETIS le dit** ; contenu absent → note « je le note pour
  Papa » (mécanisme différé). `show_data` = le front fetch. `ChatMessageOut.action` =
  navigate|show_data|None ; `chat_turn_schema` +`intent` ; `ai_jobs` métadonnées seules (+`action`,
  jamais de texte). **581 back verts** (test-verrou « jamais de route hallucinée »).
- **B (frontend)** : `ChatPage.tsx` exécuteur — **voix→`navigate()` direct**, **clavier→carte-action
  à taper**, **`show_data`→carte inline** (`components/ChatDataCard.tsx` récupère agenda/reviews/
  missions). `lib/chatActions.ts` (`surfaceOf`, `DATA_ROUTE`), `ChatReply.action`. Le geste émet
  `chat_tool_response` (surface dérivée de la route, zéro nouvel event). **178 Massimo + tsc + build
  verts** (3 neufs : voix→navigate, clavier→carte→navigate+trace, show_data→carte). Backend relancé
  `:8000` avec l'orchestrateur.
- **Correctif post-test live (2026-07-30)** : « nommer une notion » (ex. « addition et soustraction de
  fractions ») ne redirigeait pas — qwen3 classait `intent=none`. Fix : (a) `skill_resolution` aligné sur
  la VISIBILITÉ (`Chapter`/`Lesson` validés) — évite les « pas dans ton programme » contradictoires ;
  (b) **repli serveur** : notion résolue + aucune action LLM → ZETIS **propose une carte ELI5**
  (`confirm=True`) ; (c) drapeau `confirm` → offre implicite = carte même à la voix, **auto-nav vocale
  réservée aux demandes explicites** ; (d) exemple dans le prompt. Vérifié : « fractions » → skill 127 →
  action `/eli5?skill_id=127`. 582 back + 179 Massimo verts.
- **Slice B + correctif COMMITÉS** (`4fce7d6`). **Q1 « menu de notion » FAIT (non commité)** : notion
  nommée sans outil → `notion_panel` → action **`notion_menu{name, items:[{kind,route,label}]}`** (contenus
  `available` seulement, chacun ancré via `_notion_route`) ; 1 item → carte simple, ≥2 → menu. Front :
  `ACTION_UI` extrait dans **`lib/notionActionUi.ts`** (module léger — NE PAS importer `NotionActionPanel`
  dans le chat, ça traînerait three.js) ; rendu boutons + `goMenuItem` (trace `chat_tool_response`). 583 back
  + 180 front + build verts (chat sans three). **NEXT = commit Q1 → Étape 2 : file `content_requests`**
  (nouvelle table + migration + émission chat + badge Couverture Papa + addendum ADR-0027 = Point ouvert n°4).

---

### Historique (chantier chat mémoire+voix ADR-0026, MERGÉ) — conservé pour les pièges

**Slice A backend FAITE** (commit `d03918c`) :

- **Zéro table, zéro migration** (invariant de l'ADR : le verbatim est éphémère par construction).
- **`app/modules/chat/`** : `store.py` (sessions Redis, TTL glissant `chat:{student}:{session}`,
  `InMemoryChatStore` pour les tests + dépendance `get_chat_store`), `service.py` (orchestrateur
  d'un tour), `schemas.py`, `router.py` (3 routes `require_child` sous `/api/student/chat` —
  sessions / messages / close ; **aucune route parent, aucune méthode GET**).
- **Module PARTAGÉ** `app/modules/ai/skill_resolution.py` : texte libre → `skill_id` par cosinus
  d'embeddings (nomic-embed-text, notions de l'année active + repli sur toutes), best-effort
  absolu (ne lève jamais). ELI5 en héritera (différé promu prérequis, ADR-0026 §6).
- **3 `learning_events`** dans `activity/events.py` (`chat_topic`, `chat_tool_response`,
  `chat_difficulty_declared`), émis serveur, non probants, **zéro XP**.
- **Règle Gap §3** : `source=ai_observation` (1er producteur), `severity=low` toujours,
  corroboration = `SkillMastery ∈ {unknown,weak,learning}` **et ligne existante** (sans ligne →
  pas de Gap), lacune ouverte → rien, jamais d'escalade.
- **`ai_jobs` de métadonnées seules** pour un tour (`chat_turn`) : `input=`{session,index},
  `output=`{skill_id,kind,tool_type,duration} — **jamais un texte** (pipeline aveugle §1c).
- Constantes versionnées dans `core/config.py` (`CHAT_SESSION_TTL_MINUTES=120`,
  `CHAT_MAX_TURNS_PER_SESSION=40`, `CHAT_CONTEXT_TOKEN_BUDGET=300`,
  `CHAT_SKILL_RESOLUTION_MIN_SCORE=0.55`, `CHAT_RECALL_WINDOW_DAYS=7`). Prompt versionné
  `app/prompts/chat.py` (`chat_v1`, sortie structurée — point ouvert n°1 tranché en JSON).
- **`app/tests/test_chat.py` : 16 tests d'invariants verts** (metadata sans table chat, ai_jobs
  sans verbatim, dédupes, matrice Gap, TTL, purge, anti-spam 429, zéro XP, frontière parent).
  **Suite complète : 576 back verts, zéro régression.** App démarre (40 routers).

**Slice B FRONTEND FAITE (Lot 1 texte + avatar), NON commitée** — même branche `feat/chat-memoire` :
- **Brique `@zetis/ui/avatar`** (sous-chemin dédié, patron `@zetis/ui/mindmap`) : `AvatarCanvas.tsx`
  (moteur canvas transposé de la maquette — bruit apériodique, spectre radial, coquilles
  directionnelles, horloges indépendantes iris/paupières/mâchoire), `constants.ts` calibrées,
  `phonetics.ts` (flux gelé `[ouverture, grave, médium, aigu]`), `avatar.css`, image webp extraite
  de la maquette en asset réel (`assets/zetis-face.webp`). Contrat : zéro fetch, zéro métier.
- **Page `/chat`** (`ChatPage.tsx` + `chat.css` + `lib/chat.ts` + `lib/karaoke.ts`) : états 1→5,
  karaoké piloté par la pseudo-phonétique, tap-pour-couper, carte outils APRÈS la parole seulement,
  phrase de transparence fixe, 429 doux, toggle « animations réduites », deep-link ELI5 seul câblé.
- ⚠️ **Patron réseau = INLINE, PAS le polling `/ai/jobs`** : la réponse revient dans le POST
  `messages` (la spec/prompt supposaient ELI5-polling, impossible ici car `ai_jobs.output_json`
  est durable + lisible sans contrôle → violerait §1c). Stop-on-blocker tranché par l'ADR.
- ⚠️ **Recall chip d'ouverture NON fait** : slice A n'expose aucune route « notions récentes »
  (le rappel est composé serveur pour le LLM, pas renvoyé au client). Différé, pas inventé.
- **Vérifs** : `tsc -b` propre, **173 tests Massimo verts** (6 sur `ChatPage`, dont test-verrou
  source = aucune API vocale navigateur ni stockage local), `vite build` vert. Avatar **non vu
  à l'écran** (canvas nul en jsdom ; verif live = user une fois loggé).

**Slice B Lot 1 COMMITÉE** (`71f8094`). **Lot 2 VOIX FAIT, NON commité** (même branche) — voix
complète 100 % locale, zéro nouvelle dépendance :
- **Entrée (STT)** : bouton micro appui-pour-parler → réutilise l'endpoint ELI5 Whisper
  (`/api/ai/eli5/transcribe`, local) → texte → tour de chat. `lib/dictation.ts` (MediaRecorder)
  réutilisé. Micro masqué si non supporté ou STT 503.
- **Sortie (TTS)** : route backend **`POST /api/student/chat/tts`** (Piper local, `service.synthesize_speech`,
  audio éphémère jamais persisté, 503→repli muet). Front `lib/voice.ts` : lit le WAV via un
  **`AnalyserNode`** qui pilote la bouche de l'avatar depuis le VRAI audio (la source promise du flux
  d'articulation — le consommateur `AvatarCanvas` n'a pas changé). Karaoké calé sur la durée réelle.
- Repli propre : sans `AudioContext` (jsdom/ancien navigateur) ou sur 503 → karaoké muet du Lot 1.
  iOS : `primeAudio()` sur geste (envoi/micro).
- **Vérifs** : `tsc -b` + **175 tests Massimo** + `vite build` verts ; **577 back** (test route TTS) ;
  **TTS prouvé LIVE** (`POST /tts` → HTTP 200 audio/wav 148 Ko, Piper réel). UI voix/micro **non vue**
  (canvas + audio nuls en jsdom ; login = user).

- **prochain pas : vérif humaine (tests + diff) + essai live voix/micro par le user → commit Lot 2
  → PR `feat/chat-memoire`.** Puis lots restants (hors ADR-0026) : streaming SSE, bornes de mots
  réelles pour le karaoké (TTS à timestamps), migration Rive.
  Classifieur de difficulté pas encore éprouvé sur le vrai 4B (Ollama).

**CHANTIER SUIVANT CADRÉ (docs, non commité) — Chat ORCHESTRATEUR (ADR-0027, Proposé)** : le chat
pilote toute l'app en langage naturel (« montre mes fiches sur les fractions », « c'est quoi mes
devoirs »). Cadrage écrit ce jour (fichiers **neufs**, pas de chevauchement avec le code voix) :
`docs/decisions/adr-0027-chat-orchestrateur.md`, addendum `page-chat.md §Orchestration`, 2 prompts
`prompt-chat-orchestrateur-slice-{a-backend,b-frontend}.md`, ligne `DECISIONS.md`. Cœur : intent LLM
typé **ancré serveur** (`resolve_skill` → `galaxy/notion/{skill_id}` → route depuis un id **validé** ;
cible non ancrable → `action=null`, jamais de route hallucinée) ; `ChatMessageOut.action` =
navigate|show_data|null ; **nav modale** (voix→direct, clavier→carte) ; **données dans le chat** (front
fetch, pipeline aveugle §1c) ; **orienter vers l'existant validé jamais générer** ; réutilise
`chat_tool_response` (aucun event neuf). **4 décisions à VALIDER par le user avant slices.**
Séquencement : merge chat voix d'abord → cadrage sur `main` → implémenter sur `feat/chat-orchestrateur`.

⚠️ **Piège dev (2026-07-30)** : « impossible de se loguer sur Massimo, `massimo1234` ne marche
plus » = **backend éteint**, PAS un mot de passe changé. Le front pointe `VITE_API_URL=:8000` ;
sans backend, le login échoue avec une erreur d'auth trompeuse. Fix : relancer
`uv run uvicorn app.main:app --port 8000` depuis `apps/backend`. Aucun override `MASSIMO_*` en
`.env` — le mot de passe reste `massimo1234` (dev_users, `config.py`).

⚠️ **Écarts read-before-code du chat, à ne pas re-débattre** :
- **`ai_jobs` n'est PAS asynchrone** (ni worker ni polling) : ELI5 exécute le LLM en synchrone
  dans le POST. Le chat suit ce patron synchrone — d'où « aveugle au contenu » trivial.
- **Aucun embedding stocké par `Skill`**, pas de lien direct Skill→année active : la résolution
  vectorise les notions candidates à la volée (jointure SchoolYear active → LessonSkill → Skill,
  repli toutes notions si vide).
- **Redis n'avait aucune convention session/TTL** (seul RQ média l'utilisait) : `store.py` la
  crée (doctrinalement prévu, ARCHITECTURE §Redis).

⚠️ **Chantier précédent — Agenda scolaire (ADR-0025) : COMPLET, MERGÉ `main` PR #56** (squash
`f8c5e28`), branche supprimée. Backend + page Papa + page Massimo. **Ne pas ré-implémenter.**
Piège hérité, toujours vrai et réutilisé par le chat : trois lecteurs de `learning_events`
n'étaient **pas** filtrés par `event_type` (`activity._load_events`,
`activity._trailing_inactive_days`, `motivation._active_days`) → frozenset `NON_ACTIVITY_EVENTS`
(`activity/events.py`). Les 3 événements de chat sont **non probants** parce qu'`evidence` ne lit
que `mission_verdict` (test-verrou) — pas besoin de les ajouter au frozenset (qui ne concerne que
les projections d'activité, pas l'évidence).

**Chantier précédent — ZETIS Galaxy : MERGÉ** dans `main` (PR #55, merge `af039d0`).
La section ci-dessous est conservée pour ses pièges, pas pour son état.

Le chantier a été ouvert comme un cadrage (maquette → spec → ADR-0024 → prompts), puis le user a
demandé d'enchaîner l'exécution dans la même session. Les deux slices y sont : backend `galaxy`
(4 routes + frise, **aucune migration**) et frontend Massimo (page Progression refondue + aperçu
sur l'Accueil). **Vérifié à l'écran sur la vraie base**, pas seulement en test.
Voir §« Chantier ZETIS Galaxy » plus bas pour les pièges — ils sont coûteux à re-découvrir.

Le chantier « Couverture de production »
(ADR-0023) est **MERGÉ** : PR [#54](https://github.com/NeuronXcore/zetis-school/pull/54), merge
commit `dc82f9c`, **7 commits conservés individuellement** (merge commit délibéré, pas de squash :
chacun est autonome et revertable seul, ce qui comptait surtout pour `chore(assets)`). Branche
`docs/couverture-production` supprimée en local et sur `origin`.

⚠️ **Ne pas ré-implémenter** la Couverture : elle est complète et sur `main` — backend
(`production` + `engagement` + provenance), page Papa, passe visuelle, convention d'assets.

### Dépôt nettoyé (2026-07-28) — 4 branches et 2 stashes, rien de perdu

**État : `main` seule, local et distant. Zéro branche, zéro stash.**

Les 4 branches supprimées étaient toutes vérifiées fusionnées **avant** suppression, et leurs tips
restent restituables à vie par les refs de PR que GitHub conserve
(`git fetch origin refs/pull/<n>/head`) :

| Branche supprimée | Preuve | Tip archivé |
|---|---|---|
| `feat/activite-backend` | PR #52 · SHA fusionné = tip | `refs/pull/52/head` → `1284deb` |
| `feat/motivation-massimo` | PR #53 · SHA fusionné = tip | `refs/pull/53/head` → `befe91e` |
| `mindmap` | tip ancêtre de `main` | `refs/pull/51/head` → `3d2b499` |
| `mission` | PR #46 · tip ancêtre de `main` | `refs/pull/46/head` → `cb3d581` |

**Les 2 stashes ont été récupérés avant d'être vidés** (commits `08c5723` + `d1b70ba`) :

- `stash@{1}` (4 semaines, `feat/design-system`) portait **deux specs jamais atterries** —
  `docs/frontend-massimo/navigation.md` et `zetis-galaxy.md`, 265 lignes. Vérifié : « galaxy »
  n'existait nulle part ailleurs dans le dépôt. ⚠️ Elles arrivent avec un **bandeau de réserve** :
  elles se déclarent normatives alors qu'elles n'ont jamais été confrontées au code, et 4 semaines
  de développement ont passé. **Ne pas les faire appliquer sans les vérifier ligne à ligne.**
  ZETIS Galaxy reste une conception **non implémentée**.
- `stash@{0}` (24 h) enrichissait l'index des ADR. Repris : les descriptions 0001→0005 et les
  amendements ADR-0017. Le reste (0012→0019) existait déjà dans `main` sous une formulation plus
  récente — sa version de `DECISIONS.md` était antérieure à l'ADR-0023, la restaurer en bloc aurait
  fait régresser le fichier. Écart connu et assumé : pour ADR-0018 et ADR-0019, la ligne d'index du
  stash était plus longue que celle de `main` ; les ADR eux-mêmes sont intacts.

⚠️ **Deux pièges de diagnostic**, à connaître avant de refaire ce contrôle :

- **`git branch --merged` ne liste PAS `activite` ni `motivation`.** Les PR #52 et #53 ont été
  **squashées** : les commits d'origine ne sont donc pas ancêtres de `main`, seul leur contenu y
  est (`6e7cb78`, `40bcef8`). L'outil dit vrai sur la topologie et faux sur le fond — s'y fier
  seul ferait conclure à du travail perdu.
- **Le diff de contenu vs `main` n'est pas un test** : 1188 et 484 lignes d'écart, mais c'est
  `main` qui a avancé depuis sur les mêmes fichiers. Comparer un tip figé à une trunk qui bouge ne
  prouve rien.

Le seul test qui tranche pour une branche squashée : **`gh pr view <n> --json headRefOid`** (le SHA
que GitHub a réellement fusionné) comparé au tip local **et** distant. S'ils sont identiques, rien
n'a été poussé après la fusion.

### Session 2 (2026-07-28) — passe visuelle `/couverture` + rangement des assets

La passe visuelle demandée au « prochain pas » a été faite, **pilotée par le user** qui regardait
la page dans son propre navigateur (l'agent n'a jamais eu de session Papa : il ne saisit pas de
mot de passe). Quatre retours, quatre livrables — détail dans `docs/frontend-papa/page-couverture.md`
§Passe visuelle :

1. **KPI cliquables** → chacun ouvre son complément (« 27/78 cours » ouvre les 51 restants). La
   pilule « 🔒 Bloquées » a été **scindée** en `🔒 Non validées` / `📝 Sans cours` : elle mélangeait
   les deux causes, or `blocked_no_course` ne contient que des leçons *validées* — « Leçons
   validées » ne pouvait pas pointer dessus sans se contredire.
2. **Pictogrammes de matière** sur les en-têtes de matrice **et** en pastilles de filtre (le
   `<select>` a disparu). `SubjectPictogram` extrait de `SubjectFilterChips` → un seul rendu.
3. **Expanders par matière** : repliés en vue d'ensemble, dépliés dès qu'un filtre ou une matière
   est demandé, avec rappel d'anomalies (`🔒 4  ⏳ 2`) calculé sur la matière **entière**.
4. **Icône `CouvertureIcon`** (fournie par le user) + respiration lumineuse, aux 3 endroits qui
   désignent la Couverture (en-tête animé, sidebar, relais Dashboard).

**Rangement des assets, hors chantier mais demandé explicitement** (« mets de l'ordre », puis
« go ») : ~9,8 Mo retirés des bundles (Massimo 10,3 Mo → 1,6 Mo ; Papa 2,1 Mo → 1,0 Mo), 11
originaux rapatriés dans `assets/brand/icons/`, 2 doublons exacts supprimés, planche de contact
sortie du glob. La **règle a été inversée** dans `assets/brand/README.md` : les visuels importés
vivent dans `src/assets/`, pas dans `public/assets/` — c'est ce que le code faisait déjà, la doc
avait tort. Voir §DÉCISIONS ACTIVES.

**Vérifié** : 212 Papa + 111 Massimo verts, `tsc -b` et `vite build` verts sur les deux apps.
L'icône et son animation ont été prouvées sur un **banc d'essai isolé** (le navigateur intégré
n'étant pas connecté) : capture + `getAnimations()`. Le reste de la page **n'a toujours pas été vu
de bout en bout par l'agent**.

### Chantier « Couverture de production » (ADR-0023) — CLOS

Quatre commits, dans cet ordre (chacun dépend du précédent) :

1. **`8c993b6` docs** — ADR-0023 + addenda ADR-0011 §E (fraîcheur) et §F (provenance), 4 ADR
   amendés, maquette + spec + 2 prompts de slice.
2. **`02f37a9` engagement** — prérequis : module neutre `engagement` + exception « mission
   engagée » sur les chemins d'achèvement des mindmaps.
3. **`586b202` production (backend)** — `is_stale`, provenance (migration `d5e6f7a8b9c0`),
   modèle de lecture + 2 endpoints `require_parent`.
4. **(ce commit) frontend + correctifs** — page Couverture, liens ciblés, validation en lot,
   et deux défauts de schéma/UX corrigés (voir ci-dessous).

**Migrations appliquées sur la DB de dev** : `d5e6f7a8b9c0` (provenance, 6 tables, reprise NULL)
et `e6f7a8b9c0d1` (horodatages `fiches`/`mindmaps`).

**Vérifié** : 518 back + 203 Papa verts, `tsc -b` et `vite build` verts, un seul head alembic.
Modèle de lecture éprouvé sur **Postgres réel** (69 leçons, 18 requêtes, 79 ms — aucun N+1).

⚠️ **Ce chantier n'a PAS été vérifié à l'écran de bout en bout** : la session Papa du navigateur
intégré a expiré en cours de route, et l'agent ne saisit pas de mot de passe. Le user a testé
manuellement et a remonté 3 défauts réels que les tests ne voyaient pas (cf. `TROUBLESHOOTING.md`
§ chantier `couverture`). **La prochaine session doit commencer par une passe visuelle.**

### Ce que le user a remonté et qui reste ouvert

- **Colonne Fiche** : le lien ciblé surligne la carte mais n'ouvre pas sa modale — volontaire
  (c'est un ÉDITEUR, pas une vue), à trancher si la symétrie avec quiz/mindmap est préférée.
- **Ouverture auto de la modale mindmap** : ajoutée sur un malentendu de ma part (le user parlait
  de la colonne *Cartes*, pas *Mindmap*). Défendable en soi — à confirmer ou retirer.
- **5 générations non voulues** dans la DB dev (jobs #316→#320), **gardées** sur décision du user.
  « Calculs avec priorités et nombres relatifs » reste en `draft` : son cours vient d'être rédigé,
  le gate ADR-0009 §A joue son rôle — **ne pas la revalider mécaniquement**.

### Derniers chantiers mergés (repères)

- **Conseil de classe IA (ADR-0020) + équipement de mission (ADR-0021)** — PR #48 (`639209e`).
  Module backend `reports` : narration LLM **locale** sur le service d'évidence, rapport **persisté**
  (`council_reports` + `evidence_snapshot_json`, migration `b8c9d0e1f2a3`), recommandations typées →
  missions via Commander ; **équipement** = « Créer ces missions » génère + auto-valide le kit
  (cours/fiche/SRS/quiz/mindmap), **jamais de régénération** de l'existant. Front Papa
  (`ConseilClasseIAPage` + `lib/councilClass.ts` + `hooks/useCouncilClass.ts`) + liste missions
  Massimo (`origin` papa/zetis + badge ✨ new).
- **Missions ADR-0017/0018/0019** (moteur, Commander, step mindmap, frontends) — PR #46.
- **`generate_revision` mono-notion** (ADR-0017 §5) — PR #47.

### DÉCISIONS ACTIVES (figées — ne pas rouvrir ; détail dans les ADR)

- **Couverture** : `absent` se déduit de **l'existence de la ligne**, jamais d'une date — une
  date nulle rend seulement le *périmé* indécidable. Le **cours n'entre pas** dans le pourcentage
  de dérivés (il en est la condition). **Aucun agrégat de provenance** (§F.2), aucun tri, aucun
  score par matière : la page répond à « où j'en suis », elle ne produit pas un classement.
- **§F** : `mark_validated` est l'**unique** point d'écriture de `validated` ; toute action
  groupée écrit `parent_bulk` **sans exception** ; `system` est **strictement réservé au quiz**
  (test-verrou). Une leçon déjà validée n'est jamais re-tamponnée par un lot.
- **Assets (session 2)** — l'original pleine résolution va dans `assets/brand/`, la **réduction**
  (suffixe `_256` / `_384`, dimensionnée sur le rendu réel **× 3** car Massimo tourne sur iPhone)
  va là où le code l'importe : `packages/ui/src/assets/` si les deux interfaces s'en servent,
  `apps/frontend-<app>/src/assets/` sinon. **`public/assets/` n'est plus le point de dépôt** — un
  `import` TS fait échouer le build si le fichier manque, hashe le nom pour le cache, et sort du
  bundle ce qui n'est plus utilisé. Règle complète : `assets/brand/README.md`.
- **Couverture — KPI** : un KPI ouvre son **complément**, pas ce qu'il compte (un chiffre atteint
  ne se travaille pas). Les cartes restent cliquables même à zéro (choix du user).
- **Couverture — expanders** : repliés en vue d'ensemble, **dépliés dès qu'on demande quelque
  chose d'explicite** (pilule d'état ou matière). On ne cache jamais ce qui vient d'être demandé.
  Les rappels d'anomalies sont des **comptes**, jamais un pourcentage — le « aucun score par
  matière » ci-dessus tient toujours.
- **Vocabulaire** : « Mindmap » ≠ « carte (de révision) ». Ne jamais écrire « carte mentale »
  dans l'UI Papa — les deux colonnes sont voisines dans la matrice.
- **Capsules** : non générables en un clic **par construction** (l'API exige une `instruction`
  écrite par Papa). Depuis la Couverture, on ouvre le compositeur pré-rempli — avec `skill_id`,
  sans quoi la capsule ne compte dans aucune fraction.

- **Activité — 2 `event_type` RÉUTILISÉS au lieu d'être dupliqués.** La spec demandait
  `eli5_reverse` et `mission_completed` ; le code émettait déjà, au même instant et pour le même
  acte, `reverse_eli5` (`eli5/service.py`) et `mission_verdict` (`missions/service.py`, posé là
  où `mission.status` passe à `completed`). Les ajouter aurait créé **deux événements pour un
  seul acte** → double comptage dans la heatmap ; les renommer aurait cassé leurs lecteurs
  (`evidence.VERDICT_EVENT`, `completed-today`). Constantes `EVENT_ELI5_REVERSE` /
  `EVENT_MISSION_COMPLETED` dans `activity/events.py`. **7 hooks neufs, pas 9.**
- **Activité** : `POST /api/missions/{id}/complete` de la spec **n'existe pas** et n'a pas été
  créé — les missions se terminent par étape (`/{id}/steps/{step_id}/complete`).
- **Activité** : sessions **jamais stockées** (reconstruites à la lecture) ; `xp_events` et
  `learning_events` **jamais en UNION** ; `days_inactive` toujours calculé **toutes matières**,
  même sous filtre.
- **ADR-0020** : rapport Conseil **persisté** (LLM non rejouable) ; `skill_id` **ancrés** sur
  l'évidence ; 100 % local ; Papa-only ; recommandation → missions **mono-notion** via Commander.
- **ADR-0021** : popup Papa = approbation → **auto-validation** du kit (soupape §5ter bornée) ;
  **jamais de régénération** d'une pièce déjà créée (même `pending`) — on valide l'existant + génère
  le manquant ; équiper **avant** de créer la mission.
- **Missions Massimo** : champ d'affichage `origin` (papa/zetis), **pas** l'enum `created_by`
  (pilot-only) ; badge « new » = mission `planned`.

### Chantier ZETIS Galaxy — CADRÉ **ET LIVRÉ** le 2026-07-28

Branche `feat/galaxy`, poussée. **PR à ouvrir.** 157 tests Massimo + 542 backend, typecheck
Massimo + Papa, build — verts. Vérifié **à l'écran sur la vraie base** (Postgres + backend :8003).

**Livré** : cadrage complet (maquette, spec réécrite, ADR-0024, 2 prompts) **+** module backend
`galaxy` (4 routes élève + frise, **aucune migration**) **+** frontend Massimo (page Progression
refondue, aperçu Accueil 2 colonnes, brique `@zetis/ui/galaxy` + sous-chemin `/canvas`).

⚠️ **Ne pas ré-implémenter.** Détail des routes : `API_SPEC.md` §ZETIS Galaxy.

**Trois amendements de l'ADR-0024, tous par décision explicite du user en cours de session** —
ils sont écrits dans l'ADR avec leur date et leur coût, ne pas les rouvrir sans raison :

1. **§9 rouvert** : un graphe **global** existe sur l'Accueil, alors que l'ADR l'excluait. Coûts
   bornés (canvas en `lazy()`, repli sur matières+chapitres au plafond), pas ignorés.
2. **§4 révisé** : la panoplie **complète** est renvoyée avec `available`, au lieu d'omettre
   l'indisponible. Justification : une fiche manquante n'est pas un échec de l'enfant.
3. **2D → 3D** : `@xyflow/react` avait été retenu pour son coût nul, puis disqualifié par
   l'exigence 3D. Deux moteurs graphe coexistent ; **ADR-0016 non rouvert**, les mindmaps gardent
   React Flow.

**Ce que le read-before-code a invalidé dans le brouillon** — à ne pas re-découvrir :

1. **`Skill.prerequisite_skill_ids` n'existe pas** (ni colonne, ni table) et **`parent_skill_id` est
   NULL partout** (`curriculum/service.py:501-521` ne l'écrit jamais). Les « liens stellaires »
   n'avaient **aucune source de données**. → arêtes dérivées de
   `Skill ← lesson_skills → Lesson → Chapter`, rien d'autre.
2. **`GET /progress/skills` n'existe pas**, et `progress` est **Papa-only** (`require_parent`).
   → trois routes élève neuves sous `/api/student/galaxy`.
3. **`/progression` est déjà un onglet** avec une page XP/badges, dont la section « par matière »
   est **mockée**. → la Galaxy prend sa place, l'existant prime sur `navigation.md`.
4. **Seul ELI5 est notion-adressable par URL** (`/eli5?skill_id=N`) ; Quiz et Révision passent par
   `location.state`, Cours/Fiches/Mindmaps par matière. Et **aucune fonction backend** ne dit « pour
   ce `skill_id`, quels contenus validés existent » (`production/coverage.py` est leçon-centrée
   **et** Papa-only). → 3ᵉ route `galaxy/notion/{skill_id}`, réutilisant les résolveurs de
   `missions/service.py:76,98`.

**Pièges rencontrés À L'EXÉCUTION** — chacun a coûté un aller-retour, aucun n'est théorique :

- `SkillMastery.status` a **SIX** valeurs, pas cinq : `in_progress` est écrit par
  `missions/service.py:859` et ne sort d'aucun `_status_from_score()`. Un mapping à 5 branches le
  manque **en silence**.
- `mastery_score` est sur **0–100** ; `evidence.mastery_by_skill()` renvoie la valeur **brute**.
- **Massimo a trois postes, pas un** (précisé par le user le 2026-07-28) : **iPhone, iPad et un
  MacBook dédié à l'école**. Ne pas re-rédiger « l'iPhone est la cible » — c'est le poste le plus
  **contraint**, et ce sont l'iPad et le MacBook qui donnent son sens à la 3D. D'où un plafond de
  nœuds **adaptatif** (40 / 90 / 150, provisoire) et l'interdiction de faire dépendre quoi que ce
  soit d'essentiel du **survol**, qui n'existe pas au tactile.
- **Le `lazy()` ne suffit pas à isoler Three.js.** Ré-exporter le canvas depuis le baril
  `@zetis/ui/galaxy` le faisait entrer dans le bundle de départ (**3,6 Mo**, mesuré). D'où le
  sous-chemin dédié `@zetis/ui/galaxy/canvas`. Ne pas « simplifier » ce baril.
- **Un matériau très émissif APLATIT une sphère** : elle s'éclaire uniformément, plus d'ombrage
  ni de reflet, elle se lit comme un disque. Vrai pour le soleil comme pour le cerveau — garder
  l'émission basse et mettre l'éclat dans les **aures**.
- **Un panneau face caméra est plat par construction** : le pictogramme de matière plaqué sur le
  soleil masquait le limbe ombré. Il a été retiré du soleil (il reste sur l'écran d'ensemble).
- **Sans nœud racine, les composantes se disloquent** (le moteur de forces éloigne les
  composantes disjointes) — d'où `subject` dans une constellation et `root` dans le graphe global.
- **La remontée de l'or doit être TRANSITIVE** : un seul cran suffit dans une constellation mais
  pas dans le graphe global (3 niveaux) — les liens du cerveau restaient éteints.
- **Tailwind v4 pose `cursor: default` sur les `<button>`** (changement vs v3) : `cursor-pointer`
  est explicite partout où l'interactivité doit se voir.
- **En construisant soi-même les objets 3D, `nodeVal`/`nodeColor`/`nodeRelSize` cessent de
  s'appliquer** — reproduire la formule de la lib (`∛volume × rayon`), sinon les nœuds
  rapetissent d'un coup et deviennent inatteignables au doigt.
- **`GalaxyCanvas` ne filtre plus les clics** : il filtrait sur `kind === "skill"` et avalait les
  clics sur les soleils. C'est l'appelant qui décide du sens d'un clic.

**Vérification : mesurer que ça BOUGE ne prouve pas que ça se VOIT.** Trois rendus ont dû être
repris parce que je validais une propriété calculée (`background-position` qui change, animation
déclarée) au lieu de comparer deux captures d'écran. Les captures comparées sont le seul test
utile sur du visuel.

**Vérifié par le user (2026-07-28)** : **MacBook OK**, l'animation est fluide au plafond desktop
(150 nœuds). C'était le poste le plus confortable des trois.

**Reste ouvert** :

- **iPhone et iPad non essayés.** L'iPhone est le poste contraint : c'est lui qui décide si le
  palier `compact` (40) doit baisser. Si ça coince, on baisse CE palier — on ne retire pas la 3D
  des deux autres.
- **`prefers-reduced-motion` toujours non vérifié à l'écran.** Le panneau navigateur ne l'émule
  pas, et le retour « ça bouge sur mon Mac » prouve justement que l'option est **désactivée**
  chez le user — donc le chemin où tout doit se figer n'a jamais été exercé en vrai. Couvert par
  tests unitaires (`particlesFor`) et par la variante `motion-safe:`, rien de plus.
  Pour l'essayer : Réglages Système → Accessibilité → Affichage → Réduire les animations.

### PROCHAIN PAS

**0 bis. MERGER LA PR [#59](https://github.com/NeuronXcore/zetis-school/pull/59)** (connexion) —
`main` est rapatriée dans la branche, le conflit `CHANGELOG` est résolu et la version renumérotée
en `0.30.0`. C'est la dernière PR ouverte.

> ~~Pousser `feat/dashboard-papa-v2` et ouvrir la PR~~ → **fait, mergé** (PR #60, `04b6814`).
> Reste à la charge du user, que l'agent ne peut pas faire : relire l'**amendement de l'ADR-0017
> §5bis** — c'est un changement de **doctrine** du moteur de missions, pas un correctif
> d'affichage.

0. **Ouvrir la PR de `feat/galaxy`** — la branche est poussée, rien n'est mergé.
   Vérifications à la charge du user, que l'agent ne peut pas faire : **MacBook ✅ fait**,
   restent **iPhone + iPad** (plafonds 40/90 provisoires) et **`prefers-reduced-motion`**.
1. **Trancher le sort de la photo de Massimo** —
   `apps/frontend-massimo/src/assets/app/ChatGPT Image 5 juil. 2026, 14_36_01.png` (2 Mo, 1254 px)
   est une **photo du visage de l'enfant** montée dans une icône de progression. Elle est
   versionnée, **importée nulle part** (elle ne pèse que dans git). Laissée intacte
   volontairement : l'agent ne décide pas seul du sort d'une image d'un mineur. Trois options —
   garder / renommer et ranger dans `assets/brand/icons/` / sortir du dépôt.
2. **Une fois la Galaxy mergée**, au choix : **file de relecture** (prérequis dur du cron
   ADR-0023 — automatiser la fabrication d'un goulot est le seul vrai risque), ou **production
   en lot** (§7 : deux passes non fusionnables, cours puis équipement), dont le bouton
   « ⚡ Compléter le chapitre » marque déjà l'emplacement, désactivé.
3. ~~ZETIS Galaxy = chantier à ouvrir~~ → **LIVRÉ le 2026-07-28**, cadrage et code.
   Voir §« Chantier ZETIS Galaxy ». Suites possibles, hors v1 : graphe de **prérequis** (la
   donnée n'existe pas, c'est un chantier pédagogique à part), annonce « +1 étoile » en fin de
   mission, animation temps réel poussée par événement, réconciliation de `navigation.md`.
4. Restent ouverts, sans urgence : le **test flaky** `ProgrammePage` (barre de progression
   temporisée, cf. `TROUBLESHOOTING.md`), et la **vérification à l'écran de bout en bout** de la
   Couverture, que l'agent ne peut pas faire sans session Papa.

### Repères (orientation)

- `graphify explain "production"` / `"provenance"` / `"engagement"`. Back :
  `app/modules/production/` (modèle de lecture), `app/modules/provenance.py` (unique écrivain de
  la validation), `app/modules/engagement/` (exception mission engagée). Front papa :
  `CouverturePage.tsx`, `components/couverture/`, `lib/pilotageLinks.ts`, `hooks/useCoverage.ts`,
  `lib/coverageFilters.ts` (fonctions pures : pilules + `subjectAnomalies`),
  `components/CouvertureIcon.tsx`. Partagé : `packages/ui/src/components/subject-pictogram.tsx`.
- Visuels : `assets/brand/README.md` §Règle principale (source de vérité de la convention).
- Décisions : `DECISIONS.md` (index ADR complet 0001→0023, avec les 3 addenda ADR-0009/0011) +
  `docs/decisions/`. Modèle : `DATA_MODEL.md`. API : `API_SPEC.md`. Pièges : `TROUBLESHOOTING.md`.
- Données de test laissées en DB dev (council_report id 1, missions manual, kits générés) — sans
  conséquence.
