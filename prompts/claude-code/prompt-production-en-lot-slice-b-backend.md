# Prompt Claude Code — Production en lot, slice B (exécution asynchrone)

**Branche** : `feat/production-en-lot` (slice A livrée : `production/equipment.py`, `scope.plan`).
**Deux commits** : (1) le journal `production_runs` + sa migration ; (2) la file, le worker et
l'endpoint 202. Le modèle avant l'exécution qu'il trace — sinon la migration se réécrit.

---

## 0. Cadre

Protocole d'exécution : **`/slice`**. Il ne se répète pas ici.

Décisions : `docs/decisions/adr-0031-production-en-lot-et-journal.md` (§3 exécution, §4 journal,
§5 régulateur) et son **addendum** `adr-0031-production-en-lot-et-journal.md` (Amendement 1) (le gate du §7).

> **Cette slice ne branche aucun bouton.** Elle rend la production exécutable et traçable. La
> surface Papa et l'observation sont la slice C.

---

## 1. Read-before-code — deux constats qui corrigent l'ADR

L'ADR-0031 §3 dit « patron `worker-media` sandboxé, réseau `internal`, limites de ressources ».
Le read-before-code de la slice B montre que **la moitié de cette phrase est fausse**. Vérifie-les,
puis code en conséquence.

**a) Le sandbox ne transfère PAS.** `worker-media` vit sur `networks: [internal]`, un réseau
`internal: true` — **aucun egress**. Il peut se le permettre : Remotion rend une vidéo, il n'appelle
personne. Le worker de production, lui, **génère du contenu avec Ollama**, qui tourne sur l'HÔTE
(`http://localhost:11434`, `host.docker.internal` depuis un conteneur). Le mettre sur `internal`
le rendrait incapable de faire son travail.

**b) Ce n'est PAS un package séparé, et worker-media ne l'est pas pour la raison qu'on croit.**
`worker_media/worker.py` importe déjà `app.core.config` — il partage le paquet Python du backend.
Il est séparé parce que son **runtime** est `node:20` + Chromium (Remotion), pas parce que c'est un
worker.

> Le worker de production a le **même runtime** et le **même code** que le backend : il appelle
> `equipment.equip_notion`, donc les cinq générateurs, donc les providers et les modèles. Un
> paquet séparé le forcerait à réimporter tout le backend — un Dockerfile de plus pour zéro
> isolation gagnée.
>
> **Décision : un entrypoint dans le backend**, pas un nouveau paquet ni un nouveau Dockerfile. En
> dev, un process hôte (comme `pnpm dev:back`). En prod, un service Compose qui **réutilise
> `backend.Dockerfile`** avec une autre commande.

Le « enqueue par nom de tâche pour éviter l'import croisé » de `core/queue.py` ne s'applique pas
non plus : ici c'est le même code des deux côtés. Enfile la fonction, pas une chaîne — une chaîne
qui ne résout pas échoue à l'exécution, un import échoue au démarrage.

---

## 2. Commit 1 — `production_runs`, le journal

Modèle + migration, tels que l'ADR-0031 §4 les décrit. Rien de plus.

- `trigger` vit sur le **LOT**, jamais sur la pièce — un déclencheur engendre un cours, trois
  fiches, deux quiz et huit cartes ; le poser sur chaque ligne, c'est le recopier sur cinq tables
  et le voir diverger au premier correctif.
- **FK typées, jamais polymorphes** : `agenda_item_id`, `content_request_id`, `council_report_id`,
  `skill_id`, tous nullables, + contrainte « exactement une renseignée, cohérente avec `trigger` ».
  Un `trigger_ref_id` générique reproduirait l'ambiguïté qui a fait rejeter `notion_requests` pour
  les demandes de contenu.
- `production_run_id` (FK nullable) sur chaque table de contenu. **Aucune rétro-attribution** :
  `NULL` sur tout l'existant, doctrine §F.4.

**Le modèle anticipe, le code n'anticipe pas.** Seuls `trigger='manual'` et
`authorized_by='parent_direct'` sont **émis**. Un test-verrou l'interdit aux autres valeurs —
patron du verrou `system`, inversé (comme `parent_rule` au §G).

---

## 3. Commit 2 — la file, le worker, l'endpoint

### 3.1 La file

Une file RQ **dédiée** (`settings.production_queue`, défaut `"production"`), distincte de `media` :
un rendu vidéo bloqué ne doit pas retarder une production, et l'inverse.

### 3.2 Le worker : concurrence 1, et ce n'est pas provisoire

Un seul Ollama, un seul GPU. Deux jobs en parallèle ne produiraient pas plus vite — ils se
disputeraient la même ressource et **ralentiraient Massimo**. `SimpleWorker`, une seule instance,
comme `worker-media`.

### 3.3 « Massimo passe devant » — au grain de la PIÈCE

> Un appel LLM en cours n'est **pas** préemptible. Prétendre l'interrompre serait un mensonge
> d'architecture.

Le worker vérifie l'activité récente de Massimo **entre deux notions**, et se met en pause s'il est
là. Le grain est la notion, pas l'instant : si Massimo arrive pendant la génération d'un cours, il
attend la fin de ce cours. **Écris-le dans le code et dans la spec**, sinon quelqu'un promettra une
interruption immédiate.

### 3.4 Le gate du §7 — dans la SÉLECTION

Conformément à l'addendum : la passe 2 n'équipe **que** les notions dont la leçon est déjà
`validated` **et** porte un contenu. Les autres sont **rendues bloquées avec leur motif**, jamais
omises en silence.

`equip_notion` **ne change pas**. Le gate est une sélection, pas une modification d'orchestrateur.

### 3.5 L'endpoint

`POST /api/production/runs` → **202** + l'id du run. Router **distinct** de `coverage` :

> `coverage.py` reste en **lecture seule**. Le verrou existant ne doit pas être affaibli sous
> prétexte qu'on ajoute de l'écriture au module.

`GET /api/production/runs/{id}` pour le suivi. `require_parent` sur les deux.

### 3.6 Le régulateur

`PRODUCTION_MAX_PENDING` (config, v1 = 30). Au-delà, la production **refuse et le dit** — elle ne
tronque pas silencieusement. C'est le régulateur du **palier 2 seulement** ; ne pas tenter de le
généraliser.

---

## 4. Ce qu'il ne faut PAS faire

- **Aucun bouton, aucune surface Papa** — slice C.
- **Aucun déclencheur autre que `manual`** — ADR-0032.
- **Ne pas modifier `equip_notion`** (addendum : le gate est ailleurs).
- **Ne pas rendre `coverage.py` écrivant.**
- **Ne pas mettre le worker sur le réseau `internal`** (constat 1a).
- **Ne pas créer de paquet `worker-production`** (constat 1b).
- **Ne pas ajouter de cron, de scheduler, de `with_scheduler=True`** — le déclenchement reste
  événementiel (ADR-0023, repris).

---

## 5. Clôture

Rends : fichiers modifiés, migration (et sa commande), tests ajoutés, points restants, risques.

**Dis explicitement comment lancer le worker en dev** — sans ça, la slice est invérifiable, et
c'est le premier geste de la slice C.
