import { useEffect, useState } from "react";
import { type CurriculumChapter, type CurriculumLesson } from "@zetis/types";
import { Button, ConfirmDialog, Spinner } from "@zetis/ui";
import { type CurriculumData } from "../../hooks/useCurriculum";
import { chapterActions, lessonActions } from "../../lib/chapterActions";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { AddLessonForm } from "./AddLessonForm";
import { LessonRow } from "./LessonRow";

// Étage leçons de l'état déplié d'un chapitre (Lot 2 Slice B). Le panneau n'est monté
// que quand la ligne est dépliée : le fetch au montage EST le chargement paresseux
// (cache par chapitre dans useCurriculum — pas de re-fetch au re-dépliage).

export function LessonsPanel({
  chapter,
  data,
}: {
  chapter: CurriculumChapter;
  data: CurriculumData;
}) {
  const state = data.lessonsByChapter[chapter.id];
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<CurriculumLesson | null>(null);
  const generating = state?.generating ?? false;
  // Progression *estimée* (même pattern que la génération de chapitres et les capsules).
  const generationPct = useEstimatedProgress(generating, 22000);
  // « Proposer des leçons » : la même condition que le 409 backend, via la règle pure.
  const { canProposeLessons } = chapterActions(chapter.source, chapter.validation_status);
  const { loadLessons } = data;

  useEffect(() => {
    void loadLessons(chapter.id);
  }, [chapter.id, loadLessons]);

  const visible = (state?.lessons ?? []).filter(
    (l) => lessonActions(l.created_by, l.status).visible,
  );

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-papa-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-papa-muted">
        Leçons
      </p>

      {state?.error && (
        <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-300">
          {state.error}
        </p>
      )}

      {generating && (
        <ProgressBar
          pct={generationPct}
          label="ZETIS propose les leçons du chapitre (10 à 30 s)… Le panneau reste ouvert."
        />
      )}

      {!state || state.loading ? (
        <div className="flex justify-center py-4">
          <Spinner size={20} />
        </div>
      ) : (
        <>
          {visible.length === 0 && !state.error && (
            <p className="text-xs text-papa-muted">
              Aucune leçon pour ce chapitre pour l'instant.
            </p>
          )}
          {visible.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {visible.map((lesson, i) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  isFirst={i === 0}
                  isLast={i === visible.length - 1}
                  disabled={generating}
                  onValidate={() => void data.validateLesson(chapter.id, lesson.id)}
                  onReject={() => void data.rejectLesson(chapter.id, lesson.id)}
                  onEdit={(patch) => data.editLesson(chapter.id, lesson.id, patch)}
                  onDelete={() => setToDelete(lesson)}
                  onMove={(direction) =>
                    void data.moveLesson(chapter.id, lesson.id, direction)
                  }
                />
              ))}
            </ul>
          )}
          {adding && (
            <AddLessonForm
              onCreate={async (payload) => {
                await data.addLesson(chapter.id, payload);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding(true)}
              disabled={adding || generating}
            >
              + Ajouter une leçon
            </Button>
            {canProposeLessons && (
              <Button
                size="sm"
                onClick={() => void data.generateLessons(chapter.id)}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Spinner size={14} /> Génération en cours…
                  </>
                ) : (
                  "⚡ Proposer des leçons"
                )}
              </Button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer la leçon"
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (toDelete) void data.removeLesson(chapter.id, toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      >
        « {toDelete?.title} » sera supprimée. Une leçon validée supprimée ne se régénère
        pas toute seule.
      </ConfirmDialog>
    </div>
  );
}
