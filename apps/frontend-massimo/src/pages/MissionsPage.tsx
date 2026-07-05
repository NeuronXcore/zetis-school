import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent, EmptyState } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import {
  type Mission,
  completeStep,
  fetchTodayMissions,
  startMission,
} from "../lib/missions";

// Icône par type d'étape (le runner reste minimal : liste + valider). L'étape mindmap ajoute en
// plus un CTA « Reconstruire → » qui deep-linke vers le mode Reconstruire de la bonne carte.
const STEP_ICON: Record<string, string> = {
  lesson: "📘",
  eli5: "💡",
  vocal_explain: "🎙",
  quiz: "❓",
  mindmap: "🧠",
};

// Page Missions Massimo (ADR-0017 lot 1) — version minimale du flux à preuves : démarrer une
// mission, puis valider ses étapes dans l'ordre. Le serveur vérifie la preuve de chaque étape
// (409 message parlant si l'activité n'a pas été faite) et rend un verdict à la dernière étape.
// La refonte visuelle complète (parcours guidé) est une slice frontend séparée.
export function MissionsPage() {
  const navigate = useNavigate();
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

  async function onStart(mission: Mission) {
    setBusyId(mission.id);
    setError(null);
    try {
      await startMission(mission.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  async function onCompleteStep(mission: Mission, stepId: number) {
    setBusyId(mission.id);
    setError(null);
    try {
      const res = await completeStep(mission.id, stepId);
      if (res.mission_status === "completed") {
        // Deux issues, toutes deux positives (ADR-0017 §5bis).
        const tail =
          res.verdict === "acquired"
            ? "la notion est bien en place ✓"
            : "on la reverra bientôt, tranquille.";
        setCelebration(`Mission terminée ! +${res.xp_awarded} XP — ${tail}`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  // Prochaine étape à valider = première non terminée (les étapes se complètent dans l'ordre).
  function nextStepId(mission: Mission): number | null {
    const next = [...mission.steps]
      .sort((a, b) => a.sort_order - b.sort_order)
      .find((s) => s.status !== "done");
    return next ? next.id : null;
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
        <EmptyState
          icon="💪"
          title="Aucune mission pour l'instant"
          description="Fais un diagnostic et ZETIS te préparera des missions sur mesure."
        />
      ) : (
        <div className="space-y-3">
          {missions.map((mission) => {
            const next = nextStepId(mission);
            return (
              <Card key={mission.id}>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-zetis-accent-2">{mission.title}</p>
                    <span className="rounded-full bg-zetis-surface-2 px-2.5 py-0.5 text-xs text-zetis-muted">
                      {mission.subject}
                    </span>
                  </div>
                  <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-zetis-muted">
                    {mission.steps.map((step) => {
                      // CTA « Reconstruire → » : uniquement sur l'étape mindmap COURANTE d'une
                      // mission active (la preuve doit être postérieure au start).
                      const showRebuild =
                        step.step_type === "mindmap" &&
                        step.status !== "done" &&
                        step.id === next &&
                        mission.status === "active" &&
                        step.resource_id != null;
                      return (
                        <li key={step.id} className={step.status === "done" ? "line-through" : ""}>
                          {STEP_ICON[step.step_type] ?? "•"} {step.instruction}
                          {showRebuild && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/mindmaps/reconstruire/${step.resource_id}`)
                              }
                              className="ml-2 rounded-md bg-zetis-surface-2 px-2 py-0.5 text-xs font-semibold text-zetis-accent-2 hover:opacity-80"
                            >
                              Reconstruire →
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {mission.status === "planned" ? (
                    <Button
                      className="mt-4"
                      onClick={() => onStart(mission)}
                      disabled={busyId === mission.id}
                    >
                      {busyId === mission.id ? "…" : "Commencer 🚀"}
                    </Button>
                  ) : (
                    next !== null && (
                      <Button
                        className="mt-4"
                        onClick={() => onCompleteStep(mission, next)}
                        disabled={busyId === mission.id}
                      >
                        {busyId === mission.id ? "…" : "Valider cette étape ✅"}
                      </Button>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
