# Prompt — Chat ZETIS · Slice B (frontend Massimo, Lot 1 texte + avatar)

> À coller dans Claude Code. Prérequis : slice A backend **mergée sur main**, spec
> `docs/frontend-massimo/page-chat.md` et maquette `mockup-page-chat.html` commitées.

```
Chantier : Chat ZETIS (ADR-0026). Slice B : frontend Massimo, Lot 1 texte + avatar.
Branche : feat/chat-memoire (étape 2) ou feat/chat-front si la A est mergée.
Mono-chantier : cette session ne touche QUE apps/frontend-massimo et packages/ui
(brique avatar). Aucun fichier backend. Hors de ça, tu t'arrêtes.

graphify update . puis graphify explain "frontend massimo pages" et "packages ui".

## Sources de vérité (dans cet ordre de préséance)

1. Le code réel des endpoints slice A (read-before-code ci-dessous) — prime sur tout.
2. docs/frontend-massimo/page-chat.md — la spec. Sa section « Ce que la maquette EST et
   N'EST PAS » est CONTRAIGNANTE : trois catégories, trois traitements.
3. mockup-page-chat.html — référence visuelle et source du code du rig avatar.

## Décisions déjà tranchées (ne les rouvre pas)

- Lot 1 = TEXTE SEUL. Aucun micro, aucune API de voix navigateur (speechSynthesis,
  webkitSpeechRecognition : INTERDITS — le panneau démo de la maquette n'est pas le
  produit), aucun son.
- L'avatar est une brique packages/ui (props state/awake + flux d'articulation
  [t, ouverture, grave, médium, aigu] ; zéro fetch, zéro logique métier). Le rig de la
  maquette (paupières, iris or, mâchoire, onde spectrale, horloges indépendantes) se
  transpose en React/TS, constantes calibrées dans un constants.ts unique (valeurs :
  tableau de la spec).
- Or = parole de ZETIS, nulle part ailleurs. Bleu électrique #2e63ff = réflexion.
- prefers-reduced-motion : état lisible sans mouvement (couleur+pastille+texte), testé.
- Patron réseau = ELI5 : POST message → job_id → polling GET /ai/jobs/{id}.
  Pas de SSE, pas de WebSocket.
- Phrase de transparence fixe : « ZETIS retient les notions que tu travailles, pas tes
  mots. » Toujours visible.
- Aucun mécanisme de ré-engagement (badge, relance, reviens-demain). Aucun XP.
- Proposition d'outils : 2 max + sortie « je réessaie tout seul », après la parole,
  jamais pendant. Deep-link ELI5 seul câblage réel ; le reste non-navigant + TODO.

## Read-before-code

- apps/backend : routes chat réelles de la slice A (schémas de réponse exacts,
  codes 429/404) — tu n'inventes aucun champ.
- apps/frontend-massimo : patron polling ELI5 (hooks existants), MassimoLayout,
  navigation (où /chat s'insère — si l'arbitrage bottom bar n'est pas tranché,
  route accessible sans onglet et STOP-ON-BLOCKER signalé en fin de session).
- packages/ui : conventions d'export (sous-chemin type @zetis/ui/mindmap si le canvas
  pèse), tokens, glass.tsx.
- lib/subjectIcons.ts si des matières apparaissent dans les chips d'ouverture.

## Périmètre (ordre, commit unique)

1. packages/ui : brique avatar (composant + moteur canvas + constants.ts + types du flux
   d'articulation). Le code de la maquette est la référence d'implémentation — transpose,
   ne réécris pas les maths (bruit apériodique, retards de spectre, PHON map).
2. apps/frontend-massimo : page /chat (états 1→5 de la spec), pseudo-phonétique branchée
   sur le texte de réponse (karaoké minuté, fonction isolée et commentée « remplacée par
   les bornes TTS »), tap-pour-couper, carte outils, phrase de transparence, quota 429.
3. Tests : Vitest + Testing Library — états de page, reduced-motion (état lisible),
   aucune API vocale importée (test-verrou par lint/grep), aucun localStorage de
   conversation, transparence présente, carte outils jamais rendue pendant `speaking`.

## Hors-périmètre explicite

- Backend, worker, migrations. Papa (aucune surface). STT/TTS/SSE/Rive.
- Le panneau de calibration de la maquette, tout réglage d'avatar exposé.
- navigation.md / bottom bar : tu ne tranches pas, tu signales.
- CHANGELOG, ROADMAP.

## Fin de session

Checklist 9 points + MEMORY.md + graphify update . + commit unique.
```
