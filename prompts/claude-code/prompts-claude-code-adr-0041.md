# Prompts Claude Code — chantier ADR-0041

> **Trois sessions, jamais une.** Chaque bloc « SESSION » se colle tel quel dans une session Claude
> Code neuve, **après `/slice`**. Entre deux sessions : le geste git de clôture, puis celui
> d'ouverture de la suivante.
>
> **Prérequis absolu — et il se joue en deux gestes, pas un** (`docs/WORKFLOW.md` §2bis,
> `/ouverture` §1 et §3) :
>
> 1. sur **`main`** : `docs/decisions/adr-0041-*.md` **et** la ligne de `DECISIONS.md`.
>    ⚠️ `DECISIONS.md` ne va **JAMAIS** sur une branche — deux branches qui l'éditent = conflit
>    garanti ;
> 2. sur **`feat/barre-de-production`** : la spec, la maquette et ce fichier de prompts. *La branche
>    naît avec ses documents*, et leur commit est le **premier** de la branche.
>
> Les prompts référencent ces documents par leur chemin et n'en recopient pas le contenu : la
> re-spécification dans un prompt crée une seconde source qui dérive.

---

## Protocole commun aux trois sessions

```txt
PROTOCOLE DE SESSION — non négociable

1. Graphify d'abord. Mets à jour l'index du dépôt avant toute lecture ciblée.

2. Read-before-code. Lis intégralement les fichiers de la liste « À LIRE AVANT D'ÉCRIRE » avant
   d'écrire une ligne, et RENDS UN RAPPORT de ce qui était faux dans le cadrage. Les sources
   réelles invalident régulièrement les hypothèses — c'est attendu, pas exceptionnel.

3. Stop-on-blocker. Si une lecture contredit le document de référence, ARRÊTE-TOI et remonte la
   contradiction. N'improvise pas une résolution. N'écris pas « je suppose que ».

4. Les découvertes remontent dans les docs. Toute divergence entre le code réel et un document
   se corrige DANS le document, dans le même commit.

5. Aucun chemin inventé. Vérifie l'existence réelle de chaque module, table, route et composant
   avant de t'en servir.

6. ⚠️ PIÈGE DE TEST PROPRE À CE CHANTIER, déjà payé une fois.
   apps/backend/app/tests/conftest.py INTERDIT toute connexion Redis et remplace les FABRIQUES
   de file (_redis, production_queue, render_queue) par une FakeQueue, via un fixture autouse.
   → Patcher `enqueue_production` ou `enqueue_render` est VERT ET SANS EFFET : runs_router les
     importe au niveau module. LE POINT DE GREFFE EST LA FABRIQUE.
   → Aucun test ne prouvera qu'une barre avance. Les verrous portent sur L'APPEL (« ce chemin a
     bien enfilé, avec ces arguments, sur cette file »), jamais sur l'exécution.
   → Corollaire : tout test-verrou que tu écris ici, tu le VÉRIFIES PAR SABOTAGE. Casse la
     règle, observe le test rougir, remets. Un verrou non saboté ne vaut rien — c'est arrivé
     trois fois dans ce dépôt.

7. Checklist de clôture (9 points) :
   fichiers touchés · migrations · routes nouvelles · requêtes nouvelles · suites de tests
   (backend / Papa / Massimo, avant → après) · tsc -b et vite build · vérifié à l'écran (par qui,
   sur quelles données) · docs mis à jour · résidus et dettes assumées.
```

---

## SESSION A — le socle et la preuve

**Branche** : `feat/barre-de-production`, créée depuis un `main` à jour.

```txt
Chantier : ADR-0041 Slice A — tout ce qui produit se voit, sur UN producteur d'abord.

DOCUMENT DE RÉFÉRENCE
  docs/decisions/adr-0041-tout-ce-qui-produit-se-voit.md — §1, §2, §3, §5, §6, §7, §8, §12,
  §13, §14. Les §10 et §11 sont la Slice B ; le §4 (migration de masse) et le §9 sont la Slice C.
  docs/frontend-papa/barre-de-production.md — la spec d'écran, intégralement.
  docs/frontend-papa/mockup/maquette-papa-barre-production.html — les cinq états et l'échelle
  de repli, avec ses seuils mesurés.

CE QU'ON CONSTRUIT, EN UNE PHRASE
  Une tranche VERTICALE : le registre côté serveur, la file avec sa priorité, l'endpoint
  d'activité, UN SEUL producteur migré (equip_notion), et la barre du header branchée dessus.
  Verticale et non horizontale, pour qu'elle soit VISIBLE ET VÉRIFIABLE EN VRAI avant qu'on
  généralise à vingt producteurs.

À LIRE AVANT D'ÉCRIRE
  app/db/models/ai.py                      — AIJob : il n'a AUCUN index, et son statut "queued"
                                             n'est employé par personne
  app/db/models/production.py              — ProductionRun, ProductionEvent, les vocabulaires
                                             fermés (TRIGGERS, RUN_STATUSES, EMITTED_TRIGGERS)
  app/core/queue.py                        — les fabriques, les deux files, et l'absence de filet
                                             sur enqueue_* (à NE PAS corriger ici : Slice B)
  app/production_worker.py                 — SimpleWorker, concurrence 1, with_scheduler=True
  app/modules/production/runs.py           — create_run, run_out, active_run, is_stale,
                                             close_stale_runs, les cinq régulateurs
  app/modules/production/runner.py         — execute, la préemption, le commit PAR NOTION
  app/modules/production/journal.py        — run_status() : le Journal sait dire `stale`,
                                             run_out() ne l'applique PAS. C'est le §1.
  app/modules/ai/router.py                 — JobOut, qui n'expose pas error_message
  app/modules/eli5/service.py              — _run_traced : le patron actuel, avec son flush()
  apps/worker-media/worker_media/jobs.py   — le patron CIBLE : AIJob créé et COMMITÉ d'emblée
  app/modules/reports/router.py            — la route equip-notion, aujourd'hui synchrone
  app/modules/production/equipment.py      — equip_notion, les cinq pièces séquentielles
  app/tests/conftest.py                    — le fixture autouse (voir protocole §6)
  frontend-papa/src/layouts/PapaLayout.tsx           — le header et la pastille actuelle
  frontend-papa/src/hooks/useRunProgress.ts          — LA DOCTRINE. À étendre, jamais à réécrire.
  frontend-papa/src/hooks/useActiveProductionRun.ts  — sondage 4 s, détection de fin par id
                                                       mémorisé, et le motif « Papa SEULEMENT »
  frontend-papa/src/components/ActiveProductionModal.tsx
  packages/ui/src/components/generation-progress.tsx — le mode indéterminé, déjà écrit

PÉRIMÈTRE — ce qui est DANS
  1. AIJob devient un TRAVAIL (§3) : la route crée la ligne en "queued" ET COMMITE, puis enfile ;
     le worker la passe running → succeeded/failed. Le flush() de _run_traced RESTE pour les
     producteurs non migrés — ils durent des millisecondes et n'ont pas à apparaître.
  2. Migration (§14) : ai_jobs + acknowledged_at + index (status, created_at DESC)
     + index (job_type, status) ; production_runs + acknowledged_at. AUCUN backfill.
     🔴 AUCUNE colonne d'origine sur ai_jobs — corrigé au read-before-code du 2026-08-06.
        `db/models/production.py` l'interdit en tête de fichier (« trigger vit ici et nulle part
        ailleurs »), et un lot agenda de 31 notions produirait 155 AIJob portant 155 copies du
        même fait. L'origine se DÉRIVE : scan_agenda et scan_requests passent tous deux par
        create_run, donc hors lot ⇒ manual, toujours.
     ⚠️ Ne réutilise PAS created_by — il porte l'ACTEUR ("child", "worker-media").
     ⚠️ N'ajoute PAS non plus de colonne pour la file : elle se dérive de la même façon.
  3. Deux files (§5) : le worker écoute la prioritaire d'abord. trigger="manual" → prioritaire,
     tout le reste → normale. Le travail en cours n'est JAMAIS interrompu.
  4. GET /api/production/activity (§2, §13), dans le module `production` — ni reports, ni ai.
     Une requête agrégée, aucun N+1, require_parent.
  5. POST /api/production/activity/{kind}/{id}/ack — l'acquittement, serveur (§8).
  6. JobOut expose error_message. Un job failed est aujourd'hui MUET côté client.
  7. run_out() applique run_status() (§1) — correction, pas fonctionnalité : un lot zombie
     apparaît aujourd'hui `running` dans le header.
  8. equip_notion migré : POST /class-council/equip-notion rend un job au lieu de tenir la
     requête. C'est le SEUL producteur migré dans cette slice.
  9. La barre : pilule au centre du header + liseré au bord inférieur, les CINQ états de la
     spec, l'échelle de repli avec ses seuils (980 / 880 / 800), en REQUÊTES DE CONTENEUR.
 10. ActiveProductionModal étendu : une liste, l'ordre de la file, l'origine de chaque travail,
     les échecs avec leur bouton.
 11. Les DEUX constantes EQUIP_MS meurent (ConseilClasseIAPage.tsx:26 et
     SubjectDetailRow.tsx:13) — c'est le motif d'origine du chantier.

PÉRIMÈTRE — ce qui est DEHORS
  - Les trois trous de durabilité (§10) : c'est la Slice B. N'AJOUTE PAS de retry, ne touche pas
    à enqueue_*, ne rends pas close_stale_runs périodique.
  - Les autres producteurs (§4) et les 21 autres constantes (§9) : c'est la Slice C.
  - La persistance Redis et docker-compose.prod.yml (§11) : dettes nommées, non traitées.
  - apps/worker-ai/ : un README de trois lignes. On n'y touche pas.
  - Toute surface Massimo (§12). require_parent de bout en bout.
  - Les compositions pur-DB : elles n'entrent pas dans la file.
  - Annuler / relancer / mettre en pause un travail.

CRITÈRES D'ACCEPTATION
  - Un équipement lancé depuis Progression rend la main IMMÉDIATEMENT, et la barre du header
    l'affiche jusqu'à son terme.
  - Le même équipement lancé depuis le Conseil de classe affiche LA MÊME CHOSE AU MÊME MOMENT.
  - Un lot en file affiche « en file d'attente » avec une barre INDÉTERMINÉE — jamais 0 %.
    (test-verrou, à saboter)
  - Worker arrêté → « en attente — aucun moteur de production actif », jamais « en file ».
    Le test porte sur `=== false`, jamais sur la falsité. (test-verrou, à saboter)
  - Un lot rend `7 / 31 · 23 %` (pct_is_measured true) ; un travail unitaire rend `≈ 40 %`.
  - Un échec reste affiché jusqu'au clic sur « J'ai vu », et ne revient pas après rechargement.
  - Changement de route : la barre survit et ne repart pas de zéro.
  - Aucun libellé tronqué de 432 à 1072 px de header (la seule ellipse admise est un nom de
    notion long à pleine largeur). Un échec et un arrêt gardent leur mot à TOUTE largeur.
  - Suites backend + Papa vertes, tsc -b et vite build propres.

🔴 VÉRIFICATION À L'ÉCRAN — CETTE SLICE NE PEUT PAS ÊTRE MERGÉE SANS
  EQUIP_MS existe depuis des semaines et sa barre n'a JAMAIS été vue tourner une seule fois.
  Cinq chantiers d'affilée ont été mergés sans œil humain. Le protocole §6 dit pourquoi aucun
  test ne comblera ce trou.
  Avant toute PR, dans le vrai navigateur, sur la base de dev :
    1. un équipement RÉEL depuis Progression, sur une notion sans kit, la barre observée SUR
       TOUTE SA DURÉE — pas seulement à son apparition ;
       ⚠️ coût assumé : equip_notion génère ET auto-valide un kit entier.
    2. le même depuis le Conseil de classe ;
    3. un travail lancé puis changement de route ;
    4. un travail mis en file derrière un lot : « +N en attente » et l'ordre du §5 ;
    5. un échec provoqué (worker arrêté) ;
    6. responsive, aux trois seuils de l'échelle de repli.

DOCS À METTRE À JOUR DANS LE MÊME COMMIT
  API_SPEC.md (/activity, l'ack, JobOut enrichi) · DATA_MODEL.md (les deux colonnes, les trois
  index, les deux natures d'absence de trigger) · GLOSSARY.md (« Travail » vs « Lot » — le
  chantier crée deux mots voisins) · TROUBLESHOOTING.md (« la barre dit arrêté ») · CHANGELOG.md.

COMMIT
  feat(production): every producer becomes a queued, visible job
```

### Geste git de clôture A

```bash
git push -u origin feat/barre-de-production
gh pr create --fill

git checkout main && git pull
git rev-parse main origin/main        # DOIVENT être identiques — parade du #90
gh pr merge --squash --delete-branch
git ls-remote --heads origin          # branche disparue des deux côtés
```

Puis **mettre à jour `MEMORY.md` sur `main`** (étape 4bis, `docs/WORKFLOW.md` §5) et pousser.

---

## SESSION B — la durabilité

**Branche** : `fix/production-rien-ne-se-perd`, créée depuis un `main` à jour **incluant la
Slice A**.

```txt
Chantier : ADR-0041 Slice B — rien de ce qui est enfilé ne se perd, et aucun échec ne disparaît.

DOCUMENT DE RÉFÉRENCE
  docs/decisions/adr-0041-tout-ce-qui-produit-se-voit.md — §10 et §11 uniquement.

POURQUOI MAINTENANT, ET PAS APRÈS LA MIGRATION DE MASSE
  Une barre qui ment sur un producteur mentira sur vingt. La Slice A a rendu la production
  VISIBLE ; tant que ces trois trous sont ouverts, elle peut afficher « en cours » sur un
  travail que plus rien n'exécute.

À LIRE AVANT D'ÉCRIRE
  app/core/queue.py                — enqueue_production et enqueue_render, SANS try/except
  app/modules/production/runs.py   — create_run : le ProductionRun est COMMITÉ (l. ~390) AVANT
                                     l'enfilement ; is_stale ; close_stale_runs et son unique
                                     appel opportuniste depuis create_run
  app/modules/capsules/service.py  — request_render : la capsule passe en "rendering" AVANT
                                     l'enfilement. MÊME trou, autre table.
  app/modules/production/jobs.py   — scan_triggers et sa REPLANIFICATION en finally :
                                     c'est le réveil auquel le balayage se greffe
  app/modules/production/runner.py — les échecs structurels (notion orpheline, gate non franchi)
  app/tests/conftest.py            — voir protocole §6

PÉRIMÈTRE — ce qui est DANS
  1. L'enfilement devient SÛR. L'objet n'est pas commité avant que son enfilement soit acquis.
     File injoignable → le travail n'est pas créé, ET LA ROUTE LE DIT. Plutôt qu'un lot fantôme
     en base et un 500 dans le navigateur.
     ⚠️ Vaut pour les DEUX chemins : production ET rendu de capsule.
  2. Retry BORNÉ ET TYPÉ : deux tentatives sur échec TRANSITOIRE (moteur injoignable, timeout),
     ZÉRO sur échec STRUCTUREL (notion orpheline, prérequis absent, gate non franchi).
     Le verdict structurel remonte IMMÉDIATEMENT à la barre — une notion orpheline est
     insatisfaisable par construction, la rejouer ne fait que retarder le verdict en brûlant
     le GPU.
  3. Balayage périodique des travaux zombies : close_stale_runs cesse d'être opportuniste et se
     greffe sur le réveil DÉJÀ EN PLACE.
     ⚠️ AUCUN ordonnanceur nouveau. L'adr-0023 en a refusé un et l'adr-0041 ne le rouvre pas.
  4. La barre rend l'état « arrêté » d'un travail zombie sans que Papa ait à cliquer ailleurs.

PÉRIMÈTRE — ce qui est DEHORS
  - La persistance Redis (AOF) et le service worker manquant de docker-compose.prod.yml :
    §11, dettes NOMMÉES. On ne les traite pas — l'environnement n'est déployé nulle part, on
    écrirait du non-vérifiable.
  - Lire la FailedJobRegistry de RQ pour rejouer : hors périmètre. Le retry vit à l'enfilement.
  - Tout nouveau producteur : c'est la Slice C.
  - Augmenter la concurrence du worker. Un seul Ollama, un seul GPU.

CRITÈRES D'ACCEPTATION
  - Redis coupé → POST /production/runs ne laisse AUCUN ProductionRun en base, et rend une
    erreur qui dit quoi. (test-verrou, à saboter)
  - Idem pour le rendu de capsule : aucune capsule ne reste en "rendering".
  - Un échec transitoire simulé est rejoué deux fois ; un échec structurel ZÉRO fois.
    (test-verrou, à saboter — le second est le plus important)
  - Un lot dont le heartbeat est ancien passe en échec SANS qu'un clic de Papa l'ait déclenché.
  - Suites backend + Papa vertes.

VÉRIFICATION À L'ÉCRAN
  Worker arrêté pendant un lot en cours → la barre passe à « arrêté » d'elle-même, et l'échec
  reste jusqu'à acquittement.

DOCS À METTRE À JOUR DANS LE MÊME COMMIT
  TROUBLESHOOTING.md (les trois pannes et leur signature à l'écran) · ADR-0041 §11 si l'une des
  deux dettes a changé de nature · CHANGELOG.md.

COMMIT
  feat(production): nothing enqueued is lost, and no failure disappears
```

---

## SESSION C — la migration du reste

**Branche** : `refactor/une-seule-source-de-progression`, depuis un `main` incluant A et B.

```txt
Chantier : ADR-0041 Slice C — les 21 constantes de durée meurent, et tous les producteurs LLM
longs entrent dans la file.

DOCUMENT DE RÉFÉRENCE
  docs/decisions/adr-0041-tout-ce-qui-produit-se-voit.md — §4 et §9.

LE DÉFAUT, EN CHIFFRES (mesuré au cadrage, à re-vérifier au read-before-code)
  23 surfaces Papa affichent une barre, chacune avec sa durée en dur.
  La rédaction d'un cours porte CINQ durées différentes : 45 s (lib/production.ts:41),
  42 s (LessonContentModal.tsx:89), 50 s (OrphanNotionsPanel.tsx:162),
  50 s (NotionRequestActionModal.tsx:39), 22 s (ProgrammePage.tsx:34).
  equip_notion en portait QUATRE (deux mortes en Slice A ; restent 60 s/notion dans
  ChampionMissionModal.tsx:27 et 69 s/notion dans lib/production.ts:190).
  Mindmap : 32 s vs 30 s. Quiz : 60 s vs 30 s.
  ⚠️ UNE SEULE de ces valeurs a jamais été mesurée : 69 s/notion, le 2026-08-02.

PÉRIMÈTRE — ce qui est DANS
  1. Migrent en file : les cinq générateurs (cours, fiche, cartes SRS, quiz, mindmap),
     curriculum_* (chapitres, leçons, skills-backfill), capsules (script ET voix), diagnostic.
  2. Chaque surface appelante apprend à SONDER au lieu d'attendre — la barre locale reste là
     où le geste a eu lieu (§9), elle change seulement de SOURCE.
  3. Les constantes de durée en dur disparaissent des composants Papa.
  4. Test-verrou : aucune constante de durée en millisecondes ne subsiste dans un composant
     Papa pour un travail migré. (à saboter)

PÉRIMÈTRE — ce qui est DEHORS
  - Les compositions pur-DB sans LLM : create_missions_from_reco, create_champion_from_reco,
    champion/preview, generate_remediation|revision|progression, confirm_skills_backfill.
    Les enfiler dégraderait un geste instantané pour rien.
    ⚠️ create_champion_mission est MIXTE : il entre par ses equip_notion, pas par sa composition.
  - L'ingestion RAG : reste synchrone en v1 (§4).
  - Toute surface Massimo — elle n'a AUCUNE barre, et c'est délibéré (adr-0026 §4).
  - Le rendu MP4 : déjà asynchrone. Il rejoint /activity, il ne change pas d'exécution.

CRITÈRES D'ACCEPTATION
  - Chacun des producteurs migrés rend la main immédiatement et apparaît dans la barre.
  - Lancer un cours depuis les CINQ écrans qui le permettent affiche LA MÊME durée et LE MÊME
    avancement — c'est tout l'objet de la slice.
  - Le test-verrou des constantes rougit si l'on en réintroduit une.
  - Suites backend + Papa vertes, tsc -b et vite build propres.

VÉRIFICATION À L'ÉCRAN
  Au moins TROIS producteurs différents lancés en vrai, dont un depuis deux écrans distincts.
  Et un empilement : trois travaux en file, l'ordre du §5 vérifié à l'œil dans la modale.

DOCS À METTRE À JOUR DANS LE MÊME COMMIT
  Les specs de page qui décrivaient une barre locale · API_SPEC.md · CHANGELOG.md.

COMMIT
  refactor(papa): one source of truth for every progress bar
```

---

## Après la Slice C

Relire l'ADR-0041 § « Le signal qui dirait qu'on s'est trompé » avec le dispositif en main, et
consigner dans `MEMORY.md` ce que la production réelle a montré — en particulier si le compteur
« +N en attente » monte sans redescendre : ce serait la concurrence 1 devenue le vrai plafond, et
c'est le nombre de moteurs qu'il faudrait rouvrir, pas l'ordre de la file.
