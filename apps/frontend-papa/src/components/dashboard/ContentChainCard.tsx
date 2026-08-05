import { Link } from "react-router-dom";
import type { DashboardContentStage, DashboardFocus } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";

// « Chaîne de contenus » — entonnoir de production.
//
// Tout dérivé part d'un cours validé : chaque marche a pour cible la marche PRÉCÉDENTE, pas un
// total absolu. Lecture visée : **la marche la plus haute est celle à traiter en premier** — d'où
// le delta affiché entre deux marches, qui est l'information utile (« ↓ 19 à produire »), là où
// deux pourcentages côte à côte demanderaient une soustraction mentale.
//
// 🔴 **Le manque se lit sur la CIBLE de la marche suivante, pas sur la valeur de la précédente.**
// Les deux coïncident pour les trois premières marches, et divergent pour la dernière : `quiz` a
// pour cible `lessons_ok`, pas `fiches_ok`. Calculé en `stage.value - next.value`, le delta sous
// « Fiches » valait `fiches_ok − quizzes_ok` — un nombre qui ne désigne rien, et qui annonçait
// « ↓ complet » dès que les quiz dépassaient les fiches. Corrigé en rendant le delta cliquable
// (adr-0039 §9) : un lien vers un nombre faux ouvre un nombre de lignes faux.

interface ContentChainCardProps {
  stages: DashboardContentStage[];
  focus: DashboardFocus | null;
}

export function ContentChainCard({ stages, focus }: ContentChainCardProps) {
  return (
    <DashboardCard
      card="chaine"
      title="Chaîne de contenus"
      focus={focus}
      className="xl:col-span-3"
      note="Tout dérivé part d'un cours validé. La marche la plus haute est celle à traiter en premier."
    >
      <ul className="flex flex-col">
        {stages.map((stage, index) => {
          const ratio = stage.target > 0 ? stage.value / stage.target : 0;
          const next = stages[index + 1];
          // Le nombre AFFICHÉ est celui que la destination ouvre (`missing_count`, servi par le
          // serveur avec les prédicats de la page). La soustraction `target - value` n'est qu'un
          // repli pour un backend qui ne le servirait pas encore — elle compte aussi ce qui n'est
          // pas produisible, et c'est ce qui faisait annoncer 49 fiches pour 17 lignes ouvertes.
          const missing = next
            ? (next.missing_count ?? Math.max(0, next.target - next.value))
            : 0;
          return (
            <li key={stage.stage}>
              <div className="relative h-9 overflow-hidden rounded-lg bg-papa-surface-2">
                <div
                  className="h-full rounded-lg bg-papa-accent transition-[width] motion-reduce:transition-none"
                  style={{ width: `${Math.max(ratio * 100, 3)}%`, opacity: 0.75 - index * 0.13 }}
                />
                <span className="absolute inset-0 flex items-center justify-between px-2.5 text-[11px]">
                  <span className="font-semibold text-papa-text">{stage.label}</span>
                  <span className="font-mono text-papa-muted">
                    {stage.value}/{stage.target}
                  </span>
                </span>
              </div>
              {next && (
                <p className="py-1 text-center font-mono text-[10px] text-papa-warn">
                  {missing > 0 ? (
                    // « Complet » n'ouvre rien : un lien vers un ensemble vide se lit comme une
                    // page cassée. Le `href` vient du serveur, jamais construit ici.
                    next.missing_href ? (
                      <Link
                        to={next.missing_href}
                        className="underline decoration-dotted underline-offset-2 hover:text-papa-text"
                      >
                        ↓ {missing} à produire
                      </Link>
                    ) : (
                      `↓ ${missing} à produire`
                    )
                  ) : (
                    "↓ complet"
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}
