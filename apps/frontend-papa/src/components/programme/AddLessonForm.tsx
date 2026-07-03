import { type FormEvent, useState } from "react";
import { type LessonManualCreateRequest } from "@zetis/types";
import { Badge, Button, Input } from "@zetis/ui";

// Formulaire d'ajout manuel inline d'une leçon (Lot 2 Slice B) : patron exact du
// formulaire d'ajout de chapitre — badge Manuel d'emblée, validée d'office (ADR-0009 §3).
// Pas de champ notions ici (édition des notions hors périmètre de la page).

export function AddLessonForm({
  onCreate,
  onCancel,
}: {
  onCreate: (data: LessonManualCreateRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onCreate({ title: title.trim(), summary: summary.trim() || null });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erreur lors de la création");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={handle}
      className="flex flex-col gap-3 rounded-xl border border-emerald-400/50 bg-papa-surface/60 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Ajouter une leçon</p>
        <Badge variant="success">Manuel</Badge>
        <span className="text-xs text-papa-muted">
          Validée d'office, intouchable par la régénération.
        </span>
      </div>
      <Input
        placeholder="Titre (requis)"
        aria-label="Titre de la leçon"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <Input
        placeholder="Résumé (optionnel)"
        aria-label="Résumé"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim() || saving}>
          {saving ? "Création…" : "Créer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
