---
id: "0066"
titre: "Restaurer est un swap à réveil suspendu, et le mot se mérite dans les deux sens"
type: surface
statut: propose
date: 2026-08-19
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0023", "0031", "0046", "0060", "0062", "0063", "0064", "0065"]
---
# ADR-0066 — Restaurer est un swap à réveil suspendu, et le mot se mérite dans les deux sens

## Statut

**Proposé — 2026-08-19.** Le sous-chantier « **restaurer + administrer les archives** » de la
phase **E** du `BACKLOG.md` — le premier geste **destructif** du produit. Les quatre autres
sous-chantiers de la phase E (occupation disque, purges des voix, remises à zéro, export RGPD)
gardent chacun leur propre cadrage : celui-ci ne les entame pas.

Cadré en **cas 3 de l'`adr-0060`** : la restauration remplace l'état vivant (classe A4), consomme
l'`adr-0063`, introduit un `job_type` neuf et une base de repli — l'annulation coûterait bien plus
d'un commit. L'`adr-0065` §Hors périmètre le désignait : *« Restaurer. Phase E, classe A4, son
propre ADR. »* La demande est venue de l'utilisateur pendant la relecture de la slice 3 du 0065
(consignée en `MEMORY.md` §À CASER, avec le vœu de confirmations).

**Ce que cet ADR consomme sans le redécider** : le manifeste scellé, l'empreinte et la mécanique
`zetis_verify` (`adr-0065` §5-§6 — §Suivi 5 : la phase E « relira » ces préconditions) · la
suspension comme préalable au remplacement (`adr-0063`, dont le §8 du 0065 disait déjà : « la
restauration, elle, suspendra avant de remplacer ») · le worker supervisé et son warm shutdown
(`adr-0064`) · « aucun octet d'archive sur HTTP » (`adr-0065` §1, qui vaut ici tel quel).

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-19 | Le réveil clôt les travaux d'une autre époque | Proposé | — |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

### Ce qui existe depuis la phase B (squashes `8650f26`, `fe95bf5`, `7a287dc`)

Des archives scellées sur une cible certifiée, une restauration à blanc qui rend un verdict, et
un onglet 💾 qui n'appelle « sauvegarde » qu'une archive prouvée. Le cycle complet a tourné en
vrai le 2026-08-19 sur les données de dev — y compris un échec honnête (client `pg_dump` 18
désaligné, refusé par le serveur pg16 à la ligne près) qui a validé la doctrine mieux qu'aucun
test.

### La maquette v2 (« Importer une sauvegarde ») : ce qu'on garde, ce qu'on corrige

La maquette pose une séquence en six étapes et **quatre pièges** qu'elle documente elle-même :
un appel LLM n'est pas préemptible (le grain est la pièce) · jamais de `down -v` (le volume reste
intact) · un `SimpleWorker` ne recharge ni code ni schéma · une archive porte son régime, et
restaurer une archive AUTONOM réarmerait AUTONOM en silence. Ces quatre-là sont **gardés** — ils
recoupent les ADR-0031/0046/0063/0064. Ses chiffres, eux, restent les KPI inventés que le 0065 a
démentis, et son « simulateur de compatibilité » est en partie déjà livré : **la restauration à
blanc EST la simulation** (`backup_verify`).

### Les mesures du 2026-08-19 (la vraie séquence, sur le vrai dump, en conteneur d'essai)

| Mesure | Résultat |
|---|---|
| Restauration du dump réel (2,7 Mo, archive vérifiée du jour) dans `zetis_restore` | **0,234 s**, exit 0, **48 tables** |
| ⚠️ Le dump porte `OWNER TO zetis` | la restauration **exige le rôle `zetis`** — attrapé en conteneur (rôle absent → 1 table restaurée) ; dans le produit tout tourne déjà en `zetis` |
| Écriture de réveil dans `zetis_restore` AVANT swap (`zetis_production_suspended=true`, upsert `app_settings`) | ✓ — la base restaurée se réveille **suspendue** |
| **Le SWAP** : `pg_terminate_backend` (tous les pids de `zetis`) + `ALTER DATABASE zetis RENAME TO zetis_avant` + `ALTER DATABASE zetis_restore RENAME TO zetis` | **8 ms** — la fenêtre d'indisponibilité |
| La connexion-témoin (pool backend simulé) | tuée proprement (`AdminShutdown`) ; un pool SQLAlchemy se reconnecte tout seul — sur la **nouvelle** base |
| `alembic upgrade head` sur la base restaurée (tête identique) | exit 0, no-op propre, tête `a8a71c84f86e` |
| Connexions à terminer en vrai | prod : **6** · dev : **11** (`pg_stat_activity`) |
| Files Redis de prod (`production`, `production-priority`, `media`) | **0 · 0 · 0** — le transitoire est vide en pratique, la purge est sûre et bon marché |
| Médias à remplacer (mesures 0065) | prod : 0 objet · 0 audio ; dev : 1 objet · 76 fichiers · 48 Mo |

### 🔴 Le paradoxe structurel que la file ne peut pas absorber

Un travail de file écrit son statut dans `ai_jobs` — **qui vit dans la base que la restauration
remplace**. Après le swap, la ligne du travail n'existe plus (elle est dans `zetis_avant`) ; la
dernière écriture de `run_ai_job` tombera sur « travail introuvable ». Aucune astuce de session ne
répare ça : **le journal d'une restauration ne peut pas vivre dans la base qu'elle restaure.**
C'est le §3.

## Décision

### §1 — Restaurer ne s'offre qu'à une **sauvegarde**, jamais à un export

Le mot se mérite dans les deux sens (`adr-0065` §7) : la route refuse (**409 motivé**) toute
archive dont le dernier verdict `backup_verify` n'est pas `reussie` — non vérifiée ou en échec.
La restauration à blanc est le **billet d'entrée** du geste réel : c'est elle, la « simulation »
que la maquette demandait.

### §2 — La séquence, dans cet ordre — et chaque étape a sa mesure ou son ADR

**Préconditions, toutes en 409 motivé AVANT d'enfiler** (patron des refus du 0065) :
archive au verdict `reussie` (§1) · **suspension ACTIVE, posée par Papa** — le geste ne suspend
pas à la place de Papa, il exige que le monde soit déjà arrêté (`adr-0063` : l'interrupteur est
un geste explicite ; le motif du refus nomme le bouton) · aucun lot ni travail `running` ·
**déploiement supervisé** (le §2.⑧ l'exige — même motif que le 409 du redémarrage, `adr-0064`) ·
verdict de compatibilité favorable (§5).

Puis le travail `backup_restore` (file prioritaire, concurrence 1 — pendant qu'il tourne, aucun
générateur n'écrit, `adr-0065` §4) :

1. **La sauvegarde-filet, non négociable** (maquette ①) : un `backup_create` complet de l'état
   courant, AVANT tout remplacement. S'il refuse (couple incomplet…), la restauration s'arrête là.
2. **Restauration du dump dans `zetis_restore`** — la mécanique prouvée de `zetis_verify`
   (`adr-0065` §6) : connexion admin autocommit, `psql -v ON_ERROR_STOP=1`, rôle `zetis`.
3. **Les écritures de réveil, DANS `zetis_restore`, avant le swap** : `zetis_production_suspended
   = true` (le monde se réveille suspendu — `adr-0063` : il ne se relève jamais seul, Papa lève),
   régime forcé **MANUAL** et **déclencheur désarmé** (maquette ⑥ : une archive AUTONOM ne
   réarme pas AUTONOM en silence).
4. **Le SWAP** — mesuré à 8 ms : terminer toutes les connexions de `zetis`, `RENAME zetis →
   zetis_avant`, `RENAME zetis_restore → zetis`. Les pools (backend, workers) se reconnectent
   d'eux-mêmes sur la nouvelle base ; les requêtes en vol échouent pendant la fenêtre — assumé,
   l'écran l'annonce avant le clic.
5. **Les médias, en couple ou rien** (maquette) : le bucket MinIO et `/shared/audio` sont
   **remplacés** depuis l'archive (vidés puis réécrits) — une base sans son bucket, c'est chaque
   capsule qui casse. Le filet du ① couvre l'état d'avant.
6. **Les files Redis de production purgées** : le transitoire d'avant-swap pointe des ids d'une
   autre histoire (`adr-0065` : Redis = état de file transitoire ; mesuré vide en prod).
7. **`alembic upgrade head`** (maquette ④) : no-op si la tête du manifeste est celle du code
   (mesuré) ; rejoue les migrations manquantes si l'archive est plus ancienne (§5).
8. **Le worker de production se recycle** (maquette ⑤) : arrêt gracieux de lui-même en dernière
   étape — un `SimpleWorker` ne recharge ni code ni schéma ; supervisé, l'arrêt EST le
   redémarrage (`adr-0064`). Le backend et `worker-media`, eux, n'ont que des pools : la
   reconnexion suffit tant que ⑦ garantit le schéma attendu.

### §3 — Le journal du geste vit en **sidecar**, pas en base — et la ligne du travail meurt au swap

Le verdict de la restauration (archive, horodatages, étapes franchies, comptes, écarts) s'écrit
dans **`<archive>.restauration.json`** sur la cible — même famille que les sidecars du 0065 :
lisible sans la base qu'il raconte. **La ligne `ai_jobs` du travail disparaît au swap** (elle vit
dans `zetis_avant`) : c'est structurel, assumé et écrit — la barre verra le travail s'évanouir,
la page Données lira le sidecar. Aucune ligne n'est recréée dans la base restaurée : y insérer
une trace après coup falsifierait l'histoire qu'on vient précisément de restaurer.

### §4 — `zetis_avant` : UN filet immédiat, écrasé au geste suivant

Le swap laisse l'état d'avant intact sous le nom **`zetis_avant`** — c'est le repli à chaud
(quelques secondes, un re-swap manuel documenté), en PLUS de la sauvegarde-filet du §2.① (le
repli durable). Une seule `zetis_avant` existe : la restauration suivante la **remplace**
(`DROP … WITH (FORCE)` puis renommage). Pas de bouton « annuler la restauration » en v1 — le
re-swap vit en runbook (`TROUBLESHOOTING.md`), et le §Signaux dit quand ce choix devra être
rouvert.

### §5 — Compatibilité : trois verdicts, rendus AVANT le geste

Lu du manifeste scellé (tête Alembic + version serveur) contre le code installé :

| Cas | Verdict |
|---|---|
| tête du manifeste **= tête du code** | ✅ restaurable — ⑦ sera un no-op (mesuré) |
| tête **plus ancienne, présente dans l'historique** des migrations du code | ✅ restaurable — ⑦ rejoue les migrations manquantes. ⚠️ Chemin **non mesuré** à ce jour (aucune archive d'une tête antérieure n'existe encore) — le read-before-code de la slice le dira |
| tête **inconnue du code** (archive plus récente, ou étrangère) | 🚫 refus motivé — le code ne sait pas servir ce schéma |

C'est le cas réaliste qui impose le deuxième verdict : on restaure le plus souvent APRÈS une
bêtise, donc parfois après un déploiement qui a migré — un refus strict rendrait le geste
inutilisable le jour où on en a besoin.

### §6 — Supprimer une archive : un geste explicite, jamais une rotation

`DELETE` d'une archive = le tar **et** ses sidecars, sur confirmation **explicite** (le dialogue
nomme l'archive ; un toast n'est qu'un retour d'action, jamais une confirmation — vœu utilisateur
traduit dans les règles `adr-0062` §6). Refus motivés : un travail de sauvegarde en `queued|
running` · 🔴 **la dernière archive au verdict `reussie` ne se supprime pas** tant qu'aucune
autre archive vérifiée n'existe — on ne se met jamais soi-même à zéro filet. Aucune rotation,
aucune purge automatique : ça reste le sous-chantier « purges & rétention » de la phase E.

### §7 — La surface : dans l'onglet 💾, sous les archives — pas de « zone rouge » générique

Le geste **Restaurer** n'apparaît que sur les archives au verdict `reussie` ; sa confirmation est
un dialogue qui nomme l'archive, énonce la séquence (filet compris) et exige une **saisie de
confirmation** (classe A4 — un clic ne suffit pas). **Supprimer** : dialogue nommant l'archive,
sans saisie. Les refus serveur s'affichent en ambre avec leur motif (`estRefus`), les toasts ne
portent que le retour d'action. La « zone rouge » complète de la maquette (remises à zéro)
appartient à son propre sous-chantier.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Script hôte, pile arrêtée** (`prod:down` → restaurer → `prod:up`) | Sort du produit — pas de préconditions vérifiées, pas de filet imposé, pas de verdict lisible ; l'`adr-0063` §8 et l'`adr-0065` §8 placent déjà la restauration dans le produit, et le swap mesuré à **8 ms** rend l'arrêt complet inutile. L'hôte garde ses deux rôles : certifier (0065 §3) et le re-swap de secours (§4, runbook). |
| **`DROP zetis` puis restaurer en place** | Une fenêtre de plusieurs secondes SANS état valable ni repli immédiat ; le double RENAME donne un swap quasi atomique **et** garde `zetis_avant`. |
| **Le travail réécrit sa ligne `ai_jobs` dans la base restaurée** | Falsifie l'histoire qu'on vient de restaurer — une trace du futur dans un état du passé. Le sidecar (§3) raconte le geste sans toucher l'histoire. |
| **Restaurer sans sauvegarde-filet** (l'archive vérifiée suffit, non ?) | L'archive restaurée est vérifiée, mais l'état COURANT qu'on écrase ne l'est pas encore — le ① de la maquette est « non négociable » à raison : c'est lui qui rend le geste réversible. |
| **Vérifier automatiquement l'archive juste avant de restaurer** (fusionner §1 dans la séquence) | Allonge le geste et masque le mérite : le verdict est un **préalable visible** (§1), pas une sous-étape silencieuse — même arbitrage que « vérifier après chaque sauvegarde », écarté au 0065. |
| **Une « zone rouge » générique dès maintenant** | Un gabarit pour un seul geste ; les remises à zéro la justifieront — pas avant. |

## Périmètre

🔴 **Trois critères qui bornent, et ils mordent dès le premier jour :**

1. **Aucune migration Alembic, aucune colonne neuve.** Le verdict vit en sidecar (§3), le réveil
   réutilise les clés `app_settings` existantes (§2.③). Le jour où ce chantier veut une table, il
   est sorti de son périmètre.
2. **Aucun octet d'archive sur HTTP** — `adr-0065` §1, cité tel quel : les routes rendent des
   métadonnées, des verdicts et des 202/409.
3. **Le destructif est ÉNUMÉRÉ, tout le reste est interdit** : `zetis` (par swap, filet §2.① +
   `zetis_avant` §4) · le bucket et `/shared/audio` (§2.⑤, après filet) · `zetis_avant` (écrasée
   au swap suivant) · les files Redis de production (§2.⑥) · l'archive qu'un DELETE explicite
   vise (§6). Rien d'autre — pas de purge de voix, pas de remise à zéro, pas de rotation.

**Livré** : le travail `backup_restore` et ses préconditions 409 · le sidecar `.restauration.json`
· le verdict de compatibilité · `DELETE` d'archive avec ses gardes · la surface (§7) · les
test-verrous (dont : jamais sans filet ①, réveil suspendu + MANUAL, la dernière archive vérifiée
ne se supprime pas, aucun octet sur HTTP).

## Hors périmètre — nommé

- **Remises à zéro / zone rouge générique** — leur propre sous-chantier de phase E.
- **Export RGPD lisible** — `adr-0065` §9, signal de réouverture déjà écrit là-bas.
- **Occupation disque · cohérence Postgres ↔ MinIO** — sous-chantier à part (BACKLOG §E).
- **Purges & rétention automatiques** (rotation des archives, voix) — le DELETE du §6 est un
  geste unitaire, jamais une politique.
- **Bouton « annuler la restauration »** — le re-swap `zetis_avant` reste un runbook (§4).
- **Restaurer une archive plus récente que le code** (downgrade de schéma) — refusé au §5, aucun
  chemin ne l'ouvre.
- **Planification / restauration automatique** — même interdit que la sauvegarde planifiée
  (`adr-0065`, `adr-0023`).

## Conséquences

**Ce que ça donne.** La phase B promettait « on n'ose remplacer un état que parce qu'une archive
vérifiée existe » — ce chantier est ce remplacement, avec un double filet (sauvegarde fraîche +
`zetis_avant`), un réveil qui n'obéit qu'à Papa, et un journal qui survit à la base qu'il
raconte.

**Ce que ça coûte.**

- **Une fenêtre d'indisponibilité** pendant le swap — 8 ms mesurés en essai, des requêtes en vol
  qui échouent, et l'auto-recyclage du worker derrière (~redémarrage superviseur). Assumé pour un
  geste de catastrophe ; l'écran l'annonce avant le clic.
- **Le cluster porte deux bases** (`zetis` + `zetis_avant`) — 16 Mo aujourd'hui, négligeable ;
  le §Signaux surveille l'échelle.
- **L'histoire des travaux recule** : après restauration, `ai_jobs` et le journal sont ceux de
  l'archive — la barre et les échecs racontent l'époque restaurée. C'est la définition du geste,
  pas un défaut ; le sidecar (§3) garde la trace du geste lui-même.
- **Le `.env` ne revient pas** (`adr-0065` §2) : une restauration sur machine neuve exige de le
  reposer à la main — déjà écrit dans le manifeste.

## Le signal qui dirait qu'on s'est trompé

- 🔴 **Une restauration laisse un couple cassé** (base restaurée, médias pas remis, ou l'inverse)
  — alors le §2.⑤ n'est pas assez atomique et le couple doit devenir transactionnel autrement.
- **Le re-swap `zetis_avant` est réellement utilisé** — le runbook a servi : le bouton « annuler »
  écarté au §4 devient dû.
- **Papa restaure souvent** — ce n'était pas un geste de catastrophe mais un usage ; la séquence
  (filet systématique, réveil suspendu) est trop lourde pour de l'ordinaire et doit être repensée.
- **La sauvegarde-filet du ① échoue régulièrement** (couple incomplet au moment critique) — les
  préconditions sont trop dures précisément quand on a besoin du geste ; il faut un mode « filet
  dégradé assumé », à décider alors, jamais en silence.
- **La fenêtre d'indisponibilité devient perceptible** (base en Go, terminate qui traîne) — le
  swap à chaud cesse d'être gratuit, l'alternative pile-arrêtée redevient une option.

## Suivi

1. **Slice 1 — le geste** : `backup_restore` (préconditions 409 · filet ① · restore ② · réveil ③
   · swap ④ · médias ⑤ · purge Redis ⑥ · upgrade ⑦ · recyclage ⑧) · sidecar `.restauration.json`
   · verdict de compatibilité servi par `GET /donnees`. Branche `feat/restaurer-une-sauvegarde`.
2. **Slice 2 — l'administration** : `DELETE` d'archive et ses gardes (§6) · la surface (§7 :
   Restaurer + Supprimer, dialogues, saisie de confirmation) · le runbook du re-swap (§4) dans
   `TROUBLESHOOTING.md`.
3. **Read-before-code dus dans les slices** : 🔴 le **seed de l'entrypoint est-il idempotent sur
   une base restaurée pleine** (il rejoue à chaque boot — un seed qui insère doublerait des
   lignes au premier redémarrage post-restauration) · le warm shutdown de **soi-même** depuis un
   travail RQ (`send_shutdown_command` sur son propre worker — vérifier le comportement) · les
   clés Redis exactes à purger (files RQ + registres) · `remove_objects` MinIO (vider un bucket
   par l'API) · le chemin « tête plus ancienne » du §5 (aucune archive antérieure n'existe pour
   le mesurer — le dire si toujours vrai).
4. La phase E suivante (remises à zéro) **relira** ce swap et son réveil suspendu — elle ne les
   redécide pas.

## Amendement 1 — Le réveil clôt les travaux d'une autre époque — 2026-08-19

### Statut

**Proposé — 2026-08-19.** Né du premier essai réel du geste (résidu n°1 de la slice 2, joué en
dev ce jour) : la restauration a abouti — 8/8 étapes, zéro écart — et a réveillé un **travail
fantôme** que cet amendement décide d'éteindre. Les §1 à §7 ne bougent pas ; le §2.③ s'étend, la
frontière du §3 se précise.

### Contexte — le fait est structurel, et il est MESURÉ

**Toute archive du produit contient SA PROPRE ligne `ai_jobs` en `running`** : le dump est pris
sur un instantané exporté PENDANT le travail qui crée l'archive (`_instantane`, ADR-0065 §5) —
sa ligne y est donc, à jamais « en cours ». Mesuré le 2026-08-19 sur les deux vrais tars de
l'essai : `zetis-2026-08-19-1756.tar` porte `896 · backup_create · running`, et la
sauvegarde-filet `…-1807.tar` porte `899 · backup_restore · running` (le geste lui-même — le
filet du ① embarque le travail de restauration qui le commande). Une (1) ligne en vol par dump
mesuré ; rien n'empêche d'autres `queued` d'y figurer (`backup_create` n'exige pas « rien en
vol », et c'est assumé).

**Restaurée, cette ligne revit en fantôme éternel — conséquences mesurées en dev** :

- la barre affiche « ZETIS produit — backup_create » à demeure ;
- `POST /donnees/sauvegarde` rend **409** « *Une sauvegarde est déjà en file ou en cours
  (travail #896) : attendez sa fin…* » — un motif qui **ment** (elle ne finira jamais), et donc
  🔴 **l'état post-catastrophe ne peut plus se sauvegarder** — précisément le moment où le filet
  compte le plus ;
- les préconditions « rien en vol » de la restauration (§2) et du DELETE (§6) refusent pareil ;
- un lot `production_runs` restauré `running` bloquerait de même : la précondition lit le statut
  BRUT, pas le `stale` dérivé à la lecture (ADR-0034 §2 — ce patron couvre un battement expiré
  d'un lot *vivant*, pas une époque morte).

### Décision

1. **Le §2.③ s'étend.** Les écritures de réveil — DANS `zetis_restore`, avant le swap, sur la
   même connexion que les upserts existants — **clôturent les travaux et lots d'une autre
   époque** : `ai_jobs` en `queued|running` passent à `failed` avec un `error_message` motivé
   (il nomme la restauration et l'archive) et `finished_at` posé ; `production_runs` en
   `queued|running` passent à `failed` avec `finished_at`. Même principe que le régime dans la
   phrase fondatrice du ③ : *une archive AUTONOM ne réarme pas AUTONOM en silence* — **une
   archive ne fait revivre ni un travail ni un lot**.
2. **La frontière du §3 est précisée, pas rouverte.** Le §3 interdit d'**insérer** une trace du
   geste dans l'histoire restaurée — fabriquer du futur dans le passé. Le réveil, lui, **adapte
   l'état restauré** pour que le monde se lève sain : il écrivait déjà suspension, régime et
   déclencheur ; il clôt désormais ce qui prétendrait courir. Clore n'est pas falsifier : la
   ligne **reste**, datée et motivée — elle raconte qu'une restauration l'a interrompue.
3. **Aucune surface neuve.** Les lignes closes tombent dans **Échecs** tel qu'il existe
   (`status='failed'` + `error_message`, acquittement serveur ADR-0041 §8) : Papa les voit, lit
   le motif, acquitte. Le seul texte nouveau est le motif lui-même.
4. **Le sidecar dit ce que le réveil a éteint** : le détail de l'étape `reveil` porte les ids
   clos (travaux et lots) — le journal du geste reste la seule trace complète (§3).

### Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Ne rien faire** | Mesuré : barre fantôme, 409 au motif menteur, et l'état post-restauration ne peut plus NI se sauvegarder NI se re-restaurer — le filet meurt au moment où il sert. |
| **`DELETE` des lignes restaurées** | Falsifie l'histoire (§3) : la ligne a existé ; l'effacer ment plus que la clore. |
| **Un statut neuf (`interrompu`)** | Le vocabulaire `queued\|running\|succeeded\|failed` est requêté partout, Échecs ne montrerait pas le nouveau venu sans chantier de surface — `failed` + motif porte la même information pour zéro coût. |
| **Nettoyer à la LECTURE** (gardes dans `refus_*`, patron `stale`) | Soigne chaque symptôme là où on pense à l'ajouter : la barre mentirait encore, et chaque précondition future devrait re-connaître le fantôme. Une écriture unique au réveil éteint la source. |
| **Clore APRÈS le swap** | Fenêtre où barre et refus voient le fantôme, et le worker meurt au ⑧ — l'après-swap n'a pas de main sûre. Le ③ est le seul moment où la base restaurée est à nous sans être encore le monde. |

### Périmètre — les critères mordent

1. **Aucune ligne INSÉRÉE** dans `ai_jobs` ni `production_runs` restaurées — le §3 tient tel
   quel, cet amendement ne l'entame pas.
2. **Aucun statut nouveau, aucune migration, aucune colonne.**
3. Seuls **`queued|running` restaurés** sont touchés — jamais `succeeded`, `failed` ou `done` :
   l'histoire accomplie ne se réécrit pas.
4. **Aucun changement de surface** — Échecs existant fait foi.

### Hors périmètre — nommé

- Le **toast de fin de restauration** (demande du 2026-08-19) — son propre cadrage, autre
  mécanique (la découverte de fin sans sondage).
- Toute purge/rotation (sous-chantier phase E, inchangé).
- Un `UPDATE` manuel du fantôme #896 qui vit dans la base dev : **il est la preuve vivante du
  chantier** — rejouer la restauration de `…-1756.tar` avec le code amendé DOIT le clore.

### Le signal qui dirait qu'on s'est trompé

- **Une restauration clôt régulièrement PLUS d'une ligne `ai_jobs`** : des travaux tiers vivaient
  pendant les dumps — interroger alors les préconditions de `backup_create` (aujourd'hui il
  n'exige pas « rien en vol », mesuré et assumé), pas élargir la clôture.
- **Un travail légitime se retrouve clos** : impossible par construction (le réveil n'écrit que
  dans `zetis_restore`, qui n'a pas de monde vivant avant le swap) — si ça arrive, c'est un bug
  d'adressage de connexion, jamais une doctrine à assouplir.

### Suivi

1. **Une slice unique** — après cet amendement, c'est une application (cas 2 de l'`adr-0060`) :
   branche directe `fix/reveil-clot-les-fantomes`, périmètre posé au premier message, pas
   d'`/ouverture`.
2. **Test-verrous dus** : la clôture visible dans l'ordre SQL asserté du réveil — ⚠️ les
   assertions de `test_le_reveil_est_ecrit_avant_le_swap` **évoluent**, c'est LE changement de
   comportement voulu et le seul · fantôme clos ⇒ `refus()` de sauvegarde ne bloque plus · les
   lots couverts · `succeeded`/`done` intouchés · le sidecar porte les ids clos.
3. **La preuve vivante en dev** : rejouer `…-1756.tar` → #896 clos en Échecs (acquittable),
   barre propre, 💾 Sauvegarder repart.
