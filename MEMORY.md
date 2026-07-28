# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier ACTIF : branche `feat/activite-backend`** — *Activité, slices A + B + C*.
**Non mergé, non poussé.** Trois commits (A = backend, B = frontends, C = cahier de bord).
Le chantier « Activité » est **CLOS** côté code.

### Slice C (cahier de bord · vue Sessions) — faite et vérifiée dans le navigateur

- **La page et la route `/cahier` EXISTAIENT déjà** (le prompt supposait de les créer). Son
  contenu était un mock des volets IA (timeline pédagogique, note parent) — précisément ce que le
  prompt met hors périmètre. Mock **remplacé** par la vue Sessions (« Lot 1 » de la page selon la
  spec) : laisser du faux à côté de données réelles aurait induit en erreur. Les volets IA
  restent au backlog.
- `lib/sessions.ts` (pur, testé) : `monthRange`, `shiftMonth`, `buildMonthGrid`,
  `latestDayWithSessions`, `periodTotals`, `dayActiveMinutes`. Formatage réutilisé de
  `lib/heatmap.ts` (rien de redéclaré).
- **REFONTE en calendrier mensuel** (décision Papa du 2026-07-27, POSTÉRIEURE à la maquette) :
  la liste par jour + pastilles 7/14/30 a été remplacée par un `MonthCalendar` cliquable
  (7 colonnes, cases voisines inertes pour l'alignement, futur atténué, teintes
  **transparentes** pour que le numéro reste lisible, avance bloquée au-delà du mois courant,
  sélection par défaut = dernier jour actif du mois). `page-cahier-bord.md` §Vue Sessions amendé,
  maquette **annotée comme périmée pour cette vue** (sa vue Dashboard reste valide). Les
  helpers 7/14/30 devenus morts ont été supprimés avec leurs tests.
- `components/activity/` : `SessionDayBlock` + `ActivityEntryRow` **extrait** et partagé avec le
  panneau détail-jour du dashboard (une ligne de journal se lit pareil aux deux endroits).
- **Pont activé** : « Ouvrir dans le cahier de bord » → `/cahier?date=`, le cahier ouvre le MOIS
  de ce jour avec la date sélectionnée ; changer de mois/matière/date relâche la cible.

**Vérifié LIVE** : KPI du mois, alignement du calendrier (1er juillet = mercredi), intensités,
futur atténué, flèche « mois suivant » désactivée sur le mois courant, clic sur une date →
détail, navigation vers juin → re-sélection auto du dernier jour actif, bornes de session en
heure de Paris, filtre matière, pont depuis le dashboard. Zéro erreur console.

### Slice B (frontends) — faite et vérifiée dans le navigateur

- **Télémétrie Massimo** : `lib/telemetry.ts` (fire-and-forget, `keepalive`, échec silencieux) +
  `hooks/usePageviewTelemetry.ts` monté dans `MassimoLayout` (donc sous `RequireAuth` : la page
  de login n'est pas tracée). Envoie le `pathname` seul. **Aucune UI côté Massimo.**
- **`subjectIcons` extrait vers `@zetis/ui`** : le résolveur ET les 17 PNG étaient DUPLIQUÉS dans
  les deux apps (le prompt n'en annonçait qu'une copie). Assets déplacés dans
  `packages/ui/src/assets/subjects/`, glob rendu **relatif** (un glob `/src/assets/...` se
  résoudrait dans l'app consommatrice), les deux `lib/subjectIcons.ts` **ré-exportent** →
  les 14 sites d'import inchangés.
- **`SubjectFilterChips`** (contrôlé, `aria-pressed`) et **`ActivityEventIcon`** dans `@zetis/ui`,
  réutilisés tels quels par la slice C.
- **Bloc Régularité** (`components/activity/`) : heatmap 26×7 en CSS pur, `lib/heatmap.ts` (pur,
  testé), KPI à delta, badge de décrochage ≥ 4 jours, panneau détail-jour inline en fetch
  paresseux. Bouton « Ouvrir dans le cahier de bord » **pas encore posé** — la slice C crée la
  route et l'activera.

**Vérifié LIVE** (backend `:8001`, papa `:5175`, massimo `:5176`) : KPI réels avec deltas,
heatmap peuplée, clic-jour → journal réel, filtre matière propagé (`subject_id` dans les logs),
navigation Massimo → 3 `page_viewed` en base aux bonnes heures de Paris, zéro erreur console.
Deux défauts vus à l'écran et corrigés : « Lundi 6 **J**uillet » (`capitalize` → `first-letter`)
et matières affichées en **slug** au lieu du nom.

⚠️ **`lucide-react` n'existe pas dans le monorepo** alors que le prompt B demandait des icônes
Lucide ET « zéro dépendance nouvelle ». Tranché par du **SVG inline** (`activity-icons.tsx`,
géométrie Lucide) : seul ce fichier changerait si la dépendance était ajoutée.

**Ce qui est fait** — le serveur journalise l'activité et la projette pour Papa :

- **Specs installées** : `docs/frontend-papa/page-dashboard.md` (§Bloc Régularité, §Alimentation
  de `learning_events`) et `page-cahier-bord.md` (§Vue Sessions) étaient des stubs de 40 lignes ;
  les versions complètes ont été apportées par le user en cours de session, avec la maquette
  `docs/frontend-papa/mockup/mockup-activite-massimo.html` (référence visuelle des slices B/C).
- **Module `app/modules/activity/`** : `events.py` (helper `log_learning_event` calqué sur
  `award_xp` + dédupe + résolveur leçon→matière), `timeutils.py` (bucketing Europe/Paris),
  `service.py` (projections pures + lectures), `schemas.py`, `router.py`.
- **7 hooks posés** (login, page_viewed, lesson_viewed, fiche_viewed, quiz_attempted ×2 surfaces,
  eli5_requested, review_attempted) — voir « décisions » ci-dessous pour les 2 restants.
- **4 routes** : `POST /api/telemetry/pageview` (Massimo, `require_child` **créé**),
  `GET /api/parent/activity/{heatmap,days/{date},sessions}` et `GET /api/parent/dashboard`
  (surface **neuve** : il n'existait aucun endpoint dashboard).
- **Migration `d0e1f2a3b4c5`** : index `(student_id, created_at)` sur `learning_events` — la
  table n'avait aucun index hors PK. **APPLIQUÉE sur la DB de dev** (index vérifié via `\d`).
- Constantes en config (`session_gap_minutes`, `active_gap_cap_minutes`,
  `activity_projection_version`…), types `packages/types/src/activity.ts`, docs `API_SPEC.md` +
  `DATA_MODEL.md`.

**Vérifié** : tests back verts (zéro régression), `tsc -b` vert sur les deux frontends. Le test
du décrochage a été **durci puis mutation-testé** (il échoue bien si le filtre matière contamine
`days_inactive`).

**VÉRIFIÉ LIVE sur Postgres réel** (TestClient monté sur la vraie DB, sans second serveur) :
migration appliquée et index confirmé ; parcours Massimo → login +1, dédupe `page_viewed`
(4 POST → 3 événements, puis 2 au passage suivant), dédupe `lesson_viewed` (2 GET → 1, puis 0 le
lendemain du même jour), matière résolue (`francais`), `422` sur route trop longue et sur
timestamp client, `403` sur les routes parent en rôle enfant ; lectures Papa → heatmap 7 jours,
journal du jour, 1 session reconstruite, KPI à delta. **Données de test laissées dans la DB dev**
(quelques `login`/`page_viewed`/`lesson_viewed` du 2026-07-27).

**Corrigé grâce au live** : les sessions n'exposaient que de l'ISO UTC alors que le `time` de
chaque événement est pré-formaté Europe/Paris → une carte pouvait afficher `19:07` en en-tête et
`21:07` sur sa première ligne selon le fuseau du navigateur. Ajout de `started_time`/`ended_time`
(additif, testé).

### KPI dépliables (demande Papa, après les 3 slices)

Les cartes KPI étaient inertes. Elles s'ouvrent désormais sur un **panneau de détail inline**
(`KpiBreakdown`, une seule carte ouverte à la fois), alimenté par `lib/kpiBreakdown.ts` (pur,
testé) qui REGROUPE des valeurs déjà servies — aucun recalcul depuis les événements bruts.

- Dashboard : sessions/jour, temps actif/jour, XP/jour, missions terminées de la semaine.
  Chargement **paresseux** au premier dépliage (`heatmap?weeks=1` + sessions de la semaine),
  conservé ensuite. `week_start` vient du payload KPI serveur.
- Cahier : sessions/jour, temps actif/jour, et **durées de chaque session triées** (la dispersion
  éclaire la moyenne). Zéro requête de plus : le mois est déjà chargé.
- **Lacunes ouvertes / notions consolidées rendues RÉELLES** (module backend **`progress`** créé,
  `GET /api/parent/progress/{gaps,consolidated}` + compteurs dans le payload dashboard). Les
  routes `/gaps` et `/progress/summary` de la spec produit **n'ont jamais existé en code**.
  Vocabulaire figé : lacune ouverte = `open|in_progress` (même définition que les missions de
  remédiation) ; notion consolidée = `mastered` (≥ 90), `solid` NON compté.
  **Servis sans delta** : ce sont des stocks, et le modèle n'a ni `resolved_at` sur `gaps` ni
  horodatage de bascule sur `skill_mastery` → un écart serait faux. Type `KpiCount` distinct de
  `KpiValue` pour rendre l'absence explicite.
- **Garde de version du payload** (`isCompleteKpis`, testée) : un backend antérieur qui ne sert
  pas les stocks blanchissait TOUTE la page (incident réel observé en vérif live). Décalage de
  version → repli sur les vignettes mock, plus de crash.
- `RegularityCard` reçoit désormais `subjects` en prop (évite deux `GET /api/subjects` sur le
  même écran).

### Résolveur « leçon → matière » unifié

`app/modules/subjects/resolver.py` : implémentation UNIQUE, remplaçant trois jumeaux privés
(`fiches`, `mindmaps`, journal d'activité). Deux formes selon le besoin réel de l'appelant —
`subject_id_for_lesson` (id → id, pour les routers et le journal) et `subject_of_lesson`
(leçon chargée → `Subject`, pour fiches/mindmaps qui veulent `.name`/`.slug`) : rendre un objet
au journal lui ferait payer un `db.get` pour rien. Solde −88/+12 lignes. Test-verrou qui
n'importe AUCUN des trois consommateurs (preuve de neutralité) et couvre les deux branches de
rattachement d'un chapitre (`school_year_subject_id` | `theme_id`) — le seul point où les
jumeaux pouvaient diverger.

**PROCHAIN PAS** : rien de codé en attente. Reste, hors code : pousser la branche + ouvrir la PR.

> ⚠️ Les sections ci-dessous datent d'avant plusieurs chantiers mergés depuis (missions champion
> ADR-0022, ZETIS Clip, années scolaires) : les considérer comme des repères historiques, pas comme
> l'état de `main`. Se fier à `git log` pour l'état réel.

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

### PROCHAIN PAS (candidat — à cadrer avant de coder)

- **Missions croisées multi-matières** (esprit EPI) : c'est le **gros morceau** restant. Le Conseil
  de classe est la vue transversale légitime pour les proposer (ADR-0017 §6). ⚠️ Elles **cassent
  l'invariant de verdict mono-notion** (ADR-0017 §5bis) → **écrire un ADR dédié d'abord**
  (dérivation matières depuis les `Skill` des étapes, composition, verdict, porte manual vs Conseil).
- Plus petits : « évolution récente » comparative (slice 2 de l'ADR-0020), réglage
  `COUNCIL_PROMPT_VERSION` après usage.

### Repères (orientation)

- `graphify explain "reports"` / `"missions"`. Back : `app/modules/reports/`, `app/modules/missions/`,
  `app/modules/evidence/`. Front papa : `ConseilClasseIAPage.tsx`. Front massimo : `MissionsPage.tsx`.
- Décisions : `DECISIONS.md` (index ADR complet 0001→0021) + `docs/decisions/`. Modèle :
  `DATA_MODEL.md`. API : `API_SPEC.md`. Pièges : `TROUBLESHOOTING.md`.
- Données de test laissées en DB dev (council_report id 1, missions manual, kits générés) — sans
  conséquence.
