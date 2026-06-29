# Page Massimo — ELI5

## Objectif

ELI5 est un module central. Il doit permettre deux choses :

1. ZETIS explique une notion simplement.
2. Massimo explique à son tour pour vérifier sa compréhension.

## Modes

### Mode “ZETIS m’explique”

Massimo choisit ou écrit une notion. ZETIS répond avec :

- explication simple ;
- analogie ;
- exemple ;
- mini-question ;
- bouton “Je réexplique”.

### Mode “J’explique à ZETIS”

Massimo répond :

- par écrit ;
- en vocal STT ;
- avec une mindmap.

ZETIS évalue :

- clarté ;
- points justes ;
- points manquants ;
- prochaine phrase à améliorer.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ ELI5                                                         │
├──────────────────────────────────────────────────────────────┤
│ Quelle notion veux-tu comprendre ?                           │
│ [ Les nombres relatifs                         ] [Expliquer] │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ZETIS explique                                           │ │
│ │ Imagine une température : +3°C, 0°C, -4°C...             │ │
│ │ ...                                                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Maintenant explique à ZETIS :                               │
│ [Répondre par écrit] [Parler] [Créer mindmap]                │
└──────────────────────────────────────────────────────────────┘
```

## Feedback reverse

Exemple :

```txt
Tu as bien compris que les nombres négatifs sont en dessous de zéro.
Il manque encore l’idée de comparaison : -5 est plus petit que -2.
Mini-mission : place -5, -2, 0 et +3 sur une droite.
```

## Données API

- `POST /ai/eli5/explain`
- `POST /ai/eli5/reverse-evaluate`
- `GET /ai/jobs/{job_id}`
- `POST /mindmaps/generate`
