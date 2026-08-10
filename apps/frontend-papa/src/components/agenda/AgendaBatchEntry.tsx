import { useState } from "react";
import { type AgendaItemDraft, type AgendaKind, type CurriculumChapter } from "@zetis/types";
import { Button, Input, Select, Spinner } from "@zetis/ui";
import { AGENDA_KINDS, kindLabel } from "../../lib/agendaModel";
import { LabelField, type LessonOption } from "./LabelField";

// Saisie EN LOT — « je relève l'ENT du dimanche soir », pas « j'ajoute un devoir ».
//
// Ce n'est pas un confort : en phase 0, Papa est la SEULE source d'items, donc la qualité de
// l'agenda de Massimo dépend entièrement de cette grille (ADR-0025 §10). Un formulaire
// item-par-item produirait le même abandon qu'une page vide.

export interface SubjectOption {
  /** `subjects.id` — ce que porte `agenda_items.subject_id`. */
  id: number;
  name: string;
  /** `school_year_subject_id` de l'année active : clé des routes chapitres (référentiel). */
  sysId: number | null;
}

interface DraftRow {
  key: number;
  subjectId: string;
  chapterId: string;
  label: string;
  /** Leçon pointée quand l'intitulé vient de la liste (addendum §15). */
  lessonId: number | null;
  dueOn: string;
  kind: AgendaKind;
}

let nextKey = 1;
const emptyRow = (): DraftRow => ({
  key: nextKey++,
  subjectId: "",
  chapterId: "",
  label: "",
  lessonId: null,
  dueOn: "",
  kind: "devoir",
});

interface Props {
  subjects: SubjectOption[];
  /** Chapitres du référentiel par `school_year_subject_id`, chargés à la demande. */
  chaptersBySys: Record<number, CurriculumChapter[]>;
  chaptersLoading: Set<number>;
  onNeedChapters: (sysId: number) => void;
  /** Cours VALIDÉS par `chapter_id`, chargés à la demande (addendum ADR-0025 §13, §15). */
  lessonsByChapter: Record<number, LessonOption[]>;
  lessonsLoading: Set<number>;
  onNeedLessons: (chapterId: number) => void;
  saving: boolean;
  onSubmit: (drafts: AgendaItemDraft[]) => Promise<void>;
}

export function AgendaBatchEntry({
  subjects,
  chaptersBySys,
  chaptersLoading,
  onNeedChapters,
  lessonsByChapter,
  lessonsLoading,
  onNeedLessons,
  saving,
  onSubmit,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);

  const patch = (key: number, change: Partial<DraftRow>) =>
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const chooseSubject = (row: DraftRow, value: string) => {
    // Changer de matière invalide le chapitre déjà choisi : il appartenait à l'autre matière —
    // et donc la leçon pointée aussi.
    // L'intitulé, lui, N'EST PAS effacé — c'est peut-être la seule chose que Papa ait tapée
    // (addendum ADR-0025 §13.4). Sans chapitre, `LabelField` retombe seul en texte libre.
    patch(row.key, { subjectId: value, chapterId: "", lessonId: null });
    const sysId = subjects.find((s) => String(s.id) === value)?.sysId ?? null;
    if (sysId !== null && !chaptersBySys[sysId]) onNeedChapters(sysId);
  };

  const chooseChapter = (row: DraftRow, value: string) => {
    // ⚠️ **La leçon tombe avec le chapitre.** Sans ça, un intitulé choisi dans le chapitre A
    // resterait rattaché à SA leçon après un passage au chapitre B : le serveur refuserait en
    // 422 (§15), et avant lui l'écran aurait menti. Le texte de l'intitulé, lui, survit.
    patch(row.key, { chapterId: value, lessonId: null });
    // Même geste que `chooseSubject` pour les chapitres : le niveau du dessous se charge à la
    // demande, une seule fois par chapitre.
    if (value && !lessonsByChapter[Number(value)]) onNeedLessons(Number(value));
  };

  // Une ligne compte dès qu'elle porte un intitulé ET une date : ce sont les deux seules
  // colonnes obligatoires côté serveur. Matière et chapitre restent facultatifs — bloquer la
  // saisie sur une matière manquante ajouterait de la friction là où elle coûte le plus cher.
  const complete = rows.filter((row) => row.label.trim() !== "" && row.dueOn !== "");

  async function submit() {
    if (complete.length === 0) return;
    await onSubmit(
      complete.map((row) => ({
        label: row.label.trim(),
        due_on: row.dueOn,
        subject_id: row.subjectId ? Number(row.subjectId) : null,
        chapter_id: row.chapterId ? Number(row.chapterId) : null,
        lesson_id: row.lessonId,
        kind: row.kind,
      })),
    );
    setRows([emptyRow(), emptyRow(), emptyRow()]);
  }

  return (
    <section className="rounded-xl border border-papa-border bg-papa-surface p-5">
      <h2 className="font-semibold">Ajouter des échéances</h2>
      <p className="mt-1 text-xs text-papa-muted">
        Une ligne par échéance, tout part en une fois. Seuls l'intitulé et la date sont
        nécessaires ; le chapitre rend l'échéance analysable plus tard, sans rien exiger
        maintenant.
      </p>

      <div className="mt-4 hidden gap-2 px-1 text-xs font-medium uppercase tracking-wide text-papa-muted lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_150px_130px_32px]">
        <div>Matière</div>
        <div>Chapitre</div>
        <div>Intitulé</div>
        <div>Date</div>
        <div>Type</div>
        <div />
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {rows.map((row) => {
          const sysId = subjects.find((s) => String(s.id) === row.subjectId)?.sysId ?? null;
          const chapters = sysId !== null ? (chaptersBySys[sysId] ?? []) : [];
          const loadingChapters = sysId !== null && chaptersLoading.has(sysId);
          const chapterId = row.chapterId ? Number(row.chapterId) : null;
          const lessons = chapterId !== null ? (lessonsByChapter[chapterId] ?? []) : [];
          const loadingLessons = chapterId !== null && lessonsLoading.has(chapterId);
          return (
            <div
              key={row.key}
              className="grid grid-cols-2 gap-2 rounded-lg border border-papa-border/60 p-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_150px_130px_32px] lg:items-center lg:border-0 lg:p-0"
            >
              <Select
                aria-label="Matière"
                value={row.subjectId}
                onChange={(e) => chooseSubject(row, e.target.value)}
              >
                <option value="">— matière —</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Chapitre"
                value={row.chapterId}
                disabled={sysId === null || loadingChapters}
                onChange={(e) => chooseChapter(row, e.target.value)}
              >
                <option value="">
                  {sysId === null
                    ? "— matière d'abord —"
                    : loadingChapters
                      ? "chargement…"
                      : chapters.length === 0
                        ? "— aucun chapitre —"
                        : "— chapitre —"}
                </option>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.name}
                  </option>
                ))}
              </Select>

              {/* ⚠️ Un REPÈRE, pas un exemple (2026-08-10). L'exemple chiffré d'origine a été
                  retiré : depuis le §13 le champ est un MENU dès qu'un chapitre est choisi, et une
                  suggestion de saisie libre y proposait la mauvaise habitude.
                  Mais il ne peut pas rester nu : sous `lg`, les en-têtes de colonnes sont masqués
                  et tous les autres champs gardent un repère (`— matière —`, `jj/mm/aaaa`,
                  `Devoir`). L'intitulé serait la SEULE boîte vide et sans nom de la grille. */}
              <LabelField
                className="col-span-2 lg:col-span-1"
                placeholder="Intitulé"
                value={row.label}
                onChange={(label, lessonId) => patch(row.key, { label, lessonId })}
                lessons={lessons}
                loading={loadingLessons}
              />

              <Input
                aria-label="Date"
                type="date"
                value={row.dueOn}
                onChange={(e) => patch(row.key, { dueOn: e.target.value })}
              />

              <Select
                aria-label="Type"
                value={row.kind}
                onChange={(e) => patch(row.key, { kind: e.target.value as AgendaKind })}
              >
                {AGENDA_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabel(kind)}
                  </option>
                ))}
              </Select>

              <button
                type="button"
                aria-label="Retirer la ligne"
                // Retirer une ligne de SAISIE n'efface rien : elle n'existe pas encore côté
                // serveur. À ne pas confondre avec l'archivage d'un item enregistré.
                onClick={() =>
                  setRows((all) =>
                    all.length > 1 ? all.filter((r) => r.key !== row.key) : [emptyRow()],
                  )
                }
                className="justify-self-end rounded-md px-2 py-1 text-papa-muted transition-colors hover:text-papa-text"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => setRows((all) => [...all, emptyRow()])}>
          + Ajouter une ligne
        </Button>
        <span className="ml-auto text-xs text-papa-muted">
          {complete.length === 0
            ? "aucune ligne complète"
            : `${complete.length} ligne${complete.length > 1 ? "s" : ""} à enregistrer`}
        </span>
        <Button size="sm" disabled={complete.length === 0 || saving} onClick={() => void submit()}>
          {saving ? <Spinner /> : null}
          Enregistrer
        </Button>
      </div>
    </section>
  );
}
