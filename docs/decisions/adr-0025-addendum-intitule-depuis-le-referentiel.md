# Addendum ADR-0025 — §13 · L'intitulé se choisit dans le référentiel

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**. Ne rouvre aucune des décisions §1–§12.
> **Ne révoque rien** : §8 (« le texte brut est conservé ») reste entier — cet addendum change la
> façon de **produire** `label`, pas ce que `label` est.
> Achève, sur la dernière colonne de la grille, ce que l'addendum ADR-0035 §3 a fait pour le
> chapitre : même page, même nature de geste.

## Contexte

La grille de saisie Papa a quatre colonnes utiles. Trois sont des menus alimentés par le
référentiel — **matière**, **chapitre** (§11), **type**. La quatrième, **intitulé**, est restée un
champ texte vide avec un placeholder.

Or ce que Papa y tape existe déjà en base, à trois clics de là : la page **Matières** affiche
matière → chapitre → **titre du cours** (`lessons.title`), et n'y montre que les leçons
**validées**. Papa retape donc, à la main, une chaîne que ZETIS connaît déjà.

Un intitulé retapé est un intitulé qui dérive. Deux orthographes pour le même cours, et une
échéance dont le libellé ne correspond à rien de nommé dans le programme — au moment précis où le
chapitre, lui, vient d'être sélectionné dans le menu d'à côté.

C'est la direction que cet ADR énonce déjà pour la phase 0 (§8 : *« Papa sélectionne matière, date
et chapitre dans des menus »*) et le raisonnement par lequel l'ADR-0018 §1 a **écarté le texte
libre au profit de la sélection dans le référentiel**. L'intitulé était la dernière colonne à ne
pas l'avoir suivi.

## Décision

### 13.1 — Un menu, et une porte de sortie qui reste ouverte

L'intitulé devient un `<select>`, comme les trois autres colonnes : les **titres des cours du
chapitre sélectionné**, plus une dernière option **« ✏️ Autre (texte libre) »** qui rend un champ
texte.

La porte de sortie n'est pas un compromis, c'est le cas majoritaire d'un `kind = devoir` : un
devoir s'énonce par des consignes et des références de manuel, presque jamais par le titre d'un
cours du référentiel — le menu ne peut donc pas le proposer. La contrainte serveur reste
`String(300)` libre, et **aucune valeur n'est imposée**.

**Sans chapitre, pas de menu** — le champ texte est rendu directement. Même jurisprudence que le
sélecteur de chapitre, qui n'affiche jamais un menu vide : un menu qu'on ouvre pour n'y rien
trouver se lit comme une panne.

### 13.2 — Les cours **validés** seulement

La liste reflète exactement ce que la page Matières montre : `status === "validated"`.

Le motif n'est pas la cohérence d'affichage, c'est la frontière ADR-0009 §9. **`label` est lu par
Massimo** — c'est même la seule chaîne de l'agenda qu'il lit. Un titre rédigé par le modèle et non
relu l'atteindrait par cette porte, sans jamais être passé par la validation Papa que tout le
reste du référentiel exige.

**Conséquence assumée, et elle est visible** : sur un chapitre dont les leçons sont encore en
brouillon, la liste est vide et l'intitulé reste libre. Papa n'est jamais bloqué ; il l'est
d'autant moins que la saisie en lot est, en phase 0, la seule source d'items (§10).

### 13.3 — Rien ne se persiste de plus : aucun `lesson_id`

La pente naturelle est d'enregistrer *quelle leçon* a été choisie. **Écartée.**

Le `chapter_id` de §11 ouvre déjà **les deux** portes — la production automatique (ADR-0035) et le
Commander de missions — et toutes deux sont scopées par chapitre, jamais par leçon
(`resolve_chapter_notions`). Une colonne `lesson_id` n'alimenterait aujourd'hui aucun moteur : elle
coûterait une migration pour une donnée que personne ne lit, sur une table que §11 a déjà fait
migrer une fois.

Ce qui part au serveur est donc **le titre, tel quel**, dans `label`. Le serveur ne le réécrit pas
(§8, et le commentaire de `models/agenda.py` : *« Texte BRUT, tel que saisi »*) ; le client non
plus. Aucune migration, aucun changement de contrat d'API, aucun type partagé nouveau.

### 13.4 — Le geste de Papa n'est jamais écrasé

Un item existant porte un `label` qui, presque toujours, ne figure dans aucune liste. Il s'affiche
en texte libre, **inchangé**, et rien ne bouge tant que Papa ne demande pas la liste.

Même règle à la saisie : si Papa a tapé son énoncé **avant** de choisir le chapitre, choisir le
chapitre ne bascule pas le champ en menu et n'efface pas ce qu'il a écrit. C'est la seule
transition qui pourrait faire perdre une saisie ; elle est interdite et testée pour ça.

Le passage inverse — revenir à la liste après avoir écrit du texte — **vide le champ**, et son
libellé le dit (« choisir un cours »). L'alternative, garder le texte pendant que le menu affiche
son placeholder, met l'écran en désaccord avec ce qui sera enregistré.

### 13.5 — Aux deux surfaces d'édition

La grille de saisie **et** le panneau de détail. Le second a reçu son sélecteur de chapitre à
l'addendum ADR-0035 §3, pour la raison exacte qui vaut ici : un item mal saisi — ou saisi par
Massimo, qui n'a aucun sélecteur — restait stérile alors que l'API acceptait déjà la correction.
N'équiper que la grille rejouerait cette asymétrie sur la colonne d'à côté.

## Conséquences

**Positives** — la colonne la plus saisie de la page cesse d'être la seule à ignorer le
référentiel ; l'échéance et le chapitre parlent enfin de la même chose sous le même nom ; le
libellé lu par Massimo est un libellé qu'un humain a validé ; zéro backend, zéro migration, un
endpoint et une fonction client déjà écrits (`GET /api/chapters/{id}/lessons`, `fetchLessons`).

**Négatives / coûts** — un chapitre sans leçon validée offre une liste vide, et rien à l'écran
n'explique *pourquoi* (le renvoi vers Programme existe sur la page Matières, pas ici) ; un
sélecteur de plus à charger, donc un appel réseau par chapitre déplié ; et une pente à surveiller,
celle de vouloir rendre l'intitulé **obligatoirement** issu du menu — ce que §13.1 interdit et que
la réalité d'un devoir contredit.

## Suivi

- **Test-verrou** : le titre d'une leçon `draft` n'apparaît **jamais** dans la liste (§13.2).
- **Test-verrou** : texte libre saisi d'abord, chapitre choisi ensuite → le texte survit (§13.4).
  C'est le test qui protège cet addendum de sa seule transition destructrice.
- **Test-verrou** : `label` part au serveur **identique** au titre choisi, au `trim()` près (§13.3).
- Mise à jour de `docs/frontend-papa/page-agenda.md` (§ Saisie en lot, § Panneau de détail).
- Ligne à ajouter dans `DECISIONS.md` sous ADR-0025 (« + addendum §13 — intitulé depuis le
  référentiel »).
- À revoir si la saisie élève s'ouvre (§10) : Massimo n'a aucun sélecteur, et §8 rôles 2–3
  (structuration du texte libre par le modèle) redeviendrait la question.
- Commit suggéré : `feat(agenda): pick the label from the chapter's validated lessons`.

## Décisions validées (commanditaire, 2026-08-10)

1. **Un `<select>` avec option « ✏️ Autre (texte libre) »** — retenu, contre un champ texte à
   suggestions et contre une liste qui pré-remplirait un second champ.
2. **Les deux surfaces** — grille de saisie en lot **et** panneau de détail.
3. **Les cours validés seulement**, comme la page Matières — la liste vide sur un chapitre en
   brouillon est acceptée comme conséquence, pas corrigée par un assouplissement.
