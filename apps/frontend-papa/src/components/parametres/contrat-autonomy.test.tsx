// Le contrat de `/api/settings/autonomy`, vu du FRONT.
//
// ⚠️ **Aucun mock ici, et c'est tout l'intérêt.** Partout ailleurs le front mocke `fetchAutonomy`
// et le backend se teste contre lui-même : renommez une clé JSON d'un seul côté et **les deux
// suites restent vertes**. C'est arrivé le 2026-08-04 sur `preset` → `niveau`, et seul un appel
// réel l'a montré.
//
// Ces tests lisent le MÊME fichier que `test_settings_autonomy.py` :
// `packages/types/contracts/autonomy.example.json`, capturé depuis le serveur réel.
//
//   • là-bas : « la réponse a-t-elle exactement ces clés ? »   → un renommage serveur casse
//   • ici    : « l'écran sait-il lire ces clés ? »              → un contrat mis à jour seul casse
//
// Les deux au vert ⇒ le contrat tient. ⚠️ Ne jamais « réparer » celui-ci en changeant le contrat :
// ce serait déplacer la panne, pas la corriger.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Autonomy } from "@zetis/types";

import contrat from "../../../../../packages/types/contracts/autonomy.example.json";
import { PALIER_LABEL } from "../../lib/settings";
import { EtatZetis } from "../EtatZetis";
import { NiveauDetail } from "./NiveauDetail";

/** ⚠️ `as unknown as` est délibéré : le JSON importé donne `string` là où le type attend une
 *  union. Ce qu'on vérifie n'est pas la satisfaction du compilateur — c'est que les COMPOSANTS
 *  savent lire cet objet. Une assertion de type qui passerait sur une clé absente ne prouverait
 *  rien ; un écran qui affiche « Sur mesure » au lieu du régime, si. */
const autonomy = contrat as unknown as Autonomy;

describe("le contrat /api/settings/autonomy", () => {
  it("🔒 le champ du NIVEAU est lisible — s'il était renommé, l'écran dirait « Sur mesure »", () => {
    // Le piège exact du 2026-08-04 : `preset` → `niveau` côté serveur, front pas mis à jour.
    // `autonomy.niveau` devenait `undefined`, et le bloc retombait silencieusement sur l'état
    // « Sur mesure » — un régime FAUX, affiché sans la moindre erreur.
    expect(autonomy.niveau).toBeDefined();
    expect(["manuel", "semi", "autonome", null]).toContain(autonomy.niveau);
  });

  it("🔒 la sidebar rend le régime du contrat, sans rien inventer", () => {
    render(
      <MemoryRouter>
        <EtatZetis state={{ status: "ready", autonomy }} />
      </MemoryRouter>,
    );

    const badge = document.querySelector(".regime-badge")!.textContent!;
    expect(badge).not.toContain("SUR MESURE"); // le repli silencieux d'une clé absente
    expect(badge).toMatch(/MANUAL|HYBRID|AUTONOM/);
  });

  it("🔒 le panneau rend les SIX classes du contrat, chacune avec son palier", () => {
    // Couvre `classes[].key/label/value/locked/reason` d'un coup : si l'une de ces clés était
    // renommée côté serveur, la ligne perdrait son nom ou son palier.
    render(<NiveauDetail autonomy={autonomy} niveau={autonomy.niveau} />);

    const lignes = screen.getAllByRole("listitem");
    expect(lignes).toHaveLength(autonomy.classes.length);

    for (const cls of autonomy.classes) {
      const ligne = screen.getByRole("listitem", { name: cls.label });
      expect(ligne.textContent).toContain(PALIER_LABEL[cls.value]);
    }
  });

  it("🔒 chaque classe verrouillée du contrat porte son motif — sinon le cadenas est muet", () => {
    render(<NiveauDetail autonomy={autonomy} niveau={autonomy.niveau} />);

    for (const cls of autonomy.classes.filter((c) => c.locked)) {
      expect(screen.getByRole("listitem", { name: cls.label }).textContent).toContain(cls.reason);
    }
  });

  it("🔒 le déclencheur est un BOOLÉEN et il est lu — pas une chaîne, pas un palier", () => {
    // ADR-0035 §5 : deux questions, deux sources. Le jour où il rejoindrait `classes`, ce test
    // tomberait avant que l'écran ne le rende comme un palier à 4 valeurs.
    expect(typeof autonomy.auto_trigger_enabled).toBe("boolean");

    render(
      <MemoryRouter>
        <EtatZetis state={{ status: "ready", autonomy }} />
      </MemoryRouter>,
    );
    const attendu = autonomy.auto_trigger_enabled ? "⚡" : "⏸";
    expect(document.querySelector(".regime-badge")!.textContent).toContain(attendu);
  });
});
