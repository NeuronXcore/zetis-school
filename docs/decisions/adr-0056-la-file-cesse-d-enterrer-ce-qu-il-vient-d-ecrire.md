# ADR-0056 — La file cesse d'enterrer ce qu'il vient d'écrire

## Statut

**Proposé (2026-08-14)** — cadré sur `main`, sans une ligne de code.
✅ **Son arbitrage a été rendu le même jour** : **règle C**, le quota de deux places (§5).

> **Cet ADR ne parle QUE de l'ordre : *quelles* cartes une session sert.** Le chemin pour arriver
> à une session — matière, chapitre, recherche — est l'objet de l'`adr-0057`, cadré le même jour.
> Les deux sont nés de la même demande et se lisent ensemble ; ils ne se livrent pas ensemble.

## Contexte

### Le défaut, mesuré le 2026-08-14 (commit `b8ed10f`)

La vérification du masquage SRS (`adr-0015` addendum §13 décision 5) a rendu un verdict en deux
moitiés. **Le masquage tient** : les 7 cartes `definition` de ZETIS des notions où Massimo a écrit
la sienne ne sortent d'aucun deck, et le compteur les retire aussi — **159 → 152**, écart de 7
exact. **Mais ses 7 définitions ne sont servies par aucun deck non plus** :

| Deck (mesuré au 2026-08-15 simulé) | cartes servies | dont les siennes |
|---|---|---|
| `mix_day` | 12 | **0** |
| `mix_flash` | 5 | **0** |
| matière Français | 8 | **0** |
| chapitre 2 « Grammaire » | 8 | **0** |

**La cause n'est pas le masquage** : le tri est `due_at asc`, le plafond matière est **8**, et le
Français porte **159 cartes dues**. Ses définitions, écrites la veille, sont les plus **récentes**
de la file : **rangs 153 à 159 sur 159** — **19 sessions** d'arriéré avant qu'on les atteigne, et
encore, à supposer qu'aucune carte ne revienne entre-temps (elles reviennent).

Le §13 promettait : *« entre la formulation de ZETIS et la sienne, c'est la sienne qui compte —
c'est celle-là qu'il doit pouvoir retrouver »*. **La file dit le contraire.**

### L'arriéré, mesuré

| Matière | cartes dues | servies par session | sessions d'arriéré |
|---|---|---|---|
| Français | **159** | 8 | ~20 |
| Mathématiques | 91 | 8 | ~11 |
| SVT | 46 | 8 | ~6 |
| Anglais | 18 | 8 | ~2 |
| **Total** | **314** | mélange du jour = 12 | |

### 🔴 Le constat qui sépare ce chantier de l'`adr-0057`

**Découper par chapitre ne répare RIEN ici.** Mesuré sur les vraies files :

| Chapitre de Français | cartes servables | ses cartes | atteintes (plafond 8) |
|---|---|---|---|
| 1 — Lecture et compréhension | **72** | rangs **70, 71, 72** | **aucune** |
| 2 — Grammaire | **39** | rangs **36, 37, 38, 39** | **aucune** |

Le chapitre divise la file par deux ou par quatre ; **il ne change pas le rang relatif**. Ce qui
enterre sa définition, c'est **l'ordre**. Un chantier de navigation seul répondrait à la demande
*et laisserait le défaut intact* — c'est pourquoi les deux ADR sont séparés au lieu d'être fondus.

## Décision

### §1 — L'ordre de `build_session` est le seul objet de ce chantier

On ne touche ni au chemin, ni aux surfaces, ni aux compteurs affichés. On décide **quelles cartes
entrent dans les 8** (matière) et **dans les 12** (mélange du jour).

### §2 — 🔴 LE CRITÈRE QUI BORNE : l'ordre peut changer, la sélection JAMAIS

> **Toute carte servie après ce chantier devait déjà être servable avant lui.**
> Interdits, sans discussion : toucher à `servable()`
> ([`memory/population.py:66`](../../apps/backend/app/modules/memory/population.py)), desserrer un
> plafond, exposer un champ de planification au client, modifier le moteur SRS (intervalles,
> `ease_factor`, consolidation, XP — `adr-0015` addendum §13 point 6).

Ce critère mord tout de suite : il interdit la première idée qui vient devant 159 cartes dues —
**monter le plafond de 8** — que l'`adr-0049` avait déjà écartée (alternative (g) : *« un mur de 20
cartes avant un contrôle est une pression anxiogène »*, `CLAUDE.md` §gamification). Il interdit
aussi de « faire de la place » en archivant l'arriéré.

### §3 — Le masquage n'est pas rouvert

`servable()` reste l'unique définition du servable, pour la sélection **et** les compteurs
(`adr-0015` addendum §13 point 5). Ce chantier s'y compose ; il ne le reformule pas.

### §4 — Un test-verrou nommé d'avance

*« Une carte `definition_perso` due est atteignable dans la session de sa matière »* — écrit avant
le correctif, rouge avant, vert après, et **saboté** pour prouver qu'il regarde le bon endroit
(`docs/WORKFLOW.md` §2.3).

## §5 — 🔒 L'ORDRE : ARBITRÉ — **règle C, un quota de deux places réservées**

**Décision du commanditaire, 2026-08-14.** Elle ne se rediscute pas ; elle se relit.

Les trois règles avaient été mesurées sur la vraie file du Français (plafond 8, au 15/08) :

| Règle | Ce que la session sert | Ses cartes | |
|---|---|---|---|
| **A — l'ordre actuel** (`due_at asc`) | `[6, 8, 11, 12, 88, 89, 90, 91]` | **0 / 8** | écartée |
| **B — les siennes d'abord** | `[322, 323, 324, 325, 326, 327, 328, 6]` | **7 / 8** | écartée |
| **C — un quota de 2 places réservées** | `[322, 323, 6, 8, 11, 12, 88, 89]` | **2 / 8** | ✅ **RETENUE** |

**Pourquoi C et pas B** : B répare le défaut et en crée un autre — une session de huit cartes dont
sept sont **ses propres formulations** n'est plus de la révision espacée, c'est une relecture de
ses fiches, et le moteur avait placé les autres cartes ce jour-là pour une raison. C garantit
l'atteignabilité (deux places, toujours) sans qu'une file personnelle croissante confisque la
session : ⚠️ **elles sont 7 aujourd'hui, elles ne le resteront pas** — c'est l'objet même de
l'atelier des fiches.

**Ce que « quota » veut dire, précisément :**

1. **Deux places au plus**, jamais deux places d'office : s'il n'y a qu'une carte personnelle due,
   une seule place est prise ; s'il n'y en a aucune, **les deux places retournent à la file** et la
   session est exactement celle d'aujourd'hui. *Le quota réserve, il ne crée pas de vide.*
2. **Les places sont prises DANS le plafond**, pas en plus : une session de matière sert toujours
   **8** cartes. Le §2 l'impose — desserrer le plafond est interdit.
3. **Les cartes personnelles éligibles sont celles qui sont dues**, au même titre que les autres :
   le quota change l'ordre, jamais la sélection (§2).
4. **Entre deux cartes personnelles dues**, l'ordre reste `due_at asc` — la plus en retard d'abord.

⚠️ **Une sous-question reste ouverte, et elle ne bloque pas** : le quota vaut pour les decks
**matière** et **chapitre**, là où le défaut a été mesuré. Pour le **mélange du jour** (12 cartes,
toutes matières), il n'a pas été arbitré. *Recommandation : ne pas l'y appliquer dans cette
slice* — le mélange est le rituel, et deux places réservées sur douze, tous decks confondus, se
mesureront mieux une fois la règle vivante sur la matière.

## Alternatives considérées

- **Desserrer le plafond** — écartée ici et déjà par l'`adr-0049` (g). Ne règle rien : à 20 cartes,
  ses définitions restent au rang 153 sur 159.
- **Purger ou archiver l'arriéré** (314 cartes dues) — écartée : décision **pédagogique** (que
  devient une carte jamais revue depuis six semaines ?), pas un tri. Son propre cadrage, et elle ne
  rendrait pas ses définitions atteignables pour autant.
- **Trier par `due_at desc`** — écartée : atteint ses cartes par accident et retourne le principe
  de la répétition espacée, qui sert d'abord ce qui est le plus en retard d'oubli.
- **Tout miser sur le pont SRS de la fiche** (le bouton muet, défaut 3 de l'`adr-0054`) — écartée
  comme réponse **unique** : elle donne un raccourci vers sa carte, mais la révision ordinaire ne
  la lui reproposerait jamais. Complémentaire, et son chantier existe déjà.
- **Un écran « mes définitions »** — écartée : une surface de plus pour un objet qui doit rentrer
  dans le rituel existant.

## Périmètre

- L'ordre de `build_session` pour les decks **matière** et **chapitre** (et le mélange si l'arbitrage
  l'étend).
- Le test-verrou du §4, plus son sabotage.
- Rien d'autre. Aucune surface, aucune route, aucune migration.

## Hors périmètre (nommé)

- **La navigation** (matière → chapitre, recherche) : `adr-0057`.
- **L'arriéré lui-même** — on ne purge pas, on n'archive pas, on ne suspend pas.
- **Le pont SRS de la fiche** et les défauts 2 et 4 de l'`adr-0054`.
- **L'agenda** et sa porte « Réviser ce chapitre » — `adr-0049` Décision 1, inchangée.
- **Toute surface Papa.**
- **La reprise de session** et toute notification.

## Conséquences

### Positives

- Une définition écrite hier redevient atteignable : la promesse du §13 cesse d'être démentie par
  la file.
- Le correctif est **entièrement serveur**, testable sans écran, et se mesure exactement comme le
  défaut a été mesuré.

### Négatives / risques

- ⚠️ **Un ordre qui privilégie ses cartes est une entorse assumée au moteur SRS** : il avait placé
  les autres cartes ce jour-là. C'est un arbitrage pédagogique, d'où le §5.
- ⚠️ **Le quota est un seuil**, donc un chiffre à surveiller : 2 places sur 8 aujourd'hui, avec 7
  cartes personnelles. À 30 cartes personnelles, la question se rouvre.

## Le signal qui dirait qu'on s'est trompé

1. 🔴 **Une session sert 7 cartes personnelles sur 8** — l'option B a été prise, ou la file
   personnelle a grossi au point que le quota ne borne plus rien.
2. 🔴 **Ses définitions restent inatteignables après le chantier** — la mesure est refaisable à
   l'identique (rang de ses cartes dans la file servie) : c'est le contrôle de recette.
3. ⚠️ **Le nombre de cartes révisées par jour baisse** : les places réservées ont remplacé des
   cartes dues au lieu de s'y ajouter, et l'arriéré s'aggrave.
4. ⚠️ **On se surprend à vouloir monter le plafond** pour faire tenir tout le monde : le §2 a été
   contourné, et le vrai problème (l'arriéré) a été déguisé en problème de tri.

## Suivi

- **Mesures de référence, 2026-08-14** (à rejouer après le chantier) : Français 159 cartes dues,
  ses 7 cartes aux rangs 153→159 ; chapitre 1 : 72 servables, rangs 70-72 ; chapitre 2 : 39
  servables, rangs 36-39.
- **Consomme** : `adr-0015` addendum §13 (masquage, prédicat unique, moteur intouché) ·
  `adr-0049` (deck chapitre, plafonds, alternative (g)) · `CLAUDE.md` §gamification.
- **Ouvre** : ✅ le chantier est **prêt à `/ouverture`** depuis l'arbitrage du §5. Seule la question
  du mélange du jour reste en suspens, et elle ne le bloque pas.
