# Addendum ADR-0027 — Liste d'attente de contenus pour Papa (`content_requests`)

## Statut

Accepté — 2026-07-30. Résout le **Point ouvert n°4** de l'ADR-0027 (« mécanisme de la demande de
contenu à Papa »), et **amende son « zéro table »** (§Conséquences positives) : cette décision
ajoute **une** table et **une** migration, assumées.

> S'appuie sur : `adr-0027` (chat orchestrateur — le chat oriente vers l'existant validé ; contenu
> absent → honnêteté + demande à Papa, mécanisme différé), `adr-0023` (module `production`
> **strictement lecture seule** — la Couverture ne génère, ne valide, n'écrit jamais rien),
> `adr-0011 §1` (module neutre à consommateur unique), le précédent `notion_requests` (module
> `notions`, « Dis à Papa d'ajouter » sur ELI5). **Ne rouvre aucune décision.**

## Contexte

L'ADR-0027 a tranché : quand Massimo demande dans le chat un contenu qui **manque** sur une notion
existante, ZETIS **ne génère pas** (ce contournerait la validation Papa) — il le **dit honnêtement**
et **enregistre une demande à Papa**. En Lot 1, seule l'honnêteté était livrée ; le geste
« demander à Papa » était **cadré comme décision** mais son **mécanisme restait ouvert** (Point
ouvert n°4) : étendre `notion_requests` (ajout `skill_id`, `kind`) **ou** une nouvelle table.

Le besoin réel : Massimo réclame un contenu sur une notion (« ta carte sur les fractions », « le
cours sur les nombres relatifs ») → l'accumuler dans une **liste d'attente dédupliquée** que Papa
traite **en lot**, au lieu d'envois au coup par coup qui se perdent.

## Constat read-before-code

**1. `notion_requests` ne convient pas.** Sa sémantique est « notion **hors programme**, texte
libre, `skill_id = None` » (l'enfant tape « pythagore » qui n'existe pas encore ; Papa l'ajoute via
le skills-backfill). Ici c'est l'inverse : la notion **existe et est résolue** (`skill_id` connu),
ce qui manque est un **type de contenu** (`fiche`/`mindmap`/`cours`/carte). `notion_requests` n'a ni
`skill_id` ni `content_kind` — deux sémantiques distinctes qu'il ne faut pas confondre dans une même
table (un `skill_id` optionnel qui vaut tantôt « inconnu » tantôt « connu » serait ambigu).

**2. La Couverture est le bon lieu de traitement.** La page Papa « Couverture » (`production`,
ADR-0023) est **exactement** la carte du stock de contenu : par leçon/notion, ce qui existe et ce
qui manque. Une demande de Massimo est un **repère de priorité** sur cette carte (« ce trou-là, il
le réclame »). Mais `production` est **strictement lecture seule** — l'invariant est dur.

**3. Le pont notion↔leçon existe déjà côté Couverture.** `coverage._notion_details` remonte, par
leçon, ses notions avec leur `skill_id` (`CoverageNotionItem`). Un agrégat des demandes **par
`skill_id`** se fusionne donc **côté client** avec la matrice, **sans toucher `coverage.py`**.

## Décision

### 1. Une table dédiée `content_requests` (nouveau module `content_requests`)

Distincte de `notion_requests` (deux sémantiques). Patron du module `notions`
(`create` / `list_requests` / `set_status`).

```
content_requests {
  id
  student_id     FK student_profiles  NOT NULL
  skill_id       FK skills            NOT NULL   # la notion EXISTE (≠ notion_requests)
  content_kind   str   # cours | fiche | mindmap | quiz | capsule | card
  status         str   # pending | done | dismissed
  source         str   # "chat_orchestrator" (traçabilité de l'origine)
  created_at, updated_at
  UniqueConstraint(student_id, skill_id, content_kind)   # dédup FORTE
}
```

- **`UniqueConstraint(student_id, skill_id, content_kind)`** = dédup forte : « fractions × 5
  demandes de carte » ⇒ **une** ligne. `create` est **idempotent** — sur conflit, il **ré-active**
  une ligne `dismissed`/`done` en `pending` (Massimo redemande ⇒ ça remonte), et ne fait rien si
  déjà `pending`. Jamais deux lignes pour le même `(élève, notion, type)`.
- `content_kind` : vocabulaire **fermé** aligné sur les surfaces (`cours`/`fiche`/`mindmap`/`quiz`/
  `capsule`/`card`). En v1 le chat n'en émet que **quatre** (voir §2), mais le modèle accepte les six
  (Papa pourra en voir d'autres origines plus tard sans migration).
- **Pas de FK matière** : elle se dérive de `skill.subject_id` à la lecture (jamais dupliquée).

### 2. Émission depuis le chat (best-effort, aveugle au contenu §1c, jamais bloquante)

Deux déclencheurs — **décision commanditaire « les deux »** :

- **(a) type précis manquant** : Massimo a demandé un `tool` sur une notion résolue, mais ce contenu
  n'est **pas `available`** (`chat/actions.py:_open_notion`, branche « contenu absent ») →
  `content_request(skill_id, kind=map(tool))`.
- **(b) notion résolue mais VIDE** : la notion résout mais **aucun** contenu n'est `available` (menu
  de notion sans item, `chat/actions.py:_notion_menu`) → `content_request(skill_id, "cours")` — le
  cours est la **porte** (condition des dérivés) ; le réclamer débloque tout le reste.

Mapping `tool → content_kind` : `fiche→fiche`, `mindmap→mindmap`, `cours→cours`, `revision→card`,
**`eli5→cours`** (ELI5 se dérive du cours canonique : pas d'ELI5 ⇒ pas de cours validé ⇒ la vraie
demande est le cours). `quiz` non émis en v1 (hors périmètre de routage ADR-0027).

**Mécanique** : `resolve_action` **remonte un signal** dans `ActionResult.meta["content_request"]`
= `{skill_id, content_kind}` (métadonnée pure, pas de texte — §1c préservé). Le `service` l'émet
**après** le tour, dans un `try/except` qui **n'échoue jamais** le tour de chat (une file pleine ne
doit pas casser une conversation). L'honnêteté du `reply` (« je le note pour Papa ») est **déjà**
livrée par l'ADR-0027 ; cet addendum la rend **vraie** (la note devient une trace).

### 3. Papa : un **badge sur la Couverture** (lecture), mutations **hors `production`**

- **Décision commanditaire** : la file se voit **sur la Couverture**, pas dans un panneau séparé —
  c'est là que Papa décide déjà quoi produire. Un badge **« ⭐ réclamé par Massimo (n) »** sur la
  ligne d'une leçon dont une notion porte des demandes `pending` ; un survol/clic liste les demandes
  (notion + type) avec **Fait** / **Ignorer**.
- **Invariant read-only de `production` PRÉSERVÉ, strictement** : `coverage.py` n'est **pas touché**.
  L'agrégat des demandes est lu par un endpoint **du module `content_requests`**
  (`GET /api/content-requests`, `require_parent`) et **fusionné côté client** par `skill_id` avec la
  matrice (via `CoverageNotionItem.skill_id`). Les mutations `done`/`dismissed` passent par
  `PATCH /api/content-requests/{id}` (module `content_requests`), **jamais** par `production`.
- `notion_requests` reste **inchangé** (notion hors programme, texte libre, `skill_id = None`) : les
  deux gestes coexistent sans se marcher dessus.

## Périmètre

**Dans le lot** : table + migration (appliquée sur Postgres dev) ; module `content_requests`
(model, service, schémas, router Papa) ; émission chat (2 déclencheurs) ; client Papa + badge
Couverture (lecture fusionnée + mutations). Tests : dédup/ré-activation, émission (type manquant +
notion vide → cours), badge lu, mutations hors `production`.

**Hors lot** : émission depuis d'autres surfaces que le chat (Papa verra le champ `source` évoluer
sans migration) ; priorisation/tri avancé de la file ; production **en lot** depuis le badge
(reste le chantier « Compléter le chapitre » déjà marqué désactivé sur la Couverture).

## Conséquences

### Positives
- Le geste « demande à Papa » de l'ADR-0027 §3 devient **réel et dédupliqué** ; l'honnêteté du chat
  cesse d'être un cul-de-sac.
- **Invariant `production` intact** : `coverage.py` inchangé, fusion côté client, mutations dans le
  module de demandes. Deux sémantiques de demande (`notion_requests` vs `content_requests`) restent
  **séparées**.
- Aucun nouvel `event_type`, aucun XP : la demande est une **ligne de file**, pas un événement
  d'apprentissage.

### Négatives / coûts
- **Amende le « zéro table » de l'ADR-0027** : +1 table, +1 migration (assumé — c'était l'objet du
  Point ouvert n°4).
- **Granularité du badge = la notion, pas la cellule exacte** : une demande `fiche` sur une notion
  s'affiche au niveau de la **leçon** qui porte cette notion (la fiche est leçon-centrée, la demande
  notion-centrée) — le popover lève l'ambiguïté (il nomme la notion **et** le type).
- La qualité de l'émission dépend de la résolution notion (comme tout l'ADR-0027) : une notion hors
  référentiel ne crée pas de `content_request` (elle relève de `notion_requests`).

## Correctifs découverts au test live (2026-07-30)

Le test live a révélé que l'émission dépendait d'un `available` **mensonger** et que le garde-fou
« jamais générer » n'était pas tenu par le `reply`. Deux correctifs intégrés (détail
`TROUBLESHOOTING.md`), un point laissé ouvert :

- **`notion_panel` — honnêteté du cours** : `cours available` exige désormais `content_markdown`
  réel (pas seulement une leçon validée). Sans quoi une notion « à cours vide » (fréquent en dev)
  n'émettait aucune demande. Le signal « notion vide → cours » vaut sur **tous** les chemins du
  résolveur d'action (menu ET `tool=eli5`), ELI5 ne comptant jamais comme contenu durable.
- **Prompt `chat_v2` — le garde-fou §3 porté dans le prompt** : `CHAT_SYSTEM`/`CHAT_TURN_PROMPT`
  interdisent explicitement à ZETIS d'écrire lui-même le cours/les définitions/la conjugaison ; il
  oriente vers ELI5 ou une ressource validée. **Mitigation, pas garantie dure** (petit moteur local).

**2e test live (même jour) — 2 décisions supplémentaires (validées commanditaire) :**

- **Résolveur strict (n°1)** : `chat_skill_resolution_min_score` **0.55 → 0.72**. `nomic-embed-text`
  donnait ~0.68 à des requêtes sans rapport (« verbe être en espagnol » → « Registre de langue »),
  les vrais matchs à 0.83+ ; seul le score absolu sépare (la marge non). Une requête sans notion
  correspondante renvoie `None` → « je ne le trouve pas dans ton programme ». **Fini le contenu du
  mauvais sujet montré avec aplomb.**
- **ELI5 n'est plus une porte pour une notion sans cours** : ELI5 dégrade vers le modèle sans cours
  validé (ADR-0011) — l'y router contredit « orienter vers l'existant validé ». L'orchestrateur
  n'offre ELI5 (menu ou route directe) **que si un cours validé existe** ; sinon honnêteté + demande
  de cours à Papa. ELI5 **l'outil** (ouvert depuis la galaxie) reste inchangé (ADR-0024).

## Notifications + inbox Papa (2e message commanditaire, 2026-07-30)

« Si ZETIS n'a pas la réponse → il le dit + envoie une requête à Papa ; Papa a des **notifications**
et la **liste des demandes en attente**. » Livré :

- **Notification** : `GET /api/content-requests/count` → pastille (accent) sur l'entrée sidebar
  **« Demandes de Massimo »**, rafraîchie à chaque triage (event `CONTENT_REQUESTS_CHANGED_EVENT`,
  d'où qu'il vienne — page inbox OU popover Couverture).
- **Inbox** : page **`/demandes`** (`DemandesPage`) — demandes `pending` groupées par matière, chacune
  = notion + type + **Fait**/**Ignorer** + lien « Produire dans la Couverture → » (la production
  reste un geste de Papa dans les surfaces existantes ; les mutations passent par `content_requests`,
  jamais par `production`). `subject_name` ajouté à la sortie de `list_requests` pour le groupement.
- La production **en lot** depuis l'inbox reste hors périmètre (chantier « Compléter le chapitre »).

## Volet HORS-PROGRAMME (2026-07-30) — ferme la moitié symétrique du Point ouvert n°4

Le `content_requests` couvre « notion DU programme, contenu manquant ». Le cas **inverse** — Massimo
réclame une notion **PAS au programme** (« le verbe être en espagnol » en 4e) — restait mort : le
chat répondait « je ne le trouve pas » **sans rien enregistrer**. Constat clé : le mécanisme
`notion_requests` (précédent ELI5) existait, mais (a) le chat ne l'alimentait pas, et (b) côté Papa
« ✓ Ajoutée » ne faisait **QUE** changer le statut — **aucune création** (ni Skill, ni leçon, ni
cours ; le texte de la demande n'allait nulle part). Décisions commanditaire :

- **Chat émet en OPT-IN** : `resolve_skill` → `None` → le chat propose une carte **`request_notion`**
  (`chat/actions.py`, `ChatAction.kind`) « Demander à Papa d'ajouter « X » » ; le tap crée un
  `notion_request` via le producteur ELI5 existant (`POST /api/ai/eli5/request-notion`). ZETIS ne
  fabrique rien — il transmet, et **remercie**. `chat_tool_response` seul (aucun event neuf).
- **Inbox Papa UNIFIÉE** (`/demandes`) : deux sections — **« À ajouter au programme »**
  (`notion_requests`) et **« Contenu à créer »** (`content_requests`) ; **une** pastille de
  notification = **somme** des deux files (`GET /api/notion-requests/count` + content count, event
  `DEMANDES_CHANGED_EVENT`).
- **Deux ponts de création réels** (une notion hors-programme n'a pas de matière → Papa la fournit
  via modale) :
  - `POST /api/notion-requests/{id}/add-to-program {subject_id}` → `_upsert_skills` (la notion
    devient une `Skill`) ;
  - `POST /api/notion-requests/{id}/create-lesson {chapter_id, generate_course?}` →
    `create_manual_lesson` (Skill + Leçon + lien en une passe) + option cours (`generate_lesson_content`,
    local ; la leçon repasse alors en `draft` — un cours généré non relu ne se sert pas, gate ADR-0009).
  Les deux réutilisent les briques curriculum existantes ; la demande passe `added`.
- **Vérifié live end-to-end** : chat « verbe être en espagnol » → carte → `notion_request` → inbox Papa
  → « Créer la leçon » (Français/Grammaire) → leçon + Skill créées, demande `added`.
- **Correctif UX (notions orphelines)** : « Ajouter au programme » (comme le skills-backfill) crée une
  `Skill` **sans leçon**, donc **invisible** dans la page Programme (leçon-centrée) → « je l'ai ajoutée
  mais je ne la vois nulle part ». Ajout d'un panneau **« 🧩 Notions sans leçon »** par matière sur la
  page Programme (`GET /api/subjects/{id}/orphan-notions` = Skills du niveau année active sans
  `LessonSkill` ; `OrphanNotionsPanel`). Répare aussi le trou **pré-existant** du skills-backfill.
  Vérifié live (« les nombres complexes » visible sous Mathématiques).

## Suivi
- **Docs** : ligne `DECISIONS.md` ; met à jour l'ADR-0027 §Points ouverts n°4 (« tranché : voir
  addendum ») et `page-chat.md §Garde-fous` (« mécanisme différé » → « enregistré dans
  `content_requests` » ; hors-programme → `notion_requests` depuis le chat).
- **Invariants testés** : dédup `(student, skill, kind)` = une ligne ; ré-activation d'une ligne
  `dismissed`/`done` sur nouvelle demande ; émission (a) type manquant et (b) notion vide→cours ;
  émission **best-effort** (une exception d'émission n'échoue pas le tour) ; mutations `done`/
  `dismissed` **hors `production`** ; `coverage.py` non modifié (badge = fusion client).
- **Prompt de slice** : `prompts/claude-code/prompt-content-requests.md`.
