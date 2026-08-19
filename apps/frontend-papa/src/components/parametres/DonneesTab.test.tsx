// 💾 Les verrous de l'onglet Données (ADR-0065 §7, slice 3).
//
// Le verrou qui porte le chantier entier : **le mot « sauvegarde » se mérite** — une archive
// jamais restaurée à blanc s'affiche « export non vérifié », et « Sauvegarde vérifiée »
// n'apparaît qu'après un verdict `reussie` de `backup_verify`. C'est la phrase de la maquette
// que l'ADR a gardée ; sans ce test, un libellé « plus rassurant » la referait mentir.
//
// Et les règles transverses de la page (adr-0062 §6) : un refus 409 s'affiche AVEC son motif
// (jamais en panne rouge), une erreur de lecture n'affiche AUCUNE valeur, le verrou du
// certificat vient du serveur.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ArchiveSauvegarde, type Donnees } from "@zetis/types";

import { DonneesTab } from "./DonneesTab";
import { HttpError } from "../../lib/httpClient";

vi.mock("../../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/settings")>()),
  fetchDonnees: vi.fn(),
  lancerSauvegarde: vi.fn(),
  lancerVerification: vi.fn(),
}));
import { fetchDonnees, lancerSauvegarde, lancerVerification } from "../../lib/settings";

function archive(surcharge: Partial<ArchiveSauvegarde> = {}): ArchiveSauvegarde {
  return {
    nom: "zetis-2026-08-19-1430.tar",
    taille: 3_200_000,
    cree_le: "2026-08-19T14:30",
    sha256: "a".repeat(64),
    lignes: 9161,
    tables: 48,
    verification: null,
    ...surcharge,
  };
}

function donnees(surcharge: Partial<Donnees> = {}): Donnees {
  return {
    certificat: { valable: true, motif: null, cible: "/Volumes/NX-Models/zetis-sauvegardes" },
    archives: [archive()],
    derniere_verification: null,
    ...surcharge,
  };
}

beforeEach(() => {
  vi.mocked(fetchDonnees).mockReset();
  vi.mocked(lancerSauvegarde).mockReset();
  vi.mocked(lancerVerification).mockReset();
});

// --- 🔴 Le mot « sauvegarde » se mérite (§7) -------------------------------------------------------

describe("le mot « sauvegarde » se mérite", () => {
  it("une archive jamais vérifiée s'affiche « export non vérifié » — jamais « sauvegarde »", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());

    render(<DonneesTab />);

    await screen.findByText("export non vérifié");
    expect(screen.queryByText(/Sauvegarde vérifiée/)).toBeNull();
  });

  it("le mot n'apparaît qu'après une restauration à blanc RÉUSSIE", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(
      donnees({
        archives: [
          archive({
            verification: {
              archive: "zetis-2026-08-19-1430.tar",
              verdict: "reussie",
              verifie_le: "2026-08-19T15:00:00+00:00",
              ecarts: 0,
            },
          }),
        ],
      }),
    );

    render(<DonneesTab />);

    await screen.findByText(/Sauvegarde vérifiée/);
    expect(screen.queryByText("export non vérifié")).toBeNull();
  });

  it("un verdict d'échec se dit en échec, avec le COMPTE des écarts — pas « sauvegarde »", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(
      donnees({
        archives: [
          archive({
            verification: {
              archive: "zetis-2026-08-19-1430.tar",
              verdict: "echec",
              verifie_le: "2026-08-19T15:00:00+00:00",
              ecarts: 2,
            },
          }),
        ],
      }),
    );

    render(<DonneesTab />);

    await screen.findByText("vérification en échec (2 écarts)");
    expect(screen.queryByText(/Sauvegarde vérifiée/)).toBeNull();
  });
});

// --- Les règles transverses de la page (adr-0062 §6) -----------------------------------------------

describe("les refus et les pannes", () => {
  it("un 409 s'affiche AVEC le motif du serveur — relayé tel quel", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(lancerSauvegarde).mockRejectedValue(
      new HttpError("Une sauvegarde est déjà en file ou en cours (travail #12).", 409),
    );

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /💾 Sauvegarder/ }));

    await screen.findByText("Une sauvegarde est déjà en file ou en cours (travail #12).");
  });

  it("un 202 annonce le travail enfilé, avec son numéro", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(lancerSauvegarde).mockResolvedValue({ job_id: 7, status: "queued" });

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /💾 Sauvegarder/ }));

    await screen.findByText(/Travail #7 enfilé/);
  });

  it("une erreur de lecture n'affiche AUCUNE valeur — ni archive, ni geste", async () => {
    vi.mocked(fetchDonnees).mockRejectedValue(new Error("réseau injoignable"));

    render(<DonneesTab />);

    await screen.findByText(/État de la sauvegarde illisible — réseau injoignable/);
    expect(screen.queryByText(/zetis-/)).toBeNull();
    expect(screen.queryByRole("button", { name: /💾 Sauvegarder/ })).toBeNull();
    // Le chemin de sortie existe : réessayer est un geste, pas un rechargement de page.
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
  });

  it("le certificat invalide grise le geste AVEC le motif du serveur", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(
      donnees({
        certificat: {
          valable: false,
          motif: "Cible non certifiée : aucun certificat `.zetis-cible.json`.",
          cible: null,
        },
        archives: [],
      }),
    );

    render(<DonneesTab />);

    await screen.findByText("Cible non certifiée : aucun certificat `.zetis-cible.json`.");
    expect(screen.getByRole("button", { name: /💾 Sauvegarder/ })).toBeDisabled();
  });

  it("dit OÙ la sauvegarde s'écrit — le chemin hôte du certificat", async () => {
    // « Certifiée » sans dire où obligeait à demander — relevé à la relecture d'écran (§5bis).
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());

    render(<DonneesTab />);

    await screen.findByText("/Volumes/NX-Models/zetis-sauvegardes");
  });
});

// --- Le second geste : vérifier UNE archive --------------------------------------------------------

describe("vérifier", () => {
  it("part avec le NOM de l'archive de sa ligne", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(lancerVerification).mockResolvedValue({ job_id: 9, status: "queued" });

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Vérifier/ }));

    await waitFor(() =>
      expect(lancerVerification).toHaveBeenCalledWith("zetis-2026-08-19-1430.tar"),
    );
    await screen.findByText(/Travail #9 enfilé/);
  });
});
