// « Prendre de l'avance » — la troisième question de l'agenda (ADR-0025 Amdt 9).
//
// 🔴 **Ce fichier garde deux choses, et la seconde est la plus fragile.**
// 1. Le bloc RÉPOND toujours — même sans échéance, même sans geste.
// 2. Le bloc ne porte AUCUN nombre. C'est la frontière que le §7 défend, et elle est facile à
//    franchir sans y penser : « 3 cartes à revoir » est une phrase parfaitement naturelle, et
//    c'est un compteur d'arriéré.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type AgendaAhead } from "@zetis/types";
import { AheadBlock } from "./AheadBlock";

const ANCRE: AgendaAhead["anchor"] = {
  item_id: 7,
  label: "Contrôle sur les fractions",
  kind: "controle",
  due_on: "2026-08-21",
  subject: { id: 1, slug: "mathematiques", name: "Mathématiques", color: "#60a5fa" },
  chapter_id: 4,
  lesson_id: null,
};

function bloc(ahead: AgendaAhead, onOpenNotion = vi.fn(), onOpenDay = vi.fn()) {
  return render(
    <MemoryRouter>
      <AheadBlock ahead={ahead} onOpenNotion={onOpenNotion} onOpenDay={onOpenDay} />
    </MemoryRouter>,
  );
}

describe("AheadBlock", () => {
  it("🔴 répond même sans échéance et sans geste — il ne disparaît pas", () => {
    // Un bloc qui s'évapore se lit comme une panne. Le dépôt a déjà tranché deux fois dans ce
    // sens : le panneau du jour (addendum §17) puis le toast (§D15).
    const { container } = bloc({ anchor: null, gestes: [] });
    expect(container.textContent).toMatch(/Rien à préparer pour l'instant/i);
    // ⚠️ Et ce n'est PAS un réceptacle (§B1) : aucune case en attente, aucune porte inerte.
    expect(container.querySelectorAll("a, button")).toHaveLength(0);
  });

  it("l'ancre NOMME son jour, elle ne le décompte jamais", () => {
    // 🔴 §D8 avait retiré « Ce qui arrive » entre autres parce que `days_left` était « le dernier
    // décompte chiffré de la page ». Le réintroduire ici viderait ce motif tout en gardant la
    // révocation — le pire des deux.
    const { container } = bloc({ anchor: ANCRE, gestes: [] });
    expect(container.textContent).toMatch(/Contrôle sur les fractions/);
    expect(container.textContent).toMatch(/vendredi 21 août/i);
    expect(container.textContent).not.toMatch(/dans \d+ jour/i);
    expect(container.textContent).not.toMatch(/J-\d/);
  });

  it("🔴 VERROU — aucun nombre, nulle part", () => {
    const { container } = bloc({
      anchor: ANCRE,
      gestes: [
        { kind: "revision", detail: null, mindmap_id: null, skill_id: null },
        { kind: "mindmap", detail: "Les fractions", mindmap_id: 3, skill_id: null },
        { kind: "mission", detail: "Reprendre les fractions", mindmap_id: null, skill_id: null },
        { kind: "renforcer", detail: "Division de fractions", mindmap_id: null, skill_id: 12 },
      ],
    });
    // Le seul chiffre toléré est celui du QUANTIÈME de l'ancre (« 21 août ») : c'est une date
    // subie, pas une mesure. Tout le reste du texte doit être exempt de nombres.
    const sansAncre = container.textContent!.replace(/vendredi 21 août/i, "");
    expect(sansAncre).not.toMatch(/\d/);
  });

  it("le vocabulaire reste celui du CLAUDE.md — « renforcer », jamais « lacune »", () => {
    const { container } = bloc({
      anchor: ANCRE,
      gestes: [{ kind: "renforcer", detail: "Division de fractions", mindmap_id: null, skill_id: 12 }],
    });
    expect(container.textContent).toMatch(/Renforce une notion/i);
    for (const interdit of [/lacune/i, /faibless/i, /point faible/i, /échec/i, /nul/i, /retard/i]) {
      expect(container.textContent).not.toMatch(interdit);
    }
  });

  it("« renforcer » ouvre la panoplie EN PLACE, il ne navigue pas", () => {
    // Même geste et même destination que les notions travaillées du panneau (§D10) : une seule
    // mécanique à apprendre, pas deux.
    const onOpenNotion = vi.fn();
    bloc(
      {
        anchor: ANCRE,
        gestes: [{ kind: "renforcer", detail: "Division", mindmap_id: null, skill_id: 12 }],
      },
      onOpenNotion,
    );
    screen.getByRole("button").click();
    expect(onOpenNotion).toHaveBeenCalledWith(12);
  });

  it("« suis ton plan » ouvre le JOUR de l'ancre — le plan y vit déjà", () => {
    const onOpenDay = vi.fn();
    bloc(
      { anchor: ANCRE, gestes: [{ kind: "plan", detail: null, mindmap_id: null, skill_id: null }] },
      vi.fn(),
      onOpenDay,
    );
    screen.getByRole("button").click();
    expect(onOpenDay).toHaveBeenCalledWith("2026-08-21");
  });

  it("la mindmap mène à SA carte en reconstruction, pas à la liste", () => {
    bloc({
      anchor: ANCRE,
      gestes: [{ kind: "mindmap", detail: "Les fractions", mindmap_id: 3, skill_id: null }],
    });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/mindmaps/reconstruire/3");
  });

  it("la révision mène au deck DE LA MATIÈRE de l'ancre", () => {
    // La destination vient de `subjectRouteFor`, la table de routage du produit — jamais d'un
    // chemin recopié ici. Un second jeu de routes divergerait au premier correctif.
    bloc({
      anchor: ANCRE,
      gestes: [{ kind: "revision", detail: null, mindmap_id: null, skill_id: null }],
    });
    expect(screen.getByRole("link").getAttribute("href")).toMatch(/^\/revision\?subject=mathematiques/);
  });

  it("🔴 aucune affordance morte : un geste sans destination ne rend rien", () => {
    // §B6 — *« un bouton mort se lit comme une panne »*. Le serveur ne devrait jamais servir ça ;
    // ce garde-fou est la seconde barrière, et il doit exister quand même.
    const { container } = bloc({
      anchor: null,
      gestes: [{ kind: "renforcer", detail: null, mindmap_id: null, skill_id: null }],
    });
    expect(container.querySelectorAll("a, button")).toHaveLength(0);
  });

  it("la teinte du liseré est celle de la MATIÈRE, jamais celle d'un état", () => {
    // Doctrine des cinq canaux (§D3) : la teinte porte la matière, et rien d'autre. Un liseré
    // ambre ou rouge ici dirait « urgent » — ce serait une jauge d'urgence, interdite au §6.
    const { container } = bloc({ anchor: ANCRE, gestes: [] });
    const carte = container.querySelector("[style*='border-left']") as HTMLElement;
    // ⚠️ jsdom NORMALISE les couleurs en `rgb()` : comparer au hexadécimal source échoue.
    expect(carte.style.borderLeft).toBe("3px solid rgb(96, 165, 250)");
    // Et surtout : jamais l'ambre du rattrapage ni un rouge quelconque.
    expect(carte.style.borderLeft).not.toMatch(/251, ?191, ?36|rgb\(2[0-5]\d, ?\d{1,2}, ?\d{1,2}\)/);
  });

  it("un geste porte sa précision quand il en a une, un défaut sinon", () => {
    const { container } = bloc({
      anchor: ANCRE,
      gestes: [
        { kind: "mindmap", detail: "Les fractions", mindmap_id: 3, skill_id: null },
        { kind: "revision", detail: null, mindmap_id: null, skill_id: null },
      ],
    });
    const portes = within(container).getAllByRole("link");
    expect(portes[0].textContent).toMatch(/Les fractions/);
    expect(portes[1].textContent).toMatch(/de ce chapitre/);
  });

  it("🔴 sans ancre, aucun geste ne parle « de ce chapitre » — il n'y en a pas", () => {
    // Défaut vu à l'écran le 2026-08-17, dans le premier rendu réel : sans échéance à venir, le
    // bloc annonçait « Revois tes cartes — de ce chapitre » alors qu'aucun chapitre n'était nommé
    // nulle part. Une phrase qui désigne un contexte absent est pire que pas de phrase : elle
    // envoie chercher quelque chose qui n'existe pas.
    const { container } = bloc({
      anchor: null,
      gestes: [
        { kind: "revision", detail: null, mindmap_id: null, skill_id: null },
        { kind: "mindmap", detail: null, mindmap_id: null, skill_id: null },
      ],
    });
    for (const deictique of [/ce chapitre/i, /cette notion/i, /cette échéance/i]) {
      expect(container.textContent).not.toMatch(deictique);
    }
  });
});
