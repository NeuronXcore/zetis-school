# GLOSSARY.md — Glossaire ZETIS

## ZETIS

Assistant éducatif IA du projet.

## Massimo

Utilisateur enfant principal du MVP.

## Papa

Utilisateur parent/administrateur pédagogique.

## ELI5

Méthode d’explication très simple : “Explain Like I’m 5”. Dans ZETIS, ELI5 a deux sens : ZETIS explique simplement, puis Massimo explique à son tour pour prouver la compréhension.

## ELI5 reverse

Mode où Massimo explique la notion à ZETIS. ZETIS évalue la clarté, les points manquants et propose une correction bienveillante.

## RAG

Retrieval-Augmented Generation. Méthode qui permet à l’IA de répondre à partir de documents indexés plutôt que seulement de sa mémoire interne.

## Chunk

Morceau de texte extrait d’un document pour le RAG.

## Embedding

Représentation vectorielle d’un texte, utilisée pour rechercher des passages proches sémantiquement.

## Lacune

Notion insuffisamment maîtrisée qui nécessite une remédiation.

## Mission

Séquence d’apprentissage courte et actionnable donnée à Massimo.

## Quiz

Évaluation courte d’une ou plusieurs notions.

## Diagnostic

Évaluation plus globale destinée à identifier les lacunes et priorités.

## Spaced memory

Mémoire espacée : planification de révisions selon la difficulté et les réussites.

## Capsule IA

Courte vidéo/audio/animation pédagogique générée par ZETIS pour expliquer une notion.

## Cahier de bord IA

Journal pédagogique synthétique consulté par Papa.

## Conseil de classe IA

Synthèse périodique par matière avec points forts, points faibles et recommandations.

## Mode focus

Mode piloté par Papa pour concentrer Massimo sur une matière ou une notion prioritaire.

## XP

Points d’expérience attribués à Massimo pour valoriser effort, régularité et progression.

## Régularité douce

Nombre de jours de la semaine courante (lundi→dimanche, Europe/Paris) où Massimo est venu — au
moins un événement dans `learning_events`, la connexion suffisant à cocher la journée. Servie en
7 cases par `GET /api/student/motivation/week`, affichée côté enfant sous le nom **« Ma semaine »**
(« Régularité » est le mot de Papa, un mot d'évaluation).

C'est un **compte**, pas une série : il ne peut pas casser, un jour manqué ne retire rien, et le
lundi il repart de zéro — un départ, pas une chute. Il n'existe volontairement ni « jours
consécutifs », ni « meilleure série », ni « record » : les fournir rebâtirait le streak sous un
autre nom.

> **Remplace le « streak »** (retiré en 0.24.0), qui tombait à zéro dès un jour entier manqué et
> se calculait en UTC. Un capital qu'on peut perdre fait venir par peur de perdre : ce n'est pas
> de l'auto-motivation.

## Engagement hebdomadaire

Nombre de jours (1 à 7) que Massimo se donne **lui-même** en début de semaine. Écrit par l'enfant
seul — si Papa pouvait le poser, ce ne serait plus un engagement mais une consigne, et le levier
d'autonomie disparaîtrait. La semaine est toujours déduite serveur : ni modification rétroactive,
ni reproche sur une semaine passée. Réviser à la baisse est autorisé, sans confirmation ni trace.

**Rien n'est affiché ni stocké quand l'objectif n'est pas atteint** : ni « il te reste N jours »,
ni historique des semaines passées. Le contrat serveur ne porte aucune donnée de manque.

## Niveau · Palier (autonomie de ZETIS)

**Deux mots, deux objets, et les confondre est l'erreur la plus facile du dossier ADR-0032.**
Le test qui les sépare : **un niveau se CHOISIT, un palier se SUBIT.**

| | Ce que c'est | Valeurs |
|---|---|---|
| **Niveau** (*level*) | l'un des **trois régimes** que Papa choisit | *Manual · Hybrid · Autonom* (clés `manuel · semi · autonome`) |
| **Palier** | le degré d'autonomie **d'une classe de contenu** | `0` Jamais · `1` ZETIS propose · `2` Vous validez · `3` ZETIS sert |

Un **niveau** décide les **paliers** de deux classes (A0a dérivés, A1 cours) ; les quatre autres
sont verrouillées et ne l'écoutent pas. Le niveau n'est **jamais stocké** — il se *dérive* des six
paliers, et vaut `null` (« Sur mesure ») s'ils ne correspondent à aucun régime.

⚠️ Une phrase comme « le niveau de cette classe » est **fautive** : une classe a un *palier*.

> Convention fixée à l'addendum **ADR-0032 §8.0** (2026-08-04), après qu'un même mot a désigné les
> deux objets dans un même écran. Le code s'y aligne — `AutonomyNiveau`, `AutonomyPalier`,
> `NIVEAU_LABEL`, `PALIER_LABEL` — et le champ JSON s'appelle `niveau`.

## Notion consolidée

Notion dont la maîtrise a atteint le palier `mastered` (score ≥ 90, paliers partagés par le
diagnostic et le quiz). `solid` (≥ 70) n'est volontairement **pas** compté : « consolidé » doit
vouloir dire acquis, pas « presque ». L'instant de bascule est horodaté (`skill_mastery.mastered_at`)
et n'est jamais re-tamponné tant que la notion reste consolidée — sans quoi « consolidées cette
semaine » recompterait éternellement les mêmes notions.

## Notion à renforcer

Notion dont la maîtrise n'est pas assurée : `SkillMastery.status ∈ {weak, learning}`, définition
portée par `dashboard/projections.FRAGILE_STATUSES`. Une notion qui **redescend** de `mastered`
atterrit ici — c'est le seul signal de régression du dashboard, et il est daté par
`skill_mastery_history` (ADR-0028 §3 ter).

⚠️ **Ce n'est PAS une « lacune ouverte »** (entrée suivante). Une notion peut être `weak` sans avoir jamais produit
de `Gap` (mauvais score à un quiz de fin de cours, sans diagnostic), et une lacune peut rester
ouverte alors que la maîtrise est repassée à `solid`. Les deux mesures n'ont **aucune raison
d'être égales** — relevé en base de dev le 2026-08-05 : **13** notions à renforcer pour **1**
lacune ouverte. Les fondre sous un mot unique a déjà coûté un bug
(`adr-0028-dashboard-papa-agregat-unique` (Amendement 1)), puis un affichage de « 1 » à côté de « 9 » sur le même
écran (`dashboardDerive.ts:276`).

## Lacune ouverte

Lacune dont le statut est `open` ou `in_progress`. Définition **unique** portée par
`progress/service.OPEN_GAP_STATUSES` (elle a existé en quatre exemplaires divergents).

Formulée côté interface en « **lacune ouverte** », jamais en « notion à renforcer » : ce libellé-là
appartient au palier de maîtrise ci-dessus. Une lacune est une **décision ouverte** (diagnostic
faible, erreurs répétées, marquage de Papa), pas un palier. Le vocabulaire d'échec reste interdit
dans les deux cas (CLAUDE.md).

## Session (activité)

Suite d'événements de `learning_events` espacés de moins de `SESSION_GAP_MINUTES` (15 min). Les
sessions **ne sont jamais stockées** : elles sont reconstruites à la lecture, si bien que changer
la constante recalcule tout l'historique sans migration. Le **temps actif** associé est une
heuristique de PRÉSENCE (somme des écarts plafonnés à 5 min), pas une mesure d'attention — et il
reste strictement côté Papa.
