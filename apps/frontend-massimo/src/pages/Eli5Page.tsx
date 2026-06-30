import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { ZetisAvatar } from "../components/ZetisAvatar";
import {
  type Eli5Explain,
  type Eli5Reverse,
  type Skill,
  explainEli5,
  fetchSkills,
  reverseEli5,
} from "../lib/eli5";

// Page ELI5 Massimo (Étape 10) — branchée sur la boucle pédagogique du backend.
export function Eli5Page() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillId, setSkillId] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<Eli5Explain | null>(null);
  const [myText, setMyText] = useState("");
  const [reverse, setReverse] = useState<Eli5Reverse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSkills()
      .then((list) => {
        setSkills(list);
        if (list.length > 0) setSkillId(list[0].id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur de chargement"));
  }, []);

  async function onExplain() {
    if (skillId == null) return;
    setBusy(true);
    setError(null);
    setReverse(null);
    try {
      setExplanation(await explainEli5(skillId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function onReverse() {
    if (skillId == null) return;
    setBusy(true);
    setError(null);
    try {
      setReverse(await reverseEli5(skillId, myText));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ELI5" subtitle="ZETIS t'explique, puis tu réexpliques pour vérifier." />

      <div className="flex flex-wrap gap-2">
        <select
          value={skillId ?? ""}
          onChange={(e) => setSkillId(Number(e.target.value))}
          className="flex-1 rounded-lg border border-zetis-border bg-zetis-surface px-3 py-2 outline-none focus:border-zetis-accent"
        >
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.subject})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onExplain}
          disabled={busy || skillId == null}
          className="rounded-lg bg-zetis-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "…" : "Expliquer"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {explanation && (
        <section className="mt-4 flex gap-3 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
          <ZetisAvatar size={40} />
          <div className="text-sm">
            <p className="font-semibold text-zetis-accent-2">{explanation.title}</p>
            <p className="mt-1">{explanation.simple_explanation}</p>
            <p className="mt-2 text-zetis-muted">
              <strong>Analogie :</strong> {explanation.analogy}
            </p>
            <p className="mt-1 text-zetis-muted">
              <strong>Exemple :</strong> {explanation.example}
            </p>
            <p className="mt-2">
              <strong>Mini-question :</strong> {explanation.check_question}
            </p>
          </div>
        </section>
      )}

      {explanation && (
        <section className="mt-4">
          <p className="mb-2 text-sm text-zetis-muted">Maintenant, explique à ZETIS :</p>
          <textarea
            value={myText}
            onChange={(e) => setMyText(e.target.value)}
            rows={3}
            placeholder="Écris l'explication avec tes mots…"
            className="w-full rounded-lg border border-zetis-border bg-zetis-surface px-3 py-2 outline-none focus:border-zetis-accent"
          />
          <button
            type="button"
            onClick={onReverse}
            disabled={busy || myText.trim().length === 0}
            className="mt-2 rounded-lg border border-zetis-border px-4 py-2 text-sm font-medium hover:bg-zetis-surface-2 disabled:opacity-60"
          >
            Envoyer à ZETIS
          </button>
        </section>
      )}

      {reverse && (
        <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface-2 p-5 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-emerald-300">Retour de ZETIS</p>
            <span className="rounded-full bg-zetis-surface px-3 py-1 text-xs font-bold text-zetis-accent-2">
              {reverse.score}/100
            </span>
          </div>
          <p className="mt-2">{reverse.feedback}</p>
          {reverse.missing_points.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-zetis-muted">
              {reverse.missing_points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-zetis-accent-2">Prochaine étape : {reverse.next_action}</p>
        </section>
      )}
    </div>
  );
}
