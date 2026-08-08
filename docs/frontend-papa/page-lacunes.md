# Page Papa — Lacunes ouvertes

> **Créée le 2026-08-06.** La page existe en code depuis des semaines (`LacunesPage.tsx`) et
> n'avait **aucune spec** — ce qui est précisément ce qui a laissé son titre dériver.
> Le renommage est décidé par `adr-0040` §5.
>
> **Amendée le 2026-08-09 par l'`adr-0047` — la ligne cesse d'être inerte.**
> **Les passages amendés portent la mention `[0047]`.** Maquette :
> `mockup/mockup-papa-lacunes-v1.html`. Ce qui ne porte pas la mention est **inchangé** : les trois
> titres de section, leurs notes, les deux boutons de génération, le filtre, les états vides.

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
│ DÉCOUVERTES, JAMAIS TRAVAILLÉES (3)      [Créer 3 missions de consolidation]   │
│   Un diagnostic les a repérées et aucune mission ne les prend en charge.      │
│   ∑ Maths — Comparaison de relatifs  [à traiter]  Valider le cours de … →     │
│       Une leçon existe, son cours est en brouillon.                    [0047] │
│                                                                              │
│ REVENUES PAR LA RÉVISION (1)             [Créer les missions de révision dues]│
│   ¶ Français — Temps du récit        [à traiter]  Produire le quiz de … →     │
│                                                                              │
│ DÉJÀ PRISES EN CHARGE (10)                                                   │
│   Une mission active couvre ces notions — rien à décider, mais on peut la voir│
│   ∑ Maths — Priorités opératoires    [à traiter]  Voir la mission →    [0047] │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Section | Population | Geste de SECTION | Geste de LIGNE `[0047]` |
|---|---|---|---|
| Découvertes, jamais travaillées | `Gap.status == "open"` | consolidation (remédiation) | selon `content_state` |
| Revenues par la révision | `Gap.status == "in_progress"` | révision — relais de l'`adr-0017` §5bis | selon `content_state` |
| Déjà prises en charge | `has_active_mission` | aucun | **Voir la mission →** |

**Une section vide n'est pas affichée** : elle n'apprendrait rien et pousserait le reste hors de
l'écran.

> 🔴 **`[0047]` Ce que ce comportement produit aujourd'hui, et qui n'était écrit nulle part.**
> Relevé en base de dev le 2026-08-09 : les **10** lacunes ouvertes ont **toutes**
> `has_active_mission`. Donc `pending` est vide, les deux premières sections **ne s'affichent pas**
> — ni leurs boutons — et la page ne montre que « Déjà prises en charge », la seule sans action.
> **La page entière est un cul-de-sac**, pas une ligne inerte parmi des sections vivantes.
> C'est ce qui rend le geste de cette troisième section **prioritaire** et non secondaire.

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

## `[0047]` Le geste de la ligne

Une ligne, **un** geste, et il dépend de ce dont on dispose. Le motif est écrit **en clair sous la
ligne** : Papa n'a pas à deviner pourquoi ce geste-là plutôt qu'un autre.

| Condition | Geste | Ce qu'il fait |
|---|---|---|
| `has_active_mission` | **Voir la mission →** | lien `/missions?focus=<mission_id>` |
| `content_state == "cours_brouillon"` | **Valider le cours de cette leçon →** | lien `/programme?lesson=<brouillon>` |
| `content_state == "aucune_lecon"` | **Équiper cette notion** | **action** `equipNotion(skill_id)` + confirmation |
| `content_state == "ok"` | **Relire la leçon →** | lien `/programme?lesson=<validée>` |

> 🔴 **`aucune_lecon` est une ACTION, pas un lien** — corrigé le 2026-08-09. `/quiz` pilote les quiz
> *de fin de cours*, « générés depuis le cours validé d'une leçon » : c'est exactement ce qui manque
> ici. Le geste réel est `equipNotion` (ADR-0042), qui produit **cinq** pièces — cours, fiche,
> cartes, quiz, carte mentale — en ~69 s. La confirmation le dit, et elle est obligatoire.
> Cette ligne-là est donc un `<button>`, les trois autres des `<Link>` : **la forme suit ce que le
> geste fait**.

> ⚠️ **Un geste n'est rendu que si son identifiant l'est.** `mission_id` absent alors que
> `has_active_mission` est vrai → aucun geste, jamais `/missions?focus=undefined`. Le serveur
> garantit les deux ensemble ; la page ne le suppose pas.

`has_active_mission` est testé **en premier** : une notion déjà couverte n'attend aucune décision de
contenu, quel que soit son `content_state`.

**Le grain est la NOTION, jamais la matière.** Un libellé qui dit « cette notion » mène à cette
notion.

> 🔴 **Ce chantier ne copie pas la station ② du Diagnostic — il la corrige.** Elle écrit « Produire
> le quiz de **cette notion** → » et envoie sur `/quiz?subject=<id>` : la **matière**. Le libellé y
> promet un grain que le lien ne livre pas. C'est le défaut que l'`adr-0039` est né de corriger.

> 🔴 **Une notion porte jusqu'à QUATRE leçons** (« Priorités opératoires » : #151 `draft`,
> #145 `draft`, #48 `validated`, #23 `validated`). **La leçon visée suit l'état visé par le geste** —
> celle qu'on doit *valider* est en brouillon, celle qu'on *relit* est validée. Départage entre
> candidates de même statut : **la première de l'ordre que `lessons_by_skill` établit déjà**
> (`updated_at` décroissant, puis `id`) — on ne pose pas un second ordre de « la plus récente ».
> Ouvrir une leçon déjà validée sous le libellé « Valider le cours » recréerait le défaut que ce
> chantier corrige.

### `[0047]` Le geste ne s'écrase pas sur un téléphone

Sous **640 px**, le badge de sévérité et le geste descendent sur leur propre ligne ; le corps prend
toute la largeur. Sans cette règle, `.corps` (`flex:1`, `min-width:0`) est comprimé **sous sa
largeur minimale** par ses deux frères `flex:0 0 auto`, et le titre part en colonne, un mot par
ligne. Vu à 375 px sur la maquette avant d'être écrit — c'est le défaut exact que la **PR #101** a
dû corriger après coup sur la zone C du Diagnostic.

## Filtre

`?subject=<slug>`, lu par `useLacunes` et appliqué **côté client** sur une liste déjà chargée —
zéro requête (`adr-0038` §4). Slug inconnu → repli sur « toutes », jamais une page vide.

Le filtre est **visible et retirable** (bandeau + « Toutes les matières »), et vit dans l'URL :
le lien qui amène ici le porte, et recharger ne le perd pas. Retiré avec `replace: true` — un filtre
est un état d'affichage, pas une étape de navigation.

## Ce que cette page n'est pas

- **Ce n'est pas la liste des notions fragiles.** Les deux populations sont **disjointes** — au
  2026-08-06 le dépôt comptait 13 notions fragiles pour **1** lacune ouverte ; au 2026-08-09 il y a
  **10** lacunes ouvertes. Le rapport bouge, la disjonction ne bouge pas, et c'est elle qui compte. Une notion peut être `weak` sans avoir jamais produit de
  `Gap`, et une lacune peut rester ouverte alors que la maîtrise est repassée à `solid`. Les notions
  fragiles se lisent sur **Progression**, vue notion.
- **Ce n'est pas une surface de mesure.** Aucun compteur global, aucune tendance, aucune date de
  bascule — Progression les porte.
- **Ce n'est pas une surface Massimo.** `require_parent` ; le vocabulaire d'échec est interdit des
  deux côtés, mais le mot « lacune » lui-même ne quitte jamais l'interface Papa.

## Contrat API

`GET /api/parent/progress/gaps` — **existe**. Rend toutes les lacunes ouvertes avec leur
`subject_slug`, leur sévérité, leur statut, `first_detected_at`, `has_active_mission`, `source` et
`content_state`.

### `[0047]` Deux champs de plus, et ils coûtent ZÉRO requête

| Champ | D'où il vient |
|---|---|
| `lesson_id` | `etat_contenu` obtient les objets `Lesson` **en lot** (`lessons_by_skill`), s'en sert pour classer, puis **les jette** |
| `mission_id` | `skills_with_active_mission` réduit des objets `Mission` à un `set[int]` |

C'est le motif exact de `source` dans l'`adr-0045` : *« le champ était sur la ligne et n'était
simplement pas rendu »*. Aucune requête supplémentaire, aucune migration.

> ⚠️ **`fetchOpenGaps()` ne prend aucun paramètre et ne doit pas en prendre** (`adr-0038` §4 :
> filtrer ne coûte rien). Les deux champs arrivent donc dans le **même payload**, calculés en lot —
> **jamais** par une requête par ligne.

> ⚠️ **`content_state` est typé `string | null`, pas une union.** Rendre quatre gestes selon sa
> valeur ne donne **aucune exhaustivité au compilateur** : un cinquième état ajouté côté backend
> tomberait en silence dans la branche par défaut.

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

- `docs/decisions/adr-0047-la-page-lacunes-permet-d-agir.md` — la ligne devient un geste `[0047]`.
- `mockup/mockup-papa-lacunes-v1.html` — la maquette du chantier, avec l'état réel de la base.
- `docs/decisions/adr-0040-progression-dans-le-temps.md` §5 — le renommage et son test-verrou.
- `docs/frontend-papa/page-progression.md` — la page voisine, qui **lit** là où celle-ci **décide**.
- `GLOSSARY.md` — « Lacune ouverte » vs « Notion à renforcer », la frontière que ce renommage
  rétablit à l'écran.
