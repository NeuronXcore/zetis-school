import type { DiagnosticJauges } from "@zetis/types";

// Le bandeau instrument — quatre jauges qui disent l'état de la mesure, pas celui de l'élève.
//
// 🔴 **La quatrième n'est pas un compteur de panne.** Elle vaut zéro PAR DÉCISION : ZETIS ne se
// commande pas de production sur sa propre mesure (station ③). Son rendu — hachures, gris, jamais
// de couleur d'alerte — doit dire « vide voulu », pas « échec ». Une jauge rouge à zéro pousserait
// à demander l'ouverture d'un déclencheur écarté en connaissance de cause.

interface JaugeProps {
  titre: string;
  valeur: string;
  unite?: string;
  detail: string;
  /** Rendu « vide voulu » : hachures, aucune couleur. Réservé à la 4ᵉ jauge. */
  mur?: boolean;
}

function Jauge({ titre, valeur, unite, detail, mur = false }: JaugeProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-papa-border p-4 ${
        mur ? "bg-papa-surface/40" : "bg-papa-surface"
      }`}
    >
      {mur && (
        // Hachures : le vide se voit sans se colorer. `aria-hidden` — l'information est dans le
        // texte, la texture ne fait que la doubler.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px)",
          }}
        />
      )}
      <p className="text-xs leading-snug text-papa-muted">{titre}</p>
      <p className={`mt-2 text-3xl font-bold ${mur ? "text-papa-muted" : ""}`}>
        {valeur}
        {unite && <span className="ml-1 text-base font-normal text-papa-muted">{unite}</span>}
      </p>
      <p className="mt-1.5 text-xs text-papa-muted">{detail}</p>
    </div>
  );
}

export function BandeauInstrument({ jauges }: { jauges: DiagnosticJauges }) {
  // ⚠️ **L'unité est portée par chaque segment, et ce n'est pas de la verbosité.** Le nombre
  // principal compte des MATIÈRES (`1 / 8`) ; `a_relire` et `proposes_non_passes` comptent des
  // DIAGNOSTICS — une même matière peut en porter plusieurs. Vu à l'écran sur les données de dev :
  // « 1 / 8 · 13 proposé(s) non passé(s) · 5 jamais générée(s) » se lisait comme 13 matières sur 8.
  const enRoute = [
    jauges.a_relire > 0 ? `${jauges.a_relire} diagnostic${jauges.a_relire > 1 ? "s" : ""} à relire` : null,
    jauges.proposes_non_passes > 0
      ? `${jauges.proposes_non_passes} proposé${jauges.proposes_non_passes > 1 ? "s" : ""} non passé${jauges.proposes_non_passes > 1 ? "s" : ""}`
      : null,
    jauges.jamais_generees > 0
      ? `${jauges.jamais_generees} matière${jauges.jamais_generees > 1 ? "s" : ""} jamais mesurée${jauges.jamais_generees > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean);

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Jauge
        titre="Matières mesurées au moins une fois"
        valeur={`${jauges.matieres_mesurees} / ${jauges.matieres_total}`}
        detail={enRoute.length > 0 ? enRoute.join(" · ") : "toutes les matières ont une mesure"}
      />
      <Jauge
        titre="Lecture la plus ancienne encore invoquée"
        valeur={jauges.plus_ancienne_lecture ? String(jauges.plus_ancienne_lecture.jours) : "—"}
        unite={jauges.plus_ancienne_lecture ? "j" : undefined}
        detail={
          jauges.plus_ancienne_lecture
            ? `${jauges.plus_ancienne_lecture.subject} · ${new Date(
                jauges.plus_ancienne_lecture.date,
              ).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
            : "aucune passation"
        }
      />
      <Jauge
        titre="Lacunes ouvertes par un diagnostic, encore ouvertes"
        valeur={String(jauges.lacunes_ouvertes)}
        detail={
          jauges.lacunes_sans_contenu > 0
            ? `dont ${jauges.lacunes_sans_contenu} sans contenu produisible`
            : "toutes ont un cours à travailler"
        }
      />
      <Jauge
        mur
        titre="Lots de production déclenchés par une mesure"
        valeur={String(jauges.lots_declenches)}
        detail="et c'est voulu — voir ③"
      />
    </div>
  );
}
