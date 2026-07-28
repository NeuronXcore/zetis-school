# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Une branche en cours : `docs/couverture-production`** — 4 commits, rien de poussé, aucune PR.
Les chantiers `activite` et `motivation` des sessions précédentes sont **mergés** (voir repères).

### Chantier « Couverture de production » (ADR-0023) — CLOS

Quatre commits, dans cet ordre (chacun dépend du précédent) :

1. **`8c993b6` docs** — ADR-0023 + addenda ADR-0011 §E (fraîcheur) et §F (provenance), 4 ADR
   amendés, maquette + spec + 2 prompts de slice.
2. **`02f37a9` engagement** — prérequis : module neutre `engagement` + exception « mission
   engagée » sur les chemins d'achèvement des mindmaps.
3. **`586b202` production (backend)** — `is_stale`, provenance (migration `d5e6f7a8b9c0`),
   modèle de lecture + 2 endpoints `require_parent`.
4. **(ce commit) frontend + correctifs** — page Couverture, liens ciblés, validation en lot,
   et deux défauts de schéma/UX corrigés (voir ci-dessous).

**Migrations appliquées sur la DB de dev** : `d5e6f7a8b9c0` (provenance, 6 tables, reprise NULL)
et `e6f7a8b9c0d1` (horodatages `fiches`/`mindmaps`).

**Vérifié** : 518 back + 203 Papa verts, `tsc -b` et `vite build` verts, un seul head alembic.
Modèle de lecture éprouvé sur **Postgres réel** (69 leçons, 18 requêtes, 79 ms — aucun N+1).

⚠️ **Ce chantier n'a PAS été vérifié à l'écran de bout en bout** : la session Papa du navigateur
intégré a expiré en cours de route, et l'agent ne saisit pas de mot de passe. Le user a testé
manuellement et a remonté 3 défauts réels que les tests ne voyaient pas (cf. `TROUBLESHOOTING.md`
§ chantier `couverture`). **La prochaine session doit commencer par une passe visuelle.**

### Ce que le user a remonté et qui reste ouvert

- **Colonne Fiche** : le lien ciblé surligne la carte mais n'ouvre pas sa modale — volontaire
  (c'est un ÉDITEUR, pas une vue), à trancher si la symétrie avec quiz/mindmap est préférée.
- **Ouverture auto de la modale mindmap** : ajoutée sur un malentendu de ma part (le user parlait
  de la colonne *Cartes*, pas *Mindmap*). Défendable en soi — à confirmer ou retirer.
- **5 générations non voulues** dans la DB dev (jobs #316→#320), **gardées** sur décision du user.
  « Calculs avec priorités et nombres relatifs » reste en `draft` : son cours vient d'être rédigé,
  le gate ADR-0009 §A joue son rôle — **ne pas la revalider mécaniquement**.

### Derniers chantiers mergés (repères)

- **Conseil de classe IA (ADR-0020) + équipement de mission (ADR-0021)** — PR #48 (`639209e`).
  Module backend `reports` : narration LLM **locale** sur le service d'évidence, rapport **persisté**
  (`council_reports` + `evidence_snapshot_json`, migration `b8c9d0e1f2a3`), recommandations typées →
  missions via Commander ; **équipement** = « Créer ces missions » génère + auto-valide le kit
  (cours/fiche/SRS/quiz/mindmap), **jamais de régénération** de l'existant. Front Papa
  (`ConseilClasseIAPage` + `lib/councilClass.ts` + `hooks/useCouncilClass.ts`) + liste missions
  Massimo (`origin` papa/zetis + badge ✨ new).
- **Missions ADR-0017/0018/0019** (moteur, Commander, step mindmap, frontends) — PR #46.
- **`generate_revision` mono-notion** (ADR-0017 §5) — PR #47.

### DÉCISIONS ACTIVES (figées — ne pas rouvrir ; détail dans les ADR)

- **Couverture** : `absent` se déduit de **l'existence de la ligne**, jamais d'une date — une
  date nulle rend seulement le *périmé* indécidable. Le **cours n'entre pas** dans le pourcentage
  de dérivés (il en est la condition). **Aucun agrégat de provenance** (§F.2), aucun tri, aucun
  score par matière : la page répond à « où j'en suis », elle ne produit pas un classement.
- **§F** : `mark_validated` est l'**unique** point d'écriture de `validated` ; toute action
  groupée écrit `parent_bulk` **sans exception** ; `system` est **strictement réservé au quiz**
  (test-verrou). Une leçon déjà validée n'est jamais re-tamponnée par un lot.
- **Vocabulaire** : « Mindmap » ≠ « carte (de révision) ». Ne jamais écrire « carte mentale »
  dans l'UI Papa — les deux colonnes sont voisines dans la matrice.
- **Capsules** : non générables en un clic **par construction** (l'API exige une `instruction`
  écrite par Papa). Depuis la Couverture, on ouvre le compositeur pré-rempli — avec `skill_id`,
  sans quoi la capsule ne compte dans aucune fraction.

- **Activité — 2 `event_type` RÉUTILISÉS au lieu d'être dupliqués.** La spec demandait
  `eli5_reverse` et `mission_completed` ; le code émettait déjà, au même instant et pour le même
  acte, `reverse_eli5` (`eli5/service.py`) et `mission_verdict` (`missions/service.py`, posé là
  où `mission.status` passe à `completed`). Les ajouter aurait créé **deux événements pour un
  seul acte** → double comptage dans la heatmap ; les renommer aurait cassé leurs lecteurs
  (`evidence.VERDICT_EVENT`, `completed-today`). Constantes `EVENT_ELI5_REVERSE` /
  `EVENT_MISSION_COMPLETED` dans `activity/events.py`. **7 hooks neufs, pas 9.**
- **Activité** : `POST /api/missions/{id}/complete` de la spec **n'existe pas** et n'a pas été
  créé — les missions se terminent par étape (`/{id}/steps/{step_id}/complete`).
- **Activité** : sessions **jamais stockées** (reconstruites à la lecture) ; `xp_events` et
  `learning_events` **jamais en UNION** ; `days_inactive` toujours calculé **toutes matières**,
  même sous filtre.
- **ADR-0020** : rapport Conseil **persisté** (LLM non rejouable) ; `skill_id` **ancrés** sur
  l'évidence ; 100 % local ; Papa-only ; recommandation → missions **mono-notion** via Commander.
- **ADR-0021** : popup Papa = approbation → **auto-validation** du kit (soupape §5ter bornée) ;
  **jamais de régénération** d'une pièce déjà créée (même `pending`) — on valide l'existant + génère
  le manquant ; équiper **avant** de créer la mission.
- **Missions Massimo** : champ d'affichage `origin` (papa/zetis), **pas** l'enum `created_by`
  (pilot-only) ; badge « new » = mission `planned`.

### PROCHAIN PAS

1. **Passe visuelle sur `/couverture`** (dev : front `5178`, back `8002`, `--reload` actif).
   C'est le point faible de ce chantier — tout le reste est couvert par des tests.
2. Pousser la branche + PR.
3. Puis, au choix : **file de relecture** (prérequis dur du cron ADR-0023 — automatiser la
   fabrication d'un goulot est le seul vrai risque), ou **production en lot** (§7 : deux passes
   non fusionnables, cours puis équipement), dont le bouton « ⚡ Compléter le chapitre » marque
   déjà l'emplacement, désactivé.

### Repères (orientation)

- `graphify explain "production"` / `"provenance"` / `"engagement"`. Back :
  `app/modules/production/` (modèle de lecture), `app/modules/provenance.py` (unique écrivain de
  la validation), `app/modules/engagement/` (exception mission engagée). Front papa :
  `CouverturePage.tsx`, `components/couverture/`, `lib/pilotageLinks.ts`, `hooks/useCoverage.ts`.
- Décisions : `DECISIONS.md` (index ADR complet 0001→0023, avec les 3 addenda ADR-0009/0011) +
  `docs/decisions/`. Modèle : `DATA_MODEL.md`. API : `API_SPEC.md`. Pièges : `TROUBLESHOOTING.md`.
- Données de test laissées en DB dev (council_report id 1, missions manual, kits générés) — sans
  conséquence.
