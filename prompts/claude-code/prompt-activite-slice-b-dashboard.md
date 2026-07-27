# Prompt Claude Code — Activité · Slice B (télémétrie Massimo + bloc Régularité dashboard Papa)

> Suite de la slice A (backend livré : routes `parent/activity/*`, télémétrie,
> types `activity.ts`). Périmètre : (1) le **hook de télémétrie côté Massimo**
> (2 fichiers, posé ici pour que le journal s'alimente au plus tôt), (2)
> l'**extraction `subjectIcons` → `@zetis/ui`**, (3) le **bloc Régularité** du
> dashboard Papa. La page Cahier de bord est la slice C (prompt dédié).
> Référence visuelle : **`mockup-activite-massimo.html`**, vue Dashboard.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md`.
2. `docs/frontend-papa/page-dashboard.md` — sections « KPI » (deltas) et
   « Bloc Régularité » **en entier** : spec de cette slice.
3. **`mockup-activite-massimo.html`** (vue Dashboard) — structure, paliers de
   couleur, panneau détail-jour, badge décrochage, pastilles de filtre. La
   maquette fait foi pour le rendu ; les emojis y sont des **placeholders**.
4. `design-system.md` — §« Pictogrammes de matière » (résolveur `subjectIcons`,
   repli emoji) et §« Briques partagées » (précédent d'extraction
   `GenerationProgress` vers `packages/ui`) : c'est le patron de l'extraction
   demandée ici.
5. **`packages/types/src/activity.ts`** livré par la slice A — tu consommes ces
   types tels quels ; s'ils divergent de la spec, ARRÊTE-TOI et signale.
6. `apps/frontend-massimo/src/lib/subjectIcons.ts` réel + l'emplacement réel
   des assets (`src/assets/subjects/`) — ce que tu extrais.
7. Le routeur réel du frontend Massimo (pour le hook télémétrie) et la page
   Dashboard réelle du frontend Papa (ce que tu étends) + le client HTTP
   partagé de chaque app.

## Conventions à honorer

- **Zéro dépendance nouvelle** : heatmap en grille CSS/JSX maison (~60 lignes),
  pas de lib calendrier. Tailwind + shadcn/ui existants.
- **Icônes** : Lucide pour les événements du panneau détail-jour (mapping
  `event_type → icône` dans un module partageable — la slice C le réutilise).
  Jamais d'emoji codé en dur.
- **`prefers-reduced-motion`** respecté si tu ajoutes la moindre transition.
- Le client n'invente aucun chiffre : minutes, paliers de décrochage, deltas
  viennent du serveur ; seuls les **paliers de couleur** (0/<10/10–20/20–40/40+)
  sont de la présentation côté client.

## Travail demandé

### 1. Télémétrie Massimo (frontend-massimo)

Hook de routeur : à chaque changement de route, `POST /api/telemetry/pageview`
`{route}` — fire-and-forget (échec silencieux, jamais bloquant pour la
navigation), pas d'envoi si la route est identique à la précédente (le serveur
dédupe aussi, ceinture et bretelles). **Aucune UI côté Massimo** : rien du
tracking n'est visible dans son interface.

### 2. Extraction `subjectIcons` → `@zetis/ui`

- Déplace le résolveur + les assets PNG vers `packages/ui` (patron
  `GenerationProgress` : l'ancien chemin Massimo **ré-exporte** depuis
  `@zetis/ui` — zéro régression des imports existants, c'est la preuve de
  réutilisation).
- Crée **`SubjectFilterChips`** dans `@zetis/ui` : pastilles « Toutes » +
  matières (pictogramme en rond + nom), état actif, contrôlé
  (`value`/`onChange`), accessible clavier. Consommé ici et en slice C.

### 3. Bloc « Régularité » (frontend-papa, page Dashboard)

- Cartes KPI existantes : affichage du `delta` (`+18 min` vert / `−2` ambre,
  rien si delta nul) selon le payload `{value, delta}`.
- `SubjectFilterChips` au-dessus de la grille → recharge la heatmap avec
  `subject_id`.
- Heatmap 26 semaines × 7 jours (lundi en haut), mois en tête, légende
  0 → 40 min+, tooltip natif « date · N min actives ». Jours futurs
  transparents, jours vides gris bordé.
- **Badge décrochage** ambre dans l'en-tête de carte si `days_inactive >= 4`
  (« aucune activité depuis N jours ») — affichage à la consultation, aucune
  notification.
- **Panneau détail-jour inline** (pas de modale) : clic sur un jour → fetch
  paresseux `GET /parent/activity/days/{date}` (+ `subject_id` si filtre
  actif), journal (heure · icône Lucide · libellé · matière · XP), bouton
  « Ouvrir dans le cahier de bord » **masqué** tant que la route de la page
  n'existe pas (slice C l'activera). Cellule sélectionnée marquée (outline),
  clics successifs sur d'autres jours remplacent le panneau.
- Note sous la carte : « minutes actives = indicateur de présence » (texte de
  la spec).

### 4. Tests

Conventions de test frontend réelles du repo (lis-les d'abord ; si aucun patron
de test frontend n'existe, dis-le et livre sans, ne crée pas un harnais
nouveau). Vérifie a minima le mapping paliers→classes et la construction de la
grille (semaines/jours) en fonctions pures testables.

## Fin de session

Checklist 9 points, mono-commit
`feat(activity): télémétrie Massimo, subjectIcons partagé et bloc Régularité Papa`.
