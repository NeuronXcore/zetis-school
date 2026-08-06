import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmDialog, EmptyState, SubjectPictogram } from "@zetis/ui";
import type { OpenGap } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { useLacunes } from "../hooks/useLacunes";

// Lacunes Papa — la surface de DÉCISION vers laquelle le dashboard renvoie.
//
// 🔴 **Vocabulaire renommé par l'`adr-0040` §5, et ce n'est pas cosmétique.** Trois surfaces
// employaient « à renforcer » pour TROIS populations : le KPI du dashboard comptait 13
// `SkillMastery ∈ {weak, learning}`, le titre de cette page 1 ligne `Gap` ouverte, et
// `SEVERITY.medium` un sous-ensemble de ce sous-ensemble. Conséquence visible : cette page
// affichait « Rien à renforcer » pendant que le dashboard en annonçait 13.
//
// Ici on dit **« lacune ouverte »** — le libellé du `GLOSSARY`. « À renforcer » appartient au
// PALIER DE MAÎTRISE et vit sur Progression, jamais sur une surface `Gap`. Un test-verrou
// l'interdit dans ce fichier : ce dépôt a déjà prouvé deux fois qu'un mot partagé finit par
// fondre deux mesures.
//
// Le mot « lacune » reste hors de toute formulation pouvant atteindre Massimo (surface Papa).
//
// Deux gestes, aucun automatisme et aucune route nouvelle — les deux générateurs existaient déjà :
//   · consolidation → notions découvertes et jamais prises en charge (lacunes `open`) ;
//   · révision      → notions revenues par le SRS après un « à revoir » (lacunes `in_progress`),
//                     c'est le relais que l'ADR-0017 §5bis désigne.
//
// Les missions créées naissent `pending` : elles n'atteignent Massimo qu'après validation.

const SEVERITY: Record<OpenGap["severity"], { label: string; className: string }> = {
  // Aucune teinte rouge : ce sont des notions à travailler, pas des fautes (adr-0024, adr-0028 §6).
  low: { label: "à surveiller", className: "bg-papa-surface-2 text-papa-muted" },
  medium: { label: "à traiter", className: "bg-papa-accent-2/15 text-papa-accent-2" },
  high: { label: "prioritaire", className: "bg-papa-warn/15 text-papa-warn" },
};

const STATUS_LABEL: Record<OpenGap["status"], string> = {
  open: "découverte, jamais travaillée",
  in_progress: "déjà travaillée, pas encore acquise",
};

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
}

export function LacunesPage() {
  const [params, setParams] = useSearchParams();
  // Le filtre vit dans l'URL, pas dans un état local : le lien qui amène ici le porte, et
  // recharger la page ne le perd pas.
  const l = useLacunes(params.get("subject"));
  const [confirming, setConfirming] = useState<null | "remediation" | "revision">(null);

  // Les trois sections dérivent TOUTES du jeu filtré par le hook — aucune ne peut l'oublier.
  const discovered = l.pending.filter((gap) => gap.status === "open");
  const returning = l.pending.filter((gap) => gap.status === "in_progress");

  // ⚠️ Les comptes des BOUTONS, eux, ne sont PAS filtrés — et c'est voulu. Les deux routes de
  // génération n'ont aucun paramètre de matière : elles agissent sur tout. Un bouton qui
  // annoncerait « 3 » et en créerait 7 serait le défaut même que ce chantier corrige, transposé à
  // une action. Le libellé porte donc le compte réel, et le dit quand un filtre est posé.
  const allDiscovered = l.allPending.filter((gap) => gap.status === "open");
  const scopeNote = l.activeSubject ? " · toutes matières" : "";

  const clearFilter = () => {
    const next = new URLSearchParams(params);
    next.delete("subject");
    // `replace` : un filtre est un état d'affichage, pas une étape de navigation.
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Lacunes ouvertes"
        subtitle="Ce que les diagnostics et les missions ont mesuré — et ce qu'il reste à décider."
      />

      {l.activeSubject && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-papa-accent/30 bg-papa-accent/5 px-4 py-2.5 text-sm text-papa-accent">
          <span>
            Filtré sur <strong className="font-semibold">{l.activeSubject.name}</strong>.
          </span>
          <button
            type="button"
            onClick={clearFilter}
            className="rounded-lg border border-papa-accent/40 px-2 py-0.5 text-xs font-semibold hover:border-papa-accent"
          >
            Toutes les matières
          </button>
        </p>
      )}

      {l.error && (
        <div className="mb-4 rounded-xl border border-papa-warn/30 bg-papa-warn/5 p-4">
          <p className="text-sm text-papa-warn">{l.error}</p>
          <button
            type="button"
            onClick={l.reload}
            className="mt-2.5 rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
          >
            Réessayer
          </button>
        </div>
      )}

      {l.result && (
        <p className="mb-4 rounded-xl border border-papa-accent/30 bg-papa-accent/5 px-4 py-3 text-sm text-papa-accent">
          {l.result}{" "}
          <Link to="/missions" className="underline">
            Voir les missions →
          </Link>
        </p>
      )}

      {l.loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-papa-surface motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : l.gaps.length === 0 ? (
        <EmptyState
          title="Aucune lacune ouverte"
          description="Les notions apparaissent ici quand un diagnostic ou une mission mesure qu'elles ne tiennent pas encore. ⚠️ Des notions peuvent rester fragiles SANS lacune ouverte : les deux populations sont disjointes."
          action={
            <Link
              to="/progression?view=notion"
              className="rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
            >
              Voir les paliers sur Progression →
            </Link>
          }
        />
      ) : (
        <>
          <Section
            title="Découvertes, jamais travaillées"
            note="Un diagnostic les a repérées et aucune mission ne les prend en charge."
            gaps={discovered}
            action={
              discovered.length > 0
                ? {
                    label: `Créer ${allDiscovered.length} mission${allDiscovered.length > 1 ? "s" : ""} de consolidation${scopeNote}`,
                    onClick: () => setConfirming("remediation"),
                    busy: l.busy === "remediation",
                  }
                : undefined
            }
          />

          <Section
            title="Revenues par la révision"
            note="Déjà travaillées, pas encore acquises : leur carte de révision les ramène d'elle-même. ZETIS ne relance pas de consolidation dessus — c'est la révision qui vérifie l'acquisition dans le temps."
            gaps={returning}
            action={
              returning.length > 0
                ? {
                    label: `Créer les missions de révision dues${scopeNote}`,
                    onClick: () => setConfirming("revision"),
                    busy: l.busy === "revision",
                  }
                : undefined
            }
          />

          <Section
            title="Déjà prises en charge"
            note="Une mission active couvre ces notions — rien à décider."
            gaps={l.gaps.filter((gap) => gap.has_active_mission)}
          />
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === "revision"
            ? "Créer les missions de révision dues ?"
            : "Créer les missions de consolidation ?"
        }
        confirmLabel="Créer"
        busy={l.busy !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const kind = confirming;
          setConfirming(null);
          if (kind === "revision") void l.createRevision();
          else if (kind === "remediation") void l.createRemediation();
        }}
      >
        {l.activeSubject && (
          <p className="mb-2 rounded-lg border border-papa-warn/30 bg-papa-warn/5 px-3 py-2 text-papa-warn">
            L'écran est filtré sur <b>{l.activeSubject.name}</b>, mais cette création porte sur{" "}
            <b>toutes les matières</b> : la génération ne sait pas se restreindre.
          </p>
        )}
        <p>
          Les missions sont composées à partir des <b>contenus déjà validés</b> — aucun contenu
          n'est généré.
        </p>
        <p className="mt-2">
          Elles naissent <b>en attente de ta validation</b> : elles n'atteindront Massimo qu'une
          fois relues sur la page Missions.
        </p>
        {confirming === "revision" && (
          <p className="mt-2 text-papa-muted">
            Seules les notions dont la carte de révision est <b>due</b> sont reprises, et leur
            nombre est plafonné : une séance reste courte.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

interface SectionAction {
  label: string;
  onClick: () => void;
  busy: boolean;
}

function Section({
  title,
  note,
  gaps,
  action,
}: {
  title: string;
  note: string;
  gaps: OpenGap[];
  action?: SectionAction;
}) {
  // Une section vide n'est pas affichée : elle n'apprendrait rien et pousserait le reste hors
  // de l'écran.
  if (gaps.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest">
          {title} <span className="font-mono text-papa-muted">({gaps.length})</span>
        </h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.busy}
            className="rounded-lg bg-papa-accent px-3.5 py-1.5 text-xs font-bold text-[#042f1f] disabled:opacity-60"
          >
            {action.busy ? "Création…" : action.label}
          </button>
        )}
      </div>
      <p className="mb-2.5 text-xs text-papa-muted">{note}</p>

      <ul className="space-y-2">
        {gaps.map((gap) => {
          const severity = SEVERITY[gap.severity] ?? SEVERITY.medium;
          const detected = formatDate(gap.first_detected_at);
          return (
            <li
              key={`${gap.skill_id}-${gap.status}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-papa-border bg-papa-surface px-4 py-3"
            >
              {gap.subject_slug && (
                <SubjectPictogram slug={gap.subject_slug} name={gap.subject_name ?? ""} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {gap.subject_name ? `${gap.subject_name} — ` : ""}
                  {gap.skill_name}
                </p>
                <p className="text-xs text-papa-muted">
                  {STATUS_LABEL[gap.status]}
                  {detected && ` · repérée le ${detected}`}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${severity.className}`}
              >
                {severity.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
