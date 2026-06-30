import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import {
  type DiagnosticResultSummary,
  type Subject,
  fetchResults,
  fetchSubjects,
  generateDiagnostic,
} from "../lib/diagnostic";

// Diagnostics Papa (Étape 14) — lancer un diagnostic IA par matière + lire les
// résultats (score par notion, lacunes). Papa pilote, Massimo passe le diagnostic.

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-300";
  if (score >= 40) return "bg-amber-500/15 text-amber-300";
  return "bg-rose-500/15 text-rose-300";
}

export function DiagnosticsPapaPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [results, setResults] = useState<DiagnosticResultSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadResults() {
    fetchResults()
      .then(setResults)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement impossible"));
  }

  useEffect(() => {
    fetchSubjects()
      .then((list) => {
        setSubjects(list);
        if (list.length > 0) setSubjectId(list[0].id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement impossible"));
    loadResults();
  }, []);

  async function onGenerate() {
    if (subjectId == null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await generateDiagnostic(subjectId);
      setNotice(
        `Diagnostic « ${res.subject} » prêt (${res.questions_count} questions) — Massimo peut le passer.`,
      );
      loadResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Diagnostics"
        subtitle="Lance un diagnostic IA et suis le niveau par notion."
        actions={
          <div className="flex items-center gap-2">
            <select
              value={subjectId ?? ""}
              onChange={(e) => setSubjectId(Number(e.target.value))}
              className="rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onGenerate}
              disabled={busy || subjectId == null}
              className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg disabled:opacity-50"
            >
              {busy ? "Génération…" : "Lancer un diagnostic"}
            </button>
          </div>
        }
      />

      {notice && (
        <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{notice}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {results.length === 0 ? (
        <p className="text-sm text-papa-muted">
          Aucun diagnostic passé pour l'instant. Lance-en un : Massimo le verra dans son espace.
        </p>
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.attempt_id} className="rounded-xl border border-papa-border bg-papa-surface p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{r.subject}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreColor(r.score_percent)}`}>
                  {r.score_percent}%
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                {r.per_skill.map((s) => (
                  <div key={`${r.attempt_id}-${s.skill_id}`} className="flex items-center gap-2 text-sm">
                    <span className="w-48 shrink-0 truncate text-papa-muted">{s.skill_name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-papa-bg">
                      <div
                        className={`h-full ${s.score >= 70 ? "bg-emerald-400" : s.score >= 40 ? "bg-amber-400" : "bg-rose-400"}`}
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs text-papa-muted">{s.score}%</span>
                  </div>
                ))}
              </div>

              {r.gaps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.gaps.map((g) => (
                    <span
                      key={`${r.attempt_id}-gap-${g.skill_id}`}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        g.severity === "high" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      Notion à renforcer : {g.skill_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
