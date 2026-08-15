# Addendum ADR-0030 — le témoin de Matières, et les bornes des trois nouveaux témoins

## Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**.

> **AMENDE l'`adr-0030` §3**, qui rangeait Matières parmi les entrées « sans badge, et ce n'est pas
> un oubli », au motif que *« Matières est un hub : ce qui arrive (fiches, capsules, cartes) a déjà
> son entrée, un badge ici doublerait les autres »*.
>
> **Ce document porte aussi les quatre bornes transverses B1–B4** communes aux trois témoins
> ajoutés le même jour (Matières, ELI5, Quiz). Elles sont écrites **une seule fois**, ici : trois
> copies d'une même borne divergent, c'est le motif du regroupement.

## Ce qui est décidé

**L'entrée « 📚 Matières » de la sidebar de Massimo porte un témoin numérique.**

Il compte les **cours validés de l'année active que Massimo n'a jamais ouverts**.

- Il **naît** de la validation d'une leçon par Papa.
- Il **meurt d'un regard** — le premier `GET /api/student/lessons/{id}/cours`.
- Il ne connaît **aucune date** : ni `created_at`, ni `validated_at`, ni échéance.

Il reste donc **entièrement dans la colonne « Nouveauté »** du test du §1. Contrairement au témoin
du Diagnostic, il n'est **pas** une exception et n'en demande aucune.

## Le motif du §3 était faux, et voici où

Le §3 range le **cours** avec ses **dérivés**.

Fiche, capsule, mindmap et carte SRS sont *produites à partir* d'un cours validé — c'est la
définition même du substrat canonique (`adr-0011`). Le cours est l'**original**. Dire qu'un témoin
sur Matières « doublerait les autres » revient à dire qu'un original double ses copies.

Concrètement, le témoin de Matières est le **seul** qui s'allume quand Papa valide une leçon dont
aucun dérivé n'a encore été produit — c'est-à-dire le cas normal, puisque la production des dérivés
vient après. Il n'y a pas de doublon : il y a un maillon qui manquait.

**La partie juste du §3 est conservée** : Matières est bien un hub, et le témoin ne compte donc
**pas** ce qui a déjà son entrée. Il ne compte que le cours.

## Bornes de ce témoin

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

## Bornes transverses B1–B4 — communes à Matières, ELI5 et Quiz

Trois entrées gagnent un témoin le même jour. Ce qui suit s'applique aux trois, et les addenda
`adr-0030-addendum-temoin-eli5.md` et `adr-0030-addendum-temoin-quiz.md` **citent ces bornes par
référence au lieu de les recopier**.

### B1 — `DEROGATIONS` ne bouge pas, et c'est la preuve que ceci n'est pas une porte ouverte

Le registre `DEROGATIONS` de `test_news_doctrine.py` reste **`{"diagnostic"}`**, et le test-verrou
« une seule exception meurt du travail » n'est **pas touché**.

Les trois témoins ajoutés meurent tous d'un **regard**. Aucun n'a demandé de dérogation, aucun
n'entre dans la colonne interdite du §1. L'`adr-0030` §1 sort de ce chantier **intact**.

C'est le critère à opposer au prochain candidat : *ce témoin a-t-il besoin d'une dérogation ?* Si
oui, ce n'est pas la suite de ce chantier, c'est la suite de l'addendum Diagnostic — et il faut une
décision du commanditaire, pas une symétrie.

### B2 — Un témoin doit pouvoir atteindre ZÉRO

Toute unité comptée doit être **atteignable par le geste qui l'éteint**.

Formulée parce que le cadrage l'a rencontrée : 50 leçons validées sans contenu, que le badge aurait
comptées et qu'aucun clic n'aurait pu décrémenter. Un compteur immortel est pire qu'un compteur
absent — il apprend à ne plus regarder l'entrée.

Un test-verrou porte cette borne (N2).

### B3 — Le plafond reste `9+`, et il sera saturé au début

L'`adr-0030` §6 plafonne l'affichage à `9+`. **Le plafond n'est jamais relevé en compensation**
d'un compteur trop gros : ce serait transformer le témoin en compteur d'arriéré visuel.

Deux des trois témoins démarrent à **zéro** grâce au point zéro (voir les addenda ELI5 et Quiz).
Le troisième, Matières, démarre à **32** — donc `9+` — pour la raison exposée en borne 6.

**Le signal qui dirait qu'on s'est trompé** : le témoin de Matières affiche encore `9+` dans deux
mois. On **retire le témoin, ou on restreint sa population** ; on ne monte jamais le plafond.

### B4 — Dix entrées sur treize porteront un témoin, et la partition est totale

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

## Ce que ce chantier ne fait pas

- Il **ne rouvre pas** le §1 (la règle) ni le §2 (un badge exige une trace de vue). Le §2 est au
  contraire *payé* par les deux tables neuves d'ELI5 et Quiz.
- Il **ne touche pas** au témoin `diagnostic` ni à son addendum.
- Il **ne touche pas** au `new_count` de récence d'ELI5, qui reste en page.
- Il **n'ajoute aucune entrée** de navigation. `MASSIMO_NAV` garde treize entrées et `/galaxy` reste
  à son index — l'`adr-0024` §1 interdit le 6ᵉ onglet, et ajouter des témoins n'est pas ajouter des
  onglets.
- Il **ne crée aucun témoin côté Papa** (`adr-0030` §7 : ce que porte sa sidebar est une file de
  validation, objet distinct).

## Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§1, §2, §3 — le §3 amendé ici)
- `docs/decisions/adr-0030-addendum-temoin-eli5.md`
- `docs/decisions/adr-0030-addendum-temoin-quiz.md`
- `docs/decisions/adr-0025-addendum-le-regard-vit-a-l-agenda.md`
- `docs/decisions/adr-0030-addendum-temoin-diagnostic.md` (l'exception, qui reste seule — B1)
