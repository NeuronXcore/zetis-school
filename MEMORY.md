# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.
## État à la reprise

### ✅ CHANTIER MERGÉ — `/missions` se range par chapitre (ADR-0057 addendum, **la 5ᵉ et DERNIÈRE**)

**MERGÉ dans `main` le 2026-08-14 — PR [#132](https://github.com/NeuronXcore/zetis-school/pull/132),
squash `ff3d843`.** Branche `feat/une-seule-facon-de-trouver-missions` **supprimée** (locale et
distante), base d'origine `94d32df`. **Rien à pousser.** *(Étape 4bis faite dans la foulée.)*

> 🔴 **NE PAS RÉ-IMPLÉMENTER.** Le motif « une seule façon de trouver » est **COMPLET** — Capsules
> (étalon), Quiz, Fiches, Mindmaps, Révision, Missions — plus la galaxie qui l'avait déjà.
> **L'ADR-0057 n'a plus aucun arbitrage en suspens.**
> ✅ **Écran VU** : Maths rangée en 4 groupes, recherche traversante, écran 1 intact.

#### ✅ FAIT

| Livré | Détail |
|---|---|
| `chapters_of_missions` (`missions/service.py`) | dérive le chapitre d'une **notion**, en lot |
| 3 champs sur `MissionStudentOut` | `chapter`, `chapter_id`, **`subject_slug`** (qui manquait) |
| Écran 2 de `/missions` | étagères par chapitre + recherche traversante |
| 🔴 **6 tests de rendu, les PREMIERS de cette page** | ses 2 tests d'origine ne montaient pas le composant |
| 7 verrous serveur | dont **le critère qui borne** : `Mission` ne gagne aucune colonne |

**Zéro migration** — et c'est vérifié mécaniquement par
`test_aucune_migration_pour_ce_chantier`.

#### 🔬 CE QUE LA VÉRIFICATION A DONNÉ

**Huit sabotages joués, huit rouges** (4 backend, 4 front).

Le plus utile **rejoue l'erreur du cadrage** : retirer le gate `validated` fait passer les
brouillons, exactement comme la première mesure — et deux verrous rougissent.

🔴 **Un défaut corrigé la VEILLE, réintroduit le lendemain sur une autre page** :
`showSubjectHeader={… && groupes.length > 1}` effaçait la provenance d'un résultat de recherche
venu d'ailleurs. **Le premier test de rendu de la page l'a démenti dans la minute.** *Une
correction dans un fichier ne se propage pas aux fichiers voisins.*

✅ **Écran VU, sur les vraies données** : Maths passe de 21 missions à la file à **Nombres relatifs
10 · Fractions 6 · Sans chapitre 4 · Géométrie 1** · « Sans chapitre » **en dernier**, et **pas le
plus gros groupe** (signal n° 1 non déclenché) · « participe » depuis les Maths ramène 3 missions
de Français sous l'en-tête qui les nomme · **écran 1 intact** (🎯 Mission du jour, 🏆 « Plusieurs
matières », aucun champ de recherche).

Détail : `TROUBLESHOOTING.md` §`feat/une-seule-facon-de-trouver-missions` (**7 sous-sections**).

#### 🔒 DÉCISIONS ACTIVES — à relire, jamais à rouvrir

1. 🔴 **Le chapitre se DÉRIVE, il ne se persiste jamais** (§4). `Mission` n'a aucune colonne de
   chapitre : une notion change de chapitres dès qu'une leçon est validée.
2. 🔴 **Zéro ou plusieurs chapitres → « Sans chapitre »**. On n'en choisit **jamais** un parmi
   plusieurs — ce serait afficher du faux sous une apparence de certitude.
3. **Le gate `validated` est à la charge de l'appelant** : `lessons_by_skill` rend les brouillons
   **volontairement**, son contrat le dit.
4. **Une `champion` dérive de ses ÉTAPES** (`MissionStep.skill_id`), n'ayant aucune notion propre ;
   et elle garde son deck 🏆, hors de toute matière.
5. **`showSubjectHeader={Boolean(cherche)}`** — la provenance s'affiche dès qu'on cherche, même
   pour un résultat unique.
6. Les décisions de l'ADR-0057 : recherche **cliente** sur le titre · portée « toute la page »
   bornée par « emmener » · brique partagée, **aucune variante locale**.

#### 🧾 DETTES OUVERTES

**Nées de ce chantier :**

- ⚠️ **« Sans chapitre » vaut 4 sur 21 en Maths (19 %)**, plus que les 10 % globaux — les Maths
  concentrent les notions qui traversent le programme. Loin du signal d'alarme, mais **à
  surveiller** : le signal n° 1 de l'addendum est *« ça devient le plus gros groupe »*.
- ⚠️ **Le repli `subject: ""` du champion** (`missions/service.py`) reste — signalé par l'addendum
  §5, invisible tant que le deck 🏆 ne le lit pas. **Non traité.**
- ⚠️ **Deux missions en double en base** (« Addition de fractions » ids 19/16, « Dénominateur
  commun » ids 18/15) — **données de dev**, pas un bug. Papa a créé la même mission deux fois.
- ⚠️ Le tri par **TYPE** de mission (Renforcer / Réviser / Découvrir / Sur mesure) reste écarté
  comme premier niveau, **à reconsidérer en filtre secondaire** si « Sans chapitre » grossit.

**Remontées de la slice Révision (mergée, PR #131, squash `7deaa6f`) — élaguée ce jour :**

- ⚠️ **Les tuiles de chapitre portent toutes la MÊME icône** sur `/revision` — celle de leur
  matière, sous un en-tête qui la porte déjà. Y remédier demande d'inventer un visuel par
  chapitre : **arbitrage non tranché**.
- ⚠️ **`chapter_servable_counts` n'est pas un vrai lot** (docstring menteuse, corps = boucle).
- ⚠️ **Le flux ÉLÈVE des mindmaps n'est documenté qu'en partie dans `API_SPEC`** — trou
  **pré-existant**.
- ⚠️ **Le titre de page dit encore « Français » pendant une recherche sur `/fiches`.**

**Les DETTES À UNE LIGNE, qui n'ont plus besoin d'un chantier :**

- 🔴 **La copie de `groupCapsules.ts` chez PAPA** (`apps/frontend-papa/src/lib/`) — un import.
- 🔴 **`showSubjectHeader` sur `/quiz`** — une prop. ⚠️ **Et maintenant `/quiz` est la SEULE page
  du motif à ne pas l'avoir**, les quatre autres l'ont.

**Un arbitrage qui attend :** `page-quiz.md` (spec absente, question posée le 2026-08-14, jamais
tranchée).

**Remontées des ADR-0054, 0055 et 0056 :**

- ⚠️ Le **quota du mélange du jour** n'est pas arbitré (ADR-0056 §5).
- 🔴 **Le prompt v2 des fiches n'a JAMAIS généré une fiche.**
- 🔴 **Défauts 2 et 3** : `finish` renvoie à la LISTE · le bouton du pont SRS est **muet**.
  Chantier « la fiche répond quand on la touche », **pas cadré**.
- 🔴 **Défaut 4** : revenir dans l'atelier après `finish` crée une v2 vide.
- 🔴 Le **trou d'un jour** du masquage · le **doute** sur le brouillon 51.
- 🔴 **L'enrichissement des fiches par lot** (addendum ADR-0015 §11) : **trois points à trancher**.
- ⚠️ Le **corrigé de ZETIS** reporté · `FicheSidePanel` sans porte · **brouillon 54** porte 3
  points-clés de démonstration.
- ⚠️ **L'ADR-0054 garde deux comptes faux** · pied de fiche à 5 lignes en 375 px · `review_load`
  compte des cartes masquées · commentaire de `coverage.py:364` faux · **veto d'un cours**
  impossible dès qu'une fiche personnelle existe · **aucun linter Python** · **la dictée n'a jamais
  été exercée avec un vrai micro**.

#### 🧪 CE QUI TOURNE, ET CE QUI RESTE EN BASE

**Infra Docker allumée** (`pnpm infra:down` pour l'éteindre) — sans elle, `test_auth.py` rougit
deux fois pour rien. **Paire `backend` (:8000) + `massimo` (:5173)** vivante pour la vérification
d'écran, ⚠️ elle **meurt avec la session**. Token de Massimo posé à la main dans `localStorage`
(`zetis_massimo_token`).

**Rien n'a été écrit en base** par ce chantier — aucune mission démarrée, aucune étape complétée.

**Suites lancées APRÈS la dernière modification de code :**

| Suite | Résultat |
|---|---|
| backend `pytest` | **1302** ✅ (1295 + 7) |
| Massimo `vitest` | **765** ✅ (759 + 6) |
| Papa `vitest` | **814** ✅ (inchangé) |
| `tsc -b` Massimo · Papa | ✅ · ✅ |

⚠️ **Les docs ont été écrites après ce dernier run** ; elles ne touchent aucun code.
**Aucun test existant n'a été modifié.**

#### ▶ PROCHAIN PAS

Le chantier est **mergé**, et le motif entier avec lui : il n'y a rien à y reprendre.
**Un seul chantier à la fois** :

1. 🔴 **Deux dettes à une ligne**, sans chantier : l'import de `groupCapsules.ts` chez **Papa** ·
   `showSubjectHeader` sur **`/quiz`** (désormais la seule page du motif à ne pas l'avoir).
2. ✅ **« La fiche répond quand on la touche » est CADRÉ** (2026-08-14) —
   `adr-0058-la-fiche-repond-quand-on-la-touche.md`. Prochain pas :
   **`/ouverture ADR-0058`**, après le commit du lot Décision.

   🔴 **Le cadrage a trouvé pire que la dette annoncée.** Les défauts 2/3/4 disent la même chose
   (*un geste sans réponse*), et le **défaut 4 s'est RÉALISÉ deux fois en base** : brouillons
   **id=54** (v3, leçon 1) et **id=59** (v4, leçon 7), vides derrière des fiches finies. Et
   **`rework` les rend** (`atelier.py:330`) — donc « La retravailler », le chemin réputé sûr,
   **rend aujourd'hui la page blanche** sur ces deux leçons. ⚠️ **Mesure refaite une fois** : le
   statut est `personal_draft`, pas `draft` ; la 1re passe annonçait **0 cas**.
3. **Un arbitrage qui attend** : `page-quiz.md` (spec absente).
4. **Deux arbitrages d'écran** nés des slices Révision et Missions : les icônes de chapitre
   identiques · « Sans chapitre » à 19 % en Maths.
5. 🔴 **Exercer le prompt v2 des fiches** sur une vraie génération.

⚠️ **Cette section sera élaguée à la clôture du chantier SUIVANT** (`/cloture` §1bis) : ses dettes
encore ouvertes devront être **remontées**, pas enterrées avec le récit.

---

## ⬆️ REMONTÉ de l'élagage de la slice Révision (PR #131, squash `7deaa6f`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0057 ✅ ·
> `TROUBLESHOOTING.md` §`feat/une-seule-facon-de-trouver-revision` (**8 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.90.0** ✅ · 4ᵉ contrôle — dettes remontées ci-dessus.
> Détail par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : **un verrou peut changer d'objet au lieu de mourir.** Un test de dépôt
> interdisait le mot « chapitre » dans `RevisionPage.tsx`, et disait lui-même que seul un ADR
> pouvait l'ouvrir. L'ADR est venu ; le verrou n'a pas été supprimé, il garde désormais la
> **hiérarchie** qui borne le risque qu'il protégeait. Et : *une redondance se lit comme une
> double sécurité et se comporte comme un bandeau sur les yeux* — deux protections qui se
> couvraient l'une l'autre laissaient **deux sabotages verts**.

---

## ⬆️ REMONTÉ de l'élagage de la slice Mindmaps (PR #130, squash `bdc3f6d`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0057 ✅ ·
> `TROUBLESHOOTING.md` §`feat/une-seule-facon-de-trouver-mindmaps` (**3 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.89.0** ✅ · 4ᵉ contrôle — dettes remontées ci-dessus.
> Détail par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : *une position n'identifie un objet que dans la liste qui l'a produite.*
> Une mindmap s'ouvrait par son **rang** ; le jour où une autre matière peut la renvoyer, le rang
> devient un bug en attente. `?carte=<id>` a été l'adresse manquante. **Sur `/revision`, la
> question ne se pose pas** — la destination est une session, pas une page, et le clic la lance.

---

## ⬆️ REMONTÉ de l'élagage de la slice Fiches (PR #129, squash `290b017`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0057 ✅ ·
> `TROUBLESHOOTING.md` §`feat/une-seule-facon-de-trouver-fiches` (**4 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.88.0** ✅ · 4ᵉ contrôle — dettes remontées ci-dessus.
> Détail par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : **une correction de redondance a supprimé une information**. Le chapitre
> s'écrivait deux fois, la matière trois : en masquant l'en-tête de matière quand il n'y a qu'un
> groupe, un résultat de recherche venu d'ailleurs s'est retrouvé affiché **sans rien qui dise d'où
> il venait**. Son propre test l'a démenti dans la minute. *La question n'est pas « est-ce
> répété ? » mais « qu'est-ce que ça dit ici ? ».*

---

## ⬆️ REMONTÉ de l'élagage de la slice Quiz (PR #128, squash `955dba0`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0057 ✅ ·
> `TROUBLESHOOTING.md` §`feat/une-seule-facon-de-trouver-quiz` (**7 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.87.0** ✅ · 4ᵉ contrôle — quatre dettes remontées ci-dessus.
> Détail par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : **le motif n'était pas neuf, il était SEUL**. Capsules Massimo,
> capsules Papa et galaxie portaient **trois copies** du même groupement — dont deux identiques à
> l'octet, recopiées d'une app à l'autre. Une brique partagée par copier-coller n'est pas
> partagée : elle est dupliquée, et deux copies finissent toujours par diverger. C'est l'angle mort
> que l'`adr-0053` avait nommé, retrouvé intact un mois plus tard.

---

## ⬆️ REMONTÉ de l'élagage du chantier « la file cesse d'enterrer ce qu'il vient d'écrire » (PR #127, squash `9a0e800`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0056 ✅ ·
> `TROUBLESHOOTING.md` §`feat/la-file-cesse-d-enterrer` (**5 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.86.0** ✅ · 4ᵉ contrôle — dette du mélange du jour remontée ci-dessus.
> Détail par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : **le sabotage le plus instructif de la journée**. En ajoutant une
> clause d'échéance au filtre du quota, le verrou « matière » restait **VERT** — ses cartes sont
> dues, il ne pouvait pas voir la différence — et **seul** le verrou « chapitre » rougissait, parce
> que le deck chapitre sert des cartes **non dues**. Un chantier qui n'aurait écrit que le premier
> verrou aurait laissé passer la régression la plus probable. *Un verrou d'ordre a besoin d'un
> jumeau sur un décor où la règle voisine ne s'applique pas.*

---

## ⬆️ REMONTÉ de l'élagage du chantier « les deux étapes qui manquent » (PR #126, squash `4910f4b`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0055 ✅ (avec son addendum §4 du
> 2026-08-14) · `TROUBLESHOOTING.md` §`feat/les-deux-etapes-qui-manquent` ✅ ·
> `CHANGELOG.md` **0.85.0** ✅ · 4ᵉ contrôle — dettes remontées dans la section active ci-dessus.
> Détail par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : le **signal d'alarme écrit dans l'ADR a sonné le jour même de la
> livraison**. Il annonçait *« l'occasion est détectée sur presque toutes les leçons → l'heuristique
> est trop large »* — mesurée, elle répondait vrai sur **27 fiches sur 27**. Deux resserrages ont
> suivi dans la journée, jusqu'à **4 sur 27**. ⚠️ Et la première mesure de contrôle a dû être
> refaite : une requête SQL **approximait** la règle au lieu de l'exécuter. *Une heuristique jugée
> sur des exemples inventés ne prouve rien.*

---

## ⬆️ REMONTÉ de l'élagage de la slice 4 « la fiche vit dans le temps » (PR #125, squash `845b427`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0054 ✅ ·
> `TROUBLESHOOTING.md` §`feat/la-fiche-vit-dans-le-temps` (**10 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.84.0** ✅ · 4ᵉ contrôle — dettes remontées dans la section active ci-dessus.
> Détail par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : le chantier a **désamorcé une mine déjà armée** — le bouton de
> `CoursPage`, inconditionnel, ouvrait l'atelier sur une leçon déjà fichée et y créait une v2
> **vide** qui masquait la fiche finie. Massimo perdait sa fiche en cliquant sur un bouton qui
> promettait de la faire. ⚠️ Et **l'étape 6 de la clôture a attrapé deux chiffres hérités faux**
> (3 pièges attribués à la mauvaise fiche, 3 cartes annoncées pour 7) — la vérification datée du
> lendemain visait moins de la moitié des cartes concernées.

---

## ⬆️ REMONTÉ de l'élagage de la slice 3 « le pont SRS et les pièges » (PR #124, squash `9cda7b5`)

> Le récit est retiré : **les quatre contrôles passent.** ADR-0015 §13 ✅ ·
> `TROUBLESHOOTING.md` §`feat/fiche-de-massimo-slice-3` (**7 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.83.0** ✅ · 4ᵉ contrôle — dettes remontées ci-dessus. Détail par
> `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : un **sabotage resté VERT** y a montré que `schedule_review` n'était
> exercée par **aucun** test — « 1257 → 1257, zéro test touché » ne prouvait donc rien. *« Zéro
> test touché » peut vouloir dire « comportement non observé ».*

## ⬆️ REMONTÉ de l'élagage de la slice 2 « l'essentiel et les définitions » (PR #123, squash `b905ffd`)

> Le récit est retiré : **les quatre contrôles passent.**
> ADR `adr-0015-addendum-fiche-de-massimo.md` (§8-§9) ✅ ·
> `TROUBLESHOOTING.md` §`feat/fiche-de-massimo-slice-2` (**6 sous-sections**) ✅ ·
> `CHANGELOG.md` **0.82.0** ✅ · 4ᵉ contrôle — **neuf dettes étaient encore ouvertes**, toutes
> remontées dans « DETTES OUVERTES » ci-dessus. Une seule a été RÉSOLUE par la slice 3 :
> `new_fiches_count`. Le détail se retrouve par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : la slice 2 a livré l'écran 2 (une tuile par leçon, 4 états) parce
> qu'une **question posée devant l'écran** — *« je n'arrive pas à retrouver comment voir ces
> fiches »* — a montré qu'un travail commencé n'apparaissait nulle part. Aucun test ne pouvait le
> dire : un brouillon n'est pas une fiche, et la liste était fiche-centrée.

## ⬆️ REMONTÉ de l'élagage de la slice 1 « la fiche de Massimo » (PR #122, squash `1b78f3d`)

> Le récit est retiré : **les quatre contrôles passent.**
> `docs/decisions/adr-0015-addendum-fiche-de-massimo.md` ✅ ·
> `TROUBLESHOOTING.md` §`feat/fiche-de-massimo` (**14 sous-sections**, comptées ici) ✅ ·
> `CHANGELOG.md` **0.81.0** ✅ · 4ᵉ contrôle — **six dettes étaient encore ouvertes**, elles sont
> remontées dans « DETTES OUVERTES » de la section active ci-dessus (glisser au doigt,
> `new_fiches_count`, commentaire de `coverage.py`, entrée `CoursPage`, veto d'un cours, linter
> Python). Le détail se retrouve par `git log -p MEMORY.md`.
>
> Ce qui ne survit qu'ici : le chantier a compté **huit** lecteurs d'une table là où son cadrage
> en annonçait trois — et **sept défauts sont sortis en REGARDANT L'ÉCRAN**, dont cinq invisibles
> à 2 700 tests verts. C'est la justification vivante du `WORKFLOW.md §5bis`.
> ⚠️ Le piège de `git branch -r` s'y est rejoué pour la **sixième** fois d'affilée.

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
- 🔴 **HUIT branches de chantier sont conservées** (neuf avec `feat/anti-triche-diagnostic`). Le
  dépôt a `delete_branch_on_merge: false`. **Aucune n'est à supprimer sans consigne**, et leurs noms
  se ressemblent assez pour qu'un `git branch -d` distrait fasse le mauvais.
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
- ⚠️ **Le worker de production TOURNE** (relancé le 2026-08-09 par `scripts/with-worker.sh`, via l'entrée `backend` de `launch.json`). ⚠️ **2 PID est NORMAL** — RQ fork son scheduler.
  ⚠️ **Sans lui, un lot lancé depuis la Couverture reste `queued` INDÉFINIMENT.**
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
> `adr-0028-addendum-kpi-a-renforcer.md` ✅, `TROUBLESHOOTING.md` §`feat/kpi-a-renforcer` ✅,
> `CHANGELOG.md` 0.51.0 ✅ — mais ses « résidus » enterraient quatre constats **encore vrais**,
> revérifiés un par un à la clôture.

- ⚠️ **Deux incohérences pré-existantes de `.claude/launch.json`.** `massimo` (:5173) et `papa`
  (:5174) portent `autoPort: true` alors que le `cors_origins` **par défaut** du backend est
  exactement 5173/5174 — un glissement de port casserait le CORS **sans message clair**. Et
  `massimo-dev2` / `papa-srs` réclament tous deux le port **5177**. Signalé deux fois, jamais traité.
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
  `adr-0036-addendum-file-sans-consommateur.md` fige cinq règles déjà livrées ; il n'a donc jamais pu
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
> `adr-0028-addendum-kpi-a-renforcer.md` ✅ · `TROUBLESHOOTING.md` §`feat/kpi-a-renforcer` ✅ ·
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
> `adr-0036-addendum-file-sans-consommateur.md` ✅ · `TROUBLESHOOTING.md` §`fix/file-de-production`
> ✅ · `CHANGELOG.md` 0.48.0 ✅ · **rien d'ouvert** dans la section retirée — les deux dettes 🔴
> qu'elle nommait en « prochain pas » (fenêtre de la branche `flat`, `CHANGELOG` muet sur #82/#83)
> étaient **déjà** dans DETTES OUVERTES, vérifié avant suppression. Ce qui s'y trouvait d'utile et
> qui ne survit qu'ici : le chantier a été **découpé en trois commits vérifiés chacun sur son propre
> état**, et ce découpage a révélé un couplage (`useRunProgress` demandait `started_at` au commit 1
> sans l'utiliser) que la seule vérification finale n'aurait jamais montré.

> **2026-08-05 — le panneau d'analyse par matière** (PR #83, squash `cb59600`), section retirée à
> la clôture du 2026-08-05. Contrôles : ADR `adr-0028-addendum-analyse-par-matiere.md` ✅ ·
> `TROUBLESHOOTING.md` §`feat/analyse-matiere` ✅ · **`CHANGELOG.md` — ❌ à la clôture, ✅ depuis le
> 2026-08-05** : l'entrée manquante avait été remontée en dette, elle a été **rétro-inscrite en
> 0.46.2** depuis les sources · ce qui restait ouvert : **deux dettes PAYÉES** par le chantier
> suivant, le reste déjà dans « DETTES OUVERTES ».

> **2026-08-04 — les deux bandeaux** (PR #78 `4458574`, PR #79 `c02a555`), section retirée à la
> clôture suivante après les quatre contrôles : ADR `adr-0029-addendum-galaxie-dans-le-bandeau.md`,
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
