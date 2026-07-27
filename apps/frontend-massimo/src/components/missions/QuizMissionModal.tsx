import { useEffect, useRef, useState } from "react";
import { type StudentQuiz } from "@zetis/types";
import { fetchQuizById } from "../../lib/quiz";
import { completeStepSafely } from "../../lib/missionSteps";
import { useQuizSession } from "../../hooks/useQuizSession";
import { ActivityModal } from "../ActivityModal";
import { QuizRunner } from "../quiz/QuizRunner";
import { InlineHint, StepVerdictFooter, type MissionModalProps, type StepVerdict } from "./shared";

// Modale quiz d'une mission — Massimo reste sur /missions. Le quiz de mission a `quiz_type="mission"`,
// donc l'attempt lancé par le runner porte `context="mission"` automatiquement : au résumé, la preuve
// existe et on valide l'étape. La récompense de fin de mission est le verdict (pas le résumé du quiz).

export function QuizMissionModal({ mission, step, onStepDone, onClose }: MissionModalProps) {
  const [quiz, setQuiz] = useState<StudentQuiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<StepVerdict | null>(null);
  const [done, setDone] = useState(false);
  const skillName = mission.skill_name ?? mission.title;

  useEffect(() => {
    if (step.resource_id == null) {
      setLoadError("Ce quiz n'est pas prêt — reviens un peu plus tard ✨");
      return;
    }
    let alive = true;
    fetchQuizById(step.resource_id)
      .then((q) => alive && setQuiz(q))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : "Quiz indisponible"));
    return () => {
      alive = false;
    };
  }, [step.resource_id]);

  const session = useQuizSession(quiz);

  // Fin du quiz (résumé) → l'attempt mission est terminé : on valide l'étape.
  const completedRef = useRef(false);
  useEffect(() => {
    if (completedRef.current || session.status !== "summary") return;
    completedRef.current = true;
    void (async () => {
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
    })();
  }, [session.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = session.status === "answering" || session.status === "feedback";

  return (
    <ActivityModal
      open
      onRequestClose={onClose}
      title={`Mini-quiz — ${skillName}`}
      subtitle="Quelques questions pour vérifier ❓"
      size="activity"
      dirty={dirty}
      confirmClose={{
        title: "Quitter le quiz ?",
        body: "Tu pourras le refaire tranquillement.",
        confirmLabel: "Quitter",
        cancelLabel: "Continuer",
      }}
    >
      {hint && <InlineHint text={hint} onDismiss={() => setHint(null)} />}
      {loadError ? (
        <p className="text-sm text-amber-200">{loadError}</p>
      ) : quiz == null ? (
        <p className="text-zetis-muted">Préparation de ton quiz…</p>
      ) : (
        <QuizRunner session={session} label={`${mission.subject} · ${skillName}`} onExit={onClose} />
      )}
      {done && <StepVerdictFooter verdict={verdict} onClose={onClose} />}
    </ActivityModal>
  );
}
