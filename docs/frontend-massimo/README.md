# Frontend Massimo — Documentation générale

## Objectif

Le frontend Massimo est l’interface enfant de ZETIS. Elle doit aider Massimo à apprendre sans surcharge cognitive. Elle doit être claire, motivante, visuelle et orientée action.

## Navigation principale

Sidebar desktop :

1. Accueil
2. Matières
3. Cours
4. Diagnostic
5. ELI5
6. Capsules IA
7. Missions
8. Quiz
9. Progression
10. Mindmaps
11. Chat ZETIS
12. Paramètres simples

Sur iPhone, convertir la navigation en bottom bar avec accès rapide : Accueil, Missions, ELI5, Quiz, Profil.

## Ton UX

- Phrases courtes.
- Feedback positif.
- Ne pas dramatiser les lacunes.
- Toujours proposer une prochaine action.
- Utiliser l’avatar ZETIS comme guide.

## Layout commun

```txt
┌──────────────────────────────────────────────────────────────┐
│ Sidebar ZETIS │ Header : matière / XP / avatar              │
│               ├──────────────────────────────────────────────┤
│               │ Zone principale                             │
│               │                                              │
│               │ Cartes, missions, explications, quiz         │
│               │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

## Composants clés

- `MassimoLayout`
- `MassimoSidebar`
- `ZetisAvatar`
- `XPBadge`
- `MissionCard`
- `SubjectCard`
- `Eli5Panel`
- `QuizCard`
- `ProgressRing`
- `VoiceInputButton`
- `MindmapCanvas`

## Règles

- Une action principale par page.
- Pas de texte trop long sans découpage.
- Toujours afficher le bouton “Je continue”.
- Toujours afficher où on en est : matière, mission, étape.
- Les données analytiques détaillées restent côté Papa.
