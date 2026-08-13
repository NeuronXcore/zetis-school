import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { type FicheDetail, type FicheListItem, type FicheTile } from "@zetis/types";
import { cardsFromFiche, type FicheCartes } from "../lib/atelier";
import { FicheCard } from "../components/FicheCard";
import { CoursPanel } from "../components/CoursPanel";
import { NeonBackdrop } from "../components/glass";
import { SubjectBackLink, prettifySlug } from "../components/SubjectBackLink";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";
import {
  fetchFiche,
  fetchSubjectFicheTiles,
  fetchSubjectFiches,
  markFicheSeen,
} from "../lib/fiches";

// Écrans 2 (liste des fiches d'une matière) + 3 (la fiche, avec feuilletage ‹/›). La liste
// reste en mémoire → le feuilletage est instantané. À l'ouverture d'une fiche : POST /seen
// (retrait du badge « Nouveau »). Aucune logique métier : le serveur ne sert que le validé.

export function FicheSubjectPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const subjectName = (location.state as { name?: string } | null)?.name ?? prettifySlug(slug);

  const navigate = useNavigate();
  const [list, setList] = useState<FicheListItem[] | null>(null);
  // La LISTE est leçon-centrée (fabrication) ; `list` reste fiche-centrée et sert le
  // feuilletage ‹/› du viewer, qui est une lecture de deck — deux rôles, deux sources.
  const [tuiles, setTuiles] = useState<FicheTile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detail, setDetail] = useState<FicheDetail | null>(null);
  // Le pont vers les cartes (addendum ADR-0015 §13) — deux nombres, jamais un seul : une carte
  // a besoin d'une NOTION, et les termes tirés du gras du cours n'en ont pas.
  const [bilanPont, setBilanPont] = useState<FicheCartes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Cours source affiché À CÔTÉ de la fiche (colonne droite, même page — pas de superposition).
  const [coursOpen, setCoursOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([fetchSubjectFiches(slug), fetchSubjectFicheTiles(slug)])
      .then(([fiches, t]) => {
        if (!alive) return;
        setList(fiches);
        setTuiles(t);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Chargement impossible"));
    return () => {
      alive = false;
    };
  }, [slug]);

  const open = useCallback(
    async (idx: number) => {
      if (!list || idx < 0 || idx >= list.length) return;
      const item = list[idx];
      setOpenIdx(idx);
      setDetail(null);
      setDetailLoading(true);
      try {
        const [fiche] = await Promise.all([fetchFiche(item.id), markFicheSeen(item.id)]);
        setDetail(fiche);
        // Retrait local du badge « Nouveau » (le serveur l'a enregistré).
        setList((cur) => cur?.map((f) => (f.id === item.id ? { ...f, seen: true } : f)) ?? cur);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fiche indisponible");
        setOpenIdx(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [list],
  );

  const iconUrl = subjectIconFor(slug);
  const pontVersLesCartes = useCallback(async () => {
    if (!detail) return;
    try {
      setBilanPont(await cardsFromFiche(detail.id));
    } catch {
      // Silencieux : l'échec ne doit pas transformer une fiche en écran d'erreur. Le geste
      // est rejouable — le serveur met à jour au lieu de dupliquer.
    }
  }, [detail]);

  const heading = (
    <div className="flex items-center gap-2 text-slate-200">
      {iconUrl ? (
        <img src={iconUrl} alt="" aria-hidden className="h-7 w-7 object-contain" />
      ) : (
        <span aria-hidden>{subjectEmoji(slug)}</span>
      )}
      <span className="font-semibold">{subjectName}</span>
    </div>
  );

  // ── Écran 3 : la fiche ────────────────────────────────────────────────────
  if (openIdx !== null && list) {
    const total = list.length;
    return (
      <div className={`relative mx-auto ${coursOpen ? "max-w-7xl" : "max-w-3xl"}`}>
        <NeonBackdrop />
        <div className="relative">
          <div className="mb-4 flex items-center justify-between" data-print-hide>
            <button
              type="button"
              onClick={() => {
                setCoursOpen(false);
                setOpenIdx(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-400/40"
            >
              ← Retour
            </button>
            {heading}
          </div>

          <div className="mb-3 flex items-center justify-between" data-print-hide>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Fiche {openIdx + 1} / {total} · {subjectName}
            </span>
            <div className="flex items-center gap-2">
              {/* Ouvre / masque le cours source à droite de la fiche (haut de fiche, à droite). */}
              <button
                type="button"
                onClick={() => setCoursOpen((o) => !o)}
                aria-pressed={coursOpen}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  coursOpen
                    ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                    : "border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-500/20"
                }`}
              >
                {coursOpen ? "✕ Masquer le cours" : "📖 Voir le cours"}
              </button>
              <button
                type="button"
                onClick={() => open(openIdx - 1)}
                disabled={openIdx <= 0}
                aria-label="Fiche précédente"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => open(openIdx + 1)}
                disabled={openIdx >= total - 1}
                aria-label="Fiche suivante"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>

          {detailLoading || !detail ? (
            <p className="text-zetis-muted">Chargement de la fiche…</p>
          ) : (
            // Fiche à gauche, cours à droite (même page) — empilé en mobile, côte à côte en lg.
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className={`min-w-0 ${coursOpen ? "lg:flex-[2]" : "w-full"}`}>
                {/* 🔴 **Un seul bouton, et c'est celui qui existait déjà.** `FicheCard` porte
                    depuis l'ADR-0015 §6 un « 🃏 Ajouter à mes cartes » désactivé, en attente de
                    ce chantier. En ajouter un second dessous — vu à l'écran le 2026-08-13 —
                    donnait DEUX boutons au même emoji pour le même geste, dont un mort.
                    On câble le stub prévu pour ça ; sur une fiche de ZETIS il reste inerte,
                    le pont §6 étant toujours stub. */}
                <FicheCard
                  spec={detail.spec}
                  subjectSlug={detail.subject_slug || slug}
                  onAddToCards={
                    detail.validation_status === "personal" && detail.spec.definitions.length > 0
                      ? pontVersLesCartes
                      : undefined
                  }
                />
                {bilanPont && (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    {bilanPont.cartes === 0
                      ? "Aucune carte cette fois — ces mots-là ne sont pas des notions de ton programme."
                      : `${bilanPont.cartes} carte${bilanPont.cartes > 1 ? "s" : ""} ${
                          bilanPont.cartes > 1 ? "ajoutées" : "ajoutée"
                        } à tes révisions. C'est TA phrase que tu reverras.`}
                    {bilanPont.termes_sans_notion.length > 0 && (
                      <span className="mt-1 block text-xs text-zetis-muted">
                        {bilanPont.termes_sans_notion.length} mot
                        {bilanPont.termes_sans_notion.length > 1 ? "s" : ""} sans notion derrière —
                        ils restent sur ta fiche.
                      </span>
                    )}
                  </p>
                )}
              </div>
              {coursOpen && (
                <div className="min-w-0 lg:flex-[3]">
                  <CoursPanel
                    key={detail.lesson_id}
                    lessonId={detail.lesson_id}
                    title={detail.title}
                    onClose={() => setCoursOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Écran 2 : liste des fiches de la matière ──────────────────────────────
  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        <div className="mb-6 flex items-center justify-between">
          {/* Remontait vers `/fiches` (le deck) alors que Massimo arrive de sa MATIÈRE — il ne
              pouvait donc pas y revenir. La brique dérive la destination du slug de l'URL. */}
          <SubjectBackLink name={subjectName} className="mb-0" />
          {heading}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>
        )}

        {tuiles === null ? (
          <p className="text-zetis-muted">Chargement…</p>
        ) : tuiles.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-2xl">🌱</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              Les fiches de cette matière arrivent bientôt.
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Elles apparaîtront ici dès qu'un cours sera prêt.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Tes fiches, et celles qui restent à faire
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tuiles.map((t) => (
                <TuileLecon
                  key={t.lesson_id}
                  tuile={t}
                  onLire={(ficheId) => {
                    const i = list?.findIndex((f) => f.id === ficheId) ?? -1;
                    if (i >= 0) void open(i);
                  }}
                  onFabriquer={() => navigate(`/fiches/${slug}/${t.lesson_id}/atelier`)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ── La tuile d'une LEÇON — quatre états (`page-fiches.md` écran 2) ─────────────
//
// 🔴 **Aucun état n'est un reproche.** « Commencée » ne dit jamais « inachevé » ni
// « abandonné », rien ne décompte de jours, et une leçon jamais touchée n'est pas en retard :
// elle est « à fabriquer », avec une estimation de temps qui rassure au lieu d'exiger.
function TuileLecon({
  tuile,
  onLire,
  onFabriquer,
}: {
  tuile: FicheTile;
  onLire: (ficheId: number) => void;
  onFabriquer: () => void;
}) {
  const { etat } = tuile;
  const versLAtelier = etat === "commencee" || etat === "a_fabriquer";

  const pastille =
    etat === "commencee"
      ? { texte: "✏️ Commencée", classe: "bg-amber-400/15 text-amber-200" }
      : etat === "ma_fiche"
        ? { texte: "✍️ Ta fiche", classe: "bg-cyan-400/15 text-cyan-200" }
        : etat === "zetis"
          ? { texte: "⭐ Fiche ZETIS", classe: "bg-white/10 text-slate-300" }
          : { texte: "🧩 À fabriquer", classe: "bg-fuchsia-500/15 text-fuchsia-200" };

  const sousTitre =
    etat === "commencee"
      ? tuile.points_choisis > 0
        ? `tu en as choisi ${tuile.points_choisis} — reprends où tu veux`
        : "tu l'as ouverte — reprends où tu veux"
      : etat === "ma_fiche"
        ? tuile.versions > 1
          ? `${tuile.versions} versions · la dernière est la tienne`
          : "à relire — c'est la tienne"
        : etat === "zetis"
          ? "à lire"
          : "≈ 5 minutes";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-xl">
      <button
        type="button"
        onClick={() => (versLAtelier ? onFabriquer() : tuile.fiche_id && onLire(tuile.fiche_id))}
        className="flex flex-col gap-1 text-left"
      >
        {tuile.chapter && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-cyan-300">
            {tuile.chapter}
          </span>
        )}
        <span className="font-semibold text-slate-100">{tuile.title}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${pastille.classe}`}>{pastille.texte}</span>
          <span className="text-slate-400">{sousTitre}</span>
          {!tuile.seen && (etat === "zetis" || etat === "ma_fiche") && (
            <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-fuchsia-200">
              ✨ nouveau
            </span>
          )}
        </span>
      </button>

      {/* Sur une étape commencée, trois pastilles disent OÙ il en est — sans jamais montrer ce
          qui manque comme une dette. */}
      {etat === "commencee" && (
        <div className="flex gap-1" aria-label={`${tuile.etapes_remplies} étapes sur 3 commencées`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < tuile.etapes_remplies ? "bg-amber-300/70" : "bg-white/10"
              }`}
            />
          ))}
        </div>
      )}

      {/* Le corrigé reste à UN CLIC, jamais imposé : le §3 a été révisé — rien n'est verrouillé,
          seul change ce qui s'ouvre en premier. */}
      {tuile.zetis_fiche_id !== null && etat !== "zetis" && (
        <button
          type="button"
          onClick={() => onLire(tuile.zetis_fiche_id!)}
          className="self-start text-xs text-zetis-muted underline"
        >
          ⭐ Voir la fiche de ZETIS
        </button>
      )}
    </div>
  );
}
