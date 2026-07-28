# Page Massimo — Accueil

## Objectif

Donner à Massimo un point d’entrée simple : quoi faire maintenant, pourquoi, et quelle récompense il peut obtenir.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ ZETIS        Bonjour Massimo 👋       Niveau 7 · 1240 XP     │
├────────────┬─────────────────────────────────────────────────┤
│ Accueil    │ ┌─────────────────────────────────────────────┐ │
│ Matières   │ │ Mission du jour                            │ │
│ Cours      │ │ Renforcer les nombres relatifs              │ │
│ Diagnostic │ │ 15 min · +60 XP · Mathématiques             │ │
│ ELI5       │ │ [Commencer]                                 │ │
│ Capsules   │ └─────────────────────────────────────────────┘ │
│ Missions   │                                                 │
│ Quiz       │ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│ Progression│ │ Révision    │ │ Capsule IA  │ │ ELI5 rapide│ │
│ Mindmaps   │ │ 3 cartes    │ │ SVT 4 min   │ │ Une notion │ │
│ Chat       │ └─────────────┘ └─────────────┘ └────────────┘ │
│            │                                                 │
│            │ ┌─────────────────────────────────────────────┐ │
│            │ │ Message ZETIS                               │ │
│            │ │ Aujourd’hui, on fait court mais efficace.   │ │
│            │ └─────────────────────────────────────────────┘ │
└────────────┴─────────────────────────────────────────────────┘
```

## Sections

### Header

- Bonjour Massimo.
- Niveau global.
- XP.
- Avatar ZETIS.

### Mission du jour

Carte principale avec :

- titre ;
- matière ;
- durée estimée ;
- XP ;
- bouton commencer ;
- raison simple : “parce que cette notion revient bientôt”.

### Raccourcis

- Révision rapide.
- Capsule IA.
- ELI5.
- Continuer un cours.

### Message ZETIS

Message court, bienveillant, contextualisé — **composé SERVEUR et déterministe** (aucun LLM,
aucun aléa : deux affichages sur le même état donnent la même phrase). Le client rend `title` et
`subtitle` VERBATIM ; le `code` sert à choisir une illustration, jamais à réinterpréter le texte.

Dix codes, premier applicable : `first_visit`, `back_after_break`, `back_short_break`,
`no_goal_yet`, `goal_reached_today`, `goal_reached`, `progress_visible`, `resume_notion`,
`reviews_due`, `all_clear`. L'ordre porte une intention : ce qui est humain (te revoir) passe
avant tout compteur, et l'invitation à s'engager avant la félicitation.

**Le nombre de jours d'absence n'est JAMAIS affiché.** Il existe dans le contexte pour choisir une
illustration. Si l'appel échoue, la carte n'est pas rendue — **aucune phrase de secours** : une
phrase fabriquée côté client serait le mensonge que cette page a précisément cessé d'afficher.

### Ma semaine (régularité + engagement)

Sept cases, une par jour de la semaine courante, servies par le serveur — le client ne construit
aucune grille et ne calcule aucune date.

- **Un jour passé sans activité et un jour à venir sont rendus À L'IDENTIQUE.** Aucun signe ne
  distingue « pas venu » de « pas encore » : sinon la grille désignerait les jours manqués. C'est
  un invariant testé, pas une intention.
- `days_done` est un compte qui ne fait que monter ; le lundi il repart de zéro avec 7 cases
  vides — un départ, pas une chute. Jamais de pourcentage, jamais de « il te reste N ».
- **L'engagement est choisi par Massimo**, dans la même carte : 7 pastilles, un tap suffit. Les
  7 valeurs restent toujours actives — réviser à la baisse se fait comme réviser à la hausse,
  sans confirmation ni rappel de l'ancienne valeur.
- Rien n'est affiché quand l'objectif n'est pas atteint : le contrat serveur ne porte aucune
  donnée de manque.

## États

### Aucune mission

Afficher : “Tu n’as rien d’obligatoire maintenant. Tu peux choisir une matière ou faire une révision rapide.”

### Mission en retard

Ne pas culpabiliser. Dire : “On reprend tranquillement.”

### Très bonne progression

Valoriser : « Tu as consolidé N notions cette semaine » — **chiffre réel**. Cette phrase a
longtemps affiché une constante codée en dur (`PROFILE.consolidatedThisWeek = 3`) : ZETIS
félicitait Massimo pour un nombre qui n'existait pas.

### Retour après une absence

Accueillir sans jamais compter les jours : « Content de te revoir ! On reprend là où tu t'étais
arrêté : … ». Aucune illustration évoquant le temps écoulé (ni ⏰, ni 😴).

### Objectif de la semaine atteint

Le reconnaître une fois, dans le message. **Pas de badge** : un badge conditionné à l'engagement
rendrait l'échec visible et transformerait une déclaration d'autonomie en épreuve.

## Données API

Les quatre routes listées ici auparavant (`/progress/summary`, `/progress/xp`,
`/spaced-reviews/due`, et `/missions/today` sans préfixe) n'ont jamais existé sous ces chemins.
Les routes réelles sont :

- `GET /api/missions/today` — mission élue + sa **raison** (texte servi, jamais recomposé) ;
  `elected: null` = état serein.
- `GET /api/student/reviews/summary` — l'accueil affiche `flash_size` (plafonné serveur) et
  **non** `total_due` : un compteur de retard sur l'écran d'accueil serait la pression
  quotidienne anxiogène interdite par CLAUDE.md.
- `GET /api/student/motivation/welcome` — le message de ZETIS.
- `GET`/`PUT /api/student/motivation/week` — la semaine et l'engagement.

Les blocs sont chargés en `Promise.allSettled` : un appel qui échoue rend son bloc silencieux,
les autres restent à l'écran. **Aucun message technique n'est affiché à l'enfant.**
