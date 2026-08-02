---
description: Reprise de session ZETIS (contexte perdu) — réoriente, relit la doc, reprend sans recoder l'existant.
argument-hint: [zone à reprendre, ex. "génération de fiches" ou "service mindmap"]
allowed-tools: Read, Grep, Glob, Edit, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(graphify:*)
disable-model-invocation: true
---

# Reprise de session ZETIS

Le contexte de la session précédente est perdu. **NE REPARS PAS de zéro.**
Conforme à `docs/WORKFLOW.md` §5–6.

## État réel du dépôt (lis avant toute chose)

- Branche : !`git branch --show-current`
- Derniers commits : !`git log --oneline -8`
- Diff en cours : !`git status --short`

## Orientation dans le code (mémoire du code, pas de la conversation)

- Carte à jour : !`graphify update .`
- Zone à reprendre demandée : $ARGUMENTS

## Ta tâche, dans cet ordre — AVANT d'écrire une ligne

1. Lis `MEMORY.md` § "Reprise" : FAIT / EN COURS / À FAIRE / DÉCISIONS ACTIVES / PROCHAIN PAS.
   **Puis CONFRONTE-le à l'état réel affiché ci-dessus** — branche, `git log`, `git status`.
   `MEMORY.md` est écrit AVANT le merge : s'il annonce une branche que tu n'es pas dessus, des
   commits « non poussés » déjà dans `main`, ou un « prochain pas » que le `git log` montre
   comme fait, **il a survécu à son propre chantier**. Remets-le au réel AVANT de reprendre, et
   dis-le-moi. (`docs/WORKFLOW.md §5`, étape 4bis — c'est arrivé deux fois.)
2. Relis l'ADR et le prompt de référence du chantier en cours — les DÉCISIONS ACTIVES ne se
   rediscutent pas.
3. `graphify explain "<zone>"` — la zone demandée ci-dessus si elle est renseignée, **sinon**
   celle du PROCHAIN PAS de `MEMORY.md`. (Ne lance pas la commande avec une chaîne vide.)
4. Vérifie dans le code ce qui existe DÉJÀ — `Grep`/`Glob` après l'orientation graphify.
   **Ce qui est fait ne se recode pas. Ce qui est décidé ne se re-décide pas.**
5. Confirme-moi en 3 lignes : où on en est, quelle est la prochaine action, quelles décisions
   sont verrouillées.

Puis reprends au **PROCHAIN PAS** du `MEMORY.md`. Même discipline : read-before-code,
stop-on-blocker.

> **Ne démarre PAS les serveurs par réflexe.** La plupart des reprises n'en ont pas besoin. Si —
> et seulement si — le prochain pas demande de VOIR l'app, lis `docs/WORKFLOW.md §5bis` : les
> serveurs vont par **paires appairées** (`.claude/launch.json`), ceux que tu lances **meurent
> avec la session**, et le panneau d'aperçu a son **propre** stockage — pour une page derrière
> `RequireAuth`, il faut passer par `claude-in-chrome`.
