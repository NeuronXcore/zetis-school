import { useEffect, useRef, useState } from "react";

/** KnowledgeFolder — la destination. Remplace la `Boite` d'origine.
 *
 * Pendant du [GearsSpinner](./GearsSpinner.tsx) : les roues fabriquent, le dossier reçoit. C'est la
 * métaphore de l'ADR-0041 §682, et elle ne bouge pas — seul le dessin change.
 *
 * 🔴 **UNE PAGE NE PART JAMAIS D'UNE HORLOGE.** En mode `event` (le défaut), une page vole pour
 * CHAQUE incrément réel de `count`, observé entre deux rendus. Une page animée sans donnée derrière
 * est une décoration qui affirme un fait — exactement ce que la bande a mis trois chantiers à
 * cesser de faire.
 *
 * 🔴 **`count` = `pieces_produced`, JAMAIS `pieces_done`.** Une pièce `skipped` a bien traversé le
 * tapis, mais elle était déjà dans le stock : l'y faire tomber une seconde fois mentirait sur ce
 * que ZETIS a fabriqué. C'est la doctrine que portait `useBoiteRecoit`, désormais tenue ici —
 * le composant remplace ce hook, il ne s'y ajoute pas.
 *
 * Le mode `loop` existe pour les écrans vides et les démos. Il est nommé séparément pour qu'on ne
 * puisse pas le brancher dans l'en-tête par distraction. **Interdit dans la bande.**
 *
 * ⚠️ Coloré par `currentColor`, sauf UNE chose : la face avant doit être OPAQUE pour que la page
 * passe derrière — une occultation ne se simule pas avec de la transparence. D'où
 * `--zx-folder-face`, le seul jeton non hérité, à régler sur le FOND RÉEL de la surface.
 *
 * ⚠️ Comme pour les engrenages, `--stopped` ne recolore PAS : le ton vient de la bande
 * (`text-papa-warn`), pas d'un ambre parallèle.
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
  /** Dénominateur, si connu. `null`/absent ⇒ le nom accessible n'annonce que `count`. */
  total?: number | null;
  /** ⚠️ `loop` : écrans vides et démos UNIQUEMENT. Jamais dans la bande. */
  mode?: "event" | "loop";
  /** Figé : aucun moteur de production n'écoute la file. */
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

  // ── mode événementiel : le delta observé, rien d'autre ────────────────────────────────────
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

  // ── mode boucle : décoratif, assumé, jamais branché sur des données ───────────────────────
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
  const label = total != null ? `${count} pièces déposées sur ${total}` : `${count} pièces déposées`;

  return (
    <span
      className={["zx-folder", stopped && "zx-folder--stopped", receiving && "receive", className]
        .filter(Boolean)
        .join(" ")}
      /* Le compte se met à jour SILENCIEUSEMENT : un aria-live qui se déclenche 19 fois transforme
         un lot en litanie. L'annonce se fait une fois, à la fin, par le composant qui possède
         l'état — pas ici. */
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
        {/* les pages en vol s'insèrent ICI, AVANT la face — c'est l'ordre de dessin qui fait le
            « dans », pas le trajet */}
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
      {/* ⚠️ **DEUX span, et ce n'est pas de la décoration.** Le fond prend `currentColor` — donc le
          ton de la bande — et le chiffre bascule sur la couleur de la face. Les mettre sur le MÊME
          élément rend la pastille invisible : `currentColor` se résout sur la couleur finale de
          l'élément, celle qu'on vient justement de remplacer. Constaté à l'écran le 2026-08-07. */}
      {!hideCount && count > 0 && (
        <span className="zx-folder__n on">
          <span className="zx-folder__n-txt">{count}</span>
        </span>
      )}
    </span>
  );
}
