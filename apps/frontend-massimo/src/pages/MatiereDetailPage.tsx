// Page matière de Massimo — une COQUILLE À ONGLETS sur l'index de notions.
//
// Refondue le 2026-08-11 (addendum ADR-0024 « la page matière porte l'effort de Massimo, et se
// range en onglets », cadré sur 9 wireframes). Ce qui a changé : un en-tête qui annonce le XP et
// le niveau de la matière, une vue d'ensemble (anneau en COMPTES, courbe d'XP en cumul, cartes
// de chapitres), et sept onglets.
//
// Ce qui n'a PAS changé : l'index de notions. Recherche, accordéon, panoplie, panneau d'activités
// et « Demander à ZETIS tout ce qui manque » sont DÉPLACÉS sous l'onglet « Chapitres », sans une
// ligne de réécriture. Ce dernier geste est le seul que Massimo puisse poser face à un contenu
// absent (addendum ADR-0027) : le retirer l'aurait laissé devant un manque sans recours.
//
// Réécrite une première fois le 2026-08-01, depuis un launcher de Phase 1 entièrement mocké.
//
// Elle rend le MÊME modèle que la constellation, en liste : elle EST le repli sans WebGL promis
// par `zetis-galaxy.md §11`. D'où la contrainte dure, verrouillée par `matiere.bundle.test.ts` :
// AUCUN chunk 3D, ni en import statique ni en `import()`.
//
// Aucune règle métier ici — tout vit dans `useSubjectPanoply`. C'est ce qui garde les interdits
// de l'ADR (aucun pourcentage, aucun `mastery_score`, aucun rouge, aucun arriéré) tenables à un
// seul endroit.
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { NeonBackdrop } from "../components/glass";
import { ChapterCards } from "../components/matiere/ChapterCards";
import { NotionPanel } from "../components/matiere/NotionPanel";
import { NotionRow } from "../components/matiere/NotionRow";
import { RequestToast } from "../components/matiere/RequestToast";
import { ResumeCards } from "../components/matiere/ResumeCards";
import { SubjectCatalogueBand } from "../components/matiere/SubjectCatalogueBand";
import { SubjectHeader } from "../components/matiere/SubjectHeader";
import { SubjectProgressRing } from "../components/matiere/SubjectProgressRing";
import { SubjectSideRail } from "../components/matiere/SubjectSideRail";
import { type SubjectTab, SubjectTabs } from "../components/matiere/SubjectTabs";
import { SubjectXpCurve } from "../components/matiere/SubjectXpCurve";
import { useMotivationWeek } from "../hooks/useMotivationWeek";
import { useOpenNotionAction } from "../hooks/useOpenNotionAction";
import { useSubjectPanoply } from "../hooks/useSubjectPanoply";
import { useSubjectUpcoming } from "../hooks/useSubjectUpcoming";

export function MatiereDetailPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();

  // L'onglet vit dans l'URL, pas dans un état local : il survit au rafraîchissement, au partage
  // de lien et au retour physique iPhone. Même raison que le rétrolien dérivé du `:slug`.
  const tab: SubjectTab = params.get("onglet") === "chapitres" ? "chapitres" : "apercu";
  const askedChapter = Number(params.get("chapitre"));
  const page = useSubjectPanoply(
    slug,
    Number.isFinite(askedChapter) && askedChapter > 0 ? askedChapter : null,
  );
  const { open, busy } = useOpenNotionAction();
  // Le rail droit. Deux lectures indépendantes de la panoplie : une panne de l'une ne retire
  // que sa carte (chaque hook avale son erreur), jamais la matière.
  const { week } = useMotivationWeek();
  const upcoming = useSubjectUpcoming(slug);

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
  const selected = page.chapters
    .flatMap((c) => c.notions)
    .find((n) => n.skill_id === page.selectedSkillId);

  return (
    // `max-w-6xl` depuis l'arrivée du rail : à `4xl`, la colonne principale tombait sous
    // 620 px et la panoplie de l'onglet Chapitres disparaissait sur un écran de bureau.
    <div className="relative mx-auto max-w-6xl">
      <NeonBackdrop />
      <div className="relative">
        {/* Sur la page matière elle-même, le retour va aux Matières : la brique partagée
            (`SubjectBackLink`) y boucler ait sur place.

            `min-h-11` ajouté le 2026-08-11 : mesuré à 20 px de haut à 390 px, sous le plancher
            de 44 px de la spec. Le défaut précède ce chantier, mais c'est le lien de SORTIE de
            la page — celui qu'on rate le plus cher. */}
        <Link
          to="/matieres"
          className="mb-2 inline-flex min-h-11 items-center text-sm text-zetis-accent-2"
        >
          ← Matières
        </Link>

        {/* --- En-tête : ce qui EXISTE, et ce que Massimo y a FAIT ------------------- */}
        <SubjectHeader
          slug={slug ?? ""}
          name={subjectName}
          chapterCount={page.chapterCount}
          notionCount={page.notionCount}
          xp={page.subjectXp}
        />

        <SubjectTabs slug={slug ?? ""} subjectName={subjectName} active={tab} />

        {page.loading && <p className="mt-5 text-sm text-zetis-muted">Un instant…</p>}

        {/* Deux colonnes seulement à partir de `lg`. En dessous, le rail passe SOUS le contenu
            par le flux naturel de la grille — jamais dans un tiroir : sur téléphone, ce qui se
            replie ne se rouvre pas. */}
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            {tab === "apercu" ? (
              <ApercuTab
                page={page}
                slug={slug ?? ""}
                subjectName={subjectName}
                busy={busy}
                onOpen={open}
              />
            ) : (
              <ChapitresTab
                page={page}
                subjectName={subjectName}
                selected={selected}
                busy={busy}
                open={open}
              />
            )}
          </div>

          <SubjectSideRail week={week} upcoming={upcoming} subjectName={subjectName} />
        </div>
      </div>

      {page.toast && <RequestToast message={page.toast} />}
    </div>
  );
}

/** La vue d'ensemble : où j'en suis, ce que j'ai gagné, ce que je peux rouvrir, et par quel
 *  chapitre j'entre.
 *
 *  La carte « Reprendre » était refusée depuis le 2026-08-01 (« aucune route ne sert cette
 *  donnée, et l'inventer aurait menti »). Le read-before-code du 2026-08-11 a levé la réserve —
 *  mais **seulement pour `cours` et `quiz`**, les deux surfaces adressables par identifiant. */
function ApercuTab({
  page,
  slug,
  subjectName,
  busy,
  onOpen,
}: {
  page: ReturnType<typeof useSubjectPanoply>;
  slug: string;
  subjectName: string;
  busy: boolean;
  onOpen: ReturnType<typeof useOpenNotionAction>["open"];
}) {
  if (page.loading) return null;

  if (page.chapterCount === 0) {
    // État POSITIF : l'absence de contenu n'est pas un manque de l'enfant.
    return (
      <p className="mt-5 text-sm text-zetis-muted">
        Les notions de cette matière arrivent bientôt.
      </p>
    );
  }

  // ⚠️ La grille ne se dédouble QUE si les deux cartes existent. Vu à l'écran le 2026-08-11 :
  // SVT n'a qu'un seul jour de gain, la courbe se retire (il lui en faut deux), et un
  // `lg:grid-cols-2` figé laissait le panneau s'arrêter au milieu de la page avec un vide à
  // droite. Une carte seule prend toute la largeur.
  const ring = <SubjectProgressRing counts={page.statusCounts} subjectName={subjectName} />;
  const curve = <SubjectXpCurve days={page.xpDays} subjectName={subjectName} />;
  const deux = page.statusCounts.some((c) => c.status !== "unknown") && page.xpDays.length >= 2;

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className={`grid gap-4 ${deux ? "lg:grid-cols-2" : ""}`}>
        {ring}
        {curve}
      </div>
      {/* « Reprendre » AVANT les chapitres : c'est la reprise du fil, pas une exploration. */}
      <ResumeCards
        items={page.resume}
        subjectSlug={slug}
        subjectName={subjectName}
        busy={busy}
        onOpen={onOpen}
      />
      <ChapterCards chapters={page.chapters} slug={slug} />
    </div>
  );
}

/** L'index de notions — INCHANGÉ depuis le 2026-08-01, seulement déplacé sous un onglet. */
function ChapitresTab({
  page,
  subjectName,
  selected,
  busy,
  open,
}: {
  page: ReturnType<typeof useSubjectPanoply>;
  subjectName: string;
  selected: ReturnType<typeof useSubjectPanoply>["chapters"][number]["notions"][number] | undefined;
  busy: boolean;
  open: ReturnType<typeof useOpenNotionAction>["open"];
}) {
  return (
    <>
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

        {!page.loading && page.chapterCount === 0 && (
          // État POSITIF : l'absence de contenu n'est pas un manque de l'enfant.
          <p className="text-sm text-zetis-muted">Les notions de cette matière arrivent bientôt.</p>
        )}

        {!page.loading && page.chapterCount > 0 && page.matchCount === 0 && (
          <p className="text-sm text-zetis-muted">
            Rien avec ce mot-là en {subjectName}. Essaie un autre mot, ou demande à ZETIS dans le{" "}
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
                <div id={`chapitre-${chapter.chapter_id}`} className="mt-1 flex flex-col gap-1 pl-2">
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
    </>
  );
}
