# Prompt — Chat orchestrateur · Slice B (frontend : exécuteur d'action + cartes de données)

> À coller dans Claude Code. Prérequis : slice A backend **mergée** (le champ `ChatMessageOut.action`
> existe), branche `feat/chat-orchestrateur` (étape 2) ou `feat/chat-orchestrateur-front`.

```
Chantier : Chat ZETIS orchestrateur (ADR-0027). Slice B : frontend Massimo (exécuteur + cartes données).
Mono-chantier : cette session ne touche QUE apps/frontend-massimo (page chat, lib chat/chatActions,
cartes données). Aucun fichier backend. Hors de ça, tu t'arrêtes.

graphify update . puis graphify explain "chat page" et "notion action panel".

## Décisions déjà tranchées (ADR-0027 §2 — ne les rouvre pas)

1. Navigation MODALE sur l'entrée : message dit à la VOIX (micro) → navigate() DIRECT ;
   message ÉCRIT (clavier) → CARTE-ACTION à taper. La page connaît l'origine du tour.
2. show_data → affiché DANS le chat : carte compacte (données récupérées CÔTÉ FRONT depuis
   l'endpoint existant) + un bouton d'ouverture (= une action navigate).
3. Carte-action = généralisation du bloc .chat-offer : ≤ 2 propositions + une sortie.
4. Orienter vers l'existant : si le backend renvoie action null + un motif « pas dispo »,
   ZETIS le dit honnêtement (déjà dans le reply). Le front n'invente aucune route.
5. Le geste (tap/navigation) émet chat_tool_response (déjà câblé, respondTool). Aucun event neuf.

## Read-before-code

- apps/frontend-massimo/src/pages/ChatPage.tsx : ma page (slice B/Lot2 ADR-0026). Le champ
  `origin` voix/texte : le tour vient de send() appelé soit depuis stopMic (VOIX), soit depuis le
  form submit (TEXTE) — propage cette origine jusqu'à l'exécution de l'action.
- lib/chat.ts : type ChatReply → ajoute `action`. Le contrat backend fait foi (lis-le, n'invente pas).
- components/galaxy/NotionActionPanel.tsx : le hub de routage-par-notion existant — patron des
  navigations (useNavigate, deep-links, location.state là où c'est nécessaire). Réutilise ses helpers.
- lib/agenda.ts (+ agendaSections.splitSections/bannerItems), lib/reviews.ts (fetchReviewsSummary),
  lib/missions.ts (fetchToday) : les fetch des cartes de données. Ne réimplémente rien.
- chat.css : le bloc .chat-offer à généraliser.

## Périmètre (un commit unique)

1. lib/chat.ts : type `ChatAction` (miroir backend) + `ChatReply.action`.
2. lib/chatActions.ts : exécuteur pur — action navigate → (route | navigate(path,{state})) ;
   action show_data → sélection du fetch + du composant de carte. Table réutilisant NotionActionPanel.
3. ChatPage.tsx :
   - propage `origin: "voice" | "text"` du tour jusqu'à la réception de l'action ;
   - action navigate + origin voix → navigate() direct ; + origin texte → carte-action à taper
     (bloc .chat-offer généralisé, libellé = action.label ancré) ;
   - action show_data → carte inline (fetch de l'endpoint + rendu compact) + bouton « Ouvrir … → »
     (déclenche la navigate correspondante, même politique voix/texte) ;
   - le tap/navigation émet chat_tool_response via respondTool (réutilise).
4. Cartes de données (composants simples) : DevoirsCard (agenda du jour via splitSections),
   RevisionsCard (reviews/summary), MissionsCard (missions/today). Vocabulaire bienveillant, ≤ compact.
5. Tests (Vitest) :
   - action navigate + origin voix → useNavigate appelé (mock) ;
   - action navigate + origin texte → carte rendue, tap → navigate + chat_tool_response ;
   - action show_data agenda → carte de devoirs rendue depuis un fetch mocké ;
   - action null → aucune carte, aucune navigation (juste le reply) ;
   - test-verrou source conservé (aucune API vocale navigateur, aucun stockage local).

## Hors-périmètre explicite (STOP)

- Backend, migrations, nouveaux endpoints. Cibles hors v1 (quiz par notion, mission précise) :
  le backend renvoie action null, le front n'invente rien. Diagnostic : jamais routé.
- CHANGELOG, ROADMAP.

## Fin de session

Checklist 9 points + MEMORY.md + graphify update . + commit unique. Vérif live end-to-end
(Ollama + galaxy réels) : « montre mes fiches sur les fractions » (voix→navigue, clavier→carte)
et « c'est quoi mes devoirs » (carte inline).
```
