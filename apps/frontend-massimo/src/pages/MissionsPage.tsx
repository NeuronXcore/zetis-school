import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { type Mission, completeMission, fetchTodayMissions } from "../lib/missions";

// Page Missions Massimo (Étape 15) — missions du jour issues de la remédiation.
// Terminer une mission résout la lacune liée et crédite de l'XP.
export function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetchTodayMissions()
      .then(setMissions)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur de chargement"));
  }
  useEffect(load, []);

  async function onComplete(mission: Mission) {
    setBusyId(mission.id);
    setError(null);
    try {
      const res = await completeMission(mission.id);
      setCelebration(`Bravo ! Mission terminée 🎉 +${res.xp_awarded} XP`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Mes missions"
        subtitle="De petites missions pour renforcer tes notions, une étape à la fois."
      />

      {celebration && (
        <p className="mb-4 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-300">
          {celebration}
        </p>
      )}
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

      {missions.length === 0 ? (
        <p className="text-sm text-zetis-muted">
          Aucune mission pour l'instant — fais un diagnostic et ZETIS te préparera des missions. 💪
        </p>
      ) : (
        <div className="space-y-3">
          {missions.map((mission) => (
            <section key={mission.id} className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-zetis-accent-2">{mission.title}</p>
                <span className="rounded-full bg-zetis-surface-2 px-2.5 py-0.5 text-xs text-zetis-muted">
                  {mission.subject}
                </span>
              </div>
              <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-zetis-muted">
                {mission.steps.map((step) => (
                  <li key={step.id}>{step.instruction}</li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => onComplete(mission)}
                disabled={busyId === mission.id}
                className="mt-4 rounded-xl bg-zetis-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busyId === mission.id ? "…" : "J'ai terminé ✅"}
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
