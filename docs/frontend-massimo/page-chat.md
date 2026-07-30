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
- Routage outils complet (mindmap, fiches, révision en deep-link).
- Migration Rive de l'avatar (ADR à ouvrir avec les capsules).
- Réglage « animations réduites » dans les réglages Massimo (peut venir avec ce lot si
  trivial, sinon suivant).
