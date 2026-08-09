import type { DiagnosticFiabilite } from "@zetis/types";

// La bande de fiabilité d'une passation (ADR-0048, Session C).
//
// 🔴 **RÈGLE DE VOCABULAIRE, NON NÉGOCIABLE.** Chaque libellé ici prend **la mesure** pour sujet,
// jamais l'enfant. « Cette mesure est à confirmer », pas « Massimo a peut-être triché ». Un enfant
// accusé à tort par un logiciel apprend surtout à s'en méfier — et la verbalisation, qui est le
// meilleur signal du chantier, repose entièrement sur le fait qu'il n'ait rien à défendre.
//
// 🔴 **Elle se place AVANT les nombres** (entre l'en-tête et la portée) : elle qualifie la mesure
// ENTIÈRE. Placée sous la station ①, elle commenterait des chiffres déjà crus.

const SIGNAUX_POSSIBLES = ["sortie_ecran", "copie", "taille", "plein_ecran"] as const;

function Fait({ texte, quoi }: { texte: React.ReactNode; quoi: string }) {
  return (
    <li className="grid grid-cols-[18px_1fr] items-start gap-2.5 text-sm">
      <span className="text-xs leading-[1.55] text-papa-warn" aria-hidden>
        ◆
      </span>
      <span>
        <span className="font-semibold">{texte}</span>{" "}
        <span className="ml-1 rounded border border-papa-warn/40 px-1 font-mono text-[10px] uppercase tracking-wider text-papa-warn">
          fait
        </span>
        <span className="mt-0.5 block text-xs text-papa-muted">{quoi}</span>
      </span>
    </li>
  );
}

function Indice({ texte, quoi }: { texte: string; quoi: string }) {
  return (
    <li className="grid grid-cols-[18px_1fr] items-start gap-2.5 text-sm text-papa-muted">
      <span className="text-xs leading-[1.55] text-papa-muted/60" aria-hidden>
        ◇
      </span>
      <span>
        <span className="font-medium">{texte}</span>{" "}
        <span className="ml-1 rounded border border-papa-border px-1 font-mono text-[10px] uppercase tracking-wider text-papa-muted/70">
          indice
        </span>
        <span className="mt-0.5 block text-xs text-papa-muted">{quoi}</span>
      </span>
    </li>
  );
}

export function BandeFiabilite({
  fiabilite,
  onRemesurer,
}: {
  /** `null` = **ZETIS ne regardait pas** (passation d'avant le chantier). Ce n'est PAS
   *  « rien à signaler », et les deux ne se rendent pas pareil. */
  fiabilite: DiagnosticFiabilite | null;
  onRemesurer: () => void;
}) {
  // ── État 3 : ZETIS ne regardait pas. Rien du tout, et c'est juste : on ne peut pas reconstituer
  // après coup des conditions qu'on n'a pas observées.
  if (fiabilite == null) return null;

  // ── État 2 : le serveur a regardé et n'a rien vu.
  //
  // 🔴 PAS DE BANDE VERTE. « Mesure fiable ✓ » serait une promesse que l'instrument ne peut pas
  // tenir : aucun signal du navigateur ne survit à un téléphone posé à côté de l'écran. Une ligne
  // grise dit « rien vu », pas « rien eu lieu » — et c'est tout ce qu'on peut affirmer.
  if (fiabilite.verdict !== "a_confirmer") {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-papa-border p-3 px-4 text-[13.5px] text-papa-muted/70">
        Rien à signaler sur les conditions de cette passation.
      </div>
    );
  }

  const { faits, indices, portee } = fiabilite;
  const manquants = SIGNAUX_POSSIBLES.filter((s) => !portee.observables.includes(s));

  return (
    <section className="mt-4 rounded-xl border border-l-[3px] border-papa-warn/40 bg-papa-warn/10 p-4">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h4 className="text-[15.5px] font-semibold text-papa-warn">
          ⚖️ Cette mesure est à confirmer
        </h4>
        <span className="font-mono text-[11px] uppercase tracking-wider text-papa-muted">
          conditions de passation
        </span>
      </div>
      <p className="mt-1.5 max-w-[74ch] text-[13.5px] text-papa-muted">
        Voici ce que ZETIS a observé pendant la passation. Ce ne sont pas des reproches : ce sont les{" "}
        <strong className="text-papa-text">conditions</strong> dans lesquelles la mesure a été prise.
        Les chiffres ci-dessous restent affichés, et ils ont été écrits — ils méritent juste d'être
        lus en sachant ça.
      </p>

      <ul className="mt-3.5 grid list-none gap-2.5 p-0">
        {faits.sorties_ecran > 0 && (
          <Fait
            texte={`L'écran a été quitté ${faits.sorties_ecran} fois`}
            quoi="Quitté puis retrouvé. Toutes les questions étant affichées ensemble, on ne sait pas laquelle était lue à ce moment-là."
          />
        )}
        {faits.enonces_copies > 0 && (
          <Fait
            texte={`${faits.enonces_copies} énoncé${faits.enonces_copies > 1 ? "s" : ""} copié${faits.enonces_copies > 1 ? "s" : ""}`}
            quoi="Le texte d'une question a été copié. Il n'est pas nécessaire de quitter la page pour cela."
          />
        )}
        {faits.plein_ecran_quitte && (
          <Fait
            texte="Le plein écran a été quitté"
            quoi="En sortir pendant la passation est un geste délibéré."
          />
        )}
        {faits.acquises_sans_trace > 0 && (
          <Fait
            texte={`${faits.acquises_sans_trace} notion${faits.acquises_sans_trace > 1 ? "s" : ""} sur ${faits.notions_total} donnée${faits.acquises_sans_trace > 1 ? "s" : ""} acquise${faits.acquises_sans_trace > 1 ? "s" : ""} sans aucune trace antérieure`}
            quoi="Jamais mesurée, aucun cours ouvert, aucune passation avant celle-ci."
          />
        )}
        {indices.reponses_rapides > 0 && (
          <Indice
            texte={`${indices.reponses_rapides} réponse${indices.reponses_rapides > 1 ? "s" : ""} nettement plus rapide${indices.reponses_rapides > 1 ? "s" : ""} que les autres`}
            quoi="Ne déclenche jamais rien à lui seul : rapide ≠ copié, et lent ≠ honnête."
          />
        )}
        {indices.taille_changee && (
          <Indice
            texte="La fenêtre a changé de taille pendant la passation"
            quoi="Peut être un écran partagé — ou une tablette qu'on a tournée."
          />
        )}
      </ul>

      {/* 🔴 L'INSTRUMENT DIT SA PORTÉE. Sans elle, l'absence d'un signal se lirait comme l'absence
          du comportement — or iOS Safari refuse le plein écran sur iPhone. Papa doit lire ce qui
          suit en sachant sur combien d'yeux ce constat repose. */}
      <p className="mt-3.5 flex items-baseline gap-2 border-t border-dashed border-papa-border pt-3 text-xs text-papa-muted">
        <span aria-hidden>🔭</span>
        <span>
          <strong className="font-mono text-papa-text">{portee.observables.length}</strong> des{" "}
          <strong className="font-mono text-papa-text">{SIGNAUX_POSSIBLES.length}</strong> signaux
          étaient observables sur cet appareil.
          {manquants.includes("plein_ecran") && (
            <span className="text-papa-muted/70">
              {" "}
              Le plein écran n'a pas pu être demandé — iOS Safari le refuse sur iPhone.
            </span>
          )}
        </span>
      </p>

      {/* 🔴 UN SEUL GESTE, et pas de bouton « j'ai vérifié ». Les conditions d'une passation sont un
          fait daté, au même titre que le score : les effacer parce qu'on les a lues reviendrait à
          réécrire la mesure. La seule réponse à « à confirmer » est une SECONDE mesure. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
        <button
          type="button"
          onClick={onRemesurer}
          className="rounded-lg border border-papa-accent/40 bg-papa-accent/10 px-3.5 py-1.5 text-sm font-medium text-papa-accent hover:bg-papa-accent/20"
        >
          Remesurer cette matière →
        </button>
        <span className="max-w-[52ch] text-xs text-papa-muted">
          C'est la seule réponse à « à confirmer » : une deuxième mesure. Aucune case à cocher, rien
          à valider, rien à défaire.
        </span>
      </div>
    </section>
  );
}
