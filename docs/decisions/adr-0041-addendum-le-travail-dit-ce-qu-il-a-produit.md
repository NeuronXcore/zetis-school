# ADR-0041 addendum — Un travail dit ce qu'il a produit

## Statut

**Accepté — 2026-08-09.** Six décisions gelées. Aucune migration, aucun endpoint neuf, aucune
requête réseau supplémentaire.

> Cadré le 2026-08-09 selon le rituel `mockup → spec → ADR → prompt`, sur `main`, à partir d'une
> observation du commanditaire à l'écran : *« on n'arrive pas à savoir si les data ont été créées
> ou pas »*. Le read-before-code a été rendu **avant** toute décision, et il a **démenti quatre
> points** du cadrage annoncé — ils sont consignés ci-dessous et deux d'entre eux changent la
> conception.

## Contexte

L'ADR-0041 s'appelle « tout ce qui produit se voit ». Sa doctrine a été appliquée aux **lots**
(`ProductionRun`) : l'en-tête raconte le lot, le pli montre chaque pièce avec son issue
(`generated` / `skipped` / `blocked` / `error`) et un lien vers la pièce produite.

Elle n'a **jamais été appliquée aux travaux unitaires** (`AIJob`, « hors lot »). `_travail_out`
(`production/journal.py:538`) lit `job.input_json` et **jamais** `job.output_json`. La ligne rend
donc son libellé, son statut, sa durée, sa date et son origine — et rien d'autre.

Conséquence, observée à l'écran le 2026-08-09 sur sept lignes consécutives : **trois issues
radicalement différentes rendent trois lignes identiques.**

| Ligne à l'écran | Ce qui s'est réellement passé |
|---|---|
| `Équipement · Quotient de relatifs — fait · 0 s` | 🔴 **rien produit** — `generated: []`, cinq pièces `skipped` |
| `Cartes de révision · Magma — fait · 6 s` | 3 cartes créées |
| `Diagnostic — fait · 113 s` | un quiz de 40 questions |

« Fait » veut dire *« le programme est allé au bout »*. Papa lit *« la donnée existe »*. Les deux
divergent, et la ligne du haut est la preuve que la divergence est réelle, pas théorique.

🔴 **C'est le motif de l'ADR-0037 pris à l'envers.** Là-bas, du contenu produit était invisible ;
ici, l'écran laisse croire à une production qui n'a pas eu lieu. Même famille : l'écran et la base
ne disent pas la même chose, et rien ne rougit.

## Constat read-before-code — quatre points démentis

**1. 🔴 « Il suffit de lire `output_json` » est vrai, mais pas celui qu'on croit.** Le Journal
n'affiche que les lignes `created_by == 'file'` — les traces d'appel LLM (`created_by == 'parent'`)
sont volontairement exclues (`journal_filters.selectionner_travaux`, *« 143 traces pour une poignée
de gestes »*). Or les deux lignes d'un même travail ne portent pas la même chose :

| `job_type` | ligne VISIBLE (`file`) | trace exclue (`parent`) |
|---|---|---|
| `lesson_content` | `{"lesson_id": 114}` | `{"content_chars": 4942, "model": …}` |
| `curriculum_lessons` | `{"chapter_id": 44, "lesson_ids": [114, 115, 153, 154, 155, 156, 157]}` | `{"lessons_count": 5, "skills_created": 7, …}` |
| `srs_cards_generate` | `{"skill_id": 149, "created": 3, "updated": 0, …}` | `{"cards": [ … ]}` |
| `diagnostic_generate` | `{"quiz_id": 57, "subject": "Histoire-Géo", "questions_count": 40}` | — |
| `equip_notion` | `{"skill_id": 64, "generated": [], "skipped": [ … ], "errors": [], "reason": null}` | — |

**La longueur du cours n'est donc PAS disponible** sur la ligne visible. Le résumé dira « cours
rédigé », pas « 4 942 caractères » — aller la chercher demanderait de lire une seconde ligne, et
c'est un couplage qu'on refuse pour un ornement.

**2. 🔴 La forme de lien existante ne convient pas.** `BlockedTargetOut` exige `lesson_id` **et**
`chapter_id`, tous deux non-nuls. Or un diagnostic n'a **aucune leçon** (il est notion-centré),
`curriculum_lessons` a un chapitre mais **sept** leçons, et `srs_cards_generate` n'a qu'un
`skill_id`. La réutiliser obligerait à **fabriquer des valeurs** pour satisfaire un type — soit
exactement ce que `journalLink` et `reviewLink` ont déjà refusé de faire deux fois, chacun avec sa
branche explicite plutôt qu'« une cinquième entrée forcée dans un type qui ne la veut pas ».

**3. 🔴 Un diagnostic n'est toujours pas ouvrable par URL.** `reviewLink:86` porte un `null` assumé
et daté : *« la page `/diagnostics` ne sait pas encore ouvrir un diagnostic précis : sa refonte est
la session C de l'adr-0043 »*. Cette session **a été livrée** (PR #99) — le commentaire pourrait
donc être périmé. Vérifié : il ne l'est pas. `DiagnosticsPapaPage` tient son focus en `useState`,
sans `useSearchParams`. Un lien y déposerait Papa au hasard.

**4. ⚠️ `equip_notion` est le seul type déjà complet** : `generated`, `skipped`, `errors` et
`reason` sont tous écrits. C'est aussi le seul dont l'issue « rien produit » soit nommable
précisément — et c'est le cas qui a déclenché ce chantier.

## Décisions

**Décision 1 — le résumé est calculé SERVEUR, en un seul endroit.** Une fonction
`resume_de_production(job, …)` dans `production/journal.py`, une règle par `job_type`. Motif
ADR-0037 : « qu'a produit ce travail » doit avoir **une** réponse dans le dépôt. Un `switch` en
TypeScript serait une seconde définition, qui divergerait au premier `job_type` ajouté.

**Décision 2 — le champ ajouté est `production`, et il porte une ROUTE, pas une cible
leçon-centrée.**

```
production: { texte: str, ton: "succes"|"neutre"|"avertissement", route: str | None } | None
```

`route` est une route Papa toute faite (`/programme?subject=1&chapter=44&lesson=114`). C'est la
conséquence directe du constat 2 : trois des cinq types n'ont pas de leçon, et forcer
`BlockedTargetOut` fabriquerait des valeurs. ⚠️ **La composition des routes reste celle de
`pilotageLinks`** — le serveur produit les mêmes URL, il n'invente pas une seconde convention.

**Décision 3 — `route = None` dès que rien n'a été produit, et c'est un test-verrou.** Reprise
mot pour mot de la doctrine déjà écrite dans `journal.py:382` pour les pièces `skipped` : *« la
pièce existe, mais elle appartient à un autre moment ; la rattacher ici ferait croire que ce lot-là
l'a faite »*. Un travail qui n'a rien produit ne doit **jamais** rendre un lien.

**Décision 4 — le diagnostic n'a pas de route, et l'écran ne prétend pas le contraire.** `texte`
dit « 40 questions », `route` est `None`. **Dette nommée**, pas contournée : elle se lèvera quand
`/diagnostics` lira un paramètre d'URL, et le `null` de `reviewLink:86` tombera dans le même geste.

**Décision 5 — aucune migration, aucun appel réseau, une seule requête en lot.** Tout se lit dans
`output_json`, déjà chargé. Seule exception : `lesson_content` ne porte qu'un `lesson_id` et la
route Programme demande `chapter` et `subject` — d'où **une** requête en lot sur les leçons de la
page, exactement le patron que `_travail_out` utilise déjà pour les noms de notions (`names`).
🔴 **Jamais une requête par ligne.**

**Décision 6 — trois tons, et le troisième est le sujet de cet addendum.**

| Ton | Quand | Exemple |
|---|---|---|
| `succes` | quelque chose a été créé | « 3 cartes créées », « 7 leçons créées », « 40 questions » |
| `avertissement` | le travail a réussi et **n'a rien produit** | « rien produit — les 5 pièces existaient déjà » |
| `neutre` | issue sans production ni anomalie, ou type sans règle | « terminé » |

⚠️ **`avertissement` n'est pas une erreur** et son ton ne doit pas être rouge : ne rien produire
parce que tout existait déjà est un **résultat correct**. Il est signalé parce qu'il est
*surprenant*, pas parce qu'il est *mauvais* — même distinction que l'ambre du rail de fiabilité de
l'ADR-0048, « ambre jamais rouge ».

## Périmètre

**Dedans** : `resume_de_production` et ses règles, le champ `production` sur `JournalTravailOut`,
le rendu de la ligne `TravailSection` dans `JournalPage.tsx`, les types partagés, et leurs tests.

**Dehors, explicitement** :

- **les lignes de LOT** — elles ont déjà leur pli, leurs pièces et leurs liens ; y toucher serait
  la dérive ;
- **l'ouverture d'un diagnostic par URL** (décision 4) — c'est son propre chantier ;
- **la file de relecture** et le `null` de `reviewLink:86`, qui tombera avec elle ;
- **le veto** : un `AIJob` ne tamponne aucune pièce, il n'y a rien à retirer (§17 inchangé) ;
- **les traces `parent`**, qui restent hors du Journal ;
- **la longueur du cours** et toute donnée qui ne vit que sur une trace (constat 1).

## Conséquences

### Positives

- La question « est-ce que ça a créé quelque chose ? » se répond **sur la ligne**, sans ouvrir la
  base ni une autre page.
- Le cas « rien produit » devient **nommé** au lieu d'être indistinguable d'une production réussie.
- La doctrine de l'ADR-0041 cesse d'être vraie pour les seuls lots.

### Coûts assumés

- **Une règle par `job_type`** : dix-neuf entrées à `LIBELLE_JOB`, cinq règles écrites, le reste
  retombe sur `neutre`/« terminé ». ⚠️ Un `job_type` neuf sans règle **n'est pas un bug** — il
  dégrade proprement, et son absence de résumé se voit.
- **Le diagnostic reste sans lien** (décision 4). C'est le seul type dont on nomme la production
  sans pouvoir l'ouvrir.

## Le signal qui dirait qu'on s'est trompé

- Un travail affiche « rien produit » alors que Papa retrouve l'objet ailleurs → la règle du type
  lit le mauvais champ, **et le test-verrou ne l'a pas vu** ;
- une ligne mène à une page qui ne montre pas l'objet → la route est composée à côté de
  `pilotageLinks`, ce que la décision 2 interdit ;
- Papa cesse de lire le résumé parce qu'il dit « terminé » partout → trop de types sans règle, il
  faut en écrire, jamais retirer le repli.
