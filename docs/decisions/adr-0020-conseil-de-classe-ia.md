# ADR-0020 — Conseil de classe IA (narration LLM sur substrat d'évidence + recommandations typées)

## Statut

Proposé — 2026-07-06. Ouvert après clôture du chantier Missions (Lots 1+2 mergés,
PR #46/#47). Deuxième consommateur du **service d'évidence** extrait au Lot 2
(ADR-0017 §Suivi) — le premier étant le scoring des missions.

> S'appuie sur : `adr-0008` (frontière locale : aucune donnée de Massimo vers le
> cloud), `adr-0009` (dérogation cloud **étroite** limitée à `curriculum_*` — ne
> s'applique pas ici), `adr-0007`/`adr-0015` (patron de sortie IA **typée et
> versionnée**, jamais de prose à re-parser), `adr-0011` (substrat neutre, plusieurs
> consommateurs), `adr-0017` (le sélecteur quotidien n'est **jamais** transversal ;
> la vue transversale légitime est ici), `adr-0018` (flux Commander preview/confirm,
> réutilisé comme pont d'actionnabilité).

## Contexte

`PRODUCT_SPEC.md` (§Conseil de classe IA) et la maquette
`docs/frontend-papa/page-conseil-classe-ia.md` décrivent une **synthèse périodique
par matière** pour Papa : points forts, points fragiles, évolution, recommandations,
plan d'action. Aujourd'hui la page `ConseilClasseIAPage.tsx` (55 lignes) affiche des
**données mock** (`CLASS_COUNCIL`) ; aucun backend n'existe.

Le Lot 2 des missions a extrait un **service d'évidence** neutre
(`app/modules/evidence/service.py`) : par élève, read-only, déterministe, zéro LLM —
mastery par skill, lacunes ouvertes, verdicts pondérés (ADR-0014), pression SRS,
signal quiz pondéré. L'ADR-0017 le désignait explicitement comme substrat partagé
dont « le Conseil de classe IA sera le second consommateur ».

Le sujet de cet ADR : **comment ZETIS produit cette synthèse sans trahir ses
principes** — évidence calculée (pas hallucinée), narration bienveillante, 100 %
local (données privées de Massimo), et un **pont typé vers les missions** plutôt
qu'un mur de texte inerte.

Deux tensions structurent la décision :
1. **Le conseil doit décider peu et narrer beaucoup.** Le sélecteur de missions
   (ADR-0017) est déterministe et rejouable *parce qu'il ne parle pas*. Le conseil,
   lui, *parle* — donc il introduit du LLM. La ligne de partage : le LLM **narre et
   hiérarchise** une évidence **déjà calculée** ; il ne calcule ni n'invente aucune
   donnée pédagogique.
2. **Le conseil n'est pas l'élection.** L'élection ne stocke rien (déterministe →
   rejouable). Le conseil **ne peut pas** être rejoué à l'identique (deux générations
   LLM diffèrent) : son auditabilité exige de **figer** l'artefact et l'évidence qui
   l'a produit. C'est la différence qui impose une persistance ici, refusée là-bas.

## Alternatives considérées

- **LLM calcule l'évaluation lui-même** (on lui donne les traces brutes, il déduit
  mastery/lacunes) : inauditable, non ancré, réintroduit l'hallucination que le
  substrat d'évidence existe précisément pour éliminer. → Écarté (même motif que le
  refus du planificateur LLM en ADR-0017).
- **Rapport transient, régénéré à la demande** (comme l'élection) : séduisant par
  symétrie, mais faux — l'élection est déterministe (rejouable sans stockage), une
  génération LLM ne l'est pas. Un rapport « Trimestre 1 » qui change à chaque
  affichage n'est pas un compte rendu. L'« évolution récente » et l'export exigent en
  outre un historique. → Écarté au profit d'un artefact **figé**.
- **Narration cloud** (meilleure qualité de prose) : le conseil lit l'évidence privée
  de Massimo (mastery, lacunes, verdicts). Aucune de ces données ne sort du serveur
  (ADR-0008). La dérogation ADR-0009 est **étroite** (`curriculum_*`, zéro donnée
  élève) et ne couvre pas ce cas. → Écarté ; 100 % local via `get_provider()`.
- **Sortie en prose libre à re-parser pour créer des missions** : fragile, non typé,
  contraire au patron ADR-0007/0015. → Écarté ; recommandations **typées**.
- **Le conseil crée directement des missions croisées multi-matières** : les croisées
  cassent l'invariant de verdict mono-notion (ADR-0017 §5bis) et attendent leur ADR
  dédié. → Hors périmètre ; v1 = recommandations **mono-notion** via le fan-out
  Commander existant.

## Décision

1. **Nature : artefact analytique Papa-only.** Massimo ne voit **jamais** le conseil
   (CLAUDE.md — analyses parentales, diagnostics : réservés à Papa). La page vit dans
   `frontend-papa` uniquement. Aucun schéma de sortie côté élève.

2. **Architecture : narration LLM posée sur le substrat d'évidence.** Le service du
   conseil (nouveau module `app/modules/reports`) **compose l'évidence calculée**
   (`evidence.mastery_by_skill`, `open_gaps`, `recent_verdicts`, `weighted_quiz_signal`,
   `srs_pressure`) en un **contexte structuré**, le passe au LLM local, et n'attend de
   lui que : (a) une **narration** par matière + globale, (b) une **hiérarchisation**
   des notions fragiles en recommandations. Le LLM **ne choisit pas de `skill_id`
   librement** : il sélectionne et justifie **parmi les notions fragiles fournies**
   (id + nom + mastery + signaux). Tout `skill_id` de sortie est **validé contre
   l'évidence** ; un id absent est ignoré (garde-fou anti-hallucination, patron des
   notions décochables ADR-0018).

3. **100 % local, sortie typée versionnée** (patron ADR-0007/0015) :
   - provider via `get_provider()` (Ollama/MLX) — **jamais** `get_curriculum_provider()` ;
   - prompt **pur et versionné** `app/prompts/council.py` (`COUNCIL_PROMPT_VERSION`) ;
   - schéma Pydantic `CouncilReportSpec` (`extra="forbid"`), appel `generate(fmt=schema)`,
     **une** réparation sur échec de validation, puis erreur explicite ;
   - trace `AIJob` (`job_type="council_generate"`, version prompt + bornes de période) ;
   - `think:false` (qwen3) hérité du provider.

4. **Contrat de sortie (typé, deux niveaux)** :
   ```txt
   CouncilReportSpec:
     global_summary: str                      # narration globale, vocabulaire bienveillant
     subjects: [
       { subject_id, subject_name,
         strengths: str, to_reinforce: str,    # narration par matière
         recent_evolution: str,                # texte (comparatif = slice 2)
         recommendations: [
           { skill_ids: [int],                 # ancrés sur l'évidence, validés serveur
             mission_type: "manual",           # mono-notion en v1 (voir déc. 6)
             template_hint: str | null,        # "recall_first" | "discovery_first" | null
             justification: str }              # « maîtrise en construction, 2 quiz sous le seuil »
         ] }
     ]
   ```
   Le **vocabulaire bienveillant** (CLAUDE.md : « notion à renforcer », jamais « nul »/
   « échec ») est **exigé par le prompt** — mais **non garanti par construction** (c'est
   du LLM). Mitigation : Papa est le **seul lecteur** (aucun enfant exposé), et le
   prompt cadre strictement le registre. Pas de gate anti-exposition-enfant nécessaire.

5. **Persistance (nouvelle table `council_reports`, migration dédiée)** — car un
   artefact LLM n'est pas rejouable et doit être figé pour être auditable, comparé et
   exporté :
   ```txt
   council_reports:
     id, student_id, period (str, ex. "2026-T1"),
     period_start_at, period_end_at,
     global_summary (text), subjects_json (jsonb),      # la Spec validée
     prompt_version (str), evidence_snapshot_json (jsonb),  # évidence figée = auditabilité
     created_by ("ai"), created_at
   ```
   `evidence_snapshot_json` fige l'évidence au moment de la génération : on peut
   répondre après coup à « sur quelles données ce conseil s'appuyait-il ? ». Routes :
   `POST /api/reports/class-council` (génère + persiste), `GET /api/reports/class-council?period=`
   (liste/dernier), `GET /api/reports/class-council/{id}` (détail), export Markdown
   **dérivé côté client** (pas de nouvelle route).

6. **Actionnabilité = pont vers les missions via Commander (ADR-0018), mono-notion.**
   Une recommandation → bouton « Créer ces missions » → réutilise
   `missions.command.create_command_missions(skill_ids=…)` **tel quel** : fan-out
   d'**une mission `manual` mono-skill par notion** (`validation_status='validated'`
   par construction — l'humain a cliqué). **La validation Papa exigée pour le contenu
   scolaire (CLAUDE.md) se matérialise à ce clic**, pas sur le rapport narratif. Aucune
   mission croisée multi-notions en v1 (attend l'ADR croisées). Priorité forcée /
   échéance optionnelles, comme Commander.

7. **Période : minimale, non sur-modélisée (YAGNI).** La génération reçoit un `period`
   (label + bornes, dérivables de l'année scolaire active) ; on **ne crée pas** de
   modèle `SchoolPeriod` riche en v1. Un tel modèle viendra si/quand plusieurs
   consommateurs en auront besoin.

## Périmètre

**v1** : module `reports` + service de composition d'évidence + prompt versionné +
génération typée locale + persistance `council_reports` + 3 routes Papa + pont
Commander (recommandations → missions mono-notion) + branchement de la page
`ConseilClasseIAPage` (mock → réel, fetchers + hook, style Papa sombre) + export
Markdown client.

**Hors v1** (slices/ADR ultérieurs) : « évolution récente » **comparative** (nécessite
≥2 rapports — narration simple en v1, diff calculé plus tard) ; « attitude de travail »
(pas de données comportementales fiables aujourd'hui) ; **missions croisées** (ADR
dédié — le conseil en sera le porteur légitime) ; porte (i) « Recommandation retenue »
d'ADR-0018 (elle dépend de cette page — se débloque avec cet ADR).

## Conséquences

### Positives
- Le **substrat d'évidence** trouve son second consommateur sans duplication (ADR-0011
  tenu) : un calcul, deux usages (sélecteur + conseil).
- Débouché **actionnable** : la synthèse n'est pas un mur de texte, elle crée des
  missions par le flux humain déjà validé (Commander).
- **Auditable** : version de prompt + snapshot d'évidence figés → « pourquoi ce conseil
  ce jour-là » a une réponse.
- Débloque la porte (i) d'ADR-0018 (recommandation → mission).

### Négatives / coûts
- **Coût LLM par génération** (contrairement à l'élection gratuite) : assumé, c'est une
  action Papa ponctuelle, pas quotidienne.
- **Narration non garantie bienveillante** (LLM) : mitigée par le prompt + Papa seul
  lecteur ; pas de garantie-par-construction comme les `reason` templates des missions.
- **Nouvelle table + migration** ; premier objet IA **persisté** validé sans gate
  enfant (le gate humain est au confirm des missions).
- Les premières générations demanderont un **réglage de prompt** (registre, densité) —
  chaque changement = bump `COUNCIL_PROMPT_VERSION`.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; `API_SPEC.md` (nouvelles routes `reports`) ;
  la maquette `page-conseil-classe-ia.md` reste valable (sections inchangées).
- **Slice A backend** : module `reports` (schemas + service + prompt versionné +
  migration `council_reports` + 3 routes + réutilisation `create_command_missions`),
  100 % local, tests (composition d'évidence déterministe, validation typée +
  réparation, ancrage `skill_id` sur l'évidence, pont Commander). Prompt Claude Code
  dédié à écrire **après validation de cet ADR**.
- **Slice B frontend Papa** : `lib/councilClass.ts` + `hooks/useCouncilClass.ts` +
  refonte `ConseilClasseIAPage` (mock → réel, boutons « Générer » / « Créer ces
  missions » / « Exporter Markdown »), style sombre `papa-*`.
- Ordre roadmap ADR-0017 respecté : `Lot 2 → Conseil de classe → Lot 3`.

## Décisions validées (commanditaire, 2026-07-06)

1. **Persistance** : **persister** (table `council_reports`, déc. 5) — retenu. Motif :
   artefact LLM non rejouable + export + évolution.
2. **Actionnabilité v1** : recommandations → missions **mono-notion** via Commander
   (déc. 6) — retenu ; croisées différées à leur ADR.
3. **« Évolution récente »** : narration simple en v1, **diff comparatif reporté**
   (déc. 7 / Hors v1) — retenu.
