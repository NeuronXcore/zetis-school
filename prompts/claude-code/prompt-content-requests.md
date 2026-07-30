# Prompt — Liste d'attente de contenus pour Papa (`content_requests`)

Réalise l'**addendum ADR-0027** (`docs/decisions/adr-0027-addendum-content-requests.md`) : quand
Massimo réclame dans le chat un contenu **absent** sur une notion **existante**, l'accumuler dans une
file **dédupliquée** que Papa traite depuis la Couverture. Résout le Point ouvert n°4 de l'ADR-0027.

**Hors périmètre (ne pas déborder)** : ne pas toucher `production/coverage.py` (invariant lecture
seule) ; ne pas modifier `notion_requests` (autre sémantique) ; pas d'émission depuis d'autres
surfaces que le chat ; pas de production en lot depuis le badge ; aucun nouvel `event_type`, aucun XP.

## Backend — nouveau module `apps/backend/app/modules/content_requests/`

Patron : module `notions` (`service.py` = `create` / `list_requests` / `set_status`).

1. **Modèle** `ContentRequest` (`app/db/models/progress.py`, à côté de `NotionRequest`,
   `TimestampMixin`) : `student_id` FK NOT NULL, `skill_id` FK **NOT NULL**, `content_kind`
   `String(15)`, `status` `String(15)` défaut `pending`, `source` `String(30)` défaut
   `chat_orchestrator`. `__table_args__ = (UniqueConstraint("student_id","skill_id","content_kind",
   name="uq_content_request_student_skill_kind"),)`. Exporter dans `app/db/models/__init__.py`.

2. **Migration** Alembic `down_revision = "b2c3d4e5f8a0"` (tête actuelle) : `create_table` +
   `create_index` sur `student_id` + la `UniqueConstraint`. **Appliquer sur Postgres dev**
   (`alembic upgrade head`).

3. **Service** (`service.py`) :
   - `CONTENT_KINDS = ("cours","fiche","mindmap","quiz","capsule","card")`,
     `_ALLOWED_STATUS = ("pending","done","dismissed")`.
   - `create_request(db, student_id, skill_id, content_kind, source=...)` — **idempotent** : cherche
     la ligne `(student, skill, kind)` ; absente → crée `pending` ; présente `pending` → ne fait
     rien ; présente `done`/`dismissed` → **ré-active** en `pending` (Massimo redemande). Valide
     `content_kind ∈ CONTENT_KINDS` (sinon ignore silencieusement — c'est une émission best-effort).
   - `list_requests(db, status_filter="pending")` → jointure `Skill` (+ `Subject`) pour renvoyer
     `{id, skill_id, skill_name, subject_id, content_kind, status, source, created_at}`, récents
     d'abord.
   - `set_status(db, req_id, new_status)` — comme `notions`, 404 si absent, 400 si statut invalide.
   - `pending_count(db)` optionnel (pastille).

4. **Schémas** (`schemas.py`) : `ContentRequestOut`, `ContentRequestPatch{status}`.

5. **Router Papa** (`router.py`, `prefix="/api/content-requests"`, `dependencies=[Depends(require_parent)]`) :
   `GET ""` (liste `pending` par défaut, `?status=`) ; `PATCH "/{request_id}"` (done/dismissed).
   L'inclure dans `app/main.py`. **Aucune route enfant** (l'émission est interne au service de chat).

## Backend — émission depuis le chat (best-effort, aveugle au contenu)

- `chat/actions.py` : dans `_open_notion` (branche `entry is None or not available`) et dans
  `_notion_menu` (cas `not items`), poser dans `ActionResult.meta` un signal
  `"content_request": {"skill_id": ..., "content_kind": ...}`. Mapping `tool→kind` :
  `fiche→fiche, mindmap→mindmap, cours→cours, revision→card, eli5→cours` ; notion vide → `cours`.
  (Métadonnée pure — pas de texte, §1c.)
- `chat/service.py handle_message` : après le tour, si `action_result.meta.get("content_request")`,
  appeler `content_requests.service.create_request(...)` dans un `try/except` qui **n'échoue jamais**
  le tour (log éventuel, jamais de raise). Émettre AVANT le `db.commit()` final.

## Frontend Papa

- `lib/contentRequests.ts` : `fetchContentRequests()` → `ContentRequest[]` ;
  `setContentRequestStatus(id, status)`.
- Types `packages/types` (`production.ts` ou nouveau `contentRequests.ts` + ré-export `index.ts`) :
  `ContentRequestKind`, `ContentRequestStatus`, `ContentRequest {id, skill_id, skill_name,
  subject_id, content_kind, status, source, created_at}`.
- `hooks/useCoverage.ts` : charger aussi les demandes (`Promise.all`), exposer
  `requestsBySkill: Map<number, ContentRequest[]>` (pending) + `setRequestStatus(id, status)` qui
  mute puis recharge. **Ne pas** re-fetch la couverture entière au clic si évitable (optimiste ok).
- **Badge Couverture** (`components/couverture/`) : sur chaque ligne de leçon, calculer les demandes
  des `lesson.notions.items[].skill_id` (fusion client par `skill_id`). S'il y en a → badge
  **« ⭐ réclamé (n) »** à côté du titre (patron du `marker.badge` existant) ; clic → petit popover
  (patron `NotionsPopover`) listant `notion — type` + boutons **Fait** / **Ignorer**. Ne pas
  dupliquer `NotionsPopover` en entier — un composant `RequestedPopover.tsx` dédié.

## Tests
- Backend : dédup (2 `create` même triplet → 1 ligne) ; ré-activation (`dismissed` → `create` →
  `pending`) ; `list_requests` enrichi (skill_name) ; `set_status` invalide/404 ; émission (a) tool
  manquant → 1 demande du bon `kind`, (b) `_notion_menu` vide → demande `cours` ; **best-effort**
  (une exception de `create_request` mockée n'échoue pas `handle_message`).
- Front : `useCoverage` fusionne par `skill_id` ; badge rendu quand demandes ; `RequestedPopover` →
  clic Fait appelle le bon endpoint.

## Vérification
`alembic upgrade head` (Postgres dev) ; `pytest` module + suites chat/production vertes ; `tsc -b`
+ build Papa ; **live** : Massimo réclame une fiche absente dans le chat → badge ⭐ chez Papa,
dédupliqué ; « Fait » retire le badge sans toucher `production`.
