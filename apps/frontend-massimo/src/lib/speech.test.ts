import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@zetis/ui", () => ({ isSoundEnabled: vi.fn() }));
vi.mock("./authClient", () => ({
  API_URL: "http://api.test",
  authClient: { getToken: () => "tok" },
}));

import { isSoundEnabled } from "@zetis/ui";
import { speak } from "./speech";

// Stub minimal d'HTMLAudioElement (absent/inopérant en jsdom).
class FakeAudio {
  src = "";
  onended: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor(public url: string) {
    created.push(this);
  }
}
let created: FakeAudio[] = [];

function stubAudio() {
  created = [];
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("speak (voix backend Piper)", () => {
  it("ne parle pas si le son est coupé (aucun appel réseau)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(isSoundEnabled).mockReturnValue(false);
    await speak("bonjour");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("récupère l'audio TTS et le joue si le son est activé", async () => {
    vi.mocked(isSoundEnabled).mockReturnValue(true);
    // 🔴 Corps en `Uint8Array`, PAS en `Blob` — et ce n'est pas un détail de style.
    //
    // `new Response(new Blob(…))` mélange deux implémentations : le `Blob` vient de jsdom, le
    // `Response` vient d'undici. Sous **Node 20**, undici appelle `object.stream()` sur le corps
    // et le `Blob` de jsdom ne l'expose pas → `TypeError: object.stream is not a function`.
    // Sous Node 24 les globales s'alignent et le test passe. Il était donc vert en local
    // (Node 24) et ROUGE en CI (Node 20, le plancher que `engines.node` annonce) — révélé par la
    // première CI, le 2026-08-16.
    //
    // Un `Uint8Array` est un `BufferSource` : undici le consomme sans passer par jsdom, quelle que
    // soit la version. `res.blob()` rend ensuite un vrai `Blob`, et `URL.createObjectURL` est
    // stubé plus haut — l'identité de l'objet n'entre dans aucune assertion.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    stubAudio();

    await speak("Massimo, je prépare ton ELI5");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/ai/tts",
      expect.objectContaining({ method: "POST" }),
    );
    expect(created).toHaveLength(1);
    expect(created[0].play).toHaveBeenCalled();
  });

  it("voix indisponible (503) → pas de lecture, pas d'erreur", async () => {
    vi.mocked(isSoundEnabled).mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    stubAudio();
    await expect(speak("x")).resolves.toBeUndefined();
    expect(created).toHaveLength(0);
  });
});
