# Addendum ADR-0030 — le témoin du Diagnostic, et l'exception assumée à « NOUVEAU jamais DÛ »

## Statut

**Accepté — 2026-08-08.** Décision du **commanditaire**, prise après que l'objection lui a été
exposée en toutes lettres et **réaffirmée**.

> **AMENDE l'`adr-0030` Décision 1** en y créant une **exception nommée**, et **RÉVOQUE
> l'`adr-0044` Décision 7**, acceptée le matin même, qui concluait « Diagnostic reste SANS témoin
> de nouveauté ».
>
> ⚠️ **Ce n'est pas une clarification, c'est une exception.** Elle est écrite parce qu'une règle
> qu'on enfreint sans le dire cesse d'être une règle pour tout le monde.

## Ce qui est décidé

**L'entrée « 🧭 Diagnostic » de la sidebar de Massimo porte un témoin numérique.**

- Il **compte** les diagnostics **relus par Papa que Massimo n'a pas encore passés**.
- Il **s'éteint par le travail** — quand Massimo a passé le diagnostic et envoyé ses réponses —
  et **non par le regard**.
- Il affiche un **nombre**, comme les six témoins existants.

## 🔴 La règle que cette décision enfreint, mot pour mot

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

## Le contre-motif, maintenu au dossier

Il ne disparaît pas parce qu'il a été écarté :

- `CLAUDE.md` §gamification interdit la **pression quotidienne anxiogène** et tout **capital qu'on
  peut perdre**. Le streak a été retiré le 2026-07-27 pour ce motif exact : *« un capital qu'on
  peut perdre fait venir par peur de perdre, ce n'est pas de l'auto-motivation »* ;
- un nombre qui **grandit pendant une absence** est la forme la plus directe de ce capital ;
- l'`adr-0044` Décision 1 avait répondu autrement au même besoin : la carte « commence par là »
  **est** le signal d'arrivée, et elle ne montre qu'**un** diagnostic à la fois — donc rien ne
  s'accumule pendant une absence.

## Ce qui n'a PAS motivé la décision : le coût

Il faut le dire, parce que l'inverse serait un argument confortable et faux.

**La forme interdite est gratuite ; la forme légale coûte une table.** Depuis l'`adr-0044`
Session A, `taken_at` existe sur le contrat de liste : « les diagnostics relus que Massimo n'a pas
passés » se compte **sans aucune migration**, sans table de traces de vue, sans route nouvelle —
un champ de plus dans `GET /api/student/news/summary`. Un témoin qui s'éteindrait au **regard**
exigerait au contraire une table sur le modèle de `mindmap_views`.

**L'arbitrage est donc de valeurs, pas de coût**, et il appartient au commanditaire.

## Bornes

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

## Le signal qui dirait qu'on s'est trompé

- **Massimo évite la page Diagnostic** alors que le compteur monte — le badge serait devenu ce
  qu'il fuit. Réponse : le retirer, pas l'atténuer.
- **Il passe des diagnostics pour éteindre la pastille**, et non parce qu'il veut savoir. Ce serait
  visible à la qualité : des passations rapides et creuses, sur le diagnostic le plus court plutôt
  que celui que la page propose.
- **Le compteur dépasse durablement 3 ou 4** : ce ne serait plus un signal mais un arriéré, et le
  robinet est chez Papa.
- ⚠️ Aucun de ces trois signaux n'est mesuré aujourd'hui. **Ils se regardent, ils ne s'alertent
  pas** — ce qui est cohérent avec le reste, mais veut dire que la vérification est humaine.

## Mise en œuvre

- Le compteur se calcule sur des colonnes **existantes** — aucune migration.
- Il rejoint `GET /api/student/news/summary` (`adr-0030` §5 : **un seul appel, aucune horloge**).
- `navigation.ts` : `/diagnostic` reçoit un `newsKey`. Le commentaire de `NavItem.newsKey` et le
  test-verrou `navigation.test.ts` doivent être **réécrits pour dire l'exception**, jamais
  simplement élargis — sans quoi la prochaine session complètera la liste « par symétrie
  apparente », ce que ce test existe précisément pour empêcher.
- **Livraison : Session C** du chantier `adr-0044`.

## Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (Décisions 1 et 2 — la règle amendée)
- `docs/decisions/adr-0044-la-page-diagnostic-propose-au-lieu-de-lister.md` (Décision 7, révoquée)
- `CLAUDE.md` §Règles gamification (le contre-motif)
