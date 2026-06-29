interface XPBadgeProps {
  xp: number;
  level?: number;
}

export function XPBadge({ xp, level }: XPBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zetis-surface-2 px-3 py-1 text-xs font-semibold text-zetis-accent-2">
      {level != null ? `Niveau ${level} · ` : ""}⭐ {xp} XP
    </span>
  );
}
