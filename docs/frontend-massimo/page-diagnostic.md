# Page Massimo — Diagnostic (refonte : une proposition, pas une liste)

> **Réconciliation du 2026-08-08.** La v1 de cette spec décrivait un écran qui n'a
> **jamais existé** (trois choix « Toutes les matières / Une matière / Rapide 10 min »)
> et listait **quatre routes API qui n'existent pas** (`POST /diagnostics/start`,
> `POST /quiz-attempts/{id}/answers`…). Elle n'a donc jamais servi de contrat : le code
> a été écrit à côté d'elle, et personne ne l'a vu parce que rien ne compare une spec à
> son implémentation. Ce qui reste vrai de la v1 est conservé ci-dessous, à sa place ;
> le reste est remplacé par ce que la relecture humaine du 2026-08-08 a demandé.

Route : `/diagnostic`.

## Objectif

Évaluer les prérequis et notions fragiles sans donner l'impression d'un examen lourd.

Le diagnostic sert : avant la rentrée ; au début de l'année ; après quelques semaines ;
avant les conseils de classe ; quand une matière bloque ; après une longue pause.

**Le problème que cette refonte traite** (relecture humaine du 2026-08-08) :
*« une liste infinie de diagnostics sans savoir ce qu'il doit faire ou pas ».*
Mesurable dans le code : `list_diagnostics` rend **tous** les diagnostics relus
depuis toujours, `order_by(Quiz.id.desc())`, **sans limite** (15 en base de dev, et
ça ne fera que croître) ; et `taken` n'est utilisé que pour écrire « Refaire ↻ » ou
« Commencer → ». Le fait et le à-faire vivent dans la même liste plate, sans tri,
sans séparation, sans « celui-ci d'abord ».

⚠️ L'ADR-0043 a **aggravé le contraste** sans toucher cette page (hors périmètre
explicite) : Papa a désormais un rail à trois crans groupé par mois avec un panneau
qui explique, pendant que Massimo garde une liste plate.

**La réponse : la page ne répond plus « voici les 15 diagnostics », elle répond
« commence par là, et voici pourquoi ».**

## Positionnement enfant

Ne pas dire : « test de lacunes ».
Dire : « ZETIS vérifie ce qu'il faut renforcer pour t'aider plus vite. »

## Règles UX (CLAUDE.md — interface enfant)

- **Aucun compte de non-faits.** Jamais « 3 diagnostics à passer », nulle part — ni
  dans la page, ni en badge de sidebar. C'est la règle **« NOUVEAU jamais DÛ »** de
  l'ADR-0030 : un tel compte *ne décroîtrait que par le travail et grossirait quand
  Massimo ne vient pas*.
- **Aucun décompte de jours**, sous aucune forme : ni « ça fait 24 jours », ni « en
  retard », ni rouge. Les dates ne figurent que sur ce qui est **fait** (« tu l'as
  passé le 12 juillet ») — factuel et positif. Sur ce qui reste à faire, la formulation
  est **qualitative** : « la dernière mesure commence à dater ».
- **Aucun classement des matières par faiblesse.** Trier les diagnostics par « là où
  il est le plus faible » serait un **diagnostic négatif montré à l'enfant** — interdit.
  Le tri porte sur l'**âge de la mesure**, jamais sur son résultat (voir plus bas).
- **La proposition doit pouvoir être refusée.** Un objectif subi se fuit ; un objectif
  qu'on s'est donné se tient. D'où la sortie explicite sous la carte : « Je préfère
  autre chose ↓ ».
- **L'XP récompense d'être venu, pas d'avoir réussi.** `submit` accorde `XP_DIAGNOSTIC`
  avec `reason="diagnostic"`, indépendamment du score
  (`diagnostics/service.py`). Ne jamais présenter l'XP comme lié au résultat.
- **Icônes de matière : `lib/subjectIcons.ts` → `subjectIconFor` (brique `@zetis/ui`)**,
  repli `subjectEmoji`. **AUCUN mapping emoji local** — « ne pas hardcoder les matières ».
  ⚠️ La maquette HTML en contient un ; c'est une commodité de maquette, pas un modèle
  à recopier. Elle impose au contrat de servir le **slug** (voir Données API).
- Vocabulaire : « notion à renforcer », « prochaine étape ». Jamais « échec », « lacune »,
  « niveau faible ».

## Structure — une page, trois zones

> Le header global vit dans `MassimoLayout` — pas dans cette page.

### Zone A — une seule proposition, avec sa raison

Une **carte unique**, pas une liste. Elle porte :

- la matière (icône + nom) et le titre du diagnostic ;
- **la raison, en clair et en une phrase** — c'est elle qui remplace « il y en a 15,
  débrouille-toi » :
  - jamais mesuré → *« ZETIS ne t'a encore jamais posé de questions dans cette matière.
    C'est celle où il en apprendra le plus sur toi. »*
  - mesuré il y a longtemps → *« La dernière mesure de ZETIS commence à dater. Un petit
    tour et il saura où tu en es maintenant. »*
- les faits utiles pour décider : `N questions` · `environ M min` ;
- une ligne de rassurance, **séparée des faits** : « Tu peux t'arrêter quand tu veux. » ;
- le bouton **« Commencer → »** ;
- puis **« Je préfère autre chose ↓ »**, qui mène à la zone B.

> ⚠️ Les deux registres — les faits et la rassurance — tiennent sur **deux lignes
> distinctes**. Mis sur une seule, ils se cassent en trois colonnes bancales dès 375 px
> (vu à l'écran sur la maquette avant correction).

### Le choix de Massimo REMONTE dans la carte — et elle change de registre

Choisir en zone B **promeut** le diagnostic dans la carte du haut ; il ne se lance pas depuis la
liste. Le bouton y dit donc **« Choisir ↑ »**, pas « Commencer → ». Il n'y a qu'**un seul endroit
où l'action arrive**.

> **Le motif** : sans ça, le chemin que Massimo choisit lui-même passait par une ligne compacte,
> quand celui qu'on lui propose passe par une carte qui explique. C'est précisément quand il exerce
> son choix qu'il faut le soutenir le mieux.

🔴 **La carte CHANGE DE REGISTRE**, et ce n'est pas cosmétique :

| | ZETIS propose | Massimo a choisi |
|---|---|---|
| Bandeau | `ZETIS TE PROPOSE` | `TON CHOIX` |
| Encart 💡 | la **raison** — *« C'est celle où il en apprendra le plus sur toi »* | le **fait brut** — *« ZETIS ne l'a encore jamais mesuré. »* |

Servir la phrase de recommandation sur un diagnostic que Massimo a pris de lui-même ferait
revendiquer à ZETIS un conseil qu'il n'a pas donné — un petit mensonge, sur la seule page où il
mesure. La matière descend dans la ligne d'infos ; le bandeau sert à dire **d'où vient la
proposition**.

Deux mécaniques que ça impose : la carte **remonte dans le champ de vision** au clic (un changement
hors écran est invisible, et Massimo croirait que son clic n'a rien fait), et
**« ← Revenir à ce que ZETIS propose »** garde les deux chemins réversibles. La proposition de ZETIS
**retourne en zone B** quand un choix la remplace : la carte n'en porte jamais deux, et rien ne
disparaît.

### Zone B — le reste, replié par matière

Les diagnostics non passés, **groupés par matière**, chaque groupe **replié** : une
ligne par matière (icône, nom, « N diagnostics »), qui se déplie sur clic.
11 diagnostics deviennent 6 lignes. **Rien n'est caché ; la liste infinie disparaît.**

Ordre des matières : celles que ZETIS n'a jamais mesurées d'abord — même règle que la
zone A, pour que la page ne se contredise pas d'une zone à l'autre.

> **Pas de plafond, pas de troncature.** Structurer n'est pas masquer : un « 10 premiers »
> silencieux ferait croire à une couverture complète. C'est la hiérarchie qui règle le
> problème d'échelle, pas une coupe.

### Zone C — « Déjà mesuré avec toi », séparé

Les diagnostics passés quittent la liste du à-faire — **c'est le défaut nommé qui se
referme**. Ton positif (✓ vert), date de passation, et deux actions :

- **« Ce que ZETIS a retenu »** → rouvre le résultat de la passation ;
- **« Refaire ↻ »** → relance le même diagnostic.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│                        🧭 Diagnostic                          │
│      ZETIS vérifie ce qu'il faut renforcer pour t'aider.      │
├──────────────────────────────────────────────────────────────┤
│ ╔══════════════════════════════════════════════════════════╗ │
│ ║ 🌍 HISTOIRE-GÉO                                          ║ │
│ ║ L'Europe des Lumières                                    ║ │
│ ║ ┌──────────────────────────────────────────────────────┐ ║ │
│ ║ │ 💡 ZETIS ne t'a encore jamais posé de questions dans │ ║ │
│ ║ │    cette matière. C'est celle où il en apprendra le  │ ║ │
│ ║ │    plus sur toi.                                     │ ║ │
│ ║ └──────────────────────────────────────────────────────┘ ║ │
│ ║ 15 questions · environ 11 min                            ║ │
│ ║ Tu peux t'arrêter quand tu veux.                         ║ │
│ ║              [    Commencer →    ]                       ║ │
│ ║              Je préfère autre chose ↓                    ║ │
│ ╚══════════════════════════════════════════════════════════╝ │
│                                                              │
│ SI TU PRÉFÈRES AUTRE CHOSE                                   │
│ ┌ 🌍 Histoire-Géo      1 diagnostic  ────────────────── › ┐  │
│ ┌ 🌱 SVT               2 diagnostics ────────────────── › ┐  │
│ ┌ ➗ Mathématiques     3 diagnostics ────────────────── ⌄ ┐  │
│ │   · Nombres relatifs — 20 questions · 15 min   Commencer →│ │
│ │   · Proportionnalité — 10 questions · 8 min    Commencer →│ │
│ │   · Triangles — 15 questions · 11 min          Commencer →│ │
│                                                              │
│ DÉJÀ MESURÉ AVEC TOI                                         │
│ ┌ ✓ Théorème de Pythagore                                 ┐  │
│ │   Maths · tu l'as passé le 12 juillet                   │  │
│ │            [Ce que ZETIS a retenu]  [Refaire ↻]         │  │
└──────────────────────────────────────────────────────────────┘
```

Maquette de référence : `mockup/mockup-page-diagnostic-massimo.html` (quatre états
sous la barre de maquette — cas courant, tout à jour, rien encore, témoin « nouveau »).

## Le tri — « commence par là »

**Règle : jamais mesuré d'abord, puis mesuré il y a le plus longtemps.**

Ce n'est pas une invention pour cette page : c'est la doctrine que
`notions_a_mesurer` applique déjà **un cran plus bas**, à l'intérieur d'un diagnostic
(ADR-0043 Décision 4) — *« un diagnostic sert à réduire l'incertitude ; remesurer ce
qui vient de l'être n'en réduit aucune »*. La refonte la **remonte au choix du
diagnostic**, où elle manquait.

Deux propriétés qui comptent :

- elle fait **tourner** le périmètre toute seule, sans tirage aléatoire — donc sans
  rendre deux passations incomparables ;
- elle ne regarde **jamais le résultat** d'une mesure, seulement son âge. C'est ce qui
  la rend montrable à un enfant.

Départage final : `quiz_id` décroissant, pour que deux diagnostics jamais mesurés
sortent dans un ordre déterminé (sinon la tête de liste change d'un chargement à l'autre).

**Le tri se fait côté client**, dans le hook. Motif : la règle est entièrement dérivable
des champs servis et ne cache rien. C'est une divergence **assumée** avec le motif
« élection serveur » des missions (`GET /api/missions/today`) — là-bas le serveur arbitre
parce qu'il y a un **scoring à ne pas exposer** (frontière ADR-0017 §3) ; ici il n'y a
aucun score, donc rien à retenir côté serveur.

## Données API

### `GET /api/diagnostics/quizzes` (`DiagnosticQuizListItem`) — ✅ LIVRÉ (Session A)

`quiz_id` · `title` · `subject` (le **nom**) · `subject_slug` · `questions_count` ·
`taken_at` · `last_attempt_id` · `measured_at`. **Aucune migration** — tout se calcule sur des
colonnes existantes.

- **`subject_slug: str`** — sans lui, le front ne peut pas appeler `subjectIconFor` et se met à
  hardcoder les matières.
- **`measured_at: str | null`** (ISO) — la mesure la plus récente parmi les notions **du
  diagnostic** : `QuizQuestion.skill_id` → `SkillMastery.last_seen_at` de Massimo, `max()`, via une
  **jointure gauche** (une notion jamais mesurée n'a aucune ligne, pas une ligne à `NULL`).
  **`null` = jamais mesuré.** C'est ce champ, et lui seul, qui porte le tri.
- **`taken_at: str | null`** (ISO) et **`last_attempt_id: int | null`** — la dernière passation
  terminée. ⚠️ Ils sortent de la **même ligne** (`_last_attempt`, qui remplace `_is_taken`) et ne
  peuvent donc pas se contredire. `taken` a disparu ; il reste dérivable.

> ⚠️ **Chaînes ISO, pas `datetime`** : convention du module (`DiagnosticResultSummary`) et de
> `packages/types`. Même format sur le fil, une seule manière de dire une date.
>
> ⚠️ **`DiagnosticListItem` reste LOCAL** à `apps/frontend-massimo/src/lib/diagnostic.ts`, non
> promu dans `packages/types` : ce contrat n'a qu'un consommateur — vérifié, Papa n'appelle de ce
> module que `/validate` et `/reject`. C'est un choix, pas un oubli.

Gate ADR-0043 : la liste ne rend que les diagnostics `validation_status = 'validated'`,
et `_servable_quiz_or_404` tient la même ligne sur l'accès direct par identifiant.
**Cette refonte ne touche pas au gate.**

⚠️ **Aucun tri serveur** : l'ordre reste `quiz_id` décroissant, la hiérarchisation est côté client
(Session C).

### 🔴 Ce qui manque, et qui n'est pas qu'un champ

**Massimo ne peut pas relire son propre résultat.** `GET /api/diagnostics/results` et
`GET /api/diagnostics/results/{attempt_id}` sont **`require_parent`**
(`diagnostics/router.py`). Le résultat lui est montré **une seule fois**, à la
soumission, puis devient inaccessible — Papa seul peut le rouvrir.

L'action « Ce que ZETIS a retenu » de la zone C **exige donc une route élève qui
n'existe pas**. La spec pose l'exigence ; la forme (nouvelle route `require_child`
avec contrôle d'appartenance de la passation, plutôt qu'élargissement de la route
Papa) relève de l'**ADR-0044** — la frontière élève/pilote en deux routers est une
doctrine du dépôt, pas un détail d'implémentation.

## Pendant le diagnostic (v1 conservée)

- Une question à la fois.
- Barre de progression.
- **Pas d'affichage de note brute immédiate.**
- Feedback léger : « réponse enregistrée ».

> 🔴 **L'implémentation actuelle contredit cette règle** : l'écran de résultat affiche
> « Score global : 63 % » (`DiagnosticPage.tsx`). La divergence est **antérieure** à
> cette refonte et n'est pas traitée ici — elle est signalée pour être tranchée à
> l'ADR-0044, avec la question de la relecture ci-dessus, dont elle est voisine.

## Après le diagnostic

Massimo voit : ses forces ; ses prochaines étapes ; **pas de tableau anxiogène**, **aucune note**.
Papa voit le détail dans son interface.

🔴 **Une notion réussie DANS CETTE PASSATION ne peut pas figurer dans « tes prochaines étapes ».**
Défaut vu à l'écran le 2026-08-08 : « Tes forces : Temps du récit » et, trois lignes plus bas,
« Notion à renforcer : Temps du récit ».

La cause est structurelle : les deux listes ne parlent pas du même moment. Les forces viennent de
**cette passation** ; les lacunes sont **lues en base** (ADR-0043 §5), et **rien ne referme une
lacune quand la notion est réussie** — le seul écrivain de `resolved` dans le dépôt est
`missions/service.py`. Une lacune ouverte par une passation ratée survit donc à sa remesure.

⚠️ **C'est un filtre d'AFFICHAGE, pas une résolution** : la lacune reste ouverte, Papa continue de
la voir, et c'est une mission qui la refermera. Faire refermer ses lacunes au diagnostic serait un
changement du cycle de vie — donc un ADR — et laisserait un diagnostic à 2 questions réussi par
chance effacer une vraie lacune.

**La suite** : un lien unique « Voir mes missions → » sous la liste. ⚠️ **Un seul, pas un par
ligne** — `MissionsPage` n'accepte aucun lien profond (contrairement à `/revision?subject=`), donc
N flèches iraient toutes au même endroit en laissant croire que chacune mène à SA notion. Les
flèches décoratives d'avant ne menaient nulle part : c'est le cul-de-sac dont l'ADR-0039 est né.

## États

- **Cas courant** : zone A (une proposition) + zone B (repliée) + zone C.
- **Tout est à jour** : aucun diagnostic non passé → la zone A devient une carte calme
  (« ✨ Tout est à jour — ZETIS a une mesure récente dans chacune de tes matières.
  Rien ne t'attend ici — tu peux quand même en refaire un si tu en as envie »), la zone B
  disparaît, la zone C reste. **Jamais une page vide.**
- **Rien encore** : aucun diagnostic relu → « Rien à mesurer pour l'instant. Papa prépare
  les diagnostics depuis son espace. Dès qu'il en laisse passer un, il apparaît ici. »
  Formulation qui **nomme l'acteur** et ne laisse pas Massimo devant un cul-de-sac.
- **Chargement / erreur** : Spinner partagé ; message + réessayer.

## Implémentation

- Logique dans un hook **`useDiagnostics`** — aucune logique métier dans le composant
  (tri, tête de liste, regroupement par matière, dépliage).
- La **raison** affichée en zone A est calculée à partir de `measured_at` seul
  (`null` → « jamais » ; sinon → « ça date »). Aucune autre entrée : c'est ce qui garantit
  qu'aucun résultat de mesure ne fuit dans la formulation.
- Durée estimée : dérivée de `questions_count`, déterministe. Précédent : `estimated_minutes`
  des missions, servi comme donnée d'affichage enfant.
- Icônes matière : `lib/subjectIcons.ts` (`subjectIconFor`), repli `subjectEmoji`.
- Thème Massimo (verre/néon, tokens `zetis-*`, primitives glass existantes).
- **375 px est un cas de test, pas une adaptation tardive** : l'iPhone est l'appareil de
  Massimo.

## Tranché par l'ADR-0044 (**Accepté** — 2026-08-08)

Les questions que cette spec avait laissées ouvertes sont décidées par
`docs/decisions/adr-0044-la-page-diagnostic-propose-au-lieu-de-lister.md` :

1. **La route élève de relecture et la forme du résultat n'en font qu'une** (Décision 5) :
   une nouvelle route `require_child` réutilise `result_detail` — la route Papa **n'est pas
   élargie** — et sert le **même schéma enfant** que `POST /submit`. Ce schéma perd
   `score_percent` et la `severity` des lacunes.
2. **Le score brut disparaît de l'écran de Massimo** — même décision. Il reste servi à Papa.
3. ~~**Diagnostic reste SANS témoin de nouveauté** (Décision 7)~~ — 🔴 **RÉVOQUÉ le jour même**
   par `docs/decisions/adr-0030-addendum-temoin-diagnostic.md`, décision du commanditaire prise
   après que l'objection lui a été exposée et **réaffirmée**. Voir ci-dessous.
4. **Aucun plafond** (Décision 4), **icône `🧭` partout** (Décision 8).

⚠️ La Décision 5 **sort du périmètre annoncé** de cette spec (l'entrée dans le diagnostic, pas
son déroulé). L'ADR le dit et l'assume : la zone C l'y force.

## Le témoin de nouveauté — une exception assumée (addendum ADR-0030)

**L'entrée « 🧭 Diagnostic » de la sidebar porte un témoin NUMÉRIQUE.** Il compte les diagnostics
**relus par Papa que Massimo n'a pas encore passés**, et **s'éteint au PASSAGE** — par le travail,
pas par le regard.

🔴 **C'est une exception nommée à la règle « NOUVEAU jamais DÛ »**, pas une clarification. Le
témoin tombe dans la colonne « Arriéré » du test de l'ADR-0030 : il naît d'un geste de Papa, meurt
du travail, et **grossit si Massimo ne vient pas**. L'addendum l'écrit noir sur blanc, avec le
contre-motif maintenu au dossier — ce qui suit n'est pas une justification, c'est un rappel des
**bornes opposables** :

- **une seule entrée** — la règle reste intacte pour les six autres ;
- le compteur **ne compte que du relu** : Papa est le robinet, et la seule régulation de volume ;
- **aucun décompte de jours**, sous aucune forme — cette interdiction-là n'est **pas** amendée ;
- aucune couleur d'alerte, aucune notification ;
- rien chez Papa.

Coût : **aucune migration**, le compte se dérive du `taken_at` livré en Session A, et rejoint
`GET /api/student/news/summary`. ⚠️ **Aucune trace de vue n'est à construire** — le témoin ne
s'éteint pas au regard.

⚠️ Le commentaire de `NavItem.newsKey` et son test-verrou doivent être **réécrits pour DIRE
l'exception**, jamais simplement élargis : ce test existe pour empêcher qu'on complète la liste
« par symétrie apparente », et un motif faux ne verrouille plus rien.

La maquette montre la pastille sur la carte, sous une bascule : c'est **la sidebar** qui la porte,
pas la carte.

## Hors périmètre

- L'écran de passation et l'écran de résultat (hors le point 2 ci-dessus) : cette refonte
  traite **l'entrée** dans le diagnostic, pas son déroulé.
- Les quatre optimisations de la **page Diagnostic de Papa** (jauges non cliquables, cran
  « proposé » en cul-de-sac, « en attente · non passé » qui ne nomme personne) : chantier
  sœur, décidé **après** celui-ci.
- Le gate de relecture ADR-0043 : intact.

## Voir aussi

- `docs/decisions/adr-0043-le-diagnostic-est-une-mesure-qui-engage.md` (Décision 4 : l'ordre
  par ancienneté de mesure, dont cette page est la remontée d'un cran)
- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (règle « NOUVEAU jamais DÛ »)
- `docs/decisions/adr-0030-addendum-temoin-diagnostic.md` (**l'exception**, ses cinq bornes, et
  la révocation de l'`adr-0044` Décision 7)
- `mockup/mockup-page-diagnostic-massimo.html`
- `docs/frontend-massimo/page-missions.md` (précédent : decks par matière, durée estimée,
  élection serveur — et pourquoi on ne la reprend pas ici)
