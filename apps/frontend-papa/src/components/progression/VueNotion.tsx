import { Fragment, useMemo, useState } from "react";
import type { NotionPalier, NotionSince, SkillIndex, SkillTimeline } from "@zetis/types";

// Vue « Par notion » (adr-0040 §4, §4 bis, §7) — le grain que ni le dashboard ni la table matière
// ne portent : des notions NOMMÉES.
//
// 🔴 **Palier et lacune sont DEUX AXES INDÉPENDANTS**, jamais une colonne à trois valeurs. Une
// notion peut être « à renforcer » sans lacune, et porter une lacune ouverte en étant « en cours ».
// Sur la base réelle : 13 « à renforcer » pour 1 seule lacune. L'infobulle le dit en permanence.

const PALIER_LABEL: Record<NotionPalier, string> = {
  acquise: "acquise",
  a_renforcer: "à renforcer",
  en_cours: "en cours",
  non_abordee: "non abordée",
};

const PALIER_CLASS: Record<NotionPalier, string> = {
  acquise: "bg-papa-accent/15 text-papa-accent",
  // Aucune teinte rouge : ce sont des notions à travailler, pas des fautes (CLAUDE.md §pédagogie).
  a_renforcer: "bg-papa-warn/15 text-papa-warn",
  en_cours: "bg-papa-accent-2/15 text-papa-accent-2",
  non_abordee: "bg-papa-surface-2 text-papa-muted",
};

/** Les paliers ENGAGÉS, allumés par défaut. « Non abordée » reste visible et compté, éteint — le
 *  catalogue vit sur Programme, pas ici (§4). Le filtre est déclaré, jamais silencieux. */
const PALIERS_ENGAGES: NotionPalier[] = ["acquise", "a_renforcer", "en_cours"];
const TOUS_PALIERS: NotionPalier[] = [...PALIERS_ENGAGES, "non_abordee"];

type Tri = "notion" | "matiere" | "date";

/** Rend « depuis » sans jamais confondre les trois absences (§7). */
export function libelleSince(since: NotionSince): string {
  if (since === null) return "—";
  if ("days" in since) return since.days === 0 ? "aujourd'hui" : `${since.days} j`;
  return "hors trace";
}

/** Le détail de l'absence, en infobulle : les deux `unknown` n'ont pas le même avenir. */
function titreSince(since: NotionSince): string | undefined {
  if (since === null) return "Jamais abordée — aucune ligne de maîtrise.";
  if ("days" in since) return undefined;
  return since.unknown === "before_history"
    ? "Abordée, mais sa dernière bascule précède la mise en service de l'historique. Se comblera d'elle-même à la prochaine bascule."
    : "Consolidée avant que la date de bascule n'existe. Cette date est définitivement perdue.";
}

function plie(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr");
}

export function VueNotion({
  index,
  subjectSlug,
  timelines,
  timelineLoading,
  onOpenTimeline,
  onVoirPeriode,
}: {
  index: SkillIndex;
  subjectSlug: string | null;
  timelines: Record<number, SkillTimeline | undefined>;
  timelineLoading: number | null;
  onOpenTimeline: (skillId: number) => void;
  onVoirPeriode: () => void;
}) {
  const [paliers, setPaliers] = useState<NotionPalier[]>(PALIERS_ENGAGES);
  const [lacuneSeule, setLacuneSeule] = useState(false);
  const [sansMission, setSansMission] = useState(false);
  const [tri, setTri] = useState<Tri>("notion");
  const [recherche, setRecherche] = useState("");
  const [ouverte, setOuverte] = useState<number | null>(null);

  // L'ordre des matières est celui que le SERVEUR a servi (ordre de l'année scolaire). Le
  // recalculer ici, fût-ce alphabétiquement, ferait diverger deux vues du même écran (§4 bis).
  const rangMatiere = useMemo(() => {
    const r = new Map<number, number>();
    index.subjects.forEach((s, i) => r.set(s.subject_id, i));
    return r;
  }, [index.subjects]);

  // ⚠️ Les compteurs des pastilles portent sur l'ANNÉE ENTIÈRE, jamais sur la sélection courante
  // (§4) — même doctrine que les boutons de /lacunes, qui annoncent le compte réel de ce qu'ils
  // vont créer. Ils sont donc calculés AVANT tout filtrage.
  const comptesParPalier = useMemo(() => {
    const c = { acquise: 0, a_renforcer: 0, en_cours: 0, non_abordee: 0 } as Record<NotionPalier, number>;
    for (const n of index.notions) c[n.palier] += 1;
    return c;
  }, [index.notions]);
  const totalLacunes = useMemo(
    () => index.notions.filter((n) => n.has_open_gap).length,
    [index.notions],
  );

  const filtrees = useMemo(() => {
    const q = plie(recherche.trim());
    return index.notions.filter((n) => {
      if (!paliers.includes(n.palier)) return false;
      if (lacuneSeule && !n.has_open_gap) return false;
      if (sansMission && n.has_active_mission) return false;
      if (subjectSlug && n.subject_slug !== subjectSlug) return false;
      if (q && !plie(n.skill_name).includes(q)) return false;
      return true;
    });
  }, [index.notions, paliers, lacuneSeule, sansMission, subjectSlug, recherche]);

  // Chaque tri se termine par `skill_id` : sans cette queue, deux notions homonymes de matières
  // différentes changeraient de place d'un rendu à l'autre (§4 bis).
  const triees = useMemo(() => {
    const l = [...filtrees];
    if (tri === "notion") {
      l.sort(
        (a, b) =>
          plie(a.skill_name).localeCompare(plie(b.skill_name), "fr") ||
          (rangMatiere.get(a.subject_id) ?? 0) - (rangMatiere.get(b.subject_id) ?? 0) ||
          a.skill_id - b.skill_id,
      );
    } else if (tri === "matiere") {
      l.sort(
        (a, b) =>
          (rangMatiere.get(a.subject_id) ?? 0) - (rangMatiere.get(b.subject_id) ?? 0) ||
          plie(a.skill_name).localeCompare(plie(b.skill_name), "fr") ||
          a.skill_id - b.skill_id,
      );
    } else {
      const jours = (s: NotionSince) => (s !== null && "days" in s ? s.days : Number.MAX_SAFE_INTEGER);
      l.sort(
        (a, b) =>
          jours(a.since) - jours(b.since) ||
          plie(a.skill_name).localeCompare(plie(b.skill_name), "fr") ||
          a.skill_id - b.skill_id,
      );
    }
    return l;
  }, [filtrees, tri, rangMatiere]);

  // 🔴 Le tri par date scinde en TROIS blocs, jamais en une liste continue (§4 bis). Sur la base
  // réelle, 15 des 19 notions engagées n'ont AUCUNE date : les glisser en fin de liste sans marque
  // les ferait lire comme « les plus anciennes » — l'exact contresens. Les deux séparateurs sont
  // distincts ET comptés, parce que les deux absences le sont (§7).
  const blocs = useMemo(() => {
    if (tri !== "date") return [{ titre: null as string | null, lignes: triees }];
    const datees = triees.filter((n) => n.since !== null && "days" in n.since);
    const horsTrace = triees.filter((n) => n.since !== null && !("days" in n.since));
    const jamais = triees.filter((n) => n.since === null);
    return [
      { titre: null, lignes: datees },
      { titre: `sans bascule enregistrée · ${horsTrace.length}`, lignes: horsTrace },
      { titre: `non abordées · ${jamais.length}`, lignes: jamais },
    ].filter((b) => b.lignes.length > 0);
  }, [tri, triees]);

  const togglePalier = (p: NotionPalier) =>
    setPaliers((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  return (
    <div>
      {/* 🔴 Infobulle PERMANENTE (§4) : les deux nombres côte à côte, et la phrase qui les sépare.
          Sans elle, « 13 à renforcer » et « 1 lacune » se lisent comme une incohérence. */}
      <p className="mb-3 rounded-xl border border-papa-border bg-papa-surface-2/50 px-4 py-2 text-xs text-papa-muted">
        <strong className="font-semibold text-papa-warn">{comptesParPalier.a_renforcer}</strong> à
        renforcer · <strong className="font-semibold">{totalLacunes}</strong> lacune
        {totalLacunes > 1 ? "s" : ""} ouverte{totalLacunes > 1 ? "s" : ""} — un palier n'est pas une
        lacune : <em>ces deux nombres n'ont aucune raison d'être égaux.</em>
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {TOUS_PALIERS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={paliers.includes(p)}
            onClick={() => togglePalier(p)}
            className={`rounded-full border px-2.5 py-1 font-semibold ${
              paliers.includes(p)
                ? "border-papa-accent text-papa-accent"
                : "border-papa-border text-papa-muted/60"
            }`}
          >
            {PALIER_LABEL[p]} · {comptesParPalier[p]}
          </button>
        ))}
        <span aria-hidden className="text-papa-border">|</span>
        <button
          type="button"
          aria-pressed={lacuneSeule}
          onClick={() => setLacuneSeule((v) => !v)}
          className={`rounded-full border px-2.5 py-1 font-semibold ${
            lacuneSeule ? "border-papa-accent text-papa-accent" : "border-papa-border text-papa-muted/60"
          }`}
        >
          Lacune ouverte · {totalLacunes}
        </button>
        <button
          type="button"
          aria-pressed={sansMission}
          onClick={() => setSansMission((v) => !v)}
          className={`rounded-full border px-2.5 py-1 font-semibold ${
            sansMission ? "border-papa-accent text-papa-accent" : "border-papa-border text-papa-muted/60"
          }`}
        >
          Sans mission active
        </button>
        <span className="ml-auto flex items-center gap-2">
          <label htmlFor="rech-notion" className="sr-only">
            Rechercher une notion
          </label>
          <input
            id="rech-notion"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            className="rounded-lg border border-papa-border bg-papa-surface px-2 py-1 text-xs"
          />
          <label htmlFor="tri-notion" className="text-papa-muted">
            Trier
          </label>
          <select
            id="tri-notion"
            value={tri}
            onChange={(e) => setTri(e.target.value as Tri)}
            className="rounded-lg border border-papa-border bg-papa-surface px-2 py-1 text-xs"
          >
            <option value="notion">Notion</option>
            <option value="matiere">Matière</option>
            <option value="date">Date</option>
          </select>
        </span>
      </div>

      {index.history_since && (
        <p className="mb-2 text-xs text-papa-muted">
          Historique des bascules ouvert le{" "}
          <strong className="font-semibold">{index.history_since}</strong>.{" "}
          <button type="button" onClick={onVoirPeriode} className="underline hover:text-papa-accent">
            Tout voir par période →
          </button>
        </p>
      )}

      {triees.length === 0 ? (
        <p className="rounded-xl border border-dashed border-papa-border bg-papa-surface p-6 text-center text-sm text-papa-muted">
          Aucune notion ne correspond aux filtres. Ils restent visibles ci-dessus, et se retirent
          d'un clic.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-papa-border">
          <table className="w-full text-sm">
            <thead className="bg-papa-surface-2 text-left text-xs uppercase tracking-wide text-papa-muted">
              <tr>
                <th scope="col" className="px-4 py-2">Notion</th>
                <th scope="col" className="px-4 py-2">Matière</th>
                <th scope="col" className="px-4 py-2">Palier</th>
                <th scope="col" className="px-4 py-2 text-right">Depuis</th>
                <th scope="col" className="px-4 py-2 text-right">Lacune</th>
                <th scope="col" className="px-4 py-2 text-right">Mission</th>
              </tr>
            </thead>
            <tbody>
              {blocs.map((bloc, bi) => (
                <Fragment key={bloc.titre ?? `bloc-${bi}`}>
                  {bloc.titre && (
                    <tr className="border-t border-papa-border bg-papa-surface-2/60">
                      <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-papa-muted">
                        ── {bloc.titre} ──
                      </td>
                    </tr>
                  )}
                  {bloc.lignes.map((n) => (
                    <Fragment key={n.skill_id}>
                      <tr className="border-t border-papa-border bg-papa-surface">
                        <td className="px-4 py-2.5 font-medium">
                          <button
                            type="button"
                            aria-expanded={ouverte === n.skill_id}
                            onClick={() => {
                              const next = ouverte === n.skill_id ? null : n.skill_id;
                              setOuverte(next);
                              if (next !== null) onOpenTimeline(next);
                            }}
                            className="flex items-center gap-2 text-left hover:text-papa-accent"
                          >
                            <span
                              aria-hidden
                              className={`text-xs text-papa-muted transition-transform ${ouverte === n.skill_id ? "rotate-90" : ""}`}
                            >
                              ▶
                            </span>
                            {n.skill_name}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-papa-muted">{n.subject_name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PALIER_CLASS[n.palier]}`}>
                            {PALIER_LABEL[n.palier]}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2.5 text-right tabular-nums text-papa-muted"
                          title={titreSince(n.since)}
                        >
                          {libelleSince(n.since)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {n.has_open_gap ? (
                            <span className="text-papa-warn">oui</span>
                          ) : (
                            <span className="text-papa-muted/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-papa-muted">
                          {n.has_active_mission ? "en cours" : "—"}
                        </td>
                      </tr>
                      {ouverte === n.skill_id && (
                        <tr className="border-t border-papa-border bg-papa-surface-2/40">
                          <td colSpan={6} className="px-6 py-3 text-xs">
                            {timelineLoading === n.skill_id ? (
                              <span className="text-papa-muted">Chargement de la frise…</span>
                            ) : timelines[n.skill_id]?.transitions.length ? (
                              <ol className="space-y-1">
                                {timelines[n.skill_id]!.transitions.map((t, i) => (
                                  <li key={i} className="text-papa-muted">
                                    <span className="tabular-nums">{t.changed_at.slice(0, 10)}</span>{" "}
                                    — {t.from_status ?? "début de trace"} → {t.to_status} (
                                    {t.mastery_score})
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <span className="text-papa-muted">
                                Aucune bascule enregistrée pour cette notion — pas de trace, ce qui
                                n'est pas la même chose que pas de mouvement.
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
