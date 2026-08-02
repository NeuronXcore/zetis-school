// Journal de production (ADR-0034) — ce que ZETIS a fait, et ce que Papa peut encore retirer.
//
// Deux choses qu'un écran de suivi ne fait PAS, et qui sont ici des règles :
//
// - **Aucun total, aucun ratio ZETIS/Papa** (§F.2). La provenance est un fait, jamais un
//   reproche : elle s'affiche par objet et ne se totalise pas. Un compteur « 31 objets servis
//   sans relecture » en tête de page serait un bulletin de retard.
// - **La portée est dite, pas devinée.** Le Journal ne montre que la production EN LOT ; le
//   Conseil de classe et la composition champion équipent hors lot. Le silence sur eux ne doit
//   pas se lire comme « rien d'autre n'a été produit ».
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@zetis/ui";
import { type JournalPiece, type JournalRun, type PieceKind, type VetoPreview } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import {
  AUTHORITY_LABEL,
  PIECE_ICON,
  PIECE_LABEL,
  RUN_STATUS_LABEL,
  TRIGGER_LABEL,
  fetchJournal,
  previewRemoval,
  removePiece,
} from "../lib/journal";

type Target = { piece: JournalPiece; preview: VetoPreview };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TONE: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-300",
  running: "bg-sky-500/15 text-sky-300",
  queued: "bg-slate-500/15 text-slate-300",
  failed: "bg-rose-500/15 text-rose-300",
  stale: "bg-amber-500/15 text-amber-300",
};

function RunHeader({ run }: { run: JournalRun }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[run.status] ?? ""}`}>
        {RUN_STATUS_LABEL[run.status] ?? run.status}
      </span>
      <span className="text-sm font-semibold">Lot #{run.id}</span>
      <span className="text-sm text-papa-muted">{formatDate(run.created_at)}</span>
      {/* « Demandé par » — c'est ici que `parent_rule` deviendra visible, le jour où un lot
          partira sans que personne l'ait demandé (ADR-0035). */}
      <span className="text-sm text-papa-muted">
        · {TRIGGER_LABEL[run.trigger] ?? run.trigger}
      </span>
      {run.total_notions !== null && (
        <span className="text-sm text-papa-muted">
          · {run.done_notions ?? 0}/{run.total_notions} notions
        </span>
      )}
      {run.current_skill_name && (
        <span className="text-sm text-sky-300">· en cours : {run.current_skill_name}</span>
      )}
    </div>
  );
}

function PieceRow({
  piece,
  onRemove,
}: {
  piece: JournalPiece;
  onRemove: (p: JournalPiece) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
      <span aria-hidden>{PIECE_ICON[piece.kind]}</span>
      <span className="text-sm font-medium">{PIECE_LABEL[piece.kind]}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-papa-muted">{piece.label}</span>
      {piece.skill_name && (
        <span className="text-xs text-papa-muted">{piece.skill_name}</span>
      )}
      {/* Provenance PAR OBJET — la seule forme que le §F.2 autorise. */}
      {piece.validated_by && (
        <span className="text-xs text-papa-muted">
          {AUTHORITY_LABEL[piece.validated_by] ?? piece.validated_by}
        </span>
      )}
      {piece.consumed ? (
        // La consommation ferme la fenêtre, pas l'horloge (§G.3). On le DIT plutôt que de
        // masquer le bouton : un geste qui disparaît sans explication se lit comme un bug.
        <span className="text-xs text-papa-muted" title="Massimo l'a déjà ouvert">
          Déjà ouvert par Massimo
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onRemove(piece)}
          className="rounded-md border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
        >
          Retirer
        </button>
      )}
    </li>
  );
}

function EventList({ run }: { run: JournalRun }) {
  if (run.events.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-papa-muted">
        Détail de ce que ZETIS a fait ({run.events.length})
      </summary>
      <ul className="mt-2 space-y-1">
        {run.events.map((e, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="text-papa-muted">{e.skill_name ?? "—"}</span>
            {e.piece && <span>{PIECE_LABEL[e.piece]}</span>}
            <span
              className={
                e.outcome === "error"
                  ? "text-rose-300"
                  : e.outcome === "blocked"
                    ? "text-amber-300"
                    : e.outcome === "skipped"
                      ? "text-papa-muted"
                      : "text-emerald-300"
              }
            >
              {e.outcome === "generated" && "produit"}
              {e.outcome === "skipped" && "déjà présent"}
              {e.outcome === "error" && "erreur"}
              {/* Le gate du §7 rendu VISIBLE : une notion écartée en silence se lirait comme un
                  échec de production, alors que c'est un gate qui fonctionne. */}
              {e.outcome === "blocked" && "non produit"}
            </span>
            {e.detail && <span className="text-papa-muted">— {e.detail}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function JournalPage() {
  const [runs, setRuns] = useState<JournalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJournal();
      setRuns(data.runs);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement du journal échoué");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // La modale annonce la portée AVANT le geste : un veto qui surprend n'est pas exercé deux fois.
  const askRemove = useCallback(async (piece: JournalPiece) => {
    try {
      const preview = await previewRemoval(piece.kind, piece.id);
      setTarget({ piece, preview });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Aperçu du retrait échoué");
    }
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!target) return;
    setBusy(true);
    try {
      await removePiece(target.piece.kind, target.piece.id);
      setTarget(null);
      await reload();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Retrait échoué");
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }, [target, reload]);

  const cascade = target?.preview.cascade ?? {};
  const cascadeEntries = Object.entries(cascade).filter(([, ids]) => (ids?.length ?? 0) > 0);
  const refused = target !== null && !target.preview.removable;

  return (
    <div>
      <PageHeader
        title="Journal de production"
        subtitle="Ce que ZETIS a produit, lot par lot — et ce que vous pouvez encore retirer."
        icon={<span aria-hidden>📜</span>}
      />

      {/* La portée est DITE. Le Conseil de classe et la composition champion équipent hors lot :
          leurs contenus n'apparaissent pas ici, et un journal qui paraît exhaustif sans l'être
          est pire qu'un journal qui borne son sujet. */}
      <p className="mb-6 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-papa-muted">
        Ce journal ne montre que la production <strong>en lot</strong>. Les contenus créés par le
        Conseil de classe ou une mission champion n'y figurent pas : vous les avez demandés d'un
        clic, ils n'ont pas de fenêtre de retrait.
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-papa-muted">Chargement…</p>}

      {!loading && runs.length === 0 && (
        <p className="text-sm text-papa-muted">
          Aucun lot de production pour l'instant. Lancez-en un depuis la Couverture.
        </p>
      )}

      <div className="space-y-4">
        {runs.map((run) => (
          <section key={run.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <RunHeader run={run} />
            {run.pieces.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {run.pieces.map((p) => (
                  <PieceRow key={`${p.kind}-${p.id}`} piece={p} onRemove={askRemove} />
                ))}
              </ul>
            )}
            {/* ⚠️ Vu à l'écran le 2026-08-03, sur les vrais lots du 2 août : un lot terminé
                « 3/3 notions » qui n'affiche NI pièce NI détail se lit comme une panne. C'est
                l'inverse — soit tout existait déjà, soit le lot est antérieur au journal (aucune
                rétro-attribution, §F.4). Un vide non expliqué est un vide qui inquiète. */}
            {run.pieces.length === 0 && run.events.length === 0 && (
              <p className="mt-3 text-sm text-papa-muted">
                Aucun contenu neuf rattaché à ce lot — soit tout existait déjà, soit il est
                antérieur au journal, qui ne reconstitue pas le passé.
              </p>
            )}
            <EventList run={run} />
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={target !== null}
        title={
          target
            ? refused
              ? `« ${PIECE_LABEL[target.piece.kind]} » ne peut plus être retiré`
              : `Retirer « ${PIECE_LABEL[target.piece.kind]} » ?`
            : ""
        }
        // ⚠️ Sur un refus, le bouton ne propose pas un geste qui partirait en 409 : il ferme.
        // Une commande qui ne fait rien est un piège — c'est le motif exact du verrou écrit sur
        // `ParametresPage` le 2026-08-02, et il vaut pour toutes les pages Papa.
        confirmLabel={refused ? "Fermer" : "Retirer"}
        cancelLabel={refused ? "" : "Annuler"}
        busy={busy}
        tone={refused ? "default" : "danger"}
        onConfirm={refused ? () => setTarget(null) : confirmRemove}
        onCancel={() => setTarget(null)}
      >
        {refused ? (
          // Le refus porte TOUJOURS son motif : un refus muet se lit comme une panne.
          <p className="text-sm">{target.preview.reason}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              Ce contenu sera supprimé définitivement. Massimo ne l'a pas ouvert : il n'en saura
              rien, et rien ne lui manquera.
            </p>
            {cascadeEntries.length > 0 && (
              // Le cours est la source canonique de ses dérivés : en laisser un orphelin
              // servirait à Massimo un contenu dont la source n'existe plus.
              <p className="text-papa-muted">
                Ce retrait emporte aussi :{" "}
                {cascadeEntries
                  .map(([kind, ids]) => `${ids!.length} ${PIECE_LABEL[kind as PieceKind]}`)
                  .join(", ")}
                .
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
