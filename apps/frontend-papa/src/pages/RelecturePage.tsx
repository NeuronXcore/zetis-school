// Page Papa « File de relecture » (ADR-0039).
//
// Ce qui est produit et n'atteint pas encore Massimo. Une ligne = un contenu, cinq familles, et
// deux gestes : valider, rejeter.
//
// Ce que cette page S'INTERDIT, et pourquoi — elle regarde le même stock que la Couverture et
// hérite donc des interdits de son §F.2 :
//
// - **aucune barre de progression, aucun « X/Y relus », aucun pourcentage** — un compteur
//   d'avancement transforme « relire ce qui compte » en « vider la file », et l'envie de compléter
//   n'est pas un critère pédagogique ;
// - **aucun classement par matière** — un palmarès des matières les plus en retard ne dit rien de
//   ce qu'il faut relire d'abord ;
// - **aucun contrôle de tri** — « le plus vieux d'abord » est un reproche daté. L'ordre est celui
//   du curriculum, servi par le serveur : Papa relit dans l'ordre où Massimo rencontrera le
//   contenu ;
// - **aucun bouton « tout valider »** — c'est exactement l'agrégat de provenance que le §F.2
//   refuse, déplacé d'une page.
//
// Les seuls nombres affichés sont des compteurs de stock, sur les pastilles.
import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ContentLifecycleActions, SubjectFilterChips } from "@zetis/ui";
import type { ReviewItem, ReviewKind } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { useReviewQueue } from "../hooks/useReviewQueue";
import { reviewLink } from "../lib/pilotageLinks";

/** Les six familles, dans l'ordre du serveur. Il n'est pas réordonnable ici : c'est le même que
 *  celui de la file « À décider », et deux ordres pour la même population se contrediraient. */
const FAMILLES: { key: ReviewKind; label: string; picto: string }[] = [
  { key: "lesson", label: "Cours", picto: "📖" },
  { key: "fiche", label: "Fiches", picto: "📄" },
  { key: "mindmap", label: "Mindmaps", picto: "🧠" },
  { key: "capsule", label: "Capsules", picto: "🎬" },
  { key: "chapter", label: "Chapitres", picto: "🗂️" },
  { key: "diagnostic", label: "Diagnostics", picto: "🎯" },
];

const FAMILLE_LABEL: Record<ReviewKind, string> = {
  lesson: "Cours",
  fiche: "Fiche",
  mindmap: "Mindmap",
  capsule: "Capsule",
  chapter: "Chapitre",
  diagnostic: "Diagnostic",
};

/** Teintes de famille. Aucune n'est rouge : cette file décrit du travail en attente, pas une
 *  faute — le rouge reste banni des deux interfaces (adr-0024, adr-0028 §6). */
const FAMILLE_TON: Record<ReviewKind, string> = {
  lesson: "border-papa-accent/40 bg-papa-accent/10 text-papa-accent",
  fiche: "border-papa-accent-2/40 bg-papa-accent-2/10 text-papa-accent-2",
  mindmap: "border-papa-accent-2/30 bg-papa-accent-2/5 text-papa-accent-2",
  capsule: "border-papa-warn/40 bg-papa-warn/10 text-papa-warn",
  chapter: "border-papa-border bg-papa-surface-2 text-papa-muted",
  diagnostic: "border-papa-accent-2/40 bg-papa-accent-2/10 text-papa-accent-2",
};

/** Lit `?kind=` sans faire confiance à ce qui arrive. Un lien périmé retombe sur « Tout » plutôt
 *  que de rendre une page vide qu'on croirait cassée. */
export function parseReviewKind(raw: string | null): ReviewKind | null {
  return FAMILLES.some((famille) => famille.key === raw) ? (raw as ReviewKind) : null;
}

export function RelecturePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = parseReviewKind(searchParams.get("kind"));
  const subjectId = Number(searchParams.get("subject")) || null;
  const { queue, chargee, loading, error, busyId, decide } = useReviewQueue(subjectId, kind);

  // Écriture d'URL en forme FONCTIONNELLE : deux clés posées dans le même tick depuis une
  // fermeture sur `searchParams` s'écrasent l'une l'autre (piège documenté par l'addendum
  // ADR-0028 §3). `replace` : choisir un filtre n'est pas naviguer, le retour arrière doit
  // ramener Papa d'où il vient, pas au filtre précédent.
  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [clef, valeur] of Object.entries(patch)) {
            if (valeur === null) next.delete(clef);
            else next.set(clef, valeur);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const groupes = useMemo(() => {
    const parFamille = new Map<ReviewKind, ReviewItem[]>();
    for (const item of queue.items) {
      const existants = parFamille.get(item.kind);
      if (existants) existants.push(item);
      else parFamille.set(item.kind, [item]);
    }
    return [...parFamille.entries()];
  }, [queue.items]);

  return (
    <div>
      <PageHeader
        title="File de relecture"
        subtitle="Ce qui est produit et n'atteint pas encore Massimo. Une ligne = un contenu."
        icon={<span className="text-4xl">⏳</span>}
      />

      {error && (
        <p className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {/* Pastilles de famille. Les compteurs viennent du serveur NON filtrés : cliquer sur
          « Fiches » ne doit pas faire tomber les quatre autres à zéro, sinon il faut repasser par
          « Tout » pour savoir ce qui reste ailleurs. */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={kind === null}
          onClick={() => patchParams({ kind: null })}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            kind === null
              ? "border-papa-accent bg-papa-accent/10 font-semibold text-papa-accent"
              : "border-papa-border bg-papa-surface-2 text-papa-muted hover:border-papa-accent"
          }`}
        >
          Tout · {queue.counts.total}
        </button>
        {FAMILLES.map((famille) => (
          <button
            key={famille.key}
            type="button"
            aria-pressed={kind === famille.key}
            onClick={() => patchParams({ kind: kind === famille.key ? null : famille.key })}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              kind === famille.key
                ? "border-papa-accent bg-papa-accent/10 font-semibold text-papa-accent"
                : "border-papa-border bg-papa-surface-2 text-papa-muted hover:border-papa-accent"
            }`}
          >
            <span aria-hidden="true">{famille.picto}</span> {famille.label} ·{" "}
            {queue.counts[famille.key]}
          </button>
        ))}
      </div>

      {queue.subjects.length > 1 && (
        <SubjectFilterChips
          className="mb-5"
          subjects={queue.subjects}
          value={subjectId}
          onChange={(id) => patchParams({ subject: id === null ? null : String(id) })}
          allLabel="Toutes les matières"
        />
      )}

      {loading && !chargee ? (
        <p className="text-sm text-papa-muted">Lecture de la file…</p>
      ) : queue.items.length === 0 ? (
        // L'état vide est l'état NORMAL, et il est écrit. Pas d'illustration, pas de félicitation :
        // récompenser une file vide installerait côté Papa la mécanique que ZETIS refuse côté
        // Massimo (même arbitrage que `DecisionQueue`).
        <p className="rounded-xl border border-papa-border bg-papa-surface px-4 py-6 text-sm text-papa-muted">
          {queue.counts.total === 0
            ? "Rien n'attend de relecture. Tout ce qui est produit atteint Massimo."
            : "Aucun contenu ne correspond à ce filtre — les compteurs ci-dessus disent où en trouver."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groupes.map(([famille, items]) => (
            <section
              key={famille}
              className="overflow-hidden rounded-xl border border-papa-border bg-papa-surface"
            >
              <header className="flex items-center gap-3 border-b border-papa-border/60 px-4 py-2.5">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${FAMILLE_TON[famille]}`}
                >
                  {FAMILLE_LABEL[famille]}
                </span>
                <span className="text-xs text-papa-muted">{items.length} en attente</span>
              </header>
              <ul>
                {items.map((item) => {
                  const lien = reviewLink(item);
                  const clef = `${item.kind}:${item.id}`;
                  return (
                    <li
                      key={clef}
                      className="flex flex-wrap items-center gap-3 border-b border-papa-border/50 px-4 py-3 last:border-b-0 hover:bg-papa-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{item.title}</span>
                        {/* Le fil de rattachement est PARTIEL par nature : un chapitre s'arrête à
                            sa matière, et c'est l'information — c'est lui le nœud, ses leçons ne
                            peuvent pas être validées avant lui.
                            ⚠️ Le dernier maillon est retiré quand il RÉPÈTE le titre : le titre
                            d'un cours EST celui de sa leçon, et celui d'une fiche est emprunté à
                            la sienne. Vu à l'écran — « Anglais › Repères culturels › La vie
                            quotidienne britannique » sous un titre identique. */}
                        <span className="mt-0.5 block text-xs text-papa-muted">
                          {[item.subject, item.chapter, item.lesson]
                            .filter((maillon) => maillon && maillon !== item.title)
                            .join(" › ") || "Sans rattachement"}
                        </span>
                      </span>
                      {lien && (
                        <Link
                          to={lien}
                          className="shrink-0 rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-1.5 text-xs font-semibold hover:border-papa-accent"
                        >
                          Voir →
                        </Link>
                      )}
                      <ContentLifecycleActions
                        status="pending"
                        busy={busyId === clef}
                        itemLabel={item.title}
                        onValidate={() => void decide(item, "validate")}
                        onReject={() => void decide(item, "reject")}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
