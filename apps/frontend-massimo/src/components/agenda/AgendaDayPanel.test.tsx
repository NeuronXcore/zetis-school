// Le jour ouvert depuis la bande (addendum ADR-0025 §17).
//
// Le tap était muet sur un jour passé — et TOUS les jours passés sont dans ce cas, le serveur ne
// renvoyant jamais leurs échéances (§6). Des points de trace allumés sous un jour qui ne répond
// pas se lisent comme une panne. Ce panneau répond toujours.
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { type AgendaItemStudent, type AgendaTraceDetail } from "@zetis/types";
import { AgendaDayPanel } from "./AgendaDayPanel";

const HIER = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function item(over: Partial<AgendaItemStudent> = {}): AgendaItemStudent {
  return {
    id: 1,
    label: "Relire la leçon sur les fractions",
    subject: { id: 7, name: "Mathématiques", slug: "maths", color: null },
    due_on: HIER,
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

/** Une matière travaillée, telle que `/days/{date}/traces` la sert (Amdt 8 §D2). */
function trace(over: Partial<AgendaTraceDetail> = {}): AgendaTraceDetail {
  return {
    slug: "mathematiques",
    name: "Mathématiques",
    color: "#60a5fa",
    notions: [{ id: 1, name: "Théorème de Pythagore" }],
    forms: ["Cours lu", "Quiz"],
    ...over,
  };
}

function panneau(over: Partial<React.ComponentProps<typeof AgendaDayPanel>> = {}) {
  return render(
    <MemoryRouter>
      <AgendaDayPanel
        date={HIER}
        items={[]}
        traces={[]}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onDismiss={vi.fn()}
        {...over}
      />
    </MemoryRouter>,
  );
}

describe("AgendaDayPanel", () => {
  it("montre le travail d'un jour passé — c'est ce qui le rend rattrapable", () => {
    panneau({ items: [item()] });
    expect(screen.getByText("Relire la leçon sur les fractions")).toBeInTheDocument();
  });

  it("VERROU §17 — un jour SANS échéance ET SANS trace répond quand même", () => {
    // C'est le silence rencontré à l'écran le 2026-08-10 : des points verts allumés, et rien
    // au tap. Un jour qui montre quelque chose et ne répond pas se lit comme une panne.
    panneau({ items: [], traces: [] });
    expect(screen.getByText(/Rien de prévu ce jour-là/)).toBeInTheDocument();
  });

  it("🔴 VERROU Amdt 8 — un jour TRAVAILLÉ ne dit JAMAIS qu'il est vide", () => {
    // **Le défaut fondateur de l'Amendement 8.** Le samedi 15 août affichait « Rien à rendre ce
    // jour-là » en corps de panneau, puis se dédisait cinquante lignes plus bas, en plus petit,
    // avec « tu as travaillé 3 fois ». L'écran affirmait le vide et le démentait ensuite.
    const { container } = panneau({ items: [], traces: [trace()] });
    expect(container.textContent).not.toMatch(/Rien de prévu|Rien à rendre/);
  });

  it("dit ce qui a été fait : matière, notion, formes", () => {
    panneau({ items: [], traces: [trace()] });
    expect(screen.getByText("Mathématiques")).toBeInTheDocument();
    expect(screen.getByText("Théorème de Pythagore")).toBeInTheDocument();
    expect(screen.getByText("Cours lu · Quiz")).toBeInTheDocument();
  });

  it("🔴 chaque notion travaillée est une PORTE, pas du texte inerte (§D10)", () => {
    // Le bloc racontait à Massimo ce qu'il avait fait **sans lui laisser aucun moyen d'y
    // revenir** : un récit en cul-de-sac. La notion ouvre désormais sa panoplie réelle.
    const onOpenNotion = vi.fn();
    panneau({ items: [], traces: [trace()], onOpenNotion });
    fireEvent.click(screen.getByRole("button", { name: "Théorème de Pythagore" }));
    // L'`id` est passé, pas le nom : c'est lui qui résout la panoplie côté serveur.
    expect(onOpenNotion).toHaveBeenCalledWith(1);
  });

  it("🔴 VERROU Amdt 8 §D2 — le récit ne porte AUCUNE mesure", () => {
    // Le nombre ÉTAIT la phrase à tuer. Ce verrou garde la frontière côté rendu : ni « 3 fois »,
    // ni minutes, ni XP, ni score, ni total — quelle que soit la richesse des données servies.
    const { container } = panneau({
      items: [],
      traces: [trace(), trace({ slug: "svt", name: "SVT", notions: [], forms: ["Fiche de révision"] })],
    });
    expect(container.textContent).not.toMatch(/\d+\s*fois/);
    expect(container.textContent).not.toMatch(/minute|XP|points?\b|%/i);
    // Et surtout aucun compte de matières : « 2 matières » serait un total.
    expect(container.textContent).not.toMatch(/\d+\s*mati/i);
  });

  it("une matière SANS notion rend quand même sa ligne — la notion saute, pas la matière", () => {
    panneau({ items: [], traces: [trace({ notions: [], forms: ["Révision SRS"] })] });
    expect(screen.getByText("Mathématiques")).toBeInTheDocument();
    expect(screen.getByText("Révision SRS")).toBeInTheDocument();
    expect(screen.queryByText("Théorème de Pythagore")).not.toBeInTheDocument();
  });

  it("une activité SANS matière reste racontée, sans nom inventé", () => {
    // 1 jour travaillé sur 20 disparaissait quand ces activités étaient jetées (mesuré en base).
    // Elles restent — mais on ne leur invente pas un nom : les formes suffisent.
    const { container } = panneau({
      items: [],
      traces: [trace({ slug: null, name: null, color: null, notions: [], forms: ["Conversation avec ZETIS"] })],
    });
    expect(screen.getByText("Conversation avec ZETIS")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Autre|Inconnu|Sans matière/i);
  });

  it("VERROU §7 — aucune trace ne se rend : un jour sans donnée n'est pas un vide constaté", () => {
    const { container: futur } = panneau({ date: DEMAIN, items: [], traces: [] });
    expect(futur.textContent).not.toMatch(/tu as travaillé|Ce que tu as travaillé/);
  });

  it("🔴 le jour passé n'est plus un cul-de-sac : il porte une porte de sortie", () => {
    // Amdt 8 §D6-c. La destination est `/matieres`, une route JAMAIS vide — pas une session de
    // révision, qui peut ne servir aucune carte (ce serait le bouton mort du §14.6).
    panneau({ items: [], traces: [] });
    const porte = screen.getByRole("link", { name: /Reprendre une notion/ });
    expect(porte).toHaveAttribute("href", "/matieres");
  });

  it("un jour à VENIR ne propose pas de reprendre : il n'y a rien derrière", () => {
    panneau({ date: DEMAIN, items: [], traces: [] });
    expect(screen.queryByRole("link", { name: /Reprendre une notion/ })).not.toBeInTheDocument();
  });

  it("VERROU §7 — aucun vocabulaire de retard, aucun compteur d'arriéré", () => {
    const { container } = panneau({ items: [item(), item({ id: 2, label: "Fiche de lecture" })] });
    expect(container.textContent).not.toMatch(/en retard|retard|manqué|oublié/i);
    // Ni « 2 à rattraper », ni « 2/3 » : rien qui compte ce qui n'est pas fait.
    expect(container.textContent).not.toMatch(/\d+\s*(à rattraper|non faits?|\/\s*\d+)/i);
  });

  it("un jour à VENIR ne parle pas de rattrapage", () => {
    panneau({ date: DEMAIN, items: [] });
    // 🔴 UNE seule phrase, passé comme futur (§D15) : « Rien de noté pour ce jour. » a disparu
    // avec « Ce jour-là, l'école ne demandait rien. » — deux formulations pour une réponse.
    expect(screen.getByText(/Rien de prévu ce jour-là/)).toBeInTheDocument();
    expect(screen.queryByText(/Rien à rendre ce jour-là|l'école ne demandait/)).toBeNull();
  });

  describe("🔴 le ✦ tient sa promesse (relecture humaine du 2026-08-10)", () => {
    // La bande allume un `✦` d'après les `plan_steps` du JOUR ; le panneau ne rendait que les
    // `fixed_items` du jour. Deux questions différentes — et la Décision 3 garantit qu'elles ne
    // coïncident JAMAIS (une étape tombe toujours avant l'échéance qu'elle prépare). Un jour
    // marqué s'ouvrait donc sur « Rien de noté pour ce jour ».
    const CONTROLE = item({
      id: 42,
      due_on: DEMAIN,
      label: "Multiplication de fractions",
      chapter_id: 8,
    });
    const PREPARATIONS = [
      {
        step: {
          id: 5,
          agenda_item_id: 42,
          kind: "revision" as const,
          day_offset: 1,
          skill_id: null,
          resource_id: null,
          done: false,
        },
        item: CONTROLE,
      },
    ];

    it("un jour qui ne porte QUE des étapes les montre, au lieu de dire « rien »", () => {
      panneau({ date: DEMAIN, items: [], preparations: PREPARATIONS });
      // ANCRE POSITIVE — sans elle, un bloc supprimé satisferait l'assertion négative.
      expect(screen.getByText(/Ce jour-là, tu prépares/)).toBeInTheDocument();
      expect(screen.getByText("Réviser ce chapitre")).toBeInTheDocument();
      // Le SUJET de l'étape : sans lui la ligne flotte (« réviser » — quoi ?).
      expect(screen.getByText(/Multiplication de fractions/)).toBeInTheDocument();
      // 🔴 Et surtout : la phrase de vide MEURT. C'est le défaut lui-même.
      // ⚠️ Assertion remise sur la phrase RÉELLE : elle visait « Rien de noté pour ce jour »,
      // libellé disparu au §D15 — elle passait donc toujours, quoi que fasse le composant.
      // Une assertion négative qui vise un texte inexistant ne verrouille plus rien.
      expect(screen.queryByText(/Rien de prévu ce jour-là/)).toBeNull();
    });

    it("🔴 VERROU — une étape ne se coche PAS ici : sa case vit sous l'échéance", () => {
      // Deux cases pour un même état, c'est le défaut que le reste de ce correctif retire.
      // Ces lignes MÈNENT à l'activité, elles ne la déclarent pas.
      const { container } = panneau({ date: DEMAIN, items: [], preparations: PREPARATIONS });
      expect(screen.getByText(/Ce jour-là, tu prépares/)).toBeInTheDocument();
      expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
      const bloc = screen.getByText(/Ce jour-là, tu prépares/).parentElement!;
      expect(bloc.querySelectorAll("button")).toHaveLength(0);
    });

    it("sans étape, le jour vide dit toujours qu'il est vide", () => {
      // La correction ne doit pas faire taire l'état vide légitime — c'est tout le §17.1.
      panneau({ date: DEMAIN, items: [], preparations: [] });
      expect(screen.getByText(/Rien de prévu ce jour-là/)).toBeInTheDocument();
      expect(screen.queryByText(/Ce jour-là, tu prépares/)).toBeNull();
    });
  });

  describe("🔴 le bouton de fermeture ne peut plus se confondre avec un masquage", () => {
    // Ce bouton portait le MÊME glyphe et le MÊME `className` que la croix de masquage des
    // cartes : un panneau à trois devoirs affichait **trois ✕ indiscernables**, un qui referme et
    // deux qui archivent définitivement. Le commanditaire l'a lu comme un masquage à la relecture
    // du 2026-08-11 — après que la croix de masquage avait déjà été retirée.
    //
    // ⚠️ Il n'était couvert par **aucun test** : ni `aria-label`, ni comportement.

    it("le jour se replie par ▴, et le panneau ne porte AUCUNE croix", () => {
      const onClose = vi.fn();
      const { container } = panneau({
        items: [item(), item({ id: 2, label: "Fiche de lecture" })],
        onClose,
      });

      // ⚠️ **ANCRE POSITIVE D'ABORD** : sans elle, un panneau qui ne rendrait plus rien du tout
      // satisferait l'assertion négative qui suit.
      const replier = screen.getByRole("button", { name: /replier/i });
      fireEvent.click(replier);
      expect(onClose).toHaveBeenCalledTimes(1);

      // 🔴 Le verrou : sur un panneau plein de devoirs de l'ÉCOLE (`created_by: "parent"` par
      // défaut dans la fabrique), plus une seule croix à l'écran.
      expect(container.textContent).not.toContain("✕");
    });

    it("et la croix reste possible sur ce que Massimo a écrit lui-même", () => {
      // Le pendant obligatoire : un test qui n'aurait que l'assertion ci-dessus passerait sur une
      // croix supprimée PARTOUT — donc sur la révocation du §2c, qui n'a pas été décidée.
      const { container } = panneau({ items: [item({ created_by: "student" })] });
      expect(container.textContent).toContain("✕");
      expect(screen.getByRole("button", { name: /masquer/i })).toBeInTheDocument();
    });
  });
});
