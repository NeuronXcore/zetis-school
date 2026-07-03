import { type FormEvent, useState } from "react";
import { type CurriculumChapter } from "@zetis/types";
import { Badge, Button, Input, Select } from "@zetis/ui";
import { type AddPosition } from "../../hooks/useCurriculum";

// Formulaire d'ajout manuel inline (spec) : carte en tête de liste, bordure émeraude,
// badge Manuel d'emblée — un chapitre écrit par Papa est validé d'office (ADR-0009 §3).

export function AddChapterForm({
  chapters,
  onCreate,
  onCancel,
}: {
  chapters: CurriculumChapter[];
  onCreate: (
    data: { name: string; description?: string | null },
    position: AddPosition,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [position, setPosition] = useState("end");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const pos: AddPosition =
        position === "end"
          ? { kind: "end" }
          : position === "start"
            ? { kind: "start" }
            : { kind: "after", chapterId: Number(position) };
      await onCreate({ name: name.trim(), description: description.trim() || null }, pos);
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
      className="flex flex-col gap-3 rounded-2xl border border-emerald-400/50 bg-papa-surface/60 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Ajouter un chapitre</p>
        <Badge variant="success">Manuel</Badge>
        <span className="text-xs text-papa-muted">
          Validé d'office, intouchable par la régénération.
        </span>
      </div>
      <Input
        placeholder="Titre (requis)"
        aria-label="Titre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[240px_1fr]">
        <Select
          aria-label="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        >
          <option value="end">À la fin</option>
          <option value="start">Au début</option>
          {chapters.map((c) => (
            <option key={c.id} value={String(c.id)}>
              Après « {c.name} »
            </option>
          ))}
        </Select>
        <Input
          placeholder="Description (optionnelle, visible par Massimo)"
          aria-label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim() || saving}>
          {saving ? "Création…" : "Créer"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
