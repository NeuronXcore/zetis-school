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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  type ArchiveSauvegarde,
  type Donnees,
  type RestaurationArchive,
} from "@zetis/types";

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

// --- 🔴 ADR-0067 §1 et §3 — l'attente armée, et les TROIS issues -------------------------------
//
// Ce que ces verrous tiennent, et pourquoi chacun a coûté quelque chose :
//
//   • **l'attente ne démarre pas au montage** — c'est la première des cinq bornes du §1, et la
//     seule qui distingue cette exception du sondage que l'adr-0062 §5 interdit ;
//   • 🔴 **aucun échec ne passe par un toast** (§3) — l'ADR-0041 §8 a payé cette leçon : six
//     secondes pendant que Papa est dans une autre pièce, c'est un travail perdu en silence ;
//   • 🔴 **le renoncement ne rend aucun verdict** (§1.5) — « je n'ai pas vu la fin » n'est pas
//     « ça a échoué » ;
//   • 🔴 **un geste EN VOL ne se lit pas comme une interruption** — trouvé au read-before-code :
//     pendant la restauration, `termine_le` est nul, donc la route dérive `verdict:
//     "interrompue"` en toute bonne foi. Sans ce verrou, une restauration parfaitement saine
//     peindrait un échec rouge en cours de route ;
//   • 🔴 **le verdict du geste PRÉCÉDENT ne compte pas** — une archive déjà restaurée porte un
//     sidecar terminal ; sans témoin, la première lecture rendrait la fin d'hier ;
//   • 🔴 **une lecture en erreur ne vide pas la page** — mesuré le 2026-08-21 : pendant la
//     bascule, `GET /donnees` rend 500 (la base est absente entre les deux RENAME).

/** Une restauration telle que le GET la publie (§2 + Amendement 1). */
function geste(surcharge: Partial<RestaurationArchive> = {}): RestaurationArchive {
  return {
    termine_le: "2026-08-19T21:12:00+00:00",
    verdict: "reussie",
    etape_arretee: null,
    motif: null,
    ecarts: 0,
    ...surcharge,
  };
}

const unEtat = (r: RestaurationArchive | null) =>
  donnees({ archives: [verifiee({ restauration: r })] });

/** 🔴 Le TOAST, et lui seul. L'attente en vol porte elle aussi `role="status"` (elle informe sans
 *  interrompre, même règle) : asserter « aucun `role="status"` » confondrait les deux et rendrait
 *  vert un test qui ne prouve rien. Le bouton de fermeture n'appartient qu'au composant `Toast`. */
function toastAffiche(): HTMLElement | null {
  const fermer = screen.queryByRole("button", { name: "Fermer l'annonce" });
  return fermer ? (fermer.closest('[role="status"]') as HTMLElement) : null;
}

/** Avance le temps ET laisse les promesses se résoudre — `advanceTimersByTime` seul rendrait la
 *  main avant que la lecture ne soit revenue. */
async function avancer(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Rend l'onglet, franchit le dialogue de classe A4, et s'arrête juste après le 202 : l'attente
 *  est armée, aucune lecture n'a encore eu lieu. */
async function armer(etatInitial = unEtat(null)) {
  vi.mocked(fetchDonnees).mockResolvedValue(etatInitial);
  vi.mocked(lancerRestauration).mockResolvedValue({ job_id: 4, status: "queued" });

  const vue = render(<DonneesTab />);
  await avancer(0);
  fireEvent.click(screen.getByRole("button", { name: "↺ Restaurer" }));
  fireEvent.change(screen.getByLabelText("saisie de confirmation"), {
    target: { value: "RESTAURER" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Restaurer cette archive" }));
  await avancer(0);
  return vue;
}

describe("l'attente armée (§1)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("🔒 NE DÉMARRE PAS au montage — ouvrir l'onglet ne déclenche rien", async () => {
    // La borne §1.1, et c'est elle qui tient l'exception à l'adr-0062 §5 : une page de réglages
    // qui se relit toute seule en arrivant est exactement ce que le §5 interdit.
    vi.mocked(fetchDonnees).mockResolvedValue(unEtat(null));

    render(<DonneesTab />);
    await avancer(60_000);

    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(1);
  });

  it("🔒 armée par le 202, elle interroge à 4 s et MEURT au premier verdict", async () => {
    await armer();
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(1); // rien encore : le 202 vient de partir

    // En vol : le journal existe, `termine_le` est nul. La lecture ne conclut pas.
    vi.mocked(fetchDonnees).mockResolvedValue(
      unEtat(geste({ termine_le: null, verdict: "interrompue" })),
    );
    await avancer(4000);
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(2);

    // Le verdict arrive.
    vi.mocked(fetchDonnees).mockResolvedValue(unEtat(geste()));
    await avancer(4000);
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(3);

    // …et l'attente est morte avec sa réponse : plus une seule lecture, jamais.
    await avancer(60_000);
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(3);
  });

  it("🔒 s'arrête au DÉMONTAGE — rien ne continue en arrière-plan (§1.4)", async () => {
    // Quitter l'onglet démonte `DonneesTab` (`ParametresPage` ne rend que l'onglet actif).
    const { unmount } = await armer();
    vi.mocked(fetchDonnees).mockResolvedValue(
      unEtat(geste({ termine_le: null, verdict: "interrompue" })),
    );
    await avancer(4000);
    const avantDemontage = vi.mocked(fetchDonnees).mock.calls.length;

    unmount();
    await avancer(60_000);

    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(avantDemontage);
  });

  it("🔴 un geste EN VOL n'est PAS lu comme une interruption", async () => {
    // Le piège du read-before-code : pendant la restauration le sidecar existe SANS `termine_le`,
    // donc la route en dérive `verdict: "interrompue"` — alors que rien n'a échoué. Ce qui
    // sépare « arrêtée » de « en train de courir » est `etape_arretee`, nul tant qu'aucune étape
    // n'a échoué.
    await armer();
    vi.mocked(fetchDonnees).mockResolvedValue(
      unEtat(geste({ termine_le: null, verdict: "interrompue", etape_arretee: null })),
    );
    await avancer(12_000);

    // 🔴 Aucun échec peint : ni le mot, ni le rose. Le journal est ouvert, rien n'a échoué.
    expect(screen.queryByText(/restauration interrompue/)).toBeNull();
    expect(screen.getByText(/jamais close/)).toBeInTheDocument();
    // Et l'attente COURT toujours : elle n'a pas pris ce reflet pour une réponse.
    const lues = vi.mocked(fetchDonnees).mock.calls.length;
    await avancer(4000);
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(lues + 1);
  });

  it("🔴 le verdict du geste PRÉCÉDENT n'est pas pris pour celui-ci", async () => {
    // Restaurer une archive DÉJÀ restaurée laisse son sidecar terminal sur la cible. Sans témoin,
    // la toute première lecture rendrait « réussie » à l'instant — la fin d'hier, prise pour celle
    // d'aujourd'hui, sur le geste le plus destructif du produit.
    const hier = geste({ termine_le: "2026-08-18T10:00:00+00:00" });
    await armer(unEtat(hier));

    vi.mocked(fetchDonnees).mockResolvedValue(unEtat(hier)); // le sidecar n'a pas encore bougé
    await avancer(8000);

    expect(toastAffiche()).toBeNull(); // aucun toast : rien n'a été conclu
    const lues = vi.mocked(fetchDonnees).mock.calls.length;
    await avancer(4000);
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(lues + 1); // elle attend toujours
  });

  it("🔴 une lecture en ERREUR pendant la bascule ne vide pas la page", async () => {
    // Mesuré le 2026-08-21 : entre les deux RENAME du swap, la base `zetis` n'existe pas et
    // `GET /donnees` rend 500. Passer par `charger()` remplacerait tout le tableau par « État de
    // la sauvegarde illisible », au milieu du geste. La lecture est ignorée ; la suivante arrive.
    await armer();
    vi.mocked(fetchDonnees).mockRejectedValue(new Error("500 — la base bascule"));
    await avancer(8000);

    expect(screen.queryByText(/État de la sauvegarde illisible/)).toBeNull();
    expect(screen.getByText("zetis-2026-08-19-1430.tar")).toBeInTheDocument();

    // Puis la base revient, et le verdict est lu normalement.
    vi.mocked(fetchDonnees).mockResolvedValue(unEtat(geste()));
    await avancer(4000);
    expect(screen.getByText(/↺ restaurée le/)).toBeInTheDocument();
  });

  it("🔴 le RENONCEMENT ne rend AUCUN verdict — il rend la main au ⟳ (§1.5)", async () => {
    await armer();
    vi.mocked(fetchDonnees).mockResolvedValue(
      unEtat(geste({ termine_le: null, verdict: "interrompue" })),
    );
    await avancer(15 * 4000);

    const dit = screen.getByText(/a cessé de demander/);
    expect(dit).toHaveTextContent(/ni un succès ni un échec/);
    // 🔴 Ni succès, ni échec : aucun toast, et aucune interruption inscrite sur la ligne.
    expect(toastAffiche()).toBeNull();
    expect(screen.queryByText(/restauration interrompue/)).toBeNull();

    // Elle a cessé de demander : c'est son unique effet.
    const lues = vi.mocked(fetchDonnees).mock.calls.length;
    await avancer(60_000);
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(lues);
  });
});

describe("les trois issues (§3, Amendement 1)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("🔒 un SUCCÈS passe par un toast qui NOMME l'archive et rappelle la suspension", async () => {
    // §5 : un toast anonyme après un geste de classe A4 ne vaut rien ; et taire le réveil suspendu
    // ferait croire que ZETIS est reparti (ADR-0063 : Papa lève).
    await armer();
    vi.mocked(fetchDonnees).mockResolvedValue(unEtat(geste()));
    await avancer(4000);

    const toast = toastAffiche()!;
    expect(toast).toHaveTextContent("zetis-2026-08-19-1430.tar");
    expect(toast).toHaveTextContent(/réveillé suspendu/);
    // Ni pourcentage, ni durée, ni promesse (§5).
    expect(toast.textContent).not.toMatch(/%|seconde|minute|bientôt/);
  });

  it("🔴 un ÉCHEC ne passe JAMAIS par un toast — il s'inscrit sur la ligne", async () => {
    // La contre-épreuve du §3, et c'est le verrou qui porte le chantier : on force l'issue
    // d'échec et on asserte qu'AUCUNE annonce éphémère n'apparaît.
    await armer();
    vi.mocked(fetchDonnees).mockResolvedValue(
      unEtat(
        geste({
          termine_le: null,
          verdict: "interrompue",
          etape_arretee: "medias",
          motif: "FileNotFoundError: storage/audio absent",
        }),
      ),
    );
    await avancer(4000);

    expect(toastAffiche()).toBeNull();
    // …et l'état est là, durablement, sur la page.
    expect(screen.getByText(/restauration interrompue/)).toBeInTheDocument();
  });

  it("🔒 l'interruption rend l'ÉTAPE et le MOTIF tels quels — aucune table de traduction", async () => {
    // `etape_arretee` est le nom BRUT du journal serveur (`ETAPES_RESTAURATION`) et `motif` le
    // texte du serveur : une jolie phrase réécrite ici divergerait au premier motif reformulé
    // (doctrine ADR-0041 §8).
    vi.mocked(fetchDonnees).mockResolvedValue(
      unEtat(
        geste({
          termine_le: null,
          verdict: "interrompue",
          etape_arretee: "purge_files",
          motif: "redis.exceptions.ConnectionError: Error 61 connecting to localhost:6379",
        }),
      ),
    );

    render(<DonneesTab />);
    await avancer(0);

    expect(screen.getByText(/purge_files/)).toBeInTheDocument();
    expect(
      screen.getByText("redis.exceptions.ConnectionError: Error 61 connecting to localhost:6379"),
    ).toBeInTheDocument();
    // Sans acquittement : ce n'est pas une notification, c'est l'état de l'archive (§3).
    expect(screen.queryByRole("button", { name: /J'ai vu|Acquitter/ })).toBeNull();
  });

  it("🔴 `avec_ecarts` reçoit les DEUX — le toast ET la marque durable — et n'est pas un échec", async () => {
    // La question ouverte par l'Amendement 1, tranchée ici : c'est un SUCCÈS (donc son toast,
    // §3), mais un écart est un FAIT DURABLE (donc la ligne). Six secondes ne peuvent pas porter
    // une réserve qui reste vraie.
    await armer();
    vi.mocked(fetchDonnees).mockResolvedValue(unEtat(geste({ verdict: "avec_ecarts", ecarts: 1 })));
    await avancer(4000);

    // ① le toast, parce que le geste a abouti
    const toast = toastAffiche()!;
    expect(toast).toHaveTextContent("zetis-2026-08-19-1430.tar");
    expect(toast).toHaveTextContent(/1 écart consigné/);
    // ② la marque durable, parce que l'écart, lui, reste vrai
    expect(screen.getByText(/↺ restaurée le .* — 1 écart consigné/)).toBeInTheDocument();
    // 🔴 et JAMAIS le vocabulaire de la panne : la base est remplacée, les médias sont en place.
    expect(screen.queryByText(/interrompue|échec|a échoué/)).toBeNull();
  });

  it("🔒 le 202 de restauration n'envoie plus Papa SURVEILLER", async () => {
    // « ⟳ ensuite pour relire l'état » était une consigne de surveillance : on demandait à Papa
    // de guetter la disparition d'une ligne pour deviner un résultat. C'est ce chantier qui la
    // supprime — la page attend elle-même.
    await armer();

    expect(screen.queryByText(/⟳ ensuite pour relire l'état/)).toBeNull();
    expect(screen.getByText(/Cette page attend la fin et vous la dira/)).toBeInTheDocument();
  });
});
