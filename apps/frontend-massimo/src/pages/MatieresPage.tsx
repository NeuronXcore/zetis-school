// Grille des matières de Massimo — la porte d'entrée de son travail.
//
// **Réécrite le 2026-08-11** (addendum ADR-0024 « page matière onglets », chantier B), cadrée
// sur le wireframe `/matieres` du user. Elle était **100 % mockée** et contredisait l'ADR-0024
// §5 sur trois points : un « Niveau 5 » faux, un « 62 % du chapitre » (pourcentage interdit) et
// une tuile « Meilleure matière » — un classement des matières, interdit nommément.
//
// Ce qui a changé sur le fond : la page dit maintenant l'EFFORT (XP, niveau) et un COMPTE de
// notions travaillées, tous deux servis par le serveur. Ce qu'elle ne dit toujours pas : aucun
// pourcentage, aucun classement, aucun verdict sur une matière.
import { Link } from "react-router-dom";
import { RETRAIT_TITRE_PAGE } from "../lib/pageTitle";
import { GlassPanel, NEON_BUTTON, NeonBackdrop } from "../components/glass";
import { SubjectSideRail } from "../components/matiere/SubjectSideRail";
import { SubjectTile } from "../components/SubjectTile";
import { useAllUpcoming } from "../hooks/useSubjectUpcoming";
import { useMatieres, type Progression } from "../hooks/useMatieres";
import { useMotivationWeek } from "../hooks/useMotivationWeek";

export function MatieresPage() {
  const { loading, error, progression, subjects } = useMatieres();
  const { week } = useMotivationWeek();
  const upcoming = useAllUpcoming();

  return (
    <div className="relative isolate -m-6 min-h-full overflow-hidden bg-[#000010] p-6 text-white">
      <NeonBackdrop />
      <div className="relative mx-auto max-w-6xl">
        {/* Voir `RETRAIT_TITRE_PAGE` : cette page annule le padding de `main` (`-m-6 p-6`) puis
            le rétablit, donc son titre retombe au même bord que les autres — et le même défaut. */}
        <h1 className={`${RETRAIT_TITRE_PAGE} text-2xl font-bold`}>Mes matières</h1>

        <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-5">
            {progression && <GlobalProgress progression={progression} />}

            {loading && <p className="text-sm text-slate-400">Un instant…</p>}

            {/* Une seule panne visible, et douce : jamais un code HTTP chez un enfant. */}
            {!loading && error && (
              <p className="text-sm text-slate-400">
                Tes matières n'ont pas voulu s'afficher. Réessaie dans un moment.
              </p>
            )}

            {!loading && !error && subjects.length === 0 && (
              // État POSITIF : l'absence de programme est l'état du catalogue de Papa.
              <p className="text-sm text-slate-400">Tes matières arrivent bientôt.</p>
            )}

            {subjects.length > 0 && (
              <section>
                {/* ⚠️ `subjects` est rendu DANS L'ORDRE REÇU — celui du programme. Aucun `sort`
                    ici, ni par XP, ni par notions travaillées : la grille deviendrait un podium,
                    et le §5 interdit de mettre les matières en concurrence. */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  {subjects.map((subject) => (
                    <SubjectTile key={subject.subject_id} subject={subject} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Le même rail que la page matière — mêmes règles, mêmes reformulations. Ici les
              échéances ne sont pas filtrées : on est au-dessus des matières. */}
          <SubjectSideRail week={week} upcoming={upcoming} />
        </div>
      </div>
    </div>
  );
}

/** Le bandeau de progression globale : niveau, XP, et la porte vers la galaxie.
 *
 *  ⚠️ La barre mesure l'avancée dans le NIVEAU — un compteur d'effort qui se remplit et se vide
 *  en montant d'un cran. Ce n'est pas un taux de maîtrise, et aucun pourcentage n'est écrit. */
function GlobalProgress({ progression }: { progression: Progression }) {
  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300/80">
            Tout ce que tu as gagné
          </p>
          <p className="mt-1 text-lg font-bold">Niveau {progression.level}</p>
          <p className="text-sm text-slate-400">
            {progression.totalXp} XP · encore {progression.xpForNext - progression.xpIntoLevel}{" "}
            pour le niveau {progression.level + 1}
          </p>
        </div>
        <Link to="/galaxy" className={NEON_BUTTON}>
          Voir ma galaxie →
        </Link>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300"
          style={{ width: `${progression.levelProgress}%` }}
        />
      </div>
    </GlassPanel>
  );
}
