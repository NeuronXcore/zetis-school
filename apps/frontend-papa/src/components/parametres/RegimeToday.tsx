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

// La pastille dit QUI, et sa couleur suit la grammaire de l'addendum §7 :
//   violet  = ZETIS a agi seul      (la teinte des régimes, celle du halo et du badge)
//   ardoise = aucune étape n'existe  (un fait de structure, pas une décision)
//   émeraude = vous                  (l'accent Papa)
// ⚠️ « validation groupée » était en LIME, à un cheveu de l'émeraude qui veut dire « vous ».
// Corrigé le 2026-08-04 : c'est précisément la ligne où ZETIS a servi SANS que Papa ouvre — lui
// donner la couleur de Papa était le contresens le plus coûteux des quatre.
// ⚠️ Jamais d'AMBRE ici : elle est réservée aux files de validation (ADR-0030 §6).
const LINES: { what: string; detail: string; chip: string; tone: string }[] = [
  {
    what: "Fiches et cartes mentales",
    detail: "Produites en lot, servies à Massimo sans que vous les ouvriez.",
    chip: "validation groupée",
    tone: "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/30",
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

      {/* ⚠️ Cet encadré était AMBRE avec un ⚠️, pour une phrase qui dit « ce n'est pas un
          retard ». Deux contresens en un : l'ambre est la couleur des files de validation
          (ADR-0030 §6), et prévenir en signalant une alerte contredit le texte qu'on écrit. Passé
          en cyan informatif le 2026-08-04 — la teinte de « Sur mesure », celle des faits qui ne
          demandent rien. Le chiffre, lui, ne bouge pas : daté, mesuré, jamais recalculé. */}
      <p className="mt-3 rounded-xl border border-sky-400/35 bg-sky-500/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-sky-200">
        <span aria-hidden>📊</span> Sur le chapitre produit le 2 août,{" "}
        <b className="text-papa-text">2 contenus sur 33</b> vous sont arrivés en relecture.{" "}
        <b className="text-papa-text">Ce n'est pas un retard</b> — c'est le régime ci-dessus. Le
        réglage ne fait pas que vous en donner plus : il vous dit d'abord où vous êtes.
      </p>
    </section>
  );
}
