import { Link } from "react-router-dom";
import type { PanoplyChapterView } from "../../hooks/useSubjectPanoply";

export interface ChapterCardsProps {
  chapters: PanoplyChapterView[];
  slug: string;
}

/** Les chapitres de la matière, en cartes — le bloc « Mes thèmes » des maquettes.
 *
 *  ⚠️ **Ce sont des CHAPITRES, et le mot « thème » est proscrit ici.** Les maquettes montraient
 *  six domaines de compétence courts (`Grammar`, `Reading`…). Read-before-code du 2026-08-11 :
 *  la table `themes` contient **une ligne en tout**, et **zéro chapitre sur 79** porte un
 *  `theme_id`. Ces thèmes n'existent nulle part. Nommer « thème » ce qui est un chapitre ferait
 *  croire à la prochaine lecture qu'ils ont été livrés.
 *
 *  ⚠️ **Pas de « XP n / 200 » par chapitre**, malgré les maquettes : `xp_events` n'a ni
 *  `theme_id`, ni `chapter_id`, ni `skill_id` — il s'arrête à la matière. Ce chiffre n'est pas
 *  calculable, et remplir `themes` n'y changerait rien.
 *
 *  Le témoin « N prêtes » est un COMPTE, jamais un ratio (ADR-0024 §5) : « 2 sur 3 » serait un
 *  score. À zéro, aucun témoin n'est rendu et la carte garde l'apparence des autres — l'absence
 *  de contenu est l'état du catalogue de Papa, pas un manque de Massimo. */
export function ChapterCards({ chapters, slug }: ChapterCardsProps) {
  if (chapters.length === 0) return null;

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-zetis-muted">
          Mes chapitres
        </h2>
        {/* `min-h-11` : mesuré à 16 px de haut à 390 px le 2026-08-11, sous le plancher de 44 px
            que la spec de la page exige. Un lien qu'on rate au doigt sur un iPhone n'existe pas. */}
        <Link
          to={`/subjects/${encodeURIComponent(slug)}?onglet=chapitres`}
          className="inline-flex min-h-11 shrink-0 items-center text-xs text-zetis-accent-2"
        >
          Tout voir, notion par notion →
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {chapters.map((chapter) => (
          <Link
            key={chapter.chapter_id}
            // Le chapitre n'a pas de route propre : on ouvre l'index, où il est déplié. Aucune
            // destination inventée — c'est la règle qui vaut aussi pour les onglets.
            to={`/subjects/${encodeURIComponent(slug)}?onglet=chapitres&chapitre=${chapter.chapter_id}`}
            className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-colors hover:border-zetis-accent-2 motion-reduce:transition-none"
          >
            <span className="font-bold leading-snug">{chapter.title}</span>
            <span className="mt-2 text-xs text-zetis-muted">
              {chapter.notions.length} notion{chapter.notions.length > 1 ? "s" : ""}
              {chapter.readyCount > 0 && (
                <>
                  {" · "}
                  <span className="text-zetis-accent-2">
                    {chapter.readyCount} prête{chapter.readyCount > 1 ? "s" : ""}
                  </span>
                </>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
