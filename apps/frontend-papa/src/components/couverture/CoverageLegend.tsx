// Légende + notes de bas de page.
//
// Les quatre notes ne sont PAS de la décoration : ce sont des garde-fous de lecture. Sans elles,
// les fractions passent pour exactes et un ✓ passe pour une relecture.

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex h-[21px] w-[24px] items-center justify-center rounded-md text-[11.5px] font-bold ${className}`}
    >
      {children}
    </span>
  );
}

export function CoverageLegend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-papa-border bg-papa-surface px-4 py-3 text-xs text-papa-muted">
      <span className="font-semibold text-papa-text">Légende :</span>
      <span className="flex items-center gap-2">
        <Chip className="bg-emerald-500/15 text-emerald-300">✓</Chip> à jour, servi
      </span>
      <span className="flex items-center gap-2">
        <Chip className="bg-amber-500/15 text-amber-300">⏳</Chip> produit, en attente de relecture
      </span>
      <span className="flex items-center gap-2">
        <Chip className="bg-red-500/15 text-red-300">⚠</Chip> périmé — le cours a changé après
      </span>
      <span className="flex items-center gap-2">
        <Chip className="border-[1.5px] border-dashed border-papa-border font-medium text-papa-muted">
          +
        </Chip>{" "}
        absent — cliquer pour générer
      </span>
      <span className="flex items-center gap-2">
        <Chip className="font-normal text-papa-border">·</Chip> bloqué — cours non validé
      </span>

      <span className="h-0 w-full" />

      <span className="text-papa-muted">
        <b className="text-papa-text">Toute cellule renseignée est cliquable</b> — elle ouvre
        l'objet sur sa page de pilotage (cours → Programme, quiz → Quiz, etc.).
      </span>

      <span className="h-0 w-full" />

      <span className="font-semibold text-papa-text">Provenance de la validation :</span>
      <span className="flex items-center gap-2">
        <Chip className="bg-emerald-500/15 text-emerald-300">✓</Chip> relu par Papa
      </span>
      <span className="flex items-center gap-2">
        <Chip className="bg-emerald-500/5 text-lime-300 ring-1 ring-inset ring-lime-400/40">✓</Chip>{" "}
        validé en lot, non relu pièce à pièce
      </span>
      <span className="flex items-center gap-2">
        <Chip className="bg-slate-500/15 text-slate-300">✓</Chip> servi sans relecture (quiz, par
        doctrine)
      </span>
    </div>
  );
}

export function CoverageFootnotes() {
  return (
    <div className="max-w-4xl space-y-2.5 text-xs leading-relaxed text-papa-muted">
      <p>
        <b className="text-papa-text">Lecture de la matrice.</b> Les quatre premières colonnes sont{" "}
        <b>leçon-centrées</b> : un objet, un état. Les deux dernières (fond distinct) sont{" "}
        <b>notion-centrées</b> — la fraction indique combien des notions enseignées par la leçon
        portent au moins une carte ou une capsule. Elles n'affichent <b>pas</b> d'état de fraîcheur :
        la source canonique d'une notion peut changer de leçon d'une génération à l'autre, un badge
        « périmé » y serait ininterprétable. Une carte comptée sur cette ligne a pu être produite
        depuis le cours d'une autre leçon enseignant la même notion.
      </p>
      <p>
        <b className="text-papa-text">Ce qui compte comme « couvert ».</b> Capsule = validée{" "}
        <b>et rendue en MP4</b> uniquement (une capsule générée, sans voix ou sans rendu, n'est pas
        consommable et n'est pas comptée). Carte de révision = active. Fiche et mindmap = validées.
        Quiz = existant, le quiz n'ayant pas de gate de validation.
      </p>
      <p>
        <b className="text-papa-text">Provenance de la validation.</b> Un ✓ ne dit pas comment
        l'objet est passé. Le nuancier distingue ce qui a été <b>relu pièce à pièce</b>, ce qui est
        passé dans une <b>validation groupée</b>, et ce qui est <b>servi sans relecture</b> par
        doctrine assumée (les quiz). C'est une information de traçabilité, au même titre que
        « généré / manuel » — elle n'est ni comptée, ni classée, ni relancée. Elle sert à expliquer
        un objet le jour où une question se pose sur lui. La <b>colonne Cours</b> le porte aussi, et
        c'est là qu'elle compte le plus : l'équipement d'une mission génère et auto-valide le cours,
        qui peut donc atteindre Massimo sans avoir jamais été ouvert.
      </p>
      <p>
        <b className="text-papa-text">« Cours » n'est pas une colonne comme les autres</b> : c'est
        la porte. Sans cours validé, aucun dérivé n'est générable — la ligne est marquée 🔒 et ses
        cellules sont inertes. Deux causes distinctes de blocage : cours jamais rédigé (action
        possible : le rédiger) ou leçon elle-même non validée (action à mener dans Programme).
      </p>
    </div>
  );
}
