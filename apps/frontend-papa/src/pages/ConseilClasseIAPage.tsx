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

/** Barre de progression d'UNE notion (remontée par `key` à chaque notion → % repart de 0). */
function EquipProgress({ equipping }: { equipping: Equipping }) {
  const pct = useEstimatedProgress(true, EQUIP_MS);
  return (
    <ProgressBar
      pct={pct}
      label={`🛠️ ${equipping.name} (${equipping.index}/${equipping.total}) — cours, fiche, cartes, quiz, carte mentale…`}
    />
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
