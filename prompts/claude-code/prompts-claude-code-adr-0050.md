# Prompts Claude Code — chantier ADR-0050 (le plan de préparation)

> **Trois sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel, **après `/slice`**,
> qui porte la discipline. Le prompt ne porte que le chantier.
>
> ✅ **L'ADR est `Accepté` (2026-08-10).** Les **sept décisions sont gelées** — on les **relit**,
> on ne les rouvre pas. Les trois sessions peuvent démarrer.
>
> ⚠️ **La Décision 5 vient du commanditaire** : **la coche est une DÉCLARATION** (option A).
> Massimo coche, **aucun XP, aucune célébration** ; jouer l'activité ne coche **rien**. L'option
> (B) — la coche prouvée par la trace de l'activité — est **REPORTÉE, pas écartée**. 🔴 **Ne
> l'implémente pas « tant qu'on y est » parce que la trace existe** : c'est la sémantique double
> qui a été refusée, pas la donnée.
>
> 🔴 **UNE MIGRATION.** La première depuis trois chantiers. `agenda_plan_steps`. Elle devra être
> posée en prod après le merge — et **deux migrations héritées y sont déjà dues** (`MEMORY.md`).
> Vérifier l'état réel de la prod avant d'en ajouter une troisième.

---

## Ce que chaque session doit avoir lu

- `docs/decisions/adr-0050-le-plan-de-preparation.md` — les 7 décisions et le **Constat
  read-before-code** ;
- `docs/decisions/adr-0025-agenda-scolaire.md` **§8 rôle 1** — le « traducteur », qui tranche déjà
  **zéro LLM** et **le figement** ;
- `docs/frontend-massimo/page-agenda.md` — passages **`[0050]`** ;
- `docs/frontend-massimo/mockup/mockup-plan-preparation-v1.html` — **ouvre-la**. Le **bloc B**
  (les trois états sans plan) est la maquette utile ; le **bloc C** montre la Décision 5 ouverte.

---

## Protocole commun

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord.

2. Read-before-code, et RENDS UN RAPPORT de ce qui était faux. L'ADR-0050 est écrit sur un
   read-before-code du 2026-08-10 : ses constats sont des MESURES à cette date, pas des lois.

3. Stop-on-blocker. Une lecture qui contredit l'ADR → tu t'arrêtes et tu remontes.

4. Les découvertes remontent dans les docs, dans le même commit.

5. Aucun chemin inventé.

6. Non-régression. Un test existant modifié pour passer est une régression masquée.

7. Chaque test-verrou est SABOTÉ et doit ROUGIR. Un verrou vert sur un sabotage ne prouve rien —
   c'est arrivé QUATRE fois dans ce dépôt, la dernière hier sur le verrou central de l'ADR-0049.
```

---

## 🔴 Les cinq pièges de ce chantier

### 1. 🔴 N'écris AUCUNE requête de disponibilité dans `agenda`

`resolve_panoply` (`galaxy/service.py`) est **LE prédicat de disponibilité de ZETIS**, et son
docstring dit pourquoi il est unique : le correctif du 2026-07-30 a prouvé ce qu'un second coûte —
le cours annoncé disponible sur `lesson_id is not None` d'un côté, `content_markdown IS NOT NULL`
de l'autre, **une porte ouverte sur du vide**.

Il travaille **en lot, à requêtes constantes**, et **porte déjà l'ordre pédagogique**. Compose,
ne recalcule pas. Un verrou de dépôt le vérifie.

⚠️ **Vérifie le sens des imports avant de câbler** : `agenda → galaxy` est-il libre de cycle ?
Hier, `memory → missions` a cassé `app.main` parce que le sens inverse existait déjà. **Teste-le
dans un interpréteur NEUF, sur le vrai fichier** :
`.venv/bin/python -c "import app.main"` **et** `-c "import app.modules.agenda.service"`.

### 2. 🔴 `response_model` filtre en silence — piège payé TROIS fois

`plan_steps` est typé **`unknown[]`** côté `packages/types` et `list[dict]` côté Pydantic : tout ce
que le service produira **et que le schéma ne déclare pas** disparaîtra sans erreur. Déclare le
type d'étape **avant** de croire qu'il est servi, et vérifie la **réponse HTTP réelle**.

⚠️ Tout nouveau type nommé doit être exporté depuis `packages/types/src/index.ts`.

### 3. Le figement se teste sur le TEMPS, pas sur un appel

Le plan est composé **une fois** et ne bouge plus. Un test qui appelle deux fois de suite ne
prouve rien : il faut **changer le monde entre les deux** (valider une fiche, générer des cartes)
et vérifier que le plan **n'a pas changé**.

### 4. La suppression sur déplacement de date passe par un `PATCH` PARTIEL

Papa patche `due_on` seul. ⚠️ Le chantier agenda a déjà payé *« le `PATCH` partiel qui périme une
donnée »* (`TROUBLESHOOTING.md`) : `data.get("due_on")` est `None` **aussi** quand la clé est
absente. Utilise `exclude_unset` / la présence de la clé, jamais la valeur.

### 5. ⚠️ Les tests de Massimo ne sont PAS typecheckés

`tsconfig.app.json` exclut `src/**/*.test.ts(x)`. **Un `tsc -b` vert ne prouve rien sur eux** — une
fixture d'agenda était incomplète pendant des jours sans que rien ne le signale. Si tu ajoutes un
champ requis à `AgendaDay` ou `AgendaItemStudent`, **les fixtures ne rougiront pas**. Cherche-les.

---

## SESSION A — le serveur compose un plan, et le fige

**Périmètre** : backend. Vraie dans les deux options de la Décision 5.

### À LIRE AVANT D'ÉCRIRE

- `apps/backend/app/modules/agenda/service.py` (**en entier** : `student_out`, `week`, `upcoming`,
  `patch_parent_item`) et `schemas.py` ;
- `apps/backend/app/modules/galaxy/service.py` — `resolve_panoply` et ce qu'il rend exactement ;
- `apps/backend/app/modules/lesson_resolution.py` — `ordered_chapter_skill_ids` ;
- `apps/backend/app/tests/test_agenda.py` — ce qui est déjà verrouillé.

### Ce qu'il faut faire

1. **Table `agenda_plan_steps` + migration** (Décision 1). Vocabulaire de `kind` = celui de la
   panoplie, jamais un vocabulaire neuf.
2. **La composition** (Décisions 2 et 3) : chapitre → `ordered_chapter_skill_ids` →
   `resolve_panoply` → retenir le disponible, **dans son ordre**, plafond **3**, réparties de
   demain à **la veille**, et **aucun plan** à J+0/J+1.
3. **Génération à la première lecture puis figement** (Décision 4), et **suppression** du plan
   quand `due_on` change.
4. **`plan_steps` et `has_plan` réellement servis** (piège 2). `has_plan` est vrai **si et
   seulement si** le plan a au moins une étape.
5. **La route de coche** (déclarative pour l'instant — Décision 5 option A).

### Verrous attendus

- Échéance à J+0 et à J+1 → **aucune étape**, `has_plan` faux.
- Chapitre sans aucune activité disponible → **aucune étape**, `has_plan` faux.
- Échéance **sans chapitre** → aucune étape.
- **Jamais plus de 3 étapes**, et **jamais une étape le jour de l'échéance**.
- L'ordre servi est **exactement** celui de `resolve_panoply` (saboter en triant autrement doit
  rougir).
- Valider une fiche **après** génération ne change pas le plan (piège 3).
- `PATCH due_on` **supprime** le plan et ses coches ; `PATCH` d'un autre champ **ne le supprime
  pas** (piège 4 — deux assertions, sinon le verrou est à moitié écrit).
- **Verrou de dépôt** : aucune requête de disponibilité sous `modules/agenda/`.

---

## SESSION B — Massimo lit son plan

**Périmètre** : `apps/frontend-massimo`, surface Agenda.

1. Le plan **sous l'échéance**, le `✦` sur les jours qui portent une étape.
2. 🔴 **Aucun plan ⇒ RIEN** : ni bloc, ni « bientôt », ni `✦` éteint. Voir le **bloc B** de la
   maquette : trois causes, un seul rendu.
3. Chaque étape **mène à son activité**.
4. **La coche, déclarative** : le geste de Massimo, aucun XP, aucune célébration — et rien qui se
   coche tout seul quand l'activité a été jouée.
5. 🔴 **Aucun compte à rebours, aucune couleur d'approche.** Le seul signal d'approche est
   l'apparition du plan (§6 de l'ADR-0025).

### Verrous attendus

- Sans plan → **aucun élément dans le DOM**. Assertion sur l'**absence**, jamais sur un `disabled`.
- Aucune chaîne de retard, d'urgence ou de décompte sur les surfaces de Massimo.
- **Aucune célébration ni XP** à la coche d'une étape (Décision 5 (A)).

---

## SESSION C — Papa lit le plan, ne le pilote pas

Une ligne par échéance : « plan en 3 étapes · 1 **cochée** ». ⚠️ **« cochée », jamais « faite »**
(§14.7). Aucun bouton de génération, aucune édition.

---

## 🔴 VÉRIFICATION À L'ÉCRAN — OBLIGATOIRE, PAR UN HUMAIN, AVANT LA PR

Sur les **deux** interfaces, et à **375 px**. À regarder :

1. Une échéance **avec** plan — les trois étapes tiennent-elles sans écraser le titre ?
2. Une échéance **sans** plan — l'absence laisse-t-elle l'échéance entière ?
3. **Le déplacement de date joué en vrai** : le plan disparaît-il vraiment, et l'écran le
   supporte-t-il ?
4. Une étape cochée, puis la page rechargée.

⚠️ **Le panneau navigateur ment sur la largeur** — mesure dans le DOM.

---

## Après la Session C

`CHANGELOG.md` · `TROUBLESHOOTING.md` (les pièges **réellement** payés) · `MEMORY.md` · `/cloture`.
🔴 **Puis la migration en prod**, et l'**étape 4bis** — dont le cinquième contrôle : éteindre les
annonces « à faire » là où ce chantier était promis (`adr-0025` §8, `page-agenda.md`).
