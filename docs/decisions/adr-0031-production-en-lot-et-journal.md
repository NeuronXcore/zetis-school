# ADR-0031 — Produire un chapitre en une fois : exécution asynchrone et journal de production

## Statut

Proposé — 2026-08-02. **REMPLACE l'ADR-0023**, accepté le 2026-07-28 et resté sans implémentation.
Deuxième document du chantier d'autonomisation, après l'addendum ADR-0011 §G.

> **Ce qui est remplacé est le plan d'exécution, pas la doctrine.** Les cinq décisions validées de
> l'ADR-0023 sont reprises **telles quelles** ; ce document les exécute. L'ADR-0023 reste la
> référence pour leurs motifs — en particulier son §7 (gate humain sur la rédaction de cours, « et
> il ne bouge pas ») et l'observation de son §Suivi, érigée ici en livrable.

> S'appuie sur : `adr-0021` (orchestrateur d'équipement), `adr-0011 §E` (fraîcheur) et **§G**
> (autorité, veto), `adr-0011 §F` (provenance), `adr-0007 §7` (worker sandboxé, patron
> worker-media). **Ne rouvre aucune décision** de l'ADR-0023 : il en exécute les cinq, et rend
> explicite ce qu'elles supposaient sans le dire.

## Contexte

Papa produit le contenu de Massimo pièce par pièce. L'ADR-0023 a décidé de produire **par scope
chapitre** — un geste, quinze objets — et posé l'expérience qui devait renseigner la suite :

> *« 15 objets d'un coup sont-ils relisables ? Si la réponse est non, le chantier suivant n'est pas
> le cron, c'est la file de relecture. On l'aura appris pour le prix d'un chapitre. »*

**Cette expérience n'a jamais pu avoir lieu.** Rien ne produit en lot. Tout le chantier
d'autonomisation (paliers, déclencheurs, régulateur) s'appuie sur une exécution en lot qui
n'existe pas — et sur une réponse qu'on n'est jamais allé chercher.

Ce document livre l'expérience, et pose au passage le journal (`production_runs`) sans lequel
il faudrait migrer deux fois.

## Constat read-before-code

**1. ⚠️ L'ADR-0023 n'a été implémenté à aucun endroit.** Vérifié pièce par pièce :

| Décision ADR-0023 | État réel |
|---|---|
| §1 — l'orchestrateur quitte `reports` pour `production` | **non fait** — `equip_notion` est à `reports/service.py:399` ; `production/` ne contient que `coverage.py` |
| §2 — `plan(scope) -> [notion]`, fonction pure partagée | **n'existe pas** — aucune fonction de ce nom dans le dépôt |
| §Slice B — endpoint 202 + worker | **n'existe pas** — aucun 202 dans `production/` |
| §Slice C — bouton « ⚡ Compléter le chapitre » | **désactivé** (`title="Production en lot — chantier ultérieur"`) |
| `batch_id`, `PRODUCTION_MAX_PENDING` | **prose uniquement**, jamais écrits en code |

Le module `production` existe, mais il porte la **Couverture** (lecture seule), pas
l'orchestrateur. La « fonction pure partagée » du §2 — le substrat commun à la matrice et à la
production — n'a donc jamais eu de premier consommateur, encore moins deux.

**2. ⚠️ Il n'y a aucune file d'exécution IA, et ce n'est pas un détail.** `apps/worker-ai/` est un
README de deux lignes (« Placeholder »). La seule `Queue` RQ du dépôt (`core/queue.py`) sert
`settings.render_queue`, c'est-à-dire **worker-media** (rendu MP4 des capsules). Toute la
génération IA est **synchrone dans le backend**, sur un seul Ollama et un seul GPU.

> **C'est le prérequis manquant de tout le chantier d'autonomisation**, et il n'était listé nulle
> part. « Départ au plus tard », « Massimo passe devant », lot interruptible : ces trois notions
> supposent une exécution différable et préemptible. Un appel synchrone n'est ni l'un ni l'autre.

**3. Le patron existe déjà, sandboxé.** `worker-media` (ADR-0007 §7) est un worker RQ Python sur
le réseau `internal` (aucun egress), avec limites CPU/RAM et `restart: unless-stopped`, sous profil
Compose `render`. Rien à inventer : il y a un précédent à copier.

**4. L'orchestrateur est réutilisable tel quel.** `equip_notion(db, skill_id, llm, embedder)`
équipe UNE notion (cours → fiche → SRS → quiz → mindmap), auto-valide en `parent_bulk` (§F.4), et
dégrade pièce par pièce en `try/except`. Un scope chapitre n'a **rien à ajouter** : il résout une
liste de notions et boucle.

**5. `app_settings` est prêt, ses routes ne le sont pas.** La table est un `(key, value)` scalaire
avec la doctrine « l'absence de ligne EST la valeur par défaut ». Mais l'unique surface est
`GET`/`PUT /api/agenda/settings` — **namespacée sous l'agenda**. Toute clé non-agenda exige un
routeur de settings neutre.

## Décision

### 1. Exécuter l'ADR-0023, sans le rediscuter

Ses cinq décisions sont reprises telles quelles : extraction de l'orchestrateur vers `production`,
`plan(scope)` comme résolution pure, idempotence « déjà validé **et frais** », deux passes non
fusionnables (cours → validation Papa **bloquante** → équipement), et v1 = **un chapitre**.

L'extraction est un **refactor de déplacement, zéro changement de comportement** : les trois
appelants (Conseil de classe, composition champion, Couverture) consomment le module neutre sans
modification, et les tests existants passent **inchangés**. Un test qu'il faut retoucher est le
signal que ce n'est plus un déplacement.

### 2. `plan(scope)` — un substrat, deux consommateurs

```
plan(scope) -> [skill_id]
```

Un chapitre se résout en ses leçons validées → `lesson_skills` → notions. **Fonction pure, sans
IA, sans effet de bord**, et c'est **la même** que celle qui alimente la matrice de couverture :
la page affiche ce que la production exécutera. Deux résolutions divergentes se paieraient comme
le prédicat de disponibilité s'est payé le 2026-07-30 — une porte ouverte sur du vide.

### 3. L'exécution devient asynchrone — et c'est la vraie livraison

Un endpoint **202** accepte le scope, crée le `production_run`, met en file, et rend son id. La
Couverture suit l'avancement en interrogeant le run.

**File RQ dédiée `production`, worker Python distinct** — patron `worker-media` (constat 3),
réseau `internal`, limites de ressources. Le `worker-ai` cesse d'être un README.

**Concurrence 1, et ce n'est pas une limitation temporaire** : il y a un seul Ollama et un seul
GPU. Deux jobs en parallèle ne produiraient pas plus vite, ils se disputeraient la même ressource
et ralentiraient Massimo.

> **« Massimo passe devant » se décide ENTRE deux pièces, jamais pendant.** Un appel LLM en cours
> n'est pas préemptible — prétendre l'interrompre serait un mensonge d'architecture. L'orchestrateur
> équipe pièce par pièce ; le worker vérifie l'activité récente de Massimo **avant chaque pièce** et
> se met en pause s'il est là. Le grain de la préemption est la pièce, et il faut l'écrire ainsi
> plutôt que de laisser croire à une interruption immédiate.

**L'ordre de production suit la priorité d'évidence.** C'est ce qui rend un lot interrompu à 60 %
utile : les 60 % faits sont les notions les plus fragiles. La stratégie de dégradation n'est pas
un ajout, c'est l'ordre lui-même.

### 4. `production_runs` — le journal, posé maintenant pour ne pas migrer deux fois

```txt
production_runs
  id
  student_id
  trigger              # manual | request | agenda | evidence | derived | council
  agenda_item_id       FK, nullable
  content_request_id   FK, nullable
  council_report_id    FK, nullable
  skill_id             FK, nullable        # ancrage evidence
  authorized_by        # parent_direct | parent_rule
  status               # queued | running | done | failed
  created_at, finished_at
```

+ **une seule colonne** sur chaque table de contenu : `production_run_id` (FK nullable).

**`trigger` vit sur le LOT, pas sur la pièce.** Ce n'est pas une propriété de la fiche : un même
déclencheur engendre un cours, trois fiches, deux quiz et huit cartes. Le poser sur chaque ligne,
c'est le recopier sur cinq tables et le voir diverger au premier correctif.

**Références typées, jamais polymorphes.** Un `trigger_ref_id` générique reproduirait l'ambiguïté
qui a fait rejeter `notion_requests` pour les demandes de contenu (« un `skill_id` optionnel qui
vaut tantôt inconnu tantôt connu serait ambigu »). FK réelles + contrainte « exactement une
renseignée, cohérente avec `trigger` ».

**Rétro-attribution : aucune.** `production_run_id` reste `NULL` sur tout l'existant — même
doctrine que §F.4.

> **Le modèle anticipe, le code n'anticipe pas.** `production_runs` naît avec toutes ses colonnes ;
> **seuls `trigger='manual'` et `authorized_by='parent_direct'` sont émis.** Les autres valeurs
> sont légales et non écrites — patron `content_kind`, et patron `parent_rule` du §G.

### 5. Le régulateur v1 : `PRODUCTION_MAX_PENDING`, enfin écrit

L'ADR-0023 l'a décidé et personne ne l'a implémenté. Il devient réel : au-delà de N objets
`pending` (config, v1 = 30), la production en lot **refuse** de démarrer et le dit.

> C'est le **régulateur du palier 2**, et il ne régule rien d'autre. Le palier 3 auto-valide, donc
> rien ne devient `pending`, donc ce compteur resterait à zéro dans le seul régime où il serait
> vital. Son équivalent autonome est un chantier distinct (ADR-0032), et **ce document ne le
> prépare pas** : il produit d'abord la mesure qui permettra de le calibrer.

### 6. La surface : le bouton s'active, là où il est déjà dessiné

« ⚡ Compléter le chapitre (N) » cesse d'être désactivé sur la Couverture. La page reste **en
lecture seule** : elle n'écrit rien, elle appelle l'endpoint 202 du module `production` et suit le
run. L'invariant de l'ADR-0023 (« `coverage.py` ne génère, ne valide, n'écrit jamais rien ») est
préservé — le pilotage passe par un router distinct.

**Aucun panneau des paliers dans ce lot.** Il appartient à l'ADR-0032, avec l'émission de
`parent_rule`.

## Périmètre

**Dans ce lot** : extraction de l'orchestrateur ; `plan(scope)` ; endpoint 202 + file RQ
`production` + worker ; `production_runs` + `production_run_id` (une migration) ;
`PRODUCTION_MAX_PENDING` ; activation du bouton Couverture + suivi de run.

**Hors de ce lot, et explicitement** : les déclencheurs autres que manuel (agenda, demandes,
évidence — ADR-0032) ; l'émission de `parent_rule` et le panneau des paliers (ADR-0032) ; le
régulateur autonome (ADR-0032) ; la file de relecture (chantier distinct, **dont l'observation
ci-dessous décidera l'urgence**) ; le cron (le palier 3 le rend inutile, le déclenchement reste
événementiel) ; l'indicateur d'autonomie de Massimo (ADR-0033).

## Conséquences

### Positives

- **L'exécution asynchrone débloque tout le reste du chantier** — c'était le prérequis manquant,
  et il n'était listé nulle part.
- L'ADR-0023 cesse d'être une décision acceptée et non exécutée depuis cinq semaines.
- `production_runs` naît avec le premier lot : **aucune migration de rattrapage** dans six semaines.
- Le substrat `plan(scope)` donne enfin à la matrice de couverture et à la production **la même
  définition d'un chapitre**.

### Négatives / coûts

- Un worker de plus à faire tourner, et un service de plus dans Compose. C'est le coût d'admission
  de toute production différée ; le patron worker-media le borne.
- **La préemption est au grain de la pièce, pas de l'instant.** Si Massimo arrive pendant la
  génération d'un cours, il attend la fin de ce cours. À écrire dans la spec, sinon quelqu'un
  promettra une interruption immédiate.
- Le veto du §G reste **un droit sans notification** : ce lot ne le résout pas, il ne l'aggrave pas
  non plus (tout y est `parent_direct`, donc Papa sait ce qu'il a lancé).

## Suivi

**L'observation est le livrable, autant que le code.** Sur le premier chapitre produit :

1. **temps réel** par leçon et pour le lot entier ;
2. **taux de dégradation** leçon-centrée (pièces sautées par le `try/except`) ;
3. **et surtout : 15 objets d'un coup sont-ils relisables ?**

> La réponse décide du chantier suivant, et cette décision est **déjà prise par l'ADR-0023** : si
> c'est non, ce n'est ni le cron ni les déclencheurs — **c'est la file de relecture**. On l'aura
> appris pour le prix d'un chapitre.

Tests-verrous exigés :

1. L'extraction ne change **aucun comportement** : les tests existants des trois appelants passent
   **sans modification**. Un test retouché invalide le refactor.
2. `plan(scope)` est **pure** : mêmes entrées → mêmes sorties, aucun accès IA, aucune écriture.
3. La matrice de couverture et la production résolvent **le même chapitre en la même liste de
   notions** (un seul substrat — le test qui l'interdit de diverger).
4. `production_runs` n'émet que `trigger='manual'` et `authorized_by='parent_direct'` : aucun
   chemin n'écrit les autres valeurs (patron du verrou `system`, inversé — comme pour
   `parent_rule` au §G).
5. `coverage.py` reste **en lecture seule** : aucune écriture, aucune génération (verrou existant,
   à ne pas affaiblir en activant le bouton).
6. Au-delà de `PRODUCTION_MAX_PENDING`, la production **refuse** et le dit — elle ne tronque pas
   silencieusement.
