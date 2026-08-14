# ADR-0054 — La fiche vit dans le temps

## Statut

**Proposé — 2026-08-13.** Les **six décisions sont gelées** ; une session de slice peut démarrer
après `/ouverture`.

> Cadré sur `main`, **sans une ligne de code**, immédiatement après le merge de la slice 3 des
> fiches (PR #124). Né d'une question posée devant l'écran : *« je ne comprends pas comment faire
> apparaître l'option travailler la fiche »*.

> ⚠️ **Ce chantier ne construit presque rien.** Il **rend visible** un backend déjà écrit, testé
> et mergé. C'est son intérêt et c'est aussi son piège : la tentation sera de « pendant qu'on y
> est » rouvrir le §7 ou le §12 de l'addendum ADR-0015. Ils sont fermés.

> Consomme : `adr-0015` (fiches) et son **addendum** (la fiche que Massimo fabrique lui-même),
> §7 (les versions) et §12 (le gabarit et les entrées).

## Contexte

Trois slices ont construit l'atelier. La quatrième constate qu'**on n'y entre presque pas**.

### Le constat, mesuré le 2026-08-13 sur la matière Français

| État de tuile | Leçons | Ce qu'un clic ouvre |
|---|---|---|
| `zetis` | **12** | la fiche en **lecture** — et c'est un cul-de-sac |
| `a_fabriquer` | 3 | l'atelier ✅ |
| `commencee` | 1 | l'atelier ✅ |
| `ma_fiche` | 1 | sa fiche — **cul-de-sac lui aussi** |

**Sur 17 leçons, 13 ne mènent nulle part.** Le seul chemin restant pour ces treize est la page
`Cours`, où chaque leçon porte « 🧩 En faire ma fiche » — un chemin que rien n'annonce depuis
l'écran des fiches.

### Ce que le code dit

```bash
grep -rn "retravailler|rework" apps/frontend-massimo/src --include="*.tsx" | grep -v test
# → AUCUN résultat
```

`POST /api/student/fiches/{id}/rework` existe, est testé, crée la version N+1 en laissant
l'ancienne lisible. **Rien ne l'appelle.** Le §7 — *« la trajectoire dans le temps est le seul
endroit du produit qui montre "sait-il ce qui compte" plutôt que "sait-il répondre" »* — est
**intégralement construit et intégralement invisible**.

### Pourquoi ce n'est pas un simple oubli

L'addendum §3 a été **révisé le 2026-08-12** : *« lire avant de fabriquer, c'est ok »*, les deux
entrées s'ouvrent sans condition. Le §12 nomme l'écran **H** — *« depuis une fiche ZETIS déjà
lue »* — et dit que c'est **le même bouton** que celui du cours. La décision existe ; **l'écran H
n'a jamais été implémenté**.

Et l'addendum nommait un **signal à surveiller** : *« s'il ouvre toujours la fiche ZETIS et
n'entre jamais dans l'atelier »*, avec une réponse graduée allant jusqu'à rétablir un verrou en
dernier recours. 🔴 **Ce signal est ininterprétable aujourd'hui** : on ne peut pas conclure qu'un
enfant évite une porte qui n'existe pas. Interpréter le silence actuel comme un manque de
motivation serait une erreur de mesure — et la réponse « rétablir un verrou » serait une punition
pour un défaut d'interface.

## Décision

### §1 — Trois portes, et elles disent trois choses différentes

| Depuis | Libellé | Ce que ça fait |
|---|---|---|
| une fiche **ZETIS** (écran 3) | **« 🧩 En faire ma fiche »** | ouvre l'atelier sur cette leçon |
| **sa** fiche finie (écran 3) | **« ✏️ La retravailler »** | `rework` → version N+1, l'ancienne reste lisible |
| le **cours**, quand sa fiche existe | **« ✍️ Ma fiche »** | ouvre **sa fiche**, pas l'atelier |

🔴 **« En faire ma fiche » n'est PAS « retravailler ».** La fiche de ZETIS n'est pas à lui : il
n'y touche pas, il fabrique **la sienne à côté**. Confondre les deux libellés donnerait à croire
qu'il édite le contenu de ZETIS — exactement ce que le §2 de l'addendum interdit (sa fiche n'a
aucun cycle éditorial, celle de ZETIS n'est pas éditable par lui).

⚠️ La troisième porte est le **retour** de la dette nommée en slice 1 (*« l'entrée depuis le cours
est toujours "🧩 En faire ma fiche", jamais "✍️ Ma fiche" »*). Elle est désormais **réalisable** :
`GET /subjects/{slug}/fiche-tiles` dit, par leçon, si une fiche personnelle existe.

### §2 — Aucun état neuf côté serveur

Les trois portes se dérivent de ce que `fiche-tiles` rend déjà (`etat`, `fiche_id`, `draft_id`,
`zetis_fiche_id`, `versions`). **Aucune route neuve, aucune colonne, aucune migration.**

C'est le critère qui borne ce chantier : *si une porte demande une donnée que le serveur ne rend
pas déjà, elle sort du périmètre.*

⚠️ **Ce que « aucun état neuf » veut dire exactement** (précisé le 2026-08-13, au read-before-code) :
la contrainte porte sur les **trois** choses listées ci-dessus. **Ajouter un champ à un schéma de
réponse existant est PERMIS** quand la donnée existe déjà en base — c'est le cas de la datation,
qui a besoin d'`updated_at` dans `FicheTile` (`Fiche` porte `TimestampMixin`). Sans cette
précision, le titre du paragraphe se lit plus large que la règle et bloque une décision du §3.

🔴 **Et ce critère a mordu tout de suite** : il a **sorti l'écran des versions du périmètre**, cf.
le §4 ci-dessous. C'est le signe qu'il fait son travail — un critère de bornage qu'on desserre au
premier obstacle n'a jamais borné quoi que ce soit.

### §3 — La datation : relative, sur SA fiche, et nulle part ailleurs

La spec le prescrivait déjà (`page-fiches.md`, écran 2) : *« 2 versions · la dernière il y a
5 jours »*. Jamais implémenté. On l'implémente, et on **borne** :

| Surface | Datation | Motif |
|---|---|---|
| Tuile de **sa** fiche | ✅ **relative** — « il y a 3 jours » | c'est la trajectoire du §7, et elle n'existe pas sans le temps |
| Écran des **versions** | ⏸️ **reportée** — l'écran sort du périmètre (§4) | elle n'a plus de surface où s'afficher |
| Fiche de **ZETIS** | ❌ **rien** | Massimo se fiche de quand elle a été générée, et « il y a 4 mois » ne peut que **saper la confiance** dans un contenu juste. C'est une information de **Papa** |
| **Export A5 / impression** | ✅ **absolue** (`13/08/2026`) | une feuille imprimée sans date est inclassable dans un classeur — seul endroit où l'absolu se justifie |

🔴 **Relatif à l'écran, absolu sur le papier.** Une date absolue sur un écran d'enfant est de la
métadonnée d'adulte ; une date relative sur une feuille imprimée ne veut plus rien dire le
lendemain. Les deux formes servent deux lectures.

⚠️ **Une seule mention, la plus récente, formulée comme un souvenir.** « Créée le … · mise à jour
le … » côte à côte sur une fiche non touchée depuis longtemps se lit comme un reproche — c'est la
frontière de `CLAUDE.md` §gamification (*« aucun décompte », *« pas de pression anxiogène »*).
On écrit *« ta version 2, il y a 3 jours »*, pas un tableau d'horodatages.

### §4 — L'écran des versions SORT du périmètre — et c'est le §2 qui l'a exclu

🔴 **Corrigé le 2026-08-13, au read-before-code, avant toute ligne de code.** Ce paragraphe
décrivait l'écran 7 comme livré par ce chantier. **Il ne peut pas l'être** :

> Les **14** routes élève des fiches ont été listées depuis l'OpenAPI. **Aucune ne rend les fiches
> personnelles d'une leçon.** `fiche-tiles` rend `versions: 2` — **un compte, pas une liste** — et
> un seul `fiche_id`. L'écran 7 s'ouvre sur `?v=2` : **le client n'a aucun moyen de savoir quel
> `fiche_id` est la version 2.** `GET /api/fiches/lessons/{lesson_id}` rendrait exactement ça, mais
> c'est une route **Papa** (`require_parent`).

Le livrer demanderait donc une **route élève neuve** — ce que le §2 interdit. Le périmètre validé
l'incluait ; le critère qui le borne l'exclut : **les deux ne pouvaient pas être vrais ensemble**.

**Décision : l'écran 7 est reporté**, avec sa datation par version. Motif retenu contre
l'élargissement : le §2 n'est pas une contrainte technique, c'est **ce qui garde ce chantier
petit**, et sa petitesse est son seul argument. L'écran des versions est un écran entier — il
mérite son propre cadrage, pas une exception glissée dans celui-ci.

**Ce qui reste vrai pour le jour où il se fera**, et qui n'a pas à être re-décidé : l'écran affiche
**la suite des versions, sans commentaire de progression**. Aucune comparaison automatique, aucun
« tu as fait plus court » — le §6 de l'addendum interdit déjà à ZETIS de juger, et une trajectoire
commentée deviendrait une **note déguisée**. Massimo doit pouvoir **ouvrir une version précédente
et la lire**. Rien de plus.

⚠️ **Conséquence sur le §1** : « ✏️ La retravailler » **reste dans le périmètre** — le geste crée
la version N+1 et n'a besoin d'aucune liste. C'est *consulter* les versions qui sort, pas *en
créer* une.

### §5 — Le signal du §3 redevient interprétable

Une fois les portes en place, *« il ouvre la fiche de ZETIS et n'entre jamais dans l'atelier »*
redevient une mesure de **comportement** au lieu d'une mesure d'**interface**. 🔴 **Ne pas
appliquer la réponse graduée de l'addendum §3 avant d'avoir ces portes depuis au moins deux
semaines d'usage réel** : on ne conclut pas sur un évitement observé à travers un défaut qu'on
vient de corriger.

### §6 — La cible tactile du pied de fiche

Le pied de `FicheCard` porte ses boutons à **34 px de haut** — mesuré le 2026-08-13, **sous la
cible de 44 px** du projet. Tant qu'ils étaient décoratifs ou rares, c'était théorique ; ce
chantier y ajoute **deux boutons de navigation**, sur l'appareil le plus contraint.

**Décision : le pied passe à 44 px**, pour ses cinq boutons d'un coup. ⚠️ C'est un composant
partagé — la mesure se refait **après** le changement, sur les trois surfaces qui le rendent.

## Alternatives considérées

- **Mettre « En faire ma fiche » dans la tuile plutôt que dans la fiche.** Écarté : la tuile a
  déjà un geste (ouvrir), et un second geste dans une tuile de 3 lignes est un piège tactile.
  La fiche ouverte est le moment où l'envie naît — *« ça, je saurais le dire autrement »*.
- **Un seul libellé pour les deux gestes** (« Travailler cette fiche »). Écarté : il ferait croire
  qu'il édite la fiche de ZETIS. Les deux objets sont distincts, les deux verbes doivent l'être.
- **Une date absolue partout.** Écarté, cf. §3 : de la métadonnée d'adulte sur un écran d'enfant.
- **Afficher « créée le » ET « mise à jour le ».** Écarté : deux dates côte à côte sur une fiche
  ancienne se lisent comme un reproche. Une seule, la plus récente.
- **Commenter la trajectoire** (« ta v2 est plus courte, bravo »). Écarté, cf. §4 : une note
  déguisée, et le §6 de l'addendum l'interdit déjà.
- **Rétablir un verrou** parce que Massimo n'entre pas dans l'atelier. Écarté **pour l'instant**,
  cf. §5 : le signal n'est pas encore interprétable.

## Périmètre

- les **trois portes** du §1, dérivées de `fiche-tiles` sans route neuve ;
- la **datation relative** sur la tuile de sa fiche et sur l'écran des versions ;
- la **datation absolue** sur l'export A5 et l'impression ;
- le pied de `FicheCard` porté à **44 px**.

## Hors périmètre (nommé)

- **Toute route ou migration neuve** — critère du §2 : une porte qui en demande une sort.
- 🔴 **L'écran des versions (écran 7) et sa datation par version** — exclus par ce critère même,
  cf. §4. À cadrer à part : il lui faut une route élève qui liste les fiches personnelles d'une
  leçon.
- `mini_exemple`, `mnemonique`, `absent_du_cours`, l'**enrichissement** des fiches existantes —
  ils restent au dos de l'addendum ADR-0015 (§10, §11).
- La **surface Papa** de lecture des fiches de son fils.
- Le **tiroir de cours** de l'atelier et la dé-`vh`-isation de `CoursPanel` (§12).
- `FICHE_PROMPT_VERSION` v1 → v2.
- Le **pont §6** depuis les fiches ZETIS — toujours stub.
- La **réponse graduée** du §3 de l'addendum — verrouillée par le §5 ci-dessus.

## Conséquences

### Positives

- **Zéro brique nouvelle** : `rework`, `fiche-tiles`, `TimestampMixin` et l'export A5 existent
  tous. Ce chantier est presque entièrement du **câblage**.
- Il débloque **13 leçons sur 17** sur une seule matière — le rapport effort/effet est le
  meilleur de tout l'arc des fiches.
- Il rend le **signal du §3** mesurable, donc il protège une décision future d'une erreur
  d'interprétation.

### Négatives / risques

- ⚠️ **Trois boutons de navigation de plus dans un pied déjà à cinq.** Le risque n'est pas
  technique, il est de **densité** : un pied de fiche qui devient une barre d'outils. À regarder
  à l'écran, sur téléphone, avant de figer.
- ⚠️ Le passage du pied à 44 px touche **trois surfaces** ; la non-régression se vérifie sur les
  trois, pas sur celle qu'on modifie.

## Le signal qui dirait qu'on s'est trompé

- Massimo **entre** dans l'atelier depuis une fiche ZETIS, puis **en ressort sans rien poser** de
  façon répétée → la porte est bonne, c'est la **première étape** qui intimide.
- Il ne **retravaille jamais** une fiche finie → soit la version 1 lui suffit (bonne nouvelle,
  et le §7 devient décoratif), soit « La retravailler » se lit comme *« recommence, c'était
  raté »*. **Le libellé serait alors en cause avant la fonctionnalité.**
- Une date relative apparaît et il **demande ce que ça veut dire** → on a mis de la métadonnée là
  où on croyait mettre un souvenir.

## Suivi

1. **Compléter `docs/frontend-massimo/page-fiches.md`** — à faire **avant** la session de code.

   🔴 **Corrigé le 2026-08-13, au §2 de l'`/ouverture`.** Ce point affirmait que la spec ne
   décrivait « ni les trois portes ni les règles de datation ». **C'était faux, et de loin** — je
   l'avais écrit sans relire la spec, exactement l'erreur que le read-before-code existe pour
   attraper. Ce que la spec porte **déjà** :

   | Point | Où |
   |---|---|
   | Bouton **« ✏️ La retravailler »** + effet « nouvelle version » | ligne **249** |
   | Écran **7 · Les versions**, route `?v=2` | ligne **243** |
   | Datation **relative** sur la tuile — « 2 versions · la dernière il y a 5 jours » | ligne **41** |
   | Troisième porte (cours → sa fiche) | ligne **294** |

   **Ce qui manque vraiment, et c'est trois fois moins** :
   (a) la datation **absolue** sur l'export A5 / impression ; (b) l'**absence** de datation sur la
   fiche de ZETIS — une règle négative ne s'écrit jamais toute seule ; (c) l'**écran H décrit** :
   il n'est aujourd'hui que *nommé en référence* (« c'est le même bouton que celui de l'écran H »),
   jamais dessiné.

   ⚠️ **Deux incohérences trouvées au même contrôle**, à corriger dans la spec : la ligne 41
   renvoie à « écran **6** (versions) » alors que la section s'appelle « ### **7**. Les versions » ;
   et l'emoji du bouton diffère — la spec dit **✏️**, le §1 de cet ADR disait **✍️**.
   **La spec fait foi : ✏️.**
2. Une **maquette** n'est pas nécessaire : les trois portes se posent dans un pied existant, et
   l'écran 7 est déjà dessiné. ⚠️ En revanche, la **densité du pied** (risque nommé ci-dessus)
   se juge à l'écran — prévoir une capture téléphone **avant** de figer.
3. **Mesurer les 44 px après coup**, sur les trois surfaces qui rendent `FicheCard`.
4. 🔴 **Ne pas rouvrir** le §3 (réponse graduée), le §7 (versions) ni le §12 (gabarit) de
   l'addendum ADR-0015 : ce chantier les **exécute**, il ne les rediscute pas.
