// Le filtre du Journal — son modèle, son vocabulaire d'écran, et son aller-retour avec l'URL.
//
// ⚠️ **Aucun libellé n'est inventé ici.** Les statuts viennent de `RUN_STATUS_LABEL`, les contenus
// de `PIECE_LABEL`/`PIECE_ICON`, les régimes de `NIVEAU_LABEL` (Manual · Hybrid · Autonom). Une
// seconde table de libellés divergerait de la première au premier renommage — c'est ce que
// l'addendum ADR-0032 §7.7 a coûté à réparer ailleurs.
//
// ⚠️ **Le filtrage est SERVEUR.** Rien de ce fichier ne filtre quoi que ce soit : il décrit ce que
// Papa a demandé, et le traduit en paramètres de requête. Filtrer les lots déjà chargés répondrait
// « rien en maths » alors que les lots de maths sont page 4.
import { type PieceKind } from "@zetis/types";

import { PIECE_ICON, PIECE_LABEL, RUN_STATUS_LABEL } from "./journal";
import { NIVEAU_LABEL } from "./settings";

/** Les cinq statuts que l'écran montre. `stale` est RENDU par le serveur, jamais stocké. */
export const STATUTS = ["queued", "running", "stale", "done", "failed"] as const;
export type StatutFiltre = (typeof STATUTS)[number];

/** Les régimes, plus les deux réponses qui ne sont pas des régimes. */
export const MODES = ["manuel", "semi", "autonome", "sur_mesure", "inconnu"] as const;
export type ModeFiltre = (typeof MODES)[number];

export const PIECES: PieceKind[] = ["cours", "fiche", "mindmap", "quiz", "srs"];

export const TRIS = ["date", "matiere", "mode", "statut"] as const;
export type TriCle = (typeof TRIS)[number];

export const TRI_LABEL: Record<TriCle, string> = {
  date: "Date",
  matiere: "Matière",
  mode: "Mode ZETIS",
  statut: "Statut",
};

/** ⚠️ Le vocabulaire d'ÉCRAN, jamais les clés serveur (`manuel | semi | autonome`). */
export const MODE_LABEL: Record<ModeFiltre, string> = {
  manuel: NIVEAU_LABEL.manuel,
  semi: NIVEAU_LABEL.semi,
  autonome: NIVEAU_LABEL.autonome,
  sur_mesure: "Sur mesure",
  inconnu: "Non enregistré",
};

export const STATUT_LABEL: Record<StatutFiltre, string> = {
  queued: RUN_STATUS_LABEL.queued!,
  running: RUN_STATUS_LABEL.running!,
  stale: RUN_STATUS_LABEL.stale!,
  done: RUN_STATUS_LABEL.done!,
  failed: RUN_STATUS_LABEL.failed!,
};

export const PIECE_FILTRE_LABEL = (kind: PieceKind) => `${PIECE_ICON[kind]} ${PIECE_LABEL[kind]}`;

export interface JournalFiltre {
  /** ⚠️ **MONO-matière**, et c'est un constat de code, pas une préférence : `SubjectFilterChips`
   *  est la brique partagée du Dashboard, de la Couverture et du Cahier de bord, et elle est
   *  contrôlée par `value: number | null`. La rendre multi toucherait trois autres pages — hors
   *  périmètre. Le serveur, lui, accepte déjà une liste : rien n'est perdu de ce côté. */
  subjectId: number | null;
  chapterId: number | null;
  depuis: string;
  jusquA: string;
  statuts: StatutFiltre[];
  modes: ModeFiltre[];
  pieces: PieceKind[];
  tri: TriCle;
  descendant: boolean;
}

export const FILTRE_VIDE: JournalFiltre = {
  subjectId: null,
  chapterId: null,
  depuis: "",
  jusquA: "",
  statuts: [],
  modes: [],
  pieces: [],
  tri: "date",
  descendant: true,
};

/** Combien de critères sont actifs — le compte que porte « Plus de filtres ».
 *
 * ⚠️ La matière n'y entre PAS : sa rangée reste visible, elle ne peut pas se cacher. Ce compte
 * répond à « qu'est-ce qui filtre sans que je le voie ? », pas à « combien de filtres ? ». */
export function criteresReplies(f: JournalFiltre): number {
  return (
    (f.chapterId !== null ? 1 : 0) +
    (f.depuis || f.jusquA ? 1 : 0) +
    (f.statuts.length > 0 ? 1 : 0) +
    (f.modes.length > 0 ? 1 : 0) +
    (f.pieces.length > 0 ? 1 : 0)
  );
}

export function filtreActif(f: JournalFiltre): boolean {
  return f.subjectId !== null || criteresReplies(f) > 0;
}

export function triParDefaut(f: JournalFiltre): boolean {
  return f.tri === "date" && f.descendant;
}

/** Bascule une valeur dans une liste — l'idiome des pilules multi-valeur. */
export function basculer<T>(liste: T[], valeur: T): T[] {
  return liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
}

// --- L'aller-retour avec l'URL ------------------------------------------------------------------
//
// ⚠️ Un journal filtré doit pouvoir être rouvert tel quel, et le retour arrière doit défaire le
// filtre plutôt que quitter la page. Mais **aucun filtre n'est actif à l'ouverture** : une page qui
// s'ouvrirait déjà filtrée cacherait son contenu à celui qui a oublié qu'il l'avait filtrée.

function lireListe<T extends string>(params: URLSearchParams, cle: string, permis: readonly T[]): T[] {
  return params.getAll(cle).filter((v): v is T => (permis as readonly string[]).includes(v));
}

export function depuisUrl(params: URLSearchParams): JournalFiltre {
  const nombre = (cle: string) => {
    const brut = params.get(cle);
    const valeur = brut === null ? Number.NaN : Number(brut);
    return Number.isFinite(valeur) ? valeur : null;
  };
  const tri = params.get("tri");
  return {
    subjectId: nombre("subject_id"),
    chapterId: nombre("chapter_id"),
    depuis: params.get("depuis") ?? "",
    jusquA: params.get("jusqu_a") ?? "",
    statuts: lireListe(params, "statut", STATUTS),
    modes: lireListe(params, "mode", MODES),
    pieces: lireListe(params, "piece", PIECES as readonly PieceKind[]),
    tri: (TRIS as readonly string[]).includes(tri ?? "") ? (tri as TriCle) : "date",
    descendant: params.get("sens") !== "asc",
  };
}

export function versUrl(f: JournalFiltre): URLSearchParams {
  const params = new URLSearchParams();
  if (f.subjectId !== null) params.set("subject_id", String(f.subjectId));
  if (f.chapterId !== null) params.set("chapter_id", String(f.chapterId));
  if (f.depuis) params.set("depuis", f.depuis);
  if (f.jusquA) params.set("jusqu_a", f.jusquA);
  f.statuts.forEach((s) => params.append("statut", s));
  f.modes.forEach((m) => params.append("mode", m));
  f.pieces.forEach((p) => params.append("piece", p));
  // Le tri par défaut ne s'écrit PAS dans l'URL : une URL propre est une URL sans filtre.
  if (f.tri !== "date") params.set("tri", f.tri);
  if (!f.descendant) params.set("sens", "asc");
  return params;
}
