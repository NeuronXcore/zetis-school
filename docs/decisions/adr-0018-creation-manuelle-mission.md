# ADR-0018 — Création manuelle de mission (« Commander ») : contrat et résolution des notions

## Statut

Proposé — 2026-07-05. **Raffine `adr-0017` (décision 1, type `manual` ; décision
5ter, validée par construction ; Suivi, Lot 3).** Ne rouvre aucune décision de
0017 : le *quoi* (Papa apporte l'intention, ZETIS compose depuis l'évidence, les
notions résolues sont décochables) est acté. Cet ADR tranche le *comment* au
niveau implémentation — contrat API, algorithme de résolution, périmètre v1 des
trois portes — et acte un blocage constaté en read-before-code.

> S'appuie sur : `adr-0017` (arbitrage des missions, service d'évidence,
> `MISSION_SCORING_VERSION`), `adr-0011` (substrat neutre + gate en requête),
> `adr-0010` (patron preview/confirm sans état : rien en base avant
> confirmation). Ne touche ni `adr-0008` (frontière locale) ni le sélecteur
> quotidien (une mission `manual` n'est pas élue par le score — elle a sa propre
> priorité, décision 5).

## Contexte

L'ADR-0017 décision 1 définit le type `manual` — « commandité par Papa, jamais
composé par lui seul », sous trois formes d'intention : (i) recommandation du
Conseil de classe, (ii) échéance (chapitre + date), (iii) thématique (sélection
dans le référentiel **ou** texte libre résolu en `Skill`). La maquette validée
`docs/frontend-papa/mockup/maquette-papa-missions-pilotage.html` (modale
« Commander une mission », 3 portes) en est le mockup. Restent à trancher, avant
tout code :

1. **Un blocage de faisabilité (read-before-code).** 0017 supposait le texte
   libre « résolu par similarité d'embeddings (nomic + pgvector *existants*) ».
   Constat sur le modèle réel : **seul `RagChunk` porte une colonne `embedding`
   (`Vector(768)`, index cosine) ; `Skill` (le référentiel ADR-0009) n'en a
   pas.** Il n'existe donc aucun index vectoriel des *notions*. La voie « texte
   libre → Skill » exige une décision d'infrastructure ; les autres voies n'en
   exigent aucune.
2. **Le contrat d'API** de la commande (aucun endpoint `manual` n'existe : le
   Lot 2 n'a livré que `generate-remediation|revision|progression`).
3. **Le périmètre v1** des trois portes, chacune ayant une dépendance distincte.

## Alternatives considérées

- **Colonne `embedding` sur `Skill` + backfill nomic** (rendre les notions
  cherchables directement) : la solution « propre » pour le texte libre. Mais
  migration + backfill + **fraîcheur à maintenir** (ré-embed à chaque édition de
  libellé de notion) + dépendance du provider d'embeddings au moment de la
  commande. Coût disproportionné pour une voie d'entrée secondaire en v1.
  → Reporté (reconsidéré si la voie texte-libre devient centrale).
- **Résolution texte-libre via le corpus `RagChunk` déjà embété** (chercher les
  chunks proches, remonter aux `Skill` par métadonnée) : séduisant (zéro
  migration), mais dépend d'un lien chunk→skill fiable et d'un RAG alimenté pour
  la matière — deux hypothèses non vérifiées, et une qualité de résolution
  variable (un chunk peut couvrir plusieurs notions). Introduit de
  l'inauditabilité dans un flux que Papa doit pouvoir relire. → Écarté en v1.
- **Formulaire de création vierge** (Papa tape un titre libre, ZETIS ne compose
  rien) : explicitement interdit par 0017 décision 1 (« aucun formulaire de
  création vierge n'existe » — sinon Papa compose à l'aveugle). → Écarté.
- **Porte (i) en v1** : exige la page Conseil de classe IA, non implémentée
  (0017 Suivi). Un bouton menant à une source inexistante = bouton mort.
  → Reporté.

## Décision

1. **Périmètre v1 = deux portes, zéro embedding, zéro migration.**
   - **(ii) Échéance** — Papa choisit un **chapitre** (référentiel de l'année
     active) + une **date** ; le scope est l'ensemble des `Skill` du chapitre.
     La **date est purement informationnelle** — affichage et tri **côté
     pilotage Papa uniquement**. Elle n'a **aucun** effet mécanique propre :
     l'urgence passe **exclusivement** par `force_priority` (plancher de score,
     décision 4), **`true` par défaut** pour cette porte. La `due_date`
     n'apparaît **jamais** dans `MissionStudentOut` ni dans aucune surface
     Massimo (invariant testé) — l'enfant ne voit pas de compte à rebours, la
     règle anti-anxiété de l'ADR-0017 (déc. 4) est préservée par construction.
   - **(iii-a) Thématique par sélection** — Papa navigue le référentiel
     (matière → chapitre → notions) ; le scope est la sélection.
   Les deux ne consomment que le **service d'évidence** (ADR-0017 Lot 2, déjà
   livré) et le référentiel (ADR-0009). Sont **hors v1**, chacune avec sa
   dépendance nommée (pas de bouton mort) :
   - **(i) Recommandation** → attend la page Conseil de classe IA ;
   - **(iii-b) Thématique par texte libre** → attend la décision d'embeddings
     (alternatives ci-dessus). La porte s'affiche **désactivée avec sa raison**
     (« bientôt — nécessite l'index des notions »), jamais masquée à moitié.

2. **Contrat preview/confirm sans état (patron ADR-0010) — rien en base avant
   confirmation.** Deux endpoints Papa, schéma `manual` uniquement :
   - `POST /api/missions/command/preview` → résout le scope en notions **sans
     écrire** :
     ```txt
     entrée : { gate: "deadline"|"theme_ref",
                chapter_id?: int, due_date?: date,        # deadline
                skill_ids?: [int] }                        # theme_ref (sélection)
     sortie : { scope_label: str,
                notions: [{ skill_id, name, level,
                            mastery: float, fragility: float,   # fragility = 1 - mastery
                            checked: bool }],                    # décoché si maîtrisé
                compose_note: str }                              # « N missions courtes, ~15 min chacune »
     ```
   - `POST /api/missions/command/confirm` → crée **une mission `manual` par
     notion cochée** (chacune **mono-skill**), dans la limite de
     **`MISSION_COMMAND_MAX_SKILLS`** (config, v1 = 3 ; versionné avec
     `MISSION_COMMAND_VERSION`) — au-delà, refus (le front empêche d'en cocher
     plus) :
     ```txt
     entrée : { gate, scope..., skill_ids: [int],          # les notions COCHÉES (≤ MAX)
                force_priority: bool }
     sortie : [MissionPilotOut]                             # k notions cochées ⇒ k missions
     ```
     Chaque mission : `created_by = parent`, `validation_status = validated`
     **par construction** (décision 5ter : le preview/confirm avec notions
     décochables *est* l'approbation humaine — pas de double validation, la
     mission ne transite pas par la file « À valider ») ; étapes générées par le
     **même moteur déterministe** que les autres sources (parcours `eli5 →
     vocal_explain → quiz`, ADR-0017 décision 5) sur son **unique** `Skill`.
     **Une mission = une notion**, par cohérence structurelle avec l'ADR-0017 :
     le parcours (déc. 5), le **verdict d'acquisition** (calculé *par skill*,
     déc. 5bis) et l'**atome ~15 min** (déc. 4) y sont tous définis *par notion*.
     Une mission multi-notions casserait les trois (verdict ambigu, parcours
     dilué, budget de temps multiplié) — d'où le fan-out en missions atomiques
     plutôt qu'une mission composite.

3. **Résolution des notions (commune aux deux portes v1), versionnée.**
   - **Fragilité = `1 − mastery`** via `evidence.mastery_by_skill()` ; classement
     par fragilité décroissante (les notions les plus faibles du scope d'abord).
   - **Auto-décochage des notions maîtrisées** : `mastery ≥
     MISSION_COMMAND_MASTERED_THRESHOLD` (v1 = 0.8) → `checked = false`,
     **recochable** (la maquette : « la notion solide a été décochée
     automatiquement — recochable »).
   - **Toujours décochables** côté Papa : garde-fou indispensable (0017
     décision 1). La preview *propose*, Papa *dispose* ; seules les notions
     cochées à la confirmation entrent dans la mission.
   - Seuil **et plafond** dans la config (`config.py` + `.env.example`) —
     `MISSION_COMMAND_MASTERED_THRESHOLD` (0.8) et `MISSION_COMMAND_MAX_SKILLS`
     (3, décision 2) —, **versionnés** `MISSION_COMMAND_VERSION=v1` (même
     discipline que `MISSION_SCORING_VERSION` : tout changement = bump tracé).

4. **Priorité forcée = plancher, jamais plafond.** `force_priority` (booléen,
   **stocké sur la mission** — nouvelle colonne) alimente le facteur
   `forced_priority` du scoring (ADR-0017 décision 2) : une mission forcée peut
   **court-circuiter** un score plus faible pour être élue, mais ne rabaisse
   **jamais** une mission mieux scorée (0017 décision 1). Le sélecteur reste
   l'arbitre ; la priorité forcée n'est qu'un plancher.
   - **Constat read-before-code** : le sélecteur du Lot 2 plancher-ise *toute*
     mission d'après son type (`forced_priority = 1.0 if mission_type ==
     "manual"`). C'est incompatible avec « l'urgence passe **exclusivement** par
     `force_priority` » : une thématique dont Papa décoche « Prioritaire » ne
     doit **pas** être plancher-isée. Le sélecteur lit désormais le **flag**
     (`forced_priority = 1.0 if mission.force_priority else 0.0`), découplé du
     type. Changer le calcul d'un facteur **bumpe `MISSION_SCORING_VERSION`
     v1→v2** (discipline ADR-0017 : tout changement de facteur = bump tracé) —
     la page pilotage et les tests d'invariants suivent.

5. **Surface Papa.** Le bouton `+ Commander une mission` apparaît dans l'en-tête
   de la page « Missions — pilotage » (il remplace le placeholder Lot 3
   aujourd'hui absent). La modale suit la maquette : 3 portes, dont **(i) et
   (iii-b) désactivées avec leur raison** en v1. Aucune logique métier front
   (résolution et composition sont serveur) ; le front n'orchestre que
   preview → (dé)cochage → confirm.

## Conséquences

### Positives
- **Zéro migration, zéro embedding, zéro nouvelle dépendance** en v1 : les deux
  portes livrables reposent entièrement sur l'évidence (Lot 2) et le référentiel.
- Le blocage embeddings est **tranché avant le code**, pas découvert pendant :
  la voie coûteuse est explicitement reportée avec ses options.
- Réutilisation maximale : moteur d'étapes déterministe (0017 déc. 5), patron
  preview/confirm (ADR-0010), gate en requête (ADR-0011), scoring `forced_priority`
  (0017 déc. 2) — tous existants.
- Cohérent avec la règle fondatrice : `manual` naît `validated`, mais **parce
  qu'un humain a approuvé un scope résolu et décochable**, pas par exception.

### Négatives / coûts
- **Papa saisit une matière/chapitre plutôt qu'une phrase** en v1 : la voie
  texte-libre — la plus « naturelle » — est repoussée. Acceptable : la sélection
  référentiel couvre l'échéance et la thématique ciblée, cas d'usage principaux.
- La porte Recommandation reste vide tant que le Conseil de classe n'existe pas
  (dépendance déjà connue de 0017).
- Un `MISSION_COMMAND_VERSION` de plus à faire vivre (seuil de maîtrise) — coût
  marginal, discipline déjà en place.

## Suivi

- **Docs** : ligne dans `DECISIONS.md` ; spec `docs/frontend-papa/page-commander-mission.md`
  (surface + contrat, ce chantier) ; compléter `API_SPEC.md` §Missions
  (endpoints `command/preview` + `command/confirm`) et `DATA_MODEL.md` (le type
  `manual` gagne son flux de création).
- **Prompt de slice** `prompts/claude-code/prompt-missions-lot3-commander.md`
  (backend preview/confirm + résolution + front modale) — **à écrire au
  green-light**, après commit de la slice « page pilotage » (mono-chantier).
- **Invariants testés** (un test chacun, comme 0017 déc. 4) : `manual` naît
  `validated` (jamais `pending`) ; `preview` n'écrit rien en base ; une notion
  `mastery ≥ seuil` arrive décochée ; seules les notions cochées entrent dans une
  mission ; **`confirm` avec k notions cochées ⇒ exactement k missions, chacune
  mono-skill** (et refus si k > `MISSION_COMMAND_MAX_SKILLS`) ; `force_priority`
  est un plancher (n'abaisse aucun score) ; **`due_date` absente de toute réponse
  student** (`MissionStudentOut`, `/missions/today`, `/missions`).
- **Dépendances reportées** (traçées, non planifiées) : porte (i) → Conseil de
  classe IA ; porte (iii-b) texte libre → décision d'embeddings des `Skill`.
- **Ordre dans la file** : après la slice « page pilotage » (branche `mission`),
  et idéalement après la refonte MissionsPage Massimo (projection élève).
