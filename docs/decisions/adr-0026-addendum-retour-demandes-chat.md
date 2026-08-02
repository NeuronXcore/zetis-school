# Addendum ADR-0026 — Le retour de demande se ferme dans le chat (`announced_at`)

## Statut

Proposé — 2026-08-02. Ferme la boucle laissée ouverte par l'addendum ADR-0027
(`content_requests`) et par le volet hors-programme (`notion_requests`).

> S'appuie sur : `adr-0026 §4` (rappel jamais relance — « la mémoire du chat n'existe qu'à
> l'intérieur d'une session que Massimo a ouverte » ; contexte d'ouverture **composé serveur,
> déterministe »), `adr-0027` (le chat oriente vers l'existant validé, jamais il ne génère ;
> actions **ancrées serveur**), `adr-0027 addendum content_requests` (la file de Papa),
> `adr-0024 addendum` (`resolve_panoply` = prédicat de disponibilité **unique**),
> `adr-0011 §F` (provenance). **Ne rouvre aucune décision.** En particulier, `adr-0026 §4`
> n'est pas amendé — il est **appliqué**.

## Contexte

Toutes les boucles asynchrones de ZETIS ont un retour vers Massimo, sauf deux :
`content_requests` (il réclame un contenu sur une notion qui existe) et `notion_requests` (il
réclame une notion hors programme).

Ce sont **les deux seuls endroits du dispositif où Massimo parle en son nom propre**. Partout
ailleurs il est observé, et ça remonte correctement. Là où il s'adresse à quelqu'un, rien ne
revient — même quand Papa a produit le contenu et trié la ligne.

Ce n'est pas un oubli d'ergonomie : c'est la sobriété appliquée là où elle ne s'appliquait pas.
ZETIS dit « je le note pour Papa » ; l'addendum ADR-0027 existe pour que cette phrase ne soit pas
un cul-de-sac. **Aujourd'hui elle en est encore un.**

## Constat read-before-code

**1. La disponibilité a déjà son prédicat unique.** `galaxy.resolve_panoply` est décrit dans le
code comme *« LE prédicat de disponibilité de ZETIS »*, avec un seul exemplaire dans le dépôt.
Son commentaire rappelle ce qu'un second a coûté le 2026-07-30 : le cours était annoncé
disponible sur `lesson_id is not None` d'un côté et sur `content_markdown IS NOT NULL` de
l'autre — *« une porte ouverte sur du vide »*. Toute annonce doit passer par lui.

**2. Les routes ont déjà leur source unique.** `chat/actions.py::_notion_route` est la **seule**
fabrique de destinations ancrées du chat. Elle rend `None` pour `quiz` et n'a **aucune branche
`capsule`** (« hors v1 »).

**3. La carte existe déjà.** `ChatAction` / `ChatMenuItem` portent la proposition tapable, et
`chatActions.ts::surfaceOf` en dérive déjà la trace `chat_tool_response`. Aucun composant, aucun
`event_type` à créer.

**4. `notion_requests` n'a PAS de `skill_id`** — `text` libre (160 car.), `subject_id` nullable,
et le modèle le dit explicitement : *« PAS de FK skill (la notion n'existe pas encore) »*. Le
statut `added` est donc, en l'état, **invérifiable**.

**5. La session de chat est créée paresseusement, au premier message.** `ChatPage.tsx` fait
`if (!sessionRef.current) { createChatSession() }` **à l'intérieur du handler d'envoi**. Le
« contexte d'ouverture » de l'ADR-0026 §4 n'a donc, aujourd'hui, aucun moment où se dire.

**6. `announced_at` n'existe sur aucune des deux tables.**

## Décision

### 1. La règle : « rappel ≠ relance » interdit le *push*, pas la *réponse*

> La boucle se ferme **là où elle s'est ouverte, et seulement là** : dans le chat, en **pull**,
> **une seule fois**.

Massimo ouvre le chat — son geste. Le **contexte d'ouverture**, déjà composé serveur et
déterministe (ADR-0026 §4), porte la réponse :

> « Tu m'avais demandé ta fiche sur les fractions. C'est prêt. » + une **carte-action** qui l'ouvre.

Quatre propriétés, toutes contraignantes :

- **Même canal que la promesse.** Aucun badge, aucun compteur, aucune pastille.
  `page-chat.md §5` (« pas de badge non-lu, rien ») reste vrai **au mot près**.
- **Pull strict.** L'annonce n'existe qu'à l'intérieur d'une session que Massimo a ouverte. Rien
  n'est calculé, stocké ni poussé entre deux sessions.
- **Voix ZETIS, jamais « Papa l'a préparée ».** Le contenu scolaire atteint Massimo sans auteur,
  quel que soit son producteur réel — la voix doit rester stable quand ZETIS produira lui-même.
- **Auto-extinctive.** Dite une fois, éteinte. Aucune file qui grossit, aucun « 3 en attente » qui
  devient une dette. **L'absence n'est pas un événement** : ne pas venir chercher sa fiche
  n'accumule rien (même jurisprudence qu'`agenda_item_missed` et `StudentWeeklyGoal`).

Le texte est **composé en Python, déterministe** — pas par le LLM. C'est un fait, pas une
génération ; deux voix de ZETIS sur le même état, dont une hallucinée, détruiraient la confiance
(ADR-0026 §4).

### 2. Le gate est la **disponibilité**, jamais le **statut**

Dans l'inbox Papa, **« Fait » ne fait que changer une colonne.** Il ne prouve pas que le contenu
existe. Annoncer sur cette base reconstruirait **exactement** le mensonge que le correctif du
2026-07-30 a tué (`notion_panel` annonçait un cours absent).

> L'annonce est conditionnée à la **disponibilité réelle**, via `resolve_panoply` — le même
> prédicat que `galaxy.notion_panel`. Une demande `done` dont le contenu n'est pas servable
> **ne s'annonce pas, et n'est pas tamponnée.**
>
> Le statut est un **geste de Papa**. La disponibilité est un **fait**. On annonce le fait.

Correspondance `content_kind` → entrée de panoplie, explicite et fermée :

| `content_kind` | entrée `resolve_panoply` | annonçable |
|---|---|---|
| `cours` | `cours` | oui |
| `fiche` | `fiche` | oui |
| `mindmap` | `mindmap` | oui |
| `card` | `revision` | oui |
| `quiz` | `quiz` | **non** — `_notion_route` rend `None` |
| `capsule` | `capsule` | **non** — aucune branche dans `_notion_route` |

**Pas de route ⇒ pas de carte ⇒ pas d'annonce ⇒ pas de tampon.** Une demande `quiz` ou `capsule`
devenue disponible reste silencieuse et **reste annonçable plus tard**, le jour où `_notion_route`
gagnera sa branche. On n'invente aucune destination ici : ajouter une route dans le composeur
d'annonce la dédoublerait, et l'addendum ADR-0024 l'interdit.

### 3. Pour `notion_requests`, **le résolveur EST la preuve**

La table n'a pas de `skill_id` (constat 4) : « ajoutée » est un statut, pas un fait vérifiable.

> À l'ouverture, on **rejoue `resolve_skill`** (seuil `CHAT_SKILL_RESOLUTION_MIN_SCORE`, 0.72) sur
> le texte de la demande.
>
> **Le résolveur avait échoué au moment de la création — c'est précisément pour ça que la ligne
> existe.** Qu'il réussisse maintenant, et que la notion soit visible dans l'année active
> (`is_notion_visible`), est la preuve que la notion est réellement entrée au programme.

S'il échoue encore : **aucune annonce, aucun tampon.** La ligne reste éligible.

**Plafond : 3 lignes examinées par ouverture** (les plus récemment triées d'abord). Chaque ligne
coûte un embedding ; sans plafond, une demande qui ne résout jamais serait ré-embeddée à chaque
ouverture de chat, indéfiniment. Le plafond borne un coût, il ne perd rien.

### 4. Nommer 2, **tamponner tout**

La composition retient les lignes éligibles, en **nomme au plus 2** (règle « ≤ 2 propositions »
de l'ADR-0027) et pose `announced_at` sur **tout le lot retenu**.

**Non négociable** : tamponner seulement les 2 nommées ferait s'empiler le reliquat, qui
redeviendrait une pression annonce après annonce — exactement ce que l'auto-extinction existe
pour éviter.

### 5. Le tampon se pose à la **composition**, pas à l'affichage

Conséquence assumée : une annonce composée puis jamais regardée est **perdue**.

C'est le prix de « aucune file qui grossit », et c'est cohérent avec « l'absence n'est pas un
événement ». Un accusé de lecture rouvrirait la file par la fenêtre. En pratique le risque est
mince : la composition et le rendu sont dans le même aller-retour.

### 6. Deux asymétries **assumées**, à ne pas « compléter »

**Le refus n'a pas de canal.** Papa fait « Ignorer » → Massimo n'apprend rien. **Jamais.** Un
refus est un acte parental ; faire porter le « non » par la machine l'abîme des deux côtés. Le
dégradé correct est le silence, plus la redemande **toujours gratuite** — que l'idempotence
ré-activante de `content_requests.create_request` gère déjà.

> **La boucle ne se ferme que sur le positif.** Écrit ici explicitement, sinon quelqu'un
> « complètera la symétrie » plus tard.

**La route 1 reste muette.** Quand Papa (ou ZETIS) produit **sans demande**, Massimo n'est averti
de rien — pastilles ambiantes seulement. Il n'a rien demandé, il n'y a **aucune promesse à
honorer**, et lui pousser du contenu non sollicité serait la relance interdite.

### 7. Le porteur : `ChatSessionOut`, et la session naît au **montage** de `/chat`

`ChatSessionOut` gagne `announcement: ChatAnnouncement | None`.

Corollaire du constat 5 : la session doit être créée **au montage de la page**, pas au premier
message. C'est le seul changement de comportement de cet addendum, et il est **conforme** au §4 —
« une session que Massimo a ouvert » désigne son geste d'ouvrir le chat, pas son premier mot. Le
pull reste strict : hors de cette session, l'annonce n'existe nulle part.

**Zéro `event_type` neuf.** Le tap d'une carte réutilise `chat_tool_response`, déjà câblé côté
front (`surfaceOf`). Zéro XP : recevoir une réponse n'est pas une performance.

## Périmètre

**Dans le lot** : deux colonnes `announced_at` (`content_requests`, `notion_requests`) + une
migration ; module `chat/announce.py` (composeur) ; `ChatAnnouncement` + champ sur
`ChatSessionOut` ; création de session au montage côté Massimo et rendu de l'annonce (karaoké +
TTS + cartes **existants**) ; mise à jour de `docs/frontend-massimo/page-chat.md`.

**Hors lot** : toute surface Papa (il n'a rien à faire de plus que ce qu'il fait déjà) ; les
branches `quiz`/`capsule` de `_notion_route` ; l'annonce de contenu produit sans demande ;
`production_runs`, la matrice des paliers et `parent_rule` (chantiers suivants) ; le lot de
corrections (`MissionStudentOut.origin`, page Paramètres morte).

## Conséquences

### Positives

- La phrase « je le note pour Papa » **devient vraie de bout en bout**. C'était une dette
  d'honnêteté active en production.
- **Aucune table nouvelle**, aucun `event_type`, aucun composant : deux colonnes et un composeur.
- Le prédicat de disponibilité unique gagne un **troisième consommateur** sans se dédoubler.
- La dette existante se solde d'elle-même : les demandes déjà `done` avant cette slice
  s'annonceront à la prochaine ouverture — **si et seulement si** leur contenu est réellement là.

### Négatives / coûts

- Une requête et (au plus 3) embeddings de plus à l'ouverture de `/chat`. Bornés, et seulement
  s'il y a des lignes éligibles.
- La création de session au montage consomme une session Redis même si Massimo ne parle pas.
  Le quota porte sur les **tours**, pas sur les sessions — pas de régression fonctionnelle.
- Une annonce composée et jamais lue est perdue (§5). Assumé.

## Suivi

Tests-verrous exigés — chacun interdit une régression **silencieuse** :

1. Une demande `done` dont le contenu n'est **pas** disponible ne s'annonce pas **et n'est pas
   tamponnée**. *(le §2 — le test le plus important du lot)*
2. Une demande `dismissed` n'est **jamais** annoncée. *(le §6)*
3. Cinq demandes prêtes → **2 nommées, 5 tamponnées**. *(le §4)*
4. Deuxième ouverture consécutive → aucune annonce. *(le §1, auto-extinction)*
5. Un contenu produit **sans demande** ne déclenche rien. *(le §6, route 1 muette)*
6. Un `notion_request` `added` dont le texte ne résout pas → pas d'annonce, `announced_at` reste
   `NULL`. *(le §3)*
7. La slice n'ajoute **aucun** `event_type` au vocabulaire d'`activity/events.py`.
8. Toute `route` d'une action d'annonce provient de `_notion_route` — aucune destination
   construite dans `announce.py`.
