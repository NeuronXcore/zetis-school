import { ConfirmDialog } from "@zetis/ui";
import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { ProgressBar, useEstimatedProgress } from "../components/ProgressBar";
import { type Equipping, useCouncilClass } from "../hooks/useCouncilClass";
import { type CouncilRecommendation, reportToMarkdown } from "../lib/councilClass";
import type { Subject } from "../lib/subjects";
import { subjectEmoji } from "../lib/subjectEmoji";
import { subjectIconFor } from "../lib/subjectIcons";

// Conseil de classe IA Papa (ADR-0020/0021) — narration LLM locale + équipement d'une notion.
// Composant présentationnel ; toute la logique vit dans `useCouncilClass`.

const GEN_MS = 18000; // génération d'une synthèse (barre estimée).
const EQUIP_MS = 90000; // équipement d'une notion : jusqu'à 5 générations LLM locales.

// Libellés FR des pièces du kit (ADR-0021).
const PIECE_LABEL: Record<string, string> = {
  cours: "cours",
  fiche: "fiche",
  srs: "cartes",
  quiz: "quiz",
  mindmap: "carte mentale",
};
const labelPieces = (pieces: string[]) => pieces.map((p) => PIECE_LABEL[p] ?? p).join(", ");

// Pipeline de génération (concept IA) : les 5 pièces du kit s'allument une à une.
const KIT_STEPS = [
  { key: "cours", label: "Cours", icon: "📖" },
  { key: "fiche", label: "Fiche", icon: "📄" },
  { key: "srs", label: "Cartes", icon: "🗂️" },
  { key: "quiz", label: "Quiz", icon: "✅" },
  { key: "mindmap", label: "Carte mentale", icon: "🧠" },
];

// Animations dorées « IA » — keyframes injectées localement (aucune dépendance au CSS de l'app).
const EQUIP_KEYFRAMES = `
@keyframes zetis-ai-flow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes zetis-ai-sweep { 0% { transform: translateX(-140%); } 100% { transform: translateX(360%); } }
@keyframes zetis-ai-glow { 0%,100% { box-shadow: 0 0 10px -2px rgba(251,191,36,0.35); } 50% { box-shadow: 0 0 26px 0 rgba(251,191,36,0.85); } }
@keyframes zetis-ai-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.18); } }`;

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
      <style>{EQUIP_KEYFRAMES}</style>

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
  const [period, setPeriod] = useState("Trimestre 1");
  const [pendingReco, setPendingReco] = useState<CouncilRecommendation | null>(null);
  const pct = useEstimatedProgress(c.generating, GEN_MS);
  const subjectById = new Map(c.subjects.map((s) => [s.id, s]));
  const busy = c.equipping !== null;

  return (
    <div className="mx-auto max-w-4xl">
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

      {c.equipResults.length > 0 && !busy && (
        <div className="mb-4 space-y-1 rounded-lg border border-papa-border bg-papa-surface-2 p-3 text-xs text-papa-muted">
          {c.equipResults.map((res) => (
            <p key={res.skill_id}>
              <span className="font-medium text-papa-fg">{res.skill_name}</span> —{" "}
              {res.has_lesson ? (
                <>
                  {res.generated.length > 0 && (
                    <span className="text-emerald-300">généré : {labelPieces(res.generated)}</span>
                  )}
                  {res.skipped.length > 0 && <> · déjà présent : {labelPieces(res.skipped)}</>}
                  {res.errors.length > 0 && (
                    <span className="text-red-300">
                      {" "}
                      · échec : {labelPieces(res.errors.map((e) => e.piece))}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-amber-300">{res.reason}</span>
              )}
            </p>
          ))}
        </div>
      )}

      {c.created && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <span>
            {c.created.count} mission{c.created.count > 1 ? "s" : ""} créée
            {c.created.count > 1 ? "s" : ""} ({c.created.skillNames.join(", ")}) — validée
            {c.created.count > 1 ? "s" : ""} par ton clic, visible côté Massimo.
          </span>
          <button
            type="button"
            onClick={c.dismissCreated}
            aria-label="Fermer"
            className="ml-3 text-emerald-300"
          >
            ✕
          </button>
        </div>
      )}

      {c.history.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-papa-muted">
          <span>Rapports :</span>
          {c.history.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => void c.openReport(h.id)}
              className={`rounded-full border px-2 py-0.5 ${
                c.report?.id === h.id
                  ? "border-papa-accent text-papa-accent"
                  : "border-papa-border hover:border-papa-accent"
              }`}
            >
              {h.period}
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

          {c.report.subjects.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {c.report.subjects.map((s) => (
                <div key={s.subject_id} className="flex items-start gap-3">
                  <SubjectDisc subject={subjectById.get(s.subject_id)} />
                  <div className="flex-1 rounded-xl border border-papa-border bg-papa-surface p-4">
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
                  {s.recent_evolution && (
                    <p className="mt-1 text-sm">
                      <span className="text-sky-300">Évolution :</span> {s.recent_evolution}
                    </p>
                  )}
                  {s.recommendations.map((r, i) => (
                    <RecommendationRow
                      key={`${s.subject_id}-${i}`}
                      reco={r}
                      disabled={busy}
                      onCreate={() => setPendingReco(r)}
                    />
                  ))}
                  </div>
                </div>
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
    </div>
  );
}

function RecommendationRow({
  reco,
  disabled,
  onCreate,
}: {
  reco: CouncilRecommendation;
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-papa-border bg-papa-surface-2 p-3">
      <div className="text-sm">
        <p className="text-papa-accent-2">{reco.skill_names.join(" · ")}</p>
        <p className="mt-0.5 text-papa-muted">{reco.justification}</p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled}
        className="shrink-0 rounded-lg bg-papa-accent px-3 py-1.5 text-xs font-semibold text-papa-bg disabled:opacity-60"
      >
        Créer {reco.skill_ids.length > 1 ? "ces missions" : "cette mission"}
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
