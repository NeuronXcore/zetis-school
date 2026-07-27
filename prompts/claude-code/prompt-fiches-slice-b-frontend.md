# Prompt Claude Code — Fiches de révision · Slice B frontend (ADR-0015)

> Exécution de l'ADR-0015 (acceptée), **après** la Slice A backend. Périmètre : **frontend
> uniquement** — (0) **extraction des briques Papa partagées**, (1) viewer Massimo 3 écrans,
> (2) pilotage Papa. Maquette de référence : `mockup-page-fiches.html`. Spec :
> `docs/frontend-massimo/page-fiches.md`. **Étape à numéroter (≠ 19/20 réservées `zetis-clip`).**

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (frontière Massimo verre sombre / Papa émeraude — **jamais mélanger** ;
   **aucune logique métier côté client** ; prompts jamais dans les composants) ;
2. `docs/frontend-massimo/page-fiches.md` (**spec de page = contrat visuel**, wireframe ASCII
   inclus) + `docs/decisions/adr-0015-fiches-revision.md` §4-5. *(Si le mockup
   `mockup-page-fiches.html` est committé — p. ex. `docs/frontend-massimo/mockups/` — lis-le
   aussi : il porte le style verre/néon que l'ASCII ne capture pas ; sinon la spec fait foi.)* ;
3. **`design-system.md` → « Conventions UI partagées »** : pictogrammes (`subjectIcons.ts`,
   `src/assets/subjects/`, repli emoji), badges (compteur + « Nouveau »), **cycle de vie Papa**
   (quatuor + `ConfirmDialog` + `GenerationProgress`) ;
4. La **page de pilotage capsules réelle** (`frontend-papa/.../capsules…`) : c'est la **source
   du patron** générer/régénérer/éditer/supprimer + barres de progression + célébration. Tu vas
   l'**extraire** (tâche 0) — repère précisément ce qui est réutilisable tel quel et ce qui est
   spécifique capsule. Si le patron est trop couplé au domaine capsule pour être extrait
   proprement : ARRÊTE-TOI, signale, propose la découpe minimale ;
5. `SubjectDeckGrid` réel (`frontend-massimo/src/components/…`) et `lib/subjectIcons.ts` :
   props exactes, ne suppose pas leur forme ;
6. `@zetis/ui` : inventaire des briques existantes (badges, `ProgressRing`, un éventuel
   `ConfirmDialog`, briques de célébration). N'en recrée aucune qui existe déjà ;
7. `packages/types/src/fiche.ts` (issu de la Slice A) et les routes livrées en Slice A
   (`/api/fiches/*`, `/api/student/…/fiches`, `/seen`) — c'est le contrat que la UI consomme.

## Objectif

Massimo lit ses fiches (deck par matière → liste → fiche imprimable), Papa les génère/valide.
Les briques Papa deviennent **partagées** (`@zetis/ui`) et capsules est refactoré pour les
utiliser — mindmaps les réutilisera sans effort.

## Travail demandé

### 0. Extraction des briques partagées (`@zetis/ui`) — pré-requis

- `ContentLifecycleActions` : les 4 actions **Générer · Régénérer · Éditer · Supprimer** ;
  **Régénérer** et **Supprimer** déclenchent un `ConfirmDialog` (libellé explicite) ; prop
  `status` (`pending|validated|rejected`).
- `GenerationProgress` : `variant="bar" | "ring"`, `value` (%), `label`. Réutilise
  `ProgressRing` pour la variante cercle.
- `ConfirmDialog` : si absent de `@zetis/ui`, crée-le ; s'il existe, réutilise-le.
- **Refactor capsules** : la page de pilotage capsules passe sur ces briques **sans régression**
  (mêmes libellés, même célébration). C'est la preuve de réutilisation (discipline
  `SubjectDeckGrid`).

### 1. Viewer Massimo (`frontend-massimo`) — 3 écrans (verre sombre)

- **Écran 1 — decks** : `SubjectDeckGrid` (partagé). **Badge compteur** = nb de fiches
  validées ; **badge « Nouveau »** si une fiche jamais ouverte (brique de badge existante).
  Matière sans fiche → deck grisé « bientôt ».
- **Écran 2 — liste** : une tuile par leçon (bordure = couleur matière) ; leçon sans fiche →
  « bientôt disponible » (jamais « manquant »).
- **Écran 3 — la fiche** : `FicheCard` + `FicheSection`, rendu du `FicheSpec` (sections
  ⭐ / 📖 / 🔑 / ⚠️ / 💡, bandeau d'identité) ; pied avec badge canonique
  **« 📚 D'après ton cours »** ; **impression** via CSS `@media print` + `window.print()`.
  Feuilletage ‹/› optionnel (aligne-toi sur la maquette).
- Consomme les routes student ; appelle `POST /seen` à l'ouverture (retrait « Nouveau »).
- **Aucune logique métier client** : pas de calcul de validation/XP ; le front n'affiche que
  ce que le serveur renvoie (déjà filtré `validated`).

### 2. Pilotage Papa (`frontend-papa`) — page « Fiches » (émeraude)

- Liste des leçons par matière ; **génération par leçon** (bouton) → `GenerationProgress`
  (barre) → célébration à la réussite.
- Par fiche : `<ContentLifecycleActions>` (régénérer/éditer/supprimer + confirmations) ;
  édition = modale du `spec_json` (revalide → `pending`) ; bouton **Valider**
  (`pending → validated`).
- Aucune redéfinition des actions : réutilise strictement les briques de la tâche 0.

### 3. Pont SRS (présent mais non câblé)

- Bouton **« 🃏 Ajouter à mes cartes »** sur la fiche : présent, **désactivé** ou pointant vers
  un stub, avec un `TODO` clair renvoyant au chantier SRS. **Ne pas** implémenter la génération
  de cartes ici.

## Hors périmètre strict (ne pas commencer)

- Toute modification backend (Slice A livrée) ; nouvelles routes.
- Génération de cartes SRS (chantier SRS).
- Mindmaps (feature suivante, mêmes briques réutilisées).
- Polish cinématique (Lot B visuel, différé).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : patron capsules trop couplé pour extraire les
briques proprement ; `ConfirmDialog` absent **et** conventions de modale divergentes ; props de
`SubjectDeckGrid` incompatibles avec un badge compteur + « Nouveau » ; routes de la Slice A
différentes de ce que la spec annonce. Dans ces cas : propose l'ajustement minimal et attends
validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé :
`feat(fiches): shared Papa bricks + Massimo viewer + Papa authoring (frontend)`
