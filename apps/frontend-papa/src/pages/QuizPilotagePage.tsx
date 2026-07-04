import { useState } from "react";
import {
  type QuizCard,
  type QuizGenerateRequest,
  type QuizPilotageLesson,
  type QuizPilotageSubject,
} from "@zetis/types";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { ProgressBar, useEstimatedProgress } from "../components/ProgressBar";
import { QuizInspectModal } from "../components/quiz/QuizInspectModal";
import { useQuizPilotage } from "../hooks/useQuizPilotage";
import { formatLabel } from "../lib/quizPilotage";

const GEN_EXPECTED_MS = 60_000; // génération + auto-vérification ≈ 60 s (barre estimée)

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)} %`;
}

/** Barre de progression estimée pendant une génération (pattern capsules/cours). */
function GenerateProgress() {
  const p = useEstimatedProgress(true, GEN_EXPECTED_MS);
  return (
    <div className="max-w-xs flex-1">
      <ProgressBar pct={p} label="Génération + auto-vérification (~60 s)" />
    </div>
  );
}

/** Popover volume + difficulté avant génération (précédent exact des capsules). */
function GeneratePopover({ onGenerate }: { onGenerate: (body: QuizGenerateRequest) => void }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<5 | 8>(8);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);

  const seg = (on: boolean) =>
    [
      "flex-1 rounded-lg border px-2 py-1.5 text-xs",
      on ? "border-papa-accent bg-papa-accent/10 font-bold text-papa-accent" : "border-papa-border text-papa-muted",
    ].join(" ");

  return (
    <div className="relative">
      <button
        className="rounded-lg bg-papa-accent px-3 py-2 text-sm font-semibold text-white"
        onClick={() => setOpen((o) => !o)}
      >
        ⚡ Générer le quiz
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-72 rounded-2xl border border-papa-border bg-white p-4 shadow-xl">
          <h4 className="mb-2 text-sm font-bold">Générer le quiz</h4>
          <p className="mb-3 text-[11px] leading-relaxed text-papa-muted">
            ZETIS choisit les formats selon le cours (QCM, trous, association…). Tu pourras
            inspecter, éditer ou retirer des questions ensuite.
          </p>
          <label className="mb-1.5 block text-xs text-papa-muted">Nombre de questions</label>
          <div className="mb-3 flex gap-1.5">
            <button className={seg(count === 5)} onClick={() => setCount(5)}>
              Court · ~5
            </button>
            <button className={seg(count === 8)} onClick={() => setCount(8)}>
              Normal · ~8
            </button>
          </div>
          <label className="mb-1.5 block text-xs text-papa-muted">Difficulté</label>
          <div className="mb-3 flex gap-1.5">
            {([1, 2, 3] as const).map((d) => (
              <button key={d} className={seg(difficulty === d)} onClick={() => setDifficulty(d)}>
                {"⭐".repeat(d)}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg border border-papa-border px-3 py-1.5 text-sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button
              className="rounded-lg bg-papa-accent px-3 py-1.5 text-sm font-semibold text-white"
              onClick={() => {
                setOpen(false);
                onGenerate({ count, difficulty });
              }}
            >
              ⚡ Générer (~60 s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuizRow({
  quiz,
  busy,
  onInspect,
  onRegenerate,
  onDelete,
}: {
  quiz: QuizCard;
  busy: boolean;
  onInspect: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-papa-muted">
      <span className="rounded-full bg-papa-accent/15 px-2 py-0.5 font-semibold text-papa-accent">
        {quiz.questions_count} questions
      </span>
      {quiz.formats.map((f) => (
        <span key={f} className="rounded-full bg-papa-surface-2 px-2 py-0.5 text-papa-text">
          {formatLabel(f)}
        </span>
      ))}
      {quiz.retired_count > 0 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
          {quiz.retired_count} retirée{quiz.retired_count > 1 ? "s" : ""}
        </span>
      )}
      {quiz.discard_rate != null && <span>· écart auto-vérif {pct(quiz.discard_rate)}</span>}
      <span className="ml-auto flex gap-1.5">
        <button className="rounded-lg border border-papa-border px-2.5 py-1" onClick={onInspect}>
          👁 Inspecter
        </button>
        <button
          className="rounded-lg border border-papa-border px-2.5 py-1 disabled:opacity-50"
          onClick={onRegenerate}
          disabled={busy}
          title="Régénère les questions IA — les manuelles sont préservées"
        >
          ↻
        </button>
        <button
          className="rounded-lg border border-papa-border px-2.5 py-1 text-red-700 disabled:opacity-50"
          onClick={onDelete}
          disabled={busy}
          title="Des tentatives → archivage (jamais effacé)"
        >
          🗑
        </button>
      </span>
    </div>
  );
}

export function QuizPilotagePage() {
  const q = useQuizPilotage();
  const [filter, setFilter] = useState<number | null>(null); // subject_id ou null (toutes)

  const subjects = q.overview?.subjects ?? [];
  const shown = filter == null ? subjects : subjects.filter((s) => s.subject_id === filter);
  const kpis = q.overview?.kpis;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Quiz — pilotage"
        subtitle="Générer, inspecter et retirer les quiz de fin de cours. Un quiz se génère depuis le cours validé d'une leçon (moteur local). Massimo ne voit un quiz que s'il existe ici."
        actions={
          <button
            className="rounded-lg border border-papa-border px-3 py-2 text-sm text-papa-muted"
            disabled
            title="Génération en lot — reportée (ADR-0014)"
          >
            ⚡ Générer les manquants
          </button>
        }
      />

      {q.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {q.error}
        </div>
      )}

      {kpis && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Quiz actifs" value={String(kpis.active_quizzes)} />
          <KpiCard label="Questions servies" value={String(kpis.served_questions)} />
          <KpiCard label="Questions retirées" value={String(kpis.retired_questions)} />
          <KpiCard label="Écart auto-vérif (moy.)" value={pct(kpis.avg_discard_rate)} />
        </div>
      )}

      {subjects.some((s) => s.generated_total > 0) && (
        <div className="mb-5 rounded-xl border border-papa-border bg-papa-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">
            🩺 Santé de la génération par matière{" "}
            <span className="font-normal text-papa-muted">
              — % de questions écartées par l'auto-vérification
            </span>
          </h3>
          {subjects
            .filter((s) => s.generated_total > 0)
            .map((s) => (
              <div key={s.subject_id} className="mb-1.5 grid grid-cols-[110px_1fr_130px] items-center gap-3 text-sm">
                <span>{s.name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-papa-surface-2">
                  <div
                    className="h-full rounded-full bg-papa-accent"
                    style={{ width: `${Math.min(100, (s.discard_rate ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="text-right text-xs text-papa-muted">
                  {pct(s.discard_rate)} · {s.discarded}/{s.generated_total} écartées
                </span>
              </div>
            ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPill active={filter == null} onClick={() => setFilter(null)}>
          Toutes
        </FilterPill>
        {subjects.map((s) => (
          <FilterPill key={s.subject_id} active={filter === s.subject_id} onClick={() => setFilter(s.subject_id)}>
            {s.name}
          </FilterPill>
        ))}
      </div>

      {q.loading && <p className="text-sm text-papa-muted">Chargement…</p>}
      {!q.loading && shown.length === 0 && (
        <p className="text-sm italic text-papa-muted">
          Aucune matière avec des leçons validées — valide un cours d'abord.
        </p>
      )}

      {shown.map((s) => (
        <SubjectGroup key={s.subject_id} subject={s} q={q} />
      ))}

      {q.inspected && (
        <QuizInspectModal
          detail={q.inspected}
          busy={q.busyQuiz.has(q.inspected.quiz_id)}
          onClose={q.closeInspect}
          onEdit={q.editQuestion}
          onAdd={q.addQuestion}
          onRetire={q.retire}
          onRegenerate={() => {
            const subjectId = q.inspected!.subject_id;
            const quizId = q.inspected!.quiz_id;
            return q.regenerate(subjectId, quizId);
          }}
          onDelete={() => {
            const subjectId = q.inspected!.subject_id;
            const quizId = q.inspected!.quiz_id;
            return q.removeQuiz(subjectId, quizId);
          }}
        />
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={[
        "rounded-full border px-3.5 py-1.5 text-sm",
        active
          ? "border-papa-accent bg-papa-accent font-semibold text-white"
          : "border-papa-border bg-papa-surface text-papa-muted",
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SubjectGroup({
  subject,
  q,
}: {
  subject: QuizPilotageSubject;
  q: ReturnType<typeof useQuizPilotage>;
}) {
  const open = q.expanded.has(subject.subject_id);
  const tree = q.trees[subject.subject_id];
  return (
    <section className="mb-5">
      <button
        className="mb-2 flex w-full items-center gap-2 text-left"
        onClick={() => q.toggleSubject(subject.subject_id)}
      >
        <span className="text-xs">{open ? "▼" : "▶"}</span>
        <h2 className="text-sm font-bold">{subject.name}</h2>
        <span className="text-xs font-normal text-papa-muted">
          — {subject.validated_lessons} leçon(s) validée(s)
          {subject.lessons_without_quiz > 0 && ` · ${subject.lessons_without_quiz} sans quiz`}
        </span>
      </button>

      {open && q.treeLoading.has(subject.subject_id) && !tree && (
        <p className="pl-5 text-sm text-papa-muted">Chargement…</p>
      )}
      {open &&
        tree?.lessons.map((lesson) => (
          <LessonRow key={lesson.lesson_id} subjectId={subject.subject_id} lesson={lesson} q={q} />
        ))}
    </section>
  );
}

function LessonRow({
  subjectId,
  lesson,
  q,
}: {
  subjectId: number;
  lesson: QuizPilotageLesson;
  q: ReturnType<typeof useQuizPilotage>;
}) {
  const isGenerating = q.generating.has(lesson.lesson_id);
  return (
    <div className="mb-2 rounded-xl border border-papa-border bg-papa-surface p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{lesson.title}</p>
          {lesson.chapter_name && (
            <p className="text-xs text-papa-muted">Chapitre : {lesson.chapter_name}</p>
          )}
          {lesson.quizzes.length === 0 && !isGenerating && (
            <p className="mt-1 text-xs italic text-papa-muted">
              Aucun quiz — le bouton n'apparaît pas côté Massimo
            </p>
          )}
        </div>
        {isGenerating ? (
          <GenerateProgress />
        ) : lesson.quizzes.length === 0 ? (
          <GeneratePopover
            onGenerate={(body) => q.generate(subjectId, lesson.lesson_id, body)}
          />
        ) : null}
      </div>
      {!isGenerating &&
        lesson.quizzes.map((quiz) => (
          <QuizRow
            key={quiz.quiz_id}
            quiz={quiz}
            busy={q.busyQuiz.has(quiz.quiz_id)}
            onInspect={() => q.openInspect(quiz.quiz_id)}
            onRegenerate={() => q.regenerate(subjectId, quiz.quiz_id)}
            onDelete={() => q.removeQuiz(subjectId, quiz.quiz_id)}
          />
        ))}
    </div>
  );
}
