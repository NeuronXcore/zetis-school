# Page Massimo — Capsules IA

## Objectif

Regrouper les courtes capsules pédagogiques générées par ZETIS.

## Onglet sidebar

Nom recommandé : `Capsules IA`.

## Qui génère ?

- Papa peut générer et valider.
- ZETIS peut proposer automatiquement une capsule si une notion bloque.
- Massimo peut demander une capsule, mais elle peut rester en attente de validation selon les paramètres.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Capsules IA                                                  │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Capsule recommandée                                      │ │
│ │ Les nombres relatifs en 4 minutes                        │ │
│ │ [Regarder] [Quiz après capsule]                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Bibliothèque                                                 │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐                │
│ │ SVT        │ │ Français   │ │ Maths      │                │
│ │ Nutrition  │ │ Récit      │ │ Fractions  │                │
│ └────────────┘ └────────────┘ └────────────┘                │
└──────────────────────────────────────────────────────────────┘
```

## Carte capsule

- titre ;
- matière ;
- durée ;
- niveau ;
- notion ;
- statut vue/non vue ;
- bouton quiz.

## Données API

- `GET /capsules?published=true`
- `GET /capsules/{id}`
- `POST /capsules/{id}/viewed`
- `GET /capsules/{id}/post-quiz`
