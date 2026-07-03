import { describe, expect, it } from "vitest";
import { asJson } from "./httpClient";

// Verrou du parsing d'erreur : le `detail` FastAPI n'est pas toujours une chaîne
// (422 de validation = LISTE d'objets {msg, loc, …} — affichait « [object Object] »).

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("asJson", () => {
  it("detail chaîne : remonté verbatim", async () => {
    await expect(
      asJson(response(409, { detail: "Leçon 1 archivée : hors du flux." })),
    ).rejects.toThrow("Leçon 1 archivée : hors du flux.");
  });

  it("detail liste (422 validation FastAPI) : les msg sont extraits, jamais [object Object]", async () => {
    const err = asJson(
      response(422, {
        detail: [
          { type: "extra_forbidden", loc: ["body", "content"], msg: "Extra inputs are not permitted" },
          { type: "string_too_short", loc: ["body", "title"], msg: "String should have at least 1 character" },
        ],
      }),
    );
    await expect(err).rejects.toThrow(
      "Erreur 422 : Extra inputs are not permitted ; String should have at least 1 character",
    );
    await expect(
      asJson(response(422, { detail: [{ msg: "x" }] })),
    ).rejects.not.toThrow("[object Object]");
  });

  it("detail objet inattendu : sérialisé lisiblement", async () => {
    await expect(asJson(response(500, { detail: { code: 42 } }))).rejects.toThrow(
      'Erreur 500 : {"code":42}',
    );
  });

  it("réponse non-JSON : message générique avec le statut", async () => {
    const res = new Response("<html>Bad Gateway</html>", { status: 502 });
    await expect(asJson(res)).rejects.toThrow("Erreur 502");
  });

  it("réponse OK : JSON rendu tel quel", async () => {
    await expect(asJson<{ ok: boolean }>(response(200, { ok: true }))).resolves.toEqual({
      ok: true,
    });
  });
});
