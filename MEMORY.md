# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**`main` est à jour, aucun chantier en cours, aucune branche active.** Le dernier chantier
(**Conseil de classe IA + équipement de mission**) est **MERGÉ dans `main`** — PR
[#48](https://github.com/NeuronXcore/zetis-school/pull/48), squash `639209e`. Rien en attente.

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
