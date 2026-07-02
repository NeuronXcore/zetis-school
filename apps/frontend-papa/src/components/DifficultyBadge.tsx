// Pastille de niveau de difficulté d'une capsule (facile/moyen/difficile), en étoiles.
// Masquée si la difficulté est absente (capsules d'avant cette option).
const DIFF: Record<string, { label: string; stars: string; cls: string }> = {
  facile: { label: "Facile", stars: "⭐", cls: "bg-emerald-500/15 text-emerald-300" },
  moyen: { label: "Moyen", stars: "⭐⭐", cls: "bg-amber-500/15 text-amber-300" },
  difficile: { label: "Difficile", stars: "⭐⭐⭐", cls: "bg-rose-500/15 text-rose-300" },
};

export function DifficultyBadge({ difficulty }: { difficulty: string | null | undefined }) {
  const d = difficulty ? DIFF[difficulty] : undefined;
  if (!d) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.cls}`}
      title={d.label}
    >
      {d.stars} {d.label}
    </span>
  );
}
