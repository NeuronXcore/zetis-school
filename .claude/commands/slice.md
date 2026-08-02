---
description: Exécute une slice ZETIS dans la cage du WORKFLOW — graphify, read-before-code, stop-on-blocker, hors-périmètre. Le prompt de slice suit.
argument-hint: [chemin du prompt de slice, ex. prompts/claude-code/prompt-<chantier>-slice-a-backend.md]
disable-model-invocation: true
---

# Slice ZETIS — la cage d'exécution

Conforme à `docs/WORKFLOW.md` §2.3. **Cette commande ne remplace pas le prompt de slice, elle
l'encadre** : elle porte la discipline, qui est la même à chaque fois ; le prompt porte le
chantier, qui change. Si un prompt répète ce qui suit, c'est du bruit — il peut l'omettre.

## État réel (lis avant toute chose)

- Branche : !`git branch --show-current`
- Statut : !`git status --short`
- Derniers commits : !`git log --oneline -5`
- Carte du code à jour : !`graphify update .`
- Prompt de slice : $ARGUMENTS

## 0. Avant tout — es-tu au bon endroit ?

Si la branche est **`main`**, arrête-toi : une slice ne se code pas sur `main`. Il manque
l'ouverture du chantier (`/ouverture`).

## 1. Read-before-code — STRICT, et il produit un RAPPORT

Lis **toute** la liste de fichiers du prompt **avant d'écrire une ligne**. Ne suppose jamais une
API, une signature, un modèle : **vérifie dans le code réel**.

⚠️ **Les constats d'un prompt sont des hypothèses, pas des faits.** Ils ont été écrits au cadrage,
souvent sans le dépôt sous les yeux. Rends-moi explicitement **ce qui était FAUX** et ce que tu en
fais. Le 2026-08-01, cette étape a invalidé **quatre** hypothèses d'un prompt — dont une
**contradiction interne** (deux exigences incompatibles dans le même document) qui aurait produit
du code incohérent si personne ne l'avait vue.

Ce rapport n'est pas une formalité : c'est le livrable le plus utile de la première heure.

## 2. Stop-on-blocker

Toute divergence réelle avec la doc — signature inattendue, module absent, table non réutilisable,
exigence contradictoire — et tu **T'ARRÊTES**, tu signales, tu proposes l'ajustement minimal.

**Tu ne codes pas autour.** Un contournement silencieux coûte plus cher que l'arrêt.

## 3. Le hors-périmètre est une clôture, pas une suggestion

Tiens le périmètre posé à l'ouverture. Au bord, tu t'arrêtes et tu demandes — « tant qu'on y
est… » est le mode d'échec n°1 d'un agent.

Si tu repères un vrai problème hors périmètre, **signale-le sans le traiter**.

## 4. Non-régression — le point critique récurrent

**Un test existant modifié pour passer est une régression masquée.** Si tu dois en toucher un,
c'est que le comportement a changé : arrête-toi et dis-le-moi AVANT.

Quand un changement de comportement est voulu, sépare les deux temps : d'abord le refactor **à
comportement constant** (tests verts, aucun touché — c'est la preuve), ensuite le changement, qui
ne doit faire tomber **que** les assertions qu'il vise. Rends-moi les deux chiffres.

## 5. Tu vérifies ce que tu peux, tu dis ce que tu n'as pas vu

Lance les tests et le typecheck. Rapporte les **chiffres réels**, jamais « ça devrait passer ».

Si la slice touche une interface : elle n'est pas finie tant que personne ne l'a **regardée**
(`WORKFLOW.md §5bis` — deux défauts du 2026-08-01 n'étaient visibles qu'à l'écran). Dis
explicitement ce que tu **n'as pas pu** voir.

## 6. Fin de session

Je lance `/cloture` — ne l'anticipe pas, et **ne committe pas** de toi-même.

---

**Le prompt de slice suit. Applique-le dans cette cage.**
