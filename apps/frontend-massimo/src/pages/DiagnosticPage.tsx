import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import {
  type DiagnosticListItem,
  type DiagnosticQuiz,
  type DiagnosticResult,
  fetchDiagnostics,
  fetchDiagnosticQuiz,
  submitDiagnostic,
} from "../lib/diagnostic";

// Page Diagnostic Massimo (Étape 14) — branchée sur le moteur de diagnostic IA.
// Flux : liste des diagnostics → QCM → résultat bienveillant (forces + prochaines étapes).
export function DiagnosticPage() {
  const [list, setList] = useState<DiagnosticListItem[]>([]);
  const [quiz, setQuiz] = useState<DiagnosticQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadList() {
    fetchDiagnostics()
      .then(setList)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur de chargement"));
  }
  useEffect(loadList, []);

  async function startQuiz(quizId: number) {
    setBusy(true);
    setError(null);
    try {
      const q = await fetchDiagnosticQuiz(quizId);
      setQuiz(q);
      setAnswers({});
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (quiz == null) return;
    setBusy(true);
    setError(null);
    try {
      const payload = quiz.questions.map((q) => ({
        question_id: q.id,
        choice_index: answers[q.id] ?? -1,
      }));
      setResult(await submitDiagnostic(quiz.quiz_id, payload));
      setQuiz(null);
      loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  // 1) Résultat bienveillant
  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="C'est noté ✨" subtitle={`Voici ce que ZETIS retient (${result.subject}).`} />
        <p className="mb-4 text-sm text-zetis-muted">
          Score global : <span className="font-semibold text-zetis-accent-2">{result.score_percent}%</span>{" "}
          — pas de note brute, juste de quoi savoir quoi renforcer.
        </p>
        {result.strengths.length > 0 && (
          <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
            <p className="font-semibold text-emerald-300">Tes forces</p>
            <ul className="mt-2 list-inside list-disc text-sm text-zetis-muted">
              {result.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {result.gaps.length > 0 && (
          <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
            <p className="font-semibold text-zetis-accent-2">Tes prochaines étapes</p>
            <ul className="mt-2 space-y-2">
              {result.gaps.map((g) => (
                <li
                  key={`${g.skill_id}-${g.skill_name}`}
                  className="flex items-center justify-between rounded-lg bg-zetis-surface-2 px-3 py-2 text-sm"
                >
                  <span>Notion à renforcer : {g.skill_name}</span>
                  <span className="text-zetis-accent-2">→</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-4 text-sm text-zetis-muted hover:text-zetis-text"
        >
          ← Retour aux diagnostics
        </button>
      </div>
    );
  }

  // 2) Passation du QCM
  if (quiz) {
    const allAnswered = quiz.questions.every((q) => answers[q.id] != null);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={quiz.title} subtitle="Réponds tranquillement, il n'y a pas de piège." />
        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
        <div className="space-y-4">
          {quiz.questions.map((q, idx) => (
            <section key={q.id} className="rounded-2xl border border-zetis-border bg-zetis-surface p-4">
              <p className="text-sm font-medium">
                {idx + 1}. {q.prompt}
              </p>
              <div className="mt-3 space-y-2">
                {q.choices.map((choice, ci) => (
                  <label
                    key={ci}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      answers[q.id] === ci
                        ? "border-zetis-accent bg-zetis-accent/10"
                        : "border-zetis-border hover:bg-zetis-surface-2"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[q.id] === ci}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}
                      className="accent-zetis-accent"
                    />
                    {choice}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !allAnswered}
          className="mt-5 rounded-xl bg-zetis-accent px-6 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "…" : "Envoyer mes réponses"}
        </button>
        <button
          type="button"
          onClick={() => setQuiz(null)}
          className="mt-3 block text-sm text-zetis-muted hover:text-zetis-text"
        >
          ← Annuler
        </button>
      </div>
    );
  }

  // 3) Liste des diagnostics disponibles
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Diagnostic ZETIS"
        subtitle="ZETIS vérifie ce qu'il faut renforcer pour t'aider plus vite."
      />
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {list.length === 0 ? (
        <p className="text-sm text-zetis-muted">
          Aucun diagnostic pour l'instant — Papa peut en préparer un depuis son espace.
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <button
              key={d.quiz_id}
              type="button"
              onClick={() => startQuiz(d.quiz_id)}
              disabled={busy}
              className="flex w-full items-center justify-between rounded-2xl border border-zetis-border bg-zetis-surface p-4 text-left transition-colors hover:bg-zetis-surface-2 disabled:opacity-60"
            >
              <div>
                <p className="font-semibold">{d.title}</p>
                <p className="mt-0.5 text-xs text-zetis-muted">
                  {d.questions_count} question{d.questions_count > 1 ? "s" : ""} · {d.subject}
                </p>
              </div>
              <span className="text-sm text-zetis-accent-2">
                {d.taken_at ? "Refaire ↻" : "Commencer →"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
