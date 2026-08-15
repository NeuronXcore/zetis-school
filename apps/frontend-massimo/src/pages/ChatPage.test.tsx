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
    // La dictée du chat a sa propre route depuis l'ADR-0059 §18 (celle d'ELI5 écrivait les mots
    // de Massimo en base). Seule la DÉPENDANCE change ici — les assertions de dictée sont
    // inchangées : elles vérifient toujours « appui, relâche, ZETIS reçoit le texte ».
    transcribeChat: vi.fn(),
  };
});

vi.mock("../lib/dictation", () => ({
  isDictationSupported: vi.fn(() => false),
  startRecording: vi.fn(),
}));

// 🔴 **La voix doit être SUPPORTÉE dans les tests, sinon la branche de synthèse n'est jamais
// traversée.** jsdom n'a pas d'`AudioContext`, donc `isVoicePlaybackSupported()` rend `false` et
// `speakReply` saute tout le bloc `synthesizeChatSpeech` + `playSpeech`. Un test qui prétend
// vérifier « le texte s'affiche AVANT la voix » y était donc VERT même en remettant l'ordre
// fautif — constaté en jouant le sabotage le 2026-08-15, et c'est la seule raison pour laquelle
// ce mock existe. Sans lui, le verrou de l'ADR-0059 §5.1 ne verrouille rien.
// ⚠️ **`false` par défaut = le comportement exact de jsdom avant ce mock.** Le rendre `true`
// globalement ferait passer les 21 autres tests par la branche voix, où `playback.ended` résolu
// d'emblée termine la parole instantanément — un test qui vérifie « la carte n'apparaît
// qu'APRÈS la parole » devient alors faux pour une raison qui n'a rien à voir avec lui. Seul le
// test du §5.1 le passe à `true`.
vi.mock("../lib/voice", async (orig) => {
  const actual = await orig<typeof import("../lib/voice")>();
  return {
    ...actual,
    isVoicePlaybackSupported: vi.fn(() => false),
    primeAudio: vi.fn(),
    playSpeech: vi.fn(async () => ({
      duration: 1,
      ended: Promise.resolve(),
      getArticulation: () => null,
      stop: vi.fn(),
    })),
  };
});

vi.mock("../lib/eli5", async (orig) => {
  const actual = await orig<typeof import("../lib/eli5")>();
  return { ...actual, requestNotion: vi.fn() };
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
  transcribeChat,
  type ChatReply,
} from "../lib/chat";
import { isDictationSupported, startRecording } from "../lib/dictation";
import { isVoicePlaybackSupported } from "../lib/voice";
import { requestNotion } from "../lib/eli5";

const mockCreate = vi.mocked(createChatSession);
const mockSend = vi.mocked(sendChatMessage);
const mockSynthesize = vi.mocked(synthesizeChatSpeech);
const mockSupported = vi.mocked(isDictationSupported);
const mockRecord = vi.mocked(startRecording);
const mockTranscribe = vi.mocked(transcribeChat);

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

  it("🔴 le texte de ZETIS s'affiche SANS attendre la synthèse vocale (ADR-0059 §5.1)", async () => {
    // Le plus gros gain de réactivité du chantier. Jusqu'au 2026-08-15, `setWords` venait APRÈS
    // `await synthesizeChatSpeech` : Piper devait finir toute la réponse avant le premier mot.
    // On tient ici la synthèse EN SUSPENS et on exige que le texte soit déjà là.
    //
    // 🔴 Sans cette ligne, le test est VERT sur le sabotage : jsdom n'a pas d'`AudioContext`,
    // donc la branche voix n'est jamais traversée et l'ordre des deux blocs n'a aucun effet
    // observable. Vérifié en jouant le sabotage le 2026-08-15.
    vi.mocked(isVoicePlaybackSupported).mockReturnValue(true);
    let libere: (buf: ArrayBuffer) => void = () => {};
    mockSynthesize.mockReturnValue(
      new Promise<ArrayBuffer>((resolve) => {
        libere = resolve;
      }),
    );
    mockSend.mockResolvedValue({ ...REPLY, reply: "Les fractions, c'est des parts.", action: null });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Écris à ZETIS/i), {
      target: { value: "c'est quoi les fractions" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Envoyer/i }).closest("form")!);

    // La synthèse n'a PAS rendu — et le texte est pourtant déjà à l'écran.
    // (Le karaoké éclate la réponse en un `<span>` par mot : on lit le conteneur, pas un nœud
    // de texte unique.)
    await waitFor(() =>
      expect(document.querySelector(".chat-transcript")?.textContent).toContain("parts"),
    );
    expect(screen.getByTestId("avatar").dataset.state).toBe("speaking");

    libere(new ArrayBuffer(8)); // on libère la voix : le tour se termine normalement
  });

  it("🔴 la dictée s'affiche à Massimo avant que ZETIS réponde (ADR-0059 §5.2)", async () => {
    // Sa transcription partait directement dans `send()` sans jamais s'afficher : il parlait, et
    // n'avait aucune confirmation d'avoir été entendu avant la réponse complète.
    mockSupported.mockReturnValue(true);
    mockRecord.mockResolvedValue({
      stop: () => Promise.resolve(new Blob(["x"], { type: "audio/webm" })),
      cancel: () => {},
      analyser: null,
    });
    mockTranscribe.mockResolvedValue({ transcript: "explique les fractions", duration_seconds: 1 });
    let repond: (r: ChatReply) => void = () => {};
    mockSend.mockReturnValue(
      new Promise<ChatReply>((resolve) => {
        repond = resolve;
      }),
    );
    renderPage();
    const mic = screen.getByRole("button", { name: /Appuie pour parler/ });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("listening"));
    fireEvent.pointerUp(mic);

    // ZETIS n'a pas encore répondu, et Massimo voit déjà ses propres mots.
    await waitFor(() => expect(screen.getByText(/explique les fractions/)).toBeInTheDocument());

    repond({ ...REPLY, reply: "Voilà.", action: null });
  });

  it("le texte tapé ne se répète PAS à l'écran (il est déjà sous les yeux de Massimo)", async () => {
    // Garde-fou de l'asymétrie voix/clavier : l'écho répond au doute « m'a-t-il entendu ? », qui
    // n'existe qu'à la voix. Au clavier, le répéter serait du bruit.
    let repond: (r: ChatReply) => void = () => {};
    mockSend.mockReturnValue(
      new Promise<ChatReply>((resolve) => {
        repond = resolve;
      }),
    );
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Écris à ZETIS/i), {
      target: { value: "coucou zetis" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Envoyer/i }).closest("form")!);

    await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("thinking"));
    expect(screen.queryByText("coucou zetis")).not.toBeInTheDocument();

    repond({ ...REPLY, reply: "Salut !", action: null });
  });

  it("🔴 la source s'AFFICHE et ne se PARLE jamais (ADR-0059 §7)", async () => {
    // Une incise administrative dans chaque réponse parlée (« d'après ta leçon Les fractions »)
    // casserait le rythme d'une conversation d'enfant — même discipline que l'annonce
    // d'ouverture. Sabotage : concaténer la source au `reply` avant `synthesizeChatSpeech`.
    mockSend.mockResolvedValue({
      ...REPLY,
      reply: "Les parts doivent être égales.",
      action: null,
      grounding: { kind: "cours", lesson_title: "Les fractions", sources_used: 0 },
    });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Écris à ZETIS/i), {
      target: { value: "pourquoi le même dénominateur" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Envoyer/i }).closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/D'après ta leçon « Les fractions »/)).toBeInTheDocument(),
    );
    // Ce qui part à la synthèse ne contient QUE la réponse.
    for (const appel of mockSynthesize.mock.calls) {
      expect(appel[0]).not.toMatch(/D'après/);
    }
  });

  it("sans source ancrée, aucune puce ne s'affiche", async () => {
    // ZETIS l'a déjà dit dans sa réponse même (« je ne l'ai pas encore — je le note ») : une puce
    // « d'après rien » serait un doublon, et un aveu de plus à lire pour Massimo.
    mockSend.mockResolvedValue({
      ...REPLY,
      reply: "Ça, je ne l'ai pas encore dans tes cours — je le note.",
      action: null,
      grounding: { kind: "aucune", lesson_title: null, sources_used: 0 },
    });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Écris à ZETIS/i), {
      target: { value: "explique-moi les statistiques" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Envoyer/i }).closest("form")!);

    await waitFor(() =>
      expect(document.querySelector(".chat-transcript")?.textContent).toContain("note"),
    );
    expect(document.querySelector(".chat-source")).toBeNull();
  });

  it("l'interrogation montre un REPÈRE et une SORTIE — jamais un score (ADR-0059 §10)", async () => {
    // Les règles de gamification interdisent le décompte anxiogène : ni compteur d'erreurs, ni
    // pourcentage, ni bilan. Un enfant qui voit « 1/2 » cesse de répondre pour protéger son
    // chiffre. Sabotage : afficher les verdicts.
    mockSend.mockResolvedValue({
      ...REPLY,
      reply: "Que vaut -3 + 5 ?",
      action: null,
      recall: { asked: 2, total: 3, skill_name: "Nombres relatifs", finished: false },
    });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Écris à ZETIS/i), {
      target: { value: "interroge-moi" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Envoyer/i }).closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/Question 2 sur 3/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /On arrête/ })).toBeInTheDocument();
    expect(screen.queryByText(/score|bonne réponse|erreur/i)).not.toBeInTheDocument();
  });

  it("une interrogation CLOSE disparaît de l'écran", async () => {
    // Le repère ne doit pas survivre à ce qu'il mesure.
    mockSend.mockResolvedValue({
      ...REPLY,
      reply: "Voilà, c'est tout pour cette fois — tu as bien travaillé !",
      action: null,
      recall: { asked: 3, total: 3, skill_name: "Nombres relatifs", finished: true },
    });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Écris à ZETIS/i), {
      target: { value: "la réponse" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Envoyer/i }).closest("form")!);

    await waitFor(() =>
      expect(document.querySelector(".chat-transcript")?.textContent).toContain("travaillé"),
    );
    expect(screen.queryByText(/Question .* sur/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /On arrête/ })).not.toBeInTheDocument();
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

  it("🔴 ce qu'on propose est AMENÉ SOUS LES YEUX — le menu ne reste pas sous le pli", async () => {
    // Défaut trouvé au navigateur le 2026-08-15, invisible de toute la suite : le menu d'une
    // notion était rendu **788 px sous le pli** d'un écran de 812 px. Présent dans le DOM,
    // cliquable, jamais vu. La page n'avait aucune logique de défilement — ça tenait tant que
    // ZETIS ne répondait qu'une ligne, et l'ADR-0059 §7 lui a appris à répondre au FOND.
    //
    // ⚠️ jsdom ne mesure rien : ce test ne prouve pas que le bloc devient visible, il prouve
    // qu'on le DEMANDE. C'est tout ce qu'il peut honnêtement prouver ici — la visibilité réelle
    // a été vue à l'écran, en 375 px, et c'est écrit dans l'ADR.
    //
    // Sabotage : retirer le `useEffect` de défilement, ou le brancher sur `words` (il défilerait
    // à chaque mot du karaoké, ce qui arracherait la lecture).
    const scroll = vi.fn();
    const proto = window.HTMLElement.prototype as unknown as { scrollIntoView?: unknown };
    proto.scrollIntoView = scroll;
    try {
      mockSend.mockResolvedValue({
        ...REPLY,
        tool_suggestion: null,
        action: {
          kind: "notion_menu",
          label: "Sur « Les fractions », tu peux :",
          name: "Les fractions",
          confirm: true,
          items: [{ kind: "eli5", route: "/eli5?skill_id=1", label: "💡 Fais-moi comprendre" }],
        },
      });
      renderPage();
      ask("addition et soustraction de fractions");
      await screen.findByRole("button", { name: /Fais-moi comprendre/ });
      await waitFor(() => expect(scroll).toHaveBeenCalled());
      // `block: "nearest"` — il ne bouge RIEN quand le bloc est déjà visible. Un `"end"` ou un
      // `"center"` sauterait la page à chaque tour, y compris quand il n'y avait rien à montrer.
      expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest" }));
    } finally {
      delete proto.scrollIntoView;
    }
  });

  it("un tour SANS rien à proposer ne déplace pas le regard", async () => {
    // Symétrie du test précédent : sans bloc, pas de défilement. Sinon chaque « salut ! » ferait
    // sauter la page sous les yeux de Massimo.
    const scroll = vi.fn();
    const proto = window.HTMLElement.prototype as unknown as { scrollIntoView?: unknown };
    proto.scrollIntoView = scroll;
    try {
      mockSend.mockResolvedValue({ ...REPLY, tool_suggestion: null, action: null });
      renderPage();
      ask("coucou");
      await waitFor(() => expect(screen.getByTestId("avatar").dataset.state).toBe("idle"));
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      delete proto.scrollIntoView;
    }
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
