# Page Papa — Années scolaires

> Réécrite le 2026-07-03 (ADR-0009 §4 et §9) à partir de la maquette « Années
> scolaires réconciliée » validée le même jour. Remplace l'ancienne version qui
> exposait les modes `Full IA | Hybride | Manuel` (dépréciés) et les boutons
> « Importer un programme » / « Générer avec IA » (déplacés vers la page Programme).

## Objectif

Gérer le **cadre temporel** de la scolarité de Massimo : année active, dates, niveau,
statut, historique des années passées, création d'une nouvelle année. Le **contenu**
de l'année (matières → chapitres → leçons → notions) vit dans la page **Programme** ;
cette page s'y réfère mais ne l'édite jamais.

## Principes UX (issus de l'ADR-0009)

- **Pas de mode global** : la co-construction Papa/IA est un état **par nœud**
  (`source` + `validation_status` sur chaque chapitre/leçon), pas une propriété de
  l'année. Aucun sélecteur `Full IA | Hybride | Manuel` n'apparaît nulle part.
- **Séparation temporel / structurel** : cette page répond à « quelle année, quelles
  dates, quel niveau ? » ; la page Programme répond à « qu'apprend-on cette année ? ».
  Le pont entre les deux est un lien unique « Voir le programme → ».
- **Une seule année active** à la fois (`status: active`) ; les autres sont
  `draft` ou `archived`.
- La sélection d'un niveau collège (ex. « 4e ») **résout** vers *cycle 4 + version de
  programme* côté référentiel (ADR-0009 §5) — la page affiche cette résolution en
  sous-titre informatif, elle ne la paramètre pas.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────────┐
│ Années scolaires                              [+ Créer une année]│
│ Cadre temporel de l'année de Massimo — le contenu vit dans       │
│ Programme                                                        │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ● Année active : 2026-2027 · 4e            [Active]          │ │
│ │   01 sept. 2026 → 04 juil. 2027                              │ │
│ │   Programme : cycle 4 · version 2020                         │ │
│ │   Matières : Français · Maths · Histoire-Géo · SVT · (+4)    │ │
│ │                                                              │ │
│ │   [Voir le programme →]                    [Modifier]        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ Historique                                                       │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 2025-2026 · 5e                             [Archivée]        │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Sections

### Carte « Année active »

- Libellé, niveau, badge de statut, dates de début/fin.
- Ligne « Programme : cycle 4 · version <N> » (résolution informative, ADR-0009 §5).
- Chips des matières de l'année (`SchoolYearSubject`), **en lecture seule** — pas
  d'édition de matière ici en V1.
- Actions : **Voir le programme →** (route de la page Programme, chemin majoritaire)
  et **Modifier** (édition inline : libellé, dates ; le niveau n'est pas modifiable
  une fois l'année créée).

### Historique

Liste des années non actives (`draft`, `archived`), une ligne compacte par année :
libellé, niveau, badge de statut. Pas d'action destructive en V1 (pas de suppression
d'année : l'historique pédagogique en dépend).

### Création d'une année (clic « + Créer une année »)

Formulaire (modale ou carte inline, cohérent avec le pattern d'ajout de la page
Programme) : Libellé (ex. `2027-2028`), Niveau (select : 5e/4e/3e, puis lycée le
moment venu), Dates de début et fin, statut initial `draft`. À l'activation d'une
année, l'année active précédente passe `archived` (une seule active — règle backend).

## États de page

- **Chargement** : Spinner partagé (`@zetis/ui`).
- **Vide** (aucune année) : EmptyState avec le CTA « Créer une année ».
- **Erreur** : message + bouton réessayer.

## Données API

- `GET /school-years` — liste (active + historique).
- `POST /school-years` — création.
- `PATCH /school-years/{id}` — édition (libellé, dates, statut).
- Matières de l'année : réutiliser la lecture existante du module curriculum
  (croisement subjects × année active) — vérifier le chemin réel dans `router.py`,
  ne rien dupliquer.

> ⚠️ L'ancien `POST /school-years/{id}/ai-generate-plan` est **supprimé de la spec** :
> la génération se fait par matière via `POST .../generate-chapters` (page Programme).
> Le CRUD `school-years` est référencé par `FRONTEND_ROADMAP.md` (Lot E) — vérifier
> l'existant backend avant d'implémenter.

## Thème

Papa émeraude (`@zetis/ui`, tokens sémantiques). Badges de statut : Active =
émeraude clair, Brouillon = ambre clair, Archivée = neutre — texte foncé de la même
famille que le fond (jamais noir pur).

## Hors périmètre de cette page (lots ultérieurs)

- **Copie inter-années** (ADR-0009 Lot 3) : à la création d'une année du même cycle,
  proposer la copie des chapitres pertinents (provenance conservée, progression
  réinitialisée). Le formulaire de création V1 n'en montre rien.
- Métriques et bilan d'année (temps passé, XP, chapitres complétés) — futur.
- Gestion des matières de l'année (ajout/retrait de `SchoolYearSubject`) — futur.
- Suppression de la colonne `school_years.mode` (première migration touchant la table).
