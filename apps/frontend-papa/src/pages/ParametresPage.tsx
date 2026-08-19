import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { AutonomieTab } from "../components/parametres/AutonomieTab";
import { CarteReglages } from "../components/parametres/CarteReglages";
import { MachineTab } from "../components/parametres/MachineTab";
import {
  ONGLET_DEFAUT,
  OngletsParametres,
  estOngletRendu,
} from "../components/parametres/OngletsParametres";
import { type OngletId } from "../lib/inventaireReglages";
import { fetchEcarts } from "../lib/settings";

// Paramètres Papa — une carte, et des onglets (ADR-0062).
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
// ici est branché, ou visiblement verrouillé AVEC son motif.
//
// 🔴 **L'ADR-0062 porte cette règle d'un cran au-dessus : un onglet VIDE est un interrupteur sans
// effet à l'échelle d'un écran.** Seuls les onglets qui ont du contenu sont rendus ; les autres
// vivent dans la CARTE, avec leur statut et leur motif. C'est pour ça que `ONGLETS` est court et
// qu'il s'allongera d'un onglet à la fois, chacun avec sa matière.
//
// ⚠️ La phrase « tant que ce n'est pas le cas, ZETIS ne produit rien sans votre validation » a
// disparu avec le placeholder. Elle était déjà fausse au regard de l'observation du 2026-08-02 :
// 31 objets sur 33 atteignaient Massimo sans relecture.
//
// ⚠️ « Rien de cette page n'atteint Massimo » reste VRAI aujourd'hui, et cessera de l'être avec
// l'onglet 🎒 Massimo. L'ADR-0062 §7 a tranché : on assume et on MARQUE — et la phrase s'amende
// **dans le commit** du premier réglage qui traverse, jamais à côté d'un bouton qui la contredit.
export function ParametresPage() {
  const [params, setParams] = useSearchParams();
  const demande = params.get("onglet");
  // Une URL peut nommer un onglet non construit (un signet, un lien gardé). On ouvre la carte —
  // qui dit justement où en est ce réglage-là — plutôt qu'une page blanche.
  const actif: OngletId = estOngletRendu(demande) ? demande : ONGLET_DEFAUT;

  // `null` = « on ne sait pas encore », et ça se distingue de « aucun écart ». Afficher 0 pendant
  // le chargement, ou après une erreur, dirait « rien n'a été changé » — un mensonge (§6).
  const [ecarts, setEcarts] = useState<string[] | null>(null);
  const [erreurEcarts, setErreurEcarts] = useState<string | null>(null);
  const [filtreCarte, setFiltreCarte] = useState<"tous" | "modifies">("tous");

  useEffect(() => {
    let vivant = true;
    fetchEcarts()
      .then((e) => vivant && setEcarts(e.keys))
      .catch((err: unknown) => {
        if (!vivant) return;
        setEcarts(null);
        setErreurEcarts(err instanceof Error ? err.message : "lecture impossible");
      });
    return () => {
      vivant = false;
    };
    // Aucun sondage (§5) : une page de réglages qui se rafraîchit toute seule ferait bouger un
    // champ sous les doigts. Une lecture au montage, et c'est tout.
  }, []);

  const ouvrir = useCallback(
    (id: OngletId) => {
      // L'onglet vit dans l'URL : rechargement, lien et retour arrière le gardent (§5).
      setParams(id === ONGLET_DEFAUT ? {} : { onglet: id });
    },
    [setParams],
  );

  const nbEcarts = ecarts?.length ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Paramètres"
        subtitle="Ce qui se règle ici, et ce qui se règle là où la décision se prend."
        actions={
          // 🔴 LA question qu'on se pose six mois plus tard devant un comportement inexpliqué :
          // « qu'est-ce que j'ai bricolé, déjà ? » (§4). Gratuite — `app_settings` pose que
          // l'absence de ligne EST le défaut, donc « modifié » = « une ligne existe ».
          erreurEcarts ? (
            <span className="rounded-lg border border-papa-warn/40 bg-papa-warn/10 px-3 py-2 text-xs text-papa-warn">
              Écarts illisibles — {erreurEcarts}
            </span>
          ) : nbEcarts === null ? (
            <span className="rounded-lg border border-papa-border px-3 py-2 text-xs text-papa-muted">
              lecture des écarts…
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFiltreCarte("modifies");
                ouvrir("carte");
              }}
              className="rounded-lg border border-papa-accent/40 bg-papa-accent/10 px-3 py-2 text-xs font-semibold text-papa-accent"
            >
              {nbEcarts} réglage{nbEcarts > 1 ? "s" : ""} s'écarte{nbEcarts > 1 ? "nt" : ""} du
              défaut →
            </button>
          )
        }
      />

      <OngletsParametres actif={actif} onSelect={ouvrir} />

      {actif === "carte" && (
        <div role="tabpanel" id="panneau-carte" aria-labelledby="onglet-carte">
          <CarteReglages
            key={filtreCarte}
            onOuvrirOnglet={ouvrir}
            ecarts={ecarts}
            filtreInitial={filtreCarte}
          />
        </div>
      )}

      {actif === "autonomie" && (
        <div role="tabpanel" id="panneau-autonomie" aria-labelledby="onglet-autonomie">
          <AutonomieTab />
        </div>
      )}

      {actif === "machine" && (
        <div role="tabpanel" id="panneau-machine" aria-labelledby="onglet-machine">
          <MachineTab />
        </div>
      )}
    </div>
  );
}
