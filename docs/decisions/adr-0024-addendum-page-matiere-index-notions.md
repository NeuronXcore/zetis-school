# Addendum ADR-0024 — La page matière est un index de notions

## Statut

Accepté — 2026-08-01, **livré le jour même** (slices A + B), puis **affiné en six tours au vu de
l'écran** (§Amendements). Amende l'**ADR-0017** sur un point (les activités notion-centrées
s'ouvrent en pleine page, pas en modale).

> S'appuie sur : `adr-0024` (doctrine de progression — un COMPTE jamais un pourcentage, aucun
> `mastery_score` affiché, aucun cadrage de perte), son addendum `galaxie-page-dediee` (le repli
> sans WebGL promis par `zetis-galaxy.md §11`), `adr-0011 §1` (substrat neutre à plusieurs
> consommateurs), `adr-0027` (l'orchestrateur oriente vers l'existant validé). Le geste
> « demander » relève de l'addendum `adr-0027-addendum-demandes-surface-eleve`.

## Contexte

`/subjects/:slug` était encore la page de la **Phase 1** : un launcher au grain matière —
en-tête « Niveau 5 · 320 XP », quatre tuiles dont trois inertes, un bouton « Faire un quiz » sans
`onClick` —, **entièrement mockée** sur `data/mock.ts`, sans un seul appel réseau.

Elle est **antérieure à la doctrine ADR-0024 §5** et la contredit sur trois points : elle affiche
un niveau, un XP par matière, et une « meilleure matière » qui met les matières en concurrence.

Deux choses ont changé depuis qu'elle a été écrite. La Galaxy a rendu la progression **ailleurs**,
donc cette page n'a plus à la porter. Et `zetis-galaxy.md §11` promet un **repli sans WebGL** —
une promesse que rien n'honorait.

## Décision

### 1. La page devient l'index des notions de la matière

Chapitres validés → notions, chacune avec son état et **la panoplie complète des 7 activités**.
Elle rend le **même modèle** que la constellation, en liste : **elle EST** le repli sans WebGL.

Contrainte dure qui en découle : **aucun chunk 3D**, ni par import statique ni par `import()`.
Un test de budget le vérifie, et il interdit **les deux formes** — leçon du 2026-07-31, où le
canvas était déjà code-splitté et où ce qui coûtait était le **montage**. Un test limité aux
imports synchrones serait passé avant comme après, donc n'aurait rien protégé.

### 2. Le prédicat de disponibilité est EXTRAIT, en version ensembliste

`GET /api/student/subjects/{slug}/panoply` s'adosse au prédicat sorti de `galaxy.notion_panel`.
`notion_panel` en devient le **consommateur mono-notion** et ne calcule plus rien.

**Interdiction d'un second prédicat.** Le correctif du 2026-07-30 a déjà prouvé qu'il diverge :
le cours était annoncé disponible sur `lesson_id is not None` d'un côté et sur
`content_markdown IS NOT NULL` de l'autre — une porte ouverte sur du vide, **et** une demande à
Papa jamais enregistrée. Deux verrous : un test de **cohérence croisée** (même `skill_id` → même
`available` sur les 7 kinds, quelle que soit la surface) et un test de **nombre de requêtes
constant**, indépendant du nombre de notions.

### 3. Recherche LOCALE et lexicale — la sémantique reste au chat

Client-side sur l'index déjà chargé : accents pliés, réponse à la frappe, **zéro requête**.

La recherche **sémantique** reste au chat seul. La dédoubler diviserait `resolve_skill` entre deux
chemins et imposerait d'accorder deux seuils qui dériveraient.

### 4. Panoplie entière, l'indisponible grisé, l'accent à la première activité FAISABLE

Reprend la révision du §4 (2026-07-28). Une action mise en avant doit **pouvoir être faite** :
l'accent ne va donc pas à la première de la liste, mais à la première disponible.

**Sauf ELI5 : il n'est plus offert sans cours validé.** C'est la résolution d'une contradiction
réelle — `notion_panel` le déclarait *toujours* disponible, là où l'orchestrateur refusait déjà
d'y router sans cours (ELI5 s'ancre sur le cours canonique et **dégrade vers le modèle** sans
lui). La règle descend **dans le prédicat partagé**, pas dans la page : portée par la page, elle
se serait re-dédoublée un cran plus haut. Asymétrie assumée : router ≠ offrir un outil.

### 5. Rétrolien DÉRIVÉ du slug d'URL

Une brique partagée, montée sur toutes les surfaces filles d'une matière. **Aucun
`location.state`, aucune pile de navigation** : robuste au rechargement, au partage d'URL et au
retour physique iPhone — les trois moments où un état de navigation a déjà disparu.

### 6. Ce que la page N'AFFICHE PAS

Retirés de la spec de Phase 1, par héritage du §5 : **niveau**, **XP par matière**,
**pourcentage**, **barre de progression**, **badge de maîtrise**, **« meilleure matière »** (mise
en concurrence), **série en cours** (le streak a été retiré le 2026-07-27), et **« Notions à
renforcer »** — qui expose les manques de l'**enfant** là où cette page décrit ceux du
**catalogue**.

`mastery_score` n'est **pas sérialisé** par la route. Une valeur numérique servie finit toujours
par être affichée.

### 7. Amendement de l'ADR-0017 : pleine page, pas de modale

Les activités notion-centrées s'ouvrent en **pleine page**. L'arbitrage 0017/0019, ouvert de
longue date, est tranché — la Galaxy l'avait déjà tranché **de fait** avec son `navigate()`.

## Ce que le read-before-code a invalidé

**1. Le prompt de slice se contredisait.** Il exigeait que les tests de `notion_panel` passent
« sans modification » **et** que `eli5.available` suive le cours — or un test affirmait
`dispo["eli5"] is True` **sur ce cas exact**. Tranché en séparant les deux temps : extraction
d'abord (**668 tests verts, zéro modifié** — preuve jouée), puis bascule ELI5, qui a fait tomber
**exactement une** assertion.

**2. `NotionActionPanel` ne tire PAS `three.js`.** Le prompt l'affirmait. Le baril
`@zetis/ui/galaxy` est léger ; Three vit derrière `@zetis/ui/galaxy/canvas` et `brainGeometry.ts`,
tous deux **hors baril**. La page ne l'importe pas quand même — mais pour une autre raison : elle
partage sa **table de routes**, pas le composant.

**3. Cette table n'était couverte par AUCUN test.** Les cas existants ne vérifiaient que les
libellés, le `disabled` et l'accent. Un refactor de routage se serait fait sans filet : 9 cas de
caractérisation ont donc été écrits **d'abord**, contre le code d'alors.

**4. `app.routes` n'est pas à plat** dans cette version de FastAPI. Un test « telle route n'existe
pas » écrit dessus passe **à vide** — donc vert même si la route existe.

## Conséquences positives

- **Le repli sans WebGL existe enfin**, et un test l'empêche de redevenir une promesse.
- **Un seul prédicat de disponibilité** dans le dépôt, verrouillé par un test de cohérence croisée.
- **14 requêtes SQL, constantes** de 3 à 100 notions (mesuré).
- La page cesse de contredire la doctrine sur trois points.
- `zetis-galaxy.md §11` redevient exact.

## Coûts assumés

- Une page entière réécrite : rien n'est repris de la Phase 1 **sauf la route**.
- Deux moteurs de comptage coexistent : les comptes dérivés de la panoplie mesurent « ce qui est
  ouvrable depuis mes notions », les résumés de deck mesurent « ce que le catalogue contient ».
  **Ils divergent normalement** (`MAX(id)` par leçon) — écrit dans la spec pour que personne ne
  « corrige » l'écart.
- La règle ELI5 change un comportement **éprouvé live**.

## Hors périmètre

Carte **« Reprendre »** (dernier contenu ouvert) : **descopée**, aucune route ne sert cette donnée
— `last_notion` est global, sans lien, sur 30 jours. L'inventer aurait menti. · Session de quiz ou
de révision **ciblée par notion** (cibles `location.state`). · Recherche sémantique. · Lecture de
la file de demandes. · Réconciliation de `navigation.md`.

**Zéro table, zéro migration.**

## Amendements — six tours au vu de l'écran (2026-08-01)

Le user a lancé l'app et fait évoluer la page. Chaque tour a sa raison :

1. **Tous les chapitres sont repliés à l'ouverture.** Le premier s'ouvrait d'office : la page
   présentait le contenu d'un chapitre **choisi pour** Massimo. C'est lui qui décide où il entre.
   La recherche continue d'ouvrir d'office ce qu'elle trouve.
2. **Un témoin « N prêtes » sur l'en-tête replié** — sinon il fallait tout déplier pour trouver où
   travailler. *Prête* = la notion a **au moins une** activité faisable. Un **COMPTE**, jamais un
   ratio : « 2 sur 3 » serait un score, un test interdit tout dénominateur.
3. **À zéro, aucun témoin ET aucune atténuation.** L'option « chapitre grisé » a été écartée
   explicitement : un chapitre entier atténué se lit comme un reproche, là où une pastille creuse
   isolée reste factuelle.
4. **`GET /reviews/summary` expose `session_size` par matière.** `flash_size` est **global** et
   `due_count` est l'**arriéré** (interdit par `CLAUDE.md`). Le calcul vit là où vit
   `REVIEW_SESSION_MAX_SUBJECT` : recopier `8` dans un front l'aurait fait mentir le jour où le
   plafond bouge.
5. **Une bande « ce que ZETIS a pour cette matière »** remplace la carte « N cartes à revoir »,
   qui n'annonçait qu'un type sur six. **Zéro requête ajoutée** : la panoplie porte déjà les
   identifiants. `eli5` en est **absent** — il ne stocke rien, ce n'est pas un produit du
   catalogue mais une capacité.
6. **`capsule` et `quiz` affichent leur compte sans être cliquables** : aucune route par matière
   n'existe pour eux. Les envoyer vers la liste globale depuis une page de matière serait la
   trahison même que le rétrolien corrige ailleurs.

7. **RÉVISION de la décision 6, le soir même.** Le user a signalé « le KPI 1 quiz dans
   mathématiques ne marche pas ». L'audit de la base a montré que **le compte était juste** sur
   les 8 matières — ce qui était cassé, c'était l'**affordance** : la pastille était inerte par
   décision, mais **rendue exactement comme les cliquables**. Le signalement était fondé même si
   le code faisait ce qui était prévu.

   Deux corrections, parce que le défaut était double :

   - **`/quiz` accepte désormais `?subject=`** (patron déjà établi par `/revision` et `/eli5`), et
     porte le rétrolien. La bonne question devant une route manquante est **« peut-on
     l'ajouter ? »** avant « comment afficher qu'elle manque ? ».
   - **Une pastille non ouvrable doit se DISTINGUER À L'ŒIL** — bordure pointillée, atténuation,
     `aria-label` explicite. **Une chose qui ressemble à un lien doit être un lien.** Ne reste
     dans ce cas que `capsule` (`/capsules` est global, il n'existe ni `/capsules/:slug` ni
     `/capsules/:id`).

> ⚠️ **Piège de comptage, à ne pas « corriger ».** Les résolveurs serveur prennent `MAX(id)`
> groupé **par leçon** : la panoplie n'expose que la ressource la **plus récente** de chaque
> leçon, et plusieurs notions d'une même leçon portent le **même** `fiche_id`. Une leçon avec 3
> fiches validées compte **1** sur cette page et **3** sur `/fiches`. **Les deux sont justes.**
> Corollaire : dédupliquer par `Set` est obligatoire, sinon le compte gonfle d'autant de notions
> que la leçon enseigne.

## Point ouvert

**La page n'a jamais été vue à l'écran par l'agent** (navigateur non connecté de son côté). Tout
est prouvé par test, rien par l'œil. Restent à vérifier : la recherche à la frappe, l'accordéon au
clavier, le panneau, le seuil 620 px où la panoplie se masque, et les cinq rétroliens — dont celui
d'ELI5 **après rechargement**.
