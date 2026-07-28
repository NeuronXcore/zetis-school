# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Aucune branche en cours — on repart de `main`.** Le chantier « Couverture de production »
(ADR-0023) est **MERGÉ** : PR [#54](https://github.com/NeuronXcore/zetis-school/pull/54), merge
commit `dc82f9c`, **7 commits conservés individuellement** (merge commit délibéré, pas de squash :
chacun est autonome et revertable seul, ce qui comptait surtout pour `chore(assets)`). Branche
`docs/couverture-production` supprimée en local et sur `origin`.

⚠️ **Ne pas ré-implémenter** la Couverture : elle est complète et sur `main` — backend
(`production` + `engagement` + provenance), page Papa, passe visuelle, convention d'assets.

### Branches restantes — toutes vérifiées, toutes fusionnées (2026-07-28)

Quatre branches subsistent dans le dépôt. **Aucune ne porte de travail absent de `main`** — c'est
vérifié, pas supposé. Elles peuvent être supprimées sans risque ; elles ne l'ont pas été faute de
demande.

| Branche | Preuve | |
|---|---|---|
| `feat/activite-backend` (local + `origin`) | PR #52 · SHA fusionné `1284deb` = tip | ✅ |
| `feat/motivation-massimo` (local + `origin`) | PR #53 · SHA fusionné `befe91e` = tip | ✅ |
| `origin/mindmap` | tip ancêtre de `main` | ✅ |
| `origin/mission` | PR #46 · tip ancêtre de `main` | ✅ |

⚠️ **Deux pièges de diagnostic**, à connaître avant de refaire ce contrôle :

- **`git branch --merged` ne liste PAS `activite` ni `motivation`.** Les PR #52 et #53 ont été
  **squashées** : les commits d'origine ne sont donc pas ancêtres de `main`, seul leur contenu y
  est (`6e7cb78`, `40bcef8`). L'outil dit vrai sur la topologie et faux sur le fond — s'y fier
  seul ferait conclure à du travail perdu.
- **Le diff de contenu vs `main` n'est pas un test** : 1188 et 484 lignes d'écart, mais c'est
  `main` qui a avancé depuis sur les mêmes fichiers. Comparer un tip figé à une trunk qui bouge ne
  prouve rien.

Le seul test qui tranche pour une branche squashée : **`gh pr view <n> --json headRefOid`** (le SHA
que GitHub a réellement fusionné) comparé au tip local **et** distant. S'ils sont identiques, rien
n'a été poussé après la fusion.

### Session 2 (2026-07-28) — passe visuelle `/couverture` + rangement des assets

La passe visuelle demandée au « prochain pas » a été faite, **pilotée par le user** qui regardait
la page dans son propre navigateur (l'agent n'a jamais eu de session Papa : il ne saisit pas de
mot de passe). Quatre retours, quatre livrables — détail dans `docs/frontend-papa/page-couverture.md`
§Passe visuelle :

1. **KPI cliquables** → chacun ouvre son complément (« 27/78 cours » ouvre les 51 restants). La
   pilule « 🔒 Bloquées » a été **scindée** en `🔒 Non validées` / `📝 Sans cours` : elle mélangeait
   les deux causes, or `blocked_no_course` ne contient que des leçons *validées* — « Leçons
   validées » ne pouvait pas pointer dessus sans se contredire.
2. **Pictogrammes de matière** sur les en-têtes de matrice **et** en pastilles de filtre (le
   `<select>` a disparu). `SubjectPictogram` extrait de `SubjectFilterChips` → un seul rendu.
3. **Expanders par matière** : repliés en vue d'ensemble, dépliés dès qu'un filtre ou une matière
   est demandé, avec rappel d'anomalies (`🔒 4  ⏳ 2`) calculé sur la matière **entière**.
4. **Icône `CouvertureIcon`** (fournie par le user) + respiration lumineuse, aux 3 endroits qui
   désignent la Couverture (en-tête animé, sidebar, relais Dashboard).

**Rangement des assets, hors chantier mais demandé explicitement** (« mets de l'ordre », puis
« go ») : ~9,8 Mo retirés des bundles (Massimo 10,3 Mo → 1,6 Mo ; Papa 2,1 Mo → 1,0 Mo), 11
originaux rapatriés dans `assets/brand/icons/`, 2 doublons exacts supprimés, planche de contact
sortie du glob. La **règle a été inversée** dans `assets/brand/README.md` : les visuels importés
vivent dans `src/assets/`, pas dans `public/assets/` — c'est ce que le code faisait déjà, la doc
avait tort. Voir §DÉCISIONS ACTIVES.

**Vérifié** : 212 Papa + 111 Massimo verts, `tsc -b` et `vite build` verts sur les deux apps.
L'icône et son animation ont été prouvées sur un **banc d'essai isolé** (le navigateur intégré
n'étant pas connecté) : capture + `getAnimations()`. Le reste de la page **n'a toujours pas été vu
de bout en bout par l'agent**.

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
- **Assets (session 2)** — l'original pleine résolution va dans `assets/brand/`, la **réduction**
  (suffixe `_256` / `_384`, dimensionnée sur le rendu réel **× 3** car Massimo tourne sur iPhone)
  va là où le code l'importe : `packages/ui/src/assets/` si les deux interfaces s'en servent,
  `apps/frontend-<app>/src/assets/` sinon. **`public/assets/` n'est plus le point de dépôt** — un
  `import` TS fait échouer le build si le fichier manque, hashe le nom pour le cache, et sort du
  bundle ce qui n'est plus utilisé. Règle complète : `assets/brand/README.md`.
- **Couverture — KPI** : un KPI ouvre son **complément**, pas ce qu'il compte (un chiffre atteint
  ne se travaille pas). Les cartes restent cliquables même à zéro (choix du user).
- **Couverture — expanders** : repliés en vue d'ensemble, **dépliés dès qu'on demande quelque
  chose d'explicite** (pilule d'état ou matière). On ne cache jamais ce qui vient d'être demandé.
  Les rappels d'anomalies sont des **comptes**, jamais un pourcentage — le « aucun score par
  matière » ci-dessus tient toujours.
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

1. **Trancher le sort de la photo de Massimo** —
   `apps/frontend-massimo/src/assets/app/ChatGPT Image 5 juil. 2026, 14_36_01.png` (2 Mo, 1254 px)
   est une **photo du visage de l'enfant** montée dans une icône de progression. Elle est
   versionnée, **importée nulle part** (elle ne pèse que dans git). Laissée intacte
   volontairement : l'agent ne décide pas seul du sort d'une image d'un mineur. Trois options —
   garder / renommer et ranger dans `assets/brand/icons/` / sortir du dépôt.
2. **Créer une branche** pour le chantier suivant : `main` est propre et à jour, plus rien n'est
   en cours (la PR #54 a tout emporté).
3. Puis, au choix : **file de relecture** (prérequis dur du cron ADR-0023 — automatiser la
   fabrication d'un goulot est le seul vrai risque), ou **production en lot** (§7 : deux passes
   non fusionnables, cours puis équipement), dont le bouton « ⚡ Compléter le chapitre » marque
   déjà l'emplacement, désactivé.
4. Restent ouverts, sans urgence : le **test flaky** `ProgrammePage` (barre de progression
   temporisée, cf. `TROUBLESHOOTING.md`), et la **vérification à l'écran de bout en bout** de la
   Couverture, que l'agent ne peut pas faire sans session Papa.

### Repères (orientation)

- `graphify explain "production"` / `"provenance"` / `"engagement"`. Back :
  `app/modules/production/` (modèle de lecture), `app/modules/provenance.py` (unique écrivain de
  la validation), `app/modules/engagement/` (exception mission engagée). Front papa :
  `CouverturePage.tsx`, `components/couverture/`, `lib/pilotageLinks.ts`, `hooks/useCoverage.ts`,
  `lib/coverageFilters.ts` (fonctions pures : pilules + `subjectAnomalies`),
  `components/CouvertureIcon.tsx`. Partagé : `packages/ui/src/components/subject-pictogram.tsx`.
- Visuels : `assets/brand/README.md` §Règle principale (source de vérité de la convention).
- Décisions : `DECISIONS.md` (index ADR complet 0001→0023, avec les 3 addenda ADR-0009/0011) +
  `docs/decisions/`. Modèle : `DATA_MODEL.md`. API : `API_SPEC.md`. Pièges : `TROUBLESHOOTING.md`.
- Données de test laissées en DB dev (council_report id 1, missions manual, kits générés) — sans
  conséquence.
