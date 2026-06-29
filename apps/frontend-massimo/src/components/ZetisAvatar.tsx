interface ZetisAvatarProps {
  size?: number;
}

// Avatar ZETIS — guide visuel de l'enfant. Placeholder stylé (Étape 2),
// remplacé plus tard par l'asset officiel (assets/ZETIS_AVATAR.png).
export function ZetisAvatar({ size = 40 }: ZetisAvatarProps) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-zetis-accent to-zetis-accent-2 font-bold text-zetis-bg shadow-lg"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-label="Avatar ZETIS"
    >
      Z
    </div>
  );
}
