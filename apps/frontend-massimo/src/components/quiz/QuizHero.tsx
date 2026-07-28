import { type CSSProperties, useEffect, useMemo, useState } from "react";
import quizIcon from "../../assets/app/quiz_384.png";
import { prefersReducedMotion } from "../../lib/motion";

// Hero animé de la page Quiz : la mascotte ZETIS « répond à des quiz » en boucle — des options
// défilent, la bonne s'illumine (✓), étincelles + hochement de tête, et les points de
// progression se remplissent. Purement décoratif (aria-hidden) et coupé si `prefers-reduced-motion`.

const ROUNDS = [
  { opts: ["12", "24", "36"], correct: 1 },
  { opts: ["Le sujet", "Le COD", "Le verbe"], correct: 0 },
  { opts: ["L'air", "L'eau", "Le feu"], correct: 1 },
  { opts: ["Vrai", "Faux"], correct: 0 },
];

const DOTS = 5;
const TICK_MS = 1300; // 2 ticks par question : « je réfléchis » puis « je réponds ».

const spark = (a: string, d: string): CSSProperties =>
  ({ "--a": a, "--d": d }) as CSSProperties;

export function QuizHero() {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const round = ROUNDS[Math.floor(tick / 2) % ROUNDS.length];
  const answered = reduced || tick % 2 === 1; // en reduced-motion : état « répondu » figé
  const filled = reduced ? 3 : Math.floor(tick / 2) % (DOTS + 1);

  return (
    <div className="qh relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg">
      <style>{QH_CSS}</style>
      <div className="qh-glow" aria-hidden />

      <div className="relative flex items-center gap-5">
        {/* Mascotte : flotte en continu, hoche la tête à chaque bonne réponse, lâche des étincelles. */}
        <div className="qh-mascot relative shrink-0" aria-hidden>
          <img
            src={quizIcon}
            alt=""
            className={`qh-icon h-24 w-24 rounded-2xl object-cover ${answered && !reduced ? "qh-nod" : ""}`}
            key={answered && !reduced ? `nod-${tick}` : "idle"}
          />
          {answered && !reduced && (
            <>
              <span className="qh-spark" style={spark("-20deg", "26px")} key={`s1-${tick}`}>
                ✦
              </span>
              <span className="qh-spark" style={spark("18deg", "30px")} key={`s2-${tick}`}>
                ✧
              </span>
              <span className="qh-spark" style={spark("62deg", "22px")} key={`s3-${tick}`}>
                ✦
              </span>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">Prêt pour un quiz&nbsp;? 🎯</h1>
          <p className="mb-3 text-xs text-zetis-muted">
            ZETIS te pose des questions, tu réponds. Choisis une matière ci-dessous.
          </p>

          {/* Mini-quiz joué par la mascotte (décoratif). */}
          <div className="flex flex-col gap-1.5" aria-hidden>
            {round.opts.map((o, i) => {
              const ok = answered && i === round.correct;
              return (
                <div key={i} className={`qh-opt ${ok ? "qh-correct" : ""}`}>
                  <span className="qh-box">{ok ? "✓" : ""}</span>
                  <span className="truncate">{o}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: DOTS }).map((_, i) => (
              <span key={i} className={`qh-dot ${i < filled ? "qh-dot-on" : ""}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const QH_CSS = `
.qh-glow{position:absolute;left:-10%;top:-60%;right:-10%;height:220px;pointer-events:none;
  background:radial-gradient(closest-side, rgba(99,102,241,.22), transparent 72%);
  animation:qh-glow 4.5s ease-in-out infinite}
@keyframes qh-glow{0%,100%{opacity:.6;transform:translateY(0)}50%{opacity:1;transform:translateY(8px)}}

.qh-mascot{animation:qh-float 3.6s ease-in-out infinite}
@keyframes qh-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

.qh-icon{filter:drop-shadow(0 0 10px rgba(99,102,241,.5))}
.qh-nod{animation:qh-nod .55s ease}
@keyframes qh-nod{0%{transform:scale(1)}30%{transform:scale(1.14) rotate(-5deg)}
  60%{transform:scale(.97) rotate(4deg)}100%{transform:scale(1)}}

.qh-spark{position:absolute;left:50%;top:50%;font-size:13px;color:#fde68a;pointer-events:none;
  animation:qh-spark .75s ease-out forwards}
@keyframes qh-spark{
  0%{opacity:0;transform:translate(-50%,-50%) rotate(var(--a)) translateY(0) scale(.3)}
  25%{opacity:1}
  100%{opacity:0;transform:translate(-50%,-50%) rotate(var(--a)) translateY(calc(-1 * var(--d))) scale(1.1)}}

.qh-opt{display:flex;align-items:center;gap:8px;border-radius:10px;border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.04);padding:6px 10px;font-size:13px;color:#cbd5e1;
  transition:border-color .3s ease,background .3s ease,color .3s ease}
.qh-box{display:flex;width:16px;height:16px;align-items:center;justify-content:center;border-radius:5px;
  border:1.5px solid #64748b;font-size:10px;font-weight:800;flex-shrink:0;transition:all .3s ease}
.qh-correct{border-color:rgba(52,211,153,.6);background:rgba(52,211,153,.12);color:#6ee7b7;
  animation:qh-pop .45s ease}
.qh-correct .qh-box{border-color:#34d399;background:#34d399;color:#052e2b}
@keyframes qh-pop{0%{transform:scale(1)}40%{transform:scale(1.04)}100%{transform:scale(1)}}

.qh-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.16);
  transition:background .3s ease,transform .3s ease}
.qh-dot-on{background:linear-gradient(90deg,#22d3ee,#6366f1);transform:scale(1.2)}

@media (prefers-reduced-motion: reduce){
  .qh-glow,.qh-mascot,.qh-nod,.qh-spark,.qh-correct{animation:none!important}
}
`;
