# Prompt Claude Code — Page Papa « Années scolaires » réconciliée (ADR-0009 §4/§9)

> Exécution de l'ADR-0009 (acceptée) — pas de nouvelle décision architecturale.
> Périmètre : frontend Papa + le CRUD backend `school-years` s'il manque (c'est la
> seule étape où une extension backend en écriture est autorisée : ce CRUD EST la
> feature, déjà spécifié par `API_SPEC.md` et le Lot E de `FRONTEND_ROADMAP.md`).

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (règles frontend : hooks dédiés, types partagés, pas de logique
   métier dans les composants) ;
2. `docs/frontend-papa/page-annees-scolaires.md` — **version réécrite du 2026-07-03**
   (elle remplace l'ancienne : plus de modes, plus d'Importer/Générer, plus de
   `ai-generate-plan`). C'est la spécification de cette étape, elle fait foi sur ce
   prompt en cas d'ambiguïté visuelle ;
3. `docs/decisions/adr-0009-referentiel-programme-scolaire.md` §4 (mode déprécié),
   §5 (résolution niveau → cycle + version) et §9 (séparation Années scolaires /
   Programme) ;
4. **Le contrat réel** : le modèle SQLAlchemy `SchoolYear` (ne suppose jamais sa
   forme, lis-le — `mode` existe mais est déprécié : jamais lu, jamais exposé) ;
   les routers backend existants pour vérifier si un CRUD `school-years` ou une
   lecture de l'année active existent déjà (le module curriculum en utilise
   peut-être une pour les pills de matières) ;
5. La page Programme livrée à l'étape 14 (`ProgrammePage` + son hook) — c'est le
   patron d'architecture exact : hook typé via `@zetis/auth`, composants courts,
   états Loading/Error/Empty, fonction pure pour la logique d'état ;
6. Le thème Papa et les composants `packages/ui` (Button/Card/Badge/Spinner/
   EmptyState — étendre au fil de l'eau, jamais dupliquer du Tailwind brut).

## Objectif

La page « Années scolaires » du frontend Papa, conforme à la spec réécrite :
carte année active (dates, résolution programme, chips matières en lecture seule,
lien « Voir le programme → », édition inline), historique des années, création
d'une année. Aucun sélecteur de mode nulle part.

## Travail demandé

### 1. Vérification de contrat (AVANT le code UI)

Confronte la spec § Données API aux routers réels :

- Si le CRUD `school-years` (GET liste / POST / PATCH) n'existe pas : crée-le
  (garde rôle parent/admin partout, schémas dans `packages/types`, un test par
  endpoint). Règles métier serveur, testées :
  - **une seule année `active`** : activer une année passe l'ancienne active en
    `archived`, dans la même transaction ;
  - **`level` immuable** : le PATCH rejette toute modification du niveau (422) ;
  - **pas de DELETE** : aucune route de suppression (les FK pédagogiques en
    dépendent) ;
  - `mode` n'apparaît dans **aucun** schéma de réponse ni de requête.
- Pour les chips de matières : réutilise la lecture existante du module curriculum
  (subjects × année active). Ne duplique rien ; si le chemin diffère de la spec,
  signale-le.
- Toute autre divergence (modèle `SchoolYear` réel vs `DATA_MODEL.md`, endpoint
  déjà présent sous un autre chemin, page Années scolaires mockée déjà présente
  dans le frontend) : ARRÊTE-TOI et signale avant de coder.

### 2. Hook + page

- `useSchoolYears` (suivant la convention des hooks existants) : appels API typés,
  états loading/error, invalidation après mutation.
- `AnneesScolairesPage` dans `apps/frontend-papa` + entrée de navigation sidebar
  (remplace l'ancienne page/entrée si elle existe — ne laisse pas deux routes).
- Composants courts, un fichier chacun : carte année active, ligne d'historique,
  formulaire de création, chips matières. La logique « quel badge / quelles actions
  pour quel statut » vit dans une petite fonction pure testable, pas dans le JSX.
- Le lien « Voir le programme → » pointe vers la route réelle de la page Programme
  (lis le router frontend, ne devine pas).

### 3. Résolution programme (affichage)

La ligne « Programme : cycle 4 · version <N> » est **informative** : dérive-la du
`level` de l'année (5e/4e/3e → cycle 4) et de la version portée par les chapitres
générés si disponible, sinon omets la version. Aucun paramétrage utilisateur.

### 4. Tests

- Backend : unicité de l'année active (activation archive l'ancienne), immutabilité
  du niveau, absence de route DELETE, absence de `mode` dans les schémas.
- Frontend : suivant la convention existante du repo (si les pages livrées n'ont
  pas de tests UI, n'en introduis pas ici — cohérence d'abord).

## Hors périmètre strict (ne pas commencer)

- Copie inter-années à la création (ADR-0009 Lot 3).
- Métriques / bilan d'année ; gestion des `SchoolYearSubject` (ajout/retrait).
- Suppression de la colonne `school_years.mode` (première migration touchant la table
  — pas de migration dans cette étape).
- Renommage « Check-up » du diagnostic côté Massimo (micro-lot ultérieur).
- Ancrage RAG + `LearningObjective` (Lot 2 restant du référentiel).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : modèle `SchoolYear` divergent de
`DATA_MODEL.md` ; CRUD déjà partiellement présent ; page frontend existante avec
données mockées à réconcilier plutôt qu'à créer. Dans ces cas : propose l'ajustement
minimal et attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes · 6. Tests · 7. Points non traités volontairement ·
8. Prochaine étape recommandée · 9. Commit conseillé :
`feat(school-years): reconciled school years page (temporal frame, single active year)`
