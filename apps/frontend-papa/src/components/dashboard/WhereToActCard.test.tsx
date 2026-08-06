import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardSubject } from "@zetis/types";
import { WhereToActCard } from "./WhereToActCard";

// Nuage « Où agir » — les bulles portent le PICTOGRAMME de la matière (`subjectIconFor`), le même
// que les pastilles de filtre et la matrice de Couverture. Jamais d'emoji codé en dur
// (`design-system.md §Pictogrammes de matière`).
//
// L'invariant que ces tests protègent : changer le VISUEL d'une bulle ne doit pas lui faire perdre
// ce qu'elle MESURE. Le rayon vaut le nombre de notions au programme — c'est écrit dans la note de
// la carte, donc un pictogramme à taille fixe ferait mentir la légende.

function subject(overrides: Partial<DashboardSubject> = {}): DashboardSubject {
  const zeros = () => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0));
  return {
    id: 1,
    slug: "svt",
    name: "SVT",
    color: "#34d399",
    minutes: { "7": 60, "30": 120, "90": 300, "365": 900 },
    calendar: [],
    slots: { "7": zeros(), "30": zeros(), "90": zeros(), "365": zeros() },
    slots_outside_minutes: { "7": 0, "30": 0, "90": 0, "365": 0 },
    notions: { consolidated: 2, fragile: 1, in_progress: 1, total: 9 },
    series: {
      "7": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
      "30": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
      "90": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
      "365": { covered: [], consolidated: [], fragile: [], in_progress: [], gained: [], lost: [], reviews: { again: [], hard: [], good: [], easy: [] } },
    },
    review_load: Array.from({ length: 14 }, () => 0),
    gaps_open: 0,
    has_referentiel: true,
    ...overrides,
  };
}

function renderCard(subjects: DashboardSubject[]) {
  return render(
    <MemoryRouter>
      <WhereToActCard
        subjects={subjects}
        period="7"
        focus={null}
        selected={null}
        onSelect={vi.fn()}
        // Panneau fermé : ces tests portent sur le NUAGE. Le panneau a les siens.
        panelSubject={null}
        onClosePanel={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** Le nuage seul — le CTA du bas porte lui aussi un pictogramme, qui n'est pas une bulle. */
function nuage(container: HTMLElement): SVGSVGElement {
  return container.querySelector("svg[role='img']") as SVGSVGElement;
}

describe("WhereToActCard — bulles pictogrammées", () => {
  it("rend le pictogramme de la matière à la place du disque plein", () => {
    const { container } = renderCard([subject()]);

    const images = nuage(container).querySelectorAll("image");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("href")).toContain("svt");
    // `slice` et non `meet` : un pictogramme carré doit remplir le cercle, pas y flotter.
    expect(images[0].getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");

    // Le disque OPAQUE a disparu ; il ne reste que l'anneau de couleur, sans remplissage.
    // Les cercles de `clipPath` sont exclus : ils découpent le pictogramme et n'ont, par nature,
    // aucun `fill` — les compter aurait fait échouer l'assertion sur un faux motif.
    // `closest("clipPath")` ne convient PAS : jsdom compare les sélecteurs en minuscules et ne
    // reconnaît pas le camelCase de SVG — il rendait `null` pour les deux cercles. On regarde donc
    // le parent directement.
    const dessinés = [...nuage(container).querySelectorAll("circle")].filter(
      (c) => (c.parentNode as Element | null)?.tagName?.toLowerCase() !== "clippath",
    );
    expect(dessinés).toHaveLength(1);
    expect(dessinés[0].getAttribute("fill")).toBe("none");
    expect(dessinés[0].getAttribute("stroke")).toBe("#34d399");
  });

  it("garde le rayon proportionnel aux notions : le pictogramme n'est PAS à taille fixe", () => {
    // LE test de ce changement. Une bulle dit trois choses à la fois — temps (x), consolidation
    // (y), volume du programme (aire). Poser une icône de 20 px sur chacune en tuerait une sur
    // trois sans qu'aucun autre test ne bronche, et la note de la carte deviendrait fausse.
    const { container } = renderCard([
      subject({ id: 1, slug: "svt", name: "SVT", notions: { consolidated: 1, fragile: 0, in_progress: 0, total: 9 } }),
      subject({ id: 2, slug: "anglais", name: "Anglais", notions: { consolidated: 1, fragile: 0, in_progress: 0, total: 100 } }),
      subject({ id: 3, slug: "francais", name: "Français", notions: { consolidated: 1, fragile: 0, in_progress: 0, total: 400 } }),
    ]);

    // Trié plutôt que lu dans l'ordre du document : celui-ci est l'ordre de PEINTURE (grosses
    // d'abord), qui est une autre décision. Lier ce test-ci à cet ordre l'aurait fait tomber au
    // premier changement de superposition, sans que la proportionnalité — ce qu'il vérifie — ait
    // bougé d'un pixel.
    const tailles = [...nuage(container).querySelectorAll("image")]
      .map((i) => Number(i.getAttribute("width")))
      .sort((a, b) => a - b);

    expect(tailles).toHaveLength(3);
    expect(tailles[0]).toBeLessThan(tailles[1]);
    expect(tailles[1]).toBeLessThan(tailles[2]);
    // r = 6 + √total × 2.2, largeur = 2r → 9 notions donnent 25.2 et 400 en donnent 100.
    expect(tailles[0]).toBeCloseTo(25.2, 1);
    expect(tailles[2]).toBeCloseTo(100, 1);
  });

  it("retombe sur l'initiale quand l'asset manque, jamais sur un emoji", () => {
    // `maths` n'existe pas dans `packages/ui/src/assets/subjects/` (l'asset s'appelle
    // `mathematiques_256.png`). Un slug non couvert ne doit ni casser, ni afficher un carré vide,
    // ni inventer un emoji — même règle que `SubjectPictogram`.
    const { container } = renderCard([subject({ slug: "maths", name: "Maths" })]);

    expect(nuage(container).querySelectorAll("image")).toHaveLength(0);
    expect(within(nuage(container) as unknown as HTMLElement).getByText("M")).toBeInTheDocument();
  });

  it("conserve l'infobulle chiffrée de la bulle", () => {
    const { container } = renderCard([subject()]);

    const titre = nuage(container).querySelector("title")?.textContent ?? "";
    expect(titre).toContain("SVT");
    expect(titre).toContain("60 min");
    expect(titre).toContain("9 notions");
  });
});

describe("WhereToActCard — échelle verticale adaptative", () => {
  /** Une matière dont le % consolidé vaut exactement `percent`. */
  const à = (slug: string, percent: number, minutes = 60) =>
    subject({
      slug,
      name: slug,
      minutes: { "7": minutes, "30": minutes, "90": minutes, "365": minutes },
      notions: { consolidated: percent, fragile: 0, in_progress: 0, total: 100 },
    });

  const graduations = (container: HTMLElement) =>
    [...nuage(container).querySelectorAll("text")]
      .map((t) => t.textContent ?? "")
      .filter((t) => /^\d+%$/.test(t));

  it("zoome quand tout le programme est en bas, et le DIT", () => {
    // Le cas réel du 2026-08-05 : 1 notion consolidée sur 280, toutes les matières écrasées sur
    // l'axe. L'échelle se cale sur le maximum atteint — mais un zoom muet ferait lire « bien
    // ancré » à une matière à 6 %, donc la mention fait partie du correctif, pas de l'habillage.
    const { container } = renderCard([à("svt", 0), à("maths", 1), à("francais", 6)]);

    expect(graduations(container)).toEqual(["0%", "3%", "5%", "8%", "10%"]);
    expect(nuage(container).textContent).toContain("échelle ajustée · max 10 %");
  });

  it("ne descend JAMAIS sous le plancher, même quand tout vaut zéro", () => {
    // Sans plancher : yMax = 0 → division par zéro → toutes les bulles en `NaN`, et un SVG qui ne
    // rend plus rien. Le plancher est donc autant une garde numérique qu'un choix de lecture.
    const { container } = renderCard([à("svt", 0), à("maths", 0)]);

    expect(graduations(container)).toEqual(["0%", "3%", "5%", "8%", "10%"]);
    const images = nuage(container).querySelectorAll("image");
    for (const i of images) {
      expect(Number(i.getAttribute("y"))).not.toBeNaN();
    }
  });

  it("revient à l'échelle pleine dès qu'une matière est haute, et retire la mention", () => {
    // La contre-épreuve du zoom : l'échelle doit se DÉZOOMER toute seule au fil de l'année, sinon
    // on aurait juste remplacé un cadrage figé par un autre.
    const { container } = renderCard([à("svt", 12), à("francais", 80)]);

    expect(graduations(container)).toEqual(["0%", "25%", "50%", "75%", "100%"]);
    expect(nuage(container).textContent).not.toContain("échelle ajustée");
  });

  it("place les pointillés sur les vraies médianes, pas sur des constantes", () => {
    // La verticale valait `0.42 × max` et l'horizontale 35 % en dur — cette dernière sortait du
    // cadre dès que l'échelle zoome, laissant un quadrant annoté sans sa frontière.
    const { container } = renderCard([à("svt", 2, 10), à("maths", 6, 20), à("francais", 10, 90)]);

    const pointillés = [...nuage(container).querySelectorAll("line[stroke-dasharray]")];
    expect(pointillés).toHaveLength(2);

    // La position est vérifiée en FRACTION de la hauteur utile, lue sur les graduations elles-
    // mêmes — et non en pixels calculés à la main. Le retrait du bas dépend du plus gros rayon :
    // une attente en dur se serait mise à échouer au moindre réglage de taille de bulle, sans que
    // la règle testée (« la ligne est sur la médiane ») ait bougé.
    const yDe = (label: string) =>
      Number(
        [...nuage(container).querySelectorAll("text")]
          .find((t) => t.textContent === label)
          ?.getAttribute("y"),
      ) - 3;

    const horizontale = pointillés.find((l) => l.getAttribute("y1") === l.getAttribute("y2"));
    const y0 = yDe("0%");
    const yHaut = yDe("15%");
    const fraction = (y0 - Number(horizontale?.getAttribute("y1"))) / (y0 - yHaut);
    expect(fraction).toBeCloseTo(6 / 15, 2); // médiane des % = 6, échelle à 15
  });

  it("pose les bulles à 0 % AU-DESSUS de l'axe, pas à cheval dessus", () => {
    // Une bulle est centrée sur sa valeur : à 0 %, la moitié du pictogramme passait sous l'axe et
    // chevauchait les libellés. Invisible tant qu'une seule matière était à zéro — c'est devenu le
    // défaut dominant quand quatre sur cinq y sont.
    const { container } = renderCard([à("svt", 0), à("maths", 0)]);

    const axe = Number(
      [...nuage(container).querySelectorAll("line")]
        .find((l) => l.getAttribute("y1") === l.getAttribute("y2") && !l.getAttribute("stroke-dasharray"))
        ?.getAttribute("y1"),
    );
    for (const image of nuage(container).querySelectorAll("image")) {
      const bas = Number(image.getAttribute("y")) + Number(image.getAttribute("height"));
      expect(bas).toBeLessThanOrEqual(axe);
    }
  });

  it("trace les grosses bulles EN PREMIER pour qu'une petite ne disparaisse pas dessous", () => {
    // SVG peint dans l'ordre du document. Sur les données réelles, SVT (68 notions, Ø 48) et
    // Histoire-Géo (34 notions, Ø 38) se recouvrent en bas à gauche : dans l'ordre des matières,
    // la petite passait sous la grosse — invisible ET incliquable.
    const { container } = renderCard([
      subject({ id: 1, slug: "anglais", name: "anglais", notions: { consolidated: 0, fragile: 0, in_progress: 0, total: 24 } }),
      subject({ id: 2, slug: "svt", name: "svt", notions: { consolidated: 0, fragile: 0, in_progress: 0, total: 68 } }),
      subject({ id: 3, slug: "francais", name: "francais", notions: { consolidated: 0, fragile: 0, in_progress: 0, total: 96 } }),
    ]);

    const tailles = [...nuage(container).querySelectorAll("image")].map((i) =>
      Number(i.getAttribute("width")),
    );
    expect(tailles).toEqual([...tailles].sort((a, b) => b - a));
  });

  it("🔴 deux matières aux MÊMES valeurs restent toutes deux visibles", () => {
    // Constaté à l'écran le 2026-08-05 : Histoire-Géo et Anglais, toutes deux à 1 min et 0 %,
    // occupaient le MÊME point au pixel près — la plus petite était entièrement contenue dans la
    // plus grosse, donc invisible ET incliquable. Une matière absente du nuage ne se lit pas
    // « superposée », elle se lit « pas de données ».
    // ⚠️ Une TROISIÈME matière très active pousse les deux autres CONTRE l'axe. C'est ce que ce
    // test ne faisait pas, et c'est pourquoi il est resté vert sur un correctif qui ne marchait
    // pas : le clamp du cadre, appliqué après le désentassement, ramenait les deux bulles au bord
    // et annulait l'écart. Une collision au milieu du graphe ne rencontre jamais ce cas.
    const { container } = renderCard([
      à("svt", 0, 1),
      à("histoire-geo", 0, 1), // exactement les mêmes coordonnées, et collées à l'axe
      à("francais", 0, 400),
    ]);

    // Les deux collées à l'axe sont les deux plus à gauche ; la troisième est loin à droite.
    const toutes = [...nuage(container).querySelectorAll("image")].sort(
      (a, b) => Number(a.getAttribute("x")) - Number(b.getAttribute("x")),
    );
    expect(toutes).toHaveLength(3);
    const images = toutes.slice(0, 2);

    const centre = (i: Element) =>
      Number(i.getAttribute("x")) + Number(i.getAttribute("width")) / 2;
    const rayon = (i: Element) => Number(i.getAttribute("width")) / 2;
    const ecart = Math.abs(centre(images[0]) - centre(images[1]));
    const petite = Math.min(rayon(images[0]), rayon(images[1]));

    // Le critère n'est pas « les centres diffèrent » — un écart d'un pixel laisserait la petite
    // sous la grosse. C'est que la plus petite DÉBORDE de la plus grosse.
    expect(ecart).toBeGreaterThan(petite);
  });

  it("les étiquettes de deux bulles proches ne se superposent pas", () => {
    // Désentasser les bulles ne suffit pas : leurs NOMS restaient l'un sur l'autre, et deux
    // matières illisibles se lisent comme une seule.
    const { container } = renderCard([à("svt", 0, 10), à("histoire-geo", 0, 10)]);

    const etiquettes = [...nuage(container).querySelectorAll("text")].filter((e) =>
      ["svt", "histoire-geo"].includes(e.textContent ?? ""),
    );
    expect(etiquettes).toHaveLength(2);
    expect(Number(etiquettes[0].getAttribute("y"))).not.toBeCloseTo(
      Number(etiquettes[1].getAttribute("y")),
      0,
    );
  });

  it("aucune bulle ne déborde du cadre du graphe", () => {
    // Une matière à 1 minute mordait de 11 px à gauche de l'axe des ordonnées.
    const { container } = renderCard([à("svt", 0, 0), à("francais", 100, 999)]);

    const PAD_L = 44, PAD_R = 18, W = 400;
    for (const im of nuage(container).querySelectorAll("image")) {
      const x = Number(im.getAttribute("x"));
      const w = Number(im.getAttribute("width"));
      expect(x).toBeGreaterThanOrEqual(PAD_L - 0.01);
      expect(x + w).toBeLessThanOrEqual(W - PAD_R + 0.01);
    }
  });

  it("n'affiche pas un pointillé qui se confondrait avec son axe", () => {
    // Médiane à 0 : la ligne tomberait PILE sur l'axe des abscisses et se lirait comme une
    // graduation. Trois matières sur cinq à zéro, c'est le cas réel de début d'année.
    const { container } = renderCard([à("svt", 0), à("maths", 0), à("francais", 4)]);

    const pointillés = [...nuage(container).querySelectorAll("line[stroke-dasharray]")];
    const horizontale = pointillés.find((l) => l.getAttribute("y1") === l.getAttribute("y2"));
    expect(horizontale).toBeUndefined();
  });
});

describe("WhereToActCard — infobulle", () => {
  it("reste chiffrée quelle que soit l'échelle", () => {
    const { container } = renderCard([subject()]);

    const titre = nuage(container).querySelector("title")?.textContent ?? "";
    expect(titre).toContain("SVT");
    expect(titre).toContain("60 min");
    expect(titre).toContain("9 notions");
  });
});
