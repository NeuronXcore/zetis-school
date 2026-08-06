import { Button, useEstimatedProgress } from "@zetis/ui";
import { type ActivityItem, type ProductionActivity } from "@zetis/types";

import { ProgressBar } from "./ProgressBar";
import { WORK_ESTIMATION_MS } from "../lib/production";

// Le détail de ce que ZETIS fabrique, ouvert depuis la barre d'en-tête (Papa uniquement).
//
// ## Ce que ce panneau est devenu (ADR-0041 §7)
//
// Il montrait UN lot. Il montre désormais **tout ce qui est en vol** : le travail courant, la file
// derrière lui **dans l'ordre où elle sera servie**, et les échecs non acquittés. Le §7 promet que
// « ce qui n'est pas montré est à un clic » — la barre ne rend que le courant, donc c'est ici que
// le reste doit exister, sinon la promesse est vide.
//
// ⚠️ **Un PROCESSUS, jamais un stock.** Aucun compteur d'arriéré : « 12 contenus non contrôlés »
// affiché en permanence serait le reproche que l'addendum ADR-0011 §F.2 interdit — la provenance
// est un fait, elle ne se totalise pas. Ce qui est compté ici est du travail EN VOL, qui retombe
// à zéro tout seul.

/** D'où vient ce travail, en mots de Papa (§7).
 *
 *  ⚠️ Sans cela, Papa ouvre son écran à 8 h et voit ZETIS travailler sur quelque chose qu'il n'a
 *  pas demandé, sans pouvoir savoir pourquoi. */
const ORIGINE: Record<string, string> = {
  manual: "lancé par vous",
  agenda: "préparé pour une échéance",
  request: "demandé par Massimo",
};

function Ligne({
  item,
  rang,
  onAcknowledge,
}: {
  item: ActivityItem;
  /** Position dans la file, à partir de 1. `null` pour le travail courant et pour un échec. */
  rang: number | null;
  onAcknowledge?: (kind: "run" | "job", id: number) => void;
}) {
  // ⚠️ Appelé sans condition — un hook ne se saute pas. `active` décide, et il est faux tant que
  // le travail n'a pas démarré : une barre qui monte sur un travail en file mentirait.
  const estime = useEstimatedProgress(
    item.status === "running" && !item.pct_is_measured,
    WORK_ESTIMATION_MS,
    item.started_at ? Date.parse(item.started_at) : null,
  );

  const enEchec = item.status === "failed";
  const arrete = item.status === "stale";
  const icone = enEchec ? "✕" : arrete ? "⚠" : item.status === "running" ? "⟳" : "◷";
  const ton = enEchec
    ? "text-red-300"
    : arrete
      ? "text-amber-300"
      : item.status === "running"
        ? "text-papa-accent"
        : "text-papa-muted";

  // La FRACTION est la preuve : seul un lot sait dire « 7 sur 31 ». Le tilde dit l'estimation.
  const etat = enEchec
    ? null
    : arrete
      ? "arrêté"
      : item.status === "queued"
        ? rang
          ? `en file — ${rang}${rang === 1 ? "er" : "e"}`
          : "en file"
        : item.pct_is_measured && item.pct !== null
          ? `${item.pct} %`
          : `≈ ${estime} %`;

  return (
    <li
      className={`flex items-start gap-3 border-t border-papa-border/60 px-4 py-3 first:border-t-0 ${
        enEchec ? "bg-red-400/5" : ""
      }`}
    >
      <span aria-hidden className={`w-4 shrink-0 text-center text-xs ${ton}`}>
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{item.label}</span>
        <span className={`text-xs ${enEchec ? "text-red-300" : "text-papa-muted"}`}>
          {enEchec
            ? (item.error ?? "ce travail a échoué, sans motif enregistré")
            : (ORIGINE[item.trigger ?? ""] ?? "origine non enregistrée")}
        </span>
        {item.status === "running" && (
          <span className="mt-1.5 block">
            <ProgressBar
              pct={item.pct_is_measured ? (item.pct ?? 0) : estime}
              label=""
            />
          </span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums">
        {etat}
        {enEchec && onAcknowledge && (
          <button
            type="button"
            onClick={() => onAcknowledge(item.kind, item.id)}
            className="rounded-full border border-red-400/45 px-2.5 py-0.5 text-[11px] font-semibold text-red-300 hover:bg-red-400/15"
          >
            J'ai vu
          </button>
        )}
      </span>
    </li>
  );
}

export function ActiveProductionModal({
  activity,
  onClose,
  onAcknowledge,
}: {
  activity: ProductionActivity;
  onClose: () => void;
  onAcknowledge: (kind: "run" | "job", id: number) => void;
}) {
  const { current, queued, failed, queued_count } = activity;
  const rien = !current && queued.length === 0 && failed.length === 0;
  // ⚠️ Le serveur borne la file à 20 et `queued_count` dit le TOTAL. Une troncature muette se
  // lirait comme une exhaustivité : on la déclare.
  const masques = Math.max(0, queued_count - queued.length);
  // Le travail « courant » compte comme EN ATTENTE tant qu'il n'a pas démarré.
  const attendent = queued_count + (current && current.status !== "running" ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-papa-border bg-papa-surface">
        <header className="flex items-baseline justify-between gap-3 border-b border-papa-border bg-papa-surface-2 px-4 py-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-papa-muted">
            Production en cours
          </h2>
          <span className="text-xs text-papa-muted">
            {/* ⚠️ **`current` n'est pas forcément EN COURS.** Quand rien ne tourne, il porte le
                premier de la file — le résumé disait donc « 1 en cours » sur une file arrêtée,
                pendant que la ligne juste en dessous disait « en file ». Vu à l'écran le
                2026-08-06. Le compte suit les STATUTS, pas la présence d'un objet. */}
            {rien
              ? "rien en vol"
              : [
                  current?.status === "running" ? "1 en cours" : null,
                  attendent ? `${attendent} en attente` : null,
                  failed.length ? `${failed.length} échec${failed.length > 1 ? "s" : ""}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </header>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {failed.map((f) => (
            <Ligne key={`f-${f.kind}-${f.id}`} item={f} rang={null} onAcknowledge={onAcknowledge} />
          ))}
          {current && <Ligne key={`c-${current.kind}-${current.id}`} item={current} rang={null} />}
          {queued.map((q, i) => (
            <Ligne key={`q-${q.kind}-${q.id}`} item={q} rang={i + 1} />
          ))}
          {rien && (
            <li className="px-4 py-8 text-center text-sm text-papa-muted">
              ZETIS ne fabrique rien en ce moment.
            </li>
          )}
          {masques > 0 && (
            <li className="border-t border-papa-border/60 px-4 py-2 text-center text-xs text-papa-muted">
              …et {masques} autre{masques > 1 ? "s" : ""} plus loin dans la file
            </li>
          )}
        </ul>

        <footer className="border-t border-papa-border px-4 py-3 text-xs text-papa-muted">
          {/* Le §5 rendu VISIBLE : une règle de priorité qu'on ne peut pas vérifier à l'œil n'est
              pas vérifiée. Et ce que « passer devant » veut dire doit être dit, sinon Papa
              l'attend au mauvais moment. */}
          Un travail lancé à la main passe devant les travaux automatiques — <b>l'ordre ci-dessus
          est celui qui sera servi</b>. ⚠️ Le travail en cours n'est jamais interrompu : le vôtre
          démarrera à la fin de la <b>notion</b> en cours, pas à la fin du lot.
          <br />
          Tout tourne dans un processus séparé : vous pouvez fermer cette fenêtre et naviguer. La
          production se met en pause si Massimo travaille — entre deux notions, jamais au milieu
          d'une.
        </footer>

        <div className="flex justify-end gap-2 border-t border-papa-border px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
