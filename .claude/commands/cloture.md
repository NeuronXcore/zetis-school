---
description: Clôture de session ZETIS — met à jour la doc de reprise et rend la checklist 9 points. Ne committe pas.
argument-hint: [note libre sur l'état, ex. "service à moitié fait, instable"]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(graphify:*)
disable-model-invocation: true
---

# Clôture de session ZETIS

Tu clôtures la session courante, conformément à `docs/WORKFLOW.md` §5–6.
Tu ne committes PAS et tu ne push PAS : je le fais moi-même après avoir vérifié et lancé les tests.

## État réel (ne te fie pas à ta mémoire — lis ceci)

- Branche : !`git branch --show-current`
- Statut : !`git status --short`
- Ampleur du diff : !`git diff --stat HEAD`
- Derniers commits : !`git log --oneline -6`
- Note de l'utilisateur : $ARGUMENTS

## Ta tâche, dans cet ordre

0. **Frontière propre d'abord.** Si un fichier est à moitié écrit / instable, ne le « finis »
   pas à la va-vite. Laisse-le en l'état et signale-le comme instable dans le point 2.
1. **`MEMORY.md` § "Reprise"** (obligatoire) — écris pour un lecteur SANS contexte (la prochaine
   session) :
   - FAIT / EN COURS / À FAIRE
   - DÉCISIONS ACTIVES (celles à ne pas rouvrir)
   - PIÈGES rencontrés (renvoie vers TROUBLESHOOTING.md)
   - PROCHAIN PAS (la première action de reprise, précise)
2. **`TROUBLESHOOTING.md`** — ajoute tout écart réel rencontré (signature d'API inattendue,
   comportement surprenant d'un module, etc.). Rien d'inventé.
3. **`ARCHITECTURE.md`** — UNIQUEMENT si une structure a été ajoutée (table, module, endpoint).
4. **Ne touche PAS** : `CHANGELOG.md` (sauf si cette session termine une slice livrable),
   `ROADMAP.md`, `CLAUDE.md`.
5. **`graphify update .`** — la carte du code doit suivre (`WORKFLOW.md §5`, étape 2). Sans ça,
   la prochaine session s'oriente sur un graphe périmé.

## Rends-moi enfin la checklist 9 points

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes lancées ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Message de commit suggéré — que **je** lancerai moi-même.

⚠️ **Point 6 : tu ne lances PAS les tests ici** (c'est mon rôle, `WORKFLOW.md §2.4` — je ne fais
jamais confiance à un « c'est vert » rapporté). Rapporte donc le résultat **réel des tests lancés
pendant la session**, avec les chiffres. Si aucun n'a été lancé depuis les dernières
modifications, écris-le : **« non relancés depuis <telle modification> »**. Ne dis jamais « ça
devrait passer ».

Puis ARRÊTE-TOI. Ne committe pas, ne push pas.

> **Après le merge** (donc hors de cette commande) : reviens remettre `MEMORY.md` au réel —
> squash, n° de PR, branche supprimée, « rien à pousser », et les **résidus** de clôture. C'est
> l'étape **4bis** de `WORKFLOW.md §5`. Ce fichier a déjà survécu deux fois à son propre
> chantier ; ce que tu écris ici sera **faux** dès que la PR sera mergée.
