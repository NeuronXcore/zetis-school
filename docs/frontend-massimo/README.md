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
│ Sidebar ZETIS │ Header global : emblème ZETIS animé          │
│               │ (cercle + livre, cubes neuronaux, réseau de  │
│               │ connexions, halo) · avatar Massimo · niveau· │
│               │ XP (live) · Déconnexion                      │
│               ├──────────────────────────────────────────────┤
│               │ Zone principale                             │
│               │ Cartes, missions, explications, quiz         │
└───────────────┴──────────────────────────────────────────────┘
```

Le header est **global** (`MassimoBannerHeader`, monté dans `MassimoLayout`) et présent
sur toutes les pages. Il affiche le niveau/XP **en direct** (gamification, repli `PROFILE`).
Les effets sont en CSS + SVG et respectent `prefers-reduced-motion`.

## Composants clés

- `MassimoLayout`
- `MassimoSidebar`
- `MassimoBannerHeader` (header global : emblème + effets)
- `NeuralCubes` / `NeuralLinks` (effets animés du header, `headerFx.css`)
- `glass` (primitives verre/halos/dégradés extraites du login)
- `SubjectTile` (carte matière, cadre teinté par matière)
- `ZetisAvatar`
- `XPBadge`
- `MissionCard`
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
