// Modale d'action sur une demande de notion HORS-PROGRAMME (addendum ADR-0027).
//
// Une notion hors-programme n'a PAS de matière : Papa la fournit ici.
// - mode « add »   : choisir une matière → la notion devient une `Skill` (le cours suit ailleurs).
// - mode « lesson »: choisir une matière PUIS un chapitre → échafaude la leçon (notion + lien) ;
//   option « rédiger le cours maintenant » (moteur local, ~1 min → la leçon passe en « à valider »).
//
// Réutilise les ponts backend (`add-to-program` / `create-lesson`) et la barre de progression Papa.
import { useCallback, useEffect, useState } from "react";
import { type ActiveSchoolYear, type CurriculumChapter } from "@zetis/types";
import { fetchActiveSchoolYear, fetchChapters } from "../../lib/curriculum";
import {
  addNotionToProgram,
  createLessonFromRequest,
  type NotionRequest,
} from "../../lib/notionRequests";
import { ProgressBar } from "../ProgressBar";
import { useProgressionEstimee } from "../../hooks/useEstimations";

export function NotionRequestActionModal({
  request,
  mode,
  onDone,
  onClose,
}: {
  request: NotionRequest;
  mode: "add" | "lesson";
  /** Porte le verdict SERVEUR (`needs_lesson`) : la page ne le devine pas, elle le reçoit.
   *  `false` en mode « lesson » — une leçon vient précisément d'être créée. */
  onDone: (result?: { needsLesson: boolean; label: string }) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState<ActiveSchoolYear | null>(null);
  const [sysId, setSysId] = useState<number | null>(null); // school_year_subject id sélectionné
  const [chapters, setChapters] = useState<CurriculumChapter[]>([]);
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [generateCourse, setGenerateCourse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = useProgressionEstimee(busy && generateCourse, "lesson_content");

  useEffect(() => {
    fetchActiveSchoolYear()
      .then(setYear)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Année scolaire introuvable"),
      );
  }, []);

  const pickSubject = useCallback(
    async (value: string) => {
      const id = value ? Number(value) : null;
      setSysId(id);
      setChapterId(null);
      setChapters([]);
      if (id && mode === "lesson") {
        try {
          setChapters(await fetchChapters(id));
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Chapitres introuvables");
        }
      }
    },
    [mode],
  );

  const selected = year?.subjects.find((s) => s.id === sysId) ?? null;
  const canSubmit =
    selected !== null && (mode === "add" || chapterId !== null) && !busy;

  const submit = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "add") {
        const out = await addNotionToProgram(request.id, selected.subject_id);
        onDone({ needsLesson: out.needs_lesson, label: request.text });
        return;
      } else {
        if (chapterId === null) return;
        await createLessonFromRequest(request.id, chapterId, generateCourse);
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action échouée");
      setBusy(false);
    }
  }, [selected, mode, request.id, chapterId, generateCourse, onDone]);

  const title =
    mode === "add" ? "Ajouter la notion au programme" : "Créer la leçon";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-[460px] max-w-full rounded-xl border border-papa-border bg-papa-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <h4 className="text-[13px] font-bold">{title}</h4>
        <p className="mb-3 mt-1 text-[12px] text-papa-muted">
          Notion demandée : <b className="text-papa-text">« {request.text} »</b>. Elle n'a pas de
          matière — choisis où l'accueillir.
        </p>

        {/* ⚠️ Dit AVANT le clic, parce que c'est le moment où l'information change la décision :
            « Ajouter » et « Créer la leçon » ne font pas la même chose, et le premier se lit
            « traité » alors qu'il laisse la notion inerte. Après coup, la modale est fermée. */}
        {mode === "add" && (
          <p className="mb-3 rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200">
            La notion entrera au programme, mais{" "}
            <b className="text-papa-text">tant qu'aucune leçon ne la porte, ZETIS ne produira rien
            pour elle</b>. Vous pourrez la rattacher plus tard — ou choisir « Créer la leçon » tout
            de suite.
          </p>
        )}

        {error && (
          <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        )}

        <label className="block text-[12px] font-semibold">Matière</label>
        <select
          className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
          value={sysId ?? ""}
          onChange={(e) => void pickSubject(e.target.value)}
          disabled={busy || !year}
        >
          <option value="">— choisir —</option>
          {(year?.subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.subject_icon ? `${s.subject_icon} ` : ""}
              {s.subject_name}
            </option>
          ))}
        </select>

        {mode === "lesson" && sysId !== null && (
          <>
            <label className="mt-3 block text-[12px] font-semibold">Chapitre</label>
            <select
              className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
              value={chapterId ?? ""}
              onChange={(e) => setChapterId(e.target.value ? Number(e.target.value) : null)}
              disabled={busy || chapters.length === 0}
            >
              <option value="">
                {chapters.length === 0 ? "— aucun chapitre —" : "— choisir —"}
              </option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="mt-3 flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={generateCourse}
                onChange={(e) => setGenerateCourse(e.target.checked)}
                disabled={busy}
              />
              Rédiger le cours maintenant (~1 min ; la leçon passera « à valider »)
            </label>
          </>
        )}

        {busy && generateCourse ? (
          <div className="mt-4">
            <ProgressBar pct={pct} label="Rédaction du cours…" />
          </div>
        ) : (
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-papa-border px-3 py-1.5 text-xs font-semibold text-papa-text hover:bg-papa-surface-2 disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="rounded-lg bg-papa-accent px-3 py-1.5 text-xs font-semibold text-papa-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "…" : mode === "add" ? "Ajouter la notion" : "Créer la leçon"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
