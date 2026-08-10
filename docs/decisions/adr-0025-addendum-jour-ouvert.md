# Addendum ADR-0025 — §17 · La bande ouvre un jour, et le passé cesse d'être hors d'atteinte

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**.
> **Révoque une phrase de `docs/frontend-massimo/page-agenda.md`** (« la bande est un index, pas
> une seconde liste ») et **déplace** le plafond du §7 : de filtrage à affichage.
> Aucune migration, aucun changement de contrat serveur.

## Contexte

Relevé à l'écran par le commanditaire : *« je vois dans agenda massimo 3 points verts au dim 9 et
sam 8, il ne se passe rien »*.

Deux choses s'y cachaient.

**1. Les points verts ne sont pas des devoirs.** Ce sont les **traces d'activité** du §7 — « Massimo
a travaillé ce jour-là ». Vérifié sur l'API : ces deux jours portent `traces: 3` et
**`fixed_items: []`**. La confusion est le symptôme, pas la cause.

**2. Le tap ne répondait pas.** La bande était un **index** : `scrollToDay` faisait défiler vers le
premier item du jour et **sortait en silence** quand il n'y en avait pas. Or le serveur ne renvoie
**jamais** d'échéance sur un jour passé (§6, asymétrie calculée serveur) : le tap était donc muet
sur **tous** les jours passés — c'est-à-dire précisément là où des points étaient allumés.

Un jour qui **montre quelque chose** et ne répond pas se lit comme une panne. C'est le même
raisonnement que les motifs `SKIP_*` de `triggers.py`, appliqué à un tap.

## Décision

### 17.1 — La bande ouvre un jour ; elle n'est plus seulement un index

Un tap **sélectionne** le jour et ouvre un panneau **sous la bande** — pas en bas de page : la
réponse à un tap doit arriver là où le doigt vient de se poser. Retaper le jour ouvert le referme.

**Le panneau répond TOUJOURS**, y compris pour dire qu'il n'y avait rien :

- des échéances → elles s'affichent, cochables, avec leur lien vers le cours (§15) ;
- aucune, jour passé → *« Rien à rendre ce jour-là »* ;
- aucune, jour à venir → *« Rien de noté pour ce jour »* ;
- et si le jour porte des traces → *« tu as travaillé 3 fois »*, la moitié **positive** du passé.

> ⚠️ **`0` trace ne se rend pas.** Le contrat serveur ne distingue pas `0` de « pas de donnée »
> (§7) ; afficher « tu as travaillé 0 fois » fabriquerait le constat d'absence que le §7 interdit.

**Ce que la phrase révoquée protégeait est conservé** : la bande ne devient pas une seconde liste
qui doublerait les sections. Elle ouvre **un** jour à la fois, à la demande, et le panneau se
referme. Ce n'est pas une liste, c'est une réponse.

### 17.2 — Le plafond de « À reprendre » change de nature, il ne disparaît pas

Le §7 dit : *« 3 affichés au maximum quel qu'en soit le nombre — la section ne grossit pas »*. Le
plafond était appliqué dans `splitSections`, c'est-à-dire **au filtrage** : au-delà de trois, les
items passés non faits n'étaient pas cachés, ils étaient **hors d'atteinte**. Rien, nulle part, ne
permettait d'y revenir.

Désormais : la liste est **complète**, la page en montre **trois**, et un bouton discret ouvre le
reste — *« voir 5 autres ▾ »*.

**Le §7 n'est pas rouvert, il est relu.** Ce qu'il interdit, c'est un écran qui **s'allonge tout
seul** : *« une section qui s'allonge redevient la liste d'arriéré »*. Un dépliage que Massimo
**ouvre** est son geste, pas une dette qui pousse sous ses yeux.

> ⚠️ **Le nombre n'apparaît QUE sur le bouton**, jamais à côté du titre. « À reprendre · 8 » serait
> exactement le compteur d'arriéré interdit ; « voir 5 autres » dit ce que le geste va ouvrir, et
> disparaît une fois ouvert.

### 17.3 — Le vocabulaire ne bouge pas

La demande parlait de **« devoirs en retard »**. Le mot est interdit sur les surfaces de Massimo
(§7 : *« aucun rouge, aucun "en retard", aucun compteur d'arriéré »*), et il le reste : la fonction
demandée est livrée sous le nom **« à reprendre »**, en ambre doux, dans le panneau comme dans la
section.

C'est le seul point où la livraison s'écarte de la lettre de la demande, et c'est délibéré : le §7
protège un enfant d'un écran qui lui reproche quelque chose.

## Conséquences

**Positives** — le silence qui a déclenché ce chantier disparaît ; les traces d'activité cessent
d'être confondues avec des devoirs, parce qu'un panneau les nomme ; le passé non fait redevient
**atteignable** sans que l'écran s'allonge ; et le tap sur un jour à venir gagne au passage une
réponse plus riche qu'un défilement.

**Négatives / coûts** — une phrase de spec révoquée trois semaines après son écriture ; un panneau
de plus sur une page dont la sobriété est un objectif ; et une tentation permanente, qu'aucun test
ne clôt, de faire du dépliage un compteur (« 8 à reprendre ») — le §17.2 la nomme pour qu'elle soit
reconnue quand elle reviendra.

## Suivi

- **Test-verrou** : un jour sans échéance **répond** (« Rien à rendre ce jour-là »).
- **Test-verrou** : `0` trace ne se rend pas, et un jour à venir non plus.
- **Test-verrou** : aucun vocabulaire de retard ni compteur d'arriéré dans le panneau.
- **Test-verrou** : `splitSections` ne plafonne plus — les plus anciens sont dans la liste.
- Réécriture du paragraphe « Bande glissante » de `docs/frontend-massimo/page-agenda.md` (§17.1).
- **Observation attendue** : si Massimo ouvre le dépliage et n'y touche jamais, c'est que le
  rattrapage au-delà de trois jours n'intéresse personne — et le plafond de filtrage avait raison.
- Commit suggéré : `feat(agenda): tapping a day answers, and the past is reachable again`.

## Décisions validées (commanditaire, 2026-08-10)

1. **Lever le plafond derrière un dépliage** — retenu contre une levée totale (qui recréerait la
   liste d'arriéré) et contre le statu quo.
2. **Un jour sans échéance le dit, et dit ce qui a été fait** — retenu contre un panneau muet et
   contre un jour non cliquable.
