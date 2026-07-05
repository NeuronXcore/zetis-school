# Page Massimo — Missions (parcours mixtes, arbitrage ADR-0017)

## Objectif

Donner à Massimo ses missions du moment : **la** mission du jour (élue par
l'arbitrage déterministe, ADR-0017), les missions croisées multi-matières, et le
reste rangé par matière — dans la logique visuelle des autres pages (icônes de
matière, cadres teintés, verre/néon).

Une mission est un **parcours mixte** (ADR-0017 §5) : jamais une activité unique,
toujours un enchaînement typé (découvrir → verbaliser → mini-quiz, variable selon
le type). La complétion d'une étape exige sa **preuve serveur** (§5) ; la fin de
mission produit un **verdict d'acquisition** découplé de la complétion (§5bis).

Route : `/missions`.

## Règles UX (CLAUDE.md — interface enfant)

- Vocabulaire des pastilles de type (traduction enfant du `mission_type`) :
  `remediation` → **Renforcer** · `revision` → **Réviser** · `progression` →
  **Découvrir** · `manual` → **Mission de Papa**. Jamais de jargon de source.
- **Aucune notion de retard** : pas de compteur, pas d'état « en retard », pas de
  rouge. Les badges compteurs sont teintés couleur matière et comptent les
  missions **disponibles**.
- **Verdict à deux issues, toutes deux positives** : « ✓ Notion bien en place »
  (vert) / « 🌙 On la reverra bientôt » (indigo doux — une promesse, pas un
  échec atténué ; jamais d'orange/warning). L'XP s'affiche dans les deux cas.
- Le CTA de la mission en cours **nomme l'étape courante** (« Continuer :
  Expliquer à ZETIS → »), jamais un « Continuer » générique.
- Étape suivante = « Ensuite », jamais « verrouillée ».
- Icônes de matière : **PNG par slug via `lib/subjectIcons.ts`** (repli emoji) —
  AUCUN mapping emoji local dans le composant (règle « ne pas hardcoder les
  matières dans l'UI »).

## Structure de la page (de haut en bas)

> Le header global vit dans `MassimoLayout` — pas dans cette page.

1. **Mission du jour** (héros) : titre, pastille `reason`, chip matière (icône),
   durée, XP, **frise du parcours** (étapes typées : faite ✓ / courante mise en
   avant / « Ensuite »), CTA nommant l'étape courante.
2. **Missions croisées** (multi-matières) : cartes à cadre **dégradé reliant les
   deux couleurs de matière**, deux chips matière. **Visibles tant que ≤ 3** ;
   au-delà, la section devient un expandeur fermé avec badge compteur (même
   motif que les matières). Leur rareté justifie l'exception de visibilité.
3. **Par matière** : un expandeur natif `<details>`/`<summary>` par matière avec
   missions, **fermé par défaut** (pas d'attribut `open`, pas d'état React) —
   icône matière, nom, **badge compteur teinté**, chevron pivotant
   (`prefers-reduced-motion` respecté). Matières sans mission : ligne simple
   sans expandeur, « ✓ À jour, bravo ! ».
4. **Terminées aujourd'hui** : cartes compactes avec verdict + XP.
5. **Message ZETIS** : court, bienveillant (« Une mission, tranquillement —
   c'est déjà super. »).

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ 🎯 Mes missions                                              │
│ Une mission, c'est un petit parcours.                        │
├──────────────────────────────────────────────────────────────┤
│ ┌ MISSION DU JOUR ─────────────────────────────────────────┐ │
│ │ Renforcer les nombres relatifs                           │ │
│ │ 💡 Parce que cette notion revient bientôt                │ │
│ │ ➗ Mathématiques · ⏱ 15 min · +60 XP                     │ │
│ │  [💡 Découvrir ✓]──[🎙 Verbaliser ◉]──[❓ Mini-quiz ·]   │ │
│ │ [ Continuer : Expliquer à ZETIS → ]                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│ 🔗 MISSIONS CROISÉES (cartes visibles si ≤ 3)                │
│ ┌ 📖 Français × 🌿 SVT — Lire et résumer… · 💡🎙❓ ───────┐  │
│ 📚 PAR MATIÈRE (expandeurs fermés par défaut)                │
│ ▶ 📖 Français                                     (2)        │
│ ▶ ➗ Mathématiques                                (1)        │
│ ▶ 🌍 Histoire-Géo                                 (2)        │
│   🇬🇧 Anglais                          ✓ À jour, bravo !     │
│ ✨ TERMINÉES AUJOURD'HUI                                     │
│ [✓ Notion bien en place] Les fractions…            +60 XP    │
│ [🌙 On la reverra bientôt] L'accord du participe…  +50 XP    │
└──────────────────────────────────────────────────────────────┘
```

## Frise / mini-parcours (étapes typées)

Vocabulaire visuel des `step_type` — le même sur la frise du héros et le
mini-parcours des cartes :

| `step_type`     | Icône | Libellé enfant        | Preuve serveur (§5)                  |
|-----------------|-------|-----------------------|--------------------------------------|
| `lesson`        | 📘    | Lire                  | consultation                          |
| `eli5`          | 💡    | Découvrir             | consultation                          |
| `vocal_explain` | 🎙    | Verbaliser            | score reverse retourné                |
| `quiz`          | ❓    | Mini-quiz             | `QuizAttempt` (`context=mission`)     |

Étape prouvée = pastille verte ✓. Étape courante (héros) = encadrée, lumineuse.

## Données API (contrat : ADR-0017 §3 et §5/§5bis — Lots 1 et 2)

- `GET /api/missions/today` — **nouveau contrat (Lot 2)** :
  `{ elected: MissionOut | null, reason, reason_code, scoring_version,
  alternatives: [MissionOut] }`. `elected: null` → état « Aucune mission ».
- `GET /api/missions` — liste avec étapes (`MissionStudentOut` : **jamais** de
  scores, facteurs ni motifs de génération — frontière de schémas serveur,
  ADR-0017 §3) ; le regroupement par matière est fait côté client (hook), les
  croisées sont les missions à ≥ 2 matières (dérivées des `Skill` des étapes,
  `subject_id` null). Les routes student ne servent que les missions
  **validées** (gate 5ter en requête) — la validation est invisible ici, par
  construction.
- `POST /api/missions/{id}/start` (Lot 1).
- `POST /api/missions/{id}/steps/{step_id}/complete` (Lot 1) — **refusé sans
  preuve** (preuve postérieure au `start`, étapes dans l'ordre `sort_order`) ;
  la dernière étape retourne le verdict :
  `{ mission_status, verdict: "acquired" | "review_later", xp_awarded }`.
- Le bouton « J'ai terminé » global de l'étape 15 **disparaît**.

## États

- **Aucune mission** (`elected: null`) : « Tu n'as rien d'obligatoire
  maintenant. Tu peux choisir une matière ou faire une révision rapide. »
- **Mission en cours** : frise avec étape courante, CTA nommé.
- **Fin de mission** : célébration mini-victoire (brique `@zetis/ui`, son doux,
  `prefers-reduced-motion`), verdict affiché avec l'une des deux formulations.
- **Chargement / erreur** : Spinner partagé ; message + réessayer.

## Implémentation

- Logique dans un hook **`useMissions`** (aucune logique métier dans le
  composant) — même motif que `useMatieres`.
- Expandeurs : `<details>`/`<summary>` **natifs** (zéro JS, clavier/lecteur
  d'écran gratuits, « fermé par défaut » = absence d'`open`). Pas de Radix
  Accordion (report explicite du design system) ; si une animation d'ouverture
  devient nécessaire, ce sera une décision ultérieure.
- Icônes matière : `lib/subjectIcons.ts` exclusivement.
- Thème Massimo (verre/néon, tokens `zetis-*`, primitives glass existantes).
- Mockup de référence : `mockup-page-missions-massimo.html` (validé).

## Hors périmètre V1

- Génération automatique de missions croisées (v1 = croisées **manuelles Papa
  uniquement**, ADR-0017 §6) ; page Papa de pilotage (Lot 3) ; XP par étape
  (l'XP reste à la mission) ; animation d'ouverture des expandeurs ; recherche.

## Voir aussi

- `docs/decisions/adr-0017-arbitrage-missions.md` (sources, scoring versionné,
  preuves, verdict d'acquisition).
- `page-accueil.md` (la carte « Mission du jour » de l'Accueil consomme le même
  `GET /missions/today` — même élue, même raison, jamais deux vérités).
