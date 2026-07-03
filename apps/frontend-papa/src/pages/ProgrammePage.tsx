import { useState } from "react";
import { type CurriculumChapter } from "@zetis/types";
import { Button, ConfirmDialog, EmptyState, Spinner } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { ProgressBar, useEstimatedProgress } from "../components/ProgressBar";
import { AddChapterForm } from "../components/programme/AddChapterForm";
import { ChapterRow } from "../components/programme/ChapterRow";
import { LessonsPanel } from "../components/programme/LessonsPanel";
import { SubjectBatchBar } from "../components/programme/SubjectBatchBar";
import { SubjectPills } from "../components/programme/SubjectPills";
import {
  ValidateAllDialog,
  type ValidateScope,
} from "../components/programme/ValidateAllDialog";
import { useCurriculum } from "../hooks/useCurriculum";
import { cycleForLevel } from "../lib/yearDisplay";

// Page Programme (Papa, Slice B — ADR-0009 §9) : éditeur du référentiel de l'année
// active. Aucune logique métier ici (cf. useCurriculum + chapterActions).

export function ProgrammePage() {
  const data = useCurriculum();
  const [adding, setAdding] = useState(false);
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Progression *estimée* (même pattern que les capsules) : l'appel de génération est
  // synchrone et opaque (~18-20 s mesurés), la barre monte vers 95 % puis se complète.
  const generationPct = useEstimatedProgress(data.generating, 22000);

  const cycle = data.year ? cycleForLevel(data.year.level) : undefined;
  // Version déclarative du programme, portée par les chapitres générés (ADR-0009 §5).
  const programVersion = data.chapters.find((c) => c.program_version)?.program_version;
  const pendingCount = data.chapters.filter((c) => c.validation_status === "pending").length;
  const selectedSubject = data.year?.subjects.find((s) => s.id === data.selectedSysId);

  async function onValidateAll(scope: ValidateScope) {
    setValidating(true);
    setNotice(null);
    const count = await data.validateAll(scope);
    setValidating(false);
    setValidateDialogOpen(false);
    if (count !== null) {
      setNotice(
        count > 0
          ? `${count} chapitre${count > 1 ? "s" : ""} validé${count > 1 ? "s" : ""}${scope === "year" ? " sur l'année" : ""}.`
          : "Aucun chapitre en attente à valider.",
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={
          data.year
            ? `Programme · ${cycle ? `${cycle} — ` : ""}${data.year.level}`
            : "Programme"
        }
        subtitle={`${programVersion ? `Version ${programVersion} · ` : ""}référentiel co-construit`}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => void data.generate()}
              disabled={
                data.generating || data.subjectBatch !== null || data.selectedSysId === null
              }
            >
              {data.generating ? (
                <>
                  <Spinner size={16} /> Génération en cours…
                </>
              ) : (
                "⚡ Générer"
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAdding(true)}
              disabled={
                adding || data.subjectBatch !== null || data.selectedSysId === null
              }
            >
              + Ajouter
            </Button>
            <Button
              variant="outline"
              onClick={() => setValidateDialogOpen(true)}
              disabled={
                data.generating || data.subjectBatch !== null || pendingCount === 0
              }
            >
              ✓ Tout valider
            </Button>
          </div>
        }
      />

      <ValidateAllDialog
        open={validateDialogOpen}
        subjectName={selectedSubject?.subject_name ?? ""}
        pendingCount={pendingCount}
        busy={validating}
        onConfirm={(scope) => void onValidateAll(scope)}
        onCancel={() => setValidateDialogOpen(false)}
      />

      {notice && (
        <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {data.generating && (
        <div className="mb-4">
          <ProgressBar
            pct={generationPct}
            label="ZETIS génère les chapitres de la matière (10 à 30 s)… La liste reste affichée."
          />
        </div>
      )}
      {data.actionError && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
          {data.actionError}
        </p>
      )}

      {data.loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : data.error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-rose-300">{data.error}</p>
          <Button variant="outline" onClick={data.retry}>
            Réessayer
          </Button>
        </div>
      ) : data.year ? (
        <div className="flex flex-col gap-4">
          <SubjectPills
            subjects={data.year.subjects}
            selectedSysId={data.selectedSysId}
            onSelect={data.select}
          />
          <SubjectBatchBar data={data} />
          {adding && (
            <AddChapterForm
              chapters={data.chapters}
              onCreate={async (chapter, position) => {
                await data.addChapter(chapter, position);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          <ChapterList data={data} adding={adding} onAdd={() => setAdding(true)} />
          <p className="text-xs text-papa-muted">
            ⓘ La régénération ne touche jamais les chapitres manuels ni validés. Chaque
            génération est tracée (cahier de bord IA).
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ChapterList({
  data,
  adding,
  onAdd,
}: {
  data: ReturnType<typeof useCurriculum>;
  adding: boolean;
  onAdd: () => void;
}) {
  // Confirmation avant suppression : un chapitre validé supprimé ne se régénère pas seul.
  const [toDelete, setToDelete] = useState<CurriculumChapter | null>(null);

  if (data.chaptersLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={24} />
      </div>
    );
  }
  if (data.chapters.length === 0) {
    return (
      <EmptyState
        icon="📖"
        title="Aucun chapitre pour cette matière"
        description="Génère une proposition de programme avec ZETIS, ou ajoute un chapitre à la main."
        action={
          <div className="flex gap-2">
            <Button
              onClick={() => void data.generate()}
              disabled={data.generating || data.subjectBatch !== null}
            >
              ⚡ Générer
            </Button>
            <Button
              variant="secondary"
              onClick={onAdd}
              disabled={adding || data.subjectBatch !== null}
            >
              + Ajouter
            </Button>
          </div>
        }
      />
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {data.chapters.map((chapter, i) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            isFirst={i === 0}
            isLast={i === data.chapters.length - 1}
            disabled={data.generating || data.subjectBatch !== null}
            onValidate={() => void data.validate(chapter.id)}
            onReject={() => void data.reject(chapter.id)}
            onRegenerate={() => void data.generate()}
            onEdit={(patch) => data.editChapter(chapter.id, patch)}
            onDelete={() => setToDelete(chapter)}
            onMove={(direction) => void data.move(chapter.id, direction)}
            lessonsSlot={<LessonsPanel chapter={chapter} data={data} />}
          />
        ))}
      </ul>
      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer le chapitre"
        confirmLabel="Supprimer"
        tone="danger"
        onConfirm={() => {
          if (toDelete) void data.removeChapter(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      >
        « {toDelete?.name} » sera supprimé. Un chapitre validé supprimé ne se régénère
        pas tout seul.
      </ConfirmDialog>
    </>
  );
}
