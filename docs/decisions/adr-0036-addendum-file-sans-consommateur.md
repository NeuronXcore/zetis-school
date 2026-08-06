# Addendum ADR-0036 — Une file que personne n'écoute n'est pas une attente

## Statut

Accepté — 2026-08-05.

> ⚠️ **Écrit APRÈS le code, et c'est un écart au rituel qu'il faut nommer plutôt que masquer.**
> `CLAUDE.md` pose `mockup → spec → ADR → prompt` ; ce chantier est entré par un signalement de bug
> (« les lots s'accumulent, le front reste à 0 % »), a été corrigé, testé et mergé — **PR #85, squash
> `7c3e290`** — puis on a constaté que quatre décisions de conception avaient été prises en chemin
> et ne vivaient nulle part sous forme opposable. Cet addendum les remonte. Il ne décrit donc pas un
> chantier à faire : il **fige des règles déjà appliquées**, pour qu'une session future qui voudra
> « simplifier » sache ce qu'elle défait.
>
> S'appuie sur : `adr-0031 §3` (le backend n'exécute jamais un lot — il enfile), `adr-0036 §2` (le
> scope de PIÈCE), `adr-0036 §4` (le gate est la disponibilité), `adr-0037` (une question, une
> implémentation), `adr-0021` (on ne régénère jamais ce qui existe), `adr-0034 §F.4` (le Journal ne
> réécrit pas le passé), `adr-0030` (un écran, un appel réseau).
>
> **Ne révoque rien.** Il étend l'ADR-0036 côté **exécution** là où celui-ci n'avait traité que la
> **décision de produire**.

## Contexte — le trou que l'ADR-0036 laissait

L'ADR-0031 §3 a posé une frontière juste : *« le backend n'exécute JAMAIS le rendu — il se contente
d'enfiler »*. L'ADR-0036 a bâti dessus toute la chaîne demande → lot. Les deux raisonnent sur ce
qu'il faut **décider de produire**, et aucun des deux ne dit ce qui se passe quand **personne ne
consomme la file**.

Ce n'est pas une hypothèse. Le 2026-08-05, mesuré :

| Fait | Valeur |
|---|---|
| worker de production | **aucun processus** (`scripts/dev.sh` ne l'a jamais lancé) |
| `rq:queue:production` | **4 jobs** en attente |
| `production_runs` #24 à #27 | `queued`, `started_at` **NULL**, sur le même scope (`fiche`, notion 30) |
| ce que l'écran disait | « ZETIS va produire une fiche · **en file d'attente** » |
| ce que l'écran montrait | **0 %** |
| durée | **six heures** |

**Rien n'était cassé.** Le backend acceptait en `202`, conformément à l'ADR-0031 §3 ; la file
grossissait, conformément à sa nature ; l'écran affichait une phrase **littéralement vraie**. C'est
précisément pour ça que le défaut a tenu six heures et que le correctif de la veille — qui avait
rendu l'en-tête honnête sur le pourcentage — n'y changeait rien.

Et le défaut se **reproduisait tout seul** : revenir sur la page Demandes effaçait la barre et
rendait le bouton « Produire ». Papa recliquait. Quatre lots identiques ne sont pas quatre erreurs
de Papa — c'est **un écran qui a oublié quatre fois**.

## Décision

### 1. Une file sans consommateur est un ARRÊT, et ZETIS le dit

`GET /api/production/runs/active` porte `worker_alive: bool`.

**`false` ne veut pas dire « ça va être long ». Il veut dire « personne ne viendra ».** Les deux
états n'appellent pas le même geste de Papa : l'un se laisse finir, l'autre se répare. Un écran qui
les confond transforme une panne en patience.

L'interface change de **verbe**, pas seulement de couleur : « ZETIS **va produire** … en file
d'attente » devient « ZETIS **ne produit pas** … aucun moteur de production actif ».

⚠️ **Le point d'activité cesse de pulser.** Une animation sur une file arrêtée ment avant qu'on ait
lu le texte — c'est elle qu'on regarde en premier.

⚠️ **La question n'est posée que sur un lot `queued`.** Un lot `running` a forcément quelqu'un qui
l'exécute : demander à Redis serait payer un aller-retour pour une réponse connue, quatre fois par
minute, sur les 22 pages Papa. Et le champ ne vit **que sur cette route** — le poser sur
`ProductionRunOut` le ferait payer une fois par ligne du Journal, qui en aligne des dizaines.

> **Le worker n'est pas optionnel, et le dépôt doit le dire à trois endroits.** Il manquait à
> `scripts/dev.sh` **et** à `ARCHITECTURE.md`. Un troisième processus qu'aucun document ne nomme est
> un processus que personne ne lance. Il est désormais lancé et arrêté avec la stack de dev.

### 2. `null` n'est pas `0` — un chiffre se lit comme une mesure

Le hook de lecture d'un lot rend `pct: null` tant que rien n'a démarré. **Aucun consommateur n'a le
droit de retraduire ce refus en chiffre.** Le défaut tenait en trois caractères — `pct ?? 0` — et il
annulait la règle que le reste du code s'échinait à tenir : le libellé disait vrai, la case du
pourcentage disait 0, **et c'est la case qu'on lit**.

Deux corollaires, qui sont la vraie portée de cette section :

- ⚠️ **Une barre partiellement remplie EST un pourcentage**, même sans chiffre à côté. Une barre
  indéterminée ne se remplit donc **jamais** : un liseré balaie, il ne progresse pas.
- ⚠️ **On retire la case du pourcentage, on ne la remplit pas d'un « — » ou d'un « ? ».** Un
  caractère dans l'emplacement d'une valeur se lit encore comme une valeur.

### 3. Ce qui vit dans un worker ne se mémorise pas dans une page — il se redérive

La page Demandes gardait les lots lancés dans son propre état. **Un travail qui vit ailleurs que
dans la page ne peut pas avoir la page pour mémoire** : la quitter effaçait tout, et le bouton
« Produire » revenait comme si rien n'avait été lancé.

Chaque demande porte donc `active_run`, **redérivé serveur à chaque lecture**, en **une passe
groupée** — patron `blocked_reason` de l'addendum « verdict de situation », et pour le même motif :
un appel par ligne referait les N requêtes par page que l'ADR-0030 a supprimées.

⚠️ **Le rapprochement ne passe par AUCUNE clé étrangère**, et il ne le peut pas : un lot `manual` ne
porte pas de `content_request_id` — l'ADR-0031 §4 l'interdit, et l'ADR-0036 §2 a redit pourquoi
(*« ses colonnes disent POURQUOI on a produit, jamais SUR QUOI »*). Il se fait sur ce que les deux
tables partagent, `(skill_id, piece)`, via `REQUEST_KIND_TO_PIECE`.

⚠️ **Seuls les lots-PIÈCE sont rapprochés.** Un lot de chapitre produit aussi la notion, mais il ne
répond pas de **cette** demande : afficher son avancement sur la ligne ferait croire qu'une fiche
arrive quand le lot en fabrique quinze, dont peut-être pas celle-là. **On préfère ne rien dire que
dire à peu près.**

Et l'avancement **reprend** : l'estimation s'ancre sur `started_at`, qui voyage avec le lot. Sans
lui, elle mesurait **l'âge de l'affichage** et non celui de l'opération — le montage d'un composant
n'est pas le départ d'un travail.

### 4. Deux refus, et ils ne disent pas la même chose

`create_run` refuse en `409` dans deux situations distinctes.

| Situation | Ce que le refus dit |
|---|---|
| un lot au **même scope** est `queued`/`running` | « Une production identique {attend son tour \| est en cours} déjà (lot #N). » |
| le **contenu existe déjà** (lots-PIÈCE) | « La {pièce} de cette notion existe déjà. Relancer une production ne la remplacerait pas. » |

⚠️ **Le premier refus NOMME le lot existant.** Un refus qu'on ne peut pas aller vérifier se lit
comme un bug.

⚠️ **Ce n'est PAS de l'idempotence, et les confondre serait grave.** `run_exists_for` (ADR-0035)
demande *« ce lot a-t-il déjà été produit ? »* sur toute l'histoire ; ici on demande *« y en a-t-il
un en TRAIN de le faire ? »*. Relancer une production **terminée** reste parfaitement légitime — un
refus permanent déguisé en garde-fou interdirait toute régénération.

⚠️ **La garde vient APRÈS `close_stale_runs`**, jamais avant : un lot zombie interdirait sinon ce
scope pour toujours.

⚠️ **« Existe » ne veut pas dire « rien à faire ».** Une pièce `pending` que le régime permet de
valider est un lot **utile** — `equip_piece` la valide, et cela satisfait la demande. Refuser là
supprimerait le seul geste qui restait et laisserait la demande de Massimo ouverte **pour
toujours**, en contradiction directe avec le §4 de l'ADR-0036. Le prédicat porte donc la nuance
(`peut_valider`), depuis la **même source que le lot**.

⚠️ **Le prédicat RÉUTILISE les fonctions d'existence d'`equip_piece`**, il n'en réécrit aucune, et
un test-verrou d'architecture inspecte la source pour l'exiger. C'est la leçon de l'ADR-0037 : une
seconde lecture « qui donne le même résultat » diverge au premier générateur ajouté — et l'écran
refuserait alors ce que le lot aurait produit, ou l'inverse.

⚠️ **Lots-PIÈCE seulement.** Un lot de chapitre saute ses notions déjà équipées **une par une** et
produit les autres ; le refuser en bloc supprimerait du travail réel.

### 5. Un refus n'est pas une panne — et l'interface ne doit pas les peindre pareil

Quand ZETIS refuse, **il vient de bien travailler** : il a reconnu la situation et n'a rien détruit.
Le peindre en rouge, à côté des erreurs, apprendrait à Papa que **les refus de ZETIS sont des
dysfonctionnements** — et l'entraînerait à les ignorer.

Un refus part donc en **annonce éphémère** (toast), le bandeau rouge restant réservé à ce qui casse.

- `role="status"`, **pas** `role="alert"` : `alert` interrompt un lecteur d'écran au milieu de sa
  phrase. La brutalité est réservée à ce qui casse ; ici on informe.
- **Elle s'efface seule** — patron `ProductionDoneModal`, *« ne laisse aucune trace à traiter »*. Un
  avis qui exige un clic devient une tâche, et une pile d'avis devient un arriéré : exactement ce
  que l'addendum ADR-0011 §F.2 interdit.

⚠️ **Le tri se fait sur le CODE HTTP, jamais sur le texte du message.** Reconnaître un refus à ses
mots le casserait à la première reformulation — et ces messages **ont déjà été réécrits une fois**,
au §7 du chantier du 2026-08-04. Le client d'API lève donc une erreur qui **conserve son statut**,
de façon additive : tout appelant qui lit `.message` continue sans changer d'un caractère.

## Ce que cet addendum ne fera pas

- **Il ne surveille pas le worker.** `worker_alive` répond à qui regarde, quand il regarde. Aucun
  ordonnanceur, aucune alerte poussée, aucun redémarrage automatique — la doctrine de l'ADR-0023 sur
  les tâches de fond tient, et un dispositif qui se relance seul est un dispositif dont on cesse de
  savoir s'il tourne.
- **Il ne connaît pas la FRAÎCHEUR.** Le refus de doublon répond « ça existe », jamais « ça existe
  mais le cours a changé depuis ». La Couverture, elle, sait dire *périmé* (`content_updated_at`).
  Une pièce périmée est donc refusée comme un doublon. Sans conséquence aujourd'hui — la
  régénération passe par la page de la pièce, pas par un lot — **mais c'est ici que ça bloquera** le
  jour où « reproduire ce qui est périmé » deviendra un geste de la page Demandes.
- **Il ne touche pas `Lesson.status`**, dont la conflation reste le défaut de fond nommé par
  l'addendum « verdict de situation ». Chantier à part, avec migration.
- **Il n'ajoute aucune surface côté Massimo.** Le §6 de l'ADR-0036 tient mot pour mot : lui montrer
  qu'un contenu se prépare serait une **promesse**. `worker_alive` est une information de pilotage,
  elle est à Papa.
- **Aucune migration.** Pas une colonne touchée.

## Le signal qui dirait qu'on s'est trompé

**Papa qui cesse de lire les toasts.** Si le refus de doublon devient assez fréquent pour être
balayé d'un geste, c'est que l'écran offre un bouton dans une situation où il ne devrait pas — et la
réponse serait alors de **remonter le verdict avant le clic** (patron `blocked_reason`), pas de
rendre l'annonce plus insistante. Une annonce qu'on renforce parce qu'elle est ignorée est une
annonce qui a déjà perdu.

Second signal, plus grave : **un `worker_alive` à `true` pendant que rien ne tourne**. Il serait
pire que pas d'indicateur du tout, puisqu'il ferait chercher la panne ailleurs. Le risque est réel
et documenté — `rq.Worker.count()` compte des noms dont le hash a expiré, et rend `1` sur une file
que plus personne n'écoute ; seul `Worker.all()` dit vrai. Toute réécriture de ce prédicat doit être
vérifiée **worker éteint**, pas worker allumé.
