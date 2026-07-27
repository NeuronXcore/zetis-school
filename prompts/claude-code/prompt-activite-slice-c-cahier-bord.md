# Prompt Claude Code — Activité · Slice C (page Cahier de bord · vue Sessions)

> Dernière slice du chantier « Activité ». Slices A et B livrées : routes
> `parent/activity/*`, types `activity.ts`, `SubjectFilterChips` et le mapping
> d'icônes d'événements dans `@zetis/ui`, bloc Régularité sur le dashboard.
> Périmètre : la **page Cahier de bord, vue Sessions uniquement** — les volets
> IA du cahier (résumés journal, notes parent) sont hors périmètre (backlog).
> Référence visuelle : **`mockup-activite-massimo.html`**, vue Cahier de bord.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md`.
2. `docs/frontend-papa/page-cahier-bord.md` — section « Vue Sessions »
   **en entier** : spec de cette slice. Les sections amont de la page
   (événements pédagogiques, notes parent) ne sont **pas** ton périmètre.
3. **`mockup-activite-massimo.html`** (vue Cahier de bord) — KPI de période,
   filtres, blocs jour, cartes session, timeline, note de bas de carte.
4. **`packages/types/src/activity.ts`** — types sessions livrés en slice A,
   consommés tels quels ; divergence avec la spec → ARRÊTE-TOI et signale.
5. `@zetis/ui` : `SubjectFilterChips` et le mapping `event_type → icône Lucide`
   livrés en slice B — tu les **réutilises**, tu ne recrées rien.
6. La structure réelle des pages du frontend Papa (sidebar, routing, patron
   d'une page existante type « Cartes SRS » ou « Missions ») : tu ajoutes
   l'entrée « Cahier de bord IA » et la page sur ce modèle.

## Conventions à honorer

- **Zéro dépendance nouvelle**. Tailwind + shadcn/ui, icônes Lucide via le
  mapping partagé.
- Le client n'invente aucun chiffre : sessions, bornes horaires, minutes
  actives arrivent calculés du serveur. Le client **affiche**.
- Aucune donnée de cette page ne transite vers le frontend Massimo.

## Travail demandé

### 1. Page « Cahier de bord — sessions » (frontend-papa)

- Entrée sidebar « Cahier de bord IA » + route.
- KPI de période : sessions, temps actif total (`XhMM`), moyenne/session —
  calculés depuis la réponse serveur affichée, pas re-agrégés côté client
  au-delà de la somme d'affichage.
- Filtres : période **7/14/30 jours** (pilotent `from`/`to`) +
  `SubjectFilterChips` (pilote `subject_id`). Tout changement de filtre →
  refetch `GET /api/parent/activity/sessions`.
- Liste par jour, du plus récent au plus ancien :
  - en-tête : date longue FR, « n sessions · N min actives » ;
  - **jours sans session affichés** (« aucune session », « aucune session pour
    cette matière » si filtre) — l'absence est une information ;
  - par session : carte `début → fin` + badge « N min actives », timeline des
    événements (heure · icône · libellé · matière · XP), révisions déjà
    agrégées par le serveur.
- Note de bas de carte (texte de la spec) : reconstruction à 15 min, temps
  actif plafonné à 5 min, « indicateur de présence, pas mesure d'attention ».
- États : chargement, erreur, période entièrement vide (message dédié, pas une
  page blanche).

### 2. Activation du pont depuis le dashboard

Le bouton « Ouvrir dans le cahier de bord » du panneau détail-jour (slice B,
livré masqué) devient actif : il navigue vers la page avec la **date ciblée**
(query param, ex. `?date=`), la page charge alors la période contenant ce jour
et scrolle/positionne sur le bloc du jour.

### 3. Tests

Mêmes conventions que la slice B (patron de test frontend réel du repo).
Fonctions pures testables pour le formatage (`XhMM`, dates FR) si elles
n'existent pas déjà en utilitaire partagé — vérifie avant de créer.

## Fin de session

Checklist 9 points, mono-commit
`feat(activity): page Cahier de bord — vue sessions`.

Le chantier « Activité » est alors clos → prochaine étape hors périmètre :
migration `qwen3.6:35b-mlx` (décision en attente de clôture de chantier).
