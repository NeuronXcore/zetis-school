# Prompt Claude Code — Couverture de production · Slice B (frontend Papa)

> **Prérequis : la Slice A backend est livrée et mergée** (`GET /api/production/coverage`,
> `GET /api/production/orphans`, types partagés).
> Travaille uniquement dans `apps/frontend-papa` (+ extraction validée éventuelle vers
> `@zetis/ui`). **Frontend pur** : aucun endpoint, schéma ou migration créé/modifié.
> Aucune modification du frontend Massimo.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` ;
2. `docs/frontend-papa/page-couverture.md` — la spec de page ;
3. **La maquette validée `docs/frontend-papa/mockup/maquette-papa-couverture.html`** — référence visuelle exacte
   (thème émeraude, KPI, bandeaux d'anomalie, matrice, légende, encart orphelins, notes de
   bas de page). Transpose en React/Tailwind avec les tokens Papa — **ne recopie pas le CSS
   brut** ;
4. Les **types partagés** produits par la Slice A : c'est le contrat, n'en redéclare aucun ;
5. Une page Papa existante branchée (pilotage Fiches ou Programme) : patron d'appel API,
   header, thème ; `packages/ui` (`Button`, `Card`, `Badge`, `EmptyState`, `Spinner`,
   `ContentStatusBadge`).

Si une primitive générique manque, **STOP** : propose son extraction vers `@zetis/ui`,
attends validation — pas de variante locale.

## 1. Navigation — décision arbitrée, à appliquer telle quelle

La sidebar Papa mélange aujourd'hui deux familles sans le dire : le **suivi de Massimo** et la
**production de contenu**. La Couverture n'est pas une vue partielle de plus : elle est
l'**union** des cinq pages de pilotage par type. Elle prend donc la tête du second groupe.

```txt
Dashboard · Progression · Lacunes · Missions · Diagnostics
Conseil de classe IA · Cahier de bord IA
──────────────────────────────────────────      ← séparateur
Couverture            ← nouvelle entrée, EN TÊTE du groupe production
Programme · Quiz · Fiches · Mindmaps
Cartes SRS · Capsules IA · Sources de cours
──────────────────────────────────────────
Paramètres
```

- Entrée « Couverture », icône Lucide (`LayoutGrid` ou `Table2` — choisis, signale-le),
  route `/couverture` (ou la convention réelle des routes Papa — vérifie).
- **Introduis les séparateurs de groupe** dans la sidebar : c'est le geste qui rend la
  structure lisible sans rien déplacer.
- **Ne supprime, ne déplace, ne renomme aucune entrée existante.** La trajectoire consiste
  peut-être à démoter Fiches/Mindmaps/Cartes SRS plus tard ; ce n'est pas ce chantier. On ne
  déplace pas cinq pages en même temps qu'on en crée une.

### Carte d'alerte au Dashboard — une ligne, pas plus

Sur `DashboardPapaPage`, une carte d'alerte unique : « N objets attendent ta relecture ·
M périmés », cliquable vers `/couverture`. Règle du `docs/frontend-papa/README.md` : *les
alertes doivent proposer une action*. **Le Dashboard signale, la Couverture traite** — n'y
mets ni matrice, ni KPI de production, ni compteur détaillé. Si les deux compteurs sont à
zéro, la carte ne s'affiche pas.

## 2. La page (hook `useCoverage`, logique hors composants)

- Sélecteur d'année scolaire dans le header ; filtre matière ; recherche de leçon.
- **KPI (4)** : leçons validées · cours rédigés `n/total` · % de dérivés produits · périmés.
  Le cours **n'est pas** compté dans le pourcentage de dérivés — il en est la condition.
- **Deux bandeaux d'anomalie** côte à côte, chacun masqué si son compteur est nul :
  ambre « en attente de relecture » (bouton vers la file de relecture — **inerte pour
  l'instant**, chantier distinct) ; rouge « orphelins » (ancre vers l'encart en bas de page).
- **Filtres en pilules** : Tout · 🔒 Bloquées · 🟢 Prêtes, incomplètes · ⏳ À relire ·
  ⚠ Périmés. Filtrage **client** sur les données déjà chargées, pas de re-fetch.
- **Matrice** : un tableau par matière, lignes groupées par chapitre, une ligne = une leçon.
  Colonnes : Cours · Quiz · Fiche · Mindmap · Cartes · Capsules. Les deux dernières ont un
  **fond distinct** et un sur-titre « notions couvertes » — la distinction leçon-centré /
  notion-centré doit être visible sans lire la légende.
- **Cellule** : `validated` ✓ émeraude · `pending` ⏳ ambre · `stale` ⚠ rouge ·
  `absent` `+` pointillé **cliquable** · `blocked` `·` gris inerte. Chaque cellule porte un
  `title` explicite (date, compteur, cause du blocage).
- **Nuancier de provenance sur le ✓** (addendum §F) — un ✓ ne dit pas comment l'objet est
  passé. Trois traitements selon `validated_by` : `parent` → émeraude plein (relu pièce à
  pièce) ; `parent_bulk` → vert pâle cerclé (validation groupée ou équipement ADR-0021 §2,
  jamais ouvert) ; `system` → gris (servi sans relecture, doctrine ADR-0014 : les quiz).
  `NULL` sur un objet validé (antérieur à la traçabilité) → rendu comme `parent_bulk`,
  `title` « provenance inconnue ». Le `title` de chaque cellule explicite la provenance en
  toutes lettres.
- **La colonne Cours porte le nuancier aussi**, et c'est la cellule où il compte le plus :
  `lessons` a gagné `validated_by` (§F.1), et l'équipement ADR-0021 §2 **génère et
  auto-valide le cours** dans son kit. Un cours `parent_bulk` signifie donc « Massimo lit un
  cours que Papa n'a jamais ouvert » — l'information la plus utile de toute la matrice. Ne
  la traite pas comme un cas particulier : c'est le même rendu, sur la même règle.
- **Clic sur `absent`** → la génération de l'objet correspondant, via l'endpoint existant de
  son module (fiche, mindmap, quiz, cours). Réutilise `GenerationProgress` et le patron de
  requête longue des pages de pilotage. **Aucun nouvel endpoint.**
- **Clic sur `stale`** → popover : rappel que l'objet est servi dans une version obsolète,
  boutons Régénérer et Inspecter (Inspecter = navigation vers la page de pilotage du type).
- **Boutons « ⚡ Compléter le chapitre (N) »** en tête de chaque chapitre : présents et
  **désactivés**, avec `title="Production en lot — chantier ultérieur"`. Même convention que
  le bouton en lot déjà désactivé sur la page Quiz — ils marquent l'emplacement sans le promettre.
- **Encart orphelins** en bas, hors matrice : type, titre, matière, date d'archivage.
  Bouton Supprimer **désactivé** quand `has_history` est vrai, avec le `title` qui l'explique.
  Les actions Réattacher/Supprimer sont **inertes** en V1 (endpoints non livrés) — présentes,
  désactivées, `title` explicite.
- **Notes de bas de page** : reprends les **quatre** de la maquette (lecture de la matrice,
  ce qui compte comme « couvert », provenance de la validation, le cours comme porte). Ce sont
  des garde-fous de lecture, pas de la décoration : sans elles les fractions passent pour
  exactes et un ✓ passe pour une relecture.

## 3. États

`Loading` (squelette de matrice, pas un spinner plein écran), `Error`, `Empty` (aucune année
active / aucune matière). Une matière sans leçon validée apparaît avec un état vide explicite —
**jamais filtrée silencieusement**.

## 4. Ce qu'il ne faut PAS faire

- **Aucun agrégat, aucune incitation sur la provenance** (§F.2). Pas de KPI « N objets validés
  en lot », pas de filtre « jamais relu », pas d'alerte, pas de badge d'appel à l'action. La
  provenance s'affiche **par objet** et ne se totalise jamais : c'est un fait de traçabilité,
  au même titre que « généré / manuel ». Un compteur qui reproche à Papa une tâche qu'il a
  délibérément choisi de ne pas faire n'est pas un outil de pilotage.
- **Aucun tri « le plus incomplet d'abord », aucun score de complétion par matière, aucun
  graphe.** La page répond à « où j'en suis », elle ne produit pas un classement. Une matrice
  à cases vides invite déjà assez à tout remplir ; l'envie de compléter n'est pas un critère
  pédagogique.
- Aucune génération déclenchée automatiquement, jamais, sous aucune condition.
- Aucun accès élève : cette page est strictement `require_parent` côté serveur, et ne doit
  rien exposer au frontend Massimo.

## 5. Tests

- Fonction pure de filtrage (pilules) : table de vérité sur un jeu de leçons mixte.
- Rendu : matrice avec les cinq états de cellule présents ; une ligne bloquée n'expose aucun
  `+` hors colonne Cours.
- Bandeaux masqués quand leur compteur est nul ; carte Dashboard masquée si les deux le sont.
- **Provenance** : les trois valeurs de `validated_by` produisent trois rendus distincts ;
  un `validated_by` à `NULL` sur un objet validé ne casse pas le rendu.
- `tsc --noEmit` et `vite build` de `frontend-papa` verts.

## Si tu es bloqué

Écarts probables : la sidebar Papa n'accepte pas de séparateurs de groupe sans refonte
(→ propose l'ajustement minimal) ; `GenerationProgress` couplé à son contexte d'appel
(→ signale, n'en duplique pas une variante) ; les endpoints de génération par type diffèrent
d'un module à l'autre au point d'empêcher un handler générique (→ écris un adaptateur par
type, ne réinvente pas les appels).

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé :
`feat(papa): production coverage page + sidebar grouping`
