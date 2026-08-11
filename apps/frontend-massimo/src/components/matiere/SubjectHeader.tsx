import { Link } from "react-router-dom";
import type { SubjectXP } from "@zetis/types";
import { subjectIconFor } from "@zetis/ui";
import { GlassPanel } from "../glass";

export interface SubjectHeaderProps {
  slug: string;
  name: string;
  chapterCount: number;
  notionCount: number;
  xp: SubjectXP | null;
}

/** L'en-tête d'une matière : ce qu'elle CONTIENT, et ce que Massimo y a FAIT.
 *
 *  Le XP et le niveau y sont revenus le 2026-08-11 (addendum ADR-0024 « page matière onglets »),
 *  après une **révision de lecture** du §5 : celui-ci interdit de *noter Massimo* et de *mettre
 *  ses matières en concurrence*. Un XP ne fait ni l'un ni l'autre — il compte ce qui a été fait,
 *  il ne peut que monter, et sur la page d'UNE matière il n'y a rien à côté de quoi se comparer.
 *
 *  ⚠️ **Ce qui reste interdit ici n'a pas bougé** : aucun pourcentage, aucune barre de MAÎTRISE,
 *  aucun `mastery_score`. La barre ci-dessous mesure l'avancée dans un NIVEAU (un compteur
 *  d'effort qui se remplit et se vide en montant d'un cran), jamais un taux de réussite. */
export function SubjectHeader({
  slug,
  name,
  chapterCount,
  notionCount,
  xp,
}: SubjectHeaderProps) {
  const iconUrl = subjectIconFor(slug);
  // Sur 0 XP la barre reste vide et c'est juste : Massimo n'a rien fait ICI, ce n'est pas un
  // constat sur lui. Aucun libellé n'accompagne le vide — il n'y a rien à commenter.
  const filled = xp ? Math.min(100, Math.round((xp.into_level / xp.for_next) * 100)) : 0;

  return (
    <GlassPanel className="flex flex-wrap items-center gap-4 p-5">
      {iconUrl ? (
        <img src={iconUrl} alt="" aria-hidden className="h-12 w-12 shrink-0 object-contain" />
      ) : null}

      <div className="min-w-0 flex-1">
        {/* ⚠️ Le niveau est HORS du `h1`, et ce n'est pas cosmétique : le nom accessible du titre
            doit rester « SVT » seul. « SVT Niveau 3 » ferait de la progression une partie du nom
            de la matière — pour un lecteur d'écran comme pour un test. */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h1 className="truncate text-2xl font-bold">{name}</h1>
          {xp && (
            <span className="text-sm font-semibold text-zetis-accent-2">Niveau {xp.level}</span>
          )}
        </div>
        {/* Décompte du CATALOGUE : il décrit ce qui existe, pas un score. Il ne bouge pas quand
            on filtre — sinon la recherche donnerait l'impression que la matière rétrécit. */}
        <p className="mt-1 text-sm text-zetis-muted">
          {chapterCount} chapitre{chapterCount > 1 ? "s" : ""} · {notionCount} notion
          {notionCount > 1 ? "s" : ""}
        </p>
      </div>

      {xp && (
        <div className="w-full min-w-[12rem] sm:w-56">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="img"
            // Le nom de la matière n'est PAS répété ici : le titre le donne juste au-dessus, et
            // un lecteur d'écran l'entendrait deux fois de suite.
            aria-label={`${xp.total} XP gagnés — niveau ${xp.level}`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-zetis-accent to-zetis-accent-2"
              style={{ width: `${filled}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-zetis-muted">
            {xp.total} XP · encore {xp.for_next - xp.into_level} pour le niveau {xp.level + 1}
          </p>
        </div>
      )}

      <Link
        to={`/galaxy?subject=${encodeURIComponent(slug)}`}
        className="min-h-11 shrink-0 rounded-xl border border-zetis-border px-3 py-2 text-sm text-zetis-muted hover:border-zetis-accent-2 hover:text-zetis-text"
      >
        Voir en galaxie →
      </Link>
    </GlassPanel>
  );
}
