# DECISIONS.md — Index des décisions d'architecture

> 🔴 **Fichier généré par `scripts/gen_decisions_index.py`. Ne pas éditer à la main.**
> Le motif d'une décision vit dans son ADR, jamais ici — un index qui recopie
> le contenu se périme deux fois plus vite et ne s'utilise plus.

67 décisions. Amendements fusionnés dans leur parent (`## Amendement N`, tableau récapitulatif en tête de chaque ADR).

## Décisions d'architecture

*Elles contraignent tout le reste. À lire avant de cadrer un chantier — voir aussi `docs/decisions/SOCLE.md`.*

| ADR | Titre | Statut | Date |
|---|---|---|---|
| [0001](docs/decisions/adr-0001-z-etis-sans-obsidian-obligatoire.md) | ZETIS sans Obsidian obligatoire | ✅ Accepté | — |
| [0002](docs/decisions/adr-0002-separation-frontends-massimo-papa.md) | Séparation frontends Massimo et Papa | ✅ Accepté | — |
| [0003](docs/decisions/adr-0003-monorepo.md) | Monorepo | ✅ Accepté | — |
| [0004](docs/decisions/adr-0004-postgresql-pgvector.md) | PostgreSQL + pgvector | ✅ Accepté | — |
| [0007](docs/decisions/adr-0007-capsules-ia-remotion.md) | Capsules IA : moteur Remotion (capsule = spec typé, Player en Lot 1) | ✅ Accepté | 2026-07-01 |
| [0008](docs/decisions/adr-0008-inference-mlx-vs-ollama.md) | Moteur d'inférence LLM : Ollama vs MLX (décision guidée par benchmark) | ✅ Accepté | 2026-07-02 |
| [0009](docs/decisions/adr-0009-referentiel-programme-scolaire.md) | Référentiel de programme scolaire (génération LLM en deux passes, co-construction Papa/IA) | ✅ Accepté | 2026-07-03 |
| [0011](docs/decisions/adr-0011-contexte-canonique-partage.md) | Contexte canonique partagé pour les dérivés (résolveur + convention de prompt à deux sections) | ✅ Accepté | 2026-07-04 |
| [0014](docs/decisions/adr-0014-moteur-quiz-unifie.md) | Moteur de quiz unifié (formats, correction, doctrine de validation) | ✅ Accepté | 2026-07-05 |
| [0017](docs/decisions/adr-0017-arbitrage-missions.md) | Arbitrage des missions (moteur de prochaine meilleure action) | ✅ Accepté | 2026-07-05 |
| [0023](docs/decisions/adr-0023-production-par-scope.md) | Production de contenu par scope : extraire l'équipement et l'exposer depuis la Couverture | ⬛ Remplacé | 2026-08-02 |
| [0024](docs/decisions/adr-0024-zetis-galaxy-progression.md) | ZETIS Galaxy : la page Progression rendue en graphe 3D des connaissances | ✅ Accepté | 2026-07-28 |
| [0030](docs/decisions/adr-0030-temoins-nouveaute-navigation.md) | Témoins de nouveauté en navigation | ✅ Accepté | 2026-08-01 |
| [0031](docs/decisions/adr-0031-production-en-lot-et-journal.md) | Produire un chapitre en une fois : exécution asynchrone et journal de production | 🟡 Proposé | 2026-08-02 |
| [0032](docs/decisions/adr-0032-paliers-autonomie-zetis.md) | Les paliers d'autonomie de ZETIS : le panneau de réglage, et la levée du gel d'A1 | 🟡 Proposé | 2026-08-02 |
| [0034](docs/decisions/adr-0034-journal-production-et-veto.md) | Le Journal de production : ce que ZETIS a fait, et le veto qui rend le palier 3 honnête | 🟡 Proposé | 2026-08-02 |
| [0037](docs/decisions/adr-0037-lecon-canonique-d-une-notion.md) | « La leçon d'une notion » : trois règles, trois réponses, un substrat | 🟡 Proposé | 2026-08-03 |
| [0038](docs/decisions/adr-0038-les-preuves-menent-quelque-part.md) | Les trois preuves de la Lecture ZETIS mènent quelque part, et « Progression » cesse d'être inventée | ✅ Accepté | 2026-08-05 |
| [0043](docs/decisions/adr-0043-le-diagnostic-est-une-mesure-qui-engage.md) | Le diagnostic est une mesure qui engage : il sort de l'évaluation éphémère | ✅ Accepté | 2026-08-08 |
| [0046](docs/decisions/adr-0046-le-worker-de-production-est-un-service.md) | Le worker de production est un service, et son absence vient à toi | ✅ Accepté | 2026-08-08 |
| [0048](docs/decisions/adr-0048-zetis-doute-de-sa-propre-mesure.md) | ZETIS doute de sa propre mesure | ✅ Accepté | 2026-08-09 |
| [0060](docs/decisions/adr-0060-la-surface-se-decide-devant-l-ecran.md) | La surface se décide devant l'écran | 🟡 Proposé | 2026-08-16 |
| [0061](docs/decisions/adr-0061-le-vert-devient-une-condition-d-entree.md) | Le vert devient une condition d'entrée, pas une information | 🟡 Proposé | 2026-08-16 |

## Décisions de mesure et d'outillage

*Choix d'instruments : inférence, STT, rendu, layout.*

| ADR | Titre | Statut | Date |
|---|---|---|---|
| [0012](docs/decisions/adr-0012-stt-whisper-local.md) | STT (dictée) via Whisper local pour ELI5 | ✅ Accepté | 2026-07-04 |
| [0013](docs/decisions/adr-0013-generation-cartes-srs.md) | Génération et cycle de vie des cartes de révision (SRS) | ✅ Accepté | 2026-07-05 |
| [0016](docs/decisions/adr-0016-mindmaps-rendu-layout.md) | Mindmaps interactives : rendu React Flow + layout elkjs, 4 présentations au choix | ✅ Accepté | 2026-07-05 |
| [0033](docs/decisions/adr-0033-indicateur-autonomie-massimo.md) | Indicateur d'autonomie de Massimo | ⬛ Abandonné | 2026-08-16 |

## Décisions de surface

*Elles tranchent un écran : libellés, gabarits, états. Excellentes specs — on ne les lit pas pour cadrer une architecture.*

| ADR | Titre | Statut | Date |
|---|---|---|---|
| [0005](docs/decisions/adr-0005-capsules-ia-progressives.md) | Capsules IA progressives | ✅ Accepté | — |
| [0006](docs/decisions/adr-0006-extension-zetis-clip.md) | Extension navigateur `zetis-clip` (capture de sources RAG, côté Papa) | ✅ Accepté | 2026-07-01 |
| [0010](docs/decisions/adr-0010-generation-skills-only-rattrapage.md) | Génération « skills-only » pour un niveau antérieur (rattrapage) | ✅ Accepté | 2026-07-03 |
| [0015](docs/decisions/adr-0015-fiches-revision.md) | Fiches de révision (spec fermé « 1 leçon = 1 page », dérivé canonique, validé Papa) | ✅ Accepté | 2026-07-05 |
| [0018](docs/decisions/adr-0018-creation-manuelle-mission.md) | Création manuelle de mission (« Commander ») : contrat et résolution des notions | ✅ Accepté | 2026-07-05 |
| [0019](docs/decisions/adr-0019-mindmap-etape-mission.md) | La reconstruction de mindmap comme étape de mission | ✅ Accepté | 2026-07-05 |
| [0020](docs/decisions/adr-0020-conseil-de-classe-ia.md) | Conseil de classe IA (narration LLM sur substrat d'évidence + recommandations typées) | ✅ Accepté | 2026-07-06 |
| [0021](docs/decisions/adr-0021-equipement-mission-conseil.md) | Équipement pédagogique d'une mission à sa création (depuis le Conseil de classe) | ✅ Accepté | 2026-07-06 |
| [0022](docs/decisions/adr-0022-missions-croisees-champion.md) | Missions croisées « champion » (multi-matières, multi-outils, verdict par notion) | ✅ Accepté | 2026-07-06 |
| [0025](docs/decisions/adr-0025-agenda-scolaire.md) | Agenda scolaire : première source exogène, co-éditée, non probante | ✅ Accepté | 2026-07-29 |
| [0026](docs/decisions/adr-0026-chat-zetis-memoire.md) | Chat ZETIS : mémoire éphémère, traçabilité typée, signal déclaratif | 🟡 Proposé | 2026-07-29 |
| [0027](docs/decisions/adr-0027-chat-orchestrateur.md) | Chat ZETIS orchestrateur : intent typé, ancré, orienté vers l'existant | ✅ Accepté | 2026-07-30 |
| [0028](docs/decisions/adr-0028-dashboard-papa-agregat-unique.md) | Dashboard Papa : agrégat unique, dérivation client, KPI actifs | ✅ Accepté | 2026-07-31 |
| [0029](docs/decisions/adr-0029-rejeu-anime-galaxie.md) | Rejeu animé de la galaxie : voir son chemin, pas seulement son état | ✅ Accepté | 2026-07-31 |
| [0035](docs/decisions/adr-0035-declencheur-automatique-production.md) | Le déclencheur automatique : ZETIS travaille sans qu'on lui demande, et ce que ça oblige | 🟡 Proposé | 2026-08-02 |
| [0036](docs/decisions/adr-0036-demande-vers-production.md) | La demande de Massimo devient une production : fermer la seule boucle qui reste ouverte | 🟡 Proposé | 2026-08-03 |
| [0039](docs/decisions/adr-0039-file-de-relecture.md) | Tout nombre affiché sur le Dashboard ouvre exactement ce qu'il compte | ✅ Accepté | 2026-08-05 |
| [0040](docs/decisions/adr-0040-progression-dans-le-temps.md) | Progression nomme les notions et date leurs mouvements ; le Conseil cesse d'affirmer ce que l'évidence ne porte pas | ✅ Accepté | 2026-08-06 |
| [0041](docs/decisions/adr-0041-tout-ce-qui-produit-se-voit.md) | Tout ce qui produit se voit, attend son tour, et ne se perd pas | 🟡 Proposé | 2026-08-06 |
| [0042](docs/decisions/adr-0042-la-notion-orpheline-devient-equipable.md) | La notion orpheline devient équipable : le quiz s'ancre sur la notion | ✅ Accepté | 2026-08-07 |
| [0044](docs/decisions/adr-0044-la-page-diagnostic-propose-au-lieu-de-lister.md) | La page Diagnostic de Massimo propose au lieu de lister | ✅ Accepté | 2026-08-08 |
| [0045](docs/decisions/adr-0045-la-page-diagnostic-papa-montre-ce-qu-elle-annonce.md) | La page Diagnostic de Papa montre ce qu'elle annonce | ✅ Accepté | 2026-08-08 |
| [0047](docs/decisions/adr-0047-la-page-lacunes-permet-d-agir.md) | La page Lacunes permet d'agir | ✅ Accepté | 2026-08-09 |
| [0049](docs/decisions/adr-0049-le-deck-de-revision-par-chapitre.md) | Le deck de révision par chapitre | ✅ Accepté | 2026-08-10 |
| [0050](docs/decisions/adr-0050-le-plan-de-preparation.md) | Le plan de préparation | ✅ Accepté | 2026-08-10 |
| [0051](docs/decisions/adr-0051-papa-peut-lire-un-diagnostic.md) | Papa peut lire un diagnostic avant de le laisser passer | 🟡 Proposé | 2026-08-11 |
| [0052](docs/decisions/adr-0052-la-mindmap-prend-la-place-qu-elle-demande.md) | La mindmap prend la place qu'elle demande | 🟡 Proposé | 2026-08-12 |
| [0053](docs/decisions/adr-0053-le-paquet-partage-cesse-d-etre-un-angle-mort.md) | Le paquet partagé cesse d'être un angle mort | 🟡 Proposé | 2026-08-12 |
| [0054](docs/decisions/adr-0054-la-fiche-vit-dans-le-temps.md) | La fiche vit dans le temps | 🟡 Proposé | 2026-08-13 |
| [0055](docs/decisions/adr-0055-les-deux-etapes-qui-manquent.md) | Les deux étapes qui manquent | 🟡 Proposé | 2026-08-14 |
| [0056](docs/decisions/adr-0056-la-file-cesse-d-enterrer-ce-qu-il-vient-d-ecrire.md) | La file cesse d'enterrer ce qu'il vient d'écrire | 🟡 Proposé | 2026-08-14 |
| [0057](docs/decisions/adr-0057-une-seule-facon-de-trouver.md) | Une seule façon de trouver | 🟡 Proposé | 2026-08-14 |
| [0058](docs/decisions/adr-0058-la-fiche-repond-quand-on-la-touche.md) | La fiche répond quand on la touche | 🟡 Proposé | 2026-08-14 |
| [0059](docs/decisions/adr-0059-zetis-repond-vite-et-interroge.md) | ZETIS répond vite, ouvre la ressource exacte, et interroge | 🟡 Proposé | 2026-08-15 |
| [0062](docs/decisions/adr-0062-la-page-parametres-devient-une-carte-et-cinq-onglets.md) | La page Paramètres devient une carte, et cinq onglets | 🟡 Proposé | 2026-08-19 |
| [0063](docs/decisions/adr-0063-suspendre-zetis-est-un-sixieme-regulateur.md) | Suspendre ZETIS est un sixième régulateur, pas un interrupteur | 🟡 Proposé | 2026-08-19 |
| [0064](docs/decisions/adr-0064-redemarrer-un-worker-est-un-geste-de-superviseur.md) | Redémarrer un worker est un geste de superviseur — l'écran ne fait qu'appuyer | 🟡 Proposé | 2026-08-19 |
| [0065](docs/decisions/adr-0065-une-archive-jamais-restauree-n-est-pas-une-sauvegarde.md) | Une archive jamais restaurée n'est pas une sauvegarde | 🟡 Proposé | 2026-08-19 |
| [0066](docs/decisions/adr-0066-restaurer-est-un-swap-au-reveil-suspendu.md) | Restaurer est un swap à réveil suspendu, et le mot se mérite dans les deux sens | 🟡 Proposé | 2026-08-19 |
| [0067](docs/decisions/adr-0067-un-geste-qui-s-evanouit-n-est-pas-un-geste-reussi.md) | Un geste qui s'évanouit n'est pas un geste réussi | 🟡 Proposé | 2026-08-21 |

