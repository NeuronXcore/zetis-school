---
description: Reprise de session ZETIS (contexte perdu) — réoriente, relit la doc, reprend sans recoder l'existant.
argument-hint: [zone à reprendre, ex. "génération de fiches" ou "service mindmap"]
allowed-tools: Read, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(graphify:*)
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
2. Relis l'ADR et le prompt de référence du chantier en cours — les DÉCISIONS ACTIVES ne se
   rediscutent pas.
3. `graphify explain "$ARGUMENTS"` (ou la zone du PROCHAIN PAS) pour comprendre vite, sans
   relire tous les fichiers.
4. Vérifie dans le code ce qui existe DÉJÀ. **Ce qui est fait ne se recode pas. Ce qui est
   décidé ne se re-décide pas.**
5. Confirme-moi en 3 lignes : où on en est, quelle est la prochaine action, quelles décisions
   sont verrouillées.

Puis reprends au **PROCHAIN PAS** du `MEMORY.md`. Même discipline : read-before-code,
stop-on-blocker.
