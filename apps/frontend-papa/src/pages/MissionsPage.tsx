import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { type Mission, fetchMissions, generateRemediation } from "../lib/missions";

// Missions Papa (Étape 15) — génère la remédiation depuis les lacunes et suit l'état.
const STATUS_CLASS: Record<string, string> = {
  planned: "bg-papa-surface-2 text-papa-muted",
  active: "bg-sky-500/15 text-sky-300",
  completed: "bg-emerald-500/15 text-emerald-300",
};

const STATUS_LABEL: Record<string, string> = {
  planned: "à venir",
  active: "en cours",
  completed: "terminée",
};

function priorityLabel(priority: number): string {
  if (priority >= 2) return "priorité haute";
  if (priority === 1) return "priorité moyenne";
  return "priorité basse";
}

export function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetchMissions()
      .then(setMissions)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement impossible"));
  }
  useEffect(load, []);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await generateRemediation();
      setNotice(
        res.created > 0
          ? `${res.created} mission${res.created > 1 ? "s" : ""} de remédiation créée${res.created > 1 ? "s" : ""}.`
          : "Aucune nouvelle lacune à couvrir — tout est déjà pris en charge.",
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Missions"
        subtitle="Missions proposées à Massimo et leur état."
        actions={
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg disabled:opacity-50"
          >
            {busy ? "Génération…" : "Générer la remédiation"}
          </button>
        }
      />

      {notice && (
        <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{notice}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {missions.length === 0 ? (
        <p className="text-sm text-papa-muted">
          Aucune mission. Lance un diagnostic puis génère la remédiation depuis les lacunes.
        </p>
      ) : (
        <div className="space-y-3">
          {missions.map((mission) => (
            <div key={mission.id} className="rounded-xl border border-papa-border bg-papa-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{mission.title}</p>
                  <p className="text-xs text-papa-muted">
                    {mission.subject} · {priorityLabel(mission.priority)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[mission.status] ?? STATUS_CLASS.planned}`}
                >
                  {STATUS_LABEL[mission.status] ?? mission.status}
                </span>
              </div>
              {mission.steps.length > 0 && (
                <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-papa-muted">
                  {mission.steps.map((step) => (
                    <li key={step.id} className={step.status === "done" ? "line-through opacity-60" : ""}>
                      {step.instruction}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
