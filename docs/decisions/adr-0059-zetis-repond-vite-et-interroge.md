# ADR-0059 — ZETIS répond vite, ouvre la ressource exacte, et interroge

## Statut

**Proposé (2026-08-15)** — cadré sur `main`, sans une ligne de code.

Il **révoque partiellement** l'`adr-0027` §3, **lève** un « hors lot » nommé de l'addendum
`adr-0026`, **révoque** le repli obligatoire de l'addendum `adr-0027` (content-requests), et
**reformule** l'`adr-0026` §1c. Aucune de ces quatre décisions n'est contournée en silence :
elles sont citées, datées, et le motif du changement est nommé à chaque fois.

Il ne rouvre **aucune** autre décision. L'`adr-0011` (substrat canonique) est cité, pas
reformulé — sauf sur un point de bornage explicité au §12.

## Contexte

### La demande

*« Si Massimo demande de revoir les mindmaps de mathématiques, ou pose une question plus précise
sur un cours ou une fiche, ZETIS doit pouvoir naviguer dans l'app et ouvrir le fichier demandé.
Si ce fichier n'existe pas encore, il doit avertir Massimo et le rajouter à ZETIS Papa pour
qu'il le produise. »* Puis, en cours de cadrage : *« ajouter à ZETIS la faculté de répondre aux
questions de Massimo, voire de le tester, à partir de la base de connaissance de ZETIS »*, et
*« comment rendre ZETIS plus réactif et vivant ? »*.

### 🔴 Le constat qui réduit le chantier : la moitié existe déjà

**Le second volet est livré depuis le 2026-07-30.** « Avertir Massimo puis inscrire la demande
chez Papa » est exactement ce que fait l'addendum `adr-0027` (content-requests) : note honnête,
`content_requests` avec dédup forte `(student, skill, kind)`, verdict de production pour Papa,
et même le retour de boucle dans le chat quand le contenu arrive (addendum `adr-0026`). **Il n'y
a rien à construire là.**

Et « revoir les mindmaps de maths » **fonctionne déjà** : `open_subject` + `tool=mindmap` rend
`/mindmaps/{slug}`. Une demande de niveau matière obtient une réponse de niveau matière — c'est
juste, et cela ne change pas.

### Ce que dit le code, précisément

**Défaut 1 — l'ouverture rate sa cible.**
[`chat/actions.py:92`](../../apps/backend/app/modules/chat/actions.py) `_notion_route` reçoit une
entrée de `notion_panel(...)["actions"]` qui porte **déjà** `lesson_id`, `fiche_id`,
`mindmap_id`, `quiz_id`, `capsule_id` ([`galaxy/service.py:553-566`](../../apps/backend/app/modules/galaxy/service.py))
— et rend `/fiches/{slug}`. Les douze fiches de Maths au lieu de celle sur les fractions.
⚠️ **Les adresses EXISTENT** : `?fiche=` (`adr-0054` §1), `?carte=` (`adr-0057`), `?lesson=`
(addendum `adr-0025` §15). Elles ne sont simplement pas utilisées ici. C'est mot pour mot le
défaut 2 de l'`adr-0058`, sur une autre surface.

**Défaut 2 — deux tables de routes, et elles ont déjà divergé deux fois.**
[`notionRoutes.ts:54`](../../apps/frontend-massimo/src/lib/notionRoutes.ts) et `_notion_route`
répondent à la **même** question — « où mène l'activité X de la notion N ? ». Divergences
mesurées : (a) le grain (le front cible mindmap et quiz, le serveur non) ; (b) `_MENU_LABEL`
dit `"🧠 Reconstruire la carte"` quand `ACTION_UI` dit `"Reconstruire la mindmap"` depuis le
2026-08-12 — et **personne ne l'a vu, parce que `ChatPage` écrase le libellé serveur**
(`ACTION_UI[item.kind] ?? item.label`). La correction de collision du 12 n'a jamais atteint le
chat, et n'avait pas besoin de l'atteindre : **`_MENU_LABEL` est une table morte.**

⚠️ **Ce n'est pas le cas de `CONTENT_KIND_TO_PANOPLY` vs `_CONTENT_KIND_TO_TOOL`**, dont le
commentaire de [`content_requests/service.py:37-49`](../../apps/backend/app/modules/content_requests/service.py)
défend à juste titre la coexistence : celles-là posent **deux questions différentes**
(« est-ce servable ? » et « y a-t-il une destination ? »). L'argument ne s'applique pas ici.

**Défaut 3 — le chat est le seul menteur du dépôt sur le type demandé.**
[`chat/actions.py:244`](../../apps/backend/app/modules/chat/actions.py) fait
`_TOOL_TO_CONTENT_KIND.get(tool, "cours")`. « Je n'ai pas de quiz sur X — je le note »
enregistre donc une demande de **cours**. La page matière, elle, émet `quiz` et `capsule` sans
repli (`REQUESTABLE_KIND`, addendum `adr-0027` surface élève). Papa lit une traduction là où il
devrait lire une demande.

**Défaut 4 — l'invariant « une seule fabrique » est faux en lettre.**
[`chat/actions.py:292`](../../apps/backend/app/modules/chat/actions.py) construit
`f"/subjects/{slug}"` sur place. Le test-verrou n°8 de l'addendum `adr-0026` ne balaie que
`announce.py`.

**Défaut 5 — la sortie de la mindmap ment depuis le chat.**
[`MindmapSubjectPage.tsx:162`](../../apps/frontend-massimo/src/pages/MindmapSubjectPage.tsx) :
sur `/mindmaps/reconstruire/:id`, l'unique bouton de sortie est « ← Retour à ma mission » →
`/missions`. Le chat y route (verrouillé par `test_chat.py:238`). Un enfant qui arrive depuis
une conversation atterrit sur une page dont la porte de sortie désigne un endroit d'où il ne
vient pas. Le défaut vaut aussi depuis `/galaxy` et la page matière.

**Défaut 6 — ZETIS ne répond pas, et c'est une phrase de prompt.**
[`prompts/chat.py:30`](../../apps/backend/app/prompts/chat.py) : *« RÈGLE ABSOLUE — tu n'es PAS
un professeur qui donne le cours, tu es un aiguilleur »*. Or
[`chat/service.py:181`](../../apps/backend/app/modules/chat/service.py) **injecte déjà le cours
canonique validé** dans le contexte de chaque tour (`resolve_canonical_context` +
`build_canonical_sections`). La matière est là ; l'interdiction de s'en servir aussi.

**Défaut 7 — le contexte tronque la règle qui le gouverne.**
`_compose_context` concatène `## MÉMOIRE` **puis** le bloc canonique, puis coupe à
`chat_context_token_budget * 4` = **1200 caractères**. Un `content_markdown` de cours pèse
plusieurs kilo-octets, et la règle d'autorité que `build_canonical_sections` pose **en fin de
bloc est donc systématiquement coupée**. Aujourd'hui, ZETIS reçoit un kilo-octet de cours
arbitrairement tronqué, sans la phrase qui lui dit quoi en faire.

### 🔴 Les mesures — la fuite de verbatim s'est RÉALISÉE

Relevé sur la base de dev le 2026-08-15, en lecture seule, **sur les longueurs uniquement — le
contenu n'a pas été lu** :

| | |
|---|---|
| Lignes `ai_jobs` portant un `transcript` | **78** |
| Toutes de type | `eli5_transcribe` |
| Période | **2026-07-04 → 2026-08-14** |
| Longueur moyenne / max | 40 / 109 caractères |
| Dont phrases réelles (> 40 car.) | **33** |

Le chemin : [`ChatPage.tsx:406`](../../apps/frontend-massimo/src/pages/ChatPage.tsx) appelle
`transcribeEli5` → [`stt/service.py:84`](../../apps/backend/app/modules/stt/service.py) écrit
`job.output_json = {"transcript": …}`. **Chaque phrase dite au micro dans le chat est écrite en
PostgreSQL, durablement, hors TTL.**

Trois aggravations, chacune indépendante :

1. **Le verrou est aveugle par construction.** `test_chat.py:91` filtre
   `AIJob.job_type == "chat_turn"`. Le garde-fou de l'`adr-0026` §1c ne regarde pas là où la
   fuite passe.
2. **La trace ne sait pas d'où elle vient.** ELI5, l'atelier des fiches et le chat écrivent le
   même `job_type`. On ne peut donc pas distinguer, dans ces 78 lignes, ce qui relève du chat —
   ce qui rend le nettoyage impossible à cibler et prouve que le `job_type` ne porte pas
   l'information dont il aurait besoin.
3. **Deux textes se contredisent.** L'`adr-0026` §1 promet une *« impossibilité structurelle »*
   ; la docstring de `stt/service.py:10` affirme *« rien de durable côté serveur »*. Les deux
   sont démentis par la même ligne de code.

### 🔴 La mesure impossible — `duration_ms` ne mesure pas ce que son nom dit

[`stt/service.py:85`](../../apps/backend/app/modules/stt/service.py) :
`job.duration_ms = int(result.duration_seconds * 1000)`, où `result.duration_seconds` vient de
`info.duration` de faster-whisper — **la durée de l'AUDIO**. Partout ailleurs dans le dépôt
(`ollama_provider.py:40`, `mlx_provider.py:57`, `anthropic_provider.py:89`), `duration_ms` est
un `time.monotonic()` écoulé, c'est-à-dire un **temps de traitement**.

Conséquence directe : **le seul instrument dont on disposerait pour chiffrer le coût du STT
mesure autre chose.** Une phrase de 3 secondes transcrite en 6 s'enregistre à `3000`. Toute
optimisation « mesurée » depuis cette colonne serait fausse.

### La chaîne, telle qu'elle se déroule quand Massimo lâche le bouton

Tout est **strictement en série**, et rien ne s'affiche avant la fin :

1. `rec.stop()` assemble le blob ;
2. upload complet → Whisper transcrit **l'énoncé entier** — sans paramètre de décodage, donc
   avec le défaut de faster-whisper, **beam search à 5** ([`stt/provider.py:114`](../../apps/backend/app/modules/stt/provider.py)) ;
3. → Ollama génère **tout le JSON** de réponse ;
4. → Piper synthétise **tout le WAV** ;
5. → décodage, **et seulement là** `setWords()` affiche le premier mot
   ([`ChatPage.tsx:248-259`](../../apps/frontend-massimo/src/pages/ChatPage.tsx)).

Entre 1 et 5, Massimo voit un avatar qui tourne. **Sa transcription ne s'affiche jamais** : elle
part directement dans `send()`. Il n'a donc même pas la confirmation d'avoir été entendu.

Et le premier appel de chaque processus paie en plus le chargement du modèle `small` :
`_load_model` est mémoïsé mais **paresseux**.

## Décision

### §1 — 🔴 Ce qui est révoqué de l'`adr-0027` §3, et ce qui ne l'est pas

Le §3 porte **trois affirmations** qui ont été lues comme une seule. **Une seule tombe.**

| Affirmation `adr-0027` §3 | Sort |
|---|---|
| « router **uniquement** vers des contenus `available` (validés) » | **MAINTENUE INTÉGRALEMENT** |
| « le chat enfant **ne déclenche aucune génération** » (capsule, fiche, quiz, cours) | **MAINTENUE INTÉGRALEMENT** |
| « contenu absent → honnêteté + demande à Papa » | **MAINTENUE et ÉLARGIE** (§8) |
| « jamais générer », appliqué à la **PAROLE** de ZETIS | 🔴 **RÉVOQUÉE** |

ZETIS peut désormais **dire le fond**, ancré, dans son `reply`. C'est le seul objet de la
révocation. Il ne peut toujours pas **fabriquer** de contenu durable, ni router vers du non
validé.

### §2 — 🔴 LA FRONTIÈRE : parole contre contenu durable

Écrite comme un **test opérationnel**, pas comme une intention — sans quoi elle se rediscutera
au premier cas limite :

> Est une **PAROLE** ce qui vit un tour, réside dans Redis sous TTL, n'est jamais re-servi,
> n'entre dans aucune table de contenu, ne porte aucun statut de validation, et disparaît à la
> clôture de session. **Aucune relecture n'est requise, parce qu'il n'y a rien à relire : l'objet
> n'existe plus demain.**
>
> Est un **CONTENU DURABLE** ce qui atterrit dans une table de contenu, porte un
> `status`/`validated_by`, est adressable par une URL, et sera re-servi à Massimo demain sans que
> personne ne l'ait relu entre-temps. **Reste intégralement sous le gate de Papa.**

Trois questions tranchent tout cas limite : *survit à `close_session` ? a une URL ? entre en base
comme texte ?* — trois « non » = parole.

| Cas | Verdict |
|---|---|
| ZETIS explique une notion en trois phrases | **parole** ✅ |
| ZETIS pose trois questions orales et les corrige | **parole** ✅ |
| ZETIS dicte une fiche complète que Massimo recopierait | ❌ — contenu durable qui contourne la relecture par le presse-papier de l'enfant. Interdit **dans le prompt** |
| ZETIS répond depuis sa propre connaissance, sans cours ni extrait | ❌ — garanti par le gate serveur (§7), pas par la bonne volonté du modèle |
| L'interrogation écrit une carte SRS portant la réponse de Massimo | ❌ — c'est ce que fait `eli5.reverse_evaluate` ; on ne le réplique pas (§10) |
| ZETIS déclenche la production d'un cours manquant | ❌ — il enregistre une demande ; Papa décide |

### §3 — 🔴 LE CRITÈRE QUI BORNE : aucune migration, aucune route neuve, aucun endpoint de navigation

Sur **tout** le chantier : **zéro migration Alembic**. Vérifié sur quatre points — le
vocabulaire de `content_requests` accepte les six types depuis la création de la table, les cinq
ids sont déjà servis par `resolve_panoply`, `GalaxyAction` les porte déjà côté TS,
`ChatMenuItem.kind` est un `str` libre.

Et sur l'arc navigation : **aucune entrée neuve dans `App.tsx`**. Le critère mord immédiatement —
il interdit `/quiz/:id` et `/capsules/:id` en chemin, et force la forme `?quiz=` / `?capsule=`,
celle que `?fiche=` et `?carte=` ont déjà établie. Une adresse de plus ne vaut pas une route de
plus.

### §4 — 🔴 L'ORDRE : la réactivité d'abord, et elle ne se négocie pas

La slice 0 passe avant tout le reste, pour deux raisons indépendantes :

1. **Elle referme la fuite mesurée ci-dessus.** L'interrogation orale (§10) multiplie les dictées
   par trois ou quatre par session : elle transformerait une fuite en canalisation. On ne
   construit pas au-dessus d'un défaut connu.
2. **Elle rend le reste supportable.** Un chat qui met plusieurs secondes à donner signe de vie
   n'est pas amélioré par le fait d'ouvrir la bonne fiche au bout.

### §5 — La réactivité : quatre gestes, du plus rentable au plus coûteux

1. **Le texte s'affiche sans attendre la voix.** `speakReply` fait
   `await synthesizeChatSpeech(text)` **avant** `setWords` : toute la synthèse Piper est du
   silence noir. On affiche les mots immédiatement — le karaoké muet existe déjà comme repli —
   puis on recale sur la durée réelle de l'audio quand il arrive.
   ⚠️ **Effet de bord vertueux** : l'affichage devient **indépendant** de la promesse de
   `playSpeech`, qui fait `await ctx.resume()` et reste pendante pour toujours sans geste
   utilisateur. Le piège du 2026-08-02 (addendum `adr-0026` §8) devient inoffensif.
2. **Massimo se voit entendu.** Sa transcription s'affiche dès son retour. Cela coupe l'attente
   perçue en deux et confirme la compréhension — c'est ce qui fait « vivant » bien plus qu'un
   gain de quelques centaines de millisecondes.
3. **Whisper en décodage glouton** : `beam_size=1`, `condition_on_previous_text=False`
   (inutile sur un énoncé isolé, et source de dérive), `without_timestamps=True`. Deux à trois
   fois plus rapide sur des énoncés courts.
   ⚠️ **Le VAD Silero reste désactivé.** Le commentaire de `provider.py:111` documente un échec
   réel — il jugeait « pas de parole » sur l'Opus du micro et jetait tout. Tentant pour la
   vitesse, déjà payé une fois.
4. **Warm-up du modèle au démarrage**, pour que la première dictée ne paie plus le chargement.

Le découpage en phrases pour que Piper commence à parler plus tôt est **reporté**, et
conditionné aux mesures du §6.

### §6 — 🔴 On mesure avant, et l'instrument existant est disqualifié

`ai_jobs.duration_ms` d'une tâche STT porte la durée de l'**audio**, pas du traitement (constat
mesuré ci-dessus). **Première action de la slice 0 : lui faire mesurer le temps de traitement,
comme partout ailleurs dans le dépôt**, et déplacer la durée de l'audio dans `output_json` où
elle est une métadonnée légitime.

Sans cela, « ZETIS est plus réactif » resterait une impression. Les chiffres avant/après se
consignent dans `MEMORY.md`.

#### 🔴 Les mesures, faites le 2026-08-15 — et elles déplacent le diagnostic

Machine du commanditaire, Ollama et Piper réels, énoncé de 4,3 s, meilleur de 3 passes :

| Maillon | Avant | Après | Part |
|---|---|---|---|
| STT (Whisper `small`, int8, CPU) | 1,23 s | **1,00 s** | 9 % |
| 🔴 **Moteur** (`qwen3.6:35b-a3b`, un tour, JSON forcé) | **9,41 s** | 9,41 s | **83 %** |
| TTS (Piper) | 0,70 s | *sort du chemin critique* | 6 % |
| **Temps au premier mot** | **≈ 11,3 s** | **≈ 10,4 s** | |
| **Temps au premier signe pour Massimo** | **≈ 11,3 s** | **≈ 1,0 s** | |

**Trois enseignements, dont deux corrigent ce cadrage :**

1. 🔴 **Le décodage glouton rapporte ~20 %, pas « 2 à 3 fois »** comme l'annonçait le §5.3. La
   transcription reste **identique au mot près**. Le gain est réel et gratuit, mais petit.
2. 🔴 **Le STT n'a jamais été le goulot. Le moteur l'est, à lui seul 83 % de l'attente.** La
   question posée — *« comment rendre ZETIS plus réactif ? »* — trouve donc sa vraie réponse
   ailleurs que là où le chantier la cherchait. C'est précisément ce que le §6 existait pour
   découvrir, et il l'a découvert **avant** qu'on optimise au jugé.
3. **Le gain qui compte n'est pas dans le débit, il est dans la perception.** Massimo passe
   d'aucun signe pendant 11 s à sa propre phrase affichée en 1 s. Le chiffre à retenir n'est pas
   le total, c'est celui-là.

**Conséquence pour la suite** : la vraie latence de ZETIS se traite sur le maillon moteur —
réponse plus courte (§7 le prévoit déjà), streaming du texte, ou modèle plus petit pour le tour
conversationnel. Aucun de ces trois n'est dans ce chantier ; ils sont désormais **nommés et
chiffrés** pour le prochain.

⚠️ **Et cela renforce le risque du §9** : élargir le contexte injecté part d'une base à 9,4 s,
pas d'une base neutre. Le budget du cours devra être choisi en le mesurant, jamais en l'estimant.

### §7 — ZETIS répond : le serveur ancre, il ne croit jamais le modèle

**Une seule passe LLM par tour.** Le contexte canonique est déjà pré-injecté par `resolve_skill`
(embeddings, pas de LLM) ; une seconde passe n'achèterait rien et doublerait le temps-au-premier-
mot au pire endroit d'une chaîne série. Ce qui ressemble à une décision d'architecture est déjà
tranché par le code existant.

Le schéma de sortie gagne un champ `answer {is_question, used_source}`, à côté de
`declared_difficulty` — le précédent exact du dépôt (`adr-0026`, point ouvert n°1 : « le
classifieur est une sortie structurée du moteur »).

🔴 **`used_source` n'est jamais cru.** Le serveur sait ce qu'il a injecté et calcule lui-même le
`grounding`, comme `eli5/service.py` calcule `lesson_id`/`sources_used` depuis `ctx` et jamais
depuis la sortie du modèle. La déclaration ne sert qu'à **détecter le mensonge** : si le modèle
annonce « d'après le cours » alors qu'aucune leçon n'a été injectée, le serveur pose
`grounding = aucune` et trace `source_mismatch`. C'est le patron `reports._anchor()` que
l'`adr-0027` §1 cite déjà.

**Ancrage : le cours canonique d'abord, le RAG en repli, le refus honnête sinon.** Le cours seul
ne suffirait pas — le seuil de résolution est à 0,72 et un enfant ne formule pas ses questions
comme un intitulé de programme ; ZETIS refuserait de répondre les trois quarts du temps et la
fonction paraîtrait cassée.

### §8 — Le refus honnête réutilise le chemin existant, et n'en crée aucun

`is_question` + `grounding == aucune` devient le **troisième déclencheur** de demande de
contenu, par `_maybe_request_content` qui existe déjà (best-effort, SAVEPOINT compris). **Zéro
plomberie neuve.** C'est l'élargissement annoncé au §1.

### §9 — Le contexte est priorisé, et la règle d'autorité n'est jamais tronquée

Ordre et budgets : **cours** (troncature **par paragraphe**, jamais en plein mot) → **extraits
RAG** (chunks entiers seulement, on en retire, on n'en coupe aucun) → **règle d'autorité**
(posée après la troncature, donc jamais coupée) → **rappel** (sacrifié en premier).

`chat_context_token_budget` **change de sens** : il ne borne plus tout le bloc mais le seul
rappel. Sa documentation doit changer avec lui, sinon la constante ment.

Côté RAG, `retrieve_for_skill` **jette la distance et la provenance** alors que les colonnes
existent toutes. On ajoute `retrieve_with_provenance` et **`retrieve_for_skill` délègue** — un
seul prédicat de récupération, aucun de ses six appelants ne change de comportement. Un plancher
de distance écarte les chunks faibles : **ZETIS ne répond jamais sur du RAG faible.**

⚠️ **Le filtre par niveau est exposé mais désactivé.** `RagChunk.level` est nullable ; filtrer
dessus viderait silencieusement le RAG de tous les chunks sans niveau. Condition d'activation :
un audit montrant que la quasi-totalité des chunks en portent un.

⚠️ **Tension assumée avec le §5** : élargir le contexte allonge la génération. Les deux arcs
tirent en sens inverse sur la latence — d'où la mesure du §6, qui sert aux deux.

### §10 — L'interrogation orale : ce qu'on réutilise d'ELI5, et ce qu'on refuse

`eli5.reverse_evaluate` est le précédent le plus proche. **On reprend la forme de la tâche et le
garde-fou de vocabulaire ; on ne reprend aucun de ses effets de bord** — ni `award_xp`, ni
l'upsert `SkillMastery`, ni le `LearningEvent` probant, ni surtout `schedule_review(back=…)`,
qui écrit **le texte de l'enfant** au dos d'une carte SRS, en base, durablement. Le reproduire
dans le chat serait la violation la plus directe possible du §1 de l'`adr-0026`.

Le mode reverse d'ELI5 est un **dispositif de mesure** ; l'interrogation du chat est un
**entraînement conversationnel**. Ce n'est pas la même chose.

**Mécanique** : entrée par `intent.kind = start_recall`, **gate emprunté à `resolve_panoply`**
et jamais redérivé (précédent direct : le filtre « ELI5 seulement si cours validé » a dû être
**supprimé** d'`actions.py` le 2026-08-01 parce qu'il dupliquait une règle). **Pas de cours →
pas d'interrogation** : sans source, ZETIS inventerait les questions *et* les corrections.

**Trois questions, et c'est le SERVEUR qui arrête** — un modèle qui décide quand cesser
d'interroger ne cesse pas. Trois sorties, dont deux existent déjà : « stop » à la voix, le bouton
de sortie du bloc `.chat-offer`, la clôture de session. **ZETIS n'insiste jamais** (`adr-0026`
§4). Si Massimo part sur autre chose, l'interrogation se clôt proprement — on ne retient pas un
enfant dans une boucle.

**L'état vit dans une seconde clé Redis** (`chat:{student}:{session}:recall`), écrite par les
mêmes primitives : même TTL glissant, même purge à la clôture. Il porte des **étiquettes**, pas
des textes ; les réponses de Massimo transitent et ne sont jamais accumulées.

### §11 — 🔴 Ne jamais dire « faux » à tort : quatre garde-fous déterministes, un dans le prompt

1. **Vocabulaire de verdict fermé à quatre valeurs, dont aucune n'est binaire** : `ok`,
   `partiel`, `a_revoir`, `a_reformuler`. **Il n'existe pas de valeur « faux ».** Une valeur
   inconnue retombe sur `a_reformuler` — **le doute profite à l'enfant par construction**, pas
   par bonne volonté.
2. **Clause de doute de dictée** dans le prompt : homophones, accents manquants et mots tronqués
   sont des **artefacts de transcription, jamais des erreurs de Massimo**. D'autant plus vrai
   après le passage en décodage glouton (§5.3).
3. **Plancher de longueur, sans LLM** : sous un seuil, **aucune évaluation n'est demandée** ;
   ZETIS redit la question autrement. Une dictée ratée ne produit jamais de verdict.
4. **La correction vient du cours, pas du modèle.** C'est aussi ce qui justifie le gate du §10.
5. `_sanitize` s'applique à chaque réplique.

🔴 **`a_revoir` redonne toujours l'information correcte, tirée du cours.** Une interrogation qui
dit « pas tout à fait » sans redonner la réponse est une évaluation, pas un apprentissage — et
`CLAUDE.md` exige l'explication avant l'exercice, la récupération active et les mini-victoires,
jamais la sanction.

### §12 — Ce que l'interrogation NE produit PAS — et ce qu'on perd

**Zéro XP, zéro écriture `SkillMastery`, aucun `event_type` neuf.** L'`adr-0026` §2 et §3 ne sont
**pas** révoqués.

Motif : c'est la mesure la moins fiable du dépôt — un transcript Whisper d'une phrase d'enfant,
jugé par un modèle local, sur un verdict à quatre valeurs. La rendre probante polluerait en
cascade missions, galaxie, `Gap`, deck SRS et Conseil de classe. L'`adr-0048` (« ZETIS doute de
sa propre mesure ») pointe la même direction.

On réutilise `chat_tool_response{tool_type:"interro_orale"}` à l'**ouverture** : c'est un
**acte** (Massimo a accepté d'être interrogé), c'est le sens exact de cet `event_type`, et cela
ne demande ni migration ni type nouveau.

🔴 **Ce qu'on perd, écrit ici pour que personne ne le redécouvre comme un oubli** : un effort réel
de récupération active ne laisse **aucune trace de sa qualité**. Papa voit « il a accepté d'être
interrogé sur les fractions », jamais « deux sur trois ».

**Un seul point effleure un contrat gelé** : `build_canonical_sections` (`adr-0011`) gagne des
paramètres de troncature **optionnels à défaut neutre**. Le gel porte sur *ce qui est composé et
dans quel ordre*, pas sur l'absence de bornes ; aucun appelant existant ne change de
comportement. Tronquer côté chat recréerait une seconde définition de « comment couper un
cours » — c'est précisément ce que le contrat partagé évite.

### §13 — Les deux tables de routes : un contrat de grammaire, pas une troisième copie

Elles ne peuvent ni fusionner (le serveur n'importe pas de TypeScript, le front ne fera pas un
aller-retour réseau par clic sur `/galaxy`), ni rendre des chaînes identiques (le front décore
d'un rétrolien `&from=`, **le chat ne le doit pas** — il vient de `/chat`, pas d'une matière).

`packages/types/src/notionRouteContract.json`, écrit **à la main**, porte une fixture et les
routes attendues par id et par matière. Chaque implémentation a son test de parité. **Ce n'est
pas une règle écrite à deux endroits** — rien ne le lit en production : c'est un **oracle de
test**, extérieur aux deux implémentations. Le dépôt interdit la première chose ; il ne s'interdit
pas la seconde.

🔴 **Il s'écrit à la main, jamais généré depuis l'une des deux tables.** Dérivé de l'une, il
certifierait le bug : les deux suites passeraient à jamais, sabotage compris. Le premier run se
fait avec un contrat volontairement faux, pour **voir** les deux suites rougir.

Ligne de partage : **le contrat porte le ciblage, chaque surface porte sa décoration.**

### §14 — 🔴 `revision` reste au grain matière, et ce n'est pas un repli

`ReviewDeck` vaut `mix_day | mix_flash | {subject} | {chapter}` : le grain le plus fin du SRS est
le **chapitre** (`adr-0049`), pas la notion. Et le deck chapitre sert des cartes **non dues**
(sémantique « avant un contrôle »), différente de `revision.available` (cartes dues). **Six
activités sont adressables par id, pas sept.** L'écrire ici évite qu'on le relise comme un
manque.

### §15 — La levée du « hors lot », et le test qui se retourne au lieu de disparaître

L'addendum `adr-0026` §2 écartait `quiz` et `capsule` de l'annonce **parce que `_notion_route`
n'avait pas leurs branches** — « Pas de route ⇒ pas de carte ⇒ pas d'annonce ⇒ pas de tampon ».
Le §A2 leur en donne : la cause tombe, la conséquence aussi.

🔴 `test_quiz_et_capsule_ne_sannoncent_pas_faute_de_route` est **retourné et renommé**, avec la
date et le numéro de cet ADR dans sa docstring — **jamais supprimé**. Un test modifié pour
passer est une régression masquée (`WORKFLOW.md` §2.4). Et le **verrou n°8 reste strictement
intact** : c'est lui, et lui seul, qui garantit que la levée n'a pas été payée en fabriquant les
routes sur place.

### §16 — Le repli `cours` est révoqué, le déclencheur qu'il masquait est promu

L'addendum `adr-0027` imposait `.get(tool, "cours")` en défendant **deux choses distinctes**,
qui ont été confondues :

- **« la promesse doit être tenue »** — une note « je le note » sans écriture est un mensonge.
  **Reste vrai, et tient sans le repli** : sur un outil halluciné par le LLM, on **ne promet
  pas**. La note perd son « — je le note », aucun signal n'est émis. ZETIS devient honnête *et*
  silencieux, au lieu d'honnête et menteur.
- **« le cours est la porte des dérivés »** — **reste vrai aussi, mais c'est le déclencheur
  « notion vide », pas le repli.** Le repli faisait ce travail **par accident, un cas sur deux**.
  Il est donc **promu** : étendu à la branche « contenu absent ». Sur une notion vide, demander
  le quiz émet **deux** lignes (`quiz` + `cours`) ; sur une notion pleine, une seule.

`blocked_reason` ne remplace pas ce déclencheur : il dit *« ça ne produira rien »*, jamais
*« voici quoi faire d'abord »* — et la demande `cours` est actionnable en un clic dans la file de
Papa. De plus, pour `quiz`, `blockers_for` connaît un chemin où la notion vide n'est **pas**
bloquée (`adr-0042`) : le verdict seul ne suffirait pas.

### §17 — Le prompt fait partie de la livraison, sinon rien n'existe

`CHAT_TOOL_TYPES` n'a que quatre valeurs et le prompt n'enseigne que cinq outils. Sans y ajouter
`quiz` et `capsule`, « ouvre-moi le quiz sur les fractions » ne produira **jamais** `tool=quiz`.
C'est le mode d'échec le plus coûteux du chantier : **une slice livrée, testée verte, et sans
aucun effet**.

Au passage, `CHAT_PROMPT_VERSION` est importé par le service et **n'est écrit nulle part** : la
version du prompt entre dans la trace. C'est une métadonnée, jamais un message — le §1c est tenu,
et l'exigence « prompt versionné + trace d'exécution » de `CLAUDE.md` cesse d'être honorée à
moitié.

### §18 — 🔴 L'`adr-0026` §1c est reformulé

Sa lettre parlait du pipeline `ai_jobs` **du tour de chat**. Le verrou l'a implémentée
littéralement (`job_type == "chat_turn"`) et la fuite est passée à côté. Nouvelle formulation :

> **Aucun `ai_jobs`, de quelque `job_type` que ce soit, émis depuis une surface de chat, ne porte
> un texte de Massimo.**

Le verrou est élargi en conséquence, et une route de dictée dédiée au chat
(`POST /api/student/chat/transcribe`, `require_child`) rend la trace aveugle au contenu. Elle est
aussi l'endroit où se posent les réglages de vitesse du §5 — **un seul geste, deux problèmes.**

**L'existant est soldé, pas seulement le code** (2026-08-15). `scripts/purge_chat_verbatim.py`
retire la clé `transcript` des lignes déjà écrites. Il **efface la clé, pas la ligne** : le
`job_type`, la durée et la taille de l'audio survivent — la trace d'exécution qu'exige
`CLAUDE.md` §Règles IA. La règle est *« aucun `ai_jobs` ne porte un TEXTE de Massimo »*, pas
*« aucune dictée n'a eu lieu »*.

Passé sur la base de **dev** : 78 lignes, du 4 juillet au 14 août, vérifiées à zéro après coup.
⚠️ **La production reste à traiter** — le script est fait pour ça, bilan par défaut et écriture
sur `--apply` seulement.

### §19 — 🔴 Addendum du 2026-08-15 (au micro) : sans notion, on cherche dans les COURS

Le §9 posait la cascade *cours → RAG → refus honnête*, et le §7 la contrainte d'ancrage. Les deux
sont suspendus au **même point de départ** : `resolve_skill`, qui vectorise le message **entier**
et le compare aux noms de notions. Le chantier n'avait jamais interrogé ce qui se passe quand ce
point de départ se tait.

Au micro, sur *« explique-moi la différence entre le narrateur et le personnage principal »* :
deux notions dans une phrase, la similarité se dilue, **aucune** ne passe le seuil de 0,72. Sans
notion, pas de matière ; sans matière, pas de contexte canonique et pas de repli RAG. ZETIS a
répondu *« je ne l'ai pas encore dans tes cours »* — **alors que le cours sur le Narrateur existe
et est validé**. Le refus honnête du §8 s'est retourné en affirmation fausse.

Trois corrections, dans cet ordre, et **chacune répare autre chose** :

1. **Le repli RAG cherche toutes matières confondues** quand aucune notion ne résout. Il était
   indexé sur la matière de la notion résolue : mort exactement là où le §9 le voulait. Le
   plancher de distance devient le seul garde-fou — c'est sa raison d'être.
2. **Un second refus, distinct** — `NOTE_NOTION_INCERTAINE`. *« Je n'ai pas identifié de quoi tu
   parles »* et *« je n'ai pas ce contenu »* sont deux choses différentes, et la seconde est une
   affirmation que le serveur **n'est pas en position de faire** quand la première est vraie.
3. 🔴 **Le vrai correctif : on cherche dans les cours validés eux-mêmes.** Le RAG ne pouvait pas
   en tenir lieu — **il n'indexe que les sources ingérées, jamais les cours**. Un dépôt dont les
   cours n'ont pas été ingérés comme sources aurait obtenu le refus poli au lieu de la réponse.

`lesson_resolution.lesson_matching_text` répond à la question **inverse** de celle du module :
*de quel cours validé cette phrase parle-t-elle ?* Aucun embedding, donc rien à diluer — elle
regarde ce que les cours **s'appellent**. Elle vit dans ce module et pas dans `chat/` pour la
raison de l'`adr-0037` : le périmètre (année active, chapitre validé) n'existe qu'à un endroit.
C'est le même précédent qu'`ordered_chapter_skill_ids`, qui y héberge déjà la traversée inverse.

**La porte d'entrée est le titre du cours ou le nom d'une de ses notions ; le contenu ne fait que
départager.** C'est le garde-fou, et il est plus important que la fonction : « différence »
apparaît dans n'importe quel cours de maths, et ancrer ZETIS dessus le ferait répondre à côté
**avec l'aplomb d'une source validée** — strictement pire que le refus qu'on répare. Le contenu
ne peut donc jamais élire un cours à lui seul. Effet de bord heureux : sans candidat par le
titre, aucun `content_markdown` n'est chargé.

*Ce qu'on ne prétend pas régler* : une question qui n'emprunte aucun mot au titre du cours reste
sans ancrage, et ZETIS demande de préciser. C'est le comportement voulu — le §7 tient.

### §20 — Addendum du 2026-08-15 (relecture visuelle) : ce qu'on propose doit être VU

La relecture visuelle attendait un **débordement horizontal** du menu passé à six boutons — le
panneau voisin déborde déjà de 94 px en 390 px. Mesuré dans le DOM à 375 px : `scrollWidth ==
clientWidth == 301`. **Zéro débordement** ; les boutons s'empilent en colonne, la crainte était
sans objet.

Le vrai défaut était perpendiculaire, et personne ne le cherchait : le menu était rendu **788 px
sous le pli** d'un écran de 812 px. Présent dans le DOM, cliquable, tracé côté serveur —
**jamais vu**. `ChatPage` n'a jamais eu la moindre logique de défilement, et ça tenait tant que
ZETIS ne répondait qu'une ligne. **C'est le §7 qui l'a cassé** : lui apprendre à répondre au fond
a fait grandir le karaoké jusqu'à occuper tout l'écran et pousser dehors ce qui le suit. Une
porte ouverte sur du vide, cette fois par le bas — et le seul défaut de ce chantier qu'aucun test
ne pouvait voir, parce que jsdom ne mesure rien.

Une ancre en fin de rendu, amenée sous les yeux quand un bloc **apparaît** — jamais sur `words`,
qui grandit mot à mot et arracherait la lecture. `block: "nearest"` ne déplace rien quand le bloc
est déjà visible : un tour qui n'a rien à proposer ne fait pas sauter la page.

⚠️ **Ce que le test ne prouve pas, et le dit** : jsdom ne mesure aucune géométrie, donc le verrou
observe qu'on *demande* le défilement, pas que le bloc devienne visible. La visibilité réelle a
été vue à l'écran, en 375 px. C'est la cinquième fois dans ce dépôt qu'un défaut n'existe que
pour l'œil.

**Second défaut, sur le même écran** : la SEULE sortie visible d'une interrogation — « On arrête »
— portait la classe `chat-ghost` **seule**, alors que la règle CSS est le sélecteur **composé**
`.chat-tool.chat-ghost`. Une moitié de sélecteur ne correspond à rien : 68 px de texte nu, sans
fond, sans bordure, sans marge de clic. Un enfant qui veut arrêter ne reconnaît pas un bouton
là-dedans, et l'`adr-0026` §4 promet qu'on peut toujours partir. Une classe qui n'existe qu'à
moitié est invisible à `tsc`, à `vitest` et à la relecture de code — seulement à l'œil.

### §21 — Addendum du 2026-08-15 : le LaTeX se voit ET s'entend

Vu à l'écran : *« pour faire $1/2 + 1/3$, on ne peut pas le faire directement »*. **Deux dégâts,
pas un.** Massimo lit des dollars au milieu d'une phrase, et **Piper les prononce** — la réponse
parlée devient « dollar un demi plus un tiers dollar ». La voix est la surface principale du
chat ; corriger côté front n'aurait réparé que la moitié visible.

C'est encore le §7 qui l'a fait apparaître : un aiguilleur ne produit pas de formules, un
répondeur si.

**Deux gestes, et ils ne se remplacent pas.** Le prompt (`RÈGLE DE VOIX`) réduit à la source et
améliore la formulation — à l'essai, le moteur est passé de `$3/6$` à « trois sixièmes », ce
qu'aucun nettoyage n'aurait pu produire. Le nettoyage serveur, lui, **garantit** : une consigne
ne garantit rien, c'est la doctrine du §7 appliquée une fois de plus.

Le nettoyage vit dans `_sanitize` — le seul point que **toute** réplique traverse, tour de chat
comme tour d'interrogation. On retire les délimiteurs (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`), on
déplie `\frac{a}{b}` en `a/b`, on traduit une courte liste de commandes (`\times` → `×`). **Le
contenu survit toujours** : « 1/2 + 1/3 » se lit et se dit très bien.

⚠️ **`5 $` n'est pas une formule.** Le délimiteur LaTeX est collé à son contenu, la devise en est
séparée par une espace ; `_MATH_INLINE` l'exige. Sans cette garde, deux prix dans une phrase se
mangeraient l'un l'autre.

⚠️ La liste de commandes est **volontairement courte**. Une commande inconnue reste telle quelle
plutôt que d'être devinée : visible, donc corrigeable, au lieu d'être silencieusement déformée.

*Non traité, et nommé* : les exposants (`x^2`) restent tels quels. Ils se lisent, ils se disent
mal. À rouvrir si Massimo travaille les puissances.

## Alternatives considérées

- **Router une question de fond vers ELI5** (garder « aiguilleur »). Écartée par le
  commanditaire : ELI5 est une page, une question dans une conversation appelle une réponse dans
  la conversation. *Aurait eu le mérite de ne rien révoquer.*
- **Deux passes LLM** (récupérer puis rédiger). Écartée : le contexte est déjà pré-injecté sans
  LLM, et une seconde passe doublerait le temps-au-premier-mot d'une conversation vocale.
- **Générer un quiz à la volée pour « tester » Massimo.** Écartée : du contenu scolaire non relu
  servi à l'enfant, contraire aux règles IA du projet.
- **Faire compter l'interrogation orale** (XP, `SkillMastery`, 4ᵉ `event_type`). Écartée au §12,
  avec la perte nommée. *Reste la première chose à rouvrir si Papa réclame de la finesse.*
- **Générer le contrat de routes depuis l'une des implémentations.** Écartée au §13 : il
  certifierait le bug.
- **Un codegen TypeScript depuis le Python.** Écartée : le dépôt n'a aucun codegen, et cela
  ajouterait un artefact commité qui périme.
- **`/quiz/:id` et `/capsules/:id` en chemin.** Écartées par le §3 : `?quiz=` et `?capsule=`
  suivent le patron déjà établi et ne coûtent aucune route.
- **Vectoriser les cours pour les retrouver sémantiquement** (§19). Écartée : `Lesson` n'a aucune
  colonne d'embedding, en ajouter une demanderait une migration et un ré-indexage à chaque
  réécriture de cours — pour un repli de dernier recours. *La recherche par enseigne coûte une
  requête sur des colonnes courtes.*
- **Ingérer les cours dans le RAG pour que le repli existant suffise** (§19). Écartée : le RAG
  porte des sources *validées par Papa* avec leur provenance ; y verser les cours créerait une
  seconde copie à tenir synchrone, et le §9 aurait ancré sur un extrait là où le cours entier est
  disponible et canonique.
- **Baisser le seuil de résolution de notion** (§19). Écartée : elle règlerait ce cas en en
  cassant d'autres — un seuil bas fait résoudre n'importe quel message vers la notion la moins
  éloignée, et le §7 s'ancrerait alors **à tort** au lieu de se taire.
- **Traiter la fuite de verbatim en chantier séparé.** Écartée : on livrerait sciemment une
  fonctionnalité qui aggrave une fuite connue et mesurée.
- **Réactiver le VAD Silero pour gagner du temps.** Écartée : échec réel déjà documenté dans le
  code.

## Périmètre

**Backend** — `chat/{actions,service,store,announce,router,schemas}.py` · `prompts/chat.py`
(+ `chat_recall.py`) · `rag/service.py` · `ai/canonical_context.py` (§12) ·
`stt/{provider,service}.py` · `core/config.py` · `lesson_resolution.py` (§19, addendum).

**Frontend Massimo** — `lib/{notionRoutes,chatActions,chat,dictation,voice}.ts` ·
`pages/{ChatPage,QuizPage,CapsulesIAPage,MindmapSubjectPage}.tsx` · `pages/chat.css`.

**Partagé** — `packages/types/src/notionRouteContract.json` (neuf).

**Slices, dans l'ordre** : 0 (réactivité + fuite) → A (navigation ciblée) → B (type demandé) →
C-a (RAG) → C-b (réponse ancrée) → C-c (la source se voit) → C-d (interrogation) → C-e (elle se
voit) → docs.

## Hors périmètre (nommé)

- **La production de capsules** — une demande `capsule` arrivera avec `producible: false`
  (`REQUEST_KIND_TO_PIECE` ne la connaît pas). C'est déjà le cas via la page matière ; ne pas le
  « réparer » ici.
- **Le découpage de la synthèse vocale en phrases** — reporté, conditionné aux mesures du §6.
- **`?from=` sur `/capsules`** — la page n'a pas de rétrolien et `subjectRouteFor("capsule")`
  rend déjà `null` ; l'ajouter ouvrirait la question d'une page capsules par matière.
- **Le nettoyage des 78 lignes déjà en base** — décision de Papa, pas du chantier.
- **Le Diagnostic** — jamais routé par le chat de façon anxiogène (`navigation.md` §9).
- **L'écoute continue / VAD côté client** — un micro toujours ouvert dans la chambre d'un enfant
  est précisément ce que l'`adr-0026` rend impossible.

## Conséquences

### Positives

- Massimo obtient **la** fiche, **le** quiz, **la** capsule — pas le paquet.
- Le chat cesse d'être un aiguilleur muet sur les questions de fond, **sans cesser d'être
  ancré** : il refuse honnêtement plutôt que d'inventer.
- La boucle se ferme mieux : quiz et capsule peuvent enfin être **annoncés** quand ils arrivent.
- Papa lit **ce que son fils a demandé**, plus une traduction.
- Une fuite de vie privée mesurée (78 lignes) est refermée, et le verrou qui l'a laissée passer
  cesse d'être aveugle.
- Le temps-au-premier-mot baisse d'un maillon entier, sans toucher au backend.
- L'invariant « une seule fabrique de routes » devient vrai **en lettre**, pas seulement en
  esprit.

### Négatives / risques

- 🔴 **Le décodage glouton peut dégrader la transcription d'un enfant.** À valider à l'oreille
  sur de vraies phrases de Massimo, jamais sur une voix de synthèse. Repli : `beam_size=2`, pas
  le retour à 5.
- 🔴 **Le modèle répondra de mémoire malgré le prompt.** Le détecteur du §7 attrape la
  déclaration mensongère, pas la réponse non ancrée déclarée honnêtement. Mitigation à trancher
  en recette : quand il n'y a aucun ancrage et que c'est une question de fond, le serveur
  **remplace** le `reply` par la note honnête composée serveur.
- **Le plancher de distance RAG** est le seul garde-fou contre un ancrage sur un chapitre voisin
  — la recherche est à l'échelle de la matière. À calibrer sur les vraies données.
- **Le quota de session** : trois questions consomment trois tours ; une interrogation lancée en
  fin de conversation peut buter sur le 429 en plein milieu.
- **Le menu du chat peut passer de 5 à 7 boutons**, jamais vu à l'écran, et le panneau voisin
  déborde déjà de 94 px en 390 px.
- **Le chantier est gros et rompt le mono-chantier du `WORKFLOW.md`.** Arbitré par le
  commanditaire le 2026-08-15, après signalement. La révocation du §1 se décide donc dans la
  session qui en profite — c'est exactement ce que le rituel des deux sessions cherche à éviter,
  et c'est assumé ici.

## Le signal qui dirait qu'on s'est trompé

- Massimo **arrête de parler à ZETIS** après la mise en service de la réponse de fond : le
  signe qu'il obtient des réponses creuses ou fausses, et qu'il a cessé d'y croire.
- Papa voit arriver dans sa file des demandes `cours` **en doublon systématique** de chaque
  demande de dérivé : le déclencheur du §16 aurait été étendu trop largement.
- Une réponse de ZETIS **contredit un cours validé** : l'ancrage ne tient pas, et le §2 doit
  devenir un refus par défaut plutôt qu'une consigne.
- L'interrogation orale rend `a_revoir` sur des réponses justes mal transcrites : le §11 n'a pas
  suffi, et le plancher doit monter.
- Le temps-au-premier-mot **n'a pas bougé** malgré la slice 0 : le goulot était ailleurs, et les
  mesures du §6 le diront.

## Suivi

Tests-verrous, avec le **sabotage** qui doit les faire rougir — joué pour de vrai, pas seulement
écrit (le dépôt recense plusieurs verrous verts sur un sabotage) :

1. **Aucun `ai_jobs`, quel qu'en soit le `job_type`, ne porte un texte de Massimo** — sabotage :
   rebrancher le front sur `eli5_transcribe`. ⚠️ Ce test doit rougir **avant** la slice 0 : c'est
   le bug vivant.
2. **`duration_ms` d'une tâche STT mesure le traitement** — sabotage : y remettre la durée de
   l'audio.
3. **Parité serveur ↔ contrat** pour les 7 outils × {id présent, absent} — sabotage : remettre
   `cours` au grain matière ; échanger `fiche_id` et `lesson_id`.
4. **Parité front ↔ contrat**, décoration écrite en clair dans le test — sabotage : retirer le
   `&from=` de `revision`.
5. **Une seule fabrique, vérifiée sur TOUT le module `chat/`** — sabotage : remettre
   `f"/subjects/{slug}"` dans `_open_subject`.
6. **`available=True` sans id ⇒ repli matière, jamais `?quiz=None`** — sabotage : interpoler
   sans tester.
7. **Le type demandé est le type demandé** — sabotage : remettre `.get(tool, "cours")`.
8. **La porte s'ajoute, elle ne remplace pas** : notion vide + `tool=quiz` ⇒ deux lignes —
   sabotage : ne poser que le premier signal.
9. **Un outil halluciné ne promet RIEN** — sabotage : garder « je le note » sans le repli.
10. **Le cours survit au budget, le rappel est sacrifié en premier, la règle d'autorité est
    présente** — sabotage : remettre la troncature sur la concaténation.
11. **`grounding` est calculé serveur** — sabotage : le recopier depuis la sortie du modèle.
12. **Pas de cours → pas d'interrogation** — sabotage : ouvrir sur des extraits seuls.
13. **Un verdict inconnu retombe sur `a_reformuler`** — sabotage : le mapper vers `a_revoir`.
14. **Zéro XP, zéro `SkillMastery`, aucun `event_type` neuf** après une interrogation complète.
15. **L'état de recall meurt avec la session** — sabotage : oublier la seconde clé dans
    `close_session`.
16. **Quiz et capsule s'annoncent** (test retourné, §15) — et le **verrou n°8 reste vert sans
    modification**.
17. **La source est affichée, jamais parlée** — sabotage : la concaténer au `reply` avant la
    synthèse.
18. **§19 — sans notion résolue, un cours validé ancre quand même la réponse** — sabotage :
    retirer `lesson_matching_text` de `_contexte_sans_notion` (`grounding` retombe à `aucune`).
19. **§19 — le CONTENU seul n'élit jamais un cours** — sabotage : rendre éligibles les
    correspondances de contenu. 🔴 C'est le verrou qui rend le §19 sûr, pas celui qui le rend
    utile : sans lui, ZETIS répond à côté avec l'aplomb d'une source validée.
20. **§19 — le périmètre du chat est celui de `lessons_by_skill`, plus `validated` et cours
    rédigé** — sabotage : accepter un brouillon (le gate de Papa serait contourné par le chat).
21. **§20 — un bloc qui apparaît est amené sous les yeux** — sabotage : retirer le `useEffect`,
    ou le brancher sur `words` (il défilerait à chaque mot du karaoké).
22. **§20 — un tour sans rien à proposer ne déplace pas le regard** — sabotage : défiler
    inconditionnellement.
23. **§21 — aucun LaTeX ne parvient à Massimo, et le contenu survit** — sabotage : retirer
    `_sans_latex` de `_sanitize`, ou le poser côté front (le verrou resterait vert pendant que la
    voix continuerait de dire « dollar »).
24. **§21 — `5 $` n'est pas une formule** — sabotage : retirer les gardes d'espace de
    `_MATH_INLINE`.
25. **§20 — la sortie d'une interrogation RESSEMBLE à un bouton** (`chat-tool chat-ghost`) —
    sabotage : retirer `chat-tool`. ⚠️ jsdom ne charge pas la feuille de style : le verrou observe
    la CLASSE, pas le rendu. Il attrape exactement la faute commise, une moitié de sélecteur
    composé, et rien de plus.

⚠️ Tout test de résolution ou de **non**-résolution utilise l'embedder **crc32**, jamais
`FakeEmbeddingProvider` — non déterministe, vert une fois sur deux.

⚠️ **Vérification live au micro obligatoire** : la dictée n'a **jamais** été exercée avec un vrai
micro (dette consignée dans `MEMORY.md`). La slice 0 la solde.

⚠️ **Relecture visuelle humaine avant merge** — cinq merges du dépôt s'en sont passés, tous
regrettés.
