# Page Massimo — Matières

> **Réécriture du 2026-08-11** — *addendum ADR-0024 « la page matière porte l'effort de Massimo,
> et se range en onglets », chantier B*, cadré sur le wireframe `/matieres` du user.
>
> La version précédente datait de la Phase 1 et était **100 % mockée** (`data/mock.ts`). Elle
> contredisait l'ADR-0024 §5 sur trois points, tous corrigés ici : un **« Niveau 5 » faux**, un
> **« 62 % du chapitre »** (pourcentage interdit) et une tuile **« Meilleure matière »** — un
> classement des matières, que le §5 interdit nommément.
>
> **Aucune route n'a été créée.** Le plan de chantier en annonçait une neuve
> (`GET /api/student/subjects/overview`) ; le read-before-code l'a démentie —
> `GET /api/student/galaxy` servait déjà une ligne par matière.

## Objectif

Permettre à Massimo de choisir une matière et de voir, d'un regard, **ce qu'il y a fait** —
dans le style visuel du login (glassmorphique / néon).

## Ce qu'elle N'EST PAS

- **Pas un classement.** L'ordre est celui du **programme**, servi par le serveur, et le client
  ne le retouche jamais. Trier par XP ou par notions travaillées en ferait un podium.
- **Pas une page de notes.** Aucun pourcentage, aucun `mastery_score`, aucun « N sur M ».
- **Pas un bulletin.** Aucun verdict sur une matière — ni « à renforcer », ni « lacunes », ni
  « risque ». Ce qu'il y a à travailler se dit en **MISSION** : un geste, pas un jugement.

## Structure de la page

> Le **header** (wordmark + emblème animé + avatar · niveau · XP + Déconnexion) est **global** à
> toutes les pages Massimo : il vit dans `MassimoLayout`, pas ici.

1. **« Tout ce que tu as gagné »** — niveau global, XP total, ce qu'il reste pour le niveau
   suivant, et « Voir ma galaxie → ». La barre mesure l'avancée dans le **niveau** (un compteur
   d'effort), jamais un taux de maîtrise.
2. **La grille des matières**, dans l'ordre du programme.
3. **Le rail droit** — le même composant que la page matière (`SubjectSideRail`), sans nom de
   matière : engagement de la semaine, échéances **toutes matières**, et « Parler à ZETIS ».

**Retirées** : la carte « Capsule IA dispo » (entièrement mockée, aucune route de lecture par
capsule n'existe) et la bande « Cette semaine » avec sa tuile **« Meilleure matière »**.

## Carte matière (`SubjectTile`)

- **pictogramme de marque** de la matière (`subjectIconFor`, jamais d'emoji) ;
- **badge de niveau** de la matière ;
- **« N notions travaillées »** — un COMPTE d'étoiles allumées. À zéro : **« À découvrir »**,
  jamais « 0 notion » ;
- **« N maîtrisées »** en cyan, seulement si `> 0` ;
- **barre + XP de la matière**.

⚠️ **`total` est servi par la route mais n'atteint jamais l'écran** : « 15 sur 51 » désignerait
les 36 restantes comme un retard.

⚠️ **À 0 XP, ni barre ni nombre** — corrigé après relecture à l'écran (Espagnol) : une barre vide
surmontant un « 0 XP » écrit se lit comme un score nul, alors que c'est une matière pas encore
ouverte.

Clic sur une carte → page dédiée `/subjects/:slug`.

## Données & implémentation

- Toute la logique vit dans **`useMatieres`** (aucune logique métier dans le composant).
- `GET /api/gamification/summary` → niveau et XP **globaux**.
- `GET /api/student/galaxy` → une ligne par matière : `lit`, `total`, **`xp`** et **`mastered`**
  (les deux derniers ajoutés le 2026-08-11, **sans requête supplémentaire** : `mastered` se tire
  de la maîtrise déjà chargée, `xp` d'un seul agrégat pour toutes les matières).
- `allSettled` : une gamification en panne ne retire que le bandeau, la liste des matières reste.
  Le message d'erreur n'apparaît que si **tout** a échoué, et jamais sous forme de code HTTP.
- Aucune donnée pédagogique durable stockée côté front.

🔴 **Deux test-verrous tiennent l'ordre**, un serveur et un client : une matière écrasante en XP
placée en dernier au programme doit **rester** en dernier. Rien dans le code ne l'empêche — seuls
ces tests le tiennent.

## Liens (routes réelles uniquement)

- « Voir ma galaxie → » → `/galaxy` (renommée le 2026-07-31, addendum ADR-0024 §A).
- Clic matière → `/subjects/:slug`.
- Rail : « Voir mon agenda → » → `/agenda`, « Parler à ZETIS » → `/chat`, « En choisir un » → `/`.
