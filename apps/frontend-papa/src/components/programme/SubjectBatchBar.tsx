import { Button } from "@zetis/ui";
import {
  type CurriculumData,
  type SubjectBatchReport,
} from "../../hooks/useCurriculum";
import { chapterActions } from "../../lib/chapterActions";
import { ProgressBar } from "../ProgressBar";

// Lots au niveau MATIÈRE (boucles séquentielles côté client, cf. useCurriculum).
// Trois états exclusifs : boutons de lancement → progression réelle → rapport de fin.

export function SubjectBatchBar({ data }: { data: CurriculumData }) {
  const batch = data.subjectBatch;
  const report = data.subjectBatchReport;

  if (batch) return <BatchProgress data={data} />;
  if (report) return <BatchReport report={report} onClose={data.clearSubjectBatchReport} />;
  if (data.chapters.length === 0) return null;

  const anyEligible = data.chapters.some(
    (c) => chapterActions(c.source, c.validation_status).canProposeLessons,
  );
  if (!anyEligible) return null;

  const chapterActivity = Object.values(data.lessonsByChapter).some(
    (s) => s.generating || s.batch !== null || s.contentGeneratingId !== null,
  );
  const disabled = data.generating || chapterActivity;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void data.runSubjectLessonsBatch()}
        disabled={disabled}
      >
        ⚡ Proposer les leçons (chapitres sans leçons)
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void data.runSubjectContentsBatch()}
        disabled={disabled}
      >
        ⚡ Rédiger tous les cours manquants
      </Button>
    </div>
  );
}

function BatchProgress({ data }: { data: CurriculumData }) {
  const batch = data.subjectBatch!;
  // Progression RÉELLE (x/N), pas la barre estimée : le lot connaît ses cibles.
  const pct =
    batch.phase === "scan" || batch.total === 0
      ? 0
      : Math.round((batch.done / batch.total) * 100);
  const label =
    batch.phase === "scan"
      ? `Analyse des chapitres de ${batch.subjectName}…`
      : batch.kind === "lessons"
        ? `Proposition des leçons : chapitre ${batch.done + 1}/${batch.total} — « ${batch.currentLabel} » (10 à 30 s/chapitre)`
        : `Rédaction des cours : ${batch.done + 1}/${batch.total} — « ${batch.currentLabel} » (moteur local, 40 à 60 s/cours)`;

  return (
    <div className="flex flex-col gap-1.5">
      <ProgressBar pct={pct} label={label} />
      <div>
        <Button size="sm" variant="ghost" onClick={data.cancelSubjectBatch}>
          Annuler après l'élément en cours
        </Button>
      </div>
    </div>
  );
}

function reportSummary(report: SubjectBatchReport): string {
  const skippedNote =
    report.skipped > 0
      ? ` (${report.skipped} chapitre${report.skipped > 1 ? "s" : ""} sauté${report.skipped > 1 ? "s" : ""} : leçons déjà présentes)`
      : "";
  if (report.total === 0 && !report.aborted) {
    if (report.cancelled) return "Lot annulé pendant l'analyse.";
    return report.kind === "lessons"
      ? `Rien à générer : aucun chapitre éligible sans leçons${skippedNote}.`
      : "Rien à rédiger : aucun cours manquant.";
  }
  const doneText =
    report.kind === "lessons"
      ? `Leçons proposées pour ${report.done} chapitre${report.done > 1 ? "s" : ""}${skippedNote}.`
      : `${report.done} cours rédigé${report.done > 1 ? "s" : ""}.`;
  const cancelledText = report.cancelled
    ? ` Lot annulé après ${report.done}/${report.total}.`
    : "";
  const abortedText = report.aborted
    ? " Arrêt après 3 échecs consécutifs."
    : "";
  return `${doneText}${cancelledText}${abortedText}`;
}

function BatchReport({
  report,
  onClose,
}: {
  report: SubjectBatchReport;
  onClose: () => void;
}) {
  const hasErrors = report.errors.length > 0;
  const tone = hasErrors
    ? "bg-rose-500/15 text-rose-300"
    : "bg-emerald-500/15 text-emerald-300";
  return (
    <div className={`flex flex-col gap-1 rounded-lg px-3 py-2 text-sm ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <p>
          {report.subjectName ? `${report.subjectName} — ` : ""}
          {reportSummary(report)}
        </p>
        <button
          type="button"
          aria-label="Fermer le rapport"
          className="shrink-0 opacity-70 hover:opacity-100"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {hasErrors && (
        <ul className="list-inside list-disc text-xs">
          {report.errors.map((e, i) => (
            <li key={i}>
              {e.label} — {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
