import { useEffect, useRef } from "react";
import {
  AVATAR_FRAMING,
  DROWSE_DELAY_MS,
  EYE_MAX,
  JAW_MAX,
  LIP_LINE,
  SPARK,
  STATE_STYLES,
  type AvatarState,
} from "./constants";
import { SILENCE, type Articulation } from "./phonetics";
import faceUrl from "./assets/zetis-face.webp";
import "./avatar.css";

export interface AvatarCanvasProps {
  /** État courant : repos / écoute / réflexion / parole. */
  state: AvatarState;
  /** Éveillé ? ZETIS naît endormi ; le premier geste de Massimo le réveille (assoupissement
   *  différé ~4 s après retour au repos). */
  awake: boolean;
  /** SOURCE du flux d'articulation `[ouverture, grave, médium, aigu]` pour un instant (ms).
   *  Consommée uniquement en `speaking`. En Lot 1 : pseudo-phonétique du texte ; demain : AnalyserNode.
   *  Contrat gelé — le consommateur (ce composant) ne change pas quand la source change. */
  getArticulation?: (tsMs: number) => Articulation | null;
  /** Force le mode mouvement réduit (double manuelle de `prefers-reduced-motion`). */
  reducedMotion?: boolean;
  className?: string;
}

// Bruit périodique 1D interpolé, refermé sur lui-même (jamais de forme florale reconnaissable).
function makeNoise(k: number): (x: number) => number {
  const tab = Array.from({ length: k }, () => Math.random() * 2 - 1);
  return (x: number) => {
    const u = ((x % 1) + 1) % 1;
    const f = u * k;
    const i = Math.floor(f);
    const fr = f - i;
    const a = tab[i % k];
    const b = tab[(i + 1) % k];
    return a + (b - a) * (fr * fr * (3 - 2 * fr));
  };
}

const NB = 28; // bandes de spectre, repliées en miroir sur le cercle
const HIST_MAX = 70;

interface Engine {
  amp: number;
  target: number;
  bands: Float32Array;
  hist: Float32Array[];
  shells: { off: number; dir: number; s: number; sp: Float32Array }[];
  rot: number;
  rotV: number;
  lastShell: number;
  jawAmp: number;
  eyeEnv: number;
  flick: number;
  eyeLit: boolean;
  lid: number;
  idleAt: number;
  blinkUntil: number;
  nextBlink: number;
  wordStart: number;
  prevState: AvatarState;
  prevAwake: boolean;
  nz1: (x: number) => number;
  nz2: (x: number) => number;
  nz3: (x: number) => number;
}

/**
 * Avatar ZETIS — brique de rendu PARTAGÉE (`@zetis/ui/avatar`). Zéro fetch, zéro logique métier :
 * elle consomme `state`, `awake` et le flux d'articulation. Les capsules la réclameront (différé
 * ADR-0007) — son contrat d'entrée doit survivre à une éventuelle migration Rive.
 */
export function AvatarCanvas({
  state,
  awake,
  getArticulation,
  reducedMotion,
  className,
}: AvatarCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Valeurs vivantes lues par la boucle rAF sans relancer l'effet.
  const stateRef = useRef(state);
  stateRef.current = state;
  const awakeRef = useRef(awake);
  awakeRef.current = awake;
  const artRef = useRef(getArticulation);
  artRef.current = getArticulation;

  const prefersReduced =
    typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  const reduced = reducedMotion ?? prefersReduced;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = wrapRef.current;
    const scale = scaleRef.current;
    const box = boxRef.current;
    if (!canvas || !stage || !scale) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / SSR : pas de canvas 2D → aucune animation (tests OK)

    const eng: Engine = {
      amp: 0.04,
      target: 0.04,
      bands: new Float32Array(NB),
      hist: [],
      shells: [],
      rot: 0,
      rotV: 0,
      lastShell: 0,
      jawAmp: 0,
      eyeEnv: 0,
      flick: 0,
      eyeLit: false,
      lid: 1,
      idleAt: -1e9,
      blinkUntil: 0,
      nextBlink: 0,
      wordStart: 0,
      prevState: "idle",
      prevAwake: false,
      nz1: makeNoise(23),
      nz2: makeNoise(17),
      nz3: makeNoise(11),
    };

    const fit = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    const updateBands = (ph: Articulation, red: boolean) => {
      for (let i = 0; i < NB; i++) {
        const f = i / (NB - 1);
        const g =
          Math.exp(-Math.pow((f - 0.1) / 0.17, 2)) * ph[1] +
          Math.exp(-Math.pow((f - 0.44) / 0.21, 2)) * ph[2] +
          Math.exp(-Math.pow((f - 0.84) / 0.27, 2)) * ph[3];
        const k = g > eng.bands[i] ? 0.42 : 0.09; // attaque rapide, relâchement lent
        eng.bands[i] += (g - eng.bands[i]) * (red ? 1 : k);
      }
      eng.hist.push(Float32Array.from(eng.bands));
      if (eng.hist.length > HIST_MAX) eng.hist.shift();
    };
    const snap = (back: number): Float32Array => {
      const i = eng.hist.length - 1 - back;
      return eng.hist[i > 0 ? i : 0] || eng.bands;
    };

    const radial = (
      cx: number,
      cy: number,
      R: number,
      sp: Float32Array,
      gain: number,
      rot: number,
      color: string,
      alpha: number,
      width: number,
      nzf: ((x: number) => number) | null,
      nzPh: number,
      nzGain: number,
    ) => {
      const N = 190;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const u0 = i / N;
        const th = u0 * Math.PI * 2 - Math.PI / 2;
        const u = (u0 + rot + 1) % 1;
        const m = 1 - Math.abs(1 - 2 * u);
        const fb = m * (NB - 1);
        const b0 = Math.floor(fb);
        const fr = fb - b0;
        const v0 = sp[b0];
        const v1 = sp[Math.min(NB - 1, b0 + 1)];
        const v = v0 + (v1 - v0) * (fr * fr * (3 - 2 * fr));
        const n = nzf ? nzf(u0 + nzPh) * nzGain : 0;
        const rr = R + v * gain + n;
        const x = cx + Math.cos(th) * rr;
        const y = cy + Math.sin(th) * rr;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const spawnShell = (dir: number, strength: number) => {
      if (reducedRef.current || eng.shells.length > 14) return;
      eng.shells.push({ off: dir > 0 ? 0 : 1, dir, s: strength, sp: Float32Array.from(eng.bands) });
    };

    let raf = 0;
    const draw = (ts: number) => {
      const state = stateRef.current;
      const awake = awakeRef.current;
      const red = reducedRef.current;
      const cfg = STATE_STYLES[state];

      // Suivi des transitions pour l'horloge des paupières.
      if (state === "idle" && eng.prevState !== "idle") eng.idleAt = ts;
      if (awake && !eng.prevAwake) eng.idleAt = ts;
      eng.prevState = state;
      eng.prevAwake = awake;

      const r = canvas.getBoundingClientRect();
      const cx = r.width / 2;
      const cy = r.height / 2;
      const base = Math.min(r.width, r.height) * 0.29;
      ctx.clearRect(0, 0, r.width, r.height);

      // Amplitude pilotée par l'articulation (parole), sinon synthèse par état.
      const t = ts / 1000;
      const provided = state === "speaking" && artRef.current ? artRef.current(ts) : null;
      const ph: Articulation = provided ?? SILENCE;
      if (state === "speaking") eng.target = 0.05 + ph[0] * 0.95;
      else if (state === "listening") eng.target = 0.13 + Math.abs(eng.nz3(t * 0.42)) * 0.3;
      else if (state === "thinking") eng.target = 0.06;
      else eng.target = 0.05 + Math.sin(t * 0.85) * 0.02;
      eng.amp += (eng.target - eng.amp) * (red ? 1 : 0.22);
      const a = red ? 0.25 : eng.amp;
      updateBands(state === "speaking" ? ph : [0, a * 0.9, a * 0.55, a * 0.3], red);

      // Yeux — horloge propre, désynchronisée de la mâchoire.
      eng.eyeEnv += ((state === "speaking" ? 1 : 0) - eng.eyeEnv) * 0.028;
      if (eng.eyeEnv > 0.004) {
        let o: number;
        let s: number;
        if (red) {
          o = eng.eyeEnv * EYE_MAX * 0.8;
          s = 1;
        } else {
          const beat = 0.74 + 0.26 * Math.sin(t * 1.13) * Math.sin(t * 0.47 + 1.7);
          if (SPARK > 0 && Math.random() < 0.004 + SPARK * 0.005) eng.flick = 1;
          eng.flick *= 0.8;
          o = Math.min(1, eng.eyeEnv * EYE_MAX * beat * (1 + SPARK * eng.flick));
          s = 0.97 + 0.06 * beat + 0.11 * SPARK * eng.flick;
        }
        scale.style.setProperty("--eye-o", o.toFixed(3));
        scale.style.setProperty("--eye-s", s.toFixed(3));
      } else if (eng.eyeLit) {
        scale.style.setProperty("--eye-o", "0");
        eng.eyeEnv = 0;
        eng.flick = 0;
      }
      eng.eyeLit = eng.eyeEnv > 0.004;

      // Paupières — troisième horloge autonome (clignements apériodiques).
      let lidT = !awake ? 1 : state !== "idle" ? 0 : ts - eng.idleAt > DROWSE_DELAY_MS ? 1 : 0;
      if (red) {
        eng.lid = lidT;
      } else {
        if (lidT === 0 && eng.lid < 0.12) {
          if (ts > eng.nextBlink) {
            eng.blinkUntil = ts + 110;
            eng.nextBlink = ts + 2600 + Math.random() * 4200;
          }
          if (ts < eng.blinkUntil) lidT = 1;
        } else if (lidT === 0) {
          eng.nextBlink = ts + 900 + Math.random() * 1800;
        }
        const opening = lidT < eng.lid;
        const k = ts < eng.blinkUntil ? 0.55 : opening ? 0.16 : 0.05;
        eng.lid += (lidT - eng.lid) * k;
        if (eng.lid < 0.002) eng.lid = 0;
        else if (eng.lid > 0.998) eng.lid = 1;
      }
      scale.style.setProperty("--lid", eng.lid.toFixed(3));

      // Mâchoire — suit l'ouverture, se ferme sur m/b/p.
      const jawTarget = state === "speaking" && !red ? ph[0] : 0;
      eng.jawAmp += (jawTarget - eng.jawAmp) * 0.34;
      if (eng.jawAmp < 0.004) eng.jawAmp = 0;
      const boxW = (box?.clientWidth || 196) as number;
      scale.style.setProperty("--jaw", (eng.jawAmp * JAW_MAX * boxW).toFixed(2) + "px");
      scale.style.setProperty("--cav-o", eng.jawAmp > 0.01 ? "1" : "0");

      // Rotation — seule la réflexion tourne franchement.
      const rotT = red
        ? 0
        : state === "thinking"
          ? 0.085
          : state === "listening"
            ? -0.02
            : state === "speaking"
              ? 0.014
              : 0.005;
      eng.rotV += (rotT - eng.rotV) * 0.04;
      eng.rot = (eng.rot + eng.rotV / 60 + 1) % 1;

      // Émission / aspiration directionnelle.
      if (!red) {
        if (state === "listening" && ts - eng.lastShell > 340) {
          spawnShell(-1, 0.34);
          eng.lastShell = ts;
        }
        if (state === "idle" && ts - eng.lastShell > 2600) {
          spawnShell(1, 0.1);
          eng.lastShell = ts;
        }
        const FLY = base * 0.62;
        for (let i = eng.shells.length - 1; i >= 0; i--) {
          const sh = eng.shells[i];
          sh.off += sh.dir * 0.0145;
          if (sh.off > 1 || sh.off < 0) {
            eng.shells.splice(i, 1);
            continue;
          }
          const al =
            sh.dir > 0 ? sh.s * Math.pow(1 - sh.off, 1.5) : sh.s * Math.sin(Math.PI * (1 - sh.off));
          radial(cx, cy, base * 1.24 + sh.off * FLY, sh.sp, base * 0.16 * (1 - sh.off * 0.5), eng.rot, cfg.rings[0], al, 1.1, eng.nz2, sh.off * 0.4, base * 0.012);
        }
      }

      // Trois anneaux, trois retards : la syllabe traverse en cascade.
      radial(cx, cy, base * 1.24, eng.bands, base * 0.3, eng.rot, cfg.rings[0], 0.6, 2.0, eng.nz1, t * 0.05, base * 0.016);
      radial(cx, cy, base * 1.46, snap(9), base * 0.26, eng.rot * 0.92, cfg.rings[1], 0.32, 1.5, eng.nz2, t * 0.035, base * 0.013);
      radial(cx, cy, base * 1.68, snap(24), base * 0.2, eng.rot * 0.84, cfg.rings[2], 0.17, 1.2, eng.nz3, t * 0.02, base * 0.01);

      // Réflexion — arcs contrarotatifs + étincelles, aucune pulsation.
      if (state === "thinking" && !red) {
        ctx.save();
        ctx.setLineDash([5, 13]);
        (
          [
            [1.34, 1.0, 0.3],
            [1.56, -0.62, 0.18],
          ] as const
        ).forEach((o) => {
          ctx.beginPath();
          ctx.arc(cx, cy, base * o[0], t * o[1], t * o[1] + Math.PI * 1.7);
          ctx.strokeStyle = "#2e63ff";
          ctx.globalAlpha = o[2];
          ctx.lineWidth = 1.4;
          ctx.stroke();
        });
        ctx.restore();
        ctx.globalAlpha = 1;
        for (let i = 0; i < 5; i++) {
          const th = t * 0.85 + (i / 5) * Math.PI * 2;
          const rr = base * (1.3 + eng.nz3(t * 0.2 + i * 0.37) * 0.1);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = "#8ec2ff";
          ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.7 + i));
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  // Teinte d'état : pilotée en continu (pastille, halo, glow lisent --state).
  useEffect(() => {
    wrapRef.current?.style.setProperty("--state", STATE_STYLES[state].color);
  }, [state]);

  const cfg = STATE_STYLES[state];
  const breathe = cfg.breathe && !reduced;
  const rootClass = [
    "zetis-avatar",
    `za-is-${state}`,
    reduced ? "za-reduced" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} ref={wrapRef}>
      <canvas className="za-wave" ref={canvasRef} aria-hidden="true" />
      <div className={`za-avatar-wrap${breathe ? " za-breathe" : ""}`} ref={boxRef}>
        <div className="za-glow" />
        <div className="za-clip">
          <div
            className="za-scale"
            ref={scaleRef}
            style={
              {
                "--ascale": AVATAR_FRAMING,
                "--lip": `${LIP_LINE}%`,
                "--face": `url(${faceUrl})`,
              } as React.CSSProperties
            }
          >
            <img className="za-img" src={faceUrl} alt="" aria-hidden="true" />
            <span className="za-cavity" />
            <span className="za-jaw" />
            <span className="za-eye za-l" />
            <span className="za-eye za-r" />
            <span className="za-lid za-l" />
            <span className="za-lid za-r" />
          </div>
        </div>
        <div className="za-core">
          <div className="za-core-halo" />
          <svg viewBox="0 0 30 34" aria-hidden="true">
            <path d="M15 1 L28.5 8.8 L28.5 25.2 L15 33 L1.5 25.2 L1.5 8.8 Z" />
            <path d="M15 1 L15 33 M1.5 8.8 L28.5 25.2 M28.5 8.8 L1.5 25.2" />
            <path d="M8.2 12.9 L21.8 12.9 M8.2 21.1 L21.8 21.1" />
          </svg>
        </div>
      </div>
      <div
        className={`za-pastille${cfg.label ? " za-on" : ""}`}
        role="status"
        aria-live="polite"
      >
        <span className="za-dot" />
        <span>{cfg.label}</span>
      </div>
    </div>
  );
}
