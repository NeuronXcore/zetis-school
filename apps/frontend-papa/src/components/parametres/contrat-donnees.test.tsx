// Le contrat de `GET /api/settings/donnees`, vu du FRONT (ADR-0067).
//
// ⚠️ **Le JSON lu ici n'est pas un mock, et c'est tout l'intérêt.** Partout ailleurs ce dossier
// mocke `fetchDonnees` avec des objets écrits à la main, et le backend se teste contre lui-même :
// renommez une clé JSON d'un seul côté et **les deux suites restent vertes**. C'est arrivé le
// 2026-08-04 sur `preset` → `niveau`, et seul un appel réel l'a montré. Le remplacement du champ
// de restauration (ADR-0067 §2) est exactement le même genre de renommage.
//
// Ces tests lisent le MÊME fichier que `test_sauvegarde_donnees.py` :
// `packages/types/contracts/donnees.example.json`, **capturé** le 2026-08-21 depuis le backend
// réel (port 8005, cible de dev — la seule qui porte une archive réellement restaurée).
//
//   • là-bas : « la réponse a-t-elle exactement ces clés ? »  → un renommage serveur casse
//   • ici    : « l'écran sait-il lire ces clés ? »            → un contrat mis à jour seul casse
//
// Les deux au vert ⇒ le contrat tient. ⚠️ Ne jamais « réparer » celui-ci en changeant le contrat :
// ce serait déplacer la panne, pas la corriger.
//
// ⚠️ `fetchDonnees` est bien mockée — mais elle rend le contrat CAPTURÉ, pas un objet inventé.
// Le mock est le transport ; la donnée, elle, vient du serveur réel. `DonneesTab` va chercher ses
// données lui-même : il n'y a pas d'autre moyen de les lui donner.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type Donnees } from "@zetis/types";

import contrat from "../../../../../packages/types/contracts/donnees.example.json";
import { fetchDonnees } from "../../lib/settings";
import { DonneesTab } from "./DonneesTab";

vi.mock("../../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/settings")>()),
  fetchDonnees: vi.fn(),
}));

/** ⚠️ `as unknown as` est délibéré : le JSON importé donne `string` là où le type attend des
 *  unions. Ce qu'on vérifie n'est pas la satisfaction du compilateur — c'est que l'ÉCRAN sait
 *  lire cet objet. Une assertion de type qui passerait sur une clé absente ne prouverait rien ;
 *  un écran qui n'affiche plus « restaurée le … », si. */
const donnees = contrat as unknown as Donnees;

describe("le contrat /api/settings/donnees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchDonnees).mockResolvedValue(donnees);
  });

  it("🔒 l'écran lit `restauration.termine_le` — s'il était renommé, « restaurée le … » disparaîtrait en silence", async () => {
    // Le piège exact du 2026-08-04, transposé : le champ renommé côté serveur, le front pas mis à
    // jour. `a.restauration` devient `undefined`, le bloc ne rend rien, et AUCUNE erreur n'est
    // levée — l'archive a simplement l'air de n'avoir jamais été restaurée.
    render(<DonneesTab />);

    await screen.findByText(/↺ restaurée le/);
  });

  it("🔒 le contrat porte bien une archive restaurée — sans elle, ce fichier ne garde rien", () => {
    const restaurees = donnees.archives.filter((a) => a.restauration !== null);

    expect(restaurees.length).toBeGreaterThan(0);
    expect(restaurees[0].restauration?.verdict).toBeDefined();
    expect(["reussie", "interrompue"]).toContain(restaurees[0].restauration?.verdict);
  });

  it("🔒 une archive jamais restaurée rend `null` — et ce n'est pas la même chose qu'un geste interrompu", () => {
    // La distinction que l'ADR-0067 §2 crée. Le contrat capturé porte les DEUX états : c'est ce
    // qui rend ce fichier utile plutôt que décoratif.
    const jamais = donnees.archives.filter((a) => a.restauration === null);

    expect(jamais.length).toBeGreaterThan(0);
  });

  it("🔒 l'écran ne lit plus le champ remplacé", () => {
    // Cliquet : si quelqu'un le réintroduit « pour compatibilité », les deux formulations
    // divergeront (§2).
    for (const archive of donnees.archives) {
      expect(archive).not.toHaveProperty("restauree_le");
    }
  });
});
