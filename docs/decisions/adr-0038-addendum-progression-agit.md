# Addendum ADR-0038 — Progression nomme ce qu'elle compte, et on peut agir depuis là

## Statut

Accepté — 2026-08-05.

> S'appuie sur : `adr-0038` (la page qu'il vient de rendre réelle), `adr-0028-addendum-analyse-par-matiere`
> (le panneau qui NOMME les notions, et le verrou constat↔preuve), `adr-0021` (l'équipement
> auto-validé d'une notion), `adr-0018` (le Commander mono-notion), `adr-0030` (un écran, un appel
> réseau).
>
> ⚠️ **RÉVOQUE une décision de l'ADR-0038 §6**, écrite le matin même — le deuxième point, et lui
> seul. Les trois autres non-objectifs du §6 restent intacts et opposables.
>
> **Aucune migration. Aucune route d'écriture nouvelle.**

## Contexte — le défaut du chantier, reproduit un cran plus bas

L'ADR-0038 a fermé le motif *« un constat annonce N, sa preuve en montre un autre »* sur les trois
branches de la Lecture ZETIS. La page `/progression` qu'il a produite est juste : ses quatre
nombres viennent tous d'une mesure.

**Mais ces nombres ne mènent nulle part.** Papa lit *« Français · 10 / 96 · 1 acquise · 367 XP ·
8 à renforcer »* et ne peut savoir **lesquelles** sans quitter la page, ni agir sans en ouvrir une
troisième. C'est la même famille de défaut : un compte affiché dont la preuve n'est pas à portée.
Le chantier du matin l'a corrigé **entre les écrans** ; il reste entier **à l'intérieur** de
celui-ci.

## Ce qui a changé depuis le §6, et qui justifie de le rouvrir

Le §6 disait :

> **Pas une seconde surface de décision.** Elle mesure ; agir se fait depuis « Où agir », les
> missions ou le Conseil. **Un bouton d'action ici dupliquerait un chemin existant.**

Le motif est la **duplication**, pas l'action. Or le read-before-code du 2026-08-05 établit que
**toutes les actions concernées existent déjà comme routes réutilisables telles quelles** :

| Action | Route | Remarque |
|---|---|---|
| mission sur UNE notion | `POST /api/reports/class-council/create-missions` | accepte des `skill_ids` arbitraires, **sans rapport de conseil** |
| équiper une notion | `POST /.../class-council/equip-notion` | auto-validé (ADR-0021) |
| Conseil sur la matière | `POST /api/reports/class-council` | portée matière, ADR-0020 addendum |

Appeler ces routes depuis Progression **ne duplique aucun chemin** : c'est le même chemin, atteint
d'un autre endroit. La prémisse du §6 ne tient donc plus. Elle tenait tant qu'on supposait qu'agir
depuis Progression exigerait d'y écrire une logique de décision — ce n'est pas le cas.

> ⚠️ Ce qui reste vrai du §6 : Progression **ne décide de rien elle-même**. Elle ne compose aucune
> mission, ne choisit aucune notion, n'applique aucun seuil. Elle **déclenche** ce que d'autres
> modules décident, sur la notion que Papa désigne.

## Décision

### §1 — Chaque ligne se déplie sur le détail NOMMÉ de ses quatre nombres

Un dépliage dans le flux, sous la ligne — **pas une modale**, comme le panneau d'analyse et le
drill-down d'un jour, les deux seuls précédents du dépôt.

**Un seul dépliage ouvert à la fois.** Deux matières dépliées feraient défiler la table hors de
l'écran, et le dépliage existe pour rapprocher le détail de son nombre, pas pour l'en éloigner.

### §2 — Le détail RECOMPOSE le nombre de la ligne, sinon il ment

C'est le verrou du chantier, transposé d'un écran à l'autre à l'intérieur du même :

| Colonne | Ce que le dépliage montre | Invariant |
|---|---|---|
| Avancement `10 / 96` | les 10 notions engagées, nommées, avec leur statut ; les non abordées | `len(engagées) == engaged` et `engagées + non abordées == total` |
| Acquis `1` | les notions `mastered` nommées, avec leur score | `len(acquises) == notions.consolidated` |
| XP `367` | la répartition **par motif** | `Σ montants == xp` |
| À renforcer `8` | les notions fragiles nommées | `len(liste) == notions.fragile` |

### §3 — Le XP se détaille par MOTIF, jamais par notion

`XPEvent` porte `student_id, subject_id, amount, reason, created_at` — **pas de `skill_id`**. La
question *« quelles notions ont rapporté ces 367 XP ? »* n'a pas de réponse en base, et n'en aura
pas sans migration.

Le dépliage répond donc à la question voisine et honnête : *« par quels gestes ? »* — missions,
quiz, verbalisations, diagnostics.

> 🔴 Écrit ici pour que personne ne le redécouvre en croyant à un oubli d'implémentation. Ajouter
> `skill_id` à `XPEvent` est un chantier à part, avec migration, et il faudrait d'abord établir que
> quelqu'un se pose la question — le XP est un **stock de motivation**, pas un instrument
> d'analyse par notion.

### §4 — Les actions vivent SUR le nom, jamais sur le nombre

Une action porte toujours sur une notion **désignée**, ou sur la matière entière. Jamais sur « les
8 » d'un coup : un geste en masse depuis une page de mesure est exactement la surface de décision
que le §6 refusait, et le refus reste juste sur ce point.

Toute écriture passe par une **confirmation explicite**, et son résultat s'affiche **sur place** —
patron déjà tenu par `SubjectAnalysisPanel`.

### §5 — Ce qui reste interdit sur Progression

Les trois autres non-objectifs du §6 sont **inchangés** :

- **pas un bulletin** — aucune note globale, aucun classement de matières (ADR-0028 §9) ;
- **pas un historique** — aucune série temporelle, la reconstruction du passé vit dans « Évolution
  de la mémoire » ;
- **aucune fenêtre temporelle** — tout reste un stock, lu « à aujourd'hui ».

Et s'y ajoute : **le dépliage ne crée aucune route**. Le jour où une action demandée ici n'existe
pas ailleurs, elle se conçoit ailleurs — pas ici.

### §6 — Le réseau : rien de ce qui est déjà en mémoire n'est redemandé

Règle héritée du panneau d'analyse, et elle décide de chaque chiffre affiché : **le réseau ne sert
que ce que la table ne porte pas, des NOMS.** Les quatre nombres viennent de `/progress/overview`,
déjà chargé ; les relire au dépliage fabriquerait une seconde source pour une mesure affichée à
quelques pixels — le bug que ce chantier vient de solder, reproduit à l'intérieur d'une ligne.

Le dépliage réutilise `GET /progress/subjects/{id}/analysis`, qui est **déjà** la route des noms
d'une matière et déjà chargée paresseusement. Elle est **étendue**, pas doublée.

`GET /progress/consolidated` — écrite il y a des semaines et **appelée par personne** — devient
enfin la source de la colonne « Acquis », chargée **une fois pour toute la page** au premier
dépliage. La table garde sa requête unique au montage.

## Ce que cet addendum ne fait pas

- Il n'ajoute **aucune route d'écriture** et ne modifie aucun générateur.
- Il ne touche pas à `XPEvent` ni à aucun schéma de base.
- Il ne change **aucune** des quatre mesures de la page : le dépliage les explique, il ne les
  recalcule pas.
- Il ne touche pas au `SubjectAnalysisPanel` du dashboard, qui ignore les champs nouveaux.

## Le signal qui dirait qu'on s'est trompé

- **Papa agit depuis Progression sans jamais ouvrir « Où agir ».** Ce serait le signe que les deux
  surfaces se concurrencent au lieu de se compléter — la réponse serait de retirer les actions
  d'ici, pas de les enrichir.
- **Un détail affiche un nombre différent de sa ligne.** Le défaut de tout le chantier, revenu
  d'un cran plus bas ; c'est ce que les invariants du §2 doivent rendre impossible.
- **Le dépliage devient la vraie page et la table un menu.** Il faudrait alors assumer une page par
  matière, pas empiler dans un tiroir.
- **Quelqu'un demande le XP par notion.** Alors le §3 aura eu tort de trancher sans migration — et
  ce sera un chantier, pas un correctif.
