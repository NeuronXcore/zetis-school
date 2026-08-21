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
//
// Slice 2 de l'ADR-0066 (§6-§7) — les verrous d'administration, plus bas : « Restaurer »
// absent des archives non vérifiées, la SAISIE exigée (un clic seul ne part jamais), le
// dialogue de suppression qui nomme l'archive, « restaurée le … » lu du GET.
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
  lancerRestauration: vi.fn(),
  supprimerArchive: vi.fn(),
}));
import {
  fetchDonnees,
  lancerRestauration,
  lancerSauvegarde,
  lancerVerification,
  supprimerArchive,
} from "../../lib/settings";

function archive(surcharge: Partial<ArchiveSauvegarde> = {}): ArchiveSauvegarde {
  return {
    nom: "zetis-2026-08-19-1430.tar",
    taille: 3_200_000,
    cree_le: "2026-08-19T14:30",
    sha256: "a".repeat(64),
    lignes: 9161,
    tables: 48,
    verification: null,
    restaurable: true,
    motif: null,
    restauration: null,
    ...surcharge,
  };
}

/** Une archive au verdict `reussie` — la seule sur laquelle « Restaurer » a le droit d'exister. */
function verifiee(surcharge: Partial<ArchiveSauvegarde> = {}): ArchiveSauvegarde {
  return archive({
    verification: {
      archive: "zetis-2026-08-19-1430.tar",
      verdict: "reussie",
      verifie_le: "2026-08-19T15:00:00+00:00",
      ecarts: 0,
    },
    ...surcharge,
  });
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
  vi.mocked(lancerRestauration).mockReset();
  vi.mocked(supprimerArchive).mockReset();
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

// --- 🔴 Restaurer : le geste se mérite, et un clic seul ne part JAMAIS (ADR-0066 §7) ---------------

describe("restaurer", () => {
  it("« Restaurer » est ABSENT d'une archive non vérifiée — le mot se mérite dans les deux sens", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees()); // verification: null

    render(<DonneesTab />);

    await screen.findByText("export non vérifié");
    expect(screen.queryByRole("button", { name: "↺ Restaurer" })).toBeNull();
  });

  it("la SAISIE arme le geste : sans le mot exact, le clic ne part pas ; avec, il part avec le nom", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees({ archives: [verifiee()] }));
    vi.mocked(lancerRestauration).mockResolvedValue({ job_id: 4, status: "queued" });

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: "↺ Restaurer" }));

    // Le dialogue NOMME l'archive et énonce la séquence, filet compris.
    const dialogue = await screen.findByRole("dialog");
    expect(dialogue).toHaveAccessibleName(/Restaurer « zetis-2026-08-19-1430\.tar »/);
    await screen.findByText(/sauvegarde-filet de l'état actuel/);

    // Un clic SEUL ne part pas : le bouton est désactivé, et même cliqué, rien ne part.
    const confirmer = screen.getByRole("button", { name: "Restaurer cette archive" });
    expect(confirmer).toBeDisabled();
    fireEvent.click(confirmer);
    expect(lancerRestauration).not.toHaveBeenCalled();

    // Une saisie FAUSSE n'arme rien non plus.
    const champ = screen.getByLabelText("saisie de confirmation");
    fireEvent.change(champ, { target: { value: "restaurer" } });
    expect(screen.getByRole("button", { name: "Restaurer cette archive" })).toBeDisabled();

    // Le mot exact arme le bouton — le geste part avec le NOM de l'archive.
    fireEvent.change(champ, { target: { value: "RESTAURER" } });
    fireEvent.click(screen.getByRole("button", { name: "Restaurer cette archive" }));
    await waitFor(() =>
      expect(lancerRestauration).toHaveBeenCalledWith("zetis-2026-08-19-1430.tar"),
    );
    await screen.findByText(/Travail #4 enfilé/);
  });

  it("compatibilité défavorable : le bouton existe mais est GRISÉ, avec son motif — jamais un cadenas muet", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(
      donnees({
        archives: [
          verifiee({ restaurable: false, motif: "Tête Alembic « abc » inconnue du code installé." }),
        ],
      }),
    );

    render(<DonneesTab />);

    const bouton = await screen.findByRole("button", { name: "↺ Restaurer" });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute("title", "Tête Alembic « abc » inconnue du code installé.");
  });

  it("un 409 (précondition du §2) s'affiche en refus, motif du serveur relayé tel quel", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees({ archives: [verifiee()] }));
    vi.mocked(lancerRestauration).mockRejectedValue(
      new HttpError("ZETIS n'est pas suspendu : suspendez d'abord avec « Suspendre ZETIS ».", 409),
    );

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: "↺ Restaurer" }));
    fireEvent.change(await screen.findByLabelText("saisie de confirmation"), {
      target: { value: "RESTAURER" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restaurer cette archive" }));

    await screen.findByText(
      "ZETIS n'est pas suspendu : suspendez d'abord avec « Suspendre ZETIS ».",
    );
  });

  it("« restaurée le … » s'affiche sous l'archive — l'état vient du sidecar via le GET", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(
      donnees({
        archives: [
          verifiee({
            restauration: {
              termine_le: "2026-08-19T21:12:00+00:00",
              verdict: "reussie",
              etape_arretee: null,
              motif: null,
              ecarts: 0,
            },
          }),
        ],
      }),
    );

    render(<DonneesTab />);

    await screen.findByText(/↺ restaurée le/);
  });
});

// --- Supprimer : un geste explicite, sans saisie — le serveur garde le filet (§6) ------------------

describe("supprimer", () => {
  it("le dialogue NOMME l'archive ; confirmer (sans saisie) part le DELETE et RELIT la liste", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(supprimerArchive).mockResolvedValue({
      archive: "zetis-2026-08-19-1430.tar",
      supprimes: ["zetis-2026-08-19-1430.tar", "zetis-2026-08-19-1430.tar.sha256"],
    });

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: "🗑 Supprimer" }));

    const dialogue = await screen.findByRole("dialog");
    expect(dialogue).toHaveAccessibleName(/Supprimer « zetis-2026-08-19-1430\.tar »/);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer cette archive" }));

    await waitFor(() =>
      expect(supprimerArchive).toHaveBeenCalledWith("zetis-2026-08-19-1430.tar"),
    );
    await screen.findByText(/supprimée — 2 fichier\(s\) retirés de la cible/);
    // La liste se RELIT : une archive encore affichée après suppression serait un mensonge.
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(2);
  });

  it("le 409 « dernière archive vérifiée » s'affiche en refus, motif relayé — jamais zéro filet", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees({ archives: [verifiee()] }));
    vi.mocked(supprimerArchive).mockRejectedValue(
      new HttpError(
        "« zetis-2026-08-19-1430.tar » est la dernière archive au verdict « réussie » : la supprimer laisserait ZETIS sans aucune sauvegarde prouvée.",
        409,
      ),
    );

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: "🗑 Supprimer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Supprimer cette archive" }));

    await screen.findByText(/dernière archive au verdict « réussie »/);
  });
});
