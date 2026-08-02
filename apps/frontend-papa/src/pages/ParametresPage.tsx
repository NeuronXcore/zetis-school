import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";

// Paramètres Papa.
//
// Cette page portait quatre commandes qui ne faisaient RIEN (retirées le 2026-08-02) : trois
// interrupteurs en `useState` non persisté (« Validation manuelle des capsules », « Sons de
// feedback », « Capsules automatiques ») et un sélecteur « Fournisseur IA » sans handler.
//
// Aucun des quatre n'avait de sens à brancher, et c'est la vraie raison du retrait :
//
//   - « Validation manuelle des capsules » est un INVARIANT (aucun contenu généré n'atteint
//     Massimo sans validation). En faire un interrupteur, c'est déclarer qu'on peut le couper.
//   - « Capsules automatiques » est du palier 3 du chantier d'autonomisation, qui n'existe pas
//     encore et dont l'ADR reste à écrire.
//   - « Fournisseur IA » contredit l'ADR-0008/0009 : ZETIS est 100 % local via Ollama, avec UNE
//     dérogation étroite (`curriculum_*` → Anthropic). Un sélecteur global proposant OpenAI
//     laissait croire l'inverse — et que les données de Massimo pourraient y partir.
//   - « Sons de feedback » serait le seul légitime, mais rien ne le consomme côté Massimo.
//
// Le danger n'était pas l'inutilité, c'était la confiance : une page où trois interrupteurs ne
// font rien est un piège le jour où six engagent l'autonomie de ZETIS. Le premier toggle sans
// effet détruit la crédibilité de tous les suivants.
export function ParametresPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Paramètres"
        subtitle="Ce qui se règle ici, et ce qui se règle là où la décision se prend."
      />

      <section className="rounded-xl border border-papa-border bg-papa-surface p-5">
        <p className="font-semibold">Réglages actifs</p>
        <p className="mt-2 text-sm text-papa-muted">
          Les réglages de ZETIS vivent à l'endroit où vous prenez la décision, pas dans un panneau
          séparé. Aujourd'hui il n'y en a qu'un : l'accès de Massimo à la saisie de l'agenda, sur la
          page <Link to="/agenda" className="font-semibold text-papa-accent underline">Agenda</Link>.
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-papa-border bg-papa-surface p-5 opacity-60">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Autonomie de ZETIS</p>
          <span
            className="cursor-not-allowed rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-muted"
            title="Chantier d'autonomisation — ADR à écrire, non livré"
          >
            indisponible
          </span>
        </div>
        <p className="mt-2 text-sm text-papa-muted">
          Décider, acte par acte, jusqu'où ZETIS produit le contenu de Massimo tout seul. Rien n'est
          réglable tant que le chantier n'est pas livré — et tant que ce n'est pas le cas, ZETIS ne
          produit rien sans votre validation.
        </p>
      </section>
    </div>
  );
}
