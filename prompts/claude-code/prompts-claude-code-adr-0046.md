# Prompts Claude Code — chantier ADR-0046 (le worker de production est un service)

> **Trois sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code, **après `/slice`**, qui porte la discipline (graphify, read-before-code, stop-on-blocker,
> non-régression). Le prompt ne porte que le chantier.
>
> **Ce chantier ne touche AUCUN écran.** Pas de composant React, pas de route API, pas de migration.
> Si une session en vient à proposer l'un des trois, **c'est un blocker, pas une bonne idée**.
>
> ✅ **L'ADR est `Accepté` (2026-08-08).** Le prérequis de décision est levé : les sessions peuvent
> démarrer. Les huit décisions sont **gelées** — on les **relit**, on ne les rouvre pas.
>
> ⚠️ La **Décision 5** (le canal est l'**e-mail**, pas Web Push) est celle qu'une session sera le
> plus tentée de rouvrir, parce que Web Push paraît « plus propre ». Son motif n'est pas un goût,
> c'est un fait de déploiement : **il n'existe aucun environnement distant**, donc le Push API
> n'atteindrait que la machine qui fait tourner ZETIS. Si une session veut la rouvrir : **blocker**.
>
> 🔴 **Trois constats du read-before-code ont falsifié le cadrage d'origine du `BACKLOG.md`**
> (constats 1, 2 et 4 de l'ADR). Le `BACKLOG` reste vrai sur les faits mesurés, **faux sur deux de
> ses trois décisions**. En cas de contradiction entre le `BACKLOG` et l'ADR : **l'ADR gagne**, il
> est postérieur et il dit pourquoi.

---

## Ce que chaque session doit avoir lu

- `docs/decisions/adr-0046-le-worker-de-production-est-un-service.md` — les 8 décisions et,
  surtout, les **7 constats** ;
- `docs/devops/worker-production.md` — la spec opérationnelle ;
- `apps/backend/app/production_worker.py` — **son en-tête est une source de décisions**, pas un
  commentaire : concurrence 1, pourquoi ce n'est pas un paquet séparé, pourquoi il ne peut pas
  vivre sans egress.

---

## Protocole commun aux trois sessions

1. **Aucune ligne de front.** Si le besoin d'un écran apparaît, c'est un blocker.
2. **Aucune migration, aucun endpoint.** Idem.
3. **La vérification finale est humaine** et elle est écrite dans la spec. Ne pas la simuler, ne pas
   la déclarer faite.
4. 🔴 **Ne jamais écrire un `pgrep` avec une alternance échappée.** `pgrep -fl "a\|b"` cherche un
   `|` littéral en ERE et ne rend **jamais** rien. Ce faux négatif a produit un worker de trop le
   2026-08-08. Le contrôle correct, partout : `pgrep -f "python -m app.production_worker"`.
5. **`production_worker_alive()` et `core/queue.py` ne se touchent pas.** Leur docstring consigne
   deux pannes déjà payées. Si une session croit y voir un défaut : blocker, pas correctif.

---

## SESSION A — le service supervisé

**Fichiers** : `docker-compose.prod.yml`, `docs/devops/worker-production.md` (si un écart apparaît).

### À LIRE AVANT D'ÉCRIRE

- `docker-compose.prod.yml` en entier — les **7** services actuels, et surtout **`backend`**, qui est
  le modèle à cloner ;
- `infra/docker/backend.Dockerfile` et `infra/docker/backend-entrypoint.sh` ;
- `apps/backend/app/api/health.py`.

### CE QU'IL FAUT FAIRE

1. Un **8ᵉ service `worker`**, clone de `backend`, avec les six propriétés du tableau de la spec
   (§ En production).
2. Un **healthcheck sur `backend`** — `curl -fsS http://localhost:8000/health`.
3. `depends_on: backend: { condition: service_healthy }` sur `worker`.
4. Un **commentaire dans le fichier** disant pourquoi il n'y a jamais de `--scale`.

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**L'`ENTRYPOINT` de l'image du backend n'est pas neutre.** `backend-entrypoint.sh` fait
`alembic upgrade head`, puis le seed, puis `exec uvicorn`. Un service qui réutilise l'image **sans
écraser l'entrypoint** lance donc un **second uvicorn** et surtout une **seconde migration
concurrente de celle du backend**.

C'est silencieux au premier démarrage sur une base déjà à jour. Ça ne le sera pas le jour d'une vraie
migration.

⚠️ Deuxième piège, plus discret : `ZETIS_DATABASE_URL` **avec son préfixe**. Un `DATABASE_URL` nu est
ignoré sans erreur et le conteneur repart sur `localhost` avec le mot de passe de dev. Le compose de
`worker-media` porte déjà le commentaire — le relire plutôt que le redécouvrir.

### CE QUI NE PEUT PAS ÊTRE PROUVÉ PAR UN TEST

Tout, dans cette session. Aucune CI n'existe. La preuve est la séquence `prod:up` → `kill worker` →
`ps worker` de la spec, **lancée par l'humain**. Rendre la séquence, ne pas prétendre l'avoir jouée.

### HORS PÉRIMÈTRE DE LA SESSION A

Les quatre défauts qu'on va croiser dans ce fichier **sans les traiter** : aucun healthcheck sur
`redis`/`minio`, aucune limite mémoire sur `backend`, `POSTGRES_PASSWORD` avec un défaut de dev en
clair, aucune clé `networks:`. Les **consigner au `BACKLOG.md`**, ne rien corriger.

---

## SESSION B — le dev ne peut plus démarrer deux fois

**Fichiers** : `scripts/dev.sh`, `package.json`, `.claude/launch.json`.

### À LIRE AVANT D'ÉCRIRE

- `scripts/dev.sh` **en entier**, et particulièrement l'**étape 4/5** et son `trap` — 🔴 **le worker
  y est DÉJÀ lancé.** Le `BACKLOG.md` affirme le contraire ; il a tort (constat 1 de l'ADR) ;
- `.claude/launch.json` — les paires, et leurs ports ;
- `package.json` § `scripts`.

### CE QU'IL FAUT FAIRE

1. Un **garde-fou partagé** : `dev:worker` et `dev.sh` refusent de démarrer si un worker tourne, et
   **écrivent le pid trouvé** plus la commande pour le remplacer. Le message exact est dans la spec.
2. Le worker suit les **paires `.claude/launch.json`** — **une seule fois pour toutes, pas une par
   paire** (Décision 4).

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**La correction peut réintroduire exactement le défaut qu'elle corrige.** Si le worker est attaché à
*chaque* paire, lancer deux paires (`backend-dev` et `backend-galaxy` — ce qui arrive) donne **deux
workers**. Le garde-fou de l'item 1 doit être ce qui rend l'item 2 sûr, pas un filet posé à côté.

⚠️ Et le garde-fou ne doit **pas** échouer en silence : un `if pgrep … ; then exit 0 ; fi` muet ferait
croire à un démarrage réussi. Il écrit, puis il sort.

### VERROUS EXIGÉS

- un test sur le **helper de détection** : il trouve un pid quand un processus correspond, il n'en
  trouve pas sinon ;
- 🔴 **un test qui échoue si le motif de détection redevient une alternance échappée.** C'est le
  défaut réel du 2026-08-08, et c'est le seul de cette session qu'un test peut attraper.

### HORS PÉRIMÈTRE DE LA SESSION B

Les ports, le CORS, les paires elles-mêmes. On **ajoute** le worker, on ne réorganise pas
`launch.json`.

---

## SESSION C — l'absence vient à toi

**Fichiers** : module `production` (le watchdog), `apps/backend/app/core/config.py`, `.env.example`,
tests.

### À LIRE AVANT D'ÉCRIRE

- `apps/backend/app/modules/production/activity_router.py:39` et `activity.py:326` — **comment
  `worker_alive` est déjà mesuré et passé** ; le module `activity` **ne parle pas à Redis**, et c'est
  volontaire ;
- `apps/backend/app/core/queue.py` — le docstring de `production_worker_alive()`, en entier ;
- `apps/backend/app/main.py` — où s'accroche une tâche de fond au démarrage ;
- `apps/backend/app/core/config.py` — le patron de dégradation propre **sans clé** de la dérogation
  `curriculum_*` (`adr-0009`), qui est le modèle à suivre.

### CE QU'IL FAUT FAIRE

1. Un **watchdog dans le backend** (jamais dans le worker — Décision/alternative c).
2. Il alerte quand **les deux** conditions tiennent : file non vide **et**
   `production_worker_alive()` faux depuis plus de `PRODUCTION_ALERT_AFTER_MINUTES`.
3. **Une seule alerte par épisode** — verrou Redis à TTL, levé quand un worker répond à nouveau.
4. Envoi par `smtplib` (**stdlib — aucune dépendance ajoutée**), destinataire et identifiants dans le
   `.env` **de la racine**.
5. **Dégradation propre sans SMTP** : une ligne de log au démarrage, jamais un crash, jamais un 500.
6. Le texte du message est **fixé par la Décision 6** — le reprendre, ne pas le réécrire.

### 🔴 LE PIÈGE PRINCIPAL DE CETTE SESSION

**Le plancher de 8 minutes n'est pas un réglage confortable, c'est une mesure.** Un worker **idle**
ne rebat qu'à chaque tour de boucle de dequeue : 3,8 min d'ancienneté relevés, TTL de clé Redis à
8 min. Un seuil sous 8 min **fait sonner l'alarme sur un worker en parfaite santé** — et une alerte
qui crie à tort est celle qu'on apprend à ignorer, y compris le jour de la vraie panne.

Le défaut à ne pas commettre : lire `last_heartbeat` et en déduire une mort. Ce n'est pas ce que
`production_worker_alive()` mesure, et le refaire autrement serait la **seconde source de vérité**
que l'ADR écarte explicitement.

### VERROUS EXIGÉS

- 🔴 **un test-verrou sur le plancher** : une configuration à moins de 8 minutes est refusée, ou
  relevée, et **le dit**. Ce verrou est le cœur de la session ;
- l'alerte **ne part pas** si la file est vide, même worker absent (c'est l'état normal la nuit) ;
- l'alerte **ne part pas deux fois** pour le même épisode ;
- le verrou **se lève** quand un worker répond, et une nouvelle panne réalerte ;
- sans configuration SMTP, le chemin complet s'exécute **sans lever** et sans envoyer.

⚠️ **Saboter chaque verrou avant de le déclarer vert.** Le dépôt a trois précédents de test-verrou
vert sur un sabotage. Un verrou sur un seuil est particulièrement exposé : vérifier qu'il rougit
pour `7`, pas seulement qu'il passe pour `15`.

### HORS PÉRIMÈTRE DE LA SESSION C

Le bandeau Papa et `ProductionStrip.tsx` — **y compris ses pourcentages absents sur un lot en
file**, qui sont corrects et défendus par un commentaire. Web Push, l'accès distant, le bouton
« abandonner », toute surface Massimo, le multi-destinataire.

---

## 🔴 VÉRIFICATION — OBLIGATOIRE, ET PAR UN HUMAIN

Aucune des deux preuves de ce chantier n'est atteignable par un test : **aucune CI n'existe**, et un
test ne peut prouver ni qu'un conteneur redémarre, ni qu'un e-mail est arrivé.

1. **La supervision** — `pnpm prod:up`, tuer le conteneur `worker`, vérifier qu'il revient.
2. **L'alerte** — arrêter le worker, déclencher une production, attendre le seuil, **recevoir
   l'e-mail**.
3. **Le garde-fou** — lancer `pnpm dev:worker` deux fois : le second doit refuser **en nommant le
   pid du premier**.

Les cinq relectures visuelles précédentes du dépôt ont chacune trouvé ce qu'aucun test ne voyait.
Celle-ci porte sur du déploiement, où il n'y a même pas d'écran pour trahir un défaut.

---

## Après la Session C

`/cloture` — `MEMORY.md`, `TROUBLESHOOTING.md` (la panne du 2026-08-05 y a une section : elle gagne
sa conclusion), et le `BACKLOG.md`, dont la section « CHANTIER À CADRER » se referme.
