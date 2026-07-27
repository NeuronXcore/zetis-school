import { useEffect, useState } from "react";
import { type FicheDetail } from "@zetis/types";
import { FicheCard } from "../FicheCard";
import { fetchFiche, fetchSubjectFiches } from "../../lib/fiches";

// Panneau de la FICHE DE RÉVISION d'une leçon, affiché À GAUCHE de la carte mentale (même page,
// aucune superposition — la sidebar de l'app reste visible). Ouvert depuis le bouton « Voir la
// fiche » de la page mindmap, uniquement en modes Regarde/Mémorise (interdit en Reconstruire).
// Une fiche est liée à une leçon → on la retrouve depuis le mindmap (lesson_id + subject_slug) via
// les routes élève existantes (deck de la matière → fiche). Lecture seule : le serveur ne sert que
// du validé. On n'appelle PAS `markFicheSeen` : consultation d'appoint, pas le flux Fiches.

export interface FicheSidePanelProps {
  subjectSlug: string;
  lessonId: number;
  /** Titre affiché en attendant la fiche (le titre de la fiche prime une fois chargée). */
  title: string;
  onClose: () => void;
}

export function FicheSidePanel({ subjectSlug, lessonId, title, onClose }: FicheSidePanelProps) {
  const [fiche, setFiche] = useState<FicheDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMissing(false);
    setError(null);
    setFiche(null);
    // Deck de la matière → fiche de CETTE leçon (le serveur ne renvoie que les fiches validées).
    fetchSubjectFiches(subjectSlug)
      .then((list) => {
        const item = list.find((f) => f.lesson_id === lessonId);
        if (!item) {
          if (alive) setMissing(true);
          return null;
        }
        return fetchFiche(item.id);
      })
      .then((detail) => alive && detail && setFiche(detail))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Fiche indisponible"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [subjectSlug, lessonId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={`Fiche — ${title}`}
      className="flex max-h-[80vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-cyan-300">
            🗂️ Ta fiche
          </p>
          <h2 className="truncate text-base font-bold text-slate-100">{fiche?.title || title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la fiche"
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-400/40"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-slate-400">Ouverture de la fiche…</p>
        ) : error ? (
          <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
            🌱 La fiche de cette leçon n'est pas encore prête.
          </p>
        ) : missing || !fiche ? (
          <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
            🌱 La fiche de cette leçon n'est pas encore prête.
          </p>
        ) : (
          <FicheCard spec={fiche.spec} subjectSlug={fiche.subject_slug || subjectSlug} />
        )}
      </div>
    </aside>
  );
}
