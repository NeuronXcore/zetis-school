---
id: "0025"
titre: "Agenda scolaire : première source exogène, co-éditée, non probante"
type: surface
statut: accepte
date: 2026-07-29
pr: 110
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0009", "0011", "0013", "0017", "0018", "0022", "0023", "0024", "0030", "0035", "0041"]
---
# ADR-0025 — Agenda scolaire : première source exogène, co-éditée, non probante

## Statut

Accepté — 2026-07-29 (proposé et accepté le même jour : le commanditaire a validé les quatre
décisions structurantes puis fait exécuter le Lot 1 dans la foulée, vérifié à l'écran).

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

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-01 | Témoin de nouveauté ≠ compteur d'arriéré | Accepté | oui |
> | 2 | 2026-08-10 | L'intitulé se choisit dans le référentiel | Accepté | — |
> | 3 | 2026-08-10 | « Leçon à apprendre », le quatrième type | Accepté | — |
> | 4 | 2026-08-10 | L'échéance mène à son cours | Accepté | oui |
> | 5 | 2026-08-10 | Papa n'existe pas dans l'espace de Massimo | Accepté | — |
> | 6 | 2026-08-10 | La bande ouvre un jour, et le passé cesse d'être hors d'atteinte | Accepté | oui |
> | 7 | 2026-08-15 | le regard vit à `/agenda`, et nulle part ailleurs | Accepté | oui |
> | 8 | 2026-08-17 | Le passé se raconte, et la matière prend la couleur | Proposé | oui |
> | 9 | 2026-08-17 | Trois questions, trois sections | Proposé | oui |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*
>
> ⚠️ *Les lignes **8 et 9 ont d'abord été écrites à la main**, et il faut savoir pourquoi : entre la
> fusion des addendums (2026-08-16) et la création de ce script (2026-08-17), **aucun outil ne
> pouvait produire ce tableau** — `fusion_addendums.py` itérait sur des fichiers d'addendum qui
> n'existaient plus. La mention « ne pas éditer à la main » a donc désigné un outil absent pendant
> une journée entière, et rien n'aurait signalé une ligne oubliée. Le script les régénère désormais
> depuis les sections, qui sont la source de vérité.*

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
aujourd'hui, aujourd'hui, puis les jours à venir. Une bande calendaire passerait de 6 jours
d'horizon le lundi à 0 le dimanche — l'écran deviendrait un pur rétroviseur au pire moment.

> **Amplitude révisée le 2026-07-29** (commanditaire, après lecture de la page avec de vraies
> données) : **3 jours en arrière, 10 en avant — 14 colonnes**, au lieu de 3/3.
> **Tout l'élargissement va vers l'avant.** Le regard en arrière reste borné à 3 jours : un
> passé qu'on parcourt rend les trous visibles, motif qui a fait écarter la vue mois
> (§Alternatives) et qui met « le scroll arrière au-delà » hors périmètre. L'amplitude est un
> réglage (`AGENDA_BAND_DAYS_BEFORE` / `_AFTER`) ; ni le client ni les tests ne la figent.
> Sur téléphone, la grille se replie en deux rangées de 7 — 14 colonnes à 380 px seraient
> illisibles au doigt.

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
   *Précision d'implémentation (slice C, 2026-07-29)* : pour que la règle 2 soit tenable —
   un interrupteur sur la page de Papa, pas une édition de `.env` + redémarrage — le verrou
   est **persisté en base** (table `app_settings`, routes `GET`/`PUT /api/agenda/settings`).
   La variable d'environnement reste la valeur par défaut tant qu'aucune ligne n'existe.
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

---

## Amendement 1 — Témoin de nouveauté ≠ compteur d'arriéré — 2026-08-01

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-01**. Ne rouvre aucune des décisions §1–§11.
> **Révoque une interdiction explicite** portée par `docs/frontend-massimo/page-agenda.md`
> (« Aucune pastille de compteur sur l'entrée, sous aucune forme ») — voir §12.4.
> Prérequis du chantier **ADR-0030 — Témoins de nouveauté en navigation**, dont l'agenda est
> le cas limite et le seul à exiger un addendum.

### Contexte

L'ADR-0025 §3 refuse d'émettre `agenda_item_missed` : *l'absence n'est pas un événement*.
`page-agenda.md` en a tiré, côté navigation Massimo, une interdiction plus large — **aucune
pastille, sous aucune forme** — au motif qu'un compte d'items non faits contournerait
l'invariant serveur par l'affichage.

Le motif est juste. La portée est trop large.

Le chantier ADR-0030 dote les entrées de sidebar d'un **témoin de nouveauté** : un compteur de
ce qui est arrivé depuis la dernière visite, qui décroît parce que Massimo **regarde**. Sur
Agenda, ce témoin dit « papa a rempli ton cahier de texte » — exactement la sémantique d'une
fiche qui arrive. L'interdiction écrite l'attrape pourtant au passage, alors qu'elle visait un
autre objet.

Sans cet addendum, le chantier ADR-0030 devrait soit exclure l'agenda de sa règle unique — et
fabriquer un cas particulier dans la seule entrée dont le contenu vient de l'extérieur — soit
contredire silencieusement une phrase écrite en toutes lettres dans la spec de page. Les deux
sont pires que de trancher ici.

### Décision

#### 12.1 — Le test qui sépare les deux objets

> **Une date qui passe sans que Massimo agisse change-t-elle le compteur ?**
> Arriéré : **oui**. Nouveauté : **non**.

Un témoin de nouveauté naît d'un **geste de Papa** (l'item est créé) et meurt d'un **regard de
Massimo** (la surface est ouverte). Il ne connaît ni `due_on`, ni `done_at` : le temps qui passe
ne le fait pas bouger, et le travail accompli non plus.

Un compteur d'arriéré naît d'une **date franchie** et ne meurt que par le **travail**. C'est la
forme affichée de `agenda_item_missed`, et §3 le rend impossible à produire côté serveur comme
côté client — cet addendum le réaffirme sans réserve (§12.5).

#### 12.2 — Le badge est **chiffré**, comme partout ailleurs

Une pastille muette a été envisagée puis écartée : elle dit *il y a du nouveau* sans dire
combien, ce qui est une alarme vague — plus anxiogène qu'un nombre, pas moins, dans la seule
entrée qui parle de charge scolaire réelle.

Surtout, la retenir aurait contredit le §1 de cet ADR. Celui-ci a déjà tranché que la charge
scolaire **subie** peut être montrée datée à Massimo, parce que la masquer ne supprime pas la
pression mais son moyen de s'organiser. Refuser le chiffre là où l'ADR autorise la date aurait
été incohérent.

Forme retenue : **identique aux autres entrées** (ADR-0030) — plafonné `9+`, absent à zéro,
aucune pulsation, aucun rouge, jamais l'or (réservé à ZETIS qui parle) ni l'ambre (couleur des
files de validation Papa). Zéro cas particulier.

#### 12.3 — La donnée : un high-water mark par élève, **jamais un `seen_at` par item**

C'est le point structurant de cet addendum, et le seul qui touche le modèle.

Un badge exige de savoir ce qui a déjà été vu. La pente naturelle est une colonne `seen_at` sur
`agenda_items`. **Elle est interdite** : jointe à `done_at`, elle fabrique la donnée « vu le 12,
jamais fait », lisible côté Papa par l'asymétrie de visibilité (§2c). C'est la surveillance qui
rentre par la porte de service que §2a et §2b passent leur temps à condamner — et un objet
strictement pire que le compteur qu'on cherchait à éviter, parce que persisté.

Retenu : **un seul horodatage par élève**, `agenda_last_seen_at`.

```txt
badge = count(agenda_items
              where created_at > agenda_last_seen_at
                and dismissed_at is null
                and not hidden_by_student)
```

- Écrit à `now()` à **l'ouverture de `/agenda`** et **au rendu du bandeau d'Accueil** — les deux
  surfaces où Massimo lit ce qui est arrivé. N'en retenir qu'une ferait mentir le badge sur ce
  qu'il a déjà lu.
- **Jamais servi à Papa** : absent de `AgendaItemPilotOut` et de toute sortie de `/api/agenda`.
  Symétrique exact de `parent_note`, jamais servie à Massimo (§2b).
- Aucune colonne sur `agenda_items`, aucune donnée d'attention par item, rien de joignable à
  `done_at`. La granularité *est* la protection.

Emplacement : à trancher au read-before-code entre une colonne sur le profil élève et une ligne
`app_settings` scopée — le patron de `AGENDA_STUDENT_ENTRY_ENABLED` existe déjà. Le choix est
d'implémentation, pas de doctrine ; l'invariant est **un enregistrement par élève, pas par item**.

#### 12.4 — Ce que cette décision révoque, et ce qu'elle ne révoque pas

**Révoqué** : la phrase de `page-agenda.md` — « Aucune pastille de compteur sur l'entrée, sous
aucune forme : un compte d'items non faits contournerait par l'affichage l'invariant *non
probant* tenu serveur ». Elle est réécrite pour autoriser le témoin de nouveauté et **réaffirmer
dans le même paragraphe** l'interdiction du compteur d'items non faits. Les deux se ressemblent
assez pour devoir être lus côte à côte : les séparer garantit qu'une prochaine session tranchera
au hasard.

**Non révoqué, et rappelé** : §3 (`agenda_item_missed` n'existe pas), §7 (« aucun compteur
d'arriéré » parmi les interdits transverses des surfaces Massimo), §9 (aucun compteur d'items
non faits en KPI côté Papa).

#### 12.5 — Ce que le badge ne fera jamais, et pourquoi il ne suffit pas

Le témoin compte ce qui est **arrivé**, pas ce qui **reste à faire**. Papa saisit le dimanche
soir ; lundi matin le badge affiche `4` ; Massimo ouvre, il tombe à `0` — **et il reste à `0`
toute la semaine**, pendant que les quatre échéances existent toujours.

Ce n'est pas un défaut à corriger : c'est la définition. Un témoin de nouveauté est
structurellement incapable d'être un plan de travail, et vouloir le rendre capable revient
exactement à en faire un compteur d'arriéré.

La question « qu'est-ce que j'ai à étudier ? » est déjà servie par deux surfaces, et le reste :

- le **bandeau d'Accueil** (Aujourd'hui / Demain, 3 items, aucune date) — l'information sans le
  déplacement ;
- la **bande glissante de `/agenda`** (§6, 3 jours avant / 10 après) — chaque item avec son état.

Si elles n'y suffisent pas, le défaut est dans leur composition et relève d'un chantier agenda.
**Aucune évolution de la navigation ne doit y répondre.**

### Conséquences

**Positives** — l'ADR-0030 garde une règle unique et zéro exception ; la distinction *nouveauté /
arriéré* est écrite une fois, avec son test opérationnel, et devient opposable aux prochains
chantiers ; l'agenda cesse d'être la seule surface dont les arrivées sont invisibles hors
navigation ; l'interdiction réelle (le compteur d'arriéré) en sort **renforcée**, parce que
formulée par contraste plutôt que par excès de portée.

**Négatives / coûts** — un horodatage de plus à persister et deux points d'écriture à ne pas
oublier ; un badge qui retombe à zéro sans que rien ne soit fait, accepté et documenté en §12.5 ;
une décision révoquée sur un ADR de trois jours — écrit ici pour être lisible plus tard, pas pour
être répété ; et une tentation permanente, qu'aucun test ne peut clore définitivement, de « rendre
le badge utile » en le branchant sur les échéances non cochées.

### Suivi

- **Test-verrou** : le badge d'un élève ne change pas quand une échéance franchit sa date, ni
  quand un item est coché. Seules la création d'un item et l'ouverture d'une surface le font
  bouger. C'est le test qui protège cet addendum de sa propre pente.
- **Test-verrou** : `agenda_last_seen_at` n'apparaît dans **aucune** réponse de `/api/agenda`
  (miroir du test de non-fuite de `parent_note`).
- Réécriture du paragraphe « Accès — deux portes dès le Lot 1 » de `page-agenda.md` (§12.4).
- Ligne à ajouter dans `DECISIONS.md` sous ADR-0025 (« + addendum §12 — témoin de nouveauté »).
- Implémentation **dans le lot ADR-0030**, pas isolément : l'endpoint agrégé et l'invalidation
  par événement y sont déjà.
- Commit suggéré : `feat(agenda): student-scoped last_seen watermark for navigation news badge`.

### Décisions validées (commanditaire, 2026-08-01)

1. **Badge chiffré sur l'entrée Agenda**, forme identique aux autres entrées — retenu ; la
   pastille muette d'abord proposée est écartée comme incohérente avec §1.
2. **`agenda_last_seen_at` par élève, jamais de `seen_at` par item** — retenu ; c'est la
   granularité qui empêche la donnée « vu et non fait » d'exister.
3. **Le compteur d'items non faits reste interdit**, côté Massimo comme côté Papa — réaffirmé
   dans le même paragraphe que l'autorisation, jamais ailleurs.

---

## Amendement 2 — L'intitulé se choisit dans le référentiel — 2026-08-10

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**. Ne rouvre aucune des décisions §1–§12.
> **Ne révoque rien** : §8 (« le texte brut est conservé ») reste entier — cet addendum change la
> façon de **produire** `label`, pas ce que `label` est.
> Achève, sur la dernière colonne de la grille, ce que l'addendum ADR-0035 §3 a fait pour le
> chapitre : même page, même nature de geste.

### Contexte

La grille de saisie Papa a quatre colonnes utiles. Trois sont des menus alimentés par le
référentiel — **matière**, **chapitre** (§11), **type**. La quatrième, **intitulé**, est restée un
champ texte vide avec un placeholder.

Or ce que Papa y tape existe déjà en base, à trois clics de là : la page **Matières** affiche
matière → chapitre → **titre du cours** (`lessons.title`), et n'y montre que les leçons
**validées**. Papa retape donc, à la main, une chaîne que ZETIS connaît déjà.

Un intitulé retapé est un intitulé qui dérive. Deux orthographes pour le même cours, et une
échéance dont le libellé ne correspond à rien de nommé dans le programme — au moment précis où le
chapitre, lui, vient d'être sélectionné dans le menu d'à côté.

C'est la direction que cet ADR énonce déjà pour la phase 0 (§8 : *« Papa sélectionne matière, date
et chapitre dans des menus »*) et le raisonnement par lequel l'ADR-0018 §1 a **écarté le texte
libre au profit de la sélection dans le référentiel**. L'intitulé était la dernière colonne à ne
pas l'avoir suivi.

### Décision

#### 13.1 — Un menu, et une porte de sortie qui reste ouverte

L'intitulé devient un `<select>`, comme les trois autres colonnes : les **titres des cours du
chapitre sélectionné**, plus une dernière option **« ✏️ Autre (texte libre) »** qui rend un champ
texte.

La porte de sortie n'est pas un compromis, c'est le cas majoritaire d'un `kind = devoir` : un
devoir s'énonce par des consignes et des références de manuel, presque jamais par le titre d'un
cours du référentiel — le menu ne peut donc pas le proposer. La contrainte serveur reste
`String(300)` libre, et **aucune valeur n'est imposée**.

**Sans chapitre, pas de menu** — le champ texte est rendu directement. Même jurisprudence que le
sélecteur de chapitre, qui n'affiche jamais un menu vide : un menu qu'on ouvre pour n'y rien
trouver se lit comme une panne.

#### 13.2 — Les cours **validés** seulement

La liste reflète exactement ce que la page Matières montre : `status === "validated"`.

Le motif n'est pas la cohérence d'affichage, c'est la frontière ADR-0009 §9. **`label` est lu par
Massimo** — c'est même la seule chaîne de l'agenda qu'il lit. Un titre rédigé par le modèle et non
relu l'atteindrait par cette porte, sans jamais être passé par la validation Papa que tout le
reste du référentiel exige.

**Conséquence assumée, et elle est visible** : sur un chapitre dont les leçons sont encore en
brouillon, la liste est vide et l'intitulé reste libre. Papa n'est jamais bloqué ; il l'est
d'autant moins que la saisie en lot est, en phase 0, la seule source d'items (§10).

#### 13.3 — Rien ne se persiste de plus : aucun `lesson_id`

La pente naturelle est d'enregistrer *quelle leçon* a été choisie. **Écartée.**

Le `chapter_id` de §11 ouvre déjà **les deux** portes — la production automatique (ADR-0035) et le
Commander de missions — et toutes deux sont scopées par chapitre, jamais par leçon
(`resolve_chapter_notions`). Une colonne `lesson_id` n'alimenterait aujourd'hui aucun moteur : elle
coûterait une migration pour une donnée que personne ne lit, sur une table que §11 a déjà fait
migrer une fois.

Ce qui part au serveur est donc **le titre, tel quel**, dans `label`. Le serveur ne le réécrit pas
(§8, et le commentaire de `models/agenda.py` : *« Texte BRUT, tel que saisi »*) ; le client non
plus. Aucune migration, aucun changement de contrat d'API, aucun type partagé nouveau.

#### 13.4 — Le geste de Papa n'est jamais écrasé

Un item existant porte un `label` qui, presque toujours, ne figure dans aucune liste. Il s'affiche
en texte libre, **inchangé**, et rien ne bouge tant que Papa ne demande pas la liste.

Même règle à la saisie : si Papa a tapé son énoncé **avant** de choisir le chapitre, choisir le
chapitre ne bascule pas le champ en menu et n'efface pas ce qu'il a écrit. C'est la seule
transition qui pourrait faire perdre une saisie ; elle est interdite et testée pour ça.

Le passage inverse — revenir à la liste après avoir écrit du texte — **vide le champ**, et son
libellé le dit (« choisir un cours »). L'alternative, garder le texte pendant que le menu affiche
son placeholder, met l'écran en désaccord avec ce qui sera enregistré.

#### 13.5 — Aux deux surfaces d'édition

La grille de saisie **et** le panneau de détail. Le second a reçu son sélecteur de chapitre à
l'addendum ADR-0035 §3, pour la raison exacte qui vaut ici : un item mal saisi — ou saisi par
Massimo, qui n'a aucun sélecteur — restait stérile alors que l'API acceptait déjà la correction.
N'équiper que la grille rejouerait cette asymétrie sur la colonne d'à côté.

### Conséquences

**Positives** — la colonne la plus saisie de la page cesse d'être la seule à ignorer le
référentiel ; l'échéance et le chapitre parlent enfin de la même chose sous le même nom ; le
libellé lu par Massimo est un libellé qu'un humain a validé ; zéro backend, zéro migration, un
endpoint et une fonction client déjà écrits (`GET /api/chapters/{id}/lessons`, `fetchLessons`).

**Négatives / coûts** — un chapitre sans leçon validée offre une liste vide, et rien à l'écran
n'explique *pourquoi* (le renvoi vers Programme existe sur la page Matières, pas ici) ; un
sélecteur de plus à charger, donc un appel réseau par chapitre déplié ; et une pente à surveiller,
celle de vouloir rendre l'intitulé **obligatoirement** issu du menu — ce que §13.1 interdit et que
la réalité d'un devoir contredit.

### Suivi

- **Test-verrou** : le titre d'une leçon `draft` n'apparaît **jamais** dans la liste (§13.2).
- **Test-verrou** : texte libre saisi d'abord, chapitre choisi ensuite → le texte survit (§13.4).
  C'est le test qui protège cet addendum de sa seule transition destructrice.
- **Test-verrou** : `label` part au serveur **identique** au titre choisi, au `trim()` près (§13.3).
- Mise à jour de `docs/frontend-papa/page-agenda.md` (§ Saisie en lot, § Panneau de détail).
- Ligne à ajouter dans `DECISIONS.md` sous ADR-0025 (« + addendum §13 — intitulé depuis le
  référentiel »).
- À revoir si la saisie élève s'ouvre (§10) : Massimo n'a aucun sélecteur, et §8 rôles 2–3
  (structuration du texte libre par le modèle) redeviendrait la question.
- Commit suggéré : `feat(agenda): pick the label from the chapter's validated lessons`.

### Décisions validées (commanditaire, 2026-08-10)

1. **Un `<select>` avec option « ✏️ Autre (texte libre) »** — retenu, contre un champ texte à
   suggestions et contre une liste qui pré-remplirait un second champ.
2. **Les deux surfaces** — grille de saisie en lot **et** panneau de détail.
3. **Les cours validés seulement**, comme la page Matières — la liste vide sur un chapitre en
   brouillon est acceptée comme conséquence, pas corrigée par un assouplissement.

---

## Amendement 3 — « Leçon à apprendre », le quatrième type — 2026-08-10

> Fusionné depuis **Amendement 3** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**. Ne rouvre aucune des décisions §1–§13.
> **Ne révoque rien.** Élargit `AGENDA_KINDS` d'une valeur et rend visible une action déjà livrée.
> **Aucune migration** — la colonne est un `String(15)` sans Enum SQL, et le modèle dit pourquoi
> (`agenda.py:19-20` : « une valeur nouvelle ne doit pas coûter une migration »).

### Contexte

Le vocabulaire des types est celui du collège : `devoir` (défaut), `controle`, `rendu`. À la
relecture, le commanditaire a buté dessus — *« devoir = cours à apprendre ? »*. Non : un devoir,
ce sont des exercices qu'on **fait**. Rien ne dit **« apprendre la leçon »**.

C'est un manque qui coûte, parce que c'est précisément le travail que ZETIS sait accompagner. Des
exercices se font sans lui ; une leçon s'apprend avec ce qu'il produit — fiche, quiz, cartes. Le
type le plus utile au dispositif était le seul absent du menu.

**Second constat, découvert en cherchant à répondre à la question suivante** — *« comment demander
à Massimo de réviser depuis l'agenda ? »* : on peut **déjà** commander du travail depuis une
échéance, et personne ne le voit. Le bouton « 🎯 Commander les missions de ce chapitre » est livré
depuis le 2026-08-03 (addendum ADR-0035 §3) ; il crée jusqu'à trois missions sur les notions
fragiles du chapitre, que Massimo reçoit en parcours *Découvrir → Verbaliser → Reconstruire →
Mini-quiz*. Mais il faut **ouvrir le panneau de détail** *et* que l'échéance porte **déjà** un
chapitre. Rien ailleurs sur la page n'en signale l'existence.

Une capacité livrée que personne ne trouve est, du point de vue de l'usage, une capacité absente.

### Décision

#### 14.1 — La valeur : `lecon`

Sans accent, comme `controle`. `AGENDA_KINDS` gagne une quatrième entrée ; `_KIND_PATTERN` en
dérive, donc les quatre schémas d'écriture suivent sans être touchés.

Libellé Papa : **« Leçon à apprendre »** — la formulation longue est volontaire, c'est elle qui
lève l'ambiguïté que le mot « devoir » créait.

#### 14.2 — Il déclenche la production, et **avant le devoir**

`TRIGGERING_KINDS` passe à `("controle", "lecon", "devoir")`.

Le tri sous plafond devient `{controle: 0, lecon: 1, devoir: 2}`. Le motif est le même que celui
qui a placé le contrôle en tête (addendum ADR-0035 §1) : **trier, c'est décider qui passe en
dernier**, et ce n'est pas ce qui bénéficie le plus de la production. Une leçon à apprendre est,
par définition, du travail de mémorisation — exactement ce que produisent la fiche et les cartes.
Un devoir est une liste d'exercices que le contenu généré ne remplace pas.

Le contrôle garde la tête : c'est lui qui est mesuré.

> ⚠️ **Les deux constantes se modifient ensemble.** `_KIND_PRIORITY.get(i.kind, 9)` : ajouter
> `lecon` à `TRIGGERING_KINDS` en oubliant la table de priorité le ferait tomber en **9**, donc
> passer systématiquement dernier — **sans qu'aucun test ne rougisse**, puisque le lot partirait
> quand même. Un test-verrou fixe l'ordre des trois.

#### 14.3 — Il n'entre **pas** dans « ce qui arrive »

`UPCOMING_KINDS` reste `("controle", "rendu")`.

Trois raisons, dans l'ordre de force :

1. **`UpcomingItemOut` ne porte aucun champ `kind`** (`schemas.py:66-80`). Massimo ne pourrait pas
   distinguer « contrôle jeudi » de « leçon à apprendre pour demain » : deux objets de gravité
   différente sous une forme identique.
2. **La section est plafonnée à 4.** Une leçon à apprendre revient plusieurs fois par semaine ;
   elle chasserait les contrôles de la seule surface qui sert à les anticiper.
3. C'est le motif exact qui a exclu `devoir` (`service.py:38-39` : *« déjà dans la bande »*), et il
   s'applique mot pour mot.

**Réversible** : une constante et son test. Si l'usage montre que les leçons méritent d'être
anticipées, la décision se rouvre — après avoir donné un `kind` à `UpcomingItemOut`, pas avant.

#### 14.4 — Ce que Massimo en voit : une marque, jamais le fuchsia

Aujourd'hui, **seul `controle` porte une marque** chez Massimo (badge `◆ contrôle` + anneau
fuchsia) ; `rendu` est visuellement indistinguable d'un `devoir`.

`lecon` reçoit une marque **calme**, dans une teinte qui n'est ni le fuchsia (réservé au contrôle)
ni le rouge (interdit transverse, §7). Le but est qu'il se **repère**, pas qu'il alarme : une
leçon à apprendre est du travail ordinaire, pas une échéance qui menace.

#### 14.5 — Le Commander cesse d'être enterré

L'action remonte au niveau de l'**item** — vue semaine et liste plate — sur une échéance portant un
chapitre. Aucun moteur nouveau : `openFor` existe, la traduction `subject_id → sysId` aussi.

Et le panneau **nomme ce que ZETIS peut faire de cette échéance**. Il disait déjà ce qu'il ne
pourra pas faire faute de chapitre (addendum ADR-0035 §3) ; il dit maintenant aussi ce qui est
possible. Un dispositif qui se tait sur ses capacités est indistinguable d'un dispositif qui n'en a
pas — c'est le raisonnement de `SKIP_*` dans `triggers.py`, appliqué à l'écran.

> ⚠️ **Ce bloc reste indépendant du `kind`.** Recopier `TRIGGERING_KINDS` côté front en ferait une
> seconde source de vérité, qui a divergé le jour même où `devoir` y est entré. Elle divergerait à
> nouveau aujourd'hui.

#### 14.6 — Ce que cet addendum refuse de promettre : « réviser »

> ✅ **LEVÉ le 2026-08-10 par l'`adr-0049`** — le jour même, PR
> [#109](https://github.com/NeuronXcore/zetis-school/pull/109), squash `117b632`. Le couplage 2
> existe : le deck `{chapter}` sert des cartes non dues sans écrire aucun état SRS, et une porte
> « 🃏 Réviser ce chapitre » vit sur l'échéance — **elle n'apparaît que si le chapitre résout des
> cartes**, jamais grisée.
>
> **Ce paragraphe est conservé au dossier, pas effacé** : son raisonnement reste juste, et c'est
> lui qui a ordonné le chantier suivant. Mais ses trois constats et son interdiction sont
> **périmés** — les lire aujourd'hui comme l'état du dépôt enverrait une session re-cadrer un
> chantier fait.
>
> ⚠️ **Un seul des trois constats survit** : `step_type = lesson` est **toujours déclaré et mort**.
> 🔴 **Et ce n'est plus une dette subie** — l'`adr-0050` (Décision 6, mergée le 2026-08-10) le
> **motive** : le plan n'est pas une mission, `MissionStep` est hors sujet, et ressusciter
> `STEP_LESSON` ferait une **troisième** surface pour « lire un cours ». Le §14.6 le nommait comme
> un manque à combler ; c'était le symptôme de tout autre chose.

La question qui a ouvert ce chantier était *« comment demander à Massimo de réviser ? »*. La
réponse honnête est : **on ne peut pas encore**, et cet addendum ne fait pas semblant.

- Aucune mission ne peut porter une session de cartes : les `step_type` sont
  `eli5 · vocal_explain · quiz · mindmap · lesson`, et **`lesson` est déclaré mais mort** (absent de
  `_build_steps` et de `_STEP_PALETTE`).
- Le deck de révision n'accepte que `mix_day | mix_flash | {subject}` — **pas de chapitre**.
- Le non-scheduling (`is_consolidation`) est **borné au même jour civil, même carte**.

C'est le **couplage 2 du §11, livré à 0 %**. Tant qu'il n'existe pas, **aucune affordance de
l'agenda ne doit suggérer une session de révision** : un bouton mort se lit comme une panne, et une
promesse non tenue coûte plus cher que l'absence.

Corollaire d'ordonnancement : le **plan de préparation** (§8 rôle 1, dont `plan_steps` est
l'emplacement câblé et vide) vient **après** le couplage 2, jamais avant — ses étapes sont « lire la
fiche · mini-quiz · **réviser les cartes du chapitre** ». Le construire d'abord serait le poser sur
le trou.

> ✅ **Le corollaire a joué, et il a tenu jusqu'au bout.** Le couplage 2 a été livré
> (`adr-0049`, 2026-08-10), puis le plan de préparation dans la foulée (`adr-0050`, PR #110, squash
> `fa45576`, **mergé le même jour**). `plan_steps` n'est plus « l'emplacement câblé et vide » : il
> est rempli, et lu par les deux interfaces.
>
> ⚠️ **Ce paragraphe décrit donc un ordonnancement PASSÉ, pas une contrainte à venir.** Le lire
> comme une consigne enverrait une session attendre un chantier déjà fait.
> C'est le seul endroit du dépôt où un ordre de chantiers a été décidé d'avance, écrit, puis
> respecté — et où l'attendre a évité de poser un plan sur un trou.

#### 14.7 — Papa lit « coché », jamais « fait »

Trouvé à la relecture, par le commanditaire : *« coché par Massimo ne veut pas dire effectué »*.

L'étiquette d'état des cartes et de la liste disait **« ✓ fait »**. C'est une affirmation de
complétion que rien ne permet d'établir — et le §3 de cet ADR l'écrit noir sur blanc : *« cocher ne
prouve rien, ne pas cocher ne prouve rien »*. Le seul fait connu du serveur est qu'un `done_at` a
été posé par une route élève.

**Le reste de la page l'écrivait déjà correctement** — KPI « cochés par Massimo », panneau de
détail « Coché par Massimo » / « Pas encore coché ». Une seule étiquette contredisait les deux
autres surfaces, et c'était celle qu'on lit le plus souvent.

C'est le motif exact que l'addendum ADR-0041 a corrigé sur le Journal : **un mot qui veut dire une
chose pour la machine et une autre pour le lecteur**. « Fait » veut dire *« la case est cochée »* ;
Papa lit *« le devoir est fait »*.

**L'asymétrie avec l'interface de Massimo est VOULUE et conservée** : son bouton reste « marquer
comme fait ». Il **déclare**, et cette déclaration est à lui — c'est le seul geste qui rend l'objet
sien (§2b). Papa, lui, **lit une déclaration dont il n'est pas l'auteur** : il doit voir le geste,
pas la conclusion. Renommer la coche de Massimo la rendrait bureaucratique sans rien gagner.

**« à faire » ne change pas** : ce n'est pas une affirmation sur Massimo, c'est ce que le collège
demande — un fait, et un état neutre, jamais un manquement.

### Conséquences

**Positives** — le menu dit enfin le travail le plus fréquent et le plus accompagnable ; la
production se déclenche sur lui, en bonne place ; une capacité livrée depuis une semaine cesse
d'être invisible ; et l'ordre des trois chantiers restants est écrit, avec sa raison.

**Négatives / coûts** — un quatrième choix dans un menu qui en avait trois, sur la colonne la plus
saisie ; une marque de plus sur l'écran de Massimo, dans un registre qui doit rester calme ;
`lecon` est le premier `kind` qui **déclenche sans être annoncé** dans « ce qui arrive » — position
défendable mais nouvelle ; et surtout : **rendre le Commander visible augmente la probabilité du
double clic**, or il **n'est pas idempotent** (commander deux fois la même échéance crée des
doublons, `Mission` n'ayant aucune référence à l'agenda). Toléré tant que c'est un geste manuel,
**obligatoire à corriger avant tout déclenchement automatique** — la dette était déjà écrite à
l'addendum ADR-0035, elle devient plus probable ici.

### Suivi

- **Test-verrou** : contrôle J+6, leçon J+2, devoir J+1 → l'ordre servi est `controle, lecon,
  devoir`. C'est le test qui attrape l'oubli de `_KIND_PRIORITY`.
- **Test-verrou** : `lecon` n'apparaît pas dans `/upcoming` (miroir du test existant sur `devoir`).
- **Test-verrou** : le fuchsia reste réservé au contrôle sur les surfaces Massimo.
- **Test-verrou** : un item coché se lit « ✓ coché » côté Papa, et le mot « fait » n'apparaît dans
  aucun état d'item (§14.7). ⚠️ « à faire » ne contient pas « fait » — l'assertion ne se déclenche
  que sur une vraie affirmation de complétion.
- Mise à jour de `docs/frontend-papa/page-agenda.md` et `docs/frontend-massimo/page-agenda.md`.
- Ligne dans `DECISIONS.md` sous ADR-0025 (« + addendum §14 — leçon à apprendre »).
- **Observation attendue** : si `lecon` devient le type majoritaire, la décision §14.3 (absent de
  « ce qui arrive ») est à rouvrir — mais en donnant d'abord un `kind` à `UpcomingItemOut`.
- Commit suggéré : `feat(agenda): a fourth kind for lessons to learn, and a visible Commander`.

### Décisions validées (commanditaire, 2026-08-10)

1. **Ajouter le 4ᵉ type**, plutôt que d'expliciter les trois existants — retenu.
2. **Rendre visible le Commander avant de construire le plan de préparation** — retenu sur
   recommandation, au motif que le plan dépend d'un couplage livré à 0 %.
3. **Ne rien promettre sur la révision** tant que le deck chapitre n'existe pas.
4. **« coché », jamais « fait »** côté Papa — relevé à la relecture (« coché par Massimo ne veut pas
   dire effectué »). La coche de Massimo, elle, garde son libellé.

---

## Amendement 4 — L'échéance mène à son cours — 2026-08-10

> Fusionné depuis **Amendement 4** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**.
> 🔴 **RÉVOQUE le §13.3** (« aucun `lesson_id` persisté »), écrit le matin même. Le motif de
> l'époque était exact ; ce document est le consommateur qui lui manquait.
> **Une migration** — `a1b2c3d4e5f8`, une colonne nullable, aucun backfill.

### Contexte

Depuis le §13, Papa choisit l'intitulé d'une échéance **dans la liste des cours du chapitre**.
L'agenda de Massimo affiche donc, mot pour mot, le titre d'une leçon qui existe en base — et ne
lui donne aucun moyen de l'ouvrir. Il doit retrouver son cours à la main dans sa matière.

C'est le reproche que `pilotageLinks.ts` fait déjà, côté Papa, à une cellule sans lien : *« une
cellule qui affiche un état sans y donner accès oblige Papa à retrouver l'objet à la main sur une
autre page »*. L'agenda est la surface où ce reproche coûte le plus cher, parce que c'est **la
seule que Massimo ouvre en sachant ce qu'il a à faire**.

### Ce qui est révoqué, et pourquoi c'est légitime

Le §13.3 écartait la colonne `lesson_id` en ces termes : *« elle n'alimenterait aujourd'hui aucun
moteur : elle coûterait une migration pour une donnée que personne ne lit »*.

**L'argument était juste, et il ne l'est plus.** Il portait sur les moteurs — production,
Commander — qui restent scopés par `chapter_id` et le demeurent. Il ne prévoyait pas un
consommateur d'un autre genre : **un lien**. Une donnée que personne ne lit ne vaut pas une
migration ; une donnée qui ouvre la bonne page à un enfant, si.

La forme de la révocation est celle que le dépôt pratique : le motif d'origine reste écrit, on
dit ce qui a changé, on ne fait pas comme s'il n'avait jamais existé.

### Décision

#### 15.1 — Une colonne, et elle POINTE, elle ne scope rien

`agenda_items.lesson_id`, FK nullable vers `lessons`. **Aucun backfill** : les échéances
antérieures n'ont pas de leçon et n'en auront pas — la rétro-attribution supposerait de deviner,
et `provenance.py` §F.4 refuse ce geste ailleurs pour la même raison.

⚠️ **Ce n'est pas un scope de production.** Le déclencheur automatique (ADR-0035) et le Commander
continuent de raisonner par **chapitre** (`resolve_chapter_notions`). Un `lesson_id` qui se
mettrait à scoper un lot ferait produire une leçon isolée là où le dispositif entier raisonne par
chapitre — cette colonne sert à **désigner une adresse**, rien d'autre.

#### 15.2 — Trois précisions, dans cet ordre

`agendaCourseRoute` rend, par ordre de précision décroissante :

1. `lesson_id` → `/subjects/{slug}/cours?lesson={id}` — chapitre déplié, leçon **encadrée de
   lumière**, et **amenée sous les yeux** (`scrollIntoView`, `block: center`) ;
2. sinon `chapter_id` → `?chapter={id}&title={libellé}` — le chapitre déplié, **et la leçon
   encadrée si son titre est exactement le libellé de l'échéance** (§15.6) ;
3. sinon la page de cours de la matière ;
4. **sinon `null`** — pas de matière, pas de lien.

⚠️ **Jamais un lien vers la racine.** Même discipline que `pilotageLink`, qui rend `null` plutôt
que de déposer quelqu'un au hasard. Un lien qui n'ouvre rien de pertinent est pire qu'un lien
absent : il enseigne à ne plus cliquer.

⚠️ **La leçon est MISE EN ÉVIDENCE, pas ouverte d'office.** Une leçon n'a pas toujours de contenu
(`has_content`), et une modale qui s'ouvre sur du vide se lit comme une panne. Massimo voit où
aller ; il décide d'y aller.

**Cadre lumineux, révisé le 2026-08-10 après relecture à l'écran.** Le premier jet posait un
anneau discret : sur une page qui liste treize chapitres et leurs leçons, il ne se distinguait pas
des voisines. Trois choix, chacun pour une raison :

- **le cadre pulse TROIS FOIS puis se repose** — une pulsation perpétuelle serait un aimant à
  attention permanent sur une page de LECTURE, et le registre de Massimo est calme (ADR-0024 §5) ;
- **l'animation part et finit sur l'état de repos** — sous `prefers-reduced-motion` le cadre est
  simplement là, sans mouvement : c'est LUI l'information, pas le clignotement ;
- **la page défile jusqu'à la leçon** (`block: "center"`, et `behavior: auto` sous
  reduced-motion) — un cadre lumineux hors de l'écran n'éclaire rien.

⚠️ **Repli silencieux assumé** : le serveur ne sert que du validé (ADR-0009 §9). Une leçon
dévalidée après la saisie n'est plus là — Massimo atterrit alors sur le premier chapitre, sans
message d'erreur. Un enfant n'a rien à faire d'un « lien mort ».

#### 15.3 — Indépendant du `kind`

Un devoir rattaché à un cours y mène aussi. Recopier ici une règle de type en ferait une seconde
source de vérité — celle de `TRIGGERING_KINDS` a divergé **le jour même** où `devoir` y est entré
(addendum ADR-0035 §3). La porte du lien ne regarde aucun `kind` : elle regarde l'adresse.

#### 15.4 — Deux champs s'ouvrent à Massimo, et deux seulement

`AgendaItemStudentOut` gagne `lesson_id` et `chapter_id`.

C'est la première fois que des champs pilot-only passent la frontière élève, et il faut le dire
franchement. La justification tient en une phrase : **ce ne sont pas des données SUR Massimo, ce
sont des adresses de contenu qu'il peut déjà atteindre à la main.**

**Ce qui reste interdit ne bouge pas d'un pouce** : `parent_note`, `dismissed_at`, tous les
horodatages. Le test de non-fuite les nomme un par un, et il a été étendu, pas assoupli.

#### 15.5 — La leçon tombe avec le chapitre

Le cas se produit sans mauvaise volonté : Papa choisit un intitulé dans la liste du chapitre A,
puis change pour le chapitre B. Sans geste, l'échéance pointerait une leçon étrangère à son
chapitre — un lien faux.

**Deux gardes, et les deux sont nécessaires** :

- le **front** efface `lesson_id` dès que le chapitre change (grille et panneau) ;
- le **serveur** refuse en **422** une leçon hors du chapitre — et il contrôle l'état
  **résultant**, pas le corps de la requête. Un `PATCH` qui ne change QUE le chapitre rend la
  leçon périmée : ne lire que `data` laisserait passer exactement ce cas.

#### 15.6 — Rattrapage par titre exact, pour les échéances sans leçon

Ajouté le 2026-08-10, après un constat à l'écran : *« La phrase complexe : juxtaposition et
coordination » ne s'entoure pas d'un cadre coloré*. L'item portait `chapter_id: 2` et
**`lesson_id: null`** — la cascade §15.2 fonctionnait, elle n'avait simplement rien à désigner.

Le cas n'est pas marginal : **toutes les échéances saisies avant le §15** sont dans cet état, et
toutes celles dont Papa tape l'intitulé à la main le resteront. Or leur libellé est, souvent, le
titre **mot pour mot** d'un cours du chapitre. L'information est là ; elle n'est pas stockée comme
identifiant.

Le lien **dit ce qu'il cherche** — `?chapter=2&title=<libellé>` — et la page encadre la leçon du
chapitre dont le titre est identique.

> 🔴 **Ce n'est PAS la résolution « texte libre → leçon » que le §13.3 a écartée**, et trois bornes
> l'en séparent :
>
> - **égalité stricte** (au `trim()` près) — jamais une similarité, jamais un embedding ;
> - **dans le chapitre visé UNIQUEMENT** — jamais à l'échelle de la matière, où deux chapitres
>   peuvent porter des leçons homonymes. C'est le seul cas où ce rattrapage pourrait **mentir**, et
>   un test-verrou le tient (élargir la fenêtre le fait rougir sur la mauvaise leçon) ;
> - **rien n'est persisté** — le résultat décide d'un **cadre**, pas d'une donnée. Aucun
>   `lesson_id` n'est écrit : la rétro-attribution est refusée par la migration du §15, et elle le
>   reste.
>
> Son pire cas est l'état d'avant : le chapitre déplié, sans cadre. Ce qui l'autorise, c'est
> précisément qu'il **ne peut pas produire d'action fausse** — contrairement à l'ADR-0018 §1, où la
> résolution floue composait des missions.

**L'identifiant prime toujours** : quand `lesson_id` existe, le titre n'est même pas regardé.

### Conséquences

**Positives** — l'agenda cesse de nommer un cours sans y mener ; la précision suit ce que
l'échéance porte vraiment, sans jamais promettre plus ; l'information que le §13 produisait puis
jetait sert enfin ; et le patron `pilotageLinks` (une table de routage, `null` plutôt qu'un lien
au hasard) gagne son équivalent côté Massimo.

**Négatives / coûts** — une migration et une colonne de plus sur une table jeune ; deux champs
ouverts à la frontière élève, qui devront être défendus à chaque relecture ; une décision révoquée
**le jour même de son écriture**, ce qui est court et mérite d'être lu comme tel : le §13 a été
pris sans connaître la demande qui a suivi, pas contre elle ; et un repli silencieux (leçon
dévalidée) qu'aucun test d'écran ne couvrira jamais complètement.

### Suivi

- **Test-verrou** : leçon hors du chapitre → **422**, à la création comme au patch.
- **Test-verrou** : un `PATCH` du seul chapitre est refusé si la leçon devient périmée — c'est
  celui qui distingue « contrôler le corps » de « contrôler l'état résultant ».
- **Test-verrou** : `lesson_id` et `chapter_id` sont servis à Massimo, et `parent_note`,
  `dismissed_at`, les horodatages **ne le sont pas**.
- **Test-verrou** : la cascade leçon → chapitre → matière → `null`.
- **Test-verrou §15.6** : le rattrapage ne cherche **jamais hors du chapitre visé** — élargir la
  fenêtre à la matière fait rougir le test sur une leçon homonyme d'un autre chapitre.
- **Test-verrou §15.6** : égalité **stricte** — casse différente, ponctuation en plus, titre
  tronqué : aucun cadre. Le pire cas reste « pas de cadre », jamais un cadre sur autre chose.
- **Test-verrou** : changer de chapitre lâche la leçon, côté Papa.
- 🔴 **La migration `a1b2c3d4e5f8` est appliquée en DEV uniquement.** La prod est à faire — et son
  Postgres ne publie aucun port, c'est délibéré ; passer par le conteneur.
- Commit suggéré : `feat(agenda): the deadline leads to its lesson`.

### Décisions validées (commanditaire, 2026-08-10)

1. **Cibler la leçon exacte**, migration comprise — retenu contre le ciblage au chapitre seul.
2. **Le lien apparaît sur toute échéance qui a une cible**, quel que soit le type — retenu contre
   une restriction aux `lecon`, qui aurait recopié une règle de `kind` au front.

---

## Amendement 5 — Papa n'existe pas dans l'espace de Massimo — 2026-08-10

> Fusionné depuis **Amendement 5** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**.
> **Amende le §2a** : le marqueur de co-édition reste, l'auteur nommé change.
> **Portée volontairement plus large que l'agenda** — cinq surfaces de l'app Massimo et le module
> `chat` du serveur. Aucune migration.

### Contexte

Le §2a exige qu'un item touché par quelqu'un d'autre le **dise** : *« sans ce marqueur, Massimo
découvre un agenda qui bouge tout seul — la surveillance rentre par la porte de service »*. Le
libellé retenu à l'époque était « ajouté par papa » / « complété par papa ».

Le nom s'était ensuite installé partout ailleurs : ELI5 (« Dis à Papa d'ajouter »), le chat
(« Papa verra ta demande »), le diagnostic (« Papa prépare les diagnostics depuis son espace »),
les capsules (« Papa en prépare de nouvelles »).

**La décision inverse avait pourtant déjà été prise, le 2026-08-02, sur les missions** :

> *« Aucune signature d'auteur : une mission arrive dans la voix de ZETIS, quel que soit qui l'a
> créée. "👤 par Papa" aurait dû changer d'auteur le jour où ZETIS produit seul — la voix du monde
> de Massimo doit tenir dans le temps. »*

Cet addendum ne fait que **généraliser** ce raisonnement. Il n'introduit pas de doctrine neuve ;
il finit d'appliquer celle qui existait sur une seule surface.

### Décision

#### 16.1 — Une seule voix, et c'est celle de ZETIS

**Aucune chaîne rendue à Massimo ne nomme l'adulte.** Ni « papa », ni « ton père », ni « tes
parents » — le mot disparaît de son monde.

Ce qui reste vrai côté produit ne change pas d'un pouce : Papa pilote, valide, saisit l'agenda,
trie les demandes. **Le §16 porte sur ce que Massimo LIT, jamais sur ce que le produit FAIT.**

#### 16.2 — Le §2a est amendé, pas révoqué

« ajouté par ZETIS » / « complété par ZETIS » remplacent les libellés d'origine.

L'invariant du §2a tient **entier** : un item que Massimo n'a pas écrit porte toujours un
marqueur, et une correction reste annoncée en priorité. Le §2a exigeait que Massimo sache qu'un
**autre** a touché son agenda ; il n'a jamais exigé de le **nommer**. C'est l'altérité qui protège,
pas l'identité.

#### 16.3 — Deux formes, selon qui parle

Le remplacement n'est pas mécanique, et deux endroits ont demandé une réécriture :

- **Là où ZETIS parle à la première personne** — le chat, où Massimo s'adresse directement à lui —
  nommer « ZETIS » en ferait un **tiers dans sa propre conversation**. La forme juste est
  *« je le note »*, pas *« je le note pour ZETIS »*.
- **Là où une phrase décrivait une personne et son écran** — « Papa prépare les diagnostics
  **depuis son espace**, dès qu'**il** en laisse passer un » — la phrase entière a été refaite,
  pas seulement son sujet.

#### 16.4 — Deux verrous, et il en fallait deux

Un test balaie `apps/frontend-massimo/src`, un autre `app/modules/chat`. Les deux échouent sur
toute chaîne rendue contenant « papa », commentaires exclus — **la doctrine s'écrit, et elle doit
pouvoir nommer Papa pour expliquer pourquoi il ne s'affiche pas.**

> ⚠️ **Le second verrou n'est pas une symétrie de confort, c'est un constat.** Le libellé du bouton
> de demande du chat est **fabriqué côté serveur** (`ChatAction.label`, servi tel quel au front).
> Un verrou limité au frontend aurait été **vert sur trois phrases fautives** — dont celle que
> Massimo lit le plus souvent quand ZETIS n'a pas de contenu.

Le balayage de dépôt est préféré à un test par écran : la règle est transverse, et un test par
surface laisserait passer la sixième, écrite dans six mois par quelqu'un qui n'aura pas lu l'ADR.

### Conséquences

**Positives** — la voix du monde de Massimo est unique et tiendra le jour où ZETIS produira seul ;
la décision du 2026-08-02 cesse d'être une exception sur une seule page ; et deux verrous de dépôt
rendent la règle opposable sans relecture humaine.

**Négatives / coûts** — quatre tests existants encodaient les anciennes formulations et ont été
mis à jour ; ils protégeaient un invariant (« ZETIS annonce qu'il note plutôt que de faire semblant
d'avoir le contenu ») qui, lui, n'a pas bougé — les assertions portent désormais sur **la promesse
elle-même** (`« je le note »`) plutôt que sur son destinataire, ce qui est un meilleur témoin.
Coût réel : une **perte d'information** pour Massimo, qui ne saura plus que c'est un humain qui
répond à sa demande. Assumé — c'est le prix d'une voix qui tient dans le temps.

### Suivi

- **Verrou de dépôt** ×2 (front + `chat`), sabotés et rougis à l'écriture.
- ⚠️ Les identifiants de code (`askPapaToAdd`, `_as_papa`, `PapaLayout`…) **ne sont pas
  concernés** : un identifiant ne se lit pas à l'écran. Le verrou ne retient que le mot isolé.
- À étendre si une surface Massimo naît hors de ces deux dossiers.
- Commit suggéré : `feat(massimo): one voice, and it is ZETIS`.

### Décisions validées (commanditaire, 2026-08-10)

1. **« ajouté par ZETIS » remplace « ajouté par papa »**, et le nom de l'adulte disparaît de
   **tout** l'espace de Massimo — pas seulement de l'agenda.

---

## Amendement 6 — La bande ouvre un jour, et le passé cesse d'être hors d'atteinte — 2026-08-10

> Fusionné depuis **Amendement 6** le 2026-08-16. Statut d'origine : **Accepté**.

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**.
> **Révoque une phrase de `docs/frontend-massimo/page-agenda.md`** (« la bande est un index, pas
> une seconde liste ») et **déplace** le plafond du §7 : de filtrage à affichage.
> Aucune migration, aucun changement de contrat serveur.

### Contexte

Relevé à l'écran par le commanditaire : *« je vois dans agenda massimo 3 points verts au dim 9 et
sam 8, il ne se passe rien »*.

Deux choses s'y cachaient.

**1. Les points verts ne sont pas des devoirs.** Ce sont les **traces d'activité** du §7 — « Massimo
a travaillé ce jour-là ». Vérifié sur l'API : ces deux jours portent `traces: 3` et
**`fixed_items: []`**. La confusion est le symptôme, pas la cause.

**2. Le tap ne répondait pas.** La bande était un **index** : `scrollToDay` faisait défiler vers le
premier item du jour et **sortait en silence** quand il n'y en avait pas. Or le serveur ne renvoie
**jamais** d'échéance sur un jour passé (§6, asymétrie calculée serveur) : le tap était donc muet
sur **tous** les jours passés — c'est-à-dire précisément là où des points étaient allumés.

Un jour qui **montre quelque chose** et ne répond pas se lit comme une panne. C'est le même
raisonnement que les motifs `SKIP_*` de `triggers.py`, appliqué à un tap.

### Décision

#### 17.1 — La bande ouvre un jour ; elle n'est plus seulement un index

Un tap **sélectionne** le jour et ouvre un panneau **sous la bande** — pas en bas de page : la
réponse à un tap doit arriver là où le doigt vient de se poser. Retaper le jour ouvert le referme.

**Le panneau répond TOUJOURS**, y compris pour dire qu'il n'y avait rien :

- des échéances → elles s'affichent, cochables, avec leur lien vers le cours (§15) ;
- aucune, jour passé → *« Rien à rendre ce jour-là »* ;
- aucune, jour à venir → *« Rien de noté pour ce jour »* ;
- et si le jour porte des traces → *« tu as travaillé 3 fois »*, la moitié **positive** du passé.

> ⚠️ **`0` trace ne se rend pas.** Le contrat serveur ne distingue pas `0` de « pas de donnée »
> (§7) ; afficher « tu as travaillé 0 fois » fabriquerait le constat d'absence que le §7 interdit.

**Ce que la phrase révoquée protégeait est conservé** : la bande ne devient pas une seconde liste
qui doublerait les sections. Elle ouvre **un** jour à la fois, à la demande, et le panneau se
referme. Ce n'est pas une liste, c'est une réponse.

#### 17.2 — Le plafond de « À reprendre » change de nature, il ne disparaît pas

Le §7 dit : *« 3 affichés au maximum quel qu'en soit le nombre — la section ne grossit pas »*. Le
plafond était appliqué dans `splitSections`, c'est-à-dire **au filtrage** : au-delà de trois, les
items passés non faits n'étaient pas cachés, ils étaient **hors d'atteinte**. Rien, nulle part, ne
permettait d'y revenir.

Désormais : la liste est **complète**, la page en montre **trois**, et un bouton discret ouvre le
reste — *« voir 5 autres ▾ »*.

**Le §7 n'est pas rouvert, il est relu.** Ce qu'il interdit, c'est un écran qui **s'allonge tout
seul** : *« une section qui s'allonge redevient la liste d'arriéré »*. Un dépliage que Massimo
**ouvre** est son geste, pas une dette qui pousse sous ses yeux.

> ⚠️ **Le nombre n'apparaît QUE sur le bouton**, jamais à côté du titre. « À reprendre · 8 » serait
> exactement le compteur d'arriéré interdit ; « voir 5 autres » dit ce que le geste va ouvrir, et
> disparaît une fois ouvert.

#### 17.3 — Le vocabulaire ne bouge pas

La demande parlait de **« devoirs en retard »**. Le mot est interdit sur les surfaces de Massimo
(§7 : *« aucun rouge, aucun "en retard", aucun compteur d'arriéré »*), et il le reste : la fonction
demandée est livrée sous le nom **« à reprendre »**, en ambre doux, dans le panneau comme dans la
section.

C'est le seul point où la livraison s'écarte de la lettre de la demande, et c'est délibéré : le §7
protège un enfant d'un écran qui lui reproche quelque chose.

### Conséquences

**Positives** — le silence qui a déclenché ce chantier disparaît ; les traces d'activité cessent
d'être confondues avec des devoirs, parce qu'un panneau les nomme ; le passé non fait redevient
**atteignable** sans que l'écran s'allonge ; et le tap sur un jour à venir gagne au passage une
réponse plus riche qu'un défilement.

**Négatives / coûts** — une phrase de spec révoquée trois semaines après son écriture ; un panneau
de plus sur une page dont la sobriété est un objectif ; et une tentation permanente, qu'aucun test
ne clôt, de faire du dépliage un compteur (« 8 à reprendre ») — le §17.2 la nomme pour qu'elle soit
reconnue quand elle reviendra.

### Suivi

- **Test-verrou** : un jour sans échéance **répond** (« Rien à rendre ce jour-là »).
- **Test-verrou** : `0` trace ne se rend pas, et un jour à venir non plus.
- **Test-verrou** : aucun vocabulaire de retard ni compteur d'arriéré dans le panneau.
- **Test-verrou** : `splitSections` ne plafonne plus — les plus anciens sont dans la liste.
- Réécriture du paragraphe « Bande glissante » de `docs/frontend-massimo/page-agenda.md` (§17.1).
- **Observation attendue** : si Massimo ouvre le dépliage et n'y touche jamais, c'est que le
  rattrapage au-delà de trois jours n'intéresse personne — et le plafond de filtrage avait raison.
- Commit suggéré : `feat(agenda): tapping a day answers, and the past is reachable again`.

### Décisions validées (commanditaire, 2026-08-10)

1. **Lever le plafond derrière un dépliage** — retenu contre une levée totale (qui recréerait la
   liste d'arriéré) et contre le statu quo.
2. **Un jour sans échéance le dit, et dit ce qui a été fait** — retenu contre un panneau muet et
   contre un jour non cliquable.

---

## Amendement 7 — le regard vit à `/agenda`, et nulle part ailleurs — 2026-08-15

> Fusionné depuis **Amendement 7** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**, prise après diagnostic du défaut à l'écran.

> **RÉVOQUE la Décision validée n°2 de l'**Amendement 1**** en ce qui
> concerne ses **deux points d'écriture** (§12.3, premier tiret). Le témoin de l'agenda n'est plus
> marqué vu au rendu du bandeau d'Accueil ; seule l'ouverture de `/agenda` l'éteint.
>
> ⚠️ **C'est une révocation d'une décision commanditaire vieille de quatorze jours**, écrite comme
> telle. Le §12.3 n'était pas une inadvertance : il argumentait ses deux surfaces.

### Ce qui est décidé

**`POST /api/student/agenda/seen` n'est plus appelé qu'à l'ouverture de `/agenda`.**

Le bandeau d'Accueil (`HomeAgendaBanner`) cesse de marquer l'agenda vu.

### Le défaut, mesuré

Le témoin de l'agenda est livré, correct côté serveur (`agenda/service.py::new_agenda_count`), et
**n'a jamais été vu par personne**.

Massimo atterrit sur l'Accueil. `HomeAgendaBanner` se monte, charge ses deux listes, et appelle
`markAgendaSeen()` dans son `finally` — donc **avant** que le badge de la sidebar ait fini de
s'afficher, et le `notifyNewsChanged()` qui suit force le recalcul à zéro dans les 400 ms.

Le composant l'écrivait lui-même, en commentaire, à la livraison :

> *« Conséquence assumée, pas un défaut — Massimo arrive sur l'Accueil par défaut, donc le badge
> Agenda n'y vit que quelques centaines de millisecondes. »*

La conséquence était donc **prévue et acceptée**. Ce que le §12.3 n'avait pas mesuré, c'est
qu'elle ne laisse au témoin **aucun cas d'usage réel** : l'utilité résiduelle envisagée — « Papa
saisit pendant que Massimo est déjà dans l'app » — suppose que Massimo soit déjà ailleurs que sur
l'Accueil **et** qu'il ne repasse pas par l'Accueil avant d'aller voir. Sur une app dont l'Accueil
est le point de retour, c'est un cas de bord, pas un usage.

### Le motif qui renverse le §12.3

Le §12.3 justifiait ses deux surfaces ainsi :

> *« Écrit à `now()` à l'ouverture de `/agenda` et au rendu du bandeau d'Accueil — les deux surfaces
> où Massimo lit ce qui est arrivé. N'en retenir qu'une ferait mentir le badge sur ce qu'il a déjà
> lu. »*

**Le bandeau ne montre pas ce qui est arrivé. Il montre un extrait, et un extrait choisi sur un
autre critère.** Il rend Aujourd'hui / Demain (`bannerItems`) plus une liste à-venir **tronquée**
(`bannerUpcoming`, bornée par `agenda_upcoming_horizon_days` et `agenda_upcoming_max`). Le témoin,
lui, compte ce qui est **arrivé depuis le dernier regard**, sans aucune considération d'échéance.

Les deux ensembles ne coïncident pas : un devoir saisi ce matin pour dans trois semaines est
**nouveau** et **absent du bandeau**. Le §12.3 marquait donc vu ce que Massimo n'avait pas pu lire.

Il ment dans les deux sens ; le sens qu'on corrige est celui qui rend le témoin inutile.

### Le contre-motif, maintenu au dossier

Il ne disparaît pas parce qu'il a été écarté :

- **Lire le bandeau EST un regard partiel.** Après cette décision, Massimo peut voir ses trois
  échéances du jour sur l'Accueil et garder un badge allumé sur l'entrée Agenda. Le badge dira
  « il y a du nouveau » alors qu'une partie a bien été lue.
- C'est le prix assumé, et il est le **moindre des deux** : un badge qui reste allumé de trop
  invite à ouvrir une page ; un badge qui s'éteint avant d'exister n'invite à rien.

### Bornes

1. **Un seul point d'écriture** — `useAgenda`, à l'ouverture de `/agenda`. Un test compte les
   appelants côté client (miroir du test qui les compte déjà côté routeur dans `test_agenda.py`).
2. **§12.1, §12.2, §12.4 et §12.5 ne sont PAS rouverts** — le test qui sépare nouveauté et arriéré,
   le badge chiffré, l'interdiction du compteur d'items non faits, et le fait que le badge retombe
   à zéro et y reste toute la semaine, échéances en cours comprises.
3. **La granularité ne bouge pas.** `agenda_last_seen_at` reste **un horodatage par élève**, jamais
   un `seen_at` par item. Le §12.3 est amendé sur **qui écrit**, pas sur **quoi est écrit** : c'est
   cette granularité qui empêche la donnée « vu le 12, jamais fait » d'exister.
4. **Aucune surface ne devient un regard sans amender ce document.** En particulier, *afficher* le
   nombre ailleurs (bandeau, en-tête, Accueil) ne marque rien. La règle est désormais : **marque vu
   la surface qui montre TOUT ce qui est arrivé**, et il n'y en a qu'une.

### Le signal qui dirait qu'on s'est trompé

- **Le badge Agenda reste allumé en permanence** parce que Massimo lit tout sur l'Accueil et
  n'ouvre jamais `/agenda`. Le badge serait alors devenu un décor. Réponse : regarder d'abord si
  le bandeau d'Accueil ne rend pas la page inutile — le défaut serait dans leur composition, pas
  dans le témoin (§12.5).
- **Le badge affiche `9+` durablement** : il ne s'agirait plus de nouveauté mais d'arriéré, et le
  robinet est chez Papa.
- ⚠️ Aucun des deux n'est mesuré. Ils se regardent, ils ne s'alertent pas.

### Mise en œuvre

- `apps/frontend-massimo/src/components/agenda/HomeAgendaBanner.tsx` : l'appel `markAgendaSeen()`
  et son commentaire sont retirés, **remplacés par un commentaire qui nomme cette révocation** —
  sans quoi la prochaine session le rétablira au motif du §12.3, qui reste écrit.
- `apps/frontend-massimo/src/hooks/useAgenda.ts` : **inchangé**, c'est désormais le seul appelant.
- `HomeAgendaBanner.test.tsx` : le test est **inversé**. Son titre nomme ce document, et son corps
  conserve l'ancienne raison, barrée. Un test inversé qui ne dit pas pourquoi est un test perdu.
- Le docstring de `lib/agenda.ts::markAgendaSeen` (« Appelée depuis DEUX surfaces, et il en faut
  deux ») est réécrit.
- Le paragraphe « Accès — deux portes » de `docs/frontend-massimo/page-agenda.md` est mis au réel.

### Voir aussi

- **Amendement 1** (§12.3, amendé)
- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§1 — la règle, intacte)
- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (Amendement 2) (bornes transverses B1–B4)

---

## Amendement 8 — Le passé se raconte, et la matière prend la couleur — 2026-08-17

### Statut

**Proposé — 2026-08-17.** Quatre arbitrages du **commanditaire**, rendus après lecture de la page
avec de vraies données. Session de **cadrage** : maquette + ce document, **aucune ligne de code**.

> **RÉVOQUE quatre décisions**, dont deux vieilles de dix-neuf jours et une doctrine transverse.
> Elles sont nommées une à une au §R. Ce n'est pas un dépoussiérage : le §Alternatives et la note
> du 2026-07-29 argumentaient leur refus, et l'argument reste vrai — il est désormais **pesé
> contre un défaut mesuré**, et il perd.

**Maquette de référence** : `docs/frontend-massimo/mockup/mockup-page-agenda-v2.html`
(huit écrans, dont la planche des formes, l'épreuve daltonienne et les deux cadres d'appareil).
Elle a été regardée à l'écran avant l'écriture de ce document, et elle a **démenti un chiffre du
cadrage** (§M).

---

### Le défaut, dans les mots du commanditaire

> *« Il ne peut voir qu'une courte période sur une ligne. Quand il revient sur une date — samedi
> 15 août — il lit "Rien à rendre ce jour-là". Tu as travaillé 3 fois : il doit savoir ce qu'il a
> fait. La page me semble pauvre visuellement et sur le plan efficacité. »*

Le cas du samedi 15 août est **exactement reproductible** et il tient en une phrase :
`AgendaDayPanel` rend « Rien à rendre ce jour-là. » comme **corps** du panneau (`:109-113`), puis,
cinquante lignes plus bas et en `text-xs text-zetis-muted`, « tu as travaillé 3 fois » (`:168-177`).
L'écran affirme donc le vide, puis le dément en note de bas de page. Et ce qu'il finit par
concéder est **un nombre** : ni la matière, ni la notion, ni la forme du travail.

Ce n'est pas un défaut de rendu. C'est le §7 appliqué à la lettre — *« les traces disent ce qui a
été fait »* — sans que personne ait remarqué que **trois points verts ne disent rien de ce qui a
été fait**.

---

### §D — Ce qui est décidé

#### D1. La vue mois existe, et elle porte les deux registres

`/agenda` offre **deux vues** entre lesquelles Massimo bascule : la **bande glissante** de 14 jours
(inchangée dans son principe, refondue dans son rendu — D6) et une **grille mois** alignée lundi.

La grille mois porte **les deux registres à la fois** :
- **registre haut** — ce que l'école demande, sur les jours passés **comme** à venir ;
- **registre bas** — ce que Massimo a travaillé, sur les jours passés.

> 🔴 **C'est la révocation la plus lourde de ce document** (R1, R2). Le §Alternatives écartait la
> vue mois parce qu'*« une grille qui s'archive rend les trous visibles, et un trou visible est une
> culpabilité »*. Le commanditaire assume. Le §B1 borne ce que la révocation emporte — et surtout
> ce qu'elle **n'emporte pas**.

#### D2. Le passé se raconte : matières, notions, formes — jamais une mesure

Sur un jour passé, « tu as travaillé 3 fois » est **supprimé** et remplacé par un bloc
**« Ce que tu as travaillé »** : par matière, la **notion** touchée et les **formes** de travail.

```
Ce que tu as travaillé
┃ 🔢  Mathématiques
┃     Théorème de Pythagore
┃     Cours lu · Quiz
┃ 🌱  SVT
┃     La respiration cellulaire
┃     Fiche de révision
┃ ✒️  Français
┃     Révision SRS
```

Règles opposables :

1. **Aucun nombre, nulle part.** Ni compte de matières, ni « 3 fois », ni minutes, ni XP, ni score,
   ni horodatage, ni total, ni série. C'est la borne qui distingue *raconter* de *chronométrer*.
2. **Les matières sont dans l'ordre chronologique de première touche.** C'est le récit de sa
   journée. Trier par fréquence ou par volume, **c'est mesurer** — par la porte de derrière.
3. **Les formes sont jointes par ` · `**, dédupliquées, dans un **ordre doctrinal fixe**
   (cours → fiche → quiz → révision → explication), jamais par fréquence.
4. **Le titre est « Ce que tu as travaillé ».** Pas « Ton activité » (froid, instrumental). Pas
   « Bilan » (un bilan appelle un verdict). Pas « Résumé » (un résumé suppose qu'on comptait).
   Passé composé, sujet « tu » : c'est lui qui a fait la chose.
5. **Aucun lien causal n'est suggéré entre une trace et une échéance.** Pas de « ✓ tu as fait ton
   devoir de maths ». La trace n'est pas la preuve de l'échéance — c'est tout l'objet de
   l'exclusion `NON_ACTIVITY_EVENTS` (§3), et les confondre à l'écran déferait au niveau visuel ce
   que le serveur protège au niveau de la donnée.

> ⚠️ **« Chapitre » a été demandé, « notion » est livré — et c'est un constat, pas un arbitrage
> de confort.** `LearningEvent` porte `subject_id` et `skill_id`, rien d'autre
> (`db/models/progress.py:251-257`), et `Skill` porte `subject_id` + `parent_skill_id`, **sans
> `chapter_id`** (`db/models/school.py:109-117`). Il n'existe aucun chemin `événement → chapitre`.
> Ajouter la colonne coûterait une migration **et resterait vide sur tout l'historique** — donc
> inutile précisément pour le cas qui a déclenché ce chantier. `Skill.name` est déjà joint par
> `_skill_names()`, et c'est le vocabulaire que Massimo reconnaît.
> **Repli propre** : quand l'événement n'a pas de `skill_id`, la ligne de notion **saute** ; la
> matière seule reste une réponse.

#### D3. La doctrine des cinq canaux — teinte = matière, et l'état n'a aucun canal

Le commanditaire a tranché : **la matière porte la couleur, le type porte la forme.** Cet
arbitrage met la palette des 8 matières en collision frontale avec la sémantique déjà occupée
(§C). La résolution est une répartition stricte, opposable :

| Canal | Porte | Ne porte JAMAIS |
|---|---|---|
| **Teinte** | la **matière**, et rien d'autre | l'état, la nature, le temps |
| **Silhouette** | la **nature** (devoir / leçon / contrôle / rendu) | la matière |
| **Remplissage** plein / contour | **l'échéance tombe ici** / **tu prépares ici** | la complétion |
| **Registre** haut / bas de cellule | **l'école demande** / **tu as travaillé** | — |
| **Opacité** | la distance dans le temps (trace à `.55`) | l'état, la performance |

> 🔴 **Dans la grille, l'état de complétion ne prend AUCUN canal.** La grille répond à *quand* et
> *quoi*, jamais à *où en es-tu*. Un jour passé rend ses échéances **sans dire lesquelles étaient
> cochées** : la différence visible coché / non-coché, répétée sur trente jours, **est** le
> compteur d'arriéré que le §7 interdit. Le rattrapage garde sa surface — « À reprendre », ambre
> doux, en bas de page — et le panneau du jour, où il répond à un geste au lieu de se subir en
> balayant le mois.
>
> ⚠️ **AMENDÉ le jour même par D10-b**, sur une asymétrie que ce paragraphe n'avait pas vue :
> l'accompli reçoit une **marque ajoutée**, le manquant n'en reçoit aucune. Ce qui reste
> interdit — et verrouillé par un test — c'est d'**estomper** le fait, ce qui ferait ressortir
> le non-fait. Le reste du paragraphe tient : la teinte, la silhouette, l'opacité et la taille
> ne portent toujours aucun état.

#### D4. Les quatre silhouettes

| Type | Forme | Motif |
|---|---|---|
| `devoir` | **disque ●** | le plus fréquent, donc la forme la plus calme. Aucun angle, aucune pointe : un devoir ne menace pas. |
| `lecon` | **barre ▬** | une ligne à apprendre. L'**allongement** est le seul discriminant qui survive au flou, à la petite taille, au monochrome et au daltonisme. |
| `controle` | **losange ◆** | **déjà enseigné par le dépôt** — `AgendaItemRow.tsx:114` rend « ◆ contrôle ». On ne réinvente pas un vocabulaire que Massimo connaît. |
| `rendu` | **triangle ▲** | une chose qu'on remet. Trois côtés contre quatre : la pointe unique se lit contre le losange même à 8 px. |

**Les trois types d'étape de plan (`fiche` / `revision` / `quiz`) FUSIONNENT** dans la grille en un
simple **état de contour**, portant la silhouette et la teinte de l'échéance préparée. Trois
motifs : la cellule n'a pas besoin du grain fin ; le contour encode déjà la bonne opposition
(*subi* vs *choisi*) ; et les trois kinds ont **déjà** leurs marques dans `planStepTarget()`
(🗒️ / 🃏 / 🎯), dont les libellés sont justifiés sur mesure. Leur donner en plus une géométrie
créerait un second vocabulaire pour le même objet.

> **Ce système corrige un défaut déjà en production.** `AgendaItemRow.tsx:114` et `:125` rendent
> **le même glyphe `◆`** pour `controle` et pour `lecon`, séparés **uniquement par la teinte**
> (fuchsia vs indigo), à `text-[10px]`. C'est le conflit central de ce document, en miniature, et
> il est à l'écran depuis le 2026-08-10.

#### D5. Le contrat serveur

**Nouvelle route élève** — `GET /api/student/agenda/days/{date}/traces`, `require_child`, **schéma
dédié**, jamais dérivé de `DayDetailOut` :

```jsonc
{ "date": "2026-08-15",
  "subjects": [
    { "slug": "mathematiques", "name": "Mathématiques", "color": "#60a5fa",
      "notions": ["Théorème de Pythagore"], "forms": ["Cours lu", "Quiz"] }
  ] }
```

- 🔴 **Aucun champ `minutes`, `xp`, `time`, `score_percent`, `count`.** Verrouillé par un test sur
  le **JSON sérialisé**, sur le modèle de celui qui garde `parent_note` — pas par un filtre client.
- 🔴 **`GET /api/parent/activity/days/{day}` n'est PAS réutilisé.** Il est sous `require_parent` et
  son `DayDetailOut` transporte `time`, `minutes`, `xp` et `score_percent` : quatre interdits d'un
  coup. « Le filtrer côté client » est précisément la faute que `packages/types/src/agenda.ts:6-8`
  interdit en tête de fichier.
- **Filtre `NON_WORK_EVENTS`**, comme `traces_by_day` — jamais `NON_ACTIVITY_EVENTS`, sans quoi
  *ouvrir la page* allumerait une trace. Trois tests de non-régression gardent déjà cette
  distinction ; ce document ne la rouvre pas.

**Changement de contrat** — `AgendaDay.traces` passe de `number | null` à `AgendaTrace[] | null`
(`AgendaTrace = { slug, name, color }`). **Remplacé, pas complété** : le nombre *est* la phrase à
tuer, et le laisser vivre à côté garantit qu'un jour quelqu'un réécrira « tu as travaillé 3 fois ».

**Nouvelle route** — `GET /api/student/agenda/month?anchor=AAAA-MM` (42 jours).
⚠️ **`week()` a un effet de bord en écriture** : `plan_steps_by_day` appelle `get_or_create_plan`,
qui **compose et persiste** des plans à la lecture (`agenda/service.py:277-303`). Une vue mois qui
recopierait `week()` naïvement déclencherait cette composition sur 42 jours. À border explicitement
dans la slice.

#### D6. Six correctifs d'efficacité, dans le même geste

| # | Défaut | Correctif |
|---|---|---|
| a | La bande de 14 jours se replie en **deux rangées de 7 qui ressemblent à des semaines sans en être** : `DAY_NAMES` est indexé par `getDay()` et la bande part de `aujourd'hui − 3`, donc **la première colonne change tous les jours** | rangée **unique à défilement horizontal**, `scroll-snap` aimanté sur aujourd'hui. Le motif d'origine du repli (« 27 px par colonne, illisible au doigt ») est répondu par le **défilement**, pas par le pliage : un défilement dit honnêtement « il y en a plus à droite », un pliage fabrique une fausse semaine |
| b | Le **`✦` de 10 px** porte à lui seul tout le signal du plan, sans dire *quelle matière*, et sa boîte `h-3` est **réservée sur les 14 colonnes** pour une marque qui s'allume sur deux jours | remplacé par le glyphe en contour (D4), à la place et à la taille d'une vraie échéance. La cellule gagne la matière ; la bande perd 12 px de hauteur morte |
| c | **Un jour passé vide est un cul-de-sac** — un `<p>` sans aucune sortie | ligne calme + **porte** vers `/matieres`. Registre repris de `AgendaPage.tsx:298-301`, pas inventé. La destination doit être une route **jamais vide** : surtout pas une session de révision, qui peut ne servir aucune carte (ce serait le bouton mort du §14.6) |
| d | **Quatre surfaces peuvent rendre le même item, trois seulement sont dédoublonnées** : « Ce qui arrive » n'est jamais filtré sur `pickedDay`, d'où **l'ancre du plan en double dans le DOM** — que `getElementById` ne sait pas départager, ce que `AgendaPage.tsx:88-93` reconnaît déjà | dépend du point ouvert O2 |
| e | **La couleur de matière est servie et perceptuellement absente** : `item.subject.color` est lu **brut** (`AgendaItemRow.tsx:70`), jamais via `subjectColorFor(slug, color)` — or `Subject.color` est `nullable` et le repli existe **exactement pour ça**. L'agenda est **la seule surface du produit qui perd silencieusement l'identité de matière** | `subjectColorFor()` partout, `border-l-4`, fond teinté à 8 % |
| f | Les deux boutons les plus conséquents sont **sous le plancher tactile** (~20 × 18 px) — dont le `✕` qui **archive un item** | zone tactile 44 × 44 transparente, glyphe visuellement inchangé |

#### D7. La **bande** est la vue par défaut

**Arbitrage du commanditaire, 2026-08-17.** `/agenda` s'ouvre sur la bande ; le mois se demande.
Le choix est **persisté** (`localStorage`, clé `zetis.agenda.vue`), donc réversible sans code.

Motif : les deux vues répondent à deux questions, et la question **quotidienne** est celle de la
bande. *« Et maintenant ? »* se lit sur 14 jours **sans aucun geste** ; *« où ça se situe ? »* et
*« qu'est-ce que j'ai fait ? »* sont des questions plus rares, qui valent un tap. Ouvrir sur la
grille ferait d'*aujourd'hui* une cellule parmi 42 et coûterait un geste au seul usage qui n'en
demandait aucun.

#### D8. « Ce qui arrive » **quitte `/agenda`** — et ne quitte pas le produit

**Arbitrage du commanditaire, 2026-08-17.** La section disparaît du bas de `/agenda`.

Trois motifs : (i) contrôles et rendus ont désormais une **silhouette** (`◆`, `▲`) repérable dans
les deux vues sans liste ; (ii) son `days_left` était le dernier décompte **chiffré** de la page,
que la grille remplace par une **distance spatiale** — même information, sans nombre ; (iii) elle
était la quatrième surface du défaut (d), et la seule non dédoublonnée.

> 🔴 **PÉRIMÈTRE EXACT — vérifié dans le code, et il dément ce que ce document affirmait
> au §O2 avant l'arbitrage.** J'avais écrit que la suppression *« laisserait
> `GET /api/student/agenda/upcoming` sans consommateur »*. **C'est faux, et l'erreur aurait
> envoyé la slice supprimer une route que trois surfaces utilisent.**
>
> | Objet | Sort | Preuve |
> |---|---|---|
> | La **section** de `AgendaPage` | **supprimée** | `AgendaPage.tsx:255-261` |
> | Le champ `upcoming` de `useAgenda` | **supprimé** | `useAgenda.ts:90` |
> | `UpcomingCard.tsx` **et son test** | **CONSERVÉS** | rendus aussi par `SubjectSideRail.tsx:122` |
> | `GET /api/student/agenda/upcoming` | **CONSERVÉE** | 2 appelants restants |
> | `HomeAgendaBanner` (bandeau Accueil) | **intact** | `HomeAgendaBanner.tsx:49` |
> | `useSubjectUpcoming` / `useAllUpcoming` | **intacts** | `MatiereDetailPage.tsx:57`, `MatieresPage.tsx:16` |
> | `AgendaUpcomingItem`, `days_left`, `has_plan` | **conservés** | consommés par les deux survivants |
>
> Autrement dit : **une seule surface perd la liste, le contrat ne bouge pas.** Une slice qui
> supprimerait la route casserait l'Accueil et les deux pages Matières.

#### D9. La page parle avec la voix de ZETIS — et ZETIS ne se donne toujours aucun rendez-vous

**Arbitrage du commanditaire, 2026-08-17**, confirmé après que la réserve ci-dessous lui a été
posée. Le sous-titre de `/agenda` devient, précédé de l'**avatar de ZETIS** :

> **Ce que ZETIS te demande, et ce que tu as travaillé.**

Il disait « Ce que l'école te demande cette semaine » — faux deux fois désormais : « cette
semaine » que la vue mois falsifie, et une moitié manquante, celle que D2 ajoute.

**La réserve, consignée parce qu'elle est réelle.** Le §4 pose que *« le calendrier n'accueille
que ce qui a une date dans le monde réel — ZETIS ne se donne jamais rendez-vous à lui-même »*.
Écrire « ce que **ZETIS** te demande » attribue la demande à ZETIS, c'est-à-dire exactement à
celui dont le §4 dit qu'il ne demande rien de daté. Sans ce paragraphe, la prochaine session
lirait une contradiction entre l'écran et le §4, et trancherait au hasard.

**Ce que la décision change, et ce qu'elle ne change pas** — c'est toute la borne :

| | |
|---|---|
| **Change** | la **VOIX** de la page. C'est ZETIS qui s'adresse à Massimo, sur cette surface comme sur les autres, et l'avatar le dit sans l'écrire. Le collège n'a jamais parlé à Massimo dans cette app ; il n'a pas de compte, pas de porte, pas de voix. |
| **Ne change PAS** | la **SOURCE** des dates. Le §4 tient intégralement : aucune carte SRS, aucune mission n'entre dans une surface datée, sous aucune forme. La seule dérogation reste l'étape de plan, qui hérite de la date d'une échéance scolaire réelle. |

> 🔴 **Le test-verrou du §4 n'est pas rouvert** :
> `test_dated_surfaces_never_contain_missions_or_srs_cards` (`app/tests/test_agenda.py`) reste
> vert, et c'est lui qui porte la règle — pas le sous-titre.
> *« ZETIS ne se donne jamais rendez-vous à lui-même »* est une règle sur **ce qui peut porter
> une date**, jamais sur **qui a le droit de parler**. Les confondre ferait interdire à ZETIS de
> s'adresser à l'enfant sur sa propre page.

⚠️ **Le signal qui dirait qu'on s'est trompé** : le jour où quelqu'un ajoute une mission ou une
carte due dans l'agenda en s'autorisant de ce sous-titre — *« puisque c'est ZETIS qui demande »*.
C'est précisément le glissement que ce paragraphe existe pour rendre impossible : le sous-titre
n'accorde aucun droit de datation, et le §4 le refusera toujours.

#### D10. Une notion travaillée se rouvre — et l'accompli reçoit une marque

**Deux arbitrages du commanditaire, 2026-08-17**, tous deux nés de questions posées à l'écran
plutôt que d'une relecture de ce document. Ils corrigent deux angles morts de D2 et D3.

**a) Chaque notion travaillée est une PORTE.**
Le bloc « Ce que tu as travaillé » rendait les notions en **texte inerte**, et la seule sortie
était générique (`/matieres`). La page racontait donc à Massimo ce qu'il avait fait **sans lui
laisser aucun moyen d'y revenir** — un récit en cul-de-sac, exactement le défaut que D6-c
corrigeait pour le jour vide et qui subsistait pour le jour plein.

Cause précise : le schéma servait `notions: list[str]`, **le nom sans l'identifiant**. Le
contrat devient `list[{id, name}]`.

Le tap ouvre la **panoplie réelle** de la notion — `GET /api/student/galaxy/notion/{skill_id}`,
rendue par le même `NotionActionPanel` que la Galaxie et la page matière.
🔴 **Trois surfaces, UN seul prédicat de disponibilité** (`resolve_panoply`) : un second a déjà
coûté au dépôt une porte ouverte sur du vide, le 2026-07-30. Rien n'y est un bouton mort (§14.6).

> ⚠️ **Défaut trouvé en câblant, et il dormait depuis longtemps** : `NotionActionPanel` codait
> `returnTo: "/galaxy"` **en dur dans son corps**, sous un commentaire affirmant qu'il était
> « dit à l'appel ». Il ne l'était pas. Personne ne pouvait le voir tant que le panneau
> n'existait que sur la Galaxie ; ouvert depuis `/agenda`, Massimo partait faire un ELI5 et
> revenait dans la galaxie, où il n'avait jamais demandé à aller. `returnTo` est désormais une
> prop, `/galaxy` n'en est que le défaut.

**b) L'ACCOMPLI reçoit une marque, le MANQUANT n'en reçoit aucune.**
D3 posait que *« l'état de complétion ne prend aucun canal »* : un devoir coché était rendu
strictement comme un devoir non coché. Le commanditaire a demandé à voir ce qu'il a fait.

**La nuance qui renverse l'arbitrage sans casser le §7 est une asymétrie** :

| | |
|---|---|
| **Marquer ce qui est fait** | ajoute un signe **là où il y a eu une action**. C'est la même logique que les traces : on constate une présence. |
| **Estomper ce qui est fait** | ferait **ressortir ce qui ne l'est pas**. Sur trente cellules d'un mois, ce contraste EST le compteur d'arriéré du §7. |

Règle opposable : `done` **ajoute une CROIX** au centre du glyphe et ne change **rien d'autre** —
ni la teinte, ni la silhouette, ni l'opacité, ni la taille. Un devoir non fait est rendu
**exactement** comme avant cette décision.

La croix est tracée **dans la couleur du fond** : elle *creuse* la silhouette au lieu de s'y
superposer, ce qui lui donne le même contraste sur les huit teintes de matière — un trait clair
aurait disparu sur le jaune d'histoire-géo.

> ⚠️ **Une croix, et non un disque évidé.** La première version posait une pastille de 1,5 px :
> regardée à l'écran, elle se lisait comme un défaut de rendu plutôt que comme un signe
> (commanditaire, 2026-08-17). Deux traits qui traversent la forme se voient d'un coup d'œil.
> Le registre est celui de la case cochée d'une croix — la convention scolaire française — et
> **non** celui du `✕` de la page, qui archive un item : ici ce n'est pas un bouton, mais une
> marque à l'intérieur d'un glyphe de 9 px.

> 🔴 **La croix se dimensionne PAR SILHOUETTE, et ce n'est pas un réglage de goût.** Les arêtes
> du **losange** sont à 45° — exactement l'angle de la croix. À la première taille essayée, elle
> courait parallèlement aux bords et **découpait le losange en quatre losanges séparés** : le
> glyphe cessait d'être une forme cochée pour devenir quatre taches. Vu à l'écran, corrigé en
> réduisant le rayon. Même contrainte ailleurs : la **barre** de la leçon n'a que 5 px de
> hauteur utile, et le **triangle** exige un centre abaissé sur son centre de gravité, faute de
> quoi la croix sort par le sommet. D'où la table `MARQUE`, une entrée par nature.

> 🔴 **Ce qui reste interdit, et qui est verrouillé par un test** : estomper, barrer, ou baisser
> l'opacité d'un item fait **dans la grille ou la bande**. Dans les listes c'est légitime — on y
> lit un item à la fois ; sur trente cellules, c'est un contraste qu'on balaie du regard.
> `AgendaMonthGrid.test.tsx` porte les deux verrous, et un sabotage a vérifié qu'ils rougissent.

⚠️ **Une étape de plan n'est jamais « faite » dans la grille** : elle se coche sous l'échéance
qu'elle prépare (§D4), et le contour dit déjà « tu prépares ici ».

#### D11. L'état quitte le glyphe et passe à la CELLULE — la journée soldée est hachurée

**Troisième forme de cette décision en une journée, et le chemin vaut d'être lu** — il dit
pourquoi elle a mis trois essais à se poser, et chacun a été tranché **devant l'écran**, jamais
sur le papier :

| | Ce qui a été essayé | Ce que l'écran a répondu |
|---|---|---|
| **§D3** | l'état ne prend **aucun** canal | le commanditaire ne voyait pas ce qu'il avait fait |
| **§D10-b** | une **croix** dans le glyphe | *« vraiment peu visible »* à 9 px — et elle **découpait le losange en quatre**, ses arêtes étant à 45° comme elle. Une **pastille** l'avait précédée, plus invisible encore |
| **§D11** | l'état passe à la **cellule** | ✔ |

**Le constat qui clôt la série** : à 9 px, un glyphe ne peut pas porter une **matière**, une
**nature**, une **modalité** *et* un **état**. C'est un canal de trop dans trop peu de pixels —
deux tentatives l'ont *montré* plutôt que démontré. Le signal a donc changé de **niveau**.

**Ce qui est décidé** : la cellule d'un jour porte une **hachure diagonale** dont l'**intensité**
suit l'avancement. `AgendaGlyph` n'accepte plus aucune prop `done` — une session future qui
voudrait y remettre un état butera sur son absence, et c'est voulu.

| État du jour | Trame |
|---|---|
| aucune échéance faite (ou aucune échéance) | **rien** |
| au moins une faite, pas toutes — *entamé* | blanc à **6 %** |
| toutes faites — *fini* | blanc à **16 %** |

> 🔴 **L'intensité monte, le motif ne change JAMAIS** — même angle, même pas, seule l'opacité
> varie. C'est ce qui en fait une *intensité* et non un second signe : l'œil lit « un peu » puis
> « tout ». Deux motifs (points, croisillons) auraient fabriqué deux vocabulaires pour une seule
> idée. Un test compare les deux chaînes CSS à l'opacité près.

> ⚠️ **Deux corrections successives, toutes deux venues de l'écran** :
> 1. la trame était posée à **5 %** — elle passait pour absente sur une cellule de 62 px. Portée
>    à 16 %, trait épaissi. Le **plafond** est fixé par ce qui passe devant : au-delà de ~20 %,
>    elle concurrence les glyphes de 9 px et les segments de trace ;
> 2. la trame était **binaire**, et cocher le premier de deux devoirs ne changeait donc rien —
>    *« une sur deux : on ne voit rien, corrige »*. **Un geste qui ne répond pas se lit comme une
>    panne**, exactement comme le tap muet sur un jour passé qui avait motivé l'addendum §17.

> 🔴 **Elle ne grise ni ne désactive rien.** Numéro, glyphes et traces gardent exactement leur
> rendu ; la trame passe **derrière** eux, et la cellule reste pleinement cliquable. Une cellule
> grisée se lirait comme désactivée — or c'est précisément le jour qu'on veut pouvoir rouvrir.

> 🔴 **DEUX gardes, et la seconde est la plus importante** : la hachure exige *au moins une
> échéance* **et** *toutes faites*. Sans la première, `every` sur un tableau vide rend `true` et
> **tous les jours vides du mois seraient hachurés** — un gabarit de cases remplies, c'est-à-dire
> l'inverse exact du §7. Un sabotage a vérifié que le verrou rougit.

⚠️ ~~**Conséquence assumée** : un jour à moitié fait ne porte aucun signal.~~ — **révoqué le
jour même**, cf. la correction 2 ci-dessus. Le grain fin (quelle échéance, quelle matière) se lit
toujours au survol (§D12) et au tap ; ce que la trame porte désormais, c'est seulement
l'**avancement** : rien, entamé, fini.

#### D12. Le survol d'un jour en donne l'aperçu

Au survol d'une date — **dans la bande comme dans la grille** — un toast montre les échéances du
jour (libellé, matière, nature, « fini » le cas échéant) puis **ce qui a été travaillé**
(matières, notions, formes). Il évite d'ouvrir douze jours pour retrouver lequel portait le
contrôle.

**Bornes** :

1. **Survoler donne un aperçu, taper ouvre le détail.** Le toast ne remplace pas le panneau, et
   il ne porte **aucune action** (`pointer-events: none`) : il ne doit jamais intercepter le clic
   qui ouvre le jour.
2. 🔴 **Pointeur FIN uniquement.** Au doigt il n'y a pas de survol, et un aperçu qui
   apparaîtrait au tap ferait concurrence au panneau qui s'ouvre du même geste. Même discriminant
   que la bande (§D6-a) : `(pointer: fine)`, jamais une largeur d'écran.
3. **Le détail se charge après une pause de 220 ms, et se met en cache.** Sans ce délai,
   traverser la grille déclencherait **une requête par cellule** — quarante-deux en un geste. Le
   passé d'un jour ne changeant plus, un jour déjà survolé ne se redemande pas.
4. **Aucune mesure, ici non plus.** Le toast montre ce que le panneau montre : ni compte, ni
   durée, ni « 3 sur 5 ». Les notions y sont plafonnées à 3, avec une **ellipse et jamais un
   nombre** — une journée de maths en rend six, et six notions dans 250 px sont un mur (vu à
   l'écran, deux fois : d'abord dans le panneau, puis ici).
5. 🔴 **LE TOAST RÉPOND TOUJOURS**, y compris pour dire que le jour était vide.

   ~~« Un jour totalement vide n'ouvre aucun toast — plutôt rien qu'un toast qui dit rien. »~~
   **Révoqué le jour même, et c'était une faute de conception**, pas un arbitrage : sur un mois
   ordinaire, **18 jours sur 31** n'ont ni échéance ni trace. Le survol ne répondait donc rien
   sur **58 % de la grille**, et la fonctionnalité passait pour cassée — *« les toasts au survol
   ont disparu »* (commanditaire, 2026-08-17).

   ⚠️ **Le dépôt avait DÉJÀ tranché cette question, dans l'autre sens.** L'addendum §17 existe
   précisément parce qu'un tap muet sur un jour passé *« se lit comme une panne »*, et son
   panneau *« répond toujours, y compris pour dire qu'il n'y avait rien à rendre »*. J'ai
   appliqué au toast la règle exactement contraire à celle que la même surface avait déjà payée.
   **Un vide confirmé est une réponse ; un silence n'en est pas une.**

   Le registre est repris **mot pour mot** du panneau — « Ce jour-là, l'école ne demandait
   rien. » au passé, « Rien de prévu ce jour-là. » à venir. Deux surfaces qui répondent la même
   chose doivent la dire pareil.

6. 🔴 **LES DEUX REGISTRES SONT NOMMÉS, ou aucun ne l'est.**
   « Ce que ZETIS te demandait » (au passé) / « Ce que ZETIS te demande » (à venir) au-dessus des
   échéances ; « Ce que tu as travaillé » au-dessus des traces.

   La liste des échéances n'avait **pas** de titre alors que le bloc des traces en avait un.
   L'œil rattachait donc « Ce que tu as travaillé » aux échéances juste au-dessus — et sur un
   jour portant une échéance non faite, le toast **semblait se contredire** : *« ce que tu as
   travaillé, non puisque non fait »* (commanditaire, 2026-08-17).

   ⚠️ **Le texte n'était pas faux, il était ambigu** — et la vérification en base l'a montré :
   le 11 août, l'école demandait *français + SVT* (le SVT non fait), et Massimo avait travaillé
   *maths + anglais*. Les deux blocs étaient cohérents ; **c'est le titrage asymétrique qui les
   fusionnait**. Un seul des deux nommé, et le lecteur rabat le titre sur la liste voisine.

   Les libellés reprennent **mot pour mot le sous-titre de la page** (§D9), qui annonce déjà les
   deux registres : *« Ce que ZETIS te demande, et ce que tu as travaillé. »* C'est aussi la
   doctrine des canaux appliquée au texte — registre haut / registre bas (§D3).

#### D13. Les jours À VENIR portent un cadre orange

**Arbitrage du commanditaire, 2026-08-17.** Dans la bande comme dans la grille, la cellule d'un
jour **futur qui porte au moins une marque** — échéance ou préparation — reçoit une bordure
orange. Aujourd'hui garde son **cyan**, le passé reste nu, et **un jour à venir vide ne rend
rien**.

> 🔴 **DEUX conditions, et la seconde a été oubliée à la première écriture.** Le cadre a d'abord
> été posé sur *tout* le futur : **quatorze cellules sur trente et une** encadrées, la plupart
> vides. Le cadre annonçait « ça arrive » sur des jours où rien n'arrive — un gabarit de cases,
> c'est-à-dire le §7 réintroduit sur le futur.
> Défaut vu par le commanditaire **à l'écran**, et c'est le **même oubli** que la garde
> « au moins une échéance » de la hachure (§D11), commis deux fois dans la même journée : une
> condition de temps sans condition de contenu.

> 🔴 **L'orange ne colore JAMAIS un glyphe**, et c'est ce qui le rend non ambigu : `#fb923c` est
> la teinte de l'**espagnol** dans la palette matière. La séparation est **spatiale**, exactement
> celle qui règle déjà le cas du cyan — teinte de la **physique-chimie** — cantonné au numéral,
> à la bordure et au halo (§C). Une bordure de cellule et un aplat de 9 px ne se confondent pas,
> même à teinte égale. Un test le verrouille en balayant tous les `svg` de la grille.

> ⚠️ **Il ne se confond pas non plus avec l'ambre du rattrapage** (« à reprendre ») : celui-ci
> est le ton d'une **carte d'item**, et la règle du §C tient — *aucun ton sémantique n'entre dans
> une cellule de grille*.

⚠️ **Aujourd'hui n'est pas « à venir ».** Deux cadres sur la même cellule se contrediraient : le
cyan dit *« on est ici dans le temps »*, l'orange dit *« ça arrive »*.

**Ce que le cadre dit, exactement.** Non pas « ce jour n'est pas encore arrivé » — cela, le
calendrier le dit déjà — mais **« il y a quelque chose ici, et ce n'est pas encore passé »**.
C'est ce qui le rend utile en balayant la grille du regard : il pointe vers ce qui vient, pas
vers le temps qui passe.

C'est aussi ce qui le met hors d'atteinte du §7. La première version, qui encadrait tout le
futur, en était bien plus près qu'elle n'en avait l'air :

| | Encadrer **tout** le futur | Encadrer **ce qui porte quelque chose** |
|---|---|---|
| Ce que ça dessine | un **gabarit** de cases sur la moitié du mois | des repères épars, là où il y a matière |
| Ce qu'une case vide y dit | « ce jour attend d'être rempli » | rien — elle est nue, comme dans le passé |

🔴 **Deux corollaires opposables :**
1. **Le cadre ne doit jamais être étendu au passé** — il y deviendrait immédiatement le gabarit
   que le §7 refuse, cette fois sur des jours où l'absence *est* reprochable.
2. **Il ne doit jamais s'allumer sur un jour vide**, futur compris. Un jour vide est normalement
   vide : c'est la même phrase qui gouverne l'absence de bouton « + » et l'absence de réceptacle
   de trace.

#### D14. Le rattrapage dans le toast — ambre et « à reprendre », le rouge REFUSÉ

**Demande du commanditaire, 2026-08-17** : *« toast des dates passées et devoir non fait : donc
retard : comment améliorer le toast ? cadre rouge ? »*
**Arbitrage rendu après discussion : ambre et « à reprendre ».**

🔴 **Le rouge et le mot « retard » ont été refusés en connaissance de cause**, et c'est la seule
demande de la journée qui n'a pas été appliquée telle quelle. Motif, cité au commanditaire :

> §7, interdits transverses : *« aucun rouge, aucun "en retard", aucun compteur d'arriéré »*.
> `CLAUDE.md` : *« l'absence de formulation humiliant l'enfant »*, avec le vocabulaire imposé —
> « notion à renforcer », « à reprendre », jamais « échec ».

Ce n'est pas une règle de style : c'est la doctrine pédagogique du produit, celle qui a déjà
coûté le **retrait de la série** le 2026-07-27. Le besoin, lui, était légitime — *ce qui n'est
pas fait doit se voir et s'attraper* — et le dépôt avait déjà une réponse pour ça.

**Ce qui est rendu, sur un jour PASSÉ portant au moins une échéance non faite** :

| | |
|---|---|
| Cadre du toast | **ambre** (`amber-400/45`) |
| Sur la ligne concernée | « · **à reprendre** », en ambre |
| Porte | « **Ouvre ce jour pour le reprendre →** » |

⚠️ **Ambre et mot sont ceux que la page emploie DÉJÀ** — section « À reprendre », et
`AgendaItemRow tone="resume"`. Massimo n'apprend pas un second code pour la même chose : c'est le
même objet vu par une autre porte.

🔴 **La porte NOMME le geste, elle ne le porte pas.** Le toast est `pointer-events: none`
(borne 1) : y mettre un bouton le rendrait survolable, donc capable d'intercepter le clic qui
ouvre le jour **et** de provoquer un `mouseleave` en s'interposant sous le curseur. C'est le
panneau du jour qui coche et qui mène à la notion.

⚠️ **Un jour À VENIR non fait ne parle jamais de rattrapage** : il n'y a rien à rattraper.

> **Verrou** : `AgendaDayToast.test.tsx` assert l'absence de tout rouge (classes Tailwind
> `red`/`rose` **et** valeurs hexadécimales/rgb) et de tout le champ lexical du retard
> (« retard », « oublié », « manqué », « raté », « pas fait »). Un sabotage a vérifié qu'il
> rougit sur les deux. Le prochain qui voudra du rouge butera là, et lira pourquoi.

#### D15. Un jour vide : UNE phrase, écrite UNE fois

**Arbitrage du commanditaire, 2026-08-17** : *« je n'aime pas la formulation »*.

Il y avait **quatre** formulations pour une seule réponse — deux temps × deux surfaces :

| | Panneau | Toast |
|---|---|---|
| passé | « Ce jour-là, l'école ne demandait rien. » | idem |
| à venir | « Rien de noté pour ce jour. » | « Rien de prévu ce jour-là. » |

Il n'y en a plus qu'une, **et elle n'est écrite qu'à un seul endroit** —
`agendaSections.ts::JOUR_VIDE` :

> **« Rien de prévu ce jour-là. »**

🔴 **La constante partagée n'est pas du confort : c'est le seul moyen de tenir la règle.** Le §D12
posait que *« deux surfaces qui répondent la même chose doivent la dire pareil »* — et la copie
avait déjà divergé entre les deux, dans le même chantier, à quelques heures d'intervalle.

⚠️ **« l'école » a été écarté pour une raison précise** : depuis le §D9, c'est ZETIS qui parle sur
cette page. Le toast **mélangeait donc deux voix** — « Ce que **ZETIS** te demandait » en titre,
« **l'école** ne demandait rien » deux lignes plus bas. « Rien de prévu » n'attribue la demande à
personne, et la collision disparaît.

#### D16. Le fond du toast « à reprendre » dérive — il ne clignote pas

**Demande du commanditaire, 2026-08-17** : *« ajoute sur les toasts des devoirs en retard un
background animé dans le style du cadre »*.

Le toast d'un jour passé non soldé reçoit, **en plus de son cadre ambre** (§D14), une trame ambre
de même famille (7 %) qui **dérive lentement** — 12 s par cycle, linéaire, continue.

> 🔴 **Une dérive, JAMAIS un clignotement.** Un fond qui pulse est une **alarme**, et l'alarme est
> exactement le registre refusé quelques heures plus tôt quand le rouge et le mot « retard » ont
> été écartés (§D14). Réintroduire l'alarme par l'animation aurait défait la décision par la porte
> de derrière. Le mouvement est à vitesse constante, sans pic d'intensité : il attire l'œil sans
> presser l'enfant. Un test interdit `pulse`, `ping`, `bounce`, `blink`, `flash`.

⚠️ **`motion-safe:` — sous `prefers-reduced-motion`, la trame RESTE mais cesse de bouger.** Elle ne
disparaît pas : c'est un signal, pas un ornement.

⚠️ **Le décalage d'animation est un multiple exact du pas de la trame** (14 px = 2 × 7 px), sans
quoi le motif sauterait visiblement à chaque bouclage.

**L'opacité de la trame : 7 % → 18 %, et le premier chiffre était SUPPOSÉ, pas mesuré.**
Le commentaire d'origine affirmait qu'au-delà de 7 % « le texte perdrait son contraste ». Le
commanditaire a répondu *« pas très visible, augmente le % »* — et le calcul lui a donné raison :

| Trame | Crête du fond | Corps du toast (`#e8ecf8`) | Texte atténué (`#8b95b5`) |
|---|---|---|---|
| 0 % | `#1b2440` | 13,4:1 | **4,5:1** — au plancher AA exact |
| 7 % | `#2b2f3e` | 11,3:1 | 4,5:1 |
| **18 %** | `#43403b` | **8,6:1** ✓ | **3,5:1** ✗ |

> 🔴 **Le vrai plafond n'était pas celui du corps du texte — c'est celui du texte ATTÉNUÉ, et il
> était déjà atteint AVANT toute trame.** `zetis-muted` est à **4,5:1 pile** sur
> `zetis-surface-2` : la moindre trame le fait passer sous AA. Monter l'opacité sans toucher au
> texte aurait donc gagné en visibilité ce qu'on aurait perdu en lisibilité — sur l'écran d'un
> enfant, et sur la seule ligne qui dit la matière.
>
> **La trame ne monte donc pas seule : elle emmène la couleur du texte avec elle.** Sous
> « à reprendre », le texte atténué passe de `zetis-muted` à `slate-300` — **6,9:1** au-dessus de
> la crête. C'est la borne réelle, et elle est calculée, pas devinée.

> **Note de portée** : la règle *« aucune pulsation »* du §12.2 concerne le **badge de nouveauté
> de la sidebar** (forme ADR-0030), pas toute surface. Elle n'a donc pas été révoquée ici — mais
> son esprit est ce qui a fait choisir la dérive plutôt que la pulsation.

#### D17. « En retard » est dit — révocation partielle du §7

**Demande du commanditaire, 2026-08-17**, après avoir vu l'ambre à l'écran :
*« toast en retard : animer le cadre et un badge "en retard" sur le toast »*, puis
*« cadre coloré sur badge en retard »*.

🔴 **Ceci révoque le §7 sur un point précis, et un seul.**

> §7, interdits transverses : *« aucun rouge, aucun **"en retard"**, aucun compteur d'arriéré »*.

⚠️ **C'est un revirement du commanditaire sur sa propre décision de la même journée.** Quelques
heures plus tôt (§D14), la doctrine lui avait été posée et **il avait lui-même écarté le mot** au
profit de l'ambre et de « à reprendre ». Il l'a ensuite redemandé explicitement. C'est sa
décision ; elle est écrite ici pour qu'elle ne se lise pas comme une dérive.

**Ce qui est rendu, sur un jour passé portant une échéance non faite** :

| | |
|---|---|
| Badge, en tête du toast | **« EN RETARD »**, ambre, avec **cadre** |
| Cadre du toast | ambre, qui **respire** (3 s, `ease-in-out`, 45 % → 85 %) |
| Fond | trame ambre 18 % qui **dérive** (12 s, linéaire) |
| Sur la ligne concernée | « · à reprendre » — **conservé** |

**Ce qui N'EST PAS révoqué, et la liste compte autant que la révocation** :

1. 🔴 **Le ROUGE reste interdit.** Seul le *mot* a changé de statut. Le badge, le cadre et le
   fond sont ambre. Un test balaie tout le rendu — classes Tailwind `red`/`rose` **et** valeurs
   hex/rgb.
2. 🔴 **Le reste du champ lexical du reproche reste banni** : « oublié », « manqué », « raté »,
   « pas fait », « nul », « échec ». Le §7 n'est entamé que sur `en retard`.
3. 🔴 **Aucun compteur d'arriéré.** Le badge dit un ÉTAT, jamais un nombre : ni « 2 en retard »,
   ni « 1 sur 2 ». Verrouillé par le test « aucune mesure » du §D12.
4. **« à reprendre » survit** sur la ligne de l'item. Le badge nomme l'état du **jour**, le mot
   nomme ce qu'il reste à **faire** — deux registres qui cohabitent, l'un ne remplace pas l'autre.
5. La règle du `CLAUDE.md` (*« l'absence de formulation humiliant l'enfant »*, vocabulaire
   « notion à renforcer » / « prochaine étape ») **n'est pas touchée** : elle ne nommait pas
   « en retard ». C'est le §7 de cet ADR qui le faisait, et lui seul est amendé.

> 🔴 **La dérive du fond n'a d'abord RIEN animé du tout, et aucun test ne pouvait le voir.**
> Elle translatait le fond de `(14px, 14px)` — même signe. Or la trame est un
> `repeating-linear-gradient(45deg, …)` : ses rayures sont perpendiculaires à l'axe du dégradé,
> et une translation de `(dx, dy)` décale la phase de `dx·sin45 − dy·cos45`. **Avec `dx = dy`,
> ce décalage vaut exactement zéro** : le motif se superposait à lui-même.
>
> L'animation était pourtant *déclarée*, `running`, avec la bonne durée — le navigateur la jouait
> fidèlement, et elle ne produisait rien. La classe CSS était juste, les keyframes existaient :
> **le test qui vérifiait la chaîne de classes passait au vert sur une fonctionnalité morte.**
> Corrigé en `(20px, −20px)` — 4,04 périodes, couture de 0,28 px au bouclage. Un verrou rejoue
> désormais **l'arithmétique** sur le CSS réel, parce que c'était le seul angle qui la voyait.
>
> ⚠️ **Le panneau de prévisualisation ne pouvait pas trancher non plus** :
> `document.visibilityState` y vaut `"hidden"`, et le navigateur n'avance pas la timeline d'un
> document masqué — `currentTime` restait à 0. C'est `getAnimations()` puis le calcul, pas
> l'œil, qui ont identifié le défaut.

**Sur les animations** — deux, et elles ne disent pas la même chose : le **fond dérive** (texture,
sans temps fort), le **cadre respire** (appel). L'amplitude du cadre reste faible et le fond reste
linéaire : **deux animations qui pulseraient ensemble feraient un stroboscope**. Un test interdit
`pulse`, `ping`, `bounce`, `blink`, `flash`. `motion-safe:` partout — sous
`prefers-reduced-motion`, rien ne bouge et les deux signaux restent.

> **Le verrou de registre a été INVERSÉ, pas supprimé** (`AgendaDayToast.test.tsx`), et son corps
> conserve l'ancienne raison, barrée. Jurisprudence de l'Amendement 7 : *« un test inversé qui ne
> dit pas pourquoi est un test perdu »*.

> **Le signal qui dirait qu'on s'est trompé** : Massimo évite la vue mois, ou cesse de survoler
> les jours passés. Le mot « retard » est celui que la doctrine d'origine a écarté parce qu'il
> fait venir par la peur — c'est le même motif qui a fait retirer la série le 2026-07-27.
> ⚠️ Non mesuré : il se regarde, il ne s'alerte pas.

#### D18. Le retard sort du toast et entre dans la grille — révocation du §D3

**Demande du commanditaire, 2026-08-17** : *« cadre halo animé il faut. les cases des dates de
devoirs en retard doivent aussi être de la même couleur. »*

**a) Le cadre du toast reçoit un HALO** qui respire avec lui — `0 0 22px −2px` d'ambre à 40 %, en
phase avec la bordure (3 s).
⚠️ **L'ombre portée sombre est recopiée dans les deux étapes des keyframes** : animer
`box-shadow` REMPLACE la valeur de la classe `shadow-xl`, et l'omettre aurait fait perdre au
toast sa profondeur — il se serait collé au calendrier.

**b) Les CELLULES d'un jour passé portant une échéance non faite passent en ambre.**

> 🔴 **Ceci révoque le §D3** — *« dans la grille, l'état de complétion ne prend AUCUN canal »* —
> et avec lui le motif d'origine du §7. La distinction que §D3 défendait était exactement
> celle-ci : **un toast est ponctuel, mais une couleur répétée sur trente cellules d'un mois EST
> le compteur d'arriéré**, lisible d'un seul balayage du regard. C'est le cas que toute la
> doctrine protégeait, et c'est celui qui est ouvert ici. Décision du commanditaire, écrite comme
> telle — pas un effet de bord.

**Ce qui tient encore, et qui devient la dernière ligne :**

1. 🔴 **AMBRE, jamais rouge.** Même famille que le badge et le cadre du toast. Le rouge reste
   interdit sur toutes les surfaces de Massimo — un test le balaie sur toute la grille.
2. 🔴 **STATIQUE dans la grille.** Le toast a le droit de respirer parce qu'il est **seul à
   l'écran** ; trente cellules qui pulseraient ensemble seraient un champ stroboscopique.
   **L'animation reste la marque de la surface qu'on a demandée, jamais de celle qu'on balaie.**
   Verrouillé par un test sur l'absence de `animate-`, `animation:` et `motion-safe:`.
3. **Aucun compteur.** La cellule dit un état, jamais un nombre.
4. Un jour passé **soldé** n'est pas en retard : il garde sa hachure pleine (§D11).

> **Le signal qui dirait qu'on s'est trompé** : Massimo cesse d'ouvrir la vue mois, ou la referme
> aussitôt. Une grille où le regard tombe d'abord sur ce qui manque est une grille qu'on évite —
> c'est précisément le raisonnement qui avait fait écarter la vue mois au §Alternatives, puis
> interdire l'état de complétion au §D3. Les deux sont désormais révoqués ; il ne reste plus de
> garde doctrinale entre l'agenda et un tableau de bord de l'arriéré, seulement l'ambre et
> l'absence de compteur. ⚠️ Non mesuré : cela se regarde.

---

#### D19. Un aperçu tient dans la place qu'il a

**Défaut signalé par le commanditaire, 2026-08-17** : *« calendar en mode ligne les toast sont trop
vers le haut et je ne lis pas retard par ex. »*

**Ce n'était pas une question de goût : le toast sortait de l'écran, et c'est le haut qui sortait**
— donc le jour et le badge « En retard », les deux premières lignes.

Mesuré sur la bande, jour du 14 août, fenêtre de 856 px :

| | |
|---|---|
| Hauteur réelle du toast | **469 px** |
| `top` calculé | **−149 px** |
| Hors écran | les 149 px du **haut** |

**Deux causes, et la seconde rendait la première insoluble.**

**a) Un seuil qui SUPPOSAIT la hauteur.** Le côté se décidait par `ancre.top > 220` — un nombre
écrit à la main, qui parie que le toast fait au plus 220 px — et rien ne le rabattait ensuite dans
la fenêtre.

> ⚠️ **Le défaut ne pouvait se voir que sur la BANDE.** Elle vit à ~330 px du haut ; la grille mois
> descend bien plus bas et avait toujours la place. **Un seuil constant ne peut pas servir deux
> surfaces situées à des hauteurs différentes** — c'est la supposition qui était fausse, pas le
> chiffre. Même famille d'erreur que le plafond d'opacité « 7 % » du §D16, supposé et non mesuré,
> démenti dans la même journée.

**b) Le toast était plus grand que toute place disponible.** Autour d'une cellule de bande il reste
320 px au-dessus et 429 en dessous. À 469 px, il sortait **par construction**, quel que soit le côté
retenu. Corriger le placement seul n'aurait fait que **déplacer la coupe**.

**Ce qui est décidé, et devient opposable :**

1. 🔴 **Un placement ne se décide jamais sur une hauteur supposée.** La hauteur se mesure
   (`useLayoutEffect`, donc corrigée **avant peinture**), et sans tableau de dépendances : le
   contenu grandit en cours de vie, quand le détail des matières arrive.
2. 🔴 **Le bord HAUT d'un aperçu est intangible.** Ordre : au-dessus si ça tient, sinon au-dessous
   si ça tient, sinon le côté le plus large — et dans tous les cas un plancher à la marge. Quand
   rien ne tient, **c'est le bas qui se coupe** : on perd la fin des traces, jamais le jour dont on
   parle.
3. **Un aperçu ne peut pas être plus grand que la place autour de ce qu'il commente.** Plafond de
   trois entrées par registre — le même 3 que les glyphes d'une cellule — et deux lignes par
   matière (notion, forme), chacune rognée à une ligne.
   ⚠️ **Le débordement se marque par une ellipse, jamais par un nombre** : « +2 matières » serait un
   compte, et un compte de ce qu'on a travaillé est exactement ce que le §7 interdit.
4. Notions et formes sont **deux lignes séparées**. Jointes, le rognage donnait « Thalès … —… » —
   l'ellipse du plafond, puis le tiret, puis celle du navigateur — et surtout **la forme
   disparaissait derrière une liste de notions trop longue**, alors que c'est elle que le
   commanditaire a demandée nommément (*« et sous quelles formes »*).

**Rien n'est perdu** : le panneau du jour, ouvert d'un tap, montre tout. C'est le contrat du §D12 —
*survoler donne un aperçu, taper ouvre le détail*.

> **Verrou** : trois tests injectent la hauteur (**jsdom ne met rien en page** — `getBoundingClientRect`
> y rend des zéros, donc un test naïf passerait identiquement sur le code fautif et sur le corrigé,
> exactement comme le test de dérive du §D16). Sabotage joué : le seuil `> 220` remis, les trois
> rougissent.

---

### §R — Ce qui est révoqué, nommément

**R1 — §Alternatives, puce « Vue mois / calendrier ».**
> *« Écarté. Une grille qui s'archive rend les trous visibles, et un trou visible est une
> culpabilité — même motif qui a fait retirer la série le 2026-07-27 (ADR-0024 §5). »*

Révoqué par décision du commanditaire. **L'argument n'est pas déclaré faux** : il est pesé contre
un défaut mesuré (le samedi 15 août) et il perd. Le §B1 en conserve la moitié qui tient.

**R2 — §6, note du 2026-07-29**, en ce qu'elle borne le regard arrière :
> *« Le regard en arrière reste borné à 3 jours : un passé qu'on parcourt rend les trous visibles,
> motif qui a fait écarter la vue mois, et qui met le scroll arrière au-delà hors périmètre. »*

Le « hors périmètre » tombe. **L'amplitude de la bande, elle, ne bouge pas** (3 / 10) : c'est une
seconde vue qui ouvre l'arrière, pas la bande qui s'étire.

**R3 — §6, asymétrie passé / futur sur les échéances.**
> *« Un jour passé n'a plus d'échéance à annoncer. »*

Un jour passé annonce désormais ce que l'école demandait — **sans jamais dire ce qui a été coché**
(D3). ⚠️ **Deux endroits, pas un** : le serveur vide `fixed_items` sur le passé
(`agenda/service.py:342-349`) **et** `AgendaWeekStrip.tsx:48` **rejoue la règle côté client**
(`day.offset >= 0 ? … : []`), avec un commentaire qui explique pourquoi. Ne corriger que le serveur
**ne produirait aucun changement visible** — le piège est armé et documenté.

**R4 — l'interdiction de remontée du journal d'activité chez Massimo**, en tête de
`apps/backend/app/modules/activity/router.py` :
> *« Rien de ce tracking ne remonte dans l'interface de Massimo — un enfant chronométré travaille
> pour le chronomètre. »*

Révoquée **et bornée dans le même geste** : remontent les **natures, matières et notions** ;
ne remontent **jamais** les minutes, le XP, l'horodatage, le score, ni aucun agrégat (D2, D5).
La phrase reste vraie de tout ce qu'elle protégeait vraiment : ce qui fait travailler pour le
chronomètre, c'est le chronomètre — pas le nom de ce qu'on a fait.

**R7 — §D3, « l'état de complétion ne prend aucun canal dans la grille ».**

Révoqué par D18 : les cellules d'un jour passé non fait passent en ambre. 🔴 C'était la garde
qui distinguait *le toast* (ponctuel) de *la grille* (trente cellules balayées d'un regard) —
la distinction est levée. Ce qui subsiste : ambre et non rouge, statique et non animé, aucun
compteur.

**R6 — §7, interdits transverses, sur le seul mot « en retard ».**

> *« Interdits transverses sur les surfaces Massimo : aucun rouge, aucun **« en retard »**, aucun
> compteur d'arriéré, aucun total, aucune série. »*

Révoqué **uniquement sur `en retard`**, par D17, et uniquement sur le badge du toast d'un jour
passé non fait. 🔴 **Le rouge, le compteur d'arriéré, le total et la série restent interdits**,
et le reste du champ lexical du reproche aussi (« oublié », « manqué », « raté », « échec »).
Voir D17 pour la liste de ce qui survit — elle est plus longue que la révocation.

**R5 — §6, tableau « Trois horizons, trois surfaces », troisième ligne.**

| Horizon | Surface | Contenu |
|---|---|---|
| ~~Ce qui arrive~~ | ~~bas de `/agenda`~~ | ~~contrôles et rendus **seulement**, max 4, horizon 21 j~~ |

Révoqué par D8. Mais la révocation porte sur **la surface, pas sur l'horizon** :

> **Le troisième horizon quitte `/agenda`, il ne quitte pas le produit.** « Ce qui arrive » vit
> désormais sur le **bandeau d'Accueil** (`bannerUpcoming`, plafonné à 2) et sur les **pages
> Matières** (`SubjectSideRail`, qui rend le même `UpcomingCard`). Les bornes serveur
> `agenda_upcoming_horizon_days` (21 j) et `agenda_upcoming_max` (4) **ne bougent pas** : elles
> servent toujours deux surfaces.

Ce que le §6 disait vraiment — *trois horizons distincts existent et ne doivent pas se
confondre* — reste entier. Ce qui tombe, c'est l'idée que les trois doivent tenir **sur la même
page** : la vue mois répond désormais à l'horizon lointain par la position dans la grille, sans
liste et sans décompte.

⚠️ **Les deux premières lignes du tableau §6 ne sont PAS rouvertes** : « Maintenant → Accueil,
aucune date affichée » et « La semaine → `/agenda`, bande glissante » tiennent — la seconde est
même confirmée par D7, qui fait de la bande la vue par défaut.

---

### §B — Ce qui est PRÉSERVÉ, et doit l'être explicitement

Sans cette section, la prochaine session révoquera le reste par entraînement.

**B1 — §7, « aucun réceptacle ». INTACT, et c'est la moitié qui survit à R1.**
Un jour sans trace **ne rend rien** : il est visuellement identique à un jour hors mois. Aucune
case grise, aucun point éteint, aucun rail en attente. Un gabarit dont certaines cases resteraient
vides serait un **décompte de jours manqués**, interdit « sous aucune forme » par ADR-0024 §5.
Ce que R1 révoque, c'est *l'interdiction de la grille* ; ce qu'il ne révoque **pas**, c'est
*l'interdiction du réceptacle*. Les deux étaient confondus dans la puce d'origine.

**B2 — §7, interdits transverses.** Aucun rouge, aucun compteur d'arriéré, aucun total, aucune
série. « À reprendre » garde son ambre doux et son plafond de 3.

> 🔴 **CORRECTION du 2026-08-17 — ce paragraphe contredisait R6 dans le même amendement.**
> Il recopiait la liste du §7 *mot pour mot*, « aucun **"en retard"** » compris, alors que R6, une
> quarantaine de lignes plus haut, venait de révoquer ce mot précis à la demande du commanditaire.
> Deux paragraphes opposés à quelques lignes d'écart, dans le document qui sert justement à trancher.
>
> ⚠️ **Le mécanisme est instructif, et il se reproduira** : §B a été écrit pour *« préserver
> explicitement, sans quoi la prochaine session révoquera le reste par entraînement »* — donc en
> recopiant la doctrine d'origine. Quand une révocation arrive **après**, la copie de sauvegarde
> devient une contre-vérité qui a l'air d'une décision. **Toute révocation doit être passée en revue
> contre le §B du même amendement**, sinon le §B ressuscite ce qui vient de tomber.
> Le mot « en retard » est retiré de la liste ci-dessus ; **le reste du champ lexical du reproche
> (« oublié », « manqué », « raté », « pas fait », « échec ») demeure interdit**, et R6 borne
> l'autorisation au seul badge du toast.

**B3 — ADR-0024 §5.** Aucun capital perdable. La grille mois **n'agrège rien** : pas de total de
mois, pas de « X jours travaillés », pas de dégradé d'intensité par jour.
🔴 **La grille mois n'est pas une heatmap.** La heatmap reste chez Papa, où le §Alternatives la
loge et où elle est un outil d'analyse.

**B4 — §3, l'agenda reste non probant.** **Cocher un devoir ne fabrique jamais une trace.**
`NON_ACTIVITY_EVENTS` / `NON_WORK_EVENTS` restent deux listes distinctes, et le choix de la
seconde pour les traces n'est pas rouvert.

**B5 — ADR-0002.** La grille mois est une surface **de Massimo**. Elle n'emprunte rien à
`MonthCalendar.tsx` de Papa, qui fabrique des cellules de mois voisins et affiche des sessions.

**B6 — §14.6.** Aux bornes de navigation, **le chevron disparaît, il n'est jamais grisé** —
*« un bouton mort se lit comme une panne »*.

**B7 — §4, règle de datation. INTACTE, et D9 ne l'entame pas.**
*« Le calendrier n'accueille que ce qui a une date dans le monde réel. ZETIS ne se donne jamais
rendez-vous à lui-même. »* Le sous-titre change la **voix** de la page, jamais la **source** des
dates : aucune carte SRS, aucune mission n'entre dans une surface datée. Le test-verrou
`test_dated_surfaces_never_contain_missions_or_srs_cards` reste vert et reste l'autorité.

---

### §C — Le conflit de couleurs, et son coût assumé

L'arbitrage « teinte = matière » met la palette de `subjectColors.ts` en collision avec la
sémantique en place. Quatre collisions, quatre résolutions :

| Collision | Résolution |
|---|---|
| physique-chimie `#22d3ee` **=** cyan « aujourd'hui » | **séparation de rendu** : le cyan d'aujourd'hui ne colore **jamais un glyphe** — il vit sur le numéral, la bordure 1 px et un **halo flouté** (`box-shadow` repris verbatim de `AgendaWeekStrip.tsx:61`). Un aplat et une lueur ne se confondent pas, même à teinte égale |
| SVT `#34d399` ≈ émeraude « trace / fait / papa » | **collision dissoute** : l'émeraude **cesse d'être la couleur de la trace**. Une trace devient un segment teinté par **sa matière** — ce que le commanditaire demande précisément. L'émeraude reste sur la coche et la puce « ajouté par papa », qui n'entrent ni l'une ni l'autre dans la grille |
| histoire-géo `#fbbf24` ≈ ambre « à reprendre » | **dissoute par périmètre** : aucun ton sémantique n'entre dans une cellule. L'ambre est le ton d'une **carte**, pas d'un glyphe de 9 px |
| anglais `#a78bfa` ≈ violet du plan `✦` | **dissoute par suppression** : le `✦` quitte la cellule (D6-b). Le violet reste sur le bloc « ✦ Ton plan », où aucune teinte de matière ne le concurrence |

**Le coût, mesuré et posé pour qu'il ne soit pas redécouvert comme un défaut.** La palette des 8
matières **n'est pas sûre entre ses propres membres** en deutéranopie : maths et physique-chimie
convergent, SVT et histoire-géo convergent, français et espagnol convergent. C'est un fait de la
palette **existante**, pas de cette décision — mais cette décision en dépend davantage.

**La borne** : dans la grille, la teinte **accélère**, elle n'identifie pas. Ce qui est
conséquent — *est-ce un contrôle ?* — passe par la **silhouette**, entièrement sûre. L'identité de
matière se lit dans le panneau, à 18 px, avec le pictogramme **et le nom écrit**, et chaque cellule
porte un `aria-label` qui **énumère les matières en toutes lettres**. Le mode de défaillance est
« il me faut un tap pour distinguer maths de physique », jamais « je perds une information ».
L'écran « Daltonisme » de la maquette rend ce coût **visible, et non seulement affirmé** — et il
montre aussi que la **structure** (pleins/contours, silhouettes, segments, marqueur du jour) reste
intégralement lisible sous simulation.

---

### §M — Ce que la maquette a démenti

Le cadrage annonçait une cellule de **46 × 52 px** à 375 px. **Mesuré dans le DOM : 42,4 px** — donc
**sous le plancher tactile de 44 × 44** (WCAG 2.1 AA, HIG 44 pt). Le calcul du cadrage comptait
`375 − 40` (gouttière de `.app`) et **oubliait la gouttière propre de la carte mois**.

Repasser au-dessus a demandé **deux** réglages, et **aucun ne suffisait seul** :
- la carte mois tombe sa gouttière de 12 px à **8 px** sous 420 px ;
- la grille tombe son `gap` de 2 px à **1 px**.

Mesure finale : **44,1 × 62 px**. À reporter tel quel dans l'implémentation — c'est un plancher
d'accessibilité, pas un goût. La maquette affiche la mesure en clair, recalculée à l'affichage.

> ⚠️ **Leçon de méthode, pas anecdote.** Un chiffre de gabarit annoncé dans un cadrage est une
> **estimation** tant qu'il n'a pas été lu dans le DOM. Celui-ci était faux de 4 px, du mauvais
> côté d'un seuil normatif, et aucune relecture de texte ne l'aurait attrapé.

---

### §O — Points ouverts, à trancher avant la slice concernée

> **O1 et O2 ont été tranchés par le commanditaire le 2026-08-17**, le lendemain du cadrage, après
> lecture de la maquette : **bande par défaut** (→ D7) et **suppression de « Ce qui arrive »**
> (→ D8, R5). Ils sont conservés ici barrés plutôt que supprimés — un point ouvert qui disparaît
> sans trace laisse croire qu'il n'a jamais été une question.
>
> ~~**O1 — Quelle vue est le défaut ?**~~ → **D7 : la bande**, sélecteur persisté.
>
> ~~**O2 — « Ce qui arrive » survit-elle ?**~~ → **D8 : elle quitte `/agenda`.**
> ⚠️ L'argument que portait O2 — *« laisserait `GET /upcoming` sans consommateur »* — **était
> faux** : la route a trois appelants, et deux survivent. Le périmètre exact est en D8, et il est
> beaucoup plus étroit que ce que ce point ouvert laissait entendre.

**O3 — Les vacances : hors périmètre, faute de donnée.** `SchoolYear` porte `starts_on` / `ends_on`
et rien d'autre : ni table de vacances, ni jours fériés. Le traitement est **dessiné** dans la
maquette (un filet continu sous la rangée de semaine, plus un libellé en marge — jamais une
décoration par cellule : les vacances sont une **période**, pas une propriété d'un jour), mais il
n'a aucune source. **Source recommandée quand elle viendra : saisie Papa** (une ligne : du … au …,
libellé). Surtout pas un import de calendrier officiel — le §Alternatives a tranché contre
Pronote / ENT sur un motif local-first qui vaut ici mot pour mot.

**O4 — Les mindmaps et les capsules n'émettent aucun événement.** `modules/mindmaps/` ne contient
aucun appel à `log_learning_event`. Cours, fiches, quiz, révision SRS et ELI5 sont tracés ; les
mindmaps — **nommées explicitement par le commanditaire** — ne le sont pas. Les instrumenter est
un ajout de vocabulaire d'événement, petit mais **transverse** : il touche le journal de Papa, et
⚠️ **les deux constantes de `production/triggers.py`**, dont le `.get(kind, 9)` est un piège déjà
documenté. À arbitrer comme une slice à part.

---

### §S — Les signaux qui diraient qu'on s'est trompé

- **Massimo ouvre la vue mois pour la refermer aussitôt, ou ne l'ouvre jamais.** La grille serait un
  décor, et la plainte d'origine portait sur autre chose (probablement sur « La suite » repliée,
  défaut f). Réponse : regarder O1 avant de toucher à la grille.
- **Il balaie le mois en arrière et s'arrête sur les jours sans marque.** Ce serait le §Alternatives
  qui avait raison, et B1 ne suffirait pas. Réponse : la vue mois redevient bornée au mois courant,
  sans révoquer D2 — le récit du jour passé, lui, n'a jamais été en cause.
- **« Ce que tu as travaillé » se met à ressembler à un bilan** — quelqu'un ajoute un compte, un
  tri par volume, une durée. Le glissement se fera par petites touches utiles ; D2-1 et D2-2 sont
  écrits pour être **cités contre** ces touches-là.
- ⚠️ **Aucun de ces trois n'est mesuré.** Ils se regardent, ils ne s'alertent pas.

---

### §I — Mise en œuvre (slice de code, session suivante, sur branche)

1. **Types + contrat** : `AgendaTrace`, `AgendaDay.traces` **remplacé**, `AgendaDayTraces`.
   Rien ne compile — c'est voulu, ça borne le chantier.
2. **Serveur** : `trace_subjects_by_day` remplace `traces_by_day` ; `week()` cesse de vider
   `fixed_items` sur le passé ; route `days/{date}/traces` + schéma + **test-verrou d'absence de
   champs** sur le JSON sérialisé.
3. **Serveur, mois** : `GET /api/student/agenda/month?anchor=` — 42 jours, fenêtre d'items élargie
   pour les plans, effet de bord de `get_or_create_plan` **borné explicitement**.
4. **Primitives partagées** (`packages/ui`) : le glyphe (silhouette × plein/contour × teinte ×
   taille) et le segment de trace. **Un seul endroit, deux vues.**
5. **`AgendaMonthGrid`** neuf ; **`AgendaWeekStrip`** refondu (défilement snappé, `✦` retiré,
   glyphes de plan) ; **retrait du rejeu client de l'asymétrie** (R3).
6. **`AgendaDayPanel`** enrichi ; `AgendaItemRow` : `subjectColorFor`, `▬ leçon`, cibles tactiles.
7. **`AgendaPage`** : sélecteur de vue (**bande par défaut**, choix persisté — D7), sous-titre
   réécrit, **retrait de « La suite » et de « Ce qui arrive »** (D8).
   🔴 **Ne supprimer NI `UpcomingCard.tsx`, NI son test, NI `GET /upcoming`, NI
   `AgendaUpcomingItem`** — `SubjectSideRail`, `HomeAgendaBanner` et `useSubjectUpcoming` les
   consomment toujours. Seuls la section et le champ `upcoming` de `useAgenda` partent. Un test
   qui monte `MatiereDetailPage` et l'Accueil après ce retrait vaut mieux qu'un commentaire.
8. **Tests** : `AgendaWeekStrip.test.tsx` et `AgendaPage.test.tsx` **n'existent pas** — c'est le
   trou de couverture exactement sous cette refonte. Ajouter au minimum un verrou sur l'absence de
   « fois », « minutes », « XP » dans le rendu du panneau d'un jour passé.

---

### Voir aussi

- `docs/frontend-massimo/mockup/mockup-page-agenda-v2.html` — la maquette de référence (8 écrans)
- `docs/frontend-massimo/page-agenda.md` — la spec, mise au réel
- **Amendement 3** (les quatre `AgendaKind`) · **Amendement 6** (le jour ouvert sous la bande)
- `docs/decisions/adr-0024-progression-massimo.md` (§5 — préservé, cf. B1/B3)
- `docs/decisions/adr-0050-le-plan-de-preparation.md` (les trois `AgendaPlanStepKind`, fusionnés
  en contour dans la grille seulement — leurs marques propres restent dans le panneau)

---

## Amendement 9 — Trois questions, trois sections — 2026-08-17

### Statut

**Proposé — 2026-08-17.** Demande du **commanditaire**, le jour même de l'Amendement 8.

> **RÉVOQUE §D8**, décidée quelques heures plus tôt dans ce même document, et **BORNE §4 / §B7**
> sans les révoquer. Les deux sont nommées au §R.

---

### La demande, dans ses mots

> *« L'agenda doit répondre à trois questions : 1 — passé : quels sont les devoirs en retard.
> 2 — présent : les devoirs en cours. 3 — futur : m'avancer sur mes devoirs et révisions. »*

**Deux des trois questions ont déjà une réponse ; la troisième n'en a aucune.** Le présent est
servi par « Aujourd'hui » et « Demain » ; le passé par « À reprendre », plus l'ambre de la grille
(§D18). Le futur, lui, n'a **plus aucune surface sur `/agenda`** : « Ce qui arrive » en est partie
le matin même (§D8), et « La suite » avec elle.

> ⚠️ **Le trou est donc de ma main, et il date du jour même.** §D8 a supprimé la dernière surface
> du futur en tenant pour acquis que la grille y répondait « par la position ». Elle y répond pour
> *situer* — pas pour *agir*. Un jour à venir portant un cadre orange dit qu'il se passe quelque
> chose ; il ne dit pas **quoi faire d'ici là**.

---

### §D — Ce qui est décidé

#### D1. Trois sections empilées, dans l'ordre présent → passé → futur

**Arbitrage du commanditaire**, sur quatre formes proposées (onglets, pastilles-repères, colonnes).

| Ordre | Section | Question | État |
|---|---|---|---|
| 1 | « Aujourd'hui », « Demain » | *présent* | inchangées |
| 2 | « Prendre de l'avance » | *futur* | **neuve** |
| 3 | « À reprendre » | *passé* | inchangée ; 3 + « voir N autres ▾ » (§17.2) |

🔴 **L'ordre n'est pas décoratif : la première section est celle que Massimo voit en ouvrant la
page.** L'ordre chronologique (passé d'abord) a été écarté explicitement — il ferait ouvrir la page
sur le retard, ce que le §7 interdisait, et ce serait la **troisième** révocation dans le même sens
après §D17 (le mot) et §D18 (la couleur des cellules).

> 🔴 **CORRECTION du 2026-08-17, une heure après — l'ordre était présent → PASSÉ → futur, et il
> était mesurablement faux.** Le tableau ci-dessus est déjà corrigé ; voici pourquoi.
>
> Rendu à l'écran, le bloc du futur commençait à **1050 px** dans une fenêtre de **856** :
> entièrement sous la ligne de flottaison, derrière une grille mois de 493 px et un « À reprendre »
> de 403. Le commanditaire, qui venait de valider l'ordre, ne l'a pas trouvé : *« je ne vois pas où
> tu les as mis »*. **Une réponse qu'il faut chercher n'en est pas une** — c'est exactement le
> défaut de « La suite » (repliée par défaut, §S), déplacé de dix centimètres.
>
> ⚠️ **Ce que la correction ne change pas** : la page ne s'ouvre toujours pas sur le retard. Le
> présent garde la tête. **C'est le passé qui descend, pas le futur qui le double** — l'invariant
> du §7 tient, et c'est lui qu'un test verrouille, pas la position relative des deux autres.
>
> ⚠️ **Leçon générale, et elle est chère : une décision d'ORDRE ne se valide pas sur le papier.**
> Le raisonnement d'origine (« le retard doit rester visible sans défiler loin ») était juste dans
> l'absolu et faux en pixels, parce qu'il ignorait la hauteur de ce qui le précède. Même famille
> d'erreur que le seuil de placement du §D19 et que le plafond d'opacité du §D16 : **une grandeur
> supposée au lieu d'être mesurée.** Trois fois dans la même journée.

⚠️ **Dédoublonnage obligatoire sur `pickedDay`** (`withoutOpenDay`, déjà en place) : la section
supprimée par §D8 était *« la quatrième surface, et la seule non dédoublonnée »* — son ancre de plan
se retrouvait en double dans le DOM, ce que `getElementById` ne sait pas départager.

#### D2. Le bloc « Prendre de l'avance » est ANCRÉ, il n'est pas une liste de dettes

**Arbitrage du commanditaire.** Le bloc part de la **prochaine échéance** et propose les gestes qui
la préparent : son plan, une mindmap de **ce** chapitre, les cartes de **ce** chapitre, la mission
qui touche **cette** notion, la notion de ce chapitre encore fragile.

> 🔴 **La forme alternative — quatre listes empilées, une par source — a été écartée, et le motif
> est le §7 lui-même.** Quatre listes de choses à faire côte à côte **grossissent quand Massimo ne
> vient pas** : c'est la définition du compteur d'arriéré. Un bloc ancré a une taille bornée par
> construction, parce qu'il ne parle que d'une échéance.

**Une raison, pas quatre inventaires.**

#### D3. Aucun nombre, nulle part, et l'ancre nomme un jour

Ni `days_left`, ni `due_count`, ni score, ni total, ni « 3 cartes ».

🔴 **L'ancre nomme le jour — « vendredi 21 » — jamais « dans 4 jours ».** §D8 avait retiré la
section « Ce qui arrive » entre autres parce que `days_left` était *« le dernier décompte chiffré de
la page »*, remplacé par une distance spatiale. Le réintroduire ici viderait §D8 de son motif (ii)
tout en gardant sa révocation : le pire des deux.

⚠️ **Deux pièges de source, tous deux documentés dans le code qu'ils concernent :**

1. **`due_count` est l'arriéré** — `memory/schemas.py` dit lui-même que le nombre affichable est
   `session_size`, jamais `due_count`, *« la pression quotidienne interdite par le `CLAUDE.md` »*.
   Ici on n'affiche **ni l'un ni l'autre** : une porte, pas un compte.
2. **`mastery_score` n'atteint jamais Massimo** (ADR-0024 §5, verrou sur `PanoplyNotionOut`). La
   notion fragile se dérive du **statut** galaxy `weak`, jamais d'un score.

#### D4. Un geste n'est servi que si sa cible existe

**C'est le serveur qui tranche, pas le client.** Aucune porte vers une page vide, aucun chevron
grisé — §B6, *« un bouton mort se lit comme une panne »*.

⚠️ **Deux sources n'ont pas la donnée qu'on croirait :**

- **Les mindmaps n'ont aucun signal « à reconstruire »** côté élève, et il ne faut pas en fabriquer
  un : le seul matériau disponible (`attempt_count`, `avg_score`) est **explicitement interdit chez
  Massimo** par le schéma lui-même. Le geste proposé est donc *« reconstruire la mindmap de ce
  chapitre »* quand elle existe — une façon de travailler, pas une dette.
- **« Notions à renforcer » n'existe pas côté élève** : `to_reinforce` (`progress/analysis.py`) est
  derrière `require_parent`. D'où la dérivation par statut `weak` du D3.

#### D5. Sans échéance à venir, le bloc RÉPOND quand même

`anchor: null` → une phrase, plus la rangée de portes, **aucune liste**.

> C'est la leçon du toast muet du 2026-08-17 : *un vide confirmé est une réponse, un silence n'en
> est pas une.* Un bloc qui disparaît se lit comme une panne — le dépôt l'a déjà tranché deux fois
> (addendum §17 pour le panneau, §D15 pour le toast).

⚠️ **Et ce n'est pas un réceptacle** (§B1) : une phrase et des portes ne sont pas des cases vides en
attente d'être remplies.

#### D6. Le contrat serveur — un agrégat, pas cinq allers-retours

`GET /api/student/agenda/ahead` :

```
AheadOut
  anchor: { item_id, label, subject{slug,name,color}, kind, due_on, chapter_id, skill_id } | null
  gestes: [ { kind: "plan"|"mindmap"|"revision"|"mission"|"renforcer", label, route } ]
```

Sans agrégat, la page passerait de **3 appels réseau à 7**.

🔴 **Ne PAS greffer sur `news/summary`.** Sa doctrine écrite interdit d'y compter du **dû** : un
témoin de nouveauté meurt d'un regard, une dette grossit quand Massimo ne vient pas. Mais **le
patron de registre est le bon** — `NEWS_SOURCES` (`news/service.py`), un dict `clé → fonction`, une
fonction par geste : à recopier, pas à étendre.

⚠️ `get_or_create_plan` a un **effet de bord en écriture**. Il est déjà borné pour `/week` et
`/month` ; `/ahead` doit l'être de la même façon.

#### D7. Les trois registres se voient — et leur code vient du calendrier

**Demande du commanditaire, 2026-08-17**, en même temps que la correction d'ordre : *« avec une
amélioration visuelle de présent futur passé »*.

Les quatre sections étaient typographiquement **identiques** : même petite capitale, même teinte
d'accent. Rien ne disait qu'elles répondaient à trois questions différentes — la structure existait
dans l'ordre, pas à l'œil.

**Chaque section porte un rail de 2 px à gauche de son titre**, et sa teinte dit son registre :

| Registre | Teinte | D'où elle vient |
|---|---|---|
| présent | cyan | **le cadre d'aujourd'hui** dans la bande — « on est ici dans le temps » |
| futur | orange | **`CADRE_A_VENIR`**, le cadre des cellules à venir (§D13) |
| passé | ambre | **`CADRE_EN_RETARD`**, les jours passés non faits (§D18) |

🔴 **Aucune couleur neuve, et ce n'est pas une économie : c'est le fond du sujet.** Les trois
teintes disent DÉJÀ ces trois choses dans le calendrier, dix centimètres plus haut. Les réemployer
fait que **les deux moitiés de la page se répondent** au lieu de coexister — Massimo n'a pas un
second code à apprendre, il relit le premier. Une quatrième palette aurait ajouté du vocabulaire
pour dire ce qui était déjà dit.

⚠️ **Deux des trois sont littéralement les constantes du calendrier**, importées, pas recopiées :
une teinte dupliquée diverge au premier réglage. Seul le cyan est écrit à part, parce que la bande
le porte par une classe Tailwind et non par une constante — et il est **plus pâle** que celui d'une
cellule, pour que la cellule d'aujourd'hui reste la marque forte.

🔴 **Un rail, jamais un aplat.** Un fond teinté sur « À reprendre » ferait un bloc ambre permanent
en bas de page — **le compteur d'arriéré du §7, obtenu par la surface au lieu du nombre**. C'est la
même frontière que §D18 tenait pour les cellules : une teinte qui marque, jamais une qui pèse.

⚠️ **Le titre garde sa couleur d'origine sur les trois.** Trois couleurs de titre feraient trois
voix pour une seule page ; c'est le rail qui porte le registre, pas le texte.

> **Verrou** : l'ordre des registres, leurs trois teintes distinctes, leur provenance
> (les valeurs exactes du calendrier), et **l'absence de rouge** balayée sur les trois.
> Sabotages joués : l'ordre remis à présent → passé → futur, et un rouge substitué à l'ambre.

#### D8. La grille mois ne mange plus tout le premier écran

**Demande du commanditaire, 2026-08-17** : *« corrige aussi la vue mois »*, après la correction
d'ordre du §D1 — qui n'avait résolu que la vue **bande**.

**Le budget, mesuré et non supposé** (fenêtre de 856 px, pointeur fin) :

| Bloc | Avant | Après |
|---|---|---|
| Carte de la grille | **493 px** | **385 px** |
| Cellule | 62 px | 48 px |
| « Aujourd'hui » commence à | 795 | **683** |
| « Prendre de l'avance » commence à | 1013 | **893** |

**Ce qui a été compacté**, et **uniquement au curseur** : la cellule (62 → 46 de hauteur minimale),
les chevrons de navigation (44 → 36), la gouttière d'en-tête et le rembourrage de la carte.

🔴 **Le discriminant est le POINTEUR, jamais la largeur.** Le plancher de 44 × 44 (WCAG 2.1 AA,
HIG 44 pt) existe pour un **doigt**. Une bascule sur `sm:` aurait écrasé les cibles d'une tablette
de 768 px, que l'on touche — c'est la règle déjà établie pour la bande (§D6-a). Vérifié à 375 px :
cellule **44,4 × 62**, chevron **44 × 44**. Un test verrouille l'**appariement** : toute valeur
compactée doit porter sa contrepartie `pointer-coarse:`, sinon le gain de place se paie en cibles
inatteignables sur l'appareil principal de Massimo.

> ⚠️ **Et ça ne suffit PAS — le reste est arithmétique, il faut le dire plutôt que le maquiller.**
> « Prendre de l'avance » commence à **893** pour une fenêtre de **856** : il manque **37 px**.
> Le compte est complet et il ne laisse aucune marge à récupérer :
>
> | | |
> |---|---|
> | Bandeau de profil (global, toutes pages) | 136 |
> | En-tête d'agenda (titre, sous-titre, sélecteur) | 146 |
> | Carte de la grille — six rangées, **déjà au plancher du contenu** | 385 |
> | « Aujourd'hui » | 150 |
> | « Demain », **vide**, qui dit « Rien de noté pour demain. » | 60 |
>
> La cellule ne peut pas descendre sous 46 px : c'est **exactement** la somme de son contenu
> (numéral 16 + registre des glyphes 12 + registre des traces 6 + rembourrage 12). Il n'y a plus
> de gras à couper dans la grille.
>
> 🔴 **Le seul levier restant coûte 60 px et il est DOCTRINAL, donc il n'est pas pris ici** : la
> section « Demain » vide occupe précisément ce qui manque, pour dire qu'il n'y a rien — alors que
> la grille, juste au-dessus, montre déjà la cellule de demain sans échéance. La retirer quand
> elle est vide alignerait « Aujourd'hui / Demain » sur « À reprendre », **qui ne se rend déjà pas
> quand elle est vide**. Mais c'est retirer une phrase de l'écran d'un enfant : ça se décide, ça
> ne se glisse pas dans un correctif de mise en page.
>
> En vue **bande** — le défaut (§D7 de l'Amdt 8) — la question ne se pose pas : le bloc commence à
> **641**, largement au-dessus de la ligne de flottaison.

#### D9. Le registre du passé s'appelle « En retard », et c'est un badge

**Demande du commanditaire, 2026-08-17** : *« À reprendre = passé : replace par en RETARD dans un
badge »*.

Le titre de section « À reprendre » devient un **badge ambre « En retard »**, de forme **identique**
à celui du toast (§D17) : cadre `amber-400/70`, fond à 15 %, capitales.

**Ce que ce choix de forme protège** : deux surfaces qui disent la même chose la disent pareil. Une
seconde forme pour un seul sens serait un second vocabulaire à apprendre — et c'est précisément le
reproche qu'on peut faire à une page qui accumule les codes.

🔴 **UN BADGE, PAS UN APLAT.** Le fond ambre est celui du badge — trois centimètres carrés — jamais
celui de la section. Un bloc ambre permanent en bas de page serait **le compteur d'arriéré du §7,
obtenu par la surface au lieu du nombre** ; c'est la même frontière que le §D7 tient pour les rails
et le §D18 pour les cellules. Verrouillée par un test.

> 🔴 **C'est la QUATRIÈME révocation du §7 dans le même sens, en une seule journée**, et il faut le
> compter à voix haute :
>
> | # | Ce qui tombe | Où |
> |---|---|---|
> | 1 | le mot « en retard » | badge du toast (§D17 / R6) |
> | 2 | l'état de complétion dans la grille | cellules ambre (§D18 / R7) |
> | 3 | l'ordre qui gardait le passé en deuxième | §D1, révisé |
> | 4 | le titre « à reprendre » | ce §D9 |
>
> **Ce qui reste du §7, et c'est tout ce qui reste** : aucun rouge, aucun compteur d'arriéré, aucun
> total, aucune série, aucun réceptacle. Le nombre n'apparaît toujours **que sur le bouton de
> dépliage**, et il disparaît une fois ouvert (§17.2).
>
> ⚠️ **Le §D14 disait l'inverse le matin même**, en citant la doctrine : *« c'est la doctrine
> pédagogique du produit, celle qui a déjà coûté le retrait de la série »*. Il est conservé au
> dossier, non effacé — une décision renversée reste une décision, et son motif reste lisible.
>
> **Le signal qui dirait qu'on s'est trompé** : Massimo cesse d'ouvrir `/agenda`, ou la referme
> sans défiler. ⚠️ Non mesuré : cela se regarde.

**Ce qui n'a PAS été changé, et qui est signalé plutôt que corrigé en silence** : le qualificatif
**par item** du toast dit toujours « · à reprendre » (§D14). Il n'a pas le même rôle grammatical —
il dit ce qu'il reste à faire sur *cet* item, là où le badge nomme un *registre*. La demande portait
sur le titre de section ; l'étendre au qualificatif serait une décision de plus, pas une conséquence
de celle-ci.

#### D10. Le badge « En retard » respire

**Demande du commanditaire, 2026-08-17** : *« anime RETARD pour le mettre en evidence »*.

Le badge du §D9 reçoit une respiration de **3 s, ease-in-out** — cadre 0,5 → 0,95, fond 12 % → 28 %,
et un halo ambre de 12 px.

> 🔴 **C'est l'exception qui confirme le §D18, pas son abandon.** Ce paragraphe posait :
> *« l'animation reste la marque de la surface qu'on DEMANDE, jamais de celle qu'on BALAIE »*, et
> il interdisait donc l'animation dans la grille — trente cellules qui pulseraient ensemble sont un
> champ stroboscopique. Ici il y a **un seul élément**, et il ne se balaie pas : il se lit.
> **Les cellules de la grille restent strictement statiques**, et le test qui l'assert n'a pas
> bougé d'une ligne.

**Trois bornes, toutes héritées du §D16 et du §D18** :

1. **Une respiration, pas un clignotement** — 3 s, ease-in-out, amplitude faible.
2. **`motion-safe:` obligatoire.** Sous `prefers-reduced-motion`, rien ne bouge et le badge garde
   son cadre et son fond ambre : **le signal survit sans le mouvement**. C'est un signal, pas un
   ornement.
3. **Keyframe distincte de celle du toast**, et ce n'est pas un doublon : `agenda-retard-respire`
   recopie l'ombre portée sombre de `shadow-xl` dans ses deux étapes — indispensable au toast qui
   flotte, absurde sur un badge, qui traînerait une ombre de panneau.

> **Verrou, et il a fallu deux tentatives.** Le test vérifie que le nom d'animation invoqué par la
> classe **est bien défini dans `index.css`** — le mode de panne réaliste étant une keyframe
> renommée avec la classe intacte, donc une animation morte et silencieuse.
> 🔴 **Ma première version de ce verrou est restée VERTE sous sabotage** : elle ancrait le nom avec
> `\b`, et un tiret est une frontière de mot — `agenda-retard-badge-ancien` passait le test. Le nom
> d'une keyframe est suivi d'une accolade : c'est elle qu'il faut ancrer. **Troisième fois de la
> journée qu'un test d'animation se révèle plus faible qu'il n'en avait l'air** (après le déphasage
> nul du §D16 et le `response_model` du verrou de quantités).
>
> L'interpolation réelle a été mesurée dans le navigateur : `getAnimations()` rend
> `agenda-retard-badge`, `running`, 3000 ms, et le fond échantillonné donne 0,20 → 0,28 → 0,20 sur
> 1,5 s. **Une classe ne prouve rien ; une valeur qui change, si.**

#### D11. « Demain » vide ne se rend plus — et l'asymétrie EST la décision

**Décision du commanditaire, 2026-08-17**, prise sur le levier chiffré exposé au §D8 : *« supprime
la section Demain quand elle est vide »*.

| | |
|---|---|
| « **Aujourd'hui** » vide | dit toujours *« Rien de noté pour aujourd'hui. »* |
| « **Demain** » vide | **ne rend plus rien** |

🔴 **L'asymétrie n'est pas une incohérence, c'est le contenu de la décision.** « Aujourd'hui »
informe sur **maintenant** — c'est ce que Massimo vient chercher en ouvrant la page. « Demain »
vide ne faisait que répéter, en **60 px**, un fait déjà visible : la cellule de demain, sans
échéance, juste au-dessus dans la bande ou la grille.

⚠️ **Ce n'est PAS une entorse au §17** (*« un vide confirmé est une réponse, un silence n'en est pas
une »*). Cette règle vaut pour les surfaces qu'on **demande** — le panneau d'un jour qu'on ouvre, le
toast qu'on survole — où le silence se lit comme une panne. Une section permanente n'est pas
demandée. Et « En retard » **ne se rendait déjà pas** quand elle est vide : c'étaient
« Aujourd'hui / Demain » qui faisaient exception, pas l'inverse.

> **Verrou** : « Demain » vide absente, « Aujourd'hui » vide **toujours** présente. Sans ce test,
> une session future harmonisera les deux — dans un sens ou dans l'autre, et de bonne foi.
> ⚠️ Le jeu de données du test d'ORDRE a dû recevoir une échéance à demain : sans elle il aurait
> vérifié l'ordre de trois sections en croyant en vérifier quatre.

**Le résultat, mesuré aux deux pointeurs** — c'était l'objet de la manœuvre :

| Vue | Curseur (800 × 856) | iPhone (375 × 812) |
|---|---|---|
| **bande** (le défaut) | « Prendre de l'avance » à **602** ✅ | **649** ✅ |
| **mois** | **833** ✅ (était 1013) | **1006** ❌ |

> 🔴 **Sur l'iPhone, en vue mois, le bloc reste sous la ligne de flottaison — et ce n'est pas
> rattrapable.** Le compactage du §D8 est conditionné au pointeur : au doigt, la cellule garde ses
> 62 px et les chevrons leurs 44, donc la carte fait **478 px** au lieu de 385. C'est un arbitrage
> assumé et pas un oubli : **une cible tactile atteignable vaut mieux qu'une section visible**.
> La vue par défaut est la bande (§D7), où le bloc est visible sur les deux appareils.

#### D12. Le toast d'alerte à l'ouverture — nouveau seulement, un par jour, une échéance nommée

**Décision du commanditaire, 2026-08-17**, sur trois arbitrages successifs.

| Question | Décision |
|---|---|
| Déclencheur | **du NOUVEAU retard seulement** — jamais l'arriéré existant |
| Persistance | **une fois par jour au maximum** |
| Texte | **UNE échéance nommée**, aucun nombre |

C'est le **cinquième** signal du retard sur cette page (cellules ambre, badge animé, toast de
survol, section, celui-ci). Ce qui le justifie malgré tout : la section « En retard » vit à 827 px,
sous la ligne de flottaison — un signal qu'il faut chercher n'en est pas un.

---

##### 🔴 Le blocage rencontré en read-before-code, et l'ajustement qui le contourne

**Le dépôt avait déjà refusé ce mécanisme, par écrit, à deux endroits.**

> *« UN horodatage PAR ÉLÈVE, jamais un `seen_at` PAR ITEM : joint à `done_at`, celui-ci
> fabriquerait la donnée persistée "vu le 12, jamais fait", lisible côté Papa par l'asymétrie de
> visibilité — la surveillance par la porte de service que l'ADR-0025 condamne, et un objet PIRE
> que le compteur qu'on évitait. **La granularité EST la protection.** »*
> — `db/models/user.py`, sur `agenda_last_seen_at`

> *« Ni `due_on` ni `done_at` n'entrent dans cette requête, et c'est le point entier — une échéance
> qui franchit sa date ne le bouge pas. »* — `agenda/service.py`, sur `new_agenda_count`

Savoir **quel retard est nouveau** demande naïvement une marque **par item**. Elle n'est pas posée.

**L'ajustement retenu : UNE date par élève**, `agenda_late_alert_on` — le jour où la dernière alerte
a été montrée. « Nouveau » se lit alors comme *« une échéance dont la date est tombée depuis ce
jour-là »*, et « une fois par jour » se lit directement sur la même colonne.

🔴 **Rien n'est enregistré par item, donc rien ne dit « vu le 12, jamais fait ».** La granularité
reste la protection : Papa ne peut rien dériver de cette date qui ressemble à de la surveillance.
⚠️ Et elle **ne sort d'aucune route**, comme `agenda_last_seen_at` — un test de non-fuite le garde.

⚠️ **Ce qui est quand même franchi, et qu'il faut nommer** : `new_agenda_count` refusait que le
franchissement d'une date déclenche quoi que ce soit. Ce toast **est** déclenché par un
franchissement de date. Le dépôt passe donc d'**une** famille de signaux (la nouveauté, qui meurt
d'un regard) à **deux** (la nouveauté, et le retard). C'est une décision du commanditaire, pas un
effet de bord — et elle est bornée ci-dessous.

##### Les bornes

1. 🔴 **Aucun nombre.** Le toast nomme **une** échéance — « Le contrôle de maths de vendredi
   t'attend » — jamais un total. Le compteur d'arriéré du §7 est **le seul interdit qui n'a pas
   bougé de la journée**, et il ne bouge pas ici.
2. 🔴 **Il ne relance pas.** Une échéance déjà signalée ne redonne jamais lieu à une alerte : seule
   une échéance dont la date tombe **après** la dernière alerte en déclenche une. Un enfant qui
   n'arrive pas à rattraper ne verra donc pas le même toast tous les jours.
3. **Éphémère.** Il s'efface seul, ne bloque rien, et n'attend aucun geste — un toast qui exige
   d'être fermé est une réclamation.
4. **`motion-safe:`** sur toute apparition animée, comme partout ailleurs (§D10, §D16).
5. **Une porte, pas un reproche** : il mène à l'échéance, il ne qualifie pas Massimo.

##### Deux défauts que seuls l'écran et un verrou existant ont attrapés

**a) Le toast s'auto-annulait.** Son accusé de réception remet l'alerte à `null` côté hook ; le
composant, qui lisait la prop directement, se démontait donc **dans le même cycle**. Le filigrane
serveur était consommé à chaque chargement et **l'alerte n'apparaissait jamais à l'écran**.
🔴 **Dix tests unitaires étaient verts** : leur `onShown` est un espion sans effet. Il a fallu
regarder la page, puis constater en base que le filigrane avait bougé alors que rien n'était
apparu. Le toast garde désormais **sa propre copie** de l'alerte, et un test reproduit un parent
qui annule.

**b) L'identifiant de migration collisionnait — deux fois.** `a1b2c3d4e5f9` était déjà pris, puis
`c1d2e3f4a5b6` aussi. Les identifiants « à la main » de ce dépôt sont tirés d'un alphabet si étroit
(`a1b2c3d4…`) que la collision est la règle. 🔴 Le défaut n'aurait éclaté qu'au **démarrage de la
production** (`alembic upgrade head` → *« Revision … is present more than once »*), jamais dans la
suite normale, qui tourne sur un SQLite créé par `metadata.create_all` et ne traverse pas alembic.
Attrapé par `test_migrations_graph.py`, écrit pour exactement ça. L'identifiant retenu est **tiré au
hasard et vérifié** contre l'ensemble des révisions existantes.

##### Le signal qui dirait qu'on s'est trompé

Massimo referme `/agenda` dans la seconde qui suit l'ouverture, ou cesse d'y venir. Un écran qui
accueille par ce qui manque se fuit — c'est le motif exact du retrait de la série (2026-07-27), et
c'est le risque que ce cinquième signal fait courir. ⚠️ Non mesuré : cela se regarde.

##### Ce que ça coûte

**Une colonne, une migration** (`agenda_late_alert_on`, `Date`, nullable). C'est ce qui range ce
chantier en **cas 3** au sens de l'ADR-0060 — d'où cet ADR, écrit **avant** la première ligne de
code. ⚠️ La prod dérive déjà du dépôt : cette migration s'ajoute à celles en attente.

---

### §R — Ce qui est révoqué et ce qui est borné

**R1 — §D8 de l'Amendement 8**, en ce qu'elle laisse le futur sans surface sur `/agenda`.

> *« La section disparaît du bas de `/agenda`. »* — arbitrée le 2026-08-17, révoquée le même jour.

**La rouvrir sans le dire serait la glisser.** Ce qui change entre les deux décisions n'est pas
l'avis : c'est l'objet. La section supprimée était une **projection d'échéances**, avec un décompte
chiffré et une quatrième surface non dédoublonnée. Celle-ci est un **bloc de gestes**, sans date et
sans nombre. Les trois motifs de §D8 tiennent donc toujours **contre la section qu'elle a
supprimée** — et §R5 de l'Amdt 8 reste vrai : *« le troisième horizon quitte `/agenda`, il ne quitte
pas le produit »*, `UpcomingCard` vit toujours sur l'Accueil et les pages Matières.

**B1 — §4 et §B7 : BORNÉS, non révoqués.**

> *« Le calendrier n'accueille que ce qui a une date dans le monde réel. ZETIS ne se donne jamais
> rendez-vous à lui-même. »*

Arbitrage explicite du commanditaire, sur deux options (borner / révoquer). La frontière écrite :

> **La bande et la grille restent absolument intactes** : aucune carte SRS, aucune mission n'y prend
> jamais de case. Le bloc « Prendre de l'avance » **ne porte aucune date** — il propose des gestes,
> il ne fixe pas de rendez-vous.

🔴 **Le test-verrou `test_dated_surfaces_never_contain_missions_or_srs_cards` reste vert TEL QUEL.**
S'il faut le modifier pendant l'implémentation, ce n'est pas le test qui a vieilli : c'est que la
frontière a été franchie. **Il est l'autorité, pas le témoin.**

⚠️ La seule dérogation à la règle de datation reste celle du §4 : les étapes d'un plan de
préparation, qui héritent de la date d'une **échéance scolaire réelle**, jamais de la leur.

---

### §B — Ce qui est PRÉSERVÉ

⚠️ **Cette section est passée en revue contre le §R ci-dessus** — c'est la leçon de la contradiction
B2/R6 de l'Amendement 8, où la copie de sauvegarde ressuscitait ce qui venait de tomber.

- **§7** — aucun total, aucun compteur d'arriéré, aucune série. Le bloc n'en porte aucun.
- **§B1** — aucun réceptacle, **futur compris**. Pas de créneaux « à prendre d'avance » en attente.
- **§B3** — la grille n'est pas une heatmap, et le bloc n'agrège rien.
- **§3 / §B4** — le bloc **ne produit ni événement, ni trace, ni XP**. Le regarder n'est pas
  travailler, et l'agenda reste non probant.
- **§B6** — aucune affordance morte (c'est le §D4 ci-dessus).
- **§17.2** — le plafond de « À reprendre » reste un plafond d'**affichage** : 3 montrés, le nombre
  **uniquement sur le bouton** de dépliage.

---

### §S — Les signaux qui diraient qu'on s'est trompé

1. **Le bloc grossit.** S'il faut un jour y plafonner les entrées, c'est qu'il a cessé d'être ancré
   et qu'il est redevenu un inventaire — donc un compteur d'arriéré par un autre chemin.
2. **Massimo défile sans s'arrêter jusqu'en bas.** Un bloc de gestes qu'on saute est un bloc qui
   propose la mauvaise chose au mauvais moment.
3. **Le verrou des surfaces datées demande à être modifié.** Voir §R/B1 : c'est la frontière qui
   bouge, pas le test.

⚠️ Aucun de ces trois n'est mesuré : ils se regardent.

---

### §O — Reste ouvert

- **O1 — le statut de l'Amendement 8** est encore « Proposé », et le 9 s'empile dessus. À trancher
  au merge, pas ici.
- **O3 / O4** (vacances sans source de donnée ; mindmaps et capsules qui n'émettent aucun
  `learning_event`) restent ouverts tels quels.

---

### Voir aussi

- **Amendement 8** (§D8, révoquée ici ; §B2, corrigée)
- `docs/frontend-massimo/page-agenda.md` — la spec
- `docs/decisions/adr-0024-progression-massimo.md` (§5 — aucun score chez Massimo)
- `docs/decisions/adr-0050-le-plan-de-preparation.md` (le plan, matière première du premier geste)
