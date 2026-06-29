# Page Papa — Pilotage Capsules IA

## Objectif

Papa doit pouvoir générer, valider, publier ou supprimer les capsules IA.

## États capsule

- draft ;
- generated_script ;
- storyboard_ready ;
- audio_ready ;
- video_ready ;
- validated ;
- published ;
- archived.

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Capsules IA — Pilotage                                      │
├──────────────────────────────────────────────────────────────┤
│ [Générer capsule]                                            │
│                                                              │
│ À valider                                                    │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Maths — Nombres relatifs                                 │ │
│ │ Script prêt · storyboard prêt · audio non généré          │ │
│ │ [Voir] [Modifier] [Valider] [Rejeter]                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Publiées                                                     │
│ - SVT : nutrition végétale                                   │
│ - Français : temps du récit                                  │
└──────────────────────────────────────────────────────────────┘
```

## Données API

- `POST /capsules/generate`
- `GET /capsules?status=draft`
- `POST /capsules/{id}/validate`
- `POST /capsules/{id}/publish`
- `DELETE /capsules/{id}`
