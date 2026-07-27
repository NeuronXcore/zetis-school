# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Chantier ACTIF : branche `feat/mindmaps-pilotage-papa`** — *Mindmaps · pilotage Papa*
(addendum ADR-0016 du 2026-07-27). **Non mergé, non poussé.** Trois commits :

1. `64dd708` — docs seuls (addendum ADR-0016 + `docs/frontend-papa/page-mindmaps-pilotage.md`).
2. `3758be8` — **extraction de la brique canvas dans `@zetis/ui`** (`@zetis/ui/mindmap`).
3. *(à venir)* — aperçu Papa + `evaluate-preview` + cycle de vie éditorial.

**Ce qui est fait** — un seul renderer pour les deux interfaces :

- **Brique partagée** `packages/ui/src/components/mindmap/` : `MindmapWorkspace`, `MindmapNode`,
  `ModeSegmented`, `LayoutSelector`, `NodeBank`, `mindmapLayout.ts`, `mindmapTree.ts`,
  `mindmap.css`. `@xyflow/react` + `elkjs` **déplacés** (pas ajoutés) de `frontend-massimo` vers
  `packages/ui`. Export en **sous-chemin** (`./mindmap`), jamais depuis la racine.
- **Contrat** : zéro fetch (la carte descend en prop), zéro logique métier, évaluation **injectée**
  (prop `evaluator`). Massimo passe l'évaluateur élève, Papa celui d'aperçu.
- **Backend** : `POST /api/mindmaps/{id}/evaluate-preview` (`require_parent`, tous statuts,
  **zéro persistance**) + agrégat `attempt_count`/`avg_score` sur `pilotage/{subject_id}`
  (une requête ; le N+1 par leçon a été supprimé au passage). **Aucune migration** — le CASCADE
  était déjà couvert par `delete_mindmap`.
- **Papa** : page `/mindmaps` (chapitres repliables, recherche, métrique de reconstruction, signal
  avant destruction via la nouvelle prop `destructionNotice` de `ContentLifecycleActions`) +
  `MindmapPreviewModal` 4 onglets (hublot sombre, brique en `lazy()`) + `MindmapOutlineEditor`
  extrait de `MindmapEditorModal` (monté aux deux endroits).

**Vérifié live** (backend `:8001`, Postgres réel) : les 3 modes × 4 présentations et l'étape
mindmap d'une mission côté Massimo (non-régression, 2 points de montage) ; côté Papa, une
reconstruction **complète** jouée dans l'aperçu → score serveur 100 % rendu et
`mindmap_attempts`/`xp_events`/`learning_events` **inchangés** (11/68/38 avant et après).
413 tests back + 81 Massimo + 129 Papa verts.

**PROCHAIN PAS : pousser la branche + ouvrir la PR.** Rien ne reste à coder sur ce chantier.

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
