# Prompt Claude Code — Missions · Slice frontend Massimo (ADR-0017)

> Exécution frontend de l'ADR-0017 côté élève, **après merge des Lots 1 et 2
> backend** (routes réelles = contrat). Périmètre : **frontend-massimo
> uniquement**. Spec : `docs/frontend-massimo/page-missions.md` (contrat
> visuel). Maquette : `mockup-page-missions-massimo.html`.
> **Étape à numéroter** au SUIVI.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne
de code :

1. `CLAUDE.md` (frontière Massimo/Papa ; vocabulaire enfant ; zéro logique
   métier front) ;
2. `docs/decisions/adr-0017-arbitrage-missions.md` **en entier** (version
   fusionnée : preuves, verdict par template, mission à 2 étapes, mindmap) ;
3. `docs/frontend-massimo/page-missions.md` — **la spec est le contrat** :
   structure, vocabulaire des pastilles, table des `step_type`, états ;
4. **Les routes réelles mergées** (Lots 1+2) : `GET /missions/today` (contrat
   `{elected, reason, reason_code, scoring_version, alternatives}`),
   `GET /missions`, `POST /missions/{id}/start`,
   `POST /missions/{id}/steps/{step_id}/complete` (réponse de la dernière
   étape : `{mission_status, verdict, xp_awarded}` ; **409 = preuve
   manquante**). Le schéma `MissionStudentOut` réel fait foi — si un champ de
   la spec n'y est pas, STOP et signale ;
5. `lib/subjectIcons.ts` (icônes matière — AUCUN mapping emoji local) et les
   primitives `@zetis/ui` (glass, badges, Spinner, EmptyState, brique de
   mini-victoire) ;
6. Les routes des activités cibles pour les deep-links : session ELI5
   (`skill_id`), runner quiz, mindmap mode `student_reconstruction`,
   `/revision` — **telles qu'elles existent**, pas telles que tu les supposes.

## Objectif

Massimo ouvre `/missions` : la mission du jour élue (héros avec frise du
parcours et CTA nommant l'étape courante), les croisées visibles (≤ 3), le
reste par matière en expandeurs fermés, les terminées du jour avec leur
verdict à deux issues positives. Chaque étape est un **deep-link** vers le
module réel ; la complétion est **prouvée serveur**, jamais déclarée.

## Travail demandé

### 1. Hook `useMissions` (`frontend-massimo/src/hooks/`)

- Fetch `/missions/today` + `/missions` ; regroupement par matière côté
  client ; croisées = missions à ≥ 2 matières. Mutations `start` et
  `completeStep`. **Aucune logique métier** (pas de calcul de verdict, pas de
  choix d'étape — le serveur décide tout).

### 2. Le héros « Mission du jour »

- `elected` + pastille `reason` (texte servi, jamais recomposé) ; frise des
  étapes typées (💡 🎙 ❓ 🗺 📘 — table de la spec) : prouvée ✓ / courante mise
  en avant / « Ensuite ». **Une mission à 2 étapes s'affiche telle quelle**,
  sans mention du manque.
- CTA = **nom de l'étape courante** (« Continuer : Expliquer à ZETIS → ») ;
  tap → `start` si `planned`, puis **deep-link** vers l'activité de l'étape.
- `elected: null` → état serein de la spec, aucune mission de remplissage.

### 3. Orchestration étape → activité → complétion

- Deep-link vers le module cible ; **au retour** sur la page missions,
  appelle `completeStep` pour l'étape courante :
  - succès → frise mise à jour ;
  - **409 (preuve manquante)** → message doux, jamais un échec : « Termine
    d'abord le mini-quiz, puis reviens ✨ » — c'est le serveur qui garde, le
    front traduit gentiment ;
  - dernière étape → réponse verdict.
- N'implémente **aucun** marquage local d'étape « faite » (pas de state
  optimiste sur les preuves).

### 4. Fin de mission

- Mini-victoire (brique partagée, son doux, `prefers-reduced-motion`) puis le
  verdict, deux formulations positives exactes de la spec :
  « ✓ Notion bien en place » / « 🌙 On la reverra bientôt, tranquille » —
  XP affiché dans les deux cas. Aucune différence de célébration entre les
  deux verdicts.

### 5. Croisées, matières, terminées

- Croisées : cartes à cadre dégradé deux couleurs, **visibles si ≤ 3**,
  section en expandeur fermé avec badge au-delà.
- Par matière : `<details>/<summary>` natifs **fermés par défaut** (aucun
  attribut `open`, aucun state React), icône via `subjectIcons.ts`, badge
  compteur teinté (missions **disponibles** — le mot « retard » n'existe
  pas) ; matière sans mission → ligne « ✓ À jour, bravo ! » sans chevron.
- Terminées aujourd'hui : cartes compactes verdict + XP.

## Interdits (rappels durs)

- Aucun champ analytique : si un score, un facteur ou un seuil apparaît dans
  une réponse student, STOP et signale (fuite de schéma — bug backend).
- Aucun vocabulaire de source (`remediation`…) à l'écran : pastilles enfant
  de la spec uniquement.
- Aucun rouge, aucun « en retard », aucun compteur d'échec.

## Hors périmètre strict (ne pas commencer)

Page pilotage Papa (slice sœur, `page-missions-pilotage.md`) ; porte
« Commander » (ADR-0018) ; migration éventuelle des expandeurs vers
`SubjectDeckGrid` (décision non prise — implémente la spec telle quelle) ;
polish cinématique (Lot B).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : contrat `/missions/today`
différent de la spec ; `MissionStudentOut` sans le champ steps attendu ;
routes de deep-link des activités introuvables ou signées autrement ; brique
de mini-victoire absente de `@zetis/ui`.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes · 6. Tests · 7. Points non traités volontairement ·
8. Prochaine étape recommandée · 9. Commit conseillé :
`feat(missions): student missions page — elected hero, proof-based parcours, verdicts (frontend)`
