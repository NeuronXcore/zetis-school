import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useObservationPassation } from "./useObservationPassation";

// L'instrument de l'ADR-0048, côté client. Il ne rend RIEN à l'écran — donc aucune régression
// n'y sera jamais visible. C'est exactement la raison d'être de ce fichier : ce qui ne se voit
// pas ne se relit pas, il ne reste que le test.
//
// Ce que ces tests protègent, dans l'ordre d'importance :
//   1. l'instrument DIT SA PORTÉE (`signaux_observables`) — sans quoi Papa lit « rien à
//      signaler » sans savoir combien d'yeux étaient fermés ;
//   2. un geste = une sortie d'écran, jamais deux ;
//   3. `terminer()` éteint réellement l'observation — la fuite de session vient de là.

/** `performance.now()` est piloté : le hook mesure des durées, les tests doivent les décider. */
let horloge = 0;
const avancer = (ms: number) => {
  horloge += ms;
};

/** Un bloc de question dans le DOM, pour que la copie puisse se localiser. */
function poserQuestion(id: number): HTMLElement {
  const bloc = document.createElement("div");
  bloc.setAttribute("data-question-id", String(id));
  bloc.textContent = "Énoncé";
  document.body.appendChild(bloc);
  return bloc;
}

function copierDans(cible: HTMLElement | Document): void {
  const e = new Event("copy", { bubbles: true });
  (cible as HTMLElement).dispatchEvent(e);
}

function masquerLOnglet(): void {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  horloge = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => horloge);
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  // jsdom n'implémente pas le plein écran : les tests qui le simulent posent leurs propres
  // stubs et doivent les retirer, sinon ils fuient sur le fichier suivant.
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
  delete (document as unknown as Record<string, unknown>).exitFullscreen;
  Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
});

describe("avant d'avoir démarré, l'instrument ne mesure rien", () => {
  it("🔴 `recolter()` rend null — jamais un objet vide qui passerait pour une mesure", () => {
    const { result } = renderHook(() => useObservationPassation());
    expect(result.current.recolter()).toBeNull();
  });

  it("ignore une réponse notée hors passation", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.noterReponse(1));
    act(() => result.current.demarrer());
    const recolte = result.current.recolter();
    expect(recolte?.parQuestion.size).toBe(0);
  });

  it("ne compte pas une sortie d'écran survenue avant le démarrage", () => {
    const { result } = renderHook(() => useObservationPassation());
    masquerLOnglet();
    act(() => result.current.demarrer());
    expect(result.current.recolter()?.conditions.sorties_ecran).toBe(0);
  });
});

describe("la portée de l'instrument", () => {
  it("🔴 n'annonce PAS `plein_ecran` quand le navigateur ne sait pas le faire", () => {
    // Le cas d'iPhone, où `requestFullscreen` est absent. Papa doit pouvoir lire sur combien
    // d'yeux repose son « rien à signaler ».
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    const signaux = result.current.recolter()!.conditions.signaux_observables;
    expect(signaux).toEqual(["sortie_ecran", "copie", "taille"]);
    expect(signaux).not.toContain("plein_ecran");
  });

  it("annonce `plein_ecran` seulement une fois la demande ACCEPTÉE", async () => {
    let accepter: () => void = () => {};
    const promesse = new Promise<void>((r) => (accepter = r));
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = vi
      .fn()
      .mockReturnValue(promesse);

    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());

    // Demandé, pas encore accordé : la portée ne le revendique pas.
    expect(result.current.recolter()!.conditions.signaux_observables).not.toContain("plein_ecran");

    await act(async () => {
      accepter();
      await promesse;
    });
    expect(result.current.recolter()!.conditions.signaux_observables).toContain("plein_ecran");
  });

  it("un refus de plein écran n'arrête pas la passation — aucune barrière", async () => {
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = vi
      .fn()
      .mockRejectedValue(new Error("refusé"));
    const { result } = renderHook(() => useObservationPassation());
    await act(async () => {
      result.current.demarrer();
    });
    expect(result.current.recolter()).not.toBeNull();
  });
});

describe("un geste, une sortie d'écran", () => {
  it("🔴 `visibilitychange` puis `blur` du même geste ne comptent QU'UNE fois", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());

    masquerLOnglet();
    avancer(100); // dans la fenêtre anti-doublon de 500 ms
    window.dispatchEvent(new Event("blur"));

    expect(result.current.recolter()!.conditions.sorties_ecran).toBe(1);
  });

  it("deux gestes séparés comptent deux fois", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());

    window.dispatchEvent(new Event("blur"));
    avancer(600); // au-delà de la fenêtre
    window.dispatchEvent(new Event("blur"));

    expect(result.current.recolter()!.conditions.sorties_ecran).toBe(2);
  });

  it("un onglet REVENU visible ne compte pas — seule la sortie compte", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(result.current.recolter()!.conditions.sorties_ecran).toBe(0);
  });
});

describe("le rythme et la copie", () => {
  it("mesure le délai depuis la réponse PRÉCÉDENTE, jamais un horodatage", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());

    avancer(3000);
    act(() => result.current.noterReponse(1));
    avancer(800);
    act(() => result.current.noterReponse(2));

    const parQuestion = result.current.recolter()!.parQuestion;
    expect(parQuestion.get(1)!.ms_depuis_precedente).toBe(3000);
    expect(parQuestion.get(2)!.ms_depuis_precedente).toBe(800);
  });

  it("un changement d'avis écrase — c'est le délai avant la réponse FINALE qui compte", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    avancer(5000);
    act(() => result.current.noterReponse(1));
    avancer(200);
    act(() => result.current.noterReponse(1));
    expect(result.current.recolter()!.parQuestion.get(1)!.ms_depuis_precedente).toBe(200);
  });

  it("localise une copie dans le bloc de sa question", () => {
    const bloc = poserQuestion(7);
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    copierDans(bloc);
    expect(result.current.recolter()!.parQuestion.get(7)!.enonce_copie).toBe(true);
  });

  it("🔴 IGNORE une copie qu'elle ne peut pas localiser — pas de rattachement fabriqué", () => {
    const dehors = document.createElement("p");
    document.body.appendChild(dehors);
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    copierDans(dehors);
    expect(result.current.recolter()!.parQuestion.size).toBe(0);
  });

  it("une question copiée mais jamais répondue porte quand même son drapeau", () => {
    const bloc = poserQuestion(4);
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    copierDans(bloc);
    const signaux = result.current.recolter()!.parQuestion.get(4)!;
    expect(signaux).toEqual({ ms_depuis_precedente: 0, enonce_copie: true });
  });
});

describe("terminer() éteint réellement l'observation", () => {
  it("🔴 après `terminer()`, `recolter()` rend null", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    act(() => result.current.terminer());
    expect(result.current.recolter()).toBeNull();
  });

  it("🔴 après `terminer()`, plus aucune sortie d'écran n'est comptée", () => {
    // Sans ça, les faits d'une passation contamineraient la suivante.
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    act(() => result.current.terminer());

    window.dispatchEvent(new Event("blur"));
    avancer(600);
    masquerLOnglet();

    act(() => result.current.demarrer());
    expect(result.current.recolter()!.conditions.sorties_ecran).toBe(0);
  });

  it("un `demarrer()` remet tous les compteurs à zéro", () => {
    const bloc = poserQuestion(1);
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    window.dispatchEvent(new Event("blur"));
    act(() => result.current.noterReponse(1));
    copierDans(bloc);

    avancer(600);
    act(() => result.current.demarrer());

    const recolte = result.current.recolter()!;
    expect(recolte.conditions.sorties_ecran).toBe(0);
    expect(recolte.parQuestion.size).toBe(0);
    expect(recolte.conditions.plein_ecran_quitte).toBe(false);
    expect(recolte.conditions.taille_changee).toBe(false);
  });

  it("sort du plein écran s'il y était, et ne lève pas s'il n'y était pas", () => {
    const sortir = vi.fn().mockResolvedValue(undefined);
    (document as unknown as Record<string, unknown>).exitFullscreen = sortir;
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });

    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    act(() => result.current.terminer());
    expect(sortir).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    expect(() => act(() => result.current.terminer())).not.toThrow();
    expect(sortir).toHaveBeenCalledTimes(1);
  });
});

describe("une récolte ne referme pas l'œil du plein écran", () => {
  /** Passe en plein écran accordé, observation démarrée. */
  async function enPleinEcran() {
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = vi
      .fn()
      .mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    const rendu = renderHook(() => useObservationPassation());
    await act(async () => {
      rendu.result.current.demarrer();
    });
    return rendu;
  }

  function quitterLePleinEcran(): void {
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    document.dispatchEvent(new Event("fullscreenchange"));
  }

  it("🔴 après un envoi qui ÉCHOUE, une sortie de plein écran compte encore", async () => {
    // Le défaut réel du 2026-08-16 : `recolter()` posait un drapeau `enCoursDeSoumission` que
    // RIEN ne remettait à false. Sur un envoi raté l'écran de passation reste — c'est voulu, et
    // `DiagnosticPage` le teste — donc l'observation continue de courir. Mais `plein_ecran_quitte`
    // était devenu inenregistrable pour tout le reste de la passation : muet à l'écran, muet dans
    // le résultat, et FAUX dans la seule donnée que l'ADR-0048 tiendra pour un fait.
    const { result } = await enPleinEcran();

    result.current.recolter(); // la soumission part…
    // …et échoue : aucun `terminer()`, la passation continue.
    quitterLePleinEcran();

    expect(result.current.recolter()!.conditions.plein_ecran_quitte).toBe(true);
  });

  it("la sortie que `terminer()` provoque lui-même ne compte pas", async () => {
    // Contre-épreuve de la précédente : en retirant le drapeau, on ne doit pas se remettre à
    // compter la sortie que l'APPLICATION déclenche en rangeant l'écran. `terminer()` pose
    // `actif = false` avant d'appeler `exitFullscreen()`, et l'événement arrive après.
    (document as unknown as Record<string, unknown>).exitFullscreen = vi
      .fn()
      .mockResolvedValue(undefined);
    const { result } = await enPleinEcran();

    const avant = result.current.recolter()!.conditions.plein_ecran_quitte;
    act(() => result.current.terminer());
    quitterLePleinEcran(); // l'événement que l'app vient de provoquer

    expect(avant).toBe(false);
    // L'observation est éteinte : plus rien à récolter, et rien n'a été compté au passage.
    expect(result.current.recolter()).toBeNull();
    act(() => result.current.demarrer());
    expect(result.current.recolter()!.conditions.plein_ecran_quitte).toBe(false);
  });
});

describe("le démontage ne laisse rien derrière", () => {
  it("🔴 retire ses écouteurs — en StrictMode le montage est joué deux fois", () => {
    const { result, unmount } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    const recolterApres = result.current.recolter;
    unmount();

    window.dispatchEvent(new Event("blur"));
    avancer(600);
    window.dispatchEvent(new Event("blur"));

    // Le hook démonté ne doit plus rien avoir compté.
    expect(recolterApres()!.conditions.sorties_ecran).toBe(0);
  });

  it("deux instances montées ensemble ne comptent pas l'une pour l'autre", () => {
    const a = renderHook(() => useObservationPassation());
    const b = renderHook(() => useObservationPassation());
    act(() => a.result.current.demarrer());
    // `b` n'a jamais démarré : l'événement ne doit rien lui faire.
    window.dispatchEvent(new Event("blur"));
    expect(a.result.current.recolter()!.conditions.sorties_ecran).toBe(1);
    expect(b.result.current.recolter()).toBeNull();
  });
});

describe("les durées sont des durées", () => {
  it("`ms_total` part du démarrage, pas du montage", () => {
    const { result } = renderHook(() => useObservationPassation());
    avancer(10_000); // le composant vit avant que Massimo ne clique
    act(() => result.current.demarrer());
    avancer(4321);
    expect(result.current.recolter()!.conditions.ms_total).toBe(4321);
  });

  it("🔴 n'émet aucun horodatage absolu — que des nombres de millisecondes", () => {
    const { result } = renderHook(() => useObservationPassation());
    act(() => result.current.demarrer());
    avancer(1500);
    act(() => result.current.noterReponse(1));

    const { conditions, parQuestion } = result.current.recolter()!;
    const valeurs = [
      conditions.ms_total,
      ...[...parQuestion.values()].map((s) => s.ms_depuis_precedente),
    ];
    for (const v of valeurs) {
      expect(Number.isInteger(v)).toBe(true);
      // Un horodatage epoch en ms dépasse 1e12 ; une durée de passation, jamais.
      expect(v).toBeLessThan(1e10);
    }
  });
});
