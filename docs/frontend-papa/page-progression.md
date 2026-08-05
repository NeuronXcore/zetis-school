# Page Papa — Progression

> Écrite au cadrage du 2026-08-05. Met en œuvre `adr-0038`. **Remplace une page entièrement en
> mock** (`SUBJECTS_PROGRESS` de `data/mock`), qui affichait un pourcentage, un XP et un compte de
> lacunes ne venant d'aucune mesure.

## Objectif

Répondre à **une** question : *« où en est-on dans l'année, matière par matière ? »*

Non-objectifs : noter Massimo, produire un bulletin, classer les matières par niveau, agir. Agir se
fait depuis « Où agir », les missions ou le Conseil.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────────────────┐
│ Progression                      Avancement de Massimo, matière par matière│
├──────────────────────────────────────────────────────────────────────────┤
│ MATIÈRE          AVANCEMENT              ACQUIS        XP     À RENFORCER │
│ 📕 Français      ▓▓▓░░░░░░░ 10 / 96      1 acquise    367           8    │
│ 📐 Mathématiques ▓▓░░░░░░░░  5 / 58      0            577           3    │
│ 🌍 Histoire-Géo  ░░░░░░░░░░  0 / 34      0              5           0    │
│ 🧪 SVT           ▓░░░░░░░░░  2 / 68      0             60           1    │
│ 🇬🇧 Anglais       ▓░░░░░░░░░  2 / 24      0            100           1    │
│ 🇪🇸 Espagnol      référentiel non généré  →  ouvrir le programme          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Les quatre colonnes, et ce que chacune mesure

| Colonne | Mesure exacte | Source |
|---|---|---|
| **Avancement** | notions **engagées** / notions au programme — engagée = toute notion portant une ligne de maîtrise (consolidée ∪ fragile ∪ en cours) | `SkillMastery` × `Skill.subject_id` |
| **Acquis** | notions `mastered` — la définition figée du dépôt | `/progress/consolidated`, **route existante** |
| **XP** | cumul par matière, sur toute l'histoire | `XPEvent.subject_id` (agrégation nouvelle) |
| **À renforcer** | lacunes ouvertes de la matière | `Gap` ∈ `OPEN_GAP_STATUSES` |

> 🔴 **« Avancement » et « Acquis » sont DEUX mesures, jamais fondues.** La barre ne mesure pas
> l'acquisition : elle mesure ce qui a été **abordé**. Sur les données réelles il y a **1 notion
> consolidée sur 280** — une barre `mastered / total` afficherait zéro partout et ne dirait rien
> pendant des mois. C'est le piège déjà payé sur l'axe Y du nuage « Où agir ».
>
> Le vocabulaire de « consolidée » ne bouge pas (ADR-0028 §3 bis) : on mesure **autre chose**, et on
> le nomme autrement.

## Règles

- **Une matière sans référentiel reste dans la liste**, avec son état écrit (« référentiel non
  généré ») et un lien vers le Programme. La masquer ferait croire qu'elle n'existe pas — même
  règle que `has_referentiel` sur le dashboard.
- ⚠️ **`notions.total == 0` et « pas de référentiel » sont deux états distincts** : une matière peut
  avoir ses chapitres sans qu'aucune notion y soit rattachée. Ne pas les confondre.
- **Aucune fenêtre temporelle.** Tout est un stock. Le XP cumulé, l'avancement et les acquis se
  lisent « à aujourd'hui ». Aucun sélecteur de période sur cette page.
- **Aucune série, aucun historique.** La reconstruction du passé de la maîtrise existe déjà, bornée,
  dans « Évolution de la mémoire » du dashboard.
- **Aucune note globale, aucun classement.** Les pourcentages **par matière** sont un instrument
  d'analyse ; la note unique est bannie (ADR-0028 §9).
- **Registre** : « à renforcer », jamais « lacune » ni « retard » dans les libellés visibles.

## Contrat

Une seule requête au montage. Deux sources déjà écrites, une à ajouter :

| Besoin | Route |
|---|---|
| notions par statut + total, par matière | à décider en slice : réutiliser l'agrégat dashboard ou servir un agrégat propre |
| notions acquises nommées | `GET /api/parent/progress/consolidated` — **existe, et n'est appelée par personne** |
| XP par matière | agrégation nouvelle dans `gamification` |
| lacunes ouvertes | `GET /api/parent/progress/gaps` — existe |

> ⚠️ `fetchConsolidatedSkills` existe déjà dans `lib/activity.ts` et n'est **appelée nulle part**.
> La réutiliser, ne pas en écrire une seconde.

## États

| État | Rendu |
|---|---|
| Chargement | squelette de tableau, pas de spinner nu |
| Erreur | bandeau + « Réessayer », la page ne se vide pas |
| Aucune matière | « Aucune matière dans l'année active » + lien vers Années scolaires |
| Matière sans référentiel | ligne présente, état écrit, lien Programme |

## Ce que cette page ne fait pas

Elle ne propose aucune action. Elle ne rejoue aucun seuil de maîtrise (ADR-0028 §3 : les statuts
sont décidés serveur). Elle n'affiche pas de tendance.
