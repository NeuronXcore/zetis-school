# ADR-0058 — La fiche répond quand on la touche

## Statut

**Proposé (2026-08-14)** — cadré sur `main`, sans une ligne de code.

Ferme les **défauts 2, 3 et 4** que la relecture visuelle de l'`adr-0054` avait trouvés et que sa
clôture a laissés en dette. Il ne rouvre **aucune** décision de l'`adr-0054` : l'adresse d'une
fiche (§1), la trajectoire dans le temps (§7) et l'asymétrie brouillon/fiche finie sont **citées**,
pas reformulées.

## Contexte

### Trois défauts, et ils ne sont pas trois

Ils avaient été notés séparément. En les relisant dans le code, ils disent **la même chose** —
d'où le nom du chantier :

| | Le geste de Massimo | Ce que l'écran répond |
|---|---|---|
| **2** | *« J'ai fini ma fiche »* | il retombe sur **la liste** — pas sur ce qu'il vient de faire |
| **3** | *« Fais-moi des cartes »* | **rien** entre le tap et la réponse ; et **rien du tout** si ça échoue |
| **4** | *« Je veux la retravailler »* | une **page blanche** — une v2 vide à la place de son travail |

**Un geste qui n'obtient pas de réponse n'est pas un geste, c'est un doute.** Et sur une surface
d'enfant, le doute se paie deux fois : il retape, ou il abandonne.

### Ce que dit le code, précisément

- **Défaut 2** — [`AtelierPage.tsx:424`](../../apps/frontend-massimo/src/pages/AtelierPage.tsx) :
  `terminer()` fait `finishDraft()` puis `retourAuDeck()` → `/fiches/{slug}`.
  ⚠️ **L'adresse d'une fiche EXISTE** (`?fiche=<id>`, `adr-0054` §1) — elle n'est simplement pas
  utilisée ici.
- **Défaut 3** — [`FicheSubjectPage.tsx:125`](../../apps/frontend-massimo/src/pages/FicheSubjectPage.tsx) :
  `pontVersLesCartes` n'a **aucun état d'occupation**, alors que la **porte juste à côté** en a un
  (`busy: porteEnCours`). Et son `catch {}` est **vide**, par un choix documenté : *« Silencieux :
  l'échec ne doit pas transformer une fiche en écran d'erreur »*. Le succès parle (`bilanPont`) ;
  l'attente et l'échec, non.
- **Défaut 4** — [`atelier.py:208`](../../apps/backend/app/modules/fiches/atelier.py) :
  `open_or_get_draft` ne cherche que des **brouillons**. Après un `finish`, il n'en trouve aucun et
  **fabrique un vide** en version N+1. Deux portes ont été désamorcées une par une (elles appellent
  `rework` d'abord) ; **la cause, elle, n'a pas bougé** — toute autre entrée (URL directe, retour
  arrière, rechargement) refabrique le vide.

### 🔴 Les mesures — le défaut 4 s'est RÉALISÉ, et il est pire que décrit

Sur la base de dev, le 2026-08-14, en lecture seule :

| | |
|---|---|
| Fiches de Massimo | **11** — 5 `personal`, 6 `personal_draft` |
| 🔴 **Brouillons VIDES coexistant avec une fiche finie** | **2** |
| leçon 1 « Lire et comprendre un texte narratif » | brouillon **id=54, v3, vide** — v1 et v2 sont finies |
| leçon 7 « La phrase complexe » | brouillon **id=59, v4, vide** — v1, v2 et v3 sont finies |

🔴 **Et la porte désamorcée ne protège plus.** `rework` commence par
*« il retravaillait déjà : on ne fabrique pas une seconde version en parallèle »* et **rend le
brouillon en cours** ([`atelier.py:330`](../../apps/backend/app/modules/fiches/atelier.py)). Or ce
brouillon **est le vide**. Donc aujourd'hui, sur ces deux leçons, cliquer « La retravailler » —
le chemin réputé sûr — **rend la page blanche**. Le contournement a une date de péremption, et
elle est passée.

> ⚠️ **Cette mesure a dû être refaite, et l'erreur mérite d'être écrite.** La première passe
> filtrait `validation_status == "draft"` ; la vraie constante est **`personal_draft`**
> (`population.py:47`). Elle annonçait **0 cas**. C'est le piège du §4 de `/cadrage`, pour la
> deuxième fois en deux cadrages : *une requête approximait la règle*.

## Décision

### §1 — Le principe : tout geste obtient une réponse, et la réponse est ce qu'il a produit

Pas « un retour d'information » en général : **la chose elle-même**. Terminer une fiche montre la
fiche. Demander des cartes dit combien de cartes. Rouvrir un travail rend le travail.

### §2 — `finish` mène à la FICHE, pas à la liste

`terminer()` navigue vers l'adresse de la fiche finie (`?fiche=<id>`, `adr-0054` §1 — **elle
existe déjà, on ne l'invente pas**), et non vers `/fiches/{slug}`.

⚠️ **Le 422 n'est pas touché** : il dit ce qui manque, et c'est déjà juste.

### §3 — Le pont SRS s'occupe et se plaint, comme la porte à côté

Deux manques, une seule raison : **le geste doit être entendu avant d'être satisfait**.

1. Un état **occupé** pendant l'appel — le patron existe à trois lignes de là (`busy`).
2. 🔴 **Le `catch {}` vide tombe.** Un échec dit qu'il a échoué et que le geste est rejouable.
   L'argument d'origine (*« ne pas transformer une fiche en écran d'erreur »*) reste vrai et est
   **respecté** : un message doux à côté du bouton, comme `portePanne` juste au-dessus — pas un
   écran d'erreur.

### §4 — 🔴 LA CAUSE : `open_or_get_draft` cesse d'ignorer les fiches finies

Quand il ne trouve **aucun brouillon** mais qu'une fiche **finie** existe pour cette leçon et cet
élève, il **délègue à `rework`** au lieu de fabriquer un vide.

**Pourquoi là et pas dans les portes** : les portes sont des **rustines**, et on en a déjà posé
deux. Une troisième entrée apparaîtra — une URL partagée, un lien de l'agenda, un raccourci. La
règle *« on ne repart jamais de rien quand quelque chose existe »* appartient au service qui
décide, pas aux appelants qui passent.

⚠️ **`rework` n'est pas modifié** : son asymétrie (brouillon = en place, fiche finie = nouvelle
version) est la décision du `adr-0054` §7, et elle reste. On lui **délègue**, on ne la réécrit pas.

### §5 — 🔴 Les deux fantômes DÉJÀ en base sont réparés, sinon le §4 ne les touche pas

Le §4 empêche d'en créer d'autres. Il ne répare **pas** les deux existants : ce sont des
brouillons, donc `open_or_get_draft` les trouvera et les rendra — vides.

**Décision : un brouillon VIDE, sur une leçon qui porte une fiche finie, se REPEUPLE depuis la
dernière finie**, à l'ouverture. Pas de script de migration, pas de suppression : la même règle
répare le passé et le futur, et elle est **vérifiable à l'écran** (la leçon 1 doit rendre le
travail de la v2).

⚠️ **« Vide » se définit par les SECTIONS** (`essentiel`, `definitions`, `pieges`, `exemple`,
`methode`, `mnemonique`), jamais par le décor (titre, matière, niveau, chapitre) qui est
pré-rempli par construction. Mesuré : les **6** brouillons de la base ont zéro section remplie ;
seuls **2** portent une fiche finie derrière eux, et ce sont exactement ceux-là qu'il faut toucher.

### §6 — 🔴 LE CRITÈRE QUI BORNE : aucune route neuve, aucune migration, aucun appel LLM

> Ces trois défauts se réparent **là où ils sont**. Si la mise en œuvre demande un endpoint de
> plus, une colonne, ou une génération, **elle sort du périmètre** et revient ici.

Il mord tout de suite, et c'est voulu : la tentation immédiate devant deux lignes fantômes est
d'écrire un script de nettoyage (donc une migration de données). Le §5 dit non — **une règle qui
répare en passant vaut mieux qu'un script qu'on lance une fois et qu'on oublie**.

## Alternatives considérées

- **Ne traiter que les défauts 2 et 3** (l'écran) et laisser le 4 — écartée : c'est le seul des
  trois qui **détruit du travail visible**, et il est déjà réalisé deux fois.
- **Désamorcer la troisième porte** au lieu de traiter la cause — écartée par le §4 : c'est la
  méthode qui a produit l'état actuel, et elle a déjà échoué (la porte « sûre » rend le vide).
- **Un script de nettoyage des deux fantômes** — écartée par le §5/§6 : il répare le passé et
  laisse le futur ouvert, alors qu'une règle fait les deux.
- **Supprimer les brouillons vides** plutôt que les repeupler — écartée : supprimer une ligne pour
  réparer un affichage est disproportionné, et `rework` sait déjà repartir de la dernière finie.
- **Faire parler l'échec du pont dans un écran d'erreur** — écartée : l'argument d'origine tient,
  seul le silence total ne tenait pas.
- **Un addendum à l'`adr-0054`** plutôt qu'un ADR — écartée : ce chantier introduit une règle
  neuve (§1, §4) qui vaut au-delà des fiches, et il ne modifie aucune décision de l'`adr-0054`.

## Périmètre

- `AtelierPage` : la destination après `finish`.
- `FicheSubjectPage` : l'état occupé et le message d'échec du pont SRS.
- `atelier.open_or_get_draft` : la délégation à `rework`, et le repeuplement d'un brouillon vide.
- Les tests : les trois réponses, plus **la réparation des deux cas réels**.

## Hors périmètre (nommé)

- **Le contenu** des fiches, les six étapes de l'atelier, les candidates, la dictée (`adr-0055`).
- **Le 422 de `finish`** — il dit déjà ce qui manque.
- **L'asymétrie brouillon / fiche finie** — `adr-0054` §7, citée.
- **`cartes_depuis_la_fiche`** côté serveur : seul son *écho à l'écran* change.
- **L'enrichissement des fiches par lot** (addendum `adr-0015` §11) — trois points non tranchés.
- **Le prompt v2 des fiches**, jamais exercé — dette distincte.
- **Toute surface Papa**, la file de relecture, la validation.
- **Toute migration, tout endpoint neuf, tout appel LLM** — §6.

## Conséquences

### Positives

- Les trois gestes les plus engageants de la page **répondent**.
- La cause est traitée **une fois**, à l'endroit qui décide — la prochaine entrée vers l'atelier
  naîtra correcte.
- Les deux fantômes disparaissent **sans script**, par la règle qui les empêche de revenir.

### Négatives / risques

- ⚠️ **`open_or_get_draft` gagne une branche** : une fonction déjà dense (idempotence, course
  StrictMode, rattrapage d'`IntegrityError`). Le risque est la lisibilité, pas la correction.
- ⚠️ **« Vide » est une heuristique** — six sections à tester. Elle est mesurée sur les vraies
  données ici, mais un ajout de section futur devra la mettre à jour ; sinon un brouillon
  « rempli » d'une seule section neuve passerait pour vide.
- ⚠️ **Repeupler écrase ce que Massimo n'avait pas écrit** — par construction, rien. Mais si un
  jour une section est remplie automatiquement, la règle deviendra fausse.

## Le signal qui dirait qu'on s'est trompé

1. 🔴 **Un troisième brouillon vide apparaît en base** après le chantier — la cause n'était pas
   là où on l'a cherchée.
2. 🔴 **Une quatrième porte est désamorcée à la main** — le §4 n'a pas été respecté, et on est
   retourné aux rustines.
3. ⚠️ **Un brouillon rempli est repeuplé** et du travail disparaît — l'heuristique du §5 est
   fausse, et c'est le pire résultat possible de ce chantier.
4. ⚠️ **Massimo termine sa fiche et revient en arrière aussitôt** — la destination du §2 n'est pas
   celle qu'il attendait.
5. ⚠️ **Une migration apparaît dans la slice** — le §6 a cédé.

## Suivi

- **Mesures de référence, 2026-08-14** (lecture seule, base de dev) : **11** fiches de Massimo —
  5 `personal`, 6 `personal_draft` · 🔴 **2 brouillons vides** derrière une fiche finie (**id=54**
  v3 leçon 1, **id=59** v4 leçon 7) · les 6 brouillons ont **zéro** section remplie · `rework` rend
  le brouillon en cours, donc **la porte « sûre » rend le vide** sur ces deux leçons.
- **Consomme** : `adr-0054` (l'adresse `?fiche=`, §1 · l'asymétrie brouillon/fiche finie, §7) ·
  `adr-0055` (les six étapes de l'atelier) · `adr-0013` (les cartes SRS).
- **Ouvre** : une slice unique — les trois réponses tiennent dans un seul geste, et la contre-épreuve
  doit prouver la réparation **sur les deux cas réels**.
