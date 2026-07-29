import { useMemo, useState } from "react";
import { type AgendaItemStudent } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { NeonBackdrop } from "../components/glass";
import { AgendaItemRow } from "../components/agenda/AgendaItemRow";
import { AgendaWeekStrip } from "../components/agenda/AgendaWeekStrip";
import { UpcomingCard } from "../components/agenda/UpcomingCard";
import { useAgenda } from "../hooks/useAgenda";

// Page `/agenda` de Massimo (ADR-0025, Lot 1) — ce que l'école lui demande.
//
// Ordre vertical imposé par la spec : bande (orientation) → [composer, ABSENT en Lot 1] →
// Aujourd'hui · Demain (action) → Ce qui arrive (anticipation) → À reprendre (rattrapage).
//
// **Phase 0 : Massimo LIT, COCHE et MASQUE — il ne saisit pas.** Il n'y a donc ici ni composer,
// ni bouton « + », ni champ, ni placeholder grisé, ni mention « bientôt » à cet endroit.
// L'ouverture de la saisie (geste de Papa, ADR-0025 §10) doit être un événement positif, pas la
// fin d'une privation affichée pendant des semaines.
//
// Registre de libellés : aucun rouge, aucun « en retard », aucun « X/Y », aucun total, aucune
// série. Un item passé non fait devient « à reprendre », en ambre doux.

export function AgendaPage() {
  const agenda = useAgenda();
  const [laterOpen, setLaterOpen] = useState(false);

  const itemsByDate = useMemo(() => {
    const map: Record<string, AgendaItemStudent[]> = {};
    for (const item of agenda.items) (map[item.due_on] ??= []).push(item);
    return map;
  }, [agenda.items]);

  /** La bande est un INDEX : un tap fait défiler vers les items du jour, il n'ouvre rien. */
  const scrollToDay = (date: string) => {
    const first = itemsByDate[date]?.[0];
    if (!first) return;
    // Déplie « plus tard » si la cible y est cachée, sinon le défilement viserait le vide.
    if (date > agenda.sections.today[0]?.due_on) setLaterOpen(true);
    requestAnimationFrame(() => {
      document.getElementById(`agenda-item-${first.id}`)?.scrollIntoView({
        // `prefers-reduced-motion` : la préférence système est respectée par le navigateur
        // pour `smooth` ; on ne force aucune animation supplémentaire.
        behavior: "smooth",
        block: "center",
      });
    });
  };

  const { today, tomorrow, later, resume } = agenda.sections;
  const nothingNow = today.length === 0 && tomorrow.length === 0;

  return (
    <div className="relative mx-auto max-w-2xl">
      <NeonBackdrop />
      <div className="relative">
        <PageHeader title="Mon agenda" subtitle="Ce que l'école te demande cette semaine." />

        {/* 1 — Bande glissante. Elle reste affichée même sans aucun item : les traces passées
            ont du sens seules. */}
        {agenda.week && (
          <section className="rounded-3xl border border-zetis-border bg-zetis-surface p-3">
            <AgendaWeekStrip
              days={agenda.week.days}
              itemsByDate={itemsByDate}
              onPickDay={scrollToDay}
            />
          </section>
        )}

        {/* 2 — Composer : ABSENT en Lot 1 (rien n'occupe cet espace, rien ne le grise). */}

        {/* 3 — Aujourd'hui · Demain, dépliées. */}
        <Section title="Aujourd'hui">
          {today.length === 0 ? (
            // Ligne calme : jamais « ajoute tes devoirs » — en phase 0 il ne le peut pas, et
            // l'y inviter serait une impasse.
            <Calm>Rien de noté pour aujourd'hui.</Calm>
          ) : (
            today.map((item) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                onToggle={() => agenda.toggleDone(item)}
                onDismiss={() => agenda.dismiss(item)}
              />
            ))
          )}
        </Section>

        <Section title="Demain">
          {tomorrow.length === 0 ? (
            <Calm>Rien de noté pour demain.</Calm>
          ) : (
            tomorrow.map((item) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                onToggle={() => agenda.toggleDone(item)}
                onDismiss={() => agenda.dismiss(item)}
              />
            ))
          )}
        </Section>

        {later.length > 0 && (
          <section className="mt-5">
            <button
              type="button"
              onClick={() => setLaterOpen((open) => !open)}
              className="w-full rounded-2xl border border-zetis-border bg-zetis-surface px-4 py-2.5 text-sm text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
            >
              {/* « La suite », pas « la suite de la semaine » : la bande porte 14 jours, elle
                  déborde la semaine. Un compte de ce qui ARRIVE n'est pas un compte d'arriéré. */}
              {laterOpen ? "Replier la suite ▴" : `La suite · ${later.length} ▾`}
            </button>
            {laterOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {later.map((item) => (
                  <AgendaItemRow
                    key={item.id}
                    item={item}
                    showDate
                    onToggle={() => agenda.toggleDone(item)}
                    onDismiss={() => agenda.dismiss(item)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* 4 — Ce qui arrive : contrôles et rendus seulement, déjà bornés par le serveur. */}
        {agenda.upcoming.length > 0 && (
          <Section title="Ce qui arrive">
            {agenda.upcoming.map((item) => (
              <UpcomingCard key={item.id} item={item} />
            ))}
          </Section>
        )}

        {/* 5 — À reprendre : 3 au maximum, SANS compteur et sans « et N autres ». La section
            ne grossit pas — c'est le mécanisme anti-dette. */}
        {resume.length > 0 && (
          <Section title="À reprendre">
            {resume.map((item) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                showDate
                tone="resume"
                onToggle={() => agenda.toggleDone(item)}
                onDismiss={() => agenda.dismiss(item)}
              />
            ))}
          </Section>
        )}

        {!agenda.loading && nothingNow && later.length === 0 && resume.length === 0 && (
          <p className="mt-6 text-center text-sm text-zetis-muted">
            Ton agenda est vide pour l'instant. Tu peux quand même avancer : une révision, une
            mission, une notion à te faire expliquer.
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
        {title}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Calm({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-sm text-zetis-muted">{children}</p>;
}
