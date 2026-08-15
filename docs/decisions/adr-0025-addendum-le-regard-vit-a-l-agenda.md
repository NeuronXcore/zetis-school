# Addendum ADR-0025 — le regard vit à `/agenda`, et nulle part ailleurs

## Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**, prise après diagnostic du défaut à l'écran.

> **RÉVOQUE la Décision validée n°2 de l'`adr-0025-addendum-temoin-nouveaute-agenda`** en ce qui
> concerne ses **deux points d'écriture** (§12.3, premier tiret). Le témoin de l'agenda n'est plus
> marqué vu au rendu du bandeau d'Accueil ; seule l'ouverture de `/agenda` l'éteint.
>
> ⚠️ **C'est une révocation d'une décision commanditaire vieille de quatorze jours**, écrite comme
> telle. Le §12.3 n'était pas une inadvertance : il argumentait ses deux surfaces.

## Ce qui est décidé

**`POST /api/student/agenda/seen` n'est plus appelé qu'à l'ouverture de `/agenda`.**

Le bandeau d'Accueil (`HomeAgendaBanner`) cesse de marquer l'agenda vu.

## Le défaut, mesuré

Le témoin de l'agenda est livré, correct côté serveur (`agenda/service.py::new_agenda_count`), et
**n'a jamais été vu par personne**.

Massimo atterrit sur l'Accueil. `HomeAgendaBanner` se monte, charge ses deux listes, et appelle
`markAgendaSeen()` dans son `finally` — donc **avant** que le badge de la sidebar ait fini de
s'afficher, et le `notifyNewsChanged()` qui suit force le recalcul à zéro dans les 400 ms.

Le composant l'écrivait lui-même, en commentaire, à la livraison :

> *« Conséquence assumée, pas un défaut — Massimo arrive sur l'Accueil par défaut, donc le badge
> Agenda n'y vit que quelques centaines de millisecondes. »*

La conséquence était donc **prévue et acceptée**. Ce que le §12.3 n'avait pas mesuré, c'est
qu'elle ne laisse au témoin **aucun cas d'usage réel** : l'utilité résiduelle envisagée — « Papa
saisit pendant que Massimo est déjà dans l'app » — suppose que Massimo soit déjà ailleurs que sur
l'Accueil **et** qu'il ne repasse pas par l'Accueil avant d'aller voir. Sur une app dont l'Accueil
est le point de retour, c'est un cas de bord, pas un usage.

## Le motif qui renverse le §12.3

Le §12.3 justifiait ses deux surfaces ainsi :

> *« Écrit à `now()` à l'ouverture de `/agenda` et au rendu du bandeau d'Accueil — les deux surfaces
> où Massimo lit ce qui est arrivé. N'en retenir qu'une ferait mentir le badge sur ce qu'il a déjà
> lu. »*

**Le bandeau ne montre pas ce qui est arrivé. Il montre un extrait, et un extrait choisi sur un
autre critère.** Il rend Aujourd'hui / Demain (`bannerItems`) plus une liste à-venir **tronquée**
(`bannerUpcoming`, bornée par `agenda_upcoming_horizon_days` et `agenda_upcoming_max`). Le témoin,
lui, compte ce qui est **arrivé depuis le dernier regard**, sans aucune considération d'échéance.

Les deux ensembles ne coïncident pas : un devoir saisi ce matin pour dans trois semaines est
**nouveau** et **absent du bandeau**. Le §12.3 marquait donc vu ce que Massimo n'avait pas pu lire.

Il ment dans les deux sens ; le sens qu'on corrige est celui qui rend le témoin inutile.

## Le contre-motif, maintenu au dossier

Il ne disparaît pas parce qu'il a été écarté :

- **Lire le bandeau EST un regard partiel.** Après cette décision, Massimo peut voir ses trois
  échéances du jour sur l'Accueil et garder un badge allumé sur l'entrée Agenda. Le badge dira
  « il y a du nouveau » alors qu'une partie a bien été lue.
- C'est le prix assumé, et il est le **moindre des deux** : un badge qui reste allumé de trop
  invite à ouvrir une page ; un badge qui s'éteint avant d'exister n'invite à rien.

## Bornes

1. **Un seul point d'écriture** — `useAgenda`, à l'ouverture de `/agenda`. Un test compte les
   appelants côté client (miroir du test qui les compte déjà côté routeur dans `test_agenda.py`).
2. **§12.1, §12.2, §12.4 et §12.5 ne sont PAS rouverts** — le test qui sépare nouveauté et arriéré,
   le badge chiffré, l'interdiction du compteur d'items non faits, et le fait que le badge retombe
   à zéro et y reste toute la semaine, échéances en cours comprises.
3. **La granularité ne bouge pas.** `agenda_last_seen_at` reste **un horodatage par élève**, jamais
   un `seen_at` par item. Le §12.3 est amendé sur **qui écrit**, pas sur **quoi est écrit** : c'est
   cette granularité qui empêche la donnée « vu le 12, jamais fait » d'exister.
4. **Aucune surface ne devient un regard sans amender ce document.** En particulier, *afficher* le
   nombre ailleurs (bandeau, en-tête, Accueil) ne marque rien. La règle est désormais : **marque vu
   la surface qui montre TOUT ce qui est arrivé**, et il n'y en a qu'une.

## Le signal qui dirait qu'on s'est trompé

- **Le badge Agenda reste allumé en permanence** parce que Massimo lit tout sur l'Accueil et
  n'ouvre jamais `/agenda`. Le badge serait alors devenu un décor. Réponse : regarder d'abord si
  le bandeau d'Accueil ne rend pas la page inutile — le défaut serait dans leur composition, pas
  dans le témoin (§12.5).
- **Le badge affiche `9+` durablement** : il ne s'agirait plus de nouveauté mais d'arriéré, et le
  robinet est chez Papa.
- ⚠️ Aucun des deux n'est mesuré. Ils se regardent, ils ne s'alertent pas.

## Mise en œuvre

- `apps/frontend-massimo/src/components/agenda/HomeAgendaBanner.tsx` : l'appel `markAgendaSeen()`
  et son commentaire sont retirés, **remplacés par un commentaire qui nomme cette révocation** —
  sans quoi la prochaine session le rétablira au motif du §12.3, qui reste écrit.
- `apps/frontend-massimo/src/hooks/useAgenda.ts` : **inchangé**, c'est désormais le seul appelant.
- `HomeAgendaBanner.test.tsx` : le test est **inversé**. Son titre nomme ce document, et son corps
  conserve l'ancienne raison, barrée. Un test inversé qui ne dit pas pourquoi est un test perdu.
- Le docstring de `lib/agenda.ts::markAgendaSeen` (« Appelée depuis DEUX surfaces, et il en faut
  deux ») est réécrit.
- Le paragraphe « Accès — deux portes » de `docs/frontend-massimo/page-agenda.md` est mis au réel.

## Voir aussi

- `docs/decisions/adr-0025-addendum-temoin-nouveaute-agenda.md` (§12.3, amendé)
- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§1 — la règle, intacte)
- `docs/decisions/adr-0030-addendum-temoin-matieres.md` (bornes transverses B1–B4)
