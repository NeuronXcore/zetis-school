import { describe, expect, it } from "vitest";
import type { GalaxyEdge, GalaxyNode } from "@zetis/types";
import {
  MAX_PARTICLES_PER_LINK,
  PARTICLE_BUDGET,
  dim,
  linkKey,
  litLinkIds,
  particleAllowance,
  particlesFor,
  searchMatches,
  statusCounts,
} from "@zetis/ui/galaxy";

// Une matière → 2 chapitres. Ch.1 a une étoile allumée, Ch.2 n'en a aucune.
const nodes: GalaxyNode[] = [
  { id: "subject-1", kind: "subject", label: "SVT" },
  { id: "chapter-1", kind: "chapter", label: "La cellule", chapter_id: 1 },
  { id: "chapter-2", kind: "chapter", label: "Génétique", chapter_id: 2 },
  { id: "skill-10", kind: "skill", label: "Mitose", skill_id: 10, status: "solid" },
  { id: "skill-11", kind: "skill", label: "ADN", skill_id: 11, status: "unknown" },
  { id: "skill-20", kind: "skill", label: "Gène", skill_id: 20, status: "unknown" },
];
const edges: GalaxyEdge[] = [
  { source: "subject-1", target: "chapter-1", type: "structure" },
  { source: "subject-1", target: "chapter-2", type: "structure" },
  { source: "chapter-1", target: "skill-10", type: "structure" },
  { source: "chapter-1", target: "skill-11", type: "structure" },
  { source: "chapter-2", target: "skill-20", type: "structure" },
];

describe("litLinkIds — l'or suit ce que Massimo a vraiment travaillé", () => {
  const lit = litLinkIds(nodes, edges);

  it("allume le lien vers une étoile travaillée, pas vers une étoile à découvrir", () => {
    expect(lit.has(linkKey("chapter-1", "skill-10"))).toBe(true);
    expect(lit.has(linkKey("chapter-1", "skill-11"))).toBe(false);
  });

  it("remonte jusqu'au cœur : l'or ne flotte jamais détaché", () => {
    // Sans cette règle, le segment doré chapitre→étoile serait isolé au milieu du vide.
    expect(lit.has(linkKey("subject-1", "chapter-1"))).toBe(true);
  });

  it("laisse éteint un amas qui n'a aucune étoile allumée", () => {
    expect(lit.has(linkKey("subject-1", "chapter-2"))).toBe(false);
    expect(lit.has(linkKey("chapter-2", "skill-20"))).toBe(false);
  });

  it("n'allume rien sur une galaxie entièrement à découvrir", () => {
    const eteint = nodes.map((n) =>
      n.kind === "skill" ? { ...n, status: "unknown" as const } : n,
    );
    expect(litLinkIds(eteint, edges).size).toBe(0);
  });
});

describe("litLinkIds — l'or remonte jusqu'au sommet, quelle que soit la profondeur", () => {
  // Graphe GLOBAL : cerveau → matière → chapitre → notion. Un niveau de plus qu'une
  // constellation, et c'est là que la remontée d'un seul cran échouait : les liens du
  // cerveau restaient éteints alors qu'une notion était travaillée (bug constaté).
  const globalNodes: GalaxyNode[] = [
    { id: "root", kind: "root", label: "Ma galaxie" },
    { id: "subject-1", kind: "subject", label: "SVT" },
    { id: "chapter-1", kind: "chapter", label: "La cellule", chapter_id: 1 },
    { id: "skill-1", kind: "skill", label: "Mitose", skill_id: 1, status: "solid" },
    { id: "subject-2", kind: "subject", label: "Anglais" },
    { id: "chapter-2", kind: "chapter", label: "Verbes", chapter_id: 2 },
    { id: "skill-2", kind: "skill", label: "Prétérit", skill_id: 2, status: "unknown" },
  ];
  const globalEdges: GalaxyEdge[] = [
    { source: "root", target: "subject-1", type: "structure" },
    { source: "subject-1", target: "chapter-1", type: "structure" },
    { source: "chapter-1", target: "skill-1", type: "structure" },
    { source: "root", target: "subject-2", type: "structure" },
    { source: "subject-2", target: "chapter-2", type: "structure" },
    { source: "chapter-2", target: "skill-2", type: "structure" },
  ];

  it("allume le nerf cerveau → matière quand la matière contient du travaillé", () => {
    const lit = litLinkIds(globalNodes, globalEdges);
    expect(lit.has(linkKey("root", "subject-1"))).toBe(true);
    expect(lit.has(linkKey("subject-1", "chapter-1"))).toBe(true);
  });

  it("laisse éteinte toute la branche d'une matière encore à découvrir", () => {
    const lit = litLinkIds(globalNodes, globalEdges);
    expect(lit.has(linkKey("root", "subject-2"))).toBe(false);
    expect(lit.has(linkKey("subject-2", "chapter-2"))).toBe(false);
  });
});

describe("particlesFor — prefers-reduced-motion coupe TOUT mouvement", () => {
  it("fait couler des particules sur un lien allumé", () => {
    expect(particlesFor(true, false)).toBeGreaterThan(0);
  });

  it("n'en met aucune sur un lien éteint", () => {
    expect(particlesFor(false, false)).toBe(0);
  });

  it("n'en met aucune sous prefers-reduced-motion, même allumé", () => {
    expect(particlesFor(true, true)).toBe(0);
  });
});

describe("statusCounts — un COMPTE, pas un pourcentage", () => {
  it("compte les étoiles par état et ignore amas et cœur", () => {
    const counts = statusCounts(nodes);
    expect(counts.solid).toBe(1);
    expect(counts.unknown).toBe(2);
    // 3 étoiles au total : ni `subject-1` ni les 2 chapitres ne sont comptés.
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("searchMatches — trouver une notion dans la constellation ouverte", () => {
  it("ignore la casse ET les accents — Massimo tape « elyse », pas « Élysée »", () => {
    const avecAccents = [
      { id: "skill-1", kind: "skill" as const, label: "Épicentre", skill_id: 1 },
      { id: "skill-2", kind: "skill" as const, label: "ONDES sismiques", skill_id: 2 },
    ];
    expect(searchMatches(avecAccents, "epice")).toEqual(new Set(["skill-1"]));
    expect(searchMatches(avecAccents, "ondes")).toEqual(new Set(["skill-2"]));
  });

  it("trouve toutes les correspondances, pas seulement la première", () => {
    const found = searchMatches(
      [
        { id: "skill-1", kind: "skill" as const, label: "Volcan effusif", skill_id: 1 },
        { id: "skill-2", kind: "skill" as const, label: "Volcan explosif", skill_id: 2 },
        { id: "skill-3", kind: "skill" as const, label: "Magma", skill_id: 3 },
      ],
      "volcan",
    );
    expect(found.size).toBe(2);
  });

  it("ne propose ni amas ni cœur de matière — ce ne sont pas des destinations", () => {
    expect(searchMatches(nodes, "svt").size).toBe(0);
    expect(searchMatches(nodes, "cellule").size).toBe(0);
  });

  it("une requête vide ne trouve RIEN — « rien de cherché » n'est pas « tout trouvé »", () => {
    expect(searchMatches(nodes, "").size).toBe(0);
    expect(searchMatches(nodes, "   ").size).toBe(0);
  });
});

describe("dim — atténuer sans jamais virer au rouge", () => {
  it("rapproche du fond sans produire de teinte d'échec", () => {
    for (const source of ["#22d3ee", "#818cf8", "#ffffff", "#e8b93f"]) {
      const out = dim(source, 0.82);
      const n = parseInt(out.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(r > 150 && r > g * 1.6 && r > b * 1.6).toBe(false);
    }
  });

  it("ne touche à rien avec un montant nul, et n'explose pas sur une entrée invalide", () => {
    expect(dim("#22d3ee", 0)).toBe("#22d3ee");
    expect(dim("rgba(0,0,0,0)", 0.5)).toBe("rgba(0,0,0,0)");
  });
});

describe("budget de particules — la garde qui a remplacé le plafond de nœuds", () => {
  // Addendum ADR-0024 §2 : ce qui coûte par image, c'est un objet animé PAR LIEN, pas une
  // sphère posée. On dégrade donc le décor, jamais la progression de Massimo.

  it("une petite galaxie a droit au flux plein", () => {
    expect(particleAllowance(10)).toBe(MAX_PARTICLES_PER_LINK);
  });

  it("le flux s'amincit quand les liens allumés se multiplient", () => {
    const many = particleAllowance(PARTICLE_BUDGET);
    expect(many).toBe(1);
    expect(many).toBeLessThan(particleAllowance(10));
  });

  it("il s'éteint plutôt que de dépasser le budget", () => {
    expect(particleAllowance(PARTICLE_BUDGET * 2)).toBe(0);
  });

  it("le total reste sous le budget, quel que soit le nombre de liens", () => {
    for (const links of [1, 8, 40, 79, 80, 81, 160, 161, 400, 5_000]) {
      expect(links * particleAllowance(links)).toBeLessThanOrEqual(PARTICLE_BUDGET);
    }
  });

  it("l'appareil qui décroche coupe le flux, PAS les étoiles", () => {
    expect(particleAllowance(10, { degraded: true })).toBe(0);
    // Rien ici ne retire un nœud : la garde ne porte que sur les particules.
    expect(particlesFor(true, false, particleAllowance(10, { degraded: true }))).toBe(0);
  });

  it("prefers-reduced-motion coupe tout, budget ou pas", () => {
    expect(particleAllowance(1, { reducedMotion: true })).toBe(0);
  });

  it("une galaxie sans lien allumé n'anime rien", () => {
    expect(particleAllowance(0)).toBe(0);
  });
});
