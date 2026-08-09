import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiagnosticVerbalisation } from "../lib/diagnostic";

// « Raconte-moi » — la verbalisation (ADR-0048 Décision 5, Session B).
//
// 🔴 RÈGLE DE VOCABULAIRE : tout ici prend LA MESURE pour sujet, jamais l'enfant.

vi.mock("../lib/diagnostic", () => ({ envoyerExplication: vi.fn() }));
vi.mock("../lib/dictation", () => ({
  isDictationSupported: vi.fn(() => true),
  startRecording: vi.fn(),
}));
vi.mock("../lib/eli5", () => ({
  transcribeEli5: vi.fn(),
  Eli5SttUnavailable: class Eli5SttUnavailable extends Error {},
}));

import { CarteRaconteMoi } from "./CarteRaconteMoi";
import { envoyerExplication } from "../lib/diagnostic";
import { isDictationSupported, startRecording } from "../lib/dictation";
import { Eli5SttUnavailable, transcribeEli5 } from "../lib/eli5";

const V: DiagnosticVerbalisation = {
  question_id: 41,
  skill_id: 3,
  skill_name: "Les trois ordres",
  explication: null,
};

function poser(v: DiagnosticVerbalisation = V) {
  return render(<CarteRaconteMoi attemptId={42} verbalisation={v} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isDictationSupported).mockReturnValue(true);
  vi.mocked(envoyerExplication).mockResolvedValue({ ...V, explication: "ok" });
});

describe("la carte demande, elle n'accuse pas", () => {
  it("🔴 nomme la notion et ne rend AUCUN mot de fiabilité", () => {
    poser();
    expect(screen.getByText(/Les trois ordres/)).toBeInTheDocument();
    // Le composant ne reçoit AUCUNE information de verdict — il ne peut pas la rendre. Ce balayage
    // tient la frontière : si un jour on lui passe la fiabilité « pour ajuster le ton », il rougit.
    const texte = document.body.textContent ?? "";
    for (const interdit of ["fiabilité", "à confirmer", "suspect", "triché", "verdict"]) {
      expect(texte.toLowerCase()).not.toContain(interdit.toLowerCase());
    }
  });

  it("🔴 porte la phrase de permission, avec « j'ai cherché »", () => {
    poser();
    const texte = document.body.textContent ?? "";
    // Sabotage : retirer un seul des quatre exemples → rouge. C'est la ligne qui rend la réponse
    // disible : elle NOMME ce qu'on cherche à détecter et le déclare acceptable.
    for (const exemple of ["je le savais", "je l'ai vu en cours", "j'ai deviné", "j'ai cherché"]) {
      expect(texte).toContain(exemple);
    }
  });

  it("la limite est 200 caractères — une phrase DITE est plus longue qu'une phrase tapée", () => {
    poser();
    expect(screen.getByLabelText(/Comment tu as trouvé/)).toHaveAttribute("maxlength", "200");
  });

  it("« Passer » fait disparaître la carte SANS aucun appel réseau — MÊME si Massimo avait écrit", () => {
    poser();
    // ⚠️ **Le champ est rempli EXPRÈS.** Une première version cliquait « Passer » sur un champ
    // vide : le sabotage « Passer se met à envoyer » restait alors VERT, parce que c'est la garde
    // `if (!propre) return` de `envoyer()` qui bloquait, pas le bouton. Le verrou visait à côté et
    // rassurait à tort. Le cas réel est celui-ci : il écrit, puis change d'avis.
    fireEvent.change(screen.getByLabelText(/Comment tu as trouvé/), {
      target: { value: "j'ai cherché" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passer" }));
    // 🔴 Le silence n'est pas transmis : le compter ferait de « Passer » un aveu.
    expect(envoyerExplication).not.toHaveBeenCalled();
    expect(screen.queryByText(/Raconte-moi/)).not.toBeInTheDocument();
  });

  it("envoie le mot, puis remercie SANS promettre de récompense", async () => {
    poser();
    fireEvent.change(screen.getByLabelText(/Comment tu as trouvé/), {
      target: { value: "j'ai cherché" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(envoyerExplication).toHaveBeenCalledWith(42, 41, "j'ai cherché"));
    expect(await screen.findByText(/Merci/)).toBeInTheDocument();
    // Il dit que Papa le lira — parce que c'est vrai. Et AUCUN XP, aucune promesse.
    expect(document.body.textContent).toContain("Papa le verra");
    expect(document.body.textContent?.toLowerCase()).not.toContain("xp");
  });

  it("en relecture, Massimo SE RELIT — on ne lui redemande pas", () => {
    poser({ ...V, explication: "je l'ai vu dans le documentaire" });
    expect(screen.getByText(/Merci/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
  });
});

describe("le micro", () => {
  it("🔴 LA TRANSCRIPTION REMPLIT LE CHAMP — elle ne s'envoie PAS toute seule", async () => {
    // 🔴 LE VERROU LE PLUS IMPORTANT DU MICRO. Patron d'ELI5, PAS celui de ChatPage, qui fait
    // `send(transcript, "voice")`. Deux raisons : Massimo doit pouvoir CORRIGER ce que Whisper a
    // mal entendu — sinon il découvrirait sa phrase déformée chez Papa — et un envoi automatique
    // créerait un SECOND chemin de soumission sur une carte qui n'en a qu'un.
    //
    // Sabotage : appeler `envoyerExplication` à la fin de `arreterMicro` → rouge.
    const stop = vi.fn().mockResolvedValue(new Blob());
    vi.mocked(startRecording).mockResolvedValue({ stop, cancel: vi.fn(), analyser: null });
    vi.mocked(transcribeEli5).mockResolvedValue({ transcript: "je l'ai vu en cours" } as never);

    poser();
    const micro = screen.getByRole("button", { name: /parler/i });
    fireEvent.pointerDown(micro);
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(micro);

    await waitFor(() =>
      expect(screen.getByLabelText(/Comment tu as trouvé/)).toHaveValue("je l'ai vu en cours"),
    );
    expect(envoyerExplication).not.toHaveBeenCalled();
  });

  it("🔴 disparaît EN SILENCE quand l'appareil n'a pas de micro", () => {
    vi.mocked(isDictationSupported).mockReturnValue(false);
    poser();
    expect(screen.queryByRole("button", { name: /parler/i })).not.toBeInTheDocument();
    // Rien ne s'affiche sur ce qui manque : un enfant n'a pas à savoir qu'un service est absent.
    const texte = (document.body.textContent ?? "").toLowerCase();
    for (const fuite of ["micro", "dictée", "indispo", "non supporté"]) {
      expect(texte).not.toContain(fuite);
    }
    // L'anti-test-à-vide : le champ texte, lui, est bien là.
    expect(screen.getByLabelText(/Comment tu as trouvé/)).toBeInTheDocument();
  });

  it("🔴 disparaît EN SILENCE quand le service de transcription répond 503", async () => {
    const stop = vi.fn().mockResolvedValue(new Blob());
    vi.mocked(startRecording).mockResolvedValue({ stop, cancel: vi.fn(), analyser: null });
    vi.mocked(transcribeEli5).mockRejectedValue(new Eli5SttUnavailable());

    poser();
    const micro = screen.getByRole("button", { name: /parler/i });
    fireEvent.pointerDown(micro);
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(micro);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /parler/i })).not.toBeInTheDocument(),
    );
    expect((document.body.textContent ?? "").toLowerCase()).not.toContain("dispo");
    expect(screen.getByLabelText(/Comment tu as trouvé/)).toBeInTheDocument();
  });

  it("l'invitation change quand il n'y a pas de micro — pas de promesse en l'air", () => {
    poser();
    expect(screen.getByLabelText(/Comment tu as trouvé/)).toHaveAttribute(
      "placeholder",
      "dis-le, ou écris-le ici",
    );
    vi.mocked(isDictationSupported).mockReturnValue(false);
    screen.getByRole("button", { name: "Passer" }); // force un re-render propre
    render(<CarteRaconteMoi attemptId={42} verbalisation={V} />);
    expect(screen.getAllByLabelText(/Comment tu as trouvé/).at(-1)).toHaveAttribute(
      "placeholder",
      "écris-le ici",
    );
  });
});
