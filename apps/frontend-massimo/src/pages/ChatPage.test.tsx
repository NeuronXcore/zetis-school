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
  return { ...actual, transcribeEli5: vi.fn() };
});

import { ChatPage } from "./ChatPage";
import { ChatQuotaReached, createChatSession, sendChatMessage, type ChatReply } from "../lib/chat";
import { isDictationSupported, startRecording } from "../lib/dictation";
import { transcribeEli5 } from "../lib/eli5";

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
