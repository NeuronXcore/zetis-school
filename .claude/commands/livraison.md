---
description: Livraison autonome de fin de chantier — commit, push, PR, attente de la CI, merge, 4bis. S'arrête sur un rouge, sur un vert-après-rouge, et sur tout CHOIX de surface.
argument-hint: [note libre, ex. "ne merge pas, je veux relire le diff"]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git:*), Bash(gh:*), Bash(graphify:*), Bash(pnpm:*), Bash(npx vitest:*), Bash(*pytest:*), mcp__Claude_Browser__*
disable-model-invocation: true
---

# Livraison ZETIS — la chaîne git de fin de chantier

Tu livres le chantier courant **d'un trait** : commit → push → PR → attente de la CI → merge →
étape 4bis. C'est la commande qui **committe et merge de sa propre initiative** — les autres ne
le font jamais.

> 🔴 **Pourquoi elle existe, et ce qu'elle remplace.** Le rituel git de fin de chantier est
> **toujours le même** et il coûtait sept allers-retours. `/cloture` prépare la documentation et
> s'arrête net (*« ne committe jamais d'elle-même »*) ; cette commande prend la suite. Les deux
> règles de `/cloture` qui l'interdisaient — ne pas committer, ne pas lancer les tests — sont
> **levées ICI et nulle part ailleurs**, parce que ce fichier les remplace par des garde-fous
> écrits.

## État réel (lis avant toute chose)

- Branche : !`git branch --show-current`
- Statut : !`git status --short`
- Ampleur : !`git diff --stat HEAD`
- Base du chantier : !`git merge-base HEAD main`
- Tête de `main` : !`git rev-parse --short main`
- Note de l'utilisateur : $ARGUMENTS

## §0 — Les quatre refus de départ. Tu t'arrêtes AVANT de committer.

1. **Sur `main`** → arrêt. Une livraison part d'une branche de chantier.
2. **`main` en retard sur `origin`** → arrêt, dis-le : le `git pull` appartient à l'humain.
3. **`DECISIONS.md` modifié dans l'arbre** → arrêt. Il se committe sur `main`, avec l'ADR, jamais
   sur une branche (`/ouverture` §1). 🔴 Il est **GÉNÉRÉ** : s'il diverge, on relance
   `scripts/gen_decisions_index.py`, on ne recopie pas une ligne.
4. **`/cloture` n'a pas été passée** — `MEMORY.md` ne porte pas ce chantier, ou `CHANGELOG.md`
   n'a pas son entrée alors qu'un **comportement** change → arrêt. Cette commande livre, elle
   n'écrit pas la mémoire du chantier à la place de `/cloture`.

## §1 — Les tests, et la seule définition valable de « vert »

Lance-les : backend, front, typecheck. Rapporte les **chiffres réels**.

🔴 **« Vert en local » ne vaut rien, et c'est mesuré.** Le 2026-08-22, 914 tests verts sur la
machine et la CI **rouge** dix minutes plus tard. Le seul vert qui autorise un merge est celui de
la **CI**. Les tests locaux ne servent qu'à ne pas ouvrir une PR manifestement cassée.

Un rouge en local ⇒ **arrêt**. Tu ne « répares » pas un test pour qu'il passe : un test existant
modifié pour devenir vert est une régression masquée (`WORKFLOW.md §2.3`).

## §2 — Commit, push, PR

**Le commit** : sujet en *conventional commit*, corps en **prose** — le *pourquoi*, pas la liste
des fichiers, que `git show --stat` donne déjà. Termine par la ligne `Co-Authored-By`.

**La PR** : le corps porte ce que le diff ne dit pas — les **refus** et leur raison, ce que le
read-before-code a corrigé, le **hors-périmètre nommé**, les chiffres de test. ⚠️ Le corps de PR
est en markdown ; le corps de **squash**, lui, se réécrit en prose sans tableaux ni liens — c'est
la forme des squash de ce dépôt.

## §3 — La CI, et la règle du rouge

Attends-la (`gh pr checks <n> --watch`), **en arrière-plan**, sans sonder à la main.

🔴 **Ne te fie JAMAIS au code de sortie de `--watch`.** Le 2026-08-22 il est sorti en **0** avec
un job **échoué**. Relis toujours l'état par `gh pr checks <n>` avant de conclure.

**Si tout est vert du premier coup** → §4.

**Si un job est rouge** — dans cet ordre, et tu ne sautes pas d'étape :

1. **Récupère le log** (`gh run view <run> --log-failed --job <job>`) et **diagnostique**.
2. **Établis si l'échec appartient au chantier**, par des preuves, pas au flair : le commit
   touche-t-il ce fichier ? le test a-t-il bougé récemment ? les derniers runs de `main`
   étaient-ils verts ? le test passe-t-il en local, plusieurs fois d'affilée ?
3. **S'il appartient au chantier** → **arrêt**, tu rends le diagnostic. Tu ne corriges pas dans la
   foulée : le correctif d'un rouge est du code, et du code se relit.
4. **S'il lui est étranger** → **un** re-run, un seul.
5. 🔴 **Si tu ne peux pas TRANCHER** — les preuves ne concluent pas — → **arrêt**, et traite-le
   comme un rouge du chantier. *« Je ne sais pas à qui il appartient »* n'est pas *« il est
   étranger »* : c'est la même confusion que le `0` qui voudrait dire « non mesurable »
   (`adr-0069`). **Le re-run se mérite par une preuve, jamais par une intuition.**

🔴 **Le re-run a DEUX issues, et AUCUNE des deux ne merge.** C'est le trou que la règle avait à sa
première écriture : elle ne prévoyait que le vert.

| Issue du re-run | Ce que tu fais |
|---|---|
| **Vert** | ⛔ **Arrêt quand même.** Tu ne merges pas : le re-run n'a rien réparé, il a rendu un défaut invisible. Tu rends le diagnostic et tu attends la décision. Le test instable vaut une entrée dans `TROUBLESHOOTING.md`. |
| **Rouge à nouveau** | ⛔ **Arrêt, et traite-le comme un rouge du chantier** — diagnostic rendu, aucune correction dans la foulée. Deux rouges d'affilée sur le même job **ne sont plus une loterie** : c'est un défaut **reproductible**, et il peut très bien avoir été *révélé* par ton diff sans que le fichier fautif soit le tien. ⚠️ **Aucun second re-run** : trois exécutions pour obtenir un verdict, c'est du tirage au sort, exactement ce que cette règle refuse. |

> **Ce que ça a coûté d'apprendre.** Le 2026-08-22, la PR #180 est passée rouge puis verte **sur
> le même commit**. Le re-run n'a rien réparé : il a rendu invisible une **loterie** dans
> `CouverturePage.test.tsx` (un `getByRole` synchrone après un `waitFor` qui surveillait autre
> chose). C'est le **rouge** qui a produit le diagnostic. Un vert obtenu au second essai n'est pas
> un vert : c'est un aveu qu'un test dépend de la machine, et il vaut une entrée dans
> `TROUBLESHOOTING.md`.
>
> ⚠️ **`allow_auto_merge` est actif sur le dépôt depuis le 2026-08-22.** Ne l'utilise **jamais**
> (`gh pr merge --auto`) : il merge au vert du re-run sans que personne ne regarde, et il annule
> précisément le garde-fou ci-dessus.

## §4 — Le merge

`gh pr merge <n> --squash --delete-branch`, corps de squash en prose.

Puis **vérifie, ne suppose pas** : l'état `MERGED`, le hash du squash (`git cat-file -t`), la
branche absente de `git ls-remote --heads origin` **et** de `git branch`, `main` = `origin/main`.
⚠️ `delete_branch_on_merge` ne supprime que la branche **distante** ; la référence locale périmée
s'élague par `git remote prune origin`.

## §5 — L'étape 4bis, dans la même foulée

🔴 **Ce dépôt l'a oubliée deux fois.** `MEMORY.md` décrit alors un chantier « à merger » qui est
mergé depuis longtemps, et une reprise sans contexte y lit du travail à refaire.

Reviens sur `main`, mets à jour : le **squash**, le **n° de PR**, « branche supprimée », « rien à
pousser », et **solde les résidus**. Ajoute à `TROUBLESHOOTING.md` tout écart rencontré pendant la
livraison — une loterie de CI en est un. Puis commit + push de ce lot documentaire.

⚠️ **N'écris jamais la tête de branche** dans `MEMORY.md` : une ligne qui nomme le commit qui la
contient ne peut pas être vraie (`WORKFLOW.md §5`). S'écrivent le nom de la branche, la **base**,
et — une fois mergé — le **squash** et le n° de PR, qui sont définitifs.

## §6 — Ce qui t'arrête TOUJOURS, quelle que soit la couleur de la CI

🔴 **Un CHOIX de surface n'est pas un test, et il ne se merge pas sans son auteur.** Un libellé,
une formulation, l'ordre de postes à l'écran, le ton d'un message : ce sont des décisions du
commanditaire (`adr-0060` cas 4, tranché **devant l'écran**). Aucun test vert ne les trouve — le
2026-08-22, un titre de bloc a demandé **trois propositions** avant d'être accepté.

**En revanche, la VÉRIFICATION visuelle t'appartient** : tu ouvres le préview, tu regardes, tu
lis le DOM, tu prends une **capture**, et tu la livres avec le rapport. Elle ne bloque pas la
chaîne. La distinction est nette :

| | Qui tranche | Effet sur la livraison |
|---|---|---|
| « Est-ce que ça s'affiche, et juste ? » | **toi**, capture à l'appui | continue |
| « Est-ce le bon mot, le bon ordre ? » | **le commanditaire** | **arrêt** |

⚠️ **Dans le doute, arrête-toi et demande.** Une livraison de trop se répare par un `revert` ; un
libellé faux entré dans `main` se lit comme une décision prise.

## Ce que tu ne fais jamais ici

- **Aucun `--force`, aucun `--admin`** : on ne contourne pas une *required check*.
- **Aucune correction de code** pendant la livraison — hors périmètre par construction.
- **Aucun `-v` sur un `docker compose down`**, si tu as monté un environnement pour capturer un
  contrat ou regarder un écran. Et **arrête ce que tu as démarré** : serveurs d'abord, infra
  ensuite.

## Rends enfin, en une fois

Les chiffres de test (locaux **et** CI), le n° et l'URL de la PR, le **squash**, l'état des
branches, la capture d'écran s'il y avait une surface, et **ce que tu n'as pas traité** — les
résidus ne vivent ni dans Git ni dans les ADR.
