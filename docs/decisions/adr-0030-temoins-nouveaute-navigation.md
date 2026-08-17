---
id: "0030"
titre: "Témoins de nouveauté en navigation"
type: architecture
statut: accepte
date: 2026-08-01
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0017", "0025", "0026"]
---
# ADR-0030 — Témoins de nouveauté en navigation

## Statut

**Accepté — 2026-08-01**, livré le jour même (slices A et B). Trois passages corrigés **au vu du
code** pendant le read-before-code ; ils sont signalés en place par *(corrigé à
l'implémentation)* plutôt que réécrits silencieusement — l'écart entre ce qui était supposé et ce
qui existait est la partie utile.

> **Numérotation** : 0029 est le dernier accepté (« Rejeu animé galaxie »). Cet ADR est donc 0030.
>
> S'appuie sur : `adr-0007` (capsules — `new_count` de `capsule_views`), `adr-0013` (le SRS ne
> montre ni intervalle ni retard), `adr-0015` (fiches — `new_count` par `seen`), `adr-0016`
> (mindmaps — `/seen` livré en no-op), `adr-0017` (missions), `adr-0024 §5` (aucun capital
> perdable, aucun décompte de jours manqués), `adr-0025 §3` (l'absence n'est pas un événement)
> **et son addendum §12**, qui est le prérequis de la ligne « Agenda ».
> **Ne rouvre aucune décision antérieure** ; l'addendum ADR-0025 §12, lui, en révoque une, et
> c'est pourquoi il est un document séparé.

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-08 | le témoin du Diagnostic, et l'exception assumée à « NOUVEAU jamais DÛ » | Accepté | oui |
> | 2 | 2026-08-15 | le témoin de Matières, et les bornes des trois nouveaux témoins | Accepté | — |
> | 3 | 2026-08-15 | le témoin d'ELI5, ou le §2 payé plutôt que contourné | Accepté | — |
> | 4 | 2026-08-15 | le témoin du Quiz, et un témoin qui naît d'une production | Accepté | — |
>
> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*

## Contexte

Cinq surfaces de Massimo portent déjà un badge « ✨ nouveau » **à l'intérieur de leur page** :
les decks de fiches, la bibliothèque de capsules, les decks de révision, les decks ELI5. Aucune
ne le remonte dans la navigation. Conséquence : un contenu validé par Papa n'existe pour Massimo
que s'il visite la page **au hasard**.

> *(corrigé à l'implémentation, 2026-08-01)* — « aucune ne le remonte dans la navigation » était
> **faux**. `MassimoSidebar.tsx` portait déjà **deux** pastilles, sur Capsules et sur Révision,
> chacune avec son propre `fetch` au montage et une comparaison en dur sur `item.to`. Le lot
> n'ajoute donc pas cinq badges : il **unifie deux badges ad hoc et en ajoute trois**. Ça ne
> change aucune décision — ça la renforce, puisque le patron « un fetch par pastille » était déjà
> en train de se répandre entrée par entrée, et que c'est précisément ce que l'appel unique du §5
> arrête.

C'est le contraire de l'intention du produit. Papa valide, donc quelque chose arrive ; ce quelque
chose est un cadeau, et un cadeau qu'on ne découvre que par hasard n'a pas été offert.

Le risque est symétrique et il est sérieux : un badge de navigation est l'endroit du produit où
une mécanique de relance s'installe le plus facilement — elle est même la forme par défaut, celle
que toute application produit spontanément. « Rappel ≠ relance » n'est pas une préférence
esthétique ici, c'est ce qui décide si le badge est livrable.

## Constat read-before-code

1. **Trois `new_count` existent déjà et sont adossés à une vue** : `fiches/summary.new_count`
   (fiches jamais ouvertes), `capsules/stats.new_count` (non vues, table `capsule_views`),
   `reviews/summary.new_count` (cartes dues **jamais révisées**). Ils sont directement
   remontables.
2. **Un quatrième `new_count` existe et ne convient pas** : celui de `notions/summary` (ELI5) est
   un critère de **récence** — leçon porteuse créée dans les 7 derniers jours (`Lesson.created_at`,
   faute d'horodatage sur `Skill`) — et non de vue. Il décroît tout seul, sans rapport avec ce que
   Massimo a lu.
3. **`POST /api/student/mindmaps/{id}/seen` est un no-op en V1** (`page-mindmaps.md`), documenté
   comme tel : « suivi des vues / badge Nouveau différé ». La route existe, la donnée non.
4. **Les missions n'ont aucun `new_count`** : le badge des decks compte les missions
   *disponibles*, ce qui est une file, pas une nouveauté.
5. **Le motif d'invalidation par événement est éprouvé** : `CONTENT_REQUESTS_CHANGED_EVENT`
   pilote déjà la pastille `/demandes` côté Papa, vérifié en live (badge 1 → 0).
6. **Côté Papa, la doctrine est contradictoire dans la doc** : `page-dashboard.md` écrit « aucun
   badge de compteur en navigation qui clignoterait », alors que `page-missions-pilotage.md`
   spécifie un badge ambré sur « Missions » et que la pastille `/demandes` est livrée. À corriger
   (§7).

## Alternatives considérées

- **N'afficher aucun badge en navigation, s'en tenir aux badges de page.** Le plus sobre, et
  cohérent avec « aucune mécanique de ré-engagement ». Écarté : il fait dépendre la découverte du
  contenu validé d'une visite au hasard, ce qui vide de son sens le geste de validation de Papa.
  L'objection réelle vise la **relance**, pas l'information — et §1 ci-dessous les sépare.
- **Badger sur les files (cartes dues, missions disponibles, items d'agenda non faits).** C'est la
  réponse spontanée, et la plus utile en apparence. Écartée frontalement : ces compteurs
  grossissent quand Massimo **ne vient pas** et ne décroissent que par le **travail**. Ils
  fabriquent l'arriéré que `adr-0024 §5` et `adr-0025 §3` refusent de rendre persistable.
- **Badger sur la récence** (« ajouté cette semaine »), ce que fait déjà ELI5 en page. Écarté pour
  la navigation : le badge s'allumerait sur une entrée que Massimo vient de visiter, et
  s'éteindrait sans qu'il ait rien vu. Un badge qui ment sur ce qu'on a lu ne se répare pas.
- **Un appel par page, cinq requêtes au montage du layout.** Écarté : cinq allers-retours sur la
  page la plus visitée, pour un objet décoratif, dans un shell qui doit peindre vite.
- **Rafraîchissement périodique (polling) du compteur.** Écarté sans réserve : un compteur qui
  change tout seul sous les yeux de Massimo **est** une notification, quel que soit son intitulé.
- **Étendre le badge aux notifications de Papa (« papa t'a écrit »).** Hors périmètre et non
  tranché : ce serait un canal de message, pas un témoin de contenu.

## Décision

### 1. La règle, et son test

> **Un badge de navigation compte ce qui est NOUVEAU. Il ne compte jamais ce qui est DÛ.**

Test opérationnel, à appliquer à toute entrée candidate :

| | Nouveauté | Arriéré |
|---|---|---|
| Naît de… | un geste de Papa / du système (un contenu arrive) | une date franchie, une file qui s'allonge |
| Meurt de… | **un regard** de Massimo | **le travail** de Massimo |
| Si Massimo ne vient pas pendant 3 jours | inchangé | **grossit** |

La colonne de droite est la définition d'une relance. Elle est interdite en navigation, sur les
deux interfaces.

### 2. Un badge exige un `seen` — la récence ne suffit pas

Un compteur n'est éligible que s'il est adossé à une **trace de vue** (`seen`, `view`, `last_seen`).
Un compteur de récence décroît par le temps et non par le regard : il allumerait une entrée
fraîchement visitée et s'éteindrait sans avoir été lu.

Conséquence directe : **ELI5 n'a pas de badge de navigation**. Son `new_count` reste ce qu'il est,
un signal de récence, et reste où il est utile — sur les decks, en page.

### 3. Périmètre : six entrées

| Entrée | Source | Statut |
|---|---|---|
| **Agenda** | `agenda_last_seen_at` (addendum ADR-0025 §12) | ✅ — le seul à exiger un addendum |
| **Fiches** | `fiches/summary.new_count` | ✅ existant |
| **Capsules IA** | `capsules/stats.new_count` | ✅ existant, **spécifié dès `page-capsules-ia.md`**, jamais livré en navigation |
| **Révision** | `reviews/summary.new_count` — cartes **jamais révisées** | ✅ existant, **et surtout pas `due_count`** |
| **Missions** | missions `validated` jamais démarrées | ⚠️ `new_count` à créer |
| **Mindmaps** | `mindmap_views` (table créée le 2026-08-01) | ✅ **livré** — le `/seen` no-op est soldé (§4) |

Sans badge, et ce n'est pas un oubli — chaque absence a sa raison :

- **Matières** est un hub : ce qui arrive (fiches, capsules, cartes) a déjà son entrée, un badge
  ici doublerait les autres ;
- **Quiz** n'a **pas de `validation_status` du tout** (`adr-0014 §2`) : un quiz se produit à la
  demande sur le cours qu'on vient de lire, il n'existe aucun moment « Papa valide → ça arrive ».
  Ce n'est pas « pas encore branché », c'est qu'il n'y a pas d'objet ;
- **Cours, Diagnostic, Ma Galaxie, Chat ZETIS, Paramètres** n'ont ni trace de vue ni contenu
  entrant ;
- **ELI5** a un `new_count`, mais de récence (§2).

**Révision est le cas le plus exposé** : `due_count` est à portée de main, il est déjà servi par le
même endpoint, et il répondrait mieux à « qu'est-ce que j'ai à faire ». C'est précisément le
compteur interdit — une carte due depuis cinq jours est « à revoir », jamais « en retard »
(`adr-0013`). Le badge compte les cartes **jamais vues**, point.

> *(corrigé à l'implémentation, 2026-08-01)* — **le `new_count` existant n'était pas réutilisable,
> et il violait déjà cette règle en production.** `reviews/summary.new_count` exige
> `due_at <= now` en plus de `last_reviewed_at IS NULL`, alors que `schedule_review` crée les
> cartes avec `due_at = now + intervalle` : une carte fraîchement générée n'entrait dans le
> compteur que **1 à 7 jours plus tard, sans aucun geste de Massimo**. C'est la colonne « arriéré »
> du §1, et la pastille Révision déjà livrée en sidebar la consommait.
>
> Le badge de navigation utilise donc une expression **dédiée**, `memory/service.py::new_cards_count`,
> sans aucune clause d'échéance. La clause reste légitime dans `get_reviews_summary` (le deck ne
> montre que ce qui est servable) — les deux fonctions sont voisines, portent le même mot pour deux
> choses, et chacune renvoie à l'autre en docstring.
>
> **Conséquence visible, assumée** : le badge s'allume dès la génération par Papa au lieu
> d'attendre l'échéance, donc plus tôt et sur des volumes plus gros (`9+` d'un coup après une
> génération de masse). C'est la sémantique voulue — « Papa vient de te préparer des cartes » — et
> le badge meurt au premier passage.

### 4. Mindmaps : différé, puis livré le jour même

Rendre `POST /seen` réel demande une table de vues miroir de `capsule_views` et sa migration —
du travail backend qui n'a rien à voir avec la navigation. L'inclure ferait porter au chantier
« badges » une brique de suivi de lecture ; la discipline mono-chantier dit non.

Mindmaps reste donc **la seule famille de dérivés sans témoin de nouveauté**. C'est écrit ici pour
que l'asymétrie soit visible et datée, pas pour être oubliée : elle rejoint le BACKLOG en tant que
telle, et non en tant que « badge manquant ».

> *(levé le 2026-08-01, à la demande, juste après la livraison des cinq autres)* — la table
> `mindmap_views` (migration `d2e3f4a5b6c7`) est le calque exact de `fiche_views` : unicité
> `(student_id, mindmap_id)`, un horodatage, **aucun compteur** — relire une mindmap n'est pas une
> information pédagogique, contrairement au revisionnage d'une capsule, et un compteur qu'on
> n'affiche nulle part finit par être affiché quelque part. `service.mark_seen` cesse d'être le
> placeholder qui répondait 204 sans rien retenir.
>
> **Le report était le bon appel, et le lever après coup aussi** : la brique a été jugée sur ses
> mérites une fois le chantier navigation clos, au lieu d'être avalée par lui. **Aucun backfill**
> — les vues passées n'ont jamais été enregistrées, donc les 14 cartes validées comptent toutes
> comme nouvelles au premier chargement. Marquer tout comme vu pour éviter un `9+` le premier jour
> effacerait du contenu que Massimo n'a effectivement jamais ouvert.
>
> Le périmètre du §3 passe donc à **six entrées**, et **plus aucune famille de dérivés n'est sans
> témoin**. Le compteur ignore délibérément le filtre `is_engaged_in_active_mission` : une carte
> rendue accessible par une mission en cours est du travail en cours, pas un cadeau qui arrive.

### 5. Un seul appel, aucune horloge

- **`GET /api/student/news/summary`** → `{ agenda, fiches, capsules, revision, missions }`, entiers
  bruts. Monté **une fois** dans `MassimoLayout`.
- Invalidé par un **`NEWS_CHANGED_EVENT`** client, émis par chaque geste qui consomme une nouveauté :
  `POST /fiches/{id}/seen`, `POST /capsules/{id}/view`, premier attempt d'une carte neuve, démarrage
  d'une mission, ouverture de `/agenda` ou rendu du bandeau d'Accueil. Motif éprouvé sur
  `CONTENT_REQUESTS_CHANGED_EVENT`.
- **Aucun polling, aucun websocket, aucune horloge.** Un badge qui bouge sans que Massimo ait rien
  fait est une notification.
- Le plafonnement `9+` est **de présentation** ; le serveur sert le compte exact.

> *(précisé à l'implémentation, 2026-08-01)* — la rédaction initiale disait « même convention que
> le 15+ de la page Révision », ce qui se contredisait. Ce sont **deux helpers distincts, et ils
> doivent le rester** : `cappedCount` (15+, `hooks/useReviewSession.ts`) plafonne un deck de cartes
> **à réviser**, `capNewsBadge` (9+, `lib/news.ts`) plafonne un témoin de **nouveauté**. Les
> unifier ferait ressembler l'un à l'autre — exactement ce que cet ADR sépare. Un test croise les
> deux pour empêcher la fusion.

### 6. Forme — aucun langage visuel nouveau

Le badge « ✨ nouveau » des `DeckDisc`, repris à l'identique. Plafonné `9+`, **absent à zéro** (pas
de `0` affiché, pas de réceptacle vide — `adr-0024 §5`), **aucune pulsation ni animation
d'apparition**, aucun rouge.

> *(précisé à l'implémentation, 2026-08-01)* — « repris à l'identique » était ambigu : `DeckDisc`
> porte **deux** badges, un booléen `✨ new` en emerald translucide et un **compteur** en dégradé
> indigo→cyan. Retenu : la **teinte du premier**, le **nombre du second**, et **surtout pas le
> dégradé** — c'est le badge du compte de cartes **dues**, et lui emprunter sa forme ferait
> ressembler visuellement un témoin de nouveauté à un compteur d'arriéré.

Deux couleurs restent hors d'atteinte : **l'or** (`#ffcf47`, réservé à l'état « ZETIS parle ») et
**l'ambre** (couleur des files de validation Papa — un badge enfant ne doit pas emprunter la
sémantique d'une file d'attente parentale).

### 7. Côté Papa, la doctrine est clarifiée, pas changée

`page-dashboard.md` interdit « tout badge de compteur en navigation qui clignoterait » ; la sidebar
Papa porte pourtant un badge sur « Missions » (`page-missions-pilotage.md`) et la pastille
`/demandes` est livrée. Les deux règles visent des objets différents et doivent le dire :

- la **file du dashboard** affiche un nombre, elle n'alerte pas — c'est ce que la phrase protégeait ;
- la **sidebar Papa** signale une **file de validation** (`pending`), c'est-à-dire du travail que
  Papa a lui-même demandé au système de préparer. C'est légitime, et c'est un objet distinct du
  témoin de nouveauté de Massimo.

Aucune règle ne change ; la phrase de `page-dashboard.md` est reformulée pour ne plus interdire ce
qui est livré. **Le badge de nouveauté de cet ADR ne s'applique pas à l'interface Papa** : Papa n'a
pas de contenu qui « arrive » sans qu'il l'ait demandé.

## Conséquences

**Positives** — le geste de validation de Papa devient visible sans être annoncé ; une règle unique,
énonçable en une phrase, couvre cinq entrées et toutes les suivantes ; la frontière avec la relance
est écrite avec son test, donc opposable ; un seul appel réseau sur la page la plus visitée ; aucun
langage visuel nouveau à maintenir.

**Négatives / coûts** — un endpoint agrégé de plus, qui devra être étendu à chaque famille de
contenu future (le prix de l'appel unique) ; un `new_count` à créer côté missions ; deux phrases de spec à réécrire (`page-agenda.md`,
`page-dashboard.md`) ; et une pression durable, qu'aucun test ne clôt définitivement, pour brancher
ces badges sur les files — c'est la version utile, et c'est la version interdite.

## Suivi

- **Test-verrou** : aucun badge de navigation ne consomme `due_count`, `due_at`, `done_at` ni une
  date d'échéance. Le test lit les sources de `news/summary`, pas seulement sa sortie.
- **Test-verrou** : le badge d'une entrée est strictement décroissant sous l'effet des seuls gestes
  de consultation ; aucun écoulement du temps ne l'augmente.
- `new_count` missions : missions `validated` sans `mission_start` — à confirmer contre le modèle de
  preuve d'ADR-0017 au read-before-code.
- Slices : (A) endpoint agrégé `news/summary` + `agenda_last_seen_at` + `new_count` missions ;
  (B) `MassimoLayout` + `NEWS_CHANGED_EVENT` + badges ; (C) corrections documentaires (§7,
  `page-agenda.md`, README frontend-massimo).
- Ligne à ajouter dans `DECISIONS.md` ; ligne BACKLOG pour le `seen` réel des mindmaps (§4).
- **Exécution après la Slice A du Groupe 1 (ADR-0026)** — mono-chantier ; ce lot ne dépend de rien
  du chat, et le chat ne dépend de rien d'ici.
- Commit suggéré : `feat(student): aggregated news badges in Massimo navigation`.

---

## Amendement 1 — le témoin du Diagnostic, et l'exception assumée à « NOUVEAU jamais DÛ » — 2026-08-08

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

**Accepté — 2026-08-08.** Décision du **commanditaire**, prise après que l'objection lui a été
exposée en toutes lettres et **réaffirmée**.

> **AMENDE l'`adr-0030` Décision 1** en y créant une **exception nommée**, et **RÉVOQUE
> l'`adr-0044` Décision 7**, acceptée le matin même, qui concluait « Diagnostic reste SANS témoin
> de nouveauté ».
>
> ⚠️ **Ce n'est pas une clarification, c'est une exception.** Elle est écrite parce qu'une règle
> qu'on enfreint sans le dire cesse d'être une règle pour tout le monde.

### Ce qui est décidé

**L'entrée « 🧭 Diagnostic » de la sidebar de Massimo porte un témoin numérique.**

- Il **compte** les diagnostics **relus par Papa que Massimo n'a pas encore passés**.
- Il **s'éteint par le travail** — quand Massimo a passé le diagnostic et envoyé ses réponses —
  et **non par le regard**.
- Il affiche un **nombre**, comme les six témoins existants.

### 🔴 La règle que cette décision enfreint, mot pour mot

L'`adr-0030` Décision 1 pose :

> **Un badge de navigation compte ce qui est NOUVEAU. Il ne compte jamais ce qui est DÛ.**

Et son test opérationnel classe les candidats en deux colonnes. Le témoin décidé ici tombe
**intégralement dans la colonne de droite** :

| | Nouveauté | **Ce témoin-ci** |
|---|---|---|
| Naît de… | un geste de Papa | un geste de Papa ✅ |
| Meurt de… | **un regard** | **le travail** ❌ |
| Si Massimo ne vient pas 3 jours | inchangé | **grossit** ❌ |

L'`adr-0030` conclut sur cette colonne : *« La colonne de droite est la définition d'une relance.
Elle est interdite en navigation, sur les deux interfaces. »* **Cette décision l'autorise, pour
cette entrée seulement.**

### Le contre-motif, maintenu au dossier

Il ne disparaît pas parce qu'il a été écarté :

- `CLAUDE.md` §gamification interdit la **pression quotidienne anxiogène** et tout **capital qu'on
  peut perdre**. Le streak a été retiré le 2026-07-27 pour ce motif exact : *« un capital qu'on
  peut perdre fait venir par peur de perdre, ce n'est pas de l'auto-motivation »* ;
- un nombre qui **grandit pendant une absence** est la forme la plus directe de ce capital ;
- l'`adr-0044` Décision 1 avait répondu autrement au même besoin : la carte « commence par là »
  **est** le signal d'arrivée, et elle ne montre qu'**un** diagnostic à la fois — donc rien ne
  s'accumule pendant une absence.

### Ce qui n'a PAS motivé la décision : le coût

Il faut le dire, parce que l'inverse serait un argument confortable et faux.

**La forme interdite est gratuite ; la forme légale coûte une table.** Depuis l'`adr-0044`
Session A, `taken_at` existe sur le contrat de liste : « les diagnostics relus que Massimo n'a pas
passés » se compte **sans aucune migration**, sans table de traces de vue, sans route nouvelle —
un champ de plus dans `GET /api/student/news/summary`. Un témoin qui s'éteindrait au **regard**
exigerait au contraire une table sur le modèle de `mindmap_views`.

**L'arbitrage est donc de valeurs, pas de coût**, et il appartient au commanditaire.

### Bornes

L'exception vaut pour ce témoin et **ne s'étend à rien d'autre** :

1. **Une seule entrée.** La règle de l'`adr-0030` reste intacte pour les six autres, et le
   test-verrou qui les protège n'est pas touché.
2. **Le compteur ne compte que du RELU.** Papa reste le robinet : rien n'entre dans ce nombre
   qu'il n'ait laissé passer. C'est la seule régulation de volume du dispositif.
3. **Aucun décompte de jours**, sous aucune forme — ni « depuis 3 jours », ni date, ni ancienneté.
   Cette interdiction-là n'est **pas** amendée.
4. **Aucune couleur d'alerte, aucune notification.** Le témoin garde le langage visuel existant
   (`adr-0030` §6) : aucun rouge, aucun « en retard », aucune relance hors de l'écran.
5. **Rien chez Papa.** Son interface n'affiche pas ce compteur.

### Le signal qui dirait qu'on s'est trompé

- **Massimo évite la page Diagnostic** alors que le compteur monte — le badge serait devenu ce
  qu'il fuit. Réponse : le retirer, pas l'atténuer.
- **Il passe des diagnostics pour éteindre la pastille**, et non parce qu'il veut savoir. Ce serait
  visible à la qualité : des passations rapides et creuses, sur le diagnostic le plus court plutôt
  que celui que la page propose.
- **Le compteur dépasse durablement 3 ou 4** : ce ne serait plus un signal mais un arriéré, et le
  robinet est chez Papa.
- ⚠️ Aucun de ces trois signaux n'est mesuré aujourd'hui. **Ils se regardent, ils ne s'alertent
  pas** — ce qui est cohérent avec le reste, mais veut dire que la vérification est humaine.

### Mise en œuvre

- Le compteur se calcule sur des colonnes **existantes** — aucune migration.
- Il rejoint `GET /api/student/news/summary` (`adr-0030` §5 : **un seul appel, aucune horloge**).
- `navigation.ts` : `/diagnostic` reçoit un `newsKey`. Le commentaire de `NavItem.newsKey` et le
  test-verrou `navigation.test.ts` doivent être **réécrits pour dire l'exception**, jamais
  simplement élargis — sans quoi la prochaine session complètera la liste « par symétrie
  apparente », ce que ce test existe précisément pour empêcher.
- **Livraison : Session C** du chantier `adr-0044`.

### Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (Décisions 1 et 2 — la règle amendée)
- `docs/decisions/adr-0044-la-page-diagnostic-propose-au-lieu-de-lister.md` (Décision 7, révoquée)
- `CLAUDE.md` §Règles gamification (le contre-motif)

---

## Amendement 2 — le témoin de Matières, et les bornes des trois nouveaux témoins — 2026-08-15

> Fusionné depuis **Amendement 2** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**.

> **AMENDE l'`adr-0030` §3**, qui rangeait Matières parmi les entrées « sans badge, et ce n'est pas
> un oubli », au motif que *« Matières est un hub : ce qui arrive (fiches, capsules, cartes) a déjà
> son entrée, un badge ici doublerait les autres »*.
>
> **Ce document porte aussi les quatre bornes transverses B1–B4** communes aux trois témoins
> ajoutés le même jour (Matières, ELI5, Quiz). Elles sont écrites **une seule fois**, ici : trois
> copies d'une même borne divergent, c'est le motif du regroupement.

### Ce qui est décidé

**L'entrée « 📚 Matières » de la sidebar de Massimo porte un témoin numérique.**

Il compte les **cours validés de l'année active que Massimo n'a jamais ouverts**.

- Il **naît** de la validation d'une leçon par Papa.
- Il **meurt d'un regard** — le premier `GET /api/student/lessons/{id}/cours`.
- Il ne connaît **aucune date** : ni `created_at`, ni `validated_at`, ni échéance.

Il reste donc **entièrement dans la colonne « Nouveauté »** du test du §1. Contrairement au témoin
du Diagnostic, il n'est **pas** une exception et n'en demande aucune.

### Le motif du §3 était faux, et voici où

Le §3 range le **cours** avec ses **dérivés**.

Fiche, capsule, mindmap et carte SRS sont *produites à partir* d'un cours validé — c'est la
définition même du substrat canonique (`adr-0011`). Le cours est l'**original**. Dire qu'un témoin
sur Matières « doublerait les autres » revient à dire qu'un original double ses copies.

Concrètement, le témoin de Matières est le **seul** qui s'allume quand Papa valide une leçon dont
aucun dérivé n'a encore été produit — c'est-à-dire le cas normal, puisque la production des dérivés
vient après. Il n'y a pas de doublon : il y a un maillon qui manquait.

**La partie juste du §3 est conservée** : Matières est bien un hub, et le témoin ne compte donc
**pas** ce qui a déjà son entrée. Il ne compte que le cours.

### Bornes de ce témoin

1. **L'unité est la LEÇON**, jamais la matière ni le chapitre. Un badge qui compterait des
   *matières* ne pourrait pas mourir d'un regard : ouvrir une matière ne l'a pas lue.
2. 🔴 **Ne compte que ce qui est OUVRABLE** — `content_markdown IS NOT NULL`. Ce n'est pas un
   raffinement, c'est ce qui rend le témoin **mortel** : `student_lesson_content` répond **404** sur
   une leçon validée sans cours, donc le geste qui l'éteindrait n'y est jamais atteint. Mesuré au
   cadrage sur la base de dev : **50 des 92 leçons validées** sont dans ce cas. Les compter ferait
   un badge que rien ne peut éteindre.
3. **Année active seulement.** Une leçon d'une année archivée n'« arrive » pas.
4. **Aucune date dans la requête.** Voir B-commun ci-dessous.
5. **Zéro migration, zéro trace nouvelle.** La trace est `lesson_views`, déjà écrite par
   `GET /api/student/lessons/{id}/cours`. Si ce marquage bouge un jour, ce témoin bouge avec lui —
   un test les lie.
6. 🔴 **Pas de point zéro pour ce témoin, et c'est une contrainte, pas un choix esthétique.**
   `lesson_views` **n'appartient pas au badge** : elle est lue par la fiabilité du diagnostic
   (`diagnostics/fiabilite.py` — « le cours a été lu » est un critère) et par le Cahier de bord
   (`production/journal.py`). Y écrire des vues fictives pour faire démarrer le badge à zéro
   ferait croire à ZETIS que Massimo a lu des cours qu'il n'a jamais ouverts, et **fausserait un
   calcul pédagogique**. Le badge démarre donc à sa valeur réelle (**32** au cadrage) et se vide à
   l'usage. C'est le seul des trois dans ce cas.
7. **Aucun autre témoin ne sera dérivé du même objet.** Cette autorisation vaut pour l'original,
   pas pour un sixième dérivé.

---

### Bornes transverses B1–B4 — communes à Matières, ELI5 et Quiz

Trois entrées gagnent un témoin le même jour. Ce qui suit s'applique aux trois, et les addenda
**Amendement 3** et **Amendement 4** **citent ces bornes par
référence au lieu de les recopier**.

#### B1 — `DEROGATIONS` ne bouge pas, et c'est la preuve que ceci n'est pas une porte ouverte

Le registre `DEROGATIONS` de `test_news_doctrine.py` reste **`{"diagnostic"}`**, et le test-verrou
« une seule exception meurt du travail » n'est **pas touché**.

Les trois témoins ajoutés meurent tous d'un **regard**. Aucun n'a demandé de dérogation, aucun
n'entre dans la colonne interdite du §1. L'`adr-0030` §1 sort de ce chantier **intact**.

C'est le critère à opposer au prochain candidat : *ce témoin a-t-il besoin d'une dérogation ?* Si
oui, ce n'est pas la suite de ce chantier, c'est la suite de l'addendum Diagnostic — et il faut une
décision du commanditaire, pas une symétrie.

#### B2 — Un témoin doit pouvoir atteindre ZÉRO

Toute unité comptée doit être **atteignable par le geste qui l'éteint**.

Formulée parce que le cadrage l'a rencontrée : 50 leçons validées sans contenu, que le badge aurait
comptées et qu'aucun clic n'aurait pu décrémenter. Un compteur immortel est pire qu'un compteur
absent — il apprend à ne plus regarder l'entrée.

Un test-verrou porte cette borne (N2).

#### B3 — Le plafond reste `9+`, et il sera saturé au début

L'`adr-0030` §6 plafonne l'affichage à `9+`. **Le plafond n'est jamais relevé en compensation**
d'un compteur trop gros : ce serait transformer le témoin en compteur d'arriéré visuel.

Deux des trois témoins démarrent à **zéro** grâce au point zéro (voir les addenda ELI5 et Quiz).
Le troisième, Matières, démarre à **32** — donc `9+` — pour la raison exposée en borne 6.

**Le signal qui dirait qu'on s'est trompé** : le témoin de Matières affiche encore `9+` dans deux
mois. On **retire le témoin, ou on restreint sa population** ; on ne monte jamais le plafond.

#### B4 — Dix entrées sur treize porteront un témoin, et la partition est totale

Après ce chantier : **dix** entrées à témoin, **trois** sans — `/` (Accueil), `/galaxy`, `/chat`.

Passé un certain nombre, un badge partout est un badge nulle part. **Aucune onzième entrée ne
reçoit de témoin sans un ADR qui le dise.**

Le test-verrou change de forme pour tenir cette borne : la boucle « entrées sans témoin » de
`navigation.test.ts` — dont le commentaire dit *« CETTE BOUCLE NE SE RÉTRÉCIT PAS »* et à qui ce
chantier retire deux des cinq entrées — est **remplacée par une partition totale** (les deux camps
réunis font exactement `MASSIMO_NAV`, sans doublon). Elle en sort **plus forte** : aucune entrée ne
peut changer de camp en silence, et une 14ᵉ entrée force à trancher son camp.

Ne pas la rétrécir : un verrou qui perd une entrée à chaque chantier finit vide.

---

### Ce que ce chantier ne fait pas

- Il **ne rouvre pas** le §1 (la règle) ni le §2 (un badge exige une trace de vue). Le §2 est au
  contraire *payé* par les deux tables neuves d'ELI5 et Quiz.
- Il **ne touche pas** au témoin `diagnostic` ni à son addendum.
- Il **ne touche pas** au `new_count` de récence d'ELI5, qui reste en page.
- Il **n'ajoute aucune entrée** de navigation. `MASSIMO_NAV` garde treize entrées et `/galaxy` reste
  à son index — l'`adr-0024` §1 interdit le 6ᵉ onglet, et ajouter des témoins n'est pas ajouter des
  onglets.
- Il **ne crée aucun témoin côté Papa** (`adr-0030` §7 : ce que porte sa sidebar est une file de
  validation, objet distinct).

### Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§1, §2, §3 — le §3 amendé ici)
- **Amendement 3**
- **Amendement 4**
- `docs/decisions/adr-0025-agenda-scolaire.md` (Amendement 7)
- **Amendement 1** (l'exception, qui reste seule — B1)

---

## Amendement 3 — le témoin d'ELI5, ou le §2 payé plutôt que contourné — 2026-08-15

> Fusionné depuis **Amendement 3** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**.

> **AMENDE la CONSÉQUENCE du §2 de l'`adr-0030`**, et son §3.
>
> ⚠️ **Le §2 lui-même n'est pas amendé, et il sort de ce chantier renforcé.** Voir ci-dessous.

### Ce qui est décidé

**L'entrée « 💡 ELI5 » de la sidebar de Massimo porte un témoin numérique.**

Il compte les **notions ELI5-éligibles que ZETIS n'a jamais expliquées à Massimo**.

- Il **naît** de la validation d'une leçon porteuse par Papa (une notion de plus devient
  explicable).
- Il **meurt d'un regard** — la première explication demandée sur cette notion.
- Il repose sur une **table de vue neuve**, `eli5_views`, une ligne par (élève, notion).

### Le §2 n'est pas contourné, il est payé

Le §2 de l'`adr-0030` pose :

> *« Un compteur n'est éligible que s'il est adossé à une trace de vue (`seen`, `view`,
> `last_seen`). Un compteur de récence décroît par le temps et non par le regard : il allumerait une
> entrée fraîchement visitée et s'éteindrait sans avoir été lu. »*

**Cette phrase reste vraie mot pour mot**, et le compteur qu'elle visait — le `new_count` de
`student_notions_summary`, une fenêtre de 7 jours sur `Lesson.created_at` — reste **inéligible**.

Ce qui change, c'est la conséquence que le §2 en tirait :

> *« Conséquence directe : ELI5 n'a pas de badge de navigation. »*

La conséquence était juste **à trace de vue constante**. On ne réutilise pas le compteur de récence :
on **crée la trace qui manquait**. Le §2 en sort renforcé — « la récence ne suffit pas » devient
« alors on paie la table ».

### Bornes

1. 🔴 **Le témoin est adossé à `eli5_views`, jamais au `new_count` de récence.** Les deux coexistent,
   sur le patron exact de `new_cards_count` face à `get_reviews_summary` (`adr-0030` §3, encadré du
   2026-08-01) : deux fonctions voisines, deux objets, chacune renvoyant à l'autre en docstring. Un
   test-verrou vérifie que le source du compteur ne contient ni `NOTION_NEW_WINDOW_DAYS`, ni
   `created_at`, ni `timedelta`, **et** que les deux nombres diffèrent dans un monde construit pour
   qu'ils diffèrent (N5).
2. **Une ligne par (élève, notion), aucun compteur d'ouvertures.** Doctrine reprise mot pour mot de
   `mindmap_views` : un compteur qu'on n'affiche nulle part finit par être affiché quelque part, et
   « combien de fois Massimo a redemandé la même explication » n'est pas une information de
   navigation.
3. **Le geste qui éteint est l'EXPLICATION DEMANDÉE**, et rien d'autre : ni l'affichage d'une chip,
   ni l'ouverture de l'écran d'une matière, ni le survol d'un deck. Et **seulement sur succès** —
   une explication qui échoue (provider indisponible) ne marque rien.
4. **ELI5 reverse ne marque rien.** Reformuler une notion avec ses propres mots est du **travail**,
   pas un regard. Le confondre avec l'ouverture ferait entrer le témoin dans la colonne interdite du
   §1 par la petite porte.
5. **La population est celle que la page MONTRE** (`student_subject_notions` : chapitre validé →
   leçon validée → `LessonSkill`, année active). Si la page restreint un jour, le compteur restreint
   avec elle — un test d'égalité les lie (N6). Un badge qui compte plus que ce que sa page montre est
   un badge qu'on ne peut pas éteindre (B2).
6. **🔴 Point zéro à la pose : tout l'existant est marqué vu.** La migration insère dans `eli5_views`
   **toutes** les notions éligibles au jour de la pose. Le témoin démarre donc à **0** et ne compte
   que ce qui arrive **ensuite**.
   - **Ceci n'amende pas** l'« aucun backfill » de l'`adr-0030` §4, qui refusait de marquer vu ce
     qui n'avait *jamais* été ouvert. Ici on ne prétend rien sur le passé : on pose l'**origine du
     témoin**. Un témoin de nouveauté né aujourd'hui n'a, par définition, aucune nouveauté à
     annoncer — le passé n'est pas de la nouveauté, c'est de l'arriéré.
   - **Conséquence assumée, à dire** : Massimo ne verra **jamais** de badge pour les 267 notions
     déjà en base. Sans le point zéro, le badge afficherait `9+` figé pendant des mois (236 au
     cadrage), ce qui n'informe de rien (B3).
   - `eli5_views` est **neuve et lue par le seul témoin** : aucun autre calcul n'en dépend, donc le
     point zéro ne fausse rien. C'est exactement ce qui n'est pas vrai pour Matières (voir la borne 6
     de **Amendement 2**).
7. **Bornes transverses B1–B4** : voir **Amendement 2**. En
   particulier **B1** — ce témoin meurt d'un regard, il n'entre pas dans `DEROGATIONS`.

### Alternatives écartées

- **Réutiliser le `new_count` de récence** — zéro migration, et c'est exactement ce que le §2
  interdit. Le badge décroîtrait tout seul et se rallumerait sur une entrée fraîchement visitée.
- **Réutiliser `lesson_views`** (leçons validées jamais ouvertes) — zéro migration aussi, mais le
  compteur serait alors **strictement identique** à celui de Matières : deux entrées de sidebar
  affichant le même nombre pour deux raisons différentes. C'est le doublon que le §3 redoutait, et
  ici il serait réel.
- **Marquer vu dans `POST /ai/eli5/explain`** plutôt que par une route dédiée — supprimerait un
  aller-retour, sur le précédent de `mark_lesson_seen` dans `GET /lessons/{id}/cours`. Écartée : le
  marquage deviendrait invisible dans le contrat d'API et intestable seul.

### Le signal qui dirait qu'on s'est trompé

- **Le badge reste durablement à `9+`** : le rythme de validation de Papa dépasse le rythme
  d'exploration de Massimo. La réponse est le robinet, pas le badge.
- **Massimo demande des explications pour éteindre la pastille** — visible à des explications
  enchaînées sans lecture, sur les notions les plus courtes.
- **Le badge ne bouge jamais** : plus aucune leçon n'est validée, et le défaut est ailleurs.
- ⚠️ Aucun des trois n'est mesuré. Ils se regardent, ils ne s'alertent pas.

### Mise en œuvre

- Table `eli5_views` (élève, notion, `seen_at`, unicité) — calque de `mindmap_views`.
- Route `POST /api/ai/eli5/skills/{skill_id}/seen` → 204, idempotente.
- Compteur `eli5/service.py::new_eli5_count`, entrée `"eli5"` dans `NEWS_SOURCES` et champ dans
  `NewsSummary`.
- Côté client, l'émission vit dans `lib/eli5.ts` **à côté de l'écriture**, jamais dans une page
  (doctrine `newsEvents.ts`) : l'entonnoir `explainEli5` couvre la chip, la question libre résolue,
  le deep-link `?skill_id=` et la modale de mission.
- `navigation.ts` : le motif d'origine (« critère de RÉCENCE ») est **conservé, barré et daté**, pas
  effacé. Un motif effacé se réinvente ; un motif barré non.
- `docs/frontend-massimo/page-eli5.md` : dire que le `new_count` de récence reste **en page** et
  qu'il n'est **pas** le témoin de navigation.

### Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§2 — la règle, non amendée ; §4 — le
  « aucun backfill », non amendé)
- **Amendement 2** (bornes transverses B1–B4)
- **Amendement 4**

---

## Amendement 4 — le témoin du Quiz, et un témoin qui naît d'une production — 2026-08-15

> Fusionné depuis **Amendement 4** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**.

> **AMENDE l'`adr-0030` §3** (entrée « Quiz » de la liste des absences motivées) et le motif
> **rebasé par l'`adr-0044` §7** qui l'avait remplacé.
>
> 🔴 **C'est le plus lourd doctrinalement des trois addenda du jour**, parce qu'il élargit la
> définition de ce qui fait naître un témoin. Le point est écrit ici pour ne pas être noyé.

### Ce qui est décidé

**L'entrée « ✅ Quiz » de la sidebar de Massimo porte un témoin numérique.**

Il compte les **quiz jouables que Massimo n'a jamais OUVERTS**.

- Il **meurt d'un regard** — la première ouverture du quiz.
- 🔴 Il **ne meurt jamais du travail** : abandonner un quiz sans répondre l'éteint quand même, et
  le passer entièrement ne l'éteint pas davantage. `QuizAttempt` n'entre nulle part.

### Les deux motifs d'exclusion, et pourquoi aucun ne tient plus

**Motif d'origine (`adr-0030` §3)** :

> *« Quiz n'a pas de `validation_status` du tout (`adr-0014 §2`) […] Ce n'est pas "pas encore
> branché", c'est qu'il n'y a pas d'objet. »*

**Faux depuis la migration `a9b0c1d2e3f4`** : la table `quizzes` porte un `validation_status`.
Consigné comme tel par l'`adr-0044` §7, qui a **rebasé** le motif sans changer la conclusion.

**Motif rebasé (`adr-0044` §7)** :

> *« Seul le DIAGNOSTIC est gaté (`adr-0043`) ; un quiz de mission ou de fin de cours vaut
> `validated` dès sa génération, donc aucun moment "ça arrive". »*

🔴 **Celui-ci reste vrai, et cette décision ne le contredit pas — elle le contourne par le haut.**

Il n'y a effectivement aucun moment « Papa valide → ça arrive » pour un quiz de mission. Mais
l'`adr-0030` §1 ne dit pas *« naît d'un geste de Papa »* : il dit **« naît d'un geste de Papa / du
système (un contenu arrive) »**. Un quiz produit par le worker **est** un contenu qui arrive.

Ce témoin ne naît donc pas d'une **validation** mais d'une **production**. C'est le premier du
dispositif dans ce cas, et c'est ce qui doit être écrit noir sur blanc :

#### 🔴 Papa n'est plus le robinet

La borne 2 de **Amendement 1** — *« le compteur ne compte que du RELU ;
Papa reste le robinet, c'est la seule régulation de volume du dispositif »* — **ne s'applique pas
ici**. Aucun humain ne module ce compteur : la seule régulation est le **rythme de production**.

C'est une perte de contrôle réelle, assumée, et à surveiller (borne 4).

### Bornes

1. 🔴 **Le compteur ne regarde JAMAIS `QuizAttempt`** — ni `completed_at`, ni `score_percent`, ni
   même l'existence d'une tentative. Il meurt de l'**ouverture**, pas de la passation.
   Sans cette borne, le témoin bascule dans la colonne interdite du §1 (« meurt du travail, grossit
   quand Massimo ne vient pas »), et cette fois **sans décision qui l'autorise** : l'exception du
   Diagnostic est nommée et ne s'étend pas (B1). Deux test-verrous la tiennent : un scan de jetons
   sur le source, et un monde où une tentative créée en base ne fait pas bouger le compteur (N3).
2. **La définition du « jouable » reste UNIQUE.** Le compteur passe par une expression ensembliste
   `servable_quiz_ids`, liée à `list_student_quiz_index` par un **test d'égalité** (N4), sur le
   patron de `new_fiches_count` face à `fiches_summary`. Motif : la fonction existante
   `_servable_quizzes_of_subject` fait une requête par quiz et ne peut pas servir
   `GET /api/student/news/summary`, monté au shell de la page la plus visitée — mais deux
   formulations d'un même filtre finissent toujours par diverger, donc elles se verrouillent l'une
   l'autre.
3. **Un quiz de DIAGNOSTIC n'entre jamais** dans ce compteur (`quiz_type == mission` seulement).
   Sinon il doublerait le témoin `diagnostic`, qui est l'exception nommée, et les deux entrées
   compteraient le même objet avec deux règles de mort opposées.
4. **Naissance par production, robinet absent** — écrit ci-dessus, et écrit **pour être surveillé**.
   Si le volume dérape, la réponse est de **gater la production**, jamais d'atténuer le badge.
5. **🔴 Point zéro à la pose : tout l'existant est marqué vu.** La migration insère dans `quiz_views`
   **tous** les quiz jouables au jour de la pose. Le témoin démarre à **0** et ne compte que ce qui
   est produit **ensuite**.
   - Même raisonnement que pour ELI5 : le passé n'est pas de la nouveauté, et l'« aucun backfill »
     de l'`adr-0030` §4 n'est **pas** amendé (il refusait de marquer vu ce qui n'avait jamais été
     ouvert ; ici on pose l'origine du témoin).
   - Conséquence assumée : Massimo ne verra jamais de badge pour les 37 quiz déjà en base.
   - `quiz_views` est neuve et lue par le seul témoin — le point zéro ne fausse aucun autre calcul.
6. **Bornes 3 et 4 de l'addendum Diagnostic non amendées** : aucun décompte de jours sous aucune
   forme, aucune couleur d'alerte, aucune notification.
7. **Bornes transverses B1–B4** : voir **Amendement 2**.

### Alternative écartée

**Compter les quiz jamais JOUÉS** (sur le modèle du témoin Diagnostic) — zéro migration, puisque
`QuizAttempt.completed_at` existe. Écartée : ce serait une **deuxième** exception à « NOUVEAU jamais
DÛ », donc un compteur qui grossit quand Massimo ne vient pas, sur l'entrée la plus proche de
l'évaluation. L'exception du Diagnostic est bornée par « une seule entrée » ; l'étendre au Quiz
reviendrait à dire que la règle n'en est plus une. La forme légale coûte une table ; elle est payée.

### Le signal qui dirait qu'on s'est trompé

- **Le badge monte pendant que Massimo ne joue pas** : le rythme de production dépasse son usage.
  Réponse : gater la production (borne 4), pas le badge.
- **Massimo ouvre des quiz sans les faire, pour éteindre la pastille.** Ce serait visible à des
  ouvertures suivies d'abandons immédiats. ⚠️ Ce comportement est *toléré par construction* — le
  témoin meurt de l'ouverture — et c'est le prix de la borne 1.
- **Le badge ne bouge jamais** : plus rien n'est produit, et le défaut est dans le worker.
- ⚠️ Aucun des trois n'est mesuré. Ils se regardent, ils ne s'alertent pas.

### Mise en œuvre

- Table `quiz_views` (élève, quiz, `seen_at`, unicité) — calque de `mindmap_views`.
- Route `POST /api/student/quiz/{quiz_id}/seen` → 204, idempotente.
- `quizzes/service.py` : `servable_quiz_ids` (une requête ensembliste) et `new_quizzes_count`.
- Entrée `"quiz"` dans `NEWS_SOURCES`, champ dans `NewsSummary`.
- Côté client, l'émission vit dans `lib/quiz.ts::fetchQuizById`, qui couvre les quatre appelants
  (page Quiz, deep-link `?quiz=`, ouverture depuis une notion, modale de mission).
- `navigation.ts` : les **deux** motifs d'origine sont conservés, barrés et datés — celui de
  l'`adr-0030` §3 l'était déjà par l'`adr-0044` §7, ce document en ajoute un troisième cran. La
  chaîne se lit, elle ne s'écrase pas.
- `API_SPEC.md` porte encore le **premier** motif, périmé depuis `a9b0c1d2e3f4` : à corriger.

### Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§1, §3 — amendé ici)
- `docs/decisions/adr-0044-la-page-diagnostic-propose-au-lieu-de-lister.md` (§7 — le motif rebasé)
- **Amendement 1** (l'exception, qui reste seule — B1)
- **Amendement 2** (bornes transverses B1–B4)
