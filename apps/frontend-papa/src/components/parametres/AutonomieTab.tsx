// ⚡ L'onglet Autonomie — ZETIS LEVELS (ADR-0032, ADR-0035).
//
// 🔴 **Ce fichier ne fait que DÉPLACER.** Il porte, à l'identique, ce que `ParametresPage.tsx`
// rendait avant l'ADR-0062 : le renvoi vers l'Agenda, puis `<AutonomyPanel />`. Aucune ligne de la
// logique d'autonomie n'a changé — c'est le deuxième des trois critères qui bornent ce chantier.
//
// ⚠️ Le renvoi ci-dessous dit la même chose qu'une ligne de la carte, et c'est assumé : la carte
// répond à « où vit chaque réglage ? », ce bloc répond à « qu'est-ce qui se règle ailleurs, alors
// que je suis en train de régler l'autorité ? ». Deux questions, deux endroits — mais si l'un des
// deux se met à dire autre chose que l'autre, c'est celui-ci qui part.
import { Link } from "react-router-dom";

import { AutonomyPanel } from "./AutonomyPanel";

export function AutonomieTab() {
  return (
    <>
      <section className="rounded-xl border border-papa-border bg-papa-surface p-5">
        <p className="font-semibold">Réglages actifs</p>
        <p className="mt-2 text-sm text-papa-muted">
          Certains réglages de ZETIS vivent à l'endroit où vous prenez la décision, pas dans un
          panneau séparé : l'accès de Massimo à la saisie de l'agenda reste sur la page{" "}
          <Link to="/agenda" className="font-semibold text-papa-accent underline">
            Agenda
          </Link>
          . L'autonomie, elle, est transversale — elle se règle ci-dessous.
        </p>
      </section>

      <AutonomyPanel />
    </>
  );
}
