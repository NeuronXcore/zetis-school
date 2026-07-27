import { afterEach, describe, expect, it, vi } from "vitest";
import { Eli5SttUnavailable, transcribeEli5 } from "./eli5";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("transcribeEli5", () => {
  it("renvoie la transcription sur 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transcript: "Un nombre relatif a un signe.", duration_seconds: 2 }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await transcribeEli5(new Blob(["x"], { type: "audio/webm" }));
    expect(out.transcript).toContain("nombre relatif");

    // Envoi multipart : PAS de Content-Type imposé (boundary posée par le navigateur).
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string> | undefined)?.["Content-Type"]).toBeUndefined();
  });

  it("lève Eli5SttUnavailable sur 503 (front masque le micro)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(transcribeEli5(new Blob(["x"]))).rejects.toBeInstanceOf(Eli5SttUnavailable);
  });
});
