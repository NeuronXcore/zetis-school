import { afterEach, describe, expect, it } from "vitest";

import { markIntroSeen, shouldPlayIntro } from "./introGate";

type Globals = {
  sessionStorage?: Storage;
  matchMedia?: (query: string) => MediaQueryList;
};

// Environnement node (pas de DOM) : on installe des stubs minimaux.
function installSessionStorageStub(): Map<string, string> {
  const map = new Map<string, string>();
  (globalThis as Globals).sessionStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  return map;
}

function installMatchMediaStub(matches: boolean): void {
  (globalThis as Globals).matchMedia = () => ({ matches }) as MediaQueryList;
}

afterEach(() => {
  delete (globalThis as Globals).sessionStorage;
  delete (globalThis as Globals).matchMedia;
});

describe("shouldPlayIntro", () => {
  it("joue l'intro à la première arrivée de la session", () => {
    installSessionStorageStub();
    expect(shouldPlayIntro()).toBe(true);
  });

  it("saute l'intro une fois qu'elle a été vue ou coupée", () => {
    installSessionStorageStub();
    markIntroSeen();
    expect(shouldPlayIntro()).toBe(false);
  });

  it("saute l'intro si l'utilisateur préfère les animations réduites", () => {
    installSessionStorageStub();
    installMatchMediaStub(true);
    expect(shouldPlayIntro()).toBe(false);
  });

  it("joue l'intro sans lever quand le stockage est indisponible", () => {
    (globalThis as Globals).sessionStorage = {
      get length(): number {
        throw new Error("SecurityError");
      },
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;

    expect(shouldPlayIntro()).toBe(true);
    expect(() => markIntroSeen()).not.toThrow();
  });
});
