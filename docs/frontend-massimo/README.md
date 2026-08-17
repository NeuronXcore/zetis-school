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

**Dix** entrées portent un compteur : **Agenda · Matières · ELI5 · Quiz · Fiches · Capsules IA ·
Révision · Mindmaps · Missions · Diagnostic**.

> ⚠️ Ce paragraphe a annoncé « cinq entrées » et « Mindmaps est différé, son `POST /seen` est un
> no-op » pendant deux semaines après que les deux étaient faux (Mindmaps a été livré le jour même
> de l'ADR, Diagnostic le 2026-08-08, les trois derniers le 2026-08-15). **Le compte fait autorité
> dans `news/service.py`, pas ici.**

> **Un badge compte ce qui est NOUVEAU, jamais ce qui est DÛ.**
> Test : *une date qui passe sans que Massimo agisse change-t-elle le compteur ?* — **non** pour
> une nouveauté (elle naît d'un geste de Papa et meurt d'un **regard**), **oui** pour un arriéré
> (il ne meurt que par le **travail**, et grossit quand Massimo ne vient pas). La seconde colonne
> est la définition d'une relance : interdite.

Quatre conséquences qui se lisent mal sans la règle :

- **Révision** consomme `new_count` (cartes **jamais révisées**), **jamais `due_count`** — servi
  par le même endpoint, à portée de main, et précisément le compteur interdit. Une carte due
  depuis cinq jours est « à revoir », jamais « en retard » (ADR-0013).
- **ELI5** a bien un badge depuis le 2026-08-15, mais **pas** celui qu'on croit : son `new_count`
  de **récence** (leçon porteuse créée dans les 7 jours) reste inéligible et reste sur ses decks,
  en page. Le témoin de navigation est adossé à `eli5_views`, une table créée pour ça. La règle du
  §2 n'a pas été assouplie — elle a été payée (`adr-0030-temoins-nouveaute-navigation` (Amendement 3)).
- **Quiz** compte les quiz **jamais ouverts**, jamais les quiz « pas encore faits ». Ouvrir puis
  abandonner sans répondre éteint le témoin : c'est le prix de ne pas compter du travail.
- **Matières** compte les **cours** validés jamais ouverts, et rien d'autre — pas les fiches,
  capsules ou cartes, qui ont chacune leur entrée. Le cours est l'original dont elles dérivent.
  ⚠️ C'est le seul témoin **sans point zéro** : sa trace `lesson_views` est partagée avec la
  fiabilité du diagnostic et le Cahier de bord.

Sans badge, et ce n'est pas un oubli : **Accueil, Ma Galaxie, Chat ZETIS** — aucune trace de vue,
aucun contenu qui « arrive ». La partition est totale et verrouillée : toute entrée de la sidebar
appartient à exactement un des deux camps, et une 14ᵉ entrée devrait trancher le sien.

**Un seul témoin meurt du TRAVAIL** : celui du Diagnostic. C'est une exception nommée, bornée, et
la seule — `DEROGATIONS` vaut `{"diagnostic"}` et n'a pas bougé quand trois témoins ont été
ajoutés.

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

Son décor est **la galaxie de Massimo** (`HeaderGalaxy`, addendum ADR-0029 « La galaxie dans le
bandeau ») : les notions qu'il a réellement travaillées, qui poussent depuis le centre de
l'emblème comme un graphe Obsidian, **une seule fois par chargement de page** (~5,8 s), puis
**tournent lentement** (un tour en 72 s, 20 im/s), avec 24 étoiles qui scintillent et une couronne
solaire dorée qui pulse à la même horloge. Le ciel entier est dessiné : les notions à découvrir en
veilleuse, celles de Massimo vives — sans quoi la bande resterait vide à 77 %. L'emblème est à
65 % d'opacité pour qu'on voie la galaxie en sortir. Canvas 2D, **jamais de moteur 3D dans le
chrome** — c'est vérifié par `layout.bundle.test.ts`. `prefers-reduced-motion` → état final
immobile d'emblée, aucune boucle armée.

> Le décor génératif d'avant (`NeuralCubes`, `NeuralLinks`) a été **retiré le 2026-08-04** : il ne
> disait rien et maintenait 78 animations infinies sur les 21 routes. Ne pas le réintroduire
> « pour faire vivant ». `headerFx.css` ne garde que les deux halos de l'emblème.

## Composants clés

- `MassimoLayout`
- `MassimoSidebar`
- `MassimoBannerHeader` (header global : emblème + galaxie + niveau/XP)
- `HeaderGalaxy` + ses trois modules purs (`headerBandLayout`, `headerGalaxyClock`,
  `headerGalaxyRenderer`), et les deux halos restants dans `headerFx.css`
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

## Ce que Massimo lit quand ça casse (2026-08-17)

Règle **transverse à tous les écrans** — elle vit ici parce qu'elle n'appartient à aucune page.
Elle applique le `CLAUDE.md` (« Massimo ne doit pas voir : […] les informations techniques »).

- **Le message d'interface est FIXE**, écrit pour lui, et nomme ce qui n'a pas eu lieu :
  *« Tes cartes n'ont pas voulu se charger. Réessaie dans un instant ✨ »*.
- **Le détail technique part en console** — `console.warn("[zone] ce qu'on tentait", e)`. Les deux
  moitiés comptent : un message fixe qui jette l'erreur laisse qui débogue sans rien.
- **Quand c'est vrai, la phrase porte le fait qui rassure** : *« Tes réponses sont bien là »*,
  *« Ton travail est bien enregistré »*, *« Tu peux quand même écrire ta notion »*. Jamais une
  consolation inventée — chacune correspond à un état réellement préservé.

🔴 **Le motif `e instanceof Error ? e.message : "…"` est proscrit** : la phrase gentille y est la
branche MORTE (`asJson` lève un vrai `Error`), et Massimo lisait donc `Erreur 500`. Verrou de
dépôt : `apps/frontend-massimo/src/erreurs-lisibles.test.ts`.

⚠️ **Deux exceptions, et elles sont typées** : le **409** d'une étape de mission non prouvée
(`MissionRefus`) et le **422** d'une fiche incomplète (`AtelierIncomplet`). Là, c'est le serveur qui
a écrit *pour lui* — ses propres docstrings le disent. Le type est la frontière, jamais le code HTTP
lu à la volée.
