# Page Massimo — ELI5

> **Refonte v2 (2026-07-05) — entrée par decks matières.** L'implémentation vit en 3 écrans
> (réf. visuelle `mockup-page-eli5-v2.html`, prompts `prompt-eli5-v2-slice-{a,b}*.md`) ; la
> section « Refonte v2 » ci-dessous prime. La « boucle » décrite plus bas (États 1→4) reste
> valide mais correspond désormais à l'**écran 3 (session)**, inchangé.
> Réf. antérieure : `mockup-eli5-massimo.html`. Style : login/Matières (glassmorphique / néon).

## Refonte v2 — entrée par decks matières

Trois écrans, route `/eli5` inchangée, **moteur ELI5 (explain/reverse, badge) non modifié** :

1. **Decks matières** — grille de disques (composant partagé `SubjectDeckGrid`, extrait de la
   page Révision) alimentée par `GET /api/student/notions/summary` : badge = nombre de notions,
   badge « ✨ new » si des notions ont été fraîchement ajoutées (`new_count`), matière à 0 →
   <!-- ⚠️ Ce `new_count` est un critère de RÉCENCE (leçon porteuse créée dans les 7 jours). Il
   reste ICI, en page, et il n'est PAS le témoin de navigation : celui-ci compte les notions
   jamais expliquées, adossé à `eli5_views` (`adr-0030-temoins-nouveaute-navigation` (Amendement 3), 2026-08-15). Deux
   compteurs, deux objets, aucune fusion. -->
   atténuée « bientôt ✨ » mais toujours cliquable. Deck spécial « ✨ Question libre » en tête.
   En-tête : **emblème animé** (symboles de complexité en orbite autour de l'ampoule 💡 qui fait
   « aha ! ») — décoratif, `motion-safe:` (figé sous `prefers-reduced-motion`).
2. **Notions de la matière** — chips plates via `GET /api/student/subjects/{slug}/notions`
   (notion en gras + `chapter_title` en sous-texte) ; carte positive si liste vide ; champ « pose
   ta question » toujours présent. Deep-link `?subject=slug` ouvre directement cet écran.
3. **Session ELI5** — la boucle existante (voir plus bas), inchangée. Une chip envoie un
   `skill_id` réel → badge « 📚 D'après ta leçon » déterministe ; la question libre est résolue
   côté client (le backend n'accepte que `skill_id`).

Contrats et logique : `lib/notions.ts`, `hooks/useEli5Page.ts`, `components/SubjectDeckGrid.tsx`
(+ `DeckDisc`), `pages/Eli5Page.tsx`. Les chips « à réviser » / « Ta leçon » de l'ancien État 1
sont remplacées par la navigation decks → notions.

## Objectif

ELI5 est un module central. Il doit permettre deux choses :

1. ZETIS explique une notion simplement.
2. Massimo explique à son tour pour vérifier sa compréhension.

C'est la seule page où **Massimo initie** : le champ libre reste l'action
principale. Le fil des leçons n'entre que par suggestion (chips) ou par
deep-link mission — jamais par contrainte.

> **Contrainte de contrat (lue dans le code, prime sur cette spec)** : le backend
> n'accepte que des `skill_id` réels (`explainEli5(skillId)`), pas de texte libre.
> Le champ reste donc librement saisissable (affordance préservée), mais au clic
> « Expliquer » le texte est **résolu côté client** contre les skills réels
> (`fetchSkills()`, match insensible à la casse). Voir État 1 pour le fallback.
> La vraie question libre (résolution serveur par embeddings) est reportée.

## Structure : flow empilé en scroll (« la boucle »)

La page est une conversation qui **grandit vers le bas**. Les sections
apparaissent quand leur état est atteint et **restent montées** ensuite
(accumulation, pas remplacement). Un **rail vertical dégradé indigo→cyan**
relie les phases — signature visuelle de la boucle pédagogique
*comprendre → reformuler*.

```txt
┌──────────────────────────────────────────────────────────────┐
│ [header global — MassimoLayout, hors périmètre]              │
│                                                              │
│ Comprendre avec ELI5                                         │
│                                                              │
│ ÉTAT 1 — Quelle notion veux-tu comprendre ?                  │
│ [ Les nombres relatifs                        ] [Expliquer]  │
│ (chips) 📖 Ta leçon · à renforcer · à renforcer              │
│                                                              │
│ │  ÉTAT 2 — 🧠 ZETIS explique          [📚 D'après ton cours]│
│ │  explication · analogie · exemple · mini-question          │
│ │  [🔄 Je réexplique autrement]                              │
│ │                                                            │
│ │  ÉTAT 3 — 🎙️ À toi d'expliquer                             │
│ │  [textarea]                                                │
│ │  [🎤 Parler ·bientôt] [🗺️ Mindmap ·bientôt] [Envoyer]      │
│ │                                                            │
│ │  ÉTAT 4 — ✨ Le retour de ZETIS                            │
│ │  anneau 72 % compris · maîtrisé / à ajouter · mini-mission │
│                                                              │
│              (⚡ +10 XP · toast sticky)                       │
└──────────────────────────────────────────────────────────────┘
```

## Machine à états (`useEli5`)

Toute la logique vit dans le hook — aucune logique métier dans les composants.

```txt
idle → generating → explained → evaluating → feedback
```

- `idle` : champ + chips seuls.
- `generating` : onde ZETIS « ZETIS prépare ton explication… » à la place de la
  future carte (dans le rail, pas de spinner plein écran). Polling
  `GET /ai/jobs/{job_id}` jusqu'à `succeeded`.
- `explained` : carte explication (remplace l'onde, même position).
- `evaluating` : onde à la place du futur feedback.
- `feedback` : carte retour + toast XP.
- **Nouvelle question depuis le champ = reset propre** : retour à `generating`,
  sections précédentes démontées. Pas d'historique multi-notions (ce serait du
  chat, hors périmètre ; les traces vivent en base).

## Auto-scroll

- À chaque nouvelle section : `scrollIntoView({ behavior:'smooth', block:'start' })`.
- `prefers-reduced-motion` → scroll instantané.
- **Jamais** d'auto-scroll pendant que Massimo tape dans le textarea.

## États et contenus

### État 1 — Question (action principale unique)

- Champ texte libre + bouton **Expliquer** (dégradé indigo, seul bouton plein).
- **Résolution du champ au clic** (côté client, quelques lignes) : le texte est
  matché contre les noms de skills réels de `fetchSkills()`.
  - match trouvé → on envoie le `skill_id` réel, `explain` part vraiment ;
  - aucun match → état vide bienveillant « Cette notion n'est pas encore dans
    ton programme — choisis une suggestion ci-dessous », chips mises en avant.
    Jamais de requête backend impossible, jamais d'échec silencieux.
  - Ce match est volontairement simple ; il sera remplacé par la résolution
    serveur (embeddings) sans changer la forme du champ (cf. Reporté).
- **Chips de suggestion** (3-4 max, suggestion jamais injonction) — sources :
  - 1ʳᵉ chip « 📖 Ta leçon : … » (leçon en cours) : **seule chip mockée**, repli
    typé isolé dans `useEli5` + `TODO(api): endpoint leçon courante — ADR-0009/0010` ;
  - chips suivantes « **à réviser** » : **réelles**, dérivées de `fetchDueReviews()`
    (skills dus à révision → `skill_id` réels → chips fonctionnelles). Libellé
    « à réviser » (source SRS) et non « à renforcer » (réservé aux `gaps`, sémantique
    différente, non câblé ici).
  - Chip cliquée = question pré-remplie **+ `skill_id` connu** (traces propres).
- Deep-link : `/eli5?skill={id}` (étape mission « expliquer ») pré-remplit et lance.

### État 2 — ZETIS explique

- Carte verre : titre notion, **badge de source à deux variantes** (contrat
  ELI5 v2 / ADR-0011, vert émeraude) :
  - `lesson_title` présent → « 📚 D'après ta leçon *{lesson_title}* »
    (cours canonique validé utilisé) ;
  - sinon `sources_used > 0` → « 📚 D'après ton cours » (chunks RAG seuls) ;
  - sinon aucun badge.
- Blocs teintés : **explication** (prose), **analogie** (cyan),
  **exemple** (fuchsia), **mini-question** (indigo).
- Bouton fantôme **« 🔄 Je réexplique autrement »** → relance `explain`.

### État 3 — À toi d'expliquer

- Consigne : « Explique … avec tes mots, comme si tu l'apprenais à quelqu'un. »
- Textarea (focus cyan) + bouton plein **« Envoyer à ZETIS »**.
- Boutons **« 🎤 Parler »** et **« 🗺️ Mindmap »** grisés, badge « bientôt »
  (fuchsia). Backend n'accepte que `input_mode: "text"` — Phase 9 pour le vocal.

### État 4 — Le retour de ZETIS

Vocabulaire **bienveillant obligatoire** (mapping UI ≠ contrat API) :

| Contrat API | Affichage Massimo |
|---|---|
| `score` | anneau « X % **compris** » (réutiliser `ProgressRing`, pas de conic-gradient maison) |
| points justes | colonne verte « **Ce que tu maîtrises** » (✓) |
| `missing_points` | colonne ambre « **À ajouter à ton explication** » (→) |
| `next_action` | encart « 🎯 **Mini-mission** » + bouton « C'est parti » |

Interdits : « échec », « manquant », « lacune », framing négatif.
La colonne verte passe **avant** l'ambre.

- Bouton « C'est parti » de la mini-mission : **non-navigant en V1**
  (`TODO`: deep-link mission quand la boucle mission↔ELI5 sera câblée). Ne pas
  inventer de route.
- **Toast XP** sticky bas : « ⚡ +10 XP · Tu as expliqué avec tes mots ». Valeur
  affichée **en dur** (le crédit réel est fait côté serveur au reverse ; le toast
  est un retour visuel). Commenter le couplage dans le code :
  `// miroir du crédit serveur ELI5-reverse (+10) : garder synchro`.

## Design

- Tokens/primitives existants : verre, halos indigo/cyan/fuchsia (`glass.tsx`),
  `@zetis/ui` (Button/Card/Badge/Spinner/EmptyState), thème Massimo indigo.
  **Aucun CSS dupliqué** hors effets dédiés éventuels.
- Une action principale par état ; boutons secondaires en fantôme.
- Animations CSS sobres ; **`prefers-reduced-motion` respecté partout**
  (onde, toast, hover, scroll).
- Aucun son en V1 (TTS = Phase 9, jamais d'autoplay).
- Responsive : colonnes feedback empilées < 620 px ; cible iPhone.

## Données API (Lot B pur frontend, zéro backend)

> **Prérequis de séquence** : le chantier « substrat + ELI5 v2 » (ADR-0011,
> prompt 16) doit être **mergé avant** cette refonte — c'est lui qui livre
> `lesson_id`/`lesson_title` et le badge à deux variantes.

- `POST /ai/eli5/explain` → `{ job_id, status }`
- `GET /ai/jobs/{job_id}` → `output` (dont `sources_used`, `lesson_id?`,
  `lesson_title?` — champs ELI5 v2)
- `POST /ai/eli5/reverse-evaluate` → `{ score, feedback, missing_points, next_action }`
- Aucune donnée pédagogique durable stockée côté front.

## Reporté

- **Surface de révision dédiée** (liste complète SRS, planning) → future page
  **Révision**. La liste `dueReviews` autonome quitte la page ELI5 (page-conversation
  pure), mais `fetchDueReviews()` **reste appelée** ici pour alimenter les chips
  « à réviser » — aucune capacité perdue, responsabilité déplacée.
- **Résolution serveur de la question libre** (embeddings `nomic-embed-text` →
  `skill_id`) : remplacera le match client de l'État 1 sans changer la forme du champ.
- Chip « Ta leçon » réelle (endpoint leçon courante, post-référentiel ADR-0009/0010).
- Chips « à renforcer » depuis les `gaps` (distinct de « à réviser »/SRS).
- STT Whisper local + TTS provider (Phase 9 ; ADR STT requis, addendum TTS).
- Deep-link de sortie « C'est parti » → mission (boucle mission↔ELI5).
- Mode mindmap du reverse.
- Historique multi-notions / chat.
