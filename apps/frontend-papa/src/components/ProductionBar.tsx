import { useEffect, useRef, useState } from "react";
import { useEstimatedProgress } from "@zetis/ui";
import { type ActivityItem, type ProductionActivity } from "@zetis/types";


// La barre de production du header Papa (ADR-0041, `docs/frontend-papa/barre-de-production.md`).
//
// Remplace la pastille de `PapaLayout`, dont elle conserve INTÉGRALEMENT la doctrine :
// jamais 0 % pour dire « ça démarre », « en file » ≠ « arrêté », estimation ancrée sur le
// `started_at` du SERVEUR. Ce qui change n'est pas la façon de dire — c'est ce qu'elle regarde :
// tout ce que ZETIS fabrique, et plus seulement les lots.


/** En dessous, la pilule cède par paliers plutôt que de s'écraser (spec § Responsive).
 *
 *  ⚠️ Mesuré : sans cette échelle, à 700 px de header le libellé tombait à **0 px** en occupant
 *  encore 244 px, et à 560 px les cinq états se réduisaient à 104 px illisibles. Les seuils
 *  portent sur la largeur du HEADER — qui vit à droite d'une sidebar et porte déjà deux pilules —
 *  jamais sur celle de la fenêtre. */
const SEUIL_COMPTEUR = 980;
const SEUIL_SUJET = 880;
const SEUIL_LIBELLE = 800;

/** Mesure le **HEADER**, jamais le conteneur de la pilule.
 *
 *  🔴 **Corrigé le 2026-08-06, à l'écran.** La première version observait son propre conteneur —
 *  qui est DÉJÀ écrasé quand elle le lit, puisqu'il est le seul des trois blocs du header à
 *  céder. Résultat mesuré à 644 px de header : pilule **30 px**, libellé **0 px**. L'échelle de
 *  repli se déclenchait sur un espace déjà perdu, donc jamais.
 *
 *  La maquette ne pouvait pas le voir : elle n'avait pas les deux pilules réelles qui se
 *  disputent la place. C'est le contrôle responsive, et lui seul, qui l'a sorti. */
function useLargeurHeader(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [largeur, setLargeur] = useState(9999);
  useEffect(() => {
    const noeud = ref.current?.closest("header") ?? ref.current;
    if (!noeud || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([e]) => setLargeur(e.contentRect.width));
    obs.observe(noeud);
    return () => obs.disconnect();
  }, []);
  return [ref, largeur];
}

/** Ce que la barre écrit à droite. Deux régimes de vérité, un seul signe pour les distinguer. */
function chiffre(item: ActivityItem, estime: number): string | null {
  if (item.status === "queued" || item.status === "stale" || item.status === "failed") return null;
  // La FRACTION est la preuve : seul un lot sait dire « 7 sur 31 ».
  if (item.pct_is_measured && item.pct !== null) return `${item.pct} %`;
  // ⚠️ Le tilde n'est pas décoratif : un appel LLM n'a aucun grain interne, il n'y a rien à
  // sonder pendant ses 32 s. Rendre les deux nombres identiques uniformiserait un mensonge.
  return `≈ ${estime} %`;
}

interface Props {
  activity: ProductionActivity;
  onOpen: () => void;
  onAcknowledge: (kind: "run" | "job", id: number) => void;
}

export function ProductionBar({ activity, onOpen, onAcknowledge }: Props) {
  const [ref, largeur] = useLargeurHeader();
  const echec = activity.failed[0] ?? null;
  // Un échec passe devant : ce n'est pas un état d'avancement, c'est un état d'anomalie.
  const item = echec ?? activity.current;

  // ⚠️ Appelé sans condition — un hook ne se saute pas. C'est son argument `active` qui décide.
  // Et l'ancrage sur `started_at` est ce qui empêche l'estimation de repartir de zéro à chaque
  // changement de route : c'est la différence entre « ça travaille depuis une minute » et
  // « je viens d'ouvrir cette page ».
  // ⚠️ **`item.estimated_ms` et non une constante** (§9) : la durée est MESURÉE par le serveur,
  // par type de travail. `WORK_ESTIMATION_MS` valait 69 s pour TOUT — donc une fiche de 15 s
  // rampait à 20 % pendant qu'elle finissait.
  const estime = useEstimatedProgress(
    item?.status === "running" && !item.pct_is_measured && (item?.estimated_ms ?? 0) > 0,
    item?.estimated_ms ?? 0,
    item?.started_at ? Date.parse(item.started_at) : null,
  );

  if (!item) return null;

  const arrete = item.status === "stale" || activity.worker_alive === false;
  const enFile = item.status === "queued";
  const enEchec = item.status === "failed";
  const indetermine = enFile || arrete;
  const valeur = chiffre(item, estime);

  const montreLibelle = enEchec || arrete || largeur > SEUIL_LIBELLE;
  const montreSujet = largeur > SEUIL_SUJET;
  const montreCompteur = largeur > SEUIL_COMPTEUR && activity.queued_count > 0;

  const [tete, ...reste] = item.label.split(" · ");
  const sujet = reste.join(" · ");

  const ton = enEchec
    ? "border-red-400/45 text-red-300"
    : arrete
      ? "border-amber-400/40 text-amber-300"
      : "border-papa-accent/40 text-papa-accent";
  const remplissage = enEchec
    ? "bg-red-400"
    : arrete
      ? "bg-amber-300"
      : "bg-papa-accent";

  // ⚠️ **Le VERBE suit l'état**, et c'est une décision verrouillée par un test depuis le
  // 2026-08-05 : « ZETIS produit … en file d'attente » se contredirait tout seul. Tant que le
  // travail n'a pas démarré, ZETIS ne produit rien — il va le faire. Et s'il n'a personne pour le
  // faire, il ne le fera pas.
  const mot = enEchec
    ? "Échec"
    : arrete
      ? "ZETIS ne produit pas — aucun moteur de production actif"
      : enFile
        ? "ZETIS va produire · en file d'attente"
        : tete;

  return (
    // ⚠️ **Un PLANCHER, pas `min-w-0`.** La pilule est le seul des trois blocs du header à céder :
    // sans plancher elle cède jusqu'à disparaître (30 px mesurés). En dessous de sa forme réduite
    // — point + barre + pourcentage — il n'y a plus rien à montrer, donc plus rien à rétrécir.
    <div ref={ref} className="flex min-w-[150px] flex-1 justify-center">
      <button
        type="button"
        onClick={onOpen}
        title={
          arrete
            ? "Aucun moteur de production ne tourne — le travail ne démarrera pas tout seul"
            : enEchec
              ? item.error ?? "Ce travail a échoué"
              : "Production en cours — voir le détail"
        }
        className={`flex min-w-[150px] max-w-[520px] flex-1 items-center gap-3 rounded-full border bg-papa-surface/70 px-3.5 py-2 text-xs font-semibold backdrop-blur-sm transition-colors hover:bg-papa-surface ${ton}`}
      >
        {/* ⚠️ Le point ne PULSE que si quelque chose bouge. Un point qui clignote sur une file
            arrêtée est une animation qui ment — c'est elle qu'on regarde avant de lire le texte. */}
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${remplissage} ${
            arrete || enEchec ? "" : "animate-pulse"
          }`}
        />
        {montreLibelle && (
          <span className="min-w-0 shrink truncate">
            {mot}
            {montreSujet && sujet && !enFile && !arrete && (
              <span className="font-medium text-papa-muted"> · {sujet}</span>
            )}
          </span>
        )}
        {!enEchec && (
          <span className="relative h-1.5 min-w-[64px] flex-1 overflow-hidden rounded-full bg-papa-text/10">
            {indetermine ? (
              // Un liseré qui balaie, JAMAIS un remplissage partiel : il n'y a rien à mesurer.
              <span
                className={`absolute inset-y-0 w-1/3 animate-[zetis-sweep_1.35s_ease-in-out_infinite] rounded-full ${remplissage} opacity-70`}
              />
            ) : (
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${remplissage} transition-[width] duration-300`}
                style={{ width: `${item.pct_is_measured ? (item.pct ?? 0) : estime}%` }}
              />
            )}
          </span>
        )}
        {valeur && <span className="shrink-0 tabular-nums">{valeur}</span>}
        {enEchec && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onAcknowledge(item.kind, item.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onAcknowledge(item.kind, item.id);
              }
            }}
            className="shrink-0 rounded-full border border-red-400/45 px-2.5 py-0.5 text-[11px] hover:bg-red-400/15"
          >
            J'ai vu
          </span>
        )}
        {montreCompteur && (
          <span className="shrink-0 border-l border-papa-border pl-2.5 text-[11px] font-normal text-papa-muted tabular-nums">
            +{activity.queued_count} en attente
          </span>
        )}
      </button>
    </div>
  );
}

/** Le repli ultime : même quand la pilule est réduite, une production reste perceptible.
 *  Pleine largeur, 2 px, jamais cliquable. */
export function ProductionEdge({ activity }: { activity: ProductionActivity }) {
  const item = activity.failed[0] ?? activity.current;
  if (!item) return null;
  const arrete = item.status === "stale" || activity.worker_alive === false;
  const couleur =
    item.status === "failed" ? "bg-red-400" : arrete ? "bg-amber-300" : "bg-papa-accent";
  const indetermine = item.status === "queued" || arrete;
  return (
    <div aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-papa-text/10">
      <div
        className={`absolute inset-y-0 rounded-full ${couleur} ${
          indetermine ? "w-1/4 animate-[zetis-sweep_1.35s_ease-in-out_infinite]" : "left-0"
        }`}
        style={
          indetermine
            ? undefined
            : { width: `${item.pct_is_measured ? (item.pct ?? 0) : 100}%` }
        }
      />
    </div>
  );
}
