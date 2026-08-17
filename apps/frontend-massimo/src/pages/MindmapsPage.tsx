import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type MindmapsSummary } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { AnimatedMindmapIcon } from "../components/AnimatedMindmapIcon";
import { SubjectDeckGrid } from "../components/SubjectDeckGrid";
import { NeonBackdrop } from "../components/glass";
import { fetchMindmapsSummary } from "../lib/mindmaps";

// Écran 1 (/mindmaps) : un deck de mindmaps par matière. Compteur = cartes validées ; matière sans
// carte → deck grisé « bientôt » (inerte). Structure/état des decks fournis par le serveur (aucune
// logique métier client). Le badge « Nouveau » est différé en V1 (pas de suivi des vues, ADR-0016).

export function MindmapsPage() {
  const [summary, setSummary] = useState<MindmapsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchMindmapsSummary()
      .then((data) => alive && setSummary(data))
      .catch((e) => {
        console.warn("[mindmap] chargement des matières", e); // trace devtools (diagnostic)
        if (alive) setError("Tes cartes n'ont pas voulu se charger. Réessaie dans un instant ✨");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const hasAny = summary?.subjects.some((s) => s.mindmap_count > 0);

  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3">
              <AnimatedMindmapIcon className="h-12 w-12" />
              Mes mindmaps
            </span>
          }
          // ⚠️ « mindmap », jamais « carte » (ADR-0052 §5) : le mot « carte » est pris par la
          // carte de RÉVISION (SRS), et cette page annonçait « 14 cartes » à trois entrées de
          // sidebar de « Révision · 9+ ». Le même défaut, un cran plus haut, avait fait conclure
          // au commanditaire qu'il manquait un lien vers les mindmaps.
          subtitle="Vois la mindmap d'une notion, entraîne-toi à la compléter, puis reconstruis-la."
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
              Tes mindmaps arrivent bientôt !
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Elles apparaîtront ici dès qu'un cours sera prêt.
            </p>
          </div>
        ) : summary ? (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Choisis une matière
            </h2>
            <SubjectDeckGrid
              subjects={summary.subjects.map((s) => ({
                slug: s.slug,
                name: s.name,
                count: s.mindmap_count,
                hint:
                  s.mindmap_count > 0
                    ? `${s.mindmap_count} mindmap${s.mindmap_count > 1 ? "s" : ""}`
                    : undefined,
                dimmed: s.mindmap_count === 0,
                dimmedHint: "bientôt ✨",
              }))}
              onSelect={(slug) => {
                const subject = summary.subjects.find((s) => s.slug === slug);
                navigate(`/mindmaps/${slug}`, { state: { name: subject?.name } });
              }}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
