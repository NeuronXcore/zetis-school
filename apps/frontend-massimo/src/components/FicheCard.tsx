import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type FicheSpec } from "@zetis/types";
import { FicheA5 } from "./FicheA5";
import { downloadDataUrl, ficheToPng, printImageA5, slugifyFilename } from "../lib/ficheExport";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";

// La fiche (écran 3) : rendu pur du FicheSpec (structure fermée ⭐/📖/🔑/⚠️/💡). Export image /
// impression au format A5 via un rendu clair dédié (FicheA5 + html-to-image) — l'impression CSS du
// shell donnait une page blanche. On n'affiche que ce que le serveur renvoie (déjà filtré
// `validated`). Le pied porte le badge de provenance statique « 📚 D'après ton cours » ;
// l'ouverture du cours se fait via le bouton « Voir le cours » de la page.

function Section({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 pt-4 first:border-0 first:pt-0">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
        <span aria-hidden className="text-base">
          {icon}
        </span>
        {label}
      </h3>
      {children}
    </section>
  );
}

function SubjectIcon({ slug }: { slug: string }) {
  const url = subjectIconFor(slug);
  return url ? (
    <img src={url} alt="" aria-hidden className="h-10 w-10 rounded-xl object-contain" />
  ) : (
    <span aria-hidden className="text-3xl">
      {subjectEmoji(slug)}
    </span>
  );
}

export interface FicheCardProps {
  spec: FicheSpec;
  subjectSlug: string;
  /** Handler du pont SRS (chantier séparé). Absent = bouton désactivé (stub). */
  onAddToCards?: () => void;
}

export function FicheCard({ spec, subjectSlug, onAddToCards }: FicheCardProps) {
  const a5Ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<null | "image" | "print">(null);

  async function exportImage() {
    if (!a5Ref.current || exporting) return;
    setExporting("image");
    try {
      const url = await ficheToPng(a5Ref.current);
      downloadDataUrl(url, slugifyFilename(spec.title));
    } catch {
      /* capture échouée : rien de destructif */
    } finally {
      setExporting(null);
    }
  }

  async function printFiche() {
    if (!a5Ref.current || exporting) return;
    setExporting("print");
    try {
      const url = await ficheToPng(a5Ref.current);
      // Popup bloquée → repli sur le téléchargement (l'utilisateur récupère quand même la fiche).
      if (!printImageA5(url)) downloadDataUrl(url, slugifyFilename(spec.title));
    } catch {
      /* ignore */
    } finally {
      setExporting(null);
    }
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
      {/* Bandeau d'identité */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] p-5">
        <SubjectIcon slug={subjectSlug} />
        <div>
          {spec.chapter && (
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-300">
              {spec.chapter}
            </p>
          )}
          <h2 className="text-lg font-bold text-slate-100">{spec.title}</h2>
          <p className="text-xs text-slate-400">
            {spec.subject} · {spec.level}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-5">
        <Section icon="⭐" label="L'essentiel">
          <p className="text-[15px] leading-relaxed text-slate-100">{spec.essentiel}</p>
        </Section>

        {spec.definitions.length > 0 && (
          <Section icon="📖" label="Les mots à connaître">
            <dl className="flex flex-col gap-2">
              {spec.definitions.map((d, i) => (
                <div key={i} className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <dt className="text-sm font-semibold text-cyan-200">{d.terme}</dt>
                  <dd className="text-sm text-slate-300">{d.definition}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {spec.points_cles.length > 0 && (
          <Section icon="🔑" label="À retenir">
            <ul className="flex flex-col gap-1.5">
              {spec.points_cles.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-200">
                  <span aria-hidden className="text-cyan-300">
                    •
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {spec.erreurs_a_eviter.length > 0 && (
          <Section icon="⚠️" label="Pièges à éviter">
            <ul className="flex flex-col gap-1.5">
              {spec.erreurs_a_eviter.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-amber-200/90">
                  <span aria-hidden>⚠️</span>
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {spec.mini_exemple && (
          <Section icon="💡" label="Un exemple">
            <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm italic text-slate-200">
              {spec.mini_exemple}
            </p>
          </Section>
        )}
      </div>

      {/* Pied : ancrage canonique + actions */}
      <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-white/[0.03] p-4">
        {/* 🔴 **Les boutons de ce pied font 44 px de haut minimum** (ADR-0054 §6). Mesurés à
            **34 px** le 2026-08-13 — sous la cible tactile du projet. `py-1.5` cède la place à
            `min-h-[44px]` + `items-center` : le padding vertical décrivait une hauteur, la
            contrainte la garantit.

            ⚠️ Ce pied est rendu par **quatre** surfaces — `FicheSubjectPage`, `CoursPanel`,
            `FicheSidePanel` (mindmap) et cette carte. La non-régression se vérifie sur les
            quatre, pas sur celle qu'on modifie. */}
        {/* Provenance canonique (statique) : la fiche dérive du cours validé de la leçon. */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
          📚 D'après ton cours <em className="not-italic opacity-80">« {spec.title} »</em>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {/* Pont SRS (chantier séparé) : présent mais désactivé tant que non câblé. */}
          <button
            type="button"
            onClick={onAddToCards}
            disabled={!onAddToCards}
            title={
              onAddToCards
                ? "Tes définitions deviennent des cartes de révision"
                : // Fiche de ZETIS : le pont §6 est toujours stub, le bouton reste inerte.
                  "Bientôt : ajouter cette fiche à tes cartes de révision"
            }
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/10 px-3 text-sm text-slate-300 disabled:opacity-40"
          >
            🃏 Ajouter à mes cartes
          </button>
          <button
            type="button"
            onClick={exportImage}
            disabled={exporting !== null}
            title="Télécharger la fiche en image A5 (à enregistrer ou partager)"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/10 px-3 text-sm text-slate-200 hover:border-cyan-400/40 disabled:opacity-50"
          >
            {exporting === "image" ? "⏳ Image…" : "🖼️ Image A5"}
          </button>
          <button
            type="button"
            onClick={printFiche}
            disabled={exporting !== null}
            title="Imprimer la fiche au format A5"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/10 px-3 text-sm text-slate-200 hover:border-cyan-400/40 disabled:opacity-50"
          >
            {exporting === "print" ? "⏳ Impression…" : "🖨️ Imprimer"}
          </button>
        </div>
      </footer>

      {/* Rendu clair A5 hors écran (portail → body, hors overflow) : source de l'export image / impression. */}
      {createPortal(
        <div aria-hidden className="pointer-events-none fixed left-[-99999px] top-0">
          <FicheA5 ref={a5Ref} spec={spec} subjectSlug={subjectSlug} />
        </div>,
        document.body,
      )}
    </article>
  );
}
