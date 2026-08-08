"""Worker de production : `python -m app.production_worker`.

**Pas un paquet séparé, et c'est une décision** (read-before-code slice B) : `worker-media` est un
paquet à part parce que son RUNTIME est `node:20` + Chromium, pas parce que c'est un worker. Le
worker de production a le même runtime et le même code que le backend — il appelle
`equipment.equip_notion`, donc les cinq générateurs, donc les providers et les modèles. Un paquet
séparé le forcerait à réimporter tout le backend : un Dockerfile de plus pour zéro isolation.

⚠️ Il ne peut PAS vivre sur le réseau Compose `internal` (sans egress) où vit `worker-media` :
il génère avec Ollama, qui tourne sur l'HÔTE. Remotion, lui, n'appelle personne.

**Concurrence 1, et ce n'est pas provisoire** : un seul Ollama, un seul GPU. Deux jobs en
parallèle ne produiraient pas plus vite — ils se disputeraient la même ressource et ralentiraient
Massimo. `SimpleWorker` (sans fork), comme `worker-media`.
"""

import os
import subprocess

from rq import SimpleWorker

from app.core.config import settings
from app.core.queue import _redis, production_queue, production_queues

# 🔴 Le motif de détection d'un worker déjà en vie. **Il a DEUX façons d'être faux, et les deux ont
# été rencontrées le 2026-08-08.** Ne pas le retoucher sans lire `test_production_worker_garde.py`.
#
# 1. **Sous-détection** — `pgrep -fl "production_worker\|rq worker"` : `\|` n'est PAS une alternance
#    en ERE, il cherche un `|` littéral. Ce contrôle-là ne rend **jamais** rien, donc il autorise
#    toujours le démarrage. C'est lui qui a laissé monter un TROISIÈME worker.
# 2. **Sur-détection** — `^(.*/)?python[0-9.]* -m app\.production_worker$` semble correct et ne
#    l'est pas : `(.*/)?`  avale `sh -c cd apps/backend && .venv/bin/`, qui finit par un `/`. Le
#    motif attrape alors le **wrapper shell qui vient de nous lancer**, et le worker refuserait de
#    démarrer à cause de son propre parent.
#
# `[^ ]*` au lieu de `.*` ferme les deux : un chemin ne contient pas d'espace, la ligne du wrapper
# si. Vérifié contre des processus réels, pas seulement en test.
MOTIF_PROCESSUS_WORKER = r"^[^ ]*python[0-9.]* -m app\.production_worker$"


def workers_deja_actifs(pid_courant: int | None = None) -> list[int]:
    """Les PID des workers de production déjà en vie — le nôtre exclu.

    ## Pourquoi ce contrôle vit ICI et pas dans les scripts

    Il y a **quatre portes d'entrée** vers ce module — `pnpm dev`, `pnpm dev:worker`, les entrées
    backend de `.claude/launch.json`, et le service Docker. Un garde-fou en bash aurait dû être
    recopié dans chacune, et la prochaine porte serait née sans lui : c'est **exactement** le défaut
    que l'ADR-0046 corrige (*« un correctif attaché à une porte d'entrée ne survit pas à l'ouverture
    d'une seconde »*). Posé dans le module, il couvre toutes les portes, y compris celles qui
    n'existent pas encore.

    ⚠️ **On mesure des PROCESSUS, pas l'enregistrement RQ dans Redis.** Les deux divergent dans les
    deux sens, mesuré le 2026-08-08 : trois workers vivants dont un seul encore enregistré (les clés
    expirent au bout de 8 min sans battement), et à l'inverse un enregistrement survit à un worker
    tué sans nettoyage. `production_worker_alive()` répond à une autre question — *« la file est-elle
    servie ? »* — et reste la bonne réponse à celle-là.

    Best-effort : si `pgrep` est absent ou échoue, on rend une liste vide. **On préfère laisser
    démarrer que refuser sur une mesure qu'on n'a pas** — un faux positif ici empêcherait le seul
    worker de la machine de tourner, ce qui est le défaut d'origine, à l'envers.
    """
    courant = os.getpid() if pid_courant is None else pid_courant
    try:
        resultat = subprocess.run(
            ["pgrep", "-f", MOTIF_PROCESSUS_WORKER],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return []

    pids: list[int] = []
    for jeton in resultat.stdout.split():
        try:
            pid = int(jeton)
        except ValueError:
            continue
        if pid != courant:
            pids.append(pid)
    return pids


def main() -> None:
    # ⚠️ **Le garde-fou passe AVANT tout le reste** — avant Redis, avant l'amorçage du scan. Un
    # second worker qui se connecterait puis se retirerait laisserait des traces de passage et
    # pourrait replanifier un réveil.
    #
    # Concurrence 1 : un seul Ollama, un seul GPU (cf. l'en-tête de ce fichier). Le 2026-08-08,
    # TROIS workers se disputaient la même ressource, faute de la moindre surface disant combien il
    # y en avait.
    if autres := workers_deja_actifs():
        # ⚠️ PLUSIEURS pids pour UN worker, et ce n'est pas une anomalie : `work(with_scheduler=True)`
        # fork un processus de scheduler qui porte la même ligne de commande. Écrire « pid 29543,
        # 29544 » ferait croire à deux workers, c'est-à-dire au défaut qu'on est en train
        # d'empêcher. On nomme le worker, on mentionne le reste.
        principal = min(autres)
        annexes = len(autres) - 1
        detail = f" (+{annexes} processus : RQ fork son scheduler)" if annexes else ""
        # Il ÉCRIT ce qu'il a trouvé, il ne se contente pas de s'abstenir : un garde-fou muet se
        # lit comme un démarrage réussi, et on se retrouve à chercher pourquoi rien ne produit.
        print(f"⚠ Un worker de production tourne déjà — pid {principal}{detail}.")
        print("  Un seul à la fois — un seul Ollama, un seul GPU.")
        print(f"  Pour le remplacer :  kill {' '.join(str(p) for p in autres)} && pnpm dev:worker")
        return


    # ⚠️ Les files viennent de `core/queue.py` et **ne se reconstruisent pas ici** (ADR-0041 §5).
    # Ce fichier fabriquait auparavant sa propre `Queue` : deux constructions du même objet, qui
    # auraient divergé au premier ajout de file — et c'est exactement l'ajout qu'on fait.
    connection = _redis()
    files = production_queues()
    # L'amorçage du scan vit sur la file NORMALE : c'est du travail que personne ne regarde.
    queue = production_queue()

    # ⚠️ **L'objection d'origine est maintenue, et elle est SATISFAITE — pas contournée.**
    #
    # Ce fichier a porté `with_scheduler=False` du 2026-08-02 au 2026-08-03, avec ce motif :
    #
    #   « le déclenchement reste ÉVÉNEMENTIEL. Aucun cron, aucune tâche périodique — un scheduler
    #     ici ouvrirait la porte à "tous les dimanches, produire quelque chose", qui n'a pas de
    #     sens pédagogique. »
    #
    # Le motif reste juste, et **rien de ce qu'il interdisait n'est arrivé** : le job périodique
    # (`jobs.scan_triggers`) ne produit RIEN. Il **regarde** si le monde réel a demandé quelque
    # chose — un contrôle avec un chapitre rattaché, dans les jours qui viennent (ADR-0035 §1).
    # « Tous les dimanches, produire » reste interdit ; « tous les trois heures, vérifier s'il y a
    # un contrôle jeudi » est l'inverse exact.
    #
    # Le premier réveil est amorcé ici, et le job se replanifie ensuite lui-même. Sans cet amorçage,
    # une file vide ne se remplirait jamais.
    #
    # ⚠️ **Mais SEULEMENT s'il n'y en a pas déjà un** (correctif du 2026-08-03). Amorçage et
    # auto-replanification sont justes séparément ; ensemble, **chaque redémarrage ajoutait une
    # récurrence permanente** — quatre réveils planifiés après quatre démarrages, constaté en vrai.
    # Bénin en dev ; pas en production, où un worker redémarre à chaque déploiement.
    if settings.production_scan_interval_minutes > 0:
        from app.modules.production.jobs import scan_already_planned, scan_triggers

        if scan_already_planned(queue):
            print("production: un réveil du scan est déjà prévu — pas de nouvel amorçage")
        else:
            queue.enqueue(scan_triggers)

    # L'ORDRE des files EST la priorité : RQ vide la première avant de regarder la seconde.
    # La concurrence reste 1 — « passer devant » = prendre le prochain créneau, jamais interrompre
    # celui-ci (ADR-0041 §5).
    SimpleWorker(files, connection=connection).work(with_scheduler=True)


if __name__ == "__main__":
    main()
