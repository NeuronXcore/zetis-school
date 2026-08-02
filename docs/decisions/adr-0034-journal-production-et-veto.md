# ADR-0034 — Le Journal de production : ce que ZETIS a fait, et le veto qui rend le palier 3 honnête

## Statut

Proposé — 2026-08-02. **Cinquième document du chantier d'autonomisation**, après l'addendum
ADR-0011 §G (l'autorité et le veto), l'ADR-0031 (l'exécution en lot), l'ADR-0032 (les paliers) et
l'ADR-0035 (le déclencheur automatique).

> ⚠️ **Numéroté 0034 mais écrit APRÈS l'ADR-0035**, et ce n'est pas un accident : le user a
> demandé le 2026-08-02 que l'axe « déclencheur » soit cadré en premier, précisément pour que ce
> document-ci soit dessiné en sachant qu'il devra rendre lisibles des lots que **personne n'a
> demandés**. Le numéro dit la place dans la livraison, pas l'ordre d'écriture.

> **Ce document livre la condition d'ouverture du régime *Autonome*.** L'ADR-0032 a posé un verrou
> explicite — `VETO_SURFACE_AVAILABLE = False` — au motif que *« le palier 3 promet à Papa un droit
> de veto, et ce droit n'a aucun écran »*. **Ce document construit l'écran.** Sa dernière étape est
> une ligne (§8) ; les sept premières n'existent que pour la rendre honnête.

> S'appuie sur : `adr-0011 §F` (provenance), `adr-0011 §G.3/§G.4` (le veto paresseux, V1 et V2),
> `adr-0031 §3-§4` (exécution asynchrone, `production_runs`), `adr-0032 §4` (le veto s'exerce sur
> le Journal, pas sur la Couverture), `adr-0035` (les lots que personne n'a demandés),
> `adr-0009 addendum` (le cours est la source canonique de ses dérivés).

## Contexte

### Ce que ce document doit rendre possible

Une ligne : `VETO_SURFACE_AVAILABLE = True`. Le serveur rouvre alors le palier 3 d'A1, le régime
*Autonome* redevient offert, et **aucune ligne du front ne change** — `choices` vient du serveur,
le front n'a aucune liste de paliers en dur (ADR-0032, décision active n°4).

Mais cette ligne ne peut être écrite que si le veto existe **vraiment** : un geste par pièce, sur
un flux daté, tant que Massimo n'a pas consommé. C'est tout l'objet de ce document.

### Huit constats de read-before-code (2026-08-02, code réel)

1. **`runner.execute` construit le détail et le JETTE.** Il assemble `results` — un
   `equip_notion` par notion, avec `generated` / `skipped` / `errors` / `pieces_stamped` — et le
   **retourne au job RQ, dont personne ne lit le retour**. Le seul état persisté est
   `run.done_notions`. **La donnée demandée existe déjà, en mémoire, à chaque notion.**

2. **`equip_notion` renvoie déjà tout ce qu'il faut**, sous trois formes : notion sans leçon
   (`has_lesson: False` + `reason`), cours indisponible (`reason` + dérivés `skipped`), ou complet.
   **Rien à instrumenter dans les cinq générateurs** — et c'est heureux, l'addendum ADR-0031
   interdit de toucher l'orchestrateur.

3. ⚠️ **Le §G.3 dit « quatre familles » et il en oublie une — le COURS.** Sa liste
   (`SpacedReviewAttempt`, `QuizAttempt`, `CapsuleView`, `fiche_views` / `mindmap_views`) ne couvre
   pas `Lesson`. **Or A1 « rédaction de cours » est exactement la classe dont le palier 3 justifie
   ce chantier.** Le signal existe — `EVENT_LESSON_VIEWED`, émis par `student_lesson_cours` via
   `log_view_once_per_day` — mais sous une **cinquième forme** : `payload_json->>'lesson_id'`,
   **non indexé** (l'index est `(student_id, created_at)`). **Le veto sur le cours n'a donc aucun
   signal exploitable aujourd'hui, et c'est le trou le plus important de ce chantier.**

4. **`ProductionRun` n'a ni `started_at`, ni `heartbeat_at`, ni `current_skill_id`.** Un lot dont
   le worker meurt reste `running` **pour toujours**, et `created_at` n'est pas l'heure de
   démarrage : le job attend en file (concurrence 1, un seul GPU).

5. **`spaced_review_cards` est la seule table de contenu sans `created_at`** — `Lesson`, `Fiche`,
   `Mindmap` et `Quiz` portent tous `TimestampMixin`. ⚠️ **Nuance que la recette n'avait pas** :
   une carte **produite par un lot** porte `production_run_id`, donc elle est **datable par son
   lot**. Le trou ne concerne que les cartes produites **hors lot** (page « Cartes SRS »,
   génération par matière). La migration reste utile, elle est moins urgente qu'annoncé.

6. **Le tamponnage par filigrane est exact mais grossier.** `_stamp` attribue au run **tout** ce
   qui naît depuis le watermark, sur cinq tables — exact parce que la concurrence est 1. Il donne
   un `production_run_id` **par pièce**, mais **ni la notion, ni l'ordre, ni l'issue**. C'est
   précisément le manque que `production_events` comble.

7. **Les endpoints existants suivent un lot en cours, ils ne racontent rien** : `POST ""`,
   `GET /active`, `GET /preview`, `GET /{run_id}`. **Aucune liste, aucun historique.**

8. **Le veto n'a aucune route**, et « Retirer » touchera **cinq tables de contenu** avec cinq
   suppressions différentes.

## Décision

### 1. `production_events` — une ligne par pièce, et la donnée existe déjà

```txt
production_events
  id
  run_id        FK production_runs, index
  skill_id      FK skills, nullable        # nullable : un lot peut échouer avant toute notion
  piece         # cours | fiche | srs | quiz | mindmap — NULL si l'événement porte sur la notion
  outcome       # generated | skipped | error | blocked
  detail        # message d'erreur, ou motif de saut / de blocage — nullable
  created_at
```

**Traduction directe de ce qu'`equip_notion` renvoie déjà** (constat 2) : `generated[]` →
`outcome='generated'`, `skipped[]` → `'skipped'`, `errors[]` → `'error'` + `message` dans `detail`.
Le `reason` de niveau notion (« Aucune leçon rattachée », « Cours indisponible ») remplit le
`detail` des pièces qu'il explique — **une seule forme de ligne, jamais deux**.

**Une notion BLOQUÉE écrit sa ligne, `piece = NULL`, `outcome = 'blocked'`.** C'est la doctrine de
l'addendum ADR-0031 portée jusqu'au journal : *« une notion silencieusement omise se lirait comme
un échec de production, alors que c'est un gate qui fonctionne »*. `select_notions` rend déjà ces
motifs — ils cessent d'être jetés avec le reste.

> **L'événement s'écrit dans la MÊME transaction que l'acte qu'il trace** — patron
> `log_learning_event`, déjà en vigueur dans le projet. Concrètement : dans le commit qui incrémente
> `run.done_notions`, pas après. Un lot interrompu garde le détail de ce qu'il avait fait ; le
> journal d'un crash est exactement ce pour quoi on l'écrit.

### 2. Le lot devient racontable — et les zombies meurent sans ordonnanceur

Trois colonnes sur `production_runs` : **`started_at`**, **`heartbeat_at`**, **`current_skill_id`**.

- `heartbeat_at` se met à jour **à chaque notion** — il y a déjà un `commit` par notion, le coût
  est nul.
- `current_skill_id` répond à « où en est-il **maintenant** », que `done_notions` ne dit pas.

**L'expiration est une LECTURE, pas un balayage.** Un lot `running` dont le `heartbeat_at` dépasse
le seuil est **rendu** `stale` par le journal ; rien ne le réécrit périodiquement.

> ⚠️ **Aucun ordonnanceur ici, et c'est délibéré.** Le §G.3 a écarté la quarantaine temporelle
> précisément parce qu'elle en exigeait un ; l'ADR-0023 l'avait refusé. **Le seul écrivain est le
> prochain `create_run`**, qui referme les lots expirés avant d'en ouvrir un — opportuniste, jamais
> périodique. (L'ADR-0035 introduira un réveil régulier ; il **pourra** héberger ce ménage, il n'en
> a pas besoin — et ce document se livre avant lui.)

### 3. `spaced_review_cards.created_at` — la migration reste, l'urgence baisse

La colonne est ajoutée (nullable, **aucune rétro-attribution** — doctrine §F.4 : on ne date pas
après coup ce qu'on n'a pas horodaté). Mais le constat 5 corrige la recette : **dans le Journal,
une carte issue d'un lot se date par son lot.** La colonne sert les cartes produites **hors lot**,
et le jour où le Journal élargira sa portée.

### 4. La consommation se résout en CINQ familles — et la cinquième se construit

| Famille | Signal | État |
|---|---|---|
| Fiche | `fiche_views` | existe |
| Mindmap | `mindmap_views` | existe |
| Quiz | `QuizAttempt` | existe |
| Cartes SRS | `SpacedReviewAttempt` | existe |
| **Cours** | **`lesson_views`** | **à créer** |

**Décision : une table `lesson_views`, symétrique des trois autres** — `student_id`, `lesson_id`,
`seen_at`, contrainte d'unicité `(student_id, lesson_id)`.

> **Pourquoi une table et pas la requête JSON qui marcherait aujourd'hui** (constat 3) : le champ
> n'est pas indexé, et surtout le Journal résoudrait **une famille sur cinq d'une manière
> différente des quatre autres** — une asymétrie qui se paierait à chaque évolution du veto. Le
> projet a déjà trois tables de ce patron ; la quatrième ne se discute pas, elle se copie.
>
> **`lesson_viewed` continue d'être émis, à l'identique.** Il sert la heatmap, les sessions et le
> Cahier de bord ; il ne sert pas le veto. **Deux lecteurs, deux besoins, aucune fusion** — la même
> règle qui interdit d'unir `learning_events` et `xp_events`.

**La résolution est UNE requête par famille, jamais une par pièce.** Le journal charge N pièces,
puis cinq `SELECT ... WHERE id IN (…)` et cinq `set` en mémoire. Cinq requêtes quel que soit N.

### 5. `GET /api/production/journal` — un flux daté, `require_parent`

Un flux **par lot, du plus récent au plus ancien**, chaque lot déplié en notions, chaque notion en
pièces avec son issue. Les six colonnes demandées : **quand · quoi · notion · produit par ·
validé par · demandé par** — `validated_by` pour la cinquième, `trigger` + `authorized_by` pour la
sixième (c'est là que `parent_rule` deviendra visible, le jour où l'ADR-0035 l'émettra).

**Portée v1 : ce qui vient d'un lot** (`production_run_id IS NOT NULL`), **et la page le dit.**

> ⚠️ **Le Conseil de classe et la composition champion appellent `equip_notion` HORS lot** : leurs
> pièces portent `production_run_id = NULL` et **n'apparaîtront pas**. Elles n'ont pas besoin de
> veto — Papa a cliqué pour elles, leur autorité est `parent_bulk`. **Mais le silence sur elles ne
> doit pas se lire comme « rien d'autre n'a été produit »** : la page l'écrit noir sur blanc. Un
> journal qui paraît exhaustif sans l'être est pire qu'un journal qui borne son sujet.

**Aucune route élève.** Le Journal est une surface Papa, entièrement.

### 6. Le veto — le geste, son grain, et la garde qui protège Massimo

**Grain : la pièce.** Papa retire une fiche, une mindmap, un quiz, les cartes d'une notion.

| État | Geste | Effet |
|---|---|---|
| **Non consommé** | *Retirer* | suppression franche, **aucune trace, aucun signal à Massimo** (V1) |
| **Consommé** | *Corriger* / *Régénérer* | l'objet vit, il est amendé |

**⚠️ Retirer le COURS emporte ses dérivés — et se REFUSE si l'un d'eux est consommé.**

- Le cours est la **source canonique** de ses dérivés (addendum ADR-0009). En laisser un orphelin
  servirait à Massimo une fiche dont la source n'existe plus.
- **Mais si un dérivé est déjà consommé, le retrait du cours est refusé, avec son motif.** C'est le
  seul choix compatible avec **V1** : retirer quand même ferait disparaître, sous les yeux de
  Massimo, la source d'une fiche qu'il a lue — un trou inexpliqué, exactement ce que V1 interdit.
  **Refuser est plus honnête que retirer à moitié.**
- La modale annonce la portée **avant** le geste : « ce retrait emporte aussi… ». Un veto qui
  surprend n'est pas exercé deux fois.

> ⚠️ **Ce « Retirer » n'ouvre PAS A4**, et il faut le réécrire ici parce que quelqu'un lira une
> contradiction : A4 dit que **ZETIS** ne supprime jamais tout seul. Ici c'est **Papa** qui
> supprime. La classe n'est pas concernée.

> ⚠️ **Suppression franche, et non archivage — alors que l'ADR-0025 impose l'inverse sur l'agenda.**
> Ce n'est pas une incohérence : l'agenda est **co-édité** par Massimo, son archivage protège son
> travail. Ici la pièce n'a jamais existé pour lui (V1), et une trace serait justement la trace de
> trop. **Deux objets, deux doctrines, écrites toutes les deux.**

**Point de vigilance pour la slice** : une suppression ne doit laisser aucune FK pendante
(`production_run_id`, `lesson_skills`, `fiche_views`/`mindmap_views`, `spaced_review_attempts`).
`delete_mindmap` a déjà résolu ce problème pour son objet — **c'est le patron à relire avant
d'écrire, pas à réinventer.**

### 7. La page `/journal`

Le flux, groupé par lot, avec l'état du lot (`queued` / `running` / `done` / `failed` / `stale`),
son déclencheur, son autorité, et le détail par notion et par pièce — **y compris ce qui a été
sauté et pourquoi**, y compris ce qui a été **bloqué** par le gate.

**Aucun compteur, aucun ratio, aucun total** (§F.2 : la provenance est un fait, jamais un
reproche ; elle s'affiche par objet et ne se totalise pas). Le Journal raconte ; il ne note pas.

### 8. Puis `VETO_SURFACE_AVAILABLE = True`

Une ligne dans `settings/service.py`. Le serveur rouvre le palier 3 d'A1, *Autonome* redevient
offert, **et les trois tests écrits sous un serveur simulé « après le Journal » deviennent réels**.

⚠️ **Deux choses à vérifier à l'écran ce jour-là, jamais vues en vrai** :

1. la **monotonie** — A1 = 3 force A0a = 3 ;
2. la **modale de révocation d'A1** (`ConfirmDialog tone="important"`), écrite et testée mais
   **jamais affichée**, parce que le serveur refusait le palier qui la déclenche.

### 9. Ce que le Journal ne fera jamais

- **Aucune surface côté Massimo**, et aucun signal quand une pièce disparaît (V1).
- **Aucune rétroaction sur ce qui est déjà servi** en cas de dé-escalade de palier (V2).
- **Aucun total, aucun ratio ZETIS/Papa** (§F.2).
- **Aucun balayage périodique** — ni pour les zombies, ni pour libérer une fenêtre de veto : la
  consommation ferme la fenêtre, pas l'horloge (§G.3).
- **Aucune re-génération automatique** de ce que Papa retire. Retirer, c'est retirer.

## Périmètre

**Dans cet ADR** : `production_events` et la persistance du détail par pièce ; `started_at` /
`heartbeat_at` / `current_skill_id` et l'expiration des lots zombies **par lecture** ;
`spaced_review_cards.created_at` ; la table `lesson_views` et la résolution de consommation en cinq
familles ; `GET /api/production/journal` ; les routes de veto (*Retirer* / *Corriger*) avec la garde
de cohérence du cours ; la page Papa `/journal` ; **et `VETO_SURFACE_AVAILABLE = True`**.
**Une seule migration** pour les quatre changements de schéma.

**Hors de cet ADR** : le déclencheur automatique (ADR-0035, se livre après) ; l'élargissement du
Journal aux pièces produites hors lot (Conseil de classe, champion) ; l'action « Corriger »
renforcée d'A0b — remise à zéro de la planification d'une carte (§G.3, **toujours due**, et sa
condition d'ouverture est la première carte retirée après révision) ; la page Demandes et
`trigger='request'` ; l'indicateur d'autonomie de Massimo (ADR-0033) ; toute notification.

## Conséquences

### Positives

- **Le palier 3 devient livrable.** C'est le seul document qui lève le verrou de l'ADR-0032, et il
  le lève en construisant ce que le verrou protégeait, pas en le contournant.
- **« Voir exactement ce que fait le worker » coûte presque rien** : la donnée existe déjà
  (constats 1 et 2), il ne manquait qu'une table pour la retenir.
- **Le gate du §7 devient visible.** Les notions bloquées cessent d'être un silence : elles ont une
  ligne, avec leur motif. C'est le point que l'addendum ADR-0031 désignait comme *« le plus facile
  à rater »*.
- **Le trou du cours est comblé pour de bon** : `lesson_views` sert le veto aujourd'hui et tout ce
  qui aura besoin de savoir si Massimo a lu, demain.

### Négatives / coûts assumés

- ⚠️ **Le veto reste un droit sans notification** (§G, coût déjà nommé et non résolu ici) : Papa
  n'apprend qu'une pièce existe qu'en ouvrant le Journal, et Massimo consomme en 24-48 h. La
  fenêtre sera souvent fermée avant qu'il ait su qu'elle s'ouvrait. **Ce document ne le corrige
  pas** — il rend seulement la fenêtre exerçable quand Papa regarde.
- ⚠️ **Le refus de retirer un cours dont un dérivé est consommé sera vécu comme une limite**, et
  c'est le prix de V1. La sortie n'est pas d'assouplir la règle, c'est *Corriger*.
- **Une table de plus (`lesson_views`) pour un signal qui existait déjà** sous une autre forme.
  Assumé : l'asymétrie aurait coûté plus cher, longtemps.
- **Le Journal borne sa portée aux lots**, donc il ne montre pas tout ce que Massimo reçoit. Le
  coût est réel ; il est payé par une phrase à l'écran plutôt que par une union coûteuse.
- **La suppression franche est irréversible.** Aucun « annuler ». C'est V1 qui l'exige, et V1
  protège Massimo, pas Papa.

## Suivi

1. **Livrer dans l'ordre du §1 → §8.** La dernière étape est une ligne ; l'écrire avant les autres
   rendrait vrai un droit qui n'existe pas — l'erreur exacte que l'ADR-0032 a refusé de commettre.
2. **Vérifier à l'écran la monotonie et la modale de révocation d'A1** dès le drapeau levé (§8).
3. Observer le premier mois : **combien de fois le veto est-il réellement exercé ?** Zéro fois
   voudrait dire soit que ZETIS produit juste, soit que Papa n'ouvre pas le Journal — et il faudra
   savoir laquelle des deux.
4. **Une descente de préréglage vaudrait plus qu'une montée** (ADR-0032, observation attendue) :
   elle dirait que le veto n'a pas suffi.
