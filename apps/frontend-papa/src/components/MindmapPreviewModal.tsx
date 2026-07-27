import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Button, ContentLifecycleActions, ContentStatusBadge, Spinner } from "@zetis/ui";
import {
  type MindmapAttemptResult,
  type MindmapJson,
  type MindmapPilotageCard,
} from "@zetis/types";
import {
  MindmapOutlineEditor,
  type Draft,
  draftFrom,
  draftToJson,
  validateDraft,
} from "./MindmapOutlineEditor";
import { evaluateMindmapPreview, updateMindmap } from "../lib/mindmaps";

// APERÇU DE FIDÉLITÉ (addendum ADR-0016 §B) : Papa voit la carte exactement comme Massimo la
// verra, dans les trois modes, AVANT de valider. Valider une carte sans la voir revient à valider
// un JSON — ni la lisibilité de la disposition, ni la faisabilité de « Mémorise », ni la
// difficulté de « Reconstruis » ne s'inspectent dans un arbre textuel.
//
// Modale (pas une page dédiée) : Papa juge depuis l'arbre matière → leçons et doit y revenir sans
// perdre son contexte (scroll, chapitre déplié).
//
// CHARGEMENT PARESSEUX OBLIGATOIRE : la brique embarque React Flow + elkjs. Sans ce `lazy`, elles
// pèseraient sur toutes les pages Papa (§A).
const MindmapWorkspace = lazy(() =>
  import("@zetis/ui/mindmap").then((m) => ({ default: m.MindmapWorkspace })),
);

type Tab = "preview" | "edit";
type Mode = "view" | "train" | "build";

const TABS: { key: Tab; mode?: Mode; label: string }[] = [
  { key: "preview", mode: "view", label: "Regarde" },
  { key: "preview", mode: "train", label: "Mémorise" },
  { key: "preview", mode: "build", label: "Reconstruis" },
  { key: "edit", label: "Éditer" },
];

export function MindmapPreviewModal({
  card,
  subjectName,
  lessonTitle,
  busy = false,
  onClose,
  onSaved,
  onValidate,
  onRegenerate,
  onDelete,
}: {
  card: MindmapPilotageCard;
  subjectName: string;
  lessonTitle: string;
  busy?: boolean;
  onClose: () => void;
  /** L'arbre a changé (édition enregistrée) → la page recharge et la modale se referme. */
  onSaved: () => void;
  onValidate: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [mode, setMode] = useState<Mode>("view");
  // ↺ Réinitialiser = REMONTAGE de la brique (`key`) : replace les étiquettes, remasque les
  // révélations, retire l'agencement en cours. Aucun drapeau ajouté au contrat de la brique.
  const [resetNonce, setResetNonce] = useState(0);
  const [previewResult, setPreviewResult] = useState<MindmapAttemptResult | null>(null);

  const [draft, setDraft] = useState<Draft>(() => draftFrom(card.mindmap_json));
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  // L'onglet Éditer rend le canvas sur le BROUILLON (re-layouté à chaque frappe), pas sur la carte
  // enregistrée : Papa voit immédiatement l'effet de sa correction sur la lisibilité. `debounced`
  // évite de relancer elk à chaque caractère.
  const debounced = useDebounced(draft, 300);
  const draftJson: MindmapJson = useMemo(() => draftToJson(debounced), [debounced]);
  const draftValid = validateDraft(debounced) === null;

  /**
   * Évaluateur d'APERÇU (§C) : même barème serveur que Massimo, **sans persistance ni XP**.
   * `attempt_id`/`xp_awarded` sont neutres — la brique masque son popup de réussite dès que
   * `onComplete` est fourni, et c'est la modale qui affiche le résultat d'aperçu ci-dessous.
   */
  const evaluator = useCallback(
    async (placements: Parameters<typeof evaluateMindmapPreview>[1]) => {
      const res = await evaluateMindmapPreview(card.id, placements);
      return { ...res, attempt_id: 0, xp_awarded: 0 } as MindmapAttemptResult;
    },
    [card.id],
  );

  const switchTo = (t: Tab, m?: Mode) => {
    setTab(t);
    if (m) setMode(m);
    setPreviewResult(null);
  };

  const reset = () => {
    setResetNonce((n) => n + 1);
    setPreviewResult(null);
  };

  async function saveEdit() {
    const invalid = validateDraft(draft);
    if (invalid) return setEditError(invalid);
    setSaving(true);
    setEditError(null);
    try {
      await updateMindmap(card.id, draftToJson(draft));
      onSaved();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Enregistrement échoué (arbre invalide ?).");
    } finally {
      setSaving(false);
    }
  }

  const activeKey = tab === "edit" ? "edit" : mode;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu de la carte mentale — ${lessonTitle}`}
        className="flex flex-col overflow-hidden rounded-2xl border border-papa-accent/30 bg-papa-surface shadow-[0_0_60px_-12px_rgba(16,185,129,0.5)]"
        style={{ width: "min(1400px, 95vw)", height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── En-tête : chrome Papa (émeraude) ─────────────────────────────── */}
        <div className="shrink-0 border-b border-papa-border px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-papa-text">{lessonTitle}</h2>
              <p className="truncate text-xs text-papa-muted">
                {subjectName}
                {card.chapter ? ` — ${card.chapter}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ContentStatusBadge status={card.validation_status} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm hover:text-papa-accent"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="mt-2 rounded-lg bg-papa-accent/10 px-3 py-1.5 text-xs text-papa-accent">
            ⓘ Aperçu — rien n'est enregistré pour Massimo.
          </p>
        </div>

        {/* ── Onglets ──────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-papa-border px-5 py-2">
          {TABS.map((t) => {
            const key = t.mode ?? "edit";
            const active = activeKey === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => switchTo(t.key, t.mode)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-papa-accent/15 text-papa-accent"
                    : "text-papa-muted hover:text-papa-text"
                }`}
              >
                {t.label}
              </button>
            );
          })}
          {tab === "preview" && (
            <button
              type="button"
              onClick={reset}
              className="ml-auto rounded-lg border border-papa-border px-3 py-1.5 text-xs text-papa-muted hover:text-papa-text"
            >
              ↺ Réinitialiser
            </button>
          )}
        </div>

        {/* ── Corps ────────────────────────────────────────────────────────── */}
        <div className="papa-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "preview" ? (
            <>
              <Porthole>
                <Suspense fallback={<CanvasLoading />}>
                  <MindmapWorkspace
                    key={`${mode}-${resetNonce}`}
                    mm={card.mindmap_json}
                    mindmapId={card.id}
                    mode={mode}
                    onModeChange={(m) => switchTo("preview", m)}
                    evaluator={evaluator}
                    // Fourni → le popup « +N XP » interne est masqué (il n'y a pas d'XP en aperçu).
                    onComplete={setPreviewResult}
                    // Isole la disposition d'aperçu de celle que Massimo a mémorisée.
                    storageScope="papa-preview"
                  />
                </Suspense>
              </Porthole>
              {previewResult && (
                <div className="mt-4 rounded-xl border border-papa-accent/40 bg-papa-accent/5 p-4">
                  <p className="text-sm font-semibold text-papa-text">
                    Aperçu — score {previewResult.score} % ({previewResult.correct_count}/
                    {previewResult.expected_count} nœuds requis)
                  </p>
                  <p className="mt-1 text-xs text-papa-muted">
                    Barème identique à celui de Massimo. Rien n'a été enregistré : ni tentative, ni
                    XP.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="min-w-0">
                <MindmapOutlineEditor
                  draft={draft}
                  onDraftChange={setDraft}
                  error={editError}
                />
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-xs text-papa-muted">
                  Aperçu de la disposition — se réagence à chaque modification.
                </p>
                <Porthole>
                  {draftValid ? (
                    <Suspense fallback={<CanvasLoading />}>
                      <MindmapWorkspace
                        // La clé force le recalcul elk quand l'arbre change de forme.
                        key={`edit-${debounced.nodes.length}`}
                        mm={draftJson}
                        mindmapId={card.id}
                        mode="view"
                        onModeChange={() => {}}
                        evaluator={evaluator}
                        storageScope="papa-edit"
                      />
                    </Suspense>
                  ) : (
                    <p className="grid h-[320px] place-items-center px-6 text-center text-sm text-amber-300">
                      L'arbre est incomplet — complète les libellés pour voir la carte.
                    </p>
                  )}
                </Porthole>
              </div>
            </div>
          )}
        </div>

        {/* ── Pied : mêmes briques qu'en ligne de liste ─────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-papa-border px-5 py-3">
          {tab === "edit" ? (
            <>
              <p className="text-xs text-papa-muted">
                {card.validation_status === "validated" ? (
                  <span className="text-papa-warn">
                    ⚠ Cette carte est visible par Massimo. La modifier la retirera de sa liste
                    jusqu'à validation.
                  </span>
                ) : (
                  "L'enregistrement revalide l'arbre ; la carte reste « à valider »."
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
                  Annuler
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            </>
          ) : (
            <ContentLifecycleActions
              status={card.validation_status}
              itemLabel={card.title}
              busy={busy}
              destructionNotice={destructionNotice(card)}
              onValidate={onValidate}
              onEdit={() => switchTo("edit")}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Le « hublot » : un cadre de type écran-dans-l'écran qui rend la brique **avec le style Massimo**
 * (verre sombre / néon) au milieu du chrome émeraude de Papa.
 *
 * C'est une **exception cadrée** à la séparation visuelle Massimo/Papa (§B), pas une entorse :
 * l'objet même de l'aperçu est de juger la lisibilité RÉELLE — contraste et néons compris. Rendre
 * le hublot en émeraude détruirait ce qu'il sert à vérifier. Le cadre explicite le maintient
 * lisible comme « ce que voit Massimo », jamais fondu dans la page.
 */
function Porthole({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-papa-border bg-slate-950 p-3 shadow-inner">
      <p className="mb-2 text-center text-[11px] uppercase tracking-wider text-slate-500">
        ce que voit Massimo
      </p>
      <div className="rounded-xl bg-[#0b1020] p-3 text-slate-100">{children}</div>
    </div>
  );
}

function CanvasLoading() {
  return (
    <div className="grid h-[320px] place-items-center gap-2 text-sm text-slate-400">
      <Spinner />
      <span>Mise en page…</span>
    </div>
  );
}

/** Signal avant destruction (§E) — ce que Massimo a produit et qui va disparaître avec la carte. */
export function destructionNotice(card: {
  attempt_count: number;
  avg_score: number | null;
}): React.ReactNode {
  if (card.attempt_count === 0) return null;
  return (
    <>
      Massimo l'a reconstruite {card.attempt_count} fois
      {card.avg_score !== null ? ` (moyenne ${card.avg_score} %)` : ""}. Son historique de
      reconstruction sera supprimé avec elle. <b>L'XP qu'il a gagné lui reste acquis.</b>
    </>
  );
}

/** Valeur retardée — évite de relancer le layout elk à chaque frappe dans l'outline. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
