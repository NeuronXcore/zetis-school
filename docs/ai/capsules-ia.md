# IA — Capsules IA

## Objectif

Générer des mini-supports pédagogiques pour expliquer une notion difficile.

## MVP capsule

Une capsule V1 comprend :

- titre ;
- objectif ;
- script ;
- storyboard ;
- audio optionnel ;
- slides optionnelles ;
- quiz post-capsule.

## Génération

Déclencheurs :

- Papa demande une capsule ;
- ZETIS détecte une lacune persistante ;
- Massimo demande une explication vidéo.

## Pipeline

```txt
Skill/GAP
  ↓
Script ELI5
  ↓
Storyboard
  ↓
Validation Papa
  ↓
Audio TTS
  ↓
Slides / images
  ↓
Publication
  ↓
Quiz post-capsule
```

## Règles

- Capsule courte : 2 à 5 minutes.
- Une seule notion principale.
- Exemple concret.
- Sous-titres si vidéo.
- Quiz obligatoire après capsule pour mesurer l’effet.

## Statuts

- draft ;
- waiting_validation ;
- validated ;
- published ;
- archived.
