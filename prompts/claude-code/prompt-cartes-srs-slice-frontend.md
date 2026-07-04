# Prompt Claude Code — Cartes SRS · Slice frontend Papa « Cartes de révision »

> Deuxième slice de l'ADR-0012. **Prérequis : la slice backend est livrée et
> mergée** (endpoints `/api/memory/cards/*`, `reviews.ts` étendu avec les types
> Papa). Travaille uniquement dans `apps/frontend-papa` (+ extraction validée
> éventuelle vers `@zetis/ui`). **Frontend pur** : aucun endpoint, schéma ou
> migration créé/modifié. Aucune modification du frontend Massimo ni de la page
> Programme.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md`.
2. `docs/decisions/adr-0012-generation-cartes-srs.md` §1 (page = surface, question
   distincte de Programme, génération par matière) et §4 (aperçu = contrôle qualité).
3. **La maquette validée `mockup-papa-cartes-srs.html`** (fournie) — référence
   visuelle exacte : thème émeraude Papa, KPI, arbre matière → chapitre → leçon →
   notion, états de notion (à jour / à générer / échec / suspendue), bouton
   « Générer les N » par matière, aperçu recto/verso, section suspendues actionnable.
   Transpose en React/Tailwind avec les tokens Papa — ne recopie pas le CSS brut.
4. **`packages/types/src/reviews.ts`** (étendu par la slice backend) : le **contrat**.
   Importe les types Papa, n'en redéclare aucun. Note les formes exactes avant
   d'écrire le hook.
5. **Une page Papa existante branchée** (ex. page Programme, ou la page
   skills-backfill) : patron d'appel API, structure de header, thème émeraude.
6. **La page Programme** spécifiquement : réutilise le composant de progression
   (`useEstimatedProgress` / `ProgressBar`), le style des chips de notions, et la
   **condition d'affichage** du bouton « Proposer des leçons » (patron pour
   « Générer les N » : n'apparaît que si `to_generate > 0`).
7. `packages/ui` : `Button`, `Card`, `Badge`, `Modal`/`ConfirmDialog`, `Spinner`,
   `EmptyState`. Thème Papa émeraude.

Si une primitive générique manque (`ConfirmDialog`, chip…) : **STOP**, propose son
extraction vers `@zetis/ui`, attends validation — pas de variante locale.

## Objectif

Une page « Cartes de révision » (sidebar Papa) où Papa voit l'état des cartes SRS de
Massimo par notion et les génère depuis les cours validés, par matière — avec aperçu
recto/verso et réconciliation visible des notions suspendues. La page **consomme**
les leçons validées, elle ne les édite jamais (corriger un cours = page Programme).

## À implémenter

### 1. Navigation

- Entrée sidebar Papa « Cartes de révision », icône Lucide (`Layers` — cohérent
  avec l'entrée Massimo). Route `/cartes-revision` (ou la convention de nommage
  réelle des routes Papa — vérifie).

### 2. Structure (hook `useSrsCards`, logique hors composants)

- Au montage : `GET /api/memory/cards/overview` → KPI (notions couvertes, cartes
  actives, à générer, suspendues) + résumé par matière (accordéons repliés).
- Dépliage d'une matière : `GET /api/memory/cards/subjects/{id}` **à la demande**
  (jamais tout au chargement) → arbre chapitre → leçon → notion avec `state` et
  `card_count`, + notions suspendues. Cache par matière, invalidé après mutation.

### 3. Génération par matière

- Bouton **« Générer les N »** dans l'en-tête de chaque matière, visible **seulement
  si `to_generate > 0`** (fonction pure testée, patron « Proposer des leçons »).
- Clic → `stopPropagation` (ne pas toggler l'accordéon), ouvre la matière si repliée,
  `POST /api/memory/cards/subjects/{id}/generate`, progression visible (barre par
  matière ou par notion, pattern capsule). Re-fetch de la matière à la réponse.
- Génération unitaire d'une notion (« générer » / « relancer ») :
  `POST /api/memory/cards/skills/{skill_id}/generate`.
- **Régénérer** une notion à jour : même endpoint ; l'UI doit refléter que le contenu
  change **sans** que les compteurs de planification changent (cf. §3 branche A de
  l'ADR — ne pas afficher de « +N cartes » sur une régénération).

### 4. Aperçu recto/verso (le contrôle qualité — §4 de l'ADR)

- Bouton « voir » sur une notion à jour → `GET /api/memory/cards/skills/{id}/cards`
  **à la demande**, dépliage inline recto/verso avec le `card_type` (comme la
  maquette). Re-clic → replie. C'est ce qui remplace une file de validation : Papa
  relit, et régénère s'il n'aime pas.

### 5. Section suspendues (branche C visible)

- Par matière, un groupe « Suspendue » listant les notions orphelines, avec la
  mention que la planification est conservée. Deux actions par notion :
  - **Réactiver** → `POST /api/memory/cards/skills/{id}/reactivate`.
  - **Retirer** → `ConfirmDialog` (« supprime la carte ET son historique ») →
    `DELETE /api/memory/cards/skills/{id}`. Seule action destructive de la page.

### 6. États & vocabulaire

- Chargement (`Spinner`), vide (`EmptyState` : « aucune leçon validée — commence par
  valider des cours dans Programme »), erreur (message + réessayer ; 503/502 →
  `detail` backend verbatim).
- Vocabulaire **Papa analytique** (pas l'interface enfant) : « échec de génération »,
  « suspendue » sont acceptables ici — c'est un outil de pilotage. Mais **jamais de
  rouge** (cohérence de marque) : échec en ambre, suspendu en ardoise, actif en
  émeraude.

## Contraintes

- Logique dans `useSrsCards` ; composants de présentation purs (props typées depuis
  `@zetis/types`). Thème Papa émeraude, `@zetis/ui`, zéro CSS dupliqué.
- Chargement paresseux systématique (overview léger → détail matière à la demande →
  contenu des cartes à la demande). Jamais de fetch global du contenu.
- Aucune persistance client entre sessions ; l'état vit dans le hook.

## Tests (Vitest)

- Hook : `to_generate > 0` pilote l'affichage du bouton « Générer les N » (fonction
  pure) ; cache matière invalidé après génération ; aperçu chargé à la demande.
- Rendu : bouton absent sur matière à jour ; `stopPropagation` (générer ne toggle pas
  l'accordéon) ; section suspendues rendue ; `ConfirmDialog` avant `DELETE` ; états
  vide/erreur.
- La suite existante reste verte ; `tsc` et build `frontend-papa` OK.

## Hors périmètre strict

- Backend (endpoints, schémas, migrations). Frontend Massimo. Page Programme.
- Édition du contenu d'une carte à la main (V1 : régénérer, pas éditer).
- Auto-génération, mission du jour, statistiques de rétention.

## Si tu es bloqué

Écarts probables : formes `reviews.ts` (types Papa) différentes de la maquette ;
`ConfirmDialog` absent de `@zetis/ui` ; composant de progression couplé à son
contexte d'origine (→ extraire plutôt que dupliquer) ; convention de route Papa
différente. Dans ces cas : signale, propose l'ajustement minimal, attends validation.

## À la fin, réponds avec la checklist standard (9 points)

Commit conseillé :
`feat(papa): SRS cards page — per-subject generation, recto/verso preview, orphan reconciliation`
