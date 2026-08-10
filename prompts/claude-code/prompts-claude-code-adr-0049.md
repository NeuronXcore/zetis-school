# Prompts Claude Code — chantier ADR-0049 (le deck de révision par chapitre)

> **Deux sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code, **après `/slice`**, qui porte la discipline. Le prompt ne porte que le chantier.
>
> ✅ **L'ADR est `Accepté` (2026-08-10).** Le prérequis de décision est levé : les deux sessions
> peuvent démarrer. Les **sept décisions sont gelées** — on les **relit**, on ne les rouvre pas.
>
> ⚠️ **La Décision 1 vient du commanditaire**, prise après exposé des trois options chiffrées et de
> leur maquette : **la porte est l'échéance d'agenda, et elle seule**. Les options (b) drill-in
> permanent depuis `/revision` et (c) les deux sont **écartées**. 🔴 **Ajouter une entrée sur
> `/revision` « tant qu'on y est » est la dérive nommée d'avance, pas une amélioration.**
>
> **Aucune migration.** L'effet persisté réutilise `SpacedReviewAttempt.is_consolidation`, qui
> existe. Si une session en vient à proposer une migration, **c'est un blocker, pas une bonne
> idée** — remonte-le avant d'écrire une ligne d'Alembic.
>
> ⚠️ **La Décision 4 AMENDE une doctrine du dépôt** (« pas de flag client »). Elle ne l'abandonne
> pas : *le client déclare un CONTEXTE, jamais un EFFET ; le serveur revalide le contexte et décide
> l'effet.* On la **relit**, on ne la rouvre pas — et on ne la « simplifie » pas en flag booléen.

---

## Ce que chaque session doit avoir lu

- `docs/decisions/adr-0049-le-deck-de-revision-par-chapitre.md` — les 7 décisions, et surtout le
  **Constat read-before-code** : il dit ce que l'ADR-0025 §11 avait d'incomplet ;
- `docs/decisions/adr-0025-agenda-scolaire.md` **§11 couplage 2** — l'invariant, qui ne se rouvre
  pas : *ne jamais avancer les cartes SRS* ;
- `docs/decisions/adr-0025-addendum-lecon-a-apprendre.md` **§14.6** — l'interdiction du bouton mort,
  que ce chantier lève **en construisant ce qu'elle protégeait** ;
- `docs/frontend-massimo/page-revision.md` — les passages marqués **`[0049]`**, dont le
  §« Hors périmètre V1 » **amendé** (l'objection *blocked practice* est répondue, pas effacée) ;
- `docs/frontend-massimo/mockup/mockup-deck-chapitre-v1.html` — **ouvre-la dans un navigateur**.
  Le **bloc A** est la porte retenue ; le **bloc C** (l'état vide) est la maquette utile : il montre
  côte à côte ce qu'on refuse et ce qu'on fait. Ni l'un ni l'autre ne se lit dans le HTML.
  ⚠️ Le **bloc B est conservé comme trace de l'option ÉCARTÉE** — ne l'implémente pas.

---

## Protocole commun aux deux sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de « À LIRE AVANT D'ÉCRIRE » avant d'écrire une
   ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. L'ADR-0049 est écrit sur un
   read-before-code du 2026-08-10 : ses constats sont des MESURES à cette date, pas des lois. Le
   cadrage d'origine (ADR-0025 §11) s'est trompé par OMISSION deux fois — sur `Skill.chapter_id`
   qui n'existe pas, et sur `record_attempt` qui ne sait rien de la session. C'est le taux normal.

3. Stop-on-blocker. Si une lecture contredit l'ADR ou la spec, ARRÊTE-TOI et remonte. N'improvise
   pas. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, route, type et composant.

6. Non-régression. Un test existant modifié pour passer est une régression masquée, pas un test
   mis à jour. Si un test rougit, comprends POURQUOI avant de le toucher.

7. Chaque test-verrou est SABOTÉ et doit ROUGIR. Un verrou vert sur un sabotage ne prouve rien —
   c'est arrivé trois fois dans ce dépôt, dont une sur un verrou central.
```

---

## 🔴 Les cinq pièges de ce chantier — nommés d'avance

### 1. `Skill` n'a AUCUN `chapter_id` — et la traversée existe déjà

Le chemin est `Chapter → Lesson(status='validated') → LessonSkill → Skill`, et il est écrit dans
`apps/backend/app/modules/missions/command.py` : **`_ordered_chapter_skill_ids`**. **Réutilise-le.**
Le réécrire dans `memory` créerait une seconde résolution du même chapitre, qui divergerait le jour
où le gate ADR-0011 bouge.

⚠️ **Conséquence à ne pas découvrir en production** : un chapitre **sans leçon validée** résout
**zéro** notion. C'est un état normal et fréquent, pas un cas limite.

### 2. 🔴 La clause qu'on supprime par erreur en croyant supprimer l'échéance

`_due_conditions` porte **quatre** clauses. Le deck chapitre en retire **une seule** :

```python
SpacedReviewCard.due_at.is_not(None),   # ← CONSERVÉE (exclut les cartes `pending`)
SpacedReviewCard.due_at <= now,         # ← LA SEULE À RETIRER
SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),  # ← CONSERVÉE
SpacedReviewCard.student_id == ...,     # ← CONSERVÉE
```

Retirer `due_at IS NOT NULL` en même temps servirait à Massimo les cartes **`pending`** — générées
sans cours validé (ADR-0013). Aucun test existant ne l'attrape ; le verrou 2 est là pour ça.

### 3. 🔴 `response_model` FILTRE EN SILENCE — piège déjà payé deux fois sur ce dépôt

L'ADR-0045 a ajouté `source` et `content_state` à `open_gaps` : les deux clés étaient **produites
par le service et DISPARAISSAIENT à la sérialisation**, sans erreur, parce que le schéma ne les
déclarait pas. L'ADR-0047 est retombé dessus.

Ce chantier ajoute la **servabilité d'un chapitre** au payload que Massimo reçoit. **Déclare-la dans
le schéma Pydantic AVANT de croire qu'elle est servie, et vérifie la réponse HTTP réelle** — pas le
retour de la fonction de service.

⚠️ Et les types partagés : tout nouveau type nommé doit être **exporté depuis
`packages/types/src/index.ts`**, sinon le front ne le voit pas.

### 4. `record_attempt` ne sait rien — et le serveur doit revalider, pas croire

Le champ `deck` de l'attempt est un **contexte proposé par le client**. Le serveur :

1. résout le chapitre ; 2. vérifie que `card.skill_id` **lui appartient** ; 3. **si non → attempt
normal, sans erreur ni mention**.

Un `if body.deck: is_consolidation = True` est **exactement la faute** que la Décision 4 écarte.

### 5. Trois commentaires deviennent FAUX — et ils sont justes par accident

`is_consolidation` est réutilisé pour l'effet. Tous ses **lecteurs** restent corrects ; toutes ses
**raisons écrites** deviennent incomplètes. À réécrire **dans la même slice** :

| Fichier | Ce qu'il dit aujourd'hui |
|---|---|
| `modules/memory/service.py` (`record_attempt`) | *« Consolidation détectée CÔTÉ SERVEUR (pas de flag client) »* |
| `modules/dashboard/service.py` (`_review_attempts`) | *« le compter doublerait une révision qui n'a eu lieu qu'une fois »* — vrai du re-tour, **faux** de la session chapitre |
| `docs/frontend-massimo/page-revision.md` | ✅ **déjà amendé** au cadrage — vérifie-le, ne le refais pas |

---

## SESSION A — le serveur sert un chapitre, et ne replanifie rien

**Périmètre** : backend seul. **Vraie dans les trois options de la Décision 1.**

### À LIRE AVANT D'ÉCRIRE

- `apps/backend/app/modules/memory/service.py` — **en entier** (`_due_conditions`, `build_session`,
  `record_attempt`, les constantes de plafond et d'XP) ;
- `apps/backend/app/modules/memory/router.py` et `schemas.py` ;
- `apps/backend/app/modules/missions/command.py` — `_ordered_chapter_skill_ids` ;
- `apps/backend/app/modules/dashboard/service.py` — `_review_attempts` ;
- `apps/backend/app/modules/agenda/schemas.py` — `AgendaItemStudentOut` ;
- `apps/backend/app/tests/test_reviews.py` — **ce qui est déjà verrouillé**, à ne pas casser.

### Ce qu'il faut faire

1. **`REVIEW_SESSION_MAX_CHAPTER = 8`**, à côté de ses sœurs, avec le commentaire qui dit pourquoi
   il n'est **pas** relevé avant un contrôle (il borne une session, pas la révision).
2. **`build_session` accepte `deck == "chapter"`** (+ `chapter_id`) : portée par
   `_ordered_chapter_skill_ids`, clause d'échéance retirée, **les trois autres conservées** (piège
   2), tri `due_at ASC, id ASC` inchangé, **pas d'entrelacement**, plafond chapitre.
   Chapitre inconnu **ou** sans carte servable → le **même 400**, indiscernable.
3. **`SessionRequest` accepte `{chapter: id}`** — miroir dans `packages/types/src/reviews.ts`.
4. **`AttemptRequest` accepte `deck` optionnel**, et `record_attempt` gagne sa **troisième branche** :
   revalidation serveur (piège 4) → planification intacte, **XP plein (5)**,
   `reason = "review_chapter"`, `is_consolidation = True`, payload de `learning_events` enrichi de
   `deck`.
5. **La servabilité d'un chapitre est exposée** au payload que Massimo reçoit (piège 3). Le grain
   exact suit la Décision 1 — mais **le calcul est serveur dans tous les cas**.
6. **Les deux commentaires du piège 5** sont réécrits.

### Verrous attendus

- Chapitre **sans leçon validée** → zéro carte, et la servabilité renvoyée est **fausse**.
- Une carte **`pending`** d'un chapitre servable n'est **jamais** servie.
  ⚠️ **Sabotage obligatoire** : retire `due_at IS NOT NULL` — le test doit rougir.
- Un attempt `deck: {chapter: X}` sur une carte **hors** du chapitre X → traité **normalement**
  (`due_at` bouge, XP 5 avec `reason="review"`, `is_consolidation=False`).
- Un attempt de session chapitre laisse `due_at`, `interval_days` et `last_reviewed_at`
  **strictement inchangés**. C'est l'invariant du §11 ; il ne se lit nulle part ailleurs.
- XP d'une session chapitre = **5**, `reason = "review_chapter"`.
- Un attempt de session chapitre **n'apparaît pas** dans `_review_attempts` du dashboard, **et
  apparaît** dans le journal d'activité. Deux assertions, une seule session.
- **Le 400 est indiscernable** entre chapitre inexistant et chapitre sans carte.

---

## SESSION B — Massimo entre par la porte, ou ne la voit pas

**Périmètre** : `apps/frontend-massimo`, **surface Agenda uniquement**.

### À LIRE AVANT D'ÉCRIRE

- Le rapport de la Session A — ce qu'elle a **réellement** servi ;
- la maquette, **bloc C** ;
- `src/pages/AgendaPage.tsx`, `src/hooks/useAgenda.ts`, `src/lib/agenda.ts` ;
- `src/components/agenda/AgendaItemRow.tsx` et `AgendaDayPanel.tsx` — **c'est là que la porte
  vit**, et `AgendaItemRow.test.tsx` dit ce qui est déjà verrouillé ;
- `src/pages/RevisionSessionPage.tsx` — **le runner à réutiliser**, et comment il reçoit son deck
  (état du routeur, `/revision/session`) ;
- `src/pages/RevisionPage.tsx` — **à lire pour NE PAS y toucher** (voir point 5).

### Ce qu'il faut faire

1. **La porte sur l'échéance**, dans `AgendaItemRow` : sur un item dont le chapitre est servable,
   *« 🃏 Réviser ce chapitre »* → session du deck `{chapter}`. Elle **réutilise le runner
   existant** — aucun écran neuf, le seul écart visible est le **nom du deck**.
   ⚠️ **Regarde la maquette bloc A avant de placer la puce** : au chantier agenda, une puce dans
   l'angle a mangé **un tiers de la largeur du titre** sur une carte de 81 px, et aucun test ne
   mesure une colonne.
2. 🔴 **L'absence, pas le gris.** Quand le chapitre n'est pas servable : **rien**. Ni bouton grisé,
   ni bouton qui explique, ni espace réservé. La surface **lit** la servabilité du serveur et ne la
   recompte jamais — un recompte front serait la seconde source de vérité qui a divergé le jour
   même au §14.5 du chantier agenda.
3. **Le `deck` est passé à l'attempt** pendant toute la session chapitre.
4. 🔴 **La mécanique SRS reste invisible.** Nulle part Massimo ne lit que la session ne déplace pas
   ses cartes, ni « non planifiante », ni « supplémentaire ». Il révise avant son contrôle.
5. 🔴 **`RevisionPage.tsx` n'est PAS touchée.** Aucune entrée vers le deck chapitre sur `/revision` :
   c'est l'option (b), **écartée** par la Décision 1. Elle paraîtra manquante — elle est décidée.
   Si le chantier semble incomplet sans elle, **c'est un blocker à remonter, pas une ligne à
   ajouter**.

### Verrous attendus

- Chapitre non servable → **aucun élément de porte dans le DOM**. ⚠️ Assertion sur l'**absence**,
  pas sur un `disabled` : un bouton désactivé passerait un test écrit à l'envers, et c'est
  exactement l'écran que la Décision 2 refuse.
- Le `deck` part bien dans le corps de **chaque** attempt de la session.
- Aucune chaîne parlant de planification, d'intervalle ou de « non planifiant » sur les surfaces de
  Massimo.
- **Verrou de dépôt** — aucune occurrence du deck `{chapter}` sous `src/pages/Revision*`. C'est le
  test qui attrape la dérive « tant qu'on y est, mettons-la aussi sur `/revision` » (Décision 1).

> 🔴 **`tsc -b` VERT NE PROUVE RIEN SUR LES TESTS DE MASSIMO** :
> `apps/frontend-massimo/tsconfig.app.json` **exclut** `src/**/*.test.ts(x)` — ceux de Papa, eux,
> sont typecheckés. Un contrat changé hurle côté Papa et passe **sans un bruit** côté Massimo.
> Lance les tests, ne te fie pas au typecheck.

---

## 🔴 VÉRIFICATION À L'ÉCRAN — OBLIGATOIRE, ET PAR UN HUMAIN

**Avant la PR, pas après.**

Le chantier agenda (2026-08-10) a livré trois suites vertes, **tous les verrous sabotés et rougis**,
et l'écran a quand même rendu **quatre défauts** : une teinte à 16° d'une autre, une puce qui
mangeait un tiers d'un titre, un tap muet sur tous les jours passés, un champ sans nom.
**Cinq des six décisions de ce chantier-là sont nées de l'œil, aucune d'un test.**

Ce chantier a une raison de plus : **son état principal est une ABSENCE**. Aucun test ne peut dire
si une porte absente laisse une échéance lisible ou un trou qui interroge.

À regarder, en vrai, sur l'interface de Massimo :

1. Une échéance **avec** deck servable — la porte se lit-elle sans manger le titre ?
2. Une échéance **sans** deck servable — l'échéance reste-t-elle entière, ou l'absence se voit-elle ?
3. **Sur téléphone (375 px)**, pas seulement en desktop.
4. Une session chapitre jouée **jusqu'au bout**, et l'XP de fin vérifié à **5 par carte**.

⚠️ **Le panneau navigateur ment sur la largeur** : il s'ouvre en taille réduite et l'espace de clic
n'est pas celui du viewport. **Mesure dans le DOM**, et regarde sur un vrai écran.

---

## Après la Session B

- `CHANGELOG.md` — une entrée de version.
- `TROUBLESHOOTING.md` — une section par piège **réellement payé** (pas ceux listés ici et évités).
- `MEMORY.md` — l'état à la reprise.
- `/cloture`, puis **l'humain vérifie et committe**.
- ⚠️ **Après le merge : étape 4bis** (`docs/WORKFLOW.md §5`) — remettre `MEMORY.md` au réel **et
  éteindre l'annonce « à faire »** partout où ce chantier était promis : `DECISIONS.md`,
  `adr-0025-addendum-lecon-a-apprendre.md` §14.6 (*« livré à 0 % »* devient faux), et le
  §« Hors périmètre V1 » de `page-revision.md`.
