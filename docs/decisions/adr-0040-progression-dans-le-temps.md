# ADR-0040 — Progression nomme les notions et date leurs mouvements ; le Conseil cesse d'affirmer ce que l'évidence ne porte pas

## Statut

Proposé — 2026-08-06.

> S'appuie sur : `adr-0038` (Progression, l'avancement du programme, « une preuve mène quelque
> part »), son addendum `progression-agit` (le dépliage, l'invariant de recomposition, « le réseau
> ne sert que des NOMS »), `adr-0028` **§3 bis** (les quatre paliers, définition serveur) et
> **§3 ter** (`skill_mastery_history`), `adr-0028-addendum-memoire-quatre-vues` (stocks ≠ flux,
> `history_since`), `adr-0020` (le Conseil, narration LLM sur évidence calculée, ancrage
> anti-hallucination, rapport figé) et son addendum `portee-matiere` (le `period` est une
> étiquette), `adr-0011` (un substrat, plusieurs consommateurs).
>
> 🔴 **RÉVOQUE DEUX des trois non-objectifs restants de l'`adr-0038` §5**, et seulement dans les
> bornes du §3 ci-dessous : *« pas un historique — aucune série temporelle »* et *« aucune fenêtre
> temporelle »*. Le troisième — **pas un bulletin**, aucune note globale, aucun classement de
> matières (`adr-0028` §9) — reste **intact et opposable**.
>
> **Ne rouvre pas** : la définition des paliers ; la mesure « avancement = notions engagées /
> notions au programme » ; `reconstruct_series` et les quatre vues du dashboard ; le figeage
> systématique des rapports du Conseil ; l'absence de fenêtre temporelle **dans le service
> d'évidence**.
>
> **Une migration** — un index sur `skill_mastery_history`. **Une version de prompt** —
> `COUNCIL_PROMPT_VERSION` passe à `v3`.

---

## Contexte

Progression, livrée le 2026-08-05, répond à *« où en est-on, matière par matière ? »*. Elle y
répond bien, et elle s'arrête là. Deux manques, énoncés par le user le 2026-08-06 :

1. **aucune vision dans le temps** — la page est un stock lu « à aujourd'hui » ;
2. **aucune vision par notion** — Papa lit « Français · 10 / 96 · 1 acquise · 367 XP · 8 à
   renforcer » et ne peut nommer aucune de ces notions sans quitter la page.

Le second est presque résolu par le dépliage de l'addendum `progression-agit`, mais **par matière
seulement** : il n'existe aucune surface où les 280 notions se lisent ensemble.

### Ce que le read-before-code a trouvé

**1. Le `null` de « Depuis » recouvrirait deux absences.** `skill_mastery_history` ne commence
qu'au **31/07/2026** (`history_since`). Sur les 19 notions engagées de la base réelle, **10 n'ont
aucune bascule enregistrée**. « Non abordée, pas de date » et « abordée, bascule antérieure à la
trace » sont deux états distincts qu'un `int | null` confondrait — le motif exact de
`notions.total == 0` ≠ `has_referentiel: false`, déjà payé une fois.

**2. `mastered_at` est `NULL` sur la seule notion consolidée.** Si elle valait 13/07, le backfill
de la migration `a9b8c7d6e5f4` aurait posé une ligne d'historique à cette date et `history_since`
vaudrait 13/07. Il vaut 31/07, et l'addendum « quatre vues » constate qu'**aucune ligne ne franchit
le palier consolidé**. Conclusion : **aucune notion du dépôt n'a aujourd'hui d'entrée datable au
palier acquise.** La page doit pouvoir dire ce zéro sans le faire lire comme une absence de
mouvement.

**3. L'index de `skill_mastery_history` ne sert pas cet usage.** Il est `(student_id, changed_at)`,
taillé pour la courbe du dashboard qui balaie une fenêtre. Progression demande *la dernière bascule
de chaque notion* — accès par `(student_id, skill_id)` puis tri décroissant. Sans index adapté, un
`DISTINCT ON` sur 280 notions balaie la table à chaque montage.

**4. Trois surfaces emploient déjà « à renforcer » pour trois populations différentes.** Le KPI du
dashboard (`SkillMastery ∈ {weak, learning}` — 13), le titre de `LacunesPage` (`Gap` ouvertes — 1),
et `SEVERITY.medium` (un sous-ensemble de ce sous-ensemble). Le `GLOSSARY` tranche pourtant :
*« Formulée côté interface en lacune ouverte, jamais en notion à renforcer. »* Conséquence visible
aujourd'hui : `/lacunes` affiche **« Rien à renforcer pour le moment »** pendant que le dashboard
annonce 13 notions à renforcer.

**5. `GET /progress/skills?subject_id=` est documenté dans `API_SPEC.md` et n'existe pas.** La
section « Progression » porte l'avertissement *« documentée mais JAMAIS implémentée »*.

### Le défaut du Conseil, découvert en cadrant celui-ci

`CouncilReportSpec` porte, par matière :

```txt
recent_evolution: str        # non-nullable
```

Or l'addendum `portee-matiere` a constaté, code en main, que le `period` transmis **ne sélectionne
aucune donnée** — *« Évidence à l'instant (v1 : état courant, pas de fenêtre temporelle) »*.

> 🔴 **Un schéma déclare `str` non-nullable pour une valeur qu'aucune source ne peut produire.**
> Ce n'est pas un défaut de rédaction du prompt : c'est un contrat qui promet ce que le modèle de
> données ne porte pas. Le producteur remplit parce que le type l'y oblige.

Le garde-fou existe partout ailleurs — tout `skill_id` absent de l'évidence est ignoré — mais
**pas ici** : la validation Pydantic porte sur le *type*, jamais sur le *contenu*. Et le résultat
est **figé dans `council_reports.subjects_json`**, donc rétroactivement indiscernable du vrai.

Audit des quatre autres champs narratifs : `strengths`, `to_reinforce`, `justification` et
`global_summary` sont tous ancrés sur de l'évidence présente. **`recent_evolution` est le seul
champ à réclamer une donnée qui n'existe pas.** La faille est bornée.

### Le point dur, et il commande la décision

**Une fenêtre temporelle posée sur un palier est un mensonge ; posée sur un fait daté, elle est
exacte.**

Les quatre nombres de Progression sont des **stocks** sans reconstruction temporelle hors de
l'agrégat du dashboard. Un sélecteur de période appliqué à toute la page ferait lire un état comme
un résultat de période. Mais les bascules, les lacunes, les missions terminées, les passages SRS et
l'XP portent tous une date réelle. C'est cette ligne de partage — et non le refus global du §5 —
qui doit être écrite.

---

## Alternatives considérées

- **Une courbe sur Progression.** Le dashboard porte déjà quatre vues sur les mêmes données. La
  dupliquer, c'est exactement le signal d'échec que l'addendum `progression-agit` nomme
  lui-même : *« les deux surfaces se concurrencent au lieu de se compléter »*. → Écarté ; la
  répartition retenue est **dashboard = populations et tendances, Progression = notions nommées et
  faits datés**.
- **Un sélecteur de période sur toute la page.** Ferait varier `engaged`, `consolidated` et
  `fragile` avec la fenêtre, sans qu'aucune source ne le permette. → Écarté (§3).
- **Fondre « acquis / à renforcer / lacunes » en une colonne à trois valeurs.** C'est la demande
  telle qu'elle a été formulée, et c'est le bug d'`adr-0028-addendum-analyse-par-matiere` reproduit :
  13 fragiles pour 1 lacune ouverte, deux populations disjointes. → Écarté ; **deux axes
  indépendants** (§4).
- **Fusionner Progression et `/lacunes`.** Les deux boutons de génération de `/lacunes` sont de
  **portée globale** — leur propre `ConfirmDialog` le dit : *« la génération ne sait pas se
  restreindre »*. Une table filtrable ne peut pas porter un geste qui ignore le filtre. → Écarté ;
  les deux pages restent, avec un renommage qui les distingue (§5).
- **Ajouter `skill_id` à `XPEvent`** pour dater l'XP par notion. Migration, et l'addendum
  `progression-agit` §3 a déjà tranché : le XP est un stock de motivation, pas un instrument
  d'analyse. → Écarté, inchangé.
- **Donner une vraie fenêtre temporelle au service d'évidence.** Rouvrirait `evidence/service.py`
  pour tous ses consommateurs — missions, Conseil, panneau d'analyse. → Écarté ; chantier à part.
  Le `period` du Conseil reste une **étiquette** (§9).
- **Réécrire les `recent_evolution` déjà figées.** Contredit la doctrine de l'`adr-0020` : un
  artefact LLM n'est pas rejouable, l'auditabilité vient du figeage. → Écarté au profit d'une
  **marque de lecture dérivée de `prompt_version`** (§8).

---

## Décision

### §1 — Progression porte trois grains, dans un seul écran

Un sélecteur de vue en tête de page — patron `WorkRhythmCard`, repris par la carte mémoire.

| Vue | Unité | Fenêtre |
|---|---|---|
| **Par matière** *(défaut)* | la matière | aucune — stock « à aujourd'hui » |
| **Par notion** | la notion | aucune — stock « à aujourd'hui » |
| **Par période** | le **fait daté** | 7 / 30 / 90 / 365 |

La table matière **n'est pas remplacée** : elle est mesurée, elle est la cible d'un constat du
dashboard (`?subject=`), et son dépliage garde ce que les autres vues ne portent pas — l'XP par
motif et l'état du référentiel. Ses listes de notions deviennent en revanche des **liens** vers la
vue notion pré-filtrée : une liste, un seul endroit.

Largeur de page portée à `max-w-6xl` sur les trois vues. Faire varier la largeur du shell selon
l'onglet ferait sauter la page à chaque bascule.

Maquette de référence : `docs/frontend-papa/mockup/maquette-papa-progression.html`.

### §2 — La fenêtre n'existe QUE dans la vue où chaque nombre est daté

> 🔴 **Aucun palier, aucun stock, aucune barre d'avancement dans la vue « Par période ».**

Ce qui y figure — et rien d'autre : bascules de palier, lacunes ouvertes et résolues, missions
terminées, quiz notés, révisions notées.

**La production n'y figure pas** (cours rédigés, dérivés produits) : elle est datée, mais elle
mesure le stock de contenu, pas la progression de Massimo. Sa maison est **Couverture**.

**L'XP n'y figure pas non plus**, et c'est le seul retrait qui demande une justification :

- il apparaîtrait sous le même mot que la colonne « XP » de la vue matière, qui compte **depuis
  toujours** — deux nombres, un mot, la classe de bug que ce dépôt a déjà payée deux fois ;
- il est le **seul compteur que le journal affiché dessous ne pourrait pas recomposer**
  (`XPEvent` ne porte pas de `skill_id`), ce qui casserait l'invariant du §6 pour tous les autres ;
- l'`adr-0028` §5 l'a retiré des KPI parce qu'il n'est **pas décisionnel**. Le remettre dans une
  surface d'analyse le contredirait.

L'XP reste donc un **stock**, sur la vue matière, exactement là où l'`adr-0038` §3 l'a mis.

### §3 — Ce qui est révoqué du §5, et ce qui ne l'est pas

| Non-objectif `adr-0038` §5 | Sort |
|---|---|
| pas un bulletin — aucune note globale, aucun classement | **intact** |
| pas un historique — aucune série temporelle | **révoqué pour les faits datés et nommés** ; aucune **série** ni **courbe** n'est autorisée pour autant |
| aucune fenêtre temporelle | **révoqué dans la seule vue « Par période »** ; les deux autres restent des stocks, sans sélecteur |

La révocation est étroite par construction : elle autorise des **événements**, jamais des
**agrégats temporels**. Une courbe sur Progression resterait une faute après cet ADR.

### §4 — Palier et lacune sont deux axes indépendants, jamais une colonne

La vue notion porte un filtre de **palier** (acquise / à renforcer / en cours / non abordée,
mutuellement exclusifs) et un filtre **lacune ouverte** (booléen, indépendant). Une notion peut
être « à renforcer » sans lacune, et porter une lacune ouverte en étant « en cours ».

Une infobulle permanente le dit à l'écran, avec les deux nombres côte à côte (13 et 3) et la phrase
qui les sépare : *« ces deux nombres n'ont aucune raison d'être égaux »*.

**Défaut de filtrage : les trois paliers engagés.** « Non abordées » (261) reste visible et compté,
éteint par défaut. Le filtre est déclaré, jamais silencieux — le catalogue vit sur Programme.

**Les compteurs des pastilles portent sur l'année entière, jamais sur la sélection courante.** Même
doctrine que les boutons de `/lacunes`, qui annoncent le compte réel de ce qu'ils vont créer.

### §4 bis — Trois tris, et celui par date découvre une seconde population

La vue notion propose **trois tris**, dans cet ordre : **notion** *(défaut)*, **matière**, **date**.
Ce ne sont pas les niveaux d'une clé composée — un nom de notion étant unique, les deux autres
critères ne départageraient jamais rien.

| Tri | Clé | Départage |
|---|---|---|
| **Notion** | nom, accents pliés, `fr` | matière, puis `skill_id` |
| **Matière** | **ordre de l'année scolaire**, jamais alphabétique | nom de notion, puis `skill_id` |
| **Date** | dernière bascule, décroissante | nom de notion, puis `skill_id` |

L'ordre des matières est celui de la table « Par matière ». Un ordre alphabétique ferait diverger
deux vues du même écran.

Chaque tri se termine par `skill_id` : sans cette queue, deux notions homonymes de matières
différentes changeraient de place d'un rendu à l'autre — la même raison qui impose
`created_at DESC, id DESC` au journal de production.

> 🔴 **Le tri par date scinde la liste en trois blocs, jamais en une liste continue.** Sur les 19
> notions engagées de la base réelle, **15 n'ont aucune bascule datée** (chiffre corrigé au Lot 1
> — le cadrage annonçait 10 ; mesure du 2026-08-06 : 19 lignes de maîtrise, 4 notions seulement
> portent une bascule tracée. La décision n'en est que plus nécessaire). Les glisser en fin de liste
> sans marque les ferait lire comme « les plus anciennes » — l'exact contresens.

```txt
  ▸ Théorème de Pythagore     en cours        1 j
  ▸ Registres de langue       à renforcer     2 j
  …
  ── sans bascule enregistrée · 10 ──────────────────────────
  ▸ Temps du récit            à renforcer     hors trace
  …
  ── non abordées · 261 ─────────────────────────────────────
  ▸ Subordonnées conjonctives non abordée     —
```

Les deux séparateurs sont **distincts et comptés**, parce que les deux absences le sont (§7). Les
fondre en un seul bloc « sans date » annulerait la distinction que le §7 vient d'établir dans le
type.

⚠️ **Le tri ne s'applique pas à la vue période** : un journal est chronologique par nature, et lui
offrir un tri par notion en ferait une seconde vue notion mal déguisée.

### §5 — Trois surfaces, trois vocabulaires, un test-verrou

`LacunesPage` est renommée pour rendre la nouvelle page lisible :

| Aujourd'hui | Après |
|---|---|
| titre « Notions à renforcer » | **« Lacunes ouvertes »** (libellé du `GLOSSARY`) |
| `SEVERITY.medium` : « à renforcer » | **« à traiter »** |
| état vide : « Rien à renforcer pour le moment » | **« Aucune lacune ouverte »** + *« des notions peuvent rester fragiles sans lacune ouverte → voir Progression »* |

`SEVERITY.low` / `high` (« à surveiller » / « prioritaire »), le sous-titre et la doctrine
chromatique (aucune teinte rouge) sont inchangés.

> **Test-verrou** : la chaîne « à renforcer » est interdite dans un contexte `Gap`, et « lacune »
> dans un contexte `SkillMastery`. Le dépôt a déjà prouvé deux fois qu'un mot partagé finit par
> fondre deux mesures.

La colonne « Lacune » de Progression **ne pointe pas ligne à ligne** vers `/lacunes` : le lien vit
sur le filtre (`?subject=`, déjà lu par `useLacunes`). Un lien par ligne promettrait un écran
centré sur une notion, que cette page ne rend pas.

### §6 — Trois natures de fait, trois débuts de trace, déclarés à l'écran

C'est le cœur de l'honnêteté de la vue période.

| Nature | Début de trace |
|---|---|
| bascules de palier | `history_since` — **31/07/2026** |
| révisions notées | première `SpacedReviewAttempt` — **04/07/2026** |
| lacunes, missions, quiz | **complète** |

Chaque compteur porte sa borne. Quand la fenêtre demandée commence **avant** la borre d'une
nature, le compteur est marqué et un avertissement le nomme.

> 🔴 **Un compteur bas dit alors « pas de trace », jamais « pas de mouvement ». Les deux ne se
> corrigent pas l'un l'autre.**

Corollaire testable et non négociable : sur une fenêtre de 90 jours, le compte des bascules est
**identique** à celui de 7 jours si aucune bascule n'a eu lieu entre-temps — et l'écran doit
l'expliquer plutôt que de le laisser lire comme une stagnation.

**Les compteurs sont dérivés du journal affiché**, pas servis à part : l'invariant « le détail
recompose le nombre » de l'addendum `progression-agit` §2, transposé de la ligne à la fenêtre.

### §7 — Deux absences ne partagent pas un `null`

```txt
since: { days: int }
      | { unknown: "before_history" }     # abordée, bascule antérieure au 31/07
      | { unknown: "before_migration" }   # consolidée avant la migration des dates
      | null                              # non abordée — aucune ligne de maîtrise
```

`null` **uniquement** pour les non abordées. Les deux `unknown` se rendent « hors trace » avec des
libellés distincts, parce que leurs causes le sont — l'une se comblera d'elle-même, l'autre est
définitivement perdue.

**Aucune ré-énumération de statuts.** `SkillMastery.status` a **six** valeurs, `in_progress` étant
écrit par `missions/service.py` hors de tout `_status_from_score()` — le piège que `adr-0024` puis
`adr-0028` signalent tous deux comme raté en silence. La route **importe** le regroupement canonique
(`dashboard/projections`) et `OPEN_GAP_STATUSES` (`progress/service`). Elle n'en recopie aucun, et un
test-verrou l'exige : ajouter une septième valeur doit faire échouer un test, pas glisser dans
« non abordée ».

### §8 — Le serveur a le dernier mot sur `recent_evolution`, comme partout ailleurs

Le champ cesse d'être de la prose et devient une **structure calculée, éventuellement commentée** :

```txt
recent_evolution: {
  since: date,                     # history_since — la borne de la trace, PAS le period
  transitions: [ { skill_id, skill_name, from, to, changed_at } ],   # SERVEUR
  comment: str | null              # LLM — refusé si transitions == []
} | null                           # null == aucune bascule sur la portée
```

Quatre règles :

1. **Écrasement serveur.** Après validation typée, si l'évidence ne porte aucune bascule pour cette
   matière, le champ est forcé à `null` — quoi que le modèle ait écrit. C'est la correction du
   défaut, et elle tient **sans** la mesure du §10 : avec l'évidence d'aujourd'hui, elle vide
   simplement le champ partout, ce qui est exact.
2. **Ancrage sur les dates comme sur les `skill_id`.** Les transitions arrivent au prompt en liste
   fermée ; toute notion ou date absente du contexte est rejetée à la validation.
3. **`since` entre dans le prompt ET dans `evidence_snapshot_json`.** Un rapport du 06/08 écrivant
   « aucune régression ce trimestre » alors que la trace s'ouvre le 31/07 serait un mensonge **figé
   et auditable comme vrai**. Le prompt impose la formule : *« sur la trace disponible depuis le
   31/07 »*.
4. **L'absence s'écrit.** `null` ne rend pas une section vide mais la phrase de `history_since` —
   l'absence de trace n'est jamais l'absence de mouvement.

**Invariant** : `len(transitions)` égale le compte de l'évidence. **Plafond** aligné sur celui des
notions (8 en portée globale, 16 en portée matière), et l'écart déclaré dans le snapshot — patron
`scope.notions_available` / `notions_considered` déjà en service.

**Rapports déjà figés** : aucune réécriture. **Marque de lecture dérivée de `prompt_version`** —
tout rapport `< v3` affiche *« évolution rédigée sans historique daté »*. Zéro migration, et la
marque s'éteint d'elle-même à mesure que les rapports v3 s'accumulent, comme l'avertissement
`history_since`.

**Test-verrou** : un provider factice renvoyant une évolution alors que l'évidence ne porte aucune
bascule doit produire un rapport dont `recent_evolution` vaut `null`. Miroir exact du verrou de la
portée matière.

### §9 — `history_since` n'est pas `period`, et les deux ne partagent pas un nom

`period` ne sélectionne aucune donnée et reste une **étiquette** (addendum `portee-matiere` §6).
`transitions.since` est une date réelle. Deux bornes distinctes ne doivent pas partager un nom :
les fondre rendrait indétectable, demain, le défaut qu'on corrige aujourd'hui.

Conséquence assumée : **un rapport du Conseil mêle deux natures** — des bascules datées et une
maîtrise sans fenêtre. C'est **déclaré** dans le prompt et dans le snapshot. Le taire rouvrirait par
la fenêtre le « ne pas mentir » que l'addendum a fermé par la porte.

### §10 — Une seule fonction de mesure, dans `evidence`

```txt
evidence/service.py :: mastery_transitions(student, since, subject_id=None)
        │
        ├──► progress/    → Progression (les noms et les dates, à l'écran)
        └──► reports/     → le Conseil   (les mêmes, en prose ancrée)
```

Si Progression calculait ses bascules dans `progress/` et le Conseil les recalculait dans
`reports/`, on refabriquerait la classe de bug que ce dépôt paie depuis trois chantiers : deux
mesures divergentes sous un même mot. `adr-0011` : un substrat, plusieurs consommateurs, zéro
duplication.

⚠️ Contrainte du module respectée : `evidence/service.py` ne reçoit que des données **probantes**.
Des bascules horodatées écrites par `record_mastery_transition` en sont ; l'agenda n'en était pas.

**Seules les bascules de palier remontent au Conseil.** Ni quiz bruts, ni SRS : ils sont déjà dans
l'évidence sous forme agrégée (`weighted_quiz_signal`, `srs_pressure`), et servir l'événementiel
brut ferait exploser le budget de jetons du plafond — en plus de rejouer le « le LLM calcule
lui-même » écarté par l'`adr-0020`.

### §11 — Le contrat réseau

| Besoin | Route |
|---|---|
| table matières | `GET /progress/overview` — **inchangée** |
| index des notions + faits datés | 🆕 `GET /progress/skills` — la section d'`API_SPEC` qui la documente dit « n'existe pas » ; on l'écrit |
| frise d'une notion | 🆕 `GET /progress/skills/{skill_id}/timeline` |

`GET /progress/skills` sert **une requête agrégée** — 280 notions × (maîtrise, dernière bascule,
lacune, mission active) en une passe, **aucun N+1**, aucune pagination, **aucun paramètre de
période**. Filtres, recherche lexicale et bascule de vue sont **client, zéro requête** — patron
`adr-0024-addendum-page-matiere-index-notions`. **Test de nombre de requêtes constant**,
indépendant du nombre de notions et de matières.

La frise est **paresseuse, par notion** : c'est la **troisième exception assumée** au « zéro état de
chargement » de l'`adr-0028` §4, après le drill-down d'un jour et le panneau d'analyse. Même motif :
une descente vers un détail non borné, pas un filtre.

### §12 — La migration

```txt
skill_mastery_history : index (student_id, skill_id, changed_at DESC)
```

L'index existant `(student_id, changed_at)` sert le balayage de fenêtre du dashboard ; il ne sert
pas « la dernière bascule de chaque notion ». Aucune colonne, aucun backfill.

---

## Ce que cet ADR ne fait pas

- **Il ne donne pas de fenêtre temporelle au service d'évidence.** Le `period` du Conseil reste une
  étiquette.
- **Il n'ajoute aucune courbe, aucune série, aucun agrégat temporel** — la révocation du §5 porte
  sur des événements nommés, rien de plus.
- **Il ne touche pas à `XPEvent`**, ni à son absence de `skill_id`.
- **Il ne réécrit aucun rapport figé.**
- **Il ne fusionne pas Progression et `/lacunes`**, et ne modifie aucun de ses deux générateurs.
- **Il n'ajoute aucun mode aperçu au Conseil** : le figeage systématique reste la doctrine.
- **Il n'atteint aucune surface Massimo.** `require_parent` de bout en bout.

---

## Le signal qui dirait qu'on s'est trompé

- **Papa ne bascule jamais sur « Par période ».** Alors la vue période sera une réponse à une
  question que personne ne pose — et il faudra la retirer, pas l'enrichir.
- **Quelqu'un lit un compteur bas de la vue période comme une stagnation.** Le §6 aura échoué là où
  il compte le plus, et c'est le rendu des bornes de trace qu'il faudra reprendre.
- **Un `recent_evolution` v3 affirme un mouvement absent des `transitions`.** L'ancrage aura été
  contourné — vérifier d'abord que l'écrasement serveur du §8.1 court bien après la validation.
- **La vue notion devient la page et les deux autres un menu.** Il faudra alors assumer une page
  par grain, pas empiler dans un sélecteur.
- **Le mot « à renforcer » réapparaît sur une surface `Gap`.** Le test-verrou du §5 aura été
  désarmé ; c'est lui qu'il faut réparer, pas le libellé.

---

## Suivi

### Quatre lots, dans cet ordre

**Lot 0 — le verrou du Conseil** (§8.1, §8 marque de lecture, test-verrou). Ne dépend de rien,
ferme la faille immédiatement. `COUNCIL_PROMPT_VERSION` → `v3`. Aucune migration.
Commit : `fix(reports): recent_evolution never asserts what evidence does not carry`

**Lot 1 — la mesure** (§10, §11, §12). `mastery_transitions` dans `evidence`, les deux routes,
la migration d'index, le test de nombre de requêtes constant.
Commit : `feat(progress): dated mastery transitions and the notion index`

**Lot 2 — l'écran** (§1 à §7). Les trois vues, la frise, le renommage de `LacunesPage`, le
test-verrou de vocabulaire.
Commit : `feat(papa): progression in three grains — subject, notion, period`

**Lot 3 — la narration ancrée** (§8.2 à §8.4, §9). `recent_evolution` se remplit enfin, avec de la
donnée.
Commit : `feat(reports): council narrates dated transitions, bounded by the trace`

Motif de l'ordre : le Lot 1 rend la donnée **vérifiable à l'œil** (Lot 2) avant qu'un LLM ne la
raconte (Lot 3). L'inverse ferait relire une prose sans pouvoir la confronter à rien — ce que fait
exactement `recent_evolution` aujourd'hui.

### Documents

- ligne dans `DECISIONS.md` ;
- **réécriture** de `docs/frontend-papa/page-progression.md` (trois vues, les bornes de trace, les
  états) ;
- **création** de `docs/frontend-papa/page-lacunes.md` — la page existe en code et n'a **aucune
  spec** ; on ne la renomme pas sans lui en donner une ;
- `API_SPEC.md` : les deux routes, et **retrait** de `GET /progress/skills` de la section
  « documentée mais jamais implémentée » ;
- `DATA_MODEL.md` : l'index, et la note sur les deux natures d'absence ;
- `GLOSSARY.md` : entrée **« Bascule de palier »**, et renfort de la frontière palier / lacune avec
  le libellé de page corrigé ;
- `CHANGELOG.md` 0.53.0 ;
- `page-conseil-classe-ia.md` : le champ typé, la marque de lecture des rapports `< v3`.

### Prompts Claude Code

Un par lot, écrits **après** validation de cet ADR et de la maquette, documents commités d'abord.
Read-before-code obligatoire sur : `evidence/service.py`, `progress/service.py`,
`dashboard/projections.py`, `reports/service.py`, `app/prompts/council.py`, `LacunesPage.tsx`,
`ProgressionPage.tsx`, `SubjectDetailRow.tsx`.
