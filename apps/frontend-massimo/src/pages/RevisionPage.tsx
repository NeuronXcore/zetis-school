import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { type ReviewsSummary } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { DeckDisc } from "../components/DeckDisc";
import { SubjectDeckGrid } from "../components/SubjectDeckGrid";
import { SpacedMemoryHero } from "../components/SpacedMemoryHero";
import { NeonBackdrop } from "../components/glass";
import { subjectIconFor } from "../lib/subjectIcons";
import { fetchReviewsSummary } from "../lib/reviews";
import { type RevisionSessionState } from "./RevisionSessionPage";

// Écran des decks (/revision). Un tap → je révise : la page est un runner de session,
// pas une page de gestion. Deep link `/revision?subject={slug}` → lance directement la
// session matière (avec `replace`, sinon le retour relancerait la session en boucle).

export function RevisionPage() {
  const [summary, setSummary] = useState<ReviewsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const deepLinkedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchReviewsSummary()
      .then((data) => {
        if (alive) setSummary(data);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Chargement impossible");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // slug → nom : transmis à la session pour l'étiquette de matière de chaque carte
  // (les mélanges panachent les matières, la session n'a pas le summary).
  const subjectNames: Record<string, string> = summary
    ? Object.fromEntries(summary.subjects.map((s) => [s.slug, s.name]))
    : {};

  const launch = useCallback(
    (state: RevisionSessionState, replace = false) => {
      navigate("/revision/session", { state, replace });
    },
    [navigate],
  );

  // Deep link matière : une fois le summary chargé, on lance la session et on remplace
  // l'entrée d'historique paramétrée (le retour retombe alors sur l'écran des decks).
  useEffect(() => {
    if (!summary || deepLinkedRef.current) return;
    const slug = searchParams.get("subject");
    if (!slug) return;
    const subject = summary.subjects.find((s) => s.slug === slug);
    if (!subject) return;
    deepLinkedRef.current = true;
    const names = Object.fromEntries(summary.subjects.map((s) => [s.slug, s.name]));
    launch(
      { deck: { subject: slug }, label: subject.name, subjectSlug: slug, subjectNames: names },
      true,
    );
  }, [summary, searchParams, launch]);

  const collageUrls = summary
    ? summary.subjects
        .filter((s) => s.due_count > 0)
        .slice(0, 4)
        .map((s) => subjectIconFor(s.slug))
        .filter((u): u is string => Boolean(u))
    : [];

  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        <PageHeader title="🔁 Révision" subtitle="Ancre tes notions, une carte à la fois." />

        <SpacedMemoryHero />

        {error && (
          <p className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>
        )}

        {loading ? (
          <p className="text-zetis-muted">Chargement…</p>
        ) : summary && summary.total_due === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              Tout est frais dans ta mémoire !
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Rien à revoir pour l'instant. Continue à découvrir de nouvelles notions.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Link to="/matieres" className="text-cyan-300 hover:underline">
                📚 Mes cours
              </Link>
              <Link to="/capsules" className="text-cyan-300 hover:underline">
                🎬 Capsules
              </Link>
            </div>
          </div>
        ) : summary ? (
          <div className="flex flex-col gap-8">
            {/* Mélanges : recommandation (interleaving par défaut), en haut et plus grands. */}
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Mélanges
              </h2>
              <div className="flex flex-wrap justify-center gap-8">
                <DeckDisc
                  title="Mélange du jour"
                  subtitle="toutes les matières"
                  count={summary.total_due}
                  hero
                  collageUrls={collageUrls}
                  isNew={summary.new_count > 0}
                  onClick={() =>
                    launch({ deck: "mix_day", label: "Mélange du jour", subjectNames })
                  }
                />
                <DeckDisc
                  title="Mélange éclair"
                  subtitle={`${summary.flash_size} cartes rapides`}
                  count={summary.flash_size}
                  hero
                  collageUrls={collageUrls}
                  isNew={summary.new_count > 0}
                  onClick={() =>
                    launch({ deck: "mix_flash", label: "Mélange éclair", subjectNames })
                  }
                />
              </div>
            </section>

            {/* Par matière : ciblage ponctuel. */}
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Par matière
              </h2>
              {/* Grille « Par matière » extraite dans SubjectDeckGrid (partagée avec ELI5) :
                  3 états — sans carte (grisé « à venir ») / à jour ✓ / lançable. Inerte quand
                  atténué (dimmedClickable non fourni), à l'identique du rendu précédent. */}
              <SubjectDeckGrid
                subjects={summary.subjects.map((subject) => ({
                  slug: subject.slug,
                  name: subject.name,
                  count: subject.due_count,
                  dimmed: !subject.has_cards,
                  atDay: subject.has_cards && subject.due_count === 0,
                  isNew: subject.new_count > 0,
                }))}
                onSelect={(slug) => {
                  const subject = summary.subjects.find((s) => s.slug === slug);
                  if (!subject) return;
                  launch({
                    deck: { subject: subject.slug },
                    label: subject.name,
                    subjectSlug: subject.slug,
                    subjectNames,
                  });
                }}
              />
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
