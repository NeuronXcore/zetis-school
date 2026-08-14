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
5. **Deck chapitre** `[0049]` — **depuis l'échéance d'agenda, et de nulle part ailleurs**
   (`adr-0049` Décision 1, tranchée le 2026-08-10). Sur une échéance datée portant un
   `chapter_id` servable, la page Agenda de Massimo affiche *« 🃏 Réviser ce chapitre »*,
   qui lance la session du deck `{chapter}` — le runner existant, réutilisé tel quel.
   `chapter_id` est déjà servi par `AgendaItemStudentOut`.

   🔴 **La porte n'existe PAS quand le deck serait vide** : ni bouton grisé, ni bouton qui
   explique — **rien**. Un chapitre sans leçon validée résout zéro notion, donc zéro carte,
   et *« un bouton mort se lit comme une panne »* (`adr-0025` addendum §14.6). La
   **servabilité vient du serveur** ; la surface ne la recompte jamais.

   > ⚠️ Ce n'est pas le cas de l'`adr-0024` §4 (catalogue, indisponible grisé) : là-bas
   > le gris dit *« Papa ne l'a pas encore produit »* sur un écran fait pour être
   > parcouru. Ici la porte vit dans un flux, où le gris ne dirait rien d'actionnable.

   > 🔴 **AMENDÉ le 2026-08-14 `[0057]`** — ce passage disait : *« cette page ne porte AUCUNE
   > entrée vers le deck chapitre »*. L'`adr-0057` §9(1) a rouvert l'option (b) sur deux faits
   > neufs (voir le §Hors périmètre V1 ci-dessous). La page porte désormais une section
   > **« Par chapitre »**, au **troisième rang** — et la porte de l'agenda est **intacte**.

6. **Section « Par chapitre »** `[0057]` — le deck matière se déplie en chapitres, **sur cette
   page**. Étagères matière → chapitre (brique partagée `SubjectChapterShelves`) + champ de
   recherche qui **traverse les matières**.

   🔴 **Le troisième rang est une contrainte, pas une mise en page** : les mélanges restent en
   tête et plus grands, la matière ensuite, les étagères **repliées à l'arrivée**. Aucun chapitre
   n'est atteignable sans avoir déplié sa matière. C'est ce qui **borne** l'objection *blocked
   practice* au lieu de la dissoudre — un test-verrou garde cet ordre, et il a **remplacé** celui
   qui interdisait le mot « chapitre » dans le source de cette page.

   ⚠️ La recherche **déplie** les étagères tant qu'elle est active : un résultat qu'on voit sans
   pouvoir l'atteindre est précisément le défaut que la règle *« emmener »* existe pour empêcher
   (`adr-0057` §9(3)).

   🔴 **Ce qu'affiche une tuile de chapitre est une TAILLE DE SESSION** (`session_size`), jamais
   un stock : un chapitre de 72 cartes servables annonce **8**. L'en-tête de matière, lui, compte
   des **chapitres** — il l'écrit (« 4 chapitres »), parce qu'un « 4 » nu se lirait comme quatre
   cartes sur une page où tous les autres badges en comptent.

   Un chapitre sans carte servable **n'apparaît pas**, et la section entière disparaît quand
   aucun chapitre ne l'est (Histoire-Géo : 0 sur 2, mesuré).

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
REVIEW_SESSION_MAX_CHAPTER = 8    # deck chapitre [0049] — aligné sur le deck matière
REVIEW_SESSION_FLASH       = 5    # Mélange éclair
REVIEW_PERSO_RESERVED      = 2    # places réservées aux cartes de Massimo [0056]
```

- Sélection : cartes dues triées par `due_at` croissant (les plus anciennes
  d'abord), le surplus attend la prochaine session sans être présenté comme un
  retard.
- **Deux places réservées à ses propres cartes** `[0056]`, sur les decks **matière** et
  **chapitre** : jusqu'à `REVIEW_PERSO_RESERVED` cartes `definition_perso` sont servies **en
  tête**, le reste de la session suivant l'ordre habituel.
  - **Ce n'est pas un plafond de plus** : les places se prennent **dans** les 8, jamais en
    plus — une session sert toujours autant de cartes qu'avant.
  - Le quota **réserve au plus, jamais d'office** : sans carte personnelle, les deux places
    **retournent à la file** et la session est exactement celle d'avant.
  - **Pourquoi** : le tri `due_at` croissant sert les plus anciennes, or une définition qu'il
    vient d'écrire est par construction la plus **récente** — mesurées le 2026-08-14, ses sept
    cartes étaient aux **rangs 153 à 159 sur 159** en Français, soit dix-neuf sessions d'attente.
  - ⚠️ **Les mélanges n'y sont pas soumis** : la question n'a pas été arbitrée, et le mélange
    reste le rituel.
- **Deck chapitre** `[0049]` : même tri `due_at` croissant, qui garde son sens sans
  clause d'échéance — les plus en retard d'abord, puis les plus proches de l'être.
  **Pas d'entrelacement** (un chapitre est d'une seule matière). Le plafond n'est pas
  relevé avant un contrôle : il borne **une** session, pas la révision — rien n'empêche
  d'en lancer une seconde, et un mur de 20 cartes serait la pression anxiogène que
  `CLAUDE.md` §gamification interdit.
- **Entrelacement côté serveur** pour les mélanges : jamais deux cartes
  consécutives de la même matière quand c'est possible (un `ORDER BY random()`
  ne suffit pas — l'interleaving est le mécanisme pédagogique du deck mélange).

## XP (serveur uniquement, via `award_xp`)

- **L'XP récompense l'effort, pas le score** : +5 XP par carte revue quel que
  soit le rating (sinon incitation à s'auto-noter « Facile »).
- Re-tour : +2 XP par carte (récompense sans farming).
- **Session chapitre** `[0049]` : **+5 XP, plein** — `reason = "review_chapter"`.
  Les 2 XP du re-tour paient une **répétition peu coûteuse** (trois minutes plus tard),
  pas l'absence de replanification ; une session chapitre demande le **même effort**
  qu'une session normale. Sous-payer précisément la session qu'on veut voir avant un
  contrôle serait une contre-incitation.
- Aucun calcul d'XP côté client ; le mockup ne fait que simuler l'affichage.

## Données API (contrat : `packages/types/src/reviews.ts` à créer)

Routes élève, `get_current_user` (rôle `child` passe) :

- `GET /api/student/reviews/summary` → `{subjects: [{slug, name, due_count}],
  total_due, flash_size}` — compteurs exacts (le « 15+ » est de la
  présentation).
- `GET /api/student/reviews/chapters` `[0057]` → `[{chapter_id, name, subject, subject_slug,
  session_size}]`, toutes matières, dans l'ordre du **programme**. Alimente la section « Par
  chapitre ». Un chapitre à zéro **n'est pas servi** ; `session_size` est une **taille de
  session**, jamais un stock. Listing **séparé** du `summary`, qui est aussi consommé par
  l'Accueil.
- `POST /api/student/reviews/session` body `{deck: "mix_day" | "mix_flash" |
  {subject: slug} | {chapter: id}}` → cartes servies `[{card_id, subject_slug,
  front_markdown, back_markdown}]` — plafond, tri et entrelacement **côté serveur**.
  Le deck **`{chapter}`** `[0049]` sert des cartes **non dues** (c'est son objet) :
  la clause `due_at <= now` tombe, mais `due_at IS NOT NULL` et le filtre de statut
  **restent** — sans eux, les cartes `pending` (générées sans cours validé) seraient
  servies. Portée = notions des **leçons validées** du chapitre.
- `POST /api/student/reviews/cards/{card_id}/attempt` body `{rating, deck?}` →
  `{next_due_at}` + XP crédité. Tracé `SpacedReviewAttempt` dans tous les cas
  (historique Papa), colonne `is_consolidation` **livrée**. Deux mécaniques de
  non-planification, à ne pas confondre :
  - **Re-tour** — **détecté côté serveur** (pas de flag client) : une carte déjà
    notée aujourd'hui ⇒ planification inchangée, **XP réduit (2)**.
  - **Session chapitre** `[0049]` — le client passe `deck: {chapter: id}`, et le
    **serveur revalide** que la carte appartient bien à ce chapitre avant d'en tirer
    l'effet ; un contexte faux est **ignoré en silence**, l'attempt est traité
    normalement. Planification inchangée, **XP plein (5)**, `reason =
    "review_chapter"` — l'effort est le même que celui d'une session normale.
  > ⚠️ **La règle « pas de flag client » n'est pas abandonnée, elle est précisée** :
  > le client déclare un **contexte**, jamais un **effet** ; le serveur revalide le
  > contexte et décide l'effet. Un flag `non_scheduling` piloté par le client aurait
  > pu éteindre la planification **en silence** sur des sessions normales.

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

Statistiques détaillées côté Massimo (→ dashboard Papa) ; cartes cloze/images ;
mode vocal ; réglage des intervalles par Papa.

### Le filtre par chapitre — AMENDÉ le 2026-08-10 `[0049]`

Cette section rangeait le filtre par chapitre en V2, avec cette raison : *« drill-in discret
depuis le deck matière — garder le tap direct comme défaut, **le filtre étroit ramène au
blocked practice** »*.

**L'objection reste vraie et n'est pas effacée.** L'entrelacement (`interleave`, côté serveur)
est le mécanisme pédagogique du deck mélange, pas un détail cosmétique ; réviser étroit à la
place de réviser entrelacé dégraderait la mémoire réelle.

Ce que l'`adr-0049` y répond, et pourquoi la V2 s'ouvre quand même :

1. Le deck chapitre est une session **supplémentaire et non planifiante** — il **s'ajoute** au
   mélange, il ne le remplace pas. Il n'écrit **aucun** état SRS : ni `due_at`, ni
   `interval_days`, ni `last_reviewed_at` (invariant `adr-0025` §11 couplage 2).
2. Il naît d'un **événement daté** (une échéance d'agenda), pas d'une habitude. Un contrôle
   jeudi n'est pas un régime de révision.
3. Le pari est **surveillé, pas supposé** : si l'usage de `mix_day` baisse pendant que celui du
   deck chapitre monte, c'est la cannibalisation, et la réponse sera de **borner le deck dans le
   temps** autour de l'échéance — pas de le retirer. Les deux séries se lisent dans
   `XPEvent.reason` (`review` vs `review_chapter`).

🔴 ~~**Reste hors périmètre, et c'est TRANCHÉ** : le drill-in **permanent** depuis le deck
matière.~~ — **AMENDÉ le 2026-08-14 par l'`adr-0057` §9(1) `[0057]`.**

L'option (b), écartée le 2026-08-10, a été **rouverte quatre jours plus tard**. Ce n'est pas un
revirement : **deux faits ont changé**, et aucun des deux n'était connu quand la Décision 1 a été
prise.

1. **La portée n'avait jamais été jugée.** (b) avait été pesée sur son coût et sur le risque de
   *blocked practice* ; personne ne savait alors qu'une carte écrite par Massimo lui-même se
   rangerait au **rang 153 sur 159** dans la file (`adr-0056`).
2. **Le coût a baissé.** Cette section mettait à la charge de (b) *« un endpoint chapitres
   servables d'une matière que `summary` ne sait pas rendre »* — `chapter_servable_count` **existe**
   depuis le chantier agenda, et le listing n'a fait que l'appeler.

⚠️ **L'objection *blocked practice* n'est pas effacée, et elle ne l'est toujours pas** : elle est
**bornée** par le troisième rang (§Accès point 6). Les mélanges restent le rituel, en haut et plus
grands ; le chapitre se mérite en dépliant sa matière. Le pari reste **surveillé** : si l'usage de
`mix_day` baisse pendant que celui du deck chapitre monte, c'est la cannibalisation — lisible dans
`XPEvent.reason` (`review` vs `review_chapter`), et c'est le **signal n° 2** de l'`adr-0057`.

⚠️ ~~**Conséquence assumée** : ZETIS livre une capacité de révision que la page dédiée à la
révision ne montre pas.~~ — **L'asymétrie est levée** : la page la montre désormais. La porte de
l'agenda reste, et les deux mènent au même deck.
