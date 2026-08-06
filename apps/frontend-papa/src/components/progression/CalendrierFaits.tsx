import type { DatedFact } from "@zetis/types";

// Grille calendaire des faits datés — patron du Cahier de bord (adr-0040 §2, amendé le 2026-08-06).
//
// 🔴 **La case porte un COMPTE, et ce compte est un repère de NAVIGATION, pas une mesure de
// progression.** C'est la nuance qui rend cette grille compatible avec le §3 (« des événements,
// jamais des agrégats temporels ») : le nombre dit « il s'est passé quelque chose ici, ouvre »,
// il ne prétend décrire aucune tendance. Le drill-down d'un jour est la PREMIÈRE exception
// assumée de l'`adr-0028` §4 — le précédent est au dossier, pas inventé ici.
//
// Sans elle, la grille serait impossible : les données réelles sont GRUMELEUSES — 86 faits sur
// l'année dont une vingtaine le seul 05/07, et zéro l'immense majorité des jours. Aucune case ne
// peut afficher vingt faits nommés ; le panneau du jour, si.
//
// ⚠️ `lib/sessions::buildMonthGrid` n'est PAS réutilisé : il rend des cases `sessions` /
// `activeMinutes`, qui n'ont aucun sens ici. C'est le PATRON qu'on reprend (grille CSS sept
// colonnes, navigation de mois, futur interdit), jamais la fonction.

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function libelleMois(ancre: Date): string {
  return `${MOIS[ancre.getMonth()]} ${ancre.getFullYear()}`;
}

/** Date locale en `YYYY-MM-DD` — jamais `toISOString()`, qui bascule en UTC et décale d'un jour
 *  les faits de fin de soirée. Le piège classique des calendriers. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface CaseJour {
  date: string;
  jour: number;
  dansLeMois: boolean;
  futur: boolean;
  faits: DatedFact[];
}

/** Construit la grille du mois, alignée sur les semaines (lundi en tête). */
export function construireGrille(faits: DatedFact[], ancre: Date, aujourdHui = new Date()): CaseJour[][] {
  const parJour = new Map<string, DatedFact[]>();
  for (const f of faits) {
    const j = f.at.slice(0, 10);
    const l = parJour.get(j);
    if (l) l.push(f);
    else parJour.set(j, [f]);
  }

  const premier = new Date(ancre.getFullYear(), ancre.getMonth(), 1);
  // `getDay()` rend 0 pour dimanche : on décale pour que la semaine commence LUNDI.
  const decalage = (premier.getDay() + 6) % 7;
  const debut = new Date(premier);
  debut.setDate(1 - decalage);

  const todayIso = isoLocal(aujourdHui);
  const semaines: CaseJour[][] = [];
  const curseur = new Date(debut);
  for (let s = 0; s < 6; s += 1) {
    const semaine: CaseJour[] = [];
    for (let j = 0; j < 7; j += 1) {
      const iso = isoLocal(curseur);
      semaine.push({
        date: iso,
        jour: curseur.getDate(),
        dansLeMois: curseur.getMonth() === ancre.getMonth(),
        futur: iso > todayIso,
        faits: parJour.get(iso) ?? [],
      });
      curseur.setDate(curseur.getDate() + 1);
    }
    semaines.push(semaine);
    // Sixième ligne inutile si le mois est déjà couvert : une ligne entièrement hors-mois est du
    // bruit visuel.
    if (semaine.every((c) => !c.dansLeMois) && s >= 4) {
      semaines.pop();
      break;
    }
  }
  return semaines;
}

/** Teinte selon la DENSITÉ, en transparence pour que le numéro reste lisible par-dessus.
 *  Quatre paliers seulement : au-delà, l'œil ne distingue plus, et prétendre le contraire
 *  ferait de la couleur une mesure — ce qu'elle n'est pas. */
function teinte(n: number): string {
  if (n === 0) return "bg-transparent";
  if (n <= 2) return "bg-papa-accent/15";
  if (n <= 5) return "bg-papa-accent/30";
  if (n <= 10) return "bg-papa-accent/45";
  return "bg-papa-accent/65";
}

export function CalendrierFaits({
  faits,
  ancre,
  jourSelectionne,
  onSelectJour,
  onDecalerMois,
  peutSuivant,
  peutPrecedent,
}: {
  faits: DatedFact[];
  ancre: Date;
  jourSelectionne: string | null;
  onSelectJour: (date: string | null) => void;
  onDecalerMois: (offset: number) => void;
  /** Le futur n'a pas de journal. */
  peutSuivant: boolean;
  /** Au-delà de la fenêtre servie (365 j), toutes les cases seraient vides — et une grille vide
   *  se lirait « rien ne s'est passé » au lieu de « rien n'a été servi ». */
  peutPrecedent: boolean;
}) {
  const semaines = construireGrille(faits, ancre);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onDecalerMois(-1)}
          disabled={!peutPrecedent}
          aria-label="Mois précédent"
          className="rounded-lg border border-papa-border px-2.5 py-1 text-sm text-papa-muted hover:border-papa-accent disabled:opacity-30"
        >
          ←
        </button>
        <p className="text-sm font-semibold capitalize">{libelleMois(ancre)}</p>
        <button
          type="button"
          onClick={() => onDecalerMois(1)}
          disabled={!peutSuivant}
          aria-label="Mois suivant"
          className="rounded-lg border border-papa-border px-2.5 py-1 text-sm text-papa-muted hover:border-papa-accent disabled:opacity-30"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase tracking-wide text-papa-muted">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {semaines.flat().map((c) => {
          const vide = c.faits.length === 0;
          return (
            <button
              key={c.date}
              type="button"
              // Un jour sans fait n'est pas cliquable : ouvrir un panneau vide serait promettre un
              // détail qui n'existe pas.
              disabled={vide || c.futur}
              aria-pressed={jourSelectionne === c.date}
              onClick={() => onSelectJour(jourSelectionne === c.date ? null : c.date)}
              className={`aspect-square rounded-lg border p-1 text-left text-xs transition ${teinte(
                c.faits.length,
              )} ${
                jourSelectionne === c.date
                  ? "border-papa-accent ring-1 ring-papa-accent"
                  : "border-papa-border"
              } ${c.dansLeMois ? "" : "opacity-30"} ${
                vide || c.futur ? "cursor-default" : "hover:border-papa-accent"
              }`}
            >
              <span className="tabular-nums text-papa-muted">{c.jour}</span>
              {!vide && (
                <span className="block text-right font-semibold tabular-nums">
                  {c.faits.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
