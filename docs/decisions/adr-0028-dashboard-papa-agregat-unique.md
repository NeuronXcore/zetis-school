---
id: "0028"
titre: "Dashboard Papa : agrégat unique, dérivation client, KPI actifs"
type: surface
statut: accepte
date: 2026-07-31
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: []
---
# ADR-0028 — Dashboard Papa : agrégat unique, dérivation client, KPI actifs

## Statut

**Accepté — 2026-07-31.** Le read-before-code du §Vérifications a été effectué (résultats datés en
fin de document). **Deux hypothèses sur quatre sont tombées** et cet ADR a été amendé en
conséquence : la définition de « consolidée » (§3, elle existait déjà en code et n'était pas celle
écrite ici) et le deep-link du Conseil de classe (§7, `generated_at` et `/conseil-classe` n'existent
pas). L'audit a par ailleurs imposé **une migration** que la version « Proposé » excluait
(§Conséquences, coût n°5).

> S'appuie sur : `adr-0001` (Obsidian non obligatoire — la base fait foi), `adr-0008` (100 % local
> pour le pédagogique quotidien), `adr-0011 §1` (patron du substrat neutre à consommateurs
> multiples), `ARCHITECTURE.md` (PostgreSQL source de vérité) et le précédent de frontière
> métier/présentation posé par `page-dashboard.md` lui-même (« paliers de couleur — présentation,
> côté client », « jours vides omis du payload, reconstruits côté client »), `adr-0017 §5bis`
> (verdict découplé de la complétion), `adr-0020` (Conseil de classe IA), `adr-0024` (doctrine de
> progression figée — **côté Massimo**).
>
> **Ne rouvre pas** : la sémantique de `learning_events` ni le calcul des minutes actives
> (`page-dashboard.md`, acquis) ; le cycle de vie du Conseil de classe (`adr-0020`).

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-05 | Une bulle qu'on clique dit enfin QUELLES notions, et pas seulement combien | Accepté | — |
> | 2 | 2026-08-05 | Le KPI qui manque : « À renforcer » | Proposé | — |
> | 3 | 2026-08-06 | La carte mémoire ne pouvait montrer aucun événement | Accepté | — |
> | 4 | 2026-08-06 | Deux cartes ne pouvaient que s'éteindre | Accepté | — |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

La maquette historique du dashboard Papa (`dashboard_papa.png`, antérieure au produit livré) a été
confrontée aux ADR et aux specs de page. **Sept de ses douze blocs contredisent le produit tel
qu'il existe** :

| Bloc | Contradiction |
|---|---|
| Panneau « Vault Obsidian » | `adr-0001` : PostgreSQL + pgvector + MinIO font foi. Obsidian abandonné. |
| KPI « XP total », « Niveau », « Série 🔥 » | L'XP est le levier motivationnel **de Massimo**. En KPI parent, il transforme le cockpit en tableau de score et réimporte la mécanique de série que `adr-0024` a explicitement bannie (« aucun capital perdable »). |
| « Suivi des récompenses » (1 h de jeu à 800 XP) | Récompense extrinsèque adossée au temps d'écran : le design addictif que `CLAUDE.md` exclut. |
| « Taux de réussite 78 % » | Note globale unique, alors que le verdict est **découplé** de la complétion et pilote la maîtrise silencieusement (`adr-0017 §5bis`). Un pourcentage agrégé masque précisément ce qu'il faut regarder. |
| « Radar des compétences » (Lecture, Logique, Méthodologie…) | Axes sans source dans le modèle : ni `Skill`, ni `mastery_score`, ni `SpacedReviewCard` ne les produisent. Diagramme non alimentable. |
| « Génération rapide avec Claude » (matière + niveau + difficulté) | Contredit `adr-0011`/`adr-0014` : un quiz **dérive d'une leçon canonique validée**, pas d'un formulaire libre. Et l'étiquette « Claude » est fausse — le quotidien pédagogique est local (`adr-0008`). |
| Palette indigo/fuchsia | Identité visuelle de Massimo (`adr-0002`). |

Le besoin exprimé par-dessus ce constat : **conserver la heatmap**, **maximiser les diagrammes
parlants**, **rendre les KPI actifs**, et **que ça reste fluide**.

Ces quatre exigences entrent en tension avec le contrat de données actuel : `GET /parent/dashboard`
(KPI) + `GET /api/parent/activity/heatmap?subject_id=` (heatmap, **paramétrée par matière**) +
`GET /progress/summary` + `/gaps` + `/missions`. Un filtre matière transversal déclencherait
aujourd'hui un aller-retour réseau **par clic** — l'inverse de la fluidité demandée.

## Alternatives considérées

- **Endpoint paramétré `?period=&subject=`** : le plus naturel, et le plus lent. Chaque chip
  matière, chaque segment de donut, chaque bulle du nuage devient un fetch + un état de
  chargement. → Écarté : c'est exactement ce qui casse la sensation de cockpit.
- **Cache client par combinaison (période × matière)** : 3 × 7 = 21 entrées à invalider ensemble
  après chaque validation de contenu. Complexité d'invalidation disproportionnée pour un volume de
  données minuscule. → Écarté.
- **Table d'agrégats pré-calculés** : déjà écartée dans `page-dashboard.md` (« optimisation
  prématurée pour un élève unique »). Rien ici ne change ce verdict. → Écarté.
- **Deux heatmaps distinctes** (calendrier *et* créneaux) : redondance visuelle, deux légendes,
  deux échelles à interpréter sur une page déjà dense. → Écarté au profit du §6.

## Décision

### §1 — Un agrégat unique, trois périodes préchargées

`GET /api/parent/dashboard` devient **la seule requête du premier rendu** et renvoie l'intégralité
du payload **non filtré**, pour les trois fenêtres (7 / 30 / 90 jours) simultanément.

Conséquence directe : changer de période, de matière ou de focus **ne déclenche aucun appel
réseau**. La page ne refetch que sur **invalidation métier réelle** — validation d'un contenu,
confirmation d'une mission, génération terminée.

Ordre de grandeur mesuré sur la maquette : 6 matières × (heatmap 56 valeurs × 3 périodes + ruban 30
+ séries 3 × 12 + charge 14) ≈ **1 500 entiers**, quelques dizaines de ko. La fluidité ne coûte
rien ici — c'est ce qui rend le tout-en-un préférable au paramétrage.

### §2 — Séries livrées **par matière**, jamais pré-agrégées

Le serveur ne renvoie **pas** de ligne « toutes matières ». « Toutes » est une **somme calculée
côté client**. C'est la condition technique du §1 : filtrer devient une projection sur un tableau
déjà en mémoire.

### §3 — Frontière métier / présentation (formalisation d'un usage existant)

| Côté client (présentation) | Côté serveur (métier) |
|---|---|
| Sommer des minutes entre matières | Calculer les minutes actives (`ACTIVE_GAP_CAP_MINUTES`, constante versionnée) |
| Empiler des compteurs de notions | Décider qu'une notion est **consolidée** ou **fragile** (§3 bis) |
| Reconstruire les jours vides | Statuer sur le verdict, la maîtrise, la planification SRS |
| Choisir un palier de couleur | Déterminer `days_inactive`, les lacunes ouvertes |

Règle d'arbitrage : *si deux clients différents pouvaient en tirer deux réponses divergentes, c'est
du métier — donc serveur.*

### §3 bis — « Consolidée » et « fragile » : les statuts réels (amendement du 2026-07-31)

> **Correction d'une erreur de la version « Proposé ».** Le §3 affirmait qu'une notion est
> consolidée quand un « intervalle long est atteint ». **C'est faux, et la définition existait
> déjà** : `SkillMastery.status == "mastered"` (score ≥ 90), posée dans
> `progress/service.py` et servie par `GET /api/parent/progress/consolidated`. `solid` (≥ 70) en est
> **volontairement exclu**. Inventer une seconde définition SRS-based aurait fait diverger deux
> surfaces Papa sur le même mot — exactement ce que la règle d'arbitrage du §3 interdit.

À l'inverse, **« fragile » n'avait aucune définition serveur**. Le mot n'existait qu'en dérivé
calculé à la volée (`fragility = 1.0 - mastery`), et c'est là que vit le bug d'échelle connu
(`mastery_score` est sur **0–100**, traité comme 0–1 par `missions/command.py`, `champion.py`,
`reports/service.py` et deux modales Papa — dette **antérieure et hors périmètre**, suivie à part).

Cet ADR pose donc le mapping, **côté serveur**, sur les statuts réellement écrits en base :

| Segment affiché | `SkillMastery.status` | Seuil |
|---|---|---|
| **consolidées** | `mastered` | ≥ 90 |
| **fragiles** | `weak` + `learning` | < 70 |
| **en cours** | `solid` + `in_progress` | ≥ 70, pas encore acquis |
| **non abordées** | aucune ligne `SkillMastery` | — |

Matérialisé par une constante `FRAGILE_STATUSES` placée **à côté de `OPEN_GAP_STATUSES`**
(`progress/service.py`), pour que la prochaine surface qui parle de fragilité importe la constante
au lieu de recalculer un seuil.

⚠️ `SkillMastery.status` a **six** valeurs, pas cinq : `in_progress` est écrit par
`missions/service.py` et ne sort d'aucun `_status_from_score()`. Le tableau ci-dessus le couvre
explicitement — même piège que celui déjà signalé par `adr-0024`.

**Conséquence directe** : parce que le dashboard raisonne sur des **statuts** et jamais sur un score
brut, il **n'hérite pas** du bug d'échelle 0–100 / 0–1. Le corriger reste nécessaire, ailleurs.

### §3 ter — Historique de maîtrise : une table, une migration (amendement du 2026-07-31)

La carte « Évolution de la mémoire » demande trois courbes sur douze points. L'audit montre que
**deux sont reconstructibles rétroactivement et une ne l'est pas** :

| Courbe | Source d'historique | Verdict |
|---|---|---|
| `covered` | `Lesson.validated_at` | ✅ reconstructible |
| `consolidated` | `SkillMastery.mastered_at` (migration `f1a2b3c4d5e6`) | ✅ reconstructible |
| `fragile` | **aucun horodatage de bascule** | ❌ impossible |

`SkillMastery` ne garde que l'état courant : une notion qui redescend de `mastered` à `learning`
écrase son statut sans laisser de trace. Trois issues étaient possibles — ne tracer que deux
courbes, approximer la fragilité par les échecs de quiz de la fenêtre, ou historiser.

**Décision : historiser.** Table `skill_mastery_history` (`student_id`, `skill_id`, `status`,
`mastery_score`, `changed_at`), écrite au **seul point d'entrée existant**,
`progress/mastery.py::set_mastery_status` — la fonction qui garantit déjà l'invariant
`mastered_at IS NOT NULL ⟺ status == "mastered"`. Un seul point d'accroche, donc pas de risque de
divergence. Backfill des bascules `mastered` déductibles de `mastered_at`, pour que la courbe verte
ne reparte pas de zéro le jour de la mise en service.

Les deux alternatives sont écartées pour la même raison : l'approximation par les quiz mesure
**autre chose** que le statut de maîtrise et contredirait les barres empilées de la carte voisine ;
et amputer la courbe ambre supprimerait précisément le signal de régression, qui est ce qu'un parent
a besoin de voir tôt.

Bénéfice au-delà de cette page : le Conseil de classe (`adr-0020`) et le moteur de missions
(`adr-0017`) pourront enfin dire « cette notion a régressé », ce qu'aucun des deux ne sait faire
aujourd'hui. **Cet amendement annule le « aucune migration attendue » de la version « Proposé ».**

### §4 — Zéro état de chargement après le premier rendu

Un skeleton global au montage, puis **plus aucun spinner** sur une interaction de filtrage. Un
spinner qui réapparaît à chaque chip est ce qui détruit la sensation de cockpit.

**Exception unique et assumée** : le drill-down d'un jour (`GET /api/parent/activity/days/{date}`,
déjà spécifié) reste **paresseux**. Ce n'est pas un filtre mais une descente vers un détail non
borné ; le charger d'avance pour 90 jours × 6 matières annulerait le §1.

### §5 — Les KPI sont des filtres de focus

> **Étendu le 2026-08-05** par **Amendement 2** : un **cinquième** KPI,
> « À renforcer » (`weak` + `learning`), et une ligne de plus au tableau de focus ci-dessous.
> L'addendum corrige aussi ce tableau sur un point — « Lecture ZETIS » répond **aussi** à
> « Notions consolidées », comme le code le fait depuis toujours (`dashboardDerive.ts:253`).

Les quatre KPI (**temps actif**, **régularité**, **notions consolidées**, **lacunes ouvertes**)
deviennent des contrôles. Un clic met la page en focus : les cartes qui **répondent à cette
question** restent en pleine intensité, les autres s'atténuent (`opacity` + désaturation). Second
clic = relâche.

Ce n'est pas un effet décoratif mais **la carte de dépendance entre une mesure et ses preuves** :

| KPI | Cartes conservées |
|---|---|
| Temps actif | Heatmap · Répartition du temps · Où agir |
| Régularité | Heatmap · Charge de révision |
| Notions consolidées | Évolution de la mémoire · État des notions · Où agir · Charge de révision |
| Lacunes ouvertes | État des notions · Où agir · Chaîne de contenus · Lecture ZETIS |

Chaque KPI porte sa **sparkline** (12 points sur la fenêtre) et son delta vs période précédente
(contrat `{ value, delta }` existant, conservé).

**L'XP disparaît des KPI** ; il reste consultable sur la page Progression. Ce n'est pas une
suppression de donnée, c'est un déplacement : le KPI parent doit être décisionnel.

### §6 — Une seule carte heatmap, deux vues du même journal

`page-dashboard.md` spécifie **déjà** une heatmap calendrier (26 semaines × 7 jours, maquette
`mockup-activite-massimo.html`, validée). La demande « garder la heatmap » visait la grille
**créneau × jour**. Les deux répondent à des questions distinctes :

- **Calendrier** — *est-ce régulier ?* (tendance longue, décrochage)
- **Créneaux** — *quand travaille-t-il ?* (semaine type, utile pour caler une séance)

Décision : **une carte, un sélecteur de vue** (`Calendrier` / `Créneaux`), même source
(`learning_events`), même filtre matière, même échelle de couleur. Le ruban 30 jours de la maquette
est absorbé par la vue Calendrier — il n'ajoute rien qu'elle ne montre.

**Échelle de couleur : palier émeraude unique.** La maquette historique dégradait vert → orange →
rouge (« Peu actif / Actif / Très actif / Intense »). Une case dense n'est pas une bonne note, une
case vide n'est pas une faute : c'est une carte d'habitudes, pas une notation. Le rouge est banni
côté Massimo (`adr-0024`) ; l'appliquer à la présence de Massimo côté Papa serait la même faute
d'un cran plus loin.

Bucketing des créneaux en **Europe/Paris**, pas en UTC (cohérent avec le bucketing jour existant).
Créneaux de 2 h, **8 h → 24 h, 8 lignes** (`8h 10h 12h 14h 16h 18h 20h 22h`, chacune couvrant les
deux heures qui suivent).

> Amendement du 2026-07-31 : la version « Proposé » écrivait « 8 h → 22 h, 8 lignes », ce qui ne
> fait que sept créneaux. La maquette porte bien huit étiquettes, la dernière étant `22h` — la plage
> réelle va donc jusqu'à minuit.

**Les minutes hors plage ne sont pas perdues en silence.** L'activité de 0 h à 8 h (rare, mais
possible) est renvoyée à part dans `slots_outside_minutes` et affichée en note sous la grille
(« + N min hors plage »). Une grille qui escamote une partie du journal ferait mentir la carte, et
replier ces minutes dans le premier ou le dernier créneau les inventerait à une heure fausse.

### §7 — Le nuage « Où agir » reste au dashboard, avec sortie vers le Conseil de classe

Diagramme **temps actif × taux de consolidation**, une bulle par matière, aire ∝ nombre de notions
au programme. Il ne consomme que des champs déjà présents (`minutes`, `notions`) — aucun calcul
nouveau.

Division du travail entre les deux surfaces :

| | Dashboard (nuage) | Conseil de classe |
|---|---|---|
| Nature | mesure — position d'une matière | interprétation écrite |
| Fréquence | quotidienne, coup d'œil | trimestrielle ou déclenchée |
| Rôle | **repérer** l'anomalie | **expliquer** et proposer |

Deux sorties de niveaux différents :

- **Clic sur une bulle** → filtre local instantané (§1). On reste dans le cockpit.
- **CTA de la carte** → `/conseil?subject=<slug>&period=<7|30|90>`.

Le deep-link **porte la période**, sinon le Conseil raconte un trimestre quand Papa regardait sept
jours.

> **Amendement du 2026-07-31 — trois corrections imposées par le code.**
> 1. La route React est **`/conseil`**, pas `/conseil-classe`.
> 2. Le champ d'horodatage s'appelle **`created_at`** (`council_reports`) ; **`generated_at`
>    n'existe nulle part** dans le dépôt.
> 3. `ConseilClasseIAPage` **ne lit aucun query param** aujourd'hui (`period` y est un état local).
>
> Le prompt de chantier prévoyait dans ce cas un CTA **inerte**. **Arbitrage retenu : étendre la
> page Conseil à la lecture de `?subject=&period=`**, en commit séparé et révocable seul. Le patron
> `useSearchParams` + `useFocusTarget` est déjà en place sur six pages Papa ; livrer un bouton mort
> sur la page d'accueil de Papa coûtait plus cher que cette extension bornée. **Périmètre strict :
> lecture de l'URL et présélection. Ni la génération, ni le cycle de vie, ni les routes backend du
> Conseil ne sont touchés — `adr-0020` n'est pas rouvert.**

**Le clic n'ouvre jamais une génération LLM.** Arriver sur le Conseil affiche la **dernière
synthèse existante** ; régénérer reste explicite et destructif (`ConfirmDialog`, convention
design-system). L'état vide + bouton *Générer* n'apparaît que si **aucune** synthèse n'existe.
Matière absente de la synthèse (référentiel créé après coup) → état vide **local** à la section, pas
une page vide.

**Le bandeau de fraîcheur passe hors v1** (« Synthèse du 30/06 · 12 séances et 2 lacunes depuis »).
Il suppose un comptage serveur des `learning_events` postérieurs à `created_at`, donc une extension
du contrat du module `reports` — c'est-à-dire le second chantier que le §Périmètre refuse d'ouvrir.
Il rejoint le §Hors v1.

### §8 — CTA à deux états, pictogrammes via `subjectIcons`

- **Aucune matière sélectionnée** → CTA atténué, pictogramme en `grayscale(1)` + `opacity .5`,
  libellé « Conseil de classe — toutes matières ». Cliquable, mène à la synthèse globale.
- **Matière sélectionnée** → CTA plein émeraude, pictogramme en couleur, libellé nommé
  (« Analyser Mathématiques dans le conseil de classe »).

Le CTA est **toujours présent** (pas d'apparition/disparition qui décalerait la mise en page) ; le
pictogramme qui se colore signale que le lien s'est **précisé**.

Pictogrammes via `subjectIcons` (`@zetis/ui`) — **jamais d'emoji codé en dur** (convention
`page-dashboard.md`). L'emoji ne subsiste que comme repli interne de `subjectIcons` ; `grayscale`
s'applique indifféremment aux deux.

### §9 — Portée de la doctrine `adr-0024` (levée d'ambiguïté)

`adr-0024` fige : pas de rouge, **aucun score ni pourcentage par matière**, aucun capital perdable.
Cette doctrine régit **l'interface de Massimo** (page Progression / Galaxy).

Côté Papa, les pourcentages de couverture et de consolidation **restent légitimes** — c'est un
instrument d'analyse, pas un bulletin remis à l'élève. Ce que le §Contexte bannit côté Papa, c'est
la **note globale unique** (« 78 % de réussite »), pas la mesure par matière.

Invariant maintenu des deux côtés : **rien du dashboard ne remonte dans l'interface de Massimo**
(pas d'auto-surveillance), et **aucune notification push** — le décrochage se lit à la
consultation.

### §10 — La mission proposée : composer en lecture, créer sur confirmation

La carte « Lecture ZETIS » propose une mission. **Le GET qui la sert n'écrit rien** : la
composition passe par `missions/service.preview_remediation`, pendant lecture de
`generate_remediation` — mêmes lacunes, même moteur d'étapes, même ordre, aucune ligne créée.
C'est le patron preview/confirm déjà posé par `adr-0010` et employé par le Commander.

**Aucune surface d'écriture n'est ajoutée** : la confirmation appelle la route de création qui
existait déjà (`POST /api/missions/generate-remediation`). Le dashboard ne crée pas
unilatéralement — il propose, Papa tranche, et la mission naît `pending` comme toute autre.

Invariant à tenir : **la prévisualisation et la création doivent voir exactement les mêmes
lacunes**. Sans cet accord, la carte proposerait une notion que le bouton ne créerait pas. D'où le
même filtre `status == "open"` de part et d'autre — et, en corollaire, l'état vide **honnête**
décrit au §Hors v1 quand des lacunes existent que le générateur ne reprend pas.

Créer une mission depuis cette carte est la seule **invalidation métier réelle** de la page : c'est
le seul cas où l'agrégat est rechargé (§1). Un geste de filtrage, jamais.

## Conséquences

**Positives** — Une seule requête au montage ; filtrage instantané ; les KPI cessent d'être
décoratifs et deviennent la table des matières de la page ; une seule heatmap au lieu de deux ; le
Conseil de classe reçoit un point d'entrée contextualisé au lieu d'être atteint « à froid ».

**Coûts assumés** —

1. **Le payload grossit** (~1 500 entiers). Acceptable pour un élève unique ; **à réévaluer si
   ZETIS accueillait un second élève** — le contrat est mono-élève par construction.
2. **De la logique d'agrégation passe côté client.** Elle est bornée au §3 (sommes et empilements) ;
   toute règle qui déciderait d'un statut pédagogique reste serveur. Risque de dérive à surveiller
   en revue : la première fois qu'un composant calcule « consolidé », l'ADR est violé.
3. **`GET /api/parent/activity/heatmap` devient redondant.** Vérification faite : il **n'a aucun
   consommateur hors du dashboard** — le Cahier de bord utilise `/activity/sessions`. Il est donc
   **supprimé**. ⚠️ Piège associé : `DayDetailPanel`, et donc `/activity/days/{date}` que le §4
   conserve explicitement, n'est monté que par la carte heatmap actuelle. Le panneau doit être
   **re-monté** sous la nouvelle carte, sinon la route survivante devient orpheline à son tour.
4. **Huit diagrammes sur une page** : densité élevée. C'est le focus KPI (§5) qui la rend
   praticable — sans lui, la page serait illisible. Si le focus était retiré, il faudrait retirer
   des diagrammes.
5. **Une migration, contrairement à ce qu'annonçait la version « Proposé »** : la table
   `skill_mastery_history` (§3 ter). C'est le prix de la courbe de fragilité, et le seul moyen
   honnête de la tracer. Coût borné : un modèle, une migration, un point d'écriture, un backfill.
6. **`GET /api/parent/dashboard` est réécrit, pas créé.** La route existe déjà avec un autre
   contrat (`sessions`, `xp`, `missions_completed` en KPI). C'est un **changement cassant** —
   acceptable parce qu'elle n'a qu'un seul consommateur, la page qu'on refait. Effet de bord :
   le repli sur des KPI mockés et le panneau de dépliage par KPI disparaissent, le focus (§5)
   les remplace.

## Hors v1 (ne pas ouvrir dans ce chantier)

- Génération asynchrone de la synthèse du Conseil de classe (`ai_jobs` + progression). **Question
  restée ouverte** : si la génération synchrone fige la page, elle contredit le §4. À trancher dans
  un ADR propre au Conseil de classe, pas ici.
- Export PDF du dashboard (le bouton « Exporter » de la maquette reste inerte).
- Comparaison inter-périodes côté graphe (superposition N vs N-1).
- Second élève / multi-profils.
- **Bandeau de fraîcheur du Conseil de classe** (§7) : demande un comptage serveur des
  `learning_events` postérieurs à `created_at`, donc une extension du module `reports`.
> ~~Relance automatique d'une lacune `in_progress`~~ — **traité le 2026-07-31**, autrement que
> prévu. L'enquête a montré que le manque n'était pas dans `generate_remediation` : `adr-0017 §5bis`
> désigne le SRS comme relais, mais ce relais était **inopérant** (template `revision` sans étape de
> réexplication, alors que le verdict l'exige). Le relais est réparé, le générateur de remédiation
> n'est **pas** élargi — la doctrine tient, elle ne fonctionnait simplement pas. Cf. l'amendement du
> `adr-0017 §5bis`.
- **Correction du bug d'échelle `mastery_score`** (0–100 traité comme 0–1 dans `missions/command.py`,
  `champion.py`, `reports/service.py` et deux modales Papa). Dette **antérieure** à ce chantier ; le
  §3 bis fait que le dashboard ne l'hérite pas, ce qui la rend traitable séparément.

## Vérifications de read-before-code — **effectuées le 2026-07-31**

Quatre affirmations de cet ADR venaient de la documentation et non du code. Résultats :

| # | Question | Verdict |
|---|---|---|
| 1 | `GET /api/parent/activity/heatmap` a-t-il un consommateur hors dashboard ? | ✅ **Non.** Deux appelants, tous deux dans le dashboard. Le Cahier de bord existe bien en code mais consomme `/activity/sessions`. → **route supprimée** (§Conséquences n°3) |
| 2 | Horodatage exploitable par créneau + index `(student_id, created_at)` ? | ✅ **Les deux existent.** `created_at` est un `TIMESTAMPTZ` toujours écrit en UTC explicite ; l'index `ix_learning_events_student_created` est bien créé par la migration `d0e1f2a3b4c5`. Aucun bucketing horaire n'existe encore — fonction pure à écrire |
| 3 | Le Conseil expose-t-il `generated_at` et accepte-t-il des query params ? | ❌ **Non, sur les trois points.** `generated_at` n'existe nulle part (c'est `created_at`), la route est `/conseil`, et la page ne lit aucun param. → **§7 amendé** |
| 4 | `SubjectFilterChips` et `subjectIcons` sont-ils dans `@zetis/ui` ? | ✅ **Oui, déjà extraits.** Pas de slice préalable |

**Écarts supplémentaires trouvés par l'audit, non anticipés par cet ADR** (chacun traité ci-dessus) :

- **« Consolidée » avait déjà une définition serveur**, différente de celle écrite ici → §3 bis.
- **« Fragile » n'en avait aucune**, et la courbe correspondante n'était pas reconstructible → §3 bis
  et §3 ter.
- **`GET /api/parent/dashboard` existait déjà** : réécriture cassante, pas création
  → §Conséquences n°6.
- **Les quiz ne peuvent pas entrer dans la file « À valider »** : `quizzes` n'a pas de
  `validation_status` (doctrine `adr-0014 §2`), et `lessons` utilise `status` et non
  `validation_status` → corrigé dans `page-dashboard.md`.
- **Ni react-query ni lib de graphes ne sont installés** : le patron maison est un hook par page, et
  les diagrammes se font en SVG inline. Cohérent avec la sobriété exigée — aucune dépendance ajoutée.
- **`Subject.color` et `Subject.slug` existent en base** mais la couleur n'est lue nulle part côté
  Papa ; la seule palette par matière vit dans un **mock** de l'app Massimo. L'agrégat sert `color`,
  le repli est une affaire de présentation (§3).

---

## Addendum — 2026-08-05 : une quatrième fenêtre, « Année »

**Demande.** Ajouter une période **Année** après « Trimestre », pour une vision globale.

**Décision.** `PERIODS` passe de `(7, 30, 90)` à `(7, 30, 90, 365)`. Le §1 se lit désormais
« quatre périodes préchargées » : la vision annuelle est une **fenêtre de plus dans le même
payload**, jamais une surface ni une requête à part — sans quoi le principe qui fonde toute la page
(changer de période ne déclenche aucun réseau) tomberait précisément sur la période la plus lourde.

**Année = 365 jours glissants**, et non « depuis la rentrée ». Tout le moteur suppose une fenêtre de
longueur fixe : `previous_window` pour les deltas, les 12 points de `series_marks`, le dénominateur
`active_days.of`, et la moyenne par jour de semaine de `bucket_slots`. Une année scolaire à
longueur variable demanderait un second moteur, pour une lecture qui ne serait pas plus vraie.

### Ce que l'ajout a révélé — le chargement bornait le calendrier sans le dire

L'agrégat chargeait ses événements sur `CALENDAR_WEEKS = 26` semaines, soit 182 jours, et **toutes**
les fenêtres n'étaient que des filtres en mémoire sur cette liste. Les deux nombres coïncidaient par
accident heureux : 182 jours couvrent tout juste 90 jours de fenêtre **plus** les 90 de la fenêtre
précédente qui sert le delta.

Poser `365` sur ce chargement aurait donné un écran crédible et faux :

- l'« Année » n'aurait montré que **182 jours sur 365 annoncés** ;
- son delta, calculé contre J-366 → J-730, aurait valu **0 pour toujours** — pas « stable », mais
  jamais mesuré ;
- **aucun test n'aurait échoué**, puisque tous les jeux d'essai tiennent dans les dernières semaines.

D'où deux bornes désormais **explicites et séparées**, là où l'une dérivait de l'autre en silence :

| borne | valeur | ce qu'elle règle |
|---|---|---|
| `projections.HISTORY_DAYS` | `max(PERIODS) × 2` = 730 j | profondeur du chargement des événements |
| `service.CALENDAR_WEEKS` | 26 semaines | étendue de la heatmap calendrier, **inchangée** |

Le facteur 2 n'est pas une marge de confort : c'est la fenêtre précédente, sans laquelle tout delta
est structurellement nul.

La heatmap reste à 26 semaines quelle que soit la période sélectionnée — décision du §6, non
rouverte ici. Elle a en revanche gagné un filtre explicite : sans lui, elle aurait hérité de la
nouvelle profondeur et rendu quatre fois plus de jours que la carte n'en dessine.

### Coût

Deux ans de `learning_events` pour un élève, en une requête déjà indexée
(`ix_learning_events_student_created`), projetés en mémoire comme avant. L'ordre de grandeur du §1
reste tenu : la quatrième fenêtre ajoute une colonne aux séries et aux créneaux, pas une requête.

### Vérification

Deux test-verrous, **chacun éprouvé par sabotage** — un verrou vert ne prouve rien tant qu'il n'a
pas échoué sur le bug qu'il prétend fermer :

1. `test_la_fenetre_annuelle_voit_VRAIMENT_un_an_et_son_annee_precedente` — un jour d'activité à
   J-300 doit compter dans l'année et pas dans le trimestre ; deux jours à J-500 / J-520 doivent
   rendre le delta **négatif**, ce qui prouve que la fenêtre précédente est bien lue. Échoue sur
   l'ancien chargement.
2. `test_le_calendrier_reste_a_26_semaines_malgre_le_chargement_elargi` — première rédaction
   **verte à tort** : un événement isolé porte 0 minute, le calendrier omet les jours vides, la
   liste sortait vide et l'assertion portait sur l'ensemble vide. Corrigée par deux événements
   espacés par jour **et** une assertion de non-vacuité.

Enfin, `test_le_decrochage_regarde_AU_DELA_de_la_fenetre_du_calendrier` visait 400 jours en dur —
désormais **dans** la fenêtre chargée. Il serait resté vert en ne prouvant plus rien : son
ancienneté est maintenant calculée depuis `HISTORY_DAYS`.

---

## Amendement 1 — Une bulle qu'on clique dit enfin QUELLES notions, et pas seulement combien — 2026-08-05

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0028` (l'agrégat unique, la dérivation client, les KPI-filtres, le §4 et son
> exception assumée), `adr-0020` (le Conseil de classe, l'évidence calculée), `adr-0017 §5bis`
> (le verdict découplé), `adr-0011` (le contexte canonique).
>
> **Ouvre une SECONDE exception** au §4 — la première depuis l'écriture de l'ADR. **Aucune
> migration** ici : celle de la portée matière du Conseil vit dans
> `adr-0020-conseil-de-classe-ia` (Amendement 1), écrit avec celui-ci.

### Contexte

Le nuage « Où agir » répond à *« quelle matière mérite un geste »*. Il y répond bien : une bulle
en bas à droite, c'est beaucoup de temps investi pour peu d'ancrage. Papa clique dessus, et là il
ne se passe presque rien.

Ce que le clic fait aujourd'hui, exactement : trois cartes recalculent sur la matière (rythme,
mémoire, charge de révision), trois se contentent d'atténuer les autres matières (répartition,
état des notions, le nuage lui-même), et **quatre surfaces restent globales** (les quatre KPI, la
file « À décider », la chaîne de contenus, la Lecture ZETIS). Il n'existe **aucune vue matière
cohérente** dans le dashboard.

Mais le vrai manque est ailleurs, et il est structurel.

> 🔴 **`SubjectOut` ne sert que des COMPTEURS. Jamais un nom.** `notions{consolidated, fragile,
> in_progress, total}`, `gaps_open`, `minutes`, `review_load` — que des entiers. Papa lit
> « Français : 8 notions à renforcer » et **aucune surface du dépôt ne peut lui dire lesquelles**.

#### Le bug qui a rendu ce manque visible

La carte « Lecture ZETIS » annonce *« Français : 8 notions à renforcer »* avec un lien
« preuve · 8 notions » vers `/lacunes`. En le suivant, Papa voit **une** notion, dans une section
« Déjà prises en charge — rien à décider ».

Cause, vérifiée dans le code : le constat compte les notions **fragiles**
(`SkillMastery.status ∈ {weak, learning}`, `dashboard/service.py:441`), tandis que `/lacunes`
liste des lignes **`Gap`** ouvertes (`progress/service.py:29`). **Deux populations disjointes sous
le même mot.** Une notion peut être `weak` sans avoir jamais produit de `Gap` — mauvais score à un
quiz de fin de cours, sans diagnostic — et une `Gap` peut rester ouverte alors que la maîtrise est
repassée à `solid`.

Trois aggravants :

- le champ **homogène** `subject["gaps_open"]` existe **deux lignes plus loin** dans le même objet,
  et n'est pas utilisé ;
- `/lacunes` **ne lit pas** `?subject=` — le paramètre est inerte de bout en bout ;
- `/progression`, cible de l'autre constat, est **entièrement en mock** (`data/mock`).

Et le test censé garder ça, `test_aucun_constat_sans_preuve`, ne vérifie que « `href` non vide et
`count >= 0` ». Il passerait avec un lien vers une route inexistante.

> Le même piège avait déjà été identifié et corrigé une fois, sur une autre paire de surfaces —
> voir la docstring de `_gaps_without_mission` (« deux surfaces qui se contredisaient sur la même
> notion »). Cette fonction-là part bien de `Gap` et délègue à `skills_with_active_mission`, source
> unique partagée avec `/lacunes`. Le constat de la Lecture ZETIS n'a pas reçu le même traitement.

#### Les quatre décisions prises par Papa avant ce document

Elles ne se rouvrent pas :

1. **Le détail s'affiche dans un panneau déplié SOUS la carte**, pas dans une modale.
2. **Contenu** : les notions **nommées** à renforcer · ce qui est déjà en cours · temps et
   régularité · couverture du référentiel.
3. **Le bouton lance un conseil de classe CIBLÉ** sur la matière — portée ajoutée côté backend
   (`adr-0020-conseil-de-classe-ia` (Amendement 1)).
4. **Le lien « preuve » de la Lecture ZETIS pointe vers ce panneau**, le comptage des notions
   fragiles restant juste.

### Décision

#### §1 — Le panneau est la SECONDE exception au §4, et elle se justifie comme la première

L'ADR-0028 §4 pose « zéro état de chargement après le premier rendu », avec **une** exception
assumée : le drill-down d'un jour de la heatmap, paresseux sur
`/api/parent/activity/days/{date}`. Le motif y était : *un journal d'événements est non borné, le
précharger pour 26 semaines × 8 matières annulerait le bénéfice de l'agrégat unique.*

Le panneau ouvre la seconde exception, pour **exactement le même motif** : la liste nommée des
notions d'une matière est non bornée, et la précharger pour huit matières mettrait dans le premier
rendu un volume que personne ne regardera.

Le panneau adopte donc le patron du drill-down, à la ligne près : état propriétaire de la carte,
rendu **sous** le contenu, séparateur `mt-4 border-t`, fetch dans un `useEffect` avec garde
d'annulation, trois états `loading` / `error` / `data`. **Pas de `role="dialog"`, pas d'Escape** —
ce n'est pas une modale, c'est un dépliage dans le flux.

> Une modale a été envisagée et écartée. Le dépôt n'a **aucune coquille de modale générique** :
> une dizaine de copies à la main, chacune avec son `useEffect` Escape, **aucune avec focus trap
> ni restauration de focus**. En écrire une onzième pour un panneau de lecture serait payer une
> dette d'accessibilité pour masquer le cockpit qu'on venait de filtrer.

#### §2 — Le principe qui borne le contenu : **le réseau ne sert que des NOMS**

C'est la règle qui décide, champ par champ, de ce qui a le droit d'être dans la réponse.

| Bloc du panneau | Source | Pourquoi |
|---|---|---|
| Notions **nommées** à renforcer | **réseau** | l'agrégat ne peut pas les porter |
| Missions actives, contenus en attente | **réseau** | idem — ce sont des titres, pas des compteurs |
| Temps et régularité | **mémoire** (`SubjectOut.minutes`, `calendar`, `slots`) | déjà servi |
| Couverture du référentiel | **mémoire** (`notions`, `has_referentiel`) + réseau pour le détail | déjà servi |

> 🔴 **Refaire venir du réseau un chiffre que l'agrégat porte déjà fabriquerait une seconde source
> pour une mesure affichée dans la bulle juste au-dessus.** C'est littéralement le bug qu'on
> corrige, reproduit à quelques pixels d'écart. La règle n'est pas une optimisation : c'est la
> prévention.

**Corollaire, et il est testable** : la réponse ne dépend d'**aucune période**. Donc **changer de
période avec le panneau ouvert ne déclenche rien**. Un `period` dans la signature de l'appel serait
la preuve que la règle a été enfreinte.

#### §3 — L'état du panneau vit dans l'URL, et ce n'est pas un choix de confort

`?panel=ou-agir`, en complément du `?subject=` déjà porté.

La raison est mécanique, pas esthétique. La carte « Lecture ZETIS » est **sur la même page** que
« Où agir ». Cliquer son lien de preuve est une navigation **vers la route courante** : React
Router **ne remonte pas** `DashboardPage`. Un `useState` local ne serait donc jamais réinitialisé —
et un `useState` avec initialiseur paresseux non plus, React ne rappelant l'initialiseur qu'au
premier rendu. **Le lien de preuve ne pourrait pas fonctionner.**

Trois règles qui vont avec :

1. **`panel` porte la clé de carte** (`ou-agir`), celle de `CARD_SCOPES` et de l'attribut
   `data-card`. Vocabulaire existant, extensible si une autre carte gagne un panneau, sans nouveau
   paramètre.
2. **`panel` sans `subject` connu → panneau fermé.** Un lien périmé ne doit pas ouvrir un vide —
   même repli que `visibleSubjects` sur un slug inconnu.
3. 🔴 **Filtrer REFERME le panneau.** Les pastilles, le donut et les barres empilées écrivent
   `panel: null` en même temps que `subject`. Sans cela, un `panel=ou-agir` resté dans l'URL ferait
   qu'un clic de pastille **rouvre** le panneau — donc qu'un **geste de filtrage part au réseau**.
   L'invariant du §1 de l'ADR cesserait alors d'être une propriété du code pour devenir une
   coïncidence d'ordre des clics.

> ⚠️ Écrire deux clés d'URL en un geste exige de corriger `patchParams`, qui construit son
> `URLSearchParams` depuis une **fermeture** sur `searchParams` : deux appels dans le même tick
> partent du même instantané et le second écrase le premier. Forme fonctionnelle
> (`setSearchParams(prev => …)`) obligatoire. Le `{ replace: true }` est conservé — **ouvrir un
> panneau n'est pas naviguer** non plus, le retour arrière doit quitter le dashboard et non replier
> le panneau puis désélectionner puis…

#### §4 — La carte ne change pas de largeur

Envisagé puis **rejeté** : élargir « Où agir » de 5 à 12 colonnes quand une matière est
sélectionnée.

> 🔴 Le SVG est en `w-full` sur un `viewBox` fixe : il s'étire avec son conteneur. Doubler la
> largeur de la carte **déplace horizontalement chaque bulle** — y compris celle que Papa vient de
> cliquer, **sous son curseur**, dans le même frame. Un geste de lecture ne recompose pas la page.

Le contenu s'adapte donc à ~560 px : liste pleine largeur pour les notions nommées, grille à deux
colonnes pour les blocs chiffrés. **Coût assumé** : la rangée se déséquilibre, la carte devenant
plus haute que ses voisines. C'est un vide à droite, pas un décalage — `items-start` l'autorise
déjà, et c'est exactement ce que fait la carte du rythme quand son drill-down s'ouvre.

#### §5 — La route vit dans `progress`, et s'appelle `analysis`

**`GET /api/parent/progress/subjects/{subject_id}/analysis`**

- **`progress` et non `dashboard`** : le docstring de `progress/router.py` revendique déjà le rôle
  — *« ces deux lectures servent le DÉTAIL des KPI correspondants du dashboard »*. `/gaps` et
  `/consolidated` en sont les frères. À l'inverse, `dashboard/router.py` documente « aucun query
  param de filtrage, **volontairement** » : y greffer une route filtrée par matière contredirait le
  contrat de son propre module.
- **`analysis` et non `focus`** : `DashboardFocus` désigne le focus KPI. Réutiliser le mot mettrait
  deux sens dans le même écran.
- **`subject_id` (entier) et non le slug** : c'est l'identité que consomme déjà l'ancrage
  `allowed_subject_ids` du Conseil, et le client tient `SubjectOut.id` en mémoire. Un second
  identifiant serait un second endroit où diverger.

**Aucun recalcul.** Tout ce que la route sert existe déjà et doit être **appelé**, jamais réécrit :
`progress.service.open_gaps` (qui est la source de `/lacunes`, donc les deux surfaces ne *peuvent
pas* se contredire), `skills_with_active_mission`, l'évidence du Conseil
(`mastery_by_skill`, `weighted_quiz_signal`, `srs_pressure`), `projections.notions_breakdown` et
ses ensembles de statuts, `production.coverage`, `missions.pilot`.

Deux propriétés à tenir, et à verrouiller :

- 🔴 **la route n'écrit rien** — contrairement au Conseil, qui fige toujours un rapport ;
- 🔴 **la route n'appelle aucun LLM** — c'est ce qui la rend instantanée et gratuite. **L'analyse
  est l'ÉVIDENCE ; le Conseil est la NARRATION.** Cette frontière est le cœur de l'addendum.

**`to_reinforce` = notions fragiles ∪ lacunes ouvertes**, jamais l'intersection, **sans plafond**.
Chaque entrée porte `is_fragile` **et** `has_open_gap` séparément : les deux mesures ne fusionnent
jamais sous un total unique. Le plafond de 8 notions par matière du Conseil borne un **prompt**,
pas un panneau — les deux nombres diffèrent donc légitimement, et l'écart doit être **affiché**.

#### §6 — Le lien de preuve pointe vers le panneau

`"/lacunes?subject={slug}"` devient `"/?subject={slug}&panel=ou-agir"`.

Le comptage **reste** celui des notions fragiles : il est juste, et c'est la mesure la plus fournie
aujourd'hui (8 en français contre 1 seule lacune ouverte). Ce qui change, c'est la **cible** — le
seul endroit qui montrera vraiment ces 8 notions, nommées.

⚠️ Le `href` est un **contrat serveur** (`Evidence.href`). Il se corrige dans
`dashboard/service.py`, jamais réécrit côté client : une règle d'adressage n'a rien à faire dans un
composant de présentation.

#### §7 — Le verrou qui manquait

> 🔴 **Un constat ne peut plus annoncer un nombre que sa preuve ne sert pas.**

Test-verrou : pour chaque item de `reading`, résoudre la matière depuis son `href`, appeler la
route d'analyse, et exiger que le compte annoncé **égale** le nombre d'éléments réellement servis.
Il **échoue sur le code d'aujourd'hui** — c'est ce qui prouve le bug.

C'est la seule ligne de cet addendum qui protège quelque chose de façon permanente. Les autres
décrivent une surface ; celle-ci empêche une classe entière de mensonges de revenir.

### Ce que cet addendum ne fait pas

- **Il ne répare pas `/lacunes`**, qui continue d'ignorer `?subject=`. Chantier à part.
- **Il ne débranche pas `/progression` du mock.** Le second constat de la Lecture ZETIS
  (« 1 notion consolidée » → `/progression?subject=`) souffre du même défaut et n'est pas traité
  ici — signalé, non corrigé.
- **Il ne résout pas la divergence `Gap.subject_id` vs `Skill.subject_id`.** Le dashboard et
  `/lacunes` attribuent une lacune par la colonne du `Gap` ; le Conseil groupe par la matière de la
  **notion**. L'écriture ne garantit pas leur égalité (`diagnostics/service.py` écrit
  `subject_id=quiz.subject_id`). Le panneau suit la convention du dashboard, et un test **borne**
  l'écart sans le corriger.
- **Il ne change pas ce que Y mesure** dans le nuage. Séparer des matières à *exactement* 0 %
  consolidé demanderait de passer aux notions *engagées* — écarté par Papa le 2026-08-05, ce serait
  un autre sens de carte.
- **Il ne donne pas d'état de chargement au filtrage.** Le §4 tient : seul le dépliage du panneau
  attend.

### Le signal qui dirait qu'on s'est trompé

- **Papa ouvre le panneau et le referme sans rien décider.** Le panneau serait alors une surface de
  consultation de plus, pas un point de décision — il faudrait ramener les actions dans le panneau
  plutôt que d'y ajouter des chiffres.
- **Le panneau devient le premier endroit où l'on regarde**, avant les KPI. Cela voudrait dire que
  le dashboard répond mal à la question « où en est Massimo » et que le nuage n'est plus un
  repérage mais un sommaire.
- **Une troisième exception au §4 est demandée.** Deux exceptions bornées sont une règle avec ses
  cas ; trois sont une règle qui n'en est plus une. Le jour où la question se pose, c'est le §4
  qu'il faut rouvrir — pas l'exception qu'il faut accorder.
- **Le compte du constat et celui du panneau divergent à nouveau.** Le verrou du §7 aura été
  contourné plutôt que respecté, et la leçon aura été perdue une deuxième fois.

---

## Amendement 2 — Le KPI qui manque : « À renforcer » — 2026-08-05

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Proposé**.

### Statut

Proposé — 2026-08-05.

> S'appuie sur : `adr-0028` **§3 bis** (les quatre segments de maîtrise, sur les statuts réels),
> **§3 ter** (`skill_mastery_history`, la table qui rend la régression datable), **§5** (les KPI
> sont des filtres de focus) ; **Amendement 1** (le panneau qui NOMME les
> notions à renforcer, et la règle « fragile ∪ lacune, jamais l'intersection, jamais fondues sous
> un total unique ») ; `adr-0038` et son addendum (*« un constat ne peut plus annoncer un nombre
> que sa preuve ne sert pas »*).
>
> **Ne rouvre pas** : la définition de « consolidée » (`mastered`, ≥ 90 — §3 bis) ; le mapping des
> quatre segments ; le retrait de l'XP des KPI (§5) ; l'exception au §4 accordée au panneau
> d'analyse.
>
> **Ne révoque rien.** Il **complète** le §5 : quatre KPI deviennent cinq, et le tableau de focus
> du §5 gagne une ligne (il en corrige une autre au passage — voir le read-before-code).
>
> **Aucune migration, aucune route nouvelle.** `_entered_fragile_at` et `reconstruct_series`
> existent déjà et servent la courbe ambre **par matière** depuis le §3 ter ; il ne s'agit que de
> les appeler une fois de plus, globalement.
>
> ⚠️ **Correction apportée à l'implémentation (2026-08-05).** La version « Proposé » annonçait
> « aucune requête de plus » : **c'est faux**. `history_since` (§5 octies) en coûte **une** — un
> `MIN(changed_at)` sur `skill_mastery_history`. La dériver de `_entered_fragile_at` aurait rendu
> une date plus récente que la réalité (ce dictionnaire ne porte que les statuts fragiles) et aurait
> retiré l'avertissement trop tôt. Une requête indexée contre une date juste : le compromis est
> assumé, mais l'ADR ne doit pas prétendre le contraire.
>
> Maquette : `docs/frontend-papa/mockup/mockup-dashboard-kpi-notions-v1.html` (chiffres réels de la
> base de dev au 2026-08-05).

### Contexte

Le bandeau porte **deux** KPI sur les notions — « Notions consolidées » et « Lacunes ouvertes ».
Relevé en base de dev le 2026-08-05, voici ce qu'il dit et ce qu'il tait :

| | |
|---|---|
| consolidées (`mastered`) | **1** / 280 |
| **à renforcer** (`weak` + `learning`) | **13**, dont **4 entrées les 31/07 et 01/08** |
| en cours (`solid`, `in_progress`, non tranché) | 5 |
| non abordées (aucune ligne de maîtrise) | 261 |
| lacunes ouvertes (`Gap` ∈ `open`, `in_progress`) | **1** |

Papa lit la ligne de tête et retient : *une notion consolidée, une lacune, tout est pris en
charge*. Les **13 notions à renforcer**, en **hausse cette semaine**, ne figurent nulle part —
il faut descendre jusqu'à la barre empilée pour les voir, et savoir qu'elles sont ambre.

> 🔴 **Le seul signal de RÉGRESSION du dashboard n'a aucune mesure de tête.** Le §3 ter a payé une
> table et une migration pour rendre la fragilité datable, en écrivant noir sur blanc que la courbe
> ambre est *« le signal de régression qu'un parent a besoin de voir tôt »*. Elle est publiée à
> deux cartes de distance du seul endroit qu'on lit tôt.

#### Le piège que l'ajout rouvre, et qu'il faut refermer dans le même geste

Poser « À renforcer » dans le bandeau met **13** à côté de **1** pour ce qui *sonne* comme la même
chose. Le dépôt garde la trace du jour où les deux ont porté le même libellé —
`dashboardDerive.ts:276` : *« affichait 1 à côté de 9 sur le même écran, constaté au premier rendu
réel »*. Le même piège a coûté l'addendum « analyse par matière » en entier : un constat comptait
des notions **fragiles** et sa preuve servait des lignes **`Gap`**, deux populations disjointes
sous un mot unique.

Ce ne sont pas deux mesures du même objet avec des seuils différents. Ce sont **deux tables** :

- **à renforcer** = un **palier de maîtrise** (`skill_mastery.status`), il bouge tout seul au fil
  des quiz ;
- **lacune ouverte** = une **décision ouverte** (`gaps.status`), ouverte par un diagnostic faible,
  des erreurs répétées, ou par Papa — et qui se ferme quand on décide qu'elle est fermée.

Une notion peut être `weak` sans avoir jamais produit de `Gap` ; une `Gap` peut rester ouverte
alors que la maîtrise est repassée à `solid`. **Les deux nombres n'ont aucune raison d'être
égaux, et l'écran doit le dire.**

### Décision

#### §5 bis — Un cinquième KPI, « À renforcer »

`kpis.fragile` : somme des notions `weak` + `learning` sur toutes les matières, servie par le
serveur comme les quatre autres.

**Contrat `KpiValue`, pas `KpiOutOf` — pas de dénominateur.** « 13 / 280 » rapporterait les
notions fragiles au programme entier, dont **261 notions jamais abordées** ; le ratio n'aurait
aucun sens et suggérerait une proportion rassurante là où il n'y en a pas. Le KPI porte un
**nombre**, et la barre empilée porte déjà la proportion, matière par matière.

**Ordre du bandeau** : temps actif · régularité · **consolidées · à renforcer · lacunes ouvertes**.
Les trois KPI de notions se lisent de gauche à droite dans l'ordre du parcours pédagogique :
ce qui est acquis, ce qui glisse, ce qui attend une décision.

**Le libellé est « À renforcer »**, mot pour mot celui du segment de la barre empilée. Le KPI et
son segment doivent se reconnaître à l'œil ; leur donner deux noms fabriquerait deux mesures.

#### §5 ter — Le delta vient de la courbe, par construction

`delta ≡ value − sparks.fragile[0]`, et rien d'autre.

Ce n'est pas une commodité de calcul, c'est une **garantie de non-contradiction** : le chiffre
affiché et la sparkline dessinée trois millimètres plus bas ne peuvent pas raconter deux histoires
différentes. C'est la doctrine que `unattributed_minutes` a déjà payée sur cette page (*« sans lui,
les deux chiffres se contredisaient sur le même écran »*).

> ⚠️ **Ce delta n'est pas un solde, et il ne peut jamais être négatif.** `reconstruct_series`
> projette **l'ensemble d'aujourd'hui** à rebours : « +4 » veut dire *« parmi les 13 notions
> fragiles d'aujourd'hui, 4 le sont devenues pendant la fenêtre »*. Une notion réparée pendant la
> fenêtre n'est pas soustraite — elle disparaît simplement des deux nombres. Écrit ici, et dit dans
> l'infobulle, pour que personne ne lise « +4 » comme un bilan.

**Alternative écartée : le vrai solde** (entrées − sorties dans `skill_mastery_history` sur la
fenêtre). Il est calculable et il serait plus riche. Il **contredirait la sparkline** affichée à
côté de lui, qui est une projection à rebours et non un comptage historique. Deux nombres qui se
contredisent sur la même carte est exactement le défaut que les `adr-0038` et `adr-0039` passent
leur temps à refermer ; on ne le rouvre pas pour gagner un signe.

#### §5 quater — Le sens de lecture vient de la couleur, et la prop est renommée

Sur ce KPI, **une hausse est une mauvaise nouvelle** — l'inverse des quatre autres.

`KpiFocusCard` ne connaît aujourd'hui que `deltaDirection: "up" | "down"`, où `"down"` peint en
ambre. Brancher le KPI fragile sur `deltaDirection="down"` donnerait le **bon rendu par un chemin
faux** : rien ne descend. Un nom qui ment est une dette qui se paie au premier lecteur.

**La prop devient `deltaTone: "good" | "bad"`** — trois sites d'appel à reprendre. La couleur
découle du **sens**, plus de la direction.

La carte fragile est **ambre de bout en bout** — valeur, delta, sparkline, indication de focus — du
même ambre que le segment « à renforcer » de la barre empilée (`fill-papa-warn`). Aucune flèche
inversée, aucun pictogramme : le sens de lecture passe par la couleur, qui est déjà celle du
segment correspondant.

#### §5 quinquies — Ce que le focus « À renforcer » allume

| KPI | Cartes conservées |
|---|---|
| **À renforcer** | Évolution de la mémoire · État des notions · Où agir · **Lecture ZETIS** |

**La Lecture ZETIS en fait partie** parce qu'elle énonce littéralement *« Français : 8 notions à
renforcer »* — c'est la preuve du KPI en toutes lettres, et son lien mène désormais au panneau qui
les nomme (`addendum analyse-par-matiere §6`).

**La Chaîne de contenus n'en fait pas partie** : elle parle de **production**, pas de maîtrise.
Idem pour la Charge de révision, la Répartition du temps et la Heatmap.

Quatre cartes sur huit — exactement la portée de `open_gaps`. Le focus continue d'atténuer la
moitié de la page ; un focus qui n'atténue plus rien est un clic qui ne veut plus rien dire.

#### §5 sexies — Trois infobulles, parce que trois nombres voisins ne disent pas la même chose

Les trois KPI de notions portent chacun un « i ». Ce n'est pas de l'ornement : c'est la seule chose
qui empêche le bandeau de rejouer la confusion de `dashboardDerive.ts:276`.

- **Notions consolidées** — *« Notions au palier `mastered` (score ≥ 90). Le dénominateur est le
  programme entier — non abordées comprises —, pas le nombre de notions travaillées. »*
- **À renforcer** — *« Notions déjà travaillées dont la maîtrise n'est pas assurée (`weak`,
  `learning`). Une notion qui redescend de "consolidée" atterrit ici. Ce n'est pas le compteur de
  lacunes : une lacune est une décision ouverte, pas un palier de maîtrise. »*
- **Lacunes ouvertes** — *« Lignes `Gap` ouvertes ou en cours — ouvertes par un diagnostic faible,
  des erreurs répétées, ou par vous. Compte des décisions à traiter : ce nombre et « À renforcer »
  n'ont aucune raison d'être égaux. »*

Une **quatrième** infobulle, dans la légende de « État des notions », sur le segment « en cours » :
*« presque acquis (≥ 70), en cours de mission, ou pas encore tranché »*.

#### §5 septies — « En cours » reste un seul segment, et le dit

`solid` (≥ 70) reste dans le même sac que `in_progress` et que les statuts non tranchés. **Le
fourre-tout est assumé et documenté, pas scindé.**

Le scinder demanderait une cinquième couleur sur une barre qui en porte déjà quatre, un segment de
plus dans toutes les surfaces qui lisent `notions_breakdown`, et rendrait la légende moins lisible
qu'elle ne l'est. La règle de `notions_breakdown` — *« mieux vaut une notion mal rangée qu'une
notion invisible »* — reste en vigueur ; on lui ajoute seulement de dire ce qu'elle range.

#### §5 octies — L'honnêteté sur la jeunesse de la courbe s'auto-périme

`skill_mastery_history` ne compte que **4 lignes** (31/07 et 01/08) : la table est récente. Sur la
fenêtre « Année », la courbe ambre sera donc plate jusqu'à fin juillet puis montera d'un coup —
**un artefact de mise en service, pas une dégradation de Massimo**.

Le payload sert `history_since` : la date de la plus ancienne ligne de `skill_mastery_history`, ou
`null` si la table est vide. **Le client n'ajoute la phrase d'avertissement à l'infobulle que si la
fenêtre affichée commence avant cette date.**

Une phrase figée aurait été juste six mois puis fausse pour toujours, et personne ne serait revenu
la retirer. Celle-ci **disparaît d'elle-même** le jour où l'historique couvre la fenêtre.

#### §5 nonies — Le verrou

> 🔴 **La valeur du KPI « À renforcer » est exactement la somme des segments ambre de « État des
> notions ».**

Deux assertions, sur le payload réel :

- `kpis.fragile.value == Σ subjects[].notions.fragile`
- `kpis.fragile.delta == kpis.fragile.value − sparks.fragile[0]`

C'est la seule ligne de cet addendum qui protège quelque chose de façon permanente : elle interdit
qu'un KPI et la carte qu'il éclaire se mettent à compter deux populations différentes — la classe
de défaut qui a produit ce chantier.

> ⚠️ **Ce verrou n'en est un qu'une fois prouvé par sabotage.** Muter le calcul du KPI doit le
> faire passer au **rouge**. Trois fois cette année, un test-verrou central est resté **vert** sur
> un sabotage délibéré ; on ne signe plus celui-ci sur sa seule lecture.

> 🔴 **Correction apportée à l'implémentation (2026-08-05) — les deux assertions ci-dessus, seules,
> sont TAUTOLOGIQUES.** `_periods` calcule `fragile_now` **par cette somme même** sur `subjects` :
> opposer `kpis.fragile` à `Σ subjects[].notions.fragile` compare `sum(x)` à `sum(x)`, vrai par
> construction. De même, `delta == value - sparks.fragile[0]` réénonce la formule du serveur.
>
> Le verrou n'en devient un que par un **ancrage extérieur au payload** : le test pose un nombre
> connu de notions fragiles et l'écrit **en dur**. Et ce nombre doit **discriminer** — le premier
> jet valait `1`, ce qui coïncidait avec le compte des consolidées ET des « en cours » du même
> fixture : un KPI branché sur le mauvais segment serait resté vert. À **2**, il tombe.
>
> Prouvé le 2026-08-05 par trois sabotages, chacun rouge : le KPI compte le mauvais segment
> (2 tests rouges), le champ disparaît du schéma Pydantic (3 rouges), le delta cesse d'être dérivé
> de la courbe (1 rouge).

#### §5 decies — La grille

`grid-cols-2 md:grid-cols-3 xl:grid-cols-5`.

Mesuré dans le navigateur sur la maquette : à **1000 px** la grille tombe à deux colonnes et
« Lacunes ouvertes » se retrouve **seule sur sa ligne**. Le palier `md:grid-cols-3` rend 3 + 2, ce
qui est moins bancal. En dessous de 768 px l'orpheline est acceptée : le dashboard Papa est
desktop-first, et la maquette a par ailleurs révélé un vrai débordement à corriger — l'infobulle
du KPI de droite sortait à 1553 px pour un viewport de 1440 et faisait scroller la page
horizontalement (ancrage à droite pour la carte de droite).

> ⚠️ `DashboardFocus = keyof DashboardKpis`. Ajouter `fragile` **élargit le focus
> automatiquement**, et chaque `Record<DashboardFocus, …>` du dépôt (`KPI_LABELS`,
> `KPI_FOCUS_HINTS`) devient incomplet — le compilateur les désigne un par un, exactement comme
> l'élargissement de `DashboardPeriod` l'a fait pour la fenêtre « Année ». **Mais ce filet n'existe
> que si l'on lance le bon outil** : `tsc --noEmit` à la racine ne vérifie rien dans ce dépôt, seul
> `tsc -b` le fait.

> 🔴 **Le filet avait un trou, et il a coûté un KPI mort (trouvé le 2026-08-05, à l'implémentation).**
> `useDashboard` gardait la liste blanche des focus valides en **`DashboardFocus[]`**, pas en
> `Record`. Un **tableau** de `DashboardFocus` reste parfaitement valide en étant **incomplet** :
> `tsc` est resté muet, le clic écrivait bien `?focus=fragile`, le garde `isFocus` le **refusait**,
> et la carte ne s'activait **jamais**. Le KPI aurait été livré inerte — le motif « mergé sans
> avoir jamais été vu », déjà payé sur le bandeau Massimo.
>
> Corrigé en `Record<DashboardFocus, true>`, qui rend l'omission impossible à la compilation. **La
> règle générale, à opposer au prochain ajout** : une union qui pilote un comportement ne se garde
> jamais par un tableau — le filet n'est pas dans l'union, il est dans le `Record` typé **par**
> l'union. C'est la troisième fois que cette leçon se paie (`DashboardPeriod`, `COUNCIL_PERIOD_LABEL`,
> et celle-ci).

### Vérifications de read-before-code — effectuées le 2026-08-05

| Hypothèse de départ | Verdict |
|---|---|
| La classification ZETIS est ternaire (acquis / en cours / lacune) | ❌ **Fausse.** Quatre segments de maîtrise **plus** un objet d'une autre table |
| « À renforcer » a déjà une mesure quelque part | ❌ Nulle part en tête de page ; seulement `subjects[].notions.fragile` et la courbe ambre |
| Une série globale de fragilité existe | ❌ `DashboardSparks` n'a que quatre champs ; les séries `fragile` sont **par matière** |
| Il faudra une migration ou une requête de plus | ❌ `_entered_fragile_at` + `reconstruct_series` suffisent — **aucune** |
| `FRAGILE_STATUSES` vit dans `progress/service.py`, comme l'annonce le §3 bis | ❌ **Faux dans le code livré** : les trois constantes sont dans `dashboard/projections.py:41-43`, et `progress/analysis.py` les importe (`from app.modules.dashboard import projections as p`). La dépendance va de `progress` **vers** `dashboard`, l'inverse de ce que le §3 bis laissait attendre. **Constat, pas correction** — déplacer les constantes est un refactor transverse, hors périmètre |
| Le tableau de focus du §5 décrit le code | ⚠️ **Presque.** Il ne liste « Lecture ZETIS » que sous « Lacunes ouvertes » ; le code lui donne `["consolidated", "open_gaps"]` (`dashboardDerive.ts:253`). **Le code a raison** — la carte porte les deux constats. Le tableau du §5 est corrigé par le présent addendum |
| `GLOSSARY.md` est aligné sur l'écran | ❌ L'entrée « Lacune ouverte » annonce encore *« formulée côté interface en "notion à renforcer" »* — formulation que le code a **explicitement refusée**. Corrigée avec cet addendum |

### Ce que cet addendum ne fait pas

- **Il ne scinde pas « en cours »** (§5 septies) — décision, pas oubli.
- **Il ne déplace pas les constantes de statut** hors de `dashboard/projections.py`, malgré ce
  qu'annonce le §3 bis. Le §3 bis est **daté**, pas réécrit.
- **Il ne corrige pas la dette d'échelle 0–100 / 0–1.** Le dashboard raisonne sur des statuts et
  n'en hérite pas (§3 bis) ; elle reste suivie ailleurs.
- **Il ne touche ni au `SubjectAnalysisPanel`, ni à la Lecture ZETIS, ni à la barre empilée** —
  hors l'infobulle ajoutée à sa légende.
- **Il ne crée aucune alerte et aucun seuil.** Un « À renforcer » qui déclencherait un signal
  ferait du dashboard un émetteur ; il reste une surface qu'on **consulte**.
- **Il n'ajoute aucun lien depuis le KPI.** Un KPI est un **filtre de focus** (§5) ; le chemin vers
  les noms passe par « Où agir » et son panneau, qui est fait pour ça.

### Le signal qui dirait qu'on s'est trompé

- **Papa regarde « À renforcer » et ne clique jamais.** Le KPI serait un chiffre d'ambiance. La
  réponse serait de lui faire ouvrir le panneau d'analyse, pas d'atténuer davantage de cartes.
- **« À renforcer » et « Lacunes ouvertes » sont à nouveau confondus** — dans une conversation, un
  commit, ou un écran. Les infobulles n'auront pas suffi, et c'est alors le **libellé** qu'il
  faudra changer, pas l'infobulle qu'il faudra rallonger.
- **Quelqu'un « corrige » le delta pour qu'il puisse être négatif.** Le chiffre et la sparkline
  divergeront le jour même. C'est le §5 ter qu'il faut rouvrir, pas contourner.
- **Le bandeau passe à six KPI.** Cinq mesures de tête est déjà la limite de ce qu'on embrasse d'un
  coup d'œil. Un sixième dirait que le dashboard ne hiérarchise plus, et la réponse serait d'en
  **retirer** un — pas d'élargir la grille.

### Coût

1. `packages/types` : `fragile` dans `DashboardKpis` et `DashboardSparks`, `history_since` dans
   `DashboardPayload`.
2. `dashboard/service.py` : une somme et un `reconstruct_series` de plus, sur des données déjà
   chargées, **plus une requête** pour `history_since`. **Aucune migration.**
2 bis. 🔴 `dashboard/schemas.py` — **oublié de la version « Proposé », et son oubli aurait été
   silencieux.** La route est servie avec `response_model=DashboardOut` : un champ absent du schéma
   Pydantic est **filtré de la réponse HTTP sans erreur**. Le service aurait été juste et l'API
   n'aurait rien servi. C'est aussi pourquoi le verrou du §5 nonies passe par la **réponse HTTP** et
   non par le dict du service.
3. `KpiFocusCard` : `deltaDirection` → `deltaTone` (3 sites d'appel).
4. `dashboardDerive.ts` : une entrée dans `KPI_LABELS`, `KPI_FOCUS_HINTS`, `KPI_ORDER`, et
   `fragile` ajouté à quatre entrées de `CARD_SCOPES`.
5. `DashboardPage.tsx` : une carte, la grille en `md:grid-cols-3 xl:grid-cols-5`, quatre
   infobulles.
6. Tests : le verrou du §5 nonies **et son sabotage**.
7. `GLOSSARY.md` : l'entrée « Lacune ouverte » remise au réel.

---

## Amendement 3 — La carte mémoire ne pouvait montrer aucun événement — 2026-08-06

> Fusionné depuis **Amendement 3** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-06.

> S'appuie sur : `adr-0028` **§3 ter** (`skill_mastery_history`, la table qui rend la bascule
> datable), **§5** (les KPI sont des filtres de focus, `CARD_SCOPES`), **§6** (la carte
> « Évolution de la mémoire » et ses trois courbes) ;
> **Amendement 2** **§5 ter** (le vrai solde, écarté pour le delta du KPI) et
> **§5 octies** (`history_since`, l'avertissement qui s'auto-périme).
>
> **Ne rouvre pas** : la définition des quatre paliers de maîtrise (§3 bis) ; `reconstruct_series`
> et sa règle de projection à rebours, qui continue de servir les quatre stocks ; le contrat de
> l'agrégat unique (§1, §2) — **aucune requête HTTP nouvelle**, tout passe par le payload existant.
>
> **Ne révoque rien, et borne une chose.** Le §5 ter de l'addendum « À renforcer » écartait le vrai
> solde ; le présent addendum **confirme ce refus là où il portait** — le delta du KPI — et
> l'autorise **ailleurs**, dans une vue nommée qui déclare ne pas se compter comme lui. Voir §6
> quinquies.
>
> **Aucune migration, aucune route nouvelle.** `SpacedReviewAttempt` et `SkillMasteryHistory`
> existent ; il s'agit de les lire.

### Contexte

La carte portait trois courbes. Mesuré **à l'écran, sur la base de dev**, le 2026-08-05 :

| | |
|---|---|
| maximum de l'axe des ordonnées | **222** (fixé par `covered`) |
| « à renforcer » | 13 → **5,8 %** de la hauteur |
| « consolidées » | 1 → **0,45 %** de la hauteur |

> 🔴 **Les deux courbes que la carte existe pour montrer étaient tracées dans les 6 % du bas d'un
> cadre de 190 px** — une dizaine de pixels — pendant que la courbe de contexte en occupait 94 %.

Le second défaut est structurel, et il ne se voit pas :

> 🔴 **Aucune des trois courbes ne peut redescendre.** `reconstruct_series` calcule *« l'ensemble
> d'aujourd'hui, moins ce qui y est entré après »* : c'est croissant **par construction**. Une
> notion consolidée en juin puis perdue en juillet n'est pas dans `consolidated_now`, donc elle
> n'apparaît **nulle part** sur la courbe verte — elle est absente de **tout son passé**, comme si
> elle n'avait jamais été apprise.

Trois courbes qui ne peuvent ni baisser, ni se croiser, ni s'interrompre ne montrent **jamais
d'événement**. L'œil n'a aucun moment où se poser. C'est le sens de la demande qui a ouvert ce
chantier : *« propose-moi d'autres courbes qui sont plus expressives »*.

#### Ce que l'interversion a rendu visible

Le même chantier a interverti « État des notions » (à gauche) et « Évolution de la mémoire » (à
droite), pour que la **cause** — cliquer une matière dans les barres empilées filtre
`visibleSubjects` — se lise avant son **effet** — les courbes voisines se redessinent.

Une fois côte à côte, la redondance saute aux yeux : la carte de droite montrait **la même
décomposition que sa voisine de gauche**, simplement étalée dans le temps.

### Décision

#### §6 bis — Quatre vues, et non un tracé de plus

La carte porte un sélecteur de vue dans son en-tête, patron déjà en service sur
`WorkRhythmCard` (`DashboardCard` a une prop `action` documentée « sélecteur de vue »).

| vue | nature | ce qu'elle répond |
|---|---|---|
| **Paliers** | 4 stocks empilés | où en est le programme |
| **Révisions** | flux SRS daté + charge à venir | ce qui a été revu, et comment |
| **Rétention** | ratio 0–100 % | ce qui tient, sur ce qui a été travaillé |
| **Solde** | flux de bascules daté | ce qui est entré et sorti du palier consolidé |

**Elles ne partagent ni la même unité, ni la même nature de mesure.** Les superposer sur un axe
unique fabriquerait exactement la contradiction que les `adr-0038` et `adr-0039` passent leur temps
à refermer.

#### §6 ter — « Paliers » est la vue par défaut, et ce n'est pas un choix esthétique

`CARD_SCOPES` fait allumer cette carte par les KPI **« Notions consolidées »** et **« À
renforcer »** (§5). Un clic sur ces KPI doit tomber sur la vue qui **justifie leur chiffre**.

Ouvrir par défaut sur « Révisions » — la vue la mieux fournie en données, et de loin — casserait ce
contrat **en silence** : le KPI resterait allumé, la carte resterait éclairée, et le diagramme
affiché ne dirait plus rien du nombre cliqué.

**L'aire empilée corrige le défaut d'échelle par construction** : les bandes se lisent à
l'**épaisseur**, jamais en proportion du maximum d'une courbe voisine. Une courbe de contexte ne
peut plus confisquer le cadre.

⚠️ **La bande grise domine, et c'est vrai.** Sur 301 notions au programme, 19 ont été travaillées.
Ce n'est pas un défaut du diagramme : c'est l'état de l'année, que l'ancien tracé cachait. La note
de la carte le nomme (*« ce sont les notions jamais abordées »*) au lieu de le laisser lire comme
un retard.

#### §6 quater — La rétention est le seul tracé qui puisse REDESCENDRE

`consolidées ÷ (consolidées + à renforcer + en cours)`, en pourcentage.

- **L'axe est 0–100 % quoi qu'il arrive** : le défaut d'échelle ne peut pas revenir.
- **Le dénominateur est « travaillées », jamais le programme entier.** Rapporté à 301, le taux
  vaudrait 0,3 % — un nombre rassurant et faux, exactement l'erreur que le §5 bis de l'addendum
  précédent a refusée pour le KPI.
- **Le dénominateur est AFFICHÉ à côté du taux** (*« 5 % — soit 1 notion consolidée sur 19
  travaillées »*). Avec 19 notions, une seule notion déplace la courbe de 5 points ; un pourcentage
  nu laisserait croire à une mesure stable.
- **Un point sans dénominateur est un TROU, pas un zéro.** « 0 % de rien » est un jugement, pas une
  mesure, et il se lirait comme un effondrement. La courbe s'interrompt, et les segments ne sont
  pas reliés par un trait qui inventerait la mesure manquante.

#### §6 quinquies — Le solde est autorisé ICI, et le §5 ter reste vrai LÀ

> `**Amendement 2** §5 ter` écarte le vrai solde (entrées − sorties dans
> `skill_mastery_history`) **au titre du delta du KPI**, au motif qu'*« il contredirait la
> sparkline affichée à côté de lui »*.

**Ce motif est intact, et il ne portait que sur cette adjacence.** Le KPI et sa sparkline sont deux
rendus du même nombre à trois millimètres l'un de l'autre ; le solde y aurait été une troisième
lecture non réconciliable, au même endroit.

La vue « Solde » est autre chose : une **vue nommée, isolée, qu'on choisit**, dont la note dit en
toutes lettres qu'elle ne se compte pas comme le KPI. Le delta du KPI reste
`value − sparks.fragile[0]`, inchangé.

C'est le seul endroit du dashboard où une **perte** est visible.

⚠️ **Un flux et un stock ne se réconcilient pas, et aucune surface ne doit les présenter comme
dérivés l'un de l'autre.** C'est écrit dans `projections.py`, dans `dashboard.ts` et dans le
schéma Pydantic — trois fois, parce que c'est trois fois qu'un lecteur pressé pourrait les
additionner.

#### §6 sexies — Un solde vide dit l'ABSENCE DE TRACE, jamais l'absence de mouvement

`skill_mastery_history` compte **4 lignes**, toutes des entrées en `weak`/`learning` (31/07 et
01/08). Aucune ne franchit le palier consolidé : la vue « Solde » est donc **légitimement vide**
aujourd'hui.

> 🔴 **Dessiner une ligne plate à zéro se lirait « stable ».** C'est un mensonge tranquille : la
> mesure ne dit pas « rien n'a bougé », elle dit « je n'ai pas de trace ».

La vue affiche donc un état vide **explicite**, qui reprend `history_since` (§5 octies) : *« Aucune
entrée ni sortie du palier consolidée n'est enregistrée sur cette fenêtre. L'historique des
bascules ne commence qu'au 31/07/2026 : c'est une absence de trace, pas une absence de
mouvement. »*

**Trois règles de comptage**, toutes destinées à ne jamais inventer un mouvement invérifiable :

1. l'état **avant** la première bascule connue d'une notion est inconnu et le reste. Une première
   bascule vers `mastered` compte comme une entrée (c'est ce que le backfill a posé depuis
   `mastered_at`) ; une première bascule vers autre chose ne compte **rien** — surtout pas une
   perte, qui supposerait un acquis jamais observé ;
2. seule une notion **observée consolidée** peut être comptée perdue ;
3. une bascule qui ne traverse pas la frontière (`weak` → `learning`) ne compte nulle part.

Une notion qui entre et ressort dans la même fenêtre compte **les deux fois** : ce sont des
mouvements, pas un solde de population.

#### §6 septies — Les deux moitiés de « Révisions » n'ont pas la même échelle, et la carte le dit

`SpacedReviewAttempt` porte **38 passages datés et notés** (`again|hard|good|easy`) du 04/07 au
04/08 — la seule donnée du dépôt qui mesure la **mémoire elle-même** plutôt qu'un palier de
maîtrise. C'est aussi, et de loin, la vue la mieux fournie.

La vue place **aujourd'hui au centre** : à gauche les passages effectués, empilés par note du raté
(en bas) au su (en haut) ; à droite les 14 jours de `review_load`.

⚠️ **L'axe des abscisses n'est pas linéaire de part et d'autre du trait** : un intervalle vaut
~3 jours à gauche sur la fenêtre 30, un jour à droite. C'est le prix des deux lectures sur un même
cadre. **La note le dit** plutôt que de le taire, et les deux moitiés portent chacune leur libellé.

**La charge à venir est dessinée en CREUX**, la partie passée en aplat : elle n'est pas mesurée,
elle est **planifiée**. Un aplat la ferait lire comme un fait accompli.

**Les re-tours de consolidation (`is_consolidation`) sont exclus** : un 2ᵉ passage de la même carte
le même jour est sans effet sur la planification, le compter doublerait une révision qui n'a eu
lieu qu'une fois.

#### §6 octies — `ReviewLoadCard` n'est PAS supprimée

La vue « Révisions » recoupe la carte « Charge de révision », qui sert déjà les mêmes 14 jours.
**Le recoupement est assumé** : `charge` porte cette charge **sans distorsion d'axe**, et elle
répond à `active_days`/`consolidated` dans `CARD_SCOPES`. Retirer une carte du cockpit est une
décision de mise en page à part entière — elle n'est pas prise en passant, dans un chantier sur les
courbes.

#### §6 nonies — Le verrou

> 🔴 **Toute série ajoutée au payload doit être sommée dans `sumSeries`.**

`subjects` est **déjà filtré** par la matière active. Une série oubliée resterait à zéro sur toutes
les vues : le filtre matière mentirait **sans qu'aucun test ne rougisse**, et la carte afficherait
des courbes plates parfaitement crédibles.

Deux filets, et ils ne se remplacent pas :

- **le type** : `sumSeries` déclare rendre un `DashboardSeries` complet, donc un champ ajouté à
  l'interface casse la compilation tant qu'il n'est pas sommé. ⚠️ Ce filet ne couvre que
  l'**existence** du champ, jamais la justesse de ce qu'on y met ;
- **le test** : un `toEqual` sur l'objet **entier**, avec un fixture dont chaque série porte des
  valeurs **distinctes** — des séries toutes égales auraient laissé passer une permutation.

> ⚠️ **Prouvé par sabotage, comme l'exige le dépôt.** Brancher le dénominateur de la rétention sur
> `covered` fait tomber **3 tests** (`25 % des 12` devient `15 % des 20`). Neutraliser
> `window_days` fait tomber le verrou de fenêtre côté backend. Un verrou non saboté n'en est pas
> un — c'est arrivé trois fois cette année.

#### §6 decies — Le piège propre aux flux, absent des stocks

`bucket_counts` range chaque jour dans le **premier repère qui l'atteint**. Un jour antérieur à la
fenêtre tombe donc dans le **bucket 0** au lieu d'être ignoré, et y fabrique un pic à gauche.

Les stocks n'ont jamais eu ce problème — rien n'y est bucketisé —, d'où l'absence de tout précédent
dans le module. `window_days` borne explicitement, et un test dédié le verrouille.

### Vérifications de read-before-code — effectuées le 2026-08-05

| Hypothèse de départ | Verdict |
|---|---|
| La carte est peu expressive faute de bonnes courbes | ⚠️ **Insuffisant.** Deux causes distinctes : l'échelle confisquée (mesurée : 6 % de la hauteur) **et** la monotonie structurelle de `reconstruct_series` |
| Un solde entrées/sorties est calculable et jamais posé | ❌ **Faux.** Il est **explicitement écarté** par `**Amendement 2** §5 ter` — pour le delta du KPI. La décision est bornée, pas générale |
| `skill_mastery_history` alimentera bien une vue de flux | ⚠️ **4 lignes seulement**, toutes des entrées en `weak`. La vue « Solde » est **vide aujourd'hui** — d'où le §6 sexies, écrit avant d'avoir vu l'écran |
| La donnée de mémoire est dans les paliers de maîtrise | ❌ **Non.** `SpacedReviewAttempt` porte 38 passages notés et datés ; c'est la seule mesure de mémoire du dépôt, et la carte qui en porte le nom ne la lisait pas |
| Une série `in_progress` existe | ❌ Trois séries seulement. La quatrième conditionne **et** le dénominateur de la rétention **et** la bande de l'aire empilée |
| Ajouter un champ au service suffit | ❌ **Non** — `response_model=DashboardOut` **filtre en silence** tout champ absent de `schemas.py`. Piège déjà consigné par l'addendum précédent, et il se serait rejoué à l'identique |

### Ce que cet addendum ne fait pas

- **Il ne supprime pas `ReviewLoadCard`** (§6 octies) — décision de mise en page, pas de courbe.
- **Il ne touche pas à `CARD_SCOPES`.** La carte répond aux mêmes KPI qu'avant ; c'est précisément
  ce qui commande la vue par défaut (§6 ter).
- **Il ne change ni `reconstruct_series`, ni le delta du KPI, ni aucune sparkline.**
- **Il ne mémorise pas la vue choisie** — ni en URL, ni en stockage local. Le §4 réserve l'URL à ce
  qui doit survivre à un partage de lien ; une préférence d'affichage n'en est pas.
- **Il n'ajoute aucun seuil et aucune alerte.** Une rétention qui chute ne déclenche rien : le
  dashboard reste une surface qu'on **consulte**.

### Le signal qui dirait qu'on s'est trompé

- **Papa ne quitte jamais la vue par défaut.** Les trois autres seraient un coût de code sans
  lecteur, et la réponse serait d'en **retirer**, pas d'en ajouter une cinquième.
- **Quelqu'un « réconcilie » le solde et les stocks.** Les deux mesures divergeront le jour même —
  c'est le §6 quinquies qu'il faudra rouvrir, pas contourner.
- **La vue « Solde » reste vide six mois de plus.** Le problème ne serait plus la carte mais
  l'écriture de `skill_mastery_history`, et c'est là qu'il faudrait aller regarder.
- **Un état vide est remplacé par une ligne plate** « pour que ce soit moins moche ». C'est le
  §6 sexies en entier qui tombe.

### Coût

1. `dashboard/projections.py` : `window_days` et `consolidation_flux` — deux fonctions **pures**,
   aucun accès DB, testables isolément comme le reste du module.
2. `dashboard/service.py` : `_review_attempts`, `_mastery_transitions`, `_entered_in_progress_at`
   (symétrique de `_entered_fragile_at`) — **trois requêtes**, sur des tables indexées. **Aucune
   migration.**
3. `dashboard/schemas.py` : `ReviewRatings` + quatre champs sur `SubjectSeries`. **Sans quoi le
   service serait juste et l'API ne servirait rien.**
4. `packages/types` : `DashboardReviewRatings` (+ export dans le baril `index.ts`) et quatre champs
   sur `DashboardSeries`.
5. `dashboardDerive.ts` : `sumSeries` étendu, avec un type `NumericSeriesKey` qui empêche
   `add("reviews")` de compiler.
6. `MemoryTrendCard.tsx` : réécrite en quatre vues + sélecteur.
7. `DashboardPage.tsx` : l'interversion, et trois props de plus — toutes filtrées par la matière
   active, `notionsTotal` compris (un dénominateur resté au programme entier ferait fondre l'aire
   empilée dès qu'on filtre).
8. Tests : 5 sur `consolidation_flux` (dont le verrou de fenêtre), 5 sur la carte, le `toEqual`
   entier de `sumSeries` — **et les deux sabotages**.

---

## Amendement 4 — Deux cartes ne pouvaient que s'éteindre — 2026-08-06

> Fusionné depuis **Amendement 4** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

Accepté — 2026-08-06.

> S'appuie sur : `adr-0028` **§5** (les KPI sont des filtres de focus, `CARD_SCOPES`) ;
> **Amendement 2** **§5 quinquies** (« un focus qui n'atténue plus rien est un
> clic qui ne veut plus rien dire ») et sa leçon sur le `Record` typé par l'union ;
> **Amendement 3** (les quatre vues, dont deux servent de preuve ici).
>
> **Ne rouvre pas** : le bandeau reste à cinq KPI ; `DashboardFocus` garde sa définition
> (`keyof DashboardKpis`) ; l'agrégat unique n'est pas touché — **aucune requête, aucun champ de
> payload, aucune migration**.
>
> **Ne révoque rien.** Il **complète** le §5 : le focus cesse d'être l'apanage du bandeau.

### Contexte

Le §5 pose que le focus est porté par les KPI. Conséquence non écrite, et jamais constatée jusqu'ici :

| carte | focus qui l'allument | sur 5 |
|---|---|---|
| `charge` — Charge de révision | `active_days`, `consolidated` | **2** |
| `chaine` — Chaîne de contenus | `open_gaps` | **1** |

> 🔴 **Ces deux cartes ne pouvaient que S'ÉTEINDRE.** Aucun geste de la page ne pouvait les
> désigner : leur mesure — la charge SRS à venir, l'entonnoir de production — n'est le sujet
> d'**aucun** des cinq KPI. Trois focus sur cinq éteignaient `charge`, quatre sur cinq éteignaient
> `chaine`, et rien ne pouvait les rallumer.

Relevé au navigateur le 2026-08-06, en confirmation : ce sont aussi **les deux seules cartes de la
page à ne contenir aucun élément cliquable** (0 bouton, contre 5 pour `notions`, 4 pour `memoire`).
Elles étaient passives de bout en bout.

### Décision

#### §5 undecies — Le focus n'est plus l'apanage du bandeau

Une carte dont la mesure n'a **aucun KPI** peut prendre le focus elle-même, au clic sur son titre.
Deux cartes sont dans ce cas, et elles seules : `charge` et `chaine`.

**Un seul focus sur la page.** Le même `toggleFocus`, la même clé d'URL `?focus=`, le même second
clic qui relâche. Cliquer une carte **relâche le KPI pressé** : deux mesures allumées en même temps
diraient que la page répond à deux questions à la fois.

#### §5 duodecies — `PageFocus`, type DISTINCT et non élargissement de `DashboardFocus`

```
DashboardFocus     = keyof DashboardKpis          (les 5 du bandeau)
DashboardCardFocus = "charge" | "chaine"          (les 2 cartes autonomes)
PageFocus          = DashboardFocus | DashboardCardFocus
```

Élargir `DashboardFocus` aurait été plus court **et faux** : il sert les `Record` du bandeau
(`KPI_LABELS`, `KPI_FOCUS_HINTS`, `KPI_ORDER`), qu'il aurait fallu remplir avec un libellé de KPI
pour `charge` et `chaine` — **qui n'en sont pas**. Un type qui ment se paie au premier lecteur.

> ⚠️ **Le garde `isFocus` doit être élargi EN MÊME TEMPS, et c'est le piège central de cet
> addendum.** Le dépôt a déjà payé ce bug exact sur le KPI « À renforcer » : le clic écrivait bien
> `?focus=…`, la liste blanche — un **tableau** incomplet — le refusait, la carte ne s'allumait
> **jamais**, et `tsc` restait muet. `FOCUSES` est un `Record<PageFocus, true>` : l'omission ne
> compile pas. **Quatrième fois que cette règle se paie** (`DashboardPeriod`, `COUNCIL_PERIOD_LABEL`,
> le KPI fragile, et celle-ci).

#### §5 terdecies — Le TITRE, pas la carte

> 🔴 `ContentChainCard` contient des `<Link>` (« ↓ 47 à produire »). Rendre la carte entière
> cliquable aurait mis une **ancre dans un bouton** — HTML invalide, et le lien cesse de
> fonctionner.

La cible est donc l'en-tête. Elle reste juste le jour où ces cartes gagnent des contrôles.

**Le bouton se glisse DANS le `h3`, il ne le remplace pas.** Remplacer le titre par un bouton
retirerait ces deux cartes de la liste des titres de la page : une carte gagnée au clic contre une
carte perdue à la navigation au clavier n'est pas un échange acceptable.

**Un `⌖` marque l'affordance**, `aria-hidden` (le nom accessible reste « Charge de révision »).
Sans lui, « ceci se clique » ne s'apprendrait qu'au survol — or ces deux cartes ont vécu jusqu'ici
sans aucun clic : personne n'irait l'essayer.

#### §5 quaterdecies — Ce que ces deux focus allument

| focus | cartes conservées | pourquoi |
|---|---|---|
| **charge** | `charge` · `memoire` | la vue « Révisions » montre les **mêmes** 14 jours à venir, et le passé qui les a produits |
| **chaine** | `chaine` · `memoire` · `lecture` | la ligne « couvertes par un cours validé » **est** l'effet de la production sur les notions ; la Lecture ZETIS propose quoi produire |

Deux et trois cartes sur huit — la portée reste étroite, comme `active_days` (2). Un focus qui
n'atténue plus rien est un clic qui ne veut plus rien dire.

> ⚠️ **La relation n'est pas symétrique, et n'a aucune raison de l'être.** Le focus `chaine` allume
> `lecture`, alors que le focus `fragile` n'allume **pas** `chaine`. « Quelles cartes justifient
> cette mesure » n'est pas « quelles mesures cette carte justifie ». Quiconque « corrigera » cette
> asymétrie élargira les deux portées jusqu'à ce que le focus n'atténue plus rien.

#### §5 quindecies — La courbe « couvertes » revient, et c'est ce qui rend `memoire` justifiable

> 🔴 **Régression introduite la veille, trouvée en écrivant cet addendum.** La refonte en quatre
> vues a fait **disparaître de l'écran** la série `covered` : l'ancien tracé la portait, aucune des
> quatre nouvelles ne la reprenait, aucun test ne l'a signalé. C'est la **seule mesure du dashboard
> qui relie la PRODUCTION aux NOTIONS** — précisément le lien dont le focus `chaine` a besoin.

Elle revient sur la vue « Paliers », en **ligne pointillée de contexte** et non en bande : une
notion couverte par un cours validé peut être à n'importe lequel des quatre paliers, l'empiler
mentirait sur la partition. Elle ne peut plus confisquer l'échelle comme avant — l'axe est borné
par le programme entier, pas par le maximum d'une courbe.

#### §5 sexdecies — Le verrou

> 🔴 **Cliquer l'en-tête d'une carte autonome doit l'ALLUMER pour de vrai.**

Quatre tests : le clic allume et relâche ; la carte atténue celles qui ne la justifient pas ; elle
relâche le KPI pressé ; le titre reste un titre.

> ⚠️ **Prouvé par sabotage.** Retirer `charge`/`chaine` de `FOCUSES` — en retypant la table en
> `Record<string, true>` pour que ça compile, exactement la forme du bug d'origine — fait tomber
> **3 tests sur 4**. Sans ce sabotage, ce verrou n'en serait pas un.

### Vérifications de read-before-code — effectuées le 2026-08-06

| Hypothèse de départ | Verdict |
|---|---|
| Quelque chose est `disabled` quand aucun focus n'est actif | ❌ **Rien** n'est `disabled` sur la page. La seule « désactivation » est l'atténuation visuelle de `DashboardCard` |
| Les cartes atténuées ont des contrôles devenus inertes | ❌ Elles restent cliquables. Le problème est ailleurs : `charge` et `chaine` n'ont **aucun** contrôle |
| Rendre la carte entière cliquable est le plus simple | ❌ `ContentChainCard` porte des `<Link>` — ancre dans un bouton |
| Élargir `DashboardFocus` suffit | ❌ Il sert les `Record` du bandeau, qu'il faudrait remplir de libellés de KPI pour deux non-KPI |
| La courbe `covered` est toujours affichée quelque part | ❌ **Disparue** depuis la refonte de la veille. Trouvée en cherchant ce qui justifierait le focus `chaine` |

### Ce que cet addendum ne fait pas

- **Il n'ajoute aucun KPI au bandeau.** Cinq mesures de tête est la limite posée par l'addendum
  précédent ; ces deux cartes portent leur mesure **là où elle est dessinée**.
- **Il ne rend pas les six autres cartes focalisables.** Leur mesure a déjà un KPI : leur donner un
  second chemin fabriquerait deux gestes pour un même focus.
- **Il ne mémorise rien de neuf** — `?focus=charge` passe par la clé d'URL existante.
- **Il ne touche à aucune donnée.** Aucune requête, aucun champ, aucune migration.

### Le signal qui dirait qu'on s'est trompé

- **Papa clique ces titres et ne comprend pas ce qui vient de s'éteindre.** L'indication « Filtre
  actif → … » n'aura pas suffi, et la réponse serait de nommer les cartes conservées, pas d'élargir
  la portée.
- **Quelqu'un rend les huit cartes focalisables « par cohérence ».** Le bandeau deviendrait
  décoratif et le focus perdrait son sens : il ne désigne pas une carte, il désigne une **mesure**.
- **Les portées s'élargissent au fil des chantiers** jusqu'à ce qu'un focus n'atténue plus rien.
  C'est le §5 quinquies qu'il faudra relire, pas contourner.

### Coût

1. `packages/types` : `DashboardCardFocus`, `PageFocus` (+ exports dans le baril).
2. `dashboardDerive.ts` : `CARD_SCOPES` en `PageFocus[]` avec quatre entrées de plus,
   `CARD_FOCUS_HINTS`, `matchesFocus` élargi.
3. `useDashboard.ts` : `FOCUSES` en `Record<PageFocus, true>`, signatures élargies.
4. `DashboardCard.tsx` : `focusKey` / `onToggleFocus`, le bouton dans le `h3`, l'indication de
   focus.
5. `ReviewLoadCard` / `ContentChainCard` : la prop passée ; six autres cartes : le type élargi.
6. `MemoryTrendCard.tsx` : la ligne « couvertes » restaurée sur la vue « Paliers ».
7. Tests : les quatre du §5 sexdecies, **et leur sabotage**.
