import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { type SrsCardContent, type SrsCardUpdate, type SrsNotion } from "@zetis/types";
import { Badge, Button, ConfirmDialog, Spinner } from "@zetis/ui";

// Rendu markdown compact des cartes (gras + listes lisibles, pas d'astérisques bruts).
const MD =
  "leading-snug [&_p]:m-0 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mt-0.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-black/20 [&_code]:px-1";

// Ligne « notion » (présentation pure). État en chip (jamais de rouge : échec ambre, suspendu
// ardoise, actif émeraude) + actions selon l'état. Aperçu recto/verso inline à la demande.

const CARD_TYPE_LABEL: Record<string, string> = {
  definition: "définition",
  method: "méthode",
  example: "exemple",
  error_correction: "erreur fréquente",
};

function StateChip({ notion }: { notion: SrsNotion }) {
  switch (notion.state) {
    case "ok":
      return (
        <Badge variant="success">
          ✓ {notion.card_count} carte{notion.card_count > 1 ? "s" : ""}
        </Badge>
      );
    case "failed":
      return <Badge variant="warning">✕ échec de génération</Badge>;
    case "suspended":
      return <Badge variant="muted">⏸ suspendue</Badge>;
    default:
      return <Badge variant="warning">⚡ à générer</Badge>;
  }
}

const TEXTAREA =
  "w-full resize-y rounded-md border border-border bg-background p-2 text-xs text-foreground focus:border-primary focus:outline-none";

// Carte unique : lecture (markdown recto/verso) OU édition INLINE (2 zones de texte, sur place).
// La suppression passe par un ConfirmDialog. Aucune donnée de planification n'est touchée.
function EditableCard({
  card,
  onEdit,
  onDelete,
}: {
  card: SrsCardContent;
  onEdit: (body: SrsCardUpdate) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front_markdown);
  const [back, setBack] = useState(card.back_markdown);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setFront(card.front_markdown);
    setBack(card.back_markdown);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await onEdit({ front_markdown: front, back_markdown: back });
      setEditing(false);
    } catch {
      // erreur remontée par le hook ; on reste en édition
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onDelete();
      setConfirmDelete(false);
    } catch {
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-border bg-card p-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {CARD_TYPE_LABEL[card.card_type] ?? card.card_type}
        </span>
        {!editing && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={startEdit}>
              ✏️ éditer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              🗑 supprimer
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">Recto</span>
            <textarea
              className={TEXTAREA}
              rows={2}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Verso
            </span>
            <textarea
              className={TEXTAREA}
              rows={3}
              value={back}
              onChange={(e) => setBack(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={busy || (!front.trim() && !back.trim())}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Recto (question) : cadre bleuté. */}
          <div className="rounded-md border border-sky-500/25 bg-sky-500/5 p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">Recto</p>
            <div className={`text-foreground ${MD}`}>
              <ReactMarkdown>{card.front_markdown}</ReactMarkdown>
            </div>
          </div>
          {/* Verso (réponse) : cadre émeraude. */}
          <div className="mt-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Verso
            </p>
            <div className={`text-emerald-50 ${MD}`}>
              <ReactMarkdown>{card.back_markdown}</ReactMarkdown>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Supprimer cette carte ?"
        confirmLabel="Supprimer"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      >
        Supprime cette carte <strong>ET</strong> son historique de révision. Action irréversible.
      </ConfirmDialog>
    </li>
  );
}

function CardPreview({
  cards,
  onEditCard,
  onDeleteCard,
}: {
  cards: SrsCardContent[] | undefined;
  onEditCard: (cardId: number, body: SrsCardUpdate) => Promise<void>;
  onDeleteCard: (cardId: number) => Promise<void>;
}) {
  if (!cards) return <p className="mt-2 text-xs text-muted-foreground">Chargement de l'aperçu…</p>;
  if (cards.length === 0)
    return <p className="mt-2 text-xs text-muted-foreground">Aucune carte.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-2.5">
      {cards.map((c) => (
        <EditableCard
          key={c.id}
          card={c}
          onEdit={(body) => onEditCard(c.id, body)}
          onDelete={() => onDeleteCard(c.id)}
        />
      ))}
    </ul>
  );
}

export interface NotionRowProps {
  notion: SrsNotion;
  busy: boolean;
  previewOpen: boolean;
  previewCards?: SrsCardContent[];
  onGenerate: () => void;
  onTogglePreview: () => void;
  onReactivate?: () => void;
  onRemove?: () => void;
  onEditCard: (cardId: number, body: SrsCardUpdate) => Promise<void>;
  onDeleteCard: (cardId: number) => Promise<void>;
}

export function NotionRow({
  notion,
  busy,
  previewOpen,
  previewCards,
  onGenerate,
  onTogglePreview,
  onReactivate,
  onRemove,
  onEditCard,
  onDeleteCard,
}: NotionRowProps) {
  const suspended = notion.state === "suspended";
  return (
    <li className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-foreground">{notion.name}</span>
          <StateChip notion={notion} />
        </div>
        <div className="flex items-center gap-1">
          {busy && <Spinner />}
          {suspended ? (
            <>
              <Button variant="ghost" size="sm" onClick={onReactivate} disabled={busy}>
                réactiver
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
                retirer
              </Button>
            </>
          ) : (
            <>
              {notion.state === "ok" && (
                <Button variant="ghost" size="sm" onClick={onTogglePreview} disabled={busy}>
                  {previewOpen ? "masquer" : "voir"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onGenerate} disabled={busy}>
                {notion.state === "ok"
                  ? "régénérer"
                  : notion.state === "failed"
                    ? "relancer"
                    : "générer"}
              </Button>
            </>
          )}
        </div>
      </div>
      {suspended && (
        <p className="mt-1 text-xs text-muted-foreground">
          Plus aucun cours validé ne couvre cette notion — la planification de Massimo est conservée.
        </p>
      )}
      {previewOpen && !suspended && (
        <CardPreview cards={previewCards} onEditCard={onEditCard} onDeleteCard={onDeleteCard} />
      )}
    </li>
  );
}
