import { type SrsCardContent, type SrsNotion } from "@zetis/types";
import { Badge, Button, Spinner } from "@zetis/ui";

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

function CardPreview({ cards }: { cards: SrsCardContent[] | undefined }) {
  if (!cards) return <p className="mt-2 text-xs text-muted-foreground">Chargement de l'aperçu…</p>;
  if (cards.length === 0)
    return <p className="mt-2 text-xs text-muted-foreground">Aucune carte.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-2 border-l-2 border-border pl-3">
      {cards.map((c) => (
        <li key={c.id} className="text-xs">
          <span className="mb-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {CARD_TYPE_LABEL[c.card_type] ?? c.card_type}
          </span>
          <p className="font-medium text-foreground">{c.front_markdown}</p>
          <p className="text-muted-foreground">{c.back_markdown}</p>
        </li>
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
      {previewOpen && !suspended && <CardPreview cards={previewCards} />}
    </li>
  );
}
