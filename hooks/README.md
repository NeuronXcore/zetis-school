# hooks/

Hooks git **versionnés** — ils se relisent, se diffent, et survivent à un reclone.

## Installation — une fois par clone

```bash
ln -sf ../../hooks/pre-push .git/hooks/pre-push
```

Un lien, et non `git config core.hooksPath` : **ce réglage remplace tout `.git/hooks/`** et
éteindrait le `pre-commit` local qui nettoie les `.DS_Store` — un hook dont l'en-tête justifie
explicitement de ne pas être versionné (*« un problème qui ne touche que cette machine »*). Le lien
laisse les deux décisions tenir.

Vérifier qu'il est en place :

```bash
ls -l .git/hooks/pre-push
```

## `pre-push` — les trois suites avant que le travail quitte la machine

Il **exécute** une règle qui existe déjà, `docs/WORKFLOW.md` §2 étape 4 :

> *« toi : tu lances les tests (jamais confiance au "c'est vert"), tu relis le diff, tu vérifies
> que le périmètre a tenu. C'est la seule étape non délégable. »*

🔴 **Il n'automatise qu'un TIERS de cette étape.** Relire le diff et vérifier le périmètre restent
entièrement humains, et un push vert ne dit **rien** sur ces deux-là. Ne jamais lire son ✅ comme
« l'étape 4 est faite ».

### Pourquoi il existe — un motif mesuré, pas supposé

Le rangement du registre (PR #136) a supprimé 46 fichiers de documentation. L'un d'eux était nommé
dans un littéral de `apps/backend/app/tests/test_news_doctrine.py`, passé à `is_file()`.
**La suite backend est restée rouge sur `main` pendant une heure, entre deux PR vertes.**

Trois filets avaient laissé passer, chacun pour une raison valable :

1. `check_adr_refs.sh` était vert — il ne teste que `ADR-\d{4}`, jamais un chemin de fichier ;
2. la PR était verte — **le dépôt n'a aucune CI**, seul GitGuardian s'exécute ;
3. la clôture disait *« aucun test lancé — aucune ligne de code applicatif »*, ce qui était **vrai**.
   Mais un test **lisait le registre**.

### Ce qu'il fait, exactement

| | |
|---|---|
| Suites | `pytest` (backend) · `vitest` (massimo) · `vitest` (papa) |
| Durée | ≈ 40 s |
| Suppression de branche | **aucune suite lancée** — un `git push --delete` ne mérite pas 40 s |
| Outil absent | 🔴 **ÉCHEC**, jamais un saut silencieux |

Le dernier point est le plus important : **un hook qui passe au vert parce qu'il n'a pas pu mesurer
est pire que pas de hook** — il transforme « je ne sais pas » en « c'est bon ».

### L'échappatoire

```bash
git push --no-verify
```

Elle est assumée : une branche peut **porter le rouge à dessein**. `fix/observation-sorties` a trois
tests rouges par construction — ils décrivent un défaut non corrigé. L'utiliser doit rester un geste
conscient, pas une habitude.

### Ce qu'il ne remplace pas

Une **CI**. Le hook est local : il ne s'exécute que sur les machines où le lien a été posé, et
`--no-verify` le contourne. `.github/workflows/` n'existe toujours pas. C'est le pas suivant, pas
celui-ci.
