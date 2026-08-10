import { useMemo, useState } from "react";
import { type AgendaItemStudent } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { NeonBackdrop } from "../components/glass";
import { AgendaItemRow } from "../components/agenda/AgendaItemRow";
import { AgendaWeekStrip } from "../components/agenda/AgendaWeekStrip";
import { AgendaDayPanel } from "../components/agenda/AgendaDayPanel";
import { UpcomingCard } from "../components/agenda/UpcomingCard";
import { useAgenda } from "../hooks/useAgenda";
import { RESUME_MAX } from "../lib/agendaSections";

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
  const [resumeOpen, setResumeOpen] = useState(false);
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const itemsByDate = useMemo(() => {
    const map: Record<string, AgendaItemStudent[]> = {};
    for (const item of agenda.items) (map[item.due_on] ??= []).push(item);
    return map;
  }, [agenda.items]);

  /** La bande OUVRE un jour (addendum §17). Elle n'était qu'un index : un tap faisait défiler
   *  vers les items du jour — et **ne faisait rien** sur un jour qui n'en a pas, c'est-à-dire sur
   *  tous les jours passés, dont le serveur ne renvoie jamais d'échéance (§6, asymétrie).
   *  Des points de trace allumés sous un jour muet se lisent comme une panne.
   *
   *  Retaper le jour ouvert le referme : c'est la seule façon de sortir sans chercher un ✕. */
  const pickDay = (date: string) => {
    setPickedDay((current) => (current === date ? null : date));
    requestAnimationFrame(() => {
      document.getElementById("agenda-jour")?.scrollIntoView({
        // `prefers-reduced-motion` : la préférence système est respectée par le navigateur
        // pour `smooth` ; on ne force aucune animation supplémentaire.
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  /** « ✦ Ton plan » depuis « Ce qui arrive » → le plan, qui vit SOUS l'échéance (ADR-0050).
   *
   *  🔴 **Il faut DÉPLIER « la suite » avant de défiler.** Une échéance à J+2 ou plus y est
   *  repliée : une ancre seule ne trouverait rien et le bouton serait mort — le défaut même que
   *  le retrait du « Préparer · bientôt » vient de corriger, réintroduit deux lignes plus bas.
   *
   *  `block: "center"` et non `"nearest"` : c'est le PLAN qu'on vient voir, pas le titre de
   *  l'échéance ; il est sous elle, et « nearest » le laisserait hors écran. */
  const openPlan = (id: number) => {
    setLaterOpen(true);
    requestAnimationFrame(() => {
      document
        .getElementById(`agenda-item-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  /** Traces du jour ouvert — `null` sur un jour à venir, jamais `0` (§7 : un jour qui n'est pas
   *  encore arrivé n'a pas de case vide). Le contrat serveur ne distingue pas `0` de « pas de
   *  donnée » ; on le respecte en n'affichant la ligne que si elle est positive. */
  const pickedTraces = agenda.week?.days.find((d) => d.date === pickedDay)?.traces ?? null;

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
              onPickDay={pickDay}
              pickedDay={pickedDay}
            />
          </section>
        )}

        {/* 1 bis — Le jour ouvert (addendum §17). Placé SOUS la bande et non en bas de page :
            c'est la réponse à un tap, elle doit arriver là où le doigt vient de se poser. */}
        {pickedDay && (
          <AgendaDayPanel
            date={pickedDay}
            items={itemsByDate[pickedDay] ?? []}
            traces={pickedTraces}
            onClose={() => setPickedDay(null)}
            onToggle={(item) => agenda.toggleDone(item)}
            onDismiss={(item) => agenda.dismiss(item)}
            planByItem={agenda.planByItem}
            onToggleStep={agenda.toggleStep}
          />
        )}

        {/* 2 — Composer : ABSENT en Lot 1 (rien n'occupe cet espace, rien ne le grise). */}

        {/* 3 — Aujourd'hui · Demain, dépliées. */}
        <Section title="Aujourd'hui">
          {today.length === 0 ? (
            // Ligne calme : jamais « ajoute tes devoirs » — en phase 0 il ne le peut pas, et
            // l'y inviter serait une impasse.
            <Calm>Rien de noté pour aujourd'hui.</Calm>
          ) : (
            // Le plan se passe à TOUTES les sections, sans exception de section : c'est le
            // SERVEUR qui décide où il y en a un (jours à venir seulement), et le recopier ici
            // en règle d'affichage ferait une seconde source de vérité. « À reprendre » n'en
            // reçoit donc jamais, sans qu'on l'ait écrit nulle part.
            today.map((item) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                onToggle={() => agenda.toggleDone(item)}
                onDismiss={() => agenda.dismiss(item)}
                planSteps={agenda.planByItem[item.id]}
                onToggleStep={agenda.toggleStep}
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
                planSteps={agenda.planByItem[item.id]}
                onToggleStep={agenda.toggleStep}
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
                    planSteps={agenda.planByItem[item.id]}
                    onToggleStep={agenda.toggleStep}
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
              <UpcomingCard key={item.id} item={item} onOpenPlan={() => openPlan(item.id)} />
            ))}
          </Section>
        )}

        {/* 5 — À reprendre : TROIS d'emblée, le reste derrière un dépliage (addendum §17).
            Le plafond protégeait d'un écran qui s'allonge tout seul ; il rendait aussi les plus
            anciens inaccessibles. Le dépliage est un GESTE de Massimo — la section ne grossit
            toujours pas sans qu'il le demande. */}
        {resume.length > 0 && (
          <Section title="À reprendre">
            {(resumeOpen ? resume : resume.slice(0, RESUME_MAX)).map((item) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                showDate
                tone="resume"
                onToggle={() => agenda.toggleDone(item)}
                onDismiss={() => agenda.dismiss(item)}
                planSteps={agenda.planByItem[item.id]}
                onToggleStep={agenda.toggleStep}
              />
            ))}
            {/* ⚠️ Le nombre n'apparaît QUE sur le bouton de dépliage, jamais comme un compteur
                posé à côté du titre : « À reprendre · 8 » serait le compteur d'arriéré que le §7
                interdit. Ici il dit ce que le geste va ouvrir, et il disparaît une fois ouvert. */}
            {!resumeOpen && resume.length > RESUME_MAX && (
              <button
                type="button"
                onClick={() => setResumeOpen(true)}
                className="self-start rounded-lg px-1 py-1 text-xs text-zetis-muted underline-offset-2 transition-colors hover:text-white hover:underline motion-reduce:transition-none"
              >
                voir {resume.length - RESUME_MAX} autre
                {resume.length - RESUME_MAX > 1 ? "s" : ""} ▾
              </button>
            )}
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
