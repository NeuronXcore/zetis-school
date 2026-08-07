/**
 * GearsSpinner — le spinner ZETIS à deux engrenages.
 *
 * Une seule brique pour les deux frontends : tout est en `currentColor`, donc
 * émeraude chez Papa, cyan chez Massimo, ambre à l'arrêt. Aucune variante de
 * thème à maintenir, aucune chance qu'une des deux dérive au prochain correctif.
 *
 * Dimensionné en `em` : il suit la taille de texte de son contexte. Aucune prop
 * de taille, donc aucune taille à harmoniser entre les surfaces — c'est le
 * défaut qu'on vient de payer avec les 23 durées en dur.
 *
 * 12 dents contre 8 → rapport 1,5 → 3 s contre 2 s, sens inversés. Les tracés
 * sont calculés sur un même module, une dent de la petite roue posée dans un
 * creux de la grande sur la ligne des centres. Deux roues à la même vitesse se
 * traversent visuellement ; l'œil le voit sans savoir nommer ce qui cloche.
 *
 * Zéro dépendance, zéro JS d'animation : il peut vivre dans le chrome de Papa
 * sans toucher au budget de bundle.
 */

const GEAR_LARGE =
  "M12.289 6.626 L14.329 6.855 A6.950 6.950 0 0 1 14.329 7.945 L12.289 8.174 A4.950 4.950 0 0 1 12.021 9.174 L13.673 10.392 A6.950 6.950 0 0 1 13.128 11.337 L11.247 10.515 A4.950 4.950 0 0 1 10.515 11.247 L11.337 13.128 A6.950 6.950 0 0 1 10.392 13.673 L9.174 12.021 A4.950 4.950 0 0 1 8.174 12.289 L7.945 14.329 A6.950 6.950 0 0 1 6.855 14.329 L6.626 12.289 A4.950 4.950 0 0 1 5.626 12.021 L4.408 13.673 A6.950 6.950 0 0 1 3.463 13.128 L4.285 11.247 A4.950 4.950 0 0 1 3.553 10.515 L1.672 11.337 A6.950 6.950 0 0 1 1.127 10.392 L2.779 9.174 A4.950 4.950 0 0 1 2.511 8.174 L0.471 7.945 A6.950 6.950 0 0 1 0.471 6.855 L2.511 6.626 A4.950 4.950 0 0 1 2.779 5.626 L1.127 4.408 A6.950 6.950 0 0 1 1.672 3.463 L3.553 4.285 A4.950 4.950 0 0 1 4.285 3.553 L3.463 1.672 A6.950 6.950 0 0 1 4.408 1.127 L5.626 2.779 A4.950 4.950 0 0 1 6.626 2.511 L6.855 0.471 A6.950 6.950 0 0 1 7.945 0.471 L8.174 2.511 A4.950 4.950 0 0 1 9.174 2.779 L10.392 1.127 A6.950 6.950 0 0 1 11.337 1.672 L10.515 3.553 A4.950 4.950 0 0 1 11.247 4.285 L13.128 3.463 A6.950 6.950 0 0 1 13.673 4.408 L12.021 5.626 A4.950 4.950 0 0 1 12.289 6.626 Z M9.920 7.400 A2.520 2.520 0 1 0 4.880 7.400 A2.520 2.520 0 1 0 9.920 7.400 Z";

const GEAR_SMALL =
  "M17.340 13.782 L19.387 13.889 A4.950 4.950 0 0 1 19.387 15.053 L17.340 15.160 A2.950 2.950 0 0 1 16.986 16.012 L18.358 17.536 A4.950 4.950 0 0 1 17.536 18.358 L16.012 16.986 A2.950 2.950 0 0 1 15.160 17.340 L15.053 19.387 A4.950 4.950 0 0 1 13.889 19.387 L13.782 17.340 A2.950 2.950 0 0 1 12.930 16.986 L11.407 18.358 A4.950 4.950 0 0 1 10.584 17.536 L11.956 16.012 A2.950 2.950 0 0 1 11.603 15.160 L9.555 15.053 A4.950 4.950 0 0 1 9.555 13.889 L11.603 13.782 A2.950 2.950 0 0 1 11.956 12.930 L10.584 11.407 A4.950 4.950 0 0 1 11.407 10.584 L12.930 11.956 A2.950 2.950 0 0 1 13.782 11.603 L13.889 9.555 A4.950 4.950 0 0 1 15.053 9.555 L15.160 11.603 A2.950 2.950 0 0 1 16.012 11.956 L17.536 10.584 A4.950 4.950 0 0 1 18.358 11.407 L16.986 12.930 A2.950 2.950 0 0 1 17.340 13.782 Z M16.151 14.471 A1.680 1.680 0 1 0 12.791 14.471 A1.680 1.680 0 1 0 16.151 14.471 Z";

export interface GearsSpinnerProps {
  /** Nom accessible. Ignoré si `decorative`. Défaut : « Chargement en cours ». */
  label?: string;
  /**
   * À utiliser quand un texte voisin dit déjà l'attente (« Rédaction du
   * cours… »). Sans ça, le lecteur d'écran annonce deux fois la même chose.
   */
  decorative?: boolean;
  /** Halo. ⚠️ Sous ~24 px il devient une tache — ne pas l'activer en ligne. */
  glow?: boolean;
  /**
   * Figé et ambre. C'est un ÉTAT, pas une absence : aucun moteur de production
   * n'écoute la file. Une file sans consommateur n'est pas une attente, c'est
   * un arrêt, et l'immobilité se lit avant le texte.
   */
  stopped?: boolean;
  className?: string;
}

export function GearsSpinner({
  label = "Chargement en cours",
  decorative = false,
  glow = false,
  stopped = false,
  className = "",
}: GearsSpinnerProps) {
  const classes = [
    "zx-gears",
    glow && "zx-gears--glow",
    stopped && "zx-gears--stopped",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "status", "aria-label": label })}
    >
      <svg
        viewBox="0 0 19.9 19.9"
        fillRule="evenodd"
        aria-hidden="true"
        focusable="false"
      >
        <path className="zx-gears__a" d={GEAR_LARGE} />
        <path className="zx-gears__b" d={GEAR_SMALL} />
      </svg>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   À poser dans la feuille de styles partagée de `packages/ui`.

   .zx-gears {
     display: inline-block;
     width: 1.6em;
     height: 1.6em;
     vertical-align: -0.35em;
     color: inherit;
     flex: 0 0 auto;
   }
   .zx-gears svg { display: block; width: 100%; height: 100%; overflow: visible; }

   .zx-gears__a,
   .zx-gears__b {
     fill: currentColor;
     transform-box: fill-box;      ⚠️ NON OPTIONNEL — voir la note ci-dessous
     transform-origin: 50% 50%;
   }
   .zx-gears__a { animation: zx-cw  3s linear infinite; }
   .zx-gears__b { animation: zx-ccw 2s linear infinite; opacity: 0.62; }

   @keyframes zx-cw  { to { transform: rotate(360deg); } }
   @keyframes zx-ccw { to { transform: rotate(-360deg); } }

   .zx-gears--glow { filter: drop-shadow(0 0 0.35em currentColor); }

   .zx-gears--stopped { color: var(--zx-amber, #f0a02a); opacity: 0.9; }
   .zx-gears--stopped .zx-gears__a,
   .zx-gears--stopped .zx-gears__b { animation-play-state: paused; }

   @media (prefers-reduced-motion: reduce) {
     .zx-gears__a,
     .zx-gears__b { animation: none; }
   }

   ⚠️ `transform-box: fill-box` n'est pas un détail. Sans lui, WebKit fait
   tourner chaque roue autour de l'origine du SVG et non de son propre centre :
   les deux engrenages partent en orbite. Le défaut ne se voit pas sur Chrome —
   donc pas en développement, seulement sur l'iPad de Massimo.

   ⚠️ Le mouvement réduit FIGE, il ne retire rien. Les roues restent, la couleur
   reste, le nom accessible reste. Masquer le spinner effacerait le signal —
   patron `couverture-breathe`.
   ═══════════════════════════════════════════════════════════════════════════ */
