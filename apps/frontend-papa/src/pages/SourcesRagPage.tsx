import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import {
  fetchDocuments,
  setValidation,
  uploadDocument,
  type RagDocument,
  type ValidationStatus,
} from "../lib/rag";

// Sources de cours RAG (Étape 12) — côté Papa : upload de fichiers (MD/TXT/PDF)
// puis validation manuelle. Seules les sources validées alimentent les explications IA.

const STATUS_STYLE: Record<ValidationStatus, { label: string; className: string }> = {
  pending: { label: "À valider", className: "bg-amber-500/15 text-amber-300" },
  validated: { label: "Validée", className: "bg-emerald-500/15 text-emerald-300" },
  rejected: { label: "Rejetée", className: "bg-rose-500/15 text-rose-300" },
  official: { label: "Officielle", className: "bg-sky-500/15 text-sky-300" },
};

function StatusBadge({ status }: { status: ValidationStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

export function SourcesRagPage() {
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [chapter, setChapter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      setDocs(await fetchDocuments());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Sélectionne un fichier (MD, TXT ou PDF).");
      return;
    }
    setBusy(true);
    try {
      await uploadDocument(file, {
        title: title.trim() || undefined,
        level: level.trim() || undefined,
        chapter: chapter.trim() || undefined,
      });
      setTitle("");
      setLevel("");
      setChapter("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload impossible");
    } finally {
      setBusy(false);
    }
  }

  async function onDecision(doc: RagDocument, action: "validate" | "reject") {
    setBusy(true);
    try {
      await setValidation(doc.id, action);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Sources de cours"
        subtitle="Importe des documents (MD, TXT, PDF) et valide ceux qui alimentent l'IA."
      />

      <form
        onSubmit={onUpload}
        className="mb-6 space-y-3 rounded-xl border border-papa-border bg-papa-surface p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (optionnel — sinon nom du fichier)"
            className="rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,.pdf"
            className="rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-papa-accent file:px-3 file:py-1 file:text-papa-bg"
          />
          <input
            type="text"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="Niveau (ex. 4e)"
            className="rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            placeholder="Chapitre (ex. Nombres relatifs)"
            className="rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg disabled:opacity-50"
        >
          {busy ? "Traitement…" : "Importer la source"}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-papa-muted">Chargement des sources…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-papa-muted">Aucune source importée pour l'instant.</p>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-papa-border bg-papa-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{doc.title}</p>
                <StatusBadge status={doc.validation_status} />
              </div>
              <p className="mt-1 text-xs text-papa-muted">
                {doc.chunks} extrait{doc.chunks > 1 ? "s" : ""}
                {doc.level ? ` · ${doc.level}` : ""}
                {doc.chapter ? ` · ${doc.chapter}` : ""}
                {` · ${doc.source_type}`}
              </p>
              {doc.validation_status !== "official" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || doc.validation_status === "validated"}
                    onClick={() => void onDecision(doc, "validate")}
                    className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40"
                  >
                    Valider
                  </button>
                  <button
                    type="button"
                    disabled={busy || doc.validation_status === "rejected"}
                    onClick={() => void onDecision(doc, "reject")}
                    className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 disabled:opacity-40"
                  >
                    Rejeter
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
