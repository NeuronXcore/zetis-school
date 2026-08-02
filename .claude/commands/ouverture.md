---
description: Ouvre un nouveau chantier ZETIS — vérifie que le cadrage EXISTE vraiment, crée la branche, pose le périmètre. Ne committe pas.
argument-hint: [nom-du-chantier] [ADR-00XX], ex. "generation-zetis ADR-0031"
allowed-tools: Read, Grep, Glob, Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(git fetch:*), Bash(git switch:*), Bash(git rev-list:*), Bash(ls:*)
disable-model-invocation: true
---

# Ouverture d'un chantier ZETIS

Conforme à `docs/WORKFLOW.md` §2 (la boucle) et §2bis (le geste git).
Tu ne committes PAS et tu ne push PAS : le commit de documentation est mon geste.

## État réel du dépôt (lis avant toute chose)

- Branche : !`git branch --show-current`
- Statut : !`git status --short`
- Écart avec le distant : !`git fetch origin --prune 2>/dev/null; git rev-list --left-right --count origin/main...main`
- Derniers commits : !`git log --oneline -5`
- ADR présents : !`ls docs/decisions/ | tail -12`
- Chantier demandé : $ARGUMENTS

## Ta tâche, dans cet ordre — et tu t'ARRÊTES au premier manque

### 1. Le dépôt est-il en état de partir ?

Trois conditions, toutes obligatoires :

- on est sur **`main`** (une branche part TOUJOURS de `main`, jamais d'une autre — chaque
  chantier part de la dernière vérité stable, pas du travail non fini d'un voisin) ;
- l'arbre est **propre** ;
- `main` n'est **pas en retard** sur `origin`. S'il l'est, dis-le-moi et arrête-toi : c'est à moi
  de lancer `git pull`.

### 2. ⛔ LE CONTRÔLE QUI JUSTIFIE CETTE COMMANDE — le cadrage existe-t-il VRAIMENT ?

Pour chaque ADR nommé en argument, vérifie que **le fichier existe** dans `docs/decisions/` —
pas seulement que `DECISIONS.md` le mentionne. Puis cherche les documents du chantier :
spec de page (`docs/frontend-*/`), maquette (`mockup/`), prompt(s) (`prompts/claude-code/`).

> **Pourquoi ce contrôle existe** : le 2026-08-01, le chantier page-matière a été ouvert avec
> ses seules **entrées d'index** dans `DECISIONS.md` — les deux fichiers ADR **et la maquette**
> manquaient au dépôt. Il a fallu s'arrêter, coder d'après la spec, et écrire les ADR **après**
> la livraison. Une ligne d'index n'est pas une décision : c'est un renvoi vers une décision.

Rends-moi un tableau **présent / absent** de tout ce que tu attendais, et **ARRÊTE-TOI si un ADR
manque**. Pour une spec, une maquette ou un prompt manquant : signale-le et demande-moi si on
continue sans — c'est mon arbitrage, pas le tien.

### 3. La branche

Si et seulement si le §1 et le §2 passent : `git switch -c feat/<chantier>`.

Convention : `feat/<chantier>`. La branche **naît avec ses documents** — si la spec, la maquette
et les prompts sont déjà dans l'arbre de travail, ils la suivent, et leur commit est le
**premier** de la branche. Rends-moi la commande, je la lance :

```
git add -A && git commit -m "docs(<chantier>): spec + maquette + prompts (<ADR>)" && git push -u origin feat/<chantier>
```

⚠️ **`DECISIONS.md` ne va JAMAIS sur la branche.** Les décisions vont sur `main` — deux branches
qui l'éditent = conflit garanti. Si tu le vois modifié dans l'arbre, dis-le-moi : il se committe
sur `main`, avec l'ADR.

### 4. Le périmètre — avant que j'écrive une ligne

Propose-moi, à partir de l'ADR et de la spec que tu viens de lire :

- **le périmètre** : ce que cette session touche, en une phrase ;
- **le HORS-PÉRIMÈTRE, explicite** : ce qu'elle ne touche pas, même « tant qu'on y est ». C'est
  une clôture posée d'avance, pas une correction après coup — le mode d'échec n°1 est la dérive ;
- **les décisions déjà tranchées** que tu as relevées dans l'ADR, et que tu ne rouvriras pas ;
- **les préconditions déjà vraies** (branche, doc committée, dépendances mergées) — pour ne pas
  les recréer.

Attends ma validation sur ces quatre points. **Puis seulement** je te colle le prompt de slice.

## Ce que tu ne fais pas ici

- Aucun commit, aucun push.
- Aucune ligne de code : le cadrage précède le clavier.
- Aucun `graphify update` : il vient au début de la session de slice, pas ici.
