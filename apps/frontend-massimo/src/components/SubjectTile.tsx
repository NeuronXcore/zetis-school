import { Link } from "react-router-dom";
import type { GalaxySubject } from "@zetis/types";
import { subjectIconFor } from "../lib/subjectIcons";

/** Carte d'une matière sur la grille `/matieres`.
 *
 *  **Débranchée du mock le 2026-08-11.** Elle affichait « Niveau 5 » et « 62 % du chapitre »
 *  tirés de `data/mock.ts` : le premier était faux, le second **interdit** (ADR-0024 §5,
 *  « aucun score par matière, aucun pourcentage »).
 *
 *  Ce qu'elle dit maintenant, en trois nombres qui viennent tous du serveur :
 *  - **le niveau et le XP** de la matière — l'EFFORT, autorisé par la révision de lecture du §5 ;
 *  - **les notions travaillées** — un COMPTE d'étoiles allumées, jamais un ratio.
 *
 *  ⚠️ **Aucun « N sur M », aucun pourcentage.** `total` est volontairement absent de l'écran :
 *  « 15 sur 51 » désignerait les 36 restantes comme un retard. La barre mesure l'avancée dans le
 *  NIVEAU (un compteur d'effort), jamais un taux de réussite.
 *
 *  ⚠️ **Aucun pendant « à renforcer ».** Ce qu'il y a à travailler se dit en MISSION — un geste,
 *  pas un verdict posé sur une matière. */
export function SubjectTile({ subject }: { subject: GalaxySubject }) {
  const iconUrl = subjectIconFor(subject.slug);
  const rempli =
    subject.xp.for_next > 0
      ? Math.min(100, Math.round((subject.xp.into_level / subject.xp.for_next) * 100))
      : 0;

  return (
    <Link
      to={`/subjects/${subject.slug}`}
      className="group flex flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl transition-colors hover:border-cyan-400/40 hover:bg-white/[0.07] motion-reduce:transition-none"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              aria-hidden
              className="h-12 w-12 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
            />
          ) : null}
        </span>
        <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-200">
          Niveau {subject.xp.level}
        </span>
      </div>

      <p className="mt-3 font-bold text-slate-100">{subject.name}</p>
      <p className="text-xs text-slate-400">
        {subject.lit > 0
          ? `${subject.lit} notion${subject.lit > 1 ? "s" : ""} travaillée${subject.lit > 1 ? "s" : ""}`
          : // État POSITIF, jamais « 0 notion » : une matière pas encore ouverte est une
            // invitation, pas un retard.
            "À découvrir"}
        {subject.mastered > 0 && (
          <>
            {" · "}
            <span className="text-cyan-300">
              {subject.mastered} maîtrisée{subject.mastered > 1 ? "s" : ""}
            </span>
          </>
        )}
      </p>

      {/* ⚠️ À 0 XP, ni barre ni nombre — vu à l'écran le 2026-08-11 sur Espagnol : une barre
          vide surmontant un « 0 XP » écrit se lit comme un score nul, alors que c'est
          simplement une matière pas encore ouverte. « À découvrir » le dit déjà, et le dit
          mieux. Même règle que la bande de catalogue : une entrée à zéro n'est pas rendue. */}
      {subject.xp.total > 0 && (
        <>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
            role="img"
            aria-label={`${subject.xp.total} XP en ${subject.name} — niveau ${subject.xp.level}`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300"
              style={{ width: `${rempli}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">{subject.xp.total} XP</p>
        </>
      )}
    </Link>
  );
}
