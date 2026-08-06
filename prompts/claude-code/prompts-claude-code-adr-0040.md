# Prompts Claude Code — chantier ADR-0040

> **Trois sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code neuve. Entre deux sessions : le geste git de clôture, puis celui d'ouverture de la suivante.
>
> **Prérequis absolu** : les documents sont **déjà commités sur `main`** avant la session A. Les
> prompts les référencent par leur chemin dans le dépôt et n'en recopient pas le contenu — la
> re-spécification dans un prompt est un anti-patron : elle crée une seconde source qui dérive.

---

## Protocole commun aux trois sessions

*(à coller en tête de chaque session, ou à laisser dans `CLAUDE.md` si déjà présent)*

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index du dépôt avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de la liste « À LIRE AVANT D'ÉCRIRE » avant
   d'écrire une ligne. Les sources réelles invalident régulièrement les hypothèses de la phase de
   cadrage — c'est attendu, pas exceptionnel.

3. Stop-on-blocker. Si une lecture contredit le document de référence, ARRÊTE-TOI et remonte la
   contradiction. N'improvise pas une résolution. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs. Toute divergence entre le code réel et un document
   (ADR, spec, API_SPEC, DATA_MODEL, GLOSSARY) se corrige DANS le document, dans le même commit.
   Un écart non écrit devient une dérive de contexte à la session suivante.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, table, route et composant
   avant de t'en servir. Les chemins donnés ci-dessous sont des indications, pas des certitudes.

6. Checklist de clôture (9 points), à produire en fin de session :
   fichiers touchés · migrations · routes nouvelles · requêtes nouvelles · suites de tests
   (backend / Papa / Massimo, avant → après) · tsc -b et vite build · vérifié à l'écran (par qui,
   sur quelles données) · docs mis à jour · résidus et dettes assumées.
```

---

## SESSION A — Lot 0 : le verrou de `recent_evolution`

**Branche** : `fix/council-evolution-lock`, créée depuis un `main` à jour.

```txt
Chantier : ADR-0040 Lot 0 — le Conseil de classe cesse d'affirmer ce que l'évidence ne porte pas.

DOCUMENT DE RÉFÉRENCE
  docs/decisions/adr-0040-progression-dans-le-temps.md — §8 uniquement (le reste de l'ADR
  concerne les lots suivants et n'est PAS à implémenter ici).

LE DÉFAUT, EN UNE PHRASE
  CouncilReportSpec.recent_evolution est déclaré `str` non-nullable pour une valeur qu'aucune
  source ne peut produire : le `period` du Conseil ne sélectionne aucune donnée. Le producteur
  remplit parce que le type l'y oblige, et le résultat est FIGÉ dans council_reports.subjects_json,
  donc rétroactivement indiscernable du vrai.

À LIRE AVANT D'ÉCRIRE
  app/modules/reports/service.py         — _build_context, la validation, l'ancrage skill_id
  app/modules/reports/schemas.py         — CouncilReportSpec, CouncilReportOut
  app/prompts/council.py                 — le texte et COUNCIL_PROMPT_VERSION
  app/modules/evidence/service.py        — ce que le contexte porte réellement aujourd'hui
  les tests existants du module reports  — en particulier le verrou de portée matière
                                           (provider factice → matière hors portée → rapport vide),
                                           qui est le MIROIR du verrou à écrire ici
  frontend-papa : la page Conseil de classe et son type partagé

PÉRIMÈTRE — ce qui est DANS
  1. recent_evolution devient nullable, et le serveur ÉCRASE à null quand l'évidence ne porte
     aucune bascule — quoi que le modèle ait écrit. Avec l'évidence d'aujourd'hui, cela vide le
     champ partout : c'est le comportement attendu, pas une régression.
  2. L'écrasement court APRÈS la validation typée, au même endroit que l'ancrage des skill_id.
  3. L'écran rend l'absence explicite (phrase de history_since), il ne rend pas une section vide.
  4. Marque de lecture dérivée de prompt_version : tout rapport < v3 affiche « évolution rédigée
     sans historique daté ». Aucune réécriture des rapports figés, aucune migration.
  5. COUNCIL_PROMPT_VERSION passe à v3, et le prompt cesse de demander une évolution.
  6. Test-verrou : un provider factice renvoyant une évolution alors que l'évidence ne porte
     aucune bascule DOIT produire un rapport dont recent_evolution vaut null.

PÉRIMÈTRE — ce qui est DEHORS
  - La structure complète {since, transitions[], comment} : c'est le Lot 3.
  - Toute lecture de skill_mastery_history : c'est le Lot 1.
  - Le service d'évidence : on n'y touche pas.
  - Les quatre autres champs narratifs : l'audit de l'ADR les a trouvés ancrés. Ne pas les modifier.

CRITÈRES D'ACCEPTATION
  - Sur la base de dev, générer un rapport produit recent_evolution = null sur toutes les matières.
  - Un rapport v1 ou v2 déjà en base s'affiche avec la marque de lecture, sans avoir été modifié.
  - Le test-verrou échoue si l'on retire l'écrasement (vérifie-le par sabotage).
  - La suite backend passe. Aucune migration.

DOCS À METTRE À JOUR DANS LE MÊME COMMIT
  API_SPEC.md (le champ nullable) · docs/frontend-papa/page-conseil-classe-ia.md (le champ typé et
  la marque de lecture) · CHANGELOG.md si tu ouvres 0.53.0 dès maintenant.

COMMIT
  fix(reports): recent_evolution never asserts what evidence does not carry
```

### Geste git de clôture A

```bash
git push -u origin fix/council-evolution-lock
gh pr create --fill

git checkout main && git pull
git rev-parse main origin/main        # DOIVENT être identiques — parade du #90
gh pr merge --squash --delete-branch
git ls-remote --heads origin          # branche disparue des deux côtés
```

Puis **mettre à jour `MEMORY.md` sur `main`** (Lot 0 mergé, squash, état des suites) et pousser.

---

## SESSION B — Lots 1 + 2 : la mesure et l'écran

**Branche** : `feat/progression-temps`, créée depuis un `main` à jour (elle doit contenir le Lot 0).

> 🔴 **Les deux lots partent ensemble.** Une route écrite et appelée par personne, c'est exactement
> `GET /progress/consolidated` — le constat qui a ouvert l'ADR-0038. On ne recommence pas le motif
> qu'on est en train de corriger. Deux commits dans la branche, un seul squash au merge.

```txt
Chantier : ADR-0040 Lots 1 et 2 — Progression nomme les notions et date leurs mouvements.

DOCUMENTS DE RÉFÉRENCE
  docs/decisions/adr-0040-progression-dans-le-temps.md   — §1 à §7, §10 à §12
  docs/frontend-papa/page-progression.md                 — la spec d'écran
  docs/frontend-papa/page-lacunes.md                     — la page voisine, renommée
  docs/frontend-papa/mockup/maquette-papa-progression.html — comportement de référence,
      cliquable : bascule de vue, tris, blocs du tri par date, bornes de trace, états vides

À LIRE AVANT D'ÉCRIRE
  app/modules/evidence/service.py        — où mastery_transitions doit vivre, et ce que le module
                                           accepte comme donnée probante
  app/modules/progress/service.py        — OPEN_GAP_STATUSES, /overview, /consolidated, /gaps
  app/modules/progress/mastery.py        — set_mastery_status, record_mastery_transition
  app/modules/dashboard/projections.py   — FRAGILE_STATUSES et le regroupement canonique des
                                           paliers : à IMPORTER, jamais à recopier
  app/models (SkillMastery, SkillMasteryHistory, Gap, Skill) + les migrations existantes
  la fonction partagée qui calcule has_active_mission (dashboard et /lacunes s'en servent tous deux)
  frontend-papa/src/pages/ProgressionPage.tsx
  frontend-papa/src/pages/LacunesPage.tsx
  frontend-papa/src/components/progression/SubjectDetailRow.tsx
  frontend-papa/src/hooks/useProgression.ts, useLacunes.ts
  frontend-papa/src/lib/activity.ts      — fetchConsolidatedSkills, déjà écrite
  packages/types/src/ — les types partagés de progression
  API_SPEC.md §Progression — la section marquée « documentée mais JAMAIS implémentée »

LOT 1 — LA MESURE
  - evidence.mastery_transitions(student, since, subject_id=None) : UNE fonction, deux
    consommateurs (Progression maintenant, le Conseil au Lot 3). Ne pas la dupliquer dans progress/.
  - GET /progress/skills : une requête agrégée, aucun N+1, aucune pagination, aucun paramètre de
    période. Test de NOMBRE DE REQUÊTES CONSTANT, indépendant du nombre de notions et de matières.
  - GET /progress/skills/{skill_id}/timeline : paresseuse, par notion.
  - Migration : index (student_id, skill_id, changed_at DESC) sur skill_mastery_history. Aucune
    colonne, aucun backfill.
  - Le typage de « depuis » suit le §7 : quatre états, DEUX unknown distincts. Un int|null serait
    la faute que ce lot existe pour éviter.
  - Test-verrou de statuts : ajouter une septième valeur à SkillMastery.status doit faire ÉCHOUER
    un test, pas glisser silencieusement dans « non abordée ».

LOT 2 — L'ÉCRAN
  - Trois vues dans ProgressionPage, sélecteur en tête, max-w-6xl sur les trois.
  - ?subject= conservé (il porte le constat du dashboard) ; ?view= écrit avec replace: true ;
    le filtre matière est partagé par les trois vues.
  - Le dépliage matière est ALLÉGÉ : XP par motif + référentiel + trois liens. Ses listes de
    notions disparaissent (elles seraient une troisième copie).
  - Renommage de LacunesPage selon page-lacunes.md, + test-verrou de vocabulaire :
    « à renforcer » interdit en contexte Gap, « lacune » interdit en contexte SkillMastery.
  - API_SPEC.md : RETIRER GET /progress/skills de la section « jamais implémentée » en l'écrivant.
    Sinon l'avertissement qui protège toute la section devient faux sur une ligne.

CE QUI EST DEHORS
  - Toute courbe, série ou agrégat temporel. La révocation de l'ADR-0038 §5 autorise des
    ÉVÉNEMENTS NOMMÉS, rien d'autre.
  - L'XP dans la vue période (§2 — trois motifs, dont : le journal ne peut pas le recomposer).
  - La production dans la vue période (elle vit dans Couverture).
  - Toute fenêtre temporelle dans le service d'évidence : le `period` du Conseil reste une étiquette.
  - Toute surface Massimo. require_parent de bout en bout.

CRITÈRES D'ACCEPTATION — vérifiables à l'écran sur données réelles
  - Vue notion : 19 notions engagées par défaut, dont 10 en « hors trace ». Ce n'est pas un bug.
  - Tri par date : trois blocs séparés et comptés, jamais une liste continue.
  - Vue période, fenêtre 90 j : le compte des bascules est identique à celui de 7 j, ET l'écran
    l'explique par la borne de trace.
  - Les compteurs de la vue période se recomposent exactement depuis le journal affiché dessous.
  - Les compteurs des pastilles de palier ne bougent PAS quand on filtre par matière.
  - /lacunes vide affiche « Aucune lacune ouverte » + le renvoi vers Progression.

DOCS À METTRE À JOUR
  API_SPEC.md · DATA_MODEL.md (l'index, les deux natures d'absence) · GLOSSARY.md (entrée
  « Bascule de palier », renfort de la frontière palier/lacune) · les deux specs si le
  read-before-code les invalide.

COMMITS (deux, squashés au merge)
  feat(progress): dated mastery transitions and the notion index
  feat(papa): progression in three grains — subject, notion, period
```

### Geste git de clôture B

Identique à A. Puis `MEMORY.md` sur `main`.

---

## SESSION C — Lot 3 : la narration ancrée

**Branche** : `feat/council-dated-evolution`, depuis un `main` contenant A **et** B.

```txt
Chantier : ADR-0040 Lot 3 — le Conseil raconte des bascules datées, bornées par leur trace.

DOCUMENT DE RÉFÉRENCE
  docs/decisions/adr-0040-progression-dans-le-temps.md — §8 (points 2 à 4) et §9, §10.

PRÉALABLE
  Le Lot 0 a déjà rendu le champ nullable et posé l'écrasement serveur. Ce lot le REMPLIT, il ne
  le réécrit pas. Si l'écrasement a disparu, arrête-toi : c'est une régression du Lot 0.

À LIRE AVANT D'ÉCRIRE
  app/modules/evidence/service.py — mastery_transitions, écrite au Lot 1
  app/modules/reports/service.py, schemas.py, app/prompts/council.py — état après Lot 0
  le verrou de portée matière et scope.notions_available / notions_considered dans
  evidence_snapshot_json

PÉRIMÈTRE
  - recent_evolution devient {since, transitions[], comment|null} | null. `since` vaut
    history_since — JAMAIS `period`. Les deux ne partagent pas un nom.
  - Les transitions arrivent au prompt en LISTE FERMÉE. Toute notion ou date absente du contexte
    est rejetée à la validation, exactement comme un skill_id inconnu.
  - Invariant : len(transitions) == le compte de l'évidence. Plafond aligné sur celui des notions
    (8 global / 16 portée matière), écart DÉCLARÉ dans evidence_snapshot_json.
  - `since` entre dans le prompt ET dans le snapshot. Le prompt impose la formule « sur la trace
    disponible depuis le JJ/MM ».
  - Seules les bascules de palier remontent. Ni quiz bruts, ni SRS : ils sont déjà agrégés dans
    l'évidence, et l'événementiel brut rejouerait le « le LLM calcule lui-même » écarté par
    l'ADR-0020.
  - comment reste null si transitions est vide.

CE QUI EST DEHORS
  - Donner une vraie fenêtre temporelle au service d'évidence. Chantier à part.
  - Réécrire les rapports figés. La marque de lecture du Lot 0 suffit.
  - Un mode aperçu du Conseil. Le figeage systématique reste la doctrine.

CRITÈRES D'ACCEPTATION
  - Un rapport généré sur une matière portant des bascules les cite toutes, avec leurs dates
    réelles, et aucune autre.
  - Un provider factice inventant une date absente du contexte : la date est rejetée.
  - Un rapport sur une matière sans bascule : recent_evolution reste null (le Lot 0 tient).
  - La phrase de borne apparaît dans la narration, et `since` figure dans le snapshot.

COMMIT
  feat(reports): council narrates dated transitions, bounded by the trace
```

---

## Clôture du chantier

Après le merge de C :

1. `CHANGELOG.md` **0.53.0** — écrit maintenant, pas avant : il raconte ce qui est sorti.
2. `MEMORY.md` — chantier COMPLET, avec les résidus et ce qui n'a pas été relu visuellement par le
   user.
3. `DECISIONS.md` — passer l'ADR-0040 de **Proposé** à **Accepté**.
4. `git ls-remote --heads origin` — aucune des trois branches ne doit subsister.
