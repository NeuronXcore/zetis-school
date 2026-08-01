# Page Massimo — Agenda (cahier de texte)

> Décision : `docs/decisions/adr-0025-agenda-scolaire.md`.
> Maquette validée : `mockup-page-agenda-massimo.html` — **elle fait autorité sur la forme**
> (hiérarchie, densité, anatomie d'un item, états visuels). Cette spec fait autorité sur le
> **fond** (routes, contrats, règles, états limites). En cas de divergence : la spec l'emporte
> sur le fond, la maquette sur la forme.

## Objectif

Un lieu unique où Massimo voit ce que l'école lui demande, l'inscrit lui-même en quelques
secondes, s'oriente sur une semaine glissante et anticipe les contrôles — **sans jamais lire
un score, un retard ou un compteur** (ADR-0025 §7).

L'agenda est la première **source exogène** du produit : ses dates viennent du collège, jamais
de ZETIS (règle de datation, ADR-0025 §4).

Routes :

```txt
/agenda                     → écran principal
/agenda/:id/preparer        → écran de préparation (LOT 2 — ne pas créer en Lot 1)
```

### Accès — deux portes dès le Lot 1

> **Révisé le 2026-07-29 par le commanditaire.** Cette section prévoyait initialement l'accès
> par le seul bandeau d'Accueil en phase 0, l'entrée de navigation n'arrivant qu'avec le
> pouvoir d'écrire (Lot 1 bis). Arbitrage retenu : **les deux, tout de suite.**

1. **Entrée de sidebar en position 2**, juste après Accueil, avant Matières. Contre-intuitif
   vis-à-vis du flux d'apprentissage, et assumé : l'agenda est le **déclencheur en amont**, pas
   une étape. Ce qui vient du collège doit être atteignable sans rebond.
2. **Résumé sur l'Accueil** (« Aujourd'hui / Demain », 3 items max, aucune date), qui ouvre
   `/agenda`.

Les deux ne font pas double emploi : la sidebar est un **chemin** (j'y vais quand je le
décide), le résumé est une **information** (je la vois sans y aller).

**Badge de nouveauté autorisé sur l'entrée — compteur d'arriéré toujours interdit.**
*Révisé le 2026-08-01 : l'interdiction antérieure (« aucune pastille de compteur, sous aucune
forme ») est révoquée par l'addendum ADR-0025 §12, qui la remplace par la distinction ci-dessous.*

- **Autorisé** — un badge chiffré comptant les items **arrivés depuis la dernière ouverture**
  (`agenda_last_seen_at`, high-water mark par élève, jamais servi à Papa). Il naît d'un geste de
  Papa et meurt d'un **regard** de Massimo. Forme identique aux autres entrées (ADR-0030) :
  plafonné `9+`, absent à zéro, sans pulsation, sans rouge.
- **Interdit** — tout compte d'items **non faits**, d'échéances non cochées ou d'arriéré, sous
  quelque forme que ce soit. Il ne décroîtrait que par le **travail** et contournerait par
  l'affichage l'invariant « non probant » tenu serveur (`agenda_item_missed` n'existe pas,
  ADR-0025 §3 et §7).

Le test qui sépare les deux : *une date qui passe sans que Massimo agisse change-t-elle le
compteur ?* Arriéré : oui. Nouveauté : non.

> Le badge **ne répond pas** à « qu'est-ce que j'ai à étudier ». Il retombe à zéro dès l'ouverture
> et y reste toute la semaine, échéances en cours comprises — c'est sa définition, pas un défaut à
> corriger (addendum §12.5). Cette question est servie par le résumé d'Accueil et par la bande
> glissante ci-dessous ; aucune évolution de la navigation ne doit y répondre.

**Bottom-nav mobile : inchangée.** L'arbitrage « Agenda y entre-t-il, et à la place de quoi ? »
reste ouvert et lié à la réconciliation de `navigation.md`, restée au BACKLOG.

> ⚠️ `docs/frontend-massimo/navigation.md` porte l'avertissement **BROUILLON NON RÉCONCILIÉ**
> (modèle 5 verbes jamais confronté au code, cf. ADR-0024). **La sidebar réelle fait foi.**

> ⚠️ `docs/frontend-massimo/navigation.md` porte l'avertissement **BROUILLON NON RÉCONCILIÉ**
> (modèle 5 verbes jamais confronté au code, cf. ADR-0024). **La sidebar réelle fait foi.**
> Ne pas s'appuyer sur ce document pour placer l'entrée en phase 1 : vérifier l'existant.

## Règles UX (CLAUDE.md — interface enfant)

- Style verre Massimo (GlassPanel / NeonBackdrop, tokens `zetis-*`), pictogrammes de matière
  résolus par `lib/subjectIcons.ts` — jamais d'emoji ni de chemin d'asset en dur.
- **Aucun rouge, aucun « en retard », aucun « X/Y », aucun pourcentage, aucun total, aucune
  série.** Registre de libellés aligné sur ADR-0024 §5 : celui de l'enfant, jamais l'échec.
- **Aucun XP à la coche**, aucune célébration sonore ou animée à la coche : le geste est
  déclaratif, il ne se récompense pas (l'XP reste réservé aux activités prouvées serveur).
- Aucune notification, aucun rappel, aucun badge de compteur sur l'entrée de sidebar.
- Trois appareils, pas un (ADR-0024 §6) : iPhone, iPad, MacBook. La saisie doit être
  confortable au doigt **et** au clavier ; la bande lisible de 380 px à desktop.
- `prefers-reduced-motion` respecté sur toute animation (non négociable).

## Phase 0 — Massimo lit et coche, il ne saisit pas (ADR-0025 §10)

En Lot 1, **le composer n'existe pas** côté Massimo : Papa alimente l'agenda, ZETIS ne crée
aucun item, et la page se remplit du flux ZETIS non daté déjà fusionné dans la surface.

Massimo **coche et masque** dès le premier jour — cocher n'est pas remplir, et c'est le seul
geste qui rend l'objet sien. Sans lui, l'objet n'aurait pas d'état (Papa est en 403 sur
`done_at`).

**Aucun composer grisé, aucune mention « bientôt ».** ADR-0024 §4 grise du *contenu non encore
produit* ; griser un composer griserait une *capacité retirée à l'enfant*. L'ouverture (Lot 1
bis, flag `AGENDA_STUDENT_ENTRY_ENABLED`) doit être un événement positif, pas la fin d'une
privation affichée.

## Anatomie de l'écran

Ordre vertical imposé :

```txt
1. Bande glissante 7 jours      (orientation)
2. Composer                     (saisie — LOT 1 BIS, absent en Lot 1)
3. Aujourd'hui · Demain         (action)
4. Ce qui arrive                (anticipation)
5. À reprendre                  (rattrapage, discret)
```

### 1. Bande glissante (`AgendaWeekStrip`)

**3 jours avant aujourd'hui · aujourd'hui · 10 jours après** (14 colonnes, révisé le
2026-07-29 — cf. ADR-0025 §6). Jamais alignée sur lundi–dimanche : une bande calendaire
passerait de 6 jours d'horizon le lundi à 0 le dimanche soir, au pire moment.

L'amplitude est un **réglage serveur** : le client rend le nombre de jours qu'il reçoit, il ne
le présume jamais. Sur téléphone, la grille se replie en **deux rangées de 7**.

| Zone | Contenu | Interdits |
|---|---|---|
| jours passés | 0 à 3 **traces allumées**, sans réceptacle | point fixe, libellé, case vide |
| aujourd'hui | encadré + halo cyan, seul jour marqué | — |
| jours futurs | pictogrammes des points fixes ; `controle` = anneau fuchsia | trace, bouton « + » |

Un jour passé sans trace **ne rend rien** : visuellement identique à un jour hors plage
(ADR-0025 §7 — une case grise en attente est un décompte de jours manqués). Une trace ne
s'efface jamais.

`plan_steps` (✦ sous le jour) : emplacement prévu, **vide en Lot 1**.

Tap sur un jour → scroll vers ses items. **La bande est un index, pas une seconde liste.**

### 2. Composer (`AgendaComposer`) — **Lot 1 bis**

Absent du Lot 1. Quand il s'ouvre, il se place **au-dessus des listes** : si la saisie demande
un scroll, elle n'a pas lieu. Saisie **explicite** : champ texte (le `label`, envoyé tel quel, jamais reformaté) +
sélecteur de matière **facultatif** + date rapide (`Aujourd'hui` · `Demain` · jours à venir) +
marqueur `contrôle` optionnel.

**Garde-fou doublon, côté client** : si un item existe déjà avec la même matière et la même
date → « Il y a déjà *X*. C'est la même chose ? », deux issues, **aucune fusion automatique**.

Emplacement des étiquettes de parsing (Lot 2) prévu, non implémenté.

### 3. Item (`AgendaItem`)

- Coche circulaire à gauche, **toujours actionnable par Massimo**, sur tous les items y compris
  ceux de Papa.
- `label` affiché **tel qu'écrit**.
- Marqueurs `ajouté par papa` / `complété par papa` en **émeraude** — la couleur de l'interface
  Papa : Massimo apprend le code sans explication.
- Édition possible **uniquement** sur ses propres items (403 sinon : ne pas afficher
  l'affordance). En phase 0, aucun item ne lui appartient — **aucune affordance d'édition**.

### 4. Ce qui arrive

`GET /upcoming`. Gros chiffre neutre de décompte, **jamais une jauge qui change de couleur** :
le seul signal d'approche est l'apparition du plan.

CTA « Préparer » **affiché mais grisé en Lot 1**, avec les trois garde-fous d'ADR-0024 §4 :
non cliquable, libellé « bientôt » (jamais « manquant » ni « indisponible »), et l'accent
visuel de la carte va à ce qui est réellement faisable.

### 5. À reprendre

Items passés non faits, ambre doux, **sans compteur**, **3 affichés au maximum** quel qu'en
soit le nombre. La section ne grossit pas : c'est le mécanisme anti-dette.

## Bandeau Accueil

Sur `AccueilMassimoPage` : « Aujourd'hui / Demain », **3 items maximum**, **aucune date
affichée**, lien vers `/agenda`.

**Placé au-dessus du canvas Galaxy** (ADR-0024 §6 : l'Accueil porte le graphe global en
`lazy()`, ~1,37 Mo). L'actionnable doit être peint et utilisable avant l'arrivée de Three.js.

## Données API

Préfixe `/api/student/agenda`, tout utilisateur authentifié (rôle child inclus). Types partagés
dans `packages/types/src/agenda.ts`. Schéma élève `AgendaItemStudentOut` — **jamais de
`parent_note`**.

- `GET /week?anchor=YYYY-MM-DD` → `days[]: { date, offset, traces, fixed_items[], plan_steps[] }`.
  `traces` **uniquement** si `date <= today` (`null` sinon, jamais `0`) ; `fixed_items`
  **uniquement** si `date >= today`. **L'asymétrie est calculée serveur, jamais côté client.**
- `GET /upcoming` → `kind ∈ (controle, rendu)`, non fait, non archivé, horizon 21 jours,
  **max 4** : `{ id, label, subject, due_on, days_left, has_plan }`.
- `GET /items?from=&to=` → liste plate (alimente Aujourd'hui / Demain / À reprendre).
- `POST /items` → `created_by` forcé à `student` **côté serveur**, jamais lu du corps.
  **403 tant que `AGENDA_STUDENT_ENTRY_ENABLED` est fermé** (phase 0).
- `PATCH /items/{id}` → uniquement sur ses propres items (403 sinon), même verrou de flag.
- `POST /items/{id}/done` · `/undone` → bascule `done_at`, sur **tous** les items.
- `POST /items/{id}/dismiss` → masque un item, y compris de Papa (masquage visible côté Papa).

## États limites

| Situation | Affichage |
|---|---|
| Aucun item aujourd'hui/demain | ligne calme (« rien de noté pour l'instant »), **pas** d'encouragement à remplir |
| Aucun item du tout | la bande reste affichée (les traces passées ont du sens seules) |
| Item sans matière | rendu sans pictogramme, accent neutre — jamais bloqué à la saisie |
| Phase 0, aucun item saisi par Papa | ligne calme + flux ZETIS non daté ; **jamais** « ajoute tes devoirs » |
| Parsing indisponible (Lot 2) | item créé quand même, sans étiquette |
| Item passé non fait, > 3 | 3 affichés, les autres silencieusement omis — **aucun « et 7 autres »** |

## Hors périmètre

**Lot 1 bis** : composer élève + garde-fou doublon client, derrière le flag.

**Lot 2** : écran « Préparer », sous-route `/agenda/:id/preparer`, parsing du texte libre,
étiquettes ZETIS, rattachement de notion.

**Hors ADR** : vue mois ou calendrier ; scroll arrière au-delà des 3 jours ; import
Pronote/ENT ; saisie photo/OCR ; notifications et rappels ; fusion automatique de doublons.
