// Page matière de Massimo — l'INDEX DE NOTIONS d'une matière (addendum ADR-0024).
//
// Réécrite le 2026-08-01. La version précédente datait de la Phase 1 : un launcher au grain
// matière (« Niveau 5 · 320 XP », quatre tuiles dont trois inertes), entièrement mocké sur
// `data/mock.ts`, et antérieur à la doctrine ADR-0024 §5 qu'il contredisait. Rien n'en est
// repris sauf la route.
//
// Elle rend le MÊME modèle que la constellation, en liste : elle EST le repli sans WebGL promis
// par `zetis-galaxy.md §11`. D'où la contrainte dure, verrouillée par `matiere.bundle.test.ts` :
// AUCUN chunk 3D, ni en import statique ni en `import()`.
//
// Aucune règle métier ici — tout vit dans `useSubjectPanoply`. C'est ce qui garde les interdits
// de l'ADR (aucun niveau, aucun XP, aucun pourcentage, aucun `mastery_score`, aucun rouge,
// aucun arriéré) tenables à un seul endroit.
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { subjectIconFor } from "@zetis/ui";
import { GlassPanel, NeonBackdrop } from "../components/glass";
import { NotionPanel } from "../components/matiere/NotionPanel";
import { NotionRow } from "../components/matiere/NotionRow";
import { RequestToast } from "../components/matiere/RequestToast";
import { SubjectCatalogueBand } from "../components/matiere/SubjectCatalogueBand";
import { useOpenNotionAction } from "../hooks/useOpenNotionAction";
import { useSubjectPanoply } from "../hooks/useSubjectPanoply";

export function MatiereDetailPage() {
  const { slug } = useParams();
  const page = useSubjectPanoply(slug);
  const { open, busy } = useOpenNotionAction();

  // `Échap` efface la recherche où que soit le focus : Massimo tape, ne trouve pas, et doit
  // pouvoir revenir à son arbre sans viser une croix.
  const { query, clearQuery } = page;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && query) clearQuery();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, clearQuery]);

  if (page.notFound) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-zetis-muted">Cette matière n'existe pas encore.</p>
        <Link to="/matieres" className="mt-3 inline-block text-sm text-zetis-accent-2">
          ← Matières
        </Link>
      </div>
    );
  }

  const subjectName = page.subject?.name ?? "";
  const iconUrl = slug ? subjectIconFor(slug) : undefined;
  const selected = page.chapters
    .flatMap((c) => c.notions)
    .find((n) => n.skill_id === page.selectedSkillId);

  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        {/* Sur la page matière elle-même, le retour va aux Matières : la brique partagée
            (`SubjectBackLink`) y boucler ait sur place. */}
        <Link to="/matieres" className="mb-4 inline-block text-sm text-zetis-accent-2">
          ← Matières
        </Link>

        {/* --- En-tête : ce qui EXISTE, jamais ce que Massimo vaut ------------------- */}
        <GlassPanel className="flex items-center gap-4 p-5">
          {iconUrl ? (
            <img src={iconUrl} alt="" aria-hidden className="h-12 w-12 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold">{subjectName}</h1>
            {/* Décompte du CATALOGUE : il décrit ce qui existe, pas un score. Il ne bouge pas
                quand on filtre — sinon la recherche donnerait l'impression que la matière
                rétrécit. */}
            <p className="mt-1 text-sm text-zetis-muted">
              {page.chapterCount} chapitre{page.chapterCount > 1 ? "s" : ""} · {page.notionCount}{" "}
              notion{page.notionCount > 1 ? "s" : ""}
            </p>
          </div>
          <Link
            to={`/galaxy?subject=${encodeURIComponent(slug ?? "")}`}
            className="min-h-11 shrink-0 rounded-xl border border-zetis-border px-3 py-2 text-sm text-zetis-muted hover:border-zetis-accent-2 hover:text-zetis-text"
          >
            Voir en galaxie →
          </Link>
        </GlassPanel>

        {/* --- Recherche : locale, à la frappe, zéro requête ------------------------- */}
        <div className="mt-4 flex items-center gap-3">
          <input
            type="search"
            value={page.query}
            onChange={(e) => page.setQuery(e.target.value)}
            placeholder="Cherche une notion…"
            aria-label="Cherche une notion"
            className="min-h-11 flex-1 rounded-xl border border-zetis-border bg-zetis-surface px-4 py-2 text-sm outline-none focus:border-zetis-accent-2"
          />
          {page.matchCount !== null && (
            <span role="status" className="shrink-0 text-xs text-zetis-muted">
              {page.matchCount} notion{page.matchCount > 1 ? "s" : ""} trouvée
              {page.matchCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* --- Ce que ZETIS a pour cette matière -------------------------------------
            Remplace la carte « N cartes à revoir », qui n'annonçait qu'un type de contenu sur
            six. La révision y devient une pastille parmi les autres, avec le MÊME nombre —
            `session_size`, ce que la session servira vraiment, et jamais `due_count` qui est
            l'arriéré (donc la pression quotidienne interdite).

            La carte « Reprendre » (dernier contenu ouvert) n'existe toujours pas : aucune
            route ne sert cette donnée, et l'inventer aurait menti. */}
        <SubjectCatalogueBand catalogue={page.catalogue} subjectName={subjectName} />

        {/* --- Chapitres → notions --------------------------------------------------- */}
        <section className="mt-5">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zetis-muted">
            Chapitres
          </h2>

          {page.loading && <p className="text-sm text-zetis-muted">Un instant…</p>}

          {!page.loading && page.chapterCount === 0 && (
            // État POSITIF : l'absence de contenu n'est pas un manque de l'enfant.
            <p className="text-sm text-zetis-muted">
              Les notions de cette matière arrivent bientôt.
            </p>
          )}

          {!page.loading && page.chapterCount > 0 && page.matchCount === 0 && (
            <p className="text-sm text-zetis-muted">
              Rien avec ce mot-là en {subjectName}. Essaie un autre mot, ou demande à ZETIS dans
              le{" "}
              <Link to="/chat" className="text-zetis-accent-2">
                chat
              </Link>
              .
            </p>
          )}

          <div className="flex flex-col gap-2">
            {page.chapters.map((chapter) => (
              <div key={chapter.chapter_id}>
                <button
                  type="button"
                  onClick={() => page.toggleChapter(chapter.chapter_id)}
                  aria-expanded={chapter.open}
                  aria-controls={`chapitre-${chapter.chapter_id}`}
                  className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-zetis-border bg-zetis-surface px-4 py-2.5 text-left text-sm transition-colors hover:text-white motion-reduce:transition-none"
                >
                  <span aria-hidden className="text-zetis-muted">
                    {chapter.open ? "▾" : "▸"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">{chapter.title}</span>
                  <span className="shrink-0 text-xs text-zetis-muted">
                    {chapter.notions.length} notion{chapter.notions.length > 1 ? "s" : ""}
                    {/* Témoin « ce chapitre est déjà alimenté ». Un COMPTE, jamais un ratio :
                        « 2 sur 3 » serait un score (ADR-0024 §5). Cyan, comme les activités
                        disponibles ailleurs sur la page — même sens, même couleur.

                        À zéro, RIEN n'est rendu et le chapitre garde exactement l'apparence
                        des autres : ni grisé, ni relégué. L'absence de contenu est l'état du
                        catalogue de Papa, pas un manque de Massimo — et un chapitre entier
                        atténué se lirait comme un reproche. */}
                    {chapter.readyCount > 0 && (
                      <>
                        {" · "}
                        <span className="text-zetis-accent-2">
                          {chapter.readyCount} prête{chapter.readyCount > 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </span>
                </button>

                {chapter.open && (
                  <div
                    id={`chapitre-${chapter.chapter_id}`}
                    className="mt-1 flex flex-col gap-1 pl-2"
                  >
                    {chapter.notions.map((notion) => (
                      <div key={notion.skill_id}>
                        <NotionRow
                          notion={notion}
                          query={page.query}
                          selected={page.selectedSkillId === notion.skill_id}
                          onSelect={() => page.selectNotion(notion.skill_id)}
                        />
                        {page.selectedSkillId === notion.skill_id && selected && (
                          <NotionPanel
                            notion={selected}
                            primaryKind={page.primaryKindOf(selected)}
                            missingKinds={page.missingKindsOf(selected)}
                            busy={busy}
                            isRequested={(kind) => page.isRequested(notion.skill_id, kind)}
                            onOpen={(action) => open(page.routeFor(action))}
                            onRequest={(kinds) => void page.request(notion.skill_id, kinds)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {page.toast && <RequestToast message={page.toast} />}
    </div>
  );
}
