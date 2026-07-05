import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type QuizSubjectSummary, type StudentQuiz } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { QuizHero } from "../components/quiz/QuizHero";
import { fetchQuizSubjects, fetchSubjectQuizzes } from "../lib/quiz";
import { subjectEmoji } from "../lib/subjectEmoji";
import { type QuizSessionState } from "./QuizSessionPage";

// Page « Quiz » de Massimo (/quiz). Deux écrans internes (maquette validée) :
//   1. grille des matières (grisée si aucun quiz) ;
//   2. quiz jouables de la matière → lancement du lecteur (/quiz/session).
// Le lecteur (passation, feedback, résumé) vit dans QuizSessionPage. Massimo ne voit un
// quiz que s'il existe : rien de généré à la volée ici.

function lessonFromTitle(title: string): string {
  return title.replace(/^Quiz\s*[—-]\s*/, "");
}

export function QuizPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<QuizSubjectSummary[] | null>(null);
  const [selected, setSelected] = useState<QuizSubjectSummary | null>(null);
  const [quizzes, setQuizzes] = useState<StudentQuiz[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSubjects(await fetchQuizSubjects());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openSubject = useCallback(async (subject: QuizSubjectSummary) => {
    setSelected(subject);
    setQuizzes(null);
    setListLoading(true);
    setError(null);
    try {
      setQuizzes(await fetchSubjectQuizzes(subject.slug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setListLoading(false);
    }
  }, []);

  const launch = (quiz: StudentQuiz) => {
    if (!selected) return;
    const state: QuizSessionState = {
      quiz,
      label: `${selected.name} · ${lessonFromTitle(quiz.title)}`,
    };
    navigate("/quiz/session", { state });
  };

  // ── Écran 2 : quiz de la matière ──────────────────────────────────────────
  if (selected) {
    return (
      <div className="mx-auto max-w-xl">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQuizzes(null);
          }}
          className="mb-4 text-sm text-cyan-300 hover:underline"
        >
          ← Toutes les matières
        </button>
        <PageHeader title={`${subjectEmoji(selected.slug)} ${selected.name}`} />

        {error && (
          <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}
        {listLoading && <p className="text-zetis-muted">Chargement…</p>}
        {quizzes && quizzes.length === 0 && (
          <p className="text-sm italic text-zetis-muted">Aucun quiz pour cette matière.</p>
        )}

        <div className="flex flex-col gap-2.5">
          {quizzes?.map((quiz) => (
            <button
              key={quiz.quiz_id}
              type="button"
              onClick={() => launch(quiz)}
              className="flex items-center gap-3.5 rounded-2xl border border-l-4 border-white/10 border-l-fuchsia-400 bg-white/5 px-4 py-4 text-left backdrop-blur-lg transition hover:-translate-y-0.5 hover:border-indigo-400/70"
            >
              <span className="text-2xl">📝</span>
              <span className="min-w-0">
                <span className="block font-bold">{lessonFromTitle(quiz.title)}</span>
                <span className="text-xs text-zetis-muted">
                  {quiz.questions.length} question{quiz.questions.length > 1 ? "s" : ""} · quiz du cours
                </span>
              </span>
              <span className="ml-auto text-lg text-indigo-400">▶</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Écran 1 : grille des matières ─────────────────────────────────────────
  return (
    <div className="mx-auto max-w-xl">
      <QuizHero />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}
      {loading && <p className="text-zetis-muted">Chargement…</p>}
      {subjects && subjects.length === 0 && (
        <p className="text-sm italic text-zetis-muted">
          Tes quiz arrivent bientôt — quand un cours aura son quiz, il apparaîtra ici.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {subjects?.map((s) => {
          const off = s.quiz_count === 0;
          return (
            <button
              key={s.subject_id}
              type="button"
              disabled={off}
              onClick={() => void openSubject(s)}
              className={`rounded-2xl border bg-white/5 px-3 py-4 text-center backdrop-blur-lg transition ${off ? "cursor-default border-white/10 opacity-40 grayscale" : "border-indigo-400/40 hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(99,102,241,0.25)]"}`}
            >
              <span className="mb-2 block text-3xl">{subjectEmoji(s.slug)}</span>
              <span className="block text-[13px] font-bold">{s.name}</span>
              <span
                className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${off ? "bg-white/10 text-zetis-muted" : "bg-indigo-500/20 text-indigo-200"}`}
              >
                {off ? "bientôt" : `${s.quiz_count} quiz`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
