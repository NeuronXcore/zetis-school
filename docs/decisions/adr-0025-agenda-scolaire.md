# ADR-0025 — Agenda scolaire : première source exogène, co-éditée, non probante

## Statut

Proposé — 2026-07-29.

> **Numérotation** : 0018 est pris (« Commander une mission »), 0024 est le dernier
> accepté. Cet ADR est donc 0025.
>
> S'appuie sur : `adr-0017` (missions composées depuis l'évidence, complétion à preuve
> serveur, verdict mono-notion), `adr-0018 §1` (invariant « l'enfant ne voit pas de compte
> à rebours » — **discuté frontalement en §1 ci-dessous**), `adr-0024 §5` (doctrine de
> progression, opposable et rétroactive : aucun capital perdable, aucun décompte de jours
> manqués « sous aucune forme »), `adr-0024 §4` (contenu indisponible affiché grisé),
> `adr-0011 §1` (module neutre à consommateurs multiples), `adr-0013` (le SRS ne montre ni
> intervalle ni retard), `adr-0002` (séparation des deux interfaces).
> **Ne rouvre aucune décision antérieure.**

## Contexte

Tout ce que ZETIS sait planifier, il l'a inventé lui-même : missions composées depuis
l'évidence, cartes SRS dues, rattrapages. Le système n'a **aucune connaissance de ce que le
collège demande** — et Massimo, lui, vit d'abord dans ce calendrier-là.

Besoin exprimé : Massimo doit pouvoir suivre son cahier de texte, anticiper sur une période,
et voir ce qu'il a à faire ; Papa doit pouvoir le remplir aussi.

Trois constats de cadrage :

1. **Le volume scolaire est faible.** Une page purement scolaire serait vide trois jours sur
   cinq, et une page vide meurt — avec elle disparaîtrait l'habitude de saisie, donc la
   matière première de tout le reste.
2. **ZETIS n'a pas d'échéances.** Le `due_at` d'une carte SRS est volontairement invisible
   (ADR-0013), une mission n'a pas de date. Poser ces objets sur un calendrier reviendrait à
   **fabriquer** des rendez-vous qui n'existent pas, donc à fabriquer du retard le lendemain.
3. **ZETIS ne battra jamais Pronote comme lieu de stockage** : c'est là que le collège publie.
   Sa valeur propre est ailleurs — convertir une échéance en travail.

## Constat read-before-code

**1. Le substrat d'évidence filtre par `event_type` — le risque « probant par accident » est
faible.** `DATA_MODEL.md` §LearningEvent l'indique explicitement : `evidence.recent_verdicts`
lit le journal **filtré sur `mission_verdict`** ; les autres entrées lisent `skill_mastery`,
les cartes et les tentatives de quiz, pas le journal. Le vocabulaire des `event_type` est
**fermé et documenté** (`login`, `page_viewed`, `lesson_viewed`, `fiche_viewed`,
`quiz_attempted`, `eli5_requested`, `review_attempted`, `reverse_eli5`, `mission_verdict`,
`mission_step_view`). Vérification résiduelle en slice A : confirmer qu'aucune entrée ne fait
de lecture large non filtrée.

**2. La jurisprudence de §3 existe déjà.** `StudentWeeklyGoal` n'a **aucune colonne
d'atteinte** — « la stocker ferait exister en base un état *objectif non atteint* ; rien de
punitif ne doit être persistable ». La règle « l'absence n'est pas un événement » (§3) n'est
donc pas neuve : elle applique une doctrine déjà tenue ailleurs.

**3. Massimo écrit déjà.** Toujours via `StudentWeeklyGoal` : il pose lui-même son engagement
hebdomadaire. La phase 0 (§10) ne lui retire donc pas *toute* écriture — elle diffère la seule
saisie d'items, ce qui rend le maintien de la coche d'autant plus cohérent.

**4. Le moteur de révision ne sait pas encore faire la session pré-contrôle (§11.2).** Deux
manques constatés :
- **le non-scheduling existe mais est trop étroit** : `SpacedReviewAttempt.is_consolidation`
  couvre le 2ᵉ passage **le même jour**, détecté serveur, **sans effet SRS** et sans flag
  client. Le patron est donc écrit et éprouvé — il reste à l'étendre à un passage hors
  planification ;
- **aucun deck chapitre** : `POST /student/reviews/session` n'accepte que
  `mix_day | mix_flash | {subject}`, trie par `due_at` croissant et renvoie **400 s'il n'y a
  aucune carte due** — or une session avant contrôle porte précisément sur des cartes **non
  dues**.

Conséquence : §11.2 n'est **pas un branchement** mais un ajout au moteur de révision (3ᵉ type
de deck + extension du non-scheduling). À isoler dans sa propre slice du Lot 3.

## Alternatives considérées

- **Étendre `Mission` avec une échéance** plutôt que créer un objet : écarté. Une mission est
  *composée depuis des preuves mesurées* et sa complétion est **vérifiée serveur** ; un devoir
  tombe du ciel et sa complétion est **déclarative, invérifiable**. Les fusionner ferait
  entrer du déclaratif dans le moteur de verdict (ADR-0017 §5bis), ce que tout l'édifice
  existe pour empêcher.
- **Import Pronote / ENT** : écarté en v1. Fragile (scraping cassé à chaque rentrée), hors
  local-first, et dépendance d'un tiers pour la fonction la plus quotidienne du produit.
- **Saisie photo de l'agenda papier (vision locale → items)** : séduisant, écarté en v1. Une
  dépendance modèle de plus et un taux d'erreur qui ruinerait la confiance dans l'objet le
  moins tolérant à l'erreur du produit. Reconsidérable en V2.
- **Saisie réservée à Papa** : écarté. Un agenda qu'on ne possède pas est une liste de
  corvées imposées — et recopier ses devoirs est une compétence scolaire en soi, pas une
  formalité à sous-traiter.
- **Deux pages séparées, « Agenda » (école) et « Missions » (ZETIS)** : écarté pour le motif
  du contexte 1 — la page scolaire mourrait. Une surface, deux objets (§5).
- **Vue mois / calendrier** : écarté. Une grille qui s'archive rend les **trous** visibles, et
  un trou visible est une culpabilité — même motif qui a fait retirer la série le 2026-07-27
  (ADR-0024 §5). La heatmap longue durée reste côté Papa, où elle est un outil d'analyse.

## Décision

### 1. Un agenda exogène peut être daté chez Massimo — la doctrine ADR-0018 §1 n'est pas contredite

L'ADR-0018 §1 est catégorique : la `due_date` d'une mission `manual` est informationnelle,
Papa-only, **jamais** dans `MissionStudentOut` — « l'enfant ne voit pas de compte à rebours ».
Cet ADR affiche des dates et un décompte à Massimo. La distinction est la suivante, et elle
est le fondement de tout le reste :

> Une `due_date` de mission est une pression **fabriquée** par ZETIS ou par Papa : la masquer
> la supprime. Une échéance scolaire **existe déjà** dans le monde de Massimo — écrite dans
> son agenda papier, annoncée en classe. La masquer ne supprime pas la pression : elle
> supprime seulement son moyen de s'organiser.

L'invariant d'ADR-0018 protège l'enfant d'un compte à rebours **inventé**. Il ne s'applique
pas à un compte à rebours **subi**. Conséquence de nommage : la colonne s'appelle **`due_on`**,
jamais `due_date` — les deux sémantiques ne doivent pas se confondre en relecture.

### 2. Co-édition Massimo / Papa : quatre règles, sans lesquelles l'objet bascule

**a) Personne ne réécrit silencieusement l'autre.** Papa peut corriger un item de Massimo ;
l'item porte alors un marqueur visible côté enfant (« complété par papa »). Sans ce marqueur,
Massimo découvre un agenda qui bouge tout seul : la surveillance rentre par la porte de
service.

**b) Seul Massimo coche.** Papa n'a pas accès à `done_at` — refus **403**, et l'affordance
n'existe pas dans son interface. **Cette règle vaut dès la phase 0** (§10) : même quand
Massimo ne saisit pas encore, il coche. Si le parent coche, la case devient une validation parentale
et l'agenda devient un instrument de contrôle. Papa dispose d'une note privée, pas de la coche.

**c) Suppression = archivage.** Papa n'efface jamais un item de Massimo (`dismissed_at`).
Réciproquement Massimo peut masquer un item de Papa — et ce masquage reste visible côté
pilotage. **Asymétrie assumée** : le parent voit tout, l'enfant voit ce qui le concerne.

**d) Doublons tolérés, signalés à la saisie.** Même matière + même date → « il y a déjà *X*,
c'est la même chose ? », deux issues, **aucune fusion automatique**. Un doublon coûte moins
cher qu'une fusion erronée.

### 3. Traçabilité : deux niveaux, et un événement volontairement absent

**Niveau ligne** : `created_by` (immuable), `created_at`, `edited_by_parent_at`, `done_at`,
`dismissed_at`. **Pas de table d'audit** (sobriété).

**Niveau journal** (`learning_events`) : exactement deux types, `agenda_item_created` et
`agenda_item_done`, marqués **non probants**.

> **`agenda_item_missed` n'existe pas et n'existera pas.** L'absence n'est pas un événement.
> Même règle que `StudentWeeklyGoal`, qui n'a délibérément aucune colonne d'atteinte : *rien
> de punitif ne doit être persistable*.
> En émettre un fabriquerait mécaniquement une dette dans le journal, alimenterait le Cahier
> de bord en constats d'échec, et finirait par remonter en alerte. L'écart déclaré / fait se
> **lit** par requête côté Papa ; il ne se **diffuse** pas.

**Mesurer n'est pas prioriser.** L'interdiction ci-dessus porte sur la **mesure** : rien de
l'agenda ne doit permettre de déduire ce que Massimo sait (cocher ne prouve rien, ne pas
cocher ne prouve rien). Elle n'interdit pas la **priorisation** — utiliser une échéance pour
décider dans quel ordre travailler ce qui est *déjà mesuré par ailleurs* (§11). Un contrôle
jeudi ne change pas ce que Massimo sait ; il change ce qui est utile maintenant.

Invariant testé : cocher un item ne change **aucune** sortie de `evidence/service.py`
(`mastery_by_skill`, `open_gaps`, `recent_verdicts`, `weighted_quiz_signal`, `srs_pressure`),
ne touche aucune carte SRS, ne crédite **aucun XP**. L'XP vient de la session déclenchée, elle
prouvée serveur — cocher une case ne se récompense pas, sinon Massimo apprend à cocher.

### 4. Règle de datation — le seul flux daté est l'exogène

> **Le calendrier n'accueille que ce qui a une date dans le monde réel. ZETIS ne se donne
> jamais rendez-vous à lui-même.**

Unique dérogation : les étapes d'un plan de préparation (Lot 2), qui héritent de la date d'une
échéance scolaire réelle — jamais de la leur. Aucune carte SRS, aucune mission n'apparaît dans
les surfaces datées, sous aucune forme (test-verrou).

### 5. Une surface, deux objets

La vue de Massimo **fusionne** les deux flux ; le modèle les garde **strictement séparés**
(`agenda_items` déclaratif et non probant / `missions` composées sur preuves). La composition
est faite **serveur**, dans un schéma de sortie dédié.

Effet recherché : quand le collège ne demande rien, la semaine de Massimo n'est pas vide — elle
est remplie par ce que ZETIS propose. Le message implicite est le bon : *le travail ne dépend
pas de ce que le collège demande.*

### 6. Trois horizons, trois surfaces

| Horizon | Surface | Contenu |
|---|---|---|
| Maintenant | Accueil | 1 à 3 gestes, **aucune date affichée** |
| La semaine | `/agenda` | bande **glissante** de 7 jours |
| Ce qui arrive | bas de `/agenda` | contrôles et rendus **seulement**, max 4, horizon 21 j |

**La bande est glissante, jamais alignée sur la semaine calendaire** : 3 jours avant
aujourd'hui, aujourd'hui, 3 jours après. Une bande calendaire passerait de 6 jours d'horizon
le lundi à 0 le dimanche — l'écran deviendrait un pur rétroviseur au pire moment.

**Asymétrie passé / futur, calculée serveur** : les jours passés ne portent que des traces
d'activité ; les jours à venir ne portent que les points fixes. Un jour à venir n'a pas de
passé, un jour passé n'a plus d'échéance à annoncer.

**Le décompte de « ce qui arrive » n'est pas une jauge qui change de couleur.** Le seul signal
d'approche est l'apparition du plan de préparation.

### 7. Traces positives uniquement — conformité ADR-0024 §5

La moitié rétrospective de la bande affiche **0 à 3 traces allumées, sans réceptacle vide**.
Un jour sans trace est visuellement **identique** à un jour hors plage : l'absence n'est pas
lisible.

Un gabarit de cases dont certaines resteraient éteintes serait un **décompte de jours
manqués**, interdit « sous aucune forme » par ADR-0024 §5 — la même raison qui a fait retirer
la série le 2026-07-27. Corollaire : **une trace ne s'efface jamais** parce que Massimo n'est
pas revenu. Le contrat serveur ne distingue donc pas `0` de « pas de donnée ».

Interdits transverses sur les surfaces Massimo : aucun rouge, aucun « en retard », aucun
compteur d'arriéré, aucun total, aucune série. Un item passé non fait devient « à reprendre »
(ambre doux), **3 affichés au maximum** quel qu'en soit le nombre — la section ne grossit pas.

### 8. Rôle de ZETIS — trois rôles, par ordre de valeur

> ⚠️ **Amendé par §11 et le déploiement en deux phases (§10).** Les rôles 2 et 3 ci-dessous
> n'ont de sens que si Massimo saisit en texte libre. En phase 0, Papa sélectionne matière,
> date et chapitre dans des menus : **le rôle 1 seul subsiste**, et il se compose depuis le
> référentiel, sans LLM. Conservés ici pour le jour où la saisie élève s'ouvre.

1. **Traducteur** : échéance → plan rétro-planifié sur les jours restants, câblé sur
   l'existant (fiche, deep-link SRS, quiz). **C'est le seul rôle qui justifie la
   fonctionnalité** ; sans lui, ZETIS construit un carnet de plus.
   Le plan est **persisté à la première génération et figé jusqu'à l'échéance** : un plan qui
   se recalcule à chaque ouverture est un plan auquel on ne fait pas confiance.
2. **Structurateur de saisie** : texte libre → étiquettes {matière, date, type}, moteur
   **rapide et local**, trace `ai_jobs` `agenda_parse`, échec gracieux (item créé quand même).
   **Le texte brut est conservé et reste ce que Massimo voit** — ZETIS ajoute des métadonnées
   à côté, il ne réécrit jamais ce que l'enfant a écrit.
3. **Rattacheur** : `label → Skill` best-effort, pour que le plan soit ciblé. Nullable, jamais
   bloquant.

**Ce que ZETIS ne fait pas** : il ne remplit pas l'agenda à la place de Massimo, ne relance
pas, ne notifie pas, ne commente pas un item non fait.

### 9. Surface Papa : saisie en lot, aucune coche

Page `/agenda` dédiée — ni dans le Dashboard (analytique) ni dans le Cahier de bord
(rétrospectif). Saisie **en lot** (une grille de lignes, un envoi) : le mode d'usage réel est
« je relève l'ENT du dimanche soir », pas « j'ajoute un devoir ».

Aucun compteur d'items non faits en KPI : ce serait contourner §3 par l'affichage. Son inverse
positif (« cochés par Massimo ») est autorisé.

### 10. Déploiement progressif — l'agenda s'ouvre en deux temps

La saisie par Massimo est la fonction la plus exigeante en habitude, et la plus coûteuse à
rater : une page qu'il ouvre trois fois puis abandonne ne se relance pas. L'agenda est donc
ouvert **en deux phases**.

**Phase 0 — Papa écrit, Massimo lit et coche.**

- Papa saisit (en lot), corrige, annote, archive.
- **ZETIS ne crée aucun `agenda_item`.** Il ne dispose d'aucune connaissance exogène : en
  créer serait fabriquer des rendez-vous inexistants, ce que §4 interdit. Ce qui remplit la
  page côté Massimo, c'est le **flux ZETIS non daté** déjà fusionné dans la surface (§5) —
  mission du jour, cartes dues — qui ne peut par construction être « en retard ».
- Massimo **lit, coche et masque**. Cocher n'est pas remplir : c'est le seul geste qui rend
  l'objet sien, il ne demande aucune habitude à acquérir, et c'est la rampe d'accès vers la
  saisie. **Sans lui, l'objet n'a pas d'état** — Papa étant en 403 sur `done_at`, personne ne
  pourrait rien marquer comme fait.

**Phase 1 — Massimo saisit aussi.** Le composer s'ouvre ; toutes les règles de co-édition
(§2) s'appliquent alors telles quelles. Rien d'autre ne change.

**Trois règles de mise en œuvre :**

1. **Le verrou est serveur.** `POST /api/student/agenda/items` renvoie **403** tant que le
   flag `AGENDA_STUDENT_ENTRY_ENABLED` (config, défaut `false`, versionné) est fermé. Une UI
   cachée n'est pas une règle.
2. **La bascule est un geste de Papa**, un interrupteur sur sa page. **Jamais automatique** :
   la déclencher sur un seuil de coches observé ferait dépendre un droit d'une surveillance.
3. **Aucun composer grisé.** ADR-0024 §4 (panoplie complète, indisponible grisé) **ne
   s'applique pas** : il grise du *contenu que Papa n'a pas encore produit* — l'état du
   catalogue, pas un jugement sur l'enfant. Griser un composer griserait une **capacité
   retirée à Massimo**. L'ouverture doit être un **événement positif**, pas la fin d'une
   privation affichée pendant des semaines.

### 11. L'agenda comme source de contexte : scope daté, jamais mesure

> **L'agenda fournit un scope daté. Le service d'évidence fournit la mesure. Les moteurs
> existants fournissent l'action.** Aucun moteur nouveau, aucune exception à §3.

**La clé est une colonne, et elle n'existe que parce que Papa saisit.** `agenda_items` gagne
un **`chapter_id` nullable** (FK, référentiel de l'année active), **sélectionné par Papa** dans
la grille de saisie. Zéro embedding, zéro parsing, zéro LLM — même raisonnement que l'ADR-0018
§1, qui a écarté le texte libre au profit de la sélection référentiel. Un item
`{chapter_id, due_on}` **est l'entrée exacte de la porte « échéance » du Commander**
(chapitre + date) : le pont ne demande aucun mécanisme neuf.

**Trois couplages, par ordre de sûreté :**

1. **Missions — direct.** Contrôle daté + chapitre → proposition de commander les missions sur
   les notions fragiles du chapitre, via le **preview/confirm existant** (ADR-0018 §2). Papa
   confirme et décoche ; `force_priority` joue son rôle de **plancher jamais plafond**
   (ADR-0018 §4). L'urgence entre dans le sélecteur par la porte prévue pour elle.

2. **Révision — ne jamais avancer les cartes SRS.** Le SRS mesure l'oubli : lire une carte trop
   tôt fausse son prochain intervalle, et un contrôle en juillet dégraderait la programmation
   jusqu'en octobre. La forme correcte est une **session supplémentaire** ciblée sur le
   chapitre, **qui n'écrit aucun état SRS** — ni reprogrammation, ni mise à jour d'intervalle.
   **Constat** : le non-scheduling existe déjà sous une forme étroite (`is_consolidation`,
   2ᵉ passage même jour, sans effet SRS, détecté serveur) — le patron est acquis. Manquent un
   **deck `{chapter}`** (la route n'accepte que `mix_day | mix_flash | {subject}` et refuse
   400 sans carte due) et l'**extension du non-scheduling** hors du même-jour. Slice dédiée.

3. **Évaluation — le quiz blanc compte normalement.** Frontière propre : *l'item d'agenda* est
   non probant, mais *ce que Massimo fait à cause de lui* est une performance mesurée comme
   les autres. Un quiz blanc raté est une vraie information.

**L'analyse rendue à Papa** est le service d'évidence scopé par le chapitre de l'échéance —
*sur ce chapitre : n notions fragiles, n quiz sous le seuil, n cartes en attente* — suivi du
bouton « commander ces missions » qui existe déjà. **Papa-side uniquement** : aucune de ces
analyses n'atteint Massimo, qui ne voit que l'échéance et, le cas échéant, le travail proposé.
Troisième consommateur du substrat après le scoring et le Conseil de classe (patron ADR-0011).

## Périmètre

**Lot 1 — l'objet (aucun appel LLM)** : table `agenda_items` + migration ; module `agenda` ;
règles de co-édition §2 ; bande glissante et « ce qui arrive » §6–7 ; page Massimo `/agenda` +
bandeau Accueil ; page Papa `/agenda` ; tests d'invariants. Saisie **explicite** (champ +
sélecteur de matière + date rapide).

**Lot 3 — l'analyse (§11)** : colonne `chapter_id` + sélection référentiel dans la saisie
Papa ; panneau d'analyse Papa (évidence scopée par chapitre) ; pont vers le Commander
(porte « échéance ») ; session de révision supplémentaire sans écriture d'état SRS ; quiz
blanc. Ne dépend que du Lot 1 et de l'existant.

**Lot 2 — supprimé.** Ses trois rôles disparaissent avec la phase 0 : structurer la saisie
libre (inutile, Papa saisit avec des menus), rattacher la notion (inutile, Papa sélectionne le
chapitre), traduire l'échéance en plan (devient le Lot 3, mais composé depuis le référentiel
plutôt que depuis du texte). À rouvrir **uniquement** si la saisie élève est ouverte un jour —
c'est elle, et elle seule, qui rendrait le parsing nécessaire.

**Hors périmètre (traçé, non planifié)** : import Pronote/ENT ; saisie photo/OCR ;
notifications et rappels ; vue mois ; fusion automatique de doublons ; remontée de l'agenda
dans le Dashboard, le Cahier de bord ou le contexte d'évidence du Conseil de classe.

## Conséquences

### Positives

- ZETIS acquiert sa **première source exogène** et cesse d'ignorer le calendrier réel de
  Massimo.
- La conversion échéance → plan donne au référentiel et aux dérivés (fiche, SRS, quiz) un
  débouché **déclenché par le monde réel**, pas seulement par l'évidence interne.
- Aucune dépendance nouvelle, aucun générateur nouveau en Lot 1 ; le Lot 2 réutilise le moteur
  rapide local et les surfaces existantes.
- La doctrine anti-dette gagne une formulation opposable de plus (« l'absence n'est pas un
  événement »), applicable au-delà de cet ADR.

### Négatives / coûts

- **La phase 0 est, par construction, la « liste de corvées imposées »** contre laquelle une
  saisie Papa-only avait été écartée. Le coût est assumé et borné : la coche est le seul
  contrepoids, et la phase est censée finir. **Le risque n'est donc plus « Massimo ne saisit
  pas », c'est « la bascule n'arrive jamais »** — si Papa remplit correctement, personne ne
  ressent le besoin de changer. D'où une échéance de revue explicite (§Suivi) plutôt qu'un
  « quand il sera prêt ».
- **Le produit dépendra à terme d'une saisie manuelle quotidienne.** Si l'habitude ne prend
  pas après la bascule, le Lot 2 perd sa matière première. Ne se mitige pas techniquement —
  seulement par la friction minimale de la saisie et le bénéfice visible du plan.
- **Du déclaratif entre dans le produit**, dans un système entièrement construit sur la preuve
  serveur. Borné par §3, mais c'est une frontière nouvelle à surveiller.
- **Une surface Massimo de plus** (12 onglets aujourd'hui), sur une navigation dont la
  réconciliation traîne au BACKLOG (ADR-0024 §Divergence).
- Le plan figé (§8) peut devenir obsolète si l'échéance est déplacée — régénération manuelle
  assumée en Lot 2.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; `DATA_MODEL.md` (table `agenda_items`) ;
  `API_SPEC.md` §Agenda ; specs `docs/frontend-massimo/page-agenda.md` et
  `docs/frontend-papa/page-agenda.md`.
- **Maquettes validées** : `docs/frontend-massimo/mockup-page-agenda-massimo.html`,
  `docs/frontend-papa/maquette-papa-agenda.html`.
- **Slices** : (A) backend — `prompts/claude-code/prompt-agenda-slice-a-backend.md` ;
  (C) frontend Papa — `prompt-agenda-slice-c-papa.md` ; (B) frontend Massimo —
  `prompt-agenda-slice-b-massimo.md`. **Ordre recommandé A → C → B** : la page Papa permet de
  peupler des données réelles, sur lesquelles la slice visuelle s'itère mieux que sur des mocks.
- **Invariants testés (un test chacun)** : Papa ne peut écrire `done_at` (403) ; `parent_note`
  absente de tout payload `/api/student/*` ; `edited_by_parent` remonte côté enfant ;
  `created_by` immuable ; DELETE Papa = archivage ; asymétrie passé/futur de la bande ;
  **aucune mission ni carte SRS dans les surfaces datées** ; **aucune sortie d'`evidence`
  modifiée par un item coché** ; aucun `traces` sur une date future.
- **Ordre dans la file** : après les chantiers à prérequis durs déjà séquencés (invariants de
  lecture des dérivés → Couverture Slice A → production par scope, ADR-0023 §Suivi) et la
  Galaxy Slice B. Mono-chantier : une branche `feat/agenda`.
- **Revue de la phase 0, à date fixée (4 semaines après la mise en service)** : Massimo
  ouvre-t-il la page ? coche-t-il ? Si oui → bascule en phase 1. Si non, le problème n'est pas
  la saisie (elle n'existe pas encore) : c'est la page elle-même, et c'est elle qu'il faut
  retravailler avant d'ouvrir quoi que ce soit.
- **Observation après la bascule** : la saisie tient-elle ? Si Massimo cesse d'alimenter
  l'agenda, le Lot 2 ne doit pas être lancé — c'est la saisie qu'il faut retravailler, pas le
  plan qu'il faut ajouter.

## Points ouverts (à trancher avant les slices concernées)

1. **Bottom bar mobile** : Agenda y entre-t-il, et à la place de quoi ? `/missions` porte
   désormais le deck « Défi champion » (ADR-0022 §7). Arbitrage produit, lié à la
   réconciliation de `navigation.md`. → Slice B.
2. **Thème de la page Papa** : la maquette est en clair (convention
   `maquette-papa-quiz-pilotage.html`) ; ADR-0024 §Suivi évoque un « style sombre `papa-*` ».
   Laquelle fait foi ? → Slice C.
3. ~~**Définition de `traces`**~~ — **tranché en slice A (2026-07-29)** : nombre de **natures
   d'activité distinctes** du jour (types d'événement), plafonné à `AGENDA_TRACES_CAP = 3`, la
   navigation (`login`, `page_viewed`) exclue. Le temps actif reconstruit est écarté : il
   réintroduirait exactement la mesure d'effort que la doctrine évite. Conséquence assumée :
   une rafale de révision vaut **1**, pas 12 — le comptage mesure la variété d'une journée, pas
   son volume.
4. **Écran « Préparer » : page ou modale ?** Proposé en sous-route `/agenda/:id/preparer`, pour
   que le retour physique mobile fonctionne (patron `/revision/session`). → Lot 2.

## Décisions validées (commanditaire, 2026-07-29)

1. **Bande glissante** plutôt que semaine calendaire (§6) — retenu.
2. **Massimo et Papa remplissent tous les deux** ; seul Massimo coche (§2) — retenu.
3. **Une surface, deux flux** côté Massimo (§5) — retenu.
4. **Déploiement en deux phases** (§10) : Papa écrit d'abord, Massimo lit et **coche** ; le
   composer élève s'ouvre plus tard, sur décision de Papa — retenu.
