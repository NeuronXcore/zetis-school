import ReactMarkdown from "react-markdown";
import { type SrsCardContent, type SrsNotion } from "@zetis/types";
import { Badge, Button, Spinner } from "@zetis/ui";

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

function CardPreview({ cards }: { cards: SrsCardContent[] | undefined }) {
  if (!cards) return <p className="mt-2 text-xs text-muted-foreground">Chargement de l'aperçu…</p>;
  if (cards.length === 0)
    return <p className="mt-2 text-xs text-muted-foreground">Aucune carte.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-2.5">
      {cards.map((c) => (
        <li key={c.id} className="rounded-lg border border-border bg-card p-2.5 text-xs">
          <span className="mb-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {CARD_TYPE_LABEL[c.card_type] ?? c.card_type}
          </span>
          {/* Recto (question) : cadre neutre, étiquette bleutée. */}
          <div className="rounded-md border border-sky-500/25 bg-sky-500/5 p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">Recto</p>
            <div className={`text-foreground ${MD}`}>
              <ReactMarkdown>{c.front_markdown}</ReactMarkdown>
            </div>
          </div>
          {/* Verso (réponse) : cadre émeraude, texte clair — bien plus visible qu'avant. */}
          <div className="mt-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Verso</p>
            <div className={`text-emerald-50 ${MD}`}>
              <ReactMarkdown>{c.back_markdown}</ReactMarkdown>
            </div>
          </div>
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
