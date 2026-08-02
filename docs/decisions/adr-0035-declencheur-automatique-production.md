# ADR-0035 — Le déclencheur automatique : ZETIS travaille sans qu'on lui demande, et ce que ça oblige

## Statut

Proposé — 2026-08-02. **Quatrième document du chantier d'autonomisation**, après l'addendum
ADR-0011 §G (l'autorité et le veto), l'ADR-0031 (l'exécution en lot) et l'ADR-0032 (les paliers).

> **Ce document est écrit AVANT l'ADR-0034 (le Journal), et livré APRÈS lui.** L'ordre est
> délibéré et c'est une décision du commanditaire : dessiner le Journal en sachant qu'il devra
> rendre lisibles des lots que **personne n'a demandés** évite de le construire deux fois. Un
> journal pensé pour « ce que Papa a lancé » puis reconverti en « ce que ZETIS a fait tout seul »
> serait un journal qui ment par omission le jour où il compte.

> **Ce document RÉVOQUE une décision écrite dans le code**, et il faut le dire en tête :
> [`app/production_worker.py`](../../apps/backend/app/production_worker.py) porte
> `with_scheduler=False` avec son motif — *« le déclenchement reste ÉVÉNEMENTIEL. Aucun cron,
> aucune tâche périodique — un scheduler ici ouvrirait la porte à "tous les dimanches, produire
> quelque chose", qui n'a pas de sens pédagogique »*.
>
> **L'objection est maintenue, et elle est satisfaite, pas contournée** — voir §1. Le scheduler
> introduit ici ne produit rien sur un calendrier : il se réveille pour **regarder** si le monde
> réel a demandé quelque chose. « Tous les dimanches, produire » reste interdit ; « tous les
> soirs, vérifier s'il y a un contrôle jeudi » est l'inverse exact.

> S'appuie sur : `adr-0031 §4` (`production_runs`, `trigger`, références typées), `adr-0031 §5`
> (le régulateur v1 et sa limite annoncée), `adr-0032 §5` (la condition d'ouverture de ce
> document), `adr-0011 §G` (l'autorité, `parent_rule`), `adr-0025` (l'agenda, première source
> exogène), `adr-0034` (le Journal — **préalable de livraison**).

## Contexte

### « Full autonomie » recouvre deux choses, et l'ADR-0032 n'en a livré qu'une

Le **palier** dit : *« ZETIS ne me demande plus de valider. »* Il est réglable depuis l'ADR-0032.

Le **déclencheur** dirait : *« ZETIS travaille sans que je clique. »* **Il n'existe pas.** Tout lot
de production part aujourd'hui d'un clic de Papa sur la Couverture. Conséquence mesurable : même
avec `VETO_SURFACE_AVAILABLE = True` et A1 au palier 3, **ZETIS ne produirait rien de lui-même**.

C'est ce second axe qui fera enfin émettre `parent_rule` — la provenance déclarée **légale et non
émise** par le §G.1, et que l'ADR-0032 §2 a explicitement refusé d'émettre au motif, exact, qu'un
lot lancé depuis la Couverture **est** un clic.

### Sept constats de read-before-code (2026-08-02, code réel)

1. **La table est prête. Aucune migration n'est nécessaire pour le déclencheur.**
   [`db/models/production.py`](../../apps/backend/app/db/models/production.py) porte déjà
   `TRIGGERS = ("manual", "request", "agenda", "evidence", "derived", "council")`,
   `AUTHORIZED_BY = ("parent_direct", "parent_rule")`, les quatre FK typées et
   `TRIGGER_REFERENCE`, qui dit quelle référence chaque trigger doit renseigner. Ce qui manque
   n'est pas le modèle, c'est **l'émission** : `EMITTED_TRIGGERS = ("manual",)` et son test-verrou.

2. **`authority_for` est déjà écrite pour ce chantier.**
   [`production/runner.py`](../../apps/backend/app/modules/production/runner.py) :
   `return PARENT_RULE if run.authorized_by == "parent_rule" else PARENT_BULK`. Le jour où un run
   naît en `parent_rule`, la provenance s'émet **sans qu'une ligne du runner change**. Vérifié dans
   le code, pas supposé.

3. **Le scheduler est déjà câblé, et désarmé avec son motif** (`with_scheduler=False`). Le
   mécanisme est donc **un booléen**, pas une dépendance : `rq>=1.16` embarque son ordonnanceur.
   ⚠️ **Il n'y a aucun autre ordonnanceur dans le projet** — ni `rq-scheduler`, ni APScheduler, ni
   cron. Le coût réel de ce chantier est là, et il est plus petit qu'annoncé.

4. **`create_run` est verrouillée sur `manual` et ne connaît qu'un chapitre.**
   [`production/runs.py`](../../apps/backend/app/modules/production/runs.py) code en dur
   `trigger=EMITTED_TRIGGERS[0]` / `authorized_by=EMITTED_AUTHORIZED_BY[0]` et ne prend qu'un
   `chapter_id`. Sa signature s'ouvre ; **rien d'autre** dans le module n'a besoin de bouger.

5. **Le régulateur actuel ne régule pas le régime qui vient — confirmé en code.**
   `pending_backlog` compte `Fiche` + `Mindmap` en `pending`. Au palier 3, plus rien ne devient
   `pending` : **le compteur reste à zéro dans le seul régime où il serait vital**. C'est
   exactement ce que l'ADR-0031 §5 annonçait et ce que l'ADR-0032 §5 a différé jusqu'ici.

6. **La préemption existe et elle est bornée** — `massimo_is_active` + `_wait_for_massimo`
   interrompent le lot **entre deux notions** si Massimo travaille. ⚠️ Mais **rien ne dit
   aujourd'hui si un lot a le droit de DÉMARRER** pendant qu'il travaille : la question ne se
   posait pas, Papa ne cliquait pas pendant les sessions de son fils.

7. **`agenda_items` a déjà toutes ses données, et l'ADR-0025 les a posées pour ça.**
   `chapter_id` y est commentée *« posée dès maintenant, exploitée au Lot 3 »*, à côté de `due_on`,
   `kind` et `dismissed_at`. ⚠️ **`chapter_id` est nullable et rempli par un geste de Papa** : un
   devoir sans chapitre rattaché ne déclenchera rien, et c'est un fait produit, pas un bug.

### Ce que ces constats changent au cadrage

Le chantier n'est pas « construire un ordonnanceur ». C'est **lever quatre verrous déjà écrits**
(`with_scheduler`, `EMITTED_TRIGGERS`, la signature de `create_run`, la 7ᵉ clé) et **construire la
seule chose qui manque vraiment : le régulateur qui remplace un compteur devenu aveugle.**

## Décision

### 1. Le déclencheur v1 est `agenda`, et lui seul

**Règle d'émission** — un lot `trigger='agenda'` naît quand un `AgendaItem` réunit **tout** ceci :

| Condition | Motif |
|---|---|
| `kind == 'controle'` | Un contrôle justifie d'équiper un chapitre. Un devoir du lendemain, non : il reviendrait tous les jours et noierait le régulateur. |
| `chapter_id IS NOT NULL` | Sans chapitre, il n'y a pas de scope — donc rien à produire (constat 7). |
| `dismissed_at IS NULL` | Un item archivé ne demande plus rien. |
| `due_on` dans les **N jours** (défaut 7) | Produire trois semaines à l'avance, c'est produire pour un programme qui aura changé. |
| **aucun lot ne référence déjà cet item** | §3, idempotence. |

> **`devoir` et `rendu` restent LÉGAUX et NON ÉMIS** — patron `content_kind`, patron `parent_rule`,
> patron `EMITTED_TRIGGERS`. Le vocabulaire est complet au modèle, l'émission est étroite dans le
> code, et l'élargir sera une décision datée, pas une dérive.

**Pourquoi l'agenda et pas une mesure de ZETIS** (`evidence`, écarté en connaissance de cause) :
l'agenda est la **seule source exogène** du produit (ADR-0025). Sa légitimité se lit sans modèle —
*il y a un contrôle jeudi, quelqu'un du monde réel l'a dit*. Un déclencheur `evidence` ferait
décider ZETIS sur **sa propre mesure** : la boucle se refermerait sur elle-même et une mesure
fausse produirait du contenu que personne n'a demandé, sans que rien d'extérieur ne contredise.
`evidence` reste légal et non émis ; son ouverture sera un ADR.

**Et l'objection du `production_worker.py` est satisfaite, pas contournée** : ZETIS ne produit
**jamais** parce que c'est dimanche. Il produit parce qu'un humain a écrit qu'il y avait un
contrôle. Le réveil périodique **regarde** ; il ne décide pas.

### 2. L'ordonnanceur : un booléen et un job qui ne produit rien

- `SimpleWorker(...).work(with_scheduler=True)` — le commentaire de `production_worker.py` est
  **réécrit**, pas supprimé : l'objection reste au dossier avec la réponse qu'elle a reçue.
- Un job `scan_agenda_triggers()` **périodique** (défaut : une fois par jour, hors des heures où
  Massimo travaille — §7), qui **ne produit rien lui-même**. Il lit, il applique les cinq
  conditions du §1, et il **crée des runs** ; l'exécution reste le job `run_production` existant.

> **Séparer le scan de l'exécution est un invariant, pas une commodité.** Un scan qui produirait
> tiendrait un `AccessShareLock` pendant une heure — le défaut exact observé le 2026-08-02 et
> réparé par le `db.rollback()` de `massimo_is_active`. Le scan doit être court, en lecture, et
> refermer sa transaction.

⚠️ **À vérifier à l'implémentation, pas à supposer** : l'ordonnanceur intégré de RQ est réputé
suffisant ici (`rq>=1.16` est déjà installé, aucun paquet à ajouter), mais il n'a **jamais tourné
dans ce projet**. Si son comportement de reprise après redémarrage se révèle inadapté, le repli est
une entrée cron appelant un `python -m app.scan_triggers` — même code, réveil externe. **C'est un
stop-on-blocker légitime, pas une occasion de recoder l'ordonnancement.**

### 3. `create_run` s'ouvre — et l'idempotence est portée par la référence

```txt
create_run(db, *, chapter_id, trigger="manual", authorized_by="parent_direct", reference=None)
```

- `TRIGGER_REFERENCE` (déjà écrit) dit quelle colonne `reference` renseigne. La règle « exactement
  une FK, cohérente avec `trigger` » que l'ADR-0031 §4 a confiée au service **devient réelle ici** :
  elle n'avait aucun cas à valider tant que seul `manual` était émis.
- **Un `agenda_item_id` ne produit qu'un seul lot, jamais deux.** Sans cette règle, chaque réveil
  du scan reproduirait le même chapitre jusqu'à l'échéance.

> ⚠️ **L'idempotence se lit dans `production_runs`, elle ne s'écrit pas sur l'agenda.** Poser un
> `produced_at` sur `agenda_items` ferait écrire le module production dans une table que Massimo
> co-édite (ADR-0025 §2a : *« personne ne réécrit silencieusement l'autre »*). La question « ce lot
> a-t-il déjà eu lieu ? » se pose au journal des lots — c'est sa raison d'être.

**Un lot refusé (régulateur, arriéré, chapitre vide) ne consomme pas la référence** : l'item
redeviendra éligible au réveil suivant. Un refus n'est pas une production.

### 4. Le régulateur : N lots automatiques par fenêtre glissante, et il REFUSE

**`ZETIS_AUTO_MAX_RUNS_PER_WEEK`, défaut 2**, compté sur `production_runs` :

```sql
count(*) where trigger <> 'manual' and created_at >= now() - 7 days
```

- **Aucune migration** : la colonne `created_at` et la colonne `trigger` existent.
- **Les lots manuels ne comptent pas dans le plafond.** Le clic de Papa est son propre régulateur —
  le volume y est borné par le nombre de fois où un humain appuie (ADR-0032 §5). Les mélanger
  ferait qu'une session de rattrapage de Papa désarmerait l'automatisme, ou l'inverse.
- **Il refuse et il le DIT** — même doctrine que `pending_backlog` : *« le régulateur refuse et le
  dit, il ne tronque pas silencieusement »*. Le refus s'écrit au Journal (ADR-0034), sinon il est
  invisible : personne ne regarde les logs d'un dispositif qui tourne la nuit.
- **`pending_backlog` reste en vigueur et s'applique AUSSI aux lots automatiques.** Les deux
  régulateurs ne se remplacent pas : l'un borne le volume produit, l'autre borne l'arriéré de
  relecture. Au palier 2, le second mord ; au palier 3, seul le premier mord. **C'est voulu.**

> **Calibrage assumé et révisable.** 2 lots/semaine vient de la seule mesure réelle disponible
> (69 s par notion, chapitre « Fractions » : 11 notions en 12 min 35 s). Un chapitre dense de 31
> notions coûte ~36 min. Ce chiffre se révise **avec l'observation**, comme `PRODUCTION_MAX_PENDING`
> a été calibré à 30 — pas par raisonnement a priori.

**Rejeté : le plafond au grain de la notion.** Plus juste en apparence, il autorise à couper un lot
en son milieu — donc à produire un chapitre à moitié équipé, l'état que tout le dispositif existe
pour éviter. **Rejeté : le report au lieu du refus.** Il constitue une file d'attente invisible, et
un lot qui part cinq jours après son déclencheur produit pour un contrôle déjà passé.

### 5. La 7ᵉ clé — et pourquoi elle n'est PAS une `AutonomyClass`

**`zetis_auto_trigger_enabled`** — `0` | `1`, **défaut `0`**. Papa doit l'armer explicitement.

**Deux questions, deux sources** — la même doctrine qui a fait séparer le palier d'`authorized_by`
(§G.1, ADR-0032 §2) :

| | Question | Où elle vit |
|---|---|---|
| Palier | ZETIS a-t-il le droit de **servir sans relecture** ? | les six clés d'`AUTONOMY_CLASSES` |
| Déclencheur | ZETIS a-t-il le droit de **démarrer sans clic** ? | cette clé |

Les fusionner rendrait impossible le régime intermédiaire le plus naturel — *« ZETIS sert sans
relecture, mais il attend que je demande »* — et le régime symétrique *« ZETIS démarre seul, mais
je relis tout »*, qui est **le plus sûr des deux** et donc celui par lequel Papa voudra commencer.

⚠️ **Elle ne rejoint PAS `AUTONOMY_CLASSES`, et c'est un constat de code, pas une préférence** :

- ce n'est pas un palier `0..3` mais un booléen — `choices`, `locked` et `LEVEL_LABEL` n'ont pas de
  sens pour elle ;
- `preset_of()` dérive le régime des seules classes réglables ; l'y ajouter ferait qu'un préréglage
  **armerait le déclencheur automatique**, exactement la fusion que ce paragraphe refuse ;
- `write_autonomy` rejette toute clé hors `BY_KEY` — d'où le **préfixe distinct
  `zetis_auto_trigger_*`**, qui ne peut pas être balayé par erreur avec les `zetis_autonomy_a*`.

Elle vit dans la **même table** `app_settings` et dans le **même module** `settings`, avec sa propre
paire lecture/écriture et son propre bloc dans le panneau, sous les six classes.

### 6. `parent_rule` s'émet enfin — et c'est tout ce qui change à la provenance

Un run né du scan porte `authorized_by='parent_rule'` : **aucun humain n'a ouvert la pièce, ni
cliqué pour ce lot** — la définition littérale du §G.1, satisfaite pour la première fois.

`authority_for` (constat 2) fait déjà le reste. **`equip_notion`, `set_lesson_validation`,
`select_notions` et l'orchestrateur ne bougent pas d'une ligne.** Le nuancier de la Couverture rend
déjà la teinte `parent_rule` (ADR-0032, dette §G constat 5 soldée) : elle cessera simplement d'être
une couleur qu'on n'a jamais vue.

> **Le palier reste maître de la validation.** Un lot `parent_rule` sous A0a = 2 produit du
> `pending` que Papa relira — `authority_for` renvoie `None` et **rien n'est tamponné**. Déclencher
> seul et servir sans relecture restent deux permissions distinctes, jusque dans la donnée écrite.

### 7. Quand ZETIS a le droit de démarrer

**Un lot automatique ne démarre pas pendant que Massimo travaille** — `massimo_is_active` est
évalué **à la création du run**, pas seulement entre deux notions.

> Motif : la préemption existante (constat 6) rend la main *en cours de route*, ce qui suffisait
> pour un lot que Papa venait de demander en connaissance de cause. Un lot que **personne n'a
> demandé** ne doit pas disputer Ollama à la session de Massimo, fût-ce une notion. La règle
> réutilise une fonction déjà écrite, déjà testée, déjà corrigée de son défaut de verrou.

Le scan se réveille **une fois par jour**, à une heure creuse configurable. Aucune fenêtre horaire
n'est codée en dur : l'heure du réveil est un paramètre de déploiement, l'inactivité de Massimo est
la vraie garde.

### 8. Ce que ce chantier ne fera jamais

- **Aucune surface côté Massimo.** Il ne doit pas apprendre que du contenu apparaît tout seul —
  même invariant V1 que l'ADR-0032 §6.
- **Aucun déclencheur ne supprime, n'archive ni ne dévalide.** A4 reste à 0 quoi qu'il arrive : un
  déclencheur automatique **crée des lots**, point.
- **Aucune notification poussée à Papa.** Le Journal (ADR-0034) est la surface ; un dispositif qui
  travaille la nuit et réveille son propriétaire au matin est une astreinte, pas une aide.
- **Aucun élargissement silencieux du vocabulaire.** `evidence`, `derived`, `request`, `council`
  restent non émis tant que leur ADR n'existe pas — et le test-verrou d'`EMITTED_TRIGGERS` reste
  en place, mis à jour à **deux** valeurs, jamais désactivé.

## Périmètre

**Dans cet ADR** : le déclencheur `agenda` et ses cinq conditions ; le job de scan périodique et
`with_scheduler=True` ; l'ouverture de `create_run` (trigger + référence typée) et l'idempotence par
référence ; le régulateur de volume par fenêtre glissante ; la 7ᵉ clé `zetis_auto_trigger_enabled`
et son bloc dans le panneau ; la première émission de `parent_rule` ; la garde « pas de démarrage
pendant que Massimo travaille ».

**Hors de cet ADR** : le Journal et la page `/journal` (**ADR-0034 — préalable de livraison, pas
option**) ; `evidence`, `derived`, `council` comme déclencheurs ; `request` et la page Demandes
(chantier séparé, déjà cadré) ; le multi-enfant (`create_run` prend toujours le premier profil) ;
l'indicateur d'autonomie de Massimo (ADR-0033) ; les scopes autres que le chapitre.

## Conséquences

### Positives

- **`parent_rule` cesse d'être une valeur morte** : déclarée au §G.1, câblée par l'ADR-0032, elle
  s'écrit enfin — et le nuancier de la Couverture montre une quatrième teinte réelle.
- **Le coût est très inférieur à l'annonce** : aucune migration, aucune dépendance nouvelle,
  quatre verrous à lever et un régulateur à écrire.
- **Le régulateur devenu aveugle au palier 3 retrouve un compteur qui mord**, et l'ADR-0031 §5
  cesse d'être une dette annoncée.
- **La demande initiale est enfin satisfaite** : après ce document et l'ADR-0034, *« ZETIS travaille
  pour Massimo sans que Papa clique »* est vrai — et borné, coupable, lisible.

### Négatives / coûts assumés

- ⚠️ **Un dispositif qui agit sans témoin devient une source de surprise.** C'est la raison exacte
  pour laquelle le Journal est un **préalable** : livrer ce document sans lui produirait des
  contenus dont personne ne saurait dire d'où ils viennent.
- ⚠️ **Le déclenchement dépend d'un geste de Papa qu'il ne fait pas encore** : rattacher un
  `chapter_id` à un contrôle dans l'agenda (constat 7). Sans ce geste, le déclencheur reste muet et
  paraîtra en panne. La page Agenda devra rendre ce rattachement évident — **et le dire quand il
  manque**, sinon le silence sera lu comme un bug.
- ⚠️ **L'ordonnanceur RQ n'a jamais tourné ici** (§2). Repli nommé, borné, sans recodage.
- **Le calibrage du plafond est un pari** tant que l'observation ne l'a pas corrigé. Assumé : le
  défaut prudent (2) fait rater des productions, jamais l'inverse.
- **Une septième clé alourdit la page Réglages.** Assumé : la seule alternative était de fusionner
  deux questions, ce que tout le chantier d'autonomisation a passé quatre documents à éviter.

## Suivi

1. **Ne rien coder de ce document avant que l'ADR-0034 soit livré et son veto visible à l'écran.**
2. Observer la première semaine armée : combien de lots automatiques, combien de refus du
   régulateur, combien de contrôles sans `chapter_id`.
3. Recalibrer `ZETIS_AUTO_MAX_RUNS_PER_WEEK` **sur cette observation**, et dater la révision.
4. Décider alors, et pas avant, si `evidence` mérite son ADR — la réponse dépendra de ce que
   l'agenda aura, ou n'aura pas, suffi à produire.
