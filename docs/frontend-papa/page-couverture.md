# Page Papa — Couverture de production

## Objectif

Répondre à une question qu'aucune page ne traite aujourd'hui : **où en est le stock de contenu
de Massimo ?** Ce qui existe, ce qui attend une relecture, ce qui a décroché de son cours, ce
qui reste à produire.

Le pilotage par type (Quiz, Fiches, Mindmaps, Cartes SRS, Capsules) donne cinq vues partielles
du même objet. Cette page en est l'**union** — et devient le point d'entrée du groupe
« production » de la sidebar.

Maquette de référence : `docs/frontend-papa/mockup/maquette-papa-couverture.html`.
Décisions : `adr-0011` **addenda §E (fraîcheur) et §F (provenance)**, `adr-0023` (production par
scope, pour les actions de lot).

## Principes

- **Lecture d'abord.** La page ne génère rien sans un clic explicite, et rien
  automatiquement — jamais, sous aucune condition.
- **Un objet, un état.** Chaque cellule dit la vérité sur un dérivé, y compris quand elle est
  inconfortable (périmé, validé en lot, bloqué).
- **Pas de jeu de complétion.** Aucun tri « le plus incomplet d'abord », aucun score par
  matière, aucun graphe. Une matrice à cases vides invite déjà assez à tout remplir ; l'envie
  de compléter n'est pas un critère pédagogique.
- **La provenance informe, ne réclame pas.** Elle s'affiche par objet, ne se totalise jamais
  (§F.2).
- **Rien de cette page n'atteint Massimo.** `require_parent` côté serveur ; aucune donnée,
  aucun composant partagé avec `frontend-massimo`.

## Structure

### En-tête

Pictogramme + titre + sous-titre, sélecteur d'année scolaire à droite.

Le pictogramme est `CouvertureIcon` (56 px), animé d'une **respiration lumineuse** de 4 s
(`.couverture-breathe` dans `index.css`). L'animation ne porte **aucune information** — rien ne se
perd si elle est coupée, et elle l'est sous `prefers-reduced-motion`. Le même pictogramme désigne
la Couverture dans la sidebar (20 px) et sur le relais du Dashboard (24 px), sans animation : à
cette taille, un halo qui pulse devient un clignotement parasite.

### KPI (4) — cliquables

Leçons validées · cours rédigés `n/total` · % de dérivés produits · périmés.

Le cours **n'entre pas** dans le pourcentage de dérivés : il en est la condition, pas un
dérivé. Le compter serait une faute de logique.

**Chaque KPI ouvre son COMPLÉMENT, pas ce qu'il compte** : depuis « 27 cours rédigés sur 78 », ce
qui se pilote ce sont les 51 restants. Un chiffre atteint ne se travaille pas.

| KPI | Filtre appliqué |
|---|---|
| Leçons validées | 🔒 Non validées |
| Cours rédigés `n/total` | 📝 Sans cours |
| Dérivés produits `%` | 🟢 Prêtes, incomplètes |
| Périmés | ⚠ Périmés |

Un second clic revient à « Tout » : une carte qui ne sait qu'allumer un filtre obligerait à aller
l'éteindre ailleurs. Les cartes restent cliquables même à zéro (choix du user, 2026-07-28).
Sémantique ARIA `aria-pressed` et **non** `aria-expanded` : rien n'est déplié sous la carte, le
filtre agit sur la matrice plus bas.

### Bandeaux d'anomalie (2, côte à côte, masqués si compteur nul)

- **Ambre — relecture** : « N objets produits n'atteignent pas Massimo », détail par type,
  bouton vers la file de relecture (inerte tant que ce chantier n'existe pas).
- **Rouge — orphelins** : « N dérivés dont la leçon a été archivée », ancre vers l'encart bas.

Ils sont **au-dessus** de la matrice : un objet produit qui dort est une information plus
actionnable qu'une case vide.

### Filtres

**Rangée 1 — matière** : pastilles à pictogramme (`SubjectFilterChips` de `@zetis/ui`, la même
brique que le dashboard et le cahier de bord), « Toutes les matières » en tête. Elle a remplacé un
`<select>` : les huit matières tiennent sur une ligne, et un pictogramme se reconnaît d'un coup
d'œil là où un libellé replié dans un menu demandait de l'ouvrir.

> La requête `GET /coverage?subject_id=` restreint **aussi** la liste des matières renvoyée. La
> page mémorise donc celle du chargement non filtré, sinon les pastilles s'effondreraient à une
> seule au premier clic. Cf. `TROUBLESHOOTING.md`.

**Rangée 2 — état** : Tout · 🔒 Non validées · 📝 Sans cours · 🟢 Prêtes, incomplètes ·
⏳ À relire · ⚠ Périmés, plus la recherche de leçon.

Les **deux causes de blocage ont chacune leur pilule** au lieu d'un « 🔒 Bloquées » unique : le
backend les distingue déjà (`row_state`) parce que l'action à mener diffère — agir dans Programme
vs rédiger le cours ici — et surtout deux KPI pointent l'un sur l'une, l'autre sur l'autre.
« Leçons validées » ne peut pas ouvrir un ensemble dont `blocked_no_course` (= des leçons
validées) fait partie.

Filtrage **client** sur les données déjà chargées, fonctions pures dans `lib/coverageFilters.ts`.

### Matrice

Un tableau par matière, lignes groupées par chapitre, **une ligne = une leçon**.

Chaque matière est un **expander**. En vue d'ensemble (toutes matières, aucun filtre d'état) elles
arrivent **repliées** : les huit tiennent dans un écran. Dès qu'on demande quelque chose
d'explicite — une pilule d'état, une matière — tout se déplie : on ne cache jamais ce qui vient
d'être demandé. Les ouvertures manuelles sont oubliées au changement de contexte, sinon un repli
fait sous « Périmés » resterait actif alors qu'il n'a plus de sens.

L'en-tête replié porte pictogramme + nom + `N leçons · N chapitres` + un **rappel des anomalies**
de la matière : `🔒 4`, `📝 2`, `⏳ 1`, `⚠ 1`. Un marqueur à zéro **n'est pas affiché** — une
matière saine se reconnaît à ce qu'elle n'en porte aucun, pas à une rangée de zéros à déchiffrer.

Ces compteurs sont calculés sur la matière **entière** (`subjectAnomalies`), jamais sur la matrice
filtrée : sous filtre « ⚠ Périmés », toutes les autres anomalies tomberaient à zéro et l'en-tête
affirmerait « aucune leçon bloquée ici », ce qui serait faux.

Ce sont des **comptes**, jamais un pourcentage ni une barre : la page s'interdit un score par
matière (cf. Principes — un classement des matières les plus incomplètes n'est pas un critère
pédagogique).

| Colonne | Ancrage | Ce qui compte comme « couvert » |
|---|---|---|
| Cours | leçon | `content_markdown` non nul, leçon `validated` |
| Quiz | leçon | quiz existant (pas de gate — ADR-0014 §2) |
| Fiche | leçon | `validated` |
| Mindmap | leçon | `validated` |
| Cartes | **notion** | fraction : notions portant ≥ 1 carte validée |
| Capsules | **notion** | fraction : notions portant ≥ 1 capsule **`published`** |

Les deux dernières ont un **fond distinct** et le sur-titre « notions couvertes » : la
distinction leçon-centré / notion-centré doit se voir sans lire la légende.

Une capsule générée sans voix ni rendu MP4 ne se regarde pas — elle n'est pas comptée.

### États de cellule

| État | Rendu | Sens |
|---|---|---|
| `validated` | ✓ émeraude | à jour, servi |
| `pending` | ⏳ ambre | produit, jamais relu |
| `stale` | ⚠ rouge | périmé — le cours a changé après |
| `absent` | `+` pointillé, **cliquable** | rien, générable |
| `blocked` | `·` gris inerte | cours non validé |

Le quiz n'a **pas** de `pending` : `absent` · `validated` · `stale`.

Le rouge va au périmé, l'ambre au `pending` — à rebours de l'intuition. Un `pending` dort et ne
fait aucun mal ; un périmé **atteint Massimo avec un contenu obsolète**. La couleur suit la
gravité, pas l'urgence ressentie.

### Nuancier de provenance sur le ✓ (§F)

Un ✓ ne dit pas comment l'objet est passé.

| `validated_by` | Rendu | Sens |
|---|---|---|
| `parent` | émeraude plein | relu pièce à pièce |
| `parent_bulk` | vert pâle cerclé | validation groupée ou équipement (ADR-0021 §2) |
| `system` | gris | servi sans relecture, par doctrine (quiz) |
| `NULL` | comme `parent_bulk`, `title` « provenance inconnue » | antérieur à la traçabilité |

**La colonne Cours le porte aussi** — `lessons` a gagné `validated_by` (§F.1), et l'équipement
ADR-0021 §2 génère **et auto-valide** le cours dans son kit. Un cours `parent_bulk` dit donc :
« Massimo lit un cours que Papa n'a jamais ouvert ». C'est la cellule où la provenance a le plus
de valeur, puisque le cours est le seul contenu qu'il lit vraiment.

### États de ligne

- 🔒 **bloquée** — deux causes distinctes, deux actions différentes : *cours jamais rédigé*
  (le rédiger ici) ou *leçon non validée* (agir dans Programme). Ne pas les confondre : une
  matrice qui affiche 40 trous sans distinguer combles et bloqués n'aide pas.
- 🟢 **prête, incomplète** — cours validé, dérivés manquants.
- ✔ **complète**.

### Actions

- Clic sur `absent` → génération de l'objet via l'endpoint **existant** de son module.
  Réutilise `GenerationProgress` et le patron de requête longue du pilotage. Aucun nouvel
  endpoint.
- Clic sur `stale` → popover : rappel que l'objet est servi dans une version obsolète,
  Régénérer · Inspecter (navigation vers le pilotage du type).
- **« ⚡ Compléter le chapitre (N) »** en tête de chaque chapitre : **ACTIF depuis l'ADR-0031**
  (livré le 2026-08-02 ; il était désactivé depuis l'ADR-0023, jamais implémenté). `N` reste le
  nombre de **trous** — le nombre de notions réellement équipables est dit par l'aperçu, à
  l'ouverture. L'annoncer sur le bouton coûterait un appel par chapitre au rendu de la page ; le
  patron **preview → confirm** (ADR-0010/0018) le paie une fois, au moment du geste.

**Les deux passes du §7 ne fusionnent pas, et elles sont déjà toutes les deux à l'écran :**

1. **« ✅ Valider les N leçons »** (bouton voisin, préexistant) = la passe 1 — lever le gate. Il
   ne génère rien, il valide des brouillons (`parent_bulk`, §F.3).
2. **« ⚡ Compléter le chapitre »** = la passe 2 — équiper. Elle n'équipe **que** les notions dont
   la leçon est déjà validée avec contenu (addendum ADR-0031 : *le gate vit dans la sélection*).

> ⚠️ **Un chapitre neuf ne produira rien, et l'écran doit le DIRE.** La modale d'aperçu nomme
> chaque notion bloquée et son motif, et écrit explicitement que ce n'est pas une erreur. Sans ça,
> Papa lirait un échec de production là où le gate fonctionne — c'est le point que l'addendum
> désigne comme le plus facile à rater.

L'aperçu porte aussi l'**arriéré de relecture** et son plafond : le bouton de lancement dit
*pourquoi* il refuse avant d'essayer, plutôt qu'après un 409.

### Encart orphelins (hors matrice, bas de page)

Dérivés dont la leçon est archivée ou supprimée. Type, titre, matière, date d'archivage.
Bouton Supprimer **désactivé** quand l'objet porte de l'historique (`has_history`), avec le
`title` qui l'explique. Actions Réattacher/Supprimer inertes en V1 (endpoints non livrés).

Ils n'ont pas de ligne dans la matrice : leur leçon n'existe plus. Une anomalie, pas une case
vide.

### Notes de bas de page (4, obligatoires)

Garde-fous de lecture, pas décoration : sans elles les fractions passent pour exactes et un ✓
passe pour une relecture.

1. **Lecture de la matrice** — leçon-centré vs notion-centré ; les fractions n'affichent pas
   d'état de fraîcheur (§E.5) ; une carte comptée sur une ligne a pu être produite depuis le
   cours d'une autre leçon enseignant la même notion.
2. **Ce qui compte comme couvert** — capsule = publiée uniquement, etc.
3. **Provenance de la validation** — le nuancier, et le fait qu'il n'est ni compté ni relancé.
4. **« Cours » n'est pas une colonne comme les autres** — c'est la porte ; deux causes de
   blocage.

## Données API

- `GET /api/production/coverage?subject_id=` — arborescence matière → chapitre → leçon, cellules
  (`CellState` + `derived_at` + `validated_by`), fractions notion, `totals`.
- `GET /api/production/orphans` — dérivés orphelins + `has_history`.

Les deux `require_parent`. Une requête agrégée par matière, **aucun N+1** : une matière peut
porter 8 chapitres × 12 leçons.

## Navigation

Entrée **« Couverture »** en tête du groupe « production » de la sidebar Papa, avec séparateurs
de groupe introduits à cette occasion :

```txt
Dashboard · Progression · Lacunes · Missions · Diagnostics
Conseil de classe IA · Cahier de bord IA
──────────────────────────────
Couverture          ← ici
Programme · Quiz · Fiches · Mindmaps
Cartes SRS · Capsules IA · Sources de cours
──────────────────────────────
Paramètres
```

Aucune entrée existante n'est supprimée, déplacée ni renommée. La trajectoire — démoter
Fiches/Mindmaps/Cartes SRS en vues de détail atteintes depuis la Couverture — est notée, pas
exécutée : on ne déplace pas cinq pages en même temps qu'on en crée une.

### Relais au Dashboard

Une carte d'alerte **unique**, une ligne : « N objets attendent ta relecture · M périmés »,
cliquable vers `/couverture`. Masquée si les deux compteurs sont nuls.

Règle du `README.md` frontend-papa : *les alertes doivent proposer une action*. **Le Dashboard
signale, la Couverture traite.** Ni matrice, ni KPI de production, ni compteur détaillé sur le
Dashboard — il répond à « où en est Massimo », pas « où en est mon stock ».

## États

`Loading` (squelette de matrice, pas un spinner plein écran) · `Error` · `Empty` (aucune année
active). Une matière sans leçon validée apparaît avec un état vide explicite, **jamais filtrée
silencieusement**.

## Hors périmètre

File de relecture · production en lot (ADR-0023) · suppression et réattachement des orphelins ·
filtre par moteur d'inférence · tout agrégat de provenance · toute surface Massimo.

---

## Écarts d'implémentation (2026-07-28)

Ce que la page fait **en plus** de la spec ci-dessus, décidé en cours de chantier avec le user :

- **Chaque cellule renseignée est un lien** vers son objet, sur la page de pilotage du type :
  convention `?subject=<id>&focus=<object_id>` (le cours garde le format Programme,
  `subject`+`chapter`+`lesson`). Défilement + anneau émeraude à l'arrivée. Le quiz et la mindmap
  **ouvrent directement leur modale** (c'est là que vit leur contenu) ; la fiche se contente du
  surlignage — sa modale est un ÉDITEUR, l'ouvrir d'office mettrait Papa en édition sans l'avoir
  demandé.
- **Badge sur la ligne** au lieu d'une sous-ligne : « À valider → » (ambre, cliquable, mène à
  Programme) pour une leçon en brouillon ; « Cours à rédiger » (bleu, non cliquable — l'action
  est dans la colonne Cours). Vocabulaire repris de `badges.tsx`, que Papa connaît déjà.
- **Validation en lot des leçons d'un chapitre** — bouton ACTIF dans l'en-tête de chapitre,
  à côté du bouton de production en lot qui reste désactivé. La distinction est volontaire :
  valider ne génère rien, ça lève un gate. Confirmation `tone="important"` + provenance
  `parent_bulk`.
- **Colonnes notion-centrées actionnables** : la fraction ouvre le détail par notion. Cartes →
  génération en un clic ; capsules → compositeur pré-rempli (l'instruction reste à Papa) ; notion
  déjà couverte → lien vers ses cartes, aperçu déplié.

Un point de **vocabulaire** fixé au passage : dire « Mindmap », **jamais « carte mentale »** —
la colonne voisine s'appelle « Cartes » (de révision), et les deux objets n'ont aucun rapport.

**Non vérifié à l'écran de bout en bout** : la session de test a expiré côté agent. Les défauts
trouvés par le user sont consignés dans `TROUBLESHOOTING.md` § chantier `couverture`.

## Passe visuelle (2026-07-28, session 2)

Retours du user sur la page réelle, et ce qui en a découlé :

- « Les KPI ne sont pas actifs » → KPI cliquables (voir §KPI), pilule « Bloquées » scindée en ses
  deux causes.
- « Où sont passés les pictogrammes par matière ? » → ils étaient absents de cette page seule,
  alors que Matières, Fiches, Mindmaps, Capsules et Conseil de classe les affichent tous. Ajoutés
  sur les en-têtes de matière **et** sur le sélecteur, via `SubjectPictogram` extrait de
  `SubjectFilterChips` (un seul rendu du même pictogramme sur une même page).
- « Il faudrait des expanders par matière pour garder une vue globale » → voir §Matrice.
- « Je veux cette icône pour Couverture, avec une animation » → voir §En-tête.

**Toujours pas de vérification de bout en bout par l'agent** : le navigateur intégré n'est pas
connecté et l'agent ne saisit pas de mot de passe. L'icône et son animation ont en revanche été
vérifiées sur un banc d'essai isolé (rendu + `getAnimations()`), pas seulement supposées.
