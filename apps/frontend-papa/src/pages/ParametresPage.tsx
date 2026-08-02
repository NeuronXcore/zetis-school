import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { AutonomyPanel } from "../components/parametres/AutonomyPanel";

// Paramètres Papa.
//
// Cette page portait quatre commandes qui ne faisaient RIEN (retirées le 2026-08-02) : trois
// interrupteurs en `useState` non persisté et un sélecteur « Fournisseur IA » sans handler. Le
// danger n'était pas l'inutilité, c'était la confiance :
//
//   « une page où trois interrupteurs ne font rien est un piège le jour où six engagent
//     l'autonomie de ZETIS. Le premier toggle sans effet détruit la crédibilité de tous les
//     suivants. »
//
// **Ce jour est arrivé** (ADR-0032). D'où la règle qui remplace le vide : tout ce qui est affiché
// ici est branché, ou visiblement verrouillé AVEC son motif — et c'est ce que vérifie le
// test-verrou de cette page, qui n'a pas été supprimé mais remplacé.
//
// ⚠️ La phrase « tant que ce n'est pas le cas, ZETIS ne produit rien sans votre validation » a
// disparu avec le placeholder. Elle était déjà fausse au regard de l'observation du 2026-08-02 :
// 31 objets sur 33 atteignaient Massimo sans relecture.
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
          Certains réglages de ZETIS vivent à l'endroit où vous prenez la décision, pas dans un
          panneau séparé : l'accès de Massimo à la saisie de l'agenda reste sur la page{" "}
          <Link to="/agenda" className="font-semibold text-papa-accent underline">
            Agenda
          </Link>
          . L'autonomie, elle, est transversale — elle se règle ci-dessous.
        </p>
      </section>

      <AutonomyPanel />
    </div>
  );
}
