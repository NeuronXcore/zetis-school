# TROUBLESHOOTING.md — Écarts réels rencontrés

> Journal des divergences concrètes (API inattendue, pièges d'intégration, crashs) rencontrées en
> cours de chantier, avec la cause et la solution retenue. Complète `MEMORY.md` (raisonnement) et
> les ADR (décisions). Une entrée = un piège qui ferait perdre du temps à la prochaine session.

## Leçons transversales — relogées depuis `MEMORY.md` — 2026-08-16

> **Pourquoi elles arrivent ici.** Onze élagages successifs de `MEMORY.md` ont chacun retiré leur
> récit en gardant un paragraphe intitulé *« ce qui ne survit qu'ici »*. Aveu exact : ces leçons
> n'avaient **aucune autre adresse**, donc `MEMORY.md` ne pouvait pas maigrir sans les détruire.
> Or ce fichier-ci se définit comme *« un piège qui ferait perdre du temps à la prochaine
> session »* — c'était leur place depuis le début. Chacune garde sa PR et son squash ; le récit
> complet reste dans `git log -p MEMORY.md`.
>
> 🔴 **La leçon sur les leçons** : un contenu sans domicile s'accumule là où il est tombé. Quand un
> rangement bute toujours sur les mêmes lignes, la question n'est pas *« peut-on les supprimer ? »*
> mais *« où auraient-elles dû aller ? »*

### Une position n'identifie un objet que dans la liste qui l'a produite *(slice Mindmaps, PR #130, `bdc3f6d`)*

Une mindmap s'ouvrait par son **rang**. Le jour où une autre matière peut la renvoyer, le rang
devient un bug en attente ; `?carte=<id>` a été l'adresse manquante. Sur `/revision` la question ne
se pose pas — la destination est une session, pas une page, et le clic la lance.

### Un verrou peut changer d'objet au lieu de mourir *(slice Révision, PR #131, `7deaa6f`)*

Un test de dépôt interdisait le mot « chapitre » dans `RevisionPage.tsx` et disait lui-même que seul
un ADR pouvait l'ouvrir. L'ADR est venu ; le verrou n'a pas été supprimé, il garde désormais la
**hiérarchie** qui borne le risque qu'il protégeait. Corollaire mesuré le même jour : *une redondance
se lit comme une double sécurité et se comporte comme un bandeau sur les yeux* — deux protections
qui se couvraient l'une l'autre laissaient **deux sabotages verts**.

### La raison écrite d'un report peut être fausse *(slice Missions, PR #132, `ff3d843`)*

Missions avait été mise de côté parce que « les croisées sont multi-matières » — vrai pour **1
mission sur 58**, et le code la traitait **déjà**. La vraie différence, que personne n'avait nommée :
les autres pages rangent des **leçons** (un chapitre chacune), Missions range des **notions** (aucun
chapitre propre). *Quand un report dure, relire sa raison sur le code plutôt que sur le texte qui
l'a écrite.*

### Une correction de redondance peut supprimer une information *(slice Fiches, PR #129, `290b017`)*

Le chapitre s'écrivait deux fois, la matière trois. En masquant l'en-tête de matière quand il n'y a
qu'un groupe, un résultat de recherche venu d'ailleurs s'est retrouvé affiché **sans rien qui dise
d'où il venait**. Son propre test l'a démenti dans la minute. *La question n'est pas « est-ce
répété ? » mais « qu'est-ce que ça dit ici ? ».*

### Un motif dupliqué n'est pas neuf, il est SEUL *(slice Quiz, PR #128, `955dba0`)*

Capsules Massimo, capsules Papa et galaxie portaient **trois copies** du même groupement — dont deux
identiques à l'octet, recopiées d'une app à l'autre. Une brique partagée par copier-coller n'est pas
partagée : elle est dupliquée, et deux copies finissent toujours par diverger. Angle mort nommé par
l'`adr-0053`, retrouvé intact un mois plus tard.

### Un verrou d'ordre a besoin d'un jumeau sur un décor où la règle voisine ne s'applique pas *(PR #127, `9a0e800`)*

En ajoutant une clause d'échéance au filtre du quota, le verrou « matière » restait **VERT** — ses
cartes sont dues, il ne pouvait pas voir la différence — et **seul** le verrou « chapitre »
rougissait, parce que le deck chapitre sert des cartes **non dues**. Un chantier qui n'aurait écrit
que le premier verrou aurait laissé passer la régression la plus probable.

### Une heuristique jugée sur des exemples inventés ne prouve rien *(PR #126, `4910f4b`)*

Le signal d'alarme écrit dans l'ADR a sonné **le jour même de la livraison** : *« l'occasion est
détectée sur presque toutes les leçons → l'heuristique est trop large »*. Mesurée, elle répondait
vrai sur **27 fiches sur 27** ; deux resserrages ont suivi dans la journée, jusqu'à **4 sur 27**.
⚠️ La première mesure de contrôle a dû être refaite : une requête SQL **approximait** la règle au
lieu de l'exécuter.

### Un bouton inconditionnel est une mine déjà armée *(slice 4, PR #125, `845b427`)*

Le bouton de `CoursPage` ouvrait l'atelier sur une leçon déjà fichée et y créait une v2 **vide** qui
masquait la fiche finie : Massimo perdait sa fiche en cliquant sur un bouton qui promettait de la
faire. ⚠️ L'étape 6 de la clôture y a par ailleurs attrapé **deux chiffres hérités faux** (3 pièges
attribués à la mauvaise fiche, 3 cartes annoncées pour 7) — la vérification datée du lendemain
visait moins de la moitié des cartes concernées.

### « Zéro test touché » peut vouloir dire « comportement non observé » *(slice 3, PR #124, `9cda7b5`)*

Un **sabotage resté VERT** y a montré que `schedule_review` n'était exercée par **aucun** test.
« 1257 → 1257, zéro test touché » ne prouvait donc rien.

### Un travail commencé qui n'apparaît nulle part n'existe pas *(slice 2, PR #123, `b905ffd`)*

L'écran 2 (une tuile par leçon, 4 états) a été livré parce qu'une **question posée devant l'écran** —
*« je n'arrive pas à retrouver comment voir ces fiches »* — a montré qu'un brouillon n'apparaissait
nulle part. Aucun test ne pouvait le dire : un brouillon n'est pas une fiche, et la liste était
fiche-centrée.

### Regarder l'écran trouve ce que 2 700 tests verts ne trouvent pas *(slice 1, PR #122, `1b78f3d`)*

Le chantier a compté **huit** lecteurs d'une table là où son cadrage en annonçait trois — et **sept
défauts sont sortis en REGARDANT L'ÉCRAN**, dont cinq invisibles à 2 700 tests verts. C'est la
justification vivante du `WORKFLOW.md §5bis`. ⚠️ Le piège de `git branch -r` s'y est rejoué pour la
**sixième** fois d'affilée.

## Chantier `chore/appliquer-adr-0060` — quand la doc dit à l'agent de se bloquer — 2026-08-17

### 🔴 Deux commandes portaient des instructions FAUSSES, pas seulement périmées

**Symptôme** : `/ouverture` s'arrête *« si un ADR manque »*. Or l'`adr-0060` établit que **trois cas
sur quatre n'ont aucun ADR**. La commande bloquait donc un chantier **parfaitement légitime** —
c'est arrivé le 2026-08-16 sur `chore/registre-adr`, et il a fallu la contourner à la main.

Même famille : **cinq fichiers de méthode** disaient d'ajouter « la ligne dans `DECISIONS.md` »,
alors que ce fichier est **généré** depuis la PR #136 et porte en en-tête *« Ne pas éditer à la
main »*. Un agent obéissant aurait édité un fichier qui s'écrase à la régénération suivante.

**Cause commune** : une décision a été prise (`adr-0060`, `DECISIONS.md` généré) **sans que les
fichiers qui la contredisent soient mis à jour**. Le dépôt a porté deux doctrines opposées pendant
une journée entière.

**Parade** — après toute décision qui change la méthode, balayer les fichiers qui la portent :

```bash
grep -rniE 'impose un cadrage|ADR.{0,20}avant la moindre ligne|ligne dans DECISIONS' \
  docs/WORKFLOW.md .claude/commands/*.md CLAUDE.md
```

⚠️ **Un ADR non appliqué est pire qu'un ADR absent** : il donne l'illusion que la règle a changé,
pendant que les fichiers réellement lus par l'agent disent l'inverse.

### ⚠️ « `.claude/commands/` » au pluriel — et je n'en avais traité que deux sur cinq

**Symptôme** : périmètre annoncé `docs/WORKFLOW.md` **et `.claude/commands/`**. J'ai lu et corrigé
`ouverture.md` et `cadrage.md`, puis déclaré le chantier fini. Le contrôle de clôture a trouvé
**trois contradictions de plus** dans les trois commandes que je n'avais pas ouvertes — dont
`reprise.md` qui disait mot pour mot *« le dépôt impose un cadrage (ADR) avant la moindre ligne de
code »*, la phrase-souche même que le chantier corrigeait.

**Cause** : j'ai lu les fichiers **où je m'attendais** à trouver le problème, pas **tous ceux que le
périmètre nommait**. Le read-before-code a porté sur une hypothèse, pas sur un inventaire.

**Parade** : quand un périmètre nomme un **répertoire**, en énumérer le contenu et **rendre le
compte** avant de commencer — « 5 fichiers, j'en lis 5 ». Un périmètre au pluriel se vérifie par un
`ls`, jamais par l'intuition de ce qui est concerné.

## Chantier `fix/ci-github-actions` — deux tests verts pour la mauvaise raison — 2026-08-16

### 🔴 Un `TestClient` construit au niveau MODULE parle au vrai PostgreSQL

**Symptôme** : au premier run de la CI, `test_login_massimo_ok` et `test_me_returns_role`
échouent — `psycopg.OperationalError: connection to server at "127.0.0.1", port 5432 failed`.
**Les mêmes tests étaient verts en local depuis toujours.**

**Cause** : `test_auth.py` faisait `client = TestClient(app)` **au niveau module**, sans aucune
fixture. `app.dependency_overrides[get_db]` n'était donc jamais posé, et l'application utilisait sa
`SessionLocal` réelle. Ils étaient verts sur la machine de dev **parce que `docker compose` y
tourne** — et rouges pour quiconque clone le dépôt.

**Pourquoi seulement deux des sept** : `login` appelle `student_id_or_none(db)` **uniquement pour un
rôle enfant** (`auth/router.py:27`). La session SQLAlchemy étant paresseuse, la connexion ne s'ouvre
qu'à la première requête — `papa` n'en émettait aucune, `massimo` oui.

**Parade** : une fixture `autouse` locale au fichier qui surcharge **`get_db` seulement**.

⚠️ **Ne PAS utiliser `client_db` de `conftest.py` pour des tests d'authentification** : elle
surcharge aussi `get_current_user` par un utilisateur constant, ce qui rendrait
`test_me_requires_token` et `test_me_returns_role` **incapables d'échouer**.

**Comment le reproduire sans éteindre Postgres** — la seule façon d'obtenir une preuve locale :

```bash
ZETIS_DATABASE_URL="postgresql+psycopg://x:x@127.0.0.1:59999/nope" \
  .venv/bin/python -m pytest app/tests/test_auth.py -q
```

Avant le correctif : `2 failed, 8 passed`. Après : `10 passed`.

⚠️ **La leçon dépasse ce fichier** : un test vert sur la machine de dev ne prouve rien tant qu'un
service tourne à côté. Chercher les autres `TestClient(app)` hors fixture avant d'affirmer qu'une
suite est autonome.

### 🔴 `new Response(new Blob(…))` casse sous Node 20 — et passe sous Node 24

**Symptôme** : `speech.test.ts` échoue en CI avec `TypeError: object.stream is not a function`,
alors qu'il est vert en local.

**Cause** : le test mêlait **deux implémentations**. Le `Blob` vient de **jsdom**, le `Response` vient
d'**undici** ; undici appelle `object.stream()` sur le corps, que le `Blob` de jsdom n'expose pas
sous Node 20. Sous **Node 24** les globales s'alignent et l'appel réussit. La machine de dev tourne
en Node 24 ; `engines.node` annonce `>=20`, et c'est ce plancher que la CI teste.

**Parade** : donner un `Uint8Array` (un `BufferSource`) comme corps, jamais un `Blob` jsdom :

```ts
new Response(new Uint8Array([1, 2, 3]), {
  status: 200,
  headers: { "content-type": "audio/wav" },
})
```

⚠️ **Aucun Node 20 n'est installé sur la machine de dev** : ce correctif ne pouvait être prouvé
**que** par la CI. C'est le premier défaut du dépôt dont la vérification est structurellement hors
de portée en local.

### ⚠️ Un venv neuf ne prouve pas l'absence de services

**Ce que j'ai cru vérifier, et qui était faux.** Avant d'écrire la CI, j'avais monté un venv neuf
avec seulement `.[dev]` pour prouver que les extras `stt`/`tts` n'étaient pas requis : **1384 passed**.
J'en avais conclu — et écrit — *« aucun service nécessaire, et c'est vérifié »*.

**C'était faux pour 2 tests sur 1384.** Le venv neuf isole les **dépendances Python**, pas les
**services réseau** : Postgres tournait à côté, et rien dans le résultat ne le disait.

**Parade** : pour prouver l'autonomie d'une suite, couper l'accès au service — `ZETIS_DATABASE_URL`
sur un port mort — et non changer d'environnement Python. Les deux contrôles ne mesurent pas la
même chose.

## Chantier `fix/hook-pre-push` — le verrou qui manquait — 2026-08-16

### 🔴 Des backticks dans une chaîne à guillemets doubles, dans un hook, EXÉCUTENT

**Symptôme** : la première version de `hooks/pre-push` contenait, pour documenter l'échappatoire :

```sh
echo "pre-push : les trois suites — `git push --no-verify` pour passer outre."
```

**Cause** : en shell, les backticks sont une **substitution de commande**, et les guillemets doubles
ne les protègent pas (seuls les guillemets simples le font). Cette ligne aurait lancé un
`git push --no-verify` **depuis le hook de push**.

**Parade** : guillemets **simples** pour toute ligne d'aide qui cite une commande, et un contrôle
mécanique avant de committer un hook :

```sh
sh -n hooks/pre-push                          # syntaxe
grep -n '`' hooks/pre-push | grep -v '^[0-9]*:#'   # aucun backtick hors commentaire
```

⚠️ **Attrapé par relecture, pas par un test.** Un hook n'a pas de suite : la seule barrière est de
le lire, et de jouer **tous** ses chemins à la main.

### 🔴 `git config core.hooksPath` remplace TOUT `.git/hooks/` — en silence

**Symptôme** : poser `core.hooksPath hooks` pour versionner le `pre-push` aurait **éteint** le
`pre-commit` local qui nettoie les `.DS_Store` — sans aucun message.

**Cause** : `core.hooksPath` ne s'ajoute pas au dossier par défaut, il le **remplace**. Or ce
`pre-commit` porte dans son en-tête une décision explicite : *« Hook LOCAL et non suivi par git […]
C'est assumé — l'alternative (un script commité) ajoutait un fichier au dépôt pour un problème qui
ne touche que cette machine. »* Le poser aurait renversé cette décision sans la discuter.

**Parade** : un **lien** plutôt qu'un réglage global. Le fichier reste versionné (relisible,
diffable, survit au reclone) et le dossier par défaut reste actif :

```sh
ln -sf ../../hooks/pre-push .git/hooks/pre-push
```

### ⚠️ Un hook qui ne peut pas mesurer doit ÉCHOUER, jamais sauter

Le piège le plus coûteux d'un hook de test n'est pas qu'il soit lent : c'est qu'il passe au **vert**
parce que `npx` ou le venv sont absents. Il transforme alors *« je ne sais pas »* en *« c'est
bon »* — strictement pire que pas de hook.

`hooks/pre-push` traite l'outil absent comme un **échec**, et c'est vérifié :

```sh
printf 'refs/heads/x a refs/heads/x b\n' | env -i PATH=/usr/bin:/bin HOME="$HOME" \
  /bin/sh .git/hooks/pre-push origin git@x    # → « OUTIL ABSENT (npx) », code 1
```

⚠️ **Jouer les quatre chemins**, pas seulement le vert : push normal · test rouge · outil absent ·
**suppression de branche** (un `git push --delete` ne doit pas déclencher 40 s de tests).

## Chantier `chore/renvois-addendums-code` — la dette du registre, et ce qu'elle cachait — 2026-08-16

### 🔴 Un test était ROUGE sur `main`, et rien dans la chaîne ne pouvait le voir

**Symptôme** : `test_toute_derogation_est_adossee_a_un_ADR_qui_la_nomme`
(`app/tests/test_news_doctrine.py:182`) échouait sur `main` depuis le merge du rangement du
registre — **découvert par lecture, pas par une alerte**.

```
AssertionError: La dérogation de « diagnostic » cite
« adr-0030-addendum-temoin-diagnostic.md », qui n'existe pas.
```

**Cause** : le test fait `(racine / document).is_file()` sur une valeur du dict `DEROGATIONS`, qui
nommait un fichier d'addendum. La fusion l'a supprimé.

**Pourquoi personne ne l'a vu**, et c'est le vrai enseignement — **trois filets ont laissé passer,
chacun pour une raison valable** :

1. `check_adr_refs.sh` était **vert** : il ne teste que `ADR-\d{4}`, jamais un chemin.
2. La PR était **verte** : le dépôt n'a aucune CI ; seul GitGuardian s'exécute.
3. La clôture disait *« aucun test lancé — aucune ligne de code applicatif »*, ce qui était
   **vrai**. Mais un test **lisait le registre** : le critère « ai-je touché du code ? » ne dit
   rien sur « ai-je touché ce qu'un test observe ? ».

**Parade** : ne pas déduire de « chantier documentaire » que la suite est hors d'atteinte. Avant de
clore un chantier qui **supprime ou renomme des fichiers**, même de documentation, chercher qui les
nomme dans du code exécuté :

```bash
grep -rnE '"[^"]*adr-[0-9]{4}[^"]*"' --include='*.py' --include='*.ts' --include='*.tsx' apps packages
```

### 🔴 `redirige_renvois_addendums.py` ne pouvait servir qu'une fois

**Symptôme** : relancé après le merge pour finir les 54 renvois de `apps/`+`packages/`, le script
annonçait `0 renvoi(s) redirigé(s)` — l'air d'avoir fini, en n'ayant rien fait.

**Cause** : `carte()` lisait `git diff --diff-filter=D`, c'est-à-dire l'**arbre de travail contre
`HEAD`**. Une fois la fusion commitée, il n'y a plus aucune suppression en attente : la carte est
vide, et un dictionnaire vide ne fait échouer aucune boucle.

**Parade** : `--depuis <revision>` lit les suppressions dans un commit
(`git show --diff-filter=D`), et le contenu des fichiers disparus dans son **parent** (`<rev>^`).
Le script **sort en 1 avec un message explicite** quand la carte est vide, au lieu de rendre un
rapport à zéro qui ressemble à un succès.

### 🔴 Une redirection mécanique casse un littéral de chaîne — et le test reste rouge en ayant l'air réparé

**Symptôme** (mesuré avant d'écrire, en simulant) : le script aurait produit

```python
"diagnostic": "adr-0030-temoins-nouveaute-navigation.md (Amendement 1)",
```

La mention se pose après le **backtick fermant** ; ici le délimiteur est un **guillemet**, donc elle
entrait **dans** la chaîne. `is_file()` cherchait alors un fichier nommé
`…navigation.md (Amendement 1)` : le test serait resté rouge, mais avec un renvoi d'apparence
correcte — le pire des deux mondes.

**Parade** : dans `reecrire()`, un renvoi encadré de guillemets (`"` ou `'`) reçoit le nom du parent
**seul**, sans mention. **Le backtick délimite de la prose, le guillemet délimite une donnée.**

⚠️ **Corollaire** : sur les 54 renvois, **53 étaient des commentaires** et un seul était exécuté —
et c'est précisément celui-là qui portait la régression. Le compte rassurant (« ce ne sont que des
commentaires ») était faux d'exactement une unité.

### ⚠️ `TROUBLESHOOTING.md` doit être exclu du balayage qu'il documente

Ce fichier **cite des noms supprimés en exemple** — c'est ce qui rend les pièges lisibles. Le
rediriger donnerait *« un renvoi écrit `adr-0024-zetis-galaxy-progression.md (Amendement 3)` ne
contient aucune occurrence de ADR-0024 »*, une phrase qui ne démontre plus rien. Il est dans
`EXCLUS`, avec `scripts/` et pour la même raison : **un registre de noms morts n'est pas une liste
de liens cassés.**

## Chantier `chore/registre-adr` — un ADR = un fichier — 2026-08-16

### 🔴 `check_adr_refs.sh` ne teste QUE `ADR-\d{4}`, jamais un chemin de fichier

**Symptôme** : après la fusion, qui supprime les 46 fichiers d'addendum, le verrou du dépôt
répondait `✅ toutes les références ADR résolvent` alors que **179 renvois pointaient vers des
fichiers inexistants**.

**Cause** : `check_adr_refs.sh:8` grep `ADR-[0-9]{4}` uniquement. Un renvoi écrit
`` `docs/decisions/adr-0024-addendum-galaxie-animee.md` `` ne contient **aucune** occurrence de
`ADR-0024` — le verrou ne le voit pas. Le nom de fichier et le numéro sont deux espaces de nommage
distincts, et un seul est gardé.

**Parade** : après toute suppression ou tout renommage de fichier ADR, balayer **en plus** :

```bash
grep -rhoE '(docs/decisions/)?adr-[0-9]{4}-[a-z0-9-]+(\.md)?' --include='*.md' --include='*.py' \
  --include='*.ts' --include='*.tsx' . | sort -u
```

⚠️ **Le verrou reste vert aujourd'hui sur 54 renvois morts** dans `apps/` et `packages/`, laissés
hors périmètre. Ne pas lire son `✅` comme « aucun renvoi cassé ».

### 🔴 Compter les renvois AVANT une fusion sous-estime — 93 annoncés, 179 réels

**Symptôme** : comptage soigneux avant écriture → **93** renvois à réparer. Après la fusion, le
balayage en rendait **179**.

**Cause, et elle est structurelle** : les corps d'addendums **citaient leurs frères**. Ces
renvois-là avaient été écartés du comptage — à juste titre, puisqu'ils vivaient dans des fichiers
voués à disparaître. Mais la fusion ne les supprime pas : elle les **absorbe dans le parent**, où
ils resurgissent. Un renvoi qui allait mourir avec son fichier survit à la fusion de ce fichier.

**Parade** : pour toute opération qui **fusionne** des fichiers, compter l'impact **sur le résultat
de la fusion**, jamais sur l'état d'avant. Le dry-run doit produire le texte fusionné puis compter
dedans.

### 🔴 85 renvois sur 179 étaient des AUTO-renvois — le fichier se cite lui-même

**Symptôme** : la première version de la redirection produisait, dans
`adr-0024-zetis-galaxy-progression.md`, la phrase *« cf. l'addendum
`adr-0024-zetis-galaxy-progression.md` (Amendement 1) §A »* — un fichier renvoyant à lui-même par
son propre nom.

**Cause** : un addendum absorbé dans son parent y emporte ses citations de frères. Une redirection
« nom d'addendum → nom du parent » appliquée uniformément transforme donc une référence externe en
auto-référence, sans que rien ne l'attrape.

**Parade** : traiter le cas à part — quand le fichier citant **est** le parent, le renvoi cesse
d'être un chemin. Rendu `**Amendement N**`, backticks encadrants retirés
(`redirige_renvois_addendums.reecrire`, paramètre `nom_fichier`).

### 🔴 Un tri `(date, nom de fichier)` place le RÉVOQUANT AVANT le RÉVOQUÉ

**Symptôme** : `fusion_addendums.py` triait les addendums par `(date, nom de fichier)`. Sur les
huit groupes portant plusieurs addendums du même jour, **quatre** sortaient mal ordonnés —
`## Amendement 2` de l'ADR-0024 aurait porté la phrase *« Cinquième addendum en une journée »*.

**Cause** : l'ordre alphabétique n'a aucun rapport avec la chronologie. Sur ADR-0024, cinq
addendums du 2026-07-31 se numérotent **en toutes lettres** dans leur bloc de statut ; sur ADR-0025,
cinq addendums du 2026-08-10 portent `§13`…`§17` dans leur H1. Deux sources d'ordre existaient dans
les documents, et le tri n'en lisait aucune.

**Parade** : `ORDRE_DECLARE` (`scripts/fusion_addendums.py`) — chaque rang est celui que le document
**déclare lui-même**, avec la citation qui l'établit en commentaire. Le script **signale** tout
ex-æquo dont l'ordre n'est déclaré nulle part, au lieu de retomber en silence sur l'alphabétique.

⚠️ **Contrôle croisé indispensable** : deux scripts calculent indépendamment le numéro d'amendement
(la fusion l'écrit dans `## Amendement N`, la redirection l'écrit dans `(Amendement N)`). Vérifier
qu'ils coïncident, sinon on produit 179 renvois **précis et faux** :

```bash
python3 - <<'PY'
# les 46 numéros calculés doivent égaler les en-têtes réellement écrits
PY
```

### ⚠️ `gen_frontmatter.py` écrivait son rapport HORS du dossier qu'il instrumente

**Symptôme** : `--write` a produit `docs/rapport-revocations.md`, un cran au-dessus du périmètre de
la session (`docs/decisions/`).

**Cause** : `args.racine.parent / "rapport-revocations.md"`. Le `.parent` était une commodité, pas
une décision.

**Parade** : corrigé en `args.racine / "annexes"`. ⚠️ Le commentaire `revoque:` des front-matter
déjà posés pointait encore vers l'ancien chemin — **un déplacement de fichier généré laisse des
renvois dans les fichiers déjà générés**.

### ⚠️ `graphify update .` refuse toute baisse du nombre de nœuds, même voulue

**Symptôme** : `WARNING: new graph has 16339 nodes but existing graph.json has 16348. Refusing to
overwrite — you may be missing chunk files from a previous session.`

**Cause** : garde-fou contre une reconstruction partielle. Il ne distingue pas une perte accidentelle
d'une **suppression volontaire** — ici les 46 fichiers d'addendum.

**Parade** : `graphify update . --force`, **après** avoir vérifié que la baisse s'explique
entièrement. Une sauvegarde du graphe curé est prise automatiquement (`graphify-out/<date>/`).

## Session de méthode `ADR-0060` + rangement de `main` — 2026-08-16

### 🔴 `git push` envoie le REF, pas les commits qu'on vient de vérifier

J'avais rendu **deux** commits vérifiés en annonçant « à toi de pousser ». Entre cette
vérification et le `git push origin main`, un commit a été fait **dans le dépôt, hors session**.
Le push a envoyé **trois** commits — dont un jamais relu — sur un remote public.

**Cause.** `git push origin main` ne pousse pas un ensemble de commits : il pousse **ce que `main`
désigne à l'instant du push**. Sur ce dépôt le travail arrive aussi par l'humain, en cours de tour.

**Parade.** Avant tout push différé : `git log --oneline origin/main..HEAD`, et rapprocher de ce
qu'on a vérifié. Un commit inconnu se lit et se signale, il ne part pas en silence. Pour garantir
le périmètre : `git push origin <sha>:main`.

### 🔴 `.gitignore` ne couvre JAMAIS l'intérieur de `.git/` — et `refs/.DS_Store` fait rougir `fsck`

`git fsck` sortait `refs/.DS_Store: badRefName: invalid refname format`. Le réflexe — « ajouter
`.DS_Store` au `.gitignore` » — est **sans effet** : la ligne y était déjà (`.gitignore:42`), et
**aucun `.DS_Store` n'a jamais été suivi**. Le fichier fautif vivait **dans `.git/refs/`**, où
`.gitignore` ne s'applique pas.

**Cause.** Le Finder écrit un `.DS_Store` dans **tout** dossier qu'il affiche, y compris `.git/` si
l'on navigue avec les fichiers cachés visibles. macOS n'offre aucun réglage pour l'empêcher sur un
volume local — ⚠️ **`DSDontWriteNetworkStores` ne vaut que pour les volumes réseau**, le proposer
ici est une fausse piste.

**Parade.** 43 fichiers supprimés, puis deux étages posés **hors dépôt** : un hook
`.git/hooks/pre-commit` (~50 ms, élague `node_modules`/`.venv`/caches, **pas** `.git/`, sort
toujours 0), et un **leurre** dans les 4 dossiers de `.git/` — voir l'entrée suivante.

### ⚠️ Le leurre qui empêche le Finder d'écrire fait ÉCHOUER `rm -rf` sur le dépôt

Prévention posée dans `.git`, `.git/refs`, `.git/objects`, `.git/logs` : un **répertoire**
`.DS_Store` (là où le Finder veut un *fichier*), rendu immuable par `chflags uchg`. L'écriture du
Finder échoue — vérifié dans les 4.

**Éprouvé sur un clone jetable avant application** : `status`, `for-each-ref`, `commit`, `fetch`,
`pack-refs --all`, `gc`, `clone` depuis lui — tous rc=0, et `fsck` reste propre **même après
`gc`**. Git tolère intégralement le leurre.

🔴 **Le prix, à connaître avant de paniquer** :

```
rm: .git/.DS_Store: Operation not permitted
```

Ce n'est **pas** une corruption, c'est le drapeau. Pour supprimer ou déplacer le dépôt :

```bash
chflags -R nouchg <chemin-du-depot> && rm -rf <chemin-du-depot>
```

⚠️ Hook et leurres vivent dans `.git/` : **ils ne survivent pas à un reclone.**

### 🔴 Un dossier « à supprimer » contenait des HARDLINKS vers `.git/objects/`

`scratchpad/_a_supprimer` avait tout du déchet (`tmp_obj_*`, `*.lock`). Cinq de ces fichiers
avaient un **link count de 2** : c'étaient des hardlinks vers `.git/objects/`, dont **l'objet
commit du commit qui venait d'être poussé**.

Supprimer un hardlink ne détruit pas l'objet — le jumeau dans `.git` survit, vérifié par
`git cat-file -t` après coup. Mais la parade est de **regarder avant**, pas après :
`stat -f %l <fichier>` et `find .git -inum <inode>`.

### 🔴 Poser le front-matter AVANT la fusion casse la garantie de `fusion_addendums.py`

J'avais proposé l'ordre **front-matter → fusion → index**. Le docstring de
`scripts/gen_frontmatter.py` dit l'inverse, en toutes lettres : **fusion → front-matter → index**.

**Cause.** `verifier()` garantit que toute ligne **non-titre** d'une source se retrouve dans la
sortie. Les lignes d'un front-matter (`id: "0024"`, `type: …`) ne sont ni des titres ni un H1 :
elles seraient comptées **« ligne perdue »**, la garantie sauterait, et le script **refuserait
d'écrire** sur les 21 parents. Le fail-safe fonctionne — mais le chantier serait bloqué sans
comprendre pourquoi.

**Parade.** Lire le docstring du script avant d'en prescrire l'ordre. Read-before-code vaut aussi
pour l'outillage qu'on a soi-même proposé.

### 🔴 `gen_decisions_index.py` lancé avant la Phase 1bis classe 104 ADR sur 105 en « surface »

Répétition à blanc, en scratchpad : **1** entrée en « architecture », **104** en « surface » —
dont `ADR-0002` (séparation des frontends), `ADR-0004` (PostgreSQL + pgvector), `ADR-0011`
(contexte canonique), `ADR-0037`.

**Cause.** `type_de()` cherche `type:` dans les 12 premières lignes et **retombe sur `"surface"`**
par défaut ; **un seul** fichier porte un front-matter. Et la section « surface » se décrit
elle-même comme *« on ne les lit pas pour cadrer une architecture »* : l'index dirigerait le
cadrage à l'opposé de la vérité. Second mensonge, dans l'en-tête généré : *« Amendements fusionnés
dans leur parent »*, alors que la fusion n'a pas eu lieu.

**Parade.** Le générateur **suppose la Phase 1bis faite**. Il ne se lance qu'en **troisième**
position, et jamais isolément. ⚠️ Vérifier aussi que le set `ARCHITECTURE` du script contient le
numéro de tout ADR d'architecture récent : un oubli n'y produit pas un classement approximatif, il
**retire la décision du champ de vision du cadrage**.

## Chantier `feat/la-fiche-repond-quand-on-la-touche` — 2026-08-15

### 🔴 L'ADR nommait des champs qui n'existent pas — et son propre signal d'alarme le disait

L'`adr-0058` §5 et la spec nommaient six sections de fiche : `essentiel`, `definitions`,
**`pieges`**, **`exemple`**, **`methode`**, `mnemonique`. Les trois en gras sont les **libellés des
étapes à l'écran** ; les champs de `FicheDraft` sont `essentiel`, `definitions`, `points_cles`,
`erreurs_a_eviter`, `mini_exemple`, `mnemonique`.

Un prédicat « ce brouillon est-il vide ? » écrit sur ces noms aurait lu **trois champs absents**,
déclaré vide le brouillon `id=54` — qui porte trois `points_cles` choisis par Massimo — et
**écrasé son travail**. C'est **mot pour mot le signal d'erreur n° 3 de l'ADR**, écrit dans l'ADR
lui-même.

**Parade** : la liste se **dérive du schéma**, jamais recopiée —
`tuple(k for k in FicheDraft.model_fields if k not in DECOR)`. Un test la verrouille
(`test_les_champs_de_travail_sont_DERIVES_du_schema`), et le sabotage « réécrire la liste à la
main avec `pieges` » fait rougir le test qui protège le travail de Massimo.

⚠️ **La bonne réponse était DÉJÀ dans le fichier qu'on éditait** : `page-fiches.md` §4d dit
*« le reste du `FicheSpec` est nommé en français — `points_cles`, `erreurs_a_eviter`,
`mini_exemple` »*, quatre-vingts lignes au-dessus de l'endroit où les faux noms ont été écrits.
*Une spec qui se contredit d'une section à l'autre est plus dangereuse qu'une spec muette.* Quand
deux passages d'un même document divergent, **c'est le code qui tranche**.

### ⚠️ Une mesure fausse DEUX fois avant d'être juste — 0, puis 2, puis 1

Le même comptage, trois valeurs : (a) filtre `validation_status == "draft"` alors que la constante
est **`personal_draft`** → **0 cas** ; (b) six noms de champs faux → **2 cas** ; (c) schéma lu à la
source → **1 cas**.

**À retenir** : *une mesure qui n'a pas été refaite au moins une fois n'a probablement pas encore
été confrontée.* Les deux erreurs étaient du même genre — un nom recopié au lieu d'être lu.

### 🔴 Pour voir un état TRANSITOIRE dans une SPA : trois conditions, toutes payées

Vérifier que le pont SRS « dit qu'il travaille » a demandé quatre tentatives. Aucune n'a échoué à
cause du code :

1. ⚠️ **Mesurer entre deux appels d'outil ne marche pas** — ils sont espacés de secondes, l'état
   intermédiaire est passé depuis longtemps. Il faut `setTimeout` **dans le même bloc**, stocker
   dans `window`, puis relire.
2. ⚠️ **Vérifier qu'on regarde le bon objet** : mes premiers échantillons visaient le bouton d'une
   fiche **de ZETIS**, où le pont est inerte **par conception**. Ils mesuraient un bouton mort.
   Contrôle : la présence de « ✏️ La retravailler » distingue sa fiche de celle de ZETIS.
3. 🔴 **Mesurer dans le MÊME tick que le clic lit l'état d'AVANT** — React n'a pas re-rendu.
   L'échantillon « juste après le clic » montrait le bouton inchangé. **Sans échantillons
   différés, on conclut que la fonctionnalité ne marche pas alors qu'elle marche.**

⚠️ Le lien `?fiche=<id>` est consommé **une seule fois par montage** : après une renavigation SPA,
il n'ouvre plus rien. Utiliser `location.replace(...)` pour forcer un montage frais.

### ✅ Provoquer une panne réseau SANS rien écrire en base

Le pont crée des cartes SRS quand il réussit. Pour voir son échec **sans écrire**, on intercepte
`fetch` dans la page pour que la route échoue **avant d'atteindre le serveur** :

```js
window.__vrai = window.fetch;
window.fetch = (u, o) => /\/cards|\/rework/.test(String(u))
  ? new Promise((_, rej) => setTimeout(() => rej(new TypeError("panne")), 2000))
  : window.__vrai(u, o);
```

Vérifié : **324 cartes avant, 324 après**. ⚠️ **Rendre `fetch`** après la mesure, sinon la page
reste cassée pour la suite de la session.

## Chantier `feat/une-seule-facon-de-trouver-missions` — 2026-08-14

### 🔴 Une fonction dont le contrat dit « c'est à toi de filtrer » — et on ne le lit pas

`lessons_by_skill` (`lesson_resolution.py:67`) filtre **année active + chapitre `validated` +
leçon non archivée**, mais **PAS le statut de la leçon**. Sa docstring le dit noir sur blanc :
*« un brouillon est rendu, et c'est l'appelant qui décide s'il l'accepte »*.

Le **cadrage** l'a utilisée sans poser le gate, et sa mesure était fausse : **3 missions à deux
chapitres et 1 à quatre**, annoncées, là où le gate `validated` en laisse **1 et 1**. La mesure a
dû être refaite.

**Parade** : le gate vit chez l'appelant, écrit explicitement
(`if lec.status == "validated"`), et un test-verrou le garde
(`test_un_brouillon_ne_donne_JAMAIS_un_chapitre`) — avec le seul décor capable de distinguer
« gate posé » de « gate oublié » : **une leçon validée et une brouillon, dans DEUX chapitres
différents**. Sans le gate, la notion en voit deux → `None`. Avec, elle en voit un.

**À retenir** : *une fonction qui délègue un filtre à son appelant est un piège pour le lecteur
pressé.* Lire sa docstring **avant** de s'en servir n'est pas une politesse — ici, ça valait la
justesse d'un ADR.

⚠️ **Et ne cherche pas mieux ailleurs** : `ordered_chapter_skill_ids` porte bien le gate
`validated`, mais elle va dans l'autre sens (chapitre → notions) et **ne filtre pas l'année**.
Aucune fonction « notion → chapitres » n'existait.

### ⚠️ Un `JOIN LessonSkill` surcompte — la dédup n'est pas décorative

Une notion enseignée par **deux leçons du même chapitre** produit deux lignes. Un compte tiré de
la jointure double sa carte / sa mission. **Parade** : ne jamais tirer un compte de la requête qui
a servi à joindre.

### ⚠️ `MissionStudentOut` n'avait pas de `subject_slug` — le front le DEVINAIT

`useMissions.ts:221` faisait `nameToSlug[nom] ?? slugify(nom)`. Un nom accentué ne redonne pas
toujours le bon slug, et la brique de rangement exige un slug. Ajouté au schéma.

### ⚠️ `_to_out` est appelée depuis **8** endroits — batcher sans casser les 7 autres

La dérivation des chapitres doit être en lot pour la liste élève (58 missions), mais 7 autres
appelants n'ont qu'une mission ou deux. **Parade** : un paramètre optionnel `chapitres` — passé en
lot par la liste, calculé à l'unité quand il est absent. Une seule fonction, une seule règle.

⚠️ `graphify affected "_to_out"` rend **« No unique node match »** (homonyme dans `reports`) —
**3ᵉ échec de cet outil dans la semaine**. C'est `grep -rn` qui a donné les 8 appelants.

### 🔴 Un défaut corrigé la veille, réintroduit le lendemain

`showSubjectHeader={Boolean(cherche) && groupes.length > 1}` : pendant une recherche qui ne ramène
qu'**une** matière, le résultat s'affichait **sans rien qui dise d'où il venait**. C'est le défaut
exact corrigé sur `/fiches` le 2026-08-14, réécrit à l'identique le même jour sur une autre page.

**Parade** : `showSubjectHeader={Boolean(cherche)}` — dès qu'on cherche, la provenance s'affiche,
y compris pour un résultat unique. **Le premier test de rendu de la page l'a démenti dans la
minute**, ce qui est la seule raison pour laquelle il n'est pas parti en production.

**À retenir** : *une correction dans un fichier ne se propage pas aux fichiers voisins.* Quand un
motif est partagé par cinq pages, un défaut corrigé sur l'une reste vivant sur les quatre autres
jusqu'à ce qu'un test l'y attrape.

### ⚠️ Une page à « 2 tests » peut n'en avoir **aucun** de rendu

`MissionsPage.test.tsx` portait deux tests — qui vérifient la table `TYPE_META` **sans jamais
monter le composant**. Compter les `it()` ne dit rien du filet réel. Regarder ce qu'ils
**rendent** est le seul contrôle qui vaille.

### ⚠️ Des doublons à l'écran qui ne sont PAS un bug de rendu

Deux missions « Travailler : Addition de fractions » s'affichent en Maths — **ids 19 et 16**, deux
lignes distinctes en base (même titre, créées deux fois). 21 servies, 21 rendues. Vérifier les
**ids** avant d'accuser le composant.

## Chantier `feat/une-seule-facon-de-trouver-revision` — 2026-08-14

### 🔴 DEUX protections redondantes = un test AVEUGLE, pas une double sécurité

Le verrou « aucune porte sur du vide » de `servable_chapters` est resté **VERT sous deux sabotages
successifs**, ce qui n'avait aucun sens jusqu'à ce qu'on regarde pourquoi.

La servabilité était décidée à **deux endroits** : la requête de découverte portait
`Lesson.status == 'validated'`, et `chapter_servable_count` (via `ordered_chapter_skill_ids`) le
portait aussi. Casser l'un laissait l'autre faire le travail. Le test ne pouvait donc pas
distinguer un code juste d'un code à moitié faux.

**Parade** : retirer la duplication. La requête **énumère** les candidats, `chapter_servable_count`
**juge** seul. Le sabotage rougit aussitôt.

**À retenir** : *une redondance se lit comme une ceinture et des bretelles, et se comporte comme un
bandeau sur les yeux.* Quand un sabotage reste vert sans raison apparente, chercher le **second**
endroit qui applique la même règle — et en supprimer un.

### 🔴 `Chapter` n'a AUCUN `subject_id` — deux parents, tous deux nullables

Pour lister « les chapitres d'une matière », le réflexe est de descendre
`Subject → SchoolYearSubject → Chapter`. C'est un `INNER JOIN`, et il fait **disparaître en
silence** tout chapitre rattaché par `Theme` (`school.py:59` — `school_year_subject_id` ET
`theme_id` sont nullables). Ce trou a coûté l'**ADR-0037 entier**, a été retrouvé dans
`lessons_by_skill` (addendum ADR-0034), puis une troisième fois dans l'ADR-0042.

**Parade retenue ici** : ne pas descendre du tout. Le module `memory` lit la matière d'une carte
par **`Skill.subject_id`** (`get_reviews_summary:223`, `build_session:435`) — le listing part donc
**des cartes**, et la question des deux parents ne se pose jamais. Une seule convention par module.

> Le prédicat à deux chemins existe si on en a vraiment besoin :
> `review_queue/service.py:_chapter_in_year` (un `or_` documenté).

### ⚠️ `chapter_servable_counts` n'est PAS un lot — sa docstring le promet, son corps est une boucle

Elle annonce éviter « N×2 requêtes par page » ; le corps (`memory/service.py:378`) est un
dict-comprehension sur la version unitaire. Le seul gain réel est la **déduplication** des ids.
Ne pas s'y fier pour un volume important.

### ⚠️ Un `LessonSkill` en jointure SURCOMPTE — la dédup n'est pas décorative

Une notion enseignée par **deux leçons du même chapitre** produit deux lignes `LessonSkill` : un
`func.count()` posé dans une jointure compte donc sa carte **deux fois**.
`ordered_chapter_skill_ids` déduplique explicitement (`seen`), et c'est pour ça.

**Parade** : ne jamais tirer un compte de la requête qui a servi à joindre — le tirer de la
fonction qui sait dédupliquer.

### 🔴 Un conteneur par groupe devient un empilement quand le groupe n'a qu'un objet

`SubjectChapterShelves` rend **un `<div>` de grille par chapitre** — parce que ce `div` porte le
**libellé** du chapitre. Sur `/revision`, où le chapitre EST l'objet, chaque grille n'avait qu'un
enfant : les tuiles s'empilaient **verticalement**, une par ligne, et `flex-wrap` était impuissant
faute d'un second enfant à aligner.

**Parade** : quand `showChapterLabel={false}`, une **seule** grille pour toute l'étagère
(`flatMap`). Le découpage n'existait que pour le titre.

**À retenir** : *un regroupement visuel qui perd son étiquette perd sa raison d'être, et ne garde
que ses effets de bord.* Signalé par l'œil du commanditaire ; **quatorze tests étaient verts**.

### ⚠️ Deux listes des mêmes matières, deux ordres — à deux cents pixels d'écart

`/revision` affiche les matières **deux fois** : la grille « Par matière » suit
`Subject.sort_order` (le curriculum), les étagères suivaient le **nom**. Français premier en haut,
deuxième en bas.

**Parade** : `subjectOrder` dans `GroupOptions`, symétrique de `chapterOrder`, défaut alphabétique
inchangé (parité des quatre autres pages).

### ⚠️ Mesurer une géométrie pendant un survol donne des nombres faux

Les tuiles ont `transition-transform hover:scale-*`. Une mesure `getBoundingClientRect()` sous le
curseur rend une largeur ~4 % trop grande et un `y` décalé — j'ai cru à deux rangées là où il n'y
en avait qu'une. **Parade** : lire `getComputedStyle(grille).gridTemplateColumns`, qui ne ment pas.

### ⚠️ Un `click()` JS puis une mesure dans le MÊME appel lit l'état d'AVANT

React n'a pas encore rendu. Deux appels séparés, ou l'assertion mesure le DOM précédent — et on
conclut que le clic n'a rien fait.

## Chantier `feat/une-seule-facon-de-trouver-mindmaps` — 2026-08-14

### 🔴 Un RANG n'est pas une ADRESSE — et la différence ne se voit qu'au moment de partager

`MindmapSubjectPage` ouvrait une carte par `open(idx)` — **son rang dans la liste de la matière
courante**. Tant que tout se joue dans une matière, ça marche. Dès qu'un résultat de recherche
vient d'ailleurs, le rang ne désigne plus rien : il pointe sur la carte qui occupe ce rang **dans
l'autre liste**.

**Parade** : `openIdx` → `openId` (l'identifiant), plus `?carte=<id>` comme **adresse** de la
carte — le patron de `?fiche=` (ADR-0054 §1), nettoyage d'URL compris.

**À retenir** : *une position n'identifie un objet que dans la liste qui l'a produite.* Le jour où
une page cesse d'être seule à afficher ses objets, tout index devient un bug en attente.

### ⚠️ `graphify affected` a rendu VIDE une SECONDE fois dans la journée

Après `subject_fiche_tiles` le matin, `list_subject_mindmaps` le soir : *« No affected nodes
found »* alors que `mindmaps/router.py:143` l'appelle. Deux fois en un jour, sur deux modules
différents — ce n'est pas un accident.

**Parade** : `affected` **oriente**, il ne prouve **jamais** l'absence d'appelant. Sur un périmètre
de non-régression, confirmer au `grep`. *(Même famille que le piège d'`explain`, qui rend UN nœud
quand plusieurs portent le nom.)*

### ✅ Ce que trois slices du même motif ont fini par produire

Cette slice n'a rencontré **aucun piège neuf de mise en œuvre** — décor à deux chapitres, verrou
serveur écrit d'emblée, chapitre retiré de l'objet, en-tête de matière conditionnel : tout était
déjà écrit par les deux précédentes. **Le seul point dur était de conception** (l'adresse), et il
avait été nommé à l'ouverture, avant la première ligne.

*Un prompt de slice qui reprend les pièges des slices sœurs les empêche de se rejouer.*

## Chantier `feat/une-seule-facon-de-trouver-fiches` — 2026-08-14

### 🔴 Un sabotage BACKEND resté vert — la slice n'avait aucun verrou côté serveur

Sabotage : `"chapter_id": None` dans le payload des tuiles. **Les 87 tests de fiches sont restés
verts.** Le front, lui, avait ses verrous ; le serveur n'en avait aucun sur les deux champs que la
slice venait d'ajouter.

**Parade** : deux verrous serveur (`test_fiche_service.py`) — la tuile porte `chapter_id` **et**
`subject`, et l'index couvre toutes les matières dans l'ordre du programme. Sabotage rejoué : il
mord. *Un champ neuf sans test serveur est un champ que le serveur peut cesser de servir en
silence.*

### 🔴 La migration a créé une redondance — le chapitre s'écrivait DEUX fois

`TuileLecon` affichait `tuile.chapter` ; l'étagère qui la range le porte aussi. Résultat : le même
mot à trois lignes d'intervalle.

**Trouvé par un test**, pas par une relecture : `TestingLibraryElementError: Found multiple
elements with the text: Zébu`. **Parade** : le chapitre quitte la tuile — la brique le porte.

### 🔴 Et la correction de la redondance suivante a créé son propre défaut

La matière s'écrivait **trois** fois (rétrolien, titre, en-tête d'étagère) — vu à l'écran. Première
correction : masquer l'en-tête quand il n'y a qu'un seul groupe. **Son propre test l'a démentie** :
en recherche, un résultat de Maths s'affichait alors sous un titre « Français », **sans rien qui
dise d'où il venait**.

**Parade** : `showSubjectHeader={cherche || groupes.length > 1}`. *Une correction de redondance
peut supprimer une information — la question n'est pas « est-ce répété ? » mais « qu'est-ce que ça
dit ici ? ».*

### ⚠️ `graphify affected` peut rendre VIDE sur une fonction pourtant appelée

`graphify affected "subject_fiche_tiles"` → *« No affected nodes found »*, alors que
`fiches/router.py` l'appelle deux lignes plus bas. Le `grep`, lui, l'a trouvée.

**Parade** : `affected` oriente, il ne prouve pas l'absence d'appelant. Pour un périmètre de
non-régression, le confirmer par `grep -rn "<nom>"`. *(Le pendant du piège déjà consigné sur
`explain`, qui rend UN nœud quand plusieurs portent le nom.)*

## Chantier `feat/une-seule-facon-de-trouver-quiz` — 2026-08-14

### 🔴 Un sabotage resté VERT — le décor n'avait qu'UN chapitre par matière

Sabotage joué sur la brique partagée : `const chKey = "__none__"` — **tous** les objets tombent
dans le même groupe de chapitre. **Les neuf tests sont restés verts.**

**Cause** : le nom du groupe vient du **premier objet rencontré** (`ch.name = c.chapter ?? …`).
Avec un seul chapitre par matière dans le décor, le groupe fusionné portait quand même le bon nom,
et le rendu était identique. Le verrou ne pouvait pas voir la fusion.

**Parade** : un décor à **deux chapitres dans la même matière**, et une assertion sur les **deux**
noms. Le sabotage rougit alors. *Un verrou qui ne peut pas distinguer deux cas ne teste qu'un cas.*

### 🔴 Un défaut visible seulement À L'ÉCRAN — l'en-tête mentait pendant la recherche

En cherchant « thales » depuis les quiz de **Français**, les deux quiz de **Mathématiques**
s'affichaient sous un titre **« 📖 Français »**. Aucun test ne pouvait le dire : ils vérifiaient
les **résultats**, jamais ce que la page dit **d'elle-même**.

**Parade** : titre neutre (« 🔎 Résultats de recherche ») dès qu'une recherche est en cours, plus
son verrou et son sabotage. Trouvé en 30 secondes d'écran, invisible à 743 tests.

### ⚠️ `export { x } from "…"` ne ramène PAS `x` dans la portée du module

En remontant `normalizeSearch` dans `packages/ui/src/lib/`, le ré-export seul a produit deux
`TS2304: Cannot find name 'normalizeSearch'` dans `galaxyGraph.ts`, qui **l'utilise** aussi.

**Parade** : `import { x } from "…"` **puis** `export { x }`. Le ré-export est pour les
consommateurs, l'import est pour soi.

### ⚠️ Un `prop` déclaré et jamais lu : `tsc` l'a vu, les tests non

`gridClassName` a été ajouté à `SubjectChapterShelves` et **oublié dans le JSX** — la grille restait
celle des capsules. Les 743 tests passaient (ils n'assèrent pas la mise en page) ; `tsc -b` l'a
attrapé (`TS6133`). **Le typecheck n'est pas une formalité de fin : il voit ce que les tests ne
regardent pas.**

### ⚠️ Un mock qui ignore son argument fait passer un test pour une bonne raison FAUSSE

`QuizPage.test.tsx` mockait `fetchSubjectQuizzes` en rendant **les mêmes quiz quelle que soit la
matière demandée**. Le test « ouvrir SVT » vérifiait donc l'affichage d'un quiz de **Maths** —
personne ne pouvait s'en apercevoir. Le passage à un listing unique a rendu le décor honnête.

**Parade** : dans un décor, mettre des objets **distinguables par matière**, et assérer sur celui
qu'on attend vraiment.

### ⚠️ `@testing-library/user-event` n'est pas installé côté Massimo

Un test écrit avec `userEvent` échoue au **transform** (`Failed to resolve import`), pas à
l'assertion. Le dépôt utilise `fireEvent` de `@testing-library/react` — `fireEvent.change(champ,
{ target: { value: "…" } })` pour la frappe.

### ⚠️ `Quiz.subject_id` est NOT NULL, et `Quiz.chapter_id` existe (dénormalisé)

Une fixture de quiz sans `subject_id` casse sur `IntegrityError`. Et le quiz porte **déjà** un
`chapter_id` — mesuré cohérent à 100 % avec celui de sa leçon (37/39 renseignés), mais c'est une
**copie** : la source reste la leçon, qui décide déjà de la servabilité. Voir `DATA_MODEL.md`
§« Règle de lecture — le chapitre d'un quiz ».

## Chantier `feat/la-file-cesse-d-enterrer` — 2026-08-14

### 🔴 Un `2 failed` peut vouloir dire « la base est éteinte », et rien d'autre

Suite backend lancée à la reprise : **1280 passés, 2 échecs** —
`test_auth.py::test_login_massimo_ok` et `::test_me_returns_role`, sur
`connection to server at "127.0.0.1", port 5432 failed`.

**Cause** : l'infra Docker était **éteinte** (`docker ps` vide, rien n'écoutait sur 5432). Les
serveurs de dev lancés dans une session précédente survivent — **l'infra non**.

**Pourquoi ces deux-là seulement** : `test_auth.py` monte un **`TestClient(app)` nu**
(`app/tests/test_auth.py:6`), **sans le décor qui isole la base** — ce sont les deux seuls tests de
la suite à atteindre la **vraie base de dev** (`postgresql+psycopg://zetis@localhost:5432/zetis`).
`test_login_papa_ok` passe dans le même fichier parce que les identifiants de Papa ne descendent pas
en base ; ceux de Massimo lisent son profil.

**Parade** : `pnpm infra:up`, puis rejouer — les deux rouges retombent à zéro **sans qu'une ligne de
code bouge**. Vérifier le port 5432 avant de lire un rouge comme une régression.

### ⚠️ Les commandes `docker` sont MUETTES dans le bac à sable

`docker ps` lancé normalement ne rend **rien du tout** — pas même une erreur —, ce qui se lit comme
« aucun conteneur ». La même commande hors bac à sable rend le tableau. Le diagnostic « l'infra est
éteinte » était juste ce jour-là, mais **par accident** : le silence n'était pas une réponse.

**Parade** : pour `docker`/`docker compose`, exécuter hors bac à sable, et confirmer par un second
canal (`lsof -nP -iTCP:5432 -sTCP:LISTEN`, `docker exec … pg_isready`).

### 🔴 `chapter_servable_count` est PLAFONNÉ — ce n'est pas un stock

Il rend `min(REVIEW_SESSION_MAX_CHAPTER, total)` (`memory/service.py`). Utilisé comme compteur de
cartes, il a affiché **« 8 »** pour les quatre chapitres offrables du Français, qui en portent
**72, 39, 45 et 12**. C'est une **taille de session**, pas un stock.

**Parade** : pour un stock, compter soi-même **en partant de `servable()`** — jamais une clause
recopiée (addendum ADR-0015 §13 : *une* définition du servable).

### 🔴 Le deck chapitre n'a PAS de clause d'échéance — et un seul test peut le voir

En composant le quota de l'ADR-0056, la tentation naturelle est d'écrire `_due_conditions(...)`
dans l'aide au quota. Le deck chapitre sert délibérément des cartes **non dues** (ADR-0049 §3) :
cette clause le casse **sans qu'aucune requête ne paraisse fausse**.

**Démontré par sabotage** : en ajoutant `due_at <= _now()` au filtre des cartes personnelles, le
verrou « matière » reste **VERT** (ses cartes sont dues, il ne peut pas voir la différence) et seul
le verrou « chapitre » rougit. Un chantier qui n'aurait écrit que le premier aurait laissé passer
la régression la plus probable.

**Parade** : le quota **filtre le `stmt` déjà construit** par la branche du deck, il ne le
reconstruit pas — et tout verrou d'ordre a besoin d'un jumeau sur un décor **sans échéance**.

### ⚠️ Les cartes de fixture sont TOUTES `definition` — d'où deux tests restés verts

`SpacedReviewCard.card_type` a pour défaut `"definition"` (`db/models/progress.py:361`) et les
helpers `_card` / `_chapter_card` ne le passaient pas. Les deux tests qui décrivent l'ancien ordre
(`test_caps_serve_oldest_and_interleave`, `test_chapter_deck_caps_and_orders_by_due_at`) ne
contiennent donc **aucune** carte personnelle : ils devaient rester verts **sans être touchés** —
et ils le sont.

**À retenir** : avant de conclure qu'un test va rougir, **lire son décor**. Ici, la lecture a
évité de « corriger » deux tests qui n'avaient rien à corriger — *un test modifié pour passer est
une régression masquée*.

## Chantier `feat/les-deux-etapes-qui-manquent` — 2026-08-14

### 🔴 Ajouter un champ au `FicheSpec` CHANGE la génération de toutes les fiches

`service.py` passe **`FicheSpec.model_json_schema()` au modèle** en contrainte de sortie, et le
`SYSTEM_PROMPT` décrit le schéma **une seconde fois** à la main. Ajouter `mnemonique` au modèle
Pydantic le rend donc visible au LLM **sans consigne et sans few-shot** — et le §10 de l'addendum
ADR-0015 dit exactement ce qui se passe alors : *« un modèle qui voit un champ se croit tenu de le
remplir »*, soit des acronymes forcés sur peut-être 4 leçons sur 5.

🔴 **L'ADR-0055 se contredisait là-dessus** : son §3 ajoutait le champ, son §5 excluait le prompt.
Le code le disait pourtant en toutes lettres (`schemas.py` : *« `FicheSpec` reste littéralement
inchangé »*), et le read-before-code l'a trouvé avant la première ligne.

**Parade, écrite dans le code** : *toucher au `FicheSpec` OBLIGE à toucher au prompt dans le même
geste* — consigne + few-shot + `FICHE_PROMPT_VERSION`. Et le few-shot qui **omet** le champ n'est
pas un oubli à compléter : c'est lui qui enseigne au modèle que l'absence est normale.

### 🔴 Une heuristique jugée sur des exemples inventés ne prouve RIEN

L'heuristique d'occasion (« y a-t-il une liste à retenir ? ») a été écrite avec deux signaux et
testée sur des chaînes fabriquées. Elle passait. Mesurée **en base**, sur les vraies fiches :

| Signal | Fiches concernées |
|---|---|
| « ≥ 3 points-clés » | **27 / 27 — 100 %** |
| « un point-clé qui énumère » | **4 / 27 — 15 %** |

Le premier signal ne distingue **rien** : le prompt demande jusqu'à cinq points-clés et le modèle
les remplit. C'était le signal d'alarme que l'ADR nommait lui-même — *« détectée sur presque toutes
les leçons → trop large »* — et il était au rouge dès la première mesure.

Et le resserrage a dû être mesuré **deux fois** : la requête SQL de contrôle ne comptait que les
virgules, alors que le code coupait aussi sur « et ». Annoncé « 4 leçons », le code en donnait
**7** — trois faux positifs sur de simples phrases françaises (*« Résumer **et** reformuler »*).

**Parade** : quand un ADR exige de mesurer une heuristique sur de vraies données **avant de la
figer**, ce n'est pas une formalité de suivi. ⚠️ Et **mesurer avec une requête qui APPROXIME la
règle ne compte pas** : il faut exécuter **la vraie fonction** sur les vraies données — sinon on
vérifie une heuristique qu'on n'a pas écrite.

### 🔴 Un signal calculé sur la MAUVAISE source — trouvé à l'écran, par une question

L'occasion était calculée sur les points-clés **du brouillon de Massimo**, qui est vide quand il
ouvre l'atelier. L'étape ⑥ n'apparaissait donc **jamais à l'ouverture**, sur aucune leçon : il
fallait qu'il choisisse d'abord trois points lui-même. Mesuré : **1 leçon** au lieu de **27**.

L'occasion est une propriété de la **LEÇON** — le §10 dit *« ZETIS **détecte** l'occasion »*, et le
§11 la cherche dans les `points_cles` **des fiches de ZETIS**. Les deux paragraphes le disaient ;
j'ai lu « `points_cles` » sans me demander *ceux de qui*.

**Parade** : pour un signal dérivé d'une donnée qui existe en plusieurs exemplaires (la fiche de
ZETIS, le brouillon de l'élève, le cours), écrire **de qui** avant d'écrire la règle. Et le
vérifier par un compte en base, où l'écart 1 vs 27 saute aux yeux.

### ⚠️ Un défaut corrigé sur UNE surface reste vivant sur l'autre

Le compteur d'étapes a été corrigé côté atelier le 2026-08-14 (4 étapes au lieu de 3). **Le même
défaut est resté côté serveur** — `subject_fiche_tiles` en comptait trois, et la barre de la tuile
portait **« sur 3 » en dur**. Un brouillon avec des pièges affichait « 2 sur 3 » sur la tuile
pendant que l'atelier disait « 3 sur 4 » : deux compteurs, deux vérités, pendant une journée.

**Parade** : après avoir corrigé un compteur, chercher les **autres** lecteurs de la même notion
(`grep -rn "etapes_remplies"`). Une correction validée sur la surface où le défaut a été vu ne dit
rien des surfaces où il n'a pas été cherché.

### ⚠️ Un import manquant fait tomber 35 tests d'un coup — et c'est une bonne nouvelle

`AUTHOR_ZETIS` utilisé sans être importé dans `atelier.py` : `NameError` à l'exécution, **35 tests
rouges** en une passe, cause affichée en clair au premier `-x`. Réparé en une ligne.

**À retenir** : ce mode d'échec est **bruyant et instantané**, à l'opposé des défauts de cette
session (un signal calculé sur la mauvaise source, un compteur qui sous-compte) qui étaient
**silencieux et verts**. Ce sont ceux-là qui coûtent, pas les `NameError`.

## Chantier `feat/la-fiche-vit-dans-le-temps` — 2026-08-14

### 🔴 Ajouter une étape à un accordéon sans toucher son COMPTEUR

`ETAPES` est passé de trois à quatre entrées ; le jalon de chaque étape et son rendu ont suivi.
**`remplies` est resté à trois** — les pièges étaient rendus, jalonnés, **sauvegardés en base**, et
invisibles au seul compteur. Massimo lisait *« 2 étapes sur 4 »* avec **trois** étapes remplies.

⚠️ **Un compteur qui SOUS-compte est pire qu'un compteur faux** : sur un écran qui s'interdit tout
reproche, il minimise le travail de l'enfant. Le mode d'échec ne ressemble pas à un bug — il
ressemble à *« tu n'en as pas fait beaucoup »*.

Aucun test ne pouvait le voir : les verrous existants assertaient « 0 étape sur 4 » et « 1 étape
sur 4 » — jamais un cas où l'étape ajoutée est remplie.

**Parade** : le tableau du compteur doit avoir **une entrée par entrée d'`ETAPES`**, et un test
qui remplit **la dernière étape ajoutée** — c'est celle qu'on oublie, par construction.

### 🔴 `grep -rln` compte des MENTIONS, pas des rendus

Pour savoir combien de surfaces rendent `FicheCard`, un `grep -rln "FicheCard"` a rendu quatre
fichiers. **Deux seulement le rendent** : `FicheSubjectPage` et `mindmap/FicheSidePanel`. Les deux
autres étaient `FicheCard.tsx` lui-même et `CoursPanel.tsx`, qui le cite **dans un commentaire**.

L'ADR-0054 §6 a été écrit sur ce compte faux (« les trois surfaces »), et je l'ai répété en
annonçant « quatre ». **Deux erreurs successives sur le même chiffre, sans jamais ouvrir un
fichier.**

**Parade** : pour compter des points de rendu, `grep -rn "<Composant"` (avec le chevron) ou lire
les imports. Un nom de fichier ne dit pas ce que le fichier fait.

### ⚠️ Le deck matière ne s'appelle pas `{deck: "subject"}`

`POST /api/student/reviews/session` attend une **union** : `"mix_day"` / `"mix_flash"` en chaîne,
mais le deck matière et le deck chapitre sont des **objets**. Une sonde écrite de mémoire a rendu
un 422 à trois branches — erreur de la sonde, pas du produit, mais elle coûte un aller-retour.

**Parade** : lire le schéma dans l'OpenAPI avant d'écrire une sonde, comme pour n'importe quel
appelant.

### 🔴 Une absence qui s'explique autrement ne prouve RIEN

« Le mélange du jour ne sert que des maths, donc le masquage des cartes françaises fonctionne. »
**Faux raisonnement** : Français a **156** cartes dues et le mélange est plafonné à **12**.
L'absence du français s'explique par le plafond, indépendamment du masquage.

C'est le motif **« contre-épreuve mal visée »** déjà consigné, appliqué cette fois à une
vérification **à l'écran** et non à un test.

**Parade** : avant de conclure d'une absence, chercher **toutes** les causes qui la produiraient.
Ici la mesure utile n'était pas la session mais le **compteur** (`due_count: 156` au lieu de 159)
— et même celle-là reste une déduction tant qu'on n'a pas mesuré 159 **avant**.

### ⚠️ Rentrer dans l'atelier après `finish` crée une version 2 VIDE qui masque la fiche

Constaté deux fois en deux jours (brouillons 51 et 52). Ouvrir l'atelier sur une leçon dont la
fiche est **finie** ne route pas vers `rework` : il naît un brouillon **vide**, et comme la
priorité de la tuile est `commencee > ma_fiche`, **la fiche finie disparaît de la liste**. Elle
devient inatteignable, la seule porte visible menant à cet atelier vide.

🔴 **Et ça met en doute une entrée écrite le matin même** : le brouillon 51 y est attribué au
défaut StrictMode. Cette explication-ci n'a besoin **d'aucun bug**. On ne sait pas laquelle est
vraie — mais la première a été écrite avec assurance, et c'est ce qu'il faut retenir.

### 🔴 Un mock INCOMPLET laisse la suite verte sans rien exercer — deux fois le même jour

Le motif est le plus coûteux de la session, parce qu'il **ressemble à un succès**.

| Où | Ce qui manquait | Pourquoi c'était vert |
|---|---|---|
| `FicheSubjectPage.test.tsx` | `vi.mock("../lib/atelier")` n'exposait que `cardsFromFiche` | `reworkFiche` n'est **atteint qu'au clic** sur la porte, qu'aucun test ne cliquait |
| `CoursPage.test.tsx` | `../lib/fiches` **pas mocké du tout** | l'appel réel échoue en jsdom → le `catch` **non bloquant** l'avale → repli silencieux |

Dans les deux cas la suite est passée de 705 à 705 : **le code neuf n'était exercé par rien**, et
rien ne le signalait. Vitest ne lève « No "x" export is defined on the mock » qu'**à l'accès**.

🔴 **Le second cas est le pire** : un chargement délibérément non bloquant (le bon patron, celui
des quiz) transforme *toute* absence de mock en repli silencieux. La robustesse du code de
production masque l'absence de test.

**Parade** : après avoir ajouté un appel réseau à une page, **ouvrir son fichier de test et
vérifier que le module est mocké** — le compteur de tests ne le dira jamais. Et se méfier de
« +0 test cassé » sur un ajout : c'est au moins autant un signe d'angle mort qu'un signe de
non-régression.

### 🔴 `git commit --no-edit` laisse les COMMENTAIRES dans le message de merge

Un `git merge origin/main` interrompu (éditeur quitté sans enregistrer) laisse `MERGE_HEAD` en
place. Le réflexe `git commit --no-edit` termine le merge — mais le sujet du commit devient :

```txt
Merge remote-tracking branch 'origin/main' … # Please enter a commit message to explain why …
```

**Cause** : sans éditeur lancé, le mode `cleanup` par défaut retombe sur `whitespace`, qui **ne
retire pas les lignes `#`**. Ce n'est pas une config du dépôt — `commit.cleanup` n'est pas défini.

**Parade** : `git commit --no-edit --cleanup=strip`, ou vérifier `git log -1` juste après. Réparable
par `git commit --amend --cleanup=strip -m "…"` **tant que ce n'est pas poussé** (et un amend de
merge conserve bien ses **deux parents** — vérifier par `git log --format='%h %p' -1`).

### ⚠️ Un sabotage peut viser un garde REDONDANT et rassurer à tort — 3ᵉ occurrence

Pour éprouver « la fiche de ZETIS n'est jamais datée », le garde `etat === "ma_fiche"` a été retiré
du calcul de la date. **La suite est restée verte** — et c'était juste : la branche `zetis` de
`sousTitre` **n'utilise pas** cette variable. Le sabotage ne changeait rien d'observable.

Le sabotage bien visé — faire afficher la date **par la branche `zetis`** — est rouge immédiatement.

🔴 **Conséquence retenue dans le code** : le garde est une **seconde barrière**, pas le mécanisme.
Son commentaire le dit désormais, sinon un futur lecteur le croirait porteur et se fierait à un
verrou que rien ne tient.

### ⚠️ Le critère « aucune route neuve » d'un ADR ne voit que le SERVEUR

L'ADR-0054 §2 borne le chantier par *« aucune route, aucune colonne, aucune migration »*, et son §1
en déduit que la 3ᵉ porte est « réalisable ». Vrai côté serveur — `fiche-tiles` rend `etat` et
`fiche_id`. **Mais la porte doit ouvrir SA fiche, et la fiche n'avait aucune adresse** : elle
n'était qu'un état interne de `FicheSubjectPage`, ouverte par index de liste.

Un critère formulé en vocabulaire backend a donc déclaré faisable quelque chose que le frontend ne
pouvait pas faire — et l'écran 7, exclu par ce même critère la veille, butait exactement sur le
**même manque**.

**Parade** : quand un ADR déclare une porte « réalisable parce que la donnée existe », vérifier
aussi qu'il existe un **chemin** pour l'atteindre côté client — une donnée sans adresse n'ouvre rien.

### ⚠️ « D'après ton cours » existe DEUX fois dans le DOM d'une fiche

`FicheCard` rend son pied à l'écran **et** un `FicheA5` hors écran (portail vers `body`,
`left-[-99999px]`) que l'export photographie. Un `findByText(/D'après ton cours/)` échoue donc sur
*« Found multiple elements »* — et le message ressemble à une régression alors que la
fonctionnalité marchait.

**Parade** : viser un élément propre à la surface testée (un bouton du pied écran), ou cibler par
conteneur — `document.querySelector("article footer")` pour l'écran, `"[aria-hidden] footer"` pour
le papier. C'est le patron retenu dans `FicheCard.test.tsx`.

## Chantier `feat/fiche-de-massimo-slice-3` — 2026-08-13

### 🔴 Un refactor « à comportement constant » sur une fonction SANS COUVERTURE ne prouve rien

`schedule_review` modifiée, suite relancée : **1257 → 1257, aucun test touché**. La preuve
attendue. Puis sabotage de la clause que je venais d'écrire — **1257 verts**. Cause : la fonction
n'était appelée par **aucun** test. Une seule mention dans tout `tests/`, et c'est une docstring.

⚠️ **« Zéro test touché » ne veut pas dire « comportement constant prouvé »** : ça peut vouloir
dire « comportement non observé ». Les deux se ressemblent exactement dans le rapport.

**Parade** : avant de revendiquer un Temps 1, vérifier que la fonction EST exercée —
`grep -rn "<fonction>" app/tests/`. Si elle ne l'est pas, le Temps 1 n'a pas de preuve : il faut
d'abord écrire les verrous, PUIS refactorer.

### 🔴 Testing Library ne monte pas en `StrictMode` — un défaut y est passé jusqu'à `main`

`main.tsx` monte l'app dans `<StrictMode>` (double montage en dev) ; `render()` de Testing Library
**non**. Le double montage n'était donc exercé par aucun des 699 tests.

Le défaut réel, vu à l'écran le 2026-08-13 : un garde-fou anti-double-POST en drapeau
(`if (ref.current === id) return;`) laissait le **premier** montage recevoir ses données APRÈS son
propre démontage (`annule` déjà vrai, donc jetées) pendant que le **second** rendait la main sans
rien redemander. `setDetail` passait — il arrive avant le démontage — les candidates non :
**l'accordéon s'affichait, entièrement creux**, API parfaitement fonctionnelle derrière.

🔴 **Et ce n'était PAS un défaut d'affichage — il DÉTRUISAIT du travail.** Constaté en base le
même jour, après le correctif : la version 2 d'une fiche, née d'un `rework` qui **copie** le spec,
était **entièrement vide** (`essentiel: null`, `points_cles: []`) alors que sa version 1 portait
son contenu. Le mécanisme :

```
la page charge → l'état est jeté → les refs de contenu restent VIDES
un geste, n'importe lequel → persister() écrit DEPUIS LES REFS
→ le vide est sauvegardé par-dessus le travail
```

`...detail.draft` était bien étalé en premier dans le payload, mais les quatre clés de contenu
étaient ensuite écrasées par les refs vides. **Un défaut de chargement qui déclenche une écriture
est une perte de données, pas un problème d'écran** — et c'est le genre de chose qu'on classe à
tort en cosmétique parce que le symptôme visible est un blanc.

⚠️ **Ce qui a sauvé la mise, c'est le §7** : rouvrir une fiche finie crée une **nouvelle version**
au lieu d'écraser. La version 1 est restée intacte et lisible. Une reprise « en place » sur
l'objet fini aurait détruit le seul exemplaire.

**Parade** — deux, et il faut les deux :
- **mémoriser la PROMESSE, pas un drapeau** : les deux montages attendent le même appel, un seul
  POST, et le survivant remplit l'état ;
- **un test qui rende dans `<StrictMode>`** dès qu'un effet fait un POST ou garde un ref. Vérifier
  alors les DEUX exigences séparément (un seul appel · l'état est rempli) : un drapeau tient la
  première et casse la seconde, donc un seul test ne les distingue pas.

### 🔴 Poser une surface neuve sans lire le composant qui affiche DÉJÀ l'objet

J'ai ajouté un bouton « 🃏 En faire des cartes » sous la fiche. `FicheCard` en portait déjà un —
« 🃏 Ajouter à mes cartes », **désactivé**, stub posé par l'ADR-0015 §6 en attente de ce chantier
exact, avec la prop `onAddToCards` déjà prête. Résultat à l'écran : **deux boutons, même emoji,
même geste, dont un mort** — et la doctrine du dépôt dit *« un bouton mort se lit comme une
panne »*.

Aucun test ne pouvait le voir : les miens cherchaient **mon** libellé et le trouvaient.

**Parade** : le read-before-code d'une slice qui ajoute une SURFACE doit inclure le composant qui
rend déjà l'objet, pas seulement les services. `grep -rn "<le geste en toutes lettres>" apps/` sur
le libellé métier, pas sur le nom de fonction.

### ⚠️ Un défaut peut être LATENT — neutralisé par un ordre physique que rien ne garantit

`schedule_review` cherchait une carte par `(student_id, skill_id)`, **sans `card_type` ni
`ORDER BY`**, alors que `generation.py` en produit jusqu'à trois par notion. Le cadrage en a
déduit un écrasement de carte. **Reproduit en transaction annulée : faux aujourd'hui.** Sur les
**106** notions multi-cartes, le `MIN(id)` est la carte `definition` **106 fois sur 106**, et zéro
notion n'est sans `definition` — le balayage séquentiel rendait donc toujours la bonne.

**Parade** : mesurer avant d'affirmer, **et le dire dans les deux sens**. Un défaut latent reste à
corriger (rien ne garantit l'ordre : un `UPDATE` déplace une ligne, un `VACUUM` change le plan),
mais on ne répare pas une panne — on **retire une dépendance accidentelle**, et le motif est plus
faible. Le corollaire pratique : le dédoublonnage de la migration était un **no-op mesuré**
(`DELETE 0`), à ne pas présenter comme un travail.

### ⚠️ Un verrou qui lit le SOURCE d'une fonction devient aveugle dès qu'on extrait une clause

`test_news_doctrine.py` lit le **corps** de `new_cards_count` et y interdit tout jeton d'échéance
(`due_at`, `overdue`…). Extraire une clause dans un helper partagé (`population.servable()`) sort
le jeton du corps scanné : **le verrou passerait au vert sur un helper qui lit une échéance.**

**Parade** : quand un prédicat est appelé par un compteur sous ce verrou, la règle doit être tenue
**par construction dans le helper** et écrite dans son docstring. C'est fait ici : aucun prédicat
de `memory/population.py` ne lit d'échéance, et le module le dit en tête.

### ⚠️ Un test peut rougir pour la MAUVAISE raison — l'étape ① est ouverte au départ

Mon test `StrictMode` faisait `deplier(/À retenir/)` avant de chercher une phrase. L'accordéon
ouvre l'étape ① **par défaut** : le clic la refermait, et le rouge ne disait rien du produit.

**Parade** : avant de conclure d'un rouge, lire l'erreur — *« Unable to find… »* sur un élément
qu'on vient soi-même de masquer n'est pas un défaut du code.

### ⚠️ `Quiz.subject_id` est NOT NULL — le décor de test ne peut pas l'omettre

Un `Quiz(lesson_id=…, title=…)` échoue à l'insertion. La matière se prend sur la notion :
`select(Skill.subject_id).where(Skill.id == skill_id)`.

## Chantier `feat/fiche-de-massimo-slice-2` — 2026-08-13

### 🔴 Un `db.scalar` sans `ORDER BY` + `StrictMode` = deux lecteurs, DEUX brouillons

Constaté **en base de dev** : **4 brouillons pour 2 leçons**, alors qu'`open_or_get_draft` se
voulait idempotent. Deux causes qui s'additionnent, et la seconde est la vraie :

1. `StrictMode` monte deux fois en dev — **et un double-tap sur téléphone fait exactement pareil**.
   Deux `POST /draft` partent ensemble, aucune transaction ne voit l'autre, chacune crée le sien.
   L'idempotence « je regarde s'il existe, sinon je crée » **n'est pas idempotente sous course**.
2. 🔴 Le symptôme grave n'est pas le doublon, c'est que `db.scalar(select(...))` **sans `ORDER BY`
   rend une ligne arbitraire** : l'atelier lisait le brouillon rempli pendant que la tuile de
   l'écran 2 lisait le vide. Massimo aurait vu son travail **disparaître de sa liste** alors que le
   serveur le gardait parfaitement.

→ **Parade, en trois couches — aucune ne suffit seule** :
- **`ORDER BY <clé stable>` sur TOUS les lecteurs d'un objet qui peut exister en plusieurs
  exemplaires.** Ça ne supprime pas le doublon, ça garantit que tout le monde parle du même.
- **Un index unique PARTIEL en base** (`d4e5f6a7b8c3`) : c'est la seule chose qui empêche
  réellement la course. ⚠️ Partiel, sinon il interdirait aussi les **versions** légitimes.
- **Rattraper l'`IntegrityError`** — `db.rollback()`, relire, rendre le gagnant. *Interdire n'est
  pas gérer* : sans ça, le perdant de la course reçoit une **500** pour avoir ouvert deux fois.

Le test de la course se fait en **aveuglant la première lecture** (`patch.object` sur le prédicat,
qui rend `false()` au premier appel) : la course est alors réellement simulée, pas décrite.

### ⚠️ La transcription Whisper vivait sous le namespace ELI5

La dictée de l'atelier semblait « déjà faite » : une route de transcription existe depuis
l'ADR-0012. Elle est **`POST /api/ai/eli5/transcribe`**, et sa logique (400 vide, 413 trop gros,
trace `AIJob`, 503 `SttUnavailable`, 502 sinon) était **dans `eli5/service.py`**.

L'appeler depuis l'atelier aurait rangé la dictée d'une fiche sous le journal d'ELI5, et fait
dépendre `fiches` d'`eli5` pour une mécanique qui n'appartient à aucun des deux.

→ **Parade** : `app/modules/stt/service.py::transcribe_upload(db, stt, file, job_type=…)` — helper
**neutre**, extrait **à comportement constant** avant d'écrire quoi que ce soit de neuf (Temps 1).
`eli5.transcribe` n'est plus qu'une ligne. Chercher le **service**, pas la route : une route porte
un préfixe, un service porte la logique.

### ⚠️ `Skill.name` fait 160 caractères, `terme` en accepte 80

`_termes_de_la_lecon` tire les termes des **notions** de la leçon. `Skill.name` est un
`String(160)` ([school.py:114](apps/backend/app/db/models/school.py:114)) ; `FicheDefinition.terme`
est borné à `MAX_TERME = 80`. Une notion au nom long fait donc **échouer la validation Pydantic**
au moment de finir la fiche — c'est-à-dire au pire moment, sur un travail déjà fait.

→ **Parade** : filtrer **à la source** (`len(terme) > MAX_TERME` écarté dans le producteur), et non
tronquer à l'arrivée — un terme coupé au milieu d'un mot est pire qu'un terme absent. Le corollaire
général : **quand une colonne alimente un schéma, comparer les deux bornes**, elles n'ont aucune
raison d'être égales.

### 🔴 Une ancre de sabotage mangée par le shell — « 19 passed » ne voulait rien dire

Un sabotage posé par une commande shell dont l'ancre contenait des **backticks** : le shell les a
interprétés (substitution de commande) avant que le remplacement ne parte, l'ancre reçue ne
correspondait à rien, **le fichier n'a pas été modifié** — et la suite est passée au vert. J'ai
failli conclure « le verrou ne mord pas ».

→ **Parade** : un sabotage se pose depuis un **fichier de script Python**, jamais par une commande
shell portant du texte source. Et surtout — **vérifier que le sabotage a bien été appliqué**
(`git diff --stat` sur le fichier saboté) **avant** de lire le résultat des tests. Un sabotage qui
ne s'applique pas produit exactement le même vert qu'un test qui ne mord pas.

### ⚠️ Une baseline ROUGE avant toute modification — `test_auth.py` exige un vrai Postgres

Mesure de départ : **2 échecs**, avant d'avoir touché une ligne. Ce n'était pas la branche :
`test_auth.py` a besoin d'un **vrai Postgres**, et l'infra Docker avait été arrêtée à la fin de la
session précédente (`pnpm infra:down`). La vraie baseline était **1241**.

→ **Parade** : `pnpm infra:up` **avant** de mesurer une baseline, et devant une baseline rouge,
trancher « est-ce moi ? » **avant** d'enquêter — `git stash` puis relancer. Un `pnpm infra:down` de
fin de session laisse une mine pour la session suivante ; c'est le prix, il faut juste le savoir.

### ⚠️ `min-w-0` sur un enfant de flex — piège DÉJÀ consigné, repayé quand même

L'en-tête replié d'une étape (titre long) **poussait le conteneur** au lieu de rétrécir : un enfant
de flex a `min-width: auto`, il ne descend pas sous la largeur `min-content` de son texte. La
parade — `min-w-0 flex-1` — est **déjà écrite dans ce fichier** (§ « `sm:` vaut 640 px — donc
AUCUN téléphone ne l'atteint »), et je l'ai quand même repayée.

→ **Rappel** : tout bloc de texte dans un `flex` qui doit pouvoir rétrécir prend `min-w-0`. Sans
exception, et sans attendre de le voir déborder.

## Chantier `feat/fiche-de-massimo` — 2026-08-13

### 🔴 Un cadrage qui compte les lecteurs d'une table ne compte que SON module

L'addendum ADR-0015 annonçait **trois** lecteurs du gate `validated` sur `fiches`, et marquait le
constat 🔴 en le comparant au piège de l'agenda. Le read-before-code en a trouvé **huit** :
quatre dans le module (`mark_seen` manquait à l'appel — sans lui, `POST /seen` renvoie 404 sur la
fiche de l'enfant), et **quatre hors du module, sans aucun filtre de statut** —
`production/equipment.py`, deux requêtes de `production/coverage.py`, la cascade de
`production/veto.py`.

La conséquence dépasse le confort : `_existing_fiche` prend « la dernière fiche par id, tout
statut », donc une fiche personnelle serait prise pour la fiche ZETIS de la leçon — ZETIS ne
produirait plus la sienne, et l'appelant **validerait la fiche de l'enfant** en `parent_bulk`.

⚠️ **La « sécurité par construction » d'un statut hors-cycle ne protège QUE les lecteurs qui
filtrent déjà sur le statut.** Ceux qui ne filtrent sur rien ne voient pas la différence.

**Parade** — le recensement ne se fait pas de mémoire :

```bash
grep -rn "Fiche\." apps/backend/app --include="*.py" | grep -v "/fiches/"
graphify affected "<fonction partagée>"
```

### 🔴 Trois contre-épreuves VERTES d'affilée, toutes mal visées

Après avoir corrigé trois défauts, les trois sabotages sont restés verts. Aucun ne prouvait rien,
et les trois causes étaient **différentes** :

| Sabotage | Pourquoi il ne mordait pas |
|---|---|
| fermeture de phrase sur `»` retirée | le bloc non coupé **dépassait la borne de longueur** et disparaissait — le symptôme visé (un `»` orphelin) n'apparaissait donc pas |
| retrait d'emphase re-remplacé par une espace | **deux gardes redondantes** : la substitution `\s+([.,])` rattrapait seule |
| filtre d'illustration `: «` neutralisé | le test n'exerçait que la branche des **préfixes**, pas celle-là |

**Parade** : un sabotage vert n'autorise **jamais** à conclure « le test est bon ». Il faut
**diagnostiquer pourquoi** — imprimer le pipeline réel, pas relire le code. Deux corollaires :
une garde **redondante** ne peut pas se prouver par un sabotage unique (il faut retirer les deux,
et le dire) ; et une fonction à **plusieurs branches** demande un verrou **par branche**.

### 🔴 Corriger une sur-coupure crée une sous-coupure

Le découpage en phrases coupait sur le point **interne** d'un `« … . »`, produisant une phrase
tronquée et un fragment ouvrant sur un `»` orphelin. Ajouter un drapeau « dans une citation » a
supprimé la sur-coupure — et créé l'inverse : une phrase qui **se termine** par `. »` ne se
fermait plus jamais, collant trois phrases en un bloc de 187 caractères, **écarté par la borne de
longueur**, emportant avec lui l'idée qui suivait.

**Parade** : sur `»`, fermer la phrase si ce qui précède se termine par `.!?`. Et surtout —
**vérifier une correction de découpage en imprimant les phrases produites**, jamais en relisant la
règle.

### ⚠️ `students` n'existe pas — c'est `student_profiles`

Le bloc de code de l'ADR écrivait `ForeignKey("students.id")`. Aucune table de ce nom dans le
dépôt ; les ~20 autres FK pointent `student_profiles.id` (`db/models/user.py`). Une migration
écrite d'après l'ADR aurait échoué à la pose.

### ⚠️ Deux résolveurs voisins, deux signatures

`subject_of_lesson(db, lesson: Lesson)` prend **l'objet** ; `subject_id_for_lesson(db, lesson_id:
int)` prend **l'id**. Les appeler l'un pour l'autre donne
`AttributeError: 'int' object has no attribute 'chapter_id'`, loin du point d'appel.

### 🔴 `npx tsc` — piège DÉJÀ consigné, et repayé quand même

Il attrape un paquet homonyme, affiche un message d'aide et **sort en 0**. Chaîné en `&&`, il fait
afficher un « OK » entièrement faux. Le piège était **écrit dans `MEMORY.md`** — mais pas ici, et
`MEMORY.md` s'élague. **C'est la démonstration que ce fichier-ci est le bon endroit.**

**Parade** : `pnpm --filter @zetis/frontend-<app> typecheck` (qui lance `tsc -b --noEmit`).

### ⚠️ `app.routes` n'expose pas `.path` — les routers montés sont des `_IncludedRouter`

Inspecter `app.routes` en cherchant un chemin rend **zéro route**, y compris pour des routes qui
existent et répondent. Conclusion fausse garantie.

**Parade** : `app.openapi()["paths"]`, seule vue fidèle des chemins réellement servis.

### 🔴 `fireEvent.click` vide la file d'état ENTRE deux appels

Deux `fireEvent.click` successifs ne reproduisent **jamais** un bug de fermeture périmée (deux
gestes dans le même tick) : React re-rend entre les deux, donc la seconde poignée lit un état
frais. Un test écrit ainsi reste vert sur le code fautif — vérifié.

**Parade** : émettre les deux dans **un seul `act`** :

```js
await act(async () => { croix[1].click(); croix[0].click(); });
```

### ⚠️ jsdom n'implémente pas `elementFromPoint`

`vi.spyOn(document, "elementFromPoint")` échoue — *« The property is not defined on the object »* —
parce qu'on ne peut pas espionner une propriété **absente**. Tout test de glisser-déposer par
pointeur en dépend.

**Parade** : la **poser** avant, la retirer après (sauvegarder l'original, réassigner).

### ⚠️ `HTTP_422_UNPROCESSABLE_ENTITY` est déprécié — et le dépôt traite les avertissements en erreurs

Avec `filterwarnings = ["error"]`, la constante dépréciée lève une `StarletteDeprecationWarning`
**à la place** de la `HTTPException` : le test voit une exception qui n'a pas de `status_code`.
Le dépôt utilise partout `HTTP_422_UNPROCESSABLE_CONTENT`.

### ⚠️ Un glisser qui démarre à côté d'une puce SÉLECTIONNE le texte

`select-none` sur les seules puces ne suffit pas : un départ à quelques pixels sélectionne la
colonne, et sur iPhone une sélection déclenche la loupe et le menu Copier au milieu du travail.
**Parade** : `select-none` sur toute la zone de manipulation.

---

> **Remonté de l'élagage du chantier `fix/accueil-titre-coupe` (PR #121)** — sa clôture n'avait
> écrit **aucune** section ici, alors que quatre pièges de son « outillage » y avaient leur place.
> Le contrôle 2 de l'élagage l'a rattrapé le 2026-08-13.

### 🔴 Un padding interne ne déplace PAS la boîte

`element.getBoundingClientRect().left` d'un `h1` en `pl-4` rend toujours le bord du **conteneur** :
c'est le texte qui bouge, pas la boîte. Mesuré à tort, au point de croire un correctif sans effet.

**Parade** : mesurer le **contenu** par un `Range` —
`const r = document.createRange(); r.selectNodeContents(el); r.getBoundingClientRect()`.

### 🔴 `uv sync` casserait le venv backend

Il retirerait `faster-whisper`, `ctranslate2`, `piper-tts` et `onnxruntime` — les extras
`stt`/`tts`, non sélectionnés — donc la **dictée ELI5** et la **voix des capsules**.

**Parade** : `VIRTUAL_ENV=.venv uv pip install <paquet>` (additif), puis `uv lock`.

### ⚠️ `git branch -r` ment après un `--delete-branch`

Il lit les références de suivi **locales**. Le piège s'est rejoué **huit fois sur huit merges** —
la sixième au merge de la PR #122, le jour même où cette entrée était écrite, et la **septième au
merge de la PR #123 quelques heures plus tard**, alors que l'entrée annonçait explicitement qu'il
se rejouerait — puis la **huitième au merge de la PR #124, le même jour**. Trois fois en une
journée, sur une entrée qui décrit le piège en toutes lettres. C'est le comportement **normal** de la commande : le réflexe ne s'automatise pas,
et le savoir ne suffit pas à l'éviter — seule la commande qui interroge le serveur le fait.

**Parade** : `git ls-remote --heads origin` interroge le serveur ; `git fetch --prune` élague.
⚠️ Même famille : `git merge-base --is-ancestor` ne peut **jamais** confirmer un merge en squash
(le squash crée un commit neuf) — passer par `gh pr list --head <branche> --state all`.

## Chantier `fix/quizpage-test-instable` — 2026-08-11

### 🔴 Attendre A pour asserter B est une COURSE, même quand A « vient après » B

Un test de `QuizPage` échouait **une fois sur huit environ**, seulement en suite complète.

```js
await screen.findByText(/Les fractions/);            // A : la liste des quiz s'affiche
const url = screen.getByTestId("url").textContent;   // B : l'URL nettoyée
expect(url).not.toContain("subject=");
```

Le raisonnement paraissait solide : dans le composant, `setSearchParams` est appelé
**synchroniquement** dans l'effet, **avant** que le `fetch` des quiz ne résolve. B devait donc
précéder A, et attendre A suffisait.

**Il ne suffit pas.** A et B passent par **deux chemins d'état indépendants** — l'état local de la
page pour la liste, le routeur pour l'URL — et rien ne garantit que React les commite dans le
**même rendu**. Sous charge, la liste s'affiche pendant que la sonde porte encore les anciens
paramètres.

**Parade** : mettre l'assertion dans un `waitFor`. **On attend ce qu'on assère**, jamais un
voisin qu'on croit ordonné.

```js
await waitFor(() => {
  const url = screen.getByTestId("url").textContent ?? "";
  expect(url).toContain("from=svt");
  expect(url).not.toContain("subject=");
});
```

⚠️ **Garder les DEUX assertions dans le `waitFor`** : si le nettoyage mangeait aussi `from`, la
condition ne serait jamais satisfaite et le test échouerait. L'invariant reste entier — sabotage
rejoué pour le prouver. Un `waitFor` autour d'**une seule** assertion aurait affaibli le verrou.

### ⚠️ Un intermittent ne se corrige pas sans être REPRODUIT

Ce fichier a d'abord porté une cause **fausse** — « interférence entre fichiers de test » — écrite
d'après le symptôme (passe en isolation, échoue en suite). Plausible, et démentie par la
reproduction.

**8 runs de la suite complète à vide n'ont rien donné.** L'échec n'est apparu qu'en recréant la
**contention** qui régnait lors des deux occurrences réelles :

```bash
for i in $(seq 1 8); do
  ( cd apps/backend && .venv/bin/python -m pytest app/tests -q >/dev/null 2>&1 ) &
  ( pnpm --filter @zetis/frontend-papa test >/dev/null 2>&1 ) &
  pnpm --filter @zetis/frontend-massimo test 2>&1 | grep -E "^ *Tests "
  wait
done
```

Tombé au 4ᵉ run — avec le **message d'erreur exact**, qui a désigné la vraie cause en une ligne.
La même boucle sert ensuite de **preuve du correctif** : 8/8 après.

⚠️ **Un symptôme « passe seul, échoue en groupe » évoque l'interférence, mais il évoque tout
autant une course que la charge révèle.** Les deux se distinguent par le message d'erreur — pas
par l'intuition.

## Chantier `feat/page-matiere-onglets` — addendum ADR-0024, chantiers A+B+C — 2026-08-11

### 🔴 Une clôture qui ne regarde QUE ses propres fichiers laisse passer une régression étrangère

`docs/frontend-massimo/page-capsules-ia.md` était modifié dans l'arbre à l'ouverture de la session,
sans appartenir à aucun chantier. Il a survécu à **une clôture complète, un merge et une journée**
avant que quiconque regarde ce qu'il contenait.

**Ce qu'il contenait** : la spec **d'initialisation du dépôt (29 juin)**, restaurée à l'identique
par-dessus celle du 3 juillet — vérifié, contenu byte-à-byte identique une fois les lignes vides
ignorées. Elle effaçait la description de fonctions **livrées et mergées** (PR #23 et #25) :
capsules « validées et rendues » en MP4, étagères par matière → chapitre, lecteur plein écran avec
comptage `onEnded`, célébration mini-victoire, bouton son partagé avec Papa. Et elle réintroduisait
« Massimo peut demander une capsule », qui **contredit** le comportement livré.

**Cause** : la session précédente (ADR-0051) a réécrit un fichier de doc hors de son périmètre, et
sa clôture a commité **sa propre liste** de fichiers sans lire le reste de `git status`.

**Pourquoi ça coûte cher** : une spec revenue à son état d'avant implémentation fait croire à la
session suivante que le travail **reste à faire**. `CLAUDE.md` dit *« mettre à jour la documentation
si l'implémentation diverge »* — pas l'inverse.

**Parade, deux gestes** :

1. À la **clôture**, lire `git status` **en entier**, pas seulement la liste des fichiers qu'on
   croit avoir touchés. Tout fichier modifié qu'on ne s'explique pas se **regarde** avant de
   committer ou de laisser.
2. Devant un fichier orphelin, la question n'est pas « est-ce à moi ? » mais **« est-ce une
   avancée ou un retour en arrière ? »**. Le contrôle tient en une commande :

```bash
# la version de l'arbre correspond-elle à une version HISTORIQUE du fichier ?
courant=$(git hash-object <fichier>)
for c in $(git log --format=%H -- <fichier>); do
  [ "$(git rev-parse "$c:<fichier>")" = "$courant" ] && git log -1 --oneline "$c"
done
```

Une correspondance avec une version **ancienne** = régression, pas travail en cours.

> ⚠️ **Le point 6 de `/cloture` ne couvre pas ce cas** : il vérifie les faits qu'on a **écrits**,
> il ne regarde pas ce qui traîne à côté. Les deux contrôles sont complémentaires.

### 🔴 Un `else` implicite rend un test-verrou VERT sur du code faux

Le service « Reprendre » choisissait le type d'un contenu ainsi :

```python
kind = "cours" if event_type == "lesson_viewed" else "quiz"   # ← faux
```

Le test-verrou « `fiche` et `revision` ne se rouvrent pas » **passait**. Sabotage joué : ajouter
`fiche_viewed` à la liste des types lus. **Le test est resté VERT** — parce que `fiche_viewed`
était étiqueté « quiz », puis écarté **par accident** (son payload n'a pas de `quiz_id`).

**Cause** : la branche `else` attrape tout ce qui n'est pas explicitement nommé. Le filtrage réel
reposait sur la *forme du payload*, pas sur une décision.

**Parade** : une table explicite, **sans branche par défaut** —
`RESUME_KINDS: dict[str, tuple[str, str]]` (`event_type → (kind, clé de payload)`). Un type absent
de la table `continue`. Le même sabotage rougit désormais.

> ⚠️ **La leçon dépasse ce fichier** : un sabotage qui reste vert ne dit pas « le test est
> faible », il dit **« regarde le code de plus près »**. Ici c'était un défaut de conception.

### 🔴 `NON_ACTIVITY_EVENTS` n'est pas le filtre « ce que Massimo a travaillé »

Le plan de chantier disait de filtrer `NON_ACTIVITY_EVENTS` pour lire `learning_events`. **C'est
le mauvais filtre**, et `activity/events.py` porte déjà le récit du bug : il ne contient que les
deux événements d'agenda, alors que `login` et `page_viewed` sont aussi du non-travail — d'où
*« se connecter suffisait à suspendre la production pendant cinq minutes »*.

**Parade** : `NON_WORK_EVENTS` (= `{login, page_viewed} | NON_ACTIVITY_EVENTS`). Mieux encore, et
c'est ce qui a été retenu : **partir d'une liste POSITIVE** de types lus, jamais d'une exclusion —
une exclusion oublie toujours le type qu'on ajoutera demain.

### ⚠️ Deux routes annoncées « à créer » existaient déjà

Le plan annonçait un `SUM(xp_events.amount)` par matière et une route
`GET /api/student/subjects/overview`. **Les deux existaient** :

- `gamification.xp_by_subject()` (ADR-0038 §3) — son docstring prévient même qu'*« en servir une
  seconde façon de le compter serait la dette que ce chantier vient solder »* ;
- `GET /api/student/galaxy` sert **déjà** une ligne par matière, docstring compris (*« un COMPTE
  d'étoiles allumées […] ne classe pas ses matières »*).

**Parade** : avant d'écrire un agrégat, chercher qui répond déjà à la question **en français**
(« combien d'XP dans cette matière »), pas seulement par nom de fonction.

⚠️ **Corollaire de perf** : `xp_by_subject` agrège TOUTES les matières. L'appeler dans une boucle
sur les matières est un N+1 **sur la page qui les liste toutes**. Le lire **une fois avant la
boucle**, et exposer un `xp_block(total)` public pour garder le barème de niveau privé.

### ⚠️ Le panneau Browser et Chrome sont deux navigateurs, avec deux sessions

Se connecter dans Chrome ne connecte pas le panneau Browser (`localStorage.zetis_token` y reste
absent). Deux allers-retours perdus à demander une connexion déjà faite… ailleurs.

**Parade** : vérifier la session **là où on va cliquer** —
`localStorage.getItem("zetis_token")` — avant de demander quoi que ce soit à l'humain.

### 🔴 Chrome refuse de se redimensionner : mesurer le mobile par une IFRAME

`resize_window` rend « Successfully resized » et `window.innerWidth` **reste à 1920** (fenêtre
plein écran macOS). Sans mesure mobile, deux défauts seraient passés (barre d'onglets coupée,
cibles de touche à 16 px).

**Parade** : injecter une iframe de 390 px dans la page authentifiée. Une iframe a **sa propre
fenêtre d'affichage**, donc les media queries s'évaluent pour de vrai, et la session est partagée.

```js
const f = document.createElement('iframe');
f.src = '/subjects/mathematiques';
f.style.cssText = 'position:fixed;top:0;left:0;width:390px;height:844px;z-index:2147483647';
document.body.appendChild(f);
// puis mesurer DANS f.contentDocument : scrollWidth, hauteurs de boutons, éléments hors cadre
```

⚠️ **Mesurer, pas juger sur capture** : `d.documentElement.scrollWidth > innerWidth` pour le
débordement, et `getBoundingClientRect().height < 44` pour les cibles de touche.

⚠️ **`querySelector('aside')` attrape la barre latérale du layout**, pas le rail de la page. Viser
par `aria-label`.

### ⚠️ Deux de mes propres tests étaient faux — et verts

1. **`findByText("SVT")`** : ambigu dès que le rail droit affiche aussi une échéance de SVT.
2. **`await screen.findAllByRole("link")`** : se résout sur « Voir ma galaxie », rendu **avant** le
   chargement des matières. Le test **courait à vide** et n'aurait jamais rougi.

**Parade** : ancrer l'attente sur une valeur **unique** de la donnée attendue (ici « 640 XP »),
jamais sur un rôle générique ni sur un texte qui peut apparaître deux fois.

### ⚠️ Un test-verrou peut rougir pour la MAUVAISE raison

Un sabotage sans rapport (retrait du filtre par matière) a fait rougir le test de l'anneau, parce
qu'il attendait `findByText("2")` — et une échéance « 2 jours » venait d'entrer dans la page.
Recentré sur l'`aria-label` de l'anneau. **Un test qui se casse pour une raison qui n'est pas la
sienne ne prouve rien.**

### ⚠️ `cd X && cat >> …` court-circuite l'écriture quand on est DÉJÀ dans X

`cd apps/backend` échoue (« no such file or directory ») quand le shell y est déjà : le `&&`
annule le `cat >>`, le heredoc est consommé, **rien n'est écrit**, et la commande suivante rend un
compte de tests inchangé qu'on lit comme un succès.

**Parade** : `pwd` d'abord (le répertoire de travail **persiste** entre les appels), et vérifier
l'écriture (`grep -c "^def test_"`) plutôt que de se fier au run qui suit.

### ⚠️ `app.routes` n'est pas à plat (piège déjà consigné, retouché)

Lister les routes par `app.routes` rend **`[]`** : un contrôle « telle route existe » écrit dessus
passe à vide. Vérifier par les **tests** ou par `/openapi.json`.

## Chantier `feat/papa-lit-un-diagnostic` — ADR-0051, Session A — 2026-08-11

### 🔴 « Reprendre la forme de X » : vérifier ce que X sert EN PLUS

Le prompt de slice disait *« réutilise la forme de `_papa_question_out` »*. Elle en sert **cinq**
champs de plus que le besoin : `question_type`, `difficulty`, `source`, `status`, `sort_order`.
Sur un diagnostic ils sont **constants par construction** — `mcq` en dur à la génération, et les
routes d'édition et de retrait du module `quizzes` lui sont fermées par `_mission_quiz_or_404`.
Mesuré : 304 questions de diagnostic, **0 retirée, toutes `generated`**.

Les servir aurait donné à croire qu'ils peuvent varier, et la première session frontend qui aurait
essayé d'afficher un `status` l'aurait découvert seule.

**Parade** : « reprendre la forme de X » se lit **la forme UTILE de X**. Ouvrir X, lister ce qu'il
sert, et se demander champ par champ *« celui-ci peut-il varier ici ? »*. Un champ constant servi
est une invitation à écrire du code mort.

### ⚠️ Le décor de test existait déjà — le protocole parlait de la vérification à l'écran

Le protocole du prompt annonçait *« la surface n'a aucun décor, tu dois le fabriquer »*. Vrai —
**mais seulement pour la vérification manuelle**. Côté tests, `test_diagnostic_gate.py` porte déjà
`_diagnostic_pending(db)`, qui pose un diagnostic `pending` avec sa question directement en base.

**Parade** : avant d'écrire une fabrique de décor, `grep -rn "def _" app/tests/` sur le module
concerné. Ici le fichier à réutiliser était même **nommé** dans la liste de lecture du prompt.

### ⚠️ `packages/types` n'a AUCUN build — les types partagés ne se typecheckent pas seuls

`packages/types/package.json` n'a ni `scripts`, ni `tsconfig` de build : `main` et `types` pointent
directement sur `./src/index.ts`. Un `tsc -b` lancé dans ce dossier ne fait **rien**, et `npx tsc`
y répond *« This is not the tsc command you are looking for »* (le piège déjà consigné deux fois).

Les types partagés ne sont donc vérifiés **que par les applications qui les consomment**. Un type
cassé qui n'est importé nulle part ne fera rougir personne.

**Parade** : après toute modification de `packages/types`, lancer le typecheck des **deux** fronts —
`apps/frontend-papa/node_modules/.bin/tsc -b --noEmit` et l'équivalent Massimo. ⚠️ Et lancer le
binaire local, pas `npx`.

### 🔴 Le §4 a mordu — supprimer une fonction aurait supprimé une DÉCISION avec elle

Le prompt de la Session B disait, point 6 : *« supprime `actionPrincipale()` »*. La fonction
rendait trois cas, et **ils ne mouraient pas de la même mort** :

| Cas | Verrouillé par | Sort |
|---|---|---|
| cran `genere` → `/relecture?kind=diagnostic` | `crans.test.ts` + `DiagnosticsPapaPage.test.tsx` | **périmé par l'ADR** ✅ |
| cran `passe` → `null` | `crans.test.ts` | disparaît sans reste ✅ |
| **cran `propose` → `null`** | `crans.test.ts` | 🔴 **une DÉCISION, pas un manque** |

Le troisième figeait l'impossibilité de « Voir la page de Massimo → » (routes `require_child`,
**403** à un rôle parent) — et son commentaire disait explicitement que sa chute devait signaler une
réouverture. Le supprimer **par effet de bord** aurait rouvert la question en silence.

**Parade, appliquée** : la session s'est arrêtée AVANT d'écrire une ligne, et la protection a
**changé de support** — elle vit désormais dans `PanneauPassation.test.tsx`, sur le *rendu*, ce qui
est même plus proche de ce qu'elle protège.

⚠️ **La leçon générale** : quand on supprime un helper, lister ses cas **un par un** et demander
pour chacun *« est-ce que l'ADR le périme, ou est-ce qu'il tombe avec le reste ? »*. Un helper qui
rend `null` pour plusieurs raisons différentes en fige plusieurs, et le compilateur ne dit lequel.

### 🔴 L'ADR peut être PLUS LARGE que son propre prompt — relire les deux, pas l'un

L'ADR-0051 D2 dit *« le questionnaire reste lisible après le verdict, **y compris sur un diagnostic
passé** »*. Le prompt de la Session B ne décrivait que le cran « chez toi ». Or `PanneauSansMesure`
ne s'affiche que sur `cran !== "passe"` : le troisième cran est un **autre composant**, que le
prompt ne mentionne nulle part.

Suivre le prompt à la lettre aurait livré une surface **contredisant la décision qu'elle réalise** —
le diagnostic devenait illisible au moment précis où il a un score à expliquer. Et **aucun test ne
l'aurait vu** : tous les verrous écrits portaient sur le cran « chez toi ».

**Parade** : le prompt est une *mise en œuvre* de l'ADR, pas son résumé. Quand le read-before-code
liste les fichiers, vérifier que **chaque décision de l'ADR a un fichier en face**. Ici la D2 n'en
avait pas.

### ⚠️ `findByText` sur le chapeau ne garantit pas que le reste du panneau est là

Un test cliquait « Laisser passer » après `await screen.findByText(/attend ta relecture/)`. Le
chapeau est rendu **immédiatement** ; le bouton, lui, n'apparaît qu'une fois le questionnaire
chargé (on ne laisse pas passer ce qu'on n'a pas vu). Le `getByRole` qui suivait échouait.

**Parade** : attendre **l'élément qu'on va utiliser** (`findByRole`), pas un voisin arrivé plus
tôt. Deux données chargées par deux `useEffect` distincts n'arrivent pas ensemble, même quand elles
finissent dans le même panneau.

### ⚠️ `getByText` sur un fragment qui apparaît deux fois

`getByText(/2 questions/)` a échoué en `getMultipleElementsFoundError` : la chaîne existe sur la
ligne de volume **et** sur le badge du groupe. Cibler par le détail unique
(« 1 notion, 2 questions chacune ») plutôt que par le fragment.

### ⚠️ `python` n'existe pas sur le PATH de ce dépôt

`python -m pytest` répond `command not found`. L'interpréteur est **`apps/backend/.venv/bin/python`**,
et lui seul. C'est trois secondes perdues à chaque session qui l'oublie.

## Chantier `fix/cours-vide-non-validable` — PR #112 — 2026-08-11

### 🔴 Un `status` ne dit rien d'un CONTENU — 50 leçons `validated` étaient vides

`set_lesson_validation` ne vérifiait que `status == "draft"`. Une leçon sans une ligne passait donc
`validated`, et le gate de l'ADR-0011 — qui filtre sur **le seul `status`** — la servait à Massimo :
une page blanche au bout d'un lien. **50 sur 88, soit 57 % du corpus validé.**

**Parade** : la garde vit dans `set_lesson_validation` (409), et le lot **saute** au lieu de
planter. ⚠️ **Deux comportements différents pour la même règle, et c'est voulu** : un 409 à la
première leçon vide d'un lot empêcherait de valider tout le reste du chapitre.

### 🔴 Quand plusieurs tests rougissent, la cause commune est une HYPOTHÈSE

Quatre tests sont tombés en posant la garde. Deux **exerçaient le défaut** (ils validaient une
leçon générée sans contenu et attendaient 200) ; deux comparaient un **dict entier** à qui un champ
venait d'être ajouté. Rien à voir entre les deux moitiés.

**Parade** : lire chaque échec avant de toucher au code commun. Et quand un champ neuf ne concerne
qu'une partie des appelants, lui donner **son propre schéma** plutôt qu'un défaut sur le parent —
les deux tests des lots de chapitres n'ont alors pas eu à bouger, et **un test qu'on ne modifie pas
est un test qui garde encore**.

### 🔴 Un lien peut être bien formé, cliquable, et ne mener nulle part

`/programme?lesson=<id>` : `ProgrammePage` ne **sélectionne** une matière que sur `?subject=`, ne
**déplie** un chapitre que sur `?chapter=`, et `LessonsPanel` — seul à lire `?lesson=` — n'est monté
que si un chapitre est déplié. Le paramètre partait donc à un composant **absent de l'écran**.

⚠️ **Trois surfaces le portaient, deux variantes** : le Diagnostic n'envoyait que la matière (tous
les chapitres en vrac), les deux gestes des Lacunes que la leçon (rien ne s'ouvrait). Corriger l'un
sans l'autre laissait Papa égaré par le second.

**Parade** : quand un lien vise un grain fin, vérifier **ce que la page destination lit vraiment**
avant de construire l'URL. Aucun test de rendu ne voit ce défaut : le lien existe, il est cliquable,
son `href` est valide.

### ⚠️ Un `?champ=` optionnel au contrat casse `> 0` en TypeScript

`skipped_empty_count?: number` puis `res.skipped_empty_count > 0` → erreur de compilation.
`?? 0` à la lecture, et le défaut reste au contrat : les lots de chapitres n'ont rien à sauter.

## Chantier `fix/agenda-trois-defauts` — relecture humaine de l'ADR-0050 — 2026-08-10 → 11

> Trois défauts trouvés **par l'œil du commanditaire en quinze minutes**, plus un quatrième
> trouvé par accident en vérifiant. **Aucun n'était visible à un test.**

### 🔴 Le plan datait en UTC pendant que tout l'agenda datait en Europe/Paris

`plan._today()` rendait `datetime.now(timezone.utc).date()`. Entre **minuit et 2 h** (été ;
minuit–1 h en hiver) cette date est **la veille** de `today_local()`. Donc
`jours_restants = due_on - _today()` valait **un de trop** : une échéance de DEMAIN passait pour
J+2, et ZETIS **composait un plan que la Décision 3 interdit**, avec une étape datée
d'aujourd'hui. **Ce n'est pas un artefact de test** — c'est ce qu'un enfant voit à 00 h 30.

**Parade** : `today_local()` partout où une date **civile** est attendue. Chercher
`datetime.now(timezone.utc).date()` dans le reste du dépôt.

### 🔴 Deux tests échouaient à la même heure **pour la raison INVERSE** — le produit avait raison

`test_reviews` et `test_dashboard` tombaient dans la même fenêtre, et il aurait été naturel de
conclure à une cause unique. **Faux** : eux datent leur décor en **UTC** et comparent à un serveur
qui date en **Paris** (`local_day`). Le défaut était dans les tests.

> 🔴 **Les « corriger » côté produit aurait cassé trois modules pour faire passer deux tests
> faux.** Quand plusieurs tests tombent ensemble, la cause commune est une **hypothèse**, pas un
> fait : il faut la vérifier test par test.

**Parade de diagnostic** : `git stash` puis relancer sur `main` nu. Si ça échoue aussi, ce n'est
pas le chantier — et on sait alors quoi chercher.

### 🔴 Un verrou qui ne mord que deux heures sur vingt-quatre n'est pas un verrou

Les deux tests de comportement qui gardaient le rétro-planning n'ont attrapé le bug ci-dessus
**que parce qu'on les a lancés à 00 h 16**. Vingt-deux heures par jour, ils étaient **verts sur du
code faux**.

**Parade** : quand un invariant peut se formuler directement, le tester directement.
`assert plan._today() == today_local()` mord à n'importe quelle heure, là où un test de
comportement dépend du moment où on le lance.

### 🔴 `pg_dump` de l'hôte (14.18) refuse un serveur 16.14 — et laisse un fichier de 0 octet

*« aborting because of server version mismatch »*, avec un `.sql` **vide** qui ressemble à une
sauvegarde. **Parade** : passer par le binaire du conteneur —
`docker exec -e PGPASSWORD=… zetis-prod-postgres-1 pg_dump -U zetis -d zetis > "$OUT"`, puis
vérifier par `grep -c "dump complete"` (jamais `tail` : pg_dump 16 écrit après le marqueur).

### 🔴 `nc -z 127.0.0.1 <port>` déclare « fermé » un serveur Vite qui tourne

Vite lie **`[::1]` (IPv6 seul)**, `nc -z 127.0.0.1` teste l'IPv4. Les deux frontends étaient up
depuis le début et annoncés fermés — j'ai lancé un doublon. **Parade** : `lsof -nP -iTCP -sTCP:LISTEN`,
qui montre `TCP [::1]:5173 (LISTEN)`.

### ⚠️ Et le doublon a déclenché la dette `launch.json` consignée deux fois

`preview_start {name:"massimo"}` a glissé sur le port **59169** (`autoPort: true`), que le
`cors_origins` **par défaut** du backend (5173/5174 exactement) refuse. Symptôme muet :
`/health` répond **200 sans en-tête `access-control-allow-origin`**.

### ⚠️ Deux pièges de shell qui ont menti sur un résultat

- **`echo "exit=$?"` après un pipe rend le code de `head`, pas celui de `tsc`.** J'ai cru un
  typecheck vert sur une commande qui ne le prouvait pas. **Parade** : pas de pipe, ou `PIPESTATUS`.
- **Le `cd` PERSISTE entre deux appels Bash.** Après un `cd apps/backend`, un `grep
  apps/backend/...` échoue en « No such file ». Rencontré deux fois. **Parade** : chemins absolus.

## Chantier `feat/lacunes-permettent-d-agir` — ADR-0047, Session B — 2026-08-09

### 🔴 Une destination qui EXISTE ne garantit pas qu'elle puisse tenir la promesse du lien

L'ADR prescrivait `aucune_lecon` → « Produire le quiz de cette notion → » vers `/quiz?skill=`.
`QuizPilotagePage` existe, et lui ajouter `?skill=` était faisable. **Mais elle pilote les quiz *de
fin de cours*** — son propre sous-titre : *« un quiz se génère depuis le cours validé d'une
leçon »*. Or `aucune_lecon` est le cas **sans leçon**.

**Cause** : au cadrage, on vérifie qu'une page existe et qu'elle peut lire un paramètre. On ne
vérifie pas qu'elle sait **faire** ce que le libellé promet.

**Parade** : lire le **sous-titre et le domaine** de la page de destination, pas seulement son
URL. Ici le geste réel était `equipNotion` (`adr-0042`), une **action** in-place — et elle produit
**cinq** pièces, pas un quiz.

⚠️ Sans ce contrôle, le chantier dont la thèse est *« un libellé qui promet un grain doit livrer ce
grain »* aurait livré un lien qui ment. **Le défaut se reproduit dans sa propre correction.**

### 🔴 « trois lignes de code » — un chiffrage d'ADR ne se croit pas

La Décision 8 annonçait la correction de la station ② en « trois lignes ». Vérifié :

| Geste | Ce qu'il demandait vraiment |
|---|---|
| `cours_brouillon` → la leçon | `lesson_id` au contrat de `lacunes_de_passation` (backend + schéma + type) |
| `aucune_lecon` → l'action | `ConfirmDialog` + `ProgressBar` portées dans `PanneauPassation` |
| « Voir la lacune → » → la matière | ⚠️ **rien** — voir ci-dessous |

**Parade** : le prompt disait *« trois lignes ; si ça en demande trente, arrête-toi »*. C'est ce
garde-fou qui a fonctionné. **Écrire le chiffrage attendu dans le prompt rend son démenti visible.**

### ✅ Le champ qu'on croyait manquer était déjà là — mais PAS où on le cherchait

`/lacunes?subject=` attend un **slug**. `DiagnosticResult` porte `subject` (le **nom**) et
`subject_id` — jamais le slug. On aurait donc ajouté un champ au contrat…

…sauf que **`DiagnosticRailEntry` porte déjà `subject_slug`**, et que `DiagnosticsPapaPage` a
l'entrée du rail sous la main : elle lui passe déjà `selection.rang`. Une **prop**, zéro backend.

**Parade** : avant d'ajouter un champ à un contrat, chercher s'il existe sur un **contrat voisin
déjà présent dans le même composant parent**. Le grep utile n'est pas « où est ce champ » mais
« qu'est-ce que la page a déjà en main ».

### 🔴 `active_missions` et `pilot_list` ne voient PAS la même population

`mission_id` vient d'`active_missions` — `status in (planned, active)`, **aucun filtre
`validation_status`**. La page Missions affiche deux listes : `pending` (à valider) et `pilot`
(qui, lui, **exige `validated`**).

Conséquence : un `?focus=` qui ne chercherait que dans le pool serait **mort une fois sur deux**.

**Parade** : ancrer le lien profond sur un **`id` DOM posé sur les deux listes**, pas sur une
recherche dans un tableau. L'effet se contente de `getElementById` et sort si l'élément n'est pas
encore monté.

### ⚠️ Un test existant peut contraindre la FORME d'un ajout, sans être faux

`LacunesPage.test.tsx` verrouillait `queryByRole("button") === null` sur « Déjà prises en charge »
(*« rien à décider »*). Ajouter « Voir la mission → » y aurait **cassé ce test si c'était un
`<button>`**.

**Ce n'est pas un test à modifier** : un `<Link>` a le rôle `link`, il passe — et c'est aussi la
bonne forme, puisque le geste est une navigation. **Le verrou existant a désigné la bonne
implémentation.** Le modifier aurait masqué exactement ce qu'il protégeait.

### ⚠️ Les décors de test ne portent pas les invariants du serveur

`gap({ has_active_mission: true })` — sans `mission_id`. Le serveur garantit les deux ensemble ; les
décors écrits **avant** le champ, non.

**Parade, et elle vaut mieux qu'un décor corrigé** : ne rendre un geste **que si son identifiant
l'est**. `?focus=undefined` ne peut alors pas sortir, ni en test ni en production. Verrouillé.

### 🔴 Vérifier le responsive d'une page Papa à 375 px ne prouve RIEN aujourd'hui

Mesuré au DOM : viewport **375 px** → sidebar **256 px** (`w-64 shrink-0`, sans point de rupture),
`main` **119 px**, la ligne **71 px**, son corps **37 px**.

La règle `< 640 px` **s'appliquait bien** (`flex-basis: 100%` confirmé par `getComputedStyle`) —
elle ne peut simplement rien contre un conteneur de 119 px. C'est la dette *« la sidebar Papa n'est
toujours pas responsive »*, pas un défaut du chantier.

**Parade** : vérifier ces règles à **768 px**, où `main` fait ~512 px — donc **sous le seuil** et
lisible. Et **mesurer avant d'accuser** : sans les quatre nombres ci-dessus, j'aurais signalé une
régression qui n'existe pas.

### ⚠️ Libérer UNE mission ne libère pas forcément la notion

Pour voir les gestes autres que « Voir la mission », il faut retirer la mission qui couvre la
notion. Fait sur la mission 59 → la ligne est **restée** en « Déjà prises en charge », avec
`?focus=12` : **une seconde mission couvrait la même notion**.

C'est la preuve en conditions réelles que `missions_by_skill` suit bien l'ordre `priority DESC, id`
— mais c'est surtout un piège de vérification : **il faut libérer TOUTES les missions actives d'une
notion**, et relever leurs états avant de les toucher pour pouvoir restaurer.

## Chantier `feat/lacunes-permettent-d-agir` — ADR-0047, Session A — 2026-08-09

### 🔴 Deux fonctions sœurs sur la même donnée = DEUX requêtes, et le test unitaire ne le voit pas

L'ADR promettait « zéro requête de plus » pour `lesson_id` et `mission_id`, au motif que les deux
sont **déjà calculés puis jetés**. C'est vrai. Ma première implémentation l'a quand même perdu :
`etat_contenu` **et** une fonction sœur `lecons_visees`, appelées l'une après l'autre depuis
`open_gaps` — donc **deux passes** sur `lessons_by_skill` pour deux moitiés du même parcours.

Le même piège existait côté missions : `skills_with_active_mission` et une seconde fonction auraient
interrogé `active_missions` chacune de leur côté.

**Cause** : « la donnée est déjà calculée » ne dit rien de **où** elle est calculée. Extraire une
seconde projection d'un même parcours produit un second parcours si l'appelant demande les deux.

**Parade, appliquée des deux côtés** :

- `content_state.etat_et_lecon` rend le **couple** en une passe ; `etat_contenu` et `lecons_visees`
  n'en sont que des projections, pour les appelants qui ne veulent qu'une moitié ;
- `progress.missions_by_skill` porte l'ensemble **et** l'identifiant, et
  `skills_with_active_mission` en **dérive** (`set(...)`) au lieu de refaire la requête.

⚠️ **Aucun test unitaire ne voit ça** : les deux versions rendent exactement les mêmes valeurs. Il
faut un test qui **compte les requêtes SQL** (`event.listen(Engine, "before_cursor_execute")`) —
c'est le seul angle d'où la double passe est visible. Et le coût s'y paie deux fois, puisque
`open_gap_count` appelle `open_gaps`.

### 🔴 `content_state.py` annonçait DEUX lecteurs — il en a CINQ

Son docstring portait un tableau intitulé « Les deux lecteurs ». `graphify affected "etat_contenu"`
en rend **cinq** : `lacunes_de_passation`, `apercu`, `result_detail` (diagnostics), `open_gaps`,
`open_gap_count` (progress).

**Pourquoi ça compte** : l'écart change ce qu'on peut se permettre. Élargir la **signature** de
`etat_contenu` aurait touché trois appelants de `diagnostics` qui n'ont que faire d'une leçon —
d'où le choix d'une fonction sœur plutôt que d'un retour élargi.

**Parade** : sur un module neutre, `graphify affected` **avant** de décider de la forme d'une
évolution, jamais le docstring du module. Un tableau de lecteurs écrit à la main se périme au
premier appelant suivant, en silence.

### ⚠️ `lessons_by_skill` TRIE DÉJÀ — poser un second ordre était le vrai risque

L'ADR-0047 prescrivait un départage « la plus récente (`id` le plus grand) ». Le code trie déjà
`lecons.sort(key=lambda l: (l.updated_at, l.id), reverse=True)` (`lesson_resolution.py:113`), pour
ses **cinq** appelants.

Les deux ordres **divergent réellement** : une leçon ancienne (petit `id`) modifiée hier passe
devant une leçon créée aujourd'hui et jamais retouchée.

**Parade** : l'ADR a été corrigé, pas le code. Un second ordre de « la plus récente » dans le même
dépôt, c'est le motif des dettes *deux définitions de `has_referentiel`* et *sept copies de
`_active_year`*.

⚠️ **Et pour que le verrou le prouve, le décor doit distinguer les deux ordres** : la leçon attendue
est créée **en premier** (donc plus petit `id`) avec le `updated_at` le plus récent, et le test
assert explicitement `rendue != max(ids)`. Sans ça, il passerait avec l'un comme avec l'autre.

### ⚠️ `Lesson.updated_at` a un `server_default` — un décor naïf ne teste pas le tri

`TimestampMixin` pose `server_default=func.now()`. Quatre leçons créées dans la même transaction
reçoivent donc **la même** valeur, et le départage retombe silencieusement sur l'`id` : le test
passe, mais il ne prouve pas ce qu'il annonce.

**Parade** : assigner `updated_at` **explicitement** à la création (SQLAlchemy garde la valeur
fournie). C'est ce qui rend le tri observable.

### ⚠️ `API_SPEC.md` avait UN CHANTIER DE RETARD, et rien ne pouvait le dire

L'exemple JSON de `GET /api/parent/progress/gaps` ne portait ni `source` ni `content_state`, servis
depuis l'ADR-0045 **mergée**. Découvert en venant y ajouter deux autres champs.

**Cause** : **rien dans le dépôt ne compare `API_SPEC.md` à ce que les routes servent vraiment.**
C'est le même angle mort qui a laissé une spec de page décrire quatre routes inexistantes
(constat de l'ADR-0044). Un document de contrat sans contrôle automatique dérive à chaque chantier
qui ne le regarde pas.

### ⚠️ Le shell d'un agent GARDE son répertoire — un `cd` d'une commande vaut pour la suivante

Après `cd apps/backend && pytest`, la commande suivante partait de `apps/backend`, et tous les
chemins relatifs à la racine échouaient (`No such file or directory`) — sans que la cause soit
évidente, puisque la commande précédente avait réussi.

**Parade** : chemins **absolus**, ou `cd <racine> && …` en tête de chaque commande.

## Chantier `feat/worker-supervise` — ADR-0046, slices A/B/C — 2026-08-08

### 🔴 `docker compose kill` NE PROUVE PAS un redémarrage — il rend un FAUX NÉGATIF

La procédure de vérification écrite dans l'ADR **et** dans la spec disait *« tuer le conteneur
`worker`, vérifier qu'il revient »*. Jouée : `RestartCount = 0`, `State = exited`, **sur un service
parfaitement configuré**.

**Cause** : `docker kill` comme `docker stop` sont des **arrêts d'opérateur**. Le démon marque le
conteneur comme arrêté à la demande, et `unless-stopped` **exclut ce cas par définition** — c'est le
sens du mot *unless*.

🔴 **Une procédure de preuve qui rend un faux négatif est pire qu'une absence de procédure** : elle
fait défaire ce qui marche. Quiconque l'aurait suivie aurait conclu à l'échec du chantier.

**Parade** — faire mourir le processus *depuis l'intérieur*, sans que le démon l'ait demandé :

```bash
docker exec zetis-prod-worker-1 sh -c 'kill -TERM 1'
```

Deux sous-pièges dans cette seule ligne :
- `kill` **n'existe pas** dans l'image slim, et `docker exec` n'a pas de builtin → passer par `sh` ;
- viser **SIGTERM**, pas `-9` : la protection du PID 1 empêche la délivrance des signaux **sans
  gestionnaire**, et RQ installe un handler SIGTERM. Un `kill -9 1` de l'intérieur ne ferait rien.

⚠️ **Corollaire utile** : `stop` et `kill` sont **exactement ce qu'il faut** pour maintenir le worker
éteint pendant qu'on teste l'alerte. Le même geste sert une preuve et sabote l'autre.

### 🔴 Un motif `pgrep` a DEUX façons d'être faux, et les deux sont invisibles sans essai

| Direction | Motif | Effet |
|---|---|---|
| **sous-détection** | `pgrep -fl "production_worker\|rq worker"` | `\|` n'est **pas** une alternance en ERE — il cherche un `\|` littéral. Ne rend **jamais** rien, donc **autorise toujours** le démarrage |
| **sur-détection** | `^(.*/)?python[0-9.]* -m app\.production_worker$` | `(.*/)?` avale `sh -c cd apps/backend && .venv/bin/`, qui finit par `/`. Attrape **le wrapper qui vient de nous lancer** → blocage permanent |

Le premier a laissé monter un **troisième worker** sur un seul GPU. Le second a été produit en
écrivant le correctif du premier.

**Parade** : `^[^ ]*python[0-9.]* -m app\.production_worker$` — un chemin ne contient pas d'espace,
la ligne du wrapper si. Et **confronter le motif à de vrais processus**, pas seulement à un test :
c'est `pgrep` qui l'applique, pas le moteur `re` de Python.

### 🔴 `command:` est SILENCIEUSEMENT ignoré sur une image à `ENTRYPOINT` exec

`backend.Dockerfile` déclare `ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]`, et le script
fait `alembic upgrade head` + seed + `exec uvicorn` **sans jamais lire ses arguments**. Un service
qui réutilise l'image avec `command:` lance donc un **second uvicorn** et une **seconde migration
concurrente** — sans aucune erreur.

⚠️ **L'idiome du voisin mène au mauvais choix** : `worker-media` utilise bien `CMD`, mais **son image
n'a aucun `ENTRYPOINT`**. Copier le voisin, qui est le réflexe, produit le défaut.

**Et `docker compose config` VALIDE dans les deux cas** — vérifié. Le défaut n'existe qu'au runtime.

### 🔴 Patcher un import de niveau module est VERT et SANS EFFET

`watchdog.py` fait `from app.core.queue import _redis, production_worker_alive`. Les deux noms
vivent dans le namespace de `watchdog` : patcher `app.core.queue._redis` **ne change rien**, et le
test passe pour la mauvaise raison. Greffer sur `app.modules.production.watchdog.*`.

⚠️ `activity` et `mailer` sont importés comme **modules** (`from app.core import mailer`), donc
l'attribut est résolu à l'appel : les patcher sur le module d'origine fonctionne. La différence
sépare un verrou d'un test qui ne teste rien. *(Le dépôt avait déjà payé ça sur `enqueue_*`.)*

### 🔴 Un sabotage qui ne s'APPLIQUE PAS accuse le verrou à tort

Deux sabotages sont ressortis **verts**, ce qui se lit « verrou inutile ». En réalité les
expressions `perl` n'avaient **rien remplacé** — échappement de regex trop délicat. Rejoués avec un
contrôle d'application (`if old not in source: exit 9`), les deux sont **rouges**.

**Parade** : tout script de sabotage doit **échouer bruyamment quand le remplacement n'a pas eu
lieu**. Sans ça, un sabotage cassé produit un faux « ce test ne sert à rien », et on supprime un
verrou valide. C'est le miroir de la contre-épreuve mal visée.

### ⚠️ Le worker de production a besoin de `ANTHROPIC_API_KEY`, et ce n'est pas devinable

`curriculum_chapters`, `curriculum_lessons` et `curriculum_skills_backfill` sont **enfilés**
(`curriculum/router.py:84,237,255,398`), donc exécutés **par le worker**, et la dérogation ADR-0009
les route vers Anthropic. Un nettoyage qui retirerait la clé « inutile sur un worker » casserait la
génération du référentiel — **dans un worker**, donc plus discrètement qu'un 503 rendu à Papa.

Idem `AUDIO_STORAGE_DIR` + volume : `capsule_generate` / `capsule_voice` sont enfilés aussi.

**Parade appliquée** : une **ancre YAML** (`&generation-env`) plutôt qu'une recopie — l'invariant
devient structurel.

### ⚠️ Changer `POSTGRES_PASSWORD` ne change pas le mot de passe d'un volume existant

Postgres ne le fixe qu'à l'**initialisation du volume**. Sur un `zetis-prod_postgres_data` déjà
créé, modifier la variable produit une **erreur d'authentification**, pas un nouveau secret. Il faut
reprendre la valeur d'origine, ou `down -v` (qui efface les données).

Le piège n'est pas dans le défaut — il est dans sa correction.

### ⚠️ Le journal de production ne montre JAMAIS l'attente

Il affiche la date de **création** et la durée d'**exécution**. Mesuré sur les jobs 749/750 :
« *fait · 95 s · 07/08 20:07* » pour un travail créé le 07/08 et exécuté le 08/08 — **25 heures**
d'attente, invisibles.

🔴 **Le journal est donc incapable de montrer la panne que l'ADR-0046 corrige.** C'est pour ça
qu'elle est restée invisible jusqu'à ce qu'on regarde Redis à la main. Consigné au `BACKLOG.md`.

### ⚠️ Faire tourner la pile prod SANS démonter le dev

Les deux se disputent 8000 / 5173 / 5174, et le README interdit de lancer les deux. Mais le conflit
réel est **uniquement MinIO**, et il est paramétrable. Et `up worker` ne construit que le worker et
ses dépendances — **pas `worker-media`**, donc pas les ~300 Mo de Chromium :

```bash
MINIO_PORT=9010 MINIO_CONSOLE_PORT=9011 POSTGRES_PASSWORD=zetis_dev_password \
  docker compose -f docker-compose.prod.yml up -d --build worker
```

Joué quatre fois dans la session sans jamais toucher aux serveurs de dev.

## Chantier `feat/diagnostic-papa-optimisations` — ADR-0045, slice C — 2026-08-08

### 🔴 `response_model` FILTRE en silence les champs que le service produit

`GET /api/parent/progress/gaps` porte `response_model=list[OpenGapOut]`. Ajouter deux clés au
dictionnaire rendu par `progress.service.open_gaps` **ne suffit pas** : Pydantic ne sérialise que
les champs **déclarés dans le schéma**, et jette les autres. **Aucune erreur, aucun avertissement,
aucun test rouge** — la donnée existe côté service et n'arrive jamais au client.

Le service se lisait comme correct. C'est un test qui interroge la **route** qui l'a montré.

→ **Parade** : tout champ neuf se déclare **deux fois** — dans le service *et* dans le schéma. Et
un test de contrat porte sur la **route**, jamais sur la fonction : c'est la seule position d'où on
voit la sérialisation. Vaut pour toutes les routes FastAPI du dépôt.

### 🔴 Un sabotage resté VERT parce que le décor ne peut pas déclencher le défaut

Verrou : « le filtre `contenu=absent` ne retombe jamais sur *tout* ». Sabotage : ajouter le repli
`jeu = filtré.length ? filtré : jeu`. **Vert.**

La cause n'est pas le verrou mais son **décor** : il contenait deux lacunes sans contenu, donc le
filtre trouvait toujours quelque chose et **le repli ne s'exécutait jamais**. C'est une forme de
décor dégénéré plus discrète que le décor vide : il est riche, mais il ne peut pas atteindre la
branche qu'on prétend verrouiller.

→ **Parade** : pour verrouiller un REPLI, il faut un décor où la condition de repli est **vraie** —
ici, un décor où le filtre trouve **zéro**. Ajouté ; le sabotage rougit depuis.

### ⚠️ Un sabotage NEUTRE ne prouve rien, et il faut le dire plutôt que le compter

Sabotage : faire dépendre `filtreOrigine` du libellé (`nomsFiltres.length > 0`) au lieu de la
présence du paramètre. **Vert** — et cette fois c'est correct : le libellé a reçu entre-temps un
repli générique (`d'origine « … »`), donc les deux expressions sont devenues **équivalentes** pour
toute valeur de `source`. Le bug d'origine n'est plus atteignable.

→ **Parade** : ne pas maquiller un sabotage neutre en verrou. Le compter comme neutre, et dire
pourquoi — sinon on croit tenir une garantie qu'on n'a pas.

### ⚠️ Où loger une fonction partagée quand le module évident la refuse

`etat_contenu` avait deux lecteurs et devait sortir de `diagnostics.service`. Le domicile évident,
`lesson_resolution.py`, **écrit dans son propre en-tête** qu'il ne porte *« aucun filtre de statut
de leçon, et c'est le cœur de la décision »*. Or cette fonction classe sur `status == "validated"`.

On peut plaider que **classer n'est pas filtrer** — mais réinterpréter en passant une frontière
écrite noir sur blanc est exactement ce que le rituel interdit.

→ **Parade** : un module neutre à part (`app/modules/content_state.py`). Ni la frontière érodée, ni
`progress` rendu dépendant de `diagnostics` pour un concept qui parle de **leçons**.

## Chantier `feat/diagnostic-papa-optimisations` — ADR-0045, Sessions A et B — 2026-08-08

### 🔴 Un `<button>` dans un `<button>` : le parseur les SÉPARE, et la grille se disloque

La première jauge doit être cliquable **et** contenir deux pastilles cliquables. Écrit
naïvement — `<button class="jauge">` contenant `<button class="chip">` — c'est du **HTML
invalide** : le parseur HTML **éjecte les boutons enfants hors du parent**. Le DOM obtenu n'est
pas celui du JSX, la grille CSS reçoit trois enfants au lieu d'un, et le bandeau se disloque.

Aucune erreur, aucun avertissement, aucun test rouge : **ça ne se voit qu'à l'écran**. Payé sur la
maquette de ce chantier, avant que le code ne le reproduise.

→ **Parade** : la carte est un `<div>` ; la zone principale est un `<button>` ; les pastilles sont
ses **sœurs**, pas ses filles. L'état visuel de la carte se calcule alors en JS (ou par `:has()`),
puisqu'il ne peut plus venir du `:hover` du bouton parent.

### 🔴 `reject` fait DISPARAÎTRE la ligne du rail — il ne la fait pas reculer d'un cran

`apercu` exclut `Quiz.validation_status != "rejected"` (`diagnostics/service.py:941`). Un
diagnostic refusé **sort du rail**, il ne redescend pas au premier cran.

Et `charger()` **conserve** la sélection courante — `setSelection((courante) => courante ?? …)`.
Enchaîner `reject` puis `charger()` laisse donc le panneau sur une **ligne qui n'existe plus**.

→ **Parade** : `setSelection(null)` **avant** le rechargement. L'updater fonctionnel de `charger()`
voit alors `null` et reprend le choix par défaut. Vérifié à l'écran : compteur 12 → 11, pastille
11 → 10, sélection retombée sur le défaut, aucun panneau fantôme.

### 🔴 Un décor de test à DEUX familles rend l'addition juste par accident

Le défaut central du chantier — la jauge annonce « 5 jamais **mesurées** » quand
`matieres_total − matieres_mesurees` en donne 6 — n'existe **que** s'il y a une matière **générée
et jamais passée**. Or le décor du fichier de page a deux matières : une mesurée, une jamais
générée. `2 − 1 = 1` et `jamais_generees = 1` **tombent d'accord par hasard**.

Un verrou posé sur ce décor est vert quoi qu'on fasse. C'est la forme la plus discrète du décor
dégénéré : il n'est ni vide ni au plancher, il est juste **incomplet d'une famille**.

→ **Parade** : le verrou central vit dans son propre fichier (`components/diagnostic/focus.test.ts`)
avec un décor à **trois** familles — mesurée / générée-jamais-passée / jamais générée. Sabotage
joué : faire rendre au focus les seules `jamais_generees` → **5 tests rouges**.

### 🔴 Un verrou lexical « ne blâme pas l'enfant » refuse une phrase qui NIE le blâme — et il a raison

Le dialogue de retrait disait : *« Ce n'est pas un reproche : … pas parce qu'il ne l'a pas fait. »*
Le verrou de doctrine cherche `/n'a pas fait|oubli|néglig|retard/i` et l'a **refusée**.

Le réflexe est d'assouplir le motif pour accepter les formes niées. **C'est le mauvais réflexe** :
la phrase **nommait** le reproche pour le démentir, et démentir une accusation l'introduit.

→ **Parade** : réécrire la phrase pour qu'elle n'aborde jamais le sujet — dire la raison positive
(*« on retire un diagnostic quand il ne tombe plus juste »*) plutôt que nier la mauvaise. Le verrou
lexical **ne peut pas** distinguer l'affirmation de la négation, et c'est une bonne raison de ne
pas écrire la négation.

### ⚠️ `require_child` répond 403 à un rôle parent — il n'y a AUCUNE navigation Papa → Massimo

`auth/deps.py:55` : *« Accès réservé à l'espace de Massimo. »* Toute action qui prétend montrer à
Papa **la page de Massimo** est impossible en l'état — et pas seulement faute d'URL : le front Papa
n'a que `VITE_API_URL`, mais même avec un lien, les appels échoueraient.

→ **Parade** : ne pas écrire l'action. La décision produit qui la débloquerait est au `BACKLOG.md`,
et un test-verrou fige l'absence pour qu'elle reste une décision (`crans.test.ts`).

### ⚠️ Une condition « trop maligne » sur l'état vide — rattrapée par un test EXISTANT

En rendant l'état vide du rail honnête (« aucun sous ce filtre » ≠ « aucun dans le dépôt »), j'avais
ajouté une condition : ne rien dire si le bloc « Jamais généré » n'est pas vide. Raisonnement :
sous le focus `jamais-generees`, le rail est vide **par construction**, et annoncer « aucun » au
-dessus d'une liste de cinq serait contradictoire.

**C'était faux.** Les deux blocs ne comptent pas la même chose — l'un des **diagnostics**, l'autre
des **matières**. Ils se complètent. Un test existant (`état vide : aucune passation…`) est tombé
et a désigné l'erreur en une ligne.

→ **Parade** : condition simple, `entrees.length === 0`, avec la formulation qui dépend du filtre.
Et surtout : **quand un test existant tombe sur un raisonnement neuf, suspecter le raisonnement.**

### ⚠️ `avec_quiz` exclut les `rejected` — « jamais générée » devient faux dans un cas

`jamais_generees` et `a_un_diagnostic` sont calculés depuis `quizzes`, qui exclut déjà les refusés.
Une matière dont l'**unique** diagnostic a été rejeté compte donc comme « jamais générée », alors
qu'un diagnostic a bien existé.

**Non exercé** : les 15 diagnostics de dev sont `validated`, zéro `rejected`. À surveiller le jour
où un refus sera la seule histoire d'une matière.

### ⚠️ Le prompt de chantier donnait un chemin qui n'existe pas

`apps/frontend-papa/src/components/ConfirmDialog.tsx` — il n'y a **que son test** à cet endroit. Le
composant vit dans `packages/ui/src/components/confirm-dialog.tsx`, exporté par `@zetis/ui`, et son
test est resté dans l'app parce que **le setup Vitest vit dans `frontend-papa`, pas dans
`packages/ui`** (c'est écrit en tête du fichier de test).

→ **Parade** : le §5 du protocole — « aucun chemin inventé, vérifie l'existence réelle ». Un fichier
`X.test.tsx` sans `X.tsx` à côté n'est pas une anomalie dans ce dépôt : c'est le signe d'un
composant **partagé**.

## Chantier `fix/diagnostic-zone-c-mobile` — vérifier enfin le 375 px — 2026-08-08

### 🔴 `sm:` vaut 640 px — donc AUCUN téléphone ne l'atteint

La zone C portait `<span className="ml-auto flex flex-none flex-col gap-2 sm:flex-row">`. On lit
volontiers ce `sm:` comme « le cas mobile est traité ». Il ne l'est pas : **le palier `sm` de
Tailwind est à 640 px**, et le plus large des téléphones plafonne à 440. La branche « mobile » est
donc celle qui s'applique **en permanence**, sur tous les appareils.

Pire, la branche par défaut résolvait le problème **sur le mauvais axe** : elle empilait les boutons
verticalement (`flex-col`) tout en les laissant **à côté** du texte, avec `flex-none` qui leur
interdisait de rétrécir. Mesuré à 375 px : boutons **~171 pt**, texte **~102 pt** — *le texte avait
moins de place que les boutons*.

**Prouvé par bissection dans le vrai moteur**, pas lu dans une doc (Tailwind 4.3.2, aucun palier
redéfini) — mesure du `y` du bloc de texte et de celui des boutons :

| viewport | `y` texte | `y` boutons | même ligne ? |
|---|---|---|---|
| **639 px** | 970 | 1018 | **non** — branche téléphone |
| **641 px** | 994 | 997 | **oui** — branche tablette/bureau |

→ **Parade** : pour un empilement vertical sur téléphone, viser `flex-wrap` sur le conteneur +
`w-full` sur le bloc qui doit descendre, et `min-w-0` sur le bloc de texte qui doit pouvoir
rétrécir. Et **relire tout `sm:` comme « à partir de la tablette »**, jamais comme « sur mobile ».

### 🔴 Un défaut de mise en page ne se voit dans AUCUN test — ne pas simuler le contraire

jsdom n'embarque pas de moteur de rendu : `getBoundingClientRect` y renvoie des zéros. Aucun des
539 tests Massimo ne pouvait voir ce défaut, et aucun n'a bougé au correctif.

→ **Parade** : ne pas « combler » ce manque par un test qui compare des chaînes de classes Tailwind
— ce serait une tautologie, qui casserait au premier refactor **sans jamais voir le défaut**. La
preuve est la **mesure dans un vrai moteur** (capture d'écran + `getBoundingClientRect` lu dans le
navigateur), consignée dans le commit et la PR.

### ⚠️ `resize_window` fonctionne — il ne fonctionnait pas le matin même

La dette « 375 px jamais vérifié » avait pour motif que `resize_window(390×844)` laissait
`window.innerWidth` à **2572**. Le même jour, sur le panneau Browser, il obéit : `innerWidth` lit
**393** puis **375**, demandés et vérifiés.

→ **Parade** : mesurer `window.innerWidth` **après** chaque `resize_window` plutôt que supposer
l'un ou l'autre. Ce genre de dette n'a plus d'excuse d'outillage.

### 🔴 Aucun serveur de dev n'est joignable depuis un vrai téléphone — quatre choses, ENSEMBLE

Les huit paires de `.claude/launch.json` liaient `127.0.0.1`. Un iPhone ne peut atteindre aucun de
leurs ports, **quelle que soit l'URL tapée**. Il faut changer quatre choses à la fois, et il en
manque toujours une : uvicorn `--host 0.0.0.0`, vite `--host 0.0.0.0`, `VITE_API_URL` sur l'IP du
Mac (sur `localhost`, **le téléphone appellerait son propre localhost**), et l'origine LAN dans
`ZETIS_CORS_ORIGINS`, que le défaut (`:5173`/`:5174`) n'a pas.

⚠️ **Et le piège de l'adresse** : le Mac a une route par défaut sur `en10` (filaire, `192.168.0.x`)
et son Wi-Fi sur `en0` (`192.168.50.x`). On relève par réflexe l'adresse de la route par défaut —
et le téléphone, qui est en Wi-Fi, ne la joint pas.

→ **Parade** : la paire `backend-lan` / `massimo-lan` (commit `e6fb2f5`) résout l'IP **sur `en0`**
au lancement. Vérifier par `lsof -nP -iTCP:<port> -sTCP:LISTEN` que le socket est sur `*` et non
`127.0.0.1`, puis `curl` l'IP Wi-Fi — et tester une origine CORS **non accordée** pour prouver que
l'autorisation n'est pas vide.

### ⚠️ Le clavier physique du simulateur iOS ignore la disposition du clavier actif

Sur un Mac AZERTY, le simulateur interprète les frappes en **QWERTY** : `massimo1234` arrive en
`,qssi,o&é"'`. Passer « Français » dans *Réglages › Général › Clavier › Clavier physique* **n'a rien
changé** — le clavier matériel court-circuite ce réglage.

→ **Parade** : pour saisir dans un simulateur, soit **⇧⌘K** (débranche le clavier matériel, le
clavier iOS à l'écran devient WYSIWYG), soit `xcrun simctl pbsync host <udid>` puis coller, soit
choisir une valeur dont **toutes les lettres occupent la même touche** sur les deux dispositions
(`t·e·s·t` oui ; `a`, `q`, `z`, `w`, `m` et tous les chiffres non).

### ⚠️ `xcode-select` mal pointé bloque TOUTE l'intégration simulateur — mais pas `simctl`

`attach` **et** `tap` échouent avec « Xcode is installed but not selected ». Le correctif exige
`sudo`, donc l'humain. En revanche `xcrun simctl` (create / boot / openurl / io screenshot) marche
sans lui : on peut lancer et capturer, mais **pas injecter d'entrée**.

→ **Parade** : `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. En attendant,
`simctl` suffit pour tout sauf le clic — et une page derrière `RequireAuth` est donc hors d'atteinte.

### 🔴 TROIS défauts de la page de CONNEXION — corrigés le jour même (PR #102, squash `d4c618d`)

1. **`secrets.compare_digest` lève sur du non-ASCII** (`modules/auth/service.py:19`) →
   **HTTP 500** au lieu de 401. Le 500 casse la réponse avant les en-têtes CORS, donc le front
   n'affiche qu'un **« Load failed »** qui accuse le réseau. Sur un clavier français, un accent dans
   une saisie ratée est banal.
2. **L'œil qui révèle le mot de passe le rend intaisissable sur iOS** — `LoginScreen.tsx:125` passe
   en `type="text"` **sans `autoCapitalize="none"` ni `autoCorrect="off"`**. iOS majuscule la
   première lettre, sans recours. Le geste censé aider est celui qui bloque.

3. 🔴 **Et un TROISIÈME, que le read-before-code a seul trouvé : le champ Identifiant n'a pas de
   `type`** — c'est donc `text`, donc auto-capitalisé **en permanence**, sans qu'aucun geste soit
   nécessaire. `massimo` devient `Massimo`, la connexion échoue, et l'enfant lit « Identifiants
   invalides » sans pouvoir l'expliquer. Il ne s'était **jamais montré** parce que Safari
   pré-remplissait le champ. Le plus grave des trois — et invisible à l'écran, par construction.

→ **Parade appliquée** : encoder les deux opérandes en bytes avant `compare_digest` ;
`autoCapitalize="none" autoCorrect="off" spellCheck={false}` sur **les deux** champs, pas
seulement celui à bascule. **Aucun test jsdom ne verra les défauts 2 et 3** : clavier système.

### 🔴 Ce que le sabotage a révélé de l'ANCIENNE suite d'auth — la leçon la plus transférable

Retirer l'encodage fait rougir les 4 nouveaux verrous non-ASCII. Mais **les 6 autres tests restent
VERTS**, `test_login_bad_password` compris — un test qui existait déjà et qui était censé couvrir
« mot de passe refusé ».

**Cause** : il essaie « `wrong` », de l'**ASCII pur**. `compare_digest` ne lève que sur du
non-ASCII. Le test couvrait donc la **forme d'erreur qu'il avait choisie**, pas la classe d'erreur
qu'il prétendait couvrir — et le défaut est parti en production sous une suite verte.

→ **Parade** : quand un test couvre un « cas d'erreur », se demander **quelles autres formes** cette
erreur peut prendre (encodage, longueur, type, vide, unicode) — et si le refus doit être *un statut
précis*, l'asserter comme tel. Ici le verrou ne dit pas « c'est refusé » mais **« c'est refusé par
un 401 propre, jamais par une erreur serveur »** : un endpoint d'authentification qui s'effondre
sur une entrée arbitraire est un défaut à part entière.

## Chantier `feat/diagnostic-massimo-propose` — ADR-0044, Sessions B et C — 2026-08-08

### 🔴 Un compteur de NON-FAITS traverse les cinq verrous de `test_news_doctrine.py`

Le témoin `diagnostic` (diagnostics relus non passés) **meurt du travail**, donc il tombe dans la
colonne « Arriéré » que l'ADR-0030 §1 interdit. Il a pourtant passé **les cinq tests** du fichier
bâti contre exactement ça — celui dont l'en-tête dit *« un échec ici ne se répare pas en ajustant
l'assertion »*.

**Cause** : ces tests interrogent le **TEMPS** (« une échéance change-t-elle ce nombre ? »), et
aucune date n'entre dans ce compteur. La règle a **deux** dimensions — naissance ET mort — et le
fichier n'en verrouillait qu'une. Le garde-fou écrit dans `NewsSummary` (« appliquer le test du
§1 ») souffrait du même angle mort.

→ **Parade** : `completed_at` et `taken_at` sont entrés dans `FORBIDDEN_TOKENS` (ils manquaient :
n'importe quel compteur pouvait compter du non-fait sans être vu), un dict `DEROGATIONS` enregistre
l'exception unique, et trois tests la bornent — dont un qui exige que **l'ADR cité existe
réellement sur disque**. Poser les DEUX questions avant d'ajouter un témoin.

### ⚠️ Un verrou de dérogation détecte qu'une branche est en retard sur `main`

Le test « la dérogation cite un ADR qui existe » a échoué non pas sur le code, mais parce que
l'addendum vivait **sur `main` seul** : la branche avait été créée avant, et rien ne les avait fait
se rencontrer. La session codait contre un cadrage absent de sa propre branche.

→ **Parade** : un verrou qui vérifie l'existence d'un fichier de décision est aussi un détecteur de
dérive. Et `git merge origin/main` **avant** de coder, jamais après.

### ⚠️ `git commit --no-edit` sur un MERGE aplatit les commentaires du gabarit dans le sujet

Le message est devenu `Merge remote-tracking branch 'origin/main' … # Please enter a commit message
to explain why this merge is necessary, # especially if…`.

→ **Parade** : `-m` sur un merge, pas `--no-edit`. Corrigeable par `--amend` tant que ce n'est pas
poussé.

### 🔴 Deux gardes qui se couvrent l'une l'autre rendent chaque sabotage isolé VERT

Le verrou « aucune route élève ne sert de score » est resté vert sur **deux** sabotages : service
qui rend la lacune brute (Pydantic la filtre), et `response_model` retiré (le service projette
déjà). C'est leur **conjonction** qui fuit, et elle est rouge.

→ **Parade** : quand deux gardes protègent la même chose, un sabotage sur une seule est un **no-op**
— il faut saboter les deux. Un vert isolé ne dit rien de la force du verrou.

### ⚠️ `toLocaleDateString("fr-FR")` écrit « 1 juillet », pas « 1er juillet »

Défaut vu **à l'écran** sur une vraie passation du 1er juillet ; aucun des 539 tests ne pouvait le
signaler — ils vérifiaient qu'une date s'affiche, pas qu'elle soit en français correct.

→ **Parade** : suffixe `1er` à la main sur `getDate() === 1`.

### 🔴 Une notion peut être une FORCE et une lacune À RENFORCER sur le même écran

Vu à l'écran : *« Tes forces : Temps du récit »* puis *« Notion à renforcer : Temps du récit »*.

**Cause structurelle** : les deux listes ne parlent pas du même moment. Les forces viennent de
**cette passation** ; les lacunes sont **lues en base** (ADR-0043 §5), et 🔴 **rien ne referme une
lacune quand la notion est réussie** — le seul écrivain de `status = "resolved"` dans tout le dépôt
est `missions/service.py`. Une lacune ouverte par une passation ratée survit donc à sa remesure.

→ **Parade** : filtre d'**affichage** côté enfant (la lacune reste ouverte, Papa la voit). Faire
refermer ses lacunes au diagnostic serait un changement de cycle de vie — donc un ADR — et
laisserait un diagnostic à 2 questions réussi par chance effacer une vraie lacune.

### ⚠️ Un `<Link>` ajouté à une page casse ses tests sans contexte Router

`render(<DiagnosticPage />)` lève dès que l'écran contient un `<Link>`.
→ **Parade** : envelopper dans `<MemoryRouter>` — un helper `afficher()` évite de le répéter.

### ⚠️ `MissionsPage` n'accepte AUCUN lien profond, contrairement à `/revision?subject=`

Envoyer `/missions?subject=x` serait inventer un paramètre que la page ignore — un no-op silencieux.
→ **Parade** : vérifier `useSearchParams` dans la page cible avant de fabriquer une URL.

### ⚠️ Le panneau d'aperçu rebondit sur la connexion ; `resize_window` n'a pas d'effet mesurable

La page derrière `RequireAuth` renvoie à l'écran de login dans le panneau (stockage propre).
Et via `claude-in-chrome`, `resize_window(390×844)` a laissé `window.innerWidth` à **2572** —
donc **le 375 px n'est pas vérifiable par ce chemin**.
→ **Parade** : `claude-in-chrome` pour l'authentification (⚠️ **Browser 2** joint `localhost`,
**Browser 1 non**), et **mesurer `innerWidth`** plutôt que croire un redimensionnement.

## Chantier `feat/diagnostic-massimo-propose` — ADR-0044, Session A (contrat de liste) — 2026-08-08

### 🔴 `graphify affected` rend « No affected nodes found » sur une fonction réellement appelée

`graphify affected "list_diagnostics"` répond **« No affected nodes found »** alors que
`diagnostics/router.py` l'appelle démonstrativement (`service.list_diagnostics`). La commande est
pourtant celle que `/slice §1bis` impose **avant de modifier une fonction partagée**, et sa réponse
vide se lit comme « personne ne l'appelle, tu peux y aller ».

**Cause** : l'extraction AST ne relie pas l'appel qualifié par le module (`service.f()`) au nœud de
la fonction. À rapprocher du piège déjà consigné sur `graphify explain`, qui rend **un** nœud quand
plusieurs portent le nom, sans prévenir.

→ **Parade** : une réponse **vide** de `affected` n'est pas une preuve d'absence d'appelant. La
confirmer par `grep -rn "<nom>"` avant d'en tirer un périmètre de non-régression. Ici, ce sont les
`grep` qui ont donné les vrais consommateurs — dont le fait, décisif, que **Papa n'appelle pas** la
route de liste.

### ⚠️ Le format ISO d'une date diffère entre SQLite (tests) et PostgreSQL (réel)

`datetime.isoformat()` sur une colonne `DateTime(timezone=True)` rend
`2026-07-05T23:15:38.510826+00:00` sur PostgreSQL et un ISO **sans offset** sur SQLite : le moteur
de test perd le `tzinfo` que Postgres conserve. Une assertion sur la chaîne **entière** passe donc
en test et ment sur le vrai moteur — ou l'inverse.

→ **Parade** : comparer sur le **préfixe de date** (`row["measured_at"][:10] == "2026-03-15"`),
qui est stable sur les deux moteurs, et vérifier le format complet **une fois** contre le vrai
PostgreSQL. C'est la face « lecture » du piège `to_utc` déjà consigné pour les soustractions.

### 🔴 Un décor à UN objet par matière aurait laissé passer le sabotage principal

Le verrou de la session — *`measured_at` est `null` ssi aucune notion du diagnostic n'a jamais été
mesurée* — devait résister à deux sabotages. Le second (agréger par `subject_id` au lieu des
notions du diagnostic, le raccourci tentant) **est invisible si le décor ne contient qu'un
diagnostic par matière** : les deux calculs rendent alors la même valeur.

→ **Parade** : le décor pose **trois diagnostics dans la MÊME matière**, sur des notions
différentes, avec des dates distinctes et non extrêmes. Sous sabotage, les trois s'écrasent sur la
date la plus récente et deux assertions rougissent. **La propriété que le décor doit avoir se
déduit du sabotage qu'on veut rendre visible**, pas du confort d'écriture.

### ⚠️ Une assertion de valeur ne dit rien si l'objet est ABSENT de la réponse

`assert rows[id]["measured_at"] is None` sur une liste indexée par identifiant lève un `KeyError`
quand l'objet manque — le test rougit, mais **par accident**, et le message ne dit pas la vérité.
Or c'est exactement ce que produit le premier sabotage (jointure gauche → interne) : le diagnostic
jamais mesuré **disparaît** au lieu de sortir avec `null`.

→ **Parade** : affirmer d'abord la **présence** (`set(rows) == set(ids)`, avec message), puis les
valeurs. Deux assertions, deux échecs distincts, deux diagnostics lisibles.

## Chantier `feat/diagnostic-mesure-qui-engage` — ADR-0043, le diagnostic sort de l'évaluation éphémère — 2026-08-08

### 🔴 Un sabotage resté VERT — et les deux causes se cumulaient

`test_submit_et_results_notent_la_MEME_passation_pareil` (le verrou de l'extraction) est resté vert
quand on a fait recompter le score à `submit`. **Cinquième occurrence du motif dans ce dépôt.**

**Cause 1 — décor dégénéré.** Le test répondait *tout faux*, donc chaque score valait `0`. À zéro,
une divergence **multiplicative** est indétectable : `0 × k = 0` pour tout `k`.
→ **Remède** : un verrou de valeur se pose sur un point **ni plancher ni plafond**. Le décor répond
maintenant partiellement (3 bonnes sur 5 → **60 %**) et affirme la valeur exacte.

**Cause 2 — sabotage mathématiquement neutre.** Le sabotage choisi arrondissait à la dizaine. Or à
5 questions par notion, **tout score est un multiple de 20** : `int(x/10)*10` est l'**identité** sur
ces valeurs. Le sabotage ne prouvait rien, ni dans un sens ni dans l'autre.
→ **Remède** : un sabotage doit produire une valeur **atteignable différente**. Rejoué avec
`+20 points`, le verrou rougit.

> **Ce qu'il faut retenir** : un sabotage vert a deux explications possibles — le verrou est faible,
> **ou le sabotage est un no-op**. Vérifier la seconde avant de conclure sur la première.

### ⚠️ Les compteurs d'appels de `vi.fn()` s'ADDITIONNENT entre tests

`expect(fetchResultDetail).toHaveBeenCalledTimes(1)` rendait « 9 fois », et
`.not.toHaveBeenCalled()` rendait « 7 fois » — sur des tests qui n'appelaient rien.

**Cause** : le front n'active pas `clearMocks`, et `mockResolvedValue()` en `beforeEach` **ne remet
pas l'historique à zéro**. Les compteurs cumulent sur tout le fichier.
→ **Remède** : `vi.clearAllMocks()` en tête de `beforeEach`. Toute assertion qui **compte** des
appels est fausse dès le second test sans lui.

### ⚠️ `to_utc` avant toute soustraction de dates — sinon ça marche en prod et plante en test

`(datetime.now(timezone.utc) - attempt.completed_at)` → `TypeError: can't subtract offset-naive and
offset-aware datetimes`, sur **9 tests d'un coup**.

**Cause** : SQLite **perd le `tzinfo`** d'une colonne `DateTime(timezone=True)` là où PostgreSQL le
conserve. Le pire des deux mondes : rouge en test, vert en prod.
→ **Remède** : `from app.modules.activity.timeutils import to_utc`, qui existe et documente
exactement ce cas. Ne pas en écrire un quatrième — quatre modules le réimplémentaient déjà.

### 🔴 Le test lexical `test_system_is_reserved_to_quizzes` strippe les COMMENTAIRES, pas les DOCSTRINGS

Le cadrage annonçait : *« il est lexical — une simple mention dans un **commentaire** le
déclenche »*. **Faux.** Le scan fait `line.split("#", 1)[0]` : les commentaires `#` sont retirés
avant analyse.

**Ce qui piège vraiment, ce sont les docstrings** — elles n'ont pas de `#`, donc rien ne les
retire. C'est exactement ce qui avait cassé le verrou lexical de l'ADR-0042.
→ **Remède** : en écrivant une docstring dans `app/modules/**`, ne jamais mettre sur la même ligne
les deux mots que ce scan cherche.

### ⚠️ Une nouvelle famille de `/relecture` se borne par MATIÈRE, pas par leçon

Un diagnostic a `subject_id` et **rien d'autre** : `chapter_id` et `lesson_id` sont `NULL` par
construction. Le passer par `_derivative_query` (qui joint la leçon) aurait rendu **zéro ligne en
silence**.
→ **Remède** : le patron à copier est `_capsules_query`, pas `_derivative_query`. C'est le même
trou que `_chapter_in_year` documente pour les chapitres orphelins, transposé d'un cran.

### ✅ Le `Literal` Pydantic fermé a fait rougir la 6ᵉ famille AVANT l'écran

`ResponseValidationError: Input should be 'lesson', 'fiche', 'mindmap', 'capsule' or 'chapter'` —
la famille `diagnostic` a été refusée par le contrat avant d'atteindre la page.
→ **À garder** : `ReviewKind` est un `Literal` fermé et non un `str` libre. Un `str` aurait laissé
passer la famille avec des compteurs incohérents, découverts à l'écran ou jamais.

### 🔴 `git checkout <fichier>` EFFACE le travail non commité — payé DEUX fois

Utilisé pour restaurer après un sabotage, sur des fichiers dont les modifications n'étaient **pas
encore commitées**. `git checkout` restaure depuis `HEAD` : tout le travail de la session sur ce
fichier disparaît, sans avertissement.
→ **Remède** : pour un sabotage, **copier le fichier** (`cp f f.bak`) et restaurer par `cp`. Ne
jamais utiliser `git checkout` comme bouton « annuler » tant que le travail n'est pas commité.

### ⚠️ `useEstimatedProgress(active, expectedMs, startedAtMs)` exige un `number`, pas `number | null`

`EtatTravail.estimatedMs` est `number | null` (le serveur ne sait pas encore tant que le travail
est en file). Le passer tel quel casse `tsc`.
→ **Remède** : la forme d'appel du dépôt est celle de `SubjectDetailRow` — `active` inclut
`(etat?.estimatedMs ?? 0) > 0`, et `expectedMs` vaut `etat?.estimatedMs ?? 0`. La barre n'anime que
si le serveur a une durée à donner ; elle n'en invente jamais une (ADR-0041 §9).

### ⚠️ « Found multiple elements » — une notion est nommée à TROIS endroits

`screen.getByText("Symétrie centrale")` échoue : la notion apparaît dans le tableau de la station ①,
dans sa carte de lacune (station ②) **et** dans la portée.
→ **Remède** : scoper la requête (`within(table)`, `closest("section")`). Une requête globale
rendrait « multiple elements » aujourd'hui, et — pire — pourrait trouver la bonne **par accident**
demain.

### ⚠️ Le panneau navigateur : `file://` est bloqué, et les clics de modale sont instables

Ouvrir une maquette locale par `navigate` sur `file:///…` laisse l'onglet sur `about:blank`. Et les
clics par `ref` échouent en silence (espace de clic **800 px**, pas la largeur du viewport).
→ **Remèdes** : copier temporairement la maquette dans `apps/frontend-papa/public/` et l'ouvrir par
`http://localhost:5175/…` (puis la retirer) ; cliquer par **coordonnées** lues sur la capture ; et
pour un contenu de modale, **lire la source** plutôt que de se battre avec la couche de clic.

## Chantier `feat/notion-orpheline-equipable` — ADR-0042, la notion orpheline devient équipable — 2026-08-07

### 🔴 Le comptage de chapitres raté PAR L'INNER JOIN — en le cherchant

Première mesure : « 79 chapitres, tous rattachés à l'année ». **Faux.** La requête faisait un
`INNER JOIN` de `chapters` sur `school_year_subjects` — donc elle **supprimait exactement ce
qu'elle cherchait**. Compte réel : **80, dont 1 orphelin** (`id=10`, « Les fractions », validé,
0 leçon).

**`Chapter.school_year_subject_id` est nullable** : un chapitre peut vivre sous
`Subject → Theme → Chapter`, sans chemin direct vers une année.
→ **Remède** : accepter les **deux** chemins (`_chapter_in_year` le fait). Ce trou a coûté
l'ADR-0037 entier, puis a été retrouvé dans `lessons_by_skill` (addendum ADR-0034), puis ici — la
troisième fois **en le cherchant explicitement**.

### 🔴 Une docstring a cassé un test-verrou lexical

`test_equip_notion_signale_ses_pieces_dans_l_ordre_de_PIECES` scanne le source à la recherche de
`_signale("…")`. Une **docstring** contenant ce littéral l'a fait échouer.
→ **Remède** : reformuler la prose, **jamais** le test. Voir aussi l'entrée du chantier suivant :
ce scan retire les `#` mais pas les docstrings.

### ⚠️ pgvector `<=>` est une ERREUR DE SYNTAXE sur SQLite

Tout test qui sert un chunk RAG plante — et **aucun test du dépôt n'avait jamais servi un chunk
`validated` avec un embedding**, ce qui masquait le problème depuis l'origine.
→ **Remède** : une fixture qui patche **uniquement** `rag_service.search`, pas tout le module.

### ⚠️ `FakeEmbeddingProvider` n'est pas déterministe

Il s'appuie sur `hash()`, salé par `PYTHONHASHSEED` : tout test de **non-résolution** est flaky à
~50 %.
→ **Remède** : `Crc32EmbeddingProvider` (`app/tests/fakes.py`), stable d'un run à l'autre.

### ✅ Ce que seule l'EXÉCUTION RÉELLE a trouvé

Un quiz `mission`/`draft` **sans leçon** traînant en base de dev faisait répondre « déjà produit » à
`_has_mission_quiz` **sur le chemin normal** — ce qui aurait arrêté la génération de quiz sur toute
la base, en silence.
→ **Remède** : garde explicite (`if lessons_of_skill(...): return False` avant de consulter
l'ancrage notion), plus un test et son sabotage. **Sans la vérification en réel, ce défaut partait
en PR** : aucun test ne le voyait.

## Rejeu de scénario — `503` / Redis coupé (ADR-0041 §10) — 2026-08-07

> Dette qui traînait depuis **quatre** chantiers. Jouée sur `main`, hors chantier.

### ✅ Le contrat §10.1 est tenu — et la preuve est un TROU DANS LA SÉQUENCE

Redis arrêté, `POST /api/production/runs` rend **503 en 36 ms** — pas un 500, pas un blocage — avec
la phrase attendue : « La file de production est injoignable : rien n'a été lancé, et rien n'a été
créé. » Aucune ligne n'est commitée : 27 lots et 744 `ai_jobs`, identiques à la référence.

🔴 **Le signe qui prouve le rollback** : l'identifiant **49** a été alloué par la tentative puis
perdu ; la reprise a rendu **50**. Un trou dans la séquence est l'empreinte d'une transaction
correctement annulée — c'est ce qu'il faut chercher pour vérifier « l'objet n'est pas commité avant
que son enfilement soit acquis ». Compter les lignes ne suffit pas : il faut regarder la séquence.

`/activity` reste honnête pendant la panne : `worker_alive: false` — pas `null`, pas une valeur
fausse par accident. La bande affiche donc « ZETIS ne produit pas · aucun moteur de production
actif », ce qui est exact.

### ⚠️ Ne pas confondre les deux « rejeux »

- **Rejeu au niveau API** — ✅ joué : la même requête rend `202` en 79 ms dès Redis relancé.
- **Rejeu du §10.2** — ❌ **non joué** : deux tentatives sur échec transitoire **côté worker**
  (moteur injoignable, timeout), zéro sur échec structurel. L'exercer suppose de rendre Ollama
  injoignable pendant qu'un travail tourne.

### 🔴 Trois travaux ont dormi 4 h 50 en file sous un worker actif

Découvert par accident en drainant le lot de contrôle : les `ai_jobs` **743-745**, enfilés à 12:06,
étaient encore `queued` à 16:59 — et se sont exécutés d'un coup au démarrage d'un worker neuf, via
`scan_triggers`. **Rien à l'écran ne le disait.** C'est précisément ce que le §10.3 (« balayage des
travaux zombies ») existe pour empêcher. À creuser.

⚠️ **Effet de bord** : ce réveil a créé **6 leçons et rédigé 1 cours**. Démarrer un worker n'est
donc pas un geste neutre sur cette base — il rejoue tout ce qui dort.

### ⚠️ Le navigateur ment sur la latence

Deux tentatives d'appel depuis Chrome ont expiré à **45 s**, ce qui m'a fait écrire que « la route
ne tombe pas vite ». C'était faux : la route répond en **36 ms**. Les blocages venaient de l'onglet
(CDP `Runtime.evaluate` figé), pas du backend. **Mesurer une latence serveur depuis le shell**, ou
lancer la requête sans l'attendre et relever le résultat ensuite.

## Chantier `feat/animations-engrenages-dossier` — les deux objets de la bande changent de dessin — 2026-08-07

> Spec : `docs/frontend-papa/bande-de-production.md`, § « Le mouvement » et § « Le dossier de
> connaissance ». Pas d'ADR : la métaphore de l'`adr-0041` §682 est **conservée**, seule la forme
> change. Maquettes : `docs/frontend-papa/mockup/{gears-spinner,knowledge-folder}.tsx`.

### 🔴 En Tailwind v4, `color: inherit` sur une classe BAT `text-*`

**Symptôme.** Les engrenages restaient gris alors que `text-papa-accent-2` était bien posé sur
l'élément. Conséquence réelle : **l'ambre de l'arrêt ne les atteignait plus** — le signal le plus
lisible de la bande, perdu sans qu'un test puisse le voir.

**Cause.** Tailwind v4 met ses utilitaires dans un `@layer`. Une règle de classe écrite **hors
couche** (dans `index.css`, à côté des keyframes) gagne à spécificité égale, quel que soit l'ordre.
`.zx-gears { color: inherit }` écrasait donc `.text-papa-accent-2`.

**Parade.** Ne **jamais** déclarer `color` sur un composant qui doit recevoir son ton par utilitaire.
`color` s'hérite tout seul : la déclarer ne sert qu'à la bloquer. Vérification :
`getComputedStyle(el).color` doit rendre le jeton attendu, pas le gris hérité.

### 🔴 `background: currentColor` et `color:` sur la MÊME règle rendent l'élément invisible

**Symptôme.** La pastille de comptage du dossier : fond et texte calculaient exactement la même
couleur sombre.

**Cause.** `currentColor` se résout sur la couleur **finale** de l'élément. Poser `color:` dans la
même règle change donc aussi ce que `background: currentColor` va donner.

**Parade.** Séparer en deux éléments : le parent prend `background: currentColor` (et hérite du
ton), l'enfant porte le `color` contrastant. Ni `var()` ni une variable intermédiaire ne s'en
sortent — la substitution reste résolue sur l'élément consommateur.

### 🔴 Un composant qui MÉMORISE son compte d'arrivée avale ce qui précède son montage

**Symptôme.** « L'animation du dossier ne semble pas fonctionner » — signalé par l'humain, invisible
pour 655 tests.

**Cause.** La bande **repliée** et la bande **dépliée** sont deux branches de rendu distinctes : le
composant est donc démonté puis **remonté** au premier sondage qui voit un lot. Avec
`useRef(count)` comme référence, tout ce qui a été produit avant ce sondage est perdu. Sur un lot
court, c'est le lot entier — le lot 44 a duré **13 s** pour **une** pièce neuve, sondé toutes les 4 s.

**Parade.** `useRef(0)`. Au remontage, ce qui est déjà déposé se rejoue (borné) : ces pièces ont
réellement atterri. **Test-verrou** : monter le composant directement sur un état non nul et exiger
l'animation — il était rouge avant le correctif.

### ⚠️ Six verrous sur un attribut ne prouvent pas que la chose animée est dessous

`[data-tourne]` porte l'animation, et six tests l'interrogent. Aucun ne vérifiait que les engrenages
sont **dans** le porteur. Le CSS de la maquette animait en permanence : branché tel quel, la bande
aurait tourné à l'arrêt pendant que les six restaient verts. **Démontré par sabotage** — sortir les
engrenages du porteur laisse les six au vert et ne rougit que le septième.

**Parade.** Quand un attribut porte un comportement, verrouiller **la relation**
(`[porteur] .chose`), pas seulement la présence de l'attribut.

### ⚠️ `~/Downloads` est inaccessible à ce processus (macOS)

`Read`, `head` **et** `cp` échouent tous en `Operation not permitted`, y compris sandbox désactivée.
Chrome sur `file://` (protocole non supporté par l'outil) et le `/@fs/` de Vite (`403 Restricted`,
`server.fs.allow`) échouent aussi. **Cinq voies, cinq refus** : la copie est à faire par l'humain,
ou le contenu à coller. Ne pas perdre de temps à chercher un contournement.

### ⚠️ Rappel repayé : un onglet CACHÉ ne sonde pas — mesuré à 0 appel en 14 s

Deuxième session consécutive à payer ce piège (cf. section `feat/popover-en-toutes-lettres`
ci-dessous). **Vérifier `document.visibilityState` AVANT de conclure quoi que ce soit** sur une
animation qui paraît morte. `hidden` ⇒ minuteurs à ~1/minute ⇒ le sondage à 4 s ne tourne pas.

### ⚠️ « Éligible » ne veut toujours pas dire « a du contenu à produire »

Le lot 46 (9 notions éligibles, 45 pièces) a rendu `generated=0 skipped=45` **en 1 seconde**. La base
de dev est saturée : les notions éligibles ont déjà leurs pièces, et celles qui manquent de pièces
ne sont pas éligibles (leçon sans cours écrit → `blocked`).

**Recette pour prévoir le rendement d'un chapitre — VALIDÉE le 2026-08-07** : prédiction de
**7 pièces** sur le chapitre 3, obtenu **7** (`fiche ×1`, `mindmap ×1`, `quiz ×1`, `srs ×4`) en 58 s.
Contre-épreuve : après le lot, elle rend 0 sur ce chapitre.

Croiser l'**éligibilité** — `GET /api/production/runs/preview?chapter_id=N`, entrées à
`reason: null` — avec le **manque réel** en base, en respectant **deux règles qu'une première
version de cette recette avait ratées** :

🔴 **1. `cours`, `fiche`, `mindmap` et `quiz` sont PAR LEÇON ; seul `srs` est PAR NOTION.** Compter
en notions sur-estime massivement : le lot 47 avait **4 notions éligibles** … **sur une seule
leçon**, d'où `fiche generated ×1 / skipped ×3`. Quatre notions ne rendent pas 20 pièces, mais 3.

🔴 **2. Le cours doit être ÉCRIT, pas seulement `status = 'validated'`.** Une leçon validée mais à
`content_markdown` vide ne dérive rien — elle produit des `blocked`. C'est le piège déjà consigné le
2026-08-04 (« 39 leçons `validated` VIDES font mentir le motif du gate ») ; la première version de
cette recette est retombée dedans et prédisait 3 pièces sur le chapitre 14 là où le lot 44 n'en a
produit **qu'une**.

```sql
-- rendement = dérivés manquants (par leçon À COURS ÉCRIT) + cartes manquantes (par notion)
WITH eligibles(skill_id) AS (VALUES (…)),   -- ← ce que rend runs/preview, reason IS NULL
lecons AS (
  SELECT DISTINCT l.id FROM eligibles e
  JOIN lesson_skills ls ON ls.skill_id = e.skill_id
  JOIN lessons l ON l.id = ls.lesson_id
  WHERE coalesce(l.content_markdown, '') <> ''          -- 🔴 la règle 2
)
SELECT (SELECT count(*) FILTER (WHERE f.id IS NULL)
             + count(*) FILTER (WHERE m.id IS NULL)
             + count(*) FILTER (WHERE q.id IS NULL)
        FROM lecons
        LEFT JOIN fiches   f ON f.lesson_id = lecons.id
        LEFT JOIN mindmaps m ON m.lesson_id = lecons.id
        LEFT JOIN quizzes  q ON q.lesson_id = lecons.id)
     + (SELECT count(*) FROM eligibles e
        WHERE NOT EXISTS (SELECT 1 FROM spaced_review_cards c WHERE c.skill_id = e.skill_id))
     AS rendement;
```

⚠️ Et les 5 événements d'une notion sont commités **ensemble** : `pieces_produced` monte par
paliers, donc l'animation part en rafale, jamais en continu.

## Chantier `feat/popover-en-toutes-lettres` — le détail de production se lit d'un trait — 2026-08-07

> Spec : `docs/frontend-papa/bande-de-production.md`, § « Le détail — un popover ».
> Pas d'ADR : précision du §23 de l'addendum 2, pas une révocation.

### 🔴 Un onglet en arrière-plan ne SONDE PAS — et la bande paraît figée

**Symptôme.** L'API dit qu'un lot tourne à 78 % ; le DOM de la bande est vide. Rechargement,
attente de 6 s, nouvelle lecture : toujours vide. On soupçonne le hook, le composant, le poll —
tout sauf la bonne cause. **Payé deux fois dans la même session.**

**Cause.** Chrome **limite les minuteurs à un par minute** dans un onglet qui n'est pas au premier
plan. `useProductionActivity` sonde par `setInterval(…, 4000)` : le sondage ne tourne
pratiquement pas. Le même mécanisme explique une observation voisine du chantier précédent —
`ResizeObserver` ne délivre rien tant que l'onglet ne **peint** pas.

**Parades**, dans l'ordre de coût :

1. **Recharger la page** (`navigate` vers la même URL) : le remontage déclenche une lecture
   **immédiate**, sans attendre l'intervalle. C'est la parade la plus fiable.
2. **Prendre une capture d'écran** : elle force un paint, ce qui réveille `ResizeObserver` et les
   animations. Ne réveille PAS les minuteurs.
3. Piloter le DOM par `element.click()` plutôt que par coordonnées : un popover ouvert peut avoir
   décalé la mise en page entre la capture et le clic.

⚠️ **Ne pas conclure « le sondage est cassé » depuis un onglet piloté.** L'écart entre l'API et le
DOM y est **normal** ; il ne l'est pas dans un onglet que l'utilisateur regarde.

### ⚠️ Un refus `already_produced` n'est persistable qu'en mode AUTONOME

**Symptôme.** `scan_requests` appelé pour provoquer ce refus rend
`« Le régime n'est pas "Autonome" — la production reste un geste de Papa »`, et **aucune** ligne
n'entre dans `production_refusals`.

**Cause.** Le gate de régime est évalué **avant** les régulateurs. Or `already_produced` ne
s'applique qu'aux lots-**pièce**, que seul `scan_requests` produit automatiquement — et lui seul
passe par ce gate. `scan_agenda` crée des lots de **chapitre**, hors de portée de ce régulateur.

**Conséquence à connaître** : ce refus-là ne s'observe de bout en bout qu'en mode autonome. Le
**rendu** se vérifie en écrivant la ligne par `refusals.record` ; la **persistance** se vérifie sur
`duplicate` ou `auto_volume`, qui n'ont pas cette contrainte. Les deux ensemble restent dus.

### ⚠️ Une base de dev trop équipée rend les lots inobservables

**Symptôme.** Un lot de 11 notions annoncé « 55 pièces » se termine en **quelques secondes**, avant
qu'on ait pu lire quoi que ce soit à l'écran.

**Cause.** Les contrôles d'écran successifs ont équipé la base : `equip_notion` **saute** toute
pièce déjà produite, en quelques microsecondes. `eligible` (qui passe le gate) n'est **pas**
« qui a du contenu à produire ».

**Parade.** Pour observer une production longue, il faut du contenu **neuf** — un chapitre encore
sans dérivés, ou des notions sans kit. `GET /api/production/runs/preview?chapter_id=N` donne
`eligible`, mais **ne dit pas** combien de pièces manquent réellement : c'est le piège.

---

## Chantier `feat/bande-de-production` — addendum 2 ADR-0041, la bande du header Papa — 2026-08-06

> ADR : `adr-0041-tout-ce-qui-produit-se-voit.md`, addendum 2. Spec :
> `docs/frontend-papa/bande-de-production.md`.

### 🔴 « Failed to fetch » sur le Journal ET les demandes — du code en avance sur son schéma

**Symptôme.** Deux pages Papa sans rapport apparent tombent en même temps sur `failed to fetch`.
Le backend répond pourtant `200` sur `/health`.

**Cause.** Une colonne (`production_runs.current_piece`) et une table (`production_refusals`)
avaient été ajoutées **au modèle SQLAlchemy et à une migration**, mais la migration n'avait pas été
appliquée à la base de dev. Le serveur `--reload` avait rechargé le nouveau code : à partir de là,
**toute requête touchant `ProductionRun` échouait** — d'où deux surfaces éloignées qui tombent
ensemble, ce qui égare le diagnostic.

⚠️ **`/health` ne prouve rien** : il ne touche aucun modèle. Et une route protégée rend `401`
**avant** d'exécuter son handler — un `401` ne prouve donc pas davantage que la requête passe. Le
seul contrôle utile est d'appeler le service directement :

```bash
.venv/bin/python -c "from app.db.base import SessionLocal; from app.modules.production import activity; print(activity.read(SessionLocal()))"
```

**Solution.** `.venv/bin/alembic upgrade head`. **Règle** : une migration écrite dans le même
commit qu'un changement de modèle doit être appliquée dans la foulée, sinon le serveur de dev
tourne en avance sur son schéma jusqu'au prochain redémarrage — et personne ne fait le lien.

### 🔴 Un identifiant de révision Alembic déjà pris — et `upgrade head` ne dit pas lequel

**Symptôme.** `alembic upgrade head` échoue avec *« Multiple head revisions are present »*, précédé
d'un `UserWarning: Revision d5e6f7a8b9c0 is present more than once`. Aucune migration n'est
appliquée, y compris celles qui n'ont rien à voir.

**Cause.** L'identifiant choisi à la main (`d5e6f7a8b9c0`) existait déjà —
`d5e6f7a8b9c0_validation_provenance.py`. Les identifiants du dépôt suivent un motif
alphanumérique lisible (`a1b2c3d4e5f6`…), ce qui rend la collision **probable**, pas exceptionnelle.

**Contrôle avant d'écrire une migration** :

```bash
grep -h "^revision" alembic/versions/*.py | sed 's/.*= *"//;s/".*//' | sort | uniq -d
```

⚠️ Ne pas se fier à un script maison qui cherche « la tête » en comparant `revision` et
`down_revision` : le premier écrit pour ce chantier a rendu **41 têtes**, sa regex ne gérant pas
toutes les formes d'annotation. La question « qui a X comme parent ? » (`grep -rl`) est fiable.

### 🔴 `tsc -b` seul rend EXIT=0 sur du code qui ne compile pas

**Symptôme.** Après avoir ajouté trois champs obligatoires à un type de `packages/types`,
`tsc -b` sort en `0`, sans une ligne. Trois erreurs réelles étaient masquées — dont un objet
littéral d'un hook auquel il manquait un champ.

**Cause.** Build **incrémental** : `tsc -b` se fie à ses `.tsbuildinfo` et ne revoit pas les
fichiers qu'il croit à jour quand seule une déclaration de type a changé.

**Solution.** `tsc -b --force` dès qu'un type partagé bouge. Complète la note déjà connue —
`tsc --noEmit` à la racine ne vérifie rien, seul `tsc -b` compte : il faut désormais lire
**`tsc -b --force`**.

### ⚠️ Deux tests du dashboard tombent autour de minuit — flakes pré-existants

**Symptôme.** `test_le_calendrier_reste_a_26_semaines_malgre_le_chargement_elargi` passe à 23 h 48
et échoue à 23 h 53, sur `assert jours` — la grille revient **vide**. Puis, une fois minuit passé,
**il redevient vert et c'est `test_l_avertissement_sur_la_jeunesse_de_la_courbe_peut_EXPIRER` qui
tombe à sa place**.

⚠️ **Cette alternance est la signature à reconnaître** : deux tests d'un même fichier qui se
relaient au rouge selon l'heure ne décrivent pas deux bugs, mais une seule frontière de date mal
tenue. Chercher la cause dans le second aurait coûté une heure pour rien.

**Attribution.** Vérifiée par `git stash` : le test échoue **aussi sans les changements du
chantier**. Il n'est pas une régression. Le test sème avec `datetime.now(UTC)` et borne avec
`date.today()` (heure locale) — les deux divergent près de minuit.

⚠️ **Toujours attribuer avant de corriger.** Un test rouge pendant un chantier n'est pas
nécessairement causé par lui, et `git stash push -u` suivi d'une relance donne la réponse en
trente secondes.

---

## Chantier `feat/progression-temps` — ADR-0040 « Progression dans le temps », Lots 0 à 3 — 2026-08-06

> ADR : `adr-0040-progression-dans-le-temps.md`. Lot 0 mergé à part (PR #92) ; Lots 1-3 sur
> `feat/progression-temps`.

### 🔴 Un LITTÉRAL n'est pas un verrou — attrapé DEUX fois le même jour

**Symptôme.** Deux tests rouges, tous deux pour une raison **sans rapport** avec ce qu'ils
protégeaient. Le premier comptait les occurrences du mot « lacune » dans un fichier
(`expect(interdits.length).toBeLessThanOrEqual(3)`) : l'ajout d'une colonne « Lacune » légitime les
a portées à 7. Le second épinglait `assert version == "v3"` : le Lot 3 a fait passer le prompt en
v4.

**Cause.** Dans les deux cas, le test asserte une **valeur** là où l'invariant est une
**propriété**. Le premier voulait dire « le mot ne qualifie que ce qui compte des `Gap` » ; le
second, « ce rapport ne porte pas la marque *rédigé sans historique daté* ». Ni un compte ni une
chaîne ne dit ça.

**Ce que ça coûte.** Un seuil se relève à chaque édition. Un test qu'on **ajuste** ne retient rien —
et il donne l'illusion d'une protection pendant tout le temps où il reste vert.

**Parade.** Asserter la propriété. Ici : que chaque colonne lit **SA** source
(`renforcer: (s) => s.notions.fragile`, `lacune: (s) => s.gaps_open`), et que l'écran dit que ce
sont deux mesures ; là : le prédicat que l'écran applique (`int(version.removeprefix("v")) >= 3`).

### 🔴 Un test peut GELER un bug aussi bien qu'un comportement

**Symptôme.** `expect(...).toHaveAttribute("href", "/programme")` — vert, stable, et il exigeait
l'URL **nue**.

**Cause.** Le lien n'avait jamais porté sa matière. Le test a figé cet état comme s'il était voulu.
Les huit lignes de la table menaient toutes à la matière ouverte par défaut, et **corriger** le lien
faisait rougir le test.

**Parade.** Quand un test rougit sur une correction évidente, se demander lequel des deux a raison
avant de « réparer » le test. Ici la bonne écriture était `"/programme?subject=6"`.

### 🔴 Une cible d'URL manquante est SILENCIEUSE, et `?subject=` n'a pas le même type partout

**Symptôme.** Signalé par le user à l'écran, jamais par un test ni une erreur : « les liens ouvrent
systématiquement `/programme` sur Français ».

**Cause.** `<Link to="/programme">` sans paramètre. La page d'arrivée lit `params.get("subject")`,
n'y trouve rien, et ouvre sa matière par défaut. **Aucune erreur, aucun log, aucun type en défaut.**

⚠️ **Le piège dans le piège** : le paramètre ne porte pas le même type selon la destination, et rien
dans son nom ne le dit.

| Destination | `?subject=` attend |
|---|---|
| `/programme`, `/couverture` | un **`subject_id` numérique** |
| `/lacunes`, `/conseil`, `/progression` | un **slug** |

Se tromper de type est tout aussi silencieux : la page ignore le paramètre et ouvre son défaut.

**Parade.** Un verrou générique en plus des verrous par lien : lister tous les `href` rendus par la
surface et vérifier qu'**aucun** n'est une route nue. Un futur lien ajouté sans paramètre rougira
sans qu'on ait pensé à lui.

### 🔴 `created_at.slice(0, 10)` lit de l'UTC — le piège de `toISOString()`, huit heures après l'avoir documenté

**Symptôme.** Aucun en test (les fixtures sont à midi). En production, un rapport généré à 23 h 30 à
Paris se serait affiché **la veille**.

**Cause.** Découper une chaîne ISO renvoie la date **UTC**, pas la date locale. Exactement ce que
`CalendrierFaits::isoLocal` documente en tête de fichier — écrit le matin même, reproduit l'après-midi
dans les pastilles d'historique du Conseil.

**Parade.** `new Date(iso).toLocaleDateString("fr-FR", …)`. Ne jamais découper une chaîne ISO pour
en tirer une date d'affichage.

### 🔴 Deux fonctions pour la même question, avec des réponses OPPOSÉES sur le cas limite

**Symptôme.** `evolutionSansHistoriqueDate` (dans la page) et `rapportSansHistoriqueDate` (dans la
lib) répondaient l'inverse sur une version illisible : `Number.isFinite(n) && n < 3` ne marquait
pas, `!Number.isFinite(n) || n < 3` marquait.

**Cause.** La seconde a été écrite pour les pastilles sans voir que la première existait déjà pour
le rapport ouvert. Un même écran aurait pu marquer une pastille et pas le rapport qu'elle ouvre.

**Parade.** Une seule implémentation, dans la lib, avec le **défaut sûr** : sur un doute, on
signale. Dire « ce rapport est fiable » sans le savoir est la faute que ce chantier corrige.

### ⚠️ Une assertion POSITIONNELLE se périme en silence

**Symptôme.** `cellules[cellules.length - 1]` valait 8 ; l'ajout d'une colonne l'a fait valoir 1.

**Parade.** Ancrer sur l'**en-tête** : chercher l'index de la colonne par son libellé, puis lire la
cellule à cet index. Une septième colonne ne déplacera plus rien.

### ⚠️ Restaurer depuis une sauvegarde de sabotage PÉRIMÉE efface le travail fait entre-temps

**Symptôme.** Deux éditions disparues sans bruit après un `cp /tmp/pp.bak fichier.tsx` de fin de
contre-épreuve. La sauvegarde datait d'un sabotage antérieur.

**Parade.** Reprendre la sauvegarde **juste avant chaque** sabotage, jamais réutiliser celle d'avant.
Et relire `git diff` après restauration.

### ⚠️ Le HMR de Vite remet l'état local à zéro entre deux clics

**Symptôme.** Deux clics successifs sur des cases du calendrier ne sélectionnaient rien. Le
comportement était correct au rechargement complet.

**Cause.** Une édition du composant entre les deux clics : le HMR le recharge et `useState` repart
de sa valeur initiale.

**Parade.** Recharger la page avant de conclure qu'un état ne tient pas.

### ⚠️ `tsc -b` attrape ce que les tests laissent passer

**Symptôme.** Aucun test rouge. `tsc` a signalé que l'entrée optimiste de `useCouncilClass` ne
portait pas le nouveau champ `prompt_version`.

**Ce que ça coûtait.** Le champ serait retombé sur `""`, que le client traite comme « antérieur au
daté » : un rapport qu'on **vient de générer** aurait affiché « rédigé sans historique daté »
jusqu'au rechargement. Aucun test ne couvre l'entrée optimiste.

**Parade.** Lancer `tsc -b` **et** la suite, toujours les deux. Ils n'attrapent pas les mêmes choses.

## Chantier `feat/memoire-quatre-vues` — la carte mémoire à 4 vues + 2 cartes focalisables — 2026-08-06

> ADR : `adr-0028-dashboard-papa-agregat-unique.md` (Amendement 3) et `adr-0028-dashboard-papa-agregat-unique.md` (Amendement 4).

### 🔴 Une refonte de composant peut faire DISPARAÎTRE une série servie, sans qu'un test rougisse

**Symptôme.** Aucun. La série `covered` (« notions couvertes par un cours validé », 222 en dev)
était toujours calculée, toujours servie dans le payload, toujours sommée par `sumSeries` — et
**plus affichée nulle part**. Trouvée par hasard **le lendemain**, en cherchant quelle carte
pourrait justifier un nouveau focus.

**Cause.** La carte a été réécrite d'un bloc, de trois courbes vers quatre vues. L'ancien tracé
portait `covered` ; aucune des quatre nouvelles vues ne l'a reprise. Rien ne pouvait le signaler :
tous les tests portent sur ce qui est affiché, **aucun ne vérifie qu'une donnée servie l'est
encore**. `tsc` est muet — un champ lu nulle part reste parfaitement typé.

**Ce que ça coûtait.** `covered` est la **seule mesure du dashboard qui relie la production aux
notions**. Sa disparition rendait la Chaîne de contenus orpheline.

**Parade.** Quand on réécrit un composant qui consomme un payload, **lister les champs consommés
AVANT et APRÈS** et comparer. Le compilateur ne le fera pas, les tests non plus.

### 🔴 `bucket_counts` fabrique un pic à gauche sur tout FLUX — piège absent des stocks

**Symptôme.** Silencieux, attrapé au test. Un mouvement vieux de 200 jours apparaissait dans le
**premier point** d'une fenêtre de 7 jours.

**Cause.** `bucket_counts` range chaque jour dans le **premier repère qui l'atteint** (`if day <=
mark: break`). Un jour antérieur à `marks[0]` satisfait donc le premier test et tombe dans le
bucket 0 au lieu d'être ignoré.

**Pourquoi c'était nouveau.** Les quatre séries existantes sont des **stocks** reconstruits par
`reconstruct_series` — rien n'y est bucketisé, le piège ne pouvait pas se manifester. Il est apparu
avec la première série de **flux** du module.

**Parade.** `projections.window_days(days, marks)` avant tout `bucket_counts` sur un flux, plus un
test dédié. **Vérifié par sabotage** : neutraliser `window_days` fait rougir le test.

### ⚠️ `keyof T` cesse de suffire dès qu'un champ du type n'est pas homogène

**Symptôme.** `sumSeries` sommait ses séries via `add(key: keyof DashboardSeries)`. En ajoutant
`reviews` — un **objet** `{again, hard, good, easy}` et non un `number[]` — `add("reviews")`
devenait typable alors qu'il rendrait n'importe quoi.

**Parade.** Un type conditionnel qui ne garde que les clés homogènes :

```ts
type NumericSeriesKey = {
  [K in keyof DashboardSeries]: DashboardSeries[K] extends number[] ? K : never;
}[keyof DashboardSeries];
```

⚠️ **Le type attrape l'OUBLI d'un champ, jamais sa JUSTESSE.** `sumSeries` déclare rendre un
`DashboardSeries` complet, donc un champ ajouté casse la compilation tant qu'il n'est pas sommé —
mais rien n'empêche de le sommer *depuis la mauvaise clé*. D'où un `toEqual` sur l'objet **entier**
avec un fixture aux valeurs **toutes distinctes** : des séries égales laisseraient passer une
permutation.

### ⚠️ Le HMR de Vite laisse un module CASSÉ quand l'usage précède l'import

**Symptôme.** Page blanche. Console : `ReferenceError: sumNotions is not defined`, suivi d'une
cascade de `NaN` dans les attributs SVG (`<path d="M34.0 NaN…">`, `<line y1="NaN">`) et de
« two children with the same key, NaN ».

**Cause.** L'appel `sumNotions(...)` a été ajouté dans une édition, son import dans la **suivante**.
Entre les deux, le HMR a rechargé un module qui plantait au rendu. Le composant jetait, React
démontait l'arbre, et les `NaN` en cascade venaient du `notionsTotal` jamais calculé.

**Parade — et c'est le vrai piège.** Le HMR **ne répare pas** un module qui a déjà planté au rendu :
il faut un **rechargement complet**. Et surtout : la console **conserve l'historique**, donc elle
montre encore ces erreurs longtemps après la correction. Pour savoir si un bug est **vivant**,
interroger le **DOM** (`chercher "NaN" dans les attributs des <svg>`), jamais la console.

### ⚠️ Quatrième occurrence — l'union gardée par un `Record`, pas par un tableau

Élargir le focus de la page à deux cartes (`PageFocus = DashboardFocus | DashboardCardFocus`)
rouvrait mot pour mot le bug du chantier précédent : un garde `isFocus` non élargi aurait refusé
`?focus=charge`, et la carte ne se serait **jamais** allumée, `tsc` muet.

Refermé du même geste : `FOCUSES` est un `Record<PageFocus, true>`. **Vérifié par sabotage** —
retyper la table en `Record<string, true>` (la forme exacte du bug d'origine) fait tomber 3 tests
sur 4. Voir l'entrée du chantier `feat/kpi-a-renforcer` ci-dessous pour le cas d'origine.

## Chantier `feat/kpi-a-renforcer` — le 5ᵉ KPI du dashboard Papa — 2026-08-05

> ADR : `docs/decisions/adr-0028-dashboard-papa-agregat-unique.md` (Amendement 2), écrit **avant** le code.

### 🔴 Une union qui pilote un comportement, gardée par un TABLEAU — le KPI est né inerte

**Symptôme.** Le nouveau KPI « À renforcer » s'affichait correctement, mais cliquer dessus ne le
mettait **jamais** en focus : `aria-pressed` restait à `"false"`. Aucune erreur, aucun test rouge,
`tsc -b` propre.

**Cause.** `useDashboard.ts` validait la valeur d'URL contre une liste blanche typée
`DashboardFocus[]` :

```ts
const FOCUSES: DashboardFocus[] = ["active_minutes", "active_days", "consolidated", "open_gaps"];
```

Élargir `DashboardKpis` (donc `DashboardFocus = keyof DashboardKpis`) a bien fait tomber
`KPI_LABELS` et `KPI_FOCUS_HINTS` — **des `Record`** — mais **pas cette liste** : un tableau de
`DashboardFocus` reste parfaitement **valide en étant incomplet**. Le clic écrivait bien
`?focus=fragile`, `isFocus` le refusait, `focus` retombait à `null`.

**Parade.** Typer la liste blanche en **`Record<DashboardFocus, true>`** et tester l'appartenance
par `hasOwnProperty` : l'omission devient une erreur de compilation.

> **La règle, à opposer au prochain ajout : le filet n'est pas dans l'union, il est dans le
> `Record` typé PAR l'union.** Troisième fois que cette leçon se paie ici — `DashboardPeriod`
> (fenêtre « Année »), `COUNCIL_PERIOD_LABEL` (le Conseil annonçait « Trimestre 1 » pendant que
> Papa regardait l'année), et celle-ci. Les deux premières étaient des `Record<string, …>` trop
> larges, celle-ci un tableau — même trou, trois habits.

### 🔴 `response_model` filtre la réponse HTTP en SILENCE

**Symptôme potentiel** (évité de justesse). `GET /api/parent/dashboard` est servie avec
`response_model=DashboardOut`. Un champ ajouté au dict de `build_dashboard` mais absent de
`dashboard/schemas.py` est **retiré de la réponse HTTP sans erreur ni avertissement** : le service
est juste, l'API ne sert rien, et un test qui appelle la fonction de service reste **vert**.

**Parade.** `schemas.py` fait partie du périmètre de tout ajout de champ — l'ADR l'avait oublié,
c'est le read-before-code qui l'a rattrapé. Et **tout verrou de contrat passe par la réponse HTTP**
(`client.get(...)`), jamais par le dict du service. Vérifié par sabotage : retirer `fragile` du
schéma fait tomber **3** tests.

### 🔴 Un verrou qui compare `sum(x)` à `sum(x)` — tautologique, et vert sous n'importe quel sabotage

**Symptôme.** L'ADR spécifiait le verrou « `kpis.fragile.value == Σ subjects[].notions.fragile` ».
Or `_periods` calcule justement la valeur du KPI **par cette somme même** : l'assertion est vraie
par construction et **ne peut pas tomber**.

**Parade.** Un verrou n'en est un que par un **ancrage extérieur au payload** : le test pose un
nombre connu de notions en base et l'écrit **en dur**.

⚠️ **Et l'ancrage doit DISCRIMINER.** Le premier valait `1` — or le fixture `_seed` pose aussi
**1** notion consolidée et **1** en cours : un KPI branché sur le mauvais segment serait resté
vert. Porté à **2** (une `weak` + une `learning`), il tombe. **Un ancrage qui coïncide avec une
autre grandeur du même fixture n'ancre rien.**

Prouvé par trois sabotages, tous rouges : mauvais segment (2 rouges), champ retiré du schéma
(3 rouges), delta non dérivé de la courbe (1 rouge).

### ⚠️ Une infobulle qui cite un autre KPI rend les noms accessibles AMBIGUS

`getByRole("button", { name: /À renforcer/ })` désigne **deux** boutons : l'infobulle de « Lacunes
ouvertes » contient la chaîne « À renforcer » — elle explique justement que les deux ne sont pas la
même mesure. Le nom accessible d'un bouton **concatène** ses descendants, `aria-label` compris.

**Parade.** Ancrer sur le début du libellé : `/^À renforcer/`.

### 🔴 `gh pr merge --delete-branch` bascule sur un `main` local périmé — tout le chantier a l'air d'avoir disparu

**Symptôme, spectaculaire.** La commande échoue sur `fatal : Pas possible d'avancer rapidement,
abandon.` / `! warning: not possible to fast-forward to: "main"`, et **tous les fichiers du chantier
reviennent à leur état d'avant** : `MEMORY.md` reparle du chantier précédent, les fixtures de test
perdent leurs nouveaux champs, le code du KPI n'existe plus.

**Rien n'est perdu.** Le merge côté GitHub a **réussi** — le squash est sur `origin/main`. Ce qu'on
regarde est un worktree que `gh` a basculé sur le `main` **local**, resté en arrière.

**Cause.** Le cadrage avait été commité sur `main` **local sans être poussé** : ce commit n'a atteint
le distant **que par la branche**. `main` local et `origin/main` avaient donc divergé. En supprimant
la branche, `gh` quitte la branche courante pour `main`, tente de l'avancer, et s'arrête là.

**Parade** (l'ordre compte — `reset --hard` écrase les fichiers modifiés hors chantier) :

```bash
git stash push -- <fichiers modifiés hors chantier>
git reset --hard origin/main
git stash pop
git fetch --prune          # la ref `origin/<branche>` survit à la suppression distante
```

**Prévention.** Vérifier `git rev-list --count origin/main..main` **avant** de merger : s'il n'est
pas à `0`, le `main` local a des commits que le distant n'a pas, et le merge se terminera dans cet
état. Le contrôle vaut aussi au moment du cadrage : un commit de doc sur `main` se **pousse**.

> ⚠️ **Ne jamais conclure « le travail est perdu » sur la foi de l'arbre de travail.** Le premier
> réflexe est `git log --oneline origin/main` et `gh pr view <n> --json state,mergeCommit` — c'est
> le distant qui dit la vérité, pas les fichiers sous les yeux.

### ⚠️ Le focus transite par l'URL — la bascule n'est pas synchrone au clic

`toggleFocus` écrit dans les `searchParams`. Une assertion sèche juste après `fireEvent.click` lit
encore l'ancien `aria-pressed`. **Parade** : `await waitFor(() => expect(kpi).toHaveAttribute(…))`,
l'idiome déjà en place dans `DashboardPage.test.tsx`.

---

## Chantier `feat/souffle-focus-dashboard` — souffle, donut, créneaux, semaine en cours — 2026-08-05

> ⚠️ **Chantier sans ADR** (quatre demandes directes du user, jamais `/ouverture`). Les décisions
> sont dans `docs/frontend-papa/page-dashboard.md`.

### 🔴 Un test-verrou évident, vert sans rien vérifier — le `<title>` du SVG l'alimentait

Pour prouver que le centre du donut suit la matière filtrée, l'assertion naturelle est :

```tsx
expect(carte).toHaveTextContent("1h05");   // ← VERT même si le centre n'a pas bougé
```

`formatMinutes` sert **aussi** aux `<title>` des segments du donut : `Mathématiques — 1h05 · 33 %`
est dans le DOM que le centre affiche « 1h05 » ou « 3h20 ». Le test aurait verrouillé le `<title>`
en croyant verrouiller le centre.

**Parade** : viser les `<text>` du centre, et comparer la LISTE complète, pas une sous-chaîne.

```tsx
const centre = () =>
  [...screen.getByRole("img", { name: /Répartition/ }).querySelectorAll("text")]
    .map((t) => t.textContent);
expect(centre()).toEqual(["1h05", "Mathématiques", "sur 3h20"]);
```

> **Quatrième occurrence du motif dans ce dépôt** (cf. `contre-epreuve-mal-visee`). La forme est
> toujours la même : la valeur cherchée existe **ailleurs** dans le sous-arbre interrogé. Quand une
> fonction de formatage sert à deux endroits, une assertion textuelle ne distingue pas les deux.

### 🔴 `overflow-x: auto` rogne AUSSI en vertical — une infobulle en absolu y disparaît

La grille des créneaux vit dans un `<div className="overflow-x-auto">`. Par spécification, dès
qu'un axe n'est pas `visible`, **l'autre est calculé à `auto`** : `overflow-y` devient donc `auto`
lui aussi, et tout enfant positionné qui dépasse en haut ou en bas est coupé — sans avertissement,
sans barre de défilement visible si le contenu tient en largeur.

**Parade** : `position: fixed`, qui échappe au rognage — l'`overflow` d'un ancêtre ne clippe jamais
un descendant fixé. Les coordonnées viennent d'un `getBoundingClientRect()` au moment du survol.

⚠️ **La limite de la parade** : un ancêtre portant `transform`, `filter`, `perspective`, ou
`will-change` sur ces propriétés **crée un bloc conteneur** et reprend le fixé. Ici la carte reçoit
`saturate-50` quand elle est atténuée par le focus — la bulle y serait donc bornée à la carte. Cas
accepté (la carte est atténuée, on n'y survole pas), mais c'est le piège à connaître avant de
généraliser le patron.

### ⚠️ Une fixture qui ne remplit qu'une fenêtre casse en silence au premier test qui change de période

`slots` est un `Record<DashboardPeriod, number[][]>`. Une fixture qui n'écrit que `slots["7"]`
donne une grille **vide** dès qu'un test rend `?period=30` — sans erreur, sans exception : juste
56 cases « aucune séance » et une assertion qui échoue loin de sa cause.

**Parade** : poser la donnée sur les quatre fenêtres.

```ts
const poser = (s: DashboardSubject, slot: number, day: number, minutes: number) => {
  for (const p of ["7", "30", "90", "365"] as const) s.slots[p][slot][day] = minutes;
};
```

Vaut pour tout champ indexé par `DashboardPeriod` : `minutes`, `slots`, `series`,
`slots_outside_minutes`.

### ⚠️ Les coordonnées de `hover` du MCP navigateur sont dans l'espace de la CAPTURE

`mcp__claude-in-chrome__computer` avec `action: "hover"` attend des coordonnées dans le repère de
la **capture d'écran**, pas en pixels CSS. La capture est mise à l'échelle : 1568 px de large pour
un viewport de 1920 → facteur **×0,817**.

Un survol envoyé aux coordonnées lues par `getBoundingClientRect()` atterrit donc ailleurs, et la
conclusion naturelle — « l'infobulle ne marche pas » — est fausse.

**Parade** : mesurer en CSS puis multiplier par `largeur_capture / window.innerWidth`, ou repérer la
cible directement sur la capture. Le `zoom` du même outil prend en revanche `[x0, y0, x1, y1]`, deux
coins et non une origine plus des dimensions.

### ⚠️ Le panneau navigateur de la session est un navigateur SÉPARÉ de celui du user

`mcp__Claude_Browser__*` pilote un navigateur intégré, avec **sa propre session** : le user peut
être connecté dans son Chrome sans que ce panneau le soit. Ici, plusieurs minutes ont été perdues à
attendre une connexion qui n'arriverait jamais sur `:5175` — le user s'était connecté chez lui.

**Parade** : pour voir un écran **authentifié**, passer par `mcp__claude-in-chrome__*`, qui pilote
le vrai Chrome et hérite de ses sessions. Le panneau intégré reste bon pour tout ce qui ne demande
pas d'authentification (maquettes injectées, inspection CSS, vérification qu'une règle est livrée).

### ⚠️ La base de dev n'a AUCUNE minute par matière dans la plage 8 h–24 h sur les fenêtres longues

Sur `?period=365`, les 56 cases des créneaux sont vides : 91 % du temps actif est « hors matière »
(connexion, navigation, chat — sans `subject_id`, donc absent de `subject.slots`), et le reste tombe
hors de la plage horaire. La fenêtre courte, elle, porte des données.

**Conséquence pour la vérification** : un écran vide n'y prouve **rien** sur le rendu. Vérifier sur
la fenêtre par défaut, ou fabriquer la donnée — et si on intercepte `fetch` pour l'injecter,
**vérifier que les slugs matchent** : une interception qui ne matche pas rend la réponse inchangée
et donne l'illusion d'avoir testé.

### ⚠️ Découper une session en commits cohérents : figer d'abord, reconstruire en avançant

Découper a posteriori un travail qui touche les mêmes fichiers dans plusieurs chantiers n'est pas
faisable au `git add` par fichier, et `git add -p` est interactif donc indisponible.

**Patron qui marche**, entièrement non interactif et sans risque de perte :

1. `git add -A && git commit` sur un **commit jetable** — tout est dans Git, donc récupérable ;
2. `git reset --hard <base>` ;
3. pour chaque commit : `git checkout <jetable> -- <fichiers entiers>`, puis **réduire à la main**
   les fichiers partagés ; lancer les tests ; committer ;
4. dernier commit : `git checkout <jetable> -- .` ;
5. 🔴 **`git diff <jetable> HEAD` doit être VIDE** — c'est la preuve que la découpe n'a rien perdu.

Le point 5 est le seul contrôle qui vaille : il compare l'arbre final à l'état effectivement vérifié
à l'écran, au bit près.

## Chantier `fix/fenetre-branche-flat` — la fenêtre du constat `flat` (ADR-0038) — 2026-08-05

### ✅ Un `xfail(strict=True)` s'est refermé tout seul — le patron vaut d'être réutilisé

La divergence « le constat compte sur 730 j, sa preuve n'en sert que 366 » avait été inscrite en
`@pytest.mark.xfail(strict=True)` au lieu d'être rapportée en prose. Au moment de la correction :

```
[XPASS(strict)] Divergence RÉELLE, mesurée le 2026-08-05 : …
FAILED test_flat_ne_ment_pas_au_dela_de_la_fenetre_du_cahier
```

Le test **passe**, donc `strict=True` le rend **rouge**, et force le retrait du marqueur dans le
même commit. Le corps du test n'a pas bougé : ce qui prouvait le défaut verrouille sa correction.

> **Première fois dans ce dépôt qu'une dette se rappelle toute seule au moment exact où elle est
> payée.** Une dette décrite en prose se perd à la session suivante ; une dette en `xfail` strict
> ne peut pas pourrir en silence. À réutiliser pour toute divergence connue qu'on choisit de ne pas
> traiter tout de suite.

### ⚠️ Deux bornes justes chacune chez elle, et c'est leur RENCONTRE qui ment

Ni les 730 j (`p.HISTORY_DAYS`, nécessaires pour que les deltas des KPI soient vrais) ni les 366 j
(`ACTIVITY_MAX_RANGE_DAYS`, qui protègent l'ampleur du scan) n'étaient fautifs. Chercher « la
constante fausse » n'aurait rien donné.

**Parade** : quand un nombre est annoncé ici et servi là, comparer les **fenêtres** des deux
surfaces avant de relire les formules. Et **lire** la borne de l'autre surface plutôt que de la
recopier — `_reading` lit `settings.activity_max_range_days`, un `366` en dur aurait divergé au
premier changement de réglage.

### ⚠️ Graphify n'indexe PAS les constantes de module Python — et mes requêtes visaient mal

Deux choses distinctes, découvertes en cherchant ce chantier.

**1. Une vraie lacune de l'extracteur.** `graphify update` est AST-only et ne crée aucun nœud pour
les constantes de module Python ni pour les champs Pydantic de `Settings` :

| cherché | nœuds |
|---|---|
| `CALENDAR_WEEKS` · `NON_ACTIVITY_EVENTS` · `REVIEW_LOAD_DAYS` · `_VALIDATION_HREFS` | **0** |
| `activity_max_range_days` (champ `Field(...)`) | **0** |
| `_reading()` · `actionable_gaps()` · `KIND_LABELS` (const TS) | ✅ présents |

La passe **sémantique** ne comble pas le trou : la spec du skill la saute pour un corpus de code
pur. Conséquence pratique : **une doctrine qui vit dans une constante Python (`366`, `730`, un
`frozenset` d'exclusion) est invisible du graphe** — il faut la chercher dans les docs qui la
citent, ou dans le code.

**2. Le vrai tort était la requête.** Une question longue en langage naturel dont les mots sont
génériques (« Lecture ZETIS », « Massimo », « fenêtre ») démarre le BFS sur `GLOSSARY.md` et
`PRODUCT_SPEC.md` et ne rend que du documentaire.

```bash
graphify explain "_reading"        # ✅ le nœud, sa source, ses 7 arêtes
graphify query  "actionable_gaps"  # ✅ le voisinage utile
graphify query  "Lecture ZETIS branche flat fenêtre traces cahier"   # ❌ glossaire
```

**Parade** : interroger par **symbole exact** (`explain`), pas par phrase. Réserver les questions en
langage naturel aux zones documentaires, qui sont ce que la passe sémantique indexe vraiment.

⚠️ **Et vérifier la casse en fouillant `graph.json` à la main** : les `id` sont **minusculés**
(`apps_backend_app_modules_dashboard_service_reading`). Une recherche sensible à la casse sur
`HISTORY_DAYS` rend 0 et fait conclure à tort qu'un symbole manque — c'est arrivé ici, et le seul
résultat trouvé ensuite venait d'`API_SPEC.md`, pas du code.

## Chantier `feat/file-de-relecture` — la file de relecture (ADR-0039) — 2026-08-05

### 🔴 Mon test-verrou central était VERT sur un sabotage — troisième occurrence du motif

Le chantier repose sur un invariant : la file `/relecture` et la ligne `validation` du Dashboard
comptent **la même chose**. J'ai écrit `test_la_file_et_l_inbox_comptent_la_MEME_chose` pour le
garder, et je l'ai contre-éprouvé en sabotant `_inbox()` pour qu'elle recompte les capsules
**globalement**, sans bornage à l'année active.

**Le test est resté vert.**

**Cause** : le décor du test plaçait *toutes* ses pièces dans l'année active. Or un compte borné et
un compte global rendent **le même nombre** quand rien ne vit hors du périmètre. Le test comparait
deux formules dans le seul cas où elles ne peuvent pas diverger.

**Parade** : `_hors_annee(db, ctx)` pose une pièce en attente **de chaque famille** hors année
active — dont une capsule sur une matière que l'année n'étudie pas, sans quoi le bornage par
matière la laisserait passer. Sabotage rejoué : deux tests tombent.

> **Troisième fois que ce motif apparaît dans le dépôt** (cf. `contre-epreuve-mal-visee` en mémoire,
> et les deux cas du 2026-08-03). La règle : **un sabotage vert ne prouve rien** — il faut d'abord
> montrer que le décor peut faire diverger les deux branches.

### 🔴 Les tests d'inbox existants passaient à vide depuis toujours

`test_les_quiz_ne_sont_pas_dans_la_file_de_validation` (`test_dashboard.py`) s'écrit :

```python
validation = [i for i in body["inbox"] if i["kind"] == "validation"]
assert validation == [] or "quiz" not in (validation[0]["detail"] or "").lower()
```

**La fixture `client_db` ne crée ni `SchoolYear` ni `Chapter`.** Il n'y a donc **jamais** de ligne
`validation`, et la première branche du `or` est vraie en toutes circonstances. Le test n'a jamais
rien vérifié — et il est resté vert quand j'ai borné les comptes à l'année active, changement qui
faisait pourtant disparaître la ligne entière.

**Parade** : tout test de ce fichier monte son propre décor (`_decor()`), et le nouveau
`test_les_quiz_ne_sont_JAMAIS_dans_la_file` **affirme d'abord que la ligne existe**
(`assert validation["count"] == 1`) avant de vérifier ce qu'elle ne contient pas.

### 🔴 Rendre une page adressable a vidé ses pastilles de matière, définitivement

`CouverturePage` alimentait sa liste de matières ainsi :

```tsx
useEffect(() => {
  if (subjectId === null && coverage) setAllSubjects(coverage.subjects.map(…));
}, [coverage, subjectId]);
```

Le motif était bon : `GET /coverage?subject_id=` restreint **aussi** la liste des matières
renvoyée, d'où la mémorisation du premier chargement **non filtré**.

**Mais ce chargement n'a plus lieu** dès qu'on arrive par un lien profond `?subject=3` : la première
requête est déjà filtrée, la condition `subjectId === null` n'est jamais vraie, et `allSubjects`
reste `[]` **pour toujours**. Les pastilles disparaissent, et il n'existe plus aucun geste pour
revenir à « Toutes » — il faut éditer l'URL à la main.

**Parade** : les pastilles ont leur propre source, `fetchSubjects()` au montage, indépendante de la
couverture courante. Le test qui gardait l'invariant a été doublé d'un cas « arrivée déjà filtrée ».

> Le piège général : **un état dérivé d'un « premier chargement » casse le jour où l'écran devient
> adressable**, parce que le premier chargement n'est plus celui qu'on croyait.

### ⚠️ Le rechargement de rattrapage effaçait le message d'erreur

Sur `/relecture`, valider retire la ligne en optimiste ; si l'appel échoue, on recharge pour
rétablir et on affiche pourquoi. Écrit dans cet ordre :

```ts
setState(cur => ({ ...cur, error: message }));
await reload();          // ← remet `error` à null, au départ ET à l'arrivée
```

L'utilisateur voyait la ligne revenir **sans aucune explication** — indiscernable d'un clic ignoré.
**Parade** : `await reload()` d'abord, message ensuite. Vérifié par un test dédié.

### ⚠️ `querySelectorAll('tbody tr')` compte les en-têtes de chapitre

En vérifiant que « ↓ N à produire » ouvre bien N lignes, ma première mesure a rendu **17** pour un
compteur annonçant **10**. J'ai failli traiter un nombre juste comme un bug.

La matrice de Couverture groupe les leçons par chapitre, et **les en-têtes de chapitre sont des
`<tr>` du même `<tbody>`**. Compter les lignes de leçon demande de filtrer sur la présence d'une
cellule d'état :

```js
[...document.querySelectorAll('tbody tr')]
  .filter(r => r.querySelector('[data-state]') || r.querySelectorAll('td').length >= 4)
```

### ⚠️ Un `missing_href` sur la première marche de l'entonnoir est mort-né

La « Chaîne de contenus » affiche un delta **entre deux marches** : celui rendu sous la marche *i*
décrit le manque de la marche *i+1*. Rien ne se lit donc au-dessus de la première marche, et le
`missing_href` que je lui avais servi n'était rendu par personne. Servi à `None`, avec le motif
écrit — sinon la prochaine session le « réparera ».

### ⚠️ `@testing-library/user-event` n'est pas une dépendance du projet

`import userEvent from "@testing-library/user-event"` échoue à la résolution Vite. La convention du
dépôt est `fireEvent` de `@testing-library/react`.

## Chantier `fix/file-de-production` — une file que personne n'écoute (2026-08-05)

### 🔴 Quatre lots identiques ont attendu six heures — le worker n'était pas lancé

Signalé par le user le 2026-08-05 : *« COD a été lancé mais le niveau front est resté bloqué sur
0 %. Lots #24, 25, 26, 27 créés mais non finis, ils s'accumulent en file d'attente. »*

**La cause est dans `scripts/dev.sh`** : il lançait l'infra, le backend et les deux frontends,
**jamais** `python -m app.production_worker`. Le backend n'exécute aucun lot (ADR-0031 §3) — il
accepte en `202` et enfile sur Redis. Sans worker, ZETIS accepte tout et ne produit rien.

```
ps aux | grep production_worker   → rien
rq:queue:production               → 4 jobs
production_runs #24..27           → queued, started_at NULL
```

> **Un dispositif dont une pièce doit être lancée à la main finit toujours par tourner sans elle.**
> Le worker est désormais lancé par `dev.sh` (étape 4/5) et arrêté avec lui. Raccourci séparé :
> `pnpm dev:worker`.

Trois défauts que cette panne a révélés, chacun corrigé :

**1. `pct ?? 0` refabriquait le chiffre que le hook refusait de donner.** `useRunProgress` rend
`null` pour dire « rien n'a commencé, il n'y a rien à mesurer » — et `ProductionProgress`
retraduisait aussitôt ce refus en `0`. Le libellé disait « En file d'attente… », la case du
pourcentage disait « 0 % », **et c'est la case qu'on lit**. `null` traverse maintenant jusqu'au
rendu : `GenerationProgress` accepte `value: number | null` et rend une barre **indéterminée** (un
liseré qui balaie, jamais un remplissage partiel) **sans aucun chiffre**.

> Corollaire général : **une barre partiellement remplie EST un pourcentage**, même sans chiffre à
> côté. Un « — » ou un « ? » dans la case du pourcentage se lit encore comme une valeur ; on retire
> la case.

**2. « en file d'attente » était vrai et insuffisant.** Une file sans consommateur n'est pas une
attente, c'est un **arrêt** — et les deux n'appellent pas le même geste. `GET /runs/active` rend
désormais `worker_alive`, et l'en-tête écrit « ZETIS **ne produit pas** … aucun moteur de
production actif », en ambre, **sans point qui pulse** (une animation sur une file arrêtée ment
avant qu'on ait lu le texte).

⚠️ **`rq.Worker.count()` MENT, `Worker.all()` dit vrai.** RQ garde l'ensemble `rq:workers:<file>`
(les noms) et un hash par worker (l'état, TTL sur battement de cœur). Un worker tué sans nettoyage
laisse son **nom** dans l'ensemble alors que son hash a expiré. Mesuré ici, aucun processus en
vie :

```
Worker.count(queue=q) → 1     ← ment
Worker.all(queue=q)   → []    ← vrai
SMEMBERS rq:workers:production → rq:worker:403f06…   (hash absent)
```

Un indicateur bâti sur `count()` aurait affirmé qu'un worker écoutait pendant que rien n'écoutait —
exactement le défaut qu'il vient réparer. ⚠️ La question n'est posée **que sur un lot `queued`** :
un lot `running` a forcément quelqu'un qui l'exécute, et la route est sondée toutes les 4 s sur
toutes les pages Papa.

**3. La page Demandes mémorisait les lots au lieu de les lire.** `useState` local : quitter la page
effaçait la barre et rendait le bouton « Produire », comme si rien n'avait été lancé. **C'est ça qui
a fabriqué les quatre doublons.** Le lot se redérive maintenant côté serveur (`active_run` sur
chaque demande, une passe groupée — patron `blockers_for`).

⚠️ **Le lien ne peut pas passer par une clé étrangère** : un lot `manual` ne porte aucun
`content_request_id` (contrainte, ADR-0031 §4). Il se retrouve par `(skill_id, piece)` via
`REQUEST_KIND_TO_PIECE`. ⚠️ **Seuls les lots-PIÈCE comptent** : un lot de chapitre produit aussi la
notion mais ne répond pas de CETTE demande — afficher son avancement ferait croire qu'une fiche
arrive quand le lot en fabrique quinze, dont peut-être pas celle-là.

**Et l'avancement REPREND.** `started_at` voyage avec le lot ; `useEstimatedProgress` accepte un
instant de départ. Sans lui, l'estimation mesurait **l'âge de l'affichage**, pas celui de
l'opération — le « revenir remet tout à zéro » du signalement. Le montage d'un composant n'est pas
le départ d'un travail qui vit dans un worker.

**Garde anti-doublon** (`create_run`) : un lot au même scope `queued`/`running` → `409` qui **nomme
le lot** existant. ⚠️ Elle vient **après** `close_stale_runs` (sinon un lot zombie interdirait ce
scope pour toujours) et ce n'est **pas** de l'idempotence : `run_exists_for` demande « a-t-il déjà
été produit ? » sur toute l'histoire, ici on demande « y en a-t-il un en TRAIN de le faire ? ».

⚠️ **Un test existant empilait 5 lots `queued` sur le même chapitre** pour prouver que les lots
manuels ne comptent pas dans le quota auto. La garde le refuse — à raison : personne ne peut faire
cliquer Papa cinq fois sur un chapitre déjà en file. Les lots sont terminés au fur et à mesure ;
`auto_runs_in_window` compte par **déclencheur**, jamais par statut, donc le verrou est intact.

**Le contenu DÉJÀ produit — refus dit, plus un lot qui tourne pour rien.** Le lot #28, lancé pour
vérifier ce correctif, a tourné 76 ms et rendu `skipped` : la fiche existait. Comportement juste (on
ne régénère jamais, ADR-0021) mais **muet** — une ligne de plus au Journal, et Papa qui attend un
contenu qu'il possède. `create_run` refuse maintenant en `409`, et l'écran l'annonce en **toast**.

⚠️ **« Existe » ne veut pas dire « rien à faire ».** Une fiche `pending` est inexploitable pour
Massimo, et `equip_piece` la VALIDE quand le régime le permet : ce lot-là produit un vrai
changement. `piece_deja_produite(peut_valider=…)` porte la nuance, et `peut_valider` vient de la
même source que le lot (`derivatives_are_served`). Sans elle, on refuserait le seul geste utile qui
restait — et la demande de Massimo resterait ouverte pour toujours.

⚠️ **Le prédicat RÉUTILISE `_existing_fiche` / `_existing_mindmap` / `_has_srs_cards` /
`_has_mission_quiz`**, il n'en réécrit aucun, et un test-verrou d'architecture inspecte la source
pour l'exiger. Une seconde lecture « qui donne le même résultat » diverge au premier générateur
ajouté (défaut nommé par l'ADR-0037) : l'écran refuserait alors ce que le lot aurait produit.
⚠️ Lots-**PIÈCE** seulement : un lot de chapitre saute ses notions déjà équipées une par une.

**Le toast n'est pas le bandeau rouge**, et c'est une décision, pas une nuance de style : un refus
n'est pas une panne — ZETIS a reconnu la situation et n'a rien détruit. Le peindre en rouge à côté
des vraies erreurs apprendrait que ses refus sont des dysfonctionnements. `components/Toast.tsx`,
`role="status"` (pas `alert` : on informe, on n'interrompt pas), effacement automatique — patron
`ProductionDoneModal`, « ne laisse aucune trace à traiter ».

⚠️ **Le tri se fait sur le CODE HTTP, jamais sur le texte** : `asJson` lève désormais un
`HttpError` qui garde son `status` (additif — il reste une `Error`, tous les appelants existants
sont intacts). Reconnaître un refus à ses mots casserait à la première reformulation, et ces
messages ont déjà été réécrits une fois (§7 du 2026-08-04).

⚠️ **Piège de fixture, attrapé par le test lui-même** : une première version semait le chapitre via
un `Theme`. Il existait en base, mais `lessons_by_skill` exige un chapitre `validated` sous un
`SchoolYearSubject` de l'année **active** — aucune notion ne le résolvait, `piece_deja_produite`
rendait `None` faute de leçon, et les verrous seraient passés au vert **en ne testant rien**.
Semer par `_seed_year` / `_seed_lesson`, jamais à la main.


## Chantier `feat/preuves-vers-le-reel` — les preuves mènent quelque part + dépliage (ADR-0038 + addendum) — 2026-08-05

### 🔴 Deux contre-épreuves étaient des NO-OP — et deux verrous paraissaient sans dents

Le motif est déjà consigné (2026-08-03), il est revenu deux fois dans la même session :

| Sabotage écrit | Pourquoi il ne prouvait rien |
|---|---|
| `setOpenSlug(s.slug)` au lieu de la bascule | il retirait la **fermeture au reclic**, pas l'unicité — or ouvrir une AUTRE ligne referme la première de toute façon, donc le test passait |
| `onClick={() => { onAct("mission"); }}` | strictement identique à l'original : `onAct` **ouvre la modale**, il n'écrit rien |

**Parade** : quand un sabotage passe, suspecter le sabotage AVANT le test. Le refaire en visant le
comportement réel (`void run(...)` au lieu de `setConfirming(...)`) l'a fait rougir immédiatement.

⚠️ **Et le premier a révélé un vrai trou** : rien ne vérifiait qu'une ligne ouverte pouvait se
**refermer**. Une contre-épreuve mal visée n'est pas seulement inutile — elle cache ce qu'elle
aurait dû trouver.

### ⚠️ Un croisement de deux surfaces ne suffit pas à prouver qu'on n'a pas recopié

Le verrou « la répartition de Progression est celle de l'agrégat du dashboard » **est passé** sous
un sabotage qui réécrivait les ensembles de statuts à la main — parce que la réécriture *tombait
juste* sur les statuts semés. Seul le test du **statut inédit** (`statut_inedit` → `in_progress`,
jamais perdu) l'a attrapé.

**Parade** : à côté d'un test d'égalité entre deux surfaces, en écrire un sur un cas que la règle
partagée traite et qu'une réimplémentation naïve ne traite pas.

### ⚠️ `_seed` du `conftest` sème DÉJÀ une notion dans Mathématiques

« Nombres relatifs », sans ligne de maîtrise. Elle compte donc **au programme** et dans les « non
abordées ». Deux tests sont tombés au premier passage pour ça, et un troisième semait des `Gap` sur
`db.query(m.Skill).all()` — donc sur la notion du conftest en plus des siennes.

**Parade** : nommer la constante (`NOTIONS_DU_CONFTEST = 1`) plutôt qu'ajuster les nombres en
silence, et faire rendre au helper de semis **les `skill_id` qu'il a créés**.

### ⚠️ Une notion FRAGILE est aussi une notion ENGAGÉE — elle apparaît dans deux blocs

`getByText("Accord du participe")` remontait deux nœuds. Ce n'est pas un défaut d'affichage : les
deux blocs ont raison. **Parade** : scoper par `<section>` (`closest("section")` + `within`) — le
test devient plus fort au passage, puisqu'il peut alors vérifier qu'une **acquise** n'est PAS dans
« à renforcer ».

### ⚠️ Un tableau vide avec ses en-têtes se lit « il n'y a rien »

Sur erreur de chargement, `/progression` affichait le bandeau d'erreur **et** un `<table>` vide.
Deux lectures contradictoires du même écran pour un simple backend éteint. **Parade** : sur erreur,
ne rien rendre du tout — le bandeau a déjà parlé.

### ⚠️ `flex ... gap-2` sépare un mot de sa ponctuation

« Depuis le constat sur **Français** . » — le point est un nœud texte, donc un **enfant flex**, donc
espacé. Invisible en test (`toHaveTextContent` ignore l'espacement), flagrant à l'écran.
**Parade** : une phrase = **un** enfant flex, enveloppée dans un `<span>`.

### ⚠️ Le panneau navigateur rend en taille réduite par défaut

Même piège que le bandeau Massimo (2026-08-04). `resize_window({preset:"desktop"})` **ne suffit
pas** — il a rendu un viewport étroit mis à l'échelle. **Parade** : `resize_window({width:1440,
height:900})` explicitement, et vérifier que la capture montre bien la sidebar ET le tableau.

⚠️ **Et les `ref_N` de `read_page` deviennent faux après un scroll JS** : un clic sur `ref_35` a
touché le vide. Parade : relire la page après tout scroll, ou cliquer via `element.click()`.

### ⚠️ `graphify explain` / la mémoire ne disent pas quelles routes existent

Le prompt de slice affirmait que le détail « À renforcer » devait venir de `Gap`. **Le wireframe de
la même spec montrait les fragiles** (8, 3, 0, 1, 1 — exactement les fragiles réels, jamais les
lacunes : 1, 0, 0, 0, 0). Contradiction interne, tranchée par le user.

**Parade** : quand une spec porte un tableau ET un wireframe, **confronter les deux aux vraies
données** avant de coder. Une requête sur la base de dev a suffi.

### ⚠️ `subject_analysis` appelait `mastery_by_skill` deux fois après extension

`_to_reinforce` et `_engagement` en ont tous deux besoin. **Parade** : l'appeler une fois dans
`subject_analysis` et le passer en argument — les deux helpers sont privés au module.

## Chantier `feat/analyse-matiere` — panneau d'analyse par matière (addenda ADR-0028 / ADR-0020) — 2026-08-05

### 🔴 Un correctif VERT qui ne marchait pas, parce que le test visait le milieu du graphe

Deux matières aux mêmes valeurs occupaient le même point ; la petite disparaissait sous la grosse.
Correctif : désentasser horizontalement, **puis** ramener les bulles dans le cadre. Tests verts.

À l'écran, l'écart valait **2 px** : le clamp du cadre, appliqué APRÈS le désentassement, ramenait
les deux bulles contre l'axe et **annulait l'écart tout juste obtenu**. Le test ne le voyait pas
parce qu'il plaçait la collision **au milieu du graphe**, là où le clamp ne s'applique jamais.

**Parade** : passer les bornes DANS la boucle de désentassement et reporter l'écart sur le voisin
quand l'un est bloqué. Et surtout, faire vivre le test **au bord** : une troisième donnée très
grande pousse les deux autres contre l'axe.

**Le signe à guetter** : un correctif géométrique dont le test n'exerce pas les BORDS. Les cas
intéressants d'un graphe sont presque toujours contre un axe, jamais au centre.

### 🔴 Un sabotage qui ne change rien ne prouve rien

Deux sabotages de cette session étaient des **no-op**, et faisaient croire à des verrous
faux-négatifs :

- `activeSubject !== null ? activeSubject : null` → réécrit en `activeSubject`. C'est la MÊME
  expression. Le verrou paraissait ne pas mordre ; en réalité le code n'avait pas changé.
- l'ancrage du Conseil saboté en `set(per_subject) | …` — or `per_subject` est **déjà filtré**.

**Parade** : avant de conclure qu'un verrou est faible, vérifier que le sabotage **change vraiment
le comportement**. Sur le second, il a fallu saboter de façon réaliste (« clarifier » en prenant
toutes les matières de la base) pour que le verrou morde — et il mord.

### 🔴 `toContain("17")` passe à l'intérieur de « 2h17 »

Test censé prouver qu'un chiffre venait de la MÉMOIRE et non du réseau. La valeur témoin `17`
était une sous-chaîne de `2h17`, affiché juste à côté : l'assertion passait même quand le panneau
lisait la mauvaise source.

**Parade** : choisir des valeurs témoins qui ne peuvent pas être sous-chaînes d'un voisin, et
asserter **les deux côtés** (la valeur attendue ET celle qui ne doit pas apparaître).

### 🔴 Une erreur React qui survit au rechargement — et qui n'existe pas

`Rendered more hooks than during the previous render` s'affichait après avoir ajouté des hooks à
un hook maison pendant que la page tournait. **Un rechargement complet ne l'effaçait pas.**

Ce n'était pas un bug : le **tampon de console survit au rechargement**. Seul un ONGLET NEUF a
montré une console vierge.

**Parade** : pour trancher entre un artefact HMR et un vrai bug, ouvrir un onglet neuf — pas
recharger.

### ⚠️ `pilot_list` et `skills_with_active_mission` ne comptent pas la même chose

`missions.pilot.pilot_list` exige `validation_status == "validated"` ; `skills_with_active_mission`
non. Une notion pouvait donc être marquée « déjà couverte » sans qu'aucune mission n'apparaisse en
regard — une contradiction sur le même écran.

**Parade** : `progress.service.active_missions()` extrait comme source unique, dont le drapeau ET
la liste dérivent. Un test seede une mission `pending` et vérifie qu'elle apparaît des deux côtés.

### ⚠️ Un identifiant de révision Alembic déjà pris → `CycleDetected`

`alembic heads` renvoyait `CycleDetected` après création d'une migration. Cause : l'identifiant
choisi (`c1d2e3f4a5b6`, motif hexadécimal tournant) **existait déjà**.

**Parade** : `grep -h "^revision" alembic/versions/*.py | sort` avant de choisir. Et lire la tête
réelle avec `alembic heads`, jamais `ls | tail` — les fichiers sont triés alphabétiquement, pas
chronologiquement.

### ⚠️ Un `cd` dans une commande précédente déplace le répertoire des SUIVANTES

Trois scripts Python de cette session ont échoué en `FileNotFoundError` sur des chemins relatifs
corrects, parce qu'un `cd apps/frontend-papa` d'une commande antérieure persistait. Une fois, le
heredoc a même affiché « écrit » alors que rien ne l'était.

**Parade** : chemins **absolus** dans tout script qui écrit, et lire le résultat plutôt que la
sortie du script.

## Chantier `feat/dashboard-periode-annee` — vue à l'année + « Où agir » (addendum ADR-0028) — 2026-08-05

### 🔴 Deux bornes qui coïncidaient par accident, dont l'une bornait l'autre en silence

Le dashboard Papa chargeait ses événements sur `CALENDAR_WEEKS = 26` semaines, et **toutes** les
fenêtres (7/30/90) n'étaient que des filtres en mémoire sur cette liste. 182 jours couvrent tout
juste 90 jours **plus** les 90 de la fenêtre précédente qui sert le delta : les deux nombres étaient
d'accord **par hasard**, et personne n'avait écrit que le calendrier bornait le chargement.

Ajouter une fenêtre de 365 jours sans toucher au chargement donnait un écran parfaitement crédible
et faux : **182 jours vus sur 365 annoncés**, et un delta calculé contre J-366 → J-730 valant **0
pour toujours** — pas « stable », jamais mesuré. **Aucun test n'échouait**, tous les jeux d'essai
tenant dans les dernières semaines.

**Parade** : `projections.HISTORY_DAYS = max(PERIODS) × 2` pour le chargement, `CALENDAR_WEEKS`
pour la seule heatmap — **deux bornes explicites et séparées**, plus une garde explicite côté
calendrier, sans laquelle il héritait de la nouvelle profondeur et rendait quatre fois plus de jours
que la carte n'en dessine.

**Le signe à guetter** : quand deux constantes ont la même valeur effective et qu'une seule est
citée dans le code, l'autre borne quelque chose sans le dire. Changer l'une casse l'autre.

### 🔴 Un verrou VERT À TORT parce qu'il assertait sur l'ensemble VIDE

Test : « aucun jour du calendrier ne déborde des 26 semaines ». Il seedait **un** événement à
J-300 et **un** à J-3, puis assertait `all(jour >= limite for jour in jours)`.

Il passait — **y compris après sabotage de la borne**. Cause : un événement **isolé** porte **0
minute** (`event_minutes` mesure l'écart au suivant *dans la même journée*), et le calendrier **omet
les jours vides**. La liste `jours` sortait donc **vide**, et `all([])` vaut `True`.

**Parade** : deux événements espacés de 10 min **par jour** pour que la journée porte des minutes,
**et** une assertion de non-vacuité (`assert jours`) avant le `all(...)`. Ce second garde-fou est le
vrai : il transforme un faux témoin en échec bruyant.

**Généralisable** : tout `all(...)` / `any(...)` sur une collection construite par le code sous test
doit être précédé d'une assertion de non-vacuité. Sinon le test ne prouve rien le jour où la
collection se vide pour une raison sans rapport.

### 🔴 Un test de non-régression qui cesse de mordre quand une constante bouge

`test_le_decrochage_regarde_AU_DELA_de_la_fenetre_du_calendrier` seedait un événement à **400 jours
en dur**, pour vérifier qu'un décrochage plus ancien que la fenêtre chargée est quand même compté.
Le jour où la fenêtre est passée à 730 jours, 400 est tombé **dedans** : le test restait vert **en
ne prouvant plus rien**.

**Parade** : dériver la valeur de la constante — `outside = p.HISTORY_DAYS + 35` — et asserter au
passage que l'événement est bien **hors** du chargement (`last_activity_at is None`), ce qui rend le
test auto-vérifiant.

**Le signe à guetter** : un littéral numérique dans un test dont l'intention est « au-delà de la
limite X ». Il devient faux dès que X bouge, sans jamais rougir.

### 🔴 Un `Record<string, string>` neutralise le filet du typage

Élargir une union (`DashboardPeriod` += `"365"`) est censé être **volontairement cassant** : chaque
`Record<DashboardPeriod, …>` devient incomplet et `tsc` les désigne un par un. Ce filet a fonctionné
partout — sauf dans `ConseilClasseIAPage`, dont la table de libellés était typée
`Record<string, string>`. Ce type accepte **n'importe quelle clé** : `?period=365` tombait dans le
repli `?? "Trimestre 1"` et le Conseil racontait un trimestre pendant que Papa regardait l'année.

**Parade** : toute table indexée par une union se type **par cette union**, et vit **une seule
fois** (ici `COUNCIL_PERIOD_LABEL` + garde `isDashboardPeriod` dans `lib/dashboardDerive.ts`, source
unique du sélecteur, du hook et du lien profond). Il y avait **trois** copies de cette connaissance.

**La formule à retenir** : *le filet n'est pas dans l'union, il est dans le `Record` typé **par**
l'union.*

### ⚠️ `closest("clipPath")` ne trouve rien sous jsdom

Filtrer les `<circle>` d'un SVG pour exclure ceux qui vivent dans un `<clipPath>` :
`c.closest("clipPath")` rend `null` pour **tous**, y compris les bons. jsdom compare les sélecteurs
en **minuscules** et ne reconnaît pas le camelCase des éléments SVG.

**Parade** : regarder le parent directement —
`(c.parentNode as Element)?.tagName?.toLowerCase() !== "clippath"`.

### ⚠️ L'ordre des boutons vient de `Object.keys`, qui trie les clés numériques

`Object.keys({"7":…, "30":…, "90":…, "365":…})` rend `["7","30","90","365"]` — **ordre numérique
croissant**, pas ordre d'écriture : le langage énumère d'abord les clés qui ressemblent à des
entiers. Ici cela tombe juste, mais une clé non numérique (« annee ») passerait **derrière** toutes
les autres et casserait la progression du sélecteur, sans erreur.

**Parade** : si l'ordre porte du sens, l'écrire dans un tableau explicite — ou, a minima, le
verrouiller par un test qui lit les libellés rendus dans l'ordre du DOM.

### ⚠️ Un SVG en `w-full` déplace ses points quand son conteneur change de largeur

Envisagé puis **rejeté** : élargir la carte « Où agir » de 5 à 12 colonnes quand une matière est
sélectionnée. Le `<svg viewBox="0 0 400 250" className="w-full">` s'étire avec son conteneur —
doubler la largeur déplace **chaque bulle horizontalement**, y compris celle que l'utilisateur vient
de cliquer, **sous son curseur**, dans le même frame.

**Parade** : un geste de lecture ne recompose pas la page. Faire adapter le **contenu** à la largeur
disponible plutôt que la largeur au contenu.

## Chantier `feat/journal-tri-et-filtre` — tri et filtre du Journal (addendum ADR-0034) — 2026-08-04

### 🔴 `tsc -b` est VERT sur un contrat qu'il n'a pas reconstruit

Après avoir ajouté un champ obligatoire à `Journal` dans `packages/types`, `npm run typecheck` est
passé **vert** côté Papa. Six littéraux de test étaient pourtant invalides : `tsc -b` compilait
contre le `.d.ts` **en cache** de `packages/types`, non reconstruit.

**Parade** : après tout changement de `packages/types`, relancer le typecheck **une seconde fois**
(la première reconstruit le paquet), ou lancer `npm run build`, qui ne peut pas mentir. Et lire le
**code de sortie**, pas la sortie : `npm run typecheck | tail -4` rend le code de `tail`, donc `0`
quoi qu'il arrive — le `&&` qui suit s'exécute sur un typecheck rouge.

### 🔴 Un verrou de pagination qui reste VERT quand on retire la queue de tri

Le test vérifiait « aucun doublon, aucun lot disparu » sur deux pages. En **retirant** la queue
`created_at DESC, id DESC`, il restait vert : un **ensemble** ne dit rien d'un **ordre**, et la base
rendait par hasard l'ordre d'insertion.

**Parade** : insérer les lots du plus ANCIEN au plus récent (l'ordre d'insertion devient l'inverse
de l'ordre attendu) et asserter l'**ordre exact**, pas l'ensemble. Vérifié par sabotage : il rougit.

### 🔴 `getByText` global trouve le libellé de la mauvaise zone

Le verrou « la ligne de synthèse NOMME les critères actifs » cherchait `getByText("Mathématiques")`.
Ce texte existe **aussi** dans la rangée de pastilles de matière juste au-dessus, toujours visible :
le test aurait été vert sans que la ligne de synthèse existe.

**Parade** : `data-testid` sur la zone, puis `within(screen.getByTestId(...))`. Le test dit alors ce
qu'il vérifie. Même famille que « `findByRole` attrape le premier arrivé ».

### ⚠️ Une valeur arbitraire Tailwind ne se vérifie pas sur la chaîne qu'on a écrite

`border-[rgba(212,175,55,0.55)]` **est** généré, mais Tailwind écrit `#d4af378c` dans le CSS.
Chercher `rgba(212,175,55` dans `dist/assets/*.css` ne rend rien et fait conclure — à tort — que la
règle n'a pas été produite. Deux fausses alertes émises pour cette seule raison.

**Parade** : chercher la forme **hexadécimale** (`d4af37`), ou mieux, lire l'élément **rendu** :
`getComputedStyle(el).borderTopColor`. ⚠️ Et ne pas tronquer `boxShadow` : Tailwind y place
d'abord quatre emplacements vides (`rgba(0,0,0,0) 0px 0px 0px 0px`) avant les vraies ombres — une
troncature à 80 caractères ne montre que le vide.

### ⚠️ Le rechargement d'une maquette en `file://` sert la version en CACHE

Trois corrections successives de la maquette n'apparaissaient pas : `location.reload()` sur une URL
`file://` rendait l'ancienne page, et les mesures faites dessus décrivaient un état révolu.

**Parade** : naviguer avec un paramètre qui change (`?v=2`, `?v=3`). Un `reload()` ne suffit pas.

### ⚠️ `production_events.piece` est `NULL` sur `outcome='blocked'`

Un filtre par type de contenu ne peut **pas** retenir un lot bloqué avant d'avoir touché une pièce :
il n'a pas de type à comparer. Ce n'est pas un défaut à réparer, c'est un constat de code
(`runner.py`, `piece=None, outcome="blocked"`).

⚠️ **Et un second angle mort, mesuré** : les lots **antérieurs à la table** `production_events` n'ont
aucun événement du tout — le lot #3 de la base de dev porte **4 fiches et 0 événement**, donc aucun
filtre de type ne le retient. **Parade** : l'état vide de l'écran le DIT ; ne pas « réparer » en
filtrant les cinq tables de pièces, ce qui perdrait toutes les lignes bloquées, sautées et en erreur.

### ⚠️ `lessons_by_skill` scope l'année par une jointure sur `SchoolYearSubject`

Un `Chapter` rattaché **seulement** par `theme_id` (`school_year_subject_id IS NULL`) n'a aucun
chemin vers une année scolaire : il est invisible de la production, de la galaxie **et** de
`canonical_context`. `Theme` porte une matière, **jamais une année** — il n'existe donc aucune
réparation locale.

**Parade retenue** : fermer la **porte** (`POST /subjects/themes/{id}/chapters` pose désormais aussi
la matière d'année, ou refuse). ⚠️ Le verrou de test porte sur l'**atteignabilité** (`lessons_by_skill`
rend la leçon), pas sur la colonne — vérifier `school_year_subject_id is not None` serait un test de
schéma qui ne prouve rien.

### ⚠️ Le veto SUPPRIME la ligne `Lesson` d'un cours retiré

`veto._delete_one` fait `delete(Lesson).where(id == piece_id)`. Toute logique qui lit
`Lesson.production_run_id` comme une **preuve** (ici : « ce lot a rédigé un cours ») est donc
**rétractable** par un geste que le dispositif autorise.

**Parade** : ne pas re-dériver à la lecture ce qu'un veto peut effacer — écrire une fois, marqué de
sa provenance.

### ⚠️ Un `cd` chaîné ne survit pas à la commande suivante

`cd apps/frontend-papa && npm run build`, puis dans une commande **séparée** `npx vitest ...` a rendu
`exit 127` (commande introuvable) et un `tsc exit=1` trompeurs. Ce n'étaient pas des pannes.

**Parade** : relancer avec le `cd` explicite avant de conclure quoi que ce soit d'un code de sortie.

## Chantier `fix/production-trois-verites` — la production — 2026-08-04

### 🔴 Patcher `enqueue_production` est VERT et SANS EFFET

`runs_router.py:11` fait `from app.core.queue import enqueue_production` — **au niveau module**. Le
nom y est lié à l'import : `monkeypatch.setattr(queue_mod, "enqueue_production", …)` ne rebinde
rien chez lui. Le garde-fou évident passe donc au vert **en laissant fuir**.

`capsules/service.py:390`, lui, importe **dans le corps de la fonction** — c'est pour ça que les
cinq monkeypatchs de `test_capsule_render` marchent, et ça masque le piège.

**Parade** : greffer sur la **fabrique** (`production_queue` / `render_queue`). `enqueue_production`
la résout dans les globals de **son** module, **à l'appel** : tous les appelants sont attrapés,
quelle que soit la façon dont ils ont importé. Fixture `autouse` `file_rq_factice` dans `conftest`,
plus un `_redis` qui **lève**.

### 🔴 Une contre-épreuve peut viser le mauvais CADRAN

Fixture désarmée pour prouver la fuite → `len(production_queue())` = **0**. Conclusion tentante :
« il n'y avait pas de fuite ». Faux — **le worker qu'on venait de lancer consommait les jobs à la
milliseconde**. La preuve était dans `FailedJobRegistry` : **18 → 21**, avec
`ValueError: production_run 1 introuvable`.

**Parade** : quand un sabotage ne fait rien tomber, se demander d'abord si l'instrument regarde au
bon endroit. Deuxième occurrence le même jour : le `target` du Journal a **deux gardes** (le filtre
SQL `outcome == "blocked"` **et** le ternaire) — en casser une seule ne casse rien.

### 🔴 39 leçons `validated` SANS une ligne de contenu

`validate_all_lessons` passe en `validated` **toutes** les leçons `draft` d'un chapitre, sans
regarder s'il y a un texte. `Lesson.status` porte donc deux sens : « au programme validé » et « le
cours est relu ». La production lit le second là où le curriculum a écrit le premier — d'où un motif
qui disait *« Cours à valider »* d'une leçon **déjà validée, seulement vide**, dans la majorité des
cas où il s'affichait.

**Parade immédiate** : deux motifs (`BLOCKED_COURSE_MISSING` / `BLOCKED_COURSE_PENDING`). **La
conflation du champ reste entière** — c'est une dette, avec migration.

### ⚠️ Les pièces leçon-centrées n'ont PAS de `skill_id`

`_pieces_of_run` met `skill_id = None` sur cours, fiche, carte mentale et quiz : ces quatre familles
sont **leçon-centrées**. Seules les cartes SRS portent une notion. Un index `(skill_id, kind)` pour
rattacher une ligne de journal à sa pièce rend donc `None` **partout**.

**Parade** : clé `(lesson_id, kind)`, et `(skill_id, "srs")` pour les cartes. `lesson_id` ajouté aux
dicts internes de `_pieces_of_run` — absent de `JournalPieceOut`, donc jamais exposé.

### ⚠️ Le contenu d'un `<details>` FERMÉ reste dans le DOM

`screen.queryByText(/à faire/)` trouve la ligne d'événement même repliée. Un test qui vérifie
« le résumé ne dit pas *à faire* » passait donc pour la mauvaise raison.

**Parade** : viser ce qui distingue les deux — ici le **chiffre** (`/\d+ à faire/`). Et penser à
`aria-hidden` sur les icônes dupliquées : deux éléments au même nom accessible cassent
`getByLabelText`.

### ⚠️ `☐` et `☑` (U+2610/U+2611) sont INVISIBLES sur fond sombre

Rendus en trait d'un demi-pixel par les polices système. Les tests passaient (l'élément existait,
avec son `aria-label`) et l'écran ne montrait **rien**.

**Parade** : dessiner (SVG, `currentColor`). Règle générale — **un caractère dont l'apparence dépend
de la police installée n'est pas un élément d'interface.**

### 💡 Vérifier une page Papa à l'écran SANS se connecter

Déposer une page statique dans `apps/frontend-papa/public/`, l'ouvrir via le serveur Vite déjà lancé
(`localhost:5175/x.html`) — aucun login requis — screenshot, **puis la supprimer** (`public/` part
dans le build). Sinon : le MCP `claude-in-chrome` utilise la session déjà connectée de Chrome.

## Chantier `feat/bandeau-*` — les bandeaux des deux frontends — 2026-08-04

### 🔴 Un test de budget qui part d'une PAGE ne voit pas le LAYOUT

`accueil.bundle.test.ts:40` part de `pages/AccueilMassimoPage.tsx`, `matiere.bundle.test.ts:33` de
`pages/MatiereDetailPage.tsx`. `reachable()` ne suit que les imports **depuis son entrée** :
`MassimoLayout.tsx` et `MassimoBannerHeader.tsx` ne sont dans **aucun des deux graphes**.

Un `import("@zetis/ui/galaxy/canvas")` dans le header aurait donc chargé **1,37 Mo sur les 21
routes** — y compris `/subjects/:slug`, dont le budget est écrit ZÉRO — en laissant **les deux
suites 12/12 vertes**.

**Démontré, pas supposé.** Sabotage joué : ajout de la ligne, `accueil` et `matiere` restent
vertes, `layout.bundle.test.ts` et `app.bundle.test.ts` virent au rouge **en nommant
`MassimoBannerHeader.tsx`**. Puis fichier restauré, `git diff` vide.

**Parade** — le chrome est une unité de sens distincte d'une page : il est payé PARTOUT. Deux
suites de plus, avec le même moteur `bundleGraph.ts` : `layout.bundle.test.ts` (entrée
`MassimoLayout.tsx`, budget zéro) et `app.bundle.test.ts` (entrée `App.tsx`, **liste épinglée** des
points de montage — toute apparition d'un troisième fait échouer le test).

### 🔴 Le header Massimo était INTESTABLE sous jsdom, et ce n'était pas un oubli

Il n'avait **aucun** test, contrairement à `PapaLayout`. La cause : `NeuralLinks.tsx:30` faisait
`new ResizeObserver(...)`, que jsdom n'implémente pas et que `apps/frontend-massimo/src/test/setup.ts`
**ne polyfille pas** (il ne contient que `@testing-library/jest-dom/vitest`). Monter le header
jetait `ReferenceError: ResizeObserver is not defined`.

**Parade** — le remplaçant teste `typeof ResizeObserver === "undefined"` et retombe sur un écouteur
de `resize`. Le header devient montable, et onze test-verrous ont pu être écrits d'un coup. ⚠️ Ne
pas polyfiller `ResizeObserver` dans le `setup.ts` global : ça masquerait le même piège ailleurs.

### Un budget de particules calculé sur la MOYENNE est faux

`revealSchedule` place les ancêtres à `born − hauteur × ANCESTOR_LEAD`, donc les naissances
arrivent **en grappes**. Une durée de traînée dérivée du débit moyen
(`IN_FLIGHT_BUDGET × durée / naissances`) donnait **34 étoiles en vol pour un budget de 32** —
attrapé par le test, pas à l'œil.

**Parade** — mesurer le **pic** : `peakInFlight(sorted, window)` en deux pointeurs, puis une
bissection sur la durée. O(n) par essai, 24 essais, une seule fois. Ne pas revenir à la moyenne
« parce que c'est plus simple » : elle sous-estime toujours.

### `bg-cover` rogne ; un masque sur `inset-0` ne fond rien

Deux pièges enchaînés sur le bandeau Papa, tous deux vus à l'écran :

1. `bg-cover` met l'image à l'échelle de la **largeur**. Sur un header bien plus large que haut,
   l'image déborde en hauteur et se fait couper par le haut. `bg-contain` cale sur la **hauteur**.
2. Le fondu latéral (`maskImage: linear-gradient(90deg, …)`) se mesure sur la largeur du **calque**.
   Posé sur `inset-0`, ses zones de fondu tombaient **hors de l'image** (qui n'occupe que le centre
   en `contain`) : le rectangle sombre de l'image se voyait comme une couture. Le calque doit porter
   l'`aspect-[10/3]` de l'image.

### `StrictMode` tue une animation verrouillée « une seule fois » si le verrou se pose au DÉBUT

`main.tsx` monte l'app dans `<StrictMode>`, qui monte, démonte et remonte chaque effet en dev. Un
`let alreadyPlayed = false` de module positionné **au démarrage** de l'animation est donc vrai au
second montage : plus rien ne s'anime en développement, et seulement là.

**Parade** — poser le verrou **à la fin**. Bonus : une construction interrompue (déconnexion,
remontage) n'est alors pas comptée, ce qui est aussi le bon comportement en production.

### Deux tests réécrits parce que la DÉCISION a changé — et pourquoi ce n'est pas une régression masquée

`la boucle S'ARRÊTE` et `le coût par image est indépendant de N` encodaient fidèlement la
conception du matin. En cours de session, deux décisions les ont invalidés : la galaxie ne se fige
plus (elle tourne), donc le calque posé ne sert plus.

**Règle appliquée** — un test qu'on modifie pour qu'il passe est une régression masquée ; un test
qu'on réécrit parce que la règle a changé doit **encoder la nouvelle règle et dire l'ancienne**.
Les deux portent désormais un bloc `⚠️ CE CAS A CHANGÉ DE NATURE LE …` qui explique quoi et
pourquoi. Le second **avoue** que le coût est proportionnel à N — c'est un aveu, pas un
assouplissement.

### Le témoin d'état existe parce qu'un compte d'images ne prouve plus rien

Tant que la boucle s'arrêtait, « la construction n'a pas rejoué » se vérifiait en comptant les
`requestAnimationFrame`. Depuis qu'une boucle permanente tourne, ce compte ne distingue plus rien.
D'où `canvas.dataset.state` (`growing` → `alive`), lu par le test-verrou. ⚠️ Ce n'est pas du
débogage laissé traîner : c'est la seule surface observable de l'invariant.

## Chantier `fix/starlette-*` — dépendances et constantes HTTP — 2026-08-04

### 🔴 Une dépréciation qui ne se plaint PAS est la plus dangereuse

`HTTP_413_REQUEST_ENTITY_TOO_LARGE` était déprécié **au même titre** que le 422, mais n'a produit
**aucun warning** : son chemin (`eli5`, fichier trop lourd à l'upload) n'est exercé par aucun test,
et la dépréciation ne se déclenche qu'**à l'accès à l'attribut**.

**Parade** — ne pas corriger « ce qui crie ». Demander à la lib installée sa table de renommages :

```bash
apps/backend/.venv/bin/python -c "
import inspect, re
from starlette import status
for a, b in re.findall(r'\"(HTTP_[A-Z0-9_]+)\": \"(HTTP_[A-Z0-9_]+)\"', inspect.getsource(status)):
    print(a, '->', b)"
```

Starlette 1.3.1 en annonce **quatre** ; nous en utilisions deux, dont un muet.

### Un warning qu'on laisse traîner ne fait pas une panne — il fait un fichier incohérent

`curriculum/service.py` portait **déjà** un `HTTP_422_UNPROCESSABLE_CONTENT` au milieu de ses
dépréciés, hérité d'un chantier antérieur. La lecture suivante croit l'écart intentionnel et le
recopie. C'est le vrai coût d'une dépréciation ignorée.

### `tsc -b` échoue depuis la racine — et `npx tsc` attrape le mauvais binaire

Deux pièges enchaînés en voulant vérifier le typage :

| Commande | Ce qui se passe |
|---|---|
| `npx tsc -b` | attrape le paquet `tsc` du registre, **pas TypeScript** : *« This is not the tsc command you are looking for »* |
| `./node_modules/.bin/tsc -b` à la racine | `error TS5083: Cannot read file '<racine>/tsconfig.json'` — il n'y a **que** `tsconfig.base.json` |

**Parade** — `pnpm --filter @zetis/frontend-papa typecheck` (idem Massimo). ⚠️ Ici l'outil échoue
**franchement** au lieu de mentir ; c'est le bon comportement, à ne pas « réparer » en ajoutant un
`tsconfig.json` racine qui ne compilerait rien.

### `uv lock --resolution lowest-direct` ne tourne pas sur ce dépôt

Voulant **prouver** que le plancher déclaré cassait, la résolution basse échoue pour une raison sans
rapport : `faster-whisper` (extra `stt`) tire `av==11.0.0`, qui ne compile pas sans `pkg-config`.

**Conséquence assumée** : la casse sous le plancher est **raisonnée, pas démontrée**. C'est écrit
tel quel dans la PR #77 — ne pas la présenter comme vérifiée.

**Ce qui marche, en revanche**, pour dater l'apparition d'un symbole, sans toucher au projet :

```bash
uv run --no-project --with "starlette==0.47.3" python -c "from starlette import status; print(hasattr(status,'HTTP_422_UNPROCESSABLE_CONTENT'))"
```

C'est ainsi que `>=0.48` a été **mesuré** (faux en 0.47.1/2/3, vrai en 0.48.0) plutôt que choisi.

### Graphify n'oriente pas sur une constante lexicale

Interrogé sur `HTTP_422_UNPROCESSABLE_ENTITY`, il a rendu les sections « Statut » des ADR-0005/0007
— il indexe des **concepts**, pas des identifiants. Le grep est légitime **après** cette tentative,
pas à sa place.

## Chantier `feat/etat-zetis-sidebar` → `refactor/vocabulaire-niveau-palier` — 2026-08-04

### 🔴 Un renommage de clé JSON ne peut PAS être vu par les tests unitaires

Le plus coûteux des cinq, et le plus contre-intuitif. `preset` → `niveau` a été renommé côté
serveur **et** côté front. À aucun moment les **805 tests backend + 377 front** n'auraient pu voir
une rupture : le backend se teste contre lui-même, le front **mocke** `fetchAutonomy`. Renommez
d'un seul côté, tout reste vert — et l'écran retombe silencieusement sur « Sur mesure », un régime
**faux**, sans la moindre erreur.

**Parade posée** : `packages/types/contracts/autonomy.example.json`, une réponse **capturée** du
serveur réel, relue par deux tests qui n'ont que ce fichier en commun — côté back « la réponse a
exactement ces clés », côté front « les composants **rendent** à partir de ce fichier, **sans
mock** ». Trois contre-épreuves jouées. ⚠️ Le fichier se **capture** ; écrit à la main ce n'est
qu'un mock de plus. Et seules les **clés** engagent : figer des valeurs le rendrait rouge au premier
réglage changé en base de dev.

⚠️ **Piège dans le piège** : renommer la clé dans `router.py` seul **ne change rien** à la réponse.
Pydantic filtre sur les champs du `response_model` — la clé inconnue est **jetée**, l'ancienne
repasse à `None`. La mutation qui prouve le test doit toucher **`schemas.py`**.

### Un verrou anti-sondage qui ne pouvait pas mordre

`vi.useFakeTimers()` posé **après** `renderHook` ne contrôle **que** les minuteurs créés ensuite.
Le test « 60 s de timers avancés → un seul appel » passait au vert **avec** un `setInterval(load,
15000)` ajouté exprès dans le hook. Parade : installer les faux timers **avant** le rendu, attendre
la promesse par `await act(async () => { await Promise.resolve() })`, puis
`advanceTimersByTimeAsync`. ⚠️ Ce patron est **copié de `useNewsSummary` (ADR-0030) dans tout le
dépôt** — les autres copies sont probablement aussi creuses.

### `onMouseLeave` cesse de se déclencher si l'infobulle est FILLE de l'élément survolé

L'infobulle restait ouverte indéfiniment. Son apparition ajoutait un nœud **dans le sous-arbre
survolé**, et React cessait d'émettre le `leave`. **Trouvé à l'écran, aucun test ne le voyait.**
Parade : écouter le survol sur un **conteneur** dont l'arbre ne bouge pas, l'infobulle étant sa
sœur du lien. Un verrou le tient désormais.

### Une infobulle en `absolute` est coupée par le `overflow-hidden` de la sidebar

La colonne **et** son conteneur clippent leur contenu — c'est ce qui permet à la nav de défiler
seule. Toute surface qui déborde doit être en `position: fixed`, avec sa position mesurée sur
l'ancre au survol.

### `role="group"` homonyme : quatre tests tombés d'un coup

`NiveauDetail` a repris le `role="group" aria-label={cls.label}` de `ClassRow`, à quelques centaines
de pixels. **Deux groupes du même nom** rendent les lignes indiscernables pour un lecteur d'écran
comme pour `getByRole`. Parade : `list`/`listitem` ici — et c'est plus juste, `group` annonçant un
ensemble de **contrôles** que ces lignes n'ont pas.

### `vi.clearAllMocks()` manquait : les compteurs d'appels étaient CUMULATIFS

Dans `ParametresPage.test.tsx`, toute assertion `toHaveBeenCalledTimes(n)` dépendait de la
**position du test dans le fichier**. Deux tests écrits ce jour-là sont tombés dessus. Corrigé à la
source, dans le `beforeEach`.

### Renommage automatique : un regex qui protège les clés protège aussi les déclarations

`(?<!\.)\bpreset\b(?!\s*:)` — écrit pour épargner `{ preset: … }` — épargne **aussi** les
déclarations de props (`preset: AutonomyNiveau | null;`) et les paramètres annotés
(`fn(preset: T)`). Il renomme donc les **usages** sans les **déclarations**, et le fichier ne
compile plus. Les raccourcis d'objet `{ preset }` alimentant un champ réseau ne doivent pas suivre
non plus. **Les deux ont été rattrapés par `tsc`, jamais par les tests.**

### Erreurs Vite fantômes après suppression de fichiers

Après avoir supprimé `RegimeToday.tsx` et renommé `PresetCards.tsx`, la console montrait
« Failed to reload » pour ces fichiers — **même après redémarrage du serveur**. Ce sont des entrées
mortes du **tampon console de l'onglet**. Un **onglet neuf** rend zéro erreur. Ne pas partir en
chasse : le `build` de production le confirme d'un coup, un module manquant l'aurait fait échouer.

### `sips -c … -Z …` en une passe ne donne pas la taille demandée

`sips -c 900 900 -Z 128` rend du **112 px** : l'échelle est calculée sur la dimension d'origine, pas
sur le recadrage. Il faut **deux passes** (recadrer, puis réduire).

## Outillage — graphify (2026-08-04)

### `graphify explain` ment par omission sur un nom dupliqué

Mesuré le 2026-08-04. `graphify explain "_active_year"` rend **un seul** nœud —  celui de
`dashboard/service.py` — présenté comme LA réponse, avec sa source, sa communauté et ses voisins.

Or le graphe en contient **sept** (vérifié dans `graph.json`) : `curriculum`, `mindmaps`,
`missions`, `dashboard`, `fiches`, `quizzes`, `production.coverage`.

⚠️ **Aucun avertissement, aucune mention des six autres.** C'est le pire comportement possible
quand la question posée EST la duplication : la commande ne se contente pas de manquer l'info,
elle **affirme** sur une occurrence arbitraire.

**Parade** : pour une question de duplication, `grep -rn "def <nom>"` dit la vérité. `explain` sert
à comprendre UN nœud dont on sait déjà qu'il est unique.

> À l'inverse, `graphify query` s'en sort : c'est lui qui a fait apparaître le **3ᵉ** résolveur de
> leçon (`resolve_canonical_context`) que le cadrage de l'ADR-0037 ignorait — il rend une liste de
> nœuds, pas une réponse unique.

### `graphify affected` remplace le grep d'impact — et n'était pas utilisé

`graphify affected "<fn>"` rend les appelants d'une fonction, en une commande. Sur les helpers des
modules neutres (`provenance`, `lesson_resolution`, `canonical_context`, `equipment`), **cette
liste EST le périmètre de non-régression**.

Six commandes de `graphify --help` n'avaient jamais servi (`affected`, `path`, `explain`,
`diagnose multigraph`, `save-result`, `reflect`). `affected` est entrée dans `/slice` §1bis le
2026-08-04.


### ⚠️ 32 jobs RQ identiques pour un lot supprimé — multiplication NON ÉLUCIDÉE

Constaté au désarmement du 2026-08-04 : la file de production portait **32 exemplaires** de
`run_production(1)`, plus 3 échoués — pour un `production_run` **supprimé** lors d'un nettoyage
antérieur. Ils ne pouvaient qu'échouer.

**Ce qui est établi :**

- ils sont arrivés **par paires**, réparties sur **13 heures** ;
- les deux dernières paires portent les heures **exactes** des merges des PR #73 (`03:21` UTC) et
  #74 (`04:47` UTC) — donc à des instants où `uvicorn --reload` a redémarré ;
- **aucun de nos trois appelants** de `enqueue_production` n'est un hook de démarrage
  (`runs_router` ×2 sur un geste HTTP, `jobs.scan_triggers` sur un lot créé) ;
- `enqueue_production` ne pose **aucune politique de réessai**.

**Ce qui n'est PAS établi : la cause.** Les paires et la corrélation aux redémarrages suggèrent un
mécanisme de RQ (nettoyage de registres au démarrage d'un worker ?), mais je ne l'ai pas prouvé.
**Consigné comme observation, pas comme diagnostic** — inventer une cause plausible serait pire que
d'admettre le trou.

**Parade appliquée** : purge de tout job dont le `production_run` visé n'existe plus, dans la file
**et** dans les registres `Failed` / `Deferred`.

> **À re-mesurer si la file regrossit.** Si le motif se reproduit, compter les jobs avant/après un
> redémarrage isolé d'`uvicorn` tranchera en une minute.


## Chantier `fix/sidebar-massimo-mobile` — le tiroir de navigation — 2026-08-04

### 🔴 La sidebar Massimo n'avait AUCUN point de rupture — l'app était inutilisable sur téléphone

Trouvé en allant vérifier **autre chose** : la dette « la galaxie n'a jamais été vue sur trois
appareils ». Au premier viewport mobile, ce n'est pas la galaxie qui a cassé.

`MassimoSidebar.tsx:17` portait `className="flex w-60 shrink-0 flex-col …"` — **largeur fixe de
240 px, jamais repliée, jamais masquée**. Mesuré à 375 px :

| | |
|---|---|
| sidebar | **240 px** |
| reste pour le contenu | **135 px** |
| canevas de la galaxie | **170 × 800** — un ruban vertical |

⚠️ **`CLAUDE.md` exige pourtant** : *« UI responsive desktop/tablette/mobile. Prévoir une version
iPhone pour Massimo. »* Le défaut est pré-existant (dernier commit sur le fichier : ADR-0030).

**Pourquoi 453 tests ne l'ont pas vu** : jsdom n'a pas de viewport, les classes Tailwind ne sont
jamais évaluées, et aucun test ne rendait le layout à une largeur donnée. **Une classe CSS absente
ne casse aucun test — elle casse l'écran.**

> C'est le seul cas où un test au viewport de navigateur est **concluant** pour un iPhone : le
> défaut est une largeur fixe en CSS, pas une question de GPU ou de WebGL. Il se comporte donc
> identiquement sur l'appareil réel. Tout ce qui touche la **performance** (FPS, WebGL) reste, lui,
> invérifiable sans l'appareil.

### La spec prescrivait la solution — et l'appliquer aurait cassé trois ADR

`docs/frontend-massimo/navigation.md` dit : *« sidebar latérale sur desktop/tablette, bottom-nav
sur iPhone (les 5 verbes) »*. Décision déjà prise, jamais construite.

**Mais la spec date de l'étape 2 et ne connaît que 5 verbes**, quand la navigation en porte **13** —
Agenda placé en position 2 par l'ADR-0025, « Ma Galaxie » par l'addendum ADR-0024 §A **qui interdit
d'en faire un 6ᵉ onglet**, six témoins par l'ADR-0030 avec test-verrou. Appliquer la lettre de la
spec aurait **masqué 8 sections sur mobile**.

**Stop-on-blocker joué.** Correctif retenu : un **tiroir** — l'`aside` sort du flux (`fixed`) sous
`md` et coulisse ; `md:static md:translate-x-0` annule tout au-dessus. **Rien n'est retiré**, aucun
ADR contredit, et l'écart avec la spec est consigné dans la spec elle-même.

> **Une spec qui n'a jamais été construite vieillit sans qu'on s'en aperçoive.** Avant d'appliquer
> une prescription datée, vérifier ce que les décisions POSTÉRIEURES en ont fait.


## Chantier `feat/lecon-canonique` — la leçon d'une notion (ADR-0037) — 2026-08-03

### 🔴 DEUX de mes tests passaient pour la MAUVAISE raison — les deux démasqués par la contre-épreuve

C'est la leçon la plus chère du chantier, et elle est arrivée **deux fois dans la même heure**.

**1. Le verrou du périmètre d'année ne seedait aucune année ACTIVE.** Il créait une année
`archived` et vérifiait que la notion n'était pas équipable. Vert — mais par la garde *« pas
d'année active → rendre vide »*, **pas** par le filtre d'année qu'il prétendait tenir. Sabotage :
filtre d'année supprimé → **805 verts**. Remède : seeder une année active *en plus*, sans leçon
pour cette notion.

**2. Le test d'accord entre les trois appelants était aveugle.** Il posait deux leçons, la plus
récemment touchée créée **en second** — donc avec l'id le plus haut. `id DESC` et
`(updated_at, id) DESC` désignaient alors la **même** leçon : débrancher un appelant du substrat ne
cassait rien. Sabotage : `_skill_lesson` réécrit avec son ancienne requête → **805 verts**.
Remède : inverser l'ordre de création pour que **les deux tris se contredisent**, et l'affirmer
dans le test (`assert ancienne.id > recente.id`).

> **La règle qui en sort** : un test qui compare deux règles doit poser un décor où **elles ne
> peuvent pas tomber d'accord par hasard**. Sinon il ne teste que la moitié qui marche.

### Trois règles pour « la leçon d'une notion » — l'inventaire, pas la mémoire

Le `MEMORY.md` de la veille en annonçait **deux**. Il y en avait **trois**, trouvées en cherchant
les jointures qui *résolvent* (et non celles qui vérifient une existence) :

| Module | Ordre | Filtres |
|---|---|---|
| `production` (`select_notions`, `_stamp_course`, `_skill_lesson`) | `Lesson.id DESC` | `status != 'archived'`, **aucun filtre d'année** |
| `galaxy._course_lessons_by_skill` | max `(updated_at, id)` | `validated` + chapitre validé + année active |
| `ai.resolve_canonical_context` | `updated_at DESC` | `validated` + `content_markdown IS NOT NULL` |

⚠️ **`memory._has_validated_course` partage le prédicat du troisième mais ne résout rien** — c'est
un test d'existence. Le compter aurait fait chercher un quatrième bug inexistant.

### Le module partagé ne peut PAS vivre dans `curriculum` — cycle d'imports

`galaxy` et `production` importent tous deux `curriculum`, ce qui en faisait le domicile évident.
Mais `curriculum` importe `ai`, et `ai.canonical_context` est **l'un des trois appelants** :
`ai → curriculum → ai`.

D'où un **module PLAT** sous `modules/`, patron `provenance.py`, qui n'importe que `app.db.models`.
Voir `PROJECT_STRUCTURE.md` § « Les modules plats ».

### Une fixture peut cacher un périmètre qui n'existait pas

`test_canonical_context.py` et `test_eli5.py` posaient `chapter_id=1` sur un chapitre
**inexistant**, avec ce motif écrit : *« SQLite n'applique pas les FK »*. Ça tenait tant qu'aucun
résolveur ne joignait `Chapter → SchoolYearSubject → SchoolYear`. Le périmètre d'année devenu réel,
la jointure ne trouvait plus rien : **4 tests rouges, aucun défaut de code**.

> Une fixture qui contourne une contrainte que la base n'applique pas **documente une hypothèse**.
> Le jour où le code la prend au sérieux, c'est la fixture qui tombe — et on la lit comme une
> régression.

Remède : un helper `_chapitre()` qui crée une vraie année + un vrai chapitre validé. **Aucune
assertion modifiée** — c'est le décor qui devient vrai, pas l'attente qui s'assouplit.

### Le gate `validated` de `canonical_context` a quitté le SELECT

L'addendum ADR-0009 §C insistait : *« une clause du SELECT — impossible de recevoir un cours non
validé »*. Le substrat partagé rend les brouillons (la production en a besoin au palier 3), donc le
filtre est passé en Python.

**La garantie tient autrement, et il faut savoir laquelle** : ce n'est plus « impossible par
construction » mais « impossible par **unicité** » — un seul chemin, un seul filtre, un test qui
n'a pas bougé d'un caractère. Si un second chemin d'accès au cours canonique apparaît un jour, la
garantie s'évapore sans bruit.

### Mesurer un changement de comportement AVANT de le merger

Une règle de résolution qui change touche potentiellement tout le référentiel. Plutôt que de
l'espérer borné, on l'a **compté** sur la base de dev (278 notions) :

```txt
leçon inchangée           : 273   (98 %)
leçon changée             :   5   ← exactement les notions à deux leçons
devenue inéligible        :   0   ← le périmètre d'année ne coûte rien ici
```

Et sur les 5 : **4 gagnent un cours, 1 neutre, 0 en perd**. Puis vérification d'accord des trois
lecteurs sur les 278 : **0 désaccord**.

> Ce contrôle prend dix minutes et remplace une conviction par un chiffre. À refaire pour tout
> chantier qui change une règle de sélection.


## Chantier `feat/demande-vers-production` — la demande devient une production (ADR-0036) — 2026-08-03

### ⚠️ DEUX RÈGLES pour « la leçon de cette notion » — et elles ne donnent pas la même leçon

**Pré-existant, rendu visible par ce chantier.** Une notion peut être rattachée à plusieurs leçons,
et deux résolveurs du dépôt en choisissent une **différemment** :

| Résolveur | Règle | Filtre |
|---|---|---|
| `runner.select_notions`, `equipment._skill_lesson` | `ORDER BY Lesson.id DESC LIMIT 1` | `status != 'archived'` |
| `galaxy._course_lessons_by_skill` | max sur `(updated_at, id)` | année active, chapitre + leçon `validated` |

**Constaté en vrai le 2026-08-03.** La notion « Discours direct » porte la leçon 5 (validée, **avec**
cours) et la leçon 12 (validée, **sans** cours). Le lot-pièce a retenu la **12** et s'est bloqué —
« Cours à valider » — alors que la galaxie considère le cours de cette notion **disponible** et le
sert à Massimo.

⚠️ **Piège de diagnostic** : une requête SQL qui joint `lessons` en filtrant `content_markdown IS
NOT NULL` désigne une notion « prête » que le runtime bloquera. Pour reproduire la sélection réelle,
il faut `DISTINCT ON (skill_id) … ORDER BY skill_id, lesson.id DESC` **sans** filtre de contenu.

Non corrigé : un lot-chapitre a exactement le même comportement, donc ce n'est pas une régression.
Mérite sa propre décision — voir les dettes de `MEMORY.md`.

### `create_capsule` n'est pas symétrique des cinq autres générateurs

Les cinq générateurs du kit prennent un identifiant et produisent :

```python
generate_lesson_content(db, llm, lesson_id)          # pas d'embedder
generate_fiche(db, llm, embedder, *, lesson_id)
generate_mindmap(db, llm, embedder, *, lesson_id)
generate_quiz(db, llm, embedder, *, lesson_id, count, difficulty)
generate_cards_for_skill(db, llm, embedder, *, skill_id)
```

`create_capsule(db, llm, subject_id, instruction: str, …)` exige en plus une **instruction en texte
libre** — l'intention pédagogique de Papa. Une demande `(skill_id, content_kind)` ne la porte pas, et
l'inventer serait produire une vidéo que personne n'a pensée. **Stop-on-blocker joué au
read-before-code** ; l'ADR-0036 §3 a été corrigé en place le jour même.

⚠️ **Quatre générateurs sur cinq sont LEÇON-centrés, la demande est NOTION-centrée.** La résolution
existe (`equipment._skill_lesson`) — c'est un partage à faire, pas un mécanisme à écrire.

### Une contrainte SQL neuve peut rendre vert un verrou voisin

`ck_production_runs_exactly_one_scope` fait échouer toute insertion sans scope. Le helper `_run` de
`test_production_runs.py` n'en posait aucun — donc **le test voisin**, qui attend une
`IntegrityError` de `ck_production_runs_manual_has_no_reference`, aurait continué à passer **en
vérifiant une tout autre règle**.

> Quand une contrainte nouvelle touche une table, relire **tous** les tests qui attendent une
> `IntegrityError` sur cette table : ils ne disent pas laquelle ils attendent.

Le helper pose désormais un chapitre par défaut. ⚠️ Le `conftest` ne sème **aucun** `Chapter` : il
faut le créer (avec son `Theme`).

### `progress_pct` ne dit rien d'un lot-pièce — et ce n'est pas un bug

Il vaut `done_notions / total_notions`. Un lot-pièce a **une** notion : 0 % pendant toute sa durée,
puis le lot disparaît. L'indicateur d'en-tête restait donc **figé à 0 %** — constaté à l'écran, pas
par les tests, qui tournent sur des lots mockés.

Règle retenue : là où le serveur a de la granularité (`total_notions > 1`), il fait foi ; là où il
n'en a pas, l'affichage bascule sur `useEstimatedProgress`. Le champ ne ment pas — il n'a rien à
dire.

⚠️ Deux libellés « ZETIS produit **un chapitre** » étaient écrits **en dur** (pastille d'en-tête et
`ActiveProductionModal`). Faux dès qu'un lot vise une pièce.

### Le sondage d'en-tête était plus lent que les lots qu'il surveille

`useActiveProductionRun` sondait toutes les **20 s**. Un lot-pièce dure **15 à 17 s** (mesuré) :
l'indicateur pouvait naître et mourir **entre deux sondages**, donc n'apparaître jamais. Ramené à
4 s — `GET /runs/active` est une requête indexée qui rend un état, pas l'agrégat par page qui avait
tué le sondage d'en-tête le 2026-08-02.

### 🔴 Le réveil périodique se duplique à chaque redémarrage du worker

Deux mécanismes justes séparément, faux ensemble :

- `production_worker.py` **amorce** `scan_triggers` au démarrage (sans quoi une file vide ne se
  remplirait jamais) ;
- `jobs.scan_triggers` **se replanifie lui-même** en `finally` (sans quoi un scan qui échoue
  arrêterait le dispositif définitivement et en silence).

Résultat : **chaque redémarrage ajoute une récurrence permanente**. Constaté en vrai le 2026-08-03 —
`ScheduledJobRegistry` contenait **4 `scan_triggers`** après quatre démarrages dans la journée,
chacun à +180 min de son propre lancement.

⚠️ **Pas dangereux** : l'idempotence (`run_exists_for`) et les quotas empêchent la double
production. Mais c'est une **croissance non bornée** de la cadence, et en production un worker
redémarre (déploiement, crash, OOM).

**Correctif retenu** — `jobs.scan_already_planned(queue)` interroge **les deux registres** (la file
*et* les planifiés : un réveil est en file quand son heure est venue, planifié le reste du temps),
et `production_worker.py` n'amorce que s'il n'y a rien. **Ni l'amorçage ni l'auto-replanification
ne sont supprimés** — ils répondent chacun à un mode de panne réel ; on ajoute seulement la question
qui manquait.

⚠️ **Le correctif ÉVIDENT était piégeux**, et c'est pourquoi il a été écarté : donner au job un
`job_id` fixe (`queue.enqueue(scan_triggers, job_id="production:scan")`) le ferait se replanifier
sous **son propre identifiant** pendant qu'il tourne — or RQ efface le hash du job terminé après son
`finally`, et l'entrée planifiée pointerait vers un job mort. Le dispositif s'arrêterait
définitivement et en silence, exactement ce que le `finally` existe pour éviter.

Vérifié en vrai : **3 redémarrages → 1 seul réveil planifié**, et **file vide → l'amorçage a bien
lieu**. Les deux sens comptent — une garde qui n'amorcerait jamais serait pire que le défaut.

⚠️ **Piège de lecture** : `ScheduledJobRegistry.get_scheduled_time()` rend de l'**UTC**, les logs RQ
du **local**. Un écart de 2 h fait croire à un mauvais intervalle alors qu'il est juste.

### Des jobs RQ survivent aux lots qu'ils référencent

Cinq jobs `run_production` attendaient dans Redis en pointant un `production_run` **supprimé** au
nettoyage du chantier précédent. Un worker relancé les aurait exécutés et fait échouer en série.

> **Nettoyer un lot de test, c'est aussi vider sa file.** Redis n'a aucune clé étrangère.

⚠️ **Et vider `queue.jobs` ne suffit pas** : un job en échec part au `FailedJobRegistry`, d'où le
nettoyage de registres au démarrage du worker peut le ramener. Deux fantômes sont ainsi réapparus
le 2026-08-03 après une première purge. Balayer **les trois registres** (`Failed`, `Scheduled`,
`Deferred`) en plus de la file.

### `redis-cli` absent ne veut pas dire Redis éteint

`redis-cli ping` échouait ; Redis répondait parfaitement via `redis.Redis.from_url(...).ping()`. Le
binaire n'est simplement pas installé. Tester le service, jamais son client.


## Chantier `feat/declencheur-agenda` — le déclencheur automatique (ADR-0035) — 2026-08-03

### `massimo_is_active` comptait un LOGIN comme du travail

Elle ne filtrait que `NON_ACTIVITY_EVENTS` (les deux événements d'agenda), alors que son docstring
promet une activité **pédagogique**. Or `agenda/service.py` avait déjà tranché la question en
privé — `_NON_TRACE_EVENTS = {LOGIN, PAGE_VIEWED} | NON_ACTIVITY_EVENTS`, avec ce motif : *« la
navigation n'est pas du travail (sans quoi ouvrir la page allumerait une trace) »*. **Deux lecteurs
de la même question lisaient deux listes différentes.**

Mesuré en vrai : **se connecter suffisait à suspendre la production cinq minutes**. Anodin tant que
Papa cliquait (le lot attendait entre deux notions) ; **bloquant depuis l'ADR-0035 §7**, où cette
réponse décide si un lot AUTOMATIQUE démarre — un `login` faisait sauter un réveil entier du scan,
jusqu'à trois heures.

Constante promue en `NON_WORK_EVENTS` (`activity/events.py`) et partagée ; l'agenda la consomme au
lieu de sa copie.

### `create_run` lève des `HTTPException` — absurde dans un job RQ

Juste dans une requête, sans destinataire dans un worker : le code de statut ne part vers personne.
Le scan **rattrape et journalise** (`triggers.scan_agenda`), et **un lot refusé ne consomme pas la
référence** — l'échéance redevient éligible au réveil suivant. Un refus n'est pas une production.

### La convention pour un booléen dans `app_settings` est `"true"`/`"false"`

L'ADR-0035 §5 annonçait `0|1`. `agenda.service.student_entry_enabled` compare `row.value == "true"`
depuis l'ADR-0025. **Deux conventions pour stocker un booléen dans la même table, c'est une de
trop** — l'ADR avait tort, l'existant a gagné.

### `SubjectOption.sysId` est `number | null`

Une matière peut exister sans être rattachée à l'année active. Le typecheck l'a rattrapé sur le
câblage du Commander ; une garde `=== undefined` ne suffit pas.

### ⚠️ Une contre-épreuve peut viser à côté et rassurer à tort

En branchant `openFor` (hook `useCommandMission`), le piège annoncé était : `selectSubject` remet
`chapterId` à `null`, et `selectChapter` lit `gate` dans sa **fermeture**.

Premier sabotage — réintroduire `selectSubject` dans l'ordre des `setState` : **les 4 tests sont
restés verts**, parce que React batche et que le dernier `setChapterId` gagnait. J'ai failli
conclure que le piège n'existait pas.

Second sabotage, sur le vrai mécanisme — remplacer le `runPreview("deadline", …)` explicite par
`selectChapter(…)` : **les 4 tombent**. C'est cette version-là qui compte.

**Leçon : un sabotage qui ne casse rien ne prouve pas que le code est bon — il prouve que le
sabotage était mal choisi.**

### ⚠️ `create_request` (notion_requests) déduplique sur `lower(text)`

Un test écrit pour vérifier « pas d'avertissement si la notion a déjà une leçon » créait deux
demandes au texte presque identique en les croyant distinctes. Elles n'en faisaient qu'une : le
test empruntait la branche `already_processed` et **passait quoi qu'il arrive**. Pour tester un
état préexistant, poser la donnée **directement** (`create_manual_lesson`), pas via une seconde
demande.

## Chantier `feat/journal-production` — le Journal et le veto (ADR-0034) — 2026-08-03

### `Lesson.production_run_id` n'était JAMAIS écrit — le filigrane ne peut structurellement pas le voir

`_stamp` attribue au lot **les lignes NÉES depuis le filigrane** (`model.id > watermark`). Or
`equip_notion` **ne crée aucune `Lesson`** : il écrit `content_markdown` dans une ligne que le
référentiel a créée bien avant. `Lesson` figurait donc dans `_PRODUCED` sans jamais pouvoir y être
attribuée.

**Conséquence, trouvée en écrivant les tests et pas au cadrage : le veto sur le cours n'aurait
identifié AUCUN cours** — c'est-à-dire exactement la classe (A1) dont le palier 3 justifie tout le
chantier d'autonomisation.

Réparé par `_stamp_course`, appelé **uniquement** quand `equip_notion` rapporte `cours` dans
`generated` : c'est la seule situation où ZETIS a écrit le texte. Un cours rédigé par Papa, ou
seulement validé en lot, n'appartient à aucun lot et **ne doit pas être retirable**.

> **Corollaire à ne pas oublier** : un cours n'appartient à un lot **qu'au palier 3** (au palier 2
> le gate ne laisse passer que les notions dont le cours existe déjà). Les tests du veto sur le
> cours doivent donc écrire `a1 = 3` directement en base — l'API l'accepte depuis le 2026-08-03,
> mais le scénario reste celui du palier 3.

### `Fiche` et `Mindmap` n'ont AUCUNE colonne `title`

Vu seulement à l'écran : le Journal affichait « fiche #18 ». Les deux dérivés sont **leçon-centrés
par construction** (ADR-0015/0016 : une fiche = une leçon = une page), donc leur identité est celle
de leur **leçon**. `Quiz` a bien un `title`, `Lesson` aussi. Résoudre les titres **en une requête**
(`_lesson_titles`), jamais une par pièce.

### SQLite rend un datetime NAÏF là où Postgres rend un datetime AWARE

`is_stale` comparait `datetime.now(timezone.utc)` à `run.heartbeat_at` relu de la base :
`TypeError: can't subtract offset-naive and offset-aware datetimes`. **Le piège est qu'il ne se
manifeste que d'un côté** — en test (SQLite) ou en prod (Postgres) selon lequel voit le cas en
premier. Normaliser en `tzinfo=utc` avant toute soustraction sur une valeur relue.

### Le §G.3 énumérait « quatre familles » consommables et oubliait le COURS

Sa liste — `SpacedReviewAttempt`, `QuizAttempt`, `CapsuleView`, `fiche_views` / `mindmap_views` —
ne couvrait pas `Lesson`. Le signal existait pourtant (`EVENT_LESSON_VIEWED`, émis par
`student_lesson_cours`) mais sous une **cinquième forme** : `payload_json->>'lesson_id'`, **non
indexé** (l'index de `learning_events` est `(student_id, created_at)`). D'où la table
`lesson_views`, quatrième du patron. **`lesson_viewed` continue d'être émis en parallèle** — il
sert la heatmap et les sessions, pas le veto.

### `app.routes` ne rend rien d'introspectable dans cette version de FastAPI

`[r.path for r in app.routes]` lève `AttributeError: '_IncludedRouter' object has no attribute
'path'`, et le filtre `isinstance(r, APIRoute)` renvoie **0**. Pour vérifier qu'une route est bien
montée, passer par `/openapi.json` (ou un `TestClient`), pas par l'introspection de `app.routes`.

### Le bouton « Passer » de l'écran de login n'appartient pas à ZETIS

Cherché dans `apps/frontend-papa/src` : introuvable. C'est un élément du navigateur (gestionnaire
de mots de passe), pas un contournement d'authentification de l'app. Pour vérifier une page Papa
sans saisir de mot de passe : forger un jeton avec `create_access_token('papa','papa')` et le
poser dans `localStorage` sous la clé **`zetis_papa_token`** (`authClient.ts`).

## Chantier `feat/paliers-autonomie` — les paliers d'autonomie (ADR-0032) — 2026-08-02

### `set_lesson_validation` tamponnait `parent` sur un cours que personne n'avait ouvert

`equip_notion` auto-valide le cours en appelant `set_lesson_validation(db, id, "validate")`, et
cette fonction écrivait `mark_validated(lesson, PARENT, field="status")`. Résultat : une leçon
validée **par la machine** repartait marquée « relu pièce à pièce par Papa ».

**Pourquoi personne ne l'a vu pendant cinq semaines** : le verrou §F.3
(`test_no_validated_row_without_provenance`) vérifie qu'aucun `validated` n'est **sans**
provenance — pas qu'elle est la **bonne**. Une valeur fausse le satisfait parfaitement.

**Solution** : `by=` explicite sur la fonction (défaut `PARENT` pour la route humaine, qui ne
change pas), et `equip_notion` passe son `authority`. Verrou comportemental ajouté
(`test_aucune_auto_validation_necrit_parent`).

⚠️ **Ne pas écrire ce verrou comme `test_system_is_reserved_to_quizzes`** : celui-là est un **scan
statique de source**, et il aurait flaggé `curriculum/service.py`, qui écrit `parent`
**légitimement** pour la route humaine. Le seul verrou correct ici est comportemental : équiper une
notion, puis lire la provenance de sa leçon.

### Un fixture `autouse` s'exécute AVANT le fixture qu'il croit suivre → 403 partout

```python
# ❌ tous les appels Papa répondent 403 : `client_db` s'exécute APRÈS et réécrit l'override
@pytest.fixture(autouse=True)
def _papa() -> None:
    _as(PAPA)

# ✅ la dépendance impose l'ordre
@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    _as(PAPA)
```

`conftest.client_db` pose `app.dependency_overrides[get_current_user]` sur le rôle **`child`**. Un
`autouse` sans dépendance passe avant lui et se fait écraser. Symptôme : **12 tests d'un coup en
403**, ce qui ressemble à un problème d'authentification alors que c'est un problème d'ordre.

### `vite build` ne typecheck rien — seul `tsc -b` le fait

Le script `build` de `frontend-papa` est `tsc -b && vite build`. Lancer `vite build` seul passe au
vert avec un paramètre inutilisé, une prop manquante, un type faux. **Lancer `pnpm --filter
@zetis/frontend-papa build`**, jamais `vite build` seul. (Corollaire déjà noté ailleurs :
`tsc --noEmit` à la racine ne vérifie rien non plus.)

### Le front répétait mot pour mot le motif renvoyé par le serveur

`ClassRow` portait une table `DESCRIPTION` par classe, et le serveur envoie `reason` par classe. Sur
A3 et A4 les deux disaient la même phrase : la ligne s'affichait **deux fois**. Invisible en test
(chaque source est correcte prise seule), évident à l'écran en une seconde.

**Règle retenue** : le front dit **ce que la classe EST**, le serveur dit **pourquoi elle est
verrouillée**. Une idée, une source.

### Remonter le DOM avec `.closest("div").parentElement` pour cibler une ligne

Fragile et faux dès que la balise change : `getByText("Rédaction de cours").closest("div")`
attrapait un conteneur qui englobait plusieurs lignes, d'où des `getByRole` multiples. **Poser
`role="group"` + `aria-label`** sur la ligne et la cibler par son nom — utile au lecteur d'écran
autant qu'au test.

### Cliquer « Enregistrer » dans le même tick que le changement d'état ne fait rien

En vérification live, `preset.click(); save.click();` dans le même script : React n'a pas encore
re-rendu, le bouton est **encore `disabled`**, le second clic est un no-op silencieux. Attendre un
tour (`await new Promise(r => setTimeout(r, 250))`) avant de lire ou cliquer ce qui dépend du
rendu. Ce n'est pas un défaut de l'app — c'est un piège de scénario de vérification.

## Chantier `feat/page-matiere` — affinage au vu de l'écran — 2026-08-01

### `prettifySlug` ampute les accents — et ça se voit comme une faute de frappe

`prettifySlug("mathematiques")` rend **« Mathematiques »**. Sur un slug anglais ou court le repli
passe inaperçu (« Svt ») ; sur un mot français, il produit un mot mal orthographié, en gros, dans
un titre de page. Un enfant qui apprend l'orthographe lit ça.

Constaté en vrai sur QUATRE surfaces à la fois — `/fiches/:slug`, `/mindmaps/:slug`, `/revision`
et `/quiz` — parce que la bande de la page matière naviguait avec un simple slug d'URL. Aucun
test ne l'attrapait : ils vérifiaient la DESTINATION du lien, jamais le mot affiché.

**Règle** : un slug ne se ré-humanise pas. Le nom doit voyager — soit dans le `state` du lien
(les pages fiches/mindmaps le lisent déjà), soit résolu depuis une liste déjà chargée
(`/revision` a `summary.subjects`, `/quiz` a `subjects`). `prettifySlug` reste le dernier repli,
pour l'arrivée par URL partagée — et là, un accent manquant vaut mieux qu'un titre vide.

### Un test qui lit `window.location` sous `MemoryRouter` est vert À VIDE

`MemoryRouter` garde l'historique **en mémoire** : il ne touche jamais `window.location`. Un test
qui vérifie une URL par ce biais lit donc une chaîne **vide**, et passe pour de mauvaises raisons.

```tsx
// ❌ Vert quoi qu'il arrive — window.location.search vaut "" sous MemoryRouter.
const params = new URLSearchParams(window.location.search);
expect(params.get("subject")).toBeNull();
```

Parade : monter une **sonde** dans le routeur, qui lit l'URL par `useSearchParams` et la rend.

```tsx
function Sonde() {
  const [params] = useSearchParams();
  return <output data-testid="url">{params.toString()}</output>;
}
```

Rencontré en vérifiant que le nettoyage d'URL de `QuizPage` ne mange que `subject` et laisse
`from` (le rétrolien). Le faux positif est passé à un cheveu d'être livré.

### « Ça ne marche pas » : auditer la DONNÉE avant de toucher au calcul

Signalement : « le KPI 1 quiz dans mathématiques ne marche pas ». Le réflexe est de suspecter le
comptage. Un audit lecture seule de la base — en appelant le **vrai** service, pas une
reconstitution — a montré que **le compte était juste** sur les 8 matières.

Ce qui était cassé, c'était l'**affordance** : la pastille était non cliquable **par décision**
(aucune route par matière n'existait alors pour `quiz`), mais rendue exactement comme les
cliquables. **Une chose qui ressemble à un lien doit être un lien** — sinon elle se lit comme une
panne, et le signalement est justifié même quand le code fait ce qui était prévu.

Deux corollaires : une pastille inerte doit se **distinguer à l'œil** (pointillés, atténuation,
`aria-label` qui le dit) ; et quand une route par matière manque, la question à se poser est
« peut-on l'ajouter ? » avant « comment afficher qu'elle manque ? ». Ici `?subject=` existait déjà
comme patron sur `/revision` et `/eli5` : il suffisait de l'appliquer à `/quiz`.

### Compter depuis la panoplie : deux pièges qui gonflent les nombres

La charge utile `/subjects/{slug}/panoply` porte les ids de chaque activité disponible, ce qui
permet de compter les ressources d'une matière **sans requête**. Deux réserves, toutes deux
vérifiées dans le code :

**1. Plusieurs notions partagent la même leçon.** `_course_lessons_by_skill` renvoie
`skill_id → lesson_id` : rien n'empêche deux notions de retomber sur la même leçon, et
`_validated_fiche_ids` est indexé **par leçon**. Le même `fiche_id` sort donc sur chaque notion
de cette leçon. Compter les notions « fiche disponible » gonfle le nombre d'autant de notions que
la leçon enseigne. **Dédupliquer par `Set` sur l'id, jamais compter les notions.**

**2. `MAX(id)` ne rend qu'UNE ressource par clé.** Les quatre résolveurs
(`galaxy/service.py:436,452`, `missions/service.py:94,126`) utilisent `func.max(...)` groupé, pour
reproduire l'`ORDER BY id DESC LIMIT 1` d'origine. Si une leçon a **3 fiches validées**, la
panoplie n'expose que **la plus récente**.

⚠️ **Conséquence : une matière affichera « 1 fiche » sur la page matière et « 3 fiches » sur
`/fiches`.** Les deux nombres sont **justes** — « ce que je peux ouvrir depuis mes notions »
contre « ce que le catalogue contient ». **Ne pas “corriger” l'écart** : le premier est le bon
pour la page matière, puisqu'il annonce exactement ce que Massimo trouvera en dépliant ses
chapitres juste en dessous.

Corollaire moins visible : une leçon validée **sans aucune `LessonSkill`** n'apparaît jamais dans
la panoplie — sa fiche est donc invisible du comptage dérivé, alors que `fiches/summary` la compte.

### La teinte de la demande n'a pas de marge : bouger la LUMINOSITÉ, pas la teinte

L'or `#ffcf47` de « ZETIS parle » est à **18° de teinte** de l'orange de la demande, et le rouge
est banni (ADR-0024 §5). Chercher un orange « plus électrique » revient donc à choisir laquelle
des deux frontières franchir : plus clair glisse vers l'or, plus foncé frôle le rouge.

L'axe libre est la **luminosité**, et c'est déjà la grammaire de l'app (`NeonBackdrop`,
`starStyle.glow`, `NEON_TEXT`) : le cyan ne paraît pas électrique parce qu'il est saturé, mais
parce qu'il **brille** sur du bleu nuit. D'où `--shadow-request`, un halo en `color-mix` sur le
token — une seule source de vérité, déplacer la couleur déplace sa lueur.

### Un libellé accessible en matche un autre : `getByRole` trouve deux boutons

Dans le panneau de notion, le bouton d'activité (« Voir le cours ») et son bouton de demande
(« Demander Voir le cours à ZETIS ») contiennent le même texte. `getByRole("button", { name:
/Voir le cours/ })` lève « found multiple elements ». Ancrer la regex en début de libellé
(`^Voir le cours`) — c'est ce que fait le helper `activite()` de `MatiereDetailPage.test.tsx`.

## Chantier `feat/page-matiere` — index de notions, slice B — 2026-08-01

### `normalizeSearch` change la LONGUEUR de la chaîne : on ne peut pas surligner avec ses index

`normalizeSearch` (`packages/ui/.../galaxyGraph.ts:85`) fait `NFD` puis supprime les
diacritiques. « è » devient « e » + accent combinant, puis « e » : la chaîne pliée n'a plus la
même longueur que l'originale, et un index trouvé dedans **ne désigne pas le bon caractère**.

La galaxie ne s'en apercevait pas : elle ALLUME des étoiles, elle n'a rien à surligner. Dès
qu'on veut un `<mark>`, le décalage apparaît — **d'un cran par accent**, donc précisément sur
les mots que Massimo tape sans accent.

Parade : plier **point de code par point de code** en tenant une carte d'offsets
(`lib/searchFold.ts`). `for…of` sur la chaîne et non un index numérique : un caractère hors BMP
compte pour 2 unités UTF-16 et couperait le pli en deux.

⚠️ Le **filtre** et le **surlignage** doivent partager le même pli. Le pli global et le pli par
caractère peuvent diverger (réordonnancement canonique, sigma final grec) : si le filtre
utilisait `normalizeSearch` et le surlignage `fold`, une notion pourrait apparaître dans les
résultats **sans être surlignée**. Un test-verrou compare les deux sur un corpus accentué.

### `staticImports` du moteur de budget prend `export const X = "from"` pour un import

Sa regex est `/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g`. Sur

```ts
export const SUBJECT_BACK_PARAM = "from";
```

elle matche `export … from "` et capture tout jusqu'au guillemet suivant — souvent une
apostrophe dans un commentaire français, d'où des captures absurdes.

**Ne pas corriger le moteur** : il est partagé, et le modifier changerait le comportement du
budget de l'Accueil (dont le vert est la preuve que l'extraction était neutre). Vérifier
autrement, comme le fait `matiere.bundle.test.ts` pour la pureté de `notionRoutes.ts`.

### `NotionActionPanel` ne tire PAS three.js — le prompt de slice l'affirmait à tort

Chaîne tracée : le baril `@zetis/ui/galaxy` ré-exporte 8 modules, **zéro occurrence de `three`**
dans leur fermeture transitive. Three vit derrière `@zetis/ui/galaxy/canvas` (sous-chemin dédié)
et `brainGeometry.ts`, **tous deux hors baril** — et le baril le documente explicitement.

Conséquence : `normalizeSearch` et `starStyle` s'importent depuis `@zetis/ui/galaxy` sans coût
3D. Le baril reste léger en three.js, **pas en octets** (il traîne `GalaxyFallbackList`,
`constellationLayout`, `replayLayout`…). Si le poids gêne un jour, la sortie propre est un
sous-chemin `@zetis/ui/galaxy/search` — jamais une recopie de `normalizeSearch`.

### Le rétrolien d'ELI5 était annoncé bloquant : il ne l'est pas

`/eli5?skill_id=` porte une notion, et ni l'URL ni la réponse serveur ne gardent le slug de
matière. Mais les deux nettoyages d'URL de la page **ne suppriment que leurs propres clés** :
`Eli5Page.tsx` retire `skill_id`+`name`, `useEli5Page.ts` retire `subject`, et tous deux
reconstruisent depuis `new URLSearchParams(searchParams)`.

Un paramètre tiers survit donc aux deux. `?from=` était libre (l'app ne lisait que `name`,
`skill`, `skill_id`, `subject`). **Pas `?subject=`** : il est déjà lu sur `/eli5` et
`/revision`, où il DÉCLENCHE une action — le réutiliser ferait d'un retour un lancement.

### Modèles : deux noms de colonnes qui ne sont pas ceux qu'on suppose

Ils échouent en `TypeError` à la construction, pas en erreur SQL :
`SpacedReviewCard` → **`front_markdown` / `back_markdown`** (statut actif : `scheduled`) ;
`Capsule` → **`subject_id` requis** en plus de `skill_id`.

## Chantier `feat/page-matiere` — index de notions, slice A — 2026-08-01

### `app.routes` n'est pas à plat : un test « cette route n'existe pas » passe **à vide**

**Symptôme** : le test qui vérifie l'absence de `GET`/`PATCH` élève sur `content_requests`
échouait en trouvant… **rien du tout**, pas même le `POST` qui fonctionne pourtant dans les
tests voisins.

**Cause** : dans cette version de FastAPI, `app.include_router()` ne déplie pas les routes dans
`app.routes` — il y range un objet **`_IncludedRouter`** sans attribut `path`. Sur les 45 entrées
de `app.routes`, 41 sont de ce type.

```python
# ❌ Ce filtre renvoie TOUJOURS un ensemble vide — donc un test d'absence toujours vert.
{r.path for r in app.routes if getattr(r, "path", "").startswith("/api/student/…")}
```

**Danger réel** : écrit dans l'autre sens (« la route interdite n'est pas là »), ce test **passe
même si la route existe**. Il ne protège de rien tout en donnant l'impression du contraire.

**Solution** : interroger le contrat déclaré, `app.openapi()["paths"]`. C'est aussi la bonne
source sémantiquement — une 403 ou une 405 masquerait une route bel et bien montée.

### Le plafond d'un vocabulaire fermé ne borne rien s'il est appliqué après déduplication

`CONTENT_REQUEST_MAX_KINDS = 7` est décrit comme « la panoplie entière ». Mais la panoplie
affiche **7 activités** alors que `CONTENT_KINDS` n'en compte que **6** : `eli5` se demande sous
la forme `cours`, `revision` sous la forme `card`. Une liste dédupliquée ne peut donc jamais
atteindre 7 — le garde-fou était inatteignable, donc intestable, donc décoratif.

Le plafond est mesuré sur la charge **brute**, avant dédup : il borne la **taille** de l'appel,
là où le vocabulaire borne son **contenu**. Deux garde-fous, deux risques différents.

## Chantier `feat/galaxy-animations` — galaxie animée — 2026-07-31 (soir)

### Ce que `react-force-graph-3d` 1.29.1 permet vraiment — vérifié ligne à ligne

**Le constat le plus coûteux du chantier : il a réécrit le §2 d'un ADR.** À ne pas re-chercher.

| fait, dans `three-forcegraph` 1.43.4 | conséquence |
|---|---|
| `d3ReheatSimulation()` = `d3ForceLayout.alpha(1)`, **sans argument** | « réchauffer à alpha bas » est **impossible** |
| `d3AlphaTarget` existe dans le kapsule (patron du drag) mais **n'est relayé nulle part** | ni prop React, ni méthode du ref |
| `graphData.onChange` fait `stop().alpha(1)` — « re-heat the simulation » dit la lib | **tout** changement de données réchauffe à fond |
| `graphData` n'est **pas** dans les 18 méthodes liées au ref (`methodNames`) | `graphRef.current.graphData` vaut `undefined` |

**Conséquence** : une croissance nœud par nœud sur simulation vivante ré-explose à chaque étoile,
quoi qu'on fasse. Préserver l'identité des objets nœuds sauve les **positions de départ**, pas la
convergence. D'où la solution retenue partout : **positions calculées, nœuds épinglés
(`pinned`), moteur neutralisé**.

⚠️ **Ne pas « rallumer les forces » en croyant simplifier.** C'est parce qu'elles restent
éteintes que toute la galaxie peut être affichée.

### Réassigner `graphData` à chaque image → le graphe ne s'affiche jamais

**Symptôme** : le rejeu ne se voyait pas se construire. Rien dans la console.

**Cause** : le graphe rendu se recalculait sur l'horloge (`elapsed`), qui avance à chaque frame.
60 réassignations de `graphData` par seconde, donc 60 `stop().alpha(1)` : le graphe passait sa
vie à se réinitialiser. **C'est le défaut même que l'ADR corrige, réintroduit par la porte de
derrière.**

**Solution** : un **compte discret** de nœuds nés (`bornCount`) sert de clé de mémoïsation ; le
graphe garde la même identité entre deux naissances. Test-verrou dans
`GalaxyReplayModal.test.tsx` : le temps est piloté à la main (rAF stubé, `performance.now`
mocké) et on compte les tableaux de nœuds **distincts** reçus par le canvas sur 25 images.

### `zoomToFit` à chaque naissance → la galaxie naît en gros plan puis recule

**Symptôme** : sur l'Accueil, la galaxie se construisait « en grand » puis dézoomait par à-coups.

**Cause** : `onEngineStop` se déclenche à **chaque changement de données**, donc à chaque
naissance. Au début il n'y a que trois étoiles : cadrées serré, puis la caméra recule.

**Solution** : sur un graphe **épinglé**, l'étendue finale est connue d'avance — la caméra est
posée **une seule fois**. Les trois recadrages (`onEngineStop`, redimensionnement) sont
neutralisés quand `pinned` est fourni. Hors graphe épinglé, comportement inchangé.

### `hasWebGL()` est faux sous jsdom → un test qui passe sans rien exercer

**Symptôme** : un test de la modale de rejeu passait, mais n'enregistrait **aucun** rendu du
canvas.

**Cause** : sans contexte WebGL, la modale rend son repli « il faut un écran qui sait dessiner en
3D » et ne monte jamais `GalaxyCanvas`.

**Solution** : mocker `hasWebGL` **en gardant le reste du module réel**
(`vi.mock("@zetis/ui/galaxy", async (actual) => ({ ...(await actual()), hasWebGL: () => true }))`)
dès qu'un test doit monter le canvas.

### Le repli du plafond de nœuds existait — contrairement à ce que supposait l'ADR

L'addendum le disait « probablement jamais écrit ». **Il était atteint et rendu** : `GalaxyPage`
ne rendait plus que les chapitres au-delà du seuil (bannière « Beaucoup d'étoiles ici »), et la
modale de rejeu retirait **toutes les étoiles** — un rejeu de galaxie sans étoile. Les deux sont
partis avec le plafond. **Leçon : vérifier la présomption d'un ADR avant de s'y fier.**

## Chantier `/galaxy` — système solaire et bandeau — 2026-07-31

### `graphData()` n'est pas exposée par cette version de `react-force-graph-3d`

Pour imposer des positions (vue en orbite), le réflexe est de lire les nœuds vivants par
`graph.graphData()` et d'y écrire `fx/fy/fz`. **`TypeError: graph.graphData is not a function`.**
Les positions voyagent donc **dans les données** passées à `graphData={...}` — chaque nœud porte
son `fx/fy/fz`, et la lib les respecte. Vérifier ce qu'expose réellement le ref avant de bâtir
dessus : `scene()`, `cameraPosition()`, `d3Force()` et `zoomToFit()` existent, `graphData()` non.

### Une tuile de relief qui ne suit pas la taille du globe fige la rotation

Les planètes CSS ont une tuile de **160 px pour un globe de 80** : il faut que du relief entre et
sorte du champ. Réduites à 44 px dans le bandeau **sans toucher la tuile**, une seule tache
remplissait la sphère et sa dérive se lisait comme une **variation de luminosité**, pas comme une
rotation. Tuile, taches et pas du keyframe sont maintenant mis à l'échelle ensemble via
`--tile` — le déplacement DOIT valoir exactement la largeur de la tuile, sinon la boucle saute.

C'est la **deuxième** fois que cet invariant casse. Le test qui le garde a été réécrit pour
couvrir les deux tailles.

### Un halo en `absolute` sans ancêtre `relative` part ailleurs

La couronne solaire des planètes flottait **à côté** des sphères : le bouton n'était pas
`relative`, donc le halo se calait sur un ancêtre lointain. Centrage à la main ensuite (padding +
demi-globe − demi-halo) — un `top-1/2 -translate-y-1/2` aurait visé le centre du **bouton**,
libellé compris, pas celui du globe.

### Deux sélecteurs de test devenus faux en silence

Ajouter une couche animée (le halo) a cassé quatre tests d'un coup : le helper sélectionnait
`span[class*="animate-"]`, ce qui attrapait désormais le halo comme s'il était une texture de
planète. Et un `b.querySelector("span")` visait « la sphère » — devenue le **second** span depuis
que le halo la précède.

**Leçon** : un sélecteur de test doit désigner ce qu'il veut dire (`--tile` pour une texture,
`overflow-hidden` pour le globe), jamais « le premier élément qui ressemble ».

## Chantier `Accueil vivant` — passage au calendrier — 2026-07-31

### jsdom garde `grid-column`, le navigateur le normalise en `grid-area`

Le test de « Mon ciel » sélectionnait les cases par `span[style*="grid-column"]`. **Vert en test,
0 case trouvée en vrai** : React écrit bien `gridColumn`/`gridRow`, jsdom les conserve tels quels,
mais le navigateur les fusionne en `grid-area: 2 / 1`.

Le test n'était pas faussement vert (il aurait échoué sur le compte), mais il mesurait **une chose
en test et une autre en production** — ce qui revient à ne rien garantir. Corrigé par un ancrage
explicite `data-day` sur chaque case : identique dans les deux environnements, et il dit ce que
le test veut dire (« un élément par jour qui a eu lieu »).

**Règle générale** : ne jamais sélectionner sur une propriété CSS que le navigateur peut
raccourcir (`grid-area`, `background`, `margin`, `font`…). jsdom ne normalise presque rien.

### Trois défauts que seul le rendu réel pouvait montrer

Aucun n'était détectable en test — ils tiennent tous à des tailles en pixels :

- **Libellés de mois superposés** : « juin » et « juil. » à une colonne d'écart (11 px)
  s'écrivaient l'un sur l'autre. `buildSparseCalendar` saute désormais un libellé à moins de
  3 colonnes du précédent — mieux vaut un repère de moins qu'un repère illisible.
- **Grille perdue dans sa carte** : 5 semaines × 11 px = 70 px dans une carte de 480. La taille
  des cases suit maintenant le nombre de semaines (22 / 16 / 11 px).
- **Initiales de jours désalignées** : la colonne « L M M J V S D » ne compensait pas la ligne
  des libellés de mois, qui ne surmonte que la grille. `marginTop` explicite.

Leçon : un composant dont la mise en page dépend de dimensions fixes ne se valide pas en jsdom.
Le voir avec **les vraies données** (6 jours, pas 34) est ce qui a révélé les trois.

## Chantier `Accueil vivant` (2ᵉ addendum ADR-0024) — 2026-07-31

### Un mapping de libellés incomplet, invisible tant que rien ne l'affiche

`lib/gamification.ts` traduisait **3 `reason` sur 8**. Aucun symptôme pendant des mois : `recent`
était servi par `/api/gamification/summary` mais **rendu nulle part**. Dès qu'on l'affiche
(« Tes derniers gains »), Massimo lit `mission_champion` en brut.

Les huit valeurs réellement écrites par `award_xp` : `mission_remediation`, `mission_champion`,
`eli5_reverse`, `diagnostic`, `review`, `review_consolidation`, `quiz_completed`,
`mindmap_reconstruction`. Un repli neutre a été ajouté — un identifiant technique ne doit jamais
atteindre l'écran de l'enfant, même si une neuvième valeur apparaît demain.

**Leçon générale** : un champ servi mais jamais rendu ne prouve rien sur sa présentabilité. Avant
d'afficher une donnée qui dormait dans un contrat, vérifier ce qu'elle contient *réellement* en
base, pas ce que le type promet.

### Regrouper par jour en UTC, le défaut qu'on venait déjà de corriger une fois

`xp_history` bucketise en **Europe/Paris** via `activity.timeutils.local_day`, pas en UTC. C'est
précisément le défaut relevé sur le **streak retiré** (`gamification/service.py`, docstring) : un
travail à 23h30 heure française tombait la veille.

Le module `activity` est importé pour cette seule fonction — pure, sans DB, sans domaine. Ce
n'est pas une entorse à la doctrine de séparation : ce qui est interdit, c'est de faire remonter
son **tracking** chez Massimo, pas de réutiliser son utilitaire de fuseau.

### Un test qui visait un texte trop générique

`AccueilMassimoPage.test.tsx` vérifiait la galaxie à zéro par `getByText("0")`. Dès que les
pastilles de matières ont porté leur propre compte, plusieurs « 0 » ont coexisté légitimement à
l'écran et le test est tombé sur « Found multiple elements ».

Réécrit sur l'`aria-label` de la carte (`Ma galaxie : 0 étoiles allumées`) : **plus précis**, pas
plus permissif. Un test qui échoue parce que l'écran s'est enrichi n'est pas forcément un test à
assouplir — souvent c'est une assertion qui n'avait jamais désigné ce qu'elle croyait désigner.

## Chantier `Accueil & Galaxie` — slice B (addendum ADR-0024) — 2026-07-31

### Le test de budget qui n'aurait PAS attrapé la régression qu'il vise

Réflexe naturel : vérifier qu'aucun import statique de l'Accueil n'atteint Three.js. Ce test
serait passé **avant comme après** le chantier — et n'aurait donc rien protégé.

Le canvas était **déjà** code-splitté le 2026-07-28 :
`lazy(() => import("@zetis/ui/galaxy/canvas"))`. Le coût ne venait pas d'un import synchrone mais
d'un **MONTAGE** : l'Accueil montait `HomeGalaxyPreview`, qui déclenchait le chargement du chunk
à l'atterrissage. Massimo téléchargeait 1,37 Mo malgré le `lazy()`.

`accueil.bundle.test.ts` interdit donc les **deux formes** — `import ... from` **et** `import()` —
sur tout fichier atteignable depuis la page. Il porte en plus deux garde-fous, parce qu'un test
de budget qui passe pour de mauvaises raisons est pire que pas de test : un minimum de fichiers
analysés (une résolution cassée rendrait le graphe vide, donc vert), et une **contre-épreuve** qui
vérifie que le détecteur voit bien le déclenchement légitime de `GalaxyPage`.

Vérifié en réintroduisant la régression : le test échoue. Puis retirée.

### Deux choses que la spec demandait et que le backend ne sert pas

- **« La capsule recommandée, avec sa matière et sa durée »** : `/api/capsules/library` ne porte
  **aucune durée**, et « recommandée » n'existe nulle part. La calculer côté client serait une
  règle métier dans la page, que la slice interdit explicitement. Le raccourci affiche donc
  `new_count` (`/api/capsules/stats`) et n'est pas rendu si `total === 0`.
- **Le compte global d'étoiles** de la carte Galaxie : `GET /api/student/galaxy` sert `lit` et
  `total` **par matière**. Le total est une **somme de présentation** — la seule addition tolérée
  dans une page qui refuse tout calcul métier.

### Le bandeau Agenda : une régression fonctionnelle à un cheveu

La spec réécrite et la maquette v2 composent l'Accueil en cinq blocs, **sans** `HomeAgendaBanner`.
Le suivre à la lettre aurait rendu `/agenda` **inatteignable** : en phase 0 l'agenda n'a pas
d'entrée de sidebar, et ce bandeau est son seul accès (ADR-0025).

C'est exactement la dette que l'addendum reprochait à la version précédente de cette même spec —
elle était en retard sur le code, à trois jours d'intervalle et sur le même fichier. Le bandeau
est conservé, la spec et la maquette corrigées.

### La « brique à déplacer » du §C était deux implémentations concurrentes

L'addendum décrit un « graphe global deux colonnes + badges + frise » à déplacer tel quel.
`HomeGalaxyPreview.tsx` (~420 lignes) était en réalité une **expérience Galaxy complète** :
canvas, recherche, `SubjectKpiRow`, frise, légende, panneau d'actions **et son propre plein écran
à deux niveaux** — soit un doublon de ce que `GalaxyPage` fait déjà.

Le « déplacement » est donc une **fusion** : `GalaxyPage` a absorbé la galaxie complète comme vue
par défaut (via `useGalaxy`, qui tire maintenant `fetchFullGraph` et `fetchGalaxyTimeline`), les
composants ont été réutilisés tels quels, et `HomeGalaxyPreview` a été **supprimé** — c'est son
orchestration en double qui disparaît, pas son contenu.

## Chantier `Accueil & Galaxie` — slice A (addendum ADR-0024) — 2026-07-31

### Une route qui n'existe pas et qui ne renvoie même pas le bon 404

La spec de page annonçait `GET /api/student/galaxy/overview`. Le vrai chemin est
`GET /api/student/galaxy` — **chemin vide** (`galaxy/router.py:29`), la fonction cliente
s'appelant `fetchGalaxyOverview`, d'où la confusion.

Le piège n'est pas le 404, c'est **lequel** : `/overview` serait absorbé par
`@student_router.get("/{subject_slug}")`, déclarée en dernier. On aurait donc obtenu
« matière inconnue » — un message qui envoie chercher un bug de données là où c'est le **chemin**
qui est faux. L'ordre de déclaration des routes de ce module est *load-bearing* et commenté comme
tel : toute route littérale doit passer **avant** `/{subject_slug}`.

Second écart du même contrat : il ne porte **aucun compte global** d'étoiles, seulement `lit` et
`total` **par matière**. Tout affichage « toutes matières confondues » est une somme client.

### Une redirection compte comme une page vue, et fabrique un doublon dans le cahier de bord

`usePageviewTelemetry` envoie le `pathname` à chaque changement de route, et ne dédupe que les
routes **consécutives identiques** (le serveur fait pareil, sur la route brute). Une redirection
`<Navigate to="/galaxy" replace />` posée sur `/progression` traverse donc **deux** routes
différentes pour **une** visite : Papa aurait vu la même page deux fois de suite dans son cahier
de bord, sans rien pour l'expliquer.

Correctif : `REDIRECT_ONLY_ROUTES` dans le hook — une route qui ne rend aucune page n'est pas une
page vue. À alimenter si une autre redirection est ajoutée un jour.

### Le mapping route → libellé côté Papa n'existait pas — il n'y avait rien à « étendre »

L'addendum §D demandait de faire accepter **deux** valeurs à un mapping supposé existant. Il
n'existait **nulle part** : le serveur sert la route **brute** comme `detail`
(`activity/service.py:_detail_for`) et `ActivityEntryRow` la rendait **verbatim** — Papa lisait
« Navigation · /eli5 ».

Conséquence à ne pas sous-estimer : `learning_events` est **append-only** et rien ne réécrit
l'historique. Sans traduction, les visites d'avant le renommage (`/progression`, du 2026-07-28 au
2026-07-31) et celles d'après (`/galaxy`) resteraient **deux pages distinctes pour toujours**.
Créé en `apps/frontend-papa/src/lib/routeLabels.ts` — donc **sans backend**, comme annoncé, mais
c'est du travail **neuf**, pas une extension.

## Chantier `Dashboard Papa v2` (ADR-0028) — 2026-07-31

### Un test peut verrouiller une contradiction

Le pire piège du chantier. `test_step_order_depends_on_mission_type` assertait
`rev == ["mindmap","quiz","eli5"]` avec le commentaire « pas de verbalisation ». Or le verdict
(`_complete_mission`) exige `reverse_score is not None`, que **seule** l'étape `vocal_explain`
produit — `STEP_ELI5` est une étape de *consultation* (`_CONSULT_STEPS`) qui n'émet qu'un
`mission_step_view`. Une mission `revision` ne pouvait donc **jamais** conclure `acquired`.

Le test passait au vert en décrivant fidèlement un comportement faux. **Un test qui fige un
template doit être confronté à ce qui LIT ce template.** Corrigé par l'amendement `adr-0017 §5bis`.

### Absence de mesure ≠ zéro

Corollaire du précédent : `_apply_verdict` faisait `measured = float(reverse_score) if ... else 0.0`
puis écrasait `mastery_score` avec ce 0. Un parcours sans étape vocale (éditeur de steps de Papa,
notion d'une champion croisée) faisait donc **s'effondrer la maîtrise** de l'élève au moment précis
où il venait de travailler, et replanifiait la carte SRS à 1 jour (intervalle du score 0).
Distinguer « pas mesuré » de « mesuré à 0 » est la règle.

### Deux définitions de « lacune traitée » qui divergeaient en silence

`dashboard._gaps_without_mission` ne comptait que les missions `mission_type == "remediation"`,
alors que la page Lacunes regardait **tous** les types. Une notion couverte par une mission `manual`
(commandée par Papa lui-même) était annoncée « sans mission active » sur le dashboard et « prise en
charge » sur `/lacunes`. Source unique désormais :
`progress.service.skills_with_active_mission`.

⚠️ À ne pas confondre avec l'écart **voulu** entre `OPEN_GAP_STATUSES` (`open` + `in_progress`, ce
que comptent tous les affichages) et le filtre `status == "open"` du générateur de remédiation :
celui-là est doctrinal (`adr-0017 §5bis` — une lacune `in_progress` revient par la **révision**).
`preview_remediation` et `generate_remediation` **doivent** filtrer à l'identique, sinon la carte
du dashboard propose une notion que le bouton ne créera pas. Test-verrou en place.

### Deux conventions de statut de validation coexistent en base

`lessons` utilise **`status`** (`draft|validated|archived`) ; `fiches`, `mindmaps`, `capsules`,
`chapters` utilisent **`validation_status`** (`pending|validated|rejected`). Interroger la mauvaise
colonne rend un ensemble vide **sans lever d'erreur**. Et `quizzes` n'a **ni l'une ni l'autre** —
servis sans gate par doctrine (`adr-0014 §2`), donc impossibles à mettre dans une file « à valider ».

### Un composant qui semble exclusif à une page ne l'est pas (piège rencontré deux fois)

`KpiBreakdown` / `lib/kpiBreakdown` paraissaient propres au dashboard : ils sont consommés par
`CahierBordPage`. `GAPS` de `data/mock.ts` paraissait propre à `/lacunes` : `ModeFocusPage` le
lisait aussi. **Toujours grep le symbole dans tout `src/` avant de supprimer**, pas seulement dans
la page qu'on refait.

### Une fenêtre de chargement peut tronquer un signal global

Le dashboard déduisait `days_inactive` de la liste d'événements bornée aux **26 semaines** du
calendrier. Un dernier événement plus ancien rendait la liste vide, donc un décrochage à **0** —
soit « tout va bien » au moment précis où il faut alerter. Délégué à
`activity.trailing_inactive_days`, qui interroge le dernier événement sans borne.

### Ce que seul le rendu réel révèle

Deux chiffres du même écran se contredisaient, et **aucun test ne pouvait le voir** : le donut
totalisait 42 min à côté d'un KPI annonçant 7 h 05 (le temps sans `subject_id` — connexion,
navigation, chat — n'était compté nulle part : 90 % du total en dev), et le KPI des lacunes portait
le même libellé que le segment « fragiles » des cartes voisines. **Assembler la page et la lire**
reste une étape de vérification à part entière.

### Le mode focus ne faisait rien

`ModeFocusPage` promettait « ZETIS priorisera les missions, capsules et révisions » ; son bouton
n'écrivait qu'un `useState` local. **Aucun état « focus » n'existe côté backend** (zéro occurrence).
Le seul levier de priorité réel est `Mission.force_priority` (plancher de score du sélecteur,
ADR-0018). ⚠️ La route Commander qui le pose **n'a pas de garde d'idempotence**, contrairement aux
générateurs : un second clic crée un doublon.

### Divers

- **Collision d'identifiant Alembic** : `d4e5f6a7b8c9` existait déjà. Toujours vérifier l'unicité
  avant d'écrire une révision — la collision se manifeste par un `CycleDetected` illisible sur tout
  le graphe, pas par un message clair.
- Le test `ProgrammePage` (barre de progression temporisée) reste **flaky sous charge parallèle** :
  il passe seul, échoue parfois dans la suite complète. Déjà connu, non causé par ce chantier.

## Chantier `content_requests` (addendum ADR-0027) — 3 constats au test live (2026-07-30)

Test live « le verbe être en espagnol » (notion sans cours) : ZETIS **a généré une leçon ser/estar
dans sa réponse**. Diagnostic (`ai_jobs`) → **3 causes distinctes**, dont 2 corrigées :

- **[CORRIGÉ n°2] `galaxy.notion_panel` mentait sur le cours** : `cours available = lesson_id is not
  None` — il confondait « leçon validée » et « cours rédigé ». Une leçon validée **sans
  `content_markdown`** (ex. skill 121 « Registre de langue », leçon 42) était annoncée `cours: True`.
  Conséquence directe : le chat proposait une **porte vide** ET n'enregistrait **aucune** demande
  (l'émission fait confiance à `available`). → `available = content_markdown IS NOT NULL`
  (`galaxy/service.py`, patron `coverage.py`). ELI5 reste **toujours** `available` (génératif à la
  volée, décision ADR-0024). Test : `test_cours_indisponible_si_lecon_validee_sans_contenu_redige`.
- **[CORRIGÉ n°2bis] Le signal « notion vide → cours » ne valait que dans le menu** : quand le LLM
  propose `tool=eli5` (chemin `_open_notion`, ELI5 dispo), on routait sans jamais réclamer le cours.
  → `content_request(cours)` posé sur **tous** les chemins dès qu'aucun contenu **durable**
  (`DURABLE_NOTION_TOOLS` = cours/fiche/mindmap/revision) n'existe — ELI5 ne compte pas.
- **[CORRIGÉ n°3] Le chat GÉNÉRAIT du contenu dans `reply`** : l'orchestrateur ancre l'ACTION mais le
  `reply` restait du texte LLM brut → qwen3 écrivait la leçon. → Garde-fou « jamais générer » (ADR-0027
  §3) **porté dans le prompt** : `CHAT_SYSTEM`/`CHAT_TURN_PROMPT` durcis (« tu n'écris jamais le cours/
  les définitions/la conjugaison ; tu orientes vers ELI5 ou une ressource validée »), `CHAT_PROMPT_
  VERSION → chat_v2`. **Mitigation, pas garantie dure** (petit moteur local) ; prouvé live : la
  réponse est passée d'une leçon ser/estar complète à « je t'oriente vers une ressource validée ».
- **[CORRIGÉ n°1] `resolve_skill` matchait une notion SANS RAPPORT** : « verbe être en espagnol » →
  skill 121 « Registre de langue ». Seuil relevé **0.55 → 0.72** (`config.chat_skill_resolution_min_score`).
  `nomic` donne ~0.68 à des requêtes sans rapport (langue/domaine communs), vrais matchs à 0.83+ ; la
  MARGE top-1/top-2 ne sépare pas (cluster de notions proches), seul le score absolu le fait. Prouvé
  live : « verbe être en espagnol » et « les nombres complexes » → `None` (hors-programme).

### Volet hors-programme (addendum ADR-0027) — le piège « Ajouter ne créait rien »

- **`notion_requests` « ✓ Ajoutée » ne faisait QUE `status='added'`** — zéro création (ni Skill, ni
  leçon, ni cours ; le `text` n'allait nulle part). Papa devait tout refaire à la main (skills-backfill
  puis chaîne ADR-0009), sans lien. → **2 ponts réels** ajoutés (`add-to-program` = `_upsert_skills` ;
  `create-lesson` = `create_manual_lesson` + cours local optionnel). Une notion hors-programme n'ayant
  **pas de matière**, Papa la fournit (modale matière/chapitre) — sans quoi rien n'est plaçable.
- **`generate_lesson_content` repasse la leçon en `draft`** (gate ADR-0009 : un cours généré non relu
  ne se sert pas). Donc « Créer la leçon » **+ cours** → leçon `draft` à valider ; **sans** cours →
  leçon `validated` mais cours à écrire (visible Couverture). Assumé, pas d'auto-validation.
- **Test fake-embedder fragile** : `FakeEmbeddingProvider` est basé sur `hash()` ; un texte NON égal au
  nom de la Skill donne un cosinus pseudo-aléatoire. Après le passage du seuil à 0.72, les tests chat
  qui envoyaient « addition et soustraction de fractions » ont cassé → utiliser le **nom EXACT** de la
  Skill seedée (`RESOLVING = "Nombres relatifs"`, cosinus 1.0) quand le test porte sur l'orchestrateur,
  pas sur la résolution.

## Chantier `mindmap` (ADR-0016)

### Données / backend

- **Table `mindmaps` préexistante = vestige notion-centré inutilisé** (créée par le schéma initial
  `96c52d4ba103` : `subject_id`/`skill_id`/`student_id`/`title`/`mode`/`status`, aucun code ne
  l'utilisait). La Slice A la voulait leçon-centrée. → **Reshape** (drop + recreate) + table
  `mindmap_attempts`, migration `e4f5a6b7c8d9`. Reshape destructif assumé (table vide de tout usage).
- **La Slice A n'a pas livré d'endpoint `/summary`** que la Slice B (grille de decks Massimo) exige.
  → Ajout d'un `GET /api/student/mindmaps/summary` (counts only). Décidé avec le user malgré le
  périmètre « frontend uniquement » du prompt.
- **`resolve_canonical_context` prend un `skill_id`, pas un `lesson_id`** (piège commun aux dérivés
  leçon-centrés). On force le cours = LA leçon validée et on n'utilise le résolveur que pour son
  complément RAG (même patron que fiches/quiz). Rien de neuf ici mais à re-vérifier pour tout dérivé.

### React Flow (`@xyflow/react` 12.11.1) — plusieurs pièges non évidents

- **`pathOptions.borderRadius: 18` sur une arête `smoothstep` → CRASH silencieux de toute la couche
  d'arêtes** : chemin invalide pour les segments courts, 0 arête rendue, **aucune erreur console
  claire** (juste « An error occurred in component »). `rfEdges` contenait bien les 8 arêtes. →
  Ramené à `borderRadius: 10`. Diagnostiqué en testant `type: "straight"` (qui, lui, rendait).
- **Un `onClick` posé sur le `<div>` d'un nœud NON draggable ne se déclenche JAMAIS** : React Flow met
  `pointer-events: none` sur ces nœuds (pour laisser passer le pan). → Router les clics par le
  `onNodeClick` de `<ReactFlow>` (qui réactive aussi les pointer-events). Symptôme : cliquer un
  `· · ·` en mode Mémorise ne révélait rien.
- **Adresser des handles multiples par `sourceHandle`/`targetHandle` (id) ne résout pas les arêtes**
  (8 handles enregistrés, `rfEdges` peuplé, mais 0 arête rendue, sans erreur). → Revenir à **UN
  handle source + UN cible** par nœud, avec `position` calculée par côté (`sideTo`) selon la
  géométrie → routage orthogonal propre dans toutes les présentations.
- **Recréer les objets nœuds à chaque render (système à deux effets `setRfNodes` qui « préserve la
  data ») strippe les mesures internes RF (`measured`)** → re-mesure perpétuelle → **arêtes jamais
  rendues** (nœuds pourtant présents et mesurés dans le DOM). → **Un seul effet** `setRfNodes(derivedNodes)` ;
  les positions viennent de `livePos` (donc recréer les nœuds ne perd pas l'agencement).
- **Boucle infinie « Maximum update depth exceeded » → écran noir** : `const currentChunk =
  buildPasses[buildPass] ?? []` recrée un **tableau vide neuf à chaque render** quand `buildPasses`
  est vide (ex. en mode Regarde), ce qui fait recalculer `currentSlotSet` → `derivedNodes` →
  `setRfNodes` en boucle. → **`useMemo` sur `currentChunk`** (référence stable).

### Extraction de la brique `@zetis/ui/mindmap` (addendum, 2026-07-27)

- **Le prompt parlait de `MindmapCanvas` — le composant réel s'appelle `MindmapWorkspace`**, et il
  a **deux** points de montage, pas un : `MindmapSubjectPage` **et** `MindmapMissionModal` (step
  mindmap ADR-0019). La non-régression porte sur les deux ; ne conclure qu'après avoir ouvert
  l'étape mindmap d'une mission sur `/missions`.
- **Export en SOUS-CHEMIN obligatoire** (`@zetis/ui/mindmap`, pas la racine `@zetis/ui`) : la brique
  embarque React Flow + elkjs (~1,6 Mo). Ré-exportée depuis `src/index.ts`, elle entrerait dans le
  bundle de **toutes** les pages Papa et le `lazy()` de la modale ne servirait plus à rien.
  Contrôle : après `vite build` de Papa, React Flow doit être dans un **chunk séparé**.
- **Les keyframes CSS ne suivent pas automatiquement le composant.** `mm-gold-pop`, `mm-dot-active`
  et `mm-cheer` vivaient dans `apps/frontend-massimo/src/index.css` ; Papa ne les avait pas → le
  nœud doré et le toast de félicitation auraient été muets côté aperçu, **sans erreur**. Résolu par
  un `mindmap.css` co-localisé, importé par la brique elle-même. Le `@source
  "../../../packages/ui/src"` des deux `index.css` couvre déjà les **classes** Tailwind ; il ne
  couvre pas les `@keyframes`.
- **Simuler un drag dans la brique : `left_click_drag` ne suffit pas.** Il émet des `MouseEvent`,
  or la banque écoute `onPointerDown` → aucun dépôt, et React Flow pan à la place. Il faut
  dispatcher de vrais `PointerEvent` (`pointerdown` sur la puce, puis `pointermove`+`pointerup` sur
  `window`), en **deux evals** avec ~250 ms entre chaque dépôt (React doit re-render entre deux).

### Backend `:8001` sans `--reload` (config `backend-dev`)

- La configuration `backend-dev` de `.claude/launch.json` lance `uvicorn` **sans `--reload`** : un
  backend démarré avant une modification sert l'**ancien code** en silence. Symptôme vécu : les
  champs `attempt_count`/`avg_score` fraîchement ajoutés absents de la réponse `pilotage`, sans
  aucune erreur. → **Redémarrer le serveur après toute modification backend** (`preview_stop` puis
  `preview_start`). Complète le piège du `:8000` stale ci-dessous.

### Harnais de vérification (preview)

- **Le harnais isolé (`mmpreview.html/tsx`) est instable pour les simulations de drag intensives** :
  états de pointeur résiduels après ~30 dispatches, clic juste après un reload qui ne s'enregistre
  pas, et surtout **le tab bascule en `chrome-error://` sur TOUTE erreur d'eval** (même attrapée).
  → Toujours garder les evals (try/catch + null-checks), faire chaque drag en 2 evals
  (pointerdown puis pointermove+pointerup), et redémarrer le serveur si l'état est pollué. Un
  `fetch` mocké dans le harnais permet de tester `/evaluate` + `/attempts` sans backend.

### Divers

- **Fichier mockup supprimé par accident du working tree** (`docs/frontend-massimo/mockup/
  mockup-page-mindmaps.html`) alors qu'on ne devait qu'en corriger le titre. → Restauré via
  `git checkout HEAD -- <fichier>` puis re-application du correctif de titre (« Mes mindmaps »).
  Vérifier `git status` avant tout commit pour ne pas embarquer une suppression involontaire.

## Chantier `mission` (ADR-0017/0018/0019)

### Backend / dev

- **Le backend `:8000` reste STALE toute la session** : démarré avant les Lots missions, il rend en
  **404** toutes les routes récentes (`/pilot/*`, `/command/*`, `/{id}/regenerate`…) alors qu'elles
  sont commitées et enregistrées dans `main.py`. → Un **backend-dev sur `:8001`** (hot-reload actif,
  `--reload`) sert de source de vérité. **Toujours vérifier quel backend répond avant de conclure à un
  bug de routing.** (Le front dev `papa-dev :5175` / `massimo-dev :5176` pointe déjà sur `:8001`.)
- **`ADR-0017` supposait `Skill` cherchable par embeddings** (pour la porte « thématique texte libre »
  de Commander). FAUX : **seul `RagChunk` porte une colonne `embedding` (pgvector) ; `Skill` n'en a
  pas.** → texte-libre reporté (ADR-0018), v1 = sélection référentiel. Annoté dans ADR-0017 §1 (iii).
- **`ADR-0017` déclarait « zéro migration de ciblage »** — faux aussi : `mission_steps.resource_id` et
  `missions.started_at` n'existaient pas (Lot 1, migration `f3a4b5c6d7e8`), et Commander a exigé
  `missions.force_priority` + `missions.due_date` (migration `a7b8c9d0e1f2`). Lire le modèle réel avant
  de se fier à la prémisse « zéro migration » d'un ADR.
- **Cycle d'import** : `pilot.py` fait `from ... import service as msvc`. Donc **`service.py` ne doit PAS
  importer `pilot`** (les fonctions cycle-de-vie renvoient l'objet `Mission`, et c'est le **router** qui
  sérialise via `pilot._to_pilot_out`). Sinon `ImportError` circulaire au démarrage.
- **Le sélecteur plancher-isait TOUTE mission `manual` par son TYPE** (`forced_priority = 1.0 if
  mission_type == "manual"`). Incompatible avec « l'urgence passe par `force_priority` » (ADR-0018). →
  lire le **flag** `mission.force_priority` ⇒ **changement de facteur ⇒ bump `MISSION_SCORING_VERSION`**
  (v1→v2, puis v2→v3 pour le step mindmap). Toute assertion de test sur `scoring_version` à mettre à jour.
- **`MindmapAttempt` n'a ni `context` ni `completed_at`** (contrairement à `QuizAttempt`) : une tentative
  n'existe qu'une fois **scorée serveur** → l'existence vaut complétion. La preuve d'un step mindmap se
  gate donc sur `created_at > started_at` + `score > 0`, sans filtre `context="mission"`.

### Frontend Papa / preview

- **`useState` placé au milieu d'un hook (après des `useCallback`)** → React « change in order of Hooks »
  **au HOT-RELOAD** (Fast Refresh préserve l'état de l'instance montée dont l'ordre diffère) + **white
  screen**. Pas visible au reload complet, donc trompeur. → **Grouper tous les `useState` en tête** du
  hook. (Vu sur `busyMission` dans `useMissionsPilotage`.)
- **`ContentLifecycleActions` (@zetis/ui) n'est pas réutilisable pour les missions** : sa copie de
  ConfirmDialog est figée pour le contenu LLM (« le contenu repassera à valider », « depuis la leçon »),
  fausse pour une mission (regenerate déterministe, pas de reset de validation). → rangée d'actions
  dédiée + `ConfirmDialog` brut.
- **Le runner de mission Massimo n'a AUCUN deep-link de step** (eli5/quiz compris) : l'enfant navigue
  manuellement puis « Valide » (preuve serveur). Le step mindmap ajoute le **premier** CTA de deep-link
  (« Reconstruire → » vers `/mindmaps/reconstruire/:id`). `fetchMindmap(id)` renvoyant déjà `subject_slug`,
  aucune route/schéma supplémentaire n'a été nécessaire pour résoudre le slug côté client.

## Chantier `mission` — frontend Massimo (page decks + modales in-page)

- **⚠️ `backdrop-filter`/`transform` sur un panneau de modale casse les enfants `position: fixed`.**
  Le `MindmapWorkspace` rend son fantôme de drag en `position: fixed; left/top = clientX/clientY`
  (viewport). Dans `ActivityModal`, `backdrop-blur-xl` (et l'ancienne animation `translate/scale`)
  sur le PANNEAU créent un **bloc conteneur** pour les descendants fixed → le fantôme se positionne
  par rapport au panneau centré, pas au viewport (« nœud loin de la souris, hors plan »). Idem pour
  le toast XP d'ELI5. → **Aucun `backdrop-filter`/`transform` sur le panneau** (fond `zetis-surface`
  opaque, le flou n'y servait à rien) ; entrée en **opacité seule**. Le backdrop de l'*overlay*
  (`inset-0`, à 0,0) est inoffensif. Piège de coord classique React Flow / drag custom.
- **Bascule deep-link → modales in-page** (remplace l'entrée « le runner n'a aucun deep-link » plus
  haut) : les 3 activités (ELI5 / quiz / mindmap) s'ouvrent EN MODALE sur `/missions` ; l'étape se
  valide dans la modale (`completeStep`), fin du marqueur `sessionStorage` + de la redirection. Une
  seule modale ELI5 couvre `eli5` + `vocal_explain` (complète `eli5` à `status="explained"`, `vocal`
  à `feedback`+reverse, stop au 1er 409). UI d'activité **extraites** (`Eli5Session`/`QuizRunner`) →
  `Eli5Page.test.tsx` garde le DOM identique (mouvement pur, à relancer après extraction).
- **Étape mindmap absente alors qu'une carte existe** : `_resolve_mission_mindmap_id` résout la carte
  à la **création** de la mission ; une carte validée *après* coup n'est pas rétro-ajoutée. → **régénérer
  le parcours** (`POST /missions/{id}/regenerate`, planned seulement — une mission `active` refuse,
  409). Pas besoin de générer si la carte existe déjà.

## Chantier `couverture` (ADR-0023) — pièges rencontrés

### Le serveur dev sert un code antérieur, sans le dire

**Symptôme** : une route existe dans le fichier, l'appel renvoie `404`. Ou pire — un champ
ajouté au modèle de lecture arrive vide, et l'UI qui en dépend paraît inerte.

**Cause** : `.claude/launch.json` lançait `backend-dev`/`backend-dev2` **sans `--reload`**.
Le processus gardait le code de son démarrage.

**Diagnostic en une commande** — comparer le code au processus :

```bash
curl -s localhost:8002/openapi.json | python3 -c "import sys,json;print([p for p in json.load(sys.stdin)['paths'] if 'ma-route' in p])"
```

Corrigé : `--reload` ajouté aux deux configs. **Réflexe à garder** : vérifier ses ajouts backend
contre le serveur que l'humain utilise, pas seulement par les tests et des appels directs à la base.

### `fiches` / `mindmaps` : horodatages nullable sans défaut serveur

**Symptôme** : une fiche générée n'apparaît jamais dans la matrice (cellule `+` permanente), et
chaque clic en crée une de plus. Cinq doublons avant qu'on comprenne.

**Cause** : ces deux tables ont été créées avec `created_at`/`updated_at` **nullable et sans
`DEFAULT now()`**, contrairement à `quizzes`/`capsules`. Le `TimestampMixin` déclare pourtant le
défaut : la migration de création ne l'a jamais suivi. Toute ligne insérée sans horodatage
explicite naissait à `NULL`.

**Vérifier** :

```sql
select table_name, column_name, column_default, is_nullable from information_schema.columns
where column_name in ('created_at','updated_at') and table_name in ('fiches','mindmaps','quizzes','capsules');
```

Corrigé par `e6f7a8b9c0d1`. **Leçon de conception** : ne jamais déduire l'absence d'un objet
d'une date manquante. `absent` se déduit de l'existence de la ligne ; une date nulle rend
seulement le *périmé* indécidable, ce qui est un défaut acceptable, pas un mensonge.

### Une capsule créée sans `skill_id` ne compte nulle part

La Couverture compte les capsules **par notion** (`Capsule.skill_id`). Le compositeur de la page
Capsules IA n'envoyait pas ce champ : les capsules créées là n'étaient rattachées à aucune notion
et restaient invisibles dans les fractions, quel que soit le travail fourni.

### Les tests de page cassent quand on ajoute `useSearchParams`

`ProgrammePage.test.tsx` rendait `<ProgrammePage />` nu ; le hook exige un Router (26 tests
tombés d'un coup). Passer par un helper `renderPage(route)` qui enveloppe dans `<MemoryRouter>` —
c'est d'ailleurs plus fidèle à l'app réelle.

Autre piège du même ordre : **jsdom n'implémente pas `scrollIntoView`**. L'appeler dans un
`useEffect` jette et démonte l'arbre. Toujours `ref.current?.scrollIntoView?.({...})` — sur la
méthode aussi, pas seulement sur la ref.

## Chantier `couverture` — passe visuelle + rangement des assets (2026-07-28, session 2)

### `?subject_id=` filtre aussi la LISTE des matières renvoyée

`GET /api/production/coverage?subject_id=N` restreint `subject_query` (`coverage.py:352`), donc
`coverage.subjects` ne contient plus que la matière sélectionnée. Le `<select>` d'origine se vidait
ainsi de ses options dès le premier choix : il fallait repasser par « Toutes les matières » pour en
changer. Bug **présent depuis l'origine**, invisible tant que le sélecteur était un menu déroulant,
criant dès qu'on est passé à des pastilles.

Correctif **client** (`CouverturePage`) : mémoriser la liste du chargement non filtré. Pas de
changement backend — l'endpoint fait ce qu'on lui demande.

### Une `drop-shadow` animée sur un PNG opaque est invisible

L'icône de la Couverture est livrée **sans canal alpha** (fond noir aplati jusqu'aux bords). Une
`filter: drop-shadow()` épouse la silhouette alpha : sur un rectangle plein, elle se dessine
derrière l'image et reste intégralement masquée. L'animation tournait — `getAnimations()` le
confirmait — sans qu'on en voie rien.

Deux corrections : `border-radius` pour rogner les coins noirs (sinon un carré noir sur le fond
bleu nuit), et **halo en `box-shadow`**, qui se dessine hors de la boîte en suivant le rayon.

Règle générale : `drop-shadow` pour un PNG détouré, `box-shadow` pour une image opaque.

### Vérifier une animation sans session authentifiée

Le navigateur intégré n'était pas connecté à l'espace Papa, et l'agent ne saisit pas de mot de
passe. Plutôt que de livrer sans regarder : **banc d'essai isolé** — un HTML dans le scratchpad
avec le CSS copié à l'identique et le vrai fichier image, servi par un `python3 -m http.server`,
puis capture d'écran + `getAnimations()` / `getComputedStyle()` pour prouver que la valeur change
dans le temps. Démonté après coup. Utile pour tout ce qui est purement visuel et sans données.

### Une section repliée sort de l'arbre d'accessibilité

Les expanders par matière ont cassé 2 tests d'un coup : `getByRole("link"|"button")` ne trouve plus
rien sous un conteneur `hidden`, alors que `getByText` **continue** de le trouver (RTL n'ignore que
`script`/`style`). D'où des échecs qui semblent incohérents entre deux tests voisins. Ouvrir la
section d'abord (helper `expandSubject()`).

### `findByRole` attrape le premier arrivé, pas le bon

La pastille de filtre « Mathématiques » et l'en-tête de matrice du même nom sont deux boutons. La
liste des pastilles est posée par un `useEffect`, donc **un cran après** le premier rendu de la
matrice : `findByRole` résolvait sur l'en-tête, avec un `aria-pressed` à `null`. Scoper la requête
(`within(getByRole("group", …))`) au lieu de se fier à l'unicité du libellé.

### `import.meta.glob` aspire tout le dossier

`packages/ui/src/assets/subjects/` contenait `logos_matieres_zetis_apercu.png`, une planche de
contact de 264 ko qu'aucun slug ne résout. Le glob `*.png` du résolveur l'embarquait quand même —
**dans les deux apps**, soit 528 ko de bundle mort. Déplacée dans `assets/brand/references/`.

Un dossier lu par un glob n'est pas un dossier de rangement : tout ce qu'on y pose part dans le
bundle, résolu ou non.

### Test temporisé instable

`ProgrammePage.test.tsx` › « pendant la génération : barre de progression estimée avec % » a échoué
une fois (1029 ms) puis est repassé vert **5 fois de suite**. Flaky sur la temporisation de la
barre, sans rapport avec le chantier. Non traité.

## `feat/barre-de-production` (ADR-0041) — 2026-08-06

### `conftest.py` remplace les FABRIQUES de file : une file neuve doit y être ajoutée

Le fixture `autouse` `file_rq_factice` patche `_redis`, `production_queue` et `render_queue` —
**les fabriques, pas les fonctions `enqueue_*`** (patcher celles-ci est vert et sans effet :
`runs_router` les importe au niveau module). L'ADR-0041 ajoute `priority_queue` : **l'oublier
aurait rouvert la fuite exactement là où elle avait déjà eu lieu** (18 jobs fantômes dans la file
de dev le 2026-08-04), et sur le chemin le PLUS testé, puisqu'un clic de Papa passe désormais par
la file prioritaire.
**Parade** : toute nouvelle file RQ s'ajoute dans `originales` ET dans les trois `monkeypatch.setattr`.

### Un index change l'ordre d'un `select` sans `ORDER BY`

`test_lesson_content_service.py::_jobs()` faisait `select(AIJob).where(...)` **sans `order_by`**, et
ses assertions lisaient « l'ordre de création » par coïncidence. Le nouvel index
`ix_ai_jobs_type_status` a changé le plan SQLite : `failed` est passé avant `succeeded`. **Aucun
comportement n'avait bougé** — la requête du test était sous-spécifiée.
**Parade** : dans un test, tout `select` dont on lit l'ORDRE porte un `order_by` explicite. Un
échec de ce type après l'ajout d'un index n'est pas une régression, c'est une révélation.

### La pilule du header s'ÉCRASE au lieu de se replier

Mesuré sur la maquette : sans échelle de repli, à **700 px** de header le libellé tombait à
**0 px** en occupant encore 244 px, et à **560 px** les cinq états se réduisaient à 104 px de
décoration illisible.
**Parade** : paliers explicites (980 / 880 / 800 px), du moins informatif au plus informatif, sur
la largeur du **conteneur** — jamais du viewport. Et deux exceptions : un **échec** et un **arrêt**
gardent leur mot à toute largeur, parce que ce sont des états d'anomalie et non d'avancement.

### `graphify affected` peut rendre « No affected nodes » sur une fonction utilisée

`graphify affected "active_run"` rend une liste **vide** alors que
`production/runs_router.py:87` l'appelle (`runs.active_run(db)` — accès par attribut de module).
La cage `/slice` met en garde contre `explain` ; `affected` a le même angle mort.
**Parade** : ne jamais s'en servir seul comme liste de non-régression — recouper au `grep`.

### Rendre `equip-notion` asynchrone casse un ORDRE non documenté

`useCouncilClass.ts:195` équipe N notions **puis** crée les missions, « leurs étapes résolvent les
ressources fraîches ». Un appel non bloquant ferait composer des missions sur un kit inexistant.
**Parade retenue** : le client `equipNotion()` sonde `GET /ai/jobs/{id}` jusqu'à complétion — la
requête HTTP ne tient plus 90 s, la barre du header montre l'avancement, et l'ordre est préservé.

### 🔴 Ajouter une file RQ rend `production_worker_alive()` menteur — trouvé À L'ÉCRAN

Le 2026-08-06, premier équipement réel après l'ajout de la file prioritaire : la barre est restée
sur « ZETIS va produire · en file d'attente », indéfiniment, avec `worker_alive: true`.

Relevé, sans ambiguïté :

```
rq:queue:production-priority = 1 job      rq:workers:production-priority = 0
rq:queue:production          = 0          rq:workers:production          = 2
```

**Cause** : `production_worker_alive()` n'interrogeait que `production_queue()`. Les workers en
vie avaient été démarrés **avant** le changement — ils n'écoutaient que la file normale. Le
travail dormait sur une file que personne ne consommait, et l'indicateur affirmait une santé.
C'est la panne de six heures du 2026-08-05 que cette fonction devait rendre visible, réintroduite
par la file qu'on venait d'ajouter.

**Parade** : `all()` sur `production_queues()` — une seule file non servie suffit à bloquer le
travail qui s'y trouve. Test-verrou `test_un_worker_qui_n_ecoute_QU_UNE_file_ne_compte_pas`,
vérifié par sabotage (`all` → `any` le fait rougir).

⚠️ **Et la règle d'exploitation qui va avec** : après tout ajout de file, **redémarrer le worker**
(`pkill -f app.production_worker` puis `pnpm dev:worker`). Un worker vivant n'est pas un worker à
jour.

### La barre du header s'écrasait à 30 px — mesurer le CONTENEUR ne suffit pas

Contrôle responsive du 2026-08-06, à 644 px de header : pilule **30 px**, libellé **0 px**.
L'échelle de repli existait pourtant, et elle était juste sur la maquette.

**Cause, en deux temps** :

1. `useLargeurConteneur` observait **son propre conteneur** — lequel est DÉJÀ écrasé quand elle le
   lit, puisque la pilule de production est le seul des trois blocs du header à céder. Les seuils
   se déclenchaient donc sur un espace déjà perdu, c'est-à-dire jamais.
2. Rien ne l'empêchait de céder jusqu'à **zéro** : la pilule d'identité passait à deux lignes
   plutôt que d'abandonner « Période : 2026 — 4ᵉ ».

**Parade** : observer le **`<header>`** (`ref.current.closest("header")`), donner à la pilule un
**plancher** (`min-w-[150px]`, sa forme réduite), et faire **céder le contexte d'abord** —
« Période » sous `lg`, « Enfant » et « Exporter » sous `md`. La signature « ZETIS Papa » ne part
jamais : c'est elle qui distingue les deux frontends.

⚠️ **Et un piège de MESURE, payé deux fois** : `textContent` renvoie le texte des éléments
`display:none`. Une assertion « ce libellé a bien cédé » bâtie dessus est **toujours fausse**.
Mesurer `getBoundingClientRect().width > 0`.

⚠️ **La maquette ne pouvait pas trouver ce défaut** : elle n'avait pas les deux pilules réelles
qui se disputent la place. C'est le contrôle responsive à l'écran, et lui seul, qui l'a sorti.

### La barre ne peut pas voir un travail plus court que son sondage

Contrôle 2 du 2026-08-06 : un équipement lancé depuis le Conseil sur une notion **déjà équipée**
a vécu **11 ms** (`generated: []`, les cinq pièces `skipped`). Le header n'a rien affiché — période
de sondage : **4 s**. Le travail est né et mort entre deux lectures.

Même classe que le défaut corrigé le 2026-08-03 sur `useActiveProductionRun` (« un lot-pièce dure
15 à 17 s : à 20 s de période, l'indicateur pouvait ne JAMAIS voir un lot entier »), à plus petite
échelle.

**Ce n'est pas un bug d'affichage** : pour 11 ms de travail il n'y a rien d'utile à montrer, et
aucune production n'a eu lieu. Mais l'attente « les deux surfaces disent la même chose au même
moment » est violée.

**Parade à écrire** : raccourcir la période ne supprime pas la course. C'est **le client qui vient
d'enfiler** qui doit réveiller la barre (un rafraîchissement immédiat après l'appel), plutôt que
d'attendre le prochain tour.

⚠️ **Et le vrai enseignement** : pendant ces 11 ms, la page du Conseil a déroulé son pipeline
« Cours · Fiche · Cartes · Quiz · Carte mentale » pendant une dizaine de secondes — `EQUIP_MS`
**devine**. Le header **mesure**. Les deux ne peuvent pas rester d'accord : c'est très exactement
ce que la Slice C (mort des 23 constantes) vient réparer.

---

## `feat/barre-de-production` — Slice B, la durabilité (ADR-0041 §10) — 2026-08-06

### 🔴 Le cadrage comptait DEUX trous d'enfilement ; il y en avait TROIS

Le prompt de la Session B nommait `enqueue_production` et `enqueue_render`. Il avait été écrit
**avant la Slice A**, qui a créé `enqueue_ai_job` — avec le même trou, et sur **le chemin de la
barre**. Un prompt de cadrage vieillit dès que la slice précédente touche la même zone.
**Parade** : au read-before-code, ne pas vérifier seulement que les constats du prompt sont vrais,
mais **rechercher ce que la slice précédente a ajouté** dans le même périmètre.

### 🔴 Le monde des travaux unitaires est né avec le bug déjà réparé à côté de lui

Le §1 avait corrigé `run_out` (il rendait `run.status` brut, donc un lot mort s'affichait
`running`) en passant par `journal.run_status`. La Slice A a créé `activity._travail` en rendant
`job.status` **brut** — la même faute, quinze lignes plus bas, le même jour.
**Parade** : quand une lecture dérivée existe pour un modèle (`run_status`), tout modèle **frère**
en a besoin. `sweep.job_status` est désormais son miroir explicite, et son docstring le dit.

### ⚠️ « Greffer le balayage sur le réveil déjà en place » aurait fait mentir la barre 3 heures

`production_scan_interval_minutes` vaut **180**. Une barre qui n'aurait dit la vérité qu'après ce
passage aurait rouvert le défaut que le chantier ferme.
**Parade** : séparer les deux gestes. La vérité se **dérive à la lecture** (instantanée, §1) ; le
balayage périodique n'est que du **ménage en base**. Et il tourne aussi au démarrage du worker
(`production_worker.py` amorce le scan) — c'est-à-dire au meilleur moment : celui qui vient de
mourir est de retour.

### ⚠️ `raise` a CHANGÉ DE SENS dans `run_ai_job` le jour où `Retry` est apparu

Avant : « que RQ voie l'échec », par symétrie avec `worker_media.jobs.render_capsule`. Depuis que
`enqueue_ai_job` pose un `Retry`, **laisser remonter une exception veut dire *rejoue-moi*** — RQ ne
regarde pas laquelle. Un `raise` remis par réflexe rendrait le rejeu typé silencieusement
inopérant, et **aucun test des files ne rougirait** : elles sont factices (§15).
**Parade** : un test-verrou dont l'assertion est l'**absence** de `pytest.raises`
(`test_echec_structurel_zero_rejeu`), et le docstring de `run_ai_job` qui le dit en tête.

### ⚠️ La capsule : une panne de file faisait DISPARAÎTRE une vidéo déjà rendue

`request_render` passait la capsule en `rendering` **et effaçait `video_url`** avant d'enfiler.
Redis absent ⇒ capsule bloquée « en cours de rendu » indéfiniment, et la vidéo précédente — qui
existait toujours sur le disque — devenue invisible.
**Parade** : compensation (restaurer statut **et** `video_url`), pas inversion de l'ordre. Enfiler
avant de commiter ouvrirait une course : le worker peut finir et écrire `published` avant que notre
commit repasse la capsule en `rendering`. *Une compensation se voit dans le code ; une course ne se
voit qu'en production.*

### 🔴 Un test-verrou VERT sur son sabotage — parce qu'il passait par la mauvaise garde

`test_un_travail_qui_ATTEND_n_est_pas_un_travail_mort` créait un travail `queued` **sans
`started_at`**. Il sortait donc par la garde « rien à juger » et non par la garde sur le statut :
supprimer celle-ci le laissait **vert**. Quatrième occurrence de ce motif dans le dépôt.
**Parade** : le cas rejoué est celui qui est réellement atteignable — un travail rendu à la file
après un échec transitoire **garde le `started_at` de sa première tentative**. Et, plus
généralement : sur une fonction à plusieurs gardes, un sabotage doit viser **chaque garde
séparément**, sinon il mesure la première.

### Où lire l'état quand la barre dit « arrêté »

| Ce que l'écran montre | Ce que ça veut dire | Le geste |
|---|---|---|
| pilule ambre, `worker_alive: false` | aucun worker n'écoute **une** des deux files | `python -m app.production_worker` |
| une ligne `stale` alors que le worker tourne | ce travail-là est mort seul (OOM, work-horse tué) | il se referme au prochain réveil ; acquitter ensuite |
| `503` au clic | la file n'a pas pris le travail — **rien n'a été créé** | vérifier Redis, puis recliquer |

---

## `feat/barre-de-production` — Slice C, la migration du reste (ADR-0041 §4, §9) — 2026-08-06

### 🔴 STOP-ON-BLOCKER : un test-verrou d'architecture a refusé le premier design

`test_production_equipment.py::test_les_generateurs_nimportent_pas_production` interdit aux cinq
modules générateurs (`curriculum`, `fiches`, `memory`, `mindmaps`, `quizzes`) d'importer
`modules.production` — parce que `production.equipment` **les appelle**, donc l'inverse fermerait le
cycle. Le helper d'enfilement avait été écrit dans `production/travaux.py`, et quinze routes de
générateurs l'importaient. Le verrou a rougi ; il avait raison.
**Parade** : le module a été déplacé dans **`ai/travaux.py`**. `ai` possède déjà `AIJob`, n'importe
aucun générateur, et les générateurs l'importent tous depuis toujours (`get_provider`). La
dépendance va dans le sens qui existait — aucun cycle, en substance et pas seulement à la lettre.
⚠️ **Ne pas ramener ce module dans `production/`** sans rouvrir la question du cycle.

### 🔴 Migrer une route en file peut DÉPLACER une validation — et un test l'a prouvé

`POST /diagnostics/generate` rendait `404` sur une matière inconnue. Passée en `202`, elle aurait
rendu « accepté » puis un travail en échec deux minutes plus tard.
**Règle posée** : *la file diffère le TRAVAIL, jamais le VERDICT sur la demande.* Toute validation
**bon marché** (une lecture indexée) est rejouée dans la route avant d'enfiler — `_subject_or_404`,
`_validated_lesson_or_409`, le `409` de leçon archivée. Le service garde la sienne : le monde peut
changer entre le clic et l'exécution. La double vérification est voulue, pas une redite.

### Une route asynchrone a besoin d'un GET pour relire ce qu'elle a produit

`generate-content` rendait la leçon rédigée. En `202`, elle ne rend plus qu'un `job_id` — et il
n'existait **aucun** `GET /api/lessons/{id}` côté Papa. Sans lui, l'écran aurait dû recharger tout
le chapitre pour une leçon.
**Parade** : la route a été ajoutée. À prévoir pour tout producteur migré dont la sortie n'est pas
auto-suffisante (`quiz` et `diagnostic` n'en ont pas eu besoin : leur sortie EST leur ancien
contrat).

### Insérer un import par script casse un bloc `from … import (`

Un script d'insertion « après le dernier `from app.` » a écrit **à l'intérieur** de trois blocs
d'import multi-lignes (`mindmaps`, `quizzes`, `curriculum`), produisant un `SyntaxError` silencieux
jusqu'à l'import du module. Deux fichiers manquaient en plus `status` dans leur import `fastapi`.
**Parade** : pour un import, viser une ancre **fermée** (la ligne `)` du bloc, ou la ligne
`router = APIRouter(`), jamais « le dernier `from` ». Et vérifier par `import app.main` juste après.

### Une variable locale peut masquer un module fraîchement importé

`activity.read()` a une variable locale `travaux` (la liste des travaux unitaires). Importer
`from app.modules.ai import travaux` au niveau module l'a rendue **inatteignable après la ligne 174**
— masquage silencieux, qui n'aurait pété qu'à l'appel.
**Parade** : importer les **fonctions** (`from …travaux import estimation_ms, estimations`) quand le
nom du module est un mot courant du domaine.

### L'estimation d'une durée : la mesurer plutôt que la déplacer

Le réflexe était de rassembler les 23 constantes dans une table côté serveur. Ç'aurait laissé des
devinettes, simplement plus loin de l'écran. Or `ai_jobs.duration_ms` enregistre depuis toujours ce
que **chaque travail a réellement duré**, et l'index `(job_type, status)` de la slice A le rend
lisible pour rien.
**Parade** : `ai/travaux.estimations()` rend la **médiane des dernières exécutions réussies** par
type ; les valeurs en dur ne sont plus que des **amorces**. ⚠️ Médiane et non moyenne : un travail
qui a attendu Massimo tirerait une moyenne vers le haut de façon permanente.

### 🔴 Un `toContain` sur un nom de champ reste VERT quand la règle est violée

Le verrou « les trois surfaces d'équipement lisent la mesure du serveur » cherchait `estimated_ms`
**n'importe où** dans le fichier. Sabotage : remplacer la durée par `69000` — le verrou est resté
**vert**, parce que le champ figurait encore dans la CONDITION d'activation
(`&& (item?.estimated_ms ?? 0) > 0`) et dans un commentaire. **Cinquième occurrence** de ce motif
dans le dépôt.
**Parade** : un verrou lexical vise **l'endroit exact où la règle s'applique** — ici le 2ᵉ argument
de `useEstimatedProgress`, extrait par regex, jamais le fichier entier.

### `vi.mock` sur un module ne change pas ce que ce module s'appelle À LUI-MÊME

`useEstimations` appelle `fetchEstimations` par sa **liaison locale**, pas par l'espace de noms du
module : un `vi.mock` avec `importActual` remplace l'export sans toucher l'appel interne. Le mock
était vert et sans effet — exactement la classe de piège documentée côté backend pour `enqueue_*`.
**Parade** : couper plus bas (`vi.spyOn(globalThis, "fetch")`), ce qui garde le hook RÉEL et
continue donc de le prouver.

### Une barre qui n'estime plus toute seule affiche son % un tic plus tard

Deux tests exigeaient un `%` **synchrone** après le clic. La durée venant maintenant du serveur, la
barre est indéterminée jusqu'à la première réponse — comportement voulu (§9 : on ne devine plus).
**Parade** : `await waitFor(...)`. ⚠️ L'assertion ne bouge pas, seule son échéance — relâcher
l'assertion aurait masqué la régression qu'elle protège.

### Migrer une barre, c'est aussi vérifier QUEL travail elle annonce

`ProgrammePage` et `LessonsPanel` ont été mappés sur `lesson_content` au premier jet. Or leurs
libellés disent « ZETIS génère les **chapitres** » et « propose les **leçons** » : les bons types
sont `curriculum_chapters` et `curriculum_lessons`. La durée venait du bon serveur, mais du mauvais
travail — attrapé par `ProgrammePage.test.tsx`.
**Parade** : lire le **libellé affiché** de la barre avant de choisir son `job_type`, pas le nom du
fichier.

### Une vue qui ne portait pas la durée perdait sa barre

Les composants ayant cessé d'estimer, `/runs/active` s'est retrouvé sans rien à estimer : un
lot-PIÈCE **retrouvé au retour sur la page** perdait sa barre (`DemandesPage.test.tsx`).
**Parade** : `run_out` porte `estimated_ms`. ⚠️ Généraliser : retirer une estimation locale oblige
à vérifier que **chaque vue** du même objet porte la mesure — deux vues qui ne portent pas les
mêmes champs finissent par diverger.

### 🔴 Migrer `curriculum_*` en file annule la dérogation cloud — en silence

`run_ai_job` passe `get_provider()`, c'est-à-dire le moteur **LOCAL**. Un exécutant `curriculum_*`
qui se contenterait de son argument `llm` produirait un référentiel de programme avec Ollama au lieu
d'Anthropic (ADR-0009) : même code, même sortie apparente, aucun test pour le dire.
**Parade** : les exécutants appellent `get_curriculum_provider()` eux-mêmes
(`jobs._curriculum_provider`), et un verrou le vérifie **avec le moteur local piégé** — l'appeler
fait échouer le travail. Affirmer seulement « le cloud a été appelé » aurait laissé passer un
exécutant qui appelle les deux.

⚠️ **Corollaire pour `conftest`** : le fixture `executer_travail` doit mocker
`curriculum.get_curriculum_provider` ET `tts.get_tts`. Le worker n'a **aucune dépendance FastAPI** :
les surcharges de `client_db` ne l'atteignent pas, et l'oubli ferait partir un vrai appel Anthropic
depuis la suite de tests.

### Retirer une dépendance FastAPI peut retirer un REFUS

`skills-backfill/generate` rendait `503` quand la clé cloud manquait — via `Depends(get_curriculum_provider)`,
pas via le corps de la route. La migration a supprimé la dépendance devenue inutile… et le refus
avec. Papa aurait obtenu `202` sur un clic qui ne pouvait pas aboutir.
**Parade** : garder la dépendance comme **précondition**, avec un nom qui le dit (`_cloud`) et le
commentaire qui l'explique. ⚠️ Généraliser : avant de retirer un `Depends`, se demander **ce qu'il
lève**, pas seulement ce qu'il rend.

### Un helper de test qui affirme `202` ne convient pas aux tests de REFUS

`poster_et_executer` affirme le `202` — c'est voulu (une route repassée en synchrone rougit ici).
Mais le test du `409` sur chapitre non validé doit appeler la route **directement** : passer par le
helper aurait masqué le contrat qu'il vérifie.

---

## Vérification À L'ÉCRAN de l'ADR-0041 (slices B + C) — 2026-08-06

Contrôle réel : backend `:8000`, front Papa `:5174`, worker de production, génération de cartes SRS
par matière. **Quatre choses trouvées, dont trois défauts de code.**

### 🔴 Un `SimpleWorker` RQ ne recharge JAMAIS le code — et l'écran accuse le code

Trois workers tournaient : deux récents, un de **163 minutes**, démarré avant l'ajout de
`_srs_cards_generate` à `_EXECUTANTS`. Le premier clic est tombé sur un worker à jour et a réussi ;
le second sur le périmé, qui a répondu **« Aucun exécutant pour "srs_cards_generate" »** — un
message qui se lit exactement comme un bug de la migration.
**Parade** : après toute modification de `_EXECUTANTS` (ou de tout code que le worker exécute),
**redémarrer TOUS les workers**. `uvicorn --reload` recharge le backend, pas eux. ⚠️ Et vérifier
qu'il n'en traîne pas d'anciens : `Worker.all(queue=...)` avec leur `birth_date`.

### 🔴 L'estimation comptait les traces IMBRIQUÉES, et sous-estimait d'un facteur 8

Mesuré en vrai : une génération de cartes par matière = **un travail de file de 53,6 s** contenant
**quatre traces de 5 à 6 s**. Les traces portent le même `job_type` et sont beaucoup plus
nombreuses : la statistique servait **7,2 s**. La barre a atteint 100 % au bout de sept secondes et
**traîné quarante-six secondes** — le défaut que le §9 nommait avant même ce chantier.
**Parade** : `enfiler()` marque ses lignes `created_by="file"` (`travaux.ACTEUR_FILE`), et
`estimations()` ne compte **que** celles-là. ⚠️ Conséquence assumée : un type sans cinq exécutions
de file sert son amorce, même avec des centaines de traces en base — une trace mesure un appel, pas
le travail que la barre montre.

### 🔴 La médiane ne décrit rien sur une population MULTIMODALE

`equip_notion` : sur 18 exécutions, huit à ~0 s (notion déjà équipée), cinq à ~7 s (kit partiel),
cinq de 31 à 86 s (kit complet). Médiane = **7 s** pour un travail qui en dure **69 à 77**.
**Parade** : le **p75** avec un **plancher de 2 s** (un travail plus court que la période de
sondage n'a jamais eu de barre, il ne peut rien lui apprendre). Rend 76,9 s — la mesure réelle.
Et sous-estimer est le pire des deux sens : une barre trop courte *traîne*.

### 🔴 Le header parlait technique à Papa

`LIBELLE_JOB` ne portait qu'`equip_notion` ; le repli « un mot technique vaut mieux qu'une barre
anonyme » était juste avec UN producteur migré, il est devenu le cas général avec quinze. Le header
a affiché **« srs_cards_generate »** en toutes lettres.
**Parade** : la table couvre les dix-huit types. ⚠️ **À ne pas confondre avec le motif d'échec**,
dont la traduction a été explicitement écartée le même jour : un motif sert à savoir quoi réparer,
un libellé dit ce qui se passe.

### ✅ Ce que l'écran a CONFIRMÉ

- **Les deux barres disent la même chose** : header `≈ 62 %` / page `64 %` sur le même travail, un
  tic de sondage d'écart. C'est la promesse du §9, tenue.
- **`GET /production/estimations` est bien appelé** par la page, et sert des durées mesurées.
- **L'échec reste, avec son motif brut, et « J'ai vu » l'efface** — `acknowledged_at` écrit en base,
  donc l'acquittement ne revient sur aucun appareil (§8).
- **Le header est vide quand rien ne tourne**, et la pilule paraît au clic (§7).

### ⚠️ Piège d'environnement : le front `:5175` sans `VITE_API_URL`

Un Vite orphelin sur `:5175` tape sur `:8000` par défaut, dont le CORS n'autorise que `:5173` et
`:5174` → **« Failed to fetch »** au login, sans message clair. C'est la paire qui compte, pas le
port : voir la mémoire `zetis-serveurs-dev-ports`.

## Cadrage de l'ADR-0048 (anti-triche du diagnostic) — 2026-08-09

Session de **cadrage** : aucune ligne de code, donc aucun écart d'exécution. Un seul piège, et il
est **méthodologique** — il a produit une affirmation fausse dans **cinq documents**.

### 🔴 En zsh, un `--include=*.ts` non quoté TUE la commande — et l'absence de sortie se lit comme une absence de RÉSULTATS

**Ce qui s'est passé.** Pour savoir si la dictée vocale existait en brique réutilisable, j'ai lancé :

```bash
ls apps/frontend-massimo/src/components/ | head -30
echo "=== dictée ==="
grep -rln "useDictation\|Dictee\|micro\|Mic" apps/frontend-massimo/src --include=*.tsx --include=*.ts
```

zsh a répondu `(eval):1: no matches found: --include=*.ts` **et la commande est morte**. Les deux
premières parties avaient déjà affiché leur sortie ; sous l'en-tête `=== dictée ===`, **il n'y avait
rien**. J'ai lu ce vide comme *« aucune brique de dictée »* et j'ai écrit — dans l'ADR, la spec, le
prompt, la maquette et le `BACKLOG` — que la dictée *« vit dans `Eli5Session.tsx`, pas dans une
brique réutilisable »*, et qu'il faudrait « refactorer ou dupliquer ».

**C'était faux.** `apps/frontend-massimo/src/lib/dictation.ts` (102 lignes) expose
`isDictationSupported()`, `startRecording()` et le type `Recording`, et il est **déjà importé par
deux écrans** : `hooks/useEli5.ts` et `pages/ChatPage.tsx`. Cette erreur a servi de **seule
justification** à une exclusion de périmètre.

**La cause exacte.** zsh — contrairement à bash — refuse un motif de glob sans correspondance au lieu
de le passer littéralement, et **abandonne toute la commande**. Ce n'est pas propre à `grep` : tout
argument contenant `*` non quoté est concerné.

**Deux parades, et la seconde est la vraie.**

1. **Quoter le motif** : `--include='*.ts'` — vérifié, rend bien `lib/dictation.ts`.
2. 🔴 **Ne jamais lire un vide comme un résultat.** Un `grep` qui ne trouve rien sort en **code 1**
   sans message ; un `grep` qui n'a jamais tourné sort en **code 1 avec un message sur stderr**. Les
   deux se ressemblent quand on ne regarde que stdout. **Contrôle le code de sortie, ou fais dire à
   la commande ce qu'elle a fait** — par exemple terminer par `; echo "code: $?"`, ou faire suivre
   d'un `echo "(vide = aucun résultat)"` qui, lui, ne s'affichera pas si la commande est morte.

⚠️ **Le vrai enseignement dépasse zsh** : le read-before-code protège contre une doc périmée, pas
contre une **commande qui n'a pas tourné**. Une affirmation négative (« ça n'existe pas ») tirée d'un
outil de recherche doit être confirmée par une commande qui, elle, rend quelque chose — ici,
`ls apps/frontend-massimo/src/lib/` aurait suffi.

## Session A de l'ADR-0048 (le backend apprend à douter) — 2026-08-09

### 🔴 Un id de révision Alembic DÉJÀ PRIS ne dit pas « doublon » — il dit « Cycle is detected »

**Ce qui s'est passé.** J'ai numéroté la migration à la main : `c3d4e5f6a7b8`. Cet id était **déjà
celui** de `c3d4e5f6a7b8_add_capsule_lot1_fields.py`. Alembic n'a pas dit « revision dupliquée » ;
il a répondu :

```
ERROR [alembic.util.messaging] Cycle is detected in revisions (a1b2c3d4e5f7, a1b2c3d4e5f9, … 42 ids …)
```

**Quarante-deux révisions listées, dont aucune n'est la cause.** Le message ne nomme ni le doublon,
ni les deux fichiers concernés.

**Comment on trouve, en une commande** : sortir sa propre migration du dossier et relancer. Si le
cycle disparaît, c'est le nouveau fichier — et alors :

```bash
grep -h '^revision = ' alembic/versions/*.py | sort | uniq -d
```

**La parade** : ne pas inventer d'id à la main sans le vérifier, et surtout —

### 🔴 `alembic heads` est l'AUTORITÉ sur la tête, pas un `grep` sur `down_revision`

J'avais écrit un script Python pour trouver la tête du graphe : il a rendu `a1b2c3d4e5f9`. **La
vraie tête est `a9b0c1d2e3f4`**, et `alembic heads` le dit en une ligne.

**La cause** : le dépôt écrit `down_revision` sous **deux formes**, et un regex sur
`^down_revision\s*=` ne voit que la première :

```python
down_revision = "f7a8b9c0d1e2"                    # forme A
down_revision: str | None = "a1b2c3d4e5f9"        # forme B — annotée, ratée par le regex naïf
```

Une migration greffée sur une fausse tête crée une **branche silencieuse** : `alembic upgrade head`
échoue avec « multiple heads », ou pire, applique une moitié du graphe.

### 🔴 Six sabotages sur quinze n'avaient pas été APPLIQUÉS — et « prouvaient » quelque chose

Le script de sabotage passait ses motifs à un helper Python via `zsh`. **`zsh` transmet `\n` en deux
caractères** : les motifs multi-lignes ne matchaient jamais, et les remplacements injectaient un
`\n` littéral dans le source → `SyntaxError`. Le test « échouait », donc paraissait rouge.

**Ce qui a sauvé la mesure** : le script distinguait explicitement **trois** issues — `rouge`,
`RESTÉ VERT`, et **`SABOTAGE NON APPLIQUÉ (motif absent)`** — et refusait de compter les deux
dernières. Sans ce troisième cas, six verrous creux auraient été annoncés comme tenus.

**La parade, générale** : un script de sabotage doit **échouer bruyamment** quand la substitution
n'a pas eu lieu, et interpréter ses `\n` (`avant.replace("\\n", "\n")`).

### 🔴 Un sabotage peut rester VERT parce qu'une AUTRE protection joue — et le verrou n'est pas mauvais

Sabotage : ajouter `"fiabilite": attempt.reliability_json` à la vue enfant, pour vérifier que
`test_MASSIMO_ne_voit_RIEN_du_verdict` rougit. **Il est resté vert.**

**Ce n'est pas un défaut du test** : `DiagnosticResultOut` ne déclare pas ce champ, et
`response_model` le retire **en silence**. Le mécanisme qui a coûté deux chantiers au dépôt
(ADR-0045 puis ADR-0047) jouait ici **en notre faveur**.

**Le sabotage qui vise juste demande DEUX gestes** : produire le champ dans le service **et** le
déclarer dans le schéma enfant. Rejoué ainsi → rouge.

⚠️ **La leçon dépasse ce test** : quand un sabotage reste vert, la question n'est pas seulement
« mon verrou est-il mauvais ? » mais **« qu'est-ce qui protège déjà, et le test le sait-il ? »**.
Un verrou dont on ignore le vrai gardien sera cru mort le jour où le gardien changera.

## Sessions B et C de l'ADR-0048 (le front) — 2026-08-09

### 🔴 Une ligne de HORS-PÉRIMÈTRE d'un ADR n'est pas un fait vérifié — elle décrivait un écran qui n'existe pas

**Ce qui s'est passé.** L'`adr-0044:291` range en hors-périmètre *« l'**écran de passation** (une
question à la fois, barre de progression) »*. Cette phrase a été recopiée dans l'`adr-0048`, puis
dans sa spec, et **deux des six signaux de l'anti-triche ont été conçus dessus** : « question
quittée **avant d'être répondue** » et « temps entre l'**affichage** de la question et sa réponse ».

**Vérifié au read-before-code de la Session B** : `DiagnosticPage.tsx:227` rend **toutes les
questions d'un bloc**, empilées dans une page qui défile, avec un seul « Envoyer mes réponses ».

```bash
grep -n "currentQuestion\|questionIndex\|step\b" apps/frontend-massimo/src/pages/DiagnosticPage.tsx
# → rien. Ni question courante, ni barre de progression.
```

**Les deux signaux étaient inimplémentables**, et le chantier les aurait faits semblant. Ils ont dû
descendre au niveau de la **passation** (ADR-0048 Décision 1 bis) — on garde le fait, on perd le
rattachement à une question.

**La leçon, et elle dépasse ce cas** : un ADR décrit ce qu'il **décide**, pas nécessairement ce qui
**existe**. Sa section « hors périmètre » est la plus exposée : elle nomme des choses qu'on n'a
justement pas regardées. **Ce qu'un ADR range en hors-périmètre se vérifie comme n'importe quelle
autre hypothèse** — surtout quand on construit dessus.

⚠️ C'est le troisième document du dépôt à décrire un écran qui n'existe pas : la spec de Massimo le
documente déjà sur sa propre v1 (*« décrivait un écran qui n'a jamais existé »*).

### 🔴 Les tests de MASSIMO ne sont pas typecheckés — ceux de PAPA le sont

```jsonc
// apps/frontend-massimo/tsconfig.app.json
"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test"]
```

Papa n'a pas cette exclusion. **Conséquence mesurée le même jour, sur le même changement de
contrat** : ajouter un champ requis à `DiagnosticResult` a produit **6 erreurs `tsc` côté Papa**
(fixtures de test incomplètes, corrigées) et **zéro côté Massimo** — dont le décor
`DiagnosticPage.test.tsx` est resté sans `verbalisation`, avec un `tsc -b` vert.

⚠️ **Un `tsc -b` vert ne dit rien des tests de Massimo.** Et vitest ne typecheck pas non plus
(transform esbuild). Un décor peut donc y décrire un contrat qui n'existe plus, indéfiniment.

### 🔴 Trois verrous ont visé à côté, et le contrôle d'application les a tous attrapés

Aucun n'a été trouvé par relecture. **Les trois auraient rassuré à tort.**

| Verrou | Pourquoi il restait vert | La bonne visée |
|---|---|---|
| « Massimo ne voit rien du verdict » | `response_model` retirait déjà le champ **en silence** | la fuite demande **deux** gestes : service **et** schéma enfant |
| « Passer n'envoie rien » | le champ était **vide**, la garde `if (!propre) return` bloquait | remplir le champ **avant** de cliquer Passer |
| « aucun libellé ne prend l'enfant pour sujet » | balayait tout le rail et rougissait sur sa **légende** légitime (« chez Massimo s'il lui a été proposé », `adr-0045 §6`) | scoper à la **ligne** de la marque |

**La leçon** : quand un sabotage reste vert, la question n'est pas seulement *« mon verrou est-il
mauvais ? »* mais **« qu'est-ce qui protège déjà, et le test le sait-il ? »**. Et un verrou **trop
large** est aussi dangereux qu'un verrou trop étroit : il interdit du texte légitime, et finit
désarmé par la première personne qui l'assouplit.

### ⚠️ `requestFullscreen` doit être appelé AVANT le premier `await`, pas après

Le plein écran exige le **contexte de geste utilisateur**, que le premier `await` fait perdre.
`startQuiz(quizId)` chargeait le quiz (`await fetchDiagnosticQuiz`) **avant** de pouvoir demander le
plein écran : demandé là, l'appel est **refusé en silence**, sur tous les navigateurs.

**La parade** : `observation.demarrer()` est appelé **en tête du gestionnaire de clic**, avant toute
opération asynchrone. C'est aussi ce qui rend le chronométrage honnête — il démarre au clic, pas à
l'arrivée des questions.

### ⚠️ Un nouveau type partagé doit être ajouté au BARIL, pas seulement au module

`packages/types/src/diagnostic.ts` peut exporter `DiagnosticFiabilite` sans que
`import { DiagnosticFiabilite } from "@zetis/types"` fonctionne : le baril
`packages/types/src/index.ts` ré-exporte **type par type**, nommément. Le message est trompeur —
*« has no exported member named 'DiagnosticFiabilite'. Did you mean 'DiagnosticPalier'? »* — et
suggère une faute de frappe là où il manque une ligne d'export. Piège déjà consigné, retombé dessus.

## Relecture visuelle de l'ADR-0048, sur les deux apps — 2026-08-09

> Cinq défauts trouvés **à l'écran**, avec **36 sabotages rouges et trois suites vertes** derrière.
> C'est le meilleur argument dont dispose ce dépôt pour la relecture humaine : ce qui suit décrit
> *pourquoi* les tests ne pouvaient pas les voir, pas *qu'ils* ne les ont pas vus.

### 🔴 Un verrou dont le NOM promet plus que ses assertions — VERT sur le défaut qu'il nommait

Le test s'appelait **« en relecture, Massimo SE RELIT — on ne lui redemande pas »**. Il vérifiait :
la présence de « Merci », et l'absence du bouton « Envoyer ». **Rien sur la relecture.** L'écran
affichait « Merci ✨ · C'est noté » et **jamais les mots de Massimo**, alors que le serveur les
servait dans le payload (`notion_a_verbaliser` joint `answer_json.explication`) — et que
`docs/backend/fiabilite-de-la-mesure.md:400` écrit noir sur blanc *« Massimo relit ce qu'il a
écrit »*.

**Le mécanisme** : le nom du test décrit l'intention, les assertions décrivent le code. Quand on
écrit les deux dans la même minute, on relit le nom et on croit avoir vérifié l'intention. **Un
`describe`/`it` n'est pas une assertion.**

**La parade** : sur un verrou qui protège une DÉCISION, relire ses assertions **sans lire son nom**
et se demander ce qu'elles interdisent vraiment. Ici : rien de ce que le nom annonçait.
**4ᵉ occurrence du motif dans ce dépôt** (cf. `adr-0039`, la contre-épreuve mal visée, les trois
verrous des sessions B/C).

### 🔴 Un décor semé À LA MAIN peut être IMPOSSIBLE pour le vrai client — et la contradiction s'affiche

La passation 53 portait `plein_ecran_quitte: true` **avec** `plein_ecran` **absent** de
`portee.observables`. La bande affichait donc, à quatre lignes d'écart, « Le plein écran a été
quitté » **et** « Le plein écran n'a pas pu être demandé — iOS Safari le refuse sur iPhone ».

Le vrai client **ne peut pas** produire ça : `useObservationPassation` ne lève le drapeau que si
`pleinEcranDemande` (`:126`), et inscrit `plein_ecran` dans la portée sous exactement la même
condition (`:172`). Les deux champs sont liés **par construction côté client**, et par **rien du
tout côté serveur** — `evaluer()` recopie `conditions["signaux_observables"]` sans le confronter aux
faits.

**Le coût réel** : dix minutes à chercher un défaut de rendu qui n'existait pas. **La parade** :
quand un décor est fabriqué au lieu d'être produit par le vrai chemin, **vérifier ses invariants
croisés avant de conclure quoi que ce soit de l'écran**. Un semis incohérent accuse le code.

### ⚠️ Mesurer un contraste avec un parseur naïf donne 1,06 là où il y a 3,38 — l'`oklab` de Tailwind

`getComputedStyle(el).color` rend **`oklab(0.665 -0.008 -0.038 / 0.7)`** pour un `text-papa-muted/70`
(les opacités Tailwind passent par `color-mix`). Un parseur qui extrait les nombres d'une chaîne lit
`rgb(0.665, -0.008, -0.038)` — **du noir** — et annonce un contraste catastrophique sur une couleur
parfaitement lisible.

**La parade, et elle est courte** : faire composer le **navigateur**. Peindre le fond puis la couleur
sur un canvas 1×1 et relire le pixel — ça gère `oklab`, `color-mix`, l'alpha, tout :

```js
cx.fillStyle = fond;    cx.fillRect(0,0,1,1);
cx.fillStyle = couleur; cx.fillRect(0,0,1,1);
const [r,g,b] = cx.getImageData(0,0,1,1).data;   // le rgb RÉEL, composé
```

⚠️ Le fond aussi doit être **empilé** jusqu'au premier opaque : une bande `bg-papa-warn/10` sur une
surface translucide sur le fond de page fait **trois** couches.

### ⚠️ Le panneau navigateur : l'espace de CLIC fait 800 px, le viewport 1798

Une position lue par `getBoundingClientRect()` est en pixels de **viewport** ; `computer{left_click}`
attend des pixels de **capture d'écran**. Le rapport était de **0,445** cette session. Un clic passé
tel quel atterrit à plus du double de la bonne hauteur — sans erreur, sur un autre élément.

**La parade** : `Math.round(coordonnée * (800 / innerWidth))`. Et `left_click` par coordonnée exige
un `screenshot` **préalable** dans le même onglet, sinon : *« no screenshot dimensions cached »*.
⚠️ `scroll` échoue avec un timeout de 30 s si l'onglet visé **n'est pas au premier plan** —
`tabs_select` d'abord.

### 🔴 Le glob zsh non quoté a REpayé son piège — dans la session qui le documente

`grep -rn "..." --include=*.tsx .` → **`(eval):1: no matches found: --include=*.tsx`**, zéro ligne de
sortie. Le piège est consigné depuis le cadrage de ce même ADR (§ *En zsh, un `--include=*.ts` non
quoté TUE la commande*), et il a quand même été retendu **le même jour**.

Ce n'est pas une redite : c'est la mesure de sa force. **Écrire `--include='*.tsx'`, toujours**, et
traiter une sortie vide comme suspecte tant qu'on n'a pas vu le code de retour.

### 🔴 Une recette « pour défaire » écrite sans être vérifiée aurait DÉTRUIT des données réelles

`MEMORY.md` portait, depuis la clôture précédente, l'ordre de suppression du semis de dev. Passé en
base à la clôture suivante, **trois de ses quatre lignes étaient fausses** :

| Écrit | Vérifié en base |
|---|---|
| `skill_mastery` **28-31** (4 lignes) | **33** lignes touchées |
| `xp_events` **94, 95, 96** | **94 à 97** |
| « 8 `Gap` + 8 `Gap` » | **14** au total (8 Maths + 6 Histoire-Géo) |

🔴 **Et la plus grave n'est pas un chiffre** : `_upsert_skill_mastery` fait des **UPDATE**, pas des
INSERT. Il n'y a **aucun « avant » à restaurer** — la mesure antérieure est écrasée sur place, sans
historique de ligne. Suivre la recette aurait supprimé la maîtrise réelle de Massimo sur des notions
qu'il a vraiment travaillées, en croyant nettoyer un décor de test.

**La cause** : la recette a été écrite en **raisonnant sur le code** (« la passation touche 8
notions, donc 8 lignes ») au lieu d'être **lue en base**. C'est exactement le motif que le point 6
de `/cloture` existe pour attraper, appliqué à autre chose qu'un hash de commit.

**La parade** : toute ligne de `MEMORY.md` qui **nomme des identifiants de base** se vérifie par un
`SELECT` avant d'être écrite — et un semis dont la réversibilité n'a pas été prouvée se déclare
**non réversible**, pas « voici comment le défaire ».

## Un travail dit ce qu'il a produit (addendum ADR-0041) — 2026-08-09

### 🔴 Un même travail écrit DEUX `ai_jobs`, et le Journal n'en montre qu'un — pas celui qu'on croit

`journal_filters.selectionner_travaux` ne retient que `created_by == 'file'` (la ligne enfilée) et
exclut `created_by == 'parent'` (la trace d'appel LLM) — *« 143 traces pour une poignée de gestes »*.
Or **les deux ne portent pas la même sortie** :

| `job_type` | ligne VISIBLE (`file`) | trace EXCLUE (`parent`) |
|---|---|---|
| `lesson_content` | `{"lesson_id": 114}` | `{"content_chars": 4942, "model": …}` |
| `curriculum_lessons` | `{"chapter_id": 44, "lesson_ids": […7 ids]}` | `{"lessons_count": 5, "skills_created": 7}` |
| `srs_cards_generate` | `{"skill_id": 149, "created": 3, …}` | `{"cards": [ … ]}` |

**Parade** : avant d'écrire une règle sur `output_json`, vérifier **sur quelle ligne** le champ vit —
`select id, created_by, output_json from ai_jobs where job_type=… order by id desc limit 4`. Un champ
lu sur la mauvaise ligne donne un `None` silencieux, ou pire : une phrase qu'on n'aurait pas dû
pouvoir écrire.

### 🔴 `lesson_ids` n'est PAS une production — le mot « créées » était un mensonge, et vert

`curriculum_lessons` rend dans `lesson_ids` **l'état résultant du chapitre**, pas ce qu'il vient de
fabriquer. Sur le chapitre 44 il rendait 7 ids dont **deux créés trois jours plus tôt** (114 et 115,
le 06/08) — le job en avait fait 5. L'écran affichait « 7 leçons créées ».

⚠️ **Pire à l'échelle de la page** : trois `curriculum_lessons` successifs sur le chapitre 11
annonçaient « 12 / 8 / 6 leçons créées », soit **26 créations pour un chapitre qui en porte 12**.
Trois lignes qui, mises côte à côte, se contredisaient — et personne ne les additionne en lisant.

🔴 **Ce que ce piège coûte à savoir** : les trois suites étaient vertes, et **les deux test-verrous
avaient été sabotés et rougis**. Aucun test ne pouvait attraper ça — il fallait connaître la date de
création de deux leçons pour douter du participe. **Le sabotage prouve qu'un test mord ; il ne
prouve pas qu'il vise juste.**

**Parade** : pour chaque champ de sortie, se demander *« est-ce un compte de ce qui a été FAIT, ou
un état APRÈS ? »*. En cas de doute, dire l'état (« N leçons au chapitre », ton neutre) — surestimer
est le seul des deux qui trompe.

### ⚠️ `BlockedTargetOut` ne peut pas porter trois des cinq destinations

Il exige `lesson_id` **et** `chapter_id`, non-nuls. Or un diagnostic n'a **aucune** leçon,
`curriculum_lessons` en a **sept**, `srs_cards_generate` n'a qu'un `skill_id`. Le réutiliser
obligerait à inventer des valeurs — ce que `journalLink` et `reviewLink` ont **déjà** refusé chacun
avec sa branche explicite (*« une cinquième entrée forcée dans un type qui ne la veut pas »*).

**Parade** : pour une ligne qui n'est pas leçon-centrée, composer une **route** serveur au format
`pilotageLinks`, plutôt que de tordre le type des pièces.

### 🔴 Aucune surface Papa n'ouvre un diagnostic généré — vérifié, ce n'est pas une impression

- `/quiz` (pilotage) filtre sur `QUIZ_TYPE_MISSION` dans **sept comparaisons de requête**
  (`quizzes/service.py` :108, 635, 647, 830, 900, 1212, 1275) — un `quiz_type='diagnostic'` n'y
  apparaît **jamais** ;
- `/relecture` rend `null` pour `kind === "diagnostic"` (`pilotageLinks.ts:86`, `null` assumé et
  daté) ;
- `/diagnostics` montre les **passations**, pas le quiz généré.

⚠️ **Le `null` de `reviewLink:91` pouvait sembler périmé** — son commentaire renvoie à « la session C
de l'`adr-0043` », qui **a été livrée** (PR #99). Vérifié : il ne l'est pas. `DiagnosticsPapaPage`
tenait son focus en `useState` sans `useSearchParams`. **Un commentaire daté qui nomme un chantier
livré n'est pas pour autant caduc — le relire dans le code, pas dans le journal des PR.**

### ⚠️ La fixture de session DB s'appelle `client_db`, et elle rend un TUPLE

`db_session` n'existe pas dans `app/tests/conftest.py`. La bonne forme :

```python
def test_x(client_db):
    _, TestSession = client_db
    db = TestSession()
```

Et **`AIJob.created_at` est NOT NULL sans défaut serveur** : un `m.AIJob(...)` monté à la main dans
un test doit le porter, sinon `IntegrityError` sur SQLite. `_seed_year` rend `(student, subject,
chapter)`, pas le seul chapitre.

## L'agenda devient utilisable — six addenda ADR-0025 §13→§17 — 2026-08-10

> Chantier où **cinq décisions sur six sont nées de l'écran, aucune d'un test**. Les trois suites
> étaient vertes et **tous les verrous avaient été sabotés puis rougis** — et l'œil a quand même
> rapporté quatre défauts. Les pièges ci-dessous sont ceux qui reviendront.

### 🔴 Un verrou de dépôt limité au FRONT aurait été vert sur trois phrases fautives

Le §16 exige qu'aucune chaîne rendue à Massimo ne nomme l'adulte. Un test balayant
`apps/frontend-massimo/src` semblait suffire — il ne l'était pas : **le libellé du bouton de
demande du chat est fabriqué côté SERVEUR** (`chat/actions.py`, `ChatAction.label`, servi tel quel
et rendu par `📩 {action.label}`). Deux `note=` du même module étaient dans le même cas.

Trois phrases fautives, dont **celle que Massimo lit le plus souvent** quand ZETIS n'a pas de
contenu — et le verrou front les aurait déclarées absentes.

**Parade** : avant d'écrire un verrou de vocabulaire, chercher **qui compose la phrase**, pas où
elle s'affiche. `grep -rn '"[^"]*<mot>' apps/backend/app/modules` a suffi à les trouver. Le dépôt a
maintenant **deux** verrous jumeaux (`src/voix-de-zetis.test.ts`, `app/tests/test_voix_de_zetis.py`).

### 🔴 `_KIND_PRIORITY.get(kind, 9)` — un défaut silencieux qu'aucun test existant n'attrape

`production/triggers.py` tient deux constantes : `TRIGGERING_KINDS` (qui déclenche) et
`_KIND_PRIORITY` (dans quel ordre). Ajouter un `kind` à la première **sans** l'ajouter à la seconde
le fait tomber en priorité **9** : il passe systématiquement **dernier**, et le régulateur le
sacrifie en premier.

⚠️ **Rien ne rougit** — le lot part quand même. Vérifié par sabotage : en retirant `lecon` de
`_KIND_PRIORITY`, le test « la leçon déclenche un lot » restait **vert**, seul le test d'ordre
tombait.

**Parade** : les deux constantes se modifient **ensemble**, et un test fixe l'ordre des trois
valeurs déclenchantes avec des **dates inverses de la priorité attendue** — sinon un tri par date
donnerait le même résultat et le test ne prouverait rien.

### 🔴 `alembic current` répond la révision du DEV, et rien ne dit qu'on s'est trompé de base

`app/core/config.py` porte `env_prefix="ZETIS_"`. La variable est donc **`ZETIS_DATABASE_URL`** —
`DATABASE_URL` est **ignorée en silence**, les réglages retombent sur le défaut (localhost:5432),
et `alembic current` répond la révision du **dev** avec l'air de parler à la prod.

C'est arrivé le 2026-08-10 : dev et prod ont répondu `a1b2c3d4e5f8` toutes les deux. Sans le
discriminant, l'`upgrade` partait sur le dev.

**Parade** : le discriminant n'est pas une formalité — `alembic current` doit rendre une révision
**DIFFÉRENTE** de celle du dev, et un second contrôle indépendant (un compte de lignes : la prod
portait 476 notions / 119 leçons, le dev 457 / 157) confirme qu'on parle bien à l'autre base.

### 🔴 Publier un port sur un réseau `internal: true` est accepté puis inopérant

`docker-compose.prod.yml` met le postgres sur le réseau `interne`, déclaré `internal: true`. Un
override `ports: ["5433:5432"]` est **accepté** — `docker compose config` montre
`published: "5433"`, `docker inspect` montre le `PortBindings` — et **rien n'écoute sur l'hôte**.
`docker port` rend vide, `nc -z` échoue.

**Parade** : attacher aussi le conteneur au réseau non-interne qui existe déjà :

```yaml
services:
  postgres:
    networks: [interne, externe]
    ports: ["5433:5432"]
```

### ⚠️ `tail -3` ne voit plus le marqueur de fin de `pg_dump` 16

Le contrôle « le dump porte-t-il `PostgreSQL database dump complete` ? » se faisait sur les
dernières lignes. **pg_dump 16 écrit une ligne `\unrestrict <token>` APRÈS le marqueur**, plus des
lignes vides : `tail -3 | grep -c` rend **0** sur un dump parfaitement complet.

Une sauvegarde de 621 Ko, stderr vide, a été déclarée tronquée à tort — et la migration s'est
arrêtée pour rien.

**Parade** : `grep -c "dump complete" "$F"` sur le fichier entier, jamais sur sa fin.

### ⚠️ Un `PATCH` partiel rend une donnée périmée — contrôler l'état RÉSULTANT, pas le corps

Une échéance porte `chapter_id` et `lesson_id`, et la leçon doit appartenir au chapitre. La garde
lisait le corps de la requête : elle attrapait bien un couple incohérent envoyé ensemble, et
**laissait passer** un `PATCH` qui ne change QUE le chapitre — la leçon posée plus tôt devenait
étrangère, et le lien de Massimo pointait ailleurs.

**Parade** : `data.get("champ", item.champ)` pour chacun des deux, puis contrôler le couple
résultant. Le test qui distingue les deux comportements patche **un seul** des deux champs.

### ⚠️ `Chapter` n'a pas de `subject_id`

Il se rattache par `theme_id` (place pédagogique) **ou** `school_year_subject_id` (ancrage
temporel), **les deux nullables**. Deux tests écrits sur `m.Chapter(name=…, subject_id=…)` ont
planté avec `TypeError: 'subject_id' is an invalid keyword argument`.

**Parade** : pour un test qui n'a besoin que du chapitre, `m.Chapter(name=…)` suffit — les deux
rattachements sont facultatifs.

### ⚠️ Panneau navigateur — `left_click` n'a pas déclenché React, ni par `ref` ni par coordonnées

Sur la grille de saisie Papa, `computer left_click` par `ref` **et** par coordonnées calculées
(rect × échelle 800/viewport) n'ont **rien** déclenché : le bouton était bien à l'endroit visé, et
le handler React ne partait pas. Aucune erreur, aucun retour — le clic « réussit ».

**Parade** : `form_input` par `ref` fonctionne pour les `<select>` et `<input>` ; pour un bouton,
`javascript_tool` avec `element.click()` déclenche bien le handler React. Et **vérifier l'effet**
(une requête réseau, un changement de DOM) plutôt que le retour du clic.

### ⚠️ Un octet NUL peut se glisser dans un fichier écrit par `Write`

Une constante écrite `" free-text"` s'est retrouvée en base sous la forme `"\0free-text"`. Le
`Read` l'affichait comme une espace ordinaire ; seul un `Edit` échouant sans raison apparente
(« String to replace not found ») a mis la puce à l'oreille.

**Parade** : quand un `Edit` échoue sur une chaîne qu'on lit à l'écran, `od -c` sur la ligne, ou
`python3 -c "print(open(f,'rb').read().count(b'\x00'))"`. Réécrire le fichier entier corrige.

### 🔴 Ce que quatre défauts visuels disent des tests

Aucun des quatre n'était détectable par un test, et c'est instructif :

| Défaut | Ce qu'aucun test ne fait |
|---|---|
| teal à **16° de teinte** de l'émeraude voisine (oklch 181 vs 165, même L, même C) | mesurer une teinte, et savoir qu'une couleur voisine porte **déjà un sens** |
| puce dans l'angle mangeant **un tiers** de la largeur du titre (carte de 81 px) | mesurer une colonne |
| **silence** du tap sur un jour passé | tester un geste qui n'a aucun effet |
| champ laissé **sans nom** sous `lg` (en-têtes masqués) | voir qu'un `aria-label` ne remplace pas un repère visible |

**Parade** : mesurer **dans le DOM** (`getComputedStyle`, `getBoundingClientRect`) plutôt que juger
sur capture — le panneau rend à 800 px et écrase les écarts. Les deux premiers défauts n'étaient
pas visibles à l'œil sur la capture ; ils l'étaient dans les nombres.

## Le deck de révision par chapitre (ADR-0049) — 2026-08-10

Six pièges **réellement payés** pendant le chantier. Ceux que le prompt de slice avait nommés
d'avance et qui ont donc été évités ne sont pas ici : ils sont dans le prompt.

### 1. 🔴 `memory` ne peut pas importer `missions` — le cycle casse `app.main`

L'ADR prescrivait de réutiliser `_ordered_chapter_skill_ids` (module `missions`) depuis
`memory/service.py`. Le contrôle « est-ce que `memory` importe déjà `missions` ? » répond **non** et
rassure à tort : c'est **l'inverse** qu'il fallait chercher. `missions/service.py:46` importe
`memory.service`, et l'ajout crée la chaîne

```
memory.service → missions.command → missions.pilot → missions.service → memory.service
ImportError: cannot import name 'interval_from_score' from partially initialized module
```

**L'app entière cesse de s'importer.** Le cycle n'était pas un accident mécanique : `memory` est la
couche basse, lui faire remonter la dépendance inverse la couche. La traversée a été déplacée dans
`app/modules/lesson_resolution.py`, le résolveur neutre — dont l'en-tête invitait explicitement
cette convergence.

> ⚠️ **Le réflexe à garder** : avant de câbler un import entre deux modules, chercher les **deux**
> sens. `grep "from app.modules.X" app/modules/Y/` ne dit que la moitié.

### 2. 🔴 Mon test du cycle était FAUX et concluait « pas de cycle »

Premier essai : écrire une copie du module avec l'import ajouté (`_probe_cycle.py`), puis
l'importer. Résultat : **« pas de cycle »** — et c'était faux. Le module sonde porte un **autre
nom**, donc `app.modules.memory.service` avait déjà fini de s'importer par la chaîne normale au
moment où la sonde chargeait.

**Un cycle d'import ne se teste que dans un interpréteur NEUF, sur le vrai fichier**, et depuis
plusieurs portes d'entrée :

```bash
.venv/bin/python -c "import app.main"
.venv/bin/python -c "import app.modules.memory.service"   # le pire cas
```

Sans ce second essai, l'app serait partie cassée avec un test vert à l'appui.

### 3. 🔴 Le verrou central était VERT sur son sabotage — 4ᵉ occurrence du motif

Le verrou « une carte `pending` n'est jamais servie » protège la clause `due_at IS NOT NULL`, celle
qu'on supprime par erreur en croyant supprimer la clause d'échéance. **Retirer la clause laissait le
test vert.**

Cause : la carte de test portait `status="pending"`, donc elle était exclue **deux fois** — par le
filtre de statut *et* par l'échéance nulle. Les deux clauses se recouvrent sur elle, et le test ne
mesurait jamais celle qu'il prétendait tenir.

**Il faut une carte au statut ACTIF et à l'échéance NULLE** — l'anomalie de données que cette
clause, et elle seule, arrête.

> ⚠️ **Motif généralisable** : quand deux gardes se recouvrent sur le cas de test, saboter l'une ne
> rougit pas. Choisir un cas où **une seule** garde s'applique, sinon le verrou tient l'autre.

### 4. Réécrire un bloc de constantes en supprime une, et seule la suite le dit

En insérant `REVIEW_SESSION_MAX_CHAPTER` par un remplacement de bloc, `REVIEW_SESSION_FLASH = 5` a
disparu. Six tests existants ont rougi immédiatement (`NameError`) — c'est exactement ce que la
non-régression sert à attraper, et la raison de lancer la suite **avant** d'ajouter les siens.

### 5. 🔴 `npx tsc` refuse de tourner, et le `&& echo "OK"` ment

```
This is not the tsc command you are looking for
```

`npx` (sans `--no-install`) refuse quand TypeScript n'est pas au paquet courant — et comme la
commande finit par `| tail -8`, le pipeline **réussit**, donc le `&& echo "tsc OK"` s'affiche. Deux
fois de suite, un typecheck annoncé vert n'avait pas tourné.

Le binaire réel est `apps/frontend-massimo/node_modules/.bin/tsc`, et il faut `tsc -b` par paquet :

```bash
(cd packages/types && ../../apps/frontend-massimo/node_modules/.bin/tsc -b)
(cd apps/frontend-massimo && node_modules/.bin/tsc -b)
(cd apps/frontend-papa && ../frontend-massimo/node_modules/.bin/tsc -b)
```

> ⚠️ **Un `echo "OK"` après un pipeline ne prouve rien** : il teste le code de sortie du DERNIER
> maillon (`tail`), pas du premier.

### 6. Une fixture de Massimo était déjà incomplète, depuis des jours

`src/lib/agendaSections.test.ts` déclarait rendre un `AgendaItemStudent` en omettant `lesson_id` et
`chapter_id` — **deux champs requis**, absents depuis l'addendum §15. Rien ne l'avait signalé :
`apps/frontend-massimo/tsconfig.app.json` **exclut** `src/**/*.test.ts(x)`.

**Un `tsc -b` vert ne prouve rien sur les tests de Massimo.** Ceux de Papa, eux, sont typecheckés —
d'où l'asymétrie observée au chantier précédent (six erreurs côté Papa, silence côté Massimo).

Pour les vérifier vraiment, hors du `tsconfig` du projet :

```bash
cd apps/frontend-massimo && node_modules/.bin/tsc --noEmit --jsx react-jsx \
  --module esnext --target es2022 --moduleResolution bundler --strict --skipLibCheck \
  src/**/*.test.ts*   # ignorer les erreurs de matchers jest-dom : elles viennent du setup absent
```

### Ce qui a servi et qui était DÉJÀ écrit ici

`import.meta.url` rend un chemin tronqué sous vitest — consigné par `src/voix-de-zetis.test.ts`, et
retrouvé à l'identique en écrivant le verrou de dépôt de ce chantier. `process.cwd()` est la
racine du paquet.

---

## Le plan de préparation (ADR-0050) — 2026-08-10

> Trois sessions, branche `feat/plan-de-preparation`. **Dix-neuf sabotages, dix-neuf
> rougissements** — mais **six** de mes verrous ont d'abord été **verts** sur le leur, dont deux
> motifs que le dépôt n'avait jamais rencontrés. C'est le rendement de la manœuvre, pas son échec.

### 🔴 Composer dans un `GET` : le plan existait, et n'existait pas

`get_or_create_plan` est appelé depuis des **lectures** (la bande, « ce qui arrive »), et ces
routes ne committent pas. Un `db.flush()` seul assignait les ids, servait le plan au client…
puis la transaction était annulée en fin de requête.

**Symptôme** : le plan s'affichait, avec des ids plausibles, et la coche répondait **404**. Chaque
lecture recomposait tout. **Aucun test d'affichage ne pouvait le voir** — le payload était juste.

**Parade** : `db.commit()` + `db.refresh()`, avec un commentaire qui assume l'écriture dans un
`GET` — c'est *la « première lecture »* du §8, le moment même où le plan naît.

⚠️ **Conséquence à connaître** : la **surface qui lit en premier fige le plan**. C'est pour ça que
le pilotage de Papa passe par un compteur **pur** (`plan_counts`) et non par `get_or_create_plan`
— sinon Papa figerait le plan de son fils en relevant l'ENT le dimanche soir.

### 🔴 Deux motifs NEUFS de verrou vert sur son sabotage

Le dépôt connaissait déjà « la contre-épreuve mal visée » et « la garde double qui sauve le test ».
En voici deux autres, tous deux payés le 2026-08-10.

**1. Les deux réponses coïncident.** Le verrou disait : *« déplacer la date rend `0/0` »*. Or
déplacer la date **supprime** le plan — donc un `pilot_out(plan={})` fautif rend **exactement la
même chose** que le code correct. Le test ne pouvait pas les distinguer.
→ **Parade** : il faut un cas où la bonne réponse est **non nulle**. Ici, `PUT /items/{id}/note`,
qui ne touche pas au plan et doit rendre `3/1`.
→ **Règle générale** : *un verrou qui n'assert que sur la valeur d'absence ne verrouille rien tant
qu'un cas de présence ne l'accompagne pas.*

**2. L'assertion trop large qu'on ne peut pas resserrer.** Le verrou cherchait « faites » dans
**tout le panneau** pour tenir le §14.7. Il passait sur le sabotage (`« 3 cochées faites par lui »`
ne contient ni « étapes faites » ni « 3 faites ») — et l'élargir à `/faites?/` était impossible :
le panneau contient légitimement *« marquer cette échéance comme faite »*.
→ **Parade** : viser **la phrase**, pas le conteneur. `screen.getByText(/ZETIS a proposé/)`, puis
assert sur son `textContent`.

### 🔴 La généralisation, trouvée par un audit APRÈS coup : six verrous sans ancre positive

Les deux motifs ci-dessus sont deux cas d'une même règle, qu'on peut chercher **systématiquement** :

> **Un verrou qui n'assert qu'une ABSENCE ne verrouille rien tant qu'une PRÉSENCE ne
> l'accompagne pas.** Un écran vide satisfait toute assertion négative aussi bien qu'un écran
> correct.

Les dix-neuf sabotages du chantier étaient rouges, et pourtant **six verrous** n'assertaient qu'une
absence — *« la mécanique reste invisible »*, *« jamais fait »*, *« aucune affordance de
pilotage »*, *« plus aucune annonce pas-encore-possible »*, *« Papa ne reçoit jamais les étapes »*,
et une icône assertée par `not.toBe()`. **Aucun des sabotages existants ne les visait** : ils
faisaient tous varier un comportement, jamais **disparaître la surface**.

**Parade — une CLASSE de sabotage à jouer une fois par chantier** : faire disparaître ce que le
verrou est censé constater (`{false && (…)}`, un service qui rend `[]`, un paragraphe supprimé).
Six sur six passaient avant l'ajout des ancres ; six sur six rougissent après.

⚠️ **Corollaire d'écriture** : `expect(x).not.toBe("📖")` n'est **pas** un verrou — il passe sur
`""`, sur `undefined`, sur tout sauf une valeur. Asserter l'**égalité**, et la distinction entre
frères (`new Set(icônes).size === 3`) si c'est ça qu'on veut tenir.

⚠️ **Et le sabotage lui-même se rate** : couper la *moitié* d'une phrase laissait l'ancre matcher
sur le reste, et rendait le verrou vert. **Deuxième sabotage mal visé du chantier.** Quand un
sabotage ne rougit pas, la première hypothèse est qu'il est mal visé — pas que le verrou est
mauvais.

### 🔴 Asserter sur un id de ligne est faux sous SQLite

SQLite **réattribue les rowids après un `DELETE`**. Un plan supprimé puis recomposé revient donc
avec `{1, 2, 3}` : **deux sabotages sont passés verts**. Asserter sur la **promesse** (la coche est
perdue / survit), jamais sur l'identité.

### 🔴 `npx tsc` ne lance pas TypeScript — et `| tail` masque l'échec

`npx tsc` répond *« This is not the tsc command you are looking for »* et sort en erreur. Comme la
commande finissait par `| tail`, **le pipeline réussissait** et le `&& echo "tsc OK"` s'affichait.
J'ai annoncé un typecheck vert qui n'avait jamais tourné.

**Parade** : le binaire réel est `apps/<app>/node_modules/.bin/tsc`, lancé **par paquet** (`tsc -b`),
et **sans pipe** — ou avec `${PIPESTATUS[0]}`.

⚠️ **Asymétrie à connaître** : `tsc -b` **vérifie les tests de Papa** (il y a attrapé les trois
fixtures périmées d'un coup) et **PAS ceux de Massimo** — `tsconfig.app.json` les exclut. Une
fixture incomplète y passe en silence, pour la troisième fois.

### 🔴 Deux activités sur trois ne sont pas adressables par URL

`FichesPage` ne lit **aucun** `searchParams` ; `QuizPage` ne lit que `subject` (et `from`). Il
n'existe ni `/fiches?fiche=<id>` ni `/quiz?quiz=<id>`. J'avais écrit les deux.

**Pourquoi c'est grave** : un lien vers un paramètre ignoré s'ouvre **sur la bonne page**, sans
erreur, sans log — un cul-de-sac qui a l'air de marcher. **Aucun test de rendu ne le voit** : le
lien existe, il est cliquable, son `href` est bien formé.

**Parade** : ne prendre les destinations que dans `subjectRouteFor` / `notionRouteFor` (LA table de
routage), et nommer le grain dans le libellé (règle `adr-0047`). Un test-verrou assert que
l'identifiant de ressource **n'apparaît nulle part** dans le `href`.

### ⚠️ Un libellé mesuré vaut mieux qu'un libellé raisonné : 193 px pour 151

Pour nommer le grain, j'ai écrit « Lire les fiches de \<matière\> » — et je l'ai **mesuré dans le
DOM** : **193 px pour 151 disponibles** sur une carte de téléphone, 202 px avec « Physique-Chimie ».
Ce qui se coupait à l'ellipse était **le nom de la matière**, c'est-à-dire l'information même que
l'allongement servait à porter.

**Parade** : le grain se dit par le **pluriel** et par le **verbe** — « Lire les fiches »,
« Choisir un quiz ». La matière est déjà sur la carte, deux lignes plus haut.

**La méthode, réutilisable** : cloner le nœud du libellé, le passer en `white-space:nowrap;
width:auto`, mesurer `scrollWidth` contre le `clientWidth` réel. Trois lignes de JS dans la page,
et la question est tranchée.

### ⚠️ Une annonce d'indisponibilité survit à sa livraison

Deux trouvées **à l'écran**, aucune désignée par un test :

- `UpcomingCard` (Massimo) promettait « Préparer · **bientôt** » — placeholder du Lot 1, devenu
  faux le jour où le plan a été livré. Et `has_plan`, ajouté au contrat **pour cette carte**,
  n'avait **aucun consommateur**.
- `AgendaDetailPanel` (Papa) affirmait *« **Réviser les cartes du chapitre** n'est pas encore
  possible »* — faux depuis le merge de l'`adr-0049`, **la veille**. Contrôle 4bis manqué à sa
  clôture.

**Parade adoptée** : les deux sont désormais tenues par un **test-verrou dans le code**, pas par
une ligne de document. *« Plus aucun "bientôt" sur cette carte »* rougit si on le remet.

⚠️ **Le test qui trouve ça n'existe pas** : c'est un champ servi sans consommateur. Le signe à
chercher à chaque clôture est *« quel champ ai-je ajouté au contrat que personne ne lit ? »*.

### ⚠️ `Quiz` n'a aucun `skill_id`, et les deux moitiés du plan n'ont pas le même périmètre

- `Quiz` est rattaché à la **leçon** : la panoplie joint par `lesson_id`, donc **toutes les notions
  d'une leçon résolvent le même quiz**.
- `resolve_panoply` exige l'année active + `school_year_subject` + chapitre validé ;
  `ordered_chapter_skill_ids` **n'exige rien**. Un chapitre peut donc résoudre des notions dont
  aucune n'a de panoplie.
- **La fenêtre des échéances doit être plus large que celle des jours** : une étape tombe *avant*
  son échéance, donc un contrôle situé juste après la bande porte des étapes **dedans**.

### ⚠️ Le panneau navigateur : les clics expirent, le JS passe

Sur une longue session, `computer{action:"left_click"}` s'est mis à expirer à 30 s **sans erreur
applicative** (aucun log console, aucune requête réseau). Le pane était en cause, pas l'app.

**Parade** : vérifier par `read_console_messages` + `read_network_requests` que **rien n'est
parti** — c'est ce qui distingue un clic non délivré d'un bug — puis déclencher le geste par
`javascript_tool` (`element.click()`), qui exerce le vrai chemin React → lib → réseau. La preuve
reste bonne : le `POST … /done → 200` et la persistance après rechargement ont été constatés.

## Le cadrage « Papa peut lire un diagnostic » (ADR-0051) — 2026-08-11

> Session de **cadrage**, sur `main`, sans une ligne de code. Les quatre premiers pièges sont des
> pièges de **cadrage**, pas d'exécution : ils font écrire une décision fausse, ce qui coûte plus
> cher qu'un bug.

### 🔴 Un read-before-code qui reste dans SON module rate ce que le module voisin fait déjà

`MEMORY.md` portait un read-before-code **juste et incomplet** : *« `GET /diagnostics/quizzes/{id}`
est inutilisable pour la relecture deux fois — elle cache la clé et l'explication, et un `pending`
répond 404 »*. Exact. Mais il n'avait regardé que le module `diagnostics`.

Or **`quizzes.get_quiz_papa` sert déjà exactement la forme cherchée** — `correct_answer_json`,
`explanation_markdown`, `skill_id` **et `skill_name`** — sous `require_parent`, et la seule chose
qui l'écarte est son résolveur (`_mission_quiz_or_404`). Un cadrage bâti sur le constat partiel
aurait **inventé un payload** au lieu de reprendre une forme qui existe, et le prompt de slice
aurait envoyé la session écrire un contrat déjà écrit.

**Parade** : quand un besoin ressemble à ce qu'une **autre famille** sait déjà faire (ici : lire un
quiz avec ses clés), aller lire l'autre module **avant** de conclure « ça n'existe pas ». Deux
modules évaluatifs volontairement indépendants (`quizzes` / `diagnostics`, décision écrite dans
`scoring.py`) partagent quand même des **formes** — l'indépendance porte sur le couplage, pas sur
le vocabulaire.

### 🔴 L'ÉCRITURE peut être plus ouverte que la LECTURE — on vérifie le mauvais gate

Réflexe naturel en auditant un gate : lister les routes qui **lisent**. Ici les deux résolveurs de
lecture sont étroits (`_mission_quiz_or_404`, `_servable_quiz_or_404`) — et **`_question_or_404`,
celui des routes d'écriture, n'a aucun contrôle de type**. Résultat mesuré :

| Route (toutes `require_parent`) | Sur une question de diagnostic |
|---|---|
| `PATCH /api/quiz-questions/{id}` | **acceptée** |
| `POST /api/quiz-questions/{id}/retire` | **acceptée** |
| `GET /api/quizzes/{id}` | **404** |

**On peut modifier ce qu'on ne peut pas lire.** Ce n'est pas une faille (le rôle protège), mais
l'asymétrie est **inversée** par rapport à l'intuition, et personne ne l'avait écrit.

**Parade** : quand on relève un gate, lister **toutes** les routes qui touchent le même objet, pas
seulement celles qui le servent. Le gate le plus large est rarement celui qu'on regarde.

### 🔴 Un chiffre de cadrage faux ne se voit pas en relisant la doc — il se mesure

Le cadrage annonçait *« ses 8 questions »*. Le chiffre venait de la **structure** (8 notions
mesurées) et personne ne l'avait confronté au réel : depuis l'`adr-0043` D3
(`QUESTIONS_PER_SKILL` : 2 → 5), un diagnostic récent porte **40 questions**. Une requête l'a dit
en trois secondes ; **aucun document du dépôt ne portait le nombre**.

Et ce n'était pas un détail de rédaction : **40 commande la forme de l'écran**. Une liste plate de
40 questions est un mur, et c'est ce chiffre qui a fait du groupement par notion une décision de
fond au lieu d'une commodité de mise en page.

**Parade** : tout cadrage d'une **surface de lecture** mesure le volume réel en base avant de
dessiner. `select count(*) … group by` coûte moins qu'une maquette à refaire.

### 🔴 Et le même piège s'est rejoué DANS la correction — une soustraction n'est pas une mesure

Après avoir mesuré « 3 diagnostics à 40 questions » sur 18, j'ai écrit *« les **15** antérieurs en
portent 16 »*. Personne ne l'a mesuré : `18 − 3 = 15` est une **déduction**, et elle est fausse.
La distribution réelle, relevée à la clôture :

| Questions | Diagnostics | Ids |
|---|---|---|
| 40 (8 notions × 5) | 3 | 55, 56, 57 |
| 16 (8 notions × 2) | **11** | 8, 9, 15, 17–20, 28–31 |
| **2** | **4** | 2, 3, 4, 5 |

**Trois générations, pas deux** — et la troisième change le dessin : à 2 questions, un groupement
par notion n'a qu'**une** ligne. La phrase fausse était partie dans **trois** documents (ADR,
maquette, `DECISIONS.md`) avant d'être attrapée par le point 6 de `/cloture`.

**Parade** : quand un ensemble est partitionné, **compter chaque part**, jamais en déduire une par
soustraction. Le total qui tombe juste (3 + 15 = 18) est précisément ce qui rend l'erreur
invisible à la relecture. ⚠️ Et la vérification a rapporté un **second** fait au passage :
**0 diagnostic sans question** — l'état vide dessiné dans la maquette est un chemin de code, pas un
état observé.

### ⚠️ La surface qu'on cadre peut n'avoir AUCUN décor — le mesurer, pas le supposer

Relevé le 2026-08-11 : **18 diagnostics en base de dev, tous `validated`**. Zéro `pending`, zéro
`rejected`. Le cran « chez toi · à relire », qui est **toute** la surface du chantier, ne s'affiche
donc pour aucun. Sur 304 questions : 0 sans notion, 0 sans explication, 0 retirée — **les cas
dégradés existent dans le code et jamais dans la base**.

Le constat n° 6 de l'`adr-0045` disait déjà *« le cran "généré" n'existe pas en base de dev »* ;
personne ne l'avait remesuré pour la famille entière.

**Parade** : l'écrire dans le prompt de slice, pas seulement dans l'ADR. Une session qui ne
fabrique pas son décor vérifie un écran vide et le rapporte vert — motif déjà payé deux fois
(`test_delete_is_archiving_not_deletion`, le verrou central de l'`adr-0049`).

### ⚠️ Le panneau navigateur rend une capture NOIRE sur une page longue, DOM intact

Frère du piège ci-dessus (« les clics expirent, le JS passe »), symptôme différent. Sur une
maquette de **5 535 px** de haut, après un `scrollIntoView` réussi, `computer{screenshot}` a rendu
une image **entièrement noire** — et un `scroll` avait expiré à 30 s juste avant, le pane étant
signalé « hidden ». L'app n'était pas en cause : le document était correct.

**Parade** : **mesurer dans le DOM, pas sur la capture.** Un `javascript_tool` qui rend
`getBoundingClientRect()`, les comptes d'éléments et `scrollWidth > clientWidth` prouve la
géométrie sans dépendre du rendu du pane. Ici : 3 questions, **une clé par question**,
3 explications, aucun débordement horizontal — vérifié pendant que la capture était noire.

⚠️ `scroll_amount` est **plafonné à 10**, et un dépassement rend une erreur de validation, pas un
scroll tronqué.

## La collision « carte » d'`ACTION_UI` — 2026-08-12

### 🔴 Un test-verrou qui interdit le DOUBLON est vert sur une correction faite du MAUVAIS CÔTÉ

Le verrou naturel, pour deux libellés qui se marchent dessus, c'est *« aucun mot ne doit nommer
deux activités »*. Écrit tel quel, il est **vert sur une correction fausse**.

Démontré par sabotage, sur mon propre verrou. Deux sabotages, pas un :

| Sabotage | Assertion « pas de doublon » | Les deux autres |
|---|---|---|
| remettre « Reconstruire la **carte** » (le défaut d'origine) | 🔴 rouge | 🔴 rouges |
| renommer la **révision** en « Réviser mes fiches mémo » | ✅ **VERTE** | 🔴 rouges |

Le second est le piège : il **lève** la collision — plus aucun doublon — mais en cassant le
vocabulaire SRS que l'enfant a déjà appris (« 8 cartes à revoir », « 5 cartes », « Refaire un
tour (3 cartes) »), et qui vient du modèle lui-même (`Card`, module `memory`).

**Parade** : un verrou d'unicité doit dire **quel côté garde le mot**, pas seulement qu'il n'y en
a qu'un. `notionActionUi.test.ts` porte donc trois assertions, et c'est la deuxième
(`activitesQuiDisentCarte() === ["revision"]`) qui attrape ce cas-là.

> Quatrième occurrence du motif « mon test-verrou central était vert sur un sabotage ». Les trois
> précédentes ont été trouvées par hasard ; celle-ci a été **cherchée**, parce que le motif est
> maintenant consigné.

### 🔴 Un libellé qui tient « à 2 px près » n'est pas une contrainte respectée, c'est un hasard

Renommer « Reconstruire la **carte** » → « Reconstruire la **mindmap** » paraissait purement
sémantique. Mesuré dans le DOM, dans le panneau de notion de `/galaxy` à **390 px** :

| | largeur du texte | budget du bouton | tient ? |
|---|---|---|---|
| ancien | **144 px** | 146 px | ✅ **à 2 px près** |
| nouveau | **172 px** | 146 px | ❌ passe à 2 lignes |

Personne n'avait « fait tenir » l'ancien libellé : il tenait par chance. Le **budget** (146 px)
n'est écrit nulle part, aucun test ne le connaît, et la suite est restée **verte** de bout en bout.

**Parade** : quand on renomme quelque chose d'affiché, mesurer le **budget** de la surface la plus
contrainte avant de trancher, et **écrire l'arbitrage dans le code** — pas dans un ADR que
personne ne relira au moment de « corriger » le libellé. C'est fait dans `notionActionUi.ts`, avec
les chiffres et un « ne pas raccourcir ».

> Complète le piège *« Un libellé mesuré vaut mieux qu'un libellé raisonné »* (§ plus haut) : là il
> s'agissait de **choisir** un libellé, ici de **renommer** un existant — et c'est le cas où l'on
> mesure le moins, puisqu'on croit ne changer que le sens.

### ⚠️ `grep` trouve une chaîne que personne ne voit — le champ mort d'une table de présentation

`MissionsPage.STEP_META` portait `action: "Reconstruire la carte"`, la chaîne exacte qu'on
traquait. Elle n'atteignait **jamais le DOM** : seuls `icon`, `label` et `sub` sont rendus
(vérifié ligne à ligne, puis à l'écran sur une mission réelle).

**Parade** : avant de renommer une chaîne trouvée par `grep`, remonter jusqu'à son **rendu**.
Si elle n'en a pas, la **supprimer** — la renommer maintient du code mort *et* fait mentir la
prochaine recherche sur le sujet, qui croira la surface concernée.

> Même famille que l'élagage de `data/mock.ts` (PR #115) : là, `grep -w` prétendait `SUBJECTS`
> vivant dans 5 fichiers, tous des homonymes locaux. **Le contrôle fiable est le chemin de rendu,
> jamais la présence du texte.**

### ⚠️ Un commentaire de code qui dit « on ne touche pas à X » peut être plus large que sa raison

`notionRoutes.ts` portait *« On ne touche pas `ACTION_UI` — il est partagé avec la Galaxy et le
chat »*. Lu en entier, sa raison est la **portée** : ne pas mettre dans une table partagée par
trois surfaces un texte qui n'est vrai que sur l'une d'elles. Elle n'interdit **pas** un
renommage, qui s'applique partout à l'identique — c'est l'usage même d'une source unique.

**Parade** : un interdit trouvé au read-before-code se lit **avec sa justification**, et se
**restreint** à ce qu'elle couvre plutôt que de se contourner ou de s'ignorer. Le commentaire a
été réécrit pour dire ce qu'il interdit vraiment, avec le renommage en contre-exemple qui le borne.

### ⚠️ « Branche supprimée » : `git branch -r` lit un CACHE, il n'interroge pas le serveur

Étape 4bis du 2026-08-12, juste après `gh pr merge 117 --squash --delete-branch`. Le rituel de
`/cloture` prescrit de vérifier la suppression par `git branch` **et** `git branch -r`. Le premier
rendait vide, le second listait **toujours** `origin/feat/action-ui-collision-carte`.

La branche **était** supprimée. `git branch -r` liste les **références de suivi locales**, qui ne
se mettent à jour qu'au `fetch` : `--delete-branch` supprime la branche côté GitHub, pas la copie
de son nom dans mon dépôt.

**Parade** — deux commandes, dans cet ordre :

```bash
git ls-remote --heads origin "*<branche>*"   # interroge le SERVEUR ; vide = supprimée
git fetch --prune origin                     # élague la référence locale périmée
```

⚠️ **C'est la première fois que le contrôle prescrit par le rituel est lui-même la source de
l'erreur.** Écrit tel quel, `MEMORY.md` aurait annoncé une branche vivante qui n'existe plus —
et la session suivante l'aurait cherchée. Même famille que les hash faux du 2026-08-03 : *une case
cochée ne vaut pas une commande*, mais ici il fallait aller plus loin — **la bonne commande**.

## La mindmap prend la place qu'elle demande (ADR-0052) — 2026-08-12

### 🔴 Une TDZ dans un tableau de dépendances tue le composant — suite VERTE, `tsc` VERT

Un `useEffect(…, [fullscreen, layout])` déclaré **avant** le `const [layout, setLayout] = useState()`
qu'il référence. Le tableau de dépendances s'évalue **au rendu**, donc dans la zone morte
temporelle du `const` :

```
ReferenceError: Cannot access 'layout' before initialization
```

**Le composant ne monte plus du tout.** Écran vide.

⚠️ **Rien ne l'a vu, et c'est le cœur du piège** :

- `tsc -b` **passe** — une TDZ est une erreur d'**exécution**, pas de typage ;
- les **668 tests Massimo étaient verts** — parce qu'**aucun ne monte `MindmapWorkspace`** :
  `packages/ui` n'a **aucun test ni script de test**, et le seul qui l'approche
  (`MindmapPreviewModal.test.tsx`, Papa) le **mocke**.

**Parade** : déclarer un effet **après** tout état qu'il lit. Et, plus profond : un paquet partagé
sans aucun test est un angle mort que la suite de l'app ne couvre pas — la trouver a demandé un œil
humain sur un simulateur.

> ⚠️ **J'ai d'abord diagnostiqué « le tap a raté, la page est défilée »** et poursuivi trois écrans
> sur cette lecture. C'est la **console du navigateur** qui a donné la vraie cause. Devant un écran
> vide, lire les erreurs AVANT d'expliquer.

### 🔴 `height: 100%` d'une lib exige un parent à hauteur DÉFINIE — `flex-1` n'en est pas une

En remplaçant `height: clamp(520px, 74vh, 840px)` par `flex-1` sur le conteneur du canvas, la
mindmap est devenue **invisible**. Les 13 nœuds étaient dans le DOM, aux bonnes coordonnées.

La feuille de xyflow pose `.react-flow { height: 100% }`. Un pourcentage se résout contre une
hauteur **définie** : l'ancien `clamp` en était une, la hauteur issue de la répartition flex **non**
(le navigateur la traite comme indéfinie). `.react-flow` retombait à **hauteur 0**, et toute la
chaîne avec (`renderer`, `pane`, `viewport`, `nodes` : tous à 0).

**Parade** : envelopper la lib d'un `absolute inset-0` dans le conteneur `relative`. `inset-0` tire
une hauteur définie du bloc conteneur, ce que `flex-1` seul ne fait pas.

⚠️ **J'ai mesuré le CONTENEUR (748 px) et jamais le `.react-flow` à l'intérieur (0 px).** La
doctrine « mesurer dans le DOM » appliquée au mauvais élément : **mesurer la boîte ne dit rien de ce
qu'elle contient**. Devant un cadre correct et vide, descendre la chaîne des ancêtres.

### 🔴 `minZoom` écrit pour un bureau EMPÊCHE `fitView` de faire tenir la carte sur un téléphone

À 402 × 874 en plein écran, deux présentations sur quatre **débordaient** : « Vertical » à **124 %**
de la largeur du cadre, « Équilibrée » à **122 %** — les deux **exactement au zoom 0,300**,
c'est-à-dire collées à `minZoom={0.3}`. `fitView` dézoomait autant qu'il pouvait et **butait sur la
borne**.

**Parade** : `minZoom={0.12}`. Les deux se recadrent alors à ~0,20 et tiennent.

Le signe qui l'identifie : **un zoom rigoureusement égal au `minZoom`** après un `fitView`. Ce n'est
pas le recadrage qui échoue, c'est une borne qui le bâillonne.

> Une carte trop grande pour un téléphone y restera petite — limite du support. Mais **petite et
> entière** vaut mieux que **grande et coupée** : un graphe dont on ne voit pas les bords ne dit pas
> qu'il continue, et l'enfant croit avoir tout vu.

### ⚠️ `fitView` a DEUX déclencheurs, et le second est asynchrone

`fitView` de React Flow ne joue qu'au **montage**. Le rejouer demande de couvrir :

1. le **cadre** qui change de taille (passage en plein écran) ;
2. la **mise en page** qui change — `computeLayout` (elk) est **asynchrone**, changer de
   présentation repositionne les nœuds bien après le rendu.

Avec le seul (1), passer en « Vertical » puis en plein écran laissait le graphe déborder. Avec le
seul (2), il restait petit dans un coin.

**Parade** : `[fullscreen, layout]`, et **deux `requestAnimationFrame` imbriqués** — la première
image laisse le navigateur poser le cadre, la seconde mesure une géométrie stable. Un `setTimeout`
parierait sur une durée ; deux rAF attendent l'événement.

⚠️ `layout` et **non** `rfNodes` : re-cadrer à chaque déplacement de nœud annulerait le geste de
l'enfant qui ré-agence sa carte à la main.

⚠️ L'instance vient de `onInit`, **pas** de `useReactFlow()` : ce hook exige d'être appelé **sous**
le `ReactFlowProvider`, et le composant le rend lui-même.

### ⚠️ Deux feuilles de style qui ont chacune raison peuvent produire du blanc sur blanc

Les contrôles de zoom étaient **invisibles** : fond `rgb(254,254,254)`, icônes `rgb(232,236,248)` —
contraste **≈ 1,1 : 1**. xyflow habille ses contrôles pour un thème **clair** ; l'app impose sa
couleur de texte, **claire** aussi, que le `fill: currentColor` des SVG hérite. **Aucune des deux
n'a tort seule.**

⚠️ **Et le défaut de contraste en cachait un plus grave** : la cible faisait **26 px** là où la spec
du dépôt exige **44**. Tant qu'on ne voit pas un bouton, on ne voit pas qu'il est trop petit.

**Parade** : styler explicitement `.react-flow__controls` dans `mindmap.css`, en reprenant l'idiome
de contrôle flottant **déjà posé** par `CloseFullscreenButton` (`border-white/15`, fond sombre
translucide, `backdrop-blur`) plutôt que d'en inventer un troisième. Contraste obtenu : **15,12 : 1**.

## Le paquet partagé cesse d'être un angle mort (ADR-0053) — 2026-08-12

### ⚠️ Un paquet d'espace de travail n'hérite RIEN des outils de ses consommateurs

`packages/ui` n'avait **aucun script** et **aucune devDependency de test**. `vitest` et
`@testing-library` étaient installés dans les deux apps, donc « présents dans le dépôt » — mais
**pas résolvables depuis le paquet** (`packages/ui/node_modules/.bin/` ne les contenait pas).

**Parade** : avant de supposer qu'un outil est disponible dans un paquet d'un monorepo pnpm, le
vérifier — `ls <paquet>/node_modules/.bin/`. Les déclarer dans **son** `package.json`, puis
`pnpm install --filter <paquet>`.

### 🔴 Le test qui attrape une TDZ n'a pas besoin de comprendre le composant

Le défaut du jour — un `useEffect` déclaré avant le `useState` qu'il lit — se produit à
l'**évaluation du corps de la fonction composant**, donc **avant** que le JSX soit retourné, avant
que la moindre librairie soit sollicitée.

Conséquence contre-intuitive : **un test qui se contente de monter le composant l'attrape**, alors
qu'un test « la page affiche son titre » ne l'aurait pas vu — il aurait échoué, certes, mais on
l'aurait lu comme un problème de rendu, pas comme un composant mort.

```tsx
it.each(MONTABLES)("%s se monte sans jeter", (_n, el) => {
  expect(() => render(el)).not.toThrow();
});
```

**28 composants, une assertion.** Contre-épreuve jouée : sabotage de la TDZ → **1 seul test rouge
sur 28**, et il désigne le bon composant.

### ⚠️ Deux API de navigateur manquent à jsdom, et elles bloquent des montages

- **`ResizeObserver`** — React Flow en dépend. Sans polyfill, `MindmapWorkspace` ne se monte jamais.
- **`window.matchMedia`** — `AvatarCanvas` (et tout composant qui lit `prefers-reduced-motion`) ne
  se monte pas non plus.

**Parade** : les polyfiller dans le `setup.ts` du paquet, avec la règle qui ferme la liste — *ce que
le navigateur fournit, que jsdom n'a pas, et dont l'absence ferait échouer un montage pour une
raison étrangère au code testé*. Tout le reste est un **mock**, et un mock n'a rien à faire dans un
`setup`.

⚠️ **Conséquence** : `prefers-reduced-motion` répond **`false`** dans ces tests.

### ⚠️ Une décision peut être écrite plus étroitement que son propre raisonnement

L'ADR-0053 disait « polyfille `ResizeObserver`, et **rien d'autre** ». À l'exécution, `matchMedia`
s'est présenté : **exactement la même nature**, exactement le même motif. La **lettre** l'excluait,
le **raisonnement** l'incluait.

**Parade** : quand un cas rencontre la lettre d'une décision mais pas son esprit, **ne pas trancher
seul** — c'est un stop-on-blocker. Signalé, arbitré par le commanditaire, écrit en **addendum daté**
dans l'ADR *et* dans le code. Et la liste a été refermée **par une règle** plutôt que par une
énumération, pour que le prochain cas se tranche sans arbitrage.

### ⚠️ `grep` sur `export {` ne voit pas les exports multi-lignes

Un premier inventaire avait conclu que **`MindmapWorkspace` n'était pas exporté** — alarmant, car
c'est le composant du défaut. C'était faux : son export est écrit sur trois lignes, et le motif
`export\s*\{[^}]*\}` sans le drapeau multi-ligne ne le voyait pas.

**Parade** : pour inventorier une surface d'export, lire les fichiers d'index **en entier**, ou
utiliser un motif avec `/s`. Le comptage réel a donné **29 composants** et **81 fonctions et
constantes** — ce qui a aussi montré que « monter tous les exports » n'avait pas de sens : on ne
monte pas `easeOutCubic`.

## Les dépréciations Starlette — `fix/deprecations-starlette` — 2026-08-12

### 🔴 La liste des avertissements n'est pas la liste des défauts

pytest signalait **deux** avertissements `HTTP_422_UNPROCESSABLE_ENTITY`, et le code portait
**deux** occurrences de la constante. La correspondance semblait parfaite. Elle était fausse : les
deux avertissements venaient de la **même** ligne (`agenda/service.py:508`), atteinte par deux tests
différents. La ligne **505** portait la même constante dépréciée **sans émettre quoi que ce soit** —
sa branche (`lesson is None`, « Leçon inconnue ») n'est couverte par aucun test.

Un correctif guidé par la sortie de pytest aurait laissé la 505 en place, pour casser le jour où
starlette retire le repli.

**Parade** : pour une dépréciation, chercher **le symbole** dans le code (`grep`), pas les
avertissements dans la sortie. Et chercher **toute la famille** : starlette 1.3.1 en déprécie
**quatre** (`HTTP_413_REQUEST_ENTITY_TOO_LARGE`, `HTTP_414_REQUEST_URI_TOO_LONG`,
`HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE`, `HTTP_422_UNPROCESSABLE_ENTITY`) — la liste se lit dans
`starlette/status.py`, dictionnaire `__deprecated__`.

### 🔴 Une contre-épreuve posée sur une ligne NON COUVERTE rend zéro — et fait douter du bon outil

Premier sabotage : la constante dépréciée remise sur la ligne 505. Résultat : **zéro avertissement**.
Lecture tentante — « ma méthode de détection est aveugle, je ne peux rien conclure ». C'était le
**sabotage** qui était aveugle : il visait la branche que rien n'exerce.

Reposé sur la 508 : **2 avertissements** reviennent, puis **2 échecs** une fois `filterwarnings`
en place.

**Parade** : avant de saboter, vérifier que la ligne visée est **atteinte par un test**. Un sabotage
muet a deux causes possibles — l'outil ne voit rien, ou le sabotage ne se produit pas — et rien ne
les distingue de l'extérieur. C'est la variante « à l'envers » du piège déjà consigné : là, la
contre-épreuve mal visée **alarme** au lieu de rassurer.

### 🔴 `uv sync` aurait retiré les extras optionnels du venv backend

`apps/backend/pyproject.toml` déclare `stt` (faster-whisper) et `tts` (piper-tts) en extras
**optionnels**, installés à la main une fois. Le venv les contient : `faster-whisper 1.2.1`,
`ctranslate2 4.8.1`, `piper-tts 1.4.2`, `onnxruntime 1.27.0`.

`uv sync` **aligne** le venv sur les extras sélectionnés — il aurait donc **désinstallé** les quatre,
cassant la **dictée ELI5** et la **voix des capsules**, sans que le moindre test rougisse (les deux
dégradent proprement en 503).

**Parade** : pour ajouter un paquet, `VIRTUAL_ENV=.venv uv pip install <paquet>` (additif), puis
`uv lock` — qui n'écrit que le lockfile et ne touche pas le venv. Vérifier ensuite que le diff du
lock est bien **purement additif** (`git diff --stat` : 50 insertions, 0 suppression ici).

### ⚠️ `uv pip index versions` n'existe pas — pour sonder un paquet, `--dry-run`

`uv pip index versions <paquet>` rend `unrecognized subcommand`. Pour savoir si un paquet existe et
ce qu'il tirerait, **sans rien installer** : `VIRTUAL_ENV=.venv uv pip install --dry-run <paquet>`.
C'est ce qui a montré d'avance que `httpx2` amènerait `httpcore2` et `truststore`.

### ⚠️ `filterwarnings = ["error"]` attrape DEUX natures d'avertissement, pas une

- levé **pendant** un test → échec du test ;
- levé **à l'import** d'un module (le cas de la dépréciation `httpx`, émise depuis
  `fastapi/testclient.py:1`, hors de tout test) → **erreur de collecte**, qui interrompt la session
  entière. Encore plus bruyant.

Vérifié par un module de test jetable faisant `warnings.warn(..., DeprecationWarning)` au niveau
module. **À savoir avant de poser le réglage** : sans ça, on peut croire qu'il ne couvre que les
avertissements d'exécution, et le juger trop faible pour ce qu'on veut attraper.

### 🔴 `git merge-base --is-ancestor` ne peut JAMAIS confirmer un merge en SQUASH

Un contrôle de branches locales annonçait **13 branches « non fusionnées »**, dont une à 13 commits
uniques — de quoi croire à du travail perdu.

C'était faux, et structurellement : un squash crée un commit **neuf**, les commits d'origine ne
deviennent donc jamais ancêtres de `main`. `--is-ancestor` répondra « non fusionnée » pour **toutes**
les branches squashées, indéfiniment. Vérification par la vraie source — l'état des PR — : les 13
avaient une PR `MERGED` (#98 à #110).

**Parade** : `gh pr list --head <branche> --state all --json number,state`. Même famille que le
piège `git branch -r` déjà consigné : *la commande évidente répond à une question voisine de celle
qu'on pose.*

## Le titre de page seul au bord — `fix/accueil-titre-coupe` — 2026-08-12

### 🔴 Un padding INTERNE ne déplace pas la boîte — `getBoundingClientRect` mesure la mauvaise chose

Après avoir ajouté `pl-4` à un `h1`, la mesure rendait toujours `left: 16`. Conclusion tentante :
« le correctif n'a pas pris, le HMR n'a pas rechargé ». **Faux.** `getBoundingClientRect()` rend la
boîte de **bordure** : un padding gauche pousse le **contenu** vers la droite *à l'intérieur* de la
boîte, et la boîte, elle, ne bouge pas d'un pixel.

**Parade** : pour mesurer où commence le TEXTE, passer par un `Range` sur le contenu —

```js
const r = document.createRange(); r.selectNodeContents(el); r.getBoundingClientRect().left;
```

⚠️ Le même piège existe à l'envers : une boîte qui *semble* déborder peut n'avoir qu'un padding.
Comparer systématiquement `boîte` et `contenu` avant de conclure.

### 🔴 « C'est coupé » ne veut pas dire que c'est coupé — mesurer avant de croire l'énoncé

Le défaut était consigné depuis plusieurs jours comme « *« Bonjour Massimo » est COUPÉ À GAUCHE sur
iPhone* ». La mesure à 390 px a montré l'inverse : le texte tenait sur **une ligne avec 136 px de
marge**, aucun élément de la page ne sortait du cadre, `scrollWidth == clientWidth`.

Le vrai défaut : le titre était le **seul** texte à `x = 16` — les quarante autres à 33, 37 ou 41,
selon le padding de leur carte. L'œil prend la colonne des cartes pour la marge de la page.

**Parade** : d'un défaut visuel rapporté, retenir **le symptôme vécu**, pas le mécanisme supposé.
Ici, corriger « la coupure » aurait mené à élargir une marge déjà conforme à la maquette. Deux
mesures suffisent à trancher : *l'élément sort-il du cadre ?* et *où commencent les autres ?*

### 🔴 Le correctif « évident » dans le composant partagé était FAUX — et un scan l'a montré

`PageHeader` titre **dix** pages : y poser le retrait semblait tout régler d'une ligne. Posé, puis
**retiré**. Un scan des textes à `x = 16`, page par page, a montré que la moitié de ces pages
alignent leurs **libellés de section** sur le bord du conteneur, hors des cartes :

| Page | Textes au bord | Le retrait y serait |
|---|---|---|
| Accueil, Matières, Missions | 0 | juste |
| `/agenda` | 7 — « Aujourd'hui », « Demain », « Ce qui arrive », « À reprendre » | **faux** |
| `/revision` | 2 — « Mélanges », « Par matière » | **faux** |

Sur ces pages, le titre n'est pas seul : il leur est **aligné**. Le rentrer aurait cassé un
alignement existant — un défaut neuf pour en corriger un autre.

**Parade** : avant de poser une règle de mise en page dans un composant partagé, **scanner ses
consommateurs**, pas les deux qu'on a sous les yeux. Le scan tient en dix lignes :

```js
[...document.querySelectorAll('main h2,main p,main span,main a,main button')]
  .filter(e => e.textContent.trim() && !e.querySelector('h2,p,span,a,button'))
  .filter(e => Math.round(e.getBoundingClientRect().left) === 16)
```

### ⚠️ Une règle de mise en page peut être CONDITIONNELLE, et alors elle ne se factorise pas

Conséquence du point précédent : la règle retenue est *« ce retrait s'applique quand le titre serait
le seul texte au bord du conteneur »*. Un composant partagé ne peut pas l'évaluer — il ne connaît
pas le contenu de la page qui l'utilise.

C'est contre-intuitif dans un dépôt qui traque la duplication : ici, **deux applications d'une même
constante ne sont pas une duplication**, c'est une règle appliquée là où sa condition est vraie.
Consigné dans `lib/pageTitle.ts`, avec un renvoi depuis `PageHeader.tsx` pour arrêter la « bonne
idée » avant qu'elle ne soit posée.

### ⚠️ `/matieres` déborde de 8 px horizontalement — et ça se sent au doigt, pas à la souris

Mesuré en passant : `main.scrollWidth` vaut 398 pour un `clientWidth` de 390. Cause : la page fait
`-m-6 … p-6`, qui annule le padding de `main` puis le rétablit — mais les marges négatives débordent
la boîte de contenu. `main` étant en `overflow-auto`, la page **se laisse tirer de côté** sur écran
tactile ; à la souris, on ne le voit jamais.

⚠️ **C'est exactement le genre d'effet qui se rapporte comme « c'est coupé »** — et pourtant ce
n'était pas la cause ici : l'Accueil, lui, est à **zéro** débordement. Vérifier la page **nommée**,
pas une page voisine.

### ⚠️ jsdom n'a pas de moteur de mise en page — un défaut de marge n'est PAS testable en unitaire

`getBoundingClientRect` rend des zéros sous jsdom. Aucun test de la suite Massimo ne pouvait voir ce
défaut, ni ne peut garder sa correction. Un test qui vérifierait la présence de la classe
`pl-4` assurerait que le code est ce qu'il est — il **se sentirait utile sans rien voir**.

**Parade** : pour ce type de défaut, la preuve est **visuelle et mesurée dans un vrai moteur de
rendu** (panneau navigateur ou simulateur), et elle se consigne — chiffres à l'appui — dans le
message de commit et dans `MEMORY.md`. Ne pas écrire de test pour se rassurer.

### ⚠️ `lsof -ti :PORT` ne dit pas « un serveur écoute » — ajouter `-sTCP:LISTEN`

Après l'arrêt des serveurs de dev, `lsof -ti :8001` rendait encore un PID : lu comme « le serveur
n'est pas mort ». **Faux.** `lsof -ti :PORT` matche **toute** socket touchant ce port, y compris les
connexions résiduelles d'un client — ici celles du panneau navigateur de l'app Claude, à l'état
`(CLOSED)`. Aucun processus n'écoutait.

**Parade** : `lsof -ti :PORT -sTCP:LISTEN` pour la seule question qui compte. Et `lsof -i :PORT -P -n`
pour voir *qui* et dans *quel état*, avant de conclure.

### ⚠️ Vérifier sa propre liste ne trouve jamais ce qui en manque

La clôture avait consigné « deux serveurs de dev restés allumés », et l'étape 4bis l'avait
« vérifié » par un `lsof` sur ces **deux** ports. Ils tournaient : le fait était donc confirmé, et
faux — un troisième serveur (`backend`, port 8000) tournait aussi, absent de la liste.

**Parade** : pour un inventaire, poser la question **ouverte** à la source qui sait (`preview_list`,
`pgrep`, `git branch`), pas la question **fermée** sur ce qu'on a déjà écrit. Une vérification
fait-par-fait valide ce qui est écrit ; elle ne détecte aucune omission. Les deux contrôles sont
complémentaires, et le second manquait.

## Le cadrage « la fiche que Massimo fabrique lui-même » (addendum ADR-0015) — 2026-08-12

> Session de **cadrage**, sur `main`, sans une ligne de code. Les quatre pièges sont des pièges de
> **cadrage** : ils font écrire une décision fausse, ce qui coûte plus cher qu'un bug — un prompt de
> slice fondé dessus envoie la session suivante construire la mauvaise chose.

### 🔴 Un read-before-code qui reste du côté LECTURE rate ce que l'ÉCRITURE impose

La première passe a lu le modèle `Fiche` et **tout le flux élève** : colonnes, gate `validated`,
trois lecteurs, `fiche_views`. Constat juste, et **incomplet** — elle n'avait pas ouvert le chemin
d'**écriture**.

Deux faits, trouvés en **seconde passe** seulement, et chacun a changé une décision :

| Fait | Où | Ce qu'il interdit |
|---|---|---|
| `update_fiche_spec` écrit `validation_status = "pending"` **sans condition** | `fiches/service.py:264` | tout enrichissement **en lot** des fiches validées : elles disparaîtraient **toutes** de chez Massimo à la fois |
| `FicheSpec` est en `extra="forbid"` | `fiches/schemas.py:39` | croire qu'ajouter un champ ne concerne que les fiches **futures** — le schéma **part au modèle**, donc il change la génération de **toutes** |

Le premier a fait réécrire entièrement la réponse à « mettre à jour les fiches déjà créées »
(enrichissement **à la demande**, jamais en lot). Le second a rendu obligatoire un bump
`FICHE_PROMPT_VERSION`.

**Parade** : un read-before-code sur un objet servi doit lire **les deux sens** — ce qui le sert
*et* ce qui le modifie. Le cycle de vie éditorial (`pending`/`validated`) vit du côté écriture, et
c'est lui qui dit ce qu'une migration de contenu coûte. *Même famille que le piège de l'ADR-0051 :
là c'était le module voisin, ici c'est le sens inverse du même module.*

### 🔴 Un cadrage peut décrire entièrement CE QUE L'UTILISATEUR FAIT sans dire OÙ ÇA SE POSE

Onze § écrits — objet, gate, échafaudage, contrat de ton, voix, analyse, versions, sections,
champs libres, mnémonique, migration de contenu — et **pas une ligne** sur le gabarit d'écran. Le
commanditaire l'a relevé (*« comment as-tu prévu ce refactor par rapport à la sidebar et les
modales ? »*). Le relevé qui a suivi a trouvé **trois blocages en vingt minutes** :

- la **sidebar est dans le flux** au-dessus de `md` (`md:static`) → sidebar + colonne de six étapes
  + cours à droite = **trois colonnes**, intenable sur iPad ;
- **`CoursPanel` n'est `sticky` qu'au-dessus de `lg`** → en dessous, « Voir le cours » empile le
  cours **sous** la fiche, donc **sous six étapes** : inatteignable. **Défaut jumeau de celui que
  l'`adr-0052` constate le même jour** sur la banque de nœuds des mindmaps ;
- **`CoursPanel` se mesure en `vh`** (`max-h-[80vh]`), ce que l'`adr-0052` §2 venait de condamner.

**Parade** : tout cadrage qui produit un **écran neuf** doit porter un § « gabarit » — dans quel
conteneur il vit, ce qui occupe déjà la largeur, et ce que la modale de l'app impose en hauteur.
Sans lui, on décide un contenu qui ne rentre nulle part. Contrôle minimal : `ActivityModal`
(`max-h-[calc(100vh-4rem)]`), la sidebar, et le point de rupture des panneaux latéraux.

### 🔴 Une règle qu'un document énonce peut être violée par un AUTRE § du même document

Le §4 refusait un menu de niveaux d'aide, au motif écrit qu'un objectif imposé se fuit
(`CLAUDE.md` §Gamification). Le §3, dans le **même document**, verrouillait la fiche ZETIS
derrière une tentative — c'est-à-dire **exactement un objectif subi**, à un autre endroit. Personne
ne l'a vu à la rédaction ; le commanditaire a tranché en sens inverse (« lire avant de fabriquer,
c'est ok »), et la révision s'est révélée **plus simple** que la version initiale : plus de 403,
plus d'état « a-t-il tenté ? » à tenir côté serveur.

**Parade** : à la relecture d'un ADR, prendre chaque interdit qu'il pose (« on n'impose pas X »,
« on ne verrouille pas Y ») et **le repasser sur ses propres autres §**. Un document long applique
rarement sa propre règle partout du premier coup.

### ⚠️ Un `Write` qui remplace un document en supprime des parties SANS le dire

`page-fiches.md` a été réécrit d'un bloc pour passer de 86 à 329 lignes. La réécriture a **perdu**
deux choses que personne n'aurait cherchées : le **wireframe de l'écran 3** (fiche + cours ouvert)
et le renvoi vers `API_SPEC.md` § Fiches. Aucun outil ne l'a signalé — un `Write` réussi ne dit pas
ce qu'il a effacé, et le compte de lignes (+255) **montait**.

**Parade** : après tout remplacement complet d'un document, lire **les suppressions** —
`git diff -U0 <fichier> | grep '^-'` — et justifier chaque ligne perdue. Un diff qui grossit peut
quand même avoir perdu l'essentiel.

> ⚠️ **Outillage, au passage** : dans le panneau navigateur, `computer {action:"scroll"}` **expire
> au bout de 30 s** quand le panneau est masqué (« The Browser pane is currently hidden »), alors
> que `javascript_tool` continue de répondre normalement. Pour vérifier une maquette, **affirmer
> sur le DOM** (`querySelectorAll`, classes, textes) coûte moins cher et prouve davantage qu'une
> capture d'écran suivie d'un défilement.

### ⚠️ Supprimer une branche EN LOCAL ne la supprime pas du serveur — et `git branch` ne peut pas le voir

Trouvé en vérifiant les faits de cette clôture, sur un enregistrement du dépôt vieux d'un jour. Le
commit `618c8f5` annonce « les 13 branches périmées sont supprimées ». Mesuré :

| Contrôle | Résultat |
|---|---|
| `git branch --list 'feat/*' 'fix/*'` | **0** — vrai, elles sont parties |
| `git ls-remote --heads origin` (hors `main`) | **13** — elles sont toutes là |
| `gh pr list --head <b> --state all` (#98, #110, #102) | **MERGED** |

Sans gravité fonctionnelle, mais **le dépôt portait un enregistrement faux**, et c'est le défaut :
une clôture suivante aurait lu « supprimées » et n'aurait pas recompté.

**Parade** : `git push origin --delete <branche>` (ou `--delete-branch` sur `gh pr merge`), puis
`git fetch --prune`. Contrôle : `git ls-remote --heads origin`, **jamais** `git branch`.

✅ **Soldé le 2026-08-13** : les 13 supprimées du serveur, `git ls-remote` rend `main` seul.
**Contrôle appliqué avant de supprimer, plus fort que « la PR est mergée »** — pour chacune, la
**tête distante** devait être exactement le `headRefOid` que GitHub avait mergé (13/13 conformes,
0 refusée). Une branche dont la tête distante s'écarte du `headRefOid` porte un commit poussé
**jamais fusionné** : la supprimer le perdrait, et `state: MERGED` ne l'aurait pas dit.

⚠️ **C'est l'inverse du piège déjà consigné** — celui-là dit que `git branch -r` **ment en
affirmant qu'une branche existe** (ref de suivi périmée). Ici la suppression locale est réelle et
c'est le **serveur** qui n'a pas été touché. Même commande, deux mensonges opposés : seul
`git ls-remote` tranche, dans les deux sens.

## ZETIS répond vite, ouvre la ressource exacte, et interroge (ADR-0059) — 2026-08-15

Chantier `feat/zetis-repond-vite`. Neuf pièges, dont **quatre trouvés au micro** et **trois dans
mes propres tests**.

### 🔴 Un verrou VERT sur son sabotage — jsdom n'a pas d'`AudioContext`

Le test du §5.1 (« le texte s'affiche avant la voix ») était **vert même en remettant l'ordre
fautif**. Cause : `isVoicePlaybackSupported()` rend `audioContextCtor() !== null`, et jsdom n'a
pas d'`AudioContext`. **La branche vocale n'était jamais traversée**, donc l'ordre des deux blocs
n'avait aucun effet observable.

**Parade** : mocker `../lib/voice` avec `isVoicePlaybackSupported` à **`false` par défaut**, et le
passer à `true` dans le seul test qui teste la voix.

⚠️ **Le rendre `true` globalement casse deux autres tests** pour une raison sans rapport :
`playback.ended` résolu d'emblée termine la parole instantanément, et « la carte n'apparaît
qu'APRÈS la parole » devient faux. Un mock trop large déplace le bug au lieu de le corriger.

### 🔴 `Crc32EmbeddingProvider` est déterministe mais PAS discriminant

La mémoire du projet consigne que `FakeEmbeddingProvider` n'est pas déterministe. Le remplaçant
recommandé, `Crc32EmbeddingProvider`, l'est — **mais il rend un cosinus de 0,79 entre
« mathématiques » et « Nombres relatifs »**, au-dessus du seuil de production (0,72).

Conséquence : **un test de NON-résolution y est vert pour une mauvaise raison**, la requête
« résolvant » vers une notion sans rapport.

**Parade** : `monkeypatch.setattr(settings, "chat_skill_resolution_min_score", 0.99)` — seule une
correspondance quasi exacte résout alors, ce qui reproduit le vrai comportement.

### 🔴 Un nom de propriété a détourné DIX tests d'un coup

`FakeLLMProvider.generate` aiguille sur la **présence d'une propriété** dans `request.fmt`.
L'`adr-0059` §7 a ajouté `answer` au schéma du tour de chat — or `answer` était déjà la clé de
l'auto-vérification des quiz. **Tous les tours de chat sont partis dans la branche quiz** : dix
tests rouges d'un coup, aucun ne parlant de quiz.

**Parade** : tester le schéma le plus **spécifique** d'abord — le chat porte `declared_difficulty`,
que le quiz n'a pas.

### 🔴 Un correctif MORT parce que la variable qu'il testait mentait

Premier placement du rattrapage « matière » : derrière `if skill_id is None`. Or `skill_id`
retombe sur la notion déduite du **message entier**, qui accroche presque toujours quelque chose.
**La condition ne se serait jamais déclenchée en production.**

**Parade** : tester ce que le moteur a **nommé** (`notion_query`), pas ce que le serveur a déduit.

### ⚠️ Patcher l'appelant est sans effet quand l'import est DANS la fonction

`_resolve_chapitre` fait `from app.modules.galaxy.service import _visible_notions` **à
l'intérieur** de la fonction. `monkeypatch.setattr(chat_actions, "_visible_notions", …)` est donc
vert et **sans aucun effet**. Il faut greffer sur le **module source**.

*(Même motif que le piège `enqueue_*` déjà consigné — « greffer sur les fabriques ».)*

### ⚠️ Un résolveur qui lève casse la conversation

`_visible_notions` appelle `_active_year_or_404` : sans année scolaire active — état normal sur
une base neuve — il lève un **404**. Une simple question dans le chat renvoyait une erreur au lieu
d'une réponse. Attrapé par un test qui ne parlait pas de chapitres.

**Parade** : tout résolveur du chat est **best-effort** et rend `None` plutôt que de lever.

### 🔴 `ai_jobs.duration_ms` mesurait la durée de l'AUDIO, pas du traitement

`job.duration_ms = int(result.duration_seconds * 1000)` où `duration_seconds` vient d'`info.duration`
de faster-whisper. Partout ailleurs (`ollama_provider`, `mlx_provider`, `anthropic_provider`) c'est
un `time.monotonic()` écoulé. **Une phrase de 3 s transcrite en 6 s s'enregistrait à `3000`.**

Conséquence : **toute mesure de latence STT faite sur cette colonne était fausse** — et c'était le
seul instrument disponible.

### 🔴 Le verrou de vie privée regardait le mauvais `job_type`

`test_ai_jobs_of_a_turn_carry_no_message_text` filtrait `job_type == "chat_turn"`. La dictée du
chat passait par `eli5_transcribe` : **78 lignes portant les mots de Massimo**, du 2026-07-04 au
08-14, sans qu'aucun test ne rougisse.

**Parade** : le scan est désormais **sans filtre**. Un verrou qui ne regarde qu'un `job_type` ne
protège qu'un `job_type`.

### ⚠️ Deux tables voisines qui répondent à la même question finissent par diverger

`_MENU_LABEL` (serveur) disait encore « 🧠 Reconstruire la carte » quand `ACTION_UI` (front) était
passé à « Reconstruire la mindmap » le 2026-08-12 — **invisible**, parce que `ChatPage` fait
`ACTION_UI[kind] ?? item.label` et écrase toujours le libellé serveur.

**Parade** : la table morte est supprimée. Et pour celles qui doivent coexister (les deux fabriques
de routes), un **contrat de grammaire** écrit à la main, extérieur aux deux — 🔴 **jamais généré
depuis l'une d'elles**, sinon il certifie le bug.

### 🔴 Deux notions dans une phrase ⇒ AUCUNE notion résolue, et tout l'ancrage meurt avec

`resolve_skill` vectorise le message **entier** et le compare aux noms de notions. Sur *« explique-
moi la différence entre le narrateur et le personnage principal »*, la similarité se répartit entre
deux notions et **aucune** ne passe le seuil de 0,72. Sans notion, pas de matière ; sans matière,
ni contexte canonique ni repli RAG — celui-ci était indexé sur la matière de la notion résolue,
donc **mort exactement là où il devait servir**.

ZETIS a répondu *« je ne l'ai pas encore dans tes cours »* alors que **le cours sur le Narrateur
existe, validé**. Un refus honnête retourné en affirmation fausse.

**Parade**, en trois crans : sans notion, le RAG cherche **toutes matières confondues** (le
plancher de distance devient le seul garde-fou) · `lesson_matching_text` cherche dans les **cours
eux-mêmes**, sur ce qu'ils s'appellent, sans aucun embedding · et quand les deux se taisent, un
refus **distinct** (`NOTE_NOTION_INCERTAINE`) qui demande de préciser au lieu d'affirmer.

⚠️ **Le RAG ne pouvait pas tenir lieu du troisième cran** : il n'indexe que les sources ingérées,
jamais les cours. Un dépôt sans ingestion aurait obtenu un refus poli à la place de la réponse.

⚠️ Et le garde-fou compte plus que la recherche : **la porte d'entrée est le TITRE** (ou le nom
d'une notion portée), jamais le contenu. « Différence » apparaît dans n'importe quel cours de
maths ; s'y ancrer ferait répondre ZETIS à côté **avec l'aplomb d'une source validée**.

### 🔴 Une classe CSS posée à moitié est invisible à `tsc`, à `vitest` et à la relecture

Le bouton « On arrête » — la **seule sortie visible** d'une interrogation — portait
`className="chat-ghost"`. Or la règle est le sélecteur **composé** `.chat-tool.chat-ghost` : une
moitié de sélecteur ne correspond à **rien**. Résultat mesuré dans le DOM : `background:
transparent`, `border: 0`, `padding: 0`, 68 px de texte nu.

Rien ne pouvait l'attraper. TypeScript ne connaît pas les classes CSS, jsdom ne charge pas la
feuille de style, et le JSX se relit sans rien remarquer.

**Parade** : un verrou qui observe la **classe** (`toHaveClass("chat-tool", "chat-ghost")`) — il
attrape exactement cette faute, et rien de plus. Le reste appartient à l'œil.

### ⚠️ `scrollIntoView` n'existe pas dans jsdom — neuf tests rouges d'un coup

Même famille que le piège `AudioContext` du 2026-08-02. Ajouter un défilement dans `ChatPage` a
fait tomber **neuf** tests sans rapport, sur un `TypeError: … is not a function`.

**Parade** : garde de typage côté code (`typeof ancre?.scrollIntoView === "function"`), et
**remplacement explicite** dans le test qui l'observe. ⚠️ La garde rend l'effet muet en test :
sans un verrou qui pose lui-même le mock, plus rien ne couvrirait le défilement.

### ⚠️ `ai_jobs.output_json` est de type `json`, pas `jsonb` — l'opérateur `?` n'existe pas

`select … where output_json ? 'transcript'` rend *« operator does not exist: json ? unknown »*.
Toutes les colonnes JSON du dépôt sont déclarées `json`.

**Parade** : caster à chaque usage — `output_json::jsonb ? 'clé'`, et
`(output_json::jsonb - 'clé')::json` pour retirer une clé sans changer le type de la colonne.

### 🔴 Le LaTeX ne se voit pas seulement, il s'ENTEND

ZETIS a rendu *« pour faire $1/2 + 1/3$ »*. Deux dégâts, pas un : Massimo lit des dollars, et
**Piper les prononce** — la réponse parlée devient « dollar un demi plus un tiers dollar ».
Corriger côté front n'aurait réparé que la moitié visible.

**Parade** : le nettoyage vit dans `_sanitize`, le seul point que **toute** réplique traverse (tour
de chat comme tour d'interrogation). Le prompt (`RÈGLE DE VOIX`) tarit à la source — il a fait
passer le moteur de `$3/6$` à « trois sixièmes », ce qu'aucun nettoyage n'aurait produit — mais
**une consigne ne garantit rien** : les deux gestes sont nécessaires.

⚠️ `5 $` n'est pas une formule : le délimiteur LaTeX est **collé** à son contenu, la devise en est
séparée par une espace. Sans cette garde, deux prix dans une phrase se mangent l'un l'autre.

### ⚠️ Un défaut d'affichage peut naître d'un changement de COMPORTEMENT, à distance

Le menu d'une notion était rendu **788 px sous le pli** d'un écran de 812 px : présent, cliquable,
jamais vu. `ChatPage` n'a jamais eu de logique de défilement — et ça tenait tant que ZETIS ne
répondait qu'une ligne. C'est le §7, « ZETIS répond au fond », qui l'a cassé : le karaoké occupe
désormais tout l'écran et pousse dehors ce qui le suit.

**Parade** : une ancre en fin de rendu, amenée sous les yeux quand un bloc **apparaît** — jamais
sur le karaoké, qui grandit mot à mot et arracherait la lecture. `block: "nearest"` ne déplace rien
quand le bloc est déjà visible.

⚠️ **Et la relecture visuelle cherchait autre chose** : un débordement horizontal du menu passé à
six boutons. Mesure dans le DOM à 375 px : `scrollWidth == clientWidth == 301`, zéro débordement.
Le défaut réel était perpendiculaire à celui qu'on redoutait.

## Trois témoins de plus — Matières, ELI5, Quiz (addenda ADR-0025 et ADR-0030) — 2026-08-15

Chantier `feat/trois-temoins-de-plus`. Six pièges, dont **deux dans mes propres sabotages** et un
qui a cassé un build entier sans qu'aucun test ne puisse le voir.

### 🔴 `late` est une sous-chaîne de `correlate` — un verrou de jetons rougit à tort

`test_news_doctrine.py` interdit un vocabulaire d'arriéré (`due_at`, `done_at`, `late`…) en
scannant le **source** des compteurs par un simple `token in body`. Un `servable_quiz_ids`
parfaitement conforme est sorti **rouge** parce qu'il appelle `.correlate(Quiz)`.

**Cause** : le scan est une recherche de sous-chaîne, sans borne de mot.

**Parade** — et c'est le point : **ne pas retirer le jeton, et ne pas mettre `\b` non plus.**
`\b` aurait laissé passer `_late` et `late_`, donc aurait **affaibli** le verrou pour corriger un
faux positif. Le scan utilise désormais `(?<![a-z])<jeton>(?![a-z])` : il refuse `correlate` et
continue d'attraper `_due_at`, `q.completed_at`, `overdue_count`. Helper `_lit_un_jeton_interdit`.

> Règle générale : quand un verrou rougit à tort, la correction se juge à ce qu'elle laisse
> **passer** en plus, pas seulement à ce qu'elle cesse d'attraper.

### 🔴 `**/` dans un commentaire JSDoc ferme le bloc — tout le module disparaît

Écrire `« naît d'un geste de Papa **/ DU SYSTÈME** »` dans le commentaire de `NavItem.newsKey`
a produit `ERROR: Unexpected "**"` au transform esbuild de `navigation.ts` — donc
`navigation.test.ts` **et** `MassimoSidebar.test.tsx` en « 0 test », pas en échec.

**Cause** : `*/` termine un commentaire de bloc où qu'il soit, y compris au milieu d'une phrase en
gras Markdown. Le dépôt écrit beaucoup de doctrine en Markdown **dans** des JSDoc — le risque est
structurel, pas accidentel.

**Parade** : ne jamais accoler `**` et `/`. Écrire « ou **DU SYSTÈME** ». **Symptôme à
reconnaître** : un fichier de test qui rapporte `(0 test)` au lieu d'échouer — c'est un problème de
transform, jamais d'assertion.

### 🔴 `_active_year_or_404` LÈVE — un compteur qui l'appelle fait tomber toute la navigation

`GET /api/student/news/summary` agrège dix témoins et est monté au shell de Massimo. La pente
naturelle, pour « l'année active », est `curriculum.service._active_year_or_404` — qui **lève une
`HTTPException`**. Un seul compteur qui l'appelle fait passer la route de 200 à 404, éteint les
neuf autres badges, et fait rougir toute la suite : la fixture `client_db` ne crée **aucune**
`SchoolYear`.

**Parade** : `_active_year_or_none`, jumelle non levante (le patron existait déjà dans
`quizzes/service.py::_active_year` et `mindmaps/service.py`). Verrou dédié :
`test_le_summary_repond_200_sans_annee_active`.

### 🔴 Une leçon `validated` SANS cours rendrait le badge immortel

`student_lesson_content` répond **404** si `content_markdown is None` — donc `mark_lesson_seen`
n'y est jamais atteint. Un témoin « leçons validées jamais vues » compterait des unités
qu'**aucun geste ne peut éteindre**.

Ce n'est pas théorique : **50 des 92** leçons validées de la base de dev sont dans ce cas, soit la
majorité. Le badge aurait affiché `9+` à vie.

**Parade** : `content_markdown.is_not(None)` dans le compteur, et un verrou qui l'exige pour tous
(`test_aucun_temoin_ne_compte_ce_qu_aucun_geste_ne_peut_eteindre`). **Règle générale** : avant de
compter une population, vérifier qu'un geste peut atteindre **chacun** de ses éléments.

### ⚠️ Un décor à UN seul objet rend un test d'égalité vert sur une divergence réelle

Sabotage : retirer `Quiz.quiz_type == QUIZ_TYPE_MISSION` de `servable_quiz_ids`. Le test d'égalité
contre `list_student_quiz_index` est resté **vert**. Cause : le décor ne semait qu'**un** quiz, et
il était de type mission — les deux ensembles restaient identiques quoi qu'on retire.

**Parade** : semer un quiz de **diagnostic** sur la même leçon. C'est la forme déjà rencontrée sur
l'ADR-0045 (« un sabotage vert parce que le décor ne peut pas atteindre la branche verrouillée »),
appliquée cette fois à un test d'ensembles : **un filtre ne se teste qu'avec un objet que ce filtre
doit exclure.**

### ⚠️ Un sabotage qui contourne le mock est vert sans rien prouver

Sabotage : « le bandeau d'Accueil remarque l'agenda vu ». Écrit
`(globalThis as …).markAgendaSeen?.()`, il est resté **vert** — le test remplace le module
`../../lib/agenda` par `vi.mock`, et un appel qui ne passe pas par l'import ne traverse pas le
mock.

**Parade** : un sabotage doit rétablir le chemin **réel** (ici : l'import **et** l'appel, deux
éditions liées). Rejoué ainsi → rouge.

> C'est la troisième occurrence documentée du motif « contre-épreuve mal visée » : un sabotage vert
> ne prouve rien tant qu'on n'a pas vérifié qu'il emprunte le chemin que le test observe.
