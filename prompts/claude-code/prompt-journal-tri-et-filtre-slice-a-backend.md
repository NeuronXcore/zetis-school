# Prompt Claude Code — Journal : tri et filtre, slice A (backend)

**Branche** : `feat/journal-tri-et-filtre` (créée depuis `main`, documents de cadrage déjà
committés).
**Quatre commits distincts.** Le 1 est du **schéma seul**, le 2 **fige l'histoire**, le 3 est une
**extraction avec correctif**, le 4 ouvre la surface. Les mélanger rendrait impossible de prouver
que le figeage n'a rien changé à ce qui s'affiche.

---

## 0. Cadre

Protocole d'exécution : **`/slice`** (graphify, read-before-code avec rapport, stop-on-blocker,
hors-périmètre, non-régression). Il ne se répète pas ici.

Décisions, à lire **avant** : `docs/decisions/adr-0034-journal-production-et-veto.md` (Amendement 2) (ce qui
est livré), `docs/decisions/adr-0034-journal-production-et-veto.md` (Amendement 1) (ce qui est **révoqué et ce
qui ne l'est pas** — §5 de l'addendum de ce chantier), `docs/decisions/adr-0037-lecon-canonique-d-une-notion.md`
(le résolveur unique). Spec : `docs/frontend-papa/page-journal.md`.

> **Cette slice ne change RIEN à ce que Papa voit**, sauf sur les lots dont un artefact a été
> retiré depuis. C'est voulu, et c'est aussi la contre-épreuve : si l'écran change ailleurs, c'est
> qu'on a cassé quelque chose.

---

## 1. Read-before-code

Rends un **rapport de ce qui était faux** avant de coder. À vérifier, pas à supposer :

1. **`zetis_mode_source` existe déjà** dans `packages/types/src/production.ts` et dans
   `list_journal` — **calculé**, pas stocké. Confirme-le, et confirme qu'aucun changement de
   contrat n'est nécessaire côté front.
2. **`zetis_mode(run)` et `deduire_regime(...)` sont appelées DEUX FOIS chacune** dans la
   construction du dict de sortie (une fois pour la valeur, une fois pour la source). Vérifie-le :
   ça disparaît naturellement au commit 2, mais dis-le si tu le trouves ailleurs.
3. **`lot_evidence` établit `bloque_sur_cours` par `detail.lower().startswith("cours")`** — sur un
   motif d'affichage. Confirme, et **mesure combien de lots de la base de dev en dépendent** : c'est
   le chiffre qui dit si le figeage arrive à temps.
4. **Aucun `index=True` sur `production_run_id`** dans les cinq tables produites. Vérifie sur les
   modèles **et** en base (`pg_indexes`) — un index peut exister sans être déclaré.
5. **`production_events` porte déjà deux index** (`run_id`, `ix_production_events_run_created`).
   Confirme : c'est ce qui justifie le §4 de l'ADR (filtrer le type sur les événements).
6. **`piece` est `NULL` quand `outcome = 'blocked'`.** Confirme : c'est la limite honnête du filtre
   par type, et l'écran devra la dire.
7. **`lesson_targets` résout la matière d'un chapitre par `school_year_subject_id` UNIQUEMENT.**
   Compte, en base de dev, **combien de chapitres ont `theme_id` non nul et
   `school_year_subject_id` nul** — c'est le nombre de lots qu'un filtre par matière perdrait en
   silence.
8. **`ck_production_runs_exactly_one_scope`** impose *chapitre OU notion-pièce*. Relis-la avant
   d'écrire la traduction du filtre chapitre.

---

## 2. Commit 1 — le schéma, **et rien d'autre**

Une migration Alembic :

- `production_runs.zetis_mode_source` — `String(10)`, nullable, aucune valeur par défaut ;
- index sur `production_run_id` dans les cinq tables produites (`lessons`, `fiches`, `mindmaps`,
  `quizzes`, `spaced_review_cards`) ;
- index sur `production_runs.created_at` (clé de tri par défaut, elle commande la pagination).

Le modèle SQLAlchemy suit, avec le commentaire qui dit **pourquoi** la colonne existe (renvoi à
l'addendum §5).

⚠️ **La migration n'importe AUCUNE logique métier** et ne remplit rien. Une migration qui appellerait
`deduire_regime` ferait dépendre le schéma du code, et se rejouerait différemment selon la version
déployée. Test de non-régression : la suite passe, l'écran est identique — la colonne est vide.

---

## 3. Commit 2 — figer l'histoire

### 3.1 `runner.execute` marque la capture

Là où il écrit déjà `a0a_level` / `a1_level`, il écrit `zetis_mode_source = "capture"`. Une ligne.

### 3.2 Le script de reprise — `scripts/backfill_zetis_mode.py`

- lit les lots dont `a0a_level` **ou** `a1_level` est `NULL` ;
- appelle `lot_evidence` puis `deduire_regime` — **les fonctions existantes, pas une copie** ;
- pour chaque régime déduit, écrit le **couple de paliers correspondant** (lu dans `NIVEAUX`, jamais
  recopié) et `zetis_mode_source = "deduit"` ;
- ce que rien ne prouve **reste `NULL`**, et le script le dit dans son compte rendu.

⚠️ **`--dry-run` par défaut.** Le script affiche ce qu'il écrirait, lot par lot, **avant** d'écrire
quoi que ce soit. Écrire exige `--apply`, explicite.

⚠️ **Il ne touche JAMAIS un lot qui porte déjà ses paliers.** Verrou de test : un lot `capture`
reste `capture`, quels que soient ses artefacts.

### 3.3 La lecture cesse de déduire

`list_journal` lit `run.zetis_mode_source` et les deux paliers. Elle n'appelle plus ni
`lot_evidence` ni `deduire_regime` — **qui ne sont pas supprimées** : elles deviennent les fonctions
du script, et gardent leurs tests.

### 3.4 ⛔ La contre-épreuve, et elle est le cœur du commit

**Avant** d'appliquer le script, capture ce que la page affiche aujourd'hui pour les 9 lots de la
base de dev (régime + source, lot par lot). **Après** application, recompare.

| Résultat | Ce que ça veut dire |
|---|---|
| identique partout | le figeage est fidèle ✅ |
| un lot **change** | ⚠️ **attendu si un artefact a été retiré depuis** — vérifie-le au veto, et **écris-le dans le rapport**. Sinon : **stop-on-blocker.** |
| un lot **perd** son régime | 🔴 **stop-on-blocker** — le script est moins bon que la lecture qu'il remplace |

⚠️ **Ne « corrige » jamais le script pour faire coïncider les chiffres.** Un écart est une
information ; le faire disparaître est le seul vrai échec possible ici.

⚠️ **Ne saborde pas la contre-épreuve par mégarde** : elle doit partir de `list_journal` (le TRONC),
pas d'une fonction feuille — un test qui part d'une feuille ne voit pas le tronc, démontré par
sabotage le 2026-08-04.

---

## 4. Commit 3 — un seul résolveur de matière (extraction **et** correctif)

Une fonction, une seule, répond à *« de quelle matière est ce chapitre ? »*, et elle couvre les
**deux** rattachements : `school_year_subject_id` **et** `theme_id → Theme.subject_id`.

- `lesson_targets` l'appelle au lieu de faire la jointure lui-même ;
- le filtre du commit 4 l'appellera aussi.

⚠️ **Ce n'est pas un refactor élargi, c'est une extraction.** Ne touche rien d'autre. Le motif est
l'ADR-0037 appliquée une fois de plus : deux réponses à une même question finissent toujours par
diverger.

⚠️ **C'est un changement de comportement** : des lots qui rendaient `subject_id: None` vont
maintenant rendre une matière, donc des liens vont apparaître là où il n'y en avait pas. **Test-verrou
obligatoire**, sur un chapitre rattaché par `theme_id`.

---

## 5. Commit 4 — le filtrage, le tri, la pagination

`list_journal` prend les paramètres de la spec (`docs/frontend-papa/page-journal.md` §Données API)
et la route les expose. `require_parent`, routeur du Journal, jamais celui de la Couverture.

### L'ordre est non négociable

`WHERE` → `ORDER BY` → `LIMIT/OFFSET`, en **une** requête. Le total rendu porte sur l'ensemble
**filtré**.

### Chaque critère, et sa forme

| Critère | Traduction |
|---|---|
| **date** | `created_at` entre bornes incluses |
| **matière** | résolue en identifiants **avant** le SQL : chapitres de la matière ∪ `Skill.subject_id` pour le côté lot-pièce |
| **chapitre** | `chapter_id = C OR scope_skill_id IN (notions dont C porte la leçon)` — via `lessons_by_skill`, **appelée une fois par requête** |
| **statut** | colonne, plus `stale` = `running AND heartbeat_at < now() - :délai`. ⚠️ **`running` EXCLUT `stale`** |
| **mode** | traduit en **couples de paliers** depuis `NIVEAUX`. `sur_mesure` = paliers non nuls hors couples nommés ; `inconnu` = un palier `NULL` |
| **type** | `EXISTS` sur `production_events` (`run_id`, `piece IN (…)`) — **jamais** les cinq tables de pièces |

⚠️ **Aucune de ces règles ne se réécrit en SQL.** `lessons_by_skill` et `NIVEAUX` sont appelées, leur
résultat devient un paramètre. Récrire la jointure ou la table de vérité en SQL referait exactement
le défaut que l'ADR-0037 a coûté un ADR entier à réparer.

### Le tri

Clés `date` · `matiere` · `mode` · `statut`, inversables. **Toujours** départagées par
`created_at DESC, id DESC` — sans cette queue, la pagination perd ou répète des lots en silence, et
le test doit le prouver sur deux lots de même clé.

`mode` trie sur les **paliers** (autonomie croissante) ; `sur_mesure` et `inconnu` vont **en fin dans
les deux sens**.

### Les tests qui comptent

1. **filtrer puis paginer, pas l'inverse** — un lot de maths en 4ᵉ page est trouvé par
   `subject_id=maths&limit=20&offset=0` ;
2. **un lot retenu est rendu ENTIER** — filtré sur `fiche`, il porte quand même ses autres pièces ;
3. **`running` et `stale` ne se recouvrent pas** ;
4. **la queue de tri** (deux lots de même matière, deux pages, aucun perdu ni répété) ;
5. **un lot bloqué avant toute pièce ne répond à aucun filtre de type** — écrit comme une **vérité
   attendue**, pas comme un défaut toléré ;
6. **un chapitre rattaché par `theme_id`** entre bien dans le filtre matière.

---

## 6. Hors périmètre — tu t'arrêtes au bord

- **Aucune ligne de frontend.** C'est la slice B.
- **Ne touche pas au veto**, ni à `_pieces_of_run`, ni à `causes_resolues`, ni au calcul de
  `resolved` — il reste une lecture, l'addendum le dit explicitement.
- **Ne « répare » pas `Lesson.status`** (les 39 leçons validées-vides). Dette nommée, chantier à
  part, avec migration.
- **N'ajoute pas de recherche plein texte**, pas de filtre sauvegardé, pas de compteur par régime.
- **Ne réécris aucun motif d'événement.** Deux formulations coexistent, c'est le prix assumé du
  registre.
- **Ne supprime pas `lot_evidence` / `deduire_regime`** : elles servent le script.

## 7. Ce que tu rends

Le rapport de read-before-code, la liste des fichiers, la commande de migration, **le compte rendu
du `--dry-run` puis de l'`--apply`**, le tableau avant/après des 9 lots, les tests ajoutés, ce qui
reste ouvert, les risques.
