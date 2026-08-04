---
description: Reprise de session ZETIS (contexte perdu) — mesure la dérive avec main, réoriente, relit la doc, reprend sans recoder l'existant.
argument-hint: [zone à reprendre, ex. "génération de fiches" ou "service mindmap"]
allowed-tools: Read, Grep, Glob, Edit, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git fetch:*), Bash(git rev-list:*), Bash(git rev-parse:*), Bash(git merge-base:*), Bash(gh pr view:*), Bash(graphify:*)
disable-model-invocation: true
---

# Reprise de session ZETIS

Le contexte de la session précédente est perdu. **NE REPARS PAS de zéro.**
Conforme à `docs/WORKFLOW.md` §5–6.

## État réel du dépôt (lis avant toute chose)

- Distant rafraîchi : !`git fetch -q origin && echo "origin à jour"`
- Branche et suivi : !`git status -sb`
- **Avance** sur `main` : !`git rev-list --count main..HEAD`
- **Retard** sur `origin/main` : !`git rev-list --count HEAD..origin/main`
- Derniers commits : !`git log --oneline -8`

> ⚠️ **`git fetch` d'abord, et `-sb` plutôt que `--short`.** Sans le fetch, on compare à une image
> du distant vieille de plusieurs jours ; sans `-sb`, la ligne de suivi (`## branche...origin
> [ahead N]`) **n'apparaît pas** — et l'étape 1 demande justement de vérifier ce qui est poussé.
> La commande réclamait un contrôle avec un outil qui l'empêchait (corrigé le 2026-08-04).

## Orientation dans le code (mémoire du code, pas de la conversation)

- Carte à jour : !`graphify update .`
- Zone à reprendre demandée : $ARGUMENTS

## Ta tâche, dans cet ordre — AVANT d'écrire une ligne

0. **LA DÉRIVE D'ABORD — avant même de lire `MEMORY.md`.**

   - **Retard = 0** → rien à faire, enchaîne.
   - **Retard > 0** → **ARRÊTE-TOI et propose le rattrapage** :

     ```bash
     git merge origin/main
     ```

     Puis attends. **Ne le lance pas toi-même** : c'est un commit, donc mon geste — et un conflit
     au milieu d'une reprise est le pire moment pour improviser.

   ⚠️ **On tire `main` VERS la branche, on ne fait pas d'aller-retour.** Et surtout **pas de
   rebase** : ce dépôt merge en **squash**, donc l'historique de la branche est jeté au merge —
   rebaser paierait le risque (réécriture de commits déjà poussés, force-push) pour un bénéfice
   nul. Le merge, lui, ne réécrit rien.

   ⚠️ **Rattraper AVANT de coder, jamais après.** Coder sur une base périmée, c'est écrire contre
   une API qui a changé — et le découvrir au merge, quand le travail est fait.

1. **Le chantier est-il encore OUVERT ?** Lis `MEMORY.md`, section « **État à la reprise** »
   (c'est son titre exact — celle qui est en tête ; les « Historique — … » qui suivent sont des
   chantiers **CLOS**, ne les reprends pas) : FAIT / EN COURS / À FAIRE / DÉCISIONS ACTIVES /
   PROCHAIN PAS.

   **Puis CONFRONTE-le à l'état réel affiché ci-dessus** — branche, suivi, `git log`.
   `MEMORY.md` est écrit AVANT le merge : s'il annonce une branche que tu n'es pas dessus, des
   commits « non poussés » déjà dans `main`, ou un « prochain pas » que le `git log` montre comme
   fait, **il a survécu à son propre chantier**. Remets-le au réel AVANT de reprendre, et dis-le-moi.
   (`docs/WORKFLOW.md §5`, étape 4bis — c'est arrivé six fois.)

   ⚠️ **Si le chantier est DÉJÀ MERGÉ, il n'y a RIEN à reprendre.** Ne cherche pas du travail, n'en
   invente pas. Fais exactement ceci, puis arrête-toi :
   - remets `MEMORY.md` au réel si le 4bis manque (squash, branche supprimée, rien à pousser) ;
   - rends-moi la liste des **dettes ouvertes** telle qu'elle est écrite, **sans en choisir une** ;
   - rappelle-moi que le dépôt impose un **cadrage** (ADR) avant la moindre ligne de code.

2. **L'arbre est-il VERT ?** Le `MEMORY.md` de la clôture porte les chiffres réels des dernières
   suites lancées. Lis-les. **S'ils manquent ou datent d'avant les derniers commits, dis-le** —
   reprendre sur du rouge sans le savoir, c'est bâtir sur du sable. Tu ne lances pas les tests de
   ta propre initiative ; tu me signales qu'il faut le faire.

3. Relis l'**ADR** et le prompt de référence du chantier en cours — les DÉCISIONS ACTIVES ne se
   rediscutent pas.

4. `graphify explain "<zone>"` — la zone demandée ci-dessus si elle est renseignée, **sinon** celle
   du PROCHAIN PAS de `MEMORY.md`. (Ne lance pas la commande avec une chaîne vide.)

   ⚠️ **`explain` rend UN nœud, même quand plusieurs portent le nom** — testé le 2026-08-04 sur
   `_active_year` : 7 dans le graphe, 1 rendu, **sans avertissement**. Il oriente ; il ne prouve
   pas l'unicité. Si la question porte sur une **duplication**, utilise `grep -rn "def <nom>"`, et
   pour la liste des appelants d'une fonction, `graphify affected "<fn>"`.

5. Vérifie dans le code ce qui existe DÉJÀ — `Grep`/`Glob` **après** l'orientation graphify.
   **Ce qui est fait ne se recode pas. Ce qui est décidé ne se re-décide pas.**

6. Confirme-moi en 3 lignes : où on en est, quelle est la prochaine action, quelles décisions sont
   verrouillées. **Ajoute la dérive** (avance / retard) si elle n'est pas nulle.

Puis reprends au **PROCHAIN PAS** du `MEMORY.md`. Même discipline : read-before-code,
stop-on-blocker.

> **Ne démarre PAS les serveurs par réflexe.** La plupart des reprises n'en ont pas besoin. Si —
> et seulement si — le prochain pas demande de VOIR l'app, lis `docs/WORKFLOW.md §5bis` : les
> serveurs vont par **paires appairées** (`.claude/launch.json`), ceux que tu lances **meurent
> avec la session**, et le panneau d'aperçu a son **propre** stockage — pour une page derrière
> `RequireAuth`, il faut passer par `claude-in-chrome`.
