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
> | 2 | 2026-08-10 | L'intitulé se choisit dans le référentiel | Accepté | oui |
> | 3 | 2026-08-10 | « Leçon à apprendre », le quatrième type | Accepté | oui |
> | 4 | 2026-08-10 | L'échéance mène à son cours | Accepté | oui |
> | 5 | 2026-08-10 | Papa n'existe pas dans l'espace de Massimo | Accepté | oui |
> | 6 | 2026-08-10 | La bande ouvre un jour, et le passé cesse d'être hors d'atteinte | Accepté | oui |
> | 7 | 2026-08-15 | le regard vit à `/agenda`, et nulle part ailleurs | Accepté | oui |
>
> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*

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
