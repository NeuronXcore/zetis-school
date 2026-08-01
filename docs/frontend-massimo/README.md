# Frontend Massimo — Documentation générale

## Objectif

Le frontend Massimo est l’interface enfant de ZETIS. Elle doit aider Massimo à apprendre sans surcharge cognitive. Elle doit être claire, motivante, visuelle et orientée action.

## Navigation principale

Sidebar desktop :

1. Accueil
2. Agenda (ADR-0025 — position assumée avant Matières : l'agenda est le **déclencheur en
   amont**, pas une étape du flux d'apprentissage. **Badge de nouveauté autorisé** depuis le
   2026-08-01, cf. addendum ADR-0025 §12 ; le compte d'items **non faits** reste interdit)
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

### Badges de nouveauté (ADR-0030)

Cinq entrées portent un compteur : **Agenda · Fiches · Capsules IA · Révision · Missions**.
Mindmaps est différé — son `POST /seen` est un **no-op en V1** (ADR-0016), c'est donc la seule
famille de dérivés sans témoin de nouveauté ; l'asymétrie est nommée, pas oubliée.

> **Un badge compte ce qui est NOUVEAU, jamais ce qui est DÛ.**
> Test : *une date qui passe sans que Massimo agisse change-t-elle le compteur ?* — **non** pour
> une nouveauté (elle naît d'un geste de Papa et meurt d'un **regard**), **oui** pour un arriéré
> (il ne meurt que par le **travail**, et grossit quand Massimo ne vient pas). La seconde colonne
> est la définition d'une relance : interdite.

Deux conséquences qui se lisent mal sans la règle :

- **Révision** consomme `new_count` (cartes **jamais révisées**), **jamais `due_count`** — servi
  par le même endpoint, à portée de main, et précisément le compteur interdit. Une carte due
  depuis cinq jours est « à revoir », jamais « en retard » (ADR-0013).
- **ELI5 n'a pas de badge** : son `new_count` est un critère de **récence** (leçon porteuse créée
  dans les 7 jours), pas de vue. Il s'allumerait sur une entrée fraîchement visitée et
  s'éteindrait sans avoir été lu. Il reste sur ses decks, en page.

Sans badge, et ce n'est pas un oubli : Matières, Cours, Quiz, Diagnostic, Ma Galaxie, Chat ZETIS,
Paramètres — aucune trace de vue, aucun contenu qui « arrive ».

Source unique : `GET /api/student/news/summary`, monté **une fois** dans `MassimoLayout`, invalidé
par `NEWS_CHANGED_EVENT` (patron `CONTENT_REQUESTS_CHANGED_EVENT`). **Aucun polling, aucune
horloge** — un compteur qui change sans que Massimo ait rien fait est une notification. Forme
`DeckDisc` : `9+`, **absent à zéro**, sans pulsation ni rouge ; ni or (réservé à ZETIS qui parle)
ni ambre (files de validation Papa).

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
- `DeckDisc` (deck circulaire : illustration matière, effet pile, anneau, badge compteur —
  son badge « ✨ nouveau » est la forme reprise à l'identique par les badges de sidebar, ADR-0030)
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
