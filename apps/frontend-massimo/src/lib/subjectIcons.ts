// Ré-export de la brique partagée `@zetis/ui` (patron `GenerationProgress` : l'ancien chemin
// reste valide, aucun des sites d'import existants ne change — c'est la preuve de réutilisation).
// Le résolveur et les assets PNG vivent maintenant dans `packages/ui/src/{lib,assets}`, où ils
// ne sont plus dupliqués entre les deux interfaces.
export { subjectIconFor } from "@zetis/ui";
