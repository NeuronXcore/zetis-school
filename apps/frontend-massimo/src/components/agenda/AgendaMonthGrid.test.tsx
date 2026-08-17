// La grille mois (ADR-0025 Amendement 8 §D1).
//
// 🔴 **Ce fichier n'existait pas, et c'était le trou de couverture exactement sous la refonte** :
// ni `AgendaWeekStrip.test.tsx` ni `AgendaPage.test.tsx` n'existaient non plus. La bande a vécu
// treize jours sans un seul test de rendu, avec quatre défauts trouvés à l'œil.
//
// Ce que ces tests gardent, c'est la MOITIÉ DE LA DOCTRINE QUI SURVIT à la révocation de la vue
// mois : le §Alternatives est révoqué, le §7 ne l'est pas. Sans verrou, la prochaine session
// ajoutera une case grise « pour aligner », et personne ne le verra.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type AgendaDay, type AgendaItemStudent, type AgendaMonth } from "@zetis/types";
import { AgendaMonthGrid } from "./AgendaMonthGrid";

function item(over: Partial<AgendaItemStudent> = {}): AgendaItemStudent {
  return {
    id: 1,
    label: "DM de maths",
    subject: { id: 1, slug: "mathematiques", name: "Mathématiques", color: "#60a5fa" },
    due_on: "2026-08-11",
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

function jour(date: string, over: Partial<AgendaDay> = {}): AgendaDay {
  return { date, offset: 0, traces: null, fixed_items: [], plan_steps: [], ...over };
}

/** Août 2026 — le mois de l'exemple du commanditaire (le 15 est un samedi). */
function mois(over: Partial<AgendaMonth> = {}): AgendaMonth {
  return {
    anchor: "2026-08",
    days: Array.from({ length: 31 }, (_, index) =>
      jour(`2026-08-${String(index + 1).padStart(2, "0")}`, { traces: [] }),
    ),
    prev_anchor: "2026-07",
    next_anchor: "2026-09",
    ...over,
  };
}

function grille(over: Partial<React.ComponentProps<typeof AgendaMonthGrid>> = {}) {
  return render(
    <AgendaMonthGrid
      month={mois()}
      itemsByDate={{}}
      onPickDay={vi.fn()}
      onNavigate={vi.fn()}
      today="2026-08-18"
      {...over}
    />,
  );
}

describe("AgendaMonthGrid", () => {
  it("rend les 31 jours d'août, et AUCUN jour des mois voisins", () => {
    grille();
    expect(screen.getByRole("button", { name: /^1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^31$/ })).toBeInTheDocument();
    // 31 jours + 2 chevrons de navigation.
    expect(screen.getAllByRole("button")).toHaveLength(33);
  });

  it("🔴 VERROU §7 — un jour ouvré VIDE ne rend RIEN : aucune case, aucun réceptacle", () => {
    // La moitié du §Alternatives qui SURVIT à la révocation. Une case grise en attente de
    // remplissage est un décompte de jours manqués, interdit « sous aucune forme »
    // (ADR-0024 §5). C'est la garde qui empêchera « ajoutons un point gris pour aligner ».
    grille();
    const vide = screen.getByRole("button", { name: /^13$/ });
    expect(vide.textContent).toBe("13");

    // 🔴 **Assertion sur les ÉLÉMENTS des registres, pas sur `svg` ni sur le texte.**
    // La première version de ce test vérifiait `querySelectorAll("svg").length === 0` et
    // `textContent === "13"` — et un sabotage l'a traversée sans rougir : un `<span>` gris de
    // 3 px n'a ni SVG ni texte. Le verrou le plus important du fichier ne verrouillait rien.
    //
    // Ce qu'on garde est la règle elle-même : un jour sans rien ne porte AUCUNE marque, quelle
    // que soit la balise qui la porterait.
    const registres = vide.querySelectorAll(":scope > span");
    const marques = [...registres].flatMap((registre) => [...registre.children]);
    expect(marques).toHaveLength(0);
  });

  it("🔴 VERROU §7 — la grille n'AGRÈGE rien : aucun total, aucune série", () => {
    const { container } = grille({
      month: mois({
        days: Array.from({ length: 31 }, (_, index) =>
          jour(`2026-08-${String(index + 1).padStart(2, "0")}`, {
            traces: [{ slug: "svt", name: "SVT", color: "#34d399" }],
          }),
        ),
      }),
    });
    // Ce n'est pas une heatmap : celle-là reste chez Papa, où elle est un outil d'analyse.
    expect(container.textContent).not.toMatch(/total|série|streak|jours d'affilée/i);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it("🔴 VERROU §D11 — le jour SOLDÉ est hachuré, et la cellule reste cliquable", () => {
    // 🔴 **Troisième forme de ce verrou en une journée**, et le chemin mérite d'être lu :
    //   1. « aucun canal pour l'état » — deux items identiques sauf `done` rendaient le même DOM ;
    //   2. « l'accompli reçoit une marque » — une croix dans le glyphe, jugée à l'écran
    //      « vraiment peu visible » à 9 px, et qui découpait le losange ;
    //   3. **l'état quitte le glyphe et passe à la CELLULE** : une hachure sur la journée soldée.
    //
    // Ce qui a survécu aux trois : on marque l'accompli, jamais le manquant.
    const soldee = grille({ itemsByDate: { "2026-08-11": [item({ done: true })] } });
    const enCours = grille({ itemsByDate: { "2026-08-11": [item({ done: false })] } });
    const cellule = (vue: ReturnType<typeof grille>) =>
      vue.container.querySelector('[aria-label^="11 "]') as HTMLElement;

    expect(cellule(soldee).dataset.soldee).toBe("true");
    expect(cellule(soldee).style.backgroundImage).toMatch(/repeating-linear-gradient/);
    expect(cellule(enCours).dataset.soldee).toBeUndefined();
    expect(cellule(enCours).style.backgroundImage).toBe("");

    // 🔴 La cellule soldée reste PLEINEMENT cliquable — jamais `disabled`, jamais estompée.
    // Une cellule grisée se lirait comme désactivée, or c'est le jour qu'on veut rouvrir.
    expect(cellule(soldee)).not.toBeDisabled();
    expect(cellule(soldee).className).not.toMatch(/opacity-\d/);
  });

  it("🔴 VERROU §D11 — trois états de trame : rien, entamé, fini", () => {
    // 🔴 **Le troisième état est né d'un geste sans réponse.** La trame était binaire : cocher
    // le premier de DEUX devoirs ne changeait rien dans la grille — *« une sur deux : on ne voit
    // rien, corrige »* (commanditaire, 2026-08-17, à l'écran). Un geste qui ne répond pas se lit
    // comme une panne, exactement comme le tap muet sur un jour passé (addendum §17).
    const trame = (etat: "rien" | "entame" | "fini") => {
      const items =
        etat === "rien"
          ? [item({ done: false }), item({ id: 2, done: false, due_on: "2026-08-11" })]
          : etat === "entame"
            ? [item({ done: true }), item({ id: 2, done: false, due_on: "2026-08-11" })]
            : [item({ done: true }), item({ id: 2, done: true, due_on: "2026-08-11" })];
      const vue = grille({ itemsByDate: { "2026-08-11": items } });
      const cellule = vue.container.querySelector('[aria-label^="11 "]') as HTMLElement;
      return { soldee: cellule.dataset.soldee, image: cellule.style.backgroundImage };
    };

    // Rien de fait → aucune trame. C'est la garde qui empêche le gabarit de cases (§7).
    expect(trame("rien").image).toBe("");
    // Entamé → une trame, mais PAS l'état « soldé ».
    expect(trame("entame").image).toMatch(/repeating-linear-gradient/);
    expect(trame("entame").soldee).toBeUndefined();
    // Fini → trame ET état soldé.
    expect(trame("fini").soldee).toBe("true");

    // 🔴 **L'intensité monte, elle ne change pas de motif** : même angle, même pas, opacité
    // différente. Deux motifs auraient fait deux vocabulaires pour une seule idée.
    const opacite = (css: string) => Number(/rgba\(255, ?255, ?255, ?([\d.]+)\)/.exec(css)?.[1]);
    expect(opacite(trame("entame").image)).toBeLessThan(opacite(trame("fini").image));
    expect(trame("entame").image.replace(/[\d.]+\)/, ")")).toBe(
      trame("fini").image.replace(/[\d.]+\)/, ")"),
    );
  });

  it("🔴 VERROU §D18 — un jour PASSÉ non fait porte le cadre AMBRE, et il est STATIQUE", () => {
    // 🔴 **Ceci révoque le §D3** — « dans la grille, l'état de complétion ne prend aucun canal ».
    // Un toast est ponctuel ; une couleur répétée sur trente cellules **est** le compteur
    // d'arriéré que le §7 protégeait. Décision du commanditaire, écrite au §D18.
    const { container } = grille({
      itemsByDate: {
        "2026-08-13": [item({ due_on: "2026-08-13", done: false })], // passé, non fait
        "2026-08-11": [item({ id: 2, due_on: "2026-08-11", done: true })], // passé, fait
      },
    });
    const cellule = (jour: string) =>
      container.querySelector(`[aria-label^="${jour} "], [aria-label="${jour}"]`) as HTMLElement;

    expect(cellule("13").dataset.enRetard).toBe("true");
    expect(cellule("13").style.borderColor).toMatch(/251, ?191, ?36/);
    // Un jour passé SOLDÉ n'est pas en retard.
    expect(cellule("11").dataset.enRetard).toBeUndefined();

    // 🔴 **STATIQUE.** Le toast a le droit de respirer parce qu'il est seul à l'écran ; trente
    // cellules qui pulseraient ensemble seraient un champ stroboscopique.
    expect(cellule("13").className).not.toMatch(/animate-|animation:|motion-safe:/);

    // 🔴 Et AMBRE, jamais rouge — le rouge reste interdit sur toutes les surfaces de Massimo.
    expect(container.innerHTML).not.toMatch(/(?:text|bg|border|ring)-(?:red|rose)-\d/);
  });

  it("🔴 VERROU §D13 — le cadre orange exige DEUX conditions : futur ET porteur", () => {
    // 🔴 **La seconde condition a été oubliée**, et le commanditaire l'a vue à l'écran : le
    // cadre était posé sur TOUT le futur, soit 14 cellules sur 31, la plupart vides. Il
    // annonçait « ça arrive » sur des jours où rien n'arrive — un gabarit de cases, c'est-à-dire
    // le §7 réintroduit sur le futur.
    const { container } = grille({
      // aujourd'hui = 2026-08-18 ; le 20 porte une échéance, le 21 non.
      itemsByDate: { "2026-08-20": [item({ due_on: "2026-08-20" })] },
    });
    const cellule = (jour: string) =>
      container.querySelector(`[aria-label^="${jour} "], [aria-label="${jour}"]`) as HTMLElement;

    // Futur ET porteur → cadre.
    expect(cellule("20").dataset.aVenir).toBe("true");
    expect(cellule("20").style.borderColor).toMatch(/251, ?146, ?60/);

    // 🔴 Futur mais VIDE → rien. C'est la garde oubliée.
    expect(cellule("21").dataset.aVenir).toBeUndefined();
    expect(cellule("21").style.borderColor).toBe("");

    // 🔴 **Aujourd'hui n'est PAS « à venir »** : deux cadres sur la même cellule se
    // contrediraient. Le cyan dit « on est ici dans le temps », l'orange dit « ça arrive ».
    expect(cellule("18").dataset.aVenir).toBeUndefined();

    // Le passé n'en porte aucun — il y deviendrait le gabarit que le §7 refuse, cette fois sur
    // des jours où l'absence *est* reprochable.
    expect(cellule("13").dataset.aVenir).toBeUndefined();
  });

  it("🔴 VERROU §D13 — un jour futur qui ne porte QU'UNE préparation est encadré", () => {
    // « Porter quelque chose » couvre les deux registres du haut : une échéance OU une étape de
    // préparation. Un jour où l'on prépare n'est pas un jour vide.
    const { container } = grille({
      month: mois({
        days: [
          jour("2026-08-25", {
            plan_steps: [
              {
                id: 1,
                agenda_item_id: 99,
                kind: "revision",
                day_offset: 2,
                skill_id: null,
                resource_id: null,
                done: false,
              },
            ],
          }),
        ],
      }),
    });
    expect(
      (container.querySelector('[aria-label^="25"]') as HTMLElement).dataset.aVenir,
    ).toBe("true");
  });

  it("🔴 VERROU §D13 — l'orange ne colore JAMAIS un glyphe", () => {
    // `#fb923c` est la teinte de l'ESPAGNOL. La séparation est SPATIALE : le cadre vit sur la
    // cellule, la teinte de matière sur le glyphe — exactement comme le cyan d'aujourd'hui, qui
    // est la teinte de la physique-chimie. Si l'orange descendait dans un glyphe, un contrôle
    // d'espagnol et « ça arrive » deviendraient indiscernables.
    const { container } = grille({ itemsByDate: { "2026-08-20": [item({ due_on: "2026-08-20" })] } });
    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.getAttribute("fill") ?? "").not.toMatch(/251, ?146, ?60|#fb923c/i);
      expect(svg.getAttribute("stroke") ?? "").not.toMatch(/251, ?146, ?60|#fb923c/i);
    }
  });

  it("🔴 VERROU §D11 — un jour SANS échéance n'est JAMAIS hachuré", () => {
    // La garde qui compte le plus. Sans elle, `every` sur un tableau vide rend `true` et
    // **tous les jours vides du mois seraient hachurés** — un gabarit de cases remplies,
    // c'est-à-dire l'inverse exact du §7.
    grille();
    expect((screen.getByRole("button", { name: /^13$/ }) as HTMLElement).dataset.soldee)
      .toBeUndefined();
  });

  it("🔴 VERROU §D11 — aucun glyphe ne porte l'état de complétion", () => {
    // 🔴 **Test INVERSÉ par le commanditaire le 2026-08-17.** Il asserait l'inverse — que deux
    // items identiques sauf `done` rendent EXACTEMENT le même DOM — au motif que la différence
    // coché/non-coché, répétée sur trente cellules, est le compteur d'arriéré du §7.
    //
    // La nuance qui renverse l'arbitrage tient à une ASYMÉTRIE, et c'est elle que ce test garde
    // désormais : *marquer ce qui est fait* ajoute un signe là où il y a eu une action ;
    // *estomper ce qui est fait* ferait ressortir ce qui ne l'est pas. Seul le second fabrique
    // un compteur d'arriéré. On constate une présence, on ne compte jamais une absence.
    const fait = grille({ itemsByDate: { "2026-08-11": [item({ done: true })] } });
    const pasFait = grille({ itemsByDate: { "2026-08-11": [item({ done: false })] } });
    const cellule = (vue: ReturnType<typeof grille>) =>
      vue.container.querySelector('[aria-label^="11 "]')!;

    // Le GLYPHE reste identique, fait ou non : l'état a quitté ce niveau (§D11). C'est ce qui
    // garde la teinte à la matière et la silhouette à la nature, sans canal de trop.
    const glyphe = (vue: ReturnType<typeof grille>) => {
      const svg = cellule(vue).querySelector("svg")!;
      return {
        html: svg.innerHTML,
        fill: svg.getAttribute("fill"),
        width: svg.getAttribute("width"),
        height: svg.getAttribute("height"),
        opacite: svg.getAttribute("opacity") ?? svg.style.opacity,
        classe: svg.getAttribute("class"),
      };
    };
    expect(glyphe(fait)).toEqual(glyphe(pasFait));
  });

  it("🔴 le fait ne s'estompe JAMAIS — aucune opacité, aucun barré dans la grille", () => {
    // La garde qui empêche le glissement inverse : quelqu'un ajoutera un jour `opacity-40` sur
    // le fait « pour que ce soit cohérent avec les listes ». Dans les listes, c'est légitime —
    // on y lit un item à la fois. Sur trente cellules, c'est un contraste qu'on balaie.
    const { container } = grille({
      itemsByDate: {
        "2026-08-11": [item({ done: true }), item({ id: 2, done: false, due_on: "2026-08-11" })],
      },
    });
    const cellule = container.querySelector('[aria-label^="11 "]')!;
    expect(cellule.innerHTML).not.toMatch(/opacity-\d|line-through|text-decoration/);
  });

  it("un jour PASSÉ porte désormais ses échéances (§R3, asymétrie révoquée)", () => {
    grille({ itemsByDate: { "2026-08-11": [item()] } });
    // ⚠️ L'`aria-label` s'ouvre désormais par « en retard » (§D18) : l'item de la fixture est
    // passé et non fait. Le motif reste ancré au début et à la fin — il vérifie toujours que la
    // cellule NOMME sa matière et sa nature, ce qui est l'objet du test.
    const cellule = screen.getByRole("button", {
      name: /^11 — en retard, Mathématiques devoir$/,
    });
    expect(cellule.querySelectorAll("svg")).toHaveLength(1);
  });

  it("les matières sont énumérées EN TOUTES LETTRES dans l'aria-label", () => {
    // La borne du coût daltonien : la palette des 8 matières n'est pas sûre entre ses propres
    // membres en deutéranopie. Dans la grille, la teinte ACCÉLÈRE — elle n'identifie jamais seule.
    grille({
      month: mois({
        days: [jour("2026-08-15", { traces: [{ slug: "svt", name: "SVT", color: "#34d399" }] })],
      }),
    });
    expect(screen.getByRole("button", { name: "15 — travaillé SVT" })).toBeInTheDocument();
  });

  it("🔴 VERROU §14.6 — aux bornes, le chevron DISPARAÎT, il n'est jamais grisé", () => {
    // « Un bouton mort se lit comme une panne. » Un `disabled` resterait dans l'arbre
    // d'accessibilité et se laisserait chercher au doigt pour rien.
    grille({ month: mois({ prev_anchor: null, next_anchor: null }) });
    expect(screen.queryByRole("button", { name: "Mois précédent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mois suivant" })).not.toBeInTheDocument();

    grille({ month: mois() });
    expect(screen.getByRole("button", { name: "Mois précédent" })).toBeInTheDocument();
  });

  it("le débordement dit « il y en a d'autres », JAMAIS combien", () => {
    const { container } = grille({
      itemsByDate: {
        "2026-08-11": [1, 2, 3, 4, 5].map((id) => item({ id, due_on: "2026-08-11" })),
      },
    });
    // Trois glyphes au plus, et surtout pas de « +2 » — un compte est un compte.
    const cellule = container.querySelector('[aria-label^="11 "]')!;
    expect(cellule.querySelectorAll("svg")).toHaveLength(3);
    expect(cellule.textContent).not.toMatch(/\+\s*\d/);
  });

  it("un week-end travaillé garde la MÊME vivacité qu'un jour ouvré", () => {
    // L'exemple qui a lancé le chantier est un samedi. Le week-end RECULE (son fond change),
    // il ne se ferme pas : son contenu est rendu à l'identique.
    grille({
      month: mois({
        days: [
          jour("2026-08-14", { traces: [{ slug: "svt", name: "SVT", color: "#34d399" }] }),
          jour("2026-08-15", { traces: [{ slug: "svt", name: "SVT", color: "#34d399" }] }),
        ],
      }),
    });
    const vendredi = screen.getByRole("button", { name: /^14 — travaillé SVT$/ });
    const samedi = screen.getByRole("button", { name: /^15 — travaillé SVT$/ });
    // Le contenu (registres) est identique ; seule la classe de fond diffère.
    expect(samedi.querySelector(".rounded-full")?.getAttribute("style")).toBe(
      vendredi.querySelector(".rounded-full")?.getAttribute("style"),
    );
    expect(samedi).not.toBeDisabled();
  });

  it("🔴 VERROU — aucune compaction sans son garde-fou tactile", () => {
    // La grille a été compactée le 2026-08-17 pour cesser de manger tout le premier écran :
    // mesurée à **493 px** dans une fenêtre de 856, elle repoussait les trois registres à 795,
    // 949 et 1013 — tous hors champ. La cellule passe donc de 62 à 46 px, et les chevrons de 44
    // à 36 — **au CURSEUR seulement**.
    //
    // 🔴 Le plancher de 44 × 44 (WCAG 2.1 AA, HIG 44 pt) existe pour un DOIGT. Toute valeur
    // compactée DOIT donc porter sa contrepartie `pointer-coarse:` — sinon le gain de place se
    // paie en cibles inatteignables sur l'iPhone de Massimo, qui est son appareil principal.
    //
    // ⚠️ **Ce test lit des CLASSES, et il faut savoir pourquoi c'est acceptable ici** : jsdom
    // n'applique aucune CSS et n'évalue aucune media query, donc une hauteur calculée y vaudrait
    // toujours zéro (leçon du §D19). L'invariant gardé n'est pas une hauteur — c'est un
    // **appariement dans la source** : pas de compaction orpheline. Les hauteurs réelles, elles,
    // ont été mesurées dans le navigateur aux deux pointeurs (48 px au curseur, 62 au doigt,
    // chevron 44 × 44 au doigt).
    grille();
    const cellule = screen.getAllByRole("button")[2];
    expect(cellule.className).toMatch(/min-h-\[46px\]/);
    expect(cellule.className).toMatch(/pointer-coarse:min-h-\[62px\]/);
    // Les DEUX chevrons, pas un : un garde-fou posé sur un seul se lit comme posé sur les deux.
    for (const chevron of screen.getAllByRole("button", { name: /Mois (précédent|suivant)/ })) {
      expect(chevron.className).toMatch(/\bh-9\b/);
      expect(chevron.className).toMatch(/pointer-coarse:h-11/);
    }
  });
});
