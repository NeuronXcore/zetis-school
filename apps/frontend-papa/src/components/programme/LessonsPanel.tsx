import { useEffect, useState } from "react";
import { type CurriculumChapter, type CurriculumLesson } from "@zetis/types";
import { Button, ConfirmDialog, Spinner } from "@zetis/ui";
import { type CurriculumData } from "../../hooks/useCurriculum";
import { chapterActions, lessonActions } from "../../lib/chapterActions";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { AddLessonForm } from "./AddLessonForm";
import { LessonContentModal } from "./LessonContentModal";
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
  // Modale « Lire le cours » : id seulement — la leçon est DÉRIVÉE de la liste, donc
  // la modale se met à jour toute seule quand la rédaction remplace la leçon en cache.
  const [readingId, setReadingId] = useState<number | null>(null);
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
  const reading = visible.find((l) => l.id === readingId) ?? null;
  // Lot « cours manquants » : leçons validées sans cours (le lot ne touche pas les drafts).
  const batch = state?.batch ?? null;
  const missingCount = visible.filter(
    (l) => l.status === "validated" && l.content === null,
  ).length;
  // Verrou croisé : un lot MATIÈRE en cours désactive aussi les actions du panneau.
  const busy = generating || batch !== null || data.subjectBatch !== null;

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

      {batch && (
        <div className="flex flex-col gap-1.5">
          <ProgressBar
            pct={Math.round((batch.done / batch.total) * 100)}
            label={`Rédaction des cours : ${batch.done}/${batch.total} — « ${batch.currentTitle} »… (moteur local)`}
          />
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => data.cancelMissingContents(chapter.id)}
            >
              Annuler après la leçon en cours
            </Button>
          </div>
        </div>
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
                  disabled={busy}
                  onValidate={() => void data.validateLesson(chapter.id, lesson.id)}
                  onReject={() => void data.rejectLesson(chapter.id, lesson.id)}
                  onEdit={(patch) => data.editLesson(chapter.id, lesson.id, patch)}
                  onDelete={() => setToDelete(lesson)}
                  onMove={(direction) =>
                    void data.moveLesson(chapter.id, lesson.id, direction)
                  }
                  onRead={() => setReadingId(lesson.id)}
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
              disabled={adding || busy}
            >
              + Ajouter une leçon
            </Button>
            {canProposeLessons && (
              <Button
                size="sm"
                onClick={() => void data.generateLessons(chapter.id)}
                disabled={busy}
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
            {/* Extension : ZETIS AJOUTE des leçons à la liste (l'existant est injecté
                dans le prompt, doublons écartés) — ≠ Proposer, qui remplace les
                brouillons. N'a de sens que s'il y a déjà des leçons. */}
            {canProposeLessons && visible.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void data.extendLessons(chapter.id)}
                disabled={busy}
              >
                ➕ Ajouter des leçons (ZETIS)
              </Button>
            )}
            {missingCount > 0 && !batch && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void data.generateMissingContents(chapter.id)}
                disabled={busy}
              >
                ⚡ Rédiger les cours manquants ({missingCount})
              </Button>
            )}
          </div>
        </>
      )}

      {reading && (
        <LessonContentModal
          lesson={reading}
          generating={state?.contentGeneratingId === reading.id}
          error={state?.contentError ?? null}
          onGenerate={() => void data.generateContent(chapter.id, reading.id)}
          onSaveContent={(markdown) => data.saveContent(chapter.id, reading.id, markdown)}
          onValidate={() => void data.validateLesson(chapter.id, reading.id)}
          onReject={() => void data.rejectLesson(chapter.id, reading.id)}
          onClose={() => setReadingId(null)}
        />
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
