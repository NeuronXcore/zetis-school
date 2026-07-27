import { useEffect, useState } from "react";
import { Badge, Button, ConfirmDialog } from "@zetis/ui";
import { CYCLE4_LEVELS, useSkillsBackfill } from "../../hooks/useSkillsBackfill";
import { type EditableGroup } from "../../lib/skillsBackfill";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { EditableNotionChip } from "./EditableNotionChip";

// Modale « Rattrapage skills-only » (ADR-0010), déclenchée depuis la page Programme.
// Présentation PURE : toute la logique vit dans `useSkillsBackfill`. Flux stateless en
// trois temps : choisir un niveau → générer la prévisualisation (passes 1+2 EN MÉMOIRE,
// rien de persisté) → relire/ajuster les notions → confirmer l'upsert. Aucun chapitre ni
// cours n'est créé : les « chapitres d'échafaudage » ne servent qu'à regrouper à l'écran.
// Chrome de modale inline (patron LessonContentModal — pas de <Modal> partagé maison).

export function SkillsBackfillModal({
  subjectId,
  subjectName,
  activeLevel,
  onClose,
}: {
  subjectId: number;
  subjectName: string;
  /** Niveau de l'année active — marqué « en cours », le rattrapage vise un niveau antérieur. */
  activeLevel: string;
  onClose: () => void;
}) {
  const backfill = useSkillsBackfill({ subjectId, activeLevel });
  const {
    status,
    level,
    preview,
    groups,
    result,
    error,
    editing,
    draft,
    busy,
    total,
    duplicates,
    hasUnconfirmedProposal,
  } = backfill;

  // Gardes de confirmation : fermer une proposition non confirmée / régénérer par-dessus
  // des ajustements — tous deux perdent du travail (flux stateless), donc on avertit.
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const guardOpen = confirmClose || confirmRegen;

  // Progression *estimée* : ~6-9 appels LLM séquentiels (cloud), cible ~90 s.
  const generationPct = useEstimatedProgress(status === "generating", 90000);

  // Fermeture protégée : jamais pendant un appel ; avertir si une proposition non
  // confirmée serait perdue ; sinon fermer directement.
  function requestClose() {
    if (busy) return;
    if (hasUnconfirmedProposal) setConfirmClose(true);
    else onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ne pas interférer avec une garde déjà ouverte (elle gère son propre Échap).
      if (e.key === "Escape" && !guardOpen) requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardOpen, busy, hasUnconfirmedProposal]);

  const dialogClass =
    "flex max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-papa-accent/30 " +
    "bg-papa-surface shadow-[0_0_45px_-10px_rgba(16,185,129,0.45)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Rattrapage — ${subjectName}`}
        className={dialogClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="papa-scrollbar min-h-0 w-full overflow-y-auto p-6">
          {/* En-tête : titre + badge IA (origine générée) + fermeture (bloquée en appel). */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span aria-hidden>🎯</span>
              <h2 className="min-w-0 font-semibold">
                Rattrapage — {subjectName}
                {preview && (
                  <span className="font-normal text-papa-muted">
                    {" "}
                    · {preview.level} (programme {preview.program_version})
                  </span>
                )}
              </h2>
              <Badge variant="violet">IA</Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Fermer"
              onClick={requestClose}
              disabled={busy}
            >
              ✕
            </Button>
          </div>

          {error && (
            <ErrorBanner
              detail={error}
              onClose={requestClose}
              onRetry={() => backfill.retry()}
            />
          )}

          {status === "generating" && (
            <div className="mb-3">
              <ProgressBar
                pct={generationPct}
                label="ZETIS génère les notions (1 à 3 min, comme les chapitres)…"
              />
            </div>
          )}

          {result !== null ? (
            <ResultStep
              result={result}
              subjectName={subjectName}
              level={level ?? ""}
              onClose={onClose}
            />
          ) : preview !== null ? (
            <PreviewStep
              groups={groups}
              failedScaffolds={preview.failed_scaffolds}
              total={total}
              duplicates={duplicates}
              confirming={status === "confirming"}
              editing={editing}
              draft={draft}
              setDraft={backfill.setDraft}
              onStartEdit={backfill.startEdit}
              onCommitEdit={backfill.commitEdit}
              onRemove={backfill.remove}
              onAdd={backfill.startAdd}
              onRegenerate={() => setConfirmRegen(true)}
              onConfirm={() => void backfill.confirm()}
              onCancel={requestClose}
            />
          ) : (
            <LevelStep
              level={level}
              activeLevel={activeLevel}
              generating={status === "generating"}
              onPick={backfill.setLevel}
              onGenerate={() => void backfill.generate()}
              onCancel={requestClose}
            />
          )}
        </div>
      </div>

      {/* Garde : fermer une proposition non confirmée. */}
      <ConfirmDialog
        open={confirmClose}
        title="Fermer sans confirmer ?"
        confirmLabel="Fermer et perdre"
        cancelLabel="Continuer l'édition"
        tone="danger"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      >
        La proposition n'est pas encore confirmée. Rien n'a été enregistré — fermer
        maintenant perdra les notions générées et tes ajustements.
      </ConfirmDialog>

      {/* Garde : régénérer par-dessus des ajustements. */}
      <ConfirmDialog
        open={confirmRegen}
        title="Régénérer la proposition ?"
        confirmLabel="Régénérer"
        cancelLabel="Annuler"
        tone="danger"
        onCancel={() => setConfirmRegen(false)}
        onConfirm={() => {
          setConfirmRegen(false);
          void backfill.generate();
        }}
      >
        Une nouvelle proposition écrasera la liste actuelle et tes ajustements.
      </ConfirmDialog>
    </div>
  );
}

// --- Bandeau d'erreur : detail backend VERBATIM (style mono) + Fermer / Réessayer -----

function ErrorBanner({
  detail,
  onClose,
  onRetry,
}: {
  detail: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
      <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-rose-200">
        {detail}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Fermer
        </Button>
        <Button size="sm" onClick={onRetry}>
          ↻ Réessayer
        </Button>
      </div>
    </div>
  );
}

// --- Étape 1 : choix du niveau -------------------------------------------------

function LevelStep({
  level,
  activeLevel,
  generating,
  onPick,
  onGenerate,
  onCancel,
}: {
  level: string | null;
  activeLevel: string;
  generating: boolean;
  onPick: (level: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-papa-muted">
        Génère les notions d'un niveau antérieur pour alimenter le référentiel de
        rattrapage. Aucun chapitre ni cours n'est créé — seules les notions que tu
        confirmes sont ajoutées.
      </p>
      <div>
        <p className="mb-2 text-xs font-semibold text-papa-text">Niveau à générer</p>
        <div className="flex gap-2" role="group" aria-label="Niveau à générer">
          {CYCLE4_LEVELS.map((lvl) => {
            const active = lvl === activeLevel;
            const on = lvl === level;
            return (
              <button
                key={lvl}
                type="button"
                aria-pressed={on}
                disabled={generating}
                onClick={() => onPick(lvl)}
                className={
                  "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors " +
                  (on
                    ? "border-papa-accent bg-emerald-500/15 text-emerald-200 ring-2 ring-papa-accent/30"
                    : "border-papa-border bg-papa-bg text-papa-muted hover:text-papa-text")
                }
              >
                {lvl}
                {active && <span className="ml-1 text-[10px] font-normal">· en cours</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-papa-muted">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-papa-accent" />~1 à 3 min
        (génération cloud, comme les chapitres).
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={generating}>
          Annuler
        </Button>
        <Button size="sm" onClick={onGenerate} disabled={level === null || generating}>
          {generating ? "Génération…" : "⚡ Générer"}
        </Button>
      </div>
    </div>
  );
}

// --- Étape 2 : prévisualisation éditable --------------------------------------

function PreviewStep({
  groups,
  failedScaffolds,
  total,
  duplicates,
  confirming,
  editing,
  draft,
  setDraft,
  onStartEdit,
  onCommitEdit,
  onRemove,
  onAdd,
  onRegenerate,
  onConfirm,
  onCancel,
}: {
  groups: EditableGroup[];
  failedScaffolds: string[];
  total: number;
  duplicates: Map<string, string[]>;
  confirming: boolean;
  editing: { gi: number; ni: number } | null;
  draft: string;
  setDraft: (v: string) => void;
  onStartEdit: (gi: number, ni: number, name: string) => void;
  onCommitEdit: (gi: number, ni: number) => void;
  onRemove: (gi: number, ni: number) => void;
  onAdd: (gi: number) => void;
  onRegenerate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-papa-muted">
        Relis et ajuste. Rien n'est enregistré tant que tu ne confirmes pas.
      </p>
      {failedScaffolds.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ⚠ {failedScaffolds.length} section
          {failedScaffolds.length > 1 ? "s n'ont" : " n'a"} pas abouti — liste partielle.
          Tu peux confirmer ce qui est proposé, ou régénérer.
        </p>
      )}

      <div className="flex flex-col divide-y divide-papa-border/60">
        {groups.map((g, gi) => (
          <section key={gi} className="py-3 first:pt-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold">{g.scaffold_chapter}</span>
              <span className="ml-auto rounded-full border border-papa-border bg-papa-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-papa-muted">
                échafaudage · non créé
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.notions.map((n, ni) => (
                <EditableNotionChip
                  key={ni}
                  name={n}
                  editing={editing?.gi === gi && editing.ni === ni}
                  draft={draft}
                  duplicateChapters={duplicates.get(`${gi}:${ni}`)}
                  onStartEdit={() => onStartEdit(gi, ni, n)}
                  onSetDraft={setDraft}
                  onCommit={() => onCommitEdit(gi, ni)}
                  onRemove={() => onRemove(gi, ni)}
                />
              ))}
              <button
                type="button"
                onClick={() => onAdd(gi)}
                aria-label={`Ajouter une notion à ${g.scaffold_chapter}`}
                className="rounded-full border border-dashed border-papa-border px-3 py-1 text-xs text-papa-muted hover:text-papa-text"
              >
                ＋ ajouter une notion
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-papa-border pt-3">
        <span className="text-xs tabular-nums text-papa-muted">
          <b className="text-papa-text">{total}</b> notion{total > 1 ? "s" : ""} ·{" "}
          <b className="text-papa-text">{groups.length}</b> section
          {groups.length > 1 ? "s" : ""}
        </span>
        {/* Régénérer isolé à gauche — seule action destructive de l'écran. */}
        <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={confirming}>
          ↻ Régénérer
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={confirming}>
            Annuler
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={total === 0 || confirming}>
            {confirming
              ? "Ajout…"
              : `✓ Confirmer ${total} notion${total > 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Étape 3 : résultat -------------------------------------------------------

function ResultStep({
  result,
  subjectName,
  level,
  onClose,
}: {
  result: { created: number; existing: number };
  subjectName: string;
  level: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-papa-accent text-white">
          ✓
        </span>
        <p className="font-semibold">Notions ajoutées au référentiel</p>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold tabular-nums text-papa-text">{result.created}</p>
          <p className="text-xs text-papa-muted">créée{result.created > 1 ? "s" : ""}</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-papa-muted">{result.existing}</p>
          <p className="text-xs text-papa-muted">déjà présente{result.existing > 1 ? "s" : ""}</p>
        </div>
      </div>
      <p className="text-sm text-papa-muted">
        Le check-up « {subjectName} · {level} » est maintenant disponible pour Massimo.
        Aucun chapitre ni cours n'a été créé.
      </p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
