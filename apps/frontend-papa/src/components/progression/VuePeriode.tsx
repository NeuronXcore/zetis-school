import { useMemo, useState } from "react";
import type { DatedFact, DatedFactKind, SkillIndex } from "@zetis/types";

// Vue « Par période » (adr-0040 §2, §6) — le SEUL endroit de la page où une fenêtre existe.
//
// 🔴 **Aucun palier, aucun stock, aucune barre d'avancement ici.** Le point dur de l'ADR : une
// fenêtre posée sur un palier est un mensonge (les paliers sont des stocks, sans reconstruction
// hors de l'agrégat dashboard) ; posée sur un fait daté, elle est exacte.
//
// 🔴 **Aucune courbe, aucune série.** La révocation du §5 de l'adr-0038 autorise des ÉVÉNEMENTS
// NOMMÉS, jamais des agrégats temporels. Une courbe ici resterait une faute après cet ADR.

const FENETRES = [7, 30, 90, 365] as const;
type Fenetre = (typeof FENETRES)[number];

const NATURE_LABEL: Record<DatedFactKind, string> = {
  mastery_transition: "bascule de palier",
  gap_opened: "lacune ouverte",
  gap_resolved: "lacune résolue",
  mission_done: "mission terminée",
  quiz_scored: "quiz noté",
  review_scored: "révision notée",
};

/** Les trois natures de trace du §6, et leur borne. `null` = trace COMPLÈTE, jamais « inconnue ». */
type Borne = { natures: DatedFactKind[]; depuis: string | null; nom: string };

function bornes(index: SkillIndex): Borne[] {
  return [
    { natures: ["mastery_transition"], depuis: index.history_since, nom: "bascules de palier" },
    { natures: ["review_scored"], depuis: index.reviews_since, nom: "révisions notées" },
    {
      natures: ["gap_opened", "gap_resolved", "mission_done", "quiz_scored"],
      depuis: null,
      nom: "lacunes, missions, quiz",
    },
  ];
}

function detail(f: DatedFact): string {
  switch (f.kind) {
    case "mastery_transition":
      return `${f.from_status ?? "début de trace"} → ${f.to_status}`;
    case "gap_opened":
    case "gap_resolved":
      return f.severity ?? "";
    case "mission_done":
      return f.verdict ?? "";
    case "quiz_scored":
      return f.score !== null && f.score !== undefined ? `${f.score} / 100` : "";
    case "review_scored":
      return f.rating ?? "";
  }
}

export function VuePeriode({ index, subjectId }: { index: SkillIndex; subjectId: number | null }) {
  const [fenetre, setFenetre] = useState<Fenetre>(30);

  // Certaines natures ne portent pas le nom de la notion : un verdict de mission vit dans
  // `learning_events` avec un `skill_id` mais sans jointure. On le résout ICI, depuis l'index
  // DÉJÀ chargé — zéro requête, et surtout aucune seconde source de vérité sur les noms.
  const nomParSkill = useMemo(() => {
    const m = new Map<number, string>();
    for (const n of index.notions) m.set(n.skill_id, n.skill_name);
    return m;
  }, [index.notions]);
  const nomDe = (f: DatedFact) =>
    f.skill_name ?? (f.skill_id != null ? nomParSkill.get(f.skill_id) : undefined) ?? "—";

  // Le filtrage est CLIENT : le serveur a servi 365 jours en une passe. C'est ce qui permet au §6
  // d'être tenu — les compteurs se dérivent du journal AFFICHÉ, pas d'un second appel.
  const affiches = useMemo(() => {
    const limite = Date.now() - fenetre * 86_400_000;
    return index.facts.filter((f) => {
      if (new Date(f.at).getTime() < limite) return false;
      if (subjectId !== null && f.subject_id !== null && f.subject_id !== subjectId) return false;
      return true;
    });
  }, [index.facts, fenetre, subjectId]);

  // 🔴 L'invariant du §6, transposé de la ligne à la fenêtre : « le détail recompose le nombre ».
  // Les compteurs ne sont pas servis à part — ils SONT le décompte de ce qui est listé dessous.
  const compteurs = useMemo(() => {
    const c = {} as Record<DatedFactKind, number>;
    for (const f of affiches) c[f.kind] = (c[f.kind] ?? 0) + 1;
    return c;
  }, [affiches]);

  const debutFenetre = new Date(Date.now() - fenetre * 86_400_000).toISOString().slice(0, 10);
  const bornesTouchees = bornes(index).filter((b) => b.depuis !== null && b.depuis > debutFenetre);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-papa-muted">Fenêtre</span>
        {FENETRES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={fenetre === f}
            onClick={() => setFenetre(f)}
            className={`rounded-full border px-2.5 py-1 font-semibold ${
              fenetre === f ? "border-papa-accent text-papa-accent" : "border-papa-border text-papa-muted/60"
            }`}
          >
            {f === 365 ? "1 an" : `${f} j`}
          </button>
        ))}
        <span className="ml-auto tabular-nums text-papa-muted">
          {affiches.length} fait{affiches.length > 1 ? "s" : ""} daté
          {affiches.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Les compteurs, DÉRIVÉS du journal ci-dessous. Aucun palier, aucun stock. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(NATURE_LABEL) as DatedFactKind[])
          .filter((k) => (compteurs[k] ?? 0) > 0)
          .map((k) => (
            <span
              key={k}
              className="rounded-full border border-papa-border bg-papa-surface px-2.5 py-1 text-xs"
            >
              <strong className="font-semibold tabular-nums">{compteurs[k]}</strong>{" "}
              <span className="text-papa-muted">{NATURE_LABEL[k]}</span>
            </span>
          ))}
      </div>

      {/* 🔴 Le cœur de l'honnêteté du §6. Quand la fenêtre demandée commence AVANT la borne d'une
          nature, son compteur est MARQUÉ — un compteur bas dit alors « pas de trace », jamais
          « pas de mouvement ». Corollaire vérifié sur la base réelle : 4 bascules à 7 j comme à
          365 j, parce que la trace n'ouvre que le 31/07. */}
      {bornesTouchees.length > 0 && (
        <p className="mb-3 rounded-xl border border-papa-warn/30 bg-papa-warn/5 px-4 py-2 text-xs text-papa-warn">
          Cette fenêtre remonte avant le début de la trace :{" "}
          {bornesTouchees.map((b) => `${b.nom} depuis le ${b.depuis}`).join(" · ")}. Un compte bas
          veut alors dire <strong className="font-semibold">pas de trace</strong>, pas{" "}
          <strong className="font-semibold">pas de mouvement</strong> — les deux ne se corrigent pas
          l'un l'autre.
        </p>
      )}

      {affiches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-papa-border bg-papa-surface p-6 text-center text-sm text-papa-muted">
          Aucun fait daté sur ces {fenetre} jours. Cela peut vouloir dire que rien n'a bougé — ou
          que rien n'a été tracé sur cette période. Les deux se distinguent par les bornes
          ci-dessus.
        </p>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-papa-border">
          {affiches.map((f, i) => (
            <li
              key={`${f.kind}-${f.at}-${f.skill_id ?? i}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-papa-border bg-papa-surface px-4 py-2 text-sm first:border-t-0"
            >
              <span className="tabular-nums text-xs text-papa-muted">{f.at.slice(0, 10)}</span>
              <span className="rounded-full bg-papa-surface-2 px-2 py-0.5 text-xs text-papa-muted">
                {NATURE_LABEL[f.kind]}
              </span>
              <span className="font-medium">{nomDe(f)}</span>
              <span className="text-xs text-papa-muted">{detail(f)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
