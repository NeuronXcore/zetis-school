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
