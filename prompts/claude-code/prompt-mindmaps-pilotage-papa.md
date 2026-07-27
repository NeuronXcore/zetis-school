# Prompt Claude Code — Mindmaps · Pilotage Papa (addendum ADR-0016)

> Exécution de l'**addendum ADR-0016 du 2026-07-27**, **après** les Slices A et B mindmaps.
> Périmètre : **extraction du canvas en brique partagée**, **un endpoint d'évaluation sans
> effet de bord** + un agrégat sur la route de pilotage, **modale d'aperçu Papa 4 onglets**
> (Regarde · Mémorise · Reconstruis · Éditer). Spec : `docs/frontend-papa/page-mindmaps-pilotage.md`.
> **Aucune dépendance nouvelle** : `@xyflow/react` et `elkjs` sont **déplacés**, pas ajoutés.
> **Étape à numéroter (≠ 19/20 réservées `zetis-clip`).**

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (frontière Massimo/Papa ; **aucune logique métier côté client** ;
   read-before-write ; stop-on-blocker) ;
2. `docs/decisions/adr-0016-mindmaps-rendu-layout.md` **en entier, addendum du 2026-07-27
   compris** (§A extraction, §B modale, §C `evaluate-preview`, §D éditeur outline, §E cycle de
   vie et historique) ;
3. `docs/frontend-papa/page-mindmaps-pilotage.md` (**spec de page = contrat visuel** :
   wireframes, 4 onglets, avertissements, états limites) ;
4. **Le code mindmaps réel côté Massimo** : `MindmapCanvas`, `lib/mindmapLayout.ts`,
   `ModeSegmented`, `LayoutSelector`, `NodeBank`, les nœuds custom — **relève leurs props
   exactes et leurs fetchs internes**, c'est ce que tu vas devoir découpler ;
5. `TROUBLESHOOTING.md` → section **« Chantier `mindmap` (ADR-0016) »** : cinq pièges React Flow
   déjà payés (`borderRadius: 10` et pas 18 ; clics routés par `onNodeClick` ; **un seul** handle
   source + un cible ; **un seul** effet `setRfNodes` sous peine de strip des `measured` ;
   `useMemo` sur `currentChunk`). **Ne les réintroduis pas** en déplaçant le code ;
6. `packages/ui` : `ContentLifecycleActions`, `ContentStatusBadge`, `GenerationProgress`,
   `ConfirmDialog`, `useCelebrate` — **réutilise, ne recrée pas** ;
7. La **page de pilotage fiches réelle** (`frontend-papa`, arbre matière→leçons→fiches +
   `FicheEditorModal`) : c'est le patron de la page et de l'éditeur structuré ;
8. Le module backend `app/modules/mindmaps/` : **la fonction d'évaluation existante** (celle
   qu'appelle `/evaluate`) et la route `pilotage` des fiches, à mirrorer.

## Objectif

Papa voit la carte **exactement comme Massimo la verra**, dans les trois modes, sur une carte
`pending` ; il corrige via un éditeur structuré ; il valide, régénère ou supprime en connaissance
de cause. **Un seul renderer pour les deux interfaces.**

## Travail demandé

### 0. Extraction de la brique canvas dans `@zetis/ui` — pré-requis

- Déplace `MindmapCanvas`, `mindmapLayout.ts` (`toElk` / `toReactFlow` / `defaultLayout`),
  `ModeSegmented`, `LayoutSelector`, `NodeBank` et les nœuds custom dans `packages/ui`.
- Déplace `@xyflow/react` et `elkjs` de `frontend-massimo` vers `packages/ui` — **versions
  épinglées identiques** (pas de `^`, cf. `adr-0007`).
- **Contrat d'extraction** :
  - **zéro fetch dans la brique** — `mindmap_json` descend **en prop** ;
  - **zéro logique métier** — le score n'est jamais calculé côté client ;
  - l'évaluation de *Reconstruis* passe par une prop **`evaluator`** injectée
    (`(placed) => Promise<EvaluationResult>`), pas par un appel en dur.
- **Massimo ré-importe la brique** : `/mindmaps` et `/mindmaps/:slug` inchangés
  fonctionnellement. Les écrans decks/liste et le `POST /seen` **restent** côté Massimo.
- **Non-régression à prouver** : `tsc -b` + `vite build` verts, tests Massimo existants verts,
  et vérification manuelle des 3 modes + 4 présentations. **Commit dédié** avant de continuer.

### 1. Backend — évaluation d'aperçu + agrégat de pilotage

- **`POST /api/mindmaps/{id}/evaluate-preview`**, garde `require_parent` : **réutilise la
  fonction pure d'évaluation existante** (extrais-la si elle est aujourd'hui enchevêtrée dans le
  handler `/evaluate`) et **ne persiste rien** — aucun `mindmap_attempts`, aucun `xp_events`,
  aucun `learning_events`. Un seul barème, deux appelants.
- **`GET /api/mindmaps/pilotage/{subject_id}`** : ajoute par carte `attempt_count` et
  `avg_score` (agrégat `mindmap_attempts`, **une requête**, pas de N+1). Miroir de la route de
  pilotage des fiches.
- `ON DELETE CASCADE` sur `mindmap_attempts.mindmap_id` si ce n'est pas déjà le cas (migration
  dédiée). **L'XP n'est jamais rembobiné** — ne touche ni `xp_events` ni `learning_events` à la
  suppression ou à la régénération.
- Types de réponse dans `packages/types/src/mindmap.ts`.

### 2. Page Papa `/mindmaps` (émeraude)

- Arbre **matière → leçons → mindmaps** (pills matières + recherche), patron fiches.
- Leçon sans carte → `⚡ Générer` + `GenerationProgress` + célébration ; **génération
  indisponible si le cours est `draft`** (mention « cours non validé »).
- Par carte : `ContentLifecycleActions` + `ContentStatusBadge` + `✓ Valider` si `pending` +
  métrique « reconstruite N fois · moyenne X % ».
- `ConfirmDialog` de Régénérer/Supprimer : **signal avant destruction** (libellé exact dans la
  spec — historique supprimé, XP acquis conservé).

### 3. Modale d'aperçu — 4 onglets

- `min(1400px, 95vw) × 90vh`, `Échap` ferme, l'arbre garde son état.
- En-tête Papa + bandeau **« Aperçu — rien n'est enregistré pour Massimo »**.
- Corps = **hublot** rendant la brique **avec le style Massimo** (verre sombre/néon),
  visuellement encadré. Données depuis `GET /api/mindmaps/{id}` (sert le `pending`).
- Onglets **Regarde / Mémorise / Reconstruis** = la brique partagée, `evaluator` = client de
  `evaluate-preview`. Bouton **↺ Réinitialiser**.
- Pied : `ContentLifecycleActions` + `✓ Valider`, mêmes briques qu'en liste.
- **`import()` paresseux** de la brique (React Flow + elk ne chargent que sur ouverture).

### 4. Onglet Éditer — outline + canvas re-layouté

- Outline à gauche (`⇥`/`⇧⇥` re-parenter, `⏎` frère, `⌫` supprimer, toggle ★ requis /
  ☆ optionnel → `required_nodes`/`optional_nodes`), canvas **lecture seule** à droite,
  re-layouté à chaque modification (**debounce**).
- Garde d'intégrité client avant `PUT` : `parent` référence un `id` existant, une seule racine,
  pas de branche vide.
- Avertissement **si la carte était `validated`** : « Cette carte est visible par Massimo. La
  modifier la retirera de sa liste jusqu'à validation. »
- **Pas de drag-to-reparent sur le canvas** (collision avec le drag de *Reconstruis*).
- Enregistrer → `PUT /api/mindmaps/{id}` → `pending`.

### 5. Tests

- Backend : `evaluate-preview` **ne persiste rien** (test-verrou : compte `mindmap_attempts` et
  `xp_events` inchangés) ; même score que `/evaluate` sur la même entrée ; 403 pour un `child` ;
  agrégat `attempt_count`/`avg_score` correct ; cascade à la suppression ; **XP intact** après
  suppression et après régénération.
- Frontend : non-régression Massimo (tests existants) ; la modale rend une carte `pending` ;
  l'éditeur refuse un arbre incohérent ; l'avertissement n'apparaît que sur `validated`.

## Hors périmètre strict (ne pas commencer)

- Écrans decks/liste de Massimo ; génération de mindmaps par Massimo.
- Statut `rejected` ; drag-to-reparent ; liens transverses (graphe) ; persistance de la
  préférence de layout par élève.
- Toute nouvelle dépendance. Polish cinématique.

## Si tu es bloqué

Signale **AVANT de coder** : `MindmapCanvas` trop couplé au fetch ou au routeur Massimo pour
être extrait proprement (propose la découpe minimale) ; logique d'évaluation non isolable en
fonction pure côté backend ; `mindmap_attempts` sans FK exploitable pour l'agrégat ; route
`pilotage` mindmaps absente (les fiches en ont une, pas forcément les mindmaps) ; conventions de
modale de `frontend-papa` incompatibles avec une modale 90vh.

**Stop-on-blocker** : si la tâche 0 ne peut pas être livrée sans régression Massimo, arrête-toi
là et rends l'état — le reste en dépend.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé :
`feat(mindmaps): shared canvas brick + Papa fidelity preview and editorial lifecycle`
