import ReactMarkdown from "react-markdown";
import { type ReviewRating } from "@zetis/types";
import { NEON_BUTTON } from "./glass";

// Carte de session (présentation pure) : recto = question, flip 3D → verso = réponse,
// puis notes (retardées, gérées par le hook). Aucun rouge, aucun vocabulaire d'échec.
// `again` = ambre doux. En reduced-motion, pas de rotation : la face utile est rendue seule.

export interface FlipCardProps {
  subjectName: string;
  subjectIconUrl?: string;
  front: string;
  back: string;
  /** Verso visible (piloté par le hook : `status === "back"`). */
  flipped: boolean;
  onReveal: () => void;
  /** Notes visibles (apparition retardée anti-réflexe, gérée par le hook). */
  showRatings: boolean;
  onRate: (rating: ReviewRating) => void;
  reducedMotion: boolean;
}

const MD =
  "leading-relaxed text-slate-100 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1";

// Ordre + habillage des 4 notes (mapping code inchangé). Zéro rouge.
const RATINGS: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: "again", label: "🔄 À revoir", className: "border-amber-400/40 bg-amber-400/15 text-amber-100" },
  { rating: "hard", label: "🤔 Difficile", className: "border-white/15 bg-white/5 text-slate-200" },
  { rating: "good", label: "🙂 Bien", className: "border-cyan-400/40 bg-cyan-400/15 text-cyan-100" },
  { rating: "easy", label: "⚡ Facile", className: "border-violet-400/40 bg-violet-400/15 text-violet-100" },
];

function SubjectTag({ name, iconUrl }: { name: string; iconUrl?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
      {iconUrl ? (
        <img src={iconUrl} alt="" aria-hidden className="h-6 w-6 object-contain" />
      ) : (
        <span aria-hidden>📚</span>
      )}
      <span>{name}</span>
    </div>
  );
}

function Face({
  side,
  subjectName,
  subjectIconUrl,
  content,
  className = "",
}: {
  side: "Question" | "Réponse";
  subjectName: string;
  subjectIconUrl?: string;
  content: string;
  className?: string;
}) {
  // Recto (Question) et verso (Réponse) ont une APPARENCE distincte : le recto est bleu
  // (« je cherche »), le verso vert (« voilà, c'est ancré ! » — positif, jamais un rouge d'échec).
  const isBack = side === "Réponse";
  const faceTone = isBack
    ? "border-emerald-400/30 bg-emerald-500/[0.08]"
    : "border-sky-400/30 bg-sky-500/[0.08]";
  const pillTone = isBack
    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
    : "border-sky-400/40 bg-sky-400/15 text-sky-100";
  return (
    <div
      className={`flex min-h-56 w-full flex-col gap-4 rounded-3xl border ${faceTone} p-6 shadow-2xl backdrop-blur-xl ${className}`}
    >
      <div className="flex items-center justify-between">
        <SubjectTag name={subjectName} iconUrl={subjectIconUrl} />
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${pillTone}`}
        >
          {isBack ? "✅ Réponse" : "❓ Question"}
        </span>
      </div>
      <div className={`flex-1 ${MD}`}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

export function FlipCard({
  subjectName,
  subjectIconUrl,
  front,
  back,
  flipped,
  onReveal,
  showRatings,
  onRate,
  reducedMotion,
}: FlipCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5">
      {reducedMotion ? (
        // Sans animation : la face utile est rendue directement.
        <Face
          side={flipped ? "Réponse" : "Question"}
          subjectName={subjectName}
          subjectIconUrl={subjectIconUrl}
          content={flipped ? back : front}
        />
      ) : (
        <div className="w-full [perspective:1400px]">
          <div
            className="relative transition-transform duration-500 [transform-style:preserve-3d]"
            style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
          >
            <Face
              side="Question"
              subjectName={subjectName}
              subjectIconUrl={subjectIconUrl}
              content={front}
              className="[backface-visibility:hidden]"
            />
            <Face
              side="Réponse"
              subjectName={subjectName}
              subjectIconUrl={subjectIconUrl}
              content={back}
              className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]"
            />
          </div>
        </div>
      )}

      {!flipped && (
        <button type="button" className={NEON_BUTTON} onClick={onReveal}>
          Révéler la réponse
        </button>
      )}

      {flipped && showRatings && (
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map(({ rating, label, className }) => (
            <button
              key={rating}
              type="button"
              onClick={() => onRate(rating)}
              className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${className}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
