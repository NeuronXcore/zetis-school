import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { DeckDisc } from "../components/DeckDisc";
import { SubjectDeckGrid, type SubjectDeck } from "../components/SubjectDeckGrid";
import { NeonBackdrop, GlassPanel, NEON_BUTTON } from "../components/glass";
import { SubjectBackLink } from "../components/SubjectBackLink";
import { type Eli5Chip, useEli5 } from "../hooks/useEli5";
import { useEli5Page } from "../hooks/useEli5Page";
import { subjectEmoji } from "../lib/subjectEmoji";
import { Eli5Session } from "../components/eli5/Eli5Session";

// Page ELI5 Massimo — entrée v2 par decks matières (slice B). Trois écrans :
//   1. decks matières (SubjectDeckGrid partagé avec Révision) + deck « Question libre » ;
//   2. notions de la matière (chips) + champ « pose ta question » ;
//   3. la session ELI5 (comprendre → reformuler) — extraite dans `Eli5Session`, partagée avec
//      la modale de mission. Le câblage d'entrée fournit un `skill_id` réel via chip (→ badge
//      « d'après ta leçon ») ou résout la question libre côté client (useEli5). Toute la logique
//      vit dans les hooks useEli5 / useEli5Page ; ce composant reste présentationnel.

export function Eli5Page() {
  const eli5 = useEli5();
  const page = useEli5Page(eli5.status);

  // Deep-link mission → ELI5 d'une notion précise : `?skill_id=N&name=…` déclenche l'explication
  // une fois. Sert les DEUX étapes du parcours mission qui ciblent ELI5 : « Découvrir » (eli5,
  // preuve = consultation) et « Verbaliser » (vocal_explain, preuve = réexplication dans la
  // session). On retire les paramètres en `replace` (pattern `?subject=`) : un retour ne relance pas.
  const [searchParams, setSearchParams] = useSearchParams();
  const skillDeepLinked = useRef(false);
  useEffect(() => {
    if (skillDeepLinked.current) return;
    const raw = searchParams.get("skill_id");
    const skillId = raw != null ? Number(raw) : Number.NaN;
    if (!Number.isFinite(skillId)) return;
    skillDeepLinked.current = true;
    const name = searchParams.get("name") ?? "ta notion";
    eli5.submitChip({ key: `mission-${skillId}`, kind: "lesson", emoji: "📖", name, note: "", skillId });
    const next = new URLSearchParams(searchParams);
    next.delete("skill_id");
    next.delete("name");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, eli5]);

  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        {/* Rétrolien via `?from=` : `/eli5?skill_id=` porte une NOTION, pas une matière, et ni
            l'URL (nettoyée dès le premier rendu) ni la réponse serveur ne gardent le slug. Le
            paramètre est ajouté par l'appelant, et il survit aux deux `replace` de cette page
            (qui ne suppriment que `skill_id`/`name` et `subject`). */}
        <SubjectBackLink />
        {page.screen === "home" && <HomeScreen page={page} />}
        {page.screen === "subject" && <SubjectScreen page={page} eli5={eli5} />}
        {page.screen === "session" && <Eli5Session eli5={eli5} onBack={page.backFromSession} />}
      </div>
    </div>
  );
}

// ── Écran 1 — decks matières ────────────────────────────────────────────────────

function HomeScreen({ page }: { page: ReturnType<typeof useEli5Page> }) {
  const decks: SubjectDeck[] = (page.summary ?? []).map((s) => {
    const empty = s.notion_count === 0;
    return {
      slug: s.slug,
      name: s.name,
      count: s.notion_count,
      hint: empty ? undefined : `${s.notion_count} notion${s.notion_count > 1 ? "s" : ""}`,
      dimmed: empty,
      dimmedHint: "bientôt ✨",
      // Notions fraîchement ajoutées au programme → badge « ✨ new » (comme Révision).
      isNew: s.new_count > 0,
    };
  });

  // Deck spécial « Question libre » : disque hero sans compteur, toujours accessible —
  // même si les compteurs n'ont pas chargé (dégradation : on garde une porte de sortie).
  const libre = (
    <DeckDisc
      title="Question libre"
      subtitle="sur n'importe quoi"
      count={0}
      hero
      hideBadge
      emoji="✨"
      fallbackInitial="?"
      onClick={page.openLibre}
    />
  );

  return (
    <>
      <header className="mb-6 text-center">
        <Eli5Emblem />
        <h1 className="mt-3 text-2xl font-bold">ELI5 — Explique-moi&nbsp;!</h1>
        <p className="mt-1 text-zetis-muted">
          Choisis une matière : je t'explique n'importe quelle notion, simplement.
        </p>
      </header>

      {page.summaryError && (
        <p className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-center text-sm text-amber-200">
          Les matières n'ont pas pu charger — tu peux quand même poser une question libre.
        </p>
      )}

      {/* Une seule grille montée en continu (decks vides pendant le chargement) : le deck
          « Question libre » du slot lead reste ainsi toujours accessible et cliquable, même
          au tout premier instant, sans jamais se démonter au passage chargement → chargé. */}
      <SubjectDeckGrid
        subjects={page.summaryLoading ? [] : decks}
        onSelect={page.openSubject}
        lead={libre}
        dimmedClickable
      />
      {page.summaryLoading && <p className="mt-4 text-center text-zetis-muted">Chargement…</p>}
    </>
  );
}

// Emblème animé ELI5 : le concept « Explique comme à un enfant » mis en scène — des
// symboles de complexité tournent autour de l'ampoule (l'idée), qui s'illumine par
// à-coups (le « aha ! ») en projetant des étincelles. Complexité qui tourbillonne →
// une idée simple et lumineuse. Tout est motion-safe : figé et lisible sous
// prefers-reduced-motion (ampoule + halo doux, sans mouvement).
const ORBIT_GLYPHS = [
  { e: "❓", pos: "left-1/2 top-0 -translate-x-1/2" },
  { e: "🔢", pos: "right-0 top-1/2 -translate-y-1/2" },
  { e: "🧩", pos: "bottom-0 left-1/2 -translate-x-1/2" },
  { e: "🌀", pos: "left-0 top-1/2 -translate-y-1/2" },
];

function Eli5Emblem() {
  return (
    <div className="relative mx-auto h-24 w-24" aria-hidden>
      {/* Halo « idée » qui respire */}
      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/40 to-cyan-400/30 blur-2xl motion-safe:animate-[eli5-idea-glow_3s_ease-in-out_infinite]" />

      {/* Symboles de complexité en orbite autour de l'idée */}
      <div className="absolute inset-0 motion-safe:animate-[eli5-orbit_11s_linear_infinite]">
        {ORBIT_GLYPHS.map((g) => (
          <span key={g.e} className={`absolute ${g.pos} text-base opacity-60`}>
            {g.e}
          </span>
        ))}
      </div>

      {/* Étincelles du déclic (n'apparaissent qu'au flash de l'ampoule) */}
      <span className="absolute right-1 top-2 text-sm opacity-0 motion-safe:animate-[eli5-spark_3s_ease-in-out_infinite]">
        ✨
      </span>
      <span
        className="absolute bottom-3 left-2 text-xs opacity-0 motion-safe:animate-[eli5-spark_3s_ease-in-out_infinite]"
        style={{ animationDelay: "0.18s" }}
      >
        ✨
      </span>

      {/* L'idée : l'ampoule qui s'illumine (emoji ELI5) */}
      <span className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-[0_2px_6px_rgba(99,102,241,0.5)] motion-safe:animate-[eli5-aha_3s_ease-in-out_infinite]">
        💡
      </span>
    </div>
  );
}

// ── Écran 2 — notions de la matière ─────────────────────────────────────────────

function SubjectScreen({
  page,
  eli5,
}: {
  page: ReturnType<typeof useEli5Page>;
  eli5: ReturnType<typeof useEli5>;
}) {
  const subject = page.subject;
  const libre = subject?.libre ?? false;
  const emoji = libre ? "✨" : subject ? subjectEmoji(subject.slug) : "📘";
  const hasNotions = !libre && page.notions.length > 0;

  // Chip de notion → question pré-remplie + skill_id réel (traces propres, badge leçon).
  const onNotion = (skillId: number, name: string) => {
    const chip: Eli5Chip = {
      key: `notion-${skillId}`,
      kind: "lesson",
      emoji: "📖",
      name,
      note: "",
      skillId,
    };
    eli5.submitChip(chip);
  };

  const placeholder = libre
    ? "Pose ta question sur n'importe quoi…"
    : `Ex. : explique-moi un truc de ${(subject?.name ?? "").toLowerCase()}…`;

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={page.goHome}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zetis-text transition-colors hover:bg-white/10"
        >
          ← Matières
        </button>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <span aria-hidden className="text-2xl">
            {emoji}
          </span>
          {subject?.name ?? ""}
        </h1>
      </div>

      {!libre && page.notionsLoading && <p className="text-zetis-muted">Chargement…</p>}

      {hasNotions && (
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zetis-muted">
            Tape une notion, je te l'explique
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {page.notions.map((n) => (
              <button
                key={n.skill_id}
                type="button"
                onClick={() => onNotion(n.skill_id, n.name)}
                className="flex flex-col gap-0.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-zetis-accent-2 hover:bg-white/10"
              >
                <span className="text-sm font-semibold text-zetis-text">{n.name}</span>
                <span className="text-[11px] text-zetis-muted">{n.chapter_title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Matière sans notion validée : carte positive (jamais un vide anxiogène). */}
      {!libre && !page.notionsLoading && !hasNotions && (
        <GlassPanel className="mb-6 p-5">
          <p className="text-sm leading-relaxed text-zetis-muted">
            🚀 Les notions de cette matière arrivent bientôt.
            <br />
            En attendant, pose-moi ta question ci-dessous — je t'explique quand même&nbsp;!
          </p>
        </GlassPanel>
      )}

      {/* Champ « pose ta question » — toujours présent (résolu côté client par useEli5). */}
      <GlassPanel className="p-5">
        <label htmlFor="eli5-question" className="mb-2 block text-sm font-medium">
          {libre ? "Ta question" : "Ou pose ta question"}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="eli5-question"
            type="text"
            value={eli5.question}
            onChange={(e) => eli5.setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") eli5.submitQuestion();
            }}
            placeholder={placeholder}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-zetis-text outline-none placeholder:text-zetis-muted focus:border-zetis-accent focus:ring-2 focus:ring-zetis-accent/40"
          />
          <button type="button" onClick={eli5.submitQuestion} disabled={eli5.busy} className={NEON_BUTTON}>
            Expliquer
          </button>
        </div>

        {/* Champ sans match : état vide bienveillant + « Dis à ZETIS d'ajouter » (§16 — l'adulte
            ne se nomme plus dans l'espace de Massimo). Ici, contrairement au chat, ZETIS n'est pas
            en train de parler à la première personne : le nommer se lit naturellement. */}
        {eli5.noMatch && (
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {eli5.requested ? (
              <p>C'est noté&nbsp;! ZETIS pourra l'ajouter à ton programme&nbsp;👍</p>
            ) : (
              <>
                <p>Cette notion n'est pas encore dans ton programme.</p>
                <button
                  type="button"
                  onClick={eli5.requestNotion}
                  disabled={eli5.requesting}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 font-medium text-amber-100 transition-colors hover:bg-amber-300/20 disabled:opacity-60"
                >
                  {eli5.requesting ? "…" : `📨 Dis à ZETIS d'ajouter « ${eli5.question.trim()} »`}
                </button>
              </>
            )}
          </div>
        )}

        {eli5.error && <p className="mt-3 text-sm text-rose-300">{eli5.error}</p>}
      </GlassPanel>
    </>
  );
}
