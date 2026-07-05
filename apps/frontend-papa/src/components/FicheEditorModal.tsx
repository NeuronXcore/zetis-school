import { useEffect, useState } from "react";
import { Button, Input } from "@zetis/ui";
import {
  FICHE_BUDGETS,
  type FicheDefinition,
  type FicheDetail,
  type FicheSpec,
} from "@zetis/types";
import { updateFiche } from "../lib/fiches";

// Éditeur STRUCTURÉ d'une fiche (Papa) — remplace l'édition du spec_json brut. Champs libellés
// + listes (définitions / points-clés / pièges) avec ⊕ ajouter et × retirer, compteurs de budget.
// `subject`/`level` sont l'identité de la fiche : affichés en lecture seule, reportés inchangés.
// Le PUT /api/fiches/{id} revalide le spec (Pydantic = garde ultime) → la fiche repasse `pending`.

const TEXTAREA =
  "mt-1 w-full resize-y rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm " +
  "text-papa-text placeholder:text-papa-muted focus:border-papa-accent focus:outline-none";
const REMOVE_BTN =
  "shrink-0 rounded-lg border border-papa-border px-2.5 py-1.5 text-papa-muted hover:text-rose-300";
const ADD_BTN =
  "self-start rounded-full border border-dashed border-papa-border px-3 py-1 text-xs " +
  "text-papa-muted hover:text-papa-text disabled:opacity-40";

function Counter({ n, max }: { n: number; max: number }) {
  return (
    <span className={`text-xs tabular-nums ${n >= max ? "text-papa-warn" : "text-papa-muted"}`}>
      {n}/{max}
    </span>
  );
}

function CharCount({ len, max }: { len: number; max: number }) {
  return (
    <span className={`text-xs tabular-nums ${len > max * 0.9 ? "text-papa-warn" : "text-papa-muted"}`}>
      {len}/{max}
    </span>
  );
}

function StringListField({
  icon,
  label,
  items,
  max,
  maxLen,
  placeholder,
  onChange,
}: {
  icon: string;
  label: string;
  items: string[];
  max: number;
  maxLen: number;
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-papa-muted">
          {icon} {label}
        </span>
        <Counter n={items.length} max={max} />
      </div>
      <div className="flex flex-col gap-2">
        {items.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={v}
              maxLength={maxLen}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              aria-label="Retirer"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className={REMOVE_BTN}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={items.length >= max}
          onClick={() => onChange([...items, ""])}
          className={ADD_BTN}
        >
          ⊕ ajouter
        </button>
      </div>
    </div>
  );
}

function DefinitionListField({
  items,
  onChange,
}: {
  items: FicheDefinition[];
  onChange: (next: FicheDefinition[]) => void;
}) {
  const max = FICHE_BUDGETS.definitions;
  const patch = (i: number, key: "terme" | "definition", value: string) =>
    onChange(items.map((d, j) => (j === i ? { ...d, [key]: value } : d)));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-papa-muted">📖 Les mots à connaître</span>
        <Counter n={items.length} max={max} />
      </div>
      <div className="flex flex-col gap-3">
        {items.map((d, i) => (
          <div key={i} className="rounded-lg border border-papa-border/70 bg-papa-bg p-3">
            <div className="flex items-center gap-2">
              <Input
                value={d.terme}
                maxLength={FICHE_BUDGETS.terme}
                placeholder="Terme"
                onChange={(e) => patch(i, "terme", e.target.value)}
              />
              <button
                type="button"
                aria-label="Retirer la définition"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className={REMOVE_BTN}
              >
                ×
              </button>
            </div>
            <textarea
              value={d.definition}
              maxLength={FICHE_BUDGETS.definition}
              rows={2}
              placeholder="Définition (une phrase)"
              onChange={(e) => patch(i, "definition", e.target.value)}
              className={TEXTAREA}
            />
          </div>
        ))}
        <button
          type="button"
          disabled={items.length >= max}
          onClick={() => onChange([...items, { terme: "", definition: "" }])}
          className={ADD_BTN}
        >
          ⊕ ajouter une définition
        </button>
      </div>
    </div>
  );
}

export interface FicheEditorModalProps {
  fiche: FicheDetail;
  onClose: () => void;
  onSaved: (updated: FicheDetail) => void;
}

export function FicheEditorModal({ fiche, onClose, onSaved }: FicheEditorModalProps) {
  // Copie PROFONDE (les tableaux doivent être dupliqués, sinon on mute le spec d'origine).
  const [draft, setDraft] = useState<FicheSpec>(() => ({
    ...fiche.spec,
    definitions: fiche.spec.definitions.map((d) => ({ ...d })),
    points_cles: [...fiche.spec.points_cles],
    erreurs_a_eviter: [...fiche.spec.erreurs_a_eviter],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function onSave() {
    const trim = (s: string) => s.trim();
    // Normalisation : trims, lignes vides retirées, optionnels vides → omis. subject/level portés.
    const definitions = draft.definitions
      .map((d) => ({ terme: trim(d.terme), definition: trim(d.definition) }))
      .filter((d) => d.terme !== "" || d.definition !== "");
    const points_cles = draft.points_cles.map(trim).filter((s) => s !== "");
    const erreurs_a_eviter = draft.erreurs_a_eviter.map(trim).filter((s) => s !== "");
    const title = trim(draft.title);
    const essentiel = trim(draft.essentiel);
    const chapter = draft.chapter && trim(draft.chapter) ? trim(draft.chapter) : undefined;
    const miniExemple =
      draft.mini_exemple && trim(draft.mini_exemple) ? trim(draft.mini_exemple) : undefined;

    // Validation cliente conviviale (le serveur reste la garde dure).
    if (!title) return setError("Le titre est obligatoire.");
    if (!essentiel) return setError("« L'essentiel » est obligatoire.");
    if (definitions.some((d) => !d.terme || !d.definition)) {
      return setError("Chaque définition doit avoir un terme ET une définition.");
    }

    const spec: FicheSpec = {
      title,
      subject: draft.subject,
      level: draft.level,
      chapter,
      essentiel,
      definitions,
      points_cles,
      erreurs_a_eviter,
      mini_exemple: miniExemple,
    };

    setBusy(true);
    setError(null);
    try {
      const updated = await updateFiche(fiche.id, spec);
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement échoué (schéma invalide ?).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Éditer la fiche"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-papa-accent/30 bg-papa-surface p-5 shadow-[0_0_45px_-10px_rgba(16,185,129,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-bold text-papa-text">
            🗂️ Éditer la fiche <span className="text-papa-muted">— {fiche.title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg border border-papa-border px-3 py-1.5 text-sm hover:text-papa-accent"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="papa-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-papa-muted">
            {draft.subject} · {draft.level} <span className="opacity-60">(non modifiable)</span>
          </p>

          <label className="block text-sm">
            <span className="text-papa-muted">Titre</span>
            <Input
              className="mt-1"
              value={draft.title}
              maxLength={FICHE_BUDGETS.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-papa-muted">Chapitre (facultatif)</span>
            <Input
              className="mt-1"
              value={draft.chapter ?? ""}
              maxLength={FICHE_BUDGETS.chapter}
              onChange={(e) => setDraft((d) => ({ ...d, chapter: e.target.value }))}
            />
          </label>

          <label className="block text-sm">
            <span className="flex items-center justify-between">
              <span className="text-papa-muted">⭐ L'essentiel</span>
              <CharCount len={draft.essentiel.length} max={FICHE_BUDGETS.essentiel} />
            </span>
            <textarea
              className={TEXTAREA}
              rows={4}
              value={draft.essentiel}
              maxLength={FICHE_BUDGETS.essentiel}
              onChange={(e) => setDraft((d) => ({ ...d, essentiel: e.target.value }))}
            />
          </label>

          <DefinitionListField
            items={draft.definitions}
            onChange={(next) => setDraft((d) => ({ ...d, definitions: next }))}
          />

          <StringListField
            icon="🔑"
            label="À retenir"
            items={draft.points_cles}
            max={FICHE_BUDGETS.pointsCles}
            maxLen={FICHE_BUDGETS.ligne}
            placeholder="Un point clé, court"
            onChange={(next) => setDraft((d) => ({ ...d, points_cles: next }))}
          />

          <StringListField
            icon="⚠️"
            label="Pièges à éviter"
            items={draft.erreurs_a_eviter}
            max={FICHE_BUDGETS.erreurs}
            maxLen={FICHE_BUDGETS.ligne}
            placeholder="Un piège fréquent"
            onChange={(next) => setDraft((d) => ({ ...d, erreurs_a_eviter: next }))}
          />

          <label className="block text-sm">
            <span className="flex items-center justify-between">
              <span className="text-papa-muted">💡 Un exemple (facultatif)</span>
              <CharCount len={(draft.mini_exemple ?? "").length} max={FICHE_BUDGETS.miniExemple} />
            </span>
            <textarea
              className={TEXTAREA}
              rows={3}
              value={draft.mini_exemple ?? ""}
              maxLength={FICHE_BUDGETS.miniExemple}
              onChange={(e) => setDraft((d) => ({ ...d, mini_exemple: e.target.value }))}
            />
          </label>

          {error && (
            <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
          )}
        </div>

        {/* Footer collant */}
        <div className="mt-3 flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs text-papa-muted">
            L'enregistrement revalide le schéma ; la fiche repasse « à valider ».
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button size="sm" onClick={onSave} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
