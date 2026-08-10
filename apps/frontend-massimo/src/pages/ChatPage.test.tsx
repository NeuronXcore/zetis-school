import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StrictMode } from "react";
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
import {
  ChatQuotaReached,
  createChatSession,
  sendChatMessage,
  synthesizeChatSpeech,
  type ChatReply,
} from "../lib/chat";
import { isDictationSupported, startRecording } from "../lib/dictation";
import { requestNotion, transcribeEli5 } from "../lib/eli5";

const mockCreate = vi.mocked(createChatSession);
const mockSend = vi.mocked(sendChatMessage);
const mockSynthesize = vi.mocked(synthesizeChatSpeech);
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

  it("action request_notion (notion hors-programme) → carte « Ajouter à mon programme » → enregistre + remercie", async () => {
    const mockRequest = vi.mocked(requestNotion);
    mockRequest.mockResolvedValue({} as never);
    mockSend.mockResolvedValue({
      ...REPLY,
      skill_id: null,
      tool_suggestion: null,
      action: {
        kind: "request_notion",
        label: "Ajouter « le verbe être en espagnol » à mon programme",
        text: "le verbe être en espagnol",
        confirm: true,
      },
    });
    renderPage();
    ask("le verbe être en espagnol");
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
    fireEvent.click(screen.getByRole("button", { name: /Ajouter .* à mon programme/ }));
    // Enregistre la demande (précédent ELI5), PAS une génération.
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith("le verbe être en espagnol"),
    );
    // Confirmation affichée, carte retirée.
    expect(await screen.findByText(/C'est noté/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ajouter .* à mon programme/ })).toBeNull();
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
        label: "Ajouter « les nombres complexes » à mon programme",
        text: "les nombres complexes",
        confirm: true,
      },
    });
    renderPage();
    ask("les nombres complexes");
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
    fireEvent.click(screen.getByRole("button", { name: /Ajouter .* à mon programme/ }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    // Rien n'est parti → pas de fausse confirmation, et la carte reste tapable pour réessayer.
    expect(screen.queryByText(/C'est noté/)).toBeNull();
    expect(screen.getByRole("button", { name: /Ajouter .* à mon programme/ })).toBeTruthy();
    expect(await screen.findByText(/pas réussi à noter ta demande/)).toBeTruthy();
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

  // --- Retour de demande à l'ouverture (addendum ADR-0026) ---------------------------------

  it("ferme la boucle : ce que Massimo avait demandé est annoncé dès l'ouverture", async () => {
    mockCreate.mockResolvedValue({
      session_id: "s1",
      transparency: "ZETIS retient les notions que tu travailles, pas tes mots.",
      announcement: {
        text: "Tu m'avais demandé ta fiche sur les nombres relatifs. C'est prêt.",
        actions: [
          {
            kind: "navigate",
            label: "Tes fiches de Mathématiques",
            route: "/fiches/mathematiques",
            confirm: true,
            skill_id: 126,
          },
        ],
      },
    });
    renderPage();

    // L'annonce s'AFFICHE immédiatement — texte ET carte. Pas de karaoké, pas d'attente.
    expect(
      await screen.findByText(/Tu m'avais demandé ta fiche sur les nombres relatifs/),
    ).toBeInTheDocument();
    const card = await screen.findByRole("button", { name: /Tes fiches de Mathématiques/ });
    fireEvent.click(card);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/fiches/mathematiques"));
    // La trace porte la notion de LA CARTE. Un tap d'annonce est souvent le premier acte de la
    // session : sans ce `skill_id`, le serveur retombait sur le dernier `chat_topic` de l'élève —
    // parfois vieux de plusieurs jours, donc attribué à la mauvaise notion (observé le 2026-08-02).
    expect(mockSend).toHaveBeenCalledWith("s1", {
      tool_response: { tool_type: "fiche", accepted: true, skill_id: 126 },
    });
  });

  it("test-verrou : l'annonce s'AFFICHE, elle ne se parle pas — et l'avatar reste endormi", async () => {
    // Le bug du 2026-08-02 : l'annonce passait par `speakReply` → `playSpeech` → `ctx.resume()`
    // sur un AudioContext SUSPENDU (aucun geste utilisateur au montage). Le navigateur laisse
    // cette promesse en attente POUR TOUJOURS et le texte n'apparaissait jamais.
    //
    // Ce qui verrouille ici, c'est **`state === "idle"`** : aucun cycle de parole ne doit
    // démarrer au montage. L'assertion sur la synthèse est une ceinture — jsdom n'ayant pas
    // d'AudioContext, elle ne se serait pas déclenchée même avec le code fautif. C'est
    // précisément pourquoi la première version des tests n'a rien vu, et pourquoi le verrou
    // porte sur l'état de l'avatar, observable dans les deux environnements.
    mockCreate.mockResolvedValue({
      session_id: "s1",
      transparency: "ZETIS retient les notions que tu travailles, pas tes mots.",
      // `actions: []` = le cas réellement rencontré : des notions ajoutées au programme dont le
      // contenu n'est pas encore produit. Sans texte affiché, l'écran est vide.
      announcement: { text: "Tu m'avais demandé « pourcentages ». C'est dans ton programme maintenant.", actions: [] },
    });
    renderPage();

    expect(await screen.findByText(/pourcentages/)).toBeInTheDocument();
    expect(mockSynthesize).not.toHaveBeenCalled();
    // « L'arrivée sur la page ne réveille PAS l'avatar » (page-chat.md §États 1).
    expect(screen.getByTestId("avatar").dataset.state).toBe("idle");
    expect(screen.getByTestId("avatar").dataset.awake).toBe("false");
  });

  it("test-verrou : l'annonce survit au double montage de StrictMode", async () => {
    // Second bug du 2026-08-02, trouvé en vrai et invisible ici parce que `renderPage` ne monte
    // PAS sous StrictMode alors que l'app, si (`main.tsx`). Sous StrictMode : l'effet joue, se
    // démonte, rejoue. Le garde d'appel-unique bloque le second passage — donc un drapeau
    // `cancelled` posé par le cleanup du premier JETAIT la réponse du seul fetch réellement parti.
    // L'annonce était consommée côté serveur (tamponnée, donc PERDUE POUR TOUJOURS) et n'arrivait
    // jamais à l'écran. Ce test monte comme l'app monte.
    mockCreate.mockResolvedValue({
      session_id: "s1",
      transparency: "ZETIS retient les notions que tu travailles, pas tes mots.",
      announcement: { text: "Tu m'avais demandé « pourcentages ». C'est prêt.", actions: [] },
    });
    render(
      <StrictMode>
        <MemoryRouter>
          <ChatPage />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByText(/pourcentages/)).toBeInTheDocument();
    // L'appel reste UNIQUE : une annonce est auto-extinctive, la consommer deux fois la perdrait.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("sans annonce, l'ouverture est identique à avant (non-régression)", async () => {
    renderPage();
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(
      screen.queryByRole("group", { name: "Ce que tu avais demandé" }),
    ).not.toBeInTheDocument();
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
