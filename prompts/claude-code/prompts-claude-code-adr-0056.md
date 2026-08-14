# Prompts Claude Code — ADR-0056 « La file cesse d'enterrer ce qu'il vient d'écrire »

> **Une seule slice. Backend uniquement.** Zéro écran, zéro route, zéro migration, zéro compteur
> qui bouge. À coller après `/slice`, qui porte la discipline.
>
> Lire d'abord : `docs/decisions/adr-0056-la-file-cesse-d-enterrer-ce-qu-il-vient-d-ecrire.md`,
> et le §13 de `docs/decisions/adr-0015-addendum-fiche-de-massimo.md` (le masquage, qu'on ne
> rouvre pas).
>
> **Le défaut à réparer, mesuré le 2026-08-14** : les 7 cartes `definition_perso` de Massimo sont
> aux **rangs 153 à 159 sur 159** dans la file du Français. Aucun deck ne les sert. Le §13
> promettait *« c'est celle-là qu'il doit pouvoir retrouver »*.

---

## Slice unique — le quota de deux places

### Ce qu'il y a à faire, dans cet ordre

**1. La constante, à côté de ses sœurs.**

Dans `apps/backend/app/modules/memory/service.py`, avec les plafonds (l. 125-131) :

```python
REVIEW_PERSO_RESERVED = 2  # places réservées aux cartes personnelles (ADR-0056, règle C)
```

🔴 **Ce n'est PAS un plafond de plus.** Les places se prennent **dans** les 8, jamais en plus —
une session de matière sert toujours 8 cartes. Desserrer un plafond est interdit par le §2 de
l'ADR.

**2. La composition, dans `build_session` — DEUX requêtes, pas une.**

L'implémentation naïve (un `ORDER BY CASE ... END`) marche et ment : elle mélange la règle de
tri et la règle de quota dans une expression SQL que personne ne relira. Fais simple et lisible :

1. le `stmt` de base est construit **exactement comme aujourd'hui** (mêmes jointures, mêmes
   `where`, même `order_by due_at asc, id asc`) — **tu n'y touches pas** ;
2. `perso = db.execute(stmt.where(SpacedReviewCard.card_type == CARD_TYPE_DEFINITION_PERSO)
   .limit(REVIEW_PERSO_RESERVED)).all()` ;
3. `reste = db.execute(stmt.where(~SpacedReviewCard.id.in_(ids_perso)).limit(cap - len(perso))).all()`
   — **et si `perso` est vide, pas de clause du tout** (voir les pièges) ;
4. `rows = perso + reste`.

**Les places réservées sont servies EN TÊTE** — c'est la liste `[322, 323, 6, 8, 11, 12, 88, 89]`
qui a été soumise à l'arbitrage et retenue. Ne la ré-ordonne pas « par `due_at` » après coup :
tu changerais ce qui a été décidé.

**3. Où le quota s'applique — et où il ne s'applique PAS.**

| Deck | Quota ? |
|---|---|
| `subject` | ✅ oui |
| `chapter` | ✅ oui |
| `mix_day`, `mix_flash` | ❌ **non** — non arbitré, hors périmètre |

🔴 **Le quota se compose avec les conditions PROPRES du deck**, jamais avec une clause d'échéance
que tu réécrirais. Le deck chapitre **sert des cartes non dues** (`chapter_card_conditions`,
ADR-0049 §3) : si tu écris `_due_conditions(...)` dans l'aide au quota, tu casses ce que
`test_chapter_deck_serves_cards_that_are_NOT_due` protège. **Réutilise le `stmt` déjà construit
par la branche du deck** — c'est tout l'intérêt de le filtrer plutôt que de le refaire.

**4. Ce qui ne bouge pas — et si ça bouge, c'est faux.**

- `get_reviews_summary` : `due_count`, `new_count`, `session_size`, `flash_size` — **inchangés**.
  Le quota décide **lesquelles**, jamais **combien**. `test_session_size_annonce_exactement_ce_que_la_session_sert`
  doit rester vert **sans être touché**.
- `servable()`, `masquee_par_sa_carte()`, `chapter_card_conditions`, `_due_conditions` : **aucune
  modification**. Le §3 de l'ADR le dit : on s'y compose.
- `record_attempt`, les intervalles, `ease_factor`, la consolidation, l'XP : **rien**.
- Aucune migration, aucun champ de planification exposé.

**5. La doc qui décrit la règle — sinon elle diverge le jour même.**

- `docs/frontend-massimo/page-revision.md`, **§ Plafonds de session** (l. 160-175) : il écrit
  aujourd'hui *« sélection : cartes dues triées par `due_at` croissant »*. Ajoute la règle des deux
  places, pour les decks matière et chapitre.
- `API_SPEC.md`, **POST `/student/reviews/session`** (l. 934) : même chose, côté contrat. **Le
  payload ne change pas** — c'est la composition qui change.

---

## 🔴 La contre-épreuve — CONDITION DE LIVRAISON, pas une option

Le test-verrou est **nommé par l'ADR §4** : *« une carte `definition_perso` due est atteignable
dans la session de sa matière »*.

1. **Écris-le d'abord**, avec un décor qui reproduit le défaut : au moins **9 cartes dues** dans la
   matière, dont **une seule** `definition_perso` et **la plus récente de toutes**. Sans cet
   arriéré, le test passe avant le correctif et ne prouve rien.
2. **Lance-le : il DOIT rougir** — c'est l'état d'aujourd'hui.
3. Écris le correctif, il passe au vert.
4. **Sabote** : remets `cap` à la place de `cap - len(perso)` dans la seconde requête, ou passe
   `REVIEW_PERSO_RESERVED` à `0`. **Le test DOIT rougir à nouveau.**
5. Restaure, et vérifie par `git diff` que la restauration est **exacte**.

**Si le test est vert avant le correctif, ou vert sous sabotage, le chantier n'a rien produit.**
Ce dépôt a payé ce motif **quatre fois**, dont une où le verrou central était vert sur un sabotage,
et une autre où `schedule_review` n'était exercée par aucun test — *« zéro test touché » peut
vouloir dire « comportement non observé »*.

**Un second verrou, tout aussi important** : *« sans carte personnelle due, la session est
exactement celle d'aujourd'hui »* — les deux places retournent à la file (ADR §5, point 1). C'est
la moitié de la règle que personne ne pense à tester.

---

## Les pièges, nommés d'avance

1. 🔴 **La clause d'échéance dans l'aide au quota** — le piège n° 1 de cette slice. Le deck chapitre
   n'a **pas** de `due_at <= now`, et c'est délibéré. Filtre le `stmt` du deck, ne le reconstruis
   pas.
2. ⚠️ **`in_([])` sur une liste vide** — `filterwarnings = ["error"]` est actif dans ce dépôt
   (`apps/backend/pyproject.toml`) : une liste vide passée à `in_`/`not_in` a historiquement produit
   un `SAWarning`, qui deviendrait ici une **erreur de test**. Garde la clause derrière un
   `if ids_perso:`.
3. ⚠️ **Les tests existants qui décrivent l'ancien ordre** : `test_caps_serve_oldest_and_interleave`
   (l. 203) et `test_chapter_deck_caps_and_orders_by_due_at` (l. 564). S'ils rougissent, **regarde
   leur décor avant de les modifier** : s'il ne contient aucune `definition_perso`, ils doivent
   rester verts **sans un caractère de changé** — et s'ils rougissent quand même, c'est ton
   correctif qui déborde. 🔴 **Un test modifié pour passer est une régression masquée.**
4. ⚠️ **`test_chapter_deck_never_serves_pending_cards`** (l. 523) : il existe pour rougir le jour où
   quelqu'un supprime `due_at IS NOT NULL` en croyant supprimer l'échéance. Ne le contourne pas.
5. ⚠️ **Deux cartes personnelles peuvent porter la même notion ?** Non — la contrainte
   `uq_srs_cards_student_skill_type` l'interdit (§13 point 2). N'écris pas de déduplication
   défensive : elle cacherait une violation de contrainte au lieu de la révéler.
6. ⚠️ **Le mélange du jour n'est pas dans le périmètre.** Si tu te surprends à toucher la branche
   `mix_day`, tu as débordé — la question n'est pas arbitrée.

---

## Vérification exigée

**1. Les suites.** Backend complet (référence du 2026-08-14 : **1282 verts**, infra Docker allumée
sinon `test_auth.py` rougit pour rien — voir `MEMORY.md`). Les fronts ne sont pas touchés, mais
`tsc -b` reste dû si un type partagé bouge — il ne devrait pas.

**2. La recette, sur les vraies données** — c'est la mesure du défaut, rejouée à l'identique :

> Deck **Français**, `_now()` figé au 2026-08-15 : la session doit contenir **au moins une** des
> cartes **322 → 328**, là où elle en contenait **zéro**. Les cartes `definition` de ZETIS des mêmes
> notions (**4, 7, 10, 145, 148, 151, 154**) doivent rester **absentes** — le masquage n'est pas
> rouvert.

Fais-la **en lecture seule** : `build_session` et `get_reviews_summary` sont des lecteurs purs,
aucun `record_attempt`, `rollback()` à la fin. Les cartes de Massimo ne se consomment pas pour une
vérification.

**3. Ce qui doit être resté immobile** : `due_count` du Français inchangé, `session_size` inchangé,
aucun `due_at` modifié en base.
