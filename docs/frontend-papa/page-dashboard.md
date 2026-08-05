# Page Papa — Dashboard

> Réécriture complète — 2026-07-30, **corrigée le 2026-07-31 après le read-before-code**
> (cf. `adr-0028 §Vérifications`). Met en œuvre `adr-0028`. Maquette de référence :
> `docs/frontend-papa/mockup/mockup-dashboard-papa-v3.html`.
> **Conserve sans les rouvrir** : la sémantique de `learning_events`, le calcul des minutes
> actives, les hooks d'alimentation et les fausses bonnes idées écartées (§Annexe, repris tels
> quels de la version précédente).

## Objectif

Répondre à **trois questions, dans cet ordre**, en une page :

1. **Qu'est-ce qui attend une décision de moi ?** → file « À décider »
2. **Où en est Massimo ?** → KPI, heatmap, diagrammes
3. **Qu'est-ce que ZETIS propose ?** → Lecture ZETIS + mission proposée

Non-objectifs : noter Massimo, produire un bulletin, déclencher une génération de contenu depuis
cette page.

## Wireframe

```txt
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tableau de bord            Année 4ᵉ · 2025-2026    [7j|30j|Trim] [Exporter] │
│ dernière activité : hier 18h40                          [Conseil de classe] │
├─────────────────────────────────────────────────────────────────────────────┤
│ ① À DÉCIDER (7)                    Rien de généré n'atteint Massimo sans toi │
│   [À valider] 4 leçons + 2 fiches en attente de relecture      [Relire]      │
│   [Lacune]    Comparaison de relatifs — 9 j, aucune mission [Preuve][Mission]│
│   [Source]    2 captures zetis-clip à rattacher                [Classer]     │
├─────────────────────────────────────────────────────────────────────────────┤
│ ② ┌──────────┐┌──────────┐┌──────────────┐┌───────────────┐  ← CLIQUABLES   │
│    │Temps actif││Régularité││ Consolidées  ││Lacunes ouvertes│                │
│    │  3 h 20   ││  5 / 7 j ││   12 / 46    ││       3        │                │
│    │ ╱╲╱‾ spark││ ╱╲╱ spark││  ╱‾ spark    ││ ╲__ spark      │                │
│    └──────────┘└──────────┘└──────────────┘└───────────────┘                │
│    [Toutes][Maths][Français][H-Géo][SVT][Anglais][P-C]   ← filtre transversal│
├─────────────────────────────────────────────────────────────────────────────┤
│ ③ ┌─ Quand Massimo travaille ──────────┐ ┌─ Répartition du temps ──────────┐ │
│    │ (Calendrier | Créneaux)           │ │      ◍ donut par matière        │ │
│    │  ▦▦▦▦▦▦▦ grille + échelle         │ │      + légende cliquable        │ │
│    └───────────────────────────────────┘ └─────────────────────────────────┘ │
│    ┌─ Évolution de la mémoire ─────────┐ ┌─ État des notions ──────────────┐ │
│    │  ╱ couvertes / consolidées /      │ │  ▬▬▬▭▭ barres empilées / matière│ │
│    │    fragiles (3 courbes)           │ │  P-C : référentiel non généré   │ │
│    └───────────────────────────────────┘ └─────────────────────────────────┘ │
│    ┌─ Où agir ──────────┐ ┌─ Charge de révision ─┐ ┌─ Chaîne de contenus ──┐ │
│    │  ○ nuage temps ×   │ │  ▮▮▯▮ 14 jours       │ │  ▰▰▰ entonnoir        │ │
│    │    consolidation   │ │  seuil 15 cartes     │ │  ↓ n à produire       │ │
│    │  [CTA Conseil →]   │ └──────────────────────┘ └───────────────────────┘ │
│    └────────────────────┘                                                    │
│    ┌─ Lecture ZETIS (moteur local) ─────────────────────────────────────────┐│
│    │ ↑ constat + [preuve · n]        │ Mission proposée « … »               ││
│    │ → constat + [preuve · n]        │ [Prévisualiser] [Écarter]            ││
│    └────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## ① File « À décider »

Première carte de la page, la seule à bordure ambre. Agrège les items **actionnables** :

| `kind` | Source (colonne exacte, vérifiée en base) | Action primaire |
|---|---|---|
| `validation` | `lessons.status = 'draft'` · `fiches` / `mindmaps` / `capsules` / `chapters`.`validation_status = 'pending'` · `spaced_review_cards.status = 'pending'` | Relire |
| `gap` | lacune ouverte **sans mission active** | Proposer une mission |
| `demande` | `notion_requests.status = 'pending'` + `content_requests.status = 'pending'` | Traiter |
| `referentiel` | matière de l'année active **sans chapitre généré** | Ouvrir le programme |
| `source` | `rag_documents` avec `source_type = 'web_clip'` et `subject_id IS NULL` | Classer |

> **Les quiz ne sont pas dans `validation`** : la table `quizzes` n'a **pas** de
> `validation_status` — ils sont servis sans gate par doctrine (`adr-0014 §2`). Les y faire figurer
> aurait demandé une migration hors périmètre. Noter aussi que `lessons` utilise **`status`**
> (`draft|validated|archived`) là où les autres tables utilisent `validation_status` : deux
> conventions coexistent, la file doit interroger la bonne colonne par table.

> **`demande` est un ajout du 2026-07-31.** Deux files d'attente Papa existaient déjà en base
> (`notion_requests` — Massimo demande une notion hors-programme ; `content_requests` —
> `adr-0027 addendum`) et sont exposées sur la page `/demandes`. C'est littéralement Massimo qui
> demande une décision à Papa : les omettre aurait fait afficher à la file un compteur qui ment sur
> ce qui attend vraiment.

- Regroupement par `kind`, **une ligne par groupe** (pas une ligne par contenu) — sinon la file
  devient une liste de travail et perd sa fonction de tri.
- **État vide = état normal**, et il est écrit : « Quand cette file est vide, il n'y a rien à
  faire ». Pas d'illustration, pas de félicitation (pas de mécanique de récompense).
- Ordre : `validation` → `gap` → `demande` → `referentiel` → `source`. Fixe, non trié par
  ancienneté : l'ordre encode la priorité pédagogique, pas la chronologie. `demande` se place après
  `gap` — une lacune mesurée prime sur une demande exprimée — mais avant le référentiel et les
  sources, parce que quelqu'un attend une réponse.
- La page `/demandes` reste la surface de traitement ; la file n'en est que le rappel.
- **La file affiche un nombre, elle n'alerte pas** : aucun clignotement, aucune pulsation, aucun
  rouge. *Reformulé le 2026-08-01 (ADR-0030 §7) : la rédaction antérieure — « aucun badge de
  compteur en navigation » — interdisait ce qui est déjà livré, à savoir le badge `pending` sur
  « Missions » (`page-missions-pilotage.md`) et la pastille `/demandes`.* Ces badges signalent une
  **file de validation**, c'est-à-dire du travail que Papa a lui-même demandé au système de
  préparer : objet distinct du **témoin de nouveauté** de Massimo, lequel **ne s'applique pas à
  l'interface Papa** — Papa n'a pas de contenu qui « arrive » sans qu'il l'ait demandé.

## ② KPI actifs

**Périodes d'analyse** — quatre boutons, du plus court au plus long : `7 jours`, `30 jours`,
`Trimestre` (90 j), `Année` (365 j). Toutes sont **glissantes et de longueur fixe**, bornes
incluses, se terminant aujourd'hui ; toutes arrivent dans le même payload. « Année » vaut
365 jours glissants et **non « depuis la rentrée »** : le delta, les 12 points de série et le
dénominateur « x / N jours » supposent une longueur fixe (addendum `adr-0028`, 2026-08-05).

> ⚠️ Toute table indexée par une fenêtre doit être typée **`Record<DashboardPeriod, …>`**, jamais
> `Record<string, …>`. La page Conseil portait une copie typée large : ajouter « Année » n'a rien
> pu y casser, `?period=365` est tombé dans le repli et le Conseil a annoncé « Trimestre 1 »
> pendant que Papa regardait l'année. Le filet n'est pas dans l'union, il est dans le `Record`
> typé **par** l'union. Table partagée : `COUNCIL_PERIOD_LABEL` + garde `isDashboardPeriod`
> (`lib/dashboardDerive.ts`), source unique du sélecteur, du hook et du lien profond.

Quatre KPI, **cliquables** (`role="button"`, `aria-pressed`) : **Temps actif**, **Régularité**,
**Notions consolidées**, **Lacunes ouvertes**. Chacun porte `{ value, delta }` (contrat existant,
delta vs période précédente) et une **sparkline** de 12 points.

Comportement (`adr-0028 §5`) : le clic met la page en focus — les cartes hors périmètre passent à
`opacity: .32` + désaturation, celles du périmètre reçoivent une bordure émeraude. Second clic =
relâche. Un seul focus à la fois.

Table de correspondance KPI → cartes : cf. `adr-0028 §5`. Implémentation : attribut
`data-scope="temps regularite"` sur chaque carte, sélecteur `[data-scope~="<focus>"]`.

**L'XP n'est pas un KPI de cette page** (`adr-0028 §5`) — il vit sur Progression.

`Temps actif` porte une infobulle obligatoire : *« Heuristique de présence reconstruite depuis
`learning_events` — pas une mesure d'attention. »*

## Filtre matière transversal

`SubjectFilterChips` (`@zetis/ui`, partagé avec le Cahier de bord), plus **trois points d'entrée
équivalents** : segments du donut, barres empilées, bulles du nuage. Tous appellent le même
`setSubject(slug)` ; re-cliquer la matière active la désélectionne.

**Aucun de ces gestes ne déclenche de requête** (`adr-0028 §1`). Sérialisation dans l'URL
(`?period=&subject=&focus=`) pour que l'état soit rechargeable et partageable — mais le rechargement
seul refait l'unique appel, pas le filtrage.

## ③ Les huit visualisations

### 1. Quand Massimo travaille — heatmap (une carte, deux vues)

Sélecteur `Calendrier | Créneaux` (`adr-0028 §6`).

- **Calendrier** — 26 semaines × 7 jours, lundi en haut. Intensité = **minutes actives du jour**
  (jamais le nombre d'événements). Paliers, présentation client : `0 / <10 / 10–20 / 20–40 / 40+`.
  Tooltip : date · minutes. Badge ambre « aucune activité depuis N jours » si `days_inactive >= 4`,
  **à la consultation uniquement, jamais de push**.
- **Créneaux** — semaine type, 8 créneaux de 2 h (**8 h → 24 h**) × 7 jours. Intensité = minutes
  actives moyennes du créneau sur la fenêtre. Bucketing **Europe/Paris**. Les minutes de 0 h à 8 h
  sont renvoyées à part (`slots_outside_minutes`) et affichées en note — jamais repliées dans un
  créneau voisin, ce qui les daterait faussement (`adr-0028 §6`).
- **Échelle émeraude unique** dans les deux vues. Pas de gradient vers le rouge : une case dense
  n'est pas une bonne note, une case vide n'est pas une faute.
- Clic sur un jour (vue Calendrier) → **panneau inline** sous la grille, pas de modale ; détail
  chargé paresseusement (`GET /api/parent/activity/days/{date}`) — seule exception au §4 de l'ADR.

### 2. Répartition du temps — donut

Part de chaque matière dans le temps actif de la fenêtre. Centre : total (`3 h 20`). Légende
cliquable = filtre. Matières à 0 min exclues du tracé.

### 3. Évolution de la mémoire — 3 courbes

`covered` (gris, notions couvertes par un cours validé) · `consolidated` (émeraude, aire remplie) ·
`fragile` (ambre). 12 points sur la fenêtre. **L'écart entre la courbe grise et la verte est le
travail restant** — c'est la lecture que la carte doit rendre évidente.

Sources d'historique (`adr-0028 §3 ter`) : `covered` ← `Lesson.validated_at` ·
`consolidated` ← `SkillMastery.mastered_at` · `fragile` ← **`skill_mastery_history`**, table créée
pour ce chantier parce qu'aucun horodatage de bascule n'existait. Avant le backfill, la courbe ambre
démarre à la date de mise en service — **elle ne remonte pas une histoire qu'on n'a pas**.

### 4. État des notions — barres empilées par matière

Segments et statuts `SkillMastery` correspondants (`adr-0028 §3 bis`, définition serveur) :

| Segment | Statut |
|---|---|
| consolidées | `mastered` (≥ 90) |
| fragiles | `weak` + `learning` (< 70) |
| en cours | `solid` + `in_progress` |
| non abordées | aucune ligne `SkillMastery` |

Le client **empile des compteurs déjà décidés** ; il ne rejoue aucun seuil (`adr-0028 §3`).

Une matière sans notion affiche une barre vide et le libellé « référentiel non généré » + lien
vers le Programme — **le trou est nommé, pas masqué**.

⚠️ Le déclencheur de la barre vide est **`notions.total === 0`**, pas `has_referentiel`. Les deux
états existent et diffèrent : une matière peut avoir ses chapitres sans qu'aucune notion y soit
rattachée (chapitres générés, rattrapage des notions pas encore fait) — cas observé sur la base de
dev. `has_referentiel: false` signale l'absence de chapitre et oriente vers le Programme.

### 5. Où agir — nuage temps × consolidation

X = temps actif sur la fenêtre, Y = % de notions consolidées, aire ∝ nombre de notions. Médianes en
pointillés (quadrants). Quadrant bas-droite annoté « beaucoup de temps, peu d'ancrage ».

Chaque bulle porte le **pictogramme de sa matière** (`subjectIconFor`, `<image>` clippé en cercle,
`preserveAspectRatio="xMidYMid slice"` — le cadrage de `SubjectPictogram`), entouré d'un **anneau**
à la couleur de la matière qui la relie au donut et aux pastilles de filtre. Repli sur l'initiale
si l'asset manque, jamais sur un emoji.

> ⚠️ **Le rayon reste `6 + √notions × 2.2`** — il PORTE la troisième mesure de la carte. Un
> pictogramme à taille fixe serait plus net et ferait mentir la légende « aire ∝ nombre de
> notions » sans qu'aucun autre test ne bronche : d'où un test dédié sur la taille
> (`WhereToActCard.test.tsx`).

**Échelle verticale ADAPTATIVE** (2026-08-05). Elle se cale sur le maximum atteint (+30 %, arrondi
au multiple de 5), avec un **plancher à 10 %** et un plafond à 100 % ; elle se dézoome donc toute
seule au fil de l'année. Motif : au premier rendu réel, **1 notion consolidée sur 280** collait les
cinq matières sur l'axe. Trois garde-fous, sans lesquels le zoom mentirait :

| garde-fou | pourquoi |
|---|---|
| Mention `échelle ajustée · max N %` dans le graphe | une bulle haute sur une échelle zoomée est **devant les autres**, pas ancrée |
| Plancher 10 % | évite d'étaler du bruit — et évite la **division par zéro** quand tout vaut 0 |
| Quadrants = **vraies médianes** des matières tracées | le seuil figé à 35 % sortait du cadre dès que l'échelle zoome. ⚠️ La verticale valait `0.42 × max`, que ce document appelait déjà « médiane » sans qu'elle en soit une |

Un pointillé dont la médiane vaut 0 n'est **pas tracé** : il se confondrait avec son axe et se
lirait comme une graduation. Les quadrants deviennent donc **relatifs** — « moins ancré que les
autres » et non « pas ancré » — seule lecture honnête tant que le programme démarre.

Deux réglages de lisibilité liés : un **retrait bas** égal au plus gros rayon (une bulle à 0 % est
centrée sur le zéro, et passait donc à moitié sous l'axe) ; et un **ordre de peinture par taille
décroissante** (SVG peint dans l'ordre du document — une petite matière tombant près d'une grosse
disparaissait dessous, invisible et incliquable).

> Ce que cela ne résout **pas** : des matières à **exactement** 0 % restent sur la même ligne. C'est
> la donnée, pas le cadrage. Séparer celles-là demanderait de changer ce que Y mesure (notions
> *engagées* plutôt que *consolidées*) — écarté le 2026-08-05, ce serait un autre sens de carte
> et un addendum d'ADR.

CTA à deux états sous le graphe (`adr-0028 §7`, §8) :

| État | Rendu | Cible |
|---|---|---|
| Aucune matière | atténué, pictogramme `grayscale(1)` | `/conseil` |
| Matière sélectionnée | plein émeraude, pictogramme couleur, libellé nommé | `/conseil?subject=<slug>&period=<n>` |

> Route corrigée le 2026-07-31 : elle s'appelle **`/conseil`**, pas `/conseil-classe`. La lecture des
> query params est **ajoutée à `ConseilClasseIAPage`** dans un commit séparé et révocable
> (`adr-0028 §7`), plutôt que de livrer un CTA inerte.

Toujours présent (pas de saut de mise en page). Pictogramme via `subjectIconFor` /
`SubjectPictogram` (`@zetis/ui`) — **jamais d'emoji codé en dur**. ⚠️ `lib/subjectEmoji.ts` existe
encore côté Papa et viole déjà cette règle sur deux pages : **ne pas s'en servir ici**.

### 5 bis. Panneau d'analyse d'une matière — *à implémenter*

> Cadré par `adr-0028-addendum-analyse-par-matiere` et `adr-0020-addendum-portee-matiere`
> (2026-08-05). **Seconde exception** au §4 « zéro état de chargement », après le drill-down d'un
> jour.

**Déclenchement** : clic sur une bulle du nuage. La matière est sélectionnée **et** le panneau se
déplie **sous** la carte, séparé par `mt-4 border-t border-papa-border pt-3.5` — patron exact de
`DayDetailPanel` sous la carte du rythme. Re-cliquer la bulle active referme et désélectionne.

**Ce n'est pas une modale** : ni `role="dialog"`, ni `aria-modal`, ni fermeture par Échap. Un
bouton « fermer » referme le panneau **sans** désélectionner la matière.

#### État et URL

| Clé | Écrite par | Effet |
|---|---|---|
| `?subject=<slug>` | tous les sélecteurs de matière | filtre la page (existant) |
| `?panel=ou-agir` | **le seul clic sur une bulle** | déplie le panneau |

- `panel` porte la **clé de carte** (`CARD_SCOPES` / `data-card`), pas un vocabulaire neuf.
- `panel` sans `subject` **connu** → panneau fermé. Un lien périmé n'ouvre pas un vide.
- 🔴 **Filtrer REFERME le panneau** : pastilles, donut et barres empilées écrivent `panel: null` en
  même temps que `subject`. Sans cela, un clic de pastille rouvrirait le panneau, donc **un geste
  de filtrage partirait au réseau**.
- L'état est dans l'URL et non local **par nécessité** : le lien de preuve de la Lecture ZETIS
  (même page) est une navigation vers la route courante, qui ne remonte pas `DashboardPage`.
- `{ replace: true }` conservé — ouvrir un panneau n'est pas naviguer.

#### Contenu — quatre blocs

| Bloc | Source | Détail |
|---|---|---|
| **À renforcer** | 🌐 réseau | notions **nommées** : fragiles ∪ lacunes ouvertes. Sévérité, « déjà couverte par une mission », statut de maîtrise. **Non plafonné** |
| **Déjà en cours** | 🌐 réseau | missions actives (titres), contenus en attente de validation, charge SRS 14 j, retard SRS |
| **Temps et régularité** | 💾 mémoire | `minutes[period]`, jours actifs, créneaux — depuis `DashboardSubject` |
| **Couverture** | 💾 mémoire + 🌐 détail | `notions`, `has_referentiel`, chapitres et leçons validés |

> 🔴 **Règle qui décide de tout, champ par champ : le réseau ne sert que ce que l'agrégat ne peut
> pas porter — des NOMS.** Refaire venir du réseau un chiffre déjà servi fabriquerait une seconde
> source pour une mesure affichée dans la bulle juste au-dessus.
>
> **Corollaire testable** : la réponse ne dépend d'**aucune période**. Changer de période avec le
> panneau ouvert ne déclenche **rien**. Un `period` dans la signature de l'appel serait la preuve
> que la règle a été enfreinte.

⚠️ **« À renforcer » n'additionne jamais les deux populations.** Une notion fragile
(`SkillMastery.status ∈ {weak, learning}`) et une lacune ouverte (ligne `Gap`) sont **deux mesures
distinctes** — cf. l'avertissement du §2 sur « Lacunes ouvertes » vs « à renforcer ». Chaque entrée
porte les deux drapeaux séparément ; aucun total unique n'est affiché.

#### Contrat

`GET /api/parent/progress/subjects/{subject_id}/analysis` — dans le module `progress` (dont le
docstring revendique déjà « le DÉTAIL des KPI du dashboard »), nommée `analysis` et non `focus`
(qui collisionne avec `DashboardFocus`), indexée par `subject_id` entier (l'identité qu'utilise
déjà l'ancrage du Conseil).

Deux propriétés à verrouiller par test : la route **n'écrit rien**, et **n'appelle aucun LLM**.
*L'analyse est l'évidence ; le Conseil est la narration.*

#### États

| État | Rendu |
|---|---|
| Chargement | texte discret, **liste précédente PURGÉE** |
| Erreur | message + « Réessayer », **panneau maintenu ouvert** |
| Vide | « Aucune notion à renforcer dans cette matière » |

⚠️ La purge avant appel est un **correctif** sur `DayDetailPanel`, qui garde son détail pendant le
chargement suivant. Toléré pour des minutes ; intenable ici, où les notions de Maths resteraient
**nommées** sous le titre « SVT ».

#### Largeur

**La carte ne change pas de largeur** (`xl:col-span-5`). Le SVG est en `w-full` : élargir la carte
déplacerait chaque bulle horizontalement, y compris celle que Papa vient de cliquer, sous son
curseur. Le contenu s'adapte à ~560 px — liste pleine largeur, blocs chiffrés en deux colonnes.

#### Le bouton de synthèse ciblée

Deux libellés **volontairement distincts**, parce que l'un navigue et l'autre engage 18 s à 4 min
de génération LLM :

| Contrôle | Libellé | Effet |
|---|---|---|
| CTA existant | « Ouvrir le conseil de classe — {matière} » | navigation, **jamais** de génération |
| Bouton du panneau | « Demander une synthèse écrite sur {matière} » `~18 s` | `ConfirmDialog` puis génération ciblée |

`ProgressBar` à progression estimée (18 s). Au-delà de ~45 s, **le libellé** reprend la parole
(« plus long que d'habitude ») — la barre sature à 95 % et n'apprend plus rien ; on ne rallonge
pas l'estimation, ce serait déclarer 4 min pour un appel qui en dure 18 neuf fois sur dix.

⚠️ L'état du run vit **dans la carte**, pas dans le panneau : celui-ci se démonte au clic sur une
autre bulle, et le bouton redeviendrait cliquable pendant l'appel — deux rapports pour une matière.

**On ne navigue pas au résultat** : après quatre minutes, Papa n'est plus dans la même pensée. La
synthèse s'affiche en ligne, puis un lien vers `/conseil`.

### 6. Charge de révision — 14 jours à venir

Cartes SRS dues par jour. Barres au-delà de `REVIEW_LOAD_WARN = 15` en ambre + ligne de seuil
pointillée. Note : *« Un pic se lisse en avançant une révision, pas en la supprimant. »*

### 7. Chaîne de contenus — entonnoir

`Chapitres validés → Cours validés → Fiches → Quiz de fin de cours`, avec le **delta entre marches**
(« ↓ 8 à produire »). Lecture visée : la marche la plus haute est celle à traiter en premier.

### 8. Lecture ZETIS — constats + mission proposée

- En-tête : `moteur local` (**jamais « Claude »** — `adr-0008`).
- Chaque constat porte un **lien de preuve** (`preuve · n quiz`) vers les `learning_events` qui le
  fondent. Un constat sans preuve n'est pas affiché.
- Constat de non-conclusion explicite quand le volume est insuffisant (« trop peu d'activité sur la
  période pour conclure ») — préférable au silence.
- Mission proposée : `Créer la mission` (sous `ConfirmDialog`) / `Écarter`. **Papa ne crée pas
  unilatéralement, et l'affichage ne crée rien du tout** : le parcours est composé **en lecture**
  par le moteur de missions (`preview_remediation`, `adr-0028 §10`), et la confirmation appelle la
  route de création **déjà en place**. Aucune surface d'écriture n'a été ajoutée.
- L'encart affiche le parcours **réellement composé** (types d'étape dans l'ordre du moteur) et son
  estimation — il ne reformule pas la doctrine, il la lit.
- **Deux états vides distincts**, et le second est celui qui compte : *aucune lacune* → « chaque
  notion à renforcer est déjà prise en charge » ; *des lacunes sans mission active, mais hors du
  champ du générateur* (lacune `in_progress`, déjà travaillée) → on le **dit**, avec un lien vers
  `/lacunes`. Écrire « tout est pris en charge » dans ce cas serait faux.
- `Écarter` masque l'encart **pour la session** : le persister demanderait une table, et la lacune,
  elle, est toujours là au rechargement.

## Contrat API

### `GET /api/parent/dashboard` — agrégat unique (`require_parent`)

**Une seule requête au montage.** Aucun query param de filtrage : période et matière sont des
projections client (`adr-0028 §1`, §2).

> ⚠️ **Cette route existe déjà** et sert aujourd'hui un tout autre contrat (`DashboardKpisOut` :
> `sessions`, `active_minutes`, `xp`, `missions_completed`, `open_gaps`, `consolidated_skills`).
> C'est donc une **réécriture cassante**, acceptable parce qu'elle n'a qu'un seul consommateur —
> la page qu'on refait (`adr-0028 §Conséquences n°6`).

```jsonc
{
  "school_year": { "level": "4e", "label": "2025-2026", "program_version": 2020 },
  "generated_at": "2026-07-29T08:12:00+02:00",   // horodatage de CET agrégat — sans rapport avec
                                                 // council_reports, dont le champ est created_at
  "last_activity_at": "2026-07-28T18:40:00+02:00",
  "days_inactive": 0,

  "inbox": [
    { "kind": "validation", "count": 6, "label": "4 leçons et 2 fiches…",
      "detail": "Maths (2) · Français (1) · SVT (3)", "href": "/contenus?status=pending" }
  ],

  "periods": {
    "7":  { "kpis": { "active_minutes": { "value": 200, "delta": 35 },
                      "active_days":    { "value": 5, "of": 7, "delta": 1 },
                      "consolidated":   { "value": 12, "of": 46, "delta": 3 },
                      "open_gaps":      { "value": 3, "delta": 0, "without_mission": 1 } },
            "sparks": { "active_minutes": [ /* 12 */ ], "active_days": [], 
                        "consolidated": [], "open_gaps": [] } },
    "30": { }, "90": { }, "365": { }
  },

  "subjects": [
    { "slug": "maths", "name": "Mathématiques", "color": "#60a5fa",
      "minutes": { "7": 65, "30": 255, "90": 690, "365": 2400 },
      "calendar": [ { "date": "2026-07-28", "active_minutes": 42 } ],   // 26 sem., jours vides omis
      "slots":    { "7": [[/*7 jours*/], /* × 8 créneaux, 8h→24h */], "30": [], "90": [], "365": [] },
      "slots_outside_minutes": { "7": 0, "30": 12, "90": 12, "365": 40 },  // activité 0h–8h, jamais repliée
      "notions":  { "consolidated": 4, "fragile": 3, "in_progress": 2, "total": 13 },
      "series":   { "7": { "covered": [], "consolidated": [], "fragile": [] }, "30": {}, "90": {}, "365": {} },
      "review_load": [ /* 14 entiers, J+0 → J+13 */ ],
      "gaps_open": 2, "has_referentiel": true }
  ],

  "content_chain": [ { "stage": "cours_valides", "label": "Cours validés", "value": 30, "target": 38 } ],

  "reading": [
    { "trend": "up|flat|watch", "text": "…",
      "evidence": { "count": 5, "kind": "quiz", "href": "/cahier-bord?events=…" } }
  ],
  "proposed_mission": { "skill_id": 7, "skill_name": "…", "title": "Renforcer : …",
                        "steps": [ { "step_type": "eli5", "instruction": "…" } ],
                        "estimated_minutes": 10, "mission_type": "remediation",
                        "confirm_href": "/missions" }
}
```

Règles de contrat :

- **`calendar` est livré par matière**, jours vides omis, reconstruits client. « Toutes » = somme.
  Il porte **26 semaines quelle que soit la période** : le sélecteur 7/30/90/365 pilote les KPI et
  les séries, pas la grille calendrier (qui est là pour la tendance longue). Seul le filtre matière
  l'affecte. En période « Année » la grille reste donc plus courte que la fenêtre — assumé : elle
  sert la régularité, pas le bilan.
- `slots` : matrice `8 × 7` de minutes moyennes par créneau, **8 h → 24 h**, **Europe/Paris**.
  Le complément 0 h–8 h vit dans `slots_outside_minutes`.
- `series` : 12 points par fenêtre, alignés sur les mêmes bornes que les sparklines. `fragile`
  provient de `skill_mastery_history` et **peut être plus court que les deux autres** avant que
  l'historique se remplisse — le client trace ce qu'il reçoit, sans extrapoler.
- Une matière sans référentiel sort avec `has_referentiel: false` et `notions.total: 0` — elle
  **reste dans le tableau** (le trou est une information).
- `color` vient de `Subject.color` (nullable en base). **Un `null` n'est pas une erreur** : le repli
  est une palette déterministe par slug, côté client — c'est de la présentation (`adr-0028 §3`).
- `reading[].evidence` obligatoire : pas de constat sans preuve adressable.
- **Aucune UNION avec `xp_events`**, et les événements de `NON_ACTIVITY_EVENTS` (agenda) sont exclus
  de toutes les projections d'activité — piège connu des trois lecteurs existants.

### Routes voisines — audit du 2026-07-31

| Route | Sort |
|---|---|
| `GET /api/parent/activity/days/{date}?subject_id=` | **Conservée, inchangée** — drill-down paresseux (`adr-0028 §4`). ⚠️ son seul point de montage est `DayDetailPanel`, qui vit sous la heatmap : le re-monter sous la nouvelle carte, sinon la route devient orpheline |
| `GET /api/parent/activity/sessions` | **Conservée** — consommée par le **Cahier de bord** (`CahierBordPage`), pas par le dashboard. Consommateur à nommer explicitement dans `API_SPEC.md` |
| `GET /api/parent/activity/heatmap` | **Supprimée** — aucun consommateur hors dashboard (vérifié) |
| `GET /api/parent/progress/gaps` et `/consolidated` | **Conservées** — l'agrégat les réutilise via le service, et `/lacunes` devra les consommer un jour (elle est encore mockée) |
| `GET /parent/dashboard` (sans `/api`) | **N'a jamais existé** en code |
| `GET /progress/summary` | **N'a jamais existé** en code — dette de spec dans `API_SPEC.md`, à marquer comme telle |
| `/missions` côté parent | Existe sous `/api/missions/pilot*`, **jamais appelée par le dashboard** (le KPI « missions » était compté depuis `learning_events`) ; ce KPI disparaît de toute façon |

Contrats TypeScript : `packages/types/src/dashboard.ts` (à créer), `activity.ts` (existant).
⚠️ Piège connu : un type nommé n'est utilisable par les apps que s'il est **ré-exporté depuis
`packages/types/src/index.ts`**.

### Conventions d'implémentation front (constatées, à suivre)

- **Il n'y a ni react-query ni swr dans le dépôt.** « Un seul appel au montage » se réalise avec le
  patron maison à trois couches : helpers HTTP (`lib/httpClient.ts`) → module d'API par domaine
  (`lib/dashboard.ts`, patron de `lib/activity.ts`) → **un hook par page** (`hooks/useDashboard.ts`,
  patron de `hooks/useCouncilClass.ts` : interface de retour nommée, `loading` / `error`,
  `Promise.all` dans un `useCallback`, `finally`). Ajouter une lib de data-fetching demanderait un
  ADR.
- **Aucune lib de graphes n'est installée** (`recharts`, `visx`, `d3`, `chart.js` : absentes). Les
  huit diagrammes se font en **SVG inline + CSS Grid**, comme tout le reste du dépôt.
- Briques déjà écrites à réutiliser plutôt qu'à refaire : `ActivityHeatmap` + `lib/heatmap.ts`
  (`heatLevel`, `HEAT_CLASSES`, `buildHeatmapGrid`, `toLocalIso` — **déjà en échelle émeraude, sans
  rouge**, et testés) pour la vue Calendrier ; `SubjectFilterChips` et `subjectIconFor`
  (`@zetis/ui`) ; `ProgressSparkline` (aujourd'hui côté Massimo, **à extraire vers `@zetis/ui`** en
  export racine plutôt qu'à réécrire).

## États

| Situation | Rendu |
|---|---|
| Chargement initial | skeleton global (cartes grisées), **une seule fois** |
| Filtrage / focus / période | **aucun état de chargement** (`adr-0028 §4`) |
| File vide | message « rien à faire », pas d'illustration |
| Matière sans référentiel | barre vide + libellé + lien Programme |
| Aucune donnée (première ouverture) | page structurée avec cartes vides expliquant ce qui les alimentera — jamais une page blanche |
| Erreur de l'agrégat | bandeau + bouton Réessayer ; pas de rendu partiel |

## Accessibilité et motion

- KPI : `role="button"`, `aria-pressed`, navigables au clavier ; le focus ne doit pas être
  signalé **uniquement** par l'opacité — la carte active reçoit aussi une bordure.
- Heatmap : chaque case a un `title` textuel ; l'information n'est jamais portée par la seule
  couleur (palier + valeur en tooltip).
- `prefers-reduced-motion` : transitions d'atténuation supprimées, changement d'état instantané.
- Contraste : libellés d'axes en `--dim` vérifiés ≥ 4.5:1 sur `--panel`.

## Ce qui est retiré (ne pas rouvrir sans ADR)

Panneau Obsidian · KPI XP / Niveau / Série · Suivi des récompenses · Radar des compétences ·
Générateur de quiz par formulaire · Taux de réussite global · Gradient de couleur vers le rouge sur
la heatmap. Justifications : `adr-0028 §Contexte`.

## Annexe — acquis repris sans modification

Sémantique de `learning_events` (source unique d'activité, **jamais d'UNION avec `xp_events`**),
minutes actives (`ACTIVE_GAP_CAP_MINUTES = 5`, constante versionnée serveur), bucketing jour
Europe/Paris, hooks d'alimentation et dédupe des événements de consultation, absence de backfill
rétroactif, et les fausses bonnes idées écartées (table `daily_activity`, tracking client enrichi) :
**inchangés**, cf. version précédente de ce document dans l'historique Git.
