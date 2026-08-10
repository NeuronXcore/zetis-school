import { useEffect, useState } from "react";
import { SoundToggle, useCelebrate } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import {
  type CapsulePublicItem,
  type CapsuleStats,
  fetchCapsuleLibrary,
  fetchCapsuleStats,
  recordCapsuleView,
  videoSrc,
} from "../lib/capsules";
import { DifficultyBadge } from "../components/DifficultyBadge";
import { groupBySubjectChapter } from "../lib/groupCapsules";
import { subjectEmoji } from "../lib/subjectEmoji";
import { subjectIconFor } from "../lib/subjectIcons";

// Mémorise les capsules déjà « célébrées » (localStorage) pour ne fêter chaque nouveauté qu'UNE fois.
const CELEBRATED_KEY = "zetis:celebratedCapsules";
function loadCelebrated(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}
function saveCelebrated(ids: Set<number>): void {
  try {
    localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...ids]));
  } catch {
    /* stockage indisponible */
  }
}

// Icône de matière : PNG dédié (assets/subjects) si dispo, sinon repli emoji.
function SubjectIcon({ slug, size = 20 }: { slug: string; size?: number }) {
  const url = subjectIconFor(slug);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        className="inline-block object-contain align-[-0.2em]"
        style={{ width: size, height: size }}
      />
    );
  }
  return <span aria-hidden>{subjectEmoji(slug)}</span>;
}

// Page Capsules IA Massimo : matières (accordéons fermés) d'abord, lecture en modale,
// « nouveau » (non vues) + compteur de capsules distinctes vues.
export function CapsulesIAPage() {
  const [items, setItems] = useState<CapsulePublicItem[]>([]);
  const [stats, setStats] = useState<CapsuleStats | null>(null);
  const [playing, setPlaying] = useState<CapsulePublicItem | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const celebrate = useCelebrate();

  useEffect(() => {
    Promise.all([fetchCapsuleLibrary(), fetchCapsuleStats().catch(() => null)])
      .then(([list, s]) => {
        setItems(list);
        setStats(s);
        // Fête les capsules fraîchement apparues (non vues et jamais célébrées).
        const celebrated = loadCelebrated();
        const fresh = list.filter((c) => !c.seen && !celebrated.has(c.id));
        if (fresh.length > 0) {
          fresh.forEach((c) => celebrated.add(c.id));
          saveCelebrated(celebrated);
          celebrate({
            title: fresh.length === 1 ? "Nouvelle capsule !" : `${fresh.length} nouvelles capsules !`,
            subtitle: fresh.length === 1 ? fresh[0].title : undefined,
          });
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement échoué"))
      .finally(() => setLoading(false));
  }, [celebrate]);

  // À la FIN de la vidéo (regardée jusqu'au bout) : enregistre la vue + MAJ optimiste.
  // Chaque visionnage complet incrémente `view_count` (répétitions incluses) ; « vue distincte »
  // et « nouvelle » ne bougent que la 1re fois.
  function onEnded(c: CapsulePublicItem) {
    const wasUnseen = items.find((it) => it.id === c.id)?.seen === false;
    recordCapsuleView(c.id).catch(() => {});
    if (wasUnseen) {
      setItems((prev) => prev.map((it) => (it.id === c.id ? { ...it, seen: true } : it)));
    }
    setStats((s) =>
      s
        ? {
            ...s,
            view_count: s.view_count + 1,
            seen_count: wasUnseen ? s.seen_count + 1 : s.seen_count,
            new_count: wasUnseen ? Math.max(0, s.new_count - 1) : s.new_count,
          }
        : s,
    );
  }

  const shelves = groupBySubjectChapter(items, search);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Capsules IA"
        subtitle="De courtes vidéos pour comprendre une notion."
        right={<SoundToggle />}
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-zetis-muted">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zetis-border bg-zetis-surface p-8 text-center text-zetis-muted">
          Aucune capsule pour l'instant. Reviens bientôt : ZETIS en prépare de nouvelles ! 🎬
        </div>
      ) : (
        <>
          {/* Compteurs : nouvelles (non vues) + capsules distinctes vues */}
          {stats && (
            <div className="flex flex-wrap gap-2 text-sm">
              {stats.new_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-300">
                  🆕 {stats.new_count} nouvelle{stats.new_count > 1 ? "s" : ""}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-zetis-surface-2 px-3 py-1 font-semibold text-zetis-accent-2">
                👁️ {stats.seen_count} capsule{stats.seen_count > 1 ? "s" : ""} vue
                {stats.seen_count > 1 ? "s" : ""}
              </span>
              {stats.view_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-zetis-surface-2 px-3 py-1 font-semibold text-zetis-accent">
                  🎬 {stats.view_count} visionnage{stats.view_count > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Recherche */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une capsule…"
            className="mt-4 w-full rounded-xl border border-zetis-border bg-zetis-surface px-4 py-2.5 text-sm"
          />

          {/* Accordéons par matière → chapitre (fermés par défaut) */}
          {shelves.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-zetis-border p-6 text-center text-sm text-zetis-muted">
              Aucune capsule ne correspond à « {search} ».
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {shelves.map((shelf) => {
                const key = shelf.slug || shelf.name;
                const open = !!expanded[key];
                return (
                  <section
                    key={key}
                    className="overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded((m) => ({ ...m, [key]: !m[key] }))}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left font-bold"
                    >
                      <SubjectIcon slug={shelf.slug} size={28} />
                      {shelf.name}
                      <span className="ml-auto text-sm font-medium text-zetis-muted">
                        {shelf.count} · {open ? "▾" : "▸"}
                      </span>
                    </button>
                    {open && (
                      <div className="px-4 pb-4">
                        {shelf.chapters.map((ch) => (
                          <div key={ch.id ?? "none"} className="mb-4 last:mb-0">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zetis-muted">
                              {ch.name}
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              {ch.capsules.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setPlaying(c)}
                                  className="rounded-2xl border border-zetis-border bg-zetis-bg p-4 text-left hover:border-zetis-accent"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="flex items-center gap-1.5 font-semibold">
                                      <SubjectIcon slug={c.subject_slug} size={22} />
                                      {c.title}
                                    </p>
                                    <span className="flex shrink-0 items-center gap-1">
                                      <DifficultyBadge difficulty={c.difficulty} />
                                      {!c.seen && (
                                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                          Nouveau
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <span className="mt-3 inline-block text-sm font-medium text-zetis-accent-2">
                                    ▶ Regarder
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modale plein écran : lecture d'une capsule */}
      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPlaying(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-zetis-border bg-zetis-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
                  <SubjectIcon slug={playing.subject_slug} size={16} />
                  {playing.subject}
                  {playing.chapter ? ` · ${playing.chapter}` : ""}
                </p>
                <h2 className="mt-1 flex items-center gap-2 text-lg font-bold">
                  {playing.title}
                  <DifficultyBadge difficulty={playing.difficulty} />
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPlaying(null)}
                aria-label="Fermer"
                className="shrink-0 rounded-lg border border-zetis-border px-3 py-1.5 text-sm hover:text-zetis-accent-2"
              >
                ✕
              </button>
            </div>
            <video
              key={playing.id}
              src={videoSrc(playing.video_url)}
              controls
              autoPlay
              playsInline
              onEnded={() => onEnded(playing)}
              className="aspect-video w-full rounded-xl border border-zetis-border bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
