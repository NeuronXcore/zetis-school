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

- **Le geste**, à faire une fois : *Settings → Branches → Add branch ruleset* (ou *Branch protection
  rule*) sur `main` → *Require status checks to pass* → cocher les **trois** jobs, laisser
  GitGuardian et *up to date* décochés, laisser *Do not allow bypassing* décoché.
- **La vérification qu'il a mordu** : ouvrir une PR volontairement rouge et constater que *Merge*
  est refusé. `fix/observation-sorties` fournit ce cas sans rien fabriquer.
- **Rouvrir le §4** (branche à jour) le jour où le dépôt a plus d'un contributeur.
