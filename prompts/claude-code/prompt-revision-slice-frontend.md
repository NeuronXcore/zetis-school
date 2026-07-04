# Prompt Claude Code — Révision (SRS) · Slice frontend Massimo (frontend pur)

> Deuxième slice du chantier Révision. **Prérequis : la slice backend (module
> `memory`) est livrée et ses tests verts** (endpoints
> `GET /api/student/reviews/summary`, `POST /api/student/reviews/session`,
> `POST /api/student/reviews/cards/{id}/attempt`). Travaille uniquement dans
> `apps/frontend-massimo` (+ extraction validée éventuelle vers `@zetis/ui`).
> **Frontend pur** : aucun endpoint, schéma ou migration créé ou modifié.
> Aucune modification du frontend Papa.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `docs/frontend-massimo/page-revision.md` **en entier** — spec validée, source
   de vérité UX : accès/navigation, 3 écrans, paliers, re-tour, vocabulaire.
2. Le mockup validé `mockup-page-revision-v3.html` (fourni par Papa) — référence
   visuelle exacte : decks circulaires (effet pile + anneau conique + badge),
   collage des mélanges, flip 3D, ratings, popups 3 paliers, jauge, confettis.
   Transpose en React/Tailwind avec les tokens `zetis-*` — ne recopie pas le CSS
   brut du mockup si une primitive existante fait déjà le travail.
3. `packages/types/src/reviews.ts` — le **contrat** livré par la slice backend :
   ne redéclare aucun type, importe-les. Note les formes exactes avant d'écrire
   le hook.
4. `apps/frontend-massimo` : `MassimoLayout`, `MassimoSidebar` (structure réelle
   des entrées), les primitives `glass` (GlassPanel/halos extraits du login),
   une page déjà branchée (ex. `ProgressionPage`) pour le pattern d'appel API.
5. `README.md` du frontend Massimo : position sidebar (« Révision » après
   « Cours », icône Lucide) et noms de composants actés (`DeckDisc`, `FlipCard`,
   `SessionEndPopup`).
6. `CLAUDE.md` (interface enfant : non-anxiogène, une action par écran).

Si une primitive attendue manque dans `@zetis/ui` et qu'elle est générique :
**STOP**, propose son extraction et attends validation — pas de variante locale
en douce.

## Assets

Les 8 illustrations de matières (`anglais_256.png` … `technologie_256.png`) sont
fournies par Papa → `apps/frontend-massimo/src/assets/subjects/`. Résous
l'illustration par `subject_slug` avec un repli neutre (disque glass + initiale
de la matière) si un slug n'a pas d'image — ne casse jamais sur une matière
inconnue.

## À implémenter

### 1. Navigation

- Entrée sidebar « Révision » **après « Cours »**, icône Lucide (`Layers`).
- Routes : `/revision` (decks) et `/revision/session` (session, deck passé via
  l'état du routeur). Accès direct ou refresh sur `/revision/session` sans deck
  → redirection vers `/revision`.
- **Deep link** `/revision?subject={slug}` : détecte le param, lance la session
  matière et `navigate('/revision/session', …, { replace: true })` — le
  `replace` est obligatoire, sinon le retour depuis la session retombe sur
  l'URL paramétrée qui relance la session en boucle.
- Retour navigateur depuis la session → écran des decks (jamais hors de la page).

### 2. Écran decks (`/revision`) — données `GET …/summary`

- Section « Mélanges » : deux `DeckDisc` héro — « Mélange du jour »
  (`total_due`, plafonné à l'affichage « 15+ » au-delà de 15) et « Mélange
  éclair » (`flash_size`). Collage circulaire de 4 matières ayant des cartes
  dues + 🔀 en surimpression.
- Section « Par matière » : grille de `DeckDisc` (illustration, effet pile,
  anneau, badge compteur — même plafond « 15+ »). Matière à `due_count == 0` :
  atténuée + « à jour ✓ » (jamais grisée comme un manque), non cliquable.
- État zéro global (`total_due == 0`) : « Tout est frais dans ta mémoire ! 🎉 »
  + suggestion douce (lien Cours / Capsules), aucun CTA de révision.

### 3. Session (`/revision/session`) — hook `useReviewSession`, logique hors composants

Machine à états : `loading → card_front → card_back → transitioning → …
→ summary(tier) → [redo → …] → done`.

- Au montage : `POST …/session` avec le deck ; en-tête = nom du deck (+ icône
  matière si deck matière), « ← Quitter » (retour decks, **sans confirmation** :
  chaque rating est déjà POSTé, rien ne se perd), points de progression.
- `FlipCard` : recto (icône+nom matière, question, mention « Question ») →
  bouton « Révéler la réponse » → flip 3D → verso (réponse, « Réponse »).
- Ratings : 4 boutons `🔄 À revoir · 🤔 Difficile · 🙂 Bien · ⚡ Facile`
  (mapping `again|hard|good|easy`), apparition **retardée ~250 ms** après le
  flip (anti-clic réflexe). `again` en ambre — **aucun rouge nulle part**.
- Chaque rating → `POST …/attempt` immédiat ; cumule `xp_awarded` renvoyé par
  le serveur (le client n'invente aucun montant d'XP) ; carte suivante avec
  transition sortie/entrée.
- File `fragile` : cartes notées `again`/`hard` du passage courant.

### 4. `SessionEndPopup` — 3 paliers sur `pct = (good+easy) / total`

- **≥ 80 %** : 🎉 « Incroyable, Massimo ! » + confettis (palette zetis, purgés
  après ~4 s) + [Continuer].
- **50–79 %** : 🌟 « Bien joué ! … les autres reviendront bientôt, au bon
  moment » + [Terminer].
- **< 50 %** : 💪 « C'était costaud aujourd'hui » — la difficulté est attribuée
  à la **nouveauté des notions**, jamais à Massimo. Si re-tour pas encore fait
  et `fragile` non vide : [🔄 Refaire un tour (N cartes)] + lien secondaire
  « Plus tard, elles reviendront ». Sinon : « Bel effort ! Elles reviendront
  très vite » + [Terminer].
- Jauge animée jusqu'à `pct` (dégradés par palier, jamais de rouge) + libellé
  « X/N bien ancrées · P % » + pilule XP (somme des `xp_awarded` serveur).
- **Re-tour : une seule fois par session** (flag dans le hook). Il rejoue la
  file `fragile` ; les attempts partent normalement — c'est le **serveur** qui
  les traite en consolidation (XP réduit, planification intacte), le client ne
  déclare rien.
- `prefers-reduced-motion` : flip, confettis, jauge et pop désactivés/instantanés.

### 5. Sons (conditionnel)

Si `use-sound` est déjà une dépendance du workspace : `réussite` (palier haut)
et `XP gain` (chaque popup), assets Kenney CC0, mute respecté. **Sinon : ne
l'ajoute PAS** — signale-le en point non traité (sobriété : pas de nouvelle
dépendance sans validation).

## Contraintes

- Toute la logique dans `useReviewSession` ; `DeckDisc` / `FlipCard` /
  `SessionEndPopup` = présentation pure (props typées depuis `@zetis/types`).
- Vocabulaire enfant : jamais « échec », « erreur », « en retard », ni compteur
  anxiogène. Aucune donnée de planification affichée (le payload backend n'en
  contient pas — ne pas en recalculer côté client).
- Tokens `zetis-*` + primitives `glass` existantes ; zéro CSS dupliqué du login.
- Aucune persistance client entre sessions ; l'état vit dans le hook.

## Tests (Vitest)

- Hook : transitions d'états ; file `fragile` correcte ; re-tour disponible une
  seule fois ; cumul XP = somme des réponses serveur (mock) ; palier calculé aux
  bornes (50 %, 80 % → paliers moyen et haut : bornes **incluses**).
- Rendu : badge « 15+ » au-delà de 15 ; deck à jour non cliquable ; ratings
  absents avant le flip ; libellé « Refaire un tour (N cartes) » ; état zéro.
- Navigation : `?subject=` lance la session avec `replace` (l'historique ne
  contient pas l'URL paramétrée) ; `/revision/session` sans deck redirige.
- La suite existante reste verte.

## Hors périmètre strict (ne pas commencer)

- Bottom bar mobile (chantier responsive F5) ; filtre par chapitre (V2) ;
  statistiques Massimo ; intégration mission du jour ; toute vue Papa ;
  génération de cartes.

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : formes `reviews.ts` différentes de
la spec ; pas de convention d'assets images dans l'app ; sidebar structurée
autrement que prévu ; primitive modale absente de `@zetis/ui`. Dans ces cas :
propose l'ajustement minimal et attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés ·
5. Commandes · 6. Tests · 7. Points non traités volontairement ·
8. Prochaine étape recommandée · 9. Commit conseillé :
`feat(massimo): revision page — subject decks, flip sessions, tiered end popups`
