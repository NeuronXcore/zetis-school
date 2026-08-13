// L'atelier — la fiche que Massimo fabrique lui-même (addendum ADR-0015, slice 1).
//
// **Page à part entière, en plein écran** — jamais une quatrième vue de `FicheSubjectPage` (qui
// porte déjà liste + fiche + cours), et JAMAIS dans `ActivityModal` : la modale borne son corps
// avec défilement interne, ce qui rejouerait le défaut que l'ADR-0052 vient de corriger sur les
// mindmaps. C'est une SÉANCE DE TRAVAIL, pas une consultation.
//
// Le plein écran réutilise le patron déjà retenu (ADR-0052) — overlay CSS + état React, jamais
// `requestFullscreen` ; `CloseFullscreenButton` (cible 44 px) ; Échap ; verrou du défilement du
// corps. On relit `MindmapWorkspace`, on n'invente pas un second patron.
//
// ⚠️ **La colonne ne montre qu'UNE étape.** Le gabarit de la spec en compte six, mais la slice 1
// n'en implémente qu'une (`points_cles`). Les cinq autres ne sont **pas rendues grisées** — même
// principe que l'étape ⑥ « Mnemonics », que l'addendum §10 interdit d'afficher quand elle n'a
// rien à offrir : une étape visible mais morte est une promesse que le produit ne tient pas.
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type FicheCandidate, type FicheDraft, type FicheDraftDetail } from "@zetis/types";
import { CloseFullscreenButton } from "@zetis/ui";
import {
  fetchCandidates,
  finishDraft,
  openDraft,
  reviewDraft,
  saveDraft,
} from "../lib/atelier";
import { speak } from "../lib/speech";

const ACCUEIL =
  "Ton cours fait plusieurs pages. Une fiche, c'est cinq idées. Lesquelles tu gardes ?";

export function AtelierPage() {
  const { slug = "", lessonId = "" } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<FicheDraftDetail | null>(null);
  const [candidates, setCandidates] = useState<FicheCandidate[]>([]);
  const [slots, setSlots] = useState(5);
  const [choisis, setChoisis] = useState<string[]>([]);
  // Miroir SYNCHRONE de `choisis` — voir `appliquer()`.
  const choisisRef = useRef<string[]>([]);
  // Glisse en cours : le fantôme qui suit le doigt, et l'emplacement survolé.
  const [glisse, setGlisse] = useState<{ texte: string; x: number; y: number } | null>(null);
  const [survole, setSurvole] = useState<number | null>(null);
  const glisseRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reussites, setReussites] = useState<string[] | null>(null);
  const [seche, setSeche] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  const retour = useCallback(() => navigate(`/fiches/${slug}`), [navigate, slug]);

  // ── Chargement : ouvre OU retrouve le brouillon, puis ses candidates ─────────
  useEffect(() => {
    let annule = false;
    const id = Number(lessonId);
    if (!id) return;
    (async () => {
      try {
        const d = await openDraft(id);
        if (annule) return;
        setDetail(d);
        // La reprise est ICI : il retrouve exactement les emplacements qu'il avait remplis.
        choisisRef.current = d.draft.points_cles ?? [];
        setChoisis(choisisRef.current);
        const c = await fetchCandidates(d.id);
        if (annule) return;
        setCandidates(c.candidates);
        setSlots(c.slots);
      } catch (e) {
        if (!annule) setError(e instanceof Error ? e.message : "Impossible d'ouvrir l'atelier.");
      }
    })();
    // `annule` : StrictMode monte deux fois en dev, et une réponse en retard écraserait l'état.
    return () => {
      annule = true;
    };
  }, [lessonId]);

  // ── Sauvegarde : à chaque geste, parce que l'écran le promet ─────────────────
  const temoin = useRef<number | null>(null);
  const persister = useCallback(
    async (points: string[]) => {
      if (!detail) return;
      const draft: FicheDraft = { ...detail.draft, points_cles: points };
      try {
        await saveDraft(detail.id, draft);
        setDetail((d) => (d ? { ...d, draft } : d));
        setEnregistre(true);
        if (temoin.current) window.clearTimeout(temoin.current);
        temoin.current = window.setTimeout(() => setEnregistre(false), 1600);
      } catch {
        // Silencieux à dessein : une erreur de sauvegarde affichée à chaque clic ferait de
        // l'atelier un champ de mines. L'état reste à l'écran, il repartira au geste suivant.
      }
    },
    [detail],
  );

  useEffect(() => () => void (temoin.current && window.clearTimeout(temoin.current)), []);

  // ── Échap + verrou du défilement (patron ADR-0052) ───────────────────────────
  useEffect(() => {
    const surEchap = (e: KeyboardEvent) => {
      if (e.key === "Escape") retour();
    };
    document.addEventListener("keydown", surEchap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surEchap);
      document.body.style.overflow = avant;
    };
  }, [retour]);

  // ── Les gestes du choix ─────────────────────────────────────────────────────
  const restants = useMemo(
    () => candidates.filter((c) => !choisis.includes(c.texte)),
    [candidates, choisis],
  );

  // ⚠️ La sélection est lue depuis une RÉFÉRENCE, pas depuis l'état de rendu : deux gestes dans
  // le même tick (un enfant qui tape vite sur un téléphone) verraient sinon la même valeur
  // périmée, et le second serait perdu. Constaté à l'écran le 2026-08-13 — deux retraits
  // enchaînés n'en produisaient qu'un.
  function appliquer(suivant: string[]) {
    choisisRef.current = suivant;
    setChoisis(suivant);
    setReussites(null);
    void persister(suivant);
  }

  function retirer(index: number) {
    appliquer(choisisRef.current.filter((_, i) => i !== index));
  }

  // ── Glisser-déposer, même mécanique que la banque de nœuds des mindmaps ──────
  //
  // Événements POINTEUR, jamais le glisser-déposer HTML5 : celui-ci ne se déclenche pas au doigt
  // sur iPhone, et l'atelier doit y marcher. `touch-none` sur la puce empêche la page de défiler
  // pendant qu'on tire. Le fantôme est en `pointer-events: none`, sinon il masquerait la cible à
  // `elementFromPoint` au moment du lâcher.
  function emplacementSous(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const cible = (el as HTMLElement | null)?.closest?.("[data-emplacement]") as HTMLElement | null;
    if (!cible) return null;
    const i = Number(cible.getAttribute("data-emplacement"));
    // Seuls les emplacements LIBRES acceptent : déposer sur une idée déjà placée l'écraserait
    // sans que Massimo l'ait demandé.
    return Number.isInteger(i) && !choisisRef.current[i] ? i : null;
  }

  function demarrerGlisse(texte: string, e: ReactPointerEvent) {
    if (choisisRef.current.length >= slots) return;
    e.preventDefault();
    glisseRef.current = texte;
    setGlisse({ texte, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!glisse) return;
    const bouger = (e: PointerEvent) => {
      setGlisse((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      setSurvole(emplacementSous(e.clientX, e.clientY));
    };
    const lacher = (e: PointerEvent) => {
      const cible = emplacementSous(e.clientX, e.clientY);
      const texte = glisseRef.current;
      // Lâcher à côté ne coûte rien et ne dit rien : la phrase retourne simplement au cours.
      if (cible !== null && texte && !choisisRef.current.includes(texte)) {
        const suivant = [...choisisRef.current];
        suivant[cible] = texte;
        appliquer(suivant.filter(Boolean));
      }
      glisseRef.current = null;
      setGlisse(null);
      setSurvole(null);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
    return () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glisse !== null]);

  async function regarder() {
    if (!detail) return;
    try {
      const retourZetis = await reviewDraft(detail.id);
      setReussites(retourZetis.reussites);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Je n'ai pas réussi à regarder.");
    }
  }

  async function terminer() {
    if (!detail) return;
    try {
      await finishDraft(detail.id);
      retour();
    } catch (e) {
      // Le 422 dit ce qui manque. Il n'est PAS un échec : c'est une étape encore à faire.
      setError(e instanceof Error ? e.message : "Il manque encore quelque chose.");
    }
  }

  const titre = detail?.lesson_title ?? "Ta fiche";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-zetis-bg p-3 sm:p-5"
      role="dialog"
      aria-modal
      aria-label={`Fabriquer ma fiche — ${titre}`}
    >
      <CloseFullscreenButton onClick={retour} />

      <header className="pr-14">
        <p className="text-xs uppercase tracking-wide text-zetis-muted">
          {detail?.chapter ?? "Ta fiche"}
        </p>
        <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">🧩 {titre}</h1>
        {/* Compte ce qui est FAIT, jamais ce qui manque (`CLAUDE.md` § Gamification). */}
        <p className="mt-2 text-sm text-zetis-muted" aria-live="polite">
          {choisis.length} idée{choisis.length > 1 ? "s" : ""} sur {slots} — et rien ne presse.
        </p>
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400/70 transition-all"
            style={{ width: `${(choisis.length / slots) * 100}%` }}
          />
        </div>
      </header>

      {error && (
        <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>
      )}

      {/* `select-none` sur TOUTE l'étape, pas seulement sur les puces : un glisser qui démarre à
          quelques pixels d'une phrase sélectionnait le texte de la colonne — et sur iPhone, une
          sélection déclenche la loupe et le menu Copier au milieu du travail. Rien n'est à
          recopier ici : les phrases se déplacent, elles ne se copient pas. */}
      <section className="select-none rounded-2xl border border-white/10 bg-white/5 p-4">
        {/* La bulle ZETIS : il parle le RELATIONNEL. Les 12 phrases, elles, sont ÉCRITES —
            les lire à voix haute serait un supplice (ni balayage, ni retour en arrière). */}
        <div className="mb-4 flex items-start gap-2">
          <p className="flex-1 text-sm text-slate-200">🪐 {ACCUEIL}</p>
          <button
            type="button"
            // Toujours sur un GESTE : `AudioContext` l'exige, et une voix qui part seule est une
            // notification poussée. Dégradation silencieuse si la voix est indisponible.
            onClick={() => void speak(ACCUEIL)}
            aria-label="Écouter ZETIS"
            className="rounded-full border border-white/15 px-2 py-1 text-sm"
          >
            🔊
          </button>
        </div>

        <h2 className="mb-2 text-sm font-semibold text-slate-100">🔑 À retenir</h2>
        <ol className="mb-4 flex flex-col gap-2">
          {Array.from({ length: slots }, (_, i) => {
            const texte = choisis[i];
            return (
              <li key={i}>
                {texte ? (
                  <div className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-2">
                    <span className="text-xs text-cyan-200">{i + 1}</span>
                    <span className="flex-1 text-sm text-slate-100">{texte}</span>
                    {/* Le SEUL clic restant de l'étape : retirer. Poser se fait au glisser. */}
                    <button
                      type="button"
                      onClick={() => retirer(i)}
                      aria-label={`Retirer l'idée ${i + 1}`}
                      // 44 px : la cible tactile du projet (cf. `CloseFullscreenButton`). À 36,
                      // elle était sous le seuil — et c'est un doigt d'enfant qui vise.
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 text-sm text-slate-300"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div
                    data-emplacement={i}
                    className={`rounded-xl border border-dashed p-2 text-sm transition ${
                      survole === i
                        ? "border-cyan-300 bg-cyan-400/15 text-cyan-100"
                        : glisse
                          ? "border-cyan-400/40 text-slate-300"
                          : "border-white/15 text-zetis-muted"
                    }`}
                  >
                    {i + 1}. {survole === i ? "dépose ici" : "un emplacement libre"}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Les phrases de ton cours
        </h3>
        <p className="mb-2 text-xs text-zetis-muted">
          Glisse une phrase sur un emplacement. Pour en retirer une, clique sur sa croix.
        </p>
        {/* ⚠️ Les phrases non retenues NE SONT PAS FAUSSES : elles sont vraies mais secondaires.
            C'est ce qui rend le choix formateur — et ce qui interdit tout signe de « mauvaise
            réponse » ici. */}
        <div className="flex flex-col gap-2">
          {restants.length === 0 && candidates.length > 0 && (
            <p className="text-sm text-zetis-muted">Tu les as toutes placées.</p>
          )}
          {restants.map((c) => (
            <button
              key={c.index}
              type="button"
              // Glisser par POINTEUR (souris ET doigt) — le HTML5 `draggable` ne se déclenche pas
              // au doigt sur iPhone. `touch-none` empêche la page de défiler pendant qu'on tire.
              onPointerDown={(e) => demarrerGlisse(c.texte, e)}
              disabled={choisis.length >= slots}
              className="cursor-grab touch-none select-none rounded-xl border border-white/10 bg-white/5 p-2 text-left text-sm text-slate-200 transition hover:border-cyan-400/40 active:cursor-grabbing disabled:opacity-40"
            >
              {c.texte}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSeche(true)}
          className="mt-4 text-sm text-zetis-muted underline"
        >
          Je sèche sur cette étape
        </button>
        {/* Réponse JAMAIS déçue, aucune relance, aucune confirmation : si dire « je ne sais
            pas » est gratuit, il le dit — sinon il recopie son cours (règle 4 du §5). */}
        {seche && (
          <p className="mt-2 text-sm text-slate-300">
            C'est bon, ça arrive. Tu peux revenir quand tu veux — ce que tu as déjà choisi
            t'attendra ici.
          </p>
        )}
      </section>

      {reussites && (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-100">🪐 J'ai regardé.</p>
          <ul className="flex flex-col gap-1">
            {reussites.map((r) => (
              <li key={r} className="text-sm text-slate-100">
                ⭐ {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-col gap-2 pb-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void regarder()}
            disabled={choisis.length === 0}
            className="rounded-xl bg-zetis-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            ZETIS, regarde ma fiche
          </button>
          <button
            type="button"
            onClick={() => void terminer()}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100"
          >
            C'est fini, je la garde
          </button>
          {/* Sortie sans confirmation : la fiche reste « commencée », ce n'est pas un abandon. */}
          <button type="button" onClick={retour} className="px-2 py-2 text-sm text-zetis-muted">
            J'ai fini pour aujourd'hui
          </button>
        </div>
        <p className="text-xs text-zetis-muted" aria-live="polite">
          {enregistre
            ? "✓ gardé"
            : "Tout est gardé au fur et à mesure — tu peux fermer et revenir demain."}
        </p>
      </footer>

      {/* Fantôme de la phrase tirée. `pointer-events: none` est OBLIGATOIRE : sans lui, il se
          trouverait sous le doigt au moment du lâcher et `elementFromPoint` le renverrait LUI
          au lieu de l'emplacement visé. */}
      {glisse && (
        <div
          style={{
            position: "fixed",
            left: glisse.x,
            top: glisse.y,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 60,
            maxWidth: "min(90vw, 28rem)",
          }}
          className="rounded-xl border border-cyan-300/70 bg-cyan-500/25 px-3 py-1.5 text-sm text-cyan-50 shadow-lg"
        >
          {glisse.texte}
        </div>
      )}
    </div>
  );
}
