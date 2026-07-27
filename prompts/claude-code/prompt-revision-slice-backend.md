# Prompt Claude Code — Révision (SRS) · Slice backend `spaced_memory`

> Exécution du chantier Révision (spec `docs/frontend-massimo/page-revision.md`,
> validée 2026-07-04 ; moteur `docs/ai/spaced-memory.md`). Périmètre : **backend
> uniquement** — modèles + migration si manquants, module `spaced_memory`,
> trois endpoints élève, XP, tests. La page Massimo est une slice séparée
> (prompt dédié). **Aucune génération de cartes dans cette slice** : les cartes
> arrivent par un chantier ultérieur (dérivé du cours canonique, ADR-0011) ;
> ici, les tests créent leurs fixtures directement en base.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (règles de tests offline, vocabulaire bienveillant, séparation
   Massimo/Papa) ;
2. `docs/frontend-massimo/page-revision.md` **en entier** — c'est la spécification
   fonctionnelle : plafonds, entrelacement, consolidation, XP, contrat API ;
3. `docs/ai/spaced-memory.md` — ratings et intervalles MVP ;
4. `DATA_MODEL.md`, sections `SpacedReviewCard` et `SpacedReviewAttempt`, puis
   **vérifie si les modèles SQLAlchemy et leurs migrations existent réellement**
   (le prompt 09 historique n'a jamais été exécuté — ne suppose rien) : s'ils
   manquent, crée modèles + migration Alembic conformes à `DATA_MODEL.md` ;
   s'ils existent, signale tout écart avec la doc AVANT de coder ;
5. Le helper `award_xp` (module gamification) : **signature réelle** (session,
   commit côté appelant) — c'est lui qui crédite l'XP, jamais une écriture
   `xp_events` directe ;
6. Les routes élève existantes (`GET /api/student/cours/...`) : le pattern
   `get_current_user` (rôle `child` passe, contrairement aux routes Papa
   `require_parent`) est celui à reproduire ;
7. Un module récent complet (ex. `app/modules/curriculum` ou `gamification`) :
   conventions schemas/service/router à suivre ;
8. `packages/types/src/curriculum.ts` : conventions des types partagés — tu
   créeras `packages/types/src/reviews.ts` sur le même modèle (règle CLAUDE.md).

## Objectif

Massimo pourra ouvrir sa page Révision (slice suivante) : voir ses decks
(compteurs de cartes dues par matière + mélanges), démarrer une session servie
et bornée par le serveur, noter chaque carte (`again | hard | good | easy`),
et être crédité d'XP — avec re-tour de consolidation détecté côté serveur.

## Travail demandé

### 0. Constantes et intervalles

- `app/modules/spaced_memory/` (schemas / service / router), enregistré comme
  les autres modules.
- Constantes de module (jamais côté client) :
  `REVIEW_SESSION_MAX_MIX = 12`, `REVIEW_SESSION_MAX_SUBJECT = 8`,
  `REVIEW_SESSION_FLASH = 5`, `XP_PER_REVIEW = 5`, `XP_PER_CONSOLIDATION = 2`.
- Intervalles MVP (mapping rating → délai) : `again` 1 j, `hard` 3 j, `good`
  7 j, `easy` 14 j. **N'implémente PAS SM-2** : `ease_factor` existe en colonne
  (réserve d'évolution, `docs/ai/spaced-memory.md` §Adaptation) mais n'entre pas
  dans le calcul MVP — laisse sa valeur par défaut intacte.

### 1. Service

- `get_reviews_summary(student)` → cartes dues (statut actif, `due_at <= now`)
  agrégées par matière : `{subjects: [{slug, name, due_count}], total_due,
  flash_size}`. Compteurs exacts (le « 15+ » est de la présentation, slice UI).
- `build_session(student, deck)` avec `deck ∈ {mix_day, mix_flash, subject:slug}` :
  1. sélection des cartes dues, **tri `due_at` croissant** (les plus anciennes
     d'abord), plafond selon le deck ;
  2. pour les mélanges : **entrelacement des matières** — jamais deux cartes
     consécutives de la même matière quand c'est possible. ⚠️ Un
     `ORDER BY random()` ne suffit PAS : écris un helper pur
     `interleave(cards) -> list` (testé unitairement), déterministe à seed fixée
     pour les tests. C'est le mécanisme pédagogique du deck mélange, pas un
     détail cosmétique ;
  3. réponse : cartes `{card_id, subject_slug, front_markdown, back_markdown}` —
     jamais de champs de planification (`interval_days`, `ease_factor`,
     `due_at`) dans le payload élève : la mécanique SRS est invisible.
- `record_attempt(student, card_id, rating)` :
  - carte inexistante ou n'appartenant pas à l'élève → **404** (pas de fuite
    d'existence) ;
  - **détection de consolidation côté serveur, pas de flag client** : si la
    carte a déjà un attempt du même élève **aujourd'hui** (jour civil, timezone
    serveur), l'attempt est une consolidation → `SpacedReviewAttempt` tracé,
    mais `due_at` / `interval_days` / `last_reviewed_at` **inchangés**, XP
    réduit (`XP_PER_CONSOLIDATION`) ;
  - sinon (premier passage du jour) : nouvel intervalle selon le rating,
    `due_at = now + intervalle`, `last_reviewed_at = now`, XP plein
    (`XP_PER_REVIEW`) — **quel que soit le rating** (l'XP récompense l'effort,
    pas le score : aucune incitation à s'auto-noter « Facile ») ;
  - XP via `award_xp` uniquement ;
  - réponse : `{next_due_at, xp_awarded, is_consolidation}`.
- Colonne `is_consolidation` sur `SpacedReviewAttempt` : ajoute-la à la
  migration (booléen, défaut false) — elle rendra le dashboard Papa lisible.
  Si le modèle existe déjà sans elle : migration additive dédiée.

### 2. Endpoints (routes élève, `get_current_user`)

- `GET  /api/student/reviews/summary`
- `POST /api/student/reviews/session` — corps `{deck}` ; 400 si deck inconnu ou
  matière sans carte due ; réponse = liste servie (peut être < plafond).
- `POST /api/student/reviews/cards/{card_id}/attempt` — corps `{rating}` ;
  422/400 si rating hors vocabulaire.
- Schémas de réponse miroirs dans `packages/types/src/reviews.ts` (la slice UI
  en dépend).

### 3. Tests (offline)

- Intervalles : chaque rating → le bon `due_at` (figer `now` par freeze/monkeypatch).
- **Test-verrou payload** : la réponse de `session` ne contient aucun champ de
  planification (`due_at`, `interval_days`, `ease_factor`).
- Plafonds : 20 cartes dues → `mix_day` en sert 12, deck matière 8, éclair 5 ;
  les servies sont bien les 12 plus anciennes (`due_at` asc).
- Entrelacement : helper testé sur un cas où l'alternance parfaite est possible
  (aucune paire adjacente de même matière) ET sur un cas où elle ne l'est pas
  (ex. 5 cartes d'une matière + 1 d'une autre : pas d'exception, résultat
  complet).
- Consolidation : attempt → 2e attempt même carte même jour → `due_at`
  strictement inchangé, `is_consolidation=True`, XP = 2 ; attempt le lendemain
  (now avancé) → replanification normale.
- XP : premier passage crédite 5 **y compris pour `again`** ; total XP vérifié
  via `xp_events`.
- Gardes : carte d'un autre élève → 404 ; rating invalide → 4xx ; deck matière
  sans carte due → 400 propre.
- La suite existante reste verte.

## Hors périmètre strict (ne pas commencer)

- Génération des cartes (chantier dérivés du cours canonique, ADR-0011) — fixtures
  de test uniquement.
- Toute UI (slice suivante) ; intégration mission du jour ; vue Papa.
- SM-2 / adaptation des intervalles ; filtre par chapitre ; plafond d'XP
  quotidien anti-spam (backlog gamification).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : modèles `SpacedReviewCard`/
`Attempt` existants mais divergents de `DATA_MODEL.md` ; `award_xp` avec une
signature différente de l'usage documenté ; pas de champ `status` sur la carte ;
`Skill`→matière non résoluble en une jointure simple (le summary agrège par
matière via `skill_id`). Dans ces cas : propose l'ajustement minimal et attends
validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes · 6. Tests · 7. Points non traités volontairement ·
8. Prochaine étape recommandée · 9. Commit conseillé :
`feat(spaced-memory): SRS engine + student review endpoints (sessions, ratings, XP)`
