import { PageHeader } from "../components/PageHeader";
import { SUBJECTS_PROGRESS } from "../data/mock";

// Progression Papa (Étape 8) — synthèse par matière (mock).
export function ProgressionPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Progression" subtitle="Avancement de Massimo par matière." />
      <div className="overflow-hidden rounded-xl border border-papa-border">
        <table className="w-full text-sm">
          <thead className="bg-papa-surface-2 text-left text-xs uppercase tracking-wide text-papa-muted">
            <tr>
              <th className="px-4 py-2">Matière</th>
              <th className="px-4 py-2">Progression</th>
              <th className="px-4 py-2 text-right">XP</th>
              <th className="px-4 py-2 text-right">Lacunes</th>
            </tr>
          </thead>
          <tbody>
            {SUBJECTS_PROGRESS.map((s) => (
              <tr key={s.name} className="border-t border-papa-border bg-papa-surface">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-papa-surface-2">
                      <div
                        className="h-full rounded-full bg-papa-accent"
                        style={{ width: `${s.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-papa-muted">{s.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{s.xp}</td>
                <td className="px-4 py-3 text-right">
                  {s.openGaps > 0 ? (
                    <span className="text-papa-warn">{s.openGaps}</span>
                  ) : (
                    <span className="text-papa-muted">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
