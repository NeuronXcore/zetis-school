# public/assets — frontend Papa

**Ce dossier n'est plus le point de dépôt des visuels**, contrairement à ce qu'il annonçait. Il est
conservé vide.

Les images importées par le code vivent dans `src/assets/` :

- `apps/frontend-papa/src/assets/app/` — pictogrammes propres à l'interface Papa ;
- `packages/ui/src/assets/<famille>/` — visuels partagés avec Massimo (ex. `subjects/`).

Les originaux pleine résolution restent dans [`assets/brand/`](../../../../assets/brand/README.md),
à la racine du dépôt : source de vérité, et règle complète.

Raison du changement : un `import` TS fait échouer le build quand le fichier manque, hashe le nom
pour invalider le cache navigateur, et sort du bundle ce qui n'est plus utilisé — trois choses
qu'un chemin absolu vers `public/` ne sait pas faire.

> Exception : les fichiers posés à la racine de `public/` (`papa-avatar.png`, `zetis-logo.png`,
> `zetis-logo.mp4`) restent servis par chemin absolu — ils sont référencés depuis `index.html`,
> où un `import` n'a pas cours.
