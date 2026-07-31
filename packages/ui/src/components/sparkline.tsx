// Sparkline générique — une série de nombres, une ligne, aucun axe.
//
// Brique LÉGÈRE (SVG inline, zéro dépendance) : export racine, pas de sous-chemin. Le dépôt n'a
// aucune lib de graphes et n'en veut pas — en ajouter une serait un ADR.
//
// Pourquoi générique plutôt qu'extraite telle quelle de `ProgressSparkline` (frontend-massimo) :
// celle-ci est soudée à `GalaxyTimeline`, à sa légende (« Ta galaxie s'allume… ») et à sa couleur
// en dur. La monter au design system aurait importé la sémantique de Massimo dans une brique
// partagée. Elle pourra se reposer sur celle-ci plus tard — chantier à part.
//
// La couleur vient de `currentColor` : chaque app la pilote par ses propres tokens sémantiques,
// aucune valeur d'app n'entre ici.

export interface SparklineProps {
  /** Points, du plus ancien au plus récent. Moins de deux points = rien à tracer. */
  points: number[];
  /** Description lue par les lecteurs d'écran — l'information ne doit jamais tenir à la seule
   *  courbe. OBLIGATOIRE : une image sans alternative est une information perdue. */
  label: string;
  /** Remplissage sous la courbe. À couper quand plusieurs sparklines se superposent. */
  filled?: boolean;
  className?: string;
}

const W = 120;
const H = 24;

export function Sparkline({ points, label, filled = true, className = "" }: SparklineProps) {
  if (points.length < 2) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  // Série plate : on la trace à mi-hauteur plutôt que collée au bord. Une ligne au ras du cadre
  // se lirait comme un effondrement alors que rien n'a bougé.
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const coords = points.map(
    (value, index) => [index * step, H - 3 - ((value - min) / span) * (H - 6)] as const,
  );
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-6 w-full ${className}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {filled && <polygon points={`0,${H} ${line} ${W},${H}`} fill="currentColor" opacity={0.14} />}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        // Sans cela, `preserveAspectRatio="none"` étirerait aussi l'épaisseur du trait, qui
        // deviendrait un ruban dès que le conteneur s'élargit.
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="2.2" fill="currentColor" />
    </svg>
  );
}
