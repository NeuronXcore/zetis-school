# ADR-0049 — Le deck de révision par chapitre

## Statut

**Accepté — 2026-08-10.** Les **sept décisions sont gelées**. Le prérequis de décision est levé :
les sessions de `prompts/claude-code/prompts-claude-code-adr-0049.md` peuvent démarrer, après
`/ouverture`.

> Historique : Proposé — 2026-08-10, **le même jour**. Écrit sur `main`, **sans une ligne de code**,
> selon le rituel `mockup → spec → ADR → prompt` (`docs/WORKFLOW.md`) : maquette
> (`docs/frontend-massimo/mockup/mockup-deck-chapitre-v1.html`, **vue à l'écran**) et spec
> (`docs/frontend-massimo/page-revision.md`, passages `[0049]`) avant cet ADR. Ce qui autorise
> l'acceptation sans délai : le **read-before-code a été rendu avant toute décision**, et les deux
> constats qui falsifiaient le cadrage d'origine (§Constat 1 et 2) ont été portés au commanditaire
> **avant** que la moindre décision soit écrite.

⚠️ **La Décision 1 (la porte d'entrée) a été prise par le commanditaire**, le 2026-08-10, après que
les trois options lui ont été exposées chiffrées et dessinées à la même échelle — **porte (a),
depuis l'échéance d'agenda**, conforme à la recommandation. Elle ne se rediscute pas ici : on la
**relit**.

> Ce chantier est le **couplage 2 du §11 de l'ADR-0025**, resté à 0 % depuis. Il est désigné comme
> le prochain par l'`adr-0025-addendum-lecon-a-apprendre.md` §14.6, décision validée n° 2 du
> 2026-08-10 : *« rendre visible le Commander avant de construire le plan de préparation »*, au
> motif que le plan de préparation *« dépend d'un couplage livré à 0 % »*. L'ordonnancement était
> écrit ; il manquait le cadrage.

## Contexte

La question qui a ouvert le chantier agenda était *« comment demander à Massimo de réviser ? »*.
L'`adr-0025-addendum-lecon-a-apprendre.md` §14.6 y a répondu honnêtement : **on ne peut pas encore**,
et il a interdit d'en donner l'illusion — *« aucune affordance de l'agenda ne doit suggérer une
session de révision »*, parce qu'*« un bouton mort se lit comme une panne, et une promesse non tenue
coûte plus cher que l'absence »*.

C'est cette interdiction que le présent ADR lève, en construisant ce qu'elle protégeait.

Le §11 de l'`adr-0025-agenda-scolaire.md` a déjà tranché **l'invariant**, et il ne se rouvre pas :

> **Ne jamais avancer les cartes SRS.** Le SRS mesure l'oubli : lire une carte trop tôt fausse son
> prochain intervalle, et un contrôle en juillet dégraderait la programmation jusqu'en octobre. La
> forme correcte est une **session supplémentaire** ciblée sur le chapitre, **qui n'écrit aucun état
> SRS** — ni reprogrammation, ni mise à jour d'intervalle.

Il a aussi nommé deux manques : un **deck `{chapter}`** (la route n'accepte que
`mix_day | mix_flash | {subject}`), et l'**extension du non-scheduling** hors du même-jour. Puis il
s'est arrêté sur « Slice dédiée. » — c'est-à-dire ici.

## Constat read-before-code

Vérifié dans le code le 2026-08-10, **avant** d'écrire une décision. Le constat du §11 est exact sur
tout ce qu'il affirme. Il est **incomplet sur deux points qui décident du chantier**.

### 1. 🔴 `Skill` n'a AUCUN `chapter_id` — un deck chapitre ne voit que les leçons VALIDÉES

`Skill` ([`school.py:109`](../../apps/backend/app/db/models/school.py)) porte `subject_id` et
`parent_skill_id`. **Rien d'autre.** Le chemin chapitre → notion n'est pas une colonne, c'est une
traversée : `Chapter → Lesson(status='validated') → LessonSkill → Skill`.

Elle **existe déjà**, et il ne faut pas la réécrire :
[`_ordered_chapter_skill_ids`](../../apps/backend/app/modules/missions/command.py) (module
`missions`), qui sert la porte « chapitre » du Commander depuis l'ADR-0018.

**Conséquence, non écrite au §11** : un chapitre dont **aucune leçon n'est validée** résout **zéro
notion**, donc **zéro carte** — un deck vide. Et un chapitre aux leçons validées mais **sans cartes
générées** donne le même vide. Or c'est exactement le « bouton mort » que §14.6 interdit.

> Même famille de piège que l'INNER JOIN sur `school_year_subjects` qui ratait le chapitre orphelin
> (ADR-0042) : la hiérarchie du référentiel est **plus trouée qu'elle n'en a l'air**, et chaque
> jointure y perd des lignes en silence.

### 2. 🔴 `record_attempt` ne sait RIEN de la session — le non-scheduling ne peut pas être déduit

[`record_attempt(db, student, card_id, rating)`](../../apps/backend/app/modules/memory/service.py)
ne reçoit que la carte et la note. La route est `POST /api/student/reviews/cards/{card_id}/attempt`,
corps `{rating}`. **Le serveur n'a aucun moyen de savoir qu'un attempt vient d'une session
chapitre** : la même carte peut être servie par le mélange du jour, par le deck matière ou par le
deck chapitre, et l'attempt est identique dans les trois cas.

Or la doctrine actuelle est écrite **deux fois**, et dans les deux sources de vérité :

- le code — *« Consolidation détectée CÔTÉ SERVEUR (pas de flag client) »* ;
- la spec — *« Détection du re-tour côté serveur (pas de flag client) »*
  ([`page-revision.md`](../frontend-massimo/page-revision.md)).

**Étendre le non-scheduling hors du même-jour oblige donc à toucher cette doctrine.** C'est la
décision la plus tranchante du chantier ; le §11 dit qu'il faut étendre, jamais comment.

### 3. ✅ Le reste du constat du §11 est exact, ligne à ligne

- [`build_session`](../../apps/backend/app/modules/memory/service.py) n'accepte que
  `mix_day | mix_flash | subject`, sinon `400 « Deck inconnu. »`.
- `_due_conditions` impose `due_at IS NOT NULL`, `due_at <= now` et
  `status NOT IN {pending, suspended, archived}`.
- `deck == "subject"` sans ligne → `400 « Aucune carte à réviser pour cette matière. »`, volontairement
  **indiscernable** d'une matière inconnue (pas de fuite d'existence).
- `is_consolidation` est bien **détecté serveur** et borné à *même carte, même jour civil* : un
  `count(SpacedReviewAttempt)` depuis `day_start`.
- Plafonds : `MIX = 12` · `SUBJECT = 8` · `FLASH = 5`. XP : `5` plein, `2` en consolidation.

### 4. ✅ Le chapitre est DÉJÀ dans la poche de Massimo — la porte (a) coûte presque rien

`AgendaItemStudentOut` ([`agenda/schemas.py`](../../apps/backend/app/modules/agenda/schemas.py))
sert déjà `chapter_id` **et** `lesson_id` à l'interface de Massimo, depuis les addenda §11 et §15.
Une porte posée sur l'échéance n'a **aucune donnée à aller chercher**.

À l'inverse, une porte posée sur le deck matière n'a **rien** : `ReviewsSummary` ne connaît que des
matières (`slug`, `name`, `due_count`, `session_size`, `has_cards`). Il faudrait un endpoint neuf
« chapitres servables d'une matière ». **L'asymétrie de coût entre les deux portes est réelle**, et
elle n'était pas connue au moment de poser la question.

### 5. ✅ La Décision 6 est presque déjà prise, et par le bon raisonnement

[`dashboard/service.py:_review_attempts`](../../apps/backend/app/modules/dashboard/service.py)
**exclut déjà** les attempts `is_consolidation=True`, et sa docstring dit pourquoi : c'est *« la
seule donnée du dépôt qui mesure la mémoire elle-même »*. Une session chapitre ne mesure aucun
oubli — la carte n'était pas due. Elle doit donc en être exclue, et l'exclusion **existe déjà**.

⚠️ Mais la **raison** écrite dans la docstring (*« le compter doublerait une révision qui n'a eu lieu
qu'une fois »*) ne couvre pas le cas chapitre : ce n'est pas un doublon, c'est une révision distincte
qui ne doit simplement pas replanifier. La ligne serait **juste par accident**. À réécrire.

### 6. ⚠️ Le motif pédagogique de la spec est BON et doit être répondu, pas effacé

[`page-revision.md`](../frontend-massimo/page-revision.md) §« Hors périmètre V1 » range le filtre par
chapitre en V2 avec une raison : *« le filtre étroit ramène au blocked practice »*. C'est vrai, et
c'est le mécanisme que le deck mélange existe pour éviter (`interleave` n'est pas cosmétique — un
`ORDER BY random()` ne le garantit pas).

Cet ADR ne peut pas se contenter de supprimer la phrase. Il doit dire **pourquoi elle ne s'applique
pas ici** — voir Décision 1 et le §« Le signal qui dirait qu'on s'est trompé ».

## Alternatives considérées

### La porte d'entrée — les trois options, chiffrées · **(a) RETENUE, (b) et (c) écartées**

| | **(a) Depuis l'échéance d'agenda** | **(b) Drill-in depuis le deck matière** | **(c) Les deux** |
|---|---|---|---|
| **Ce que Massimo voit** | Sur une échéance datée portant un chapitre : « 🃏 réviser ce chapitre » | Sur `/revision`, un deck matière se déplie en chapitres | Les deux entrées, une seule mécanique serveur |
| **Coût front** | **Faible** — `chapter_id` est déjà servi (§Constat 4) | **Élevé** — endpoint neuf « chapitres servables », nouvel écran, nouvel état vide | Somme des deux |
| **Coût back** | Le deck `{chapter}` seul | Le deck **+** l'agrégat par chapitre | Somme |
| **Sert `plan_steps` ?** | ✅ oui — c'est le déblocage nommé par §14.6 | ❌ non | ✅ |
| **Existe sans agenda saisi ?** | ❌ non — zéro surface si l'agenda est vide | ✅ oui | ✅ |
| **Risque *blocked practice*** | **Faible** — session **contextuelle**, liée à une date, pas une habitude | **Réel** — une porte permanente peut devenir le chemin par défaut, au détriment du mélange | Réel, porté par (b) |
| **Respecte §14.6** | ✅ la porte n'apparaît que sur une échéance résolvable | ✅ sous condition (Décision 2) | ✅ |

**Retenue : (a) seule, dans ce chantier** — décision du commanditaire, 2026-08-10, conforme à la
recommandation. Trois raisons, dans l'ordre de leur poids :

1. C'est la seule qui **débloque `plan_steps`** — la raison écrite pour laquelle ce chantier passe
   avant le plan de préparation. Faire (b) d'abord serait refaire l'erreur que §14.6 a évitée.
2. Elle **répond** à l'objection *blocked practice* au lieu de la contourner : une session ouverte
   par un contrôle daté est un **événement**, pas un régime. Le deck mélange reste le rituel.
3. Le §Constat 4 montre que (b) est un **chantier à part entière** (endpoint + écran + état vide),
   pas un supplément. L'emballer ici, c'est la dérive que `docs/WORKFLOW.md` nomme mode d'échec n° 1.

⚠️ **Ce que (a) coûte, et qu'il faut accepter en le choisissant** : tant que Papa ne saisit aucune
échéance avec chapitre, **la capacité est invisible**. Elle existe et ne se voit pas. C'est le prix
de l'interdiction du bouton mort — l'inverse (une porte permanente parfois vide) est précisément ce
que §14.6 refuse.

### (d) Élargir la résolution chapitre → notions hors des leçons validées — écartée

Ferait entrer dans une session de Massimo des notions issues de leçons non relues. Toucherait le
gate de l'ADR-0011, qui est une doctrine, pas un détail. Hors périmètre — et le §Constat 1 montre que
le vrai problème n'est pas la largeur de la résolution, c'est **ce qu'on affiche quand elle rend
zéro** (Décision 2).

### (e) Un objet « session » persisté côté serveur — écartée pour ce chantier

Résoudrait le §Constat 2 sans toucher la doctrine : `POST /session` rendrait un identifiant, les
attempts le porteraient, le serveur saurait tout. Mais c'est une table (ou un objet Redis), un cycle
de vie, une expiration, et un nettoyage — pour une seule information. Écartée au motif de
`CLAUDE.md` n° 7 (*« préférer un code simple et lisible à une abstraction prématurée »*). La
Décision 4 obtient la même garantie sans elle.

### (f) Un flag client `non_scheduling: true` sur l'attempt — écartée

C'est l'option évidente, et c'est la mauvaise. Elle laisse le **client décider de l'effet** : un bug
front, et le SRS cesse de replanifier **en silence**, sur des sessions normales. Le SRS se
dégraderait sans qu'aucun écran ne change — la panne la plus coûteuse et la moins visible du dépôt.
La doctrine « pas de flag client » existe pour ça.

### (g) Un plafond chapitre plus haut que le plafond matière — écartée

Tentant avant un contrôle. Mais le plafond ne borne pas la révision, il borne **une** session : rien
n'empêche Massimo d'en lancer une seconde. Un mur de 20 cartes avant un contrôle est une pression
anxiogène (`CLAUDE.md` §gamification), pas une aide.

## Décision

### 1. La porte est l'ÉCHÉANCE D'AGENDA, et elle seule

Sur une échéance datée qui porte un `chapter_id` et dont le chapitre est **servable** (Décision 2),
l'interface de Massimo affiche une porte unique — *« 🃏 Réviser ce chapitre »* — qui lance la session
du deck `{chapter}`.

**Nulle part ailleurs.** En particulier : **pas** de drill-in depuis le deck matière sur `/revision`
(option (b), écartée), et pas d'entrée depuis la page Cours ou la page Matière.

⚠️ **Le coût est accepté en connaissance de cause** : tant que Papa ne saisit aucune échéance avec
chapitre, **la capacité existe et ne se voit pas**. C'est le prix de l'interdiction du bouton mort —
et il est montré, pas seulement dit, dans le bloc A de la maquette (écran de droite, agenda vide).

> La mécanique serveur (Décisions 2 à 6) avait été écrite pour être **vraie dans les trois
> options** ; elle est donc inchangée par cet arbitrage. Seul le périmètre de la Slice B en
> dépendait, et il est maintenant fixé.

### 2. Quand le deck serait vide, la porte N'EXISTE PAS — jamais grisée

Un chapitre est **servable** s'il résout au moins une carte servable (Décision 3). Sinon, aucune
affordance : pas de bouton grisé, pas de bouton qui explique, **rien**.

C'est l'application directe de §14.6 (*« un bouton mort se lit comme une panne »*).

> ⚠️ **Ce n'est PAS le cas de l'ADR-0024 §4** (panoplie complète, indisponible grisé), et la
> distinction mérite d'être écrite parce qu'elle se perd : l'ADR-0024 grise **un catalogue** que
> Massimo peut parcourir — le gris y dit *« Papa ne l'a pas encore produit »*, information utile sur
> un écran fait pour ça. Ici, la porte vit **sur une échéance**, dans un flux où Massimo ne cherche
> pas un catalogue : le gris n'y dirait rien d'actionnable, seulement *« quelque chose te manque »*.

**Le serveur décide, jamais le client.** La surface ne recompte pas les cartes : elle reçoit
l'information de servabilité et l'affiche. Recopier la règle côté front en ferait une seconde source
de vérité — celle qui a divergé le jour même dans le chantier agenda (§14.5).

### 3. La sélection : on retire l'échéance, on garde tout le reste

`build_session` gagne `deck == "chapter"` (+ `chapter_id`). Par rapport au deck matière :

| | |
|---|---|
| **Retiré** | `due_at <= now` — **c'est tout l'objet du deck** : servir des cartes non dues |
| 🔴 **CONSERVÉ** | `due_at IS NOT NULL` — sans quoi les cartes **`pending`** (générées sans cours validé, ADR-0013) seraient servies à Massimo |
| 🔴 **CONSERVÉ** | `status NOT IN INACTIVE_CARD_STATUSES` — écarte `pending`, `suspended` (orpheline), `archived` |
| **Conservé** | `student_id` |
| **Portée** | `skill_id IN _ordered_chapter_skill_ids(chapter_id)` — la traversée existante, **réutilisée, pas réécrite** (§Constat 1) |
| **Ordre** | `due_at ASC, id ASC` — **inchangé**, et il garde son sens : les plus en retard d'abord, puis les plus proches de l'être. C'est l'ordre juste avant un contrôle |
| **Entrelacement** | **non** (`mix=False`), comme le deck matière : un chapitre est d'une seule matière |
| **Plafond** | `REVIEW_SESSION_MAX_CHAPTER = 8`, aligné sur le deck matière (alternative (g) écartée) |

**Chapitre inconnu OU sans carte servable → le même `400`, indiscernable**, exactement comme le deck
matière aujourd'hui. La Décision 2 fait que ce 400 ne devrait jamais être atteint par un clic — il
défend la route, il ne pilote pas l'écran.

### 4. 🔴 Le client déclare le CONTEXTE, jamais l'EFFET — et le serveur revalide le contexte

C'est la réponse au §Constat 2, et l'amendement **explicite** de la doctrine « pas de flag client ».

`POST /api/student/reviews/cards/{card_id}/attempt` accepte un champ optionnel
`deck: {chapter: <id>} | null`. Le serveur, **et lui seul** :

1. résout `_ordered_chapter_skill_ids(chapter_id)` ;
2. vérifie que `card.skill_id` **appartient réellement** à ce chapitre ;
3. **si oui** → non-scheduling ; **si non** → l'attempt est traité **normalement**, sans erreur ni
   mention. Un contexte faux est **ignoré**, il ne fabrique rien.

> **La doctrine n'est pas abandonnée, elle est précisée** : *le client n'a jamais décidé d'un effet ;
> il propose un contexte que le serveur revalide.* C'est le patron déjà retenu pour l'intent du chat
> orchestrateur (ADR-0027) — *l'id vient du client, la validité vient du serveur, sinon
> `action=null`*. Le pire cas d'un client menteur est ici de demander le non-scheduling sur une carte
> qui **appartient vraiment** au chapitre nommé, c'est-à-dire le cas où il est légitime.

**Zéro migration.** L'effet persisté est `SpacedReviewAttempt.is_consolidation = True` : tous ses
lecteurs actuels le lisent comme *« cet attempt n'a pas mesuré l'oubli »*, ce qui est **exactement
vrai** d'une session chapitre. ⚠️ Les **commentaires** qui en donnent la raison (code + spec + la
docstring du §Constat 5) deviennent faux et sont réécrits **dans la même slice** — un commentaire
juste par accident est une dette, pas une économie.

La distinction *re-tour* / *session chapitre* n'est pas perdue pour autant : elle vit dans
`XPEvent.reason` (Décision 5) et dans le payload de `learning_events`, qui gagne `deck`.

### 5. Le XP est PLEIN, avec une raison distincte

`XP_PER_REVIEW = 5`, `reason = "review_chapter"`. **Pas** les 2 XP de la consolidation.

Le raisonnement est écrit dans le code lui-même : l'XP *« récompense l'EFFORT, pas le score »*. Les
2 XP du re-tour existent parce qu'un second passage trois minutes plus tard est une **répétition peu
coûteuse** — pas parce que la planification n'a pas bougé. Une session chapitre demande **le même
effort** qu'une session normale.

Sous-payer précisément la session qu'on veut voir avant un contrôle serait une **contre-incitation**,
et `CLAUDE.md` §gamification demande que la gamification serve l'apprentissage.

`record_attempt` distingue donc **trois** branches — normale / re-tour / chapitre — là où il en avait
deux.

### 6. Papa : exclue de la mesure de mémoire, présente partout ailleurs

- **Exclue** du panneau mémoire du dashboard — l'exclusion existe déjà (§Constat 5) et devient
  correcte pour la bonne raison, une fois la docstring réécrite : *une session chapitre ne mesure
  aucun oubli, la carte n'était pas due.*
- **Présente** dans le journal d'activité (`EVENT_REVIEW_ATTEMPTED` → « Révision SRS »), dans l'XP,
  et dans la **régularité douce** (le module `motivation` lit cet événement). C'est du travail réel :
  il compte comme du travail.

Aucune surface Papa neuve dans ce chantier.

### 7. `step_type = lesson` reste mort — et c'est délibéré

§14.6 le signale déclaré mais absent de `_build_steps` et `_STEP_PALETTE`. Le ressusciter appartient
au **plan de préparation**, qui vient après. Un chantier, une frontière.

## Périmètre

**Slice A — backend.** `deck == "chapter"` dans `build_session` (Décision 3, réutilisant
`_ordered_chapter_skill_ids`) ; `deck` optionnel sur l'attempt + revalidation serveur (Décision 4) ;
troisième branche XP (Décision 5) ; servabilité d'un chapitre exposée (Décision 2) ; réécriture des
trois commentaires devenus faux ; test-verrous. **Zéro migration.**

**Slice B — Massimo.** La porte **sur l'échéance d'agenda** (Décision 1), son état vide (= son
absence), le passage du `deck` à l'attempt. Le runner de session existant est **réutilisé tel
quel** : aucun écran neuf, le seul écart visible est le nom du deck.

**Hors périmètre, explicitement** — 🔴 **toute entrée depuis `/revision`** (le drill-in permanent est
l'option (b), écartée) · plan de préparation et `plan_steps` · `step_type = lesson` · quiz blanc
(couplage 3 du §11) · toute surface Papa neuve · tout élargissement du gate ADR-0011 · les pages
Cours et Matière.

## Conséquences

**Positives** — la première capacité que l'agenda **rend** à Massimo au lieu de la lui annoncer ;
l'interdiction du §14.6 est levée en construisant ce qu'elle protégeait ; `plan_steps` cesse d'être
posé sur un trou ; zéro migration, donc zéro passage en prod à surveiller ; la traversée
chapitre → notions est **réutilisée**, pas dupliquée.

**Négatives / coûts** — la doctrine « pas de flag client » est **amendée**, et un amendement de
doctrine se paie en vigilance ailleurs ; `record_attempt` passe de deux branches à trois, sur la
fonction la plus chaude du module ; trois commentaires du dépôt disaient une raison juste et diront
désormais une raison **différente**, ce qui rendra `git blame` moins lisible ; et, la porte (a)
étant retenue, **la capacité peut rester invisible pendant des semaines** — un agenda vide, et rien
ne s'affiche. Enfin, `/revision` reste **exactement ce qu'elle est** : le chantier livre une
capacité de révision que la page dédiée à la révision ne montre pas. Assumé (option (b) écartée),
mais c'est une asymétrie qu'il faudra savoir expliquer.

## Le signal qui dirait qu'on s'est trompé

L'objection *blocked practice* de la spec (§Constat 6) n'est pas réfutée par un argument, elle est
**pariée**. Le pari : une session chapitre est un **événement contextuel**, pas un régime, donc elle
s'ajoute au mélange au lieu de le remplacer.

**Ce qui dirait le contraire** : l'usage de `mix_day` **baisse** pendant que celui du deck chapitre
monte. Ce serait la cannibalisation — Massimo réviserait *étroit* au lieu de réviser *entrelacé*, et
sa mémoire réelle s'en trouverait dégradée sans qu'aucun écran ne l'annonce.

Les deux séries sont lisibles dès aujourd'hui : `XPEvent.reason` distingue `review` de
`review_chapter` (Décision 5). **À regarder au premier contrôle passé.** Si le signal apparaît, la
réponse n'est pas de retirer le deck chapitre — c'est de le borner dans le temps autour de
l'échéance.

## Suivi

- **Test-verrou** — un chapitre **sans leçon validée** rend zéro carte, et la servabilité renvoyée est
  fausse. C'est le test qui attrape le §Constat 1.
- **Test-verrou** — une carte **`pending`** d'un chapitre servable n'est **jamais** servie
  (`due_at IS NOT NULL` conservé, Décision 3). ⚠️ Le saboter en retirant la clause doit **rougir** :
  c'est la clause qu'on retire par erreur en croyant retirer l'échéance.
- **Test-verrou** — un attempt portant `deck: {chapter: X}` sur une carte **hors** du chapitre X est
  traité **normalement** : `due_at` bouge, XP plein, `is_consolidation=False` (Décision 4, point 3).
- **Test-verrou** — un attempt de session chapitre laisse `due_at`, `interval_days` et
  `last_reviewed_at` **strictement inchangés**. C'est l'invariant du §11 ; il ne se lit nulle part
  ailleurs.
- **Test-verrou** — l'XP d'une session chapitre est **5**, pas 2, et sa `reason` est `review_chapter`
  (Décision 5).
- **Test-verrou** — un attempt de session chapitre **n'apparaît pas** dans le panneau mémoire du
  dashboard, **et apparaît** dans le journal d'activité (Décision 6). Deux assertions, une seule
  session.
- **Test-verrou front** — une échéance dont le chapitre n'est pas servable ne rend **aucun élément
  de porte dans le DOM** (Décision 2). ⚠️ L'assertion porte sur l'**absence**, jamais sur un
  `disabled` : un bouton désactivé passerait un test écrit à l'envers, et c'est exactement l'écran
  que la Décision 2 refuse.
- **Test-verrou de dépôt** — la porte n'apparaît **que** sur la surface Agenda de Massimo : aucune
  occurrence du deck `{chapter}` sous `pages/Revision*` (Décision 1, option (b) écartée). C'est le
  test qui attrape la dérive « tant qu'on y est, mettons-la aussi sur `/revision` ».
- Mise à jour de `docs/frontend-massimo/page-revision.md` — le §« Hors périmètre V1 » est **amendé**,
  pas supprimé (§Constat 6), et le contrat de `POST /session` suit.
- Ligne dans `DECISIONS.md` — ⚠️ sur `main`, avec cet ADR, **jamais sur une branche**.
- **Relecture visuelle humaine AVANT la PR**, sur l'interface de Massimo. Le chantier agenda a rendu
  **quatre défauts** que trois suites vertes et des verrous sabotés n'avaient pas vus ; cinq de ses
  six décisions sont nées de l'œil.
- Commit suggéré : `feat(revision): a chapter deck that never moves the schedule`.

## Décisions validées (commanditaire, 2026-08-10)

**Les sept sont gelées.** On les **relit**, on ne les rouvre pas.

1. ✅ **La porte est l'échéance d'agenda — option (a), et elle seule.** Prise par le commanditaire
   après exposé des trois options chiffrées et de leur maquette à la même échelle ; conforme à la
   recommandation. **(b) et (c) sont écartées** — le drill-in permanent depuis `/revision` est hors
   périmètre, définitivement pour ce chantier.
2. ✅ Porte **absente**, jamais grisée, quand le deck serait vide.
3. ✅ `due_at <= now` retiré ; `due_at IS NOT NULL` et le filtre de statut **conservés**.
4. ✅ Le client déclare le **contexte**, le serveur revalide et décide l'**effet**.
5. ✅ XP **plein (5)**, `reason = "review_chapter"`.
6. ✅ Exclue de la mesure de mémoire ; présente dans l'activité, l'XP et la régularité.
7. ✅ `step_type = lesson` hors périmètre.
