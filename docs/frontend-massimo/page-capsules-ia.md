# Page Massimo — Capsules IA

## Objectif

Regarder les capsules pédagogiques **validées et rendues** (MP4), rangées par matière.

## Onglet sidebar

`Capsules IA` — avec un **badge compteur** des nouvelles capsules (non vues).

## Qui génère ?

- Papa génère, valide et pilote (cf. page Pilotage). ZETIS peut proposer une capsule lorsqu'une
  notion bloque.
- Massimo **ne voit que les capsules validées + rendues** — jamais un brouillon ni un contenu
  non validé.

## Contenu

- **Étagères par matière → chapitre** (icône de matière), avec **recherche** par nom.
- Bandeau de compteurs : « 🆕 X nouvelles · 👁️ Y capsules vues · 🎬 Z visionnages » (Z = total
  de visionnages, **répétitions incluses**).
- Chaque carte : titre, matière, **badge de difficulté** (⭐ / ⭐⭐ / ⭐⭐⭐), badge **« Nouveau »**
  si non vue.
- **Lecteur plein écran** (modale) : lecture du MP4 (voix Piper incluse). Le visionnage est
  compté **à la fin** de la vidéo (`onEnded`) → « vu » + incrément du compteur de répétitions.
- **Célébration « mini-victoire »** (brique partagée `@zetis/ui`) : à l'ouverture de la
  bibliothèque, une **nouvelle capsule** (non vue, jamais fêtée) déclenche un petit surgissement
  joyeux + un carillon doux. Fêté **une seule fois par capsule** (dédup `localStorage`
  `zetis:celebratedCapsules`). Respecte `prefers-reduced-motion`.
- **Bouton son** (🔊/🔇) dans l'en-tête : coupe/active le carillon, réglage **persistant** et
  partagé avec l'interface Papa (`localStorage` `zetis:sound`).

## Wireframe

```txt
┌──────────────────────────────────────────────────────────────┐
│ Capsules IA           🆕 2 nouvelles · 👁️ 5 capsules vues      │
├──────────────────────────────────────────────────────────────┤
│ [Rechercher une capsule…]                                    │
│ ▸ Maths                                                      │
│ ▾ Français                                                   │
│    Chapitre — Le récit                                       │
│    ┌─────────────┐ ┌─────────────┐                           │
│    │ ⭐⭐ Nouveau  │ │ ⭐ (vue)     │ → clic = lecteur plein écran│
│    └─────────────┘ └─────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

## Endpoints (Massimo)

- `GET /api/capsules/library` — capsules publiées (validées + MP4), avec flag `seen`
- `GET /api/capsules/stats` — `{total, seen_count, new_count, view_count}` (`view_count` = total de
  visionnages, répétitions incluses)
- `POST /api/capsules/{id}/view` — enregistre un visionnage complet (204)
- `GET /api/capsules/{id}/video?token=` — flux MP4
