import { beforeEach, describe, expect, it } from "vitest";

import { createAuthClient } from "./client";
import { type TokenStorage, createLocalStorageTokenStorage } from "./storage";

// Environnement node (pas de DOM) : on installe un stub localStorage minimal.
function installLocalStorageStub(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

const CONFIG = { apiUrl: "http://x", appRole: "papa", appLabel: "Papa", tokenKey: "zetis_token" };

describe("createLocalStorageTokenStorage (adaptateur par défaut)", () => {
  beforeEach(() => installLocalStorageStub());

  it("load → persist → clear (non-régression du défaut localStorage)", async () => {
    const store = createLocalStorageTokenStorage("zetis_token");
    expect(await store.load()).toBeNull();

    await store.persist("abc.def.ghi");
    expect(await store.load()).toBe("abc.def.ghi");
    expect(localStorage.getItem("zetis_token")).toBe("abc.def.ghi"); // bonne clé

    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe("createAuthClient — stockage injectable", () => {
  it("défaut localStorage : getToken() est synchrone et seedé dès la construction", () => {
    installLocalStorageStub();
    localStorage.setItem("zetis_token", "seed-token");

    const client = createAuthClient(CONFIG); // aucun adaptateur → défaut

    // Lecture chaude synchrone, sans await ni hydrate() : comportement web inchangé.
    expect(client.getToken()).toBe("seed-token");
  });

  it("adaptateur injecté (in-memory) : hydrate() alimente le cache, getToken() sync le lit", async () => {
    let stored: string | null = "injected-token";
    const fake: TokenStorage = {
      load: async () => stored,
      persist: async (t) => {
        stored = t;
      },
      clear: async () => {
        stored = null;
      },
    };

    const client = createAuthClient(CONFIG, fake);

    // Adaptateur async : cache vide avant hydratation.
    expect(client.getToken()).toBeNull();

    await client.hydrate();
    // Après hydratation : lecture chaude synchrone depuis le cache mémoire.
    expect(client.getToken()).toBe("injected-token");

    // logout() vide le cache (sync) et déclenche clear() sur l'adaptateur injecté.
    client.logout();
    expect(client.getToken()).toBeNull();
    await Promise.resolve(); // laisse le clear() async se résoudre
    expect(stored).toBeNull();
  });
});
