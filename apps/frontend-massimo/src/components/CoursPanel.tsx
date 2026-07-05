import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { type StudentLessonContent } from "@zetis/types";
import { fetchStudentLessonCours } from "../lib/cours";

// Panneau du COURS source d'une leçon, affiché À CÔTÉ de la fiche (colonne de droite, MÊME page —
// aucune superposition). Ouvert depuis le badge « 📚 D'après ton cours » de FicheCard. Lecture
// seule : le serveur ne sert que du cours validé (la leçon d'une fiche affichée l'est toujours).
// Rendu markdown identique à la page Cours (react-markdown + MARKDOWN_STYLES). Exclu de l'impression.

const MARKDOWN_STYLES =
  "leading-relaxed text-slate-200 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:text-lg " +
  "[&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc " +
  "[&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1.5 [&_strong]:font-semibold " +
  "[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1";

export interface CoursPanelProps {
  lessonId: number;
  /** Titre affiché en attendant le cours (le titre serveur prime une fois chargé). */
  title: string;
  onClose: () => void;
}

export function CoursPanel({ lessonId, title, onClose }: CoursPanelProps) {
  const [cours, setCours] = useState<StudentLessonContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setCours(null);
    fetchStudentLessonCours(lessonId)
      .then((c) => alive && setCours(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Cours indisponible"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [lessonId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      data-print-hide
      aria-label={`Cours — ${title}`}
      className="flex max-h-[80vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-cyan-300">
            📚 Ton cours
          </p>
          <h2 className="truncate text-base font-bold text-slate-100">{cours?.title || title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le cours"
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-400/40"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading ? (
          <p className="text-sm text-slate-400">Ouverture du cours…</p>
        ) : error ? (
          <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
            🌱 Le cours de cette leçon n'est pas encore disponible.
          </p>
        ) : cours && cours.content && cours.content.trim() ? (
          <div className={MARKDOWN_STYLES}>
            <ReactMarkdown>{cours.content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Ce cours est vide pour l'instant.</p>
        )}
      </div>
    </aside>
  );
}
