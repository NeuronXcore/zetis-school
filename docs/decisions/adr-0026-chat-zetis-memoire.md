# ADR-0026 — Chat ZETIS : mémoire éphémère, traçabilité typée, signal déclaratif

## Statut

Proposé — 2026-07-29. Les quatre décisions structurantes (§1 à §4) sont à valider par le
commanditaire avant toute slice.

> **Numérotation** : 0025 est pris (« Agenda scolaire »). Cet ADR est donc 0026.
>
> S'appuie sur : `adr-0011 §1` (module neutre à consommateurs multiples — le chat devient le
> **quatrième** consommateur du substrat d'évidence, après le scoring de missions, le Conseil
> de classe et l'analyse d'échéance de l'agenda), `adr-0017 §5bis` (rien de déclaratif dans le
> moteur de verdict), `adr-0025 §3` (« l'absence n'est pas un événement » ; mesurer n'est pas
> prioriser ; vocabulaire d'`event_type` fermé), `adr-0020` (Conseil de classe = narration sur
> évidence calculée, jamais sur texte libre), `adr-0009 addendum §C/D` (résolution du cours
> canonique, substrat `canonical_context`), `adr-0002` (séparation stricte des surfaces).
> **Ne rouvre aucune décision antérieure.**
>
> **Ce que cet ADR ne décide PAS** : l'UX du chat (avatar, états, voix), le streaming SSE, le
> STT/TTS temps réel, le routage vers les outils. Ces arbitrages appartiennent au chantier
> chat lui-même (ADR ou spec dédiés). Cet ADR fige uniquement **ce que le chat retient, où,
> et qui peut le lire** — parce que ces règles conditionnent le contrat backend et qu'elles
> sont irréversibles une fois les premières conversations passées.

## Contexte

Le chat ZETIS (fonction cible de `frontend-massimo`, ARCHITECTURE.md) n'existe pas encore en
code. Avant de l'ouvrir, une question doit être tranchée : **de quoi ZETIS se souvient-il ?**
Sans mémoire, ZETIS est un répondeur — il ne peut pas proposer le bon outil (ELI5, fiche,
mindmap, révision) parce qu'il ne sait pas ce que Massimo travaille. Avec la mauvaise mémoire,
il devient autre chose de pire : un enregistreur dans la chambre d'un enfant.

Trois mémoires distinctes, à ne pas confondre :

| | Contenu | Statut |
|---|---|---|
| **M1 — tour** | les messages de la session en cours | nécessaire, éphémère |
| **M2 — élève** | maîtrise, lacunes, activité, SRS | **existe** (`evidence`) |
| **M3 — fil** | « la semaine dernière tu bloquais sur X » | la seule chose neuve |

Trois risques identifiés si M3 devient un journal de conversation :

1. **Surveillance.** Un log conversationnel persistant est lisible — par Papa, par une
   sauvegarde, par un transfert de bâton. Le tracking de ZETIS est strictement parent-side et
   porte sur l'*activité*, jamais sur les *mots* ; un verbatim durable casserait ce contrat.
2. **Bruit.** Un RAG sur du bavardage d'adolescent retourne du bavardage. La recherche
   sémantique dans un historique libre est la mauvaise primitive pour « de quoi on a parlé ».
3. **Double vérité.** Un quatrième journal à côté de `learning_events` recréerait le problème
   que la règle « deux journaux, jamais d'UNION » (DATA_MODEL.md) a réglé.

## Constat read-before-code

**1. Redis est déjà doctrinal pour ce rôle.** ARCHITECTURE.md §Redis liste explicitement
« anti-spam vocal/chat » et « sessions temporaires ». M1 en Redis n'est pas une exception :
c'est l'usage prévu de la couche. Corollaire du modèle de bâton : Redis est **hors périmètre
de synchronisation et de sauvegarde** — ce qui y vit ne peut fuiter ni dans un backup ni dans
un transfert de machine.

**2. Le journal typé et son outillage existent.** `log_learning_event` (calqué sur
`award_xp`), dédupe des consultations (1/élève/ressource/jour Europe/Paris), constantes dans
`activity/events.py`, vocabulaire d'`event_type` **fermé et documenté**, index
`(student_id, created_at)`. Le substrat d'évidence lit le journal **filtré par type**
(`evidence.recent_verdicts` ne lit que `mission_verdict`) : des événements de chat n'entrent
dans aucun chemin probant par construction — même constat que l'ADR-0025 §read-before-code.

**3. `Gap.source = ai_observation` existe et n'a aucun producteur.** Le modèle `Gap` porte
`source ∈ {diagnostic, quiz, parent, ai_observation}` ; aucun module n'émet la quatrième
valeur. Le chat en est le producteur naturel — c'est la seule classe de signal que ZETIS ne
possède pas aujourd'hui : *ce que Massimo dit de lui-même*.

**4. La résolution question libre → `skill_id` est un différé d'ELI5** (page-eli5.md
§Reporté : « embeddings `nomic-embed-text` → `skill_id` »). Sans elle, aucun événement de
chat ne peut être ancré sur une notion, et la mémoire est vide. **Elle passe de différé à
prérequis dur** de ce chantier — implémentée une fois, dans le module partagé, ELI5 en
héritera (patron ADR-0011).

**5. `ai_jobs` persiste ses entrées/sorties en PostgreSQL.** Le patron asynchrone standard
(job → worker → `output_json`) ferait donc transiter — et durer — le verbatim en base, en
contradiction frontale avec §1. Le pipeline de chat doit être **aveugle au contenu** (§1c).

**6. Les sessions ne sont pas stockées** (reconstruites depuis `learning_events`,
`SESSION_GAP_MINUTES`). Aucun événement « session de chat » n'est donc nécessaire : les
événements de chat alimentent la reconstruction existante, comme tous les autres.

## Alternatives considérées

- **Historique conversationnel persistant en PostgreSQL** (tables `chat_sessions` /
  `chat_messages`) : écarté. Rouvre le débat de visibilité Papa sans bonne réponse (lisible =
  surveillance ; illisible = données mortes qui dorment dans les sauvegardes), et fait du
  chat un lieu où l'on *revient* — contraire à la philosophie non-addictive.
- **RAG sur le verbatim** (embeddings des messages) : écarté. Bruit (contexte 2), infra de
  synchronisation nouvelle, et la question « de quoi on a parlé » a une réponse relationnelle
  exacte (requête par `skill_id`), pas approximative.
- **Résumé de session rédigé par le LLM, stocké en texte** : écarté. Un résumé libre est un
  journal qui ne dit pas son nom — mêmes problèmes de visibilité, plus l'hallucination. Ce
  que le résumé capturerait d'utile *est* la liste d'événements typés.
- **Aucune mémoire** : écarté. ZETIS amnésique ne peut ni proposer le bon outil ni tenir le
  rôle de compagnon ; et l'accueil composé serveur prouverait à chaque ouverture qu'il sait
  des choses que « lui » ignore — incohérence de personnage.
- **Profil éditable « ce que ZETIS sait de moi »** : écarté en v1. Séduisant pour la
  transparence, mais c'est un produit en soi ; la transparence passe d'abord par une phrase
  fixe dans l'UI (§5) et un vocabulaire d'événements fermé et documenté.

## Décision

### 1. Le verbatim est éphémère **par construction**

> **Les messages de chat ne touchent jamais la couche durable. Pas de table, pas de colonne,
> pas de fichier. La garantie n'est pas une politique de confidentialité : c'est une
> impossibilité structurelle.**

- **a)** M1 vit dans Redis : clé `chat:{student_id}:{session_id}`, TTL glissant
  (`CHAT_SESSION_TTL_MINUTES = 120`, constante versionnée), purge explicite à la clôture de
  session. Redis est éphémère, hors sauvegarde, hors bâton — le verbatim ne peut fuiter nulle
  part.
- **b)** Conséquence assumée : **pas de « reprendre la conversation d'hier » au mot près.**
  Les sessions sont one-shot ; la continuité vient des événements (§2), pas des
  transcriptions. Un compagnon qui se souvient *de ce que tu travailles* mais pas *de tes
  phrases* est le bon réglage entre chaleur et surveillance.
- **c)** **Le pipeline IA est aveugle au contenu.** Si le tour de chat passe par `ai_jobs`
  (patron asynchrone existant), le job ne porte qu'une **référence** (`session_id`, index de
  tour) : le worker lit les messages dans Redis et y écrit la réponse.
  `ai_jobs.input/output_json` ne contiennent que des métadonnées (`skill_id` résolu, type de
  difficulté classé, outil proposé, durée) — **jamais un texte de message**. Test-verrou.
- **d)** La question « le journal de chat est-il lisible par Papa ? » — ouverte depuis le
  cadrage — **se dissout : il n'y a pas de journal.**

### 2. Le chat n'a pas de mémoire propre — il écrit dans le journal commun

M3 = des `learning_events` typés, émis **côté serveur** (orchestrateur), jamais par le
client. Vocabulaire fermé, **trois types exactement** :

| event_type | Émis quand | payload_json | Dédupe |
|---|---|---|---|
| `chat_topic` | la résolution de notion aboutit | `{skill_id}` | 1/(élève, skill, jour Paris) |
| `chat_tool_response` | Massimo répond à une proposition d'outil | `{tool_type, skill_id, accepted}` | aucune (chaque réponse est un acte) |
| `chat_difficulty_declared` | difficulté auto-déclarée détectée | `{skill_id, kind}` | 1/(élève, skill, jour Paris) |

- **Un acte = un événement** (leçon MEMORY.md §Activité) : pas de paire
  `chat_tool_offered`/`chat_tool_accepted` — la réponse porte l'offre dans son payload.
- **Non probants par construction** : l'évidence lit le journal filtré par type ; aucun des
  trois n'entre dans un chemin de verdict, de maîtrise ou de scoring. Invariant testé, même
  formulation qu'ADR-0025 : *aucune sortie d'`evidence/service.py` modifiée par un événement
  de chat*.
- **Aucun XP** n'est crédité par une conversation. Parler n'est pas une performance ; le
  récompenser apprendrait à parler pour l'XP.
- **`chat_topic_missed` / `chat_abandoned` n'existent pas et n'existeront pas** — l'absence
  n'est pas un événement (doctrine ADR-0025 §3, opposable ici aussi).
- Effet acquis sans plomberie : heatmap, minutes actives, sessions reconstruites, Cahier de
  bord — le chat y entre comme n'importe quelle activité.
- **« La semaine dernière tu bloquais sur X »** = requête sur `learning_events` filtrée
  (`chat_topic`, `chat_difficulty_declared`) + `skill_id`, injectée au contexte d'ouverture.
  Zéro recherche sémantique, zéro embedding de conversation.

### 3. Le signal déclaratif est un signal **faible** — règle de corroboration

`chat_difficulty_declared` peut alimenter une `Gap`, sous trois contraintes cumulatives :

- **a)** `source = ai_observation` (première utilisation de la valeur), `severity = low`
  **toujours** — jamais medium/high, jamais d'escalade d'une lacune existante par
  déclaration. Un enfant qui dit « je suis nul en maths » n'établit pas une lacune ; un
  enfant qui dit « j'ai tout compris » n'en ferme pas une.
- **b)** **Corroboration comportementale requise** : la `Gap` n'est créée que si
  `SkillMastery` de la notion est `unknown | weak | learning`. Sur une notion
  `solid | mastered`, ou sans donnée de maîtrise, la déclaration reste un événement — aucune
  ligne `gaps`. Déterministe, testable.
- **c)** Si une lacune ouverte existe déjà (`OPEN_GAP_STATUSES`) : **ne rien écrire** —
  l'événement est la trace, la lacune n'a pas besoin d'être confirmée par du déclaratif.
- Remontée à Papa : par les surfaces existantes (Cahier de bord via les événements ; lacunes
  via `progress` ; Conseil de classe via l'évidence). **Aucune surface nouvelle.**
  Formulation déclarative imposée côté UI : « Massimo dit avoir du mal avec X » — jamais un
  constat diagnostique.

### 4. Rappel, jamais relance

> **La mémoire du chat n'existe qu'à l'intérieur d'une session que Massimo a ouverte.**

- Aucune notification, aucun message d'attente, aucun « tu m'as manqué », aucun contenu
  poussé entre deux sessions. La frontière est celle du cadrage : *rappel ≠ relance*.
- Le contexte d'ouverture (notions récentes, difficulté déclarée) est **composé serveur,
  déterministe**, depuis les événements — même discipline que le message d'accueil existant.
  Deux voix de ZETIS sur le même état, dont une hallucinée, détruiraient la confiance.

### 5. Visibilité et transparence — l'asymétrie est dite

- **Papa voit l'activité, jamais les mots** : « session de chat, 12 min, sujets : fractions,
  aires » (événements agrégés par les surfaces existantes). Aucune route, aucun export,
  aucun payload ne sert un verbatim — test-verrou sur l'ensemble des routes parent.
- **Massimo sait ce qui est retenu.** Une phrase fixe, visible dans l'UI du chat :
  « ZETIS retient les notions que tu travailles, pas tes mots. » La transparence est un
  invariant de l'interface, pas une ligne de CGU.

### 6. Budget de contexte et résolution de notion

- L'état injecté par tour est borné (`CHAT_CONTEXT_TOKEN_BUDGET`, constante versionnée,
  ~300 tokens) : la sélection d'évidence pertinente **exige** de savoir de quelle notion on
  parle → la résolution embeddings → `skill_id` (constat §4) est le premier bloc du Lot 1.
  Best-effort : une résolution qui échoue ne bloque jamais la réponse — elle prive seulement
  le tour de trace (`chat_topic` non émis) et de contexte ciblé.
- Le cours canonique, quand la notion est résolue, entre par le résolveur partagé
  (`canonical_context`) — le chat est un dérivé comme les autres, il ne réimplémente aucun
  gate.

## Périmètre

**Lot 1 — le substrat de mémoire (backend seul, chat texte minimal pour l'héberger)** :
module `chat` (store Redis + orchestrateur + émissions) ; résolution question → `skill_id`
dans le module partagé ; règle de corroboration §3 ; endpoints texte minimaux sur le patron
asynchrone existant (`ai_jobs` aveugle au contenu, §1c) ; tests d'invariants. **Aucune
migration** (vérification d'index seule).

**Lots suivants (hors ADR, chantier chat)** : streaming SSE, page Massimo, STT/TTS temps
réel, avatar (maquette `mockup-zetis-vivant.html` validée), routage outils, garde-fous
socratiques.

**Hors périmètre (tracé, non planifié)** : reprise verbatim inter-sessions ; résumé de
session ; profil éditable « ce que ZETIS sait » ; toute lecture du chat par le Conseil de
classe au-delà de l'évidence standard.

## Conséquences

### Positives

- **Zéro table, zéro migration, zéro dépendance.** La mémoire est presque gratuite *parce
  que* le journal typé, l'évidence et Redis existaient — validation du patron ADR-0011.
- Le débat vie privée du chat est **dissous structurellement**, pas arbitré : il n'existe
  rien à cacher ni à montrer.
- Premier producteur de `ai_observation` : ZETIS gagne la classe de signal qui lui manquait
  (le déclaratif), bornée par une règle de corroboration déterministe.
- Le chat alimente heatmap, Cahier de bord et Conseil de classe **sans une ligne de code
  dédiée** côté lecture.

### Négatives / coûts

- **Pas de continuité verbatim** : « comme je te disais hier » ne fonctionnera jamais au mot
  près. Coût assumé — c'est le prix de la garantie §1.
- **La mémoire dépend de la résolution de notion.** Une session entière sur une notion non
  résolue (hors référentiel, formulation trop vague) ne laisse aucune trace exploitable. La
  qualité du référentiel devient la qualité de la mémoire.
- **Redis porte des données sensibles en RAM** le temps d'une session. Borné par le TTL et la
  purge, mais c'est une donnée de plus à mentionner dans SECURITY.md.
- **Le patron `ai_jobs` gagne une variante** (job à référence, aveugle au contenu) — une
  subtilité de plus à connaître pour toute session future qui touche au worker.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; `DATA_MODEL.md` (vocabulaire `event_type` +3, note
  `Gap.source = ai_observation` + règle §3) ; `API_SPEC.md` §Chat ; `SECURITY.md` (verbatim
  Redis, TTL) ; `ARCHITECTURE.md` (rien — Redis y prévoit déjà ce rôle).
- **Slices** : (A) backend substrat —
  `prompts/claude-code/prompt-chat-memoire-slice-a-backend.md`. Les slices UI appartiennent
  au chantier chat.
- **Invariants testés (un test chacun)** : aucun modèle SQLAlchemy ne contient de message de
  chat (scan du metadata) ; `ai_jobs.input/output_json` d'un tour de chat ne contient aucun
  texte de message ; aucune route `require_parent` ne sert un verbatim ; aucune sortie
  d'`evidence` modifiée par les trois événements ; déclaration sur notion `solid|mastered` →
  aucune `Gap` ; `severity` d'une `Gap` chat toujours `low`, jamais d'escalade d'une lacune
  existante ; lacune ouverte existante → aucune écriture ; dédupe `chat_topic` 1/jour ;
  TTL posé à la création de session ; purge à la clôture ; aucun XP crédité par un tour de
  chat.
- **Ordre dans la file** : après les chantiers séquencés en cours (ADR-0023 §Suivi, Agenda).
  Mono-chantier : branche `feat/chat-memoire`.

## Points ouverts (à trancher avant les slices concernées)

1. **Classifieur de difficulté déclarée** : sortie structurée du moteur rapide (schéma JSON,
   patron capsules) ou heuristique lexicale en V1 ? Le premier est plus juste, le second plus
   sobre. → Slice A, sur mesure de la fiabilité du 4B.
2. **Formulation exacte du Cahier de bord** (« sujets : … ») et de la phrase de transparence
   §5 côté Massimo. → slice UI du chantier chat.
3. **Anti-spam** : quota de tours par session (clé Redis dédiée, rôle déjà prévu par
   ARCHITECTURE.md). Valeurs à poser en constantes versionnées. → Slice A.

## Décisions à valider par le commanditaire avant exécution

1. **Verbatim éphémère par construction** (§1) — dont le renoncement à la reprise
   inter-sessions.
2. **Trois événements typés, vocabulaire fermé, non probants, zéro XP** (§2).
3. **Règle de corroboration du signal déclaratif** (§3).
4. **Rappel jamais relance + phrase de transparence** (§4, §5).
