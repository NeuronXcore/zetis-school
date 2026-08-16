---
description: Cadrage d'un chantier ZETIS — sur `main`, sans une ligne de code. Produit l'ADR et son index, puis s'arrête.
argument-hint: [le chantier à cadrer, ex. "l'enrichissement des fiches déjà créées"]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(ls:*), Bash(graphify:*), Bash(docker exec:*)
disable-model-invocation: true
---

# Cadrage d'un chantier ZETIS

La **première** des quatre commandes du cycle — `cadrage → ouverture → slice → cloture`. Elle
existait dans le rituel (`CLAUDE.md` : *mockup → spec → ADR → prompt*) et **nulle part dans les
commandes** : `/ouverture` répétait qu'elle n'était pas le cadrage sans que rien ne le porte.

> 🔴 **Un ADR écrit dans la session qui code cesse d'être une contrainte pour devenir une
> justification.** C'est toute la raison d'être de cette commande : décider **avant**, ailleurs,
> et sans avoir le clavier qui démange.

**Tu ne committes pas.** Le lot se relit et se committe par moi.

## État réel (lis avant toute chose)

- Branche : !`git rev-parse --abbrev-ref HEAD`
- Arbre : !`git status --short`
- Écart avec le distant : !`git rev-list --left-right --count origin/main...HEAD`
- Derniers ADR : !`ls docs/decisions/ | grep -oE 'adr-[0-9]{4}' | sort -u | tail -3`
- Chantier à cadrer : $ARGUMENTS

## 1. Es-tu au bon endroit ?

Trois conditions, et tu t'ARRÊTES à la première qui manque :

- on est sur **`main`** — un cadrage ne vit jamais sur une branche de chantier ;
- `main` n'est **pas en retard** sur `origin` (dis-le-moi, c'est à moi de `git pull`) ;
- l'arbre ne contient **aucune modification de code**. Sous `apps/` ou `packages/`, **quoi que ce
  soit** est un reste de chantier : arrête-toi et signale-le.

## 2. Ce que tu produis — DEUX lots, et ils ne vont pas au même endroit

`docs/WORKFLOW.md §2bis`. Ne les mélange pas : `/ouverture` **s'arrête** s'il voit `DECISIONS.md`
modifié sur une branche.

| Lot | Fichiers | Où | Quand |
|---|---|---|---|
| **Décision** | l'ADR · `DECISIONS.md` **régénéré** · `MEMORY.md` · `BACKLOG.md` si besoin | **`main`** | **maintenant**, avant `/ouverture` |
| **Exécution** | spec de page · maquettes · prompts | la **branche** | c'est `/ouverture` qui la crée |

🔴 **`DECISIONS.md` ne s'écrit PLUS à la main — il se RÉGÉNÈRE** (depuis la PR #136). Son en-tête le
dit : *« Fichier généré. Ne pas éditer à la main. »* Écris l'ADR, puis lance :

```bash
python3 scripts/gen_frontmatter.py docs/decisions --write
python3 scripts/gen_decisions_index.py docs/decisions DECISIONS.md --write
bash scripts/check_adr_refs.sh                                  # doit sortir en 0
```

⚠️ **Relis le front-matter généré avant de me le rendre**, deux pièges y sont connus : tout ADR
absent de la liste `ARCHITECTURE` de `gen_frontmatter.py` est classé **`type: surface`** — un ADR de
méthode doit y être **ajouté** — et le champ `pr:` est **faux** dès que l'ADR **cite** une PR dans
sa prose (il attrape la première rencontrée).

🔴 **Ne cadre QUE le cas 3 de l'`adr-0060`** — décision neuve, reconnaissable à *« il y a une
migration »* ou *« l'annulation coûte plus d'un commit »*. Un **rangement** (cas 1) et une
**application** (cas 2) ne se cadrent pas : il n'y a rien à décider, ils partent directement sur
leur branche. Une **surface** (cas 4) s'écrit **après** l'écran, pas avant. **Si le chantier
demandé n'est pas un cas 3, dis-le et arrête-toi** : écrire un ADR qui n'est pas dû, c'est
fabriquer une décision là où il n'y a qu'une dette.

⚠️ **Le lot Décision se committe AVANT d'appeler `/ouverture`**, sinon la commande suivante bute
sur ce qu'on vient d'écrire.

## 3. Ce qu'un ADR de ce dépôt doit porter

Reprends le gabarit du plus récent (`## Statut · Contexte · Décision · Alternatives considérées ·
Périmètre · Hors périmètre (nommé) · Conséquences · Le signal qui dirait qu'on s'est trompé ·
Suivi`). Et respecte les quatre règles que ce dépôt a payées :

1. 🔴 **Un CRITÈRE qui borne le chantier**, formulé pour mordre. *« Aucune route neuve »*,
   *« aucun appel LLM dans l'atelier »*. **Un critère qu'on desserre au premier obstacle n'a
   jamais borné quoi que ce soit** — et un bon critère mord dès le premier jour.
2. 🔴 **Un HORS-PÉRIMÈTRE nommé**, pas déduit. Ce qu'on ne fera pas « tant qu'on y est ».
3. 🔴 **Le signal qui dirait qu'on s'est trompé** — écrit **avant**, sinon on le rationalise après.
4. ⚠️ **Ne re-décide pas ce qui est déjà décidé ailleurs.** Relis les ADR consommés et **cite-les**
   au lieu de les reformuler : deux formulations d'une même règle finissent par diverger.

## 4. 🔴 MESURE AVANT DE FIGER — la règle la plus chère du dépôt

Toute décision qui repose sur un **seuil**, une **heuristique**, un **compte** ou une **fréquence**
se mesure **sur les vraies données** avant d'entrer dans l'ADR. Pas sur des exemples inventés.

> Le 2026-08-14, une heuristique d'occasion validée sur des chaînes fabriquées répondait « oui »
> sur **27 fiches sur 27** en base — le signal d'alarme que l'ADR nommait lui-même. ⚠️ Et la
> mesure de contrôle a dû être refaite : une requête SQL **approximait** la règle (virgules seules)
> là où le code coupait aussi sur « et ». Annoncé 4 leçons, le code en donnait 7.

**Exécute la VRAIE fonction sur les VRAIES données**, ou dis explicitement que tu ne l'as pas fait.

## 5. Vérifie chaque fait que tu viens d'écrire

Un par un, par une commande — c'est l'étape que `/cloture` a ajoutée après deux hash faux.

| Fait écrit | Vérification |
|---|---|
| un numéro d'ADR libre | `ls docs/decisions/` |
| la ligne d'index de `DECISIONS.md` | elle pointe vers un fichier qui **existe** |
| un ADR « consommé » | le fichier existe, et le § cité dit bien ça |
| un chiffre, un seuil, un compte | il vient d'une **mesure**, pas d'une estimation |
| un hash, une PR | `git cat-file -t` · `gh pr view` |

> ⚠️ **Une ligne d'index n'est pas une décision, c'est un renvoi vers une décision.** Le 2026-08-01,
> un chantier a été ouvert avec ses seules entrées d'index : les fichiers ADR manquaient.

## 6. Rends-moi enfin

1. Ce qui a été **décidé**, en une phrase par décision ;
2. ce qui reste **ouvert** et que tu n'as pas tranché seul — c'est mon arbitrage ;
3. les **mesures** faites, avec leurs chiffres ;
4. les fichiers du lot **Décision**, et le message de commit — que **je** lancerai ;
5. la commande suivante (`/ouverture <chantier>`), à ne lancer **qu'après** ce commit.

## Ce que tu ne fais pas ici

- Aucune ligne de code, aucun test, aucune migration.
- Aucun commit, aucun push.
- Aucune branche : c'est `/ouverture` qui la crée.
- Aucune spec ni prompt : ils vivent sur la branche, pas ici.
