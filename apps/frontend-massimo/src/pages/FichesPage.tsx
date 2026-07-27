import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type FichesSummary } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { SubjectDeckGrid } from "../components/SubjectDeckGrid";
import { NeonBackdrop } from "../components/glass";
import { fetchFichesSummary } from "../lib/fiches";

// Écran 1 (/fiches) : un deck de fiches par matière. Compteur = fiches validées ; badge
// « Nouveau » si une fiche n'a jamais été ouverte ; matière sans fiche → deck grisé « bientôt »
// (inerte). Structure/état des decks fournis par le serveur (aucune logique métier client).

export function FichesPage() {
  const [summary, setSummary] = useState<FichesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchFichesSummary()
      .then((data) => alive && setSummary(data))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Chargement impossible"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const hasAny = summary?.subjects.some((s) => s.fiche_count > 0);

  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        <PageHeader
          title="🗂️ Mes fiches"
          subtitle="Un deck de fiches par matière. Chaque fiche résume une leçon sur une page."
        />

        {error && (
          <p className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>
        )}

        {loading ? (
          <p className="text-zetis-muted">Chargement…</p>
        ) : summary && !hasAny ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-2xl">🌱</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              Tes fiches arrivent bientôt !
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Elles apparaîtront ici dès qu'un cours sera prêt.
            </p>
          </div>
        ) : summary ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Choisis un deck
            </h2>
            <SubjectDeckGrid
              subjects={summary.subjects.map((s) => ({
                slug: s.slug,
                name: s.name,
                count: s.fiche_count,
                hint: s.fiche_count > 0 ? `${s.fiche_count} fiche${s.fiche_count > 1 ? "s" : ""}` : undefined,
                dimmed: s.fiche_count === 0,
                dimmedHint: "bientôt ✨",
                isNew: s.new_count > 0,
              }))}
              onSelect={(slug) => {
                const subject = summary.subjects.find((s) => s.slug === slug);
                navigate(`/fiches/${slug}`, { state: { name: subject?.name } });
              }}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
