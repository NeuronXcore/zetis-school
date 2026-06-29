import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { ZetisAvatar } from "../components/ZetisAvatar";

// Page ELI5 Massimo (Étape 7) — explication + reverse, réponses mockées (pas d'IA réelle).
export function Eli5Page() {
  const [notion, setNotion] = useState("Les nombres relatifs");
  const [explained, setExplained] = useState(false);
  const [reverse, setReverse] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ELI5" subtitle="ZETIS t'explique, puis tu réexpliques pour vérifier." />

      <div className="flex gap-2">
        <input
          value={notion}
          onChange={(e) => setNotion(e.target.value)}
          placeholder="Quelle notion veux-tu comprendre ?"
          className="flex-1 rounded-lg border border-zetis-border bg-zetis-surface px-3 py-2 outline-none focus:border-zetis-accent"
        />
        <button
          type="button"
          onClick={() => {
            setExplained(true);
            setReverse(false);
          }}
          className="rounded-lg bg-zetis-accent px-4 py-2 font-semibold text-white"
        >
          Expliquer
        </button>
      </div>

      {explained && (
        <section className="mt-4 flex gap-3 rounded-2xl border border-zetis-border bg-zetis-surface p-5">
          <ZetisAvatar size={40} />
          <div className="text-sm">
            <p className="font-semibold text-zetis-accent-2">ZETIS explique</p>
            <p className="mt-1">
              Imagine une température : +3°C, 0°C, -4°C. Les nombres <em>relatifs</em> servent à
              repérer ce qui est au-dessus ou en-dessous d'un point zéro.
            </p>
            <p className="mt-2 text-zetis-muted">
              <strong>Exemple :</strong> -5 est plus petit que -2, comme -5°C est plus froid que
              -2°C.
            </p>
            <p className="mt-2">
              <strong>Mini-question :</strong> range -3, 0 et +2 du plus petit au plus grand.
            </p>
          </div>
        </section>
      )}

      {explained && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-zetis-muted">Maintenant, explique à ZETIS :</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReverse(true)}
              className="rounded-lg border border-zetis-border bg-zetis-surface px-4 py-2 text-sm font-medium hover:bg-zetis-surface-2"
            >
              ✍️ Répondre par écrit
            </button>
            <button
              type="button"
              onClick={() => setReverse(true)}
              className="rounded-lg border border-zetis-border bg-zetis-surface px-4 py-2 text-sm font-medium hover:bg-zetis-surface-2"
            >
              🎤 Parler
            </button>
            <button
              type="button"
              onClick={() => setReverse(true)}
              className="rounded-lg border border-zetis-border bg-zetis-surface px-4 py-2 text-sm font-medium hover:bg-zetis-surface-2"
            >
              🕸️ Créer une mindmap
            </button>
          </div>
        </div>
      )}

      {reverse && (
        <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface-2 p-5 text-sm">
          <p className="font-semibold text-emerald-300">Retour de ZETIS</p>
          <p className="mt-1">
            Tu as bien compris que les nombres négatifs sont en dessous de zéro. Il manque encore
            l'idée de comparaison : -5 est plus petit que -2.
          </p>
          <p className="mt-2 text-zetis-accent-2">
            Mini-mission : place -5, -2, 0 et +3 sur une droite.
          </p>
        </section>
      )}
    </div>
  );
}
