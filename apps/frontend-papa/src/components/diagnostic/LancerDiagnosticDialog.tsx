import { useState } from "react";
import type { DiagnosticApercuSubject } from "@zetis/types";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { generateDiagnostic } from "../../lib/diagnostic";
import type { EtatTravail } from "../../lib/travaux";

// La modale « Lancer un diagnostic » — quatre états : Réglage · En cours · À l'arrêt · Terminé.
//
// ⚠️ **La barre réutilise `useEstimatedProgress` + `ProgressBar`**, jamais un spinner nu ni une
// barre réinventée : c'est la convention Papa pour toute action backend opaque, et la durée
// attendue est LUE du serveur (`estimated_ms`), jamais devinée ici (adr-0041 §9).
//
// 🔴 **À l'arrêt, la barre reste où elle est et le dit.** Elle n'affiche pas d'avancement
// qu'aucune notion ne justifie — patron déjà acquis par la barre de production.

type Etat = "reglage" | "en_cours" | "termine";

export interface LancerDiagnosticDialogProps {
  subjects: DiagnosticApercuSubject[];
  /** Matière présélectionnée à l'ouverture. `null` = la première, comportement d'avant.
   *
   *  🔴 Sans elle, « Remesurer cette matière → » ouvrirait la modale sur `subjects[0]` — le défaut
   *  exact que l'`adr-0045 §5` a refusé de livrer : une action qui ne rend pas ce qu'elle annonce. */
  subjectInitial?: number | null;
  onClose: () => void;
  onTermine: () => void;
}

export function LancerDiagnosticDialog({
  subjects,
  subjectInitial = null,
  onClose,
  onTermine,
}: LancerDiagnosticDialogProps) {
  const [etat, setEtat] = useState<Etat>("reglage");
  const [subjectId, setSubjectId] = useState<number | null>(
    subjectInitial ?? subjects[0]?.id ?? null,
  );
  const [travail, setTravail] = useState<EtatTravail | null>(null);
  const [resultat, setResultat] = useState<{ subject: string; questions_count: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Même forme d'appel que `SubjectDetailRow` : la barre n'anime QUE si le serveur a une durée à
  // donner. Tant qu'il ne sait pas (`estimatedMs === null`, travail encore en file), elle reste à
  // zéro — plutôt que d'inventer une progression sur une durée devinée, ce que l'adr-0041 §9
  // interdit précisément.
  const progression = useEstimatedProgress(
    etat === "en_cours" && (travail?.estimatedMs ?? 0) > 0,
    travail?.estimatedMs ?? 0,
    travail?.startedAtMs ?? null,
  );

  async function lancer() {
    if (subjectId === null) return;
    setEtat("en_cours");
    setErreur(null);
    try {
      const res = await generateDiagnostic(subjectId, undefined, setTravail);
      setResultat({ subject: res.subject, questions_count: res.questions_count });
      setEtat("termine");
    } catch (cause: unknown) {
      setErreur(cause instanceof Error ? cause.message : "Génération impossible");
      setEtat("reglage");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lancer un diagnostic"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-papa-border bg-papa-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-papa-muted">
              Production · diagnostic_generate
            </p>
            <h2 className="mt-0.5 text-lg font-bold">Lancer un diagnostic</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg border border-papa-border px-2 py-1 text-sm text-papa-muted"
          >
            ✕
          </button>
        </div>

        {etat === "reglage" && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-papa-muted">Matière</p>
              <div className="flex flex-wrap gap-2">
                {subjects.map((matiere) => (
                  <button
                    key={matiere.id}
                    type="button"
                    aria-pressed={subjectId === matiere.id}
                    onClick={() => setSubjectId(matiere.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      subjectId === matiere.id
                        ? "border-papa-accent bg-papa-accent/10 font-semibold text-papa-accent"
                        : "border-papa-border text-papa-muted"
                    }`}
                  >
                    {matiere.name}
                  </button>
                ))}
              </div>
            </div>

            {/* ⚠️ Le périmètre dit que c'est un ÉCHANTILLON. Depuis l'adr-0043 Décision 4, les
                8 notions ne sont plus « toujours les mêmes » : elles sont choisies par ancienneté
                de mesure, les jamais mesurées d'abord. Une passation ne dit toujours rien des
                autres notions — mais la rotation, elle, se fait toute seule. */}
            <div className="rounded-lg border border-papa-border bg-papa-surface-2 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-papa-muted">Périmètre</p>
              <p className="mt-2 text-papa-muted">
                8 notions, 5 questions chacune — 40 questions attendues.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-papa-muted">
                ⚠️ Le diagnostic mesure <strong>8 notions</strong>, pas la matière entière. Elles
                sont choisies <strong>par ancienneté de mesure</strong> — jamais mesurées d'abord —
                parce qu'un diagnostic sert à réduire l'incertitude, et que remesurer ce qui vient
                de l'être n'en réduit aucune. Une passation ne dit donc rien des autres notions.
              </p>
            </div>

            {erreur && (
              <p className="rounded-lg bg-papa-warn/15 px-3 py-2 text-sm text-papa-warn">{erreur}</p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-papa-muted">
                Le lot sera tracé dans <code>ai_jobs</code> et visible dans le bandeau de production.
              </p>
              <button
                type="button"
                onClick={() => void lancer()}
                disabled={subjectId === null}
                className="shrink-0 rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg disabled:opacity-50"
              >
                Générer 40 questions
              </button>
            </div>
          </div>
        )}

        {etat === "en_cours" && (
          <div className="mt-4 space-y-3">
            <ProgressBar
              pct={progression}
              label={
                travail?.status === "queued"
                  ? "En file — le worker n'a pas encore pris le travail"
                  : "Génération des questions, notion par notion"
              }
            />
            <p className="text-xs leading-relaxed text-papa-muted">
              Le pourcentage suit la durée <strong>mesurée par le serveur</strong> pour ce type de
              travail, pas une constante écrite ici. S'il cesse d'avancer, c'est que le lot est
              immobile — la barre ne l'inventera pas.
            </p>
          </div>
        )}

        {etat === "termine" && resultat && (
          <div className="mt-4 space-y-3">
            <ProgressBar pct={100} label="Terminé" />
            <div className="rounded-lg border border-papa-border bg-papa-surface-2 p-3">
              <p className="font-medium">
                Diagnostic {resultat.subject} — {resultat.questions_count} questions
              </p>
              {/* 🔴 Le point qui compte : il rejoint le rail au PREMIER cran, pas chez Massimo. */}
              <p className="mt-1.5 text-sm leading-relaxed text-papa-muted">
                Le diagnostic existe, <strong>Massimo ne le voit pas</strong>. Il rejoint le rail au
                premier cran, en relecture. Il n'apparaîtra sur sa page qu'après ta validation, et
                n'aura de score qu'une fois passé.
              </p>
            </div>
            <button
              type="button"
              onClick={onTermine}
              className="w-full rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg"
            >
              Voir dans le rail →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
