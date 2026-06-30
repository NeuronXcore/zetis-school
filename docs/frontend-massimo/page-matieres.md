# Page Massimo — Matières

## Objectif

Permettre à Massimo de choisir une matière et de comprendre rapidement où il en est,
dans le style visuel du login (glassmorphique / néon).

## Matières affichées

- Français
- Mathématiques
- Histoire-Géo
- SVT
- Anglais
- Espagnol
- Physique-Chimie
- Technologie

## Structure de la page (de haut en bas)

> Le **header** (wordmark + emblème animé + avatar · niveau · XP + Déconnexion) est
> **global** à toutes les pages Massimo : il vit dans `MassimoLayout` (cf. `README.md`),
> pas dans la page Matières.

1. **Bandeau « Progression globale »** : niveau, XP, barre vers le niveau suivant,
   bouton « Voir ma progression → » (vers `/progression`).
2. **Carte « Capsule IA dispo »** (mise en avant) : notion, durée, matière, bouton « Regarder ».
3. **Grille des 8 matières**.
4. **Bande « Cette semaine »** : série en cours, objectifs de la semaine (mini-barre),
   meilleure matière.

## Carte matière (`SubjectTile`)

Chaque carte affiche :

- icône **PNG** de la matière (chargée par slug via `import.meta.glob`, repli emoji si absente) ;
- **cadre teinté** de la couleur d'accent de la matière (bordure + dégradé radial + halo) ;
- badge de niveau ;
- missions en cours (ou « À jour ») ;
- barre de progression du chapitre.

Clic sur une carte → page dédiée `/subjects/:slug`.

## Données & implémentation

- Toute la logique vit dans le hook **`useMatieres`** (aucune logique métier dans le composant).
- **Branché en direct** : `GET /api/gamification/summary` → niveau, XP, barre, série (repli `PROFILE`).
- **Encore mockés** (endpoints absents, repli typé + `TODO(api)`) :
  - `GET /subjects` — liste/maîtrise des matières ;
  - objectifs de la semaine ;
  - capsule recommandée.
- « Meilleure matière » est dérivée du mock (progression max) tant que la maîtrise par
  matière n'est pas exposée par la gamification.
- Aucune donnée pédagogique durable stockée côté front.

## Liens (routes réelles uniquement)

- « Voir ma progression → » → `/progression`.
- Clic matière → `/subjects/:slug`.
- « Regarder » (capsule) → `/capsules` (pas de route de lecture par capsule ; repli signalé).
