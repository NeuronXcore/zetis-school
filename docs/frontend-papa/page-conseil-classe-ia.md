# Page Papa — Conseil de classe IA

## Objectif

Produire une synthèse périodique par matière, comme un mini conseil de classe personnalisé.

## Sections

- Résumé global.
- Synthèse par matière.
- Points forts.
- Points fragiles.
- Évolution récente — **typée `Evolution | str | null`**, voir ci-dessous.
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

### Ce que le Lot 3 a rempli (prompt v4)

Une matière qui **porte** des bascules reçoit désormais la structure du §8 :

```txt
{ since: "2026-07-10",                                   ← history_since, PAS period
  transitions: [ { skill_id, skill_name, from, to, changed_at } ],   ← SERVEUR
  comment: "…" | null }                                  ← LLM, et lui seul
```

🔴 **Le modèle ne produit AUCUNE date.** Il reçoit les bascules en **liste fermée** et n'en rend
qu'un commentaire. L'ancrage est donc **structurel** : il n'y a pas de date à filtrer après coup,
parce qu'il n'y a pas de date à inventer. C'est plus fort que le patron `skill_id`, où le modèle
émet des identifiants que le serveur revalide.

🔴 **Les bascules se rendent même sans commentaire.** Elles sont la mesure ; le commentaire n'en est
que la lecture. Une section conditionnée au bon vouloir du LLM ferait dépendre une donnée serveur
d'un artefact — l'inversion exacte que ce chantier corrige.

⚠️ **`since` n'est pas `period`** (§9), et les deux ne partagent pas un nom : `period` est une
étiquette qui ne sélectionne aucune donnée, `since` est une date réelle. Conséquence assumée et
**déclarée dans le prompt** : un rapport mêle deux natures — des bascules datées et une maîtrise
sans fenêtre.

⚠️ **La borne est celle de l'ÉLÈVE, pas de la matière.** En portée matière, `since` peut donc
précéder la première bascule de cette matière-là. Elle dit « voilà depuis quand on trace », jamais
« voilà depuis quand ça bouge ».

⚠️ **Le type est une UNION de trois formes**, et l'écran les distingue par le type, jamais par une
devinette sur le contenu : la structure (v4+), la `str` d'un rapport figé avant le Lot 3, et `null`.
Un type qui n'accepterait que la structure ferait échouer la lecture de **tout l'historique**.

⚠️ **`v3` → `v4` parce que le prompt bouge.** Deux prompts sous un même numéro rendraient
`prompt_version` menteur — et c'est lui qui décide de la marque de lecture.

## La période nomme, elle ne sélectionne pas

🔴 **Défaut mesuré en base le 2026-08-06** : un rapport intitulé *« 7 derniers jours »* dont le
propre `evidence_snapshot_json` dit *« Évidence à l'instant — état courant, pas de fenêtre
temporelle »*. L'étiquette annonçait une semaine sur des données couvrant tout l'historique. Le
rapport étant **figé**, le mensonge devenait rétroactivement indiscernable du vrai — exactement le
défaut que le §8 corrige pour `recent_evolution`, reproduit un cran plus haut.

L'écran le dit désormais, sous le titre : *la période est une **étiquette**, elle ne restreint pas
les données ; le conseil s'appuie sur l'**état courant**, seules les **bascules de palier** sont
datées*. Le champ le redit au survol.

⚠️ **Le transport depuis le dashboard est CONSERVÉ.** Le lien profond garde son sens — Papa arrive
avec le nom de ce qu'il regardait. C'est la **lecture** qu'on corrige, pas le transport ; les
verrous de `?period=` (2026-08-05) restent valides.

⚠️ **Pas de calendrier**, et c'est une décision : une date est une affirmation *précise*, là où une
étiquette n'est que vague. Tant que le service d'évidence n'a pas de vraie fenêtre temporelle
(chantier à part, hors périmètre de l'ADR-0040), un sélecteur de dates promettrait une sélection
que personne n'honore. Depuis le Lot 3, **une moitié** du rapport serait fenêtrable — les bascules
— mais un rapport à moitié fenêtré sous une date unique se lirait comme entièrement fenêtré.

## L'historique des rapports

La bande `Rapports :` est la **seule porte** vers les anciens conseils — rien n'est jamais supprimé
(aucune route `DELETE`, aucune purge, aucune rétention).

🔴 Chaque pastille n'affichait que `period` : neuf rapports lisaient *« Trimestre 1 · Trimestre 1 ·
7 derniers jours · … »*. Un historique où rien ne se distingue n'est pas un historique. Elle porte
maintenant **la date de génération** — la seule vraie — **et la matière ciblée**, toutes deux déjà
servies (zéro appel réseau de plus), plus un **✳** sur les rapports antérieurs au daté. L'étiquette
de période passe en infobulle : elle a sa place, pas au premier plan.

⚠️ Visible **dès le premier rapport** : la masquer tant qu'il n'y en a qu'un la rendait
introuvable au moment précis où Papa apprend qu'elle existe.

⚠️ **`list_reports` ne borne rien** — à cinquante rapports, la bande sera illisible. Constat posé,
non traité.

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
