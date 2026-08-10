import { describe, expect, it } from "vitest";
import { type AgendaDay, type AgendaItemStudent, type AgendaPlanStep } from "@zetis/types";
import {
  RESUME_MAX,
  bannerItems,
  daysLeftLabel,
  groupPlanByItem,
  isoDay,
  originLabel,
  planStepDayLabel,
  planStepTarget,
  revisionSessionState,
  splitSections,
} from "./agendaSections";

// Mercredi 29 juillet 2026.
const TODAY = new Date(2026, 6, 29);

// ⚠️ Cette fabrique omettait `lesson_id` et `chapter_id` — deux champs REQUIS d'un
// `AgendaItemStudent` — depuis l'addendum §15, sans que rien ne le signale : les tests de
// Massimo sont exclus de `tsconfig.app.json`, donc `tsc -b` reste vert sur des fixtures
// incomplètes. Complétée le 2026-08-10 en ajoutant `revisable_cards` (ADR-0049), qui l'aurait
// cassée pour la troisième fois en silence.
function item(over: Partial<AgendaItemStudent> & { id: number; due_on: string }): AgendaItemStudent {
  return {
    label: `item ${over.id}`,
    subject: null,
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

describe("isoDay", () => {
  it("formate en heure locale (une saisie de 23 h ne recule pas d'un jour)", () => {
    expect(isoDay(new Date(2026, 6, 29, 23, 30))).toBe("2026-07-29");
  });
});

describe("splitSections", () => {
  const items = [
    item({ id: 1, due_on: "2026-07-29" }),
    item({ id: 2, due_on: "2026-07-30" }),
    item({ id: 3, due_on: "2026-08-01" }),
    item({ id: 4, due_on: "2026-07-27" }),
    item({ id: 5, due_on: "2026-07-28", done: true }),
  ];

  it("range aujourd'hui, demain et la suite", () => {
    const sections = splitSections(items, TODAY);
    expect(sections.today.map((i) => i.id)).toEqual([1]);
    expect(sections.tomorrow.map((i) => i.id)).toEqual([2]);
    expect(sections.later.map((i) => i.id)).toEqual([3]);
  });

  it("ne fait pas revenir un item passé DÉJÀ FAIT : il n'y a rien à reprendre", () => {
    expect(splitSections(items, TODAY).resume.map((i) => i.id)).toEqual([4]);
  });

  it("VERROU §17 — ne plafonne PLUS : les plus anciens restent atteignables", () => {
    // Le plafond vivait ici jusqu'au 2026-08-10, et il rendait les plus anciens **hors
    // d'atteinte**, pas seulement invisibles. Il est devenu un plafond d'AFFICHAGE, appliqué par
    // la page et levé par un geste de Massimo.
    //
    // ⚠️ Ce que le §7 interdit reste interdit et se teste AILLEURS (`AgendaPage`) : la section
    // ne s'allonge pas toute seule, et aucun compteur d'arriéré n'est posé à côté du titre.
    const many = Array.from({ length: 10 }, (_, index) =>
      item({ id: 100 + index, due_on: `2026-07-1${index % 10}` }),
    );
    const sections = splitSections(many, TODAY);
    expect(sections.resume.length).toBeGreaterThan(RESUME_MAX);
    expect(sections.resume).toHaveLength(10);
  });

  it("garde les plus récents parmi les items à reprendre", () => {
    const sections = splitSections(
      [
        item({ id: 1, due_on: "2026-07-20" }),
        item({ id: 2, due_on: "2026-07-26" }),
        item({ id: 3, due_on: "2026-07-27" }),
        item({ id: 4, due_on: "2026-07-28" }),
      ],
      TODAY,
    );
    // Plus récent d'abord : ce qu'on vient de manquer se rattrape avant ce qui date de dix jours.
    expect(sections.resume.map((i) => i.id)).toEqual([4, 3, 2, 1]);
  });
});

describe("originLabel", () => {
  it("annonce « ajouté par ZETIS » sur un item que Massimo n'a pas écrit", () => {
    // §16 — le §2a exige que Massimo sache qu'un AUTRE a touché son agenda ; il n'exige pas de
    // le nommer. L'invariant testé est inchangé : un item non écrit par lui PORTE un marqueur.
    expect(originLabel(item({ id: 1, due_on: "2026-07-29" }))).toBe("ajouté par ZETIS");
  });

  it("VERROU §16 — ce marqueur ne nomme jamais l'adulte", () => {
    const parLautre = originLabel(item({ id: 1, due_on: "2026-07-29" }));
    const corrige = originLabel(
      item({ id: 2, due_on: "2026-07-29", created_by: "student", edited_by_parent: true }),
    );
    for (const libelle of [parLautre, corrige]) {
      expect(libelle).not.toMatch(/papa/i);
    }
  });

  it("annonce la CORRECTION en priorité : c'est l'information neuve (§2a)", () => {
    const corrected = item({
      id: 2,
      due_on: "2026-07-29",
      created_by: "student",
      edited_by_parent: true,
    });
    expect(originLabel(corrected)).toBe("complété par ZETIS");
  });

  it("ne dit rien sur un item que Massimo a écrit lui-même", () => {
    expect(originLabel(item({ id: 3, due_on: "2026-07-29", created_by: "student" }))).toBeNull();
  });
});

describe("daysLeftLabel", () => {
  it("parle en jours, jamais en retard", () => {
    expect(daysLeftLabel(0)).toBe("aujourd'hui");
    expect(daysLeftLabel(1)).toBe("demain");
    expect(daysLeftLabel(5)).toBe("dans 5 jours");
    // Une valeur négative n'est pas censée arriver (le serveur borne à partir d'aujourd'hui),
    // et surtout : elle ne produit AUCUN vocabulaire de retard.
    expect(daysLeftLabel(-2)).toBe("aujourd'hui");
  });
});

describe("bannerItems", () => {
  it("prend aujourd'hui puis demain, 3 au maximum", () => {
    const sections = splitSections(
      [
        item({ id: 1, due_on: "2026-07-29" }),
        item({ id: 2, due_on: "2026-07-29" }),
        item({ id: 3, due_on: "2026-07-30" }),
        item({ id: 4, due_on: "2026-07-30" }),
      ],
      TODAY,
    );
    expect(bannerItems(sections).map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// LE DECK CHAPITRE (ADR-0049)
// ─────────────────────────────────────────────────────────────────────────────────────

describe("revisionSessionState — ce que la porte transmet au runner", () => {
  it("compose le deck chapitre depuis l'échéance", () => {
    const state = revisionSessionState(
      item({
        id: 1,
        due_on: "2026-09-10",
        chapter_id: 12,
        label: "La Révolution française",
        subject: { id: 3, name: "Histoire-Géo", slug: "histoire-geo", color: null },
      }),
    );
    expect(state).toEqual({
      deck: { chapter: 12 },
      label: "La Révolution française",
      subjectSlug: "histoire-geo",
    });
  });

  it("VERROU — sans chapitre, aucun deck n'est fabriqué", () => {
    // Rendre un deck ici ouvrirait une session sur un chapitre inventé. `null` force l'appelant
    // à ne pas afficher la porte, ce qui est la Décision 2.
    expect(revisionSessionState(item({ id: 1, due_on: "2026-09-10", chapter_id: null }))).toBeNull();
  });

  it("l'en-tête porte l'intitulé de l'ÉCHÉANCE, faute de nom de chapitre", () => {
    // `AgendaItemStudent` sert `chapter_id`, jamais le nom du chapitre. L'intitulé est ce que
    // Massimo vient de taper : l'en-tête prolonge son geste au lieu d'annoncer un objet qu'il
    // n'a pas vu. Le correctif propre, s'il faut le nom, est un champ serveur — pas une
    // reconstitution côté client.
    const state = revisionSessionState(
      item({ id: 1, due_on: "2026-09-10", chapter_id: 4, label: "Contrôle de jeudi" }),
    );
    expect(state?.label).toBe("Contrôle de jeudi");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// LE PLAN DE PRÉPARATION (ADR-0050) — le grain qu'on atteint, et l'ordre à rebours
// ─────────────────────────────────────────────────────────────────────────────────────

function step(over: Partial<AgendaPlanStep> & { id: number; kind: AgendaPlanStep["kind"] }) {
  return {
    agenda_item_id: 1,
    day_offset: 1,
    skill_id: null,
    resource_id: null,
    done: false,
    ...over,
  } satisfies AgendaPlanStep;
}

const MATHS = { id: 3, name: "Mathématiques", slug: "maths", color: null };

const CONTROLE = item({
  id: 1,
  due_on: "2026-08-14",
  kind: "controle",
  chapter_id: 12,
  label: "Multiplication de fractions",
  subject: MATHS,
});

describe("planStepTarget — le grain réellement atteignable (Décision 2 quater)", () => {
  it("🔴 VERROU — aucune route INVENTÉE : ni `?fiche=`, ni `?quiz=`", () => {
    // C'est LE verrou de la Décision 2 quater. `/fiches?fiche=<id>` et `/quiz?quiz=<id>`
    // n'existent pas : `FichesPage` ne lit aucun `searchParams`, `QuizPage` ne lit que
    // `subject`. Un lien vers ces routes s'ouvrirait sur une page qui IGNORE son paramètre —
    // et aucun test de rendu ne le verrait : le lien existe, il est cliquable, il a l'air de
    // marcher. ⚠️ Saboter en remettant `?fiche=${step.resource_id}` doit ROUGIR ici.
    const fiche = planStepTarget(step({ id: 10, kind: "fiche", resource_id: 77 }), CONTROLE);
    const quiz = planStepTarget(step({ id: 11, kind: "quiz", resource_id: 88 }), CONTROLE);

    expect(fiche.to).toBe("/fiches/maths");
    expect(quiz.to).toBe("/quiz?subject=maths&from=maths");
    // L'identifiant de ressource n'apparaît NULLE PART dans la destination.
    for (const target of [fiche, quiz]) {
      expect(target.to).not.toMatch(/fiche=|quiz=|\d/);
    }
  });

  it("VERROU — le libellé DIT son grain, au pluriel et par son verbe (règle ADR-0047)", () => {
    // « Lire la fiche » promettrait UNE fiche et en ouvrirait une liste ; « Petit quiz »
    // laisserait croire à un quiz préparé pour lui. Le pluriel et le verbe « choisir » portent
    // le grain sans allonger la ligne.
    expect(planStepTarget(step({ id: 10, kind: "fiche" }), CONTROLE).label).toBe("Lire les fiches");
    expect(planStepTarget(step({ id: 11, kind: "quiz" }), CONTROLE).label).toBe("Choisir un quiz");
  });

  it("🔴 VERROU — le libellé ne RÉPÈTE PAS la matière : mesuré, elle se coupait", () => {
    // Mesuré dans le DOM le 2026-08-10 : « Lire les fiches de Mathématiques » = 193 px pour
    // 151 disponibles sur une carte de téléphone (202 px avec « Physique-Chimie »). Ce qui se
    // coupait, c'était LE NOM DE LA MATIÈRE — l'information même que l'allongement portait. Et
    // elle est déjà sur la carte, deux lignes plus haut.
    // ⚠️ Saboter en remettant `de ${subject.name}` doit ROUGIR.
    for (const kind of ["fiche", "revision", "quiz"] as const) {
      expect(planStepTarget(step({ id: 1, kind }), CONTROLE).label).not.toContain("Mathématiques");
    }
  });

  it("le libellé ne dépend pas de la présence d'une matière", () => {
    // Corollaire du verrou ci-dessus : plus de branche « avec / sans matière » sur le TEXTE.
    // Seule la destination en dépend. Une seule chaîne à traduire, un cas de moins à tenir.
    const sansMatiere = item({ id: 9, due_on: "2026-08-14", chapter_id: 12, subject: null });
    for (const kind of ["fiche", "revision", "quiz"] as const) {
      expect(planStepTarget(step({ id: 1, kind }), sansMatiere).label).toBe(
        planStepTarget(step({ id: 1, kind }), CONTROLE).label,
      );
    }
  });

  it("la révision garde le grain FIN, parce que sa destination l'a vraiment", () => {
    // Seule des trois à être adressable au chapitre : c'est le deck de l'ADR-0049.
    const cible = planStepTarget(step({ id: 12, kind: "revision" }), CONTROLE);
    expect(cible.label).toBe("Réviser ce chapitre");
    expect(cible.to).toBe("/revision/session");
    expect(cible.state).toEqual({
      deck: { chapter: 12 },
      label: "Multiplication de fractions",
      subjectSlug: "maths",
    });
  });

  it("VERROU — sans matière, l'étape n'a AUCUN lien (et jamais un lien vers la racine)", () => {
    // Même discipline que `agendaCourseRoute` : un lien qui déposerait Massimo au hasard est
    // pire que pas de lien. L'étape reste rendue — c'est sa COCHE qui la fait exister.
    const sansMatiere = item({ id: 2, due_on: "2026-08-14", chapter_id: 12, subject: null });
    expect(planStepTarget(step({ id: 10, kind: "fiche" }), sansMatiere).to).toBeNull();
    expect(planStepTarget(step({ id: 11, kind: "quiz" }), sansMatiere).to).toBeNull();
  });

  it("VERROU — sans chapitre, la révision n'ouvre rien", () => {
    const sansChapitre = item({ id: 3, due_on: "2026-08-14", chapter_id: null, subject: MATHS });
    const cible = planStepTarget(step({ id: 12, kind: "revision" }), sansChapitre);
    expect(cible.to).toBeNull();
    expect(cible.state).toBeUndefined();
  });

  it("l'icône de la fiche ne se confond pas avec celle du cours", () => {
    // 📖 est déjà la puce « lire le cours », deux lignes plus haut sur la MÊME carte. La
    // maquette du cadrage portait 📖 ; elle n'avait pas la puce sous les yeux.
    //
    // ⚠️ On assert l'ÉGALITÉ, pas seulement la différence : `not.toBe("📖")` passerait sur une
    // icône vide, ou sur `undefined`. Une assertion de non-égalité n'est pas un verrou.
    expect(planStepTarget(step({ id: 10, kind: "fiche" }), CONTROLE).icon).toBe("🗒️");
    // Et les trois types restent distincts entre eux — sinon le plan devient illisible.
    const icones = (["fiche", "revision", "quiz"] as const).map(
      (kind) => planStepTarget(step({ id: 1, kind }), CONTROLE).icon,
    );
    expect(new Set(icones).size).toBe(3);
  });
});

describe("planStepDayLabel — l'offset se lit à rebours", () => {
  it("`day_offset = 1` est LA VEILLE de l'échéance", () => {
    // Vendredi 14 août 2026 ⇒ la veille est le jeudi 13.
    expect(planStepDayLabel(CONTROLE, step({ id: 10, kind: "fiche", day_offset: 1 }))).toBe(
      "jeu. 13",
    );
  });

  it("VERROU — un offset plus GRAND est un jour plus TÔT", () => {
    // Le sens du décompte est le piège de tout ce chantier : `3` n'est pas « dans 3 jours ».
    expect(planStepDayLabel(CONTROLE, step({ id: 11, kind: "quiz", day_offset: 3 }))).toBe(
      "mar. 11",
    );
  });

  it("VERROU — jamais le jour de l'échéance", () => {
    // Le serveur ne compose jamais d'étape à l'offset 0 (Décision 3) ; si cette règle cassait,
    // ce libellé le dirait. Un plan qui demande de réviser le matin du contrôle est une source
    // d'angoisse, pas une aide.
    const veille = planStepDayLabel(CONTROLE, step({ id: 10, kind: "fiche", day_offset: 1 }));
    expect(veille).not.toBe("ven. 14");
  });
});

describe("groupPlanByItem — le plan se lit sous ce qu'il prépare", () => {
  function day(date: string, offset: number, plan_steps: AgendaPlanStep[]): AgendaDay {
    return { date, offset, traces: null, fixed_items: [], plan_steps };
  }

  it("regroupe par ÉCHÉANCE, pas par jour", () => {
    // Une semaine à DEUX contrôles : sans ce regroupement, les étapes flottent sous les jours
    // sans dire de quel chapitre elles parlent.
    const groupes = groupPlanByItem([
      day("2026-08-11", 1, [
        step({ id: 1, kind: "fiche", agenda_item_id: 10, day_offset: 3 }),
        step({ id: 2, kind: "revision", agenda_item_id: 20, day_offset: 2 }),
      ]),
      day("2026-08-12", 2, [step({ id: 3, kind: "quiz", agenda_item_id: 10, day_offset: 2 })]),
    ]);
    expect(Object.keys(groupes).sort()).toEqual(["10", "20"]);
    expect(groupes[10].map((s) => s.id)).toEqual([1, 3]);
    expect(groupes[20].map((s) => s.id)).toEqual([2]);
  });

  it("🔴 VERROU — l'ordre servi est du plus TÔT au plus tard (offset DÉCROISSANT)", () => {
    // L'offset compte les jours AVANT l'échéance : le plus GRAND est le plus TÔT. Trier
    // croissant présenterait le plan à l'envers — « petit quiz » avant « lire les fiches » —
    // et rien ne le signalerait à l'écran : les trois étapes seraient bien là.
    // ⚠️ Saboter en `a.day_offset - b.day_offset` doit ROUGIR.
    const groupes = groupPlanByItem([
      day("2026-08-13", 3, [step({ id: 3, kind: "quiz", day_offset: 1 })]),
      day("2026-08-11", 1, [step({ id: 1, kind: "fiche", day_offset: 3 })]),
      day("2026-08-12", 2, [step({ id: 2, kind: "revision", day_offset: 2 })]),
    ]);
    expect(groupes[1].map((s) => s.kind)).toEqual(["fiche", "revision", "quiz"]);
  });

  it("deux étapes le MÊME jour restent départagées par leur id", () => {
    // Cas réel d'un plan à 2 étapes sur 2 jours restants : le serveur les pose au même offset.
    const groupes = groupPlanByItem([
      day("2026-08-13", 1, [
        step({ id: 9, kind: "quiz", day_offset: 1 }),
        step({ id: 4, kind: "revision", day_offset: 1 }),
      ]),
    ]);
    expect(groupes[1].map((s) => s.id)).toEqual([4, 9]);
  });

  it("aucun jour à étapes ⇒ un objet VIDE, jamais des clés à liste vide", () => {
    // Une clé présente avec `[]` ferait rendre un encadré « Ton plan » vide sur l'échéance.
    expect(groupPlanByItem([day("2026-08-11", 1, [])])).toEqual({});
  });
});
