# Page Papa — Lacunes ouvertes

> **Créée le 2026-08-06.** La page existe en code depuis des semaines (`LacunesPage.tsx`) et
> n'avait **aucune spec** — ce qui est précisément ce qui a laissé son titre dériver.
> Le renommage est décidé par `adr-0040` §5.

## Objectif

Répondre à **une** question : *« quelles décisions restent ouvertes, et laquelle je traite ? »*

C'est une surface de **décision**, pas de mesure. Progression lit ; cette page tranche.

## Le renommage, et pourquoi il n'est pas cosmétique

Trois surfaces employaient « à renforcer » pour trois populations différentes :

| Surface | Ce que le mot désignait | Compte réel |
|---|---|---|
| KPI dashboard | `SkillMastery ∈ {weak, learning}` | **13** |
| titre de cette page | lignes `Gap` ouvertes | **1** |
| `SEVERITY.medium` | un sous-ensemble de ce sous-ensemble | — |

Conséquence visible avant correctif : cette page affichait **« Rien à renforcer pour le moment »**
pendant que le dashboard annonçait 13 notions à renforcer.

Le `GLOSSARY` tranchait déjà : *« Formulée côté interface en **lacune ouverte**, jamais en notion à
renforcer : ce libellé-là appartient au palier de maîtrise. »*

| Avant | Après |
|---|---|
| titre « Notions à renforcer » | **« Lacunes ouvertes »** |
| `SEVERITY.medium` : « à renforcer » | **« à traiter »** |
| état vide : « Rien à renforcer pour le moment » | **« Aucune lacune ouverte »** + *« des notions peuvent rester fragiles sans lacune ouverte → voir Progression »* |

Inchangés : le sous-titre, `SEVERITY.low` (« à surveiller ») et `high` (« prioritaire »), et la
doctrine chromatique — **aucune teinte rouge**, ce sont des notions à travailler, pas des fautes.

> **Test-verrou** (`adr-0040` §5) : la chaîne « à renforcer » est interdite dans un contexte `Gap`,
> et « lacune » dans un contexte `SkillMastery`. Ce dépôt a déjà prouvé deux fois qu'un mot partagé
> finit par fondre deux mesures.

## Structure

Trois sections, dérivées **toutes** du jeu filtré — aucune ne peut l'oublier.

```txt
┌──────────────────────────────────────────────────────────────────────────────┐
│ Lacunes ouvertes                                                             │
│ Ce que les diagnostics et les missions ont mesuré — et ce qu'il reste à décider│
├──────────────────────────────────────────────────────────────────────────────┤
│ DÉCOUVERTES, JAMAIS TRAVAILLÉES (1)      [Créer 1 mission de consolidation]   │
│   Un diagnostic les a repérées et aucune mission ne les prend en charge.      │
│   📕 Français — Temps du récit · repérée le 1er juillet 2026    [prioritaire] │
│                                                                              │
│ REVENUES PAR LA RÉVISION (0)             [Créer les missions de révision dues]│
│                                                                              │
│ DÉJÀ PRISES EN CHARGE (1)                                                    │
│   Une mission active couvre ces notions — rien à décider.                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Section | Population | Générateur |
|---|---|---|
| Découvertes, jamais travaillées | `Gap.status == "open"` | consolidation (remédiation) |
| Revenues par la révision | `Gap.status == "in_progress"` | révision — c'est le relais de l'`adr-0017` §5bis |
| Déjà prises en charge | `has_active_mission` | aucun, rien à décider |

**Une section vide n'est pas affichée** : elle n'apprendrait rien et pousserait le reste hors de
l'écran.

## Les deux gestes

Aucun automatisme, aucune route nouvelle — les deux générateurs existaient avant la page.

> 🔴 **Les comptes des BOUTONS ne sont PAS filtrés, et c'est voulu.** Les deux routes de génération
> n'ont **aucun paramètre de matière** : elles agissent sur tout. Un bouton qui annoncerait « 3 » et
> en créerait 7 serait le défaut même que le chantier `adr-0038` a corrigé, transposé à une action.
> Le libellé porte donc le compte réel et ajoute « · toutes matières » dès qu'un filtre est posé.

La `ConfirmDialog` annonce trois choses, et la première n'est pas négociable :

1. si un filtre est posé — que la création porte sur **toutes les matières** (bandeau ambre) ;
2. que les missions sont composées à partir des **contenus déjà validés** — aucun contenu n'est
   généré ;
3. qu'elles naissent **en attente de validation** : elles n'atteindront Massimo qu'une fois relues.

Sur la révision, une quatrième ligne : seules les cartes **dues** sont reprises, et leur nombre est
plafonné — une séance reste courte.

## Filtre

`?subject=<slug>`, lu par `useLacunes` et appliqué **côté client** sur une liste déjà chargée —
zéro requête (`adr-0038` §4). Slug inconnu → repli sur « toutes », jamais une page vide.

Le filtre est **visible et retirable** (bandeau + « Toutes les matières »), et vit dans l'URL :
le lien qui amène ici le porte, et recharger ne le perd pas. Retiré avec `replace: true` — un filtre
est un état d'affichage, pas une étape de navigation.

## Ce que cette page n'est pas

- **Ce n'est pas la liste des notions fragiles.** 13 fragiles pour 1 lacune ouverte en base réelle :
  les deux populations sont **disjointes**. Une notion peut être `weak` sans avoir jamais produit de
  `Gap`, et une lacune peut rester ouverte alors que la maîtrise est repassée à `solid`. Les notions
  fragiles se lisent sur **Progression**, vue notion.
- **Ce n'est pas une surface de mesure.** Aucun compteur global, aucune tendance, aucune date de
  bascule — Progression les porte.
- **Ce n'est pas une surface Massimo.** `require_parent` ; le vocabulaire d'échec est interdit des
  deux côtés, mais le mot « lacune » lui-même ne quitte jamais l'interface Papa.

## Contrat API

`GET /api/parent/progress/gaps` — **existe**, inchangée. Rend toutes les lacunes ouvertes avec leur
`subject_slug`, leur sévérité, leur statut, `first_detected_at` et `has_active_mission`.

`has_active_mission` vient de la **fonction partagée** — le dashboard (`open_gaps.without_mission`),
cette page et la vue notion de Progression s'appuient sur la **même**, après avoir divergé une fois
(le KPI ne regardait que les missions de remédiation et sur-comptait).

Génération : les deux routes existantes de `missions`, sans paramètre de portée.

## États

| État | Rendu |
|---|---|
| Chargement | trois squelettes, pas de spinner nu |
| Erreur | bandeau + « Réessayer » |
| Aucune lacune | **« Aucune lacune ouverte »** + le renvoi vers Progression |
| Résultat de création | bandeau émeraude + « Voir les missions → » |

## Voir aussi

- `docs/decisions/adr-0040-progression-dans-le-temps.md` §5 — le renommage et son test-verrou.
- `docs/frontend-papa/page-progression.md` — la page voisine, qui **lit** là où celle-ci **décide**.
- `GLOSSARY.md` — « Lacune ouverte » vs « Notion à renforcer », la frontière que ce renommage
  rétablit à l'écran.
