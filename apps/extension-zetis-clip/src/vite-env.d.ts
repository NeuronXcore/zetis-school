/// <reference types="vite/client" />

// ⚠️ **Ce fichier n'existait pas, et c'est ce qui cassait `pnpm -r typecheck`** — sur un fichier
// que l'extension ne possède même pas : `packages/ui/src/lib/subjectIcons.ts` utilise
// `import.meta.glob`, dont le type vit dans `vite/client`. Papa et Massimo ont chacun leur
// `vite-env.d.ts` depuis toujours ; l'extension, née plus tard, ne l'a jamais eu, et le défaut
// n'est apparu que le jour où elle a importé `@zetis/ui`.
//
// 🔴 **La référence est nécessaire ICI et pas ailleurs à cause de `"types": ["chrome"]`** dans
// `tsconfig.app.json`. Ce champ RESTREINT les `@types/*` chargés automatiquement — il ne s'agit
// pas d'un oubli à corriger : sans lui, l'extension hériterait de types qui n'ont rien à faire
// dans un contexte de service worker. Une directive `/// <reference>` est explicite et passe
// outre cette restriction ; c'est exactement le motif que Papa emploie avec `"types": []`.
//
// ⚠️ **Ne PAS le remplacer par un `"types": ["chrome", "vite/client"]`** : `vite/client` déclare
// aussi les modules d'assets (`*.png`, `*.svg`…), et le charger globalement noierait les
// déclarations propres à l'extension. La directive de fichier est plus étroite.
