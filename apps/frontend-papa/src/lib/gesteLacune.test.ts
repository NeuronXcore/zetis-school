import { describe, expect, it } from "vitest";
import type { OpenGap } from "@zetis/types";
import { gesteDe } from "./gesteLacune";

// La règle du geste d'une ligne (ADR-0047 §3), testée SANS monter la page.
//
// 🔴 Ce que ces verrous protègent : **un libellé qui promet un grain doit livrer ce grain.** Tout
// le chantier naît de là — la station ② du Diagnostic écrit « cette notion » et mène à la matière.
// Un test qui vérifierait seulement « il y a un geste » ne verrait pas ce défaut-là.

function gap(overrides: Partial<OpenGap> = {}): OpenGap {
  return {
    skill_id: 7,
    skill_name: "Priorités opératoires",
    subject_slug: "mathematiques",
    subject_name: "Mathématiques",
    severity: "medium",
    status: "open",
    has_active_mission: false,
    ...overrides,
  };
}

describe("l'ordre des conditions", () => {
  it("🔴 `has_active_mission` gagne sur `content_state`, quel qu'il soit", () => {
    // Une notion déjà couverte n'attend AUCUNE décision de contenu. Inverser l'ordre proposerait
    // de produire ce qu'une mission est en train de traiter.
    for (const etat of ["ok", "aucune_lecon", "cours_brouillon"]) {
      const geste = gesteDe(
        gap({ has_active_mission: true, mission_id: 56, content_state: etat, lesson_id: 24 }),
      );
      expect(geste, `content_state=${etat}`).toEqual(
        expect.objectContaining({ kind: "lien", href: "/missions?focus=56" }),
      );
    }
  });
});

describe("chaque état mène où son libellé le promet", () => {
  it("`cours_brouillon` ouvre la leçon EN BROUILLON, pas la matière", () => {
    const geste = gesteDe(gap({ content_state: "cours_brouillon", lesson_id: 24 }));
    expect(geste).toEqual(
      expect.objectContaining({ kind: "lien", href: "/programme?lesson=24" }),
    );
    expect(geste?.libelle).toContain("Valider le cours");
  });

  it("`ok` ouvre la leçon validée, et son geste est de VÉRIFICATION", () => {
    const geste = gesteDe(gap({ content_state: "ok", lesson_id: 48 }));
    expect(geste).toEqual(expect.objectContaining({ href: "/programme?lesson=48" }));
    // Pas « Créer une mission » : la section porte déjà ce bouton, avec une autre portée.
    expect(geste?.libelle).toBe("Relire la leçon →");
  });

  it("🔴 `aucune_lecon` est une ACTION, jamais un lien vers /quiz", () => {
    // `/quiz` pilote les quiz DE FIN DE COURS, « générés depuis le cours validé d'une leçon » —
    // soit exactement ce qui manque ici. Un lien y menant promettrait ce que la page ne peut pas
    // faire : le défaut que ce chantier corrige, reproduit par sa propre correction.
    const geste = gesteDe(gap({ content_state: "aucune_lecon" }));
    expect(geste?.kind).toBe("equiper");
    expect(JSON.stringify(geste)).not.toContain("/quiz");
  });

  it("« Voir la mission » est BLEU, pas vert", () => {
    // Le vert est la couleur des gestes qui font avancer ; celui-ci constate.
    const geste = gesteDe(gap({ has_active_mission: true, mission_id: 56 }));
    expect(geste).toEqual(expect.objectContaining({ ton: "sky" }));
    expect(gesteDe(gap({ content_state: "ok", lesson_id: 1 }))).toEqual(
      expect.objectContaining({ ton: "accent" }),
    );
  });
});

describe("🔴 aucun geste plutôt qu'un geste mort", () => {
  it("un `content_state` INCONNU ne rend aucun geste", () => {
    // Décision 6 : le type est ouvert côté contrat. Un état ajouté au backend tombe ici, et une
    // ligne sans geste vaut mieux qu'un geste qui mène quelque part sans savoir pourquoi.
    expect(gesteDe(gap({ content_state: "etat_du_futur" }))).toBeNull();
    expect(gesteDe(gap({ content_state: null }))).toBeNull();
    expect(gesteDe(gap())).toBeNull();
  });

  it("🔴 `has_active_mission` SANS `mission_id` ne rend rien — jamais `?focus=undefined`", () => {
    // Le serveur garantit que les deux vont ensemble. La page ne le suppose pas : un lien mort est
    // pire qu'une ligne sans geste, et c'est exactement le cas que les décors de test produisent.
    expect(gesteDe(gap({ has_active_mission: true }))).toBeNull();
  });

  it("🔴 `cours_brouillon` et `ok` SANS `lesson_id` ne rendent rien", () => {
    expect(gesteDe(gap({ content_state: "cours_brouillon" }))).toBeNull();
    expect(gesteDe(gap({ content_state: "ok" }))).toBeNull();
  });
});

describe("le motif accompagne toujours le geste", () => {
  it("aucun geste n'est rendu sans sa raison en clair", () => {
    // C'est le motif qui distingue ce geste d'un lien nu — Papa n'a pas à deviner pourquoi
    // celui-là plutôt qu'un autre.
    const cas: OpenGap[] = [
      gap({ has_active_mission: true, mission_id: 1 }),
      gap({ content_state: "cours_brouillon", lesson_id: 2 }),
      gap({ content_state: "aucune_lecon" }),
      gap({ content_state: "ok", lesson_id: 3 }),
    ];
    for (const g of cas) {
      const geste = gesteDe(g);
      expect(geste, JSON.stringify(g)).not.toBeNull();
      expect(geste!.motif.length, JSON.stringify(g)).toBeGreaterThan(20);
    }
  });
});
