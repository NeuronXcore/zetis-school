// La matrice : un tableau par matière, lignes groupées par chapitre, une ligne = une leçon.
import { Link } from "react-router-dom";
import { Badge } from "@zetis/ui";
import { type CoverageCellKey, type CoverageLesson, type CoverageSubject } from "@zetis/types";
import { CELL_KEYS, lessonCount } from "../../lib/coverageFilters";
import { pilotageLink } from "../../lib/pilotageLinks";
import { CoverageCellView, CoverageFractionView } from "./CoverageCellView";

const COLUMN_HEAD: { key: CoverageCellKey; label: string; sup?: string }[] = [
  { key: "cours", label: "Cours", sup: "la porte" },
  { key: "quiz", label: "Quiz", sup: "sans gate" },
  { key: "fiche", label: "Fiche" },
  { key: "mindmap", label: "Mindmap" },
];

/** Deux causes de blocage, deux actions différentes — les confondre rendrait la matrice inutile :
 * 40 trous sans distinguer les combles des bloqués n'aident personne. */
function rowMarker(lesson: CoverageLesson): {
  icon: string;
  hint: string;
  badge?: { label: string; variant: "warning" | "info"; title: string };
} {
  switch (lesson.row_state) {
    case "blocked_lesson":
      return {
        icon: "🔒",
        hint: "Bloquée — la leçon elle-même n'est pas validée",
        // « À valider » + ambre = le vocabulaire EXACT de la page Programme (`badges.tsx`).
        // Reprendre ses mots plutôt qu'en inventer : Papa retrouve le même état des deux côtés.
        badge: {
          label: "À valider",
          variant: "warning",
          title: "Leçon en brouillon — cliquer pour l'ouvrir dans Programme et la valider",
        },
      };
    case "blocked_no_course":
      return {
        icon: "🔒",
        hint: "Bloquée — cours jamais rédigé",
        badge: {
          label: "Cours à rédiger",
          variant: "info",
          title: "Leçon validée, cours jamais rédigé — le + de la colonne Cours le rédige",
        },
      };
    case "complete":
      return { icon: "✔", hint: "Complète" };
    case "ready":
      return { icon: "🟢", hint: "Prête — cours validé, dérivés incomplets" };
  }
}

export function CoverageMatrix({
  subject,
  busyCell,
  onGenerate,
  onStale,
  onNotions,
  onValidateChapter,
  validatingChapterId,
}: {
  subject: CoverageSubject;
  busyCell: { lessonId: number; key: CoverageCellKey } | null;
  onGenerate: (key: CoverageCellKey, lessonId: number) => void;
  onStale: (key: CoverageCellKey, lesson: CoverageLesson, href: string | null) => void;
  onNotions: (column: "cards" | "capsules", lesson: CoverageLesson, chapterId: number) => void;
  onValidateChapter: (chapterId: number, count: number) => void;
  validatingChapterId: number | null;
}) {
  const total = lessonCount(subject);

  return (
    <section className="mb-6">
      <h2 className="mb-2 px-0.5 text-sm font-bold">
        {subject.name}
        <span className="ml-2 text-xs font-normal text-papa-muted">
          — {total} leçon{total > 1 ? "s" : ""} · {subject.chapters.length} chapitre
          {subject.chapters.length > 1 ? "s" : ""}
        </span>
      </h2>

      {subject.chapters.length === 0 ? (
        <p className="rounded-xl border border-papa-border bg-papa-surface px-4 py-6 text-center text-sm text-papa-muted">
          Aucune leçon ne correspond au filtre pour cette matière.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-papa-border bg-papa-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border-b border-papa-border bg-papa-surface-2 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-papa-muted">
                  Leçon
                </th>
                {COLUMN_HEAD.map((column) => (
                  <th
                    key={column.key}
                    className="w-[76px] border-b border-papa-border bg-papa-surface-2 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-papa-muted"
                  >
                    {column.label}
                    {column.sup && (
                      <span className="block text-[9.5px] font-normal normal-case tracking-normal text-papa-muted/70">
                        {column.sup}
                      </span>
                    )}
                  </th>
                ))}
                {/* Fond distinct : la distinction leçon-centré / notion-centré doit se voir
                    SANS lire la légende. */}
                {["Cartes", "Capsules"].map((label) => (
                  <th
                    key={label}
                    className="w-[76px] border-b border-papa-border bg-papa-bg px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-papa-muted"
                  >
                    {label}
                    <span className="block text-[9.5px] font-normal normal-case tracking-normal text-papa-muted/70">
                      notions couvertes
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subject.chapters.map((chapter) => (
                <ChapterGroup
                  key={chapter.id}
                  subjectId={subject.id}
                  chapterId={chapter.id}
                  title={chapter.title}
                  lessons={chapter.lessons}
                  busyCell={busyCell}
                  onGenerate={onGenerate}
                  onStale={onStale}
                  onNotions={onNotions}
                  onValidateChapter={onValidateChapter}
                  validatingChapterId={validatingChapterId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChapterGroup({
  subjectId,
  chapterId,
  title,
  lessons,
  busyCell,
  onGenerate,
  onStale,
  onNotions,
  onValidateChapter,
  validatingChapterId,
}: {
  subjectId: number;
  chapterId: number;
  title: string;
  lessons: CoverageLesson[];
  busyCell: { lessonId: number; key: CoverageCellKey } | null;
  onGenerate: (key: CoverageCellKey, lessonId: number) => void;
  onStale: (key: CoverageCellKey, lesson: CoverageLesson, href: string | null) => void;
  onNotions: (column: "cards" | "capsules", lesson: CoverageLesson, chapterId: number) => void;
  onValidateChapter: (chapterId: number, count: number) => void;
  validatingChapterId: number | null;
}) {
  const ready = lessons.filter((lesson) => lesson.row_state === "ready").length;
  const blocked = lessons.filter((lesson) => lesson.row_state.startsWith("blocked")).length;
  // Leçons en brouillon : le seul lot que cette page sait traiter — lever un gate, pas produire.
  const drafts = lessons.filter((lesson) => lesson.row_state === "blocked_lesson").length;
  const validating = validatingChapterId === chapterId;
  const missing = lessons.reduce(
    (count, lesson) =>
      count + CELL_KEYS.filter((key) => lesson.cells[key].state === "absent").length,
    0,
  );

  return (
    <>
      <tr>
        <td colSpan={7} className="bg-papa-surface-2/60 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] font-bold">{title}</span>
            <span className="text-[11.5px] text-papa-muted">
              {lessons.length} leçon{lessons.length > 1 ? "s" : ""} · {ready} prête
              {ready > 1 ? "s" : ""} · {blocked} bloquée{blocked > 1 ? "s" : ""}
            </span>
            {drafts > 0 && (
              // ACTIF, contrairement au bouton de production ci-dessous : valider des leçons
              // ne génère aucun contenu, ça lève seulement le gate qui bloque la ligne.
              <button
                type="button"
                onClick={() => onValidateChapter(chapterId, drafts)}
                disabled={validatingChapterId !== null}
                title={`Valider les ${drafts} leçon(s) en brouillon de ce chapitre — provenance « validé en lot »`}
                className="ml-auto rounded-lg border border-amber-400/50 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {validating ? "Validation…" : `✅ Valider les ${drafts} leçons`}
              </button>
            )}
            {/* Marque l'emplacement de la production en lot SANS la promettre — même
                convention que le bouton en lot déjà désactivé sur la page Quiz. */}
            <button
              type="button"
              disabled
              title="Production en lot — chantier ultérieur (ADR-0023)"
              className={`${drafts > 0 ? "" : "ml-auto"} cursor-not-allowed rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-muted opacity-45`}
            >
              ⚡ Compléter le chapitre ({missing})
            </button>
          </div>
        </td>
      </tr>

      {lessons.map((lesson) => {
        const marker = rowMarker(lesson);
        const blockedReason =
          lesson.row_state === "blocked_lesson"
            ? "la leçon elle-même n'est pas validée"
            : "nécessite un cours validé";
        return (
          <tr key={lesson.id} className="border-b border-papa-border/40 last:border-b-0">
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-4 shrink-0 text-center text-xs" title={marker.hint}>
                  {marker.icon}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`truncate text-[13.5px] font-medium ${
                      lesson.row_state.startsWith("blocked") ? "text-papa-muted" : ""
                    }`}
                  >
                    {lesson.title}
                  </span>
                  {marker.badge &&
                    (lesson.row_state === "blocked_lesson" ? (
                      // Seule la cause « non validée » se règle AILLEURS : le badge y conduit.
                      // Le cours manquant, lui, se rédige ici même (le `+` de la colonne) —
                      // son badge reste donc un simple repère, sans lien.
                      <Link
                        to={`/programme?subject=${subjectId}&chapter=${chapterId}&lesson=${lesson.id}`}
                        title={marker.badge.title}
                        className="shrink-0 rounded-full transition-opacity hover:opacity-80"
                      >
                        <Badge variant={marker.badge.variant}>
                          {marker.badge.label} <span aria-hidden>→</span>
                        </Badge>
                      </Link>
                    ) : (
                      <span className="shrink-0" title={marker.badge.title}>
                        <Badge variant={marker.badge.variant}>{marker.badge.label}</Badge>
                      </span>
                    ))}
                </div>
              </div>
            </td>

            {CELL_KEYS.map((key) => (
              <td key={key} className="px-1 py-2 text-center">
                <CoverageCellView
                  cellKey={key}
                  cell={lesson.cells[key]}
                  blockedReason={blockedReason}
                  busy={busyCell !== null}
                  href={pilotageLink(key, {
                    subjectId,
                    chapterId,
                    lessonId: lesson.id,
                    objectId: lesson.cells[key].object_id,
                  })}
                  onGenerate={() => onGenerate(key, lesson.id)}
                  onStale={() =>
                    onStale(
                      key,
                      lesson,
                      pilotageLink(key, {
                        subjectId,
                        chapterId,
                        lessonId: lesson.id,
                        objectId: lesson.cells[key].object_id,
                      }),
                    )
                  }
                />
              </td>
            ))}

            <td className="bg-papa-bg/40 px-1 py-2 text-center">
              <CoverageFractionView
                covered={lesson.notions.cards.covered}
                total={lesson.notions.cards.total}
                label="une carte de révision"
                blocked={lesson.row_state.startsWith("blocked")}
                onOpen={() => onNotions("cards", lesson, chapterId)}
              />
            </td>
            <td className="bg-papa-bg/40 px-1 py-2 text-center">
              <CoverageFractionView
                covered={lesson.notions.capsules.covered}
                total={lesson.notions.capsules.total}
                label="une capsule publiée"
                blocked={lesson.row_state.startsWith("blocked")}
                onOpen={() => onNotions("capsules", lesson, chapterId)}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}
