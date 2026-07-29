# Prompt Claude Code — Agenda scolaire · Slice B frontend Massimo (ADR-0025, Lot 1)

> Périmètre : **frontend Massimo uniquement** — page `/agenda` (bande glissante, listes,
> « ce qui arrive », « à reprendre »), bandeau Accueil, navigation.
> ⚠️ **PHASE 0 (ADR-0025 §10) : Massimo LIT et COCHE, il ne saisit pas.** Le composer
> n'existe pas dans cette slice (il arrive en Lot 1 bis, derrière le flag
> `AGENDA_STUDENT_ENTRY_ENABLED`). Papa est la seule source d'items.
> Backend livré en Slice A. **Aucun appel LLM** : la saisie est explicite en Lot 1 (le
> parsing du texte libre est le Lot 2). L'écran « Préparer avec ZETIS » est le Lot 2 :
> ne le crée pas, même en placeholder cliquable.
> Ne touche pas au frontend Papa (Slice C).

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (interface enfant : une action principale par écran, aucun vocabulaire
   d'échec, aucune donnée analytique côté Massimo) ;
2. `docs/decisions/adr-0025-agenda-scolaire.md` (§2 co-édition, §3 traçabilité, §5 horizons,
   §6 règle de datation) et `docs/frontend-massimo/page-agenda.md` ;
2bis. `docs/decisions/adr-0024-zetis-galaxy-progression.md` **§4 et §5** — doctrine de
   progression **opposable et rétroactive** : pas de rouge, aucun capital perdable, aucun
   décompte de jours manqués « sous aucune forme », et la règle du contenu indisponible
   (affiché, grisé, non cliquable, libellé « bientôt » — jamais « manquant » ni « raté »).
   Elle contraint la bande (§2 ci-dessous) et le CTA « Préparer » (§4) ;
3. La **maquette validée** `docs/frontend-massimo/mockup-page-agenda-massimo.html` —
   elle fait foi pour la structure et la hiérarchie visuelle, **pas** pour le code
   (elle est en HTML/CSS vanilla ; tu produis du React + Tailwind + `@zetis/ui`) ;
4. Les **contrats réels** exposés par la Slice A (`packages/types/src/agenda.ts` et les
   routers `/api/student/agenda/*`). Si un champ diffère de la maquette : ARRÊTE-TOI et
   signale-le ;
5. Une page Massimo récente et complète (`RevisionPage` ou `FichesPage`) : conventions de
   hooks, d'états de chargement (`Spinner`, `EmptyState`), de sous-routes, de gestion du
   retour physique mobile ;
6. `docs/design/design-system.md` (§ conventions UI partagées), `MassimoLayout`,
   `MassimoSidebar`, `lib/subjectIcons.ts` (**jamais** d'emoji de matière codé en dur).

## Objectif

Massimo dispose d'un lieu unique où il voit ce que l'école lui demande, l'inscrit lui-même
en quelques secondes, s'oriente sur une semaine glissante, et anticipe les contrôles qui
arrivent — sans jamais lire un score, un retard ou un compteur.

## Travail demandé

### 1. Route et navigation

- Route `/agenda`. Entrée sidebar **en position 2**, juste après Accueil, avant Matières.
  (Contre-intuitif vis-à-vis du flux d'apprentissage, assumé dans l'ADR : l'agenda est le
  déclencheur en amont, pas une étape.)
- **Ne modifie pas la bottom bar mobile** dans cette slice. L'arbitrage « Agenda y
  entre-t-il, et à la place de quoi ? » est ouvert (`/missions` porte désormais le deck
  « Défi champion », ADR-0022 §7) et se tranche avec la réconciliation de `navigation.md`
  restée au BACKLOG. Signale-le, n'improvise pas.
- **Trois appareils, pas un** (ADR-0024 §6) : iPhone, iPad et MacBook. La saisie doit être
  confortable au doigt **et** au clavier ; la bande doit rester lisible de 380 px à desktop.

### 2. Bande glissante 7 jours (composant `AgendaWeekStrip`)

Alimentée par `GET /api/student/agenda/week`. **Centrée sur aujourd'hui : 3 jours avant,
aujourd'hui, 3 jours après.** Jamais alignée sur lundi–dimanche — le dimanche soir, l'écran
ne doit pas être un pur rétroviseur.

- Jour central : encadré + halo cyan, numéro en cyan. Seul jour marqué.
- Jours passés : **uniquement des traces positives** — 0 à 3 points allumés (`traces`),
  **sans réceptacle vide**. Un jour sans trace ne rend rien du tout : il doit être
  visuellement **identique** à un jour hors plage. Aucun gabarit de barres dont certaines
  seraient éteintes — ADR-0024 §5 interdit tout décompte de jours manqués « sous aucune
  forme », et une case grise vide en est un. Aucun point fixe affiché sur le passé.
  Une trace **ne s'efface jamais** parce que Massimo n'est pas revenu depuis.
- Jours futurs : aucune trace, pictogrammes de matière pour les points fixes ; un `controle`
  porte un anneau fuchsia.
- `plan_steps` (toujours vide en Lot 1) : prévois l'emplacement (✦ sous le jour), ne l'occupe
  pas.
- Tap sur un jour → scroll vers ses items dans la liste. **La bande est un index, pas une
  seconde liste.**

**Interdits dans la bande** : score, pourcentage, total hebdo, série/streak sous quelque
forme que ce soit, item non fait du passé, libellé sur les jours passés, bouton « + » sur un
jour vide, case grise en attente de remplissage. Un jour vide est normalement vide.

### 3. Saisie — **hors périmètre de cette slice**

Ne construis **ni composer, ni bouton « + », ni champ de saisie, ni garde-fou doublon**. Ne
laisse **aucun placeholder grisé** et **aucune mention « bientôt »** à cet endroit.

Motif (ADR-0025 §10) : ADR-0024 §4 grise du *contenu que Papa n'a pas encore produit* — l'état
du catalogue. Griser un composer griserait une *capacité retirée à l'enfant*, ce qui dit
l'inverse de la doctrine. L'ouverture de la saisie doit être un **événement positif**, pas la
fin d'une privation affichée pendant des semaines.

Ce que Massimo **peut** faire dès cette slice : **cocher** (tous les items, y compris ceux de
Papa) et **masquer**. Aucune affordance d'édition : en phase 0 aucun item ne lui appartient, et
le serveur renvoie 403.

L'ordre vertical de la page réserve la place du composer (entre la bande et les listes) sans
rien y rendre.

### 4. Listes

- **Aujourd'hui** et **Demain**, dépliées.
- **Ce qui arrive** : `GET /upcoming`. Gros chiffre neutre de décompte, jamais une jauge qui
  change de couleur. CTA « Préparer » **affiché mais grisé en Lot 1**, en appliquant les
  trois garde-fous d'ADR-0024 §4 : non cliquable, libellé « bientôt » (jamais « manquant »
  ni « indisponible »), et l'accent visuel de la carte va à ce qui est réellement faisable.
  Montrer la porte à venir a une valeur propre — elle montre le chemin ; la griser sans la
  masquer est la doctrine maison.
- **À reprendre** : items passés non faits, en ambre doux, **sans compteur**, **au maximum
  3 affichés** même s'il y en a dix. La section ne grossit pas : c'est le mécanisme
  anti-dette.

Anatomie d'un item (composant `AgendaItem`) :

- coche circulaire à gauche, **toujours actionnable par Massimo** ;
- `label` affiché tel qu'écrit ;
- métadonnées : matière · marqueur `ajouté par papa` / `complété par papa` en **émeraude**
  (la couleur de l'interface Papa — Massimo apprend le code sans explication) ;
- édition possible **uniquement** sur ses propres items (le serveur renvoie 403 sinon :
  n'affiche pas l'affordance).

### 5. Bandeau Accueil

Sur `AccueilMassimoPage`, un bandeau compact « Aujourd'hui / Demain », **3 items maximum**,
**aucune date affichée**, lien vers `/agenda`. S'il n'y a rien : une ligne calme, **jamais** « ajoute tes devoirs » — en phase 0 il ne le
peut pas, et l'y inviter serait une impasse.

**Place-le au-dessus du canvas Galaxy** (ADR-0024 §6 : l'Accueil porte le graphe global, en
`lazy()`, ~1,37 Mo). L'actionnable doit être peint et utilisable avant l'arrivée de Three.js —
ne le pousse pas sous le pli derrière un canvas qui charge.

### 6. Interdits transverses (relire avant de commiter)

- Aucun rouge, aucun « en retard », aucun « X/Y », aucun pourcentage, aucun total, aucune
  série. Registre de libellés aligné sur ADR-0024 §5 (celui de l'enfant, jamais l'échec).
- **Aucun XP à la coche** et aucune célébration sonore ou animée à la coche : le geste est
  déclaratif, il ne se récompense pas. (La célébration reste réservée aux activités prouvées.)
- Aucune notification, aucun rappel, aucun badge de compteur sur l'entrée de sidebar.
- `prefers-reduced-motion` respecté sur toute animation (non négociable).

## Hors périmètre strict (ne pas commencer)

- **Composer élève, garde-fou doublon, toute affordance de saisie ou d'édition** (Lot 1 bis).
- Écran « Préparer avec ZETIS » et sous-route `/agenda/:id/preparer` (Lot 2).
- Parsing du texte libre, étiquettes ZETIS, rattachement de notion (Lot 2).
- Vue mois, vue calendrier, scroll arrière au-delà des 3 jours de la bande.
- Toute page Papa (Slice C).

## Si tu es bloqué

Écarts probables : contrat `week`/`upcoming` divergent de la maquette ; `subjectIcons`
sans asset pour une matière (utilise le repli prévu, ne code pas d'emoji en dur) ;
convention de sous-route/retour physique différente de `/revision/session`. Signale et
attends validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé : `feat(agenda): Massimo agenda page with sliding week strip`
