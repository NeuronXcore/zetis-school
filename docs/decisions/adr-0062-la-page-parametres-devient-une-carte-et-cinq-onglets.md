---
id: "0062"
titre: "La page Paramètres devient une carte, et cinq onglets"
type: surface
statut: propose
date: 2026-08-19
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0008", "0009", "0012", "0025", "0032", "0034", "0035", "0041", "0046", "0060"]
---
# ADR-0062 — La page Paramètres devient une carte, et cinq onglets

## Statut

**Proposé — 2026-08-19.** N'amende aucune décision d'autonomie : l'`adr-0032` et l'`adr-0035`
restent intégralement en vigueur, et ce chantier les **déplace** sans toucher à une ligne de leur
logique. Il amende en revanche **une phrase** de la page — voir §7.

Cadré en **cas 3 de l'`adr-0060`** : il y a une migration de gabarit (une page devient six vues),
de nouvelles surfaces backend, et l'annulation coûterait bien plus d'un commit.

## Contexte

### Ce que la page est aujourd'hui

`apps/frontend-papa/src/pages/ParametresPage.tsx` fait **45 lignes** : un renvoi vers l'Agenda, et
`<AutonomyPanel />`. C'est peu, et ce peu est sain — la page a été **vidée** le 2026-08-02 de quatre
commandes qui ne faisaient rien, au motif que *« le premier toggle sans effet détruit la crédibilité
de tous les suivants »*. Cet ADR ne rouvre pas cette porte : il pose au contraire la règle qui
l'empêche de se rouvrir à l'échelle d'un écran (§3).

### Ce que la maquette a établi, et qui n'est pas une opinion

La maquette `maquette-papa-parametres-v2.html` recense **tous** les candidats au réglage. Mesuré sur
son propre inventaire :

| Mesure | Valeur |
|---|---|
| Réglages recensés | **67** |
| dont « ici » (vivent dans Paramètres) | 25 |
| dont « ailleurs » (vivent là où la décision se prend) | 7 |
| dont « nulle part » | 5 |
| dont **« à décider »** | **30** |

Le chiffre qui compte est le dernier. **Trente réglages sans lieu, c'est un écran qui ne sait pas
ce qu'il couvre** — et l'inventaire est le seul instrument qui permette de dire « rien d'oublié »
sans mentir, parce qu'il montre aussi ce qu'il **ne** couvre pas.

### Quatre familles, et la maquette n'en portait que deux

Les 67 lignes ne se répartissent pas en « réglages » et « autres ». Elles tombent dans quatre
familles qui n'ont ni le même public, ni le même risque, ni la même réversibilité :

1. celles qui règlent une **autorité** — ce que ZETIS a le droit de faire (`adr-0032`) ;
2. celles qui règlent la **machine** — invisibles pour Massimo ;
3. 🎒 celles qui **atteignent Massimo** — sa voix, son rythme, son accessibilité ;
4. celles qui règlent **Papa** — ce qu'il voit, ce dont il est prévenu, comment il se protège.

La famille ③ n'existait pas dans la v1 de la page. C'est elle qui rend fausse la phrase que la page
portait, et le §7 la traite.

### Le read-before-code — huit affirmations de la maquette corrigées

Fait **avant** la rédaction de cet ADR, et il change le périmètre. Chaque ligne est mesurée.

| Ce que la maquette affirme | Mesuré dans le dépôt |
|---|---|
| Les prompts vivent dans `packages/prompts` | 🔴 **Faux.** `packages/prompts/` contient **un seul fichier : `README.md`**. Les prompts sont **12 modules** dans `apps/backend/app/prompts/`, tous porteurs d'une constante de version (`CAPSULE_PROMPT_VERSION="v5"`, `COUNCIL_PROMPT_VERSION="v4"`, `FICHE_PROMPT_VERSION="v2"`, `CHAT_PROMPT_VERSION="chat_v3"`…). Le bloc « Prompts actifs » est donc **constructible** — pas à l'endroit annoncé. |
| Suspendre ZETIS : « ADR rédigé (S0) » | 🔴 **Aucun ADR ne le porte.** Vérifié : les quatre ADR qui contiennent le mot parlent d'une carte SRS (`0013`), d'une fiche (`0015`), d'une propagation (`0048`) ou citent un défaut corrigé (`0024`). ✅ **Mais le mécanisme, lui, EXISTE** : `production/runner.py::massimo_is_active` suspend déjà la production pendant que Massimo travaille. Un « Suspendre » manuel n'est donc pas à inventer — c'est un drapeau `app_settings` à lire **au même endroit**. Ça reste un chantier, mais un chantier court. |
| Échecs et acquittement : « déjà livré par l'`adr-0041` ? » | ✅ **Oui, côté serveur.** `AIJob.error_message`, `AIJob.acknowledged_at`, `JobOut.error` et `POST /api/production/activity/{kind}/{id}/ack` existent tous. On **réutilise**. |
| « 7 derniers jours · durée médiane » | ✅ Déjà calculé : `ai/travaux.py::estimations()` rend la **médiane des exécutions réussies** par `job_type`, fenêtre bornée, filtre `created_by="file"` compris. |
| Workers « vivants ET à jour » | ✅ `core/queue.py::production_worker_alive()` et `render_worker_alive()` existent, et documentent déjà le piège **`Worker.count()` ment / `Worker.all()` dit vrai**. `Worker.all()` expose `birth_date` : l'âge est lisible. |
| « Ce qui est sorti de la maison » | 🔴 **`ai_jobs` n'enregistre PAS le provider.** Le journal de confidentialité sera **dérivé** (`job_type LIKE 'curriculum_%'` + `curriculum_llm_provider` + présence de la clé), jamais lu. Assumé — **pas de migration pour ça** (§Périmètre). |
| SSD montés, UUID de volume, occupation disque | 🔴 **Illisibles depuis le conteneur** : `diskutil` n'existe pas dans l'image, et l'UUID d'un volume hôte n'est pas accessible d'un `python:3.11-slim`. Ces lignes appartiennent au chantier Données, pas à celui-ci. |
| Sessions ouvertes et révocation | 🔴 **Aucune table de session n'existe.** Ni refresh token révocable, ni `user_sessions` : vérifié sur `db/models/`. Ce n'est pas un écran à dessiner, c'est une migration d'authentification. |

> ⚠️ **La maquette est un objet de conception, pas une source de vérité sur le code.** Ses valeurs
> le disent elles-mêmes (*« relevé Mac Studio non fait »*). Ce tableau est ce qui empêche ses
> affirmations d'entrer dans le code par la porte du plan.

### La mesure qui rend un bloc gratuit

`app_settings` porte **exactement huit clés**, écrites par **deux** modules et deux seulement
(`modules/settings/service.py` : les six paliers + `zetis_auto_trigger_enabled` ;
`modules/agenda/service.py` : `agenda_student_entry_enabled`). Le modèle pose déjà la doctrine :
*« Tant qu'aucune ligne n'existe, c'est la valeur par défaut qui répond »*.

Donc **« modifié » = « une ligne existe »**. Rien à calculer, rien à comparer, aucun défaut à
recopier côté serveur. C'est ce qui rend le §4 possible pour le prix d'un `SELECT key`.

## Décision

### §1 — La page devient **une carte et cinq onglets**, pas sept onglets pairs

```
🗺 La carte │ ⚡ Autonomie │ 🧠 La machine │ 🎒 Massimo │ 👤 Papa │ 💾 Données
─────────────
```

**La carte est la vue par défaut**, et elle est la **navigation** : chaque ligne « ici · <onglet> »
est un lien qui y mène, chaque ligne « ailleurs » mène à sa vraie page (Agenda, Programme, Années
scolaires, Journal).

> **Pourquoi pas un septième onglet pair.** La maquette en faisait un onglet parmi d'autres. Un
> onglet qu'on n'ouvre jamais ne répond à personne — et celui-là est précisément l'outil *« qui
> empêche d'oublier un réglage »*. Mis en vue d'atterrissage, il cesse d'être une annexe : il
> devient la façon dont on traverse la page. La liste ne change pas ; sa **place** change tout.

### §2 — *Moteurs* et *Santé* n'en font qu'un : **🧠 La machine**

La maquette les séparait. Ce sont deux panneaux de **lecture pure** qui répondent à **une seule
question de Papa** : *« est-ce que ça marche ? »*

> Quand une génération échoue, il faut **Ollama est-il joignable ?** (Santé) **et quel modèle ?**
> (Moteurs) dans la même seconde. Deux onglets obligent à tenir un écran en mémoire pendant qu'on
> regarde l'autre. **Un diagnostic doit tenir sur un écran** — c'est la seule raison de la fusion,
> et elle suffit.

### §3 — Un onglet vide est un interrupteur sans effet, à l'échelle d'un écran

**Seuls les onglets qui ont du contenu sont rendus.** Les autres n'existent pas comme onglets : ils
existent comme **lignes de la carte**, avec leur statut et leur motif.

> C'est la doctrine du 2026-08-02 (*« tout ce qui est affiché ici est branché, ou visiblement
> verrouillé AVEC son motif »*) portée d'un cran au-dessus. Un onglet « à venir » est exactement le
> même piège qu'un toggle mort, en plus grand : il promet une surface qui n'existe pas.

### §4 — « N réglages s'écartent du défaut » est une ligne permanente, pas une case à cocher

Affichée en tête de page, cliquable (elle filtre la carte). Servie par
`GET /api/settings/ecarts` → les clés `app_settings` **qui ont une ligne**.

> C'est **la** question qu'on se pose six mois plus tard devant un comportement inexpliqué :
> *« qu'est-ce que j'ai bricolé, déjà ? »*. La maquette en faisait une case en bas d'un onglet ;
> elle mérite le haut de page, et elle ne coûte rien (voir la mesure ci-dessus).

### §5 — L'onglet vit dans l'URL, et rien ne se rafraîchit tout seul

`?onglet=machine` ; absent ⇒ la carte. Rechargement, lien et retour arrière gardent l'onglet
(convention déjà en place : `CouverturePage.tsx`, `ProgrammePage.tsx`).

**Aucun sondage.** *La machine* se rafraîchit sur **bouton explicite**.

> Une page de réglages qui se rafraîchit toute seule ferait bouger un champ sous les doigts. Deux
> onglets ouverts divergent jusqu'au rechargement, **et c'est accepté** — l'addendum de l'`adr-0032`
> §7.4 l'a déjà tranché pour l'autonomie ; la règle vaut pour les six vues.

### §6 — Les règles transverses, écrites une fois pour toutes les vues

| Règle | Ce qu'elle interdit |
|---|---|
| **Un onglet = une transaction** | Un « Enregistrer » global écrirait quatre domaines d'un coup — *« vous changez la voix, le code parental et le régime d'autonomie »* n'est pas une phrase qu'on lit. |
| **Jamais d'auto-save** | Aucun réglage ne change au survol ni au clic. Doctrine déjà tenue par `AutonomyPanel`. |
| **Le brouillon survit à la navigation** | Changer d'onglet ne perd rien et **ne bloque pas** : une pastille marque l'onglet qui a un brouillon. Une modale « voulez-vous vraiment quitter » punirait un geste innocent. |
| **Seul « Annuler » revient au serveur** | Renoncer à une confirmation **garde** le brouillon : Papa n'a pas retiré son intention, il a refusé de la graver. |
| **Chargement : squelette par onglet** | 🔴 Jamais une valeur affichée « au hasard » avant la réponse. |
| **Erreur de lecture ⇒ AUCUN réglage** | 🔴 Pas de repli sur les défauts. Un réglage faux affiché une seconde est un mensonge — et sur cette page, un mensonge sur ce que ZETIS a le droit de faire. |
| **Erreur d'écriture** | Retour à la valeur serveur, message du serveur **relayé tel quel**. |
| **Le verrou vient du serveur** | Jamais d'une liste en dur au front. L'UI rend lisible un refus qui existe déjà, avec son motif. |
| **`require_parent` sur tout** | Déjà porté au niveau du routeur `/api/settings`. Aucune route de cette page n'est atteignable côté enfant. |

### §7 — 🎒 La famille qui atteint Massimo : **assumée et marquée**

La page portait *« Rien de cette page n'atteint Massimo »*. C'était vrai tant qu'elle ne réglait
qu'une autorité. Ça cessera de l'être le jour de l'onglet Massimo — et une remise à zéro de la
progression le ferait aussi.

**Décision : assumer, et marquer.** Tout réglage qui change l'écran, la voix ou le rythme de Massimo
porte le marqueur **🎒**, et la phrase est amendée **dans le même commit** que le premier de ces
réglages.

> ⚠️ **Ce qui n'est PAS une option : les glisser parmi les autres sans le dire.** Le précédent est
> connu et daté : la phrase *« tant que ce n'est pas le cas, ZETIS ne produit rien sans votre
> validation »* était déjà fausse au regard de l'observation du 2026-08-02 (31 objets sur 33
> atteignaient Massimo sans relecture) — elle est partie avec le placeholder, pas avant.
>
> **Rien de la première tranche n'atteint Massimo.** La phrase reste vraie jusque-là, et cet ADR dit
> déjà à quelle condition elle cessera de l'être.

### §8 — ZETIS LEVELS est **déplacé, jamais réécrit**

Les trois régimes **Manual · Hybrid · Autonom** (clés serveur `manuel | semi | autonome`) restent le
cœur de la page et passent derrière l'onglet ⚡ Autonomie **sans qu'une ligne de leur logique
change**.

Restent vrais, et chacun est un test-verrou :

- les **trois régimes** sont sélectionnables ; les **clés** viennent du serveur, seuls les
  **libellés** sont ceux des avatars (décision du 2026-08-04, `NIVEAU_LABEL`) ;
- le régime est **dérivé, jamais stocké** — `niveau_de()` le recalcule des six valeurs, et « sur
  mesure » reste un état rendu ;
- le front **ne détient aucune liste de paliers** : `choices` et `reason` viennent du serveur ;
- **monotonie** : passer le cours à *ZETIS sert* force les dérivés à *ZETIS sert* ;
- le **déclencheur automatique** voyage dans son propre champ — un préréglage ne l'arme jamais
  (`adr-0035` §5) ;
- **toute écriture se confirme**, descente comprise ; la garde compare au **serveur** ;
- la **sidebar lit, elle ne règle pas**, et elle suit le serveur.

## Alternatives considérées

| Alternative | Pourquoi écartée |
|---|---|
| **Garder un flux unique, sans onglets** | Mélanger une autorité et une machine ferait perdre à ZETIS LEVELS ce qui le rend lisible : c'est le seul écran où Papa lit son propre régime. Noyé dans une page de sondes et de tailles de disque, il devient une section parmi vingt. |
| **Les sept onglets de la maquette, à égalité** | Deux d'entre eux répondent à la même question (§2), et le septième est une table des matières promue au rang de contenu (§1). Sept surfaces, c'est aussi sept comportements à découvrir un par un. |
| **Rendre les six onglets tout de suite, trois vides** | C'est le toggle mort du 2026-08-02, à l'échelle d'un écran (§3). |
| **Un « Enregistrer » global** | Voir §6 : une confirmation qui couvre quatre domaines n'est pas lisible, donc n'est pas une confirmation. |
| **Rafraîchir *La machine* en continu** | Un champ qui bouge sous les doigts. Et le sondage fabriquerait la question *« pourquoi ce chiffre a bougé ? »* là où un bouton la rend volontaire. |
| **Ajouter une colonne `provider` à `ai_jobs`** | Une migration pour un tableau de quatre lignes, alors que la dérivation par `job_type` donne la même réponse. Le critère de bornage (§Périmètre) l'interdit, et la dérivation est **honnête** : elle est écrite ici. |

## Périmètre

**Première tranche** : la coquille, 🗺 la carte, ⚡ Autonomie, 🧠 La machine.

🔴 **Trois critères qui bornent, et ils mordent dès le premier jour :**

1. **Aucune migration Alembic.** Tout ce que *La machine* affiche existe déjà en base ou en
   configuration. Le jour où ce chantier veut une colonne, il est sorti de son périmètre.
2. **`git diff` sur les huit fichiers de ZETIS LEVELS ne montre que des imports et des chemins.**
   Toute autre ligne est à justifier ou à annuler.
3. **Aucun champ éditable dans 🧠 La machine.** Ni `<select>`, ni `<input>` : seuls « Tester le
   moteur » et « Acquitter » sont actionnables. Le routage vit dans des variables d'environnement
   lues au démarrage — un menu déroulant serait mort, ou serait un autre chantier.

Routes ajoutées, toutes sur le routeur `/api/settings` existant (donc `require_parent` d'office) :

- `GET /api/settings/ecarts` — les clés `app_settings` qui ont une ligne ;
- `GET /api/settings/machine` — un **instantané cohérent**, délai maximal par sonde ;
- `POST /api/settings/machine/test` — un vrai prompt, une vraie latence, un vrai JSON valide ; ne
  persiste rien.

## Hors périmètre — nommé

- Les onglets **🎒 Massimo**, **👤 Papa**, **💾 Données** : chantiers séparés, déclarés dans la carte.
- Toute action **destructive** : purges, remises à zéro portées, zone rouge.
- **Sauvegarde et restauration**, et la restauration à blanc qui donne au mot « sauvegarde » son sens.
- **Code parental** et **verrou après inactivité** — le manque le plus sérieux de la page, et il
  reste entier après cette tranche. Écrit ici pour qu'il ne se perde pas.
- **Alertes** et canal e-mail.
- **SSD, UUID de volume, occupation disque** : illisibles du conteneur (read-before-code).
- **Commit git installé** : demanderait un `ARG ZETIS_COMMIT` baké dans `backend.Dockerfile`. La
  tête Alembic, elle, est livrée.
- **« Suspendre ZETIS »** : différé, et le read-before-code a rendu son coût plus petit que prévu —
  `production/runner.py::massimo_is_active` est **déjà** le point où la production s'arrête ; un
  geste manuel s'y branche au lieu de s'inventer. **Signal de réouverture** — la première fois qu'il
  faut arrêter la file et que le seul geste disponible est de tuer un conteneur.

## Ce qui ne sera JAMAIS bâti — et le motif, pour ne plus le redébattre

| Bloc | Motif |
|---|---|
| **Journal technique** (200 dernières lignes) | Un terminal répond mieux, et `SECURITY.md` interdit d'y voir passer un secret, un token, ou le verbatim d'une conversation de Massimo — une sortie brute est exactement la façon dont un secret finit dans une capture d'écran. Le bloc **Échecs**, borné et acquittable, porte la valeur. *La maquette le condamnait elle-même.* |
| **Sélecteur de modèle de génération** | Le banc de l'`adr-0008` a été mesuré **sur le MacBook Pro**, pas sur la machine actuelle. Des chiffres périmés sous des radios mortes, c'est le piège de l'interrupteur sans effet soldé le 2026-08-02 — en pire, parce qu'il s'appuie sur une mesure pour être crédible. |
| **Réinitialisation totale à l'écran** | `scripts/reset.py` documenté est la bonne place : **ce qui n'existe pas ne se clique pas par erreur**. Les remises à zéro **portées** (contenus, progression, programme, RAG) restent, elles : c'est d'elles qu'on a besoin chaque semaine. |
| **Sessions ouvertes et révocation** | Une migration de refresh tokens révocables pour un foyer de deux personnes. Le **verrou après inactivité** — *« la vraie parade : un onglet oublié se referme seul »* — couvre le risque réel pour une fraction du coût. |
| **Sélecteur d'élève** | ZETIS est l'app de Massimo (2026-08-19). Ni sélecteur, ni pluriel, ni écran qui demande de qui on parle. On ne fait rien qui l'interdise à jamais ; on n'écrit plus une ligne pour lui. |
| **Ton, tutoiement, longueur des fiches** | Ce sont des **prompts versionnés**. Un curseur fabriquerait une génération non tracée et rendrait le corpus incomparable dans le temps. Un ton qui change, c'est une **nouvelle version de prompt**. |
| **Seuils de lacune et de « maîtrisé »** | C'est l'**instrument de mesure**. Qui peut bouger le seuil peut fabriquer une progression. |
| **Alerte « Massimo n'a rien fait depuis N jours »** | `CLAUDE.md` interdit le **décompte de jours manqués**. Une alerte le réintroduit par un détour : elle crée un événement, et un événement appelle une réaction. ✅ **Le fait reste consultable** — un fait se lit quand on se pose la question, une alerte impose la question. |
| **Clé API dans l'UI** | Jamais. Sa **présence** s'affiche, en booléen ; sa valeur, ni entière ni tronquée. |

## Conséquences

**Ce que ça donne.** La page cesse d'être un panneau et devient un **plan** : ce qui se règle, où, et
ce qui ne se règle nulle part. 🧠 *La machine* solde en une vue la liste « Monitoring MVP » de
`DEPLOYMENT.md`, écrite et jamais implémentée — taille de la file, erreurs de jobs, sondes, coût IA.

**Ce que ça coûte.**

- `ParametresPage.test.tsx` fait passer une vingtaine de tests par un helper qui attend *ZETIS
  LEVELS* au montage. Le helper devra **sélectionner l'onglet** d'abord. 🔴 **C'est le seul
  changement autorisé dans ce fichier** : aucune assertion affaiblie, aucun `waitFor` allongé,
  aucun test supprimé. Un test modifié pour passer est une régression masquée.
- La carte est une **donnée du front**, pas un état serveur — donc elle peut mentir. C'est pourquoi
  un test-verrou exige que toute ligne « ici · <onglet> » nomme un onglet **réellement rendu**.
- Le journal des sorties réseau est **dérivé**, pas enregistré. Il dira vrai tant que la dérogation
  de l'`adr-0009` reste la seule sortie. Le jour où une deuxième tâche part au cloud, **ce bloc ment
  en silence** — c'est le premier signal du § suivant.

## Le signal qui dirait qu'on s'est trompé

- 🔴 **Une deuxième tâche part au cloud sans passer par `curriculum_*`.** Le journal de
  confidentialité devient faux sans qu'aucun test ne rougisse. Ce jour-là, la colonne `provider` sur
  `ai_jobs` cesse d'être une migration inutile.
- **La carte se met à diverger du code** — une ligne « ici » qui ne mène nulle part. Si le
  test-verrou ne l'attrape pas, c'est que la carte a besoin d'être **dérivée**, pas écrite.
- **Papa n'ouvre jamais la carte** et va directement à un onglet. Alors le §1 s'est trompé : la
  liste n'était pas une navigation, c'était bien une annexe.
- **Un onglet finit par porter deux « Enregistrer »**, ou un bouton global réapparaît. Alors le §6
  a demandé quelque chose que la page ne pouvait pas tenir.
- **Le bouton « Rafraîchir » de *La machine* est cliqué en rafale.** Alors l'absence de sondage
  coûte plus qu'elle ne protège, et le §5 doit être rouvert — pour cet onglet seulement.

## Suivi

1. **Tranche 1** — la coquille, la carte, ⚡ Autonomie, 🧠 La machine. Branche
   `feat/parametres-carte-et-onglets`.
2. **Tranche 2** — 🎒 Massimo : accessibilité et voix. C'est elle qui déclenche l'amendement du §7,
   **dans son commit**. Elle demande d'abord un chantier à part : que le prénom de l'élève vienne
   **de la donnée partout**. Test-verrou : renommer l'élève en base, et plus aucun écran ne doit
   dire « Massimo ».
3. **Tranche 3** — 👤 Papa : code parental et verrou après inactivité. **Sans** les sessions.
4. **Tranche 4** — 💾 Données. La plus lourde, et la seule destructive : elle sera cadrée par son
   propre ADR, parce qu'une restauration remplace l'état actuel et relève de la classe A4.
