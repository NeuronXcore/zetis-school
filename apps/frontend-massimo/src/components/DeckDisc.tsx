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
  /** Emoji de la matière — affiché quand il n'y a pas d'illustration (matières sans carte). */
  emoji?: string;
  /** `count === 0` : deck « à jour ✓ », atténué et non cliquable. */
  atDay?: boolean;
  /** Aucune carte encore générée : disque GRISÉ « à venir » (jamais anxiogène). Inerte
   *  par défaut ; reste cliquable si `onClick` est fourni (ELI5 : matière « bientôt »). */
  noCards?: boolean;
  /** Sous-titre du disque `noCards` (défaut « pas encore de cartes »). ELI5 : « bientôt ✨ ». */
  soonHint?: string;
  /** Masque le badge (compteur / « à jour » / « à venir ») — deck spécial sans compteur. */
  hideBadge?: boolean;
  /** Contient des cartes fraîchement générées jamais révisées → badge « ✨ new ». */
  isNew?: boolean;
  onClick?: () => void;
}

function DiscFace({
  imageUrl,
  collageUrls,
  fallbackInitial,
  emoji,
  size,
}: Pick<DeckDiscProps, "imageUrl" | "collageUrls" | "fallbackInitial" | "emoji"> & {
  size: string;
}) {
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
  // Matière : illustration, sinon emoji de la matière, sinon repli neutre (initiale).
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
      ) : emoji ? (
        <span className="text-6xl leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          {emoji}
        </span>
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
  emoji,
  atDay = false,
  noCards = false,
  soonHint,
  hideBadge = false,
  isNew = false,
  onClick,
}: DeckDiscProps) {
  const disc = hero ? "h-28 w-28" : "h-20 w-20";

  const visual = (
    <div className={`relative ${noCards ? "grayscale" : ""}`}>
      {/* Cercle simple avec l'illustration (ou l'emoji) de la matière — rien derrière. */}
      <DiscFace
        imageUrl={imageUrl}
        collageUrls={collageUrls}
        fallbackInitial={fallbackInitial}
        emoji={emoji}
        size={disc}
      />
      {/* Badge : « à venir » (pas de carte), « à jour ✓ », ou compteur dû. */}
      {hideBadge ? null : noCards ? (
        <span className="absolute -right-1 -top-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
          à venir
        </span>
      ) : atDay ? (
        <span className="absolute -right-1 -top-1 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
          à jour ✓
        </span>
      ) : (
        <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-2 py-0.5 text-center text-xs font-bold text-white shadow-lg shadow-indigo-900/40">
          {cappedCount(count)}
        </span>
      )}
      {/* Fraîchement générées, jamais vues → « ✨ new » (positif, jamais anxiogène). */}
      {isNew && !atDay && !noCards && (
        <span className="absolute -left-1 -top-1 rounded-full border border-emerald-300/50 bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100 shadow">
          ✨ new
        </span>
      )}
    </div>
  );

  const label = (
    <div className="mt-3 text-center">
      <p className={`text-sm font-semibold ${noCards ? "text-slate-400" : "text-slate-100"}`}>
        {title}
      </p>
      {noCards ? (
        <p className="text-xs text-slate-500">{soonHint ?? "pas encore de cartes"}</p>
      ) : (
        subtitle && <p className="text-xs text-slate-400">{subtitle}</p>
      )}
    </div>
  );

  // Atténuation « à jour ✓ » / « à venir » (grisé) — appliquée que le disque soit
  // interactif ou non, pour que Révision (inerte) et ELI5 (cliquable) partagent le look.
  const dim = noCards ? "opacity-50" : atDay ? "opacity-60" : "";

  // Sans `onClick` : disque inerte (Révision « à jour ✓ » / « à venir »). Avec `onClick` :
  // bouton — un deck atténué mais cliquable (ELI5 « bientôt ») reste donc actionnable.
  if (!onClick) {
    return (
      <div className={`flex flex-col items-center ${dim}`}>
        {visual}
        {label}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center rounded-3xl p-2 transition-transform hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${dim}`}
    >
      {visual}
      {label}
    </button>
  );
}
