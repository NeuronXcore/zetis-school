// Règles d'affichage pures de la page Années scolaires : quel badge et quelles
// actions pour quel statut (le JSX ne décide jamais lui-même — patron chapterActions),
// et résolution informative niveau → cycle (ADR-0009 §5).
import { type SchoolYearStatus } from "@zetis/types";

/** Affichage seulement — le backend fait sa propre résolution (service curriculum). */
export const CYCLE_BY_LEVEL: Record<string, string> = {
  "6e": "cycle 3",
  "5e": "cycle 4",
  "4e": "cycle 4",
  "3e": "cycle 4",
};

export function cycleForLevel(level: string): string | undefined {
  return CYCLE_BY_LEVEL[level];
}

/** Ligne « Programme : cycle 4 · version 2020 » — résolution INFORMATIVE (aucun
 *  paramétrage). Version omise si aucun chapitre généré ne la porte ; null si le
 *  niveau n'est pas résolu (ex. lycée, différé — ADR-0009 §8). */
export function programmeLine(level: string, programVersion: string | null): string | null {
  const cycle = cycleForLevel(level);
  if (!cycle) return null;
  return programVersion ? `${cycle} · version ${programVersion}` : cycle;
}

export interface YearBadge {
  label: string;
  /** Variante `Badge` @zetis/ui — Active = émeraude, Brouillon = ambre, Archivée = neutre
   *  (spec § Thème : texte foncé de la même famille que le fond, jamais noir pur). */
  variant: "success" | "warning" | "muted";
}

export interface YearActions {
  badge: YearBadge;
  /** Édition inline (libellé, dates — jamais le niveau) : année active uniquement (V1). */
  canEdit: boolean;
  /** « Voir le programme → » (chemin majoritaire) : année active uniquement. */
  showProgramLink: boolean;
  /** « Activer » (non destructif — l'ancienne active passe archivée, règle backend) :
   *  brouillons ET archivées (seule voie de retour après une activation erronée,
   *  puisqu'il n'y a ni suppression ni retour en brouillon). */
  canActivate: boolean;
}

export function yearActions(status: SchoolYearStatus): YearActions {
  const badge: YearBadge =
    status === "active"
      ? { label: "Active", variant: "success" }
      : status === "draft"
        ? { label: "Brouillon", variant: "warning" }
        : { label: "Archivée", variant: "muted" };
  return {
    badge,
    canEdit: status === "active",
    showProgramLink: status === "active",
    canActivate: status !== "active",
  };
}

/** « 01 sept. 2026 → 04 juil. 2027 » — null si aucune date renseignée. */
export function formatDateRange(startsOn: string | null, endsOn: string | null): string | null {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
      // Heure locale explicite : `new Date("YYYY-MM-DD")` seul serait parsé en UTC
      // (décalage d'un jour possible à l'affichage).
      .format(new Date(`${iso}T00:00:00`));
  if (startsOn && endsOn) return `${fmt(startsOn)} → ${fmt(endsOn)}`;
  if (startsOn) return `À partir du ${fmt(startsOn)}`;
  if (endsOn) return `Jusqu'au ${fmt(endsOn)}`;
  return null;
}
