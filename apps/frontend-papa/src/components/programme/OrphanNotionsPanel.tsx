// Notions « sans leçon » d'une matière (addendum ADR-0027) — visibles ET actionnables.
//
// La page Programme est leçon-centrée : une notion du référentiel rattachée à AUCUNE leçon n'y
// apparaît sinon nulle part (cas du « 🎯 Rattrapage » et du pont « Ajouter au programme » d'une
// demande de Massimo). On les montre ici, et surtout on permet d'AGIR : créer une leçon qui les
// porte (elles quittent alors ce panneau), ou supprimer une notion ajoutée par erreur (ex. lycée).
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@zetis/ui";
import { type CurriculumChapter } from "@zetis/types";
import {
  createManualLesson,
  deleteOrphanNotion,
  fetchOrphanNotions,
  generateLessonContent,
  type OrphanNotion,
} from "../../lib/curriculum";
import { ProgressBar } from "../ProgressBar";
import { useProgressionEstimee } from "../../hooks/useEstimations";

export function OrphanNotionsPanel({
  subjectId,
  chapters,
}: {
  subjectId: number | null;
  chapters: CurriculumChapter[];
}) {
  const [notions, setNotions] = useState<OrphanNotion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busySkill, setBusySkill] = useState<number | null>(null);
  const [lessonFor, setLessonFor] = useState<OrphanNotion | null>(null);
  const [toDelete, setToDelete] = useState<OrphanNotion | null>(null);

  const reload = useCallback(async () => {
    if (subjectId == null) {
      setNotions([]);
      return;
    }
    try {
      setNotions(await fetchOrphanNotions(subjectId));
    } catch {
      /* best-effort */
    }
  }, [subjectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = useCallback(
    async (n: OrphanNotion) => {
      setBusySkill(n.skill_id);
      setError(null);
      try {
        await deleteOrphanNotion(n.skill_id);
        await reload();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Suppression impossible");
      } finally {
        setBusySkill(null);
      }
    },
    [reload],
  );

  if (subjectId == null || (notions.length === 0 && !error)) return null;

  return (
    <section className="rounded-xl border border-papa-border bg-papa-surface p-4">
      <h3 className="text-[13px] font-bold">
        🧩 Notions sans leçon <span className="font-normal text-papa-muted">({notions.length})</span>
      </h3>
      <p className="mb-3 mt-1 text-[11.5px] leading-relaxed text-papa-muted">
        Notions au référentiel de cette matière mais rattachées à <b className="text-papa-text">aucune
        leçon</b> — ajoutées par « Rattrapage » ou depuis une demande de Massimo. Crée une leçon qui
        les porte (elles quittent alors ce panneau), ou supprime une notion ajoutée par erreur.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {notions.map((n) => (
          <li
            key={n.skill_id}
            className="flex items-center gap-2 rounded-lg border border-papa-border/70 bg-papa-bg/40 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{n.name}</span>
            <button
              type="button"
              onClick={() => setLessonFor(n)}
              disabled={busySkill !== null}
              className="shrink-0 rounded-lg bg-papa-accent px-2.5 py-1 text-xs font-semibold text-papa-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              + Leçon
            </button>
            <button
              type="button"
              onClick={() => setToDelete(n)}
              disabled={busySkill !== null}
              title="Supprimer cette notion (refusé si Massimo l'a déjà travaillée)"
              className="shrink-0 rounded-lg border border-papa-border px-2 py-1 text-xs font-semibold text-papa-muted hover:text-red-300 disabled:opacity-40"
            >
              {busySkill === n.skill_id ? "…" : "🗑"}
            </button>
          </li>
        ))}
      </ul>

      {lessonFor && (
        <OrphanLessonModal
          notion={lessonFor}
          chapters={chapters}
          onClose={() => setLessonFor(null)}
          onDone={() => {
            setLessonFor(null);
            void reload();
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        tone="important"
        title="Supprimer la notion ?"
        confirmLabel="Supprimer"
        onConfirm={() => {
          const target = toDelete;
          setToDelete(null);
          if (target) void remove(target);
        }}
        onCancel={() => setToDelete(null)}
      >
        <p className="text-sm text-foreground">
          <b>« {toDelete?.name} »</b> quittera le référentiel de la matière.
        </p>
        <p className="mt-2 text-xs">
          Refusé si Massimo l'a déjà travaillée (mastery, cartes…) — son historique n'est jamais
          effacé.
        </p>
      </ConfirmDialog>
    </section>
  );
}

function OrphanLessonModal({
  notion,
  chapters,
  onClose,
  onDone,
}: {
  notion: OrphanNotion;
  chapters: CurriculumChapter[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [generate, setGenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = useProgressionEstimee(busy && generate, "lesson_content");

  const submit = useCallback(async () => {
    if (chapterId == null) return;
    setBusy(true);
    setError(null);
    try {
      // La notion existant déjà (même nom normalisé), l'upsert la RÉUTILISE et la lie — pas de doublon.
      const lesson = await createManualLesson(chapterId, {
        title: notion.name,
        notions: [notion.name],
      });
      if (generate) await generateLessonContent(lesson.id);
      onDone();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Création échouée");
      setBusy(false);
    }
  }, [chapterId, notion.name, generate, onDone]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-[440px] max-w-full rounded-xl border border-papa-border bg-papa-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Créer une leçon pour la notion"
      >
        <h4 className="text-[13px] font-bold">Créer une leçon</h4>
        <p className="mb-3 mt-1 text-[12px] text-papa-muted">
          Notion : <b className="text-papa-text">« {notion.name} »</b>. Choisis le chapitre qui la
          portera.
        </p>

        {error && (
          <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        )}

        <label className="block text-[12px] font-semibold">Chapitre</label>
        <select
          className="mt-1 w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
          value={chapterId ?? ""}
          onChange={(e) => setChapterId(e.target.value ? Number(e.target.value) : null)}
          disabled={busy}
        >
          <option value="">{chapters.length === 0 ? "— aucun chapitre —" : "— choisir —"}</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="mt-3 flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={generate}
            onChange={(e) => setGenerate(e.target.checked)}
            disabled={busy}
          />
          Rédiger le cours maintenant (~1 min ; la leçon passera « à valider »)
        </label>

        {busy && generate ? (
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
              disabled={busy || chapterId == null}
              className="rounded-lg bg-papa-accent px-3 py-1.5 text-xs font-semibold text-papa-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "…" : "Créer la leçon"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
