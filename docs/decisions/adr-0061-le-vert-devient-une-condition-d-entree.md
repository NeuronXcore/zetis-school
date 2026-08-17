---
id: "0061"
titre: "Le vert devient une condition d'entrée, pas une information"
type: architecture
statut: propose
date: 2026-08-16
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0060"]
---
# ADR-0061 — Le vert devient une condition d'entrée, pas une information

## Statut

**Proposé — 2026-08-16.** N'amende aucune décision produit. Il rend **opposable** ce que
l'`adr-0060` classe en cas 2 et que le `WORKFLOW.md` §2 étape 6 énonce déjà :
*« la PR est la porte de revue matérialisée, **avant** que le code n'entre dans `main` »*.

> ✅ **APPLIQUÉ le 2026-08-17 en fin de journée.** Les trois checks sont requis sur `main` :
> `backend — pytest` · `frontends — vitest` · `verrous du dépôt`, `strict: false`,
> `enforce_admins: false` — exactement les §1 à §4 ci-dessous.
>
> ⚠️ **Ce qui a débloqué le geste n'est pas ce que cet ADR prévoyait.** Le §Suivi proposait GitHub
> Pro, une organisation Team, ou de rendre le dépôt public — cette dernière étant **écartée** au
> motif qu'il porte les données de Massimo. **Le commanditaire a choisi cette option-là**, en
> connaissance de cause, et a basculé le dépôt en public le matin du 2026-08-17. La protection de
> branche est gratuite sur un dépôt public : il n'y a eu ni abonnement, ni organisation.
>
> 🔴 **La contrepartie est réelle et n'est pas annulée par la décision de la prendre** : le prénom de
> Massimo apparaît dans **818 fichiers suivis**, avec son niveau, ses matières et ses notions
> fragiles. Aucun secret technique n'est exposé (ni `.env`, ni clé, ni base — le `.gitignore` a
> tenu) ; ce qui l'est, c'est le **portrait scolaire nominatif d'un mineur**. C'est écrit ici pour
> que la prochaine session le sache, pas pour rouvrir un arbitrage rendu.
>
> ⚠️ **La mesure du matin disait vrai, et le §Suivi aussi** : sur un dépôt **privé** en plan
> gratuit, les deux API répondaient bien `403 Upgrade to GitHub Pro or make this repository public`.
> Ce n'est pas la mesure qui était fausse, c'est la **contrainte** qui a bougé.
>
> ⚠️ **La preuve du geste reste indirecte, et il faut le dire** : l'endpoint de LECTURE
> (`GET …/branches/main/protection`) répond **503** de façon persistante — une panne côté GitHub,
> pas un refus. Les deux signaux dont on dispose sont la **réponse du PUT**, qui a rendu l'objet
> complet avec les trois contextes, et `GET …/branches/main → protected: true`. **La preuve
> comportementale viendra de la première PR rouge qui refusera de se merger** — c'est exactement ce
> que le §Suivi annonçait, et personne ne la fabriquera exprès.
>
> **Ce qui est conservé de l'erreur d'origine**, parce qu'elle vaut au-delà de ce cas : *j'ai décidé
> d'un réglage sans vérifier qu'il était disponible.* Le read-before-code du cadrage a porté sur la
> **doctrine**, jamais sur la **faisabilité**. Une commande d'API en lecture aurait suffi.

> **Pourquoi un ADR alors que la CI n'en a pas demandé.** Poser `.github/workflows/ci.yml` était une
> **application** (cas 2) : la règle existait, on la faisait respecter. Activer une *required check*
> est autre chose — ça ne s'annule pas en un commit (**c'est un réglage GitHub, pas un fichier**) et
> **ça change qui peut merger**. Les deux critères du cas 3 sont réunis, et un seul aurait suffi.

## Contexte

### Ce que la journée du 2026-08-16 a établi, et qui n'est pas une opinion

| Fait | Mesuré |
|---|---|
| La PR #136 a été **mergée verte** avec la suite backend **rouge** | 2 tests, une heure sur `main` |
| Le verrou `check_adr_refs.sh` était **vert** au même moment | il ne teste que `ADR-\d{4}`, jamais un chemin |
| Le dépôt n'avait **aucune CI** | `.github/workflows/` n'existait pas |
| Deux tests exigeaient un **PostgreSQL vivant** sans que rien ne le dise | verts en local, rouges pour quiconque clone |
| Un test cassait sous **Node 20** | vert sous Node 24, la version de la machine de dev |

Les deux derniers défauts **étaient antérieurs de plusieurs semaines**. Ils ont été trouvés par le
**premier run** de la CI, et par rien d'autre.

### L'état actuel : la CI voit tout et n'empêche rien

`.github/workflows/ci.yml` (PR #139) rend trois checks à chaque PR — `backend — pytest`,
`frontends — vitest`, `verrous du dépôt` — et un quatrième vient de GitGuardian. **Aucun n'est
requis.** Un rouge s'affiche sur la PR et le bouton *Merge* reste vert.

`hooks/pre-push` (PR #138) est un filet **local** : il ne s'exécute que là où le lien a été posé, et
`git push --no-verify` le contourne. Ces deux dispositifs **informent** ; ni l'un ni l'autre
n'**interdit**.

> 🔴 **Le motif n'est pas la défiance envers l'humain, c'est la fatigue.** Le 2026-08-16, la suite
> rouge n'a pas été mergée par négligence : elle a été mergée parce que **rien ne l'a dit**, à la fin
> d'une session longue, dans un dépôt à un seul contributeur qui est aussi son seul relecteur. Une
> règle que seule l'attention fait tenir cède au moment exact où l'attention baisse.

## Alternatives considérées

**1. Ne rien activer — la CI reste un témoin.** *Rejetée.* C'est l'état d'aujourd'hui, et il repose
entièrement sur le fait de **regarder** avant de cliquer. C'est précisément ce qui a échoué.

**2. S'en remettre au hook `pre-push` seul.** *Rejetée.* Il n'est installé que sur les machines où
quelqu'un a lancé le `ln -sf`, `--no-verify` le contourne, et **rien ne vérifie qu'il est en place**.
Un filet dont on ne peut pas prouver l'existence n'en est pas un.

**3. Tout requérir, GitGuardian compris.** *Rejetée* — voir §3. Un check tiers qui tombe en panne
bloquerait le dépôt sans qu'on puisse rien y faire.

**4. Exiger en plus que la branche soit à jour avec `main` avant merge.** *Rejetée pour l'instant* —
voir §4. Sur un dépôt privé, chaque mise à jour relance ~7 minutes de CI, et le bénéfice est faible
à un seul contributeur.

## Décision

### 1. Trois checks deviennent requis sur `main`

`backend — pytest` · `frontends — vitest` · `verrous du dépôt`.

Ce sont exactement les trois jobs de `ci.yml`. **Une PR dont l'un est rouge ne se merge pas.**

### 2. Le contournement reste possible, mais il devient un GESTE

L'option *« Do not allow bypassing the above settings »* **n'est pas activée**. Le propriétaire du
dépôt peut passer outre.

> ⚠️ **Ce n'est pas un affaiblissement, c'est le même arbitrage que `--no-verify` sur le hook.** Sur
> un dépôt à un contributeur, un verrou sans issue transforme le premier cas légitime en blocage
> total. Ce qui compte est que le contournement soit **visible et délibéré** — GitHub l'enregistre —
> au lieu d'être l'absence de tout obstacle.
>
> 🔴 **Le signal à surveiller est donc l'usage de ce bypass**, pas son existence. Voir §Signal.

### 3. GitGuardian n'est PAS requis

C'est un service **tiers**. S'il est requis et qu'il tombe, ou qu'il change de nom de check, le
dépôt devient immergeable **sans recours par nous-mêmes**. Il reste affiché, il reste lu, il ne
commande pas la porte.

### 4. « Branch up to date » n'est PAS exigé

Exiger qu'une PR soit à jour avec `main` avant merge relancerait ~7 minutes de CI à chaque
avancement de `main`, sur un **dépôt privé où les minutes se paient**. Le bénéfice — attraper une
incompatibilité sémantique entre deux PR — suppose des PR concurrentes, ce que le
**mono-chantier** (`WORKFLOW.md` §2) interdit déjà.

⚠️ **À rouvrir le jour où le dépôt aura plus d'un contributeur.** Le motif tombe avec le
mono-chantier, pas avant.

### 5. Ce que ça change au `WORKFLOW.md`, et ce que ça ne change PAS

L'étape 4 — *« toi : tu lances les tests, tu relis le diff, tu vérifies que le périmètre a tenu »* —
**reste entière**. La *required check* n'automatise que le premier tiers, exactement comme le hook.

🔴 **Un merge autorisé ne dit RIEN du diff ni du périmètre.** C'est le malentendu qu'il faut
prévenir : le vert devient une condition **nécessaire**, il n'a jamais été suffisant.

## Périmètre

**Ce que ce document décide** : l'état de trois réglages dans *Settings → Branches → `main`*. Il ne
touche **aucun fichier du dépôt** — c'est sa particularité, et la raison pour laquelle il n'y aura
**pas de branche ni de PR** : le geste est une case à cocher, et il appartient à l'humain.

**Hors périmètre** : le contenu de `ci.yml` (ADR-0060 cas 2, déjà livré) · le hook `pre-push` ·
`WORKFLOW.md`, qui sera amendé par le chantier d'application de l'`adr-0060` · toute autre règle de
protection de branche (revue obligatoire, historique linéaire, signature des commits).

## Conséquences

### Positives

- **Le motif du 2026-08-16 devient impossible sans un geste conscient.** Une suite rouge ne peut
  plus atteindre `main` par simple inattention.
- **Le filet cesse de dépendre d'une machine.** Contrairement au hook, la *required check* protège
  le dépôt lui-même, y compris un merge fait depuis l'interface web ou un autre poste.
- **Les deux défauts trouvés ce jour n'auraient pas pu être mergés** — ce qui est la démonstration
  la plus courte de l'utilité du dispositif.

### Négatives / coûts assumés

- 🔴 **`fix/observation-sorties` devient immergeable en l'état — et c'est correct.** Elle porte
  **6 tests rouges** (mesuré le 2026-08-16 : `6 failed | 5 passed` sur
  `DiagnosticPage.observation.test.tsx`), **écrits volontairement avant leur correctif**.
  ⚠️ Le chiffre « 3 tests rouges » qui circulait dans `MEMORY.md` **était faux** : ils sont six.
  Son merge exigera **son correctif**, ou un bypass explicite. C'était déjà la consigne ; elle
  devient opposable.
- **Un check en panne bloque le merge.** GitHub Actions peut être indisponible ; c'est le prix, et
  le bypass du §2 est la sortie de secours.
- **Chaque PR coûte ~7 minutes de CI avant de pouvoir être mergée** sur un dépôt privé. Mesuré :
  backend ~1 min 50, frontends ~4 à 5 min, verrous 8 s.
- ⚠️ **Un nom de job qui change casse la protection en silence.** Les checks requis sont désignés
  **par leur nom** (`backend — pytest`, etc.). Renommer un job dans `ci.yml` sans mettre à jour le
  réglage laisse une branche protégée par un check qui n'arrive jamais — GitHub attend alors
  indéfiniment. **À vérifier à chaque modification de `ci.yml`.**

## Le signal qui dirait qu'on s'est trompé

1. 🔴 **Le bypass devient une habitude.** Deux usages en un mois hors du cas
   `fix/observation-sorties` : soit la CI est trop lente, soit elle est trop fragile, soit elle
   mesure la mauvaise chose. **Dans les trois cas, réparer la CI — jamais retirer le verrou.**
2. **Un chantier attend plus qu'il ne code.** Si l'attente de la CI devient le poste de temps
   dominant d'une session, découper les jobs ou réduire ce qui tourne à chaque PR.
3. **Un check requis n'arrive jamais.** Symptôme du piège des noms ci-dessus.

## Suivi

### ✅ Le geste est POSÉ — et par la voie que ce tableau écartait

| Condition | Coût | Ce qui s'est passé |
|---|---|---|
| **GitHub Pro** | ~4 $/mois | **non souscrit** — devenu inutile |
| **Rendre le dépôt public** | zéro | ✅ **CHOISI par le commanditaire**, le matin du 2026-08-17, en connaissance de l'exclusion écrite ci-dessous |
| **Une organisation GitHub Team** | ~4 $/utilisateur/mois | non retenue |

> 🔴 **L'exclusion que ce tableau portait était : « le dépôt porte les données de Massimo et la
> doctrine de `CLAUDE.md` — sa vie privée n'est pas négociable contre un réglage de CI ».**
> Elle a été levée par le commanditaire, à qui elle appartenait. Ce qui est exposé, **mesuré et non
> supposé** : le prénom de Massimo dans **818 fichiers suivis**, son niveau, ses matières, ses
> notions fragiles. **Aucun secret technique** ne l'est — ni `.env`, ni clé, ni base : le
> `.gitignore` a tenu.
>
> ⚠️ **Ce paragraphe n'est pas une réserve, c'est une trace.** L'arbitrage est rendu ; il ne se
> rouvre pas. Mais un ADR qui aurait effacé son propre motif d'exclusion laisserait croire qu'il
> n'y en avait jamais eu.

### Ce qui tient le rôle EN PLUS de la protection

| Dispositif | Ce qu'il fait | Sa faille |
|---|---|---|
| protection de branche | **refuse le merge** d'une PR dont l'un des trois checks est rouge | le propriétaire peut passer outre (§2), **et c'est voulu** |
| `hooks/pre-push` | refuse le push si une suite est rouge | **local** ; `--no-verify` le contourne ; installé seulement là où le `ln -sf` a été fait |
| `.github/workflows/ci.yml` | produit les trois checks que la protection exige | il **affiche** ; c'est la protection qui **empêche** |

⚠️ **Deux réserves qui restent entières** :

1. **Le §4 (« branche à jour » non exigée) reposait sur un motif qui a disparu** — *« un dépôt privé
   où les minutes se paient »*. Les minutes d'un dépôt public sont gratuites. La décision **tient
   quand même** (7 minutes de CI à chaque avancement de `main`, pour un bénéfice mince sur un dépôt
   à un contributeur), mais son argument principal n'est plus celui-là. À rouvrir sciemment si on
   veut l'exiger, pas par entraînement.
2. **La preuve du geste est INDIRECTE.** L'endpoint de lecture répond `503` (panne GitHub, pas
   refus) ; on dispose de la réponse du `PUT` et de `protected: true`. **La preuve comportementale
   viendra de la première PR rouge qui refusera de se merger.**

### Quand le geste redevient possible

- *Settings → Branches → Add branch ruleset* sur `main` → *Require status checks to pass* → cocher
  les **trois** jobs, laisser GitGuardian et *up to date* décochés, laisser *Do not allow bypassing*
  décoché.
- **La vérification qu'il a mordu** : ouvrir une PR volontairement rouge et constater que *Merge*
  est refusé. `fix/observation-sorties` fournit ce cas sans rien fabriquer.
- **Rouvrir le §4** (branche à jour) le jour où le dépôt a plus d'un contributeur.

### La leçon, qui vaut au-delà de cet ADR

🔴 **Un ADR qui décide d'un RÉGLAGE doit vérifier que le réglage EXISTE, avant de l'écrire.** Une
commande d'API en lecture aurait suffi, et aurait coûté dix secondes au cadrage. Le read-before-code
s'applique aux **moyens** autant qu'au code — c'est le premier ADR de ce registre à décider quelque
chose que le dépôt ne pouvait pas faire.
