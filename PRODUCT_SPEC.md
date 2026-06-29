# PRODUCT_SPEC.md — Spécification produit ZETIS

## Problème à résoudre

Massimo doit entrer en 4e avec des bases fragiles issues d’une 5e difficile. Il faut suivre le programme de 4e sans laisser les lacunes de 5e bloquer la compréhension. Papa veut un système capable d’aider Massimo régulièrement, sans devoir tout refaire manuellement chaque soir.

## Solution

ZETIS est un compagnon IA éducatif qui combine :

- diagnostic ;
- explications ELI5 ;
- quiz ;
- missions ;
- cartes mentales ;
- vocal ;
- capsules IA ;
- répétition espacée ;
- dashboard parent.

## Personas

### Massimo

- Collégien.
- Besoin d’explications simples, rapides et rassurantes.
- Préfère le gaming, le visuel, le vocal et les objectifs courts.
- Peut être découragé par les gros blocs de texte.
- Doit comprendre qu’il progresse.

### Papa

- Pilote le projet.
- Veut voir la progression réelle.
- Veut identifier les lacunes.
- Veut générer du contenu sans tout coder ou rédiger.
- Veut garder la main sur les décisions importantes.

### ZETIS

- Assistant pédagogique.
- Explique, questionne, reformule, encourage.
- Garde mémoire des notions vues.
- Propose la prochaine meilleure action.

## Principes UX

### Pour Massimo

- Une action principale par écran.
- Des phrases courtes.
- Des objectifs visibles.
- Des retours positifs.
- Pas de surcharge parentale.
- Un design gaming sobre.
- Un avatar ZETIS présent mais non envahissant.

### Pour Papa

- Données synthétiques d’abord.
- Détails disponibles au clic.
- Alertes actionnables.
- Configuration claire.
- Possibilité de valider ou corriger l’IA.

## Parcours principal Massimo

```txt
Accueil → Mission du jour → Explication ELI5 → Quiz → Feedback → XP → Prochaine étape
```

## Parcours principal Papa

```txt
Dashboard → Lacunes prioritaires → Missions générées → Validation éventuelle → Suivi progression
```

## Modules fonctionnels

### Accueil Massimo

Affiche :

- salutation ;
- mission du jour ;
- progression XP ;
- prochaine révision ;
- raccourcis matières ;
- message ZETIS.

### Matières

Matières prévues :

- Français ;
- Mathématiques ;
- Histoire-Géo ;
- SVT ;
- Anglais ;
- Espagnol ;
- Physique-Chimie ;
- Technologie.

Chaque matière a une page dédiée.

### Diagnostic

Sert à :

- mesurer les prérequis ;
- repérer les lacunes ;
- orienter les missions ;
- suivre les progrès dans l’année.

Il doit être réutilisable : avant rentrée, fin de trimestre, avant conseil de classe, après mauvaise note, après période de pause.

### ELI5

Deux modes :

1. ZETIS explique à Massimo.
2. Massimo explique à ZETIS.

Canaux :

- écrit ;
- vocal STT ;
- mindmap.

### Capsules IA

Les capsules sont de courtes explications générées pour une notion précise.

Responsabilité :

- Massimo peut les regarder.
- Papa peut les générer, valider, classer et supprimer.
- ZETIS peut en proposer automatiquement si une notion bloque.

### Missions

Une mission est une séquence orientée objectif :

- comprendre une notion ;
- refaire un exercice ;
- corriger une erreur ;
- réviser une carte ;
- expliquer une notion.

### Quiz

Un quiz mesure une compétence ou une notion. Il peut appartenir à une mission.

### Progression

La progression combine :

- XP ;
- niveau global ;
- niveau par matière ;
- maîtrise des notions ;
- régularité ;
- lacunes résolues.

## Modules Papa

### Dashboard

Vue synthétique :

- activité récente ;
- progression ;
- alertes ;
- missions terminées ;
- lacunes prioritaires ;
- suggestions IA.

### Conseil de classe IA

Synthèse périodique par matière :

- points forts ;
- points fragiles ;
- attitude de travail ;
- recommandations ;
- plan d’action.

### Cahier de bord IA

Journal chronologique :

- sessions ;
- difficultés ;
- progrès ;
- contenus générés ;
- décisions Papa ;
- événements importants.

### Années scolaires

Papa peut configurer :

- niveau ;
- matières ;
- périodes ;
- objectifs ;
- programmes ;
- mode IA automatique, hybride ou manuel.

## Critères de réussite du MVP

- Massimo utilise l’app sans aide constante.
- Papa comprend en 2 minutes ce qu’il doit faire ensuite.
- Une lacune détectée produit une mission.
- Une mission produit un apprentissage mesurable.
- Les données persistent.
- L’IA a une trace et peut être corrigée.

## Hors scope MVP

- SaaS public.
- Facturation.
- Multi-écoles.
- Marketplace de cours.
- App iOS native.
- Vidéo IA entièrement automatisée haute qualité.
- Classement social.
