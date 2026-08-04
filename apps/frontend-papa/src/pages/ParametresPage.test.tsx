import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Autonomy, type AutonomyClass, type AutonomyLevel } from "@zetis/types";

import { ParametresPage } from "./ParametresPage";

vi.mock("../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/settings")>()),
  fetchAutonomy: vi.fn(),
  saveAutonomy: vi.fn(),
}));
import {
  AUTONOMY_CHANGED_EVENT,
  PRESET_LABEL,
  fetchAutonomy,
  saveAutonomy,
} from "../lib/settings";

const A0A = "zetis_autonomy_a0a_derives";
const A1 = "zetis_autonomy_a1_course";

function cls(
  key: string,
  code: string,
  label: string,
  value: AutonomyLevel,
  choices: AutonomyLevel[],
  reason: string | null = null,
): AutonomyClass {
  return { key, code, label, value, choices, locked: choices.length === 1, reason };
}

/** Le régime rendu par le serveur. ⚠️ `A1` y est encore verrouillé avec son motif « phase 1 » :
 *  ces fixtures décrivent un serveur d'AVANT le Journal, et c'est délibéré — le front n'a aucune
 *  liste en dur, il doit rendre ce que le serveur envoie, quel qu'il soit. */
function autonomy(overrides: Partial<Autonomy> = {}): Autonomy {
  return {
    // Le déclencheur automatique est DÉSARMÉ par défaut (ADR-0035 §5).
    auto_trigger_enabled: false,
    classes: [
      cls(A0A, "A0a", "Dérivés inertes", 3, [2, 3]),
      cls(
        "zetis_autonomy_a0b_cards",
        "A0b",
        "Cartes de révision",
        3,
        [3],
        "Aucune étape de validation n'existe pour les cartes de révision.",
      ),
      cls(
        A1,
        "A1",
        "Rédaction de cours",
        2,
        [2],
        "« ZETIS sert » sera disponible avec le Journal — sans lui, le retrait n'existe pas.",
      ),
      cls("zetis_autonomy_a2_curriculum", "A2", "Programme", 1, [1], "Redessine la carte."),
      cls("zetis_autonomy_a3_missions", "A3", "Création de missions", 2, [2], "Élire ≠ créer."),
      cls("zetis_autonomy_a4_terminal", "A4", "Supprimer, archiver", 0, [0], "Définitif."),
    ],
    preset: "semi",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ParametresPage />
    </MemoryRouter>,
  );
}

async function renderLoaded() {
  const view = renderPage();
  await screen.findByText("Régime");
  return view;
}

beforeEach(() => {
  vi.mocked(fetchAutonomy).mockResolvedValue(autonomy());
  // Le faux serveur ÉCHOTE le déclencheur : un mock qui rendrait toujours `false` ferait passer
  // un front qui ignore la case.
  vi.mocked(saveAutonomy).mockImplementation(async (values, autoTrigger) => {
    const base = autonomy();
    return {
      ...base,
      auto_trigger_enabled: autoTrigger ?? base.auto_trigger_enabled,
      classes: base.classes.map((c) =>
        values[c.key] !== undefined ? { ...c, value: values[c.key] } : c,
      ),
    };
  });
});

describe("ParametresPage", () => {
  it("test-verrou : toute commande est branchée, ou verrouillée AVEC son motif", async () => {
    // Remplace (et durcit) le verrou du 2026-08-02 « aucune commande qui ne fait rien », qui
    // interdisait tout bouton. Son intention n'était pas « aucune commande » mais « aucune
    // commande SANS EFFET » — la page engage désormais l'autonomie de ZETIS, elle a des
    // commandes, et chacune doit prouver qu'elle sert à quelque chose.
    await renderLoaded();
    fireEvent.click(screen.getByText("Détail par type de contenu"));

    for (const button of screen.getAllByRole("button")) {
      if ((button as HTMLButtonElement).disabled) {
        expect(button.getAttribute("title") ?? "").not.toBe("");
        continue;
      }
      const before = document.body.innerHTML;
      fireEvent.click(button);
      const changed = document.body.innerHTML !== before;
      expect(
        changed || vi.mocked(saveAutonomy).mock.calls.length > 0,
        `« ${button.textContent?.trim()} » ne fait rien`,
      ).toBe(true);
    }
  });

  it("ne propose aucun fournisseur IA tiers (ADR-0008 : 100 % local)", async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).not.toMatch(/OpenAI|Fournisseur IA/i);
  });

  it("oriente vers le seul réglage qui vit ailleurs, sur la page où la décision se prend", async () => {
    await renderLoaded();
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda");
  });

  it("le régime Autonome est indisponible AVEC son motif — jamais absent", async () => {
    // Déplacement du verrou « indisponible avec son motif » : il vérifiait le placeholder de la
    // section, il vérifie maintenant le régime que le serveur refuse tant que le Journal n'existe
    // pas. Même doctrine, même exigence — une capacité absente se dit, elle ne s'escamote pas.
    await renderLoaded();
    const autonome = screen.getByRole("button", { name: new RegExp(PRESET_LABEL.autonome) });
    expect(autonome).toBeDisabled();
    expect(autonome).toHaveTextContent(/Journal/);
  });

  it("montre où Papa en est AVANT de proposer de changer quoi que ce soit", async () => {
    const { container } = await renderLoaded();
    const text = container.textContent ?? "";
    expect(text).toContain("Où vous en êtes aujourd'hui");
    expect(text).toContain("2 contenus sur 33");
    // L'ordre est la décision : l'état des lieux précède le régime.
    expect(text.indexOf("Où vous en êtes")).toBeLessThan(text.indexOf("Régime"));
  });

  it("n'affiche AUCUN total de provenance (§F.2 — un fait, jamais un reproche)", async () => {
    const { container } = await renderLoaded();
    // Le seul chiffre de la page est celui de l'observation, daté. Pas de « N en attente »,
    // pas de ratio, pas de pourcentage de délégation.
    expect(container.textContent).not.toMatch(/\d+\s*%/);
    expect(container.textContent).not.toMatch(/en attente de (relecture|validation)/i);
  });

  it("le front n'a aucune liste de paliers en dur : il rend ce que le serveur envoie", async () => {
    // A0a arrive avec un seul choix → la ligne devient un cadenas, sans qu'une ligne du front
    // change. C'est ce qui permettra au serveur de rouvrir A1 le jour du Journal.
    vi.mocked(fetchAutonomy).mockResolvedValue(
      autonomy({
        classes: autonomy().classes.map((c) =>
          c.key === A0A ? { ...c, choices: [3], locked: true, reason: "Verrouillé par le serveur." } : c,
        ),
      }),
    );
    await renderLoaded();
    fireEvent.click(screen.getByText("Détail par type de contenu"));

    const row = screen.getByRole("group", { name: "Dérivés inertes" });
    expect(within(row).queryByRole("button")).toBeNull();
    expect(row.textContent).toContain("Verrouillé par le serveur.");
  });

  it("n'enregistre rien sans geste explicite, et « Annuler » revient à l'état serveur", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByText("Détail par type de contenu"));

    fireEvent.click(screen.getByRole("button", { name: "Vous validez" }));
    expect(saveAutonomy).not.toHaveBeenCalled(); // aucun auto-save

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.semi) })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.manuel) }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(saveAutonomy).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveAutonomy).mock.calls[0][0][A0A]).toBe(2);
  });

  it("un refus du serveur est relayé tel quel, et le brouillon refusé disparaît", async () => {
    // Un brouillon refusé qui resterait à l'écran laisserait croire qu'il est actif.
    vi.mocked(saveAutonomy).mockRejectedValue(new Error("Définitif. Aucun réglage ne l'ouvrira."));
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.manuel) }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Définitif. Aucun réglage ne l'ouvrira.");
    expect(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.semi) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("🔒 un enregistrement RÉUSSI prévient la sidebar, une fois (addendum §7.4)", async () => {
    const heard = vi.fn();
    window.addEventListener(AUTONOMY_CHANGED_EVENT, heard);
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.manuel) }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    window.removeEventListener(AUTONOMY_CHANGED_EVENT, heard);
  });

  it("🔒 un enregistrement REFUSÉ n'émet RIEN — un refus ne change pas d'état", async () => {
    // Le piège : émettre depuis le `.finally`, qui passe aussi après un refus. La sidebar
    // relirait alors pour apprendre que rien n'a bougé — un appel de plus sans fait de plus.
    vi.mocked(saveAutonomy).mockRejectedValue(new Error("Définitif. Aucun réglage ne l'ouvrira."));
    const heard = vi.fn();
    window.addEventListener(AUTONOMY_CHANGED_EVENT, heard);
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.manuel) }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Définitif. Aucun réglage ne l'ouvrira.");
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener(AUTONOMY_CHANGED_EVENT, heard);
  });

  it("à l'erreur de lecture, aucun réglage n'est affiché — pas de défaut inventé", async () => {
    vi.mocked(fetchAutonomy).mockRejectedValue(new Error("réseau"));
    renderPage();

    await screen.findByText(/Réglages illisibles/);
    expect(screen.queryByText("Régime")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  describe("quand le serveur rouvre le palier 3 du cours (après le Journal)", () => {
    beforeEach(() => {
      vi.mocked(fetchAutonomy).mockResolvedValue(
        autonomy({
          classes: autonomy().classes.map((c) =>
            c.key === A1 ? { ...c, choices: [2, 3], locked: false, reason: null } : c,
          ),
        }),
      );
    });

    it("le passage du cours en « ZETIS sert » demande une confirmation explicite", async () => {
      await renderLoaded();
      fireEvent.click(screen.getByText("Détail par type de contenu"));

      const row = screen.getByRole("group", { name: "Rédaction de cours" });
      fireEvent.click(within(row).getByRole("button", { name: "ZETIS sert" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Vous retirez le dernier contrôle humain");
      expect(dialog).toHaveTextContent(/ça ne retire pas ce qui est déjà servi/);

      fireEvent.click(screen.getByRole("button", { name: "Garder mon contrôle" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(within(row).getByRole("button", { name: "Vous validez" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("confirmer applique la monotonie : servir un cours force les dérivés", async () => {
      await renderLoaded();
      fireEvent.click(screen.getByText("Détail par type de contenu"));
      const derives = screen.getByRole("group", { name: "Dérivés inertes" });
      fireEvent.click(within(derives).getByRole("button", { name: "Vous validez" }));

      const cours = screen.getByRole("group", { name: "Rédaction de cours" });
      fireEvent.click(within(cours).getByRole("button", { name: "ZETIS sert" }));
      fireEvent.click(await screen.findByRole("button", { name: /laisser ZETIS servir/ }));

      await waitFor(() =>
        expect(within(derives).getByRole("button", { name: "ZETIS sert" })).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
      );
      expect(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.autonome) })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("le retour au contrôle n'a AUCUNE friction", async () => {
      await renderLoaded();
      fireEvent.click(screen.getByText("Détail par type de contenu"));
      const cours = screen.getByRole("group", { name: "Rédaction de cours" });

      fireEvent.click(within(cours).getByRole("button", { name: "ZETIS sert" }));
      fireEvent.click(await screen.findByRole("button", { name: /laisser ZETIS servir/ }));
      await waitFor(() =>
        expect(within(cours).getByRole("button", { name: "ZETIS sert" })).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
      );

      fireEvent.click(within(cours).getByRole("button", { name: "Vous validez" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  // --- Le déclencheur automatique (ADR-0035 §5) -----------------------------------------------

  describe("ZETIS peut démarrer sans vous", () => {
    it("rend l'état du serveur, désarmé par défaut", async () => {
      await renderLoaded();
      expect(screen.getByLabelText("Laisser ZETIS démarrer seul")).not.toBeChecked();
    });

    it("⚠️ un préréglage ne touche le déclencheur DANS AUCUN SENS", async () => {
      // Verrou de DOCTRINE — deux questions, deux sources. Le palier dit si ZETIS peut SERVIR
      // sans relecture ; la case dit s'il peut DÉMARRER sans clic. Le jour où quelqu'un les
      // fusionnera, ce test tombera, et c'est exactement ce qu'on lui demande.
      //
      // ⚠️ On part ARMÉ : une version qui vérifiait « toujours décoché » depuis un état décoché
      // passait trivialement. Ici, un préréglage qui remettrait l'état à son défaut est attrapé.
      vi.mocked(fetchAutonomy).mockResolvedValue(autonomy({ auto_trigger_enabled: true }));
      await renderLoaded();
      const box = screen.getByLabelText("Laisser ZETIS démarrer seul");
      expect(box).toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.manuel) }));
      expect(box).toBeChecked();

      // …et dans l'autre sens : décocher ne change aucun palier.
      fireEvent.click(box);
      expect(screen.getByRole("button", { name: new RegExp(PRESET_LABEL.manuel) })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("la case part dans SON champ, jamais dans les paliers", async () => {
      await renderLoaded();
      fireEvent.click(screen.getByLabelText("Laisser ZETIS démarrer seul"));

      const save = screen.getByRole("button", { name: "Enregistrer" });
      expect(save).toBeEnabled();
      fireEvent.click(save);

      await waitFor(() => expect(saveAutonomy).toHaveBeenCalled());
      const [values, autoTrigger] = vi.mocked(saveAutonomy).mock.calls.at(-1)!;
      expect(autoTrigger).toBe(true);
      // Aucune clé de palier n'a bougé : cocher la case ne touche pas les six.
      expect(values).toEqual(
        Object.fromEntries(autonomy().classes.map((c) => [c.key, c.value])),
      );
    });
  });

  // Passe visuelle du 2026-08-04 (addendum §7.2ter) : la page et la sidebar parlent la même
  // langue. C'est ICI qu'on choisit un régime — c'est ici que son visage doit être celui qu'on
  // verra ensuite en tête de colonne.
  describe("la grammaire visuelle des régimes", () => {
    it("🔒 chaque carte porte l'AVATAR de son régime, pas un emoji", async () => {
      const { container } = await renderLoaded();

      for (const [preset, fichier] of [
        ["manuel", "zetis-regime-manuel"],
        ["semi", "zetis-regime-semi"],
        ["autonome", "zetis-regime-autonome"],
      ] as const) {
        const carte = screen.getByRole("button", { name: new RegExp(PRESET_LABEL[preset]) });
        expect(carte.querySelector("img")?.getAttribute("src")).toContain(fichier);
      }
      // Décoratifs : le libellé est juste à côté, un `alt` non vide le doublerait.
      expect(container.querySelector("img[alt]:not([alt=''])")).toBeNull();
    });

    it("🔒 les cartes ne RESPIRENT pas — le halo est la grammaire de la sidebar", async () => {
      // Trois cartes qui pulseraient en même temps seraient une fête foraine. Le halo n'a de sens
      // que là où il n'y en a qu'un, et où il signale l'état COURANT.
      const { container } = await renderLoaded();
      expect(container.querySelector(".regime-halo")).toBeNull();
      expect(container.querySelector(".regime-orbit")).toBeNull();
    });

    it("🔒 le titre du panneau ne porte plus de ⚡ — le glyphe VEUT DIRE quelque chose", async () => {
      // Depuis l'addendum §7.1, ⚡ = « ZETIS démarre seul ». Le laisser décorer « Autonomie de
      // ZETIS » faisait lire une affirmation sur l'état à l'endroit même où l'état se règle.
      await renderLoaded();
      const titre = screen.getByRole("heading", { name: /Autonomie de ZETIS/ });
      expect(titre.textContent).not.toContain("⚡");
    });

    it("🔒 le glyphe du déclencheur SUIT la case, et c'est celui de la sidebar", async () => {
      const { container } = await renderLoaded();
      const bloc = screen.getByText("ZETIS peut démarrer sans vous").closest("div")!.parentElement!;
      const glyphe = () => bloc.querySelector("span[aria-hidden]")!.textContent;

      // Désarmé au départ (ADR-0035 §5) : le même ⏸ que la sidebar affiche.
      expect(glyphe()).toBe("⏸");

      fireEvent.click(screen.getByRole("checkbox", { name: /Laisser ZETIS démarrer seul/ }));
      expect(glyphe()).toBe("⚡");

      // Et l'ambre reste interdite ici : c'est la couleur des files de validation (ADR-0030 §6).
      expect(container.innerHTML).not.toMatch(/amber-/);
    });
  });
});
