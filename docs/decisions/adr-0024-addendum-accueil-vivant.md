# Addendum ADR-0024 — 2026-07-31 · Un Accueil vivant, sans cadrage de perte

## Statut

Accepté — 2026-07-31.

> Second addendum de l'ADR-0024, le jour même du premier
> (`adr-0024-addendum-galaxie-page-dediee.md`). Il **rouvre le §B** de celui-ci sur un point
> précis — le retour de la frise sur l'Accueil — et **n'ouvre rien d'autre** : le canvas 3D reste
> banni de la page d'atterrissage, la galaxie complète reste la vue de `/galaxy`, la carte-bouton
> reste statique.
>
> Il pose en revanche une **première** : la première route de `gamification` conçue pour être lue
> par Massimo au-delà d'un instantané. C'est cette décision-là qui mérite d'être écrite, pas les
> composants.

## Contexte

L'Accueil recomposé le matin même est **calme et léger** — c'était son objectif. Il est aussi
**pauvre** : hors la mission du jour, Massimo n'y lit qu'une semaine de sept cases et un compte
d'étoiles. Le user demande une page **plus vivante, avec des indicateurs plus élaborés**, et cite
en référence la **heatmap du dashboard de Papa**.

Cette référence est bloquée par trois murs **indépendants** — et c'est important, parce qu'aucun
ne se contourne en levant les deux autres :

1. **La route n'existe plus.** `GET /api/parent/activity/heatmap` a été supprimée (ADR-0028) ; la
   grille vit désormais dans l'agrégat `GET /api/parent/dashboard`, `require_parent`.
2. **La doctrine l'interdit.** `CLAUDE.md` §gamification bannit le « décompte de jours manqués,
   **sous quelque forme que ce soit** ». Une grille de 26 semaines *est* ce décompte : ses cases
   vides **sont** la mesure de l'absence, et elles s'accumulent d'autant plus qu'on s'éloigne.
3. **Un test le verrouille.** `WeekDots.test.tsx:32` — « un jour PASSÉ sans activité et un jour
   FUTUR sont rendus à l'identique ».

S'y ajoute une frontière écrite deux fois dans le code (`activity/router.py:1-7`,
`packages/types/src/activity.ts:5`) : **rien de ce tracking ne remonte dans l'interface de
Massimo** — *« un enfant chronométré travaille pour le chronomètre »*.

Le read-before-code a par ailleurs montré que **l'enfant n'a aucun historique jour par jour** :
`galaxy/timeline` est bornée à 60 jours et **creuse**, `motivation/week` ne sert que la semaine
courante, `recent` s'arrête à 5 événements. La page est pauvre parce que la **donnée** l'est.

## Alternatives considérées

- **Servir la heatmap de Papa à Massimo.** Franchit la séparation des domaines de `CLAUDE.md`,
  et livre à l'enfant une mesure d'effort. → **Écarté.**
- **Une heatmap à lui, avec les cases vides en gris neutre.** Le neutre ne change rien : ce qui
  désigne l'absence, c'est la **position** de la case dans une grille dense, pas sa couleur.
  → Écarté.
- **Une frise dense jour par jour** (un point par jour, zéro les jours sans activité). La courbe
  redescendrait à zéro à chaque absence : un cadrage de perte, sur un axe de temps explicite.
  → Écarté.
- **Ne rien ajouter, l'Accueil doit rester nu.** Défendable, mais le design-system dit de la
  surface Massimo qu'elle doit être « motivante, visuelle, feedback immédiat ». Une page qui ne
  montre jamais le chemin parcouru ne récompense rien. → Écarté.
- **Une carte du ciel + les données déjà servies.** → **Retenu.**

## Décision

### A. Un historique de **gains** n'est pas le streak déguisé — et voici pourquoi

C'est la décision dont tout le reste dépend, et elle doit être argumentée, parce qu'elle marche
sur un refus déjà écrit. `motivation/router.py:38-39` refuse de servir les semaines passées :

> *« un historique d'objectifs manqués serait le streak déguisé »*

Ce refus est **maintenu**, et la route créée ici ne l'entame pas. La distinction n'est pas de
degré, elle est de nature :

- ce que `motivation` refuse de servir, c'est **l'objectif tenu ou non**, semaine après semaine.
  Un objectif porte un **attendu** ; l'historique d'un attendu est un relevé d'échecs ;
- ce que cette route sert, ce sont des **gains obtenus**. Il n'y a **aucune notion d'objectif**
  dans `xp_events` : un XP est arrivé, ou il n'est jamais venu à l'existence. Un jour sans XP
  n'est pas un jour raté — c'est un jour dont il n'y a **rien à dire**.

Le garde-fou est **dans le contrat, pas dans l'UI** : les jours sans XP sont **omis du payload**,
jamais renvoyés à zéro. Aucun client, présent ou futur, ne peut donc dessiner une case vide à
partir de cette route : **la donnée d'absence n'existe pas**. C'est ce qui rend la décision
robuste au prochain chantier, qui ne relira pas cet ADR.

```
GET /api/gamification/history?days=90
→ { "days": [ { "date": "2026-07-29", "xp": 60 }, { "date": "2026-07-31", "xp": 120 } ] }
```

- **Dans `gamification`, pas dans `activity`.** `activity` porte une doctrine de module — rien de
  son tracking ne descend chez Massimo, et son `parent_router` est gardé au niveau du routeur. Y
  ajouter une lecture élève contredirait un texte écrit deux fois. `xp_events` est un **autre
  registre** : le grand livre des récompenses, déjà lisible par l'enfant via `/summary`.
- **Aucune minute, aucune session, aucun `event_type`.** On ne chronomètre pas l'enfant.
- **Jamais d'UNION `xp_events` / `learning_events`** (`progress.py:216-219` : double comptage).
- Fenêtre bornée serveur. **Aucune migration** — `XPEvent` porte déjà `created_at`.

### B. « Mon ciel » — la heatmap retournée

Une **étoile par jour où Massimo a gagné du XP**. Rien d'autre n'est dessiné.

- **Aucune grille, aucun axe de temps.** Les étoiles sont posées en constellation, à une position
  **déterministe dérivée de la date**. Sans axe, il n'y a **pas d'intervalle vide à lire** : c'est
  ce qui distingue cette carte d'une heatmap, et ce n'est pas un choix graphique — c'est le
  mécanisme même par lequel elle ne peut pas devenir punitive.
- **Déterministe, jamais aléatoire** : un ciel qui se réarrange à chaque visite ne serait pas le
  sien. (Contrainte accessoire mais réelle : c'est aussi ce qui le rend testable.)
- Éclat et taille ∝ XP du jour, sur la rampe indigo → cyan → blanc du §5. **Pas de rouge.**
- Légende = un **compte qui ne peut que monter** : « 34 jours d'apprentissage depuis la rentrée ».
- `prefers-reduced-motion` coupe le scintillement.

**Ce que la carte ne fera jamais** : afficher une date manquée, un « depuis N jours », une
moyenne, un objectif de jours, ou une comparaison entre deux périodes.

### C. Trois enrichissements à coût nul, par des données déjà servies

- **Derniers gains + dernier badge.** `recent` (5 événements horodatés) et `badges` sont servis
  par `GET /api/gamification/summary` — que le bandeau XP **appelle déjà sur cette page** — et
  n'étaient **rendus nulle part dans l'app**. Zéro backend, zéro requête ajoutée.
  ⚠️ `lib/gamification.ts:30-34` ne traduit que 3 `reason` : à compléter, sinon Massimo lit
  `mission_champion` en brut.
- **Pastilles de matières porteuses de leur compte.** Donnée déjà chargée par la carte Galaxie.
  Un **compte**, jamais un pourcentage ; l'ordre est celui du programme, **pas un classement**.
- **La frise revient sur l'Accueil.** `GET /api/student/galaxy/timeline`, en SVG maison.

### D. Le retour de la frise rouvre le §B du premier addendum — assumé

Le §B du 2026-07-31 matin faisait quitter l'Accueil au **canvas 3D et à la frise**, dans le même
mouvement. C'était juste pour le canvas, excessif pour la frise : le coût qu'on voulait annuler
était **Three.js sur la page d'atterrissage**, et la frise est du **SVG maison de quelques
lignes**. Elle avait été emportée par association, pas par raisonnement.

**Le motif du §B reste entier** : aucun import de `@zetis/ui/galaxy/canvas`, direct ou transitif,
et le test de budget de bundle reste le gardien de cette frontière.

⚠️ **Écart de lecture à documenter** : la série de `timeline` est **creuse** — un point seulement
les jours de progrès. `ProgressSparkline` espace ses points uniformément, donc **son axe X n'est
pas le temps**. C'est acceptable pour une courbe d'allure, à condition de ne jamais l'annoter d'une
date. Écrit ici pour que personne ne le « corrige » en croyant à un bug.

## Conséquences

**Positives**

- L'Accueil montre enfin **le chemin parcouru**, ce qu'aucune de ses versions n'a jamais fait.
- La règle d'or tient : **une seule action accentuée**. Tout ce qui est ajouté se **regarde**.
- Le refus de la heatmap est désormais **écrit et argumenté** — il n'aura pas à être redécouvert.

**Négatives, assumées**

- **Une route de plus** à maintenir, et un second lecteur de `xp_events` (dont le service actuel
  charge déjà toute la table sans `LIMIT` — dette signalée, non traitée ici).
- **Une page plus chargée.** Le gain de calme du matin est partiellement rendu ; c'est le prix
  explicite de « plus vivante ».
- **Le §B rouvert le jour même de son écriture.** Trois amendements et deux addenda sur le même
  ADR en une journée : le chantier Galaxy/Accueil aura été cadré en marchant.

## Corollaires documentaires

`page-accueil.md` (nouveaux blocs, §Données API) · maquette
`mockup/mockup-page-accueil-v3.html` · `DECISIONS.md` · `API_SPEC.md` (nouvelle route) ·
`CHANGELOG.md` · pointeur dans l'ADR-0024 § « Amendements et addendum ».

## Hors périmètre

Le contenu de `/galaxy` ; le plafond adaptatif et sa validation sur les trois appareils (dette
ADR-0024 §6) ; le chat et son héros, dont le **slot reste non rendu** ; la remontée de
`ProgressSparkline` sur la `Sparkline` de `@zetis/ui` (chantier annoncé dans `sparkline.tsx:6-9`) ;
les trois anomalies relevées au passage (`agenda_band_days_after`, `interval_days` servi à
l'élève, `XPEvent` chargés sans `LIMIT`).
