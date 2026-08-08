import type { DiagnosticPortee } from "@zetis/types";

// La portée — une notion, ses passations successives, son delta.
//
// 🔴 **Le tracé est un ESCALIER, jamais une courbe lissée.** Un score par notion porte sur un
// petit nombre de questions : il ne prend qu'un jeu discret de valeurs (marches de 20 points à
// 5 questions, de 50 avant l'adr-0043). Une interpolation douce inventerait des points
// intermédiaires que personne n'a mesurés. D'où des segments horizontaux reliés par des sauts
// verticaux — et aucune courbe de Bézier nulle part.
//
// 🔴 **Une notion non mesurée COUPE le trait**, elle ne le prolonge pas. Reporter la valeur
// précédente dessinerait un palier plat, qui se lit « rien n'a bougé » — l'exact contraire de
// « on n'a pas regardé ».
//
// **À une seule passation, la portée ne s'affiche pas.** Le serveur rend `notions: []` dès qu'il
// n'y a pas deux mesures à comparer : la page n'a rien à compter elle-même.

const LARGEUR = 460;
const HAUTEUR_LIGNE = 26;

function chemins(points: (number | null)[]): string[] {
  // Un chemin par SEGMENT CONTINU. Une coupure (`null`) ferme le chemin en cours et en ouvre un
  // nouveau : c'est ce qui rend le trou visible au lieu de le combler.
  const pas = points.length > 1 ? LARGEUR / (points.length - 1) : LARGEUR;
  const y = (score: number) => HAUTEUR_LIGNE - 3 - (score / 100) * (HAUTEUR_LIGNE - 6);
  const out: string[] = [];
  let courant: string[] = [];
  let precedent: number | null = null;

  points.forEach((score, index) => {
    if (score === null) {
      if (courant.length > 0) out.push(courant.join(" "));
      courant = [];
      precedent = null;
      return;
    }
    const x = index * pas;
    if (precedent === null) {
      courant.push(`M ${x.toFixed(1)} ${y(score).toFixed(1)}`);
    } else {
      // Marche : on avance à l'horizontale au niveau PRÉCÉDENT, puis on saute à la verticale.
      // L'ordre compte — sauter d'abord ferait remonter la mesure avant sa date.
      courant.push(`L ${x.toFixed(1)} ${y(precedent).toFixed(1)}`);
      courant.push(`L ${x.toFixed(1)} ${y(score).toFixed(1)}`);
    }
    precedent = score;
  });
  if (courant.length > 0) out.push(courant.join(" "));
  return out.filter((d) => d.includes("L")); // un point isolé ne dessine pas de pente
}

function dateCourte(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function PorteeEscalier({ portee }: { portee: DiagnosticPortee }) {
  if (portee.notions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-papa-border bg-papa-surface/50 p-4">
        <p className="text-sm font-medium">La portée ne s'affiche pas encore</p>
        <p className="mt-1 text-sm text-papa-muted">
          Un point ne fait pas une pente. Il faut qu'une même notion ait été mesurée au moins deux
          fois dans cette matière pour qu'une comparaison ait un sens.
        </p>
      </div>
    );
  }

  const grains = new Set(
    portee.notions.flatMap((n) => n.points.filter(Boolean).map((p) => p!.questions_count)),
  );

  return (
    <div className="rounded-xl border border-papa-border bg-papa-surface p-4">
      <p className="text-xs uppercase tracking-wide text-papa-muted">La portée</p>
      <p className="mt-1 text-xs text-papa-muted">
        Mêmes notions, dates différentes.{" "}
        {grains.size > 1
          ? // ⚠️ La granularité restera MIXTE pour toujours : les passations d'avant l'adr-0043 ont
            // 2 questions par notion, celles d'après en ont 5. Le dire, plutôt que comparer des
            // grains incomparables en silence.
            "⚠️ Granularité mixte : ces passations n'ont pas toutes le même nombre de questions par notion — les marches n'ont donc pas la même hauteur d'une colonne à l'autre."
          : `Marches de ${Math.round(100 / ([...grains][0] ?? 5))} points.`}
      </p>

      <div className="mt-3 flex justify-end gap-6 pr-16 text-[11px] text-papa-muted">
        {portee.attempts.map((a) => (
          <span key={a.attempt_id}>{dateCourte(a.completed_at)}</span>
        ))}
      </div>

      <div className="mt-1 space-y-1">
        {portee.notions.map((notion) => {
          const scores = notion.points.map((p) => (p ? p.score : null));
          return (
            <div key={notion.skill_id} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 truncate text-papa-muted">{notion.skill_name}</span>
              <svg
                viewBox={`0 0 ${LARGEUR} ${HAUTEUR_LIGNE}`}
                className="h-6 flex-1"
                role="img"
                aria-label={`${notion.skill_name} : ${scores
                  .map((s) => (s === null ? "non mesurée" : `${s} %`))
                  .join(", ")}`}
              >
                {chemins(scores).map((d, index) => (
                  <path
                    key={index}
                    d={d}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="miter"
                    className={
                      notion.delta > 0
                        ? "stroke-emerald-400"
                        : notion.delta < 0
                          ? "stroke-papa-warn"
                          : "stroke-papa-muted"
                    }
                  />
                ))}
                {scores.map((score, index) =>
                  score === null ? null : (
                    <circle
                      key={index}
                      cx={(index * (LARGEUR / Math.max(1, scores.length - 1))).toFixed(1)}
                      cy={(HAUTEUR_LIGNE - 3 - (score / 100) * (HAUTEUR_LIGNE - 6)).toFixed(1)}
                      r={2.5}
                      className="fill-papa-surface stroke-current"
                      strokeWidth={1.5}
                    />
                  ),
                )}
              </svg>
              <span
                className={`w-14 shrink-0 text-right text-xs ${
                  notion.delta > 0
                    ? "text-emerald-300"
                    : notion.delta < 0
                      ? "text-papa-warn"
                      : "text-papa-muted"
                }`}
              >
                {notion.delta > 0 ? "+" : ""}
                {notion.delta} pts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
