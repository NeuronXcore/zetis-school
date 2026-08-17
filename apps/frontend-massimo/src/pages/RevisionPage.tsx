import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { type ReviewChapterDue, type ReviewsSummary } from "@zetis/types";
import { groupBySubjectChapter } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { SubjectBackLink } from "../components/SubjectBackLink";
import { SUBJECT_BACK_PARAM } from "../lib/notionRoutes";
import { DeckDisc } from "../components/DeckDisc";
import { SubjectChapterShelves } from "../components/browse/SubjectChapterShelves";
import { SubjectDeckGrid } from "../components/SubjectDeckGrid";
import { SpacedMemoryHero } from "../components/SpacedMemoryHero";
import { NeonBackdrop } from "../components/glass";
import { subjectIconFor } from "../lib/subjectIcons";
import { fetchReviewChapters, fetchReviewsSummary } from "../lib/reviews";
import { type RevisionSessionState } from "./RevisionSessionPage";

// Écran des decks (/revision). Un tap → je révise : la page est un runner de session,
// pas une page de gestion. Deep link `/revision?subject={slug}` → lance directement la
// session matière (avec `replace`, sinon le retour relancerait la session en boucle).
//
// 🔴 **Le chapitre est le TROISIÈME rang** (ADR-0057 §5, qui amende l'`adr-0049` D1). L'objection
// *blocked practice* n'est pas levée par l'amendement, elle est bornée par la hiérarchie de cet
// écran : les mélanges en haut et plus grands (le rituel), la matière ensuite, le chapitre
// dessous et replié. Un test-verrou garde cet ordre — c'est lui qui a remplacé le verrou de dépôt
// qui interdisait le mot « chapitre » ici.

/** Ce que la brique partagée attend d'un objet — ici **le chapitre EST l'objet**, faute d'objets
 *  à ranger : une carte de révision ne se liste pas (son recto est la question). */
type ChapitreGroupable = ReviewChapterDue & {
  title: string;
  chapter: string;
  chapter_id: number;
};

export function RevisionPage() {
  const [summary, setSummary] = useState<ReviewsSummary | null>(null);
  const [chapitres, setChapitres] = useState<ReviewChapterDue[]>([]);
  const [cherche, setCherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const deepLinkedRef = useRef(false); // `?subject=`
  const chapLinkRef = useRef(false); // `?chapitre=` — garde SÉPARÉE (cf. l'effet plus bas)

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchReviewsSummary()
      .then((data) => {
        if (alive) setSummary(data);
      })
      .catch((e) => {
        console.warn("[revision] chargement des decks", e); // trace devtools (diagnostic)
        if (alive) setError("Tes cartes n'ont pas voulu se charger. Réessaie dans un instant ✨");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Listing séparé, et son échec ne casse pas la page : sans chapitres, l'écran est exactement
  // celui d'avant ce chantier. Le troisième rang est un ajout, jamais un prérequis.
  useEffect(() => {
    let alive = true;
    fetchReviewChapters()
      .then((rows) => {
        if (alive) setChapitres(rows);
      })
      .catch(() => {
        if (alive) setChapitres([]);
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

  // Lien profond CHAPITRE `?chapitre=<id>` — **l'adresse du deck de chapitre**, qui n'en avait
  // aucune (ADR-0049 : le deck existait, il ne se lançait que par `location.state`, comme le quiz
  // avant ce chantier). Né d'un essai au micro le 2026-08-15 : « fais-moi réviser l'orthographe »
  // proposait d'ajouter « orthographe » au programme, faute de pouvoir viser un chapitre.
  //
  // ⚠️ Garde de consommation DISTINCTE de celle de `?subject=` : une URL portant les deux
  // n'en honorerait qu'un seul si elles la partageaient.
  useEffect(() => {
    if (chapLinkRef.current) return;
    const brut = searchParams.get("chapitre");
    if (!brut) return;
    const id = Number(brut);
    if (chapitres.length === 0) return; // on attend le listing avant de conclure à l'absence
    chapLinkRef.current = true;
    const cible = chapitres.find((c) => c.chapter_id === id);
    // Chapitre inconnu, ou sans carte à réviser : on reste sur les decks, sans message d'échec —
    // même arbitrage que `?subject=`, `?carte=` et `?quiz=`.
    if (cible) {
      launch(
        { deck: { chapter: cible.chapter_id }, label: cible.name, subjectSlug: cible.subject_slug },
        true,
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete("chapitre");
    setSearchParams(next, { replace: true });
  }, [chapitres, searchParams, setSearchParams, launch]);

  // 🔴 Les DEUX ordres du serveur, relayés tels quels — `Chapter.sort_order` pour les chapitres,
  // `Subject.sort_order` pour les matières. La brique trie par NOM par défaut : sur les chapitres
  // ça lirait une année scolaire à l'envers, et sur les matières ça contredirait la grille « Par
  // matière » juste au-dessus, qui suit le curriculum (défaut vu à l'écran le 2026-08-14).
  const rangDuChapitre = useMemo(() => {
    const rangs = new Map(chapitres.map((c, i) => [c.chapter_id, i]));
    return (ch: { id: number | null }) => (ch.id == null ? Infinity : (rangs.get(ch.id) ?? Infinity));
  }, [chapitres]);

  const rangDeLaMatiere = useMemo(() => {
    const rangs = new Map<string, number>();
    chapitres.forEach((c, i) => {
      if (!rangs.has(c.subject_slug)) rangs.set(c.subject_slug, i);
    });
    return (s: { slug: string }) => rangs.get(s.slug) ?? Infinity;
  }, [chapitres]);

  const groupes = useMemo(
    () =>
      groupBySubjectChapter<ChapitreGroupable>(
        chapitres.map((c) => ({ ...c, title: c.name, chapter: c.name, chapter_id: c.chapter_id })),
        cherche,
        { chapterOrder: rangDuChapitre, subjectOrder: rangDeLaMatiere },
      ),
    [chapitres, cherche, rangDuChapitre, rangDeLaMatiere],
  );

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
        {/* Rétrolien via `?from=` uniquement — `?subject=` est déjà pris ici, et il LANCE une
            session. Il ne s'affiche donc que sur les arrivées sans deck (et au retour de
            session), là où la page est réellement habitée.

            Le nom vient du résumé déjà chargé : sans lui, `prettifySlug` afficherait
            « Mathematiques », un mot français amputé de son accent. */}
        <SubjectBackLink
          name={summary?.subjects.find((s) => s.slug === searchParams.get(SUBJECT_BACK_PARAM))?.name}
        />
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

            {/* Par chapitre — le TROISIÈME rang (ADR-0057 §5). Replié à l'arrivée : aucun
                chapitre n'est atteignable sans avoir déplié sa matière, et c'est ce qui borne
                l'objection *blocked practice* au lieu de la dissoudre.

                🔴 La section n'existe pas quand rien n'est offrable — pas de section vide, pas de
                « bientôt » : le §6 vaut aussi pour le niveau au-dessus du chapitre. */}
            {chapitres.length > 0 && (
              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                  Par chapitre
                </h2>
                <SubjectChapterShelves
                  groups={groupes}
                  search={cherche}
                  onSearchChange={setCherche}
                  searchPlaceholder="Rechercher un chapitre…"
                  emptyLabel={(q) => `Aucun chapitre ne correspond à « ${q} ».`}
                  itemKey={(c) => c.chapter_id}
                  // ⚠️ Des COLONNES ÉGALES, pas un `flex-wrap` : la largeur d'une tuile suit son
                  // titre, et « Individu et société : confrontations de valeurs » en faisait une
                  // trois fois plus large que « Grammaire » — quatre chapitres se répartissaient
                  // alors sur trois rangées bancales. En grille, le titre long passe à la ligne
                  // dans sa cellule au lieu de déformer la rangée.
                  gridClassName="grid grid-cols-2 gap-4 sm:grid-cols-4"
                  // 🔴 Replié à l'arrivée (le troisième rang), mais DÉPLIÉ pendant une recherche.
                  // Sans ça, chercher « cellules » n'aurait montré qu'un en-tête de matière clos :
                  // *« un résultat qu'on voit et qu'on ne peut pas atteindre est le défaut que
                  // cette règle existe pour empêcher »* (ADR-0057 §9(3)). Décision de PAGE, par
                  // une prop existante — la brique ne change pas, et les quatre autres pages non
                  // plus (leur parité Capsules est l'étalon du motif).
                  defaultOpen={cherche.length > 0}
                  // Le chapitre EST l'objet : sans ça son nom s'écrirait deux fois, sur le
                  // libellé de l'étagère et sur la tuile.
                  showChapterLabel={false}
                  // ⚠️ `shelf.count` compte des CHAPITRES, sur une page où tous les autres badges
                  // comptent des cartes. Un nombre nu s'y lirait comme un nombre de cartes.
                  countLabel={(n) => `${n} chapitre${n > 1 ? "s" : ""}`}
                  renderItem={(c) => (
                    <DeckDisc
                      title={c.name}
                      // ⚠️ **Pas de sous-titre de matière.** L'étagère la nomme déjà, juste
                      // au-dessus : l'écrire sur chaque tuile la répétait quatre fois sous
                      // « Français ». C'est le défaut corrigé sur `/fiches` le 2026-08-14, dans
                      // sa version matière. La provenance d'un résultat de recherche est portée
                      // par l'en-tête d'étagère, comme sur les quatre autres pages.
                      // La TAILLE DE SESSION, jamais l'arriéré (ADR-0057 §7) : le serveur l'a
                      // déjà plafonnée, la surface ne recalcule rien.
                      count={c.session_size}
                      imageUrl={subjectIconFor(c.subject_slug)}
                      fallbackInitial={c.subject.charAt(0)}
                      onClick={() =>
                        launch({
                          deck: { chapter: c.chapter_id },
                          label: c.name,
                          subjectSlug: c.subject_slug,
                        })
                      }
                    />
                  )}
                />
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
