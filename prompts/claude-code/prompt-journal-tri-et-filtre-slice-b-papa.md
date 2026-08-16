# Prompt Claude Code — Journal : tri et filtre, slice B (Papa)

**Branche** : `feat/journal-tri-et-filtre`, à la suite de la slice A (backend livré, API filtrante
en place).
**Trois commits distincts.** Le 1 répare un manque **antérieur au chantier**, le 2 apporte le
filtre, le 3 le tri. Les mélanger empêcherait de voir que la pagination marchait déjà côté serveur.

---

## 0. Cadre

Protocole d'exécution : **`/slice`**. Il ne se répète pas ici.

Décisions : `docs/decisions/adr-0034-journal-production-et-veto.md` (Amendement 2). Spec :
`docs/frontend-papa/page-journal.md` — **la section « ▶ CHANTIER » est le contrat**, y compris ses
libellés.

**Maquette : `docs/frontend-papa/mockup/maquette-papa-journal-tri-filtre.html`.** Ouvre-la avant de
coder. Elle porte deux états de la même page (le filtre garde / le filtre ne garde rien), et ses
notes de bas de page disent ce qu'elle **engage** et ce qui n'y est **pas inventé**. Elle a été
regardée et mesurée dans un navigateur — les chiffres qu'elle cite sont des mesures, pas des
intentions.

---

## 1. Read-before-code

Rends un **rapport de ce qui était faux**. À vérifier :

1. 🔴 **La page n'a AUCUNE pagination.** `fetchJournal(limit = 20, offset = 0)` est appelée **sans
   argument**, et `has_more` voyage dans la réponse **sans être lu par personne**. Confirme-le, et
   confirme qu'au-delà de 20 lots la page est muette **sans le dire**.
2. **`REGIME_AVATAR` (`lib/regimeVisuals.ts`) est la source unique** des visages de régime, déjà
   partagée par la sidebar et les réglages. Ne refabrique pas de table d'icônes.
3. **`SubjectFilterChips` de `@zetis/ui`** est la brique du Dashboard, de la Couverture et du Cahier
   de bord. Regarde comment la Couverture s'en sert — et son piège documenté : la réponse filtrée
   restreint la liste des matières, il faut mémoriser celle du chargement non filtré.
4. **Le vocabulaire d'écran des régimes est `Manual · Hybrid · Autonom`** (addendum ADR-0032 §7.7),
   pas les clés serveur `manuel | semi | autonome`. Vérifie où ce vocabulaire est déjà défini et
   réutilise-le.
5. **`JournalRun.zetis_mode_source` existe déjà** dans `packages/types` : rien à ajouter au contrat.
6. **Le contenu d'un `<details>` fermé reste dans le DOM** — un test qui cherche un texte le trouve
   même replié. Piège payé le 2026-08-04 ; les assertions portent sur les **chiffres**.

---

## 2. Commit 1 — la pagination, qui manquait déjà

Un bouton « Voir les lots plus anciens », piloté par `has_more`. Il **empile** les lots, il ne
remplace pas la page — un journal se lit de haut en bas.

⚠️ **Ce commit n'a rien à voir avec le filtre**, et c'est pourquoi il est seul : il répare un défaut
qui existe **aujourd'hui**, et son test doit tomber sur `main` sans la slice A.

---

## 3. Commit 2 — la barre de filtres

Structure, formes et libellés : spec §Structure, et la maquette pour le rendu.

⚠️ **Les CONTRÔLES se replient derrière « Plus de filtres » ; les critères ACTIFS, jamais.** La
ligne de synthèse (compte, pastilles des critères actifs, « Tout effacer ») reste affichée en toutes
circonstances, et le bouton porte le nombre de critères repliés encore actifs. C'est ce qui répond à
*« pourquoi mon journal est-il si court ? »* — et c'est une **mesure**, pas un goût : à plat, la
barre faisait 385 px et le premier lot commençait à 578 px sur un écran de 720.

### Les trois points où l'on se trompe facilement

⚠️ **Le filtrage est SERVEUR.** Chaque changement refait l'appel avec ses paramètres et **repart de
`offset = 0`**. Ne filtre jamais `runs` en mémoire : « rien en maths » alors que les lots de maths
sont page 4 est le défaut le plus coûteux à diagnostiquer, parce qu'il ne ressemble pas à un défaut.

⚠️ **Un lot retenu s'affiche ENTIER.** Ne masque aucune pièce, aucun événement, même quand un filtre
de type est actif. Le filtre choisit **quels lots on regarde**, jamais **ce qu'on voit d'un lot** —
et un test doit le prouver.

⚠️ **L'état vide est BAVARD.** C'est le signal d'échec nommé par l'ADR : un filtre qui rend vide sans
s'expliquer est indiscernable d'une panne. Il dit **combien** de lots ont été écartés, **pourquoi**,
et **quel critère retirer**. Deux cas légitimes existent par construction et doivent être nommés :

- un filtre **de type** écarte les lots bloqués **avant d'avoir touché une pièce** (l'événement n'a
  pas de type — constat serveur, pas un défaut) ;
- un filtre **de mode** écarte les lots dont le régime n'a jamais été enregistré.

### L'URL

Le filtre vit dans l'URL. Rouvrir un lien rend le même journal ; le retour arrière défait le filtre
au lieu de quitter la page.

⚠️ **Aucun filtre actif à l'ouverture, jamais** — y compris « la dernière fois ». Une page qui
s'ouvre déjà filtrée cache son contenu à celui qui a oublié qu'il l'avait filtrée.

---

## 4. Commit 3 — le tri

Un `<select>` de clé (**Date** · Matière · Mode · Statut) et un bouton d'inversion.

⚠️ **Le défaut est Date décroissante, et le retour au défaut est TOUJOURS à un geste visible.** Quand
le tri n'est pas le défaut, la barre porte une mention explicite et un « revenir à l'ordre
chronologique ». C'est la seule protection qui reste après l'avertissement accepté au cadrage : *un
journal qui n'est plus chronologique cesse d'être un journal.*

---

## 5. La vérification, et elle n'est pas les tests

Les suites vertes ne prouvent rien sur une barre de filtres. **Ouvre la page dans un vrai
navigateur**, avec le backend et la base de dev :

1. filtrer par matière, puis paginer, puis **compter** ;
2. filtrer sur un type que personne n'a produit → **lire l'état vide** et vérifier qu'il explique ;
3. trier par mode → vérifier que `sur mesure` et `non enregistré` sont **en fin dans les deux
   sens** ;
4. recharger une URL filtrée ;
5. revenir à l'ordre chronologique **en un geste**.

⚠️ **Si tu ne peux pas le voir en vrai, dis-le** plutôt que d'affirmer un rendu depuis le DOM. Un
bandeau a été mergé sans avoir jamais été vu le 2026-08-04 ; ça ne se répète pas en le taisant.

---

## 6. Hors périmètre — tu t'arrêtes au bord

- **Aucune ligne de backend.** Si l'API manque quelque chose : **stop-on-blocker**, tu le signales,
  tu ne le contournes pas au front.
- **Ne touche pas au veto**, ni à la modale de retrait, ni aux cases d'état, ni au badge « depuis
  résolu ».
- **Ne réécris aucun motif d'événement**, même ceux de l'ancienne formulation.
- **Aucun compteur, aucun ratio par régime** (§F.2). Le seul chiffre est celui des lots filtrés.
- **Aucun rendu LaTeX** des libellés de cartes SRS — dette nommée, elle demande une dépendance,
  donc un ADR.
- **Aucune surface Massimo.**

## 7. Ce que tu rends

Le rapport de read-before-code, la liste des fichiers, les tests ajoutés, **ce que tu as vu à
l'écran et ce que tu n'as pas pu voir**, ce qui reste ouvert, les risques.
