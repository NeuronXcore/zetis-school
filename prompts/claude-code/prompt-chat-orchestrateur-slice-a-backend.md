# Prompt — Chat orchestrateur · Slice A (backend : intent typé + résolveur d'action ancré)

> À coller dans Claude Code. Prérequis : ADR-0027 **validé** et commité, chantier chat voix
> (ADR-0026) **mergé sur main**, branche `feat/chat-orchestrateur` créée.

```
Chantier : Chat ZETIS orchestrateur (ADR-0027). Slice A : backend, intent typé + résolveur ancré.
Branche : feat/chat-orchestrateur.
Mono-chantier : cette session ne touche QUE le backend (module chat, prompt chat, tests).
Hors de ça, tu t'arrêtes.

graphify update . puis graphify explain "chat" et "galaxy" avant toute lecture de code.

## Décisions déjà tranchées (ADR-0027 — ne les rouvre pas)

1. Le tour de chat gagne un INTENT proposé par le LLM, ANCRÉ par le serveur. Le LLM propose,
   le serveur décide. Jamais de route/target hallucinée : une cible non ancrable → action null.
2. ChatMessageOut gagne un champ `action` typé : navigate{route,state?,label} |
   show_data{data,label} | null. Toujours construit serveur depuis un id VALIDÉ.
3. Orienter vers l'EXISTANT VALIDÉ uniquement : router seulement vers un contenu `available`
   (déclaré par galaxy/notion). Contenu absent → PAS d'action, réponse honnête (ZETIS le DIT).
   Jamais générer. Le résolveur expose un motif « not_available {skill_id, kind} » exploitable.
   DEMANDE À PAPA sur contenu absent = décision ADR-0027 §3, mais MÉCANISME DIFFÉRÉ (Point ouvert
   n°4 : extension `notion_requests` vs table `content_requests`) → HORS Lot 1 : ne l'implémente pas,
   laisse le motif prêt. Cas « notion non résolue » : réutiliser `request-notion` est possible mais
   hors périmètre de cette slice (le confirmer avec le user avant de câbler).
4. show_data ne renvoie AUCUNE donnée depuis le backend (le front fetch) : le pipeline reste
   aveugle au contenu (ADR-0026 §1c). L'ai_jobs du tour ne trace que des métadonnées.
5. Aucun nouvel event_type : le geste front réutilisera chat_tool_response. Zéro XP.

## Read-before-code (obligatoire)

- app/modules/chat/ : service.py (handle_message, _run_turn_llm), schemas.py (ChatMessageOut),
  prompts/chat.py (chat_turn_schema, CHAT_TOOL_TYPES). Tu ÉTENDS, tu ne réécris pas.
- app/modules/ai/skill_resolution.py : resolve_skill (déjà là, slice A ADR-0026) — réutilise tel quel.
- app/modules/galaxy/ : la fonction/service derrière GET /api/student/galaxy/notion/{skill_id}
  (GalaxyNotionOut : subject_slug, subject_name, actions[{kind,available,lesson_id,fiche_id,
  quiz_id,mindmap_id,capsule_id}]). C'est L'ENSEMBLE AUTORISÉ. Appelle le SERVICE, pas l'HTTP.
- app/modules/reports/service.py : _anchor() — le patron d'ancrage anti-hallucination à transposer.
- app/modules/subjects/ + /api/subjects : nom/slug de matière (pour open_subject).

## Périmètre (un commit unique)

1. prompts/chat.py : étendre chat_turn_schema() avec un objet `intent`
   { kind: open_notion|open_subject|show_data|none, notion_query?, subject_query?,
     tool?(eli5|fiche|mindmap|cours|revision), data?(agenda|reviews|missions) }.
   Garde `tool`/`data` en strings (validées en aval), pas d'enum dur (robustesse petits moteurs).
   Ajuste CHAT_TURN_PROMPT pour guider l'intent (exemples courts : « montre mes fiches sur X »,
   « c'est quoi mes devoirs »).
2. app/modules/chat/actions.py (nom indicatif) : le RÉSOLVEUR ancré. Entrée = intent brut + student.
   Sortie = ChatAction typé (navigate|show_data|none). Logique :
   - open_notion : resolve_skill(notion_query) → skill_id → service galaxy notion(skill_id) →
     si tool `available` dans actions[] → navigate vers la route ancrée (table de routes ci-dessous) ;
     sinon action null (+ un indice « not_available » que le service peut verbaliser).
   - open_subject : nom → subject_slug → navigate route matière.
   - show_data : action show_data{data} SANS fetch (le front s'en charge).
   - Table de routes (surfaces câblées v1) : eli5 → /eli5?skill_id=&name= ; fiche → /fiches/<slug> ;
     cours → /subjects/<slug>/cours ; mindmap(liste) → /mindmaps/<slug> ; revision → /revision?subject=<slug> ;
     progression → /progression?subject=<slug>. Hors v1 (state-only) : NE PAS inventer, action null.
3. app/modules/chat/schemas.py : ChatAction (discriminé par `kind`) + ChatMessageOut.action.
4. app/modules/chat/service.py : dans handle_message, après la réponse LLM, appeler le résolveur
   sur parsed["intent"], poser action dans ChatMessageOut. Métadonnées ai_jobs enrichies
   ({kind, skill_id, tool, route}) — JAMAIS de texte de message.
5. Tests (un par invariant ADR-0027 §Suivi) :
   - notion résolue + tool available → action navigate ancrée (route contient le skill_id/slug réel) ;
   - tool NON available → action null (jamais de route inventée) ;
   - notion non résolue → action null ;
   - show_data → action show_data, et AUCUNE donnée métier dans la réponse ni dans l'ai_jobs ;
   - une cible hors table de routes → action null ;
   - ai_jobs du tour : aucun texte de message (test-verrou existant étendu).

## Hors-périmètre explicite (STOP si tu y touches)

- Tout frontend. Toute génération de contenu. Tout nouvel event_type ou migration.
- Les cibles location.state (quiz-session, mission précise) : hors v1, action null, signalé.
- Le Diagnostic : jamais routé.

## Fin de session

Checklist 9 points + MEMORY.md + graphify update . + commit unique.
```
