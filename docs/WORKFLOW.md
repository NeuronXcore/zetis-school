# WORKFLOW.md — Méthode de dev agentique ZETIS

> À relire avant chaque nouveau chantier. Le geste git d'ouverture (§2bis) et les
> textes-types (§6) se collent tels quels. Réfs internes : `CLAUDE.md` (Graphify,
> garde-fous), convention 7 fichiers (`MEMORY.md`…), `DECISIONS.md` (rituel ADR),
> discipline mono-chantier.

## 1. Principe directeur

En dev agentique, le goulot n'est plus d'**écrire** le code — l'agent le fait vite. Le goulot,
c'est la **décision** (en amont) et la **vérification** (en aval). Optimiser le workflow, ce
n'est donc pas taper plus vite : c'est **muscler les deux bouts** et rendre le milieu
(l'agent code) le plus mécanique possible.

**Règle qui chapeaute tout : l'agent propose, tu disposes. Les décisions et la mémoire vivent
dans le dépôt, pas dans le contexte de l'agent.**

## 2. La boucle, par chantier (un seul à la fois)

1. **Cadrer — mais d'abord, savoir DE QUEL CAS il s'agit.** 🔴 **Tous les chantiers ne se cadrent
   pas de la même façon**, et la version précédente de ce paragraphe l'ignorait : elle exigeait
   qu'« une décision soit écrite avant la moindre ligne », ce qui est vrai d'**un** cas sur quatre.
   L'**`adr-0060`** pose les quatre, **dans un ordre** — la première réponse « oui » tranche :

   | # | Question | Cas | ADR |
   |---|---|---|---|
   | **1** | **Rien n'est décidé** — on remet de la documentation ou de l'outillage au réel ? | **Rangement** (`chore/`) | **Aucun** |
   | **2** | La règle **existe déjà**, et on la fait respecter là où elle ne l'était pas ? | **Application** (`fix/`) | **Aucun** — on **cite** celui qui la porte |
   | **3** | Y a-t-il une **migration** ? Ou l'annulation coûte-t-elle **plus d'un commit** ? | **Décision neuve** (`feat/`) | **AVANT** le code |
   | **4** | Sinon — rendu, libellé, gabarit, ordre d'affichage | **Surface** (`feat/`) | **APRÈS** l'écran regardé |

   ⚠️ **Le cas 2 est celui qu'on rate** : un chantier qui touche une frontière *ressemble* à une
   décision. Poser `require_child` sur une route qui l'avait perdue n'est pas décider, c'est
   **exécuter** l'ADR-0002. Sa seule contrainte est la **citation** — un chantier d'application qui
   ne nomme pas l'ADR qu'il exécute est une décision déguisée.

   **Dans le cas 3 seulement**, le rituel complet s'applique : **décisions (ADR) et exploration
   (maquette)** d'abord — l'ordre entre les deux varie (la maquette précède quand elle sert à
   décider, l'ADR précède quand la décision commande la forme) — puis la **spec** (jamais avant la
   maquette qu'elle référence), puis le **prompt** (toujours en dernier). Côté Papa : références
   Mobbin en amont de la maquette. *Pourquoi :* une décision figée ne se re-discute pas à chaque
   session, l'agent la relit au lieu de la rouvrir. Le cadrage se rembourse 10× en exécution.

   **Dans le cas 4**, l'ADR est un **compte rendu écrit après l'écran**, et il porte
   obligatoirement une section « **ce que l'écran a démenti** ». Si elle est vide, la relecture
   visuelle n'a pas eu lieu et l'ADR n'est pas écrivable.
2. **Isoler** — mono-chantier + branche dédiée + un **hors-périmètre explicite** dans le
   prompt (geste git complet : §2bis). *Pourquoi :* le mode d'échec n°1 d'un agent est la
   dérive (« tant qu'on y est… »). Le hors-périmètre est une clôture, pas une correction
   après coup.
3. **Exécuter** — l'agent tourne dans une cage : `graphify update .` → **read-before-code** →
   build → **stop-on-blocker**. *Pourquoi :* le read-before-code empêche l'agent d'**inventer**
   une API ; le stop-on-blocker le force à **s'arrêter et signaler** au lieu de coder autour.
   → **`/slice <prompt>`** porte cette cage. Elle est identique à chaque fois : les prompts n'ont
   donc plus à la répéter dans un §0, ils ne portent que ce qui est propre au chantier. Un prompt
   qui la redit n'est pas faux, il est redondant.
4. **Vérifier** — **toi** : tu lances les tests (jamais confiance au « c'est vert »), tu relis
   le diff, tu vérifies que le périmètre a tenu. *Pourquoi :* c'est la seule étape non
   délégable. Point critique récurrent : la **non-régression** (un test existant *modifié* pour
   passer = régression masquée).

   **Deux filets automatisent le PREMIER TIERS de cette étape — et rien d'autre :**

   | Filet | Où | Portée |
   |---|---|---|
   | `hooks/pre-push` | local, installé par `ln -sf ../../hooks/pre-push .git/hooks/pre-push` | refuse le push si une suite est rouge · contournable par `--no-verify` |
   | `.github/workflows/ci.yml` | sur chaque PR et chaque push sur `main` | les 3 suites + les verrous du dépôt |

   🔴 **Un push vert ou une CI verte ne disent RIEN du diff ni du périmètre.** Le vert est une
   condition **nécessaire** ; il n'a jamais été suffisante. Les deux tiers restants sont à toi.

   ⚠️ **Un test vert sur ta machine ne prouve pas qu'il est autonome.** Le 2026-08-16, deux tests
   d'authentification exigeaient un PostgreSQL vivant sans que rien ne le dise — ils passaient
   **parce que `docker compose` tournait à côté**. Un venv neuf n'y change rien : il isole les
   **dépendances Python**, pas les **services réseau**. Pour le prouver, **couper le service** :

   ```bash
   ZETIS_DATABASE_URL="postgresql+psycopg://x:x@127.0.0.1:59999/nope" python -m pytest -q
   ```
5. **Mémoriser** — l'agent écrit la reprise (`MEMORY.md`) **pendant qu'il est lucide**, puis
   commit. *Pourquoi :* pour que la doc voyage *dans* le commit. La conversation est volatile,
   le dépôt est permanent.
6. **Intégrer** — PR → revue du diff → **merge en squash** → `git pull` sur `main` → **remettre
   `MEMORY.md` au réel** → chantier suivant depuis un `main` à jour. *Pourquoi la PR même en solo :*
   c'est la porte de revue matérialisée, *avant* que le code n'entre dans `main`. *Pourquoi
   `MEMORY.md` ici :* il a été écrit à l'étape 5, donc **avant** le merge — il annonce encore une
   branche vivante et des commits à pousser. C'est arrivé **deux fois** (`8618b78`, `c16719c`), et à
   chaque fois la session suivante a failli refaire du travail déjà fait.

   ⚠️ **Le squash n'est pas un détail de goût.** Une branche peut porter des commits hérités d'une
   session précédente, jamais relus dans celle qui merge — c'est arrivé sur la PR #136, qui en
   portait trois.

   🔴 **Avant de supprimer la branche, comparer au SQUASH, jamais à la tête de `main`.** Après le
   merge, `main` avance (l'étape 4bis ci-dessous), et `git diff main <branche>` affiche alors un
   écart qui n'est **pas** du travail retenu par la branche. Le piège s'est présenté **quatre fois
   de suite** les 16 et 17 août, à l'identique :

   ```bash
   git diff <revision-du-squash> <branche> --stat   # doit être VIDE
   git push origin --delete <branche> && git branch -D <branche>
   ```

## 2bis. Ouvrir un chantier — le geste git standard

Deux phrases à retenir ; tout le reste s'en déduit :

> **Les décisions vont sur `main`. Le travail va sur une branche.**
> **Et une branche commence toujours par ses documents.**

| Artefact | Où | Pourquoi |
|---|---|---|
| ADR (+ `DECISIONS.md` **régénéré**) | **`main`**, avant la branche | une loi vaut pour tout le dépôt, pas pour un chantier ; et deux branches qui éditent `DECISIONS.md` = conflit garanti |
| Spec de page, maquette, prompts | **la branche**, en **premier commit** | ils ne servent qu'à ce chantier et doivent être dans le dépôt avant la première session d'agent |
| Code | la branche, sessions suivantes | jamais dans le commit des specs |

🔴 **`DECISIONS.md` ne s'écrit plus à la main — il se RÉGÉNÈRE** (depuis la PR #136). Son en-tête
le dit : *« Fichier généré par `scripts/gen_decisions_index.py`. Ne pas éditer à la main. »* Écrire
l'ADR suffit ; l'index le trouve.

```bash
python3 scripts/gen_frontmatter.py docs/decisions --write      # pose le front-matter du nouvel ADR
python3 scripts/gen_decisions_index.py docs/decisions DECISIONS.md --write
bash scripts/check_adr_refs.sh                                  # doit sortir en 0
```

⚠️ **Deux pièges du générateur**, tous deux rencontrés : il classe en `type: surface` tout ADR
absent de la liste `ARCHITECTURE` de `gen_frontmatter.py` — **un ADR de méthode doit y être ajouté**
— et il remplit un `pr:` **faux** dès que l'ADR **cite** une PR dans sa prose. Relire le
front-matter généré avant de committer.

**Deux sessions, pas une — dans le CAS 3 seulement.** Le **cadrage** (ADR → maquette/spec → prompt)
se fait dans sa propre session, sur `main`, **sans une ligne de code** : un ADR écrit dans la
session qui code cesse d'être une contrainte pour devenir une justification. La session de **slice**
vient ensuite, sur la branche, et l'ADR y est **relu**, jamais rouvert.

> ⚠️ **Un rangement (cas 1) et une application (cas 2) n'ont PAS de session de cadrage** — il n'y a
> rien à décider. Ils partent directement sur leur branche `chore/` ou `fix/`, avec leur périmètre
> et leur hors-périmètre posés dans le premier message. **Ne pas appeler `/ouverture` pour eux** :
> elle exige un ADR et bloquerait sur un chantier parfaitement légitime.
>
> ⚠️ **Un cas 4 (surface) inverse l'ordre** : la branche d'abord, l'écran regardé, **puis** l'ADR
> qui rend compte. Et si le changement est **réversible en un commit**, **sans migration**, et **ne
> modifie aucun texte vu par Massimo**, il ne demande **aucun** compte rendu — une entrée
> `CHANGELOG` et un test suffisent.

> **Raccourci : `/ouverture <chantier> <ADR>`** — pour la session de SLICE, pas pour le cadrage
> (elle vérifie que le cadrage a eu lieu ; l'appeler avant, c'est se faire bloquer par son propre
> garde-fou). Elle contrôle `main` à jour, **fichiers ADR réellement présents** (pas seulement
> leur ligne d'index), spec et prompts en place, puis crée la branche et fait poser le
> hors-périmètre. Elle **s'arrête** si un ADR manque : c'est arrivé le 2026-08-01, et il a fallu
> écrire les ADR après la livraison.
>
> ⚠️ Elle attend un arbre sans modification de **code**, mais les documents du chantier y sont
> **normalement présents et non commités** — c'est ce qui fait que la branche naît avec eux.

Le geste, toujours identique (seul vocabulaire git dont ce workflow a besoin) :

```bash
# 1. Les décisions, sur un main à jour  ── CAS 3 uniquement
git switch main && git pull
# … écrire l'ADR dans docs/decisions/ …  puis RÉGÉNÉRER l'index (jamais l'éditer) :
python3 scripts/gen_frontmatter.py docs/decisions --write
python3 scripts/gen_decisions_index.py docs/decisions DECISIONS.md --write
git add -A && git commit -m "docs: ADR-00XX (<sujet>)" && git push

# 2. La branche, qui naît avec ses documents
git switch -c feat/<chantier>
# … copier spec → docs/frontend-<x>/ ; maquette → idem ; prompts → prompts/claude-code/ …
git add -A && git commit -m "docs(<chantier>): spec + maquette + prompts (ADR-00XX)" && git push -u origin feat/<chantier>

# 3. Ouvrir Claude Code sur la branche, coller le prompt de slice. C'est tout.
```

### La dérive avec `main` — la mesurer à chaque reprise, la rattraper dans un seul sens

Une branche qui vit plusieurs sessions prend du **retard** sur `main` (les décisions y sont
commitées, et un autre chantier a pu y être mergé). Ce retard ne coûte que deux choses : des
**conflits** à la fin, et surtout **coder contre une base périmée** — une API qui a changé, et on
le découvre au merge, quand le travail est fait.

**La règle :**

1. **`/reprise` mesure**, après un `git fetch` — avance ET retard. Tant que le retard est `0`,
   aucun geste : la discipline mono-chantier fait que `main` bouge peu.
2. **Retard > 0 → on tire `main` VERS la branche**, avant de coder :

   ```bash
   git merge origin/main
   ```

   **Pas d'aller-retour sur `main`.** On ne quitte pas la branche, on ne rejoue rien.

⚠️ **Et surtout pas de `rebase`.** Ce dépôt merge en **squash** : l'historique de la branche est
**jeté** au merge. Rebaser paierait donc le risque — réécriture de commits déjà poussés, force-push
— pour un bénéfice strictement nul. Le merge, lui, ne réécrit rien ; ses commits de fusion
disparaissent au squash de toute façon.

> **Le meilleur remède reste de ne pas dériver** : une branche qui vit une à deux sessions ne
> dérive pas. Le rattrapage est le filet, pas le plan.

Règles annexes :

- **Une branche part toujours de `main`**, jamais d'une autre branche — chaque chantier part
  de la dernière vérité stable, pas du travail non fini d'un voisin.
- Deux chantiers cadrés en même temps : la seconde branche peut être créée et « parquée »
  avec ses docs, mais **une seule branche reçoit du code** (mono-chantier).
- Conventions de nommage : `feat/<chantier>` ; maquettes `mockup-page-<x>.html` (Massimo) /
  `maquette-papa-<x>.html` (Papa) ; prompts `prompt-<chantier>-slice-<a>-<cible>.md`.
- Le **bâton d'autorité** ne concerne que PostgreSQL/MinIO : les commits de documentation
  n'y touchent pas ; il redevient pertinent dès que l'agent exécute (tests, base, Redis).

## 3. Les deux mémoires (ne pas les confondre)

| | Mémoire de **session** (contexte) | Mémoire du **code** |
|---|---|---|
| Objet | ce qui a été *dit / décidé* | comment le *code* est structuré |
| Se perd quand ? | nouvelle session, contexte saturé | jamais (fichier sur disque) |
| Récupérée par | `MEMORY.md` · Git · ADR/specs | **graphify** (`query`/`explain`/`path`) |

Trois canaux persistent la mémoire de session :

- **Git** = mémoire de l'**état du code** (commits, historique). Source de vérité sur « où en
  est le code ».
- **`MEMORY.md`** = mémoire du **raisonnement** (fait / en cours / à-faire / décisions actives /
  prochain pas). Écrit pour un lecteur sans contexte : la prochaine session.
- **ADR / specs** = mémoire des **décisions** figées. C'est la raison d'être du rituel de
  cadrage (ADR/maquette → spec → prompt) : externaliser la décision hors du contexte volatil.

**Graphify n'est pas de la mémoire — c'est de l'orientation.** Il ne « garde » rien qui se
perd ; il **réduit le coût de reconstruction** du contexte-code après un reset : une session
neuve interroge la carte (`graphify explain "<zone>"`) au lieu de relire 40 fichiers. D'où
`graphify` en tête de chaque prompt, **puis** read-before-code (la carte oriente, le code réel
vérifie).

**Les trois usages qui servent vraiment**, mesurés le 2026-08-04 :

| Commande | Quand | Ce qu'elle a apporté |
|---|---|---|
| `query "<question>"` | s'orienter sur une zone | c'est elle qui a fait apparaître le **3ᵉ** résolveur de leçon que le cadrage de l'ADR-0037 ignorait |
| `affected "<fn>"` | **avant de modifier une fonction partagée** | la liste des appelants **est** le périmètre de non-régression |
| `update .` | à chaque clôture | sans quoi la session suivante s'oriente sur un graphe périmé |

⚠️ **Et une limite à connaître : `explain` ment par omission sur un nom dupliqué.** Testé sur
`_active_year` — **7 nœuds dans le graphe, 1 seul rendu**, sans le moindre avertissement. Il répond
donc avec assurance sur une occurrence arbitraire, ce qui est le pire comportement possible quand
la question EST la duplication. Pour celle-là, `grep -rn "def <nom>"` dit la vérité.

> **Un graphe statique ne trouve pas tout, et il ne faut pas lui en demander plus.** Des sept
> défauts du 2026-08-04, il en couvrait **un** : deux tests qui passaient pour la mauvaise raison,
> un `progress_pct` figé, un réveil qui se duplique, des hash faux — seule l'**exécution** les
> trouve.

## 4. Les trois leviers d'optimisation

- **Front-load les décisions.** Le temps ne se gagne pas en codant vite, il se perd en
  re-décidant. Une heure d'ADR économise trois sessions qui tournent en rond.
- **Gère le contexte comme un budget.** Une session se dégrade *avant* de planter. **Coupe-la
  toi-même quand elle ralentit**, pendant qu'elle écrit encore un bon `MEMORY.md`. Une session
  neuve qui relit la doc repart plus nette qu'une session saturée qui radote.
- **Muscle les deux bouts, allège le milieu.** Qualité au cadrage (prompt fermé,
  read-before-code, hors-périmètre) et à la vérification (tests, revue). Si tu débats archi
  *pendant* que l'agent code, c'est que le cadrage était incomplet — remonte, ne rustine pas.

## 5. Timeline fin de session → reprise (sans perdre la mémoire)

La chaîne de flèches **se rompt à la coupure** : le contexte n'est pas transporté, il est jeté.
Ce qui relie les deux sessions, c'est le **dépôt** (écrit en phase 1, relu en phase 2).

```txt
FIN DE SESSION (l'agent est encore lucide)
  1. [décisions]  l'agent écrit la reprise   → MEMORY.md (fait / à-faire / décisions)
  2. [code]       graphify update .          → carte du code à jour
  3. [vérif]      TU vérifies la reprise      → contrôle de MEMORY.md
  4. [décisions]  commit wip + push           → l'état du code est figé
  ── si le chantier est fini : PR → CI VERTE → merge ──   ◄─┐
  4bis.[décisions] MEMORY.md AU RÉEL          → mergé, branche supprimée, rien à pousser
                                                 └── /livraison enchaîne 4 → 4bis d'un trait
─────────────  coupure — le contexte est perdu  ─────────────
NOUVELLE SESSION (amnésique, repart de zéro)
  5. [code]       graphify update / explain   → réorientation, sans tout relire
  6. [décisions]  git log + lis MEMORY.md      → récupère les décisions
  7. [vérif]      vérifie l'existant           → ne recode rien de fait
  8. →            reprends au « prochain pas »  → le chantier continue
```

⚠️ **L'étape 4bis est celle qu'on oublie, et c'est structurel.** `MEMORY.md` est écrit à
l'étape 1 — donc **avant** le merge — et rien ne le réveille après. Il survit à son propre
chantier en annonçant une branche vivante, des commits « NON POUSSÉS » et un « prochain pas »
déjà fait. La session suivante lit ça et repart travailler sur du travail terminé.

Le symptôme est reconnaissable : `MEMORY.md` parle d'une branche que `git branch -r` ne montre
plus. **C'est arrivé deux fois** (`8618b78`, `c16719c`). Le remède tient en une question à se
poser juste après le merge : *« ce fichier décrit-il encore le dépôt tel qu'il est ? »*

Ce que 4bis doit consigner, au minimum : le **squash** et le numéro de PR, la **suppression de
la branche**, « rien à pousser », et surtout ce que la clôture **laisse ouvert** — vérifications
non faites, données de test restées en base, décisions différées. Ces résidus-là ne vivent nulle
part ailleurs : ni Git ni les ADR ne les portent.

> 🔴 **Depuis le 2026-08-22, les étapes 4 → 4bis sont portées par la commande `/livraison`** —
> parce que l'oubli était structurel et qu'une consigne qui compte sur la vigilance a déjà échoué
> deux fois. Elle enchaîne commit → push → PR → **attente de la CI** → merge → 4bis → commit
> documentaire, et c'est la **seule** commande du dépôt qui committe et merge d'elle-même.
>
> **Trois garde-fous, chacun payé le jour où elle a été écrite** :
>
> 1. 🔴 **Le seul vert qui autorise un merge est celui de la CI.** « Vert en local » ne vaut rien :
>    914 tests verts sur la machine, la CI rouge dix minutes plus tard. La commande **attend** —
>    et ne se fie jamais au code de sortie de `gh pr checks --watch`, sorti en **0** ce jour-là
>    avec un job échoué.
> 2. 🔴 **Un rouge ÉTRANGER au chantier donne droit à UN re-run — dont AUCUNE des deux issues ne
>    merge.** Vert : arrêt quand même, parce qu'un re-run ne répare pas un test instable, il le
>    rend invisible — c'est le **rouge** qui produit le diagnostic. Rouge à nouveau : arrêt aussi,
>    et traité comme un rouge du chantier, car deux rouges d'affilée sur le même job ne sont plus
>    une loterie mais un défaut **reproductible** ; **aucun second re-run** — trois exécutions
>    pour un verdict, c'est du tirage au sort. ⚠️ Et le re-run lui-même **se mérite par une
>    preuve** : un échec qu'on ne sait pas attribuer se traite comme un rouge du chantier, « je ne
>    sais pas » n'étant pas « c'est étranger ». ⚠️ `gh pr merge --auto` est **interdit** à la
>    commande pour cette raison exacte, alors même que le dépôt a activé l'auto-merge pour les
>    gestes manuels.
> 3. 🔴 **Un CHOIX de surface l'arrête toujours**, quelle que soit la couleur de la CI — un
>    libellé, une formulation, un ordre appartiennent au commanditaire (`adr-0060` cas 4, tranché
>    devant l'écran) ; un titre de bloc a demandé **trois** propositions ce jour-là. ⚠️ Mais la
>    **vérification** visuelle, elle, appartient à l'agent : il ouvre le préview, lit le DOM,
>    livre une **capture**, et continue. Voir §5bis.
>
> Elle **refuse de partir** si l'on est sur `main`, si `DECISIONS.md` traîne dans l'arbre, ou si
> `/cloture` n'a pas eu lieu — elle livre, elle n'écrit pas la mémoire à sa place.

### ⚠️ `MEMORY.md` ne garde QUE le chantier actif — les quatre contrôles avant d'élaguer

**Constat du 2026-08-04** : le fichier portait **2 227 lignes d'historique pour 122 lignes de
chantier actif**. 94 % du contexte d'une reprise dépensé sur du travail terminé — **l'instrument
censé économiser le contexte en était devenu le premier consommateur**. Après élagage : 181 lignes.

**La règle : à la clôture, on retire la section du chantier PRÉCÉDENT.** Pas de fichier d'archive —
ce serait une quatrième copie d'un contenu déjà écrit trois fois.

**Mais jamais sans ces quatre contrôles :**

| # | Vérifier que… | Où |
|---|---|---|
| 1 | les **décisions** y sont | l'ADR du chantier existe (`docs/decisions/`) |
| 2 | les **pièges** y sont | `TROUBLESHOOTING.md` a la section du chantier |
| 3 | le **livré** y est | `CHANGELOG.md` a son entrée de version |
| 4 | 🔴 **rien n'y reste OUVERT** | sinon **remonter** dans « DETTES OUVERTES » de la section active |

⚠️ **Le 4ᵉ n'est pas décoratif, et c'est celui qu'on oublie.** L'élagage du 2026-08-04 a exhumé
**cinq dettes vivantes** qui dormaient dans l'historique — dont la galaxie **jamais vérifiée sur
trois appareils** (livrée le 2026-08-01) et un `ZETIS_DATABASE_URL` que `.env.example` **et**
`DEPLOYMENT.md` annonçaient sans son préfixe, donc **ignoré par le backend**. Un élagage aveugle les
aurait effacées.

> **L'historique s'était mis à servir de cimetière à dettes** : ce qu'on ne savait pas où ranger y
> tombait, et devenait invisible à la reprise suivante. Le 4ᵉ contrôle existe pour ça.

Pour retrouver une section retirée : `git log -p MEMORY.md` (56 révisions au moment de l'élagage).

### ⚠️ Ne jamais écrire dans `MEMORY.md` la tête de branche qu'il vit

**Une ligne qui nomme le commit qui la contient ne peut pas être vraie.** Écrire « HEAD = `abc123`,
6 commits » à l'étape 1, c'est décrire l'état d'**avant** le commit de clôture qui porte cette
ligne. La corriger ne sauve pas : la correction produit à son tour une nouvelle tête. Et
`git commit --amend` non plus — il change le hash.

Ce n'est donc **pas de l'inattention**, c'est structurel : le fichier est modifié par le geste
qu'il décrit. **C'est arrivé six fois** (dernières occurrences : `origin/main = 4d3fc99` écrit
alors que le 4bis passait par-dessus le 2026-08-03 ; « 6 commits, HEAD `0f86eea` » le même jour).

**La règle :**

| Ce qui s'écrit | Ce qui ne s'écrit pas |
|---|---|
| le **nom de la branche**, si elle est poussée, si elle a été rebasée | la **tête** (`HEAD`) |
| la **base** (`main`/`origin/main`) — elle ne bouge pas sous nos pieds | le **nombre de commits** |
| les hash des commits **de code**, antérieurs à la clôture | le hash du commit de clôture |
| après le merge (4bis) : le **squash** et le n° de PR — définitifs | |

Et à la place de ce qu'on n'écrit pas, une ligne qui renvoie à la source :
`git log --oneline main..HEAD` **dit la vérité**, toujours.

> Le principe général est déjà au §3 : `MEMORY.md` porte le **raisonnement**, Git porte l'**état
> du code**. Recopier dans l'un ce que l'autre sait dire, c'est fabriquer une seconde vérité —
> et celle-ci se périme au commit suivant.

## 5bis. Voir l'app tourner (quand le chantier le demande)

**Seulement quand la vérification est visuelle.** Un refactor backend, une passe de tests ou de
doc n'ouvre pas de navigateur — démarrer les serveurs par réflexe coûte deux processus pour rien.

Les serveurs se lancent **par paires appairées** (`.claude/launch.json`) : chaque front pointe un
backend précis, et ce backend n'autorise en CORS que ce front. Lancer un front sans son backend,
ou deux paires croisées, donne un écran qui charge sans fin. Paire de référence :
**`backend-galaxy` (`:8003`) + `massimo-galaxy` (`:5179`)**.

⚠️ **Deux pièges, tous deux rencontrés le 2026-08-02 :**

- **Les serveurs lancés par l'agent meurent avec la session.** Pour inspecter tranquillement,
  les lancer depuis un terminal à soi.
- **Le panneau d'aperçu a son PROPRE stockage.** Être connecté dans son navigateur ne connecte
  pas l'onglet que l'agent pilote — et l'agent ne saisit pas de mot de passe. Pour voir une page
  derrière `RequireAuth`, il doit passer par **`claude-in-chrome`** (le vrai navigateur, avec sa
  session). Sans ça, il tourne en rond sur `/login`.

**Ce que les tests ne verront jamais.** Deux défauts de cette journée n'étaient détectables qu'à
l'écran : une pastille au compte **juste** mais non cliquable (l'affordance mentait), et quatre
surfaces affichant « Mathematiques » sans accent (les tests vérifiaient la *destination* des
liens, jamais le mot affiché). **Une slice d'interface n'est pas finie tant que personne ne l'a
regardée.**

## 6. Textes-types (à coller dans Claude Code)

### 6.1 Ouverture de session (nouveau chantier)

🔴 **La première ligne déclare le CAS** (`adr-0060` §4). Ce n'est pas une formalité : c'est elle qui
dit s'il faut un ADR, et quand.

```
Chantier : <nom> — Slice <A/B> (<ADR>). Branche : feat/<chantier> (étape <n>).
Cas ADR-0060 : <rangement | application | décision neuve | surface> — donc <aucun ADR |
  aucun ADR mais je CITE <ADR-00XX> | ADR déjà écrit, je le relis | ADR APRÈS l'écran regardé>.
Mono-chantier : cette session ne touche QUE <périmètre>. Hors de ça, tu t'arrêtes.

Décisions déjà tranchées (ne les rouvre pas) : <lister>.
Frontière non négociable : <ex. layout=présentation client ; métier=serveur>.
Préconditions (déjà vraies — ne les recrée pas) : <branche, doc committée, deps mergées>.

Déroulé imposé :
1. `graphify update .` en premier.
2. Read-before-code STRICT : lis TOUTE la liste du prompt avant d'écrire une ligne.
   Ne suppose jamais une API/un modèle — vérifie dans le code réel.
3. Stop-on-blocker : toute divergence réelle avec la doc → tu T'ARRÊTES, signales,
   proposes l'ajustement minimal. Tu ne codes pas autour.
4. À la fin : checklist standard 9 points.
Le prompt complet suit.
```

### 6.2 Reprise de session (contexte perdu, même chantier)

```
Reprise — <chantier> Slice <A/B> (feat/<chantier>). Contexte précédent perdu.
NE REPARS PAS de zéro. Dans cet ordre, AVANT d'écrire :
1. `graphify update .`
2. `git log --oneline -8` — l'état réel du code.
3. Lis MEMORY.md, section « État à la reprise » (la première ; les « Historique — … » sont clos).
4. Relis <ADR> + <prompt de référence> — les décisions ne se rediscutent pas.
5. `graphify explain "<zone>"` — comprends la zone à reprendre sans tout relire.
6. Vérifie dans le code ce qui existe déjà — ce qui est fait ne se recode pas.
Puis reprends au "PROCHAIN PAS" du MEMORY.md.
```

### 6.3 Clôture de session (avant le commit)

```
Avant de committer, mets à jour la doc de chantier (toi l'agent, pendant que tu es lucide) :
1. MEMORY.md § Reprise : fait / en cours / à-faire + décisions actives + prochain pas.
2. TROUBLESHOOTING.md : tout écart réel rencontré (signature d'API inattendue, etc.).
3. Les documents de STRUCTURE, chacun sous SA condition — passe la liste, ne devine pas :
   ARCHITECTURE.md (un service ou un flux change) · PROJECT_STRUCTURE.md (un module OU UN
   DOSSIER RACINE ajouté/déplacé/supprimé) · DATA_MODEL.md (table, colonne, contrainte, règle
   de lecture) · API_SPEC.md (un endpoint naît, change de contrat, disparaît) · .env.example
   (une variable — corrige alors tout son groupe) · docs/frontend-*/page-*.md (l'écran change
   de comportement).
4. CHANGELOG.md : **une entrée si un COMPORTEMENT change, pas si des fichiers bougent.**
   Ne touche PAS ROADMAP.md ni CLAUDE.md.
Puis donne-moi la checklist 9 points + le message de commit suggéré.
```

> 🔴 **Le critère du `CHANGELOG` a été tranché PAR L'USAGE**, les 16 et 17 août, après quatre
> clôtures qui l'avaient contourné : *une entrée si un comportement change, pas si des fichiers
> bougent.* Un rangement de documentation n'en a pas ; le même rangement qui **corrige une
> régression** en a une. Ce critère importe au-delà du confort : le **contrôle 3 de l'élagage**
> (§5) exige une entrée `CHANGELOG` avant de supprimer une section de `MEMORY.md`.
>
> ⚠️ **`CLAUDE.md` reste hors de la clôture** — mais il n'est pas intouchable pour autant : un
> chantier qui applique une décision aux fichiers de méthode le corrige, comme celui-ci l'a fait.

### 6.4 Checklist de clôture (9 points)

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes lancées ·
6. Tests (résultat) · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Message de commit conseillé.

### 6.5 Livraison (après la clôture) — `/livraison`

La clôture s'arrête au **point 9** : elle propose un message de commit, elle ne committe pas.
Ce qui suit est **toujours identique**, et coûtait sept allers-retours — c'est ce que la commande
absorbe :

```
/livraison
```

```txt
commit → push → PR → ATTENTE DE LA CI → merge (squash, branche supprimée) → 4bis → commit doc
```

Elle s'arrête et te rend la main dans **trois** cas, et trois seulement : un rouge **du**
chantier (elle rend le diagnostic, elle ne corrige pas — un correctif est du code, et du code se
relit) · un **vert obtenu après un re-run** (il révèle une loterie, il ne la répare pas) · un
**choix de surface** (un libellé n'est pas un test). Le détail et l'histoire de chaque garde-fou
sont au §5.

⚠️ **Elle ne remplace pas la clôture, elle la suit** — et refuse de partir sans elle : sans
`MEMORY.md` à jour, un merge produit exactement l'oubli de 4bis que le §5 documente.

## 7. Garde-fou méta — la sobriété vaut aussi pour le process

Ne sur-applique pas la méthode. Pas d'ADR pour un choix de couleur ; pas 7 fichiers parfaits à
chaque `wip` (un `MEMORY.md` juste vaut mieux que sept fichiers effleurés) ; pas de PR pour un
commit d'une ligne. Chaque artefact doit **gagner** sa place : décision réutilisable → ADR ;
choix d'IA de navigation → une ligne de spec ; rien → rien. La méthode aide tant qu'elle réduit
l'incertitude ; dès qu'elle devient rituel vide, elle coûte.

🔴 **Ce garde-fou a désormais une règle, et non plus seulement une intention** : les **quatre cas**
du §2 étape 1 (`adr-0060`). Trois d'entre eux ne demandent **aucun** ADR. Le registre en portait
**104 fichiers pour 59 décisions** avant qu'on le range — 44 % d'addendums, dont sept sur un seul
ADR et **cinq le même jour**. Un rituel qui produit un document par hésitation ne fixe plus rien :
il enregistre.

⚠️ **Et la sobriété vaut dans les deux sens.** Le cas 2 est celui qu'on rate *par excès de zèle* :
écrire un ADR pour un chantier qui ne fait qu'exécuter une règle existante, c'est **fabriquer une
décision là où il n'y a qu'une dette**.
