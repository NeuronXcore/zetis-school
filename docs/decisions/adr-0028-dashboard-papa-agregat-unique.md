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

> **Étendu le 2026-08-05** par `adr-0028-addendum-kpi-a-renforcer` : un **cinquième** KPI,
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
