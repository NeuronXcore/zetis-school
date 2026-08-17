import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AgendaItemStudent } from "@zetis/types";

// Les TROIS REGISTRES de l'agenda (ADR-0025 Amdt 9 §D1, §D7).
//
// 🔴 **Ce fichier verrouille l'ORDRE, et l'ordre est la décision.** La première section est celle
// que Massimo voit en ouvrant la page. Il a été présent → passé → futur pendant une heure, le
// 2026-08-17, et c'était mesurablement faux : la section du futur commençait à 1050 px dans une
// fenêtre de 856, entièrement sous la ligne de flottaison. Une réponse qu'il faut chercher n'en
// est pas une.
//
// ⚠️ `AgendaPage.test.tsx` n'existait pas — le §I-8 de l'Amendement 8 nommait ce trou de
// couverture « exactement sous la refonte ». Ce fichier en couvre la moitié qui porte une
// décision de produit.

vi.mock("@zetis/auth", async (orig) => ({
  ...(await orig<typeof import("@zetis/auth")>()),
  useAuth: () => ({ user: { username: "massimo" } }),
}));

const agenda = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../hooks/useAgenda", () => ({ useAgenda: () => agenda.value }));

import { AgendaPage } from "./AgendaPage";

function item(over: Partial<AgendaItemStudent> = {}): AgendaItemStudent {
  return {
    id: 1,
    label: "Exercices 12 à 18",
    subject: { id: 1, slug: "mathematiques", name: "Mathématiques", color: "#60a5fa" },
    due_on: "2026-08-17",
    kind: "devoir",
    done: false,
    created_by: "parent",
    edited_by_parent: false,
    lesson_id: null,
    chapter_id: null,
    revisable_cards: 0,
    ...over,
  };
}

function page(over: Record<string, unknown> = {}) {
  agenda.value = {
    week: { days: [] },
    month: null,
    view: "bande",
    setView: vi.fn(),
    goToMonth: vi.fn(),
    dayTraces: [],
    openDay: vi.fn(),
    pickedDay: null,
    items: [],
    ahead: {
      anchor: null,
      gestes: [{ kind: "revision", detail: null, mindmap_id: null, skill_id: null }],
    },
    sections: {
      today: [item()],
      // ⚠️ **Une échéance à demain, et ce n'est pas décoratif** : depuis le §D11, une section
      // « Demain » VIDE ne se rend plus. Un jeu de données sans elle ne pourrait plus vérifier
      // l'ordre des quatre sections — il testerait l'ordre de trois en croyant en tester quatre.
      tomorrow: [item({ id: 4, due_on: "2026-08-18", label: "Lecture chapitre 3" })],
      later: [],
      resume: [item({ id: 2, due_on: "2026-08-11" })],
    },
    planByItem: {},
    loading: false,
    today: new Date("2026-08-17T09:00:00"),
    toggleDone: vi.fn(),
    toggleStep: vi.fn(),
    dismiss: vi.fn(),
    undoable: null,
    undoDismiss: vi.fn(),
    // Le contrat du hook a grandi (§D12) : sans ces deux clés, la page rendait un toast sur une
    // valeur `undefined`. Le défaut était dans le COMPOSANT, pas dans le jeu de données — corrigé
    // là-bas ; ces clés décrivent simplement l'état nominal « aucune alerte ».
    lateAlert: null,
    markLateAlertSeen: vi.fn(),
    ...over,
  };
  return render(
    <MemoryRouter>
      <AgendaPage />
    </MemoryRouter>,
  );
}

describe("AgendaPage — les trois registres", () => {
  it("🔴 ORDRE : présent → futur → passé, et « À reprendre » est en DERNIER", () => {
    const { container } = page();
    const registres = [...container.querySelectorAll("section[data-registre]")].map((s) =>
      s.getAttribute("data-registre"),
    );
    // « Aujourd'hui » et « Demain » sont deux sections d'un même registre.
    expect(registres).toEqual(["present", "present", "futur", "passe"]);
  });

  it("🔴 la page ne s'ouvre JAMAIS sur le retard", () => {
    // Le seul invariant qui survit à la révision d'ordre du 2026-08-17 : quel que soit le reste,
    // la première section n'est pas celle du rattrapage. Une page qui s'ouvre sur ce qui manque
    // est une page qu'on évite — c'est le motif qui avait fait retirer la série (2026-07-27).
    const { container } = page();
    expect(container.querySelector("section[data-registre]")!.getAttribute("data-registre")).toBe(
      "present",
    );
  });

  it("les trois registres portent TROIS teintes distinctes, et aucune n'est rouge", () => {
    const { container } = page();
    const teintes = new Map<string, string>();
    for (const section of container.querySelectorAll("section[data-registre]")) {
      const rail = section.querySelector("p") as HTMLElement;
      teintes.set(section.getAttribute("data-registre")!, rail.style.borderColor);
    }
    expect(teintes.size).toBe(3);
    expect(new Set(teintes.values()).size).toBe(3);
    for (const teinte of teintes.values()) {
      expect(teinte).not.toBe("");
      // 🔴 Aucun rouge, sur aucune surface de Massimo (§7, jamais révoqué). Un rouge est un canal
      // dont le vert et le bleu sont bas ; l'ambre et l'orange gardent un vert élevé.
      const [r, v] = (teinte.match(/\d+/g) ?? []).map(Number);
      if (r !== undefined && v !== undefined) expect(r > 200 && v < 90).toBe(false);
    }
  });

  it("les teintes sont celles du CALENDRIER, pas des couleurs neuves", () => {
    // C'est tout l'intérêt : les deux moitiés de la page disent la même chose avec le même code.
    // Recopier une teinte au lieu de la partager la ferait diverger au premier réglage.
    const { container } = page();
    const rail = (registre: string) =>
      (
        container.querySelector(`section[data-registre="${registre}"] p`) as HTMLElement
      ).style.borderColor.replace(/\s/g, "");
    expect(rail("futur")).toContain("251,146,60"); // CADRE_A_VENIR — les cellules à venir
    expect(rail("passe")).toContain("251,191,36"); // CADRE_EN_RETARD — les jours non faits
    expect(rail("present")).toContain("34,211,238"); // le cyan d'aujourd'hui
  });

  it("🔴 le registre du PASSÉ porte un badge « En retard », de la MÊME forme que celui du toast", () => {
    // Décision du commanditaire, 2026-08-17 : *« À reprendre = passé : replace par en RETARD dans
    // un badge »*. C'est la **quatrième** révocation du §7 dans le même sens en une journée (le
    // mot dans le toast §D17, l'ambre des cellules §D18, l'ordre §D1, ce titre §D9).
    //
    // 🔴 Ce que ce test garde vraiment : **une seule forme pour un seul sens**. Le toast dit déjà
    // « En retard » dans un badge ambre ; une seconde forme ici serait un second vocabulaire pour
    // la même chose. D'où l'assertion sur les classes du badge, et pas seulement sur le mot.
    const { container } = page();
    const titre = container.querySelector('section[data-registre="passe"] p')!;
    const badge = titre.querySelector("span")!;
    expect(badge.textContent).toBe("En retard");
    expect(badge.className).toMatch(/border-amber-400\/70/);
    expect(badge.className).toMatch(/bg-amber-400\/15/);
    expect(badge.className).toMatch(/text-amber-300/);
    // ⚠️ Un BADGE, pas un aplat : le fond ambre est celui du badge, jamais celui de la section.
    expect((titre.parentElement as HTMLElement).className).not.toMatch(/bg-amber/);
    // 🔴 Et toujours aucun ROUGE : c'est le MOT qui a changé de statut, pas la couleur.
    expect(container.innerHTML).not.toMatch(/text-red-|bg-red-|border-red-/);
  });

  it("les deux autres registres n'ont PAS de badge — un badge signale, il ne décore pas", () => {
    const { container } = page();
    for (const registre of ["present", "futur"]) {
      const titre = container.querySelector(`section[data-registre="${registre}"] p`)!;
      expect(titre.querySelector("span")).toBeNull();
    }
  });

  it("🔴 le badge RESPIRE — et la keyframe qu'il invoque EXISTE vraiment", () => {
    // Demande du commanditaire, 2026-08-17 : *« anime RETARD pour le mettre en evidence »*.
    //
    // 🔴 **Une classe d'animation ne prouve RIEN à elle seule** — leçon payée le jour même : le
    // fond dérivant du toast portait sa classe, sa keyframe existait, et la translation était
    // parallèle aux rayures, donc de déphasage NUL. Le test passait sur du mort.
    // Ici le mode de panne réaliste est plus simple et tout aussi silencieux : la keyframe
    // renommée ou supprimée dans `index.css`, la classe restant intacte. On vérifie donc
    // l'**appariement** — le nom invoqué par la classe est bien défini dans la feuille.
    //
    // ⚠️ jsdom n'exécute aucune animation : l'interpolation réelle a été mesurée dans le
    // navigateur (`getAnimations()` → `agenda-retard-badge`, `running`, 3000 ms ; fond
    // échantillonné à 0,20 → 0,28 → 0,20 sur 1,5 s).
    const { container } = page();
    const badge = container.querySelector('section[data-registre="passe"] p span')!;
    const nom = badge.className.match(/\[animation:([a-z0-9-]+)_/)?.[1];
    expect(nom).toBe("agenda-retard-badge");
    // `motion-safe:` OBLIGATOIRE : sous `prefers-reduced-motion`, rien ne bouge et le badge garde
    // son cadre et son fond. Le signal survit sans le mouvement — c'est un signal, pas un ornement.
    expect(badge.className).toMatch(/motion-safe:\[animation:/);
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    // ⚠️ **`\\b` NE SUFFIT PAS, et le sabotage l'a montré.** Ma première version cherchait
    // `@keyframes\\s+<nom>\\b` : renommée en `agenda-retard-badge-ancien`, la keyframe passait
    // encore, parce qu'un tiret EST une frontière de mot. Le test restait vert sur une animation
    // devenue introuvable — exactement la panne qu'il prétend garder.
    // Le nom d'une keyframe est suivi d'espaces puis d'une accolade : c'est ça qu'on ancre.
    expect(css).toMatch(new RegExp(`@keyframes\\s+${nom}\\s*\\{`));
  });

  it("🔴 « Demain » VIDE ne se rend pas — mais « Aujourd'hui » vide se rend TOUJOURS", () => {
    // Décision du commanditaire, 2026-08-17 : *« supprime la section Demain quand elle est
    // vide »*. Motif MESURÉ : ces 60 px étaient exactement ce qui manquait, en vue mois, pour que
    // « Prendre de l'avance » passe au-dessus de la ligne de flottaison (893 pour 856).
    //
    // 🔴 **L'ASYMÉTRIE EST LA DÉCISION, et c'est elle que ce test garde.** Sans lui, une session
    // future « harmonisera » les deux sections dans un sens ou dans l'autre, et le fera de bonne
    // foi. « Aujourd'hui » informe sur MAINTENANT — c'est ce que Massimo vient chercher ;
    // « Demain » vide ne faisait que répéter une cellule déjà vide dans le calendrier au-dessus.
    const { container } = page({
      sections: { today: [], tomorrow: [], later: [], resume: [] },
    });
    expect(container.textContent).toMatch(/Rien de noté pour aujourd'hui/i);
    expect(container.textContent).not.toMatch(/Rien de noté pour demain/i);
    const registres = [...container.querySelectorAll("section[data-registre]")].map((s) =>
      s.getAttribute("data-registre"),
    );
    // Un seul « present » : « Demain » a disparu, « Aujourd'hui » est restée.
    expect(registres.filter((r) => r === "present")).toHaveLength(1);
  });

  it("« Demain » revient dès qu'elle porte quelque chose", () => {
    const { container } = page({
      sections: {
        today: [],
        tomorrow: [item({ id: 3, due_on: "2026-08-18", label: "DM de SVT" })],
        later: [],
        resume: [],
      },
    });
    expect(container.textContent).toMatch(/DM de SVT/);
    expect(
      [...container.querySelectorAll("section[data-registre]")].filter(
        (s) => s.getAttribute("data-registre") === "present",
      ),
    ).toHaveLength(2);
  });
});
