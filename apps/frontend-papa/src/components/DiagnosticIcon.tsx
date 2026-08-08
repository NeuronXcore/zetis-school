import diagnosticIcon from "../assets/app/ZETIS-Diagnostic_256.png";

// Pictogramme de la page Diagnostic — l'instrument de mesure.
//
// Patron repris de `CouvertureIcon.tsx`, avec ses trois pièges déjà payés. Il n'est pas
// généralisé en un composant unique paramétré par l'image : les deux icônes n'ont ni le même
// arrondi utile ni les mêmes tailles d'emploi, et une abstraction à deux cas se paie plus cher
// qu'elle ne rapporte.
//
// Point de définition unique du RENDU : arrondi, tailles d'emploi, halo. Tout affichage qui n'est
// pas la sidebar passe par ici.
//
// ⚠️ La sidebar, elle, ne consomme pas ce composant : `PapaSidebar` rend son propre `<img>` depuis
// `navigation.ts::iconUrl`, comme pour la Couverture. Deux imports du MÊME fichier d'asset, donc
// aucune dérive possible — mais l'arrondi y est recopié, et c'est le seul endroit où il l'est.
//
// La source livrée fait 1254 px pour 1,7 Mo ; c'est la réduction à 256 px (99 ko) qui est
// embarquée — l'affichage le plus grand est de 56 px. L'original vit dans
// `assets/brand/icons/ZETIS-Diagnostic.png`, hors des apps : cf. `assets/brand/README.md`.
//
// `breathing` n'est activé QUE sur l'en-tête de page : à 20 px dans la sidebar, un halo qui pulse
// devient un clignotement parasite dans le coin de l'œil.
//
// 🔴 L'arrondi n'est pas décoratif : le PNG est OPAQUE, son fond noir aplati jusqu'aux bords. Sans
// `rounded`, quatre coins noirs se découpent sur le bleu nuit de la page. Le rayon suit celui du
// carré dessiné dans l'image (~22 %), donc il rogne du noir et rien d'autre.

const SIZES = {
  nav: "h-5 w-5",
  inline: "h-6 w-6",
  header: "h-14 w-14",
} as const;

export interface DiagnosticIconProps {
  size?: keyof typeof SIZES;
  breathing?: boolean;
  className?: string;
}

export function DiagnosticIcon({
  size = "inline",
  breathing = false,
  className = "",
}: DiagnosticIconProps) {
  return (
    <img
      src={diagnosticIcon}
      // Décoratif : le mot « Diagnostic » accompagne l'icône partout où elle apparaît.
      alt=""
      aria-hidden
      className={`shrink-0 rounded-[22%] object-contain ${SIZES[size]} ${
        breathing ? "couverture-breathe" : ""
      } ${className}`}
    />
  );
}
