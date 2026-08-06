import { ConfirmDialog } from "@zetis/ui";
import { type ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { FOCUS_RING, useFocusTarget } from "../hooks/useFocusTarget";
import { ProgressBar, useEstimatedProgress } from "../components/ProgressBar";
import { type Equipping, useCouncilClass } from "../hooks/useCouncilClass";
import {
  type CouncilRecommendation,
  type CouncilSubject,
  estEvolutionDatee,
  libelleRapport,
  libelleTransition,
  rapportSansHistoriqueDate,
  reportToMarkdown,
} from "../lib/councilClass";
import { COUNCIL_PERIOD_LABEL, isDashboardPeriod } from "../lib/dashboardDerive";
import type { Subject } from "../lib/subjects";
import { subjectEmoji } from "../lib/subjectEmoji";
import { subjectIconFor } from "../lib/subjectIcons";

// Conseil de classe IA Papa (ADR-0020/0021) — narration LLM locale + équipement d'une notion.
// Composant présentationnel ; toute la logique vit dans `useCouncilClass`.

const GEN_MS = 18000; // génération d'une synthèse (barre estimée).
const EQUIP_MS = 90000; // équipement d'une notion : jusqu'à 5 générations LLM locales.

// Pipeline de génération (concept IA) : les 5 pièces du kit s'allument une à une.
const KIT_STEPS = [
  { key: "cours", label: "Cours", icon: "📖" },
  { key: "fiche", label: "Fiche", icon: "📄" },
  { key: "srs", label: "Cartes", icon: "🗂️" },
  { key: "quiz", label: "Quiz", icon: "✅" },
  { key: "mindmap", label: "Carte mentale", icon: "🧠" },
];

// Animations dorées « IA » — keyframes injectées localement (aucune dépendance au CSS de l'app).
const AI_KEYFRAMES = `
@keyframes zetis-ai-flow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes zetis-ai-sweep { 0% { transform: translateX(-140%); } 100% { transform: translateX(360%); } }
@keyframes zetis-ai-glow { 0%,100% { box-shadow: 0 0 10px -2px rgba(251,191,36,0.35); } 50% { box-shadow: 0 0 26px 0 rgba(251,191,36,0.85); } }
@keyframes zetis-ai-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.18); } }
@keyframes zetis-done-in { 0% { opacity: 0; transform: translateY(10px) scale(0.94); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes zetis-check-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.25); } 100% { transform: scale(1); opacity: 1; } }`;

/**
 * Barre d'équipement d'UNE notion — dorée, animée, thème « génération IA » :
 * dégradé d'or qui coule + faisceau de scan + pipeline des 5 pièces qui s'illuminent.
 * Remontée par `key` à chaque notion → le % repart de 0.
 */
function EquipProgress({ equipping }: { equipping: Equipping }) {
  const pct = useEstimatedProgress(true, EQUIP_MS);
  const seg = 100 / KIT_STEPS.length;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-amber-400/50 bg-gradient-to-b from-amber-500/10 to-transparent p-4"
      style={{ animation: "zetis-ai-glow 2.6s ease-in-out infinite" }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <span className="text-lg" style={{ animation: "zetis-ai-pulse 1.4s ease-in-out infinite" }}>
            🧠
          </span>
          ZETIS génère le kit — <span className="text-amber-100">{equipping.name}</span>
          <span className="text-amber-300/70">
            ({equipping.index}/{equipping.total})
          </span>
        </p>
        <span
          className="shrink-0 text-lg font-bold tabular-nums text-amber-300"
          style={{ textShadow: "0 0 14px rgba(251,191,36,0.75)" }}
        >
          {Math.round(pct)}%
        </span>
      </div>

      <div className="relative h-3 overflow-hidden rounded-full bg-amber-950/50 ring-1 ring-amber-400/20">
        <div
          className="relative h-full overflow-hidden rounded-full"
          style={{
            width: `${pct}%`,
            backgroundImage: "linear-gradient(90deg,#f59e0b,#fcd34d,#fde68a,#fbbf24,#f59e0b)",
            backgroundSize: "200% 100%",
            animation: "zetis-ai-flow 2.2s linear infinite",
          }}
        >
          <span
            className="absolute inset-y-0 w-1/3"
            style={{
              animation: "zetis-ai-sweep 1.5s ease-in-out infinite",
              background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.65),transparent)",
            }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {KIT_STEPS.map((st, i) => {
          const lit = pct >= i * seg;
          const active = lit && pct < (i + 1) * seg;
          return (
            <span
              key={st.key}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                lit
                  ? "border-amber-400/70 bg-amber-400/15 text-amber-200"
                  : "border-papa-border text-papa-muted/50"
              }`}
              style={active ? { animation: "zetis-ai-glow 1.1s ease-in-out infinite" } : undefined}
            >
              {st.icon} {st.label}
              {active ? " …" : lit ? " ✓" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Logo circulaire de matière (icône PNG ronde qu'on a créée, repli emoji), grande taille. */
/** Bloc d'une matière, avec sa cible de lien profond.
 *
 *  Arriver « quelque part » depuis le nuage « Où agir » ne sert à rien si la matière visée est la
 *  sixième de la liste : le bloc est amené au centre de l'écran et entouré. Purement visuel —
 *  aucune action n'est déclenchée sur la matière ciblée (ADR-0028 §7 : le clic n'ouvre jamais une
 *  génération). */
function SubjectBlock({
  subject,
  focused,
  children,
}: {
  subject: Subject | undefined;
  focused: boolean;
  children: ReactNode;
}) {
  const ref = useFocusTarget<HTMLDivElement>(focused);
  return (
    <div ref={ref} className="flex items-start gap-3">
      <SubjectDisc subject={subject} />
      <div
        className={`flex-1 rounded-xl border bg-papa-surface p-4 transition-colors motion-reduce:transition-none ${
          focused ? FOCUS_RING : "border-papa-border"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function SubjectDisc({ subject }: { subject: Subject | undefined }) {
  const url = subject ? subjectIconFor(subject.slug) : undefined;
  const frame = "h-[72px] w-[72px] shrink-0 rounded-full border-2 border-amber-400";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        className={`${frame} bg-papa-surface-2 object-contain p-1`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${frame} flex items-center justify-center bg-papa-surface-2 text-4xl leading-none`}
    >
      {subject ? subjectEmoji(subject.slug, subject.icon) : "📚"}
    </span>
  );
}

/** Coche dorée du kit (✓ générée/présente, ✕ échec, vide sinon). */
function KitCheck({ checked, failed }: { checked: boolean; failed: boolean }) {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
        failed
          ? "border-red-400 text-red-300"
          : checked
            ? "border-amber-400 bg-amber-400/20 text-amber-300"
            : "border-papa-border text-transparent"
      }`}
      style={checked && !failed ? { animation: "zetis-check-pop 0.35s ease-out" } : undefined}
    >
      {failed ? "✕" : checked ? "✓" : ""}
    </span>
  );
}

/** Popup éphémère de fin : coche ce qui a été généré par notion (auto-dismiss + clic). */
function EquipDonePopup({
  results,
  missionCount,
  onClose,
}: {
  results: import("../lib/councilClass").EquipNotionResult[];
  missionCount: number;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Kit généré"
        className="w-full max-w-md rounded-2xl border border-amber-400/60 bg-card p-5"
        style={{ animation: "zetis-done-in 0.35s ease-out, zetis-ai-glow 2.6s ease-in-out infinite" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl" style={{ animation: "zetis-ai-pulse 1.4s ease-in-out infinite" }} aria-hidden>
            ✨
          </span>
          <h2 className="text-lg font-bold text-amber-200">Kit prêt !</h2>
        </div>
        <p className="mt-1 text-sm text-papa-muted">
          {missionCount} mission{missionCount > 1 ? "s" : ""} créée{missionCount > 1 ? "s" : ""} et
          validée{missionCount > 1 ? "s" : ""}.
        </p>

        <div className="mt-3 space-y-2.5">
          {results.map((res) => (
            <div key={res.skill_id}>
              <p className="text-sm font-medium text-papa-fg">{res.skill_name}</p>
              {res.has_lesson ? (
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {KIT_STEPS.map((st) => {
                    const failed = res.errors.some((e) => e.piece === st.key);
                    const done =
                      !failed &&
                      (res.generated.includes(st.key) || res.skipped.includes(st.key));
                    return (
                      <span key={st.key} className="flex items-center gap-1.5">
                        <KitCheck checked={done} failed={failed} />
                        <span className={done ? "text-papa-fg" : "text-papa-muted/50"}>
                          {st.icon} {st.label}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-amber-300">{res.reason}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ⚠️ `evolutionSansHistoriqueDate` vivait ici, en DOUBLE de `rapportSansHistoriqueDate` de
// `lib/councilClass` — et les deux répondaient l'INVERSE sur une version illisible. Une seule
// implémentation désormais ; voir là-bas pour la doctrine (sur un doute, on signale).

/**
 * L'évolution récente, sous ses trois formes (ADR-0040 §8).
 *
 * 🔴 **Les bascules se rendent même sans commentaire.** Elles sont la MESURE ; le commentaire n'en
 * est que la lecture. Un écran qui n'afficherait la section que lorsque le modèle a parlé ferait
 * dépendre une donnée serveur du bon vouloir d'un LLM — exactement l'inversion que tout ce
 * chantier corrige.
 */
function Evolution({
  evolution,
  marquerNonDatee,
}: {
  evolution: CouncilSubject["recent_evolution"];
  marquerNonDatee: boolean;
}) {
  if (evolution === null) {
    return (
      <p className="mt-1 text-sm text-papa-muted">
        <span className="text-sky-300">Évolution :</span> aucune bascule de palier sur la trace
        disponible — absence de trace, pas absence de mouvement.
      </p>
    );
  }

  // Rapport FIGÉ avant le Lot 3 : sa prose n'était adossée à rien. On ne la réécrit pas, on la
  // SIGNALE — la marque s'éteint d'elle-même à mesure que les rapports datés s'accumulent.
  if (!estEvolutionDatee(evolution)) {
    return (
      <p className="mt-1 text-sm">
        <span className="text-sky-300">Évolution :</span> {evolution}
        {marquerNonDatee && (
          <span className="ml-1 text-xs text-papa-muted">
            (évolution rédigée sans historique daté)
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="mt-1 text-sm">
      <p>
        <span className="text-sky-300">Évolution :</span>{" "}
        <span className="text-papa-muted">
          {evolution.transitions.length} bascule{evolution.transitions.length > 1 ? "s" : ""} de
          palier sur la trace disponible depuis le {evolution.since ?? "?"}
        </span>
      </p>
      {/* 🔴 Le détail RECOMPOSE le nombre annoncé, comme partout ailleurs dans ce chantier. */}
      <ul className="mt-1 space-y-0.5">
        {evolution.transitions.map((t) => (
          <li key={`${t.skill_id}-${t.changed_at}`} className="flex flex-wrap items-baseline gap-2">
            <span className="tabular-nums text-xs text-papa-muted">{t.changed_at}</span>
            <span className="font-medium">{t.skill_name}</span>
            <span className="text-xs text-papa-muted">{libelleTransition(t)}</span>
          </li>
        ))}
      </ul>
      {evolution.comment && <p className="mt-1">{evolution.comment}</p>}
    </div>
  );
}

function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConseilClasseIAPage() {
  const c = useCouncilClass();
  // Lien profond depuis le nuage « Où agir » du dashboard. Périmètre STRICT (ADR-0028 §7) :
  // lecture de l'URL et présélection, rien d'autre. Ni la génération, ni le cycle de vie, ni les
  // routes backend du Conseil ne sont touchés — l'ADR-0020 n'est pas rouvert.
  const [searchParams] = useSearchParams();
  const focusedSubjectSlug = searchParams.get("subject");
  // Le deep-link porte la période parce que sans elle, le Conseil raconterait un trimestre quand
  // Papa regardait sept jours (ADR-0028 §7). Ce n'est qu'une PRÉSÉLECTION : le champ reste libre,
  // et rien n'est généré à l'arrivée.
  //
  // La table vit dans `dashboardDerive` et non ici : typée par `DashboardPeriod`, elle rend
  // l'ajout d'une fenêtre cassant à la compilation. La copie locale, typée `Record<string, string>`,
  // avalait `365` en silence.
  const [period, setPeriod] = useState(() => {
    const raw = searchParams.get("period");
    return isDashboardPeriod(raw) ? COUNCIL_PERIOD_LABEL[raw] : "Trimestre 1";
  });
  const [pendingReco, setPendingReco] = useState<CouncilRecommendation | null>(null);
  const [pendingChampion, setPendingChampion] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const pct = useEstimatedProgress(c.generating, GEN_MS);
  const subjectById = new Map(c.subjects.map((s) => [s.id, s]));
  const busy = c.equipping !== null;
  // Calculé ici, hors du rendu : `c.report` est narrowé par le `!c.report ?` du JSX, mais la
  // narrowing se perd dans la closure du `.map` sur les matières (propriété d'un objet mutable).
  const evolutionNonDatee = c.report ? rapportSansHistoriqueDate(c.report.prompt_version) : false;

  // Popup éphémère de fin : apparaît quand le flux équipe+crée se termine, s'efface seul après 6 s.
  useEffect(() => {
    if (!c.created || c.equipResults.length === 0) return;
    setShowDone(true);
    const t = setTimeout(() => setShowDone(false), 6000);
    return () => clearTimeout(t);
  }, [c.created, c.equipResults]);

  return (
    <div className="mx-auto max-w-4xl">
      <style>{AI_KEYFRAMES}</style>
      <PageHeader
        title="Conseil de classe IA"
        subtitle="Synthèse par matière, à partir des résultats réels de Massimo."
        actions={
          <>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Période"
              // ⚠️ Ce champ NOMME le rapport, il ne sélectionne rien — voir la phrase sous le
              // titre. Le `title` le redit au survol, là où la main est déjà.
              title="Étiquette du rapport — elle ne restreint pas les données"
              placeholder="Nommer ce rapport"
              className="rounded-lg border border-papa-border bg-papa-surface px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void c.generate(period)}
              disabled={c.generating}
              className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg disabled:opacity-60"
            >
              {c.generating ? "Génération…" : "Générer la synthèse"}
            </button>
            <button
              type="button"
              onClick={() =>
                c.report &&
                downloadMarkdown(
                  `conseil-${c.report.period.replace(/\s+/g, "-").toLowerCase()}.md`,
                  reportToMarkdown(c.report),
                )
              }
              disabled={!c.report || c.report.subjects.length === 0}
              className="rounded-lg border border-papa-border px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Exporter Markdown
            </button>
          </>
        }
      />

      {/* 🔴 CE QUE LA PÉRIODE N'EST PAS (2026-08-06). Le champ ci-dessus est un LIBELLÉ LIBRE : il
          ne restreint aucune donnée, et le snapshot figé de chaque rapport le dit déjà en base
          (« `period` est une étiquette, elle ne sélectionne aucune donnée »). Ne pas l'écrire à
          l'écran a produit un rapport intitulé « 7 derniers jours » sur une évidence qui couvre
          tout l'historique — figé, donc rétroactivement indiscernable du vrai.
          ⚠️ Elle reste transportée depuis le dashboard (le lien profond garde son sens) : ce
          qu'on corrige est la LECTURE, pas le transport. */}
      <p className="mb-4 rounded-lg border border-papa-border bg-papa-surface-2/50 px-3 py-2 text-xs text-papa-muted">
        La période est une <strong className="font-semibold">étiquette</strong> : elle nomme le
        rapport, elle ne restreint pas les données. Le conseil s'appuie sur l'
        <strong className="font-semibold">état courant</strong> de la maîtrise, sans fenêtre —
        seules les <strong className="font-semibold">bascules de palier</strong> sont datées, et
        chaque matière annonce depuis quand.
      </p>

      {c.error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {c.error}
        </div>
      )}

      {c.generating && (
        <div className="mb-4">
          <ProgressBar pct={pct} label="🧠 Rédaction du conseil de classe (LLM local)…" />
        </div>
      )}

      {c.equipping && (
        <div key={c.equipping.index} className="mb-4">
          <EquipProgress equipping={c.equipping} />
        </div>
      )}

      {/* 🔴 Une pastille dit QUEL rapport elle ouvre (2026-08-06). Elles n'affichaient que
          `period` : neuf rapports lisaient « Trimestre 1 · Trimestre 1 · 7 derniers jours · … »,
          et un historique où rien ne se distingue n'est pas un historique. La date et la matière
          étaient DÉJÀ servies — il manquait de les écrire.
          ⚠️ Visible dès le PREMIER rapport (`> 0`, pas `> 1`) : la bande est la seule porte vers
          les anciens, et la masquer tant qu'il n'y en a qu'un la rend introuvable au moment où
          Papa apprend qu'elle existe. */}
      {c.history.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-papa-muted">
          <span>Rapports :</span>
          {c.history.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => void c.openReport(h.id)}
              // ⚠️ `title` porte l'étiquette de période : elle a sa place, mais PAS au premier
              // plan — c'est un libellé libre qui ne restreint aucune donnée, et le mettre en
              // avant est justement ce qui faisait croire le contraire.
              title={`${h.period} · ${h.subjects_count} matière${h.subjects_count > 1 ? "s" : ""}`}
              className={`rounded-full border px-2 py-0.5 ${
                c.report?.id === h.id
                  ? "border-papa-accent text-papa-accent"
                  : "border-papa-border hover:border-papa-accent"
              }`}
            >
              {libelleRapport(h)}
              {rapportSansHistoriqueDate(h.prompt_version) && (
                // Une étoile discrète plutôt qu'une phrase : la marque doit tenir dans une
                // pastille, et le détail s'écrit en toutes lettres à l'ouverture du rapport.
                <span
                  aria-label="évolution rédigée sans historique daté"
                  title="évolution rédigée sans historique daté"
                  className="ml-1 text-papa-warn"
                >
                  ✳
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {c.loading ? (
        <p className="text-sm text-papa-muted">Chargement…</p>
      ) : !c.report ? (
        <EmptyState />
      ) : (
        <>
          <section className="mb-4 rounded-xl border border-papa-border bg-papa-surface-2 p-4 text-sm">
            <p className="font-semibold">Résumé global — {c.report.period}</p>
            <p className="mt-1 text-papa-muted">{c.report.global_summary}</p>
          </section>

          {/* Défi champion croisé (ADR-0022 §8) : agrégat des recos ≥ 2 matières → 1 mission champion. */}
          {c.hasActiveChampion ? (
            <section className="mb-4 rounded-xl border border-papa-border bg-papa-surface-2 p-3 text-sm text-papa-muted">
              🏆 Un défi champion est déjà en cours pour Massimo.
            </section>
          ) : (
            c.championSuggestion && (
              <section className="mb-4 rounded-xl border border-amber-300/40 bg-amber-400/5 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="text-2xl" aria-hidden>
                    🏆
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-amber-100">Défi champion croisé</p>
                    <p className="mt-0.5 text-sm text-papa-muted">
                      Un parcours unique reliant{" "}
                      {new Set(c.championSuggestion.notions.map((n) => n.subject_name)).size} matières
                      pour renforcer ces notions ensemble — plusieurs outils, XP majoré.
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {c.championSuggestion.notions.map((n) => (
                        <li
                          key={n.skill_id}
                          className="rounded-full border border-papa-border bg-papa-surface px-3 py-1 text-xs text-papa-text"
                        >
                          <span className="text-papa-muted">{n.subject_name} · </span>
                          {n.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingChampion(true)}
                    className="shrink-0 rounded-lg border border-amber-300/50 bg-amber-400/15 px-3 py-1.5 text-sm font-semibold text-amber-100 hover:bg-amber-400/25 disabled:opacity-45"
                  >
                    🏆 Créer ce défi champion
                  </button>
                </div>
              </section>
            )
          )}

          {c.report.subjects.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {c.report.subjects.map((s) => (
                <SubjectBlock
                  key={s.subject_id}
                  subject={subjectById.get(s.subject_id)}
                  focused={
                    focusedSubjectSlug !== null &&
                    subjectById.get(s.subject_id)?.slug === focusedSubjectSlug
                  }
                >
                  <p className="font-semibold">{s.subject_name}</p>
                  {s.strengths && (
                    <p className="mt-1 text-sm">
                      <span className="text-emerald-300">Points forts :</span> {s.strengths}
                    </p>
                  )}
                  {s.to_reinforce && (
                    <p className="mt-1 text-sm">
                      <span className="text-amber-300">À renforcer :</span> {s.to_reinforce}
                    </p>
                  )}
                  {/* L'absence s'ÉCRIT (ADR-0040 §8.4). Ne rien rendre laisserait lire « aucun
                      mouvement » là où il faut lire « aucune trace » — les deux ne se corrigent
                      pas l'un l'autre. */}
                  <Evolution
                    evolution={s.recent_evolution}
                    marquerNonDatee={evolutionNonDatee}
                  />

                  {s.recommendations.map((r, i) => (
                    <RecommendationRow
                      key={`${s.subject_id}-${i}`}
                      reco={r}
                      disabled={busy}
                      done={
                        r.skill_ids.length > 0 &&
                        r.skill_ids.every((id) => c.generatedSkillIds.has(id))
                      }
                      onCreate={() => setPendingReco(r)}
                    />
                  ))}
                </SubjectBlock>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingReco !== null}
        tone="important"
        title="Générer le contenu et créer la mission ?"
        confirmLabel="Générer et créer"
        onCancel={() => setPendingReco(null)}
        onConfirm={() => {
          const reco = pendingReco;
          setPendingReco(null);
          if (reco) void c.equipAndCreateMissions(reco.skill_ids, reco.skill_names);
        }}
      >
        <p>
          ZETIS va générer et valider le kit pédagogique complet — <b>cours, fiche, cartes de
          révision, quiz et carte mentale</b> — pour{" "}
          {pendingReco ? pendingReco.skill_names.join(", ") : ""}, puis créer la mission. Le contenu
          généré sera <b>validé automatiquement</b> (tu pourras l'éditer ensuite).
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingChampion}
        tone="important"
        title="Créer ce défi champion croisé ?"
        confirmLabel="Générer et créer le défi"
        onCancel={() => setPendingChampion(false)}
        onConfirm={() => {
          setPendingChampion(false);
          const s = c.championSuggestion;
          if (s) void c.equipAndCreateChampion(s.skillIds, s.notions.map((n) => n.name));
        }}
      >
        <p>
          ZETIS va équiper chaque notion (<b>cours, fiche, cartes, quiz, carte mentale</b> —
          auto-validés) puis composer <b>un défi champion unique</b> reliant plusieurs matières
          (parcours multi-outils, XP majoré). Le contenu sera <b>validé automatiquement</b>
          (éditable ensuite).
        </p>
      </ConfirmDialog>

      {showDone && c.created && (
        <EquipDonePopup
          results={c.equipResults}
          missionCount={c.created.count}
          onClose={() => setShowDone(false)}
        />
      )}
    </div>
  );
}

function RecommendationRow({
  reco,
  disabled,
  done,
  onCreate,
}: {
  reco: CouncilRecommendation;
  disabled: boolean;
  done: boolean;
  onCreate: () => void;
}) {
  return (
    <div
      className={`relative mt-3 flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
        done ? "border-amber-400/60 bg-amber-400/10" : "border-papa-border bg-papa-surface-2"
      }`}
    >
      {/* Badge circulaire doré « missions générées » — dans la gouttière gauche (hors card),
          centré sous la colonne du logo matière (disc 72px + gap 12px + p-4 16px) et en face
          de la notion (centré verticalement sur la ligne). */}
      {done && (
        <span
          title="Missions générées"
          aria-label="Missions générées"
          className="absolute right-full top-1/2 mr-[40px] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/20 text-xl"
          style={{ animation: "zetis-done-in 0.35s ease-out, zetis-ai-glow 2.6s ease-in-out infinite" }}
        >
          🎯
        </span>
      )}
      <div className="text-sm">
        <p className={done ? "font-medium text-amber-200" : "text-papa-accent-2"}>
          {reco.skill_names.join(" · ")}
        </p>
        <p className="mt-0.5 text-papa-muted">{reco.justification}</p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled || done}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-100 ${
          done
            ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/60"
            : "bg-papa-accent text-papa-bg disabled:opacity-60"
        }`}
      >
        {done
          ? "Générées ✓"
          : `Créer ${reco.skill_ids.length > 1 ? "ces missions" : "cette mission"}`}
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-papa-border bg-papa-surface p-6 text-center text-sm text-papa-muted">
      Aucun conseil de classe pour l'instant. Lance quelques activités avec Massimo, puis clique
      « Générer la synthèse » : ZETIS s'appuiera sur ses résultats réels.
    </div>
  );
}
