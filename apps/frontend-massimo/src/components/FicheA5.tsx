import { forwardRef } from "react";
import { type FicheSpec } from "@zetis/types";
import { subjectEmoji } from "../lib/subjectEmoji";
import { dateAbsolue } from "../lib/datation";

// Rendu CLAIR au format A5 (papier) du FicheSpec — utilisé UNIQUEMENT pour l'export image /
// l'impression (capturé par html-to-image). Fond blanc, texte foncé, hors écran. Pas d'image
// externe (emoji de matière) → capture propre. Dimensions ≈ A5 (148×210 mm @96dpi).

const A5_WIDTH = 560; // px
const A5_MIN_HEIGHT = 792; // px (ratio A5 ≈ 1:1.414)

const SECTION_LABEL = "mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500";

export interface FicheA5Props {
  spec: FicheSpec;
  subjectSlug: string;
  /** ISO 8601 de la fiche — datée en ABSOLU sur le papier (ADR-0054 §3). */
  dateISO?: string | null;
}

export const FicheA5 = forwardRef<HTMLDivElement, FicheA5Props>(function FicheA5(
  { spec, subjectSlug, dateISO },
  ref,
) {
  const datee = dateAbsolue(dateISO);
  return (
    <div
      ref={ref}
      style={{ width: A5_WIDTH, minHeight: A5_MIN_HEIGHT }}
      className="flex flex-col gap-3 bg-white p-6 font-sans text-slate-900"
    >
      <header className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <span className="text-3xl" aria-hidden>
          {subjectEmoji(subjectSlug)}
        </span>
        <div>
          {spec.chapter && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
              {spec.chapter}
            </p>
          )}
          <h1 className="text-lg font-bold text-slate-900">{spec.title}</h1>
          <p className="text-xs text-slate-500">
            {spec.subject} · {spec.level}
          </p>
        </div>
      </header>

      <section>
        <h2 className={SECTION_LABEL}>⭐ L'essentiel</h2>
        <p className="text-sm leading-relaxed text-slate-800">{spec.essentiel}</p>
      </section>

      {spec.definitions.length > 0 && (
        <section>
          <h2 className={SECTION_LABEL}>📖 Les mots à connaître</h2>
          <dl className="flex flex-col gap-1.5">
            {spec.definitions.map((d, i) => (
              <div key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                <dt className="text-sm font-semibold text-slate-900">{d.terme}</dt>
                <dd className="text-sm text-slate-700">{d.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {spec.points_cles.length > 0 && (
        <section>
          <h2 className={SECTION_LABEL}>🔑 À retenir</h2>
          <ul className="flex flex-col gap-1">
            {spec.points_cles.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-800">
                <span className="text-cyan-600" aria-hidden>
                  •
                </span>
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {spec.erreurs_a_eviter.length > 0 && (
        <section>
          <h2 className={SECTION_LABEL}>⚠️ Pièges à éviter</h2>
          <ul className="flex flex-col gap-1">
            {spec.erreurs_a_eviter.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-amber-700">
                <span aria-hidden>⚠️</span>
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {spec.mini_exemple && (
        <section>
          <h2 className={SECTION_LABEL}>💡 Un exemple</h2>
          <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm italic text-slate-800">
            {spec.mini_exemple}
          </p>
        </section>
      )}

      {/* Même libellé anglais qu'à l'écran (§10) — la feuille imprimée ne renomme rien. */}
      {spec.mnemonique?.moyen && (
        <section>
          <h2 className={SECTION_LABEL}>🎩 Mnemonics</h2>
          <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800">
            {spec.mnemonique.moyen}
            {spec.mnemonique.sert_a && (
              <span className="mt-0.5 block text-xs text-slate-500">
                pour retenir {spec.mnemonique.sert_a}
              </span>
            )}
          </p>
        </section>
      )}

      {/* 🔴 La date ABSOLUE, et seulement ici (ADR-0054 §3). Une feuille imprimée sans date est
          inclassable dans un classeur — c'est le seul endroit où l'absolu se justifie, et
          l'inverse de la règle d'écran, qui n'affiche que du relatif. */}
      <footer className="mt-auto border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        📚 D'après ton cours « {spec.title} » · ZETIS
        {datee && ` · ${datee}`}
      </footer>
    </div>
  );
});
