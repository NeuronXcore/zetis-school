# Prompt — Chat ZETIS mémoire · Slice A (backend substrat)

> À coller dans Claude Code. Prérequis : ADR-0026 **validé** et commité, branche créée,
> ce fichier commité en premier commit de la branche (rituel WORKFLOW.md §2.1).

```
Chantier : Chat ZETIS — mémoire (ADR-0026). Slice A : backend substrat.
Branche : feat/chat-memoire (étape 1/1 de la slice).
Mono-chantier : cette session ne touche QUE le backend (module chat, module partagé de
résolution de notion, hooks d'événements, tests). Hors de ça, tu t'arrêtes.

graphify update . puis graphify explain "ai jobs worker" et "activity events"
avant toute lecture de code.

## Décisions déjà tranchées (ADR-0026 — ne les rouvre pas)

1. Le verbatim de chat ne touche JAMAIS PostgreSQL ni MinIO. M1 vit dans Redis :
   clé chat:{student_id}:{session_id}, TTL glissant CHAT_SESSION_TTL_MINUTES = 120
   (constante versionnée), purge explicite à la clôture.
2. Le pipeline IA est AVEUGLE AU CONTENU : si le tour passe par ai_jobs, le job ne porte
   qu'une référence (session_id, index de tour). Le worker lit Redis, écrit Redis.
   ai_jobs.input/output_json = métadonnées seulement (skill_id résolu, kind classé,
   tool_type proposé, durée) — jamais un texte de message.
3. Trois learning_events exactement, émis SERVEUR (jamais depuis le client) :
   - chat_topic {skill_id} — dédupe 1/(élève, skill, jour Europe/Paris)
   - chat_tool_response {tool_type, skill_id, accepted} — pas de dédupe
   - chat_difficulty_declared {skill_id, kind} — dédupe 1/(élève, skill, jour)
   Constantes dans activity/events.py, helper log_learning_event existant.
   Aucun autre type. chat_topic_missed / chat_abandoned n'existent pas (ADR-0025 §3).
4. Signal déclaratif → Gap : source=ai_observation, severity=low TOUJOURS.
   Création UNIQUEMENT si SkillMastery de la notion ∈ {unknown, weak, learning}.
   Notion solid/mastered ou sans donnée → événement seul, aucune ligne gaps.
   Lacune ouverte existante (OPEN_GAP_STATUSES) → aucune écriture.
   Jamais d'escalade de severity d'une lacune existante par déclaration.
5. Aucun XP crédité par un tour de chat. Aucun événement de chat dans un chemin probant.
6. Résolution question libre → skill_id : embeddings nomic-embed-text contre les Skill de
   l'année active, dans un module PARTAGÉ (pas dans chat/) — ELI5 en héritera (différé
   page-eli5.md §Reporté, promu prérequis par ADR-0026 §6). Best-effort : un échec de
   résolution ne bloque jamais la réponse (pas de chat_topic, pas de contexte ciblé).
7. Contexte injecté borné : CHAT_CONTEXT_TOKEN_BUDGET (constante versionnée). Le cours
   canonique entre par resolve_canonical_context existant — tu ne réimplémentes aucun gate.
8. Rappel jamais relance : le contexte d'ouverture est composé serveur depuis
   learning_events (chat_topic / chat_difficulty_declared récents). Aucun mécanisme de
   notification, d'attente ou de relance, sous aucune forme.

## Read-before-code (obligatoire, dans cet ordre)

- app/modules/ai/ : contrats réels LLMRequest / LLMResponse, get_provider, patron ai_jobs
  (création, worker, polling). Tu n'inventes AUCUNE forme d'API.
- app/modules/ai/canonical_context.py : resolve_canonical_context,
  build_canonical_sections — signatures réelles.
- app/modules/activity/ : log_learning_event, events.py, mécanique de dédupe existante
  (1/élève/ressource/jour Paris) — tu réutilises, tu ne dupliques pas.
- app/modules/evidence/service.py : vérifier quels event_type sont lus (les trois nouveaux
  ne doivent entrer dans AUCUNE lecture).
- app/modules/progress/ : OPEN_GAP_STATUSES (importer, ne pas redéfinir), modèle Gap.
- Usage Redis existant (connexion, conventions de clés, TTL) — même client, mêmes patterns.
- Embeddings : où et comment nomic-embed-text est appelé aujourd'hui (RAG) ; l'index
  pgvector est verrouillé 768d — tu ne touches à rien du routage embeddings.

## Périmètre (dans l'ordre, un commit unique en fin de slice)

1. Module partagé de résolution : app/modules/ai/skill_resolution.py (nom indicatif —
   aligne-toi sur les conventions du dossier). Entrée : texte libre + student. Sortie :
   skill_id | None + score. Seuil de confiance en constante versionnée.
2. Module app/modules/chat/ :
   - store.py : sessions Redis (create / append / read / close+purge), TTL glissant ;
   - service.py : orchestrateur d'un tour — lit la session, résout la notion,
     compose le contexte (budget §7, évidence + canonique), appelle le moteur rapide
     via le patron ai_jobs AVEUGLE (décision 2), écrit la réponse en Redis, émet les
     événements (décision 3), applique la règle Gap (décision 4) ;
   - classification de la difficulté déclarée : sortie structurée du moteur rapide
     (schéma JSON, patron capsules) SI le contrat LLM le permet tel quel ; sinon
     STOP-ON-BLOCKER et tu me signales — tu ne bricoles pas d'heuristique sans décision.
3. Routes (require_child) : POST /api/student/chat/sessions ;
   POST /api/student/chat/sessions/{id}/messages (patron job + polling existant, comme
   ELI5) ; POST /api/student/chat/sessions/{id}/close. Anti-spam : quota de tours par
   session en Redis (CHAT_MAX_TURNS_PER_SESSION, constante versionnée), 429 au-delà.
4. Tests — un test par invariant de l'ADR-0026 §Suivi, dont les test-verrous :
   - scan du metadata SQLAlchemy : aucun modèle ne porte de message de chat ;
   - ai_jobs d'un tour : aucun texte de message dans input/output_json ;
   - aucune route require_parent ne sert un verbatim ;
   - sorties d'evidence inchangées par les trois événements ;
   - règle Gap complète (corroboration, severity, lacune existante, mastered) ;
   - dédupes ; TTL ; purge à la clôture ; aucun XP.

## Hors-périmètre explicite (tu t'arrêtes si tu y touches)

- Tout frontend (Massimo comme Papa). Aucune page, aucun composant.
- Streaming SSE, STT, TTS, avatar, routage vers les outils (ELI5/fiches/mindmap).
- Toute migration Alembic (vérification d'index learning_events seule ; s'il manque,
  STOP-ON-BLOCKER et signale).
- Conseil de classe, Cahier de bord, Dashboard : aucune modification de leurs lectures.
- CHANGELOG, ROADMAP (rien de livré tant que la slice n'est pas vérifiée).

## Fin de session

Checklist 9 points habituelle + MEMORY.md (fait / à-faire / décisions actives / prochain
pas, écrit pour une session amnésique) + graphify update . + commit unique de la slice.
```
