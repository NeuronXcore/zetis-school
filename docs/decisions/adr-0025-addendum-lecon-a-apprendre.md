# Addendum ADR-0025 — §14 · « Leçon à apprendre », le quatrième type

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-10**. Ne rouvre aucune des décisions §1–§13.
> **Ne révoque rien.** Élargit `AGENDA_KINDS` d'une valeur et rend visible une action déjà livrée.
> **Aucune migration** — la colonne est un `String(15)` sans Enum SQL, et le modèle dit pourquoi
> (`agenda.py:19-20` : « une valeur nouvelle ne doit pas coûter une migration »).

## Contexte

Le vocabulaire des types est celui du collège : `devoir` (défaut), `controle`, `rendu`. À la
relecture, le commanditaire a buté dessus — *« devoir = cours à apprendre ? »*. Non : un devoir,
ce sont des exercices qu'on **fait**. Rien ne dit **« apprendre la leçon »**.

C'est un manque qui coûte, parce que c'est précisément le travail que ZETIS sait accompagner. Des
exercices se font sans lui ; une leçon s'apprend avec ce qu'il produit — fiche, quiz, cartes. Le
type le plus utile au dispositif était le seul absent du menu.

**Second constat, découvert en cherchant à répondre à la question suivante** — *« comment demander
à Massimo de réviser depuis l'agenda ? »* : on peut **déjà** commander du travail depuis une
échéance, et personne ne le voit. Le bouton « 🎯 Commander les missions de ce chapitre » est livré
depuis le 2026-08-03 (addendum ADR-0035 §3) ; il crée jusqu'à trois missions sur les notions
fragiles du chapitre, que Massimo reçoit en parcours *Découvrir → Verbaliser → Reconstruire →
Mini-quiz*. Mais il faut **ouvrir le panneau de détail** *et* que l'échéance porte **déjà** un
chapitre. Rien ailleurs sur la page n'en signale l'existence.

Une capacité livrée que personne ne trouve est, du point de vue de l'usage, une capacité absente.

## Décision

### 14.1 — La valeur : `lecon`

Sans accent, comme `controle`. `AGENDA_KINDS` gagne une quatrième entrée ; `_KIND_PATTERN` en
dérive, donc les quatre schémas d'écriture suivent sans être touchés.

Libellé Papa : **« Leçon à apprendre »** — la formulation longue est volontaire, c'est elle qui
lève l'ambiguïté que le mot « devoir » créait.

### 14.2 — Il déclenche la production, et **avant le devoir**

`TRIGGERING_KINDS` passe à `("controle", "lecon", "devoir")`.

Le tri sous plafond devient `{controle: 0, lecon: 1, devoir: 2}`. Le motif est le même que celui
qui a placé le contrôle en tête (addendum ADR-0035 §1) : **trier, c'est décider qui passe en
dernier**, et ce n'est pas ce qui bénéficie le plus de la production. Une leçon à apprendre est,
par définition, du travail de mémorisation — exactement ce que produisent la fiche et les cartes.
Un devoir est une liste d'exercices que le contenu généré ne remplace pas.

Le contrôle garde la tête : c'est lui qui est mesuré.

> ⚠️ **Les deux constantes se modifient ensemble.** `_KIND_PRIORITY.get(i.kind, 9)` : ajouter
> `lecon` à `TRIGGERING_KINDS` en oubliant la table de priorité le ferait tomber en **9**, donc
> passer systématiquement dernier — **sans qu'aucun test ne rougisse**, puisque le lot partirait
> quand même. Un test-verrou fixe l'ordre des trois.

### 14.3 — Il n'entre **pas** dans « ce qui arrive »

`UPCOMING_KINDS` reste `("controle", "rendu")`.

Trois raisons, dans l'ordre de force :

1. **`UpcomingItemOut` ne porte aucun champ `kind`** (`schemas.py:66-80`). Massimo ne pourrait pas
   distinguer « contrôle jeudi » de « leçon à apprendre pour demain » : deux objets de gravité
   différente sous une forme identique.
2. **La section est plafonnée à 4.** Une leçon à apprendre revient plusieurs fois par semaine ;
   elle chasserait les contrôles de la seule surface qui sert à les anticiper.
3. C'est le motif exact qui a exclu `devoir` (`service.py:38-39` : *« déjà dans la bande »*), et il
   s'applique mot pour mot.

**Réversible** : une constante et son test. Si l'usage montre que les leçons méritent d'être
anticipées, la décision se rouvre — après avoir donné un `kind` à `UpcomingItemOut`, pas avant.

### 14.4 — Ce que Massimo en voit : une marque, jamais le fuchsia

Aujourd'hui, **seul `controle` porte une marque** chez Massimo (badge `◆ contrôle` + anneau
fuchsia) ; `rendu` est visuellement indistinguable d'un `devoir`.

`lecon` reçoit une marque **calme**, dans une teinte qui n'est ni le fuchsia (réservé au contrôle)
ni le rouge (interdit transverse, §7). Le but est qu'il se **repère**, pas qu'il alarme : une
leçon à apprendre est du travail ordinaire, pas une échéance qui menace.

### 14.5 — Le Commander cesse d'être enterré

L'action remonte au niveau de l'**item** — vue semaine et liste plate — sur une échéance portant un
chapitre. Aucun moteur nouveau : `openFor` existe, la traduction `subject_id → sysId` aussi.

Et le panneau **nomme ce que ZETIS peut faire de cette échéance**. Il disait déjà ce qu'il ne
pourra pas faire faute de chapitre (addendum ADR-0035 §3) ; il dit maintenant aussi ce qui est
possible. Un dispositif qui se tait sur ses capacités est indistinguable d'un dispositif qui n'en a
pas — c'est le raisonnement de `SKIP_*` dans `triggers.py`, appliqué à l'écran.

> ⚠️ **Ce bloc reste indépendant du `kind`.** Recopier `TRIGGERING_KINDS` côté front en ferait une
> seconde source de vérité, qui a divergé le jour même où `devoir` y est entré. Elle divergerait à
> nouveau aujourd'hui.

### 14.6 — Ce que cet addendum refuse de promettre : « réviser »

La question qui a ouvert ce chantier était *« comment demander à Massimo de réviser ? »*. La
réponse honnête est : **on ne peut pas encore**, et cet addendum ne fait pas semblant.

- Aucune mission ne peut porter une session de cartes : les `step_type` sont
  `eli5 · vocal_explain · quiz · mindmap · lesson`, et **`lesson` est déclaré mais mort** (absent de
  `_build_steps` et de `_STEP_PALETTE`).
- Le deck de révision n'accepte que `mix_day | mix_flash | {subject}` — **pas de chapitre**.
- Le non-scheduling (`is_consolidation`) est **borné au même jour civil, même carte**.

C'est le **couplage 2 du §11, livré à 0 %**. Tant qu'il n'existe pas, **aucune affordance de
l'agenda ne doit suggérer une session de révision** : un bouton mort se lit comme une panne, et une
promesse non tenue coûte plus cher que l'absence.

Corollaire d'ordonnancement : le **plan de préparation** (§8 rôle 1, dont `plan_steps` est
l'emplacement câblé et vide) vient **après** le couplage 2, jamais avant — ses étapes sont « lire la
fiche · mini-quiz · **réviser les cartes du chapitre** ». Le construire d'abord serait le poser sur
le trou.

### 14.7 — Papa lit « coché », jamais « fait »

Trouvé à la relecture, par le commanditaire : *« coché par Massimo ne veut pas dire effectué »*.

L'étiquette d'état des cartes et de la liste disait **« ✓ fait »**. C'est une affirmation de
complétion que rien ne permet d'établir — et le §3 de cet ADR l'écrit noir sur blanc : *« cocher ne
prouve rien, ne pas cocher ne prouve rien »*. Le seul fait connu du serveur est qu'un `done_at` a
été posé par une route élève.

**Le reste de la page l'écrivait déjà correctement** — KPI « cochés par Massimo », panneau de
détail « Coché par Massimo » / « Pas encore coché ». Une seule étiquette contredisait les deux
autres surfaces, et c'était celle qu'on lit le plus souvent.

C'est le motif exact que l'addendum ADR-0041 a corrigé sur le Journal : **un mot qui veut dire une
chose pour la machine et une autre pour le lecteur**. « Fait » veut dire *« la case est cochée »* ;
Papa lit *« le devoir est fait »*.

**L'asymétrie avec l'interface de Massimo est VOULUE et conservée** : son bouton reste « marquer
comme fait ». Il **déclare**, et cette déclaration est à lui — c'est le seul geste qui rend l'objet
sien (§2b). Papa, lui, **lit une déclaration dont il n'est pas l'auteur** : il doit voir le geste,
pas la conclusion. Renommer la coche de Massimo la rendrait bureaucratique sans rien gagner.

**« à faire » ne change pas** : ce n'est pas une affirmation sur Massimo, c'est ce que le collège
demande — un fait, et un état neutre, jamais un manquement.

## Conséquences

**Positives** — le menu dit enfin le travail le plus fréquent et le plus accompagnable ; la
production se déclenche sur lui, en bonne place ; une capacité livrée depuis une semaine cesse
d'être invisible ; et l'ordre des trois chantiers restants est écrit, avec sa raison.

**Négatives / coûts** — un quatrième choix dans un menu qui en avait trois, sur la colonne la plus
saisie ; une marque de plus sur l'écran de Massimo, dans un registre qui doit rester calme ;
`lecon` est le premier `kind` qui **déclenche sans être annoncé** dans « ce qui arrive » — position
défendable mais nouvelle ; et surtout : **rendre le Commander visible augmente la probabilité du
double clic**, or il **n'est pas idempotent** (commander deux fois la même échéance crée des
doublons, `Mission` n'ayant aucune référence à l'agenda). Toléré tant que c'est un geste manuel,
**obligatoire à corriger avant tout déclenchement automatique** — la dette était déjà écrite à
l'addendum ADR-0035, elle devient plus probable ici.

## Suivi

- **Test-verrou** : contrôle J+6, leçon J+2, devoir J+1 → l'ordre servi est `controle, lecon,
  devoir`. C'est le test qui attrape l'oubli de `_KIND_PRIORITY`.
- **Test-verrou** : `lecon` n'apparaît pas dans `/upcoming` (miroir du test existant sur `devoir`).
- **Test-verrou** : le fuchsia reste réservé au contrôle sur les surfaces Massimo.
- **Test-verrou** : un item coché se lit « ✓ coché » côté Papa, et le mot « fait » n'apparaît dans
  aucun état d'item (§14.7). ⚠️ « à faire » ne contient pas « fait » — l'assertion ne se déclenche
  que sur une vraie affirmation de complétion.
- Mise à jour de `docs/frontend-papa/page-agenda.md` et `docs/frontend-massimo/page-agenda.md`.
- Ligne dans `DECISIONS.md` sous ADR-0025 (« + addendum §14 — leçon à apprendre »).
- **Observation attendue** : si `lecon` devient le type majoritaire, la décision §14.3 (absent de
  « ce qui arrive ») est à rouvrir — mais en donnant d'abord un `kind` à `UpcomingItemOut`.
- Commit suggéré : `feat(agenda): a fourth kind for lessons to learn, and a visible Commander`.

## Décisions validées (commanditaire, 2026-08-10)

1. **Ajouter le 4ᵉ type**, plutôt que d'expliciter les trois existants — retenu.
2. **Rendre visible le Commander avant de construire le plan de préparation** — retenu sur
   recommandation, au motif que le plan dépend d'un couplage livré à 0 %.
3. **Ne rien promettre sur la révision** tant que le deck chapitre n'existe pas.
4. **« coché », jamais « fait »** côté Papa — relevé à la relecture (« coché par Massimo ne veut pas
   dire effectué »). La coche de Massimo, elle, garde son libellé.
