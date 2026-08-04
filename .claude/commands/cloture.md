---
description: Clôture de session ZETIS — met à jour la doc de reprise, VÉRIFIE chaque fait écrit, et rend la checklist 9 points. Ne committe jamais d'elle-même.
argument-hint: [note libre sur l'état, ex. "service à moitié fait, instable"]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git merge-base:*), Bash(git cat-file:*), Bash(gh pr view:*), Bash(graphify:*)
disable-model-invocation: true
---

# Clôture de session ZETIS

Tu clôtures la session courante, conformément à `docs/WORKFLOW.md` §5–6.

**Tu PRÉPARES la clôture. Tu ne committes ni ne push jamais de ta propre initiative** — je vérifie
d'abord (diff, tests). Si je te demande ensuite « commit la clôture », c'est un **geste à part**,
pas une étape de cette commande.

## État réel (ne te fie pas à ta mémoire — lis ceci)

- Branche : !`git branch --show-current`
- Statut : !`git status --short`
- Ampleur du diff : !`git diff --stat HEAD`
- Derniers commits : !`git log --oneline -6`
- Base du chantier : !`git merge-base HEAD main`
- Tête de `main` : !`git rev-parse --short main`
- Note de l'utilisateur : $ARGUMENTS

## D'abord : le chantier est-il FINI ?

⚠️ **Cette question commande tout le reste, et la commande l'ignorait.** Tranche-la explicitement,
et dis-moi laquelle des deux tu appliques.

| | Chantier **FINI** | Chantier **EN COURS** |
|---|---|---|
| `MEMORY.md` | « COMPLET », prochain pas = push + PR | « EN COURS », prochain pas = la première action à reprendre |
| Git (par MOI, après vérification) | commit → push → **PR → merge** → 4bis | commit → push. **NI PR, NI MERGE.** |
| La branche | sera supprimée au merge | **reste vivante** — c'est elle qui porte l'état intermédiaire |

> **Ne jamais merger un chantier inachevé.** Ça mettrait du travail à moitié fait sur `main` et
> détruirait la seule chose qui protège la reprise : une branche qui porte l'état réel.

## Ta tâche, dans cet ordre

0. **Frontière propre d'abord.** Si un fichier est à moitié écrit / instable, ne le « finis » pas à
   la va-vite. **Laisse-le en l'état, et nomme-le dans le `MEMORY.md` du point 1**, section
   « EN COURS » — c'est un état, pas un écart. (`TROUBLESHOOTING.md` est le journal des écarts
   RENCONTRÉS ; un fichier instable n'en est pas un.)

1. **`MEMORY.md`, section « État à la reprise »** (obligatoire) — écris pour un lecteur SANS
   contexte (la prochaine session) :
   - FAIT / **EN COURS** (y compris ce qui est instable, cf. point 0) / À FAIRE
   - DÉCISIONS ACTIVES (celles à ne pas rouvrir)
   - PIÈGES rencontrés (renvoie vers `TROUBLESHOOTING.md`)
   - PROCHAIN PAS (la première action de reprise, précise)

   ⚠️ **N'écris NI la tête de branche NI le nombre de commits** — `WORKFLOW.md §5`, « Ne jamais
   écrire dans `MEMORY.md` la tête de branche qu'il vit ». Une ligne qui nomme le commit qui la
   contient ne peut pas être vraie ; renvoie à `git log --oneline main..HEAD`. C'est arrivé six
   fois. S'écrivent, en revanche : le nom de la branche, la **base** (elle ne bouge pas), et — une
   fois mergé — le **squash** et le n° de PR, qui sont définitifs.

1bis. **ÉLAGUE `MEMORY.md` — retire la section du chantier PRÉCÉDENT.**

   Ce fichier ne garde que le chantier **actif**. Sans élagage il double à chaque chantier : il a
   atteint **2 227 lignes d'historique pour 122 lignes d'actif** (94 %) avant qu'on s'en aperçoive,
   et c'est le contexte d'une reprise qui le paie. **Pas de fichier d'archive** : ce serait une
   quatrième copie d'un contenu déjà écrit trois fois.

   ⚠️ **Les quatre contrôles avant de supprimer** (`WORKFLOW.md §5`) — les trois premiers se
   vérifient d'un coup d'œil, **le quatrième est celui qu'on oublie** :

   1. l'**ADR** du chantier existe · 2. `TROUBLESHOOTING.md` a sa section · 3. `CHANGELOG.md` a son
   entrée · 4. 🔴 **plus rien d'OUVERT** dans la section — sinon **remonte-le** dans « DETTES
   OUVERTES » de la section active.

   > Cherche au moins : `jamais vérifié`, `non vérifié`, `reste à`, `toujours dû`, `en suspens`,
   > `dette`, `NEXT =`. L'élagage du 2026-08-04 a ainsi exhumé **cinq dettes vivantes** enterrées,
   > dont une vérification jamais faite et un `.env.example` qui annonçait une variable **ignorée
   > par le backend**. L'historique s'était mis à servir de **cimetière à dettes**.

2. **`TROUBLESHOOTING.md`** — ajoute tout écart réel rencontré (signature d'API inattendue,
   comportement surprenant d'un module, test qui passait pour la mauvaise raison…). **Rien
   d'inventé, rien de générique** : une entrée = un piège qui ferait perdre du temps à la prochaine
   session, avec sa cause et sa parade.

3. **Les documents de STRUCTURE, chacun sous SA condition.** ⚠️ Cette liste a longtemps tenu en un
   seul `ARCHITECTURE.md`, et c'était faux : le dépôt porte 24 documents de projet, et trois
   d'entre eux se périment en silence quand on ne les nomme pas. **Passe la liste, ne devine pas.**

   | Document | À mettre à jour SI |
   |---|---|
   | `ARCHITECTURE.md` | un **service** ou un **flux** change — pas pour un module (il est trop grossier) |
   | `PROJECT_STRUCTURE.md` | un **module** est ajouté / déplacé / supprimé (il porte un inventaire **daté**) |
   | `DATA_MODEL.md` | une **table**, une **colonne**, une **contrainte**, ou une **règle de lecture** d'une relation |
   | `API_SPEC.md` | un **endpoint** naît, change de contrat, ou disparaît |
   | `.env.example` | une **variable d'environnement** est ajoutée — corrige alors **tout son groupe** |
   | `docs/frontend-*/page-*.md` | l'écran concerné change de comportement |

4. **Ne touche PAS** : `ROADMAP.md`, `CLAUDE.md`.
   `CHANGELOG.md` **seulement** si cette session termine une slice livrable — mais alors, fais-le.
   `DECISIONS.md` est normalement déjà à jour (il s'écrit au **cadrage**, pas à la clôture) :
   vérifie-le, ne le réécris pas.

5. **`graphify update .`** — la carte du code doit suivre (`WORKFLOW.md §5`, étape 2). Sans ça, la
   prochaine session s'oriente sur un graphe périmé.

6. ⚠️ **VÉRIFIE CHAQUE FAIT que tu viens d'écrire — un par un, par une commande.**

   **C'est l'étape que la commande n'avait pas, et son absence a produit deux hash faux le
   2026-08-03**, tous deux attrapés par hasard. Un `MEMORY.md` qui se trompe d'un caractère envoie
   la session suivante sur une branche ou un commit qui n'existe pas.

   | Fait écrit | Comment on le vérifie |
   |---|---|
   | un hash (base, squash) | `git cat-file -t <hash>` — et qu'il est bien CELUI qu'on croit |
   | « branche supprimée » | `git branch` **et** `git branch -r` |
   | « rien à pousser » | `git rev-parse main` = `git rev-parse origin/main` |
   | un n° de PR / son état | `gh pr view <n> --json state` |
   | des chiffres de tests | ils viennent de la session, **pas d'une estimation** (cf. point 6 de la checklist) |

   **Ne recopie jamais un hash de mémoire.** Si un contrôle contredit ce que tu as écrit, corrige
   le fichier et **dis-le-moi** — c'est une information, pas une honte.

## Rends-moi enfin la checklist 9 points

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes lancées ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Message de commit suggéré — que **je** lancerai moi-même.

⚠️ **Point 6 : tu ne lances PAS les tests ici** (c'est mon rôle, `WORKFLOW.md §2.4` — je ne fais
jamais confiance à un « c'est vert » rapporté). Rapporte donc le résultat **réel des tests lancés
pendant la session**, avec les chiffres. Si aucun n'a été lancé depuis les dernières
modifications, écris-le : **« non relancés depuis <telle modification> »**. Ne dis jamais « ça
devrait passer ».

⚠️ **Point 7 : ce que tu n'as pas fait vaut ce que tu as fait.** Vérifications non jouées, données
de test restées en base, réglages laissés hors de leur défaut, décisions différées. **Ces
résidus-là ne vivent nulle part ailleurs** — ni Git ni les ADR ne les portent.

Puis ARRÊTE-TOI. Ne committe pas, ne push pas.

> **Après le merge** (donc hors de cette commande, et **seulement si le chantier était fini**) :
> reviens remettre `MEMORY.md` au réel — squash, n° de PR, branche supprimée, « rien à pousser », et
> les **résidus** de clôture. C'est l'étape **4bis** de `WORKFLOW.md §5`. Ce fichier a déjà survécu
> deux fois à son propre chantier ; ce que tu écris ici sera **faux** dès que la PR sera mergée.
