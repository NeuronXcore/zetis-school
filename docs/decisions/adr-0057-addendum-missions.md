# ADR-0057 · Addendum — Missions : le tri se fait sur une NOTION, pas sur une leçon

## Statut

**Proposé (2026-08-14)** — cadré sur `main`, sans une ligne de code.

Cet addendum **rend l'arbitrage (4)** que l'`adr-0057` §9 avait laissé ouvert : *« Missions —
TOUJOURS OUVERT. Non arbitré, hors périmètre tant qu'il ne l'est pas. »* C'est le dernier morceau
du chantier « une seule façon de trouver », dont les quatre autres pages sont livrées.

> **Il ne rouvre rien de l'`adr-0057`** : le motif, le critère de recherche cliente (§2), ce que
> cherche le mot-clé (§3), la règle « aucune porte sur du vide » (§6) et les quatre règles de la
> galaxie (§8) s'appliquent tels quels. Cet addendum ne traite **que** ce que Missions a de
> particulier.

## Contexte

### La raison écrite du report, et ce que la mesure en fait

L'`adr-0057` §9(4) reportait Missions sur un motif précis : *« les missions croisées sont
multi-matières (`adr-0017` §5, esprit EPI du cycle 4) — un tri par matière les ampute au lieu de
les ranger »*.

> ⚠️ **Le renvoi de l'`adr-0057` est FAUX, et il faut le dire ici pour qu'il cesse de circuler** :
> la phrase *« esprit EPI du cycle 4 »* est au **§6 de l'`adr-0017`** (« Hors périmètre
> (explicitement) »), ligne 303 — pas au §5, qui traite des générateurs et du moteur d'étapes. Le
> §5 est bien cité **ailleurs** dans cet addendum, pour le verdict et la preuve : ces
> renvois-là sont justes.

🔴 **Mesuré le 2026-08-14 sur la base de dev : cette objection vaut pour UNE mission sur 58 — et
le code la traite déjà.**

[`useMissions.ts:211`](../../apps/frontend-massimo/src/hooks/useMissions.ts) extrait les missions
`champion` **avant** le regroupement par matière, avec ce commentaire :

> *« Les champions croisées (ADR-0022) sont HORS matière (subject vide) → leur propre deck 🏆,
> jamais dans un groupe matière (ni dans le décompte "à jour"). »*

La seule mission que le tri par matière amputerait n'est donc **pas triée par matière**, ni
aujourd'hui ni demain. Le report reposait sur un problème résolu ailleurs, dans un fichier que le
cadrage de l'`adr-0057` n'avait pas ouvert.

### 🔴 La vraie différence, que personne n'avait nommée

Elle existe, et elle est structurelle — simplement, ce n'est pas la matière :

| | Objet rangé | Son chapitre |
|---|---|---|
| Quiz · Fiches · Mindmaps | une **leçon** | `Lesson.chapter_id` — **exactement un**, porté par la ligne |
| **Missions** | une **notion** (`Skill`) | 🔴 **aucun** — `Skill` n'a pas de `chapter_id` |

Le chapitre d'une notion se **dérive** par ses leçons validées (`Chapter ← Lesson ← LessonSkill`),
et cette dérivation peut rendre **zéro** chapitre, **un**, ou **plusieurs**. Une notion comme
« Priorités opératoires » est enseignée en **Fractions** *et* en **Nombres relatifs** : elle ne
« vit » pas dans un chapitre, elle traverse le programme.

*« Ce n'est pas la même logique »* était juste. La raison n'était pas celle qu'on avait écrite.

### Les mesures

Sur `GET /api/missions` et la base de dev, le 2026-08-14 — **58 missions actionnables**
(`validation_status = validated`, statut `planned|active` ; c'est le filtre que la page applique
déjà, `useMissions.ts:208`).

| Sous combien de chapitres une mission se range-t-elle ? | | |
|---|---|---|
| **1 chapitre** | **52** | **90 %** |
| 0 chapitre | 4 | 7 % |
| 2 chapitres | 1 | 2 % |
| 3 chapitres | 1 | 2 % |

| Autres mesures | |
|---|---|
| Missions réellement **multi-matières** | **1 / 58** (le `champion`, `subject_id = NULL`) |
| Répartition par matière | Maths **25** · Français **22** · SVT **14** · Anglais **4** |
| Missions portant une notion | 65 / 66 servies |
| Missions dont les **étapes** couvrent plusieurs notions | **1** (le champion, 12 étapes / 3 notions) |

> ⚠️ **Cette mesure a dû être refaite, et l'erreur mérite d'être écrite.** La première passe
> utilisait `lessons_by_skill`, qui filtre `Lesson.status != 'archived'` — **les brouillons
> passent**. Elle annonçait 3 missions à 2 chapitres et 1 à 4 ; avec le gate d'une surface élève
> (`Lesson.status == 'validated'`, celui d'`ordered_chapter_skill_ids`), il en reste **1 et 1**.
> C'est exactement le piège du §4 de `/cadrage` : *une fonction voisine approximait la règle.*

**Ce que ces chiffres disent** : le niveau chapitre est **praticable** (90 % sans ambiguïté), et le
besoin est réel — ouvrir « Mathématiques » donne aujourd'hui **25 missions à la file**, sans
repère, ce qui est le défaut exact que les quatre slices précédentes ont réparé ailleurs.

## Décision

### §1 — Missions entre dans le motif, à l'écran 2, comme les trois autres

L'écran 1 (disques par matière, disque « Mission du jour », deck 🏆) **ne change pas** — c'est le
premier niveau que l'`adr-0057` §1 protège explicitement. Le chapitre et la recherche s'ajoutent
**dans une matière ouverte**, avec la brique partagée `SubjectChapterShelves`.

### §2 — Le chapitre se dérive de la NOTION, par ses leçons validées, et jamais autrement

`Skill → LessonSkill → Lesson(status = 'validated') → Chapter`. C'est la chaîne que le dépôt
utilise déjà partout ; elle n'est pas réécrite ici.

🔴 **La dérivation est une LECTURE, jamais une écriture** — voir le critère du §4.

### §3 — Une seule → ce chapitre. Zéro ou plusieurs → « Sans chapitre »

Le groupe « Sans chapitre » **existe déjà** dans la brique (`NO_CHAPTER_LABEL`), il est déjà rendu
en dernier, et il est déjà à l'écran sur les Capsules. Il accueille les **6 missions sur 58**
(10 %) qui ne se rangent pas proprement.

🔴 **On ne choisit JAMAIS un chapitre parmi plusieurs.** Ranger « Priorités opératoires » sous
« Fractions » parce qu'il vient en premier dans le programme serait afficher une information
**fausse** sous une apparence de certitude — et rien à l'écran ne dirait qu'un choix a été fait.
Un objet qui ne sait pas où il habite doit le dire, pas être logé d'office.

### §4 — 🔴 LE CRITÈRE QUI BORNE : aucune colonne, aucune migration

> **Le chapitre d'une mission ne se persiste pas.** Il se calcule à la lecture, à chaque fois.
> Si la mise en œuvre demande d'ajouter `chapter_id` sur `missions` — ou n'importe quelle colonne,
> n'importe quelle table —, **la slice sort du périmètre** et revient ici.

Ce critère mord dès le premier jour, et c'est voulu : la tentation est immédiate (« un `chapter_id`
dénormalisé, ce serait plus simple à trier »). Le dépôt sait déjà où ça mène —
`DATA_MODEL.md` §« le chapitre d'un quiz se lit sur sa LEÇON, pas sur `Quiz.chapter_id` » est la
trace d'une dénormalisation qui a menti. Et une notion **change** de chapitres quand Papa valide
une leçon : une colonne serait fausse le lendemain, sans que rien ne le signale.

### §5 — Le champion garde son deck 🏆, et n'entre dans aucune matière

Déjà vrai (`useMissions.ts:211`), et cet addendum le **cite** au lieu de le réécrire. La seule
mission multi-matières du dépôt reste hors du tri — elle n'est donc jamais amputée.

⚠️ **Signalé sans être traité** : cette mission est servie avec `subject: ""` et
`skill_name: "Notion"` — deux **valeurs de repli** qui passent pour des valeurs vraies. Invisible
aujourd'hui parce que le deck 🏆 n'affiche ni l'une ni l'autre. À corriger le jour où une surface
les lit.

### §6 — Ce que le mot-clé cherche ici : le titre ET le nom de la notion

L'`adr-0057` §3 le prévoit déjà (*« s'ajoutent, là où la page les tient déjà, le nom du chapitre et
celui de la notion »*), et la page **tient déjà** `skill_name`. C'est utile ici plus qu'ailleurs :
les titres sont préfixés d'un verbe de type (« Travailler : … », « Renforcer : … », « Progresser :
… »), si bien que chercher sur le seul titre ferait remonter tout un type sur le mot « renforcer ».

## Alternatives considérées

- **Ne pas mettre de niveau chapitre du tout, seulement la recherche** — écartée : 90 % des
  missions se rangent sans ambiguïté, et 25 missions de Maths à la file sont exactement le défaut
  qu'on répare ailleurs. Ce serait renoncer sur la foi des 10 %.
- **Ranger une mission multi-chapitres sous son premier chapitre** (ordre du programme) — écartée
  par le §3 : lisible, et faux.
- **La dupliquer sous chacun de ses chapitres** — écartée : une mission qu'on croit avoir faite et
  qui réapparaît ailleurs est une promesse cassée ; et le compte de l'étagère mentirait.
- **Persister un `chapter_id` sur `missions`** — écartée par le §4 : périmé dès la validation de
  la leçon suivante.
- **Trier par TYPE plutôt que par chapitre** (Renforcer / Réviser / Découvrir / Sur mesure) —
  écartée **comme premier niveau** : le type dit d'où vient la mission, pas de quoi elle parle, et
  Massimo cherche une notion. ⚠️ **À reconsidérer comme filtre secondaire** si « Sans chapitre »
  devait grossir.
- **Un ADR neuf plutôt qu'un addendum** — écartée : l'`adr-0057` a nommé cet arbitrage et l'a laissé
  ouvert. Le rendre ailleurs qu'ici obligerait à recopier son motif, son critère et ses règles —
  et *deux formulations d'une même règle finissent par diverger*.

## Périmètre

- L'**écran 2** de `/missions` (une matière ouverte) : étagères matière → chapitre + champ de
  recherche, par la brique partagée.
- La **dérivation du chapitre** d'une mission, en lecture, côté serveur.
- Les tests : « 90 % sous un chapitre », « zéro ou plusieurs → Sans chapitre », « la recherche
  traverse », « le champion reste hors matière ».

## Hors périmètre (nommé)

- **L'écran 1** : disques par matière, « Mission du jour », deck 🏆, matières « à jour ».
- **L'élection quotidienne**, le scoring, `MISSION_SCORING_VERSION` — `adr-0017` §3/§4.
- **Les modales** d'étape (ELI5, quiz, mindmap) et la timeline des étapes.
- **Le verdict d'acquisition** et la mécanique de preuve — `adr-0017` §5.
- **Les missions `completed`** : la page ne les liste pas dans les matières, et ça ne change pas.
- **Toute surface Papa**, y compris la page de pilotage des missions.
- **La génération** de missions, la validation Papa, le Conseil de classe.
- **Le repli `subject: ""` / `skill_name: "Notion"`** du champion — §5, signalé, non traité.
- **Toute migration**, toute colonne — §4.

## Conséquences

### Positives

- Le motif « une seule façon de trouver » devient **complet sur les cinq pages nommées par la
  demande**, plus la galaxie qui l'avait déjà.
- La plus grosse liste de l'interface (25 missions) cesse d'être une file sans repère.
- La dérivation en lecture reste **juste dans le temps** : le jour où Papa valide une leçon, le
  rangement suit, sans travail de fond ni colonne à rafraîchir.

### Négatives / risques

- ⚠️ **Une dérivation coûte des requêtes** là où une colonne en coûterait zéro. Sur 58 missions et
  32 notions distinctes, c'est négligeable ; sur dix fois plus, il faudra mesurer avant d'y
  toucher — et mesurer, pas supposer.
- ⚠️ **« Sans chapitre » accueille deux populations différentes** (aucune leçon validée / plusieurs
  chapitres) sous un seul libellé. C'est assumé à 10 %, ça ne le serait plus à 40 %.
- ⚠️ Une notion qui change de chapitres fait **bouger le rangement** d'une mission entre deux
  visites, sans que rien ne l'annonce. C'est le prix de la justesse.

## Le signal qui dirait qu'on s'est trompé

1. 🔴 **« Sans chapitre » devient le plus gros groupe d'une matière** — la dérivation ne décrit pas
   la réalité du programme, et le niveau chapitre trompe plus qu'il n'aide.
2. 🔴 **Une migration apparaît dans la slice** — le critère du §4 a cédé au premier obstacle, ce
   qui veut dire qu'il n'avait jamais borné quoi que ce soit.
3. ⚠️ **Une mission est rangée sous un chapitre où elle n'est pas** — quelqu'un a choisi parmi
   plusieurs, contre le §3.
4. ⚠️ **Massimo ouvre une matière et n'en lance plus aucune** — une liste de chapitres a remplacé
   un choix par un inventaire (le signal n° 5 de l'`adr-0057`, qui vaut ici aussi).
5. ⚠️ **Le champion se retrouve dans une étagère de matière** — le §5 a été perdu en route.

## Suivi

- **Mesures de référence, 2026-08-14** : 58 missions actionnables · **52 sous un chapitre (90 %)**,
  4 sous aucun, 1 sous deux, 1 sous trois · **1 seule multi-matières** · Maths 25 · Français 22 ·
  SVT 14 · Anglais 4 · 32 notions distinctes citées.
- **Consomme** : `adr-0057` (le motif entier, son §2, §3, §6, §8 et son §9(4) qu'il rend) ·
  `adr-0017` §3 (regroupement par matière), §5 (missions croisées, `subject_id` nullable) ·
  `adr-0022` (missions champion, verdict par notion) · `adr-0011` (gate `validated` dans la
  requête) · `DATA_MODEL.md` (le chapitre se lit sur la leçon, jamais dénormalisé).
- **Ouvre** : la slice **Missions**, dernière du chantier. Après elle, l'`adr-0057` n'a plus
  d'arbitrage en suspens.
