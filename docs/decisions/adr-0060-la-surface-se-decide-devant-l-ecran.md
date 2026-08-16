---
id: "0060"
titre: "La surface se décide devant l'écran"
type: architecture
statut: propose
date: 2026-08-16
pr: null
revoque: []
revoque_par: []
refs: ["0002", "0011", "0024", "0025", "0031", "0032", "0038", "0043", "0044", "0048", "0055"]
---

# ADR-0060 — La surface se décide devant l'écran

## Statut

Proposé — 2026-08-16. **N'amende aucune décision produit.** Il amende la **méthode** :
`docs/WORKFLOW.md` §2 (le rituel de cadrage) et §7 (le garde-fou méta).

> **Rédaction révisée le jour même — v1 commitée en `380d4d1`, v2 quelques heures plus tard.**
> La première version ne posait que **deux** cas — décision et surface — et le premier usage réel
> l'a démentie avant qu'elle n'ait cadré un seul chantier (voir §Contexte, « ce que le premier
> usage a démenti »).
>
> **Corrigé en place, et non par addendum — le motif de ce choix, puisqu'il déroge à l'usage du
> dépôt :** la v1 n'a jamais été ratifiée (`statut: propose`), n'a produit aucune branche et n'a
> été citée par aucun document. Un addendum aurait figé, dans un registre qui en compte déjà 46,
> la trace d'une règle que personne n'a jamais appliquée. **Ce qui est conservé, c'est le motif de
> l'erreur** — §Contexte et Alternative 2 — parce qu'un motif effacé se réinvente, et celui-ci est
> intuitif : classer par nature d'objet est plus naturel que classer par état de la règle.
>
> ⚠️ **Ce raisonnement ne vaut PAS pour un ADR ratifié ou déjà cité.** Dans ce cas, la révocation
> passe par un addendum et remonte au parent, comme partout ailleurs. La v1 est lisible par
> `git show 380d4d1`.

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

### 🔴 Ce que le premier usage a démenti — le jour de la rédaction

La première version de cet ADR posait **deux** cas, décision et surface, et une règle de
séparation en deux questions fermées (migration ? annulation > 1 commit ?). Trois chantiers ont
été cadrés dans la foulée pour l'éprouver. **Aucun des trois n'entrait dans les deux colonnes :**

| Chantier | Ce qu'il fait | Ce que la v1 en disait |
|---|---|---|
| `chore/registre-adr` | fusionne les addendums, pose un front-matter, régénère l'index | ni décision, ni surface — **rien n'y est décidé** |
| `fix/diagnostics-roles` | pose `require_child` sur une route qui ne l'avait pas | « décision » (ça touche une frontière) — donc **un ADR avant**, pour une règle décidée à l'ADR-0002 il y a six semaines |
| `fix/observation-sorties` | appelle `terminer()` sur les quatre sorties de passation | « décision » aussi, pour un écart à l'ADR-0048 **déjà tranché** |

La v1 aurait donc exigé **deux ADR pour appliquer des règles existantes**, et n'aurait rien su
dire du troisième chantier. Le défaut est identifiable : la v1 classait les changements par
**nature d'objet** (contrat / écran) alors que la question posée est *faut-il écrire une décision,
et quand ?* — qui dépend d'abord de **l'existence** de la règle, pas de la nature de l'objet.

C'est le même motif que celui documenté au §Contexte : une rédaction faite avant l'usage. Elle
est corrigée par l'usage, comme le reste.

### ⚠️ Le confondant, nommé avant la décision

Les ADR récents (0042→0059) accumulent peu d'addendums. **Ce n'est pas une preuve** : ils ont une
à deux semaines de vie, l'ADR-0024 en a trois. La corrélation « cadré en avance → révoqué » est
**plausible et non établie**. Cet ADR est donc écrit avec sa propre mesure de réfutation (voir
« Le signal »).

## Alternatives considérées

**1. Ne rien changer — le §7 suffit.** Écarté : le §7 dit déjà « ne sur-applique pas la méthode »,
et 59 décisions en six semaines — dont des arbitrages entre ✏️ et ✍️ — montrent qu'un garde-fou
**sans critère** ne tient pas. Une règle qu'on enfreint sans le dire cesse d'être une règle.

**2. Deux cas seulement (décision / surface).** Écarté par l'usage, le jour même — voir ci-dessus.
Conservé au dossier parce que c'est l'erreur qu'on refait naturellement : classer par nature
d'objet est plus intuitif que classer par état de la règle.

**3. Supprimer les ADR de surface.** Écarté : ce sont d'excellentes specs, et elles portent des
**mesures** qu'aucun autre document ne porte (193 px pour 151 disponibles, contraste 2,81:1,
rangs 153-159 sur 159). Les supprimer perdrait la seule trace de ce qui a été vu.

**4. Cadrer la surface sans maquette, directement en slice.** Écarté : la maquette **est** ce qui
fait décider. Les neuf wireframes du 11/08 ont produit quatre décisions et un refus argumenté.
Elle reste en amont.

**5. Drapeaux de fonctionnalité et déploiement progressif.** Sans objet : un seul utilisateur, pas
d'environnement distant.

## Décision

### 1. Quatre cas, dans un ORDRE — pas un tableau à double entrée

Les questions se posent **dans cet ordre**, et la première dont la réponse est « oui » tranche.
L'ordre n'est pas décoratif : il place l'**existence de la règle** avant la **nature de l'objet**,
ce qui est exactement l'erreur de la v1.

| # | Question | Cas | ADR |
|---|---|---|---|
| **1** | Est-ce que **rien n'est décidé** — on remet de la documentation ou de l'outillage au réel ? | **Rangement** (`chore/`) | **Aucun** |
| **2** | Est-ce que la règle **existe déjà**, et on la fait respecter là où elle ne l'était pas ? | **Application** (`fix/`) | **Aucun** — on **cite** l'ADR qui la porte |
| **3** | Y a-t-il une **migration** ? Ou l'annulation coûte-t-elle **plus d'un commit** ? | **Décision neuve** (`feat/`) | **AVANT** le code |
| **4** | Sinon — rendu, libellé, gabarit, ordre d'affichage | **Surface** (`feat/`) | **APRÈS** l'écran regardé |

> **Ce n'est pas une hiérarchie.** La surface est l'endroit où vit la doctrine anti-anxiété, donc
> l'endroit où les règles sont les plus strictes. Elle change de **moment**, pas d'exigence.

> ⚠️ **Le cas 2 est celui qu'on rate.** Un chantier qui touche une frontière *ressemble* à une
> décision. Mais poser `require_child` sur une route qui l'avait perdue n'est pas décider :
> c'est **exécuter** l'ADR-0002. Écrire un ADR pour ça, c'est fabriquer une décision là où il n'y
> a qu'une dette — et le registre en porte déjà 104 fichiers.

### 2. L'ADR de surface est un compte rendu, et il porte ce que l'écran a démenti

Un ADR écrit après coup qui ne ferait que décrire ce qui a été codé serait la justification que le
§2bis condamne. Pour ne pas en devenir une, il porte **obligatoirement** une section
« **Ce que l'écran a démenti** » — les hypothèses de la maquette qui n'ont pas survécu au rendu
réel. Si cette section est vide, c'est que la relecture visuelle n'a pas eu lieu, et l'ADR n'est
pas écrivable.

### 3. Même en surface, la voie la plus légère existe — bornée par trois conditions cumulatives

Un changement de **surface** ne demande **aucun** compte rendu s'il est **réversible en un
commit**, **sans migration**, et **ne modifie aucun texte vu par Massimo**. Dans ce cas : une
entrée `CHANGELOG` et un test, rien de plus.

> La troisième condition n'est pas décorative. Un libellé côté enfant est régi par la doctrine de
> `CLAUDE.md` ; c'est précisément là que « À renforcer » est né et que « Mission de Papa » a dû
> être retiré. Un mot vu par Massimo n'est jamais un détail de rendu.

### 4. Ce que le premier message d'une session doit dire

Le cas retenu se déclare **à l'ouverture**, en une ligne, avec sa conséquence :

```
Rappel ADR-0060 : ce chantier est un <rangement | une application | une décision neuve | une surface>.
Donc <aucun ADR> | <aucun ADR — on cite ADR-00XX> | <ADR avant> | <ADR après l'écran>.
```

Sans cette ligne, la session rejoue l'arbitrage à chaque reprise, et le rejoue différemment.

### 5. `/slice` ne change pas

La cage — graphify, read-before-code, stop-on-blocker, non-régression — s'applique identiquement
aux quatre cas. Elle porte la seule faute qu'aucun outil ne verra jamais : *un test existant
modifié pour passer*.

## Périmètre

**Dans :** `docs/WORKFLOW.md` §2 et §7 · `.claude/commands/cadrage.md` (les quatre questions en
première ligne) · `.claude/commands/ouverture.md` (un chantier `chore/` — cas 1 — est dispensé
d'ADR, et un chantier d'**application** — cas 2 — l'est aussi à condition de **citer** l'ADR qu'il
exécute) · `CLAUDE.md` (la liste des commandes, qui ignore `/cadrage` depuis sa création).

**Hors :** les 59 décisions existantes — aucune n'est reclassée rétroactivement. Le classement
`type:` du front-matter est indicatif, il ne rejuge rien. La réorganisation du registre
(Phase 1bis) est un chantier distinct.

## Conséquences

**Positives.** La décision de surface s'écrit là où l'information est. Le nombre d'addendums de
révocation devrait baisser. Les chantiers d'application et de rangement cessent de fabriquer des
ADR qui ne décident rien. Le registre cesse de mélanger ce qui contraint et ce qui décrit.

**Négatives, et nommées.**

- 🔴 **L'ADR de surface arrive après le merge**, donc dans la zone où le corpus oublie déjà le
  plus (l'étape 4bis, oubliée six fois). **Borne : il s'écrit dans la MÊME session que la
  relecture visuelle, jamais reporté au lendemain.** Une décision différée deux fois n'est pas une
  décision, c'est un trou — l'addendum ADR-0015 §13 l'a écrit avant moi.
- Entre le merge et le compte rendu, une décision de surface n'est écrite nulle part. La fenêtre
  est bornée à une session ; elle n'est pas nulle.
- 🔴 **Le cas 2 peut servir d'échappatoire.** « La règle existe déjà » est une affirmation
  invérifiable si personne ne cite l'ADR. **C'est pourquoi la citation est obligatoire, et c'est
  la seule contrainte du cas 2** : un chantier d'application qui ne nomme pas l'ADR qu'il exécute
  est un chantier de décision déguisé.
- Le cas 3 peut être contourné en déclarant « surface » un changement qui touche un contrat. Rien
  ne l'empêche mécaniquement — sauf la question « y a-t-il une migration ? », vérifiable par un
  tiers.

## Le signal qui dirait qu'on s'est trompé

**Mesure à refaire le 2026-09-16** — un mois, pour que les ADR 0042→0059 aient l'âge qu'avait
l'ADR-0024 au moment de ce constat :

> Si les ADR 0042→0059 ont accumulé, à âge égal, **autant d'addendums de révocation** que
> l'ADR-0024, alors l'explication de cet ADR est fausse : la cause n'était pas l'ordre du cadrage
> mais l'ancienneté. **Cet ADR passe alors « Abandonné »**, et le rituel unique est rétabli.

Deuxième signal : si un compte rendu de surface est écrit avec une section « ce que l'écran a
démenti » **vide ou générique**, la borne du §2 a sauté et la voie est devenue une justification
a posteriori.

Troisième signal, né de la révision du jour : **si un chantier n'entre dans aucun des quatre
cas**, c'est que la classification est encore trop étroite. Elle a déjà échoué une fois en
quelques heures — ne pas la défendre, la corriger.

## Suivi

- La mesure du 2026-09-16 se fait avec `scripts/adr_lib.py` (addendums par parent croisés avec la
  date du parent) — elle n'est pas à réinventer.
- **Numérotation** : cet ADR prend le 0060 parce qu'il est écrit le premier. Les deux ADR prévus
  au plan de correctifs se décalent — jeton de ressource média → **0061**, fermeture des lacunes →
  **0062**.
- `DECISIONS.md` n'est pas édité à la main : il se régénère avec
  `scripts/gen_decisions_index.py --write`.
