import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Avatar mocké : stub déterministe (évite canvas/asset en jsdom).
vi.mock("@zetis/ui/avatar", () => ({
  AvatarCanvas: (props: { state: string; awake: boolean; reducedMotion?: boolean }) => (
    <div
      data-testid="avatar"
      data-state={props.state}
      data-awake={String(props.awake)}
      data-reduced={String(!!props.reducedMotion)}
    />
  ),
  phonemeForWord: () => [0, 0, 0, 0],
}));

vi.mock("../lib/chat", async (orig) => {
  const actual = await orig<typeof import("../lib/chat")>();
  return {
    ...actual, // garde les classes d'erreur (instanceof) et les types
    createChatSession: vi.fn(),
    sendChatMessage: vi.fn(),
    closeChatSession: vi.fn(),
    synthesizeChatSpeech: vi.fn(),
  };
});

vi.mock("../lib/dictation", () => ({
  isDictationSupported: vi.fn(() => false),
  startRecording: vi.fn(),
}));

vi.mock("../lib/eli5", async (orig) => {
  const actual = await orig<typeof import("../lib/eli5")>();
  return { ...actual, transcribeEli5: vi.fn(), requestNotion: vi.fn() };
});

// `useNavigate` mocké pour observer les navigations d'action (voix directe, carte tapée).
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
// Carte de données stubée (évite les fetch réels agenda/reviews/missions en jsdom).
vi.mock("../components/ChatDataCard", () => ({
  ChatDataCard: (p: { data: string; openLabel: string; onOpen: () => void }) => (
    <div data-testid="datacard" data-data={p.data}>
      <button onClick={p.onOpen}>{p.openLabel}</button>
    </div>
  ),
}));

import { ChatPage } from "./ChatPage";
import { ChatQuotaReached, createChatSession, sendChatMessage, type ChatReply } from "../lib/chat";
import { isDictationSupported, startRecording } from "../lib/dictation";
import { requestNotion, transcribeEli5 } from "../lib/eli5";

const mockCreate = vi.mocked(createChatSession);
const mockSend = vi.mocked(sendChatMessage);
const mockSupported = vi.mocked(isDictationSupported);
const mockRecord = vi.mocked(startRecording);
const mockTranscribe = vi.mocked(transcribeEli5);

const REPLY: ChatReply = {
  session_id: "s1",
  turn_index: 1,
  reply: "Ok.",
  skill_id: 5,
  tool_suggestion: "eli5",
  difficulty_declared: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  );
}

function ask(text: string) {
  fireEvent.change(screen.getByLabelText("Écris à ZETIS"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupported.mockReturnValue(false); // micro masqué par défaut (jsdom sans MediaRecorder)
  mockCreate.mockResolvedValue({
    session_id: "s1",
    transparency: "ZETIS retient les notions que tu travailles, pas tes mots.",
  });
});

describe("ChatPage", () => {
  it("affiche la phrase de transparence en permanence", () => {
    renderPage();
    expect(
      screen.getByText("ZETIS retient les notions que tu travailles, pas tes mots."),
    ).toBeInTheDocument();
  });

  it("ne propose un outil qu'APRÈS la parole, jamais pendant", async () => {
    mockSend.mockResolvedValue(REPLY);
    renderPage();
    ask("bonjour");

    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("speaking"));
    expect(screen.queryByText("🧠 Réexplique-moi")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
    expect(screen.getByText("🧠 Réexplique-moi")).toBeInTheDocument();
    expect(screen.getByText("Non, je réessaie tout seul")).toBeInTheDocument();
  });

  it("réveille l'avatar au premier envoi", async () => {
    mockSend.mockResolvedValue({ ...REPLY, tool_suggestion: null });
    renderPage();
    expect(screen.getByTestId("avatar").dataset.awake).toBe("false");
    ask("coucou");
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.awake).toBe("true"));
  });

  it("propage le mode « animations réduites » à l'avatar", () => {
    renderPage();
    expect(screen.getByTestId("avatar").dataset.reduced).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Animations réduites" }));
    expect(screen.getByTestId("avatar").dataset.reduced).toBe("true");
  });

  it("affiche un état doux (pas une punition) sur quota 429", async () => {
    mockSend.mockRejectedValue(new ChatQuotaReached());
    renderPage();
    ask("encore");
    await waitFor(() =>
      expect(screen.getByText(/On a beaucoup parlé aujourd'hui/)).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Écris à ZETIS")).not.toBeInTheDocument();
  });

  it("micro masqué si la dictée n'est pas supportée par le navigateur", () => {
    mockSupported.mockReturnValue(false);
    renderPage();
    expect(screen.queryByRole("button", { name: /Appuie pour parler/ })).not.toBeInTheDocument();
  });

  it("micro : appui-pour-parler → transcription locale → tour de chat", async () => {
    mockSupported.mockReturnValue(true);
    mockRecord.mockResolvedValue({
      stop: () => Promise.resolve(new Blob(["x"], { type: "audio/webm" })),
      cancel: () => {},
      analyser: null,
    });
    mockTranscribe.mockResolvedValue({ transcript: "les fractions", duration_seconds: 1 });
    mockSend.mockResolvedValue({ ...REPLY, tool_suggestion: null });

    renderPage();
    const mic = screen.getByRole("button", { name: /Appuie pour parler/ });

    fireEvent.pointerDown(mic);
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("listening"));
    fireEvent.pointerUp(mic);

    // La transcription part au backend, puis un tour de chat (avatar parle sa réponse).
    await waitFor(() => expect(mockTranscribe).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("s1", { text: "les fractions" }));
  });

  it("clavier + action navigate → carte à taper, puis navigation ancrée + trace", async () => {
    mockSend.mockResolvedValue({
      ...REPLY,
      tool_suggestion: null,
      action: { kind: "navigate", route: "/fiches/mathematiques", label: "Tes fiches de maths" },
    });
    renderPage();
    ask("montre mes fiches de maths"); // origine CLAVIER
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
    fireEvent.click(screen.getByRole("button", { name: /Tes fiches de maths/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/fiches/mathematiques"));
    // le geste trace chat_tool_response (surface dérivée de la route), zéro nouvel event
    expect(mockSend).toHaveBeenCalledWith("s1", {
      tool_response: { tool_type: "fiche", accepted: true },
    });
  });

  it("action request_notion (notion hors-programme) → carte « Demander à Papa » → enregistre + remercie", async () => {
    const mockRequest = vi.mocked(requestNotion);
    mockRequest.mockResolvedValue({} as never);
    mockSend.mockResolvedValue({
      ...REPLY,
      skill_id: null,
      tool_suggestion: null,
      action: {
        kind: "request_notion",
        label: "Demander à Papa d'ajouter « le verbe être en espagnol »",
        text: "le verbe être en espagnol",
        confirm: true,
      },
    });
    renderPage();
    ask("le verbe être en espagnol");
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
    fireEvent.click(screen.getByRole("button", { name: /Demander à Papa/ }));
    // Enregistre la demande (précédent ELI5), PAS une génération.
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith("le verbe être en espagnol"),
    );
    // Confirmation affichée, carte retirée.
    expect(await screen.findByText(/C'est noté/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Demander à Papa/ })).toBeNull();
  });

  it("request_notion en ÉCHEC → jamais de « c'est noté », la carte reste (anti-régression review)", async () => {
    const mockRequest = vi.mocked(requestNotion);
    mockRequest.mockRejectedValue(new Error("backend éteint"));
    mockSend.mockResolvedValue({
      ...REPLY,
      skill_id: null,
      tool_suggestion: null,
      action: {
        kind: "request_notion",
        label: "Demander à Papa d'ajouter « les nombres complexes »",
        text: "les nombres complexes",
        confirm: true,
      },
    });
    renderPage();
    ask("les nombres complexes");
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
    fireEvent.click(screen.getByRole("button", { name: /Demander à Papa/ }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    // Rien n'est parti → pas de fausse confirmation, et la carte reste tapable pour réessayer.
    expect(screen.queryByText(/C'est noté/)).toBeNull();
    expect(screen.getByRole("button", { name: /Demander à Papa/ })).toBeTruthy();
    expect(await screen.findByText(/pas réussi à prévenir Papa/)).toBeTruthy();
  });

  it("voix + action navigate → navigation DIRECTE, sans carte", async () => {
    mockSupported.mockReturnValue(true);
    mockRecord.mockResolvedValue({
      stop: () => Promise.resolve(new Blob(["x"], { type: "audio/webm" })),
      cancel: () => {},
      analyser: null,
    });
    mockTranscribe.mockResolvedValue({ transcript: "montre mes fiches", duration_seconds: 1 });
    mockSend.mockResolvedValue({
      ...REPLY,
      tool_suggestion: null,
      action: { kind: "navigate", route: "/fiches/mathematiques", label: "Tes fiches" },
    });
    renderPage();
    const mic = screen.getByRole("button", { name: /Appuie pour parler/ });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("listening"));
    fireEvent.pointerUp(mic);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/fiches/mathematiques"));
    expect(screen.queryByRole("button", { name: /Tes fiches/ })).not.toBeInTheDocument();
  });

  it("offre implicite (confirm) → carte même à la voix, jamais de navigation directe", async () => {
    mockSupported.mockReturnValue(true);
    mockRecord.mockResolvedValue({
      stop: () => Promise.resolve(new Blob(["x"], { type: "audio/webm" })),
      cancel: () => {},
      analyser: null,
    });
    mockTranscribe.mockResolvedValue({ transcript: "les fractions", duration_seconds: 1 });
    mockSend.mockResolvedValue({
      ...REPLY,
      tool_suggestion: null,
      action: { kind: "navigate", route: "/eli5?skill_id=1", label: "T'expliquer les fractions", confirm: true },
    });
    renderPage();
    const mic = screen.getByRole("button", { name: /Appuie pour parler/ });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("listening"));
    fireEvent.pointerUp(mic);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /T'expliquer les fractions/ })).toBeInTheDocument(),
    );
    expect(mockNavigate).not.toHaveBeenCalled(); // offre → carte, pas de téléportation vocale
  });

  it("action show_data → carte de données inline (le front récupère l'agenda)", async () => {
    mockSend.mockResolvedValue({
      ...REPLY,
      tool_suggestion: null,
      action: { kind: "show_data", data: "agenda", label: "Ouvrir ton agenda" },
    });
    renderPage();
    ask("c'est quoi mes devoirs");
    await waitFor(() => expect(screen.getByTestId("datacard").dataset.data).toBe("agenda"));
  });

  it("action notion_menu → menu de contenus disponibles, chaque bouton navigue + trace", async () => {
    mockSend.mockResolvedValue({
      ...REPLY,
      tool_suggestion: null,
      action: {
        kind: "notion_menu",
        label: "Sur « Les fractions », tu peux :",
        name: "Les fractions",
        confirm: true,
        items: [
          { kind: "eli5", route: "/eli5?skill_id=1", label: "💡 Fais-moi comprendre" },
          { kind: "fiche", route: "/fiches/mathematiques", label: "🗒️ Lire la fiche" },
        ],
      },
    });
    renderPage();
    ask("addition et soustraction de fractions");
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
    fireEvent.click(await screen.findByRole("button", { name: /Lire la fiche/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/fiches/mathematiques"));
    expect(mockSend).toHaveBeenCalledWith("s1", {
      tool_response: { tool_type: "fiche", accepted: true },
    });
  });

  it("test-verrou : aucune API vocale navigateur, aucun stockage local de conversation", () => {
    const files = [
      "./ChatPage.tsx",
      "../lib/chat.ts",
      "../lib/karaoke.ts",
      "../lib/voice.ts",
      "../../../../packages/ui/src/components/avatar/AvatarCanvas.tsx",
      "../../../../packages/ui/src/components/avatar/phonetics.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
      expect(src).not.toMatch(/speechSynthesis|webkitSpeechRecognition|SpeechRecognition/);
      expect(src).not.toMatch(/localStorage/);
    }
  });
});
