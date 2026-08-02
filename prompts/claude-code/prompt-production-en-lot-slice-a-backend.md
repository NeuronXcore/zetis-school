# Prompt Claude Code — Production en lot, slice A (backend)

**Branche** : `feat/production-en-lot` (créée depuis `main`, documents de cadrage déjà committés).
**Deux commits distincts** : le premier est un **déplacement pur**, le second **ajoute** une
fonction. Les mélanger rendrait impossible de prouver que le refactor n'a rien changé.

---

## 0. Cadre

Protocole d'exécution : **`/slice`** (graphify, read-before-code avec rapport, stop-on-blocker,
hors-périmètre, non-régression). Il ne se répète pas ici.

Décisions de fond, à lire : `docs/decisions/adr-0031-production-en-lot-et-journal.md` (ce qui est
livré) et `docs/decisions/adr-0023-production-par-scope.md` (**Remplacé**, mais il reste la
référence pour les motifs — surtout son §7). Spec : `docs/frontend-papa/page-couverture.md`.

> **Cette slice ne fait fonctionner aucune production en lot.** Elle prépare le terrain : elle
> déplace l'orchestrateur et lui donne son résolveur de scope. Rien de ce qu'elle livre n'est
> visible de Papa ni de Massimo. C'est voulu.

---

## 1. Read-before-code

Rends un **rapport de ce qui était faux** avant de coder. Points à vérifier, pas à supposer :

1. **`equip_notion` a exactement DEUX appelants**, pas trois. L'ADR-0023 en annonce trois (Conseil
   de classe, champion, Couverture) : le troisième **n'existe pas encore** — c'est la slice C qui
   le créera. Confirme la liste réelle avant de te fier au chiffre.
2. **Les imports paresseux** de `equip_notion` portent ce motif : « évite tout cycle avec les
   modules générateurs (qui n'importent pas `reports`) ». Après le déplacement vers `production`,
   **l'hypothèse change** : les générateurs importent-ils `production` ? Si non, la paresse
   devient du bruit ; si oui, elle reste nécessaire. Tranche par la lecture, pas par prudence.
3. **`production/coverage.py` calcule déjà une résolution de chapitre** pour bâtir sa matrice.
   Trouve-la et **lis-la** : `plan(scope)` doit être *elle*, extraite — pas une seconde
   implémentation qui lui ressemble.
4. **Le module `production` est aujourd'hui « lecture seule »** et un test le garantit. Vérifie ce
   que ce verrou interdit exactement, pour ne pas le casser en y posant l'orchestrateur.

---

## 2. Commit 1 — l'extraction, **déplacement pur**

`equip_notion` et ses schémas (`EquipNotionRequest`, `EquipPieceError`, `EquipNotionResult`)
quittent `reports/` pour `production/`.

### 2.1 Le critère de réussite est négatif

> **Aucun test existant ne doit être modifié.** Ni une assertion, ni un import, ni un nom.
> Un test qu'il faut retoucher **invalide le refactor** : c'est la preuve qu'un comportement a
> bougé. Dans ce cas : arrête-toi et dis-le, ne « répare » pas le test.

Les deux fichiers concernés : `test_reports_council.py` (trois tests `equip_notion`) et
`test_missions_champion.py`.

### 2.2 Les appelants ne changent pas d'interface

`reports/router.py` et `missions/champion.py` importent désormais depuis `production`. Leur
**signature d'appel est identique** — `equip_notion(db, skill_id=…, llm=…, embedder=…)`.

`reports` peut ré-exporter le nom pour ne pas casser d'import externe **seulement si tu en
trouves un** ; sinon, pas de ré-export. Un alias de compatibilité sans consommateur est une dette
qui se prend pour de la prudence.

### 2.3 Ce qui NE bouge pas

L'auto-validation reste `parent_bulk` (§F.4). La dégradation `try/except` par pièce reste
identique. L'ordre des générateurs reste identique. **Zéro changement de comportement** signifie
zéro, y compris dans les messages d'erreur.

### 2.4 Tests du commit 1

Aucun test neuf n'est requis, et c'est le propos. Un seul verrou à **ajouter** :
`equip_notion` n'est plus importable depuis `reports.service` (ou l'est **uniquement** comme
ré-export assumé, si 2.2 l'a justifié).

---

## 3. Commit 2 — `plan(scope)`, un substrat pour deux consommateurs

```
plan(scope) -> [skill_id]
```

Un chapitre se résout en ses **leçons validées** → `lesson_skills` → notions.

### 3.1 Pure, et testée comme telle

Aucun appel IA, aucune écriture, aucun effet de bord. Mêmes entrées → mêmes sorties, **ordre
déterministe compris** (un ordre instable ferait varier la production d'un lot à l'autre).

### 3.2 Le point qui justifie ce commit

> **La matrice de couverture et la production doivent résoudre le même chapitre en LA MÊME liste
> de notions.** C'est tout l'intérêt : la page affiche ce que la production exécutera.
>
> Donc `coverage.py` **consomme `plan(scope)`** — il ne garde pas sa propre résolution à côté.
> Deux résolutions divergentes se paieraient exactement comme le prédicat de disponibilité s'est
> payé le 2026-07-30 : une porte ouverte sur du vide.

Si l'extraction depuis `coverage.py` s'avère impossible à comportement constant (la matrice a
besoin de plus que la liste de notions, par exemple), **c'est un stop-on-blocker** : signale-le,
propose l'ajustement minimal, ne duplique pas.

### 3.3 L'ordre est une décision, pas un détail

L'ADR-0031 §3 prévoit que la production suive la **priorité d'évidence** — c'est ce qui rend un
lot interrompu à 60 % utile. Mais `plan(scope)` reste **pure** : elle ne lit pas l'évidence.

L'ordre pédagogique est appliqué **par l'appelant**, à la slice B, sur la liste que `plan` a
produite. Ne l'anticipe pas ici : une fonction pure qui prendrait `student_id` pour trier cesserait
d'être le substrat partagé qu'elle doit être.

### 3.4 Tests du commit 2

1. **Pureté** : deux appels successifs rendent le même résultat, aucune écriture en base.
2. **Substrat unique** : la matrice de couverture et `plan(scope)` rendent, pour le même chapitre,
   **exactement** la même liste de notions. C'est le test qui interdit la divergence future.
3. **Chapitre vide / leçons non validées** : liste vide, jamais une erreur — un chapitre sans
   leçon validée est un état normal, pas un incident.

---

## 4. Ce qu'il ne faut PAS faire

- **Pas d'endpoint, pas de 202, pas de file, pas de worker** — slice B.
- **Pas de `production_runs`, pas de migration** — slice B. Le journal naît avec l'exécution qu'il
  trace, pas avant.
- **Pas de bouton, pas de surface Papa, aucune modification de `CoverageMatrix.tsx`** — slice C.
- **Pas de `PRODUCTION_MAX_PENDING`** — il régule une exécution qui n'existe pas encore (slice B).
- **Ne pas rendre `coverage.py` écrivant.** Il consomme `plan(scope)`, il ne génère toujours rien.
- **Ne pas toucher `parent_rule`, le nuancier, les paliers** — ADR-0032, un autre chantier.
- **Ne pas « améliorer » `equip_notion` au passage.** C'est un déménagement. Toute amélioration
  repérée se signale, elle ne se fait pas.

---

## 5. Clôture

Rends : fichiers modifiés, commandes à lancer, tests ajoutés (peu — c'est le signe que c'est
réussi), points restants, risques connus.

**Le rapport de non-régression est le livrable principal du commit 1** : dis explicitement
combien de tests existants ont été touchés. La réponse attendue est **zéro**.
