// « Où vous en êtes aujourd'hui » — le bloc qui vient AVANT tout réglage (ADR-0032 §Contexte).
//
// Sa raison d'être : l'observation du 2026-08-02 a montré que sur 33 objets produits, 2 seulement
// arrivaient en relecture. Papa est déjà au régime le plus haut pour trois familles sur quatre,
// sans l'avoir choisi. Un panneau qui proposerait « laisser ZETIS servir » sans le dire d'abord
// serait un mensonge de plus.
//
// ⚠️ **DU TEXTE, PAS UN CALCUL.** Rien ici n'est interrogé au serveur, et c'est délibéré : un
// compteur vivant ferait de ce bloc un reproche permanent, ce que l'addendum §F.2 interdit (« la
// provenance est un fait, jamais un reproche ; elle ne se totalise pas »). Le seul chiffre de la
// page est celui de l'observation — daté, attaché à une mesure, non recalculé.

const LINES: { what: string; detail: string; chip: string; tone: string }[] = [
  {
    what: "Fiches et cartes mentales",
    detail: "Produites en lot, servies à Massimo sans que vous les ouvriez.",
    chip: "validation groupée",
    tone: "bg-emerald-500/5 text-lime-300 ring-1 ring-inset ring-lime-400/40",
  },
  {
    what: "Cartes de révision",
    detail: "Servies sans aucune étape de validation — il n'en existe pas dans le dispositif.",
    chip: "aucun contrôle",
    tone: "bg-slate-500/15 text-slate-200",
  },
  {
    what: "Quiz",
    detail: "Servis sans relecture, par doctrine (ADR-0014).",
    chip: "par doctrine",
    tone: "bg-slate-500/15 text-slate-200",
  },
  {
    what: "Cours",
    detail: "Vous seul les validez. C'est aujourd'hui le seul contenu qui passe devant vous.",
    chip: "vous",
    tone: "bg-emerald-500/15 text-emerald-300",
  },
];

export function RegimeToday() {
  return (
    <section aria-labelledby="regime-today">
      <h3 id="regime-today" className="text-[12.5px] font-bold">
        Où vous en êtes aujourd'hui
      </h3>

      <div className="mt-3 rounded-xl border border-papa-border bg-papa-bg px-4">
        {LINES.map((line, index) => (
          <div
            key={line.what}
            className={`flex items-center gap-3 py-3 ${index > 0 ? "border-t border-papa-border" : ""}`}
          >
            <span className="min-w-0 flex-1">
              <b className="text-[13px] font-semibold">{line.what}</b>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-papa-muted">{line.detail}</p>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${line.tone}`}
            >
              {line.chip}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-200">
        <span aria-hidden>⚠️</span> Sur le chapitre produit le 2 août,{" "}
        <b className="text-papa-text">2 contenus sur 33</b> vous sont arrivés en relecture.{" "}
        <b className="text-papa-text">Ce n'est pas un retard</b> — c'est le régime ci-dessus. Le
        réglage ne fait pas que vous en donner plus : il vous dit d'abord où vous êtes.
      </p>
    </section>
  );
}
