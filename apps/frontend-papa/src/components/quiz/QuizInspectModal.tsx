import { useState } from "react";
import {
  type ManualQuestionCreate,
  type PapaQuizDetail,
  type PapaQuizQuestion,
  type QuestionPatch,
} from "@zetis/types";
import { formatLabel } from "../../lib/quizPilotage";

// Modale d'inspection d'un quiz (page Papa « Quiz — pilotage »). PRÉSENTATIONNELLE : toute la
// logique (fetch/patch/retire/add/regenerate/delete) est portée par le hook via les callbacks.
// Asymétrie serveur assumée : c'est le SEUL endroit où la clé et l'explication sont visibles.

interface Props {
  detail: PapaQuizDetail;
  busy: boolean;
  onClose: () => void;
  onEdit: (questionId: number, body: QuestionPatch) => Promise<void>;
  onAdd: (quizId: number, body: ManualQuestionCreate) => Promise<void>;
  onRetire: (questionId: number) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onDelete: () => Promise<void>;
}

/** Rendu lisible de la clé selon le format (Papa voit toujours la bonne réponse). */
function KeyView({ q }: { q: PapaQuizQuestion }) {
  const key = q.correct_answer_json;
  const choices = Array.isArray(q.choices_json) ? (q.choices_json as string[]) : null;

  if ((q.question_type === "mcq" || q.question_type === "mcq_multi") && choices) {
    const correct =
      q.question_type === "mcq"
        ? new Set([Number(key)])
        : new Set((Array.isArray(key) ? key : []).map(Number));
    return (
      <div className="space-y-1">
        {choices.map((c, i) => (
          <div
            key={i}
            className={[
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
              correct.has(i)
                ? "border-papa-accent/40 bg-papa-accent/10 font-semibold text-papa-accent"
                : "border-transparent text-papa-text",
            ].join(" ")}
          >
            <span>{c}</span>
            {correct.has(i) && <span className="ml-auto text-xs font-bold">✓ CLÉ</span>}
          </div>
        ))}
      </div>
    );
  }
  if (q.question_type === "true_false") {
    return <p className="text-sm font-semibold text-papa-accent">Réponse : {key ? "Vrai" : "Faux"} ✓</p>;
  }
  if (q.question_type === "cloze") {
    const blanks = (key as { blanks?: string[][] })?.blanks ?? [];
    return (
      <p className="text-sm font-semibold text-papa-accent">
        Trous : {blanks.map((opts) => `[${opts.join(" / ")}]`).join("  ")} ✓
      </p>
    );
  }
  if (q.question_type === "numeric") {
    const k = key as { value?: unknown; tolerance?: number; accept?: string[] };
    return (
      <p className="text-sm font-semibold text-papa-accent">
        Réponse : {String(k?.value ?? "")}
        {k?.tolerance != null ? ` (± ${k.tolerance})` : ""}
        {k?.accept?.length ? ` ou ${k.accept.join(", ")}` : ""} ✓
      </p>
    );
  }
  if (q.question_type === "ordering") {
    const order = (key as { order?: string[] })?.order ?? [];
    return <p className="text-sm font-semibold text-papa-accent">Ordre : {order.join(" → ")} ✓</p>;
  }
  if (q.question_type === "matching") {
    const pairs = (key as { pairs?: Record<string, string> })?.pairs ?? {};
    return (
      <p className="text-sm font-semibold text-papa-accent">
        {Object.entries(pairs).map(([l, r]) => `${l} → ${r}`).join("  ·  ")} ✓
      </p>
    );
  }
  return <pre className="text-xs text-papa-muted">{JSON.stringify(key)}</pre>;
}

/** Édition d'une question. Formulaire mcq complet ; autres formats : énoncé + explication. */
function EditForm({
  q,
  onSave,
  onCancel,
}: {
  q: PapaQuizQuestion;
  onSave: (body: QuestionPatch) => Promise<void>;
  onCancel: () => void;
}) {
  const isMcq = q.question_type === "mcq";
  const initialChoices = Array.isArray(q.choices_json) ? (q.choices_json as string[]) : [];
  const [prompt, setPrompt] = useState(q.prompt_markdown);
  const [explanation, setExplanation] = useState(q.explanation_markdown ?? "");
  const [choices, setChoices] = useState<string[]>(initialChoices);
  const [correct, setCorrect] = useState<number>(isMcq ? Number(q.correct_answer_json) : 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const body: QuestionPatch = { prompt_markdown: prompt, explanation_markdown: explanation };
    if (isMcq) {
      body.choices_json = choices;
      body.correct_answer_json = correct;
    }
    try {
      await onSave(body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border-t border-dashed border-papa-border pt-3">
      <label className="mb-1 block text-xs text-papa-muted">Énoncé</label>
      <input
        className="w-full rounded-lg border border-papa-border px-3 py-2 text-sm"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      {isMcq && (
        <>
          <label className="mb-1 mt-3 block text-xs text-papa-muted">Choix (clé = bouton radio)</label>
          {choices.map((c, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-2">
              <input
                type="radio"
                name={`key-${q.id}`}
                checked={correct === i}
                onChange={() => setCorrect(i)}
                className="accent-papa-accent"
              />
              <input
                className="flex-1 rounded-lg border border-papa-border px-3 py-1.5 text-sm"
                value={c}
                onChange={(e) =>
                  setChoices((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))
                }
              />
            </div>
          ))}
        </>
      )}
      <label className="mb-1 mt-3 block text-xs text-papa-muted">Explication (feedback Massimo)</label>
      <textarea
        rows={2}
        className="w-full rounded-lg border border-papa-border px-3 py-2 text-sm"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
      />
      <p className="mt-2 text-[11px] italic text-papa-muted">
        Enregistrer passe cette question en <b>Manuel</b> : elle survivra aux régénérations ↻.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded-lg border border-papa-border px-3 py-1.5 text-sm" onClick={onCancel}>
          Annuler
        </button>
        <button
          className="rounded-lg bg-papa-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={save}
          disabled={saving}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

const BLANK_MCQ: ManualQuestionCreate = {
  question_type: "mcq",
  prompt_markdown: "",
  choices_json: ["", "", "", ""],
  correct_answer_json: 0,
  explanation_markdown: "",
};

export function QuizInspectModal({
  detail,
  busy,
  onClose,
  onEdit,
  onAdd,
  onRetire,
  onRegenerate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ManualQuestionCreate>(BLANK_MCQ);
  const [savingAdd, setSavingAdd] = useState(false);

  const active = detail.questions.filter((q) => q.status !== "retired");
  const retired = detail.questions.filter((q) => q.status === "retired");

  const submitAdd = async () => {
    setSavingAdd(true);
    try {
      await onAdd(detail.quiz_id, draft);
      setDraft(BLANK_MCQ);
      setAdding(false);
    } finally {
      setSavingAdd(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-bold">{detail.title}</h2>
          <button className="text-xl text-papa-muted" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-papa-muted">
          Fin de cours · {active.length} question(s) active(s)
          {retired.length > 0 && ` · ${retired.length} retirée(s)`} · moteur local · clés visibles
          ici uniquement (Massimo ne les reçoit jamais).
        </p>

        {[...active, ...retired].map((q, idx) => (
          <div
            key={q.id}
            className={[
              "mb-3 rounded-xl border border-papa-border p-4",
              q.status === "retired" ? "bg-papa-surface-2/50 opacity-60" : "",
            ].join(" ")}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-papa-muted">
                Q{idx + 1} · <span className="text-papa-text">{formatLabel(q.question_type)}</span>
                {q.source === "manual" && (
                  <span className="ml-1 rounded-full bg-papa-accent/15 px-2 py-0.5 text-[10px] text-papa-accent">
                    Manuel
                  </span>
                )}
                {q.status === "retired" && (
                  <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">
                    Retirée
                  </span>
                )}
                {" · "}
                notion : {q.skill_name}
              </span>
              {q.status !== "retired" && (
                <span className="flex shrink-0 gap-1.5">
                  <button
                    className="rounded-lg border border-papa-border px-2.5 py-1 text-xs"
                    onClick={() => setEditing((cur) => (cur === q.id ? null : q.id))}
                  >
                    ✏️ Éditer
                  </button>
                  <button
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-700"
                    onClick={() => onRetire(q.id)}
                  >
                    Retirer
                  </button>
                </span>
              )}
            </div>
            <p className="mb-2 text-sm font-semibold">{q.prompt_markdown}</p>
            {q.status !== "retired" && <KeyView q={q} />}
            {q.explanation_markdown && q.status !== "retired" && (
              <div className="mt-2 rounded-r-lg border-l-[3px] border-papa-accent bg-papa-surface-2/60 px-3 py-2 text-xs text-papa-muted">
                <b className="text-papa-text">Explication servie à Massimo :</b>{" "}
                {q.explanation_markdown}
              </div>
            )}
            {editing === q.id && (
              <EditForm
                q={q}
                onCancel={() => setEditing(null)}
                onSave={async (body) => {
                  await onEdit(q.id, body);
                  setEditing(null);
                }}
              />
            )}
          </div>
        ))}

        {adding && (
          <div className="mb-3 rounded-xl border border-dashed border-papa-accent/50 p-4">
            <p className="mb-2 text-xs font-semibold text-papa-accent">Nouvelle question manuelle (QCM)</p>
            <input
              className="mb-2 w-full rounded-lg border border-papa-border px-3 py-2 text-sm"
              placeholder="Énoncé"
              value={draft.prompt_markdown}
              onChange={(e) => setDraft((d) => ({ ...d, prompt_markdown: e.target.value }))}
            />
            {(draft.choices_json as string[]).map((c, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2">
                <input
                  type="radio"
                  name="add-key"
                  checked={draft.correct_answer_json === i}
                  onChange={() => setDraft((d) => ({ ...d, correct_answer_json: i }))}
                  className="accent-papa-accent"
                />
                <input
                  className="flex-1 rounded-lg border border-papa-border px-3 py-1.5 text-sm"
                  placeholder={`Choix ${i + 1}`}
                  value={c}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      choices_json: (d.choices_json as string[]).map((x, j) =>
                        j === i ? e.target.value : x,
                      ),
                    }))
                  }
                />
              </div>
            ))}
            <textarea
              rows={2}
              className="mt-1 w-full rounded-lg border border-papa-border px-3 py-2 text-sm"
              placeholder="Explication (feedback Massimo)"
              value={draft.explanation_markdown ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, explanation_markdown: e.target.value }))}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="rounded-lg border border-papa-border px-3 py-1.5 text-sm"
                onClick={() => setAdding(false)}
              >
                Annuler
              </button>
              <button
                className="rounded-lg bg-papa-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={submitAdd}
                disabled={savingAdd || !draft.prompt_markdown.trim()}
              >
                Ajouter
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-papa-border pt-3">
          {!adding && (
            <button
              className="text-sm font-semibold text-papa-accent hover:underline"
              onClick={() => setAdding(true)}
            >
              + Ajouter une question manuelle
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              className="rounded-lg border border-papa-border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={onRegenerate}
              disabled={busy}
              title="Remplace les questions IA depuis le cours actuel — les manuelles sont préservées"
            >
              ↻ Régénérer
            </button>
            <button
              className="rounded-lg border border-papa-border px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
              onClick={onDelete}
              disabled={busy}
              title="Des tentatives → archivage (le quiz sort du service, l'historique reste)"
            >
              🗑 Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
