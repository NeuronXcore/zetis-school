import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Avatar mocké : stub déterministe exposant l'état, l'éveil et le mode réduit — évite canvas/asset
// en jsdom et rend les assertions d'état lisibles.
vi.mock("@zetis/ui/avatar", () => ({
  AvatarCanvas: (props: {
    state: string;
    awake: boolean;
    reducedMotion?: boolean;
  }) => (
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
    ...actual, // garde ChatQuotaReached / ChatSessionExpired (instanceof) et les types
    createChatSession: vi.fn(),
    sendChatMessage: vi.fn(),
    closeChatSession: vi.fn(),
  };
});

import { ChatPage } from "./ChatPage";
import {
  ChatQuotaReached,
  createChatSession,
  sendChatMessage,
  type ChatReply,
} from "../lib/chat";

const mockCreate = vi.mocked(createChatSession);
const mockSend = vi.mocked(sendChatMessage);

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
  mockCreate.mockResolvedValue({ session_id: "s1", transparency: "ZETIS retient les notions que tu travailles, pas tes mots." });
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

    // Pendant la parole : l'avatar est en `speaking` et aucune carte d'outil n'est rendue.
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("speaking"));
    expect(screen.queryByText("🧠 Réexplique-moi")).not.toBeInTheDocument();

    // Après le karaoké : retour au repos, la carte apparaît.
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
      expect(
        screen.getByText(/On a beaucoup parlé aujourd'hui/),
      ).toBeInTheDocument(),
    );
    // Le champ de saisie disparaît (état, pas blocage brutal).
    expect(screen.queryByLabelText("Écris à ZETIS")).not.toBeInTheDocument();
  });

  it("test-verrou : aucune API vocale navigateur, aucun localStorage de conversation", () => {
    const files = [
      "./ChatPage.tsx",
      "../lib/chat.ts",
      "../lib/karaoke.ts",
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
