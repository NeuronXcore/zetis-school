# Page Papa — Pilotage Mindmaps

> Spec issue de l'**addendum ADR-0016 du 2026-07-27** (aperçu fidèle, brique de canvas
> partagée, évaluation d'aperçu, cycle de vie éditorial). **IMPLÉMENTÉE le 2026-07-27** — le
> canvas a été extrait dans `@zetis/ui/mindmap` et cette page en est le second consommateur.
> Contrat d'API : `packages/types/src/mindmap.ts` = source de vérité.
>
> **Trois écarts entre cette spec et le livré, assumés :**
> 1. **Pas de migration `ON DELETE CASCADE`** — `delete_mindmap` purgeait déjà les tentatives
>    avant la carte ; la contrainte demandée était redondante. Le comportement décrit au §
>    « Cycle de vie et historique » est bien celui du code.
> 2. **L'éditeur outline réutilise `MindmapEditorModal`**, qui était déjà structuré (la spec
>    supposait une édition du `mindmap_json` brut à remplacer). Il a été extrait en
>    `MindmapOutlineEditor` et monté aux deux endroits ; les raccourcis clavier sont ajoutés
>    par-dessus, le sélecteur de parent `<select>` est conservé (souris + lecteurs d'écran).
> 3. **Pastille « à relire » non livrée** (§ États limites) : elle exigerait de persister les
>    ouvertures de Papa, ce qu'aucune table ne fait aujourd'hui. Différée.

## Objectif

Papa **génère, prévisualise dans les trois modes, corrige, valide, régénère et supprime** les
cartes mentales. Rien n'atteint Massimo avant `validated`.

Principe directeur : **valider une carte mentale sans la voir revient à valider un JSON.** La
lisibilité de la disposition, la faisabilité du mode *Mémorise* et la difficulté du mode
*Reconstruis* ne s'inspectent pas dans un arbre textuel — d'où l'aperçu de fidélité.

## Un seul statut

`validation_status` : `pending` → `validated`. (`rejected` existe dans le modèle mais **n'est
pas câblé** : *Valider* et *Supprimer* couvrent le besoin réel.)

Contrairement aux capsules, **pas de second cycle de rendu** : une carte validée est
immédiatement disponible pour Massimo.

## Structure de la page

Arbre **matière → leçons → mindmap**, miroir exact du pilotage des fiches et des quiz
(`GET /api/mindmaps/pilotage/{subject_id}`). Une leçon porte **au plus une** carte.

```txt
┌──────────────────────────────────────────────────────────────────────────────┐
│ Mindmaps                                          [🔍 rechercher une leçon]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ( SVT )  ( Maths )  ( Français )  ( Histoire )  …          ← pills matières   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▾ Ch. 3 — Nutrition des plantes                                              │
│   ├ La nutrition végétale        ● validée   14 nœuds · 4 branches           │
│   │                              🧠 reconstruite 3 fois · moyenne 78 %        │
│   │                              [👁 Aperçu]  [⟳] [✎] [🗑]                    │
│   ├ Les échanges gazeux          ○ en attente 11 nœuds · 3 branches          │
│   │                              [👁 Aperçu]  [⟳] [✎] [🗑]      [✓ Valider]  │
│   └ La photosynthèse             — aucune carte                              │
│                                                            [⚡ Générer]       │
│ ▸ Ch. 4 — Respiration                                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Leçon **sans carte** → action `⚡ Générer` (barre `GenerationProgress` + célébration à la
  réussite, briques `@zetis/ui` partagées).
- Leçon **avec carte** → `ContentLifecycleActions` (⟳ Régénérer · ✎ Éditer · 🗑 Supprimer,
  confirmations incluses) + `✓ Valider` si `pending`.
- **Métrique de reconstruction** affichée sous chaque carte validée déjà travaillée :
  « reconstruite N fois · moyenne X % » (lu depuis `mindmap_attempts`). **Strictement
  côté Papa** — rien de cet agrégat ne remonte chez Massimo.
- Leçon non validée (cours en `draft`) → génération indisponible, mention « cours non validé »
  (le dérivé exige le cours canonique, ADR-0011).

## Modale d'aperçu

Ouverte par `👁 Aperçu`. **Quasi plein écran** (`min(1400px, 95vw) × 90vh`) : Papa juge sans
quitter l'arbre (scroll et nœuds dépliés préservés). `Échap` ferme.

```txt
┌─ Nutrition végétale · SVT — Ch. 3 ──────────── ○ en attente ─────────── ✕ ─┐
│ ⓘ Aperçu — rien n'est enregistré pour Massimo                             │
├───────────────────────────────────────────────────────────────────────────┤
│  [ Regarde ] [ Mémorise ] [ Reconstruis ] [ Éditer ]   Présentation: ⌄ H  │
│ ┌───────────────────── ce que voit Massimo ─────────────────────────────┐ │
│ │                                                                       │ │
│ │        ┌──────────┐      ┌──────────────┐                             │ │
│ │        │   Eau    │──────│  Nutrition   │────┐                        │ │
│ │        └──────────┘      │   végétale   │    │   ┌──────────┐         │ │
│ │                          └──────────────┘    └───│ Lumière  │         │ │
│ │                                                  └──────────┘         │ │
│ │                                        [⊙ recentrer]  [− zoom +]      │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────────────────┤
│ [⟳ Régénérer]  [🗑 Supprimer]                        [✓ Valider]          │
└───────────────────────────────────────────────────────────────────────────┘
```

- **En-tête** : chrome Papa (émeraude) — leçon, matière, chapitre, `ContentStatusBadge`,
  bandeau **« Aperçu — rien n'est enregistré pour Massimo »**.
- **Corps** : **hublot** rendant la brique partagée **à l'identique du frontend Massimo**
  (verre sombre / néon), encadré comme un écran dans l'écran. C'est une **exception cadrée** à
  la séparation visuelle, justifiée par la fidélité (même précédent que le Player capsules).
- **`ModeSegmented` et `LayoutSelector` sont les composants partagés réels** — libellés et
  présentations ne peuvent pas diverger de ce que voit Massimo. Défaut = `defaultLayout(mm)`.
- **Pied** : mêmes briques qu'en ligne de liste, deux points de montage, un seul composant.

### Onglet **Regarde**

Carte complète, pan / zoom / recentrer, plier-déplier une branche. Papa vérifie la lisibilité
dans les 4 présentations (Radial · Horizontal · Vertical · Équilibrée).

### Onglet **Mémorise**

Feuilles masquées (`· · ·`), révélation au clic, compteur « n / total ». Papa vérifie que le
masquage (`required_nodes` / `optional_nodes`) tombe sur les bons nœuds — c'est **le** réglage
qui rend le mode utile ou trivial.

### Onglet **Reconstruis**

Banque d'étiquettes mélangées → placement → **Vérifier**. L'évaluation part au serveur via
**`POST /api/mindmaps/{id}/evaluate-preview`** (`require_parent`) : même barème, **aucune
persistance, aucun XP**. Le score et le détail juste/faux s'affichent normalement, précédés du
rappel d'aperçu. Bouton **↺ Réinitialiser** (replace les étiquettes, remasque les révélations).

### Onglet **Éditer**

**Outline à gauche, canvas en lecture seule à droite**, re-layouté à chaque modification
(debounce ; elk est déjà asynchrone).

```txt
┌─ Éditer ──────────────────────────────────────────────────────────────────┐
│ Nutrition végétale                    │                                    │
│  ▸ Eau                        [★][🗑] │        ┌──────────────┐            │
│    · absorbée par les racines [☆][🗑] │   ┌────│  Nutrition   │────┐       │
│    · sève brute               [☆][🗑] │   │    │   végétale   │    │       │
│  ▸ Lumière                    [★][🗑] │  Eau   └──────────────┘  Lumière   │
│    · captée par les feuilles  [☆][🗑] │                                    │
│  + ajouter une branche                │   ← se réagence à chaque frappe    │
│                                       │                                    │
│ ⇥ / ⇧⇥ déplacer · ⏎ frère · ⌫ supprimer   ★ requis · ☆ optionnel          │
├───────────────────────────────────────────────────────────────────────────┤
│ ⚠ Cette carte est visible par Massimo. La modifier la retirera de sa       │
│   liste jusqu'à validation.                                               │
│                                        [ Annuler ]  [ Enregistrer ]       │
└───────────────────────────────────────────────────────────────────────────┘
```

- Édition **structurée**, jamais le `mindmap_json` brut (même correction que
  `FicheEditorModal` vs `spec_json`).
- **Pas de drag-to-reparent sur le canvas** : `mindmap_json` ne porte aucune position, et un
  drop sur un nœud entrerait en collision avec le drag du mode *Reconstruis*. Follow-up si le
  besoin se confirme.
- Garde d'intégrité côté client avant `PUT` : un `parent` référence toujours un `id` existant ;
  une seule racine ; pas de branche vide.
- Enregistrer → `PUT /api/mindmaps/{id}` → **revalidation → `pending`**. L'avertissement
  n'apparaît que si la carte était `validated`.

## Cycle de vie et historique

1. **Éditer une carte `validated` la retire de la liste de Massimo** jusqu'à re-validation.
   Annoncé **avant** l'enregistrement (bandeau ci-dessus).
2. **Supprimer supprime les tentatives** (`mindmap_attempts`, `ON DELETE CASCADE`) : un score
   n'a pas de sens sans l'arbre qui l'a produit.
3. **L'XP déjà crédité n'est jamais rembobiné** — le décrémenter ferait régresser le niveau de
   Massimo sur une action de Papa.
4. **Régénérer ne recalcule aucun score passé** : les anciennes tentatives sont conservées
   telles quelles, non comparables au nouvel arbre.

Les `ConfirmDialog` de **Régénérer** et **Supprimer** affichent le signal avant destruction :

```txt
┌──────────────────────────────────────────────────────────────┐
│ Supprimer cette carte mentale ?                              │
│                                                              │
│ Massimo l'a reconstruite 3 fois (moyenne 78 %).              │
│ Son historique de reconstruction sera supprimé avec elle.    │
│ L'XP qu'il a gagné lui reste acquis.                         │
│                                                              │
│                        [ Annuler ]  [ Supprimer ]            │
└──────────────────────────────────────────────────────────────┘
```

## Endpoints (Papa, `require_parent`)

- `POST /api/mindmaps/generate` — `{ lesson_id }` → `pending`
- `GET /api/mindmaps/pilotage/{subject_id}` — arbre matière → leçons → mindmaps (+ agrégat
  tentatives : `attempt_count`, `avg_score`)
- `GET /api/mindmaps/{id}` — la carte, **`pending` comprise** (alimente l'aperçu)
- `PUT /api/mindmaps/{id}` — `{ mindmap_json }`, revalidé → `pending`
- `POST /api/mindmaps/{id}/regenerate`
- `POST /api/mindmaps/{id}/validate`
- `POST /api/mindmaps/{id}/evaluate-preview` — **nouveau** : même barème que `/evaluate`,
  **sans persistance ni XP**
- `DELETE /api/mindmaps/{id}`

## États limites

- **Layout elk en cours** (asynchrone) → état de chargement dans le hublot, pas de canvas vide.
- **Graphe dégénéré** (1 nœud, branche unique, profondeur ≥ 3) : l'aperçu doit tenir ; c'est
  précisément ce que Papa doit pouvoir constater avant de valider.
- **Génération échouée** → message backend verbatim, aucune carte persistée (garantie Slice A).
- **Carte `pending` jamais ouverte par Papa** → pastille discrète « à relire » dans la liste.
- **Aucune leçon validée dans la matière** → état vide « aucun cours validé pour l'instant »,
  pas d'action de génération.

## Hors périmètre

- Écrans decks / liste de Massimo (parcours élève, inchangés).
- Génération de mindmaps par Massimo ; liens transverses (graphe) ; persistance de la
  préférence de layout par élève — tous différés.
- Statut `rejected` ; drag-to-reparent sur le canvas.
