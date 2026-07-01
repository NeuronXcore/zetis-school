// Composants de scène Remotion — un par `kind` du CapsuleSpec (vocabulaire fermé, ADR-0007).
// Rendu client-only via @remotion/player ; aucune exécution de code généré (data-driven).
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { type CapsuleScene } from "@zetis/types";

type Scene<K extends CapsuleScene["kind"]> = Extract<CapsuleScene, { kind: K }>;

const BG = "#0b1020";
const INK = "#e8ecff";
const INK_SOFT = "#cdd6ff";
const ACCENT = "#8aa0ff";
const MUTED = "#9aa6c8";

export function TitleScene({ scene }: { scene: Scene<"title"> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", padding: 80, textAlign: "center" }}
    >
      <div style={{ opacity, transform: `scale(${0.9 + pop * 0.1})` }}>
        <h1 style={{ fontSize: 84, fontWeight: 800, color: INK, margin: 0 }}>{scene.title}</h1>
        {scene.subtitle && (
          <p style={{ fontSize: 40, color: ACCENT, marginTop: 24 }}>{scene.subtitle}</p>
        )}
      </div>
    </AbsoluteFill>
  );
}

export function DefinitionScene({ scene }: { scene: Scene<"definition"> }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 110, opacity }}>
      <div style={{ fontSize: 26, color: ACCENT, textTransform: "uppercase", letterSpacing: 3 }}>
        Définition
      </div>
      <h2 style={{ fontSize: 64, fontWeight: 800, color: INK, margin: "10px 0 28px" }}>
        {scene.term}
      </h2>
      <p style={{ fontSize: 40, color: INK_SOFT, lineHeight: 1.4, margin: 0 }}>{scene.body}</p>
      {scene.example && (
        <p style={{ fontSize: 32, color: MUTED, marginTop: 28, fontStyle: "italic" }}>
          Exemple : {scene.example}
        </p>
      )}
    </AbsoluteFill>
  );
}

export function BulletScene({ scene }: { scene: Scene<"bullet"> }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 110 }}>
      <h2 style={{ fontSize: 56, fontWeight: 800, color: INK, marginBottom: 40 }}>{scene.heading}</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {scene.points.map((point, i) => {
          const start = 10 + i * 12;
          const opacity = interpolate(frame, [start, start + 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const x = interpolate(frame, [start, start + 12], [-30, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <li
              key={i}
              style={{
                fontSize: 40,
                color: INK_SOFT,
                marginBottom: 22,
                opacity,
                transform: `translateX(${x}px)`,
                display: "flex",
                gap: 16,
              }}
            >
              <span style={{ color: "#22c55e" }}>▸</span>
              {point}
            </li>
          );
        })}
      </ul>
    </AbsoluteFill>
  );
}

export function NumberlineScene({ scene }: { scene: Scene<"numberline"> }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const draw = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const lineW = width * 0.78;
  const x0 = (width - lineW) / 2;
  const y = height / 2;
  const span = scene.max - scene.min || 1;
  const posX = (value: number) => x0 + ((value - scene.min) / span) * lineW;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <svg width={width} height={height}>
        <line x1={x0} y1={y} x2={x0 + lineW} y2={y} stroke="#26304f" strokeWidth={4} />
        <line x1={x0} y1={y} x2={x0 + lineW * draw} y2={y} stroke={ACCENT} strokeWidth={4} />
        {scene.marks.map((mark, i) => {
          const cx = posX(mark.value);
          const show = interpolate(frame, [20 + i * 6, 30 + i * 6], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <g key={i} opacity={show}>
              <line x1={cx} y1={y - 14} x2={cx} y2={y + 14} stroke={INK} strokeWidth={3} />
              <circle cx={cx} cy={y} r={12} fill={mark.color ?? "#22c55e"} />
              <text x={cx} y={y - 34} fill={INK} fontSize={32} textAnchor="middle">
                {mark.label ?? mark.value}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
}

export function BarmodelScene({ scene }: { scene: Scene<"barmodel"> }) {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const parts = Math.max(1, scene.parts);
  const gap = 6;
  const barW = 900;
  const cellW = (barW - gap * (parts - 1)) / parts;
  const pct = Math.round((scene.filled / parts) * 100);
  const labelOpacity = interpolate(frame, [26, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", padding: 80, opacity: appear }}
    >
      {scene.heading && (
        <h2 style={{ fontSize: 54, fontWeight: 800, color: INK, margin: "0 0 40px" }}>
          {scene.heading}
        </h2>
      )}
      <div style={{ display: "flex", gap }}>
        {Array.from({ length: parts }).map((_, i) => {
          const fillStart = 12 + i * 6;
          const fill =
            i < scene.filled
              ? interpolate(frame, [fillStart, fillStart + 8], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : 0;
          return (
            <div
              key={i}
              style={{
                width: cellW,
                height: 120,
                borderRadius: 8,
                border: `3px solid ${ACCENT}`,
                backgroundColor: `rgba(34, 197, 94, ${0.85 * fill})`,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          marginTop: 34,
          opacity: labelOpacity,
          display: "flex",
          alignItems: "baseline",
          gap: 20,
        }}
      >
        <span style={{ fontSize: 72, fontWeight: 800, color: INK }}>
          {scene.filled}/{parts}
        </span>
        <span style={{ fontSize: 40, color: "#22c55e" }}>= {pct} %</span>
      </div>
      {scene.caption && (
        <p style={{ fontSize: 30, color: MUTED, marginTop: 16 }}>{scene.caption}</p>
      )}
    </AbsoluteFill>
  );
}

export const CAPSULE_BG = BG;
