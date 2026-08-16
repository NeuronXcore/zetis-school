---
id: "0060"
titre: "La surface se décide devant l'écran"
type: architecture
statut: propose
date: 2026-08-16
pr: null
revoque: []
revoque_par: []
refs: ["0011", "0024", "0025", "0031", "0032", "0038", "0044", "0048", "0055"]
---

# ADR-0060 — La surface se décide devant l'écran

## Statut

Proposé — 2026-08-16. **N'amende aucune décision produit.** Il amende la **méthode** :
`docs/WORKFLOW.md` §2 (le rituel de cadrage) et §7 (le garde-fou méta).

> Premier ADR à porter un front-matter (Phase 1bis du plan de réorganisation du registre).
> Il ne rouvre ni le mono-chantier, ni le hors-périmètre, ni le stop-on-blocker, ni le
> read-before-code — les quatre tiennent et ne sont pas en cause.

## Contexte

Le `WORKFLOW.md` §1 pose que le goulot n'est plus d'écrire le code mais de **décider** en amont
et de **vérifier** en aval. Le rituel qui en découle — ADR/maquette → spec → prompt, dans une
session à part, sur `main`, sans une ligne de code — repose sur une hypothèse implicite :

> l'information nécessaire à la décision **existe avant de coder**.

Pour un contrat, un résolveur, une frontière, un gate, c'est vrai — et ça se voit : l'ADR-0011 et
l'ADR-0037 n'ont pratiquement pas bougé depuis leur écriture, et le résolveur canonique a supprimé
une classe entière de bugs.

**Pour un écran, c'est faux.** L'information décisive n'existe qu'après l'avoir regardé, sur des
données réelles. Écrire l'ADR avant produit alors ce que le §2bis reproche justement à l'ADR écrit
pendant la session de code : *« un ADR écrit dans la session qui code cesse d'être une contrainte
pour devenir une justification »*. Le piège a été vu dans un sens, pas dans l'autre.

### Read-before-code — ce que le registre montre, mesuré le 2026-08-16

| Constat | Valeur |
|---|---|
| Décisions en six semaines (01/07 → 15/08) | 59 |
| Fichiers dans `docs/decisions/` | 104 |
| Addendums | 46 (44 %) |
| ADR-0024 | **7 addendums, dont 5 le même jour** (31/07) |
| ADR-0025 | 7 addendums |

Quatre révocations qui datent leur propre échec :

- **ADR-0024 §B et §C** : révoqués **le jour de leur écriture**.
- **XP par matière** : *retiré* le 01/08 au nom du §5 (addendum `index-notions`), *réintroduit* le
  11/08 « en révisant une lecture » du **même §5** (addendum `onglets`). Dix jours, deux lectures
  opposées d'une même règle.
- **Le gel d'A1** : affirmé par l'addendum ADR-0031 (« et il ne bouge pas »), révoqué par
  l'ADR-0032 **le même jour**.
- **ADR-0038** : trois de ses quatre non-objectifs tombent **en 24 heures**.

Et le cas qui tranche, parce qu'il nomme lui-même sa source — addendum `onglets` §2 bis :

> *« Décision née de la relecture visuelle du 2026-08-11, sur données réelles. Aucun test ne
> l'avait vue »* — l'anneau rendait un **disque gris à 97,5 %** sur SVT (78 notions « à découvrir »
> sur 80), soit un cadrage de perte sur une surface enfant.

**Cette décision était impossible à prendre au cadrage.** Il fallait des données réelles sur un
écran réel. Ce n'est pas de l'indiscipline : c'est le rituel appliqué là où il ne peut pas produire
d'information.

### ⚠️ Le confondant, nommé avant la décision

Les ADR récents (0042→0059) accumulent peu d'addendums. **Ce n'est pas une preuve** : ils ont une
à deux semaines de vie, l'ADR-0024 en a trois. La corrélation « cadré en avance → révoqué » est
**plausible et non établie**. Cet ADR est donc écrit avec sa propre mesure de réfutation (voir
« Le signal »).

## Alternatives considérées

**1. Ne rien changer — le §7 suffit.** Écarté : le §7 dit déjà « ne sur-applique pas la méthode »,
et 59 décisions en six semaines — dont des arbitrages entre ✏️ et ✍️ — montrent qu'un garde-fou
**sans critère** ne tient pas. Une règle qu'on enfreint sans le dire cesse d'être une règle.

**2. Supprimer les ADR de surface.** Écarté : ce sont d'excellentes specs, et elles portent des
**mesures** qu'aucun autre document ne porte (193 px pour 151 disponibles, contraste 2,81:1,
rangs 153-159 sur 159). Les supprimer perdrait la seule trace de ce qui a été vu.

**3. Cadrer la surface sans maquette, directement en slice.** Écarté : la maquette **est** ce qui
fait décider. Les neuf wireframes du 11/08 ont produit quatre décisions et un refus argumenté.
Elle reste en amont.

**4. Drapeaux de fonctionnalité et déploiement progressif.** Sans objet : un seul utilisateur, pas
d'environnement distant.

## Décision

### 1. Deux natures de changement, séparées par un critère vérifiable — pas par un jugement

| Nature | Critère | Rituel |
|---|---|---|
| **Décision** | fixe un contrat, une frontière ou une doctrine · **ou** touche une donnée persistée (migration) · **ou** son annulation coûte plus d'un commit | **ADR AVANT le code.** Rituel actuel, inchangé |
| **Surface** | ne change qu'un rendu, un libellé, un gabarit ou un ordre d'affichage · aucune migration · s'annule en un commit | maquette → slice → **écran regardé** → **ADR APRÈS** |

Le critère se vérifie en deux questions fermées : *y a-t-il une migration ?* et *l'annulation
coûte-t-elle plus d'un commit ?* Deux « non » ⇒ surface. Un « oui » ⇒ décision.

> **Ce n'est pas une hiérarchie.** La surface est l'endroit où vit la doctrine anti-anxiété, donc
> l'endroit où les règles sont les plus strictes. Elle change de **moment**, pas d'exigence.

### 2. L'ADR de surface est un compte rendu, et il porte ce que l'écran a démenti

Un ADR écrit après coup qui ne ferait que décrire ce qui a été codé serait la justification que le
§2bis condamne. Pour ne pas en devenir une, il porte **obligatoirement** une section
« **Ce que l'écran a démenti** » — les hypothèses de la maquette qui n'ont pas survécu au rendu
réel. Si cette section est vide, c'est que la relecture visuelle n'a pas eu lieu, et l'ADR n'est
pas écrivable.

### 3. La voie sans ADR, bornée par trois conditions cumulatives

Aucun ADR n'est requis si le changement est **réversible en un commit**, **sans migration**, et
**ne modifie aucun texte vu par Massimo**. Dans ce cas : une entrée `CHANGELOG` et un test, rien
de plus.

> La troisième condition n'est pas décorative. Un libellé côté enfant est régi par la doctrine de
> `CLAUDE.md` ; c'est précisément là que « À renforcer » est né et que « Mission de Papa » a dû
> être retiré. Un mot vu par Massimo n'est jamais un détail de rendu.

### 4. `/slice` ne change pas

La cage — graphify, read-before-code, stop-on-blocker, non-régression — s'applique identiquement
aux deux voies. Elle porte la seule faute qu'aucun outil ne verra jamais : *un test existant
modifié pour passer*.

## Périmètre

**Dans :** `docs/WORKFLOW.md` §2 et §7 · `.claude/commands/cadrage.md` (la question « décision ou
surface ? » en première ligne) · `.claude/commands/ouverture.md` (un chantier `chore/` est
dispensé d'ADR) · `CLAUDE.md` (la liste des commandes, qui ignore `/cadrage` depuis sa création).

**Hors :** les 59 décisions existantes — aucune n'est reclassée rétroactivement. Le classement
`type:` du front-matter est indicatif, il ne rejuge rien. La réorganisation du registre
(Phase 1bis) est un chantier distinct.

## Conséquences

**Positives.** La décision de surface s'écrit là où l'information est. Le nombre d'addendums de
révocation devrait baisser. Le registre cesse de mélanger ce qui contraint et ce qui décrit.

**Négatives, et nommées.**

- 🔴 **L'ADR de surface arrive après le merge**, donc dans la zone où le corpus oublie déjà le
  plus (l'étape 4bis, oubliée six fois). **Borne : il s'écrit dans la MÊME session que la
  relecture visuelle, jamais reporté au lendemain.** Une décision différée deux fois n'est pas une
  décision, c'est un trou — l'addendum ADR-0015 §13 l'a écrit avant moi.
- Entre le merge et le compte rendu, une décision de surface n'est écrite nulle part. La fenêtre
  est bornée à une session ; elle n'est pas nulle.
- Le critère peut être contourné en déclarant « surface » un changement qui touche un contrat.
  Rien ne l'empêche mécaniquement — sauf la question « y a-t-il une migration ? », qui est
  vérifiable par un tiers.

## Le signal qui dirait qu'on s'est trompé

**Mesure à refaire le 2026-09-16** — un mois, pour que les ADR 0042→0059 aient l'âge qu'avait
l'ADR-0024 au moment de ce constat :

> Si les ADR 0042→0059 ont accumulé, à âge égal, **autant d'addendums de révocation** que
> l'ADR-0024, alors l'explication de cet ADR est fausse : la cause n'était pas l'ordre du cadrage
> mais l'ancienneté. **Cet ADR passe alors « Abandonné »**, et le rituel unique est rétabli.

Deuxième signal, qualitatif : si un compte rendu de surface est écrit avec une section « ce que
l'écran a démenti » **vide ou générique**, la borne du §2 a sauté et la voie est devenue une
justification a posteriori.

## Suivi

- La mesure du 2026-09-16 se fait avec `scripts/adr_lib.py` (addendums par parent croisés avec la
  date du parent) — elle n'est pas à réinventer.
- **Numérotation** : cet ADR prend le 0060 parce qu'il est écrit le premier. Les deux ADR prévus
  au plan de correctifs se décalent — jeton de ressource média → **0061**, fermeture des lacunes →
  **0062**.
- `DECISIONS.md` n'est pas édité à la main : il se régénère avec
  `scripts/gen_decisions_index.py --write`.
