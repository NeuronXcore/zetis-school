import couvertureIcon from "../assets/app/ZETIS_map_256.png";

// Pictogramme de la Couverture de production — une carte au trésor du stock de contenu.
//
// Point de définition UNIQUE de l'image : la sidebar, l'en-tête de la page et le relais du
// Dashboard la tirent tous d'ici. Trois `<img src=…>` recopiés se seraient désynchronisés au
// premier changement de fichier.
//
// La source livrée fait 1248 px pour 1,9 Mo ; c'est la réduction à 256 px (104 ko) qui est
// embarquée — l'affichage le plus grand est de 56 px. L'original vit dans
// `assets/brand/icons/ZETIS_map.png`, hors des apps : cf. `assets/brand/README.md` §Règle
// principale.
//
// `breathing` n'est activé QUE sur l'en-tête de page : à 20 px dans la sidebar, un halo qui
// pulse devient un clignotement parasite dans le coin de l'œil.
//
// L'arrondi n'est pas décoratif : le PNG est OPAQUE, son fond noir aplati jusqu'aux bords. Sans
// `rounded`, quatre coins noirs se découpent sur le fond bleu nuit de la page. Le rayon suit
// celui du carré dessiné dans l'image (~22 %), donc il rogne du noir et rien d'autre.

const SIZES = {
  nav: "h-5 w-5",
  inline: "h-6 w-6",
  header: "h-14 w-14",
} as const;

export interface CouvertureIconProps {
  size?: keyof typeof SIZES;
  breathing?: boolean;
  className?: string;
}

export function CouvertureIcon({
  size = "inline",
  breathing = false,
  className = "",
}: CouvertureIconProps) {
  return (
    <img
      src={couvertureIcon}
      // Décoratif : le mot « Couverture » accompagne l'icône partout où elle apparaît.
      alt=""
      aria-hidden
      className={`shrink-0 rounded-[22%] object-contain ${SIZES[size]} ${
        breathing ? "couverture-breathe" : ""
      } ${className}`}
    />
  );
}
