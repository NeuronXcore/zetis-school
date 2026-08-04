// La barre de filtres du Journal (addendum ADR-0034 « tri et filtre »).
//
// ⚠️ **Les CONTRÔLES se replient ; les critères ACTIFS, jamais.** La ligne de synthèse — le compte,
// les pastilles de ce qui filtre, « Tout effacer » — reste affichée en toutes circonstances. C'est
// elle qui répond à « pourquoi mon journal est-il si court ? » ; replier un filtre **actif** serait
// exactement le défaut que cette barre existe pour éviter.
//
// Mesuré dans un navigateur sur la maquette : à plat, la barre faisait **385 px** et le premier lot
// commençait à **578 px** sur un écran de 720 — plus de la moitié du pli avant d'avoir vu un lot.
// Repliée : 227 px.
import { SubjectFilterChips, type SubjectFilterOption } from "@zetis/ui";
import { type PieceKind } from "@zetis/types";

import { REGIME_AVATAR, type Visage } from "../../lib/regimeVisuals";
import {
  MODES,
  MODE_LABEL,
  PIECES,
  PIECE_FILTRE_LABEL,
  STATUTS,
  STATUT_LABEL,
  TRIS,
  TRI_LABEL,
  basculer,
  criteresReplies,
  filtreActif,
  triParDefaut,
  type JournalFiltre,
  type ModeFiltre,
} from "../../lib/journalFilters";

export interface ChapitreOption {
  id: number;
  name: string;
}

interface Props {
  filtre: JournalFiltre;
  onChange: (f: JournalFiltre) => void;
  onReset: () => void;
  subjects: SubjectFilterOption[];
  chapitres: ChapitreOption[];
  total: number;
  totalNonFiltre: number | null;
  deplie: boolean;
  onToggleDeplie: () => void;
}

const PILL = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold";
const PILL_OFF = "border-white/15 text-papa-muted hover:border-white/35 hover:text-papa-text";
const PILL_ON = "border-primary bg-primary/10 text-primary";

function Pastille({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={actif} onClick={onClick} className={`${PILL} ${actif ? PILL_ON : PILL_OFF}`}>
      {children}
    </button>
  );
}

/** Le visage d'un mode. `sur_mesure` et `inconnu` partagent le NEUTRE, qui ne désigne aucun
 *  régime — c'est ce qui rend l'absence d'image « par défaut » tenable (addendum ADR-0032 §7.4). */
function visageDuMode(mode: ModeFiltre): Visage {
  return mode === "sur_mesure" || mode === "inconnu" ? "neutre" : mode;
}

const LIGNE = "flex flex-wrap items-center gap-2 border-b border-white/10 py-2 last:border-b-0";
const ETIQUETTE = "w-24 shrink-0 text-[11px] font-bold uppercase tracking-wide text-papa-muted";

export function JournalFilterBar({
  filtre,
  onChange,
  onReset,
  subjects,
  chapitres,
  total,
  totalNonFiltre,
  deplie,
  onToggleDeplie,
}: Props) {
  const replies = criteresReplies(filtre);
  const actif = filtreActif(filtre);

  return (
    <section
      aria-label="Filtrer et trier le journal"
      className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 pb-3 pt-3"
    >
      {/* ⚠️ Pas de libellé sur cette rangée : avec lui, les pastilles passaient à la ligne et la
          rangée valait 116 px au lieu de 47. « Toutes » en tête dit déjà de quoi il s'agit. */}
      <div className="border-b border-white/10 pb-2">
        <SubjectFilterChips
          subjects={subjects}
          value={filtre.subjectId}
          onChange={(subjectId) => onChange({ ...filtre, subjectId, chapterId: null })}
          allLabel="Toutes"
        />
      </div>

      {deplie && (
        <div data-testid="journal-filtres-deplies">
          <div className={LIGNE}>
            <span className={ETIQUETTE}>Période</span>
            <label className="text-xs text-papa-muted" htmlFor="journal-depuis">
              du
            </label>
            <input
              id="journal-depuis"
              type="date"
              value={filtre.depuis}
              onChange={(e) => onChange({ ...filtre, depuis: e.target.value })}
              className="rounded-lg border border-white/15 bg-papa-bg px-2 py-1 text-xs text-papa-text [color-scheme:dark]"
            />
            <label className="text-xs text-papa-muted" htmlFor="journal-jusqua">
              au
            </label>
            <input
              id="journal-jusqua"
              type="date"
              value={filtre.jusquA}
              onChange={(e) => onChange({ ...filtre, jusquA: e.target.value })}
              className="rounded-lg border border-white/15 bg-papa-bg px-2 py-1 text-xs text-papa-text [color-scheme:dark]"
            />
            <span className={`${ETIQUETTE} ml-3 w-auto`}>Chapitre</span>
            <select
              aria-label="Chapitre"
              value={filtre.chapterId ?? ""}
              disabled={filtre.subjectId === null}
              onChange={(e) =>
                onChange({ ...filtre, chapterId: e.target.value ? Number(e.target.value) : null })
              }
              className="rounded-lg border border-white/15 bg-papa-bg px-2 py-1 text-xs text-papa-text disabled:opacity-40"
            >
              {/* ⚠️ Désactivé tant qu'aucune matière n'est choisie, et il le DIT : les chapitres se
                  lisent par matière d'année, il n'existe pas de liste « tous chapitres ». */}
              <option value="">
                {filtre.subjectId === null ? "Choisissez une matière" : "Tous les chapitres"}
              </option>
              {chapitres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={LIGNE}>
            <span className={ETIQUETTE}>Statut</span>
            {STATUTS.map((s) => (
              <Pastille
                key={s}
                actif={filtre.statuts.includes(s)}
                onClick={() => onChange({ ...filtre, statuts: basculer(filtre.statuts, s) })}
              >
                {STATUT_LABEL[s]}
              </Pastille>
            ))}
          </div>

          <div className={LIGNE}>
            <span className={ETIQUETTE}>Mode ZETIS</span>
            {MODES.map((m) => (
              <Pastille
                key={m}
                actif={filtre.modes.includes(m)}
                onClick={() => onChange({ ...filtre, modes: basculer(filtre.modes, m) })}
              >
                <img src={REGIME_AVATAR[visageDuMode(m)]} alt="" className="h-4 w-4 rounded-full" />
                {MODE_LABEL[m]}
              </Pastille>
            ))}
          </div>

          <div className={LIGNE}>
            <span className={ETIQUETTE}>Contenu</span>
            {PIECES.map((p: PieceKind) => (
              <Pastille
                key={p}
                actif={filtre.pieces.includes(p)}
                onClick={() => onChange({ ...filtre, pieces: basculer(filtre.pieces, p) })}
              >
                {PIECE_FILTRE_LABEL(p)}
              </Pastille>
            ))}
          </div>
        </div>
      )}

      {/* ⚠️ TOUJOURS VISIBLE — voir l'en-tête du fichier. */}
      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-white/10 pt-2 text-xs">
        <span className="font-bold text-papa-text">
          {total === 0 ? "Aucun lot" : `${total} lot${total > 1 ? "s" : ""}`}
        </span>
        {totalNonFiltre !== null && actif && (
          <span className="text-papa-muted">sur {totalNonFiltre}</span>
        )}
        {actif && (
          <button type="button" onClick={onReset} className="font-semibold text-primary hover:underline">
            Tout effacer
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-expanded={deplie}
          onClick={onToggleDeplie}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1 font-semibold text-papa-muted hover:border-white/35 hover:text-papa-text"
        >
          {deplie ? "▾" : "▸"} Plus de filtres
          {/* Le compte de ce qui filtre SANS SE VOIR — un filtre actif ne doit pas pouvoir se cacher. */}
          {replies > 0 && (
            <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[10px] text-sky-200">
              {replies}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
        <span className={ETIQUETTE}>Trier par</span>
        <select
          aria-label="Trier par"
          value={filtre.tri}
          onChange={(e) => onChange({ ...filtre, tri: e.target.value as JournalFiltre["tri"] })}
          className="rounded-lg border border-white/15 bg-papa-bg px-2 py-1 text-papa-text"
        >
          {TRIS.map((t) => (
            <option key={t} value={t}>
              {TRI_LABEL[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange({ ...filtre, descendant: !filtre.descendant })}
          className="rounded-lg border border-white/15 px-2 py-1 text-papa-muted hover:text-papa-text"
        >
          {filtre.descendant ? "↓ décroissant" : "↑ croissant"}
        </button>

        {/* ⚠️ La seule protection qui reste après l'avertissement accepté au cadrage : *un journal
            qui n'est plus chronologique cesse d'être un journal*. Il se signale, et se défait d'un
            geste. */}
        {!triParDefaut(filtre) && (
          <span className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/[0.07] px-3 py-1 text-amber-200">
            ⚠️ Ce journal n'est plus dans l'ordre chronologique.
            <button
              type="button"
              onClick={() => onChange({ ...filtre, tri: "date", descendant: true })}
              className="font-bold underline"
            >
              Revenir à l'ordre du temps
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
