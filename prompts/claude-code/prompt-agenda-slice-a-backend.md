# Prompt Claude Code — Agenda scolaire · Slice A backend (ADR-0025, Lot 1)

> Exécution de l'ADR-0025 (⚠️ 0018 est pris : « Commander une mission »). Périmètre : **backend uniquement** — table `agenda_items`
> + migration, module `agenda`, règles de co-édition Massimo/Papa, bande glissante,
> « ce qui arrive », traçabilité **non probante**, tests d'invariants.
> **Lot 1 = aucun appel LLM.** Le parsing (`agenda_parse`) et le plan de préparation
> sont le **Lot 2** : ne les commence pas.
> Les UI (Massimo Slice B, Papa Slice C) suivent.
> Rappel mono-chantier : n'ouvre cette slice qu'après clôture du chantier en cours.

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (séparation stricte Massimo/Papa ; schémas de sortie séparés côté serveur ;
   read-before-write ; stop-on-blocker) ;
2. `docs/decisions/adr-0025-agenda-scolaire.md` **en entier** — c'est la spécification de
   cette étape. Les §2 (co-édition), §3 (traçabilité), §6 (règle de datation) sont des
   **invariants**, pas des recommandations ;
3. `app/modules/evidence/service.py` **en entier** — c'est le substrat neutre qui compte
   déjà six consommateurs (scoring des missions, Conseil de classe, Galaxy…). Repère ses
   entrées (`mastery_by_skill`, `open_gaps`, `recent_verdicts`, `weighted_quiz_signal`,
   `srs_pressure`) et **d'où** elles lisent. Ta contrainte : **l'agenda ne devient pas le
   septième consommateur, et n'alimente aucune de ces entrées.** Si l'une d'elles lit
   `learning_events` de façon non filtrée par `event_type` — ce qui rendrait les événements
   d'agenda probants par accident : **ARRÊTE-TOI**, signale-le et propose l'exclusion
   minimale avant de continuer. C'est le point dur de cette slice ;
4. Le modèle `LearningEvent` réel + la convention de nommage des `event_type` existants, et
   le service qui reconstruit l'activité par jour (Cahier de bord / heatmap Papa) — tu dois
   **le réutiliser** en lecture, pas réécrire un comptage parallèle ;
5. `docs/decisions/adr-0024-zetis-galaxy-progression.md` **§5** (doctrine de progression,
   opposable et rétroactive) et `adr-0018` **§1** (invariant « l'enfant ne voit pas de compte
   à rebours ») — les deux contraignent directement le contrat de la bande, cf. §3 ci-dessous ;
6. Un module récent complet comme gabarit (`app/modules/production/`, `quizzes/` ou
   `fiches/` : `schemas.py`, `service.py`, `router.py`) et ses conventions de garde de rôle
   (`require_parent` vs `get_current_user`) ;
7. Une paire de schémas **séparés** existante (`MissionStudentOut` / `MissionPilotOut`) —
   c'est le patron exact à reproduire ;
8. Les modèles `Subject` et `StudentProfile` réels (FK et résolution par `slug`).

## Objectif

Massimo et Papa peuvent tous deux inscrire des échéances scolaires réelles. Massimo
consulte une **bande glissante de 7 jours** centrée sur aujourd'hui et un bandeau
« ce qui arrive ». Papa saisit et supervise sans jamais pouvoir cocher. Aucune UI.

## Travail demandé

### 1. Données — table `agenda_items` + migration Alembic

```txt
id
student_id          # FK student_profiles
subject_id          # FK subjects, NULLABLE (saisie sans matière autorisée)
due_on              # Date (pas datetime : une échéance est un jour).
                    # NOMMAGE VOLONTAIRE : surtout pas `due_date` — ce nom porte, sur les
                    # missions (ADR-0018 §1), une sémantique inverse (jamais exposée à
                    # l'élève). Les deux ne doivent pas se confondre en relecture.
label               # texte, = raw_text, JAMAIS réécrit par le serveur
kind                # devoir | controle | rendu
created_by          # student | parent — IMMUABLE après création
created_at / updated_at
edited_by_parent_at # nullable — renseigné automatiquement, jamais par le client
done_at             # nullable — écrit UNIQUEMENT par une route élève
dismissed_at        # nullable — archivage ; aucune suppression physique
parent_note         # nullable — JAMAIS servi à Massimo
```

Index `(student_id, due_on)`. Mets à jour `DATA_MODEL.md`.

**Pas de `skill_id`, pas de `raw_text` distinct de `label`, pas de table de plan** : Lot 2.

### 2. Schémas séparés (règle dure)

- `AgendaItemStudentOut` : `{ id, label, subject (slug/nom/couleur), due_on, kind, done,
  created_by, edited_by_parent }` — `edited_by_parent` est un **booléen dérivé**, il porte
  le marqueur « complété par papa » côté UI. **Aucun `parent_note`, jamais.**
- `AgendaItemPilotOut` : tout, y compris `parent_note`, `dismissed_at`, horodatages.

### 3. Endpoints élève — préfixe `/api/student/agenda`

- `GET /week?anchor=YYYY-MM-DD` (défaut : aujourd'hui) → **bande glissante** : 3 jours
  avant l'ancre, l'ancre, 3 jours après. **Jamais alignée sur la semaine calendaire.**

  ```txt
  days[]: { date, offset, traces, fixed_items[], plan_steps[] }
  ```

  - `traces` : entier **0–3**, calculé **uniquement pour `date <= today`**, `null` sinon.
    Définition : **nombre d'activités distinctes du jour, plafonné à 3** (comptage grossier
    et généreux — surtout **pas** une durée, surtout **pas** un score). Réutilise le service
    d'activité existant (lecture 4).
    ⚠️ **Ce n'est pas un niveau sur une échelle.** ADR-0024 §5 interdit « sous aucune forme »
    un décompte de jours manqués : le front ne rendra **aucun réceptacle vide**, donc le
    serveur ne doit pas laisser croire qu'il existe des cases à remplir. `traces = 0` et
    « journée sans donnée » sont **le même état** — ne les distingue pas dans la réponse.
  - `fixed_items[]` : **uniquement pour `date >= today`**, `[]` sinon. L'asymétrie est
    calculée **serveur**, jamais laissée au client.
  - `plan_steps[]` : **toujours `[]` en Lot 1** (champ présent au contrat, rempli au Lot 2).

- `GET /upcoming` → `kind ∈ (controle, rendu)`, `due_on` entre aujourd'hui et +21 jours,
  non fait, non archivé, trié par date, **max 4**. `{ id, label, subject, due_on, days_left,
  has_plan }` (`has_plan` = `false` en Lot 1).
- `GET /items?from=&to=` → liste plate (alimente Aujourd'hui / Demain / à reprendre).
- `POST /items` → `created_by` **forcé à `student` côté serveur** (jamais lu du corps).
  **Verrou de phase (ADR-0025 §10)** : renvoie **403** tant que
  `AGENDA_STUDENT_ENTRY_ENABLED` (config, `.env.example`, **défaut `false`**) est fermé. Le
  verrou est **serveur** — une UI cachée n'est pas une règle. `done_at` et `dismiss` ne sont
  **jamais** concernés par ce flag : Massimo coche et masque dès la phase 0.
- `PATCH /items/{id}` → Massimo modifie `label`/`subject_id`/`due_on`/`kind` **uniquement
  sur ses propres items** (`created_by='student'`), sinon **403** ; même verrou de flag.
- `POST /items/{id}/done` · `POST /items/{id}/undone` → bascule `done_at`. Autorisé sur
  **tous** les items, y compris ceux de Papa.
- `POST /items/{id}/dismiss` → masque un item, y compris un item de Papa (le masquage
  reste visible côté pilotage).

### 4. Endpoints Papa — préfixe `/api/agenda`, `require_parent`

- `GET /items?from=&to=` → `AgendaItemPilotOut`, items archivés inclus (marqués).
- `POST /items` → `created_by` forcé à `parent`. Accepte un **corps en lot** (liste d'items
  en une requête) : Papa saisit une semaine d'un coup.
- `PATCH /items/{id}` → si l'item cible a `created_by='student'`, le service renseigne
  **automatiquement** `edited_by_parent_at`. Toute tentative d'écrire `done_at` depuis une
  route Papa → **403** (pas 422 : c'est un refus d'autorité, pas de validation).
- `PUT /items/{id}/note` → `parent_note`.
- `DELETE /items/{id}` → **archivage** (`dismissed_at`), la ligne reste en base.

### 5. Traçabilité — `learning_events`

Émets exactement deux types, **marqués non probants** (mécanisme validé en lecture 3) :

- `agenda_item_created` (avec la source `student` | `parent`) ;
- `agenda_item_done`.

**N'émets jamais d'événement pour un item non fait.** Aucune tâche périodique, aucun
balayage, aucun `agenda_item_missed`. L'absence n'est pas un événement — c'est ce qui
empêche le système de fabriquer sa propre dette.

**Aucun XP** n'est crédité par cette slice. Ne touche pas `award_xp`.

### 6. Tests — les invariants d'abord

Ces tests sont le livrable, pas un accessoire :

1. **Papa ne coche pas** : toute route Papa tentant d'écrire `done_at` → 403.
2. **Étanchéité** : `parent_note` absent de **tout** payload `/api/student/*` (assertion sur
   le JSON sérialisé, pas sur le schéma).
3. **Trace d'édition** : PATCH Papa sur un item `student` → `edited_by_parent_at` renseigné,
   et `edited_by_parent: true` remonte dans `AgendaItemStudentOut`.
4. **`created_by` immuable** : toute tentative de modification est sans effet.
5. **Pas de suppression physique** : DELETE Papa → ligne toujours présente, `dismissed_at`
   renseigné.
6. **Asymétrie de la bande** : aucune date `> today` ne porte d'`activity_level` ; aucune
   date `< today` ne porte de `fixed_items`.
7. **Règle de datation (test-verrou)** : avec des missions actives et des cartes SRS dues en
   base, `GET /week` ne renvoie **aucune** d'entre elles. Le service ne lit ni `missions` ni
   les cartes SRS — vérifie-le par la réponse.
8. **Non-probant (test-verrou)** : avec des items d'agenda créés et cochés, **aucune sortie
   de `app/modules/evidence/service.py` ne change** — `mastery_by_skill`, `open_gaps`,
   `recent_verdicts`, `weighted_quiz_signal`, `srs_pressure` identiques avant/après. Aucune
   carte SRS modifiée, aucun `xp_events` crédité.
9. **Garde de rôle** : 403 pour le rôle `child` sur `/api/agenda/*`.
10. Bande glissante : `anchor` un dimanche renvoie bien 3 jours de futur (pas 0).
11. **Aucun `traces` sur une date future** (`null`, pas `0`) — un jour à venir n'a pas de
    case vide.
12. **Verrou de phase** : flag fermé → `POST /items` élève en 403, **mais**
    `POST /items/{id}/done` et `/dismiss` en 200. Flag ouvert → `POST /items` en 201.

## Hors périmètre strict (ne pas commencer)

- **Lot 2** : parsing local du texte libre (`agenda_parse`), rattachement `Skill`,
  génération et persistance du plan de préparation. Le champ `plan_steps` reste `[]`.
- Toute UI (Slices B et C).
- Import Pronote/ENT, saisie photo/OCR, notifications, rappels.
- Fusion automatique de doublons (le garde-fou est client, Slice B).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : absence de distinction probant/non probant sur
`learning_events` (le plus probable) ; service d'activité par jour introuvable ou non
réutilisable ; convention `/api/student/...` divergente ; `StudentProfile` non résoluble
depuis l'utilisateur courant. Dans ces cas : propose l'ajustement minimal et attends
validation.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé : `feat(agenda): agenda_items, co-edition rules and sliding week (backend)`
