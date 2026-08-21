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
  type SortieSauvegarde,
  type SortieVerification,
} from "@zetis/types";

import { DonneesTab } from "./DonneesTab";
import { HttpError } from "../../lib/httpClient";

vi.mock("../../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/settings")>()),
  fetchDonnees: vi.fn(),
  sauvegarderEtSuivre: vi.fn(),
  verifierEtSuivre: vi.fn(),
  lancerRestauration: vi.fn(),
  supprimerArchive: vi.fn(),
}));
import {
  fetchDonnees,
  lancerRestauration,
  sauvegarderEtSuivre,
  supprimerArchive,
  verifierEtSuivre,
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

/** L'`output_json` d'un `backup_create` réussi. */
function sortieSauvegarde(surcharge: Partial<SortieSauvegarde> = {}): SortieSauvegarde {
  return {
    archive: "zetis-2026-08-19-1430.tar",
    taille: 3_200_000,
    sha256: "a".repeat(64),
    lignes: 9161,
    tables: 48,
    objets_minio: 0,
    fichiers_audio: 76,
    tete_alembic: "abc123",
    ...surcharge,
  };
}

/** L'`output_json` d'un `backup_verify`. 🔴 Il porte le verdict — y compris `echec`, sur un
 *  travail qui a pourtant RÉUSSI. */
function sortieVerification(surcharge: Partial<SortieVerification> = {}): SortieVerification {
  return {
    archive: "zetis-2026-08-19-1430.tar",
    sha256: "a".repeat(64),
    verdict: "reussie",
    ecarts: [],
    verifie_le: "2026-08-19T15:00:00+00:00",
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
  vi.mocked(sauvegarderEtSuivre).mockReset();
  vi.mocked(verifierEtSuivre).mockReset();
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
    // ⚠️ Le 409 est levé par le POST, AVANT tout sondage : `lancerEtSuivre` fait son `asJson`
    // en premier. Le refus reste donc un `HttpError` que `estRefus` reconnaît au CODE.
    vi.mocked(sauvegarderEtSuivre).mockRejectedValue(
      new HttpError("Une sauvegarde est déjà en file ou en cours (travail #12).", 409),
    );

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /💾 Sauvegarder/ }));

    await screen.findByText("Une sauvegarde est déjà en file ou en cours (travail #12).");
  });

  it("🔴 le geste annonce sa FIN, plus son enfilement — « Travail #N enfilé » a DISPARU", async () => {
    // ⚠️ **Cette assertion en remplace une qui est morte**, et le remplacement est la décision :
    // le test d'avant verrouillait `/Travail #7 enfilé/`. Ce message était une consigne de
    // surveillance — il annonçait qu'un travail PARTAIT, et laissait Papa deviner qu'il finissait.
    // L'ADR-0067 §6 (Amendement 2) le supprime : la page attend, et dit la fin.
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(sauvegarderEtSuivre).mockResolvedValue(sortieSauvegarde());

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /💾 Sauvegarder/ }));

    await screen.findByText(/Export écrit/);
    expect(screen.queryByText(/enfilé/)).toBeNull();
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
    vi.mocked(verifierEtSuivre).mockResolvedValue(sortieVerification());

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Vérifier/ }));

    await waitFor(() =>
      expect(verifierEtSuivre).toHaveBeenCalledWith("zetis-2026-08-19-1430.tar"),
    );
    // ⚠️ L'ancienne assertion `/Travail #9 enfilé/` est morte avec le message : le geste ne
    // s'annonce plus au départ, il se dit à l'arrivée.
    await screen.findByText(/c'est une sauvegarde/);
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

/** Le bouton a-t-il un REMPLISSAGE au repos ? À jetons, pas à la sous-chaîne : `hover:bg-rose-400/10`
 *  contient `bg-rose-400/1` et ferait échouer n'importe quelle regex naïve — un remplissage au
 *  SURVOL n'est pas un remplissage. */
function remplissageAuRepos(el: HTMLElement): string | undefined {
  return el.className.split(/\s+/).find((c) => /^bg-(amber|emerald|rose)/.test(c));
}

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

// --- 🔴 ADR-0067 §6 (Amendement 2) — Sauvegarder et Vérifier disent leur fin --------------------
//
// La restriction du §6 : **une seule mécanique par NATURE de geste**. Ces deux-là passent par le
// suiveur partagé `travaux.ts` (ADR-0041 §4/§9) parce que **leur ligne `ai_jobs` survit** ; seule
// la restauration garde l'attente du §1, la sienne mourant au swap.
//
// 🔴 **Le verrou qui porte ce chantier** : `verifier_sauvegarde` *retourne* son verdict
// (`"reussie" if not ecarts else "echec"`) au lieu de lever. Un travail qui constate des écarts
// passe donc à `succeeded`, et la promesse RÉSOUT. Sans le test ci-dessous, un échec s'annoncerait
// par un toast — la faute que l'ADR-0041 §8 a payée, et le premier des §Signaux de l'ADR-0067.

describe("Sauvegarder et Vérifier disent leur fin (§6, Amendement 2)", () => {
  it("🔴 une vérification EN ÉCHEC ne passe JAMAIS par un toast", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(verifierEtSuivre).mockResolvedValue(
      sortieVerification({
        verdict: "echec",
        ecarts: ["membre : « storage/audio/12.wav » absent du manifeste", "empreinte : divergente"],
      }),
    );

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Vérifier/ }));

    // Le geste a ABOUTI (la promesse a résolu) — et pourtant rien d'éphémère ne l'annonce.
    await screen.findByText(/vérification en échec — 2 écarts/);
    expect(toastAffiche()).toBeNull();
  });

  it("🔒 une vérification RÉUSSIE toaste — et c'est là que le mot « sauvegarde » se gagne", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(verifierEtSuivre).mockResolvedValue(sortieVerification());

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Vérifier/ }));

    await screen.findByText(/c'est une sauvegarde/);
    expect(toastAffiche()).not.toBeNull();
  });

  it("🔴 le toast de Sauvegarder n'appelle JAMAIS « sauvegarde » un export non vérifié", async () => {
    // ADR-0065 §7 et ADR-0067 §5. Le tar vient de naître : personne ne l'a rejoué à blanc.
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(sauvegarderEtSuivre).mockResolvedValue(sortieSauvegarde());

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /💾 Sauvegarder/ }));

    const toast = (await screen.findByText(/Export écrit/)).closest('[role="status"]')!;
    expect(toast).toHaveTextContent("zetis-2026-08-19-1430.tar");
    // ⚠️ Assertion POSITIVE, et c'est délibéré : une négation du genre « le mot n'apparaît pas »
    // passerait ici pour la mauvaise raison (le mot EST là, dans la phrase qui le refuse) —
    // `TROUBLESHOOTING.md` porte deux fois ce piège. On verrouille donc que le seul emploi du mot
    // est celui qui le REFUSE à cette archive.
    expect(toast).toHaveTextContent(/ne s'appellera « sauvegarde » qu'après une vérification/);
    // Il nomme l'archive et sa taille, sans pourcentage ni durée (§5).
    expect(toast.textContent).not.toMatch(/%|seconde|minute|bientôt/);
  });

  it("🔴 ces deux gestes n'arment PAS l'attente de Restaurer — les mécaniques ne se mélangent pas", async () => {
    // Le hors-périmètre, prouvé plutôt que promis : l'attente du §1 ne vit que pour la
    // restauration. Si un de ces gestes l'armait, `fetchDonnees` serait rappelée en boucle.
    vi.useFakeTimers();
    try {
      vi.mocked(fetchDonnees).mockResolvedValue(donnees());
      vi.mocked(sauvegarderEtSuivre).mockResolvedValue(sortieSauvegarde());

      render(<DonneesTab />);
      await avancer(0);
      fireEvent.click(screen.getByRole("button", { name: /💾 Sauvegarder/ }));
      await avancer(0);
      const apresGeste = vi.mocked(fetchDonnees).mock.calls.length; // montage + relecture

      await avancer(60_000);
      expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(apresGeste);
    } finally {
      vi.useRealTimers();
    }
  });

  it("🔒 pendant l'attente, les gestes de la page sont GRISÉS", async () => {
    // Le suiveur peut tourner plusieurs minutes : laisser les boutons vifs inviterait au doublon
    // que le serveur refuserait ensuite en 409.
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(sauvegarderEtSuivre).mockReturnValue(new Promise(() => {})); // jamais résolue

    render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /💾 Sauvegarder/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /💾 Sauvegarder/ })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: /Vérifier/ })).toBeDisabled();
  });

  it("🔴 rien ne s'affiche APRÈS un démontage — le suiveur partagé, lui, ne s'arrête pas", async () => {
    // `suivre()` est une boucle de promesse nue : quitter l'onglet la laisse sonder jusqu'à son
    // plafond de 15 min. Le garde est au site d'appel, faute de pouvoir toucher `travaux.ts`.
    let resoudre: (v: SortieSauvegarde) => void = () => {};
    vi.mocked(fetchDonnees).mockResolvedValue(donnees());
    vi.mocked(sauvegarderEtSuivre).mockReturnValue(
      new Promise<SortieSauvegarde>((r) => {
        resoudre = r;
      }),
    );

    const { unmount } = render(<DonneesTab />);
    fireEvent.click(await screen.findByRole("button", { name: /💾 Sauvegarder/ }));
    const lues = vi.mocked(fetchDonnees).mock.calls.length;

    unmount();
    resoudre(sortieSauvegarde()); // le travail finit APRÈS que Papa a quitté l'onglet
    await Promise.resolve();

    // Aucune relecture, donc aucun `setState` sur un composant mort.
    expect(vi.mocked(fetchDonnees).mock.calls.length).toBe(lues);
  });
});

// --- 🔴 Le bouton de vérification : un VERBE, jamais un état ------------------------------------
//
// L'idée écartée, et pourquoi elle l'a été : deux états avec case à cocher (« à vérifier » /
// « vérifié »). Elle bute sur deux choses.
//
//   1. **Le fait serait dit deux fois.** La colonne « Statut » le porte déjà, et mieux — avec sa
//      date et son compte d'écarts. Deux formulations d'un même fait finissent par diverger ;
//      l'ADR-0067 §2 a payé cette leçon en SUPPRIMANT un champ plutôt qu'en le doublant.
//   2. 🔴 **Une vérification n'est pas une propriété, c'est une observation DATÉE.** Une archive
//      vérifiée en août peut être corrompue en décembre — c'est pour ça que `verifie_le` existe.
//      Une case cochée dirait « plus rien à faire » d'une chose qui se périme, et griser le
//      bouton retirerait à Papa la re-vérification.
//
// Ce qui change donc, c'est le POIDS : une seule ligne porte une action réellement due.

describe("le bouton de vérification dit ce que le CLIC fait", () => {
  it("🔒 une archive non vérifiée porte l'action DUE, en primary", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees()); // verification: null

    render(<DonneesTab />);

    const b = await screen.findByRole("button", { name: "✓ Vérifier" });
    // Ambre, comme le badge « export non vérifié » de sa ligne — et le SEUL bouton rempli.
    expect(b.className).toMatch(/border-amber/);
    expect(remplissageAuRepos(b)).toMatch(/^bg-amber/); // rempli : c'est l'action due
  });

  it("🔒 une archive vérifiée propose une RE-vérification, discrète — et jamais grisée", async () => {
    vi.mocked(fetchDonnees).mockResolvedValue(donnees({ archives: [verifiee()] }));

    render(<DonneesTab />);

    const b = await screen.findByRole("button", { name: "↻ Re-vérifier" });
    // Émeraude, comme son badge — et CADRE SEUL : possible, jamais urgent.
    expect(b.className).toMatch(/border-emerald/);
    expect(remplissageAuRepos(b)).toBeUndefined(); // cadre seul
    // 🔴 Le point qui fait toute la différence avec une case à cocher : une vérification vieillit,
    // donc on doit TOUJOURS pouvoir la refaire.
    expect(b).not.toBeDisabled();
  });

  it("🔒 une vérification en échec porte le ROSE de son badge — le bouton suit sa ligne", async () => {
    // ⚠️ Ce verrou disait « ambre, jamais rose » il y a dix minutes. Il a changé parce que la
    // RÈGLE a changé : le bouton emprunte la couleur du badge de sa ligne, pour qu'on relie les
    // deux d'un coup d'œil. Le rose reste interdit à un MESSAGE qui n'annonce pas une panne — ce
    // bouton, lui, n'annonce rien du tout : il agit.
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

    const b = await screen.findByRole("button", { name: "↻ Re-vérifier" });
    expect(b.className).toMatch(/border-rose/);
    expect(remplissageAuRepos(b)).toBeUndefined(); // cadre seul, pas de remplissage
  });

  it("🔴 AUCUN bouton n'annonce un ÉTAT — la contre-épreuve de la case à cocher", async () => {
    // Si quelqu'un remplace un jour le verbe par « ✓ Vérifié », ce test tombe. C'est son seul but.
    vi.mocked(fetchDonnees).mockResolvedValue(
      donnees({ archives: [verifiee(), archive()] }),
    );

    render(<DonneesTab />);
    await screen.findByText(/Sauvegarde vérifiée/);

    for (const b of screen.getAllByRole("button")) {
      // ⚠️ **Pas de `\\b` ici, et c'est mesuré** : « é » n'est pas un caractère de mot en JS, donc
      // `/[Vv]érifié\\b/` ne matche JAMAIS — l'assertion passait pour la mauvaise raison, et la
      // contre-épreuve « ✓ Vérifié » ne la faisait pas tomber. Le mot nu suffit et discrimine :
      // il ne matche pas « Vérifier », qui finit par « er ».
      expect(b.textContent ?? "").not.toMatch(/[Vv]érifié/);
    }
    // …et l'état, lui, est bien là — dans la colonne qui a le droit de le porter.
    expect(screen.getByText(/Sauvegarde vérifiée · /)).toBeInTheDocument();
  });
});
