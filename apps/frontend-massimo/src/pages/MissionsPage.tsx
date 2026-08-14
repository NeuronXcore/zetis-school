import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { type Mission, type MissionStep } from "@zetis/types";
import { Spinner, groupBySubjectChapter } from "@zetis/ui";
import { NeonBackdrop } from "../components/glass";
import { PageHeader } from "../components/PageHeader";
import { DeckDisc } from "../components/DeckDisc";
import { SubjectChapterShelves } from "../components/browse/SubjectChapterShelves";
import { SubjectDeckGrid, type SubjectDeck } from "../components/SubjectDeckGrid";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";
import { type CompletionBanner, currentStep, useMissions } from "../hooks/useMissions";
import { Eli5MissionModal } from "../components/missions/Eli5MissionModal";
import { QuizMissionModal } from "../components/missions/QuizMissionModal";
import { MindmapMissionModal } from "../components/missions/MindmapMissionModal";

// Page Missions Massimo — navigation par DECKS (même logique qu'ELI5/Révision) :
//   1. accueil : gros disques ronds par matière + disque « Mission du jour » ;
//   2. matière : la liste de ses missions ;
//   3. mission : la TIMELINE horizontale des étapes — on clique l'étape courante pour la faire
//      (ELI5 / mini-quiz / carte mentale s'ouvrent EN MODALE, sans quitter /missions).
// Présentationnel : toute la logique (élection, preuve, verdict, deep-links) vit dans useMissions.

type Ui = ReturnType<typeof useMissions>;
const bySort = (a: MissionStep, b: MissionStep) => a.sort_order - b.sort_order;

// Vocabulaire visuel des étapes typées (spec + mindmap 🗺).
//
// ⚠️ Table DISTINCTE d'`ACTION_UI` (`lib/notionActionUi.ts`), et elle le reste : celle-ci habille
// les étapes d'une mission, celle-là les activités d'une notion. Deux surfaces, deux vocabulaires.
//
// Un champ `action` y a vécu jusqu'au 2026-08-12 sans jamais être rendu — seuls `icon`, `label` et
// `sub` atteignent le DOM. Il portait « Reconstruire la carte », la chaîne exacte dont on levait la
// collision dans `ACTION_UI` : un mot mort, invisible à l'écran, qui aurait fait mentir toute
// recherche future sur le sujet. Supprimé plutôt que renommé.
const STEP_META: Record<string, { icon: string; label: string; sub: string }> = {
  lesson: { icon: "📘", label: "Lire", sub: "la leçon" },
  eli5: { icon: "💡", label: "Découvrir", sub: "ZETIS t'explique" },
  vocal_explain: { icon: "🎙", label: "Verbaliser", sub: "avec tes mots" },
  quiz: { icon: "❓", label: "Mini-quiz", sub: "quelques questions" },
  mindmap: { icon: "🗺", label: "Reconstruire", sub: "de mémoire" },
};
function stepMeta(type: string) {
  return STEP_META[type] ?? { icon: "•", label: "Étape", sub: "" };
}

// mission_type → pastille enfant (jamais le jargon de source). EXPORTÉ pour son test-verrou :
// ces libellés disent ce que Massimo FAIT, jamais qui a produit la mission.
export const TYPE_META: Record<string, { label: string; cls: string }> = {
  remediation: { label: "Renforcer", cls: "bg-indigo-500/18 text-indigo-200" },
  revision: { label: "Réviser", cls: "bg-cyan-500/15 text-cyan-200" },
  progression: { label: "Découvrir", cls: "bg-fuchsia-500/15 text-fuchsia-200" },
  // « Mission de Papa » jusqu'au 2026-08-02 : c'était le seul de ces cinq libellés à nommer un
  // AUTEUR au lieu de dire ce que Massimo fait. « Sur mesure » dit que la mission a été choisie
  // pour lui sans dire par qui — et reste vrai le jour où ZETIS la commande tout seul.
  manual: { label: "Sur mesure", cls: "bg-amber-500/15 text-amber-100" },
  champion: { label: "🏆 Défi champion", cls: "bg-amber-500/20 text-amber-100" },
};

function SubjectIcon({ slug, className }: { slug: string; className?: string }) {
  const url = subjectIconFor(slug);
  return url ? (
    <img src={url} alt="" aria-hidden className={className ?? "h-5 w-5 object-contain"} />
  ) : (
    <span aria-hidden className="text-base leading-none">
      {subjectEmoji(slug)}
    </span>
  );
}

function SubjectChip({ slug, name }: { slug: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zetis-text">
      <SubjectIcon slug={slug} className="h-4 w-4 object-contain" />
      {name}
    </span>
  );
}

function MiniParcours({ steps }: { steps: MissionStep[] }) {
  const ordered = [...steps].sort(bySort);
  return (
    <span className="inline-flex items-center gap-1">
      {ordered.map((s, i) => (
        <span key={s.id} className="inline-flex items-center gap-1">
          {i > 0 && <span className="h-px w-2 bg-white/15" aria-hidden />}
          <span
            title={stepMeta(s.step_type).label}
            className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] ${
              s.status === "done"
                ? "border-emerald-400/50 bg-emerald-400/15"
                : "border-white/10 bg-white/5"
            }`}
          >
            {s.status === "done" ? "✓" : stepMeta(s.step_type).icon}
          </span>
        </span>
      ))}
    </span>
  );
}

// ── Page : orchestration des 3 écrans + modales ─────────────────────────────────
export function MissionsPage() {
  const m = useMissions();
  const location = useLocation();
  const [screen, setScreen] = useState<"home" | "subject" | "mission">("home");
  const [subjectSlug, setSubjectSlug] = useState<string | null>(null);
  const [missionId, setMissionId] = useState<number | null>(null);
  const [missionFrom, setMissionFrom] = useState<"home" | "subject">("home");

  function findMission(id: number | null): Mission | null {
    if (id == null) return null;
    if (m.today?.elected?.id === id) return m.today.elected;
    for (const g of m.groups) {
      const found = g.missions.find((x) => x.id === id);
      if (found) return found;
    }
    return m.champions.find((x) => x.id === id) ?? null;
  }

  const openSubject = (slug: string) => {
    setSubjectSlug(slug);
    setScreen("subject");
  };
  const openMission = (id: number, from: "home" | "subject") => {
    setMissionId(id);
    setMissionFrom(from);
    setScreen("mission");
  };
  const goHome = () => setScreen("home");

  // Deep-link depuis l'accueil (« Commencer → ») : `state.openMissionId` ouvre directement la
  // mission élue. Une seule fois (ref), et seulement une fois les missions chargées — sinon
  // `findMission` ne trouverait rien. Si la mission n'existe plus (terminée entre-temps), on
  // reste sereinement sur l'accueil des missions plutôt que d'afficher une erreur.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || m.loading) return;
    const requested = (location.state as { openMissionId?: number } | null)?.openMissionId;
    if (requested == null) return;
    deepLinkDone.current = true;
    if (findMission(requested)) openMission(requested, "home");
  }, [m.loading, location.state]);

  return (
    <div className="relative mx-auto max-w-2xl">
      <NeonBackdrop />
      <div className="relative">
        {/* Verdict de la mission qu'on vient de terminer — deux issues, toutes deux positives. */}
        {m.completion && <CompletionCard completion={m.completion} onDismiss={m.dismissCompletion} />}

        {m.loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : m.error ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl">
            <p className="text-sm text-zetis-muted">{m.error}</p>
            <button
              type="button"
              onClick={m.reload}
              className="mt-3 text-sm font-semibold text-cyan-300 hover:underline"
            >
              Réessayer
            </button>
          </div>
        ) : screen === "home" ? (
          <HomeScreen
            m={m}
            onSubject={openSubject}
            onElected={() => m.today?.elected && openMission(m.today.elected.id, "home")}
            onChampion={() => m.champions[0] && openMission(m.champions[0].id, "home")}
          />
        ) : screen === "subject" ? (
          <SubjectScreen
            m={m}
            slug={subjectSlug}
            onBack={goHome}
            onMission={(id) => openMission(id, "subject")}
          />
        ) : (
          <MissionScreen
            m={m}
            mission={findMission(missionId)}
            onBack={() => (missionFrom === "subject" && subjectSlug ? openSubject(subjectSlug) : goHome())}
          />
        )}

        {/* Activité de l'étape courante EN MODALE — Massimo ne quitte pas /missions. */}
        {m.activeActivity?.kind === "eli5" && (
          <Eli5MissionModal
            mission={m.activeActivity.mission}
            step={m.activeActivity.step}
            onStepDone={m.onStepDone}
            onClose={m.closeActivity}
          />
        )}
        {m.activeActivity?.kind === "quiz" && (
          <QuizMissionModal
            mission={m.activeActivity.mission}
            step={m.activeActivity.step}
            onStepDone={m.onStepDone}
            onClose={m.closeActivity}
          />
        )}
        {m.activeActivity?.kind === "mindmap" && (
          <MindmapMissionModal
            mission={m.activeActivity.mission}
            step={m.activeActivity.step}
            onStepDone={m.onStepDone}
            onClose={m.closeActivity}
          />
        )}
      </div>
    </div>
  );
}

// ── Écran 1 — accueil : decks matières + « Mission du jour » ─────────────────────
function HomeScreen({
  m,
  onSubject,
  onElected,
  onChampion,
}: {
  m: Ui;
  onSubject: (slug: string) => void;
  onElected: () => void;
  onChampion: () => void;
}) {
  const elected = m.today?.elected ?? null;
  const decks: SubjectDeck[] = [
    ...m.groups.map((g) => ({
      slug: g.slug,
      name: g.name,
      count: g.missions.length,
      hint: `${g.missions.length} mission${g.missions.length > 1 ? "s" : ""}`,
    })),
    ...m.upToDate.map((s) => ({ slug: s.slug, name: s.name, count: 0, atDay: true })),
  ];

  // Disque hero « Mission du jour » (comme « Question libre » d'ELI5) → ouvre l'élue directement ;
  // à côté, le disque « Défi champion 🏆 » (ADR-0022) quand un défi croisé attend Massimo.
  const lead = (
    <>
      <DeckDisc
        hero
        hideBadge
        count={0}
        emoji="🎯"
        title="Mission du jour"
        subtitle={elected ? elected.title : "Rien d'obligatoire"}
        fallbackInitial="🎯"
        onClick={elected ? onElected : undefined}
      />
      {m.champions.length > 0 && (
        <DeckDisc
          hero
          hideBadge
          count={0}
          emoji="🏆"
          title="Défi champion"
          subtitle={
            m.champions.length > 1 ? `${m.champions.length} défis à relever` : "Plusieurs matières"
          }
          fallbackInitial="🏆"
          onClick={onChampion}
        />
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title="🎯 Mes missions"
        subtitle="Attaque la mission du jour, ou choisis une matière."
      />
      <SubjectDeckGrid subjects={decks} onSelect={onSubject} lead={lead} />

      {m.completed.length > 0 && (
        <>
          <SectionTitle>✨ Terminées aujourd'hui</SectionTitle>
          {m.completed.map((c) => (
            <DoneCard key={c.mission_id} completed={c} slug={m.slugForSubject(c.subject)} />
          ))}
        </>
      )}

      <ZetisNote />
    </>
  );
}

// ── Écran 2 — matière : la liste de ses missions ────────────────────────────────
function SubjectScreen({
  m,
  slug,
  onBack,
  onMission,
}: {
  m: Ui;
  slug: string | null;
  onBack: () => void;
  onMission: (id: number) => void;
}) {
  const [cherche, setCherche] = useState("");
  const group = m.groups.find((g) => g.slug === slug);
  const name = group?.name ?? slug ?? "";

  // 🔴 **Une seule source, toutes les matières** (ADR-0057 §9(3)) : la recherche traverse, donc
  // elle part de TOUTES les missions et non des seules ouvertes. Sans recherche, on ne montre que
  // la matière ouverte — l'écran ne change pas de nature, il gagne un niveau.
  const groupes = useMemo(() => {
    const source = cherche ? m.groups : m.groups.filter((g) => g.slug === slug);
    const items = source.flatMap((g) =>
      g.missions.map((msn) => ({ ...msn, title: msn.title, subject_slug: g.slug })),
    );
    return groupBySubjectChapter(items, cherche);
  }, [m.groups, slug, cherche]);

  return (
    <>
      <ScreenHeader onBack={onBack} back="Matières">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5">
          <SubjectIcon slug={slug ?? ""} className="h-5 w-5 object-contain" />
        </span>
        {name}
      </ScreenHeader>

      {group && group.missions.length > 0 ? (
        <SubjectChapterShelves
          groups={groupes}
          search={cherche}
          onSearchChange={setCherche}
          searchPlaceholder="Rechercher une mission…"
          emptyLabel={(q) => `Aucune mission ne correspond à « ${q} ».`}
          itemKey={(msn) => msn.id}
          gridClassName="space-y-3"
          // La matière est DÉJÀ choisie : une étagère close cacherait ce que Massimo vient de
          // demander (défaut trouvé sur `/quiz?subject=…`).
          defaultOpen
          // 🔴 L'écran NOMME déjà la matière, dans son en-tête : la répéter en tête d'étagère
          // l'écrirait deux fois. Mais **dès qu'on cherche**, elle redevient la seule chose qui
          // dise d'où vient un résultat — y compris quand il n'y en a qu'un.
          //
          // ⚠️ `&& groupes.length > 1` a été écrit ici puis retiré : c'est le défaut EXACT corrigé
          // sur `/fiches` le 2026-08-14 — chercher « participe » depuis les Maths affichait une
          // mission de Français **sans rien qui dise qu'elle en venait**. Son propre test l'a
          // démenti dans la minute. *La question n'est pas « est-ce répété ? » mais « qu'est-ce
          // que ça dit ici ? ».*
          showSubjectHeader={Boolean(cherche)}
          renderItem={(msn) => (
            <MissionRow mission={msn} onClick={() => onMission(msn.id)} />
          )}
        />
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-emerald-300">
          ✓ À jour, bravo !
        </p>
      )}
    </>
  );
}

// Carte-ligne d'une mission dans la liste matière (→ ouvre l'écran mission).
function MissionRow({ mission, onClick }: { mission: Mission; onClick: () => void }) {
  const type = TYPE_META[mission.mission_type] ?? {
    label: mission.mission_type,
    cls: "bg-white/10 text-zetis-muted",
  };
  const done = mission.steps.filter((s) => s.status === "done").length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:border-white/20"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zetis-text">{mission.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-zetis-muted">
          <span className={`rounded-md px-2 py-0.5 font-semibold ${type.cls}`}>{type.label}</span>
          {mission.status === "planned" && (
            <span className="rounded-full border border-emerald-300/50 bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100 shadow">
              ✨ new
            </span>
          )}
          {/* Aucune signature d'auteur (retiré le 2026-08-02) : une mission arrive dans la voix
              de ZETIS, quel que soit qui l'a créée. « 👤 par Papa » aurait dû changer d'auteur le
              jour où ZETIS produit seul — la voix du monde de Massimo doit tenir dans le temps. */}
          <span>⏱ {mission.estimated_minutes} min</span>
          <span className="font-semibold text-amber-300">+{mission.xp_reward} XP</span>
          <MiniParcours steps={mission.steps} />
          {done > 0 && (
            <span className="text-emerald-300">
              {done}/{mission.steps.length} fait{done > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <span aria-hidden className="text-lg text-zetis-muted">
        →
      </span>
    </button>
  );
}

// ── Écran 3 — mission : la TIMELINE horizontale des étapes ───────────────────────
function MissionScreen({
  m,
  mission,
  onBack,
}: {
  m: Ui;
  mission: Mission | null;
  onBack: () => void;
}) {
  // Mission disparue de la liste (terminée pendant la session) → petit état positif.
  if (!mission) {
    return (
      <>
        <ScreenHeader onBack={onBack} back="Missions">
          Mission
        </ScreenHeader>
        <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/5 p-8 text-center backdrop-blur-xl">
          <p className="text-3xl" aria-hidden>
            ✨
          </p>
          <p className="mt-3 font-semibold text-zetis-text">Mission terminée — bravo&nbsp;!</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 text-sm font-semibold text-cyan-300 hover:underline"
          >
            ← Revenir à mes missions
          </button>
        </div>
      </>
    );
  }

  const step = currentStep(mission);
  const isElected = m.today?.elected?.id === mission.id;
  const isChampion = mission.mission_type === "champion";
  // Champion croisée : plusieurs matières, dérivées des étapes (subject vide au niveau mission).
  const championSubjects = isChampion
    ? [...new Set(mission.steps.map((s) => s.subject).filter(Boolean))]
    : [];
  const backLabel = isElected ? "Missions" : mission.subject || "Missions";

  return (
    <>
      <ScreenHeader onBack={onBack} back={backLabel}>
        {mission.title}
      </ScreenHeader>

      {isElected && m.today?.reason && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zetis-muted">
          <span aria-hidden>💡</span>
          {m.today.reason}
        </p>
      )}
      {isChampion && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
          <span aria-hidden>🏆</span>
          Défi croisé — {championSubjects.length} matières, plusieurs outils. Tu peux le faire !
        </p>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {isChampion ? (
          championSubjects.map((name) => (
            <SubjectChip key={name} slug={m.slugForSubject(name)} name={name} />
          ))
        ) : (
          <SubjectChip slug={m.slugForSubject(mission.subject)} name={mission.subject} />
        )}
        <span className="text-sm text-zetis-muted">⏱ {mission.estimated_minutes} min</span>
        <span className="text-sm font-semibold text-amber-300">+{mission.xp_reward} XP</span>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-zetis-muted">
        Le parcours — clique l'étape à faire
      </p>
      <Timeline
        mission={mission}
        current={step}
        busy={m.busy}
        onStep={(s) => m.openStep(mission, s)}
        showSubject={isChampion}
        slugForSubject={m.slugForSubject}
      />

      {step == null && (
        <p className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-center text-sm text-emerald-300">
          🎉 Toutes les étapes sont faites&nbsp;!
        </p>
      )}
    </>
  );
}

// Timeline HORIZONTALE : chaque étape est une tuile ; l'étape courante est un bouton lumineux
// (« ▶ Faire »), les faites ✓, les suivantes « Ensuite » (l'ordre est imposé serveur).
function Timeline({
  mission,
  current,
  busy,
  onStep,
  showSubject = false,
  slugForSubject,
}: {
  mission: Mission;
  current: MissionStep | null;
  busy: boolean;
  onStep: (step: MissionStep) => void;
  // Champion croisée (ADR-0022) : chaque tuile porte un badge matière (l'étape change de matière).
  showSubject?: boolean;
  slugForSubject?: (name: string) => string;
}) {
  const ordered = [...mission.steps].sort(bySort);
  // Amène l'étape courante dans le champ (timeline scrollable) — utile sur écran étroit.
  const currentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = currentRef.current;
    if (typeof el?.scrollIntoView !== "function") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [current?.id]);
  return (
    <div className="mt-3 flex items-stretch gap-2 overflow-x-auto pb-2">
      {ordered.map((s, i) => {
        const meta = stepMeta(s.step_type);
        const done = s.status === "done";
        const isCurrent = current?.id === s.id;
        const state = done ? "Fait ✓" : isCurrent ? "▶ À toi de jouer" : "Ensuite";
        const tile = (
          <>
            {showSubject && s.subject && (
              <span className="mx-auto mb-1 flex items-center justify-center gap-1 text-[10px] text-zetis-muted">
                <SubjectIcon slug={slugForSubject?.(s.subject) ?? ""} className="h-3.5 w-3.5 object-contain" />
                <span className="max-w-[80px] truncate">{s.subject}</span>
              </span>
            )}
            <span
              className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl border text-2xl ${
                done
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                  : isCurrent
                    ? "border-fuchsia-400/50 bg-fuchsia-400/15"
                    : "border-white/10 bg-white/5"
              }`}
            >
              {done ? "✓" : meta.icon}
            </span>
            <p className="mt-2 text-sm font-semibold text-zetis-text">{meta.label}</p>
            <p className="text-[11px] text-zetis-muted">
              {showSubject && s.skill_name ? s.skill_name : meta.sub}
            </p>
            <p
              className={`mt-1.5 text-xs font-semibold ${
                done ? "text-emerald-300" : isCurrent ? "text-fuchsia-300" : "text-zetis-muted"
              }`}
            >
              {state}
            </p>
          </>
        );
        return (
          <div key={s.id} ref={isCurrent ? currentRef : undefined} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`h-0.5 w-4 shrink-0 ${done || isCurrent ? "bg-emerald-400/50" : "bg-white/15"}`}
              />
            )}
            {isCurrent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onStep(s)}
                className="w-28 shrink-0 rounded-2xl border border-fuchsia-400/40 bg-white/5 px-2 py-3 text-center shadow-[0_0_22px_rgba(232,121,249,0.15)] transition enabled:hover:-translate-y-0.5 disabled:opacity-60"
              >
                {tile}
              </button>
            ) : (
              <div
                className={`w-28 shrink-0 rounded-2xl px-2 py-3 text-center ${done ? "" : "opacity-70"}`}
              >
                {tile}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Briques partagées ───────────────────────────────────────────────────────────
function ScreenHeader({
  onBack,
  back,
  children,
}: {
  onBack: () => void;
  back: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zetis-text transition-colors hover:bg-white/10"
      >
        ← {back}
      </button>
      <h1 className="flex min-w-0 items-center gap-2 text-xl font-bold">{children}</h1>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 mt-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.1em] text-zetis-muted">
      {children}
      <span className="h-px flex-1 bg-white/10" aria-hidden />
    </div>
  );
}

function ZetisNote() {
  return (
    <div className="mt-8 flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zetis-muted">
      <span
        aria-hidden
        className="h-9 w-9 shrink-0 rounded-full border border-indigo-400/40 bg-[radial-gradient(circle_at_35%_30%,#818cf8,#312e81)] shadow-[0_0_16px_rgba(99,102,241,0.35)]"
      />
      <p>Pas besoin de tout faire aujourd'hui. Une mission, tranquillement — c'est déjà super. 🚀</p>
    </div>
  );
}

function DoneCard({
  completed,
  slug,
}: {
  completed: { title: string; subject: string; verdict: "acquired" | "review_later"; xp: number };
  slug: string;
}) {
  const acquired = completed.verdict === "acquired";
  return (
    <div className="mb-3 flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur-xl">
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
          acquired
            ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-300"
            : "border-indigo-400/40 bg-indigo-400/12 text-indigo-200"
        }`}
      >
        {acquired ? "✓ Notion bien en place" : "🌙 On la reverra bientôt"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zetis-text">{completed.title}</p>
        {completed.subject && (
          <span className="mt-1 inline-flex">
            <SubjectChip slug={slug} name={completed.subject} />
          </span>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold text-amber-300">+{completed.xp} XP</span>
    </div>
  );
}

function CompletionCard({
  completion,
  onDismiss,
}: {
  completion: CompletionBanner;
  onDismiss: () => void;
}) {
  const acquired = completion.verdict === "acquired";
  const champion = completion.champion;
  return (
    <div
      className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${
        champion
          ? "border-amber-300/50 bg-amber-400/10"
          : acquired
            ? "border-emerald-400/40 bg-emerald-400/10"
            : "border-indigo-400/40 bg-indigo-400/10"
      }`}
    >
      <span aria-hidden className="text-2xl">
        {champion ? "🏆" : acquired ? "🎉" : "🌙"}
      </span>
      <div className="flex-1">
        <p className="font-semibold text-zetis-text">
          {champion
            ? "🏆 Défi champion relevé !"
            : acquired
              ? "✓ Notion bien en place"
              : "🌙 On la reverra bientôt, tranquille"}
        </p>
        <p className="text-sm text-zetis-muted">
          {champion ? "Bravo champion — " : "Mission terminée — bravo ! "}+{completion.xp} XP
        </p>
        {/* Le mot de la fin, servi par ZETIS : ce qui a été gagné et le prochain pas. Absent si
            l'appel a échoué — une fin de mission ne doit jamais dépendre de lui. */}
        {completion.wrapUp && (
          <p className="mt-1 text-sm text-zetis-text">
            {completion.wrapUp.title}
            {completion.wrapUp.subtitle && (
              <span className="text-zetis-muted"> {completion.wrapUp.subtitle}</span>
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-zetis-muted hover:text-zetis-text"
        aria-label="Fermer"
      >
        ✕
      </button>
    </div>
  );
}
