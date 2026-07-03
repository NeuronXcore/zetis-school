import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { type CurriculumLesson } from "@zetis/types";
import { Button } from "@zetis/ui";
import { lessonActions } from "../../lib/chapterActions";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { LessonSourceBadge, LessonStatusBadge } from "./badges";

// Modale « Lire le cours » d'une leçon (Lot 2) : lit `lesson.content` (markdown),
// pilote sa rédaction locale (~40-60 s, qwen3.6 via get_provider — jamais la dérogation
// cloud) et permet de trancher SUR PLACE (Valider/Rejeter, `draft` seul — règle pure).
// Après validation le badge se met à jour et la modale reste ouverte ; un rejet archive
// la leçon → elle sort du flux et la modale se ferme d'elle-même (dérivée de la liste).
// Overlay du patron CapsulesPilotagePage, Échap du patron ConfirmDialog.

// Styles markdown manuels (pas de plugin typography dans le repo).
const MARKDOWN_STYLES =
  "text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-papa-bg [&_code]:px-1";

export function LessonContentModal({
  lesson,
  generating,
  error,
  onGenerate,
  onValidate,
  onReject,
  onClose,
}: {
  lesson: CurriculumLesson;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
  onValidate: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const actions = lessonActions(lesson.created_by, lesson.status);
  // Progression *estimée* : génération LOCALE (qwen3.6), plus lente que le cloud —
  // même calibrage que la génération de capsule (42 s), pas les 22 s de Sonnet.
  const generationPct = useEstimatedProgress(generating, 42000);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cours : ${lesson.title}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-papa-border bg-papa-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span aria-hidden>📖</span>
            <h2 className="min-w-0 font-semibold">{lesson.title}</h2>
            <LessonSourceBadge createdBy={lesson.created_by} />
            <LessonStatusBadge status={lesson.status} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {actions.canValidate && (
              <Button size="sm" onClick={onValidate} disabled={generating}>
                Valider
              </Button>
            )}
            {actions.canReject && (
              <Button size="sm" variant="outline" onClick={onReject} disabled={generating}>
                Rejeter
              </Button>
            )}
            <Button size="sm" variant="ghost" aria-label="Fermer" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {lesson.summary && <p className="mb-3 text-xs text-papa-muted">{lesson.summary}</p>}

        {error && (
          <p className="mb-3 rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        {generating && (
          <div className="mb-3">
            <ProgressBar
              pct={generationPct}
              label="ZETIS rédige le cours (40 à 60 s, moteur local)…"
            />
          </div>
        )}

        {lesson.content === null ? (
          !generating && (
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-sm text-papa-muted">
                Pas encore de cours rédigé pour cette leçon.
              </p>
              <Button onClick={onGenerate}>⚡ Rédiger le cours</Button>
            </div>
          )
        ) : (
          <>
            <div className={MARKDOWN_STYLES}>
              <ReactMarkdown>{lesson.content}</ReactMarkdown>
            </div>
            <div className="mt-4 border-t border-papa-border pt-3">
              <Button size="sm" variant="outline" disabled={generating} onClick={onGenerate}>
                ↻ Régénérer le cours
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
