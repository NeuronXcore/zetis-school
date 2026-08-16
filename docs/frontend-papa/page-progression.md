# Page Papa — Progression

> Réécrite au cadrage du 2026-08-06. Met en œuvre `adr-0040`. **Remplace la version du 2026-08-05**
> (`adr-0038` + addendum `progression-agit`), qui ne portait qu'une table par matière.
>
> Maquette de référence : `docs/frontend-papa/mockup/maquette-papa-progression.html`.

## Objectif

Répondre à **trois** questions voisines, sans jamais les mélanger :

| Vue | Question | Unité | Fenêtre |
|---|---|---|---|
| **Par matière** *(défaut)* | où en est-on dans l'année ? | la matière | aucune |
| **Par notion** | laquelle, où, depuis quand ? | la notion | aucune |
| **Par période** | qu'est-ce qui s'est passé ? | le **fait daté** | 7 / 30 / 90 / 365 |

Et, depuis chaque réponse, pouvoir **agir sur la notion qu'on vient de lire**.

## Non-objectifs

- **Pas un bulletin** — aucune note globale, aucun classement de matières (`adr-0028` §9).
  Ce non-objectif est **intact et opposable** ; les deux autres de l'`adr-0038` §5 ont été révoqués,
  dans les bornes strictes de l'`adr-0040` §3.
- **Aucune courbe, aucune série, aucun agrégat temporel.** La révocation autorise des **événements
  nommés**, rien de plus. La reconstruction agrégée du passé vit dans « Évolution de la mémoire »
  du dashboard.
- **Aucune fenêtre hors de la vue « Par période ».** Les deux autres vues sont des stocks, lus
  « à aujourd'hui », sans sélecteur.
- **Aucune surface Massimo.** `require_parent` de bout en bout.

## Structure

En-tête `PageHeader` + **sélecteur de vue** à droite (patron `WorkRhythmCard` / carte mémoire).

```txt
┌───────────────────────────────────────────────────────────────────────────────┐
│ Progression                     [ Par matière ] [ Par notion ] [ Par période ] │
│ Où en est Massimo — et qu'est-ce qui a bougé.                                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Largeur `max-w-6xl` sur les trois vues.** Six colonnes ne tiennent pas dans `max-w-4xl`, et faire
varier la largeur du shell selon l'onglet ferait sauter la page à chaque bascule.

---

## Vue « Par matière »

Inchangée dans ses quatre mesures. Elle reste la cible du constat du dashboard (`?subject=`).

```txt
│ MATIÈRE ▲    AVANCEMENT ▲          ACQUIS ▲   XP ▲   À RENFORCER ▲  LACUNE ▲ │
│ 📕 Français  ▓▓▓░░░░░░░ 10 / 96    1          367          8          1     │
│ 📐 Maths     ▓▓░░░░░░░░  5 / 58    0          577          3          0     │
│ 🇪🇸 Espagnol  référentiel non généré  →  ouvrir le programme (ciblé)         │
```

| Colonne | Mesure exacte | Source |
|---|---|---|
| **Avancement** | notions **engagées** / notions au programme — engagée = toute notion portant une ligne de maîtrise | `SkillMastery` × `Skill.subject_id` |
| **Acquis** | notions `mastered` | `/progress/overview` |
| **XP** | cumul par matière, **depuis toujours** | `XPEvent.subject_id` |
| **À renforcer** | notions **fragiles** (`weak` + `learning`) | `notions.fragile` |
| **Lacune** | lacunes **ouvertes**, attribuées par `Gap.subject_id` | `gaps_open` |

> 🔴 **« Avancement » et « Acquis » sont DEUX mesures, jamais fondues.** 1 notion consolidée sur 280
> en base réelle : une barre bâtie sur les acquis afficherait zéro pour sept matières sur huit.

> 🔴 **« À renforcer » et « Lacune » non plus** (colonne ajoutée le 2026-08-06). Français porte 8
> fragiles et 1 lacune ouverte : la phrase au-dessus de la table dit lequel compte quoi, faute de
> quoi les deux nombres côte à côte se lisent comme une incohérence. Le compte de lacunes est
> **cliquable** vers `/lacunes?subject=<slug>` — même attribution des deux côtés, donc les deux
> écrans ne peuvent pas se contredire. Zéro ne mène nulle part.

**Les six colonnes sont triables** (amendement du 2026-08-06). Même discipline que la vue notion —
l'en-tête EST le contrôle, `aria-sort` porte l'état, le départage est toujours `(nom, subject_id)`
et **ne s'inverse jamais avec le sens**. Deux écarts assumés, tous deux visibles à l'écran :

- le premier clic d'une colonne de **compte** part en **descendant** (on trie « Acquis » pour voir
  les plus acquises, pas les sept zéros) — la flèche affiche le sens réel ;
- une matière **sans barre** (pas de référentiel, ou référentiel vide) n'a pas de ratio : elle reste
  **en bas dans les deux sens**, jamais mêlée aux zéros. Une absence de mesure n'est pas une
  petite valeur.

> ⚠️ **Aucun pourcentage à l'écran, volontairement.** « 10 / 96 » se lit « on en a abordé 10 sur
> 96 » ; « 10 % » se lit « il ne sait que 10 % ».

### Le dépliage d'une ligne, allégé

Il garde **ce que les autres vues ne portent pas**, et rien d'autre :

- **XP par motif** — `Σ montants == xp`. Réparti par motif, jamais par notion (`XPEvent` n'a pas de
  `skill_id` : c'est le plafond de la donnée, pas un oubli).
- **Lacune ouverte** — recompose le nombre de la nouvelle colonne. `to_reinforce` étant l'**union**
  fragiles ∪ lacunes, une notion peut figurer dans ce bloc **et** dans « À renforcer » : elle y
  garde sa ligne (le compte l'exige) mais **pas ses boutons**, qui ne sont rendus qu'une fois, avec
  sa raison écrite. Deux « Créer une mission » identiques laisseraient croire à deux actions.
- **Référentiel** — leçons, validées, cours rédigés, dérivés produits, lien Couverture. **Ne
  recompose aucun nombre de la ligne, volontairement** : il répond à l'autre question, « qu'est-ce
  qu'il reste à produire ».
- **Trois liens** vers les autres vues, pré-filtrées : *« Les 10 notions engagées → »*,
  *« Les 8 à renforcer → »*, *« Ce qui s'est passé → »*. Le second pose `?palier=a_renforcer`, lu
  par la page et **visible** dans les pastilles — un filtre silencieux ment par omission. Un palier
  inconnu ne filtre rien plutôt que de vider l'écran.

> 🔴 **Chaque lien porte SA matière.** Les trois « Ouvrir le programme » partaient nus jusqu'au
> 2026-08-06 : les huit lignes menaient toutes à la matière ouverte par défaut. Une cible manquante
> est **silencieuse** — la page d'arrivée ignore le paramètre absent, sans erreur nulle part. Un
> test figeait même l'URL nue.
>
> ⚠️ **`?subject=` ne porte pas le même type selon la destination**, et rien dans son nom ne le
> dit : `subject_id` **numérique** pour `/programme` et `/couverture`, **slug** pour `/lacunes`,
> `/conseil` et `/progression`. Se tromper est, là encore, silencieux.

> Ses anciennes listes de notions **disparaissent** : elles seraient une troisième copie de la même
> liste. Une liste, un seul endroit.

**Un seul dépliage ouvert à la fois.**

---

## Vue « Par notion »

### Bandeau « Dernières bascules »

Les **5 dernières** bascules de palier, **suivant le filtre matière**, avec `history_since` et un
lien *« Tout voir par période → »*. Aucune fenêtre ici : le journal complet vit dans la troisième vue.

État vide : *« Aucune bascule enregistrée sur cette matière depuis l'ouverture de l'historique. »*

### Filtres

```txt
Matière : [Toutes] [Français] [Mathématiques] [Histoire-Géo] [SVT] [Anglais]

Palier  : [● Acquises 1] [● À renforcer 13] [● En cours 5] [○ Non abordées 261]   🔍 rechercher…

Et      : [Lacune ouverte 3] [Sans mission active 17]   Trier : [Notion] [Matière] [Date]

ⓘ Un palier n'est pas une lacune. « À renforcer » est un palier de maîtrise (13 notions) ;
  une lacune ouverte est une décision à traiter (3 lignes). Ces deux nombres n'ont aucune
  raison d'être égaux — ce sont deux filtres indépendants.
```

- **Palier et lacune sont deux axes indépendants.** Le palier est exclusif, la lacune est un
  booléen. Une notion peut être « à renforcer » sans lacune, et porter une lacune en étant
  « en cours ». L'infobulle est **permanente**, pas au survol.
- **Défaut : les trois paliers engagés.** « Non abordées » reste visible et compté, éteint.
  Le filtre est déclaré, jamais silencieux — le catalogue vit sur Programme.
- **Les compteurs des pastilles portent sur l'année entière, jamais sur la sélection.** Même
  doctrine que les boutons de `/lacunes`, qui annoncent le compte réel de ce qu'ils vont créer.
- **Recherche locale et lexicale**, accents pliés, réponse à la frappe, **zéro requête** (patron
  `adr-0024-zetis-galaxy-progression` (Amendement 6)). La recherche sémantique reste au chat.

### Colonnes

```txt
│ NOTION                  MATIÈRE    PALIER         DEPUIS      LACUNE      MISSION │
│ ▸ Temps du récit        Français   ● à renforcer  hors trace  prioritaire   active│
│ ▸ Accord du participe   Français   ● à renforcer  3 j         —             —     │
│ ▸ Subordonnées          Français   ○ non abordée  —           —             —     │
```

- **Palier** : `acquise` (émeraude) · `à renforcer` (ambre) · `en cours` (cyan) · `non abordée`
  (anneau vide). Aucune teinte rouge — ce sont des notions à travailler, pas des fautes.
- **Aucun score numérique en colonne.** `mastery_score` vit dans la frise dépliée : une colonne
  « 40 / 100 » sur 280 lignes refabriquerait le bulletin banni.
- **Mission** lit `has_active_mission` de la **fonction partagée** (celle dont le dashboard et
  `/lacunes` se servent après avoir divergé), jamais une seconde.
- **Lacune** : la sévérité, et le lien vit sur le **filtre** (`?subject=`, déjà lu par
  `useLacunes`), pas sur la ligne. Un lien par ligne promettrait un écran centré sur une notion.

### « Depuis » — deux absences, jamais un `null` unique

```txt
{ days: int }                     → « 3 j »
{ unknown: "before_history" }     → « hors trace » · title : bascule antérieure au 31/07/2026
{ unknown: "before_migration" }   → « hors trace » · title : consolidée avant la migration des dates
null                              → « — »  (non abordée, aucune ligne de maîtrise)
```

⚠️ **15 des 19 notions engagées de la base réelle n'ont aucune date** (mesuré au Lot 1 ; le
cadrage annonçait 10). La colonne est presque entièrement vide
au lancement, et c'est juste : une date inventée serait pire. Les deux `unknown` ont des libellés
distincts parce que leurs causes le sont — l'une se comblera d'elle-même, l'autre est perdue.

### Les trois tris

| Tri | Clé | Départage |
|---|---|---|
| **Notion** *(défaut)* | nom, accents pliés, `fr` | matière, puis `skill_id` |
| **Matière** | **ordre de l'année scolaire**, jamais alphabétique | nom, puis `skill_id` |
| **Date** | dernière bascule, décroissante | nom, puis `skill_id` |

> 🔴 **Le tri par date scinde la liste en TROIS blocs**, jamais en une liste continue :
> daté · *sans bascule enregistrée · N* · *non abordées · N*. Les glisser en queue sans marque les
> ferait lire comme « les plus anciennes » — l'exact contresens. Les deux séparateurs sont distincts
> et comptés, parce que les deux absences le sont.

Toute clé se termine par `skill_id` : sans cette queue, deux homonymes de matières différentes
changeraient de place d'un rendu à l'autre.

### Le dépliage d'une notion — la frise

```txt
▾ Temps du récit · Ch. 2 « Le récit »
  01/07 ● lacune ouverte — diagnostic, sévérité prioritaire
  03/07 ○ quiz de fin de cours — 40 / 100
  12/07 ○ mission de remédiation terminée — verdict « à revoir »
  20/07 ○ révision — difficile
  28/07 ○ quiz de fin de cours — 55 / 100
  ⚠ Aucune bascule de palier enregistrée : l'historique s'ouvre le 31/07/2026.
    Le palier courant est certain, sa date ne l'est pas.
  ┌ État actuel : à renforcer (45 / 100) · lacune ouverte depuis 36 jours ┐
  [Créer une mission] [Équiper la notion] [Ouvrir le cours] [Voir dans Lacunes ouvertes →]
```

> 🔴 **La frise remonte plus loin que l'historique des paliers.** `Gap.first_detected_at`, les
> tentatives de quiz, les missions terminées et les passages SRS sont datés **indépendamment** du
> backfill. Elle montre donc les événements datés, et **n'affirme jamais une bascule de palier
> avant le 31/07**.

Les actions portent sur une notion **désignée**, jamais sur « les 8 » d'un coup. Toute écriture
passe par une **confirmation explicite**, résultat affiché **sur place** (patron
`SubjectAnalysisPanel`). Aucune n'ouvre de route nouvelle.

---

## Vue « Par période »

> 🔴 **Aucun palier, aucun stock, aucune barre d'avancement.** Une fenêtre posée sur un palier est
> un mensonge ; posée sur un fait daté, elle est exacte. C'est toute la raison d'être de cette vue
> séparée.

```txt
[ 7 jours ] [ 30 jours ] [ 90 jours ] [ Année ]        du 07/07 au 06/08 · 30 jours
Matière : [Toutes] [Français] …

┌ 3 ────────────┐ ┌ 2 ────────────┐ ┌ 3 ────────────┐ ┌ 0 ─────────────────────┐
│ montées de    │ │ descentes de  │ │ premières     │ │ entrées / sorties du   │
│ palier        │ │ palier        │ │ mesures       │ │ palier acquise         │
│ ⚠ depuis 31/07│ │ ⚠ depuis 31/07│ │ ⚠ depuis 31/07│ │ ⚠ depuis 31/07         │
└───────────────┘ └───────────────┘ └───────────────┘ └────────────────────────┘
┌ 2 lacunes ouvertes ┐ ┌ 2 lacunes résolues ┐ ┌ 2 missions ┐ ┌ 15 révisions notées ┐
│ trace complète     │ │ trace complète     │ │ complète   │ │ ⚠ depuis 04/07      │
└────────────────────┘ └────────────────────┘ └────────────┘ └─────────────────────┘

⚠ Trois natures de fait, trois débuts de trace. Sur 30 jours, les bascules n'en couvrent
  que 6. Un compteur bas dit alors « pas de trace », jamais « pas de mouvement ».

── MARDI 5 AOÛT ──────────────────────────────────────────────────────────────
   📐 Théorème de Pythagore    Mission de progression terminée · verdict « à revoir »
   📐 Théorème de Pythagore    à renforcer → en cours ▲
── LUNDI 4 AOÛT ──────────────────────────────────────────────────────────────
   📕 Registres de langue      en cours → à renforcer ▼
   📕 Français                 3 révisions notées · 2 su · 1 difficile
```

### Ce qui y figure, et ce qui n'y figure pas

| Nature | Source | Début de trace |
|---|---|---|
| bascules de palier | `skill_mastery_history` | **31/07/2026** (`history_since`) |
| lacunes ouvertes / résolues | `Gap.first_detected_at` / `resolved_at` | complète |
| missions terminées | verdicts | complète |
| quiz notés | `QuizAttempt` | complète |
| révisions notées | `SpacedReviewAttempt` (hors `is_consolidation`) | **04/07/2026** |

**Exclus, et pour deux motifs différents :**

- **La production** (cours rédigés, dérivés produits) — datée, mais elle mesure le stock de contenu,
  pas la progression de Massimo. Sa maison est **Couverture**.
- **L'XP** — trois raisons : il apparaîtrait sous le même mot que la colonne « XP » de la vue
  matière, qui compte **depuis toujours** ; il serait le **seul compteur que le journal ne peut pas
  recomposer** (`XPEvent` n'a pas de `skill_id`) ; et l'`adr-0028` §5 l'a retiré des KPI parce qu'il
  n'est pas décisionnel.

### Les compteurs sont dérivés du journal affiché

C'est l'invariant « le détail recompose le nombre » (`adr-0038-les-preuves-menent-quelque-part` (Amendement 1) §2),
transposé de la ligne à la fenêtre. Aucun compteur n'est servi à part.

**Corollaire testable** : sur une fenêtre de 90 jours, le compte des bascules est **identique** à
celui de 7 jours si aucune bascule n'a eu lieu entre-temps — et l'écran doit l'**expliquer** plutôt
que de le laisser lire comme une stagnation.

⚠️ **Aucun tri sur cette vue.** Un journal est chronologique par nature ; lui offrir un tri par
notion en ferait une seconde vue notion mal déguisée.

---

## Contrat API

| Besoin | Route | État |
|---|---|---|
| table matières | `GET /api/parent/progress/overview` | **existe, inchangée** |
| index des notions + faits datés | `GET /api/parent/progress/skills` | 🆕 |
| frise d'une notion | `GET /api/parent/progress/skills/{skill_id}/timeline` | 🆕 |

> ⚠️ `GET /progress/skills` figure dans la section d'`API_SPEC.md` marquée *« documentée mais
> JAMAIS implémentée »*. **La retirer de cette section** en l'écrivant, sinon l'avertissement qui
> protège la section devient faux sur une ligne.

`/progress/skills` sert **une requête agrégée** — 280 notions × (maîtrise, dernière bascule, lacune,
mission active) en une passe. **Aucun N+1**, **aucune pagination**, **aucun paramètre de période**.
Filtres, tri, recherche et bascule de vue sont **client, zéro requête**.

**Test de nombre de requêtes constant**, indépendant du nombre de notions et de matières.

La **frise est paresseuse, par notion** — **troisième exception assumée** au « zéro état de
chargement » de l'`adr-0028` §4, après le drill-down d'un jour et le panneau d'analyse. Même
motif : une descente vers un détail non borné, pas un filtre.

**Aucune ré-énumération de statuts.** La route **importe** le regroupement canonique
(`dashboard/projections`) et `OPEN_GAP_STATUSES` (`progress/service`). `SkillMastery.status` a
**six** valeurs — `in_progress` est écrit par `missions/service.py` hors de tout
`_status_from_score()`. Test-verrou : ajouter une septième valeur doit faire échouer un test, pas
glisser dans « non abordée ».

## États

| État | Rendu |
|---|---|
| Chargement | squelette de table, jamais un spinner nu |
| Erreur | bandeau + « Réessayer », la page ne se vide pas ; **le tableau ne rend rien** (un tableau vide se lirait « aucune matière ») |
| Aucune matière | « Aucune matière dans l'année active » + lien Années scolaires |
| Matière sans référentiel | ligne présente, état écrit, lien Programme |
| Vue notion, filtres sans résultat | état vide nommant le filtre, filtre visible et retirable |
| Vue période, fenêtre antérieure à la trace | *« Aucun fait daté sur ces N jours »* + la phrase qui distingue « rien n'a bougé » de « rien n'a été tracé » |

## Navigation et paramètres d'URL

- `?subject=<slug>` — **conservé**, il porte le constat du dashboard. Il **met en évidence** la
  ligne de la vue matière et **filtre** les vues notion et période. Slug inconnu → aucun effet,
  jamais une table vide.
- `?view=matiere|notion|periode` — la vue est un état d'affichage : `setParams(..., { replace: true })`,
  comme la mise en avant. Sans `replace`, « Retour » rejouerait chaque bascule d'onglet.
- Le filtre matière est **partagé** par les trois vues : changer d'onglet ne le perd pas.

## Hors périmètre

- Toute courbe, série ou agrégat temporel sur cette page.
- Une fenêtre temporelle dans le **service d'évidence** — le `period` du Conseil reste une étiquette.
- La fusion avec `/lacunes`, dont les deux générateurs sont de **portée globale** (leur propre
  `ConfirmDialog` le dit : *« la génération ne sait pas se restreindre »*).
- `skill_id` sur `XPEvent`.

## Voir aussi

- `docs/decisions/adr-0040-progression-dans-le-temps.md` — la décision, ses quatre lots et sa
  révocation bornée de l'`adr-0038` §5.
- `docs/frontend-papa/page-lacunes.md` — la page voisine, **renommée** par le §5 de l'ADR-0040
  (« Lacunes ouvertes ») pour que les deux vocabulaires cessent de se recouvrir.
- `page-dashboard.md` §3 — « Évolution de la mémoire », qui garde les **populations** et les
  **tendances** là où cette page prend les **notions** et les **faits datés**.
