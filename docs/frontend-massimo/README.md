# Frontend Massimo — Documentation générale

## Objectif

Le frontend Massimo est l’interface enfant de ZETIS. Elle doit aider Massimo à apprendre sans surcharge cognitive. Elle doit être claire, motivante, visuelle et orientée action.

## Navigation principale

Sidebar desktop :

1. Accueil
2. Matières
3. Cours
4. Révision
5. Diagnostic
6. ELI5
7. Capsules IA
8. Missions
9. Quiz
10. Progression
11. Mindmaps
12. Chat ZETIS
13. Paramètres simples

La sidebar suit le flux d'apprentissage : j'apprends (Cours) → j'ancre (Révision)
→ je me situe (Diagnostic). Icônes Lucide (chrome UI) ; Phosphor reste réservé
aux pictogrammes de matières.

Sur iPhone, convertir la navigation en bottom bar avec accès rapide : Accueil, Révision, Missions, ELI5, Profil.

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
- `DeckDisc` (deck circulaire : illustration matière, effet pile, anneau, badge compteur)
- `FlipCard` (carte de révision recto/verso, flip 3D)
- `SessionEndPopup` (fin de session à 3 paliers : célébration / encouragement / re-tour)
- `ProgressRing`
- `VoiceInputButton`
- `MindmapCanvas`

## Règles

- Une action principale par page.
- Pas de texte trop long sans découpage.
- Toujours afficher le bouton “Je continue”.
- Toujours afficher où on en est : matière, mission, étape.
- Les données analytiques détaillées restent côté Papa.
