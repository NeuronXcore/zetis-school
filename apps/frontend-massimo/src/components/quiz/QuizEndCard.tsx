import { type MotivationMessage, type QuizCompleteResult } from "@zetis/types";

// Écran de fin d'un quiz — toujours bienveillant (vocabulaire CLAUDE.md : jamais « échec »).
// XP et score viennent du serveur (`complete`), jamais recalculés côté client.

function celebration(score: number): { emoji: string; title: string } {
  if (score >= 80) return { emoji: "🌟", title: "Beau travail, Massimo !" };
  if (score >= 50) return { emoji: "💪", title: "Bien joué, tu progresses !" };
  return { emoji: "🚀", title: "C'est un bon début !" };
}

export function QuizEndCard({
  result,
  onFinish,
  wrapUp = null,
}: {
  result: QuizCompleteResult;
  onFinish: () => void;
  /** Mot de la fin servi par ZETIS. `null` = non chargé ou en échec : l'écran de fin ne dépend
   *  jamais de lui. */
  wrapUp?: MotivationMessage | null;
}) {
  const { emoji, title } = celebration(result.score_percent);
  // `strengths` est calculé SERVEUR avec le seuil de maîtrise. Ce composant filtrait auparavant
  // lui-même sur `score >= 70` : une règle pédagogique dupliquée dans un composant de
  // présentation, libre de diverger du serveur à la première évolution du seuil.
  const consolidated = result.strengths.length;
  const totalSkills = result.per_skill.length;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
      <div className="mb-2 text-5xl">{emoji}</div>
      <h2 className="text-2xl font-bold">{title}</h2>
      {totalSkills > 0 && (
        <p className="mt-1.5 text-[15px] text-slate-400">
          Tu as consolidé <b className="text-emerald-400">{consolidated} notion{consolidated > 1 ? "s" : ""} sur {totalSkills}</b> de ce cours.
        </p>
      )}

      <div className="my-5 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 py-2 text-base font-extrabold shadow-[0_0_26px_rgba(232,121,249,0.3)]">
        +{result.xp_awarded} XP
      </div>

      <div className="mx-auto mb-5 flex max-w-sm flex-col gap-2 text-left">
        {result.strengths.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            💪 <b>Tes forces :</b> {result.strengths.join(", ")}.
          </div>
        )}
        {result.to_review.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            🔭 <b>À revoir bientôt :</b> {result.to_review.join(", ")} — ZETIS te les
            reproposera dans tes révisions.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onFinish}
        className="rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-400 px-8 py-3.5 text-base font-bold text-white shadow-[0_6px_24px_rgba(99,102,241,0.35)] transition hover:-translate-y-0.5"
      >
        Retour aux quiz
      </button>

      {/* Le mot de la fin de ZETIS, sous l'action principale : il propose le prochain pas sans
          concurrencer le bouton de sortie. */}
      {wrapUp && (
        <p className="mt-4 text-sm text-slate-300">
          {wrapUp.title}
          {wrapUp.subtitle && <span className="text-slate-400"> {wrapUp.subtitle}</span>}
        </p>
      )}
    </div>
  );
}
