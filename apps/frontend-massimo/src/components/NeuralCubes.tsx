import "./headerFx.css";

// Animation du header : halo autour du cercle + « cubes neuronaux » qui jaillissent
// du livre, montent, tournent et scintillent (connaissance + joie d'étudier).
// Tout en CSS (positions en %, donc responsive) — pas de mesure, pas de JS d'anim.

// Pseudo-aléatoire déterministe par index (stable entre rendus).
function rand(i: number, salt: number): number {
  const s = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// Cyan dominant + quelques touches chaudes (ambre/or) et un violet (palette login).
const PALETTE = ["#7ad1ff", "#a8e3ff", "#7ad1ff", "#ffd27a", "#ffc24d", "#c4a8ff"];

interface Cube {
  leftPct: number;
  topPct: number;
  dx: number;
  dy: number;
  rot: number;
  size: number;
  dur: number;
  delay: number;
  tw: number;
  peak: number;
  color: string;
}

// Cubes émis autour du livre (centre-bas), montant et se dispersant.
const CUBES: Cube[] = Array.from({ length: 22 }, (_, i) => ({
  leftPct: 40 + rand(i, 1) * 20, // 40 %..60 % (autour du livre)
  topPct: 44 + rand(i, 2) * 18, // 44 %..62 % (depuis le livre)
  dx: (rand(i, 3) * 2 - 1) * 46, // dérive horizontale ±46 px
  dy: -(26 + rand(i, 4) * 50), // montée 26..76 px
  rot: (rand(i, 11) * 2 - 1) * 90, // rotation finale ±90°
  size: 5 + rand(i, 5) * 7, // 5..12 px
  dur: 2.6 + rand(i, 6) * 2.8, // 2.6..5.4 s
  delay: rand(i, 7) * 5.5, // décalage d'émission
  tw: 0.8 + rand(i, 8) * 1.4, // période de scintillement
  peak: 0.55 + rand(i, 9) * 0.4, // opacité crête
  color: PALETTE[Math.floor(rand(i, 10) * PALETTE.length)],
}));

export function NeuralCubes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Halo autour du cercle du livre (ceint l'emblème ≈ 84 px). */}
      <span className="hfx-halo-glow h-36 w-36" />
      <span className="hfx-halo-ring h-[5.5rem] w-[5.5rem]" />

      {/* Cubes neuronaux. */}
      {CUBES.map((c, i) => (
        <span
          key={i}
          className="hfx-cube"
          style={
            {
              left: `${c.leftPct}%`,
              top: `${c.topPct}%`,
              width: `${c.size}px`,
              height: `${c.size}px`,
              "--color": c.color,
              "--dx": `${c.dx}px`,
              "--dy": `${c.dy}px`,
              "--rot": `${c.rot}deg`,
              "--dur": `${c.dur}s`,
              "--delay": `${c.delay}s`,
              "--tw": `${c.tw}s`,
              "--peak": `${c.peak}`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
