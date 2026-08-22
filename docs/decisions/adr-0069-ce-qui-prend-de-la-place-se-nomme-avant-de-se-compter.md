---
id: "0069"
titre: "Ce qui prend de la place se nomme avant de se compter"
type: surface
statut: propose
date: 2026-08-22
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0023", "0060", "0062"]
---
# ADR-0069 — Ce qui prend de la place se nomme avant de se compter

## Statut

**Proposé — 2026-08-22.** Cadrage du sous-chantier **occupation disque** de la phase **E** du
`BACKLOG.md`. Décision **neuve** (cas 3 de l'ADR-0060) : elle engage un contrat publié et, surtout,
elle fixe **ce que le mot « place » désignera** — un chiffre qu'on lit une fois par mois et qui doit
être juste ce jour-là.

⚠️ **Deux des trois postes de la ligne du BACKLOG ne sont PAS dans ce cadrage** : la *cohérence
Postgres ↔ MinIO* existe déjà (`scripts/check_media_integrity.py`), et les *purges* sont le
sous-chantier suivant. Voir le §Hors périmètre.

## Contexte — ce que la mesure a montré, et les trois surprises

Relevé du **2026-08-22**, sur le dépôt réel :

| Poste | Où il vit VRAIMENT | Taille | Temps de mesure |
|---|---|---|---|
| **Audio généré** | `apps/backend/storage/generated` | **47,6 Mo** (76 fichiers) | **1 ms** |
| **Modèles** (Piper) | `storage/models/piper` (racine) | **194 Mo** | 4 ms |
| **Base Postgres** | volume `zetis_postgres_data` | **90,4 Mo** | — |
| **MinIO** | volume `zetis_minio_data` | **1,2 Mo** | — |
| **Archives** | la cible certifiée | 3 × 48 Mo (dev) · 174 Ko (prod) | 0 ms |

**Surprise 1 — 🔴 il y a DEUX `storage/` dans le dépôt, et le bon n'est pas celui qu'on croit.**
`audio_storage_dir` vaut `"storage/generated"`, un chemin **relatif**, résolu depuis le **cwd du
processus** : uvicorn étant lancé depuis `apps/backend`, l'audio vit dans
`apps/backend/storage/generated`. Le `storage/` de la racine ne contient **que les modèles**. Un
panneau qui mesurerait « `storage/` » afficherait 194 Mo de modèles et **zéro** média.

**Surprise 2 — 🔴 le plus gros poste n'est pas une donnée de Massimo.** Les 194 Mo de modèles Piper
dominent tout le reste réuni, et ils sont **régénérables** — la sauvegarde les exclut nommément
(`EXCLUSIONS` : *« modèles (Piper, Whisper, Ollama) — régénérables — bakés dans l'image ou
`ollama pull` (~21 Go hors archive) »*). Un total qui les inclut répond à une autre question que
celle qu'on pose.

**Surprise 3 — 🔴 MinIO est quasi vide, et c'est NORMAL.** `storage_backend` vaut `disk` : rien ne
s'y écrit. Afficher « MinIO : 1,2 Mo » à côté de l'audio ferait croire à une perte — c'est le faux
positif **exact** que `check_media_integrity.py` a été écrit pour tuer, après le diagnostic erroné
du 2026-08-18 (*« 13 capsules en base, 0 fichier dans MinIO »*, alors que tout était sur le disque).

**Et une contrainte mesurée le même jour, qui corrige une intuition** : vu d'un conteneur, un
**bind-mount** rend l'espace réel de l'hôte (3,6 T / 3,6 T des deux côtés — mesuré), tandis que la
racine du conteneur rend le **disque virtuel de Docker Desktop** (845,5 G / 910,7 G) et non le Mac
(809 Gi / 926 Gi). **Deux plafonds distincts**, et ZETIS peut manquer de place parce que l'image
Docker est pleine alors que le Mac a de la marge.

## Décision

### §1 — La question est « **qu'est-ce qui prend de la place ?** », pas « vais-je manquer de place ? »

L'écran rend des **tailles de ce que ZETIS a produit**. Il ne rend **aucun espace libre**, et c'est
un choix, pas un manque :

- l'espace libre a **deux plafonds** (bind-mount vs image Docker) qui ne se valent pas ; en montrer
  un seul mentirait, en montrer deux demanderait à Papa d'arbitrer entre deux chiffres pour une
  question qu'il pose une fois par mois ;
- une taille produite est **vraie partout** — native comme conteneurisée — parce qu'elle ne dépend
  d'aucun montage.

🔴 Le jour où « vais-je manquer de place ? » se pose vraiment, c'est **son propre cadrage**, et il
devra choisir son plafond explicitement.

### §2 — Quatre postes nommés, et **les modèles n'en sont pas un**

| Poste | Ce qu'il compte | Pourquoi il est là |
|---|---|---|
| **Médias produits** | le **backend de stockage ACTIF** (disque ou MinIO), jamais les deux | c'est ce que ZETIS fabrique pour Massimo |
| **Base** | `pg_database_size` de la base courante | l'histoire scolaire elle-même |
| **Archives** | la somme des `.tar` de la cible certifiée | déjà visible par archive ; le total manque |
| **Total des données** | la somme des trois | 🔴 **ce nombre-ci est celui qui compte** |

🔴 **Les modèles sont EXCLUS du total**, et l'écran le dit. Ils dominent (194 Mo contre 139 Mo pour
tout le reste), ils sont régénérables, et la sauvegarde les exclut déjà. Les compter ferait croire
que ZETIS grossit alors que c'est un téléchargement figé. Ils peuvent s'afficher **à part**, en
note — jamais dans le total.

### §3 — Le backend de stockage se **lit**, il ne se devine pas

Le poste « médias » interroge le backend que `settings.storage_backend` désigne, et **lui seul**.
Il n'affiche jamais les deux côte à côte.

⚠️ **C'est la règle de `check_media_integrity.py`, reprise telle quelle** — et elle a été payée :
un contrôle qui devine le backend a produit un « 0 fichier » alarmant sur des données intactes. Un
panneau qui afficherait « disque : 47 Mo · MinIO : 0 Mo » referait exactement cette peur.

### §4 — Les chemins se lisent de la **configuration**, jamais en dur

Aucune constante de chemin dans le code de mesure. `settings.audio_storage_dir`,
`settings.backup_dir`, la base du DSN. 🔴 Le motif est mesuré : `audio_storage_dir` est **relatif**,
et deux `storage/` coexistent dans le dépôt. Un chemin écrit en dur y désignerait le mauvais, et
rendrait un total silencieusement faux.

### §5 — La mesure est **synchrone et à la demande**, comme le reste de l'onglet

Elle entre dans `GET /api/settings/donnees` — l'onglet 💾 a déjà **un** appel qui rend un instantané
cohérent, et un second en ferait deux instants.

Mesuré : parcourir les 76 fichiers audio prend **1 ms**. Aucune mise en cache, aucune tâche de
fond, aucun ordonnanceur (ADR-0023 §4). ⚠️ **Le signal qui dirait que ce choix a vieilli est écrit
au §Signaux** : le jour où la mesure dépasse la centaine de millisecondes, c'est le nombre de
fichiers qui a changé d'ordre de grandeur — et c'est **cette information-là** qui compte, pas le
temps de réponse.

### §6 — Aucun geste ici

L'écran **montre**, il ne purge pas. Les purges sont le sous-chantier suivant, et elles ont leur
propre cadrage.

⚠️ **On assume donc, pour un temps, un chiffre sans geste attaché** — ce que le dépôt évite
d'ordinaire (« le compteur qui vous regarde »). C'est tenable ici parce que le nombre répond à une
question que Papa **pose déjà** (« qu'est-ce qui grossit ? »), et qu'il en existe un usage immédiat
sans bouton : décider s'il faut purger, et quoi.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Montrer l'espace libre** | Deux plafonds (bind-mount 3,6 T vs image Docker 910,7 G — mesurés), qui ne répondent pas à la même question. En choisir un sans le dire serait un chiffre faux le jour où il compte. |
| **Compter les modèles dans le total** | Ils dominent (194 Mo sur 333) et sont **régénérables**. Le total dirait « ZETIS pèse 333 Mo » là où ses données pèsent 139. La sauvegarde les exclut déjà : deux définitions du mot « données » divergeraient. |
| **Afficher disque ET MinIO côte à côte** | Un des deux est toujours à zéro (`storage_backend`), et ce zéro-là a déjà provoqué un faux diagnostic de perte de contenu le 2026-08-18. |
| **Une route dédiée `GET /donnees/occupation`** | Deux appels = deux instants sur une page qui existe pour donner un état cohérent (ADR-0062 §2, même motif que `/machine`). |
| **Mesurer en tâche de fond et mettre en cache** | 1 ms mesuré. Un cache introduirait une fraîcheur à expliquer, et l'ADR-0023 §4 refuse l'ordonnanceur qui l'invaliderait. |
| **`du` sur le volume Docker plutôt que la base** | `pg_database_size` rend la taille **logique** de la base ; le volume porte en plus les WAL et l'espace non rendu. Deux nombres pour une chose, dont un que Papa ne peut pas interpréter. |

## Périmètre

**Livré** : les quatre postes du §2 servis par `GET /api/settings/donnees` · leur rendu dans
l'onglet 💾 · les modèles affichés **hors total** · les test-verrous (dont : le backend inactif
n'apparaît jamais · les modèles ne sont jamais dans le total · aucun chemin en dur).

**Trois critères qui bornent :**

1. **Aucun espace libre** n'est servi ni affiché (§1).
2. **Aucun geste** — ni purge, ni suppression, ni réglage (§6).
3. **Aucun chemin en dur** : tout vient de la configuration (§4).

## Hors périmètre — nommé

- 🔴 **La cohérence Postgres ↔ MinIO** — `scripts/check_media_integrity.py` la fait **déjà**, mieux
  que ne le ferait une reprise : il lit la config réelle, vérifie vidéo, audio, orphelins et RAG.
  L'**amener à l'écran** est une autre question, avec son propre cadrage. La ligne du `BACKLOG` les
  empaquetait ; elles se séparent ici.
- **Les purges et la rétention des voix** — sous-chantier suivant.
- **« Vais-je manquer de place ? »** — voir le §1. Son propre cadrage, avec le choix explicite d'un
  plafond.
- **Toute surface hors de l'onglet 💾**, et **toute surface Massimo** : la place que prend ZETIS
  n'est pas une information d'enfant.
- **Les 21 Go de modèles Ollama**, hors dépôt et hors archive.

## Conséquences

**Ce que ça donne.** Papa peut répondre à « qu'est-ce qui grossit ? » sans ouvrir un terminal, avec
des chiffres qui veulent dire la même chose en dev et en prod.

**Ce que ça coûte, et c'est nommé.**

- **Un chiffre sans geste attaché**, jusqu'au sous-chantier des purges (§6).
- **Un total qui exclut le plus gros poste.** C'est justifié et écrit à l'écran, mais quelqu'un
  lira « 139 Mo » avec 333 Mo sur le disque, et il faudra que la note suffise.
- **Une mesure qui parcourt le disque à chaque lecture de l'onglet.** 1 ms aujourd'hui, et le
  §Signaux surveille.
- 🔴 **Le poste « médias » ne montre qu'un backend.** Si `storage_backend` change sans migration des
  fichiers, l'écran affichera un chiffre juste pour un backend et taira les octets restés dans
  l'autre. `check_media_integrity.py` reste l'outil qui voit les deux.

## Le signal qui dirait qu'on s'est trompé

- 🔴 **La mesure dépasse ~100 ms.** Le nombre de fichiers a changé d'ordre de grandeur — et c'est
  **cette information** qui compte. Remesurer le volume réel avant de songer à un cache.
- 🔴 **Papa demande « et il me reste combien ? »** devant ce panneau. Alors le §1 a répondu à côté,
  et « vais-je manquer de place ? » doit être cadré pour de bon, plafond choisi explicitement.
- **Quelqu'un rouvre un ticket « MinIO affiche 0 »**. Le §3 a sauté, ou sa note n'est pas lisible.
- **Le total est cité ailleurs** (un export, un rapport) sans sa note d'exclusion. Alors le nombre
  a quitté son contexte, et c'est la définition du §2 qu'il faut publier avec lui.
- **Les modèles disparaissent de l'écran** parce qu'ils « ne comptent pas ». Ils ne comptent pas
  *dans le total* ; les taire ferait de 194 Mo un mystère.

## Suivi

1. **Slice unique** (le chantier tient en une) : les quatre postes dans `GET /donnees`, leur rendu,
   les verrous. Branche directe — c'est un cas 3 **déjà cadré par cet ADR**, donc `/ouverture` puis
   `/slice`.
2. **Read-before-code dus** :
   - 🔴 **vérifier que `pg_database_size` est appelable depuis la session applicative** (droits) —
     non mesuré ;
   - le comportement quand `audio_storage_dir` **n'existe pas** (déploiement neuf) : le panneau doit
     rendre 0, jamais une erreur ;
   - la taille des archives se lit-elle déjà dans `etat_donnees` ? Elle y est **par archive** — le
     total ne doit pas être recalculé ailleurs.
3. **Compte rendu de surface** (cas 4) : la formulation des libellés, la place de la note sur les
   modèles, et l'ordre des postes — **dans la même session que la relecture visuelle**.
