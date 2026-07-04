import { cappedCount } from "../hooks/useReviewSession";

// Deck circulaire (présentation pure) : illustration matière OU collage de mélange,
// effet « pile de cartes » (2 disques décalés), anneau conique indigo→cyan, badge
// compteur plafonné « 15+ ». Matière à jour = atténuée + « à jour ✓ » (positif,
// jamais grisée comme un manque) et non cliquable. Repli neutre (initiale) si l'asset
// d'une matière manque — ne casse jamais sur une matière inconnue.

export interface DeckDiscProps {
  title: string;
  subtitle?: string;
  /** Compteur EXACT de cartes dues (le plafond « 15+ » est de l'affichage). */
  count: number;
  /** Deck mélange : plus grand (recommandation = interleaving par défaut). */
  hero?: boolean;
  /** Illustration de matière (`*_256.png`). */
  imageUrl?: string;
  /** Collage de mélange : jusqu'à 4 illustrations de matières ayant des cartes dues. */
  collageUrls?: string[];
  /** Repli neutre (initiale de la matière) si `imageUrl` manque. */
  fallbackInitial?: string;
  /** `count === 0` : deck « à jour ✓ », atténué et non cliquable. */
  atDay?: boolean;
  onClick?: () => void;
}

const RING = "conic-gradient(from 210deg, #6366f1, #22d3ee, #a855f7, #6366f1)";

function DiscFace({
  imageUrl,
  collageUrls,
  fallbackInitial,
  size,
}: Pick<DeckDiscProps, "imageUrl" | "collageUrls" | "fallbackInitial"> & { size: string }) {
  // Mélange : collage 2×2 des matières + 🔀 en surimpression.
  if (collageUrls && collageUrls.length > 0) {
    return (
      <div className={`relative ${size} overflow-hidden rounded-full bg-zetis-surface-2`}>
        <div className="grid h-full w-full grid-cols-2 grid-rows-2">
          {collageUrls.slice(0, 4).map((url, i) => (
            <img key={i} src={url} alt="" aria-hidden className="h-full w-full object-cover opacity-90" />
          ))}
        </div>
        <span className="absolute inset-0 flex items-center justify-center text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
          🔀
        </span>
      </div>
    );
  }
  // Matière : illustration, ou repli neutre (initiale sur verre).
  return (
    <div
      className={`flex ${size} items-center justify-center overflow-hidden rounded-full bg-zetis-surface-2`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          className="h-[82%] w-[82%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
        />
      ) : (
        <span className="text-2xl font-bold text-zetis-muted">
          {(fallbackInitial ?? "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function DeckDisc({
  title,
  subtitle,
  count,
  hero = false,
  imageUrl,
  collageUrls,
  fallbackInitial,
  atDay = false,
  onClick,
}: DeckDiscProps) {
  const disc = hero ? "h-28 w-28" : "h-20 w-20";
  const face = hero ? "h-24 w-24" : "h-[4.25rem] w-[4.25rem]";

  const visual = (
    <div className="relative">
      {/* Effet pile : deux disques décalés derrière. */}
      <div
        aria-hidden
        className={`absolute inset-0 ${disc} -rotate-6 rounded-full border border-white/10 bg-white/5`}
      />
      <div
        aria-hidden
        className={`absolute inset-0 ${disc} rotate-6 rounded-full border border-white/10 bg-white/5`}
      />
      {/* Anneau conique + face. */}
      <div className={`relative ${disc} rounded-full p-[3px]`} style={{ background: RING }}>
        <DiscFace
          imageUrl={imageUrl}
          collageUrls={collageUrls}
          fallbackInitial={fallbackInitial}
          size={face}
        />
      </div>
      {/* Badge : compteur (dû) ou « à jour ✓ » (positif). */}
      {atDay ? (
        <span className="absolute -right-1 -top-1 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
          à jour ✓
        </span>
      ) : (
        <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-2 py-0.5 text-center text-xs font-bold text-white shadow-lg shadow-indigo-900/40">
          {cappedCount(count)}
        </span>
      )}
    </div>
  );

  const label = (
    <div className="mt-3 text-center">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
    </div>
  );

  // À jour : non interactif (pas de bouton), atténué mais valorisant.
  if (atDay || !onClick) {
    return (
      <div className={`flex flex-col items-center ${atDay ? "opacity-60" : ""}`}>
        {visual}
        {label}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center rounded-3xl p-2 transition-transform hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
    >
      {visual}
      {label}
    </button>
  );
}
