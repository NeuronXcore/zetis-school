// La ligne d'agenda de Massimo — marqueurs de nature (§14.4) et lien vers le cours (§15).
//
// Deux règles tiennent cet écran : la leçon se repère sans que le fuchsia du contrôle se dilue,
// et une échéance qui NOMME un cours y donne accès — sans jamais offrir un lien vers nulle part.
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { type AgendaItemStudent, type AgendaPlanStep } from "@zetis/types";
import { AgendaItemRow } from "./AgendaItemRow";

function item(over: Partial<AgendaItemStudent> = {}): AgendaItemStudent {
  return {
    id: 1,
    label: "Le passé composé",
    subject: { id: 7, name: "Français", slug: "francais", color: null },
    due_on: "2026-09-10",
    kind: "lecon",
    done: false,
    created_by: "parent",
    edited_by_parent: false,
    lesson_id: null,
    chapter_id: null,
    revisable_cards: 0,
    ...over,
  };
}

const ligne = (over: Partial<AgendaItemStudent> = {}) =>
  render(
    <MemoryRouter>
      <AgendaItemRow item={item(over)} onToggle={vi.fn()} onDismiss={vi.fn()} />
    </MemoryRouter>,
  );

const lien = () => screen.queryByRole("link", { name: /lire le cours/ });

describe("AgendaItemRow — les marqueurs de nature", () => {
  it("une leçon à apprendre porte sa marque", () => {
    ligne({ kind: "lecon" });
    expect(screen.getByText(/leçon/)).toBeInTheDocument();
  });

  it("VERROU — le fuchsia reste réservé au contrôle", () => {
    // Une leçon est du travail ORDINAIRE : elle se repère, elle n'alarme pas. Diluer le fuchsia
    // sur un second type lui ferait perdre son sens — c'est le seul signal de gravité de l'écran.
    const { container: avecLecon } = ligne({ kind: "lecon" });
    expect(avecLecon.innerHTML).not.toContain("fuchsia");

    const { container: avecControle } = ligne({ kind: "controle" });
    expect(avecControle.innerHTML).toContain("fuchsia");
  });

  it("le devoir et le rendu restent sans marque", () => {
    // État d'avant ce chantier, conservé : la ligne calme est le défaut.
    const { container: devoir } = ligne({ kind: "devoir" });
    expect(devoir.textContent).not.toMatch(/leçon|contrôle/);

    const { container: rendu } = ligne({ kind: "rendu" });
    expect(rendu.textContent).not.toMatch(/leçon|contrôle/);
  });
});

describe("AgendaItemRow — le lien vers le cours (§15)", () => {
  it("mène à LA leçon quand l'échéance en porte une", () => {
    ligne({ lesson_id: 42, chapter_id: 12 });
    expect(lien()).toHaveAttribute("href", "/subjects/francais/cours?lesson=42");
  });

  it("dégrade sur le chapitre, EN EMPORTANT le titre cherché (§15.6)", () => {
    // Sans `lesson_id`, le libellé reste souvent le titre exact d'un cours du chapitre : le lien
    // le dit, et la page tentera le rapprochement. Sans lui, l'échéance nommait un cours qu'elle
    // ne savait pas désigner.
    ligne({ lesson_id: null, chapter_id: 12, label: "La phrase complexe" });
    expect(lien()).toHaveAttribute(
      "href",
      "/subjects/francais/cours?chapter=12&title=La%20phrase%20complexe",
    );
  });

  it("dégrade sur la matière quand il n'y a ni leçon ni chapitre", () => {
    ligne();
    expect(lien()).toHaveAttribute("href", "/subjects/francais/cours");
  });

  it("VERROU — aucun lien sans matière, jamais un lien vers la racine", () => {
    // Même discipline que `pilotageLink` côté Papa : un lien qui déposerait Massimo au hasard
    // est pire que pas de lien.
    ligne({ subject: null, lesson_id: 42 });
    expect(lien()).toBeNull();
  });

  it("apparaît quel que soit le type — un devoir rattaché à un cours y mène aussi", () => {
    // Recopier ici une règle de `kind` en ferait une seconde source de vérité : celle de
    // `TRIGGERING_KINDS` a divergé le jour même où `devoir` y est entré.
    ligne({ kind: "devoir", lesson_id: 42 });
    expect(lien()).toHaveAttribute("href", "/subjects/francais/cours?lesson=42");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// LA PORTE DU DECK CHAPITRE (ADR-0049) — et surtout, son ABSENCE
// ─────────────────────────────────────────────────────────────────────────────────────

const porte = () => screen.queryByRole("link", { name: /Réviser ce chapitre/ });

describe("AgendaItemRow — la porte de révision par chapitre", () => {
  it("🔴 VERROU — sans carte servable, la porte n'EXISTE PAS dans le DOM", () => {
    // ⚠️ L'assertion porte sur l'ABSENCE, jamais sur un `disabled` : un bouton désactivé
    // passerait un test écrit à l'envers, et c'est exactement l'écran que la Décision 2 refuse.
    // « Un bouton mort se lit comme une panne » (addendum ADR-0025 §14.6).
    const { container } = ligne({ chapter_id: 4, revisable_cards: 0 });
    expect(porte()).toBeNull();
    // Ni bouton grisé, ni bouton qui explique, ni espace réservé : RIEN.
    expect(container.textContent).not.toContain("Réviser");
    expect(container.textContent).not.toContain("bientôt");
    expect(container.querySelector("[disabled]")).toBeNull();
  });

  it("VERROU — un chapitre absent ne rend aucune porte, même si le compte est > 0", () => {
    // Deux gardes, pas une : un compte sans chapitre serait une porte vers un deck inexistant.
    ligne({ chapter_id: null, revisable_cards: 3 });
    expect(porte()).toBeNull();
  });

  it("avec des cartes servables, la porte mène à la session du deck chapitre", () => {
    ligne({ chapter_id: 12, revisable_cards: 5, label: "La Révolution française" });
    const lien = porte();
    expect(lien).toHaveAttribute("href", "/revision/session");
    // Le nombre annoncé est celui du SERVEUR, plafond compris — jamais recalculé ici.
    expect(screen.getByText("5 cartes")).toBeInTheDocument();
  });

  it("le singulier est respecté (une carte, pas « 1 cartes »)", () => {
    ligne({ chapter_id: 12, revisable_cards: 1 });
    expect(screen.getByText("1 carte")).toBeInTheDocument();
  });

  it("🔴 VERROU — la mécanique SRS reste INVISIBLE sur la ligne", () => {
    // Massimo révise avant son contrôle. Il ne lit jamais que la session ne déplace pas ses
    // cartes, ni « non planifiant », ni « supplémentaire » — c'est l'affaire du serveur.
    const { container } = ligne({ chapter_id: 12, revisable_cards: 5 });
    for (const interdit of [
      "planif",
      "intervalle",
      "programmation",
      "supplémentaire",
      "en retard",
      "due",
    ]) {
      expect(container.textContent?.toLowerCase()).not.toContain(interdit);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// LE PLAN DE PRÉPARATION (ADR-0050) — l'échéance dit QUOI, le plan dit COMMENT s'y prendre
// ─────────────────────────────────────────────────────────────────────────────────────

function etape(over: Partial<AgendaPlanStep> & { id: number; kind: AgendaPlanStep["kind"] }) {
  return {
    agenda_item_id: 1,
    day_offset: 1,
    skill_id: null,
    resource_id: null,
    done: false,
    ...over,
  } satisfies AgendaPlanStep;
}

/** Un contrôle de maths le vendredi 14 août 2026, avec son plan. */
const avecPlan = (steps: AgendaPlanStep[], over: Partial<AgendaItemStudent> = {}) => {
  const onToggleStep = vi.fn();
  const vue = render(
    <MemoryRouter>
      <AgendaItemRow
        item={item({
          due_on: "2026-08-14",
          kind: "controle",
          chapter_id: 12,
          label: "Multiplication de fractions",
          subject: { id: 3, name: "Mathématiques", slug: "maths", color: null },
          ...over,
        })}
        onToggle={vi.fn()}
        onDismiss={vi.fn()}
        planSteps={steps}
        onToggleStep={onToggleStep}
      />
    </MemoryRouter>,
  );
  return { ...vue, onToggleStep };
};

const TROIS_ETAPES = [
  etape({ id: 1, kind: "fiche", day_offset: 3, done: true }),
  etape({ id: 2, kind: "revision", day_offset: 2 }),
  etape({ id: 3, kind: "quiz", day_offset: 1 }),
];

describe("AgendaItemRow — le plan de préparation", () => {
  it("🔴 VERROU — sans étape, le bloc du plan n'EXISTE PAS dans le DOM", () => {
    // La très grande majorité des échéances n'a PAS de plan (il faut un chapitre et au moins
    // 2 jours). Un encadré vide sur chacune ferait de l'agenda une page de manques — c'est le
    // « bouton mort » du §14.6, à l'échelle de la page entière.
    const { container } = avecPlan([]);
    expect(container.textContent).not.toContain("Ton plan");
    expect(container.textContent).not.toContain("bientôt");
    expect(container.querySelector("[disabled]")).toBeNull();
  });

  it("rend les étapes dans l'ordre reçu, chacune avec SON jour", () => {
    // ⚠️ Le tri vient de `groupPlanByItem` (module pur, verrouillé là-bas) : ce composant ne
    // réordonne rien. Le jour, lui, se reconstruit ici depuis `due_on` et l'offset.
    avecPlan(TROIS_ETAPES);
    expect(screen.getByText("Lire les fiches")).toBeInTheDocument();
    expect(screen.getByText("Réviser ce chapitre")).toBeInTheDocument();
    expect(screen.getByText("Choisir un quiz")).toBeInTheDocument();
    // Vendredi 14 : offset 3 ⇒ mardi 11, offset 2 ⇒ mercredi 12, offset 1 ⇒ jeudi 13.
    expect(screen.getByText("mar. 11")).toBeInTheDocument();
    expect(screen.getByText("mer. 12")).toBeInTheDocument();
    expect(screen.getByText("jeu. 13")).toBeInTheDocument();
  });

  it("🔴 VERROU — aucune route inventée n'atteint le DOM", () => {
    // Le pendant de rendu du verrou de `planStepTarget` : ce qui compte au bout de la chaîne,
    // c'est le `href` réellement posé. `/fiches?fiche=77` s'ouvrirait sur une page qui ignore
    // le paramètre — un cul-de-sac qui a l'air de marcher.
    avecPlan([
      etape({ id: 1, kind: "fiche", resource_id: 77 }),
      etape({ id: 3, kind: "quiz", resource_id: 88 }),
    ]);
    const fiche = screen.getByRole("link", { name: /Lire les fiches/ });
    const quiz = screen.getByRole("link", { name: /Choisir un quiz/ });
    expect(fiche).toHaveAttribute("href", "/fiches/maths");
    expect(quiz).toHaveAttribute("href", "/quiz?subject=maths&from=maths");
  });

  it("compte l'AVANCÉE, jamais le reste à faire", () => {
    // « 1 sur 3 » monte ; « 2 restantes » décompterait. Le §7 interdit tout compteur d'arriéré.
    const { container } = avecPlan(TROIS_ETAPES);
    expect(screen.getByText("1 sur 3")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/restant|en retard|manqué/i);
  });

  it("cocher une étape remonte CETTE étape, et rien d'autre", () => {
    const { onToggleStep } = avecPlan(TROIS_ETAPES);
    fireEvent.click(screen.getAllByRole("button", { name: /Cocher l'étape/ })[0]);
    expect(onToggleStep).toHaveBeenCalledTimes(1);
    // La première du DOM est la première du tableau reçu — celle qui est déjà cochée porte
    // « Décocher », donc le premier « Cocher » est l'étape 2.
    expect(onToggleStep.mock.calls[0][0].id).toBe(2);
  });

  it("VERROU §14.7 — l'étape se COCHE, elle ne se « fait » pas", () => {
    // Cocher ne prouve rien : c'est une déclaration de Massimo (Décision 5, option A). Un
    // libellé « fait » ferait croire que ZETIS a constaté quelque chose.
    avecPlan(TROIS_ETAPES);
    // ⚠️ L'assertion vise les coches D'ÉTAPE, pas toutes les coches de la carte : celle de
    // l'échéance dit bien « Marquer comme fait », et c'est correct — une échéance SE fait, une
    // étape de plan se coche seulement.
    const coches = screen.getAllByRole("button", { name: /l'étape/ });
    expect(coches).toHaveLength(3);
    for (const coche of coches) {
      expect(coche.getAttribute("aria-label")).not.toMatch(/fait/i);
    }
  });

  it("🔴 VERROU — la porte de l'ADR-0049 s'efface quand le plan porte déjà la révision", () => {
    // Les deux mènent au MÊME deck, et leurs conditions serveur sont la même. Sans cette garde,
    // la carte afficherait deux boutons vers la même destination à trois lignes d'écart. La
    // version du plan gagne : elle est datée et elle se coche.
    avecPlan(TROIS_ETAPES, { revisable_cards: 8 });
    // ⚠️ L'assertion porte sur le NOMBRE de portes, pas sur l'absence du libellé : l'étape du
    // plan porte le même. C'est justement ce qui rend le doublon possible — et invisible à un
    // test écrit trop vite.
    const portes = screen.getAllByRole("link", { name: /Réviser ce chapitre/ });
    expect(portes).toHaveLength(1);
    // Et celle qui reste est celle du PLAN : elle porte son jour.
    expect(portes[0].textContent).toContain("mer. 12");
    // Le « 8 cartes » de la porte s'en va avec elle : sur une étape datée de mercredi, un
    // compte deviendrait un quota pour mercredi.
    expect(screen.queryByText("8 cartes")).toBeNull();
  });

  it("la porte reste quand le plan ne porte PAS la révision", () => {
    // Contre-épreuve : la garde ne doit pas effacer la porte pour un plan sans étape `revision`.
    avecPlan([etape({ id: 1, kind: "fiche" })], { revisable_cards: 8 });
    expect(screen.getByRole("link", { name: /Réviser ce chapitre/ })).toBeInTheDocument();
  });

  it("VERROU — sans matière, l'étape reste et se coche, mais n'est PAS un lien", () => {
    // Faire disparaître l'étape trouerait le plan ; un lien vers la racine serait une petite
    // trahison. Elle reste en texte, et sa coche — le seul geste qui lui donne un état — marche.
    const { onToggleStep } = avecPlan([etape({ id: 1, kind: "fiche" })], { subject: null });
    expect(screen.getByText("Lire les fiches")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Lire les fiches/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Cocher l'étape/ }));
    expect(onToggleStep).toHaveBeenCalledTimes(1);
  });

  it("🔴 VERROU — la mécanique du plan reste INVISIBLE", () => {
    // Massimo lit « mardi 11 : lire les fiches de maths ». Il ne lit jamais « offset », ni
    // « étape 2/3 générée », ni le vocabulaire du rétro-planning.
    const { container } = avecPlan(TROIS_ETAPES);
    for (const interdit of ["offset", "rétro", "généré", "planif", "resource"]) {
      expect(container.textContent?.toLowerCase()).not.toContain(interdit);
    }
  });
});
