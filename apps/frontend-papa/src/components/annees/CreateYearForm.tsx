import { type FormEvent, useState } from "react";
import { type SchoolYearCreateRequest } from "@zetis/types";
import { Badge, Button, Input, Select } from "@zetis/ui";

// Formulaire de création d'une année (carte inline, pattern AddChapterForm de la page
// Programme). Statut initial `draft` (posé par le backend) : l'activation est un geste
// séparé — une seule année active à la fois. Pas de copie inter-années ici (Lot 3).

// Collège cycle 3/4 ; le lycée arrivera le moment venu (ADR-0009 §8, modèle déjà prêt).
const LEVELS = ["6e", "5e", "4e", "3e"];

export function CreateYearForm({
  onCreate,
  onCancel,
}: {
  onCreate: (data: SchoolYearCreateRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [level, setLevel] = useState("4e");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onCreate({
        label: label.trim(),
        level,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handle}
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-emerald-400/50 bg-papa-surface/60 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Créer une année</p>
        <Badge variant="warning">Brouillon</Badge>
        <span className="text-xs text-papa-muted">
          Créée en brouillon — l'activation archive l'année active précédente.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input
          placeholder="Libellé (ex. 2027-2028)"
          aria-label="Libellé"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
        <Select
          aria-label="Niveau"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label="Date de début"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
        />
        <Input
          type="date"
          aria-label="Date de fin"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
        />
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!label.trim() || saving}>
          {saving ? "Création…" : "Créer"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
