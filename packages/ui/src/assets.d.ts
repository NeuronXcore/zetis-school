// Déclarations d'ambient pour les imports d'assets de la brique avatar (@zetis/ui/avatar).
// Autonomes (pas de dépendance à `vite/client`, absent des devDeps de ce package) : Vite résout
// l'URL à la compilation, TypeScript n'a besoin que du type `string` par défaut.
declare module "*.webp" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.css";
