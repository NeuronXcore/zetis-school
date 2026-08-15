# Addendum ADR-0030 — le témoin d'ELI5, ou le §2 payé plutôt que contourné

## Statut

**Accepté — 2026-08-15.** Décision du **commanditaire**.

> **AMENDE la CONSÉQUENCE du §2 de l'`adr-0030`**, et son §3.
>
> ⚠️ **Le §2 lui-même n'est pas amendé, et il sort de ce chantier renforcé.** Voir ci-dessous.

## Ce qui est décidé

**L'entrée « 💡 ELI5 » de la sidebar de Massimo porte un témoin numérique.**

Il compte les **notions ELI5-éligibles que ZETIS n'a jamais expliquées à Massimo**.

- Il **naît** de la validation d'une leçon porteuse par Papa (une notion de plus devient
  explicable).
- Il **meurt d'un regard** — la première explication demandée sur cette notion.
- Il repose sur une **table de vue neuve**, `eli5_views`, une ligne par (élève, notion).

## Le §2 n'est pas contourné, il est payé

Le §2 de l'`adr-0030` pose :

> *« Un compteur n'est éligible que s'il est adossé à une trace de vue (`seen`, `view`,
> `last_seen`). Un compteur de récence décroît par le temps et non par le regard : il allumerait une
> entrée fraîchement visitée et s'éteindrait sans avoir été lu. »*

**Cette phrase reste vraie mot pour mot**, et le compteur qu'elle visait — le `new_count` de
`student_notions_summary`, une fenêtre de 7 jours sur `Lesson.created_at` — reste **inéligible**.

Ce qui change, c'est la conséquence que le §2 en tirait :

> *« Conséquence directe : ELI5 n'a pas de badge de navigation. »*

La conséquence était juste **à trace de vue constante**. On ne réutilise pas le compteur de récence :
on **crée la trace qui manquait**. Le §2 en sort renforcé — « la récence ne suffit pas » devient
« alors on paie la table ».

## Bornes

1. 🔴 **Le témoin est adossé à `eli5_views`, jamais au `new_count` de récence.** Les deux coexistent,
   sur le patron exact de `new_cards_count` face à `get_reviews_summary` (`adr-0030` §3, encadré du
   2026-08-01) : deux fonctions voisines, deux objets, chacune renvoyant à l'autre en docstring. Un
   test-verrou vérifie que le source du compteur ne contient ni `NOTION_NEW_WINDOW_DAYS`, ni
   `created_at`, ni `timedelta`, **et** que les deux nombres diffèrent dans un monde construit pour
   qu'ils diffèrent (N5).
2. **Une ligne par (élève, notion), aucun compteur d'ouvertures.** Doctrine reprise mot pour mot de
   `mindmap_views` : un compteur qu'on n'affiche nulle part finit par être affiché quelque part, et
   « combien de fois Massimo a redemandé la même explication » n'est pas une information de
   navigation.
3. **Le geste qui éteint est l'EXPLICATION DEMANDÉE**, et rien d'autre : ni l'affichage d'une chip,
   ni l'ouverture de l'écran d'une matière, ni le survol d'un deck. Et **seulement sur succès** —
   une explication qui échoue (provider indisponible) ne marque rien.
4. **ELI5 reverse ne marque rien.** Reformuler une notion avec ses propres mots est du **travail**,
   pas un regard. Le confondre avec l'ouverture ferait entrer le témoin dans la colonne interdite du
   §1 par la petite porte.
5. **La population est celle que la page MONTRE** (`student_subject_notions` : chapitre validé →
   leçon validée → `LessonSkill`, année active). Si la page restreint un jour, le compteur restreint
   avec elle — un test d'égalité les lie (N6). Un badge qui compte plus que ce que sa page montre est
   un badge qu'on ne peut pas éteindre (B2).
6. **🔴 Point zéro à la pose : tout l'existant est marqué vu.** La migration insère dans `eli5_views`
   **toutes** les notions éligibles au jour de la pose. Le témoin démarre donc à **0** et ne compte
   que ce qui arrive **ensuite**.
   - **Ceci n'amende pas** l'« aucun backfill » de l'`adr-0030` §4, qui refusait de marquer vu ce
     qui n'avait *jamais* été ouvert. Ici on ne prétend rien sur le passé : on pose l'**origine du
     témoin**. Un témoin de nouveauté né aujourd'hui n'a, par définition, aucune nouveauté à
     annoncer — le passé n'est pas de la nouveauté, c'est de l'arriéré.
   - **Conséquence assumée, à dire** : Massimo ne verra **jamais** de badge pour les 267 notions
     déjà en base. Sans le point zéro, le badge afficherait `9+` figé pendant des mois (236 au
     cadrage), ce qui n'informe de rien (B3).
   - `eli5_views` est **neuve et lue par le seul témoin** : aucun autre calcul n'en dépend, donc le
     point zéro ne fausse rien. C'est exactement ce qui n'est pas vrai pour Matières (voir la borne 6
     de `adr-0030-addendum-temoin-matieres.md`).
7. **Bornes transverses B1–B4** : voir `docs/decisions/adr-0030-addendum-temoin-matieres.md`. En
   particulier **B1** — ce témoin meurt d'un regard, il n'entre pas dans `DEROGATIONS`.

## Alternatives écartées

- **Réutiliser le `new_count` de récence** — zéro migration, et c'est exactement ce que le §2
  interdit. Le badge décroîtrait tout seul et se rallumerait sur une entrée fraîchement visitée.
- **Réutiliser `lesson_views`** (leçons validées jamais ouvertes) — zéro migration aussi, mais le
  compteur serait alors **strictement identique** à celui de Matières : deux entrées de sidebar
  affichant le même nombre pour deux raisons différentes. C'est le doublon que le §3 redoutait, et
  ici il serait réel.
- **Marquer vu dans `POST /ai/eli5/explain`** plutôt que par une route dédiée — supprimerait un
  aller-retour, sur le précédent de `mark_lesson_seen` dans `GET /lessons/{id}/cours`. Écartée : le
  marquage deviendrait invisible dans le contrat d'API et intestable seul.

## Le signal qui dirait qu'on s'est trompé

- **Le badge reste durablement à `9+`** : le rythme de validation de Papa dépasse le rythme
  d'exploration de Massimo. La réponse est le robinet, pas le badge.
- **Massimo demande des explications pour éteindre la pastille** — visible à des explications
  enchaînées sans lecture, sur les notions les plus courtes.
- **Le badge ne bouge jamais** : plus aucune leçon n'est validée, et le défaut est ailleurs.
- ⚠️ Aucun des trois n'est mesuré. Ils se regardent, ils ne s'alertent pas.

## Mise en œuvre

- Table `eli5_views` (élève, notion, `seen_at`, unicité) — calque de `mindmap_views`.
- Route `POST /api/ai/eli5/skills/{skill_id}/seen` → 204, idempotente.
- Compteur `eli5/service.py::new_eli5_count`, entrée `"eli5"` dans `NEWS_SOURCES` et champ dans
  `NewsSummary`.
- Côté client, l'émission vit dans `lib/eli5.ts` **à côté de l'écriture**, jamais dans une page
  (doctrine `newsEvents.ts`) : l'entonnoir `explainEli5` couvre la chip, la question libre résolue,
  le deep-link `?skill_id=` et la modale de mission.
- `navigation.ts` : le motif d'origine (« critère de RÉCENCE ») est **conservé, barré et daté**, pas
  effacé. Un motif effacé se réinvente ; un motif barré non.
- `docs/frontend-massimo/page-eli5.md` : dire que le `new_count` de récence reste **en page** et
  qu'il n'est **pas** le témoin de navigation.

## Voir aussi

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (§2 — la règle, non amendée ; §4 — le
  « aucun backfill », non amendé)
- `docs/decisions/adr-0030-addendum-temoin-matieres.md` (bornes transverses B1–B4)
- `docs/decisions/adr-0030-addendum-temoin-quiz.md`
