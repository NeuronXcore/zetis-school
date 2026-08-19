// 🗺 La carte des réglages (ADR-0062 §1) — la vue par défaut, et la navigation de la page.
//
// Ce n'est pas un réglage : c'est l'outil qui empêche d'en oublier un. Il liste TOUS les candidats,
// dit lesquels vivent ici, lesquels vivent ailleurs, et lesquels ne vivent nulle part.
//
// ⚠️ **Chaque ligne est un LIEN quand elle en a un.** C'est ce qui distingue cette vue d'une
// annexe : « ici · Autonomie » ouvre l'onglet, « ailleurs · Agenda » ouvre la page. Une liste qui
// nomme un endroit sans y mener oblige à le chercher à la main.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@zetis/ui";

import {
  INVENTAIRE,
  type FamilleReglage,
  type LigneReglage,
  type OngletId,
} from "../../lib/inventaireReglages";

/** Le filtre « modifiés » n'est pas une famille : il croise la carte avec l'état du serveur.
 *  D'où un type à part — le mélanger aux familles ferait croire qu'il vit dans la donnée. */
type Filtre = FamilleReglage | "tous" | "modifies";

const FILTRES: { id: Filtre; label: string }[] = [
  { id: "tous", label: "tous" },
  { id: "ici", label: "ici" },
  { id: "ailleurs", label: "ailleurs" },
  { id: "nulle", label: "nulle part" },
  { id: "decider", label: "à décider" },
  { id: "modifies", label: "modifiés" },
];

/** La couleur dit OÙ ça vit, jamais si c'est bien ou mal. */
function tonDeLigne(l: LigneReglage): string {
  if (l.famille === "ici") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (l.famille === "ailleurs") return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  if (l.famille === "decider") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return "border-papa-border bg-white/5 text-papa-muted";
}

/** Ce réglage a-t-il été touché ? « Modifié » = « une ligne existe » — la doctrine de la table,
 *  pas un calcul. Une ligne sans `cles` n'est jamais « modifiée » : soit elle est dérivée (le
 *  régime), soit elle ne se stocke pas du tout. */
function estModifie(l: LigneReglage, ecarts: Set<string>): boolean {
  return (l.cles ?? []).some((k) => ecarts.has(k));
}

export function CarteReglages({
  onOuvrirOnglet,
  /** Les clés `app_settings` qui portent une ligne. `null` = **on ne sait pas** — la lecture a
   *  échoué, et on ne remplace pas une inconnue par un zéro (ADR-0062 §6). */
  ecarts,
  filtreInitial = "tous",
}: {
  onOuvrirOnglet: (id: OngletId) => void;
  ecarts: string[] | null;
  filtreInitial?: Filtre;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre>(filtreInitial);

  const clesEcartees = useMemo(() => new Set(ecarts ?? []), [ecarts]);

  const lignes = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return INVENTAIRE.filter((l) => {
      const passeFiltre =
        filtre === "tous"
          ? true
          : filtre === "modifies"
            ? estModifie(l, clesEcartees)
            : l.famille === filtre;
      if (!passeFiltre) return false;
      if (!terme) return true;
      return `${l.nom} ${l.concerne} ${l.ou} ${l.statut}`.toLowerCase().includes(terme);
    });
  }, [q, filtre, clesEcartees]);

  const compte = (f: FamilleReglage) => INVENTAIRE.filter((l) => l.famille === f).length;

  return (
    <div className="rounded-xl border border-papa-border bg-papa-surface p-5">
      <h2 className="text-base font-semibold">🗺 Tout ce qui se règle — et où</h2>
      <p className="mt-1 text-sm text-papa-muted">
        Cette vue n'est pas un réglage : c'est ce qui empêche d'en oublier un. Elle dit aussi ce
        qu'elle ne couvre pas — sans quoi « rien d'oublié » est invérifiable.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="chercher un réglage…"
          aria-label="Chercher un réglage"
          className="min-w-[220px] flex-1 rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm text-papa-text placeholder:text-papa-muted"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrer les réglages">
          {FILTRES.map((f) => {
            // Sans lecture des écarts, « modifiés » ne peut rien affirmer : on le désactive
            // plutôt que de le laisser rendre une liste vide qui se lirait « rien n'a changé ».
            const indisponible = f.id === "modifies" && ecarts === null;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={filtre === f.id}
                disabled={indisponible}
                title={indisponible ? "lecture des écarts indisponible" : undefined}
                onClick={() => setFiltre(f.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  filtre === f.id
                    ? "border-papa-accent/60 bg-papa-accent/15 text-papa-accent"
                    : "border-papa-border bg-papa-surface/60 text-papa-muted hover:text-papa-text",
                  indisponible && "cursor-not-allowed opacity-40",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-papa-muted">
        {lignes.length} / {INVENTAIRE.length} réglages · <b>{compte("ici")}</b> ici ·{" "}
        {compte("ailleurs")} ailleurs · {compte("nulle")} nulle part ·{" "}
        <b>{compte("decider")} à décider</b>
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-papa-border text-left text-[11px] uppercase tracking-wide text-papa-muted">
              <th className="py-2 pr-3 font-bold">Réglage</th>
              <th className="py-2 pr-3 font-bold">Concerne</th>
              <th className="py-2 pr-3 font-bold">Où ça vit</th>
              <th className="py-2 font-bold">Statut</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const cible = l.onglet
                ? () => onOuvrirOnglet(l.onglet as OngletId)
                : l.lien
                  ? () => navigate(l.lien as string)
                  : null;
              return (
                <tr key={l.nom} className="border-b border-papa-border/60 hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3">
                    {l.nom}
                    {estModifie(l, clesEcartees) && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold text-papa-accent ring-1 ring-papa-accent/40"
                        title="un geste a créé une ligne en base : ce réglage n'est plus au défaut"
                      >
                        modifié
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-papa-muted">{l.concerne}</td>
                  <td className="py-2.5 pr-3">
                    {cible ? (
                      <button
                        type="button"
                        onClick={cible}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-semibold underline-offset-2 hover:underline",
                          tonDeLigne(l),
                        )}
                      >
                        {l.ou} →
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2.5 py-1 text-xs font-semibold",
                          tonDeLigne(l),
                        )}
                      >
                        {l.ou}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-papa-muted">{l.statut}</td>
                </tr>
              );
            })}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-papa-muted">
                  Aucun réglage ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-papa-muted">
        🔴 Une ligne « à décider » n'est pas une ligne à construire. Le défaut est{" "}
        <b>ne pas construire</b> : un réglage qu'on n'a jamais eu besoin de changer est une surface
        de plus à maintenir, et une décision de moins prise.
      </p>
    </div>
  );
}
