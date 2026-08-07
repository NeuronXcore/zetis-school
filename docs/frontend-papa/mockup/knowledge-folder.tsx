import { useEffect, useRef, useState } from "react";

/**
 * KnowledgeFolder — la destination. Pendant du `GearsSpinner` :
 * les roues fabriquent, le dossier reçoit.
 *
 * 🔴 UNE PAGE NE PART JAMAIS D'UNE HORLOGE. En mode `event` (le défaut), une
 * page vole pour CHAQUE incrément réel de `count`, observé entre deux rendus.
 * Une page animée sans donnée derrière est une décoration qui affirme un fait —
 * exactement ce que la barre a mis trois chantiers à cesser de faire.
 *
 * Le mode `loop` existe pour les écrans vides et les démos. Il est nommé
 * séparément pour qu'on ne puisse pas le brancher dans l'en-tête par
 * distraction.
 *
 * Coloré par `currentColor`, sauf UNE chose : la face avant doit être OPAQUE
 * pour que la page passe derrière — une occultation ne se simule pas avec de la
 * transparence. D'où `--zx-folder-face`, le seul jeton non hérité.
 */

const BACK_D =
  "M4 12 L4 7.5 Q4 6 5.5 6 L15 6 Q16.4 6 17.2 7.2 L19 10 L38.5 10 Q40 10 40 11.5 L40 28.5 Q40 30 38.5 30 L5.5 30 Q4 30 4 28.5 Z";
const FACE_D =
  "M4 15.5 Q4 14 5.5 14 L38.5 14 Q40 14 40 15.5 L40 28.5 Q40 30 38.5 30 L5.5 30 Q4 30 4 28.5 Z";

/** La pile plafonne à 4 feuilles : elle dit « ça s'accumule », pas « combien ». */
const STACK = [
  { x: 10, y: 13.4, w: 24 },
  { x: 10.8, y: 12.2, w: 22.4 },
  { x: 11.6, y: 11, w: 20.8 },
  { x: 12.4, y: 9.8, w: 19.2 },
];

/** Au-delà, on n'anime pas 30 pages : on en montre 3 et le compteur dit le vrai. */
const MAX_IN_FLIGHT = 3;
const STAGGER_MS = 380;

export interface KnowledgeFolderProps {
  /** Nombre de pièces déposées. Chaque incrément déclenche une page. */
  count?: number;
  /** Dénominateur, si connu. `null`/absent ⇒ le compteur n'affiche que `count`. */
  total?: number | null;
  /** ⚠️ `loop` : écrans vides et démos UNIQUEMENT. Jamais dans l'en-tête. */
  mode?: "event" | "loop";
  /** Figé et ambre : aucun moteur de production n'écoute la file. */
  stopped?: boolean;
  /** Masquer la pastille de compteur. */
  hideCount?: boolean;
  /** À utiliser quand un texte voisin dit déjà le dépôt. */
  decorative?: boolean;
  className?: string;
}

export function KnowledgeFolder({
  count = 0,
  total = null,
  mode = "event",
  stopped = false,
  hideCount = false,
  decorative = false,
  className = "",
}: KnowledgeFolderProps) {
  const [inFlight, setInFlight] = useState<number[]>([]);
  const [receiving, setReceiving] = useState(false);
  const prev = useRef(count);
  const seq = useRef(0);

  // ── mode événementiel : le delta observé, rien d'autre ──────────────
  useEffect(() => {
    if (mode !== "event") return;
    const delta = count - prev.current;
    prev.current = count;
    if (delta <= 0) return; // un compteur qui recule ne rejoue rien

    const n = Math.min(delta, MAX_IN_FLIGHT);
    const timers: number[] = [];
    for (let i = 0; i < n; i++) {
      timers.push(
        window.setTimeout(() => {
          const id = seq.current++;
          setInFlight((f) => [...f, id].slice(-MAX_IN_FLIGHT));
          window.setTimeout(() => {
            setReceiving(true);
            window.setTimeout(() => setReceiving(false), 260);
          }, 470);
        }, i * STAGGER_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [count, mode]);

  // ── mode boucle : décoratif, assumé, jamais branché sur des données ──
  useEffect(() => {
    if (mode !== "loop" || stopped) return;
    const t = window.setInterval(() => {
      const id = seq.current++;
      setInFlight((f) => [...f, id].slice(-MAX_IN_FLIGHT));
      window.setTimeout(() => {
        setReceiving(true);
        window.setTimeout(() => setReceiving(false), 260);
      }, 470);
    }, 1100);
    return () => clearInterval(t);
  }, [mode, stopped]);

  const filled = Math.min(STACK.length, Math.ceil(count / 2));
  const label =
    total != null
      ? `${count} pièces déposées sur ${total}`
      : `${count} pièces déposées`;

  return (
    <span
      className={[
        "zx-folder",
        stopped && "zx-folder--stopped",
        receiving && "receive",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      /* Le compte se met à jour SILENCIEUSEMENT : un aria-live qui se déclenche
         19 fois transforme un lot en litanie. L'annonce se fait une fois, à la
         fin, par le composant qui possède l'état — pas ici. */
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "status", "aria-live": "off" as const, "aria-label": label })}
    >
      <span className="zx-folder__glow" />
      <svg viewBox="0 0 44 34" aria-hidden="true" focusable="false">
        <path className="zx-folder__back" d={BACK_D} />
        <g className="zx-folder__stack">
          {STACK.map((s, i) => (
            <rect
              key={i}
              x={s.x}
              y={s.y}
              width={s.w}
              height={9}
              rx={1}
              className={i < filled ? "on" : undefined}
            />
          ))}
        </g>
        {/* les pages en vol s'insèrent ICI, AVANT la face — c'est l'ordre de
            dessin qui fait le « dans », pas le trajet */}
        <g>
          {inFlight.map((id) => (
            <rect
              key={id}
              x={11.2}
              y={11.6}
              width={21.6}
              height={9}
              rx={1}
              className="zx-folder__in"
            />
          ))}
        </g>
        <path className="zx-folder__face" d={FACE_D} />
      </svg>
      {!hideCount && count > 0 && (
        <span className="zx-folder__n on">{count}</span>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Styles à poser dans la feuille partagée de `packages/ui`.

   .zx-folder{
     display:inline-block; position:relative;
     width:2.4em; height:2em; color:inherit; flex:0 0 auto;
     --zx-folder-face:#0a1a15;          ⚠️ à surcharger par surface : la face
   }                                     doit valoir le FOND réel, sinon la page
                                         « disparaît » sur un carré plus clair.
   .zx-folder svg{ display:block; width:100%; height:100%; overflow:visible }

   .zx-folder__back{ fill:currentColor; opacity:.16;
                     stroke:currentColor; stroke-width:.9; stroke-opacity:.5 }
   .zx-folder__face{ fill:var(--zx-folder-face);
                     stroke:currentColor; stroke-width:1; stroke-opacity:.85;
                     transform-box:fill-box; transform-origin:50% 100%;
                     transition:transform .22s cubic-bezier(.34,1.4,.64,1) }
   .zx-folder__stack rect{ fill:currentColor; stroke:var(--zx-folder-face);
                           stroke-width:.5; opacity:0; transition:opacity .35s ease }
   .zx-folder__stack rect.on{ opacity:.62 }

   .zx-folder__in{
     fill:currentColor; transform-box:fill-box; transform-origin:50% 50%;
     animation:zx-drop .62s cubic-bezier(.22,.9,.3,1.06) forwards;
   }
   @keyframes zx-drop{
     0%  { transform:translate(-9px,-11px) rotate(-16deg) scale(.86); opacity:0 }
     22% { opacity:1 }
     70% { transform:translate(0,1.2px) rotate(1.5deg) scale(1); opacity:1 }
     100%{ transform:none; opacity:.72 }
   }

   .zx-folder.receive .zx-folder__face{ transform:scaleY(.93) translateY(.6px) }
   .zx-folder__glow{
     position:absolute; inset:-18%; border-radius:30%; pointer-events:none; opacity:0;
     background:radial-gradient(circle,currentColor,transparent 66%);
   }
   .zx-folder.receive .zx-folder__glow{ animation:zx-catch .5s ease-out }
   @keyframes zx-catch{ 0%{opacity:0} 30%{opacity:.45} 100%{opacity:0} }

   .zx-folder__n{
     position:absolute; right:-.35em; top:-.3em;
     font-size:.5em; line-height:1; padding:.22em .38em; border-radius:99px;
     font-variant-numeric:tabular-nums;
     background:currentColor; color:var(--zx-folder-face);
     opacity:0; transform:scale(.6);
     transition:.22s cubic-bezier(.34,1.4,.64,1);
   }
   .zx-folder__n.on{ opacity:1; transform:scale(1) }

   .zx-folder--stopped{ color:var(--zx-amber,#f0a02a); opacity:.85;
                        --zx-folder-face:#150f04 }

   ⚠️ Mouvement réduit : FIGE sans rien retirer. La page apparaît à sa place et
   la pile monte quand même — masquer le dépôt effacerait le signal.
   @media (prefers-reduced-motion:reduce){
     .zx-folder__in{ animation:zx-drop-rm .01s forwards }
     .zx-folder__face,.zx-folder__stack rect{ transition:none }
     .zx-folder.receive .zx-folder__glow{ animation:none }
   }
   @keyframes zx-drop-rm{ to{ transform:none; opacity:.72 } }
   ═══════════════════════════════════════════════════════════════════════════ */
