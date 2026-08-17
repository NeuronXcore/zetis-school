import { useEffect, useRef, useState } from "react";
import { type MindmapAttemptResult, type MindmapDetail } from "@zetis/types";
import { MindmapWorkspace, type MindmapMode } from "@zetis/ui/mindmap";
import { fetchMindmap, markMindmapSeen, submitMindmapAttempt } from "../../lib/mindmaps";
import { completeStepSafely } from "../../lib/missionSteps";
import { ActivityModal } from "../ActivityModal";
import { InlineHint, StepVerdictFooter, type MissionModalProps, type StepVerdict } from "./shared";

// Modale mindmap d'une mission — Massimo reste sur /missions. La reconstruction s'auto-soumet une
// fois la carte complète (`onComplete`) : on valide alors l'étape. `storageScope="mission"` isole les
// positions localStorage de la route pleine page. Le popup de réussite interne du workspace est
// masqué (onComplete fourni) : c'est le verdict de mission qui récompense.

export function MindmapMissionModal({ mission, step, onStepDone, onClose }: MissionModalProps) {
  const [detail, setDetail] = useState<MindmapDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<MindmapMode>("build");
  const [hint, setHint] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<StepVerdict | null>(null);
  const [done, setDone] = useState(false);
  const skillName = mission.skill_name ?? mission.title;

  useEffect(() => {
    if (step.resource_id == null) {
      setLoadError("Cette carte n'est pas prête — reviens un peu plus tard ✨");
      return;
    }
    let alive = true;
    const id = step.resource_id;
    fetchMindmap(id)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        void markMindmapSeen(id);
      })
      .catch((e) => {
        console.warn("[missions] carte de l'étape", e); // trace devtools (diagnostic)
        if (alive) setLoadError("Cette carte n'a pas voulu s'ouvrir. Réessaie dans un instant ✨");
      });
    return () => {
      alive = false;
    };
  }, [step.resource_id]);

  const completedRef = useRef(false);
  async function handleComplete(_result: MindmapAttemptResult) {
    if (completedRef.current) return;
    completedRef.current = true;
    const out = await completeStepSafely(mission.id, step.id);
    if (out.ok) {
      setDone(true);
      if (out.result.mission_status === "completed" && out.result.verdict) {
        setVerdict({ verdict: out.result.verdict, xp: out.result.xp_awarded });
      }
      onStepDone(out.result);
    } else {
      setHint(out.hint);
    }
  }

  return (
    <ActivityModal
      open
      onRequestClose={onClose}
      // « Mindmap », jamais « Carte mentale » (ADR-0052 §5).
      title={`Mindmap — ${skillName}`}
      subtitle="Reconstruis la carte de mémoire 🗺"
      size="wide"
      dirty={!done}
      confirmClose={{
        title: "Fermer la carte ?",
        body: "Pas de souci — tu pourras la reprendre plus tard.",
        confirmLabel: "Fermer",
        cancelLabel: "Continuer",
      }}
    >
      {hint && <InlineHint text={hint} onDismiss={() => setHint(null)} />}
      {loadError ? (
        <p className="text-sm text-amber-200">{loadError}</p>
      ) : detail == null ? (
        <p className="text-zetis-muted">Préparation de la carte…</p>
      ) : (
        <MindmapWorkspace
          mm={detail.mindmap_json}
          mindmapId={detail.id}
          // Évaluateur ÉLÈVE : persiste la tentative et crédite l'XP (serveur).
          evaluator={(placements, failed) => submitMindmapAttempt(detail.id, placements, failed)}
          mode={mode}
          onModeChange={setMode}
          storageScope="mission"
          onComplete={handleComplete}
        />
      )}
      {done && <StepVerdictFooter verdict={verdict} onClose={onClose} />}
    </ActivityModal>
  );
}
