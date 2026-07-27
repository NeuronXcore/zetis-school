# Page Massimo — Révision (spaced repetition)

## Objectif

Donner à Massimo un rituel de révision quotidien : des **decks circulaires** (par
matière + mélanges) alimentés par le moteur SRS (module `memory`). Un deck est une
**file dynamique** : le compteur affiché = nombre de cartes dont le `due_at` est
dépassé, il varie chaque jour selon les ratings passés. La page est un *runner de
session*, pas une page de gestion : un tap → je révise.

Route : `/revision` — entrée sidebar « Révision » + raccourci « Révision » de
l'accueil (même destination).

Réf. moteur : `docs/ai/spaced-memory.md` (ratings, intervalles).
Réf. mockup validé : `mockup-page-revision-v3.html` (2026-07-04).

> **Note (2026-07-05)** : la grille « Par matière » est désormais rendue par le composant
> partagé `components/SubjectDeckGrid.tsx` (enveloppe `DeckDisc`), extrait pour l'entrée ELI5 v2
> et réutilisé ici **sans changement visuel**. Les **Mélanges** restent locaux à cette page
> (structure hero + collage propre à Révision).

## Accès & navigation

Quatre points d'entrée, tous vers `/revision` :

1. **Sidebar** : entrée « Révision », placée après « Cours » (flux : j'apprends
   → j'ancre). Icône = l'illustration de marque `SRS-cards.png` (même patron que
   ELI5 ; `lucide-react` absent du workspace, l'emoji 🗂️ était le repli initial).
2. **Accueil** : le raccourci « Révision — N cartes » (`page-accueil.md`).
3. **Page matière dédiée** : bouton « Réviser (N cartes) » en **deep link**
   `/revision?subject={slug}` → lance directement la session du deck matière,
   sans écran intermédiaire (une action par écran : Massimo a déjà choisi sa
   matière).
4. **Missions** : une étape de type révision ouvre `/revision` (ou le deep
   link matière si la mission est ciblée).

Routing interne — deux routes :

```txt
/revision           → écran des decks (mélanges + matières)
/revision/session   → session en cours (deck via l'état du routeur)
```

Le bouton retour (physique sur mobile) doit ramener de la session vers l'écran
des decks, jamais hors de la page — d'où la sous-route. Accès direct ou refresh
sur `/revision/session` sans deck en mémoire ⇒ redirection vers `/revision`
(sans perte : les attempts sont POSTés au fil de l'eau).

## Règles UX (CLAUDE.md — interface enfant)

- Style verre Massimo (GlassPanel / NeonBackdrop, tokens `zetis-*`), une action
  principale par écran.
- **La mécanique SRS est invisible** : jamais d'intervalles (« 1 j / 7 j »),
  d'ease factor ni de notion de retard. Une carte due depuis 5 jours est
  simplement « à revoir », jamais « en retard ».
- **Aucun rouge, aucun vocabulaire d'échec.** Ratings affichés : 🔄 À revoir ·
  🤔 Difficile · 🙂 Bien · ⚡ Facile (mapping code inchangé :
  `again | hard | good | easy`). `again` = ambre doux.
- **Toutes les matières sont affichées** dans « Par matière » (3 états, `has_cards` +
  `due_count` du summary) :
  - cartes dues → deck lançable (badge compteur) ;
  - cartes présentes mais rien dû → deck atténué + « à jour ✓ » (positif, jamais grisé
    comme un manque) ;
  - **aucune carte encore générée** (`has_cards=false`) → deck **grisé** affichant l'**emoji**
    de la matière, badge « à venir » + « pas encore de cartes », non lançable.
  État zéro global (rien dû nulle part) : « Tout est frais dans ta mémoire ! 🎉 » +
  suggestion douce (cours, capsule), pas de CTA de révision.
- Quitter en cours de session ne perd rien : chaque rating est POSTé au fil de
  l'eau, sans confirmation de sortie.
- Sons (design system, toujours mutables) : `réussite` au palier haut,
  `XP gain` à chaque popup de fin.
- `prefers-reduced-motion` respecté (flip, confettis, jauge).

## Écran 1 — Accueil des decks

```txt
┌──────────────────────────────────────────────────────────┐
│                       Révision                           │
│  MÉLANGES ────────────────────────────────────────────── │
│   (🔀 collage 4 matières)      (🔀 collage 4 matières)    │
│   Mélange du jour [11]         Mélange éclair [5]        │
│   toutes les matières          5 cartes rapides          │
│  PAR MATIÈRE (toutes les matières) ─────────────────────── │
│   (🖼️ Français)[9] (🖼️ Maths)[15+] (🖼️ SVT)[12]          │
│   (🌍 H-Géo · à venir) (🇬🇧 Anglais · à venir) …grisées    │
└──────────────────────────────────────────────────────────┘
```

- Decks circulaires : **simple cercle** avec l'illustration de la matière (assets
  `*_256.png`) ou son **emoji** (matières sans carte) — pas d'effet pile ni d'anneau
  coloré, badge compteur en surimpression.
- **Bannière « SRS · Révision espacée »** en tête (composant `SpacedMemoryHero`) :
  illustration `SRS-cards.png` animée (flip + étincelles) + courbe SVG de mémoire qui
  monte à chaque révision espacée (1j→3j→7j→14j) — motive Massimo en illustrant simplement
  le concept, sans exposer d'échéance réelle. Animations en `motion-safe:`.
- **Hiérarchie = recommandation** : mélanges en haut et plus grands
  (interleaving par défaut), matières en dessous (ciblage ponctuel).
- Badge plafonné à l'affichage : « 15+ » au-delà de 15.

## Écran 2 — Session (flip card)

```txt
│ ← Quitter        (🖼️ deck)  Nom du deck        ● ● ○ ○ ○ │
│        ┌ RECTO : matière + question ┐                    │
│        └ [ Révéler la réponse ] ────┘                    │
│  flip 3D → VERSO + ratings (délai ~250 ms anti-réflexe) :│
│   [🔄 À revoir] [🤔 Difficile] [🙂 Bien] [⚡ Facile]      │
```

- Le flip est le geste signature : Massimo doit *décider* de révéler
  (retrieval practice — la tentative de rappel précède la réponse).
- Recto/verso color-codés (apparence distincte) : **recto bleu** (pastille « ❓ Question »),
  **verso émeraude** (pastille « ✅ Réponse » — positif, jamais de rouge d'échec). La couleur
  bascule au flip.
- Rating → la carte sort, la suivante entre. Points de progression discrets.

## Écran 3 — Popup de fin de session (3 paliers)

Palier sur `pct = bien ancrées (good+easy) / total`, jauge animée (jamais rouge) :

| Palier | Seuil | Contenu |
|---|---|---|
| 🎉 Haut | ≥ 80 % | « Incroyable ! » + confettis + [Continuer] |
| 🌟 Moyen | 50–79 % | « Bien joué ! Les autres reviendront au bon moment » + [Terminer] |
| 💪 Bas | < 50 % | « C'était costaud » + **[🔄 Refaire un tour (N cartes)]** + [Plus tard, elles reviendront] |

Wording clé du palier bas : la difficulté est attribuée à la **nouveauté de la
notion** (« encore un peu timides — c'est normal, elles sont nouvelles »),
jamais à Massimo ; refuser = déléguer au système, pas abandonner.

### Re-tour (consolidation immédiate)

- Porte uniquement sur les cartes notées `again`/`hard` du passage (file
  `fragile`), ré-entrelacées.
- **Proposé une seule fois par session** (anti-acharnement) : après le re-tour,
  même score bas → « Bel effort ! Elles reviendront très vite ».
- **Sans effet sur la planification SRS** : le `due_at` reste celui fixé par le
  rating du premier passage. Le re-tour est un exercice de consolidation, pas
  une révision espacée (un « Bien » à 3 min d'un « À revoir » n'enverrait pas
  honnêtement la carte à 7 jours).

## Plafonds de session (constantes backend, jamais côté client)

```txt
REVIEW_SESSION_MAX_MIX     = 12   # Mélange du jour
REVIEW_SESSION_MAX_SUBJECT = 8    # deck matière
REVIEW_SESSION_FLASH       = 5    # Mélange éclair
```

- Sélection : cartes dues triées par `due_at` croissant (les plus anciennes
  d'abord), le surplus attend la prochaine session sans être présenté comme un
  retard.
- **Entrelacement côté serveur** pour les mélanges : jamais deux cartes
  consécutives de la même matière quand c'est possible (un `ORDER BY random()`
  ne suffit pas — l'interleaving est le mécanisme pédagogique du deck mélange).

## XP (serveur uniquement, via `award_xp`)

- **L'XP récompense l'effort, pas le score** : +5 XP par carte revue quel que
  soit le rating (sinon incitation à s'auto-noter « Facile »).
- Re-tour : +2 XP par carte (récompense sans farming).
- Aucun calcul d'XP côté client ; le mockup ne fait que simuler l'affichage.

## Données API (contrat : `packages/types/src/reviews.ts` à créer)

Routes élève, `get_current_user` (rôle `child` passe) :

- `GET /api/student/reviews/summary` → `{subjects: [{slug, name, due_count}],
  total_due, flash_size}` — compteurs exacts (le « 15+ » est de la
  présentation).
- `POST /api/student/reviews/session` body `{deck: "mix_day" | "mix_flash" |
  {subject: slug}}` → cartes servies `[{card_id, subject_slug, front_markdown,
  back_markdown}]` — plafond, tri et entrelacement **côté serveur**.
- `POST /api/student/reviews/cards/{card_id}/attempt` body `{rating}` →
  `{next_due_at}` + XP crédité. **Détection du re-tour côté serveur** (pas de
  flag client) : une carte déjà notée aujourd'hui ⇒ attempt de consolidation
  (planification inchangée, XP réduit). Tracé `SpacedReviewAttempt` dans les
  deux cas (historique Papa) — flag `is_consolidation` optionnel (petite
  migration) pour la lisibilité du dashboard.

Modèles : `SpacedReviewCard` / `SpacedReviewAttempt` existants (`DATA_MODEL.md`).

## Prérequis

- Backend révision (module `memory`) : **FAIT 2026-07-04** — moteur d'intervalles,
  plafonds + entrelacement serveur, consolidation + XP, endpoints élève
  `GET /api/student/reviews/summary`, `POST /api/student/reviews/session`,
  `POST /api/student/reviews/cards/{card_id}/attempt` (contrat
  `packages/types/src/reviews.ts`).
- Génération des cartes (1 à 3 par skill via `card_type`, à la validation d'une
  notion, relues par Papa) : **chantier séparé**, hors périmètre de cette page.

## Hors périmètre V1

Filtre par chapitre (V2 : drill-in discret depuis le deck matière — garder le
tap direct comme défaut, le filtre étroit ramène au blocked practice) ;
statistiques détaillées côté Massimo (→ dashboard Papa) ; cartes cloze/images ;
mode vocal ; réglage des intervalles par Papa.
