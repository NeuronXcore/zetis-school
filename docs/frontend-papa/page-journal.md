# Page Papa — Journal de production

> Spec écrite le **2026-08-04**, au cadrage du chantier « tri et filtre ». La page existe depuis
> l'ADR-0034 et n'avait **jamais eu de spec** : les sections « Ce que la page est déjà » décrivent
> l'existant tel qu'il est dans le code, elles ne décident rien. Les sections marquées **▶ CHANTIER**
> sont ce qui reste à faire.
>
> Décisions : `adr-0034-journal-production-et-veto.md`,
> `adr-0034-addendum-regime-et-destination.md`, `adr-0034-addendum-tri-et-filtre-du-journal.md`.
> **Maquette** : `mockup/maquette-papa-journal-tri-filtre.html` — deux états de la même page
> (le filtre garde / le filtre ne garde rien), regardée et mesurée dans un navigateur.

## Objectif

Répondre à **une** question : *qu'est-ce que ZETIS a fait, et pourquoi n'a-t-il pas fait le reste ?*

Le Journal est un **registre**. Il rend compte du passé et ne le corrige jamais. Ce qui change au
présent s'**ajoute à côté** (« depuis résolu »), il ne réécrit pas la ligne.

## Principes

1. **Une ligne passée ne se réécrit jamais** (doctrine §F.4). Deux formulations de motif coexistent
   donc à l'écran, et c'est le prix assumé.
2. **On ne devine jamais un régime.** La capture prime ; à défaut, ce que les actes prouvent ; si
   rien ne prouve, on dit « non enregistré ».
3. **Aucun total, aucun ratio par provenance** (§F.2) : la provenance est un fait, elle ne se
   totalise pas. Le seul compteur légitime est celui des lots, pour la pagination.
4. **La portée est DITE.** Le Conseil de classe et la mission champion équipent hors lot ; leurs
   contenus n'y figurent pas, et la page l'écrit en tête. Un journal qui paraît exhaustif sans
   l'être est pire qu'un journal qui borne son sujet.
5. **Rien pour Massimo.** Écran de Papa, `require_parent`, aucune route élève.

## Ce que la page est déjà

### En-tête et cadre

`PageHeader` « Journal de production 📜 » + le bandeau de portée (principe 4). Un lot = un bloc,
du plus récent au plus ancien.

### Le bloc d'un lot — un en-tête qui raconte, un pli qui détaille

**Au-dessus du pli, toujours visible :**

- **l'en-tête** : statut, déclencheur, autorité, **le régime du lot** (avatar `REGIME_AVATAR`, source
  unique partagée avec la sidebar et les réglages), l'avancement, les dates ;
- **le résumé** : ce que le lot a laissé, en chiffres — « 1 à faire · 1 produit · 1 depuis résolu ».

**Dans le pli, fermé par défaut** (`Voir le contenu du lot — N pièces`) :

- **la liste des pièces**, chacune ouvrable et retirable (veto) ;
- **le détail par événement** — une ligne par pièce touchée, avec sa case d'état, son motif, sa
  destination et son éventuel « · depuis résolu ».

⚠️ **UN seul pli, et il contient les deux.** Les pièces et le détail répondent à la même question
(*qu'a fait ce lot ?*) ; deux plis imbriqués auraient demandé deux clics.

> **Corrige une description antérieure.** Cette spec a d'abord décrit la liste des pièces comme
> *« toujours visible »*, et la maquette la dessinait ainsi. C'était l'état d'avant le 2026-08-04 :
> le lot #3 alignait **33 pièces** dépliées, ce qui noyait tous les autres lots et rendait la page
> illisible — constaté à l'écran pendant le chantier production, et replié à ce moment-là.

⚠️ **C'est le repli qui a rendu le résumé nécessaire.** Une fois tout dans le pli, les cases, les
motifs et les liens y dormaient : *« je ne vois aucune checkbox »* (2026-08-04) venait de là. Le
résumé remonte au-dessus ce que Papa vient chercher — *qu'est-ce qui reste à faire ?* — sans
demander un clic par lot.

⚠️ **Conséquence pour les tests** : le contenu d'un `<details>` fermé **reste dans le DOM**. Une
assertion qui cherche un texte le trouve même replié — les assertions du résumé portent donc sur le
**chiffre** (`/\d+ à faire/`), jamais sur le mot seul.

### La case d'état

Dessinée (SVG, `currentColor`), **jamais un `<input type="checkbox">`** : un registre ne se coche
pas. Le glyphe est décoratif, le mot reste, rendu au clavier par `aria-label`.

| Issue | Case | Mot |
|---|---|---|
| `generated` | cochée | produit |
| `skipped` | cochée, atténuée | déjà présent |
| `blocked` | vide | à faire |
| `error` | croix | erreur |

⚠️ **La case d'une ligne bloquée reste vide même quand la cause est levée** — c'est le badge
« depuis résolu » qui dit le présent.

### Le veto

Grain de la **pièce**. La modale annonce la portée **avant** le geste, et un refus porte **toujours**
son motif — un refus muet se lit comme une panne.

### 🔴 Ce que la page NE fait pas, et qu'on croyait faite

> **Il n'y a aucune pagination à l'écran.** `fetchJournal(limit = 20, offset = 0)` est appelée
> **sans argument**, et `has_more` voyage dans la réponse **sans être lu par personne**. Il n'existe
> aucun contrôle « lot suivant ».
>
> Conséquence : **au-delà de vingt lots, le Journal est muet et ne dit pas qu'il l'est.** Le 21ᵉ lot
> est déjà invisible aujourd'hui. Filtrer « toute l'histoire » puis paginer ne servirait à rien si
> la page ne sait toujours pas dépasser la première page — c'est pourquoi la pagination entre dans
> le périmètre du chantier, et non « tant qu'on y est ».

---

## ▶ CHANTIER — Tri et filtre

### Structure

Une **barre de filtres** entre le bandeau de portée et le premier lot.

**Rangée toujours visible — matière** : `SubjectFilterChips` de `@zetis/ui`, « Toutes » en tête.
C'est la brique du Dashboard, de la Couverture et du Cahier de bord ; ne pas en refabriquer une.
⚠️ **Sans libellé de rangée**, et c'est une mesure : avec lui, les neuf pastilles passaient à la
ligne et la rangée valait 116 px au lieu de 47.

**Repliées derrière « Plus de filtres » — les cinq autres critères**, chacun multi-valeur :

| Critère | Forme | Valeurs |
|---|---|---|
| **date** | deux champs `date` (du / au) | bornes incluses |
| **chapitre** | `<select>`, dépendant de la matière | vide = tous |
| **statut** | pilules — **`RUN_STATUS_LABEL`** | ⏳ En attente · ▶ En cours · 🕰 **Sans réponse** · ✓ Terminé · ✕ **Interrompu** |
| **mode ZETIS** | pilules à avatar (`REGIME_AVATAR`) | Manual · Hybrid · Autonom · Sur mesure · Non enregistré |
| **type de contenu** | pilules — **`PIECE_LABEL` / `PIECE_ICON`** | 📖 Cours · 📄 Fiche · 🧠 Carte mentale · ✅ Quiz · 🗂️ Carte de révision |

### ⚠️ Ce qui se replie, et ce qui ne se replie JAMAIS

**Les contrôles se replient. Les critères ACTIFS, jamais.** La ligne de synthèse — *« 7 lots sur 23
· 🔢 Maths ✕ · Calculs avec priorités ✕ · 📄 Fiche ✕ · Tout effacer »* — reste affichée en toutes
circonstances, avec le nombre de critères repliés encore actifs sur le bouton.

> C'est ce qui répond à *« pourquoi mon journal est-il si court ? »*. Replier un filtre **actif**
> serait exactement le défaut que cette barre existe pour éviter.

**Mesuré dans un navigateur, et c'est ce qui a produit cette décision** : à plat, la barre faisait
**385 px** et le premier lot commençait à **578 px** sur un écran de 720 — plus de la moitié du pli
consommée avant d'avoir vu un lot. Repliée : **227 px**, premier lot à **438 px**.

### Vocabulaire — rien ne s'invente

⚠️ **Le vocabulaire d'écran des régimes est `Manual · Hybrid · Autonom`** (addendum ADR-0032 §7.7),
pas `manuel/semi/autonome` — ceux-là sont les **clés serveur** et ne remontent jamais à l'écran.

⚠️ **Les statuts sont ceux de `RUN_STATUS_LABEL`, tels quels.** « Sans réponse » pour `stale` —
« zombie » et « périmé » disent la panne, or ce lot a peut-être fini son travail sans pouvoir le
dire. Et **« Interrompu » pour `failed`** : `error` est une issue d'**événement**, pas un statut de
lot, les confondre créerait un sixième mot pour rien.

### Le tri

Un `<select>` de clé (**Date** · Matière · Mode · Statut) + un bouton d'inversion.

⚠️ **Le défaut est Date décroissante, et le retour au défaut est TOUJOURS à un geste.** Quand le tri
n'est pas le défaut, la barre le dit d'une mention explicite avec un « revenir à l'ordre
chronologique » — c'est la seule protection qui reste après l'avertissement accepté.

### La pagination

Un bouton « Voir les lots plus anciens », piloté par `has_more` — qui existe déjà et n'est pas lu.
Le compteur affiché est celui de **l'ensemble filtré**, jamais du total.

⚠️ **Le filtrage précède la pagination, côté serveur.** Filtrer une page déjà chargée répondrait
« rien en maths » alors que les lots de maths sont page 4 — le défaut le plus coûteux à
diagnostiquer, parce qu'il ne ressemble pas à un défaut.

### Ce qui NE change pas quand un filtre est actif

**Un lot retenu s'affiche entier** — toutes ses pièces, tous ses événements, y compris ceux qui ne
répondent pas au critère. Le filtre choisit **quels lots on regarde**, jamais **ce qu'on voit d'un
lot**. Filtrer sur *fiche* puis n'afficher que les fiches ferait dire au Journal que le lot n'a
produit que ça.

### États

| Situation | Ce que la page rend |
|---|---|
| chargement | squelette de blocs, **jamais** un régime affiché avant la réponse serveur |
| aucun lot du tout | « ZETIS n'a encore rien produit en lot. » |
| **aucun lot après filtrage** | ⚠️ voir ci-dessous — l'état vide est **bavard** |
| erreur | le message, et **aucune valeur de repli** |

⚠️ **L'état vide filtré doit dire POURQUOI il est vide**, et c'est le signal d'échec nommé par
l'ADR : un filtre qui rend vide sans s'expliquer est indiscernable d'une panne. Deux cas légitimes
existent **par construction** et doivent être nommés :

- un **filtre de type** écarte les lots **bloqués avant d'avoir touché une pièce** — `piece` est
  `NULL` sur un événement `blocked`, il n'y a pas de type à comparer ;
- un **filtre de type** écarte aussi les lots **antérieurs au détail par pièce** (`production_events`
  est née avec l'ADR-0034). ⚠️ Mesuré : **2 lots sur 9** en dev, dont un qui porte **4 fiches**.
  Sans cette phrase, Papa lira « ZETIS n'a jamais fait de fiches » devant un lot qui en a fait
  quatre ;
- un **filtre de mode** écarte les lots dont le régime n'a jamais été enregistré et dont les actes
  ne le prouvent pas.

Formulation attendue : *« Aucun lot ne correspond. 3 lots ont été écartés : ils ont été bloqués
avant de produire quoi que ce soit, donc sans type de contenu. »* — avec le geste qui répare
(retirer ce critère).

### Navigation

Le filtre vit dans l'**URL** (`?subject_id=&statut=&…`). Un journal filtré doit pouvoir être
rouvert tel quel, et le retour arrière doit défaire le filtre, pas quitter la page.

⚠️ **Aucun filtre actif à l'ouverture, jamais.** Une page qui s'ouvre déjà filtrée cache son contenu
à celui qui a oublié qu'il l'avait filtrée — et ce serait, ici, exactement le mode d'échec du signal.

## Données API

`GET /api/production/journal` — `require_parent`, routeur distinct de la Couverture (celle-ci est
documentée « lecture seule » et un test le garantit ; le veto écrit).

Paramètres ajoutés par le chantier — tous optionnels, tous répétables quand ils sont multi-valeur :

```
subject_id, chapter_id, depuis, jusqu_a, statut[], mode[], piece[], tri, sens, limit, offset
```

La réponse gagne le total de l'ensemble **filtré**. `JournalRun.zetis_mode_source` **existe déjà**
dans `packages/types` — le chantier le matérialise en base, il ne l'ajoute pas au contrat.

## Hors périmètre

- **Filtrer les pièces à l'intérieur d'un lot** — décision n°1, elle est nette.
- **Recherche plein texte** dans les motifs : autre question, jamais posée.
- **Sauvegarde de filtres**, filtres nommés, filtre par défaut.
- **Compteur ou ratio par régime** (§F.2).
- **Toute réécriture d'une ligne passée**, y compris pour « harmoniser » les deux formulations de
  motif qui coexistent.
- **Le correctif de `Lesson.status`** (39 leçons validées-vides) — dette nommée, chantier à part,
  avec migration.
- **Le rendu des maths dans les libellés de cartes SRS** (LaTeX brut à l'écran) — dette nommée, elle
  demande une dépendance, donc un ADR.
- **Toute surface Massimo.**
