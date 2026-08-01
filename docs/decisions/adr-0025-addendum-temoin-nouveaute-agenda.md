# Addendum ADR-0025 — §12 · Témoin de nouveauté ≠ compteur d'arriéré

> À concaténer à la fin de `docs/decisions/adr-0025-agenda-scolaire.md`.
> Statut : **Accepté — 2026-08-01**. Ne rouvre aucune des décisions §1–§11.
> **Révoque une interdiction explicite** portée par `docs/frontend-massimo/page-agenda.md`
> (« Aucune pastille de compteur sur l'entrée, sous aucune forme ») — voir §12.4.
> Prérequis du chantier **ADR-0030 — Témoins de nouveauté en navigation**, dont l'agenda est
> le cas limite et le seul à exiger un addendum.

## Contexte

L'ADR-0025 §3 refuse d'émettre `agenda_item_missed` : *l'absence n'est pas un événement*.
`page-agenda.md` en a tiré, côté navigation Massimo, une interdiction plus large — **aucune
pastille, sous aucune forme** — au motif qu'un compte d'items non faits contournerait
l'invariant serveur par l'affichage.

Le motif est juste. La portée est trop large.

Le chantier ADR-0030 dote les entrées de sidebar d'un **témoin de nouveauté** : un compteur de
ce qui est arrivé depuis la dernière visite, qui décroît parce que Massimo **regarde**. Sur
Agenda, ce témoin dit « papa a rempli ton cahier de texte » — exactement la sémantique d'une
fiche qui arrive. L'interdiction écrite l'attrape pourtant au passage, alors qu'elle visait un
autre objet.

Sans cet addendum, le chantier ADR-0030 devrait soit exclure l'agenda de sa règle unique — et
fabriquer un cas particulier dans la seule entrée dont le contenu vient de l'extérieur — soit
contredire silencieusement une phrase écrite en toutes lettres dans la spec de page. Les deux
sont pires que de trancher ici.

## Décision

### 12.1 — Le test qui sépare les deux objets

> **Une date qui passe sans que Massimo agisse change-t-elle le compteur ?**
> Arriéré : **oui**. Nouveauté : **non**.

Un témoin de nouveauté naît d'un **geste de Papa** (l'item est créé) et meurt d'un **regard de
Massimo** (la surface est ouverte). Il ne connaît ni `due_on`, ni `done_at` : le temps qui passe
ne le fait pas bouger, et le travail accompli non plus.

Un compteur d'arriéré naît d'une **date franchie** et ne meurt que par le **travail**. C'est la
forme affichée de `agenda_item_missed`, et §3 le rend impossible à produire côté serveur comme
côté client — cet addendum le réaffirme sans réserve (§12.5).

### 12.2 — Le badge est **chiffré**, comme partout ailleurs

Une pastille muette a été envisagée puis écartée : elle dit *il y a du nouveau* sans dire
combien, ce qui est une alarme vague — plus anxiogène qu'un nombre, pas moins, dans la seule
entrée qui parle de charge scolaire réelle.

Surtout, la retenir aurait contredit le §1 de cet ADR. Celui-ci a déjà tranché que la charge
scolaire **subie** peut être montrée datée à Massimo, parce que la masquer ne supprime pas la
pression mais son moyen de s'organiser. Refuser le chiffre là où l'ADR autorise la date aurait
été incohérent.

Forme retenue : **identique aux autres entrées** (ADR-0030) — plafonné `9+`, absent à zéro,
aucune pulsation, aucun rouge, jamais l'or (réservé à ZETIS qui parle) ni l'ambre (couleur des
files de validation Papa). Zéro cas particulier.

### 12.3 — La donnée : un high-water mark par élève, **jamais un `seen_at` par item**

C'est le point structurant de cet addendum, et le seul qui touche le modèle.

Un badge exige de savoir ce qui a déjà été vu. La pente naturelle est une colonne `seen_at` sur
`agenda_items`. **Elle est interdite** : jointe à `done_at`, elle fabrique la donnée « vu le 12,
jamais fait », lisible côté Papa par l'asymétrie de visibilité (§2c). C'est la surveillance qui
rentre par la porte de service que §2a et §2b passent leur temps à condamner — et un objet
strictement pire que le compteur qu'on cherchait à éviter, parce que persisté.

Retenu : **un seul horodatage par élève**, `agenda_last_seen_at`.

```txt
badge = count(agenda_items
              where created_at > agenda_last_seen_at
                and dismissed_at is null
                and not hidden_by_student)
```

- Écrit à `now()` à **l'ouverture de `/agenda`** et **au rendu du bandeau d'Accueil** — les deux
  surfaces où Massimo lit ce qui est arrivé. N'en retenir qu'une ferait mentir le badge sur ce
  qu'il a déjà lu.
- **Jamais servi à Papa** : absent de `AgendaItemPilotOut` et de toute sortie de `/api/agenda`.
  Symétrique exact de `parent_note`, jamais servie à Massimo (§2b).
- Aucune colonne sur `agenda_items`, aucune donnée d'attention par item, rien de joignable à
  `done_at`. La granularité *est* la protection.

Emplacement : à trancher au read-before-code entre une colonne sur le profil élève et une ligne
`app_settings` scopée — le patron de `AGENDA_STUDENT_ENTRY_ENABLED` existe déjà. Le choix est
d'implémentation, pas de doctrine ; l'invariant est **un enregistrement par élève, pas par item**.

### 12.4 — Ce que cette décision révoque, et ce qu'elle ne révoque pas

**Révoqué** : la phrase de `page-agenda.md` — « Aucune pastille de compteur sur l'entrée, sous
aucune forme : un compte d'items non faits contournerait par l'affichage l'invariant *non
probant* tenu serveur ». Elle est réécrite pour autoriser le témoin de nouveauté et **réaffirmer
dans le même paragraphe** l'interdiction du compteur d'items non faits. Les deux se ressemblent
assez pour devoir être lus côte à côte : les séparer garantit qu'une prochaine session tranchera
au hasard.

**Non révoqué, et rappelé** : §3 (`agenda_item_missed` n'existe pas), §7 (« aucun compteur
d'arriéré » parmi les interdits transverses des surfaces Massimo), §9 (aucun compteur d'items
non faits en KPI côté Papa).

### 12.5 — Ce que le badge ne fera jamais, et pourquoi il ne suffit pas

Le témoin compte ce qui est **arrivé**, pas ce qui **reste à faire**. Papa saisit le dimanche
soir ; lundi matin le badge affiche `4` ; Massimo ouvre, il tombe à `0` — **et il reste à `0`
toute la semaine**, pendant que les quatre échéances existent toujours.

Ce n'est pas un défaut à corriger : c'est la définition. Un témoin de nouveauté est
structurellement incapable d'être un plan de travail, et vouloir le rendre capable revient
exactement à en faire un compteur d'arriéré.

La question « qu'est-ce que j'ai à étudier ? » est déjà servie par deux surfaces, et le reste :

- le **bandeau d'Accueil** (Aujourd'hui / Demain, 3 items, aucune date) — l'information sans le
  déplacement ;
- la **bande glissante de `/agenda`** (§6, 3 jours avant / 10 après) — chaque item avec son état.

Si elles n'y suffisent pas, le défaut est dans leur composition et relève d'un chantier agenda.
**Aucune évolution de la navigation ne doit y répondre.**

## Conséquences

**Positives** — l'ADR-0030 garde une règle unique et zéro exception ; la distinction *nouveauté /
arriéré* est écrite une fois, avec son test opérationnel, et devient opposable aux prochains
chantiers ; l'agenda cesse d'être la seule surface dont les arrivées sont invisibles hors
navigation ; l'interdiction réelle (le compteur d'arriéré) en sort **renforcée**, parce que
formulée par contraste plutôt que par excès de portée.

**Négatives / coûts** — un horodatage de plus à persister et deux points d'écriture à ne pas
oublier ; un badge qui retombe à zéro sans que rien ne soit fait, accepté et documenté en §12.5 ;
une décision révoquée sur un ADR de trois jours — écrit ici pour être lisible plus tard, pas pour
être répété ; et une tentation permanente, qu'aucun test ne peut clore définitivement, de « rendre
le badge utile » en le branchant sur les échéances non cochées.

## Suivi

- **Test-verrou** : le badge d'un élève ne change pas quand une échéance franchit sa date, ni
  quand un item est coché. Seules la création d'un item et l'ouverture d'une surface le font
  bouger. C'est le test qui protège cet addendum de sa propre pente.
- **Test-verrou** : `agenda_last_seen_at` n'apparaît dans **aucune** réponse de `/api/agenda`
  (miroir du test de non-fuite de `parent_note`).
- Réécriture du paragraphe « Accès — deux portes dès le Lot 1 » de `page-agenda.md` (§12.4).
- Ligne à ajouter dans `DECISIONS.md` sous ADR-0025 (« + addendum §12 — témoin de nouveauté »).
- Implémentation **dans le lot ADR-0030**, pas isolément : l'endpoint agrégé et l'invalidation
  par événement y sont déjà.
- Commit suggéré : `feat(agenda): student-scoped last_seen watermark for navigation news badge`.

## Décisions validées (commanditaire, 2026-08-01)

1. **Badge chiffré sur l'entrée Agenda**, forme identique aux autres entrées — retenu ; la
   pastille muette d'abord proposée est écartée comme incohérente avec §1.
2. **`agenda_last_seen_at` par élève, jamais de `seen_at` par item** — retenu ; c'est la
   granularité qui empêche la donnée « vu et non fait » d'exister.
3. **Le compteur d'items non faits reste interdit**, côté Massimo comme côté Papa — réaffirmé
   dans le même paragraphe que l'autorisation, jamais ailleurs.
