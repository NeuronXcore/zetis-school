import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, EmptyState, SubjectPictogram } from "@zetis/ui";
import type { OpenGap } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { useModeFocus } from "../hooks/useModeFocus";

// Mode focus Papa — mettre UNE notion en tête de la sélection de missions.
//
// La page promettait auparavant que « ZETIS priorisera les missions, capsules et révisions sur
// cette notion jusqu'à sa consolidation », et son bouton n'écrivait qu'un `useState` local :
// rien n'était persisté, rien n'était priorisé. Il n'existe d'ailleurs AUCUN état « focus » côté
// backend.
//
// Ce qui existe, c'est `Mission.force_priority` : un plancher de score dans le sélecteur de la
// mission du jour (ADR-0018). Mettre une notion en tête revient donc à créer une mission
// prioritaire dessus, par la route Commander déjà en place. La promesse est réécrite pour dire
// exactement ce que le moteur fait — ni plus (pas de capsules, pas de révisions), ni moins.

export function ModeFocusPage() {
  const f = useModeFocus();
  const [confirming, setConfirming] = useState<OpenGap | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mode focus"
        subtitle="Place une notion en tête de la sélection : sa mission passera devant les autres."
      />

      {f.error && (
        <div className="mb-4 rounded-xl border border-papa-warn/30 bg-papa-warn/5 p-4">
          <p className="text-sm text-papa-warn">{f.error}</p>
          <button
            type="button"
            onClick={f.reload}
            className="mt-2.5 rounded-lg border border-papa-border px-3 py-1.5 text-sm font-semibold hover:border-papa-accent"
          >
            Réessayer
          </button>
        </div>
      )}

      {f.done && (
        <section className="mb-5 rounded-2xl border border-papa-accent bg-papa-accent/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-papa-accent">
            Notion mise en tête
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {f.done.subject_name ? `${f.done.subject_name} — ` : ""}
            {f.done.skill_name}
          </h2>
          <p className="mt-2 text-sm text-papa-muted">
            Sa mission passera devant les autres tant qu'elle n'est pas terminée. Le focus n'a pas
            de durée : il s'éteint avec la mission.{" "}
            <Link to="/missions" className="text-papa-accent underline">
              Voir les missions →
            </Link>
          </p>
        </section>
      )}

      {f.loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-papa-surface motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : f.targets.length === 0 && f.covered.length === 0 ? (
        <EmptyState
          title="Aucune notion à cibler"
          description="Le mode focus s'appuie sur les notions à renforcer. Elles apparaissent quand un diagnostic ou une mission en repère une."
        />
      ) : (
        <>
          {f.targets.length > 0 && (
            <>
              <p className="mb-3 text-sm text-papa-muted">Choisis une notion à mettre en tête :</p>
              <ul className="space-y-2">
                {f.targets.map((gap) => (
                  <li key={gap.skill_id}>
                    <button
                      type="button"
                      onClick={() => setConfirming(gap)}
                      disabled={f.busySkillId !== null}
                      className="flex w-full items-center gap-3 rounded-xl border border-papa-border bg-papa-surface px-4 py-3 text-left hover:border-papa-accent disabled:opacity-60"
                    >
                      {gap.subject_slug && (
                        <SubjectPictogram
                          slug={gap.subject_slug}
                          name={gap.subject_name ?? ""}
                          size="sm"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        {gap.subject_name ? `${gap.subject_name} — ` : ""}
                        {gap.skill_name}
                      </span>
                      <span className="shrink-0 text-sm text-papa-accent">
                        {f.busySkillId === gap.skill_id ? "Création…" : "Mettre en tête →"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {f.covered.length > 0 && (
            <section className="mt-6">
              <p className="mb-2 text-sm text-papa-muted">
                Ces notions ont déjà une mission active — en créer une seconde ferait doublon :
              </p>
              <ul className="space-y-2">
                {f.covered.map((gap) => (
                  <li
                    key={gap.skill_id}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-papa-border px-4 py-3 text-sm text-papa-muted"
                  >
                    {gap.subject_slug && (
                      <SubjectPictogram
                        slug={gap.subject_slug}
                        name={gap.subject_name ?? ""}
                        size="sm"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      {gap.subject_name ? `${gap.subject_name} — ` : ""}
                      {gap.skill_name}
                    </span>
                    <Link to="/missions" className="shrink-0 text-papa-accent hover:underline">
                      Voir sa mission →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="Mettre cette notion en tête ?"
        confirmLabel="Mettre en tête"
        busy={f.busySkillId !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const gap = confirming;
          setConfirming(null);
          if (gap) void f.prioritise(gap);
        }}
      >
        <p>
          ZETIS créera une mission courte sur <b>{confirming?.skill_name}</b>, marquée{" "}
          <b>prioritaire</b> : elle passera devant les autres dans la sélection du jour.
        </p>
        <p className="mt-2 text-papa-muted">
          Une mission commandée est <b>validée d'office</b> — elle atteint Massimo sans relecture
          (convention des missions que tu commandes toi-même).
        </p>
      </ConfirmDialog>
    </div>
  );
}
