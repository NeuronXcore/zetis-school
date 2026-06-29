interface ProgressRingProps {
  value: number; // 0–100
  size?: number;
}

// Anneau de progression (Design System ZETIS).
export function ProgressRing({ value, size = 56 }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${center} ${center})`}>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--color-zetis-surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--color-zetis-accent)"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </g>
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="var(--color-zetis-text)"
        fontSize={size * 0.26}
        fontWeight={700}
      >
        {clamped}%
      </text>
    </svg>
  );
}
