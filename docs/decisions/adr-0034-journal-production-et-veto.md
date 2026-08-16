---
id: "0034"
titre: "Le Journal de production : ce que ZETIS a fait, et le veto qui rend le palier 3 honnête"
type: architecture
statut: propose
date: 2026-08-02
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0009", "0011", "0023", "0025", "0031", "0032", "0033", "0035", "0036", "0037"]
---
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

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-04 | Le Journal dit sous quel régime, mène à ce qui débloque, et sait ce qui l'est déjà | Proposé | oui |
> | 2 | 2026-08-04 | Le Journal se trie et se filtre, et pour ça son passé cesse de bouger | Proposé | oui |
>
> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*

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

---

## Amendement 1 — Le Journal dit sous quel régime, mène à ce qui débloque, et sait ce qui l'est déjà — 2026-08-04

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Proposé**.

### Statut

Proposé — 2026-08-04. Écrit sur **trois reproches faits à l'écran**, le même jour, sur les mêmes
lots : le Journal ne disait pas sous quel régime ZETIS avait travaillé (#21, #22), une ligne
« non produit » ne menait nulle part (#21, #22), et une ligne dont la cause avait été levée
continuait de se lire comme un problème actuel (#23).

> Les trois tiennent en une phrase : **le Journal savait raconter, il ne savait pas situer.** Ni
> dans quel régime, ni vers où, ni à quand.

> S'appuie sur : `adr-0034` (le Journal, le veto), `adr-0032` (les paliers — et son refus de
> persister le préréglage), `adr-0037` (la leçon canonique d'une notion), `adr-0031 §4`
> (« les colonnes disent POURQUOI, jamais SUR QUOI »), la convention `pilotageLinks`.
>
> **Ne révoque rien.** Il ajoute une colonne et un champ de lecture. **Une migration.**

### Contexte

Le Journal répondait à *quand · quoi · notion · produit par · validé par · demandé par*. Deux
questions manquaient, et les deux se posent devant un lot qui n'a rien produit.

#### 1. « Sous quel régime ? » — sans quoi un gate ressemble à une panne

Un lot qui n'équipe rien sous **Manual** n'est pas en panne : c'est le gate du §7 qui a fonctionné,
exactement comme il doit. Le même écran, sur un lot qui a réellement échoué, affiche la même chose.

Le régime n'est ni sur le lot ni dans le Journal — et l'ADR-0032 a **délibérément refusé** de le
persister : *« un mode stocké plus six clés donnerait deux réponses à une seule question »*.
`niveau_de()` le **dérive** des réglages courants.

> ⚠️ **Mais dériver à l'affichage, c'est expliquer un lot d'hier par les réglages d'aujourd'hui.**
> Papa passe en *Autonom* ce soir, et tous ses lots relus d'hier se relisent « servis sans
> relecture ». Le Journal aurait menti sur le seul point où on lui demande la vérité.

#### 2. « Où est ce qu'il faut débloquer ? » — le motif sans la destination

> *« Cours à valider — ZETIS ne valide pas les cours à votre place »*, et rien d'autre.

Papa doit alors retrouver la leçon à la main sur une autre page. C'est le reproche que la
convention `pilotageLinks` avait déjà tranché ailleurs : *« une cellule qui affiche un état sans y
donner accès oblige Papa à retrouver l'objet à la main »*. Le Journal, lui, ne l'avait pas reçu.

### Décision

#### 1. Le lot CAPTURE son régime au démarrage — deux paliers, jamais le nom

`production_runs.a0a_level` et `a1_level`, écrits par `runner.execute` à l'instant où il lit déjà
les paliers pour s'exécuter. C'est le patron de `authorized_by` : ce qui a autorisé un lot
s'**écrit** sur lui, ne se déduit pas après coup.

**Les paliers, pas le nom**, et c'est l'ADR-0032 tenue et non contournée : on stocke les FAITS, le
nom se redérive à la lecture **par `niveau_de` elle-même**. Deux clés suffisent — `NIVEAUX` n'en
nomme que deux, et ce sont exactement celles qui commandent la production.

Trois réponses possibles à la lecture, et les trois disent quelque chose de différent :

| Valeur | Sens |
|---|---|
| `manuel` / `semi` / `autonome` | un régime nommé |
| `sur_mesure` | des paliers qui ne composent aucun préréglage — état légitime |
| `null` | **non enregistré** : lot antérieur à la colonne |

⚠️ **Aucune rétro-attribution** (doctrine §F.4) : les anciens lots affichent « régime non
enregistré », ce qui est la vérité. Leur plaquer le réglage du jour serait le défaut qu'on ferme.

#### 1bis. Ce que la capture ne couvre pas se DÉDUIT des actes du lot — jamais des réglages

La décision §1 laisse tous les lots antérieurs en « régime inconnu ». Vu à l'écran le même jour :
**22 lots sur 23** portaient cette mention. *« Je veux connaître dans quel mode était ZETIS à la
production. »*

Le refus du §1 porte sur **une** source : les réglages d'aujourd'hui, qui ont pu changer. Il ne
porte pas sur les **actes du lot**, qui, eux, n'ont pas changé — un cours que ZETIS a rédigé reste
un cours que ZETIS a rédigé. On peut donc reconstituer sans mentir, à condition de ne lire que ça.

| Preuve laissée par le lot | Ce qu'elle FORCE | Régime |
|---|---|---|
| `trigger = request` | le scan n'émet cette origine que sous ***Autonome*** (ADR-0036 §1) | `autonome` |
| il a **rédigé un cours** | le gate du §7 était tombé → A1 = 3, donc A0a = 3 par monotonie | `autonome` |
| un dérivé laissé **à relire** | A0a = 2 — et A1 = 3 forcerait A0a = 3, donc A1 = 2 | `manuel` |
| un dérivé **servi** + une notion écartée faute de cours | A0a = 3 et A1 < 3 | `semi` |

⚠️ **La capture PRIME toujours.** Un lot qui a enregistré son régime ne se fait pas réinterpréter
par ses artefacts — sinon la capture ne protégerait plus rien. Verrouillé par son test.

⚠️ **« Déduit » n'est pas « enregistré », et l'écran le DIT.** `zetis_mode_source` voyage avec la
réponse, et la pastille porte une mention discrète. Une reconstitution qui se ferait passer pour un
fait serait pire que l'absence qu'elle remplace.

⚠️ **Le cas ambigu reste INCONNU, et c'est le cœur de la décision.** Un lot qui a servi ses dérivés
sans jamais croiser un cours manquant ne dit rien d'A1 : *Semi* et *Autonome* y sont indiscernables.
On ne répond pas. Mesuré sur la base de dev : **2 lots sur 9** obtiennent une réponse — c'est peu,
et c'est la vérité disponible. Un défaut qui aurait rempli les sept autres aurait eu l'air bien
meilleur en étant faux.

> **Ce qui resterait possible sans mentir** : afficher le fait PARTIEL sur ces lots-là — *« dérivés
> servis sans relecture »* (A0a = 3, certain) sans nommer le régime. Non fait : ce serait un
> troisième vocabulaire à l'écran, pour une information dont on n'a pas montré qu'elle manque.

#### 2. Une ligne bloquée porte SA destination — résolue serveur

Chaque événement `blocked` porte `target: {lesson_id, chapter_id, subject_id}`, et l'écran en fait
un « Ouvrir la leçon → » vers `pilotageLink("cours", …)` — **la convention existante**, pas une
quatrième façon de désigner un cours.

⚠️ **La résolution est SERVEUR.** *« Quelle est la leçon de cette notion »* a une seule réponse
dans le dépôt (`lessons_of_skill`, ADR-0037) — elle a coûté un ADR entier parce que trois modules
répondaient différemment. Laisser le front la deviner depuis un `skill_id` en referait une
quatrième. Résolution **groupée pour toute la page** : un aller-retour par ligne referait le mal du
2026-08-02.

⚠️ **Élargi aux lignes PRODUITES le jour même.** La première version ne portait de destination que
sur `blocked`, au motif qu'*« une pièce produite n'a rien à débloquer »*. C'était vrai de la
destination d'alors — le référentiel, pour écrire le cours. Ce n'est pas le bon motif : sur une
ligne produite on ne va pas **réparer** la leçon, on va **voir la pièce**, et c'est le geste suivant
le plus naturel. Deux sens de lecture, deux destinations, une seule forme (`target`) ; c'est le
`piece` de la ligne qui décide laquelle, côté écran.

⚠️ **`error` et `skipped` restent sans destination.** Une erreur se lit dans son message ; l'ouvrir
désignerait la mauvaise cause. Et « déjà présent » veut dire que **ce lot-là n'a rien produit** : y
rattacher la pièce ferait croire le contraire. Une notion **orpheline** non plus n'en porte aucune —
il n'y a rien à ouvrir, ce que son motif dit déjà.

⚠️ **Les cartes SRS sont un cas à part, et il est traité explicitement.** La matrice de Couverture
n'a que quatre colonnes leçon-centrées : faire passer les cartes par la branche générique de
`pilotageLink` les enverrait sur `/quiz`. Leur page attend en plus un **`skill_id`** en `focus`, pas
un id d'objet. Deux différences dans un seul cas → une branche nommée dans `journalLink`, plutôt
qu'une cinquième entrée forcée dans un type qui ne la veut pas.

#### 3. Une cause levée est ANNOTÉE au présent — la ligne, elle, ne bouge jamais

Constat du même jour, une heure après les deux premiers : le lot #23 a été bloqué à **15:18:58**
par un cours inexistant ; le cours a été écrit à **15:20:51** et validé à **15:35:33**. Sa ligne —
*« non produit — Cours jamais rédigé »* — est **exacte**, et elle se lit comme un problème
**actuel**.

> Les deux lectures sont légitimes et elles ne parlent pas du même temps. Le motif dit **ce qui
> s'est passé** ; il manquait quelqu'un pour dire **où on en est**.

Décision : chaque ligne bloquée porte `resolved`, calculé **à la lecture**, et l'écran en fait un
« · **depuis résolu** » posé **à côté** du motif.

⚠️ **Le motif d'origine n'est jamais réécrit** — c'est la moitié qui compte, et elle est tenue par
un test qui vérifie que la ligne est intacte *après* la résolution. Corriger la ligne ferait perdre
la raison pour laquelle le lot n'a rien produit ; c'est le §F.4, et il ne bouge pas.

⚠️ **Rien n'est stocké.** Même forme que `stale` (§2) et que `target` : une lecture. Rejouer
l'histoire en base, c'est la perdre.

⚠️ **`resolved` = plus AUCUN blocage**, pas « le motif d'origine a disparu ». Une notion passée de
*cours jamais rédigé* à *cours à valider* a changé de cause et resterait bloquée : annoncer
« résolu » ferait renoncer Papa au geste qui reste. Verrouillé par son propre test.

⚠️ **Sous le palier D'AUJOURD'HUI**, et c'est l'inverse assumé de `zetis_mode` : la question posée
est *« un lot lancé maintenant passerait-il ? »*. Les deux cohabitent sur la même ligne sans se
contredire — l'un est au passé, l'autre au présent, et chacun le dit.

#### 4. L'état d'une ligne se lit à la CASE, plus au mot

*« "non produit" porte à confusion »*, dit à l'écran le 2026-08-04 — et c'est juste : la formule se
lit comme un échec alors que, sur une ligne bloquée, c'est un gate qui a fonctionné. Chaque ligne
porte donc une **case** : cochée pour ce qui est fait, vide pour ce qui reste, une croix pour une
erreur.

| Issue | Case | Mot |
|---|---|---|
| `generated` | ☑ | produit |
| `skipped` | ☑ (atténué) | déjà présent |
| `blocked` | ☐ | à faire |
| `error` | ✕ | erreur |

⚠️ **Ce n'est pas un `<input type="checkbox">`, et c'en est le contraire exact.** Un journal est un
registre : rien ne s'y coche à la main. Une vraie case laisserait croire qu'on peut la cocher — un
contrôle qui ne contrôle rien, et un mensonge pour les lecteurs d'écran. Le glyphe est décoratif ;
le mot reste, rendu au clavier par `aria-label`.

⚠️ **La case d'une ligne bloquée reste VIDE même quand la cause est levée.** Ce que le lot a fait ne
change pas ; c'est le badge « depuis résolu » (§3) qui dit le présent. La cocher réécrirait le passé
par l'image après avoir renoncé à le réécrire par le texte.

### Ce que cet addendum ne fait pas

- **Aucun compteur, aucun ratio** par régime. Le §F.2 tient : la provenance est un fait, elle ne se
  totalise pas. « 14 lots servis sans relecture » resterait un bulletin de retard.
- **Aucune surface de réglage depuis le Journal.** On lit le régime d'un lot passé ; on ne le
  change pas d'ici — les paliers ont leur page.
- **Aucune rétro-attribution**, ni au déploiement ni à la lecture.
- **Rien pour Massimo.** Le Journal reste un écran de Papa.

### Le signal qui dirait qu'on s'est trompé

Papa lisant le régime d'un lot et **agissant sur les réglages d'après lui**, croyant y voir l'état
courant. Ce serait le signe que la page mélange deux temps ; la réponse serait de dater le régime à
l'écran (« le 4 août, ZETIS était en Manual »), jamais de le retirer — l'information manquait
vraiment.

---

## Amendement 2 — Le Journal se trie et se filtre, et pour ça son passé cesse de bouger — 2026-08-04

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Proposé**.

### Statut

Proposé — 2026-08-04.

> S'appuie sur : `adr-0034` (le Journal, le veto, `stale` comme lecture),
> **Amendement 1** (la capture des paliers, la déduction du régime),
> `adr-0032` (les paliers, `NIVEAUX`, `niveau_de`), `adr-0036` (le lot-pièce, l'origine `request`),
> `adr-0037` (la leçon canonique d'une notion — une seule réponse serveur).
>
> **Révoque une phrase**, nommément, au §5. **Une migration + un script de reprise.**

### Contexte

Le Journal rend les lots du plus récent au plus ancien, vingt par page, sans autre entrée. Ça a
suffi tant qu'il y avait vingt lots. Il y en a maintenant assez pour que la question *« qu'est-ce
que ZETIS a fait en maths ce mois-ci »* n'ait aucune réponse autre que faire défiler.

Quatre décisions ont été prises par Papa avant ce document, et elles ne se rouvrent pas :

1. **un filtre garde des LOTS ENTIERS**, jamais les pièces à l'intérieur ;
2. **le filtrage est SERVEUR**, sur toute l'histoire — la pagination s'applique **après** ;
3. **critères v1** : date · matière · chapitre · statut · mode ZETIS · type de contenu ;
4. **plusieurs clés de tri** (date · matière · mode · statut), inversables.

> ⚠️ Sur la 4, l'avertissement a été donné et **accepté** : *un journal qui n'est plus
> chronologique cesse d'être un journal*. Le §7 en tire la seule conséquence qui protège encore
> quelque chose — le défaut, et le retour au défaut.

#### Le point dur, et pourquoi il précède tout le reste

Le critère « mode ZETIS » n'est pas un critère comme les autres, parce que **le régime d'un lot
n'est pas une donnée : c'est un calcul refait à chaque lecture.** L'addendum précédent l'a construit
en deux étages — la **capture** (`a0a_level` / `a1_level`, écrits au démarrage) et, à défaut, la
**déduction** à partir de ce que le lot a laissé derrière lui.

C'est le second étage qui pose problème.

> 🔴 **La déduction repose sur des artefacts que le veto peut retirer.** Le veto de l'ADR-0034
> permet à Papa de supprimer une pièce produite. Retirer la fiche `pending` d'un lot efface la
> preuve « un dérivé laissé à relire », donc la preuve « A0a = 2 », donc **le régime affiché de ce
> lot change** — un lot lu *Manuel* hier se lit « inconnu » demain, ou pire, se lit *Semi*.
>
> Un historique qui bouge quand on exerce un droit prévu par le dispositif n'est pas un historique.

Et il y a pire, trouvé en relisant le code plutôt qu'en s'en souvenant :

> 🔴 **Une des quatre preuves est une chaîne de caractères d'affichage.** `lot_evidence` établit
> `bloque_sur_cours` par `detail.lower().startswith("cours")` — sur le **motif rendu à l'écran**.
> Le chantier du 2026-08-04 a précisément *« réécrit les motifs en état + geste »*. La prochaine
> reformulation d'un motif changera donc le régime déduit de lots vieux de six mois, sans que
> personne ne fasse le lien.

Ces deux fragilités sont indépendantes du langage : les traduire en SQL les emporterait telles
quelles. Le filtre n'est que l'occasion — le défaut, lui, existe déjà et se lit aujourd'hui à
l'écran.

#### Trois affirmations à corriger avant de décider

Le cadrage précédent notait, dans `MEMORY.md`, trois choses que la lecture du code contredit :

| Ce qui était noté | Ce qui est vrai |
|---|---|
| *« `zetis_mode` n'est pas filtrable en SQL »* | **Faux, et déjà corrigé** : les quatre preuves vivent toutes en base. La déduction est en Python parce que les objets étaient **déjà chargés pour l'affichage**. |
| *« une **vraie colonne** `zetis_mode_source` »* | Le champ **existe déjà** dans le contrat d'API et dans `packages/types` — il est *calculé* (`journal.py`), pas stocké. Ce chantier ne l'ajoute pas : il le **matérialise**. ⚠️ Conséquence : **l'écran n'a rien à changer** sur ce point. |
| *« aucun index sur `production_run_id` »* | **Vrai** — vérifié sur les cinq modèles. Mais `production_events`, lui, en porte **deux** (`run_id` + `ix_production_events_run_created`), ce qui change le §4. |

### Décision

#### 1. Un filtre garde des LOTS ENTIERS — et le lot gardé s'affiche entier

Un lot qui répond au filtre est rendu **avec toutes ses pièces et tous ses événements**, y compris
ceux qui ne répondent pas au critère.

⚠️ **C'est le contraire d'un réflexe naturel**, et c'est délibéré. Filtrer sur *fiche* puis
n'afficher que les fiches ferait dire au Journal que le lot n'a produit que ça. Le Journal est un
**registre** : il rend compte de ce qu'un lot a fait, en entier, ou il n'en rend pas compte. Le
filtre choisit **quels lots on regarde**, jamais **ce qu'on voit d'un lot**.

#### 2. Le filtrage et le tri sont SERVEUR, sur toute l'histoire ; la pagination vient APRÈS

`WHERE` puis `ORDER BY` puis `LIMIT/OFFSET`, dans cet ordre, en une seule requête.

⚠️ **Filtrer une page déjà paginée serait un défaut silencieux** — la forme la plus coûteuse à
diagnostiquer : l'écran répondrait *« rien en maths »* alors que les lots de maths sont page 4. Le
`has_more` et le total portent sur **l'ensemble filtré**, jamais sur l'ensemble total.

#### 3. Six critères, et chacun a une définition écrite

| Critère | Paramètre | Ce qu'il interroge |
|---|---|---|
| **date** | `depuis` / `jusqu_a` (dates) | `production_runs.created_at` |
| **matière** | `subject_id` | résolu en identifiants avant le SQL — voir §6 |
| **chapitre** | `chapter_id` | idem §6 |
| **statut** | `queued`·`running`·`stale`·`done`·`failed` | colonne + lecture `stale` — voir §8. ⚠️ **`failed`, pas `error`** : `error` est une issue d'**événement**, les confondre créerait un sixième mot |
| **mode ZETIS** | `manuel`·`semi`·`autonome`·`sur_mesure`·`inconnu` | les deux paliers — voir §5 |
| **type de contenu** | `cours`·`fiche`·`mindmap`·`quiz`·`srs` | `production_events.piece` — voir §4 |

Les critères se **cumulent** en `ET`. Plusieurs valeurs d'un même critère se cumulent en `OU` — un
filtre qui n'accepterait qu'une matière obligerait à quatre lectures pour une question qui en vaut
une.

#### 3bis. Les CONTRÔLES se replient ; les critères ACTIFS, jamais

Ajouté après avoir **regardé la maquette dans un navigateur** : à plat, la barre des six critères
faisait **385 px**, et le premier lot commençait à **578 px** sur un écran de 720 — plus de la
moitié du pli consommée avant d'avoir vu un lot.

Décision : la rangée **matière** et la **ligne de synthèse** restent affichées en toutes
circonstances ; les cinq autres critères vivent derrière un « Plus de filtres », dont le bouton
porte **le nombre de critères repliés encore actifs**. Repliée, la barre fait **227 px**, premier
lot à **438 px**.

⚠️ **Ce qui ne se replie jamais, c'est la liste des critères ACTIFS** — *« 7 lots sur 23 · Maths ✕ ·
Fiche ✕ · Tout effacer »*. C'est elle qui répond à *« pourquoi mon journal est-il si court ? »* ;
replier un filtre actif serait exactement le défaut que cette barre existe pour éviter, et le
signal d'échec du dernier §.

> On aurait pu ne rien replier et vivre avec 385 px. Le contre-motif est au dossier : une barre
> partiellement repliée demande de se souvenir qu'il y a autre chose dessous. La réponse est le
> compteur sur le bouton — il rend l'oubli visible sans rouvrir la barre.

#### 4. Le type de contenu se lit dans les ÉVÉNEMENTS, pas dans les cinq tables de pièces

`EXISTS (SELECT 1 FROM production_events WHERE run_id = … AND piece IN (…))`.

⚠️ **Une table au lieu de cinq, et elle est déjà indexée** (`run_id`, plus
`ix_production_events_run_created`). Interroger les cinq tables de pièces aurait ajouté cinq
`EXISTS` non indexés par lot — c'est le §9, et on l'évite plutôt que de le payer.

⚠️ **Et surtout : ça répond à la bonne question.** L'événement existe pour ce qui a été *produit*
comme pour ce qui a été *sauté* ou ce qui a *échoué*. Filtrer sur les tables de pièces n'aurait rendu
que les succès — c'est-à-dire exactement l'inverse de ce qu'on cherche quand on filtre un journal.

⚠️ **Un lot bloqué AVANT d'avoir touché une pièce ne répond à aucun filtre de type, et c'est
inévitable** : `production_events.piece` est `NULL` quand l'événement porte sur la notion entière
(`outcome='blocked'`) — constat de code, pas un oubli. Un lot écarté faute de cours n'a jamais
atteint le stade où un type existe. **L'écran doit le dire** dans son état vide, sans quoi le filtre
donnera l'impression que ces lots n'existent pas.

##### Amendement acté à l'implémentation (2026-08-04) — un second angle mort, mesuré

🔴 **Les lots ANTÉRIEURS à `production_events` ne répondent à aucun filtre de type non plus**, y
compris quand ils ont produit. La table est née avec l'ADR-0034 ; ce qui la précède n'a laissé
aucune ligne.

Mesuré sur la base de dev : **2 lots sur 9 n'ont aucun événement**, et l'un d'eux (le lot #3) porte
**4 fiches**. Filtrer sur *fiche* le laisse donc de côté, alors qu'il en a produit quatre.

**La décision ne change pas**, et son motif tient : filtrer les cinq tables de pièces rendrait ces
lots-là mais perdrait **toutes** les lignes bloquées, sautées et en erreur — c'est-à-dire l'essentiel
de ce qu'on cherche dans un journal, et une régression bien pire. Le coût est nommé, pas masqué.

⚠️ **Conséquence pour la slice B** : l'état vide ne peut pas se contenter de compter les lots
bloqués. Il doit aussi dire *« N lots sont antérieurs au détail par pièce »* — sans quoi Papa lira
« ZETIS n'a jamais fait de fiches » devant un lot qui en a fait quatre.

#### 5. 🔴 Le régime CESSE d'être re-dérivé — une écriture unique, marquée, et l'histoire se fige

**C'est la décision qui commande le chantier.**

- une colonne **`zetis_mode_source`** (`capture` | `deduit` | `NULL`) sur `production_runs`, à côté
  des deux paliers ;
- `runner.execute` continue d'écrire les paliers au démarrage et marque **`capture`** ;
- un **script de reprise, lancé UNE fois**, écrit `a0a_level` / `a1_level` sur les lots antérieurs
  **là où leurs actes le prouvent**, et marque **`deduit`** ;
- ce que rien ne prouve **reste `NULL`** — aucune rétro-attribution, la doctrine §F.4 ne bouge pas ;
- la lecture ne déduit **plus rien** : elle lit deux entiers et une source.

⚠️ **C'est un SCRIPT, pas une migration.** Une migration qui importerait `deduire_regime` ferait
dépendre le schéma de la logique métier, et se rejouerait différemment selon la version du code au
moment du déploiement. La migration ajoute la colonne, vide. Le script la remplit, une fois, et son
résultat est vérifiable avant d'être gardé.

⚠️ **La capture PRIME toujours**, et le script ne touche **jamais** un lot qui porte déjà ses
paliers. Verrou de test dédié : un lot `capture` reste `capture`, quels que soient ses artefacts.

##### Ce que cette décision révoque, exactement

> **Révoqué** : *« la déduction est une lecture »* — l'implicite du §1bis de
> **Amendement 1**. Elle devient une **écriture unique et datée**.

> **NON révoqué** : la phrase *« ⚠️ Rien n'est stocké »* du **§3** du même addendum. Elle porte sur
> `resolved` (« depuis résolu »), et `resolved` reste calculé à la lecture — c'est une annotation
> **au présent**, elle doit bouger. Il en va de même de `stale` et de `target`.
>
> ⚠️ `MEMORY.md` attribuait la révocation au §1bis en citant une phrase du §3. Les deux paragraphes
> ne parlent pas de la même chose, et le chantier n'en touche qu'un.

##### Pourquoi stocker ici n'est PAS ce que le §F.4 interdit

Le §F.4 interdit de **reconstituer le passé depuis les réglages d'aujourd'hui**, parce que ceux-là
ont changé. Écrire **une fois** ce que les **actes** prouvent, avec sa provenance, est le geste
inverse : c'est ce qui **fige** l'histoire au lieu de la laisser dériver.

| | re-dériver à chaque lecture | écrire une fois, marqué `deduit` |
|---|---|---|
| Source | des artefacts **rétractables** (veto) et un **motif d'affichage** | les mêmes, mais **lus une seule fois**, à une date connue |
| Un veto exercé demain | **change le régime affiché d'hier** | ne change rien |
| Une reformulation de motif | **change le régime de lots anciens** | ne change rien |
| Filtrable, triable, paginable | non sans réimplémenter la règle | oui, en SQL, sur deux entiers |

C'est le patron de `authorized_by`, et déjà celui de la capture : **ce qui caractérise un lot
s'écrit sur lui.**

#### 6. La matière et le chapitre se résolvent en IDENTIFIANTS, une fois, avant le SQL

Un lot porte **soit** un `chapter_id` (scope chapitre), **soit** un `scope_skill_id` (lot-pièce,
ADR-0036 §2) — la contrainte `ck_production_runs_exactly_one_scope` l'impose. Les deux doivent
répondre au même filtre, sans quoi filtrer par chapitre **cacherait précisément les demandes de
Massimo sur ce chapitre**.

Le patron, et il vaut pour les deux critères :

> **le filtre hiérarchique est d'abord traduit en ensembles d'identifiants — par les résolveurs qui
> existent — puis passé au SQL comme un `IN`.**

- `chapitre = C` → `WHERE chapter_id = C OR scope_skill_id IN (les notions dont C est la leçon)` ;
- `matière = M` → les chapitres de M, plus `Skill.subject_id = M` pour le côté lot-pièce.

⚠️ **Ce n'est pas une deuxième implémentation, et c'est tout l'enjeu.** La règle *« quelle est la
leçon de cette notion »* reste `lessons_by_skill` (ADR-0037) — appelée **une fois par requête**, pas
une fois par lot, et son résultat devient un paramètre. Récrire la jointure en SQL aurait refait le
défaut qui a coûté un ADR entier.

⚠️ **`Skill.subject_id` existe en direct** : le côté lot-pièce du filtre matière ne demande aucune
résolution. Ne pas le faire passer par les leçons « pour l'uniformité » — ce serait payer une
jointure pour une colonne.

#### 7. Le tri est multi-clés et inversable — et il RETOURNE toujours au chronologique

Clés : `date` · `matière` · `mode` · `statut`. Chacune inversable.

⚠️ **`date` décroissant est le défaut, et le retour au défaut est TOUJOURS à un geste.** C'est la
seule protection qui reste après l'avertissement accepté : un journal réordonné par matière n'est
plus un journal, il est une liste — acceptable tant qu'on peut en sortir, dangereux s'il faut le
deviner.

⚠️ **Toute clé de tri est départagée par `created_at DESC, id DESC`.** Sans cette queue, deux lots
de même matière s'ordonnent différemment d'une page à l'autre, et la pagination **perd ou répète des
lots** silencieusement. C'est un défaut de pagination classique, pas une élégance.

⚠️ **Trier par `mode` trie sur les PALIERS**, pas sur le mot — l'ordre est celui de l'autonomie
croissante (`manuel` < `semi` < `autonome`), qui est le seul qui veuille dire quelque chose. Les
lots `sur_mesure` et `inconnu` vont **en fin**, dans les deux sens : ils ne sont pas « plus » ni
« moins » autonomes, ils sont hors de l'échelle.

#### 8. `stale` reste une LECTURE — et devient un statut de filtre à part entière

`stale` = `status = 'running' AND heartbeat_at < now() - :délai`. Exprimable en SQL sans rien
stocker : l'ADR-0034 §2 est tenue, pas contournée.

⚠️ **`running` EXCLUT `stale`.** Sans ça, un lot zombie répondrait à deux filtres et Papa le
compterait deux fois. Le rendu le sépare déjà (`run_status`) ; le filtre doit dire la même chose que
l'affichage, ou l'un des deux ment.

#### 9. Les index manquants sont posés dans le même geste

Aucun index sur `production_run_id`, dans **aucune** des cinq tables produites (`lessons`, `fiches`,
`mindmaps`, `quizzes`, `spaced_review_cards`) — vérifié sur les modèles.

Le §5 retire ces tables du **chemin de lecture** du régime (le script les lit une fois, plus la
page). Mais `_pieces_of_run` les interroge toujours **par lot** pour l'affichage, et le script de
reprise les balaiera en entier. Les index se posent, dans la migration du §5.

⚠️ **Un index sur `production_runs.created_at`** aussi : c'est la clé de tri par défaut, et elle
commande la pagination de toutes les lectures.

### Ce que cet addendum ne fait pas

- **Aucun filtre sur les PIÈCES à l'intérieur d'un lot** — c'est la décision n°1, et elle est nette.
- **Aucun compteur, aucun ratio par régime.** Le §F.2 tient : la provenance est un fait, elle ne se
  totalise pas. Le total qui apparaît est celui des **lots filtrés**, pour la pagination.
- **Aucune réécriture d'une ligne passée.** Le §5 écrit une colonne restée vide ; il ne touche ni un
  motif, ni un événement, ni une pièce.
- **Aucune recherche plein texte.** Chercher un mot dans les motifs est une autre question, et elle
  n'a pas été posée.
- **Aucune sauvegarde de filtre**, aucun filtre par défaut autre que « rien ». Un journal qui
  s'ouvre déjà filtré cache son contenu à celui qui a oublié qu'il l'avait filtré.
- **Aucun correctif de `Lesson.status`** (les 39 leçons validées-vides) — dette nommée, chantier à
  part, avec migration.
- **Rien pour Massimo.** Le Journal reste un écran de Papa.

### Le trou trouvé en chemin — et il était plus bas que prévu

🔴 **`lesson_targets` ne résout la matière d'un chapitre que par `school_year_subject_id`.** Un
chapitre rattaché par `theme_id` (l'autre rattachement, légitime depuis le module `subjects` :
Subject → Theme → Chapter) rend `subject_id: None`.

#### Ce que le read-before-code a révélé, et pourquoi la première décision était fausse

La version initiale de cet addendum décidait : *« une seule fonction répond à quelle matière est ce
chapitre, et `lesson_targets` l'appelle comme le filtre »*. **Cette décision est abandonnée**, pour
une raison trouvée en codant :

> **Le trou n'est pas dans `lesson_targets`. Il est dans `lessons_by_skill`** — le résolveur
> canonique de l'ADR-0037 — qui applique le périmètre « année active » par un **INNER JOIN sur
> `SchoolYearSubject`**. Un chapitre rattaché seulement par un thème n'a **aucun chemin vers une
> année scolaire**, et il est donc invisible de **la production, de la galaxie et de
> `canonical_context`**, pas seulement du filtre.

Et il n'existe **aucune donnée** pour réparer localement : `Theme` porte une matière, jamais une
année. Corriger `lesson_targets` seul aurait fait résoudre au filtre une matière que le résolveur
canonique ne sait pas atteindre — **deux réponses à la même question**, exactement ce que
l'ADR-0037 a coûté un ADR entier à supprimer.

#### Le défaut n'était pas dans la donnée, il était dans une PORTE

Mesuré d'abord : **1 chapitre sur 80**, avec 0 leçon, 0 notion, 0 lot. Ce qui donnait l'impression
d'un accident d'historique. C'est faux — le mécanisme est vivant :

| Ce qui existe | Ce que ça fait |
|---|---|
| `POST /subjects/themes/{id}/chapters` | crée un chapitre avec `theme_id` et **`school_year_subject_id = NULL`** — c'est le bouton « ajouter un chapitre » de la page Matières |
| `create_manual_lesson(db, chapter_id, …)` | accepte **n'importe quel** `chapter_id`, sans regarder son rattachement |

Un bouton fabrique le cas, un autre y accroche des leçons, et tout l'aval les ignore **en silence** :
aucune erreur, aucun test rouge, du contenu que personne n'atteint. C'est la famille de défaut que
l'ADR-0037 nomme « le pire cas est silencieux ». Le chapitre trouvé en base est ce qu'a produit ce
bouton — il est vide **par hasard**, pas par construction.

#### Décision : on ferme la porte, on ne répare pas l'aval

**Un chapitre créé sous un thème reçoit AUSSI sa matière d'année**, résolue depuis l'année active et
`theme.subject_id`. Si elle n'existe pas — pas d'année active, ou matière hors programme de l'année
— **la création est refusée avec son motif et le geste qui répare**.

⚠️ **Cela ne révoque PAS « un chapitre peut vivre sous un thème »** (module `subjects`). Le thème
garde la hiérarchie pédagogique ; la matière d'année ajoute l'ancrage temporel. Les deux colonnes
coexistent, et c'est le **rattachement** qui était incomplet, pas le modèle qui était faux.

⚠️ **On refuse plutôt que de créer un chapitre inerte.** Un 201 qui rend un objet que rien
n'atteindra est précisément le mensonge que ce correctif ferme.

⚠️ **Le verrou de test porte sur l'ATTEIGNABILITÉ, pas sur la colonne.** Vérifier
`school_year_subject_id is not None` serait un test de schéma ; le test vérifie que
`lessons_by_skill` rend bien une leçon de ce chapitre — c'est lui qui décide ce que la production,
la galaxie et `canonical_context` peuvent atteindre. Contre-épreuve jouée : retirer l'ancrage le
fait rougir.

⚠️ **`lesson_targets` n'est PAS touchée**, et c'est cohérent : une fois la porte fermée, tout
chapitre neuf porte sa matière d'année, donc la jointure existante suffit. Ce qui reste en base
sans ancrage est une **donnée** à corriger, plus un défaut de code.

> **Ce qui reste ouvert** : le chapitre déjà créé sans ancrage (id 10 en base de dev, 0 leçon) n'est
> pas rattrapé par ce correctif — aucune rétro-attribution automatique. Et **le chantier C reste
> possible** si le rattachement par thème seul devait redevenir légitime : il faudrait alors donner
> une année aux thèmes et étendre `lessons_by_skill`, avec migration. Non fait, non nécessaire.

### Le signal qui dirait qu'on s'est trompé

**Papa filtrant, puis concluant que ZETIS n'a rien fait.** Un filtre qui rend vide sans dire
*pourquoi* il rend vide est indiscernable d'une panne — et le §4 garantit qu'il y aura des cas
légitimes (un lot bloqué avant toute pièce, un lot au régime inconnu). La réponse serait de rendre
l'état vide **bavard** — « 3 lots écartés par le filtre *type = fiche* : ils n'ont produit aucune
pièce » — jamais de retirer le filtre, qui répond à une vraie question.

Le second signal serait un **`sur_mesure` fréquent** après la reprise : il voudrait dire que les
paliers dérivent des préréglages plus souvent qu'on ne le croit, et que `NIVEAUX` ne décrit plus les
usages réels.
