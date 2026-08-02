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

## Données API (slice A — ne rien inventer, lire le code)

- `POST /api/student/chat/sessions` → session
- `POST /api/student/chat/sessions/{id}/messages` → `{ job_id }` puis polling
  `GET /ai/jobs/{job_id}` (patron ELI5 existant)
- `POST /api/student/chat/sessions/{id}/close`
- Aucune donnée de conversation stockée côté front au-delà de l'état React de la session.

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
| « Mes fiches / cours / mindmaps / révision / progression de M » | `/fiches/<slug>`, `/subjects/<slug>/cours`, `/mindmaps/<slug>`, `/revision?subject=<slug>`, `/galaxy?subject=<slug>` | **matière** (fiche exacte non ciblable — l'UI le dit sans mentir) |
| « Mon agenda / mes devoirs » | carte inline (`/agenda/week`+`splitSections`) + bouton `/agenda` | **données** |
| « Qu'est-ce que je dois réviser » | carte inline (`/reviews/summary`) + bouton `/revision` | **données** |
| « Mes missions » | carte inline (`/missions/today`) + bouton `/missions` | **données** |

**Hors v1** (tracé, non inventé) : quiz par notion, révision-session, mission précise (cibles
`location.state`, pas d'URL) ; Diagnostic (jamais routé de façon anxiogène).

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
