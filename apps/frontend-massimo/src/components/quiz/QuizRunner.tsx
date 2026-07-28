import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { QuizAnswerInput } from "./QuizAnswerInput";
import { QuizEndCard } from "./QuizEndCard";
import { type QuizSessionApi } from "../../hooks/useQuizSession";

// Passation d'un quiz (présentationnel) — EXTRAIT de QuizSessionPage pour être réutilisé par la
// page /quiz/session ET par la modale de mission. La logique vit dans `useQuizSession` (correction
// serveur, XP). Le composant ne navigue jamais : `onExit` est fourni par l'appelant (retour liste
// pour la page, fermeture de la modale pour la mission). L'observation de la fin (`status`) est
// aussi côté appelant.

const FORMAT_LABELS: Record<string, string> = {
  mcq: "QCM",
  mcq_multi: "QCM multi",
  true_false: "Vrai / Faux",
  cloze: "Texte à trous",
  numeric: "Réponse courte",
  ordering: "Remets dans l'ordre",
  matching: "Association",
  open: "Réponse ouverte",
};

export function QuizRunner({
  session,
  label,
  onExit,
}: {
  session: QuizSessionApi;
  label: string;
  onExit: () => void;
}) {
  const [answer, setAnswer] = useState<{ json: unknown; ok: boolean }>({ json: null, ok: false });

  // Nouvelle question → on remet la réponse à zéro.
  useEffect(() => {
    setAnswer({ json: null, ok: false });
  }, [session.progress.current]);

  const { question, status, progress, feedback, summary, wrapUp, error } = session;
  const pctBar = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <>
      <button
        type="button"
        onClick={onExit}
        className="mb-4 text-sm text-cyan-300 hover:underline"
      >
        ← Quitter
      </button>

      {status === "loading" && <p className="text-zetis-muted">Préparation de ton quiz…</p>}

      {status === "error" && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl">
          <p className="text-sm text-amber-200">{error ?? "Un souci est survenu."}</p>
          <div className="mt-4 flex justify-center gap-3 text-sm">
            <button type="button" onClick={session.reload} className="text-cyan-300 hover:underline">
              Réessayer
            </button>
            <button type="button" onClick={onExit} className="text-slate-400 hover:underline">
              Retour aux quiz
            </button>
          </div>
        </div>
      )}

      {(status === "answering" || status === "feedback") && question && (
        <>
          <div className="mb-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-lg">
            <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-[width] duration-300"
                style={{ width: `${pctBar}%` }}
              />
            </div>
            <p className="mt-1.5 text-right text-xs text-slate-400">
              Question {progress.current} / {progress.total}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_40px_rgba(99,102,241,0.12)] backdrop-blur-lg">
            <span className="mb-3.5 inline-block rounded-full border border-cyan-400/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-cyan-300">
              {FORMAT_LABELS[question.question_type] ?? question.question_type}
            </span>
            <div className="mb-5 text-[19px] font-semibold leading-snug [&_p]:m-0">
              <ReactMarkdown>{question.prompt_markdown}</ReactMarkdown>
            </div>

            <QuizAnswerInput
              key={question.id}
              question={question}
              disabled={status === "feedback"}
              onChange={(json, ok) => setAnswer({ json, ok })}
            />

            {error && status === "answering" && (
              <p className="mt-3 text-center text-sm text-amber-200">{error}</p>
            )}

            {status === "feedback" && feedback && (
              <div
                className={`mt-4 rounded-2xl border px-4 py-4 text-[14.5px] leading-relaxed ${feedback.is_correct ? "border-emerald-400/40 bg-emerald-400/10" : "border-amber-400/35 bg-amber-400/10"}`}
              >
                <p className={`mb-1 font-bold ${feedback.is_correct ? "text-emerald-400" : "text-amber-300"}`}>
                  {feedback.is_correct ? "✨ Bien joué !" : "💡 Pas tout à fait — regarde :"}
                </p>
                {feedback.explanation_markdown && (
                  <div className="[&_p]:m-0 [&_p]:mt-1">
                    <ReactMarkdown>{feedback.explanation_markdown}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              {status === "answering" ? (
                <button
                  type="button"
                  disabled={!answer.ok}
                  onClick={() => session.submit(answer.json)}
                  className="rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-400 px-8 py-3.5 text-base font-bold text-white shadow-[0_6px_24px_rgba(99,102,241,0.35)] transition enabled:hover:-translate-y-0.5 disabled:opacity-40"
                >
                  Valider
                </button>
              ) : (
                <button
                  type="button"
                  onClick={session.next}
                  className="rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-400 px-8 py-3.5 text-base font-bold text-white shadow-[0_6px_24px_rgba(99,102,241,0.35)] transition hover:-translate-y-0.5"
                >
                  {session.isLast ? "Terminer" : "Question suivante →"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {status === "summary" && summary && (
        <QuizEndCard result={summary} onFinish={session.finish} wrapUp={wrapUp} />
      )}
    </>
  );
}
