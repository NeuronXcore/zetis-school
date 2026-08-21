# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.
## État à la reprise

> 🎬 **CADRAGE DU JOUR — `ADR-0067` « Un geste qui s'évanouit n'est pas un geste réussi »**
> (2026-08-21, écrit sur `main`, **aucune ligne de code**). Lot Décision **non committé** au moment
> où ceci s'écrit : l'ADR, `DECISIONS.md` **régénéré**, `BACKLOG.md` (phase E 7,5 → **8,5**) et ce
> fichier. **Prochain pas : commiter ce lot, PUIS `/ouverture` — surtout pas l'inverse**, la
> commande s'arrête si elle voit `DECISIONS.md` modifié sur une branche.
>
> **Ce qui est décidé** — comment la fin d'un geste 💾 (Sauvegarder · Vérifier · Restaurer) se
> raconte à Papa : une **attente armée** par son propre 202, bornée par cinq conditions, qui meurt
> avec sa réponse (ce n'est donc **pas** le sondage que l'ADR-0062 §5 interdit — l'onglet 💾 n'a
> aucun champ à faire bouger sous les doigts) · le sidecar rend un **verdict** et le champ publié
> `restauree_le` est **remplacé**, pas doublé · **succès → toast éphémère, échec → état persistant,
> jamais un toast** (ADR-0041 §8).
>
> 🔴 **LE TROU TROUVÉ AU READ-BEFORE-CODE, et il vaut plus que le toast lui-même** : une
> restauration qui échoue **APRÈS le swap** n'écrit **nulle part**. `run_ai_job` fait
> `echoue = db.get(AIJob, job_id)` sur une ligne partie dans `zetis_avant`, obtient `None`, et
> **renonce en silence** — ni Échecs, ni barre, ni Journal. La même panne est visible ou invisible
> selon la seconde où elle tombe. Et l'information **existe déjà** : `_JournalRestauration.echouer()`
> écrit l'étape fautive + son motif dans le sidecar, qui survit au crash — mais `GET /donnees` n'en
> lit **qu'une clé**, `termine_le`. *Le chantier n'a pas à produire l'information, il a à cesser de
> la jeter.*
>
> **Mesures faites (à ne pas refaire)** : une restauration réelle = **1,738 s** bout en bout, 8/8
> étapes, swap à +0,736 s, sur **9 172 lignes / 76 fichiers audio** (sidecar
> `zetis-2026-08-19-1844.tar.restauration.json`, cible dev) · prod `backup_create` **0,20 s** /
> `backup_verify` **0,29 s** mais ⚠️ **sur 220 lignes et ZÉRO média** — ne prédit rien, ne sert de
> seuil à rien · la barre sonde à **4 s** et l'annonce de fin (`ProductionDoneModal`) ne couvre
> **que les lots** · le composant `Toast` n'a **qu'un seul usage** dans tout le front Papa
> (`DemandesPage.tsx`), jamais dans `DonneesTab` · **la session Papa survit au swap** (JWT sans
> état, `decode_token` ne touche jamais la base).
>
> ⚠️ **Deux choses NON mesurées, écrites comme telles dans l'ADR** : la borne de renoncement du
> §1.5 (impossible à mesurer — la seule restauration réelle porte sur 9 172 lignes, la prod en
> compte 220 ; d'où un renoncement qui **ne rend aucun verdict**) et **ce que répond `GET /donnees`
> PENDANT la fenêtre de swap** — l'attente y tombera par construction, et une erreur de lecture
> là-dedans ne doit **pas** se lire comme un échec du geste. Les deux sont au §Suivi.
>
> ✅ **PIÈGE D'OUTILLAGE TROUVÉ AU CADRAGE, PUIS CORRIGÉ DANS LA FOULÉE (2026-08-21)** —
> `gen_frontmatter.py --write` tronquait `annexes/rapport-revocations.md`. La boucle faisait
> `continue` sur tout ADR ayant **déjà** son front-matter **avant** de collecter ses révocations,
> puis rouvrait le rapport en `open("w")`. Les 67 ADR étant tous pourvus, le rapport se
> reconstruisait **à partir du seul ADR neuf** : **27 ADR / 85 lignes réduits à 1 / 1**.
>
> 🔴 **L'enseignement n'est pas le bug, c'est son INTERMITTENCE.** Le fichier n'est réécrit que
> `if rapport` — or les ADR **0061→0065 ne portent AUCUNE ligne de révocation** (mesuré en
> exécutant la vraie `_revocations`, pas en grepant : un grep naïf compte aussi les lignes
> `revoque:` du front-matter, que `lire()` saute). Cinq cadrages ont donc lancé le script **sans
> rien casser**, et le sixième a tout effacé. *Un piège qui ne mord qu'une fois sur six a l'air
> réparé entre deux morsures — d'où un verrou plutôt qu'une relecture attentive.*
>
> **Correctif** : la collecte se fait pour **tous** les ADR chargés, avant le `continue`. Le garde
> `and rapport` est conservé mais change de rôle — il masquait le défaut, il devient le filet
> contre une régénération creuse. **Vérifié** : rapport **171 → 185 lignes**, **zéro ligne perdue**
> (`comm -23` contre la version commitée), régénération reproductible, les 67 ADR inchangés.
> Trois verrous dans `apps/backend/app/tests/test_rapport_revocations.py`, **chacun éprouvé rouge
> à la contre-épreuve** : comportemental sur registre jouet · complétude sur le vrai registre ·
> non-rétrécissement en COMPTE.
>
> ⚠️ **Deux leçons de manœuvre payées ici** : ① la vérification du diff a rattrapé une suppression
> que j'avais d'abord classée « bruit » **à tort** — le tri à l'œil sur un diff de 165 lignes n'est
> pas une vérification ; ② un test qui fabrique de faux ADR **ne doit jamais écrire leur numéro en
> majuscules** : `check_adr_refs.sh` balaie tout `.py` du dépôt et devient ROUGE. Le premier jet du
> test est tombé dedans, **et le commentaire qui l'expliquait aussi**.
>
> 🧭 **Le classement en cas 3 a été vérifié, pas supposé** (c'est le piège que l'ADR-0060 nomme) :
> ce n'est pas une **application**, parce qu'aucune règle ne dit qu'un geste enfilé annonce sa fin
> et que le seul mécanisme existant est **structurellement inapplicable** ici (la ligne meurt au
> swap) ; c'est un cas 3 par la **seconde** branche — annulation > 1 commit (champ publié remplacé
> + exception taillée dans une règle décidée), **pas** par une migration : il n'y en a aucune.
> ⚠️ **La formulation et le rendu du toast restent une SURFACE (cas 4)** : ils se décideront devant
> l'écran, dans la même session que la relecture visuelle — pas dans cet ADR.

> **Où en est le dépôt** (2026-08-21 — étape 4bis FAITE, **quatre fois** ce jour) — `main` =
> `origin/main`, rien à pousser, **aucune branche de chantier vivante**
> (`chore/piege-pre-push-worktree`, `chore/la-case-cochee-ne-suffit-pas`,
> `chore/carte-des-ports` puis `fix/emoji-zetis-ouvre-autonomie` supprimées au merge, distantes
> ET locales — la dernière vérifiée par un 404 de l'API).
>
> ⚡ **④ « L'EMOJI ZETIS MÈNE À L'AUTONOMIE » — MERGÉ (PR #173, squash `1a8d3b2`)**, cas **2**
> `adr-0060` (application — aucun ADR, mais la règle exécutée est citée : **ADR-0062 §5**,
> *« l'onglet vit dans l'URL »*). Solde la demande « Sidebar Papa » de la liste À CASER
> (2026-08-19). Le bloc ZETIS de la barre **montre** l'autonomie et menait à `/parametres`,
> donc à la carte : il **dupliquait exactement** l'entrée ⚙️ Paramètres de `PAPA_NAV` — deux
> portes pour la même pièce, dont aucune n'ouvrait sur la bonne. Il mène désormais à
> `/parametres?onglet=autonomie`.
>
> **Verdicts du read-before-code (à ne pas re-vérifier)** : le mécanisme d'onglet par URL
> existait **de bout en bout** (`ParametresPage` lit `?onglet=`, `estOngletRendu` le garde,
> `ParametresPage.onglets.test.tsx` le prouve) — **rien n'a été construit, une ligne a changé** ·
> la carte reste la porte et le défaut de la page (ADR-0062 §1), servie par l'entrée ⚙️, non
> touchée · `EtatZetis` n'utilise pas `isActive` (className fixe), le `?query` ne perturbe donc
> rien.
>
> 🔴 **Verrou neuf contre un repli SILENCIEUX** : `estOngletRendu` retombe sur la carte **sans
> rien dire** si l'onglet est inconnu — filet voulu pour les signets périmés, mais qui avalerait
> ce lien-ci au premier **renommage d'onglet**, l'écran ayant l'air de marcher. Le test lie la
> cible à la **liste `ONGLETS`**, pas à une chaîne recopiée. Contre-épreuve : l'ancien lien ET un
> id inexistant rendent chacun 2 rouges, les bons. ⚠️ **Un test existant a été modifié** (il
> assertait `href="/parametres"`) — c'est le comportement qui change, pas un verrou assoupli ; son
> autre assertion (« aucun bouton : ce bloc lit, il ne règle pas ») est conservée.
>
> ✅ **Relecture visuelle FAITE** par le commanditaire sur la paire de dev avant le commit — la
> dette « sept merges d'affilée sans relecture » n'a pas resservi ici.
>
> 🧾 **Noté, non traité** : le nom accessible du lien dit « Ouvrir les Paramètres ». Il reste
> **vrai** (l'onglet est dans les Paramètres) mais moins précis que « — Autonomie ». Un libellé
> est une **surface** (cas 4 `adr-0060`) : se décide devant l'écran, pas en passant.
>
> 🔴 **LEÇON DE MANŒUVRE, payée QUATRE fois ce jour** : « c'est mergé » annoncé alors que l'API
> répondait `state: open` / `merged: false` — trois fois de suite sur la #173, une sur la #172.
> Diagnostic fait au 3ᵉ coup : rien ne bloquait (MERGEABLE/CLEAN, 4 checks verts, droits admin,
> aucune revue requise) et **la chronologie de la PR ne portait aucune tentative** — le geste
> n'atteignait pas le serveur (formulaire web dont la 2ᵉ confirmation échappe). Résolu en lançant
> `gh pr merge <n> --squash --delete-branch` **depuis la session** — sans confirmation
> intermédiaire, il passe du premier coup. ⚠️ *Le 4bis a été REFUSÉ les trois fois : vérifier
> `gh pr view <n> --json state,mergedAt` AVANT d'écrire quoi que ce soit, jamais sur parole.*
>
> 🔌 **③ « LA CARTE DES PORTS » — MERGÉ (PR #172, squash `6f3a89f`)**, cas **1** `adr-0060`
> (rangement : rien n'est décidé, aucun ADR). Trois commits squashés, 11 fichiers, +638/−23.
> Né d'une question posée **deux fois dans la même journée** (« quels ports pour le dev, pour la
> prod ? ») : la réponse vivait éparpillée entre deux compose, `launch.json` et une table de
> `DEPLOYMENT.md` **périmée** (elle donnait 8000/5173/5174 comme ports « de dev » — ce sont les
> canoniques que la prod tient — ignorait les paires et annonçait joignable une console MinIO
> inerte). Livré : **`docs/devops/ports.md`** source unique · **`pnpm ports`**
> (`scripts/carte_des_ports.py`) dont les libellés sont **DÉRIVÉS** de `launch.json` et des
> compose — ADR-0062 appliqué à l'outillage, une paire ajoutée apparaît sans qu'on touche au
> script · son verrou `test_carte_des_ports.py` · les renvois depuis `DEPLOYMENT.md` et
> `infra/docker/README.md` (dont la plage de paires, restée à `8001→8004`, corrigée en
> `8001→8005`). ✅ **Dette 5177 SOLDÉE au passage** : `papa-srs` retiré — **doublon exact de
> `papa-dev`** (même frontend, même backend 8001), reliquat du 2026-07-04 d'une slice SRS close ;
> collision signalée deux fois ici et jamais traitée. Aucune donnée touchée, `launch.json`
> n'étant lu par **rien** à l'exécution.
>
> 🔴 **Deux leçons du chantier, dans `TROUBLESHOOTING.md` (en tête)** : ① **un verrou de doc qui
> n'exige que le VOISINAGE de deux termes ne verrouille rien** — la 1ʳᵉ version restait VERTE sur
> une carte amputée de son avertissement, deux lignes de tableau se citant l'une l'autre sous les
> 400 caractères ; c'est le **terme** de heurt qui mord (pendant documentaire de « un verrou qui
> n'assert qu'une absence ne verrouille rien ») ; ② **macOS : un heredoc DANS une substitution de
> commande casse en bash 3.2**, et l'erreur accuse une ligne de Python correcte — d'où le script
> écrit en Python. ⚠️ Piège de manœuvre voisin : le **répertoire courant persiste** entre deux
> commandes d'une session — chemins absolus dans toute contre-épreuve (une l'a appris en
> détruisant un fichier dont la sauvegarde n'avait jamais été écrite).
>
> ⚠️ **Le merge a échoué une première fois sans le dire** : l'annonce « c'est mergé » est arrivée
> alors que `gh pr view` répondait encore `OPEN` / `mergedAt: JAMAIS`. Le 4bis a été **refusé** et
> la vérification refaite — la mémoire aurait sinon écrit un merge inexistant. *Vérifier l'état
> de la PR AVANT tout 4bis, jamais sur parole.*
>
> **Les deux chantiers doc précédents du jour** (cas 2 `adr-0060`, aucun ADR, doc pure) :
> ① « la case cochée ne suffit pas » — PR #170, squash `4f6baa4` : la condition hôte n°1 de
> l'autostart prod est neutralisable par BTM même cochée — diagnostic `sfltool dumpbtm` + parade
> LaunchAgent hors dépôt `com.atlas.docker-on-nx` (`TROUBLESHOOTING.md` +
> `infra/docker/README.md`) ; ② « le piège pre-push en worktree » — PR #171, squash `80916da` :
> un worktree d'agent n'a pas l'outillage (`.venv`/`node_modules`/`graphify-out` ne suivent
> pas), le hook y est toujours rouge — parade « pousser depuis le checkout principal », honnête
> à deux conditions (`TROUBLESHOOTING.md`, en tête). Les runs CI de `main` sur chaque squash
> attendus VERTS avant leur 4bis (parade du #169, réf `b29a985`). Chantier précédent : « le
> réveil clôt les fantômes » MERGÉ (PR #169, squash `0b7bdde`) — l'ADR-0066 soldé DE BOUT EN
> BOUT (#167/#168/#169), détail section ci-dessous. Ménage du 2026-08-21 : le worktree de
> session et les deux branches d'agent `claude/*` supprimés (vérifié : ancêtres de `main`, rien
> d'unique) — plus AUCUNE branche locale hors `main`, un seul checkout.
> ✅ **LE DÉMARRAGE AU BOOT EST PROUVÉ EN VRAI** (2026-08-21, ~09:40 — le Mac a redémarré, et
> personne n'a touché à rien) : le journal `~/Library/Logs/docker-autostart.log` porte
> `Docker.raw present, lancement Docker Desktop` **signé de l'agent de garde**, puis une
> seconde ligne `deja lance` une minute plus tard (l'événement `StartOnMount`, qui prouve
> l'idempotence en conditions réelles). Ensuite : 8/8 conteneurs `zetis-prod` Up, Massimo et
> Papa en **HTTP 200**. 🔴 **C'est bien l'agent qui a lancé Docker, pas la case** — le login item
> reste `disabled` côté BTM ; sans l'agent, ce reboot aurait reproduit la panne. *Décision tenue :
> laisser le toggle macOS sur off — l'agent est alors le seul lanceur, donc Docker ne peut jamais
> partir sans son disque.* Le dispositif s'auto-documente : si la prod manque un jour à l'appel,
> ce journal est la première chose à lire (`pnpm ports` en rend les 3 dernières lignes).
>
> **La prod est RECONSTRUITE et vérifiée à l'écran** (2026-08-19, nuit — après l'incident VM et
> le reboot du Mac) : 8/8 conteneurs `healthy` sur images neuves, `/backups` monté, cible
> certifiée lue à travers, **première archive prod vérifiée** (`zetis-2026-08-19-1817.tar`,
> « réussie »), Massimo et Papa rendus au vrai écran, consoles propres. Côté dev : **le reboot a
> tout fermé** — aucune paire (8001/5175, 8002/5178, 8005/5181 : ports libres, vérifié), aucun
> worker hôte ; le dev se relance à la demande (`launch.json` — la paire `*-restauration` y
> reste, avec son mensonge d'essai `SUPERVISED=true` commenté en face). ⚠️ **La base dev est un
> état restauré** (de l'archive `…-1844.tar`) : `zetis_avant` vit sur le serveur dev, suspension
> LEVÉE, plus rien en vol.

### ✅ CHANTIER SOLDÉ — « LE RÉVEIL CLÔT LES FANTÔMES » (ADR-0066 Amendement 1, cas 2) — MERGÉ (PR #169, squash `0b7bdde`), 4bis fait (2026-08-19)

**PROCHAIN PAS : rien n'est dû — le chantier est soldé, et le `prod:up --build` qui restait en
candidat a été JOUÉ le soir même** (preuve d'image + `/backups` + première archive prod
vérifiée — voir l'en-tête et les dettes ✅ ci-dessous). Les candidats du pas suivant, à
l'arbitrage du commanditaire : le chore sidebar (À CASER) · le toast + le lien Journal de la
barre (À CASER, même famille — « comment un geste sauvegarde se raconte à Papa ») · le prochain
sous-chantier de la phase E (occupation disque · purges/rétention · remises à zéro · export
RGPD) — chacun avec son cas `adr-0060` déclaré, et un `/cadrage` si c'est un cas 3. (Le candidat
« consigner le piège pre-push en worktree » du matin est SOLDÉ le jour même — PR #171, squash
`80916da`. La journée a soldé un **troisième** chantier non prévu, « la carte des ports » — PR
#172, squash `6f3a89f` — né d'une question de l'utilisateur, pas d'un candidat de cette liste.)

**FAIT (MERGÉ : PR #169, squash `0b7bdde` — 7 fichiers avec la clôture, +275/−214) :**

- `settings/sauvegarde.py` : `_ecrire_reveil(base, archive)` — après les upserts du réveil, sur
  la MÊME connexion, la **clôture des travaux d'une autre époque** : `ai_jobs` et
  `production_runs` en `queued|running` → `failed` + motif nommant l'archive + `finished_at`,
  `RETURNING id` → le détail de l'étape `reveil` du sidecar porte `travaux_clos`/`lots_clos`.
  Rien d'inséré, `succeeded`/`done` jamais touchés (le WHERE le garantit) — les critères de
  l'amendement mordent.
- Tests : l'ordre SQL asserté de `test_le_reveil_est_ecrit_avant_le_swap` intègre la clôture
  (upserts → UPDATE `ai_jobs` → UPDATE `production_runs` → terminate, WHERE `queued|running`
  seul, motif nommé) — **le SEUL test modifié, l'évolution que le §Suivi de l'amendement
  autorisait nommément** · un verrou unitaire neuf (`test_la_cloture_rend_les_ids…`, faux
  psycopg à curseur non vide : ids remontés, motif vérifié).
- Docs : `CHANGELOG 0.99.11` · `TROUBLESHOOTING.md` § essai (parade « à cadrer » → appliquée +
  le constat du chemin de preuve) · `API_SPEC.md` (la description du ③ dit la clôture) · le
  § chantier dans `prompts/claude-code/prompts-claude-code-adr-0066.md` (lot branche).
- **Tests : backend 1559/1559 (1558 + 1 neuf), papa 876/876, massimo 920/920 (zéro fichier
  front touché — les chiffres le prouvent).**

**PREUVE VIVANTE (jouée en dev, vue par le commanditaire en direct) :** déblocage manuel
documenté du fantôme pré-correctif #896 (admis au prompt — la barre s'est vidée sous les yeux
de l'utilisateur) → cycle frais : archive `…-1844.tar` (202 là où le fantôme rendait 409) →
vérifiée `reussie` → Restaurer + saisie → **8/8, zéro écart, `travaux_clos: [897]`** au sidecar
→ en base vivante `897 | failed | « Interrompu par la restauration… »`, **0 travail en vol**,
la barre l'affiche en **Échec acquittable** → **💾 Sauvegarder repart : 202**, archive
`…-1847.tar` née. Suspension levée à la fin.

**Verdicts du read-before-code (à ne pas re-vérifier) :** le fantôme bloquait AUSSI « Vérifier »
(refus famille) — le chemin de preuve de l'amendement (« rejouer `…-1756.tar` ») était
injouable tel quel, d'où le déblocage admis · `_ecrire_reveil` n'a que deux appelants (le geste
+ 3 tests structurels) · le Journal **exclut `created_by='file'`** par construction
(`journal_filters.py`) — le lien « Voir au Journal » de la barre mène sur du vide pour la
famille sauvegarde (observation utilisateur, pré-existant — voir À CASER).

**Ce que l'Amendement 1 décide** (ne pas re-débattre — le §Suivi, les critères et le signal
vivent dans l'ADR) : clore n'est pas falsifier (frontière du §3 précisée) · aucune ligne
insérée, aucun statut neuf, aucune migration · Échecs existant fait foi.

**EN COURS :** rien — le chantier est mergé, la branche supprimée, le 4bis fait.

**À FAIRE :** rien dans ce chantier. Les RÉSIDUS et DETTES ci-dessous restent des dettes
vivantes, pas des restes de travail.

**PIÈGES :** `TROUBLESHOOTING.md`, dans l'ordre du fichier — `graphify update .` depuis un
sous-dossier rebâtit une carte PARTIELLE sans un mot · le § essai (l'alias d'env
`PRODUCTION_WORKER_SUPERVISED` SANS préfixe · le fantôme et sa parade appliquée) · le § TCC du
script de certification · le 📖 RUNBOOK re-swap · les §§ `feat/restaurer-une-sauvegarde(-2)`
des slices mergées.

**RÉSIDUS de cette clôture (ne vivent QUE ici) :**

- **L'état DEV laissé par les essais du jour** : la base dev = l'état restauré de `…-1844.tar`
  (`zetis_avant` sur le serveur, suspension LEVÉE, 0 en vol) · dans ses `ai_jobs` : #896
  `failed` « Débloqué à la main… » (le fantôme pré-correctif, motif honnête) et #897 `failed`
  « Interrompu par la restauration… » (clos par le réveil amendé) — **tous deux à ACQUITTER par
  Papa dans Échecs** quand il veut · la cible dev `/Volumes/NX-Models/zetis-sauvegardes-dev`
  porte 3 archives réelles (`1844` restaurée · `1846` = filet du geste · `1847` = la preuve
  « repart ») + sidecars · l'utilisateur a supprimé `1756`/`1807` à la main via l'UI pendant
  l'essai (le sidecar de la 1re restauration est parti avec — « rien d'orphelin », voulu).
- ✅ ~~Paires d'essai et squatteurs~~ — **TOUT FERMÉ par le reboot du Mac** (2026-08-19, nuit) :
  8001/5175, 8002/5178, 8005/5181 libres et aucun worker hôte — vérifié port par port. Le
  ménage des vieilles paires (dette 0065) est soldé par la même occasion.
- ⚠️ **Les messages de refus/retour persistent après ⟳** dans l'onglet 💾 (hérité de la
  slice 3 du 0065) — signalé, non traité.
- ⚠️ **Trois boutons par ligne d'archive** : sur écran étroit le tableau défile
  (`overflow-x-auto`) — à juger si l'iPad de Papa est une cible.

**🧾 DETTES OUVERTES (REMONTÉES des élagages 0065 et 0066) :**

- 🔴 **Le chemin « tête plus ancienne » du §5 de l'ADR-0066 reste NON MESURÉ** — aucune archive
  d'une tête Alembic antérieure n'existe ; il se mesurera au premier vrai déploiement qui migre.
- ✅ ~~L'image Docker jamais reconstruite / `/backups` jamais monté~~ — **SOLDÉES le 2026-08-19
  au soir** : `prod:up --build` joué — images reconstruites (couche PGDG comprise), 8/8
  conteneurs `healthy`, `/backups` monté, certificat lu À TRAVERS le montage
  (`valable: True`, cible `/Volumes/NX-Models/zetis-sauvegardes`), et **la PREMIÈRE archive de
  PROD créée ET VÉRIFIÉE** (`zetis-2026-08-19-1817.tar`, verdict `reussie`, 0 écart,
  restaurable). ⚠️ Le chemin a traversé une vraie panne : VM Docker « storage device attachment
  is invalid » — créations de conteneurs pendues en silence, remède = reboot du Mac
  (`TROUBLESHOOTING.md`, section dédiée — volume vérifié SAIN, fausse piste File Sharing).
  Résidu : `/Volumes/NX-Models/secours/` existe et est VIDE (copie brute abandonnée au profit
  du filet produit) — à supprimer ou garder comme emplacement de secours.
- **Ménage machine** : le job d'essai `#890` (`failed` « Aucun exécutant ») traverse les
  restaurations dans les `ai_jobs` de DEV — à acquitter avec #896/#897 · kegs brew :
  `postgresql@16` (le BON) et `libpq` (redondant, désinstallable).
- **`mise-en-route.sh` n'installe pas le client PostgreSQL** : ajouter `postgresql@16` (jamais
  `libpq`). Dette outillage, chore à part.
- `API_SPEC.md` ne documente toujours pas les autres routes `/api/settings` (`/autonomy`,
  `/machine`, `/ecarts`, `/production-suspension`) — la note en tête de sa section 💾 le dit.
- 📌 `gen_tableau_amendements.py` **ne crée jamais le bloc** `> ### Amendements` : le premier
  amendement d'un ADR s'amorce à la main (vécu au cadrage de l'Amendement 1) — à documenter
  dans le script un jour.

### 📥 À CASER (hors chantier) — demandes notées en session

- ✅ ~~**Sidebar Papa : l'emoji du mode ZETIS doit ouvrir Paramètres SUR l'onglet Autonomie**~~ —
  **SOLDÉ le 2026-08-21** (PR #173, squash `1a8d3b2`). Le défaut réel n'était pas « le lien est à
  revoir » mais une **duplication** de l'entrée ⚙️ de la barre ; le mécanisme d'onglet par URL
  existait déjà, une ligne a suffi. Détail et verrou : l'en-tête ci-dessus.
- **Un toast ÉPHÉMÈRE qui confirme la restauration ou son échec** (demande utilisateur du
  2026-08-19 au soir, pendant l'essai du geste). À cadrer avant de coder, trois contraintes se
  croisent : la ligne du travail MEURT au swap (ADR-0066 §3) — le front n'a AUCUN événement de
  fin, le toast devrait naître d'une relecture qui découvre `restauree_le` (ou d'un sondage,
  interdit par adr-0062 §5) · « toast = retour d'action SEULEMENT » (ADR-0066 §7) — un toast de
  RÉSULTAT est une extension de doctrine à écrire · aucun système de toast n'existe chez Papa
  (les retours sont des `MessageGeste` inline). Cas `adr-0060` à déclarer (probablement 4 —
  surface — voire 3 si le mécanisme de découverte de fin devient une décision). **Même famille,
  observé par l'utilisateur le 2026-08-19 au soir** : le lien « Voir au Journal → » de la barre
  mène sur du VIDE pour la famille sauvegarde — le Journal exclut `created_by='file'` par
  construction (`journal_filters.py` : « les traces ne sont pas des travaux ») ; la barre, elle,
  affiche tout `queued|running`. À trancher ensemble : comment la fin (et la vie) d'un geste
  sauvegarde se raconte à Papa.

## ⬆️ REMONTÉ de l'élagage du 2026-08-19 — la journée du 2026-08-18 et la phase A (2026-08-19)

> Retirés : **la prod du Mac Studio** (#146, cohabitation dev/prod + `restart: unless-stopped`,
> CHANGELOG 0.99.3/0.99.4), **l'outillage** (#148 `mise-en-route.sh`, #149
> `check_media_integrity.py`, #150 kit `migration/`), **le compilateur** (#151/#152, CHANGELOG
> 0.99.7), **la séance prod** (#153-#155, CHANGELOG 0.99.7), **harnais CI + dictée** (#156/#157,
> CHANGELOG 0.99.2/0.99.6), **les deux flakes RTL** (#158/#159, tests seuls), **la phase A**
> (#160 page paramètres · #161 redémarrer un worker · #162 suspendre ZETIS · #163 libellé,
> CHANGELOG 0.99.8, ADR-0062/0063/0064), et les récits « machine muette et sourde » / « deux
> sessions pnpm dev » (2026-08-18, pièges relogés dans `TROUBLESHOOTING.md`). Les quatre
> contrôles passent — ⚠️ dont DEUX entrées `CHANGELOG` écrites à CETTE clôture (0.99.7, 0.99.8) :
> quatre PR de comportement avaient été mergées sans entrée. Voici ce qui reste **OUVERT**.

- 🟡 **Dette CI — quatre flakes NON REPRODUITS, donc sans diagnostic** : `CouverturePage`,
  `DashboardPage`, `ChatPage` › « offre implicite », et `ProgrammePage.test.tsx` › « pendant la
  génération : barre de progression estimée » (a rougi la PR #161 qui ne le touche pas ; 0/3 sous
  `ci-like.sh`, vert au rerun). Règle : **trouvé ≠ actionnable** — pas de correctif sans
  reproduction déterministe (méthode des #147/#158/#159). L'instrument est calibré (#156 :
  `--cpuset-cpus`, 4 vCPU).
- 🔴 **Une machine de DEV neuve repart muette et sourde côté natif** : `mise-en-route.sh`
  n'installe pas les extras `[tts]`/`[stt]` et ne vérifie pas les chemins d'un `.env` copié.
  Gestes à refaire sur le MacBook, non versionnables : `uv tool update-shell` (PATH graphify),
  `brew install gh` + `gh auth login`, `graphify update .` (la carte, 42 Mo, est gitignorée),
  et — si le MacBook doit porter les mêmes rôles que le Studio — les deux LaunchAgents :
  `com.atlas.docker-on-nx` (plist `~/Library/LaunchAgents/` + garde `~/bin/start-docker-if-nx.sh`,
  ne lance Docker que si `Docker.raw` est là — `TROUBLESHOOTING.md` § BTM du 2026-08-21) et son
  jumeau `com.atlas.ollama-on-ssd`, même patron.
- ⚠️ **Kit `migration/` : deux copies non synchronisées** (`scripts/migration/` relue ;
  `/Volumes/NX-Projects/` opérationnelle) — et **aucun script du kit n'a jamais été exécuté**
  depuis sa mise sous version : la prochaine migration sera le premier essai.
- 📌 **`docs/devops/docker-compose.md` est un placeholder obsolète** (services `api`/`worker-ai`,
  réseau `zetis-net` — rien n'existe). Rangement `chore/` à part.
- ⚠️ **PyYAML est dans le venv mais ABSENT de `pyproject.toml`** : tout verrou compose parse le
  YAML à la main (y compris le nouveau `test_compose_prod_backup.py`, à dessein). La dette
  elle-même n'est pas soldée.
- ⚠️ **Le watchdog de production a un CANAL INERTE** : `ALERT_EMAIL_TO` est dans le `.env` racine
  mais **`SMTP_HOST` manque**. Si le worker tombe, ça ne se voit que dans le bandeau Papa.
- 🟡 **`scripts/audit_contexte.sh` est entré dans `main` par accident** (squash de la #162).
  Vérifié sain (audit de docs, aucun secret). Décision utilisateur : le garder ou le retirer.
- 📌 **Un écho de la sur-promesse « à jour » subsiste** dans UN commentaire de test
  (`test_production_workers_restart.py:72`, « être relancé à jour » — la ligne 73 citée avant
  l'élagage était fausse d'une ligne, vérifié à cette clôture) — laissé à dessein (tests
  sans modification exigés par la #163) ; à ramasser au prochain passage dans ce fichier.
- ⚠️ **La carte de la page paramètres a menti deux fois le jour de sa livraison** (ses propres
  chantiers non reportés). Le signal écrit d'avance par l'ADR-0062 : « si elle dérive, elle doit
  être DÉRIVÉE, pas écrite » — à peser au prochain chantier de la page.
- 📌 **Pièges vivants sans section `TROUBLESHOOTING`, gardés ici** : `pnpm … typecheck` **ment en
  local** (`tsc -b` sert son `.tsbuildinfo`, exit 0 sur erreur — vérifier avec
  `exec tsc -b --force --noEmit`) · les `.env.local` posés sur le Mac Studio **ne voyagent pas**
  (machine neuve : c'est le repli 8001 qui protège) · `pnpm dev` **refuse** si la prod tient les
  ports canoniques — voulu, ne pas « réparer » · **ne jamais renommer** le job CI
  `frontends — vitest` (checks requis par NOM, `adr-0061` §1) · un redémarrage de conteneur se
  prouve **depuis l'intérieur** (`docker exec … kill -TERM 1`) — `docker compose kill` rend un
  faux négatif (`unless-stopped` exclut l'arrêt d'opérateur) · ne pas lancer `graphify extract`
  (passe sémantique) sans choisir explicitement le backend — les docs sensibles partiraient au
  backend détecté (ADR-0009) · la répartition des permissions Claude Code
  (`settings.json` versionné / `settings.local.json` machine) suppose que les listes `allow`
  s'UNISSENT — à confirmer à l'usage · `/Volumes/NX-Projects` doit être monté **avant** le démon
  Docker (il porte `Docker.raw`).
- 📌 **Doctrine graphify en double** : `.claude/CLAUDE.md` (3 lignes) à côté du `## graphify` du
  `CLAUDE.md` racine — duplication à trancher un jour.

## ⬆️ REMONTÉ de l'élagage du 2026-08-17 (soir) — trois chantiers clos

> Retirés : **l'agenda v2** (PR #143, squash `b0f5d37`), **le tableau des amendements** (via #143),
> **« Massimo ne lit plus Erreur 500 »** (PR #144, squash `1178a68`). Les quatre contrôles passent
> pour les trois : ADR ✅ (`adr-0025` ; les deux autres sont des cas 1/2 sans ADR, à dessein),
> `TROUBLESHOOTING.md` ✅, `CHANGELOG.md` ✅ (0.99.0 et 0.99.1). Voici ce qui restait **ouvert**.

### 🧾 DETTES SURVIVANTES de l'agenda v2

- **O3 — vacances** : aucune source de donnée. `SchoolYear` ne porte que `starts_on`/`ends_on` ;
  rien ne dit à ZETIS qu'une semaine est chômée.
- **O4 — mindmaps et capsules n'émettent aucun `learning_event`** : elles ne peuvent donc **jamais**
  apparaître dans « Ce que tu as travaillé », quel que soit le travail réellement fourni.
- ⚠️ Le bouton **« voir N autres »** sous « En retard » **grossit quand Massimo ne vient pas** —
  signalé par la relecture paire comme un compteur d'arriéré déguisé, **maintenu sciemment** par le
  commanditaire (emplacement en bas, libellé fugace). Décision prise, pas un oubli.
- ⚠️ **La relecture visuelle a sauté sept merges d'affilée** avant d'être enfin faite le
  2026-08-17. Le gate n'existe toujours **nulle part** dans le process : rien ne l'exige.

### 🧾 DETTES SURVIVANTES de « Erreur 500 »

- ⚠️ **`frontend-papa` porte le même motif à branche morte 113 fois** et le garde — interface
  adulte, le détail technique y est utile. *Hors périmètre assumé, pas un oubli.*
- ℹ️ Un `git grep "instanceof Error"` sur `frontend-massimo` compte encore **4 lignes**, toutes en
  **prose** (3 dans l'en-tête du verrou, 1 dans le docstring de `DiagnosticPage`). Zéro dans le
  code exécuté : **ce n'est pas une régression**.
- ⚠️ **`tsc -b` ne part pas de la racine** — aucun `tsconfig.json` racine, il rend `TS5083` **et
  sort en code 0**. Se placer dans le paquet : `cd apps/frontend-massimo && ./node_modules/.bin/tsc
  -b --force --noEmit`.

---

## ⬆️ REMONTÉ de l'élagage du 2026-08-17 (matin) — ce qui reste OUVERT

> Deux sections retirées : le **cadrage ADR-0061** (2026-08-16) et les **deux chantiers
> `diagnostics`** (2026-08-16). Leurs récits sont dans Git, leurs décisions dans les ADR. Ce qui
> suit est **tout ce qui restait ouvert** — et le contrôle 4 de l'élagage l'a exhumé.

### ✅ La *required check* est ACTIVE — et le dépôt est devenu PUBLIC

L'**ADR-0061** est appliqué depuis le 2026-08-17 : `backend — pytest`, `frontends — vitest` et
`verrous du dépôt` sont requis sur `main`, `strict: false`, bypass propriétaire conservé (§2).

🔴 **Ce qui l'a débloqué n'est pas ce que l'ADR prévoyait.** Le commanditaire a **basculé le dépôt
en PUBLIC** le matin même — l'option que l'ADR écartait explicitement au motif des données de
Massimo. La protection est gratuite sur un dépôt public : ni abonnement, ni organisation.

⚠️ **Ce qui est exposé, mesuré** : le prénom de Massimo dans **818 fichiers suivis**, son niveau,
ses matières, ses notions fragiles. **Aucun secret technique** — ni `.env`, ni clé, ni base.
*Arbitrage rendu par le commanditaire, en connaissance de l'exclusion écrite. Ne pas le rouvrir ;
le savoir.*

⚠️ **La preuve est INDIRECTE** : l'endpoint de lecture répond `503` (panne GitHub, pas refus). On a
la réponse du `PUT` et `protected: true`. **La preuve comportementale viendra de la première PR
rouge qui refusera de se merger.**

⚠️ **Le §4 de l'ADR (« branche à jour » non exigée) repose désormais sur un motif périmé** — il
invoquait « un dépôt privé où les minutes se paient ». Elles sont gratuites maintenant. La décision
tient, son argument principal non : à rouvrir sciemment, pas par entraînement.

### 🔴 TOUJOURS OUVERT — outillage

- **`gen_frontmatter.py` écrit un `pr:` FAUX** dès qu'un ADR **cite** une PR dans sa prose : `RE_PR`
  attrape le premier `PR #\d+` du texte. Contourné une fois à la main ; **le défaut est entier**.
- ✅ ~~38 occurrences du motif à branche morte dans `frontend-massimo`~~ — **CLOS** le 2026-08-17
  (PR #144, squash `1178a68`). Elles étaient **35**. ⚠️ **Le motif reste entier dans
  `frontend-papa` : 113 occurrences**, laissées sciemment (interface adulte).
- **Aucun lint dans ZETIS** — ni job CI, ni `ruff`. Vérifié : il n'a jamais existé.
- **La matrice `Permissions` d'`API_SPEC.md` est à trous** (`/relecture`, `/mes-resultats/*`). Une
  matrice de permissions incomplète est elle-même un piège.
- **`GET /diagnostics/subjects` n'a aucun test de comportement nominal** — couvert en refus, jamais
  en service.
- ⚠️ **`b29a985` n'a AUCUN verdict de CI sur `main`** : deux merges à 3 s d'intervalle, le
  `cancel-in-progress` a tué son run. Contenu vert sur sa PR, mais un bisect tombera sur un commit
  que la CI n'a jamais mesuré.

### 📌 DEUX LEÇONS DE MÉTHODE qui ont resservi

- 🔴 **Le hook `pre-push` mesure l'ARBRE DE TRAVAIL, pas la référence poussée**, et rien dans sa
  sortie ne le dit. Basculer sur chaque branche avant de la pousser.
- 🔴 **Une contre-épreuve qui casse le décor ne prouve rien.** 21 rouges d'un coup = décor cassé.
  Refaire en réintroduisant **le défaut d'origine à l'identique** : 1 rouge, le bon.

---


## ⬆️ REMONTÉ de l'élagage de l'application de l'ADR-0060 (PR #140, squash `2105ba9`)

**Les quatre contrôles, faits le 2026-08-16** : ADR ✅ (`adr-0060-la-surface-se-decide-devant-l-ecran.md`)
· `TROUBLESHOOTING.md` ✅ (§ *Session de méthode ADR-0060*, ligne 353) · `CHANGELOG.md` ✅ (0.98.0)
· 🔴 **le 4ᵉ ne passait pas** — la section portait une douzaine de dettes vivantes, elles sont ici.

### ✅ CLOSES par la session du 2026-08-16 — ne pas les ressusciter

- ~~L'ADR-0060 n'est appliqué nulle part~~ → appliqué (PR #140).
- ~~Deux branches parquées, aucune poussée, `fix/observation-sorties` rouge par construction~~ →
  **les deux sont MERGÉES** : `fix/diagnostics-roles` (PR #141, `b29a985`) et
  `fix/observation-sorties` (PR #142, `40eb4a8`). Les 6 rouges sont réparés.
  ✅ **Les deux branches sont supprimées**, locales et distantes, après comparaison au squash.
  Il ne reste **rien** de ce chantier hors de `main`.

### 🔴 TOUJOURS OUVERT — méthode

- 🔴 **La correction de l'ADR-0060 n'est TOUJOURS pas prouvée à l'usage.** Elle le sera quand
  `/ouverture` sera appelée sur un cas 1 ou 2 et **s'arrêtera en le disant**. Les deux chantiers du
  2026-08-16 étaient des **cas 2** — et la commande n'a simplement **jamais été appelée**, donc son
  garde-fou n'a pas été exercé. *Ne pas appeler une commande fautive ne prouve pas qu'elle est
  réparée.*
- ⚠️ **`slice.md` ne mentionne pas l'`adr-0060`.** Relu, il ne contredit rien — il porte la cage
  d'exécution, le cas se déclare à l'ouverture. À surveiller si la déclaration du cas devait
  remonter jusqu'à lui.
- ⚠️ **Rien ne vérifie mécaniquement qu'un fichier de méthode contredit un ADR.** Le balayage est un
  `grep` écrit dans `TROUBLESHOOTING.md`, lancé à la main. Un verrou de CI est imaginable, il
  n'existe pas.
- ⚠️ **`MEMORY.md` porte toujours plus de « ⬆️ REMONTÉ » que d'actif** — **huitième** clôture
  consécutive à le constater :

```bash
echo "actif $(( $(grep -n '^## ⬆️ REMONTÉ' MEMORY.md | head -1 | cut -d: -f1) - 1 )) / total $(wc -l < MEMORY.md)"
```

### 🔴 TOUJOURS OUVERT — code et environnement

- 🔴 **Balayer les autres `TestClient(app)` hors fixture** — le défaut de `test_auth.py` peut avoir
  des frères, et la CI ne les dira que s'ils touchent un service.
- ⚠️ **`SOCLE.md`** et le déplacement des ADR de surface — hors périmètre depuis **quatre** chantiers.
- 🔴 **Hors dépôt, invisible à un `git clone`** : un hook `.git/hooks/pre-commit` nettoie les
  `.DS_Store`, et **4 leurres immuables** sont posés dans `.git/`. **Conséquence : `rm -rf` du dépôt
  échoue** (`Operation not permitted`) — ce n'est pas une corruption, il faut `chflags -R nouchg`
  d'abord.

#### 🧾 DETTES REMONTÉES — du chantier « Trois témoins de plus » (élagué ce jour ; les quatre contrôles passent : ADR ✅, `TROUBLESHOOTING.md` §2026-08-15 ✅, `CHANGELOG.md` 0.94.0 ✅)

- 🔴 **La qualité du décodage glouton n'a toujours PAS été jugée sur une vraie voix.** Le banc
  existe (`scripts/bench_stt_beam.py`) ; sur 68 narrations **Piper** (1507 mots) : beam 1 = 13,3 %
  de mots faux, beam 2 = 12,7 %, beam 5 = 12,4 %, beam 1 et 2 divergent sur 22 des 68. **Cela ne
  tranche pas le réglage** — c'est de la voix de synthèse, exactement ce que la dette exclut.
  **Ce qui reste appartient à un humain** : enregistrer 5–10 énoncés de Massimo, écrire ce qu'il a
  dit, relancer le banc. Repli si dégradation : `beam_size=2`, **jamais** 5.
- 🔴 **DETTE DATÉE EXPIRÉE** : la vérification du masquage SRS devait se faire le 2026-08-15.
  **Plus jouable sous cette forme** — à reformuler sur d'autres cartes, ou à clore en disant ce
  qu'on ne saura pas.
- 🔴 Le **prompt v2 des fiches** n'a jamais généré une fiche · **deux dettes à une ligne** (copie de
  `groupCapsules.ts` chez Papa · `showSubjectHeader` sur `/quiz`) · **l'enrichissement des fiches
  par lot** (`adr-0015` Amendement 1 §11) demande un `/cadrage`.
- ⚠️ **`CHAT_RAG_MAX_DISTANCE=0.45` n'est pas calibré**, et son rôle a grandi avec le §19 : sans
  notion résolue la recherche porte sur toutes les matières, ce seuil devient le seul garde-fou.
- ⚠️ **`servable_quiz_ids` est une SECONDE formulation** du filtre de
  `_servable_quizzes_of_subject`, tenue par un test d'égalité (N4) — si l'une évolue, l'autre doit
  suivre. Les **deux migrations portent un miroir SQL** de ce filtre, joué une seule fois à la pose.
- ⚠️ **Le badge Matières démarre à 32, sans mécanisme de dégonflage** autre que l'usage. Signal de
  sortie (borne B3) : encore `9+` dans deux mois → **retirer le témoin ou restreindre sa
  population, jamais monter le plafond**.
- ⚠️ **`_seed_programme` ne sème qu'UN quiz de mission et UN diagnostic** — un futur compteur
  multi-matières y serait à vide.
- ⚠️ Budgets de contexte non mesurés après élargissement (~1200 → ~5000 caractères) · filtre RAG
  par **niveau** exposé mais désactivé · `_AVEUX_IGNORANCE` est un filet, pas une garantie ·
  exposants LaTeX (`x^2`) non traités · `lesson_matching_text` compare des mots **exacts** ·
  trois verrous ne prouvent que la moitié de ce qu'ils gardent (jsdom ne mesure aucune géométrie) ·
  la sortie « stop » et la clôture après trois questions **n'ont pas été jouées en vrai** ·
  deux messages de panne **coexistent** à l'écran (correct, décrit nulle part) · le style des
  messages d'échec n'est encadré par **aucune** règle.
- ⚠️ « Sans chapitre » vaut 19 % en Maths · repli `subject: ""` du champion · deux missions en
  double (dev) · tuiles de chapitre à icône unique sur `/revision` · `chapter_servable_counts`
  n'est pas un vrai lot · titre de page figé pendant une recherche sur `/fiches` · quota du mélange
  du jour non arbitré · trou d'un jour du masquage · brouillons 51 et 54 · l'`adr-0054` garde deux
  comptes faux · pied de fiche à 5 lignes en 375 px · `review_load` compte des cartes masquées ·
  commentaire de `coverage.py:364` faux · **veto d'un cours impossible dès qu'une fiche personnelle
  existe** · **aucun linter Python** · `page-quiz.md` (spec absente).


---

## ⬆️ ONZE ÉLAGAGES — récits retirés, leçons RELOGÉES (PR #122 → #132)

> Les quatre contrôles passent pour les onze : ADR ✅ · `TROUBLESHOOTING.md` ✅ · `CHANGELOG.md`
> **0.81.0 → 0.91.0** ✅ · dettes remontées plus bas.
>
> 🔴 **Chacun de ces onze élagages avait gardé ici un paragraphe *« ce qui ne survit qu'ici »***.
> C'est cet aveu, onze fois répété, qui empêchait `MEMORY.md` de maigrir : la leçon n'avait aucune
> autre adresse. **Elles sont désormais dans `TROUBLESHOOTING.md`**, § *Leçons transversales —
> relogées depuis `MEMORY.md`* — le fichier qui se définit comme *« un piège qui ferait perdre du
> temps à la prochaine session »*, donc leur place depuis le début.
>
> **La leçon sur les leçons** : *un contenu sans domicile s'accumule là où il est tombé.* Quand un
> rangement bute toujours sur les mêmes lignes, la question n'est pas « peut-on les supprimer ? »
> mais « où auraient-elles dû aller ? ». Récit complet : `git log -p MEMORY.md`.


## ⬆️ REMONTÉ de l'élagage du chantier `fix/accueil-titre-coupe` (PR #121, squash `ced50a2`)

> Le récit est retiré. **Contrôles : ADR non requis (le chantier l'assumait), `CHANGELOG.md` ✅
> (`0.80.2`) — mais `TROUBLESHOOTING.md` n'avait AUCUNE section**, alors que quatre pièges
> d'outillage y avaient leur place. Ils y ont été écrits le 2026-08-13. Ce qui suit est ce qui
> restait **ouvert**.

- ⚠️ **`/matieres` déborde de 8 px horizontalement** (`scrollWidth 398` pour `clientWidth 390`),
  cause identifiée : le `-m-6 p-6`. La page se laisse tirer de côté au doigt.
- ⚠️ **Unifier titre ET libellés de section** sur toutes les pages est une décision de **design**
  qui mérite un ADR. Deux familles de pages coexistent, chacune cohérente.
- ⚠️ **`filterwarnings = ["error"]` est gratuit AUJOURD'HUI seulement.** Le prochain `uv lock` qui
  monte un paquet peut le rendre payant. La parade sera un `ignore` **sur un message précis**.
  *(Il a déjà mordu ce chantier : `HTTP_422_UNPROCESSABLE_ENTITY` déprécié.)*
- ⚠️ **La branche « leçon inconnue » de `_check_lesson_belongs`** (`agenda/service.py:505`) n'est
  couverte par **aucun** test.
- ⚠️ **`httpx>=0.27` figure DEUX fois** dans `apps/backend/pyproject.toml`. Laissé sciemment.
- 🔴 **Le plein écran depuis la MODALE DE MISSION n'a JAMAIS été exercé** — aucune mission de dev
  ne porte d'étape `mindmap`. Écrit et typé, **pas prouvé à l'écran**.
- 🔴 **Le panneau de notion de `/galaxy` SORT DE L'ÉCRAN sur téléphone** (94 px hors cadre à
  390 px) — au `BACKLOG.md`, piste : le même panneau tient sur la page matière.
- 🔴 **Le repli `PROFILE` affiche des chiffres FAUX** (niveau 7, 1240 XP) en cas de panne réseau.
  Décision **produit**, pas un nettoyage.
- ⚠️ **En Reconstruire sur téléphone, ça reste serré** : banque 278 px, canvas 388 même en plein
  écran. Mesuré, pas jugé.
- ⚠️ **28 tests de MONTAGE ne sont pas une suite** — c'est leur nature, pas une étape.
- **La 5ᵉ surface d'`ACTION_UI` n'a jamais été vue** — le menu de notion du `/chat`.
- ⚠️ **`cursor: default` sur les 29 boutons** (Tailwind v4) — toujours ouvert.
- ⚠️ **Le rail arrive après ~1 500 px de défilement** sur la page matière. Signalé, non tranché.
- ⚠️ **« Points solides / À renforcer » sur `/matieres`** : moitié livrée, moitié refusée
  (ADR-0024 §5). Signalé, non redemandé.
- ⚠️ **`maquette-massimo-galaxy.html` porte encore l'ancien libellé** « Reconstruire la carte ».

## ⬆️ REMONTÉ de l'élagage de l'ADR-0051 (PR #113, squash `239d6e9`)

> Le récit est retiré. **Les trois premiers contrôles passent** —
> `docs/decisions/adr-0051-papa-peut-lire-un-diagnostic.md` ✅, `TROUBLESHOOTING.md`
> §`feat/papa-lit-un-diagnostic` ✅, `CHANGELOG.md` **0.76.0** ✅. Le **quatrième** a trouvé une
> dette vivante, remontée dans « DETTES OUVERTES » ci-dessus (`cursor: default`).
> Le détail se retrouve par `git log -p MEMORY.md`.

## ⬆️ REMONTÉ de l'élagage de `fix/cours-vide-non-validable` (PR #112, squash `a9026d2`)

> Le récit est retiré. **Trois contrôles sur quatre passent** — `TROUBLESHOOTING.md`
> §`fix/cours-vide-non-validable` ✅, `CHANGELOG.md` **0.75.0** ✅, et tout ce qui restait ouvert est
> **au `BACKLOG.md`** (les 50 leçons vides §643, les deux hypothèses démenties §637). Le détail se
> retrouve par `git log -p MEMORY.md`.

- 🔴 **LE 1ᵉʳ CONTRÔLE ÉCHOUE, POUR LA DEUXIÈME CLÔTURE D'AFFILÉE : ce chantier n'a AUCUN ADR.**
  Correctif direct, arbitrage assumé — mais deux comportements y ont été **figés par le seul code
  et ses verrous** : le **409** sur un cours vide (avec le rejet qui reste permis) et la règle
  **« trois crans ou aucun geste »** pour tout lien vers `ProgrammePage`. C'est la même dette qu'en
  PR #89 et #111, et en #89 elle a fini par coûter un addendum rétroactif.
- 🔴 **Les 50 leçons `validated` et vides sont toujours là** — la garde empêche d'en créer, elle ne
  dit rien des existantes. Trois issues à votre main (`draft`, rédaction, archivage), aux coûts
  différents pour Massimo. Au `BACKLOG.md`, et dans le tableau des décisions ci-dessous.

---

## ⬆️ REMONTÉ de l'élagage du chantier agenda (PR #111) — ce qui reste OUVERT

> Le récit de `fix/agenda-trois-defauts` (squash `f18276d`) est retiré. **Le 1ᵉʳ des quatre
> contrôles ÉCHOUE** — voir ci-dessous. Les trois autres passent : `TROUBLESHOOTING.md`
> §`fix/agenda-trois-defauts` ✅, `CHANGELOG.md` **0.74.0** ✅, dettes remontées ✅.
> Le détail se retrouve par `git log -p MEMORY.md`.

- 🔴 **CE CHANTIER N'A AUCUN ADR** — arbitrage explicite du commanditaire (« correctif direct sur
  la branche »). Cinq défauts corrigés, dont deux surfaces neuves (le rattrapage du masquage, le
  bloc « ✦ Ce jour-là, tu prépares ») **figées par le seul code et ses verrous**. C'est la dette
  assumée de ce choix, et **la même qu'en PR #89**, où elle avait fini par coûter un addendum
  rétroactif.
- 🔴 **`AgendaPage` de Massimo n'a AUCUN test de rendu** (lacune préexistante). Le défaut du
  doublement — **le seul des cinq qui violait une décision écrite** (§17.1) — est vérifié à
  l'écran et dans le DOM, **par aucune suite**.
- ⚠️ **`test_delete_is_archiving_not_deletion` reste VERT** sur le sabotage « la bande ne rend plus
  rien » : il n'assert qu'une absence. Signalé, non corrigé.
- ⚠️ **Les tests de Massimo ne sont toujours pas typecheckés** (`tsconfig.app.json` les exclut) ;
  ceux de Papa le sont, et `tsc -b` y a attrapé une prop manquante **dans la seconde**.
- ⚠️ **Piste ouverte du bug de fuseau** : chercher les autres `datetime.now(timezone.utc).date()`
  du dépôt partout où une date **CIVILE** est attendue. Le patron correct est `today_local()` /
  `local_day()`. Un seul des deux tests « qui alternent selon l'heure » s'est manifesté cette
  nuit — l'autre attend peut-être dans une autre fenêtre.

## ⬆️ REMONTÉ de l'ADR-0050 à son élagage (2026-08-11) — ce qui reste OUVERT

> Le récit du chantier « plan de préparation » est retiré : ses **quatre contrôles passent** —
> `docs/decisions/adr-0050-le-plan-de-preparation.md` ✅, `TROUBLESHOOTING.md`
> §`feat/plan-de-preparation` ✅, `CHANGELOG.md` **0.73.0** ✅. Ce qui suit est le **quatrième
> contrôle** : ce que la section laissait ouvert et qui n'existe nulle part ailleurs.
> Le détail se retrouve par `git log -p MEMORY.md`.

### ⚠️ Les deux arbitrages d'ÉCRAN de l'ADR-0050 — VUS par l'agent, jamais par l'humain

Ils étaient marqués « à confirmer à la relecture ». **Regardés et mesurés le 2026-08-10 au soir,
et ils tiennent** — mais c'est mon œil, pas celui du commanditaire, et le dépôt distingue les deux.

1. **Le plan ABSORBE la porte de l'`adr-0049`** quand il porte une étape `revision`. ✅ Vérifié :
   les deux variantes cohabitent sur le même écran — `Réviser ce chapitre · **8 cartes**` sur la
   carte sans plan, `Réviser ce chapitre · **mer. 12**` dans le plan. Le « N cartes » part bien
   avec la porte.
2. **L'icône de la fiche est `🗒️`, pas `📖`.** ✅ Vérifié : les deux cohabitent sur la même carte
   (« 📖 lire le cours » deux lignes plus haut) et se distinguent.

### 🔴 Deux RÈGLES de méthode, qui ne sont pas de l'historique — elles ont resservi cette nuit

- **Un verrou qui n'assert qu'une ABSENCE ne verrouille rien tant qu'une PRÉSENCE ne
  l'accompagne pas** — un écran vide satisfait toute assertion négative. Appliquée
  systématiquement cette session ; c'est elle qui a fait survivre mes verrous au sabotage
  « la surface disparaît ». ⚠️ `expect(x).not.toBe("📖")` n'est **pas** un verrou : il passe sur
  `""` et sur `undefined`.
- 🔴 **`npx tsc` ne lance PAS TypeScript dans ce dépôt** (seul `tsc -b` le fait), et un `| head`
  ou `| tail` **masque le code de sortie** — `echo $?` rend alors celui de `head`. Les deux
  pièges se sont représentés cette nuit, à une heure d'intervalle.


### ⚠️ DETTES HÉRITÉES DE L'ADR-0050 — le plan de préparation (mergé, PR #110)

- ✅ ~~**Migration `b2c3d4e5f9a1` non posée en prod.**~~ — **POSÉE le 2026-08-10 au soir.** Deux
  pièges neufs, consignés dans la mémoire `migrer-la-base-prod-zetis` : le **`pg_dump` de l'hôte
  est en 14.18 contre un serveur 16.14**, il refuse et laisse un fichier de **0 octet** qui a l'air
  d'être une sauvegarde (passer par celui du conteneur) ; et l'exposition temporaire du port se
  fait par un **override hors dépôt**, jamais en éditant `docker-compose.prod.yml` — un oubli de
  rétablissement publierait la base dans Git.
- 🔴 **Trois échéances d'un MÊME chapitre affichent des plans redondants.** Conséquence directe de
  la **Décision 1 gelée** (« un plan par échéance ») — **pas rouvert**. Arbitrage produit à poser
  un jour : plan par échéance, ou par chapitre ?

  ⚠️ **Relevé plus précisément le 2026-08-10 au soir, en dépliant « la suite » :** ce ne sont pas
  « trois plans identiques ». Ce sont **deux identiques** (*Division* et *Multiplication*, toutes
  deux au **ven. 14** : `🗒️ mar. 11` · `🃏 mer. 12` · `🎯 jeu. 13`) **plus un TRONQUÉ** —
  *Comparaison*, au **jeu. 13**, n'a que 2 étapes (`🗒️ mar. 11` · `🃏 mer. 12`) parce que sa veille
  tombe un jour plus tôt. **8 étapes au total**, ce qui recoupe les 8 lignes en base.

  🔴 **Le vrai symptôme n'est donc pas la répétition des plans, c'est la répétition des GESTES** :
  Massimo lit « Lire les fiches » **trois fois** pour le mar. 11, « Réviser ce chapitre » **trois
  fois** pour le mer. 12, « Choisir un quiz » **deux fois** pour le jeu. 13 — sur le même chapitre.
  ⚠️ **Et la bande le CACHE** : elle n'allume qu'**un seul `✦` par jour** quel que soit le nombre
  d'étapes portées. La redondance n'apparaît qu'une fois « la suite » dépliée, ce qui explique
  qu'elle ait pu passer inaperçue.
- ⚠️ **`resource_id` est persisté et inutilisé** pour `fiche` et `quiz`. La variante « charger le
  quiz puis `/quiz/session` » (patron `mode: "quiz"` de `notionRoutes`) est **reportée, pas
  écartée** : son déclencheur est le jour où l'on accepte un cas d'échec de chargement sur un écran
  d'enfant.
- ⚠️ **Les tests de Massimo ne sont TOUJOURS PAS typecheckés** (`tsconfig.app.json` les exclut) —
  ceux de Papa le sont, et `tsc -b` y a attrapé les trois fixtures périmées d'un coup. L'asymétrie
  est une dette, pas un choix.
- ✅ ~~**Le `✦` et les points de `traces` n'ont jamais été vus se croiser**~~ — **VUS le
  2026-08-10** : points verts sur VEN 7 → LUN 10, `✦` sur MAR 11 / MER 12 / JEU 13. Les deux
  familles cohabitent bien dans la bande, sur des jours distincts, comme la théorie le disait.
  Mesuré par ailleurs : **toutes les colonnes de la bande font 111 px**, allumées ou non.

- 🔴 **UN JOUR MARQUÉ `✦` DANS LA BANDE OUVRE SUR « Rien de noté pour ce jour. »** — trouvé par la
  **RELECTURE HUMAINE** le 2026-08-10, reproductible sans rien masquer : cliquer **MER 12**.

  **Ce n'est PAS une décision violée** — et c'est important pour ne pas partir corriger à côté.
  L'ADR-0050 a **délibérément** mis le `✦` sur le **jour** et le plan **sous l'échéance**
  (Décision 2 ter, ADR l.216 et l.418). La règle *« jamais un `✦` qui n'ouvre rien »* est la
  **Décision 7.4, et elle vise la GRILLE DE PAPA**, pas la bande de Massimo. **C'est un trou entre
  deux décisions**, exactement comme la croix ✕ — donc réparable sans rien rouvrir.

  **Cause, dans le code** : `AgendaDayPanel` branche sur `items.length` — les `fixed_items` du
  jour, et rien d'autre ; `planByItem` n'est distribué **qu'aux items présents ce jour-là**. Un
  jour qui porte des étapes sans porter d'échéance tombe donc dans la branche vide.

  🔴 **Et la combinaison des Décisions 3 et 2 ter rend le défaut STRUCTUREL, pas accidentel** : la
  Décision 3 répartit les étapes de demain à **la veille**, **jamais le jour de l'échéance**. Une
  étape ne tombe donc **jamais** sur le jour de ce qu'elle prépare. Un jour `✦` n'a de contenu que
  s'il porte, **par coïncidence**, une échéance *sans rapport*. En dev : MAR 11 et JEU 13 sont
  sauvés par hasard (ils portent leurs propres échéances), **MER 12 ne l'est pas**.
  **Autrement dit : le défaut est le cas NORMAL, et les deux jours qui semblent corrects sont
  l'accident.**

  ⚠️ **C'est ce qui a rendu le signalement confus** : dans l'état où les items 16 et 19 étaient
  masqués, MAR 11 perdait ses icônes (la bande filtre les masqués, `service.py:323`) **mais gardait
  son `✦`** (venu des plans des fractions) — d'où un jour marqué qui répond « rien de noté ». Le
  rechargement a résolu le symptôme ; **il n'a pas résolu le défaut**, que MER 12 exhibe toujours.

  **Doctrine applicable** : *« une porte ouverte sur du vide »*, addendum ADR-0024 — citée **deux
  fois dans l'ADR-0050 lui-même** (l.73, l.165). À traiter avec le correctif de la croix.

- 🔴 **OUVRIR UN JOUR AFFICHE SES ÉCHÉANCES DEUX FOIS** — trouvé par la **RELECTURE HUMAINE** le
  2026-08-10 (*« il y en a un en trop »*). Cliquer **MAR 11** rend le panneau « MARDI 11 AOÛT »
  **et** la section « DEMAIN », avec les mêmes cartes.

  🔴 **Et cette fois ce n'est PAS un trou : l'addendum §17.1 nomme exactement ce défaut et le
  déclare évité** — *« la bande **ne devient pas une seconde liste qui doublerait les sections**.
  Elle ouvre un jour à la fois, à la demande, et le panneau se referme. Ce n'est pas une liste,
  c'est une réponse. »* ⚠️ Son argument est la **transience** ; à l'écran, la transience
  n'empêche rien — **tant que le panneau est ouvert, l'item est là deux fois**. La lettre peut se
  lire comme ayant anticipé le recouvrement, l'intention est violée.

  **Cause** : `AgendaPage.tsx` rend `AgendaDayPanel` (l.101) **sans aucune interaction** avec les
  sections qui suivent — « Aujourd'hui » (l.117) et « Demain » (l.140) sont rendues
  **inconditionnellement**, sans garde sur `pickedDay`.

  **Mesuré dans le DOM, MAR 11 ouvert** : chaque libellé ×2, la porte « Réviser ce chapitre ·
  8 cartes » ×2, **5 croix à l'écran** (2 + 2 + celle qui ferme le jour), et surtout —
  🔴 **`id="agenda-item-16"` et `id="agenda-item-19"` EXISTENT EN DOUBLE dans le DOM** (4 ancres
  pour 2 items). Des `id` HTML dupliqués sont invalides, et `openPlan()` (l.63-69) repose sur
  `getElementById`, qui rend **le premier du document**. ⚠️ **Aucune défaillance visible n'a été
  observée** de ce fait — la note vaut pour l'ambiguïté introduite, pas pour un bug constaté.

  **Portée** : tout jour dont la section est visible — aujourd'hui et demain **toujours**, les
  jours suivants **dès que « la suite » est dépliée**. Le panneau ne double pas *parfois*, il
  double **chaque fois que la destination est déjà à l'écran**.

### ⚠️ DETTES OUVERTES du chantier PRÉCÉDENT (#107)

**Nées de ce chantier :**

- 🔴 **Ouvrir LE diagnostic depuis Papa** — ses 40 questions. Établi en cherchant une destination :
  `/quiz` filtre sur `QUIZ_TYPE_MISSION` dans **sept comparaisons de requête** (sur onze occurrences) (un diagnostic n'y
  apparaît jamais), `/relecture` rend `null` (`reviewLink:91`), `/diagnostics` montre les
  passations. **Aucune surface Papa n'ouvre un diagnostic généré.** Ce chantier fermera aussi le
  `null` de `reviewLink:91` et la dette « Papa valide un diagnostic sans pouvoir le LIRE ».
- ⚠️ **Le nombre de leçons RÉELLEMENT créées par `curriculum_lessons` est indisponible** côté
  Journal — `lessons_count` vit sur la trace `parent`, exclue. Le rendre lisible demanderait que le
  travail l'écrive dans sa **propre** sortie (`curriculum/service.py`), hors périmètre ici.
- ⚠️ **La branche « `equip_notion` avec des pièces générées » n'a pas été vue à l'écran** : aucune
  ligne de ce type n'était présente sur la première page du Journal. Elle est couverte par un test,
  jamais par un œil. Son libellé (« voir la notion → ») et sa route sont donc **non relus**.
- ⚠️ **`/programme?…&lesson=<id>` ouvre le chapitre mais ne met PAS la leçon en évidence** —
  constaté en suivant le lien. Comportement **pré-existant**, partagé avec le lien « À valider » et
  la matrice de Couverture ; ce chantier ne l'introduit pas et ne le corrige pas.
- ⚠️ **Les 41 lots plus anciens du Journal n'ont pas été dépliés** : la relecture a porté sur la
  première page (12 lignes de travail). Un `job_type` sans règle y afficherait « terminé ».


**Nées de ce chantier :**

- ✅ ~~`DECISIONS.md` porte l'ancienne règle du contraste~~ → **corrigé et poussé sur `main`**
  (`ed7119b`), avec la mort de « rien n'est implémenté ».
- 🔴 **LES TESTS DE MASSIMO NE SONT PAS TYPECHECKÉS** — `apps/frontend-massimo/tsconfig.app.json`
  exclut `src/**/*.test.ts(x)`. Ceux de **Papa le sont**. Le même changement de contrat a donc
  hurlé côté Papa (6 erreurs de fixtures, corrigées) et est passé **sans un bruit** côté Massimo :
  `DiagnosticPage.test.tsx` porte toujours un décor sans `verbalisation`, et `tsc -b` est vert.
  **Un `tsc -b` vert ne prouve rien sur les tests de Massimo.**
- 🔴 **DEUX migrations ne sont pas en prod** : `a9b0c1d2e3f4` (héritée) et **`e2f3a4b5c6d7`**.
- ⚠️ **L'observation côté client a tourné en vrai UNE FOIS, sur UN appareil** (passation 56, poste
  de dev) : chronométrage, verdict, micro, Whisper, atterrissage dans le champ, envoi, relecture
  chez Papa. **Ce qui reste non exercé en vrai**, et par quoi commencer si un doute apparaît :
  - 🔴 **le plein écran** (aucun `requestFullscreen` réel joué — voir l'atténuation au § À FAIRE) ;
  - 🔴 **la localisation d'une copie** — `getSelection()` → `closest("[data-question-id]")` n'a
    jamais rencontré une vraie sélection de texte. C'est le seul signal **par question** du lot ;
  - 🔴 **une vraie sortie d'écran** (`visibilitychange` / `blur`) et sa fenêtre anti-doublon de
    500 ms : la passation 56 s'est déroulée sans quitter l'écran (`sorties_ecran: 0`) ;
  - ⚠️ **iPhone et tablette** — ni le micro, ni le plein écran, ni le responsive n'y ont été vus ;
  - ⚠️ **le cas STT éteint (503)** : couvert par un test, jamais par un service réellement arrêté.
- ⚠️ **Les seuils sont des choix de cadrage, jamais éprouvés sur des données réelles** :
  `CONTRASTE_SCORE_MIN = 90`, plancher `2`, majorité stricte, `RAPIDE_FRACTION_MEDIANE = 0.4`, et la
  fenêtre anti-doublon de **500 ms** sur les sorties d'écran. Premier signal de dérive : « la bande
  apparaît presque à chaque passation » — et alors **vérifier les trois sources AVANT les seuils**.
- ⚠️ **`signaux_observables` est déclaré par le client** et n'est vérifié par rien côté serveur : la
  portée affichée à Papa vaut ce que le front en dit.
- ⚠️ **Aucun lint** : `ruff` n'est pas installé dans le venv du backend.
- 🔴 **DONNÉES DE DEV SEMÉES le 2026-08-09 — les trois états de la fiabilité.** Semées par le
  **vrai `service.submit()`**, pas écrites à la main : le verdict est **calculé** par
  `fiabilite.evaluer()`, sinon on vérifierait une donnée inventée au lieu du code.

  | Passation | État | Ce qu'elle montre |
  |---|---|---|
  | **53** — Français, 100 % | `a_confirmer` | 2 faits (3 sorties d'écran · 1 énoncé copié), le contraste **sous le seuil** (3/8), 2 indices, **portée 3/4** → la bande affiche la ligne « iOS Safari le refuse sur iPhone ». ⚠️ **`reliability_json` RETOUCHÉ À LA MAIN le 2026-08-09** — voir ci-dessous |
  | **54** — Mathématiques, 38 % | `rien_a_signaler` | la ligne grise, **portée 4/4** (donc sans la nuance « rien vu ≠ rien eu lieu ») |
  | **55** — Mathématiques, 50 % | `a_confirmer` | 🔴 **semée pour rendre « Remesurer » VÉRIFIABLE** : sur la seule passation Français, la modale s'ouvrait sur Français… qui est aussi `subjects[0]`. Le test à l'écran était **confondu** et ne prouvait rien. ⚠️ **Elle a ouvert 8 `Gap`** (Mathématiques) |
  | **56** — Histoire-Géo, 50 % | `rien_a_signaler` | 🟢 **la seule VRAIE passation** — jouée par Massimo le 2026-08-09, micro et Whisper réels. Porte l'explication **« J'ai deviné. »** sur « Prise de la Bastille », notée **80 % · en cours**. `duration_seconds = 91`, le premier rempli par un usage réel |
  | **50** et les 5 autres | `null` | **rien du tout** — ZETIS ne regardait pas |

  🔴 **La passation 53 a été RETOUCHÉE À LA MAIN**, et il faut le savoir avant d'en conclure quoi que
  ce soit : elle portait `plein_ecran_quitte: true` **avec** `plein_ecran` absent de la portée — une
  combinaison que le vrai client **ne peut pas produire** (`useObservationPassation:126` et `:172`
  lient les deux). La bande affichait donc « le plein écran a été quitté » **et** « il n'a pas pu
  être demandé ». Corrigé en base (`plein_ecran_quitte → false`, déclencheur retiré). **Ce n'est
  donc plus ce que `submit()` a produit** — c'est le seul champ de tout le semis dans ce cas.

  ⚠️ **Le CONTRASTE n'est PAS déclenchable sur les données de dev actuelles**, et ce n'est pas un
  défaut : aucun diagnostic n'a une **majorité** de notions sans trace (le meilleur est à 3 sur 8,
  et `3×2 = 6` n'est pas `> 8`). La passation 53 porte donc `acquises_sans_trace: 3` **sans**
  `contraste` dans ses déclencheurs — le seuil fait exactement ce qu'il doit. **Ne pas conclure que
  le contraste est cassé en ne le voyant pas à l'écran** ; il est couvert par 5 tests et 3 sabotages.
  ✅ **Bénéfice imprévu** : c'est ce cas-là qui a révélé le défaut du 4ᵉ badge « fait ».

  🔴 **LA RECETTE « POUR DÉFAIRE » DE LA CLÔTURE PRÉCÉDENTE ÉTAIT FAUSSE** — vérifiée en base le
  2026-08-09, elle aurait **détruit des données réelles**. Ce qu'elle disait, et ce qui est vrai :

  | Elle disait | La base dit |
  |---|---|
  | `skill_mastery` **28-31** (4 lignes) | **33 lignes** touchées (`last_seen_at` du 2026-08-09) — et 🔴 **ce sont des UPDATE, pas des INSERT** : `_upsert_skill_mastery` écrase des lignes préexistantes |
  | `xp_events` **94, 95, 96** | **94, 95, 96 ET 97** — la 97 est celle de la passation 56 |
  | « les 8 `Gap` de la 55 » + « les 8 de la 56 » | **14 au total** : **8** en Mathématiques (55) + **6** en Histoire-Géo (56) |

  🔴 **`skill_mastery` NE SE DÉFAIT PAS PAR SUPPRESSION.** Il n'existe **aucun « avant »** à
  restaurer : la mesure antérieure a été écrasée sur place, sans historique de ligne. Supprimer ces
  33 lignes effacerait la maîtrise réelle de Massimo sur des notions qu'il a vraiment travaillées.
  **Le semis de dev n'est donc PAS entièrement réversible** — c'est un fait à connaître avant de
  décider, pas un obstacle à la PR.

  **Ce qui, lui, se défait proprement** — ordre contraint par les FK :
  `quiz_answers` (`attempt_id IN (53,54,55,56)`) → `quiz_attempts` **53, 54, 55, 56** →
  `xp_events` **94, 95, 96, 97** (`diagnostic`, 15 XP chacun) → les **14 `Gap`** du
  `first_detected_at = 2026-08-09` (les **10** antérieures sont intactes : total **24**, dont 23
  `open`). ⚠️ **La passation 56 est la seule VRAIE** — la supprimer efface le mot de Massimo.

  ✅ **Bénéfice de vérification imprévu** : la passation **50** montre côte à côte l'ancien état
  (`duration_seconds = NULL`, `started_at = completed_at`) et les nouvelles (214 s et 305 s, avec un
  `started_at` réel). Le défaut corrigé se voit **par comparaison**, sur le même écran.

**Héritées, et toujours vraies :**

- ⚠️ **Les deux gestes de la station ② sur-promettent toujours** — « cette notion » / « cette
  leçon » mènent à la **matière**. Un test **fige la dette** (`PanneauPassation.test.tsx`) : s'il
  tombe, c'est qu'elle est payée — le **supprimer**, pas l'ajuster. Chiffrage au `BACKLOG`.
- 🔴 **`API_SPEC.md` n'a AUCUN contrôle automatique** et avait déjà **un chantier de retard** une
  fois. Remis au réel à cette clôture — rien n'empêche la prochaine dérive.
- ✅ ~~**HUIT branches de chantier conservées** (neuf avec `feat/anti-triche-diagnostic`)~~ —
  **MORTE, mesurée le 2026-08-16** : `git branch` ne rend que `main`, `git ls-remote --heads origin`
  ne rend que `refs/heads/main`. Le réglage `delete_branch_on_merge: false` **tient toujours** — les
  branches ne disparaissent pas seules, celles-ci ont été supprimées à la main après comparaison au
  squash. La vigilance sur les noms qui se ressemblent reste valable au prochain lot.
- 🔴 **La sidebar Papa n'est toujours pas responsive** — `w-64 shrink-0` sans point de rupture. Elle
  rend toute page Papa inutilisable à 375 px.
- 🔴 **Le merge #98 (ADR-0042) reste sans relecture visuelle humaine.**
- 🔴 **`response_model` filtre en SILENCE les champs non déclarés** — un verrou existe pour
  `/progress/gaps`, et désormais pour `/diagnostics/results/{id}` et le rail. Pas ailleurs.
- 🔴 **Deux tests de `test_dashboard.py` alternent au rouge selon l'heure** — pré-existants,
  prouvés tels. ✅ Verts sur les deux suites complètes de cette session.
- 🔴 **L'e-mail du watchdog n'a jamais atteint une VRAIE boîte** — 4 lignes SMTP du `.env` racine
  (21-25) à décommenter, mot de passe d'application Gmail, puis `python -m app.core.mailer`.
- 🔴 **`POSTGRES_PASSWORD` reste `zetis_dev_password`** dans le `.env` racine.
- ⚠️ **`mem_limit: 1g` est calé sur une mesure À VIDE** (92 / 41 Mio) — à relever si un OOM
  apparaît, **jamais à baisser** sans nouvelle mesure.
- 🔴 **Le worker de production NE TOURNE PLUS** — état inversé le 2026-08-16 : les serveurs de dev
  ont été coupés, et `pgrep -f app.production_worker` ne rend rien. La ligne disait « TOURNE »
  depuis le 2026-08-09 ; **c'est un état, pas une dette, et un état se périme.**
  ⚠️ **Conséquence désormais ACTIVE : un lot lancé depuis la Couverture reste `queued`
  INDÉFINIMENT.** Il repart avec l'entrée `backend` de `launch.json` (`scripts/with-worker.sh`).
  ⚠️ **2 PID est NORMAL** quand il tourne — RQ fork son scheduler.
  Vérifier : `pgrep -fl "app.production_worker"`.
- ⚠️ **Le `lifespan` de `main.py` est la PREMIÈRE tâche de fond du backend** — non exercé par les
  tests.
- ⚠️ **Données de dev ADR-0046** : la pile prod porte le **quiz 4** (SVT, `pending`) et son
  `ai_job 114`.
- ⚠️ **Le journal de production affiche « fait en 95 s » sur un travail resté 25 H en file.**
- ⚠️ **Dans le compose DEV, `worker-media` est sur `networks:[internal]` SEUL.**
- ⚠️ **Massimo voit 18 diagnostics validés, dont 11 en Français pour 2 passés**, 2 doublons Maths.
- ⚠️ **L'écran de résultat de Massimo affiche jusqu'à 8 notions à renforcer d'affilée.**
- ⚠️ **La branche `null` de `measured_at`** n'est exercée par aucune donnée réelle.
- ⚠️ **Rien ne referme une lacune quand la notion est réussie** — seul `missions/service.py` écrit
  `resolved`.
- **Papa valide un diagnostic sans pouvoir le LIRE** depuis la file (`reviewLink` rend `null`).
- **Les 14 défauts du module `diagnostics`** restent au `BACKLOG.md`, aucun traité.
- ⚠️ **Le panneau Diagnostic reste sur une matière que la pastille exclut** — pré-existant.
- ⚠️ **Données de dev ADR-0045** : le **quiz 30 est laissé en `pending`**. Annuler par
  `UPDATE quizzes SET validation_status='validated' WHERE id=30;`.
- **Artefacts de dev ADR-0042 en base** : `Skill 436`, `Quiz 54`, `Gap 2`, `Mission 56`. Ordre de
  suppression contraint par les FK : `MissionStep` → `Mission` → `Gap` → `QuizQuestion` → `Quiz`
  → `Skill`.
- **Résidus de la vérification 375 px** : simulateurs `ZETIS-375` et `ZETIS-393`
  (`xcrun simctl delete`).

### ⚠️ DETTES NÉES DU CHANTIER AGENDA

- ✅ ~~**Migration prod**~~ — **FAITE le 2026-08-10, en deux temps et c'était le bon ordre.**
  D'abord jusqu'au dernier **mergé** (`e2f3a4b5c6d7`) pendant que la PR #108 était ouverte, puis
  jusqu'à la tête (`a1b2c3d4e5f8`) **après** le merge. Motif du découpage, à retenir :
  `infra/docker/backend-entrypoint.sh:6` fait `alembic upgrade head` **à chaque démarrage** — une
  révision présente en base mais absente de `main` ferait échouer le démarrage sur *« Can't locate
  revision »*. **Ne jamais poser en prod une révision qui n'est pas sur `main`.**
  ⚠️ Trois pièges rencontrés ce jour-là, tous consignés dans la mémoire `migrer-la-base-prod` :
  la variable est **`ZETIS_DATABASE_URL`** (`DATABASE_URL` est ignorée **en silence**, et alembic
  répond alors la révision du DEV) ; le réseau `interne` est `internal: true`, donc **publier un
  port ne marche pas** sans attacher aussi `externe` ; et `tail -3` ne voit plus le marqueur de
  `pg_dump` 16. **Deux** sauvegardes, une par étape : `~/zetis-backups/zetis-prod-20260810-*.sql`
  (621 K chacune, marqueur vérifié).
- ⚠️ **Le Commander n'est TOUJOURS pas idempotent** — commander deux fois la même échéance crée des
  doublons (`Mission` n'a aucune référence à l'agenda). La dette existait déjà (addendum ADR-0035) ;
  **le §14.5 l'a rendue plus probable** en remontant l'action au niveau de l'item. **Obligatoire à
  corriger avant tout déclenchement automatique de missions.**
- ✅ ~~**« Réviser » n'est pas livrable depuis l'agenda (couplage 2 du §11, à 0 %)**~~ —
  **LIVRÉ par l'`adr-0049`**, PR #109, squash `117b632`, mergé le 2026-08-10. Deck `{chapter}`,
  non-scheduling, porte sur l'échéance.
- ✅ ~~**Le plan de préparation (`plan_steps`) vient APRÈS le couplage 2 ; l'emplacement est câblé
  des deux côtés, rempli en dur à `[]`**~~ — **LIVRÉ par l'`adr-0050`, ce chantier.** `plan_steps`
  et `has_plan` ne sont plus morts.
- ⚠️ **`STEP_LESSON` est déclaré mais MORT** (absent de `_build_steps` et `_STEP_PALETTE`) : aucune
  mission ne peut mener à une fiche ni à un cours. 🔴 **Et ce n'est plus une dette subie** :
  l'`adr-0050` Décision 6 le motive — le plan n'est pas une mission, `MissionStep` est hors sujet,
  et ressusciter `STEP_LESSON` ferait une **troisième** surface pour « lire un cours ».
- ⚠️ **Données de test en base DEV** : **cinq** échéances (« La phrase complexe… », « Organisation
  du système nerveux », « Comparaison de fractions », « Division de fractions », « Multiplication
  de fractions »), et depuis ce chantier **8 lignes dans `agenda_plan_steps`** — composées par les
  lectures de Massimo pendant la vérification. Archivables sans risque ; les étapes tombent avec
  leur échéance (FK `CASCADE`).

- 🔴 **LA CROIX ✕ DE MASSIMO EST SANS RETOUR — trouvée par la RELECTURE HUMAINE, le 2026-08-10.**
  **Correction décidée le jour même, PAS ENCORE FAITE** (véhicule à choisir après la relecture).

  **Ce qui est conforme, et qu'il ne faut pas « corriger »** : ce n'est **pas** une suppression.
  `dismiss()` pose `dismissed_at`, la ligne reste en base (§2c « Suppression = archivage »), et
  Papa la retrouve — **filtre « Archivés »** de sa page Agenda, où elle s'affiche « masqué · à
  faire ». Vérifié en base ET aux deux écrans.

  **Ce qui est le défaut** : le geste est **irréversible, et par personne**.
  - **aucune route `undismiss`** — alors que dans le MÊME routeur `done` a `undone`
    (`router.py:111`) et `plan-steps/done` a `plan-steps/undone` (`:141`). **Seul `dismiss` n'a
    pas son contraire**, et c'est ce qui désigne l'oubli plutôt que le choix ;
  - `dismissed_at` est exclu de `_STUDENT_EDITABLE` **ET** de `_PARENT_EDITABLE`
    (`service.py:542`) : **Papa non plus** ne peut rendre l'échéance, il ne peut que la ressaisir ;
  - **aucune confirmation** — un tap sur un écran d'enfant, sur un bouton qui dit « Masquer »
    sans qu'aucun démasquage n'existe.

  🔴 **Et l'ADR-0025 §2c ne décide RIEN sur l'irréversibilité** : il tranche « masquer ≠
  supprimer » et « le masquage reste visible côté pilotage ». **C'est un trou, pas une décision
  tenue** — donc le réparer ne rouvre rien.

  **Retenu (commanditaire, 2026-08-10)** : (A) `POST /items/{id}/undismiss`, strict symétrique de
  `undone`, + un **« Masqué · Annuler » court** à la place de la carte chez Massimo — pas de
  dialogue de confirmation sur un écran d'enfant ; **et** (C) un **« rendre à Massimo »** sur la
  ligne archivée du pilotage de Papa.

  ⚠️ **Une docstring MENT et enverrait une session future casser un comportement juste** :
  `dismiss()` dit *« Massimo masque un item, y compris de Papa »*, ce que contredisent le §2c
  **et** `list_pilot_items` trois lignes plus haut (*« archivés INCLUS »*). Le code a raison.

  ⚠️ **Fixture** : les items **16** et **19** ont été masqués pendant le test puis **restaurés**
  (`update agenda_items set dismissed_at = null where id in (16,19)`). Les items **1** et **2**
  restent masqués **exprès** — sans eux, le filtre « Archivés » de Papa n'a rien à montrer.

### 📁 CONTEXTE DU CHANTIER PRÉCÉDENT — clos, conservé pour ses dettes

> ⚠️ Ce bloc n'est plus un « prochain pas » : il l'était tant que l'ADR-0051 était le chantier
> actif. **Le seul PROCHAIN PAS du fichier est celui de la section active**, tout en haut.
> Son résidu de dev (quiz 56) a été **remonté** dans « DETTES OUVERTES ».

### 1. ✅ L'ADR-0051 EST CLOS — étape 4bis FAITE le 2026-08-11

**Rien à reprendre de ce chantier.** Cadré, livré en deux slices, relu à l'écran, mergé
(squash `239d6e9`), branche supprimée, `main` à `0 0`. Les annonces « à faire » ont été **éteintes
dans l'heure du merge** — `DECISIONS.md` et ici — comme pour les `adr-0047` et `adr-0048`, et non
après vingt-quatre heures comme celle de l'`adr-0044`.

**▶ Le chantier suivant se choisit au `BACKLOG.md`.** Les décisions qui attendent y sont, et l'une
d'elles a **gagné une cause** pendant cette session (voir §2).

**Les trois contrôles du §Suivi de l'ADR, tous PASSÉS** : la ligne d'en-tête de `QuizInspectModal`
est réécrite ✅ · `actionPrincipale()` a disparu ✅ · aucun test ne verrouille plus
`/relecture?kind=diagnostic` comme action principale ✅.

> 🔴 **Le premier ne passait PAS, et c'est le point 6 de `/cloture` qui l'a attrapé.** La slice B
> l'avait annoncé fait ; il ne l'était pas. La phrase *« c'est le SEUL endroit où la clé et
> l'explication sont visibles »* est restée fausse jusqu'à la clôture. **Une vérification par
> commande vaut mieux qu'une case cochée** — c'est exactement ce que cette étape existe pour
> empêcher, et c'est sa deuxième prise en deux clôtures.

⚠️ **Le contrat servi est exactement** `quiz_id · title · subject · total · notions[]`. Il ne porte
**pas** `validation_status` : le cran vient du rail, qui le sert déjà.

⚠️ **Les quatre arbitrages restent TRANCHÉS** (ADR-0051 D1 à D4). On les **relit**, on ne les
rouvre pas — y compris le rejet partiel, hors périmètre et consigné au `BACKLOG.md`.

### 2. 🔴 TROIS DÉCISIONS VOUS ATTENDENT au `BACKLOG.md` — aucune n'est technique

Elles sont entrées par **trois commits sur `main`** (`85a60bc`, `e267902`) pendant cette session,
toutes nées de ce que l'écran a montré :

| Décision | Ce qui la rend non triviale |
|---|---|
| **Les 50 leçons `validated` et VIDES** | `draft`, rédaction, ou archivage — un `draft` **retire de l'écran de Massimo** ce qu'il pouvait déjà ouvrir |
| **La déclaration contre la preuve** | 🔴 porte son propre **CONTRE-signal** : si les preuves suivent les coches, ce chantier n'a **aucune raison d'exister**. Il ne se construit pas « pour être sûr » |
| **Le geste ne dit pas OÙ il va** | une règle du dépôt (`adr-0047`) non appliquée, pas un défaut — ⚠️ **ne pas toucher au tri de `lessons_by_skill`**, partagé par cinq appelants |

⚠️ **Une QUATRIÈME est entrée au cadrage du 2026-08-11** : **le rejet partiel d'un diagnostic**,
hors périmètre **nommé** de l'`adr-0051` (Décision 4). Trois issues, aucune tranchée — l'ouvrir, la
fermer (poser le contrôle de type manquant sur `_question_or_404`), ou ne rien faire et l'écrire.
🔴 **Ne pas élargir `_mission_quiz_or_404` « tant qu'on y est »** : il garde six routes, et
l'élargir ouvrirait `regenerate`, `add_question` et `delete_quiz` aux diagnostics **en silence**.

### 3. ⚠️ Données de DEV laissées telles quelles

- **Agenda** : items **1** et **2** ré-archivés **exprès** — sans eux, le filtre « Archivés » de
  Papa n'a rien à montrer.
- **Curriculum** : les **50 leçons `validated` vides** (dont le chapitre 26, cible de trois
  lacunes du diagnostic Histoire-Géo) et le **chapitre 31** — 2 cours écrits, 2 vides — qui est le
  seul décor exerçant les deux moitiés du lot d'un coup.
- 🔴 **Diagnostic : le quiz 56 est laissé en `pending` EXPRÈS** (2026-08-11). Mathématiques,
  40 questions, 8 notions × 5, **zéro passation**. C'est **le décor de votre relecture visuelle** —
  sans lui, le cran « chez toi · à relire » ne s'affiche pour aucun des 18 diagnostics. Il a été
  basculé, validé pour prouver le verdict, puis **remis en `pending`**. À remettre `validated`
  quand la relecture sera faite.
- **Un fichier modifié hors chantier** dans l'arbre : `docs/frontend-massimo/page-capsules-ia.md`
  (33+/36−). Il n'appartient à aucune slice de l'ADR-0051 — ne pas le laisser partir dans un
  `git add -A`.
- Les serveurs de dev (5174 / 8000) tournaient encore à la clôture.


## Dettes SURVIVANTES des chantiers élagués

> Les récits des chantiers **#97 (engrenages)** et **#98 (ADR-0042)** ont été retirés le
> **2026-08-08**, leurs quatre contrôles du `WORKFLOW.md §6.3` passant tous — ADR,
> `TROUBLESHOOTING.md`, `CHANGELOG.md`, et dettes remontées. Ils se retrouvent par
> `git log -p MEMORY.md`.
>
> 🔴 **Ce qui suit est ce qu'ils laissaient OUVERT, et qui n'existe nulle part ailleurs.**
> C'est le 4ᵉ contrôle : sans cette remontée, l'élagage effacerait des dettes vivantes —
> il en avait exhumé cinq le 2026-08-04.

### ⚠️ DETTES OUVERTES — nées du chantier « engrenages et dossier »

- ⚠️ **Je n'ai jamais vu de mes yeux le vol d'une page sur un lot RÉEL.** L'onglet que je pilote est
  resté `hidden` toute la session, donc étranglé. Le rendu a été vu sur **données forcées**, et le
  lot 47 (41 s, 3 pièces réelles) a été confirmé par l'humain — pas par moi.
- ⚠️ **`prefers-reduced-motion` n'a été vérifié qu'au niveau des RÈGLES** : le bloc vise bien
  `.zx-gears__a/__b` et `.zx-folder__*`, et plus aucun sélecteur périmé. Jamais appliqué.
- ⚠️ **Le `stopped` du dossier n'a pas été exercé** — seul celui des engrenages l'a été.
- ⚠️ **Données de dev** : **quatre** lots réellement produits (44, 46, 47, 48), **10 pièces neuves
  auto-validées** que Massimo verra — 1 carte (lot 44), une fiche + un quiz + une mindmap sur
  « Réalisme / Naturalisme » (lot 47, chapitre 45), et une fiche + un quiz + une mindmap + 4 cartes
  sur le chapitre 3 (lot 48, contrôle de la recette).
- ⚠️ **~~Après le lot 48, la base n'a plus aucun gisement~~ — FAUX depuis 17:00.** Le drainage du
  lot de contrôle 503 a réveillé, via `scan_triggers`, trois travaux de curriculum en sommeil
  depuis 12:06 : **6 leçons créées et 1 cours rédigé**. La leçon **141** (« Expressions littérales
  et vocabulaire », chapitre **11**) a donc un cours écrit et **zéro dérivé**.
  **La recette y annonce 7 pièces** — 3 dérivés + 4 cartes. C'est le gisement pour qui voudra
  revoir la production tourner.
- ⚠️ **Résidus du rejeu 503** : le lot de contrôle **50** (chapitre 21, `generated=0`), plus les
  **6 leçons et le cours** ci-dessus, produits par le drainage — du curriculum que Papa devra
  valider. Les 5 autres leçons créées ont un cours **vide**.
- 🔴 **Trois travaux sont restés `queued` pendant 4 h 50 alors qu'un worker tournait** (743-745,
  12:06 → exécutés à 16:59 au démarrage d'un worker neuf). Personne ne l'aurait su : rien à
  l'écran ne le disait. À creuser — c'est précisément ce que le §10.3 (« balayage des zombies »)
  existe pour empêcher.

### 🔁 DETTES REMONTÉES du chantier « popover en toutes lettres » (PR #96) à son élagage

> Ses trois premiers contrôles passaient — ADR-0041 §23 ✅, section `TROUBLESHOOTING.md` ✅,
> `CHANGELOG.md` 0.56.0 ✅. Le **quatrième** a rapporté ceci, revérifié avant remontée.

- ✅ **`503` / Redis coupé : JOUÉ ET CONFORME (2026-08-07).** Après quatre chantiers d'attente.
  Redis arrêté, `POST /production/runs` rend **503 en 36 ms** (pas 500, pas un blocage) avec la
  phrase attendue : « La file de production est injoignable : rien n'a été lancé, et rien n'a été
  créé. » Et surtout **aucune ligne commitée** — 27 lots et 744 `ai_jobs`, identiques à la
  référence. 🔴 **La preuve la plus nette est un TROU DANS LA SÉQUENCE** : l'id 49 a été alloué par
  la tentative puis annulé, la reprise a rendu 50. C'est exactement le §10.1 (« l'objet n'est pas
  commité avant que son enfilement soit acquis »). `/activity` reste honnête pendant la panne :
  `worker_alive: **false**`, pas `null`.
  **Rejeu au niveau API : conforme** — la même requête rend 202 en 79 ms dès Redis relancé.
- 🔴 **Le rejeu du §10.2 n'est PAS joué** — ne pas confondre avec le précédent. §10.2 exige **deux
  tentatives** sur échec **transitoire côté worker** (moteur injoignable, timeout) et **zéro** sur
  échec structurel. L'exercer suppose de rendre Ollama injoignable pendant qu'un travail tourne,
  donc de toucher un service de l'hôte. **C'est la moitié de la dette qui reste ouverte.**
- ⚠️ **Le chemin automatique complet d'un refus `already_produced` n'a pas été joué** —
  `scan_requests` est bloqué **avant** le régulateur par le gate de régime, donc ce refus n'est
  persistable qu'en mode autonome.
- ⚠️ **« en cours · couloir séparé, ne retarde rien » n'a pas été vu** — il aurait fallu un rendu
  vidéo en cours pendant l'observation.
- ⚠️ **« arrêté — plus rien ne l'exécute » n'a pas été vu** : c'est l'état `stale` d'une ligne,
  distinct de l'arrêt du worker.
- ⚠️ **Le tapis n'a été vu qu'en régime MESURÉ.** Le liseré qui balaie sur un travail unitaire long
  n'a jamais été observé en vrai.
- ⚠️ **L'empilement de trois travaux en file n'a jamais été exercé** (deux, oui).
- 🔴 **Deux tests de `test_dashboard.py` alternent au rouge selon l'heure** — pré-existants, sortis
  en tâche séparée, non corrigés.
- ⏹️ ~~Le worker de production est ARRÊTÉ~~ **PÉRIMÉ le 2026-08-09 — il TOURNE**, voir la
  section active. Texte d'origine conservé pour le contexte : *(2026-08-07, fin de session, plus aucun
  processus). Il traînait allumé depuis deux chantiers. Pour le relancer :
  `cd apps/backend && .venv/bin/python -m app.production_worker` — ou `pnpm dev:worker`.
  ⚠️ Sans lui, un lot lancé depuis la Couverture reste `queued` **indéfiniment**, et la bande
  affichera « ZETIS ne produit pas · aucun moteur de production actif ». C'est le comportement
  juste, pas une panne.
- ✅ **Dette ÉTEINTE** : « les jetons qui traversent le tapis n'ont jamais été vus ». Vu cette
  session — jeton `mindmap` sur le tapis. ⚠️ Mais **sur données forcées**, pas sur un lot réel.

### 🔴 La base de dev est saturée — et voici comment trouver un lot qui produit VRAIMENT

Le piège « `eligible` ne veut pas dire *a du contenu à produire* » a coûté deux lots pour rien cette
session : le **46** (9 notions, 45 pièces) a rendu `generated=0 skipped=45` en **1 seconde**.

La recette est écrite **avec son SQL** dans `TROUBLESHOOTING.md`, et elle a été **validée par une
prédiction falsifiable** : 7 pièces annoncées sur le chapitre 3, **7 obtenues** (`fiche ×1`,
`mindmap ×1`, `quiz ×1`, `srs ×4`) en 58 s — puis 0 à la contre-épreuve.

🔴 **Ma première version était FAUSSE sur deux points**, et les deux se paient en lots gaspillés :
`cours`/`fiche`/`mindmap`/`quiz` sont **par leçon** (seul `srs` est par notion — le lot 47 avait
4 notions **sur une seule leçon**), et le cours doit être **écrit**, pas seulement `validated` —
une leçon validée mais vide ne dérive rien. Ce second point est le piège du 2026-08-04 (« 39 leçons
`validated` VIDES »), retombé dedans un an de chantiers plus tard.

⚠️ Et même là, les 5 événements d'une notion sont commités **ensemble** : `pieces_produced` monte
par paliers, donc les pages volent **en rafale** (3 au plus), jamais en continu.

### ▶ DETTES OUVERTES

> ⚠️ **Les trois premières sont REMONTÉES du chantier « carte mémoire à 4 vues » (PR #91) lors de
> son élagage (2026-08-06, clôture du Lot 0 ADR-0040)**, revérifiées avant remontée.

- 🔴 **Trois chantiers d'affilée mergés sans relecture visuelle HUMAINE** (#79, #89, #91), et le
  Lot 0 (#92) fait le quatrième — vu par l'agent, pas par le user. `WORKFLOW.md §5bis` demande
  l'œil humain avant la PR. Ce qui reste à regarder du #91 : les quatre vues, en particulier
  « Révisions » sur **30 j** et **Trimestre**.
- ⚠️ **La vue « Solde » n'a jamais été vue NON VIDE.** `skill_mastery_history` n'a que 4 lignes,
  toutes des entrées en `weak` — ni barres montantes, ni descendantes. ⚠️ **Le Lot 1 la nourrira**
  (`mastery_transitions` lit cette même table) : à regarder à ce moment-là.
- 🔴 **Aucun clic sur un titre focalisable n'a abouti depuis le panneau navigateur.** Les clics par
  `ref` y rendent des coordonnées **page**, hors de l'espace de clic (800 px), et échouent **en
  silence**. **Parade trouvée au Lot 0** : passer par `claude-in-chrome` (vrai Chrome, vraie
  session) — un clic réel y a abouti. Le panneau reste inutilisable pour ça.

> ⚠️ **Les quatre suivantes sont REMONTÉES du chantier « KPI À renforcer » (PR #90) lors de son
> élagage (2026-08-06, 4ᵉ contrôle).** Ses trois autres contrôles passaient — ADR
> `adr-0028-dashboard-papa-agregat-unique.md` (Amendement 2) ✅, `TROUBLESHOOTING.md` §`feat/kpi-a-renforcer` ✅,
> `CHANGELOG.md` 0.51.0 ✅ — mais ses « résidus » enterraient quatre constats **encore vrais**,
> revérifiés un par un à la clôture.

- ⚠️ **Deux incohérences pré-existantes de `.claude/launch.json`.** `massimo` (:5173) et `papa`
  (:5174) portent `autoPort: true` alors que le `cors_origins` **par défaut** du backend est
  exactement 5173/5174 — un glissement de port casserait le CORS **sans message clair**. Et
  ✅ ~~`massimo-dev2` / `papa-srs` réclament tous deux le port **5177**~~ — **SOLDÉ le 2026-08-21**
  (`chore/carte-des-ports`, commit `b342e9e`) : `papa-srs` était un **doublon exact de `papa-dev`**
  (même frontend, même backend 8001), reliquat du 2026-07-04 ; il est retiré, 5177 n'a plus qu'un
  propriétaire. Aucune donnée touchée — `launch.json` n'est lu par rien à l'exécution.
- ⚠️ **`KPI_ORDER` est un export MORT** (`dashboardDerive.ts:322`) — **revérifié le 2026-08-06** :
  lu par aucun fichier, son seul autre occurrence est une mention dans un commentaire d'ADR. Un
  `DashboardFocus[]` incomplet ne ferait bouger ni test ni compilateur.
- ⚠️ **Deux écarts pré-existants du dashboard.** Le delta de `consolidated` n'est **pas**
  `value - series[0]` (`reconstruct_series` filtre sur `> mark`, strict, alors que le delta compte
  `first <= d <= last` : une notion consolidée pile le premier jour est comptée d'un côté et pas de
  l'autre) ; et `open_gaps.delta` est **codé en dur à `0`** — revérifié, `service.py:993`.
- ⚠️ **`FRAGILE_STATUSES` n'est pas là où l'ADR-0028 §3 bis l'annonce.** Il est dans
  `dashboard/projections.py:42`, pas dans `progress/service.py` : la dépendance va de `progress`
  **vers** `dashboard`. Constat, pas correction — le déplacer est un refactor transverse.

> ⚠️ **Les cinq suivantes sont REMONTÉES du chantier « souffle, donut, créneaux » (PR #89) lors de
> son élagage (2026-08-05, 4ᵉ contrôle).** Ses trois autres contrôles passaient — section
> `TROUBLESHOOTING.md` présente, entrée `CHANGELOG.md` présente — mais **le premier a ÉCHOUÉ** : ce
> chantier n'a **aucun ADR**, et c'est la première de ces dettes.

- 🔴 **« Semaine en cours » n'est figée par AUCUN ADR.** Le chantier PR #89 est entré par quatre
  demandes directes, jamais par `/ouverture`. Les trois premières sont des raffinements de
  l'ADR-0028 §5/§6 et s'en accommodent ; **la quatrième non** — c'est une **surface nouvelle**, un
  troisième onglet que l'ADR-0028 ne décrit nulle part, aujourd'hui figé seulement dans
  `docs/frontend-papa/page-dashboard.md`. **Premier geste du prochain chantier dashboard** : un
  addendum qui la fige, ou son retrait si elle ne convainc pas à l'usage.
- 🔴 **Le souffle du focus n'a JAMAIS été vu en mouvement, et il est sur `main`.** Géométrie et
  intensité vérifiées sur captures figées ; le **rythme**, non — c'est exactement ce qu'une capture
  ne montre pas. Merge sur décision explicite du user, **arbitrage assumé** — mais la dette est
  passée d'« avant merge » à « sur `main` ». Même motif que le bandeau Massimo de la **PR #79, qui
  est toujours dû**. À juger à l'œil, sur les cinq KPI et sur une carte haute.
- 🔴 **`prefers-reduced-motion` n'a jamais été exercé.** La règle est livrée et bâtie comme les deux
  qui existent déjà dans `index.css`, mais elle n'a pas pu être émulée depuis le navigateur. Le
  seul comportement de ce chantier qui repose uniquement sur de la relecture de CSS.
  ✅ **La TECHNIQUE existe depuis le 2026-08-07** (addendum 2 ADR-0041) : forcer la media query en
  écrivant `regle.media.mediaText = 'all'` sur la `CSSMediaRule` trouvée dans `document.styleSheets`,
  photographier `getComputedStyle(...).animationName` avant/après, puis restaurer. La dette reste
  ouverte **pour le souffle du dashboard**, qui n'a pas été repassé — mais elle n'est plus bloquée.
- ⚠️ **La grille des créneaux n'a de données réelles que sur la fenêtre courte.** Sur `?period=365`
  les 56 cases sont vides (91 % du temps est « hors matière », le reste hors plage 8 h–24 h). Le
  rendu multicolore n'a été vu que sur la fenêtre par défaut.
- ⚠️ **Les trois vues du dashboard n'ont été vues qu'en desktop** — aucun contrôle responsive.

> ⚠️ **Les trois suivantes sont REMONTÉES du chantier « file de relecture » lors de son élagage
> (2026-08-05, 4ᵉ contrôle).** Elles étaient enterrées dans ses « résidus » et n'existaient nulle
> part ailleurs.

- ⚠️ **Aucun clic « Valider » / « Rejeter » de `/relecture` n'a été joué en vrai** — délibéré, ça
  aurait muté la base de dev. Le **retrait optimiste**, le **rattrapage d'erreur** et les **deux
  endpoints `/reject`** ne sont donc couverts que par des tests, jamais vus à l'écran. À exercer à
  la première occasion réelle.
- ⚠️ **`/relecture` n'a été vue qu'en desktop** — aucun contrôle responsive.
- ⚠️ **`docs/frontend-papa/page-dashboard.md` L124-125 décrit une implémentation qui n'existe pas** :
  un attribut `data-scope="temps regularite"` + un sélecteur `[data-scope~="<focus>"]`. Le code
  utilise `data-card` + la fonction JS `matchesFocus`. Le même paragraphe annonce `opacity: .32` là
  où le code pose `opacity-40`. Relevé le 2026-08-05 en travaillant juste à côté, **laissé hors
  périmètre**. (Doublon partiel d'une dette plus bas, qui la nommait déjà parmi quatre divergences
  doc↔code — celle-ci est la seule à survivre, les trois autres portent sur l'ADR-0028 §7.)

> ⚠️ **Les quatre suivantes sont nées du chantier « file de relecture » (2026-08-05).**

- ⚠️ **Le bandeau ambre de la Couverture et la file comptent deux populations différentes**, et c'est
  assumé : `totals.pending_count` ne voit que les dérivés `pending` **de la matrice** (1 en dev), la
  file couvre cinq familles dont deux qui n'y figurent pas (32). Le bouton ne porte donc **aucun
  chiffre**. **Déclencheur de réouverture** : si quelqu'un demande un jour pourquoi le bandeau dit
  « 1 » et la file « 32 », c'est que le libellé ne suffit plus — il faudra nommer les deux
  populations à l'écran, jamais inventer un troisième compteur.
- ⚠️ **Les quiz restent hors de la file de relecture** (`quizzes` n'a pas de `validation_status`,
  ADR-0014 §2). Les y faire entrer demande **une migration ET un changement de doctrine** — deux
  décisions, pas une. Verrouillé par test pour que l'absence se lise comme un choix.
- ⚠️ **Les objets `pending` hors année active ne sont plus comptés nulle part** (décision §3). Sur la
  base de dev, une leçon a disparu du compteur (27 → 26). **Aucune page ne les atteint** — c'était
  déjà vrai avant, la différence est qu'on ne les annonce plus. Une commande de rattrapage reste à
  écrire si des années archivées doivent un jour être relues.
- ⚠️ **`/relecture` n'offre aucun aperçu du contenu** : Papa doit sortir par « Voir → » pour lire
  avant de trancher. **Déclencheur de réouverture**, écrit dans l'ADR-0039 : Papa qui ouvre la file
  et la referme sans rien trancher. La réponse serait alors de rapprocher la lecture de la décision,
  **jamais** d'ajouter un « tout valider ».

> ⚠️ Les **six suivantes** sont nées du **2026-08-05 (la file de production)** ; suivent celles des

> ⚠️ Les **six premières** sont nées du **2026-08-05 (la file de production)** ; suivent celles des
> preuves + dépliage, de l'analyse par matière, de la vue à l'année, et du 2026-08-04.
>
> ✅ **Une dette éteinte** : « les lots #24-27 s'accumulent en file », qui était le signalement
> lui-même — file vidée, cause corrigée, garde posée.
>
> ⚠️ **Une dette que j'ai CRU éteindre et qui ne l'est pas.** J'avais écrit ici que les jobs RQ
> fantômes du 2026-08-04 étaient purgés : **c'est faux, vérifié à la clôture** — `FailedJobRegistry`
> en contient toujours **21**. Seuls les 3 jobs en double des lots #25/26/27 ont été supprimés, et
> ce sont deux choses différentes. La dette d'origine reste plus bas, intacte.

- ⚠️ **Le chantier n'est pas passé par `/ouverture`** : entré par un signalement de bug, la branche
  a été créée **après coup**, au moment de committer. Éteint par le merge — mentionné parce que le
  travail a existé plusieurs heures en non-commité sur `main`, et que c'est le genre de fenêtre
  qu'un `git checkout` malheureux referme mal.
- ⚠️ **Le découpage en trois commits a révélé un couplage que l'état final cachait** :
  `useRunProgress` déclarait `started_at` dans son type alors que le premier commit ne s'en sert
  pas. Seul `tsc` lancé sur l'état du commit isolé l'a vu. **Vérifier chaque commit sur son propre
  état, pas seulement la branche entière** — c'est la parade, et elle ne coûte qu'un `git stash
  push -- <chemins>`.
- ⚠️ **L'ADR de ce chantier est écrit APRÈS son code** — dette éteinte, mais l'ordre reste un écart.
  `adr-0036-demande-vers-production.md` (Amendement 2) fige cinq règles déjà livrées ; il n'a donc jamais pu
  **infléchir** la conception, seulement la constater. C'est exactement ce que le rituel
  `mockup → spec → ADR → prompt` existe pour éviter, et le document le dit dans son propre Statut.
  ⚠️ **Ne pas en faire un précédent** : ça a marché ici parce que le chantier était petit et
  entièrement mesuré. Sur un chantier de conception, un ADR écrit après le code n'est plus une
  décision — c'est une justification.
- ✅ **Écrire l'addendum a révélé que tout son §1 était SANS VERROU côté écran** — le verbe, l'ambre,
  le point qui cesse de battre : vrais à l'écran, tenus par rien. `PapaLayout.test.tsx` a gagné deux
  tests (l'arrêt **et** sa contre-épreuve worker présent), sabotés séparément. ⚠️ Le cœur en est
  l'assertion sur l'**animation** : le texte se relit, un `className` conditionnel se « simplifie »
  en silence — et c'est le point qu'on regarde avant la phrase.
  > **Écrire l'ADR après le code a donc servi à quelque chose de précis** : formuler une règle
  > oblige à chercher ce qui la tient, et c'est là qu'on voit que rien ne la tient.
- ⚠️ **Aucun lot n'a été vu TOURNER pour de vrai.** Les quatre écrans vérifiés le sont sur des lots
  `queued` (dont deux lots témoins créés puis supprimés). Le seul lot exécuté de la session (#28) a
  duré **76 ms** — trop court pour observer quoi que ce soit. Donc : la **barre mesurée**, la
  **reprise du pourcentage après navigation** et la **modale de production** n'ont été prouvées que
  par les tests, jamais à l'œil. À rejouer sur une notion **sans** contenu, en connaissance du coût
  (génération LLM réelle).
- ⚠️ **`piece_deja_produite` ne connaît pas la fraîcheur.** Elle répond « ça existe », jamais « ça
  existe mais le cours a changé depuis ». La Couverture, elle, sait dire *périmé*
  (`content_updated_at`). Une fiche périmée sera donc **refusée** comme un doublon. Ce n'est pas
  faux aujourd'hui — la régénération passe par la page de la pièce, pas par un lot — mais si un jour
  « reproduire ce qui est périmé » devient un geste de la page Demandes, c'est ici qu'il bloquera.
- ⚠️ **Le worker de dev a été laissé TOURNANT** (`nohup … app.production_worker`, log dans
  `/tmp/zetis-worker.log`). Il survivra à la fermeture de ce panneau. ⚠️ Il tourne sur le code **non
  commité** : un `git stash` le laisserait exécuter un autre code que celui du dépôt.
- ⚠️ **Le `worker_alive` n'a jamais été testé avec un vrai Redis dans la suite** — impossible par
  construction (`file_rq_factice` lève sur toute connexion). Les verrous vérifient que la route
  **pose la question** au bon moment, pas ce que Redis répond. La réponse, elle, a été vérifiée à la
  main sur la vraie file (`Worker.all()` = `[]` pendant que `count()` = 1).

- ⚠️ **DEUX définitions de `has_referentiel` coexistent** : `dashboard._referentiel_subjects` (≥ 1
  **chapitre** dans l'année active) et `progress.analysis._referentiel` (≥ 1 **leçon**, via
  `coverage()`). Progression utilise la première — celle du constat qui pointe vers elle. L'écart
  n'est **pas résolu**, et rien ne le borne aujourd'hui.
- ⚠️ **`XPEvent` n'a pas de `skill_id`**, donc le XP ne peut pas se détailler par notion. Décidé,
  écrit dans l'ADR et **affiché à l'écran** (« réparti par activité »). Le lever exige une migration
  — et d'abord d'établir que quelqu'un se pose la question.
- ⚠️ **`XPEvent` est un import MORT dans `activity/service.py:24`** — une seule occurrence dans tout
  le fichier, l'import lui-même. Vestige d'une lecture retirée. Signalé, hors périmètre, non traité.
- ⚠️ **Le contraste du filtre `/lacunes` n'a pas pu être vu en vrai** : la base de dev ne porte
  **qu'une seule lacune ouverte** (Français — Temps du récit, déjà couverte). Filtrer sur Français
  y donne le même écran que « toutes ». Le comportement est verrouillé par 6 tests et par le cas
  `?subject=klingon` joué en vrai, **mais le contraste entre deux matières n'a jamais été observé**.
  Idem pour la mention « · toutes matières » des boutons : aucune section « découvertes » n'existe
  dans ces données.
- ⚠️ **Serveurs de dev debout à la clôture du 2026-08-05** — vérifié par `lsof` : backend `:8001`,
  Papa `:5175`, Massimo `:5176`. ⚠️ Ils ont été **lancés par une AUTRE session**, pas par celle-ci :
  `preview_start` a refusé les deux ports, et la vérification à l'écran s'est faite sur eux. Ils
  survivront donc à la fermeture de ce panneau-ci.
- ⚠️ **Aucune action du dépliage n'a été DÉCLENCHÉE en vrai.** « Créer une mission » et « Équiper »
  sont testés (7 verrous, dont la confirmation obligatoire) et leurs routes préexistent — mais
  aucune n'a été cliquée jusqu'au bout sur la base de dev, volontairement : `equip-notion` génère et
  auto-valide un kit entier. **À jouer une fois, en connaissance du coût.**

- ✅ **La dette « migration appliquée en DEV seulement » est SOLDÉE (2026-08-07).** Elle traînait
  sur `f7a8b9c0d1e2` et sur une dizaine d'autres. La base **prod-like** (`zetis-prod_postgres_data`)
  était restée à `e1f2a3b4c5d6`, soit **32 migrations de retard** — arrêtée au 4 juillet, alors que
  `main` avait avancé d'une dizaine de chantiers. `alembic upgrade head` l'a portée à
  `e7f8a9b0c1d2` : **403 colonnes et tous les index identiques au dev**, données intactes
  (476 notions, 119 leçons, 111 `ai_jobs`). Sauvegarde préalable dans `~/zetis-backups/`.
  ⚠️ `f7a8b9c0d1e2` reste **non exercée par un test** — c'est l'autre moitié de la dette, elle,
  toujours ouverte.
  ⚠️ **Le postgres prod ne publie AUCUN port** (`docker-compose.prod.yml`) : c'est ce qui permet de
  le démarrer seul, sans bousculer le dev qui occupe 5432. Pour y lancer alembic depuis l'hôte, le
  publier temporairement via un fichier d'override (`ports: ["5433:5432"]`) — le volume nommé
  survit à la recréation du conteneur. **Discriminant obligatoire avant tout `upgrade`** :
  `alembic current` doit répondre la révision de la PROD, jamais celle du dev.
- ⚠️ **`Gap.subject_id` et `Skill.subject_id` peuvent diverger.** Le dashboard, `/lacunes` et le
  panneau attribuent par la colonne du `Gap` ; le Conseil groupe par la matière de la NOTION.
  L'écriture ne les contraint pas (`diagnostics` écrit `subject_id=quiz.subject_id`). L'écart est
  **borné par un test**, pas résolu.
- ⚠️ **Le Conseil n'a aucun identifiant de run** : aucun sondage possible, rien ne peut signaler
  ailleurs qu'une synthèse est en cours. La phrase de la confirmation (« tu peux quitter cette
  page ») REMPLACE un dispositif absent. **Déclencheur de réouverture** : le jour où une génération
  ciblée est lancée puis oubliée, il faudra un `ProductionRun` pour le Conseil.

- ⚠️ **Dette PARTIELLEMENT payée le 2026-08-05, session connectée.** La PR #82 avait été mergée
  sans que rien n'ait été vu à l'écran. Depuis : les **pictogrammes**, l'**échelle ajustée** et le
  **désentassement** ont été vérifiés en vrai (et c'est ce qui a révélé que le désentassement ne
  marchait pas — cf. défauts). **Reste dû** : le champ Période sur `/conseil?period=365`, qui doit
  afficher « Année scolaire » — jamais ouvert.
- ⚠️ **L'échelle adaptative ne sépare pas des matières à EXACTEMENT 0 %.** Au 2026-08-05, 4 des 5
  matières tracées y sont (1 notion consolidée sur 280) : elles restent sur la même ligne. C'est la
  donnée, pas le cadrage. Le seul vrai remède serait de changer ce que Y mesure — notions
  *engagées* (0 → 10,4 %) plutôt que *consolidées* — **écarté par le user**, ce serait un autre sens
  de carte et un addendum d'ADR.
- ⚠️ **Quatre divergences doc↔code relevées et NON corrigées** (hors périmètre du lot) :
  `page-dashboard.md` parle de `data-scope`, l'attribut réel est **`data-card`** ; ADR-0028 §7
  affirme que `ConseilClasseIAPage` **ne lit aucun query param** (périmé, elle les lit) ; le même §7
  annonce une régénération **destructive avec `ConfirmDialog`** (jamais implémentée — la génération
  *empile*, elle n'écrase rien) et un **état vide local** si la matière manque au rapport (non
  implémenté). ⚠️ Et surtout : **le `period` transmis au Conseil ne sélectionne AUCUNE donnée**
  (`reports/service.py` : « v1 : état courant, pas de fenêtre temporelle ») alors que l'ADR justifie
  son transport par l'inverse. À trancher — soit le CTA cesse de le passer, soit la doc dit que
  c'est un simple libellé.
- 🔴 **Deux des cinq vérifications à l'écran n'ont PAS pu être jouées, faute de données** — et rien
  ne les rejouera tout seul :
  - **le tri par mode dans les deux sens** : la base de dev ne porte que 2 lots *Autonom* et 7
    « régime inconnu ». Aucun *Manual*, aucun *Hybrid* → croissant et décroissant rendent la même
    chose. Le comportement est verrouillé par un test unitaire, **il n'a pas été vu** ;
  - **la pagination** : 9 lots pour une page de 20, donc `has_more` est faux et le bouton n'apparaît
    jamais. À rejouer **dès qu'il y aura 21 lots**.
- ⚠️ **Le chapitre 10 (« Les fractions ») reste sans matière d'année.** La porte est fermée pour
  l'avenir (`fix(subjects)`), mais **aucune rétro-attribution** n'a été faite : ce chapitre existe,
  vide, invisible du résolveur canonique. Une ligne de SQL suffirait, elle n'a pas été écrite —
  c'est une donnée, pas un défaut de code.
- ⚠️ **`lesson_targets` n'a pas été touchée**, et c'est cohérent tant que la porte tient : tout
  chapitre neuf porte sa matière d'année. Si le rattachement par thème SEUL devait redevenir
  légitime, il faudrait donner une **année** aux thèmes (migration) et étendre `lessons_by_skill` —
  chantier nommé dans l'ADR, non ouvert.
- ⚠️ **Le filtre par matière est MONO**, alors que l'ADR décrit tous les critères comme
  multi-valeur. `SubjectFilterChips` est la brique partagée du Dashboard, de la Couverture et du
  Cahier de bord, et elle est contrôlée par `value: number | null` : la rendre multi toucherait
  trois autres pages. **Le serveur accepte déjà une liste** — rien n'est perdu de ce côté.
- ⚠️ **Les serveurs de dev ont été laissés debout** : `backend-dev2` sur `:8002` et `papa-dev2` sur
  `:5178`. ⚠️ `:8001` était occupé par le serveur d'une **autre session**.
- ⚠️ **Deux fausses alertes ont été émises pendant la session** (« l'or n'est pas généré », « l'ombre
  est transparente »), toutes deux dues à un motif de recherche ou une troncature, pas au code. La
  parade est écrite dans `TROUBLESHOOTING.md` — vérifier une valeur arbitraire Tailwind se fait sur
  la **forme hexadécimale** et sur l'élément **rendu**, jamais sur une chaîne devinée.

> ⚠️ Les six dettes qui suivent sont **nées de la session du 2026-08-04 (production)**.

- 🔴 **`Lesson.status` porte DEUX sens** — « la leçon est au programme validé » (ce qu'écrit
  `validate_all_lessons`, sans regarder s'il y a un texte) et « le texte du cours est validé » (ce
  que lit la production). **39 leçons validées-vides contre 28 rédigées** en base de dev. Le
  chantier de séparation exige une **migration** et touche curriculum, galaxie, production et
  `canonical_context`. Nommé dans l'addendum ADR-0036, jamais ouvert.
- 🔴 **Les libellés de cartes SRS affichent du LaTeX BRUT** à l'écran du Journal
  (`Comment calcule-t-on $\frac{2}{5} \times \frac{3}{4}$ ?`). Un `title` au survol a été ajouté
  pour la troncature en pleine formule, **rien ne rend les maths**. Un moteur (KaTeX) est une
  dépendance → **ADR**, pas un correctif.
- ⚠️ **Les suites front ont flaké sous charge le 2026-08-04** (1 puis 2 échecs, `environment` à
  357 s au lieu de 30, en lançant papa + massimo + graphify en parallèle). Trois exécutions
  séquentielles ensuite : vertes. **Les noms des tests n'ont pas été capturés.** Si ça revient sur
  une machine au repos, c'est un vrai défaut de timing, pas la charge.
- **18 jobs RQ fantômes ont été exécutés** contre le Postgres de dev pendant la contre-épreuve
  (`run_production(1)`, `ValueError: production_run 1 introuvable`). Ils sont dans
  `FailedJobRegistry` et n'ont **rien produit**, mais ils y restent — purge non faite.
- **`_pieces_of_run` interroge cinq tables PAR LOT**, et la résolution des cibles en ajoute une
  sixième. Borné par `limit`, jamais mesuré. À regarder si le Journal ralentit.
- **Les lots #21, #22 et #23 ont été SUPPRIMÉS de la base de dev** le 2026-08-04, sur autorisation
  explicite — trois doublons stériles sur la notion 50, aucune pièce rattachée. C'est une
  **réécriture d'historique assumée**, mentionnée ici parce qu'elle contredit la doctrine du §F.4 et
  qu'une session future pourrait s'étonner du trou dans la numérotation.

> ⚠️ Les cinq dettes qui suivent sont **nées de la session du 2026-08-04 (bandeaux)**. Elles portent
> toutes sur la même chose : **rien de ce chantier n'a été jugé à l'œil sur un vrai appareil.**

- 🔴 **LE BANDEAU MASSIMO N'A JAMAIS ÉTÉ VU.** Le panneau navigateur de la session rendait en taille
  réduite : tout ce qui est affirmé sur le rendu est **mesuré dans le canvas** (13–15 bandes sur 20
  occupées selon l'angle, cœur 9× plus lumineux que la périphérie, 86 % de pixels chauds, 19 im/s),
  **pas vu**. ⚠️ **Le merge de #79 a eu lieu QUAND MÊME**, sur décision explicite après que le point
  a été signalé — c'est un arbitrage assumé, pas un oubli, mais la dette n'est pas éteinte pour
  autant : elle est simplement passée d'« avant merge » à « sur `main` ». Elle ne peut pas être
  payée par l'agent. À juger : vitesse de rotation, remplissage, lisibilité du bloc avatar
  par-dessus.
- **`IN_FLIGHT_BUDGET` (32), `ROTATION_PERIOD` (72 s), `FLATTEN` (0,035) et `HEADER_TOTAL` (7 s) ne
  sont pas passés au profileur.** L'addendum ADR-0024 reproche à `GALAXY_MAX_NODES` que « ses
  valeurs n'ont JAMAIS été mesurées » — ne pas refaire la même chose. Une capture Safari sur iPhone,
  jeu semé à ~300 notions. C'est la même dette que « LA GALAXIE — vérifiée à moitié » ci-dessous,
  et les deux se paient d'un seul coup.
- ⚠️ **En phase VIVANTE, le coût par image du bandeau est proportionnel à N** (~202 blits de sprite
  à 19 im/s). C'est le prix explicite de la rotation : dès que tout bouge, le calque posé ne sert
  plus. Pendant la **construction**, il reste indépendant de N. Écrit dans l'addendum §4bis — c'est
  sur iPhone que ça se jugera, pas ici.
- **Le remplissage plafonne à ~65 % de la largeur** à l'arrêt, conséquence directe de l'arbitrage de
  la répartition angulaire. S'il faut mieux : **ne pas toucher la répartition** (elle porte la
  rotation), mais le rayon du disque ou la taille des amas.
- **Le bandeau ne se met pas à jour en cours de session.** Si Massimo travaille une notion, son
  étoile n'apparaît qu'au rechargement suivant. Assumé (`galaxyShared` a une fenêtre de fraîcheur de
  5 s, pas un cache), mais jamais éprouvé en usage réel.


- **Les 22 montées de dépendances backend, différées SCIEMMENT** (mesurées le 2026-08-04 par
  `uv lock --upgrade --dry-run`, qui n'écrit rien). Majoritairement patch/mineures, mais quatre ne
  sont pas anodines : `websockets` 16 → **17** (majeure), `pgvector` 0.4 → **0.5** (le RAG),
  `piper-tts` 1.4 → **1.6** (la voix des capsules), `onnxruntime`/`huggingface-hub` (la dictée).
  ⚠️ **Aucune de ces quatre n'est jugée par la suite de tests** : ces chemins s'exercent **en vrai**
  ou pas du tout. Les 807 tests passeraient au vert sur une montée qui casse la génération de
  capsules. Ce n'est donc pas un bump, c'est un chantier avec **vérification live** — génération,
  RAG, dictée, worker RQ.
- **Le warning `httpx2` reste, et le refus est motivé.** `starlette/testclient.py` essaie `httpx2`,
  retombe sur `httpx` en prévenant. Mais `httpx` **n'est pas une dépendance de test chez nous** :
  trois modules applicatifs l'importent (`ollama_provider`, `anthropic_provider`, `mlx_provider`).
  Installer `httpx2` n'en remplacerait aucun — il **s'ajouterait**, soit deux clients HTTP dans le
  venv pour faire taire un avertissement de `TestClient`. Migrer aussi le code applicatif est un
  changement majeur d'API sur le chemin de **toute la génération**. Le bon moment sera celui où
  Starlette **retirera le repli** : là ce sera une panne, pas un warning, et la migration aura une
  raison.
- **`pyproject.toml` n'a toujours aucune borne haute** (`fastapi>=0.115`, etc.). Le plancher
  `starlette>=0.48` corrige le seul cas qui cassait *à l'import* ; il ne dit rien d'une montée
  majeure future. Pas d'action décidée — c'est un constat, pas un TODO.
- 🔴 **Le patron anti-sondage de l'ADR-0030 est SUSPECT partout où il est copié.** Le test
  « 60 s de timers avancés → un seul appel » ne mord que si `vi.useFakeTimers()` est posé **avant**
  le montage. Démontré le 2026-08-04 : la version de `useAutonomyState` restait verte **avec** un
  `setInterval` ajouté exprès. `useNewsSummary` (Massimo) et ses imitations n'ont **jamais** été
  contre-éprouvées. Une heure de travail, et ça peut réveiller un sondage réel.
- **Les deux pastilles héritées de `PapaSidebar`** (missions à valider, demandes de Massimo) font
  toujours leur propre appel réseau depuis le composant — le motif que l'ADR-0030 a supprimé côté
  Massimo. Elles n'ont **aucun test** : les migrer exige d'écrire leurs verrous d'abord, sinon c'est
  une régression silencieuse sur deux files porteuses. Le verrou « la sidebar ne fait aucun appel
  réseau » est **réduit** en attendant, et le dit.
- **La sidebar Papa n'est toujours pas responsive** : `w-64` sans point de rupture, alors que
  Massimo a reçu son tiroir le 2026-08-04. Le chantier est le même, déjà mené une fois.
- **`API_SPEC.md` ne décrit pas `/api/settings/autonomy`** — vérifié le 2026-08-04, l'endpoint n'y a
  jamais figuré. Ce n'est donc pas une régression de ce chantier, mais le contrat vient de changer
  (`preset` → `niveau`) et rien dans ce fichier ne le porte.

- 🟡 **LA GALAXIE — vérifiée À MOITIÉ le 2026-08-04.** Ce qui est **mesuré** : **202 nœuds** servis
  (1 racine, 4 matières, 12 chapitres, **185 notions**), **74 FPS** au viewport tablette, **zéro
  erreur console**, structure et libellés lisibles en desktop et tablette.
  ⚠️ **Ce qui reste ouvert, et que je ne peux pas faire** : la **tenue sur un vrai appareil**. Un
  viewport à 375 px n'est **pas** un iPhone — ni Safari iOS, ni son GPU, ni ses limites WebGL. Les
  74 FPS sont ceux de ce Mac. **Il faut un iPhone réel.**
  ⚠️ Et **185 notions n'est pas « plusieurs centaines »** : le seuil que l'addendum redoutait n'est
  pas atteint, donc le niveau de détail adaptatif n'est **ni prouvé nécessaire ni prouvé inutile**.
  ⚠️ **Les deux réponses sont DÉJÀ DÉCIDÉES** (addenda ADR-0024/0029), les appliquer n'est donc pas
  une nouvelle décision — les contourner en serait une : si la lisibilité ne tient pas → **niveau de
  détail adaptatif**, jamais le retour du plafond ni le rallumage des forces ; si l'iPhone décroche
  → ce sont les **particules** qui tombent, **jamais les nœuds**.
  ⚠️ Cette dette était **enterrée dans l'historique** de ce fichier depuis le 2026-08-01, donc
  invisible à toute reprise. Remontée ici le 2026-08-04 — **et sa vérification a immédiatement
  trouvé plus grave qu'elle** (le point suivant). C'est l'argument le plus net en faveur du 4ᵉ
  contrôle : une dette qu'on n'a pas sous les yeux ne se paie jamais.
- ⚠️ **La spec de navigation Massimo et le code ont DIVERGÉ, et ce n'est pas réconcilié.**
  `docs/frontend-massimo/navigation.md` (étape 2) prescrit **5 verbes** et une **bottom-nav** sur
  iPhone ; la navigation livrée en porte **13**, chacune ajoutée par une décision postérieure
  (Agenda position 2 par l'**ADR-0025**, « Ma Galaxie » par l'**addendum ADR-0024 §A** qui interdit
  d'en faire un 6ᵉ onglet, six témoins par l'**ADR-0030** avec test-verrou).
  Appliquer la spec **masquerait 8 sections sur mobile**. Le tiroir livré le 2026-08-04 répare la
  largeur **sans rien retirer**, et l'écart est consigné dans la spec elle-même.
  ⚠️ **NE PAS écrire d'ADR pour ça — la décision existe déjà.** L'**ADR-0024**, section
  « Divergence assumée avec `navigation.md` », a tranché il y a quatre semaines : *« L'existant
  prime. Réconcilier `navigation.md` est un autre chantier, resté au `BACKLOG.md` »*. Ce qui reste
  est donc **de la documentation** — mettre la spec au réel — et **rien d'autre**.
  ⚠️ **J'avais écrit ici « un chantier de cadrage qui touche trois ADR ». C'était FAUX**, et ça
  aurait envoyé la session suivante rédiger un ADR inutile. Corrigé le 2026-08-04 après lecture de
  l'ADR-0024 — troisième hypothèse de la journée invalidée par le read-before-decide.
- **La notion ORPHELINE** (aucune leçon) reste insatisfaisable : `equip_piece` le **dit**, rien ne
  le répare. Touche aussi « + Programme » et `skills-backfill`.
- **Les appels aux générateurs sont écrits deux fois** (`equip_notion` / `equip_piece`) — refactor
  sans décision produit, son propre chantier, contre-épreuves serrées (3 consommateurs).
- **Le Commander n'est pas idempotent** (exige `missions.agenda_item_id`, donc une migration).
- ⚠️ **SEPT copies privées de `_active_year`** (`curriculum`, `mindmaps`, `missions`, `dashboard`,
  `fiches`, `quizzes`, `production.coverage`), dont certaines scopées par élève et d'autres non.
  `lesson_resolution.active_year` est publique pour **offrir une destination**, pas pour créer une
  huitième divergence. Les unifier demande de trancher le scope élève — pas ce chantier.
- **`resolve_canonical_context` reçoit un `skill_id`, les générateurs un `lesson_id`** — piège déjà
  documenté (patron quiz), jamais rouvert.
- **Le panneau d'analyse à 3 compteurs** (ADR-0025 §11) attend une mesure SRS scopée chapitre.
- **Un devoir fait produire le chapitre entier** — assumé ; **le dispositif est armé depuis le
  2026-08-03, donc c'est maintenant qu'on peut observer** s'il y a gaspillage.

> ⚠️ **Les quatre dettes qui suivent dormaient dans l'historique de ce fichier**, donc invisibles à
> toute reprise. Remontées le 2026-08-04, en élaguant. C'est ce qui a fait ajouter le **quatrième
> contrôle** avant toute suppression de section (`WORKFLOW.md §5`) : l'historique s'était mis à
> servir de **cimetière à dettes**.

- **Report du Journal de production** (ADR-0034) : le refus de retirer un cours **consommé** n'a
  **jamais été vu à l'écran** (il aurait fallu fabriquer une fausse lecture de Massimo — couvert par
  2 tests backend avec contre-épreuve et 1 test front) ; le geste **« Corriger »** est toujours dû ;
  `has_more` n'a pas de bouton.
- **`notionRouteFor` ignore `action.capsule_id`** et ouvre `/capsules` à plat — le libellé
  « Regarder la capsule » **sur-promet déjà**. Pré-existant (hérité de `NotionActionPanel`), à
  corriger **quand `/capsules/:id` existera**.
- **`prefers-reduced-motion` n'a jamais été vérifié à l'écran.** Le panneau navigateur ne l'émule
  pas, et l'option est désactivée chez Papa — **le chemin où tout doit se figer n'a donc jamais été
  exercé en vrai**. Couvert par des tests unitaires (`particlesFor`) et la variante `motion-safe:`,
  rien de plus.
  ⚠️ **Élargi le 2026-08-04** : le halo gradué de la sidebar Papa en dépend aussi, et sa garde est
  plus exigeante que les autres — elle doit **figer sans retirer** (couper le halo effacerait le
  signal). Vérifié seulement que la règle CSS **existe dans le CSSOM**, jamais qu'elle rend juste.
  Et **trois animations permanentes** dans le coin de l'œil sur 22 pages n'ont jamais été jugées sur
  60 s de travail réel : si ça distrait, le correctif décidé est de **ralentir**, jamais de retirer
  l'axe.
- 👤 **À la charge de Papa, l'agent ne peut pas le faire** : relire l'**amendement de l'ADR-0017
  §5bis** — c'est un changement de **doctrine** du moteur de missions, pas un correctif d'affichage.

### ✅ LE DISPOSITIF EST DÉSARMÉ (2026-08-04, fin de session)

| Réglage | Valeur — **lue en base le 2026-08-04, en fin de session** |
|---|---|
| Régime dérivé | ***Manuel*** (A0a = 2, **A1 = 2**) |
| Déclencheur `zetis_auto_trigger_enabled` | **`false`** |
| Gate du cours | **actif** — ZETIS ne rédige plus un cours à la place de Papa |
| Base lue | `postgresql://…@localhost:5432/zetis` |

**Vérifié en le FAISANT TOURNER, pas en lisant les réglages** : `scan_agenda` et `scan_requests`
appelés à vide rendent `créés: []`, avec leurs motifs — *« le déclenchement automatique est
désarmé »* et *« le régime n'est pas Autonome »*.

⚠️ **2026-08-04, fin de session — le régime a BEAUCOUP bougé, puis a été remis.** La vérification à
l'écran des trois niveaux et des deux modales exige d'écrire en base : `manuel`, `autonome`,
déclencheur armé puis désarmé, une dizaine d'allers-retours.

🔴 **Le contrôle de clôture a pris ce fichier en défaut DEUX FOIS, sur la MÊME ligne.**

- 1ʳᵉ fois : j'avais écrit « remis à `semi` », la base était sur `manuel`. J'ai écrit avoir remis à
  `semi` et relu depuis l'API.
- 2ᵉ fois, quelques heures plus tard : la base est **de nouveau sur `manuel`** (`A0a = 2`), lue
  directement via `service.read_autonomy` sur `localhost:5432/zetis`.

⚠️ **Je ne sais pas expliquer l'écart, et je ne l'invente pas.** Deux hypothèses, aucune vérifiée :
soit la remise à `semi` n'a jamais été persistée, soit quelque chose a réécrit depuis. Rien dans la
session qui suit n'a touché ces clés — mais c'est exactement ce que j'avais cru la première fois.

**Ce qui est CERTAIN et qui est le seul point qui compte : le dispositif est désarmé** dans les deux
cas — `auto_trigger_enabled = false`, `A1 = 2`, gate du cours actif. Le régime `manuel` est *plus*
conservateur que `semi`, jamais moins.

👤 **Pour la prochaine session : ne pas refaire confiance à une ligne d'état de base écrite ici.**
La relire, toujours :

```bash
apps/backend/.venv/bin/python -c "
from app.db.base import SessionLocal
from app.modules.settings import service
db = SessionLocal(); v = service.read_autonomy(db)
print(service.niveau_de(v), v, service.auto_trigger_enabled(db)); db.close()"
```

⚠️ **Le vrai piège de cette journée** : j'ai cru trois fois à une « dérive inexpliquée » du régime.
Il n'y en avait aucune. **Une seule fonction écrit ces clés** (`write_autonomy`, via `PUT`) — les
bascules venaient de **mes propres clics de vérification** sur la page vivante. Un panneau de
réglages ouvert *est* un outil d'écriture ; le vérifier à la souris change la base.

⚠️ **Serveurs de dev laissés EN MARCHE** : backend `:8001`, Papa `:5175`, Massimo `:5176`. Ils
retombent quand le panneau Browser se ferme.

> Il avait été **armé le 2026-08-03** pour prouver le chemin automatique de bout en bout (deux lots
> `request`/`parent_rule` nés sans clic, deux cours écrits et servis). Cette preuve est faite et
> consignée au `CHANGELOG` 0.40.0 ; le réarmer est un geste de Papa, deux clics sur `/parametres`.

⚠️ **Le réveil périodique reste planifié dans Redis, et c'est normal** : il ne produit rien, il
*regarde* — et désarmé, il rend son motif et repart. Il ne peut de toute façon pas se déclencher
sans worker.

⚠️ **35 jobs RQ fantômes purgés à la fermeture**, tous visant un `production_run` **supprimé** lors
d'un nettoyage antérieur — ils ne pouvaient qu'échouer. **Je n'ai pas su expliquer leur
multiplication** (32 exemplaires du même job, arrivés par paires sur 13 h, dont deux paires aux
heures exactes des merges des PR #73 et #74). Aucun de nos trois appelants de `enqueue_production`
n'est un hook de démarrage. **Observation non élucidée, pas une cause identifiée** — à re-mesurer
si la file regrossit.

---


## Historique des chantiers clos

> **2026-08-10 — le deck de révision par chapitre** (`adr-0049`, couplage 2 du §11, PR
> [#109](https://github.com/NeuronXcore/zetis-school/pull/109), squash `117b632`, base `7d4823c`,
> branche `feat/deck-revision-chapitre` **CONSERVÉE**), section retirée à la clôture du plan de
> préparation (2026-08-10). Contrôles : ADR `adr-0049-le-deck-de-revision-par-chapitre.md` ✅ ·
> `TROUBLESHOOTING.md` **sept** sous-sections ✅ (⚠️ « six » a été compté à sa clôture, vérifié à
> **sept** ici) · `CHANGELOG.md` 0.72.0 ✅ · 4ᵉ contrôle — dettes
> remontées ✅. Ce qui ne survit qu'ici : le chantier a livré une **exemption** au lieu d'un
> réglage — `is_consolidation` veut dire *« cet essai n'a pas mesuré l'oubli »*, et le deck
> chapitre réutilise ce sens au lieu d'inventer un troisième régime. 🔴 **Et sa clôture a MANQUÉ un
> contrôle 4bis** : le panneau Papa a continué d'annoncer *« Réviser les cartes du chapitre n'est
> pas encore possible »* pendant un chantier entier — corrigé le 2026-08-10 par l'`adr-0050`, et
> désormais tenu par un test-verrou.

> **2026-08-10 — l'agenda devient utilisable** (six addenda `adr-0025` §13→§17, PR
> [#108](https://github.com/NeuronXcore/zetis-school/pull/108), squash `526b9b8`), section retirée
> à la clôture du plan de préparation (2026-08-10). Contrôles : addenda ✅ · `TROUBLESHOOTING.md` ✅
> · `CHANGELOG.md` 0.66→0.71 ✅ · dettes remontées ✅ (§ « DETTES NÉES DU CHANTIER AGENDA », toujours
> dans la section active). Migration prod et étape 4bis faites le jour même. Ce qui ne survit
> qu'ici : **cinq de ses six décisions sont nées de l'ŒIL, zéro d'un test** — une teinte à 16° de
> l'émeraude voisine, une gouttière d'un tiers de carte, un tap muet, un champ sans nom.

> **2026-08-09 — ZETIS doute de sa propre mesure** (PR
> [#106](https://github.com/NeuronXcore/zetis-school/pull/106), squash `3c11226` — ⚠️ **deux
> hash différents et tous deux justes** : la branche a forké à `7108cf8`, le squash a pour parent
> `ec39b8e` sur `main`. Vérifiés à la clôture,
> branche `feat/anti-triche-diagnostic` **CONSERVÉE**), section retirée à la clôture du chantier
> « un travail dit ce qu'il a produit » (2026-08-09). Contrôles : ADR
> `adr-0048-zetis-doute-de-sa-propre-mesure.md` ✅ · `TROUBLESHOOTING.md` ✅ **quatre** sections
> (cadrage, session A, sessions B+C, relecture visuelle) · `CHANGELOG.md` 0.64.0 ✅ ·
> 🔴 **4ᵉ contrôle — la section DETTES OUVERTES a été reportée INTÉGRALEMENT** dans la section
> active, pas résumée : elle porte le semis de dev des passations 53 à 56 avec sa recette de
> défaisage corrigée, et **cette recette-là n'existe nulle part ailleurs**. Une seule ligne a été
> mise au réel — le worker, relancé depuis. Ce qui ne survit qu'ici : la relecture visuelle a
> coûté une session et **rapporté cinq défauts qu'aucun des 43 sabotages rouges n'avait vus** ;
> c'est le premier chiffrage du dépôt sur ce que la relecture achète, et le chantier suivant l'a
> **confirmé le jour même** en trouvant un mensonge de plus au même endroit.

> **2026-08-07 — le popover dit l'état en toutes lettres** (PR
> [#96](https://github.com/NeuronXcore/zetis-school/pull/96), squash `8045789`, base `e4fa60d`,
> branche `feat/popover-en-toutes-lettres` supprimée), section retirée à la clôture du chantier
> des animations (2026-08-07). Contrôles : `adr-0041` §23 ✅ · `TROUBLESHOOTING.md`
> §`feat/popover-en-toutes-lettres` ✅ · `CHANGELOG.md` 0.56.0 ✅. **Résidus encore vrais,
> REMONTÉS dans la section active** (huit, dont `503`/Redis et rejeu transitoire, désormais à
> **quatre** chantiers de retard). Ce qui ne survit qu'ici : le chantier devait réécrire des
> phrases, il a trouvé **deux mensonges** — `already_produced` promettait une reprise impossible,
> et le rang se comptait derrière un travail courant qui n'existait pas toujours. Le second
> n'existait que grâce au premier : **un défaut de langage a révélé un défaut de logique.**

> **2026-08-06 — la bande de production** (addendum 2 de l'`adr-0041`, PR
> [#95](https://github.com/NeuronXcore/zetis-school/pull/95), squash `5ba7097`, base `4536893`,
> branche `feat/bande-de-production` supprimée), section retirée à la clôture du chantier popover
> (2026-08-07). Contrôles : addendum 2 dans `adr-0041-tout-ce-qui-produit-se-voit.md` ✅ ·
> `TROUBLESHOOTING.md` §`feat/bande-de-production` ✅ · `CHANGELOG.md` 0.55.0 ✅. **Résidus
> encore vrais, REMONTÉS dans la section active** (six, dont `503`/Redis et rejeu transitoire qui
> traînent depuis trois chantiers). Ce qui ne survit qu'ici : la **barre a été vue tourner pour la
> première fois** — 11 % → 44 % → 78 % sur un lot réel — et **sept défauts n'existaient qu'à
> l'écran**, dont un livré six jours plus tôt par l'ADR-0041 elle-même (`/activity` plantait sur
> tout lot de chapitre, `Chapter.title` au lieu de `name`), muet parce que le hook avale ses
> erreurs par doctrine. Et un cadrage démenti par le code : compter des pièces au lieu de notions
> n'apportait **rien** — mêmes 3,23 %, au même instant — sans la colonne `current_piece`.

> **2026-08-06 — ADR-0041 « Tout ce qui produit se voit » : les trois slices + l'addendum Journal**
> (PR [#94](https://github.com/NeuronXcore/zetis-school/pull/94), squash `4536893`, base `dc1a6ed`,
> branche `feat/barre-de-production` supprimée), section retirée à la clôture de l'addendum 2
> (2026-08-07). Contrôles : ADR `adr-0041-tout-ce-qui-produit-se-voit.md` ✅ ·
> `TROUBLESHOOTING.md` **quatre** sections `feat/barre-de-production` ✅ · `CHANGELOG.md` 0.54.0 ✅.
> **Résidus encore vrais, REMONTÉS dans la section active** : les scénarios `503`/Redis coupé et
> rejeu transitoire n'ont **toujours** pas été joués. **Résidus RÉGLÉS depuis** : la maquette
> égarée est rangée, le responsive de la production est fait, `prefers-reduced-motion` est exercé,
> et le chantier suivant a été vu à l'écran. Ce qui ne survit qu'ici : la thèse du chantier a été
> prise en flagrant délit à l'écran — pendant 11 ms de travail réel, la page du Conseil a déroulé
> dix secondes de pipeline (elle **devinait**) pendant que le header, qui **mesure**, disait la
> vérité : rien.

> **2026-08-06 — la carte mémoire à 4 vues + 2 cartes focalisables** (PR
> [#91](https://github.com/NeuronXcore/zetis-school/pull/91), squash `d0ca126`), section retirée à
> la clôture du Lot 0 de l'ADR-0040 (2026-08-06). Contrôles : 2 addenda `adr-0028` ✅ ·
> `CHANGELOG.md` 0.52.0 ✅. **Résidus encore vrais, REMONTÉS en « DETTES OUVERTES »** : le chantier
> est **mergé sans relecture visuelle humaine** (3ᵉ fois d'affilée, après #79 et #89), la vue
> « Solde » **n'a jamais été vue non vide** (`skill_mastery_history` n'a que 4 lignes, toutes des
> entrées en `weak`), et **aucun clic sur un titre focalisable n'a abouti depuis le panneau
> navigateur**. Ce dernier a trouvé sa parade au Lot 0 : passer par `claude-in-chrome` et le vrai
> Chrome. Ce qui ne survit qu'ici : `covered` avait cessé d'être affichée **sans qu'un test
> rougisse** — les tests portent sur ce qui est affiché, jamais sur ce qui a **cessé** de l'être.

> **2026-08-05 — le 5ᵉ KPI du dashboard Papa, « À renforcer »** (PR
> [#90](https://github.com/NeuronXcore/zetis-school/pull/90), squash `392b075`), section retirée à
> la clôture du chantier « mémoire à quatre vues » (2026-08-06). Contrôles : ADR
> `adr-0028-dashboard-papa-agregat-unique.md` (Amendement 2) ✅ · `TROUBLESHOOTING.md` §`feat/kpi-a-renforcer` ✅ ·
> `CHANGELOG.md` 0.51.0 ✅ · **quatre résidus REMONTÉS** en tête de « DETTES OUVERTES » (les deux
> incohérences de `launch.json`, `KPI_ORDER` mort, les deux écarts de delta du dashboard, et
> l'emplacement de `FRAGILE_STATUSES`) — tous **revérifiés par commande** avant remontée, aucun
> n'était périmé. Ce qui ne survit qu'ici : `gh pr merge --delete-branch` a **basculé le worktree
> sur un `main` local périmé** puis échoué à l'avancer, donnant l'illusion que tous les fichiers du
> chantier avaient disparu — rien n'était perdu, le squash était déjà sur `origin/main`.

> **2026-08-05 — la file de relecture + la fenêtre de la branche `flat`** (PR #86 squash `d727394`,
> PR #87 squash `e42dc64`), section retirée à la clôture du chantier « souffle du focus ».
> Contrôles : ADR `adr-0039-file-de-relecture.md` ✅ · `TROUBLESHOOTING.md`
> §`feat/file-de-relecture` ✅ · `CHANGELOG.md` 0.49.0 et 0.49.1 ✅ · **trois résidus REMONTÉS** en
> tête de « DETTES OUVERTES » (aucun clic Valider/Rejeter joué en vrai, `/relecture` desktop
> seulement, et la divergence `data-scope` de `page-dashboard.md`) — ils ne vivaient nulle part
> ailleurs. Ce qui ne survit qu'ici : le `xfail(strict=True)` de la fenêtre `flat` est **passé
> XPASS donc rouge à la correction**, forçant son propre retrait — première dette du dépôt à se
> rappeler toute seule au moment exact où elle est payée, **patron à réutiliser**.

> **2026-08-05 — une file que personne n'écoute** (PR #85, squash `7c3e290`), section retirée à la
> clôture du chantier « file de relecture ». Contrôles : ADR
> `adr-0036-demande-vers-production.md` (Amendement 2) ✅ · `TROUBLESHOOTING.md` §`fix/file-de-production`
> ✅ · `CHANGELOG.md` 0.48.0 ✅ · **rien d'ouvert** dans la section retirée — les deux dettes 🔴
> qu'elle nommait en « prochain pas » (fenêtre de la branche `flat`, `CHANGELOG` muet sur #82/#83)
> étaient **déjà** dans DETTES OUVERTES, vérifié avant suppression. Ce qui s'y trouvait d'utile et
> qui ne survit qu'ici : le chantier a été **découpé en trois commits vérifiés chacun sur son propre
> état**, et ce découpage a révélé un couplage (`useRunProgress` demandait `started_at` au commit 1
> sans l'utiliser) que la seule vérification finale n'aurait jamais montré.

> **2026-08-05 — le panneau d'analyse par matière** (PR #83, squash `cb59600`), section retirée à
> la clôture du 2026-08-05. Contrôles : ADR `adr-0028-dashboard-papa-agregat-unique.md` (Amendement 1) ✅ ·
> `TROUBLESHOOTING.md` §`feat/analyse-matiere` ✅ · **`CHANGELOG.md` — ❌ à la clôture, ✅ depuis le
> 2026-08-05** : l'entrée manquante avait été remontée en dette, elle a été **rétro-inscrite en
> 0.46.2** depuis les sources · ce qui restait ouvert : **deux dettes PAYÉES** par le chantier
> suivant, le reste déjà dans « DETTES OUVERTES ».

> **2026-08-04 — les deux bandeaux** (PR #78 `4458574`, PR #79 `c02a555`), section retirée à la
> clôture suivante après les quatre contrôles : ADR `adr-0029-rejeu-anime-galaxie.md` (Amendement 2),
> `TROUBLESHOOTING.md` §bandeaux, `CHANGELOG.md`, et **ce qui restait ouvert remonté ci-dessus** —
> dont 🔴 *le bandeau Massimo n'a jamais été vu*, qui est toujours dû.

⚠️ **Il n'y en a plus ici, et c'est une décision** (2026-08-04). Ce fichier portait **2 227 lignes
d'historique pour 122 lignes de chantier actif** — 94 % du contexte d'une reprise dépensé sur du
travail terminé. L'instrument censé économiser le contexte en était devenu le premier consommateur.

**Rien n'a été perdu : tout était déjà écrit ailleurs**, et chaque section a été vérifiée avant
d'être retirée (`WORKFLOW.md §5`, les quatre contrôles) :

| Ce que l'historique portait | Où c'est |
|---|---|
| les décisions | l'ADR du chantier, indexé dans `DECISIONS.md` |
| les pièges | `TROUBLESHOOTING.md`, une section par chantier |
| le récit du livré | `CHANGELOG.md`, une entrée de version par chantier |
| l'état git, le détail | Git — `git log -p MEMORY.md` (56 révisions au moment de l'élagage) |
| **ce qui restait OUVERT** | **remonté dans « DETTES OUVERTES » ci-dessus** — c'est le 4ᵉ contrôle |

> ⚠️ **Le 4ᵉ contrôle n'est pas décoratif** : l'élagage a exhumé **cinq dettes vivantes** qui
> dormaient dans l'historique, dont la galaxie jamais vérifiée sur trois appareils et un
> `ZETIS_DATABASE_URL` que `.env.example` et `DEPLOYMENT.md` annonçaient **sans son préfixe** —
> donc ignoré par le backend. Un élagage aveugle les aurait effacées.
