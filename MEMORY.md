# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**DEUX branches en attente, à pousser et merger DANS CET ORDRE** (la seconde dépend de la
première) — rien n'est poussé, aucune PR ouverte.

### 1. `feat/activite-backend` — chantier « Activité » (CLOS)

Sept commits. Journal `learning_events` alimenté (7 hooks + télémétrie), projections parent
(heatmap, détail-jour, sessions), bloc Régularité du dashboard, page Cahier de bord en
**calendrier mensuel**, KPI tous dépliables, module `progress` (lacunes/notions réelles),
résolveur « leçon → matière » unifié. Migration `d0e1f2a3b4c5` appliquée sur la DB de dev.

Décisions figées : sessions **jamais stockées** (reconstruites à la lecture) · `xp_events` et
`learning_events` **jamais en UNION** · `days_inactive` toujours toutes matières · deux
`event_type` préexistants RÉUTILISÉS (`reverse_eli5`, `mission_verdict`) au lieu d'être dupliqués
· `POST /api/missions/{id}/complete` n'existe pas et n'a pas été créé.

### 2. `feat/motivation-massimo` — chantier « Auto-motivation » (CLOS)

Onze commits. Décision produit du user : « ZETIS doit avoir une main de fer dans un gant de
velours ». Le principe *« un enfant chronométré travaille pour le chronomètre »* est **amendé
partiellement** — il reste vrai pour le TEMPS (aucune minute, aucune session, aucun calendrier
chez Massimo), il est levé pour l'EFFORT. Amendement daté dans `page-cahier-bord.md` §Principes.

- **F1** `67b4811` — l'accueil ne ment plus (il affichait TROIS nombres inventés, dont
  « Tu as consolidé 3 notions », et un bouton « Commencer » sans handler).
- **A** `eaf6723` — `mastered_at`, `resolved_at`, `student_weekly_goals` (migration
  `f1a2b3c4d5e6`, aller-retour vérifié sur Postgres).
- **B** `9f93641` — module `motivation` : régularité douce + engagement (`require_child`).
- **C** `a10b839` — `welcome`/`wrap-up`, textes composés SERVEUR et déterministes.
- **F0/F2/F3** `aa73ff3` — « Ma semaine » et la carte ZETIS à l'écran.
- **F4+D** `a25e597` — streak retiré partout (frontend AVANT backend).
- **F5/F6** — `wrap-up` sur les 3 écrans de fin + purge des mocks morts.

**DÉCISIONS FIGÉES — ne pas rouvrir :**

- **Aucune donnée punitive n'est persistable ni servie** : pas de clé `missed`/`failed`/
  `remaining`/`streak`/`best`, pas de colonne d'atteinte sur `student_weekly_goals`. Testé.
- **Un jour passé sans activité et un jour à venir sont rendus À L'IDENTIQUE** dans la grille.
  Testé sur le RENDU, pas seulement sur le contrat.
- **Le nombre de jours d'absence n'apparaît dans aucun texte** ; deux verrous de vocabulaire
  parcourent tous les templates (aucun mot d'échec, aucun décompte de jours).
- **La régularité compte la PRÉSENCE** (`learning_events`, jamais `xp_events`) : la connexion
  seule coche la journée.
- **L'engagement est écrit par l'enfant SEUL** (Papa : 403 même en lecture), semaine toujours
  déduite serveur, révision à la baisse sans trace.
- **Pas de badge « objectif atteint »** : un badge conditionné à l'engagement rendrait l'échec
  visible et transformerait une déclaration d'autonomie en épreuve.
- Les messages sont **déterministes, sans LLM** : deux appels sur le même état → même phrase.

**PIÈGES rencontrés (coûteux à redécouvrir) :**

- `quizzes/scoring.py` rejoue à CHAQUE quiz → sans non-re-tamponnage de `mastered_at`,
  « consolidées cette semaine » recompterait éternellement les mêmes notions. D'où le helper
  unique `progress/mastery.py`.
- Le `login` est journalisé AVANT l'appel à l'accueil → l'absence se mesure sur les événements
  **strictement antérieurs à aujourd'hui**, sinon elle vaut toujours 0.
- `gamification` (bas niveau) ne doit PAS importer `motivation` (haut niveau) : cycle
  `motivation → memory → gamification`. La composition de `regularity` vit dans le ROUTEUR.
- Une prop **optionnelle** (`wrapUp?`) a laissé passer un câblage manquant à travers `tsc` ET les
  tests — vu seulement en jouant une vraie séance de révision.

**Vérifié** : 488 back + 111 Massimo + 166 Papa verts, `tsc -b` vert, un seul head alembic.
Les deux chantiers ont été vérifiés à l'écran de bout en bout.

**PROCHAIN PAS** : pousser les deux branches et ouvrir les PR dans l'ordre. Rien de codé en
attente. Données de test laissées dans la DB dev.

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
