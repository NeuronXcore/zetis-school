import { type ReactElement, useEffect, useMemo, useState } from "react";
import { type StudentQuizQuestion } from "@zetis/types";

// Saisie de réponse par format (les 7 du Lot 1). Chaque format = un petit composant isolé
// (hooks propres, pas de hook conditionnel). `onChange(answerJson, answerable)` remonte la
// réponse au format attendu par les correcteurs serveur + un booléen « prête à valider ».
// `disabled` fige la saisie une fois la réponse envoyée (pendant le feedback).

type Change = (answerJson: unknown, answerable: boolean) => void;

interface Props {
  question: StudentQuizQuestion;
  onChange: Change;
  disabled: boolean;
}

const OPT_BASE =
  "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-[15px] transition disabled:opacity-60";
const OPT_OFF = "border-white/10 bg-white/5 hover:border-indigo-400/70";
const OPT_ON = "border-cyan-400 bg-cyan-400/10 shadow-[0_0_18px_rgba(34,211,238,0.2)]";

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map(String) : [];
}

function McqInput({ question, onChange, disabled }: Props) {
  const choices = asStrings(question.choices_json);
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2.5">
      {choices.map((c, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          className={`${OPT_BASE} ${sel === i ? OPT_ON : OPT_OFF}`}
          onClick={() => {
            setSel(i);
            onChange({ choice_index: i }, true);
          }}
        >
          <span
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs ${sel === i ? "border-cyan-400 bg-cyan-400 font-extrabold text-slate-900" : "border-slate-400"}`}
          >
            {sel === i ? "✓" : ""}
          </span>
          {c}
        </button>
      ))}
    </div>
  );
}

function MultiInput({ question, onChange, disabled }: Props) {
  const choices = asStrings(question.choices_json);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const toggle = (i: number) => {
    const next = new Set(sel);
    next.has(i) ? next.delete(i) : next.add(i);
    setSel(next);
    onChange({ choice_indices: [...next] }, next.size > 0);
  };
  return (
    <div className="flex flex-col gap-2.5">
      {choices.map((c, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          className={`${OPT_BASE} ${sel.has(i) ? OPT_ON : OPT_OFF}`}
          onClick={() => toggle(i)}
        >
          <span
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 text-xs ${sel.has(i) ? "border-cyan-400 bg-cyan-400 font-extrabold text-slate-900" : "border-slate-400"}`}
          >
            {sel.has(i) ? "✓" : ""}
          </span>
          {c}
        </button>
      ))}
    </div>
  );
}

function TrueFalseInput({ onChange, disabled }: Props) {
  const [val, setVal] = useState<boolean | null>(null);
  const pick = (v: boolean) => {
    setVal(v);
    onChange({ value: v }, true);
  };
  return (
    <div className="flex gap-3">
      {[
        { v: true, label: "Vrai" },
        { v: false, label: "Faux" },
      ].map(({ v, label }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          className={`flex-1 rounded-2xl border px-4 py-4 text-base font-semibold transition ${val === v ? OPT_ON : OPT_OFF}`}
          onClick={() => pick(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ClozeInput({ question, onChange, disabled }: Props) {
  // Nombre de trous = occurrences de « ___ » dans l'énoncé (au moins un).
  const blankCount = useMemo(
    () => Math.max(1, (question.prompt_markdown.match(/_{3,}/g) ?? []).length),
    [question.prompt_markdown],
  );
  const [vals, setVals] = useState<string[]>(() => Array(blankCount).fill(""));
  const setAt = (i: number, s: string) => {
    const next = vals.map((x, j) => (j === i ? s : x));
    setVals(next);
    onChange({ blanks: next }, next.every((x) => x.trim() !== ""));
  };
  return (
    <div className="flex flex-col gap-2.5">
      {vals.map((v, i) => (
        <input
          key={i}
          type="text"
          disabled={disabled}
          autoComplete="off"
          placeholder={blankCount > 1 ? `Trou ${i + 1}…` : "Écris ta réponse…"}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-center text-[17px] outline-none focus:border-cyan-400"
          value={v}
          onChange={(e) => setAt(i, e.target.value)}
        />
      ))}
    </div>
  );
}

function NumericInput({ onChange, disabled }: Props) {
  const [val, setVal] = useState("");
  return (
    <input
      type="text"
      disabled={disabled}
      autoComplete="off"
      placeholder="Ta réponse…"
      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-center text-[17px] outline-none focus:border-cyan-400"
      value={val}
      onChange={(e) => {
        setVal(e.target.value);
        onChange({ value: e.target.value }, e.target.value.trim() !== "");
      }}
    />
  );
}

function OrderingInput({ question, onChange, disabled }: Props) {
  const items = useMemo(() => {
    const src = (question.choices_json as { items?: unknown })?.items;
    return asStrings(src);
  }, [question.choices_json]);
  const [order, setOrder] = useState<string[]>(items);
  // L'ordre initial est déjà une réponse valide (l'élève confirme ou réarrange).
  useEffect(() => {
    onChange({ order: items }, items.length > 0);
    // au montage uniquement (la question change → composant remonté via key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    onChange({ order: next }, true);
  };
  return (
    <div className="flex flex-col gap-2">
      {order.map((label, i) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-[15px]"
        >
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-xs font-extrabold text-cyan-300">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">{label}</span>
          <span className="flex gap-1.5">
            <button
              type="button"
              disabled={disabled || i === 0}
              className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 disabled:opacity-30"
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={disabled || i === order.length - 1}
              className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 disabled:opacity-30"
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchingInput({ question, onChange, disabled }: Props) {
  const left = asStrings((question.choices_json as { left?: unknown })?.left);
  const right = asStrings((question.choices_json as { right?: unknown })?.right);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const setPick = (l: string, r: string) => {
    const next = { ...picks, [l]: r };
    if (r === "") delete next[l];
    setPicks(next);
    onChange({ pairs: next }, left.every((x) => next[x]));
  };
  return (
    <div className="flex flex-col gap-2.5">
      {left.map((l) => (
        <div key={l} className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm">{l}</div>
          <select
            disabled={disabled}
            className="max-w-[220px] rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm outline-none focus:border-cyan-400"
            value={picks[l] ?? ""}
            onChange={(e) => setPick(l, e.target.value)}
          >
            <option value="">— choisis —</option>
            {right.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

const BY_TYPE: Record<string, (p: Props) => ReactElement> = {
  mcq: McqInput,
  mcq_multi: MultiInput,
  true_false: TrueFalseInput,
  cloze: ClozeInput,
  numeric: NumericInput,
  ordering: OrderingInput,
  matching: MatchingInput,
};

export function QuizAnswerInput(props: Props) {
  const Component = BY_TYPE[props.question.question_type];
  if (!Component) {
    return <p className="text-sm text-amber-300">Format de question non pris en charge.</p>;
  }
  return <Component {...props} />;
}
