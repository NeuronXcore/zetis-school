// Recherche d'une notion dans la constellation ouverte (ZETIS Galaxy, ADR-0024).
//
// Purement locale : elle filtre les étoiles déjà chargées, donc elle répond à la frappe sans
// aucune requête. Elle ne cherche PAS dans les autres matières — c'est assumé, et le message
// de résultat le dit plutôt que de laisser croire à une absence.
//
// Le compte de résultats est un nombre d'étoiles, jamais une note.
export interface GalaxySearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Nombre d'étoiles trouvées. `null` tant que rien n'est cherché. */
  matchCount: number | null;
}

export function GalaxySearch({ value, onChange, matchCount }: GalaxySearchProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">
          🔎
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cherche une notion…"
          aria-label="Chercher une notion dans cette constellation"
          // La croix NATIVE de `type="search"` (WebKit) est masquée : la nôtre est déjà là,
          // et deux croix côte à côte se lisent comme un bug.
          className="w-full appearance-none rounded-xl border border-zetis-border bg-zetis-surface py-2 pl-9 pr-9 text-sm text-zetis-text placeholder:text-zetis-muted focus:border-zetis-accent-2 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg px-1.5 py-0.5 text-lg leading-none text-zetis-muted hover:text-zetis-text"
          >
            ×
          </button>
        )}
      </div>

      {/* Le cas « rien trouvé » est annoncé par le toast transitoire, pas ici : deux messages
          pour le même fait se liraient comme deux problèmes. */}
      {matchCount !== null && matchCount > 0 && (
        <p className="text-xs text-zetis-muted" role="status">
          {matchCount} étoile{matchCount > 1 ? "s" : ""} trouvée{matchCount > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
