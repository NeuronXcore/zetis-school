// La matrice : un tableau par matière, lignes groupées par chapitre, une ligne = une leçon.
import { Link } from "react-router-dom";
import { Badge, SubjectPictogram } from "@zetis/ui";
import {
  type ContentRequest,
  type CoverageCellKey,
  type CoverageLesson,
  type CoverageSubject,
} from "@zetis/types";
import { type AnomalyKey, CELL_KEYS, lessonCount } from "../../lib/coverageFilters";
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

// Rappel d'anomalies de l'en-tête replié — mêmes pictogrammes et même vocabulaire que les
// pilules de filtre, pour qu'un « ⏳ 2 » ici et la pilule « ⏳ À relire » se lisent comme la même
// chose. Un marqueur à zéro n'est pas affiché : une matière saine doit se voir à ce qu'elle ne
// porte AUCUN marqueur, pas à une rangée de zéros à déchiffrer.
const ANOMALY_MARKERS: { key: AnomalyKey; icon: string; label: string; className: string }[] = [
  { key: "no_lesson", icon: "🔒", label: "non validées", className: "text-papa-muted" },
  { key: "no_course", icon: "📝", label: "sans cours", className: "text-papa-muted" },
  { key: "pending", icon: "⏳", label: "à relire", className: "text-amber-300" },
  { key: "stale", icon: "⚠", label: "périmés", className: "text-red-300" },
];

/** Demandes de Massimo portant sur les notions d'une leçon (fusion par `skill_id`, dédupe par id).
 * `coverage.py` n'est pas touché : la fusion est purement cliente (addendum ADR-0027). */
export function lessonRequestsOf(
  lesson: CoverageLesson,
  requestsBySkill: Map<number, ContentRequest[]>,
): ContentRequest[] {
  const seen = new Set<number>();
  const out: ContentRequest[] = [];
  for (const item of lesson.notions.items) {
    for (const req of requestsBySkill.get(item.skill_id) ?? []) {
      if (!seen.has(req.id)) {
        seen.add(req.id);
        out.push(req);
      }
    }
  }
  return out;
}

export function CoverageMatrix({
  subject,
  anomalies,
  open,
  onToggle,
  busyCell,
  onGenerate,
  onStale,
  onNotions,
  onRequested,
  requestsBySkill,
  onValidateChapter,
  validatingChapterId,
  onCompleteChapter,
}: {
  subject: CoverageSubject;
  /** Comptes calculés sur la matière ENTIÈRE — surtout pas sur `subject`, qui arrive filtré. */
  anomalies: Record<AnomalyKey, number>;
  open: boolean;
  onToggle: () => void;
  busyCell: { lessonId: number; key: CoverageCellKey } | null;
  onGenerate: (key: CoverageCellKey, lessonId: number) => void;
  onStale: (key: CoverageCellKey, lesson: CoverageLesson, href: string | null) => void;
  onNotions: (column: "cards" | "capsules", lesson: CoverageLesson, chapterId: number) => void;
  onRequested: (lesson: CoverageLesson) => void;
  requestsBySkill: Map<number, ContentRequest[]>;
  onValidateChapter: (chapterId: number, count: number) => void;
  validatingChapterId: number | null;
  onCompleteChapter: (chapterId: number) => void;
}) {
  const total = lessonCount(subject);
  const regionId = `couverture-matiere-${subject.id}`;

  return (
    <section className="mb-6">
      {/* Le pictogramme est le MÊME composant que celui des pastilles de filtre en haut de page :
          la matière qu'on vient de cliquer se retrouve à l'identique sur la matrice, sans avoir à
          relire son nom. Deux rendus distincts du même pictogramme se liraient comme deux objets
          différents. */}
      <h2 className="mb-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={regionId}
          className={`flex w-full items-center gap-3 rounded-xl border bg-papa-surface px-3 py-2.5 text-left transition-colors ${
            open ? "border-papa-border" : "border-papa-border hover:border-papa-accent/60"
          }`}
        >
          <span
            aria-hidden
            className={`text-papa-muted transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          <SubjectPictogram
            slug={subject.slug}
            name={subject.name}
            size="md"
            className="ring-1 ring-papa-border"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold leading-tight">{subject.name}</span>
            <span className="mt-0.5 block text-xs font-normal text-papa-muted">
              {total} leçon{total > 1 ? "s" : ""} · {subject.chapters.length} chapitre
              {subject.chapters.length > 1 ? "s" : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2.5 text-[12.5px] font-semibold">
            {ANOMALY_MARKERS.filter((marker) => anomalies[marker.key] > 0).map((marker) => (
              <span key={marker.key} className={marker.className}>
                <span aria-hidden>{marker.icon}</span> {anomalies[marker.key]}
                {/* Le pictogramme seul ne dit rien à un lecteur d'écran — le mot le suit. */}
                <span className="sr-only"> {marker.label}</span>
              </span>
            ))}
          </span>
        </button>
      </h2>

      <div id={regionId} hidden={!open}>
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
                  onRequested={onRequested}
                  requestsBySkill={requestsBySkill}
                  onValidateChapter={onValidateChapter}
                  validatingChapterId={validatingChapterId}
                  onCompleteChapter={onCompleteChapter}
                />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
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
  onRequested,
  requestsBySkill,
  onValidateChapter,
  validatingChapterId,
  onCompleteChapter,
}: {
  subjectId: number;
  chapterId: number;
  title: string;
  lessons: CoverageLesson[];
  busyCell: { lessonId: number; key: CoverageCellKey } | null;
  onGenerate: (key: CoverageCellKey, lessonId: number) => void;
  onStale: (key: CoverageCellKey, lesson: CoverageLesson, href: string | null) => void;
  onNotions: (column: "cards" | "capsules", lesson: CoverageLesson, chapterId: number) => void;
  onRequested: (lesson: CoverageLesson) => void;
  requestsBySkill: Map<number, ContentRequest[]>;
  onValidateChapter: (chapterId: number, count: number) => void;
  validatingChapterId: number | null;
  onCompleteChapter: (chapterId: number) => void;
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
            {/* Production en lot (ADR-0031). Le compte affiché est celui des TROUS, pas des
                notions équipables — c'est l'aperçu, à l'ouverture, qui dit ce que le gate du §7
                laissera passer. Annoncer un chiffre d'équipables ici coûterait un appel par
                chapitre au rendu de la page ; le patron preview/confirm le paie une fois, au
                moment du geste. */}
            <button
              type="button"
              onClick={() => onCompleteChapter(chapterId)}
              disabled={missing === 0}
              title={
                missing === 0
                  ? "Rien à compléter dans ce chapitre"
                  : "Produire les contenus manquants — ZETIS ne validera aucun cours à votre place"
              }
              className={`${drafts > 0 ? "" : "ml-auto"} rounded-lg border border-papa-accent/50 bg-papa-accent/10 px-2.5 py-1 text-xs font-semibold text-papa-accent transition-colors hover:bg-papa-accent/20 disabled:cursor-not-allowed disabled:border-papa-border disabled:text-papa-muted disabled:opacity-45`}
            >
              ⚡ Compléter le chapitre ({missing})
            </button>
          </div>
        </td>
      </tr>

      {lessons.map((lesson) => {
        const marker = rowMarker(lesson);
        const requested = lessonRequestsOf(lesson, requestsBySkill);
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
                  {/* Badge « réclamé par Massimo » : un repère de priorité sur les trous, cliquable
                      pour voir quelle notion + quel type, et trier. N'affiche RIEN à zéro. */}
                  {requested.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onRequested(lesson)}
                      title={`${requested.length} contenu(s) réclamé(s) par Massimo — voir le détail`}
                      className="shrink-0 rounded-full transition-opacity hover:opacity-80"
                    >
                      <Badge variant="info">⭐ réclamé ({requested.length})</Badge>
                    </button>
                  )}
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
