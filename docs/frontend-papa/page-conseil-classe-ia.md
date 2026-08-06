# Page Papa — Conseil de classe IA

## Objectif

Produire une synthèse périodique par matière, comme un mini conseil de classe personnalisé.

## Sections

- Résumé global.
- Synthèse par matière.
- Points forts.
- Points fragiles.
- Évolution récente — **typée `str | null`**, voir ci-dessous.
- Recommandations.
- Plan d’action.

## Évolution récente : le serveur a le dernier mot (ADR-0040 §8)

Le champ était un `str` **non-nullable** pour une valeur qu'aucune source ne pouvait produire — le
`period` du Conseil ne sélectionne aucune donnée. Le producteur remplissait donc **par obligation
de type**, et la phrase inventée était figée dans `subjects_json`, devenant rétroactivement
indiscernable d'une observation réelle.

Depuis le Lot 0 :

- le champ est **nullable**, et le serveur l'**écrase à `null`** après la validation typée quand
  l'évidence ne porte aucune bascule de palier sur la matière — **quoi que le modèle ait écrit**.
  Avec l'évidence d'aujourd'hui, cela le vide **partout** : c'est le comportement attendu, pas une
  régression ;
- 🔴 **l'absence s'écrit.** `null` ne rend pas une section vide mais une phrase : *« aucune bascule
  de palier sur la trace disponible — absence de trace, pas absence de mouvement »*. Masquer la
  section laisserait lire « aucun mouvement » là où il faut lire « aucune trace » ; les deux ne se
  corrigent pas l'un l'autre ;
- **marque de lecture** dérivée de `prompt_version` : tout rapport `< v3` affiche
  *« évolution rédigée sans historique daté »* à côté de sa prose. **Aucun rapport figé n'est
  réécrit** — un artefact LLM n'est pas rejouable. La marque est **auto-périmée** : elle s'éteint
  d'elle-même à mesure que les rapports v3 s'accumulent.

Le Lot 3 remplira ce champ avec des bascules réelles (`{since, transitions[], comment}`) ; le Lot 0
se contente de l'empêcher de mentir.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Conseil de classe IA                                         │
├──────────────────────────────────────────────────────────────┤
│ Période : Trimestre 1                                        │
│ [Générer synthèse] [Exporter Markdown]                       │
│                                                              │
│ Français                                                     │
│ Points forts : lecture plus régulière                        │
│ À renforcer : temps du récit, justification des réponses     │
│ Action : 2 missions courtes + 1 ELI5 reverse                 │
│                                                              │
│ Mathématiques                                                │
│ Points forts : calcul mental en progrès                      │
│ À renforcer : nombres relatifs                               │
└──────────────────────────────────────────────────────────────┘
```

## Données API

- `POST /ai/reports/class-council`
- `GET /reports/class-council?period=`
