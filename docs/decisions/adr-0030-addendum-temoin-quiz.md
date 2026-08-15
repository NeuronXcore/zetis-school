# Addendum ADR-0030 — le témoin du Quiz, et un témoin qui naît d'une production

## Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**.

> **AMENDE l'`adr-0030` §3** (entrée « Quiz » de la liste des absences motivées) et le motif
> **rebasé par l'`adr-0044` §7** qui l'avait remplacé.
>
> 🔴 **C'est le plus lourd doctrinalement des trois addenda du jour**, parce qu'il élargit la
> définition de ce qui fait naître un témoin. Le point est écrit ici pour ne pas être noyé.

## Ce qui est décidé

**L'entrée « ✅ Quiz » de la sidebar de Massimo porte un témoin numérique.**

Il compte les **quiz jouables que Massimo n'a jamais OUVERTS**.

- Il **meurt d'un regard** — la première ouverture du quiz.
- 🔴 Il **ne meurt jamais du travail** : abandonner un quiz sans répondre l'éteint quand même, et
  le passer entièrement ne l'éteint pas davantage. `QuizAttempt` n'entre nulle part.

## Les deux motifs d'exclusion, et pourquoi aucun ne tient plus

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

### 🔴 Papa n'est plus le robinet

La borne 2 de `adr-0030-addendum-temoin-diagnostic.md` — *« le compteur ne compte que du RELU ;
Papa reste le robinet, c'est la seule régulation de volume du dispositif »* — **ne s'applique pas
ici**. Aucun humain ne module ce compteur : la seule régulation est le **rythme de production**.

C'est une perte de contrôle réelle, assumée, et à surveiller (borne 4).

## Bornes

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
7. **Bornes transverses B1–B4** : voir `docs/decisions/adr-0030-addendum-temoin-matieres.md`.

## Alternative écartée

**Compter les quiz jamais JOUÉS** (sur le modèle du témoin Diagnostic) — zéro migration, puisque
`QuizAttempt.completed_at` existe. Écartée : ce serait une **deuxième** exception à « NOUVEAU jamais
DÛ », donc un compteur qui grossit quand Massimo ne vient pas, sur l'entrée la plus proche de
l'évaluation. L'exception du Diagnostic est bornée par « une seule entrée » ; l'étendre au Quiz
reviendrait à dire que la règle n'en est plus une. La forme légale coûte une table ; elle est payée.

## Le signal qui dirait qu'on s'est trompé

- **Le badge monte pendant que Massimo ne joue pas** : le rythme de production dépasse son usage.
  Réponse : gater la production (borne 4), pas le badge.
- **Massimo ouvre des quiz sans les faire, pour éteindre la pastille.** Ce serait visible à des
  ouvertures suivies d'abandons immédiats. ⚠️ Ce comportement est *toléré par construction* — le
  témoin meurt de l'ouverture — et c'est le prix de la borne 1.
- **Le badge ne bouge jamais** : plus rien n'est produit, et le défaut est dans le worker.
- ⚠️ Aucun des trois n'est mesuré. Ils se regardent, ils ne s'alertent pas.

## Mise en œuvre

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

## Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§1, §3 — amendé ici)
- `docs/decisions/adr-0044-la-page-diagnostic-propose-au-lieu-de-lister.md` (§7 — le motif rebasé)
- `docs/decisions/adr-0030-addendum-temoin-diagnostic.md` (l'exception, qui reste seule — B1)
- `docs/decisions/adr-0030-addendum-temoin-matieres.md` (bornes transverses B1–B4)
