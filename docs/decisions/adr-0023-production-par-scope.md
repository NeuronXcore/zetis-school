# ADR-0023 — Production de contenu par scope : extraire l'équipement et l'exposer depuis la Couverture

## Statut

**Remplacé — 2026-08-02, par l'[ADR-0031](adr-0031-production-en-lot-et-journal.md).**
Accepté le 2026-07-28, **jamais implémenté** : cinq semaines plus tard, aucune de ses décisions
n'existait en code — `equip_notion` était toujours dans `reports/`, `plan(scope)` n'existait pas,
il n'y avait ni endpoint 202 ni worker, le bouton « ⚡ Compléter le chapitre » était encore
désactivé, et `batch_id` comme `PRODUCTION_MAX_PENDING` n'ont jamais quitté cette prose.

> **Ce qui est remplacé est le PLAN D'EXÉCUTION, pas la doctrine.** L'ADR-0031 reprend les cinq
> décisions validées ci-dessous **telles quelles** et les exécute. Ce document reste la référence
> pour leurs motifs — en particulier le §7 (deux passes non fusionnables, gate humain sur la
> rédaction de cours « qui ne bouge pas ») et l'observation du §Suivi, que l'ADR-0031 érige en
> livrable.
>
> Il est conservé et non supprimé pour une raison précise : **une décision acceptée puis restée
> lettre morte cinq semaines est en soi une information**, et le découpage en slices qui n'ont
> jamais été livrées explique pourquoi le chantier d'autonomisation a été cadré sur un socle
> qu'il croyait exister.

> S'appuie sur : `adr-0021` (orchestrateur d'équipement — cours/fiche/SRS/quiz/mindmap par
> notion, auto-validation bornée, dégradation leçon-centrée, `try/except` par pièce),
> `adr-0011` + **addenda §E (fraîcheur) et §F (provenance)**, `adr-0011 §1` (patron du module
> neutre à consommateurs multiples), `adr-0008` (100 % local), `adr-0017 §5ter` (gate de
> validation). **Ne rouvre aucune décision** de l'ADR-0021 : il en **déplace le point d'entrée**
> et en **corrige l'idempotence** conformément au §E.6.

## Contexte

Besoin exprimé (Papa) : *« je dois tout créer en manuel à chaque fois — leçons, fiches, quiz.
Comment produire les données de Massimo par lots ? »*

Constat en read-before-code : **l'orchestrateur de production existe déjà.** L'ADR-0021 a livré
l'équipement d'une notion — les cinq générateurs orchestrés, l'idempotence, la dégradation
gracieuse, les barres de progression, le récapitulatif. Le chantier n'est donc pas d'écrire un
moteur de lot, mais de lui donner **un second point d'entrée**.

Trois écarts séparent l'existant du besoin :

1. **Le scope.** L'équipement part d'une **notion**, résolue depuis une recommandation du
   Conseil de classe. Le besoin part d'un **chapitre** — l'unité de la progression scolaire
   réelle (« on attaque le chapitre 3 la semaine prochaine »).
2. **Le point d'entrée.** L'endpoint vit sous le module `reports` (ADR-0021 §Périmètre), ce qui
   n'a plus de sens pour un appel venu de la page Couverture. C'est le patron
   `canonical_context` qui s'applique : un service consommé par plusieurs surfaces vit dans un
   module neutre, sinon le second consommateur le réécrit (ADR-0011 §1).
3. **L'exécution.** L'équipement est aujourd'hui synchrone avec barres estimées — acceptable
   pour 1 à 3 notions. Un chapitre de 5 leçons dépasse dix minutes : trop long pour rester
   devant l'écran, et le travail meurt si l'onglet se ferme.

## Alternatives considérées

- **Un second orchestrateur pour le scope chapitre** : deux chemins de génération qui
  divergeraient au premier correctif. C'est exactement le mal que l'ADR-0011 §1 existe pour
  empêcher. → Écarté ; extraction, pas duplication.
- **Cron nocturne** (production automatique après validation d'un cours) : le déclencheur
  événementiel « après ma validation » est légitime — valider un cours *est* la décision
  humaine, en dériver un quiz n'en est pas une seconde. Mais il ajoute trois inconnues d'un
  coup (ordonnanceur, réveil machine, exécution sans témoin) alors que la question ouverte est
  ailleurs : *combien de temps, et la qualité tient-elle sur un lot ?* → **Reporté** (§Hors v1),
  avec son antidote déjà identifié (plafond d'arriéré, §Décision 5).
- **Exécution synchrone, patron « Rédiger les cours manquants »** : plus simple, mais cloue
  Papa devant l'écran et meurt à la fermeture de l'onglet — c'est précisément ce qui fatigue
  aujourd'hui. → Écarté.
- **Parallélisme des générations** : un seul moteur résident, aucun gain, et dégradation de la
  latence des usages interactifs de Massimo. → Écarté (ADR-0021 §Périmètre l'excluait déjà).

## Décision

### 1. Extraire l'orchestrateur dans un module neutre

Le service d'équipement quitte `reports` pour un module neutre (`app/modules/production/`),
consommé **sans modification** par ses trois appelants : le Conseil de classe (ADR-0021), la
composition champion (ADR-0022 §5) et la Couverture. Refactor de déplacement, **zéro changement
de comportement** — les tests existants doivent passer inchangés.

### 2. Le scope chapitre est une **résolution**, pas un nouvel orchestrateur

`plan(scope) -> [notion]`. Un chapitre se résout en ses leçons validées → `lesson_skills` →
notions. L'orchestrateur reçoit la même liste de notions qu'aujourd'hui. Fonction **pure**,
testable, sans IA — et c'est **la même** que celle qui calcule la matrice de couverture : un
substrat, deux consommateurs (la page affiche, la production exécute).

### 3. Idempotence corrigée : « déjà validé **et frais** » (§E.6)

L'ADR-0021 §5 saute toute pièce existante. Une pièce **périmée** est `validated` : elle serait
donc propagée indéfiniment. La règle devient :

- absente → générer ;
- présente et fraîche → sauter ;
- présente et **périmée** → **régénérer** ;
- `pending` et fraîche → valider (comportement ADR-0021 §5 inchangé) ;
- `pending` et **périmée** → régénérer, **jamais valider** (valider un contenu obsolète est
  pire que ne rien faire).

Cette correction s'applique **à tous les appelants**, Conseil de classe compris : elle vit dans
l'orchestrateur, pas dans la Couverture.

### 4. Exécution asynchrone, sans ordonnanceur

`POST /api/production/equip` → **202** + `batch_id` ; consommation par `worker-ai` via RQ.
Patron **déjà éprouvé** par le rendu MP4 des capsules (ADR-0007 Lot 2 : `POST /render` → 202 →
`status` → `published`). Papa ferme l'onglet, revient plus tard. Séquentiel strict.

Aucun `launchd`, aucun `pmset`, aucun réveil machine : le déclenchement reste un clic. Le jour
où le cron arrive, il appelle **le même endpoint** — il n'a rien à changer.

### 5. Trois invariants d'exécution

- **Massimo passe devant.** Avant chaque tâche, le worker vérifie l'activité récente de l'élève
  (`learning_events` < 5 min) et se met en pause. Le batch tourne sur le même Ollama que
  l'interface élève ; sans garde, un lot lancé à 18 h dégrade l'expérience de Massimo.
- **Bâton d'autorité.** Le batch écrit massivement en base et sur MinIO. Il ne s'exécute que
  sur la machine détentrice du bâton — cas d'usage de la table `system_state` tenue en réserve.
- **Plafond d'arriéré de relecture.** La production s'arrête si la file de `pending` dépasse
  `PRODUCTION_MAX_PENDING` (config, v1 = 30). Une production qui dépasse durablement la
  capacité de relecture fabrique une dette qui tue le dispositif — et la page Couverture avec.
  Le système s'autorégule sur la capacité réelle plutôt que sur le temps disponible.

### 6. Provenance : `parent_bulk`, sans exception (§F)

Tout contenu produit par ce flux porte `validated_by='parent_bulk'` et son `validated_at`.
L'auto-validation de l'ADR-0021 §2 s'applique à l'identique — un geste Papa explicite, N objets,
aucune relecture pièce par pièce. La Couverture le rend visible ; **aucun compteur ne le
totalise** (§F.2).

### 7. Le blocage leçon devient la norme — la Couverture le traite en deux temps

L'ADR-0021 §3 saute les contenus leçon-dépendants pour une notion sans leçon canonique validée,
en signalant l'omission. Sur un scope **notion fragile**, c'est l'exception. Sur un scope
**chapitre**, c'est la règle : les leçons non rédigées sont précisément ce qui peuple les trous
de la matrice.

La Couverture propose donc explicitement **deux passes distinctes** :

1. **Rédiger les cours manquants** du chapitre → chaque leçon repasse en `draft` (addendum
   ADR-0009 §A) et **attend la validation de Papa** ;
2. **Équiper** — les dérivés, sur les leçons désormais validées.

Elles ne se fusionnent pas : un cours non relu ne doit pas engendrer de dérivés. C'est le seul
endroit du dispositif où le gate humain reste **obligatoire et bloquant**, et il ne bouge pas.

### 8. Périmètre v1 = un chapitre, trois dérivés

Cours + quiz + fiche. Mindmap et capsule restent à la demande (coûteuses, pas toujours
pertinentes). Test de validation du chantier : **un chapitre de 5 leçons**, assez gros pour
mesurer le temps réel et juger la qualité sur un lot, assez petit pour que la relecture reste
faisable dans la foulée.

## Hors v1

- **Cron / production différée** — reporté avec son antidote (§5, plafond d'arriéré). Déclencheur
  événementiel « après validation d'un cours », pas balayage. **Prérequis explicite : la file de
  relecture doit exister avant.** Automatiser la fabrication d'un goulot est le seul vrai risque
  de ce chantier.
- **File de relecture** — chantier distinct, et probablement le plus rentable des trois : le
  batch déplace le coût de la génération vers la relecture, il ne le supprime pas.
- Scope matière ou année entière ; parallélisme ; fabrication de leçon/chapitre manquant
  (ADR-0021 §Périmètre, inchangé) ; mindmap et capsule dans le lot.

## Conséquences

### Positives

- **Zéro nouveau générateur, zéro nouvelle dépendance** : extraction + résolution de scope +
  file RQ existante.
- Le §E trouve son consommateur décisif : `is_stale` cesse d'être un badge pour devenir un
  **prédicat d'orchestration** qui corrige un défaut réel de l'ADR-0021.
- Un substrat, deux consommateurs (planificateur partagé Couverture/production) — patron
  ADR-0011 tenu une fois de plus.
- Le cron devient un appel au même endpoint, pas un chantier.

### Négatives / coûts

- **L'auto-validation s'étend** d'un scope notion à un scope chapitre : le volume de contenu
  atteignant Massimo sans relecture pièce par pièce augmente d'un ordre de grandeur. Mitigé par
  §F (visible), §5 (plafonné), §7 (le cours reste gaté) — mais c'est le vrai coût de cet ADR et
  il doit être surveillé sur le premier chapitre réel.
- Un refactor de déplacement (`reports` → `production`) qui touche du code livré et testé.
- La correction d'idempotence change le comportement du Conseil de classe : des pièces périmées
  seront désormais régénérées là où elles étaient sautées. C'est le but, mais c'est un
  changement de comportement à annoncer.

## Suivi

- **Prérequis durs, dans l'ordre** : chantier « invariants de lecture des dérivés » mergé →
  Couverture Slice A (migration §E + §F, `is_stale`) mergée → ce chantier.
- **Slices** : (A) extraction du module `production` + correction d'idempotence §3, à
  comportement constant vérifié par les tests existants ; (B) résolution de scope chapitre +
  endpoint 202 + worker + les trois invariants §5 ; (C) surface Couverture (les boutons
  « ⚡ Compléter le chapitre » aujourd'hui désactivés dans la maquette).
- **Docs** : ligne dans `DECISIONS.md` ; note dans `adr-0021` (« l'orchestrateur est extrait et
  son idempotence corrigée par ADR-0023 ») ; `API_SPEC.md` §Production.
- **Observation à mener sur le premier chapitre** : temps réel par leçon, taux de dégradation
  leçon-centrée, et surtout — **15 objets d'un coup sont-ils relisables ?** Si la réponse est
  non, le chantier suivant n'est pas le cron, c'est la file de relecture. On l'aura appris pour
  le prix d'un chapitre.

## Décisions validées (commanditaire, 2026-07-28)

1. **Extraction plutôt que duplication** : l'orchestrateur ADR-0021 quitte `reports` pour un
   module neutre `production`, consommé par ses trois appelants — retenu.
2. **Déclenchement manuel, exécution asynchrone** ; **cron reporté**, avec la file de relecture
   comme prérequis dur — retenu.
3. **Deux passes non fusionnables** (§7) : rédiger les cours → validation Papa **obligatoire et
   bloquante** → équiper — retenu.
4. **Plafond d'arriéré de relecture** (`PRODUCTION_MAX_PENDING`) comme régulateur, plutôt qu'un
   plafond de temps ou de volume — retenu.
5. **v1 = un chapitre × cours/quiz/fiche** comme test de validation du dispositif — retenu.
