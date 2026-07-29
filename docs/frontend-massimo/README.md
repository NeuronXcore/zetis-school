# Frontend Massimo — Documentation générale

## Objectif

Le frontend Massimo est l’interface enfant de ZETIS. Elle doit aider Massimo à apprendre sans surcharge cognitive. Elle doit être claire, motivante, visuelle et orientée action.

## Navigation principale

Sidebar desktop :

1. Accueil
2. Agenda (ADR-0025 — position assumée avant Matières : l'agenda est le **déclencheur en
   amont**, pas une étape du flux d'apprentissage. Aucune pastille de compteur : un compte
   d'items non faits contournerait par l'affichage l'invariant « non probant » du serveur)
3. Matières
4. Cours
5. Révision
6. Fiches
7. Diagnostic
8. ELI5
9. Capsules IA
10. Missions
11. Quiz
12. Progression
13. Mindmaps
14. Chat ZETIS
15. Paramètres simples

La sidebar suit le flux d'apprentissage : j'apprends (Cours) → j'ancre (Révision)
→ je me situe (Diagnostic). Icônes Lucide (chrome UI) ; Phosphor reste réservé
aux pictogrammes de matières.

Sur iPhone, convertir la navigation en bottom bar avec accès rapide : Accueil, Révision, Missions, ELI5, Profil.

> ⚠️ La bottom bar **n'a pas été touchée** par l'ADR-0025 : « Agenda y entre-t-il, et à la place
> de quoi ? » reste un arbitrage ouvert, lié à la réconciliation de `navigation.md` (BACKLOG).

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
