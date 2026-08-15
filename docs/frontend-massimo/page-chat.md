# Page Massimo — Chat ZETIS (Lot 1 : texte + avatar vivant)

> **Réf. visuelle : `mockup-page-chat.html`** (ex-`mockup-zetis-vivant.html`, maquette
> calibrée en sessions des 2026-07-29). ADR : `adr-0026` (mémoire — verbatim éphémère,
> événements typés, signal faible). **Prérequis dur : slice A backend mergée**
> (`prompt-chat-memoire-slice-a-backend.md`) — cette page consomme ses endpoints, elle
> n'en invente aucun.
> Style : glassmorphique / néon Massimo (login/Matières), wordmark Syncopate.

## Objectif

Donner à Massimo un espace de conversation avec ZETIS, incarné : un avatar qui dort, se
réveille, réfléchit et « parle » — même sans audio (Lot 1 = **texte seul**, la parole est
un karaoké de sous-titres synchronisé à l'animation). Le chat oriente vers l'existant
(rôle d'orchestrateur) ; il n'est ni un générateur de contenu, ni un réseau social, ni un
lieu où l'on reste.

Route : `/chat`.

## Ce que la maquette EST et N'EST PAS (à lire avant toute ligne)

La maquette est une **console de calibration** doublée d'une démo du langage visuel. Trois
catégories de contenu, à traiter différemment :

### 1. À reprendre tel quel (le produit)

- La **scène avatar** : PNG + rig complet (paupières, iris, mâchoire, onde spectrale) et sa
  machine à états `repos(endormi) · écoute · réfléchit · parle`, croisée avec l'axe
  éveillé/assoupi (assoupissement différé ~4 s après retour au repos, réveil sur tout
  engagement).
- Le **code d'état complet** — couleur + direction du mouvement + étiquette :
  indigo/immobile = repos · cyan/convergent = écoute · bleu électrique #2e63ff/giration =
  réflexion · **or/émission = parole (seule couleur chaude, réservée à la parole de ZETIS
  dans TOUTE l'interface Massimo — règle de design system)**.
- Les **sous-titres karaoké** mot à mot (double codage lecture/écoute, latence masquée,
  accessibilité).
- La **règle des horloges indépendantes** : chaque élément animé (iris, clignements,
  mâchoire, anneaux, étincelles) a son propre rythme apériodique et UN seul point
  d'accroche au signal principal. Toute animation future respecte cette règle, sinon
  l'avatar redevient marionnette.
- Les **constantes calibrées** (relevées sur la maquette, à figer en
  `avatar/constants.ts`, versionnées — patron des constantes de session serveur) :

  | Constante | Valeur maquette | Rôle |
  |---|---|---|
  | `AVATAR_FRAMING` | 1.13 | cadrage (borne : 1.07–1.16, au-delà le cadre de l'icône ou la coiffure sortent) |
  | `LIP_LINE` | 55.1 % | charnière de mâchoire (mesurée : sous la lèvre sup., au-dessus des dents) |
  | `JAW_MAX` | 0.024 | ouverture max (fraction du diamètre) |
  | `EYE_MAX` | 0.72 | éclat continu des iris (parole) |
  | `SPARK` | 0.9 | surtensions (amplitude + fréquence couplées) |
  | `EYES` (x,y) | 41.2 % / 57.8 % · 40.2 % | centres des iris |
  | `DROWSE_DELAY_MS` | 4200 | délai d'assoupissement |

- `prefers-reduced-motion` : **l'état reste lisible sans mouvement** (couleur + pastille +
  texte). Non négociable, testé.

### 2. Simulation à REMPLACER (ne pas recopier)

| Dans la maquette | Dans le produit (Lot 1) |
|---|---|
| `speechSynthesis` (voix navigateur) | **rien** — Lot 1 est muet ; la voix serveur (TTS provider) est un lot ultérieur. Toute API de voix navigateur est **interdite** (données vocales hors local-first). |
| Karaoké minuté par heuristique de durée de mots | karaoké minuté **assumé** en Lot 1 (pas d'audio → pas de bornes) ; garder la fonction isolée : elle sera remplacée par les bornes du TTS |
| Pseudo-analyse phonétique pilotant onde + mâchoire depuis le texte | **conservée en Lot 1** (c'est elle qui fait « parler » l'avatar sans audio) ; contrat gelé : flux `[t, ouverture, grave, médium, aigu]` — la source changera (AnalyserNode), jamais le consommateur |
| Phrase en dur (`SCRIPT`) | réponse réelle du backend |

### 3. HORS PRODUIT (à ne jamais implémenter)

- Le **panneau de calibration** entier (curseurs, boutons d'état, voix navigateur).
- Tout réglage utilisateur d'animation **sauf un** : l'interrupteur « animations réduites »
  (booléen, doublure manuelle de `prefers-reduced-motion`) — décision de session
  2026-07-29 : aucun curseur d'avatar dans aucun settings, ni Massimo ni Papa.

## L'avatar est une brique partagée

Composant dans **`@zetis/ui`** (sous-chemin dédié si le poids le justifie, patron
`@zetis/ui/mindmap`), **pas** dans `apps/frontend-massimo` : les capsules le réclameront
(différé ADR-0007 « avatar animé ZETIS »). Contrat : zéro fetch, zéro logique métier —
props `state` (`idle|listening|thinking|speaking`), `awake`, et le flux d'articulation.
Le choix Rive vs SVG (ADR-worthy, non tranché) se posera pour les capsules ; ce composant
en est le repli de référence et son contrat d'entrée doit survivre à la migration.

## Structure de la page

```txt
┌──────────────────────────────────────────┐
│ [header global — MassimoLayout]          │
│  Z E T I S            (wordmark)         │
│  ┌────────────────────────────────────┐  │
│  │  scène avatar (canvas + rig)       │  │
│  │  pastille d'état                   │  │
│  └────────────────────────────────────┘  │
│  sous-titres / transcription             │
│  [carte propositions d'outils]           │
│  ┌────────────────────────────────────┐  │
│  │ champ de saisie + envoyer          │  │
│  └────────────────────────────────────┘  │
│  « ZETIS retient les notions que tu      │
│    travailles, pas tes mots. »           │
└──────────────────────────────────────────┘
```

- **Lot 1 = clavier**, pas de micro. Le bouton micro de la maquette n'apparaît PAS (aucune
  affordance grisée « bientôt » pour une capacité vocale — on ne promet pas ce qui n'existe
  pas ; cf. doctrine ADR-0025 §10.3 sur les composers grisés).
- La **phrase de transparence** (ADR-0026 §5) est fixe, toujours visible, non fermable.

## États de la page

1. **Repos** — avatar endormi (paupières closes, halo qui respire). L'arrivée sur la page
   ne le réveille PAS ; c'est le **premier geste** de Massimo (focus du champ ou envoi) qui
   ouvre les yeux. Le contexte d'ouverture (s'il existe : notions récentes des événements
   `chat_topic`) s'affiche en chip discret APRÈS le réveil — jamais en message poussé.
2. **Envoi** — POST du message ; avatar → `listening` bref puis `thinking` (giration bleue).
   Le polling du job (patron ELI5) tourne pendant `thinking` — la latence du moteur local
   est absorbée par l'animation, c'est son rôle.
3. **Réponse** — avatar → `speaking` : karaoké mot à mot des sous-titres, onde or, mâchoire
   pilotée par la pseudo-phonétique. Un tap sur la scène **coupe** l'animation et affiche le
   texte entier (le barge-in de la maquette, transposé au texte).
4. **Proposition d'outil** (si le backend en renvoie une) — carte APRÈS la fin de la
   « parole », jamais pendant. **2 propositions max + une sortie** « Non, je réessaie tout
   seul ». Chaque réponse de Massimo (accepter/refuser) part au backend
   (`chat_tool_response` y est émis serveur) ; **navigation non-navigante en V1** si la
   cible n'est pas triviale (deep-link ELI5 `?subject=` existe ; le reste : `TODO` commenté,
   ne pas inventer de routes).
5. **Fin de session** — bouton discret « C'est fini pour aujourd'hui » → POST close (purge
   serveur). Quitter la page sans fermer est OK (TTL serveur). **Aucun mécanisme de
   ré-engagement** : pas de « reviens demain », pas de badge non-lu, rien.

## Règles UX (CLAUDe.md — interface enfant)

- **Aucune relance, aucune notification, aucun hook** — ADR-0026 §4 : la mémoire n'existe
  qu'en session ouverte. Le rappel (« la dernière fois, les fractions ») est un chip
  optionnel d'ouverture, jamais un message de ZETIS non sollicité.
- **Aucun XP affiché ni crédité** par la conversation (ADR-0026 §2).
- Vocabulaire bienveillant ; jamais « erreur », « échec », « lacune ».
- Quota de tours (429 backend) → message doux « On a beaucoup parlé ! On reprend
  demain ? » — un état, pas une punition.
- Résolution de notion échouée : ZETIS le dit honnêtement (« ça, je ne le connais pas
  encore ») — il ne promet jamais un contenu qui passe par la validation Papa (capsule,
  fiche à générer) : il **oriente vers l'existant** uniquement.
- iOS : aucun autoplay, aucun son en Lot 1 de toute façon.

## Données API (ne rien inventer, lire le code)

- `POST /api/student/chat/sessions` → `{ session_id, transparency, announcement }`
- `POST /api/student/chat/sessions/{id}/messages` → **réponse INLINE** `ChatMessageOut`
- `POST /api/student/chat/tts` → WAV (Piper local, jamais persisté)
- `POST /api/student/chat/transcribe` → `{ transcript }` (Whisper local, ADR-0059 §18)
- `POST /api/student/chat/sessions/{id}/close`
- Aucune donnée de conversation stockée côté front au-delà de l'état React de la session.

🔴 **La réponse est INLINE, et ce n'est pas un raccourci d'implémentation.** Cette section a décrit
jusqu'au 2026-08-15 un patron `{ job_id }` + polling `GET /ai/jobs/{job_id}` emprunté à ELI5 : il
n'a jamais été celui du chat, et il ne peut pas l'être — **faire transiter le verbatim par
`ai_jobs` violerait l'ADR-0026 §1c**, qui veut ce pipeline aveugle au contenu. Le polling reste
juste pour ELI5, dont la sortie est un objet destiné à être relu.

⚠️ **La dictée du chat a sa PROPRE route** (`/chat/transcribe`), et ne passe plus par celle
d'ELI5. Motif mesuré (ADR-0059) : la route ELI5 écrit le transcript dans `ai_jobs` — **78 lignes
en base au 2026-08-15**. La route du chat ne trace que la durée.

## Reporté (tracé, non planifié dans ce lot)

- STT (appui-pour-parler, Whisper local — module STT à extraire d'`eli5/`) et TTS serveur
  (provider Kokoro visé) ; le karaoké passera alors aux bornes de mots réelles.
- Streaming SSE (remplace le polling ; décision d'architecture à part).
- Barge-in audio réel, AnalyserNode → flux d'articulation réel.
- ~~Routage outils complet (mindmap, fiches, révision en deep-link).~~ → **spécifié par
  l'ADR-0027** (« chat orchestrateur »), voir §Orchestration ci-dessous.
- Migration Rive de l'avatar (ADR à ouvrir avec les capsules).
- Réglage « animations réduites » dans les réglages Massimo (peut venir avec ce lot si
  trivial, sinon suivant).

## Orchestration — naviguer & consulter l'app en langage naturel (ADR-0027)

> Étend le § « Proposition d'outils » : de « 1 outil proposé » à un **orchestrateur** qui route vers
> **N surfaces** et **affiche des données**, sans jamais halluciner une destination ni générer de
> contenu. Réf. décisions figées : `adr-0027-chat-orchestrateur.md`.

### Principe

Massimo parle/écrit en langage naturel ; ZETIS produit un **intent** que le **serveur ancre** contre
l'existant validé, et renvoie une **action** concrète (`ChatMessageOut.action`) que le front exécute :

- `navigate { route, state?, label }` — une destination **construite serveur depuis un id validé**
  (jamais une route inventée). Ex. « explique-moi les fractions » → `resolve_skill` → `skill_id` →
  `galaxy/notion/{skill_id}` → `/eli5?skill_id=<id>&name=<nom>`.
- `show_data { data, label }` — `data ∈ agenda|reviews|missions`. Le **front** récupère l'endpoint
  existant et rend une **carte inline** (le backend reste aveugle au contenu, ADR-0026 §1c).
- `null` — conversation pure.

### Comportement (décisions commanditaire 2026-07-30)

1. **Navigation modale sur l'entrée** :
   - message dit à la **voix (micro)** → ZETIS **navigue directement** (mains libres, il attend l'action) ;
   - message **écrit (clavier)** → **carte-action à taper** (« → Tes fiches de maths »), pas de saut de
     page brutal. Politique **front** (il connaît l'origine du tour).
2. **Données affichées DANS le chat** : « c'est quoi mes devoirs ? » → carte compacte (ex. « Aujourd'hui :
   maths p.42, expo SVT ») **+ bouton** « Ouvrir l'agenda → ». La question appelle une réponse, pas un renvoi.
3. **Carte-action** = généralisation du bloc `.chat-offer` : **≤ 2 propositions + une sortie**, vocabulaire
   bienveillant, une action principale.

### Adressabilité des surfaces (ce que l'action peut cibler)

| Intention | Route/action | Granularité |
|---|---|---|
| « Explique-moi X » | `/eli5?skill_id=<id>&name=<nom>` | **notion** ✅ |
| « Reconstruis la carte C » | `/mindmaps/reconstruire/<mindmapId>` | **carte** ✅ |
| « **Ma fiche** sur X » | `/fiches/<slug>?fiche=<ficheId>` | **fiche** ✅ (ADR-0059 §A2) |
| « **Mon cours** sur X » | `/subjects/<slug>/cours?lesson=<lessonId>` | **leçon** ✅ (cadre et déplie ; n'ouvre pas le volet de lecture) |
| « **Le quiz** sur X » | `/quiz?quiz=<quizId>` | **quiz** ✅ (ADR-0059 §A1) |
| « **La capsule** sur X » | `/capsules?capsule=<capsuleId>` | **capsule** ✅ (ADR-0059 §A1) |
| « Mes fiches / cours / mindmaps / quiz / révision / progression de M » | `/fiches/<slug>`, `/subjects/<slug>/cours`, `/mindmaps/<slug>`, `/quiz?subject=<slug>`, `/revision?subject=<slug>`, `/galaxy?subject=<slug>` | **matière** — le repli quand l'id manque, et la réponse juste quand la demande elle-même est de niveau matière |
| « Mon agenda / mes devoirs » | carte inline (`/agenda/week`+`splitSections`) + bouton `/agenda` | **données** |
| « Qu'est-ce que je dois réviser » | carte inline (`/reviews/summary`) + bouton `/revision` | **données** |
| « Mes missions » | carte inline (`/missions/today`) + bouton `/missions` | **données** |

🔴 **`revision` n'a AUCUN id par notion, et ce n'est pas un manque** (ADR-0059 §14) : le grain le
plus fin du SRS est le **chapitre** (ADR-0049), et le deck chapitre sert des cartes *non dues*,
sémantique différente de `revision.available`. **Six activités sont adressables par id, pas sept.**

### Les trois autres étages (complément du 2026-08-15, né d'essais au micro)

| Intention | Route | Granularité |
|---|---|---|
| « fais-moi réviser **l'orthographe** » | `/revision?chapitre=<id>` | **chapitre** ✅ |
| « mon cours sur **l'orthographe** » | `/subjects/<slug>/cours?chapter=<id>` | **chapitre** ✅ |
| un chapitre nommé, autre outil | `/subjects/<slug>?onglet=chapitres&chapitre=<id>` | **chapitre** ✅ |
| « ma **galaxie** d'histoire-géo » | `/galaxy?subject=<slug>` | **matière** ✅ |
| « j'écris **ma** fiche sur X » | `/fiches/<slug>/<lessonId>/atelier` | **leçon** ✅ |
| « montre-moi **mes fiches** » (sans préciser) | `/fiches`, `/matieres`, `/mindmaps`, `/quiz`, `/capsules`, `/revision`, `/missions`, `/agenda`, `/galaxy` | **index** ✅ |

🔴 **Le CHAPITRE était l'étage manquant**, et c'est celui dont un enfant parle le plus
naturellement. Le chat ne connaissait que les deux extrémités — matière et notion — donc
« réviser l'orthographe » proposait d'**ajouter « orthographe » au programme** alors que c'est un
chapitre de Français déjà validé.

⚠️ **Précédence, et elle est délibérée** : matière exacte → chapitre exact → notion (résolution
floue par embeddings) → matière approchée → chapitre par inclusion. Un nom **exact** bat une
similarité, parce que l'exact ne peut pas se tromper. Et l'inclusion vient en dernier : « Nombres
relatifs » contient le chapitre « Nombres », l'appliquer trop tôt détournerait une notion vers son
propre dossier.

⚠️ **`/diagnostic` reste hors routage** (ADR-0027 §3, `navigation.md` §9) : *jamais routé de façon
anxiogène*. Une décision, pas un manque — un test-verrou l'exclut nommément de l'index.

⚠️ **Une mission précise n'est pas adressable, et ne le sera pas ainsi** : l'ouvrir signifie la
**démarrer** (`POST /{id}/start`), un effet de bord qu'une navigation ne doit pas produire.
« Mes missions » ouvre la page ; le geste de commencer reste celui de Massimo.

⚠️ **La règle, en une phrase** : *id présent ⇒ route ciblée ; id absent ⇒ route de matière ; ni
l'un ni l'autre ⇒ pas d'action.* Et **le chat n'émet jamais `&from=`** — il vient de `/chat`, pas
d'une matière ; un rétrolien y serait un dépaysement. C'est la seule différence assumée avec
`notionRoutes.ts`, et le contrat de parité la traite comme une **décoration**, pas comme un écart.

**Hors v1** (tracé, non inventé) : révision-session et mission précise (cibles `location.state`,
pas d'URL) ; Diagnostic (jamais routé de façon anxiogène).

> **Historique** — jusqu'au 2026-08-15, cette table plafonnait à la matière pour la fiche, le
> cours, le quiz et la capsule, et disait « fiche exacte non ciblable ». C'était **faux depuis
> l'ADR-0054** : l'adresse `?fiche=` existait et n'était utilisée par aucune des deux tables de
> routes. Corrigé par l'ADR-0059.

### Garde-fous (repris de l'ADR)

- **Orienter vers l'existant VALIDÉ uniquement** : router seulement vers un contenu `available`
  (déclaré par `galaxy/notion`). Contenu absent → honnêteté (« je ne l'ai pas encore pour cette
  notion »), **jamais** « je te le prépare » (le contenu passe par la validation Papa) — **et ZETIS
  enregistre une demande à Papa** : la demande de contenu `{skill_id, content_kind}` est **écrite dans
  `content_requests`** (table dédiée, dédupliquée ; addendum ADR-0027) et Papa la voit en **badge sur
  la Couverture**. Deux déclencheurs : type précis manquant → `(skill, kind)` ; notion résolue mais
  vide → `(skill, cours)`. Notion **hors programme** (non résolue) → `notion_requests` (autre geste).
- **Aucune route hallucinée** : le serveur ne renvoie qu'une action construite depuis un id validé ;
  une cible non ancrable → `action = null`.
- **Aucun nouvel événement** : le geste sur une action réutilise `chat_tool_response` (zéro XP,
  non probant). **Rappel ≠ relance** : aucune action poussée entre deux sessions.
- 🔴 **Le type demandé à Papa est le type demandé** (ADR-0059 §16) : réclamer un quiz absent
  enregistre une demande de **quiz**, pas de cours. Le repli sur `cours` est révoqué ; le
  déclencheur qu'il masquait est promu — sur une notion **vide**, la demande de dérivé s'accompagne
  d'une demande de `cours` (la porte des dérivés), donc **deux lignes**. Sur une notion pleine, une
  seule. Et un outil que le moteur aurait halluciné **ne promet rien** : la note perd son « je le
  note » plutôt que d'enregistrer une demande que personne n'a formulée.

### ZETIS répond sur le fond (ADR-0059 §1, §7)

La règle « aiguilleur » est **révoquée pour la seule PAROLE de ZETIS**. Les deux autres garde-fous
de l'ADR-0027 §3 tiennent intégralement : il ne route toujours que vers du **validé**, et l'enfant
ne déclenche **aucune génération**.

- **Ancrage obligatoire** : le cours canonique de la notion d'abord, des extraits RAG en repli.
  Sans ancrage, ZETIS **ne répond pas** — il le dit et enregistre une demande de cours. Un refus
  honnête vaut mieux qu'une réponse inventée avec aplomb.
- **Le serveur ne croit pas le moteur** : c'est lui qui sait ce qu'il a injecté, et lui qui décide
  de la source affichée. Une déclaration de source contredite par le contexte est tracée comme un
  mensonge, pas rendue à l'écran.
- **La source s'AFFICHE, elle ne se parle pas** — même discipline que l'annonce d'ouverture. Une
  incise administrative dans chaque réponse casserait le rythme d'une conversation d'enfant.
- **La frontière** : ZETIS peut **dire** le fond ; il ne peut pas **écrire** de contenu durable.
  Trois questions tranchent tout cas limite — *survit à la clôture de session ? a une URL ? entre
  en base comme texte ?* Trois « non » = parole, aucune relecture requise, parce qu'il n'y a rien à
  relire : l'objet n'existe plus demain.

### ZETIS interroge à l'oral (ADR-0059 §10-§12)

« Interroge-moi sur les fractions » ouvre une interrogation : **trois questions**, à la voix, avec
la dictée déjà en place.

- **Pas de cours validé → pas d'interrogation.** Sans source, ZETIS inventerait les questions *et*
  les corrections. Le gate est celui de la panoplie, emprunté, jamais redérivé. Refus honnête +
  demande de cours à Papa.
- **C'est le serveur qui arrête**, au bout de trois questions. Un modèle à qui l'on demande s'il
  veut cesser d'interroger ne cesse pas.
- **Trois sorties**, dont deux existaient déjà : « stop » à la voix (testé **avant** tout appel au
  moteur), le bouton « On arrête », la clôture de session. **ZETIS n'insiste jamais.**
- **L'état vit dans une seconde clé Redis**, même TTL glissant, même purge. Il ne porte que des
  étiquettes ; les réponses de Massimo transitent et ne sont jamais accumulées.
- **Ne jamais dire « faux » à tort** — quatre garde-fous déterministes et un dans le prompt : un
  vocabulaire de verdict à quatre valeurs **dont aucune n'est binaire** (une valeur inconnue
  retombe sur « redis-moi autrement » : *le doute profite à l'enfant par construction*) · une
  clause de doute de dictée (homophones et mots tronqués sont des artefacts, jamais des erreurs de
  Massimo) · un plancher de longueur **sans LLM** (une dictée ratée ne produit aucun verdict) · la
  correction tirée du cours · le filtre de vocabulaire partagé.
- 🔴 **« À revoir » redonne toujours la bonne réponse**, tirée du cours. Dire « pas tout à fait »
  sans la donner est une évaluation, pas un apprentissage.
- **Aucune action pendant l'interrogation** : rien à auto-naviguer, donc aucun risque d'arracher
  Massimo à mi-question. La politique voix/clavier devient sans objet, et le front n'a pas à le
  savoir — la règle vit côté serveur.
- **Un repère, jamais un score** : « Question 2 sur 3 ». Ni compteur d'erreurs, ni pourcentage, ni
  bilan.
- **Ça ne compte pas** : zéro XP, zéro maîtrise, aucun `event_type` neuf — un seul
  `chat_tool_response` à l'ouverture, un **acte** et non une mesure. *Ce qu'on perd : Papa voit
  « il a accepté d'être interrogé sur les fractions », jamais « deux sur trois ».*

## Le retour de demande — la boucle se ferme ici (addendum ADR-0026)

`content_requests` et `notion_requests` sont les **deux seuls endroits où Massimo parle en son nom
propre**, et les deux seules boucles asynchrones qui n'avaient **aucun retour** : ZETIS disait « je
le note pour Papa », et rien ne revenait jamais. Cette section décrit ce qui ferme la boucle.

> **« Rappel ≠ relance » interdit le *push*, pas la *réponse*.** La boucle se ferme **là où elle
> s'est ouverte** : dans le chat, en **pull**, **une seule fois**.

### Comportement

- **La session naît au MONTAGE de la page**, plus au premier message. Ouvrir le chat **est** le
  geste de Massimo ; c'est le seul moment où le « contexte d'ouverture » de l'ADR-0026 §4 peut se
  dire. Le pull reste strict : hors de cette session, l'annonce n'existe nulle part.
- `POST /api/student/chat/sessions` rend `announcement: { text, actions[] } | null`. `text` est
  composé **serveur, en Python, déterministe — jamais par le LLM** (un fait, pas une génération) et
  **ne nomme aucun auteur** : « Tu m'avais demandé ta fiche sur les fractions. C'est prêt. »
- **L'annonce s'AFFICHE, elle ne se parle pas.** Un bloc : le texte, puis les cartes s'il y en a.
  Aucune synthèse, aucun karaoké, **l'avatar reste endormi** — l'arrivée sur la page ne le réveille
  pas (§États 1), et faire parler ZETIS au chargement serait un message poussé. *(Écart corrigé au
  test live du 2026-08-02 : `playSpeech` attend un `AudioContext` débloqué par un geste
  utilisateur ; au montage, la promesse ne se résout jamais et rien ne s'affichait.)*
- Les cartes portent des routes **ancrées serveur** (`_notion_route`) et `confirm=true` : une offre
  se tape, elle ne s'auto-navigue jamais. `actions` peut être **vide** — une notion tout juste
  ajoutée au programme s'annonce même quand son contenu n'existe pas encore.
- Le tap réutilise **`chat_tool_response`** — aucun `event_type` neuf, zéro XP.
- Massimo envoie un message → l'annonce s'efface. Elle a été dite.

### Ce que ça ne devient pas

- **Aucun badge, aucun compteur, aucune pastille.** Le §5 des États de la page (« pas de badge
  non-lu, rien ») reste vrai **au mot près** : l'annonce vit dans la conversation, nulle part
  ailleurs.
- **Aucune file.** Au plus **2 items nommés**, mais **tout le lot éligible est tamponné** — sinon le
  reliquat s'empile et redevient une pression. Rien ne dit jamais « et 3 autres ».
- **Auto-extinctive** : dite une fois, éteinte. Ne pas venir chercher sa fiche n'accumule rien
  (l'absence n'est pas un événement).

### Deux asymétries assumées — ne pas « compléter la symétrie »

- **Le refus n'a pas de canal.** Papa fait « Ignorer » → Massimo n'apprend rien. **Jamais.** Un
  refus est un acte parental ; faire porter le « non » par la machine l'abîme des deux côtés. Le
  dégradé correct est le silence + la redemande toujours gratuite (déjà gérée par l'idempotence
  ré-activante de `content_requests`).
- **Produire sans demande n'annonce rien.** Massimo n'a rien réclamé, il n'y a aucune promesse à
  honorer, et lui pousser du contenu non sollicité serait la relance interdite.

### Le piège, et ce qui l'évite

Dans l'inbox Papa, **« Fait » ne fait que changer un statut** — il ne prouve pas que le contenu
existe. L'annonce est donc conditionnée à la **disponibilité réelle** (`resolve_panoply`, le même
prédicat que `galaxy/notion`), jamais au statut : une demande `done` dont le contenu n'est pas
servable **ne s'annonce pas et n'est pas tamponnée**. Sans cette règle, on reconstruirait exactement
le mensonge corrigé le 2026-07-30 (`notion_panel` annonçait un cours absent).

`quiz` et `capsule` ne s'annoncent pas : `_notion_route` n'a pas leur branche. Pas de route ⇒ pas de
carte ⇒ pas d'annonce ⇒ pas de tampon. Ils redeviendront annonçables quand la branche existera.
