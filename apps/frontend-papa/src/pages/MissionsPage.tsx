import { type ReactNode, useState } from "react";
import { Button, ConfirmDialog, EmptyState, Spinner } from "@zetis/ui";
import { PageHeader } from "../components/PageHeader";
import { DEFAULT_SUBJECT_EMOJI, subjectEmoji } from "../lib/subjectEmoji";
import { type Subject } from "../lib/subjects";
import {
  type Election,
  type MissionPilot,
  type MissionStepPilot,
  type Verdict,
} from "../lib/missionsPilotage";
import { STEP_EMOJI, STEP_LABEL } from "../lib/missionSteps";
import { useMissionsPilotage } from "../hooks/useMissionsPilotage";
import { useCommandMission } from "../hooks/useCommandMission";
import { useChampionMission } from "../hooks/useChampionMission";
import { CommandMissionModal } from "../components/CommandMissionModal";
import { ChampionMissionModal } from "../components/ChampionMissionModal";
import { MissionTimeline } from "../components/MissionTimeline";
import { MissionEditModal } from "../components/MissionEditModal";

// Page Papa « Missions — pilotage » (ADR-0017). Se lit de haut en bas comme le cycle de vie
// d'une mission : à valider → élue → en cours → verdict. Frontière serveur : cette page consomme
// `MissionPilotOut` (scores, facteurs, motifs, preuves brutes) — absents de la vue Massimo.
// Composant purement présentationnel ; toute la logique vit dans `useMissionsPilotage`.

// Jargon assumé côté Papa : les types gardent leur nom machine (cf. spec § Badges & vocabulaire).
const TYPE_BADGE: Record<string, string> = {
  remediation: "bg-indigo-500/15 text-indigo-300",
  revision: "bg-sky-500/15 text-sky-300",
  progression: "bg-violet-500/15 text-violet-300",
  manual: "bg-emerald-500/15 text-emerald-300",
  champion: "bg-amber-500/15 text-amber-300",
};

const TYPE_FILTERS = ["remediation", "revision", "progression", "manual", "champion"] as const;

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_BADGE[type] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {type}
    </span>
  );
}

function subjectEmojiFor(subjectId: number | null, subjects: Subject[]): string {
  if (subjectId === null) return DEFAULT_SUBJECT_EMOJI;
  const subject = subjects.find((s) => s.id === subjectId);
  return subject ? subjectEmoji(subject.slug, subject.icon) : DEFAULT_SUBJECT_EMOJI;
}

// Preuve compacte d'une étape : emoji + valeur brute + coche, jamais du déclaratif.
function stepProof(step: MissionStepPilot): string {
  const emoji = STEP_EMOJI[step.step_type] ?? "•";
  const { value, satisfied } = step.proof;
  if (value !== null) return `${emoji} ${value} ${satisfied ? "✓" : ""}`.trim();
  if (satisfied) return `${emoji} ✓`;
  return `${emoji} —`;
}

function currentStepLabel(mission: MissionPilot): string | null {
  const next = mission.steps.find((s) => s.status !== "done");
  if (!next) return null;
  return STEP_LABEL[next.step_type] ?? next.step_type;
}

function Kpi({ value, label, tone }: { value: ReactNode; label: string; tone?: "warn" | "ok" }) {
  const valueColor =
    tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-papa-text";
  return (
    <div className="rounded-xl border border-papa-border bg-papa-surface p-4">
      <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      <div className="mt-0.5 text-xs text-papa-muted">{label}</div>
    </div>
  );
}

export function MissionsPage() {
  const p = useMissionsPilotage();
  const cmd = useCommandMission(p.reload);
  const champ = useChampionMission(p.reload);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<MissionPilot | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "regenerate"; id: number } | null>(
    null,
  );
  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Corps déplié partagé (pool + à valider) : frise + actions cycle de vie.
  function expandedBody(m: MissionPilot) {
    if (!expanded.has(m.id)) return null;
    const busy = p.busyMission.has(m.id);
    return (
      <div className="border-t border-papa-border px-4 py-3">
        <MissionTimeline mission={m} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(m)}
            className="rounded-lg border border-papa-border px-2.5 py-1 text-xs font-medium text-papa-muted hover:text-papa-text disabled:opacity-45"
          >
            ✏️ Éditer
          </button>
          {m.status === "planned" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm({ kind: "regenerate", id: m.id })}
              className="rounded-lg border border-papa-border px-2.5 py-1 text-xs font-medium text-papa-muted hover:text-papa-text disabled:opacity-45"
            >
              ↻ Régénérer
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm({ kind: "delete", id: m.id })}
            className="rounded-lg border border-rose-400/30 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-45"
          >
            🗑 Supprimer
          </button>
          {busy && <span className="text-xs text-papa-muted">…</span>}
        </div>
      </div>
    );
  }

  if (p.loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Missions — pilotage"
        subtitle="ZETIS compose les missions depuis l'évidence mesurée (maîtrise, lacunes, verdicts). Rien n'atteint Massimo sans votre validation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={champ.openModal} className="border border-papa-border">
              🏆 Défi champion
            </Button>
            <Button onClick={cmd.openModal}>+ Commander une mission</Button>
          </div>
        }
      />
      <CommandMissionModal cmd={cmd} />
      <ChampionMissionModal champ={champ} />

      {p.error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{p.error}</p>
      )}

      {/* KPI */}
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi value={p.summary?.pending ?? 0} label="à valider" tone="warn" />
        <Kpi value={p.summary?.pool ?? 0} label="dans le pool (validées)" />
        <Kpi value={p.summary?.completed_this_week ?? 0} label="terminées cette semaine" tone="ok" />
        <Kpi
          value={`${Math.round((p.summary?.acquired_rate_30d ?? 0) * 100)} %`}
          label="verdicts « acquise » (30 j)"
          tone="ok"
        />
      </div>

      {/* ================= À VALIDER (5ter) ================= */}
      <section className="mb-7">
        <h2 className="mb-2.5 flex flex-wrap items-center gap-2 text-sm font-bold text-papa-text">
          À valider
          {p.pending.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">
              {p.pending.length}
            </span>
          )}
          <span className="text-xs font-normal text-papa-muted">
            — missions générées, invisibles pour Massimo tant que non validées
          </span>
        </h2>

        {p.pending.length === 0 ? (
          <EmptyState
            icon="✓"
            title="Rien à valider"
            description="Le pool est à jour — aucune mission générée n'attend votre décision."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-amber-500/30 bg-papa-surface">
            <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-papa-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-papa-accent"
                  checked={p.selected.size === p.pending.length && p.pending.length > 0}
                  onChange={(e) => p.toggleAll(e.target.checked)}
                />
                Tout sélectionner
              </label>
              <span className="flex-1" />
              <Button
                onClick={() => void p.validateSelected()}
                disabled={p.busy || p.selected.size === 0}
                className="px-3.5 py-1.5 text-sm"
              >
                {p.busy ? "…" : `Valider la sélection (${p.selected.size})`}
              </Button>
            </div>

            {p.pending.map((m) => (
              <div key={m.id} className="border-b border-papa-border last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-papa-accent"
                    checked={p.selected.has(m.id)}
                    onChange={() => p.toggleSelected(m.id)}
                  />
                  <button
                    type="button"
                    onClick={() => toggleExpand(m.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-semibold text-papa-text">
                      <span className="mr-1 text-xs text-papa-muted">
                        {expanded.has(m.id) ? "▼" : "▶"}
                      </span>
                      {m.title}
                    </div>
                    <div className="mt-0.5 text-xs text-papa-muted">
                      {subjectEmojiFor(m.subject_id, p.subjects)} {m.subject}
                      {m.skill_name ? ` · notion « ${m.skill_name} »` : ""}
                      {m.generation_reason ? ` · ${m.generation_reason}` : ""}
                      {" · "}
                      {m.steps.map((s) => STEP_EMOJI[s.step_type] ?? "•").join("→")}
                    </div>
                  </button>
                  <TypeBadge type={m.mission_type} />
                  <button
                    type="button"
                    onClick={() => void p.reject(m.id)}
                    disabled={p.busy}
                    className="rounded-lg border border-rose-400/30 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-45"
                  >
                    Rejeter
                  </button>
                </div>
                {expandedBody(m)}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ================= ÉLUE AUJOURD'HUI ================= */}
      <section className="mb-7">
        <h2 className="mb-2.5 flex flex-wrap items-center gap-2 text-sm font-bold text-papa-text">
          Élue aujourd'hui
          <span className="text-xs font-normal text-papa-muted">
            — pourquoi cette mission, facteur par facteur
          </span>
        </h2>
        <ElectedCard election={p.election} subjects={p.subjects} />
      </section>

      {/* ================= EN COURS & PLANIFIÉES ================= */}
      <section className="mb-7">
        <h2 className="mb-2.5 flex flex-wrap items-center gap-2 text-sm font-bold text-papa-text">
          En cours &amp; planifiées
          <span className="text-xs font-normal text-papa-muted">
            — preuves par étape, jamais du déclaratif
          </span>
        </h2>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterPill active={p.typeFilter === null} onClick={() => p.setTypeFilter(null)}>
            Toutes
          </FilterPill>
          {TYPE_FILTERS.map((t) => (
            <FilterPill key={t} active={p.typeFilter === t} onClick={() => p.setTypeFilter(t)}>
              {t}
            </FilterPill>
          ))}
          <select
            value={p.subjectFilter ?? ""}
            onChange={(e) => p.setSubjectFilter(e.target.value || null)}
            className="rounded-full border border-papa-border bg-papa-surface px-3 py-1.5 text-sm text-papa-text"
          >
            <option value="">Toutes matières</option>
            {p.subjects.map((s) => (
              <option key={s.id} value={s.slug}>
                {subjectEmoji(s.slug, s.icon)} {s.name}
              </option>
            ))}
          </select>
        </div>

        {p.pilotLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : p.pilot.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="Aucune mission dans le pool"
            description="Validez des missions générées pour qu'elles rejoignent le suivi."
          />
        ) : (
          <div className="space-y-2">
            {p.pilot.map((m) => {
              const current = m.status === "active" ? currentStepLabel(m) : null;
              return (
                <div key={m.id} className="rounded-xl border border-papa-border bg-papa-surface">
                  <button
                    type="button"
                    onClick={() => toggleExpand(m.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-xs text-papa-muted">
                      {expanded.has(m.id) ? "▼" : "▶"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-papa-text">
                        {m.title}
                        <TypeBadge type={m.mission_type} />
                        {/* ★ = plancher de score PAR MISSION (ADR-0018), pas « toute manual ». */}
                        {m.force_priority && (
                          <span className="text-xs font-bold text-amber-300">★ priorité forcée</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-papa-muted">
                        {subjectEmojiFor(m.subject_id, p.subjects)} {m.subject} ·{" "}
                        {m.status === "active" ? "active" : "planifiée"}
                        {current ? ` · étape courante : ${current}` : ""}
                        {m.created_by === "parent" ? " · commandée par Papa" : ""}
                        {m.due_date ? ` · échéance ${m.due_date}` : ""}
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-xs text-papa-muted">
                      {m.steps.map(stepProof).join(" · ")}
                    </span>
                  </button>
                  {expandedBody(m)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= VERDICTS RÉCENTS ================= */}
      <section>
        <h2 className="mb-2.5 flex flex-wrap items-center gap-2 text-sm font-bold text-papa-text">
          Verdicts récents
          <span className="text-xs font-normal text-papa-muted">
            — compléter ≠ acquérir ; l'XP est crédité dans les deux cas
          </span>
        </h2>
        {p.verdicts.length === 0 ? (
          <EmptyState
            icon="📋"
            title="Aucun verdict récent"
            description="Les verdicts d'acquisition apparaîtront ici quand Massimo terminera des missions."
          />
        ) : (
          <div className="space-y-2">
            {p.verdicts.map((v, i) => (
              <VerdictRow key={`${v.mission_id}-${i}`} verdict={v} subjects={p.subjects} />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <MissionEditModal
          mission={editing}
          busy={p.busyMission.has(editing.id)}
          error={p.error}
          onClose={() => setEditing(null)}
          patch={p.patch}
          saveSteps={p.saveSteps}
          loadStepOptions={p.loadStepOptions}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "delete" ? "Supprimer cette mission ?" : "Régénérer le parcours ?"}
        confirmLabel={confirm?.kind === "delete" ? "Supprimer" : "Régénérer"}
        tone={confirm?.kind === "delete" ? "danger" : "default"}
        busy={confirm ? p.busyMission.has(confirm.id) : false}
        onConfirm={() => {
          if (!confirm) return;
          const { kind, id } = confirm;
          const op = kind === "delete" ? p.remove(id) : p.regenerate(id);
          void op.finally(() => setConfirm(null));
        }}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.kind === "delete"
          ? "Cette mission et ses étapes seront supprimées (les verdicts et l'XP restent tracés). Distinct de « rejeter »."
          : "Le parcours d'étapes sera reconstruit depuis la notion (déterministe). La validation reste inchangée."}
      </ConfirmDialog>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm ${
        active
          ? "border-papa-accent bg-papa-accent/15 font-semibold text-papa-accent"
          : "border-papa-border bg-papa-surface text-papa-muted hover:text-papa-text"
      }`}
    >
      {children}
    </button>
  );
}

function ElectedCard({ election, subjects }: { election: Election | null; subjects: Subject[] }) {
  if (!election || !election.elected) {
    return (
      <div className="rounded-xl border border-papa-border bg-papa-surface px-4 py-5 text-sm text-papa-muted">
        Aucune mission validée disponible — validez ou générez une mission pour qu'une élection ait
        lieu. {election ? `(${election.scoring_version})` : ""}
      </div>
    );
  }
  const { elected, score, factors, scoring_version, reason, alternatives } = election;
  return (
    <div className="rounded-xl border border-papa-border border-l-4 border-l-papa-accent bg-papa-surface px-4 py-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2.5">
        <span className="font-bold text-papa-text">{elected.title}</span>
        <TypeBadge type={elected.mission_type} />
        <span className="font-bold tabular-nums text-emerald-300">
          score {score?.toFixed(2)}
        </span>
        <span className="ml-auto font-mono text-xs text-papa-muted">
          MISSION_SCORING_VERSION={scoring_version}
        </span>
      </div>

      <div className="grid max-w-xl grid-cols-[110px_1fr_56px] items-center gap-x-3 gap-y-2">
        {factors.map((f) => {
          const negative = f.contribution < 0;
          const width = Math.min(100, Math.abs(f.contribution) * 100);
          return (
            <FactorRow
              key={f.name}
              name={f.name}
              dominant={f.dominant}
              negative={negative}
              width={width}
              contribution={f.contribution}
            />
          );
        })}
      </div>

      <div className="mt-3 rounded-r-lg border-l-[3px] border-papa-accent bg-papa-accent/10 px-3 py-1.5 text-xs text-emerald-200">
        Phrase servie à Massimo (dérivée du facteur dominant) : « {reason} »
      </div>

      {alternatives.length > 0 && (
        <div className="mt-3 text-xs text-papa-muted">
          Alternatives non retenues :{" "}
          {alternatives.map((a, i) => (
            <span key={a.mission.id}>
              {i > 0 ? " · " : ""}
              <span className="font-semibold text-papa-text">{a.mission.title}</span> (
              {a.score.toFixed(2)})
            </span>
          ))}
        </div>
      )}
      {/* subjects réservé pour un futur emoji de l'élue ; l'identité matière est dans le titre. */}
      <span className="hidden">{subjects.length}</span>
    </div>
  );
}

function FactorRow({
  name,
  dominant,
  negative,
  width,
  contribution,
}: {
  name: string;
  dominant: boolean;
  negative: boolean;
  width: number;
  contribution: number;
}) {
  return (
    <>
      <span className={`text-xs ${dominant ? "font-bold text-emerald-300" : "text-papa-muted"}`}>
        {name}
        {dominant ? " ◄" : ""}
      </span>
      <span className="h-2 overflow-hidden rounded bg-papa-surface-2">
        <span
          className={`block h-full rounded ${negative ? "bg-rose-400" : "bg-papa-accent"}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="text-right text-xs tabular-nums text-papa-muted">
        {contribution >= 0 ? "+" : "−"}
        {Math.abs(contribution).toFixed(2)}
      </span>
    </>
  );
}

function VerdictRow({ verdict, subjects }: { verdict: Verdict; subjects: Subject[] }) {
  const acquired = verdict.verdict === "acquired";
  const scores: string[] = [];
  if (verdict.quiz_score !== null) scores.push(`quiz ${Math.round(verdict.quiz_score)} %`);
  if (verdict.reverse_score !== null) scores.push(`reverse ${verdict.reverse_score}`);
  if (verdict.mindmap_score !== null) scores.push(`mindmap ${Math.round(verdict.mindmap_score)}`);
  if (verdict.xp !== null) scores.push(`+${verdict.xp} XP`);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-papa-border bg-papa-surface px-4 py-2.5 text-sm">
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          acquired ? "bg-emerald-500/15 text-emerald-300" : "bg-indigo-500/15 text-indigo-300"
        }`}
      >
        {acquired ? "✓ acquise" : "↻ à revoir"}
      </span>
      <span className="text-papa-text">
        {subjectEmojiFor(verdict.subject_id, subjects)}{" "}
        <span className="text-papa-muted">{verdict.mission_type ?? "mission"}</span>
      </span>
      {verdict.effect && <span className="text-xs text-papa-muted">· {verdict.effect}</span>}
      <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-papa-muted">
        {scores.join(" · ")}
      </span>
    </div>
  );
}
