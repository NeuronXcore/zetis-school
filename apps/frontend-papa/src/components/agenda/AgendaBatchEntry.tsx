import { useState } from "react";
import { type AgendaItemDraft, type AgendaKind, type CurriculumChapter } from "@zetis/types";
import { Button, Input, Select, Spinner } from "@zetis/ui";

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
  dueOn: string;
  kind: AgendaKind;
}

const KINDS: { value: AgendaKind; label: string }[] = [
  { value: "devoir", label: "Devoir" },
  { value: "controle", label: "Contrôle" },
  { value: "rendu", label: "Rendu" },
];

let nextKey = 1;
const emptyRow = (): DraftRow => ({
  key: nextKey++,
  subjectId: "",
  chapterId: "",
  label: "",
  dueOn: "",
  kind: "devoir",
});

interface Props {
  subjects: SubjectOption[];
  /** Chapitres du référentiel par `school_year_subject_id`, chargés à la demande. */
  chaptersBySys: Record<number, CurriculumChapter[]>;
  chaptersLoading: Set<number>;
  onNeedChapters: (sysId: number) => void;
  saving: boolean;
  onSubmit: (drafts: AgendaItemDraft[]) => Promise<void>;
}

export function AgendaBatchEntry({
  subjects,
  chaptersBySys,
  chaptersLoading,
  onNeedChapters,
  saving,
  onSubmit,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);

  const patch = (key: number, change: Partial<DraftRow>) =>
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const chooseSubject = (row: DraftRow, value: string) => {
    // Changer de matière invalide le chapitre déjà choisi : il appartenait à l'autre matière.
    patch(row.key, { subjectId: value, chapterId: "" });
    const sysId = subjects.find((s) => String(s.id) === value)?.sysId ?? null;
    if (sysId !== null && !chaptersBySys[sysId]) onNeedChapters(sysId);
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
                onChange={(e) => patch(row.key, { chapterId: e.target.value })}
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

              <Input
                aria-label="Intitulé"
                className="col-span-2 lg:col-span-1"
                placeholder="ex. Exercices 12 à 15 p. 45"
                value={row.label}
                onChange={(e) => patch(row.key, { label: e.target.value })}
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
                {KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
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
