import { useEffect, useMemo, useRef, useState } from "react";
import "./headerFx.css";

// Réseau neuronal du header : des lignes relient le cercle (centre) à des nœuds
// répartis vers les deux bords, et une impulsion lumineuse parcourt chaque ligne
// du centre vers l'extérieur. Couche mesurée (ResizeObserver) → responsive, tracé px.

function rand(i: number, salt: number): number {
  const s = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

interface Link {
  startX: number;
  startY: number;
  nodeX: number;
  nodeY: number;
  nodeR: number;
  dur: number;
  delay: number;
  idx: number;
}

const PER_SIDE = 4;

export function NeuralLinks() {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  const reduced = usePrefersReducedMotion();

  const links = useMemo<Link[]>(() => {
    if (!w || !h) return [];
    const cx = w / 2;
    const cy = h * 0.4;
    const r = h * 0.34;
    const pad = h * 0.16;
    const out: Link[] = [];
    for (const side of [-1, 1] as const) {
      for (let k = 0; k < PER_SIDE; k++) {
        const idx = (side === -1 ? 0 : PER_SIDE) + k;
        const frac = (k + 1) / (PER_SIDE + 1);
        const nodeX = cx + side * (r + frac * (w / 2 - r - pad));
        const nodeY = cy + (rand(idx, 1) * 2 - 1) * h * 0.4;
        const startX = cx + side * r * 0.92;
        const startY = cy + (nodeY - cy) * 0.1;
        const dur = 1.8 + rand(idx, 2) * 1.8;
        const delay = rand(idx, 3) * dur; // décalage (begin négatif → déjà en cours)
        const nodeR = 1.8 + rand(idx, 4) * 1.4;
        out.push({ startX, startY, nodeX, nodeY, nodeR, dur, delay, idx });
      }
    }
    return out;
  }, [w, h]);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" aria-hidden>
      {w > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full">
          {links.map((l) => (
            <g key={l.idx}>
              <line
                x1={l.startX}
                y1={l.startY}
                x2={l.nodeX}
                y2={l.nodeY}
                stroke="#62c7ff"
                strokeWidth="1"
                opacity="0.16"
              />
              <circle className="hfx-node" cx={l.nodeX} cy={l.nodeY} r={l.nodeR} fill="#9fe0ff">
                {!reduced && (
                  <animate
                    attributeName="opacity"
                    values="0.25;0.95;0.25"
                    dur={`${l.dur}s`}
                    begin={`-${l.delay}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              {!reduced && (
                <circle className="hfx-pulse" r="2.2" fill="#d6f1ff">
                  <animate
                    attributeName="cx"
                    values={`${l.startX};${l.nodeX}`}
                    dur={`${l.dur}s`}
                    begin={`-${l.delay}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values={`${l.startY};${l.nodeY}`}
                    dur={`${l.dur}s`}
                    begin={`-${l.delay}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.15;0.7;1"
                    dur={`${l.dur}s`}
                    begin={`-${l.delay}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
