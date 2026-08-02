// Une cellule de la matrice de couverture — un objet, un état, y compris quand c'est inconfortable.
//
// Le ROUGE va au périmé et l'AMBRE au `pending`, à rebours de l'intuition : un `pending` dort et
// ne fait aucun mal, un périmé ATTEINT Massimo avec un contenu obsolète. La couleur suit la
// gravité, pas l'urgence ressentie.
import { Link } from "react-router-dom";
import { type CoverageCell, type CoverageCellKey, type ValidatedBy } from "@zetis/types";

const CELL_LABEL: Record<CoverageCellKey, string> = {
  cours: "Cours",
  quiz: "Quiz",
  fiche: "Fiche",
  mindmap: "Mindmap",  // JAMAIS « carte mentale » : à ne pas confondre avec les cartes de révision
};

/** Nuancier de provenance (§F) : un ✓ ne dit pas COMMENT l'objet est passé.
 *
 * ⚠️ **`null` a sa propre teinte depuis l'ADR-0032**, et c'est une correction. Il était rendu
 * COMME `parent_bulk` (« la prudence est de ne pas le faire passer pour une relecture qu'on ne
 * peut pas attester ») — sauf qu'une provenance *inconnue* et une validation *groupée* devenaient
 * indistinguables à l'œil, alors que le texte du `title` les distinguait déjà. Le §G l'avait
 * signalé comme une dette à solder AVANT d'ajouter une quatrième valeur : sans ça, trois teintes
 * sur quatre se seraient ressemblé.
 *
 * L'échelle `parent` → `parent_bulk` → `parent_rule` est celle du §G.1 : une décision humaine à
 * attention décroissante. La couleur suit cette décroissance (plein → cerné → pointillé) ; `null`
 * en sort par le gris, parce qu'il ne dit rien. */
function provenanceClass(by: ValidatedBy | null): string {
  if (by === "parent") return "bg-emerald-500/15 text-emerald-300";
  if (by === "parent_bulk")
    return "bg-emerald-500/5 text-lime-300 ring-1 ring-inset ring-lime-400/40";
  if (by === "parent_rule")
    return "bg-emerald-500/5 text-lime-200 ring-1 ring-inset ring-dashed ring-lime-400/50";
  if (by === "system") return "bg-slate-500/15 text-slate-300";
  return "bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-400/25";
}

function provenanceText(by: ValidatedBy | null): string {
  if (by === "parent") return "relu pièce à pièce par Papa";
  if (by === "system") return "servi sans relecture, par doctrine (quiz, ADR-0014)";
  if (by === "parent_bulk") return "validation groupée ou équipement — jamais ouvert pièce à pièce";
  if (by === "parent_rule")
    return "servi par une règle que vous avez posée — personne n'a cliqué pour ce lot";
  return "provenance inconnue (antérieure à la traçabilité)";
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR");
}

function title(key: CoverageCellKey, cell: CoverageCell, blockedReason: string): string {
  const label = CELL_LABEL[key];
  const when = formatDate(cell.derived_at);
  switch (cell.state) {
    case "blocked":
      return `${label} — ${blockedReason}`;
    case "absent":
      return key === "cours"
        ? "Aucun cours rédigé — cliquer pour le rédiger (moteur local)"
        : `Aucune ${label.toLowerCase()} — cliquer pour générer`;
    case "pending":
      return `${label} produite${when ? ` le ${when}` : ""} — jamais relue, n'atteint pas Massimo`;
    case "stale":
      return `${label}${when ? ` du ${when}` : ""} — le cours a été réécrit après : servie à Massimo dans son ancienne version`;
    case "validated":
      return `${label}${when ? ` — ${when}` : ""} · ${provenanceText(cell.validated_by)}`;
  }
}

/** Affordance des cellules cliquables.
 *
 * Sans elle, un ✓ enveloppé dans un lien ressemble trait pour trait à un ✓ inerte : la
 * fonction existe mais personne ne la trouve. L'anneau au survol + le curseur main disent
 * « ceci s'ouvre », sans ajouter de bruit permanent dans une matrice déjà dense. */
const LINK_AFFORDANCE =
  "inline-block cursor-pointer rounded-md ring-offset-1 ring-offset-papa-surface " +
  "transition-all hover:ring-2 hover:ring-papa-accent/70 hover:brightness-125";

export function CoverageCellView({
  cellKey,
  cell,
  blockedReason,
  busy,
  href,
  onGenerate,
  onStale,
}: {
  cellKey: CoverageCellKey;
  cell: CoverageCell;
  blockedReason: string;
  busy: boolean;
  /** Route de pilotage de CET objet. Une cellule renseignée y mène — sinon Papa devrait le
   *  retrouver à la main sur une autre page. `null` quand il n'y a rien à ouvrir. */
  href: string | null;
  onGenerate: () => void;
  onStale: () => void;
}) {
  const base =
    "inline-flex h-[26px] w-[30px] items-center justify-center rounded-md text-[13px] font-bold";
  const hint = title(cellKey, cell, blockedReason);

  if (cell.state === "blocked") {
    return (
      <span className={`${base} font-normal text-papa-border`} title={hint}>
        ·
      </span>
    );
  }

  if (cell.state === "absent") {
    return (
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        title={hint}
        aria-label={hint}
        data-state="absent"
        className={`${base} border-[1.5px] border-dashed border-papa-border font-medium text-papa-muted transition-colors hover:border-papa-accent hover:bg-papa-accent/10 hover:text-papa-accent disabled:cursor-not-allowed disabled:opacity-40`}
      >
        +
      </button>
    );
  }

  if (cell.state === "pending") {
    const chip = (
      <span className={`${base} bg-amber-500/15 text-amber-300`} data-state="pending">
        ⏳
      </span>
    );
    return href ? (
      <Link to={href} title={`${hint} — ouvrir pour la relire`} className={LINK_AFFORDANCE}>
        {chip}
      </Link>
    ) : (
      <span title={hint}>{chip}</span>
    );
  }

  if (cell.state === "stale") {
    return (
      <button
        type="button"
        onClick={onStale}
        title={hint}
        aria-label={hint}
        data-state="stale"
        className={`${base} bg-red-500/15 text-red-300 hover:bg-red-500/25`}
      >
        ⚠
      </button>
    );
  }

  const chip = (
    <span
      className={`${base} ${provenanceClass(cell.validated_by)}`}
      data-state="validated"
      data-provenance={cell.validated_by ?? "unknown"}
    >
      ✓
    </span>
  );
  return href ? (
    <Link to={href} title={`${hint} — ouvrir`} className={LINK_AFFORDANCE}>
      {chip}
    </Link>
  ) : (
    <span title={hint}>{chip}</span>
  );
}

/** Colonne NOTION-centrée : une fraction, et **aucun état de fraîcheur** (§E.5).
 *
 * Ne pas en ajouter, même si ça paraît symétrique : la source canonique d'une notion peut
 * changer de leçon d'une génération à l'autre, un badge « périmé » y serait ininterprétable. */
export function CoverageFractionView({
  covered,
  total,
  label,
  blocked,
  onOpen,
}: {
  covered: number;
  total: number;
  label: string;
  blocked: boolean;
  /** Ouvre le détail par notion. Absent → la fraction reste un simple affichage. */
  onOpen?: () => void;
}) {
  const base =
    "inline-flex h-[26px] min-w-[30px] items-center justify-center rounded-md px-1 text-[11.5px] font-bold";
  if (blocked) {
    return (
      <span className={`${base} font-normal text-papa-border`} title="Cours non validé">
        ·
      </span>
    );
  }
  const hint =
    total === 0
      ? "Aucune notion rattachée à cette leçon"
      : `${covered} notion(s) sur ${total} portent au moins ${label}`;
  const tone =
    total === 0 || covered === 0
      ? "border-[1.5px] border-dashed border-papa-border font-medium text-papa-muted"
      : covered === total
        ? "bg-emerald-500/15 text-emerald-300"
        : "bg-amber-500/15 text-amber-300";
  if (!onOpen || total === 0) {
    return (
      <span className={`${base} ${tone}`} title={hint}>
        {covered}/{total}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${hint} — cliquer pour voir le détail par notion`}
      data-fraction
      className={`${base} ${tone} transition-opacity hover:opacity-80`}
    >
      {covered}/{total}
    </button>
  );
}
