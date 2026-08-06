import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, SubjectPictogram } from "@zetis/ui";
import type { DashboardPeriod, DashboardSubject } from "@zetis/types";
import { useSubjectAnalysis } from "../../hooks/useSubjectAnalysis";
import { formatMinutes } from "../../lib/heatmap";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";

// Analyse d'une matière, dépliée sous la carte « Où agir » (addendum ADR-0028, 2026-08-05).
//
// **Ce n'est pas une modale** : ni `role="dialog"`, ni `aria-modal`, ni fermeture par Échap. C'est
// un dépliage dans le flux, exactement comme le drill-down d'un jour sous la carte du rythme —
// seul précédent du dépôt, et seule exception réseau déjà assumée par le §4.
//
// 🔴 LA règle qui décide de chaque chiffre affiché ici : **le réseau ne sert que ce que l'agrégat
// ne peut pas porter, des NOMS.** Minutes, compteurs de notions, charge SRS à venir et couverture
// viennent de `subject`, déjà en mémoire. Les relire depuis `analysis` fabriquerait une seconde
// source pour une mesure affichée dans la bulle juste au-dessus — le bug que ce chantier corrige,
// reproduit à quelques pixels d'écart.

/** Nombre de missions listées avant de replier le reste. Au-delà, le bloc « Déjà en cours »
 *  écrasait le reste du panneau — 15 lignes constatées à l'écran sur une seule matière. */
const MISSIONS_VISIBLES = 5;

const SEVERITY_LABEL: Record<"low" | "medium" | "high", string> = {
  high: "urgente",
  medium: "à surveiller",
  low: "légère",
};

const SEVERITY_DOT: Record<"low" | "medium" | "high", string> = {
  high: "bg-papa-warn",
  medium: "bg-papa-warn/60",
  low: "bg-papa-muted",
};

// Estimation de la génération, alignée sur celle de la page Conseil. Ce N'EST PAS une mesure : le
// serveur ne rend aucune progression.
// ⚠️ **La SEULE barre Papa qui estime encore localement, et c'est un constat, pas un oubli**
// (ADR-0041 §9, 2026-08-06). L'analyse par matière est un producteur LLM qui n'écrit **aucune
// trace `ai_jobs`** — elle n'a donc ni `job_type` ni historique, et le serveur n'a rien à mesurer.
// La faire lire `estimated_ms` demanderait d'abord de la TRACER, ce que le §4 ne demande pas.
// ⚠️ Ne pas « aligner » cette valeur sur une autre : c'est exactement le geste qui a produit cinq
// durées pour un même cours.
const GEN_MS = 18000;
// ~2,5 × l'estimation. Au-delà, la barre sature à 95 % et n'apprend plus rien : c'est le TEXTE qui
// doit reprendre la parole. On ne rallonge PAS `GEN_MS` — ce serait déclarer 4 min pour un appel
// qui en dure 18 s neuf fois sur dix.
const LONG_MS = 45000;

interface SubjectAnalysisPanelProps {
  subject: DashboardSubject;
  period: DashboardPeriod;
  onClose: () => void;
  /** Une synthèse est-elle en cours SUR CETTE matière ? L'état vit dans la carte, pas ici : le
   *  panneau se démonte au clic sur une autre bulle, et le bouton redeviendrait cliquable pendant
   *  l'appel — deux rapports pour une matière. */
  generating?: boolean;
  /** Matière d'une synthèse en cours AILLEURS, s'il y en a une. */
  generatingElsewhere?: string | null;
  onGenerate?: () => void;
  /** Rapport fraîchement produit sur cette matière, affiché SUR PLACE. */
  generated?: { id: number; text: string } | null;
}

export function SubjectAnalysisPanel({
  subject,
  period,
  onClose,
  generating = false,
  generatingElsewhere = null,
  onGenerate,
  generated = null,
}: SubjectAnalysisPanelProps) {
  const { analysis, loading, error, retry } = useSubjectAnalysis(subject.id);
  const [confirming, setConfirming] = useState(false);
  const [long, setLong] = useState(false);
  const pct = useEstimatedProgress(generating, GEN_MS);

  useEffect(() => {
    if (!generating) {
      setLong(false);
      return;
    }
    const id = setTimeout(() => setLong(true), LONG_MS);
    return () => clearTimeout(id);
  }, [generating]);

  return (
    <section
      aria-label={`Analyse de ${subject.name}`}
      className="mt-4 border-t border-papa-border pt-3.5"
    >
      <header className="flex items-center gap-2">
        <SubjectPictogram slug={subject.slug} name={subject.name} size="sm" />
        <h4 className="text-xs font-extrabold uppercase tracking-widest">{subject.name}</h4>
        {/* Minutes prises de la MÉMOIRE, pas de la réponse réseau. */}
        <span className="text-[11px] text-papa-muted">
          {formatMinutes(subject.minutes[period] ?? 0)} sur la période
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'analyse"
          className="ml-auto rounded px-2 text-papa-muted transition-colors hover:text-papa-text"
        >
          ✕
        </button>
      </header>

      {loading && <p className="py-4 text-sm italic text-papa-muted">Analyse en cours…</p>}

      {error && (
        // Le panneau RESTE ouvert : le refermer ferait disparaître le résultat du geste de Papa
        // sans explication.
        <div className="py-4 text-sm text-papa-warn">
          {error}{" "}
          <button type="button" onClick={retry} className="underline hover:text-papa-text">
            Réessayer
          </button>
        </div>
      )}

      {analysis && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-papa-muted">
              À renforcer
            </h5>
            {/* ⚠️ DEUX compteurs, jamais un total. Une notion fragile et une lacune ouverte sont
                deux mesures distinctes, et une même notion peut être les deux — les additionner
                mentirait dans les deux sens. */}
            <p className="mt-0.5 text-[11px] text-papa-muted">
              {analysis.fragile_count} fragile{analysis.fragile_count > 1 ? "s" : ""} ·{" "}
              {analysis.open_gap_count} lacune{analysis.open_gap_count > 1 ? "s" : ""} ouverte
              {analysis.open_gap_count > 1 ? "s" : ""}
              {analysis.without_mission_count > 0 && (
                <> · {analysis.without_mission_count} sans mission</>
              )}
            </p>

            {analysis.to_reinforce.length === 0 ? (
              <p className="py-3 text-sm italic text-papa-muted">
                Aucune notion à renforcer dans cette matière.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {analysis.to_reinforce.map((notion) => (
                  <li
                    key={notion.skill_id}
                    className="flex items-center gap-2 rounded-lg bg-papa-surface-2 px-2.5 py-1.5 text-xs"
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        notion.severity ? SEVERITY_DOT[notion.severity] : "bg-papa-border"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate">{notion.skill_name}</span>
                    {notion.is_fragile && (
                      <span className="shrink-0 text-[10px] text-papa-muted">fragile</span>
                    )}
                    {notion.severity && (
                      <span className="shrink-0 text-[10px] text-papa-warn/80">
                        {SEVERITY_LABEL[notion.severity]}
                      </span>
                    )}
                    {notion.has_active_mission && (
                      <span className="shrink-0 text-[10px] text-papa-accent">déjà couverte</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-papa-muted">
              Déjà en cours
            </h5>
            {analysis.in_progress.missions.length === 0 ? (
              <p className="mt-1 text-xs italic text-papa-muted">Aucune mission en cours.</p>
            ) : (
              (() => {
                // ⚠️ REGROUPÉES par titre. Le générateur produit plusieurs missions du même
                // intitulé sur la même notion ; les lister une par une donnait 15 lignes dont
                // « Travailler : Narrateur » trois fois, et le bloc écrasait le reste du panneau.
                // On compte au lieu de répéter — et le total reste exact.
                const groupes = new Map<string, { titre: string; n: number; aValider: number }>();
                for (const m of analysis.in_progress.missions) {
                  const g = groupes.get(m.title) ?? { titre: m.title, n: 0, aValider: 0 };
                  g.n += 1;
                  if (m.validation_status !== "validated") g.aValider += 1;
                  groupes.set(m.title, g);
                }
                const liste = [...groupes.values()].sort((a, b) => b.n - a.n);
                const visibles = liste.slice(0, MISSIONS_VISIBLES);
                const reste = liste.length - visibles.length;
                return (
                  <>
                    <p className="mt-0.5 text-[11px] text-papa-muted">
                      {analysis.in_progress.missions.length} mission
                      {analysis.in_progress.missions.length > 1 ? "s" : ""} en cours
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {visibles.map((g) => (
                        <li key={g.titre} className="truncate text-xs">
                          <span className="text-papa-accent">▸</span> {g.titre}
                          {g.n > 1 && (
                            <span className="ml-1 font-mono text-[10px] text-papa-muted">
                              ×{g.n}
                            </span>
                          )}
                          {g.aValider > 0 && (
                            <span className="ml-1 text-[10px] text-papa-warn/80">à valider</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {reste > 0 && (
                      // ⚠️ Le reste est ANNONCÉ, jamais coupé en silence : une liste tronquée sans
                      // le dire se lit comme une liste complète.
                      <p className="mt-1 text-[10px] text-papa-muted">
                        et {reste} autre{reste > 1 ? "s" : ""} intitulé{reste > 1 ? "s" : ""}
                      </p>
                    )}
                  </>
                );
              })()
            )}
          </div>

          {onGenerate && (
            <div className="border-t border-dashed border-papa-border/60 pt-3">
              {generated ? (
                // On ne NAVIGUE pas au résultat : après quatre minutes, Papa n'est plus dans la
                // même pensée. La synthèse s'affiche ici, le lien reste une offre.
                <>
                  <p className="text-xs leading-relaxed text-papa-text">{generated.text}</p>
                  <Link
                    to="/conseil"
                    className="mt-2 inline-block text-xs font-bold text-papa-accent hover:underline"
                  >
                    Ouvrir le conseil de classe →
                  </Link>
                </>
              ) : generating ? (
                <ProgressBar
                  pct={pct}
                  label={
                    long
                      ? "Plus long que d'habitude — l'analyse continue (jusqu'à 4 min)."
                      : `Le conseil analyse ${subject.name}…`
                  }
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={generatingElsewhere !== null}
                    className="w-full rounded-lg border border-papa-border bg-papa-surface-2 px-3 py-2 text-xs font-bold text-papa-text transition-colors hover:border-papa-accent/50 disabled:opacity-50"
                  >
                    Demander une synthèse écrite sur {subject.name}
                    <span className="ml-1 font-normal text-papa-muted">~18 s</span>
                  </button>
                  {generatingElsewhere && (
                    <p className="mt-1 text-[10px] text-papa-muted">
                      Une synthèse sur {generatingElsewhere} est déjà en cours.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Bloc titre="Révisions">
              {/* Deux mesures VOISINES et distinctes, servies sous deux noms : le retard vient du
                  réseau, la charge à venir de la mémoire. Les fondre en « révisions » les ferait
                  diverger dès qu'une carte est suspendue. */}
              <Ligne
                label="en retard"
                valeur={analysis.in_progress.review_overdue}
                alerte={analysis.in_progress.review_overdue > 0}
              />
              <Ligne
                label="d'ici 14 jours"
                valeur={subject.review_load.reduce((a, b) => a + b, 0)}
              />
            </Bloc>

            <Bloc titre="Programme">
              <Ligne
                label="notions"
                valeur={`${subject.notions.consolidated} / ${subject.notions.total}`}
              />
              <Ligne
                label="leçons validées"
                valeur={`${analysis.referentiel.lessons_validated} / ${analysis.referentiel.lessons}`}
              />
              {analysis.in_progress.pending_content > 0 && (
                <Ligne label="à relire" valeur={analysis.in_progress.pending_content} alerte />
              )}
            </Bloc>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Synthèse écrite sur ${subject.name}`}
        confirmLabel="Demander la synthèse"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onGenerate?.();
        }}
      >
        {/* Trois choses annoncées AVANT l'engagement, dont la troisième REMPLACE un dispositif
            absent : le Conseil n'a aucun identifiant de run, donc rien ne peut signaler ailleurs
            qu'une synthèse est en cours (addendum ADR-0020 §8, limite assumée). */}
        ZETIS va rédiger une synthèse sur <strong>{subject.name}</strong> à partir des résultats
        déjà mesurés. Environ 18 secondes, parfois jusqu'à 4 minutes. Le rapport sera ajouté à
        l'historique du Conseil de classe. Tu peux quitter cette page : il t'y attendra. Rien de
        cette synthèse n'apparaît dans l'interface de Massimo.
      </ConfirmDialog>
    </section>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-papa-border bg-papa-surface-2 px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-papa-muted">{titre}</p>
      <div className="mt-1 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function Ligne({
  label,
  valeur,
  alerte = false,
}: {
  label: string;
  valeur: number | string;
  alerte?: boolean;
}) {
  return (
    <p className="flex items-baseline justify-between text-xs">
      <span className="text-papa-muted">{label}</span>
      <span className={`font-mono font-semibold ${alerte ? "text-papa-warn" : ""}`}>{valeur}</span>
    </p>
  );
}
