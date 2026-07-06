import { useEffect, useRef, useState } from "react";
import { useEli5 } from "../../hooks/useEli5";
import { completeStepSafely } from "../../lib/missionSteps";
import { ActivityModal } from "../ActivityModal";
import { Eli5Session } from "../eli5/Eli5Session";
import { InlineHint, StepVerdictFooter, type MissionModalProps, type StepVerdict, bySortOrder } from "./shared";

// Modale ELI5 d'une mission — Massimo reste sur /missions. UNE session couvre les DEUX étapes
// ELI5 du parcours : « Découvrir » (eli5, preuve = consultation → validée dès l'affichage de
// l'explication) puis « Verbaliser » (vocal_explain, preuve = réexplication évaluée → validée sur
// le retour de ZETIS). Les deux se valident DANS l'ordre serveur ; on n'essaie jamais « Verbaliser »
// avant que « Découvrir » soit validé (stop au 1er refus). Fermer après lecture est sûr (eli5 déjà
// ✓, vocal reste à faire, la réouverture reprend). `useEli5` vit ici → son démontage libère le micro.

export function Eli5MissionModal({ mission, step, onStepDone, onClose }: MissionModalProps) {
  const eli5 = useEli5();
  const [hint, setHint] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<StepVerdict | null>(null);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const inflight = useRef<Set<number>>(new Set());

  const skillName = mission.skill_name ?? mission.title;
  const ordered = [...mission.steps].sort(bySortOrder);
  const eliStep = ordered.find((s) => s.step_type === "eli5" && s.status !== "done");
  const vocalStep = ordered.find((s) => s.step_type === "vocal_explain" && s.status !== "done");

  // Démarre la session ELI5 une fois, sur la notion de la mission.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const skillId = step.resource_id ?? mission.skill_id;
    if (skillId == null) {
      setHint("Cette étape n'est pas encore prête — reviens un peu plus tard ✨");
      return;
    }
    eli5.submitChip({ key: `mission-${skillId}`, kind: "lesson", emoji: "📖", name: skillName, note: "", skillId });
  }, [eli5, step, mission, skillName]);

  async function tryComplete(stepId: number) {
    if (inflight.current.has(stepId) || completedIds.includes(stepId)) return;
    inflight.current.add(stepId);
    const out = await completeStepSafely(mission.id, stepId);
    inflight.current.delete(stepId);
    if (out.ok) {
      setCompletedIds((ids) => (ids.includes(stepId) ? ids : [...ids, stepId]));
      if (out.result.mission_status === "completed" && out.result.verdict) {
        setVerdict({ verdict: out.result.verdict, xp: out.result.xp_awarded });
      }
      onStepDone(out.result);
    } else {
      setHint(out.hint);
    }
  }

  const eliDone = !eliStep || completedIds.includes(eliStep.id);
  const vocalDone = !vocalStep || completedIds.includes(vocalStep.id);
  const allDone = eliDone && vocalDone;

  // « Découvrir » : preuve = consultation → validée dès que l'explication est à l'écran.
  useEffect(() => {
    if (!eliStep || eliDone) return;
    if (eli5.status === "explained" || eli5.status === "evaluating" || eli5.status === "feedback") {
      void tryComplete(eliStep.id);
    }
  }, [eli5.status, eliStep, eliDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // « Verbaliser » : preuve = réexplication évaluée, APRÈS que « Découvrir » soit validé (ordre serveur).
  useEffect(() => {
    if (!vocalStep || vocalDone || !eliDone) return;
    if (eli5.status === "feedback" && eli5.reverse) {
      void tryComplete(vocalStep.id);
    }
  }, [eli5.status, eli5.reverse, vocalStep, vocalDone, eliDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // « En cours » = explication ouverte mais tout n'est pas validé → confirmer avant de fermer.
  const dirty = !allDone && eli5.status !== "idle" && eli5.status !== "generating";

  return (
    <ActivityModal
      open
      onRequestClose={onClose}
      title={`Mission — ${skillName}`}
      subtitle="Lis l'explication, puis réexplique-la à ZETIS"
      size="activity"
      dirty={dirty}
      confirmClose={{
        title: "Fermer l'explication ?",
        body: "Pas de souci — tu pourras la reprendre plus tard.",
        confirmLabel: "Fermer",
        cancelLabel: "Continuer",
      }}
    >
      {hint && <InlineHint text={hint} onDismiss={() => setHint(null)} />}
      <Eli5Session eli5={eli5} headerless />
      {allDone && <StepVerdictFooter verdict={verdict} onClose={onClose} />}
    </ActivityModal>
  );
}
