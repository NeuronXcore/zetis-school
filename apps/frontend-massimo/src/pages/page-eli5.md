# Page Massimo — ELI5 (v2 — entrée par decks matières)

> Refonte 2026-07-05 : la page adopte la même logique d'entrée que Révision et Quiz
> (decks circulaires par matière), et ancre le parcours principal sur les **notions
> validées du référentiel** — c'est le chemin où le contexte canonique (ADR-0011)
> s'active à coup sûr. Mockup validé : `mockup-page-eli5-v2.html`.

## Objectif

ELI5 est un module central. Il doit permettre deux choses :

1. ZETIS explique une notion simplement.
2. Massimo explique à son tour pour vérifier sa compréhension (reverse).

La v2 ne change PAS le moteur (explain/reverse inchangés) : elle change **comment
Massimo arrive à la notion**. Tap sur une chip du référentiel → `skill_id` fourni →
`resolve_canonical_context` trouve le cours validé → badge « 📚 D'après ta leçon ».
Question libre → dégradation gracieuse (RAG seul → connaissance modèle), sans badge.

## Parcours (3 écrans, route `/eli5`)

### Écran 1 — Accueil : decks

```txt
┌──────────────────────────────────────────────────────────┐
│                💡 ELI5 — Explique-moi !                  │
│   Choisis une matière : je t'explique n'importe          │
│   quelle notion, simplement.                             │
│                                                          │
│                    ( ✨ Question libre )                  │
│                     sur n'importe quoi                   │
│                                                          │
│  PAR MATIÈRE                                             │
│  (📖 4) (🧮 6) (🌍 3) (🌿 2)                              │
│  (🇬🇧 2) (🇪🇸 ✨) (⚗️ 3) (⚙️ 1)                             │
└──────────────────────────────────────────────────────────┘
```

- **Deck « Question libre »** en tête, seul sur sa rangée, plus grand, anneau animé
  (respect `prefers-reduced-motion`). Garantit qu'un enfant qui veut juste « demander
  un truc » n'est jamais bloqué par le choix de matière.
- **Grille des 8 matières** : mêmes visuels que Révision (deck circulaire, anneau
  conique teinté par la couleur d'accent de la matière, effet pile de cartes,
  illustration PNG par slug via `import.meta.glob`, repli emoji).
- **Badge compteur** = nombre de notions disponibles (inventaire, pas d'urgence).
- Matière **sans notion validée** : atténuée, sous-texte « bientôt ✨ » — jamais
  grisée-punitive, et **toujours cliquable** (mène à la question libre contextualisée).

### Écran 2 — Notions de la matière

```txt
┌──────────────────────────────────────────────────────────┐
│ ← Matières      🧮 Mathématiques                         │
│                                                          │
│ TAPE UNE NOTION, JE TE L'EXPLIQUE                        │
│ ┌───────────────────────┐ ┌────────────────────┐         │
│ │ Les nombres relatifs  │ │ La règle des signes│  …      │
│ │ Nombres et calculs    │ │ Nombres et calculs │         │
│ └───────────────────────┘ └────────────────────┘         │
│                                                          │
│ OU POSE TA QUESTION                                      │
│ [ Ex. : explique-moi un truc de mathématiques… ] [Expl.] │
└──────────────────────────────────────────────────────────┘
```

- **Chips plates** (pas d'accordéon) : notion en gras + titre du chapitre en
  sous-texte discret — zéro clic supplémentaire, contexte préservé.
- Champ « Ou pose ta question » toujours présent en bas.
- Matière sans notion : les chips laissent place à une carte positive
  (« 🚀 Les notions arrivent bientôt… pose-moi ta question ! »).
- Deck « Question libre » depuis l'écran 1 : même écran, sans section chips.

### Écran 3 — Session ELI5 (existant, inchangé)

Explication (simple / analogie / exemple / mini-question), badge source, boutons
« 🔄 Réexplique autrement » et « 🎤 À toi d'expliquer ! » (reverse écrit / vocal /
mindmap). Différence visible du parcours :

- via chip → `skill_id` transmis → badge « 📚 D'après ta leçon *{lesson_title}* » ;
- via question libre → pas de `skill_id` → badge absent (ou « 📚 D'après ton cours »
  si `sources_used > 0`, comportement étape 13 conservé).

## Deep-link

`/eli5?subject=slug` ouvre directement l'écran 2 (même pattern que
`/revision?subject=slug`, `replace: true`). Permet aux pages Matière dédiée /
Accueil de pointer ELI5 pré-filtré.

## Règles UX (CLAUDE.md — interface enfant)

- Une action principale par écran ; aucun vocabulaire d'atelier (pas de « validé »,
  « brouillon », « skill ») — Massimo voit des « notions », point.
- Filtrage serveur : seules les notions issues du référentiel **validé** de l'année
  active atteignent le client (règle de sécurité, jamais côté client).
- Jamais de framing négatif : une matière vide = « bientôt », pas « manquant ».

## Données API

Nouvelles routes élève (lecture seule, `get_current_user` — le rôle `child` passe) :

- `GET /api/student/notions/summary` → `{subjects: [{slug, name, notion_count}]}` —
  compteurs de l'écran 1. Ne liste que les matières de l'année active.
- `GET /api/student/subjects/{subject_slug}/notions` →
  `{subject: {slug, name}, notions: [{skill_id, name, chapter_title}]}` — notions
  atteignables via chapitres **validés** → leçons **validées** → `LessonSkill`,
  dédupliquées par `skill_id` (chapitre le plus récent en cas de multi-rattachement).
  Route **neutre** (pas `/eli5/…`) : réutilisable par les futurs dérivés
  (mindmaps, fiches).

Routes existantes (inchangées) :

- `POST /ai/eli5/explain` — reçoit désormais `skill_id` quand le parcours passe par
  une chip ; `subject_id` seul (ou rien pour la question libre) sinon.
- `POST /ai/eli5/reverse-evaluate`
- `GET /ai/jobs/{job_id}`

## Composant partagé (extraction)

Le deck-grid matières existe sur Révision et arrive sur ELI5 (Quiz suivra) →
extraction d'un **`SubjectDeckGrid`** dans `frontend-massimo/src/components/`
(style Massimo pur : pas `packages/ui`). Contrat : liste de
`{slug, name, badge?, hint?, dimmed?}` + `onSelect(slug)` + slot deck spécial en
tête. Révision migre dessus dans la même slice, **parité visuelle obligatoire**.

## Hors périmètre v2

Reverse vocal STT réel ; mindmap depuis la session ; XP à l'explication ; historique
des questions ; suggestions de notions « à revoir » (croisement SRS/lacunes —
itération ultérieure prometteuse) ; migration de la page Quiz vers `SubjectDeckGrid`
(elle le consommera à sa création).
